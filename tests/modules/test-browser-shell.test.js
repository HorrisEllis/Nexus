'use strict';
/**
 * tests/modules/test-browser-shell.test.js — BS1–BS7 (0.60.179). Spec: clear-glass/spec/browser-shell.spec
 * Map: docs/2026-10-21-browser-shell-phasemap.spec
 * James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.? rebuild the front end renderer.html
 * completely enterprise grade, same theme as the setting, make it dynamic like firefox. ... make a beautiful cli like the floating menu
 * button 3-way cli. isolated from the dom, i dont want any screen recording to be able to see anything but the dom,"
 *
 *   BST-01  profiles.ini found where Firefox keeps it; relative paths; the install's default; what each profile holds
 *   BST-02  cookies, bookmarks and persona from real sqlite files (node:sqlite), read from a copy; every cookie mapped or skipped with why;
 *           read = imported + skipped; no cookie value in the report
 *   BST-03  the window: every 0.60.178 id kept; no inline script; Settings' palette (cos-theme.css) before shell.css; old file archived
 *   BST-04  menus: every element a menu item clicks exists; every CGShell action it calls is defined in browser.js
 *   BST-05  plugins: icons; disable then enable registers the same signatures; off kept across restarts (options + boot)
 *   BST-06  floating CLI: its own window, content protection set before it is shown; toggle/size/nav; the page in Clear Glass's engine
 *   BST-07  the window in Clear Glass's engine: one toolbar row, ☰ in Firefox's order, 🧩 with icons, switch and pin, ⬇ with the quarantine,
 *           Alt shows the menu bar, no page error
 *   BST-08  Settings → Import in Clear Glass's engine against a stub :7702
 */
