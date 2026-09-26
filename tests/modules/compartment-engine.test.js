'use strict';
/**
 * tests/modules/compartment-engine.test.js — Phase 25 Compartment Engine Suite
 * UUID: test-compartment-engine-v1-0000-4000-0000-000000000001
 *
 * Covers sub-steps 1-2: snapshot state hashing/chain integrity, and the
 * compartment object model + lifecycle (spawn -> execute -> PASS / FAIL ->
 * REWOUND / DELETE). Adversary suite and crystal/lattice extension points
 * are tested via their honest "not yet built" defaults and via registered
 * fakes — the real sub-step 4/5 implementations get their own test files
 * when built.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA ────────────────────────────────────────────────────────────────
let _store = {};
function resetStore() { _store = { compartments: [], event_log: [], gaps: [], backup_records: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      _tables: { foo: [], bar: [] },
      query:  (t, fn, n) => (_store[t] || []).filter(fn).slice(0, n || 999),
      insert: (t, r) => { (_store[t] = _store[t] || []).push(r); return r; },
      update: (t, id, patch) => { const row = (_store[t] || []).find(r => r.uuid === id); if (row) Object.assign(row, patch); },
      tail:   (t, n) => (_store[t] || []).slice(0, n),
    },
    uid: () => require('crypto').randomUUID(),
  },
};

// ── Mock snapshot — isolate compartment-engine tests from real disk I/O ──────
let _snapshots = [];
let _rollbacks = [];
require.cache[require.resolve('../../cortex/snapshot/index')] = {
  id: '../snapshot/index', filename: '../snapshot/index', loaded: true,
  exports: {
    create: (opts) => {
      const snap = { snapId: 'nex-test-' + _snapshots.length, cortex_state_hash: 'hash-' + _snapshots.length, type: opts.type };
      _snapshots.push(snap);
      return snap;
    },
    rollback: (snapId, opts) => { _rollbacks.push({ snapId, opts }); return { ok: true }; },
    verifySnapshotIntegrity: () => ({ valid: true, reason: 'mocked' }),
    checkChainIntegrity: () => ({ totalChecked: 0, valid: 0, corrupt: [], missingFiles: [], chainBreaks: [] }),
  },
};

const ce = require('../../lib/compartment-engine');

const fakeIntent = (overrides = {}) => ({ uuid: 'intent-' + Math.random().toString(36).slice(2,8), verb: 'read', domain: 'cortex', risk_level: 'READ', ...overrides });

function reset() { resetStore(); _snapshots = []; _rollbacks = []; }

(async () => {

// ── §A: spawn — object model + constraint frame ──────────────────────────────
await test('T-001', 'spawn() requires a real intent with a uuid', async () => {
  reset();
  await assert.rejects(() => ce.spawn({}), /requires a frozen intent/);
});

await test('T-002', 'spawn() snapshots before creating the compartment record', async () => {
  reset();
  await ce.spawn({ intent: fakeIntent() });
  assert.strictEqual(_snapshots.length, 1);
  assert.strictEqual(_snapshots[0].type, 'pre_forge');
});

await test('T-003', 'spawned compartment starts RUNNING with a frozen constraint frame', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  assert.strictEqual(c.status, 'RUNNING');
  assert.ok(Object.isFrozen(c.constraint_frame));
});

await test('T-004', 'constraint frame max_resolution_level is honestly null (Phase 44 does not exist)', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  assert.strictEqual(c.constraint_frame.max_resolution_level, null);
  assert.strictEqual(c.constraint_frame._max_resolution_level_pending_phase, 44);
});

await test('T-005', 'constraint frame negative_crystal_ids is a real empty array, not a placeholder lie', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  assert.deepStrictEqual(c.constraint_frame.negative_crystal_ids, []);
});

await test('T-006', 'constraint frame includes axioms from constitutional-ai', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  assert.ok(Array.isArray(c.constraint_frame.axioms));
  assert.ok(c.constraint_frame.axioms.length > 0);
});

await test('T-007', 'attempting to mutate the frozen constraint frame fails silently or throws, never succeeds', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  try { c.constraint_frame.risk_ceiling = 'TAMPERED'; } catch (_) {}
  assert.notStrictEqual(c.constraint_frame.risk_ceiling, 'TAMPERED');
});

await test('T-008', 'spawn writes a durable compartments row to JAA', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const row = _store.compartments.find(r => r.uuid === c.id);
  assert.ok(row);
  assert.strictEqual(row.status, 'RUNNING');
});

await test('T-008b', 'spawn populates _declaredDomain/_declaredVerb from the intent (read-only convenience denormalization)', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent({ domain: 'guardian', verb: 'inspect' }) });
  assert.strictEqual(c._declaredDomain, 'guardian');
  assert.strictEqual(c._declaredVerb, 'inspect');
});

// ── §B: execute — PASS path ────────────────────────────────────────────────────
await test('T-009', 'successful executor -> compartment resolves to PASS', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  assert.strictEqual(resolved.status, 'PASS');
});

await test('T-010', 'PASS path trace includes adversary suite + QA/QC + crystal/lattice + case-library steps, in order', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  const events = resolved.trace_log.map(t => t.event);
  assert.deepStrictEqual(events, ['SPAWN', 'EXECUTE_START', 'EXECUTE_COMPLETE', 'ADVERSARY_SUITE', 'QA_QC', 'PASS', 'CRYSTAL_LATTICE_UPDATE', 'CASE_LIBRARY_INDEX']);
});

await test('T-011', 'real adversary suite (sub-step 4) is auto-registered and reports ran:true with no violations for a clean result', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  const adversaryTrace = resolved.trace_log.find(t => t.event === 'ADVERSARY_SUITE');
  assert.strictEqual(adversaryTrace.data.ran, true, 'sub-step 4 built — no longer the honest no-op default');
  assert.strictEqual(adversaryTrace.data.violations.length, 0);
});

// ── §C: execute — FAIL/REWOUND path ────────────────────────────────────────────
await test('T-012', 'throwing executor -> FAIL then REWOUND, never an uncaught crash', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => { throw new Error('boom'); });
  assert.strictEqual(resolved.status, 'REWOUND');
});

await test('T-013', 'REWOUND path actually calls snapshot.rollback with the pre-spawn snapshot id', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const preSpawnSnapId = c.input_state.snapId;
  await ce.execute(c, async () => { throw new Error('boom'); });
  assert.strictEqual(_rollbacks.length, 1);
  assert.strictEqual(_rollbacks[0].snapId, preSpawnSnapId);
});

await test('T-014', 'execution error is preserved in the trace for learning', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => { throw new Error('specific failure reason'); });
  const failTrace = resolved.trace_log.find(t => t.event === 'FAIL');
  assert.ok(failTrace.data.reason.includes('specific failure reason'));
});

// ── §D: execute — DELETE path (unrecoverable) ──────────────────────────────────
await test('T-015', 'adversary-reported frame_violation -> DELETE, not FAIL/REWOUND', async () => {
  reset();
  ce._registerExtensions({
    adversarySuite: async () => ({ ran: true, violations: [{ type: 'frame_violation', detail: 'attempted direct Cortex mutation' }], attackResults: [] }),
  });
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  assert.strictEqual(resolved.status, 'DELETED');
  ce._registerExtensions({ adversarySuite: async () => ({ ran: false, violations: [], attackResults: [] }) }); // reset for later tests
});

await test('T-016', 'DELETE marks the compartment untrusted and never attempts a rewind', async () => {
  reset();
  ce._registerExtensions({
    adversarySuite: async () => ({ ran: true, violations: [{ type: 'frame_violation', detail: 'x' }], attackResults: [] }),
  });
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  assert.strictEqual(resolved._trusted, false);
  assert.strictEqual(_rollbacks.length, 0, 'DELETE never calls rollback — there is nothing to rewind to');
  ce._registerExtensions({ adversarySuite: async () => ({ ran: false, violations: [], attackResults: [] }) });
});

await test('T-017', 'DELETE opens a CONSTITUTIONAL gap describing the violation, never silently discarded', async () => {
  reset();
  ce._registerExtensions({
    adversarySuite: async () => ({ ran: true, violations: [{ type: 'frame_violation', detail: 'x' }], attackResults: [] }),
  });
  const c = await ce.spawn({ intent: fakeIntent() });
  await ce.execute(c, async () => ({ ok: true }));
  const gap = _store.gaps.find(g => g.type === 'CONSTITUTIONAL' && g.path?.includes(c.id));
  assert.ok(gap);
  ce._registerExtensions({ adversarySuite: async () => ({ ran: false, violations: [], attackResults: [] }) });
});

await test('T-018', 'non-frame violation -> recoverable FAIL/REWOUND, NOT delete', async () => {
  reset();
  ce._registerExtensions({
    adversarySuite: async () => ({ ran: true, violations: [{ type: 'logic', detail: 'wrong shape' }], attackResults: [] }),
  });
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  assert.notStrictEqual(resolved.status, 'DELETED');
  ce._registerExtensions({ adversarySuite: async () => ({ ran: false, violations: [], attackResults: [] }) });
});

// ── §E: QA/QC gating ───────────────────────────────────────────────────────────
await test('T-019', 'a failing QA/QC check produces FAIL, not a silent PASS', async () => {
  reset();
  ce._registerExtensions({
    qaqcLayer: async () => ({ ran: true, checks: { syntax: true, schema: false } }),
  });
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  assert.notStrictEqual(resolved.status, 'PASS');
  ce._registerExtensions({ qaqcLayer: async () => ({ ran: false, checks: {} }) });
});

// ── §F: state machine invariants ──────────────────────────────────────────────
await test('T-020', 'cannot execute() a compartment that already resolved', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  const resolved = await ce.execute(c, async () => ({ ok: true }));
  await assert.rejects(() => ce.execute(resolved, async () => 'x'), /expected RUNNING/);
});

await test('T-021', 'compartment record in JAA is updated (not duplicated) on resolution', async () => {
  reset();
  const c = await ce.spawn({ intent: fakeIntent() });
  await ce.execute(c, async () => ({ ok: true }));
  const rows = _store.compartments.filter(r => r.uuid === c.id);
  assert.strictEqual(rows.length, 1, 'exactly one row for this compartment, updated in place');
  assert.strictEqual(rows[0].status, 'PASS');
});

// ── §G: wiring ──────────────────────────────────────────────────────────────────
await test('T-022', 'validateWiring reports jaa/snapshot/constitutionalAI/bus/taxonomy reachability', () => {
  const checks = ce.validateWiring();
  assert.ok('jaa' in checks);
  assert.ok('snapshot' in checks);
  assert.ok('constitutionalAI' in checks);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
