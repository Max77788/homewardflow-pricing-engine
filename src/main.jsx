import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import { CraftsmanPanel } from './craftsman-panel.jsx';
import { CONDITIONS, QUALITY, SCOPE_CATALOG, DEMO_LABOR_RATE, DEFAULT_PPI_SERIES, calculateEstimate, clampMarginPct, validateEstimateInput, JOB_TEMPLATES, initTemplateState, calculatePricing, generateScope } from './calculations.js';
import { normalizePriceBookRows, parseCsv, validateProfileName } from './price-book.js';
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

const DRAFT_KEY = 'homewardflow-pricing-draft-v1';
const COST_MODELS_KEY = 'homewardflow-contractor-cost-models-v1';
const readModels = () => {
  try { const data = JSON.parse(localStorage.getItem(COST_MODELS_KEY) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; }
};
const savedModels = readModels();
const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
};
const savedDraft = readDraft();
const savedActiveModel = savedModels.find((model) => model.id === savedDraft?.costModelId) || null;
const DEFAULT_PROJECT = { projectName: '', clientName: '', address: '', city: '', stateCode: 'MD', zip: '', baseMonth: '2025-01', marginPct: 35, conditionId: 'normal', qualityId: 'standard', seriesId: DEFAULT_PPI_SERIES };

