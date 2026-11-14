# Current Implementation Plan

The application connects the six-variable plain JavaScript form to the C# aggregate simulator through POST /api/simulate. Current maintained references are:

- [API contract and core principles](frontend/API_DRAFT.md): fields, units, bounds, responses and errors.
- [Function/error contracts](frontend/API_FUNCTIONS_DRAFT.md): requestSimulation, sanitation, C# boundary and cancellation.
- [Frontend connection map](frontend/FRONTEND_INTEGRATION_DRAFT.md): actual controls, request path, reset and rendering.
- [Run and verification instructions](../README.md).

Default implementation is the .NET 10 host serving the current frontend and API together. No TypeScript/React migration, mock mode, legacy route aliases or individual-household calculation is selected. C# calibrates from request-local starting shares without changing shared configuration.

Starting shares are fractions; outputs are gas/EV/no-car percentages. Both boundaries validate inputs and outputs. UI quantities on a scale of 5,000 are household equivalents, not measured household switches. Results are exploratory estimates.

The [earlier household/React proposal](archive/household-implementation-plan.md) is retained as historical context only; it does not override current model behavior, units, routes, errors, language or rebuild documents. Future changes should update code, references and tests together.
