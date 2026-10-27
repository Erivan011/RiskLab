export const MODELS = ["historical", "gaussian", "ewma"];
const Z = {
  0.95: 1.6448536269514722,
  0.975: 1.959963984540054,
  0.99: 2.3263478740408408,
};
export const sum = (a) => a.reduce((s, x) => s + x, 0),
  mean = (a) => sum(a) / a.length;
export function quantile(a, p) {
  const s = [...a].sort((a, b) => a - b),
    k = (s.length - 1) * p,
    i = Math.floor(k);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (k - i);
}
const variance = (a) => {
  const m = mean(a);
  return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
};
function ll(x, n, p) {
  return (x ? x * Math.log(p) : 0) + (n - x ? (n - x) * Math.log1p(-p) : 0);
}
function erfc(x) {
  const t = 1 / (1 + 0.3275911 * x);
  return (
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
    t *
    Math.exp(-x * x)
  );
}
export function coverage(flags, alpha) {
  const n = flags.length,
    x = sum(flags.map(Number));
  if (n < 2) throw Error("Amostra insuficiente.");
  const lr = Math.max(0, 2 * (ll(x, n, x / n) - ll(x, n, alpha))),
    c = [
      [0, 0],
      [0, 0],
    ];
  for (let i = 1; i < n; i++) c[+flags[i - 1]][+flags[i]]++;
  const count = sum(c.flat()),
    success = c[0][1] + c[1][1],
    ll0 = ll(success, count, success / count),
    ll1 = sum(c.map((r) => (sum(r) ? ll(r[1], sum(r), r[1] / sum(r)) : 0))),
    lrInd = Math.max(0, 2 * (ll1 - ll0)),
    identifiable = c.every((r) => sum(r) > 0);
  return {
    observations: n,
    breaches: x,
    breach_rate: x / n,
    expected_breaches: n * alpha,
    kupiec_pvalue: erfc(Math.sqrt(lr / 2)),
    independence_pvalue: identifiable ? erfc(Math.sqrt(lrInd / 2)) : null,
    conditional_coverage_pvalue: identifiable
      ? Math.exp(-(lr + lrInd) / 2)
      : null,
  };
}
export function estimates(history, confidence) {
  const z = Z[confidence];
  if (!z) throw Error("Confiança não suportada.");
  const losses = history.map((x) => -x),
    v = quantile(losses, confidence),
    mu = mean(history),
    sd = Math.sqrt(variance(history));
  let s = 0,
    w = 0;
  for (let i = 0; i < history.length; i++) {
    const q = 0.94 ** (history.length - 1 - i);
    s += q * history[i] ** 2;
    w += q;
  }
  const ewma = Math.sqrt(s / w),
    tail = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI) / (1 - confidence);
  return {
    historical: { var: v, es: mean(losses.filter((x) => x >= v)) },
    gaussian: { var: -mu + z * sd, es: -mu + sd * tail },
    ewma: { var: z * ewma, es: ewma * tail },
  };
}
export function contributions(rows, weights) {
  const cols = weights.map((_, j) => rows.map((r) => r[j])),
    means = cols.map(mean),
    cov = cols.map((a, i) =>
      cols.map(
        (b, j) =>
          sum(a.map((x, k) => (x - means[i]) * (b[k] - means[j]))) /
          (a.length - 1),
      ),
    ),
    weighted = cov.map((r) => sum(r.map((v, j) => v * weights[j]))),
    v = sum(weighted.map((x, i) => x * weights[i])),
    sd = Math.sqrt(Math.max(v, 0));
  return {
    dailyVolatility: sd,
    covariance: cov,
    correlation: cov.map((r, i) =>
      r.map((v, j) =>
        cov[i][i] * cov[j][j] > 0 ? v / Math.sqrt(cov[i][i] * cov[j][j]) : 0,
      ),
    ),
    components: weighted.map((v, i) => (sd ? (weights[i] * v) / sd : 0)),
  };
}
function historical(values) {
  let wealth = 1,
    peak = 1,
    maxDrawdown = 0;
  const curve = values.map((r) => {
    wealth *= 1 + r;
    peak = Math.max(peak, wealth);
    const drawdown = wealth / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    return { wealth, drawdown };
  });
  return {
    curve,
    maxDrawdown,
    annualizedVolatility: Math.sqrt(variance(values)) * Math.sqrt(252),
    cumulativeReturn: wealth - 1,
  };
}
export function analyze({
  assets,
  weights,
  confidence = 0.99,
  window = 252,
  period = "all",
}) {
  if (
    weights.length !== 3 ||
    weights.some((x) => !Number.isFinite(x) || x < 0) ||
    Math.abs(sum(weights) - 1) > 1e-8
  )
    throw Error("Os pesos devem ser não negativos e somar 100%.");
  if (![126, 252, 504].includes(window) || !Z[confidence])
    throw Error("Configuração inválida.");
  if (!["all", "2023", "2024", "2025"].includes(period))
    throw Error("Período inválido.");
  if (
    assets.length < window + 2 ||
    assets.some(
      (a) =>
        a.values.length !== 3 ||
        a.values.some((v) => !Number.isFinite(v) || v <= -1),
    )
  )
    throw Error("Histórico inválido.");
  const returns = assets.map((a) =>
      sum(a.values.map((v, j) => v * weights[j])),
    ),
    rows = [];
  for (let i = window; i < assets.length; i++) {
    if (
      assets[i].date < "2023-01-01" ||
      assets[i].date > "2025-12-31" ||
      (period !== "all" && !assets[i].date.startsWith(period))
    )
      continue;
    rows.push({
      date: assets[i].date,
      trainingEnd: assets[i - 1].date,
      return: returns[i],
      loss: -returns[i],
      estimates: estimates(returns.slice(i - window, i), confidence),
    });
  }
  if (rows.length < 2) throw Error("Período sem observações suficientes.");
  const stats = MODELS.map((model) => {
    const test = coverage(
      rows.map((r) => r.loss > r.estimates[model].var),
      1 - confidence,
    );
    return {
      model,
      ...test,
      quantileLoss: mean(
        rows.map((r) => {
          const e = r.loss - r.estimates[model].var;
          return e >= 0 ? confidence * e : (confidence - 1) * e;
        }),
      ),
      meanVar: mean(rows.map((r) => r.estimates[model].var)),
      meanES: mean(rows.map((r) => r.estimates[model].es)),
    };
  });
  const endIndex = assets.findIndex((a) => a.date === rows.at(-1).date),
    riskContributions = contributions(
      assets.slice(endIndex - window, endIndex).map((a) => a.values),
      weights,
    );
  return {
    rows,
    stats,
    last: rows.at(-1),
    history: historical(rows.map((r) => r.return)),
    riskContributions,
    weights,
    confidence,
    window,
    period,
    scenarioId: `${weights.map((x) => (x * 100).toFixed(2)).join("-")}_${confidence}_${window}_${period}`,
    stressDays: [...rows].sort((a, b) => a.return - b.return).slice(0, 5),
  };
}
export function shockLoss(weights, shocks) {
  if (
    shocks.length !== weights.length ||
    shocks.some((x) => !Number.isFinite(x) || x < -1 || x > 1)
  )
    throw Error("Choques devem estar entre -100% e +100%.");
  return -sum(weights.map((w, i) => w * shocks[i]));
}

/** Capacity is conditional on fixed weights and linear notional scaling, not an optimization. */
export function assessLimit({ varRate, esRate, notional, limit }) {
  if (
    ![varRate, esRate, notional, limit].every(Number.isFinite) ||
    notional <= 0 ||
    limit <= 0 ||
    esRate < varRate
  ) {
    throw new Error(
      "Informe um nocional e um limite positivos, com estimativas válidas.",
    );
  }
  const varBrl = varRate * notional;
  const esBrl = esRate * notional;
  const capacityBrl = varRate > 0 ? limit / varRate : null;
  return {
    varBrl,
    esBrl,
    headroomBrl: limit - varBrl,
    utilization: varBrl / limit,
    capacityBrl,
    reductionBrl:
      capacityBrl === null ? 0 : Math.max(0, notional - capacityBrl),
    varExceeded: varBrl > limit,
    tailExceeded: esBrl > limit,
  };
}
