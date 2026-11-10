const DEFAULT_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const allowedHosts = new Set([
  'nec-api-sandbox.craftsman-book.com',
  'nec-api.craftsman-book.com',
]);

function safeId(value) {
  const text = String(value ?? '');
  return /^\d{1,12}$/.test(text) ? text : null;
}

function resolveBaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createCraftsmanHandler({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async function craftsmanHandler(req, res) {
    const apiKey = env.CRAFTSMAN_API_KEY;
    const baseUrl = resolveBaseUrl(env.CRAFTSMAN_API_URL);
    if (!apiKey || !baseUrl) {
      return res.status(424).json({ status: 'not_configured', error: 'Craftsman NEC credentials are not configured on the server.' });
    }

    const query = req.query || {};
    let path;
    if (query.resource === 'costbooks') {
      path = '/Costbooks';
    } else if (query.resource === 'categories') {
      const id = safeId(query.costbookId);
      if (!id) return res.status(400).json({ error: 'costbookId must be a numeric Craftsman costbook ID.' });
      path = `/CostCategories/ByCostbook/${id}`;
    } else if (query.resource === 'costdata') {
      const id = safeId(query.categoryId);
      const page = String(query.pageNumber ?? '0');
      if (!id) return res.status(400).json({ error: 'categoryId must be a numeric Craftsman category ID.' });
      if (!/^\d{1,4}$/.test(page) || Number(page) > 999) return res.status(400).json({ error: 'pageNumber must be an integer between 0 and 999.' });
      path = `/CostData/ByCostCategory/${id}?pageNumber=${Number(page)}&includeText=false`;
    } else {
      return res.status(400).json({ error: 'resource must be costbooks, categories, or costdata.' });
    }

    const url = `${baseUrl}${path}`;
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now()) return res.status(200).json(cached.value);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { 'API-Key': apiKey, accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return res.status(502).json({ status: 'upstream_unauthorized', error: 'Craftsman rejected the configured NEC key. Check the key and matching environment.' });
        }
        return res.status(502).json({ status: 'upstream_error', error: `Craftsman NEC returned HTTP ${response.status}.` });
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('json')) {
        return res.status(502).json({ status: 'upstream_error', error: 'Craftsman NEC returned a non-JSON response.' });
      }
      const data = await response.json();
      const value = {
        data,
        source: 'Craftsman National Estimator Cloud API',
        environment: new URL(baseUrl).hostname.startsWith('nec-api-sandbox.') ? 'sandbox' : 'production',
        fetchedAt: new Date(now()).toISOString(),
      };
      cache.set(url, { value, expiresAt: now() + CACHE_TTL_MS });
      return res.status(200).json(value);
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      return res.status(502).json({
        status: timedOut ? 'timeout' : 'upstream_error',
        error: timedOut ? 'Craftsman NEC request timed out.' : 'Unable to retrieve data from Craftsman NEC.',
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createCraftsmanHandler();
