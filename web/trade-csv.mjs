import { validateOperations } from "./trade-engine.mjs";
export const COLUMNS = [
  "id",
  "supplier",
  "currency",
  "amount",
  "dueDate",
  "budgetRate",
  "localCostBrl",
  "hedgePercent",
  "hedgeRate",
  "status",
];
export function parseCsv(text) {
  if (typeof text !== "string" || text.length > 1e6)
    throw Error("CSV vazio ou maior que 1 MB.");
  const records = [];
  let row = [],
    field = "",
    quoted = false,
    closedQuote = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (closedQuote && ![",", "\n", "\r"].includes(c))
      throw Error("Texto inesperado após fechamento de aspas.");
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === "") {
        closedQuote = quoted;
        quoted = !quoted;
      } else throw Error("Aspas em posição inválida.");
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
      closedQuote = false;
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) records.push(row);
      row = [];
      field = "";
      closedQuote = false;
    } else field += c;
  }
  if (quoted) throw Error("Campo CSV sem fechamento de aspas.");
  row.push(field);
  if (row.some((v) => v.trim())) records.push(row);
  if (records.length < 2) throw Error("CSV precisa de cabeçalho e operações.");
  const headers = records.shift().map((s) => s.trim());
  if (
    new Set(headers).size !== headers.length ||
    COLUMNS.some((c) => !headers.includes(c))
  )
    throw Error("Cabeçalho inválido. Use o modelo CSV.");
  const numeric = [
    "amount",
    "budgetRate",
    "localCostBrl",
    "hedgePercent",
    "hedgeRate",
  ];
  return validateOperations(
    records.map((cells, i) => {
      if (cells.length !== headers.length)
        throw Error(
          `Linha ${i + 2}: número de colunas diferente do cabeçalho.`,
        );
      const r = Object.fromEntries(headers.map((h, j) => [h, cells[j].trim()]));
      for (const name of numeric) {
        if (!r[name]) throw Error(`Linha ${i + 2}: ${name} vazio.`);
        r[name] = Number(r[name]);
      }
      return r;
    }),
  );
}
export function serializeCsv(rows, columns = COLUMNS) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (
      /^\s*[=+@]/.test(s) ||
      /^[\t\r\n]/.test(s) ||
      (/^\s*-/.test(s) && !Number.isFinite(Number(s)))
    )
      s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  return (
    "\uFEFF" +
    [
      columns.join(","),
      ...rows.map((r) => columns.map((c) => cell(r[c])).join(",")),
    ].join("\r\n")
  );
}
