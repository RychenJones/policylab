import { ApiError, getConfig, requestSimulation as sendSimulation, sanitizeRequest } from './api.js';

const HOUSEHOLD_COUNT = 5000; // Display scale only; not individually simulated households.
const form = document.querySelector('#simulation-form');
const runButton = document.querySelector('#run-button');
const errorMessage = document.querySelector('#form-error');
const resultStatus = document.querySelector('#result-status');
const resultsPanel = document.querySelector('#results-panel');
const resultsContent = document.querySelector('#results-content');
const emptyState = document.querySelector('#empty-state');
const loadingState = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const errorStateDetail = document.querySelector('#error-state-detail');
const downloadChartButton = document.querySelector('#download-chart');
const retryButton = document.querySelector('#retry-button');
const retryConnection = document.querySelector('#retry-connection');
const numberFormatter = new Intl.NumberFormat('en-US');
const controls = {
  baseGasShare: document.querySelector('#base-gas'), baseEvShare: document.querySelector('#base-ev'),
  baseNoCarShare: document.querySelector('#base-no-car'), gasTax: document.querySelector('#gas-tax'),
  evRebate: document.querySelector('#ev-rebate'), transitFare: document.querySelector('#transit-fare'),
  simulatedYears: document.querySelector('#simulated-years')
};
let defaults, activeRequest, lastResult;
let initializing = false;
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
      label: context => `${context.dataset.label}: ${context.raw.toFixed(3)}% (about ${numberFormatter.format(Math.round(context.raw / 100 * HOUSEHOLD_COUNT))} households)`
    } } }
  }
}) : null;
if (!chart) document.querySelector('.chart-wrap').hidden = true;

function setResultState(state, detail = '') {
  resultsPanel.dataset.state = state;
  resultsPanel.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  emptyState.hidden = state !== 'empty';
  loadingState.hidden = state !== 'loading';
  errorState.hidden = state !== 'error';
  resultsContent.hidden = !(state === 'success' || (lastResult && (state === 'loading' || state === 'error')));
  errorStateDetail.textContent = detail;
}

function readValues() {
  return {
    baseGasPct: controls.baseGasShare.valueAsNumber, baseEvPct: controls.baseEvShare.valueAsNumber,
    baseNoCarPct: controls.baseNoCarShare.valueAsNumber, gasTax: controls.gasTax.valueAsNumber,
    evRebate: controls.evRebate.valueAsNumber, transitFare: controls.transitFare.valueAsNumber,
    simulatedYears: controls.simulatedYears.valueAsNumber
  };
}

function buildBackendRequest(values) {
  return { baseGasShare: values.baseGasPct / 100, baseEvShare: values.baseEvPct / 100,
    baseNoCarShare: values.baseNoCarPct / 100, gasTax: values.gasTax, evRebate: values.evRebate,
    transitFare: values.transitFare, simulatedYears: values.simulatedYears };
}

// The merged frontend's integration seam now always calls the real HTTP client.
export async function requestSimulation(request, options) { return sendSimulation(request, options); }

function clearErrors() {
  errorMessage.hidden = true; errorMessage.textContent = '';
  for (const input of Object.values(controls)) { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); }
}

function showError(error) {
  const messages = [];
  for (const key of Object.keys(error.fieldErrors ?? {})) {
    if (Object.hasOwn(controls, key)) {
      const input = controls[key];
      const label = input.labels[0].textContent.trim();
      const value = input.valueAsNumber;
      let message;
      if (input.value.trim() === '' || !Number.isFinite(value)) message = `Enter a number for ${label.toLowerCase()}.`;
      else if (key.startsWith('base')) message = `${label} must be between ${input.min}% and ${input.max}%.`;
      else message = `${label} must be between $${numberFormatter.format(Number(input.min))} and $${numberFormatter.format(Number(input.max))}.`;
      input.setCustomValidity(message); input.setAttribute('aria-invalid', 'true');
      messages.push(message);
    }
  }
  const values = readValues();
  const total = values.baseGasPct + values.baseEvPct + values.baseNoCarPct;
  if (error.formError && Number.isFinite(total) && Math.abs(total - 100) > 1e-6)
    messages.push('The starting percentages must add up to 100%.');
  let summary = 'Something went wrong. Please try again.';
  if (error instanceof ApiError) {
    if (error.code === 'network_error') summary = "We couldn't reach the simulator. Check your connection and try again.";
    else if (error.code === 'invalid_response') summary = "We couldn't read the simulation results. Please try again.";
    else if (error.status === 400) summary = messages.length ? 'Please check your entries.' : "We couldn't use those values. Please check your entries and try again.";
    else if (error.status === 429) summary = 'The simulator is busy. Please wait a moment and try again.';
    else summary = "We couldn't complete the simulation. Please try again.";
  }
  errorMessage.textContent = [summary, ...messages].join(' ');
  errorMessage.hidden = false;
  return errorMessage.textContent;
}

function setTotalStatus(values) {
  const total = values.baseGasPct + values.baseEvPct + values.baseNoCarPct;
  const status = document.querySelector('#baseline-total');
  status.textContent = Number.isFinite(total) ? `Total: ${total.toFixed(3)}%` : 'Enter all three starting percentages.';
  status.classList.toggle('invalid', !Number.isFinite(total) || Math.abs(total - 100) > 1e-6);
}

function signedPoints(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)} pp`;
}
function signedHouseholds(value) {
  const rounded = Math.round(value / 100 * HOUSEHOLD_COUNT);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${numberFormatter.format(Math.abs(rounded))} estimated households`;
}

