import test from "node:test";
import assert from "node:assert/strict";
import worker, { validateSeries, marketResponse } from "../worker/index.js";
const sample = [
  { data: "23/10/2026", valor: "5.1" },
  { data: "26/10/2026", valor: "5.2" },
];
test("Market API validates calendar dates, positivity and duplicates", () => {
  assert.equal(validateSeries(sample).at(-1).date, "2026-10-26");
  assert.throws(() =>
    validateSeries([{ data: "32/10/2026", valor: "5" }, sample[0]]),
  );
  assert.throws(() => validateSeries([sample[0], sample[0]]));
  assert.throws(() =>
    validateSeries([sample[0], { ...sample[1], valor: "-1" }]),
  );
});
test("Official-source refresh uses only fixed SGS endpoints and date filters", async () => {
  const urls = [];
  const r = await marketResponse(async (url) => {
    urls.push(String(url));
    return Response.json(sample);
  }, new Date("2026-10-27T12:00:00Z"));
  assert.equal(r.status, "updated");
  assert.equal(urls.length, 3);
  for (const url of urls) {
    assert.ok(url.startsWith("https://api.bcb.gov.br/dados/serie/bcdata.sgs."));
    assert.ok(url.includes("dataInicial="));
  }
  assert.equal(r.currencies.USD.points.at(-1).date, "2026-10-26");
});
test("One failed provider response preserves explicit per-currency snapshot status", async () => {
  const r = await marketResponse(async (url) =>
    String(url).includes(".21619/")
      ? new Response("Unavailable", { status: 502 })
      : Response.json(sample),
  );
  assert.equal(r.status, "partial");
  assert.equal(r.currencies.EUR.status, "snapshot");
  assert.equal(r.currencies.USD.status, "updated");
});
test("Complete source outage keeps dated real snapshot and never labels it live", async () => {
  const r = await marketResponse(async () => {
    throw Error("offline");
  });
  assert.equal(r.status, "snapshot");
  assert.ok(r.currencies.USD.points.length > 30);
  const page = await worker.fetch(new Request("https://risklab.test/"));
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const missing = await worker.fetch(
    new Request("https://risklab.test/not-found"),
  );
  assert.equal(missing.status, 404);
  const post = await worker.fetch(
    new Request("https://risklab.test/api/market", { method: "POST" }),
  );
  assert.equal(post.status, 405);
});
test("Production route works when default cache access is forbidden and coalesces refreshes", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  let upstreamCalls = 0;
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    get() {
      throw Error("Default cache is forbidden");
    },
  });
  t.mock.method(globalThis, "fetch", async () => {
    upstreamCalls++;
    return Response.json(sample);
  });
  try {
    const [first, second] = await Promise.all([
      worker.fetch(new Request("https://risklab.test/api/market")),
      worker.fetch(new Request("https://risklab.test/api/market")),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal((await first.json()).status, "updated");
    assert.equal(upstreamCalls, 3);
    const third = await worker.fetch(
      new Request("https://risklab.test/api/market"),
    );
    assert.equal(third.status, 200);
    assert.equal(upstreamCalls, 3);
  } finally {
    if (original) Object.defineProperty(globalThis, "caches", original);
    else delete globalThis.caches;
  }
});
