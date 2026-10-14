'use strict';
/**
 * clear-glass/src/providers/profile-tabs.js — PF1: an account's own provider tab, in its own session.
 * comp_id: nexus.clear-glass.src.providers.profile-tabs
 * Map: docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec (PF1_profiles_hats_tabs; addendum 2026-10-14)
 *
 * James: "dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a compartment or different
 * profile. that way we can use multiaccount routing." · 2026-10-14: "yes we need to get it all working."
 *
 * The provider's own tab stays as it is: persist:ncp-<provider>, the one session the session hub mirrors, switched between
 * accounts by account-switch (0.60.2/0.60.13 — "providers, accounts, and agent mesh all need to be using the same
 * cookies"). A second account gets its own tab beside it, so the two run at once:
 *   session   persist:ncp-<provider>~<accountId> — never mirrored to the normal tabs, never shared with another account
 *   sign-in   the account's cookies from the vault (vault.restore), put in when the session holds no sign-in yet; after
 *             that the session keeps its own (it is persistent), so a refreshed sign-in is not overwritten by an older one
 *   tab       ProviderHost.start(provider, { agentId: 'profile~<accountId>', partition }) — the userscript's NCP tabId is
 *             the agentId, so Guardian pushes only that account's jobs to it (guardian/lib/profile-lanes.js)
 *
 *   createProfileTabs({ providerHost, vault, options, sessionFor, getProvider, log })
 *     .open(provider, accountId)  → { ok, provider, accountId, tabId, partition, restored?, status } | { ok:false, error }
 *     .list(provider?)             → [{ provider, accountId, tabId, partition, idleMs, visible }]
 *     .close(provider, accountId)  → { ok }
 */
const MODULE_ID = 'clear-glass.provider-profile-tabs';
const VERSION = '1.0.0';
const PROFILE_TAB = 'profile~';   // the same prefix guardian/lib/ncp.js reads (PROFILE_TAB)

const tabIdFor = (accountId) => `${PROFILE_TAB}${accountId}`;
const partitionFor = (provider, accountId) => `persist:ncp-${provider}~${String(accountId).replace(/[^A-Za-z0-9._-]/g, '_')}`;

function createProfileTabs({ providerHost, vault, options, sessionFor, getProvider = () => null, isAuthCookie = null, log = () => {} } = {}) {
  if (!providerHost || !vault || !options || typeof sessionFor !== 'function') throw new Error('profile-tabs needs providerHost, vault, options and sessionFor');
  const _auth = isAuthCookie || (() => { try { return require('../cookies/session-hub').isAuthCookie; } catch (_) { return (c) => /session|auth|token/i.test(String(c && c.name)); } })();
  const _opening = new Map();   // provider:account → the open in flight (one at a time)

  async function _signedIn(ses, provider) {
    let sites = [];
    try { const d = getProvider(provider); sites = [d.url, ...(d.hosts || []).map(h => `https://${h}`)].map(u => { try { return new URL(u).hostname.split('.').slice(-2).join('.'); } catch (_) { return null; } }).filter(Boolean); } catch (_) {}
    try {
      const all = await ses.cookies.get({});
      return all.some(c => _auth(c) && (!sites.length || sites.includes(String(c.domain || '').replace(/^\./, '').split('.').slice(-2).join('.'))));
    } catch (_) { return false; }
  }

  async function _open(provider, accountId) {
    if (!provider || !accountId) return { ok: false, error: 'provider and accountId required' };
    const known = options.resolveAccountForDispatch ? options.resolveAccountForDispatch(provider, accountId) : null;
    if (known && known.error) return { ok: false, error: known.error };
    const saved = (vault.accounts(provider) || []).find(a => a.accountId === accountId) || null;
    const partition = partitionFor(provider, accountId), tabId = tabIdFor(accountId);
    const ses = sessionFor(partition);
    let restored = null;
    if (!(await _signedIn(ses, provider))) {
      if (!saved || !saved.count) return { ok: false, error: `no saved sign-in for account ${accountId} on ${provider} — sign in once as it (the Nexus panel on the ${provider} tab: "save this sign-in as")` };
      const r = await vault.restore({ agentId: provider, accountId, ses, replace: true });
      if (!r.restored) return { ok: false, error: `account ${accountId}: none of its ${r.total} saved cookie(s) could be set (${(r.failed || []).slice(0, 2).join('; ')})` };
      restored = r.restored;
    }
    const st = await providerHost.start(provider, { agentId: tabId, partition, show: false });
    if (st && st.ok === false) return { ok: false, error: st.error || `the ${provider} tab for ${accountId} did not start` };
    log(`[profile-tabs] ${provider} — account ${accountId}'s own tab ${st && st.status === 'already-running' ? 'is running' : 'opened'} (${partition}${restored ? `, ${restored} cookie(s) from the vault` : ', its own sign-in'})`);
    return { ok: true, provider, accountId, tabId, partition, restored, status: (st && st.status) || 'started' };
  }
  function open(provider, accountId) {
    const k = `${provider}:${accountId}`;
    if (_opening.has(k)) return _opening.get(k);
    const p = _open(provider, accountId).finally(() => _opening.delete(k));
    _opening.set(k, p);
    return p;
  }

  function list(provider = null) {
    const rows = typeof providerHost.listAgentTabs === 'function' ? providerHost.listAgentTabs() : [];
    return rows.filter(r => String(r.agentId || '').startsWith(PROFILE_TAB) && (!provider || r.providerId === provider))
      .map(r => { const accountId = String(r.agentId).slice(PROFILE_TAB.length); return { provider: r.providerId, accountId, tabId: r.agentId, partition: partitionFor(r.providerId, accountId), idleMs: r.idleMs, visible: r.visible }; });
  }
  function close(provider, accountId) {
    try { if (typeof providerHost.closeAgentTab === 'function') providerHost.closeAgentTab(provider, tabIdFor(accountId)); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  return { MODULE_ID, VERSION, open, list, close, tabIdFor, partitionFor };
}

module.exports = { MODULE_ID, VERSION, PROFILE_TAB, tabIdFor, partitionFor, createProfileTabs };
