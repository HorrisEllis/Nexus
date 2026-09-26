'use strict';
const assert = require('assert');
const { LoomRegistry } = require('../../loom/schema/registry.js');
const os=require('os'),path=require('path'),fs=require('fs');
let passed=0,failed=0;
function test(id,d,fn){try{fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

function mk(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'loom-t-'));
  const r=new LoomRegistry({dataDir:dir});
  r.add('component',{id:'cortex',name:'cortex',produces:['memory','events']});
  r.add('component',{id:'copilot',name:'copilot',consumes:['memory']});
  r.add('component',{id:'guardian',name:'guardian',consumes:['events']});
  r.add('hook',{id:'cx.out',component_id:'cortex',type:'event',direction:'out'});
  r.add('hook',{id:'cp.in',component_id:'copilot',type:'event',direction:'in'});
  r.add('hook',{id:'gd.in',component_id:'guardian',type:'event',direction:'in'});
  r.add('wire',{id:'w1',from_hook_id:'cx.out',to_hook_id:'cp.in',intent:'copilot reads memory to answer with context'});
  r.add('wire',{id:'w2',from_hook_id:'cx.out',to_hook_id:'gd.in',intent:'guardian receives events to trigger builds'});
  return {r,dir};
}

test('T-001','graph() carries wire intent (was silently dropped before)',()=>{
  const {r,dir}=mk(); const g=r.graph();
  assert.ok(g.edges.every(e=>'intent' in e));
  assert.ok(g.edges.find(e=>e.id==='w1').intent.includes('memory'));
  fs.rmSync(dir,{recursive:true});
});
test('T-002','graph() carries component consumes/produces',()=>{
  const {r,dir}=mk(); const g=r.graph();
  assert.deepStrictEqual(g.components.find(c=>c.id==='cortex').produces,['memory','events']);
  fs.rmSync(dir,{recursive:true});
});
test('T-003','contextGraph() resolves wires to component-level relations with intent',()=>{
  const {r,dir}=mk(); const cg=r.contextGraph();
  const rel=cg.relations.find(x=>x.from==='cortex'&&x.to==='copilot');
  assert.ok(rel && rel.intent.includes('context'));
  fs.rmSync(dir,{recursive:true});
});
test('T-004','impactOf() reveals downstream dependents and broken intents',()=>{
  const {r,dir}=mk(); const imp=r.impactOf('cortex');
  const deps=imp.directDependents.map(d=>d.component).sort();
  assert.deepStrictEqual(deps,['copilot','guardian']);
  assert.strictEqual(imp.brokenIntents.length,2);
  fs.rmSync(dir,{recursive:true});
});
test('T-005','impactOf() of a leaf component (nothing depends on it) is empty, not an error',()=>{
  const {r,dir}=mk(); const imp=r.impactOf('copilot');
  assert.strictEqual(imp.directDependents.length,0);
  fs.rmSync(dir,{recursive:true});
});

console.log(`\n  loom-context-intent: ${passed} passed, ${failed} failed\n`);
process.exit(failed>0?1:0);
