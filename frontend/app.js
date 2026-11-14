import { ApiError, getConfig, requestSimulation as sendSimulation, sanitizeRequest } from './api.js'; import { createCharts, updateCharts, downloadChart } from './js/charts.js'; import { readValues, buildBackendRequest, setTotalStatus, setFormValues, clearErrors, showError } from './js/form.js';

const HOUSEHOLD_COUNT = 5000;
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
const presetButtons = {
  urban: document.querySelector('#urban-preset'),
  rural: document.querySelector('#rural-preset'),
  custom: document.querySelector('#custom-preset')
};
const cohortTabs = [...document.querySelectorAll('[data-cohort]')];
const resultsPanelContent = document.querySelector('#overall-panel');
const populationNote = document.querySelector('#population-note');
const yearlyChartNote = document.querySelector('#yearly-chart-note');
const numberFormatter = new Intl.NumberFormat('en-US');
const controls = {
  baseGasShare: document.querySelector('#base-gas'), baseEvShare: document.querySelector('#base-ev'),
  baseNoCarShare: document.querySelector('#base-no-car'), gasTax: document.querySelector('#gas-tax'),
  evRebate: document.querySelector('#ev-rebate'), transitFare: document.querySelector('#transit-fare'),
  simulatedYears: document.querySelector('#simulated-years')
};
const charts = createCharts(document, numberFormatter, HOUSEHOLD_COUNT);
// The no-car values use 2022 ACS urban/rural vehicle-availability estimates.
// EV values are demo proxies anchored to the 2025 national ACS EV-ownership estimate;
// the ACS does not yet publish one directly comparable urban/rural mode-share table.
const POPULATION_PRESETS = Object.freeze({
  urban: { baseGasPct: 84.2, baseEvPct: 6.5, baseNoCarPct: 9.3 },
  rural: { baseGasPct: 92.5, baseEvPct: 3.5, baseNoCarPct: 4.0 }
});
let defaults, activeRequest, lastResult;
let activeCohort = 'overall';
let initializing = false;
let requestId = 0;

function activateTab(cohortId) {
  const tab = cohortTabs.find(button => button.dataset.cohort === cohortId);
  if (!tab || tab.disabled) return;
  activeCohort = cohortId;
  for (const button of cohortTabs) {
    const active = button === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  resultsPanelContent.setAttribute('aria-label', `${tab.textContent} simulation results`);
  if (lastResult) renderActiveView();
}

function setResultState(state, detail = '') {
  resultsPanel.dataset.state = state; resultsPanel.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  emptyState.hidden = state !== 'empty'; loadingState.hidden = state !== 'loading'; errorState.hidden = state !== 'error';
  resultsContent.hidden = !(state === 'success' || (lastResult && (state === 'loading' || state === 'error')));
  errorStateDetail.textContent = detail;
}

export async function requestSimulation(request, options) { return sendSimulation(request, options); }

function signedPoints(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)} pp`;
}

function signedHouseholds(value, householdCount = HOUSEHOLD_COUNT) {
  const rounded = Math.round(value / 100 * householdCount);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${numberFormatter.format(Math.abs(rounded))} estimated households`;
}

function activeView() {
  if (activeCohort === 'overall') return {
    label: 'Overall population', populationPct: 100,
    baseline: { gasPct: lastResult.values.baseGasPct, evPct: lastResult.values.baseEvPct, noCarPct: lastResult.values.baseNoCarPct },
    policy: lastResult.result, years: lastResult.result.years
  };
  const cohort = lastResult.result.cohorts.find(item => item.id === activeCohort);
  return cohort ? { label: cohort.label, populationPct: cohort.populationPct, baseline: cohort.baseline, policy: cohort, years: cohort.years } : null;
}

