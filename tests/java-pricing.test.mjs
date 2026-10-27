import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyJavaPrice} from '../web/java-pricing.mjs';
const row={currency:'USD',amount:1000,rate:5,hedgePercent:25,hedgeRate:4.8,localCostBrl:100,baselineCents:505000,scenarioCents:542500,shockImpactCents:37500};
test('Java reconciliation verifies all amounts and detects disagreement',async()=>{
 const fetcher=async(url,options)=>{assert.equal(url,'/api/java/price');assert.equal(new URLSearchParams(options.body).get('fixedFraction'),'0.25');return Response.json({engine:'java-bigdecimal',baseline:5050,stressed:5425,impact:375});};
 await verifyJavaPrice(row,.1,fetcher);
 await assert.rejects(verifyJavaPrice(row,.1,async()=>Response.json({engine:'java-bigdecimal',baseline:5050,stressed:5426,impact:376})),/Divergência/);
});
test('Java unavailable never pretends a successful comparison',async()=>{await assert.rejects(verifyJavaPrice(row,.1,async()=>new Response('',{status:503})),/não configurada/);});
