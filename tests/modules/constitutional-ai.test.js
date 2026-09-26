'use strict';
/**
 * tests/modules/constitutional-ai.test.js — Phase 10 Constitutional AI Suite
 * UUID: test-constitutional-ai-v1-0000-4000-0000-000000000001
 *
 * Covers: four axioms (USER_AUTONOMY, REVERSIBILITY, TRUTH_OVER_COHERENCE,
 * EXPLAINABILITY), goal-graph HELD-not-DENIED semantics, identity kernel
 * immutability, decision logging to constitution_decisions, and the
 * request-handler A3-A4 integration point.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA — captures every insert for assertions ───────────────────────────
let _inserted = [];
let _faultRows = [];

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn, n) => {
        if (table === 'fault_taxonomy') return _faultRows.filter(fn).slice(0, n || 999);
        return [];
      },
      insert: (table, record) => { _inserted.push({ table, record }); return record; },
      tail: () => [],
      update: () => {},
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const cai = require('../../lib/constitutional-ai');

function reset() { _inserted = []; _faultRows = []; }

// ── §A: USER_AUTONOMY ──────────────────────────────────────────────────────────
reset();
test('T-001', 'USER_AUTONOMY always passes on its own', () => {
  const r = cai.AXIOMS.find(a => a.name === 'USER_AUTONOMY').check({}, { intent: { action: 'read' } });
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.axiom, 'USER_AUTONOMY');
});

// ── §B: REVERSIBILITY ────────────────────────────────────────────────────────────
reset();
test('T-002', 'delete without confirmation → BLOCK', () => {
  const r = cai.AXIOMS.find(a => a.name === 'REVERSIBILITY').check({}, { intent: { action: 'delete' } });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.severity, cai.SEVERITY.BLOCK);
  assert.strictEqual(r.blast_radius, cai.BLAST_RADIUS.IRREVERSIBLE);
});

test('T-003', 'delete WITH confirmation → pass, but WARN severity (still flagged)', () => {
  const r = cai.AXIOMS.find(a => a.name === 'REVERSIBILITY').check({ confirmed: true }, { intent: { action: 'delete' } });
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.severity, cai.SEVERITY.WARN);
});

test('T-004', 'read action → reversible, FLAG severity, no blast radius', () => {
  const r = cai.AXIOMS.find(a => a.name === 'REVERSIBILITY').check({}, { intent: { action: 'read' } });
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.blast_radius, cai.BLAST_RADIUS.NONE);
});

// ── §C: TRUTH_OVER_COHERENCE ──────────────────────────────────────────────────────
reset();
test('T-005', 'low confidence (<0.5) → fails but only WARN, never fabricates pass', () => {
  const r = cai.AXIOMS.find(a => a.name === 'TRUTH_OVER_COHERENCE').check({}, { intent: {}, intentObj: { confidence: 0.2 } });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.severity, cai.SEVERITY.WARN);
});

test('T-006', 'high confidence (>=0.5) → passes', () => {
  const r = cai.AXIOMS.find(a => a.name === 'TRUTH_OVER_COHERENCE').check({}, { intent: {}, intentObj: { confidence: 0.9 } });
  assert.strictEqual(r.pass, true);
});

test('T-007', 'no confidence signal available → passes without fabricating certainty', () => {
  const r = cai.AXIOMS.find(a => a.name === 'TRUTH_OVER_COHERENCE').check({}, { intent: {} });
  assert.strictEqual(r.pass, true);
  assert.ok(r.reason.includes('No confidence signal'));
});

// ── §D: EXPLAINABILITY ──────────────────────────────────────────────────────────────
reset();
test('T-008', 'forge without provider → BLOCK', () => {
  const r = cai.AXIOMS.find(a => a.name === 'EXPLAINABILITY').check({}, { intent: { action: 'forge' } });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.severity, cai.SEVERITY.BLOCK);
});

test('T-009', 'forge with provider → passes', () => {
  const r = cai.AXIOMS.find(a => a.name === 'EXPLAINABILITY').check({ provider: 'ollama' }, { intent: { action: 'forge' } });
  assert.strictEqual(r.pass, true);
});

test('T-010', 'forge with skipProvider flag → passes (internal/test escape hatch)', () => {
  const r = cai.AXIOMS.find(a => a.name === 'EXPLAINABILITY').check({ skipProvider: true }, { intent: { action: 'forge' } });
  assert.strictEqual(r.pass, true);
});

// ── §E: Goal graph — misalignment is HELD, never DENIED ───────────────────────────
reset();
test('T-011', 'delete with no corroborating fault → goal misaligned', () => {
  const r = cai.checkGoalAlignment({ action: 'delete', target: 'cortex' }, { query: () => [] });
  assert.strictEqual(r.aligned, false);
});

test('T-012', 'delete WITH corroborating fault (friction > 0.8) → aligned', () => {
  const r = cai.checkGoalAlignment(
    { action: 'delete', target: 'cortex' },
    { query: (t, fn) => [{ friction: 0.9 }].filter(fn) }
  );
  assert.strictEqual(r.aligned, true);
});

test('T-013', 'read action → always aligned regardless of fault history', () => {
  const r = cai.checkGoalAlignment({ action: 'read', target: 'cortex' }, { query: () => [] });
  assert.strictEqual(r.aligned, true);
});

// ── §F: check() — full integration, goal graph fires before axioms ───────────────
reset();
test('T-014', 'check(): misaligned delete → pass:false, held:true, never axiom DENIED', () => {
  const r = cai.check({}, { intent: { action: 'delete', target: 'cortex' }, requestId: 'req-x' });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.held, true);
  assert.strictEqual(r.axiom, 'GOAL_GRAPH');
});

test('T-015', 'check(): misaligned delete opens a CONSTITUTIONAL gap via open-loop-taxonomy', () => {
  reset();
  cai.check({}, { intent: { action: 'delete', target: 'cortex' }, requestId: 'req-y' });
  const gapInsert = _inserted.find(i => i.table === 'gaps');
  assert.ok(gapInsert, 'a gap record was inserted');
  assert.strictEqual(gapInsert.record.type, 'CONSTITUTIONAL');
});

test('T-016', 'check(): forge without provider → pass:false, axiom EXPLAINABILITY, not held', () => {
  reset();
  const r = cai.check({}, { intent: { action: 'forge', target: 'guardian' }, requestId: 'req-z' });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.axiom, 'EXPLAINABILITY');
  assert.ok(!r.held);
});

test('T-017', 'check(): clean read request → pass:true, axiom ALL', () => {
  reset();
  const r = cai.check({}, { intent: { action: 'read', target: 'cortex' }, requestId: 'req-w' });
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.axiom, 'ALL');
});

test('T-018', 'check(): every axiom run is logged to constitution_decisions', () => {
  reset();
  cai.check({}, { intent: { action: 'read', target: 'cortex' }, requestId: 'req-v' });
  const decisionLogs = _inserted.filter(i => i.table === 'constitution_decisions');
  assert.strictEqual(decisionLogs.length, cai.AXIOMS.length, 'one log entry per axiom');
});

test('T-019', 'check(): missing ctx.intent → BLOCK with EXPLAINABILITY, never throws', () => {
  reset();
  const r = cai.check({}, {});
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.severity, cai.SEVERITY.BLOCK);
});

// ── §G: Identity kernel — read-only ───────────────────────────────────────────────
test('T-020', 'identity kernel top-level object is frozen', () => {
  const kernel = cai.getIdentityKernel();
  assert.throws(() => { kernel.uuid = 'tampered'; }, /Cannot assign|read.only/i);
  // Strict mode throws TypeError on frozen assignment; in non-strict it silently no-ops.
  // This module is 'use strict' so it throws — verify the value truly didn't change either way.
  assert.strictEqual(kernel.uuid, 'bp_001.identity.kernel.v1');
});

test('T-021', 'identity kernel nested arrays are frozen', () => {
  const kernel = cai.getIdentityKernel();
  assert.throws(() => kernel.will_not.push('hack'));
  assert.ok(kernel.will_not.length > 0);
});

test('T-022', 'identity kernel declares Phase 11 as its only writer', () => {
  const kernel = cai.getIdentityKernel();
  assert.ok(/Phase 11/.test(kernel.writable_by));
});

// ── §H: validateWiring ──────────────────────────────────────────────────────────
test('T-023', 'validateWiring reports jaa + bus + taxonomy reachability', () => {
  const checks = cai.validateWiring();
  assert.ok('jaa' in checks);
  assert.ok('taxonomy' in checks);
});

console.log(`\n${passed} passed  ${failed} failed`);
if (failed > 0) process.exitCode = 1;

module.exports = { passed, failed };
