import {
  analyzeTrade,
  priceOperation,
  validateOperations,
  CURRENCIES,
  addDays,
} from "./trade-engine.mjs";
import { parseCsv, serializeCsv, COLUMNS } from "./trade-csv.mjs";
import { fetchMarket } from "./market-data.mjs";
const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
const fullMoney = (n) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
const number = (n) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
const rateText = (n) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
const date = (s) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(s + "T12:00:00Z"))
    .replace(".", "");
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const storeKey = "risklab.trade.workspace.v1",
  scenarioKey = "risklab.trade.scenarios.v1";
let demo,
  operations = [],
  receipts = [],
  audit = [],
  saved = [],
  market,
  rates,
  referenceDates,
  result,
  openingCash = 155000,
  horizon = 90,
  editing = null,
  chartIndex = 0;
let shocks = { USD: 0, EUR: 0, GBP: 0 },
  refreshing = false;
const viewNames = {
  overview: [
    "Visão geral",
    "Mesa de câmbio",
    "Pagamentos, posições e liquidez em uma única mesa.",
  ],
  operations: [
    "Operações",
    "A carteira, em detalhe",
    "Identifique o que vence, o que mudou e onde o custo está exposto.",
  ],
  scenarios: [
    "Laboratório",
    "Teste antes de decidir",
    "Choques explícitos. Premissas abertas. Efeito em reais e no caixa.",
  ],
  data: [
    "Dados e método",
    "Confiança começa nos dados",
    "Fontes, contratos de cálculo e limites da demonstração.",
  ],
};
function announce(message) {
  $("live-status").textContent = message;
}
function record(message) {
  audit.unshift({ time: new Date().toISOString(), message });
  audit = audit.slice(0, 25);
}
function persist() {
  try {
    localStorage.setItem(
      storeKey,
      JSON.stringify({ version: 1, operations, receipts, openingCash, audit }),
    );
  } catch {
    announce(
      "Não foi possível persistir as alterações. Exporte a carteira antes de sair.",
    );
  }
}
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function switchView() {
  const key = location.hash.slice(1);
  const view = viewNames[key] ? key : "overview";
  document
    .querySelectorAll(".view")
    .forEach((el) => el.classList.toggle("active", el.id === "view-" + view));
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
    el.setAttribute(
      "aria-current",
      el.dataset.view === view ? "page" : "false",
    );
  });
  $("top-title").textContent = viewNames[view][0];
  $("page-title").innerHTML = esc(viewNames[view][1]) + "<span>.</span>";
  $("page-description").textContent = viewNames[view][2];
  document.title = "RiskLab Trade · " + viewNames[view][0];
}
window.addEventListener("hashchange", switchView);
switchView();
function getStatus(row) {
  return row.status === "paid"
    ? ["Pago", "green"]
    : row.dueDate < demo.asOf
      ? ["Vencido", "red"]
      : row.status === "review"
        ? ["Em revisão", "orange"]
        : ["A vencer", "gray"];
}
function recalculate() {
  if (!rates || !demo) return;
  try {
    result = analyzeTrade({
      operations,
      rates,
      shocks,
      asOf: demo.asOf,
      openingCashBrl: openingCash,
      receipts,
      horizon,
    });
    $("app-error").textContent = "";
    render();
  } catch (e) {
    $("app-error").textContent = e.message;
  }
}
function render() {
  const r = result;
  $("nav-count").textContent = r.rows.length;
  $("asof-label").textContent =
    "Base: " + date(demo.asOf) + " " + demo.asOf.slice(0, 4);
  const metrics = [
    [
      "Compromissos em aberto",
      money(r.totalCents / 100),
      `${r.rows.length} operações · ${operations.filter((o) => o.status === "paid").length} paga(s)`,
      "↗",
    ],
    [
      "Desvio do orçamento",
      (r.deviationCents > 0 ? "+" : "") + money(r.deviationCents / 100),
      r.deviationCents > 0
        ? "Acima do custo originalmente planejado"
        : "Abaixo ou no custo planejado",
      "Δ",
    ],
    [
      "Principal descoberto",
      money(r.uncoveredBrl),
      `${Math.round((r.uncoveredBrl / (r.uncoveredBrl + r.protectedBrl || 1)) * 100)}% do principal ao câmbio de referência`,
      "◌",
    ],
    [
      "Vencimentos em 14 dias",
      money(r.dueSoon.reduce((s, o) => s + o.scenarioCents, 0) / 100),
      `${r.dueSoon.length} compromisso(s), sem incluir vencidos`,
      "↳",
    ],
  ];
  $("overview-metrics").innerHTML = metrics
    .map(
      ([label, value, note, icon], i) =>
        `<div class="metric"><div class="metric-label">${label}<span>${icon}</span></div><strong class="${i === 1 && r.deviationCents > 0 ? "negative" : ""}">${value}</strong><small>${note}</small></div>`,
    )
    .join("");
  $("cash-minimum").textContent = money(r.minimumCashCents / 100);
  $("cash-signal").textContent = r.firstShortfall
    ? "Déficit em " + date(r.firstShortfall)
    : "Sem déficit no horizonte";
  $("cash-signal").className = "badge " + (r.firstShortfall ? "red" : "green");
  $("cash-note").textContent =
    `Vencidos entram na data-base. ${r.beyondHorizon ? `${r.beyondHorizon} compromisso(s) após o horizonte não entram nesta curva.` : "Inclui todos os vencimentos em aberto no horizonte."} Recebimentos futuros são premissas fictícias editáveis.`;
  renderCashChart();
  renderInvestigation();
  renderDiagnostics();
  $("currency-exposure").innerHTML = r.currencies
    .map((c, i) => {
      const principal = r.rows
          .filter((o) => o.currency === c.currency)
          .reduce((s, o) => s + o.uncoveredBrl + o.protectedBrl, 0),
        protectedPart = r.rows
          .filter((o) => o.currency === c.currency)
          .reduce((s, o) => s + o.protectedBrl, 0),
        covered = principal ? protectedPart / principal : 0;
      return `<div class="currency-row"><div class="currency-row-top"><span class="currency-icon">${["$", "€", "£"][i]}</span><strong>${c.currency}<small>${c.count} operações</small></strong><span class="currency-row-value">${money(c.scenarioCents / 100)}</span></div><div class="exposure-track" aria-label="${Math.round(covered * 100)}% do principal protegido em ${c.currency}"><i style="width:${covered * 100}%"></i><i style="width:${(1 - covered) * 100}%"></i></div></div>`;
    })
    .join("");
  $("one-percent").textContent = "+" + money(r.uncoveredBrl * 0.01);
  const overdue = r.overdue.reduce((s, o) => s + o.scenarioCents, 0);
  $("decision-strip").innerHTML = r.overdue.length
    ? `<span class="decision-number">${r.overdue.length.toString().padStart(2, "0")}</span><div><strong>Compromisso vencido pede revisão do caixa.</strong><p>${money(overdue / 100)} ainda em aberto. A projeção considera sua saída na data-base.</p></div><button id="show-overdue">Revisar pendência →</button>`
    : `<span class="decision-number">✓</span><div><strong>Nenhum compromisso vencido nesta carteira.</strong><p>Compare os próximos vencimentos com os recebimentos planejados.</p></div><button id="show-overdue">Ver operações →</button>`;
  $("show-overdue").addEventListener("click", () => {
    $("filter-status").value = r.overdue.length ? "overdue" : "all";
    location.hash = "operations";
    renderOperations();
  });
  const priority = [...r.rows]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  table($("priority-table"), priority);
  renderOperations();
  renderScenario();
  renderData();
  $("export-all").disabled = false;
}
function table(target, rows) {
  if (!rows.length) {
    target.innerHTML =
      '<div class="empty">Nenhuma operação neste recorte. Ajuste os filtros ou adicione um compromisso.</div>';
    return;
  }
  target.innerHTML = `<table><thead><tr><th>OPERAÇÃO / FORNECEDOR</th><th>VENCIMENTO</th><th class="numeric">VALOR ORIGINAL</th><th class="numeric">CUSTO / BRL</th><th>PROTEÇÃO</th><th>SITUAÇÃO</th><th><span class="sr-only">Detalhes</span></th></tr></thead><tbody>${rows
    .map((row) => {
      const [status, tone] = getStatus(row);
      return `<tr><td><button class="operation-id" data-open="${esc(row.id)}">${esc(row.id)}</button><small>${esc(row.supplier)}</small></td><td><strong>${date(row.dueDate)}</strong><small>${row.dueDate.slice(0, 4)}</small></td><td class="numeric"><strong>${row.currency} ${number(row.amount)}</strong><small>Orçado a ${rateText(row.budgetRate)}</small></td><td class="numeric"><strong>${fullMoney(row.scenarioCents / 100)}</strong><small>${row.deviationCents > 0 ? "+" : ""}${money(row.deviationCents / 100)} vs. orçamento</small></td><td><span class="coverage-inline"><i><b style="width:${row.hedgePercent}%"></b></i>${row.hedgePercent}%</span></td><td><span class="badge ${tone}">${status}</span></td><td><button class="row-open" data-open="${esc(row.id)}" aria-label="Abrir ${esc(row.id)}">↗</button></td></tr>`;
    })
    .join("")}</tbody></table>`;
  target
    .querySelectorAll("[data-open]")
    .forEach((b) =>
      b.addEventListener("click", () => openOperation(b.dataset.open)),
    );
}
function renderInvestigation() {
  const counterfactual = analyzeTrade({
    operations,
    rates,
    shocks: { USD: 0.1, EUR: 0, GBP: 0 },
    asOf: demo.asOf,
    openingCashBrl: openingCash,
    receipts,
    horizon: 90,
  });
  const day = counterfactual.firstShortfall;
  const candidates = counterfactual.rows.filter((row) =>
    day
      ? (row.dueDate < demo.asOf ? demo.asOf : row.dueDate) === day
      : row.shockImpactCents > 0,
  );
  const operation = candidates.sort(
    (a, b) => b.scenarioCents - a.scenarioCents,
  )[0];
  const active =
    shocks.USD === 0.1 &&
    shocks.EUR === 0 &&
    shocks.GBP === 0 &&
    horizon === 90;
  $("investigation-summary").innerHTML =
    `O custo aumenta <strong>${money(counterfactual.shockImpactCents / 100)}</strong>. ` +
    (day
      ? `O primeiro déficit aparece em <strong>${date(day)}</strong>${operation ? `, data do pedido <strong>${esc(operation.id)}</strong>` : ""}.`
      : `O menor saldo fica em <strong>${money(counterfactual.minimumCashCents / 100)}</strong>, sem déficit.`) +
    '<span class="investigation-foot">Hipótese USD +10% · demais moedas constantes · 90 dias</span>';
  $("investigate-usd").disabled = false;
  $("investigate-usd").textContent = active
    ? "Voltar ao cenário-base"
    : "Investigar o cenário →";
  $("investigate-usd").onclick = () => {
    shocks = active ? { USD: 0, EUR: 0, GBP: 0 } : { USD: 0.1, EUR: 0, GBP: 0 };
    horizon = 90;
    syncInputs();
    recalculate();
    announce(
      active
        ? "Cenário-base restaurado."
        : "Choque de 10% no dólar aplicado à carteira e à curva de caixa.",
    );
  };
  let detail = $("investigation-detail");
  if (!detail) {
    detail = document.createElement("button");
    detail.id = "investigation-detail";
    detail.className = "text-button";
    $("investigation").append(detail);
  }
  detail.hidden = !operation;
  detail.textContent = operation ? "Abrir " + operation.id : "";
  detail.onclick = () => {
    if (operation) openOperation(operation.id);
  };
}
function renderOperations() {
  if (!rates) return;
  const search = $("search").value.trim().toLocaleLowerCase("pt-BR"),
    currency = $("filter-currency").value,
    status = $("filter-status").value;
  let rows = operations
    .map((o) => priceOperation(o, rates, shocks))
    .filter(
      (o) =>
        (currency === "all" || o.currency === currency) &&
        (!search ||
          [o.id, o.supplier, o.category ?? ""].some((s) =>
            s.toLocaleLowerCase("pt-BR").includes(search),
          )) &&
        (status === "all" ||
          (status === "overdue" &&
            o.status !== "paid" &&
            o.dueDate < demo.asOf) ||
          (status === "open" && o.status === "open") ||
          (status === "review" && o.status === "review") ||
          (status === "paid" && o.status === "paid")),
    );
  const sort = $("sort").value;
  rows.sort(
    sort === "amount"
      ? (a, b) => b.scenarioCents - a.scenarioCents
      : sort === "deviation"
        ? (a, b) => b.deviationCents - a.deviationCents
        : (a, b) => a.dueDate.localeCompare(b.dueDate),
  );
  table($("operations-table"), rows);
  $("operation-summary").textContent =
    `${rows.length} de ${operations.length} operações · dados demonstrativos ou importados localmente`;
  const open = rows.filter((o) => o.status !== "paid");
  $("filtered-summary").textContent =
    `${open.length} compromisso(s) em aberto neste recorte · ${money(open.reduce((s, o) => s + o.scenarioCents, 0) / 100)} no cenário aplicado. Pagas não entram no caixa.`;
}
function renderCashChart() {
  const r = result,
    points = [
      {
        date: r.asOf,
        baseBalanceCents: r.openingCashCents,
        scenarioBalanceCents: r.openingCashCents,
      },
      ...r.cash,
    ];
  const values = points.flatMap((p) => [
      p.baseBalanceCents,
      p.scenarioBalanceCents,
    ]),
    low = Math.min(0, ...values),
    high = Math.max(...values, 1) * 1.08;
  const left = 55,
    right = 740,
    top = 18,
    bottom = 178,
    span = high - low || 1;
  const elapsed = (d) =>
    (Date.parse(d) - Date.parse(r.asOf)) / (86400000 * horizon);
  const x = (p) => left + elapsed(p.date) * (right - left),
    y = (v) => top + ((high - v) / span) * (bottom - top);
  let svg = "";
  for (let i = 0; i < 4; i++) {
    const v = low + ((high - low) * i) / 3;
    svg += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#edf0e8"/><text x="4" y="${y(v) + 3}" fill="#6b785f" font-size="9">${Math.round(v / 1e5)} mil</text>`;
  }
  const path = (key) =>
    points
      .map((p, i) =>
        i
          ? "H" + x(p).toFixed(1) + " V" + y(p[key]).toFixed(1)
          : "M" + x(p).toFixed(1) + "," + y(p[key]).toFixed(1),
      )
      .join(" ");
  const basePath = path("baseBalanceCents"),
    scenarioPath = path("scenarioBalanceCents");
  svg += `<path d="${basePath} L${right},${bottom} L${left},${bottom} Z" fill="#edf3e8" opacity=".65"/><path d="${basePath}" stroke="#8eac8c" stroke-width="2" fill="none"/><path d="${scenarioPath}" stroke="#bd573b" stroke-width="2" stroke-dasharray="5 3" fill="none"/>`;
  if (low < 0)
    svg += `<line x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}" stroke="#c5a38d" stroke-dasharray="2 3"/>`;
  for (const day of [
    0,
    Math.round(horizon / 3),
    Math.round((horizon * 2) / 3),
    horizon,
  ]) {
    const d = addDays(r.asOf, day);
    svg += `<text x="${left + (day / horizon) * (right - left)}" y="207" text-anchor="${day === 0 ? "start" : day === horizon ? "end" : "middle"}" fill="#6b785f" font-size="9">${date(d)}</text>`;
  }
  $("cash-chart").innerHTML = svg;
  chartIndex = Math.min(chartIndex, points.length - 1);
  $("cash-chart").onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    chartIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? points.length - 1
          : Math.max(
              0,
              Math.min(
                points.length - 1,
                chartIndex + (event.key === "ArrowLeft" ? -1 : 1),
              ),
            );
    cashReadout(points[chartIndex]);
  };
  $("cash-chart").onpointermove = (event) => {
    const box = event.currentTarget.getBoundingClientRect(),
      fraction = Math.max(
        0,
        Math.min(
          1,
          (((event.clientX - box.left) / box.width) * 760 - left) /
            (right - left),
        ),
      );
    const target = fraction * horizon;
    const p = points.reduce(
      (best, p) =>
        Math.abs(elapsed(p.date) * horizon - target) <
        Math.abs(elapsed(best.date) * horizon - target)
          ? p
          : best,
      points[0],
    );
    cashReadout(p);
  };
}
function cashReadout(p) {
  $("cash-readout").textContent =
    `${date(p.date)} · base ${money(p.baseBalanceCents / 100)} · cenário ${money(p.scenarioBalanceCents / 100)}`;
}
function renderScenario() {
  const r = result;
  $("scenario-impact").innerHTML =
    `<div><span>Custo total da carteira</span><strong>${money(r.totalCents / 100)}</strong><p>Base sem choque: ${money(r.baselineCents / 100)}</p></div><div><span>Impacto do choque</span><strong>${r.shockImpactCents > 0 ? "+" : ""}${money(r.shockImpactCents / 100)}</strong><p>${r.firstShortfall ? "Primeiro déficit: " + date(r.firstShortfall) : "Sem déficit no horizonte de " + horizon + " dias"}</p></div>`;
  const buckets = new Map();
  for (const row of r.rows) {
    const month = row.dueDate.slice(0, 7);
    if (!buckets.has(month))
      buckets.set(month, { month, base: 0, scenario: 0 });
    const b = buckets.get(month);
    b.base += row.baselineCents;
    b.scenario += row.scenarioCents;
  }
  const months = [...buckets.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    max = Math.max(...months.flatMap((m) => [m.base, m.scenario]), 1) * 1.2,
    left = 55,
    right = 730,
    bottom = 200,
    top = 20,
    step = (right - left) / Math.max(months.length, 1);
  let svg = "";
  for (let i = 0; i < 4; i++) {
    const v = (max * i) / 3,
      y = bottom - ((bottom - top) * v) / max;
    svg += `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#eef1e8"/><text x="4" y="${y + 3}" fill="#6b785f" font-size="9">${Math.round(v / 1e5)} mil</text>`;
  }
  months.forEach((m, i) => {
    const x = left + (i + 0.5) * step,
      width = Math.min(32, step * 0.2);
    svg += `<rect x="${x - width - 3}" y="${bottom - (m.base / max) * (bottom - top)}" width="${width}" height="${(m.base / max) * (bottom - top)}" rx="2" fill="#a7bda0"><title>Base ${money(m.base / 100)}</title></rect><rect x="${x + 3}" y="${bottom - (m.scenario / max) * (bottom - top)}" width="${width}" height="${(m.scenario / max) * (bottom - top)}" rx="2" fill="#bd6a4d"><title>Cenário ${money(m.scenario / 100)}</title></rect><text x="${x}" y="223" text-anchor="middle" fill="#6b785f" font-size="10">${new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(m.month + "-15T12:00:00Z"))}</text>`;
  });
  svg +=
    '<text x="575" y="12" fill="#819574" font-size="9">■ Base</text><text x="650" y="12" fill="#b16649" font-size="9">■ Cenário</text>';
  $("maturity-chart").innerHTML = svg;
  renderSaved();
}
function renderSaved() {
  const container = $("saved-scenarios");
  container.replaceChildren();
  if (!saved.length) {
    container.innerHTML =
      '<div class="empty">Nenhum cenário salvo. Crie uma hipótese para comparar.</div>';
    return;
  }
  saved.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "saved-row";
    const details = document.createElement("div"),
      title = document.createElement("strong"),
      note = document.createElement("small");
    title.textContent = entry.name;
    note.textContent = `${Object.entries(entry.shocks)
      .map(([c, s]) => c + " " + Math.round(s * 100) + "%")
      .join(
        " · ",
      )} · custo salvo ${money(entry.totalCents / 100)} · base ${entry.asOf}`;
    details.append(title, note);
    const restore = document.createElement("button");
    restore.textContent = "Restaurar";
    restore.onclick = () => {
      shocks = { ...entry.shocks };
      openingCash = entry.openingCash;
      horizon = entry.horizon;
      syncInputs();
      record("Cenário restaurado: " + entry.name);
      persist();
      recalculate();
      $("scenario-status").textContent =
        "Premissas restauradas e recalculadas com a carteira e referências atuais.";
    };
    const remove = document.createElement("button");
    remove.textContent = "Remover";
    remove.onclick = () => {
      const next = saved.filter((_, i) => i !== index);
      try {
        localStorage.setItem(scenarioKey, JSON.stringify(next));
        saved = next;
        renderSaved();
      } catch {
        $("scenario-status").textContent =
          "Não foi possível remover o cenário neste navegador.";
      }
    };
    row.append(details, restore, remove);
    container.append(row);
  });
}
function renderData() {
  $("data-quality").innerHTML =
    CURRENCIES.map((c) => {
      const points = market.currencies[c].points.filter(
          (p) => p.date <= demo.asOf,
        ),
        last = points.at(-1),
        prior = points.at(-2),
        move = last.value / prior.value - 1;
      return `<div class="data-line"><span>${c} / BRL<small>SGS ${Number(market.currencies[c].series)} · ${date(referenceDates[c])} ${referenceDates[c].slice(0, 4)}</small></span><strong>${rateText(rates[c])}<small>${move >= 0 ? "+" : ""}${number(move * 100)}% no último intervalo${Math.abs(move) > 0.05 ? " · movimento atípico" : ""}</small></strong></div>`;
    }).join("") +
    `<div class="source-description">Referências de venda BCB/SGS, não cotações executáveis. Recorte limitado à data-base ${demo.asOf}; não usa preços posteriores. ${market.status === "updated" ? "Consulta à fonte concluída." : market.status === "partial" ? "Consulta parcial; parte da referência usa snapshot salvo." : "Snapshot salvo, sem confirmação de atualização da fonte."}</div><a class="text-link" href="https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes" target="_blank" rel="noopener noreferrer">Consultar fonte oficial ↗</a>`;
  const target = $("receipts-list");
  target.innerHTML = receipts
    .map(
      (r, i) =>
        `<div class="receipt-row"><span>${date(r.date)} ${r.date.slice(0, 4)}</span><strong>${fullMoney(r.amountBrl)}</strong><button data-remove-receipt="${i}" aria-label="Remover recebimento de ${date(r.date)}">×</button></div>`,
    )
    .join("");
  target.querySelectorAll("[data-remove-receipt]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.removeReceipt);
        record("Recebimento projetado removido: " + receipts[i].date);
        receipts.splice(i, 1);
        persist();
        recalculate();
      }),
  );
  $("audit-list").innerHTML = audit.length
    ? audit
        .map(
          (a) =>
            `<div class="audit-row"><time>${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(a.time))}</time><span>${esc(a.message)}</span></div>`,
        )
        .join("")
    : '<div class="empty">As alterações de premissas aparecerão aqui, neste navegador.</div>';
}
function syncInputs() {
  CURRENCIES.forEach((c) => {
    const input = $("shock-" + c);
    input.value = shocks[c] * 100;
    $("shock-value-" + c).textContent =
      (shocks[c] >= 0 ? "+" : "") + number(shocks[c] * 100) + "%";
  });
  $("opening-cash").value = openingCash;
  document.querySelectorAll("[data-horizon]").forEach((b) => {
    const active = Number(b.dataset.horizon) === horizon;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
}
function openOperation(id = null) {
  if (!rates) {
    announce("Aguarde o carregamento das referências.");
    return;
  }
  editing = id;
  const original = operations.find((o) => o.id === id),
    row = original ?? {
      id:
        "IMP-" +
        Math.floor(Date.now() / 1000)
          .toString()
          .slice(-7),
      supplier: "",
      currency: "USD",
      amount: 1000,
      dueDate: addDays(demo.asOf, 14),
      budgetRate: rates.USD,
      localCostBrl: 0,
      hedgePercent: 0,
      hedgeRate: rates.USD,
      status: "open",
    };
  $("drawer-title").textContent = original ? row.id : "Nova operação";
  $("drawer-caption").textContent = original
    ? "CARTEIRA / DETALHE"
    : "CARTEIRA / ADICIONAR";
  $("operation-error").textContent = "";
  const map = {
    id: "id",
    supplier: "supplier",
    currency: "currency",
    amount: "amount",
    due: "dueDate",
    budget: "budgetRate",
    local: "localCostBrl",
    coverage: "hedgePercent",
    hedge: "hedgeRate",
    status: "status",
  };
  Object.entries(map).forEach(
    ([control, key]) => ($("edit-" + control).value = row[key]),
  );
  $("edit-id").readOnly = Boolean(original);
  $("operation-context").innerHTML = original
    ? `<div class="operation-context"><strong>${esc(row.supplier)}</strong><p>${esc(row.category ?? "Operação importada ou criada localmente")} · ${esc(row.country ?? "Origem não informada")}</p></div>`
    : "";
  if (original) {
    const p = priceOperation(row, rates, shocks);
    $("operation-breakdown").innerHTML =
      `<div class="breakdown"><div><span>Referência ${row.currency} / BRL</span><strong>${rateText(rates[row.currency])} · ${date(referenceDates[row.currency])}</strong></div><div><span>Custo orçado</span><strong>${fullMoney(p.budgetCents / 100)}</strong></div><div><span>Sem choque adicional</span><strong>${fullMoney(p.baselineCents / 100)}</strong></div><div><span>Com o cenário aplicado</span><strong>${fullMoney(p.scenarioCents / 100)}</strong></div></div>`;
  } else $("operation-breakdown").replaceChildren();
  $("operation-dialog").showModal();
  $("edit-" + (original ? "coverage" : "supplier")).focus();
}
$("operation-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    const old = operations.find((o) => o.id === editing);
    const row = {
      ...old,
      id: $("edit-id").value.trim(),
      supplier: $("edit-supplier").value.trim(),
      currency: $("edit-currency").value,
      amount: Number($("edit-amount").value),
      dueDate: $("edit-due").value,
      budgetRate: Number($("edit-budget").value),
      localCostBrl: Number($("edit-local").value),
      hedgePercent: Number($("edit-coverage").value),
      hedgeRate: Number($("edit-hedge").value),
      status: $("edit-status").value,
    };
    const next = editing
      ? operations.map((o) => (o.id === editing ? row : o))
      : [...operations, row];
    operations = validateOperations(next);
    record((editing ? "Operação editada: " : "Operação adicionada: ") + row.id);
    persist();
    recalculate();
    $("operation-dialog").close();
    announce("Operação salva e projeção recalculada.");
  } catch (e) {
    $("operation-error").textContent = e.message;
  }
};
$("close-dialog").onclick = $("cancel-dialog").onclick = () =>
  $("operation-dialog").close();
$("new-operation").onclick = () => openOperation();
["search", "filter-currency", "filter-status", "sort"].forEach((id) =>
  $(id).addEventListener(
    id === "search" ? "input" : "change",
    renderOperations,
  ),
);
$("reset-filters").onclick = () => {
  $("search").value = "";
  $("filter-currency").value = $("filter-status").value = "all";
  $("sort").value = "due";
  renderOperations();
};
document.querySelectorAll("[data-horizon]").forEach(
  (b) =>
    (b.onclick = () => {
      horizon = Number(b.dataset.horizon);
      syncInputs();
      recalculate();
    }),
);
$("scenario-sliders").innerHTML = CURRENCIES.map(
  (c) =>
    `<div class="scenario-slider"><label for="shock-${c}">${c} / BRL<output id="shock-value-${c}">0%</output></label><input id="shock-${c}" type="range" min="-20" max="20" step="1" value="0"><small>−20% <span style="float:right">+20%</span></small></div>`,
).join("");
CURRENCIES.forEach(
  (c) =>
    ($("shock-" + c).oninput = () => {
      shocks[c] = Number($("shock-" + c).value) / 100;
      syncInputs();
      recalculate();
    }),
);
$("reset-shocks").onclick = () => {
  shocks = { USD: 0, EUR: 0, GBP: 0 };
  syncInputs();
  recalculate();
};
$("apply-cash").onclick = () => {
  if (!$("opening-cash").reportValidity()) return;
  const value = Number($("opening-cash").value);
  if (!Number.isFinite(value) || value < 0) return;
  openingCash = value;
  record("Caixa inicial alterado para " + money(value));
  persist();
  recalculate();
};
$("save-scenario-form").onsubmit = (event) => {
  event.preventDefault();
  if (!result) return;
  const name = $("scenario-name").value.trim();
  if (!name) return;
  const entry = {
    version: 1,
    name,
    shocks: { ...shocks },
    openingCash,
    horizon,
    asOf: demo.asOf,
    totalCents: result.totalCents,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...saved].slice(0, 8);
  try {
    localStorage.setItem(scenarioKey, JSON.stringify(next));
    saved = next;
    renderSaved();
    $("scenario-status").textContent = "Cenário salvo neste navegador.";
  } catch {
    $("scenario-status").textContent =
      "Armazenamento local indisponível. Exporte a carteira para guardar os valores.";
  }
};
$("export-all").onclick = () => {
  if (!rates) return;
  const rows = operations.map((o) => {
    const p = priceOperation(o, rates, shocks);
    return {
      ...o,
      referenceRate: rates[o.currency],
      referenceDate: referenceDates[o.currency],
      shockPct: shocks[o.currency] * 100,
      budgetBrl: (p.budgetCents / 100).toFixed(2),
      baselineBrl: (p.baselineCents / 100).toFixed(2),
      scenarioBrl: (p.scenarioCents / 100).toFixed(2),
    };
  });
  download(
    serializeCsv(rows, [
      ...COLUMNS,
      "referenceRate",
      "referenceDate",
      "shockPct",
      "budgetBrl",
      "baselineBrl",
      "scenarioBrl",
    ]),
    `risklab-carteira-${demo.asOf}.csv`,
    "text/csv;charset=utf-8",
  );
};
$("download-template").onclick = () =>
  download(
    serializeCsv(demo.operations.slice(0, 2)),
    "risklab-modelo-carteira.csv",
    "text/csv;charset=utf-8",
  );
$("import-csv").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1e6) throw Error("Arquivo maior que 1 MB.");
    const next = parseCsv(await file.text());
    operations = next;
    record(
      `CSV importado: ${next.length} operações validadas. Caixa e recebimentos mantidos.`,
    );
    persist();
    recalculate();
    $("import-status").textContent =
      `${next.length} operações importadas. Caixa inicial e recebimentos foram mantidos: revise as premissas de liquidez.`;
  } catch (e) {
    $("import-status").textContent = "Importação rejeitada: " + e.message;
  } finally {
    event.target.value = "";
  }
};
$("restore-demo").onclick = () => {
  operations = structuredClone(demo.operations);
  receipts = structuredClone(demo.receipts);
  openingCash = demo.openingCashBrl;
  shocks = { USD: 0, EUR: 0, GBP: 0 };
  record("Carteira e liquidez demonstrativas restauradas.");
  syncInputs();
  persist();
  recalculate();
  $("import-status").textContent =
    "Demonstração restaurada; cenários salvos foram mantidos.";
};
$("add-receipt-form").onsubmit = (event) => {
  event.preventDefault();
  const receipt = {
    date: $("receipt-date").value,
    amountBrl: Number($("receipt-value").value),
  };
  try {
    analyzeTrade({
      operations,
      rates,
      asOf: demo.asOf,
      openingCashBrl: openingCash,
      receipts: [...receipts, receipt],
    });
    receipts.push(receipt);
    receipts.sort((a, b) => a.date.localeCompare(b.date));
    record(
      "Recebimento adicionado: " +
        receipt.date +
        " · " +
        money(receipt.amountBrl),
    );
    persist();
    recalculate();
    $("add-receipt-form").reset();
  } catch (e) {
    $("app-error").textContent = e.message;
  }
};
async function refreshRates() {
  if (refreshing || !demo) return;
  refreshing = true;
  $("refresh-rates").disabled = true;
  $("refresh-status").textContent = "Consultando a fonte…";
  try {
    const candidate = await fetchMarket("./api/market");
    setMarket(candidate);
    recalculate();
    $("refresh-status").textContent =
      "Consulta concluída. As referências continuam limitadas à data-base da carteira.";
  } catch {
    $("refresh-status").textContent =
      "Consulta indisponível. Últimas referências válidas preservadas.";
  } finally {
    refreshing = false;
    $("refresh-rates").disabled = false;
  }
}
function setMarket(candidate) {
  const nextRates = {},
    nextDates = {};
  for (const c of CURRENCIES) {
    const point = candidate.currencies[c].points
      .filter((p) => p.date <= demo.asOf)
      .at(-1);
    if (!point) throw Error("Sem referência anterior à data-base para " + c);
    nextRates[c] = point.value;
    nextDates[c] = point.date;
  }
  market = candidate;
  rates = nextRates;
  referenceDates = nextDates;
  const earliest = Object.values(nextDates).sort()[0];
  $("source-pill").innerHTML = `<span></span>Referências de ${date(earliest)}`;
  $("source-pill").dataset.state =
    candidate.status === "updated" ? "updated" : "snapshot";
}
$("refresh-rates").onclick = refreshRates;
async function initialize() {
  try {
    const response = await fetch("./trade-demo.json");
    if (!response.ok) throw Error("Carteira demonstrativa indisponível.");
    demo = await response.json();
    operations = validateOperations(demo.operations);
    receipts = structuredClone(demo.receipts);
    openingCash = demo.openingCashBrl;
    try {
      const workspace = JSON.parse(localStorage.getItem(storeKey) || "null");
      if (workspace?.version === 1) {
        validateOperations(workspace.operations);
        analyzeTrade({
          operations: workspace.operations,
          rates: { USD: 1, EUR: 1, GBP: 1 },
          asOf: demo.asOf,
          openingCashBrl: workspace.openingCash,
          receipts: workspace.receipts,
        });
        operations = workspace.operations;
        receipts = workspace.receipts;
        openingCash = workspace.openingCash;
        audit = Array.isArray(workspace.audit)
          ? workspace.audit
              .filter(
                (a) =>
                  typeof a.message === "string" &&
                  Number.isFinite(Date.parse(a.time)),
              )
              .slice(0, 25)
          : [];
      }
      const entries = JSON.parse(localStorage.getItem(scenarioKey) || "[]");
      if (Array.isArray(entries))
        saved = entries
          .filter(
            (e) =>
              e.version === 1 &&
              typeof e.name === "string" &&
              CURRENCIES.every(
                (c) =>
                  Number.isFinite(e.shocks?.[c]) &&
                  Math.abs(e.shocks[c]) <= 0.2,
              ) &&
              Number.isFinite(e.openingCash) &&
              e.openingCash >= 0 &&
              [30, 60, 90].includes(e.horizon) &&
              Number.isFinite(e.totalCents),
          )
          .slice(0, 8);
    } catch {
      announce(
        "Dados locais inválidos ou indisponíveis. Usando a demonstração.",
      );
    }
    const snapshot = await fetchMarket("./market-snapshot.json");
    snapshot.status = "snapshot";
    setMarket(snapshot);
    syncInputs();
    recalculate();
    refreshRates();
  } catch (e) {
    $("app-error").textContent = "Não foi possível iniciar: " + e.message;
    $("source-pill").textContent = "Dados indisponíveis";
  }
}
initialize();

