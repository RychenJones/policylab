const HOUSEHOLD_COUNT = 5000;

const EXAMPLE_VALUES = {
  baseGasPct: 88.592,
  baseEvPct: 1.808,
  baseNoCarPct: 10,
  gasTax: 1,
  evRebate: 7500,
  transitFare: 1.75
};

const form = document.querySelector('#simulation-form');
const runButton = document.querySelector('#run-button');
const errorMessage = document.querySelector('#form-error');
const resultStatus = document.querySelector('#result-status');
const numberFormatter = new Intl.NumberFormat('en-US');

const chart = new Chart(document.querySelector('#behavior-chart'), {
  type: 'bar',
  data: {
    labels: ['Gas vehicle', 'EV', 'No car'],
    datasets: [
      { label: 'Starting population', data: [0, 0, 0], backgroundColor: '#9bb9d1', borderRadius: 6, maxBarThickness: 46 },
      { label: 'Policy result', data: [0, 0, 0], backgroundColor: '#2b7967', borderRadius: 6, maxBarThickness: 46 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => `${value}%` }, grid: { color: '#e7ece8' } }, x: { grid: { display: false } } },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 20 } },
      tooltip: { callbacks: { label(context) { const percent = context.raw; return `${context.dataset.label}: ${percent.toFixed(3)}% (${numberFormatter.format(Math.round(percent / 100 * HOUSEHOLD_COUNT))} households)`; } } }
    }
  }
});

function readValues() {
  return {
    baseGasPct: Number(document.querySelector('#base-gas').value),
    baseEvPct: Number(document.querySelector('#base-ev').value),
    baseNoCarPct: Number(document.querySelector('#base-no-car').value),
    gasTax: Number(document.querySelector('#gas-tax').value),
    evRebate: Number(document.querySelector('#ev-rebate').value),
    transitFare: Number(document.querySelector('#transit-fare').value)
  };
}

function validateValues(values) {
  const baselineTotal = values.baseGasPct + values.baseEvPct + values.baseNoCarPct;
  if (![values.baseGasPct, values.baseEvPct, values.baseNoCarPct].every(Number.isFinite)) return 'Enter all three starting percentages.';
  if (Math.abs(baselineTotal - 100) > 0.001) return `Starting percentages must total 100%. Current total: ${baselineTotal.toFixed(3)}%.`;
  if (values.gasTax < 0 || values.gasTax > 10 || !Number.isFinite(values.gasTax)) return 'Gas tax must be between $0 and $10 per gallon.';
  if (values.evRebate < 0 || values.evRebate > 20000 || !Number.isFinite(values.evRebate)) return 'EV rebate must be between $0 and $20,000.';
  if (values.transitFare < 0 || values.transitFare > 15 || !Number.isFinite(values.transitFare)) return 'Transit fare must be between $0 and $15 per ride.';
  return '';
}

function buildBackendRequest(values) {
  return {
    baseGasShare: values.baseGasPct * 0.01,
    baseEvShare: values.baseEvPct * 0.01,
    baseNoCarShare: values.baseNoCarPct * 0.01,
    gasTax: values.gasTax,
    evRebate: values.evRebate,
    transitFare: values.transitFare
  };
}

// Temporary preview adapter. Replace only this function with the API call.
// It receives fractions for baseline shares because that is the backend format.
async function requestSimulation(request) {
  await new Promise((resolve) => setTimeout(resolve, 450));
  const taxEffect = request.gasTax * 2.2;
  const rebateEffect = request.evRebate / 20000 * 13;
  const fareEffect = (1 - request.transitFare / 15) * 2;
  const evPct = Math.min(75, request.baseEvShare * 100 + taxEffect + rebateEffect);
  const noCarPct = Math.min(45, request.baseNoCarShare * 100 + fareEffect + request.gasTax * 0.5);
  return { gasPct: 100 - evPct - noCarPct, evPct, noCarPct };
}

function setTotalStatus(values) {
  const total = values.baseGasPct + values.baseEvPct + values.baseNoCarPct;
  const status = document.querySelector('#baseline-total');
  status.textContent = `Total: ${total.toFixed(3)}%`;
  status.classList.toggle('invalid', Math.abs(total - 100) > 0.001);
}

function signedPoints(value) { return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} pp`; }
function signedHouseholds(value) { return `${value >= 0 ? '+' : '−'}${numberFormatter.format(Math.abs(Math.round(value / 100 * HOUSEHOLD_COUNT)))} households`; }

function renderResults(values, result) {
  const baseline = [values.baseGasPct, values.baseEvPct, values.baseNoCarPct];
  const policy = [result.gasPct, result.evPct, result.noCarPct];
  const labels = ['Gas vehicle', 'EV', 'No car'];
  const changes = policy.map((value, index) => value - baseline[index]);
  const largestIndex = changes.reduce((best, value, index) => Math.abs(value) > Math.abs(changes[best]) ? index : best, 0);
  const largest = changes[largestIndex];
  const direction = largest < 0 ? 'decreased' : 'increased';

  chart.data.datasets[0].data = baseline;
  chart.data.datasets[1].data = policy;
  chart.update();
  document.querySelector('#headline-title').textContent = `${labels[largestIndex]} use ${direction}`;
  document.querySelector('#headline-detail').textContent = `${signedPoints(largest)} · ${signedHouseholds(largest)} compared with the starting population.`;
  document.querySelector('#gas-change').textContent = signedPoints(changes[0]);
  document.querySelector('#ev-change').textContent = signedPoints(changes[1]);
  document.querySelector('#no-car-change').textContent = signedPoints(changes[2]);
  document.querySelector('#gas-count').textContent = signedHouseholds(changes[0]);
  document.querySelector('#ev-count').textContent = signedHouseholds(changes[1]);
  document.querySelector('#no-car-count').textContent = signedHouseholds(changes[2]);
  resultStatus.textContent = 'Preview result · API not connected';
}

function setFormValues(values) {
  document.querySelector('#base-gas').value = values.baseGasPct;
  document.querySelector('#base-ev').value = values.baseEvPct;
  document.querySelector('#base-no-car').value = values.baseNoCarPct;
  document.querySelector('#gas-tax').value = values.gasTax;
  document.querySelector('#ev-rebate').value = values.evRebate;
  document.querySelector('#transit-fare').value = values.transitFare;
  setTotalStatus(values);
}

['#base-gas', '#base-ev', '#base-no-car'].forEach((selector) => document.querySelector(selector).addEventListener('input', () => setTotalStatus(readValues())));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = readValues();
  const validationError = validateValues(values);
  errorMessage.hidden = !validationError;
  errorMessage.textContent = validationError;
  if (validationError) return;
  runButton.disabled = true;
  runButton.querySelector('span').textContent = 'Running…';
  resultStatus.textContent = 'Running preview…';
  try {
    const result = await requestSimulation(buildBackendRequest(values));
    renderResults(values, result);
  } catch {
    errorMessage.hidden = false;
    errorMessage.textContent = 'The simulation could not be completed. Please try again.';
    resultStatus.textContent = 'Simulation failed';
  } finally {
    runButton.disabled = false;
    runButton.querySelector('span').textContent = 'Run simulation';
  }
});

document.querySelector('#reset-button').addEventListener('click', () => {
  setFormValues(EXAMPLE_VALUES);
  errorMessage.hidden = true;
  renderResults(EXAMPLE_VALUES, { gasPct: 72.4, evPct: 18.1, noCarPct: 9.5 });
});

setFormValues(EXAMPLE_VALUES);
renderResults(EXAMPLE_VALUES, { gasPct: 72.4, evPct: 18.1, noCarPct: 9.5 });
