import { describe, expect, it, vi } from 'vitest';
import { createCraftsmanHandler } from './craftsman.js';

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const validEnv = {
  CRAFTSMAN_API_KEY: 'test-secret',
  CRAFTSMAN_API_URL: 'https://nec-api-sandbox.craftsman-book.com/',
};

describe('Craftsman NEC read-only adapter', () => {
  it('requires server-side API configuration', async () => {
    const handler = createCraftsmanHandler({ env: {}, fetchImpl: vi.fn() });
    const res = responseMock();
    await handler({ query: { resource: 'costbooks' } }, res);
    expect(res.statusCode).toBe(424);
    expect(res.body.status).toBe('not_configured');
  });

  it('fetches costbooks with the documented API-Key header', async () => {
    const fetchImpl = vi.fn(async () => new Response('[{"id":2545,"name":"2026 Construction"}]', { status: 200, headers: { 'content-type': 'application/json' } }));
    const handler = createCraftsmanHandler({ env: validEnv, fetchImpl, now: () => 1000 });
    const res = responseMock();
    await handler({ query: { resource: 'costbooks' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].id).toBe(2545);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://nec-api-sandbox.craftsman-book.com/Costbooks');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ 'API-Key': 'test-secret', accept: 'application/json' });
  });

  it('rejects invalid resource identifiers without making an upstream request', async () => {
    const fetchImpl = vi.fn();
    const handler = createCraftsmanHandler({ env: validEnv, fetchImpl });
    const res = responseMock();
    await handler({ query: { resource: 'costdata', categoryId: '../etc/passwd' } }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('supports category data and paged price rows through fixed endpoint paths', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    const handler = createCraftsmanHandler({ env: validEnv, fetchImpl, now: () => 1000 });
    for (const query of [
      { resource: 'categories', costbookId: '2545' },
      { resource: 'costdata', categoryId: '161', pageNumber: '2' },
    ]) {
      const res = responseMock();
      await handler({ query }, res);
      expect(res.statusCode).toBe(200);
    }
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://nec-api-sandbox.craftsman-book.com/CostCategories/ByCostbook/2545',
      'https://nec-api-sandbox.craftsman-book.com/CostData/ByCostCategory/161?pageNumber=2&includeText=false',
    ]);
  });

  it('does not echo secrets or upstream response bodies on auth failures', async () => {
    const handler = createCraftsmanHandler({
      env: validEnv,
      fetchImpl: vi.fn(async () => new Response('test-secret invalid key', { status: 401 })),
    });
    const res = responseMock();
    await handler({ query: { resource: 'costbooks' } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/rejected/i);
    expect(JSON.stringify(res.body)).not.toContain('test-secret');
  });
});
