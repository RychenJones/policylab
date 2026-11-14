import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi, INPUT_RULES, sanitizeRequest, sanitizeResult } from '../api.js';

const input = { baseGasShare: 0.88592, baseEvShare: 0.01808, baseNoCarShare: 0.096, gasTax: 1, evRebate: 7500, transitFare: 1.75, simulatedYears: 5 };
const result = { gasPct: 80, evPct: 10, noCarPct: 10, years: [
  { year: 1, gasPct: 82, evPct: 8, noCarPct: 10 },
  { year: 2, gasPct: 80, evPct: 10, noCarPct: 10 }
] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('requestSimulation sends exactly seven validated numeric fields to POST /api/simulate', async () => {
  const api = createApi({ fetchImpl: async (url, options) => {
    assert.equal(url, '/api/simulate'); assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), input);
    assert.equal(options.headers['Content-Type'], 'application/json');
    return json({ ...result, internal: 'must not reach UI' });
  } });
  assert.deepEqual(await api.requestSimulation(input), result);
});

test('client rejects unknown, missing, string, null, non-finite, zero-share and nonconserving requests before sending', async () => {
  const api = createApi({ fetchImpl: () => { throw new Error('Must not send'); } });
  for (const invalid of [null, { ...input, seed: 42 }, { ...input, gasTax: '1' }, { ...input, gasTax: NaN },
    { ...input, evRebate: null }, { ...input, transitFare: Infinity }, { ...input, baseEvShare: 0 },
    { ...input, baseGasShare: 0.9 }, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'gasTax'))])
    await assert.rejects(api.requestSimulation(invalid), error => error.status === 400 && error.code === 'validation_failed');
  assert.equal(sanitizeRequest(input).baseNoCarShare, 0.096);
});

test('response sanitation preserves valid yearly snapshots and rejects invalid data', () => {
  for (const invalid of [null, [], {}, { ...result, gasPct: '80' }, { ...result, gasPct: NaN },
    { ...result, evPct: Infinity }, { ...result, noCarPct: -1 }, { ...result, noCarPct: 101 }, { ...result, gasPct: 70 },
    { ...result, years: [] }, { ...result, years: [{ year: 2, gasPct: 82, evPct: 8, noCarPct: 10 }] },
    { ...result, years: [{ year: 1, gasPct: 81, evPct: 8, noCarPct: 10 }] },
    { ...result, years: [{ year: 1, gasPct: 82, evPct: '8', noCarPct: 10 }] }])
    assert.throws(() => sanitizeResult(invalid), error => error.code === 'invalid_response');
  assert.deepEqual(sanitizeResult({ ...result, extra: '<script>' }), result);
});

test('HTTP failures keep actual status, known fields and general error messages', async () => {
  const api = createApi({ fetchImpl: async () => json({ status: 200, errors: {
    baseGasShare: ['Invalid fraction.'], body: ['Invalid total.'], constructor: ['General error.'], bad: 42
  } }, 400) });
  await assert.rejects(api.requestSimulation(input), error => error instanceof ApiError && error.status === 400
    && error.fieldErrors.baseGasShare.length === 1 && error.formError === 'Invalid total. General error.');
  for (const body of ['<h1>Gateway error</h1>', '', '{'])
    await assert.rejects(createApi({ fetchImpl: async () => new Response(body, { status: 502 }) }).requestSimulation(input),
      error => error.status === 502 && error.message === 'Request failed (502).');
});

test('malformed/empty/legacy/non-JSON successful responses cannot reach renderers', async () => {
  for (const response of [json({ policy: {}, baseline: {}, proposed: {}, changes: {} }),
    new Response(null, { status: 204 }), new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify(result), { headers: { 'Content-Type': 'text/html' } })])
    await assert.rejects(createApi({ fetchImpl: async () => response }).requestSimulation(input), error => error.code === 'invalid_response');
});

test('network failures, caller abort and unexpected exceptions remain distinct', async () => {
  await assert.rejects(createApi({ fetchImpl: async () => { throw new TypeError('fetch failed'); } }).requestSimulation(input), error => error.code === 'network_error');
  await assert.rejects(createApi({ fetchImpl: () => { throw new Error('Must not send'); } }).requestSimulation(input, { signal: AbortSignal.abort() }), error => error.code === 'cancelled');
  const controller = new AbortController();
  const api = createApi({ fetchImpl: async (_url, { signal }) => ({ text: () => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }); controller.abort();
  }) }) });
  await assert.rejects(api.requestSimulation(input, { signal: controller.signal }), error => error.code === 'cancelled');
  await assert.rejects(createApi({ fetchImpl: async () => { throw new Error('bug'); } }).requestSimulation(input), /bug/);
});

