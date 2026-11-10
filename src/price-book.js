const MAX_ROWS = 1000;
const REQUIRED_HEADERS = ['name', 'unit', 'material_cost_per_unit', 'labor_hours_per_unit', 'labor_rate'];
const OPTIONAL_NUMBERS = ['benchmark_low', 'benchmark_median', 'benchmark_p60', 'overhead_pct', 'waste_pct'];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/%/g, '_pct').replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/[^a-z0-9_]/g, '');
const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value);
const slug = (value) => String(value).trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

export function normalizePriceBookRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('The file needs a header row and at least one cost row.');
  if (rows.length - 1 > MAX_ROWS) throw new Error(`A price book can contain at most ${MAX_ROWS} rows.`);
  const headers = rows[0].map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const seen = new Set();
  const records = [];
  const errors = [];

  rows.slice(1).forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const value = (key) => cells[index[key]] ?? '';
    const name = String(value('name')).trim();
    const unit = String(value('unit')).trim();
    const id = slug(value('id') || name);
    if (!name || !unit || !id) { errors.push(`Row ${line}: name and unit are required.`); return; }
    if (seen.has(id)) { errors.push(`Row ${line}: duplicate scope name/id "${id}".`); return; }
    seen.add(id);
    const record = { id, name: name.slice(0, 100), unit: unit.slice(0, 20), trade: String(value('trade') || 'Custom').trim().slice(0, 60) };
    const numericFields = {
      material_cost_per_unit: 'materialCostPerUnit',
      labor_hours_per_unit: 'laborHoursPerUnit',
      labor_rate: 'laborRate',
      benchmark_low: 'benchmarkLow',
      benchmark_median: 'benchmarkMedian',
      benchmark_p60: 'benchmarkP60',
      overhead_pct: 'overheadPct',
      waste_pct: 'wastePct',
    };
    for (const [header, field] of Object.entries(numericFields)) {
      const raw = value(header);
      const parsed = numberOrNull(raw);
      const required = REQUIRED_HEADERS.includes(header);
      if ((required && parsed === null) || (parsed !== null && (!Number.isFinite(parsed) || parsed < 0))) {
        errors.push(`Row ${line}: ${header} must be ${required ? 'a non-negative number' : 'blank or a non-negative number'}.`);
      } else record[field] = parsed ?? (field === 'overheadPct' || field === 'wastePct' ? 0 : null);
    }
    if (![null, record.benchmarkLow, record.benchmarkMedian, record.benchmarkP60].every((v) => v === null) &&
      !(record.benchmarkLow > 0 && record.benchmarkMedian >= record.benchmarkLow && record.benchmarkP60 >= record.benchmarkMedian)) {
      errors.push(`Row ${line}: benchmarks must be blank or satisfy 0 < benchmark_low ≤ benchmark_median ≤ benchmark_p60.`);
    }
    records.push(record);
  });
  if (!records.length && !errors.length) errors.push('No usable cost rows found.');
  return { records, errors, headers, maxRows: MAX_ROWS };
}

export function validateProfileName(value) {
  const name = String(value || '').trim();
  if (!name) return 'Enter a name for this cost model.';
  if (name.length > 60) return 'Cost model name must be 60 characters or fewer.';
  return null;
}

export { MAX_ROWS, OPTIONAL_NUMBERS, REQUIRED_HEADERS };
