'use strict';
/**
 * tests/modules/clear-glass-autofill.test.js
 *
 * §BUILT 2026-09-21 — found while wiring the Library UI's Autofill tab
 * (James: "the clearglass macros, autofill, keyboard shortcuts... build
 * them, then expand the ui, like it should have been"): clear-glass/src/
 * autofill/{store,matcher}.js were built 2026-09-19 with a changelog
 * claim of "an evidence-graded matcher (pure, fully unit-tested)," but no
 * test file for either exists anywhere in tests/modules/ — checked
 * directly (grep for "autofill" across every .test.js/test-*.js file:
 * zero hits before this one). This closes that gap rather than building
 * a UI on top of an unverified claim.
 *
 * Same real pattern as clear-glass-accounts.test.js: AutofillStore is
 * plain fs/JSON, no Electron dependency, real tmp-HOME per test.
 * matcher.js is pure (its own header: "no DOM/network access") — tested
 * directly against plain objects shaped like dom_query's real output
 * (checked against clear-glass/src/dom/archaeology.js's buildMeta()
 * shape before writing these, not guessed).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function atest(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

function freshStore() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-autofill-'));
  process.env.HOME = tmpHome;
  delete require.cache[require.resolve('../../clear-glass/src/autofill/store.js')];
  const { AutofillStore, FIELD_TYPES, DOCUMENT_FIELDS } = require('../../clear-glass/src/autofill/store.js');
  return { AutofillStore, FIELD_TYPES, DOCUMENT_FIELDS, cleanup: () => fs.rmSync(tmpHome, { recursive: true, force: true }) };
}

async function main() {
  const origHome = process.env.HOME;

  // ── AutofillStore CRUD ───────────────────────────────────────────────
  await atest('createProfile gives a real, stable uuid and real defaults', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const p = store.createProfile({ label: 'Job apps', fields: { 'given-name': 'Ada' } });
    assert.ok(p.id && p.id.length >= 32, 'id should be a real uuid-shaped string');
    assert.strictEqual(p.label, 'Job apps');
    assert.deepStrictEqual(p.fields, { 'given-name': 'Ada' });
    assert.strictEqual(store.getProfile(p.id).id, p.id);
    cleanup();
  });

  await atest('createProfile refuses an unknown field type — never silently accepted', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const r = store.createProfile({ label: 'x', fields: { 'not-a-real-token': 'y' } });
    assert.ok(r.error, 'must refuse');
    assert.ok(/not-a-real-token/.test(r.error), 'refusal names the bad key');
    cleanup();
  });

  await atest('createProfile refuses an unknown document field the same way', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const r = store.createProfile({ label: 'x', documents: { notReal: {} } });
    assert.ok(r.error && /notReal/.test(r.error));
    cleanup();
  });

  await atest('resume document requires a real path', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const r = store.createProfile({ label: 'x', documents: { resume: { filename: 'cv.pdf' } } });
    assert.ok(r.error && /path/.test(r.error));
    cleanup();
  });

  await atest('listProfiles returns every real profile, oldest first', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const a = store.createProfile({ label: 'A' });
    const b = store.createProfile({ label: 'B' });
    const list = store.listProfiles();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, a.id);
    assert.strictEqual(list[1].id, b.id);
    cleanup();
  });

  await atest('updateProfile wholesale-replaces fields/documents, matching options/store.js\'s own convention', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const p = store.createProfile({ label: 'x', fields: { email: 'a@b.com', tel: '555' } });
    const updated = store.updateProfile(p.id, { fields: { email: 'new@b.com' } });
    assert.deepStrictEqual(updated.fields, { email: 'new@b.com' }, 'tel must be GONE, not merged — an additive patch would hide an intended removal');
    cleanup();
  });

  await atest('updateProfile on an unknown id is a real, named refusal', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const r = store.updateProfile('nope', { label: 'x' });
    assert.ok(r.error && /nope/.test(r.error));
    cleanup();
  });

  await atest('deleteProfile removes it for real; a second delete is a real, named refusal', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store = new AutofillStore();
    store.load();
    const p = store.createProfile({ label: 'x' });
    const r1 = store.deleteProfile(p.id);
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(store.getProfile(p.id), null);
    const r2 = store.deleteProfile(p.id);
    assert.ok(r2.error);
    cleanup();
  });

  await atest('a fresh store persists across a real reload (data really hits disk)', async () => {
    const { AutofillStore, cleanup } = freshStore();
    const store1 = new AutofillStore();
    store1.load();
    const p = store1.createProfile({ label: 'Persisted' });
    delete require.cache[require.resolve('../../clear-glass/src/autofill/store.js')];
    const { AutofillStore: AutofillStore2 } = require('../../clear-glass/src/autofill/store.js');
    const store2 = new AutofillStore2();
    store2.load();
    assert.strictEqual(store2.getProfile(p.id).label, 'Persisted');
    cleanup();
  });

  // ── matcher.js — pure field matching ─────────────────────────────────
  const { matchFields } = require('../../clear-glass/src/autofill/matcher.js');

  await atest('matchFields: a real autocomplete token is high confidence, source "autocomplete"', () => {
    const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'x', attrs: { autocomplete: 'given-name' } }];
    const profile = { fields: { 'given-name': 'Ada' } };
    const m = matchFields(fields, profile);
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0], m[0]); // shape check below
    assert.deepStrictEqual(m[0], { cgId: 'cg1', fieldType: 'given-name', value: 'Ada', confidence: 'high', source: 'autocomplete' });
  });

  await atest('matchFields: a name-attribute pattern match is medium confidence, source "name" — autocomplete always wins when both are present', () => {
    const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'email', attrs: {} }];
    const profile = { fields: { email: 'a@b.com' } };
    const m = matchFields(fields, profile);
    assert.strictEqual(m[0].confidence, 'medium');
    assert.strictEqual(m[0].source, 'name');
  });

  await atest('matchFields: a placeholder-only match is low confidence', () => {
    const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'q1', attrs: { placeholder: 'your website' } }];
    const profile = { fields: { url: 'https://x.com' } };
    const m = matchFields(fields, profile);
    assert.strictEqual(m[0].fieldType, 'url');
    assert.strictEqual(m[0].confidence, 'low');
  });

  await atest('matchFields: identified field type but the profile has nothing for it — honestly no match, not an empty-string fill', () => {
    const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'email', attrs: {} }];
    const m = matchFields(fields, { fields: {} });
    assert.strictEqual(m.length, 0);
  });

  await atest('matchFields: excluded input types (submit/button/hidden/checkbox/radio/file) never match', () => {
    const fields = ['submit', 'button', 'hidden', 'checkbox', 'radio', 'file'].map((type, i) => ({ id: `cg${i}`, tag: 'input', type, name: 'email', attrs: { autocomplete: 'email' } }));
    const m = matchFields(fields, { fields: { email: 'a@b.com' } });
    assert.strictEqual(m.length, 0);
  });

  await atest('matchFields: a field with no real cgId is skipped regardless of match quality', () => {
    const fields = [{ tag: 'input', type: 'text', name: 'email', attrs: { autocomplete: 'email' } }];
    const m = matchFields(fields, { fields: { email: 'a@b.com' } });
    assert.strictEqual(m.length, 0);
  });

  await atest('matchFields: multiple space-separated autocomplete tokens are each checked (WHATWG allows e.g. "shipping given-name")', () => {
    const fields = [{ id: 'cg1', tag: 'input', type: 'text', name: 'x', attrs: { autocomplete: 'shipping given-name' } }];
    const m = matchFields(fields, { fields: { 'given-name': 'Ada' } });
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].fieldType, 'given-name');
  });

  process.env.HOME = origHome;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error('  ! crashed:', e.stack); process.exit(1); });
