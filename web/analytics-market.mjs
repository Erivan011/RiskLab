import {validateMarket} from './market-data.mjs';
const symbols=['USD','EUR','GBP'];
// All returns use the same two observed dates. Never fill a missing quote.
export function analyticsMarket(data,now=new Date()){
 validateMarket(data);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const maps=symbols.map(s=>new Map(data.currencies[s].points.filter(p=>p.date<=today).map(p=>[p.date,p.value])));
 const dates=[...maps[0].keys()].filter(date=>maps.every(m=>m.has(date))).sort();
 if(dates.length<129)throw Error('Histórico comum insuficiente para atualizar a análise.');
 const rows=dates.slice(1).map((date,i)=>({date,values:maps.map(m=>m.get(date)/m.get(dates[i])-1)}));
 return {assetNames:symbols.map(s=>s+'/BRL'),rows,source:{kind:'bcb_returns',label:'Banco Central do Brasil / SGS',license:'ODbL',firstPriceDate:dates[0],retrievedAt:data.checkedAt,status:data.status,
 sources:symbols.map(s=>({currency:s,series:data.currencies[s].series,status:data.currencies[s].status,lastDate:data.currencies[s].points.filter(p=>p.date<=today).at(-1)?.date})),
 disclosure:'Referências cambiais diárias oficiais BCB/SGS; datas comuns, sem preenchimento. USD, EUR e GBP contra BRL, sem juros. Atualização consultada em '+data.checkedAt+'. Estado da fonte: '+data.status+'. Não são cotações intradiárias nem histórico de ações.'}};
}
export function defaultEvaluationStart(dataset){
 const year=dataset.rows.at(-1).date.slice(0,4),start=year+'-01-01';
 return dataset.rows.filter(r=>r.date>=start).length>=2?start:dataset.rows.at(-2).date;
}
