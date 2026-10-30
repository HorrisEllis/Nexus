'use strict';
/**
 * clear-glass/src/site-settings/readers.js — each feature reads its site value at its decision point (SP2, 0.60.216).
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-READERS · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP2
 *
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 * install(getProfile) — main gives the one resolver (profile.js siteProfile, through the bridge) once it exists. Until then, or when the
 * resolver throws, every hook returns null and the feature does what it did before (logged once per feature, never silent — §1.2).
 *
 *   autofillFor(url)      → { enabled, profileId } | null
 *   macrosOnLoad(url)     → { enabled, autoRun: [names] } | null
 *   workflowsAllowed(url) → true | false | null
 *   passwordPolicy(url)   → { offer: 'ask'|'never', autofill, accountId } | null
 *   resumeMode(url)       → 'off' | 'scroll' | 'scroll+forms' | null
 *   driverPolicy(url)     → { allowed, navTimeoutMs, waitTimeoutMs, from } | null
 *   meshAgent(url)        → { enabled, agent } | null
 *   guardianPolicy(url)   → { listen, capture } | null
 *   tabMode(url)          → 'site' | 'off' | null   (0.60.273 FG1)
 * Each hook is one siteProfile call; a url that is not an http(s) page reads as null (no site, nothing to change).
 */
let _get = null;
const _warned = new Set();
let _log = (m) => console.warn(m);

function install(getProfile, { log } = {}) { _get = typeof getProfile === 'function' ? getProfile : null; if (log) _log = log; _warned.clear(); }
function installed() { return !!_get; }

function _profile(feature, url) {
  if (!_get || !url || !/^https?:/i.test(String(url))) return null;
  try {
    const p = _get(String(url));
    return p && p.origin ? p : null;
  } catch (e) {
    if (!_warned.has(feature)) { _warned.add(feature); try { _log(`[site-settings] ${feature}: the site profile failed (${e.message}); it behaves as before`); } catch (_) {} }
    return null;
  }
}

function autofillFor(url)      { const p = _profile('autofill', url);  return p ? { enabled: p.autofill.enabled !== false, profileId: p.autofill.profileId || null } : null; }
function macrosOnLoad(url)     { const p = _profile('macros', url);    return p ? { enabled: p.macros.enabled !== false, autoRun: p.macros.enabled === false ? [] : [].concat(p.macros.autoRun || []) } : null; }
function workflowsAllowed(url) { const p = _profile('workflows', url); return p ? p.workflows.enabled !== false : null; }
function passwordPolicy(url)   { const p = _profile('passwords', url); return p ? { offer: p.passwords.offer || 'ask', autofill: p.passwords.autofill !== false, accountId: p.passwords.accountId || null } : null; }
function resumeMode(url)       { const p = _profile('resume', url);    return p ? (p.resume.restore || 'off') : null; }
function meshAgent(url)        { const p = _profile('mesh', url);      return p ? { enabled: p.mesh.enabled !== false, agent: p.mesh.agent || null } : null; }
function guardianPolicy(url)   { const p = _profile('guardian', url);  return p ? { listen: p.guardian.listen !== false, capture: p.guardian.capture !== false } : null; }
function tabMode(url)          { const p = _profile('accessibility', url); return p ? (p.accessibility.tabMode || 'site') : null; }
function driverPolicy(url) {
  const p = _profile('driver', url);
  if (!p) return null;
  return {
    allowed: p.driver.allowed !== false, navTimeoutMs: p.driver.navTimeoutMs, waitTimeoutMs: p.driver.waitTimeoutMs, origin: p.origin,
    from: { allowed: p.from['driver.allowed'], navTimeoutMs: p.from['driver.navTimeoutMs'], waitTimeoutMs: p.from['driver.waitTimeoutMs'] },
  };
}

// 2026-10-30 PL6 — a gate block's timing on this site (src/driver/index.js _gateCheck); PL10 — whether this site's pipelines run
function gatePolicy(url) {
  const p = _profile('gates', url);
  return p ? { settleMs: p.gates.settleMs, timeoutMs: p.gates.timeoutMs } : null;
}
function pipelinesAllowed(url) { const p = _profile('pipelines', url); return p ? p.pipelines.enabled !== false : null; }

module.exports = { install, installed, gatePolicy, pipelinesAllowed, autofillFor, macrosOnLoad, workflowsAllowed, passwordPolicy, resumeMode, driverPolicy, meshAgent, guardianPolicy, tabMode };
