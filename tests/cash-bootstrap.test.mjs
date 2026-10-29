import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateCash} from '../web/cash-bootstrap.mjs';
const input={asOf:'2026-10-26',horizon:10,openingCashBrl:500,receipts:[],rates:{USD:5,EUR:6,GBP:7},operations:[{status:'open',currency:'USD',amount:100,dueDate:'2026-11-02',localCostBrl:0}]};
const rows=Array.from({length:60},()=>({values:[.02,.01,.015]}));
test('full cover removes sampled FX risk and debits protection cost',()=>{const r=simulateCash({input,rows,coverage:100,premiumBps:100});assert.equal(r.premium,5);assert.equal(r.funding95,5);assert.equal(r.deficitProbability,1);assert.equal(r.band.at(-1).p05,r.band.at(-1).p95);});
test('seed reproduces research; no market change produces no shortfall',()=>{const flat=rows.map(()=>({values:[0,0,0]}));const a=simulateCash({input,rows:flat});assert.equal(a.funding95,0);assert.equal(a.deficitProbability,0);assert.deepEqual(a,simulateCash({input,rows:flat}));});
test('out of horizon and paid payments are excluded; receipts count on date',()=>{const r=simulateCash({input:{...input,receipts:[{date:'2026-10-26',amountBrl:1000}],operations:[...input.operations,{...input.operations[0],amount:1e6,dueDate:'2027-01-01'},{...input.operations[0],amount:1e6,status:'paid'}]},rows});assert.equal(r.deficitProbability,0);});
test('insufficient or invalid samples fail closed',()=>{assert.throws(()=>simulateCash({input,rows:[]}));assert.throws(()=>simulateCash({input,rows:rows.map(()=>({values:[NaN,0,0]}))}));});
