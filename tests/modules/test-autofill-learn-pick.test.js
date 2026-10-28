'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-learn-pick.test.js — JA3 (0.60.230).
 * James, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per
 * site settings ... and updates the autofill." · 2026-10-24: "ja3".
 *
 *   JA3-01  needsPick: the profile's types no field took (unplaced), and the page's fillable boxes nothing matched (unmatched)
 *   JA3-02  chooseKey: a stable unique key over a generated one; a key shared with another field is refused, with why
 *   JA3-03  pickAndLearn on a fake tab: the pick is resolved, saved per-site through saveLearned, and the page is filled again
 *   JA3-04  a cancel saves nothing; a pick on a button is refused; an unknown fieldType is refused before the picker opens
 *   JA3-05  the page scripts parse (the picker script carries the real renderer/guardian-picker.js), and fillFields reports needsPick
 */
const assert = require('assert');
const LP = require('../../clear-glass/src/autofill/learn-pick.js');
const M = require('../../clear-glass/src/autofill/matcher.js');
const { SiteSettingsStore } = require('../../clear-glass/src/site-settings/store.js');

let p = 0, f = 0; const q = [];
const t = (id, d, fn) => q.push(async () => { try { await fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); f++; } });

const URL_ = 'https://micro1.ai/apply/123';
const profile = { id: 'p1', fields: { email: 'j@x.com', github: 'https://github.com/jamesbrooks' }, documents: {} };
const page = () => [
  { id: 'cg-1', tag: 'input', type: 'email', name: 'email', label: 'Email', attrs: {} },
  { id: 'cg-2', tag: 'input', type: 'text', name: 'q_8f3a2c91', label: 'Your code profile', attrs: {} },
  { id: 'cg-3', tag: 'button', type: 'submit', name: 'go', label: null, attrs: {} },
];
function memStore() { const s = new SiteSettingsStore(); s._persist = () => {}; return s; }
function fakeTab({ pick, field }) {
  const typed = [];
  const wc = { getURL: () => URL_, scripts: 0,
    async executeJavaScript(src) { wc.scripts++; return /pickField/.test(src) ? pick : field; } };
  const dom = { _getWebContents: () => wc, typed,
    async handleQuery() { return page(); },
    async handleMutate({ cgId, mutation }) { typed.push([cgId, mutation.value]); return { ok: true }; } };
  return { wc, dom };
}
const autofillStore = { getProfile: () => profile };

t('JA3-01', 'needsPick lists unplaced types and unmatched boxes', () => {
  const matches = M.matchFields(page(), profile);
  assert.deepStrictEqual(matches.map(m => m.fieldType), ['email']);
  const n = LP.needsPick(page(), profile, matches);
  assert.deepStrictEqual(n.unplaced, ['github'], 'github has a value and no field took it');
  assert.deepStrictEqual(n.unmatched.map(u => u.cgId), ['cg-2'], 'the button is not a box; the email box matched');
  assert.strictEqual(n.unmatched[0].label, 'Your code profile');
});

t('JA3-02', 'chooseKey: stable and unique first; shared refused', () => {
  const [, code] = page();
  assert.deepStrictEqual(LP.chooseKey(code, page()), { key: 'your code profile', stable: true }, 'the generated name q_8f3a2c91 is passed over');
  const dup = [...page(), { id: 'cg-9', tag: 'input', type: 'text', name: 'other', label: 'Your code profile', attrs: {} }];
  const r = LP.chooseKey({ ...code, name: 'q_8f3a2c91' }, dup);
  assert.deepStrictEqual(r, { key: 'q_8f3a2c91', stable: false }, 'label shared → the unique (generated) name, said as unstable');
  const both = [...dup, { id: 'cg-10', tag: 'textarea', name: 'q_8f3a2c91', attrs: {} }];
  assert.ok(LP.chooseKey(code, both).error.includes('shared with another field'));
  assert.ok(LP.chooseKey({ id: 'cg-x', tag: 'input', attrs: {} }, page()).error.includes('no id, name, label'));
});

