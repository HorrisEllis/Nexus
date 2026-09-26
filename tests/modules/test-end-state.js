'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-end-state.js
//
// The load-bearing tests are the ones proving an agent CANNOT move the goal
// posts, and that a stalled run is reported as stuck rather than as failure.
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');
const ES     = require(path.join(ROOT, 'lib', 'end-state'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  \u2713 ${id} ${name}`); })
    .catch(e => { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); });
}

const cond = (id, fn, describe) => ({ id, describe: describe || id, evaluate: fn });

(async () => {
  console.log('\n\u2550\u2550 END-STATE \u2014 frozen conditions, free strategy \u2550\u2550\n');

  // ── Declaration ───────────────────────────────────────────────────────────
  await test('ES-001', 'an end-state with NO conditions is refused \u2014 a wish is not a target', () => {
    assert.throws(() => ES.declare({ goal: 'make it good', conditions: [] }), /wish, not a target/);
    assert.throws(() => ES.declare({ goal: 'x' }), /wish, not a target/);
  });

  await test('ES-002', 'a condition nothing can check is refused (\u00a71.1)', () => {
    assert.throws(() => ES.declare({ goal: 'g', conditions: [{ id: 'c', describe: 'd' }] }), /evaluate/);
    assert.throws(() => ES.declare({ goal: 'g', conditions: [{ id: 'c', evaluate: () => ({}) }] }),
      /no describe/, 'an agent cannot aim at an unstated target');
  });

  await test('ES-003', 'THE HARD LINE: conditions are FROZEN \u2014 a run cannot edit them', () => {
    const es = ES.declare({ goal: 'g', conditions: [cond('c1', () => ({ met: false }))] });
    assert.throws(() => { 'use strict'; es.conditions.push(cond('sneaky', () => ({ met: true }))); });
    const before = es.conditions[0].evaluate;
    try { es.conditions[0].evaluate = () => ({ met: true }); } catch (_) {}
    assert.strictEqual(es.conditions[0].evaluate, before, 'an evaluator was swapped \u2014 success became redefinable');
  });

  // ── Evaluation ────────────────────────────────────────────────────────────
  await test('ES-004', 'partial progress is measurable \u2014 without it, stuck-detection is impossible', () => {
    const es = ES.declare({ goal: 'g', conditions: [
      cond('a', () => ({ met: true })),
      cond('b', () => ({ met: false, progress: 0.5 })),
    ]});
    const ev = ES.evaluate(es, {});
    assert.strictEqual(ev.reached, false);
    assert.strictEqual(ev.met, 1);
    assert.strictEqual(ev.progress, 0.75, '(1 + 0.5) / 2');
    assert.strictEqual(ev.unmet.length, 1);
  });

  await test('ES-005', 'A THROWING EVALUATOR IS UNVERIFIABLE, NOT UNMET', () => {
    const es = ES.declare({ goal: 'g', conditions: [
      cond('ok',     () => ({ met: true })),
      cond('broken', () => { throw new Error('evaluator bug'); }),
    ]});
    const ev = ES.evaluate(es, {});
    assert.strictEqual(ev.unverifiable, 1);
    assert.strictEqual(ev.reached, false, 'an unverifiable condition must never permit a pass');
    const b = ev.conditions.find(c => c.id === 'broken');
    assert.strictEqual(b.verifiable, false);
    assert.ok(/not unmet/.test(b.note), 'a broken check must not read as a failing agent');
  });

  await test('ES-006', 'half-broken evaluators cannot report a confident half-score', () => {
    const es = ES.declare({ goal: 'g', conditions: [
      cond('a', () => ({ met: true })),
      cond('b', () => { throw new Error('x'); }),
    ]});
    const ev = ES.evaluate(es, {});
    assert.ok(ev.progress <= 0.5, 'progress must be divided by ALL conditions, not just checkable ones');
    assert.ok(ev.note && /cannot be a pass/.test(ev.note));
  });

  // ── Pursuit ───────────────────────────────────────────────────────────────
  await test('ES-007', 'REACHED when every condition is met, and it says which round', async () => {
    let n = 0;
    const es = ES.declare({ goal: 'reach 3', conditions: [cond('three', a => ({ met: a >= 3, progress: Math.min(1, a / 3) }))] });
    const r = await ES.pursue({ endState: es, attempt: () => ++n, maxRounds: 5 });
    assert.strictEqual(r.outcome, ES.OUTCOME.REACHED);
    assert.strictEqual(r.reached, true);
    assert.strictEqual(r.roundsUsed, 3);
    assert.strictEqual(r.artifact, 3);
  });

  await test('ES-008', 'THE STUCK DETECTOR: a stalled run halts and blames the GOAL, not the agent', async () => {
    let calls = 0;
    const es = ES.declare({ goal: 'impossible', conditions: [cond('never', () => ({ met: false, progress: 0.2 }))] });
    const r = await ES.pursue({ endState: es, attempt: () => { calls++; return 'same'; }, maxRounds: 50 });
    assert.strictEqual(r.outcome, ES.OUTCOME.STUCK);
    assert.ok(calls < 50, `ran all 50 rounds producing nothing \u2014 used ${calls}`);
    assert.ok(/end-state is wrong, not the agent/.test(r.reason));
    assert.ok(/review the end-state/.test(r.actionable));
  });

  await test('ES-009', 'STUCK and FAILED are DIFFERENT outcomes \u2014 they call for opposite responses', async () => {
    // Still improving when rounds ran out: FAILED, more rounds may help.
    let n = 0;
    const slow = ES.declare({ goal: 'slow', conditions: [cond('c', () => ({ met: false, progress: Math.min(0.99, ++n / 100) }))] });
    const r = await ES.pursue({ endState: slow, attempt: () => n, maxRounds: 3 });
    assert.strictEqual(r.outcome, ES.OUTCOME.FAILED);
    assert.ok(/more rounds may genuinely help/.test(r.reason));
    assert.ok(/raising maxRounds is reasonable/.test(r.actionable));
  });

  await test('ES-010', 'UNVERIFIABLE halts rather than iterating toward an unmeasurable target', async () => {
    let calls = 0;
    const es = ES.declare({ goal: 'g', conditions: [cond('broken', () => { throw new Error('no'); })] });
    const r = await ES.pursue({ endState: es, attempt: () => { calls++; return 'x'; }, maxRounds: 10 });
    assert.strictEqual(r.outcome, ES.OUTCOME.UNVERIFIABLE);
    assert.strictEqual(calls, 1, 'it must stop on the FIRST unverifiable round, not keep going');
    assert.ok(/fix the evaluators first/.test(r.actionable));
  });

  await test('ES-011', 'feedback names the SPECIFIC gap and whether the last change helped', async () => {
    const seen = [];
    let v = 0;
    const es = ES.declare({ goal: 'g', conditions: [cond('target', a => ({ met: a >= 4, progress: Math.min(1, a / 4) }), 'reach four')] });
    await ES.pursue({ endState: es, maxRounds: 4, attempt: (fb) => { seen.push(fb); return ++v; } });
    const second = seen[1];
    assert.ok(second.unmet.some(u => u.id === 'target'), 'the specific unmet condition must be named');
    assert.ok(second.unmet[0].describe, 'and described \u2014 an id alone is not a target');
    assert.ok(/IMPROVED/.test(second.direction), 'the agent must be able to tell progress from regression');
  });

  await test('ES-012', 'the frozen-conditions constraint is restated on EVERY round', async () => {
    const seen = [];
    const es = ES.declare({ goal: 'g', conditions: [cond('c', () => ({ met: false, progress: 0.1 }))] });
    await ES.pursue({ endState: es, maxRounds: 2, attempt: (fb) => { seen.push(fb); return 'x'; } });
    const fb = seen[1];
    assert.ok(/APPROACH freely/.test(fb.constraint), 'innovating the strategy must be explicitly permitted');
    assert.ok(/NOT change what counts as success/.test(fb.constraint),
      'the pressure to reinterpret grows with each failure \u2014 this is exactly when it must be least available');
  });

  await test('ES-013', 'a throwing attempt is ABANDONED \u2014 not an agent result', async () => {
    const es = ES.declare({ goal: 'g', conditions: [cond('c', () => ({ met: true }))] });
    const r = await ES.pursue({ endState: es, attempt: () => { throw new Error('boom'); }, maxRounds: 3 });
    assert.strictEqual(r.outcome, ES.OUTCOME.ABANDONED);
    assert.ok(/not an agent result/.test(r.actionable));
  });

  // ── Amendment ─────────────────────────────────────────────────────────────
  await test('ES-014', '\u00a7IP-5 AN AGENT CANNOT AMEND ITS OWN ACCEPTANCE CRITERIA', () => {
    const es = ES.declare({ goal: 'g', conditions: [cond('hard', () => ({ met: false }))] });
    const p  = ES.proposeAmendment(es, { conditionId: 'hard', reason: 'unreachable as written' });
    assert.strictEqual(p.status, 'pending');
    assert.strictEqual(p.proposedBy, 'agent');
    for (const by of ['agent', undefined, 'system', 'copilot']) {
      assert.throws(() => ES.amend(es, p, { by, replacement: cond('hard', () => ({ met: true })) }),
        /REFUSED/, `'${by}' was allowed to move the goal posts`);
    }
  });

  await test('ES-015', 'a proposal does NOT mutate the end-state \u2014 it is a proposal', () => {
    const es = ES.declare({ goal: 'g', conditions: [cond('hard', () => ({ met: false }))] });
    ES.proposeAmendment(es, { conditionId: 'hard', reason: 'too strict' });
    assert.strictEqual(ES.evaluate(es, {}).reached, false, 'proposing changed the outcome');
  });

  await test('ES-016', 'a USER may amend \u2014 and gets a NEW end-state, the original untouched', () => {
    const es = ES.declare({ goal: 'g', conditions: [cond('hard', () => ({ met: false }))] });
    const p  = ES.proposeAmendment(es, { conditionId: 'hard', reason: 'genuinely wrong' });
    const es2 = ES.amend(es, p, { by: 'user', replacement: cond('hard', () => ({ met: true }), 'relaxed') });
    assert.strictEqual(ES.evaluate(es2, {}).reached, true);
    assert.strictEqual(ES.evaluate(es, {}).reached, false, 'the ORIGINAL must be unchanged \u2014 history is not rewritten');
    assert.notStrictEqual(es2.id, es.id);
  });

  // ── Sandbox ───────────────────────────────────────────────────────────────
  await test('ES-017', 'sandbox() gives an isolated store \u2014 the blocker fixed on 2026-08-18', async () => {
    const sbx = ES.sandbox({ id: 'test' });
    try {
      assert.ok(fs.existsSync(sbx.dir));
      assert.strictEqual(sbx.env.JAA_DATA_DIR, sbx.dir);
      const wrote = await sbx.run(async ({ jaaDB }) => {
        jaaDB.insert('sandbox_only', { uuid: 'x', v: 1 });
        return true;
      });
      assert.strictEqual(wrote, true);
      assert.ok(!fs.existsSync(path.join(ROOT, 'data', 'cortex', 'memory', 'sandbox_only.json')),
        'a sandbox write reached the PRODUCTION store \u2014 the isolation is not real');
    } finally { sbx.destroy(); }
  });

  await test('ES-018', 'the env is always restored, even when the run throws', async () => {
    const before = process.env.JAA_DATA_DIR;
    const sbx = ES.sandbox({ id: 'restore' });
    try {
      await sbx.run(async () => { throw new Error('inner'); }).catch(() => {});
      assert.strictEqual(process.env.JAA_DATA_DIR, before,
        'a leaked JAA_DATA_DIR would silently redirect the whole process');
    } finally { sbx.destroy(); }
  });

  await test('ES-019', 'a sandbox that FAILED to seed says so \u2014 empty by accident \u2260 by design', () => {
    const sbx = ES.sandbox({ id: 'noseed', seed: true, from: '/nonexistent-path-xyz' });
    try {
      assert.strictEqual(sbx.seeded, 0);
      assert.ok(sbx.seedError, 'the seed failure must be recorded');
      assert.ok(/by accident, not by design/.test(sbx.note));
    } finally { sbx.destroy(); }
  });

  await test('ES-020', 'destroy() removes the sandbox \u2014 learning state does not accumulate', () => {
    const sbx = ES.sandbox({ id: 'gone' });
    const dir = sbx.dir;
    assert.strictEqual(sbx.destroy(), true);
    assert.strictEqual(fs.existsSync(dir), false);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
