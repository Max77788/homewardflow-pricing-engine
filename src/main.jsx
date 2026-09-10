import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import { CONDITIONS, QUALITY, SCOPE_CATALOG, DEMO_LABOR_RATE, calculateEstimate, validateEstimateInput } from './calculations.js';
import './styles.css';

const STATES = [
  ['DC', 'District of Columbia'], ['MD', 'Maryland'], ['VA', 'Virginia'], ['PA', 'Pennsylvania'],
  ['NC', 'North Carolina'], ['GA', 'Georgia'], ['FL', 'Florida'], ['TX', 'Texas'], ['IL', 'Illinois'],
  ['NY', 'New York'], ['CA', 'California'], ['MA', 'Massachusetts'], ['WA', 'Washington'], ['OH', 'Ohio'],
];

const emptyItem = (catalog) => ({
  id: catalog.id, quantity: catalog.unit === 'unit' ? 1 : 100,
  materialCostPerUnit: catalog.demoMaterial, laborHoursPerUnit: catalog.demoHours, laborRate: DEMO_LABOR_RATE,
  benchmarkLow: catalog.demoLow, benchmarkMedian: catalog.demoMedian, benchmarkP60: catalog.demoP60,
});

export default function App() {
  const [project, setProject] = useState({ projectName: '', clientName: '', address: '', city: '', stateCode: 'MD', zip: '', baseMonth: '2025-01', marginPct: 35, conditionId: 'normal', qualityId: 'standard', seriesId: 'WPU081' });
  const [items, setItems] = useState({ drywall: true, vanity: true });
  const [inputs, setInputs] = useState(() => Object.fromEntries(SCOPE_CATALOG.map((catalog) => [catalog.id, emptyItem(catalog)])));
  const [market, setMarket] = useState(null);
  const [sources, setSources] = useState([]);
  const [marketState, setMarketState] = useState('loading');
  const [labor, setLabor] = useState(null);
  const [construction, setConstruction] = useState(null);
  const [errors, setErrors] = useState([]);
  const [openBom, setOpenBom] = useState({});

  useEffect(() => {
    fetch(`/api/source-status`).then((response) => response.json()).then((data) => setSources(data.sources || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setMarketState('loading');
    fetch(`/api/market-data?seriesId=${encodeURIComponent(project.seriesId)}&baseMonth=${encodeURIComponent(project.baseMonth)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then((data) => { setMarket(data); setMarketState('ready'); })
      .catch(() => { setMarket(null); setMarketState('error'); });
  }, [project.seriesId, project.baseMonth]);

  useEffect(() => {
    Promise.all([fetch('/api/labor-data').then((response) => response.ok ? response.json() : null), fetch('/api/construction-data').then((response) => response.ok ? response.json() : null)])
      .then(([laborData, constructionData]) => {
        setLabor(laborData); setConstruction(constructionData);
        if (laborData?.current?.value) setInputs((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, item.laborRate === '' || item.laborRate === DEMO_LABOR_RATE ? { ...item, laborRate: laborData.current.value } : item])));
      })
      .catch(() => {});
  }, []);

  const selectedItems = useMemo(() => SCOPE_CATALOG.filter((catalog) => items[catalog.id]).map((catalog) => ({ ...inputs[catalog.id], id: catalog.id })), [items, inputs]);
  const condition = CONDITIONS.find((entry) => entry.id === project.conditionId) || CONDITIONS[0];
  const quality = QUALITY.find((entry) => entry.id === project.qualityId) || QUALITY[1];
  const estimate = useMemo(() => calculateEstimate({ marginPct: Number(project.marginPct), conditionMult: condition.mult, qualityMult: quality.mult, materialIndexFactor: market?.materialIndexFactor || 1, items: selectedItems }), [condition.mult, market?.materialIndexFactor, project.marginPct, quality.mult, selectedItems]);

  const updateProject = (key, value) => setProject((current) => ({ ...current, [key]: value }));
  const updateInput = (id, key, value) => setInputs((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  const toggle = (id) => setItems((current) => ({ ...current, [id]: !current[id] }));
  const validate = () => {
    const next = validateEstimateInput({ ...project, items: selectedItems });
    setErrors(next);
    return next.length === 0;
  };
  const fmtMoney = (value) => value === null ? 'Unavailable' : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmt2 = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return <main className="pim-root">
    <header className="pim-head">
      <div><h1>Pricing Intelligence - Job Estimate</h1><div className="pim-ticketno">HOMEWARDFLOW · LIVE DATA MODE</div></div>
      <div className="pim-meta">{project.city || 'City'} · {STATES.find(([code]) => code === project.stateCode)?.[1]}<br />BLS PPI factor · {market ? `×${market.materialIndexFactor.toFixed(4)}` : marketState}</div>
    </header>

    <section className="pim-settings">
      <Field label="Project name"><input value={project.projectName} onChange={(e) => updateProject('projectName', e.target.value)} placeholder="Blue Tape estimate" /></Field>
      <Field label="Client / company"><input value={project.clientName} onChange={(e) => updateProject('clientName', e.target.value)} placeholder="Client name" /></Field>
      <Field label="Property address"><input value={project.address} onChange={(e) => updateProject('address', e.target.value)} placeholder="Street address" /></Field>
      <Field label="City"><input value={project.city} onChange={(e) => updateProject('city', e.target.value)} placeholder="Baltimore" /></Field>
      <Field label="State"><select value={project.stateCode} onChange={(e) => updateProject('stateCode', e.target.value)}>{STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></Field>
      <Field label="ZIP code"><input inputMode="numeric" maxLength="5" value={project.zip} onChange={(e) => updateProject('zip', e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="21201" /></Field>
      <Field label="Condition"><select value={project.conditionId} onChange={(e) => updateProject('conditionId', e.target.value)}>{CONDITIONS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · ×{entry.mult.toFixed(2)}</option>)}</select></Field>
      <Field label="Quality tier"><select value={project.qualityId} onChange={(e) => updateProject('qualityId', e.target.value)}>{QUALITY.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · ×{entry.mult.toFixed(2)}</option>)}</select></Field>
      <Field label="Target margin (%)"><input type="number" min="0" max="90" value={project.marginPct} onChange={(e) => updateProject('marginPct', e.target.value)} /><small>direct ÷ (1 - margin)</small></Field>
      <Field label="Material base month"><input type="month" value={project.baseMonth} onChange={(e) => updateProject('baseMonth', e.target.value)} /><small>BLS PPI escalation anchor</small></Field>
      <Field label="BLS PPI series"><input value={project.seriesId} onChange={(e) => updateProject('seriesId', e.target.value.toUpperCase())} /><small>Default WPU081. Verify series meaning before production use.</small></Field>
      <div className="source-card"><strong>Source status</strong><span className={marketState === 'ready' ? 'ok' : 'warn'}>{marketState === 'ready' ? 'Live BLS observation loaded' : marketState === 'loading' ? 'Loading BLS...' : 'BLS unavailable'}</span>{market && <small>{market.current.date} · {market.current.value} index · fetched {new Date(market.fetchedAt).toLocaleString()}</small>}</div>
      <div className="source-card"><strong>Public market context</strong>{labor && <small>Construction wage baseline: ${labor.current.value.toFixed(2)}/hr · {labor.current.date}</small>}{construction?.housingUnits?.value ? <small>{construction.housingUnits.value.toLocaleString()} housing units{construction?.permits?.value ? ` · ${construction.permits.value.toLocaleString()} permits` : ''}</small> : null}<small>Context only. Local labor and verified unit costs remain editable.</small></div>
    </section>

    <section className="scope-header"><h2>Scope of work</h2><p>Demo baseline values are preloaded for the presentation. Replace them with verified local costs or licensed benchmark data for production estimates.</p></section>
    <div className="pim-scope-grid">{SCOPE_CATALOG.map((catalog) => <div className={`scope-card ${items[catalog.id] ? 'selected' : ''}`} key={catalog.id}>
      <label className="scope-title"><input type="checkbox" checked={!!items[catalog.id]} onChange={() => toggle(catalog.id)} /><span>{catalog.name}<small>/{catalog.unit} · {catalog.trade}</small></span></label>
      {items[catalog.id] && <div className="scope-inputs">
        <Field label={`Quantity (${catalog.unit})`}><input type="number" min="0" value={inputs[catalog.id].quantity} onChange={(e) => updateInput(catalog.id, 'quantity', e.target.value)} /></Field>
        <Field label={`Materials / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].materialCostPerUnit} onChange={(e) => updateInput(catalog.id, 'materialCostPerUnit', e.target.value)} placeholder="Required" /></Field>
        <Field label={`Labor hours / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].laborHoursPerUnit} onChange={(e) => updateInput(catalog.id, 'laborHoursPerUnit', e.target.value)} placeholder="Required" /></Field>
        <Field label="Labor rate / hour"><input type="number" min="0" step="0.01" value={inputs[catalog.id].laborRate} onChange={(e) => updateInput(catalog.id, 'laborRate', e.target.value)} placeholder="OEWS/local" /></Field>
        <Field label={`Market low / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].benchmarkLow} onChange={(e) => updateInput(catalog.id, 'benchmarkLow', e.target.value)} placeholder="Optional" /></Field>
        <Field label={`Market median / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].benchmarkMedian} onChange={(e) => updateInput(catalog.id, 'benchmarkMedian', e.target.value)} placeholder="Optional" /></Field>
        <Field label={`Market P60 / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].benchmarkP60} onChange={(e) => updateInput(catalog.id, 'benchmarkP60', e.target.value)} placeholder="Optional" /></Field>
      </div>}
    </div>)}</div>

    {errors.length > 0 && <div className="error-box"><strong>Fix before saving estimate</strong>{errors.map((error) => <div key={error}>{error}</div>)}</div>}
    <button className="primary-button" onClick={validate}>Validate estimate inputs</button>

    <h2 className="section-label">Job summary</h2>
    <section className="pim-summary">
      <div className="pim-summary-grid"><Metric label="Total direct cost" value={fmtMoney(estimate.direct)} /><Metric label="Market median" value={fmtMoney(estimate.marketMedian)} /><Metric label="Recommended price" value={fmtMoney(estimate.recommended)} /><Metric label="Confidence" value={estimate.overallConfidence === null ? 'Unavailable' : `${estimate.overallConfidence}%`} /></div>
      <div className="pim-bar-label"><span>labor / materials composition</span><span>{fmtMoney(estimate.labor)} labor · {fmtMoney(estimate.materials)} materials</span></div>
      <div className="pim-bar"><div className="seg-labor" style={{ width: `${estimate.direct ? estimate.labor / estimate.direct * 100 : 0}%` }} /><div className="seg-materials" style={{ width: `${estimate.direct ? estimate.materials / estimate.direct * 100 : 0}%` }} /></div>
      <div className="summary-note">{estimate.marketMedian === null ? 'Market benchmarks are unavailable until a licensed source or verified internal benchmark is connected.' : `Market position: ${fmtMoney(estimate.marketLow)} low · ${fmtMoney(estimate.marketMedian)} median · ${fmtMoney(estimate.marketP60)} P60`}</div>
    </section>

    <h2 className="section-label">Line items</h2>
    {estimate.items.length === 0 ? <div className="pim-empty">Select at least one scope above.</div> : estimate.items.map((item) => <article className="line-card" key={item.id}>
      <div className="line-head"><div><h3>{SCOPE_CATALOG.find((entry) => entry.id === item.id)?.name}</h3><small>{item.quantity} units · {item.confidence === null ? 'benchmark unavailable' : `confidence ${item.confidence}%`}</small></div><span className={`badge ${item.marginConflict === true ? 'flag' : item.marginConflict === false ? 'ok' : 'neutral'}`}>{item.marginConflict === true ? 'margin conflict' : item.marginConflict === false ? 'on target' : 'needs benchmark'}</span></div>
      <div className="line-body"><div className="figures"><Row label="Materials" value={fmt2(item.materialsTotal)} /><Row label="Labor" value={fmt2(item.laborTotal)} /><Row label="Direct cost" value={fmt2(item.directTotal)} bold /><Row label="Recommended price" value={fmt2(item.recommendedPrice)} bold /></div><div className="benchmark"><strong>Benchmark evidence</strong><p>{item.benchmark ? `${fmt2(item.benchmark.low)} low · ${fmt2(item.benchmark.median)} median · ${fmt2(item.benchmark.p60)} P60` : 'No verified benchmark entered for this scope.'}</p><button className="text-button" onClick={() => setOpenBom((current) => ({ ...current, [item.id]: !current[item.id] }))}>{openBom[item.id] ? 'Hide' : 'Show'} source inputs</button>{openBom[item.id] && <dl><dt>Material rate</dt><dd>{fmt2(item.materialCostPerUnit)} / unit</dd><dt>Labor hours</dt><dd>{item.laborHoursPerUnit} / unit</dd><dt>Labor rate</dt><dd>{fmt2(item.laborRate)} / hour</dd><dt>PPI factor</dt><dd>{market ? `×${market.materialIndexFactor.toFixed(4)}` : 'Unavailable'}</dd></dl>}</div></div>
    </article>)}

    <section className="data-footer"><strong>Connected data sources</strong>{sources.map((source) => <div key={source.id}><span>{source.name}</span><em className={source.status === 'live_api' ? 'ok' : source.status === 'not_configured' ? 'warn' : ''}>{source.status}</em><small>{source.note}</small></div>)}</section>
    <footer className="pim-footer">This estimator uses live BLS PPI observations for material escalation and user-entered local rates. It does not claim Craftsman, RSMeans, BNi, or other licensed market data when those connections are not configured.</footer>
  </main>;
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Metric({ label, value }) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }
function Row({ label, value, bold }) { return <div className={`fig-row ${bold ? 'bold' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }

createRoot(document.getElementById('root')).render(<App />);
