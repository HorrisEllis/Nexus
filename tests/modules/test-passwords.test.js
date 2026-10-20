'use strict';
/**
 * tests/modules/test-passwords.test.js — PW1–PW4 (0.60.186). Spec: clear-glass/spec/passwords.spec. Map: docs/2026-10-21-passwords-phasemap.spec
 * James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."
 *
 *   PWT-01  the service: a new login → save offer; the same → nothing; a changed password → update; Save writes the vault with the account
 *   PWT-02  fill only for the exact origin; Never remembered; Not now drops it; a pending login expires; offer off → nothing
 *   PWT-03  linkPending: the cookie vault's Save sign-in keeps the login typed on that site, as the same account; account-switch passes it on
 *   PWT-04  the page script in Clear Glass: finds the form, one capture per submit (submit + Enter + click), fills with input events, not a sign-up form
 *   PWT-05  main wiring: the origin from the sender's URL; the window gets the offer without the password; one login + autofill → pw:fill
 *   PWT-06  dropped when the plugin is off or the session is a Snowflake compartment; fillPage refuses another site's login
 *   PWT-07  the key panel in Clear Glass: Save login for the site, the account signed in there chosen, Save sends no password; Never; the list fills
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '../..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const SHOTS = process.env.BST_SHOTS || os.tmpdir();
const { createPasswordService } = require(CG('src/passwords/service.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-'));
function fakeVault() {   // PasswordVault's contract (save / get / list), in memory
  const rows = []; let n = 0;
  return { rows,
    save(origin, username, password, { accountId } = {}) { const o = new URL(origin).origin; let r = rows.find(x => x.origin === o && x.username === username);
      if (r) { r.password = password; if (accountId !== undefined) r.accountId = accountId || null; } else rows.push(r = { id: `pw-${++n}`, origin: o, username, password, accountId: accountId || null }); return { id: r.id, origin: r.origin, username, accountId: r.accountId }; },
    get(origin) { const o = new URL(origin).origin; return rows.filter(x => x.origin === o).map(x => ({ ...x })); },
    list() { return rows.map(({ password, ...r }) => r); } };
}

(async () => {
  console.log('test-passwords — websites use the password manager; a login belongs to the account the cookie vault keeps');

  await test('PWT-01', 'offer save, nothing for the same login, update for a changed password; Save writes the vault with the account', () => {
    const v = fakeVault(); const s = createPasswordService({ vault: v, dir: tmp() });
    assert.deepStrictEqual(s.capture(7, { origin: 'https://news.com/login', username: 'james', password: 'p1' }).offer, { kind: 'save', origin: 'https://news.com', username: 'james' });
    const r = s.save(7, 'https://news.com/x', { username: 'james@news', accountId: 'acct-w' });
    assert.ok(r.ok); assert.deepStrictEqual([v.rows[0].username, v.rows[0].password, v.rows[0].accountId], ['james@news', 'p1', 'acct-w']);
    assert.strictEqual(JSON.stringify(r).includes('p1'), false, 'no password in the answer');
    assert.strictEqual(s.capture(7, { origin: 'https://news.com/', username: 'james@news', password: 'p1' }).offer, null, 'the same login: nothing to offer');
    assert.strictEqual(s.capture(7, { origin: 'https://news.com/', username: 'james@news', password: 'p2' }).offer.kind, 'update');
    assert.strictEqual(s.save(9, 'https://news.com', {}).ok, false, 'another tab has nothing pending');
  });

  await test('PWT-02', 'exact-origin fill; Never kept; Not now drops; expiry; offer off', () => {
    let t = 1000; const v = fakeVault(); const dir = tmp(); const s = createPasswordService({ vault: v, dir, now: () => t, ttlMs: 60000 });
    v.save('https://bank.com', 'me', 'secret');
    const id = s.logins('https://bank.com/login')[0].id;
    assert.deepStrictEqual(s.fill('https://bank.com/', id), { ok: true, username: 'me', password: 'secret' });
    assert.strictEqual(s.fill('https://evil.com/', id).ok, false); assert.strictEqual(s.fill('http://bank.com/', id).ok, false, 'http is another origin');
    assert.ok(!JSON.stringify(s.logins('https://bank.com')).includes('secret'), 'logins() carries no password');
    s.capture(1, { origin: 'https://x.org', username: 'a', password: 'b' }); s.dismiss(1, 'https://x.org', { never: true });
    assert.strictEqual(s.capture(1, { origin: 'https://x.org/', username: 'a', password: 'c' }).why, 'never for this site');
    assert.deepStrictEqual(createPasswordService({ vault: v, dir }).prefs().never, ['https://x.org'], 'kept across a restart');
    s.capture(1, { origin: 'https://y.org', username: 'a', password: 'b' }); s.dismiss(1, 'https://y.org'); assert.strictEqual(s.save(1, 'https://y.org', {}).ok, false, 'Not now drops it');
    s.capture(2, { origin: 'https://z.org', username: 'a', password: 'b' }); t += 61000; assert.strictEqual(s.pendingCount(), 0, 'expired');
    s.setPref('offer', false); assert.strictEqual(s.capture(3, { origin: 'https://w.org', username: 'a', password: 'b' }).offer, null);
    assert.strictEqual(s.capture(3, { origin: 'file:///x', username: 'a', password: 'b' }).why, 'not a web page');
  });

  await test('PWT-03', 'Save sign-in to vault keeps the login typed there, as the same account; account-switch passes it on', async () => {
    const v = fakeVault(); const s = createPasswordService({ vault: v, dir: tmp() });
    s.capture(31, { origin: 'https://www.perplexity.ai/login', username: 'james@x.com', password: 'pp' });
    s.capture(32, { origin: 'https://other.com/', username: 'z', password: 'q' });
    const r = s.linkPending(['https://www.perplexity.ai', 'https://perplexity.ai'], 'acct-p');
    assert.deepStrictEqual([r.saved.length, v.rows[0].origin, v.rows[0].accountId], [1, 'https://www.perplexity.ai', 'acct-p']);
    assert.strictEqual(s.pendingCount(), 1, 'other sites untouched');
    const AS = require(CG('src/providers/account-switch.js'));
    const src = fs.readFileSync(CG('src/providers/account-switch.js'), 'utf8');
    assert.ok(/onCaptured\(\{ provider, accountId: acct, sites: r\.sites \}\)/.test(src) && /cookies: r\.count, sites: r\.sites, logins \}/.test(src), 'capture calls onCaptured and says how many');
    assert.ok(typeof AS.createAccountSwitch === 'function');
    const main = fs.readFileSync(CG('src/main/index.js'), 'utf8');
    assert.ok(/onCaptured: \(\{ provider, accountId \}\) =>[\s\S]{0,300}linkPending\(/.test(main), 'main links the provider site\'s pending login');
    const PV = require(CG('src/passwords/vault.js')); assert.ok(/save\(origin, username, password, \{ accountId \} = \{\}\)/.test(fs.readFileSync(CG('src/passwords/vault.js'), 'utf8')) && PV.PasswordVault);
  });

  await test('PWT-05', 'main wiring: the origin from the sender; the window gets the offer without the password; one login → pw:fill', async () => {
    const W = require(CG('src/main/passwords-wiring.js'));
    const v = fakeVault(); const s = createPasswordService({ vault: v, dir: tmp() }); v.save('https://shop.com', 'me', 'pw0');
    const ipc = new EventEmitter(); ipc.handlers = {}; ipc.handle = (ch, fn) => { ipc.handlers[ch] = fn; };
    const toHost = [], toPage = [];
    const host = { isDestroyed: () => false, send: (ch, d) => toHost.push([ch, d]) };
    const page = (url, id = 5) => ({ id, getURL: () => url, hostWebContents: host, session: {}, send: (ch, d) => toPage.push([ch, d]), isDestroyed: () => false });
    const app = new EventEmitter(); const sessions = [];
    W.attach({ app, ipcMain: ipc, service: () => s, preloadPath: '/x/passwords.js', webContents: { fromId: (id) => page('https://shop.com/cart', id) } });
    app.emit('session-created', { registerPreloadScript: (o) => sessions.push(o) });
    assert.deepStrictEqual(sessions, [{ type: 'frame', id: 'cg-passwords', filePath: '/x/passwords.js' }]);
    ipc.emit('pw:capture', { sender: page('https://news.com/login') }, { username: 'j', password: 'TOPSECRET', origin: 'https://evil.com' });
    assert.deepStrictEqual(toHost[0], ['passwords:offer', { wcId: 5, kind: 'save', origin: 'https://news.com', username: 'j' }], 'the sender\'s origin, not the page\'s word');
    assert.ok(!JSON.stringify(toHost).includes('TOPSECRET'), 'the window never gets the password (PW-001)');
    ipc.emit('pw:form', { sender: page('https://shop.com/login') });
    assert.deepStrictEqual(toHost[1][1], { wcId: 5, origin: 'https://shop.com', count: 1, usernames: ['me'] });
    assert.deepStrictEqual(toPage[0], ['pw:fill', { username: 'me', password: 'pw0', force: false }], 'one login and autofill on: filled');
    const saved = await ipc.handlers['passwords:save']({}, { wcId: 5, origin: 'https://news.com', username: 'james', accountId: 'acct-n' });
    assert.ok(saved.ok && v.rows.some(r => r.username === 'james' && r.password === 'TOPSECRET' && r.accountId === 'acct-n'));
  });

  await test('PWT-06', 'dropped when the plugin is off or in a Snowflake compartment; fillPage only for the page\'s own site', async () => {
    const W = require(CG('src/main/passwords-wiring.js'));
    const v = fakeVault(); const s = createPasswordService({ vault: v, dir: tmp() }); v.save('https://bank.com', 'me', 'b');
    const mk = (opts) => { const ipc = new EventEmitter(); ipc.handlers = {}; ipc.handle = (ch, fn) => { ipc.handlers[ch] = fn; }; const out = [];
      const pg = (url, ses = {}) => ({ id: 3, getURL: () => url, session: ses, hostWebContents: { isDestroyed: () => false, send: (c, d) => out.push(c) }, send: (c) => out.push(c), isDestroyed: () => false });
      W.attach({ ipcMain: ipc, service: () => s, preloadPath: 'p', webContents: { fromId: () => pg(opts.fillUrl || 'https://bank.com/') }, ...opts }); return { ipc, out, pg }; };
    const off = mk({ isActive: () => false }); off.ipc.emit('pw:capture', { sender: off.pg('https://a.com') }, { username: 'u', password: 'p' }); off.ipc.emit('pw:form', { sender: off.pg('https://bank.com') });
    assert.deepStrictEqual(off.out, [], 'plugin off: nothing');
    const snow = { snow: true }; const sf = mk({ isCompartment: (ses) => ses === snow });
    sf.ipc.emit('pw:capture', { sender: sf.pg('https://a.com', snow) }, { username: 'u', password: 'p' }); sf.ipc.emit('pw:form', { sender: sf.pg('https://bank.com', snow) });
    assert.deepStrictEqual(sf.out, [], 'a Snowflake window keeps no logins');
    const other = mk({ fillUrl: 'https://evil.com/' }); const id = s.logins('https://bank.com')[0].id;
    assert.strictEqual((await other.ipc.handlers['passwords:fillPage']({}, { wcId: 3, id })).ok, false);
    const ok = mk({}); assert.deepStrictEqual(await ok.ipc.handlers['passwords:fillPage']({}, { wcId: 3, id }), { ok: true, username: 'me' });
    const mf = JSON.parse(fs.readFileSync(CG('plugins/passwords/manifest.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(mf.contributes), ['settings'], 'the old autofill-without-asking userscript is no longer contributed');
  });

  // ── in Clear Glass ──
  const glass = require(CG('src/driver/glass.js')); const { initScript } = require(CG('src/driver/cg-stub.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PWT-04/07 SKIPPED: engine could not start (${e.message.split('\n')[0]})`); browser = null; }
  if (browser) try {
    await test('PWT-04', 'the page script in Clear Glass: finds the form, one capture per submit, fills with input events, leaves a sign-up form', async () => {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const dir = tmp(); fs.writeFileSync(path.join(dir, 'login.html'), `<!doctype html><html><body>
        <form id="f" onsubmit="event.preventDefault(); window.__submitted=(window.__submitted||0)+1;"><input id="q" placeholder="search"><input id="u" autocomplete="username" name="login"><input id="p" type="password"><button id="go">Sign in</button></form>
        <script>window.__inputs=0; document.addEventListener('input', () => window.__inputs++, true);</script></body></html>`);
      await page.goto(require('url').pathToFileURL(path.join(dir, 'login.html')).href);
      const src = fs.readFileSync(CG('src/preload/passwords.js'), 'utf8');
      await page.evaluate(`${src}; window.__sent=[]; window.__fillFns=[]; window.__cgPasswordsPage.install(window, { send: (c, d) => window.__sent.push([c, d]), on: (c, fn) => window.__fillFns.push(fn) });`);
      await page.waitForTimeout(100);
      assert.deepStrictEqual(await page.evaluate(() => window.__sent), [['pw:form', { hasUser: true, isNew: false }]]);
      assert.strictEqual(await page.evaluate(() => { const f = window.__cgPasswordsPage.findLogin(document); return f.user.id; }), 'u', 'autocomplete=username, not the search box');
      await page.fill('#u', 'james'); await page.fill('#p', 'hunter2'); await page.click('#go'); await page.waitForTimeout(150);
      const caps = await page.evaluate(() => window.__sent.filter(x => x[0] === 'pw:capture'));
      assert.deepStrictEqual(caps, [['pw:capture', { username: 'james', password: 'hunter2', isNew: false }]], 'click + submit → one capture');
      await page.evaluate(() => { document.getElementById('u').value = ''; document.getElementById('p').value = ''; window.__inputs = 0; window.__fillFns.forEach(f => f({ username: 'me', password: 'pw0', force: false })); });
      assert.deepStrictEqual(await page.evaluate(() => [document.getElementById('u').value, document.getElementById('p').value, window.__inputs >= 2]), ['me', 'pw0', true]);
      await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<input id="p2" type="password">'); document.getElementById('u').value = ''; document.getElementById('p').value = ''; window.__fillFns.forEach(f => f({ username: 'me', password: 'pw0', force: false })); });
      assert.strictEqual(await page.$eval('#p', e => e.value), '', 'two password fields (a sign-up form) are not autofilled');
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('PWT-07', 'the key panel in Clear Glass: Save login for the site, the signed-in account chosen, no password sent; Never; the list fills', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'plugins.list': [], 'options.get': {}, 'toolbar.commands': [], 'bookmarks.list': [],
        'accounts.forSite': { ok: true, site: 'news.com', accounts: [{ id: 'w', label: 'Work', state: 'signed-in' }, { id: 'c', label: 'Default — claude', state: 'none' }] },
        'passwords.save': { ok: true }, 'passwords.dismiss': { ok: true }, 'passwords.forPage': { ok: true, origin: 'https://news.com', logins: [{ id: 'pw-1', username: 'james@news', accountId: 'w' }] }, 'passwords.fillPage': { ok: true, username: 'james@news' } } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForSelector('#btn-back svg');
      await page.evaluate(() => window.CGPasswords.offer({ wcId: null, kind: 'save', origin: 'https://news.com', username: 'james' }));
      await page.waitForSelector('#sh-pw-panel .ps-btn.primary');
      const t = await page.innerText('#sh-pw-panel');
      assert.ok(t.includes('Save login for news.com?') && t.includes('Never for this site') && t.includes('Not now'), t);
      assert.strictEqual(await page.$eval('#sh-pw-panel select.ps-select', s => s.value), 'w', 'the account signed in to the site is chosen');
      assert.strictEqual(await page.$eval('#btn-pw', b => !b.hidden && b.classList.contains('pending')), true, 'the key shows');
      await page.screenshot({ path: path.join(SHOTS, 'pwt07-save-login.png') });
      await page.fill('#sh-pw-panel .ps-field input.ps-input', 'james@news.com');
      await page.click('#sh-pw-panel .ps-btn.primary'); await page.waitForTimeout(200);
      const call = await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'passwords.save').pop());
      assert.deepStrictEqual(call.args, [null, 'https://news.com', 'james@news.com', 'w'], 'tab, site, username, account — and no password');
      await page.evaluate(() => window.CGPasswords.offer({ wcId: null, kind: 'update', origin: 'https://x.org', username: 'a' }));
      await page.waitForSelector('#sh-pw-panel .ps-btn.primary'); assert.ok((await page.innerText('#sh-pw-panel')).includes('Update login for x.org?'));
      await page.click('#sh-pw-panel .ps-btn:has-text("Never for this site")'); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__cgCalls.some(c => c.key === 'passwords.dismiss' && c.args[1] === 'https://x.org' && c.args[2] === true)));
      await page.evaluate(() => window.CGPasswords.available({ wcId: null, origin: 'https://news.com', count: 1 }));
      await page.click('#btn-pw'); await page.waitForSelector('#sh-pw-panel .ps-item');
      assert.ok((await page.innerText('#sh-pw-panel')).includes('Logins for news.com'));
      await page.screenshot({ path: path.join(SHOTS, 'pwt07-logins.png') });
      await page.click('#sh-pw-panel .ps-item .ps-btn'); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__cgCalls.some(c => c.key === 'passwords.fillPage' && c.args[1] === 'pw-1')));
      assert.deepStrictEqual(errors, []); await page.close();
    });
  } finally { await browser.close().catch(() => {}); }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
