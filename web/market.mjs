import { fetchMarket } from "./market-data.mjs";
import {
  CURRENCIES,
  quoteStats,
  positionRisk,
  scenarioPnl,
  historicalCone,
} from "./market-engine.mjs";
const $ = (id) => document.getElementById(id),
  label = { USD: "Dólar americano", EUR: "Euro", GBP: "Libra esterlina" },
  color = { USD: "#06b6d4", EUR: "#f59e0b", GBP: "#3b82f6" };
const quote = (v) =>
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(v),
  money = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(Math.abs(v) < 0.5 ? 0 : v),
  pct = (v) =>
    (v >= 0 ? "+" : "") +
    new Intl.NumberFormat("pt-BR", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(v),
  date = (s) => s.split("-").reverse().join("/"),
  tone = (v) => (v >= 0 ? "up" : "down");
let market,
  selected = "USD",
  risk,
  series,
  chartSeries = [];
function quantities() {
  return [...document.querySelectorAll("[data-position]")].map((row) => {
    const text = row.querySelector("input").value,
      q = Number(text),
      sign = Number(row.querySelector("select").value);
    if (!text.trim() || !Number.isFinite(q) || q < 0 || q > 1e9)
      throw Error("Quantidades devem estar entre zero e um bilhão.");
    return q * sign;
  });
}
async function refresh() {
  const button = $("refresh-market");
  if (button.disabled) return;
  const statusBar = $("market-status").parentElement;
  button.disabled = true;
  button.textContent = "Consultando…";
  statusBar.dataset.state = "loading";
  statusBar.setAttribute("aria-busy", "true");
  $("market-status").textContent = "Consultando o Banco Central…";
  $("market-error").textContent = "";
  try {
    let candidate;
    try {
      candidate = await fetchMarket("./api/market");
    } catch {
      if (market) {
        statusBar.dataset.state = "snapshot";
        $("market-status").textContent = "Consulta indisponível · últimas referências válidas mantidas · " + date(series[selected].at(-1).date);
        return;
      }
      candidate = await fetchMarket("./market-snapshot.json");
      candidate.status = "snapshot";
    }
    market = candidate;
    series = Object.fromEntries(CURRENCIES.map(c => [c, market.currencies[c].points]));
    const latest = CURRENCIES.map(c => series[c].at(-1).date).sort();
    statusBar.dataset.state = ["updated", "partial"].includes(market.status) ? market.status : "snapshot";
    $("market-status").textContent =
      (market.status === "updated" ? "Consulta à fonte concluída"
        : market.status === "partial" ? "Consulta parcial · algumas moedas usam dados salvos"
        : "Dados salvos · consulta à fonte indisponível") +
      " · referências: " + (latest[0] === latest.at(-1) ? date(latest[0]) : date(latest[0]) + " a " + date(latest.at(-1)));
    renderQuotes();
    renderPositions();
    document.dispatchEvent(new CustomEvent("risklab:market", { detail: { market, series } }));
  } catch {
    statusBar.dataset.state = "error";
    $("market-status").textContent = "Referências indisponíveis";
    $("market-error").textContent = "Não foi possível carregar dados válidos. Tente atualizar novamente.";
  } finally {
    statusBar.setAttribute("aria-busy", "false");
    button.disabled = false;
    button.textContent = "Atualizar referências ↻";
  }
}
function renderQuotes() {
  $("quote-tape").innerHTML = CURRENCIES.map((c) => {
    const s = quoteStats(series[c]);
    return `<div class="tape-item"><span>${c}/BRL</span><strong>${quote(s.value)}</strong><span class="${tone(s.change)}">${s.change >= 0 ? "▲" : "▼"} ${pct(s.change)}</span></div>`;
  }).join("");
  $("watchlist").innerHTML = CURRENCIES.map((c) => {
    const s = quoteStats(series[c]);
    return `<button class="watch-button ${c === selected ? "active" : ""}" data-currency="${c}" aria-pressed="${c === selected}"><div class="watch-top"><strong>${c} / BRL</strong><span class="${tone(s.change)}">${pct(s.change)}</span></div><div class="watch-name">${label[c]}</div><div class="watch-price">${quote(s.value)}</div><div class="watch-date">${date(s.date)} · SGS ${market.currencies[c].series}</div></button>`;
  }).join("");
  document.querySelectorAll("[data-currency]").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.dataset.currency;
      renderQuotes();
      document.querySelector(`[data-currency="${selected}"]`).focus();
    }),
  );
  const stats = quoteStats(series[selected]);
  $("market-notice").textContent = stats.unusualMove
    ? "Movimento atípico: a variação entre as duas últimas referências supera 5%. Confira a data e a fonte antes de usar o dado."
    : "";
  $("market-symbol").textContent = selected + " / BRL · " + label[selected];
  $("market-price").textContent = "R$ " + quote(stats.value);
  $("market-change").textContent =
    `${stats.change >= 0 ? "▲" : "▼"} ${pct(stats.change)} vs. ${date(stats.previousDate)}`;
  $("market-change").className = tone(stats.change);
  for (const [id, key] of [
    ["market-month", "month"],
    ["market-year", "year"],
  ]) {
    $(id).textContent =
      stats[key] === null ? "Histórico insuficiente" : pct(stats[key]);
    $(id).className = tone(stats[key] ?? 0);
  }
  $("market-low").textContent = "R$ " + quote(stats.low);
  $("market-high").textContent = "R$ " + quote(stats.high);
  $("market-asof").textContent =
    `REFERÊNCIA EM ${date(stats.date)} · BCB/SGS ${market.currencies[selected].series} · ${market.currencies[selected].status === "updated" ? "consulta à fonte" : "snapshot salvo"}`;
  const range = stats.high - stats.low;
  const position = range ? (stats.value - stats.low) / range : 0;
  $("market-reading").textContent =
    `${label[selected]}: a referência variou ${pct(stats.change)} entre as duas últimas observações. A cotação atual está a ${(position * 100).toFixed(1)}% do caminho entre a mínima e a máxima das últimas ${Math.min(252, stats.observations)} observações. Essa posição na faixa não indica compra, venda nem probabilidade de reversão.`;
  renderPriceChart();
  renderCone();
}
function renderPriceChart() {
  if (!series) return;
  const count = Number($("market-period").value),
    compare = $("market-mode").value === "compare";
  let dates;
  if (compare) {
    const maps = CURRENCIES.map(
      (c) => new Map(series[c].map((p) => [p.date, p.value])),
    );
    dates = [...maps[0].keys()]
      .filter((d) => maps.every((m) => m.has(d)))
      .slice(-count);
    chartSeries = CURRENCIES.map((c, i) => ({
      symbol: c,
      points: dates.map((d) => ({
        date: d,
        value: (maps[i].get(d) / maps[i].get(dates[0])) * 100,
      })),
    }));
  } else {
    const points = series[selected].slice(-count);
    dates = points.map((p) => p.date);
    chartSeries = [{ symbol: selected, points }];
  }
  const all = chartSeries.flatMap((s) => s.points.map((p) => p.value)),
    low = Math.min(...all),
    high = Math.max(...all),
    span = high - low || 1,
    min = low - span * 0.08,
    max = high + span * 0.08,
    w = 900,
    h = 330,
    left = 65,
    right = 18,
    top = 20,
    bottom = 38,
    x = (i) => left + (i / Math.max(dates.length - 1, 1)) * (w - left - right),
    y = (v) => top + ((max - v) / (max - min)) * (h - top - bottom);
  let svg = "";
  for (let i = 0; i < 5; i++) {
    const value = min + ((max - min) * i) / 4;
    svg += `<line x1="${left}" x2="${w - right}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="2 3"/><text x="4" y="${(y(value) + 4).toFixed(1)}" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="10">${value.toFixed(compare ? 1 : 3)}</text>`;
  }
  for (const s of chartSeries) {
    const points = s.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    svg += `<polyline fill="none" stroke="${color[s.symbol]}" stroke-width="2.6" stroke-linejoin="round" points="${points}"/>`;
    const end = s.points.at(-1);
    svg += `<circle cx="${x(s.points.length - 1).toFixed(1)}" cy="${y(end.value).toFixed(1)}" r="4.5" fill="${color[s.symbol]}" stroke="#080c14" stroke-width="2.5"/>`;
  }
  for (const i of [0, Math.floor(dates.length / 2), dates.length - 1])
    svg += `<text x="${x(i).toFixed(1)}" y="${h - 10}" text-anchor="${i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="10">${date(dates[i])}</text>`;
  $("market-price-chart").innerHTML = svg;
  $("market-readout").textContent = compare
    ? "Comparação normalizada: USD em azul-claro, EUR em dourado, GBP em azul. Base 100 na primeira observação."
    : "Preço de referência em reais por unidade de moeda estrangeira. Passe sobre a linha ou use as setas do teclado para consultar uma data.";
}
function renderCone() {
  const cone = historicalCone(series[selected]),
    low = Math.min(...cone.map((p) => p.low)),
    high = Math.max(...cone.map((p) => p.high)),
    span = high - low || 1,
    x = (i) => 45 + (i / 20) * 535,
    y = (v) => 15 + ((high - v) / span) * 170,
    upper = cone.map((p) => `${x(p.step).toFixed(1)},${y(p.high).toFixed(1)}`).join(" "),
    lower = [...cone]
      .reverse()
      .map((p) => `${x(p.step).toFixed(1)},${y(p.low).toFixed(1)}`)
      .join(" "),
    median = cone.map((p) => `${x(p.step).toFixed(1)},${y(p.median).toFixed(1)}`).join(" ");
  $("scenario-cone").innerHTML =
    `<polygon points="${upper} ${lower}" fill="rgba(6, 182, 212, 0.15)" stroke="rgba(6, 182, 212, 0.3)" stroke-width="1"/><polyline points="${median}" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round"/><text x="3" y="19" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">${quote(high)}</text><text x="3" y="188" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">${quote(low)}</text><text x="45" y="214" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">Hoje / referência</text><text x="490" y="214" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">20 observações</text>`;
  const last = cone.at(-1);
  $("cone-description").textContent =
    `No passo 20: percentil 5 em R$ ${quote(last.low)} e percentil 95 em R$ ${quote(last.high)}. Intervalo de trajetórias reamostradas, sem garantia de cobertura futura.`;
}
function band(r) {
  return `<div><span>Exposição bruta</span><strong>${money(r.gross)}</strong><small>Soma dos valores absolutos</small></div><div><span>Exposição líquida</span><strong>${money(r.net)}</strong><small>Receber menos pagar</small></div><div><span>P&amp;L · último intervalo</span><strong class="${tone(r.dailyPnl)}">${money(r.dailyPnl)}</strong><small>Hipotético, com quantidades atuais</small></div><div><span>VaR histórico · 99%</span><strong>${money(r.varBrl)}</strong><small>ES de cauda: ${money(r.esBrl)}</small></div>`;
}
function renderPositions() {
  if (!series) return;
  try {
    risk = positionRisk(series, quantities());
    $("export-current").disabled = false;
    $("export-positions").disabled = false;
    $("position-error").textContent = "";
    document.querySelectorAll("[data-position]").forEach((row, i) => {
      const p = risk.positions[i];
      row.querySelector(".position-price").textContent = quote(p.price);
      row.querySelector(".position-notional").textContent = money(p.notional);
      row.querySelector(".position-pnl").textContent = money(p.dailyPnl);
      row.querySelector(".position-pnl").className =
        "position-pnl " + tone(p.dailyPnl);
      row.querySelector(".position-delta").textContent = money(
        p.sensitivity1pct,
      );
    });
    for (const id of ["market-exposure-band", "position-risk-band"])
      $(id).innerHTML = band(risk);
    $("market-position-context").textContent =
      `Carteira hipotética editável na aba Posições · data comum ${date(risk.asOf)} · variação vs. ${date(risk.previousDate)}. VaR e ES usam ${risk.observations} retornos anteriores/disponíveis e os nocionais atuais, sem juros ou custos.`;
    $("market-shocks").innerHTML = [-0.1, -0.05, 0.05, 0.1]
      .map((shock) => {
        const outcome = scenarioPnl(risk.positions, [shock, shock, shock]);
        return `<tr><td>${pct(shock)} nas três moedas</td><td class="${tone(outcome.unprotected)}">${money(outcome.unprotected)}</td><td>${outcome.unprotected >= 0 ? "Valorização líquida" : "Perda líquida"}</td></tr>`;
      })
      .join("");
    $("position-worst").innerHTML = risk.worst
      .map(
        (r) =>
          `<tr><td>${date(r.date)}</td><td class="${tone(r.pnl)}">${money(r.pnl)}</td></tr>`,
      )
      .join("");
    $("position-risk-note").textContent =
      `VaR de 99%: ${money(risk.varBrl)}; ES: ${money(risk.esBrl)}. A cauda foi estimada por reprecificação histórica da carteira atual em ${risk.observations} observações comuns. VaR não é perda máxima, e o cálculo não substitui precificação de derivativos ou controle bancário de capital.`;
    renderHedge();
  } catch (e) {
    risk = undefined;
    $("export-current").disabled = true;
    $("export-positions").disabled = true;
    $("position-error").textContent = e.message;
  }
}
function renderHedge() {
  if (!risk) return;
  try {
    const rawCoverage = $("position-coverage").value,
      rawShock = $("position-shock").value;
    if (!rawCoverage.trim() || !rawShock.trim())
      throw Error("Informe cobertura e choque.");
    const coverage = Number(rawCoverage) / 100,
      shock = Number(rawShock) / 100,
      r = scenarioPnl(risk.positions, [shock, shock, shock], coverage);
    $("unhedged-pnl").textContent = money(r.unprotected);
    $("unhedged-pnl").className = tone(r.unprotected);
    $("hedged-pnl").textContent = money(r.residual);
    $("hedged-pnl").className = tone(r.residual);
    $("hedge-description").textContent =
      `Neutralização idealizada de ${(coverage * 100).toFixed(0)}% de cada posição. Compensação hipotética: ${money(r.offset)}. Nenhum contrato foi cotado ou executado.`;
    $("hedge-error").textContent = "";
  } catch (e) {
    $("hedge-error").textContent = e.message;
    $("unhedged-pnl").textContent = "—";
    $("hedged-pnl").textContent = "—";
  }
}
$("refresh-market").addEventListener("click", refresh);
$("market-period").addEventListener("change", renderPriceChart);
$("market-mode").addEventListener("change", renderPriceChart);
$("recalculate-positions").addEventListener("click", renderPositions);
document.querySelectorAll("[data-position] input, [data-position] select").forEach(control => {
  control.addEventListener("input", () => {
    risk = undefined;
    $("export-current").disabled = true;
    $("export-positions").disabled = true;
    $("position-error").textContent = "Posições alteradas. Recalcule para atualizar os resultados e habilitar a exportação.";
  });
});
["position-coverage", "position-shock"].forEach((id) =>
  $(id).addEventListener("input", renderHedge),
);
$("market-price-chart").addEventListener("pointermove", (e) => {
  if (!chartSeries.length) return;
  const box = e.currentTarget.getBoundingClientRect(),
    fraction = Math.max(
      0,
      Math.min(
        1,
        (e.clientX - box.left - (box.width * 65) / 900) /
          ((box.width * 817) / 900),
      ),
    ),
    i = Math.round(fraction * (chartSeries[0].points.length - 1));
  $("market-readout").textContent =
    date(chartSeries[0].points[i].date) +
    " · " +
    chartSeries
      .map((s) => `${s.symbol} ${quote(s.points[i].value)}`)
      .join(" · ");
});
function exportCurrentPositions() {
  if (!risk) return;
  const content = {
    version: "0.4.0",
    source: "BCB / SGS",
    marketStatus: market.status,
    checkedAt: market.checkedAt,
    valuationDate: risk.asOf,
    calculation: risk,
    assumptions:
      "Hypothetical FX receivables/payables. No interest, costs, execution or derivative pricing.",
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `risklab-posicoes-${risk.asOf}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
$("export-positions").addEventListener("click", exportCurrentPositions);
$("export-current").addEventListener("click", exportCurrentPositions);
async function initializeMarket() {
  try {
    market = await fetchMarket("./market-snapshot.json");
    series = Object.fromEntries(CURRENCIES.map(c => [c, market.currencies[c].points]));
    renderQuotes();
    renderPositions();
    document.dispatchEvent(new CustomEvent("risklab:market", { detail: { market, series } }));
  } catch {
    // The primary endpoint may still be available when the bundled snapshot fails.
  }
  refresh();
}
let keyboardIndex = null;
$("market-price-chart").addEventListener("keydown", (event) => {
  if (!chartSeries.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const last = chartSeries[0].points.length - 1;
  keyboardIndex = Math.min(last, keyboardIndex ?? last);
  if (event.key === "Home") keyboardIndex = 0;
  else if (event.key === "End") keyboardIndex = last;
  else keyboardIndex = Math.max(0, Math.min(last, keyboardIndex + (event.key === "ArrowLeft" ? -1 : 1)));
  $("market-readout").textContent = date(chartSeries[0].points[keyboardIndex].date) + " · " +
    chartSeries.map(s => `${s.symbol} ${quote(s.points[keyboardIndex].value)}`).join(" · ");
});
$("market-readout").setAttribute("aria-live", "polite");
initializeMarket();
