'use strict';
const assert = require('assert');
const { createExpectationWatcher, DEFAULT_EXPECTATIONS } = require('../../copilot/lib/expectation-watcher.js');
const bus = require('../../nexus/nexus-bus.js');
let passed=0,failed=0;
async function test(id,d,fn){try{await fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

(async () => {
  await test('T-001','DEFAULT_EXPECTATIONS covers build/chunk/pipeline flows',()=>{
    const ids = DEFAULT_EXPECTATIONS.map(e=>e.id);
    assert.ok(DEFAULT_EXPECTATIONS.length >= 4);
    assert.ok(DEFAULT_EXPECTATIONS.some(e=>e.trigger.includes('chunk')||e.trigger.includes('pipeline')||e.trigger.includes('build')));
  });

  await test('T-002','fires copilot.error.detected when an expected follow-up never arrives (the core feature)',async()=>{
    let detected=null;
    const off = bus.on('copilot.error.detected', e=>{ const d=e.payload||e; if(d.expectationId==='unit-exp') detected=d; });
    createExpectationWatcher(bus,{expectations:[{id:'unit-exp',trigger:'unit.trigger',triggerMatch:()=>true,expect:'unit.done',expectMatch:()=>true,linkKey:d=>d.id,timeoutMs:200,message:d=>'no follow-up for '+d.id}]});
    bus.emit('unit.trigger',{id:'A'});
    await new Promise(r=>setTimeout(r,500));
    assert.ok(detected, 'should have detected the missing follow-up');
    assert.ok(detected.message.includes('A'));
    if(typeof off==='function') off();
  });

  await test('T-003','does NOT fire when the expected follow-up DOES arrive (no false positives)',async()=>{
    let detected=false;
    bus.on('copilot.error.detected', e=>{ const d=e.payload||e; if(d.expectationId==='unit-exp-2') detected=true; });
    const w = createExpectationWatcher(bus,{expectations:[{id:'unit-exp-2',trigger:'u2.trigger',triggerMatch:()=>true,expect:'u2.done',expectMatch:()=>true,linkKey:d=>d.id,timeoutMs:400,message:d=>'x'}]});
    bus.emit('u2.trigger',{id:'B'});
    setTimeout(()=>bus.emit('u2.done',{id:'B'}),100); // follow-up arrives in time
    await new Promise(r=>setTimeout(r,700));
    assert.strictEqual(detected,false,'should NOT fire when follow-up arrives on time');
  });

  console.log(`\n  expectation-watcher: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
