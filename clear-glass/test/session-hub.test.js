'use strict';
// 0.60.13 — James: "providers, accounts, and agent mesh all need to be using the same cookies … I'm signed in but the
// provider when opened is signed out. sync them together. migrate and consolidate them."
// Checks the session hub (one provider session, live-mirrored to normal tabs, consolidated once) and the account-switch
// additions that sit on it (beginSignIn, settled), against fake cookie jars that raise 'changed' the way Electron does.
const assert = require('assert');
const { SessionHub, isAuthCookie } = require('../src/cookies/session-hub.js');
const { createAccountSwitch } = require('../src/providers/account-switch.js');

const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));

function jar(name) {
  const list = []; const hs = new Set();
  const emit = (cookie, cause, removed) => setImmediate(() => hs.forEach(h => h({}, cookie, cause, removed)));
  const hostOf = (u) => new URL(u).hostname;
  return {
    name, _list: list, _cleared: 0,
    cookies: {
      get: async () => list.map(c => ({ ...c })),
      set: async (a) => {
        const domain = a.domain || hostOf(a.url);
        const i = list.findIndex(c => c.name === a.name && c.domain === domain && (c.path || '/') === (a.path || '/'));
        if (i >= 0) { emit(list[i], 'overwrite', true); list.splice(i, 1); }
        const c = { name: a.name, value: a.value, domain, path: a.path || '/', secure: a.secure !== false, hostOnly: !a.domain, ...(a.expirationDate ? { expirationDate: a.expirationDate } : {}) };
        list.push(c); emit(c, 'explicit', false);
      },
      remove: async (url, name) => { const h = hostOf(url); const i = list.findIndex(c => c.name === name && c.domain.replace(/^\./, '') === h); if (i >= 0) { const [c] = list.splice(i, 1); emit(c, 'explicit', true); } },
      on: (_e, h) => hs.add(h), removeListener: (_e, h) => hs.delete(h),
    },
    clearStorageData: async () => { jar_clear(list, emit); },
    getUserAgent: () => 'x',
  };
}
function jar_clear(list, emit) { while (list.length) { const c = list.pop(); emit(c, 'explicit', true); } }
const tok = (domain = '.chatgpt.com', v = 'tok') => ({ name: '__Secure-next-auth.session-token', value: v, domain, path: '/', secure: true, expirationDate: 4e9 });
const csrf = { name: '__Host-next-auth.csrf-token', value: 'c', domain: 'chatgpt.com', path: '/', secure: true };
const cbk = { name: '__Secure-next-auth.callback-url', value: 'u', domain: '.chatgpt.com', path: '/', secure: true };

function rig({ settled = null, dispatch = 'A', accounts = [{ id: 'A', agentKeys: ['chatgpt'] }] } = {}) {
  const parts = {}; const normal = jar('default');
  const session = { defaultSession: normal, fromPartition: (p) => parts[p] || (parts[p] = jar(p)) };
  const snaps = []; const rows = new Map(); const marks = new Map();
  const vault = {
    snapshot: async (agent, ses, label) => { snaps.push({ agent, label, n: (await ses.cookies.get({})).length }); },
    _jaa: () => ({ get: (t, k) => (t === 'session_hub_migration' ? marks : rows).get(k.id) || null, upsert: (t, r) => (t === 'session_hub_migration' ? marks : rows).set(r.id, r), delete: (t, k) => rows.delete(k.id), flushAll() {} }),
  };
  const hub = new SessionHub({ session, vault, accounts: () => accounts, dispatchAccount: () => dispatch, onSettled: settled, debounceMs: 10, log: () => {},
    providers: () => ['chatgpt'], defFor: (id) => ({ url: 'https://chatgpt.com', hosts: ['chatgpt.com', 'chat.openai.com'], loginUrl: 'https://chatgpt.com/auth/login' }) });
  return { hub, session, parts, normal, snaps, vault, canon: () => session.fromPartition('persist:ncp-chatgpt') };
}

