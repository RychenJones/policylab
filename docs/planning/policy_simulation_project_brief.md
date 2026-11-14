# Policy Simulation Project Brief

## Implemented scope

Policy Lab explores how three policy levers change an aggregate transportation mix over five simulated years. Users enter six values: starting gas, EV and no-car percentages, then gas tax increase, EV rebate and transit fare. Starting percentages total 100%.

The browser sends validated inputs to C# through the API. The model returns gas,EV,no-car percentages, which the frontend compares with the entered starting mix. UI quantities are equivalents on a 5,000-household display scale; the model does not generate or track individual households.

Results are exploratory estimates based on placeholder assumptions, not forecasts. Costs, emissions, income groups, household transitions, persistence and randomized populations are not implemented outputs.

## Boundaries

- The merged six-input form and aggregate simulator are the integration baseline.
- C# owns calculation and request-local calibration; the browser has no preview formula or mock fallback.
- Both API boundaries validate finite numbers, ranges, positive starting shares and their total, and reject invalid returned percentages.
- Plain JavaScript remains selected. Existing charts are retained with a table fallback.
- No database, authentication, saved scenarios or new household model is introduced.

See [the current plan](plan.md), [API reference](../api/API_DRAFT.md) and [README](../../README.md). The [historical proposal](../archive/household-implementation-plan.md) records earlier ideas, not current implementation.
