'use strict';
const assert = require('assert');
const { createExpectationWatcher, DEFAULT_EXPECTATIONS } = require('../../copilot/lib/expectation-watcher.js');
const bus = require('../../nexus/nexus-bus.js');
let passed=0,failed=0;
async function test(id,d,fn){try{await fn();console.log(`  ✓ ${id} ${d}`);passed++;}catch(e){console.error(`  ✗ ${id} ${d}\n    ${e.message}`);failed++;}}

(async () => {
  await test('T-001','the ui-gated expectation is in DEFAULT_EXPECTATIONS',()=>{
    assert.ok(DEFAULT_EXPECTATIONS.some(e=>e.id==='ui-gated-interaction-then-effect'));
  });

  await test('T-002','a gated click whose effect NEVER fires is self-diagnosed',async()=>{
    let detected=null;
    bus.on('copilot.error.detected', e=>{ const d=e.payload||e; if(d.expectationId==='ui-gated-interaction-then-effect') detected=d; });
    const w = createExpectationWatcher(bus, { expectations: DEFAULT_EXPECTATIONS.filter(e=>e.id==='ui-gated-interaction-then-effect').map(e=>({...e,timeoutMs:200})) });
    // simulate tv-shell: a gated button activated, awaiting 'build.started', which never comes
    bus.emit('ui.interaction.gated', { elementId:'build-btn', awaiting:'build.started', ts:111 });
    await new Promise(r=>setTimeout(r,500));
    w.stop();
    assert.ok(detected, 'broken gated button should be diagnosed');
    assert.ok(detected.message.includes('build-btn') && detected.message.includes('build.started'));
  });

  await test('T-003','a gated click whose effect DOES fire is NOT diagnosed (no false positive)',async()=>{
    let detected=false;
    bus.on('copilot.error.detected', e=>{ const d=e.payload||e; if(d.triggerData?.elementId==='ok-btn') detected=true; });
    const w = createExpectationWatcher(bus, { expectations: DEFAULT_EXPECTATIONS.filter(e=>e.id==='ui-gated-interaction-then-effect').map(e=>({...e,timeoutMs:400})) });
    bus.emit('ui.interaction.gated', { elementId:'ok-btn', awaiting:'nav.changed', ts:222 });
    setTimeout(()=>bus.emit('nav.changed', { to:'cortex' }), 100); // the effect DOES fire
    await new Promise(r=>setTimeout(r,700));
    w.stop();
    assert.strictEqual(detected,false,'a working button must not be flagged');
  });

  await test('T-004','a broken interaction (handler throws) is diagnosed, naming the control (part_1b)',async()=>{
    let detected=null;
    bus.on('copilot.error.detected', e=>{ const d=e.payload||e; if(d.expectationId==='ui-interaction-error'&&d.triggerData?.elementId==='save-btn') detected=d; });
    const w = createExpectationWatcher(bus);
    bus.emit('ui.interaction.error', { elementId:'save-btn', kind:'click', error:'saveDoc is not defined', correlated:true, ts:Date.now() });
    await new Promise(r=>setTimeout(r,200)); w.stop();
    assert.ok(detected, 'thrown interaction should be diagnosed');
    assert.ok(detected.message.includes('save-btn') && detected.message.includes('saveDoc'));
  });

  await test('T-005','an async interaction rejection is diagnosed the same way',async()=>{
    let detected=null;
    bus.on('copilot.error.detected', e=>{ const d=e.payload||e; if(d.expectationId==='ui-interaction-error'&&d.triggerData?.elementId==='load-btn') detected=d; });
    const w = createExpectationWatcher(bus);
    bus.emit('ui.interaction.error', { elementId:'load-btn', kind:'click', error:'fetch failed: 500', correlated:true, ts:Date.now() });
    await new Promise(r=>setTimeout(r,200)); w.stop();
    assert.ok(detected && detected.message.includes('load-btn'));
  });

  console.log(`\n  ui-self-diagnosis: ${passed} passed, ${failed} failed\n`);
  process.exit(failed>0?1:0);
})();
