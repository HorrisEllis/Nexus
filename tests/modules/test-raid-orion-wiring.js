'use strict';
const assert = require('assert');
const { makeTestBus } = require('./_test-bus-helper');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const raid = require('../../cortex/core/raid');

test('T-001', 'cortex.orion.classified drives a real RAID decision and emits cortex.raid.decided', () => {
  const bus = makeTestBus();
  let decided = null;
  bus.on('cortex.raid.decided', (e) => { decided = e; });
  raid.init({ bus });
  bus.emit('cortex.orion.classified', {
    faultClass: 'nonexistent_fault_xyz', intent: 'remediate nonexistent_fault_xyz',
    context: { cfrRegime: 'stable', cfrSigmaFloor: 0, componentId: null, causedBy: 'a1', sessionId: 's1' },
  });
  assert.ok(decided, 'expected cortex.raid.decided');
  assert.strictEqual(decided.payload.faultClass, 'nonexistent_fault_xyz');
  assert.ok(decided.payload.decision, 'decision object must be present');
  // §AX-002 — _decide never returns nothing, per the module's own header comment
  assert.ok('agent' in decided.payload.decision || 'reason' in decided.payload.decision);
  raid.stop();
});

test('T-002', 'the decision is the real _decide() output, not a stub — same call produces the same shape as calling _decide directly', () => {
  const bus = makeTestBus();
  let decided = null;
  bus.on('cortex.raid.decided', (e) => { decided = e; });
  raid.init({ bus });

  const call = {
    prompt: 'remediate timeout', intent: 'remediate timeout', faultClass: 'timeout',
    context: { cfrRegime: 'stable', cfrSigmaFloor: 0, componentId: null, causedBy: 'a1', sessionId: 's1' },
  };
  const direct = raid._decide(call, raid._health, raid._weights);

  bus.emit('cortex.orion.classified', {
    faultClass: 'timeout', intent: 'remediate timeout',
    context: { cfrRegime: 'stable', cfrSigmaFloor: 0, componentId: null, causedBy: 'a1', sessionId: 's1' },
  });

  assert.deepStrictEqual(decided.payload.decision, direct);
  raid.stop();
});

test('T-003', 'classification with no faultClass is ignored, not thrown', () => {
  const bus = makeTestBus();
  let fired = false;
  bus.on('cortex.raid.decided', () => { fired = true; });
  raid.init({ bus });
  assert.doesNotThrow(() => bus.emit('cortex.orion.classified', { intent: 'no fault class here' }));
  assert.strictEqual(fired, false);
  raid.stop();
});

test('T-004', 'causedBy is carried through from classification to decision event (§9.6 session chain continuity)', () => {
  const bus = makeTestBus();
  let decided = null;
  bus.on('cortex.raid.decided', (e) => { decided = e; });
  raid.init({ bus });
  bus.emit('cortex.orion.classified', {
    faultClass: 'timeout', intent: 'remediate timeout',
    context: { causedBy: 'anomaly-uuid-123' },
  });
  assert.strictEqual(decided.payload.causedBy, 'anomaly-uuid-123');
  raid.stop();
});

test('T-005', 'stop() removes the listener — no further decisions after stop', () => {
  const bus = makeTestBus();
  let count = 0;
  bus.on('cortex.raid.decided', () => { count++; });
  raid.init({ bus });
  raid.stop();
  bus.emit('cortex.orion.classified', { faultClass: 'timeout', intent: 'x', context: {} });
  assert.strictEqual(count, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
