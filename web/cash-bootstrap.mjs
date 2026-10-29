/** Paired historical bootstrap: preserve contemporaneous cross-currency dependence. */
export function simulateCash({input, rows, paths=1000, seed=2026, coverage=0, premiumBps=0}) {
 if(!Array.isArray(rows)||rows.length<60||rows.some(r=>r.values.length!==3||r.values.some(v=>!Number.isFinite(v)||v<=-1)))throw Error('São necessários 60 retornos conjuntos válidos.');
 if(!Number.isInteger(paths)||paths<100||paths>5000||![0,50,100].includes(coverage)||premiumBps<0||premiumBps>1000)throw Error('Configuração inválida.');
 const symbols=['USD','EUR','GBP'], horizon=input.horizon;
 const ops=input.operations.filter(o=>o.status!=='paid');
 const dates=Array.from({length:horizon+1},(_,i)=>new Date(Date.parse(input.asOf+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
 const payments=dates.map(d=>ops.filter(o=>(o.dueDate<input.asOf?input.asOf:o.dueDate)===d));
 const inflows=dates.map(d=>input.receipts.filter(r=>r.date===d).reduce((s,r)=>s+r.amountBrl,0));
 const premium=ops.filter(o=>o.dueDate<=dates.at(-1)).reduce((s,o)=>s+o.amount*input.rates[o.currency]*coverage/100*premiumBps/10000,0);
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const samples=dates.map(()=>[]),funding=[], traces=[];let deficits=0;
 for(let p=0;p<paths;p++){
  const rates={...input.rates};let cash=input.openingCashBrl-premium,minimum=cash;const trace=[];
  for(let d=0;d<dates.length;d++){
   // Market moves only on weekdays; one observed vector is sampled per market day.
   const weekday=new Date(dates[d]+'T12:00:00Z').getUTCDay();
   if(d>0&&weekday!==0&&weekday!==6){const vector=rows[Math.floor(random()*rows.length)].values;symbols.forEach((s,i)=>rates[s]*=1+vector[i]);}
   cash+=inflows[d];
   for(const o of payments[d])cash-=o.amount*(coverage/100*input.rates[o.currency]+(1-coverage/100)*rates[o.currency])+(o.localCostBrl||0);
   minimum=Math.min(minimum,cash);samples[d].push(cash);trace.push(cash);
  }
  deficits+=minimum<0?1:0;funding.push(Math.max(0,-minimum));if(p<24)traces.push(trace);
 }
 const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p;return s[Math.floor(i)]+(s[Math.ceil(i)]-s[Math.floor(i)])*(i%1);};
 return {paths,seed,coverage,premiumBps,premium,deficitProbability:deficits/paths,funding95:q(funding,.95),band:dates.map((date,i)=>({date,p05:q(samples[i],.05),median:q(samples[i],.5),p95:q(samples[i],.95)})),traces,observations:rows.length};
}
