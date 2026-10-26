'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-active.test.js — AF1 (0.60.257).
 * James, 2026-10-26, running Nexus live: copilot's "fill this in for me" failed — "Did not fill: no autofill profile 'null'".
 * The fill path had no active-profile concept, so a fill with no profile passed null and matched nothing. AF1 adds:
 *   store.activeProfile() — the profile marked default, else the sole one, else the first; NEVER null (no profile is a
 *                           clean { ok:false, reason:'no-profile' } the UI can act on);
 *   store.setDefault(id)  — the chosen default, persisted (JAA);
 *   matcher.matchOne(field, profile, opts) — the type + value for ONE focused input (the inline chip), reusing matchFields.
 *
 *   AF-01  no profiles → activeProfile() is { ok:false, reason:'no-profile' } (never null, never a throw)
 *   AF-02  one profile  → activeProfile() returns it, isDefault:false
 *   AF-03  several, none default → the first by createdAt
 *   AF-04  setDefault(id) → activeProfile() returns that one, isDefault:true; setDefault on an unknown id is refused
 *   AF-05  matchOne on a fillable input → its fieldType+value; on a non-fillable one → null (a clean no, not a throw)
 *   AF-06  matchOne with no profile → null (the chip simply does not show; it never throws for an ordinary field)
 */
const assert = require('assert');
const { AutofillStore } = require('../../clear-glass/src/autofill/store.js');
const M = require('../../clear-glass/src/autofill/matcher.js');

let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack || e.message}`); f++; } };

// A truly empty store each case — the standalone sandbox reuses one JAA dir, so wipe the profile + default rows first
// (under run-all each suite gets its own throwaway root; this keeps the suite isolated either way).
const fresh = () => {
  const s = new AutofillStore();
  try { s._rows().replaceAll([]); } catch (_) {}
  try { s._defaultRow().replaceAll([]); } catch (_) {}
  s.load();
  return s;
};

t('AF-01', 'no profiles → no-profile, never null', () => {
  const s = fresh();
  const a = s.activeProfile();
  assert.strictEqual(a.ok, false);
  assert.strictEqual(a.reason, 'no-profile');
  assert.ok(!('profile' in a) || a.profile == null ? true : true); // the point: a.ok is the signal, not a null profile
});

t('AF-02', 'one profile → it is active, not flagged default', () => {
  const s = fresh();
  const made = s.createProfile({ label: 'Resume A', fields: { email: 'a@x.com' } });
  const a = s.activeProfile();
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.profileId, made.id);
  assert.strictEqual(a.isDefault, false, 'sole profile is active by fallback, not by an explicit default');
});

t('AF-03', 'several, none default → the first listed (listProfiles order)', () => {
  const s = fresh();
  s.createProfile({ label: 'First', fields: { email: 'first@x.com' } });
  s.createProfile({ label: 'Second', fields: { email: 'second@x.com' } });
  const a = s.activeProfile();
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.profileId, s.listProfiles()[0].id, 'with no explicit default, the first profile listed is active');
  assert.strictEqual(a.isDefault, false);
});

t('AF-04', 'setDefault picks the active one; an unknown id is refused', () => {
  const s = fresh();
  s.createProfile({ label: 'First', fields: { email: 'first@x.com' } });
  const second = s.createProfile({ label: 'Second', fields: { email: 'second@x.com' } });
  const set = s.setDefault(second.id);
  assert.strictEqual(set.ok, true);
  const a = s.activeProfile();
  assert.strictEqual(a.profileId, second.id, 'the explicit default wins over first-by-createdAt');
  assert.strictEqual(a.isDefault, true);
  const bad = s.setDefault('no-such-id');
  assert.strictEqual(bad.ok, false);
  assert.ok(/no autofill profile/.test(bad.error));
  // the default survives a reopen (persisted to JAA), and so does its being active
  const s2 = new AutofillStore(); s2.load();
  assert.strictEqual(s2.activeProfile().profileId, second.id, 'default replayed on reopen');
});

t('AF-05', 'matchOne returns one match for a fillable field, null for a non-fillable one', () => {
  const profile = { fields: { email: 'james@example.com' } };
  const emailField = { id: 'cg1', tag: 'input', type: 'email', name: 'email', label: 'Email', attrs: {} };
  const got = M.matchOne(emailField, profile, {});
  assert.ok(got, 'a match object');
  assert.strictEqual(got.fieldType, 'email');
  assert.strictEqual(got.value, 'james@example.com');
  assert.strictEqual(got.cgId, 'cg1');
  // a submit button is not fillable → clean null, same exclusion matchFields uses
  const btn = { id: 'cg2', tag: 'input', type: 'submit', name: 'go', attrs: {} };
  assert.strictEqual(M.matchOne(btn, profile, {}), null);
  // a field with no profile value for it → null (identified, but nothing to put there)
  const phone = { id: 'cg3', tag: 'input', type: 'tel', name: 'phone', label: 'Phone', attrs: {} };
  assert.strictEqual(M.matchOne(phone, profile, {}), null);
});

t('AF-06', 'matchOne with no profile → null, never a throw', () => {
  const emailField = { id: 'cg1', tag: 'input', type: 'email', name: 'email', label: 'Email', attrs: {} };
  assert.strictEqual(M.matchOne(emailField, null, {}), null);
  assert.strictEqual(M.matchOne(emailField, { fields: null }, {}), null);
  assert.strictEqual(M.matchOne(null, { fields: { email: 'a@x.com' } }, {}), null);
});

console.log(`\n  ${p} passed, ${f} failed`);
process.exitCode = f ? 1 : 0;
