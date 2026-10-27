import { evaluateDesk, lossHistogram } from './desk-engine.mjs';
import { CURRENCIES } from './market-engine.mjs';
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Math.abs(n)<.5?0:n);
const percent = n => new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(n);
const date = s => s.split('-').reverse().join('/');
const shades = ['#75b9b9','#bca274','#839cbb'];
const key = 'risklab.desk.journal.v1';
let market, series, current, dirty = false, journal = [];
try {
  const saved = JSON.parse(localStorage.getItem(key) || '[]');
  if (Array.isArray(saved)) journal = saved.filter(r => r.schema === 1 && typeof r.name === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.asOf) && Number.isFinite(r.es) && Number.isFinite(r.budget) && r.budget>0 && [r.quantities,r.coverage,r.shocks].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))).slice(0,8);
} catch { $('desk-journal-status').textContent = 'Histórico local indisponível. Você pode baixar a análise em JSON.'; }
$('desk-inputs').innerHTML = CURRENCIES.map((c,i) => `<div class="desk-position-row"><label><span>${c} / BRL</span><select aria-label="Direção ${c}" data-desk-direction="${i}"><option value="1">Receber</option><option value="-1" ${i===1?'selected':''}>Pagar</option></select></label><label><input aria-label="Quantidade ${c}" data-desk-quantity="${i}" type="number" min="0" max="1000000000" step="any" value="${[50000,25000,15000][i]}" required></label><label><input aria-label="Cobertura ${c} em porcentagem" data-desk-coverage="${i}" type="number" min="0" max="100" step="any" value="0" required></label></div>`).join('');
$('desk-shocks').innerHTML = CURRENCIES.map((c,i)=>`<label><span>${c} / BRL<output id="desk-shock-label-${i}">${i===1?'+10%':'−10%'}</output></span><input data-desk-shock="${i}" aria-label="Choque ${c} em porcentagem" type="range" min="-30" max="30" step="1" value="${i===1?10:-10}"></label>`).join('');
function inputValues() {
  return {
    quantities: CURRENCIES.map((_,i)=>Number(document.querySelector(`[data-desk-quantity="${i}"]`).value)*Number(document.querySelector(`[data-desk-direction="${i}"]`).value)),
    coverage: CURRENCIES.map((_,i)=>Number(document.querySelector(`[data-desk-coverage="${i}"]`).value)/100),
    shocks: CURRENCIES.map((_,i)=>Number(document.querySelector(`[data-desk-shock="${i}"]`).value)/100),
    budget: Number($('desk-budget').value),
  };
}
function calculate() {
  if (!series || !$('desk-form').reportValidity()) return;
  try {
    const input = inputValues();
    current = evaluateDesk(series,input.quantities,input.coverage,input.shocks,input.budget);
    dirty = false;
    $('desk-error').textContent = '';
    $('desk-dirty').textContent = 'Cálculo concluído · posições, cobertura e cenários sincronizados.';
    $('desk-export').disabled = false; $('desk-save').disabled = false;
    render();
  } catch(e) {
    current = null;
    $('desk-error').textContent = e.message;
    $('desk-export').disabled = true; $('desk-save').disabled = true;
  }
}
function render() {
  const r = current, b = r.baseline, h = r.residual;
  const max = Math.max(...r.contributions.map(c=>Math.abs(c.es)),1);
  $('desk-source').textContent = `Base comum ${date(b.asOf)} · ${b.observations} retornos · ${market.status === 'updated'?'consulta à fonte':market.status==='partial'?'consulta parcial / dados salvos':'dados salvos'}`;
  $('desk-verdict').textContent = r.budgetExceeded ? 'A perda de cauda excede o orçamento.' : h.gross === 0 ? 'A exposição residual está neutralizada.' : 'A perda de cauda cabe no orçamento definido.';
  $('desk-summary').textContent = `ES residual de ${money(h.esBrl)} para um orçamento de ${money(r.budget)}. ${percent(r.concentration)} da exposição bruta está concentrada na maior posição. O estresse selecionado ${-r.residualPnl > r.budget ? "excede" : "não excede"} esse orçamento; ele é uma hipótese distinta do ES.`;
  const kpis = [
    ['Exposição bruta',money(b.gross),'Antes da cobertura idealizada'],
    ['ES residual · 99%',money(h.esBrl),`Sem cobertura: ${money(b.esBrl)}`],
    ['Folga no orçamento',money(r.budget-h.esBrl),'Orçamento menos ES residual'],
    ['Impacto do estresse',money(r.residualPnl),'Choques selecionados · após cobertura'],
  ];
  $('desk-kpis').innerHTML = kpis.map(([label,value,note])=>`<div class="desk-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('desk-exposures').innerHTML = b.positions.map((p,i)=>`<div style="width:${b.gross?Math.abs(p.notional)/b.gross*100:0}%;background:${shades[i]}" title="${p.currency}: ${money(p.notional)}"></div>`).join('');
  $('desk-attribution').innerHTML = r.contributions.map((c,i)=>`<div class="desk-attribution-row"><span style="color:${shades[i]}">${c.currency}</span><div class="desk-bar-track"><i class="${c.es<0?'negative':''}" style="width:${Math.abs(c.es)/max*100}%"></i></div><strong>${money(c.es)}</strong></div>`).join('');
  $('desk-tail-note').textContent = `Contribuições somam ${money(b.esBrl)}, calculadas nas mesmas ${r.tailCount} observações da cauda da carteira. Valores negativos compensam perdas das outras moedas. Com poucas observações de cauda, o ES é sensível à amostra.`;
  $('desk-compare').innerHTML = `<div><span>ES sem cobertura</span><strong>${money(b.esBrl)}</strong></div><div><span>ES após cobertura idealizada</span><strong>${money(h.esBrl)}</strong></div>`;
  $('desk-stress-results').innerHTML = `<div><span>Sem cobertura</span><strong>${money(r.pnl)}</strong></div><div><span>Após cobertura idealizada</span><strong>${money(r.residualPnl)}</strong></div>`;
  const scale = Math.max(...r.matrix.flat().map(Math.abs),1);
  $('desk-matrix').innerHTML = `<table class="desk-matrix-table" aria-label="Impacto em reais dos choques EUR por USD"><thead><tr><th scope="col">EUR / USD</th>${r.sweep.map(s=>`<th scope="col">${percent(s)}</th>`).join('')}</tr></thead><tbody>${r.matrix.map((row,i)=>`<tr><th scope="row">${percent(r.sweep[i])}</th>${row.map(v=>`<td style="background:rgba(${v<0?'174,83,73':'73,147,142'},${.1+Math.abs(v)/scale*.38})">${money(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('desk-reverse-value').textContent = r.reverseShock===null?'—':percent(r.reverseShock);
  $('desk-reverse-note').textContent = r.reverseShock===null ? 'Sem exposição residual: não há choque linear que consuma o orçamento.' : `Um choque de ${percent(r.reverseShock)} contra cada posição residual produziria perda de ${money(r.budget)}. Direções: ${CURRENCIES.map((c,i)=>c+' '+(r.reverseDirection[i]<0?'↓':r.reverseDirection[i]>0?'↑':'neutro')).join(' · ')}.${r.reverseShock>1?' A magnitude ultrapassa 100%; o choque de queda não é economicamente viável nesse modelo.':''}`;
  $('desk-data').innerHTML = CURRENCIES.map(c=>{
    const s=market.currencies[c];
    return `<div class="desk-data-row"><strong>${c}</strong><span>SGS ${[1,21619,21623][CURRENCIES.indexOf(c)]} · ${s.points.length} preços</span><span>${date(s.points.at(-1).date)}</span></div>`;
  }).join('');
  const bins = lossHistogram(b.losses);
  const low=bins[0].low, high=bins.at(-1).high, peak=Math.max(...bins.map(b=>b.count));
  const x=value=>20+(value-low)/(high-low)*860;
  const threshold=Math.max(20,Math.min(880,x(b.varBrl)));
  $('desk-distribution-chart').innerHTML = bins.map(bin=>`<rect x="${x(bin.low)+1}" y="${120-bin.count/peak*100}" width="${860/bins.length-3}" height="${bin.count/peak*100}" rx="2" fill="${bin.high>=b.varBrl?'#c49b77':'#5f999f'}"><title>${money(bin.low)} a ${money(bin.high)}: ${bin.count} observações</title></rect>`).join('') +
    `<line x1="${threshold}" x2="${threshold}" y1="12" y2="124" stroke="#e2bb8c" stroke-dasharray="3 3"/><text x="${Math.min(threshold,750)}" y="10" fill="#e2bb8c" font-size="11">VaR 99% · ${money(b.varBrl)}</text><text x="20" y="149" fill="#a5b6c7" font-size="11">${money(low)}</text><text x="880" y="149" text-anchor="end" fill="#a5b6c7" font-size="11">${money(high)}</text>`;
  $('desk-distribution-note').textContent = `${b.observations} reprecificações com os nocionais atuais, sem cobertura. A região de 99% deixa ${r.tailCount} observações na cauda; o ES de ${money(b.esBrl)} é a média dessas perdas. Classes que cruzam o VaR são destacadas por inteiro.`;
  renderJournal();
}
function renderJournal() {
  const target=$('desk-journal');target.replaceChildren();
  if (!journal.length) { const p=document.createElement('p');p.className='desk-footnote';p.textContent='Nenhuma análise registrada. Nomeie a hipótese acima para guardar esta configuração.';target.append(p);return; }
  for(const entry of journal) {
    const row=document.createElement('div');row.className='desk-journal-row';
    const name=document.createElement('strong');name.textContent=entry.name;
    const detail=document.createElement('span');detail.textContent=`Base ${date(entry.asOf)} · ES residual ${money(entry.es)} · limite ${money(entry.budget)}`;
    row.append(name,detail);
    if(current) { const comparison=document.createElement('small');comparison.textContent=entry.asOf===current.baseline.asOf ? `Diferença para a análise atual: ${money(current.residual.esBrl-entry.es)} no ES residual.` : 'Data-base diferente: a comparação direta inclui mudança nas referências.';row.append(comparison); }
    const restore=document.createElement('button');restore.type='button';restore.textContent='Carregar premissas';restore.addEventListener('click',()=>{
      CURRENCIES.forEach((_,i)=>{
        document.querySelector(`[data-desk-quantity="${i}"]`).value=Math.abs(entry.quantities[i]);
        document.querySelector(`[data-desk-direction="${i}"]`).value=entry.quantities[i]<0?'-1':'1';
        document.querySelector(`[data-desk-coverage="${i}"]`).value=entry.coverage[i]*100;
        document.querySelector(`[data-desk-shock="${i}"]`).value=entry.shocks[i]*100;
      });
      $('desk-budget').value=entry.budget;updateShockLabels();calculate();
      $('desk-journal-status').textContent='Premissas carregadas e recalculadas com a base de dados atual.';
    });row.append(restore);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remover registro';remove.style.marginLeft='16px';
    remove.addEventListener('click',()=>{
      const next=journal.filter(r=>r!==entry);
      try {localStorage.setItem(key,JSON.stringify(next));journal=next;renderJournal();$('desk-journal-status').textContent='Registro removido deste navegador.';}
      catch {$('desk-journal-status').textContent='Não foi possível atualizar o histórico local.';}
    });row.append(remove);target.append(row);
  }
}
function updateShockLabels() {
 CURRENCIES.forEach((_,i)=>$('desk-shock-label-'+i).textContent=percent(Number(document.querySelector(`[data-desk-shock="${i}"]`).value)/100));
}
$('desk-form').addEventListener('submit',event=>{event.preventDefault();calculate();});
$('desk-form').addEventListener('input',()=>{
 dirty=true; $('desk-export').disabled=true;$('desk-save').disabled=true;
 $('desk-dirty').textContent='Premissas alteradas. Recalcule antes de registrar ou exportar. Os números exibidos ainda pertencem ao cálculo anterior.';
});
$('desk-shocks').addEventListener('input',()=>{updateShockLabels();if(!dirty)calculate();});
$('desk-save-form').addEventListener('submit',event=>{
 event.preventDefault();if(!current||dirty)return;
 const name=$('desk-name').value.trim();if(!name)return;
 const r=current;
 const entry={schema:1,name,savedAt:new Date().toISOString(),asOf:r.baseline.asOf,quantities:r.quantities,coverage:r.coverage,shocks:r.shocks,budget:r.budget,es:r.residual.esBrl};
 const next=[entry,...journal].slice(0,8);
 try{localStorage.setItem(key,JSON.stringify(next));journal=next;renderJournal();$('desk-journal-status').textContent='Análise registrada neste navegador.';}
 catch{$('desk-journal-status').textContent='Não foi possível salvar neste navegador. Baixe o JSON para guardar a análise.';}
});
$('desk-export').addEventListener('click',()=>{
 if(!current||dirty)return;
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),source:'BCB / SGS',sourceStatus:market.status,valuationDate:current.baseline.asOf,method:'Historical repricing, 99% quantile; ES attribution on joint portfolio tail',assumptions:['Hypothetical portfolio','Idealized linear coverage, not a priced derivative','No transaction costs, interest or execution','Reverse stress is deterministic, not a probability'],analysis:current};
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`risklab-mesa-${report.valuationDate}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
});
document.addEventListener('risklab:market',event=>{
 market=event.detail.market;series=event.detail.series;
 if(dirty){$('desk-source').textContent='Referências recebidas · recalcule para usar a nova base';return;}
 calculate();
});
renderJournal();
