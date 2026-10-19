'use strict';
require('../../lib/test-sandbox.js').ensure();
// §0.60.167 — James: "been stuck on that phase for hours." A phase whose files already exist can't produce a failing
// test; test_first:require must not loop forever. TF.decide lets an already-satisfied phase through.
const assert = require('assert');
const TF = require('../../lib/test-first.js');
let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };

t('TD-01', 'fails-as-expected / not-run → accept (unchanged)', () => {
  assert.strictEqual(TF.decide('fails-as-expected', { alreadyDone: false }), 'accept');
  assert.strictEqual(TF.decide('not-run', { alreadyDone: true }), 'accept');
});
t('TD-02', 'passes-already + files already exist → accept-already (the unblock)', () => {
  assert.strictEqual(TF.decide('passes-already', { alreadyDone: true }), 'accept-already');
});
t('TD-03', 'passes-already with NO existing files → reject (a vacuous test, fail-first still enforced)', () => {
  assert.strictEqual(TF.decide('passes-already', { alreadyDone: false }), 'reject');
});
t('TD-04', 'invalid → reject regardless', () => {
  assert.strictEqual(TF.decide('invalid', { alreadyDone: true }), 'reject');
  assert.strictEqual(TF.decide('invalid', { alreadyDone: false }), 'reject');
});
console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
