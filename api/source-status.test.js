import { describe, expect, it } from 'vitest';
import { buildSourceStatus } from './source-status.js';

describe('Craftsman source readiness', () => {
  it('reports sandbox explicitly as demo data and needs both server settings', () => {
    const withoutKey = buildSourceStatus({ CRAFTSMAN_API_URL: 'https://nec-api-sandbox.craftsman-book.com/' }).sources.find((source) => source.id === 'craftsman');
    expect(withoutKey.status).toBe('not_configured');
    const sandbox = buildSourceStatus({ CRAFTSMAN_API_KEY: 'server-secret', CRAFTSMAN_API_URL: 'https://nec-api-sandbox.craftsman-book.com/' }).sources.find((source) => source.id === 'craftsman');
    expect(sandbox.status).toBe('sandbox_demo');
    expect(sandbox.note).toMatch(/demo data only/i);
    expect(sandbox.note).toMatch(/excluded from estimate calculations/i);
  });
});
