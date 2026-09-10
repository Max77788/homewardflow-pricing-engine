import { describe, expect, it } from 'vitest';
import { calculateEstimate, validateEstimateInput, SCOPE_CATALOG, DEMO_LABOR_RATE } from './calculations.js';

describe('pricing calculations', () => {
  it('supports a populated demo baseline for the default scope', () => {
    const drywall = SCOPE_CATALOG.find((entry) => entry.id === 'drywall');
    const result = calculateEstimate({
      marginPct: 35, conditionMult: 1, qualityMult: 1, materialIndexFactor: 1,
      items: [{ id: drywall.id, quantity: 100, materialCostPerUnit: drywall.demoMaterial, laborHoursPerUnit: drywall.demoHours, laborRate: 40, benchmarkLow: drywall.demoLow, benchmarkMedian: drywall.demoMedian, benchmarkP60: drywall.demoP60 }],
    });
    expect(result.direct).toBeGreaterThan(0);
    expect(result.materials).toBeGreaterThan(0);
    expect(result.labor).toBeGreaterThan(0);
    expect(result.marketMedian).toBeGreaterThan(0);
    expect(result.marketP60).toBeGreaterThan(result.marketMedian);
    expect(result.recommended).toBeGreaterThan(0);
    expect(result.overallConfidence).not.toBeNull();
  });

  it('defines a non-empty fallback labor rate for immediate scope population', () => {
    expect(DEMO_LABOR_RATE).toBeGreaterThan(0);
    const drywall = SCOPE_CATALOG.find((entry) => entry.id === 'drywall');
    expect(drywall.demoMaterial).toBeGreaterThan(0);
    expect(drywall.demoHours).toBeGreaterThan(0);
    expect(drywall.demoLow).toBeGreaterThan(0);
    expect(drywall.demoMedian).toBeGreaterThan(drywall.demoLow);
    expect(drywall.demoP60).toBeGreaterThan(drywall.demoMedian);
  });

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
