import {companyShock,reconcileDisclosure} from './company-engine.mjs';
const $=id=>document.getElementById(id);
const billion=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/1e6)+' bi';
const millions=value=>'R$ '+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value/1000)+' mi';
let disclosure;
function render(){
 const shock=Number($('company-shock').value)/100;
 const r=companyShock(disclosure,shock);
 $('company-shock-label').textContent=(shock>=0?'+':'')+new Intl.NumberFormat('pt-BR',{style:'percent'}).format(shock);
 $('company-impact').textContent='R$ '+billion(r.accountingEffect);
 $('company-rate').textContent=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4}).format(r.stressedRate);
 const max=Math.max(...r.effects.map(p=>Math.abs(p.effect)),1);
 $('company-effects').innerHTML=r.effects.map(p=>`<div class="company-effect"><span>${p.label}</span><div class="desk-bar-track"><i style="width:${Math.abs(p.effect)/max*100}%;background:${p.effect<0?'#bb9079':'#73acab'}"></i></div><strong>${millions(p.effect)}</strong></div>`).join('');
}
try{
 const response=await fetch('./suzano-case.json');if(!response.ok)throw Error('Não foi possível carregar o estudo.');
 disclosure=await response.json();const r=reconcileDisclosure(disclosure);
 if(!r.reconciled)throw Error('A base não reconcilia com a divulgação. Simulação interrompida.');
 $('company-kpis').innerHTML=[['Ativos expostos','R$ '+billion(r.assets),'Inclui derivativos ativos'],['Passivos expostos','R$ '+billion(Math.abs(r.liabilities)),'Inclui derivativos passivos'],['Saldo líquido divulgado','R$ '+billion(r.net),'Ativos menos passivos'],['Saldo sem derivativos','R$ '+billion(r.nonDerivativeNet),'Base da sensibilidade linear']].map(([label,value,note])=>`<div class="desk-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
 $('company-reconciliation').textContent='8 rubricas · totais reconciliados';
 $('company-positions').innerHTML=disclosure.positions.map(p=>`<div class="company-position"><span>${p.label}</span><strong>${millions(p.value)}</strong></div>`).join('');
 render();
}catch(e){$('company-error').textContent=e.message;$('company-shock').disabled=true;}
$('company-shock').addEventListener('input',render);