$("open-import").onclick = () => $("import-csv").click();

function renderDiagnostics() {
  const stress = [-.1, -.05, 0, .05, .1].map(shock => ({shock, analysis: analyzeTrade({operations,rates,shocks:{USD:shock,EUR:shock,GBP:shock},asOf:demo.asOf,openingCashBrl:openingCash,receipts,horizon})}));
  const totalExposure = result.uncoveredBrl;
  const concentration = [...result.rows].sort((a,b)=>b.uncoveredBrl-a.uncoveredBrl).slice(0,5);
  const maximum = Math.max(1,...concentration.map(r=>r.uncoveredBrl));
  $('risk-diagnostics').innerHTML = `<div class="stress-matrix"><h3>Teste de liquidez</h3><p>Mesmo choque nas três moedas · ${horizon} dias</p><div class="stress-cells">${stress.map(({shock,analysis:a})=>`<button data-stress="${shock}" class="stress-cell ${a.minimumCashCents<0?'breach':''}"><small>Câmbio ${shock>0?'+':''}${Math.round(shock*100)}%</small><strong>${money(a.minimumCashCents/100)}</strong><span>${a.firstShortfall?'Déficit '+date(a.firstShortfall):'Sem déficit'}</span></button>`).join('')}</div><p>Menor saldo após recebimentos e pagamentos. Clique para aplicar; sem probabilidades ou previsão de mercado.</p></div><div class="risk-ranking"><h3>Maiores exposições descobertas</h3><p>Principal ao câmbio de referência · clique para abrir</p>${concentration.map((r,i)=>`<button data-risk-operation="${esc(r.id)}"><span class="rank">0${i+1}</span><span class="risk-name"><b>${esc(r.supplier)}</b><small>${esc(r.id)} · ${r.currency} · ${date(r.dueDate)}</small><i style="width:${100*r.uncoveredBrl/maximum}%"></i></span><span><b>${money(r.uncoveredBrl)}</b><small>${totalExposure?Math.round(100*r.uncoveredBrl/totalExposure):0}% do descoberto</small></span></button>`).join('')}</div>`;
  document.querySelectorAll('[data-stress]').forEach(button=>button.onclick=()=>{ const shock=Number(button.dataset.stress); shocks={USD:shock,EUR:shock,GBP:shock};syncInputs();recalculate();announce('Choque de '+Math.round(shock*100)+'% aplicado às três moedas.'); });
  document.querySelectorAll('[data-risk-operation]').forEach(button=>button.onclick=()=>openOperation(button.dataset.riskOperation));
}
