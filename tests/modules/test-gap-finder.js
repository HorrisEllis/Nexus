'use strict';
const assert = require('assert');
const { makeTestBus } = require('./_test-bus-helper');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

let _tables = { gaps: [] };
let _nextId = 1;
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../../cortex/memory/jaa-db', filename: '../../cortex/memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (t, fn, n) => (_tables[t] || []).filter(fn).slice(0, n || 999),
      insert: (t, r) => { const row = { ...r, id: r.id || _nextId++ }; (_tables[t] = _tables[t] || []).push(row); return row; },
      update: (t, where, values) => {
        let n = 0;
        _tables[t] = (_tables[t] || []).map(r => {
          if (Object.entries(where).every(([k, v]) => r[k] === v)) { n++; return { ...r, ...values }; }
          return r;
        });
        return n;
      },
      get: () => null, tail: () => [],
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const gapFinder = require('../../cortex/gap-finder');

function reset() { _tables = { gaps: [] }; _nextId = 1; }

test('T-001', 'high-severity anomaly creates a real gap and emits cortex.gap.found', () => {
  reset();
  const bus = makeTestBus();
  let found = null;
  bus.on('cortex.gap.found', (e) => { found = e; });
  gapFinder.init({ bus });
  bus.emit('anomaly.detected', { anomalyUuid: 'a1', type: 'timeout', severity: 'high' });
  assert.ok(found, 'expected cortex.gap.found');
  assert.strictEqual(found.payload.gap.type, 'timeout');
  assert.strictEqual(_tables.gaps.length, 1);
  gapFinder.stop();
});

test('T-002', 'low/medium severity anomalies do not create a gap', () => {
  reset();
  const bus = makeTestBus();
  let found = false;
  bus.on('cortex.gap.found', () => { found = true; });
  gapFinder.init({ bus });
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'low' });
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'medium' });
  assert.strictEqual(found, false);
  assert.strictEqual(_tables.gaps.length, 0);
  gapFinder.stop();
});

test('T-003', 'sigma.event.halt_risk creates a gap', () => {
  reset();
  const bus = makeTestBus();
  let found = null;
  bus.on('cortex.gap.found', (e) => { found = e; });
  gapFinder.init({ bus });
  bus.emit('sigma.event.halt_risk', { sigma: 0.85, type: 'bottleneck', reason: 'sustained high sigma' });
  assert.ok(found);
  assert.strictEqual(found.payload.gap.type, 'bottleneck');
  gapFinder.stop();
});

test('T-004', 'sigma.event.warning alone does not create a gap', () => {
  reset();
  const bus = makeTestBus();
  let found = false;
  bus.on('cortex.gap.found', () => { found = true; });
  gapFinder.init({ bus });
  bus.emit('sigma.event.warning', { sigma: 0.55, type: 'bottleneck' });
  assert.strictEqual(found, false);
  gapFinder.stop();
});

test('T-005', 'a second anomaly of the same type+source bumps occurrences instead of duplicating', () => {
  reset();
  const bus = makeTestBus();
  gapFinder.init({ bus });
  bus.emit('anomaly.detected', { anomalyUuid: 'a1', type: 'timeout', severity: 'high' });
  bus.emit('anomaly.detected', { anomalyUuid: 'a2', type: 'timeout', severity: 'critical' });
  assert.strictEqual(_tables.gaps.length, 1);
  assert.strictEqual(_tables.gaps[0].occurrences, 2);
  gapFinder.stop();
});

test('T-006', 'different fault types produce separate gaps, not merged', () => {
  reset();
  const bus = makeTestBus();
  gapFinder.init({ bus });
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'high' });
  bus.emit('anomaly.detected', { type: 'circuit_breaker', severity: 'high' });
  assert.strictEqual(_tables.gaps.length, 2);
  gapFinder.stop();
});

test('T-007', 'gap.found payload matches the exact { gap } shape liminal-space already reads', () => {
  reset();
  const bus = makeTestBus();
  let found = null;
  bus.on('cortex.gap.found', (e) => { found = e; });
  gapFinder.init({ bus });
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'high' });
  assert.ok(found.payload.gap, 'payload.gap must exist — matches event.payload?.gap || event.payload convention');
  assert.strictEqual(found.payload.gap.status, 'open');
  gapFinder.stop();
});

test('T-008', 'event with no type is ignored, not thrown', () => {
  reset();
  const bus = makeTestBus();
  gapFinder.init({ bus });
  assert.doesNotThrow(() => bus.emit('anomaly.detected', { severity: 'high' }));
  assert.strictEqual(_tables.gaps.length, 0);
  gapFinder.stop();
});

test('T-009', 'stop() removes all three listeners', () => {
  reset();
  const bus = makeTestBus();
  gapFinder.init({ bus });
  gapFinder.stop();
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'high' });
  bus.emit('sigma.event.halt_risk', { type: 'timeout' });
  assert.strictEqual(_tables.gaps.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
