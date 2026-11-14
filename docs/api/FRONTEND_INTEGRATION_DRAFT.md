# Current Frontend and Backend Connection

The merged six-variable frontend now calls the C# model by default. No preview formulas, hardcoded results, or household-response fallbacks remain. This map and the [API contract](API_DRAFT.md) are maintained rebuild references.

## Current flow

Form submit → buildBackendRequest(values) → app.js requestSimulation(request) → frontend/api.js → POST /api/simulate → ApiBoundary → Simulator → sanitized percentages → renderResults.

| Form control | JSON field | Conversion |
| --- | --- | --- |
| #base-gas | baseGasShare | Percent / 100. |
| #base-ev | baseEvShare | Percent / 100. |
| #base-no-car | baseNoCarShare | Percent / 100. |
| #gas-tax | gasTax | Numeric USD/gallon. |
| #ev-rebate | evRebate | Numeric USD. |
| #transit-fare | transitFare | Numeric USD/ride. |

Starting percentages must total 100%, with each category at least 0.001% for calibration. Default shares are 88.592%,1.808%,9.6%; the merged example's former no-car value 10 incorrectly totaled 100.4%.

## Responsibilities

- app.js owns DOM conversion, error/status presentation, reset, captured result inputs and request ID/controller. Its exported requestSimulation delegates to the API client.
- api.js owns outbound/inbound validation and whitelisting, HTTP parsing and ApiError. Old gasTaxChangeUsdPerGallon, runSimulation and household wrappers are unsupported.
- ApiBoundary.cs owns authoritative input validation, request-local model setup and result validation.
- Simulator.cs owns calculation and calibration. No request mutates global configuration.
- WebHost.cs owns routing, CORS, safe errors and static delivery. The web host is the default startup; console examples remain in Program.cs.

## Startup and display

index.html loads app.js as a module. Startup fetches config, validates it, fills six defaults and enables Run. Failure offers a backend retry, never a mock. Results are hidden until a valid response arrives.

Render only gasPct,evPct,noCarPct against the submitted starting mix. Net differences are percentage points. Any equivalent household quantities scale by 5,000 and are explicitly not individual simulation or observed switching counts. The submitted inputs remain visible independently of later edits. Chart.js is retained; a text/table result works without the CDN library.

Reset aborts/invalidates old callbacks, restores server defaults, clears errors and hides output. Errors preserve inputs and previous good results. Only the latest request may render or clean up loading state; cached navigation restores readiness. All server messages use textContent.

The current markup groups output under #results-content and uses #empty-state, #loading-state and #error-state inside #results-panel. One state setter owns visibility and aria-busy; do not override it with broad data-results toggles. Both retry buttons reload configuration when needed, otherwise retry through form submission. Reveal results before Chart.js resize/update. The separate results table works without the chart library.

Retain the short percentage hint. Explain invalid entries in plain language, using percent and currency units only when needed. API diagnostics belong in developer interfaces, not product copy. Tests read the actual HTML IDs, labels and initial hidden states, including retry and cached-navigation transitions.

The [old household/React proposal](../archive/household-implementation-plan.md) is historical only. No household generator, cost/emissions model, scenario persistence, frontend framework migration, or local policy calculation is added here.
