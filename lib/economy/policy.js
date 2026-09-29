'use strict';
/**
 * lib/economy/policy.js — the provider economy's configuration. §0.39.281 EC0.
 * comp_id: nexus.lib.economy.policy
 * UUID: nexus-lib-economy-policy-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-provider-economy-phasemap.spec (EC0).
 *
 * James: "What if we have economy tags for each provider. With staging branches. Like id love an extensive
 * configurable options for this."
 *
 *   tiers       local · free · subscription · metered — what a provider costs you, and so how freely it is used
 *   providers   per provider: tier, enabled, limits { jobsPerHour, jobsPerDay, tokensPerDay, concurrent, minGapMs },
 *               quietHours [from, to] (local hours, may wrap midnight), onLimit: wait | stop | fallback:<provider>
 *   jobTypes    build · chat · plan · manage · heal · wake · automation — which tiers each may use, and which first
 *   stageTiers  output written by a provider in these tiers is STAGED (lib/code-edit.js), never applied directly (EC5)
 *   router      { explore } — how much the learning router tries a less-proven provider (EC4)
 *
 * defaults(providers) builds the starting policy for the providers that exist; normalize(given) bounds every value
 * and names what it dropped; merge(base, patch) applies an edit. Browser accounts (tier subscription) start with
 * conservative limits — automated load on a signed-in account is bounded by default. Pure.
 */

const TIERS = ['local', 'free', 'subscription', 'metered'];
const JOB_TYPES = ['build', 'chat', 'plan', 'manage', 'heal', 'wake', 'automation'];
const ON_LIMIT = /^(wait|stop|fallback:[a-z0-9-]+)$/;
const LIMITS = {
  jobsPerHour:  { min: 0, max: 100000, def: { local: 0, free: 20, subscription: 30, metered: 60 } },   // 0 = no limit
  jobsPerDay:   { min: 0, max: 1000000, def: { local: 0, free: 100, subscription: 200, metered: 500 } },
  tokensPerDay: { min: 0, max: 1e9, def: { local: 0, free: 200000, subscription: 1000000, metered: 500000 } },
  concurrent:   { min: 0, max: 64, def: { local: 0, free: 0, subscription: 0, metered: 0 } },   // 0 = none: guardian's dispatch pool already runs one job per tab
  minGapMs:     { min: 0, max: 3600000, def: { local: 0, free: 20000, subscription: 15000, metered: 0 } },
};

function tierOf(provider) {
  if (provider === 'ollama') return 'local';
  if (provider === 'copilot') return 'local';
  return 'subscription';   // a guardian browser agent on your own signed-in account
}

function _providerDefaults(name) {
  const tier = tierOf(name);
  const limits = {};
  for (const [k, v] of Object.entries(LIMITS)) limits[k] = v.def[tier];
  return { tier, enabled: true, limits, quietHours: null, onLimit: 'wait' };
}

function defaults(providers = []) {
  const p = {};
  for (const n of providers) p[n] = _providerDefaults(n);
  const jobTypes = {};
  for (const t of JOB_TYPES) jobTypes[t] = { tiers: [...TIERS], prefer: null };
  jobTypes.heal.tiers = ['local', 'free', 'subscription'];
  jobTypes.automation.tiers = ['local', 'free', 'subscription'];
  return { version: 1, providers: p, jobTypes, stageTiers: ['local'], router: { explore: 0.15, minRecords: 20 } };
}

function _int(v, { min, max }) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; }
function _hour(v) { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 23 ? n : null; }

/** normalize(given, providers) → { policy, dropped } — a whole policy, every value bounded; unknown keys named */
function normalize(given = {}, providers = []) {
  const base = defaults([...new Set([...providers, ...Object.keys((given && given.providers) || {})])]);
  const dropped = [];
  const out = JSON.parse(JSON.stringify(base));
  for (const [name, pv] of Object.entries((given && given.providers) || {})) {
    if (!/^[a-z0-9-]+$/.test(name)) { dropped.push(`providers.${name}`); continue; }
    const cur = out.providers[name] || _providerDefaults(name);
    if (pv && TIERS.includes(pv.tier)) { if (pv.tier !== cur.tier) { cur.tier = pv.tier; for (const [k, v] of Object.entries(LIMITS)) cur.limits[k] = v.def[pv.tier]; } }
    else if (pv && pv.tier !== undefined) dropped.push(`providers.${name}.tier`);
    if (pv && typeof pv.enabled === 'boolean') cur.enabled = pv.enabled;
    for (const [k, spec] of Object.entries(LIMITS)) {
      if (!pv || !pv.limits || pv.limits[k] === undefined) continue;
      const n = _int(pv.limits[k], spec);
      if (n === null) dropped.push(`providers.${name}.limits.${k}`); else cur.limits[k] = n;
    }
    if (pv && pv.quietHours !== undefined) {
      if (pv.quietHours === null) cur.quietHours = null;
      else if (Array.isArray(pv.quietHours) && pv.quietHours.length === 2 && _hour(pv.quietHours[0]) !== null && _hour(pv.quietHours[1]) !== null) cur.quietHours = [_hour(pv.quietHours[0]), _hour(pv.quietHours[1])];
      else dropped.push(`providers.${name}.quietHours`);
    }
    if (pv && pv.onLimit !== undefined) { if (ON_LIMIT.test(String(pv.onLimit))) cur.onLimit = String(pv.onLimit); else dropped.push(`providers.${name}.onLimit`); }
    out.providers[name] = cur;
  }
  for (const [t, jv] of Object.entries((given && given.jobTypes) || {})) {
    if (!JOB_TYPES.includes(t)) { dropped.push(`jobTypes.${t}`); continue; }
    if (jv && Array.isArray(jv.tiers)) out.jobTypes[t].tiers = jv.tiers.filter(x => TIERS.includes(x));
    if (jv && jv.prefer !== undefined) out.jobTypes[t].prefer = jv.prefer && /^[a-z0-9-]+$/.test(jv.prefer) ? jv.prefer : null;
  }
  if (given && Array.isArray(given.stageTiers)) out.stageTiers = given.stageTiers.filter(x => TIERS.includes(x));
  if (given && given.router) {
    if (given.router.explore !== undefined) { const e = Number(given.router.explore); if (Number.isFinite(e)) out.router.explore = Math.min(1, Math.max(0, e)); else dropped.push('router.explore'); }
    if (given.router.minRecords !== undefined) { const m = _int(given.router.minRecords, { min: 0, max: 100000 }); if (m === null) dropped.push('router.minRecords'); else out.router.minRecords = m; }
  }
  return { policy: out, dropped };
}

/** merge(base, patch, providers) — an edit applied to the stored policy, then normalized */
function merge(base = {}, patch = {}, providers = []) {
  const m = JSON.parse(JSON.stringify(base || {}));
  for (const k of ['providers', 'jobTypes']) {
    m[k] = m[k] || {};
    for (const [n, v] of Object.entries(patch[k] || {})) m[k][n] = { ...(m[k][n] || {}), ...v, ...(v && v.limits ? { limits: { ...((m[k][n] || {}).limits || {}), ...v.limits } } : {}) };
  }
  if (patch.stageTiers) m.stageTiers = patch.stageTiers;
  if (patch.router) m.router = { ...(m.router || {}), ...patch.router };
  return normalize(m, providers);
}

module.exports = { TIERS, JOB_TYPES, LIMITS, tierOf, defaults, normalize, merge, MODULE_ID: 'nexus.lib.economy.policy', VERSION: '1.0.0' };
