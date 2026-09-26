'use strict';
const assert = require('assert');
const EventEmitter = require('events');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const cr = require('../../lib/consumer-registry');

function fakeJaa(rows) {
  return { query: (t, fn, n) => t === 'event_log' ? rows.slice(0, n || rows.length) : [] };
}

test('T-001', 'producers() mines source → event-type from the real event log shape', () => {
  cr.init({ jaa: fakeJaa([
    { source: 'guardian', type: 'job.done' },
    { source: 'guardian', type: 'job.done' },
    { source: 'guardian', type: 'job.failed' },
    { source: 'cortex',   type: 'gap.found' },
  ]) });
  const p = cr.producers();
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].source, 'guardian');
  assert.strictEqual(p[0].total, 3);
  assert.strictEqual(p[0].eventTypes[0].type, 'job.done');
  assert.strictEqual(p[0].eventTypes[0].count, 2);
});

test('T-002', 'consumers() reports live subscriber count from the real bus', () => {
  const bus = new EventEmitter();
  bus.on('gap.found', () => {});
  bus.on('gap.found', () => {});
  cr.init({ jaa: fakeJaa([]), bus });
  assert.strictEqual(cr.consumers('gap.found'), 2);
  assert.strictEqual(cr.consumers('nothing.listens'), 0);
});

test('T-003', 'CRITICAL (§1.2): no bus returns null, NOT 0 — "unknown" and "nobody" are different answers', () => {
  cr.init({ jaa: fakeJaa([]) }); // no bus
  assert.strictEqual(cr.consumers('anything'), null,
    'must return null when unobservable; returning 0 would falsely report every hook as dormant');
});

test('T-004', 'unconsumed() refuses to guess without a bus — observed:false, empty list', () => {
  cr.init({ jaa: fakeJaa([{ source: 'a', type: 'x' }]) });
  const u = cr.unconsumed();
  assert.strictEqual(u.observed, false);
  assert.deepStrictEqual(u.types, [], 'must not claim types are unconsumed when it cannot see subscribers');
  assert.ok(/unobservable/.test(u.reason));
});

test('T-005', 'unconsumed() finds genuinely unsubscribed event types', () => {
  const bus = new EventEmitter();
  bus.on('heard', () => {});
  cr.init({ jaa: fakeJaa([
    { source: 'a', type: 'heard' },
    { source: 'a', type: 'ignored' },
  ]), bus });
  const u = cr.unconsumed();
  assert.strictEqual(u.observed, true);
  assert.deepStrictEqual(u.types, ['ignored'], 'only the unsubscribed type is reported');
});

test('T-006', 'graph() returns bidirectional edges with subscriber counts (§8.5)', () => {
  const bus = new EventEmitter();
  bus.on('job.done', () => {});
  cr.init({ jaa: fakeJaa([{ source: 'guardian', type: 'job.done' }]), bus });
  const g = cr.graph();
  assert.strictEqual(g.edges.length, 1);
  assert.strictEqual(g.edges[0].from, 'guardian');
  assert.strictEqual(g.edges[0].eventType, 'job.done');
  assert.strictEqual(g.edges[0].subscribers, 1);
});

test('T-007', 'an unreadable event log degrades to empty, not a throw (§1.2)', () => {
  cr.init({ jaa: { query: () => { throw new Error('store down'); } } });
  assert.doesNotThrow(() => cr.producers());
  assert.deepStrictEqual(cr.producers(), []);
});

test('T-008', 'health() reports whether consumers are observable at all', () => {
  cr.init({ jaa: fakeJaa([]) });
  assert.strictEqual(cr.health().canObserveConsumers, false);
  cr.init({ jaa: fakeJaa([]), bus: new EventEmitter() });
  assert.strictEqual(cr.health().canObserveConsumers, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
