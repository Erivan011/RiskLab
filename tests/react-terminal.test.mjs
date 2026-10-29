import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {slice,orders,suppliers,costBridge} from '../frontend/src/data.mjs';
const data=JSON.parse(readFileSync(new URL('../web/purchase-research.json',import.meta.url)));
test('React adapter reconciles full dataset and Shapley after currency/category/supplier cross-filter',()=>{
 for(const filter of [{},{currency:'USD'},{category:'Sensores'},{currency:'EUR',supplier:'Han River'}]){
  const s=slice(data,10,filter),r=orders(data,10,filter);
  assert.equal(s.cumOrders,r.length);
  assert.ok(Math.abs(s.cumBilled-r.reduce((a,r)=>a+r.billedBrl,0))<.001);
  assert.ok(Math.abs(s.cumVariance-s.fxEffect-s.volEffect-s.priceEffect-s.mixEffect)<1e-7);
  assert.ok(r.every(r=>(!filter.currency||r.currency===filter.currency)&&(!filter.category||r.category===filter.category)&&(!filter.supplier||r.supplier===filter.supplier)));
 }
});
test('Replay excludes later orders and censors unobserved delivery outcomes',()=>{
 const january=orders(data,1),s=slice(data,1);
 assert.equal(s.cumOrders,80);assert.ok(january.every(r=>r.orderDate<='2026-01-31'));
 for(const r of january){const source=data.rows.find(x=>x.id===r.poId);if(source.deliveryDate>'2026-01-31')assert.ok(!r.status.startsWith('DELIVERED'));}
 for(const r of suppliers(data,1))assert.ok(r.delivered<=r.totalOrders);
});
test('An empty recut remains finite and has no invented suppliers or orders',()=>{
 const f={supplier:'absent'};assert.equal(slice(data,10,f).cumBilled,0);assert.deepEqual(orders(data,10,f),[]);assert.deepEqual(suppliers(data,10,f),[]);
});
test('BRL has domestic purchases and outcomes but exactly zero FX attribution',()=>{
 const brl=slice(data,10,{currency:'BRL'}),r=orders(data,10,{currency:'BRL'});
 assert.equal(r.length,80);assert.ok(brl.cumBilled>0);assert.ok(brl.cumBudget>0);assert.ok(brl.deliveredCount>0);assert.equal(brl.fxEffect,0);assert.ok(r.every(r=>r.ptaxOrderDate===1&&r.ptaxInvoiceDate===1&&r.shapleyFxBrl===0));
});
test('All ten currencies and twenty countries have records and reconcile to full totals',()=>{
 const currencies=[...new Set(data.rows.map(r=>r.currency))],countries=[...new Set(data.rows.map(r=>r.country))];
 assert.equal(currencies.length,10);assert.equal(countries.length,20);
 for(const dim of ['currency','country']){
  const values=[...new Set(data.rows.map(r=>r[dim]))],slices=values.map(v=>slice(data,10,{[dim]:v}));
  assert.ok(slices.every(x=>x.cumOrders>0));
  assert.equal(slices.reduce((a,s)=>a+s.cumOrders,0),800);
  assert.ok(Math.abs(slices.reduce((a,s)=>a+s.cumBilled,0)-data.run.actualBrl)<.001);
 }
 assert.ok(new Set(data.rows.filter(r=>r.country==='China').map(r=>r.currency)).size>1);
});
test('Country/currency/category cross-filter constrains suppliers and order details',()=>{
 const f={country:'China',currency:'USD'},r=orders(data,10,f),s=slice(data,10,f);
 assert.ok(r.length>0);assert.ok(r.every(r=>r.country==='China'&&r.currency==='USD'));assert.equal(r.length,s.cumOrders);assert.ok(suppliers(data,10,f).every(s=>s.country==='China'));
});

test('Waterfall anchors negative FX and price effects to the preceding cost rather than zero',()=>{
 const bars=costBridge({budget:100,fx:-20,volume:10,price:-5,mix:2});
 assert.deepEqual(bars.slice(1,5).map(b=>[b.BaseInvisivel,b.Delta,b.signed]),[[80,20,-20],[80,10,10],[85,5,-5],[85,2,2]]);
 assert.equal(bars.at(-1).Delta,87);
 for(const c of data.currencies){const s=slice(data,10,{currency:c}),b=costBridge({budget:s.cumBudget,fx:s.fxEffect,volume:s.volEffect,price:s.priceEffect,mix:s.mixEffect});assert.ok(Math.abs(b.at(-1).Delta-s.cumBilled)<1e-7);}
});
