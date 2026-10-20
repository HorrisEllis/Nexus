'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cg-network-ui.test.js — 0.60.160
 * James, 2026-10-18: "can you add snowflake to the ui. it doesn't show up as a plugin."
 *
 * Settings → Network, for real: the page's own files (renderer/settings/core.js + sections/network.js) run in jsdom, and every
 * /cli/net/* call goes through the real src/net/service.js — the same service the bridge and CLI use. No Playwright (CG-001b):
 * the page is driven here, the service is real. The transport host is injected (no tor/snowflake binaries in CI), so start/stop
 * and detect are exercised without a real Tor.
 *
 *   NW-01  the section renders: Tor·Snowflake state, what-it-needs, routing — no page errors, nothing "undefined"
 *   NW-02  a Snowflake bridge line is set through the form (a non-snowflake line is refused by the real service, and said)
 *   NW-03  start is refused until the binaries are found and a bridge is set; once both, it starts; stop stops — through the real service
 *   NW-04  a route rule and the default posture are set and removed through the real service, and the UI shows them
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));
const { NetService } = require(path.join(ROOT, 'clear-glass/src/net/service.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

// a fake transport host, shaped like the real one: the service writes config to host.d.config (NetService._save), and the
// host's own state is driven here. No real tor. _bins() is the only thing a real host would learn from disk (the two programs).
function fakeHost() {
  let state = 'stopped', bins = { tor: false, snowflake: false };
  const h = {
    d: { config: {} },
    _bins: (t, s) => { bins = { tor: t, snowflake: s }; },
    configure: (c) => { h.d.config = { ...h.d.config, ...(c || {}) }; },
    detect: () => ({ tor: bins.tor, snowflake: bins.snowflake, torPath: h.d.config.torPath || null, snowflakePath: h.d.config.snowflakePath || null }),
    status: () => ({ state, progress: state === 'ready' ? 100 : 0, socksPort: state === 'ready' ? 9777 : null, bridgeLine: h.d.config.bridgeLine || null }),
    start: () => { if (!bins.tor || !bins.snowflake) return { ok: false, error: 'tor or snowflake not found' }; if (!h.d.config.bridgeLine) return { ok: false, error: 'no bridge line' }; state = 'ready'; return { ok: true, state }; },
    stop: () => { state = 'stopped'; return { ok: true, state }; },
    on: () => {}, _set: (s) => { state = s; },
  };
  return h;
}

let _policy = null;
const store = { get: () => _policy, set: (p) => { _policy = p; } };
const host = fakeHost();
const svc = new NetService({ host, store, log: () => {} });

const dom = new JSDOM('<!doctype html><html><head></head><body><nav id="rail"></nav><main id="main"></main><div id="toasts"></div><div id="scrim"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.ClearGlass = { window: { list: async () => ({ windows: [] }), closeSettings: () => {} }, bgTabs: { list: async () => [] } };
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = () => undefined;
w.navigator.clipboard = { writeText: async () => {} };
w.fetch = async (url, opts = {}) => {
  const u = new URL(url); const method = opts.method || 'GET'; const body = opts.body ? JSON.parse(opts.body) : {};
  let out, status = 200;
  try {
    if (u.pathname === '/cli/net/status') out = { ...svc.status(), detect: host.detect() };
    else if (u.pathname === '/cli/net/routes' && method === 'GET') out = svc.routes();
    else if (u.pathname === '/cli/net/routes') out = svc.addRoute(body);
    else if (u.pathname === '/cli/net/routes/rm') out = svc.removeRoute(body.id);
    else if (u.pathname === '/cli/net/default') out = svc.setDefault(body.via);
    else if (u.pathname === '/cli/net/bridge') out = svc.setBridge(body.line);
    else if (u.pathname === '/cli/net/paths') out = svc.setPaths({ torPath: body.torPath, snowflakePath: body.snowflakePath });
    else if (u.pathname === '/cli/net/transport') out = body.action === 'start' ? host.start() : body.action === 'stop' ? host.stop() : { ok: true, ...host.detect() };
    else { status = 404; out = { ok: false, error: 'not found' }; }
  } catch (e) { status = 500; out = { ok: false, error: e.message }; }
  if (out && out.ok === false) status = 400;
  return { ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(out)) };
};

for (const f of ['clear-glass/renderer/settings/core.js', 'clear-glass/renderer/settings/sections/network.js']) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
w.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.stack || e.reason)));
const $ = (sel, root = w.document) => root.querySelector(sel);
const $$ = (sel, root = w.document) => [...root.querySelectorAll(sel)];
const byText = (t, sel = 'button', root = w.document) => $$(sel, root).find(b => b.textContent.trim() === t);
async function render() { await w.CGS.show('network'); for (let i = 0; i < 40 && $('#main .loading'); i++) await tick(); await tick(); }
const toasts = () => $$('#toasts .toast').map(t => t.textContent);

(async () => {
  await test('NW-01', 'the section renders: state, what-it-needs, routing — no errors, no "undefined"', async () => {
    await render();
    const text = $('#main').textContent;
    assert.ok(/Tor . Snowflake/.test(text) || /Snowflake/.test(text), 'the transport pane');
    assert.ok(/What it needs/.test(text) && /Routing/.test(text), text.slice(0, 200));
    assert.ok(/tor missing/.test(text) && /snowflake missing/.test(text), 'the two binaries, not found yet');
    assert.ok(!/undefined|\[object Object\]/.test(text), text.slice(0, 300));
    assert.ok(byText('Start') || byText('Stop'), 'a start/stop control');
    assert.deepStrictEqual(errors, []);
  });

  await test('NW-02', 'a bridge line is set through the form; a non-snowflake line is refused by the real service', async () => {
    await render();
    const input = $$('#main .net-bridge input')[0]; assert.ok(input, 'the bridge field');
    input.value = 'obfs4 1.2.3.4:443 CERT=x'; byText('Set bridge').click(); await tick(60);
    assert.ok(toasts().some(t => /not a Snowflake bridge line/i.test(t)) || svc.policy().bridgeLine == null, 'a non-snowflake line did not stick');
    input.value = 'snowflake 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=x url=https://x fronts=y ice=stun:stun.l.google.com:19302'; byText('Set bridge').click(); await tick(60);
    assert.ok(svc.policy().bridgeLine && /^snowflake/.test(svc.policy().bridgeLine), 'the real service stored the snowflake line');
  });

  await test('NW-03', 'start is refused until binaries + bridge; then it starts; stop stops — through the real host', async () => {
    host._set('stopped'); await render();
    byText('Start').click(); await tick(60);
    assert.notStrictEqual(host.status().state, 'ready', 'no binaries: did not start');
    host._bins(true, true); await render();
    byText('Start').click(); await tick(60);
    assert.strictEqual(host.status().state, 'ready', 'binaries + bridge: started');
    await render();
    assert.ok(byText('Stop'), 'now a Stop control'); byText('Stop').click(); await tick(60);
    assert.strictEqual(host.status().state, 'stopped');
    assert.deepStrictEqual(errors, []);
  });

  await test('NW-04', 'the default posture and a route rule go through the real service and show in the UI', async () => {
    await render();
    const sel = $$('#main select').find(x => [...x.options].some(o => o.value === 'direct')); assert.ok(sel, 'the default select');   // 0.60.179: the On-disconnect select now comes first
    sel.value = 'block'; sel.dispatchEvent(new w.Event('change')); await tick(60);
    assert.strictEqual(svc.routes().default, 'block', 'the real service took the default');
    const r = svc.addRoute({ id: 'ex-test', match: { urlPattern: 'https://example.test/*' }, via: 'transport' });
    assert.ok(r.ok, r.error); await render();
    const text = $('#main').textContent;
    assert.ok(/example\.test/.test(text) && /transport/.test(text), 'the rule shows');
    const rm = $$('#main .net-rules button').find(b => b.textContent.trim() === 'Remove'); assert.ok(rm, 'a remove button');
    rm.click(); await tick(60);
    assert.strictEqual(svc.routes().rules.length, 0, 'removed through the service');
    assert.deepStrictEqual(errors, []);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
