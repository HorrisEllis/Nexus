'use strict';
/**
 * copilot/lib/capabilities.js — co-pilot's real toolbox (§P4 slice)
 * UUID: nexus-copilot-capabilities-v1-0000-2026-0807-001
 *
 * James: "if I ask him what he can do, I want a full list of tools and
 * capability." This answers that from the REAL capability registry (loom's
 * capability-map, 255 declared capabilities checked against source), grouped by
 * system — not a hand-maintained list that drifts. §8.6 composes the existing
 * scanner; §1.1 only reports capabilities whose routes are actually served.
 */

let _cache = null, _cacheAt = 0;
const _CACHE_MS = 60_000;   // the tree doesn't change mid-session; scan at most once a minute

/**
 * whatCanIDo(opts) — the grouped, real toolbox. Returns { systems, total, text }.
 * Cached: verifyRoutes reads the whole source tree (~300ms), which must NOT run
 * synchronously on every co-pilot request — that can stall the request past the
 * UI's fetch timeout ("failed to fetch"). Cached for a minute; the tree is static
 * within a session.
 */
function whatCanIDo(opts = {}) {
  if (!opts.capabilityMap && _cache && (Date.now() - _cacheAt) < _CACHE_MS) return _cache;
  const result = _compute(opts);
  if (!opts.capabilityMap) { _cache = result; _cacheAt = Date.now(); }
  return result;
}

function _compute(opts = {}) {
  let decls, served;
  try {
    const cap = opts.capabilityMap || require('../../loom/scanners/capability-map');
    decls = cap.loadAll();
    ({ served } = cap.verifyRoutes(decls));
  } catch (e) {
    return { systems: {}, total: 0, text: `Capability registry unavailable: ${e.message}` };
  }

  // Group by namespace/system; only capabilities with a served route (§1.1 —
  // don't advertise a tool that nothing actually serves).
  const systems = {};
  let total = 0;
  for (const c of decls) {
    if (opts.servedOnly !== false && served && served.get(c.id) === false) continue;
    const sys = (c.namespace || c.id.split('.')[0] || 'other');
    (systems[sys] = systems[sys] || []).push({ id: c.id, name: c.name, route: `${c.route.method} ${c.route.path}`, description: c.description || '' });
    total++;
  }

  const names = Object.keys(systems).sort();
  const text = `I have ${total} verified capabilities across ${names.length} systems:\n` +
    names.map(s => `• ${s} (${systems[s].length}): ${systems[s].slice(0, 6).map(c => c.name || c.id.split('.').pop()).join(', ')}${systems[s].length > 6 ? '…' : ''}`).join('\n');

  return { systems, total, systemCount: names.length, text };
}

/**
 * capabilitiesForSystem(system, opts) — the detailed toolbox for one system,
 * for "what can cortex do?" style questions.
 */
function capabilitiesForSystem(system, opts = {}) {
  const all = whatCanIDo(opts);
  const list = all.systems[system] || all.systems[system.toLowerCase()] || [];
  return { system, count: list.length, capabilities: list,
    text: list.length ? `${system} has ${list.length} capabilities: ${list.map(c => c.name || c.id.split('.').pop()).join(', ')}.` : `No verified capabilities found for "${system}".` };
}

module.exports = { whatCanIDo, capabilitiesForSystem, MODULE_ID: 'copilot-capabilities', VERSION: '1.0.0' };
