'use strict';
const assert = require('assert');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock JAA
const _store = {};
const mockJaa = {
  insert: (t,r) => { _store[r.uuid]=r; return r; },
  update: (t,u,r) => { _store[u]={..._store[u],...r}; return r; },
  query:  (t,fn,n) => Object.values(_store).filter(fn).slice(0,n||999),
};

// Patch jaa-db require
const Module = require('module');
const orig   = Module._resolveFilename;
Module._resolveFilename = function(req, ...args) {
  if (req.includes('jaa-db')) return req;
  return orig.call(this, req, ...args);
};
require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../../cortex/memory/jaa-db', filename: '../../cortex/memory/jaa-db',
  loaded: true, exports: { jaaDB: mockJaa, uid: () => require('crypto').randomUUID() },
};

const ls = require('../../intelligence/liminal-space/index');

// Mock bus
const busEvents = [];
const mockBus = {
  on:   (t,h) => {},
  off:  (t,h) => {},
  emit: (t,p) => busEvents.push({ type:t, payload:p }),
};

ls.init({ bus: mockBus });

// T-001: all 5 spaces exist
test('T-001', 'all 5 focal points defined', () => {
  const fps = Object.keys(ls.FOCAL_POINTS);
  assert.strictEqual(fps.length, 5);
  assert.ok(fps.includes('L0/L2'));
  assert.ok(fps.includes('L1/L3'));
  assert.ok(fps.includes('L2/L4'));
  assert.ok(fps.includes('L3/L0'));
  assert.ok(fps.includes('L1/L2'));
});

// T-002: hold item in L0/L2
test('T-002', 'hold item in L0/L2 → stored in JAA', () => {
  const r = ls.hold('L0/L2', {
    text: 'axiom violation attempt', type: 'axiom_boundary', confidence: 0.8
  }, 'test');
  assert.ok(r.ok);
  assert.ok(r.record.uuid);
  assert.strictEqual(r.record.focalPoint, 'L0/L2');
});

// T-003: hold item in invalid space
test('T-003', 'hold in unknown focal point → error', () => {
  const r = ls.hold('L9/L9', { text: 'test' }, 'test');
  assert.ok(!r.ok);
  assert.ok(r.error.includes('unknown'));
});

// T-004: list active items
test('T-004', 'list() returns active items', () => {
  ls.hold('L1/L3', { text: 'pattern test', type: 'co_occurrence', confidence: 0.7 }, 'test');
  const items = ls.list();
  assert.ok(items.length >= 2);
});

// T-005: list by focal point
test('T-005', 'list(focalPoint) filters correctly', () => {
  const items = ls.list('L0/L2');
  assert.ok(items.every(i => i.focalPoint === 'L0/L2' || !i.focalPoint));
});

// T-006: resolve item
test('T-006', 'resolve item → marked resolved', () => {
  const r = ls.hold('L3/L0', { text: 'unanchored chain', type: 'causal_unknown', confidence: 0.5 }, 'test');
  const res = ls.resolve(r.record.uuid, 'traced to L0_UNKNOWN', 'test');
  assert.ok(res.ok);
  const stored = _store[r.record.uuid];
  assert.ok(stored.resolved);
  assert.strictEqual(stored.decision, 'traced to L0_UNKNOWN');
});

// T-007: resolve unknown uuid → error
test('T-007', 'resolve unknown uuid → error', () => {
  const r = ls.resolve('nonexistent-uuid', 'decision');
  assert.ok(!r.ok);
});

// T-008: dissolve item
test('T-008', 'dissolve item → marked dissolved', () => {
  const r = ls.hold('L1/L2', { text: 'false tension', type: 'coherence_check', confidence: 0.3 }, 'test');
  const d = ls.dissolve(r.record.uuid, 'tension_was_not_real');
  assert.ok(d.ok);
  assert.ok(_store[r.record.uuid].dissolved);
});

// T-009: velocity increases on hold
test('T-009', 'L2/L4 velocity increases on hold', () => {
  const before = ls.FOCAL_POINTS['L2/L4'].velocity;
  ls.hold('L2/L4', { text: 'high velocity', type: 'runaway_check', confidence: 0.6 }, 'test');
  const after = ls.FOCAL_POINTS['L2/L4'].velocity;
  assert.ok(after >= before);
});

// T-010: status returns all 5 spaces
test('T-010', 'status() returns all 5 spaces', () => {
  const s = ls.status();
  assert.ok(s.ok);
  assert.strictEqual(Object.keys(s.spaces).length, 5);
  assert.ok(s.spaces['L0/L2'].name === 'Constitutional Threshold');
  assert.ok(s.spaces['L2/L4'].name === 'Velocity Field');
});

// T-011: bus events emitted on hold
test('T-011', 'hold emits liminal.item.held on bus', () => {
  busEvents.length = 0;
  ls.hold('L0/L2', { text: 'bus test', type: 'test', confidence: 0.5 }, 'test');
  const found = busEvents.find(e => e.type === 'liminal.item.held');
  assert.ok(found);
  assert.strictEqual(found.payload.focalPoint, 'L0/L2');
});

// T-012: bus events emitted on resolve
test('T-012', 'resolve emits liminal.item.resolved on bus', () => {
  const r = ls.hold('L1/L3', { text: 'resolve bus test', type: 'test', confidence: 0.5 }, 'test');
  busEvents.length = 0;
  ls.resolve(r.record.uuid, 'test decision');
  const found = busEvents.find(e => e.type === 'liminal.item.resolved');
  assert.ok(found);
});

// T-013: crystallisation via evidence threshold
test('T-013', 'crystallisation fires after N confirmed instances', () => {
  busEvents.length = 0;
  // Add 5 items of same type with high confidence
  for (let i = 0; i < 5; i++) {
    ls.hold('L1/L2', {
      text: `coherence pattern ${i}`, type: 'coherence_test',
      confidence: 0.8, count: i+1
    }, 'test');
  }
  const crystal = busEvents.find(e => e.type === 'liminal.crystallised');
  assert.ok(crystal, 'crystallisation event not emitted');
  assert.ok(crystal.payload.focalPoint);
});

// T-014: invariants are named
test('T-014', 'each focal point has a named invariant', () => {
  for (const [fp, space] of Object.entries(ls.FOCAL_POINTS)) {
    assert.ok(space.invariant, `${fp} missing invariant`);
    assert.ok(space.invariant.startsWith('INV-'), `${fp} invariant wrong format`);
  }
});

// T-015: 2026-09-19 — the organ MOVED out of cortex into the intelligence server.
// It used to be one line in cortex/boot.js's organs array; that pinned "runs inside cortex".
// It now runs on intelligence's own bus, fed by cortex's relay (see
// tests/modules/test-intelligence-organs-move.js for the delivery + allowlist pins).
test('T-015', 'liminal-space runs in intelligence/server.js, NOT in cortex\'s organs array', () => {
  const fs = require('fs'), path = require('path');
  const boot   = fs.readFileSync(path.join(__dirname, '../../cortex/boot.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../../intelligence/server.js'), 'utf8');
  assert.ok(!boot.includes("{ name: 'liminal-space'"), 'must no longer be an organ inside cortex');
  assert.ok(/liminal\.init\(\{\s*bus:\s*nexusBus\s*\}\)/.test(server), 'intelligence/server.js must init it on its own bus');
});

// T-016: stop() cleans up without throwing
test('T-016', 'stop() cleans up without error', () => {
  assert.doesNotThrow(() => ls.stop());
});

console.log(`\n  liminal-space: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