t('JA3-03', 'pickAndLearn: pick → saved per-site → filled again', async () => {
  const siteSettings = memStore();
  const { wc, dom } = fakeTab({ pick: { xpath: '/html/body/form/input[2]', tag: 'input', url: URL_ }, field: page()[1] });
  const r = await LP.pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType: 'github', pickerSource: '/* picker */' });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.fieldKey, 'your code profile'); assert.strictEqual(r.origin, 'https://micro1.ai'); assert.strictEqual(r.stable, true);
  assert.deepStrictEqual(M.learnedFromSettings(siteSettings.getAllForOrigin(URL_)), { 'your code profile': 'github' }, 'saved in site-settings');
  assert.deepStrictEqual(M.learnedFromSettings(siteSettings.getAllForOrigin('https://mercor.com/')), {}, 'only for that site');
  assert.ok(dom.typed.some(([id, v]) => id === 'cg-2' && v === 'https://github.com/jamesbrooks'), 'the refill typed github into the picked box');
  assert.deepStrictEqual(r.fill.needsPick.unplaced, [], 'nothing left unplaced after the pick');
  assert.strictEqual(wc.scripts, 2, 'one picker run, one resolve');
});

t('JA3-04', 'cancel saves nothing; a button is refused; unknown type refused first', async () => {
  const siteSettings = memStore();
  let { wc, dom } = fakeTab({ pick: { cancelled: true }, field: null });
  let r = await LP.pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType: 'github', pickerSource: '' + 'x' });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.cancelled, true);
  assert.deepStrictEqual(siteSettings.getAllForOrigin(URL_), {}, 'nothing saved on cancel');
  ({ wc, dom } = fakeTab({ pick: { xpath: '/html/body/button' }, field: page()[2] }));
  r = await LP.pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType: 'github', pickerSource: 'x' });
  assert.strictEqual(r.ok, false); assert.ok(/not one that takes text/.test(r.error), r.error);
  ({ wc, dom } = fakeTab({ pick: { xpath: '/x' }, field: { error: 'that is a <div>, not a field you type into — pick the box itself' } }));
  r = await LP.pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType: 'github', pickerSource: 'x' });
  assert.ok(/not a field you type into/.test(r.error));
  ({ wc, dom } = fakeTab({ pick: null, field: null }));
  r = await LP.pickAndLearn({ wc, dom, autofillStore, siteSettings, fieldType: 'gitbub', pickerSource: 'x' });
  assert.ok(/unknown fieldType "gitbub"/.test(r.error)); assert.strictEqual(wc.scripts, 0, 'the picker never opened');
  assert.deepStrictEqual(siteSettings.getAllForOrigin(URL_), {}, 'still nothing saved');
});

t('JA3-05', 'page scripts parse with the real picker; fillFields reports needsPick', async () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../clear-glass/renderer/guardian-picker.js'), 'utf8');
  new Function(LP.pickScript('the github field', src));   // throws on a syntax error
  new Function(LP.resolveScript('//*[@id="a"]'));
  const { dom } = fakeTab({ pick: null, field: null });
  const r = await M.fillFields(dom, autofillStore, {});
  assert.deepStrictEqual(r.needsPick.unplaced, ['github']);
  assert.deepStrictEqual(r.needsPick.unmatched.map(u => u.cgId), ['cg-2']);
  const saved = LP.saveLearned(memStore(), URL_, ' Your Code Profile ', 'github');
  assert.deepStrictEqual([saved.ok, saved.fieldKey, saved.origin], [true, 'your code profile', 'https://micro1.ai']);
  assert.strictEqual(LP.saveLearned(memStore(), null, 'a', 'github').ok, false);
});

(async () => { for (const fn of q) await fn(); console.log(`\n  ${p} passed, ${f} failed`); process.exit(f ? 1 : 0); })();
