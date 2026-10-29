const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
export function filterPurchases(rows,filter){
 return rows.filter(r=>['currency','category','supplier'].every(k=>!filter[k]||r[k]===filter[k])&&(!filter.from||r.orderDate>=filter.from)&&(!filter.until||r.orderDate<=filter.until));
}
function vectors(rows,actual){
 const qty=actual?'actualQty':'budgetQty',price=actual?'actualPrice':'budgetPrice',fx=actual?'actualFx':'budgetFx';
 const total=sum(rows,qty);const grouped=Object.groupBy(rows,r=>r.sku);
 return {quantity:total,items:Object.fromEntries(Object.entries(grouped).map(([sku,group])=>{
  const q=sum(group,qty),foreign=group.reduce((n,r)=>n+r[qty]*r[price],0),brl=group.reduce((n,r)=>n+r[qty]*r[price]*r[fx],0);
  return [sku,{share:total?q/total:0,price:q?foreign/q:0,fx:foreign?brl/foreign:0}];
 }))};
}
/** Exact Shapley attribution of Q × Σ(mix × price × FX) across all 24 permutations. */
export function shapleyPurchases(rows){
 const base=vectors(rows,false),actual=vectors(rows,true),keys=['volume','mix','price','fx'];
 const value=mask=>(mask&1?actual.quantity:base.quantity)*Object.keys(base.items).reduce((n,sku)=>{
  const b=base.items[sku],a=actual.items[sku];return n+(mask&2?a.share:b.share)*(mask&4?a.price:b.price)*(mask&8?a.fx:b.fx);
 },0);
 const effects=Object.fromEntries(keys.map(k=>[k,0]));
 function walk(order,left){if(!left.length){let mask=0;for(const index of order){const next=mask|(1<<index);effects[keys[index]]+=(value(next)-value(mask))/24;mask=next;}return;}for(const i of left)walk([...order,i],left.filter(j=>j!==i));}
 walk([],[0,1,2,3]);
 const budget=sum(rows,'budgetBrl'),actualCost=sum(rows,'actualBrl'),unroundedBase=value(0),unroundedActual=value(15);
 const rounding=(actualCost-budget)-(unroundedActual-unroundedBase);
 return {effects,rounding,budget,actual:actualCost,delta:actualCost-budget,residual:(actualCost-budget)-Object.values(effects).reduce((a,b)=>a+b,0)-rounding};
}
const days=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
// Wilson interval for a delivered-order proportion, not an inferential guarantee for a synthetic population.
export function wilson(success,total){if(!total)return [null,null];const z=1.96,p=success/total,den=1+z*z/total,center=(p+z*z/(2*total))/den,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/den;return [Math.max(0,center-half),Math.min(1,center+half)];}
export function supplierPerformance(rows,asOf){
 return Object.entries(Object.groupBy(rows,r=>r.supplier)).map(([supplier,items])=>{
  const delivered=items.filter(r=>r.deliveryDate&&r.deliveryDate<=asOf),ontime=delivered.filter(r=>r.deliveryDate<=r.promisedDate),pending=items.filter(r=>!r.deliveryDate||r.deliveryDate>asOf),overdue=pending.filter(r=>r.promisedDate<asOf);
  const lateness=delivered.map(r=>Math.max(0,days(r.deliveryDate,r.promisedDate)));
  return {supplier,orders:items.length,delivered:delivered.length,onTime:ontime.length,onTimeRate:delivered.length?ontime.length/delivered.length:null,interval:wilson(ontime.length,delivered.length),
   overdue:overdue.length,overdueValue:sum(overdue,'actualBrl'),pending:pending.length,meanDelay:delivered.length?lateness.reduce((a,b)=>a+b,0)/delivered.length:null,
   spend:sum(items,'actualBrl'),smallSample:delivered.length<30};
 }).sort((a,b)=>b.overdueValue-a.overdueValue||b.spend-a.spend);
}
export function monthlyPurchases(rows){return Object.entries(Object.groupBy(rows,r=>r.orderDate.slice(0,7))).sort(([a],[b])=>a.localeCompare(b)).map(([month,items])=>({month,orders:items.length,budget:sum(items,'budgetBrl'),actual:sum(items,'actualBrl')}));}
export function agePayables(rows,asOf){
 const bins=[{label:'A vencer',value:0,count:0},{label:'1–15 dias',value:0,count:0},{label:'16–30 dias',value:0,count:0},{label:'31+ dias',value:0,count:0}];
 for(const r of rows.filter(r=>!r.paidDate||r.paidDate>asOf)){const d=days(asOf,r.dueDate),index=d<=0?0:d<=15?1:d<=30?2:3;bins[index].value+=r.actualBrl;bins[index].count++;}
 return bins;
}
