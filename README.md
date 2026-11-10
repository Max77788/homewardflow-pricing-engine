# HomewardFlow Pricing Engine

Standalone HomewardFlow / Blue Tape residential restoration pricing estimator.

## Features

- Validated project, location, condition, quality, margin, scope, labor, and material inputs
- Live BLS Producer Price Index material escalation adapter
- Optional verified benchmark fields with no fabricated market values
- Contractor price-book import from CSV or `.xlsx`, with validation, preview, saved named models, and custom work scopes
- Imported material unit costs, labor productivity/rates, waste, overhead, optional benchmarks, and default margin feed directly into estimate calculations
- Imported material rates are treated as current and do not receive BLS PPI escalation unless the contractor explicitly enables it
- Vite/React frontend
- Local Express API and Vercel serverless API routes

## Run locally

```bash
npm install
npm test
npm run build
npm start
```

The local server runs on `http://127.0.0.1:4173` by default.

## Contractor price-book import

Open **Use your own price book** and upload a CSV or modern Excel `.xlsx` file. The first worksheet in an Excel workbook is used. Files are read and validated in the browser, capped at 5 MB and 1,000 data rows, and shown in a preview before applying. No uploaded file is sent to the server.

Required columns: `name`, `unit`, `material_cost_per_unit`, `labor_hours_per_unit`, `labor_rate`.

Optional columns: `id` (use built-in IDs such as `drywall` to override a starter scope), `trade`, `overhead_pct`, `waste_pct`, `benchmark_low`, `benchmark_median`, `benchmark_p60`. New names/IDs create custom selectable work scopes. Enter the default target margin in the UI. Example CSV template is available from the import panel.

Named price books are stored in browser `localStorage` on the current device and browser profile. This app currently has no authentication or server-side customer tenancy, so profiles do not follow a contractor across devices or isolate accounts on a shared browser. Do not use this as secure multi-tenant persistence until account authentication and customer-scoped server storage are added.

## Data-source policy

- BLS PPI is queried live through the API and adjusts user-entered material costs by an index factor. It does not provide local installed-item prices.
- BLS CES construction average hourly earnings is queried live as a nationwide wage baseline; it is not a local trade wage or contractor bill rate.
- BEA state RPPs are bundled as a public annual snapshot (2023) and displayed as general geographic context only. The factor is not applied to estimates because the measure is not construction-specific. Refresh `data/bea-rpp-states.json` when BEA publishes a newer release with `npm run data:update:bea-rpp`.
- Census ACS housing-unit context is state-specific and requires a free `CENSUS_API_KEY` environment variable. Building Permits and Construction Spending remain unconfigured pending verified dataset queries and the same key.
- OEWS occupation-by-area data is not imported yet. Licensed benchmark datasets are not claimed unless configured or entered from a verified source.
- Craftsman NEC is integrated as a server-side, read-only costbook/category/price-row browser. Configure `CRAFTSMAN_API_KEY` and `CRAFTSMAN_API_URL` as server environment variables; the API key is sent only in the upstream `API-Key` header and is never exposed to the browser. For local sandbox testing, use the supplied sandbox endpoint in an ignored `.env.local` file. Craftsman explicitly says sandbox data is demo-only and must not be used in a live application, estimates, or quotes. Do not set sandbox credentials in production. A licensed production connection must be separately authorized and its geographic-adjustment behavior verified before using it for pricing.
