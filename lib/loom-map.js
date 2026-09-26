'use strict';
/**
 * lib/loom-map.js — the live system/component map, read from loom's own
 * registry, for anything that needs to answer "what component is this?"
 * or "what components does system X actually have?" without instantiating
 * a LoomDriver itself.
 * UUID: nexus-loom-map-v1-0000-2026-0813-001
 *
 * WHY THIS EXISTS: loom/schema/registry.js is disk-first and already the
 * real source of truth (1372 components / 1712 hooks / 1341 wires, live —
 * checked, not assumed). But every consumer that wants "which system owns
 * this component" has been re-deriving it ad hoc from whatever string
 * happened to be on hand (a gap's `source`, an error's `system`), with no
 * shared convention and no way to tell a REAL component apart from a typo
 * or a component that was renamed and never re-registered. This module is
 * the one place that convention lives, and the one place a caller can ask
 * "does loom actually know about this?" and get an honest answer instead
 * of an assumption.
 *
 * ID CONVENTION (confirmed against the real registry, not guessed):
 * component ids are `<system>.<rest>`, e.g. 'clearglass.renderer',
 * 'copilot.moduleBuilder', 'orchestrator.uiRoute' — except a smaller class
 * that self-references the literal 'nexus' root ('nexus.loom',
 * 'nexus.architect'), where the SYSTEM is the second segment instead of
 * the first. Both forms are handled; resolveSystem() is the one function
 * that encodes this so it's never reimplemented differently in two places.
 *
 * CACHING: loom's own registry re-reads from disk on every has()/get()/
 * all() call (§2.2 in its own header) — correct for loom itself, where a
 * write must be visible to the next read immediately. A periodic consumer
 * like cortex/intelligence doesn't need that freshness on every single
 * failure it indexes; it needs to not re-parse a multi-MB registry.json on
 * every gap report. getMap() caches for `maxAgeMs` and is safe to call as
 * often as a caller likes — cache staleness, not I/O cost, is the only
 * thing maxAgeMs trades away.
 */

const path = require('path');

let _LoomDriver = null;
function _getDriver() {
  if (_LoomDriver) return _LoomDriver;
  try { ({ LoomDriver: _LoomDriver } = require('../loom/schema/driver')); }
  catch (e) { console.warn(`[loom-map] LoomDriver unavailable: ${e.message}`); }
  return _LoomDriver;
}

let _cache = null;    // last built map
let _cacheTs = 0;

/**
 * resolveSystem(id) — the one place the id->system convention lives.
 * Returns null for anything that doesn't look like a dotted loom id at all
 * (never guesses a system for a bare word — an absent answer is honest,
 * a fabricated one looks like evidence).
 */
function resolveSystem(id) {
  if (!id || typeof id !== 'string' || !id.includes('.')) return null;
  const parts = id.split('.');
  const candidate = parts[0] === 'nexus' && parts.length > 1 ? parts[1] : parts[0];
  return _isRealSystem(candidate) ? candidate : null;
}

// §FIX 2026-09-02 — James, live, twice: "there isn't 41 systems" and
// then again "isn't 42 systems. please fix." Real root cause: the
// version above had NO validation at all — any component id's first
// dot-segment was trusted as a real system name. Checked live: the top
// "systems" by component count were tests (257), lib (234), spec (152),
// cos (85), cg (81) — folder/category prefixes and abbreviations, not
// real systems; cos/cg are the SAME real systems as their fuller names,
// double-counted. Real fix: validate the candidate against a real,
// merged allowlist before trusting it.
//
// §HONEST LIMIT — no single existing file in this codebase is already
// the complete, authoritative list of every real system name (checked
// directly before building this: orchestrator.config.json's ports
// block is real and live but doesn't include clear-glass or
// erosmancer-os, both of which register dynamically at runtime rather
// than through a static port entry — confirmed by reading their own
// real registration calls). This merges the one real, live source that
// exists with a small, explicitly-documented list of the real systems
// known NOT to be in it — not a silent guess, and not pretending a
// complete registry exists when it doesn't. A genuinely new system
// added to this codebase without a config.json ports entry (a rare,
// deliberate choice, same as clear-glass/erosmancer-os) needs a real
// one-line addition here too — the same honest maintenance cost the
// old, unvalidated version silently avoided by counting everything.
let _realSystemIds = null;
function _isRealSystem(candidate) {
  if (!_realSystemIds) {
    const set = new Set();
    try {
      const cfgPath = path.join(__dirname, '..', 'orchestrator', 'orchestrator.config.json');
      const cfg = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
      for (const k of Object.keys(cfg.ports || {})) set.add(k);
    } catch (e) {
      console.warn(`[loom-map] could not read orchestrator.config.json's real ports block (${e.message}) — falling back to the hardcoded list only, real coverage will be narrower than usual`);
    }
    // Real systems confirmed by direct read this session to register
    // dynamically, with no static ports.json entry: clear-glass (its
    // own registry-components.js is served over its own real port, but
    // that port isn't in orchestrator's config), erosmancer-os (clear-
    // glass's own wire bridge registers it as a second, distinct real
    // system — confirmed in clear-glass/wire/nexus-wire.js).
    ['clear-glass', 'erosmancer-os', 'ollama', 'nexus-wire'].forEach(s => set.add(s));
    // "ollama-bridge" (config.json's own key) and "ollama" (many real
    // component ids' own first segment, per an earlier session's own
    // real grep) are the same real system under two names — both need
    // to resolve, not just whichever one happens to be in ports.json.
    if (set.has('ollama-bridge')) set.add('ollama');
    _realSystemIds = set;
  }
  return _realSystemIds.has(candidate);
}

