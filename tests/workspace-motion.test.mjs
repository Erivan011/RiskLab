import test from 'node:test';import assert from 'node:assert/strict';
import {easeOutCubic,motionValue} from '../web/workspace-motion.mjs';
test('motion interpolation is bounded and reaches the exact metric',()=>{for(const p of [-1,0,.1,.5,1,2]){const v=motionValue(10,40,p);assert.ok(v>=10&&v<=40);}assert.equal(motionValue(10,40,1),40);assert.equal(motionValue(40,10,1),10);assert.equal(easeOutCubic(-1),0);});
test('signed and zero chart geometry interpolate without NaN',()=>{assert.equal(motionValue(0,0,.5),0);assert.ok(Number.isFinite(motionValue(-30,20,.5)));assert.ok(motionValue(-30,20,.5)<=20);});
