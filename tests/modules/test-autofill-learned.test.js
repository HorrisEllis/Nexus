'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-learned.test.js — JA1 (0.60.225).
 * James, 2026-10-23: "make sure it works for these" (micro1, Mercor, Turing, RemoExperts job applications). A field the
 * patterns miss on a specific site is taught once (element picker) and remembered per-site; matchFields consults that
 * learned map before its patterns, so the pick fills every time.
 *
 *   JA-01  a field the patterns miss (an opaque name/label) IS filled when a learned entry maps its identity → a fieldType
 *   JA-02  a learned pick OVERRIDES a pattern (a human's correction wins), and the match is sourced 'learned', high confidence
 *   JA-03  no learned map → behaviour unchanged (the patterns alone)
 *   JA-04  fieldKeysOf returns a field's identities (id, name, label, aria-label, placeholder), lowercased, de-duped
 */
const assert = require('assert');
const M = require('../../clear-glass/src/autofill/matcher.js');

let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };

// a profile with a github url and an email
const profile = { fields: { github: 'https://github.com/jamesbrooks', email: 'james@example.com', firstName: 'James' } };

t('JA-01', 'a pattern-missed field fills from a learned entry', () => {
  // an opaque field micro1-style: name="q_17abc", label "Your code profile" — no pattern matches "github"
  const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'q_17abc', label: 'Your code profile', attrs: {} }];
  const none = M.matchFields(fields, profile, {});
  assert.strictEqual(none.length, 0, 'without learning, the opaque field is not matched');
  const learned = { 'your code profile': 'github' };   // James taught it once
  const got = M.matchFields(fields, profile, { learned });
  assert.strictEqual(got.length, 1, 'now it matches');
  assert.strictEqual(got[0].fieldType, 'github');
  assert.strictEqual(got[0].value, 'https://github.com/jamesbrooks');
  assert.strictEqual(got[0].source, 'learned');
  assert.strictEqual(got[0].confidence, 'high');
});

t('JA-02', 'a learned pick overrides a pattern match (human correction wins)', () => {
  // a field whose label says "email" but on this site is really where the github goes (James corrected it)
  const fields = [{ id: 'cg2', tag: 'input', type: 'text', name: 'contact', label: 'Email', attrs: {} }];
  const byPattern = M.matchFields(fields, profile, {});
  assert.strictEqual(byPattern[0].fieldType, 'email', 'pattern alone → email');
  const got = M.matchFields(fields, profile, { learned: { 'email': 'github' } });
  assert.strictEqual(got[0].fieldType, 'github', 'the learned pick overrides the pattern');
  assert.strictEqual(got[0].source, 'learned');
});

t('JA-03', 'no learned map → unchanged behaviour', () => {
  const fields = [{ id: 'cg3', tag: 'input', type: 'email', name: 'email', label: 'Email', attrs: {} }];
  const got = M.matchFields(fields, profile, {});
  assert.strictEqual(got[0].fieldType, 'email');
  assert.notStrictEqual(got[0].source, 'learned');
});

t('JA-04', 'fieldKeysOf returns identities lowercased and de-duped', () => {
  const keys = M.fieldKeysOf({ name: 'Q_17', label: 'Your Code Profile', attrs: { id: 'f1', 'aria-label': 'Your Code Profile', placeholder: 'github.com/you' } });
  assert.ok(keys.includes('f1') && keys.includes('q_17') && keys.includes('your code profile') && keys.includes('github.com/you'));
  assert.strictEqual(keys.filter(k => k === 'your code profile').length, 1, 'de-duped (label == aria-label)');
});

console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