function renderActiveView() {
  const view = activeView();
  if (!view) return;
  const baseline = [view.baseline.gasPct, view.baseline.evPct, view.baseline.noCarPct];
  const policy = [view.policy.gasPct, view.policy.evPct, view.policy.noCarPct];
  const householdCount = HOUSEHOLD_COUNT * view.populationPct / 100;
  const labels = ['Gas vehicle', 'EV', 'No car'];
  const changes = policy.map((value, index) => value - baseline[index]);
  const largestIndex = changes.reduce((best, value, index) => Math.abs(value) > Math.abs(changes[best]) ? index : best, 0);
  const largest = changes[largestIndex];
  document.querySelector('#headline-title').textContent = Math.abs(largest) < 1e-8 ? 'No change in transportation mix' : `${labels[largestIndex]} share ${largest < 0 ? 'decreased' : 'increased'}`;
  document.querySelector('#headline-detail').textContent = `${signedPoints(largest)} · ${signedHouseholds(largest, householdCount)} compared with the starting mix.`;
  ['gas', 'ev', 'no-car'].forEach((key, index) => {
    document.querySelector(`#${key}-change`).textContent = signedPoints(changes[index]); document.querySelector(`#${key}-count`).textContent = signedHouseholds(changes[index], householdCount);
  });
  const rows = labels.map((label, index) => {
    const row = document.createElement('tr');
    for (const text of [label, `${baseline[index].toFixed(3)}%`, `${policy[index].toFixed(3)}%`]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
    return row;
  });
  document.querySelector('#results-table-body').replaceChildren(...rows);
  document.querySelector('#result-inputs').textContent = `${view.label}: ${view.populationPct.toFixed(1)}% of population · Starting gas ${baseline[0].toFixed(3)}%, EV ${baseline[1].toFixed(3)}%, no car ${baseline[2].toFixed(3)}%. Policy: gas tax +$${lastResult.values.gasTax}/gallon; EV rebate $${numberFormatter.format(lastResult.values.evRebate)}; transit fare $${lastResult.values.transitFare}/ride.`;
  populationNote.textContent = `${numberFormatter.format(Math.round(householdCount))} households · ${view.populationPct.toFixed(1)}% of population`;
  yearlyChartNote.textContent = `${view.label} · percent of population`;
  charts.setHouseholdCount?.(householdCount);
  updateCharts(charts, baseline, policy, view.years);
}

function renderResults(values, result) {
  lastResult = { values, result };
  setResultState('success');
  for (const button of cohortTabs) button.disabled = button.dataset.cohort !== 'overall' && !result.cohorts.some(item => item.id === button.dataset.cohort);
  renderActiveView();
  downloadChartButton.disabled = !charts.chart;
  resultStatus.textContent = `Simulation complete · ${values.simulatedYears}-year estimate`;
}

function ready() {
  runButton.disabled = !defaults || initializing || Boolean(activeRequest); retryButton.disabled = initializing || Boolean(activeRequest);
  runButton.querySelector('span').textContent = activeRequest ? 'Running…' : 'Run simulation';
}

function resultSummary() {
  if (!lastResult) return 'Ready · Run a scenario to see results';
  const current = readValues(controls);
  return Object.keys(lastResult.values).some(key => current[key] !== lastResult.values[key]) ? 'Inputs changed · Run again to update the displayed result' : `Simulation complete · ${lastResult.values.simulatedYears}-year estimate`;
}

function selectPreset(name) {
  for (const [key, button] of Object.entries(presetButtons)) {
    const active = key === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const preset = POPULATION_PRESETS[name];
  if (!preset) return;
  controls.baseGasShare.value = preset.baseGasPct;
  controls.baseEvShare.value = preset.baseEvPct;
  controls.baseNoCarShare.value = preset.baseNoCarPct;
  clearErrors(controls, errorMessage);
  setTotalStatus(document, readValues(controls));
  if (!activeRequest && defaults) {
    setResultState(lastResult ? 'success' : 'empty');
    resultStatus.textContent = resultSummary();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!defaults || initializing || activeRequest) return;
  clearErrors(controls, errorMessage);
  const values = readValues(controls);
  let request;
  try { request = sanitizeRequest(buildBackendRequest(values)); } catch (error) { showError(error, controls, errorMessage, numberFormatter, ApiError, document); return; }
  stopRequest(); const id = requestId; activeRequest = new AbortController();
  runButton.disabled = true; runButton.querySelector('span').textContent = 'Running…'; resultStatus.textContent = lastResult ? 'Running simulation… Previous result remains below.' : 'Running simulation…'; setResultState('loading');
  try {
    const result = await requestSimulation(request, { signal: activeRequest.signal });
    if (id === requestId) renderResults(values, result);
  } catch (error) {
    if (id !== requestId) return;
    if (error instanceof ApiError && error.code === 'cancelled') { setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary(); return; }
    if (!(error instanceof ApiError)) console.error(error);
    const detail = showError(error, controls, errorMessage, numberFormatter, ApiError, document); resultStatus.textContent = lastResult ? 'Simulation failed · Showing previous result' : 'Simulation failed'; setResultState('error', detail);
  } finally { if (id === requestId) { activeRequest = undefined; ready(); } }
});

function stopRequest() { requestId++; activeRequest?.abort(); activeRequest = undefined; }

document.querySelector('#reset-button').addEventListener('click', () => {
  stopRequest(); clearErrors(controls, errorMessage); lastResult = undefined; activeCohort = 'overall'; selectPreset('custom');
  if (defaults) setFormValues(controls, defaults, document);
  setResultState('empty'); resultStatus.textContent = defaults ? 'Ready · Run a scenario to see results' : 'The simulator is not ready yet. Please try again.';
  if (!defaults && !initializing) setResultState('error', "We couldn't load the simulator. Please try again.");
  downloadChartButton.disabled = true; for (const button of cohortTabs) button.disabled = button.dataset.cohort !== 'overall'; activateTab('overall'); ready();
});

for (const [field, input] of Object.entries(controls)) {
  input.setAttribute('aria-describedby', 'form-error');
  input.addEventListener('input', () => { clearErrors(controls, errorMessage); if (field.startsWith('base')) selectPreset('custom'); setTotalStatus(document, readValues(controls)); if (!activeRequest && defaults) { setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary(); } });
}
window.addEventListener('pagehide', stopRequest);
window.addEventListener('pageshow', event => { if (!event.persisted) return; ready(); if (!defaults && !initializing) { initialize(); return; } setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary(); });

async function initialize() {
  if (initializing) return;
  initializing = true; retryConnection.hidden = true; retryConnection.disabled = true; ready(); resultStatus.textContent = 'Getting the simulator ready…'; clearErrors(controls, errorMessage);
  try {
    const config = await getConfig(); defaults = config.defaults;
    for (const [field, input] of Object.entries(controls)) { const factor = field.startsWith('base') ? 100 : 1; input.min = config.inputs[field].min * factor; input.max = config.inputs[field].max * factor; input.step = config.inputs[field].step; }
    setFormValues(controls, defaults, document); selectPreset('custom'); setResultState(lastResult ? 'success' : 'empty'); resultStatus.textContent = resultSummary();
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error); showError(error, controls, errorMessage, numberFormatter, ApiError, document); resultStatus.textContent = 'Unable to get started'; retryConnection.hidden = false; setResultState('error', "We couldn't load the simulator. Please try again.");
  } finally { initializing = false; retryConnection.disabled = false; ready(); }
}

function retry() { if (initializing || activeRequest) return; return defaults ? form.requestSubmit() : initialize(); }
retryConnection.addEventListener('click', retry); retryButton.addEventListener('click', retry);
for (const [name, button] of Object.entries(presetButtons)) button.addEventListener('click', () => selectPreset(name));
for (const tab of cohortTabs) tab.addEventListener('click', () => activateTab(tab.dataset.cohort));
downloadChartButton.addEventListener('click', () => downloadChart(charts.chart, lastResult));
downloadChartButton.disabled = true; for (const button of cohortTabs) button.disabled = button.dataset.cohort !== 'overall'; activateTab('overall'); setResultState('empty'); initialize();
