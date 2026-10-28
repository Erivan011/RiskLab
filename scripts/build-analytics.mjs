import {readFile,writeFile} from 'node:fs/promises';
const dataset=JSON.parse(await readFile('web/dataset.json','utf8'));
const source={kind:'bcb_returns',label:'Banco Central do Brasil / SGS',license:'ODbL',firstPriceDate:dataset.summary.data_quality.first_date,
 retrievedAt:dataset.summary.data_quality.retrieved_at_utc,sources:dataset.summary.data_quality.sources,
 disclosure:'Retornos de referências cambiais diárias BCB/SGS. Carteira sintética de posições compradas em USD, EUR e GBP contra BRL, sem juros. Não é histórico de ações nem retorno total de títulos. Duas datas não comuns foram excluídas na preparação original.'};
const payload={assetNames:['USD/BRL','EUR/BRL','GBP/BRL'],rows:dataset.assets,source};
const html=(await readFile('design/analytics.html','utf8')).replace('/*__ANALYTICS_DATA__*/',()=>JSON.stringify(payload).replaceAll('<','\\u003c'));
await writeFile('web/analytics.html',html);
console.log('Portfolio analytics: sourced historical dataset embedded for offline calculations.');
