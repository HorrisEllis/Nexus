'use strict';
// 0.60.51 — James (screenshot): the Accounts sign-in window for Google said "We've detected a problem with your cookie settings."
// Google's sign-in sets a test cookie on one page and reads it back on the next. Two things wrote into the same jar meanwhile:
//   1. account-switch reloaded the provider's own (signed-out) tabs to the provider URL, which sent each to Google's sign-in: a second flow;
//   2. the session hub copied the normal tabs' Google cookies (NID, SIDCC rotate constantly) into the jar.
// Now, while a sign-in window is open: the provider tabs wait at about:blank (and come back when it closes), the normal tabs' cookies
// are not copied in, and the sign-in window's own session is Chrome to Google. Fakes only: Electron and Google cannot run here.
const assert = require('assert');
const { EventEmitter } = require('events');
const { SessionHub } = require('../src/cookies/session-hub.js');
const { createAccountSwitch } = require('../src/providers/account-switch.js');
const { LoginPortal } = require('../src/accounts/login-portal.js');

const jar = () => { const c = []; const ev = new EventEmitter();
  return { _c: c, ev,
    cookies: { get: async () => c.slice(), set: async (x) => { const d = x.domain || new URL(x.url).hostname; const i = c.findIndex(k => k.name === x.name && k.domain === d); const row = { ...x, domain: d }; if (i >= 0) c[i] = row; else c.push(row); },
      remove: async (u, n) => { const i = c.findIndex(k => k.name === n); if (i >= 0) c.splice(i, 1); },
      on: (e, f) => ev.on(e, f), removeListener: (e, f) => ev.removeListener(e, f) },
    fire: (cookie, cause = 'explicit', removed = false) => ev.emit('changed', {}, cookie, cause, removed) }; };
const NID = (v) => ({ name: 'NID', value: v, domain: '.google.com', path: '/', secure: true, hostOnly: false });

