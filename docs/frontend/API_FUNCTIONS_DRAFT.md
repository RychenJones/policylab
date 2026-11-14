# API Functions and Failure Handling Draft

Minimum transport implementation and rebuild reference. [API_DRAFT.md](API_DRAFT.md) defines the full target wire contract. Plain JavaScript is selected. Backend and UI integration are pending; the client is independently testable and is not imported by the existing app yet.

## Exported interface

| Function | Success | Request |
| --- | --- | --- |
| `getHealth(options?)` | Health object | GET `/api/health` |
| `getConfig(options?)` | Config object | GET `/api/config` |
| `runSimulation(policy, options?)` | Simulation object | POST `/api/simulate` |

Success returns parsed JSON unchanged. Failure throws `ApiError extends Error` with `status`, `message`, and optional `code`, `fieldErrors`, and `formError`. There is no `ApiResult`/`ok` envelope. `options` currently accepts only `{ signal }`; there is no automatic timeout or retry.

Default functions use `/api`. `createApi({ baseUrl, fetchImpl })` creates an instance for alternate hosting or tests. Passing dependencies explicitly keeps the transport independent of a framework, global configuration script, server process, or UI layout.

```js
import { ApiError, runSimulation } from './api.js';

// The frontend owner supplies renderResults and showError when wiring the form.
try {
  const result = await runSimulation({
    gasTaxChangeUsdPerGallon: 1,
    evRebateUsd: 7500,
    publicTransitFareUsdPerRide: 2.5
  });
  renderResults(result);
} catch (error) {
  if (error instanceof ApiError) showError(error.message, error.fieldErrors, error.formError);
  else throw error;
}
```

## Failure rules

| Failure | Representation | UI obligation when integrated |
| --- | --- | --- |
| HTTP validation | Actual status; known request keys in `fieldErrors`, other error keys joined in `formError` | Display inline/form messages and preserve inputs. |
| Other HTTP failure | Actual status, safe status message, optional server code | Preserve previous results; never show raw response HTML/text. |
| Network failure | Status 0, code `network_error` | Connectivity message and manual retry. |
| Caller cancellation | Status 0, code `cancelled` | No failure toast; honor reset/navigation state. |
| Invalid success JSON or missing core containers | Actual 2xx status, code `invalid_response` | Do not render as a successful simulation. |

Check status explicitly; fetch does not reject merely because HTTP status is an error. Empty/malformed/non-JSON error bodies remain HTTP failures. Actual HTTP status overrides body status. Copy only correctly typed field-error messages; unknown field keys never become DOM selectors. Programming exceptions propagate rather than being treated as ordinary HTTP failures.

POST serializes only the three documented policy keys; it performs no simulation and no policy range validation. Server validation remains authoritative, and frontend validation belongs to the form owner. Do not silently fill missing request fields with zero.

## Deliberate minimum limits

Successful health requires `status: 'ok'`; config requires object containers `inputs` and `statusQuoPolicy`; simulation requires object containers `policy`, `baseline`, `proposed`, and `changes`. This is a basic envelope check, not full schema validation or numerical correctness verification. Detailed response types and conservation/rounding rules remain in the API draft for the backend and later contract checks.

The client passes caller AbortSignal through fetch and body reading, recognizes already-aborted signals, and distinguishes aborts from network failures. It creates no controller/timer of its own. Automatic deadlines, composed abort causes, deep response validation, config caching/fallback exports, trace metadata, and fixture-specific behavior are deferred. The previous implementations are saved in the local deferred-source draft, not required by this commit.

When UI wiring resumes, track a request ID, ignore stale success/error/finally callbacks, preserve previous results with their applied inputs, and recover readiness after reset or cached navigation. These are application responsibilities, not features currently implemented in the restored frontend.

## Verification

Run with Node 24 or newer from the repo root, without npm install or a backend:

```powershell
node --test frontend/tests/api.test.js
```

Tests cover POST route/key filtering, GET paths, field/form error mapping, malformed HTTP failures, invalid success envelopes, caller abort before sending and during body reading, network failures, and programming exceptions. Later integration must verify the full response schema, form mapping, stale requests, CORS, model behavior, and browser flow against the real backend.
