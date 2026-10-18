'use strict';
/**
 * tests/modules/test-gates-solid.test.js — the gates, solid (0.60.158). James, 2026-10-18: "Need to get the gates solid."
 * Each case was a real hole in cortex/core/raid/contract-gates.js, proven on the code before it was fixed:
 *
 *   GS-H1  an outcome condition that is not a gate is checked — a missing file blocks completion (it was never looked at)
 *   GS-H2  a gate whose required file is deleted after it passed goes STALE (it stayed PASSED, and the contract complete)
 *   GS-H3  an invariant checked by a file or by evidence can be verified (only a gate check ever could)
 *   GS-H4  a condition naming CK-006 or CK-008 runs (import-checks' own; this file's list named three of its five)
 *   GS-H5  a match that is not a regex is unverifiable, said — check() does not throw
 *   GS-H6  an invariant is only as verified as its gate is now: a stale gate un-verifies it (it stayed verified)
 *   GS-07  a test named by the outcome holds only once verifyOutcome ran it and it passed; a failing one keeps it incomplete
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '../..');
require(path.join(ROOT, 'lib/test-sandbox.js')).ensure();
const assert = require('assert');
const C = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const dir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-')); fs.writeFileSync(path.join(d, 'a.js'), '1'); return d; };
const one = (extra = {}) => ({ v: 2, outcome: { what: 'x' }, refs: {}, gates: [{ id: 'g', type: 'task', pass_when: [{ exists: 'a.js' }] }], ...extra });

(async () => {
  await test('GS-H1', 'an outcome condition that is not a gate is checked', async () => {
    const root = dir();
    const p = one({ outcome: { what: 'x', done_when: [{ exists: 'never.js' }] } });
    await C.check(p, 'g', { root, learn: false });
    const e = C.evaluate(p, { root });
    assert.strictEqual(e.complete, false); assert.ok(e.why.some(w => /never\.js does not exist/.test(w)), e.why.join('; '));
    fs.writeFileSync(path.join(root, 'never.js'), '');
    assert.strictEqual(C.evaluate(p, { root }).complete, true, 'once it holds, complete');
  });

  await test('GS-H2', 'a required file deleted after the pass makes the gate STALE', async () => {
    const root = dir();
    const p = one({ refs: { a: { path: 'a.js' } } }); p.gates[0].requires = ['a'];
    assert.strictEqual((await C.check(p, 'g', { root, learn: false })).status, 'PASSED');
    fs.unlinkSync(path.join(root, 'a.js'));
    const e = C.evaluate(p, { root });
    assert.strictEqual(e.gates[0].status, 'STALE'); assert.match(e.gates[0].reasons.join(' '), /gone since it passed: a/);
    assert.strictEqual(e.complete, false);
  });

  await test('GS-H3', 'an invariant checked by a file or evidence can be verified', async () => {
    const root = dir();
    const p = one({ invariants: [{ id: 'i1', says: 'a exists', check: { exists: 'a.js' } }, { id: 'i2', says: 'k recorded', check: { evidence: 'k' } }] });
    await C.check(p, 'g', { root, learn: false });
    assert.ok(C.evaluate(p, { root }).why.some(w => /invariant i2 not verified: no evidence recorded for "k"/.test(w)));
    C.record(p, 'k', 'yes');
    assert.strictEqual(C.evaluate(p, { root }).complete, true);
  });

  await test('GS-H4', 'a condition naming CK-006 or CK-008 runs through import-checks', async () => {
    const root = dir();
    for (const id of ['CK-006', 'CK-008']) {
      const r = C.checkCondition({ check: id }, { root, state: {}, runTest: () => ({ code: 1 }) });
      assert.strictEqual(r.async, true, `${id} goes to lib/import-checks.js`);
    }
    const same = '// the same bytes twice\n'.repeat(20); fs.writeFileSync(path.join(root, 'b.js'), same); fs.writeFileSync(path.join(root, 'c.js'), same);   // a duplicate (CK-008 counts files of 200 bytes or more)
    const p = one(); p.gates[0].pass_when = [{ check: 'CK-008' }];
    const r = await C.check(p, 'g', { root, learn: false });
    assert.strictEqual(r.status, 'FAILED'); assert.match(r.reasons.join(' '), /CK-008 found 1/);
  });

  await test('GS-H5', 'a match that is not a regex is unverifiable, never a throw', async () => {
    const root = dir();
    const p = one({ state: { evidence: { k: 'v' } } }); p.gates[0].pass_when = [{ evidence: 'k', match: '(' }];
    const r = await C.check(p, 'g', { root, learn: false });
    assert.strictEqual(r.status, 'FAILED'); assert.match(r.reasons[0], /is not a regular expression/);
  });

  await test('GS-H6', 'an invariant is only as verified as its gate is now', async () => {
    const root = dir();
    const p = one({ refs: { a: { path: 'a.js' } }, invariants: [{ id: 'i', says: 's', check: { gate: 'g' } }] });
    p.gates[0].requires = ['a']; p.gates[0].optional = true;
    await C.check(p, 'g', { root, learn: false });
    assert.strictEqual(C.evaluate(p, { root }).complete, true);
    fs.writeFileSync(path.join(root, 'a.js'), '2');
    const e = C.evaluate(p, { root });
    assert.strictEqual(e.complete, false, 'its gate went stale: the invariant is no longer verified');
    assert.ok(e.why.some(w => /invariant i not verified: needs gate g \(STALE\)/.test(w)), e.why.join('; '));
  });

  await test('GS-07', 'a test the outcome names holds only after verifyOutcome ran it and it passed', async () => {
    const root = dir();
    fs.writeFileSync(path.join(root, 'ok.test.js'), 'process.exit(0)'); fs.writeFileSync(path.join(root, 'bad.test.js'), 'process.exit(3)');
    const p = one({ outcome: { what: 'x', done_when: [{ test: 'ok.test.js' }] } });
    await C.check(p, 'g', { root, learn: false });
    assert.ok(C.evaluate(p, { root }).why.some(w => /ok\.test\.js not verified yet/.test(w)), 'not run: not complete');
    await C.verifyOutcome(p, { root });
    assert.strictEqual(C.evaluate(p, { root }).complete, true);
    p.outcome.done_when.push({ test: 'bad.test.js' });
    await C.verifyOutcome(p, { root });
    const e = C.evaluate(p, { root });
    assert.strictEqual(e.complete, false); assert.ok(e.why.some(w => /bad\.test\.js failed when last verified/.test(w)), e.why.join('; '));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
