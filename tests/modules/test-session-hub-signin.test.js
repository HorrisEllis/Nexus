'use strict';
/**
 * tests/modules/test-session-hub-signin.test.js — the provider window's sign-in is not overwritten by the normal tab's cookies (2026-11-04)
 * James, 2026-11-04: "reloading the sign in. it doesn't do on the main browser, only the popup window. maybe synbolic link or copying cookies?"
 *
 *   SH-01  a sign-in flow's own cookies (csrf, callback-url, state) set in the normal tab are not copied into the provider session, either way
 *   SH-02  the sign-in itself (a session token) is mirrored both ways, and a sign-out follows; another site's cookies are never touched
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');
const { SessionHub } = require(path.join(__dirname, '..', '..', 'clear-glass/src/cookies/session-hub.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

// a cookie jar like Electron's session.cookies: set/remove emit 'changed' (event, cookie, cause, removed)
function jar() {
  const store = new Map(), ev = new EventEmitter();
  const key = (c) => `${c.domain}|${c.path || '/'}|${c.name}`;
  return { store, cookies: Object.assign(ev, {
    async get() { return [...store.values()]; },
    async set(a) { const host = new URL(a.url).hostname; const c = { name: a.name, value: a.value, domain: a.domain || host, path: a.path || '/', secure: a.secure, httpOnly: a.httpOnly };
      store.set(key(c), c); ev.emit('changed', {}, c, 'explicit', false); },
    async remove(url, name) { const host = new URL(url).hostname; for (const [k, c] of store) if (c.name === name && (c.domain.replace(/^\./, '') === host)) { store.delete(k); ev.emit('changed', {}, c, 'explicit', true); } },
  }) };
}
const tick = () => new Promise(r => setTimeout(r, 20));

(async () => {
  console.log('\n⬡  Session hub: the provider window\'s sign-in is left alone\n');
  const normal = jar(), canon = jar();
  const hub = new SessionHub({ session: { defaultSession: normal, fromPartition: () => canon }, defFor: () => ({ url: 'https://chatgpt.com', hosts: ['chatgpt.com', 'chat.openai.com'] }), providers: () => ['chatgpt'], debounceMs: 1 });
  hub._settle = () => {};
  hub.attach('chatgpt');

  await test('SH-01', 'a sign-in flow\'s csrf / callback / state cookies are not copied between the jars', async () => {
    await canon.cookies.set({ url: 'https://chatgpt.com/', name: '__Host-next-auth.csrf-token', value: 'popup-csrf' });
    await normal.cookies.set({ url: 'https://chatgpt.com/', name: '__Host-next-auth.csrf-token', value: 'tab-csrf' });
    await normal.cookies.set({ url: 'https://chatgpt.com/', name: '__Secure-next-auth.callback-url', value: 'https://chatgpt.com/' });
    await normal.cookies.set({ url: 'https://auth.openai.com/', name: 'oauth_state', value: 'tab-state' });
    await tick();
    const csrf = [...canon.store.values()].find(c => c.name === '__Host-next-auth.csrf-token');
    assert.strictEqual(csrf.value, 'popup-csrf', 'the popup\'s own csrf is kept');
    assert.ok(![...canon.store.values()].some(c => /callback-url|oauth_state/.test(c.name)), JSON.stringify([...canon.store.values()]));
    assert.strictEqual([...normal.store.values()].find(c => c.name === '__Host-next-auth.csrf-token').value, 'tab-csrf');
  });

  await test('SH-02', 'the sign-in is mirrored both ways and a sign-out follows; another site is untouched', async () => {
    await canon.cookies.set({ url: 'https://chatgpt.com/', name: '__Secure-next-auth.session-token', value: 'signed-in' });
    await tick();
    assert.strictEqual([...normal.store.values()].find(c => c.name === '__Secure-next-auth.session-token').value, 'signed-in', 'the normal tab is signed in too');
    await normal.cookies.remove('https://chatgpt.com/', '__Secure-next-auth.session-token');
    await tick();
    assert.ok(![...canon.store.values()].some(c => c.name === '__Secure-next-auth.session-token'), 'signed out in both');
    await normal.cookies.set({ url: 'https://example.com/', name: 'session_id', value: 'x' });
    await tick();
    assert.ok(![...canon.store.values()].some(c => c.domain === 'example.com'));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
