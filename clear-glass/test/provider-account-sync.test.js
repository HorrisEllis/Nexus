'use strict';
// 0.60.12 — James: "the logins for the agent providers needs to be all the same. the accounts and sign in, isn't wired
// into the provider tabs in clearglass. fix that please."
// The provider tab (persist:ncp-<provider>) runs as the provider's dispatch account from Accounts & sign-in. These checks
// run account-switch.sync()/signedOut() against fakes of the vault, the options store and the tab's session.
const assert = require('assert');
const { createAccountSwitch } = require('../src/providers/account-switch.js');

const AUTH = (site) => ({ name: '__Secure-next-auth.session-token', value: 'tok', domain: `.${site}`, path: '/', secure: true });

function rig({ accounts = ['A'], dispatch = 'A', saved = {}, tabCookies = [] } = {}) {
  const jar = tabCookies.slice();
  const ses = {
    cookies: { get: async () => jar.slice(), set: async (c) => { jar.push(c); } },
    clearStorageData: async () => { jar.length = 0; },
  };
  const rows = new Map();                       // provider_tab_account table
  const store = { saved: { ...saved } };        // accountId -> [cookies]
  const calls = { restore: [], capture: [], reload: 0 };
  const vault = {
    _jaa: () => ({ get: (t, k) => rows.get(k.id) || null, upsert: (t, r) => rows.set(r.id, r), delete: (t, k) => rows.delete(k.id), flushAll() {} }),
    accounts: () => Object.entries(store.saved).filter(([, c]) => c.length).map(([accountId, c]) => ({ accountId, count: c.length, sites: ['chatgpt.com'], updatedAt: 1 })),
    restore: async ({ accountId, replace }) => {
      calls.restore.push(accountId);
      const c = store.saved[accountId] || [];
      if (replace) jar.length = 0;
      c.forEach(x => jar.push(x));
      return { restored: c.length, total: c.length, failed: [] };
    },
    capture: async ({ accountId }) => { calls.capture.push(accountId); store.saved[accountId] = jar.slice(); return { count: jar.length, sites: ['chatgpt.com'] }; },
    snapshot: async () => {},
  };
  const state = { dispatch };
  const options = {
    resolveAccountForDispatch: (p, explicit) => {
      const id = explicit || state.dispatch;
      if (explicit && !accounts.includes(explicit)) return { error: `unknown_account: ${explicit}`, code: 'unknown_account' };
      return { accountId: id, source: explicit ? 'explicit' : 'default' };
    },
    recordSession() {}, listAccounts: () => accounts.map(id => ({ id, label: id, agentKeys: ['chatgpt'] })),
  };
  const win = { isDestroyed: () => false, webContents: { once: (e, f) => setImmediate(f), reload: () => { calls.reload++; } }, loadURL: async () => { calls.reload++; } };
  const sw = createAccountSwitch({
    providerHost: { windows: new Map([['chatgpt', win]]), agentTabs: new Map() }, vault, options,
    getProvider: () => ({ url: 'https://chatgpt.com', hosts: ['chatgpt.com', 'chat.openai.com'] }),
    sessionFor: () => ses, reloadWaitMs: 500,
  });
  return { sw, jar, store, calls, state };
}

