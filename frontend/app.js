const EXAMPLE_POLICY = {
  gasTaxUsdPerGallon: 1,
  evRebateUsd: 7500,
  publicTransitFareUsdPerRide: 2.5,
  seed: 2026
};

const form = document.querySelector('#policy-form');
const submitButton = form.querySelector('button[type="submit"]');
const errorMessage = document.querySelector('#form-error');
const resultStatus = document.querySelector('#result-status');
const assumptionsDialog = document.querySelector('#assumptions-dialog');

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US');

function readPolicyForm() {
  return {
    gasTaxUsdPerGallon: Number(document.querySelector('#gas-tax').value),
    evRebateUsd: Number(document.querySelector('#ev-rebate').value),
    publicTransitFareUsdPerRide: Number(document.querySelector('#transit-fare').value),
    seed: Number(document.querySelector('#seed').value)
  };
}

function validatePolicy(policy) {
  const fields = [
    ['gasTaxUsdPerGallon', 'Gas tax', 0, 10],
    ['evRebateUsd', 'EV rebate', 0, 20000],
    ['publicTransitFareUsdPerRide', 'Public transit fare', 0, 15],
    ['seed', 'Scenario seed', -2147483648, 2147483647]
  ];

  for (const [key, label, min, max] of fields) {
    if (!Number.isFinite(policy[key]) || policy[key] < min || policy[key] > max) {
      return `${label} must be between ${number.format(min)} and ${number.format(max)}.`;
    }
  }

  if (!Number.isInteger(policy.seed)) return 'Scenario seed must be a whole number.';
  return '';
}

// Integration seam: replace this mock with the API client's runSimulation call.
// The expected request shape is documented in docs/frontend/API_FUNCTIONS_DRAFT.md.
async function runSimulation(policy) {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const households = 5000;
  const taxPressure = policy.gasTaxUsdPerGallon / 10;
  const rebateEffect = policy.evRebateUsd / 20000;
  const noCarEffect = 1 - policy.publicTransitFareUsdPerRide / 15;
  const evShare = Math.min(.58, .08 + rebateEffect * .34 + taxPressure * .16);
  const noCarShare = Math.min(.42, .07 + noCarEffect * .2 + taxPressure * .11);
  const evHouseholds = Math.round(households * evShare);
  const noCarHouseholds = Math.round(households * noCarShare);
  const gasHouseholds = households - evHouseholds - noCarHouseholds;
  const costChange = Math.round(policy.gasTaxUsdPerGallon * 180 - policy.evRebateUsd * .02 + policy.publicTransitFareUsdPerRide * 16);
  const emissionsChange = -Math.round(evHouseholds * 110 + noCarHouseholds * 105);

  return {
    appliedPolicy: policy,
    modelVersion: '0.1-demo',
    householdCount: households,
    baselineBehaviors: [
      { category: 'gas', count: households },
      { category: 'ev', count: 0 },
      { category: 'noCar', count: 0 }
    ],
    policyBehaviors: [
      { category: 'gas', count: gasHouseholds },
      { category: 'ev', count: evHouseholds },
      { category: 'noCar', count: noCarHouseholds }
    ],
    averageAnnualCostChangeUsd: costChange,
    emissionsChange: { value: emissionsChange, unit: 'kg CO2e / year' },
    incomeGroups: [
      { incomeGroup: 'Under $40k', averageAnnualCostChangeUsd: Math.round(costChange * 1.45) },
      { incomeGroup: '$40–80k', averageAnnualCostChangeUsd: Math.round(costChange * 1.05) },
      { incomeGroup: '$80–120k', averageAnnualCostChangeUsd: Math.round(costChange * .78) },
      { incomeGroup: 'Over $120k', averageAnnualCostChangeUsd: Math.round(costChange * .5) }
    ],
    assumptions: []
  };
}

function getBehaviorCounts(result, key) {
  return Object.fromEntries(result[key].map((item) => [item.category, item.count]));
}

function formatSignedMoney(value) {
  return `${value >= 0 ? '+' : '−'}${money.format(Math.abs(value))}`;
}

function formatSignedNumber(value) {
  return `${value >= 0 ? '+' : '−'}${number.format(Math.abs(value))}`;
}

function renderBehaviorChart(result) {
  const labels = { gas: 'Gas vehicle', ev: 'EV', noCar: 'No car' };
  const baseline = getBehaviorCounts(result, 'baselineBehaviors');
  const policy = getBehaviorCounts(result, 'policyBehaviors');
  const max = Math.max(...Object.values(baseline), ...Object.values(policy), 1);
  const chart = document.querySelector('#behavior-chart');

  chart.innerHTML = Object.keys(labels).map((key) => `
    <div class="bar-column">
      <div class="bar-group">
        <div>
          <div class="bar-value">${number.format(baseline[key])}</div>
          <div class="bar baseline" style="height: ${Math.max(3, baseline[key] / max * 165)}px" title="Baseline: ${number.format(baseline[key])}"></div>
        </div>
        <div>
          <div class="bar-value">${number.format(policy[key])}</div>
          <div class="bar policy" style="height: ${Math.max(3, policy[key] / max * 165)}px" title="Policy: ${number.format(policy[key])}"></div>
        </div>
      </div>
      <div class="bar-label">${labels[key]}</div>
    </div>
  `).join('');
}

