import test from 'node:test';
import assert from 'node:assert/strict';
import { treasuryStress, stressSurface, counterpartyConcentration, makeStressReport, fundingAttribution } from '../web/treasury-engine.mjs';
const row = {id:'A',supplier:'Acme',currency:'USD',amount:100,dueDate:'2026-11-10',budgetRate:5,localCostBrl:0,hedgePercent:0,hedgeRate:5,status:'open',country:'Brasil'};
const input = {operations:[row],rates:{USD:5,EUR:6,GBP:7},asOf:'2026-11-01',openingCashBrl:400,receipts:[{date:'2026-11-09',amountBrl:200}],horizon:30};
test('delayed receipts create temporary funding even when closing cash stays positive',()=>{
  const base=treasuryStress(input), delayed=treasuryStress(input,{delayDays:7});
  assert.equal(base.fundingCents,0);assert.equal(delayed.fundingCents,10000);
  assert.equal(delayed.analysis.closingCashCents,10000);assert.equal(delayed.minimumDay.date,'2026-11-10');
});
test('haircuts and late receipts reconcile the ledger to the cent',()=>{
  const stressed=treasuryStress(input,{delayDays:30,receiptHaircut:.125,fxShock:.1});
  assert.equal(stressed.inflowCents,0);assert.equal(stressed.deferredReceiptsCents,20000);
  assert.equal(stressed.fundingCents,15000);
  assert.equal(stressed.analysis.openingCashCents+stressed.inflowCents-stressed.outflowCents,stressed.analysis.closingCashCents);
  assert.equal(input.receipts[0].date,'2026-11-09');
});
test('surface is monotonic in adverse FX and receipt delays for this fixture',()=>{
  const cells=stressSurface(input);assert.equal(cells.length,20);
  for(let r=0;r<4;r++)for(let c=0;c<5;c++){
    if(c)assert.ok(cells[r*5+c].fundingCents>=cells[r*5+c-1].fundingCents);
    if(r)assert.ok(cells[r*5+c].fundingCents>=cells[(r-1)*5+c].fundingCents);
  }
});
test('a fully fixed FX position has no additional cash cost under a currency shock',()=>{
  const fixed={...input,operations:[{...row,hedgePercent:100}]};
  assert.equal(treasuryStress(fixed,{fxShock:.2}).outflowCents,treasuryStress(fixed).outflowCents);
});
test('supplier concentration aggregates repeated counterparties and handles zero exposure',()=>{
 const c=counterpartyConcentration([{supplier:'A',uncoveredBrl:60,id:'1'},{supplier:'A',uncoveredBrl:20,id:'2'},{supplier:'B',uncoveredBrl:20,id:'3'}]);
 assert.equal(c.suppliers[0].share,.8);assert.equal(c.suppliers[0].count,2);assert.ok(Math.abs(c.hhi-6800)<1e-8);
 assert.equal(counterpartyConcentration([]).hhi,0);
});
test('report captures inputs needed to reproduce results and rejects invalid assumptions',()=>{
 const report=makeStressReport(input,{fxShock:.1,delayDays:7},{USD:'2026-10-30'});
 assert.equal(report.results.fundingCents,15000);assert.equal(report.input.referenceDates.USD,'2026-10-30');
 for(const assumptions of [{fxShock:NaN},{delayDays:1.5},{delayDays:61},{receiptHaircut:.6}])assert.throws(()=>treasuryStress(input,assumptions));
});
test('past receipts remain in opening cash and are not brought back by a delay',()=>{
 const withPast={...input,receipts:[...input.receipts,{date:'2026-10-29',amountBrl:1000}]};
 assert.equal(treasuryStress(withPast,{delayDays:7}).inflowCents,20000);
});
test('receipt reconciliation uses per-flow cents, including fractional input',()=>{
 const fractional={...input,receipts:[{date:'2026-11-09',amountBrl:1.005},{date:'2026-11-09',amountBrl:1.005}]};
 assert.equal(treasuryStress(fractional).deferredReceiptsCents,0);
});
test('sequential funding attribution reconciles exactly across interacting risks',()=>{
 const a=fundingAttribution(input,{fxShock:.1,delayDays:7,receiptHaircut:.1});
 assert.equal(a.baseCents+a.steps.reduce((sum,s)=>sum+s.deltaCents,0),a.combinedCents);
 assert.equal(a.steps[0].deltaCents,0);assert.equal(a.steps[1].deltaCents,15000);
});
