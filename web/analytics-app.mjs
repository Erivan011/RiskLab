import * as PortfolioEngine from './portfolio-analytics.mjs';
import {escapeHtml as esc,money,pct,number,equityChart,drawdownChart,breachesChart,attributionTable,correlationTable,resultConclusions} from './analytics-viz.mjs';
import {analyticsReport,analyticsJson,analyticsCsv} from './analytics-report.mjs';
const $=id=>document.getElementById(id);
const original=JSON.parse($('analytics-dataset').textContent);
let dataset=structuredClone(original),result=null,stress=null,worker=null,requestId=0,shocks=[];
const buttons=['export-analytics-report','export-analytics-json','export-analytics-csv'];
function download(content,name,type){
 const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.hidden=true;document.body.append(link);link.click();setTimeout(()=>{link.remove();URL.revokeObjectURL(url);},10000);
}
function syncTheme(){
 const dark=document.documentElement.dataset.theme!=='light';$('analytics-theme').textContent=dark?'Tema claro':'Tema escuro';
 $('analytics-theme').setAttribute('aria-label',dark?'Ativar tema claro':'Ativar tema escuro');
 document.querySelector('meta[name=theme-color]').content=dark?'#101210':'#f6f3ec';
}
$('analytics-theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('risklab.editorial.theme',document.documentElement.dataset.theme);}catch{}syncTheme();};syncTheme();
if(matchMedia('(max-width:700px)').matches)$('analytics-controls').open=false;
function updateWeightTotal(){
 const sum=[...document.querySelectorAll('[data-weight]')].reduce((s,input)=>s+Number(input.value),0);
 $('weight-total').textContent='Soma: '+number(sum,2)+'%';$('weight-total').classList.toggle('invalid',Math.abs(sum-100)>1e-6);
}
function installDataset(weights){
 const n=dataset.assetNames.length;
 if(dataset.rows.length<Number($('analytics-window').value)+2)$('analytics-window').value='126';
 $('analytics-weights').innerHTML=dataset.assetNames.map((name,index)=>`<label class="weight-control"><span>${esc(name)}</span><input data-weight="${index}" aria-label="Peso ${esc(name)} em porcentagem" type="number" min="0" max="100" step="0.01" value="${weights[index]}" required><span>%</span></label>`).join('');
 document.querySelectorAll('[data-weight]').forEach(input=>input.oninput=updateWeightTotal);updateWeightTotal();
 $('analytics-benchmark').innerHTML=dataset.assetNames.map((name,index)=>`<option value="${index}">${esc(name)}</option>`).join('')+'<option value="-1">1/N diário · sem custos</option>';
 $('analytics-end').value=dataset.rows.at(-1).date;
 $('analytics-start').value=dataset.source.kind==='bcb_returns'?'2023-01-01':dataset.rows[Math.min(Number($('analytics-window').value),dataset.rows.length-2)].date;
}
function busy(active){
 $('analytics-fields').disabled=active;$('analytics-results').setAttribute('aria-busy',String(active));
 buttons.forEach(id=>$(id).disabled=active||!result);
 if(!active)$('analytics-cost').disabled=$('analytics-policy').value==='buyhold';
}
function showError(error){$('analytics-error').hidden=false;$('analytics-error').textContent=error.message||String(error);}
function collectInput(){
 return {rows:dataset.rows,assetNames:dataset.assetNames,weights:[...document.querySelectorAll('[data-weight]')].map(input=>Number(input.value)/100),
  startDate:$('analytics-start').value,endDate:$('analytics-end').value,window:Number($('analytics-window').value),confidence:Number($('analytics-confidence').value),
  capital:Number($('analytics-capital').value),feeBps:Number($('analytics-cost').value),policy:$('analytics-policy').value,benchmarkIndex:Number($('analytics-benchmark').value),source:dataset.source};
}
function runEngine(input){
 worker?.terminate();const id=++requestId;
 return new Promise((resolve,reject)=>{
  const fallback=()=>{worker?.terminate();worker=null;setTimeout(()=>{try{resolve(PortfolioEngine.analyzePortfolio(input));}catch(error){reject(error);}},0);};
  try{
   worker=new Worker(new URL('./portfolio-worker.mjs',import.meta.url),{type:'module'});
   const timeout=setTimeout(()=>{worker?.terminate();reject(Error('A análise demorou mais que o esperado. Reduza o histórico e tente novamente.'));},20000);
   worker.onmessage=event=>{if(event.data.id!==id)return;clearTimeout(timeout);worker.terminate();worker=null;event.data.error?reject(Error(event.data.error)):resolve(event.data.result);};
   worker.onerror=()=>{clearTimeout(timeout);fallback();};worker.postMessage({id,input});
  }catch{fallback();}
 });
}
async function apply(){
 busy(true);$('analytics-error').hidden=true;$('analytics-error').textContent='';$('analytics-status').textContent='Calculando janelas anteriores, posições, custos e comparação histórica…';
 try{
  const next=await runEngine(collectInput());result=next;
  $('analytics-source-name').textContent=dataset.source.label;
  $('analytics-source-range').textContent=`${dataset.rows[0].date} → ${dataset.rows.at(-1).date} · ${dataset.assetNames.length} ativos · ${dataset.rows.length} retornos`;
  if(shocks.length!==result.assetNames.length)shocks=result.assetNames.map(()=>-.1);
  renderResults();$('analytics-status').textContent=`${result.observations} dias avaliados. Treinamento sempre anterior ao dia previsto. Dados até ${result.asOf}.`;
 }catch(error){showError(error);$('analytics-status').textContent=result?'A última análise válida permanece abaixo.':'Não foi possível calcular com essas premissas.';}
 finally{busy(false);}
}
function metric(label,value,note){return `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;}
function renderResults(){
 const chartWidth=matchMedia('(max-width:700px)').matches?500:850;
 const r=result,d=r.diagnostic,confidence=pct(r.input.confidence,0);
 const worst=[...r.evaluation].sort((a,b)=>b.loss-a.loss).slice(0,5);
 $('analytics-results').innerHTML=`<section id="diagnostico" class="risk-diagnostic"><div class="analytics-section-title"><div><span class="eyebrow">01 / DIAGNÓSTICO ATRIBUÍDO</span><h2>Quanto pesa cada fonte de risco?</h2></div><span class="result-asof">ESTIMATIVA EM ${r.asOf}</span></div>
 <div class="analytics-statline">${metric('VOLATILIDADE ANUAL',pct(d.annualizedVolatility),'Mercado bruto · √252')}${metric('VaR '+confidence+' / 1 DIA',money(d.varRate*r.performance.ending),r.input.window+' observações na janela')}${metric('ES '+confidence+' / 1 DIA',money(d.esRate*r.performance.ending),d.tailCount+' observações na cauda')}${metric('MÁXIMA QUEDA',pct(r.performance.maxDrawdown),'Carteira líquida · período avaliado')}</div>
 ${r.flags.length?`<div class="analytics-flags">${r.flags.map(flag=>`<p>${esc(flag)}</p>`).join('')}</div>`:''}
 <div class="analytics-section-title small"><h3>Atribuição de risco</h3><span>Patrimônio de referência: ${money(r.performance.ending)}</span></div><div class="analytics-table-scroll">${attributionTable(r)}</div><p class="analytics-note">¹ Contribuições anuais em pontos percentuais; somam a volatilidade da carteira. ² Contribuições ao ES diário, usando as mesmas datas da cauda. Valores negativos compensam o risco dos demais ativos. Pesos são os usados na estimativa do próximo período.</p>
 <details class="correlation-detail" open><summary>Correlações entre os ativos · janela final</summary><div class="analytics-table-scroll">${correlationTable(r)}</div><p class="analytics-note">Correlação amostral de retornos sincronizados. — indica variância nula. Correlação não é causalidade nem proteção garantida.</p></details></section>
 <section class="analytics-section" id="cenarios-carteira"><div class="analytics-section-title"><div><span class="eyebrow">02 / PRESSÕES COMBINADAS</span><h2>Um choque para cada exposição.</h2></div></div><p class="analytics-description">Combine movimentos simultâneos nos ativos. O efeito é aplicado linearmente às posições usadas no diagnóstico, sobre o patrimônio final.</p><div class="stress-presets"><button id="stress-uniform" type="button">Queda simultânea de 10%</button><button id="stress-observed" type="button">Repetir pior dia conjunto da janela</button></div><p class="analytics-note" id="stress-context">Hipótese manual, sem probabilidade atribuída.</p><div class="analytics-stress-layout"><div id="portfolio-shocks">${r.assetNames.map((name,index)=>`<label><span>${esc(name)}</span><input type="number" min="-99.9" max="100" step="0.1" data-shock="${index}" aria-label="Choque ${esc(name)} em porcentagem" value="${(shocks[index]*100).toFixed(1)}"><span>%</span></label>`).join('')}</div><div id="portfolio-stress-result" aria-live="polite"></div></div></section>
 <section class="analytics-section" id="backtesting"><div class="analytics-section-title"><div><span class="eyebrow">03 / HISTÓRICO FORA DA AMOSTRA</span><h2>O que aconteceu depois da previsão?</h2></div><span class="result-asof">${r.startDate} → ${r.endDate}</span></div><div class="performance-readout"><div><span>CARTEIRA LÍQUIDA</span><strong>${pct(r.performance.cumulativeReturn)}</strong><small>${money(r.performance.ending)} ao final</small></div><div><span>REFERÊNCIA / ${esc(r.benchmarkLabel)}</span><strong>${pct(r.benchmark.cumulativeReturn)}</strong><small>Mesmos dias e capital · sem custos</small></div><div><span>CUSTOS DESCONTADOS</span><strong>${money(r.totalFees)}</strong><small>Somente giro de rebalanceamento</small></div></div>
 <figure class="analytics-figure"><figcaption><b>Patrimônio ao longo do tempo</b><span><i></i>Carteira líquida <i class="benchmark"></i>Referência</span></figcaption>${equityChart(r,chartWidth)}</figure>
 <details class="drawdown-detail"><summary>Ver a queda em relação ao pico</summary>${drawdownChart(r,chartWidth)}</details>
 <figure class="analytics-figure"><figcaption><b>Perda diária e VaR previsto</b><span><i></i>Perda bruta <i class="benchmark"></i>VaR anterior · pontos = excedências</span></figcaption>${breachesChart(r,chartWidth)}</figure>
 <div class="coverage-readout">${metric('EXCEDÊNCIAS OBSERVADAS',String(r.coverage.breaches),pct(r.coverage.breachRate)+' dos dias')}${metric('EXCEDÊNCIAS ESPERADAS',number(r.coverage.expectedBreaches,1),r.observations+' dias avaliados')}${metric('KUPIEC / P-VALOR',number(r.coverage.kupiecPValue,3),r.coverage.kupiecPValue<.05?'Taxa esperada rejeitada a 5%':'Taxa esperada não rejeitada a 5%')}</div><p class="analytics-note">A previsão de cada dia usa apenas dados anteriores. Perdas e VaR do teste são brutos; os custos são descontados somente do desempenho. O teste de Kupiec não avalia independência das exceções e não certifica o modelo.</p>
 <div class="analytics-section-title small"><h3>Maiores perdas diárias no período</h3><span>Pesos conhecidos antes de cada retorno</span></div><div class="analytics-table-scroll"><table class="worst-days"><thead><tr><th>Dia avaliado</th><th>Treinamento encerrado</th><th>Perda bruta</th><th>VaR previsto</th><th>Excedeu?</th></tr></thead><tbody>${worst.map(day=>`<tr><th>${day.date}</th><td>${day.trainingEnd}</td><td>${pct(day.loss)}</td><td>${pct(day.varRate)}</td><td>${day.breach?'Sim':'Não'}</td></tr>`).join('')}</tbody></table></div></section>
 <section class="analytics-section analytics-conclusions"><span class="eyebrow">04 / LEITURAS DO EXPERIMENTO</span><h2>O que os resultados permitem dizer.</h2><ol id="analytics-conclusions"></ol><p class="analytics-note">Estas leituras descrevem o experimento; não são recomendação de investimento. Escolher parâmetros depois de observar resultados pode introduzir viés.</p></section>`;
 document.querySelectorAll('[data-shock]').forEach(input=>input.oninput=()=>{const values=[...document.querySelectorAll('[data-shock]')].map(field=>Number(field.value)/100);if(values.every(v=>Number.isFinite(v)&&v> -1&&v<=1)){shocks=values;$('stress-context').textContent='Hipótese manual, sem probabilidade atribuída.';renderStress();}});
 $('stress-uniform').onclick=()=>setStress(r.assetNames.map(()=>-.1),'Hipótese de queda simultânea de 10%, sem probabilidade atribuída.');
 $('stress-observed').onclick=()=>setStress(r.empiricalWorst.shocks,'Retornos realmente observados em conjunto em '+r.empiricalWorst.date+', reaplicados às posições atuais. Não é previsão.');
 renderStress();
}
function setStress(values,label){try{PortfolioEngine.portfolioStress(result,values);}catch(error){showError(error);return;}shocks=[...values];document.querySelectorAll('[data-shock]').forEach((input,index)=>input.value=String(shocks[index]*100));$('stress-context').textContent=label;renderStress();}
function renderStress(){
 stress=PortfolioEngine.portfolioStress(result,shocks);
 $('portfolio-stress-result').innerHTML=`<span>VARIAÇÃO NO CENÁRIO</span><strong class="${stress.pnl<0?'loss':''}">${money(stress.pnl)}</strong><small>${pct(stress.returnRate)} · saldo hipotético ${money(stress.stressedValue)}</small><div>${stress.pnlByAsset.map((pnl,index)=>`<p><span>${esc(result.assetNames[index])}</span><b>${money(pnl)}</b></p>`).join('')}</div>`;
 $('analytics-conclusions').innerHTML=resultConclusions(result,stress).map(text=>`<li>${esc(text)}</li>`).join('');
}
$('analytics-form').onsubmit=event=>{event.preventDefault();apply();};
$('analytics-policy').onchange=()=>$('analytics-cost').disabled=$('analytics-policy').value==='buyhold';
function equalizeWeights(){const fields=[...document.querySelectorAll('[data-weight]')];let assigned=0;fields.forEach((input,index)=>{const value=index===fields.length-1?10000-assigned:Math.floor(10000/fields.length);input.value=String(value/100);assigned+=value;});updateWeightTotal();}
$('equal-weights').onclick=equalizeWeights;
$('analytics-file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;busy(true);$('analytics-error').hidden=true;$('analytics-error').textContent='';
 try{
  if(file.size>2e6)throw Error('Use um CSV de até 2 MB.');
  const text=await file.text(),parsed=PortfolioEngine.parsePriceCsv(text);
  if(parsed.rows.length<128)throw Error('Este painel precisa de ao menos 129 linhas de preços completos para a janela mínima de 126 observações.');
  let sha256=null;if(crypto.subtle)sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  dataset={...parsed,source:{kind:'user_prices',label:file.name,sha256,quality:parsed.quality,disclosure:`Preços fornecidos pelo usuário. ${parsed.quality.excludedRows} linhas incompletas excluídas, sem preenchimento de preços. Moeda e ajustes corporativos não são verificados automaticamente.`}};
  const weights=parsed.assetNames.map(()=>0);weights[0]=100;installDataset(weights);equalizeWeights();shocks=[];await apply();
 }catch(error){showError(error);busy(false);}
};
$('restore-analytics-data').onclick=()=>{dataset=structuredClone(original);$('analytics-window').value='252';installDataset([50,30,20]);shocks=[];apply();};
$('download-price-template').onclick=()=>{
 let levels=[100,100,100];const lines=['date,USD_BRL_INDEX,EUR_BRL_INDEX,GBP_BRL_INDEX',original.source.firstPriceDate+',100,100,100'];
 for(const row of original.rows){levels=levels.map((value,index)=>value*(1+row.values[index]));lines.push(row.date+','+levels.map(value=>value.toFixed(10)).join(','));}
 download(lines.join('\r\n'),'risklab-historico-normalizado.csv','text/csv;charset=utf-8');
};
$('export-analytics-report').onclick=()=>{
 const dialog=$('analytics-report-preview'),frame=$('analytics-report-frame');
 frame.srcdoc=analyticsReport(result,stress).replace('<button onclick="window.print()">Imprimir / Salvar PDF</button>','');
 dialog.showModal();
};
$('close-analytics-report').onclick=()=>$('analytics-report-preview').close();
$('download-analytics-report').onclick=()=>download(analyticsReport(result,stress),'risklab-relatorio-'+result.endDate+'.html','text/html;charset=utf-8');
$('print-analytics-report').onclick=()=>$('analytics-report-frame').contentWindow.print();
$('export-analytics-json').onclick=()=>download(analyticsJson(result,stress),'risklab-memoria-'+result.endDate+'.json','application/json');
$('export-analytics-csv').onclick=()=>download(analyticsCsv(result),'risklab-backtest-'+result.endDate+'.csv','text/csv;charset=utf-8');
installDataset([50,30,20]);apply();