function renderIncomeChart(result) {
  const max = Math.max(...result.incomeGroups.map((group) => Math.abs(group.averageAnnualCostChangeUsd)), 1);
  document.querySelector('#income-chart').innerHTML = result.incomeGroups.map((group) => `
    <div class="income-row">
      <span class="income-label">${group.incomeGroup}</span>
      <div class="income-track"><div class="income-fill" style="width: ${Math.max(3, Math.abs(group.averageAnnualCostChangeUsd) / max * 100)}%"></div></div>
      <span class="income-value">${formatSignedMoney(group.averageAnnualCostChangeUsd)}</span>
    </div>
  `).join('');
}

function renderResults(result) {
  const baseline = getBehaviorCounts(result, 'baselineBehaviors');
  const policy = getBehaviorCounts(result, 'policyBehaviors');
  const switched = result.householdCount - policy.gas;
  const switchPercent = switched / result.householdCount * 100;

  document.querySelector('#switching-value').textContent = number.format(switched);
  document.querySelector('#switching-change').textContent = `${switchPercent.toFixed(1)}% of population`;
  document.querySelector('#cost-value').textContent = formatSignedMoney(result.averageAnnualCostChangeUsd);
  document.querySelector('#emissions-value').textContent = formatSignedNumber(result.emissionsChange.value);
  document.querySelector('#emissions-unit').textContent = result.emissionsChange.unit.replace('CO2e', 'CO₂e');
  resultStatus.textContent = `Simulation complete · Seed ${result.appliedPolicy.seed}`;
  renderBehaviorChart({ ...result, baselineBehaviors: baselineToArray(baseline) });
  renderIncomeChart(result);
}

function baselineToArray(counts) {
  return Object.entries(counts).map(([category, count]) => ({ category, count }));
}

function setFormValues(policy) {
  document.querySelector('#gas-tax').value = policy.gasTaxUsdPerGallon;
  document.querySelector('#ev-rebate').value = policy.evRebateUsd;
  document.querySelector('#transit-fare').value = policy.publicTransitFareUsdPerRide;
  document.querySelector('#seed').value = policy.seed;
  document.querySelectorAll('.range-input').forEach((range) => {
    range.value = document.querySelector(`#${range.dataset.target}`).value;
  });
}

document.querySelectorAll('.range-input').forEach((range) => {
  range.addEventListener('input', () => {
    document.querySelector(`#${range.dataset.target}`).value = range.value;
  });
});

document.querySelectorAll('.input-with-unit input').forEach((input) => {
  input.addEventListener('input', () => {
    const range = document.querySelector(`[data-target="${input.id}"]`);
    if (range) range.value = input.value;
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const policy = readPolicyForm();
  const validationError = validatePolicy(policy);
  errorMessage.hidden = !validationError;
  errorMessage.textContent = validationError;
  if (validationError) return;

  submitButton.disabled = true;
  submitButton.querySelector('span').textContent = 'Running…';
  resultStatus.textContent = 'Running simulation…';
  try {
    const result = await runSimulation(policy);
    renderResults(result);
  } catch (error) {
    errorMessage.hidden = false;
    errorMessage.textContent = 'The simulation could not be completed. Please try again.';
    resultStatus.textContent = 'Simulation failed';
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span').textContent = 'Run simulation';
  }
});

document.querySelector('#reset-button').addEventListener('click', () => {
  setFormValues(EXAMPLE_POLICY);
  errorMessage.hidden = true;
  renderResults({ ...createExampleResult(), appliedPolicy: EXAMPLE_POLICY });
});

function createExampleResult() {
  return {
    appliedPolicy: EXAMPLE_POLICY,
    householdCount: 5000,
    baselineBehaviors: [{ category: 'gas', count: 5000 }, { category: 'ev', count: 0 }, { category: 'noCar', count: 0 }],
    policyBehaviors: [{ category: 'gas', count: 3650 }, { category: 'ev', count: 900 }, { category: 'noCar', count: 450 }],
    averageAnnualCostChangeUsd: 215,
    emissionsChange: { value: -125000, unit: 'kg CO2e / year' },
    incomeGroups: [
      { incomeGroup: 'Under $40k', averageAnnualCostChangeUsd: 312 },
      { incomeGroup: '$40–80k', averageAnnualCostChangeUsd: 226 },
      { incomeGroup: '$80–120k', averageAnnualCostChangeUsd: 168 },
      { incomeGroup: 'Over $120k', averageAnnualCostChangeUsd: 108 }
    ]
  };
}

document.querySelector('#assumptions-button').addEventListener('click', () => assumptionsDialog.showModal());
document.querySelector('#close-dialog').addEventListener('click', () => assumptionsDialog.close());
assumptionsDialog.addEventListener('click', (event) => {
  if (event.target === assumptionsDialog) assumptionsDialog.close();
});

renderResults(createExampleResult());
