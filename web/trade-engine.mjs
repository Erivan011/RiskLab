export const CURRENCIES = ["USD", "EUR", "GBP"];
export const cents = (value) => Math.round((value + Number.EPSILON) * 100);
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function addDays(date, days) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function validateOperations(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500)
    throw Error("A carteira deve conter entre 1 e 500 operações.");
  const seen = new Set();
  return rows.map((row, i) => {
    const fail = (message) => {
      throw Error(`Operação ${i + 1}: ${message}`);
    };
    if (
      typeof row.id !== "string" ||
      !/^[\w-]{1,30}$/.test(row.id) ||
      seen.has(row.id)
    )
      fail("identificador ausente, inválido ou duplicado.");
    seen.add(row.id);
    if (
      typeof row.supplier !== "string" ||
      !row.supplier.trim() ||
      row.supplier.length > 100
    )
      fail("informe um fornecedor de até 100 caracteres.");
    if (!CURRENCIES.includes(row.currency))
      fail("moeda deve ser USD, EUR ou GBP.");
    if (!validDate(row.dueDate)) fail("vencimento inválido (AAAA-MM-DD).");
    if (!Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 1e8)
      fail("valor em moeda deve ser positivo e até 100 milhões.");
    if (
      !Number.isFinite(row.budgetRate) ||
      row.budgetRate <= 0 ||
      row.budgetRate > 1000
    )
      fail("câmbio de orçamento inválido.");
    if (
      !Number.isFinite(row.localCostBrl) ||
      row.localCostBrl < 0 ||
      row.localCostBrl > 1e9
    )
      fail("custo local inválido.");
    if (
      !Number.isFinite(row.hedgePercent) ||
      row.hedgePercent < 0 ||
      row.hedgePercent > 100
    )
      fail("proteção deve estar entre 0 e 100%.");
    if (
      !Number.isFinite(row.hedgeRate) ||
      row.hedgeRate <= 0 ||
      row.hedgeRate > 1000
    )
      fail("taxa fixa inválida.");
    if (!["open", "review", "paid"].includes(row.status))
      fail("status deve ser open, review ou paid.");
    return { ...row, supplier: row.supplier.trim() };
  });
}
export function priceOperation(
  row,
  rates,
  shocks = { USD: 0, EUR: 0, GBP: 0 },
) {
  const rate = rates[row.currency],
    shock = shocks[row.currency] ?? 0;
  if (
    !Number.isFinite(rate) ||
    rate <= 0 ||
    !Number.isFinite(shock) ||
    shock <= -1 ||
    shock > 1
  )
    throw Error("Referência cambial ou choque inválido.");
  const coverage = row.hedgePercent / 100;
  const baseForeign =
    row.amount * (coverage * row.hedgeRate + (1 - coverage) * rate);
  const scenarioForeign =
    row.amount *
    (coverage * row.hedgeRate + (1 - coverage) * rate * (1 + shock));
  const baselineCents = cents(baseForeign + row.localCostBrl);
  const scenarioCents = cents(scenarioForeign + row.localCostBrl);
  const budgetCents = cents(row.amount * row.budgetRate + row.localCostBrl);
  return {
    ...row,
    rate,
    scenarioRate: rate * (1 + shock),
    baselineCents,
    scenarioCents,
    budgetCents,
    deviationCents: scenarioCents - budgetCents,
    shockImpactCents: scenarioCents - baselineCents,
    uncoveredBrl: row.amount * (1 - coverage) * rate,
    protectedBrl: row.amount * coverage * rate,
  };
}
export function analyzeTrade({
  operations,
  rates,
  shocks = { USD: 0, EUR: 0, GBP: 0 },
  asOf,
  openingCashBrl,
  receipts = [],
  horizon = 90,
}) {
  validateOperations(operations);
  if (
    !validDate(asOf) ||
    !Number.isFinite(openingCashBrl) ||
    openingCashBrl < 0 ||
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 365
  )
    throw Error("Data-base, horizonte ou caixa inválido.");
  for (const receipt of receipts)
    if (
      !validDate(receipt.date) ||
      !Number.isFinite(receipt.amountBrl) ||
      receipt.amountBrl < 0
    )
      throw Error("Recebimento projetado inválido.");
  const rows = operations
    .filter((r) => r.status !== "paid")
    .map((r) => priceOperation(r, rates, shocks));
  const total = (key, subset = rows) => subset.reduce((s, r) => s + r[key], 0);
  const end = addDays(asOf, horizon);
  const flows = new Map();
  const flow = (date) => {
    if (!flows.has(date))
      flows.set(date, {
        date,
        inflowCents: 0,
        baselineCents: 0,
        scenarioCents: 0,
      });
    return flows.get(date);
  };
  flow(asOf);
  flow(end);
  for (const row of rows) {
    const due = row.dueDate < asOf ? asOf : row.dueDate;
    if (due <= end) {
      const f = flow(due);
      f.baselineCents += row.baselineCents;
      f.scenarioCents += row.scenarioCents;
    }
  }
  for (const receipt of receipts)
    if (receipt.date >= asOf && receipt.date <= end)
      flow(receipt.date).inflowCents += cents(receipt.amountBrl);
  let base = cents(openingCashBrl),
    scenario = base;
  const cash = [...flows.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((f) => {
      base += f.inflowCents - f.baselineCents;
      scenario += f.inflowCents - f.scenarioCents;
      return { ...f, baseBalanceCents: base, scenarioBalanceCents: scenario };
    });
  const opening = cents(openingCashBrl);
  const minimum = Math.min(opening, ...cash.map((f) => f.scenarioBalanceCents));
  const firstShortfall =
    cash.find((f) => f.scenarioBalanceCents < 0)?.date ?? null;
  const currencies = CURRENCIES.map((currency) => {
    const subset = rows.filter((r) => r.currency === currency);
    return {
      currency,
      count: subset.length,
      scenarioCents: total("scenarioCents", subset),
      uncoveredBrl: subset.reduce((s, r) => s + r.uncoveredBrl, 0),
    };
  });
  return {
    asOf,
    end,
    rows,
    cash,
    currencies,
    openingCashCents: opening,
    totalCents: total("scenarioCents"),
    baselineCents: total("baselineCents"),
    budgetCents: total("budgetCents"),
    deviationCents: total("deviationCents"),
    shockImpactCents: total("shockImpactCents"),
    uncoveredBrl: rows.reduce((s, r) => s + r.uncoveredBrl, 0),
    protectedBrl: rows.reduce((s, r) => s + r.protectedBrl, 0),
    overdue: rows.filter((r) => r.dueDate < asOf),
    dueSoon: rows.filter(
      (r) => r.dueDate >= asOf && r.dueDate <= addDays(asOf, 14),
    ),
    minimumCashCents: minimum,
    firstShortfall,
    closingCashCents: cash.at(-1).scenarioBalanceCents,
    beyondHorizon: rows.filter((r) => r.dueDate > end).length,
  };
}
