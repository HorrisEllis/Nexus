'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-fill-active.test.js — AF2 (0.60.258).
 * James, 2026-10-26, drowning in job applications: "the autofill needs to be working. job applications. i need clearglass to
 * do the repititve work." The live blocker was "Did not fill: no autofill profile 'null'": a fill with no profileId resolved
 * to null and getProfile(null) failed. AF2 makes matcher._siteChoice fall back to the ACTIVE profile (AF1), so fillFields and
 * detectFields — and therefore every door that calls them (copilot, the context menu, the routes) — fill from the active
 * profile when none is named. No profile at all is a clean, actionable error, never a null lookup.
 *
 *   AF2-01  fillFields with NO profileId fills from the active profile (the copilot/agent path) — the fields are filled
 *   AF2-02  fillFields with ZERO profiles → { error, noProfile:true }, not "no autofill profile 'null'"
 *   AF2-03  detectFields with NO profileId previews from the active profile
 *   AF2-04  an explicit profileId still wins over the active one
 */
const assert = require('assert');
const { AutofillStore } = require('../../clear-glass/src/autofill/store.js');
const M = require('../../clear-glass/src/autofill/matcher.js');

let p = 0, f = 0;
const t = (id, d, fn) => fn().then(() => { console.log(`  ✓ ${id} ${d}`); p++; }).catch(e => { console.error(`  ✗ ${id} ${d}\n    ${e.stack || e.message}`); f++; });

const fresh = () => {
  const s = new AutofillStore();
  try { s._rows().replaceAll([]); } catch (_) {}
  try { s._defaultRow().replaceAll([]); } catch (_) {}
  s.load();
  return s;
};

// a fake dom mesh: no webContents (so no site URL → the active-profile fallback is what runs), a couple of fillable fields,
// and a mutate that records what got typed. The real dom (src/dom/archaeology.js) has the same handleQuery/handleMutate shape.
function fakeDom(filledInto) {
  return {
    _getWebContents: () => null,
    handleQuery: async () => ([
      { id: 'cg-email', tag: 'input', type: 'email', name: 'email', label: 'Email', attrs: {} },
      { id: 'cg-name',  tag: 'input', type: 'text',  name: 'name',  label: 'Full name', attrs: {} },
    ]),
    handleMutate: async ({ cgId, mutation }) => { filledInto.push({ cgId, value: mutation.value }); return { ok: true }; },
  };
}

(async () => {

await t('AF2-01', 'fill with NO profileId fills from the active profile', async () => {
  const s = fresh();
  s.createProfile({ label: 'Me', fields: { email: 'james@example.com', name: 'James Brooks' } });
  const filled = [];
  const r = await M.fillFields(fakeDom(filled), s, {});            // no profileId — the copilot/agent case
  assert.ok(!r.error, `should not error, got: ${r.error}`);
  assert.ok(r.profileId, 'resolved to the active profile id');
  assert.ok(filled.find(x => x.value === 'james@example.com'), 'the email field was filled from the active profile');
  assert.ok(filled.find(x => x.value === 'James Brooks'), 'the name field was filled from the active profile');
});

await t('AF2-02', 'fill with ZERO profiles → clean error, never "null"', async () => {
  const s = fresh();                                               // no profiles at all
  const filled = [];
  const r = await M.fillFields(fakeDom(filled), s, {});
  assert.ok(r.error, 'an error');
  assert.strictEqual(r.noProfile, true, 'flagged noProfile so the UI can offer "create a profile"');
  assert.ok(!/['"]null['"]/.test(r.error), `the error must not be the null-lookup bug, got: ${r.error}`);
  assert.strictEqual(filled.length, 0, 'nothing was typed');
});

await t('AF2-03', 'detect with NO profileId previews from the active profile', async () => {
  const s = fresh();
  s.createProfile({ label: 'Me', fields: { email: 'james@example.com' } });
  const r = await M.detectFields(fakeDom([]), s, {});
  assert.ok(!r.error, `should not error, got: ${r.error}`);
  assert.ok(r.profileId, 'resolved to the active profile');
  assert.ok(Array.isArray(r.matches) && r.matches.find(m => m.fieldType === 'email'), 'previewed the email match');
});

await t('AF2-04', 'an explicit profileId still wins over the active one', async () => {
  const s = fresh();
  s.createProfile({ label: 'First', fields: { email: 'first@x.com' } });
  const second = s.createProfile({ label: 'Second', fields: { email: 'second@x.com' } });
  s.setDefault(s.listProfiles()[0].id);                            // make the FIRST the active/default
  const filled = [];
  const r = await M.fillFields(fakeDom(filled), s, { profileId: second.id });  // explicitly ask for the second
  assert.strictEqual(r.profileId, second.id, 'explicit wins');
  assert.ok(filled.find(x => x.value === 'second@x.com'), 'filled from the explicit profile, not the default');
});

  console.log(`\n  ${p} passed, ${f} failed`);
  process.exitCode = f ? 1 : 0;
})();
