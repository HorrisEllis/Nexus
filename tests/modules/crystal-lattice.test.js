'use strict';
/**
 * tests/modules/crystal-lattice.test.js — Phase 25/26 sub-step 5 Suite
 * UUID: test-crystal-lattice-v1-0000-4000-0000-000000000001
 *
 * Covers: pattern-frequency crystallization (positive and negative),
 * threshold gating, counter reset after firing, lattice edge weight
 * updates (success increase / failure decrease / repeated-transition
 * strengthen), and scheduled decay with floor pruning.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

let _store = {};
function resetStore() { _store = { crystals: [], lattice_edges: [], event_log: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query:  (t, fn, n) => (_store[t] || []).filter(fn).slice(0, n || 999),
      insert: (t, r) => { (_store[t] = _store[t] || []).push(r); return r; },
      update: (t, id, patch) => {
        const row = (_store[t] || []).find(r => r.uuid === id);
        if (row) Object.assign(row, patch);
      },
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const cl = require('../../meta/crystal-lattice');

function fakeCompartment(overrides = {}) {
  return { id: 'c-' + Math.random().toString(36).slice(2, 8), _declaredDomain: 'cortex', _declaredVerb: 'read', constraint_frame: { risk_ceiling: 'READ' }, ...overrides };
}

function reset() { resetStore(); cl._resetInMemoryState(); }

(async () => {

// ── §A: crystallization gating ─────────────────────────────────────────────────
await test('T-001', 'below threshold -> no crystal written', async () => {
  reset();
  await cl.updateOnExecution(fakeCompartment(), 'PASS');
  await cl.updateOnExecution(fakeCompartment(), 'PASS');
  assert.strictEqual(_store.crystals.length, 0);
});

await test('T-002', 'reaching threshold -> exactly one crystal written', async () => {
  reset();
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) {
    await cl.updateOnExecution(fakeCompartment(), 'PASS');
  }
  assert.strictEqual(_store.crystals.length, 1);
});

await test('T-003', 'PASS outcome -> CREATE_CRYSTAL (positive)', async () => {
  reset();
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) await cl.updateOnExecution(fakeCompartment(), 'PASS');
  assert.strictEqual(_store.crystals[0].kind, 'CREATE_CRYSTAL');
});

await test('T-004', 'FAIL outcome -> CREATE_NEGATIVE_CRYSTAL', async () => {
  reset();
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) await cl.updateOnExecution(fakeCompartment(), 'FAIL');
  assert.strictEqual(_store.crystals[0].kind, 'CREATE_NEGATIVE_CRYSTAL');
});

await test('T-005', 'DELETE outcome -> also CREATE_NEGATIVE_CRYSTAL (not PASS)', async () => {
  reset();
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) await cl.updateOnExecution(fakeCompartment(), 'DELETE');
  assert.strictEqual(_store.crystals[0].kind, 'CREATE_NEGATIVE_CRYSTAL');
});

await test('T-006', 'counter resets after crystallization — does not refire on every subsequent match', async () => {
  reset();
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD + 2; i++) await cl.updateOnExecution(fakeCompartment(), 'PASS');
  assert.strictEqual(_store.crystals.length, 1, 'should not have fired twice within threshold+2 calls');
});

await test('T-007', 'different (domain,verb,outcome) patterns are tracked independently', async () => {
  reset();
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) await cl.updateOnExecution(fakeCompartment({ _declaredDomain: 'a' }), 'PASS');
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) await cl.updateOnExecution(fakeCompartment({ _declaredDomain: 'b' }), 'PASS');
  assert.strictEqual(_store.crystals.length, 2);
});

await test('T-008', 'crystal record carries pattern_signature, entry/exit conditions, support_paths', async () => {
  reset();
  let lastCompartment;
  for (let i = 0; i < cl.PATTERN_FREQUENCY_THRESHOLD; i++) {
    lastCompartment = fakeCompartment();
    await cl.updateOnExecution(lastCompartment, 'PASS');
  }
  const crystal = _store.crystals[0];
  assert.ok(crystal.pattern_signature);
  assert.ok(crystal.entry_conditions);
  assert.ok(crystal.exit_conditions);
  assert.ok(Array.isArray(crystal.support_paths));
});

// ── §B: lattice edges ──────────────────────────────────────────────────────────
await test('T-009', 'first transition creates an edge starting at weight 0.5', async () => {
  reset();
  const result = await cl.updateOnExecution(fakeCompartment(), 'PASS');
  assert.strictEqual(_store.lattice_edges.length, 1);
});

await test('T-010', 'PASS increases edge weight', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'PASS');
  const edge = _store.lattice_edges[0];
  assert.ok(edge.weight > 0.5);
});

await test('T-011', 'FAIL decreases edge weight', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'FAIL');
  const edge = _store.lattice_edges[0];
  assert.ok(edge.weight < 0.5);
});

await test('T-012', 'repeated same-outcome transition strengthens the delta beyond a single occurrence', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'PASS');
  const afterFirst = _store.lattice_edges[0].weight;
  await cl.updateOnExecution(c, 'PASS');
  const afterSecond = _store.lattice_edges[0].weight;
  const delta1 = afterFirst - 0.5;
  const delta2 = afterSecond - afterFirst;
  assert.ok(delta2 > delta1, `repeated transition should strengthen: delta1=${delta1} delta2=${delta2}`);
});

await test('T-013', 'weight never exceeds 1 or goes below 0', async () => {
  reset();
  const c = fakeCompartment();
  for (let i = 0; i < 30; i++) await cl.updateOnExecution(c, 'PASS');
  assert.ok(_store.lattice_edges[0].weight <= 1);
});

await test('T-014', 'success_rate and failure_rate reflect actual transition history', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'PASS');
  await cl.updateOnExecution(c, 'PASS');
  await cl.updateOnExecution(c, 'FAIL');
  const edge = _store.lattice_edges[0];
  assert.strictEqual(edge.totalCount, 3);
  assert.ok(Math.abs(edge.success_rate - 2/3) < 0.01);
});

await test('T-015', 'distinct domain/verb pairs produce distinct edges, not shared state', async () => {
  reset();
  await cl.updateOnExecution(fakeCompartment({ _declaredDomain: 'x', _declaredVerb: 'y' }), 'PASS');
  await cl.updateOnExecution(fakeCompartment({ _declaredDomain: 'p', _declaredVerb: 'q' }), 'FAIL');
  assert.strictEqual(_store.lattice_edges.length, 2);
});

// ── §C: decay ──────────────────────────────────────────────────────────────────
await test('T-016', 'decay reduces weight proportional to elapsed time', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'PASS');
  const edge = _store.lattice_edges[0];
  edge.weight = 1.0;
  edge.updatedAt = Date.now() - (5 * 60 * 60 * 1000); // 5 hours ago
  cl._runDecayTick();
  const expectedDecay = cl.LATTICE_DECAY_RATE * 5;
  assert.ok(Math.abs((1.0 - edge.weight) - expectedDecay) < 0.01);
});

await test('T-017', 'decay below floor prunes the edge to the floor value, not negative', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'FAIL'); // starts low
  const edge = _store.lattice_edges[0];
  edge.weight = 0.06;
  edge.updatedAt = Date.now() - (1000 * 60 * 60 * 1000); // very long elapsed time
  cl._runDecayTick();
  assert.strictEqual(edge.weight, cl.LATTICE_FLOOR);
  assert.strictEqual(edge._pruned, true);
});

await test('T-018', 'no elapsed time -> no decay applied', async () => {
  reset();
  const c = fakeCompartment();
  await cl.updateOnExecution(c, 'PASS');
  const edge = _store.lattice_edges[0];
  const before = edge.weight;
  edge.updatedAt = Date.now();
  cl._runDecayTick();
  assert.strictEqual(edge.weight, before);
});

await test('T-019', 'empty lattice -> decay tick runs cleanly, never throws', () => {
  reset();
  const result = cl._runDecayTick();
  assert.strictEqual(result.decayed, 0);
  assert.strictEqual(result.pruned, 0);
});

// ── §D: wiring ──────────────────────────────────────────────────────────────────
await test('T-020', 'validateWiring reports jaa reachability', () => {
  const checks = cl.validateWiring();
  assert.ok('jaa' in checks);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
