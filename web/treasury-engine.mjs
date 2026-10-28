import { analyzeTrade, addDays, cents, CURRENCIES } from './trade-engine.mjs';

/** Contractual cash-flow stress, with no assumed distribution or likelihood. */
export function treasuryStress(input, assumptions = {}) {
  const { fxShock = 0, delayDays = 0, receiptHaircut = 0 } = assumptions;
  if (!Number.isFinite(fxShock) || fxShock < -.2 || fxShock > .3 ||
      !Number.isInteger(delayDays) || delayDays < 0 || delayDays > 60 ||
      !Number.isFinite(receiptHaircut) || receiptHaircut < 0 || receiptHaircut > .5)
    throw Error('Premissas fora do intervalo de análise.');
  // Past inflows are already reflected in opening cash and cannot be resurrected.
  // Validate all original flows before transforming the eligible future receipts.
  analyzeTrade(input);
  const eligibleReceipts = (input.receipts || []).filter(receipt => receipt.date >= input.asOf);
  const receipts = eligibleReceipts.map(receipt => ({
    ...receipt, date: addDays(receipt.date, delayDays),
    amountBrl: cents(receipt.amountBrl * (1 - receiptHaircut)) / 100,
  }));
  const analysis = analyzeTrade({ ...input, receipts,
    shocks: Object.fromEntries(CURRENCIES.map(currency => [currency, fxShock])) });
  const inflowCents = analysis.cash.reduce((sum, day) => sum + day.inflowCents, 0);
  const outflowCents = analysis.cash.reduce((sum, day) => sum + day.scenarioCents, 0);
  const minimumDay = analysis.cash.reduce((minimum, day) =>
    day.scenarioBalanceCents < minimum.balanceCents
      ? { date: day.date, balanceCents: day.scenarioBalanceCents } : minimum,
    { date: analysis.asOf, balanceCents: analysis.openingCashCents });
  return { assumptions: { fxShock, delayDays, receiptHaircut }, analysis,
    fundingCents: Math.max(0, -analysis.minimumCashCents),
    inflowCents, outflowCents, minimumDay,
    // Lost/reduced cash INSIDE the selected horizon; late cash may arrive beyond it.
    deferredReceiptsCents: (input.receipts || [])
      .filter(receipt => receipt.date >= analysis.asOf && receipt.date <= analysis.end)
      .reduce((sum, receipt) => sum + cents(receipt.amountBrl), 0) - inflowCents,
  };
}

/** Sequential, exactly additive attribution. Order is explicit, not causal estimation. */
export function fundingAttribution(input, assumptions) {
  const base = treasuryStress(input);
  const fx = treasuryStress(input, {fxShock: assumptions.fxShock});
  const delay = treasuryStress(input, {fxShock: assumptions.fxShock, delayDays: assumptions.delayDays});
  const combined = treasuryStress(input, assumptions);
  return { baseCents: base.fundingCents, combinedCents: combined.fundingCents,
    steps: [
      { key: 'fx', deltaCents: fx.fundingCents - base.fundingCents },
      { key: 'delay', deltaCents: delay.fundingCents - fx.fundingCents },
      { key: 'haircut', deltaCents: combined.fundingCents - delay.fundingCents },
    ] };
}

export function stressSurface(input, receiptHaircut = 0) {
  return [0, 7, 14, 30].flatMap(delayDays => [0, .05, .1, .15, .2].map(fxShock =>
    treasuryStress(input, { fxShock, delayDays, receiptHaircut })));
}

/** Concentration of uncovered principal by supplier, not geopolitical risk. */
export function counterpartyConcentration(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.supplier;
    const current = grouped.get(key) || { supplier: key, uncoveredBrl: 0, count: 0,
      countries: new Set(), ids: [] };
    current.uncoveredBrl += row.uncoveredBrl;
    current.count++;
    current.countries.add(row.country || 'Origem não informada');
    current.ids.push(row.id);
    grouped.set(key, current);
  }
  const total = rows.reduce((sum, row) => sum + row.uncoveredBrl, 0);
  const suppliers = [...grouped.values()].map(s => ({ ...s,
    countries: [...s.countries], share: total ? s.uncoveredBrl / total : 0,
  })).sort((a, b) => b.uncoveredBrl - a.uncoveredBrl);
  return { total, suppliers,
    topThreeShare: suppliers.slice(0, 3).reduce((sum, s) => sum + s.share, 0),
    hhi: suppliers.reduce((sum, s) => sum + s.share ** 2, 0) * 10000,
  };
}

export function makeStressReport(input, assumptions, referenceDates) {
  const stressed = treasuryStress(input, assumptions);
  const baseline = treasuryStress(input);
  return { schemaVersion: 1, model: 'deterministic-contractual-cash-flow',
    disclosure: 'Carteira fictícia. Teste de sensibilidade, sem probabilidade, recomendação ou execução financeira.',
    input: { ...input, referenceDates }, assumptions: stressed.assumptions,
    results: { baselineFundingCents: baseline.fundingCents,
      fundingCents: stressed.fundingCents, minimumDay: stressed.minimumDay,
      inflowCents: stressed.inflowCents, outflowCents: stressed.outflowCents,
      deferredReceiptsCents: stressed.deferredReceiptsCents,
      closingCashCents: stressed.analysis.closingCashCents },
    attribution: fundingAttribution(input, stressed.assumptions),
    dailyLedger: stressed.analysis.cash,
  };
}
