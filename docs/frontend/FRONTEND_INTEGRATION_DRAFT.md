# Frontend API Integration Draft

Status: connection plan only. No frontend or backend implementation changes are included. Based on the current [app.js](../../frontend/app.js), [index.html](../../frontend/index.html), and C# simulator.

The frontend is plain JavaScript with DOM event handlers. Keep that structure; no React migration, state library, or new component architecture is needed for this integration. The C# model defines valid inputs and outputs. The local JavaScript simulation and its fixtures are not contract references.

Use [API_DRAFT.md](API_DRAFT.md) for endpoint/model rules and [API_FUNCTIONS_DRAFT.md](API_FUNCTIONS_DRAFT.md) for request, response, error, and cancellation contracts.

## Connection points

| Existing part | Integration plan |
| --- | --- |
| `readPolicyForm()` | Read only the three policy fields. Check empty/invalid controls before converting to numbers; `Number('')` must not turn a missing value into zero. |
| `validatePolicy(policy)` | Keep lightweight input feedback, using config constraints. Replace the current arbitrary maxima and seed validation. Backend remains authoritative. |
| Local `runSimulation(policy)` | Replace its use with the API client's QUERY request. Disregard its formulas, delay, household counts, and derived metrics. |
| `#policy-form` submit handler | Keep as coordinator: validate, snapshot inputs, set loading, call client, branch on `ApiResult`, then render successful server data. |
| `renderResults(result)` | Keep as the rendering entry point, but adapt its internals to `baseline`, `policy`, `changePercentagePoints`, `horizonYears`, and `warnings`. Current internals are incompatible. |
| `renderBehaviorChart(result)` | Reuse chart container/layout; display the three backend share categories as percentages. |
| `setFormValues(policy)` | Set only the three policy fields and synchronize their sliders. |
| Reset handler and startup | Stop calling `createExampleResult()` or displaying fabricated outputs. Use config defaults and an explicit no-results state. |
| Assumptions dialog open/close handlers | Keep interaction behavior; populate model notes from config assumptions. |

Existing `getBehaviorCounts`, `baselineToArray`, `renderIncomeChart`, and mock-result helpers are not required for the current API response. Do not build a compatibility layer that invents their old fields. Number formatting and slider synchronization can remain where their behavior fits the revised data.

## Small client boundary

Propose one plain JavaScript file, `frontend/api.js`, containing the transport functions. `app.js` owns form state and DOM rendering; the API client owns HTTP, parsing, timeouts, and failure normalization. No business formulas belong in either file.

| Proposed client function | Used by | Route |
| --- | --- | --- |
| `getSimulationConfig(options)` | Page initialization | GET `/api/simulation/config` |
| `runSimulation(policy, options)` | Form submit handler | QUERY `/api/simulation` |
| `getHealth(options)` | Optional diagnostics; not a prerequisite for submission | GET `/api/health` |

`options` may contain `signal` and `timeoutMs`. Functions return the `ApiResult` described in the function draft. Expected failures resolve as `{ ok: false, error }`; the current catch-only submit flow must change. Keep a final catch for unexpected programming failures.

The existing page loads a classic `app.js` script. Choose a consistent loading arrangement when implementing `api.js` (for example, module scripts with explicit imports). That wiring must be deliberate; declarations in an unloaded file are not an integration.

Use a configurable API base URL, defaulting to same-origin `/api`. Do not hard-code a teammate's port. Cross-origin hosting requires the existing CORS/QUERY policy; no authentication scheme is assumed.

## Form and configuration mapping

| JSON request field | Existing control | Server meaning |
| --- | --- | --- |
| `gasTaxUsdPerGallon` | `#gas-tax` | Adjustment to base gas price; may be negative while effective price stays positive. |
| `evRebateUsd` | `#ev-rebate` | Nonnegative EV rebate in USD. |
| `publicTransitFareUsdPerRide` | `#transit-fare` | Nonnegative total fare in USD per ride. |

Omit `seed` entirely from requests and remove/hide `#seed` and its help text during implementation. The backend has no random seed. Label the gas control as an adjustment rather than implying only increases are supported.

Load defaults and constraints from config. Current no-policy defaults are 0 gas adjustment, 0 rebate, and 1.75 transit fare. Do not use `EXAMPLE_POLICY` as a source of backend defaults. If config fails, display a retryable configuration error and keep submission unavailable until config loads successfully.

The gas lower bound is exclusive; HTML `min` alone cannot express it. Validate `baseGasPrice + adjustment > 0` explicitly. All three controls must reject empty/non-finite values. Match the model's nonnegative fare/rebate constraints.

Current sliders have finite visual ranges, while the model has no finite upper input bounds. Treat slider endpoints and step sizes as UI conveniences, not server limits. Numeric entry must allow valid values outside a slider's visual range without silently clamping or overwriting them. Do not derive API min/max limits from current HTML attributes. UI ranges, labels, and negative gas entry need adjustment as part of later frontend wiring.

## Results and display mapping

The API response remains the backend-aligned response already drafted. Adapt the UI to that contract.

