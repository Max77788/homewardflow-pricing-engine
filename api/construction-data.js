import { getStateFips } from '../src/price-parity.js';

const CENSUS_API_KEY = process.env.CENSUS_API_KEY;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'HomewardFlowPricingEngine/1.0' } });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`Census returned HTTP ${response.status}`);
  if (!contentType.includes('json')) throw new Error('Census returned a non-JSON response.');
  return response.json();
}

export default async function handler(req, res) {
  const stateCode = String(req.query?.stateCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) return res.status(400).json({ error: 'stateCode must be a 2-letter state or DC code.' });
  const fips = getStateFips(stateCode);
  if (!fips) return res.status(400).json({ error: 'Unsupported state code.' });
  if (!CENSUS_API_KEY) {
    return res.status(424).json({ error: 'Census API key required in this deployment environment.', status: 'key_required' });
  }

  try {
    const acs = await fetchJson(`https://api.census.gov/data/2023/acs/acs5?get=NAME,B25001_001E&for=state:${fips.slice(0, 2)}&key=${encodeURIComponent(CENSUS_API_KEY)}`);
    const housingUnits = Number(acs?.[1]?.[1]);
    if (!Number.isFinite(housingUnits)) throw new Error('Census ACS returned no housing-unit value.');
    return res.json({
      source: 'U.S. Census Bureau American Community Survey API',
      geography: { stateCode, name: acs[1][0] },
      housingUnits: { value: housingUnits, year: 2023 },
      permits: null,
      sourceUrl: 'https://api.census.gov/data/2023/acs/acs5',
      notes: ['Housing-stock context only; this does not affect estimate prices. Building Permits remains a separate unconfigured Census dataset.'],
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Census request failed', status: 'upstream_error' });
  }
}
