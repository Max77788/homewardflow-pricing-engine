import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4173);
const cache = new Map();
const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

app.use(express.json({ limit: '64kb' }));

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function observationDate(row) {
  return `${row.year}-${row.period.slice(1)}`;
}

async function fetchBls(seriesId) {
  const cacheKey = `bls:${seriesId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await fetch(BLS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'HomewardFlowPricingEngine/1.0' },
    body: JSON.stringify({ seriesid: [seriesId], startyear: '2024', endyear: String(new Date().getUTCFullYear()) }),
  });
  if (!response.ok) throw new Error(`BLS returned HTTP ${response.status}`);
  const payload = await response.json();
  const series = payload.Results?.series?.[0];
  if (!series || !series.data?.length) throw new Error(`BLS returned no observations for ${seriesId}`);
  const value = {
    seriesId,
    observations: series.data.filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period)).map((row) => ({
      date: observationDate(row), value: Number(row.value), period: row.period,
    })).sort((a, b) => a.date.localeCompare(b.date)),
    fetchedAt: new Date().toISOString(),
    sourceUrl: `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}`,
  };
  cache.set(cacheKey, { value, expires: Date.now() + 15 * 60 * 1000 });
  return value;
}

app.get('/api/market-data', async (req, res) => {
  const seriesId = String(req.query.seriesId || 'WPUIP2321001');
  const baseMonth = String(req.query.baseMonth || '2025-01');
  if (!/^WPU[A-Z0-9]+$/.test(seriesId)) return res.status(400).json({ error: 'seriesId must be a BLS PPI series ID.' });
  if (!validMonth(baseMonth)) return res.status(400).json({ error: 'baseMonth must use YYYY-MM.' });
  try {
    const data = await fetchBls(seriesId);
    const current = data.observations.at(-1);
    const base = data.observations.filter((row) => row.date <= baseMonth).at(-1);
    if (!current || !base) return res.status(404).json({ error: 'No BLS observation is available for the requested base month.', seriesId, baseMonth });
    return res.json({
      source: 'BLS Producer Price Index API', seriesId, sourceUrl: data.sourceUrl,
      fetchedAt: data.fetchedAt, current, base,
      materialIndexFactor: current.value / base.value,
      observationCount: data.observations.length,
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'BLS data request failed' });
  }
});

app.get('/api/source-status', (_req, res) => res.json({
  sources: [
    { id: 'bls-ppi', name: 'BLS Producer Price Index', status: 'live_api', note: 'Used for material escalation from the selected base month.' },
    { id: 'bls-ces', name: 'BLS Construction Average Hourly Earnings', status: 'live_api', note: 'No-key nationwide construction wage baseline; local labor overrides remain available.' },
    { id: 'oews', name: 'BLS Occupational Employment and Wage Statistics', status: 'public_file', note: 'Official public annual OEWS files can be imported when a release is selected; no API key is required.' },
    { id: 'census-acs', name: 'U.S. Census American Community Survey', status: process.env.CENSUS_API_KEY ? 'live_api' : 'key_required', note: process.env.CENSUS_API_KEY ? 'Nationwide housing-unit context from the 2023 ACS 5-year API.' : 'Add CENSUS_API_KEY to enable this source.' },
    { id: 'census-permits', name: 'U.S. Census Building Permits Survey', status: 'not_configured', note: 'Not enabled until a verified Building Permits dataset and release are configured.' },
    { id: 'craftsman', name: 'Craftsman', status: process.env.CRAFTSMAN_API_URL ? 'configured' : 'not_configured', note: 'Optional licensed market benchmark adapter. No benchmark values are fabricated when unavailable.' },
  ],
}));

app.get('/api/labor-data', async (_req, res) => {
  try {
    const response = await fetch(BLS_API, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'HomewardFlowPricingEngine/1.0' }, body: JSON.stringify({ seriesid: ['CES2000000003'], startyear: String(new Date().getUTCFullYear() - 2), endyear: String(new Date().getUTCFullYear()) }) });
    if (!response.ok) throw new Error(`BLS returned HTTP ${response.status}`);
    const payload = await response.json();
    const rows = payload.Results?.series?.[0]?.data?.filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period)) || [];
    const current = rows.sort((a, b) => `${a.year}-${a.period}`.localeCompare(`${b.year}-${b.period}`)).at(-1);
    if (!current) throw new Error('BLS returned no construction wage observations.');
    return res.json({ source: 'BLS CES construction average hourly earnings', seriesId: 'CES2000000003', current: { date: `${current.year}-${current.period.slice(1)}`, value: Number(current.value) }, sourceUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data/CES2000000003' });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'BLS labor request failed' }); }
});

async function censusJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'HomewardFlowPricingEngine/1.0' } });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`Census returned HTTP ${response.status}`);
  if (!contentType.includes('json')) throw new Error('Census returned a non-JSON response.');
  return response.json();
}

app.get('/api/construction-data', async (_req, res) => {
  if (!process.env.CENSUS_API_KEY) return res.status(424).json({ error: 'Census API key required in this deployment environment.', status: 'key_required' });
  try {
    const acs = await censusJson(`https://api.census.gov/data/2023/acs/acs5?get=NAME,B25001_001E&for=us:1&key=${encodeURIComponent(process.env.CENSUS_API_KEY)}`);
    const housingUnits = Number(acs?.[1]?.[1]);
    if (!Number.isFinite(housingUnits)) throw new Error('Census ACS returned no housing-unit value.');
    return res.json({ source: 'U.S. Census Bureau American Community Survey API', housingUnits: { value: housingUnits, year: 2023 }, permits: null, notes: ['Building Permits data is not enabled because the Census endpoint requires a separate dataset configuration.'] });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Census request failed', status: 'upstream_error' }); }
});

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => console.log(`HomewardFlow pricing engine listening on ${PORT}`));
