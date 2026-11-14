const policyFields = ['gasTaxChangeUsdPerGallon', 'evRebateUsd', 'publicTransitFareUsdPerRide'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class ApiError extends Error {
  constructor(status, message, { code, fieldErrors, formError } = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, { status, code, fieldErrors, formError });
  }
}

// HTTP only. Import this module when the frontend owner connects the form.
export function createApi({ baseUrl = '/api', fetchImpl = globalThis.fetch } = {}) {
  async function request(path, method, body, validate, { signal } = {}) {
    if (signal?.aborted) throw new ApiError(0, 'Request cancelled.', { code: 'cancelled' });
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    const serializedBody = body ? JSON.stringify(body) : undefined;
    let response, text;
    try {
      response = await fetchImpl(url, {
        method, signal,
        headers: { Accept: 'application/json, application/problem+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: serializedBody } : {})
      });
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw new ApiError(0, 'Request cancelled.', { code: 'cancelled' });
      if (error instanceof TypeError)
        throw new ApiError(0, "Can't reach the simulator. Is the backend running?", { code: 'network_error' });
      throw error;
    }
    let data;
    try { data = JSON.parse(text); } catch { /* Status determines the safe fallback. */ }
    if (!response.ok) {
      const fieldErrors = {}, general = [];
      if (object(data?.errors)) for (const [key, messages] of Object.entries(data.errors)) {
        if (!Array.isArray(messages) || !messages.every(message => typeof message === 'string')) continue;
        if (policyFields.includes(key)) fieldErrors[key] = messages; else general.push(...messages);
      }
      throw new ApiError(response.status, `Request failed (${response.status}).`, {
        code: typeof data?.code === 'string' ? data.code : undefined,
        fieldErrors, formError: general.join(' ') || undefined
      });
    }
    if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json') || !validate(data))
      throw new ApiError(response.status, 'The server returned an invalid response.', { code: 'invalid_response' });
    return data;
  }
  return {
    getHealth: options => request('/health', 'GET', null, value => value?.status === 'ok', options),
    getConfig: options => request('/config', 'GET', null,
      value => object(value) && object(value.inputs) && object(value.statusQuoPolicy), options),
    runSimulation: (policy, options) => request('/simulate', 'POST',
      Object.fromEntries(policyFields.map(key => [key, policy[key]])),
      value => object(value) && object(value.policy) && object(value.baseline) && object(value.proposed) && object(value.changes), options)
  };
}

const api = createApi();
export const { getHealth, getConfig, runSimulation } = api;
