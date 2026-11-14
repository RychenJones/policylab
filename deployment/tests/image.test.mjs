import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = process.env.API_TEST_URL;
assert.ok(origin, 'Set API_TEST_URL explicitly to the running production image');

test('production image serves the published frontend and current simulation contract', async () => {
  for (const [route, file, type] of [
    ['/', 'index.html', /text\/html/],
    ['/app.js', 'app.js', /javascript/],
    ['/api.js', 'api.js', /javascript/],
    ['/styles.css', 'styles.css', /text\/css/],
  ]) {
    const response = await fetch(new URL(route, origin));
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), type);
    const expected = await readFile(new URL(`../../frontend/${file}`, import.meta.url), 'utf8');
    assert.equal(await response.text(), expected, `${route} matches the source asset`);
  }
  const health = await fetch(new URL('/api/health', origin));
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const response = await fetch(new URL('/api/simulate', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseGasShare: 0.88592, baseEvShare: 0.01808,
      baseNoCarShare: 0.096, gasTax: 1, evRebate: 7500, transitFare: 1.75, simulatedYears: 5 }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.years.length, 5);
  for (const [index, snapshot] of result.years.entries()) {
    assert.equal(snapshot.year, index + 1);
    for (const field of ['gasPct', 'evPct', 'noCarPct']) {
      assert.ok(Number.isFinite(snapshot[field]) && snapshot[field] >= 0 && snapshot[field] <= 100);
    }
    assert.ok(Math.abs(snapshot.gasPct + snapshot.evPct + snapshot.noCarPct - 100) < 1e-6);
  }
  for (const field of ['gasPct', 'evPct', 'noCarPct']) assert.equal(result[field], result.years.at(-1)[field]);
});
