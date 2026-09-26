'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock jaa with a controllable lattice
let _lattice = [];
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../../cortex/memory/jaa-db', filename: '../../cortex/memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn = () => true, n = 999) => table === 'user_lattice' ? _lattice.filter(fn).slice(0, n) : [],
      insert: () => ({}), update: () => ({}), get: () => null, tail: () => [],
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const um = require('../../copilot/lib/user-model');

function node(topic, confidence, links = {}, nodeType = 'topic') {
  return { uuid: topic + '-uuid', topic, nodeType, confidence, links, firstSeen: 1, lastSeen: 1 };
}

test('T-001', 'empty lattice returns honest empty, not a fabricated center', () => {
  _lattice = [];
  const r = um.radiate();
  assert.strictEqual(r.center, null);
  assert.strictEqual(r.nodes, 0);
});

test('T-002', 'activation propagates outward: a → b at a.act × link × b.confidence', () => {
  _lattice = [
    node('cortex', 0.8, { guardian: 0.5 }),
    node('guardian', 0.6, {}),
  ];
  const r = um.radiate('cortex');
  assert.strictEqual(r.rings[0][0].topic, 'cortex');
  assert.strictEqual(r.rings[0][0].activation, 0.8);
  assert.strictEqual(r.rings[1][0].topic, 'guardian');
  // 0.8 × 0.5 × 0.6 = 0.24
  assert.strictEqual(r.rings[1][0].activation, 0.24);
});

test('T-003', 'multiple paths to the same node: strongest wins, not summed', () => {
  _lattice = [
    node('center', 1.0, { a: 0.9, b: 0.2 }),
    node('a', 1.0, { target: 0.9 }),
    node('b', 1.0, { target: 0.9 }),
    node('target', 1.0, {}),
  ];
  const r = um.radiate('center');
  const target = r.rings[2].find(n => n.topic === 'target');
  // via a: 1.0×0.9×1.0=0.9 → then 0.9×0.9×1.0=0.81; via b: 0.2 → 0.18. Max = 0.81.
  assert.strictEqual(target.activation, 0.81);
});

test('T-004', 'cycles cannot loop — a node activates at most once', () => {
  _lattice = [
    node('a', 1.0, { b: 0.9 }),
    node('b', 1.0, { a: 0.9, c: 0.9 }),
    node('c', 1.0, { a: 0.9 }),
  ];
  const r = um.radiate('a', { depth: 10 });
  assert.strictEqual(r.nodes, 3); // a, b, c — never revisited despite the cycle
});

test('T-005', 'activation below min is cut', () => {
  _lattice = [
    node('a', 0.3, { weak: 0.1 }),
    node('weak', 0.3, {}),
  ];
  // 0.3 × 0.1 × 0.3 = 0.009 < default min 0.05 → cut
  const r = um.radiate('a');
  assert.strictEqual(r.nodes, 1);
  assert.strictEqual(r.rings.length, 1);
});

test('T-006', 'unknown center falls back to highest-confidence node and says so', () => {
  _lattice = [ node('low', 0.2), node('high', 0.9) ];
  const r = um.radiate('does-not-exist');
  assert.strictEqual(r.center, 'high');
  assert.strictEqual(r.centerWasFallback, true);
});

test('T-007', 'depth limits the number of rings', () => {
  _lattice = [
    node('a', 1.0, { b: 0.9 }),
    node('b', 1.0, { c: 0.9 }),
    node('c', 1.0, { d: 0.9 }),
    node('d', 1.0, {}),
  ];
  const r = um.radiate('a', { depth: 2 });
  assert.strictEqual(r.rings.length, 3); // center ring + 2
  assert.strictEqual(r.nodes, 3); // d never reached
});

test('T-008', 'deterministic — same lattice, same result (§14.2)', () => {
  _lattice = [
    node('cortex', 0.8, { guardian: 0.5, raid: 0.7 }),
    node('guardian', 0.6, { gaps: 0.4 }),
    node('raid', 0.7, {}),
    node('gaps', 0.5, {}),
  ];
  const r1 = um.radiate('cortex');
  const r2 = um.radiate('cortex');
  assert.deepStrictEqual(r1, r2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