(async () => {
  // — a signed-OUT page's csrf token / callback-url cookie is not a sign-in (the old /auth|token|__Secure/ test said it was)
  assert.ok(!isAuthCookie(csrf) && !isAuthCookie(cbk), 'csrf + callback-url are not a sign-in');
  assert.ok(isAuthCookie(tok()) && isAuthCookie({ name: 'sessionKey' }) && isAuthCookie({ name: 'SAPISID' }) && isAuthCookie({ name: '__Secure-1PSID' }));

  // — James's exact state: a normal tab signed in, the provider session signed out (csrf only): consolidation takes the normal tab's sign-in
  {
    const r = rig(); r.normal._list.push(tok(), { ...cbk }); r.canon()._list.push({ ...csrf }, { ...cbk });
    const out = await r.hub.consolidate('chatgpt');
    assert.strictEqual(out.action, 'consolidated'); assert.strictEqual(out.from, 'normal');
    assert.ok(r.canon()._list.some(c => c.name.endsWith('session-token') && c.value === 'tok'), 'the provider session is now signed in');
    assert.strictEqual((await r.hub.consolidate('chatgpt')).action, 'already-done', 'once per provider');
    await r.hub.consolidate('chatgpt', { force: true });   // moves the provider session's own leftovers (its csrf cookie) across
    assert.strictEqual((await r.hub.consolidate('chatgpt', { force: true })).action, 'unchanged', 'forced again: nothing left to move');
  }
  // — the old mesh partition's sign-in is found when nothing else has one; the dispatch account's first
  {
    const r = rig({ accounts: [{ id: 'A', agentKeys: ['chatgpt'] }, { id: 'B', agentKeys: ['chatgpt'] }], dispatch: 'B' });
    r.session.fromPartition('persist:mesh-chatgpt-A')._list.push(tok('.chatgpt.com', 'a'));
    r.session.fromPartition('persist:mesh-chatgpt-B')._list.push(tok('.chatgpt.com', 'b'));
    const out = await r.hub.consolidate('chatgpt');
    assert.strictEqual(out.from, 'mesh:B'); assert.strictEqual(r.canon()._list.find(c => c.name.endsWith('session-token')).value, 'b');
    assert.strictEqual(r.snaps.length, 1, 'the other account\'s sign-in is saved to the vault, not dropped');
  }
  // — two real sign-ins: the provider session's wins WHOLE; the normal tab's is snapshotted; identities are never mixed
  {
    const r = rig(); r.canon()._list.push(tok('.chatgpt.com', 'canon')); r.normal._list.push(tok('.chatgpt.com', 'norm'));
    const out = await r.hub.consolidate('chatgpt');
    assert.strictEqual(out.from, 'provider'); assert.strictEqual(r.snaps.length, 1);
    assert.strictEqual(r.canon()._list.length, 1);
  }
  // — live mirror, both ways, only the provider's own site, no echo loop
  {
    const settledFor = []; const r = rig({ settled: (p) => settledFor.push(p) });
    r.hub.attach('chatgpt'); assert.strictEqual(r.hub.attach('chatgpt'), false, 'idempotent');
    await r.normal.cookies.set({ url: 'https://chatgpt.com/', domain: '.chatgpt.com', name: 'sess-token', value: '1', secure: true });
    await r.normal.cookies.set({ url: 'https://accounts.google.com/', name: 'NID', value: 'g', secure: true });
    await tick();
    assert.ok(r.canon()._list.some(c => c.name === 'sess-token'), 'signed in in a normal tab -> signed in in the provider session');
    assert.ok(!r.canon()._list.some(c => c.name === 'NID'), 'another site\'s cookie is not mirrored');
    await r.canon().cookies.remove('https://chatgpt.com/', 'sess-token'); await tick();
    assert.ok(!r.normal._list.some(c => c.name === 'sess-token'), 'signed out in the provider session -> signed out in the normal tab');
    await r.canon().cookies.set({ url: 'https://chatgpt.com/', domain: '.chatgpt.com', name: 'sess-token', value: '2', secure: true }); await tick(40);
    assert.strictEqual(r.normal._list.find(c => c.name === 'sess-token').value, '2');
    assert.strictEqual(r.normal._list.filter(c => c.name === 'sess-token').length, 1, 'no echo duplicates');
    assert.ok(settledFor.length >= 1 && settledFor.length <= 3, `settled raised (debounced), not per cookie: ${settledFor.length}`);
  }
  // — an account switch (hold) rewrites the provider session without flipping the normal tab's identity
  {
    const r = rig(); r.hub.attach('chatgpt');
    await r.normal.cookies.set({ url: 'https://chatgpt.com/', domain: '.chatgpt.com', name: 'sess-token', value: 'me', secure: true }); await tick();
    const release = r.hub.hold('chatgpt');
    await r.canon().clearStorageData(); await r.canon().cookies.set({ url: 'https://chatgpt.com/', domain: '.chatgpt.com', name: 'sess-token', value: 'routed-account', secure: true }); await tick();
    release(); 
    assert.strictEqual(r.normal._list.find(c => c.name === 'sess-token').value, 'me', 'the normal tab keeps its own sign-in while the session is routed to another account');
  }
  // — a sign-out reaches the normal tab
  {
    const r = rig(); r.normal._list.push(tok()); assert.strictEqual(await r.hub.clearNormal('chatgpt'), 1); assert.strictEqual(r.normal._list.length, 0);
  }

  // — account-switch on the one session
  function acct({ was = null, saved = {}, tab = [] } = {}) {
    const ses = jar('s'); ses._list.push(...tab); const rows = new Map(); const store = { ...saved }; const log = []; let held = 0;
    if (was) rows.set('chatgpt', { id: 'chatgpt', account: was });
    const vault = {
      _jaa: () => ({ get: (t, k) => rows.get(k.id) || null, upsert: (t, r) => rows.set(r.id, r), delete: (t, k) => rows.delete(k.id), flushAll() {} }),
      accounts: () => Object.entries(store).filter(([, c]) => c.length).map(([accountId, c]) => ({ accountId, count: c.length })),
      restore: async ({ accountId, replace }) => { if (replace) ses._list.length = 0; (store[accountId] || []).forEach(c => ses._list.push({ ...c })); log.push(`restore:${accountId}`); return { restored: (store[accountId] || []).length, total: (store[accountId] || []).length, failed: [] }; },
      capture: async ({ accountId }) => { store[accountId] = ses._list.map(c => ({ ...c })); log.push(`capture:${accountId}`); return { count: ses._list.length, sites: ['chatgpt.com'] }; },
      snapshot: async () => { log.push('snapshot'); }, deleteAccountCookies: (p, a) => { delete store[a]; log.push(`delete:${a}`); return { removed: 1 }; },
      _loadAccountCookies: async (p, a) => store[a] || [],
    };
    const options = { resolveAccountForDispatch: (p, x) => (x && !['A', 'B'].includes(x) ? { error: 'unknown' } : { accountId: x || 'A' }), recordSession() {}, listAccounts: () => [] };
    const as = createAccountSwitch({ providerHost: { windows: new Map() }, vault, options, getProvider: () => ({ url: 'https://chatgpt.com', hosts: ['chatgpt.com'] }), sessionFor: () => ses, hold: () => { held++; return () => { held--; }; }, log: () => {} });
    return { as, ses, store, log, rows, held: () => held };
  }
  {   // Sign in as B while the session is A's: A's is saved, B starts fresh, the session is B's
    const a = acct({ was: 'A', tab: [tok('.chatgpt.com', 'a')] });
    const r = await a.as.beginSignIn('chatgpt', 'B');
    assert.ok(r.ok && r.switched); assert.deepStrictEqual(a.log.slice(0, 1), ['capture:A']); assert.strictEqual(a.ses._list.length, 0); assert.strictEqual(a.as.current('chatgpt'), 'B');
    assert.strictEqual(a.held(), 0, 'hold released');
  }
  {   // …and B's saved sign-in is put in when it has one
    const a = acct({ was: 'A', tab: [tok('.chatgpt.com', 'a')], saved: { B: [tok('.chatgpt.com', 'b')] } });
    const r = await a.as.beginSignIn('chatgpt', 'B'); assert.strictEqual(r.restored, 1); assert.strictEqual(a.ses._list[0].value, 'b');
  }
  {   // settled: still signed in -> kept for the account; a token refresh is not lost
    const a = acct({ was: 'A', tab: [tok('.chatgpt.com', 'new')], saved: { A: [tok('.chatgpt.com', 'old')] } });
    assert.strictEqual((await a.as.settled('chatgpt')).action, 'saved'); assert.strictEqual(a.store.A[0].value, 'new');
  }
  {   // settled: every session credential gone (signed out in a tab) -> the saved copy goes too, or the next start undoes the sign-out
    const a = acct({ was: 'A', tab: [{ ...csrf }], saved: { A: [tok()] } });
    assert.strictEqual((await a.as.settled('chatgpt')).action, 'signed-out'); assert.ok(!a.store.A);
  }
  {   // settled does nothing when the session is not marked as an account
    const a = acct({ tab: [tok()] }); assert.strictEqual((await a.as.settled('chatgpt')).action, 'skipped');
  }
  {   // sync: the live sign-in (a normal tab's, just consolidated) is the truth; the stale saved copy is kept as a snapshot
    const a = acct({ tab: [tok('.chatgpt.com', 'live')], saved: { A: [tok('.chatgpt.com', 'stale')] } });
    const r = await a.as.sync('chatgpt', { reload: false });
    assert.strictEqual(r.action, 'saved'); assert.ok(a.log.includes('snapshot')); assert.strictEqual(a.store.A[0].value, 'live');
  }
  console.log('session-hub: ok');
})().catch(e => { console.error(e); process.exit(1); });
