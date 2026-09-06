const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const SERIES_ID = 'CES2000000003';
const cache = globalThis.__homewardflowLaborCache || (globalThis.__homewardflowLaborCache = new Map());

async function fetchLabor() {
  const cached = cache.get(SERIES_ID);
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await fetch(BLS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'HomewardFlowPricingEngine/1.0' },
    body: JSON.stringify({ seriesid: [SERIES_ID], startyear: String(new Date().getUTCFullYear() - 2), endyear: String(new Date().getUTCFullYear()) }),
  });
  if (!response.ok) throw new Error(`BLS returned HTTP ${response.status}`);
  const payload = await response.json();
  const rows = payload.Results?.series?.[0]?.data?.filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period)) || [];
  if (!rows.length) throw new Error('BLS returned no construction wage observations.');
  const current = rows.sort((a, b) => `${a.year}-${a.period}`.localeCompare(`${b.year}-${b.period}`)).at(-1);
  const value = { source: 'BLS CES construction average hourly earnings', seriesId: SERIES_ID, current: { date: `${current.year}-${current.period.slice(1)}`, value: Number(current.value) }, sourceUrl: `https://api.bls.gov/publicAPI/v2/timeseries/data/${SERIES_ID}`, fetchedAt: new Date().toISOString() };
  cache.set(SERIES_ID, { value, expires: Date.now() + 15 * 60 * 1000 });
  return value;
}

export default async function handler(_req, res) {
  try { return res.json(await fetchLabor()); }
  catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'BLS labor request failed' }); }
}
