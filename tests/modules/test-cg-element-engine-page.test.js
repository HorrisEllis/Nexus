'use strict';
/**
 * tests/modules/test-cg-element-engine-page.test.js — EE3a: the Element Engine's full page (docs/2026-11-05-clear-glass-element-engine-phasemap.spec).
 * James, 2026-11-06: "It’s meant to replace the adblocker also like a full plugin page." · "It needs to have a full page to edit, change and add.
 * Like it needs to be fully featured. Not a small plugin at all dude."
 *
 *   EG-01  hideRule: one check for every hide — a site written any way becomes its host; empty is every site; a bad site or selector is refused, said
 *   EG-02  hidden elements across every site: listed (with exceptions), added, changed in place, removed — lines of his own filters, nothing else touched
 *   EG-03  his ErosmancerOS copy: listed with what changed, read, saved (syntax said), a new file added; a path outside it, not .ts, under a dot
 *          folder or node_modules refused; nothing saved before an export
 *   EG-04  overview: the blocker's switch, counts, lists, allowed sites, hidden count and his copy; no blocker is said, never a throw
 *   EG-05  the routes: each /cli/element-engine/* is on Clear Glass's bridge; a change to his filters or copy needs person:true (refused without)
 *   EG-06  the command row: `element-engine` builds each route; hide, unhide and import are his (personOnly)
 *   EG-07  the page: element-engine.html loads the Settings runtime, the shared helpers, every area and boot last; every area has its CSS; each area
 *          registers (run in a stand-in window) with a render; the ErosmancerOS workbench is Settings' own area, reused and filed as Workbench
 *   EG-08  it replaces the popover: the 🧩 row and the pinned 🛡 open the page; main opens one window and picks in the browser window; the preload
 *          exposes it; the plugin's Hide goes through the same check
 *   EG-09  every area renders: the real Settings runtime (settings/core.js) on a stand-in DOM, each area's render run against fixture answers
 *          (and the editor opened on a file), no throw, the page's text says what the data holds
 * Clear Glass itself (AXIOMS §4.1) cannot run here (no Electron in this sandbox): said; the page is driven on his PC.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const CG = path.join(ROOT, 'clear-glass');
const E = require(path.join(CG, 'src/element-engine/index.js'));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

function fakeSvc(custom = '') {
  const s = { custom, enabled: true, allowed: ['https://ok.example'],
    lists: [{ id: 'easylist', title: 'EasyList', about: 'ads', url: 'https://x/easylist.txt', on: true, loaded: true, rules: 10, updatedAt: 1 }, { id: 'mine', title: 'Mine', on: false, imported: { origin: 'file' } }] };
  return { s, state: () => ({ enabled: s.enabled, network: 5, cosmetic: 3, custom: s.custom, allowed: s.allowed, lists: s.lists }),
    setCustom(t) { s.custom = String(t); return { ok: true, rules: s.custom.split('\n').filter(l => l.trim()).length, skipped: 0, skippedBy: {} }; } };
}

(async () => {
  console.log('\n⬡  The Element Engine page (EE3a)\n');

  await test('EG-01', 'one check for every hide', () => {
    assert.deepStrictEqual(E.hideRule('https://www.Fiverr.com/gigs/x', '.ad'), { ok: true, rule: 'www.fiverr.com##.ad' });
    assert.deepStrictEqual(E.hideRule('', '#slot'), { ok: true, rule: '###slot' });
    assert.deepStrictEqual(E.hideRule('example.com', '.x', { exception: true }), { ok: true, rule: 'example.com#@#.x' });
    assert.deepStrictEqual(E.hideRule('localhost:8080', 'div'), { ok: true, rule: 'localhost:8080##div' });
    for (const [site, sel, why] of [['a b', '.x', /not a site/], ['example.com', '', /selector is needed/], ['example.com', 'unknown', /selector is needed/], ['example.com', 'a\nb', /line break/], ['example.com', 'a##b', /##/], ['example.com', 'x'.repeat(401), /400/]]) {
      const r = E.hideRule(site, sel); assert.strictEqual(r.ok, false, `${site} ${sel.slice(0, 10)}`); assert.match(r.error, why);
    }
  });

  await test('EG-02', 'hidden elements: listed, added, changed in place, removed — his other lines untouched', () => {
    const svc = fakeSvc('||ads.example^\nexample.com##.banner\n! a note\n##.everywhere\nother.org#@#.keep\n');
    const L = E.hidden.list(svc).rules;
    assert.deepStrictEqual(L.map(r => [r.site, r.selector, r.exception]), [['example.com', '.banner', false], ['', '.everywhere', false], ['other.org', '.keep', true]]);
    const a = E.hidden.add(svc, { site: 'fiverr.com', selector: '.promo' }); assert.strictEqual(a.ok, true); assert.strictEqual(a.rule, 'fiverr.com##.promo');
    assert.match(E.hidden.add(svc, { site: 'fiverr.com', selector: '.promo' }).note, /already/);
    const e = E.hidden.edit(svc, { rule: 'example.com##.banner', site: 'example.com', selector: '.banner-top' }); assert.strictEqual(e.ok, true);
    assert.ok(svc.s.custom.split('\n').indexOf('example.com##.banner-top') === 1, 'changed in place, at its line');
    assert.strictEqual(E.hidden.edit(svc, { rule: 'nope##.x', site: 'a.com', selector: '.y' }).ok, false);
    assert.strictEqual(E.hidden.edit(svc, { rule: 'example.com##.banner-top', site: 'a b', selector: '.y' }).ok, false, 'a bad edit is refused, the line kept');
    assert.ok(svc.s.custom.includes('example.com##.banner-top'));
    assert.strictEqual(E.hidden.remove(svc, { rule: '##.everywhere' }).ok, true);
    assert.strictEqual(E.hidden.remove(svc, { rule: '##.everywhere' }).ok, false, 'removing twice is said');
    assert.ok(svc.s.custom.startsWith('||ads.example^\n') && svc.s.custom.includes('! a note'), 'his blocking rule and his note are untouched');
    assert.strictEqual(E.hidden.list(null).ok, false, 'no blocker: said');
  });

  await test('EG-03', 'his ErosmancerOS copy: listed, read, saved, added; escapes refused', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-copy-'));
    const edit = { MANIFEST: '.erosmancer-edit.json', syntaxErrors: (f, t) => (/\{\s*$/.test(t.trim()) ? [`${f}:1:1 '}' expected`] : []) };
    assert.strictEqual(E.copy.write(dir, 'a.ts', 'x', { edit }).ok, false, 'nothing saved before an export');
    assert.strictEqual(E.copy.list(dir, { edit }).exported, false);
    fs.mkdirSync(path.join(dir, 'hostile')); fs.writeFileSync(path.join(dir, 'hostile', 'index.ts'), 'export const a = 1;\n'); fs.writeFileSync(path.join(dir, 'b.ts'), 'b\n');
    const sha = (t) => require('crypto').createHash('sha256').update(t).digest('hex');
    fs.writeFileSync(path.join(dir, '.erosmancer-edit.json'), JSON.stringify({ at: 'now', files: { 'hostile/index.ts': sha('export const a = 1;\n'), 'b.ts': sha('old\n') } }));
    const L = E.copy.list(dir, { edit });
    assert.deepStrictEqual(L.files.map(f => [f.file, f.changed]), [['b.ts', true], ['hostile/index.ts', false]]);
    assert.strictEqual(E.copy.read(dir, 'hostile/index.ts').text, 'export const a = 1;\n');
    const w = E.copy.write(dir, 'hostile/index.ts', 'export const a = 2;\n', { edit }); assert.strictEqual(w.ok, true); assert.deepStrictEqual(w.syntax, []);
    assert.strictEqual(E.copy.list(dir, { edit }).files.find(f => f.file === 'hostile/index.ts').changed, true);
    const bad = E.copy.write(dir, 'b.ts', 'function f() {', { edit }); assert.strictEqual(bad.ok, true); assert.match(bad.note, /does not parse/, 'saved in his copy, the syntax said');
    assert.strictEqual(E.copy.write(dir, 'actions/new.ts', '// new\n', { edit }).ok, true);
    assert.strictEqual(E.copy.list(dir, { edit }).files.find(f => f.file === 'actions/new.ts').changed, 'new');
    for (const f of ['../escape.ts', 'a/../../x.ts', '.git/x.ts', 'node_modules/x.ts', 'x.js', '', '/etc/x.ts']) {
      assert.strictEqual(E.copy.write(dir, f, 'x', { edit }).ok, false, `write ${f}`); assert.strictEqual(E.copy.read(dir, f).ok, false, `read ${f}`);
    }
    assert.ok(!fs.existsSync(path.join(path.dirname(dir), 'escape.ts')));
    assert.strictEqual(E.copy.write(dir, 'big.ts', 'x'.repeat(E.MAX_FILE + 1), { edit }).ok, false, 'over 1 MB refused');
  });

  await test('EG-04', 'overview: the switch, counts, lists, sites, hidden, his copy; no blocker said', () => {
    const o = E.overview(fakeSvc('a.com##.x\n||b^\n'), { editDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ee-ov-')) });
    assert.strictEqual(o.blocker.enabled, true); assert.strictEqual(o.blocker.hidden, 1); assert.strictEqual(o.blocker.lists.length, 2);
    assert.deepStrictEqual(o.blocker.lists.map(l => [l.id, l.imported, l.url]), [['easylist', false, 'https://x/easylist.txt'], ['mine', true, 'file']]);
    assert.strictEqual(o.copy.exported, false);
    const n = E.overview(null, {}); assert.strictEqual(n.ok, true); assert.strictEqual(n.blocker, null); assert.match(n.note, /not running/);
  });

  await test('EG-05', 'the routes on Clear Glass\'s bridge; his changes need person:true', () => {
    const b = read('clear-glass/src/ipc/bridge.js');
    for (const r of ["get('/cli/element-engine/overview'", "get('/cli/element-engine/hidden'", "post('/cli/element-engine/hidden'", "get('/cli/element-engine/copy'", "get('/cli/element-engine/copy/file'", "post('/cli/element-engine/copy/file'", "post('/cli/element-engine/copy/export'", "post('/cli/element-engine/copy/diff'", "post('/cli/element-engine/copy/import'", "post('/cli/element-engine/pick'", "post('/cli/element-engine/open'"]) assert.ok(b.includes(`this.app.${r}`), r);
    const his = b.match(/const _his = \(b, fn\) => \(b\.person === true \? fn\(\) : \{ ok: false/); assert.ok(his, 'the person gate');
    for (const r of ["post('/cli/element-engine/hidden', _netRoute((b) => _his(", "post('/cli/element-engine/copy/file', _netRoute((b) => _his(", "post('/cli/element-engine/copy/import', _netRoute((b) => _his("]) assert.ok(b.includes(r), `gated: ${r}`);
    for (const h of ["'window:openElementEngine'", "'window:closeElementEngine'"]) assert.ok(b.includes(`ipcMain.handle(${h}`), h);
  });

  await test('EG-06', 'the command row builds each route; changing his things is his', () => {
    const RC = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (RC.SPEC || RC.default || []).find(r => r.key === 'element-engine'); assert.ok(row, 'the element-engine row');
    const a = (args) => ({ args, flags: {} });
    const P = (args) => { const r = row.build(a(args)); return `${r.method} ${r.path}`; };
    assert.strictEqual(P([]), 'GET /cli/element-engine/overview');
    assert.strictEqual(P(['hidden']), 'GET /cli/element-engine/hidden');
    assert.deepStrictEqual(row.build(a(['hide', '*', '.ad', 'span'])).body, { op: 'add', site: '', selector: '.ad span', person: true });
    assert.deepStrictEqual(row.build(a(['unhide', 'a.com##.x'])).body, { op: 'remove', rule: 'a.com##.x', person: true });
    assert.strictEqual(P(['copy']), 'GET /cli/element-engine/copy');
    assert.strictEqual(P(['copy-read', 'hostile/index.ts']), 'GET /cli/element-engine/copy/file?file=hostile%2Findex.ts');
    assert.strictEqual(P(['export']), 'POST /cli/element-engine/copy/export');
    assert.strictEqual(P(['diff']), 'POST /cli/element-engine/copy/diff');
    assert.strictEqual(P(['import']), 'POST /cli/element-engine/copy/import');
    assert.strictEqual(P(['pick']), 'POST /cli/element-engine/pick');
    assert.deepStrictEqual(row.build(a(['open', 'hidden'])).body, { area: 'hidden' });
    for (const v of ['hide', 'unhide', 'import']) assert.ok(row.personOnly(a([v])), `${v} is his`);
    for (const v of ['overview', 'hidden', 'copy', 'diff', 'export', 'pick', 'open']) assert.strictEqual(row.personOnly(a([v])), null, `${v} is open`);
  });

  await test('EG-07', 'the page loads the runtime, every area, boot last; each area registers', () => {
    const html = read('clear-glass/renderer/element-engine.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    assert.deepStrictEqual(scripts.slice(0, 3), ['settings/core.js', 'library/api.js', 'element-engine/shared.js']);
    assert.strictEqual(scripts[scripts.length - 1], 'element-engine/boot.js');
    assert.ok(scripts.includes('settings/sections/eros.js'), 'the workbench is Settings\' own area, reused');
    for (const s of scripts) assert.ok(fs.existsSync(path.join(CG, 'renderer', s)), s);
    assert.match(html, /Content-Security-Policy[\s\S]*script-src 'self';/);
    assert.ok(/id="rail"/.test(html) && /id="main"/.test(html) && /id="close"/.test(html) && /id="toasts"/.test(html));
    const areas = scripts.filter(s => s.startsWith('element-engine/sections/'));
    assert.deepStrictEqual(areas.map(s => path.basename(s, '.js')), ['overview', 'lists', 'filters', 'allowed', 'hidden', 'eros-options', 'threats', 'typescript']);
    // each area in a stand-in window: it registers one section with an id, a group of this page, and a render
    const got = [];
    const CGS = { cg: {}, h: () => ({}), section: (d) => got.push(d) };
    for (const k of ['busy', 'pane', 'row', 'btn', 'chip', 'toggle', 'empty', 'field', 'modal', 'confirmDo', 'ago', 'toast', 'goto', 'wire', 'select', 'onLeave', 'unwrap', 'call', 'fail', 'copy', 'agentOptions', 'loadAreaCss', 'show', 'query']) CGS[k] = () => {};
    const win = { CGS, CGL: { api: async () => ({}), matches: () => true, BRIDGE: 'http://127.0.0.1:7702' } };
    const ctx = vm.createContext({ window: win, document: {}, console, setTimeout, clearTimeout, AbortSignal, fetch: async () => ({}) });
    vm.runInContext(read('clear-glass/renderer/element-engine/shared.js'), ctx);
    for (const s of areas) vm.runInContext(read(`clear-glass/renderer/${s}`), ctx, { filename: s });
    vm.runInContext(read('clear-glass/renderer/settings/sections/eros.js'), ctx, { filename: 'eros.js' });
    const boot = read('clear-glass/renderer/element-engine/boot.js');
    const groups = JSON.parse(boot.match(/groups: (\[[^\]]+\])/)[1].replace(/'/g, '"'));
    assert.deepStrictEqual(got.map(d => d.id), ['overview', 'lists', 'filters', 'allowed', 'hidden', 'eros-options', 'threats', 'typescript', 'eros']);
    for (const d of got) { assert.ok(groups.includes(d.group), `${d.id} in a group of this page (${d.group})`); assert.strictEqual(typeof d.render, 'function', d.id); assert.ok(fs.existsSync(path.join(CG, 'renderer/element-engine/sections', `${d.id}.css`)), `${d.id}.css`); }
    assert.strictEqual(got.find(d => d.id === 'eros').label, 'Workbench', 'the workbench, filed under ErosmancerOS');
    assert.match(boot, /cssBase: 'element-engine\/sections\/'/); assert.match(boot, /closeElementEngine\(\)/);
  });

  await test('EG-08', 'it replaces the popover; one window; Pick in the browser window; the plugin\'s Hide is the same check', () => {
    const ext = read('clear-glass/renderer/shell/extensions.js');
    assert.match(ext, /const FULL_PAGE = new Set\(\['adblocker', '8c2f1a90-4e3b-4f1a-9c2d-1a2b3c4d5e6f'\]\)/);
    assert.match(ext, /cg\(\)\.window\.openElementEngine\(\)/);
    const at = ext.indexOf('async function openPlugin('); assert.ok(ext.indexOf('FULL_PAGE.has(p.id)', at) > at && ext.indexOf('FULL_PAGE.has(p.id)', at) < ext.indexOf('pop.dataset.plugin = id', at), 'decided before the popover is drawn');
    const main = read('clear-glass/src/main/index.js');
    for (const f of ['openElementEngineWindow', 'closeElementEngineWindow', 'pickInBrowser']) { assert.match(main, new RegExp(`function ${f}\\(`)); assert.match(main, new RegExp(`module\\.exports = \\{[\\s\\S]*\\b${f}\\b`)); }
    assert.match(main, /renderer\/element-engine\.html/); assert.match(main, /app\.on\('browser-window-focus'/); assert.match(main, /getElementById\('picker-btn'\)/);
    const pre = read('clear-glass/src/preload/index.js');
    assert.match(pre, /openElementEngine: \(area\) => ipcRenderer\.invoke\('window:openElementEngine'/); assert.match(pre, /closeElementEngine: \(\)\s+=> ipcRenderer\.invoke\('window:closeElementEngine'/);
    assert.match(read('clear-glass/plugins/adblocker/index.js'), /require\('\.\.\/\.\.\/src\/element-engine\/index\.js'\)\.hideRule\(host, sel\)/);
  });

  await test('EG-09', 'every area renders on the real runtime (stand-in DOM, fixture answers)', async () => {
    class El {
      constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.className = ''; this._text = ''; this.value = ''; this.listeners = {};
        const self = this; this.classList = { add: (c) => { self.className = `${self.className} ${c}`.trim(); }, remove() {}, toggle() {}, contains: (c) => self.className.split(' ').includes(c) }; }
      set textContent(t) { this._text = String(t); this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(' '); }
      setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
      addEventListener(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); }
      append(...k) { this.children.push(...k); } prepend(...k) { this.children.unshift(...k); } replaceChildren(...k) { this.children = k; } remove() {}
      focus() {} get style2() { return this.style; }
      _all() { return this.children.flatMap(c => (c instanceof El ? [c, ...c._all()] : [])); }
      querySelector(q) { const cls = q.replace(/^\./, ''); return this._all().find(c => c.classList.contains(cls)) || null; }
      querySelectorAll(q) { const cls = q.replace(/^\./, ''); return this._all().filter(c => c.classList.contains(cls)); }
    }
    class Txt { constructor(t) { this.t = String(t); } get textContent() { return this.t; } }
    const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: () => new El('div'), head: new El('head'), body: new El('body'), activeElement: null, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
    const FIX = {
      '/cli/element-engine/overview': { ok: true, blocker: { enabled: true, network: 12345, cosmetic: 678, custom: '||ads^\na.com##.x\n', allowed: ['https://ok.example'], hidden: 1,
        lists: [{ id: 'easylist', title: 'EasyList', about: 'ads', url: 'https://x', on: true, loaded: true, rules: 99, skipped: 0, updatedAt: Date.now(), error: null, imported: false }, { id: 'mine', title: 'Mine', on: true, loaded: true, rules: 3, imported: true, error: 'HTTP 404' }] },
        copy: { dir: '/home/j/erosmancer-edit', exported: true, files: 2, changed: 1 } },
      '/cli/element-engine/hidden': { ok: true, rules: [{ rule: 'a.com##.x', site: 'a.com', selector: '.x', exception: false }, { rule: '##.y', site: '', selector: '.y', exception: false }, { rule: 'b.org#@#.k', site: 'b.org', selector: '.k', exception: true }] },
      '/cli/eros/options': { ok: true, options: [{ key: 'pace', section: 'How it moves', words: 'Pace', does: 'how fast', kind: 'enum', allowed: ['precise', 'turbo'], value: 'turbo', default: 'precise', changed: true, when: 'live' }, { key: 'bridge.pingIntervalMs', section: 'Connection', words: 'Check every', does: 'ping', kind: 'ms', value: 5000, default: 5000, changed: false, when: 'connect' }], fixed: [{ key: 'x.y', does: 'fixed thing', value: 3 }] },
      '/cli/eros/threats': { ok: true, threats: [{ tab: 'abcdef123456', level: 'challenge', score: 70, signals: [{ what: 'Cloudflare is checking', then: 'the page is yours' }] }] },
      '/cli/element-engine/copy': { ok: true, dir: '/home/j/erosmancer-edit', exported: true, at: 'now', files: [{ file: 'hostile/index.ts', bytes: 2048, changed: true }, { file: 'b.ts', bytes: 10, changed: false }] },
      '/cli/element-engine/copy/file?file=hostile%2Findex.ts': { ok: true, file: 'hostile/index.ts', text: 'export const a = 1;\n' },
    };
    const asked = [];
    const api = async (p) => { asked.push(p); if (!(p in FIX)) throw new Error(`no fixture for ${p}`); return FIX[p]; };
    const win = { ClearGlass: { window: {}, plugins: {} }, CGL: { api, matches: () => true, BRIDGE: 'http://127.0.0.1:7702' }, __CG_WIRE_PORT: 1 };
    const ctx = vm.createContext({ window: win, document, console, setTimeout: () => 0, clearTimeout() {}, AbortSignal, Node: El, CSS: { escape: (x) => x }, history: { replaceState() {} }, location: { hash: '' }, navigator: {},
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, state: 'running', port: 7432 }) }) });
    vm.runInContext(read('clear-glass/renderer/settings/core.js'), ctx, { filename: 'core.js' });
    const got = []; const orig = win.CGS.section; win.CGS.section = (d) => { got.push(d); return orig(d); };
    vm.runInContext(read('clear-glass/renderer/element-engine/shared.js'), ctx);
    const html = read('clear-glass/renderer/element-engine.html');
    for (const s of [...html.matchAll(/<script src="(element-engine\/sections\/[^"]+)"><\/script>/g)].map(m => m[1])) vm.runInContext(read(`clear-glass/renderer/${s}`), ctx, { filename: s });
    const text = {};
    for (const d of got) {
      const out = [].concat(await d.render({ rerender() {}, query: '', page: new El('div'), tools: new El('div') }));
      assert.ok(out.length && out.every(n => n instanceof El), `${d.id} renders nodes`);
      text[d.id] = out.map(n => n.textContent).join(' ');
    }
    assert.match(text.overview, /12,345/); assert.match(text.overview, /Pick an element/); assert.match(text.overview, /running/);
    assert.match(text.lists, /EasyList/); assert.match(text.lists, /last update failed: HTTP 404/); assert.match(text.lists, /Remove/);
    assert.match(text.filters, /2 rule line\(s\)/);
    assert.match(text.allowed, /https:\/\/ok\.example/);
    assert.match(text.hidden, /every site/); assert.match(text.hidden, /a\.com/); assert.match(text.hidden, /exception/);
    assert.match(text['eros-options'], /Pace/); assert.match(text['eros-options'], /yours/); assert.match(text['eros-options'], /Fixed in its code/);
    assert.match(text.threats, /Cloudflare is checking/); assert.match(text.threats, /70\/100/);
    assert.match(text.typescript, /2 files · 1 changed/); assert.match(text.typescript, /hostile\/index\.ts/);
    // open a file in the editor (its Edit button), render again: the editor shows the file's text
    const ts = got.find(d => d.id === 'typescript');
    const first = [].concat(await ts.render({ rerender() {}, query: '' }));
    const editBtn = first.flatMap(n => n._all()).find(n => n.tagName === 'BUTTON' && n.textContent === 'Edit');
    await editBtn.listeners.click[0]({ currentTarget: editBtn, target: editBtn });
    const again = [].concat(await ts.render({ rerender() {}, query: '' }));
    const ta = again.flatMap(n => n._all()).find(n => n.tagName === 'TEXTAREA');
    assert.ok(ta, 'the editor is open'); assert.strictEqual(ta.value, 'export const a = 1;\n'); assert.ok(asked.includes('/cli/element-engine/copy/file?file=hostile%2Findex.ts'));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  console.log('  (Clear Glass itself — AXIOMS §4.1 — is not run here: no Electron in this sandbox. The page is driven on his PC.)');
  process.exit(failed ? 1 : 0);
})();
