import {writeFile} from 'node:fs/promises';
import {validateSeries} from '../worker/index.js';
const now=new Date(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),[y,m,d]=day.split('-');
const currencies=Object.fromEntries(await Promise.all([['USD',1],['EUR',21619],['GBP',21623]].map(async([symbol,id])=>{
 const query=new URLSearchParams({formato:'json',dataInicial:`01/01/${Number(y)-2}`,dataFinal:`${d}/${m}/${y}`});
 const response=await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados?${query}`,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('BCB '+symbol+': '+response.status);
 const points=validateSeries(await response.json()).filter(p=>p.date<=day);
 if(points.length<505)throw Error('Histórico curto: '+symbol);
 return[symbol,{points,source:'BCB / SGS',series:id,status:'snapshot'}];
})));
await writeFile('web/market-snapshot.json',JSON.stringify({provider:'Banco Central do Brasil / SGS',frequency:'daily_reference',checkedAt:now.toISOString(),status:'snapshot',currencies},null,2)+'\n');
console.log('Snapshot oficial:',Object.fromEntries(Object.entries(currencies).map(([s,c])=>[s,{observations:c.points.length,asOf:c.points.at(-1).date}])));
