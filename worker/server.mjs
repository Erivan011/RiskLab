// Build prepends the versioned public assets. No user credentials or arbitrary upstream URLs.
export function validateSeries(raw) {
  if (!Array.isArray(raw) || raw.length < 2)
    throw Error("Resposta BCB inválida.");
  const rows = raw
    .map((r) => {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(r.data))
        throw Error("Data BCB inválida.");
      const [d, m, y] = r.data.split("/");
      const date = `${y}-${m}-${d}`;
      if (
        new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
          .toISOString()
          .slice(0, 10) !== date
      )
        throw Error("Data BCB inexistente.");
      const value = Number(r.valor);
      if (!Number.isFinite(value) || value <= 0)
        throw Error("Cotação BCB inválida.");
      return { date, value };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(rows.map((r) => r.date)).size !== rows.length)
    throw Error("Datas duplicadas.");
  return rows;
}
export async function marketResponse(fetcher = fetch, now = new Date()) {
  const fallback = JSON.parse(ASSETS["/market-snapshot.json"].body);
  const iso = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now),
    [y, m, d] = iso.split("-");
  const end = `${d}/${m}/${y}`;
  for (const currency of Object.values(fallback.currencies)) currency.points = currency.points.filter(point => point.date <= iso);
  const series = [
    ["USD", 1],
    ["EUR", 21619],
    ["GBP", 21623],
  ];
  const output = await Promise.all(
    series.map(async ([symbol, id]) => {
      try {
        const cached = fallback.currencies[symbol].points;
        const last = cached.at(-1).date;
        const startYear = Math.max(Number(last.slice(0, 4)), Number(y) - 2);
        const from = `01/01/${startYear}`;
        const url =
          `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados?` +
          new URLSearchParams({
            formato: "json",
            dataInicial: from,
            dataFinal: end,
          });
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(20000),
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw Error("Fonte indisponível.");
        const received = validateSeries(await response.json()).filter(point => point.date <= iso);
        if (!received.length) throw Error("Sem observações válidas.");
        const merged = new Map(cached.map((p) => [p.date, p]));
        for (const point of received) merged.set(point.date, point);
        const points = [...merged.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-800);
        return [
          symbol,
          { points, source: "BCB / SGS", series: id, status: "updated" },
        ];
      } catch {
        return [symbol, { ...fallback.currencies[symbol], status: "snapshot" }];
      }
    }),
  );
  const currencies = Object.fromEntries(output),
    fresh = output.filter(([, v]) => v.status === "updated").length;
  return {
    provider: "Banco Central do Brasil / SGS",
    frequency: "daily_reference",
    checkedAt: now.toISOString(),
    status: fresh === 3 ? "updated" : fresh ? "partial" : "snapshot",
    currencies,
  };
}
// Isolate-local, best-effort cache of public rates. The hosting runtime does not
// grant access to Cloudflare's default Cache API; do not touch that capability.
let memoryMarket = null;
let memoryExpiresAt = 0;
let pendingMarket = null;
async function currentMarket() {
  if (memoryMarket && Date.now() < memoryExpiresAt) return memoryMarket;
  if (!pendingMarket) {
    pendingMarket = marketResponse()
      .then((data) => {
        memoryMarket = data;
        memoryExpiresAt = Date.now() + 15 * 60 * 1000;
        return data;
      })
      .finally(() => {
        pendingMarket = null;
      });
  }
  return pendingMarket;
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/java/price") {
      if (request.method !== "POST") return new Response("POST required", {status:405});
      const origin = env?.JAVA_RISK_ORIGIN;
      if (!origin || !/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)) return Response.json({error:"Java API not configured"},{status:503});
      if (Number(request.headers.get("content-length") || 0) > 4096) return new Response("Too large",{status:413});
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > 4096) return new Response("Too large",{status:413});
      try {
        const upstream = await fetch(origin + "/api/price", {method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:bytes,signal:AbortSignal.timeout(18000),redirect:"error"});
        if (!upstream.ok) return Response.json({error:"Java API rejected input"},{status:upstream.status===400?400:502});
        const data=await upstream.json();
        if(data.engine!=="java-bigdecimal"||![data.baseline,data.stressed,data.impact].every(Number.isFinite)) throw Error("Invalid upstream");
        return Response.json(data,{headers:{"cache-control":"no-store"}});
      } catch {return Response.json({error:"Java API unavailable"},{status:502});}
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Método não permitido", { status: 405 });
    if (url.pathname === "/api/market") {
      const data = await currentMarket();
      const response = Response.json(data, {
        headers: {
          "cache-control": "public, max-age=900",
          "x-content-type-options": "nosniff",
        },
      });
      return response;
    }
    const path = ["/", "/index.html"].includes(url.pathname) ? "/analytics.html" : url.pathname;
    const asset = ASSETS[path];
    if (!asset) return new Response("Não encontrado", { status: 404 });
    const body = asset.encoding === "base64"
      ? Uint8Array.from(atob(asset.body), character => character.charCodeAt(0))
      : asset.body;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": asset.type,
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  },
};
