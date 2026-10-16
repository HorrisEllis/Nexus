'use strict';
// 2026-10-16 — James (a Clear Glass popup, Google: "Couldn't sign you in — This browser or app may not be secure"): "need this
// fixed. completely" · then: "for the google login, can you do everything you can to prevent that? like across domains,
// contexts, erosmanceros, proxy,". Every layer that can give Clear Glass away on Google's sign-in, checked:
//   domains   which hosts; a sign-in iframe on another site left as its page is; a current Firefox, never an outdated one
//   request   Firefox UA, no Sec-CH-UA*; hooks compose (one onBeforeSendHeaders per session)
//   page      Firefox UA while on sign-in, own UA back after; the preload (no debugger) makes the page read as Firefox
//   contexts  Firefox-persona profiles: current versions, no "Windows NT 11.0", stale stored ones refreshed, no client hints
//   proxy     the PAC never sends sign-in through Tor or a collision blackhole; the TLS proxy raw-tunnels sign-in hosts
//   readers   the semantic-tree reader attaches no debugger on a sign-in page
// (ErosmancerOS's part: erosmancer/erosmancer-os/tests/google-signin.test.ts.) Fakes only: Electron and Google cannot run here.
const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const GS = require('../src/contexts/google-signin.js');
const FFV = require('../src/fingerprint/firefox-version.js');
const { requestHook, applyCspBypass } = require('../src/contexts/session-headers.js');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const FF = GS.firefoxUA();
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function fakeSession() {
  const s = { listener: null, preloads: [], webRequest: { onBeforeSendHeaders: (fn) => { s.listener = fn; s.registrations = (s.registrations || 0) + 1; }, onHeadersReceived: () => {} },
    registerPreloadScript: (p) => { s.preloads.push(p); } };
  s.send = (details) => new Promise(r => s.listener(details, (res) => r(res)));
  return s;
}

