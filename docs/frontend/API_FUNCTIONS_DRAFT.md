# API Functions and Failure Handling Draft

Minimum transport implementation and rebuild reference. [API_DRAFT.md](API_DRAFT.md) defines the full target wire contract. Plain JavaScript is selected. Backend and UI integration are pending; the client is independently testable and is not imported by the existing app yet.

## Exported interface

## Frontend contracts

For wiring to the current plain JavaScript page, follow [Frontend API Integration Draft](FRONTEND_INTEGRATION_DRAFT.md). Retain the form/DOM coordination points and adapt the result renderers; replace the local mock simulation call with the API client. Do not reproduce mock household/cost/emissions/income fields in the API or treat fixtures as model evidence. No frontend framework migration is needed.

These TypeScript declarations describe the shared JSON shapes and the client interface. Numbers must be finite. TypeScript types do not validate received JSON; the client must check required response fields at runtime.

```ts
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number; // Positive finite duration; configured default if omitted.
}

export interface ApiProblem {
  type: string;       // URI reference; "about:blank" for generic problems.
  title: string;
  status: number;
  detail?: string;    // Safe explanation, not an exception dump.
  instance?: string;
  code?: string;      // Stable application code when supplied.
  errors?: Record<string, string[]>; // camelCase request-field paths.
  traceId?: string;
}

export type ApiFailure =
  | { kind: "http"; status: number; problem: ApiProblem;
      retryAfterMs?: number }
  | { kind: "network"; message: string }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "cancelled" }
  | { kind: "invalidResponse"; status: number; message: string };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

export interface HealthResponse { status: "ok" }

export interface NumericInputRule {
  defaultValue: number;
  min: number;
  minExclusive: boolean;
  max: number | null; // null: no finite upper bound defined by the model.
  unit: string;
}

export interface SimulationConfig {
  baseGasPriceUsdPerGallon: number;
  horizonYears: number;
  gasTaxWarningAbsThresholdUsdPerGallon: number;
  inputs: {
    gasTaxUsdPerGallon: NumericInputRule;
    evRebateUsd: NumericInputRule;
    publicTransitFareUsdPerRide: NumericInputRule;
  };
  assumptions: string[];
}

export interface SimulationRequest {
  gasTaxUsdPerGallon: number;
  evRebateUsd: number;
  publicTransitFareUsdPerRide: number;
}

export interface TravelShares {
  gasPct: number;
  evPct: number;
  otherPct: number; // Transit plus other non-driving travel.
}

export interface PercentagePointChanges {
  gasPct: number; // Same keys as Result; values are signed percentage points.
  evPct: number;
  otherPct: number;
}

export interface SimulationWarning {
  code: "gas_tax_extrapolation";
  field: "gasTaxUsdPerGallon";
  message: string;
}

export interface SimulationResponse {
  appliedPolicy: SimulationRequest;
  horizonYears: number;
  baseline: TravelShares;
  policy: TravelShares;
  changePercentagePoints: PercentagePointChanges;
  warnings: SimulationWarning[];
}

export interface SimulationApi {
  getHealth(options?: RequestOptions): Promise<ApiResult<HealthResponse>>;
  getSimulationConfig(options?: RequestOptions): Promise<ApiResult<SimulationConfig>>;
  runSimulation(request: SimulationRequest,
    options?: RequestOptions): Promise<ApiResult<SimulationResponse>>;
}
```

Expected transport failures resolve to `ApiResult` failures rather than rejecting the promise. Unexpected programming errors may still throw and belong in the application's error boundary/logging. Do not treat every caught exception as a network failure.

Success values are unwrapped endpoint bodies, without an additional server-side `ok` envelope. `ApiResult` exists only in the frontend client.

## Model mapping and limits

| Request field | Existing simulator argument | Backend validation | No-policy default |
| --- | --- | --- | --- |
| `gasTaxUsdPerGallon` | `gasTax` | Finite; `Cfg.BaseGasPrice + value > 0`. Negative adjustments allowed. | 0 |
| `evRebateUsd` | `evRebate` | Finite and nonnegative. | 0 |
| `publicTransitFareUsdPerRide` | `transitFare` | Finite and nonnegative; total fare, not a change. | `Cfg.BaseFare`, currently 1.75 |

Configuration rules: gas-tax `min = -Cfg.BaseGasPrice` (currently -3.10), `minExclusive = true`; rebate and fare minima are 0 with `minExclusive = false`. All maxima are null because the model sets no finite upper bounds. Base gas price is currently 3.10, horizon is 5 years, and warning threshold is 5.0. Read these from the model configuration; they are not client-supplied overrides. UI steps and practical caps are not yet model requirements.

`baseline` is `Simulate(0, 0, Cfg.BaseFare)` and `policy` is the requested simulation. Subtract policy minus baseline once to obtain `changePercentagePoints`, equivalent to `PolicyEffect`; avoid recomputing both simulations merely to obtain the difference. This is a same-horizon comparison, not a comparison to the initial state. The baseline may evolve despite no policy change.

