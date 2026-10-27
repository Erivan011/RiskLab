import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTrade,
  priceOperation,
  validateOperations,
  validDate,
  addDays,
} from "../web/trade-engine.mjs";
import { parseCsv, serializeCsv } from "../web/trade-csv.mjs";
const row = {
  id: "IMP-1",
  supplier: "Fornecedor demonstrativo",
  currency: "USD",
  amount: 100,
  dueDate: "2026-10-26",
  budgetRate: 4,
  localCostBrl: 20,
  hedgePercent: 50,
  hedgeRate: 4,
  status: "open",
};
const rates = { USD: 5, EUR: 6, GBP: 7 };
const calculate = (overrides) =>
  analyzeTrade({
    operations: [row],
    rates,
    asOf: "2026-10-27",
    openingCashBrl: 1000,
    ...overrides,
  });
test("Only uncovered principal responds to FX shock; local cost and fixed portion stay constant", () => {
  const p = priceOperation(row, rates, { USD: 0.1 });
  assert.equal(p.baselineCents, 47000);
  assert.equal(p.scenarioCents, 49500);
  assert.equal(p.budgetCents, 42000);
  assert.equal(p.shockImpactCents, 2500);
  assert.equal(p.deviationCents, 7500);
});
test("Fully fixed principal is invariant to FX shocks; zero protection has full sensitivity", () => {
  assert.equal(
    priceOperation({ ...row, hedgePercent: 100 }, rates, { USD: 0.2 })
      .shockImpactCents,
    0,
  );
  assert.equal(
    priceOperation({ ...row, hedgePercent: 0 }, rates, { USD: 0.2 })
      .shockImpactCents,
    10000,
  );
});
test("Cash and totals exclude paid obligations and aggregate rounded cents", () => {
  const a = { ...row, amount: 123.17 },
    b = { ...row, id: "IMP-2", amount: 12.35, status: "paid" };
  const r = calculate({ operations: [a, b] });
  assert.equal(r.rows.length, 1);
  assert.equal(r.totalCents, priceOperation(a, rates).scenarioCents);
  assert.equal(r.closingCashCents, 100000 - r.totalCents);
});
test("Overdue obligations enter the base date exactly once; opening cash participates in minimum", () => {
  const r = calculate({ openingCashBrl: 0 });
  assert.equal(r.overdue.length, 1);
  assert.equal(r.cash[0].date, "2026-10-27");
  assert.equal(r.firstShortfall, "2026-10-27");
  assert.equal(r.minimumCashCents, -47000);
});
test("Horizon excludes later outflows but preserves the all-obligation total", () => {
  const r = calculate({
    operations: [{ ...row, dueDate: "2027-02-01" }],
    horizon: 30,
  });
  assert.equal(r.totalCents, 47000);
  assert.equal(r.closingCashCents, 100000);
  assert.equal(r.beyondHorizon, 1);
  assert.equal(r.dueSoon.length, 0);
});
test("Receipt and payment on the same day are netted; historical receipts do not enter twice", () => {
  const r = calculate({
    openingCashBrl: 0,
    receipts: [
      { date: "2026-10-26", amountBrl: 9999 },
      { date: "2026-10-27", amountBrl: 500 },
    ],
  });
  assert.equal(r.closingCashCents, 3000);
  assert.equal(r.firstShortfall, null);
  assert.equal(r.minimumCashCents, 0);
});
test("Currency subtotals reconcile to the portfolio and cash-flow conservation holds", () => {
  const operations = [
    row,
    {
      ...row,
      id: "IMP-2",
      currency: "EUR",
      dueDate: "2026-11-05",
      hedgePercent: 0,
    },
  ];
  const r = calculate({
    operations,
    receipts: [{ date: "2026-11-05", amountBrl: 100 }],
  });
  assert.equal(
    r.currencies.reduce((s, c) => s + c.scenarioCents, 0),
    r.totalCents,
  );
  assert.equal(r.closingCashCents, r.openingCashCents + 10000 - r.totalCents);
  assert.equal(r.shockImpactCents, r.totalCents - r.baselineCents);
});
test("An all-paid portfolio has no invented risk or payment", () => {
  const r = calculate({ operations: [{ ...row, status: "paid" }] });
  assert.equal(r.totalCents, 0);
  assert.equal(r.uncoveredBrl, 0);
  assert.equal(r.closingCashCents, 100000);
});
test("Invalid dates, duplicate IDs, missing currencies and invalid coverage stop calculation", () => {
  for (const change of [
    { dueDate: "2026-02-30" },
    { currency: "BTC" },
    { amount: -1 },
    { hedgePercent: 101 },
    { hedgeRate: 0 },
  ])
    assert.throws(() => validateOperations([{ ...row, ...change }]));
  assert.throws(() => validateOperations([row, row]));
  assert.throws(() => calculate({ openingCashBrl: -1 }));
  assert.throws(() => priceOperation(row, rates, { USD: -1 }));
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("CSV roundtrip preserves UTF-8 names, commas, quotes and numeric values", () => {
  const original = { ...row, supplier: 'Empresa "São Paulo", Ltda.' };
  const imported = parseCsv(serializeCsv([original]));
  assert.deepEqual(imported, [original]);
});
test("Malformed CSV and partial records fail instead of silently replacing portfolio rows", () => {
  assert.throws(() => parseCsv("id,supplier\na,b"));
  assert.throws(() => parseCsv('"unclosed'));
  const csv = serializeCsv([row]);
  assert.throws(() => parseCsv(csv + "\nIMP-2,Incomplete"));
  assert.throws(() => parseCsv(csv.replace(",100,", ",,")));
});
test("Spreadsheet formula prefixes are escaped in exported free text", () => {
  const csv = serializeCsv([
    { ...row, supplier: '=HYPERLINK("https://example.org")' },
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
});

test("CSV rejects trailing text after quoted fields and escapes whitespace-prefixed formulas", () => {
  assert.throws(() => parseCsv('id,supplier\n"IMP-1"broken,Example'));
  assert.ok(
    serializeCsv([{ ...row, supplier: "  =SUM(1,2)" }]).includes("'  =SUM"),
  );
});
