import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzePortfolio,portfolioStress,parsePriceCsv,coverageTest} from '../web/portfolio-analytics.mjs';
import {analyticsReport,analyticsJson,analyticsCsv} from '../web/analytics-report.mjs';
const pack=JSON.parse(readFileSync(new URL('../web/dataset.json',import.meta.url)));
const config={rows:pack.assets,assetNames:['USD/BRL','EUR/BRL','GBP/BRL'],weights:[.5,.3,.2],startDate:'2023-01-01',endDate:'2025-12-31',capital:10000,window:252,confidence:.95,feeBps:5,policy:'daily',benchmarkIndex:0};
const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const base=analyzePortfolio(config);
const fixture=(values)=>Array.from({length:values.length},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10),values:values[i]}));
const small=(values,overrides={})=>({rows:fixture(values),assetNames:['A','B'],weights:[.5,.5],window:20,confidence:.95,capital:1000,feeBps:0,policy:'daily',benchmarkIndex:0,...overrides});
test('all 1,508 rolling forecasts and both portfolio paths match independent NumPy',()=>{
 const references=JSON.parse(readFileSync(new URL('./portfolio-reference.json',import.meta.url)));
 for(const reference of references){
  const result=analyzePortfolio({...config,policy:reference.policy});
  assert.equal(result.evaluation.length,reference.evaluation.length);
  result.evaluation.forEach((row,index)=>{
   const expected=reference.evaluation[index];assert.equal(row.date,expected.date);assert.equal(row.trainingEnd,expected.trainingEnd);assert.equal(row.breach,expected.breach);
   for(const key of ['varRate','esRate','netReturn','wealth','benchmarkWealth','feePaid'])close(row[key],expected[key]);
  });
  close(result.performance.ending,reference.ending);close(result.totalFees,reference.totalFees);close(result.performance.maxDrawdown,reference.maxDrawdown);
  close(result.diagnostic.annualizedVolatility,reference.annualizedVolatility);close(result.diagnostic.varRate,reference.varRate);close(result.diagnostic.esRate,reference.esRate);
  result.diagnostic.components.forEach((component,j)=>{close(component.volatilityContribution,reference.volatilityComponents[j]);close(component.esContribution,reference.esComponents[j]);});
  close(result.coverage.kupiecPValue,reference.kupiecPValue,2e-7);
 }
});
test('changing present or future returns cannot alter earlier forecasts',()=>{
 const date='2024-06-03';const changed=config.rows.map(row=>row.date>=date?{...row,values:[-.3,.2,.1]}:row);
 const after=analyzePortfolio({...config,rows:changed});
 for(let i=0;i<base.evaluation.length;i++){
  const a=base.evaluation[i],b=after.evaluation[i];if(a.date>date)break;
  close(a.varRate,b.varRate);close(a.esRate,b.esRate);assert.ok(a.trainingEnd<a.date);
  if(a.date<date)close(a.wealth,b.wealth);
 }
});
test('volatility and ES attribution reconcile and permit negative offsets',()=>{
 const rows=Array.from({length:50},(_,i)=>[i%2?.02:-.02,i%2?-.01:.01]);
 const result=analyzePortfolio(small(rows,{weights:[.8,.2]}));
 close(result.diagnostic.components.reduce((s,c)=>s+c.volatilityContribution,0),result.diagnostic.annualizedVolatility);
 close(result.diagnostic.components.reduce((s,c)=>s+c.esContribution,0),result.diagnostic.esRate);
 assert.ok(result.diagnostic.components[1].volatilityContribution<0);assert.ok(result.diagnostic.components[1].esContribution<0);close(result.diagnostic.correlation[0][1],-1);
});
test('daily rebalancing charges both traded sides using drift known before the next return',()=>{
 const values=Array.from({length:22},()=>[0,0]);values[20]=[.1,0];
 const result=analyzePortfolio(small(values,{feeBps:10}));
 const turnover=2*(.5*1.1/1.05-.5),fee=1050*turnover*.001;
 close(result.evaluation[0].feePaid,0);close(result.evaluation[1].feePaid,fee);close(result.performance.ending,1050-fee);
 const buyhold=analyzePortfolio(small(values,{feeBps:10,policy:'buyhold'}));close(buyhold.totalFees,0);close(buyhold.performance.ending,1050);
});
test('a loss on the first evaluated day contributes to maximum drawdown',()=>{
 const values=Array.from({length:22},()=>[0,0]);values[20]=[-.1,-.1];
 const result=analyzePortfolio(small(values));close(result.performance.maxDrawdown,-.1);
});
test('constant series have undefined correlation and no numerical volatility',()=>{
 const result=analyzePortfolio(small(Array.from({length:30},()=>[.001,.001])));
 assert.equal(result.diagnostic.annualizedVolatility,0);assert.equal(result.diagnostic.correlation[0][1],null);
 for(const flags of [Array(20).fill(false),Array(20).fill(true)])assert.ok(Number.isFinite(coverageTest(flags,.95).kupiecPValue));
});
test('combined shocks use actual risk weights and reconcile asset P&L to the portfolio',()=>{
 const stress=portfolioStress(base,[-.1,.2,-.05]);close(stress.pnlByAsset.reduce((s,p)=>s+p,0),stress.pnl);close(stress.stressedValue,base.performance.ending+stress.pnl);
 assert.throws(()=>portfolioStress(base,[-1,0,0]));
});
test('CSV aligns complete price rows without forward filling and preserves provenance counts',()=>{
 const rows=Array.from({length:30},(_,i)=>`${new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10)};${100+i};${i===5?'':200+i}`);
 const parsed=parsePriceCsv('date;"A, total";B\n'+rows.join('\n'));
 assert.equal(parsed.quality.excludedRows,1);assert.equal(parsed.rows.length,28);assert.equal(parsed.assetNames[0],'A, total');
 close(parsed.rows[4].values[0],106/104-1);
 assert.throws(()=>parsePriceCsv('date,A,B\n2020-01-01,100,100\n2020-01-01,101,100'));
 assert.throws(()=>parsePriceCsv('date,A,A\n2020-01-01,100,100'));
});
test('reports escape imported names and export the precise experiment and daily training boundary',()=>{
 const result=analyzePortfolio({...config,assetNames:['<script>alert(1)</script>','EUR','GBP']});
 const stress=portfolioStress(result,[-.1,0,0]);const html=analyticsReport(result,stress);
 assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Salvar PDF/);
 const json=JSON.parse(analyticsJson(result,stress));assert.equal(json.input.rows.length,config.rows.length);assert.equal(json.evaluation[0].trainingEnd,result.evaluation[0].trainingEnd);
 assert.match(analyticsCsv(result),/"training_start","training_end"/);
});
test('invalid weights, dates, costs and history fail before returning partial results',()=>{
 for(const change of [{weights:[.9,.3,.2]},{feeBps:-1},{startDate:'2025-02-30'},{rows:[...config.rows].reverse()},{benchmarkIndex:12}])assert.throws(()=>analyzePortfolio({...config,...change}));
});

test('hosted analytics packages the source history, report and module worker without live-feed dependence',async()=>{
 const {default:worker}=await import('../worker/index.js');
 const page=await worker.fetch(new Request('https://risklab.test/analytics.html'));assert.equal(page.status,200);
 const html=await page.text();const encoded=html.match(/<script id="analytics-dataset" type="application\/json">([\s\S]*?)<\/script>/)[1];
 const data=JSON.parse(encoded);assert.ok(data.rows.length>600);assert.ok(data.rows.at(-1).date>='2026-10-28');assert.equal(data.source.kind,'bcb_returns');assert.match(html,/sandbox="allow-same-origin allow-modals"/);
 for(const path of ['analytics-app.mjs','analytics-viz.mjs','analytics-report.mjs','portfolio-analytics.mjs','portfolio-worker.mjs']){
  const asset=await worker.fetch(new Request('https://risklab.test/'+path));assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/text\/javascript/);
 }
});
