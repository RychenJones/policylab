# API Functions and Failure Handling Draft

Status: proposed API interfaces aligned with the current simulator, not an implementation. Complements [API_DRAFT.md](API_DRAFT.md). The wrapper contracts below are proposed; current model functions are `Simulator.Simulate(double gasTax, double evRebate, double transitFare)` and `Simulator.PolicyEffect(double gasTax, double evRebate, double transitFare)`, both returning `Result(GasPct, EvPct, OtherPct)` synchronously.

Frontend language decision: use plain JavaScript. React remains optional; it does not change the language choice. TypeScript declarations below are retained only as draft contract notation, not implementation requirements. Implement frontend functions in JavaScript, with optional JSDoc for documentation. C# examples assume, but do not mandate, the proposed backend language. The wire contracts and error/cancellation rules apply regardless of implementation language.

## Frontend contracts

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
    double BaseGasPriceUsdPerGallon, int HorizonYears,
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
    SimulationRequest AppliedPolicy, int HorizonYears,
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
| 400 | `invalid_request` or `validation_failed` | Malformed JSON, missing fields, unknown fields, invalid types/ranges. Display field errors when present; preserve inputs. |
| 401 | `authentication_required` | If authentication is introduced, request sign-in; do not loop retries. Preserve any authentication challenge header. |
| 403 | `forbidden` | Access denied; display an access message. |
| 404 | `not_found` | Missing route/resource. An unavailable route can indicate a deployment mismatch. |
| 405 | `method_not_allowed` | Route does not support the method; preserve `Allow`. Check QUERY routing/proxy configuration. |
| 406 | `not_acceptable` | Requested response format unsupported. Client normally requests JSON. |
| 408 | `request_timeout` | HTTP request receipt timeout; distinguish from local timeout and computation deadline. |
| 409 | `conflict` | Future write conflicts with existing state. Ask user to reconcile; do not repeat blindly. |
| 413 | `payload_too_large` | Request exceeds configured body limit. Show a size-limit message. |
| 415 | `unsupported_media_type` | Missing/unsupported body content type under this API's JSON policy. |
| 422 | `unsupported_scenario` | Reserved for a future explicit model constraint. The current model has no such rejection; extrapolation warnings remain successful responses. |
| 429 | `rate_limited` | Too many requests; respect `Retry-After` when supplied. |
| 500 | `internal_error` or `simulation_numerical_failure` | Unexpected failure or invalid numerical output. Display a safe message and trace ID if available. |
| 501 | `method_not_implemented` | An intermediary/server does not implement QUERY; check deployment support. |
| 502 | `upstream_failure` | Gateway or required dependency returned an invalid response. |
| 503 | `service_unavailable` | Temporary overload, unavailable dependency, or shutdown; respect `Retry-After`. |
| 504 | `execution_timeout` | Configured server computation deadline or gateway timeout. Offer a manual retry. |

These codes describe responses we control. Proxies can return different codes, plain text, HTML, or no body. An HTTP failure stays `kind: "http"` even when its body cannot be parsed: synthesize a safe generic problem using the actual HTTP status. Do not display raw HTML or untrusted server body text.

Use the actual HTTP response status for classification, even if a problem body's `status` disagrees. Application `code` is for stable branching; never branch on human-readable `title` or `detail`. Use a generic fallback when `code` is absent or unknown.

