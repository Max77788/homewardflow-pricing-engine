const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const cache = globalThis.__homewardflowBlsCache || (globalThis.__homewardflowBlsCache = new Map());

function validMonth(value) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '')); }
function observationDate(row) { return `${row.year}-${row.period.slice(1)}`; }

async function fetchBls(seriesId) {
  const cached = cache.get(seriesId);
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
    observations: series.data.filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period)).map((row) => ({ date: observationDate(row), value: Number(row.value), period: row.period })).sort((a, b) => a.date.localeCompare(b.date)),
    fetchedAt: new Date().toISOString(),
    sourceUrl: `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}`,
  };
  cache.set(seriesId, { value, expires: Date.now() + 15 * 60 * 1000 });
  return value;
}

export default async function handler(req, res) {
  const seriesId = String(req.query?.seriesId || 'WPUIP2321001');
  const baseMonth = String(req.query?.baseMonth || '2025-01');
  if (!/^WPU[A-Z0-9]+$/.test(seriesId)) return res.status(400).json({ error: 'seriesId must be a BLS PPI series ID.' });
  if (!validMonth(baseMonth)) return res.status(400).json({ error: 'baseMonth must use YYYY-MM.' });
  try {
    const data = await fetchBls(seriesId);
    const current = data.observations.at(-1);
    const base = data.observations.filter((row) => row.date <= baseMonth).at(-1);
    if (!current || !base) return res.status(404).json({ error: 'No BLS observation is available for the requested base month.', seriesId, baseMonth });
    return res.json({ source: 'BLS Producer Price Index API', seriesId, sourceUrl: data.sourceUrl, fetchedAt: data.fetchedAt, current, base, materialIndexFactor: current.value / base.value, observationCount: data.observations.length });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'BLS data request failed' });
  }
}
