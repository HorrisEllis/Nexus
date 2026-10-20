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
 *   BST-09  0.60.180 design: drawn icons on every toolbar button, no emoji; the address bar takes the row; empty bookmarks strip hidden
 *   BST-10  0.60.180 the Guardian hub: real state per agent, Start/Open/Stop, the running badge, the tools; the old panel reads running
 *   BST-12  0.60.182 context decided by Co-pilot per message (page / picks / sign-in cookies); the chips gone; /ctx still forces
 *   BST-11  0.60.180 the start page over a blank tab: search, agent cards, bookmarks; hidden once the tab navigates
 *   BST-13  0.60.183 a plugin's page: clicking its row in the 🧩 panel opens about, permissions, its fields; a field's change asks the plugin
 *   BST-14  0.60.183 page zoom in the core: Firefox's ladder, saved per site (100% = no row), restored on navigate; the driver and the window use it
 *   BST-15  0.60.183 the right-click menu: groups by what was clicked, placed at the pointer the main process reports, flipped at the edges
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
const SHOTS = process.env.BST_SHOTS || os.tmpdir();   // screenshots for the person, outside the repo

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
    assert.ok(links.indexOf('cos-theme.css') > links.indexOf('browser.css') && links.indexOf('shell/shell.css') > links.indexOf('cos-theme.css') && links.slice(links.indexOf('shell/shell.css')).every(l => l.startsWith('shell/')), links.join(' '));   // 0.60.180: shell.css then copilot.css, last
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
    // 0.60.183: the Page Zoom plugin is archived (zoom is core, BS14); it is still a valid plugin with commands, so the host's mechanics are proven on it
    host.install(require(CG('plugins/_archive/zoom-0.60.182/manifest.json')), require(CG('plugins/_archive/zoom-0.60.182/index.js')));
    const id = require(CG('plugins/_archive/zoom-0.60.182/manifest.json')).id;
    const before = host.list().find(p => p.id === id);
    assert.strictEqual(before.icon, '🔍'); assert.ok(before.commands.length >= 1 && before.commands[0].signature);
    host.disable(id); assert.strictEqual(host.list().find(p => p.id === id).state, 'disabled');
    host.enable(id);
    const after = host.list().find(p => p.id === id);
    assert.deepStrictEqual([after.state, after.contributions], ['active', before.contributions]);
    for (const d of fs.readdirSync(CG('plugins')).filter(d => !d.startsWith('_'))) assert.ok(require(CG(`plugins/${d}/manifest.json`)).icon, `${d} has an icon`);
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

  await test('BST-14', 'zoom in the core: Firefox\'s ladder; saved per site (100% leaves no row); restored; the driver and the window go through it', () => {
    const Z = require(CG('src/core/zoom.js'));
    assert.deepStrictEqual([Z.step(1, 'in'), Z.step(1.1, 'out'), Z.step(3, 'in'), Z.step(0.95, 'in'), Z.step(0.3, 'out'), Z.step(1.25, 'out'), Z.clamp(9), Z.clamp('x')], [1.1, 1, 3, 1, 0.3, 1.2, 3, 1]);
    const data = {}; const o = (u) => new URL(u).origin;
    const sites = { get: (u, k) => (data[o(u)] || {})[k], set: (u, k, v) => { data[o(u)] = { ...(data[o(u)] || {}), [k]: v }; return true; }, deleteKey: (u, k) => { delete (data[o(u)] || {})[k]; return true; } };
    let url = 'https://news.com/a', f = 1; const wc = { setZoomFactor: (x) => { f = x; }, getZoomFactor: () => f, getURL: () => url };
    const z = Z.createZoom({ siteSettings: sites });
    assert.deepStrictEqual([z.step(wc, 'in').factor, z.step(wc, 'in').factor], [1.1, 1.2]);
    assert.strictEqual(data['https://news.com'].zoomFactor, 1.2);
    url = 'https://other.com/'; assert.strictEqual(z.restore(wc).factor, 1);
    url = 'https://news.com/b'; assert.strictEqual(z.restore(wc).factor, 1.2, 'restored on the same site');
    z.reset(wc); assert.strictEqual(data['https://news.com'].zoomFactor, undefined, '100% is no setting');
    assert.deepStrictEqual(z.set(null, 2), { ok: false, error: 'no page to zoom' });
    const drv = fs.readFileSync(CG('src/driver/index.js'), 'utf8'); assert.ok(/require\('\.\.\/core\/zoom'\)\.zoom\(\)/.test(drv) && /zoomed: true/.test(drv));
    const bjs = fs.readFileSync(CG('renderer/browser.js'), 'utf8'); assert.ok(/cg\.zoom\.step\(_wcId\(\), dir\)/.test(bjs) && !/applyZoom\(_zoomFactor [+-] 0\.1\)/.test(bjs), 'the window steps through the core');
    const main = fs.readFileSync(CG('src/main/index.js'), 'utf8'); assert.ok(!/BUILTIN_PLUGINS = \[[^\]]*'zoom'/.test(main) && fs.existsSync(CG('plugins/_archive/zoom-0.60.182/manifest.json')) && !fs.existsSync(CG('plugins/zoom')), 'the plugin archived, not loaded');
  });

  await test('BST-15a', 'the right-click menu\'s place: down-right of the point, flipped at the right and bottom edges, never off the window', () => {
    const M = require(CG('renderer/shell/ctxmenu.js'));
    assert.deepStrictEqual(M.place(100, 100, 250, 300, 1280, 800), { left: 101, top: 101, flipX: false, flipY: false });
    assert.deepStrictEqual(M.place(1200, 100, 250, 300, 1280, 800), { left: 949, top: 101, flipX: true, flipY: false });
    assert.deepStrictEqual(M.place(100, 700, 250, 300, 1280, 800), { left: 101, top: 399, flipX: false, flipY: true });
    assert.deepStrictEqual(M.place(NaN, 50, 250, 900, 1280, 800), { left: 4, top: 4, flipX: false, flipY: true });
    assert.deepStrictEqual(M.contextOf({ linkURL: 'https://a.com', mediaType: 'image', srcURL: 'https://a.com/i.png', selectionText: ' hi ' }, { pluginRows: 1 }), { page: true, bare: false, link: true, image: true, selection: true, editable: false, plugins: true });
    assert.strictEqual(M.contextOf({}).bare, true, 'nothing particular: the navigation row and page rows');
    assert.deepStrictEqual(M.contextOf({}, { chrome: true }), { chrome: true });
    const html = fs.readFileSync(CG('renderer/browser.html'), 'utf8');
    const old = ['unpin', 'unpin-sep', 'customize-toolbar', 'customize-toolbar-sep', 'bookmark', 'snapshot', 'pick', 'answer-question', 'copilot-page', 'tokens', 'bg-tab', 'new-agent', 'find', 'print'];
    for (const a of old) assert.ok(html.includes(`data-action="${a}"`), `0.60.182 action kept: ${a}`);
    const bjs = fs.readFileSync(CG('renderer/browser.js'), 'utf8');
    for (const a of [...html.matchAll(/data-action="([\w-]+)"/g)].map(m => m[1]).filter(a => !/-sep$/.test(a))) assert.ok(bjs.includes(`case '${a}'`), `browser.js handles ${a}`);
  });

  await test('BST-12', 'context decided by Co-pilot: page / picks / sign-in cookies per message; no value in the cookie summary; chips gone', () => {
    const N = require(CG('src/copilot/context-need.js'));
    const pick = [{ selector: '#apply' }];
    const t = (m, o) => { const r = N.need(m, o); return [r.dom, r.picks, r.cookies]; };
    assert.deepStrictEqual(t('summarise this page'), [true, false, false]);
    assert.deepStrictEqual(t('what is 2 + 2?'), [false, false, false], 'not about the page: nothing attached');
    assert.deepStrictEqual(t('fill this in with my details', { picks: pick }), [true, true, false]);
    assert.deepStrictEqual(t('why does the button not work', { picks: pick, pickedAt: Date.now() - 30000 }), [true, true, false], 'picked moments ago');
    assert.deepStrictEqual(t('tell me a joke', { picks: pick, pickedAt: Date.now() - 600000 }), [false, false, false], 'old picks not pointed at');
    assert.deepStrictEqual(t('am I logged in here?'), [true, false, true]);
    assert.deepStrictEqual(t('/help'), [false, false, false]);
    assert.deepStrictEqual(t('hello', { force: { dom: true } }), [true, false, false], '/ctx dom on still forces');
    const sum = N.cookieSummary([{ name: '__Secure-session', value: 'SECRET-VALUE', domain: '.x.com', httpOnly: true, secure: true, expirationDate: Date.now() / 1000 + 7200 }, { name: 'theme', value: 'dark', domain: 'x.com' }], 'https://x.com/');
    assert.ok(!JSON.stringify(sum).includes('SECRET-VALUE') && !JSON.stringify(sum).includes('dark'), 'no cookie value');
    assert.deepStrictEqual([sum.count, sum.signIn.map(c => c.name), sum.soonest.expiresInHours], [2, ['__Secure-session'], 2]);
    const br = fs.readFileSync(CG('src/copilot/bridge.js'), 'utf8'); const js = fs.readFileSync(CG('renderer/browser.js'), 'utf8');
    assert.ok(/if \(autoContext\) \{[\s\S]{0,200}context-need'\)\.need\(message/.test(br), 'the bridge decides');
    assert.ok(/autoContext: true/.test(js) && /let ctxDom\s+= false;/.test(js), 'the pane asks it to; DOM is not forced by default');
    assert.ok(/<div id="copilot-context-bar" hidden>/.test(fs.readFileSync(CG('renderer/browser.html'), 'utf8')), 'the chips are gone (ids kept)');
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
      assert.strictEqual(await page.$eval('#chrome', e => Math.round(e.getBoundingClientRect().height)), 48, 'one toolbar row (48px, BS8)');
      assert.strictEqual(await page.$eval('#sh-ext-pinned button', b => !!b.querySelector('svg') && b.title), 'Zoom', 'the pinned plugin, as its drawn icon (0.60.180)');
      await page.click('#bookmark-mgr-btn'); await page.waitForSelector('#bookmark-mgr-panel [data-am="New Tab"]');
      const order = await page.$$eval('#bookmark-mgr-panel .menu-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      const at = (t) => order.findIndex(x => x.replace(/^[^A-Za-z]+/, '').startsWith(t));
      assert.ok(at('New Tab') === 0 && at('Downloads') > at('New Window') && at('Plugins and Add-ons') > at('History') && at('Settings') > at('Find in Page') && at('Customize Toolbar') === order.length - 1, order.join(' | '));
      await page.click('#btn-extensions'); await page.waitForSelector('#sh-extensions-panel .sh-ext-row');
      assert.strictEqual(await page.$eval('#bookmark-mgr-panel', e => e.style.display), 'none', 'one popover at a time');
      assert.deepStrictEqual(await page.$$eval('#sh-extensions-panel .sh-ext-ico', els => els.map(e => !!e.querySelector('svg'))), [true, true], 'drawn plugin icons');
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

    await test('BST-09', 'design: every toolbar button draws an icon (no emoji glyph left on the bar); the address bar takes the row', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'providers.list': [], 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {} } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForSelector('#btn-back svg');
      const bare = await page.$$eval('#chrome > button, #chrome .sh-navgroup > button, #tab-bar button', els => els.filter(e => !e.querySelector('svg') && e.offsetParent).map(e => e.id || e.textContent));
      assert.deepStrictEqual(bare, [], 'buttons without a drawing: ' + bare.join(', '));
      const emoji = await page.$eval('#chrome', e => [...e.querySelectorAll('button')].filter(b => b.offsetParent && /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(b.textContent)).map(b => b.id));
      assert.deepStrictEqual(emoji, [], 'emoji left: ' + emoji.join(', '));
      const ratio = await page.evaluate(() => document.getElementById('url-bar-wrap').getBoundingClientRect().width / document.getElementById('chrome').getBoundingClientRect().width);
      assert.ok(ratio > 0.45, `the address bar takes most of the row (${ratio.toFixed(2)})`);
      assert.strictEqual(await page.$eval('#bookmarks-bar', e => getComputedStyle(e).display), 'none', 'an empty bookmarks strip is hidden');
      // 0.60.181 — James: "maybe just copilot": the pane has no route switch; the floating CLI keeps it
      assert.strictEqual(await page.$eval('#copilot-route', e => e.hidden && e.children.length === 0), true, 'the pane is Co-pilot only');
      assert.ok(/fixedBackend: 'copilot'/.test(fs.readFileSync(CG('renderer/browser.js'), 'utf8')) && !/fixedBackend/.test(fs.readFileSync(CG('renderer/float-cli.js'), 'utf8')));
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('BST-10', 'Guardian hub: running agents show Open and Stop, the rest Start; the badge counts running; the old panel reads running', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'providers.list': [{ id: 'claude', name: 'Claude', color: '#cc785c', running: true, status: 'injected', health: 100 }, { id: 'gemini', name: 'Gemini', color: '#4285f4', running: false }, { id: 'deepseek', name: 'DeepSeek', color: '#4d6bfe', running: false, status: 'crashed' }],
        'mesh.list': { queueDepth: 3 }, 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {}, 'providers.start': { ok: true } } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForFunction(() => document.querySelector('#btn-agents .sh-badge') && !document.querySelector('#btn-agents .sh-badge').hidden, null, { timeout: 8000 });
      assert.strictEqual(await page.innerText('#btn-agents .sh-badge'), '1');
      await page.click('#btn-agents'); await page.waitForSelector('#sh-agents-panel .ag-card');
      const cards = await page.$$eval('#sh-agents-panel .ag-card', els => els.map(e => [e.dataset.id, [...e.querySelectorAll('[data-act]')].map(b => b.dataset.act).join('+'), e.querySelector('.ag-state').textContent.trim()]));
      assert.deepStrictEqual(cards.map(c => c.slice(0, 2)), [['claude', 'show+stop'], ['gemini', 'start'], ['deepseek', 'start']]);
      assert.ok(/Crashed/.test(cards[2][2]) && /queue 3/.test(await page.innerText('#sh-agents-panel .ag-sum')));
      await page.click('#sh-agents-panel .ag-card[data-id="gemini"] [data-act="start"]'); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__cgCalls.some(c => c.key === 'providers.start' && c.args[0] === 'gemini')));
      const tools = await page.$$eval('#sh-agents-panel .ag-tool b', els => els.map(e => e.textContent));
      for (const t of ['Agent mesh', 'Pick an element', 'Guardian scripts', 'Accounts and profiles']) assert.ok(tools.includes(t), t);
      const src = fs.readFileSync(CG('renderer/browser.js'), 'utf8');
      assert.ok(!/\$\{p\.hosted \?/.test(src), 'nothing reads hosted alone (the host sends running)');
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('BST-13', 'a plugin\'s page in Clear Glass: its row opens about, permissions and its fields; a list switch asks the plugin', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const view = { summary: { value: '37', label: 'blocked on this page' }, fields: [
        { key: 'enabled', type: 'toggle', label: 'Block ads and trackers', value: true },
        { key: 'site', type: 'toggle', label: 'Block on news.com', value: true },
        { type: 'info', label: 'Rules in use', value: '112,781 blocking · 24,365 hiding' },
        { key: 'lists', type: 'list', label: 'Filter lists', items: [{ id: 'easylist', label: 'EasyList', on: true, sub: 'Ads · 80,868 rules · updated 2 h ago' }, { id: 'ublock', label: 'uBlock filters', on: false, sub: 'uBlock Origin’s own fixes' }] },
        { key: 'update', type: 'action', label: 'Update lists now', kind: 'primary' },
        { key: 'custom', type: 'textarea', label: 'My filters', value: '', placeholder: '||ads.example.com^' },
        { key: 'allowed', type: 'list', label: 'Allowed sites', items: [{ id: 'https://bank.com', label: 'https://bank.com', remove: true }] }] };
      await page.addInitScript(initScript({ answers: {
        'plugins.list': [{ id: 'a', name: 'adblocker', displayName: 'Ad Blocker', version: '2.0.0', description: 'Blocks ads and trackers with the standard filter lists.', icon: '🛡', state: 'active', commands: [], author: 'James Brooks (Erosmancer)', permissions: { webRequest: true, network: false }, settings: 'plugin:a:settings', settingsSection: 'sites' },
          { id: 'p', name: 'passwords', displayName: 'Passwords', version: '1.0.0', description: 'Saved logins.', icon: '🔑', state: 'active', commands: [], permissions: {}, settings: null, settingsSection: 'privacy' }],
        'plugins.settings': { ok: true, view }, 'options.get': { pinnedPlugins: ['a'] }, 'toolbar.commands': [], 'bookmarks.list': [], 'webext.list': { extensions: [] } } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForFunction(() => { const b = document.querySelector('#sh-ext-pinned [data-plugin="a"] .sh-badge'); return b && !b.hidden; }, null, { timeout: 8000 });
      assert.strictEqual(await page.innerText('#sh-ext-pinned [data-plugin="a"] .sh-badge'), '37', 'the count on the pinned shield');
      await page.click('#btn-extensions'); await page.waitForSelector('#sh-extensions-panel .sh-ext-row[data-id="a"]');
      await page.click('#sh-extensions-panel .sh-ext-row[data-id="a"] .sh-ext-name');
      await page.waitForSelector('#sh-extensions-panel .ps-summary');
      const t = await page.innerText('#sh-extensions-panel');
      for (const w of ['Ad Blocker', '37', 'Block ads and trackers', 'EasyList', 'Update lists now', 'My filters', 'https://bank.com', 'Sees requests', 'Open Site settings in Settings']) assert.ok(t.includes(w), `${w} in: ${t}`);
      await page.screenshot({ path: path.join(SHOTS, 'bst13-adblock-page.png') });
      await page.click('#sh-extensions-panel .ps-item:has-text("uBlock filters") .tog'); await page.waitForTimeout(250);
      const call = await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'plugins.settings' && c.args[1] === 'set').pop());
      assert.deepStrictEqual(call.args.slice(0, 4), ['a', 'set', 'lists', { id: 'ublock', on: true }], JSON.stringify(call.args));
      await page.click('#sh-extensions-panel .ps-back'); await page.waitForSelector('#sh-extensions-panel .sh-ext-row[data-id="p"]');
      await page.click('#sh-extensions-panel .sh-ext-row[data-id="p"] .sh-ext-desc'); await page.waitForSelector('#sh-extensions-panel .ps-about');
      const tp = await page.innerText('#sh-extensions-panel'); assert.ok(tp.includes('Passwords') && tp.includes('No special permissions') && tp.includes('Open Privacy in Settings'), tp);
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('BST-15', 'the right-click menu in Clear Glass: at the pointer, link and plugin rows on a link, toolbar rows on the toolbar', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'window.cursor': { ok: true, x: 640, y: 300 }, 'plugins.contextItems': [{ id: 'sig-snow', label: 'Open link with Snowflake', icon: '❄', when: 'link' }],
        'plugins.list': [], 'options.get': {}, 'toolbar.commands': [], 'bookmarks.list': [] } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForSelector('#btn-back svg');
      await page.evaluate(() => { const ev = new Event('context-menu'); ev.params = { x: 10, y: 10, linkURL: 'https://example.com/a', selectionText: '', isEditable: false, mediaType: 'none' }; document.getElementById('wv').dispatchEvent(ev); });
      await page.waitForFunction(() => document.getElementById('ctx-menu').classList.contains('visible') && document.getElementById('ctx-menu').dataset.source, null, { timeout: 5000 });
      const at = await page.$eval('#ctx-menu', m => ({ left: parseInt(m.style.left), top: parseInt(m.style.top), source: m.dataset.source, groups: [...m.querySelectorAll('.ctx-group')].filter(g => !g.hidden).map(g => g.dataset.when) }));
      assert.deepStrictEqual([at.left, at.top, at.source], [641, 301, 'pointer'], 'its corner at the pointer the main process reported, not params.x/y: ' + JSON.stringify(at));
      assert.deepStrictEqual([...new Set(at.groups)], ['link', 'plugins', 'page'], at.groups.join(','));
      const rows = await page.$$eval('#ctx-menu .ctx-group:not([hidden]) .ctx-item', els => els.filter(e => e.style.display !== 'none').map(e => e.textContent.trim()));
      assert.ok(rows.includes('Open link in new tab') && rows.includes('Open link with Snowflake') && rows.includes('Ask Co-pilot about this page'), rows.join(' | '));
      assert.ok(await page.$eval('#ctx-menu', m => [...m.querySelectorAll('.ctx-group:not([hidden]) .ci-ico')].every(i => i.querySelector('svg'))), 'every row draws its icon');
      await page.screenshot({ path: path.join(SHOTS, 'bst15-context-menu.png') });
      await page.click('#ctx-menu [data-action="link-copilot"]'); await page.waitForTimeout(150);   // (the tab rows need a real <webview>, which this engine has not)
      assert.strictEqual(await page.$eval('#ctx-menu', m => m.classList.contains('visible')), false, 'a row closes it');
      assert.ok((await page.$eval('#copilot-textarea', t => t.value)).includes('https://example.com/a'), 'the link row acted on the link clicked');
      await page.click('#chrome', { button: 'right', position: { x: 600, y: 20 } }); await page.waitForTimeout(200);
      const chrome = await page.$eval('#ctx-menu', m => ({ groups: [...m.querySelectorAll('.ctx-group')].filter(g => !g.hidden).map(g => g.dataset.when), left: parseInt(m.style.left), top: parseInt(m.style.top) }));
      assert.deepStrictEqual(chrome.groups, ['chrome'], 'the toolbar shows only the toolbar rows: ' + JSON.stringify(chrome));
      const top = await page.$eval('#chrome', e => Math.round(e.getBoundingClientRect().top));
      assert.deepStrictEqual([chrome.left, chrome.top], [601, top + 21], 'a toolbar right-click is placed at its own event point: ' + JSON.stringify(chrome));
      assert.deepStrictEqual(errors, []); await page.close();
    });

    await test('BST-11', 'start page: a blank tab shows search, agent cards and bookmarks; navigating hides it; its search navigates', async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'providers.list': [{ id: 'claude', name: 'Claude', color: '#cc785c', running: true }], 'toolbar.commands': [], 'plugins.list': [], 'options.get': {},
        'bookmarks.list': [{ id: 'b1', url: 'https://github.com', title: 'GitHub', agentId: 't' }] } }));
      await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
      await page.waitForSelector('#sh-newtab .nt-agent');
      assert.strictEqual(await page.$eval('#sh-newtab', e => e.hidden), false);
      assert.deepStrictEqual([await page.innerText('#sh-newtab .nt-agent-name'), await page.innerText('#sh-newtab .nt-tile-name')], ['Claude', 'GitHub']);
      assert.strictEqual(await page.$eval('#sh-newtab', e => e.closest('#webview-wrap') !== null && !e.closest('webview')), true, 'in the shell, not the page');
      await page.evaluate(() => { window.__nav = []; window.CGShell.navigate = (u) => window.__nav.push(u); });
      await page.fill('#nt-q', 'github.com'); await page.evaluate(() => document.querySelector('#sh-newtab .nt-search').requestSubmit()); await page.waitForTimeout(100);
      assert.deepStrictEqual(await page.evaluate(() => window.__nav), ['https://github.com']);
      await page.evaluate(() => window.CGNewTab.sync('https://example.com/'));
      assert.strictEqual(await page.$eval('#sh-newtab', e => e.hidden), true, 'gone once the tab goes somewhere');
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
