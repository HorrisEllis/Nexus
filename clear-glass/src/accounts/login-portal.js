'use strict';
/**
 * src/accounts/login-portal.js — per-account provider sign-in, wired to the vault
 * UUID: cg-login-portal-v1-0000-0000-000000000032
 *
 * §BUILT 2026-09-23 — James: "login portals like apppassword login to each
 * provider, with a plus to add multiple, which hook into the cookie vault,
 * and create a accountid per account." / "yes clearglass" (Clear Glass owns
 * accounts).
 *
 * The real gap this closes, found mapping it: every downstream piece already
 * existed and nothing fed it. agent-mesh.js spawns a provider tab for an
 * account in partition persist:mesh-<provider>-<accountId> and restores that
 * account's cookies from the CookieVault — but NOTHING in Clear Glass ever
 * opened a provider's sign-in page inside that partition, and the vault only
 * got written after a task had already run (which assumes a login that never
 * happened). This module is the missing first step, and it uses exactly the
 * partition name and vault key the mesh already reads — reuse, not a second
 * session scheme:
 *
 *   + (Settings)       -> options.createAccount()           accountId = uuid
 *   Sign in            -> open(id, provider)                window in persist:mesh-<provider>-<id>
 *   (human signs in once — SSO / magic link / passkey / 2FA are real, not automatable)
 *   Capture session    -> capture(id, provider, identity)   vault.save({agentId:provider, accountId:id})
 *                                                           + linkAgent + linkProviderAccount(identity)
 *   later: mesh.spawn(provider, {accountId:id})  -> same partition, vault.restore() -> signed in
 *
 * "App password": none of Claude / ChatGPT / Gemini / Perplexity issue app
 * passwords. What IS real: optional credentials stored in the PasswordVault
 * (now OS-sealed, src/security/vault-key.js) and PRE-FILLED into the portal's
 * username/password fields. The portal never submits a form on its own — a
 * person presses sign in (§ nothing acts on a real account silently).
 */

const LOGIN_URLS = {
  claude:     'https://claude.ai/login',
  chatgpt:    'https://chatgpt.com/auth/login',
  gemini:     'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2Fapp',
  perplexity: 'https://www.perplexity.ai/',
  mistral:    'https://chat.mistral.ai/',
  deepseek:   'https://chat.deepseek.com/sign_in',
  grok:       'https://grok.com/',
  meta:       'https://www.meta.ai/',
};

// §0.60.13 — one test for "signed in" (src/cookies/session-hub.js): a csrf token or callback-url cookie that a signed-OUT page
// also sets is not a sign-in. AUTH_COOKIE_RE is kept as an export for callers that read it.
const { isAuthCookie, AUTH_COOKIE_RE, canonicalPartition } = require('../cookies/session-hub');
const LOGIN_PATH_RE  = /\/(login|signin|sign_in|sign-in|auth|authenticate|ServiceLogin)(\/|$|\?)/i;

// §0.60.13 — James: "providers, accounts, and agent mesh all need to be using the same cookies." ONE session per provider:
// persist:ncp-<provider>, the provider tab's own. The account is no longer part of the partition name (it was
// persist:mesh-<provider>-<account>, a jar nothing else read); which account the session is signed in as is account-switch's
// (the vault keeps every account's cookies). accountId is accepted and ignored so callers keep their shape.
function partitionFor(provider, _accountId) { return canonicalPartition(provider); }
function legacyPartitionFor(provider, accountId) { return `persist:mesh-${provider}-${accountId}`; }

/** fillScript(username, password) — pre-fill only. Uses the native value setter so React/Vue inputs register it. Never submits. */
function fillScript(username, password) {
  return `(() => {
    const U = ${JSON.stringify(username || '')}, P = ${JSON.stringify(password || '')};
    const set = (el, v) => { if (!el || !v || el.value) return false;
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const vis = (el) => el && el.offsetParent !== null;
    const user = [...document.querySelectorAll('input[type=email],input[autocomplete=username],input[name*=email i],input[id*=email i],input[name=username],input[id=identifierId]')].find(vis);
    const pass = [...document.querySelectorAll('input[type=password]')].find(vis);
    return { user: set(user, U), pass: set(pass, P) };
  })()`;
}

