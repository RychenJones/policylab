# Current API Functions and Failure Handling

Rebuild reference for the implemented connection. [API_DRAFT.md](API_DRAFT.md) defines exact wire fields, bounds and tolerances. Plain JavaScript is selected; no TypeScript requirement or ApiResult wrapper exists.

## JavaScript functions

| Function in frontend/api.js | Behavior |
| --- | --- |
| sanitizeRequest(request) | Validate six fields, types, bounds and sum; return a new whitelisted object or throw ApiError. |
| sanitizeResult(value) | Validate gasPct/evPct/noCarPct ranges and sum; return exactly those fields or throw ApiError. |
| getHealth(options?) | GET /api/health; return a validated health object. |
| getConfig(options?) | GET /api/config; sanitize defaults/rules/metadata and reject server/client bound drift. |
| requestSimulation(request, options?) | Sanitize request, POST /api/simulate, sanitize the flat percentage response. |
| createApi({ baseUrl, fetchImpl }) | Configure another origin or isolate transport tests; default baseUrl is /api. |

Options support caller { signal }; no automatic timeout or retry. requestSimulation always returns a promise, including validation failures. Unexpected programming exceptions propagate. The exported app.js requestSimulation seam delegates directly to the API function and has no local model branch.

## ApiError

ApiError extends Error with status, message, optional code, fieldErrors and formError.

| Failure | Status/code | Caller responsibility |
| --- | --- | --- |
| Client-side validation | 400 / validation_failed | Correct field/form messages; no request sent. |
| HTTP rejection | Actual status and optional server code | Map known six fields inline; other keys become formError. |
| Network/body-read transport failure | 0 / network_error | Connectivity message; preserve inputs/results. |
| Caller abort | 0 / cancelled | Reset/navigation wins; no failure toast. |
| Invalid successful response/config | Actual success status / invalid_response | Do not render; keep previous good output. |

HTTP errors do not inherently reject fetch. Actual response status overrides body status. Empty/malformed/non-JSON HTTP error bodies receive safe generic messages, never raw HTML. Copy only typed error-message arrays and use textContent. Unknown error keys are never arbitrary DOM selectors.

The UI translates diagnostics instead of printing raw ApiError messages or server arrays. Starting-share errors use percentage units and control labels; blank input asks for a number. End users are not asked to start a backend or understand JSON, fractions, or calibration.

Successful output is validated and whitelisted. Strings, missing fields, null, non-finite/out-of-range shares, and nonconserving totals fail. Legacy household wrappers and otherPct aliases are unsupported. Sanitation does not coerce, clamp or repair model data.

## C# boundary

WebHost maps three current routes and centralizes safe errors. ApiBoundary.Read(JsonElement) validates shape, duplicate/unknown/required fields, types, finite numbers, ranges and sum before constructing SimulationRequest. Calculate(request, token) builds a request-local configuration, calls the model and validates the result before serialization.

Simulator.Simulate(Config cfg, double gasTax, double evRebate, double transitFare, CancellationToken token = default) calibrates from cfg and checks cancellation before work and each year. The original three-double overload delegates to Cfg. No new household engine or shared request mutation is introduced.

400 ValidationProblem errors use field/body keys. 500 problems contain no exception details. Route/method/size errors preserve statuses and Allow where applicable. A disconnected client may receive no response.

## UI lifecycle and verification

The form converts percentages to fractions and passes sanitized results to Chart.js and a table. Load config first. Use valueAsNumber so blanks do not become zero. Associate output with the captured request, and guard success/error/finally with an increasing request ID.

Reset aborts/invalidates pending work, hides output, restores defaults and fabricates no result. Cached navigation restores button readiness. Editing marks old results stale. The table works if the external chart library is unavailable.

The result panel has explicit empty/loading/error/success state. Try again reloads configuration before initialization or submits the form afterward. Prior successful output stays visible during later loading/failure. Cached navigation restores the panel as well as the button. Reveal the result container before resizing/updating Chart.js. UI tests resolve selectors from the real index.html rather than invent missing nodes.

Tests cover client/server input rejection, output whitelisting, exact six-field POST, malformed responses, model regression and custom-population isolation, cancellation/reset races, CORS and packaged frontend assets. Passing transport tests does not certify real-world predictive validity.
