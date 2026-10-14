'use strict';
/**
 * guardian/lib/profile-lanes.js — PF1: which tab, and which dispatch lane, a job runs in.
 * component_id: nexus.guardian.lib.profile-lanes
 * Map: docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec (PF1_profiles_hats_tabs; addendum 2026-10-14)
 *
 * James: "dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a compartment or different
 * profile. that way we can use multiaccount routing." · 2026-10-14: "yes we need to get it all working."
 *
 * hat → account is account-routing's (its rules: hat / intent / repo, and the fallback chain). This adds account → tab:
 *   - no account routed, or the account the provider's own tab runs as (or nothing known yet): the provider's own tab,
 *     lane `<provider>` — exactly as before (one tab, switching accounts between jobs).
 *   - another account: that account's profile tab (tabId `profile~<accountId>`, its own session in Clear Glass), lane
 *     `<provider>~<accountId>` — one job at a time per account, accounts in parallel.
 * GUARDIAN_PROFILE_TABS=0 turns it off (every job takes the provider's own tab, as before).
 *
 *   laneFor(job, { accountRouting, enabled }) → { lane, provider, accountId, tabId, profile, why, exhaustedAll? }
 *   tabIdFor(accountId) → 'profile~<accountId>'
 */
const { PROFILE_TAB } = require('./ncp.js');

const MODULE_ID = 'nexus.guardian.lib.profile-lanes';
const VERSION = '1.0.0';

const BROWSER_ONLY = new Set(['browser', 'ollama', 'mistral', 'deepseek-api']);   // not tabs with accounts
const tabIdFor = (accountId) => `${PROFILE_TAB}${accountId}`;
const enabledByEnv = () => process.env.GUARDIAN_PROFILE_TABS !== '0';

function laneFor(job = {}, { accountRouting = null, enabled = enabledByEnv() } = {}) {
  const provider = job && job.provider;
  const own = (why, extra = {}) => ({ lane: provider, provider, accountId: null, tabId: null, profile: false, why, ...extra });
  if (!provider || BROWSER_ONLY.has(provider)) return own('not an account tab');
  if (!enabled) return own('profile tabs are off (GUARDIAN_PROFILE_TABS=0)');
  if (!accountRouting || typeof accountRouting.route !== 'function') return own('no account routing');
  let routed = null;
  try {
    routed = accountRouting.route(job, { log: false });
    if (typeof accountRouting.fallback === 'function') routed = accountRouting.fallback(job, routed);
  } catch (e) { return own(`account routing failed: ${e.message}`); }
  if (routed && routed.exhaustedAll) return own(routed.why, { exhaustedAll: true });
  if (!routed || !routed.accountId) return own('no account routed — the tab as it is signed in');
  const tabAccount = typeof accountRouting.current === 'function' ? accountRouting.current(provider) : null;
  if (!tabAccount) return own(`${routed.why} — the provider tab runs no known account yet, so it takes this one`, { accountId: routed.accountId });
  if (tabAccount === routed.accountId) return own(`${routed.why} — the provider tab's own account`, { accountId: routed.accountId });
  return { lane: `${provider}~${routed.accountId}`, provider, accountId: routed.accountId, tabId: tabIdFor(routed.accountId), profile: true,
    why: `${routed.why} — account ${routed.accountId}'s own tab (the provider tab runs ${tabAccount})` };
}

module.exports = { MODULE_ID, VERSION, laneFor, tabIdFor, enabledByEnv };
