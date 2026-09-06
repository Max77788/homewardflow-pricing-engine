import { describe, expect, it } from 'vitest';
import { calculateEstimate, validateEstimateInput } from './calculations.js';

describe('pricing calculations', () => {
  it('uses entered material and labor inputs, then applies live PPI adjustment', () => {
    const result = calculateEstimate({
      marginPct: 35,
      conditionMult: 1.1,
      qualityMult: 1.0,
      materialIndexFactor: 1.2,
      items: [{
        id: 'drywall', quantity: 100, materialCostPerUnit: 5,
        laborHoursPerUnit: 0.1, laborRate: 40,
        benchmarkLow: 9, benchmarkMedian: 11, benchmarkP60: 13,
      }],
    });
    expect(result.materials).toBe(660);
    expect(result.labor).toBe(400);
    expect(result.direct).toBe(1060);
    expect(result.recommended).toBeCloseTo(1630.77, 2);
    expect(result.items[0].marginConflict).toBe(true);
  });

  it('does not invent benchmark confidence when benchmark inputs are absent', () => {
    const result = calculateEstimate({
      marginPct: 30, conditionMult: 1, qualityMult: 1, materialIndexFactor: 1,
      items: [{ id: 'roofing', quantity: 1, materialCostPerUnit: 100, laborHoursPerUnit: 2, laborRate: 50 }],
    });
    expect(result.items[0].confidence).toBe(null);
    expect(result.marketMedian).toBe(null);
    expect(result.sources.some((source) => source.status === 'user_input')).toBe(true);
  });

  it('requires proper project and line-item inputs', () => {
    const errors = validateEstimateInput({
      projectName: '', stateCode: '', zip: '12', marginPct: 95,
      items: [{ quantity: 0, materialCostPerUnit: -1, laborHoursPerUnit: 0, laborRate: 0 }],
    });
    expect(errors).toEqual(expect.arrayContaining([
      'Project name is required.',
      'State is required.',
      'ZIP code must be 5 digits.',
      'Target margin must be between 0% and 90%.',
      'Every selected scope must have a quantity greater than zero.',
      'Material cost cannot be negative.',
    ]));
  });
});