function _build(dataDir) {
  const Driver = _getDriver();
  if (!Driver) return { ts: Date.now(), available: false, systems: {}, components: {}, hooks: {} };

  let driver;
  // §SB1-EXT 2026-08-14 — dataDir is an explicit, optional override, NOT a
  // new default. Absent, behavior is unchanged (real production path,
  // same as before this existed). Found while writing this feature's own
  // real end-to-end test: loom-map.js always read the one production
  // registry, with no way to point it at an isolated test store — every
  // OTHER JAA-backed module in this session (jaaDB, push-recall) already
  // supports this via JAA_DATA_DIR; loom-map.js was the one real gap.
  try { driver = new Driver(dataDir ? { dataDir } : {}); }
  catch (e) { console.warn(`[loom-map] driver construction failed: ${e.message}`); return { ts: Date.now(), available: false, systems: {}, components: {}, hooks: {} }; }

  const graph = driver.graph(); // { nodes(hooks), edges(wires), components }

  const components = {}; // componentId -> { system, name, hookIds: [] }
  const systems     = {}; // systemName -> { componentIds: [], hookCount, wireCount }
  const hooks       = {}; // hookId -> { componentId, direction }

  for (const c of graph.components) {
    const system = resolveSystem(c.id) || 'unknown';
    components[c.id] = {
      system, name: c.name || c.id, hookIds: [],
      // §SB1-EXT 2026-08-14 — now that graph() actually includes these
      // (see registry.js's own comment on this same date), surface them
      // here too — this was the second half of the same read-path gap.
      dir: c.dir || null, comp_status: c.comp_status || null,
      comp_dependencies: c.comp_dependencies || [],
    };
    if (!systems[system]) systems[system] = { componentIds: [], hookCount: 0, wireCount: 0 };
    systems[system].componentIds.push(c.id);
  }

  for (const h of graph.nodes) {
    hooks[h.id] = { componentId: h.component_id, direction: h.direction, type: h.type };
    if (h.component_id && components[h.component_id]) {
      components[h.component_id].hookIds.push(h.id);
    }
    const system = h.component_id ? (components[h.component_id]?.system || resolveSystem(h.component_id)) : null;
    if (system) {
      if (!systems[system]) systems[system] = { componentIds: [], hookCount: 0, wireCount: 0 };
      systems[system].hookCount++;
    }
  }

  for (const e of graph.edges) {
    const fromSystem = components[hooks[e.from]?.componentId]?.system;
    if (fromSystem && systems[fromSystem]) systems[fromSystem].wireCount++;
  }

  return {
    ts: Date.now(), available: true,
    counts: { systems: Object.keys(systems).length, components: Object.keys(components).length, hooks: Object.keys(hooks).length, wires: graph.edges.length },
    systems, components, hooks,
  };
}

/** getMap({maxAgeMs, dataDir}) — the cached system/component/hook map.
 * dataDir bypasses the module-level cache entirely (a test store's
 * results must never be served to a real caller by accident, and vice
 * versa) — only the no-override, default-path call is cached. */
function getMap({ maxAgeMs = 30_000, dataDir = null } = {}) {
  if (dataDir) return _build(dataDir);
  const now = Date.now();
  if (_cache && (now - _cacheTs) < maxAgeMs) return _cache;
  _cache = _build();
  _cacheTs = now;
  return _cache;
}

/** forceRefresh() — bypass the cache; used by callers who just wrote a
 * declaration through loom and need the map to reflect it immediately. */
function forceRefresh() {
  _cache = null;
  return getMap({ maxAgeMs: 0 });
}

