import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ApiError, INPUT_RULES, sanitizeRequest } from '../api.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '').replace('export async function requestSimulation', 'async function requestSimulation');
const defaults = { baseGasShare: 0.88592, baseEvShare: 0.01808, baseNoCarShare: 0.096, gasTax: 1, evRebate: 7500, transitFare: 1.75 };
const output = { gasPct: 80, evPct: 10, noCarPct: 10 };
const flush = () => new Promise(resolve => setImmediate(resolve));
const attribute = (text, key) => text.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];

class Element {
  constructor(tag = 'div', attributes = '') {
    this.tag = tag; this.id = attribute(attributes, 'id') ?? ''; this.value = attribute(attributes, 'value') ?? '';
    this.min = attribute(attributes, 'min') ?? ''; this.max = attribute(attributes, 'max') ?? '';
    this.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attributes); this.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attributes);
    this.textContent = ''; this.events = {}; this.labels = []; this.attributes = {}; this.children = []; this.dataset = {};
    this.classes = new Set((attribute(attributes, 'class') ?? '').split(/\s+/));
    this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  }
  get value() { return this._value; } set value(value) { this._value = String(value); }
  get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
  addEventListener(event, handler) { this.events[event] = handler; }
  querySelector(selector) { assert.equal(selector, 'span'); return this.span ??= new Element('span'); }
  setCustomValidity(value) { this.validationMessage = value; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  fire(event) { return this.events[event]?.({ preventDefault() {} }); }
  requestSubmit() { return this.fire('submit'); }
}

// Build controls from real HTML. Missing selectors return null instead of quietly
// inventing nodes, so a future markup replacement cannot pass these tests by accident.
async function page({ configFailures = 0, chartAvailable = false } = {}) {
  const elements = new Map(), all = [], calls = [], events = {}, charts = [];
  for (const [, tag, attributes] of html.matchAll(/<([a-z][\w-]*)\b([^<>]*)>/gi)) {
    const element = new Element(tag, attributes); all.push(element);
    if (element.id) { assert.equal(elements.has(element.id), false, `Duplicate HTML id ${element.id}`); elements.set(element.id, element); }
  }
  for (const [, id, label] of html.matchAll(/<label\b[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi))
    elements.get(id).labels = [{ textContent: label.replace(/<[^>]+>/g, '').trim() }];
  const get = selector => selector.startsWith('#') ? elements.get(selector.slice(1)) ?? null
    : selector.startsWith('.') ? all.find(element => element.classes.has(selector.slice(1))) ?? null : null;
  const document = { querySelector: get, createElement: tag => new Element(tag) };
  let configCalls = 0;
  class Chart {
    constructor(_canvas, options) { this.data = options.data; this.resizeCount = 0; this.updateCount = 0; charts.push(this); }
    resize() { assert.equal(get('#results-content').hidden, false, 'Chart resized while hidden'); this.resizeCount++; }
    update() { assert.equal(get('#results-content').hidden, false, 'Chart updated while hidden'); this.updateCount++; }
  }
  const config = { defaults, simulatedYears: 5, inputs: Object.fromEntries(Object.entries(INPUT_RULES).map(([key, rule]) => [key, { ...rule, step: 0.001 }])) };
  vm.runInNewContext(source, {
    document, console, Intl, AbortController, ApiError, sanitizeRequest, ...(chartAvailable ? { Chart } : {}),
    window: { addEventListener(event, handler) { events[event] = handler; } },
    getConfig: async () => { configCalls++; if (configFailures-- > 0) throw new ApiError(0, 'backend unavailable', { code: 'network_error' }); return config; },
    sendSimulation: (request, options) => new Promise((resolve, reject) => calls.push({ request, options, resolve, reject }))
  });
  await flush();
  // The production form intentionally leaves the horizon blank; provide a value
  // here so the existing interaction tests can exercise successful submissions.
  get('#simulated-years').value = '5';
  return { get, calls, events, charts, configCalls: () => configCalls, submit: () => get('#simulation-form').fire('submit') };
}

test('real markup has every app selector, module loading, and the short friendly percentage hint', async () => {
  const p = await page();
  for (const [, selector] of source.matchAll(/document\.querySelector\('([^']+)'\)/g)) assert.ok(p.get(selector), `Missing ${selector}`);
  assert.match(html, /<script type="module" src="app.js"><\/script>/);
  assert.match(html, /These values must add up to 100%\./);
  assert.doesNotMatch(html, /\b(?:backend|calibration|API|JSON)\b/i);
  assert.equal(p.get('#empty-state').hidden, false); assert.equal(p.get('#results-content').hidden, true);
  assert.equal(p.get('#run-button').disabled, false);
});

test('blank, zero-share, and incorrect-total inputs show user units and send nothing', async () => {
  const p = await page();
  assert.equal(Number(p.get('#base-gas').value) + Number(p.get('#base-ev').value) + Number(p.get('#base-no-car').value), 100);
  p.get('#ev-rebate').value = ''; await p.submit(); assert.equal(p.calls.length, 0);
  assert.match(p.get('#form-error').textContent, /Enter a number for ev rebate/i);
  p.get('#reset-button').fire('click'); p.get('#base-ev').value = '0'; await p.submit();
  assert.match(p.get('#form-error').textContent, /0\.001%/); assert.doesNotMatch(p.get('#form-error').textContent, /finite|JSON|fraction|calibrat/i);
  p.get('#reset-button').fire('click'); p.get('#base-gas').value = '90'; await p.submit();
  assert.match(p.get('#form-error').textContent, /add up to 100%/); assert.equal(p.calls.length, 0);
});

test('real form converts seven values and reveals the result before Chart.js measures it', async () => {
  const p = await page({ chartAvailable: true }); const pending = p.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls[0].request)), { ...defaults, simulatedYears: 5 });
  assert.equal(p.get('#loading-state').hidden, false); assert.equal(p.get('#results-panel').attributes['aria-busy'], 'true');
  p.calls[0].resolve(output); await pending;
  assert.equal(p.get('#results-content').hidden, false); assert.equal(p.get('#loading-state').hidden, true);
  assert.equal(p.get('#error-state').hidden, true); assert.equal(p.get('#results-panel').attributes['aria-busy'], 'false');
  assert.equal(p.get('#result-status').textContent, 'Simulation complete · 5-year estimate');
  assert.equal(p.get('#results-table-body').children.length, 3); assert.equal(p.charts[0].resizeCount, 1); assert.equal(p.charts[0].updateCount, 1);
});

