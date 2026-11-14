# API Functions and Failure Handling Draft

Status: proposed interfaces, not an implementation. Complements [API_DRAFT.md](API_DRAFT.md). Policy defaults, ranges, units, and result categories await team agreement.

Language choices are provisional. TypeScript is used here only to describe contracts; it is not a frontend requirement. Implementation must follow the languages and tools the team actually chooses, including plain JavaScript with or without React. React does not require TypeScript. Adapt these declarations to JavaScript functions, JSON examples, and optional JSDoc if appropriate. C# examples likewise assume, but do not mandate, the proposed backend language. The wire contracts and error/cancellation rules apply regardless of implementation language.

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
  max: number;
  unit: string;
}

export interface SimulationConfig {
  modelVersion: string;
  householdCount: number;
  defaultSeed: number;
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
  seed: number; // Required signed 32-bit integer for C# compatibility.
}

export interface BehaviorCount {
  category: string; // Stable machine-readable key, agreed with model owner.
  count: number;
}

export interface IncomeGroupResult {
  incomeGroup: string; // Bands and keys await agreement.
  householdCount: number;
  behaviors: BehaviorCount[];
  averageAnnualCostChangeUsd: number;
}

export interface EmissionsChange {
  value: number;
  unit: string; // Exact unit and period must be agreed before implementation.
}

export interface SimulationResponse {
  appliedPolicy: SimulationRequest;
  modelVersion: string;
  householdCount: number;
  baselineBehaviors: BehaviorCount[];
  policyBehaviors: BehaviorCount[];
  averageAnnualCostChangeUsd: number;
  emissionsChange: EmissionsChange | null; // null means not calculated.
  incomeGroups: IncomeGroupResult[];
  assumptions: string[];
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

## Backend contracts

Proposed C# records mirror the JSON above. Configure camelCase serialization; use decimal for policy money inputs. All request fields are required, including the seed. Validate numeric bounds, unknown request properties, and the configured model's constraints before computation.

```csharp
using Microsoft.AspNetCore.Mvc;

public sealed record HealthResponse(string Status);
public sealed record NumericInputRule(
    decimal DefaultValue, decimal Min, decimal Max, string Unit);
public sealed record PolicyInputRules(
    NumericInputRule GasTaxUsdPerGallon,
    NumericInputRule EvRebateUsd,
    NumericInputRule PublicTransitFareUsdPerRide);
public sealed record SimulationConfig(
    string ModelVersion, int HouseholdCount, int DefaultSeed,
    PolicyInputRules Inputs, IReadOnlyList<string> Assumptions);

public sealed record SimulationRequest
{
    public required decimal GasTaxUsdPerGallon { get; init; }
    public required decimal EvRebateUsd { get; init; }
    public required decimal PublicTransitFareUsdPerRide { get; init; }
    public required int Seed { get; init; }
}

public sealed record BehaviorCount(string Category, int Count);
public sealed record IncomeGroupResult(
    string IncomeGroup, int HouseholdCount,
    IReadOnlyList<BehaviorCount> Behaviors,
    decimal AverageAnnualCostChangeUsd);
public sealed record EmissionsChange(double Value, string Unit);
public sealed record SimulationResponse(
    SimulationRequest AppliedPolicy, string ModelVersion, int HouseholdCount,
    IReadOnlyList<BehaviorCount> BaselineBehaviors,
    IReadOnlyList<BehaviorCount> PolicyBehaviors,
    decimal AverageAnnualCostChangeUsd,
    EmissionsChange? EmissionsChange,
    IReadOnlyList<IncomeGroupResult> IncomeGroups,
    IReadOnlyList<string> Assumptions);

// Proposed endpoint signatures; routing and implementations come later.
public interface ISimulationEndpoints
{
    ActionResult<HealthResponse> GetHealth();
    ActionResult<SimulationConfig> GetConfig();
    Task<ActionResult<SimulationResponse>> RunSimulationAsync(
        SimulationRequest request, CancellationToken cancellationToken);
}

// Services return domain data, never HTTP responses or ProblemDetails.
public interface ISimulationService
{
    SimulationConfig GetConfig();
    Task<SimulationResponse> RunAsync(
        SimulationRequest request, CancellationToken cancellationToken);
}
```

The endpoint token comes from the HTTP request. Pass it into services, database operations, and external HTTP calls. CPU-bound household loops must periodically check it. A Task return type alone does not make computation asynchronous or cancellable; do not add Task.Run by default.

Use ASP.NET Core `ProblemDetails` / `ValidationProblemDetails` for failures, with `code` and `traceId` extensions. Centralize exception mapping and framework-generated error formatting, including model binding, unsupported media types, and unmatched routes. Do not return exception messages or stack traces to the browser.

## Endpoint outcomes

| Function | Method and route | Success | Expected failures |
| --- | --- | --- | --- |
| `getHealth` / `GetHealth` | GET `/api/health` | 200, `HealthResponse` | Infrastructure failures; liveness does not imply database readiness. |
| `getSimulationConfig` / `GetConfig` | GET `/api/simulation/config` | 200, `SimulationConfig` | 500, 503. |
| `runSimulation` / `RunSimulationAsync` | QUERY `/api/simulation` | 200, `SimulationResponse` | 400, 413, 415, 422, 429, 500, 503, 504. |

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
| 422 | `unsupported_scenario` | Input passes field validation but represents a combination the model cannot evaluate. Explain the constraint. |
| 429 | `rate_limited` | Too many requests; respect `Retry-After` when supplied. |
| 500 | `internal_error` | Unexpected failure. Display a generic message and trace ID if available. |
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
    "seed": ["Seed is required and must be a signed 32-bit integer."]
  },
  "traceId": "server-generated-correlation-id"
}
```

## Cancellation and timeout behavior

| Event | Frontend outcome | Backend behavior |
| --- | --- | --- |
| Signal already aborted | `cancelled`; do not send | No request expected. |
| User cancels or component unmounts | `cancelled`; no error toast | Observe request cancellation and stop work cooperatively. |
| A newer scenario supersedes an older request | Cancel old request; only newest request may update the UI | Stop old work when cancellation reaches the server. |
| Local deadline expires | `timeout`; preserve inputs and allow retry | May observe disconnection; stopping is not guaranteed to be immediate. |
| Server deadline expires | HTTP 504 if response can still be written | Cancel simulation using a separately tracked deadline token. |
| Connection disappears | `network` unless a known local abort caused it | Stop if request token is signaled; a response may be impossible. |

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

Household search remains deferred until a household response schema exists. No update/delete/job endpoints are needed for the current MVP.

## Verification when implementation starts

Check matching wire formats, required fields and validation paths; HTTP errors with JSON/HTML/empty bodies; malformed success bodies; cancellation before send and during body reads; local and server deadlines; stale request races; and QUERY through the deployed browser/proxy path. Confirm that server computation checks cancellation and that unexpected exceptions return safe problems.

## References

- [HTTP QUERY semantics](https://www.rfc-editor.org/rfc/rfc10008.html)
- [Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Browser AbortSignal behavior](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
- [ASP.NET Core request timeout behavior](https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0)
