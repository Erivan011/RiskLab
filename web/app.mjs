import { analyze, shockLoss, sum, assessLimit } from "./risk-engine.mjs";
const $ = (id) => document.getElementById(id),
  names = {
    historical: "Simulação histórica",
    gaussian: "Normal móvel",
    ewma: "EWMA",
    rolling_20: "Média móvel · 20",
    gradient_boosting: "Gradient Boosting",
  },
  symbols = ["USD", "EUR", "GBP"],
  colors = ["#06b6d4", "#f59e0b", "#3b82f6"];
const pct = (x) =>
    new Intl.NumberFormat("pt-BR", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(x),
  money = (x) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(x),
  number = (x, n = 4) => (x === null ? "Não identificável" : x.toFixed(n)),
  date = (s) => s.split("-").reverse().join("/");
let pack,
  result,
  activeModel = "historical",
  activeNotional = 1e6,
  requestId = 0,
  worker;
const ids = ["weight-usd", "weight-eur", "weight-gbp"];
function weights() {
  return ids.map((id) => {
    if ($(id).value.trim() === "") throw Error("Informe os três pesos.");
    return Number($(id).value) / 100;
  });
}
function validateWeights() {
  try {
    const w = weights(),
      total = sum(w);
    $("weight-sum").textContent = `Total: ${(total * 100).toFixed(0)}%`;
    const valid =
      w.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) &&
      Math.abs(total - 1) < 1e-8;
    $("weight-error").textContent = valid
      ? ""
      : "A soma dos pesos deve ser exatamente 100%, com valores entre 0% e 100%.";
    return valid;
  } catch (e) {
    $("weight-error").textContent = e.message;
    return false;
  }
}
function busy(value) {
  for (const id of ["apply", "apply-weights", "export", "export-breaches"])
    $(id).disabled = value;
  $("calculation-status").textContent = value
    ? "Recalculando cenário…"
    : `${result?.rows.length ?? 0} previsões por modelo · cálculo concluído`;
}
function accept(id, value, error) {
  if (id !== requestId) return;
  if (error) {
    $("global-error").textContent = error;
    busy(false);
    return;
  }
  result = value;
  activeModel = $("model").value;
  activeNotional = Number($("notional").value);
  render();
  busy(false);
}
function applyScenario() {
  if (!pack) return;
  if (!$("configuration").reportValidity() || !validateWeights()) return;
  const input = {
    assets: pack.assets,
    weights: weights(),
    confidence: Number($("confidence").value),
    window: Number($("window").value),
    period: $("period").value,
  };
  $("global-error").textContent = "";
  busy(true);
  const id = ++requestId;
  if (worker) worker.postMessage({ id, input });
  else
    setTimeout(() => {
      try {
        accept(id, analyze(input));
      } catch (e) {
        accept(id, null, e.message);
      }
    }, 0);
}
function selected() {
  return result.stats.find((s) => s.model === activeModel);
}
function navigate(tab) {
  for (const b of document.querySelectorAll("nav button")) {
    const active = b.dataset.tab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-current", active ? "page" : "false");
    if (active) b.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
  for (const p of document.querySelectorAll(".tab-page"))
    p.classList.toggle("active", p.id === tab);
  document.querySelector(".shell").dataset.section = tab;
  const titles = {
    company: ["Suzano: câmbio, balanço e caixa", "Uma investigação financeira com dados públicos de uma companhia brasileira."],
    desk: ["Mesa de risco cambial", "Investigue a exposição, compare coberturas e teste a resistência da carteira."],
    market: [
      "Câmbio, exposição e risco.",
      "Moedas em movimento, impacto nas posições e cenários de perda. Referências diárias oficiais do Banco Central.",
    ],
    positions: [
      "Posições & risco cambial",
      "Recebimentos, pagamentos e neutralização de choque: dimensione a exposição pelos fatores de risco.",
    ],
    overview: [
      "A exposição cabe no limite?",
      "Defina o orçamento de perda, investigue a concentração por moeda e confira onde o histórico contraria a estimativa.",
    ],
    exposure: [
      "Composição da exposição",
      "Explore como os pesos financeiros e as correlações mudam a concentração de risco.",
    ],
    backtesting: [
      "Validação das estimativas",
      "Registre as falhas de cobertura e compare os métodos sob as mesmas condições.",
    ],
    stress: [
      "Cenários de estresse",
      "Teste choques simultâneos e repita os dias mais adversos do histórico.",
    ],
    models: [
      "Modelos & procedência",
      "Resultados reproduzíveis, protocolo temporal e limites explícitos.",
    ],
  };
  $("page-title").textContent = titles[tab][0];
  $("breadcrumb").textContent = titles[tab][0];
  $("page-subtitle").textContent = titles[tab][1];
}
function render() {
  const { rows, last, history, riskContributions: rc } = result,
    stats = selected(),
    latest = last.estimates[activeModel];
  $("active-config").textContent =
    `${result.weights.map((w, i) => symbols[i] + " " + pct(w)).join(" · ")}  |  ${pct(result.confidence)} de confiança  |  ${result.window} observações  |  ${date(rows[0].date)} — ${date(last.date)}`;
  for (const el of document.querySelectorAll(".confidence-label"))
    el.textContent = pct(result.confidence);
  $("metric-var").textContent = money(latest.var * activeNotional);
  $("metric-es").textContent = money(latest.es * activeNotional);
  $("metric-var-note").textContent =
    `Estimativa para ${date(last.date)}, usando dados até ${date(last.trainingEnd)}.`;
  $("metric-vol").textContent = pct(history.annualizedVolatility);
  $("metric-dd").textContent = pct(history.maxDrawdown);
  $("coverage-count").textContent = `${stats.breaches} / ${stats.observations}`;
  $("coverage-expectation").textContent =
    `${stats.expected_breaches.toFixed(2)} exceções esperadas em média · taxa observada ${pct(stats.breach_rate)}.`;
  for (const [id, key] of [
    ["kupiec", "kupiec_pvalue"],
    ["independence", "independence_pvalue"],
    ["conditional", "conditional_coverage_pvalue"],
  ])
    $(id).textContent = number(stats[key]);
  const rejected = stats.kupiec_pvalue < 0.05;
  $("coverage-pill").textContent = rejected
    ? "Cobertura rejeitada"
    : "Não rejeitada";
  $("coverage-pill").className = "pill" + (rejected ? " warn" : "");
  $("risk-contribution-bars").innerHTML = rc.components
    .map((v, i) => {
      const share = rc.dailyVolatility ? v / rc.dailyVolatility : 0;
      return `<div class="row-label"><span><i class="dot" style="background:${colors[i]}"></i>${symbols[i]} / BRL</span><strong>${pct(share)}</strong></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, share * 100))}%;background:${colors[i]}"></i></div>`;
    })
    .join("");
  $("contributions-table").innerHTML = rc.components
    .map(
      (v, i) =>
        `<tr><td>${symbols[i]} / BRL</td><td>${pct(result.weights[i])}</td><td>${money(result.weights[i] * activeNotional)}</td><td>${pct(v * Math.sqrt(252))}</td><td>${pct(rc.dailyVolatility ? v / rc.dailyVolatility : 0)}</td></tr>`,
    )
    .join("");
  $("correlation").innerHTML =
    "<span></span>" +
    symbols.map((s) => `<div class="head">${s}</div>`).join("") +
    rc.correlation
      .map(
        (row, i) =>
          `<span>${symbols[i]}</span>` +
          row
            .map(
              (v) =>
                `<div class="heatcell" style="background:rgba(56, 189, 248, ${0.08 + Math.abs(v) * 0.45});color:#ffffff">${v.toFixed(2)}</div>`,
            )
            .join(""),
      )
      .join("");
  $("models-risk-table").innerHTML = result.stats
    .map(
      (s) =>
        `<tr><td>${names[s.model]}${s.model === activeModel ? ' <span class="pill neutral">Em análise</span>' : ""}</td><td>${s.breaches}</td><td>${pct(s.breach_rate)}</td><td>${pct(1 - result.confidence)}</td><td>${number(s.kupiec_pvalue)}</td><td>${number(s.independence_pvalue)}</td><td>${number(s.quantileLoss, 6)}</td></tr>`,
    )
    .join("");
  const breaches = rows
    .filter((r) => r.loss > r.estimates[activeModel].var)
    .sort((a, b) => b.loss - a.loss);
  $("breaches-table").innerHTML = breaches.length
    ? breaches
        .map(
          (r) =>
            `<tr><td>${date(r.date)}</td><td>${pct(r.loss)}</td><td>${pct(r.estimates[activeModel].var)}</td><td class="red">${money((r.loss - r.estimates[activeModel].var) * activeNotional)}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="empty">Nenhuma exceção neste recorte.</td></tr>';
  $("historical-stress").innerHTML = result.stressDays
    .map(
      (r) =>
        `<tr><td>${date(r.date)}</td><td class="red">${pct(r.return)}</td><td>${money(r.loss * activeNotional)}</td></tr>`,
    )
    .join("");
  for (const el of document.querySelectorAll(".date-labels"))
    el.innerHTML = `<span>${date(rows[0].date)}</span><span>${date(rows[Math.floor(rows.length / 2)].date)}</span><span>${date(last.date)}</span>`;
  drawRisk();
  drawDrawdown();
  drawHistogram();
  renderShock();
  renderLimit();
}
function chartBase(width, height, min, max) {
  const left = 48,
    right = 10,
    top = 14,
    bottom = 25,
    span = max - min || 1,
    x = (i, n) => left + (i / Math.max(n - 1, 1)) * (width - left - right),
    y = (v) => top + ((max - v) / span) * (height - top - bottom);
  let grid = "";
  for (let i = 0; i < 5; i++) {
    const v = min + (span * i) / 4;
    grid += `<line x1="${left}" y1="${y(v).toFixed(1)}" x2="${width - right}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="2 3"/><text x="1" y="${(y(v) + 3).toFixed(1)}" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="10">${(v * 100).toFixed(1)}%</text>`;
  }
  return { x, y, grid };
}
function drawRisk() {
  const rows = result.rows,
    min = Math.min(0, ...rows.map((r) => r.loss)),
    max =
      Math.max(
        ...rows.map((r) => Math.max(r.loss, r.estimates[activeModel].var)),
      ) * 1.08,
    { x, y, grid } = chartBase(900, 275, min, max),
    line = (key) =>
      rows
        .map(
          (r, i) => `${x(i, rows.length).toFixed(1)},${y(key(r)).toFixed(1)}`,
        )
        .join(" ");
  $("risk-chart").innerHTML =
    grid +
    `<polyline points="${line((r) => r.loss)}" fill="none" stroke="#64748b" stroke-width="1.3" opacity=".75"/><polyline points="${line((r) => r.estimates[activeModel].var)}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round"/>` +
    rows
      .map((r, i) =>
        r.loss > r.estimates[activeModel].var
          ? `<circle cx="${x(i, rows.length).toFixed(1)}" cy="${y(r.loss).toFixed(1)}" r="4.5" fill="#ef4444" stroke="#080c14" stroke-width="2"><title>${date(r.date)} · perda ${pct(r.loss)}</title></circle>`
          : "",
      )
      .join("");
}
function drawDrawdown() {
  const values = result.history.curve.map((v) => v.drawdown),
    { x, y, grid } = chartBase(600, 190, Math.min(...values) * 1.1, 0),
    points = values.map((v, i) => `${x(i, values.length).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  $("drawdown-chart").innerHTML =
    grid +
    `<polygon points="${x(0, values.length).toFixed(1)},${y(0).toFixed(1)} ${points} ${x(values.length - 1, values.length).toFixed(1)},${y(0).toFixed(1)}" fill="rgba(239, 68, 68, 0.2)"/><polyline points="${points}" fill="none" stroke="#f87171" stroke-width="2" stroke-linejoin="round"/>`;
}
function drawHistogram() {
  const values = result.rows.map((r) => r.return),
    low = Math.min(...values),
    high = Math.max(...values),
    bins = Array(28).fill(0),
    step = (high - low) / 28 || 1;
  for (const v of values) bins[Math.min(27, Math.floor((v - low) / step))]++;
  const max = Math.max(...bins),
    left = 38,
    w = 540,
    h = 180;
  let bars = "";
  bins.forEach((n, i) => {
    const height = (n / max) * h;
    const isNegative = low + (i + 0.5) * step < 0;
    bars += `<rect x="${(left + (i * w) / 28).toFixed(1)}" y="${(200 - height).toFixed(1)}" width="${(w / 28 - 2).toFixed(1)}" height="${height.toFixed(1)}" rx="3" fill="${isNegative ? "#ef4444" : "#06b6d4"}"><title>${pct(low + i * step)} a ${pct(low + (i + 1) * step)} · ${n} observações</title></rect>`;
  });
  $("histogram").innerHTML =
    `<line x1="${left}" y1="200" x2="580" y2="200" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>` +
    bars +
    `<text x="38" y="225" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">${pct(low)}</text><text x="530" y="225" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">${pct(high)}</text><text x="3" y="22" font-family="ui-monospace, monospace" font-size="10" fill="#94a3b8">${max}</text>`;
  $("histogram-description").textContent =
    `${values.length} retornos · menor ${pct(low)} · maior ${pct(high)}.`;
}
function renderShock() {
  if (!result) return;
  try {
    const ids = ["shock-usd", "shock-eur", "shock-gbp"];
    if (ids.some((id) => $(id).value.trim() === ""))
      throw Error("Informe os três choques.");
    const shocks = ids.map((id) => Number($(id).value) / 100),
      loss = shockLoss(result.weights, shocks);
    $("shock-result").textContent =
      (loss >= 0 ? "Perda de " : "Ganho de ") +
      money(Math.abs(loss) * activeNotional);
    $("shock-result").className =
      "scenario-result " + (loss >= 0 ? "red" : "accent");
    $("shock-description").textContent =
      `Impacto de ${pct(-loss)} sobre ${money(activeNotional)}, com os pesos aplicados ao cenário. Não é uma previsão.`;
    $("shock-error").textContent = "";
  } catch (e) {
    $("shock-error").textContent = e.message;
    $("shock-result").textContent = "—";
  }
}
function download(name, type, content) {
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function setupMetadata() {
  const s = pack.summary;
  $("ml-champion").textContent = names[s.volatility_champion];
  $("ml-table").innerHTML = s.volatility_validation
    .map((v) => {
      const t = s.volatility_test.find((t) => t.model === v.model);
      return `<tr><td>${names[v.model]}</td><td>${number(v.qlike, 5)}</td><td>${number(t.qlike, 5)}</td><td>${number(t.mae_variance, 7)}</td><td><span class="pill ${v.model === s.volatility_champion ? "" : "neutral"}">${v.model === s.volatility_champion ? "Selecionado" : "Referência comparada"}</span></td></tr>`;
    })
    .join("");
  $("data-rows").textContent =
    s.data_quality.common_rows.toLocaleString("pt-BR");
  $("data-period").textContent =
    `${date(s.data_quality.first_date)} — ${date(s.data_quality.last_date)} · ${s.data_quality.excluded_noncommon_dates} datas sem todas as moedas excluídas. Preços positivos, datas únicas e retornos sem preenchimento artificial.`;
  for (const [symbol, source] of Object.entries(s.data_quality.sources)) {
    const h = document.createElement("p");
    h.className = "micro";
    h.textContent = `${symbol} · SGS ${source.sgs_code} · SHA-256`;
    const code = document.createElement("div");
    code.className = "mono";
    code.textContent = source.sha256;
    $("hashes").append(h, code);
  }
  for (const text of s.limitations) {
    const li = document.createElement("li");
    li.textContent = text;
    $("limitations").appendChild(li);
  }
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => b.addEventListener("click", () => navigate(b.dataset.tab)));
document
  .querySelectorAll("[data-goto]")
  .forEach((b) => b.addEventListener("click", () => navigate(b.dataset.goto)));
$("configuration").addEventListener("submit", (e) => {
  e.preventDefault();
  applyScenario();
});
$("apply-weights").addEventListener("click", applyScenario);
ids.forEach((id) => $(id).addEventListener("input", validateWeights));
$("reset-weights").addEventListener("click", () => {
  [50, 30, 20].forEach((v, i) => ($(ids[i]).value = v));
  validateWeights();
  applyScenario();
});
$("model").addEventListener("change", () => {
  if (result) {
    activeModel = $("model").value;
    render();
  }
});
$("risk-budget").addEventListener("input", renderLimit);
for (const id of ["confidence", "window", "period", "notional"])
  $(id).addEventListener("input", () => {
    $("calculation-status").textContent =
      "Alteração pendente · aplique o cenário";
  });
["shock-usd", "shock-eur", "shock-gbp"].forEach((id) =>
  $(id).addEventListener("input", renderShock),
);
document.querySelectorAll("[data-shock]").forEach((b) =>
  b.addEventListener("click", () => {
    b.dataset.shock
      .split(",")
      .forEach(
        (v, i) => ($(["shock-usd", "shock-eur", "shock-gbp"][i]).value = v),
      );
    renderShock();
  }),
);
$("risk-chart").addEventListener("pointermove", (e) => {
  if (!result) return;
  const rect = e.currentTarget.getBoundingClientRect(),
    fraction = Math.max(
      0,
      Math.min(
        1,
        (e.clientX - rect.left - (48 / 900) * rect.width) /
          (rect.width * (842 / 900)),
      ),
    ),
    r = result.rows[Math.round(fraction * (result.rows.length - 1))];
  $("chart-readout").textContent =
    `${date(r.date)} · perda ${pct(r.loss)} · VaR ${pct(r.estimates[activeModel].var)} · dados até ${date(r.trainingEnd)}${r.loss > r.estimates[activeModel].var ? " · EXCEÇÃO" : ""}`;
});
$("export").addEventListener("click", () => {
  if (result)
    download(
      `risklab-${result.scenarioId}.json`,
      "application/json",
      JSON.stringify(
        {
          version: "0.3.0",
          risk_budget_brl: Number($("risk-budget").value),
          notional_brl: activeNotional,
          active_model: activeModel,
          calculation: result,
          source_hashes: pack.summary.data_quality.sources,
        },
        null,
        2,
      ),
    );
});
$("export-breaches").addEventListener("click", () => {
  if (!result) return;
  const rows = result.rows.filter((r) => r.loss > r.estimates[activeModel].var),
    header =
      "date,model,loss_fraction,var_fraction,es_fraction,excess_brl,training_end";
  download(
    "risklab-excecoes.csv",
    "text/csv;charset=utf-8",
    header +
      "\n" +
      rows
        .map((r) =>
          [
            r.date,
            activeModel,
            r.loss,
            r.estimates[activeModel].var,
            r.estimates[activeModel].es,
            (r.loss - r.estimates[activeModel].var) * activeNotional,
            r.trainingEnd,
          ].join(","),
        )
        .join("\n"),
  );
});
async function start() {
  try {
    const response = await fetch("./dataset.json");
    if (!response.ok) throw Error("Não foi possível carregar o histórico.");
    pack = await response.json();
    setupMetadata();
    try {
      worker = new Worker(new URL("./risk-worker.mjs", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e) => accept(e.data.id, e.data.result, e.data.error);
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        applyScenario();
      };
    } catch {
      worker = null;
    }
    applyScenario();
  } catch (e) {
    $("global-error").textContent = e.message;
    $("calculation-status").textContent = "Falha ao carregar dados";
    $("apply").disabled = true;
  }
}
function renderLimit() {
  if (!result) return;
  try {
    if ($("risk-budget").value.trim() === "")
      throw new Error("Informe o orçamento de perda.");
    const limit = Number($("risk-budget").value);
    const estimate = result.last.estimates[activeModel];
    const assessment = assessLimit({
      varRate: estimate.var,
      esRate: estimate.es,
      notional: activeNotional,
      limit,
    });
    $("budget-error").textContent = "";
    $("budget-status").textContent = assessment.varExceeded
      ? "VaR acima do orçamento definido"
      : "VaR dentro do orçamento definido";
    $("budget-status").className =
      "decision-status" + (assessment.varExceeded ? " breached" : "");
    $("budget-headroom").textContent = money(assessment.headroomBrl);
    $("budget-headroom").className = assessment.headroomBrl < 0 ? "red" : "";
    $("budget-capacity").textContent =
      assessment.capacityBrl === null
        ? "Não identificável"
        : money(assessment.capacityBrl);
    $("budget-meter-fill").style.width =
      `${Math.max(0, Math.min(100, assessment.utilization * 100))}%`;
    $("budget-meter-fill").style.background = assessment.varExceeded
      ? "var(--red)"
      : "var(--green)";
    $("budget-usage").textContent =
      `${pct(assessment.utilization)} utilizado pelo VaR`;
    if (assessment.varExceeded) {
      $("budget-reading").textContent =
        `Leitura do cenário: a estimativa de VaR excede o orçamento em ${money(-assessment.headroomBrl)}. Mantendo pesos, janela e modelo, uma exposição ${money(assessment.reductionBrl)} menor igualaria o VaR ao limite. Isso é um dimensionamento condicional, não uma recomendação de operação.`;
    } else if (assessment.tailExceeded) {
      $("budget-reading").textContent =
        `Leitura do cenário: o VaR deixa uma folga de ${money(assessment.headroomBrl)}, mas o ES supera o orçamento em ${money(assessment.esBrl - limit)}. Caber no quantil não significa que as perdas além dele cabem no mesmo limite.`;
    } else {
      $("budget-reading").textContent =
        `Leitura do cenário: VaR e ES estimados ficam abaixo do orçamento de ${money(limit)}. A folga pelo VaR é ${money(assessment.headroomBrl)}. O modelo continua sujeito a exceções e a mudanças de regime; a margem não representa proteção contratada.`;
    }
  } catch (error) {
    $("budget-error").textContent = error.message;
    $("budget-status").textContent = "Orçamento inválido";
    $("budget-headroom").textContent = "—";
    $("budget-capacity").textContent = "—";
    $("budget-reading").textContent = "";
    $("budget-usage").textContent = "—";
    $("budget-meter-fill").style.width = "0%";
  }
}
start();