const origin = process.env.API_TEST_URL;
test('live API config, model regression, custom populations, validation, isolation, CORS and packaged frontend', { skip: !origin }, async () => {
  const api = createApi({ baseUrl: `${origin}/api` });
  assert.equal((await api.getHealth()).status, 'ok');
  const config = await api.getConfig();
  for (const field of Object.keys(INPUT_RULES)) {
    assert.equal(config.inputs[field].min, INPUT_RULES[field].min); assert.equal(config.inputs[field].max, INPUT_RULES[field].max);
  }
  const original = await api.requestSimulation({ ...input, evRebate: 0 });
  assert.ok(Math.abs(original.gasPct - 87.36542287082048) < 1e-9);
  const scenarios = [
    { ...input, baseGasShare: 0.6, baseEvShare: 0.2, baseNoCarShare: 0.2, gasTax: 0, evRebate: 0 },
    { ...input, baseGasShare: 0.3, baseEvShare: 0.3, baseNoCarShare: 0.4, gasTax: 0, evRebate: 0 }
  ];
  const outputs = await Promise.all([...scenarios, ...scenarios].map(value => api.requestSimulation(value)));
  outputs.forEach((value, index) => {
    const expected = scenarios[index % 2];
    assert.ok(Math.abs(value.gasPct - expected.baseGasShare * 100) < 1e-8);
    assert.ok(Math.abs(value.evPct - expected.baseEvShare * 100) < 1e-8);
    assert.ok(Math.abs(value.noCarPct - expected.baseNoCarShare * 100) < 1e-8);
  });
  const send = (body, type = 'application/json') => fetch(`${origin}/api/simulate`, {
    method: 'POST', headers: type ? { 'Content-Type': type } : {}, body: new TextEncoder().encode(body)
  });
  const invalid = [
    ['', 'body'], ['{', 'body'], ['null', 'body'], ['[]', 'body'], ['{}', 'gasTax'],
    [JSON.stringify({ ...input, gasTax: -1 }), 'gasTax'], [JSON.stringify({ ...input, gasTax: 11 }), 'gasTax'],
    [JSON.stringify({ ...input, evRebate: 20001 }), 'evRebate'], [JSON.stringify({ ...input, transitFare: 16 }), 'transitFare'],
    [JSON.stringify({ ...input, baseGasShare: 0 }), 'baseGasShare'],
    [JSON.stringify({ ...input, baseEvShare: -0.1 }), 'baseEvShare'],
    [JSON.stringify({ ...input, baseNoCarShare: 0.1 }), 'body'],
    [JSON.stringify({ ...input, gasTax: '1' }), 'gasTax'], [JSON.stringify({ ...input, gasTax: null }), 'gasTax'],
    [JSON.stringify({ ...input, seed: 42 }), 'body'],
    [JSON.stringify(input).replace('"gasTax":1', '"gasTax":1e400'), 'gasTax'],
    [JSON.stringify(input).replace('"gasTax":1', '"gasTax":1,"gasTax":2'), 'gasTax']
  ];
  for (const [body, key] of invalid) {
    const response = await send(body); assert.equal(response.status, 400, body);
    assert.match(response.headers.get('Content-Type'), /application\/problem\+json/);
    assert.ok((await response.json()).errors[key], key);
  }
  for (const type of [null, 'text/plain']) assert.equal((await send(JSON.stringify(input), type)).status, 400);
  assert.equal((await send('x'.repeat(17000))).status, 413);
  assert.equal((await fetch(`${origin}/api/simulation`)).status, 404);
  const method = await fetch(`${origin}/api/simulate`); assert.equal(method.status, 405); assert.match(method.headers.get('Allow'), /POST/);
  for (const allowed of [true, false]) {
    const response = await fetch(`${origin}/api/simulate`, { method: 'OPTIONS', headers: {
      Origin: allowed ? 'http://localhost:5173' : 'http://untrusted.example',
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'
    } });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed ? 'http://localhost:5173' : null);
  }
  const html = await (await fetch(origin)).text(); assert.match(html, /type="module"/); assert.doesNotMatch(html, /Preview data/);
  for (const path of ['/app.js', '/api.js', '/styles.css']) assert.equal((await fetch(`${origin}${path}`)).status, 200);
});
