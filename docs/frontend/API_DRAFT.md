# API Rules and Endpoints Draft

Contract snapshot: aligned with sections 6–9 of the [implementation plan at a93e9e6](https://github.com/RychenJones/policysim/blob/a93e9e6440fff9bd31c67d89055e0b4dc579207a/docs/plan.md). Keep this document current as a standalone rebuild reference, not merely a superseded link. Frontend implementation is plain JavaScript; React is optional and TypeScript is not required.

Minimum commit scope: standalone `frontend/api.js`, isolated client tests, these contract/rebuild documents, and build-output ignore rules. No host, backend contracts, project setup, fixture server, or frontend UI changes are included. The existing frontend still uses its original local demo and is not connected to this client yet.

## Core principles

- Backend services own simulation and policy rules. The browser performs input checks and presents server results; it never calculates substitute policy outcomes.
- Use `/api`, camelCase JSON, explicit units, finite JSON numbers, and separate wire/domain responsibilities.
- Every policy field is required. Never interpret a missing field as zero. Reject strings, nulls, unknown fields, duplicates, malformed JSON, non-finite numbers, and out-of-range values.
- Preserve form input and the last successful result on failure, with the displayed policy identified. Ignore stale responses, errors, and cleanup callbacks.
- Treat server strings as text. Never show stack traces or raw HTML error bodies.
- Keep fixtures distinguishable from live results. Never infer household switches, cost, emissions, or transit-only outcomes from the old aggregate percentages.
- No persistence or authentication in this MVP. History, if implemented by the frontend owner, is browser memory only.
- The minimal client accepts a caller AbortSignal. Automatic deadlines, composed timeout/cancellation handling, and server cancellation are deferred; they must not be advertised as implemented.

## Endpoints

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | 200 `{ "status": "ok" }` | Host liveness, not simulation readiness. |
| GET | `/api/config` | 200 config below | Agreed input rules and target model metadata. Optional for form operation. |
| POST | `/api/simulate` | 200 simulation below | Validated policy passed to the household service. |

These are target routes for the backend owner, replacing the earlier draft's `/api/simulation/config` and `QUERY /api/simulation`. The client calls the new names; this commit implements no server routes or compatibility aliases. Saved-scenario and household-sample endpoints remain deferred.

## Request and configuration

POST sends JSON with `Content-Type: application/json` and exactly:

```json
{
  "gasTaxChangeUsdPerGallon": 1,
  "evRebateUsd": 7500,
  "publicTransitFareUsdPerRide": 2.5
}
```

| Field | Inclusive range | Default and current law | UI step | Meaning |
| --- | --- | --- | --- | --- |
| `gasTaxChangeUsdPerGallon` | -0.50 to 3.00 | 0 | 0.05 | Signed change to planned $3.50/gallon base. |
| `evRebateUsd` | 0 to 12000 | 0 | 250 | One-time rebate per EV. |
| `publicTransitFareUsdPerRide` | 0 to 10 | 2.50 | 0.25 | Total fare per ride. |

UI steps are conveniences, not server multiple-of-step restrictions. No seed, population size, horizon, or model constants belong in the request.

Config contains `modelVersion` (target `0.1.0`), `householdCount` (5000), `populationSeed` (42), `statusQuoPolicy`, `inputs`, and `assumptions` (string array). `inputs` has the three request keys; each rule has `min`, `max`, `step`, `defaultValue`, `unit`, and `label`. Backend config should share constants with backend validation. Config is optional; the frontend owner can use the table above as fallback input settings. The minimal transport has no config cache/fallback implementation, and fallback settings must never supply simulated results.

## Simulation response

| Field | Shape and meaning |
| --- | --- |
| `modelVersion` | String identifying model/constants version. |
| `householdCount` | Integer population size, target 5000. |
| `policy` | Echo of the applied request. |
| `statusQuoPolicy` | Same three fields; defines current law. |
| `baseline`, `proposed` | Scenario summaries below, evaluated on the same population. |
| `changes` | Differences and switched-household statistics below. |
| `transitions` | Array of `{ from, to, count }`, only differing modes and positive integer counts. May be empty when cut. |
| `byIncomeBand` | Array of income summaries below; may be empty when cut. |
| `assumptions` | Plain-language string array explaining estimates. |

Scenario summary: `modeCounts: { gas, ev, transit }` (integer counts summing to population), `avgAnnualCostUsd` (per household/year), `totalEmissionsTonnesCo2PerYear` (population total), and `emissionsPerHouseholdTonnesCo2PerYear`.

Changes: `householdsSwitched` (counts both directions), `householdsSwitchedPercent` (0–100), `avgAnnualCostChangeUsd`, `emissionsChangeTonnesCo2PerYear`, and `emissionsChangePercent`. Signed differences are proposed minus baseline. Relative emissions percentage is 100 × difference / baseline total, guarded for a zero denominator by the model service.

Income summary: `incomeBand` (`low`, `middle`, or `high`), `householdCount`, `baselineModeCounts`, `policyModeCounts`, and `avgAnnualCostChangeUsd`. Nonempty bands are ordered low, middle, high. Mode wire values are `gas`, `ev`, `transit`; transit means car-free public transit under the plan, not the current aggregate model's combined non-driving share.

Rounding belongs to the backend DTO mapping: USD 2 decimals; total tonnes 1; per-household tonnes 2; percentages 1. Use AwayFromZero and normalize negative zero. Never round inside the underlying model. Empty-group means and zero denominators return zero. No NaN or infinity may reach the wire.

## Errors and rejection responses

- Input/content-type failures deliberately return 400 `application/problem+json` with `errors`: request-field keys for inline messages, `body` for general request errors. Missing/unsupported content type is 400 here, not the old 415 policy.
- Unexpected failures should return 500 with a safe generic problem. A future adapter may use `code: "model_not_ready"` until its service is connected; the client preserves optional code strings. The HTTP status remains authoritative.
- Normal framework/infrastructure responses can still be 404, 405, 413, 502, etc. The client must handle arbitrary non-2xx statuses and malformed, HTML, plain-text, or empty error bodies. Do not manufacture a network error for an HTTP rejection.
- No automatic retries. Manual retry must preserve inputs. Caller cancellation has status 0 and code `cancelled`; HTTP timeout responses retain their actual status. Automatic local timeouts are deferred.

## Model handoff and honest readiness

The planned household generator/choice service has not landed in the reviewed source. The existing `Simulator.cs` is a five-year aggregate model with different assumptions; it cannot honestly supply the new response through renaming or scaling. The minimum commit does not change it or introduce a server.

Suggested backend seam: validated `Policy` passed to `SimulationService.Run(Policy) -> SimulationResponse`. Backend owners supply the DTOs, host, validation, service, and truthful readiness behavior. Preserve the wire contract above regardless of their internal layout. Generation, choice rules, costs, emissions, and calibration are outside the transport client's responsibility.

Fixture servers and their canonical sample data are deferred. If restored later, enable them explicitly, label sample results, and never relabel one fixture as an arbitrary requested policy. The minimal client returns successful JSON unchanged; it does not inject fixture notices into model assumptions.

## Hosting and ownership boundaries

The plan targets backend port 5080 and frontend port 5173 with an optional `/api` proxy. Backend owners configure CORS for allowed origins, GET/POST and JSON headers. A JSON POST can require a cross-origin preflight; test it at integration. The minimal client defaults to same-origin `/api`; `createApi({ baseUrl })` supports a different API origin without hard-coding a teammate's port.

Same-origin static hosting, project scaffold, UI rewrites, deployment packaging, automatic deadlines, deep schema checks, fixture serving, history/comparison, cost/emissions cards, and calibration are deferred. Their previous implementation source is preserved in a separate local draft outside this repo. Nothing in this commit requires frontend package metadata or a running backend to test the transport.

See [function contracts](API_FUNCTIONS_DRAFT.md) and [frontend mapping](FRONTEND_INTEGRATION_DRAFT.md).
