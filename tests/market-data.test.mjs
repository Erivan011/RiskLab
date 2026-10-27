import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMarket, fetchMarket } from '../web/market-data.mjs';
const snapshot = JSON.parse(await readFile(new URL('../web/market-snapshot.json', import.meta.url)));
test('Reject invalid, unordered or incomplete market responses before replacing valid data', () => {
  assert.equal(validateMarket(snapshot), snapshot);
  for (const mutate of [
    d => { d.currencies.USD.points[0].value = -1; },
    d => { d.currencies.EUR.points[1].date = d.currencies.EUR.points[0].date; },
    d => { d.currencies.GBP.points[0].date = '2025-02-30'; },
    d => { d.currencies.USD.points = []; },
  ]) {
    const bad = structuredClone(snapshot); mutate(bad);
    assert.throws(() => validateMarket(bad));
  }
});
test('Reject a successful HTTP response containing invalid financial data', async () => {
  await assert.rejects(fetchMarket('/api/market', { fetcher: async () => ({ok:true,json:async()=>({})}) }));
});
test('A stalled market request is aborted instead of leaving refresh locked', async () => {
  const stalled = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once:true });
  });
  await assert.rejects(fetchMarket('/api/market', { fetcher:stalled,timeoutMs:10 }), /aborted/);
});