Example 400 body:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "validation_failed",
  "errors": {
    "gasTaxUsdPerGallon": ["Gas tax adjustment must keep the resulting gas price positive."]
  },
  "traceId": "server-generated-correlation-id"
}
```

## Cancellation and timeout behavior

| Event | Frontend outcome | Backend behavior |
| --- | --- | --- |
| Signal already aborted | `cancelled`; do not send | No request expected. |
| User cancels or component unmounts | `cancelled`; no error toast | Adapter can stop between model calls; an active model call continues. |
| A newer scenario supersedes an older request | Cancel old request; only newest request may update the UI | Same cancellation limit; no guarantee that old computation stops immediately. |
| Local deadline expires | `timeout`; preserve inputs and allow retry | May observe disconnection; stopping is not guaranteed to be immediate. |
| Server deadline expires, if configured | HTTP 504 if response can still be written | Track the deadline separately; current model cannot be interrupted mid-call or guarantee prompt timeout completion. |
| Connection disappears | `network` unless a known local abort caused it | Adapter observes signaled token between calls; a response may be impossible. |

Combine caller cancellation and a local deadline without losing the cause. Record the first observed terminal outcome; do not relabel an already received HTTP failure because a timer fires later. Apply the deadline through response-body consumption, then clear timers and remove listeners on every completion path.

Catch cancellation only when an associated cancellation token is actually signaled. Track server deadlines separately from client disconnects so cancellation is not mistakenly converted to 500 or always called a timeout. ASP.NET Core timeout middleware can also signal `RequestAborted`; coordinate exception handling with the chosen middleware.

Do not require a JSON cancellation response, invent a public 499 response, or add a cancellation endpoint for this synchronous API. If headers/body have started, the backend may be unable to replace the response with a problem document.

Browser abort is not rollback. Future writes may finish after cancellation or a network failure; their outcome is unknown until reconciled with the server. A cancelled QUERY must not save a scenario or create a persistent job.

Frontend state transitions: `idle → loading → success | error | cancelled`. Use an active request ID in addition to aborting to guard stale completions, including clearing the loading state. Keep the last successful result visible and labeled as belonging to its original inputs until the new request succeeds.

## Client response parsing and retries

- Inspect HTTP status explicitly; receiving a non-2xx response is not a fetch network rejection.
- For successful endpoints above, require valid JSON matching the expected shape. Empty bodies, unexpected 204 responses, malformed JSON, or missing required fields become `invalidResponse`.
- Future endpoints explicitly returning 204 should use `ApiResult<void>` and skip JSON parsing.
- Treat body-read connection failures as network failures; treat explicit local cancellation/deadlines according to their recorded cause. A JSON syntax/schema failure is an invalid response.
- A browser-level failure cannot reliably distinguish offline status, DNS, TLS, and blocked CORS. Show a general connectivity message; investigate browser/server logs.
- Start with manual retries only. If automatic retries are added, restrict them to safe GET/QUERY operations, use bounded attempts/backoff, honor cancellation and valid `Retry-After`, and do not retry validation, permission, cancellation, or schema failures.
- Parse `Retry-After` as seconds or an HTTP date; ignore malformed values. Expose it across origins if the UI reads it. Expose `Location` too if future creation flows need it.
- Send `Accept: application/json, application/problem+json`. Use `Cache-Control: no-store` for initial simulation responses until deliberate caching is designed.

## Optional saved scenario interfaces

Only implement if persistence is requested. No client-supplied result is authoritative; the backend computes or verifies the saved result.

```ts
export interface SaveScenarioRequest {
  name: string;
  policy: SimulationRequest;
}
export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  result: SimulationResponse;
}
export interface PageRequest { page?: number; pageSize?: number }
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}
export interface SavedScenarioApi {
  saveScenario(request: SaveScenarioRequest,
    options?: RequestOptions): Promise<ApiResult<SavedScenario>>;
  getScenario(id: string,
    options?: RequestOptions): Promise<ApiResult<SavedScenario>>;
  listScenarios(page?: PageRequest,
    options?: RequestOptions): Promise<ApiResult<Page<SavedScenario>>>;
}
```

Backend counterparts: `SaveScenarioAsync(SaveScenarioRequest, CancellationToken)`, `GetScenarioAsync(string id, CancellationToken)`, and `ListScenariosAsync(int page, int pageSize, CancellationToken)`, returning `Task<ActionResult<...>>` with matching DTOs. Use POST `/api/scenarios` (201), GET `/api/scenarios/{id}` (200/404), and GET `/api/scenarios` (200). Validate names and enforce any ownership rules on the server. Pagination defaults: page 1, size 20, maximum 100; reject invalid values with 400 and use stable ordering.

Saved-scenario contracts above remain future proposals, not outputs supported by the simulator. Household search is outside the current aggregate model. No update/delete/job endpoints are needed for the current MVP.

## Verification when implementation starts

Check matching wire formats and three required numeric fields; negative gas adjustments on either side of the exclusive gas-price bound; zero fare/rebate; extrapolation warning above 5 but not at 5; finite result shares and percentage-point differences; HTTP errors with JSON/HTML/empty bodies; malformed success bodies; cancellation before send and during body reads; stale request races; and QUERY through the deployed browser/proxy path. Verify adapter cancellation between calls without claiming mid-call interruption. Check safe failures for numerical overflow and unexpected exceptions. Timeout durations remain an API policy decision, not a model capability.

## References

- [HTTP QUERY semantics](https://www.rfc-editor.org/rfc/rfc10008.html)
- [Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Browser AbortSignal behavior](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
- [ASP.NET Core request timeout behavior](https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0)
