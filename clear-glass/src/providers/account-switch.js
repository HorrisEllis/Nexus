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
 * Which account a job runs as is guardian's choice (guardian/lib/account-routing.js: hat / intent / repo rules); the
 * switch happens here, before the job is typed (guardian/lib/dispatcher.js). The tab's account is kept in the vault's own
 * JAA store (table provider_tab_account) — no cookie leaves the vault unencrypted.
 */
const MODULE_ID = 'clear-glass.provider-account-switch';
const VERSION = '1.0.0';
const T_TAB = 'provider_tab_account';

function createAccountSwitch({ providerHost, vault, options, getProvider = () => null, sessionFor, log = () => {}, now = Date.now, reloadWaitMs = 20000 } = {}) {
  if (!providerHost || !vault || !options || typeof sessionFor !== 'function') throw new Error('account-switch needs providerHost, vault, options and sessionFor');
  const _chain = new Map();   // provider -> the switch in flight (one at a time per provider)

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
    const r = await vault.capture({ agentId: provider, accountId: acct, ses: sessionFor(provider) });
    if (makeCurrent) _setCurrent(provider, acct, 'captured');
    try { options.recordSession && options.recordSession(acct, provider, { capturedAt: now(), cookieCount: r.count, sites: r.sites.slice(0, 20), via: 'provider-tab' }); } catch (_) {}
    log(`[account-switch] ${provider} — the tab's sign-in saved as ${acct}: ${r.count} cookie(s) on ${r.sites.length} site(s)`);
    return { ok: true, provider, accountId: acct, cookies: r.count, sites: r.sites };
  }

  async function _use(provider, accountId, { reason = null } = {}) {
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
    const loads = await Promise.all(_windows(provider).map(w => _reload(w, def && def.url)));
    log(`[account-switch] ${provider} — ${was || '(unknown account)'} → ${accountId}${reason ? ` (${reason})` : ''}: ${r.restored}/${r.total} cookie(s), ${loads.filter(l => l.ok).length}/${loads.length} tab(s) reloaded`);
    return { ok: true, switched: true, provider, accountId, from: was, restored: r.restored, total: r.total, failed: r.failed || [], tabs: loads.length };
  }
  function use(provider, accountId, opts = {}) {
    const prev = _chain.get(provider) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => _use(provider, accountId, opts));
    _chain.set(provider, next);
    next.finally(() => { if (_chain.get(provider) === next) _chain.delete(provider); }).catch(() => {});
    return next;
  }

  function state(provider) {
    return { provider, current: current(provider), saved: vault.accounts(provider),
      known: (options.listAccounts ? options.listAccounts() : []).filter(a => (a.agentKeys || []).includes(provider)).map(a => ({ id: a.id, label: a.label })) };
  }

  return { MODULE_ID, VERSION, current, capture, use, state };
}

module.exports = { MODULE_ID, VERSION, createAccountSwitch };
