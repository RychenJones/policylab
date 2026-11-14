# Current API Contract and Rebuild Reference

Authoritative contract for the current six-input plain JavaScript frontend and C# aggregate simulator. The older household proposal is [archived](../archive/household-implementation-plan.md). Its household schemas, TypeScript assumptions, and sample outputs do not define current behavior.

## Core principles

- C# owns policy calculations. The browser gathers inputs and presents validated server results; there is no local preview or mock fallback.
- Starting shares are fractions (0–1); returned shares are percentages (0–100). Gas tax is USD/gallon, rebate USD, fare USD/ride.
- Reject malformed data rather than coerce strings, fill missing fields with zero, clamp results, or silently normalize totals.
- Validate both boundaries and return whitelisted output only. Never expose internal model state or exception details.
- Preserve submitted inputs and previous good results on failure. Only the current request may update UI state, including cleanup.
- Display server messages as text. Separate cancellation from network and HTTP failures.
- Keep implementation language out of user-facing copy. Translate API diagnostics into ordinary simulation, connection, and input messages; show percentage errors in percent units rather than wire fractions. Explain specific limits when an entry fails, not beside every field.
- The model estimates aggregate shares. Household equivalents use a display scale of 5,000; they are not simulated people or observed switching counts.

## Routes

| Method | Path | Successful body |
| --- | --- | --- |
| GET | /api/health | { "status": "ok" } |
| GET | /api/config | defaults, inputs, simulatedYears, assumptions |
| POST | /api/simulate | Flat { gasPct, evPct, noCarPct } |

Success is 200 JSON. There are no QUERY routes, compatibility aliases, household envelopes, stub mode, or saved-scenario endpoints. The modern form is connected by default.

## Six-field request

```json
{
  "baseGasShare": 0.88592,
  "baseEvShare": 0.01808,
  "baseNoCarShare": 0.096,
  "gasTax": 1,
  "evRebate": 7500,
  "transitFare": 1.75
}
```

| Field | Inclusive bounds | Meaning |
| --- | --- | --- |
| baseGasShare | 0.00001–0.99998 | Starting fraction using a gas vehicle. |
| baseEvShare | 0.00001–0.99998 | Starting fraction using an EV. |
| baseNoCarShare | 0.00001–0.99998 | Starting fraction with no car. |
| gasTax | 0–10 | Increase added to model base gas price, USD/gallon. |
| evRebate | 0–20000 | EV rebate in USD. |
| transitFare | 0–15 | Total fare, USD/ride. |

Starting shares must sum to 1 within absolute tolerance 1e-8. All categories must be positive because calibration uses logarithmic share ratios. The minimum matches the form's 0.001% entry precision; zero-share calibration is unsupported and must not be repaired with a hidden epsilon. Zero is valid for policy inputs.

All six fields are required, case-sensitive finite JSON numbers. Reject unknown/duplicate/missing fields, null, numeric strings, booleans, arrays, malformed JSON, overflowed numbers and range violations. UI steps are conveniences, not enforced multiples. Maximum request size is 16 KiB; JSON nesting depth is 8.

## Three-field response

```json
{ "gasPct": 80, "evPct": 10, "noCarPct": 10 }
```

This is an illustrative shape, not a fixture or promised result. All three numbers must be finite, within [0,100], and total 100 within 1e-6. Server and client reject invalid results. The client returns a new object containing exactly these keys; extra response properties never reach renderers.

Round for display only. UI changes are percentage points from the entered starting mix. No household transitions, costs, emissions, incomes, seeds, or yearly series are returned.

## Configuration and execution

Config contains:
- defaults: the same six-field request. Starting shares come from Simulator.Cfg.BaseShare; policy example defaults are gasTax 1, evRebate 7500, and configured BaseFare (1.75).
- inputs: six matching keys, each with min/max/step. Steps are 0.00001 for shares, then 0.05, 250, 0.25.
- simulatedYears: currently 5.
- assumptions: explanatory string array.

The browser validates config before enabling Run. Failure offers a connection retry; no hardcoded preview or stale config fallback is used.

ApiBoundary creates a request-local Config with the entered BaseShare and runs recalibration plus simulation against that object. Shared Cfg and calibration are not mutated. The original three-argument Simulate remains available to console callers. Current model base gas price is 3.10 and base fare 1.75; the older proposal's 3.50/2.50 values do not apply.

## Failure and cancellation rules

Input and content-type errors return 400 application/problem+json with errors under one of the six field keys or body for general errors. Missing/unsupported JSON content type is 400. Unexpected computation/invalid-output failures return a safe 500 problem. Framework statuses such as 404,405,413 retain their actual meaning. Never expose exceptions or stack traces.

Client functions throw ApiError. Malformed/empty/HTML error bodies remain HTTP failures with a safe status message. Status 0 represents network failure or caller cancellation, distinguished by code. No automatic retry or client timeout default is implemented. AbortSignal reaches HTTP and server request cancellation is checked during body reading and each simulation year; abort does not promise a JSON response.

## Hosting and verification

.NET 10 serves the existing frontend and API at one origin. Frontend assets are copied into build/publish output; published execution does not require the source tree. Separate frontend hosting may proxy /api or use createApi({ baseUrl }). AllowedOrigins defaults to http://localhost:5173 and permits GET/POST/OPTIONS with JSON headers. No authentication or persistence is introduced.

See [function contracts](API_FUNCTIONS_DRAFT.md), [frontend mapping](FRONTEND_INTEGRATION_DRAFT.md), and [run/test instructions](../../README.md). Keep these rebuild references synchronized with code; archived proposals are not active contracts.
