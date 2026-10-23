'use strict';
/**
 * tests/modules/test-site-readers.test.js — each feature reads its site value at its decision point (SP2, 0.60.216)
 * Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP2 · Spec: clear-glass/spec/site-profile.spec MOD-SP-READERS
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 * Every check runs the feature's own code against the real resolver (profile.js) over the real per-origin store.
 *   SR-01  readers: nothing installed → null everywhere (every feature as before); a throwing resolver → null, said once per feature
 *   SR-02  ClearDriver: an agent's navigate to a site with driver.allowed off is refused with the site and the setting; his own run is not;
 *          the site's nav / wait timeouts are the ones used
 *   SR-03  passwords: offer never → no offer, said; the site's account is the one saved with and the one filled among several; autofill off
 *   SR-04  autofill: off for the site → refused with the site; no profile asked → the site's profile
 *   SR-05  resume: the page keeps its place as he leaves; on the revisit scroll (and forms, never a password) come back (jsdom)
 *   SR-06  Guardian: listen off → no listeners for the site; capture off → the chat ledger keeps nothing, said
 *   SR-07  workflows, macros on load, Co-pilot's agent: the readers' answers for an unset, an off and a set site
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const R = require(CG('src/site-settings/readers.js'));
const { createSiteProfile } = require(CG('src/site-settings/profile.js'));

let passed = 0, failed = 0;
const pending = [];
function test(id, desc, fn) {
  pending.push((async () => {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
  }));
}
function realStore() { const { SiteSettingsStore } = require(CG('src/site-settings/store.js')); const s = new SiteSettingsStore(); s._persist = () => {}; return s; }
function install(opts = {}) {
  const store = realStore();
  const P = createSiteProfile({ store, options: { get: () => opts } });
  R.install((url) => P.siteProfile(url), { log: () => {} });
  return P;
}

console.log('\n⬡  site readers — each feature reads its site value\n');

test('SR-01', 'nothing installed → null everywhere; a throwing resolver → null, said once per feature', () => {
  R.install(null);
  for (const f of ['autofillFor', 'macrosOnLoad', 'workflowsAllowed', 'passwordPolicy', 'resumeMode', 'driverPolicy', 'meshAgent', 'guardianPolicy'])
    assert.strictEqual(R[f]('https://example.com/'), null, f);
  const said = [];
  R.install(() => { throw new Error('store gone'); }, { log: (m) => said.push(m) });
  assert.strictEqual(R.driverPolicy('https://a.example/'), null);
  assert.strictEqual(R.driverPolicy('https://b.example/'), null);
  assert.strictEqual(said.length, 1, 'once per feature'); assert.match(said[0], /driver: the site profile failed \(store gone\); it behaves as before/);
  install();
  assert.strictEqual(R.driverPolicy('about:blank'), null, 'not a site');
});

test('SR-02', 'ClearDriver: an agent is refused a site that says no, he is not; the site\'s timeouts are used', async () => {
  const P = install({ driver: { waitTimeoutMs: 700 } });
  const ClearDriver = require(CG('src/driver/index.js'));
  const events = [];
  const wc = { url: 'https://bank.example/home', getURL() { return this.url; }, getTitle: () => 't', handlers: {},
    once(ev, fn) { this.handlers[ev] = fn; }, loadURL(u) { this.url = u; setTimeout(() => this.handlers['did-finish-load'] && this.handlers['did-finish-load'](), 5); },
    executeJavaScript: async () => false };
  const d = new ClearDriver({ sse: { emit: (t, x) => events.push(t) } });
  d._getWebContents = () => wc;
  P.setSite('https://bank.example/', 'driver.allowed', false);
  await assert.rejects(d.exec({ action: 'navigate', agentId: 'mesh-claude', url: 'https://bank.example/pay' }),
    /ClearDriver may not drive https:\/\/bank\.example: its site settings say agents may not drive it \(driver\.allowed, site\)/);
  await assert.rejects(d.exec({ action: 'click', agentId: 'default', by: 'agent', selector: '#go' }), /may not drive https:\/\/bank\.example/);
  const mine = await d.exec({ action: 'navigate', agentId: 'default', url: 'https://bank.example/pay' });
  assert.strictEqual(mine.url, 'https://bank.example/pay', 'his own navigate is not refused');
  const other = await d.exec({ action: 'navigate', agentId: 'mesh-claude', url: 'https://news.example/' });
  assert.strictEqual(other.url, 'https://news.example/', 'another site: the agent drives as before');
  // the wait timeout: the global option (700) when the site has none, then the site's own
  const t0 = Date.now();
  await assert.rejects(d.exec({ action: 'waitFor', agentId: 'mesh-claude', selector: '#never' }), /WaitFor timeout/);
  const took = Date.now() - t0; assert.ok(took >= 650 && took < 2500, `waited ${took} ms (the global 700)`);
  P.setSite('https://news.example/', 'driver.navTimeoutMs', 1000);
  wc.loadURL = function (u) { this.url = u; };   // a page that never loads
  const t1 = Date.now();
  await assert.rejects(d.exec({ action: 'navigate', agentId: 'mesh-claude', url: 'https://news.example/slow' }), /Navigate timeout \(1000 ms\)/);
  assert.ok(Date.now() - t1 < 2500, 'the site\'s 1 s, not 30 s');
});

test('SR-03', 'passwords: offer never; the site\'s account saves and picks the login; autofill off', () => {
  const P = install();
  const { createPasswordService } = require(CG('src/passwords/service.js'));
  const rows = [];
  const vault = { get: (o) => rows.filter(r => r.origin === o), save: (origin, username, password, { accountId } = {}) => { const r = { id: `id${rows.length}`, origin, username, password, accountId }; rows.push(r); return r; } };
  const svc = createPasswordService({ vault });
  const site = 'https://shop.example';
  P.setSite(site + '/', 'passwords.offer', 'never');
  const c = svc.capture(1, { origin: site + '/login', username: 'me', password: 'pw' });
  assert.strictEqual(c.offer, null); assert.match(c.why, /never for this site \(its site settings, passwords\.offer\)/);
  P.clearSite(site + '/', 'passwords.offer');
  P.setSite(site + '/', 'passwords.accountId', 'work');
  assert.ok(svc.capture(1, { origin: site + '/login', username: 'me@work', password: 'pw1' }).offer);
  assert.strictEqual(svc.save(1, site, {}).login.accountId, 'work', 'saved with the site\'s account');
  vault.save(site, 'me@home', 'pw2', { accountId: 'home' });
  assert.strictEqual(svc.autofillLogin(site).username, 'me@work', 'two logins: the site\'s account picks');
  P.clearSite(site + '/', 'passwords.accountId');
  assert.strictEqual(svc.autofillLogin(site), null, 'two logins and no account: ask, as before');
  rows.splice(1);
  assert.strictEqual(svc.autofillLogin(site).username, 'me@work', 'one login: filled, as before');
  P.setSite(site + '/', 'passwords.autofill', false);
  assert.strictEqual(svc.autofillLogin(site), null, 'autofill off for the site');
});

test('SR-04', 'autofill: off for the site → refused with the site; no profile asked → the site\'s profile', async () => {
  const P = install();
  const M = require(CG('src/autofill/matcher.js'));
  const dom = { _getWebContents: () => ({ getURL: () => 'https://jobs.example/apply' }), handleQuery: async () => [] };
  const asked = [];
  const store = { getProfile: (id) => { asked.push(id); return id ? { id, fields: {} } : null; } };
  P.setSite('https://jobs.example/', 'autofill.profileId', 'cv');
  const r = await M.detectFields(dom, store, { agentId: 'default' });
  assert.strictEqual(r.profileId, 'cv'); assert.deepStrictEqual(asked, ['cv']);
  await M.detectFields(dom, store, { agentId: 'default', profileId: 'other' });
  assert.strictEqual(asked[1], 'other', 'a profile he picks wins');
  P.setSite('https://jobs.example/', 'autofill.enabled', false);
  const off = await M.fillFields(dom, store, { agentId: 'default', profileId: 'cv' });
  assert.match(off.error, /autofill is off for https:\/\/jobs\.example \(its site settings, autofill\.enabled\)/);
});

test('SR-05', 'resume: the place kept as he leaves; scroll and forms back on the revisit, never a password', async () => {
  const { JSDOM } = require('jsdom');
  const { resumeScript } = require(CG('src/rewind/resume.js'));
  assert.strictEqual(resumeScript('off'), null);
  const html = '<input id="q" value=""><input type="password" id="p"><textarea name="note"></textarea>';
  const page = (storage) => {
    const dom = new JSDOM(html, { url: 'https://forum.example/t/42', runScripts: 'outside-only' });
    const w = dom.window; const scrolled = [];
    if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    w.scrollTo = (x, y) => { scrolled.push([x, y]); };
    return { w, scrolled };
  };
  const a = page();
  assert.strictEqual(a.w.eval(resumeScript('scroll+forms')), 'none', 'first visit: nothing to put back');
  a.w.document.getElementById('q').value = 'site settings';
  a.w.document.getElementById('p').value = 'secret';
  a.w.document.querySelector('[name=note]').value = 'draft';
  Object.defineProperty(a.w, 'scrollY', { value: 1234, configurable: true });
  a.w.dispatchEvent(new a.w.Event('pagehide'));
  const kept = { ...a.w.localStorage };
  const rec = JSON.parse(kept['__cg_resume:/t/42']);
  assert.strictEqual(rec.y, 1234);
  assert.ok(!JSON.stringify(rec).includes('secret'), 'a password is never kept');
  const b = page(kept);
  assert.strictEqual(b.w.eval(resumeScript('scroll+forms')), 'scroll+forms');
  assert.deepStrictEqual(b.scrolled[0], [0, 1234]);
  assert.strictEqual(b.w.document.getElementById('q').value, 'site settings');
  assert.strictEqual(b.w.document.querySelector('[name=note]').value, 'draft');
  assert.strictEqual(b.w.document.getElementById('p').value, '', 'the password field stays empty');
  const c = page(kept);
  assert.strictEqual(c.w.eval(resumeScript('scroll')), 'scroll', 'scroll only: the forms are not put back');
  assert.strictEqual(c.w.document.getElementById('q').value, '');
});

test('SR-06', 'Guardian: listen off → no listeners for the site; capture off → the chat ledger keeps nothing, said', () => {
  const P = install();
  const NexusOptions = require(CG('src/options/store.js'));
  const opts = new NexusOptions(); opts._persist = () => {};
  opts.data = { ...opts.data, listeners: {} };
  const r = opts.registerListener({ urlPattern: 'https://chat.example/*', fingerprint: { selector: '#reply' }, label: 'reply' });
  assert.ok(!r.error, JSON.stringify(r));
  assert.strictEqual(opts.findListenersForUrl('https://chat.example/c/1').length, 1, 'unset: as before');
  P.setSite('https://chat.example/', 'guardian.listen', false);
  assert.strictEqual(opts.findListenersForUrl('https://chat.example/c/1').length, 0);
  const L = require(CG('src/downloads/chat-ledger.js'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr06-'));
  const ok = L.applyDelta({ provider: 'chatgpt', chatId: 'a1', url: 'https://chat.example/c/a1', turns: [{ i: 0, role: 'user', text: 'hi' }] }, { root });
  assert.strictEqual(ok.ok, true, 'capture on: kept');
  P.setSite('https://chat.example/', 'guardian.capture', false);
  const off = L.applyDelta({ provider: 'chatgpt', chatId: 'a2', url: 'https://chat.example/c/a2', turns: [{ i: 0, role: 'user', text: 'hi' }] }, { root });
  assert.strictEqual(off.skipped, true); assert.match(off.error, /chat capture is off for https:\/\/chat\.example \(its site settings, guardian\.capture\)/);
  assert.strictEqual(L.readChat({ provider: 'chatgpt', chatId: 'a2' }, { root }), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('SR-07', 'workflows, macros on load, Co-pilot\'s agent: unset, off and set', () => {
  const P = install();
  const u = 'https://wiki.example/x';
  assert.strictEqual(R.workflowsAllowed(u), true);
  assert.deepStrictEqual(R.macrosOnLoad(u), { enabled: true, autoRun: [] });
  assert.deepStrictEqual(R.meshAgent(u), { enabled: true, agent: null });
  P.setSite(u, 'workflows.enabled', false);
  P.setSite(u, 'macros.autoRun', 'expand-all, dark');
  P.setSite(u, 'mesh.agent', 'claude');
  assert.strictEqual(R.workflowsAllowed(u), false);
  assert.deepStrictEqual(R.macrosOnLoad(u).autoRun, ['expand-all', 'dark']);
  assert.strictEqual(R.meshAgent(u).agent, 'claude');
  P.setSite(u, 'macros.enabled', false);
  assert.deepStrictEqual(R.macrosOnLoad(u), { enabled: false, autoRun: [] }, 'macros off: none run on load');
  P.setSite(u, 'resume.restore', 'scroll');
  assert.strictEqual(R.resumeMode(u), 'scroll');
});

(async () => {
  for (const t of pending) await t();
  R.install(null);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
