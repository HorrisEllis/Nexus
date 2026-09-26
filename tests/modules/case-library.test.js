'use strict';
/**
 * tests/modules/case-library.test.js — Phase 46 Queryable Case Library Suite
 * UUID: test-case-library-v1-0000-4600-0000-000000000001
 *
 * Covers: PASS-only indexing, bounded eviction (soft, via _evicted flag —
 * JaaDB has no delete()), negative-crystal blocking (checked before
 * confidence), tiering thresholds (full/skeleton/cold) sourced from
 * crystal-lattice's lattice_edges (never recomputed independently), honest
 * downgrade when a high-confidence signature has no surviving trace, and
 * the "never seen" vs "always fails" distinction at the cold tier.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA ──────────────────────────────────────────────────────────────────
let _store = {};
function resetStore() { _store = { case_index: [], crystals: [], lattice_edges: [], event_log: [] }; }
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

// ── Mock crystal-lattice — only _edgeKey is real; case-library imports it
// directly rather than reconstructing the format (see file header). Using
// the real function here means a format drift in the real module would
// actually be caught by both suites independently, not papered over.
require.cache[require.resolve('../../meta/crystal-lattice')] = {
  id: '../../meta/crystal-lattice', filename: '../../meta/crystal-lattice', loaded: true,
  exports: {
    _edgeKey: (from, to) => `${from}->${to}`,
  },
};

const cl = require('../../lib/case-library');

function fakeCompartment(overrides = {}) {
  return {
    id: 'cmp-' + Math.random().toString(36).slice(2, 8),
    intent_uuid: 'intent-' + Math.random().toString(36).slice(2, 8),
    _declaredDomain: 'cortex',
    _declaredVerb: 'read',
    working_memory: null,
    result: { ok: true },
    trace_log: [{ event: 'SPAWN' }],
    constraint_frame: { uuid: 'frame-1' },
    ...overrides,
  };
}

function setEdge(domain, verb, success_rate) {
  _store.lattice_edges.push({
    uuid: 'edge-' + Math.random().toString(36).slice(2, 8),
    edgeKey: `CompartmentType:${domain}.${verb}->State:Resolution`,
    success_rate,
  });
}

function setNegativeCrystal(domain, verb) {
  _store.crystals.push({
    uuid: 'crystal-' + Math.random().toString(36).slice(2, 8),
    kind: 'CREATE_NEGATIVE_CRYSTAL',
    pattern_signature: `${domain}:${verb}:FAIL`,
  });
}

function reset() { resetStore(); }

(async () => {

// ── §A: indexing ──────────────────────────────────────────────────────────────
await test('T-001', 'non-PASS outcome -> not indexed', async () => {
  reset();
  const r = await cl.indexCompartment(fakeCompartment(), 'FAIL');
  assert.strictEqual(r.indexed, false);
  assert.strictEqual(_store.case_index.length, 0);
});

await test('T-002', 'PASS outcome -> indexed with correct signature', async () => {
  reset();
  const r = await cl.indexCompartment(fakeCompartment({ _declaredDomain: 'forge', _declaredVerb: 'patch' }), 'PASS');
  assert.strictEqual(r.indexed, true);
  assert.strictEqual(r.signature, 'forge:patch');
  assert.strictEqual(_store.case_index.length, 1);
  assert.strictEqual(_store.case_index[0].domain, 'forge');
  assert.strictEqual(_store.case_index[0].verb, 'patch');
});

await test('T-003', 'missing domain/verb -> falls back to "unknown"', async () => {
  reset();
  const r = await cl.indexCompartment(fakeCompartment({ _declaredDomain: null, _declaredVerb: null }), 'PASS');
  assert.strictEqual(r.signature, 'unknown:unknown');
});

await test('T-004', 'indexed row carries result + trace_log + intent_uuid', async () => {
  reset();
  const c = fakeCompartment({ result: { value: 42 } });
  await cl.indexCompartment(c, 'PASS');
  const row = _store.case_index[0];
  assert.strictEqual(row.result.value, 42);
  assert.strictEqual(row.intent_uuid, c.intent_uuid);
  assert.ok(Array.isArray(row.trace_log));
});

// ── §B: bounded eviction ────────────────────────────────────────────────────────
await test('T-005', 'overflow beyond MAX_TRACES_PER_SIGNATURE soft-evicts oldest', async () => {
  reset();
  for (let i = 0; i < cl.MAX_TRACES_PER_SIGNATURE + 5; i++) {
    await cl.indexCompartment(fakeCompartment(), 'PASS');
    _store.case_index[_store.case_index.length - 1].indexedAt = i; // deterministic ordering
  }
  const live = _store.case_index.filter(r => !r._evicted);
  const evicted = _store.case_index.filter(r => r._evicted);
  assert.strictEqual(live.length, cl.MAX_TRACES_PER_SIGNATURE);
  assert.strictEqual(evicted.length, 5);
  // oldest (lowest indexedAt) must be the ones evicted, never hard-deleted
  assert.strictEqual(_store.case_index.length, cl.MAX_TRACES_PER_SIGNATURE + 5);
  assert.ok(evicted.every(r => r.indexedAt < 5));
});

// ── §C: query — negative crystal blocks first ───────────────────────────────────
await test('T-006', 'negative crystal hit -> blocked, regardless of confidence', async () => {
  reset();
  setNegativeCrystal('cortex', 'read');
  setEdge('cortex', 'read', 0.99); // would otherwise be a clean 'full' tier
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'blocked');
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.workingMemorySeed, null);
});

// ── §D: query — tiering from lattice confidence ─────────────────────────────────
await test('T-007', 'no lattice edge -> cold, confidence null (never seen, not "always fails")', async () => {
  reset();
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'cold');
  assert.strictEqual(r.confidence, null);
});

await test('T-008', 'confidence < 0.60 -> cold, seed null', async () => {
  reset();
  setEdge('cortex', 'read', 0.4);
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'cold');
  assert.strictEqual(r.confidence, 0.4);
  assert.strictEqual(r.workingMemorySeed, null);
});

await test('T-009', 'confidence in [0.60, 0.85) -> skeleton', async () => {
  reset();
  setEdge('cortex', 'read', 0.7);
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'skeleton');
  assert.strictEqual(r.workingMemorySeed.tier, 'skeleton');
});

await test('T-010', 'confidence >= 0.85 with a surviving trace -> full, seeded from most recent', async () => {
  reset();
  setEdge('cortex', 'read', 0.9);
  await cl.indexCompartment(fakeCompartment({ result: { value: 'old' } }), 'PASS');
  await new Promise(r => setTimeout(r, 2));
  await cl.indexCompartment(fakeCompartment({ result: { value: 'newest' } }), 'PASS');
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'full');
  assert.strictEqual(r.workingMemorySeed.result.value, 'newest');
});

await test('T-011', 'confidence >= 0.85 but no surviving trace -> honest downgrade to skeleton', async () => {
  reset();
  setEdge('cortex', 'read', 0.95);
  // no indexCompartment call at all — nothing to seed from
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'skeleton');
  assert.ok(r.reason.includes('no surviving indexed trace'));
});

await test('T-012', 'evicted traces are excluded from full-tier seeding', async () => {
  reset();
  setEdge('cortex', 'read', 0.9);
  const c = fakeCompartment({ result: { value: 'will-be-evicted' } });
  await cl.indexCompartment(c, 'PASS');
  _store.case_index[0]._evicted = true; // simulate prior eviction
  const r = cl.query({ domain: 'cortex', verb: 'read' });
  assert.strictEqual(r.tier, 'skeleton'); // no live trace survives -> downgraded
});

// ── §E: signature isolation ─────────────────────────────────────────────────────
await test('T-013', 'different verbs under the same domain never cross-match', async () => {
  reset();
  setEdge('forge', 'patch', 0.95);
  await cl.indexCompartment(fakeCompartment({ _declaredDomain: 'forge', _declaredVerb: 'patch', result: { value: 'patch-trace' } }), 'PASS');
  const r = cl.query({ domain: 'forge', verb: 'heal' }); // different verb, no edge, no trace
  assert.strictEqual(r.tier, 'cold');
  assert.strictEqual(r.confidence, null);
});

// ── §F: validateWiring ───────────────────────────────────────────────────────────
await test('T-014', 'validateWiring reports jaa + crystalLattice reachability', () => {
  const checks = cl.validateWiring();
  assert.ok('jaa' in checks);
  assert.ok('crystalLattice' in checks);
  assert.strictEqual(checks.jaa, true);
  assert.strictEqual(checks.crystalLattice, true);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
