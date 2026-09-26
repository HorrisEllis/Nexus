'use strict';
/** AM4 (docs/agent-model-and-user-continuity-phasemap.spec) — the 'user'
 * tier + 'user_context' intent added to cortex/push-recall.js. Verifies
 * the new tier behaves like every other tier through the SAME generic
 * push()/recall() path (no special-cased code to test separately), and
 * specifically verifies the phasemap's own gate criterion: a fact pushed
 * in one session is retrievable via recall() with intent:'user_context'
 * in a LATER session — proven with a real jaaDB-backed store, not the
 * in-memory default, since in-memory wouldn't demonstrate cross-session
 * durability at all (it'd trivially pass by never actually persisting).
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'push-recall-am4-'));
process.env.JAA_DATA_DIR = tmp;

const { CortexPushRecall, VALID_TIERS, INTENT_LANES, TIER_PULL_WEIGHT } =
  require(path.join(__dirname, '../../cortex/push-recall.js'));
const { jaaDB, uid } = require(path.join(__dirname, '../../cortex/memory/jaa-db.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

const TABLE = 'push_recall_am4_test';

/** A real jaaDB-backed store adapter matching the {insert, tail, all} shape
 * CortexPushRecall's constructor expects — jaaDB's own methods take a
 * table name as their first arg; this binds one fixed table to that shape,
 * the same adapter any real caller wiring this into a live process needs. */
function jaaStore() {
  return {
    insert: (row) => jaaDB.insert(TABLE, row),
    tail:   (n) => jaaDB.tail(TABLE, n),
    all:    () => jaaDB.query(TABLE, () => true, 10_000),
  };
}

test('AM4-001', "'user' is accepted as a valid tier", () => {
  const pr = new CortexPushRecall({ store: jaaStore() });
  const r = pr.push('James prefers async written updates over calls when possible.', ['preference'], 'user');
  assert.ok(r.id);
});

test('AM4-002', "VALID_TIERS/TIER_PULL_WEIGHT both know about 'user' — no silent gap", () => {
  assert.ok(VALID_TIERS.includes('user'));
  assert.strictEqual(typeof TIER_PULL_WEIGHT.user, 'number');
});

test('AM4-003', "'user_context' intent exists and maps to lexical+recency only (no causal/bep/failure — those score 0 for personal facts and add nothing)", () => {
  assert.deepStrictEqual(INTENT_LANES.user_context, ['lexical', 'recency']);
});

test('AM4-004', 'a rejected tier still throws the same honest error as before this change (VALID_TIERS check unmodified in behavior, only extended in membership)', () => {
  const pr = new CortexPushRecall({ store: jaaStore() });
  assert.throws(() => pr.push('x', [], 'not_a_real_tier'), /invalid tier/);
});

test('AM4-005', "recall(intent:'user_context') finds a real user-tier fact by lexical match, scored not just returned", () => {
  const pr = new CortexPushRecall({ store: jaaStore() });
  pr.push('James prefers async written updates over calls when possible.', ['preference', 'communication'], 'user');
  pr.push('Unrelated failure: chunk-build exhausted retries on system X.', ['unrelated'], 'failure');
  const results = pr.recall('user_context', { query: 'async written updates preference' });
  assert.ok(results.length >= 1, 'expected at least one result');
  assert.ok(results[0].content.includes('async written updates'));
  assert.ok(results[0].score > 0);
  assert.ok(results[0].breakdown.lexical > 0, 'lexical lane should have contributed');
  assert.strictEqual(results[0].breakdown.causal, undefined, 'causal lane should not run for user_context');
});

test('AM4-006', "the phasemap's own gate: a fact pushed in ONE CortexPushRecall instance is retrievable via a SEPARATE instance backed by the same real jaaDB store — real cross-session durability, not in-memory coincidence", () => {
  const sessionOne = new CortexPushRecall({ store: jaaStore() });
  const pushResult = sessionOne.push('Anjali is James\'s partner; conversations about her are personal, not NEXUS system content.', ['context', 'boundary'], 'user');

  // A brand new instance — nothing shared except the real underlying store.
  const sessionTwo = new CortexPushRecall({ store: jaaStore() });
  const results = sessionTwo.recall('user_context', { query: 'personal boundary partner conversations' });
  const found = results.find(r => r.id === pushResult.id);
  assert.ok(found, 'fact pushed in session one was not found by session two — durability broken');
  assert.ok(found.score > 0);
});

test('AM4-007', 'ranked and budget-capped exactly like every other tier — user-tier rows respect TOKEN_BUDGET_CHARS same as any other, not injected unconditionally', () => {
  const pr = new CortexPushRecall({ store: jaaStore() });
  // Push content that would blow well past the 48,000 char budget across
  // several rows, confirm recall() still respects the SAME cap it already
  // enforces for every other tier — no special unconditional-injection
  // path exists for 'user', per this phase's own explicit design point.
  const big = 'x'.repeat(20_000);
  pr.push(`${big} preference-marker-one`, ['big'], 'user');
  pr.push(`${big} preference-marker-two`, ['big'], 'user');
  pr.push(`${big} preference-marker-three`, ['big'], 'user');
  const results = pr.recall('user_context', { query: 'preference marker' });
  const totalChars = results.reduce((sum, r) => sum + r.content.length, 0);
  assert.ok(totalChars <= 48_000, `expected budget-capped total, got ${totalChars} chars across ${results.length} results`);
});

test('AM4-008', 'a query-relevant fact ranks above an unrelated fact of similar recency — lexical relevance still discriminates even though the recency lane (age-only, query-independent by this file\'s own pre-existing design) contributes to both', () => {
  const pr = new CortexPushRecall({ store: jaaStore() });
  pr.push('James prefers async written updates over calls when possible.', ['preference'], 'user');
  pr.push('zzz_totally_unrelated_token_xyz has nothing to do with communication preferences.', ['unrelated'], 'user');
  const results = pr.recall('user_context', { query: 'async written updates preference' });
  const relevant = results.find(r => r.content.includes('async written updates'));
  const unrelated = results.find(r => r.content.includes('zzz_totally_unrelated_token_xyz'));
  assert.ok(relevant, 'the relevant fact should be present');
  // Both may score >0 (recency alone guarantees that for fresh pushes —
  // confirmed, not assumed, by this test initially asserting zero and
  // being wrong) but relevance must still separate them in rank.
  if (unrelated) assert.ok(relevant.score > unrelated.score, 'relevant fact should outrank the unrelated one');
  assert.ok(relevant.breakdown.lexical > 0);
});

console.log(`\n  cortex/push-recall.js AM4 (user tier): ${passed} passed, ${failed} failed\n`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
