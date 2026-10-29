import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMarket,exploreSeries} from '../web/data-quality.mjs';
const series=[{date:'2026-01-02',value:5},{date:'2026-01-05',value:5.5},{date:'2026-01-06',value:5}];
const raw={currencies:Object.fromEntries(['USD','EUR','GBP'].map(s=>[s,{points:structuredClone(series)}]))};
test('audit rejects invalid and duplicate observations; first valid occurrence wins',()=>{const r=structuredClone(raw);r.currencies.USD.points.push({date:'2026-02-30',value:5},series[0]);const a=auditMarket(r);assert.equal(a.audits[0].invalid,1);assert.equal(a.audits[0].duplicates,1);assert.equal(a.rows.length,2);assert.ok(Math.abs(a.rows[0].values[0]-.1)<1e-10);});
test('missing dates are aligned without filling or labeling weekends as errors',()=>{const r=structuredClone(raw);r.currencies.EUR.points.splice(1,1);const a=auditMarket(r);assert.equal(a.excludedForAlignment,1);assert.equal(a.audits[1].missingOnUnion,1);assert.equal(a.rows.length,1);assert.equal(a.rows[0].values[0],0);});
test('histogram reconciles sample count and zero variance correlation is undefined',()=>{const a=auditMarket(raw);const s=exploreSeries(a.rows,0);assert.equal(s.bins.reduce((n,b)=>n+b.count,0),2);assert.ok(Math.abs(s.correlations[1]-1)<1e-10);assert.equal(exploreSeries([{date:'2026-01-01',values:[0,0,0]}],0).correlations[0],null);});
