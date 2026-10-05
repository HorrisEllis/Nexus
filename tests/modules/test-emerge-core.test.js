'use strict';
/**
 * tests/modules/test-emerge-core.test.js — EM1, 0.39.321 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec).
 * James: "next."
 *
 *   EC1-01  a model proposal that breaks a constraint is rejected with the constraint's id; the state does not change
 *   EC1-02  one that cannot be evaluated is a Gap naming the missing input
 *   EC1-03  a Lens cannot write
 *   EC1-04  two runs with one seed produce byte-identical history; another seed does not; the chain verifies
 *   EC1-05  budget: every cost counted, a budget constraint bounds it; soft constraints let a violation through at cost
 *   EC1-06  level: a child changes its parent's hash
 */
const assert = require('assert');
const path = require('path');
const E = require(path.join(__dirname, '../../emerge/core'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const max10 = () => E.defineConstraint({ id: 'n.at-most-10', needs: ['n'], check: s => s.n <= 10 });

test('EC1-01', 'a broken constraint rejects the proposal, by id', () => {
  const f = E.createField({ seed: 1, state: { n: 0 }, constraints: [max10()] });
  const r = f.propose({ source: 'model', changes: { n: 99 } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.rejected.constraint, 'n.at-most-10');
  assert.deepStrictEqual(f.state(), { n: 0 });
  assert.strictEqual(f.history.entries().pop().kind, 'rejected');
});

test('EC1-02', 'a constraint that cannot be evaluated is a Gap naming the missing input', () => {
  const f = E.createField({ seed: 1, constraints: [E.defineConstraint({ id: 'has.owner', needs: ['owner'], check: s => !!s.owner })] });
  const r = f.propose({ source: 'model', changes: { n: 1 } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.gap.missingVariable, 'owner');
  assert.strictEqual(r.gap.affectedConstraint, 'has.owner');
  assert.deepStrictEqual(f.state(), {});
  assert.strictEqual(f.gaps().length, 1);
});

test('EC1-03', 'a Lens cannot write', () => {
  const f = E.createField({ seed: 1, state: { n: 1, deep: { x: 1 } } });
  const writer = E.createLens('writer', v => { v.state.n = 2; return v; });
  assert.throws(() => f.look(writer), TypeError);
  const deep = E.createLens('deep', v => { v.state.deep.x = 9; });
  assert.throws(() => f.look(deep), TypeError);
  assert.deepStrictEqual(f.state(), { n: 1, deep: { x: 1 } });
  assert.strictEqual(f.look(E.createLens('reader', v => v.state.n)), 1);
});

test('EC1-04', 'one seed, byte-identical history', () => {
  const run = (seed) => {
    const f = E.createField({ seed, state: { n: 0 }, constraints: [max10()] });
    f.propose({ source: 'model', changes: { n: 3 }, cost: 1 });
    f.propose({ source: 'model', changes: { n: 99 } });
    f.observe({ subject: 'n', value: 3, confidence: 0.8, source: 'test' });
    return f;
  };
  const a = run(7), b = run(7), c = run(8);
  assert.strictEqual(JSON.stringify(a.history), JSON.stringify(b.history));
  assert.notStrictEqual(JSON.stringify(a.history), JSON.stringify(c.history));
  assert.deepStrictEqual(a.history.verify(), { ok: true, brokenAt: null });
  assert.strictEqual(a.history.entries()[0].kind, 'seed');
  assert.throws(() => E.createField({}), /seed/, 'a run without a seed cannot be replayed');
});

test('EC1-05', 'budget counted and bounded; soft constraints pass at a cost', () => {
  const f = E.createField({ seed: 1, state: { n: 0 }, constraints: [E.budgetConstraint(3)] });
  assert.ok(f.propose({ source: 'model', changes: { n: 1 }, cost: 2 }).ok);
  const r = f.propose({ source: 'model', changes: { n: 2 }, cost: 2 });
  assert.strictEqual(r.rejected.constraint, 'budget.limit');
  assert.strictEqual(f.spent, 2);
  const s = E.createField({ seed: 1, state: { n: 0 }, constraints: [E.defineConstraint({ id: 'prefer.small', type: 'soft', needs: ['n'], check: x => x.n < 5, violationCost: 0.5 })] });
  const v = s.propose({ source: 'model', changes: { n: 9 }, cost: 1 });
  assert.ok(v.ok); assert.strictEqual(v.violations[0].constraint, 'prefer.small'); assert.strictEqual(s.spent, 1.5);
});

test('EC1-06', 'level: a child\'s change shows in its parent\'s hash', () => {
  const L = E.createLevels().add({ id: 'sys', level: 0, summary: 'a system' }).add({ id: 'comp', level: 1, parent: 'sys', summary: 'a component' });
  const before = L.hashOf('sys');
  L.setSummary('comp', 'a changed component');
  assert.notStrictEqual(L.hashOf('sys'), before);
  assert.throws(() => L.add({ id: 'bad', level: 3, parent: 'sys' }), /one level below/);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