(async () => {
  // ── domains ──
  for (const u of ['https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn', 'https://accounts.google.co.uk/ServiceLogin', 'https://accounts.youtube.com/accounts/SetSID', 'https://gds.google.com/web/chip'])
    ok(GS.isSignin(u), `sign-in host: ${u}`);
  for (const u of ['https://gemini.google.com/app', 'https://chatgpt.com/auth/login', 'https://accounts.google.com.evil.example/', 'https://www.google.com/', 'not a url'])
    ok(!GS.isSignin(u), `not a sign-in host: ${u}`);
  ok(FFV.versionNow(Date.UTC(2025, 5, 24)) === 140 && FFV.versionNow(Date.UTC(2026, 9, 16)) >= 150, 'the Firefox version follows Mozilla\'s calendar (140 on 2025-06-24; 150+ by Oct 2026)');
  ok(FFV.versionNow(Date.UTC(2020, 0, 1)) === 140, 'never below the anchor');
  ok(/Firefox\/\d+/.test(FF) && !/Chrome|Electron/.test(FF) && FFV.versionOf(FF) === FFV.versionNow(), 'the sign-in UA is a current Firefox, nothing else');
  ok(/Windows NT 10\.0/.test(FFV.ua('win32')) && /Macintosh/.test(FFV.ua('darwin')) && /X11; Linux/.test(FFV.ua('linux')), 'one UA per OS, as Firefox writes it (Windows 11 reports NT 10.0)');
  ok(FFV.stale('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0') && FFV.stale(FFV.ua('win32').replace('NT 10.0', 'NT 11.0')) && !FFV.stale(FF), 'an outdated Firefox, or NT 11.0, is stale; the current one is not');

  // ── the request side, pure ──
  const H = { 'User-Agent': CHROME, 'sec-ch-ua': '"Chromium";v="142", "Not_A Brand";v="24"', 'sec-ch-ua-mobile': '?0', 'Sec-CH-UA-Platform': '"Windows"', Accept: 'text/html', Cookie: 'NID=1' };
  const out = GS.rewriteHeaders({ url: 'https://accounts.google.com/v3/signin/identifier', resourceType: 'mainFrame' }, H);
  ok(out['User-Agent'] === FF, 'the sign-in navigation says Firefox');
  ok(!Object.keys(out).some(k => /^sec-ch-ua/i.test(k)), 'every Sec-CH-UA header is gone (Firefox sends none)');
  ok(out.Accept === 'text/html' && out.Cookie === 'NID=1', 'everything else is sent as it was (cookies untouched)');
  ok(GS.rewriteHeaders({ url: 'https://chatgpt.com/backend-api/me', resourceType: 'xhr' }, H) === null, 'another site: untouched');
  ok(GS.rewriteHeaders({ url: 'https://accounts.google.com/gsi/iframe/select', resourceType: 'subFrame', webContentsId: 3 }, H) === null,
    'a Google sign-in iframe on another site is left as its page is (never Firefox headers with Chrome JS)');
  ok(GS.rewriteHeaders({ url: 'https://ssl.gstatic.com/accounts/ui/x.js', resourceType: 'script', webContentsId: 7 }, H, { inSignin: (id) => id === 7 })['User-Agent'] === FF,
    'a sub-request of a page in sign-in mode (gstatic) says the same as the page');
  const persona = FFV.ua('linux');
  ok(GS.rewriteHeaders({ url: 'https://accounts.google.com/', resourceType: 'mainFrame' }, { ...H, 'User-Agent': persona })['User-Agent'] === persona, 'a context already presenting a current Firefox keeps its own (one Firefox, not two)');
  ok(GS.rewriteHeaders({ url: 'https://accounts.google.com/', resourceType: 'mainFrame' }, { ...H, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0' })['User-Agent'] === FF, 'an outdated Firefox is replaced by a current one');

  // ── requestHook: one listener per session, hooks composed in order; the sign-in hook last; the preload registered ──
  const ses = fakeSession();
  applyCspBypass(ses);
  requestHook(ses, 'fingerprint-profile', (d, h) => ({ ...h, 'User-Agent': CHROME, 'X-Profile': '1' }));
  GS.applySession(ses); GS.applySession(ses);   // idempotent
  ok(ses.registrations === 1, `one onBeforeSendHeaders on the session (was one per caller, the later replacing the earlier): ${ses.registrations}`);
  ok(ses.preloads.length === 1 && ses.preloads[0].filePath === GS.PRELOAD && fs.existsSync(GS.PRELOAD), 'the sign-in preload is registered once on the session');
  const local = await ses.send({ url: 'http://127.0.0.1:7702/x', requestHeaders: { 'User-Agent': CHROME } });
  ok(local.requestHeaders['Access-Control-Request-Private-Network'] === 'true' && local.requestHeaders['X-Profile'] === '1', 'the localhost header and the profile hook both apply (the profile used to wipe the localhost one)');
  const g = await ses.send({ url: 'https://accounts.google.com/ServiceLogin', resourceType: 'mainFrame', requestHeaders: H });
  ok(g.requestHeaders['User-Agent'] === FF && g.requestHeaders['X-Profile'] === '1', 'on the sign-in host the sign-in hook runs last: Firefox wins');
  requestHook(ses, 'broken', () => { throw new Error('boom'); }, { order: 50 });
  const warn = console.warn; console.warn = () => {};
  const b = await ses.send({ url: 'https://example.com/', requestHeaders: { a: '1' } });
  console.warn = warn;
  ok(b.requestHeaders && b.requestHeaders['X-Profile'] === '1', 'a hook that throws is skipped, the rest still apply');
  const none = fakeSession(); GS.applySession(none);
  ok(JSON.stringify(await none.send({ url: 'https://example.com/', requestHeaders: { a: '1' } })) === '{}', 'nothing changes a request no hook wants: callback({})');
  const old = { listener: null, webRequest: { onBeforeSendHeaders: (fn) => { old.listener = fn; } }, pre: ['/x/other.js'], getPreloads: () => old.pre, setPreloads: (l) => { old.pre = l; } };
  GS.applySession(old);
  ok(old.pre.length === 2 && old.pre[1] === GS.PRELOAD && old.pre[0] === '/x/other.js', 'an older Electron: the preload is added beside the session\'s own (setPreloads)');

  // ── the preload: the page reads as Firefox, with no debugger ──
  const P = require('../src/preload/google-signin.js');
  ok(P.HOSTS.test('accounts.google.com') && !P.HOSTS.test('gemini.google.com'), 'the preload knows the same hosts');
  {
    const g0 = global.Navigator, w0 = global.window, nd = Object.getOwnPropertyDescriptor(global, 'navigator');
    function Nav() {} Nav.prototype = { userAgentData: { brands: [{ brand: 'Chromium' }] }, vendor: 'Google Inc.', productSub: '20030107', webdriver: false };
    global.Navigator = Nav; Object.defineProperty(global, 'navigator', { value: new Nav(), configurable: true, writable: true }); global.window = { chrome: { runtime: {} } };
    P.asFirefox();
    ok(!('userAgentData' in Nav.prototype) && navigator.userAgentData === undefined, 'navigator.userAgentData is gone');
    ok(!('chrome' in global.window), 'window.chrome is gone');
    ok(navigator.vendor === '' && navigator.productSub === '20100101', 'vendor and productSub are Firefox\'s');
    global.Navigator = g0; global.window = w0; if (nd) Object.defineProperty(global, 'navigator', nd); else delete global.navigator;
  }
  ok(!/debugger/.test(fs.readFileSync(path.join(__dirname, '../src/contexts/google-signin.js'), 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\/|^\s*\*.*$/gm, '')), 'the page side attaches no debugger (a debugger on the sign-in page is a signal)');

  // ── the page side ──
  function fakeContents(id, ua = CHROME) {
    const c = new EventEmitter();
    c.id = id; c.ua = ua; c.reloads = 0; c.session = fakeSession(); c.navUA = null;
    c.getUserAgent = () => c.ua; c.setUserAgent = (u) => { c.ua = u; c.sets = (c.sets || 0) + 1; };
    c.executeJavaScript = async () => c.navUA || c.ua; c.reload = () => { c.reloads++; };
    return c;
  }
  const logs = []; const log = (m) => logs.push(m);
  const tick = () => new Promise(r => setTimeout(r, 5));
  const c = fakeContents(11);
  ok(GS.attach(c, { log }) === true && GS.attach(c, { log }) === false, 'attach once per page');
  c.emit('did-start-navigation', { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x', isMainFrame: true, isSameDocument: false });
  ok(c.ua === FF && GS.inSignin(11), 'on the sign-in host the page is Firefox (Electron 42 details form)');
  c.emit('did-start-navigation', { url: 'https://ssl.gstatic.com/frame', isMainFrame: false, isSameDocument: false });
  ok(GS.inSignin(11), 'a subframe elsewhere does not end sign-in mode');
  c.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/challenge/pwd');
  await tick();
  ok(c.reloads === 0, 'the page already reads Firefox: no reload');
  c.emit('will-redirect', {}, 'https://chatgpt.com/api/auth/callback/google?code=x', false, true);
  ok(c.ua === CHROME && !GS.inSignin(11), 'back on the provider (positional form): the page\'s own UA returns');

  const d = fakeContents(12); GS.attach(d, { log });
  d.emit('did-start-navigation', {}, 'https://accounts.google.com/ServiceLogin', false, true);
  d.navUA = CHROME;
  d.emit('did-navigate', {}, 'https://accounts.google.com/ServiceLogin'); await tick();
  d.emit('did-navigate', {}, 'https://accounts.google.com/ServiceLogin'); await tick();
  ok(d.reloads === 1 && logs.some(l => /loading it once more/.test(l)), 'a page that still reads otherwise is loaded once more, once');

  const e = fakeContents(13, persona); GS.attach(e, { log });
  e.emit('did-start-navigation', { url: 'https://accounts.google.com/', isMainFrame: true });
  ok(e.ua === persona && !e.sets, 'an agent context presenting a current Firefox keeps its own UA (its profile, its header and its page agree)');
  e.emit('did-start-navigation', { url: 'https://gemini.google.com/app', isMainFrame: true });
  ok(e.ua === persona && !e.sets, 'and nothing is "restored" over it after');
  e.emit('destroyed');
  ok(!GS.inSignin(13), 'a closed page leaves sign-in mode');

  const f = fakeContents(14); GS.attach(f, { log });
  f.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/rejected?x=1');
  ok(logs.some(l => /Google refused the sign-in page anyway/.test(l)), 'the refusal page is reported');

  // ── contexts: the Firefox persona ──
  const E = require('../src/fingerprint/engine.js');
  const pool = E.ffPool();
  ok(pool.every(u => FFV.isFirefox(u) && !FFV.stale(u)) && !pool.some(u => /NT 11\.0/.test(u)), 'the persona pool is current Firefox, no NT 11.0');
  ok(E.FF_UA_POOL_2023.length === 5, 'the 2023 pool is kept, not erased (§0.3)');
  {
    const eng = Object.create(E.prototype);
    eng.profiles = new Map([['a1', { ua: 'Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0', timezone: 'X' }]]);
    let saved = 0; eng.save = () => { saved++; };
    const p = eng.getOrGenerate('a1');
    ok(!FFV.stale(p.ua) && /Windows NT 10\.0/.test(p.ua) && p.timezone === 'X' && saved === 1, 'a stored outdated persona is refreshed for the same OS, the rest kept');
  }
  const mgr = fs.readFileSync(path.join(__dirname, '../src/contexts/manager.js'), 'utf8');
  ok(/requestHook\(ses, 'fingerprint-profile'/.test(mgr) && /if \(\/\\bFirefox\\\/\/\.test\(profile\.ua\)\) for \(const k of Object\.keys\(headers\)\) if \(\/\^sec-ch-ua\/i/.test(mgr), 'a Firefox persona sends no client hints, on any site');
  const eng = fs.readFileSync(path.join(__dirname, '../src/fingerprint/engine.js'), 'utf8');
  ok(/delete Navigator\.prototype\.userAgentData/.test(eng) && /delete window\.chrome/.test(eng), 'the persona\'s page script removes userAgentData and window.chrome');

  // ── proxy ──
  const POL = require('../src/net/policy.js');
  const runPac = (pac, host) => { const fn = new Function(`${pac}; return FindProxyForURL;`)(); return fn(`https://${host}/`, host); };
  const tor = POL.pacFor({ default: 'transport', rules: [] }, {}, { socksPort: 9050 });
  ok(runPac(tor, 'accounts.google.com') === 'DIRECT' && runPac(tor, 'gemini.google.com') === 'SOCKS5 127.0.0.1:9050', 'Tor for everything: Google\'s sign-in goes direct, the rest stays on the transport');
  ok(runPac(POL.pacFor({ default: 'transport', signinOverTransport: true, rules: [] }, {}, { socksPort: 9050 }), 'accounts.google.com') === 'SOCKS5 127.0.0.1:9050', 'signinOverTransport keeps it on the transport, for those who choose that');
  ok(runPac(POL.pacFor({ default: 'http://10.0.0.5:3128', rules: [] }, {}, {}), 'accounts.google.com') === 'PROXY 10.0.0.5:3128', 'a person\'s own proxy is honoured for sign-in (one consistent egress)');
  ok(runPac(POL.pacFor({ default: 'direct', rules: [{ id: 'r1', match: { origin: 'google.com' }, via: 'transport' }, { id: 'r2', match: { origin: 'google.com' }, via: 'http://1.2.3.4:80' }] }, {}, { socksPort: 1 }), 'accounts.google.com') === 'DIRECT', 'a collision sends sign-in direct, not into a blackhole');
  ok(runPac(POL.pacFor({ default: 'block', rules: [] }, {}, {}), 'accounts.google.com') === POL.BLACKHOLE, 'an explicit block stays a block (a decision, not an accident)');
  const tls = fs.readFileSync(path.join(__dirname, '../src/tls/proxy.js'), 'utf8');
  ok(/net\.connect\(port, hostname/.test(tls) && /accounts\\\\?\.google/.test(tls), 'the TLS proxy raw-tunnels Google\'s sign-in hosts (the browser\'s own TLS, untouched)');

  // ── readers ──
  const ST = require('../src/page/semantic-tree.js');
  if (typeof ST.readAX === 'function') {
    let attached = false;
    const r = await ST.readAX({ getURL: () => 'https://accounts.google.com/v3/signin/identifier', debugger: { isAttached: () => false, attach: () => { attached = true; }, sendCommand: async () => ({}) } });
    ok(r.fallback === true && !attached && /Google's sign-in page/.test(r.why), 'the semantic-tree reader attaches no debugger on a sign-in page (page tree instead, said)');
  } else ok(/isSignin\(wc\.getURL\(\)\)/.test(fs.readFileSync(path.join(__dirname, '../src/page/semantic-tree.js'), 'utf8')), 'the semantic-tree reader checks for a sign-in page before attaching');

  console.log(`google-signin: ${n} passed, 0 failed`);
})().catch(e => { console.error(`google-signin: FAILED — ${e.stack || e.message}`); process.exit(1); });
