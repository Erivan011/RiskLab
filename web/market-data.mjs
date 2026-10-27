import { CURRENCIES } from './market-engine.mjs';

// Validate the complete response before replacing the displayed dataset.
export function validateMarket(data) {
  for (const currency of CURRENCIES) {
    const points = data?.currencies?.[currency]?.points;
    if (!Array.isArray(points) || points.length < 30)
      throw new Error(`Histórico insuficiente para ${currency}.`);
    let previous = '';
    for (const point of points) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) ||
          !Number.isFinite(Date.parse(point.date + 'T00:00:00Z')) ||
          new Date(point.date + 'T00:00:00Z').toISOString().slice(0, 10) !== point.date ||
          point.date <= previous || !Number.isFinite(point.value) || point.value <= 0)
        throw new Error(`Referências inválidas para ${currency}.`);
      previous = point.date;
    }
  }
  const dateSets = CURRENCIES.map(c => new Set(data.currencies[c].points.map(p => p.date)));
  if ([...dateSets[0]].filter(d => dateSets.every(s => s.has(d))).length < 30)
    throw new Error('Menos de 30 datas comuns entre as moedas.');
  return data;
}

export async function fetchMarket(url, { fetcher = fetch, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Consulta indisponível.');
    return validateMarket(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
