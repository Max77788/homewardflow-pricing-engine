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

export const SCOPE_CATALOG = [
  { id: 'drywall', name: 'Drywall replacement', unit: 'SF', trade: 'Drywall installers', ppiSeries: 'WPU081' },
  { id: 'vanity', name: 'Vanity replacement', unit: 'unit', trade: 'Plumbers', ppiSeries: 'WPU081' },
  { id: 'toilet', name: 'Toilet replacement', unit: 'unit', trade: 'Plumbers', ppiSeries: 'WPU081' },
  { id: 'flooring', name: 'Flooring replacement (LVP)', unit: 'SF', trade: 'Floor layers', ppiSeries: 'WPU081' },
  { id: 'paint-int', name: 'Interior painting', unit: 'SF', trade: 'Painters', ppiSeries: 'WPU081' },
  { id: 'baseboard', name: 'Baseboard / trim replacement', unit: 'LF', trade: 'Carpenters', ppiSeries: 'WPU081' },
  { id: 'cabinets', name: 'Cabinet replacement', unit: 'LF', trade: 'Carpenters', ppiSeries: 'WPU081' },
  { id: 'water-heater', name: 'Water heater replacement', unit: 'unit', trade: 'Plumbers', ppiSeries: 'WPU081' },
  { id: 'window', name: 'Window replacement', unit: 'unit', trade: 'Carpenters', ppiSeries: 'WPU081' },
  { id: 'roofing', name: 'Roofing - asphalt shingle', unit: 'SF', trade: 'Roofers', ppiSeries: 'WPU081' },
];

const money = (value) => Number(value || 0);

export function calculateLineItem(item, marginPct, conditionMult, qualityMult, materialIndexFactor) {
  const quantity = money(item.quantity);
  const materialTotal = money(item.materialCostPerUnit) * quantity * materialIndexFactor * conditionMult * qualityMult;
  const laborTotal = money(item.laborHoursPerUnit) * quantity * money(item.laborRate);
  const directTotal = materialTotal + laborTotal;
  const recommendedPrice = directTotal / Math.max(1 - marginPct / 100, 0.01);
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
