'use strict';
/**
 * tests/modules/test-site-settings-ui.test.js — one site's settings by feature, on screen (SP3, 0.60.217). Driven in Clear Glass (glass.js).
 * Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP3 · Spec: clear-glass/spec/site-profile.spec MOD-SP-UI
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 * The page's ClearGlass.siteProfile calls reach the REAL resolver (profile.js over the real per-origin store and a real net service) through
 * the engine's exposeFunction; everything else is the preload stub.
 *   SU-01  the toolbar's Site Settings popup: this tab's site, nine feature groups from the key table; a value set reads "this site", ↺ goes
 *          back to "default"; an out-of-range value shows its why and changes nothing; the network route becomes the site's netPolicy rule
 *   SU-02  Settings › Sites: Edit shows the same groups; a change waits for Save, then is written; feature keys are not repeated under
 *          "Other stored values"
 *   SU-03  a page that is not a website says so; no page error
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const { initScript } = require(CG('src/driver/cg-stub.js'));
const { createSiteProfile } = require(CG('src/site-settings/profile.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
function realStore() { const { SiteSettingsStore } = require(CG('src/site-settings/store.js')); const s = new SiteSettingsStore(); s._persist = () => {}; return s; }
function realNet() { const { NetService } = require(CG('src/net/service.js')); let p = null; const n = new NetService({ store: { get: () => p, set: (v) => { p = v; } }, log: () => {} }); n.reapplyAll = async () => {}; return n; }
const BRIDGE = `(() => { const sp = (op) => (...a) => window.__sp(op, a); window.ClearGlass.siteProfile = { get: sp('get'), set: sp('set'), clear: sp('clear'), keys: sp('keys') }; })();`;

async function wire(page) {
  const net = realNet(); const store = realStore();
  const P = createSiteProfile({ store, net, options: { get: () => ({ driver: { navTimeoutMs: 45000 } }) } });
  await page.exposeFunction('__sp', (op, a) => {
    if (op === 'get') return P.siteProfile(a[0]);
    if (op === 'set') return P.setSite(a[0], a[1], a[2], { by: 'person' });
    if (op === 'clear') return P.clearSite(a[0], a[1]);
    return { keys: P.KEYS, features: P.FEATURES };
  });
  return { P, net, store };
}
const rowSel = (key, inner = '') => `.sp-row[data-key="${key}"] ${inner}`.trim();

(async () => {
  console.log('\n⬡  site settings on screen — one site\'s settings by feature\n');
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - SU SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${glass.engine().kind}`);
  const stubAnswers = { 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {}, 'providers.list': [],
    'autofill.listProfiles': [{ id: 'cv', label: 'My CV' }], 'accounts.list': [{ id: 'work', label: 'Work' }], 'macros.list': { macros: [{ name: 'expand-all' }] } };
  try {
    await test('SU-01', 'the toolbar popup: ten groups from the key table (accessibility added 0.60.273); set → this site, ↺ → default; a refused value says why; the route is a rule', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const { P, net } = await wire(page);
      await page.addInitScript(initScript({ answers: stubAnswers })); await page.addInitScript(BRIDGE);
      await page.goto(pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.evaluate(() => { document.getElementById('wv').getURL = () => 'https://shop.example/cart'; });
      await page.evaluate(() => window.CGShell.siteSettings());
      await page.waitForSelector('#site-settings-panel .sp-group');
      assert.strictEqual(await page.innerText('#site-settings-panel .sp-host'), 'shop.example');
      const groups = await page.$$eval('#site-settings-panel .sp-group', els => els.map(e => e.dataset.feature));
      assert.deepStrictEqual(groups, ['autofill', 'macros', 'workflows', 'pipelines', 'passwords', 'network', 'resume', 'accessibility', 'driver', 'gates', 'mesh', 'guardian']);   // 2026-10-30: pipelines, gates
      const rows = await page.$$eval('#site-settings-panel .sp-row', els => els.length);
      assert.strictEqual(rows, P.KEYS.filter(k => !k.panel).length + 1, 'one row per key (a key with its own panel, AC2 accessibility.keepOff, is drawn there), and the network route');
      assert.strictEqual(await page.innerText(rowSel('driver.navTimeoutMs', '.sp-tag')), 'Settings', 'the global option is named as Settings');
      // set: Agents may drive → Off
      await page.selectOption(rowSel('driver.allowed', 'select'), 'false');
      await page.waitForFunction(() => { const t = document.querySelector('.sp-row[data-key="driver.allowed"] .sp-tag'); return t && t.textContent === 'this site'; }, null, { timeout: 5000 });
      assert.strictEqual(P.siteProfile('https://shop.example/').driver.allowed, false);
      assert.strictEqual(P.siteProfile('https://shop.example/').from['driver.allowed'], 'site');
      // ↺ back to the default
      await page.click(rowSel('driver.allowed', '.sp-reset'));
      await page.waitForFunction(() => document.querySelector('.sp-row[data-key="driver.allowed"] .sp-tag').textContent === 'default', null, { timeout: 5000 });
      assert.strictEqual(P.siteProfile('https://shop.example/').from['driver.allowed'], 'default');
      // refused: out of range → the why on the row, nothing written
      await page.fill(rowSel('driver.navTimeoutMs', 'input'), '5');
      await page.evaluate(() => document.querySelector('.sp-row[data-key="driver.navTimeoutMs"] input').dispatchEvent(new Event('change')));
      await page.waitForFunction(() => { const n = document.querySelector('.sp-row[data-key="driver.navTimeoutMs"] .sp-note'); return n && !n.hidden; }, null, { timeout: 5000 });
      assert.match(await page.innerText(rowSel('driver.navTimeoutMs', '.sp-note')), /between 1000 and 300000/);
      assert.strictEqual(P.siteProfile('https://shop.example/').driver.navTimeoutMs, 45000, 'unchanged');
      // the network route: through Snowflake = one netPolicy rule for the host
      await page.selectOption(rowSel('network.via', 'select'), 'transport');
      await page.waitForFunction(() => document.querySelector('.sp-row[data-key="network.via"] .sp-tag').textContent === 'this site', null, { timeout: 5000 });
      assert.deepStrictEqual(net.policy().rules.map(r => [r.id, r.via]), [['site.shop.example', 'transport']]);
      // a list's choices are offered (autofill profiles)
      assert.ok(await page.$eval(rowSel('autofill.profileId', 'datalist'), d => [...d.options].some(o => o.value === 'cv')));
      await page.screenshot({ path: path.join(require('os').tmpdir(), 'su-01-popup.png') }).catch(() => {});
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('SU-02', 'Settings › Sites: Edit shows the groups; a change waits for Save; feature keys are not "other stored values"', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const { P, store } = await wire(page);
      store.set('https://shop.example/', 'driver.allowed', false);
      await page.addInitScript(initScript({ answers: { ...stubAnswers, 'siteSettings.listOrigins': ['https://shop.example'],
        'siteSettings.getAll': { 'driver.allowed': false, zoomFactor: 1.25, 'my.plugin.key': 'x' } } }));
      await page.addInitScript(BRIDGE);
      await page.goto(pathToFileURL(CG('renderer/settings.html')).href + '#sites');
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Edit'), null, { timeout: 10000 });
      assert.ok(/driver\.allowed: off/.test(await page.evaluate(() => document.body.innerText)), 'the list shows the feature key');
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Edit').click());
      await page.waitForSelector('.modal .sp-group');
      assert.strictEqual(await page.innerText('.modal ' + rowSel('driver.allowed', '.sp-tag')), 'this site');
      const others = await page.$$eval('.modal .kv code', els => els.map(e => e.textContent));
      assert.deepStrictEqual(others, ['my.plugin.key'], 'feature keys are not repeated under Other stored values');
      await page.selectOption('.modal ' + rowSel('passwords.offer', 'select'), 'never');
      assert.strictEqual(P.siteProfile('https://shop.example/').passwords.offer, 'ask', 'nothing written before Save');
      assert.strictEqual(await page.innerText('.modal ' + rowSel('passwords.offer', '.sp-tag')), 'this site');
      await page.evaluate(() => [...document.querySelectorAll('.modal .foot button')].find(b => b.textContent === 'Save').click());
      await page.waitForFunction(() => !document.querySelector('.modal'), null, { timeout: 5000 });
      assert.strictEqual(P.siteProfile('https://shop.example/').passwords.offer, 'never', 'written on Save');
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('SU-03', 'a page that is not a website says so', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await wire(page);
      await page.addInitScript(initScript({ answers: stubAnswers })); await page.addInitScript(BRIDGE);
      await page.goto(pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.evaluate(() => { document.getElementById('wv').getURL = () => 'about:blank'; });
      await page.evaluate(() => window.CGShell.siteSettings());
      await page.waitForSelector('#site-settings-panel .sp-empty');
      assert.match(await page.innerText('#site-settings-panel .sp-groups'), /not a website/);
      assert.deepStrictEqual(errors, []); await page.close();
    });
  } finally { await browser.close().catch(() => {}); }
  done();
  function done() { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }
})();
