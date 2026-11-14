import { ApiError, getConfig, requestSimulation as sendSimulation, sanitizeRequest } from './api.js';

const HOUSEHOLD_COUNT = 5000; // Display scale only; not individually simulated households.
const form = document.querySelector('#simulation-form');
const runButton = document.querySelector('#run-button');
const errorMessage = document.querySelector('#form-error');
const resultStatus = document.querySelector('#result-status');
const numberFormatter = new Intl.NumberFormat('en-US');
const controls = {
  baseGasShare: document.querySelector('#base-gas'), baseEvShare: document.querySelector('#base-ev'),
  baseNoCarShare: document.querySelector('#base-no-car'), gasTax: document.querySelector('#gas-tax'),
  evRebate: document.querySelector('#ev-rebate'), transitFare: document.querySelector('#transit-fare')
};
let defaults, simulatedYears, activeRequest, lastResult;
let requestId = 0;
const chart = typeof globalThis.Chart === 'function' ? new globalThis.Chart(document.querySelector('#behavior-chart'), {
  type: 'bar',
  data: { labels: ['Gas vehicle', 'EV', 'No car'], datasets: [
    { label: 'Starting population', data: [0, 0, 0], backgroundColor: '#9bb9d1', borderRadius: 6, maxBarThickness: 46 },
    { label: 'Policy result', data: [0, 0, 0], backgroundColor: '#2b7967', borderRadius: 6, maxBarThickness: 46 }
  ] },
  options: { responsive: true, maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => `${value}%` } } },
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: {
      label: context => `${context.dataset.label}: ${context.raw.toFixed(3)}% (about ${numberFormatter.format(Math.round(context.raw / 100 * HOUSEHOLD_COUNT))} household equivalents)`
    } } }
  }
}) : null;
if (!chart) document.querySelector('.chart-wrap').hidden = true;

function readValues() {
  return {
    baseGasPct: controls.baseGasShare.valueAsNumber, baseEvPct: controls.baseEvShare.valueAsNumber,
    baseNoCarPct: controls.baseNoCarShare.valueAsNumber, gasTax: controls.gasTax.valueAsNumber,
    evRebate: controls.evRebate.valueAsNumber, transitFare: controls.transitFare.valueAsNumber
  };
}

function buildBackendRequest(values) {
  return { baseGasShare: values.baseGasPct / 100, baseEvShare: values.baseEvPct / 100,
    baseNoCarShare: values.baseNoCarPct / 100, gasTax: values.gasTax, evRebate: values.evRebate, transitFare: values.transitFare };
}

// The merged frontend's integration seam now always calls the real HTTP client.
export async function requestSimulation(request, options) { return sendSimulation(request, options); }

function clearErrors() {
  errorMessage.hidden = true; errorMessage.textContent = '';
  for (const input of Object.values(controls)) { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); }
}

function showError(error) {
  const messages = [];
  for (const [key, values] of Object.entries(error.fieldErrors ?? {})) {
    if (Object.hasOwn(controls, key)) {
      controls[key].setCustomValidity(values.join(' ')); controls[key].setAttribute('aria-invalid', 'true');
      messages.push(`${controls[key].labels[0].textContent}: ${values.join(' ')}`);
    }
  }
  errorMessage.textContent = [error.message, error.formError, ...messages].filter(Boolean).join(' ');
  errorMessage.hidden = false;
}

function setTotalStatus(values) {
  const total = values.baseGasPct + values.baseEvPct + values.baseNoCarPct;
  const status = document.querySelector('#baseline-total');
  status.textContent = Number.isFinite(total) ? `Total: ${total.toFixed(3)}%` : 'Enter all three starting percentages.';
  status.classList.toggle('invalid', !Number.isFinite(total) || Math.abs(total - 100) > 1e-6);
}

