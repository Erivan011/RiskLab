import test from 'node:test';import assert from 'node:assert/strict';
import {liquidityBoundary,paymentLadder} from '../web/liquidity-analysis.mjs';
const input={operations:[{id:'A',supplier:'Test',currency:'USD',amount:100,hedgePercent:0,hedgeRate:5,budgetRate:5,localCostBrl:0,status:'open',dueDate:'2026-10-28'}],rates:{USD:5,EUR:6,GBP:7},asOf:'2026-10-27',openingCashBrl:550,receipts:[],horizon:30};
test('Reverse stress locates the first cash deficit with monetary rounding',()=>{const r=liquidityBoundary(input);assert.equal(r.status,'threshold');assert.ok(Math.abs(r.shock-.1)<.0001);assert.ok(r.analysis.minimumCashCents<0);});
test('No fictitious threshold for fully fixed exposure; existing shortfall is separate',()=>{assert.equal(liquidityBoundary({...input,operations:input.operations.map(r=>({...r,hedgePercent:100}))}).status,'not_reached');assert.equal(liquidityBoundary({...input,openingCashBrl:400}).status,'already_short');});
test('Payment ladder reconciles operations to each daily debit',()=>{const r=liquidityBoundary(input).analysis;for(const day of paymentLadder(r))assert.equal(day.scenarioCents,day.operations.reduce((v,r)=>v+r.scenarioCents,0));});
