export const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(value);
export const pct=(value,digits=2)=>value===null?'—':new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
export const number=(value,digits=2)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
export const shortDate=value=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')).replace('.','');

function timeline(rows, keys, options={}){
 const width=options.width||850,left=64,right=width-25,top=25,bottom=235;
 const fontSize=width<600?14:10;
 const values=rows.flatMap(row=>keys.map(key=>row[key]));
 const minimum=options.zero?Math.min(0,...values):Math.min(...values);
 const maximum=Math.max(options.zero?0:-Infinity,...values);
 const span=maximum-minimum||1,pad=span*.1;
 const x=index=>left+index/(rows.length-1)*(right-left);
 const y=value=>bottom-(value-minimum+pad)/(span+pad*2)*(bottom-top);
 let content='';
 for(let i=0;i<4;i++){
  const value=minimum+span*i/3;
  content+=`<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--line)"/><text x="${left-9}" y="${y(value)+4}" text-anchor="end" class="plot-label" style="font-size:${fontSize}px">${options.percent?number(value*100,1)+'%':number(value,0)}</text>`;
 }
 keys.forEach((key,index)=>{
  const path=rows.map((row,i)=>`${i?'L':'M'}${x(i).toFixed(2)} ${y(row[key]).toFixed(2)}`).join(' ');
  content+=`<path d="${path}" fill="none" stroke="${index?'var(--plot-base)':'var(--risk)'}" stroke-width="${index?1.5:2}" ${index?'stroke-dasharray="4 3"':''}/>`;
 });
 if(options.breaches)rows.forEach((row,index)=>{
  if(row.breach)content+=`<circle cx="${x(index)}" cy="${y(row.loss)}" r="2.8" fill="var(--risk)"><title>${escapeHtml(row.date)}: perda ${pct(row.loss)}, VaR ${pct(row.varRate)}</title></circle>`;
 });
 for(const index of (width<600?[0,rows.length-1]:[0,Math.floor((rows.length-1)/2),rows.length-1]))content+=`<text x="${x(index)}" y="269" text-anchor="${index===0?'start':index===rows.length-1?'end':'middle'}" class="plot-label" style="font-size:${fontSize}px">${shortDate(rows[index].date)} ${rows[index].date.slice(0,4)}</text>`;
 return `<svg viewBox="0 0 ${width} 285" role="img" aria-label="${escapeHtml(options.label||'Série histórica')}">${content}</svg>`;
}
export function equityChart(result,width=850){
 const rows=[{date:result.initialDate,wealth:result.input.capital,benchmarkWealth:result.input.capital},...result.evaluation];
 return timeline(rows,['wealth','benchmarkWealth'],{width,label:`Patrimônio da carteira e referência. Retorno líquido ${pct(result.performance.cumulativeReturn)}; referência ${pct(result.benchmark.cumulativeReturn)}.`});
}
export function drawdownChart(result,width=850){
 const rows=[{date:result.initialDate,drawdown:0},...result.evaluation.map((row,index)=>({date:row.date,drawdown:result.performance.drawdowns[index]}))];
 return timeline(rows,['drawdown'],{width,zero:true,percent:true,label:`Queda em relação ao pico da carteira. Máxima queda ${pct(result.performance.maxDrawdown)}.`});
}
export function breachesChart(result,width=850){return timeline(result.evaluation,['loss','varRate'],{width,zero:true,percent:true,breaches:true,label:`Perda bruta diária e VaR previsto antes do dia. ${result.coverage.breaches} excedências em ${result.observations} observações.`});}
export function correlationTable(result){
 const names=result.assetNames;
 return `<table class="correlation-table"><thead><tr><th>Ativo</th>${names.map(name=>`<th scope="col">${escapeHtml(name)}</th>`).join('')}</tr></thead><tbody>${result.diagnostic.correlation.map((row,i)=>`<tr><th scope="row">${escapeHtml(names[i])}</th>${row.map((value,j)=>`<td style="--correlation:${value===null?0:Math.abs(value)*.26}" class="${value!==null&&value<0?'negative-correlation':''}" title="${escapeHtml(names[i]+' × '+names[j])}">${value===null?'—':number(value,2)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
export function attributionTable(result){
 const largest=Math.max(...result.diagnostic.components.map(component=>Math.abs(component.esContribution)),1e-12);
 return `<table class="attribution-table"><thead><tr><th>Ativo</th><th>Peso no risco</th><th>Contribuição à volatilidade¹</th><th>Contribuição ao ES²</th></tr></thead><tbody>${result.diagnostic.components.map((component,index)=>`<tr><th scope="row">${escapeHtml(result.assetNames[index])}</th><td>${pct(component.weight,1)}</td><td>${number(component.volatilityContribution*100,2)} p.p.<small>${component.volatilityShare===null?'Indefinida':pct(component.volatilityShare,1)+' do total'}</small></td><td class="attribution-value">${money(component.esContribution*result.performance.ending)}<i class="${component.esContribution<0?'offset':''}" style="width:${Math.abs(component.esContribution)/largest*100}%"></i></td></tr>`).join('')}<tr class="total-row"><th>Total</th><td>100%</td><td>${pct(result.diagnostic.annualizedVolatility)}</td><td>${money(result.diagnostic.esRate*result.performance.ending)}</td></tr></tbody></table>`;
}
export function resultConclusions(result,stress){
 const highest=result.diagnostic.components.reduce((best,component,index)=>component.esContribution>result.diagnostic.components[best].esContribution?index:best,0);
 const c=result.coverage;
 return [
  `A carteira acumulou ${pct(result.performance.cumulativeReturn)} líquidos no período, contra ${pct(result.benchmark.cumulativeReturn)} da referência ${result.benchmarkLabel}. Custos descontados: ${money(result.totalFees)}.`,
  `A maior queda entre um pico e o saldo posterior foi ${pct(result.performance.maxDrawdown)}. Esse risco de trajetória é diferente do VaR diário.`,
  `${result.assetNames[highest]} apresenta a maior contribuição ao ES nesta janela. A soma das contribuições usa as mesmas ${result.diagnostic.tailCount} observações de cauda.`,
  `Ocorreram ${c.breaches} excedências, ante ${number(c.expectedBreaches,1)} esperadas. Kupiec p=${number(c.kupiecPValue,3)}: ${c.kupiecPValue<.05?'a taxa esperada é rejeitada':'a taxa esperada não é rejeitada'} ao nível de 5%. Isso não valida o modelo nem testa independência das exceções.`,
  `No cenário combinado informado, a variação imediata seria ${money(stress.pnl)} (${pct(stress.returnRate)}), sem probabilidade atribuída.`,
 ];
}
