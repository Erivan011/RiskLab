import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyticsMarket,defaultEvaluationStart} from '../web/analytics-market.mjs';
import {analyzePortfolio} from '../web/portfolio-analytics.mjs';
const snapshot=JSON.parse(readFileSync(new URL('../web/market-snapshot.json',import.meta.url)));
test('official 2026 prices feed returns, diagnostics and strictly earlier forecasts',()=>{
 const d=analyticsMarket(snapshot,new Date('2026-10-28T15:00:00Z'));
 assert.equal(defaultEvaluationStart(d),'2026-01-01');assert.equal(d.rows.at(-1).date,'2026-10-28');
 const a=analyzePortfolio({...d,weights:[.5,.3,.2],startDate:defaultEvaluationStart(d),endDate:d.rows.at(-1).date,window:252,confidence:.95,capital:10000,feeBps:5,policy:'daily',benchmarkIndex:0});
 assert.ok(a.observations>190);assert.equal(a.asOf,'2026-10-28');
 assert.ok(a.evaluation.every(e=>e.trainingEnd<e.date&&e.date>='2026-01-01'));
 const raw=snapshot.currencies.USD.points;assert.ok(Math.abs(d.rows.at(-1).values[0]-(raw.at(-1).value/raw.at(-2).value-1))<1e-14);
});
test('missing currency dates are intersected without forward fill and future prices are excluded',()=>{
 const d=structuredClone(snapshot);const removed=d.currencies.EUR.points.at(-2).date;d.currencies.EUR.points.splice(-2,1);
 const now=new Date('2026-10-28T02:00:00Z'),r=analyticsMarket(d,now);
 assert.ok(r.rows.every(p=>p.date<='2026-10-27'&&p.date!==removed));
 const last=r.rows.at(-1),usd=d.currencies.USD.points;const previous=r.rows.at(-2).date;
 assert.ok(Math.abs(last.values[0]-(usd.find(p=>p.date===last.date).value/usd.find(p=>p.date===previous).value-1))<1e-14);
});
test('partial and offline provenance remains explicit and invalid histories cannot replace results',()=>{
 const d=structuredClone(snapshot);d.status='partial';d.currencies.EUR.status='snapshot';
 const r=analyticsMarket(d);assert.equal(r.source.status,'partial');assert.match(r.source.disclosure,/partial/);
 d.currencies.EUR.points[2].value=-1;assert.throws(()=>analyticsMarket(d));
});
