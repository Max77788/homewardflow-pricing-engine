import { describe, expect, it } from 'vitest';
import { JOB_TEMPLATES, calculatePricing, generateScope, initTemplateState, resolveTemplate } from './calculations.js';
describe('pricing v2 reference behavior', () => {
  it('defines the three configurable representative templates', () => { expect(Object.keys(JOB_TEMPLATES)).toEqual(['painting','cabinets','faucet']); });
  it('stacks selected options and prep before quantity', () => { const t=JOB_TEMPLATES.painting; const s={...initTemplateState(t),qty:2,trim:true,ceiling:true,coats2:true,prep:'medium'}; const r=resolveTemplate(t,s); expect(r.modifierPct).toBeCloseTo(.60); expect(r.multiplier).toBeCloseTo(3.2); });
  it('calculates low median max, margin, buffer, and quote total', () => { const t=JOB_TEMPLATES.painting; const r=calculatePricing(t,{...initTemplateState(t),qty:1},40,8); expect(r.low).toBe(340); expect(r.med).toBe(460); expect(r.max).toBe(620); expect(r.direct).toBe(210); expect(r.recommended).toBeCloseTo(350); expect(r.bufferAmt).toBeCloseTo(28); expect(r.total).toBeCloseTo(378); });
  it('flags a recommended price above the 60th percentile', () => { const t=JOB_TEMPLATES.painting; const r=calculatePricing(t,{...initTemplateState(t),trim:true,ceiling:true,coats2:true,prep:'heavy'},60,8); expect(r.percentile).toBeGreaterThan(60); });
  it('generates scope language from the same selected state', () => { const t=JOB_TEMPLATES.painting; const s={...initTemplateState(t),qty:2,trim:true,coats2:true,prep:'heavy'}; const text=generateScope(t,s); expect(text).toContain('2 room(s)'); expect(text).toContain('trim'); expect(text).toContain('Two coats'); expect(text).toContain('Heavy prep'); });
});
