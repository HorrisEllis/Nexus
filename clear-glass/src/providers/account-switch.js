'use strict';
/**
 * clear-glass/src/providers/account-switch.js — a provider tab runs as the account a job was routed to.
 * comp_id: nexus.clear-glass.src.providers.account-switch
 * UUID: cg-provider-account-switch-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "can we build the actual cookie vault using jaa? that way we can have actual account routing, and
 * hat specific accounts."
 *
 * Each provider has ONE tab (persist:ncp-<provider>; guardian runs its jobs one at a time — dispatch-pool), so running a
 * job as another account means switching that tab's identity between jobs. The cookie vault (src/cookies/vault.js, JAA,
 * encrypted) already keeps cookies per (provider, account); this module uses it:
 *
 *   use(provider, accountId)   the account must be one Clear Glass knows for that provider (NexusOptions — the account
 *                              authority) and must have a saved sign-in. The tab's cookies now are saved under the account
 *                              it was (or, not knowing, as a vault snapshot — nothing is lost), the session's cookies are
 *                              replaced by the routed account's, and the provider's tabs reload. -> { ok, switched, restored }
 *   capture(provider, account) the tab's cookies saved for that account (after a sign-in: the attention panel's "save this
 *                              sign-in as …"), and the tab marked as that account.
 *   current(provider)          which account the tab is signed in as, as far as Nexus knows (null: never told).
 *
 *   sync(provider)             §0.60.12 — the tab runs as the provider's DISPATCH account (the starred one, else the oldest)
 *                              (guardian's per-job routing still switches it for a job; the next sync brings it back): the account's saved sign-in is put in the tab's
 *                              session (before its first load, when ProviderHost asks), and a sign-in the tab already holds
 *                              that the account has not saved is saved to it, not overwritten. Called when the tab starts,
 *                              and when a session is saved, an account is starred, or one is signed out (Accounts & sign-in).
 *   signedOut(provider, id)    the account was signed out on the Accounts page: if the tab runs as it, the tab is signed out too.
 *
 * Which account a job runs as is guardian's choice (guardian/lib/account-routing.js: hat / intent / repo rules); the
 * switch happens here, before the job is typed (guardian/lib/dispatcher.js). The tab's account is kept in the vault's own
 * JAA store (table provider_tab_account) — no cookie leaves the vault unencrypted.
 */
const MODULE_ID = 'clear-glass.provider-account-switch';
const VERSION = '1.2.0';
const T_TAB = 'provider_tab_account';
// §0.60.13 — the one test for "this session is signed in" lives in the session hub (a csrf token / callback-url cookie that a
// signed-OUT page also sets is not a sign-in); the login portal, the hub and this module all use it.
const { isAuthCookie } = require('../cookies/session-hub');
const _siteOf = (host) => String(host || '').replace(/^\./, '').split('.').slice(-2).join('.');

