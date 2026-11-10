import { describe, expect, it } from 'vitest';
import { normalizePriceBookRows, parseCsv, validateProfileName } from './price-book.js';

describe('price-book imports', () => {
  it('parses quoted CSV fields, commas, CRLF, and escaped quotes', () => {
    expect(parseCsv('name,unit,notes\r\n"Trim, premium",LF,"He said ""yes"""\r\n')).toEqual([
      ['name', 'unit', 'notes'], ['Trim, premium', 'LF', 'He said "yes"'],
    ]);
  });

  it('normalizes required and optional cost fields and creates stable IDs', () => {
    const parsed = normalizePriceBookRows([
      ['Name', 'Unit', 'Material Cost Per Unit', 'Labor Hours Per Unit', 'Labor Rate', 'Trade', 'Overhead %', 'Waste %'],
      ['Crown molding', 'LF', '2.5', '0.06', '42', 'Carpentry', '12', '8'],
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.records[0]).toMatchObject({ id: 'crown-molding', materialCostPerUnit: 2.5, laborHoursPerUnit: 0.06, laborRate: 42, overheadPct: 12, wastePct: 8 });
  });

  it('rejects missing columns, negative numbers, duplicates, and inconsistent benchmarks', () => {
    expect(() => normalizePriceBookRows([['name'], ['a']])).toThrow(/Missing required columns/);
    const result = normalizePriceBookRows([
      ['name','unit','material_cost_per_unit','labor_hours_per_unit','labor_rate','benchmark_low','benchmark_median','benchmark_p60'],
      ['same','ea','-1','2','45','8','7','10'],
      ['same','ea','1','2','45','','',''],
    ]);
    expect(result.errors.join(' ')).toMatch(/non-negative number/);
    expect(result.errors.join(' ')).toMatch(/benchmarks must be blank/);
    expect(result.errors.join(' ')).toMatch(/duplicate scope/);
  });

  it('bounds profile names', () => {
    expect(validateProfileName('  North crew  ')).toBeNull();
    expect(validateProfileName('')).toMatch(/Enter a name/);
    expect(validateProfileName('x'.repeat(61))).toMatch(/60 characters/);
  });
});
