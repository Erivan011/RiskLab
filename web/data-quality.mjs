const symbols=['USD','EUR','GBP'];
const iso=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
export function auditMarket(raw,{start='2026-01-01',end='9999-12-31'}={}){
 const audits=[],clean={};
 for(const symbol of symbols){
  const points=raw?.currencies?.[symbol]?.points;if(!Array.isArray(points))throw Error('Série ausente: '+symbol);
  const seen=new Set(),valid=[];let invalid=0,duplicates=0;
  for(const p of points){if(!iso(p.date)||typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<=0){invalid++;continue;}if(seen.has(p.date)){duplicates++;continue;}seen.add(p.date);valid.push(p);}
  valid.sort((a,b)=>a.date.localeCompare(b.date));clean[symbol]=valid.filter(p=>p.date>=start&&p.date<=end);
  audits.push({symbol,received:points.length,invalid,duplicates,retained:clean[symbol].length,lastDate:valid.at(-1)?.date||null});
 }
 const union=[...new Set(symbols.flatMap(s=>clean[s].map(p=>p.date)))].sort();
 const common=union.filter(d=>symbols.every(s=>clean[s].some(p=>p.date===d)));
 for(const a of audits)a.missingOnUnion=union.length-clean[a.symbol].length;
 const maps=symbols.map(s=>new Map(clean[s].map(p=>[p.date,p.value])));
 const rows=common.slice(1).map((date,i)=>({date,values:maps.map(m=>m.get(date)/m.get(common[i])-1)}));
 return {audits,clean,rows,commonDates:common.length,unionDates:union.length,excludedForAlignment:union.length-common.length,start,end,checkedAt:raw.checkedAt,status:raw.status};
}
export function exploreSeries(rows,index){
 if(!rows.length)throw Error('O recorte não contém retornos suficientes.');
 const values=rows.map(r=>r.values[index]),mean=values.reduce((a,b)=>a+b,0)/values.length;
 const variance=values.length>1?values.reduce((s,v)=>s+(v-mean)**2,0)/(values.length-1):0;
 const min=Math.min(...values),max=Math.max(...values),width=(max-min||.001)/16;
 const bins=Array.from({length:16},(_,i)=>({low:min+i*width,high:min+(i+1)*width,count:0}));
 values.forEach(v=>bins[Math.min(15,Math.floor((v-min)/width))].count++);
 const correlations=[0,1,2].map(j=>{const ys=rows.map(r=>r.values[j]),my=ys.reduce((a,b)=>a+b,0)/ys.length;const numerator=values.reduce((s,v,i)=>s+(v-mean)*(ys[i]-my),0);const den=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)*ys.reduce((s,v)=>s+(v-my)**2,0));return den?numerator/den:null;});
 return {count:values.length,mean,annualVol:Math.sqrt(variance*252),min,max,bins,correlations,worst:[...rows].sort((a,b)=>a.values[index]-b.values[index]).slice(0,5)};
}