require('../../lib/test-sandbox.js').ensure();
process.removeAllListeners('warning'); process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w.message); });   // node:sqlite says it is experimental
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '../..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const FX = require(CG('src/import/firefox.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bst-'));
const put = (root, p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
const NOW = Date.UTC(2026, 9, 21);

function firefoxHome() {
  const home = tmp(); const ff = path.join(home, '.mozilla', 'firefox');
  put(ff, 'profiles.ini', `[Install4F96D1932A9F858E]\nDefault=abcd.default-release\nLocked=1\n\n[Profile1]\nName=default\nIsRelative=1\nPath=efgh.default\nDefault=1\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=abcd.default-release\n\n[General]\nStartWithLastProfile=1\nVersion=2\n`);
  const dir = path.join(ff, 'abcd.default-release'); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(ff, 'efgh.default'), { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  const c = new DatabaseSync(path.join(dir, 'cookies.sqlite'));
  c.exec(`CREATE TABLE moz_cookies (id INTEGER PRIMARY KEY, originAttributes TEXT NOT NULL DEFAULT '', name TEXT, value TEXT, host TEXT, path TEXT, expiry INTEGER, lastAccessed INTEGER, creationTime INTEGER, isSecure INTEGER, isHttpOnly INTEGER, inBrowserElement INTEGER DEFAULT 0, sameSite INTEGER DEFAULT 0, rawSameSite INTEGER DEFAULT 0, schemeMap INTEGER DEFAULT 0)`);
  const ins = c.prepare('INSERT INTO moz_cookies (originAttributes, name, value, host, path, expiry, isSecure, isHttpOnly, sameSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const future = Math.floor(NOW / 1000) + 86400 * 30;
  ins.run('', 'sid', 'SECRET-SESSION-VALUE', 'accounts.example.com', '/', future, 1, 1, 1);         // host-only, secure, lax, seconds
  ins.run('', 'pref', 'p1', '.example.com', '/', (future) * 1000, 0, 0, 0);                        // domain cookie, ms expiry, sameSite none without secure
  ins.run('^userContextId=2', 'c', 'x', '.work.example', '/', future, 1, 0, 0);                   // container
  ins.run('^privateBrowsingId=1', 'p', 'x', '.private.example', '/', future, 1, 0, 0);            // private
  ins.run('^partitionKey=%28https%2Cexample.com%29', 't', 'x', '.tracker.example', '/', future, 1, 0, 0);   // partitioned
  ins.run('', 'old', 'x', '.old.example', '/', Math.floor(NOW / 1000) - 10, 1, 0, 0);             // expired
  ins.run('', 'strict', 'x', 'bank.example', '/app', future, 1, 1, 2);                             // strict
  c.close();
  const p = new DatabaseSync(path.join(dir, 'places.sqlite'));
  p.exec('CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, parent INTEGER, title TEXT);');
  p.exec(`INSERT INTO moz_places VALUES (1,'https://nexus.example/'),(2,'place:sort=8'),(3,'https://already.example/'),(4,'javascript:alert(1)');
          INSERT INTO moz_bookmarks VALUES (1,2,NULL,0,'root'),(2,2,NULL,1,'toolbar'),(3,2,NULL,1,'Work'),(10,1,1,3,'Nexus'),(11,1,2,2,'Most visited'),(12,1,3,2,'Already'),(13,1,4,2,'bad');`);
  p.close();
  put(dir, 'prefs.js', `// Mozilla User Preferences\nuser_pref("general.useragent.override", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0");\nuser_pref("intl.accept_languages", "en-GB, en");\n`);
  return { home, dir };
}

console.log('\ntest-browser-shell — Firefox import, the window rebuilt like Firefox, plugins with icons, the floating CLI');

(async () => {
  const F = firefoxHome();

  await test('BST-01', 'profiles: found, relative paths resolved, the install\'s default first, what each holds', () => {
    const r = FX.profiles({ platform: 'linux', home: F.home, env: {} });
    assert.deepStrictEqual(r.profiles.map(p => [p.name, p.isDefault]), [['default-release', true], ['default', false]], 'the Install section decides the default');
    assert.strictEqual(r.profiles[0].path, F.dir);
    assert.deepStrictEqual(r.profiles[0].has, { cookies: true, places: true, prefs: true });
    assert.ok(r.looked.some(l => l.includes('snap')) && r.looked.some(l => l.includes('org.mozilla.firefox')), 'snap and flatpak looked at');
    assert.ok(FX.roots({ platform: 'win32', home: 'C:\\Users\\j', env: { APPDATA: 'C:\\Users\\j\\AppData\\Roaming' } })[0].endsWith(path.join('Mozilla', 'Firefox')));
    assert.deepStrictEqual(FX.profiles({ platform: 'linux', home: tmp(), env: {} }).profiles, []);
  });

  await test('BST-02', 'cookies, bookmarks, persona: mapped or skipped with why; counts add up; no value in the report', async () => {
    const before = fs.statSync(path.join(F.dir, 'cookies.sqlite')).mtimeMs;
    const set = []; const session = { cookies: { set: async (c) => { if (c.domain === 'bank.example' ) throw new Error('nope'); set.push(c); } } };
    const rep = await FX.run({ profile: { name: 'default-release', path: F.dir }, cookies: true, bookmarks: true, persona: true, session, now: NOW,
      store: { _b: new Set(['https://already.example/']), isBookmarked({ url }) { return this._b.has(url); }, add({ url }) { this._b.add(url); } },
      fingerprint: { got: null, importFirefox(id, p) { this.got = p; } } });
    const c = rep.cookies;
    assert.strictEqual(c.read, 7);
    assert.strictEqual(c.read, c.imported + Object.values(c.skipped).reduce((a, b) => a + b, 0), JSON.stringify(c));
    assert.deepStrictEqual(c.skipped, { expired: 1, container: 1, private: 1, partitioned: 1, bad: 0, refused: 0 }, JSON.stringify(c.skipped));
    const sid = set.find(x => x.name === 'sid'); const pref = set.find(x => x.name === 'pref');
    assert.deepStrictEqual([sid.url, sid.domain, sid.secure, sid.httpOnly, sid.sameSite], ['https://accounts.example.com/', undefined, true, true, 'lax'], 'host-only stays host-only');
    assert.deepStrictEqual([pref.domain, pref.sameSite, pref.expirationDate], ['.example.com', undefined, Math.floor(NOW / 1000) + 86400 * 30], 'domain cookie; ms expiry → s; None without Secure dropped');
    assert.strictEqual(set.find(x => x.name === 'strict').sameSite, 'strict');
    assert.ok(!JSON.stringify(rep).includes('SECRET-SESSION-VALUE'), 'no cookie value in the report');
    assert.deepStrictEqual([rep.bookmarks.read, rep.bookmarks.added], [3, 1], JSON.stringify(rep.bookmarks));
    assert.ok(/Firefox\/140/.test(rep.persona.userAgent) && rep.persona.languages === 'en-GB, en');
    assert.strictEqual(fs.statSync(path.join(F.dir, 'cookies.sqlite')).mtimeMs, before, 'Firefox\'s own file untouched (read from a copy)');
    const refused = await FX.importCookies({ dir: F.dir, session: { cookies: { set: async (x) => { if (x.name === 'strict') throw new Error('x'); } } }, now: NOW });
    assert.deepStrictEqual([refused.skipped.refused, refused.refusedHosts], [1, ['bank.example']], 'a refusal is counted, by host');
    assert.deepStrictEqual(FX.toElectron({ host: '', name: 'x' }), { skip: 'bad' });
  });

  await test('BST-03', 'the window: every 0.60.178 id kept; no inline script; Settings\' palette then shell.css; old file archived', () => {
    const ids = (f) => new Set([...fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    const old = ids(path.join(ROOT, '_archive/clear-glass/renderer/browser-0.60.178.html'));
    const now = ids(CG('renderer/browser.html'));
    assert.ok(old.size > 190, `archived file read (${old.size})`);
    assert.deepStrictEqual([...old].filter(i => !now.has(i)), [], 'no id lost');
    const html = fs.readFileSync(CG('renderer/browser.html'), 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline script'); assert.ok(/script-src 'self';/.test(html));
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(links.indexOf('cos-theme.css') > links.indexOf('browser.css') && links.indexOf('shell/shell.css') === links.length - 1, links.join(' '));
    assert.ok(/<link rel="stylesheet" href="cos-theme.css">/.test(fs.readFileSync(CG('renderer/settings.html'), 'utf8')), 'the palette Settings loads');
    const css = fs.readFileSync(CG('renderer/shell/shell.css'), 'utf8');
    assert.ok(!/#00f5ff|rgba\(0,\s*245/.test(css), 'no colour of its own: the palette is Settings\'');
    const js = fs.readFileSync(CG('renderer/browser.js'), 'utf8');
    assert.ok(/<span class="tab-title">\$\{esc\(t\.title\)\}<\/span>/.test(js), 'the page title is escaped in the tab strip');
  });

  await test('BST-04', 'menus: every clicked element exists; every CGShell action is defined', () => {
    const src = fs.readFileSync(CG('renderer/shell/menus.js'), 'utf8');
    const html = fs.readFileSync(CG('renderer/browser.html'), 'utf8');
    const clicks = [...src.matchAll(/click: '([\w-]+)'/g)].map(m => m[1]);
    assert.ok(clicks.length >= 12);
    for (const id of clicks) assert.ok(html.includes(`id="${id}"`), `#${id} exists`);
    const runs = [...new Set([...src.matchAll(/run: '(\w+)'/g)].map(m => m[1]))];
    const shell = fs.readFileSync(CG('renderer/browser.js'), 'utf8'); const block = shell.slice(shell.indexOf('window.CGShell = {'));
    for (const r of runs) assert.ok(new RegExp(`\\b${r}:`).test(block), `CGShell.${r}`);
    for (const m of ['File', 'Edit', 'View', 'History', 'Bookmarks', 'Tools', 'Help']) assert.ok(src.includes(`label: '${m}'`), m);
  });

  await test('BST-05', 'plugins: icons; disable → enable registers the same; off kept across restarts', () => {
    const Bus = require(CG('src/core/bus.js')); try { Bus.getBus(); } catch (_) { Bus.createBus(); }
    const { PluginHost } = require(CG('src/plugins/host.js'));
    const host = new PluginHost();
    host.install(require(CG('plugins/zoom/manifest.json')), require(CG('plugins/zoom/index.js')));
    const id = require(CG('plugins/zoom/manifest.json')).id;
    const before = host.list().find(p => p.id === id);
    assert.strictEqual(before.icon, '🔍'); assert.ok(before.commands.length >= 1 && before.commands[0].signature);
    host.disable(id); assert.strictEqual(host.list().find(p => p.id === id).state, 'disabled');
    host.enable(id);
    const after = host.list().find(p => p.id === id);
    assert.deepStrictEqual([after.state, after.contributions], ['active', before.contributions]);
    for (const d of fs.readdirSync(CG('plugins'))) assert.ok(require(CG(`plugins/${d}/manifest.json`)).icon, `${d} has an icon`);
    assert.ok(/_keepPluginState\(id, true\)/.test(fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8')));
    assert.ok(/disabledPlugins \|\| \[\]\)\) \{\s*try \{ pluginHost\.disable\(id\)/.test(fs.readFileSync(CG('src/main/index.js'), 'utf8')), 'applied at boot');
  });

  await test('BST-06', 'floating CLI: its own window, protected before shown; toggle, size, nav to the parent', () => {
    const FC = require(CG('src/main/float-cli.js'));
    const order = [];
    class Win extends EventEmitter {
      constructor(o = {}) { super(); this.o = o; this.id = Win.n = (Win.n || 0) + 1; this.bounds = null; this.destroyed = false; this.sent = [];
        this.webContents = { id: 100 + this.id, send: (ch, d) => this.sent.push([ch, d]), isLoading: () => false }; }
      setContentProtection(v) { order.push(`protect:${v}`); } loadFile() { order.push('load'); } show() { order.push('show'); } showInactive() {} hide() { order.push('hide'); }
      setBounds(b) { this.bounds = b; } getContentBounds() { return { x: 100, y: 50, width: 1200, height: 800 }; } isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; this.emit('closed'); }
      once(ev, fn) { return super.once(ev, fn); }
    }
    const parent = new Win();
    const ctl = FC.attach(parent, { agentId: 't', BrowserWindow: Win, platform: 'win32', log: () => {} });
    const r = ctl.toggle();
    assert.deepStrictEqual([r.open, r.protected], [true, true]);
    assert.ok(order.indexOf('protect:true') > -1 && order.indexOf('protect:true') < order.indexOf('show'), order.join(' '));
    const child = ctl.window();
    assert.deepStrictEqual([child.o.parent, child.o.frame, child.o.skipTaskbar, child.o.transparent], [parent, false, true, true]);
    assert.deepStrictEqual(child.bounds, { x: 100 + 1200 - FC.PANEL.width - 18, y: 50 + 800 - FC.PANEL.height - 18, width: FC.PANEL.width, height: FC.PANEL.height });
    ctl.size(false); assert.strictEqual(child.bounds.width, FC.FAB.width);
    ctl.nav('go', 'https://example.com'); assert.deepStrictEqual(parent.sent.find(s => s[0] === 'floatcli:nav'), ['floatcli:nav', { op: 'go', url: 'https://example.com' }]);
    assert.strictEqual(ctl.toggle().open, false);
    const lin = FC.attach(new Win(), { BrowserWindow: Win, platform: 'linux', log: () => {} }).toggle();
    assert.strictEqual(lin.protected, false, 'Linux says it cannot hide from capture');
    const src = fs.readFileSync(CG('src/main/float-cli.js'), 'utf8');
    assert.ok(!/executeJavaScript|insertCSS/.test(src), 'nothing is put into a page');
  });

  // ── in Clear Glass's engine ──
  const glass = require(CG('src/driver/glass.js')); const eng = glass.engine();
  if (!eng) { console.log('  - BST-06b/07/08 SKIPPED: Clear Glass has no engine here — the pages did not run'); return done(); }
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - BST-06b/07/08 SKIPPED: engine could not start (${e.message.split('\n')[0]})`); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  const { initScript } = require(CG('src/driver/cg-stub.js'));
  const http = require('http'); const asked = [];
  const answers = {
    'GET /cli/net/quarantine': { ok: true, items: [{ id: 'q-1', kind: 'file', state: 'quarantined', filename: 'report.pdf', bytes: 2097152, url: 'https://x/report.pdf' }] },
    'GET /cli/firefox/profiles': { ok: true, profiles: [{ name: 'default-release', path: '/home/j/.mozilla/firefox/abcd.default-release', isDefault: true, has: { cookies: true, places: true, prefs: true } }, { name: 'work', path: '/home/j/.mozilla/firefox/w.work', isDefault: false, has: { cookies: true, places: false, prefs: true } }], looked: [] },
    'POST /cli/firefox/import': { ok: true, profile: 'work', into: 'default', cookies: { read: 10, imported: 7, skipped: { expired: 2, container: 1, private: 0, partitioned: 0, bad: 0, refused: 0 } }, bookmarks: null, persona: null, errors: [] },
  };
  const bodies = [];
  const srv = http.createServer((req, res) => {
    const key = `${req.method} ${req.url.split('?')[0]}`; asked.push(key); let b = ''; req.on('data', c => b += c);
    req.on('end', () => { if (b) bodies.push([key, b]);
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(answers[key] || { ok: true })); });
  });
  const up = await new Promise(ok => { srv.once('error', () => ok(false)); srv.listen(7702, '127.0.0.1', () => ok(true)); });
  try {
    await test('BST-06b', 'the floating CLI page in Clear Glass: the three-way toggle, /help, a routed reply, the capture badge', async () => {
      const page = await browser.newPage({ viewport: { width: 460, height: 600 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'copilot.send': { ok: true, text: 'Hello.', route: { backend: 'ollama', modelUsed: 'qwen2.5' } } } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/float-cli.html')).href + '?agentId=t&protected=1&platform=win32');
      await page.waitForSelector('#copilot-route .cr-toggle');
      const backends = await page.$$eval('#copilot-route .cr-toggle', els => els.map(e => e.textContent));
      for (const b of ['ollama', 'copilot', 'guardian']) assert.ok(backends.includes(b), backends.join());
      await page.fill('#fc-input', '/help'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
      assert.ok(/\/backend/.test(await page.innerText('#fc-log')));
      await page.click('#copilot-route .cr-toggle:has-text("ollama")');
      await page.fill('#fc-input', 'hello'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      const calls = await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'copilot.send').map(c => c.args[0]));
      assert.deepStrictEqual([calls.length, calls[0].backend, calls[0].noDom], [1, 'ollama', true], 'routed, and no page context');
      assert.ok(/hidden from capture/.test(await page.innerText('#fc-shield')));
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('BST-07', 'the window in Clear Glass: one toolbar row; ☰ in Firefox\'s order; 🧩 icons, switch, pin; ⬇ quarantine; Alt menu bar', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: {
        'plugins.list': [{ id: 'z', name: 'zoom', displayName: 'Zoom', description: 'zoom the page', icon: '🔍', state: 'active', commands: [{ signature: 's1', label: 'Zoom in', icon: '➕' }] }, { id: 'a', name: 'adblocker', displayName: 'Ad blocker', description: 'blocks ads', icon: '🛡', state: 'disabled', commands: [] }],
        'options.get': { pinnedPlugins: ['z'] }, 'toolbar.commands': [], 'bookmarks.list': [], 'webext.list': { extensions: [] }, 'plugins.enable': { ok: true },
        'downloads.list': [{ id: 'd1', filename: 'a.zip', state: 'completed', bytes: 1048576, savePath: '/x/a.zip' }] } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForSelector('#sh-ext-pinned button');
      assert.strictEqual(await page.$eval('#chrome', e => Math.round(e.getBoundingClientRect().height)), 44, 'one toolbar row');
      assert.strictEqual(await page.innerText('#sh-ext-pinned'), '🔍', 'the pinned plugin\'s icon');
      await page.click('#bookmark-mgr-btn'); await page.waitForSelector('#bookmark-mgr-panel [data-am="New Tab"]');
      const order = await page.$$eval('#bookmark-mgr-panel .menu-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      const at = (t) => order.findIndex(x => x.replace(/^[^A-Za-z]+/, '').startsWith(t));
      assert.ok(at('New Tab') === 0 && at('Downloads') > at('New Window') && at('Plugins and Add-ons') > at('History') && at('Settings') > at('Find in Page') && at('Customize Toolbar') === order.length - 1, order.join(' | '));
      await page.click('#btn-extensions'); await page.waitForSelector('#sh-extensions-panel .sh-ext-row');
      assert.strictEqual(await page.$eval('#bookmark-mgr-panel', e => e.style.display), 'none', 'one popover at a time');
      assert.deepStrictEqual(await page.$$eval('#sh-extensions-panel .sh-ext-ico', els => els.map(e => e.textContent)), ['🔍', '🛡']);
      await page.click('#sh-extensions-panel .sh-ext-row[data-id="a"] [data-tog]'); await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => window.__cgCalls.some(c => c.key === 'plugins.enable' && c.args[0] === 'a')), 'the switch turns it on');
      await page.click('#sh-extensions-panel .sh-ext-row[data-id="a"] [data-pin]'); await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => window.__cgCalls.some(c => c.key === 'options.set' && (c.args[0].pinnedPlugins || []).includes('a'))), 'the pin is kept');
      if (up) {
        await page.click('#btn-downloads'); await page.waitForSelector('#sh-downloads-panel .sh-dl-row');
        const t = await page.innerText('#sh-downloads-panel');
        assert.ok(t.includes('a.zip') && t.includes('report.pdf') && t.includes('Release') && /snowflake quarantine/i.test(t), t);
      }
      await page.keyboard.press('Escape');
      await page.keyboard.press('Alt'); await page.waitForTimeout(150);
      assert.strictEqual(await page.$eval('#menubar', e => e.hidden), false, 'a lone Alt shows the menu bar');
      assert.deepStrictEqual(await page.$$eval('#menubar .mb-top', els => els.map(e => e.textContent)), ['File', 'Edit', 'View', 'History', 'Bookmarks', 'Tools', 'Help']);
      assert.ok(await page.$('.mb-drop .mb-item'), 'File is open');
      assert.deepStrictEqual(errors, []); await page.close();
    });

    if (!up) console.log('  - BST-08 SKIPPED: port 7702 is in use here — Settings → Import did not run against the stub');
    else await test('BST-08', 'Settings → Import in Clear Glass: profiles listed, one chosen, the import posted, the report shown', async () => {
      const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({}));
      await page.goto(require('url').pathToFileURL(CG('renderer/settings.html')).href + '#import');
      await page.waitForSelector('.imp-profile');
      assert.strictEqual(await page.$$eval('.imp-profile', els => els.length), 2);
      await page.click('.imp-profile[data-path$="w.work"]');
      await page.click('#imp-run'); await page.waitForSelector('.imp-report .row', { timeout: 10000 });
      const body = JSON.parse((bodies.find(b => b[0] === 'POST /cli/firefox/import') || [])[1] || '{}');
      assert.deepStrictEqual([body.profile, body.cookies, body.bookmarks, body.persona, body.into], ['/home/j/.mozilla/firefox/w.work', true, true, false, 'default']);
      const rep = await page.innerText('.imp-report');
      assert.ok(/7 of 10 imported/.test(rep) && /2 expired/.test(rep) && /1 in a container tab/.test(rep), rep);
      assert.deepStrictEqual(errors, []); await page.close();
    });
  } finally { await browser.close().catch(() => {}); srv.close(); }
  done();

  function done() { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }
})();
