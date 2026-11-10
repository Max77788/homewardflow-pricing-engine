import { useEffect, useMemo, useState } from 'react';

async function readCraftsman(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/craftsman?${query}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Craftsman NEC request failed.');
    error.status = response.status;
    error.statusCode = payload.status;
    throw error;
  }
  return payload;
}

const money = (value) => value === null || value === undefined || value === '' ? '—' : Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';

export function CraftsmanPanel() {
  const [costbooks, setCostbooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [selectedBook, setSelectedBook] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [page, setPage] = useState(0);
  const [environment, setEnvironment] = useState('sandbox');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    readCraftsman({ resource: 'costbooks' }).then((result) => {
      if (cancelled) return;
      setCostbooks(Array.isArray(result.data) ? result.data : []);
      setEnvironment(result.environment || 'sandbox');
      setConfigured(true);
    }).catch((reason) => {
      if (cancelled) return;
      if (reason.status === 424) setConfigured(false);
      else setError(reason.message);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedBook) { setCategories([]); setSelectedCategory(''); setCatalog(null); return; }
    let cancelled = false;
    setLoading(true); setError(''); setSelectedCategory(''); setCatalog(null);
    readCraftsman({ resource: 'categories', costbookId: selectedBook }).then((result) => {
      if (!cancelled) setCategories(Array.isArray(result.data) ? result.data : []);
    }).catch((reason) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBook]);

  useEffect(() => {
    if (!selectedCategory) { setCatalog(null); return; }
    let cancelled = false;
    setLoading(true); setError('');
    readCraftsman({ resource: 'costdata', categoryId: selectedCategory, pageNumber: String(page) }).then((result) => {
      if (!cancelled) { setCatalog(result.data); setEnvironment(result.environment || 'sandbox'); }
    }).catch((reason) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCategory, page]);

  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    return categories.filter((category) => !query || `${category.name} ${category.description || ''}`.toLowerCase().includes(query));
  }, [categories, categorySearch]);
  const records = Array.isArray(catalog?.result) ? catalog.result : [];
  const totalPages = Number(catalog?.totalPages) || 0;

  return <section className="craftsman-panel" aria-labelledby="craftsman-title">
    <div className="craftsman-heading">
      <div><span className="brand-kicker">CONNECTED DATA SOURCE</span><h2 id="craftsman-title">Craftsman National Estimator Cloud</h2><p>Browse licensed costbook structure and cost rows through the server-side NEC API connection.</p></div>
      <span className="craftsman-badge">{configured ? (environment === 'sandbox' ? 'SANDBOX · DEMO DATA' : 'PRODUCTION API') : 'NOT CONFIGURED'}</span>
    </div>
    {environment === 'sandbox' && <div className="craftsman-warning" role="note"><strong>Sandbox data only.</strong> Craftsman states sandbox returns demo data and must not be used in a live application. This read-only browser does not load values into estimate calculations or quoting.</div>}
    {!configured && <p className="craftsman-message">Configure <code>CRAFTSMAN_API_KEY</code> and <code>CRAFTSMAN_API_URL</code> on the server to connect NEC. The key is never sent to the browser.</p>}
    {error && <p className="craftsman-error" role="alert">{error}</p>}
    {configured && <div className="craftsman-controls">
      <label><span>Costbook</span><select value={selectedBook} onChange={(event) => { setSelectedBook(event.target.value); setPage(0); }}><option value="">Choose a costbook…</option>{costbooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label>
      <label><span>Find category</span><input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="e.g. drywall, roofing, windows" disabled={!selectedBook} /></label>
      <label><span>Category ({filteredCategories.length})</span><select value={selectedCategory} onChange={(event) => { setSelectedCategory(event.target.value); setPage(0); }} disabled={!selectedBook}><option value="">Choose a category…</option>{filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    </div>}
    {loading && <p className="craftsman-message" role="status">Loading Craftsman data…</p>}
    {selectedCategory && catalog && <>
      <div className="craftsman-results-heading"><strong>{catalog.priceRowCount ?? records.length} price rows</strong><span>{totalPages ? `Page ${page + 1} of ${totalPages}` : 'No pages reported'}</span></div>
      <div className="table-scroll craftsman-table-wrap"><table className="craftsman-table"><thead><tr><th>Item</th><th>Unit</th><th>Hours</th><th>Materials</th><th>Labor</th><th>Equipment</th><th>Total</th></tr></thead><tbody>
        {records.map((record) => { const costs = record.mletCosts || {}; return <tr key={record.id}><td><strong>{record.title || 'Untitled item'}</strong>{record.description && <small>{record.description}</small>}</td><td>{costs.unitOfMeasure || '—'}</td><td>{money(costs.hours)}</td><td>{money(costs.materialCost)}</td><td>{money(costs.laborCost)}</td><td>{money(costs.equipmentCost)}</td><td><strong>{money(costs.totalCost)}</strong></td></tr>; })}
        {!records.length && <tr><td colSpan="7">No cost rows in this category/page.</td></tr>}
      </tbody></table></div>
      <div className="craftsman-pagination"><button type="button" className="secondary-button" disabled={loading || page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><button type="button" className="secondary-button" disabled={loading || page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
    </>}
    <small className="craftsman-source-note">Source: Craftsman National Estimator Cloud API. <a href="https://intercom.help/craftsman/en/articles/9791025-getting-started-with-the-national-estimator-api" target="_blank" rel="noreferrer">Integration documentation</a>. This panel is browse-only; no area adjustment is applied here.</small>
  </section>;
}
