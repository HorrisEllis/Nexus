'use strict';
/**
 * tests/modules/test-autofill-learn-ui.test.js — JA4 (0.60.231): the learn-loop on screen. The screen is driven in Clear Glass (glass.js).
 * Map: docs/2026-10-19-gig-autofill-and-learn-phasemap.spec JA4_the_learn_loop_ui
 * James, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per site
 * settings ... and updates the autofill." · 2026-10-24: "continue" (after JA3).
 *
 * The page's ClearGlass.autofill.{pick, learned, forget} reach the REAL learn-pick.js over a real per-origin store (the pick's tab is a
 * fake one: no live page here); everything else is the preload stub.
 *   JA4-01  listLearned across sites (only autofill.field.* keys); forgetLearned removes one and leaves the site's other settings (pure)
 *   JA4-02  Settings › Autofill › Fill a tab: a Fill that leaves github unplaced shows "Pick GitHub URL"; the Pick saves for that site,
 *           says what it learned, and the "Fields it learned" pane lists it
 *   JA4-03  Forget removes it from the store and the list; a cancelled pick says nothing was saved; no page error
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const { initScript } = require(CG('src/driver/cg-stub.js'));
const LP = require(CG('src/autofill/learn-pick.js'));
const M = require(CG('src/autofill/matcher.js'));
const { SiteSettingsStore } = require(CG('src/site-settings/store.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
const memStore = () => { const s = new SiteSettingsStore(); s._persist = () => {}; return s; };
const URL_ = 'https://micro1.ai/apply/123';
const profile = { id: 'p1', label: 'Job applications', fields: { email: 'j@x.com', github: 'https://github.com/jamesbrooks' }, documents: {} };
const page = () => [
  { id: 'cg-1', tag: 'input', type: 'email', name: 'email', label: 'Email', attrs: {} },
  { id: 'cg-2', tag: 'input', type: 'text', name: 'q_8f3a2c91', label: 'Your code profile', attrs: {} },
];

// the page's autofill.pick / learned / forget → the real learn-pick.js; the pick's tab answers with a pick of the code-profile box
async function wire(pg, store, { cancel = false } = {}) {
  const wc = { getURL: () => URL_, async executeJavaScript(src) { return /pickField/.test(src) ? (cancel ? { cancelled: true } : { xpath: '/html/body/input[2]' }) : page()[1]; } };
  const dom = { _getWebContents: () => wc, async handleQuery() { return page(); }, async handleMutate() { return { ok: true }; } };
  await pg.exposeFunction('__af', async (op, a) => {
    if (op === 'pick') return LP.pickAndLearn({ wc, dom, autofillStore: { getProfile: () => profile }, siteSettings: store, ...a[0], pickerSource: 'x' });
    if (op === 'learned') return { ok: true, learned: LP.listLearned(store, a[0] || null) };
    return LP.forgetLearned(store, a[0], a[1]);
  });
  await pg.addInitScript(`(() => { const f = (op) => (...a) => window.__af(op, a); Object.assign(window.ClearGlass.autofill, { pick: f('pick'), learned: f('learned'), forget: f('forget') }); })();`);
}
const fillAnswer = () => { const matches = M.matchFields(page(), profile); return { profileId: 'p1', totalFields: 2, filled: matches.map(m => ({ cgId: m.cgId, fieldType: m.fieldType })), skipped: [], failed: [], needsPick: LP.needsPick(page(), profile, matches) }; };
const answers = () => ({ 'autofill.listProfiles': [profile], 'api.get': {}, 'window.list': { windows: ['apply'] }, 'bgTabs.list': [], 'autofill.fill': fillAnswer(),
  'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {}, 'providers.list': [] });
const clickText = (pg, sel, text) => pg.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim() === t); if (!b) throw new Error(`no ${s} "${t}"`); b.click(); }, [sel, text]);
const bodyText = (pg) => pg.evaluate(() => document.body.innerText);

(async () => {
  console.log('\n⬡  the autofill learn-loop on screen — Pick what a fill could not place; the fields it learned, and Forget\n');
  await test('JA4-01', 'listLearned across sites; forgetLearned removes one only', () => {
    const s = memStore();
    s.set(URL_, M.learnKey('your code profile'), 'github'); s.set(URL_, 'autofill.enabled', true);
    s.set('https://mercor.com/x', M.learnKey('linked'), 'linkedin');
    assert.deepStrictEqual(LP.listLearned(s), [{ origin: 'https://mercor.com', fieldKey: 'linked', fieldType: 'linkedin' }, { origin: 'https://micro1.ai', fieldKey: 'your code profile', fieldType: 'github' }]);
    assert.deepStrictEqual(LP.listLearned(s, URL_).map(l => l.fieldKey), ['your code profile']);
    const r = LP.forgetLearned(s, URL_, 'Your Code Profile');
    assert.deepStrictEqual([r.ok, r.origin, r.fieldKey], [true, 'https://micro1.ai', 'your code profile']);
    assert.deepStrictEqual(s.getAllForOrigin(URL_), { 'autofill.enabled': true }, 'the site\'s other settings stay');
    assert.ok(/nothing learned/.test(LP.forgetLearned(s, URL_, 'your code profile').error), 'twice: says there is nothing to forget');
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - JA4-02/03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${glass.engine().kind}`);
  try {
    await test('JA4-02', 'Fill → "Pick GitHub URL" → saved for the site, said, and listed under Fields it learned', async () => {
      const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = []; pg.on('pageerror', e => errors.push(e.message));
      const store = memStore();
      await pg.addInitScript(initScript({ answers: answers() })); await wire(pg, store);
      await pg.goto(pathToFileURL(CG('renderer/settings.html')).href + '#autofill');
      await pg.waitForFunction(() => /Fields it learned/.test(document.body.innerText), null, { timeout: 10000 });
      assert.ok(/Nothing learned yet/.test(await bodyText(pg)), 'empty at first, and says how to teach one');
      await clickText(pg, 'button', 'Fill a tab');
      await pg.waitForSelector('.modal');
      await clickText(pg, '.modal button', 'Fill');
      await pg.waitForFunction(() => [...document.querySelectorAll('.modal button')].some(b => b.textContent === 'Pick GitHub URL'), null, { timeout: 5000 });
      assert.ok(/Not placed on this page \(1\): GitHub URL/.test(await bodyText(pg)));
      await clickText(pg, '.modal button', 'Pick GitHub URL');
      await pg.waitForFunction(() => /Learned for https:\/\/micro1\.ai: "your code profile" is GitHub URL/.test(document.body.innerText), null, { timeout: 5000 });
      assert.deepStrictEqual(LP.listLearned(store), [{ origin: 'https://micro1.ai', fieldKey: 'your code profile', fieldType: 'github' }], 'saved in the real store');
      assert.ok(!(await pg.evaluate(() => [...document.querySelectorAll('.modal button')].some(b => b.textContent === 'Pick GitHub URL'))), 'its Pick goes once placed');
      await pg.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => /close|✕|×|Cancel|Done/i.test(b.textContent) || b.getAttribute('aria-label') === 'Close')?.click());
      await pg.keyboard.press('Escape');
      await pg.waitForFunction(() => /“your code profile”/.test(document.body.innerText), null, { timeout: 5000 });
      assert.ok(/https:\/\/micro1\.ai/.test(await bodyText(pg)) && /is GitHub URL/.test(await bodyText(pg)), 'the learned pane lists it by site');
      assert.deepStrictEqual(errors, []); await pg.close();
    });

    await test('JA4-03', 'Forget removes it from the store and the list; a cancelled pick saves nothing and says so', async () => {
      const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = []; pg.on('pageerror', e => errors.push(e.message));
      const store = memStore(); store.set(URL_, M.learnKey('your code profile'), 'github'); store.set(URL_, 'autofill.enabled', true);
      await pg.addInitScript(initScript({ answers: answers() })); await wire(pg, store, { cancel: true });
      await pg.goto(pathToFileURL(CG('renderer/settings.html')).href + '#autofill');
      await pg.waitForFunction(() => /“your code profile”/.test(document.body.innerText), null, { timeout: 10000 });
      await clickText(pg, 'button', 'Forget');
      await pg.waitForSelector('.modal');
      await clickText(pg, '.modal button', 'Forget');
      await pg.waitForFunction(() => /Nothing learned yet/.test(document.body.innerText), null, { timeout: 5000 });
      assert.deepStrictEqual(store.getAllForOrigin(URL_), { 'autofill.enabled': true }, 'forgotten in the real store; the site\'s other settings stay');
      await clickText(pg, 'button', 'Fill a tab');
      await pg.waitForSelector('.modal'); await clickText(pg, '.modal button', 'Fill');
      await pg.waitForFunction(() => [...document.querySelectorAll('.modal button')].some(b => b.textContent === 'Pick GitHub URL'), null, { timeout: 5000 });
      await clickText(pg, '.modal button', 'Pick GitHub URL');
      await pg.waitForFunction(() => /Cancelled — nothing saved for GitHub URL/.test(document.body.innerText), null, { timeout: 5000 });
      assert.deepStrictEqual(LP.listLearned(store), [], 'a cancel saves nothing');
      assert.deepStrictEqual(errors, []); await pg.close();
    });
  } finally { await browser.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }
