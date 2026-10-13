'use strict';
// 0.60.7 — James: "its saying its not signed in to the account when it is." The status reads where he really signs in
// (a normal tab = the default session, the provider tab = persist:ncp-<provider>), only that provider's site, and one
// capture takes that sign-in into the account: its vault row and its own session.
const assert = require('assert');
const { LoginPortal } = require('../src/accounts/login-portal.js');
const jar = () => { const c = []; return { cookies: { get: async () => c.slice(), set: async (x) => { c.push({ ...x, domain: x.domain || new URL(x.url).hostname }); } }, _c: c }; };
const sessions = { default: jar(), 'persist:ncp-chatgpt': jar() };
sessions.default._c.push({ name: '__Secure-next-auth.session-token', value: 'v', domain: '.chatgpt.com', path: '/', secure: true },
  { name: 'NID', value: 'x', domain: '.google.com', path: '/' });
const session = { defaultSession: sessions.default, fromPartition: (p) => sessions[p] || (sessions[p] = jar()) };
const recorded = {}, saved = [];
const options = { getAccount: () => ({ id: 'a1', label: 'work', sessions: recorded }), getDefaultAccount: () => null, linkAgent() {}, findAccountByProviderAccountId: () => null,
  recordSession: (id, p, v) => { recorded[p] = v; } };
const vault = { accountMeta: () => (saved.length ? { stored: true } : null), save: async (r) => saved.push(r), checkTokenHealth: async () => ({ expired: 0 }) };
const lp = new LoginPortal({ options, vault, registry: () => [{ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }], BrowserWindow: function () {}, session });
(async () => {
  let st = await lp.status({ id: 'a1', provider: 'chatgpt' });
  assert.strictEqual(st.liveCookies, 0, 'the account\'s own session is empty');
  assert.deepStrictEqual(st.elsewhere.map(e => [e.key, e.cookieCount, e.authCookies]), [['default', 1, 1]], 'found in a normal tab — only chatgpt.com\'s cookie, not google.com\'s');
  const r = await lp.capture({ id: 'a1', provider: 'chatgpt', from: 'default' });
  assert.ok(r.ok && r.likelySignedIn && r.cookieCount === 1, JSON.stringify(r));
  assert.strictEqual(saved.length, 1, 'saved to the vault');
  st = await lp.status({ id: 'a1', provider: 'chatgpt' });
  assert.strictEqual(st.liveCookies, 1, 'and copied into the account\'s own session, so its agent tab is signed in too');
  assert.strictEqual(st.session.authCookies, 1, 'the status now reads signed in');
  const none = await lp.capture({ id: 'a1', provider: 'chatgpt', from: 'ncp' });
  assert.ok(!none.ok && /sign in there first/.test(none.error), 'nothing in the provider tab: said, not faked');
  console.log('login-portal-elsewhere: ok');
})().catch(e => { console.error(e); process.exit(1); });
