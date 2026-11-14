export function readValues(controls) {
  return {
    baseGasPct: controls.baseGasShare.valueAsNumber,
    baseEvPct: controls.baseEvShare.valueAsNumber,
    baseNoCarPct: controls.baseNoCarShare.valueAsNumber,
    gasTax: controls.gasTax.valueAsNumber,
    evRebate: controls.evRebate.valueAsNumber,
    transitFare: controls.transitFare.valueAsNumber,
    simulatedYears: controls.simulatedYears.valueAsNumber
  };
}

export function buildBackendRequest(values) {
  return {
    baseGasShare: values.baseGasPct / 100,
    baseEvShare: values.baseEvPct / 100,
    baseNoCarShare: values.baseNoCarPct / 100,
    gasTax: values.gasTax,
    evRebate: values.evRebate,
    transitFare: values.transitFare,
    simulatedYears: values.simulatedYears
  };
}

export function setTotalStatus(document, values) {
  const total = values.baseGasPct + values.baseEvPct + values.baseNoCarPct;
  const status = document.querySelector('#baseline-total');
  status.textContent = Number.isFinite(total) ? `Total: ${total.toFixed(3)}%` : 'Enter all three starting percentages.';
  status.classList.toggle('invalid', !Number.isFinite(total) || Math.abs(total - 100) > 1e-6);
}

export function setFormValues(controls, request, document) {
  for (const [field, input] of Object.entries(controls)) {
    if (request[field] === undefined) continue;
    input.value = field.startsWith('base') ? Number((request[field] * 100).toFixed(3)) : request[field];
  }
  setTotalStatus(document, readValues(controls));
}

export function clearErrors(controls, errorMessage) {
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  for (const input of Object.values(controls)) {
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
  }
}

export function showError(error, controls, errorMessage, numberFormatter, ApiError, document) {
  const messages = [];
  for (const key of Object.keys(error.fieldErrors ?? {})) {
    if (Object.hasOwn(controls, key)) {
      const input = controls[key];
      const label = input.labels[0].textContent.trim();
      const value = input.valueAsNumber;
      let message;
      if (input.value.trim() === '' || !Number.isFinite(value)) message = `Enter a number for ${label.toLowerCase()}.`;
      else if (key.startsWith('base')) message = `${label} must be between ${input.min}% and ${input.max}%.`;
      else if (key === 'simulatedYears') message = `${label} must be a whole number from ${input.min} to ${input.max}.`;
      else message = `${label} must be between $${numberFormatter.format(Number(input.min))} and $${numberFormatter.format(Number(input.max))}.`;
      input.setCustomValidity(message);
      input.setAttribute('aria-invalid', 'true');
      messages.push(message);
    }
  }
  const values = readValues(controls);
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