function createAccountSwitch({ providerHost, vault, options, getProvider = () => null, sessionFor, hold = () => () => {}, log = () => {}, now = Date.now, reloadWaitMs = 20000 } = {}) {
  if (!providerHost || !vault || !options || typeof sessionFor !== 'function') throw new Error('account-switch needs providerHost, vault, options and sessionFor');
  const _chain = new Map();   // provider -> the switch in flight (one at a time per provider)

  // the session's cookies are swapped for another account's: the session hub does not mirror that out to the normal tabs
  async function _held(provider, fn) { const release = hold(provider); try { return await fn(); } finally { release(); } }
  const st = () => vault._jaa();
  function current(provider) { const r = st().get(T_TAB, { id: provider }); return r ? r.account : null; }
  function _setCurrent(provider, account, how) { st().upsert(T_TAB, { id: provider, account, how, at: now() }); st().flushAll(); }

  function _known(provider, accountId) {
    const r = options.resolveAccountForDispatch(provider, accountId);
    return r && !r.error ? null : ((r && r.error) || `unknown account ${accountId} for ${provider}`);
  }
  function _saved(provider, accountId) { return (vault.accounts(provider) || []).find(a => a.accountId === accountId) || null; }

  function _windows(provider) {
    const out = [];
    const w = providerHost.windows && providerHost.windows.get(provider);
    if (w && !w.isDestroyed()) out.push(w);
    for (const [k, e] of (providerHost.agentTabs || new Map())) if (k.startsWith(`${provider}::`) && e.win && !e.win.isDestroyed()) out.push(e.win);
    return out;
  }
  function _reload(win, url) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok, why) => { if (done) return; done = true; resolve({ ok, why }); };
      const t = setTimeout(() => finish(false, `no load in ${reloadWaitMs} ms`), reloadWaitMs);
      try { win.webContents.once('did-finish-load', () => { clearTimeout(t); finish(true); }); } catch (_) {}
      Promise.resolve(url ? win.loadURL(url) : win.webContents.reload()).catch(e => { clearTimeout(t); finish(false, e.message); });
    });
  }

  async function capture(provider, accountId, { makeCurrent = true } = {}) {
    const acct = accountId || current(provider);
    if (!acct) return { ok: false, error: `which account is the ${provider} tab signed in as? name one (Clear Glass → Accounts)` };
    const bad = _known(provider, acct);
    if (bad) return { ok: false, error: bad };
    // §0.60.45 — James: "still says signed out." A signed-out tab was saved as the account (72 cookies, none of them a
    // sign-in), so restoring it restored "signed out". A tab with no sign-in cookie on the provider's own site is not saved.
    const auth = await _tabAuth(provider);
    if (!auth.auth) return { ok: false, signedOut: true, error: `the ${provider} tab is not signed in (no sign-in cookie on its site among ${auth.cookies}) — sign in on the page first, then save` };
    const r = await vault.capture({ agentId: provider, accountId: acct, ses: sessionFor(provider) });
    if (makeCurrent) _setCurrent(provider, acct, 'captured');
    try { options.recordSession && options.recordSession(acct, provider, { capturedAt: now(), cookieCount: r.count, sites: r.sites.slice(0, 20), via: 'provider-tab' }); } catch (_) {}
    log(`[account-switch] ${provider} — the tab's sign-in saved as ${acct}: ${r.count} cookie(s) on ${r.sites.length} site(s)`);
    return { ok: true, provider, accountId: acct, cookies: r.count, sites: r.sites };
  }

  async function _use(provider, accountId, { reason = null, reload = true } = {}) {
    if (!accountId) return { ok: false, error: 'accountId required' };
    const bad = _known(provider, accountId);
    if (bad) return { ok: false, error: bad };
    const was = current(provider);
    if (was === accountId) return { ok: true, switched: false, provider, accountId };
    const saved = _saved(provider, accountId);
    if (!saved || !saved.count) return { ok: false, error: `no saved sign-in for account ${accountId} on ${provider} — sign in once as it (the Nexus panel on the ${provider} tab: "save this sign-in as")` };
    const ses = sessionFor(provider);
    // nothing the tab holds now is lost: saved under the account it was, else as a snapshot
    try {
      if (was) await vault.capture({ agentId: provider, accountId: was, ses });
      else await vault.snapshot(provider, ses, `before switching to ${accountId}`);
    } catch (e) { return { ok: false, error: `could not save the tab's current sign-in before switching: ${e.message}` }; }
    const r = await vault.restore({ agentId: provider, accountId, ses, replace: true });
    if (!r.restored) return { ok: false, error: `account ${accountId}: none of its ${r.total} saved cookie(s) could be set (${(r.failed || []).slice(0, 2).join('; ')})` };
    _setCurrent(provider, accountId, 'switched');
    const def = (() => { try { return getProvider(provider); } catch (_) { return null; } })();
    const loads = reload ? await Promise.all(_windows(provider).map(w => _reload(w, def && def.url))) : [];
    log(`[account-switch] ${provider} — ${was || '(unknown account)'} → ${accountId}${reason ? ` (${reason})` : ''}: ${r.restored}/${r.total} cookie(s), ${loads.filter(l => l.ok).length}/${loads.length} tab(s) reloaded`);
    return { ok: true, switched: true, provider, accountId, from: was, restored: r.restored, total: r.total, failed: r.failed || [], tabs: loads.length };
  }
  function use(provider, accountId, opts = {}) {
    const prev = _chain.get(provider) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => _held(provider, () => _use(provider, accountId, opts)));
    _chain.set(provider, next);
    next.finally(() => { if (_chain.get(provider) === next) _chain.delete(provider); }).catch(() => {});
    return next;
  }

  // ── §0.60.12 sync — the Accounts page and the provider tab are one sign-in ───────────────────────────────────────────
  // James (2026-10-13): \"the logins for the agent providers needs to be all the same. the accounts and sign in, isn't wired
  // into the provider tabs in clearglass.\" Before this the Accounts page signed in to persist:mesh-<provider>-<id> and saved
  // it to the vault, the provider tab ran in persist:ncp-<provider>, and only guardian's per-job dispatch ever copied one
  // into the other — so a tab started signed out beside an account that said \"Signed in\".
  async function _tabAuth(provider) {
    // the tab's own sign-in: auth-looking cookies on the provider's own site(s), read from the tab's session
    let sites = [];
    try { const d = getProvider(provider); sites = [d.url, ...(d.hosts || []).map(h => `https://${h}`)].map(u => { try { return _siteOf(new URL(u).hostname); } catch (_) { return null; } }).filter(Boolean); } catch (_) {}
    try {
      const all = await sessionFor(provider).cookies.get({});
      const mine = sites.length ? all.filter(c => sites.includes(_siteOf(c.domain))) : all;
      return { cookies: all.length, auth: mine.filter(isAuthCookie).length };
    } catch (_) { return { cookies: 0, auth: 0 }; }
  }

  /**
   * sync(provider, { reload }) -> { ok, provider, action, accountId?, why? }
   * action: 'restored'  the dispatch account's saved sign-in was put in the tab (tabs reloaded unless reload:false)
   *         'saved'     the tab was signed in and the account had nothing saved: the tab's sign-in was saved to the account
   *         'unchanged' the tab already runs as the dispatch account and holds its sign-in
   *         'skipped'   nothing to do, and why (no account, nothing saved anywhere, the tab runs as another account on purpose)
   */
  async function _sync(provider, { reload = true } = {}) {
    const r = options.resolveAccountForDispatch(provider, null);
    if (!r || r.error) return { ok: false, provider, action: 'skipped', why: (r && r.error) || 'no account authority' };
    const accountId = r.accountId;
    if (!accountId) return { ok: true, provider, action: 'skipped', why: `no ${provider} account yet — add one in Accounts & sign-in` };
    const was = current(provider);
    const tab = await _tabAuth(provider);
    const saved = _saved(provider, accountId);
    const hasSaved = !!(saved && saved.count);

    // §0.60.13 — the tab holds a live sign-in and nothing says whose it is (the session hub just consolidated it from where he
    // really signs in): the live one is the truth, the account's saved copy may be stale (it can say "signed in" while the page
    // says "Log in"). The saved copy is kept as a vault snapshot, then the live sign-in becomes the account's.
    if (hasSaved && !was && tab.auth > 0) {
      try {
        const old = await vault._loadAccountCookies(provider, accountId);
        if (old.length) await vault.snapshot(provider, { cookies: { get: async () => old } }, `“${accountId}” saved sign-in, replaced by the live one`);
      } catch (_) {}
      const c = await capture(provider, accountId);
      return c.ok ? { ok: true, provider, action: 'saved', accountId, cookies: c.cookies, why: `the ${provider} session was already signed in — its sign-in is now “${accountId}”'s (the old saved copy is kept as a snapshot)` } : { ok: false, provider, action: 'skipped', accountId, why: c.error };
    }
    // a sign-in the tab holds that nothing has saved is never overwritten: it becomes the account's
    if (!hasSaved) {
      if (tab.auth > 0 && (!was || was === accountId)) {
        const c = await capture(provider, accountId);
        return c.ok ? { ok: true, provider, action: 'saved', accountId, cookies: c.cookies, why: `the ${provider} tab was signed in and “${accountId}” had no saved sign-in — the tab's was saved to it` } : { ok: false, provider, action: 'skipped', accountId, why: c.error };
      }
      return { ok: true, provider, action: 'skipped', accountId, why: `no saved sign-in for “${accountId}” on ${provider} yet, and the tab is not signed in — sign in once in Accounts & sign-in` };
    }
    if (was === accountId && tab.auth > 0) return { ok: true, provider, action: 'unchanged', accountId };
    const ses = sessionFor(provider);
    if (was && was !== accountId && tab.auth > 0) { try { await vault.capture({ agentId: provider, accountId: was, ses }); } catch (_) {} }
    const rs = await vault.restore({ agentId: provider, accountId, ses, replace: true });
    if (!rs.restored) return { ok: false, provider, action: 'skipped', accountId, why: `none of the ${rs.total} saved cookie(s) for “${accountId}” could be set (${(rs.failed || []).slice(0, 2).join('; ')})` };
    _setCurrent(provider, accountId, 'synced');
    let tabs = 0;
    if (reload) {
      const def = (() => { try { return getProvider(provider); } catch (_) { return null; } })();
      const loads = await Promise.all(_windows(provider).map(w => _reload(w, def && def.url)));
      tabs = loads.length;
    }
    log(`[account-switch] ${provider} — tab now runs as ${accountId} (sync): ${rs.restored}/${rs.total} cookie(s)${reload ? `, ${tabs} tab(s) reloaded` : ''}`);
    return { ok: true, provider, action: 'restored', accountId, from: was, restored: rs.restored, total: rs.total, tabs };
  }
  function sync(provider, opts = {}) {
    const prev = _chain.get(provider) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => _held(provider, () => _sync(provider, opts))).then(r => (r && r.ok === false && !r.error ? { ...r, error: r.why } : r));
    _chain.set(provider, next);
    next.finally(() => { if (_chain.get(provider) === next) _chain.delete(provider); }).catch(() => {});
    return next;
  }

  /** signedOut(provider, accountId) — the Accounts page signed that account out; a tab that runs as it is signed out too */
  async function signedOut(provider, accountId) {
    if (current(provider) !== accountId) return { ok: true, provider, action: 'unchanged', why: `the tab does not run as “${accountId}”` };
    // a sign-out is meant to reach the normal tabs too (the hub mirrors it): not held
    try { await sessionFor(provider).clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'] }); } catch (e) { return { ok: false, provider, action: 'skipped', error: e.message }; }
    try { st().delete(T_TAB, { id: provider }); st().flushAll(); } catch (_) {}
    const def = (() => { try { return getProvider(provider); } catch (_) { return null; } })();
    const loads = await Promise.all(_windows(provider).map(w => _reload(w, def && def.url)));
    log(`[account-switch] ${provider} — “${accountId}” signed out; the tab is signed out too (${loads.length} tab(s) reloaded)`);
    return { ok: true, provider, action: 'signed-out', accountId, tabs: loads.length };
  }


  // ── §0.60.13 one session per provider ────────────────────────────────────────────────────────────────────────────
  // The Accounts sign-in window, the provider tab and the agent mesh tab all run in this one session (session hub), so a
  // sign-in is already in the tab the moment it is made. What is left for this module is WHICH account it is.

  /**
   * beginSignIn(provider, accountId) — the sign-in window is about to open for that account in the one provider session.
   * What the session holds is saved first (under the account it runs as, else as a vault snapshot); the account's own saved
   * sign-in is put in if it has one, else the session is cleared so the account signs in fresh. -> { ok, switched, restored? }
   */
  async function _beginSignIn(provider, accountId) {
    const bad = _known(provider, accountId); if (bad) return { ok: false, error: bad };
    const was = current(provider);
    if (was === accountId) return { ok: true, switched: false, provider, accountId };
    const ses = sessionFor(provider);
    const tab = await _tabAuth(provider);
    try {
      if (was && tab.auth > 0) await vault.capture({ agentId: provider, accountId: was, ses });
      else if (!was && tab.auth > 0) await vault.snapshot(provider, ses, `before signing in as ${accountId}`);
    } catch (e) { return { ok: false, error: `could not save the ${provider} session's current sign-in first: ${e.message}` }; }
    const saved = _saved(provider, accountId);
    let restored = 0;
    if (saved && saved.count) { const r = await vault.restore({ agentId: provider, accountId, ses, replace: true }); restored = r.restored || 0; }
    else { try { await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'] }); } catch (_) {} }
    _setCurrent(provider, accountId, 'signing-in');
    const def = (() => { try { return getProvider(provider); } catch (_) { return null; } })();
    await Promise.all(_windows(provider).map(w => _reload(w, def && def.url)));
    log(`[account-switch] ${provider} — session now “${accountId}” for sign-in (${restored ? `${restored} saved cookie(s) restored` : 'cleared, signs in fresh'}; was ${was || 'unknown'})`);
    return { ok: true, switched: true, provider, accountId, from: was, restored };
  }
  function beginSignIn(provider, accountId) {
    const prev = _chain.get(provider) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => _held(provider, () => _beginSignIn(provider, accountId)));
    _chain.set(provider, next);
    next.finally(() => { if (_chain.get(provider) === next) _chain.delete(provider); }).catch(() => {});
    return next;
  }

  /**
   * settled(provider) — the provider session's cookies stopped changing (session hub). The account it runs as keeps what the
   * session holds: still signed in -> saved to the vault (a token refresh, a sign-in made in a normal tab); every session
   * credential gone -> the session was signed out, so the account's saved sign-in goes too (else the next start would
   * restore it and undo the sign-out). Skipped while a switch is in flight.
   */
  async function settled(provider) {
    if (_chain.has(provider)) return { ok: true, action: 'skipped', why: 'a switch is in flight' };
    const acct = current(provider); if (!acct) return { ok: true, action: 'skipped', why: 'the session is not marked as an account' };
    let tab = await _tabAuth(provider);
    if (tab.auth === 0) { await new Promise(r => setTimeout(r, 2000)); if (_chain.has(provider)) return { ok: true, action: 'skipped', why: 'a switch is in flight' }; tab = await _tabAuth(provider); }
    if (tab.auth > 0) {
      const r = await vault.capture({ agentId: provider, accountId: acct, ses: sessionFor(provider) });
      try { options.recordSession && options.recordSession(acct, provider, { capturedAt: now(), cookieCount: r.count, sites: r.sites.slice(0, 20), via: 'provider-session' }); } catch (_) {}
      return { ok: true, action: 'saved', accountId: acct, cookies: r.count };
    }
    const had = _saved(provider, acct);
    if (had && had.count) {
      vault.deleteAccountCookies(provider, acct);
      try { options.recordSession && options.recordSession(acct, provider, { capturedAt: null, cookieCount: 0, authCookies: 0 }); } catch (_) {}
      log(`[account-switch] ${provider} — signed out in the session; “${acct}”'s saved sign-in removed with it`);
      return { ok: true, action: 'signed-out', accountId: acct };
    }
    return { ok: true, action: 'unchanged', accountId: acct };
  }

  /** markCurrent(provider, accountId, how) — the session was told it runs as that account (a capture made elsewhere) */
  function markCurrent(provider, accountId, how = 'marked') { if (_known(provider, accountId)) return false; _setCurrent(provider, accountId, how); return true; }

  function state(provider) {
    const d = options.resolveAccountForDispatch(provider, null);
    return { provider, current: current(provider), dispatch: d && !d.error ? d.accountId : null, saved: vault.accounts(provider),
      known: (options.listAccounts ? options.listAccounts() : []).filter(a => (a.agentKeys || []).includes(provider)).map(a => ({ id: a.id, label: a.label })) };
  }

  return { MODULE_ID, VERSION, current, capture, use, sync, signedOut, beginSignIn, settled, markCurrent, state };
}

module.exports = { MODULE_ID, VERSION, createAccountSwitch };
