import { describe, expect, it } from 'vitest';
import handler from '../api/construction-data.js';

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

describe('Census ACS endpoint prerequisites', () => {
  it('rejects malformed state codes before calling Census', async () => {
    const res = responseMock();
    await handler({ query: { stateCode: 'Maryland' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/2-letter/);
  });

  it('reports the missing free API key clearly for a valid state', async () => {
    const res = responseMock();
    await handler({ query: { stateCode: 'MD' } }, res);
    expect(res.statusCode).toBe(424);
    expect(res.body.status).toBe('key_required');
  });
});
