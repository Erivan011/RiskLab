import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteStats,
  positionRisk,
  scenarioPnl,
  historicalCone,
} from "../web/market-engine.mjs";
const data = Object.fromEntries(
  ["USD", "EUR", "GBP"].map((currency, j) => [
    currency,
    Array.from({ length: 300 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      value: 4 + j + i * 0.001 + Math.sin(i) * 0.02,
    })),
  ]),
);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("Receivable and payable have opposite mark-to-market P&L", () => {
  const long = positionRisk(data, [10000, 0, 0]),
    short = positionRisk(data, [-10000, 0, 0]);
  close(long.dailyPnl, -short.dailyPnl);
  close(long.net, -short.net);
  close(long.gross, short.gross);
});
test("Repricing uses current signed notional and historical returns", () => {
  const result = positionRisk(data, [10000, -5000, 2000]);
  assert.equal(result.observations, 252);
  assert.ok(result.esBrl >= result.varBrl);
  const expected = result.positions.reduce((v, p) => v + p.notional * 0.1, 0);
  close(scenarioPnl(result.positions, [0.1, 0.1, 0.1]).unprotected, expected);
});
test("Zero holdings have zero risk, P&L and exposure", () => {
  const r = positionRisk(data, [0, 0, 0]);
  close(r.gross, 0);
  close(r.varBrl, 0);
  close(r.esBrl, 0);
  close(r.dailyPnl, 0);
});
test("Common-date valuation avoids mixing dates and does not fill prices", () => {
  const changed = { ...data, EUR: data.EUR.slice(0, -2) };
  const r = positionRisk(changed, [10, 10, 10]);
  assert.equal(r.asOf, data.EUR.at(-3).date);
  assert.equal(r.positions[0].price, data.USD.at(-3).value);
});
test("Idealized full coverage neutralizes the defined shock only", () => {
  const r = positionRisk(data, [10000, -5000, 2000]);
  const s = scenarioPnl(r.positions, [-0.1, 0.05, 0.2], 1);
  close(s.residual, 0);
  close(s.offset, -s.unprotected);
  assert.throws(() => scenarioPnl(r.positions, [0.1, 0.1, 0.1], 1.1));
});
test("Quote changes use actual observations and cone simulations are reproducible", () => {
  const stats = quoteStats(data.USD);
  close(stats.change, data.USD.at(-1).value / data.USD.at(-2).value - 1);
  const first = historicalCone(data.USD, 20, 200),
    second = historicalCone(data.USD, 20, 200);
  assert.deepEqual(first, second);
  assert.equal(first.length, 21);
  for (const row of first)
    assert.ok(row.low <= row.median && row.median <= row.high);
});
