'use strict';
const assert = require('assert');
const { _estimateConfidence } = require('../../copilot/lifeline.js');
let passed=0,failed=0;
function test(id,d,fn){try{fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

test('T-001','a correct answer that explains an error is NOT penalized as low-confidence',()=>{
  const c = _estimateConfidence('The build failed because the path was wrong. This is the fix.','');
  // old code docked 0.2 for "failed"/"error" → ~0.45, forcing escalation
  assert.ok(c >= 0.55, `error-explanation should stay mid/high, got ${c}`);
});
test('T-002','a tool-grounded answer gets a real confidence floor (verifiable > guessed)',()=>{
  const c = _estimateConfidence('The timeout is 45000ms.','',{grounded:true});
  assert.ok(c >= 0.7, `grounded answer should have a 0.7 floor, got ${c}`);
});
test('T-003','ungrounded version of the same answer scores lower than grounded',()=>{
  const g = _estimateConfidence('The timeout is 45000ms.','',{grounded:true});
  const u = _estimateConfidence('The timeout is 45000ms.','');
  assert.ok(g > u, `grounded (${g}) should exceed ungrounded (${u})`);
});
test('T-004','self-reported failure is correctly LOW confidence (real uncertainty)',()=>{
  const c = _estimateConfidence('I could not determine the answer from the available information.','');
  assert.ok(c < 0.5, `self-reported failure should be low, got ${c}`);
});
test('T-005','grounding floor is not bypassed by hedging language',()=>{
  const c = _estimateConfidence('I think it might be around 45000ms, not sure.','',{grounded:true});
  assert.ok(c >= 0.7, `grounded floor should hold despite hedging, got ${c}`);
});
console.log(`\n  copilot-confidence: ${passed} passed, ${failed} failed\n`);
process.exit(failed>0?1:0);
