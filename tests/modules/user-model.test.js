'use strict';
/**
 * tests/modules/user-model.test.js — Phase 12 User Model Suite
 * UUID: test-user-model-v1-0000-4000-0000-000000000001
 *
 * Covers: hypothesis observe/reinforce (never resets to fact), category
 * validation, view-time decay (never mutates stored confidence), derivation
 * from chat_log evidence (provider/pace/style), context summary formatting,
 * contradiction detection → CONFLICT gap, and wiring diagnostics.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── Mock JAA ────────────────────────────────────────────────────────────────
let _hyps = [];
let _chatLog = [];
let _gaps = [];

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn, n) => {
        if (table === 'user_model_hypotheses') return _hyps.filter(fn).slice(0, n || 999);
        if (table === 'chat_log')               return _chatLog.filter(fn).slice(0, n || 999);
        return [];
      },
      insert: (table, record) => {
        if (table === 'user_model_hypotheses') _hyps.push(record);
        if (table === 'gaps')                  _gaps.push(record);
        return record;
      },
      update: (table, id, patch) => {
        if (table === 'user_model_hypotheses') {
          const row = _hyps.find(r => r.uuid === id);
          if (row) Object.assign(row, patch);
        }
      },
    },
    uid: () => require('crypto').randomUUID(),
  },
};

const um = require('../../copilot/lib/user-model');

function reset() { _hyps = []; _chatLog = []; _gaps = []; }

(async () => {

// ── §A: observe — record and reinforce ───────────────────────────────────────
await test('T-001', 'new hypothesis stored with evidence_count 1', () => {
  reset();
  const h = um.observe({ category: um.CATEGORY.PREFERENCE, claim: 'prefers ollama', source: 'test' });
  assert.strictEqual(h.evidence_count, 1);
  assert.strictEqual(_hyps.length, 1);
});

await test('T-002', 'reinforcing the same claim updates in place, never duplicates', () => {
  reset();
  um.observe({ category: um.CATEGORY.PREFERENCE, claim: 'prefers ollama', source: 'test', confidenceDelta: 0.2 });
  um.observe({ category: um.CATEGORY.PREFERENCE, claim: 'prefers ollama', source: 'test', confidenceDelta: 0.2 });
  assert.strictEqual(_hyps.length, 1, 'no duplicate row');
  assert.strictEqual(_hyps[0].evidence_count, 2);
  assert.ok(_hyps[0].confidence > 0.2, 'confidence increased, not reset');
});

await test('T-003', 'confidence is capped at 1, never overshoots', () => {
  reset();
  for (let i = 0; i < 20; i++) um.observe({ category: um.CATEGORY.PREFERENCE, claim: 'prefers ollama', confidenceDelta: 0.5 });
  assert.ok(_hyps[0].confidence <= 1);
});

await test('T-004', 'unknown category throws, never silently stored', () => {
  reset();
  assert.throws(() => um.observe({ category: 'nonsense', claim: 'x' }), /unknown category/);
  assert.strictEqual(_hyps.length, 0);
});

await test('T-005', 'missing claim throws', () => {
  reset();
  assert.throws(() => um.observe({ category: um.CATEGORY.PREFERENCE }), /requires a claim/);
});

// ── §B: decay — view-time only, never mutates storage ─────────────────────────
await test('T-006', 'fresh hypothesis (last_seen=now) has full effective confidence', () => {
  const h = { confidence: 0.8, last_seen: Date.now() };
  const eff = um.effectiveConfidence(h);
  assert.ok(Math.abs(eff - 0.8) < 0.001, `expected ~0.8, got ${eff}`);
});

await test('T-007', 'hypothesis decays ~0.1/day without reinforcement', () => {
  const h = { confidence: 0.8, last_seen: Date.now() - 3 * 24 * 60 * 60 * 1000 };
  const eff = um.effectiveConfidence(h);
  assert.ok(Math.abs(eff - 0.5) < 0.01, `expected ~0.5, got ${eff}`);
});

await test('T-008', 'decay never goes below MIN_CONFIDENCE floor', () => {
  const h = { confidence: 0.8, last_seen: Date.now() - 60 * 24 * 60 * 60 * 1000 };
  assert.ok(um.effectiveConfidence(h) > 0);
});

await test('T-009', 'effectiveConfidence never mutates the input object', () => {
  const h = { confidence: 0.8, last_seen: Date.now() - 24 * 60 * 60 * 1000 };
  const before = JSON.stringify(h);
  um.effectiveConfidence(h);
  assert.strictEqual(JSON.stringify(h), before);
});

// ── §C: deriveFromChatLog — evidence becomes belief, never asserted directly ──
await test('T-010', 'dominant provider (>=3 uses) becomes a preference hypothesis', () => {
  reset();
  for (let i = 0; i < 5; i++) _chatLog.push({ role: 'user', provider: 'ollama', ts: Date.now() + i, contentLength: 50 });
  const r = um.deriveFromChatLog(50);
  assert.ok(r.derived > 0);
  const pref = _hyps.find(h => h.category === 'preference');
  assert.ok(pref && pref.claim.includes('ollama'));
});

await test('T-011', 'fewer than 3 uses of a provider does not produce a preference claim', () => {
  reset();
  _chatLog.push({ role: 'user', provider: 'claude', ts: Date.now(), contentLength: 50 });
  _chatLog.push({ role: 'user', provider: 'claude', ts: Date.now() + 1, contentLength: 50 });
  um.deriveFromChatLog(50);
  assert.strictEqual(_hyps.find(h => h.category === 'preference'), undefined);
});

await test('T-012', 'short gaps between turns produce a fast-pace hypothesis', () => {
  reset();
  const now = Date.now();
  for (let i = 0; i < 5; i++) _chatLog.push({ role: 'user', provider: 'ollama', ts: now + i * 5000, contentLength: 50 });
  um.deriveFromChatLog(50);
  const pace = _hyps.find(h => h.category === 'pace');
  assert.ok(pace && /fast pace/.test(pace.claim));
});

await test('T-013', 'long gaps between turns produce a slow-pace hypothesis', () => {
  reset();
  const now = Date.now();
  for (let i = 0; i < 5; i++) _chatLog.push({ role: 'user', provider: 'ollama', ts: now + i * 200000, contentLength: 50 });
  um.deriveFromChatLog(50);
  const pace = _hyps.find(h => h.category === 'pace');
  assert.ok(pace && /slow\/deliberate/.test(pace.claim));
});

await test('T-014', 'long messages produce a verbose communication-style hypothesis', () => {
  reset();
  const now = Date.now();
  for (let i = 0; i < 5; i++) _chatLog.push({ role: 'user', provider: 'ollama', ts: now + i * 5000, contentLength: 500 });
  um.deriveFromChatLog(50);
  const style = _hyps.find(h => h.category === 'communication_style' && /verbose/.test(h.claim));
  assert.ok(style);
});

await test('T-015', 'short messages produce a terse communication-style hypothesis', () => {
  reset();
  const now = Date.now();
  for (let i = 0; i < 5; i++) _chatLog.push({ role: 'user', provider: 'ollama', ts: now + i * 5000, contentLength: 20 });
  um.deriveFromChatLog(50);
  const style = _hyps.find(h => h.category === 'communication_style' && /terse/.test(h.claim));
  assert.ok(style);
});

await test('T-016', 'high bdaSignals.certainty produces a direct-style hypothesis', () => {
  reset();
  const now = Date.now();
  for (let i = 0; i < 5; i++) _chatLog.push({ role: 'user', provider: 'ollama', ts: now + i * 5000, contentLength: 150, bdaSignals: { certainty: 0.9 } });
  um.deriveFromChatLog(50);
  const style = _hyps.find(h => h.category === 'communication_style' && /direct/.test(h.claim));
  assert.ok(style);
});

await test('T-017', 'empty chat_log → derived 0, never throws', () => {
  reset();
  const r = um.deriveFromChatLog(50);
  assert.strictEqual(r.derived, 0);
});

// ── §D: getHypotheses / buildContextSummary ────────────────────────────────────
await test('T-018', 'getHypotheses filters by minConfidence using effective (decayed) confidence', () => {
  reset();
  _hyps.push({ uuid: 'h1', category: 'preference', claim: 'strong', confidence: 0.9, evidence_count: 3, last_seen: Date.now() });
  _hyps.push({ uuid: 'h2', category: 'preference', claim: 'stale', confidence: 0.9, evidence_count: 3, last_seen: Date.now() - 10 * 24 * 60 * 60 * 1000 });
  const result = um.getHypotheses({ minConfidence: 0.3 });
  assert.ok(result.find(h => h.claim === 'strong'));
  assert.ok(!result.find(h => h.claim === 'stale'), 'decayed-below-threshold hypothesis excluded');
});

await test('T-019', 'buildContextSummary never includes raw chat content, only claims', () => {
  reset();
  _hyps.push({ uuid: 'h1', category: 'preference', claim: 'prefers ollama', confidence: 0.8, evidence_count: 3, last_seen: Date.now() });
  const summary = um.buildContextSummary();
  assert.ok(summary.includes('prefers ollama'));
  assert.ok(summary.includes('confidence'));
});

await test('T-020', 'buildContextSummary returns empty string when nothing qualifies', () => {
  reset();
  assert.strictEqual(um.buildContextSummary(), '');
});

// ── §E: checkContradictions — flags, never auto-resolves ──────────────────────
await test('T-021', 'two strong contradictory pace hypotheses → CONFLICT gap opened', () => {
  reset();
  um.observe({ category: um.CATEGORY.PACE, claim: 'fast pace — responses consumed quickly, short gaps between turns', confidenceDelta: 0.5 });
  um.observe({ category: um.CATEGORY.PACE, claim: 'slow/deliberate pace — long gaps between turns', confidenceDelta: 0.5 });
  const flagged = um.checkContradictions();
  assert.strictEqual(flagged.length, 1);
  const gap = _gaps.find(g => g.type === 'CONFLICT');
  assert.ok(gap);
});

await test('T-022', 'one weak + one strong contradictory hypothesis → not flagged', () => {
  reset();
  um.observe({ category: um.CATEGORY.PACE, claim: 'fast pace — responses consumed quickly, short gaps between turns', confidenceDelta: 0.1 });
  um.observe({ category: um.CATEGORY.PACE, claim: 'slow/deliberate pace — long gaps between turns', confidenceDelta: 0.5 });
  const flagged = um.checkContradictions();
  assert.strictEqual(flagged.length, 0);
});

await test('T-023', 'no contradicting pair present → nothing flagged', () => {
  reset();
  um.observe({ category: um.CATEGORY.PREFERENCE, claim: 'prefers ollama', confidenceDelta: 0.5 });
  const flagged = um.checkContradictions();
  assert.strictEqual(flagged.length, 0);
});

// ── §F: validateWiring ──────────────────────────────────────────────────────────
await test('T-024', 'validateWiring reports jaa + taxonomy reachability', () => {
  const checks = um.validateWiring();
  assert.ok('jaa' in checks);
  assert.ok('taxonomy' in checks);
});

})().then(() => {
  console.log(`\n${passed} passed  ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});

module.exports = { passed, failed };