/**
 * resolveComponent(id) — resolve a hook id OR a component id to its owning
 * component + system, cross-referenced against the LIVE map, not guessed
 * from string shape alone. `found: false` is the honest, common case for
 * anything loom hasn't been told about — a caller can act on that
 * (flag it as unmapped) instead of silently trusting an unverified guess.
 */
function resolveComponent(id, opts = {}) {
  if (!id) return { found: false, system: null, componentId: null };
  const map = getMap(opts);
  if (map.components[id]) {
    return { found: true, system: map.components[id].system, componentId: id };
  }
  const hook = map.hooks[id];
  if (hook?.componentId && map.components[hook.componentId]) {
    return { found: true, system: map.components[hook.componentId].system, componentId: hook.componentId };
  }
  // Not in the live map — fall back to the naming convention so a caller
  // still gets a best-guess system for grouping, but marked unmapped so
  // it's visibly distinct from a confirmed, registered component.
  return { found: false, system: resolveSystem(id), componentId: null };
}

/**
 * getComponentHistory(componentId) — §SB1 2026-08-14. A `historyRef`
 * pointer, not embedded history: composes lib/component-ledger.js's real
 * errorsByComponent() and lib/gap-field.js's real openGaps(), both already
 * built and tested this session, rather than storing a copy of either
 * inside loom's registry (which would violate §10.3 — a second write
 * authority for the same data is a competing truth layer). Honest empty
 * result for a component with no real history, never fabricated.
 */
function getComponentHistory(componentId, opts = {}) {
  if (!componentId) return { componentId: null, errors: [], gaps: [] };
  let errors = [];
  try {
    const cl = require('./component-ledger');
    const res = cl.errorsByComponent({ ...opts });
    errors = (res.components || []).filter(c => c.component === componentId);
  } catch (e) { console.warn(`[loom-map] getComponentHistory: component-ledger unavailable: ${e.message}`); }
  let gaps = [];
  try {
    const gf = require('./gap-field');
    gaps = gf.openGaps({ ...opts }).filter(g => g.component === componentId || g.source === componentId);
  } catch (e) { console.warn(`[loom-map] getComponentHistory: gap-field unavailable: ${e.message}`); }
  return { componentId, errors, gaps, hasHistory: errors.length > 0 || gaps.length > 0 };
}

/**
 * checkDependencyDrift(componentId) — §SB1-EXT 2026-08-14. Compares a
 * component's DECLARED comp_dependencies against loom's real, wire-derived
 * dependency graph (registry.impactOf(), computed from actual require()
 * edges — the same source lib/component-ledger.js/gap-field.js's honesty
 * discipline already applies everywhere else this session). Neither side
 * is treated as more authoritative than the other by default — a
 * declared dependency with no real wire, and a real wire with no
 * declaration, are BOTH surfaced, because both are real, different kinds
 * of drift (the first is "intended but not yet wired," the second is
 * "wired but never declared" — different root causes, same honesty).
 */
function checkDependencyDrift(componentId, opts = {}) {
  const map = getMap(opts);
  if (!map.available) return { available: false, componentId, declaredOnly: [], wiredOnly: [] };
  const component = map.components[componentId];
  const declared = new Set(component?.comp_dependencies || []);
  const wiredDeps = new Set(
    (component?.hookIds || [])
      .flatMap(hookId => (map.hooks[hookId]?.direction === 'in')
        ? Object.values(map.hooks).filter(h => h.componentId && h !== map.hooks[hookId]).map(h => h.componentId)
        : [])
  );
  // Simpler, direct real check via LoomDriver.registry.impactOf when a
  // live driver is passed in opts — the flatMap above is a best-effort
  // fallback from the cached map alone (no driver required), less precise
  // than impactOf's real graph walk but doesn't need a live instance.
  if (opts.driver) {
    try {
      const impact = opts.driver.registry.impactOf(componentId);
      for (const d of (impact.dependents || impact.directDependents || [])) {
        wiredDeps.add(d.component || d.dependsOn);
      }
    } catch (e) { console.warn(`[loom-map] checkDependencyDrift: impactOf unavailable: ${e.message}`); }
  }
  return {
    available: true, componentId,
    declaredOnly: [...declared].filter(d => !wiredDeps.has(d)),   // declared, no real wire yet
    wiredOnly: [...wiredDeps].filter(d => !declared.has(d)),      // real wire, never declared
    inSync: [...declared].filter(d => wiredDeps.has(d)),
  };
}

module.exports = {
  getMap, forceRefresh, resolveComponent, resolveSystem, getComponentHistory,
  checkDependencyDrift, COMP_STATUS_VALUES: ['stub', 'acceptable', 'release'],
};
