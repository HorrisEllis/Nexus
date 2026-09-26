'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-agent-capability.js
//
// The two that carry the weight:
//   · a declared vendor figure must never be reported as a measurement
//   · a non-size failure must never shrink an agent's capacity
// Everything else follows from those.
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');
const AC     = require(path.join(ROOT, 'lib', 'agent-capability'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  \u2713 ${id} ${name}`); })
    .catch(e => { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); });
}

(async () => {
  console.log('\n\u2550\u2550 AGENT CAPABILITY \u2014 measured, not declared \u2550\u2550\n');
  AC._resetForTest();

  // ── Unknown is not a default ──────────────────────────────────────────────
  await test('AGC-001', 'NO OBSERVATIONS \u2192 proven is null, NOT the declared figure', () => {
    const p = AC.profile('chatgpt');
    assert.strictEqual(p.proven, null, 'a vendor claim was laundered into a measurement');
    assert.strictEqual(p.declared.inputTokens, 900);
    assert.strictEqual(p.declared.verified, false, 'declared must be marked unverified');
    assert.ok(/NO OBSERVATIONS/.test(p.basis), 'the basis must say it has never been tested');
  });

  await test('AGC-002', 'a declared figure IS used \u2014 but halved and labelled unverified', () => {
    const c = AC.chunkFor('chatgpt');
    assert.strictEqual(c.size, 450, 'half of the declared 900');
    assert.strictEqual(c.confident, false);
    assert.strictEqual(c.declaredOnly, true);
    assert.ok(/UNVERIFIED/.test(c.basis), 'nothing downstream may mistake this for a measurement');
  });

  await test('AGC-003', 'an unknown agent gets NO invented number (\u00a71.1)', () => {
    const c = AC.chunkFor('some-new-model');
    assert.strictEqual(c.size, null, 'a chunk size was invented for an agent nothing is known about');
    assert.ok(/refusing to invent/.test(c.note));
  });

  // ── Measurement ───────────────────────────────────────────────────────────
  await test('AGC-004', 'a real success PROVES a size, and the basis says so', () => {
    AC._resetForTest();
    AC.record('chatgpt', { inputTokens: 3000, ok: true });
    const p = AC.profile('chatgpt');
    assert.strictEqual(p.proven, 3000);
    assert.ok(/measured/.test(p.basis));
    // The real point: 3000 measured beats 900 declared. The hardcoded guess in
    // agent-router.js was more than 3x too low, and only evidence shows that.
    assert.ok(p.proven > p.declared.inputTokens,
      'measurement must be able to RAISE a limit, not only lower it');
  });

  await test('AGC-005', 'chunkFor uses the proven ceiling with a safety margin', () => {
    const c = AC.chunkFor('chatgpt');
    assert.strictEqual(c.size, Math.floor(3000 * AC.SAFETY));
    assert.ok(/proven 3000/.test(c.basis));
  });

  await test('AGC-006', 'THE DISCRIMINATION: a non-size failure does NOT shrink the agent', () => {
    AC._resetForTest();
    AC.record('gemini', { inputTokens: 500000, ok: true });
    const before = AC.profile('gemini').proven;

    for (const reason of ['ECONNREFUSED', 'timeout after 30s', 'rate limited', 'content policy refusal', null]) {
      const r = AC.record('gemini', { inputTokens: 400000, ok: false, reason });
      assert.strictEqual(r.counted, false, `"${reason}" was counted as a size limit`);
    }
    const p = AC.profile('gemini');
    assert.strictEqual(p.proven, before, 'unrelated failures moved the proven figure');
    assert.strictEqual(p.suspectedCeiling, null,
      'a timeout became a capacity ceiling \u2014 this silently shrinks an agent forever');
  });

  await test('AGC-007', 'a REAL size failure does set a suspected ceiling', () => {
    AC._resetForTest();
    for (const reason of ['maximum context length exceeded', 'Request too large', 'token limit reached', '413 Payload Too Large']) {
      assert.strictEqual(AC._isSizeFailure(reason), true, `not recognised as a size failure: "${reason}"`);
    }
    AC.record('chatgpt', { inputTokens: 8000, ok: false, reason: 'maximum context length exceeded' });
    assert.strictEqual(AC.profile('chatgpt').suspectedCeiling, 8000);
  });

  await test('AGC-008', 'a success ABOVE a suspected ceiling disproves it \u2014 a counter-example wins', () => {
    AC._resetForTest();
    AC.record('chatgpt', { inputTokens: 4000, ok: false, reason: 'token limit reached' });
    assert.strictEqual(AC.profile('chatgpt').suspectedCeiling, 4000);
    AC.record('chatgpt', { inputTokens: 6000, ok: true });
    const p = AC.profile('chatgpt');
    assert.strictEqual(p.suspectedCeiling, null, 'a disproved hypothesis must not survive');
    assert.strictEqual(p.proven, 6000);
  });

  await test('AGC-009', 'between a proven success and a known failure, chunk aims INSIDE the proven side', () => {
    AC._resetForTest();
    AC.record('chatgpt', { inputTokens: 5000, ok: true });
    AC.record('chatgpt', { inputTokens: 5200, ok: false, reason: 'exceeds maximum context' });
    const c = AC.chunkFor('chatgpt');
    assert.ok(c.size < 5000, `chunk ${c.size} is not under the proven figure`);
    assert.ok(/capped under failure/.test(c.basis));
  });

  await test('AGC-010', 'a contradiction is NAMED, not smoothed over', () => {
    AC._resetForTest();
    AC.record('chatgpt', { inputTokens: 5000, ok: true });
    AC.record('chatgpt', { inputTokens: 4000, ok: false, reason: 'context length exceeded' });
    const p = AC.profile('chatgpt');
    assert.ok(p.contradiction, 'proven 5000 above a failure at 4000 is a real boundary, and must be stated');
    assert.ok(/genuinely between them/.test(p.contradiction));
  });

  // ── Confidence ────────────────────────────────────────────────────────────
  await test('AGC-011', 'one observation is PROVISIONAL and says so', () => {
    AC._resetForTest();
    AC.record('chatgpt', { inputTokens: 3000, ok: true });
    const c = AC.chunkFor('chatgpt');
    assert.strictEqual(c.confident, false);
    assert.ok(/provisional/.test(c.note));
  });

  await test('AGC-012', 'confidence arrives with evidence, not with time', () => {
    AC._resetForTest();
    for (let i = 0; i < AC.CONFIDENT_AFTER; i++) AC.record('chatgpt', { inputTokens: 3000 + i, ok: true });
    const c = AC.chunkFor('chatgpt');
    assert.strictEqual(c.confident, true);
    assert.strictEqual(c.note, null, 'a confident figure should not carry a provisional caveat');
  });

  // ── Refusals ──────────────────────────────────────────────────────────────
  await test('AGC-013', 'an outcome with no size measures nothing and is refused (\u00a71.1)', () => {
    assert.throws(() => AC.record('chatgpt', { ok: true }), /measures nothing/);
    assert.throws(() => AC.record('chatgpt', { inputTokens: 0, ok: true }), /measures nothing/);
    assert.throws(() => AC.record(null, { inputTokens: 100, ok: true }), /requires an agent/);
  });

  // ── Calibration ───────────────────────────────────────────────────────────
  await test('AGC-014', 'calibrate() binary-searches a real limit from real probes', async () => {
    AC._resetForTest();
    const TRUE_LIMIT = 12000;
    const r = await AC.calibrate('chatgpt', async (size) =>
      size <= TRUE_LIMIT ? { ok: true } : { ok: false, reason: 'maximum context length exceeded' },
      { low: 100, high: 100000, rounds: 10 });

    assert.ok(r.proven !== null, 'calibration produced no proven figure');
    assert.ok(r.proven <= TRUE_LIMIT, `proven ${r.proven} exceeds the true limit ${TRUE_LIMIT}`);
    assert.ok(r.proven > TRUE_LIMIT * 0.5, `proven ${r.proven} is far below the true limit \u2014 the search did not converge`);
    assert.ok(r.trail.length > 1, 'a search of one round is not a search');
    assert.ok(r.chunk.size < r.proven, 'the chunk size must sit under the proven figure');
  });

  await test('AGC-015', 'calibration STOPS on a non-size failure rather than narrowing on it', async () => {
    AC._resetForTest();
    let calls = 0;
    const r = await AC.calibrate('gemini', async () => { calls++; return { ok: false, reason: 'ECONNREFUSED' }; },
      { low: 100, high: 100000, rounds: 10 });
    assert.strictEqual(calls, 1, 'it kept searching on evidence that was never about size');
    assert.ok(/non-size failure/.test(r.trail[0].note));
    assert.strictEqual(r.suspectedCeiling, null, 'a connection error became a capacity limit');
  });

  await test('AGC-016', 'a throwing probe is an outcome, not a crash', async () => {
    AC._resetForTest();
    const r = await AC.calibrate('chatgpt', async () => { throw new Error('boom'); }, { rounds: 3 });
    assert.ok(Array.isArray(r.trail) && r.trail.length >= 1);
  });

  // ── The co-pilot's view ───────────────────────────────────────────────────
  await test('AGC-017', 'all() gives the co-pilot ONE place to ask \u2014 no per-agent special cases', () => {
    AC._resetForTest();
    AC.record('gemini', { inputTokens: 800000, ok: true });
    const list = AC.all();
    assert.ok(list.length >= 4, 'every declared agent should appear');
    for (const p of list) {
      assert.ok('proven' in p && 'chunk' in p && 'basis' in p,
        `agent ${p.agent} is missing the fields a caller needs to decide`);
    }
  });

  await test('AGC-018', 'health() names the agents still running on an unverified vendor claim', () => {
    AC._resetForTest();
    AC.record('gemini', { inputTokens: 800000, ok: true });
    const h = AC.health();
    assert.ok(h.measured.includes('gemini'));
    assert.ok(h.unmeasured.includes('chatgpt'), 'an untested agent must be listed as such');
    assert.ok(/most likely to be wrong/.test(h.note));
  });

  await test('AGC-019', 'the seeds match lib/agent-router.js \u2014 the two cannot disagree on day one', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'lib', 'agent-router.js'), 'utf8');
    assert.ok(/chatgpt:\s*\{\s*maxTokens:\s*900/.test(src),
      'agent-router\u2019s 900 changed \u2014 the DECLARED seed here now disagrees with it');
    assert.strictEqual(AC.DECLARED.chatgpt.inputTokens, 900);
    assert.strictEqual(AC.DECLARED.gemini.outputTokens, 65536);
  });

  await test('AGC-020', 'no store \u2192 load() says so, and that is not "tested and found nothing"', () => {
    const r = AC.load();
    assert.ok('ok' in r);
    if (!r.ok) assert.ok(/NOT the same as/.test(r.reason));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
