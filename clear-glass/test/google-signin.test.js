'use strict';
// 2026-10-16 — James (a Clear Glass popup, Google: "Couldn't sign you in — This browser or app may not be secure"): "need this
// fixed. completely". src/contexts/google-signin.js: on Google's sign-in hosts Clear Glass presents as Firefox, consistently
// (header UA, no Sec-CH-UA*, page UA, no navigator.userAgentData); off them, the page's own UA comes back. And
// src/contexts/session-headers.js requestHook: one onBeforeSendHeaders per session, hooks composed (a second listener used
// to replace the first without a word). Fakes only: Electron and Google cannot run here.
const assert = require('assert');
const { EventEmitter } = require('events');
const GS = require('../src/contexts/google-signin.js');
const { requestHook, applyCspBypass } = require('../src/contexts/session-headers.js');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const FF = GS.firefoxUA();
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function fakeSession() {
  const s = { listener: null, webRequest: { onBeforeSendHeaders: (fn) => { s.listener = fn; s.registrations = (s.registrations || 0) + 1; }, onHeadersReceived: () => {} } };
  s.send = (details) => new Promise(r => s.listener(details, (res) => r(res)));
  return s;
}

(async () => {
  // ── which hosts ──
  for (const u of ['https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn', 'https://accounts.google.co.uk/ServiceLogin', 'https://accounts.youtube.com/accounts/SetSID'])
    ok(GS.isSignin(u), `sign-in host: ${u}`);
  for (const u of ['https://gemini.google.com/app', 'https://chatgpt.com/auth/login', 'https://accounts.google.com.evil.example/', 'https://www.google.com/', 'not a url'])
    ok(!GS.isSignin(u), `not a sign-in host: ${u}`);
  ok(/Firefox\/\d+/.test(FF) && !/Chrome|Electron/.test(FF), 'the sign-in UA is Firefox, nothing else');
  ok(/Windows NT 10\.0/.test(GS.firefoxUA('win32')) && /Macintosh/.test(GS.firefoxUA('darwin')) && /X11; Linux/.test(GS.firefoxUA('linux')), 'one UA per OS, as Firefox writes it');

  // ── the request side, pure ──
  const H = { 'User-Agent': CHROME, 'sec-ch-ua': '"Chromium";v="142", "Not_A Brand";v="24"', 'sec-ch-ua-mobile': '?0', 'Sec-CH-UA-Platform': '"Windows"', Accept: 'text/html', Cookie: 'NID=1' };
  const out = GS.rewriteHeaders({ url: 'https://accounts.google.com/v3/signin/identifier' }, H);
  ok(out['User-Agent'] === FF, 'the sign-in request says Firefox');
  ok(!Object.keys(out).some(k => /^sec-ch-ua/i.test(k)), 'every Sec-CH-UA header is gone (Firefox sends none)');
  ok(out.Accept === 'text/html' && out.Cookie === 'NID=1', 'everything else is sent as it was (cookies untouched)');
  ok(GS.rewriteHeaders({ url: 'https://chatgpt.com/backend-api/me' }, H) === null, 'another site: untouched');
  ok(GS.rewriteHeaders({ url: 'https://ssl.gstatic.com/accounts/ui/x.js', webContentsId: 7 }, H, { inSignin: (id) => id === 7 })['User-Agent'] === FF,
    'a sub-request of a page on a sign-in host (gstatic) says the same as the page');

  // ── requestHook: one listener per session, hooks composed in order; the sign-in hook last ──
  const ses = fakeSession();
  applyCspBypass(ses);
  requestHook(ses, 'fingerprint-profile', (d, h) => ({ ...h, 'User-Agent': 'profile-UA', 'X-Profile': '1' }));
  GS.applySession(ses); GS.applySession(ses);   // idempotent
  ok(ses.registrations === 1, `one onBeforeSendHeaders on the session (was one per caller, the later replacing the earlier): ${ses.registrations}`);
  const local = await ses.send({ url: 'http://127.0.0.1:7702/x', requestHeaders: { 'User-Agent': CHROME } });
  ok(local.requestHeaders['Access-Control-Request-Private-Network'] === 'true' && local.requestHeaders['X-Profile'] === '1', 'the localhost header and the profile hook both apply (the profile used to wipe the localhost one)');
  const g = await ses.send({ url: 'https://accounts.google.com/ServiceLogin', requestHeaders: H });
  ok(g.requestHeaders['User-Agent'] === FF && g.requestHeaders['X-Profile'] === '1', 'on the sign-in host the sign-in hook runs last: Firefox wins over the profile UA');
  requestHook(ses, 'broken', () => { throw new Error('boom'); }, { order: 50 });
  const warn = console.warn; console.warn = () => {};
  const b = await ses.send({ url: 'https://example.com/', requestHeaders: { a: '1' } });
  console.warn = warn;
  ok(b.requestHeaders && b.requestHeaders['X-Profile'] === '1', 'a hook that throws is skipped, the rest still apply');
  const none = fakeSession(); GS.applySession(none);
  ok(JSON.stringify(await none.send({ url: 'https://example.com/', requestHeaders: { a: '1' } })) === '{}', 'nothing changes a request no hook wants: callback({})');

  // ── the page side ──
  function fakeContents(id) {
    const c = new EventEmitter();
    c.id = id; c.ua = CHROME; c.reloads = 0; c.session = fakeSession(); c.navUA = null;
    c.getUserAgent = () => c.ua; c.setUserAgent = (u) => { c.ua = u; };
    c.executeJavaScript = async () => c.navUA || c.ua; c.reload = () => { c.reloads++; };
    const dbg = { attached: false, scripts: [], removed: [], isAttached: () => dbg.attached, attach: () => { dbg.attached = true; },
      detach: () => { dbg.attached = false; }, sendCommand: async (m, p) => { if (m === 'Page.addScriptToEvaluateOnNewDocument') { dbg.scripts.push(p.source); return { identifier: 's1' }; } if (m === 'Page.removeScriptToEvaluateOnNewDocument') dbg.removed.push(p.identifier); return {}; } };
    c.debugger = dbg;
    return c;
  }
  const logs = []; const log = (m) => logs.push(m);
  const tick = () => new Promise(r => setTimeout(r, 5));
  const c = fakeContents(11);
  ok(GS.attach(c, { log }) === true && GS.attach(c, { log }) === false, 'attach once per page');
  c.emit('did-start-navigation', { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x', isMainFrame: true, isSameDocument: false });
  await tick();
  ok(c.ua === FF && GS.inSignin(11), 'on the sign-in host the page is Firefox (Electron 42 details form)');
  ok(c.debugger.scripts.length === 1 && /userAgentData/.test(c.debugger.scripts[0]), 'navigator.userAgentData is removed before the page\'s scripts run');
  c.emit('did-start-navigation', { url: 'https://accounts.google.com/v3/signin/challenge/pwd', isMainFrame: true, isSameDocument: false });
  await tick();
  ok(c.debugger.scripts.length === 1, 'moving within the sign-in flow does not stack scripts');
  c.emit('did-start-navigation', { url: 'https://ssl.gstatic.com/frame', isMainFrame: false, isSameDocument: false });
  ok(GS.inSignin(11), 'a subframe elsewhere does not end sign-in mode');
  c.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/challenge/pwd');
  await tick();
  ok(c.reloads === 0, 'the page already reads Firefox: no reload');
  c.emit('will-redirect', {}, 'https://chatgpt.com/api/auth/callback/google?code=x', false, true);
  await tick();
  ok(c.ua === CHROME && !GS.inSignin(11), 'back on the provider (positional form): the page\'s own UA returns');
  ok(c.debugger.removed[0] === 's1' && !c.debugger.isAttached(), 'the script is removed and the debugger released');

  // the UA change came after the document was made: one reload, never a loop
  const d = fakeContents(12); GS.attach(d, { log });
  d.emit('did-start-navigation', {}, 'https://accounts.google.com/ServiceLogin', false, true);
  await tick();
  d.navUA = CHROME;
  d.emit('did-navigate', {}, 'https://accounts.google.com/ServiceLogin');
  await tick();
  d.emit('did-navigate', {}, 'https://accounts.google.com/ServiceLogin');
  await tick();
  ok(d.reloads === 1 && logs.some(l => /loading it once more/.test(l)), 'a page that still reads Chrome is loaded once more, once');

  // someone else holds the debugger: headers and UA still Firefox, said
  const e = fakeContents(13); e.debugger.attached = true; GS.attach(e, { log });
  e.emit('did-start-navigation', { url: 'https://accounts.google.com/', isMainFrame: true });
  await tick();
  ok(e.ua === FF && e.debugger.scripts.length === 0 && logs.some(l => /held elsewhere/.test(l)), 'a held debugger is left alone and said');
  e.emit('destroyed');
  ok(!GS.inSignin(13), 'a closed page leaves sign-in mode');

  // Google refusing anyway is said, never silent
  const f = fakeContents(14); GS.attach(f, { log });
  f.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/rejected?x=1');
  ok(logs.some(l => /Google refused the sign-in page anyway/.test(l)), 'the refusal page is reported');

  console.log(`google-signin: ${n} passed, 0 failed`);
})().catch(e => { console.error(`google-signin: FAILED — ${e.stack || e.message}`); process.exit(1); });
