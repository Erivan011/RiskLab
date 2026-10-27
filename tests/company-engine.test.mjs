import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reconcileDisclosure,companyShock} from '../web/company-engine.mjs';
const data=JSON.parse(await readFile(new URL('../web/suzano-case.json',import.meta.url)));
test('2025 exposure reconciles exactly to the issuer disclosure, preserving BRL-thousands units',()=>{
 const r=reconcileDisclosure(data);
 assert.equal(r.assets,22457193);assert.equal(r.liabilities,-76114280);assert.equal(r.net,-53657087);assert.equal(r.reconciled,true);
 assert.equal(r.nonDerivativeNet,-54446657);assert.equal(r.derivativeFairValue,789570);
});
test('Common FX shock excludes derivative fair values; positive FX hurts net liabilities',()=>{
 const up=companyShock(data,.1),down=companyShock(data,-.1);
 assert.ok(Math.abs(up.accountingEffect+5444665.7)<1e-7);
 assert.ok(Math.abs(up.accountingEffect+down.accountingEffect)<1e-7);
 assert.equal(up.effects.length,6);
 assert.ok(up.effects.find(p=>p.id==='receivables').effect>0);
 assert.ok(up.effects.find(p=>p.id==='debt').effect<0);
});
test('A mismatched source stops scenarios; derivative valuations are never substituted for delta',()=>{
 const altered=structuredClone(data);altered.positions[0].value+=1;
 assert.equal(reconcileDisclosure(altered).reconciled,false);assert.throws(()=>companyShock(altered,.1));
 assert.throws(()=>companyShock(data,NaN));assert.throws(()=>companyShock(data,-1));
 assert.equal(companyShock(data,0).accountingEffect,0);
});
