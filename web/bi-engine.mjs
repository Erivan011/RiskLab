export function filterOperations(operations,filters={}){
 return operations.filter(o=>(!filters.currency||o.currency===filters.currency)&&(!filters.category||o.category===filters.category)&&(!filters.status||o.status===filters.status)&&(!filters.from||o.dueDate>=filters.from)&&(!filters.until||o.dueDate<=filters.until)&&(!filters.supplier||o.supplier===filters.supplier));
}
export function summarizeOperations(operations,rates,{shock=0,coverage=null}={}){
 const rows=operations.map(o=>{
  const rate=rates[o.currency];if(!Number.isFinite(rate)||rate<=0)throw Error('Cotação ausente para '+o.currency);
  const fraction=(coverage===null?o.hedgePercent:coverage)/100;
  const fixed=coverage===null?o.hedgeRate:rate;
  const budget=o.amount*o.budgetRate+(o.localCostBrl||0);
  const reference=o.amount*(fraction*fixed+(1-fraction)*rate)+(o.localCostBrl||0);
  const stressed=o.amount*(fraction*fixed+(1-fraction)*rate*(1+shock))+(o.localCostBrl||0);
  return {...o,budget,reference,stressed,delta:reference-budget,unprotected:o.amount*rate*(1-fraction)};
 });
 const sum=k=>rows.reduce((n,r)=>n+r[k],0);
 const groups=key=>Object.entries(Object.groupBy(rows,r=>r[key])).map(([name,items])=>({name,value:items.reduce((n,r)=>n+r.reference,0),budget:items.reduce((n,r)=>n+r.budget,0),count:items.length})).sort((a,b)=>b.value-a.value);
 const total=sum('reference'),budget=sum('budget');
 return {rows,total,budget,delta:total-budget,unprotected:sum('unprotected'),stressed:sum('stressed'),currencies:groups('currency'),categories:groups('category'),suppliers:groups('supplier'),months:groups('dueDate').sort((a,b)=>a.name.localeCompare(b.name)),topShare:total?groups('supplier')[0].value/total:0};
}
