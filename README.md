# HomewardFlow Pricing Engine

Standalone HomewardFlow / Blue Tape residential restoration pricing estimator.

## Features

- Validated project, location, condition, quality, margin, scope, labor, and material inputs
- Live BLS Producer Price Index material escalation adapter
- Optional verified benchmark fields with no fabricated market values
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

## Data-source policy

- BLS PPI is queried live through the API and adjusts user-entered material costs by an index factor. It does not provide local installed-item prices.
- BLS CES construction average hourly earnings is queried live as a nationwide wage baseline; it is not a local trade wage or contractor bill rate.
- BEA state RPPs are bundled as a public annual snapshot (2023) and displayed as general geographic context only. The factor is not applied to estimates because the measure is not construction-specific. Refresh `data/bea-rpp-states.json` when BEA publishes a newer release with `npm run data:update:bea-rpp`.
- Census ACS housing-unit context is state-specific and requires a free `CENSUS_API_KEY` environment variable. Building Permits and Construction Spending remain unconfigured pending verified dataset queries and the same key.
- OEWS occupation-by-area data is not imported yet. Licensed benchmark datasets are not claimed unless configured or entered from a verified source.