(async () => {
  // 1. the account is signed in (saved), the tab is signed out -> the tab gets the account's sign-in (the screenshot's bug)
  let t = rig({ saved: { A: [AUTH('chatgpt.com')] } });
  let r = await t.sw.sync('chatgpt', { reload: false });
  assert.ok(r.ok && r.action === 'restored' && r.accountId === 'A', JSON.stringify(r));
  assert.strictEqual(t.jar.length, 1, 'the tab session now holds the sign-in');
  assert.strictEqual(t.sw.current('chatgpt'), 'A', 'and is marked as account A');
  assert.strictEqual(t.calls.reload, 0, 'reload:false (before first load) does not reload');

  // 2. again -> nothing to do
  r = await t.sw.sync('chatgpt');
  assert.strictEqual(r.action, 'unchanged', JSON.stringify(r));

  // 3. the account has nothing saved, the tab IS signed in -> the tab's sign-in is saved to the account, never overwritten
  t = rig({ tabCookies: [AUTH('chatgpt.com')] });
  r = await t.sw.sync('chatgpt', { reload: false });
  assert.strictEqual(r.action, 'saved', JSON.stringify(r));
  assert.deepStrictEqual(t.calls.restore, [], 'nothing was restored over the tab\'s own sign-in');
  assert.ok(t.store.saved.A.length === 1, 'it is the account\'s now');

  // 4. nothing saved and the tab is signed out -> skipped, and it says why
  t = rig();
  r = await t.sw.sync('chatgpt');
  assert.ok(r.ok && r.action === 'skipped' && /sign in once/.test(r.why), JSON.stringify(r));

  // 5. no account for the provider -> skipped, and says to add one
  t = rig({ accounts: [], dispatch: null });
  r = await t.sw.sync('chatgpt');
  assert.ok(r.action === 'skipped' && /add one/.test(r.why), JSON.stringify(r));

  // 6. starring another account switches the tab to it, saving what the tab held under the account it was
  t = rig({ accounts: ['A', 'B'], saved: { A: [AUTH('chatgpt.com')], B: [{ ...AUTH('chatgpt.com'), value: 'B-tok' }] } });
  await t.sw.sync('chatgpt', { reload: false });
  t.state.dispatch = 'B';
  r = await t.sw.sync('chatgpt');
  assert.ok(r.action === 'restored' && r.accountId === 'B' && r.from === 'A', JSON.stringify(r));
  assert.strictEqual(t.jar[0].value, 'B-tok', 'the tab now carries B\'s cookie');
  assert.ok(t.calls.capture.includes('A'), 'A\'s state was saved before it was replaced');
  assert.ok(t.calls.reload >= 1, 'the open tab reloaded');

  // 7. signing the account out on the Accounts page signs the tab out only when the tab runs as that account
  r = await t.sw.signedOut('chatgpt', 'A');
  assert.strictEqual(r.action, 'unchanged', 'tab runs as B, A signing out leaves it alone');
  assert.strictEqual(t.jar.length, 1);
  r = await t.sw.signedOut('chatgpt', 'B');
  assert.strictEqual(r.action, 'signed-out', JSON.stringify(r));
  assert.strictEqual(t.jar.length, 0, 'the tab is signed out too');
  assert.strictEqual(t.sw.current('chatgpt'), null);

  // 8. state() names the dispatch account for the Provider tabs page
  t = rig({ accounts: ['A', 'B'], dispatch: 'B' });
  assert.strictEqual(t.sw.state('chatgpt').dispatch, 'B');

  // 9. the wiring is there: the host asks before it loads, main sets the hook, the Accounts page's actions follow through
  const fs = require('fs'), path = require('path'); const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(/this\.beforeLoad\(providerId, ses\)/.test(R('src/providers/host.js')) && R('src/providers/host.js').indexOf('this.beforeLoad(providerId') < R('src/providers/host.js').indexOf('await this._load(providerId, win'), 'host.js asks before the first load');
  assert.ok(/providerHost\.beforeLoad = .*acctSwitch\(\)\.sync/.test(R('src/main/index.js')), 'main sets the hook');
  const B = R('src/ipc/bridge.js');
  assert.ok(/'accounts:setDefault'[\s\S]{0,200}tabSync\('sync'/.test(B) && /portal:capture'[\s\S]{0,200}tabSync\('sync'/.test(B) && /portal:signOut'[\s\S]{0,200}tabSync\('signedOut'/.test(B), 'star, save session and sign out follow through to the tab');

  console.log('provider-account-sync: ok (9 checks)');
})().catch(e => { console.error(e); process.exit(1); });
