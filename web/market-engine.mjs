// Market-risk calculations for signed foreign-currency receivables/payables.
export const CURRENCIES = ["USD", "EUR", "GBP"];
export function quantile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const k = (sorted.length - 1) * p,
    i = Math.floor(k);
  return (
    sorted[i] +
    (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (k - i)
  );
}
export function quoteStats(series) {
  if (!Array.isArray(series) || series.length < 2)
    throw Error("Histórico insuficiente.");
  const last = series.at(-1),
    previous = series.at(-2);
  const change = last.value / previous.value - 1;
  const changes = (n) =>
    series.length > n ? last.value / series.at(-n - 1).value - 1 : null;
  const values = series.slice(-252).map((p) => p.value);
  return {
    ...last,
    previousDate: previous.date,
    change,
    unusualMove: Math.abs(change) > 0.05,
    month: changes(21),
    year: changes(252),
    low: Math.min(...values),
    high: Math.max(...values),
    observations: series.length,
  };
}
export function positionRisk(seriesByCurrency, quantities, confidence = 0.99) {
  if (
    quantities.length !== 3 ||
    quantities.some((q) => !Number.isFinite(q)) ||
    ![0.95, 0.975, 0.99].includes(confidence)
  )
    throw Error("Posições ou confiança inválidas.");
  const maps = CURRENCIES.map(
    (c) => new Map(seriesByCurrency[c].map((p) => [p.date, p.value])),
  );
  const dates = [...maps[0].keys()]
    .filter((d) => maps.every((m) => m.has(d)))
    .sort();
  if (dates.length < 30)
    throw Error("Menos de 30 datas comuns para estimar o risco.");
  const last = dates.at(-1),
    previous = dates.at(-2),
    prices = maps.map((m) => m.get(last));
  const positions = quantities.map((quantity, i) => ({
    currency: CURRENCIES[i],
    quantity,
    price: prices[i],
    notional: quantity * prices[i],
    dailyPnl: quantity * (prices[i] - maps[i].get(previous)),
    sensitivity1pct: quantity * prices[i] * 0.01,
  }));
  const gross = positions.reduce((a, p) => a + Math.abs(p.notional), 0),
    net = positions.reduce((a, p) => a + p.notional, 0);
  const pnl = [];
  for (let i = Math.max(1, dates.length - 252); i < dates.length; i++) {
    pnl.push(
      maps.reduce(
        (total, m, j) =>
          total +
          positions[j].notional * (m.get(dates[i]) / m.get(dates[i - 1]) - 1),
        0,
      ),
    );
  }
  const losses = pnl.map((p) => -p),
    varBrl = quantile(losses, confidence),
    tail = losses.filter((x) => x >= varBrl);
  const esBrl = tail.reduce((a, b) => a + b, 0) / tail.length;
  const worst = pnl
    .map((value, i) => ({
      date: dates[dates.length - pnl.length + i],
      pnl: value,
    }))
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 5);
  const mean = pnl.reduce((a, b) => a + b, 0) / pnl.length;
  const sigma = Math.sqrt(
    pnl.reduce((a, b) => a + (b - mean) ** 2, 0) / (pnl.length - 1),
  );
  return {
    positions,
    gross,
    net,
    varBrl,
    esBrl,
    confidence,
    observations: pnl.length,
    asOf: last,
    previousDate: previous,
    dailyPnl: positions.reduce((a, p) => a + p.dailyPnl, 0),
    sigmaBrl: sigma,
    worst,
    losses,
  };
}
export function scenarioPnl(positions, shocks, coverage = 0) {
  if (
    shocks.length !== 3 ||
    shocks.some((s) => !Number.isFinite(s) || s < -1 || s > 1) ||
    !Number.isFinite(coverage) ||
    coverage < 0 ||
    coverage > 1
  )
    throw Error("Cenário inválido.");
  const unprotected = positions.reduce(
    (v, p, i) => v + p.notional * shocks[i],
    0,
  );
  return {
    unprotected,
    residual: unprotected * (1 - coverage),
    offset: -unprotected * coverage,
    coverage,
  };
}
export function historicalCone(
  series,
  horizon = 20,
  simulations = 1000,
  seed = 42,
) {
  // Moving-block bootstrap of reference-price returns. Not a price forecast.
  const returns = series
      .slice(1)
      .map((p, i) => p.value / series[i].value - 1)
      .slice(-252),
    paths = [];
  if (returns.length < 20) throw Error("Histórico insuficiente para cenário.");
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let s = 0; s < simulations; s++) {
    let value = series.at(-1).value,
      trajectory = [value];
    for (let i = 0; i < horizon; i++) {
      if (i % 5 === 0)
        var start = Math.floor(random() * (returns.length - 5 + 1));
      value *= 1 + returns[start + (i % 5)];
      trajectory.push(value);
    }
    paths.push(trajectory);
  }
  return Array.from({ length: horizon + 1 }, (_, i) => ({
    step: i,
    low: quantile(
      paths.map((p) => p[i]),
      0.05,
    ),
    median: quantile(
      paths.map((p) => p[i]),
      0.5,
    ),
    high: quantile(
      paths.map((p) => p[i]),
      0.95,
    ),
  }));
}
