import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze,
  shockLoss,
  coverage,
  sum,
  assessLimit,
} from "../web/risk-engine.mjs";
const pack = JSON.parse(
  readFileSync(new URL("../web/dataset.json", import.meta.url)),
);
const input = {
  assets: pack.assets,
  weights: [0.5, 0.3, 0.2],
  confidence: 0.99,
  window: 252,
  period: "all",
};
const base = analyze(input);
const close = (a, b, tolerance = 1e-10) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test("All 2,262 test forecasts match the independent Python implementation", () => {
  const reference = JSON.parse(
    readFileSync(new URL("./python-reference.json", import.meta.url)),
  );
  assert.equal(reference.length, 2262);
  assert.equal(base.rows.length, 754);
  const dates = new Map(base.rows.map((r) => [r.date, r]));
  for (const ref of reference) {
    const actual = dates.get(ref.date);
    close(actual.estimates[ref.model].var, Number(ref.var));
    close(actual.estimates[ref.model].es, Number(ref.es));
    assert.equal(actual.trainingEnd, ref.training_end);
  }
  for (const expected of pack.summary.risk_test) {
    const actual = base.stats.find((r) => r.model === expected.model);
    assert.equal(actual.breaches, expected.breaches);
    close(actual.kupiec_pvalue, expected.kupiec_pvalue, 2e-7);
    close(actual.quantileLoss, expected.quantile_loss);
  }
});
test("Changing future returns cannot change earlier risk estimates", () => {
  const date = "2024-06-03";
  const changed = analyze({
    ...input,
    assets: pack.assets.map((a) =>
      a.date >= date ? { ...a, values: [0.2, 0.1, 0.3] } : a,
    ),
  });
  for (let i = 0; i < base.rows.length; i++) {
    if (base.rows[i].date > date) break;
    assert.deepEqual(base.rows[i].estimates, changed.rows[i].estimates);
  }
});
test("Euler components sum to portfolio volatility; zero weights have zero contribution", () => {
  close(
    sum(base.riskContributions.components),
    base.riskContributions.dailyVolatility,
  );
  const usd = analyze({ ...input, weights: [1, 0, 0] });
  close(
    usd.riskContributions.components[0],
    usd.riskContributions.dailyVolatility,
  );
  close(usd.riskContributions.components[1], 0);
  close(usd.riskContributions.components[2], 0);
  assert.notEqual(
    usd.last.estimates.historical.var,
    base.last.estimates.historical.var,
  );
});
test("All confidence and window controls produce finite valid results", () => {
  for (const confidence of [0.95, 0.975, 0.99])
    for (const window of [126, 252, 504]) {
      const output = analyze({ ...input, confidence, window, period: "2024" });
      assert.equal(output.rows.length, 253);
      for (const row of output.rows) {
        assert.ok(row.trainingEnd < row.date);
        for (const estimate of Object.values(row.estimates)) {
          assert.ok(Number.isFinite(estimate.var));
          assert.ok(estimate.es >= estimate.var);
        }
      }
    }
});
test("Invalid weights and scenarios fail explicitly", () => {
  assert.throws(() => analyze({ ...input, weights: [0.8, 0.3, 0.2] }));
  assert.throws(() => analyze({ ...input, weights: [NaN, 0.3, 0.2] }));
  assert.throws(() => analyze({ ...input, confidence: 0.9 }));
  assert.throws(() => shockLoss([0.5, 0.3, 0.2], [-1.1, 0, 0]));
  close(shockLoss([0.5, 0.3, 0.2], [-0.1, -0.1, -0.1]), 0.1);
});
test("Coverage edge cases remain finite and state identifiability is explicit", () => {
  for (const flag of [true, false]) {
    const stats = coverage(Array(250).fill(flag), 0.01);
    assert.ok(Number.isFinite(stats.kupiec_pvalue));
    assert.equal(stats.independence_pvalue, null);
  }
});
test("Capacity scales the same portfolio to the user-defined limit", () => {
  const result = assessLimit({
    varRate: 0.02,
    esRate: 0.03,
    notional: 1e6,
    limit: 15000,
  });
  close(result.varBrl, 20000);
  close(result.headroomBrl, -5000);
  close(result.capacityBrl, 750000);
  close(result.reductionBrl, 250000);
  assert.equal(result.varExceeded, true);
  assert.equal(result.tailExceeded, true);
  close(result.capacityBrl * 0.02, 15000);
});
test("Tail loss can exceed the budget while VaR stays within it", () => {
  const result = assessLimit({
    varRate: 0.01,
    esRate: 0.03,
    notional: 1e6,
    limit: 15000,
  });
  assert.equal(result.varExceeded, false);
  assert.equal(result.tailExceeded, true);
  close(result.headroomBrl, 5000);
});
test("Capacity is not invented for zero or negative VaR; invalid budgets fail", () => {
  assert.equal(
    assessLimit({ varRate: 0, esRate: 0.01, notional: 1e6, limit: 15000 })
      .capacityBrl,
    null,
  );
  assert.throws(() =>
    assessLimit({ varRate: 0.01, esRate: 0.02, notional: 1e6, limit: 0 }),
  );
  assert.throws(() =>
    assessLimit({ varRate: 0.02, esRate: 0.01, notional: 1e6, limit: 15000 }),
  );
});