function signedPoints(value) { return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} pp`; }
function signedHouseholds(value) { return `${value >= 0 ? '+' : '−'}${numberFormatter.format(Math.abs(Math.round(value / 100 * HOUSEHOLD_COUNT)))} household equivalents`; }

function renderResults(values, result) {
  lastResult = result;
  const baseline = [values.baseGasPct, values.baseEvPct, values.baseNoCarPct];
  const policy = [result.gasPct, result.evPct, result.noCarPct];
  const labels = ['Gas vehicle', 'EV', 'No car'];
  const changes = policy.map((value, index) => value - baseline[index]);
  const largestIndex = changes.reduce((best, value, index) => Math.abs(value) > Math.abs(changes[best]) ? index : best, 0);
  const largest = changes[largestIndex];
  if (chart) { chart.data.datasets[0].data = baseline; chart.data.datasets[1].data = policy; chart.update(); }
  document.querySelector('#headline-title').textContent = Math.abs(largest) < 1e-8 ? 'No change in transportation mix' : `${labels[largestIndex]} share ${largest < 0 ? 'decreased' : 'increased'}`;
  document.querySelector('#headline-detail').textContent = `${signedPoints(largest)} · ${signedHouseholds(largest)} compared with the starting mix.`;
  ['gas', 'ev', 'no-car'].forEach((key, index) => {
    document.querySelector(`#${key}-change`).textContent = signedPoints(changes[index]);
    document.querySelector(`#${key}-count`).textContent = signedHouseholds(changes[index]);
  });
  const rows = labels.map((label, index) => {
    const row = document.createElement('tr');
    for (const text of [label, `${baseline[index].toFixed(3)}%`, `${policy[index].toFixed(3)}%`]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    return row;
  });
  document.querySelector('#results-table-body').replaceChildren(...rows);
  document.querySelector('#result-inputs').textContent = `Results for starting shares ${baseline.map(value => value.toFixed(3)).join(' / ')}%; gas tax +$${values.gasTax}/gallon; rebate $${values.evRebate}; fare $${values.transitFare}/ride.`;
  document.querySelectorAll('[data-results]').forEach(element => { element.hidden = false; });
  resultStatus.textContent = `Simulation complete · ${simulatedYears}-year estimate`;
}

function setFormValues(request) {
  for (const [field, input] of Object.entries(controls)) input.value = field.startsWith('base') ? Number((request[field] * 100).toFixed(3)) : request[field];
  setTotalStatus(readValues());
}

function stopRequest() { requestId++; activeRequest?.abort(); activeRequest = undefined; }
function ready() { runButton.disabled = !defaults; runButton.querySelector('span').textContent = 'Run simulation'; }

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!defaults || activeRequest) return;
  clearErrors();
  const values = readValues();
  let request;
  try { request = sanitizeRequest(buildBackendRequest(values)); }
  catch (error) { showError(error); return; }
  stopRequest();
  const id = requestId;
  activeRequest = new AbortController();
  runButton.disabled = true; runButton.querySelector('span').textContent = 'Running…';
  resultStatus.textContent = lastResult ? 'Running simulation… Previous result remains below.' : 'Running simulation…';
  try {
    const result = await requestSimulation(request, { signal: activeRequest.signal });
    if (id === requestId) renderResults(values, result);
  } catch (error) {
    if (id !== requestId) return;
    if (error instanceof ApiError && error.code === 'cancelled') return;
    if (!(error instanceof ApiError)) console.error(error);
    showError(error instanceof ApiError ? error : new Error('The simulation could not be completed.'));
    resultStatus.textContent = lastResult ? 'Simulation failed · Showing previous result' : 'Simulation failed';
  } finally { if (id === requestId) { activeRequest = undefined; ready(); } }
});

document.querySelector('#reset-button').addEventListener('click', () => {
  stopRequest(); clearErrors(); lastResult = undefined;
  if (defaults) setFormValues(defaults);
  document.querySelectorAll('[data-results]').forEach(element => { element.hidden = true; });
  resultStatus.textContent = defaults ? 'Ready · Run a scenario to see results' : 'Connect to the backend to load defaults';
  ready();
});
for (const input of Object.values(controls)) input.addEventListener('input', () => {
  clearErrors(); setTotalStatus(readValues());
  if (lastResult && !activeRequest) resultStatus.textContent = 'Inputs changed · Run again to update the displayed result';
});
window.addEventListener('pagehide', stopRequest);
window.addEventListener('pageshow', event => { if (event.persisted) { ready(); resultStatus.textContent = 'Ready · Run a scenario to see results'; } });

async function initialize() {
  const retry = document.querySelector('#retry-connection');
  retry.hidden = true; retry.disabled = true;
  clearErrors();
  try {
    const config = await getConfig(); defaults = config.defaults; simulatedYears = config.simulatedYears;
    for (const [field, input] of Object.entries(controls)) {
      const factor = field.startsWith('base') ? 100 : 1;
      input.min = config.inputs[field].min * factor; input.max = config.inputs[field].max * factor;
    }
    setFormValues(defaults); resultStatus.textContent = 'Ready · Run a scenario to see results';
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error);
    showError(error instanceof ApiError ? error : new Error('Could not load API configuration.'));
    resultStatus.textContent = 'Backend connection unavailable'; retry.hidden = false;
  } finally { retry.disabled = false; ready(); }
}
document.querySelector('#retry-connection').addEventListener('click', initialize);
initialize();
