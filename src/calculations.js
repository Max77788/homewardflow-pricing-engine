export const CONDITIONS = [
  { id: 'normal', label: 'Normal wear', mult: 1 },
  { id: 'deferred', label: 'Deferred maintenance', mult: 1.1 },
  { id: 'water', label: 'Water damage', mult: 1.15 },
  { id: 'fire', label: 'Fire damage', mult: 1.3 },
];

export const QUALITY = [
  { id: 'builder', label: 'Builder grade', mult: 0.9 },
  { id: 'standard', label: 'Standard', mult: 1 },
  { id: 'premium', label: 'Premium', mult: 1.25 },
];

const DEMO_LABOR_RATE = 40;
export { DEMO_LABOR_RATE };

export const DEFAULT_PPI_SERIES = 'WPUIP2321001';

export const SCOPE_CATALOG = [
  { id: 'drywall', name: 'Drywall replacement', unit: 'SF', trade: 'Drywall installers', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 1.85, demoHours: 0.025, demoLow: 4.25, demoMedian: 5.75, demoP60: 6.60 },
  { id: 'vanity', name: 'Vanity replacement', unit: 'unit', trade: 'Plumbers', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 425, demoHours: 4, demoLow: 850, demoMedian: 1150, demoP60: 1325 },
  { id: 'toilet', name: 'Toilet replacement', unit: 'unit', trade: 'Plumbers', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 190, demoHours: 2, demoLow: 425, demoMedian: 575, demoP60: 690 },
  { id: 'flooring', name: 'Flooring replacement (LVP)', unit: 'SF', trade: 'Floor layers', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 3.25, demoHours: 0.035, demoLow: 7.25, demoMedian: 9.50, demoP60: 11.25 },
  { id: 'paint-int', name: 'Interior painting', unit: 'SF', trade: 'Painters', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 0.55, demoHours: 0.012, demoLow: 1.65, demoMedian: 2.35, demoP60: 2.85 },
  { id: 'baseboard', name: 'Baseboard / trim replacement', unit: 'LF', trade: 'Carpenters', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 2.10, demoHours: 0.04, demoLow: 5.25, demoMedian: 7.25, demoP60: 8.50 },
  { id: 'cabinets', name: 'Cabinet replacement', unit: 'LF', trade: 'Carpenters', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 145, demoHours: 0.75, demoLow: 325, demoMedian: 475, demoP60: 575 },
  { id: 'water-heater', name: 'Water heater replacement', unit: 'unit', trade: 'Plumbers', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 850, demoHours: 4, demoLow: 1450, demoMedian: 1850, demoP60: 2200 },
  { id: 'window', name: 'Window replacement', unit: 'unit', trade: 'Carpenters', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 475, demoHours: 3, demoLow: 950, demoMedian: 1250, demoP60: 1500 },
  { id: 'roofing', name: 'Roofing - asphalt shingle', unit: 'SF', trade: 'Roofers', ppiSeries: DEFAULT_PPI_SERIES, demoMaterial: 2.75, demoHours: 0.03, demoLow: 5.50, demoMedian: 7.25, demoP60: 8.75 },
];

const money = (value) => Number(value || 0);

export function clampMarginPct(value) {
  const margin = Number(value);
  if (!Number.isFinite(margin)) return 0;
  return Math.min(90, Math.max(0, margin));
}

