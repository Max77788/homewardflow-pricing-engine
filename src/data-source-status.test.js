import { describe, expect, it } from 'vitest';
import { buildSourceStatus } from '../api/source-status.js';

describe('data-source status registry', () => {
  it('marks the BEA snapshot available while keeping unsupported feeds unconfigured', () => {
    const sources = buildSourceStatus({}).sources;
    expect(sources.find((s) => s.id === 'bea-rpp')).toMatchObject({ status: 'public_dataset', datasetYear: 2023 });
    expect(sources.find((s) => s.id === 'census-acs').status).toBe('key_required');
    expect(sources.find((s) => s.id === 'census-permits').status).toBe('not_configured');
    expect(sources.find((s) => s.id === 'oews').status).toBe('not_configured');
  });

  it('reports Census ACS as configured when its API key is present', () => {
    const sources = buildSourceStatus({ CENSUS_API_KEY: 'test-key' }).sources;
    expect(sources.find((s) => s.id === 'census-acs').status).toBe('live_api');
  });
});
