import {readFile,writeFile} from 'node:fs/promises';
import {analyticsMarket} from '../web/analytics-market.mjs';
const snapshot=JSON.parse(await readFile('web/market-snapshot.json','utf8'));
const payload=analyticsMarket(snapshot);
const html=(await readFile('design/analytics.html','utf8')).replace('/*__ANALYTICS_DATA__*/',()=>JSON.stringify(payload).replaceAll('<','\\u003c'));
await writeFile('web/analytics.html',html);
console.log('Portfolio analytics: sourced historical dataset embedded for offline calculations.');
