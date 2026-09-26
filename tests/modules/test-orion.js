'use strict';
const assert = require('assert');
const { makeTestBus } = require('./_test-bus-helper');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const orion = require('../../cortex/orion');

test('T-001', '_classify is pure — same input produces the same output', () => {
  const input = { type: 'timeout', severity: 'high', sessionId: 's1', anomalyUuid: 'a1', ts: 12345 };
  const r1 = orion._classify('anomaly.detected', input);
  const r2 = orion._classify('anomaly.detected', input);
  assert.deepStrictEqual(r1, r2);
});

test('T-002', 'classification shape matches RAID _decide\'s real call contract', () => {
  const r = orion._classify('anomaly.detected', { type: 'timeout', severity: 'high', sessionId: 's1', anomalyUuid: 'a1' });
  assert.strictEqual(r.faultClass, 'timeout');
  assert.ok(typeof r.intent === 'string');
  assert.ok('cfrRegime' in r.context);
  assert.ok('cfrSigmaFloor' in r.context);
  assert.ok('componentId' in r.context);
  assert.ok('causedBy' in r.context);
  assert.ok('sessionId' in r.context);
});

test('T-003', 'critical severity classifies cfrRegime as unstable', () => {
  const r = orion._classify('anomaly.detected', { type: 'timeout', severity: 'critical' });
  assert.strictEqual(r.context.cfrRegime, 'unstable');
});

test('T-004', 'high sigma (>=0.7) classifies cfrRegime as unstable even without critical severity', () => {
  const r = orion._classify('sigma.event.halt_risk', { type: 'bottleneck', sigma: 0.85 });
  assert.strictEqual(r.context.cfrRegime, 'unstable');
  assert.strictEqual(r.context.cfrSigmaFloor, 0.85);
});

test('T-005', 'low severity, low sigma stays stable', () => {
  const r = orion._classify('sigma.event.warning', { type: 'bottleneck', sigma: 0.55 });
  assert.strictEqual(r.context.cfrRegime, 'stable');
});

test('T-006', 'no type returns null — nothing fabricated from an empty payload', () => {
  assert.strictEqual(orion._classify('anomaly.detected', {}), null);
  assert.strictEqual(orion._classify('anomaly.detected', null), null);
});

test('T-007', 'componentId is honestly null, never fabricated', () => {
  const r = orion._classify('anomaly.detected', { type: 'timeout', severity: 'high' });
  assert.strictEqual(r.context.componentId, null);
});

test('T-008', 'anomaly.detected on the bus produces cortex.orion.classified', () => {
  const bus = makeTestBus();
  let classified = null;
  bus.on('cortex.orion.classified', (e) => { classified = e; });
  orion.init({ bus });
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'high', anomalyUuid: 'a1' });
  assert.ok(classified);
  assert.strictEqual(classified.payload.faultClass, 'timeout');
  orion.stop();
});

test('T-009', 'sigma.event.halt_risk on the bus produces cortex.orion.classified', () => {
  const bus = makeTestBus();
  let classified = null;
  bus.on('cortex.orion.classified', (e) => { classified = e; });
  orion.init({ bus });
  bus.emit('sigma.event.halt_risk', { type: 'bottleneck', sigma: 0.9 });
  assert.ok(classified);
  assert.strictEqual(classified.payload.faultClass, 'bottleneck');
  orion.stop();
});

test('T-010', 'sigma.event.warning is also classified (unlike gap-finder, which ignores warnings)', () => {
  const bus = makeTestBus();
  let classified = null;
  bus.on('cortex.orion.classified', (e) => { classified = e; });
  orion.init({ bus });
  bus.emit('sigma.event.warning', { type: 'bottleneck', sigma: 0.55 });
  assert.ok(classified, 'orion should classify warnings, unlike gap-finder');
  orion.stop();
});

test('T-011', 'event with no type produces no classification event', () => {
  const bus = makeTestBus();
  let fired = false;
  bus.on('cortex.orion.classified', () => { fired = true; });
  orion.init({ bus });
  bus.emit('anomaly.detected', { severity: 'high' });
  assert.strictEqual(fired, false);
  orion.stop();
});

test('T-012', 'stop() removes all three listeners', () => {
  const bus = makeTestBus();
  let count = 0;
  bus.on('cortex.orion.classified', () => { count++; });
  orion.init({ bus });
  orion.stop();
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'high' });
  assert.strictEqual(count, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