export function calculateLineItem(item, marginPct, conditionMult, qualityMult, materialIndexFactor) {
  const quantity = money(item.quantity);
  const materialTotal = money(item.materialCostPerUnit) * quantity * materialIndexFactor * conditionMult * qualityMult;
  const laborTotal = money(item.laborHoursPerUnit) * quantity * money(item.laborRate);
  const directTotal = materialTotal + laborTotal;
  const recommendedPrice = directTotal / (1 - clampMarginPct(marginPct) / 100);
  const benchmark = ['benchmarkLow', 'benchmarkMedian', 'benchmarkP60'].every((key) => Number.isFinite(Number(item[key])) && Number(item[key]) > 0)
    ? {
        low: money(item.benchmarkLow) * quantity,
        median: money(item.benchmarkMedian) * quantity,
        p60: money(item.benchmarkP60) * quantity,
      }
    : null;
  const spread = benchmark ? (benchmark.p60 - benchmark.low) / Math.max(benchmark.median, 1) : null;
  return {
    ...item,
    quantity,
    materialsTotal: materialTotal,
    laborTotal,
    directTotal,
    recommendedPrice,
    benchmark,
    marginConflict: benchmark ? recommendedPrice > benchmark.p60 : null,
    confidence: spread === null ? null : Math.max(40, Math.min(95, Math.round(100 - spread * 140))),
  };
}

export function calculateEstimate({ marginPct, conditionMult, qualityMult, materialIndexFactor, items }) {
  const lineItems = items.map((item) => calculateLineItem(item, marginPct, conditionMult, qualityMult, materialIndexFactor));
  const total = (key) => lineItems.reduce((sum, item) => sum + item[key], 0);
  const benchmarkValues = lineItems.every((item) => item.benchmark);
  const marketLow = benchmarkValues ? lineItems.reduce((sum, item) => sum + item.benchmark.low, 0) : null;
  const marketMedian = benchmarkValues ? lineItems.reduce((sum, item) => sum + item.benchmark.median, 0) : null;
  const marketP60 = benchmarkValues ? lineItems.reduce((sum, item) => sum + item.benchmark.p60, 0) : null;
  const recommended = total('recommendedPrice');
  const weightedConfidence = lineItems.filter((item) => item.confidence !== null).reduce((sum, item) => sum + item.confidence * item.recommendedPrice, 0);
  const confidenceBasis = lineItems.filter((item) => item.confidence !== null).reduce((sum, item) => sum + item.recommendedPrice, 0);
  return {
    items: lineItems,
    direct: total('directTotal'),
    materials: total('materialsTotal'),
    labor: total('laborTotal'),
    recommended,
    marketLow,
    marketMedian,
    marketP60,
    overallConfidence: confidenceBasis ? Math.round(weightedConfidence / confidenceBasis) : null,
    conflicts: lineItems.filter((item) => item.marginConflict).length,
    sources: [
      { name: 'BLS PPI', status: 'live' },
      { name: 'User-entered local labor and material rates', status: 'user_input' },
      { name: 'Market benchmarks', status: benchmarkValues ? 'user_input' : 'missing' },
    ],
  };
}

export function validateEstimateInput(input) {
  const errors = [];
  if (!String(input.projectName || '').trim()) errors.push('Project name is required.');
  if (!String(input.stateCode || '').trim()) errors.push('State is required.');
  if (!/^\d{5}$/.test(String(input.zip || ''))) errors.push('ZIP code must be 5 digits.');
  if (!Number.isFinite(Number(input.marginPct)) || Number(input.marginPct) < 0 || Number(input.marginPct) > 90) errors.push('Target margin must be between 0% and 90%.');
  for (const item of input.items || []) {
    if (!(Number(item.quantity) > 0)) errors.push('Every selected scope must have a quantity greater than zero.');
    if (Number(item.materialCostPerUnit) < 0) errors.push('Material cost cannot be negative.');
    if (Number(item.laborHoursPerUnit) < 0 || Number(item.laborRate) < 0) errors.push('Labor hours and labor rate cannot be negative.');
  }
  return [...new Set(errors)];
}

