'use strict';
const assert = require('assert');
process.env.NEXUS_PORT='0';
let passed=0,failed=0;
async function test(id,d,fn){try{await fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

const { createMastermind } = require('../../intelligence/mastermind.js');
const CausalGraph = require('../../intelligence/cfr/graph.js').CausalGraph;

function mk(chain){ return createMastermind({ jaaDB:{tail:()=>chain,query:()=>[],insert:()=>{},update:()=>{}}, getField:()=>({regime:'stable',coherence:.8,entropy:.2}), getCausalGraphClass:()=>CausalGraph }); }

(async () => {
  await test('T-001','detects a real recurring causal pattern (A→B→C ×3) via rfr2-bridge',async()=>{
    const chain=[];
    for(let g=0;g<3;g++){chain.push({uuid:'a'+g,id:'a'+g,type:'ollama.offline',ts:g*10});chain.push({uuid:'b'+g,id:'b'+g,type:'guardian.retry',ts:g*10+1,causedBy:'a'+g});chain.push({uuid:'c'+g,id:'c'+g,type:'gap.opened',ts:g*10+2,causedBy:'b'+g});}
    const r = await mk(chain).detectRecurringPatterns(300,{minChainLen:3,minOccurrences:2});
    assert.ok(r && r.ok);
    assert.strictEqual(r.patternsFound,1);
    assert.ok(r.patterns[0].sequence.includes('ollama.offline'));
    assert.strictEqual(r.patterns[0].occurrences,3);
  });
  await test('T-002','no recurring pattern (all distinct) → patternsFound 0, honest',async()=>{
    const chain=[{uuid:'x',id:'x',type:'one',ts:1},{uuid:'y',id:'y',type:'two',ts:2,causedBy:'x'}];
    const r = await mk(chain).detectRecurringPatterns(300,{minChainLen:3,minOccurrences:2});
    // graph too small (<3 nodes) → null, or found nothing → 0
    assert.ok(r === null || r.patternsFound === 0);
  });
  await test('T-003','empty event_log → null, never throws',async()=>{
    const r = await mk([]).detectRecurringPatterns();
    assert.strictEqual(r,null);
  });
  await test('T-004','existing analyze() still works — the wire is additive, not replacing',async()=>{
    const chain=[{uuid:'a',id:'a',type:'x',ts:1}];
    const r = mk(chain).analyze('status',null);
    assert.ok(r.ok && 'analysis' in r);
  });
  console.log(`\n  mastermind-fractals: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
