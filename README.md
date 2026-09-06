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

BLS PPI is queried live through the API. OEWS/local labor rates and Craftsman/RSMeans/BNi/1build benchmarks are not claimed unless configured or entered from a verified source.