// Configurable job presets complement the location-aware scope estimator.
export const JOB_TEMPLATES = {
  painting: { name: 'Interior Painting', qtyLabel: 'Rooms', directBase: 210, lowBase: 340, medBase: 460, maxBase: 620, options: [{ id: 'trim', label: 'Include trim', pct: .16 }, { id: 'ceiling', label: 'Include ceiling', pct: .20 }, { id: 'coats2', label: 'Two coats (vs. one)', pct: .14 }], prep: [{ id: 'light', label: 'Light prep - minor patching', pct: 0 }, { id: 'medium', label: 'Medium prep - sanding, some patch', pct: .10 }, { id: 'heavy', label: 'Heavy prep - repairs, stripping', pct: .24 }], confidence: 78 },
  cabinets: { name: 'Cabinet Refinishing', qtyLabel: 'Kitchens', directBase: 1400, lowBase: 2200, medBase: 3100, maxBase: 4400, options: [{ id: 'hardware', label: 'Replace hardware (hinges + pulls)', pct: .09 }, { id: 'interiors', label: 'Paint cabinet interiors', pct: .15 }, { id: 'gloss', label: 'High-gloss / lacquer finish (vs. satin)', pct: .22 }], prep: [{ id: 'low', label: 'Low grease / light cleaning', pct: 0 }, { id: 'medium', label: 'Medium grease - degrease + sand', pct: .12 }, { id: 'heavy', label: 'Heavy grease / kitchen use - full strip', pct: .28 }], confidence: 58 },
  faucet: { name: 'Faucet Replacement', qtyLabel: 'Faucets', directBase: 95, lowBase: 160, medBase: 220, maxBase: 310, options: [{ id: 'valve', label: 'Shut-off valve replacement needed', pct: .28 }, { id: 'drilling', label: 'New hole drilling required', pct: .35 }], prep: [{ id: 'chrome', label: 'Standard chrome / stainless finish', pct: 0 }, { id: 'nickel', label: 'Brushed nickel finish', pct: .06 }, { id: 'bronze', label: 'Oil-rubbed bronze / designer finish', pct: .14 }], confidence: 71 },
};
export function initTemplateState(template) { return { qty: 1, prep: template.prep[0].id, ...Object.fromEntries(template.options.map((o) => [o.id, false])) }; }
export function calculatePricing(template, state, marginPct = 40, bufferPct = 8) { const selected = template.options.filter((o) => state[o.id]); const prep = template.prep.find((p) => p.id === state.prep) || template.prep[0]; const multiplier = (1 + selected.reduce((sum, o) => sum + o.pct, 0) + prep.pct) * Number(state.qty || 1); const direct = template.directBase * multiplier; const recommended = direct / (1 - Math.min(.9, Math.max(0, Number(marginPct) / 100))); const low = template.lowBase * multiplier; const med = template.medBase * multiplier; const max = template.maxBase * multiplier; const bufferAmt = recommended * Number(bufferPct) / 100; return { low, med, max, direct, recommended, bufferAmt, total: recommended + bufferAmt, percentile: Math.max(0, Math.min(100, ((recommended - low) / Math.max(max - low, 1)) * 100)) }; }
export function generateScope(template, state) { const opts = []; if (state.trim) opts.push('trim'); if (state.ceiling) opts.push('ceiling'); if (state.hardware) opts.push('new hinges and pulls'); if (state.interiors) opts.push('cabinet interiors painted'); if (state.valve) opts.push('shut-off valve replacement'); if (state.drilling) opts.push('new hole drilling'); const prep = template.prep.find((p) => p.id === state.prep) || template.prep[0]; if (template === JOB_TEMPLATES.painting) return `Interior painting, ${state.qty} room(s). Scope: walls${opts.length ? `, ${opts.join(', ')}` : ''}. ${state.coats2 ? 'Two coats.' : 'One coat.'} ${prep.label.split(' - ')[0]} surface prep.`; if (template === JOB_TEMPLATES.cabinets) return `Cabinet refinishing, ${state.qty} kitchen(s). Finish: ${state.gloss ? 'high-gloss lacquer' : 'satin'}. ${prep.label.split(' - ')[0]}.`; return `Faucet replacement, ${state.qty} fixture(s). Finish: ${prep.label}. ${opts.length ? `Includes ${opts.join(' and ')}.` : 'Standard swap.'}`; }
