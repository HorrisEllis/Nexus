'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cg-accounts-portal-settings.test.js — 0.39.223
 * Clear Glass account authority + login portals + OS-sealed vault keys +
 * guardian asking Clear Glass for accounts + the rebuilt Settings UI.
 *
 * Pure Node (+ jsdom for the UI). Electron's BrowserWindow/session/safeStorage
 * are fakes: this proves the wiring and the decisions, NOT a live sign-in on a
 * real provider — that is the one thing only James's machine can confirm.
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const CG = path.join(ROOT, 'clear-glass');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  \u2713 ${id} ${desc}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${desc}\n    ${e.stack}`); failed++; } }
const tmp = (p = 'cgacct-') => fs.mkdtempSync(path.join(os.tmpdir(), p));

// isolate NexusOptions' file (OPTIONS_PATH is computed from HOME/APPDATA at require time)
process.env.HOME = tmp('cghome-'); delete process.env.APPDATA;

// fake safeStorage: reversible, but NOT the identity, so a test can tell sealed from plain
const fakeSS = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from('SEALED:' + Buffer.from(s).toString('base64')),
  decryptString: (b) => { const t = b.toString(); if (!t.startsWith('SEALED:')) throw new Error('not sealed by this keyring'); return Buffer.from(t.slice(7), 'base64').toString(); },
});

const { loadVaultKey, encryptWith, decryptWithFallback } = require(path.join(CG, 'src/security/vault-key.js'));
const CookieVault = require(path.join(CG, 'src/cookies/vault.js'));
const { PasswordVault } = require(path.join(CG, 'src/passwords/vault.js'));
const NexusOptions = require(path.join(CG, 'src/options/store.js'));
const { LoginPortal, partitionFor } = require(path.join(CG, 'src/accounts/login-portal.js'));

// ── fake electron ──────────────────────────────────────────────────────────
function fakeElectron() {
  const sessions = new Map();
  const session = { fromPartition: (p) => {
    if (!sessions.has(p)) sessions.set(p, { partition: p, _cookies: [], cleared: 0,
      cookies: { get: async () => sessions.get(p)._cookies.slice(), set: async (c) => { sessions.get(p)._cookies.push(c); }, remove: async () => {} },
      clearStorageData: async () => { sessions.get(p)._cookies = []; sessions.get(p).cleared++; } });
    return sessions.get(p);
  } };
  const windows = [];
  class BrowserWindow {
    constructor(opts) { this.opts = opts; this._destroyed = false; this._handlers = {}; this.shown = 0; this.js = [];
      this.webContents = { on: (ev, fn) => { (this._handlers[ev] = this._handlers[ev] || []).push(fn); }, executeJavaScript: async (code) => { this.js.push(code); return { user: true, pass: true }; } };
      windows.push(this); }
    on(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); }
    fire(ev, ...a) { (this._handlers[ev] || []).forEach(f => f(...a)); (this.webContents && []).forEach(() => {}); }
    fireWc(ev, ...a) { (this._handlers[ev] || []).forEach(f => f(...a)); }
    async loadURL(u) { this.url = u; }
    isDestroyed() { return this._destroyed; }
    show() { this.shown++; } focus() {}
    close() { this._destroyed = true; this.fire('closed'); }
  }
  return { session, sessions, BrowserWindow, windows };
}
const REGISTRY = [{ id: 'claude', name: 'Claude', url: 'https://claude.ai', color: '#cc785c' }, { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', color: '#19c37d' }, { id: 'grok', name: 'Grok', url: 'https://grok.com', color: '#fff' }];

(async () => {
  console.log('\n  vault key (safeStorage + legacy fallback)');
  await test('VK-01', 'sealed key is generated once, persisted sealed, and reloads byte-identical', () => {
    const dir = tmp();
    const a = loadVaultKey({ name: 'x', legacyPassphrase: 'p', dir, safeStorage: fakeSS(), log: () => {} });
    assert.strictEqual(a.source, 'safeStorage');
    assert.ok(fs.readFileSync(path.join(dir, 'x.key')).toString().startsWith('SEALED:'), 'key on disk is sealed, not plain');
    const b = loadVaultKey({ name: 'x', legacyPassphrase: 'p', dir, safeStorage: fakeSS(), log: () => {} });
    assert.ok(a.key.equals(b.key)); assert.ok(!a.key.equals(a.legacyKey));
  });
  await test('VK-02', 'data written under the old hardcoded key still decrypts after the upgrade (nothing lost)', () => {
    const dir = tmp();
    const k = loadVaultKey({ name: 'x', legacyPassphrase: 'p', dir, safeStorage: fakeSS(), log: () => {} });
    const old = encryptWith(k.legacyKey, 'old secret');
    assert.strictEqual(decryptWithFallback(k, old), 'old secret');
    assert.strictEqual(decryptWithFallback(k, encryptWith(k.key, 'new')), 'new');
  });
  await test('VK-03', 'no safeStorage => legacy key, a stated reason, and a loud log (never silently "secure")', () => {
    const logs = [];
    const k = loadVaultKey({ name: 'x', legacyPassphrase: 'p', dir: tmp(), safeStorage: null, log: (m) => logs.push(m) });
    assert.strictEqual(k.source, 'legacy'); assert.ok(k.reason); assert.ok(logs.some(l => /LEGACY/.test(l)));
  });
  await test('VK-04', 'an unopenable sealed key is NOT overwritten (would orphan data) and falls back loudly', () => {
    const dir = tmp(); fs.writeFileSync(path.join(dir, 'x.key'), 'garbage');
    const k = loadVaultKey({ name: 'x', legacyPassphrase: 'p', dir, safeStorage: fakeSS(), log: () => {} });
    assert.strictEqual(k.source, 'legacy'); assert.strictEqual(fs.readFileSync(path.join(dir, 'x.key'), 'utf8'), 'garbage');
  });

  console.log('\n  cookie + password vault');
  await test('CV-01', 'file-store branch (the real one: no better-sqlite3) now reads named-account cookies back — was always []', async () => {
    const v = new CookieVault({ dir: tmp(), safeStorage: fakeSS(), noSqlite: true }); await v.init();
    assert.strictEqual(v.keyStatus().source, 'safeStorage');
    await v.save({ agentId: 'claude', accountId: 'acc-1', domain: 'claude.ai', cookies: [{ name: 'sessionKey', value: 'v', domain: '.claude.ai' }] });
    const got = await v._loadAccountCookies('claude', 'acc-1');
    assert.strictEqual(got.length, 1); assert.strictEqual(got[0].name, 'sessionKey');
    const ses = fakeElectron().session.fromPartition('persist:mesh-claude-acc-1');
    const r = await v.restore({ agentId: 'claude', accountId: 'acc-1', ses });
    assert.strictEqual(r.restored, 1, 'restore() now actually puts the cookie into the session');
  });
  await test('CV-02', 'accountMeta never decrypts; deleteAccountCookies really removes', async () => {
    const v = new CookieVault({ dir: tmp(), safeStorage: fakeSS(), noSqlite: true }); await v.init();
    await v.save({ agentId: 'claude', accountId: 'a', domain: 'claude.ai', cookies: [{ name: 'x' }, { name: 'y' }] });
    const m = v.accountMeta('claude', 'a'); assert.ok(m.stored); assert.strictEqual(m.count, 2);
    assert.strictEqual(v.deleteAccountCookies('claude', 'a').removed, 1);
    assert.strictEqual(v.accountMeta('claude', 'a').stored, false);
    assert.deepStrictEqual(await v._loadAccountCookies('claude', 'a'), []);
  });
  await test('CV-03', 'a cookie file written with the legacy key survives the key upgrade', async () => {
    const dir = tmp();
    const legacy = new CookieVault({ dir, noSqlite: true }); // before init(): legacy key
    await legacy.save({ agentId: 'chatgpt', accountId: 'b', domain: 'chatgpt.com', cookies: [{ name: '__Secure-next-auth.session-token' }] });
    const upgraded = new CookieVault({ dir, safeStorage: fakeSS(), noSqlite: true }); await upgraded.init();
    assert.strictEqual((await upgraded._loadAccountCookies('chatgpt', 'b'))[0].name, '__Secure-next-auth.session-token');
  });
  await test('CV-04', 'file-store snapshots survive a restart: readable by version, and new ones never overwrite old ones', async () => {
    const dir = tmp(); const ses = { cookies: { get: async () => [{ name: 'a' }] } };
    const v = new CookieVault({ dir, safeStorage: fakeSS(), noSqlite: true }); await v.init();
    await v.snapshot('claude', ses); await v.snapshot('claude', ses);
    const v2 = new CookieVault({ dir, safeStorage: fakeSS(), noSqlite: true }); await v2.init(); // fresh process: empty memory cache
    assert.strictEqual((await v2._loadSnapshot('claude', 1)).length, 1);
    assert.strictEqual(v2._nextVersion('claude'), 3, 'was 1 after restart — overwrote claude-1.json');
  });
  await test('PV-01', 'password vault: sealed key, list() never exposes the password, get() decrypts', () => {
    const pv = new PasswordVault({ dir: tmp(), safeStorage: fakeSS() }); pv.load();
    assert.strictEqual(pv.keyStatus().source, 'safeStorage');
    pv.save('https://claude.ai/login', 'j@x.io', 'app-pass');
    assert.ok(!JSON.stringify(pv.list()).includes('app-pass'));
    assert.strictEqual(pv.get('https://claude.ai').find(e => e.username === 'j@x.io').password, 'app-pass');
  });

  console.log('\n  options store: Clear Glass is the account authority');
  const opts = new NexusOptions(); await opts.load();
  const A = opts.createAccount({ label: 'Work', agentKeys: ['claude'] });
  const B = opts.createAccount({ label: 'Personal', agentKeys: ['claude'] });
  const C = opts.createAccount({ label: 'Other', agentKeys: ['chatgpt'] });
  await test('AU-01', 'no default => earliest linked; explicit default wins; clearing restores earliest', () => {
    assert.deepStrictEqual(opts.resolveAccountForDispatch('claude'), { accountId: A.id, source: 'earliest-linked' });
    assert.ok(opts.setDefaultAccount('claude', B.id).ok);
    assert.deepStrictEqual(opts.resolveAccountForDispatch('claude'), { accountId: B.id, source: 'default' });
    assert.strictEqual(opts.resolveDefaultAccountForAgent('claude'), B.id, 'agent-mesh spawn() path agrees with the dispatch path');
    opts.setDefaultAccount('claude', null);
    assert.strictEqual(opts.resolveAccountForDispatch('claude').accountId, A.id);
  });
  await test('AU-02', 'explicit account must exist AND be linked to that provider — never a silent substitute', () => {
    assert.strictEqual(opts.resolveAccountForDispatch('claude', 'nope').code, 'unknown_account');
    assert.strictEqual(opts.resolveAccountForDispatch('claude', C.id).code, 'unknown_account', 'a chatgpt-only account is not a claude account');
    assert.strictEqual(opts.resolveAccountForDispatch('claude', A.id).accountId, A.id);
  });
  await test('AU-03', 'resolution never auto-creates (a remote read must not mint accounts); none => null', () => {
    const before = opts.listAccounts().length;
    assert.deepStrictEqual(opts.resolveAccountForDispatch('gemini'), { accountId: null, source: 'none' });
    assert.strictEqual(opts.listAccounts().length, before);
  });
  await test('AU-04', 'deleting the default account drops the default with it; setDefault links an unlinked agent', () => {
    const D = opts.createAccount({ label: 'Temp', agentKeys: [] });
    opts.setDefaultAccount('perplexity', D.id);
    assert.ok(opts.getAccount(D.id).agentKeys.includes('perplexity'));
    opts.deleteAccount(D.id);
    assert.strictEqual(opts.get().accountDefaults.perplexity, undefined);
  });

  console.log('\n  login portal');
  const E = fakeElectron();
  const vault = new CookieVault({ dir: tmp(), safeStorage: fakeSS(), noSqlite: true }); await vault.init();
  const pv = new PasswordVault({ dir: tmp(), safeStorage: fakeSS() }); pv.load();
  const events = [];
  const portal = new LoginPortal({ options: opts, vault, passwordVault: pv, registry: () => REGISTRY, BrowserWindow: E.BrowserWindow, session: E.session, emit: (t, d) => events.push({ t, d }) });

  await test('LP-01', 'opens the provider sign-in in EXACTLY the partition agent-mesh spawn() uses, sandboxed, no node', async () => {
    const r = await portal.open({ id: A.id, provider: 'claude' });
    const w = E.windows[E.windows.length - 1];
    assert.strictEqual(r.partition, `persist:mesh-claude-${A.id}`);
    assert.strictEqual(w.opts.webPreferences.partition, partitionFor('claude', A.id));
    assert.strictEqual(w.opts.webPreferences.sandbox, true); assert.strictEqual(w.opts.webPreferences.nodeIntegration, false);
    assert.strictEqual(w.url, 'https://claude.ai/login');
    const mesh = fs.readFileSync(path.join(CG, 'src/mesh/agent-mesh.js'), 'utf8');
    assert.ok(mesh.includes('`persist:mesh-${agentKey}-${accountId || \'default\'}`'), 'mesh partition scheme unchanged — the portal and the mesh agree');
    assert.ok(/vault\.restore\(\{ agentId: agentKey, accountId/.test(mesh), 'mesh restores by {agentId: provider, accountId} — the key capture writes');
  });
  await test('LP-02', 'opening again reuses and focuses the same window (idempotent)', async () => {
    const n = E.windows.length;
    const r = await portal.open({ id: A.id, provider: 'claude' });
    assert.ok(r.reused); assert.strictEqual(E.windows.length, n);
  });
  await test('LP-03', 'capture with no cookies fails loudly', async () => {
    const r = await portal.capture({ id: B.id, provider: 'claude' });
    assert.strictEqual(r.ok, false); assert.ok(/sign in first/.test(r.error));
  });
  await test('LP-04', 'capture saves the partition into the vault under {provider, accountId}, links identity, records session', async () => {
    E.session.fromPartition(partitionFor('claude', A.id))._cookies.push({ name: 'sessionKey', value: 's', domain: '.claude.ai' }, { name: 'theme', value: 'd', domain: 'claude.ai' });
    const r = await portal.capture({ id: A.id, provider: 'claude', identity: { email: 'james@rheon.world' } });
    assert.ok(r.ok); assert.strictEqual(r.cookieCount, 2); assert.strictEqual(r.authCookies, 1); assert.ok(r.identity.linked);
    assert.strictEqual((await vault._loadAccountCookies('claude', A.id)).length, 2);
    assert.strictEqual(opts.getAccount(A.id).providerAccounts.claude.accountId, 'james@rheon.world');
    assert.strictEqual(opts.getAccount(A.id).sessions.claude.authCookies, 1);
  });
  await test('LP-05', 'an identity already owned by another account is refused BEFORE anything is written', async () => {
    E.session.fromPartition(partitionFor('claude', B.id))._cookies.push({ name: 'sessionKey', value: 'b' });
    const r = await portal.capture({ id: B.id, provider: 'claude', identity: { email: 'james@rheon.world' } });
    assert.strictEqual(r.ok, false); assert.ok(/already linked/.test(r.error));
    assert.strictEqual(vault.accountMeta('claude', B.id).stored, false, 'vault untouched on refusal');
  });
  await test('LP-06', 'saved sign-in: sealed in the password vault, username only on the account, pre-filled on load, never submitted', async () => {
    const r = portal.saveCredentials({ id: B.id, provider: 'claude', username: 'b@x.io', password: 'pw-123' });
    assert.ok(r.ok);
    assert.ok(!JSON.stringify(opts.getAccount(B.id)).includes('pw-123'));
    await portal.open({ id: B.id, provider: 'claude' });
    const w = E.windows[E.windows.length - 1];
    w.fireWc('did-finish-load'); await new Promise(r => setImmediate(r));
    assert.ok(w.js.length && w.js[0].includes('"pw-123"'), 'fill script carries the credential');
    assert.ok(!/\.submit\(|click\(\)/.test(w.js[0]), 'fill script never submits or clicks');
  });
  await test('LP-07', 'status reports live cookies, vault copy, identity, credential and default', async () => {
    opts.setDefaultAccount('claude', A.id);
    const s = await portal.status({ id: A.id, provider: 'claude' });
    assert.ok(s.portalOpen); assert.strictEqual(s.liveCookies, 2); assert.ok(s.vault.stored); assert.strictEqual(s.identity.accountId, 'james@rheon.world'); assert.ok(s.isDefault);
    const sb = await portal.status({ id: B.id, provider: 'claude' });
    assert.strictEqual(sb.credential.username, 'b@x.io');
  });
  await test('LP-08', 'sign out clears the partition AND the vault copy (the mesh cannot restore it) and closes the window', async () => {
    const r = await portal.signOut({ id: A.id, provider: 'claude' });
    assert.ok(r.ok); assert.strictEqual(r.vaultRemoved, 1);
    assert.strictEqual(E.session.fromPartition(partitionFor('claude', A.id))._cookies.length, 0);
    assert.strictEqual(vault.accountMeta('claude', A.id).stored, false);
    assert.ok(!portal.list().some(p => p.id === A.id));
    assert.ok(opts.getAccount(A.id).providerAccounts.claude, 'identity kept unless forgetIdentity');
  });
  await test('LP-09', 'unknown provider/account fail with codes; grok (no provider identity) captures cookies without linking', async () => {
    await assert.rejects(portal.open({ id: A.id, provider: 'nope' }), /unknown provider/);
    await assert.rejects(portal.open({ id: 'nope', provider: 'claude' }), /no account/);
    const G = opts.createAccount({ label: 'G', agentKeys: ['grok'] });
    E.session.fromPartition(partitionFor('grok', G.id))._cookies.push({ name: 'sso', value: 'x' });
    const r = await portal.capture({ id: G.id, provider: 'grok', identity: { email: 'g@x.io' } });
    assert.ok(r.ok); assert.strictEqual(r.identity.linked, false, 'linkProviderAccount refuses grok honestly; the session is still saved');
  });

  console.log('\n  guardian asks Clear Glass');
  const { createClearGlassAccountAuthority } = require(path.join(ROOT, 'guardian/lib/cg-account-authority.js'));
  const { createAgentRegistry } = require(path.join(ROOT, 'guardian/lib/agent-registry.js'));
  const { createLadder } = require(path.join(ROOT, 'guardian/lib/dispatch-ladder.js'));
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/accounts/resolve') { res.writeHead(404); return res.end('{}'); }
    const r = opts.resolveAccountForDispatch(u.searchParams.get('provider'), u.searchParams.get('account'));
    res.writeHead(r.error ? 404 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.error ? { ok: false, error: r.error, code: r.code } : { ok: true, ...r }));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const auth = createClearGlassAccountAuthority({ port });
  await test('GA-01', 'resolves the Clear Glass default over real HTTP', async () => {
    opts.setDefaultAccount('claude', B.id);
    assert.strictEqual(await auth.resolve('claude'), B.id);
    assert.strictEqual(await auth.resolve('claude', A.id), A.id);
  });
  await test('GA-02', 'unknown explicit account => code unknown_account; Clear Glass down => authority_unreachable', async () => {
    await assert.rejects(auth.resolve('claude', 'nope'), e => e.code === 'unknown_account');
    await assert.rejects(createClearGlassAccountAuthority({ port: 1 }).resolve('claude'), e => e.code === 'authority_unreachable');
  });
  const ladderWith = (authority, sends) => {
    const calls = [];
    const registry = createAgentRegistry({ dir: tmp(), accountAuthority: authority });
    const mesh = { send: async (a) => { calls.push(a); return sends.shift() || { ok: true, sent: true, text: 'hi' }; }, diagnose: async () => ({ ok: false }) };
    return { ladder: createLadder({ registry, mesh, picker: { request: async () => {} }, mode: () => 'mesh-first' }), calls };
  };
  await test('GA-03', 'ladder dispatches with the Clear Glass account id and its mesh partition/agent id', async () => {
    const { ladder, calls } = ladderWith(auth, []);
    const r = await ladder.attempt({ id: 'j', provider: 'claude', prompt: 'p' });
    assert.strictEqual(r.kind, 'complete'); assert.strictEqual(calls[0].accountId, B.id); assert.strictEqual(calls[0].agentId, `mesh-claude-${B.id}`);
  });
  await test('GA-04', 'Clear Glass unreachable => documented NCP fallback with its reason, never a silent default account', async () => {
    const { ladder, calls } = ladderWith(createClearGlassAccountAuthority({ port: 1 }), []);
    const r = await ladder.attempt({ id: 'j', provider: 'claude', prompt: 'p' });
    assert.strictEqual(r.kind, 'ncp'); assert.strictEqual(r.reason, 'account_authority_unreachable'); assert.strictEqual(calls.length, 0);
  });
  await test('GA-05', 'explicit unknown account on a job fails it loudly through the authority', async () => {
    const { ladder } = ladderWith(auth, []);
    const r = await ladder.attempt({ id: 'j', provider: 'claude', prompt: 'p', accountId: 'nope' });
    assert.strictEqual(r.kind, 'failed'); assert.strictEqual(r.reason, 'unknown_account');
  });
  await test('GA-06', 'guardian/server.js wires the Clear Glass authority into its registry', () => {
    assert.ok(/createAgentRegistry\(\{ accountAuthority: require\('\.\/lib\/cg-account-authority'\)/.test(fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8')));
    assert.ok(/ipcBridge\.app\.get\('\/accounts\/resolve'/.test(fs.readFileSync(path.join(CG, 'src/main/index.js'), 'utf8')), 'Clear Glass serves the route guardian calls');
  });
  srv.close();

  console.log('\n  preload + bridge');
  await test('PB-01', 'preload declares `macros` exactly once (the duplicate key made brainos pass {} as agentId)', () => {
    const src = fs.readFileSync(path.join(CG, 'src/preload/index.js'), 'utf8');
    assert.strictEqual((src.match(/^\s{2}macros: \{/gm) || []).length, 1);
  });
  await test('PB-02', 'every new preload channel has a real ipcMain handler', () => {
    const pre = fs.readFileSync(path.join(CG, 'src/preload/index.js'), 'utf8'), br = fs.readFileSync(path.join(CG, 'src/ipc/bridge.js'), 'utf8');
    const chans = [...pre.matchAll(/invoke\('((?:accounts:(?:portal:\w+|setDefault|defaults|resolve))|vault:status|macros:(?:create|delete|schema))'/g)].map(m => m[1]);
    assert.ok(chans.length >= 15, `found ${chans.length}`);
    for (const c of chans) assert.ok(br.includes(`ipcMain.handle('${c}'`), `no handler for ${c}`);
  });
  await test('PB-03', 'main process builds the LoginPortal with the SAME vault/options the mesh uses and hands it to the bridge', () => {
    const src = fs.readFileSync(path.join(CG, 'src/main/index.js'), 'utf8');
    assert.ok(/new LoginPortal\(\{\s*options: nexusOptions, vault, passwordVault, registry: \(\) => mesh\.getRegistry\(\)/.test(src));
    assert.ok(/copilot,\s*loginPortal,\s*\}\);/.test(src));
    assert.ok(/new AgentMesh\(\{ ctxMgr, driver, vault, accounts: nexusOptions/.test(src));
  });

  console.log('\n  settings UI (jsdom)');
  let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (_) { console.log('  (jsdom not installed — UI checks skipped, not passed)'); }
  if (JSDOM) {
    const html = fs.readFileSync(path.join(CG, 'renderer/settings.html'), 'utf8');
    await test('UI-01', 'CSP: script-src is \'self\' only; no inline <script>; every section is its own file', () => {
      const csp = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?script-src([^;]*);/)[1];
      assert.ok(!csp.includes('unsafe-inline'));
      const tags = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>/g)];
      assert.ok(tags.length && tags.every(t => /\bsrc=/.test(t[1])), 'every <script> is external');
      const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
      assert.ok(srcs.length >= 9); for (const s of srcs) assert.ok(fs.existsSync(path.join(CG, 'renderer', s)), s);
    });
    await test('UI-02', 'no innerHTML/insertAdjacentHTML anywhere in the settings UI (labels/emails/titles are user data)', () => {
      const dir = path.join(CG, 'renderer/settings');
      const files = [...fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'sections')).map(f => path.join(dir, 'sections', f))];
      for (const f of files) assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(fs.readFileSync(f, 'utf8')), f);
    });

    // in-memory ClearGlass backed by the REAL options store + a fake portal
    function makeWindow() {
      const dom = new JSDOM(html.replace(/<script src="[^"]+"><\/script>/g, ''), { url: 'http://localhost/settings.html', runScripts: 'outside-only', pretendToBeVisual: true });
      const w = dom.window;
      const calls = [];
      const o2 = opts;
      const ok = (v) => Promise.resolve(v);
      w.fetch = async (url, init = {}) => {
        calls.push(['fetch', url, init.method || 'GET']);
        const u = String(url);
        const body = u.includes('/automation/workflows') ? { ok: true, workflows: [{ id: 'w1', name: 'Digest', status: 'active', steps: [{ id: 's1', type: 'trigger', config: { intervalMs: 60000 } }, { id: 's2', type: 'agent', config: { agentKey: 'claude', prompt: 'summarise' } }], runCount: 2, lastRun: Date.now() }] }
          : u.includes('/automation/log') ? { ok: true, log: [{ ts: Date.now(), workflowName: 'Digest', msg: 'ran', status: 'ok' }] }
          : u.includes('/agent-mesh/routes') ? { ok: true, routes: [{ id: 'r1', from: 'claude', to: 'chatgpt', kind: 'pipeline' }] }
          : u.includes('/eros/health') ? { ok: false, state: 'disconnected' }
          : u.includes('/contract') ? { version: '3.10.0', components: [{ id: 'cg.x', route: { method: 'IPC', path: 'x' } }] }
          : { ok: true };
        return { ok: true, status: 200, json: async () => body };
      };
      if (!w.AbortSignal.timeout) w.AbortSignal.timeout = () => undefined;
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async () => {} } });
      w.ClearGlass = {
        window: { closeSettings: () => calls.push(['close']), list: () => ok({ windows: ['agent-1'], bgTabs: [] }) },
        bgTabs: { list: () => ok([]) },
        accounts: {
          list: () => ok(o2.listAccounts()), create: (p) => { calls.push(['create', p]); return ok(o2.createAccount(p)); },
          update: (id, u) => ok(o2.updateAccount(id, u)), delete: (id) => ok(o2.deleteAccount(id)), unlinkAgent: (id, k) => ok(o2.unlinkAgent(id, k)),
          defaults: () => ok({ ...(o2.get().accountDefaults || {}) }), setDefault: (k, id) => ok(o2.setDefaultAccount(k, id)),
          portal: { providers: () => ok(REGISTRY.map(r => ({ ...r, loginUrl: r.url }))), status: (id, p) => portal.status({ id, provider: p }).catch(e => ({ ok: false, error: e.message })),
            open: (id, p) => { calls.push(['open', id, p]); return ok({ ok: true }); }, capture: () => ok({ ok: true, cookieCount: 3, authCookies: 1 }), credentials: () => ok({ ok: true }), signOut: () => ok({ ok: true }) },
        },
        vault: { status: () => ok({ cookies: vault.keyStatus(), passwords: pv.keyStatus() }) },
        options: { get: () => ok(o2.get()), set: (p) => ok(o2.set(p)) },
        toolbar: { commands: () => ok(require(path.join(CG, 'src/toolbar/commands.js')).TOOLBAR_COMMANDS || []) },
        providers: { list: () => ok([{ id: 'claude', name: 'Claude', url: 'https://claude.ai', running: true, status: 'loaded', color: '#cc785c' }]), start: () => ok({}), stop: () => ok({}), show: () => ok({}), deploy: () => ok({}) },
        context: { switchFingerprint: (d) => ok({ ok: true, agentId: d.agentId, mode: d.mode, ua: 'UA' }) },
        mesh: { list: () => ok({ registry: REGISTRY, agents: [{ key: 'claude', contextId: 'mesh-claude-x', accountId: A.id, status: 'idle', health: 90, taskCount: 1, lastUsed: Date.now() }], queueDepth: 0 }) },
        macros: { list: () => ok({ ok: true, macros: [{ name: 'apply', urlPattern: null, steps: 2, params: ['name'], runCount: 0, lastRunAt: null }] }), schema: () => ok({ ok: true, actions: ['navigate', 'click', 'type'], erosActions: ['click'], profiles: ['precise'] }), create: (p) => { calls.push(['macro.create', p]); return ok({ ok: true }); }, get: () => ok({ ok: true, macro: { steps: [] } }), delete: () => ok({ ok: true }) },
        customAgents: { list: () => ok([]) }, listeners: { list: () => ok([]) }, calltos: { list: () => ok([]) },
        downloads: { list: () => ok([]), listListeners: () => ok([]), clearCompleted: () => ok({}) },
        plugins: { list: () => ok([{ id: 'zoom', name: 'zoom', version: '1.0.0', state: 'active', contributions: [] }]) },
        webext: { list: () => ok({ ok: true, extensions: [{ id: 'x1', name: 'Blocker', version: '1.0', manifestVersion: 3, permissions: ['storage'], enabled: true, loadedIn: 2, owned: true, dir: '/x' }] }) },
        copilot: { hat: () => ok({ ok: true, exists: true, name: 'clear_glass', baseAgent: 'copilot', personaPrompt: 'P', uuid: '00000000-0000-4000-8000-000000000000' }) }, userscripts: { list: () => ok([{ id: 'u', name: 'guardian-claude', enabled: true, matches: ['*'], readOnly: true }]) },
        autofill: { listProfiles: () => ok([{ id: 'p1', label: 'Jobs', fields: { email: 'j@x.io' }, documents: {}, updatedAt: Date.now() }]) },
        api: { get: () => ok({ ipcPort: 7702, hasFallbackKey: false }), set: () => ok({ ok: true }) },
        passwords: { list: () => ok(pv.list()) }, siteSettings: { listOrigins: () => ok([]) }, history: {},
        errors: { recent: () => ok({ ok: true, errors: [] }) }, speech: { available: () => ok({ ok: false }) },
      };
      for (const s of [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])) w.eval(fs.readFileSync(path.join(CG, 'renderer', s), 'utf8'));
      return { w, calls };
    }
    const settle = () => new Promise(r => setTimeout(r, 60));
    let made; try { made = makeWindow(); } catch (e) { console.error('makeWindow failed:', e && (e.stack || e.message || e.name)); throw e; }
    const { w, calls } = made;
    await settle();

    await test('UI-03', 'boots on Accounts: a pane per provider with its colour, a + each, real account ids shown', () => {
      const panes = [...w.document.querySelectorAll('#main .pane.prov')];
      assert.strictEqual(panes.length, REGISTRY.length);
      assert.ok(panes[0].style.getPropertyValue('--prov'));
      assert.strictEqual(w.document.querySelectorAll('#main .plus').length, REGISTRY.length);
      assert.ok(w.document.body.textContent.includes(A.id), 'the account id itself is visible');
      assert.ok(!w.document.querySelector('.err-box'), w.document.querySelector('.err-box') && w.document.querySelector('.err-box').textContent);
    });
    await test('UI-04', '+ on a provider creates an account linked to it (real options.createAccount)', async () => {
      const before = opts.listAccounts().length;
      w.document.querySelectorAll('#main .plus')[1].click(); await settle();
      const create = [...w.document.querySelectorAll('.modal button')].find(b => b.textContent === 'Create account');
      create.click(); await settle();
      const c = calls.find(x => x[0] === 'create');
      assert.ok(c && c[1].agentKeys.includes('chatgpt'));
      assert.strictEqual(opts.listAccounts().length, before + 1);
      const cancel = [...w.document.querySelectorAll('.modal button')].find(b => b.textContent === 'Cancel'); cancel && cancel.click();
      await settle();
    });
    await test('UI-05', 'every section renders without an error box against the fake backend', async () => {
      const ids = [...w.document.querySelectorAll('.rail-item')].map(b => b.dataset.id);
      assert.deepStrictEqual(ids, ['accounts', 'providers', 'fingerprint', 'mesh', 'automation', 'macros', 'eros', 'suite', 'general', 'autofill', 'privacy', 'downloads', 'connections', 'copilot', 'diagnostics', 'plugins']);
      for (const id of ids) {
        w.CGS.show(id); await settle(); await settle();
        const err = w.document.querySelector('#main .err-box');
        assert.ok(!err, `${id}: ${err && err.textContent}`);
        assert.ok(w.document.querySelector('#main h1').textContent.length);
      }
    });
    await test('UI-06', 'macro step builder creates through macros.create with real browser_action steps', async () => {
      w.CGS.show('macros'); await settle();
      [...w.document.querySelectorAll('#main button')].find(b => b.textContent === 'New macro').click(); await settle();
      const m = w.document.querySelector('.modal');
      m.querySelector('input[type=text]').value = 'test-macro';
      const stepInputs = m.querySelectorAll('.step input[type=text]');
      stepInputs[0].value = 'https://example.com';
      [...m.querySelectorAll('button')].find(b => b.textContent === 'Create macro').click(); await settle();
      const c = calls.find(x => x[0] === 'macro.create');
      assert.ok(c, 'create called'); assert.strictEqual(c[1].name, 'test-macro');
      assert.strictEqual(JSON.stringify(c[1].steps[0]), JSON.stringify({ action: 'navigate', data: { url: 'https://example.com' } }), 'cross-realm object, compared as data');
    });
    await test('UI-07', 'search narrows the rail; Enter jumps to the first match', async () => {
      const s = w.document.getElementById('search'); s.value = 'erosmancer'; s.dispatchEvent(new w.Event('input'));
      const visible = [...w.document.querySelectorAll('.rail-item:not(.dim)')].map(b => b.dataset.id);
      assert.deepStrictEqual(visible, ['macros', 'eros']);
      s.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' })); await settle();
      assert.strictEqual(w.location.hash, '#macros');
    });
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
