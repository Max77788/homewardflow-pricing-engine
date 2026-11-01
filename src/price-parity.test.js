import { describe, expect, it } from 'vitest';
import { getStateFips, getStatePriceParity } from './price-parity.js';

const dataset = {
  source: 'BEA Regional Price Parities',
  sourceUrl: 'https://apps.bea.gov/regional/zip/RPP.zip',
  datasetYear: 2023,
  indicator: 'RPPs: All items',
  nationalIndex: 100,
  states: [
    { fips: '24000', name: 'Maryland', rppAllItems: 103.2 },
    { fips: '06000', name: 'California', rppAllItems: 112.5 },
  ],
};

describe('BEA state price parity lookup', () => {
  it('returns the state index and source metadata for a supported state code', () => {
    expect(getStatePriceParity('MD', dataset)).toEqual({
      source: 'BEA Regional Price Parities',
      sourceUrl: 'https://apps.bea.gov/regional/zip/RPP.zip',
      datasetYear: 2023,
      indicator: 'RPPs: All items',
      state: 'Maryland',
      index: 103.2,
      nationalIndex: 100,
      relativeToNational: 1.032,
    });
  });

  it('resolves state abbreviations to Census state FIPS codes', () => {
    expect(getStateFips('MD')).toBe('24000');
    expect(getStateFips('dc')).toBe('11000');
    expect(getStateFips('XX')).toBeNull();
  });

  it('returns null rather than guessing for an unsupported state code', () => {
    expect(getStatePriceParity('XX', dataset)).toBeNull();
  });
});
