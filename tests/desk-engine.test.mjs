import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateDesk } from '../web/desk-engine.mjs';
const pack = JSON.parse(await readFile(new URL('../web/market-snapshot.json', import.meta.url)));
const series = Object.fromEntries(Object.entries(pack.currencies).map(([c,s])=>[c,s.points]));
const q=[50000,-25000,15000], shocks=[-.1,.1,-.1];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
test('Tail contributions reconcile exactly to portfolio ES for signed positions',()=>{
 const r=evaluateDesk(series,q,[0,0,0],shocks,10000);
 near(r.contributions.reduce((s,c)=>s+c.es,0), r.baseline.esBrl);
 assert.ok(r.tailCount>=1);
});
test('Idealized full coverage removes residual exposure, risk and scenario P&L',()=>{
 const r=evaluateDesk(series,q,[1,1,1],shocks,10000);
 near(r.residual.gross,0);near(r.residual.esBrl,0);near(r.residualPnl,0);
 assert.equal(r.reverseShock,null);
});
test('Uniform half coverage halves risk; unequal coverage reprices the portfolio',()=>{
 const r=evaluateDesk(series,q,[.5,.5,.5],shocks,10000);
 near(r.residual.esBrl,r.baseline.esBrl*.5);near(r.residualPnl,r.pnl*.5);
 const asymmetric=evaluateDesk(series,q,[1,0,0],shocks,10000);
 near(asymmetric.residual.positions[0].notional,0);
 near(asymmetric.residual.positions[1].notional,asymmetric.baseline.positions[1].notional);
});
test('Reverse stress hits the budget in the adverse direction of each residual position',()=>{
 const r=evaluateDesk(series,q,[.4,.2,.1],shocks,10000);
 const pnl=r.residual.positions.reduce((s,p,i)=>s+p.notional*r.reverseDirection[i]*r.reverseShock,0);
 near(pnl,-10000);
 near(r.matrix[2][2],r.residual.positions[2].notional*shocks[2]);
});
test('Invalid inputs fail; zero portfolio has no invented capacity or reduction',()=>{
 assert.throws(()=>evaluateDesk(series,q,[1.1,0,0],shocks,10000));
 assert.throws(()=>evaluateDesk(series,q,[0,0,0],shocks,0));
 const r=evaluateDesk(series,[0,0,0],[0,0,0],shocks,10000);
 assert.equal(r.reverseShock,null);assert.equal(r.esReduction,null);near(r.concentration,0);
});

test('Loss distribution conserves sample mass and includes both extremes',async()=>{
 const {lossHistogram}=await import('../web/desk-engine.mjs');
 const r=evaluateDesk(series,q,[0,0,0],shocks,10000);
 const bins=lossHistogram(r.baseline.losses);
 assert.equal(bins.reduce((s,b)=>s+b.count,0),r.baseline.observations);
 assert.ok(bins[0].count>0&&bins.at(-1).count>0);
 assert.equal(lossHistogram([0,0,0]).reduce((s,b)=>s+b.count,0),3);
 assert.throws(()=>lossHistogram([NaN]));
});
