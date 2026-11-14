# API Rules and Endpoints Draft

Status: provisional. Refine when the remaining design documentation arrives.

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
| GET | `/api/simulation/config` | Input defaults, supported ranges, units, household count, and model assumptions/version. |
| QUERY | `/api/simulation` | Compute a scenario and return aggregate results without saving a scenario or creating a persistent job. |

### Simulation request

Proposed fields; numeric defaults and allowed ranges remain undecided.

| Field | Meaning |
| --- | --- |
| `gasTaxUsdPerGallon` | Gas tax; whether this is a total or increase remains undecided. |
| `evRebateUsd` | EV rebate amount. |
| `publicTransitFareUsdPerRide` | Public transportation fare per ride. |
| `seed` | Integer seed controlling population generation and any randomized simulation decisions. |

Use 5,000 households for the MVP. Reuse the same population and baseline when comparing policies. A seed makes comparisons reproducible within the same model version; it does not guarantee identical results across model changes.

### Simulation response

Expected content, with exact field names pending agreement:

- Applied policy inputs, seed, household count, and model version.
- Baseline and proposed-policy transportation behavior counts.
- Average annual household cost change in USD.
- Estimated emissions change, with unit and time period stated explicitly.
- Results grouped by income level.
- Assumptions identifying the results as exploratory estimates.

An empty result is a successful response, not a missing-resource error. Unexpected computation failures return a standard error response.

## Possible later endpoints

Add only if the design requires saved scenarios or household drill-down.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/scenarios` | Save a named scenario using an agreed persistence contract. |
| GET | `/api/scenarios/{id}` | Retrieve a saved scenario. |
| GET | `/api/scenarios` | List saved scenarios with bounded pagination. |
| QUERY | `/api/scenarios/{id}/households/search` | Filter and paginate household results associated with a saved scenario. |

Keep side-by-side comparison in the frontend initially, using two simulation responses. If simulation execution later requires a persistent background job, define a POST-based job workflow instead of changing QUERY semantics.

## Decisions awaiting documentation

- Whether gas tax is a total or an increase, and which baseline values apply.
- Whether behavior categories overlap or each household receives one primary outcome.
- Cost accounting, emissions units, income bands, and input limits.
- Authentication, persistence, deployment, and acceptable simulation runtime.
- Final request/response schemas and API tooling support for QUERY. If infrastructure requires a POST search/computation alternative, document it explicitly.

Reference for QUERY semantics: [RFC 10008](https://www.rfc-editor.org/rfc/rfc10008.html).
