# Frontend API Integration Draft

Future wiring map; not a claim of an integrated application. The minimum commit leaves the committed `frontend/app.js`, `frontend/index.html`, README, and backend source unchanged. The existing page still runs its local demo. Only the standalone transport client and its tests are added, alongside these rebuild documents.

Use [API_DRAFT.md](API_DRAFT.md) for the complete target contract and [API_FUNCTIONS_DRAFT.md](API_FUNCTIONS_DRAFT.md) for implemented transport behavior. Keep plain JavaScript; no React/TypeScript migration is required.

## Connection work for the frontend owner

| Existing part | Required future adaptation |
| --- | --- |
| `readPolicyForm()` | Read gas change, EV rebate, and fare only. Map `#gas-tax` to `gasTaxChangeUsdPerGallon`; remove seed. Distinguish blank input from numeric zero. |
| `validatePolicy()` | Replace mock ranges with the agreed inclusive bounds: -0.50–3, 0–12000, 0–10. Defaults are 0, 0, 2.50. |
| Local `runSimulation()` | Remove/bypass the local formulas and call the imported transport's `runSimulation(policy, options)` instead. Avoid a function-name collision. |
| Submit handler | Await response data; catch ApiError and split field/form errors. Preserve inputs and last successful results. |
| `renderResults()` | Adapt to `policy`, `baseline`, `proposed`, `changes`, `assumptions`, and modelVersion. The current demo response has a different shape. |
| `#behavior-chart` | Plot server `modeCounts.gas/ev/transit`; do not calculate household switches from net mode counts. |
| `#result-status`, `#form-error` | Loading/success/error state and safe text messages. Known field errors identify the three controls; unknown keys stay form-level. |
| `#reset-button` | Invalidate old requests, clear errors/output, and restore agreed defaults. Do not fabricate successful example results. |
| Assumptions dialog | Use actual server assumptions as text; do not repeat outdated model claims. |
| Startup and script loading | Add an explicit module import/loading arrangement. Optionally call getConfig; use documented fallback input settings when that optional endpoint is unavailable. |

Do not import `api.js` into the old app without adapting both request and response handling. The minimal client requires only a same-origin `/api` or an explicitly configured `createApi({ baseUrl })` instance. No frontend tooling or host is chosen by this commit.

## Core rules to retain at integration

- C# owns all simulation calculations. Do not copy demo formulas or adapt aggregate percentages into household costs, emissions, transitions, or car ownership changes.
- The new household model is not present in the reviewed backend. Do not equate `otherPct` with the plan's transit outcome or the brief's broader “lose the car” wording.
- Label displayed results with the policy that produced them; edited form inputs do not change old results.
- Only the newest request may update the UI, including error and cleanup callbacks. Disable Run while active and handle reset/cached navigation deliberately.
- The client supports caller cancellation, not automatic deadlines. UI can supply an AbortController later; abort does not guarantee server rollback or interruption.
- Successful JSON is returned unchanged. Any future fixture mode must be explicitly identified by its server/UI, never silently presented as a calculation.

## Deferred source and ownership

The previous C# host/contracts/scaffold, fixture server/data, full UI wiring, cached-navigation fix, frontend race tests, timeout composition, detailed schema checks, config fallback, package metadata, and run instructions are preserved in a local `API_DEFERRED_IMPLEMENTATION.md` outside the repository. They are reference material, not approved shared architecture or dependencies of this commit.

Backend setup and service implementation belong with the backend owner; markup/rendering/history/comparison belong with the frontend owners. Bring back only the necessary connection changes once both ends expose the agreed contract. Add a real integration smoke test before calling the application connected.