| Existing display | Planned server-backed display |
| --- | --- |
| `#behavior-chart` | Baseline versus policy `gasPct`, `evPct`, and `otherPct`, labeled Gas vehicle, EV, and Transit and other non-driving. Use a common 0–100% scale, percentage labels/tooltips, and an updated accessible description. |
| `#switching-value` / `#switching-change` and containing card | Repurpose as gas-vehicle share (`policy.gasPct` in %) and its signed change (`changePercentagePoints.gasPct` in percentage points). Update the card label; this is not a switching count. |
| Cost card (`#cost-value`) | Hide until a real backend metric exists. Do not derive household cost effects from policy inputs. |
| Emissions card (`#emissions-value`, `#emissions-unit`) | Hide until a real backend metric exists. |
| Income chart card (`#income-chart`) | Hide until the backend provides an income breakdown. |
| `#result-status` | Loading/failure/cancellation state, or completion with `horizonYears`; remove seed references. |
| Assumptions card/dialog | Show deterministic aggregate-model limitations and config assumptions as text. |

Hide unsupported cards as complete containers, including headings, units, and footnotes; do not leave plausible placeholder numbers behind. Retain percentage precision in data and round only for display. Negative/positive deltas describe direction, not an automatic judgment of benefit or harm.

Correct the page description, hero copy, household badge, chart headings/accessibility labels, assumptions list, and footer claims about 5,000 households, synthetic/randomized population, annual cost/emissions outputs, and a model version. These claims are not established by the current backend. Present an aggregate transportation estimate over the configured horizon instead.

## Submit, reset, and cancellation flow

1. On startup, hide placeholder results and unsupported cards, load config, populate inputs, and show a ready state. Do not auto-render or locally calculate an example result.
2. On submit, validate and capture the three values. Clear old field errors and start a new request with its own AbortController and request ID. Disable the submit button while active; reset stays available.
3. On success, render only if that request is still active. Label results with their applied inputs and horizon; edits to the form do not change the meaning of already-rendered results.
4. On an expected failure, handle `ApiResult.error` as below. On unexpected exceptions, show a generic error and log diagnostic details appropriately.
5. In cleanup, restore the submit label/button only if this is still the active request. A stale completion must not change results, errors, status, warnings, or loading state.
6. Reset invalidates the active request ID, aborts any request, clears results/errors/warnings, and restores config defaults. Relabel `Reset to example` as `Reset to defaults`. Reset does not fabricate or automatically run a scenario.

No new Cancel button is required for the first connection. Abort on reset and page departure where practical; the request-ID guard also covers future superseding submissions. If a Cancel button is later added, route it through the same cancellation path. Browser abort cannot interrupt an active C# model call.

Keep the last successful result during a failed subsequent run, clearly identified as the previous result for its applied inputs. If there has never been a successful run, retain the no-results state. Reset explicitly clears it.

## Error and warning presentation

| Outcome | Existing UI connection |
| --- | --- |
| Local validation or HTTP 400 field errors | Map known field keys to the three input IDs; set field validity/accessibility feedback and summarize in `#form-error` (`role="alert"`). Unknown field keys become a form-level message. Clear custom validity on edit/reset. |
| Other HTTP rejection | Show a safe message in `#form-error`; set `#result-status` to failure; preserve inputs. Include a trace ID when available for troubleshooting. |
| Network failure | Show a connectivity message and allow manual retry; never fall back to local simulation. |
| Local timeout | Show a timeout message, preserve inputs, and allow manual retry. An HTTP 504 remains an HTTP error. |
| Cancellation | Update status only when user-relevant; no failure alert. Reset's ready state takes precedence over an aborted request's completion. |
| Invalid success payload | Show an invalid-response message; do not call renderers with partial data or substitute zeros. |
| Successful extrapolation warning | Keep success and show the response warning beside the results. A dedicated warning element is a planned small markup addition; do not use the form's error alert as a rejection. Clear/replace warnings with the corresponding result. |

Insert backend-provided messages and assumptions using `textContent` or equivalent safe text nodes. Existing chart templates must use validated numeric data and fixed labels, not interpolate raw server messages into HTML.

Detailed rejection codes, malformed-body handling, retries, timeout cleanup, and cancellation limits remain as specified in the function draft. None of these changes require local policy calculations or expansion of the backend response.

## Connection acceptance checks

- Submitting the existing form sends exactly the three numeric policy fields to QUERY `/api/simulation`.
- Config controls defaults/validation; blank controls fail instead of becoming zero, and valid negative gas adjustments are supported.
- Only genuine server shares populate the chart/card; no household counts, cost, emissions, income, seed, or local-model outputs appear as computed results.
- Submit branches on success/failure results, including HTTP errors with unexpected bodies, network failure, timeout, and invalid success JSON.
- Reset during a request restores defaults without allowing a late response or finally block to overwrite the reset state.
- Warnings remain successful results; last successful output is distinguished from current edited inputs and failed requests.
- Source changes remain deferred until implementation is requested.
