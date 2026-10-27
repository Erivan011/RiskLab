import { CURRENCIES, positionRisk } from './market-engine.mjs';

export function evaluateDesk(series, quantities, coverage, shocks, budget) {
  if (![quantities, coverage, shocks].every(a => Array.isArray(a) && a.length === 3) ||
      quantities.some(q => !Number.isFinite(q) || Math.abs(q) > 1e9) ||
      coverage.some(c => !Number.isFinite(c) || c < 0 || c > 1) ||
      shocks.some(s => !Number.isFinite(s) || s < -1 || s > 1) ||
      !Number.isFinite(budget) || budget <= 0)
    throw new Error('Confira posições, coberturas de 0 a 100%, choques de −100 a 100% e limite positivo.');
  const baseline = positionRisk(series, quantities);
  const residual = positionRisk(series, quantities.map((q, i) => q * (1 - coverage[i])));
  const maps = CURRENCIES.map(c => new Map(series[c].map(p => [p.date, p.value])));
  const dates = [...maps[0].keys()].filter(d => maps.every(m => m.has(d))).sort();
  const start = dates.length - baseline.observations;
  const tail = baseline.losses.map((loss, i) => ({ loss, i })).filter(r => r.loss >= baseline.varBrl);
  // Exact additive attribution on the same portfolio-tail dates, including negative offsets.
  const contributions = baseline.positions.map((p, j) => ({
    currency: p.currency,
    es: tail.reduce((total, r) => {
      const index = start + r.i;
      return total - p.notional * (maps[j].get(dates[index]) / maps[j].get(dates[index - 1]) - 1);
    }, 0) / tail.length,
  }));
  const pnl = baseline.positions.reduce((v, p, i) => v + p.notional * shocks[i], 0);
  const residualPnl = residual.positions.reduce((v, p, i) => v + p.notional * shocks[i], 0);
  const residualGross = residual.gross;
  const reverseShock = residualGross > 0 ? budget / residualGross : null;
  const sweep = [-0.1, -0.05, 0, 0.05, 0.1];
  const matrix = sweep.map(eur => sweep.map(usd =>
    residual.positions[0].notional * usd + residual.positions[1].notional * eur + residual.positions[2].notional * shocks[2]));
  const concentration = baseline.gross > 0 ? Math.max(...baseline.positions.map(p => Math.abs(p.notional))) / baseline.gross : 0;
  return {
    baseline, residual, contributions, pnl, residualPnl, matrix, sweep, concentration,
    tailCount: tail.length, budget, coverage, shocks, quantities,
    reverseShock, reverseDirection: residual.positions.map(p => p.notional > 0 ? -1 : p.notional < 0 ? 1 : 0),
    esReduction: baseline.esBrl > 0 ? 1 - residual.esBrl / baseline.esBrl : null,
    budgetExceeded: residual.esBrl > budget,
  };
}

export function lossHistogram(losses, bins = 24) {
  if (!Array.isArray(losses) || !losses.length || losses.some(v=>!Number.isFinite(v)) || !Number.isInteger(bins) || bins<2 || bins>100)
    throw new Error('Distribuição inválida.');
  const low=Math.min(...losses), high=Math.max(...losses);
  const width=(high-low || 1)/bins;
  const result=Array.from({length:bins},(_,i)=>({low:low+i*width,high:low+(i+1)*width,count:0}));
  for(const loss of losses) result[Math.min(bins-1,Math.floor((loss-low)/width))].count++;
  return result;
}
