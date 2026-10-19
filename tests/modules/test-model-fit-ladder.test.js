'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-model-fit-ladder.test.js — MF1 (0.60.163).
 * James, 2026-10-19: "ollama first, but nexus should be learning … as long as local and free can handle it." His box:
 * 3700X / 16GB / GTX 1650 — a 7b-ish ceiling, and only when RAM is free. The ladder must leave off a local model that
 * cannot fit free memory NOW (a skip, not an attempt), and a guardian rung is never memory-gated.
 *
 *   MF-01  byFit leaves off the local models that don't fit, keeps the ones that do, in order; each skip says why
 *   MF-02  byFit never memory-gates a non-ollama (guardian) rung
 *   MF-03  byFit with no `fits` predicate is a no-op (the check could not run → tried, as before)
 *   MF-04  fittingModels returns only the models that fit, input order preserved
 *   MF-05  byFit against the REAL resource-monitor fitsModel: a model far bigger than free memory is skipped
 */
const assert = require('assert');
const PRt = require('../../lib/pipeline-routing.js');
const RM = require('../../lib/resource-monitor.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

// the ladder shape byFit consumes: { provider, base, model }
const rung = (p) => { const i = p.indexOf(':'); return i > 0 ? { provider: p, base: p.slice(0, i), model: p.slice(i + 1) } : { provider: p, base: p, model: null }; };
const LADDER = [rung('ollama:qwen3.5:9b'), rung('ollama:qwen2.5-coder:7b'), rung('ollama:qwen2.5-coder:3b'), rung('gemini'), rung('chatgpt')];
// a fake fits: only the 3b fits now
const fakeFits = (model) => ({ fits: /:3b$/.test(model), why: `${model} needs more than is free` });

test('MF-01', 'byFit keeps the fitting local models in order, skips the rest with why', () => {
  const r = PRt.byFit(LADDER, { fits: fakeFits });
  const kept = r.rungs.map(x => x.provider);
  assert.deepStrictEqual(kept, ['ollama:qwen2.5-coder:3b', 'gemini', 'chatgpt'], JSON.stringify(kept));
  assert.strictEqual(r.skipped.length, 2, 'the 9b and 7b are skipped');
  assert.ok(r.skipped.every(s => s.why && /needs more/.test(s.why)), 'each skip says why');
  assert.ok(r.skipped.some(s => s.provider === 'ollama:qwen3.5:9b'), 'the 9b is named');
});

test('MF-02', 'a guardian (non-ollama) rung is never memory-gated', () => {
  const never = () => ({ fits: false, why: 'nope' });
  const r = PRt.byFit([rung('gemini'), rung('chatgpt')], { fits: never });
  assert.deepStrictEqual(r.rungs.map(x => x.provider), ['gemini', 'chatgpt']);
  assert.strictEqual(r.skipped.length, 0);
});

test('MF-03', 'no fits predicate → no-op (the check could not run, tried as before)', () => {
  const r = PRt.byFit(LADDER, {});
  assert.strictEqual(r.rungs.length, LADDER.length);
  assert.strictEqual(r.skipped.length, 0);
});

test('MF-04', 'fittingModels returns only the fitting models, order preserved', () => {
  const got = PRt.fittingModels(['qwen3.5:9b', 'qwen2.5-coder:7b', 'qwen2.5-coder:3b'], { fits: fakeFits });
  assert.deepStrictEqual(got, ['qwen2.5-coder:3b']);
  // no predicate → all, unchanged
  assert.deepStrictEqual(PRt.fittingModels(['a', 'b'], {}), ['a', 'b']);
});

test('MF-05', 'byFit with the REAL fitsModel skips a model far bigger than free memory', () => {
  const smp = RM.sample();
  const huge = smp.system.totalMem * 4;   // 4× total RAM — cannot fit on any machine
  const fits = (model) => RM.fitsModel({ model, bytes: huge, loaded: [], sample: smp });
  const r = PRt.byFit([rung('ollama:giant:70b'), rung('gemini')], { fits });
  assert.deepStrictEqual(r.rungs.map(x => x.provider), ['gemini'], 'the giant local model is left off, guardian stays');
  assert.strictEqual(r.skipped.length, 1);
  assert.ok(/GB/.test(r.skipped[0].why), 'the real fitsModel reason is carried');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
