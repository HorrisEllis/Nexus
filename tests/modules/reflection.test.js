'use strict';
/**
 * tests/modules/reflection.test.js — Phase 11 Reflection Engine Suite
 * UUID: test-reflection-v1-0000-4000-0000-000000000001
 *
 * Covers: deterministic satisfaction scoring, decision_log row updates
 * (in-place, never duplicated), streak tracking → KNOWLEDGE/CAPABILITY gap
 * opening, RAID feedback aggregation (read-only, never mutates RAID),
 * identity-evidence accumulation gated to CONSTITUTIONAL gaps only (never a
 * direct kernel write), and lifecycle (init/stop/getState/validateWiring).
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA ────────────────────────────────────────────────────────────────
let _decisionLog = [];
let _eventLog = [];
let _gaps = [];
let _updates = [];

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn, n) => {
        if (table === 'decision_log') return _decisionLog.filter(fn).slice(0, n || 999);
        if (table === 'event_log')    return _eventLog.filter(fn).slice(0, n || 999);
        return [];
      },
      insert: (table, record) => {
        if (table === 'event_log') _eventLog.push(record);
        if (table === 'gaps')      _gaps.push(record);
        return record;
      },
      update: (table, id, patch) => {
        _updates.push({ table, id, patch });
        if (table === 'decision_log') {
          const row = _decisionLog.find(r => r.uuid === id);
          if (row) Object.assign(row, patch);
        }
      },
      tail: () => [],
    },
    uid: () => require('crypto').randomUUID(),
  },
};

// Mock BDA kernel — capture observeSignal calls without touching real ledger files.
let _bdaSignals = [];
require.cache[require.resolve('../../intelligence/bda/kernel')] = {
  id: '../intelligence/bda/kernel', filename: '../intelligence/bda/kernel', loaded: true,
  exports: {
    observeSignal: (args) => { _bdaSignals.push(args); return { signals: args.signals }; },
    observe: () => null,
    init: () => {},
    state: () => ({}),
  },
};

const refl = require('../../lib/reflection');

function reset() {
  _decisionLog = []; _eventLog = []; _gaps = []; _updates = []; _bdaSignals = [];
  refl._resetInMemoryState();
}

(async () => {

// ── §A: scoreDecision — deterministic, explainable ────────────────────────────
await test('T-001', 'executed with output → high score', () => {
  const r = refl.scoreDecision({ chosen: 'RESOLVED', outcome: 'executed', output: 'ok' });
  assert.strictEqual(r.score, 0.9);
});

await test('T-002', 'UNRESOLVED → low but non-zero (honest uncertainty, not failure)', () => {
  const r = refl.scoreDecision({ chosen: 'UNRESOLVED' });
  assert.ok(r.score > 0 && r.score < 0.5);
});

await test('T-003', 'HELD → mid score, not punished as failure', () => {
  const r = refl.scoreDecision({ chosen: 'HELD' });
  assert.ok(r.score >= 0.5);
});

await test('T-004', 'DENIED → mid-low, tracked but not zeroed', () => {
  const r = refl.scoreDecision({ chosen: 'DENIED' });
  assert.ok(r.score > 0 && r.score < 0.5);
});

await test('T-005', 'unknown shape → neutral default, never fabricated confidence', () => {
  const r = refl.scoreDecision({});
  assert.strictEqual(r.score, 0.5);
});

// ── §B: runReflectionPass — scoring + in-place update ─────────────────────────
reset();
await test('T-006', 'scores all unscored rows, updates in place (no duplication)', async () => {
  _decisionLog = [
    { uuid: 'd1', requestId: 'r1', chosen: 'RESOLVED', outcome: 'executed', output: 'ok', actor: 'request-handler', input: 'x', satisfaction: null },
  ];
  const before = _decisionLog.length;
  await refl.runReflectionPass();
  assert.strictEqual(_decisionLog.length, before, 'no new rows created');
  assert.strictEqual(_decisionLog[0].satisfaction, 0.9);
});

await test('T-007', 'already-scored rows are left alone on next pass', async () => {
  reset();
  _decisionLog = [{ uuid: 'd1', chosen: 'RESOLVED', outcome: 'executed', output: 'ok', actor: 'rh', input: 'x', satisfaction: null }];
  await refl.runReflectionPass();
  const firstUpdateCount = _updates.length;
  const r2 = await refl.runReflectionPass();
  assert.strictEqual(r2.scored, 0);
  assert.strictEqual(_updates.length, firstUpdateCount, 'no additional update calls on already-scored rows');
});

await test('T-008', 'scored decisions are forwarded to BDA as reflection-role signals', async () => {
  reset();
  _decisionLog = [{ uuid: 'd1', chosen: 'RESOLVED', outcome: 'executed', output: 'ok', actor: 'rh', input: 'x', satisfaction: null }];
  await refl.runReflectionPass();
  assert.strictEqual(_bdaSignals.length, 1);
  assert.strictEqual(_bdaSignals[0].role, 'reflection');
  assert.strictEqual(_bdaSignals[0].signals.valence, 0.9);
});

// ── §C: streak tracking → gap opening ─────────────────────────────────────────
await test('T-009', '3 consecutive UNRESOLVED of same class → KNOWLEDGE gap opened', async () => {
  reset();
  _decisionLog = [
    { uuid: 'd1', requestId: 'r1', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'd2', requestId: 'r2', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'd3', requestId: 'r3', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
  ];
  await refl.runReflectionPass();
  const knowledgeGap = _gaps.find(g => g.type === 'KNOWLEDGE');
  assert.ok(knowledgeGap, 'a KNOWLEDGE gap was opened');
});

await test('T-010', 'streak resets after gap opens — does not refire every tick', async () => {
  reset();
  _decisionLog = [
    { uuid: 'd1', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'd2', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'd3', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
  ];
  await refl.runReflectionPass();
  const gapsAfterFirst = _gaps.length;
  // Re-mark as unscored and run again — without 3 NEW low-satisfaction decisions, no new gap.
  _decisionLog.forEach(r => r.satisfaction = null);
  await refl.runReflectionPass();
  assert.strictEqual(_gaps.length, gapsAfterFirst, 'no duplicate gap from re-scoring the same already-counted streak window');
});

await test('T-011', 'mixed satisfaction (no streak) → no gap opened', async () => {
  reset();
  _decisionLog = [
    { uuid: 'd1', chosen: 'RESOLVED', outcome: 'executed', output: 'ok', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'd2', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'd3', chosen: 'RESOLVED', outcome: 'executed', output: 'ok', actor: 'rh', input: 'x', satisfaction: null },
  ];
  await refl.runReflectionPass();
  assert.strictEqual(_gaps.length, 0);
});

// ── §D: RAID feedback — read-only aggregation ─────────────────────────────────
await test('T-012', 'aggregates user.satisfied events by cluster:agent, never mutates RAID', async () => {
  reset();
  _eventLog = [
    { type: 'user.satisfied', payload: { agent: 'ollama', cluster: 'forge', satisfied: true } },
    { type: 'user.satisfied', payload: { agent: 'ollama', cluster: 'forge', satisfied: false } },
  ];
  const r = await refl.runReflectionPass();
  assert.ok(Array.isArray(r.raidFeedback));
  const entry = r.raidFeedback.find(x => x.key === 'forge:ollama');
  assert.strictEqual(entry.total, 2);
  assert.strictEqual(entry.satisfactionRate, 0.5);
});

await test('T-013', 'no user.satisfied events → raidFeedback is null, not an error', async () => {
  reset();
  const r = await refl.runReflectionPass();
  assert.strictEqual(r.raidFeedback, null);
});

// ── §E: identity evidence accumulation — gated, never a direct write ─────────────
await test('T-014', 'below threshold → no gap opened yet', () => {
  reset();
  for (let i = 0; i < 5; i++) refl.trackIdentityEvidence('test-observation-A', 'evidence item');
  assert.strictEqual(_gaps.length, 0);
});

await test('T-015', 'crossing threshold → exactly one CONSTITUTIONAL gap, never a kernel write', () => {
  reset();
  let reached = false;
  for (let i = 0; i < 10; i++) reached = refl.trackIdentityEvidence('test-observation-B', 'evidence item ' + i);
  assert.strictEqual(reached, true);
  const constGap = _gaps.find(g => g.type === 'CONSTITUTIONAL' && g.path === 'reflection/identity-kernel-proposal');
  assert.ok(constGap);
  assert.ok(/Human.*review/.test(constGap.closure_condition), 'closure requires human review, never automatic');
});

// §PHASE-31 — grammar misfire tracking (seam-component-registry-spec.md
// adjacent work: "3 misfires on same pattern → Idearium review")
await test('T-016a', '3 consecutive low-satisfaction decisions on the SAME grammarComponentId → CAPABILITY gap tagged reviewTarget:idearium', async () => {
  reset();
  _decisionLog = [
    { uuid: 'g1', requestId: 'r1', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null, grammarComponentId: 'cortex.gaps.list', grammarConfidence: 0.95 },
    { uuid: 'g2', requestId: 'r2', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null, grammarComponentId: 'cortex.gaps.list', grammarConfidence: 0.95 },
    { uuid: 'g3', requestId: 'r3', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null, grammarComponentId: 'cortex.gaps.list', grammarConfidence: 0.95 },
  ];
  await refl.runReflectionPass();
  const misfireGap = _gaps.find(g => g.path === 'reflection/grammar:cortex.gaps.list');
  assert.ok(misfireGap, 'a grammar-misfire gap was opened, keyed to the specific componentId');
  assert.strictEqual(misfireGap.type, 'CAPABILITY');
  assert.strictEqual(misfireGap.reviewTarget, 'idearium');
});

await test('T-016b', 'low-satisfaction decisions on DIFFERENT grammarComponentIds do not combine into one streak', async () => {
  reset();
  _decisionLog = [
    { uuid: 'h1', requestId: 'r1', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null, grammarComponentId: 'cortex.gaps.list', grammarConfidence: 0.95 },
    { uuid: 'h2', requestId: 'r2', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null, grammarComponentId: 'cortex.memory.write', grammarConfidence: 0.95 },
    { uuid: 'h3', requestId: 'r3', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null, grammarComponentId: 'cortex.gaps.list', grammarConfidence: 0.95 },
  ];
  await refl.runReflectionPass();
  const misfireGap = _gaps.find(g => (g.path || '').startsWith('reflection/grammar:'));
  assert.ok(!misfireGap, 'two hits on cortex.gaps.list (with one unrelated component in between) must not reach a 3-streak');
});

await test('T-016c', 'a decision with no grammarComponentId still uses the generic chosen:actor class, unaffected by §PHASE-31 change', async () => {
  reset();
  _decisionLog = [
    { uuid: 'i1', requestId: 'r1', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'i2', requestId: 'r2', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
    { uuid: 'i3', requestId: 'r3', chosen: 'UNRESOLVED', outcome: 'UNRESOLVED', actor: 'rh', input: 'x', satisfaction: null },
  ];
  await refl.runReflectionPass();
  const knowledgeGap = _gaps.find(g => g.type === 'KNOWLEDGE');
  assert.ok(knowledgeGap, 'non-grammar UNRESOLVED streak still opens a KNOWLEDGE gap exactly as before this phase');
  assert.strictEqual(knowledgeGap.reviewTarget, undefined, 'non-grammar gaps must never get the idearium reviewTarget tag');
});

await test('T-016', 'accumulator resets after threshold — does not keep growing unbounded', () => {
  reset();
  for (let i = 0; i < 10; i++) refl.trackIdentityEvidence('test-observation-C', 'e' + i);
  const gapsAfterFirstThreshold = _gaps.length;
  for (let i = 0; i < 9; i++) refl.trackIdentityEvidence('test-observation-C', 'e' + i);
  assert.strictEqual(_gaps.length, gapsAfterFirstThreshold, '9 more items (below new threshold) should not open a second gap');
});

// ── §F: lifecycle ──────────────────────────────────────────────────────────────
await test('T-017', 'init/stop do not throw, interval is unref-safe', () => {
  refl.init({ pollMs: 999999 });
  refl.stop();
});

await test('T-018', 'getState returns streak and identity evidence snapshots', () => {
  reset();
  refl.trackIdentityEvidence('test-observation-D', 'e1');
  const state = refl.getState();
  assert.ok(Array.isArray(state.streaks));
  assert.ok(Array.isArray(state.identityEvidence));
  assert.ok(state.identityEvidence.find(x => x.observation === 'test-observation-D'));
});

await test('T-019', 'validateWiring reports jaa/bus/taxonomy/bda reachability', () => {
  const checks = refl.validateWiring();
  assert.ok('jaa' in checks);
  assert.ok('bda' in checks);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