class LoginPortal {
  /**
   * @param {object} d
   * @param {object} d.options        NexusOptions (account authority)
   * @param {object} d.vault          CookieVault
   * @param {object} [d.passwordVault] PasswordVault
   * @param {Function} d.registry     () => AGENT_REGISTRY entries [{id,name,url,color}]
   * @param {Function} d.BrowserWindow electron BrowserWindow (injectable for tests)
   * @param {object} d.session        electron session (fromPartition)
   * @param {Function} [d.emit]       (type, data) => void
   */
  constructor({ options, vault, passwordVault = null, registry, BrowserWindow, session, emit = () => {}, accountSwitch = null, hub = null, log = () => {} } = {}) {
    if (!options || !vault || !registry || !BrowserWindow || !session) throw new Error('LoginPortal needs options, vault, registry, BrowserWindow and session');
    Object.assign(this, { options, vault, passwordVault, registry, BrowserWindow, session, emit, hub, log });
    this._as = typeof accountSwitch === 'function' ? accountSwitch : () => accountSwitch;   // the account switch (lazy: it is made after the portal)
    this.portals = new Map(); // `${provider}:${accountId}` -> { win, openedAt, url }
  }

  _def(provider) {
    const def = (this.registry() || []).find(a => a.id === provider);
    if (!def) throw Object.assign(new Error(`unknown provider "${provider}" — not in the agent-mesh registry`), { code: 'unknown_provider' });
    return def;
  }
  _account(id) {
    const acc = this.options.getAccount(id);
    if (!acc) throw Object.assign(new Error(`no account "${id}"`), { code: 'unknown_account' });
    return acc;
  }
  loginUrl(provider) { return LOGIN_URLS[provider] || this._def(provider).url; }
  _origin(provider) { try { return new URL(this.loginUrl(provider)).origin; } catch (_) { return null; } }
  _key(provider, id) { return `${provider}:${id}`; }
  _ses(provider, id) { return this.session.fromPartition(partitionFor(provider, id)); }
  // 0.60.7 — James: "its saying its not signed in to the account when it is." status() read only this account's own
  // partition (persist:mesh-<provider>-<id>); he signs in in a normal tab (the <webview> in browser.html uses the app's
  // default session) or the provider tab (persist:ncp-<provider>), which it never looked at. _elsewhere() reads those two
  // too, only the provider's own site's cookies, so the status can say where the sign-in is and capture can take it.
  _siteOf(host) { const p = String(host || '').replace(/^\./, '').split('.'); return p.slice(-2).join('.'); }
  _sitesFor(provider) {
    const out = new Set();
    for (const u of [this._def(provider).url, this.loginUrl(provider)]) { try { out.add(this._siteOf(new URL(u).hostname)); } catch (_) {} }
    return [...out];
  }
  _elsewhereSessions(provider) {
    const list = [];
    try { if (this.session.defaultSession) list.push({ key: 'default', where: 'a normal tab', ses: this.session.defaultSession }); } catch (_) {}
    // the provider tab is no longer "elsewhere": it IS the account's session now (and a normal tab is kept equal to it live by
    // the session hub, so this only ever shows a sign-in made before the hub ran)
    return list;
  }
  async _siteCookies(ses, provider) {
    const sites = this._sitesFor(provider);
    const all = await ses.cookies.get({});
    return all.filter(c => sites.includes(this._siteOf(c.domain)));
  }
  async _elsewhere(provider) {
    const out = [];
    for (const s of this._elsewhereSessions(provider)) {
      try { const c = await this._siteCookies(s.ses, provider); if (c.length) out.push({ key: s.key, where: s.where, cookieCount: c.length, authCookies: c.filter(isAuthCookie).length }); }
      catch (_) { /* that session is not available: not listed */ }
    }
    return out;
  }

  providers() {
    return (this.registry() || []).map(d => ({ id: d.id, name: d.name, color: d.color, url: d.url, loginUrl: LOGIN_URLS[d.id] || d.url }));
  }

