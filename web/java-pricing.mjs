/** Sends only the selected demo payment to the same-origin Java proxy. */
export async function verifyJavaPrice(row, shock, fetcher = fetch) {
  const body = new URLSearchParams({currency:row.currency,amount:String(row.amount),referenceRate:String(row.rate),fixedFraction:String(row.hedgePercent/100),fixedRate:String(row.hedgeRate),localCost:String(row.localCostBrl),shock:String(shock)});
  const response = await fetcher('/api/java/price',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw Error(response.status===503?'API Java ainda não configurada.':'API Java indisponível. Tente novamente.');
  const data = await response.json();
  if(data.engine!=='java-bigdecimal'||!['baseline','stressed','impact'].every(key=>Number.isFinite(data[key]))) throw Error('Resposta Java inválida.');
  const cents=value=>Math.round((value+Number.EPSILON)*100);
  if(cents(data.baseline)!==row.baselineCents||cents(data.stressed)!==row.scenarioCents||cents(data.impact)!==row.shockImpactCents) throw Error('Divergência entre os motores. Confira os dados antes de usar o resultado.');
  return data;
}