test('table fallback works without Chart.js and invalid failures never display technical messages', async () => {
  const p = await page(); assert.equal(p.get('.chart-wrap').hidden, true);
  const pending = p.submit(); p.calls[0].reject(new ApiError(200, 'Invalid server JSON configuration', { code: 'invalid_response' })); await pending;
  assert.equal(p.get('#results-content').hidden, true); assert.equal(p.get('#error-state').hidden, false);
  assert.doesNotMatch(p.get('#form-error').textContent, /server|JSON|configuration|backend|API/i);
});

test('error-panel Try again retries a failed simulation and clears the error on success', async () => {
  const p = await page(); const first = p.submit();
  p.calls[0].reject(new ApiError(0, 'backend unavailable', { code: 'network_error' })); await first;
  assert.equal(p.get('#error-state').hidden, false);
  const retry = p.get('#retry-button').fire('click'); assert.equal(p.calls.length, 2);
  p.calls[1].resolve(output); await retry;
  assert.equal(p.get('#error-state').hidden, true); assert.equal(p.get('#form-error').hidden, true);
  assert.equal(p.get('#results-content').hidden, false);
});

test('error-panel Try again reloads missing config rather than submitting without it', async () => {
  const p = await page({ configFailures: 1 });
  assert.equal(p.get('#run-button').disabled, true); assert.equal(p.get('#error-state').hidden, false);
  assert.doesNotMatch(p.get('#error-state-detail').textContent, /backend|server|configuration|API/i);
  await p.get('#retry-button').fire('click');
  assert.equal(p.configCalls(), 2); assert.equal(p.calls.length, 0);
  assert.equal(p.get('#run-button').disabled, false); assert.equal(p.get('#error-state').hidden, true);
  assert.equal(p.get('#empty-state').hidden, false); assert.equal(p.get('#retry-connection').hidden, true);
});

test('last successful result stays visible through loading and failure with its original inputs', async () => {
  const p = await page(); const first = p.submit(); p.calls[0].resolve(output); await first;
  const snapshot = p.get('#result-inputs').textContent;
  p.get('#gas-tax').value = '2'; p.get('#gas-tax').fire('input');
  const second = p.submit(); assert.equal(p.get('#results-content').hidden, false);
  p.calls[1].reject(new ApiError(500, 'internal error')); await second;
  assert.equal(p.get('#results-content').hidden, false); assert.equal(p.get('#result-inputs').textContent, snapshot);
  assert.match(p.get('#result-status').textContent, /Showing previous result/);
});

test('reset and cached navigation clear loading; stale callbacks cannot overwrite a newer request', async () => {
  const p = await page(); const first = p.submit(); p.get('#reset-button').fire('click');
  assert.equal(p.calls[0].options.signal.aborted, true); assert.equal(p.get('#results-content').hidden, true);
  p.get('#simulated-years').value = '5';
  const second = p.submit(); p.calls[0].resolve(output); await first;
  assert.equal(p.get('#loading-state').hidden, false); assert.equal(p.get('#run-button').disabled, true);
  p.events.pagehide(); p.calls[1].reject(new ApiError(0, 'Cancelled', { code: 'cancelled' })); await second;
  p.events.pageshow({ persisted: true });
  assert.equal(p.get('#loading-state').hidden, true); assert.equal(p.get('#empty-state').hidden, false);
  assert.equal(p.get('#run-button').disabled, false); assert.equal(p.get('#results-panel').attributes['aria-busy'], 'false');
});

test('field errors use percentage labels and zero changes never render as negative zero', async () => {
  const p = await page(); const first = p.submit();
  p.calls[0].reject(new ApiError(400, 'Bad JSON', { fieldErrors: { baseGasShare: ['0.00001 fraction is required'] } })); await first;
  assert.equal(p.get('#base-gas').attributes['aria-invalid'], 'true'); assert.doesNotMatch(p.get('#form-error').textContent, /JSON|fraction/);
  const next = p.submit(); p.calls[1].resolve({ gasPct: 88.592 - 1e-12, evPct: 1.808, noCarPct: 9.6 + 1e-12 }); await next;
  assert.equal(p.get('#gas-change').textContent, '0.0 pp'); assert.equal(p.get('#gas-count').textContent, '0 estimated households');
});
