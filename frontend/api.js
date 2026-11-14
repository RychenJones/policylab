export const INPUT_RULES = Object.freeze({
  baseGasShare: { min: 0.00001, max: 0.99998 },
  baseEvShare: { min: 0.00001, max: 0.99998 },
  baseNoCarShare: { min: 0.00001, max: 0.99998 },
  gasTax: { min: 0, max: 10 }, evRebate: { min: 0, max: 20000 }, transitFare: { min: 0, max: 15 },
  simulatedYears: { min: 1, max: 100 }
});
const fields = Object.keys(INPUT_RULES);
const integerFields = new Set(['simulatedYears']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export class ApiError extends Error {
  constructor(status, message, { code, fieldErrors, formError } = {}) {
    super(message); this.name = 'ApiError';
    Object.assign(this, { status, code, fieldErrors, formError });
  }
}

export function sanitizeRequest(request) {
  const errors = {}, clean = {};
  if (!object(request)) throw new ApiError(400, 'Invalid scenario.', { code: 'validation_failed', formError: 'Send the seven scenario fields.' });
  if (Object.keys(request).some(key => !fields.includes(key))) errors.body = ['Unknown scenario field.'];
  for (const field of fields) {
    const value = request[field], rule = INPUT_RULES[field];
    if (!Object.hasOwn(request, field) || !finite(value) || (integerFields.has(field) && !Number.isInteger(value)) || value < rule.min || value > rule.max)
      errors[field] = [`Enter a finite number from ${rule.min} to ${rule.max}.`];
    else clean[field] = value;
  }
  if (fields.slice(0, 3).every(field => Object.hasOwn(clean, field))
    && Math.abs(clean.baseGasShare + clean.baseEvShare + clean.baseNoCarShare - 1) > 1e-8)
    errors.body = ['Starting percentages must total 100%.'];
  if (Object.keys(errors).length) {
    const { body, ...fieldErrors } = errors;
    throw new ApiError(400, 'Check the scenario inputs.', { code: 'validation_failed', fieldErrors, formError: body?.join(' ') });
  }
  return clean;
}

export function sanitizeResult(value) {
  const keys = ['gasPct', 'evPct', 'noCarPct'];
  if (!object(value) || keys.some(key => !Object.hasOwn(value, key) || !finite(value[key]) || value[key] < 0 || value[key] > 100)
    || Math.abs(keys.reduce((sum, key) => sum + value[key], 0) - 100) > 1e-6)
    throw new ApiError(200, 'The server returned invalid transportation percentages.', { code: 'invalid_response' });
  const years = value.years;
  const validYears = Array.isArray(years) && years.length > 0 && years.every((snapshot, index) =>
    object(snapshot)
    && snapshot.year === index + 1
    && keys.every(key => finite(snapshot[key]) && snapshot[key] >= 0 && snapshot[key] <= 100)
    && Math.abs(keys.reduce((sum, key) => sum + snapshot[key], 0) - 100) <= 1e-6
  );
  if (!validYears)
    throw new ApiError(200, 'The server returned invalid yearly transportation data.', { code: 'invalid_response' });
  const cohorts = value.cohorts;
  const validCohorts = Array.isArray(cohorts) && cohorts.length > 0
    && new Set(cohorts.map(cohort => cohort?.id)).size === cohorts.length
    && cohorts.every(cohort => finite(cohort?.populationPct) && cohort.populationPct > 0 && cohort.populationPct <= 100)
    && Math.abs(cohorts.reduce((sum, cohort) => sum + cohort.populationPct, 0) - 100) <= 1e-6
    && cohorts.every(cohort => {
      const baseline = cohort?.baseline;
      const cohortValues = keys.map(key => cohort?.[key]);
      const baselineValues = keys.map(key => baseline?.[key]);
      const cohortYears = cohort?.years;
      return object(cohort)
        && typeof cohort.id === 'string' && cohort.id.length > 0
        && typeof cohort.label === 'string' && cohort.label.length > 0
        && cohortValues.every(item => finite(item) && item >= 0 && item <= 100)
        && Math.abs(cohortValues.reduce((sum, item) => sum + item, 0) - 100) <= 1e-6
        && object(baseline)
        && baselineValues.every(item => finite(item) && item > 0 && item <= 100)
        && Math.abs(baselineValues.reduce((sum, item) => sum + item, 0) - 100) <= 1e-6
        && Array.isArray(cohortYears) && cohortYears.length === years.length
        && cohortYears.every((snapshot, index) => object(snapshot)
          && snapshot.year === index + 1
          && keys.every(key => finite(snapshot[key]) && snapshot[key] >= 0 && snapshot[key] <= 100)
          && Math.abs(keys.reduce((sum, key) => sum + snapshot[key], 0) - 100) <= 1e-6);
    });
  if (!validCohorts)
    throw new ApiError(200, 'The server returned invalid cohort transportation data.', { code: 'invalid_response' });
  return { ...Object.fromEntries(keys.map(key => [key, value[key]])), years: years.map(snapshot => ({
    year: snapshot.year, gasPct: snapshot.gasPct, evPct: snapshot.evPct, noCarPct: snapshot.noCarPct
  })), cohorts: cohorts.map(cohort => ({
    id: cohort.id, label: cohort.label, populationPct: cohort.populationPct,
    baseline: Object.fromEntries(keys.map(key => [key, cohort.baseline[key]])),
    ...Object.fromEntries(keys.map(key => [key, cohort[key]])),
    years: cohort.years.map(snapshot => ({
      year: snapshot.year, gasPct: snapshot.gasPct, evPct: snapshot.evPct, noCarPct: snapshot.noCarPct
    }))
  })) };
}

function sanitizeConfig(value) {
  if (!object(value) || !object(value.inputs) || !Array.isArray(value.assumptions)
    || !value.assumptions.every(item => typeof item === 'string'))
    throw new ApiError(200, 'Invalid server configuration.', { code: 'invalid_response' });
  let defaults;
  try {
    // The horizon is intentionally not part of server defaults: the user must choose it.
    const policyDefaults = sanitizeRequest({ ...value.defaults, simulatedYears: 1 });
    delete policyDefaults.simulatedYears;
    defaults = policyDefaults;
  }
  catch { throw new ApiError(200, 'Invalid server defaults.', { code: 'invalid_response' }); }
  const inputs = {};
  for (const field of fields) {
    const rule = value.inputs[field];
    if (!object(rule) || rule.min !== INPUT_RULES[field].min || rule.max !== INPUT_RULES[field].max || !finite(rule.step) || rule.step <= 0)
      throw new ApiError(200, 'Server input rules do not match this client.', { code: 'invalid_response' });
    inputs[field] = { min: rule.min, max: rule.max, step: rule.step };
  }
  return { defaults, inputs, assumptions: [...value.assumptions] };
}

export function createApi({ baseUrl = '/api', fetchImpl = globalThis.fetch } = {}) {
  async function request(path, method, body, sanitize, { signal } = {}) {
    if (signal?.aborted) throw new ApiError(0, 'Request cancelled.', { code: 'cancelled' });
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    let response, text;
    try {
      response = await fetchImpl(url, { method, signal,
        headers: { Accept: 'application/json, application/problem+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw new ApiError(0, 'Request cancelled.', { code: 'cancelled' });
      if (error instanceof TypeError) throw new ApiError(0, "We couldn't reach the simulator. Check your connection and try again.", { code: 'network_error' });
      throw error;
    }
    let data;
    try { data = JSON.parse(text); } catch { /* Status determines the safe fallback. */ }
    if (!response.ok) {
      const fieldErrors = {}, general = [];
      if (object(data?.errors)) for (const [key, messages] of Object.entries(data.errors)) {
        if (!Array.isArray(messages) || !messages.every(message => typeof message === 'string')) continue;
        if (fields.includes(key)) fieldErrors[key] = messages; else general.push(...messages);
      }
      throw new ApiError(response.status, `Request failed (${response.status}).`, {
        code: typeof data?.code === 'string' ? data.code : undefined, fieldErrors, formError: general.join(' ') || undefined });
    }
    if (response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
      throw new ApiError(response.status, 'The server returned a non-JSON response.', { code: 'invalid_response' });
    try { return sanitize(data); }
    catch (error) { if (error instanceof ApiError) error.status = response.status; throw error; }
  }
  return {
    getHealth: options => request('/health', 'GET', null, value => {
      if (value?.status !== 'ok') throw new ApiError(200, 'Invalid health response.', { code: 'invalid_response' });
      return { status: 'ok' };
    }, options),
    getConfig: options => request('/config', 'GET', null, sanitizeConfig, options),
    requestSimulation: async (input, options) => request('/simulate', 'POST', sanitizeRequest(input), sanitizeResult, options)
  };
}

export const { getHealth, getConfig, requestSimulation } = createApi();
