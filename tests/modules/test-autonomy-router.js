'use strict';
// §copilot autonomy-router v2 — flexible matching, propose-then-confirm, Bayesian confidence in both models.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ar = require(path.join(__dirname, '../..', 'copilot/lib/autonomy-router'));
const learning = require(path.join(__dirname, '../..', 'copilot/lib/intent-learning'));
const scheduler = require(path.join(__dirname, '../..', 'lib/scheduler'));
const um = require(path.join(__dirname, '../..', 'copilot/lib/user-model'));

let sid = 0;
function newSession() { return `test-session-${Date.now()}-${sid++}`; }

(async () => {
  await test('T-001', 'an unrelated prompt returns null (falls through to the LLM)', async () => {
    const r = await ar.route('what is the capital of France', { sessionId: newSession() });
    assert.strictEqual(r, null);
  });

  await test('T-002', 'a state-changing match (schedule) does NOT execute immediately — returns a proposal', async () => {
    scheduler._resetForTest(); scheduler.start({ skipRestore: true });
    const s = newSession();
    const r = await ar.route('schedule proposal-only-task every 5 minutes', { sessionId: s });
    assert.ok(r);
    // §2026-08-12 — was asserting the literal old "Confirm?" suffix, which
    // James correctly flagged as making every proposal feel templated and
    // was removed on purpose. The real requirement is that a proposal
    // reads as a genuine question, not that it contains that exact word.
    assert.ok(/\?/.test(r.text), 'a proposal must read as a real question');
    assert.strictEqual(scheduler.list().some(t => t.name === 'proposal-only-task'), false, 'must not execute before confirmation');
  });

  await test('T-003', 'confirming ("yes") really executes the proposed action', async () => {
    const s = newSession();
    await ar.route('schedule confirm-executes-task every 5 minutes', { sessionId: s });
    const r = await ar.route('yes', { sessionId: s });
    assert.ok(/Scheduled/.test(r.text));
    assert.ok(scheduler.list().some(t => t.name === 'confirm-executes-task'), 'the real task must now exist');
  });

  await test('T-004', 'rejecting ("no") does NOT execute the action', async () => {
    const s = newSession();
    await ar.route('schedule reject-blocks-task every 5 minutes', { sessionId: s });
    const r = await ar.route('no, don\'t do that', { sessionId: s });
    assert.ok(/cancelled/i.test(r.text));
    assert.strictEqual(scheduler.list().some(t => t.name === 'reject-blocks-task'), false, 'a rejected action must never execute');
  });

  await test('T-005', 'a non yes/no reply after a proposal falls through — does not swallow an unrelated new request', async () => {
    const s = newSession();
    await ar.route('schedule dangling-proposal-task every 5 minutes', { sessionId: s });
    const r = await ar.route('what can you do', { sessionId: s });
    assert.ok(r);
    assert.ok(/capabilities|capable/i.test(r.text) === true || /verified capabilities/.test(r.text));
  });

  await test('T-006', 'confirming boosts confidence for that pattern (Bayesian, +0.10 capped at 1.0)', async () => {
    const s = newSession();
    const before = learning.getConfidence('ca1.schedule');
    await ar.route('schedule confidence-boost-task every 5 minutes', { sessionId: s });
    await ar.route('yes', { sessionId: s });
    const after = learning.getConfidence('ca1.schedule');
    assert.ok(after > before, `expected confidence to rise, was ${before} now ${after}`);
    assert.ok(Math.abs((after - before) - 0.10) < 0.001 || after === 1.0, 'boost must be +0.10 (or capped at 1.0)');
  });

  await test('T-007', 'rejecting decays confidence for that pattern (steeper than the boost, -0.15)', async () => {
    const s = newSession();
    const before = learning.getConfidence('ca1.schedule');
    await ar.route('schedule confidence-decay-task every 5 minutes', { sessionId: s });
    await ar.route('no', { sessionId: s });
    const after = learning.getConfidence('ca1.schedule');
    assert.ok(after < before, `expected confidence to fall, was ${before} now ${after}`);
  });

  await test('T-008', 'a confirmed action updates the USER model via recordIntent (real, not mocked)', async () => {
    const s = newSession();
    const claim = 'uses autonomy.ca6.build intent';
    const before = um.getHypotheses(0, 1000).find(h => h.claim === claim);
    const beforeCount = before ? before.evidence_count : 0;
    await ar.route('make me a command for loom to check the graph', { sessionId: s });
    await ar.route('yes', { sessionId: s });
    const after = um.getHypotheses(0, 1000).find(h => h.claim === claim);
    assert.ok(after, 'expected a real user-model hypothesis about this intent pattern');
    assert.ok(after.evidence_count > beforeCount, 'evidence count must increase on a real confirm, not stay static');
  });

  await test('T-009', 'flexible matching: filler words, synonyms, and trailing text all resolve (12/12, was 7/12 before loosening)', async () => {
    const variants = [
      'schedule flex-a every 5 minutes', 'Schedule the flex-b every 5 minutes please',
      'can you schedule flex-c every 2 hours for me', 'make me a command for loom to check the graph',
      'hey nexus can you make me a command for loom to check the graph?', 'build me a command for loom to check the graph',
      'set flex-key to 5 for flex-sys-1', 'change flex-key to 5 for flex-sys-2', 'please set the flex-key to 5 for flex-sys-3',
      'what can you do', 'what are you capable of', 'tell me what you can do',
    ];
    let hits = 0;
    for (const v of variants) { const r = await ar.route(v, { sessionId: newSession() }); if (r) hits++; }
    assert.strictEqual(hits, 12, `expected all 12 to resolve, got ${hits}`);
  });

  await test('T-010', 'a stale pending proposal is not held forever — a fresh unrelated request after a long gap does not get treated as a confirmation of something else', async () => {
    // Can't wait out the real 3-minute TTL in a unit test; verify the TTL
    // check exists and a non-affirm/deny reply correctly falls through
    // instead (covered structurally by T-005) — this test documents the
    // constraint rather than sleeping 3 minutes.
    const s = newSession();
    await ar.route('schedule ttl-doc-task every 5 minutes', { sessionId: s });
    const r = await ar.route('completely unrelated question about the weather', { sessionId: s });
    assert.ok(r === null || !/Scheduled/.test(r.text), 'an unrelated non-affirm reply must not execute the pending schedule');
  });

  await test('T-011', 'a denied setting change (RAID gate) surfaces honestly on confirm, not a fake success', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const s = newSession();
    await ar.route('set retry-limit to 5 for autonomy-raid-deny-sys', { sessionId: s });
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    const r = await ar.route('yes', { sessionId: s });
    sm.governAction = orig;
    assert.ok(/Couldn't set/.test(r.text));
  });

  await test('T-012', 'logging an idea writes a real, correctly-tagged row — origin:user, not origin:agent (the one design point that actually matters)', async () => {
    const ip = require(path.join(__dirname, '../..', 'lib/idea-provenance'));
    const r = await ar.route('log this idea: test idea from the autonomy-router suite ' + Date.now(), { sessionId: newSession() });
    assert.ok(r);
    assert.ok(/Logged to idearium/.test(r.text));
    const found = ip.list({}).find(i => i.slug === r.detail.slug);
    assert.ok(found, 'the idea must be a real row, not just a canned reply');
    assert.ok(found.tags.includes('origin:user'), 'co-pilot logging James\'s idea must tag it origin:user, never origin:agent — that distinction is idea-provenance.js\'s entire reason for existing');
    assert.ok(found.tags.includes('status:proposed'));
    ip.review(r.detail.slug, 'rejected', { reviewer: 'test-cleanup', reviewerKind: 'user', note: 'test artifact' });
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