Absolute results contain three mutually exclusive aggregate shares totaling approximately 100; changes total approximately zero. Validate finite values and ranges using a documented floating-point tolerance; do not clamp or round intermediate results to hide invalid output. Format percentages and percentage-point changes distinctly in the UI.

The proposed wrapper adds structured `warnings` when `Math.Abs(gasTax) > Simulator.CalibratedGasTaxWarningThreshold`. The existing model only writes this warning to stderr. Extrapolation is still a 200 response, never a validation failure solely for exceeding the warning threshold. Exactly ±5 does not trigger the warning, though the negative value already fails current gas-price validation.

No seed, household count, income breakdowns, cost-change metric, emissions metric, model version, or annual result series is returned by the current model. Do not fabricate these fields or convert aggregate percentages into observed household switches. `otherPct` includes both transit and other non-driving modes. Computation is deterministic for fixed inputs and configuration; Config values include placeholder assumptions. Explain these limits through config `assumptions`.

If extreme but finite inputs cause non-finite or otherwise invalid results, the proposed adapter returns 500 with `code: "simulation_numerical_failure"` and a safe message. Log details server-side. The current model does not provide practical upper bounds or a distinct unsupported-scenario rejection.

## Backend contracts

Proposed C# records mirror the JSON above. Configure camelCase serialization and use `double` to match the simulation inputs and outputs; these values describe a numerical model, not financial transactions. All three input fields are required. Proposed API-boundary rules reject unknown properties, missing fields, invalid JSON types, and the model validation failures above with 400. These boundary rules are not currently supplied by `Simulator` itself.

```csharp
using Microsoft.AspNetCore.Mvc;

public sealed record HealthResponse(string Status);
public sealed record NumericInputRule(
    double DefaultValue, double Min, bool MinExclusive,
    double? Max, string Unit);
public sealed record PolicyInputRules(
    NumericInputRule GasTaxUsdPerGallon,
    NumericInputRule EvRebateUsd,
    NumericInputRule PublicTransitFareUsdPerRide);
public sealed record SimulationConfig(
    double BaseGasPriceUsdPerGallon, int SimulatedYears,
    double GasTaxWarningAbsThresholdUsdPerGallon,
    PolicyInputRules Inputs, IReadOnlyList<string> Assumptions);

public sealed record SimulationRequest
{
    public required double GasTaxUsdPerGallon { get; init; }
    public required double EvRebateUsd { get; init; }
    public required double PublicTransitFareUsdPerRide { get; init; }
}

public sealed record TravelShares(double GasPct, double EvPct, double OtherPct);
public sealed record PercentagePointChanges(
    double GasPct, double EvPct, double OtherPct);
public sealed record SimulationWarning(string Code, string Field, string Message);
public sealed record SimulationResponse(
    SimulationRequest AppliedPolicy, int SimulatedYears,
    TravelShares Baseline, TravelShares Policy,
    PercentagePointChanges ChangePercentagePoints,
    IReadOnlyList<SimulationWarning> Warnings);

// Proposed endpoint signatures; routing and implementations come later.
public interface ISimulationEndpoints
{
    ActionResult<HealthResponse> GetHealth();
    ActionResult<SimulationConfig> GetConfig();
    ActionResult<SimulationResponse> RunSimulation(
        SimulationRequest request, CancellationToken cancellationToken);
}

// Services return domain data, never HTTP responses or ProblemDetails.
public interface ISimulationService
{
    SimulationConfig GetConfig();
    SimulationResponse Run(
        SimulationRequest request, CancellationToken cancellationToken);
}
```

The proposed adapter token comes from the HTTP request; check it before and between baseline/policy calls and before returning. Current `Simulator.Simulate` accepts no token and cannot be interrupted during a call. These synchronous signatures reflect the current CPU-only model; do not add Task.Run or claim cooperative in-loop cancellation. If the model later accepts a token, propagate it and add cancellation checks within its year loop.

Map the known policy validation failures at the API boundary to camelCase request fields and 400. If model argument exceptions are mapped defensively, restrict mapping to known input errors from the simulator; do not turn every ArgumentException into a client error.

Use ASP.NET Core `ProblemDetails` / `ValidationProblemDetails` for failures, with `code` and `traceId` extensions. Centralize exception mapping and framework-generated error formatting, including model binding, unsupported media types, and unmatched routes. Do not return exception messages or stack traces to the browser.

## Endpoint outcomes

| Function | Method and route | Success | Expected failures |
| --- | --- | --- | --- |
| `getHealth` / `GetHealth` | GET `/api/health` | 200, `HealthResponse` | Infrastructure failures; liveness does not imply database readiness. |
| `getSimulationConfig` / `GetConfig` | GET `/api/simulation/config` | 200, `SimulationConfig` | 500, 503. |
| `runSimulation` / `RunSimulation` | QUERY `/api/simulation` | 200, `SimulationResponse`, possibly with warnings | 400/415 at the boundary; 500 for unexpected/numerical failure. Infrastructure may also return 413, 429, 503, 504. |

Any endpoint can encounter infrastructure rejection or unexpected HTTP responses. The client must accept arbitrary non-2xx status codes as HTTP failures, including codes not listed here.

## Rejection and error policy

| Status | Proposed application code | Meaning and frontend action |
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
