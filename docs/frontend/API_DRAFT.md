# API Rules and Endpoints Draft

Status: proposed API contract aligned with the current `TransportPolicy` simulator. Endpoints and wrapper DTOs below are not implemented. Backend model references: [Simulator.cs](../../backend/Simulator.cs), [Config.cs](../../backend/Config.cs), and [Result.cs](../../backend/Result.cs).

Frontend language: plain JavaScript. React remains optional. TypeScript in companion drafts is contract notation only.

See [API Functions and Failure Handling Draft](API_FUNCTIONS_DRAFT.md) for matching frontend/backend signatures, proposed DTOs, rejection responses, and cancellation behavior.

## Shared rules

- Use the `/api` prefix and JSON with camelCase property names.
- Keep request and response DTOs separate from database models.
- Use `GET` for retrieval, `QUERY` for read-only computations or structured searches with a body, and `POST` for operations that create state.
- Send `Content-Type: application/json` for JSON bodies. Do not send GET bodies.
- Validate inputs on the backend; frontend validation provides immediate feedback.
- Represent money in USD with units explicit in field names. Use string IDs and UTC ISO 8601 timestamps where needed.
- Return errors as `application/problem+json` with `title`, `status`, and optional field-level `errors` and `traceId`.
- Use `200` for successful reads/computations, `201` for creation (with a `Location` header), `400` for invalid input, `404` for missing resources, `409` for state conflicts, `415` for unsupported content types, and `500` for unexpected failures. Use `401`/`403` if authentication is introduced.
- Keep secrets on the backend and allow only configured frontend origins through CORS. Verify that CORS and the deployment proxy support `QUERY`.
- Do not automatically retry state-changing requests. Permit cancellation of obsolete frontend requests.

## Expected MVP endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Basic application health; no configuration or secret details. |
| GET | `/api/simulation/config` | Baseline policy defaults, input constraints, warning threshold, fixed horizon, and assumptions. |
| QUERY | `/api/simulation` | Compute a scenario and return aggregate results without saving a scenario or creating a persistent job. |

### Simulation request

All three fields are required finite JSON numbers. Use C# `double` to match the simulator. Proposed API names map to existing positional arguments:

| Field | Simulator argument | Meaning and constraint | Baseline default |
| --- | --- | --- | --- |
| `gasTaxUsdPerGallon` | `gasTax` | Adjustment added to base gas price; must keep that price positive. Currently strictly greater than -3.10. | 0 |
| `evRebateUsd` | `evRebate` | EV rebate amount, at least 0. | 0 |
| `publicTransitFareUsdPerRide` | `transitFare` | Total transit fare per ride, at least 0. | 1.75 |

Read defaults from configuration rather than hard-coding them in the UI. The lower gas-tax bound is `-Cfg.BaseGasPrice` and is exclusive. Negative gas-tax adjustments are permitted. The simulator defines no finite upper bound for these inputs; do not invent calibrated maxima. All inputs and returned numbers must remain finite.

`abs(gasTax) > 5.0` triggers an extrapolation warning, not rejection. Exactly 5.0 does not trigger it. The negative side of this warning range is currently unreachable because gas-price validation rejects values at or below -3.10.

### Simulation response

Proposed wrapper fields supported by the current model:

- `appliedPolicy`: the three request values.
- `horizonYears`: `Cfg.HorizonYears`, currently 5; not a request parameter.
- `baseline`: `Simulate(0, 0, Cfg.BaseFare)`.
- `policy`: `Simulate(gasTax, evRebate, transitFare)`.
- `changePercentagePoints`: policy minus baseline, matching `PolicyEffect`.
- `warnings`: structured extrapolation warnings; empty array when none apply.

Each result has `gasPct`, `evPct`, and `otherPct`. Baseline and policy values are percentages on a 0–100 scale and should total approximately 100 within floating-point tolerance. Changes are signed percentage points and should total approximately zero. Preserve numerical precision in the API and round only for display.

The baseline is the final no-policy result over the same horizon, not the initial fleet composition. `otherPct` combines transit and other non-driving travel; do not label it as transit alone. Zero change is a successful result. A simulation response must contain all three result objects; it has no empty-result form.

## Current model limitations

- Deterministic aggregate model; no random seed, individual households, household count, or income groups.
- Returns end-of-horizon shares, not household switching counts or a yearly time series.
- Transit is modeled internally but is not separately returned by `Simulate`.
- No returned household cost changes or emissions estimates. Internal running-cost calculations do not establish these outputs.
- Constants in `Config` include placeholder assumptions. Results are exploratory estimates, not predictions.
- No model-version identifier, persistence, or background jobs currently exist.
- Current simulation has no cancellation-token support. Browser cancellation stops waiting; it cannot guarantee computation stops.
- Extreme finite inputs can overflow intermediate arithmetic. The proposed API must reject non-finite/out-of-range result objects as an internal numerical failure (500), rather than emit invalid JSON or fabricate results. Practical input caps remain a future model-owner decision.

## Possible later endpoints

Future proposals only; no persistence behavior is provided by the simulator.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/scenarios` | Save a named scenario using an agreed persistence contract. |
| GET | `/api/scenarios/{id}` | Retrieve a saved scenario. |
| GET | `/api/scenarios` | List saved scenarios with bounded pagination. |

Keep side-by-side comparison in the frontend initially, using two simulation responses. If simulation execution later requires a persistent background job, define a POST-based job workflow instead of changing QUERY semantics.

## Decisions awaiting documentation

- Whether the model owner will define practical upper input limits or extend the returned metrics.
- Final API wrapper names, any future model-version identifier, and timeout durations.
- Authentication or persistence requirements, if introduced.
- API tooling support for QUERY. If infrastructure requires a POST computation alternative, document it explicitly.

Reference for QUERY semantics: [RFC 10008](https://www.rfc-editor.org/rfc/rfc10008.html).