export default function App() {
  const [project, setProject] = useState(() => ({ ...DEFAULT_PROJECT, ...(savedDraft?.project || {}) }));
  const [items, setItems] = useState(() => savedDraft?.items || { drywall: true, vanity: true });
  const [inputs, setInputs] = useState(() => ({ ...Object.fromEntries(SCOPE_CATALOG.map((catalog) => [catalog.id, emptyItem(catalog)])), ...(savedDraft?.inputs || {}) }));
  const [market, setMarket] = useState(null);
  const [sources, setSources] = useState([]);
  const [marketState, setMarketState] = useState('loading');
  const [labor, setLabor] = useState(null);
  const [construction, setConstruction] = useState(null);
  const [priceParity, setPriceParity] = useState(null);
  const [errors, setErrors] = useState([]);
  const [openBom, setOpenBom] = useState({});
  const [jobType, setJobType] = useState(() => JOB_TEMPLATES[savedDraft?.jobType] ? savedDraft.jobType : 'painting');
  const [jobState, setJobState] = useState(() => savedDraft?.jobState || initTemplateState(JOB_TEMPLATES.painting));
  const [jobBuffer, setJobBuffer] = useState(() => Number.isFinite(savedDraft?.jobBuffer) ? savedDraft.jobBuffer : 8);
  const [draftSaved, setDraftSaved] = useState(Boolean(savedDraft));
  const [costModels, setCostModels] = useState(savedModels);
  const [activeCostModelId, setActiveCostModelId] = useState(savedDraft?.costModelId || '');
  const [profileName, setProfileName] = useState(savedActiveModel?.name || '');
  const [profileMargin, setProfileMargin] = useState(String(savedActiveModel?.defaultMarginPct ?? 35));
  const [profileApplyPpi, setProfileApplyPpi] = useState(Boolean(savedActiveModel?.applyPpi));
  const [pendingRecords, setPendingRecords] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [importMessage, setImportMessage] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const activeCostModel = costModels.find((model) => model.id === activeCostModelId) || null;

  const applyCostModel = (model) => {
    setActiveCostModelId(model?.id || '');
    if (!model) {
      setProfileName(''); setProfileMargin('35'); setProfileApplyPpi(false);
      setProject((current) => ({ ...current, marginPct: DEFAULT_PROJECT.marginPct }));
      setInputs(Object.fromEntries(SCOPE_CATALOG.map((catalog) => [catalog.id, emptyItem(catalog)])));
      setItems({ drywall: true, vanity: true });
      return;
    }
    setProfileName(model.name);
    setProfileMargin(String(model.defaultMarginPct ?? 35));
    setProfileApplyPpi(Boolean(model.applyPpi));
    setProject((current) => ({ ...current, marginPct: model.defaultMarginPct ?? current.marginPct }));
    setInputs((current) => {
      const next = { ...current };
      for (const record of model.records) {
        next[record.id] = { ...(next[record.id] || { quantity: 1 }), ...record };
      }
      return next;
    });
    const scopeIds = [...new Set([...SCOPE_CATALOG.map((catalog) => catalog.id), ...model.records.map((record) => record.id)])];
    setItems(Object.fromEntries(scopeIds.map((id) => [id, model.records.some((record) => record.id === id)])));
  };

  const scopeCatalog = useMemo(() => {
    const records = activeCostModel?.records || [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const builtIns = SCOPE_CATALOG.map((catalog) => {
      const record = byId.get(catalog.id);
      return record ? { ...catalog, ...record, demoMaterial: record.materialCostPerUnit, demoHours: record.laborHoursPerUnit, demoLow: record.benchmarkLow, demoMedian: record.benchmarkMedian, demoP60: record.benchmarkP60 } : catalog;
    });
    const known = new Set(SCOPE_CATALOG.map((catalog) => catalog.id));
    const custom = records.filter((record) => !known.has(record.id)).map((record) => ({ ...record, demoMaterial: record.materialCostPerUnit, demoHours: record.laborHoursPerUnit, demoLow: record.benchmarkLow, demoMedian: record.benchmarkMedian, demoP60: record.benchmarkP60 }));
    return [...builtIns, ...custom];
  }, [activeCostModel]);

  useEffect(() => {
    try { localStorage.setItem(COST_MODELS_KEY, JSON.stringify(costModels)); } catch { setImportMessage('Could not save cost models in this browser. Storage may be full.'); }
  }, [costModels]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ project, items, inputs, jobType, jobState, jobBuffer, costModelId: activeCostModelId }));
      setDraftSaved(true);
    } catch { setDraftSaved(false); }
  }, [activeCostModelId, inputs, items, jobBuffer, jobState, jobType, project]);

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
    fetch(`/api/price-parity?stateCode=${encodeURIComponent(project.stateCode)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(setPriceParity)
      .catch(() => setPriceParity(null));
  }, [project.stateCode]);

  useEffect(() => {
    Promise.all([fetch('/api/labor-data').then((response) => response.ok ? response.json() : null), fetch(`/api/construction-data?stateCode=${encodeURIComponent(project.stateCode)}`).then((response) => response.ok ? response.json() : null)])
      .then(([laborData, constructionData]) => {
        setLabor(laborData); setConstruction(constructionData);
        if (laborData?.current?.value && !activeCostModelId) setInputs((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, item.laborRate === '' || item.laborRate === DEMO_LABOR_RATE ? { ...item, laborRate: laborData.current.value } : item])));
      })
      .catch(() => {});
  }, [activeCostModelId, project.stateCode]);

  const selectedItems = useMemo(() => scopeCatalog.filter((catalog) => items[catalog.id]).map((catalog) => ({ ...emptyItem(catalog), ...inputs[catalog.id], id: catalog.id })), [items, inputs, scopeCatalog]);
  const condition = CONDITIONS.find((entry) => entry.id === project.conditionId) || CONDITIONS[0];
  const quality = QUALITY.find((entry) => entry.id === project.qualityId) || QUALITY[1];
  const materialIndexFactor = activeCostModel && !activeCostModel.applyPpi ? 1 : market?.materialIndexFactor || 1;
  const estimate = useMemo(() => calculateEstimate({ marginPct: Number(project.marginPct), conditionMult: condition.mult, qualityMult: quality.mult, materialIndexFactor, items: selectedItems }), [condition.mult, materialIndexFactor, project.marginPct, quality.mult, selectedItems]);

  const updateProject = (key, value) => setProject((current) => ({ ...current, [key]: value }));
  const updateInput = (id, key, value) => setInputs((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  const toggle = (id) => setItems((current) => ({ ...current, [id]: !current[id] }));
  const parseCostFile = async (file) => {
    setImportErrors([]); setImportMessage(''); setPendingRecords(null); setImportFileName('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setImportErrors(['File exceeds the 5 MB limit.']); return; }
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx'].includes(extension)) { setImportErrors(['Choose a .csv or .xlsx file. Legacy .xls is not supported.']); return; }
    setImportBusy(true);
    try {
      let rows;
      if (extension === 'csv') rows = parseCsv(await file.text());
      else {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const sheets = await readXlsxFile(file);
        rows = sheets[0]?.data || [];
      }
      const result = normalizePriceBookRows(rows);
      setPendingRecords(result.records);
      setImportErrors(result.errors);
      setImportFileName(file.name);
      if (!profileName.trim()) setProfileName(file.name.replace(/\.(csv|xlsx)$/i, '').slice(0, 60));
      if (!result.errors.length) setImportMessage(`${result.records.length} cost rows ready to preview and save.`);
    } catch (error) {
      setImportErrors([error instanceof Error ? error.message : 'Could not read this file. Check that it is a valid CSV or XLSX workbook.']);
    } finally { setImportBusy(false); }
  };
  const saveCostModel = () => {
    const nameError = validateProfileName(profileName);
    if (nameError) { setImportErrors([nameError]); return; }
    const margin = Number(profileMargin);
    if (!Number.isFinite(margin) || margin < 0 || margin > 90) { setImportErrors(['Default target margin must be between 0% and 90%.']); return; }
    if (!pendingRecords?.length || importErrors.length) return;
    const existing = costModels.find((model) => model.name.toLowerCase() === profileName.trim().toLowerCase());
    const model = { id: existing?.id || (globalThis.crypto?.randomUUID?.() || `model-${Date.now()}`), name: profileName.trim(), defaultMarginPct: margin, applyPpi: profileApplyPpi, records: pendingRecords, sourceFile: importFileName, updatedAt: new Date().toISOString() };
    if (!existing && costModels.length >= 20) { setImportErrors(['This browser can store up to 20 cost models. Remove one before adding another.']); return; }
    const next = existing ? costModels.map((entry) => entry.id === existing.id ? model : entry) : [...costModels, model];
    setCostModels(next);
    applyCostModel(model);
    setImportMessage(`${model.name} applied: ${model.records.length} scopes loaded. Your estimate now uses these rates.`);
    setImportErrors([]);
  };
  const removeActiveCostModel = () => {
    if (!activeCostModel || !window.confirm(`Remove the saved model “${activeCostModel.name}” from this browser?`)) return;
    setCostModels((current) => current.filter((model) => model.id !== activeCostModel.id));
    applyCostModel(null);
    setImportMessage('Saved model removed. The estimate was reset to the starter rates.');
  };
  const validate = () => {
    const next = validateEstimateInput({ ...project, items: selectedItems });
    setErrors(next);
    return next.length === 0;
  };
  const fmtMoney = (value) => value === null ? 'Unavailable' : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmt2 = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const jobTemplate = JOB_TEMPLATES[jobType];
  const jobPricing = useMemo(() => calculatePricing(jobTemplate, jobState, project.marginPct, jobBuffer), [jobTemplate, jobState, project.marginPct, jobBuffer]);

  return <main className="pim-root">
    <header className="pim-head">
      <div><div className="brand-kicker">HOMEWARDFLOW <span>·</span> CONTRACTOR WORKSPACE</div><h1>Build a confident estimate.</h1><div className="pim-ticketno">Local costs, transparent assumptions, and a client-ready quote.</div></div>
      <div className="pim-meta">{project.city || 'City'} · {STATES.find(([code]) => code === project.stateCode)?.[1]}<br />{activeCostModel && !activeCostModel.applyPpi ? 'Imported costs · no PPI adjustment' : `BLS PPI factor · ${market ? `×${market.materialIndexFactor.toFixed(4)}` : marketState}`}</div>
    </header>
    <div className="workspace-actions"><span className="save-status"><i className={draftSaved ? 'saved-dot' : 'unsaved-dot'} />{draftSaved ? 'Draft saved in this browser' : 'Draft could not be saved'}</span><div><button type="button" className="secondary-button" onClick={() => window.print()}>Print / Save PDF</button><button type="button" className="secondary-button" onClick={() => { if (window.confirm('Start a new estimate? This clears the current browser draft.')) { localStorage.removeItem(DRAFT_KEY); window.location.reload(); } }}>New estimate</button></div></div>
    <p className="privacy-note">Your estimate draft is stored only in this browser. It is not uploaded to a server.</p>
    <div className="print-meta"><strong>{project.projectName || 'Untitled estimate'}</strong>{project.clientName && <span>Client: {project.clientName}</span>}{(project.address || project.city || project.stateCode) && <span>{[project.address, project.city, project.stateCode, project.zip].filter(Boolean).join(', ')}</span>}<span>Prepared {new Date().toLocaleDateString()}</span><span className="print-caveat">Verify starter rates and market benchmarks against current local sources. Add taxes, permits, disposal, travel, and other applicable costs before issuing the quote.</span></div>

    <section className="scope-header"><h2>1. Project details</h2><p>Set the job location and pricing assumptions.</p></section>
    <section className="pim-settings">
      <Field label="Project name"><input value={project.projectName} onChange={(e) => updateProject('projectName', e.target.value)} placeholder="Blue Tape estimate" /></Field>
      <Field label="Client / company"><input value={project.clientName} onChange={(e) => updateProject('clientName', e.target.value)} placeholder="Client name" /></Field>
      <Field label="Property address"><input value={project.address} onChange={(e) => updateProject('address', e.target.value)} placeholder="Street address" /></Field>
      <Field label="City"><input value={project.city} onChange={(e) => updateProject('city', e.target.value)} placeholder="Baltimore" /></Field>
      <Field label="State"><select value={project.stateCode} onChange={(e) => updateProject('stateCode', e.target.value)}>{STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></Field>
      <Field label="ZIP code"><input inputMode="numeric" maxLength="5" value={project.zip} onChange={(e) => updateProject('zip', e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="21201" /></Field>
      <Field label="Condition"><select value={project.conditionId} onChange={(e) => updateProject('conditionId', e.target.value)}>{CONDITIONS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · ×{entry.mult.toFixed(2)}</option>)}</select></Field>
      <Field label="Quality tier"><select value={project.qualityId} onChange={(e) => updateProject('qualityId', e.target.value)}>{QUALITY.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · ×{entry.mult.toFixed(2)}</option>)}</select></Field>
      <Field label="Target margin (%)"><input type="number" min="0" max="90" value={project.marginPct} onChange={(e) => updateProject('marginPct', clampMarginPct(e.target.value))} /><small>fully loaded cost ÷ (1 - margin)</small></Field>
      <Field label="Material base month"><input type="month" value={project.baseMonth} onChange={(e) => updateProject('baseMonth', e.target.value)} /><small>BLS PPI escalation anchor</small></Field>
      <Field label="BLS PPI series"><input value={project.seriesId} onChange={(e) => updateProject('seriesId', e.target.value.toUpperCase())} /><small>Default {DEFAULT_PPI_SERIES}. Verify series meaning before production use.</small></Field>
      <div className="source-card"><strong>Material index source</strong><span className={marketState === 'ready' ? 'ok' : 'warn'}>{marketState === 'ready' ? 'BLS observation loaded' : marketState === 'loading' ? 'Loading BLS...' : 'BLS unavailable · factor defaults to 1.00'}</span>{market && <small>{market.current.date} · {market.current.value} index · fetched {new Date(market.fetchedAt).toLocaleString()}</small>}</div>
      <div className="source-card"><strong>Public market context</strong>{labor && <small>Construction wage baseline: ${labor.current.value.toFixed(2)}/hr · nationwide · {labor.current.date}</small>}{construction?.housingUnits?.value ? <small>{construction.housingUnits.value.toLocaleString()} housing units · Census ACS {construction.housingUnits.year}</small> : null}<small>Wage baseline is not a local trade rate. Local labor and verified unit costs remain editable.</small></div>
      <div className="source-card"><strong>Regional price context</strong>{priceParity ? <small>{priceParity.state} all-items index: {priceParity.index.toFixed(1)} · BEA {priceParity.datasetYear} · {priceParity.relativeToNational >= 1 ? '+' : ''}{((priceParity.relativeToNational - 1) * 100).toFixed(1)}% vs. U.S.</small> : <small>BEA regional index unavailable for this state.</small>}<small>Broad regional context only; not construction-specific and not applied to your estimate.</small></div>
    </section>

    <section className="cost-model-panel" aria-labelledby="cost-model-title">
      <div className="cost-model-heading"><div><span className="brand-kicker">CONTRACTOR COST MODEL</span><h2 id="cost-model-title">Use your own price book</h2><p>Import material costs, labor productivity and rates, waste, overhead, and optional benchmarks.</p></div>
        <a className="text-button" href="data:text/csv;charset=utf-8,name%2Cunit%2Cmaterial_cost_per_unit%2Clabor_hours_per_unit%2Clabor_rate%2Ctrade%2Coverhead_pct%2Cwaste_pct%2Cid%2Cbenchmark_low%2Cbenchmark_median%2Cbenchmark_p60%0ADrywall%20replacement%2CSF%2C1.85%2C0.025%2C40%2CDrywall%2C10%2C8%2Cdrywall%2C4.25%2C5.75%2C6.6" download="homewardflow-price-book-template.csv">Download CSV template</a></div>
      <div className="cost-model-controls">
        <Field label="Saved model"><select value={activeCostModelId} onChange={(e) => applyCostModel(costModels.find((model) => model.id === e.target.value) || null)}><option value="">Starter rates</option>{costModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></Field>
        <Field label="Model name"><input value={profileName} maxLength={60} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Baltimore crew costs" /></Field>
        <Field label="Default target margin (%)"><input type="number" min="0" max="90" step="0.1" value={profileMargin} onChange={(e) => setProfileMargin(e.target.value)} /></Field>
        <label className="cost-model-ppi"><input type="checkbox" checked={profileApplyPpi} onChange={(e) => { const applyPpi = e.target.checked; setProfileApplyPpi(applyPpi); if (activeCostModel) setCostModels((current) => current.map((model) => model.id === activeCostModel.id ? { ...model, applyPpi } : model)); }} /><span>Apply BLS PPI escalation to imported material prices</span></label>
        <Field label="Upload CSV or Excel (.xlsx)"><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => parseCostFile(e.target.files?.[0])} /></Field>
      </div>
      <p className="cost-model-note">Required columns: <code>name, unit, material_cost_per_unit, labor_hours_per_unit, labor_rate</code>. Optional: <code>id, trade, overhead_pct, waste_pct, benchmark_low, benchmark_median, benchmark_p60</code>. CSV and .xlsx only; maximum 5 MB and 1,000 rows. Imported files are parsed in your browser and not uploaded.</p>
      {importBusy && <p role="status">Reading and validating {importFileName || 'file'}…</p>}
      {importErrors.length > 0 && <div className="cost-model-errors" role="alert"><strong>Fix these import issues before applying:</strong>{importErrors.map((error) => <div key={error}>{error}</div>)}</div>}
      {importMessage && <p className="cost-model-status" role="status">{importMessage}</p>}
      {pendingRecords?.length > 0 && <>
        <div className="price-book-preview"><strong>Preview ({pendingRecords.length} rows)</strong><div className="table-scroll"><table><thead><tr><th>Scope</th><th>Unit</th><th>Material / unit</th><th>Labor hrs / unit</th><th>Labor / hr</th><th>Overhead</th><th>Waste</th></tr></thead><tbody>{pendingRecords.slice(0, 8).map((record) => <tr key={record.id}><td>{record.name}</td><td>{record.unit}</td><td>{fmt2(record.materialCostPerUnit)}</td><td>{record.laborHoursPerUnit}</td><td>{fmt2(record.laborRate)}</td><td>{record.overheadPct}%</td><td>{record.wastePct}%</td></tr>)}</tbody></table></div>{pendingRecords.length > 8 && <small>Showing 8 of {pendingRecords.length} rows.</small>}</div>
        <button type="button" className="primary-button" disabled={importBusy || importErrors.length > 0} onClick={saveCostModel}>{costModels.some((model) => model.name.toLowerCase() === profileName.trim().toLowerCase()) ? 'Replace and apply cost model' : 'Save and apply cost model'}</button>
      </>}
      {activeCostModel && <div className="cost-model-active"><span>Active model: <strong>{activeCostModel.name}</strong> · {activeCostModel.records.length} scopes</span><button type="button" className="text-button" onClick={removeActiveCostModel}>Remove saved model</button></div>}
      <small className="cost-model-storage-note">Models are saved only in this browser on this device. They are not tied to a login, synced to other devices, or uploaded to an account.</small>
    </section>

    <CraftsmanPanel />

    <section className="scope-header"><h2>2. Add work items</h2><p>{activeCostModel ? `Rates loaded from ${activeCostModel.name}. Edit any value for this estimate.` : 'Sample starter values are estimates only. Verify against your own supplier and labor costs.'}</p></section>
    <div className="pim-scope-grid">{scopeCatalog.map((catalog) => <div className={`scope-card ${items[catalog.id] ? 'selected' : ''}`} key={catalog.id}>
      <label className="scope-title"><input type="checkbox" checked={!!items[catalog.id]} onChange={() => toggle(catalog.id)} /><span>{catalog.name}<small>/{catalog.unit} · {catalog.trade}</small></span></label>
      {items[catalog.id] && <div className="scope-inputs">
        <Field label={`Quantity (${catalog.unit})`}><input type="number" min="0" value={inputs[catalog.id].quantity} onChange={(e) => updateInput(catalog.id, 'quantity', e.target.value)} /></Field>
        <Field label={`Materials / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].materialCostPerUnit} onChange={(e) => updateInput(catalog.id, 'materialCostPerUnit', e.target.value)} placeholder="Required" /></Field>
        <Field label={`Labor hours / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].laborHoursPerUnit} onChange={(e) => updateInput(catalog.id, 'laborHoursPerUnit', e.target.value)} placeholder="Required" /></Field>
        <Field label="Labor rate / hour"><input type="number" min="0" step="0.01" value={inputs[catalog.id].laborRate} onChange={(e) => updateInput(catalog.id, 'laborRate', e.target.value)} placeholder="OEWS/local" /></Field>
        <Field label="Material waste (%)"><input type="number" min="0" step="0.1" value={inputs[catalog.id].wastePct ?? 0} onChange={(e) => updateInput(catalog.id, 'wastePct', e.target.value)} /></Field>
        <Field label="Overhead allocation (%)"><input type="number" min="0" step="0.1" value={inputs[catalog.id].overheadPct ?? 0} onChange={(e) => updateInput(catalog.id, 'overheadPct', e.target.value)} /></Field>
        <Field label={`Market low / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].benchmarkLow ?? ''} onChange={(e) => updateInput(catalog.id, 'benchmarkLow', e.target.value)} placeholder="Optional" /></Field>
        <Field label={`Market median / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].benchmarkMedian ?? ''} onChange={(e) => updateInput(catalog.id, 'benchmarkMedian', e.target.value)} placeholder="Optional" /></Field>
        <Field label={`Market P60 / ${catalog.unit}`}><input type="number" min="0" step="0.01" value={inputs[catalog.id].benchmarkP60 ?? ''} onChange={(e) => updateInput(catalog.id, 'benchmarkP60', e.target.value)} placeholder="Optional" /></Field>
      </div>}
    </div>)}</div>

    <section className="quick-estimate">
      <div className="scope-header"><h2>Quick job presets</h2><p>Fast planning ranges for common small jobs. Verify before quoting.</p></div>
      <div className="template-row">{Object.entries(JOB_TEMPLATES).map(([id, template]) => <button type="button" key={id} className={`tbtn ${jobType === id ? 'active' : ''}`} onClick={() => { setJobType(id); setJobState(initTemplateState(template)); }}>{template.name}</button>)}</div>
      <div className="quick-grid"><Field label={jobTemplate.qtyLabel}><div className="stepper"><button type="button" onClick={() => setJobState((s) => ({ ...s, qty: Math.max(1, s.qty - 1) }))}>-</button><span>{jobState.qty}</span><button type="button" onClick={() => setJobState((s) => ({ ...s, qty: Math.min(10, s.qty + 1) }))}>+</button></div></Field>
        <Field label="Scope permutations">{jobTemplate.options.map((option) => <label className="quick-option" key={option.id}><input type="checkbox" checked={!!jobState[option.id]} onChange={(e) => setJobState((s) => ({ ...s, [option.id]: e.target.checked }))} /><span>{option.label}</span></label>)}</Field>
        <Field label={jobType === 'faucet' ? 'Finish' : 'Prep / condition level'}><div className="quick-radios">{jobTemplate.prep.map((prep) => <label key={prep.id}><input type="radio" name="quick-prep" checked={jobState.prep === prep.id} onChange={() => setJobState((s) => ({ ...s, prep: prep.id }))} />{prep.label}</label>)}</div></Field>
        <Field label="Unknown-work buffer"><div className="range-line"><input type="range" min="0" max="60" value={jobBuffer} onChange={(e) => setJobBuffer(Number(e.target.value))} /><span>{jobBuffer}%</span></div></Field>
      </div><div className="quick-result"><div><small>Recommended price before buffer</small><strong>{fmtMoney(jobPricing.recommended)}</strong></div><div><small>Quote total</small><strong>{fmtMoney(jobPricing.total)}</strong></div><p>{generateScope(jobTemplate, jobState)}</p></div>
    </section>

    {errors.length > 0 && <div className="error-box"><strong>Review these items before quoting</strong>{errors.map((error) => <div key={error}>{error}</div>)}</div>}
    <button className="primary-button" onClick={validate}>Check estimate inputs</button>

    <h2 className="section-label">3. Estimate summary</h2>
    <section className="pim-summary">
      <div className="pim-summary-grid"><Metric label="Total direct cost" value={fmtMoney(estimate.direct)} /><Metric label="Overhead allocation" value={fmtMoney(estimate.overhead)} /><Metric label="Market median" value={fmtMoney(estimate.marketMedian)} /><Metric label="Recommended price" value={fmtMoney(estimate.recommended)} /><Metric label="Benchmark coverage" value={estimate.benchmarkCoverage === null ? 'Unavailable' : `${estimate.benchmarkCoverage}%`} /></div>
      <div className="pim-bar-label"><span>labor / materials composition</span><span>{fmtMoney(estimate.labor)} labor · {fmtMoney(estimate.materials)} materials</span></div>
      <div className="pim-bar"><div className="seg-labor" style={{ width: `${estimate.direct ? estimate.labor / estimate.direct * 100 : 0}%` }} /><div className="seg-materials" style={{ width: `${estimate.direct ? estimate.materials / estimate.direct * 100 : 0}%` }} /></div>
      <div className="summary-note">{estimate.marketMedian === null ? 'Market benchmarks are unavailable until a licensed source or verified internal benchmark is connected.' : `Market position: ${fmtMoney(estimate.marketLow)} low · ${fmtMoney(estimate.marketMedian)} median · ${fmtMoney(estimate.marketP60)} P60`}</div>
    </section>

    <h2 className="section-label">Line items</h2>
    {estimate.items.length === 0 ? <div className="pim-empty">Select at least one scope above.</div> : estimate.items.map((item) => <article className="line-card" key={item.id}>
      <div className="line-head"><div><h3>{scopeCatalog.find((entry) => entry.id === item.id)?.name}</h3><small>{item.quantity} units · {item.benchmarkSpread === null ? 'benchmark unavailable' : `benchmark range spread ${item.benchmarkSpread}%`}</small></div><span className={`badge ${item.marginConflict === true ? 'flag' : item.marginConflict === false ? 'ok' : 'neutral'}`}>{item.marginConflict === true ? 'margin conflict' : item.marginConflict === false ? 'on target' : 'needs benchmark'}</span></div>
      <div className="line-body"><div className="figures"><Row label="Materials" value={fmt2(item.materialsTotal)} /><Row label="Labor" value={fmt2(item.laborTotal)} /><Row label="Direct cost" value={fmt2(item.directTotal)} bold /><Row label="Overhead" value={fmt2(item.overheadTotal)} /><Row label="Fully loaded cost" value={fmt2(item.fullyLoadedTotal)} bold /><Row label="Recommended price" value={fmt2(item.recommendedPrice)} bold /></div><div className="benchmark"><strong>Benchmark evidence</strong><p>{item.benchmark ? `${fmt2(item.benchmark.low)} low · ${fmt2(item.benchmark.median)} median · ${fmt2(item.benchmark.p60)} P60` : 'No verified benchmark entered for this scope.'}</p><button className="text-button" onClick={() => setOpenBom((current) => ({ ...current, [item.id]: !current[item.id] }))}>{openBom[item.id] ? 'Hide' : 'Show'} source inputs</button>{openBom[item.id] && <dl><dt>Material rate</dt><dd>{fmt2(item.materialCostPerUnit)} / unit</dd><dt>Labor hours</dt><dd>{item.laborHoursPerUnit} / unit</dd><dt>Labor rate</dt><dd>{fmt2(item.laborRate)} / hour</dd><dt>Material waste</dt><dd>{item.wastePct || 0}%</dd><dt>Overhead</dt><dd>{item.overheadPct || 0}%</dd><dt>Material PPI factor</dt><dd>{materialIndexFactor.toFixed(4)}{activeCostModel && !activeCostModel.applyPpi ? ' · disabled for imported current costs' : ''}</dd></dl>}</div></div>
    </article>)}

    <section className="data-footer"><strong>Connected data sources</strong>{sources.map((source) => <div key={source.id}><span>{source.name}</span><em className={source.status === 'live_api' ? 'ok' : ['not_configured', 'sandbox_demo'].includes(source.status) ? 'warn' : ''}>{source.status}</em><small>{source.note}</small></div>)}</section>
    <footer className="pim-footer">This estimator uses live BLS PPI observations for material escalation and user-entered local rates. Craftsman NEC is available below as a read-only data browser; sandbox data is demo-only and is never used in estimates or quotes.</footer>
  </main>;
}

function Field({ label, children }) { return <div className="field"><span>{label}</span>{children}</div>; }
function Metric({ label, value }) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }
function Row({ label, value, bold }) { return <div className={`fig-row ${bold ? 'bold' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }

createRoot(document.getElementById('root')).render(<App />);
