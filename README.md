# Policy Lab

For a manual server installation from GitHub main, see [one-time deployment](DEPLOYMENT-SETUP.md).

The seven-input plain JavaScript frontend calls C# through requestSimulation(request). There are no local preview calculations or fake result fallbacks.

Run with the .NET 10 SDK:

```powershell
dotnet run --project backend/TransportPolicy.csproj -- --urls http://localhost:5080
```

Open [Policy Lab](http://localhost:5080). The host serves both frontend and API. JavaScript needs no npm installation or build step. The existing Chart.js CDN enhances charts; a table remains usable without it. Rebuild/restart after frontend edits because the host serves copied output assets.

Routes: GET `/api/health`, GET `/api/config`, POST `/api/simulate`. POST sends the starting shares, three policy values, and a required `simulatedYears` integer from 1 to 100. The UI does not choose a horizon for the user. Response: `{ gasPct, evPct, noCarPct }`, percentages summing to 100. See [bounds and error rules](docs/frontend/API_DRAFT.md).

Both boundaries validate types, ranges and totals. C# calibrates from request-local starting shares without mutating the shared model. Each starting category must be at least 0.001% for logarithmic calibration. UI counts are explicitly equivalents at a scale of 5,000, not simulated individuals.

Run tests with Node 24 or newer:

```powershell
node --test frontend/tests/*.test.js
```

With the API running, include live checks:

```powershell
$env:API_TEST_URL = 'http://localhost:5080'
node --test frontend/tests/*.test.js
```

Without API_TEST_URL, the live test is explicitly skipped. Tests cover sanitation, model results, isolated custom populations, HTTP rejection/CORS, UI wiring and reset/cancellation races. They do not certify scientific assumptions.

`dotnet publish backend/TransportPolicy.csproj -o <output-directory>` includes frontend files under wwwroot. The published host serves files beside its assembly and needs no source tree. Original console examples remain in Program.cs; the project selects WebHost by default.

For separate frontend hosting, proxy `/api` or use `createApi({ baseUrl })`. Backend AllowedOrigins defaults to `http://localhost:5173`; configure it with entries such as `AllowedOrigins__0`. No authentication, persistence, automatic retry or browser deadline is added. Caller abort and request IDs prevent obsolete results; server cancellation is checked every simulated year.

The [current plan](docs/plan.md) links maintained rebuild documents. Older household/TypeScript designs are [archived](docs/archive/household-implementation-plan.md), not active contracts.