  /** saveCredentials — optional, sealed in the PasswordVault; the session record keeps the username only. */
  saveCredentials({ id, provider, username, password }) {
    this._account(id); this._def(provider);
    if (!this.passwordVault) return { ok: false, error: 'password vault not available' };
    if (!username || typeof password !== 'string' || !password) return { ok: false, error: 'username and password required' };
    const origin = this._origin(provider);
    const rec = this.passwordVault.save(origin, username, password);
    this.options.recordSession(id, provider, { credential: { origin: rec.origin, username, passwordId: rec.id } });
    return { ok: true, credential: { origin: rec.origin, username } };
  }

  _credentialFor(id, provider) {
    const acc = this.options.getAccount(id);
    const c = acc?.sessions?.[provider]?.credential;
    if (!c || !this.passwordVault) return null;
    try { return (this.passwordVault.get(c.origin) || []).find(e => e.username === c.username) || null; }
    catch (err) { this.emit('accounts.portal.credential.error', { id, provider, error: err.message }); return null; }
  }

  /** open(id, provider) — the sign-in window, in the exact partition the mesh uses. Idempotent: focuses an open one. */
  async open({ id, provider }) {
    const acc = this._account(id); const def = this._def(provider);
    const key = this._key(provider, id);
    const existing = this.portals.get(key);
    if (existing && !existing.win.isDestroyed()) { existing.win.show(); existing.win.focus(); return { ok: true, reused: true, partition: partitionFor(provider, id) }; }

    const partition = partitionFor(provider, id);
    // one session per provider: another account's sign-in window on it is closed (it would sign in to the wrong account), and the
    // session is made ready for THIS account — what it holds is saved first, this account's saved sign-in put in, else cleared
    for (const [k, p] of this.portals) if (k.startsWith(`${provider}:`) && k !== key && !p.win.isDestroyed()) p.win.close();
    const as = this._as();
    // §0.60.51 — James: Google's sign-in window said "We've detected a problem with your cookie settings". Nothing else may touch this
    // jar while the window is open: the provider's own tabs wait at about:blank (account-switch park), the normal tabs' cookies
    // are not copied in (session hub quiet), and the session is Chrome to Google, not Electron (the provider tab already was).
    let releaseQuiet = null; try { releaseQuiet = this.hub && this.hub.quiet ? this.hub.quiet(provider) : null; } catch (_) {}
    try { if (this.hub && this.hub.sessionFor) this.hub.sessionFor(provider); } catch (_) {}
    if (as) { const b = await as.beginSignIn(provider, id, { park: true }); if (!b.ok) { try { releaseQuiet && releaseQuiet(); } catch (_) {} return { ok: false, error: b.error, code: 'session_not_ready' }; } }
    const win = new this.BrowserWindow({
      width: 1100, height: 820, minWidth: 720, minHeight: 560,
      backgroundColor: '#08080d', autoHideMenuBar: true,   // the same dark base as window-frame.js (CS1)
      title: `Sign in — ${def.name} · ${acc.label}`,
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const url = this.loginUrl(provider);
    const entry = { win, openedAt: Date.now(), url, lastUrl: url };
    this.portals.set(key, entry);

    const cred = this._credentialFor(id, provider);
    const wc = win.webContents;
    const tryFill = () => {
      if (!cred || win.isDestroyed()) return;
      wc.executeJavaScript(fillScript(cred.username, cred.password), true)
        .then(r => { if (r && (r.user || r.pass)) this.emit('accounts.portal.prefilled', { id, provider, user: !!r.user, pass: !!r.pass }); })
        .catch(() => { /* cross-origin frame or navigation mid-run: the next load retries */ });
    };
    wc.on('did-finish-load', tryFill);
    wc.on('did-navigate-in-page', tryFill);
    wc.on('did-navigate', (_e, u) => {
      entry.lastUrl = u;
      this.emit('accounts.portal.navigated', { id, provider, url: u, onLoginPage: LOGIN_PATH_RE.test(u) });
    });
    // what happens to Google's cookies while the window is open — names and causes only, never a value (they are secrets)
    const ses = this._ses(provider, id); const seen = []; let offCookies = null;
    try {
      if (ses && ses.cookies && typeof ses.cookies.on === 'function') {
        const onCh = (_e, c, cause, removed) => { if (seen.length < 80 && c && /google|youtube/i.test(String(c.domain || ''))) { seen.push(`${removed ? '-' : '+'}${c.name}(${cause})`); } };
        ses.cookies.on('changed', onCh); offCookies = () => { try { ses.cookies.removeListener('changed', onCh); } catch (_) {} };
      }
    } catch (_) {}
    win.on('closed', () => {
      this.portals.delete(key);
      try { offCookies && offCookies(); } catch (_) {}
      try { releaseQuiet && releaseQuiet(); } catch (_) {}
      try { if (seen.length) this.log(`[login-portal] ${provider} — Google cookie changes while the sign-in window was open: ${seen.join(' ')}`); } catch (_) {}
      Promise.resolve(as && as.endSignIn ? as.endSignIn(provider) : null).catch(() => {});
      this.emit('accounts.portal.closed', { id, provider });
    });

    this.options.linkAgent(id, provider);
    await win.loadURL(url).catch(err => this.emit('accounts.portal.load.error', { id, provider, url, error: err.message }));
    this.emit('accounts.portal.opened', { id, provider, partition, url });
    return { ok: true, reused: false, partition, url, prefill: !!cred };
  }

  /**
   * capture({id, provider, identity?, close?}) — writes the partition's session
   * into the vault under {agentId: provider, accountId: id}. identity =
   * {accountId|email, email?, displayName?}: the provider-side login id,
   * linked through the existing collision-checked linkProviderAccount. The
   * collision check runs BEFORE any write, so a refused identity leaves the
   * vault untouched (never half-captured).
   */
  async capture({ id, provider, identity = null, close = false, from = null }) {
    this._account(id); const def = this._def(provider);
    const ses = this._ses(provider, id);
    const as = this._as();
    const runsAs = as ? as.current(provider) : null;
    if (runsAs && runsAs !== id) return { ok: false, error: `the ${def.name} session is signed in as another account (“${runsAs}”) — press Sign in on this account first, then save` };
    // 0.60.7 — from 'default' | 'ncp': take the sign-in from where he signed in (a normal tab, the provider tab), copy it
    // into this account's own session too, so the account's agent tab is signed in as well
    if (from) {
      const src = this._elsewhereSessions(provider).find(s => s.key === from);
      if (!src) return { ok: false, error: `no session "${from}" to take the sign-in from` };
      const taken = await this._siteCookies(src.ses, provider);
      if (!taken.length) return { ok: false, error: `no ${def.name} cookies in ${src.where} — sign in there first` };
      for (const c of taken) {
        const host = String(c.domain || '').replace(/^\./, '');
        const url = `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`;
        const set = { url, name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite };
        if (!c.hostOnly && c.domain) set.domain = c.domain;
        if (c.expirationDate) set.expirationDate = c.expirationDate;
        try { await ses.cookies.set(set); } catch (_) { /* a cookie Chromium refuses is skipped; the count below says what landed */ }
      }
    }
    const cookies = await ses.cookies.get({});
    if (!cookies.length) return { ok: false, error: `no cookies in ${def.name}'s session for this account — sign in first` };

    const provAccountId = identity && String(identity.accountId || identity.email || '').trim();
    if (provAccountId) {
      const clash = this.options.findAccountByProviderAccountId(provider, provAccountId);
      if (clash && clash.id !== id) return { ok: false, error: `"${provAccountId}" on ${provider} is already linked to "${clash.label}" — unlink it there first` };
    }

    let host; try { host = new URL(def.url).hostname; } catch (_) { host = '*'; }
    await this.vault.save({ agentId: provider, accountId: id, domain: host, cookies });
    const health = await this.vault.checkTokenHealth(provider, ses);
    const authCookies = cookies.filter(isAuthCookie).length;
    this.options.linkAgent(id, provider);
    if (as && authCookies > 0) as.markCurrent(provider, id, 'portal-capture');

    let identityResult = null;
    if (provAccountId) {
      const r = this.options.linkProviderAccount(id, provider, { accountId: provAccountId, email: identity.email || (provAccountId.includes('@') ? provAccountId : null), displayName: identity.displayName || null });
      identityResult = r.error ? { linked: false, error: r.error } : { linked: true, accountId: provAccountId };
    }
    this.options.recordSession(id, provider, { capturedAt: Date.now(), cookieCount: cookies.length, authCookies, expired: health.expired || 0 });
    this.emit('accounts.portal.captured', { id, provider, cookieCount: cookies.length, authCookies });
    if (close) this.close({ id, provider });
    return { ok: true, cookieCount: cookies.length, authCookies, health, identity: identityResult, likelySignedIn: authCookies > 0 };
  }

  async status({ id, provider }) {
    const acc = this._account(id); this._def(provider);
    const portal = this.portals.get(this._key(provider, id));
    let live = 0, auth = 0;
    const as = this._as(); const runsAs = as ? as.current(provider) : null;
    // the one provider session shows as this account's only while it runs as it (else it holds another account's, or nobody's)
    if (!runsAs || runsAs === id) {
      try { const c = await this._siteCookies(this._ses(provider, id), provider); live = c.length; auth = c.filter(isAuthCookie).length; }
      catch (_) { /* session unavailable — reported as zero, not hidden */ }
    }
    const sess = acc.sessions?.[provider] || null;
    return {
      ok: true, id, provider, partition: partitionFor(provider, id), sessionRunsAs: runsAs,
      portalOpen: !!(portal && !portal.win.isDestroyed()), portalUrl: portal?.lastUrl || null,
      liveCookies: live, authCookies: auth,
      elsewhere: await this._elsewhere(provider).catch(() => []),
      vault: this.vault.accountMeta(provider, id),
      identity: acc.providerAccounts?.[provider] || null,
      session: sess ? { capturedAt: sess.capturedAt || null, cookieCount: sess.cookieCount ?? null, authCookies: sess.authCookies ?? null } : null,
      credential: sess?.credential ? { username: sess.credential.username, origin: sess.credential.origin } : null,
      isDefault: this.options.getDefaultAccount(provider) === id,
    };
  }

  close({ id, provider }) {
    const p = this.portals.get(this._key(provider, id));
    if (p && !p.win.isDestroyed()) p.win.close();
    return { ok: true, closed: !!p };
  }

  /** signOut — clears the partition AND the vault copy, so the mesh cannot restore it. forgetIdentity/forgetCredential are explicit. */
  async signOut({ id, provider, forgetIdentity = false, forgetCredential = false }) {
    const acc = this._account(id); this._def(provider);
    this.close({ id, provider });
    // the one provider session is cleared only if it is THIS account's (or nobody's); another account's sign-in is not touched
    const as = this._as(); const runsAs = as ? as.current(provider) : null;
    let cleared = false;
    if (!runsAs || runsAs === id) {
      await this._ses(provider, id).clearStorageData().catch(err => this.emit('accounts.portal.signout.error', { id, provider, error: err.message }));
      if (this.hub) await this.hub.clearNormal(provider).catch(() => {});   // and the normal tabs, which mirror it
      cleared = true;
    }
    const vr = this.vault.deleteAccountCookies(provider, id);
    const cred = acc.sessions?.[provider]?.credential || null;
    if (forgetCredential && cred && this.passwordVault) this.passwordVault.delete(cred.passwordId);
    if (forgetIdentity && acc.providerAccounts?.[provider]) this.options.unlinkProviderAccount(id, provider);
    this.options.recordSession(id, provider, forgetCredential || !cred ? null : { capturedAt: null, cookieCount: 0, authCookies: 0 });
    this.emit('accounts.portal.signedOut', { id, provider });
    return { ok: true, vaultRemoved: vr.removed, sessionCleared: cleared };
  }

  list() {
    return [...this.portals.entries()].filter(([, p]) => !p.win.isDestroyed()).map(([k, p]) => {
      const [provider, id] = k.split(':');
      return { provider, id, openedAt: p.openedAt, url: p.lastUrl };
    });
  }
}

module.exports = { LoginPortal, LOGIN_URLS, partitionFor, legacyPartitionFor, fillScript, AUTH_COOKIE_RE };
