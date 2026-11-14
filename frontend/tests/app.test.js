import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ApiError, sanitizeRequest } from '../api.js';

class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.hidden = false; this.textContent = ''; this.events = {}; this.labels = [{ textContent: id }]; this.attributes = {}; this.children = []; this.classList = { toggle() {} }; }
  get value() { return this._value; } set value(value) { this._value = String(value); }
  get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
  addEventListener(event, handler) { this.events[event] = handler; }
  querySelector() { return this.child ??= new Element(); }
  setCustomValidity(value) { this.validationMessage = value; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  fire(event) { return this.events[event]?.({ preventDefault() {} }); }
}
const defaults = { baseGasShare: 0.88592, baseEvShare: 0.01808, baseNoCarShare: 0.096, gasTax: 1, evRebate: 7500, transitFare: 1.75 };
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '').replace('export async function requestSimulation', 'async function requestSimulation');
async function page() {
  const elements = new Map(), calls = [], events = {};
  const get = selector => { if (!elements.has(selector)) elements.set(selector, new Element(selector)); return elements.get(selector); };
  const resultElements = [get('#headline'), get('#chart-card'), get('#metrics')];
  resultElements.forEach(element => { element.hidden = true; });
  const document = { querySelector: get, querySelectorAll: () => resultElements, createElement: () => new Element() };
  vm.runInNewContext(source, { document, console, Intl, AbortController, ApiError, sanitizeRequest,
    window: { addEventListener(event, handler) { events[event] = handler; } },
    getConfig: async () => ({ defaults, inputs: Object.fromEntries(Object.keys(defaults).map(key => [key, { min: 0, max: 100 }])), simulatedYears: 5 }),
    sendSimulation: (request, options) => new Promise((resolve, reject) => calls.push({ request, options, resolve, reject })) });
  await new Promise(resolve => setImmediate(resolve));
  return { get, calls, events, resultElements, submit: () => get('#simulation-form').fire('submit') };
}

test('modern form defaults total 100%; empty and zero-share inputs never call the API', async () => {
  const p = await page(); assert.equal(p.get('#base-no-car').value, '9.6');
  assert.equal(Number(p.get('#base-gas').value) + Number(p.get('#base-ev').value) + Number(p.get('#base-no-car').value), 100);
  p.get('#ev-rebate').value = ''; await p.submit(); assert.equal(p.calls.length, 0);
  p.get('#reset-button').fire('click'); p.get('#base-ev').value = '0'; await p.submit(); assert.equal(p.calls.length, 0);
});

test('requestSimulation receives fractions and renders only the returned percentages', async () => {
  const p = await page(); const pending = p.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls[0].request)), defaults);
  p.calls[0].resolve({ gasPct: 80, evPct: 10, noCarPct: 10 }); await pending;
  assert.match(p.get('#result-status').textContent, /Simulation complete/);
  assert.equal(p.get('#results-table-body').children.length, 3);
  assert.ok(p.resultElements.every(element => !element.hidden));
});

test('reset aborts pending work and stale success/finally cannot overwrite ready state', async () => {
  const p = await page(); const pending = p.submit(); p.get('#reset-button').fire('click');
  assert.equal(p.calls[0].options.signal.aborted, true);
  p.calls[0].resolve({ gasPct: 80, evPct: 10, noCarPct: 10 }); await pending;
  assert.ok(p.resultElements.every(element => element.hidden)); assert.match(p.get('#result-status').textContent, /^Ready/);
  assert.equal(p.get('#run-button').disabled, false);
});

test('cached navigation recovers readiness and server errors map to modern fields', async () => {
  const p = await page(); const pending = p.submit();
  p.calls[0].reject(new ApiError(400, 'Invalid', { fieldErrors: { baseGasShare: ['Invalid fraction.'] } })); await pending;
  assert.equal(p.get('#base-gas').attributes['aria-invalid'], 'true');
  const next = p.submit(); p.events.pagehide(); p.calls[1].reject(new ApiError(0, 'Cancelled', { code: 'cancelled' })); await next;
  p.events.pageshow({ persisted: true }); assert.equal(p.get('#run-button').disabled, false);
});
