import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {editorialState} from '../design/editorial-model.mjs';
const demo=JSON.parse(await readFile(new URL('../web/trade-demo.json',import.meta.url)));
const input={operations:demo.operations,receipts:demo.receipts,asOf:demo.asOf,openingCashBrl:demo.openingCashBrl,rates:{USD:5.5,EUR:6.1,GBP:7.3},horizon:90};
test('editorial slider shocks USD only and keeps its source portfolio immutable',()=>{
 const before=JSON.stringify(input);const s=editorialState(input,.1);
 for(const row of s.analysis.rows.filter(r=>r.currency!=='USD'))assert.equal(row.shockImpactCents,0);
 assert.equal(before,JSON.stringify(input));assert.ok(s.fundingCents>=s.baseFundingCents);
});
test('full hypothetical USD cover removes the USD shock, not the operational deficit',()=>{
 const s=editorialState(input,.2),full=s.hedges.find(h=>h.coverage===100);
 assert.equal(full.analysis.shockImpactCents,0);assert.equal(full.costPoints[0],full.costPoints[2]);
 assert.ok(full.fundingCents>0);
});
test('standalone editorial is populated before JavaScript and has no unresolved build markers',async()=>{
 const html=await readFile(new URL('../web/editorial.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/__[A-Z_]+__/);assert.match(html,/<svg class="main-plot"[^>]+>[\s\S]*?<path/);
 assert.match(html,/1200/);assert.doesNotMatch(html,/<script[^>]*src=/);
});
test('share image is served as intact 1200 by 627 PNG bytes, including HEAD',async()=>{
 const {default:worker}=await import('../worker/index.js');
 const response=await worker.fetch(new Request('https://risklab.test/editorial-share.png'));
 assert.equal(response.headers.get('content-type'),'image/png');const bytes=Buffer.from(await response.arrayBuffer());
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),627);
 const head=await worker.fetch(new Request('https://risklab.test/editorial-share.png',{method:'HEAD'}));assert.equal((await head.arrayBuffer()).byteLength,0);
});
test('editorial is the public landing while the operational workspace remains reachable',async()=>{
 const {default:worker}=await import('../worker/index.js');
 const landing=await worker.fetch(new Request('https://risklab.test/'));
 const html=await landing.text();assert.match(html,/id="usd-shock"/);assert.match(html,/href="\.\/operations\.html"/);
 const operations=await worker.fetch(new Request('https://risklab.test/operations.html'));
 assert.equal(operations.status,200);assert.match(await operations.text(),/id="operations-table"/);
});
