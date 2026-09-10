const CENSUS_API_KEY = process.env.CENSUS_API_KEY;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'HomewardFlowPricingEngine/1.0' } });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`Census returned HTTP ${response.status}`);
  if (!contentType.includes('json')) throw new Error('Census returned a non-JSON response.');
  return response.json();
}

export default async function handler(_req, res) {
  if (!CENSUS_API_KEY) {
    return res.status(424).json({
      error: 'Census API key required in this deployment environment.',
      status: 'key_required',
    });
  }

  try {
    const acs = await fetchJson(`https://api.census.gov/data/2023/acs/acs5?get=NAME,B25001_001E&for=us:1&key=${encodeURIComponent(CENSUS_API_KEY)}`);
    const housingUnits = Number(acs?.[1]?.[1]);
    if (!Number.isFinite(housingUnits)) throw new Error('Census ACS returned no housing-unit value.');
    return res.json({
      source: 'U.S. Census Bureau American Community Survey API',
      housingUnits: { value: housingUnits, year: 2023 },
      permits: null,
      notes: ['Building Permits data is not enabled because the Census endpoint requires a separate dataset configuration.'],
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Census request failed', status: 'upstream_error' });
  }
}
