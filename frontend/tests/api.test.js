import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../api.js';

const policy = { gasTaxChangeUsdPerGallon: 1, evRebateUsd: 7500, publicTransitFareUsdPerRide: 2.5 };
// Transport-only shape: not calculated household results or a model fixture.
const payload = { policy, baseline: {}, proposed: {}, changes: {} };
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' }
});

test('POST sends exactly the new policy fields and returns the response unchanged', async () => {
  const api = createApi({ baseUrl: 'http://example.test/api/', fetchImpl: async (url, options) => {
    assert.equal(url, 'http://example.test/api/simulate');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), policy);
    return json(payload);
  } });
  assert.deepEqual(await api.runSimulation({ ...policy, seed: 42 }), payload);
});

test('GET methods use the agreed health and config routes without a body', async () => {
  const api = createApi({ fetchImpl: async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    if (url === '/api/health') return json({ status: 'ok' });
    assert.equal(url, '/api/config'); return json({ inputs: {}, statusQuoPolicy: policy });
  } });
  assert.equal((await api.getHealth()).status, 'ok');
  assert.deepEqual((await api.getConfig()).statusQuoPolicy, policy);
});

test('validation errors split known fields from body/unknown keys and retain actual HTTP status', async () => {
  const api = createApi({ fetchImpl: async () => json({ status: 200, errors: {
    evRebateUsd: ['Enter a value from 0 to 12000.'], body: ['Invalid request.'], constructor: ['General error.'], bad: 42
  } }, 400) });
  await assert.rejects(api.runSimulation(policy), error => error instanceof ApiError && error.status === 400
    && error.fieldErrors.evRebateUsd.length === 1 && error.formError === 'Invalid request. General error.');
});

test('HTML, empty, and malformed error bodies remain safe HTTP failures', async () => {
  for (const body of ['<h1>Gateway error</h1>', '', '{']) {
    const api = createApi({ fetchImpl: async () => new Response(body, { status: 502 }) });
    await assert.rejects(api.runSimulation(policy), error => error.status === 502 && error.message === 'Request failed (502).');
  }
});

test('malformed, empty, and old aggregate success bodies are invalid responses', async () => {
  for (const response of [json({ gasPct: 80 }), new Response(null, { status: 204 }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } })])
    await assert.rejects(createApi({ fetchImpl: async () => response }).runSimulation(policy), error => error.code === 'invalid_response');
});

test('network failures and caller cancellation are distinct from HTTP responses', async () => {
  await assert.rejects(createApi({ fetchImpl: async () => { throw new TypeError('fetch failed'); } }).runSimulation(policy),
    error => error.status === 0 && error.code === 'network_error');
  const unused = createApi({ fetchImpl: () => { throw new Error('Must not send'); } });
  await assert.rejects(unused.runSimulation(policy, { signal: AbortSignal.abort() }), error => error.code === 'cancelled');
  const caller = new AbortController();
  const api = createApi({ fetchImpl: async (_url, { signal }) => ({ text: () => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    caller.abort();
  }) }) });
  await assert.rejects(api.runSimulation(policy, { signal: caller.signal }), error => error.code === 'cancelled');
});

test('programming exceptions propagate and optional server codes remain available', async () => {
  await assert.rejects(createApi({ fetchImpl: async () => { throw new Error('bug'); } }).runSimulation(policy), /bug/);
  const circular = {}; circular.self = circular;
  await assert.rejects(createApi({ fetchImpl: () => { throw new Error('Must not send'); } }).runSimulation({ ...policy, evRebateUsd: circular }),
    error => error instanceof TypeError && !(error instanceof ApiError));
  await assert.rejects(createApi({ fetchImpl: async () => json({ code: 'model_not_ready' }, 500) }).runSimulation(policy),
    error => error.status === 500 && error.code === 'model_not_ready');
});
