'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-learn-save.test.js — JA2 (0.60.226).
 * James, 2026-10-23: "then the phases with the per site settings." A picked field is saved per-origin in site-settings
 * (autofill.field.<key> = fieldType); the fill path reads it back as the learned map, so on that site it fills every time.
 *
 *   JA2-01  learnKey + learnedFromSettings round-trip (pure); only autofill.field.* keys are read, prefix stripped
 *   JA2-02  a pick saved through the real SiteSettingsStore is per-origin: this origin sees it, another does not
 *   JA2-03  end-to-end: a pick saved to the store drives matchFields to fill a pattern-missed field on that site
 */
const assert = require('assert');
const M = require('../../clear-glass/src/autofill/matcher.js');
const { SiteSettingsStore } = require('../../clear-glass/src/site-settings/store.js');

let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };

t('JA2-01', 'learnKey / learnedFromSettings round-trip, prefix-scoped', () => {
  assert.strictEqual(M.learnKey('Your Code Profile'), 'autofill.field.your code profile');
  const all = { 'autofill.field.your code profile': 'github', 'autofill.field.linked': 'linkedin', 'autofill.enabled': true, 'macros.enabled': false };
  const learned = M.learnedFromSettings(all);
  assert.deepStrictEqual(learned, { 'your code profile': 'github', linked: 'linkedin' }, 'only autofill.field.* keys, prefix stripped');
});

t('JA2-02', 'a saved pick is per-origin', () => {
  const store = new SiteSettingsStore(); store._persist = () => {};   // in-memory only
  const url = 'https://micro1.ai/apply/123?x=1';
  assert.ok(store.set(url, M.learnKey('your code profile'), 'github'));
  const here = M.learnedFromSettings(store.getAllForOrigin(url));
  assert.deepStrictEqual(here, { 'your code profile': 'github' });
  const elsewhere = M.learnedFromSettings(store.getAllForOrigin('https://mercor.com/apply'));
  assert.deepStrictEqual(elsewhere, {}, 'another origin does not see this pick');
});

t('JA2-03', 'a saved pick drives matchFields to fill a pattern-missed field', () => {
  const store = new SiteSettingsStore(); store._persist = () => {};
  const url = 'https://micro1.ai/apply/123';
  store.set(url, M.learnKey('your code profile'), 'github');
  const learned = M.learnedFromSettings(store.getAllForOrigin(url));
  const profile = { fields: { github: 'https://github.com/jamesbrooks' } };
  const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'q_17abc', label: 'Your code profile', attrs: {} }];
  assert.strictEqual(M.matchFields(fields, profile, {}).length, 0, 'unlearned: missed');
  const got = M.matchFields(fields, profile, { learned });
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].fieldType, 'github');
  assert.strictEqual(got[0].value, 'https://github.com/jamesbrooks');
  assert.strictEqual(got[0].source, 'learned');
});

console.log(`\n  ${p} passed, ${f} failed`);
process.exit(f ? 1 : 0);
