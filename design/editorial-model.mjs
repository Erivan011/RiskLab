import { analyzeTrade, addDays } from '../web/trade-engine.mjs';
export const formatBrl=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
const fmtDate=value=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')).replace('.','');
const xml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function editorialState(input,shock){
 if(!Number.isFinite(shock)||shock<0||shock>.2)throw Error('Choque USD deve estar entre 0 e 20%.');
 const run=(operations,usd)=>analyzeTrade({...input,operations,shocks:{USD:usd,EUR:0,GBP:0}});
 const base=run(input.operations,0),analysis=run(input.operations,shock);
 const severe=run(input.operations,.2);
 const hedges=[0,50,100].map(coverage=>{
  const ops=input.operations.map(row=>row.currency==='USD'?{...row,hedgePercent:coverage,hedgeRate:input.rates.USD}:row);
  const a=run(ops,shock);
  return {coverage,analysis:a,fundingCents:Math.max(0,-a.minimumCashCents),costPoints:[0,.1,.2].map(s=>run(ops,s).totalCents)};
 });
 return {shock,base,analysis,severe,hedges,fundingCents:Math.max(0,-analysis.minimumCashCents),baseFundingCents:Math.max(0,-base.minimumCashCents)};
}
export function answerMarkup(s){
 return `${s.analysis.firstShortfall?'O saldo fica negativo em <b>'+fmtDate(s.analysis.firstShortfall)+'</b>.':'Não há saldo negativo no horizonte.'} ${s.baseFundingCents?'A base já precisa de '+formatBrl(s.baseFundingCents/100)+'.':'A base não exige aporte.'}`;
}
export function chartDescription(s){return `Projeção de caixa em 90 dias. Dólar mais ${Math.round(s.shock*100)}%. Aporte mínimo ${formatBrl(s.fundingCents/100)}. ${s.analysis.firstShortfall?'Primeiro déficit '+s.analysis.firstShortfall: 'Sem déficit'}.`;}
export function profileSvg(s,input){
 const left=53,right=700,top=29,bottom=281;
 const lo=Math.min(0,s.severe.minimumCashCents),hi=Math.max(s.base.openingCashCents,...s.base.cash.map(d=>d.scenarioBalanceCents));
 const padding=(hi-lo)*.11;
 const y=v=>bottom-(v-lo+padding)/(hi-lo+2*padding)*(bottom-top);
 const x=date=>left+(Date.parse(date)-Date.parse(input.asOf))/(86400000*input.horizon)*(right-left);
 const path=a=>[{date:input.asOf,scenarioBalanceCents:a.openingCashCents},...a.cash].map((d,i)=>i?`H${x(d.date).toFixed(1)}V${y(d.scenarioBalanceCents).toFixed(1)}`:`M${left},${y(d.scenarioBalanceCents).toFixed(1)}`).join(' ');
 let svg=`<rect x="${left}" y="${y(0)}" width="${right-left}" height="${bottom-y(0)}" fill="var(--risk)" opacity=".045"/>`;
 for(let n=0;n<4;n++){const v=lo+(hi-lo)*n/3;svg+=`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="39" y="${y(v)+4}" text-anchor="end" font-family="monospace" font-size="10" fill="var(--muted)">${Math.round(v/1e5)}</text>`;}
 svg+=`<line x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}" stroke="var(--zero)" stroke-dasharray="2 4"/><text x="${right+9}" y="${y(0)+4}" fill="var(--muted)" font-family="monospace" font-size="9">zero</text><path d="${path(s.base)}" stroke="var(--plot-base)" stroke-width="1.6" fill="none"/><path d="${path(s.analysis)}" stroke="var(--risk)" stroke-width="2.6" fill="none"/>`;
 const baselineEnd=s.base.cash.at(-1).scenarioBalanceCents,scenarioEnd=s.analysis.cash.at(-1).scenarioBalanceCents;
 svg+=`<text x="${right-3}" y="${y(baselineEnd)-11}" text-anchor="end" font-family="monospace" font-size="10" fill="var(--muted)">${s.shock===0?'base = cenário':'base'}</text>`;
 if(s.shock>0)svg+=`<text x="${right-3}" y="${Math.min(306,y(scenarioEnd)+19)}" text-anchor="end" font-family="monospace" font-size="10" fill="var(--risk)">USD +${Math.round(s.shock*100)}%</text>`;
 const d=s.analysis.cash.find(d=>d.date===s.analysis.firstShortfall);
 if(d){const px=x(d.date),py=y(d.scenarioBalanceCents);svg+=`<line x1="${px}" x2="${px}" y1="30" y2="${py}" stroke="var(--risk)" stroke-opacity=".4" stroke-dasharray="2 4"/><circle cx="${px}" cy="${py}" r="4" fill="var(--risk)"/><text x="${Math.max(left+2,Math.min(right-240,px-70))}" y="17" font-family="monospace" font-size="10" fill="var(--risk)">${fmtDate(d.date)}: saldo negativo</text>`;}
 for(const offset of [0,30,60,90]){const d=addDays(input.asOf,offset);svg+=`<text x="${x(d)}" y="333" text-anchor="${offset===0?'start':offset===90?'end':'middle'}" font-family="monospace" font-size="10" fill="var(--muted)">${fmtDate(d)}</text>`;}
 return svg;
}
export function waterfallSvg(s,input){
 const a=s.analysis;
 const groups=new Map();for(const r of a.rows.filter(r=>r.dueDate<=a.end)){groups.set(r.supplier,(groups.get(r.supplier)||0)+r.scenarioCents);}
 const sorted=[...groups].sort((a,b)=>b[1]-a[1]),inflows=a.cash.reduce((n,d)=>n+d.inflowCents,0);
 const entries=[{label:'Caixa inicial',value:a.openingCashCents,total:true},{label:'Recebimentos',value:inflows},...sorted.slice(0,4).map(([name,value])=>({label:name,value:-value})),{label:'Outros',value:-sorted.slice(4).reduce((n,p)=>n+p[1],0)},{label:'Saldo final',value:a.closingCashCents,total:true}];
 let balance=0;const bars=entries.map((e,i)=>{const before=e.total?0:balance;balance=e.total?e.value:balance+e.value;return {...e,from:before,to:balance};});
 const lo=Math.min(0,...bars.flatMap(b=>[b.from,b.to])),hi=Math.max(...bars.flatMap(b=>[b.from,b.to]));
 const y=v=>240-(v-lo)/(hi-lo||1)*195;
 const width=68,gap=17,x=i=>19+i*(width+gap);
 let svg=`<line x1="14" x2="697" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>`;
 bars.forEach((b,i)=>{const upper=Math.min(y(b.from),y(b.to)),height=Math.max(1,Math.abs(y(b.from)-y(b.to))),fill=b.total?(b.value<0?'var(--risk)':'var(--bar-strong)'):'var(--bar)';svg+=`<rect x="${x(i)}" y="${upper}" width="${width}" height="${height}" fill="${fill}"/><text x="${x(i)+width/2}" y="${b.to>=b.from?upper-9:upper+height+16}" text-anchor="middle" font-family="monospace" font-size="10" fill="${b.to<0&&b.total?'var(--risk)':'var(--muted)'}">${b.value>0&&!b.total?'+':''}${Math.round(b.value/1e5)} mil</text>`;
 const words=b.label.split(' '),line1=words.slice(0,2).join(' '),line2=words.slice(2).join(' ');svg+=`<text x="${x(i)+width/2}" y="281" text-anchor="middle" font-family="Arial" font-size="9" fill="var(--muted)"><tspan x="${x(i)+width/2}">${xml(line1)}</tspan><tspan x="${x(i)+width/2}" dy="13">${xml(line2)}</tspan></text>`;
 if(i<bars.length-1)svg+=`<line x1="${x(i)+width}" x2="${x(i+1)}" y1="${y(b.to)}" y2="${y(b.to)}" stroke="var(--line)" stroke-dasharray="2 3"/>`;
 });return svg;
}
export function driversMarkup(s){return s.analysis.rows.filter(r=>r.currency==='USD').sort((a,b)=>b.shockImpactCents-a.shockImpactCents).slice(0,3).map(r=>`<div class="driver"><span>${xml(r.supplier)}<small>${xml(r.id)} / ${fmtDate(r.dueDate)}</small></span><b>+${formatBrl(r.shockImpactCents/100)}</b></div>`).join('');}
export function hedgeMarkup(s){
 const all=s.hedges.flatMap(h=>h.costPoints),min=Math.min(...all),max=Math.max(...all);
 return s.hedges.map(h=>{const points=h.costPoints.map((v,i)=>`${5+i*40},${11-(v-min)/(max-min||1)*9}`).join(' ');return `<tr><td>${h.coverage}%<small>fixação hipotética</small></td><td>${formatBrl(h.analysis.totalCents/100)}<svg class="mini-range" viewBox="0 0 90 14" role="img" aria-label="Sensibilidade do custo total a USD mais zero, dez e vinte por cento"><polyline points="${points}" fill="none" stroke="var(--plot-base)" stroke-width="1.5"/></svg></td><td class="${h.analysis.shockImpactCents?'risk-number':''}">+${formatBrl(h.analysis.shockImpactCents/100)}<small>ao choque selecionado</small></td><td class="${h.fundingCents?'risk-number':''}">${formatBrl(h.fundingCents/100)}<small>mínimo no horizonte</small></td></tr>`;}).join('');
}
export function heatmapMarkup(s,input){
 const cells=Array.from({length:3},()=>Array(13).fill(0));
 for(const r of s.analysis.rows){const date=r.dueDate<input.asOf?input.asOf:r.dueDate,week=Math.floor((Date.parse(date)-Date.parse(input.asOf))/86400000/7),currency=['USD','EUR','GBP'].indexOf(r.currency);if(week>=0&&week<13&&date<=s.analysis.end)cells[currency][week]+=r.scenarioCents;}
 const max=Math.max(1,...cells.flat());
 return '<span></span>'+Array.from({length:13},(_,i)=>`<span class="week" title="A partir de ${addDays(input.asOf,i*7)}">S${String(i+1).padStart(2,'0')}</span>`).join('')+cells.map((row,c)=>`<span class="currency">${['USD','EUR','GBP'][c]}</span>`+row.map((v,w)=>{const label=['USD','EUR','GBP'][c]+', semana '+(w+1)+': '+formatBrl(v/100);return `<span class="cell" tabindex="0" title="${xml(label)}" aria-label="${xml(label)}" data-label="${xml(label)}" style="--shade:${.025+.63*v/max}"><span class="sr-only">${xml(label)}</span></span>`;}).join('')).join('');
}
