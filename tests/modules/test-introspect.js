'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-introspect.js
//
// The load-bearing cases:
//   · nothing readable → UNVERIFIABLE, never a pass
//   · the user's verdict outranks every automated score
//   · a retry carries the SPECIFIC finding, never "try again"
//   · when every signal said fine and the user says wrong, that is a COVERAGE
//     GAP and is reported as one
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');
const IN     = require(path.join(ROOT, 'lib', 'introspect'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  \u2713 ${id} ${name}`); })
    .catch(e => { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); });
}

(async () => {
  console.log('\n\u2550\u2550 INTROSPECT \u2014 the co-pilot examines its own answer \u2550\u2550\n');

  await test('IS-001', 'health() NAMES what it is blind to \u2014 never a bare ok', () => {
    const h = IN.health();
    assert.ok(h.signals && typeof h.signals === 'object');
    assert.ok(Array.isArray(h.blind));
    if (h.blind.length) assert.ok(/BLIND to/.test(h.note), 'partial introspection must say so');
  });

  await test('IS-002', 'THE USER OUTRANKS EVERYTHING \u2014 a correction is ground truth', async () => {
    const r = await IN.examine({ prompt: 'what are the compartments?', response: 'an invented hierarchy',
      userSaidWrong: true });
    assert.strictEqual(r.verdict, 'WRONG');
    assert.strictEqual(r.confidence, 1);
    assert.ok(/ground truth, not an inference/.test(r.reason),
      'a human saying it was wrong must not be weighed against a score and overruled');
  });

  await test('IS-003', 'absence of complaint is NOT evidence of correctness', async () => {
    const r = await IN.examine({ prompt: 'x', response: 'y', userSaidWrong: false });
    assert.strictEqual(r.signals.user.readable, false);
    assert.ok(/NOT evidence of correctness/.test(r.signals.user.note));
    assert.notStrictEqual(r.verdict, 'WRONG');
  });

  await test('IS-004', 'a clean run is NO_SIGNAL_OF_FAILURE, deliberately not PASS', async () => {
    const r = await IN.examine({ prompt: 'x', response: 'y' });
    assert.notStrictEqual(r.verdict, 'PASS', 'nothing here can establish an answer was good');
    if (r.verdict === 'NO_SIGNAL_OF_FAILURE') {
      assert.ok(/NOT the same as verified correct/.test(r.reason),
        'the weaker claim must keep saying it is weaker');
    }
  });

  await test('IS-005', 'every unreadable signal is recorded as unread, with a reason', async () => {
    const r = await IN.examine({ prompt: 'x', response: 'y' });
    for (const [name, sig] of Object.entries(r.signals)) {
      if (sig.readable === false) {
        assert.ok(sig.note || sig.error, `signal '${name}' is unreadable but says nothing about why`);
      }
    }
    assert.strictEqual(typeof r.readable, 'number');
    assert.strictEqual(typeof r.total, 'number');
  });

  await test('IS-006', 'THE COVERAGE GAP: user says wrong, no detector caught it \u2014 named as such', async () => {
    const r = await IN.examine({ prompt: 'x', response: 'y', userSaidWrong: true });
    assert.strictEqual(r.verdict, 'WRONG');
    assert.ok(r.diagnosis, 'a rejected answer must produce a diagnosis');
    // Either the detectors fired and were ignored, or they were blind. Both are
    // findings, and they call for opposite fixes.
    const isCoverage = /COVERAGE GAP|blind to this class|UNREADABLE/.test(r.diagnosis + ' ' + (r.actionable || ''));
    const didFire    = /contract shape|reflection scored|ledger error|open gap/.test(r.diagnosis);
    assert.ok(isCoverage || didFire,
      'the diagnosis must distinguish "the signals fired and nobody acted" from "nothing could see it"');
  });

  await test('IS-007', 'THE RETRY PROMPT CARRIES THE FINDING, never "try again"', async () => {
    const r = await IN.examine({ prompt: 'explain the compartments', response: 'wrong answer', userSaidWrong: true });
    assert.ok(r.retryPrompt, 'a rejected answer must produce a retry prompt');
    assert.ok(/WHY IT WAS REJECTED/.test(r.retryPrompt), 'the reason must be in the prompt');
    assert.ok(/Do not restate it/.test(r.retryPrompt));
    assert.ok(/explain the compartments/.test(r.retryPrompt), 'the original request must be carried');
    assert.ok(!/^try again$/im.test(r.retryPrompt),
      'a bare "try again" returns a reworded version of the same answer');
  });

  await test('IS-008', 'the retry prompt allows the agent to DISAGREE rather than comply', async () => {
    const r = await IN.examine({ prompt: 'p', response: 'a', userSaidWrong: true });
    assert.ok(/believe the previous answer was correct/.test(r.retryPrompt),
      'a retry loop that only permits capitulation trains the agent to churn, not to reason');
  });

  await test('IS-009', '\u00a71.1 retry() without a dispatchFn is REFUSED', async () => {
    await assert.rejects(() => IN.retry({ prompt: 'x', response: 'y' }), /requires a dispatchFn/);
  });

  await test('IS-010', 'retry() dispatches the DIAGNOSED prompt, not the original', async () => {
    let sent = null;
    const r = await IN.retry({
      prompt: 'original question', response: 'bad answer',
      dispatchFn: async (p) => { sent = p; return 'corrected answer'; },
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.answer, 'corrected answer');
    assert.notStrictEqual(sent, 'original question', 'the original prompt was re-sent unchanged \u2014 that is a re-roll');
    assert.ok(/WHY IT WAS REJECTED/.test(sent));
    assert.ok(r.diagnosis, 'the retry must report what it changed');
  });

  await test('IS-011', 'a throwing dispatch is an outcome, not a crash', async () => {
    const r = await IN.retry({ prompt: 'p', response: 'a',
      dispatchFn: async () => { throw new Error('agent unreachable'); } });
    assert.strictEqual(r.ok, false);
    assert.ok(/unreachable/.test(r.error));
    assert.ok(r.examined, 'the examination must survive a failed dispatch \u2014 the diagnosis is still useful');
  });

  await test('IS-012', 'no retry prompt \u2192 REFUSES to re-ask rather than guessing twice', async () => {
    // examine() returns retryPrompt:null when it has nothing to say. retry()
    // must not paper over that by re-sending the original.
    const src = require('fs').readFileSync(path.join(ROOT, 'lib', 'introspect.js'), 'utf8');
    assert.ok(/refusing to re-ask with no new information/.test(src));
    assert.ok(/reworded version of the same answer/.test(src),
      'the reason for the refusal must be stated in the code, not just implied');
  });

  await test('IS-013', 'UNVERIFIABLE when nothing is readable \u2014 and it does NOT retry', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'lib', 'introspect.js'), 'utf8');
    assert.ok(/verdict: 'UNVERIFIABLE', confidence: 0/.test(src));
    assert.ok(/retryPrompt: null/.test(src), 'an unverifiable examination must not produce a retry prompt');
    assert.ok(/retrying now would be guessing twice/.test(src));
  });

  // ── Wiring ────────────────────────────────────────────────────────────────
  await test('IS-014', 'the correction regex is ONE constant \u2014 detector and retry cannot drift', () => {
    const srv = require('fs').readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
    // §0.39.282 — the constant moved into copilot/config.js (settings out of server.js); server.js reads it from there.
    const cfg = require('fs').readFileSync(path.join(ROOT, 'copilot', 'config.js'), 'utf8');
    assert.ok(/const CORRECTION_RE = config\.CORRECTION_RE/.test(srv) && /CORRECTION_RE:/.test(cfg), 'the pattern must be a single named constant');
    const inlineCopies = (srv.match(/that'\?s wrong/g) || []).length + (cfg.match(/that'\?s wrong/g) || []).length;
    assert.strictEqual(inlineCopies, 1,
      'two copies of the correction pattern means a phrase can log a correction without triggering a retry');
  });

  await test('IS-015', 'the session records the ANSWER, not just the prompt', () => {
    const srv = require('fs').readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
    assert.ok(/lastResponse: null/.test(srv), 'the field must be DECLARED, not read off a record that never had it');
    assert.ok(/function _recordResponse/.test(srv), 'and something must actually write it');
  });

  await test('IS-016', 'introspection failing can never break the response path (\u00a71.2)', () => {
    const srv = require('fs').readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
    const fn = srv.slice(srv.indexOf('async function _introspectRetry'), srv.indexOf('function _injectUserModel'));
    assert.ok(/catch \(_\)/.test(fn), '_introspectRetry must swallow its own failures');
    assert.ok(/return null/.test(fn), 'and fall through to the normal path');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
