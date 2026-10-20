'use strict';
/**
 * tests/modules/test-snowflake.test.js — SF1–SF6 (0.60.178): Snowflake working end to end. Spec: clear-glass/spec/snowflake.spec
 * Map: docs/2026-10-21-snowflake-compartment-phasemap.spec
 * James, 2026-10-21: "can you get snowflake working. connected to the compartment? optional encryption. ... make it look as nromal as it can."
 *
 *   SFW-01  detect(): a saved path, PATH (snowflake-client | snowflake | lyrebird) or a Tor Browser install, each said; status() carries
 *           bridgeLine 'set' (never the line) and httpsOnly (on by default)
 *   SFW-02  bridge sources: a Tor Browser tree, the installed bundle and the package example torrc give their lines in that order,
 *           deduplicated, each with where it was read; Tor Browser's programs found; nothing found → []
 *   SFW-03  the Tor Project's builtin list only through builtin(); a line never invented; service find/use picks only shown lines
 *   SFW-04  HTTPS-only: http frames upgraded, http subresources cancelled, local and https untouched; it survives the content-filter
 *           listener replacing its own (the adapter runs it first)
 *   SFW-05  the compartment: in-memory partition, clean Chromium UA, WebRTC policy only on its own contents, cleared on dispose; main
 *           gives the page that partition and forces it at attach; the webview accepts it
 *   SFW-06  circuit check: refused while the transport is down; IsTor and IP read; a failure kept and said
 *   SFW-07  the UI reads the fields the backend sends (his screenshot's root cause); command and agent scopes for the new verbs
 *   SFW-08  the real Settings → Network page in Clear Glass's engine (glass.js) against a stub :7702: the status card, then paths with sources, Find → Use, switch
 *   SFW-09  0.60.180 the bridge set up automatically (his "need to have the bridge setup automatically"): kept / local / Tor Project / refused with what was tried
 * No Electron, tor or network here: Electron objects are fakes; the live path is checked on his machine with the Clear Glass driver.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const { TransportHost } = require(CG('src/net/transport-host.js'));
const { NetService } = require(CG('src/net/service.js'));
const BS = require(CG('src/net/bridge-sources.js'));
const HO = require(CG('src/net/https-only.js'));
const CP = require(CG('src/net/compartment.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const put = (root, p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
const LINE_A = 'snowflake 192.0.2.3:80 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=2B28 url=https://snowflake-broker.example/ fronts=a.example ice=stun:stun.example:3478 utls-imitate=hellorandomizedalpn';
const LINE_B = 'snowflake 192.0.2.4:80 8838024498816A039FCBBAB14E6F40A0843051FA fingerprint=8838 url=https://snowflake-broker.example/ fronts=b.example';
const store = (v = null) => { let x = v; return { get: () => x, set: (n) => { x = n; } }; };
const fakeSes = () => {
  const s = { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) clear-glass/0.60.178 Chrome/140.0.0.0 Electron/42.11.6 Safari/537.36',
    listeners: [], cleared: 0 };
  s.getUserAgent = () => s.ua; s.setUserAgent = (u) => { s.ua = u; };
  s.webRequest = { onBeforeRequest: (fn) => { s.listeners = [fn]; } };   // Electron: one listener; a second replaces the first
  s.clearStorageData = async () => { s.cleared++; }; s.clearCache = async () => {};
  return s;
};
const run = (ses, details) => new Promise(ok => ses.listeners[0](details, ok));

console.log('\ntest-snowflake — Snowflake end to end: detect, bridge lines, the compartment, HTTPS-only, the circuit');

(async () => {
  await test('SFW-01', 'detect says where each program came from; status carries bridgeLine "set" and httpsOnly', () => {
    const which = (n) => (n === 'lyrebird' ? '/usr/bin/lyrebird' : null);
    const h1 = new TransportHost({ which, locate: () => ({ tor: '/tb/Tor/tor', snowflake: '/tb/PT/lyrebird' }), config: {} });
    const d1 = h1.detect();
    assert.deepStrictEqual([d1.tor, d1.torFrom, d1.snowflake, d1.snowflakeFrom, d1.bridgeLine], ['/tb/Tor/tor', 'tor-browser', '/usr/bin/lyrebird', 'path', null]);
    assert.ok(d1.missing.some(m => /bridge line/.test(m)) && d1.missing.length === 1, d1.missing.join());
    const h2 = new TransportHost({ which: () => '/usr/bin/x', locate: () => { throw new Error('should not be asked'); }, config: { torPath: '/opt/tor', bridgeLine: LINE_A }, log: () => {} });
    const d2 = h2.detect();
    assert.deepStrictEqual([d2.torFrom, d2.snowflakeFrom, d2.bridgeLine, d2.missing.length], ['set', 'path', 'set', 0]);
    const svc = new NetService({ store: store({ bridgeLine: LINE_A }) });
    const st = svc.status();
    assert.strictEqual(st.bridgeLine, 'set'); assert.strictEqual(st.httpsOnly, true); assert.ok(!JSON.stringify(st).includes('2B280B23'), 'the line never leaves');
  });

  await test('SFW-02', 'bridge sources: Tor Browser, bundle, package example — in order, deduplicated, each with its path', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sfw-'));
    const tb = 'tor-browser/Browser/TorBrowser/Tor';
    put(home, `${tb}/tor`, 'bin'); put(home, `${tb}/PluggableTransports/lyrebird`, 'bin');
    put(home, `${tb}/PluggableTransports/pt_config.json`, JSON.stringify({ pluggableTransports: { lyrebird: 'ClientTransportPlugin meek_lite,obfs4,snowflake exec ${pt_path}lyrebird' }, bridges: { snowflake: [LINE_A] } }));
    put(home, 'bundle/tor/pluggable_transports/pt_config.json', JSON.stringify({ bridges: { snowflake: [LINE_A, LINE_B] } }));
    put(home, 'example/torrc', `UseBridges 1\n# Bridge snowflake 192.0.2.9:80 COMMENTED\nBridge ${LINE_B}\nBridge obfs4 1.2.3.4:5 X\n`);
    const r = BS.local({ fs, platform: 'linux', home, env: {}, bundleDir: path.join(home, 'bundle'), examples: [path.join(home, 'example/torrc')] });
    assert.deepStrictEqual(r.lines.map(c => [c.source, c.line]), [['tor-browser', LINE_A], ['bundle', LINE_B]], JSON.stringify(r.lines));
    assert.ok(r.lines.every(c => c.path && fs.existsSync(c.path)), 'each line names the file it was read from');
    assert.strictEqual(r.torBrowser.tor, path.join(home, `${tb}/tor`)); assert.strictEqual(r.torBrowser.snowflake, path.join(home, `${tb}/PluggableTransports/lyrebird`));
    assert.deepStrictEqual(BS.linesFromTorrc(fs.readFileSync(path.join(home, 'example/torrc'), 'utf8')), [LINE_B]);
    const empty = BS.local({ fs, platform: 'linux', home: fs.mkdtempSync(path.join(os.tmpdir(), 'sfw-')), env: {}, examples: [] });
    assert.deepStrictEqual([empty.lines, empty.torBrowser], [[], null]);
    assert.ok(BS.torBrowserDirs({ platform: 'win32', home: 'C:\\Users\\j', env: { LOCALAPPDATA: 'C:\\L' } }).length >= 3);
    assert.ok(BS.torBrowserDirs({ platform: 'darwin', home: '/Users/j' })[0].endsWith('Tor Browser.app'));
  });

  await test('SFW-03', 'builtin only when asked; nothing invented; use <n> picks only from what was shown', async () => {
    const ok = await BS.builtin({ fetch: async (u, o) => ({ ok: o.method === 'POST', status: 200, text: async () => JSON.stringify({ obfs4: ['obfs4 1.2.3.4:5 X'], snowflake: [LINE_A] }) }) });
    assert.deepStrictEqual(ok.lines.map(c => [c.source, c.line, c.path]), [['tor-project-builtin', LINE_A, BS.MOAT_BUILTIN]]);
    const get = await BS.builtin({ fetch: async (u, o) => ({ ok: o.method === 'GET', status: o.method === 'GET' ? 200 : 405, text: async () => JSON.stringify({ snowflake: [LINE_B] }) }) });
    assert.strictEqual(get.lines[0].line, LINE_B, 'a server refusing POST is asked once with GET');
    assert.ok(/no Snowflake line/.test((await BS.builtin({ fetch: async () => ({ ok: true, status: 200, text: async () => '{"obfs4":[]}' }) })).error));
    assert.ok(/did not answer/.test((await BS.builtin({ fetch: async () => { throw new Error('blocked'); } })).error));
    const svc = new NetService({ store: store() });
    assert.ok(!svc.useBridge(1).ok, 'nothing shown yet');
    const f = svc.findBridges({ local: () => ({ lines: [{ line: LINE_A, source: 'tor-browser', path: '/x/pt_config.json' }], torBrowser: null }) });
    assert.strictEqual(f.lines[0].n, 1);
    await svc.builtinBridges({ builtin: async () => ({ ok: true, lines: [{ line: LINE_A, source: 'tor-project-builtin', path: 'u' }, { line: LINE_B, source: 'tor-project-builtin', path: 'u' }] }) });
    assert.strictEqual(svc.useBridge(2).source, 'tor-project-builtin');
    assert.strictEqual(svc.policy().bridgeLine, LINE_B);
    const src = fs.readFileSync(CG('src/net/transport-host.js'), 'utf8') + fs.readFileSync(CG('src/net/service.js'), 'utf8');
    assert.ok(!/snowflake\s+\d+\.\d+\.\d+\.\d+:\d+/.test(src), 'no bridge line carried in code');
    assert.ok(!/builtin/.test(fs.readFileSync(CG('src/net/transport-host.js'), 'utf8')), 'detect/start never ask the Tor Project');
  });

  await test('SFW-04', 'HTTPS-only: upgrade frames, cancel http parts, local and https untouched; composes with content filters', async () => {
    assert.deepStrictEqual(HO.decide({ url: 'http://example.com:80/a?b', resourceType: 'mainFrame' }), { action: 'upgrade', redirectURL: 'https://example.com/a?b' });
    assert.deepStrictEqual(HO.decide({ url: 'ws://example.com/s', resourceType: 'webSocket' }), { action: 'upgrade', redirectURL: 'wss://example.com/s' });
    assert.strictEqual(HO.decide({ url: 'http://cdn.example/x.png', resourceType: 'image' }).action, 'cancel');
    for (const u of ['https://example.com/', 'http://127.0.0.1:7702/cli/net/status', 'http://localhost:3000/', 'data:text/plain,x', 'file:///x/browser.html'])
      assert.strictEqual(HO.decide({ url: u, resourceType: 'mainFrame' }).action, 'allow', u);
    let on = true; const ses = fakeSes();
    HO.attach(ses, () => on);
    assert.deepStrictEqual(await run(ses, { url: 'http://a.example/', resourceType: 'mainFrame' }), { redirectURL: 'https://a.example/' });
    on = false; assert.deepStrictEqual(await run(ses, { url: 'http://a.example/', resourceType: 'mainFrame' }), {}, 'his switch off: untouched');
    on = true;
    const { attachContentFilters } = require(CG('src/plugins/webrequest-adapter.js'));
    const bus = { on: () => () => {}, emit: () => {} };
    attachContentFilters(ses, bus, { signatures: ['sig'], timeoutMs: 20 });   // replaces the listener, as Electron would
    assert.deepStrictEqual(await run(ses, { url: 'http://cdn.example/x.js', resourceType: 'script' }), { cancel: true }, 'the gate runs first');
    assert.deepStrictEqual(await run(ses, { url: 'https://cdn.example/x.js', resourceType: 'script' }), { cancel: false }, 'then the filters (timed out open here)');
  });

  await test('SFW-05', 'the compartment: in memory, ordinary Chromium, WebRTC on the proxy, cleared; page and shell share it', async () => {
    const p = CP.partitionFor('snow-1b2/../x');
    assert.ok(p.startsWith('cg-snow-') && !p.includes('persist:') && !p.includes('/') && CP.isPartition(p));
    const ses = fakeSes();
    CP.harden(ses, { httpsOnly: () => true, log: () => {} });
    assert.strictEqual(ses.ua, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
    assert.ok(CP.isCompartment(ses) && typeof ses.__cgPreRequest === 'function');
    const mk = (s) => ({ session: s, policy: null, setWebRTCIPHandlingPolicy(v) { this.policy = v; } });
    const inside = mk(ses), outside = mk(fakeSes());
    assert.strictEqual(CP.onContents(inside), true); assert.strictEqual(inside.policy, 'disable_non_proxied_udp');
    assert.strictEqual(CP.onContents(outside), false); assert.strictEqual(outside.policy, null, 'other windows untouched');
    await CP.dispose(ses); assert.strictEqual(ses.cleared, 1);
    const main = fs.readFileSync(CG('src/main/index.js'), 'utf8');
    assert.ok(/wvPartition: partition, via/.test(main), 'the page is given the compartment partition');
    assert.ok(/will-attach-webview[^\n]+webPreferences\.partition = partition/.test(main), 'and it is forced at attach, not trusted to the renderer');
    assert.ok(/onContents\(contents\)/.test(main) && /ctxMgr\.destroy\(agentId\)/.test(main));
    const br = fs.readFileSync(CG('renderer/browser.js'), 'utf8');
    assert.ok(br.includes('/^cg-snow-[\\w-]{1,64}$/.test(wvPartition)'), 'the webview accepts the compartment partition');
    const mgr = fs.readFileSync(CG('src/contexts/manager.js'), 'utf8');
    assert.ok(/if \(ctx\.compartment\) \{[^}]*unregister/.test(mgr) && /ctx\.compartment\) return \{ agentId, mode: 'chromium'/.test(mgr), 'no vault snapshot, no persona switch');
  });

  await test('SFW-06', 'circuit check: refused while down; IsTor and IP read; failures kept', async () => {
    const svc = new NetService({ store: store(), host: { status: () => ({ state: 'stopped' }), on() {} } });
    assert.ok(/start the transport first/.test((await svc.checkCircuit({ fetchVia: async () => '{}' })).error));
    const up = new NetService({ store: store(), host: { status: () => ({ state: 'ready', socksPort: 9150 }), on() {} } });
    let asked = null;
    const r = await up.checkCircuit({ fetchVia: async (u, port) => { asked = [u, port]; return '{"IsTor":true,"IP":"198.51.100.7"}'; } });
    assert.deepStrictEqual([r.ok, r.isTor, r.ip, asked], [true, true, '198.51.100.7', ['https://check.torproject.org/api/ip', 9150]]);
    assert.strictEqual(up.status().lastCheck.isTor, true);
    const bad = await up.checkCircuit({ fetchVia: async () => '<html>' });
    assert.ok(!bad.ok && /JSON/.test(bad.error) && up.status().lastCheck === bad);
  });

  await test('SFW-07', 'the UI reads what the backend sends; new verbs scoped (reads open, changes his)', async () => {
    const ui = fs.readFileSync(CG('renderer/settings/sections/network.js'), 'utf8');
    assert.ok(!/det\.torPath|det\.snowflakePath|\bt\.bridgeLine/.test(ui), 'no field the backend does not send');
    for (const f of ['det.tor', 'det.snowflake', 'det.torFrom', 'det.snowflakeFrom', 'det.bridgeLine', 's.httpsOnly', 's.lastCheck'])
      assert.ok(ui.includes(f), f);
    for (const r of ['/cli/net/bridge/find', '/cli/net/bridge/builtin', '/cli/net/bridge/use', '/cli/net/https-only', '/cli/net/check']) {
      assert.ok(ui.includes(r), `UI ${r}`); assert.ok(fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8').includes(`'${r}'`), `route ${r}`);
    }
    const { SPEC } = await import(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'net'); const A = (args) => ({ args, flags: {} });
    for (const v of ['bridges', 'check']) assert.strictEqual(row.personOnly(A([v])), null, v);
    for (const v of ['use', 'https-only', 'builtin']) assert.ok(row.personOnly(A([v, '1'])), v);
    assert.deepStrictEqual(row.req(A(['https-only', 'off'])).body, { on: false });
    assert.strictEqual(row.req(A(['bridges'])).path, '/cli/net/bridge/find');
    const tool = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/net.js'));
    assert.ok(/person's act/.test((await tool.execute({ action: 'use' })).error));
    assert.ok(tool.parameters.properties.action.enum.includes('check'));
  });

  await test('SFW-09', 'the bridge set up automatically: a set line kept; else a local line; else the Tor Project; nothing invented', async () => {
    const L = (src) => ({ line: LINE_A, source: src, path: `/x/${src}` });
    const a = new NetService({ store: store({ bridgeLine: LINE_B, bridgeSource: { kind: 'hand' } }) });
    let asked = 0;
    assert.deepStrictEqual(await a.ensureBridge({ local: () => ({ lines: [L('tor-browser')] }), builtin: async () => { asked++; return { ok: true, lines: [L('tor-project-builtin')] }; } }), { ok: true, kept: true, source: 'hand' });
    assert.strictEqual(a.policy().bridgeLine, LINE_B, 'a hand-set line is never replaced'); assert.strictEqual(asked, 0);
    const b = new NetService({ store: store() });
    const rb = await b.ensureBridge({ local: () => ({ lines: [L('tor-browser')] }), builtin: async () => { asked++; return { ok: false }; } });
    assert.deepStrictEqual([rb.ok, rb.source, b.policy().bridgeLine, b.status().bridgeSource.kind, b.status().bridgeSource.auto, asked], [true, 'tor-browser', LINE_A, 'tor-browser', true, 0]);
    const c = new NetService({ store: store() });
    const rc = await c.ensureBridge({ local: () => ({ lines: [] }), builtin: async () => ({ ok: true, lines: [L('tor-project-builtin')] }) });
    assert.deepStrictEqual([rc.ok, rc.source], [true, 'tor-project-builtin']);
    const d = new NetService({ store: store() });
    const rd = await d.ensureBridge({ local: () => ({ lines: [] }), builtin: async () => ({ ok: false, error: 'blocked' }) });
    assert.ok(!rd.ok && /no line on this machine/.test(rd.error) && /blocked/.test(rd.error) && d.policy().bridgeLine == null, rd.error);
    const br = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8');
    assert.ok(/action === 'start'\) \{ const eb = await _ensureBridge\(\)/.test(br) && /const eb = await _ensureBridge\(\); if \(!eb\.ok\) return \{ ok: false, error: eb\.error \}; const r = await host\.start\(\)/.test(br), 'every start path sets the bridge up first');
  });

  // ── SFW-08 the real Settings → Network page, in Clear Glass's engine (never Playwright), against a stub :7702 bridge ──
  await (async () => {
    const glass = require(CG('src/driver/glass.js'));
    const eng = glass.engine();
    if (!eng) { console.log('  - SFW-08 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the page did not run'); return; }
    const http = require('http'); const asked = [];
    const answers = {
      'GET /cli/net/status': { ok: true, default: 'direct', rules: 0, transport: { state: 'stopped' }, bridgeLine: null, httpsOnly: true, lastCheck: null,
        detect: { tor: '/usr/bin/tor', snowflake: '/home/j/tor-browser/Browser/TorBrowser/Tor/PluggableTransports/lyrebird', torFrom: 'path', snowflakeFrom: 'tor-browser', bridgeLine: null, missing: ['a Snowflake bridge line'] } },
      'GET /cli/net/routes': { ok: true, default: 'direct', rules: [] },
      'GET /cli/net/setup/status': { ok: true, phase: 'idle', pct: 0, message: '', running: false },
      'GET /cli/net/bridge/find': { ok: true, lines: [{ n: 1, line: LINE_A, source: 'tor-browser', path: '/home/j/tor-browser/pt_config.json' }], torBrowser: null },
      'POST /cli/net/bridge/use': { ok: true, source: 'tor-browser' },
      'POST /cli/net/https-only': { ok: true, httpsOnly: false },
    };
    const srv = http.createServer((req, res) => {
      const key = `${req.method} ${req.url.split('?')[0]}`; asked.push(key);
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(answers[key] || { ok: true }));
    });
    const up = await new Promise(ok => { srv.once('error', () => ok(false)); srv.listen(7702, '127.0.0.1', () => ok(true)); });
    if (!up) { console.log('  - SFW-08 SKIPPED: port 7702 is in use here (a real Clear Glass bridge?) — the page did not run against the stub'); return; }
    let browser;
    try { browser = await glass.chromium.launch(); }
    catch (e) { srv.close(); console.log(`  - SFW-08 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); return; }
    console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
    try {
      await test('SFW-08', 'Settings → Network in Clear Glass: the status card first; under Advanced the real program paths and sources, Find → Use; HTTPS-only switch', async () => {
        const page = await browser.newPage(); const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { const fn = () => Promise.resolve({}); window.ClearGlass = new Proxy({}, { get: () => new Proxy(fn, { get: () => fn }) }); });
        await page.goto(require('url').pathToFileURL(CG('renderer/settings.html')).href + '#network');
        await page.waitForSelector('.net-hero', { timeout: 15000 });
        // SF7 (0.60.180): one status card first; the programs and bridge line live under Advanced (closed when the programs are found)
        const heroTxt = await page.innerText('.net-hero');
        assert.ok(/Off/.test(heroTxt) && /set up automatically when you start/.test(heroTxt) && /Start/.test(heroTxt), heroTxt);
        await page.click('.net-advanced > summary'); await page.waitForTimeout(150);
        const body = await page.evaluate(() => document.body.innerText);
        assert.ok(body.includes('/usr/bin/tor (on PATH)'), 'tor path and where it came from');
        assert.ok(/lyrebird \(from Tor Browser\)/.test(body), 'the Snowflake client from Tor Browser');
        assert.ok(!body.includes('Not detected on PATH') && !body.includes('Not found on PATH'), 'the screenshot\'s contradiction is gone');
        assert.ok(body.includes('HTTPS only') && body.includes('Ask the Tor Project'));
        await page.click('button:has-text("Find bridge line")');
        await page.waitForSelector('.net-found button:has-text("Use")', { timeout: 10000 });
        assert.ok((await page.evaluate(() => document.querySelector('.net-found').innerText)).includes('Tor Browser'));
        await page.click('.net-found button:has-text("Use")');
        await page.waitForTimeout(400);
        assert.ok(asked.includes('POST /cli/net/bridge/use'), asked.join(', '));
        assert.ok(!asked.includes('POST /cli/net/bridge/builtin'), 'the Tor Project is never asked by itself');
        assert.deepStrictEqual(errors, []);
        await page.close();
      });
    } finally { await browser.close().catch(() => {}); srv.close(); }
  })();

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
