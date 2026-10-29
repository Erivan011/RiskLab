import {shapleyPurchases,supplierPerformance,agePayables,filterPurchases} from '../../web/purchase-engine.mjs';
export const cutoff=(month,asOf)=>month===10?asOf:`2026-${String(month).padStart(2,'0')}-${new Date(Date.UTC(2026,month,0)).getUTCDate()}`;
export function selectRows(data,month,filter={}){return filterPurchases(data.rows,{...filter,until:cutoff(month,data.asOf)});}
export function slice(data,month,filter={}){
 const asOf=cutoff(month,data.asOf),rows=selectRows(data,month,filter),s=shapleyPurchases(rows),suppliers=supplierPerformance(rows,asOf);
 const delivered=suppliers.reduce((a,s)=>a+s.delivered,0),onTime=suppliers.reduce((a,s)=>a+s.onTime,0);
 return {monthIdx:month,label:new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(asOf+'T12:00Z')),cumOrders:rows.length,deliveredCount:delivered,onTimeCount:onTime,cumBudget:s.budget,cumBilled:s.actual,cumVariance:s.delta,fxEffect:s.effects.fx,volEffect:s.effects.volume,priceEffect:s.effects.price,mixEffect:s.effects.mix+s.rounding,onTimePct:delivered?100*onTime/delivered:0,overdueBrl:agePayables(rows,asOf).slice(1).reduce((a,b)=>a+b.value,0),ptaxUsd:0,residual:s.residual};
}
export function suppliers(data,month,filter={}){
 const rows=selectRows(data,month,filter),asOf=cutoff(month,data.asOf);
 return supplierPerformance(rows,asOf).map((s,i)=>{const r=rows.filter(r=>r.supplier===s.supplier),d=shapleyPurchases(r);return {id:s.supplier,name:s.supplier,country:r[0]?.country??'Não informado',currency:[...new Set(r.map(x=>x.currency))].join('/'),category:[...new Set(r.map(x=>x.category))].join('/'),delivered:s.delivered,totalOrders:s.orders,onTimePct:100*(s.onTimeRate??0),wilsonLower:100*(s.interval[0]??0),wilsonUpper:100*(s.interval[1]??0),avgDelayDays:s.meanDelay??0,overduePending:s.overdue,exposedBrl:s.overdueValue,billedBrl:s.spend,budgetBrl:d.budget,fxDriftBrl:d.effects.fx,sparkline:Array.from({length:Math.min(6,month)},(_,j)=>{const m=month-Math.min(6,month)+j+1;const p=supplierPerformance(selectRows(data,m,{...filter,supplier:s.supplier}),cutoff(m,data.asOf))[0];return 100*(p?.onTimeRate??0);})};});
}
export function orders(data,month,filter={}){
 const asOf=cutoff(month,data.asOf);
 return selectRows(data,month,filter).map(r=>{const s=shapleyPurchases([r]),delivered=r.deliveryDate&&r.deliveryDate<=asOf;return {poId:r.id,supplier:r.supplier,country:r.country,category:r.category,currency:r.currency,orderDate:r.orderDate,ptaxOrderDate:r.budgetFx,ptaxInvoiceDate:r.actualFx,budgetBrl:r.budgetBrl,billedBrl:r.actualBrl,shapleyFxBrl:s.effects.fx,shapleyVolBrl:s.effects.volume,shapleyPriceBrl:s.effects.price,delayDays:Math.max(0,Math.round((Date.parse(delivered?r.deliveryDate:asOf)-Date.parse(r.promisedDate))/86400000)),status:delivered?(r.deliveryDate<=r.promisedDate?'DELIVERED_ON_TIME':'DELIVERED_LATE'):(r.promisedDate<asOf?'OVERDUE_PENDING':'PENDING'),sha256:data.run.sha256};});
}
export function costBridge({budget,fx,volume,price,mix}){
 let current=budget;
 const result=[{etapa:'Orçamento',BaseInvisivel:0,Delta:budget,signed:budget,Tipo:'TOTAL'}];
 for(const [etapa,change,Tipo] of [['Câmbio',fx,'SAND'],['Volume',volume,'SLATE'],['Preço',price,'SAND'],['Composição',mix,'MUTED']]){
  const next=current+change;result.push({etapa,BaseInvisivel:Math.min(current,next),Delta:Math.abs(change),signed:change,Tipo});current=next;
 }
 result.push({etapa:'Realizado',BaseInvisivel:0,Delta:current,signed:current,Tipo:'TOTAL'});return result;
}