function renderResults(values, result) {
  lastResult = { values, result };
  const baseline = [values.baseGasPct, values.baseEvPct, values.baseNoCarPct];
  const policy = [result.gasPct, result.evPct, result.noCarPct];
  const labels = ['Gas vehicle', 'EV', 'No car'];
  const changes = policy.map((value, index) => value - baseline[index]);
  const largestIndex = changes.reduce((best, value, index) => Math.abs(value) > Math.abs(changes[best]) ? index : best, 0);
  const largest = changes[largestIndex];
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
  document.querySelector('#result-inputs').textContent = `Starting population: gas ${baseline[0].toFixed(3)}%, EV ${baseline[1].toFixed(3)}%, no car ${baseline[2].toFixed(3)}%. Policy: gas tax +$${values.gasTax}/gallon; EV rebate $${numberFormatter.format(values.evRebate)}; transit fare $${values.transitFare}/ride.`;
  setResultState('success');
  // Chart.js must measure the visible results container, including after reset.
  if (chart) {
    chart.data.datasets[0].data = baseline; chart.data.datasets[1].data = policy;
    chart.resize(); chart.update();
  }
  downloadChartButton.disabled = !chart;
  resultStatus.textContent = `Simulation complete · ${values.simulatedYears}-year estimate`;
}

function setFormValues(request) {
  for (const [field, input] of Object.entries(controls)) {
    if (request[field] === undefined) { input.value = ''; continue; }
    input.value = field.startsWith('base') ? Number((request[field] * 100).toFixed(3)) : request[field];
  }
  setTotalStatus(readValues());
}

function stopRequest() { requestId++; activeRequest?.abort(); activeRequest = undefined; }
function ready() {
  runButton.disabled = !defaults || initializing || Boolean(activeRequest);
  retryButton.disabled = initializing || Boolean(activeRequest);
  runButton.querySelector('span').textContent = activeRequest ? 'Running…' : 'Run simulation';
}

function resultSummary() {
  if (!lastResult) return 'Ready · Run a scenario to see results';
  const current = readValues();
  return Object.keys(lastResult.values).some(key => current[key] !== lastResult.values[key])
    ? 'Inputs changed · Run again to update the displayed result' : `Simulation complete · ${lastResult.values.simulatedYears}-year estimate`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!defaults || initializing || activeRequest) return;
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
  setResultState('loading');
  try {
    const result = await requestSimulation(request, { signal: activeRequest.signal });
    if (id === requestId) renderResults(values, result);
  } catch (error) {
    if (id !== requestId) return;
    if (error instanceof ApiError && error.code === 'cancelled') {
      setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary(); return;
    }
    if (!(error instanceof ApiError)) console.error(error);
    const detail = showError(error);
    resultStatus.textContent = lastResult ? 'Simulation failed · Showing previous result' : 'Simulation failed';
    setResultState('error', detail);
  } finally { if (id === requestId) { activeRequest = undefined; ready(); } }
});

document.querySelector('#reset-button').addEventListener('click', () => {
  stopRequest(); clearErrors(); lastResult = undefined;
  if (defaults) setFormValues(defaults);
  setResultState('empty');
  resultStatus.textContent = defaults ? 'Ready · Run a scenario to see results' : 'The simulator is not ready yet. Please try again.';
  if (!defaults && !initializing) setResultState('error', "We couldn't load the simulator. Please try again.");
  downloadChartButton.disabled = true;
  ready();
});
for (const input of Object.values(controls)) {
  input.setAttribute('aria-describedby', 'form-error');
  input.addEventListener('input', () => {
    clearErrors(); setTotalStatus(readValues());
    if (!activeRequest && defaults) {
      setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary();
    }
  });
}
window.addEventListener('pagehide', stopRequest);
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  ready();
  if (!defaults && !initializing) { initialize(); return; }
  setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary();
  if (chart && lastResult) { chart.resize(); chart.update(); }
});

async function initialize() {
  if (initializing) return;
  initializing = true;
  retryConnection.hidden = true; retryConnection.disabled = true;
  ready(); resultStatus.textContent = 'Getting the simulator ready…';
  clearErrors();
  try {
    const config = await getConfig(); defaults = config.defaults;
    for (const [field, input] of Object.entries(controls)) {
      const factor = field.startsWith('base') ? 100 : 1;
      input.min = config.inputs[field].min * factor; input.max = config.inputs[field].max * factor;
      input.step = config.inputs[field].step;
    }
    setFormValues(defaults); setResultState(lastResult ? 'success' : 'empty');
    resultStatus.textContent = resultSummary();
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error);
    showError(error);
    resultStatus.textContent = 'Unable to get started'; retryConnection.hidden = false;
    setResultState('error', "We couldn't load the simulator. Please try again.");
  } finally { initializing = false; retryConnection.disabled = false; ready(); }
}
function retry() {
  if (initializing || activeRequest) return;
  return defaults ? form.requestSubmit() : initialize();
}
retryConnection.addEventListener('click', retry);
retryButton.addEventListener('click', retry);
downloadChartButton.addEventListener('click', () => {
  if (!chart || !lastResult) return;
  const link = document.createElement('a');
  link.download = `policy-lab-simulation-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = chart.toBase64Image('image/png', 1);
  link.click();
});
downloadChartButton.disabled = true;
setResultState('empty');
initialize();