(async () => {
  // ── 1. session hub: a normal tab's cookie reaches the provider jar normally; not while a sign-in window is open ──
  const canon = jar(), norm = jar();
  const hub = new SessionHub({ session: { defaultSession: norm, fromPartition: () => canon }, defFor: () => ({ url: 'https://gemini.google.com/app', hosts: ['gemini.google.com'] }), providers: () => ['gemini'] });
  hub.attach('gemini');
  norm._c.push(NID('v1')); norm.fire(NID('v1'));
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(canon._c.length, 1, 'baseline: a normal tab\'s Google cookie is mirrored into the provider session');
  const release = hub.quiet('gemini');
  norm._c.push({ ...NID('v2'), name: 'SIDCC' }); norm.fire({ ...NID('v2'), name: 'SIDCC' });
  await new Promise(r => setTimeout(r, 20));
  assert.ok(!canon._c.some(c => c.name === 'SIDCC'), 'while a sign-in window is open, the normal tab\'s rotating cookie is NOT copied into the jar');
  release(); release();   // idempotent
  norm.fire({ ...NID('v3'), name: 'NID2' }); norm._c.push({ ...NID('v3'), name: 'NID2' });
  await new Promise(r => setTimeout(r, 20));
  assert.ok(canon._c.some(c => c.name === 'NID2'), 'released: mirroring resumes');
  // the other direction is untouched: a cookie set IN the sign-in window still reaches the normal tabs
  const r2 = hub.quiet('gemini'); canon._c.push({ ...NID('x'), name: 'GAPS' }); canon.fire({ ...NID('x'), name: 'GAPS' });
  await new Promise(r => setTimeout(r, 20));
  assert.ok(norm._c.some(c => c.name === 'GAPS'), 'a cookie set in the sign-in window still reaches the normal tabs'); r2();
  hub.detachAll();

  // ── 2. account-switch: beginSignIn({park}) parks the provider tab at about:blank, endSignIn reloads it ──
  const loads = []; const win = { isDestroyed: () => false, webContents: { once: (e, f) => setImmediate(f), reload: () => loads.push('reload') }, loadURL: async (u) => { loads.push(u); } };
  const ses = { cookies: { get: async () => [], set: async () => {} }, clearStorageData: async () => {} };
  const rows = new Map();
  const vault = { _jaa: () => ({ get: (t, k) => rows.get(k.id) || null, upsert: (t, r) => rows.set(r.id, r), delete: () => {}, flushAll() {} }), accounts: () => [], capture: async () => ({ count: 0, sites: [] }), snapshot: async () => {} };
  const options = { resolveAccountForDispatch: () => ({ accountId: 'A' }), recordSession() {}, listAccounts: () => [{ id: 'A', label: 'A', agentKeys: ['gemini'] }] };
  const sw = createAccountSwitch({ providerHost: { windows: new Map([['gemini', win]]), agentTabs: new Map() }, vault, options, getProvider: () => ({ url: 'https://gemini.google.com/app' }), sessionFor: () => ses, reloadWaitMs: 300 });
  const b = await sw.beginSignIn('gemini', 'A', { park: true });
  assert.ok(b.ok && b.parked === 1, JSON.stringify(b));
  assert.deepStrictEqual(loads, ['about:blank'], 'the signed-out provider tab went to about:blank, NOT to the provider URL (which redirects to Google\'s sign-in)');
  const e = await sw.endSignIn('gemini');
  assert.ok(e.ok && e.tabs === 1 && loads[loads.length - 1] === 'https://gemini.google.com/app', 'when the window closes the tab loads the provider again: ' + JSON.stringify(loads));
  loads.length = 0;
  const b2 = await sw.beginSignIn('gemini', 'A');   // no park: unchanged behaviour for every other caller
  assert.ok(b2.ok && !loads.includes('about:blank'), 'without park nothing is parked: ' + JSON.stringify(loads));

  // ── 3. login portal: open() parks, quiets, applies the clean UA, and close() releases and reloads ──
  const calls = []; const wins = [];
  function BW() { const w = new EventEmitter(); w.webContents = new EventEmitter(); w.webContents.executeJavaScript = async () => ({}); w.show = w.focus = () => {}; w.isDestroyed = () => false; w.loadURL = async () => {}; w.close = () => w.emit('closed'); wins.push(w); return w; }
  const psess = jar();
  const as = { beginSignIn: async (p, id, o) => { calls.push(['begin', p, id, o && o.park]); return { ok: true }; }, endSignIn: async (p) => { calls.push(['end', p]); }, current: () => null };
  const hub2 = { quiet: (p) => { calls.push(['quiet', p]); return () => calls.push(['unquiet', p]); }, sessionFor: (p) => { calls.push(['ua', p]); return psess; } };
  const logs = [];
  const lp = new LoginPortal({ options: { getAccount: () => ({ id: 'a1', label: 'work', sessions: {} }), getDefaultAccount: () => null, linkAgent() {}, findAccountByProviderAccountId: () => null, recordSession() {} },
    vault: { accountMeta: () => null }, registry: () => [{ id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' }],
    BrowserWindow: BW, session: { defaultSession: jar(), fromPartition: () => psess }, accountSwitch: () => as, hub: hub2, log: (m) => logs.push(m) });
  const o = await lp.open({ id: 'a1', provider: 'gemini' });
  assert.ok(o.ok, JSON.stringify(o));
  assert.deepStrictEqual(calls.map(c => c[0]), ['quiet', 'ua', 'begin'], 'quiet first, the clean-UA session, then the account switch: ' + JSON.stringify(calls));
  assert.strictEqual(calls.find(c => c[0] === 'begin')[3], true, 'beginSignIn was told to park the provider tabs');
  psess.fire({ name: 'GAPS', value: 'SECRET', domain: 'accounts.google.com' }, 'explicit'); psess.fire({ name: '__Host-GAPS', value: 'SECRET2', domain: 'accounts.google.com' }, 'overwrite', true);
  psess.fire({ name: 'session', value: 'x', domain: 'chatgpt.com' });
  wins[0].close();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(calls.some(c => c[0] === 'unquiet') && calls.some(c => c[0] === 'end' && c[1] === 'gemini'), 'closing the window releases the quiet and brings the provider tabs back: ' + JSON.stringify(calls));
  assert.ok(logs.length === 1 && /\+GAPS\(explicit\)/.test(logs[0]) && /-__Host-GAPS\(overwrite\)/.test(logs[0]), 'the cookie changes Google saw are logged by name and cause: ' + logs.join('|'));
  assert.ok(!/SECRET/.test(logs.join('')) && !/chatgpt/.test(logs.join('')), 'never a value, never another site');
  console.log('signin-window-quiet: ok');
})().catch(e => { console.error(e); process.exit(1); });
