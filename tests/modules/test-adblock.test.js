'use strict';
/**
 * tests/modules/test-adblock.test.js — AB1–AB4 (0.60.183). Spec: clear-glass/spec/adblock.spec. Map: docs/2026-10-21-adblock-phasemap.spec
 * James, 2026-10-21: "can you make a full adblocker and make it so i can click on them t ochange their settings."
 *
 *   ABK-01  network rules: ||host^ on the dot boundary, | anchors, * and ^, /regex/; hosts files
 *   ABK-02  exceptions: @@ beats a block, $important beats @@; @@…$document leaves the whole page alone
 *   ABK-03  options: third-party / first-party on the registrable domain, resource types and negations, domain= with ~
 *   ABK-04  a page itself is blocked only by $document (ABK-005)
 *   ABK-05  element hiding: generic, per-domain, ~domain, #@#, $elemhide and $generichide; CSS grouped in :is()
 *   ABK-06  what cannot be applied exactly is skipped and counted by name (scriptlets, redirects, procedural, csp, popup…)
 *   ABK-07  lists: the built-in list with no network; update through the injected fetch; a failed update keeps the copy and says why
 *   ABK-08  allowed sites live in site settings (contentFilter=off); counts per tab reset on a main-frame request; off = nothing blocked
 *   ABK-09  the plugin: filterRequest asks the service (type, page, tab); the 0.60.x isBlocked contract; settings get/set/action
 *   ABK-10  webrequest-adapter sends resourceType, pageUrl and tabId; plugins:settings's _askPlugin returns the plugin's view over the bus
 *   ABK-11  surface: the `adblock` row's requests; rules are person-only; the agent tool refuses rules
 *   ABK-12  0.60.184 his own lists: a folder (ABP list, hosts file, domain list, an image skipped); each a list of its own; update re-reads,
 *           a gone original keeps the copy; remove; a list URL subscribed and updated like the catalogue
 *   ABK-13  0.60.184 the page: Import and Subscribe fields; set import { paths } → lists added and said; remove from the list; the row and tool verbs
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const { parseList, Engine, siteOf } = require(CG('src/adblock/engine.js'));
const L = require(CG('src/adblock/lists.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const eng = (text) => new Engine().load('t', parseList(text));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abk-'));
function fakeSites() {
  const data = {}; const o = (u) => { try { return new URL(u).origin; } catch (_) { return null; } };
  return { data, get: (u, k) => (data[o(u)] || {})[k], set: (u, k, v) => { const x = o(u); if (!x) return false; data[x] = { ...(data[x] || {}), [k]: v }; return true; },
    deleteKey: (u, k) => { const x = o(u); if (!x || !data[x]) return false; delete data[x][k]; if (!Object.keys(data[x]).length) delete data[x]; return true; }, listOrigins: () => Object.keys(data) };
}

(async () => {
  console.log('test-adblock — a full content blocker: lists, exceptions, options, element hiding, per-site allow, its settings page');

  await test('ABK-01', 'network rules: host boundary, anchors, wildcards, separator, regex, hosts files', () => {
    const e = eng('||doubleclick.net^\n|https://a.com/start|\n/banner/*/ad_\n||cdn.x.com/ads/*.js\n/\\/pop[0-9]+\\.js/\n0.0.0.0 badhost.net\n127.0.0.1 localhost');
    const m = (url) => e.match({ url, type: 'script', pageUrl: 'https://site.org/' }).block;
    assert.deepStrictEqual([m('https://ad.doubleclick.net/x'), m('https://doubleclick.net:443/'), m('https://notdoubleclick.net/x'), m('https://doubleclick.network/')], [true, true, false, false]);
    assert.deepStrictEqual([m('https://a.com/start'), m('https://a.com/start/more')], [true, false]);
    assert.deepStrictEqual([m('https://q.com/banner/x/ad_1.png'), m('https://cdn.x.com/ads/v1/t.js'), m('https://cdn.x.com/img/t.js')], [true, true, false]);
    assert.deepStrictEqual([m('https://z.com/pop12.js'), m('https://z.com/popular.js'), m('https://www.badhost.net/a'), m('http://localhost/')], [true, false, true, false]);
  });

  await test('ABK-02', 'exceptions: @@ beats a block; $important beats @@; @@…$document leaves the page alone', () => {
    const e = eng('||ads.com^\n@@||ads.com/ok/\n||track.io^$important\n@@||track.io^\n@@||trusted.org^$document');
    const v = (url, page = 'https://p.com/') => e.match({ url, type: 'image', pageUrl: page });
    assert.strictEqual(v('https://ads.com/x').block, true);
    const ok = v('https://ads.com/ok/1'); assert.strictEqual(ok.block, false); assert.strictEqual(ok.exception, '@@||ads.com/ok/');
    assert.strictEqual(v('https://track.io/p').block, true, '$important wins');
    assert.strictEqual(v('https://ads.com/x', 'https://www.trusted.org/a').block, false, 'the whole page is allowed');
  });

  await test('ABK-03', 'options: third-party on the registrable domain; types and negations; domain= with ~', () => {
    assert.deepStrictEqual([siteOf('a.b.example.co.uk'), siteOf('x.y.example.com'), siteOf('localhost'), siteOf('10.0.0.1')], ['example.co.uk', 'example.com', 'localhost', '10.0.0.1']);
    const e = eng('||t.net^$third-party\n||f.net^$1p\n/adx/$script\n/img/$~image\n||d.com^$domain=a.com|~b.a.com');
    const v = (url, type, page) => e.match({ url, type, pageUrl: page }).block;
    assert.deepStrictEqual([v('https://cdn.t.net/x', 'script', 'https://site.com/'), v('https://cdn.t.net/x', 'script', 'https://www.t.net/')], [true, false]);
    assert.deepStrictEqual([v('https://f.net/x', 'script', 'https://f.net/'), v('https://f.net/x', 'script', 'https://o.com/')], [true, false]);
    assert.deepStrictEqual([v('https://s.com/adx/1', 'script', 'https://s.com/'), v('https://s.com/adx/1', 'image', 'https://s.com/')], [true, false]);
    assert.deepStrictEqual([v('https://s.com/img/1', 'image', 'https://s.com/'), v('https://s.com/img/1', 'xhr', 'https://s.com/')], [false, true]);
    assert.deepStrictEqual([v('https://d.com/x', 'script', 'https://www.a.com/'), v('https://d.com/x', 'script', 'https://b.a.com/'), v('https://d.com/x', 'script', 'https://c.com/')], [true, false, false]);
  });

  await test('ABK-04', 'a page itself is blocked only by a $document rule', () => {
    const e = eng('||ads.com^\n||evil.com^$document');
    assert.strictEqual(e.match({ url: 'https://ads.com/', type: 'mainFrame' }).block, false, 'he asked for the page');
    assert.strictEqual(e.match({ url: 'https://evil.com/', type: 'mainFrame' }).block, true);
    assert.strictEqual(e.match({ url: 'https://ads.com/x.js', type: 'script', pageUrl: 'https://p.com' }).block, true);
  });

  await test('ABK-05', 'element hiding: generic, per-domain, ~domain, #@#, $elemhide, $generichide; CSS in :is()', () => {
    const e = eng('##.ad-box\nexample.com##.side-ad\n~foo.com##.gen\nexample.com#@#.ad-box\n@@||nohide.com^$elemhide\n@@||onlyspec.com^$generichide\nonlyspec.com##.mine');
    const sel = (u) => (e.cosmetics(u).match(/:is\(([^)]*)\)/) || [, ''])[1].split(',').filter(Boolean).sort();
    assert.deepStrictEqual(sel('https://example.com/'), ['.gen', '.side-ad']);
    assert.deepStrictEqual(sel('https://www.foo.com/'), ['.ad-box']);
    assert.deepStrictEqual(sel('https://other.org/'), ['.ad-box', '.gen']);
    assert.strictEqual(e.cosmetics('https://nohide.com/'), '');
    assert.deepStrictEqual(sel('https://onlyspec.com/'), ['.mine']);
    assert.ok(/^:is\(.+\)\{display:none!important\}$/.test(e.cosmetics('https://other.org/')));
    const many = Engine.css(Array.from({ length: 900 }, (_, i) => `.a${i}`)); assert.strictEqual(many.split('\n').length, 3, 'groups of 400');
  });

  await test('ABK-06', 'what cannot be applied exactly is skipped and counted by name', () => {
    const p = parseList('example.com##+js(abort-on-property-read, x)\na.com##div:has-text(Sponsored)\n||x.com^$redirect=noop.js\n||y.com^$csp=script-src none\n||z.com^$popup\nb.com#?#div:-abp-has(.ad)\n||q.com^$removeparam=utm\n||w.com^$elemhide\n||ok.com^\n##.fine');
    assert.deepStrictEqual(p.skipped, { scriptlet: 1, procedural: 2, redirect: 1, csp: 1, popup: 1, removeparam: 1, 'elemhide-block': 1 });
    assert.strictEqual(p.network.length, 1); assert.strictEqual(p.cosmetic.length, 1);
  });

  await test('ABK-07', 'lists: built-in with no network; update through fetch; a failed update keeps the copy and says why', async () => {
    const dir = tmp(); let calls = 0; let fail = false;
    const fetch = async (url) => { calls++; if (fail) throw new Error('offline'); return { ok: true, status: 200, text: async () => (url.includes('easylist.txt') ? '[Adblock Plus 2.0]\n! Title: EasyList\n||el-only.com^\n##.el-hide' : '! list\n||other.com^') }; };
    const s = L.createService({ dir, fetch, sites: fakeSites(), now: () => 1000 });
    const v0 = s.start();
    assert.ok(v0.lists.find(l => l.id === 'builtin').loaded && !v0.lists.find(l => l.id === 'easylist').loaded);
    assert.strictEqual(s.match({ url: 'https://ad.doubleclick.net/x', type: 'script', pageUrl: 'https://a.com/' }).block, true, 'built-in blocks at first start');
    assert.deepStrictEqual(s.due().sort(), ['easylist', 'easyprivacy', 'peter-lowe']);
    const u = await s.update('easylist'); assert.ok(u.ok && u.results[0].rules === 2, JSON.stringify(u));
    assert.strictEqual(s.match({ url: 'https://el-only.com/a', type: 'image', pageUrl: 'https://a.com/' }).block, true);
    assert.ok(fs.existsSync(path.join(dir, 'lists', 'easylist.txt')));
    fail = true; const u2 = await s.update('easylist');
    assert.strictEqual(u2.ok, false); assert.strictEqual(u2.results[0].kept, true);
    assert.strictEqual(s.state().lists.find(l => l.id === 'easylist').error, 'offline');
    assert.strictEqual(s.match({ url: 'https://el-only.com/a', type: 'image', pageUrl: 'https://a.com/' }).block, true, 'the last copy still works');
    const s2 = L.createService({ dir, fetch: null, sites: fakeSites() }); s2.start();
    assert.strictEqual(s2.match({ url: 'https://el-only.com/a', type: 'image', pageUrl: 'https://a.com/' }).block, true, 'the cached copy loads offline after a restart');
    const bad = L.createService({ dir: tmp(), fetch: async () => ({ ok: true, text: async () => '<html>login</html>' }) }); bad.start();
    assert.strictEqual((await bad.update('easylist')).results[0].error, 'that is not a filter list');
    s.setList('easylist', false); assert.strictEqual(s.match({ url: 'https://el-only.com/a', type: 'image', pageUrl: 'https://a.com/' }).block, false, 'a list turned off stops blocking');
    const c = s.setCustom('||mine.com^\nfoo.com##+js(x)'); assert.deepStrictEqual([c.rules, c.skipped], [1, 1]);
    assert.strictEqual(s.match({ url: 'https://mine.com/', type: 'script', pageUrl: 'https://a.com/' }).block, true);
    void calls;
  });

  await test('ABK-08', 'allowed sites are site settings; counts per tab; off blocks nothing', () => {
    const sites = fakeSites(); const s = L.createService({ dir: tmp(), sites }); s.start();
    const req = { url: 'https://ad.doubleclick.net/x', type: 'script', pageUrl: 'https://news.com/a', tabId: 7 };
    s.match({ url: 'https://news.com/a', type: 'mainFrame', tabId: 7 });
    s.match(req); s.match(req);
    assert.strictEqual(s.stats(7).count, 2); assert.strictEqual(s.stats(7).last[0].rule, '||doubleclick.net^');
    s.allow('https://news.com/whatever', true);
    assert.strictEqual(sites.get('https://news.com/', 'contentFilter'), 'off', 'the one store Settings edits');
    assert.deepStrictEqual(s.allowed(), ['https://news.com']);
    assert.strictEqual(s.match(req).block, false); assert.strictEqual(s.cosmetics('https://news.com/'), '');
    s.allow('https://news.com/', false); assert.strictEqual(s.match(req).block, true);
    s.match({ url: 'https://news.com/b', type: 'mainFrame', tabId: 7 }); assert.strictEqual(s.stats(7).count, 0, 'a new page starts the count again');
    s.setEnabled(false); assert.strictEqual(s.match(req).block, false); assert.strictEqual(s.cosmetics('https://x.com/'), '');
  });

  await test('ABK-09', 'the plugin: filterRequest asks the service; isBlocked keeps its contract; settings get / set / action', async () => {
    const P = require(CG('plugins/adblocker/index.js'));
    assert.deepStrictEqual(P.isBlocked('https://ad.doubleclick.net/x'), { blocked: true, reason: 'doubleclick.net' });
    assert.deepStrictEqual(P.isBlocked('https://www.facebook.com/tr?id=1'), { blocked: true, reason: 'facebook.com/tr' });
    assert.deepStrictEqual(P.isBlocked('not a url'), { blocked: false, reason: null });
    const sites = fakeSites();
    const fetch = async () => ({ ok: true, text: async () => '[Adblock Plus 2.0]\n||x3p.com^$third-party,script' });
    const svc = L.service({ dir: tmp(), sites, fetch }); svc.start();
    const d = (url, resourceType, pageUrl) => P.filterRequest({ url, requestId: 'r', resourceType, pageUrl, tabId: 3 }).data;
    await svc.update('easylist');
    assert.deepStrictEqual([d('https://cdn.x3p.com/a.js', 'script', 'https://site.com/').block, d('https://cdn.x3p.com/a.js', 'script', 'https://x3p.com/').block, d('https://cdn.x3p.com/a.png', 'image', 'https://site.com/').block], [true, false, false]);
    const page = { url: 'https://site.com/a', tabId: 3 };
    const g = P.settings({ op: 'get', page, requestId: 'q1' });
    assert.strictEqual(g.type, 'plugin:settings'); assert.strictEqual(g.data.requestId, 'q1');
    const keys = g.data.view.fields.map(f => f.key || f.type);
    assert.deepStrictEqual(keys.slice(0, 5), ['enabled', 'site', 'info', 'lists', 'update']);
    assert.strictEqual(g.data.view.summary.value, '1', 'one blocked on this page (tab 3)');
    assert.strictEqual(g.data.view.fields.find(f => f.key === 'lists').items.find(i => i.id === 'easylist').on, true);
    const off = P.settings({ op: 'set', key: 'site', value: false, page, requestId: 'q2' });
    assert.strictEqual(sites.get(page.url, 'contentFilter'), 'off'); assert.strictEqual(off.data.view.fields.find(f => f.key === 'site').value, false);
    assert.strictEqual(off.data.view.fields.find(f => f.key === 'allowed').items[0].id, 'https://site.com');
    P.settings({ op: 'set', key: 'allowed', value: { id: 'https://site.com', remove: true }, page });
    assert.strictEqual(sites.get(page.url, 'contentFilter'), undefined);
    const upd = await P.settings({ op: 'action', key: 'update', page, requestId: 'q3' });
    assert.ok(upd.data.note && upd.data.view.fields.length > 3, JSON.stringify(upd.data.note));
    const sm = P.settings({ op: 'summary', page });
    assert.deepStrictEqual(Object.keys(sm.data.view), ['summary']);
    const mf = JSON.parse(fs.readFileSync(CG('plugins/adblocker/manifest.json'), 'utf8'));
    assert.ok(mf.contributes.settings[0].signature.startsWith(`plugin:${mf.id}:`) && mf.contributes['content-filter'] && mf.settingsSection === 'sites');
  });

  await test('ABK-10', 'the adapter sends type, page and tab; plugins:settings asks the plugin over the bus', async () => {
    const Bus = require(CG('src/core/bus.js')); try { Bus.getBus(); } catch (_) { Bus.createBus(); }
    const bus = Bus.getBus(); const seen = [];
    const off = bus.on('plugin:test:seen', () => {});
    const { attachContentFilters } = require(CG('src/plugins/webrequest-adapter.js'));
    const { gate } = require(CG('src/gates/index.js'));
    bus.register(gate('plugin:test:cf', (ev, stream) => { seen.push(ev.data); stream.emit(new Bus.Event('webrequest:decision', { requestId: ev.data.requestId, block: true })); }));
    let listener = null; const ses = { webRequest: { onBeforeRequest: (fn) => { listener = fn; } } };
    attachContentFilters(ses, bus, { signatures: ['plugin:test:cf'] });
    const verdict = await new Promise(r => listener({ url: 'https://ads.com/x.js', resourceType: 'script', webContentsId: 42, webContents: { id: 42, getURL: () => 'https://page.com/' } }, r));
    assert.deepStrictEqual(verdict, { cancel: true });
    assert.deepStrictEqual([seen[0].resourceType, seen[0].pageUrl, seen[0].tabId], ['script', 'https://page.com/', 42]);
    await new Promise(r => listener({ url: 'https://new.com/', resourceType: 'mainFrame', webContentsId: 42, webContents: { getURL: () => 'https://page.com/' } }, r));
    assert.strictEqual(seen[1].pageUrl, 'https://new.com/', 'a main frame is its own page');
    off();
    // the bridge's _askPlugin: emit the settings signature, resolve with the one plugin:settings answering it
    const { PluginHost } = require(CG('src/plugins/host.js'));
    const host = new PluginHost();
    host.install(require(CG('plugins/adblocker/manifest.json')), require(CG('plugins/adblocker/index.js')));
    const p = host.list().find(x => x.name === 'adblocker');
    assert.ok(p.settings && p.settingsSection === 'sites' && p.permissions.webRequest === true && p.author);
    const src = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8');
    const body = src.slice(src.indexOf('  _askPlugin(signature'), src.indexOf('  async stop('));
    const askFn = eval(`(function(){ const require = (m) => m === '../core/bus.js' ? Bus : null; return function ${body.trim()} })()`);
    const r = await askFn(p.settings, { op: 'get', page: {} }, 'plugin:settings', 2000);
    assert.ok(r.ok && r.view && r.view.fields.length > 3, JSON.stringify(r).slice(0, 200));
    const none = await askFn('plugin:nobody:settings', {}, 'plugin:settings', 100);
    assert.deepStrictEqual(none, { ok: false, error: 'the plugin did not answer' });
    assert.ok(/'settings',\n\]\);/.test(fs.readFileSync(CG('src/plugins/contribution-types.js'), 'utf8')));
  });

  await test('ABK-11', 'surface: the adblock row; rules person-only; the agent tool refuses rules', async () => {
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'adblock');
    const b = (...args) => row.build({ args, flags: {} });
    assert.deepStrictEqual([b().path, b('off').body, b('list', 'ublock', 'on').body, b('update').body, b('allow', 'x.com').body], ['/cli/adblock/status', { on: false }, { id: 'ublock', on: true }, { id: 'all' }, { site: 'x.com', on: true }]);
    assert.ok(row.personOnly({ args: ['rules'] }) && row.personOnly({ args: ['allow'] }) === null);
    const tool = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/adblock.js'));
    assert.strictEqual((await tool.execute({ action: 'rules' })).ok, false);
    const src = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8');
    for (const r of ['status', 'enabled', 'list', 'update', 'allow', 'rules', 'check']) assert.ok(src.includes(`'/cli/adblock/${r}'`), r);
    assert.ok(/b\.person === true \? _ab\(\)\.setCustom/.test(src), 'the route writes rules only for a person');
  });

  await test('ABK-12', 'his own lists: a folder of files, host and domain lists; each its own list; update, a gone original, remove; a URL', async () => {
    const I = require(CG('src/adblock/import.js'));
    assert.deepStrictEqual(['[Adblock Plus 2.0]\n||a^', '0.0.0.0 a.com\n0.0.0.0 b.com', 'a.com\nb.org\n# c\nsub.c.net', '||a.com^\n##.x'].map(I.detectFormat), ['abp', 'hosts', 'domains', 'abp']);
    const p = parseList('a.com\nb.org # note\nnot a host\n||c.net^', { format: 'domains' });
    assert.deepStrictEqual([p.network.map(r => r.raw), p.skipped], [['||a.com^', '||b.org^', '||c.net^'], { 'not-a-host': 1 }]);
    const src = tmp(); const w = (n, t) => { fs.mkdirSync(path.dirname(path.join(src, n)), { recursive: true }); fs.writeFileSync(path.join(src, n), t); };
    w('mine.txt', '[Adblock Plus 2.0]\n||mine.com^\n##.mine-ad'); w('sub/hosts', '0.0.0.0 h1.com\n0.0.0.0 h2.com'); w('doms.list', 'd1.com\nd2.net'); w('logo.png', 'x'); w('a/b/c/deep.txt', '||deep.com^');
    const s = L.createService({ dir: tmp() }); s.start();
    const r = s.importPaths([src]);
    assert.deepStrictEqual(r.lists.map(l => [l.title, l.format, l.rules]).sort(), [['doms.list', 'domains', 2], ['hosts', 'hosts', 2], ['mine.txt', 'abp', 2]]);
    assert.deepStrictEqual(r.skipped.map(x => [path.basename(x.path), x.why]).sort(), [['b', 'deeper than two folders'], ['logo.png', 'not a list file']]);
    const blocked = (u) => s.match({ url: u, type: 'script', pageUrl: 'https://q.com/' }).block;
    assert.deepStrictEqual([blocked('https://cdn.d2.net/x'), blocked('https://h1.com/'), blocked('https://mine.com/')], [true, true, true]);
    assert.ok(s.cosmetics('https://q.com/').includes('.mine-ad'));
    const doms = r.lists.find(l => l.title === 'doms.list');
    fs.writeFileSync(path.join(src, 'doms.list'), 'd1.com\nd2.net\nd3.org'); const u = await s.update(doms.id);
    assert.ok(u.ok && blocked('https://d3.org/'), 'update re-reads the file');
    fs.unlinkSync(path.join(src, 'doms.list')); const u2 = await s.update(doms.id);
    assert.strictEqual(u2.results[0].error, 'the original file is gone; the copy is kept'); assert.ok(blocked('https://d3.org/'), 'the copy still blocks');
    const st = s.state().lists.find(l => l.id === doms.id); assert.ok(st.imported && st.loaded);
    assert.deepStrictEqual(s.removeList(doms.id), { ok: true, removed: doms.id }); assert.strictEqual(blocked('https://d1.com/'), false);
    assert.strictEqual(s.removeList('easylist').ok, false, 'a catalogue list is turned off, not removed');
    const empty = s.importPaths([path.join(src, 'nothing-here')]); assert.deepStrictEqual(empty.skipped, [{ path: path.join(src, 'nothing-here'), why: 'not found' }]);
    const s2 = L.createService({ dir: tmp(), fetch: async () => ({ ok: true, text: async () => '! Title: Mine\n||sub-only.com^' }) }); s2.start();
    const a = await s2.addUrl('https://lists.example/mine.txt'); assert.ok(a.ok && a.rules === 1);
    assert.ok(s2.state().lists.some(l => l.imported && l.url === 'https://lists.example/mine.txt'));
    assert.ok(s2.due().length >= 3 && (await s2.update('all')).results.some(x => x.id === a.id && x.ok), 'updated with the rest');
    assert.strictEqual((await s2.addUrl('ftp://x/y')).ok, false);
  });

  await test('ABK-13', 'the page: Import and Subscribe; imports said; a list removed from its row; the row and tool verbs', async () => {
    const P = require(CG('plugins/adblocker/index.js'));
    const src = tmp(); fs.writeFileSync(path.join(src, 'tor-ads.txt'), 'ads1.com\nads2.com'); fs.writeFileSync(path.join(src, 'pic.png'), 'x');
    const g = P.settings({ op: 'get', page: {} }).data.view;
    const imp = g.fields.find(f => f.key === 'import'), url = g.fields.find(f => f.key === 'url');
    assert.deepStrictEqual([imp.type, imp.accept, url.type], ['import', ['file', 'folder'], 'add']);
    const r = P.settings({ op: 'set', key: 'import', value: { paths: [src] }, page: {} }).data;
    assert.ok(/Added tor-ads\.txt \(2 rules, domains\)/.test(r.note) && /pic\.png \(not a list file\)/.test(r.note), r.note);
    const item = r.view.fields.find(f => f.key === 'lists').items.find(i => i.label === 'tor-ads.txt');
    assert.ok(item.on && item.remove, 'its own switch and ×');
    const gone = P.settings({ op: 'set', key: 'lists', value: { id: item.id, remove: true }, page: {} }).data;
    assert.strictEqual(gone.note, 'List removed'); assert.ok(!gone.view.fields.find(f => f.key === 'lists').items.some(i => i.label === 'tor-ads.txt'));
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js')); const row = SPEC.find(x => x.key === 'adblock');
    assert.deepStrictEqual(row.build({ args: ['import', 'https://x.org/l.txt'], flags: {} }).body, { url: 'https://x.org/l.txt', title: undefined });
    assert.deepStrictEqual(row.build({ args: ['import', '/tmp/lists'], flags: {} }).body, { paths: ['/tmp/lists'] });
    const mf = JSON.parse(fs.readFileSync(CG('plugins/adblocker/manifest.json'), 'utf8')); assert.strictEqual(mf.permissions.hostFs, true, 'it reads files he chooses: said in its permissions');
    const bsrc = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8'); assert.ok(bsrc.includes("'/cli/adblock/import'") && bsrc.includes("ipcMain.handle('plugins:pick'"));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
