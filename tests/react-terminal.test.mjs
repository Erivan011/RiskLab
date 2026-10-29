import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {slice,orders,suppliers} from '../frontend/src/data.mjs';
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
 assert.equal(s.cumOrders,48);assert.ok(january.every(r=>r.orderDate<='2026-01-31'));
 for(const r of january){const source=data.rows.find(x=>x.id===r.poId);if(source.deliveryDate>'2026-01-31')assert.ok(!r.status.startsWith('DELIVERED'));}
 for(const r of suppliers(data,1))assert.ok(r.delivered<=r.totalOrders);
});
test('An empty recut remains finite and has no invented suppliers or orders',()=>{
 const f={supplier:'absent'};assert.equal(slice(data,10,f).cumBilled,0);assert.deepEqual(orders(data,10,f),[]);assert.deepEqual(suppliers(data,10,f),[]);
});
