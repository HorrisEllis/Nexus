'use strict';
/**
 * lib/system-manifest.js — One System → One Manifest
 * UUID: nexus-system-manifest-v1-0000-2026-0629-jamesbrooks-001
 * Version: 1.0.0
 *
 * Component + seam + hook + file + API + CLI + wire + intent + context,
 * tagged, per system — built 2026-06-29 from the idearium-as-GitHub
 * discussion. Almost none of this data is new; it already exists across
 * registry-components.js, hooks/<system>.hooks.js, and the foundation
 * spec's interaction_contract. This is the projector, same pattern as
 * descriptor-projector.js's "one descriptor → six projections," scaled to
 * "one system → one manifest."
 *
 * §1.1 — handles both registry shapes found in the tree (bare array via
 * module.exports, and the wrapped {systemId,port,components,events} form)
 * and idearium's ESM `export`/`export default`, which CommonJS require()
 * cannot load — that failure is reported in the manifest, not hidden.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');

function _loadRegistry(systemId) {
  try {
    const mod = require(path.join(ROOT, systemId, 'registry-components.js'));
    if (Array.isArray(mod)) return { components: mod, port: null, events: null };
    if (Array.isArray(mod.components)) return { components: mod.components, port: mod.port || null, events: mod.events || null };
    if (Array.isArray(mod.COMPONENTS)) return { components: mod.COMPONENTS, port: null, events: null };
    return { components: [], port: null, events: null, error: 'registry-components.js loaded but had no recognizable component array' };
  } catch (e) {
    return { components: [], port: null, events: null, error: `require() failed: ${e.message} — likely an ESM-only export (idearium uses 'export'/'export default', not module.exports)` };
  }
}

function _loadHooks(systemId) {
  try {
    const mod = require(path.join(ROOT, 'hooks', `${systemId}.hooks.js`));
    return { hooks: mod.hooks || [], port: mod.port || null };
  } catch (e) {
    return { hooks: [], port: null, error: `require() failed: ${e.message}` };
  }
}

/**
 * buildManifest — the projector itself.
 * @param {string} systemId
 * @returns manifest object — never throws; partial data + named errors
 *          instead, per §1.2 (nothing silently fails).
 */
function buildManifest(systemId) {
  const reg   = _loadRegistry(systemId);
  const hk    = _loadHooks(systemId);

  const components = reg.components.map(c => ({
    id:          c.id,
    name:        c.name || c.id,
    route:       c.route || null,
    description: c.description || '',
    grammar:     c.grammar || [],
    tags:        c.tags || [],
    hooksIn:     c.hooks?.in || [],
    hooksOut:    c.hooks?.out || [],
    status:      'active', // registry has no per-component status field today — neutral default, not fabricated confidence
  }));

  const wires = hk.hooks
    .filter(h => h.type === 'event-bus' || h.type === 'stream')
    .map(h => ({
      id: h.id, name: h.name, from: h.from?.surface, to: h.to?.surface,
      type: h.type, seam: h.seam || null, status: h.status,
    }));

  const apis = components
    .filter(c => c.route)
    .map(c => ({ method: c.route.method, path: c.route.path, componentId: c.id }));

  const cli = components
    .filter(c => c.grammar.length)
    .flatMap(c => c.grammar.map(g => ({ phrase: g, componentId: c.id })));

  const seamTracked = [...components.filter(c => c.hooksOut.length).map(c => c.id),
                       ...hk.hooks.filter(h => h.seam).map(h => h.id)];

  return {
    systemId,
    port: reg.port || hk.port || null,
    generatedAt: new Date().toISOString(),
    counts: { components: components.length, hooks: hk.hooks.length, wires: wires.length, apis: apis.length, cliPhrases: cli.length },
    components,
    hooks: hk.hooks,
    wires,
    apis,
    cli,
    seamTracked,
    files: [`${systemId}/registry-components.js`, `hooks/${systemId}.hooks.js`],
    errors: [reg.error, hk.error].filter(Boolean), // §1.2 — named, not swallowed
  };
}

/**
 * buildAllManifests(systemIds?) — manifest for every system.
 *
 * §BUG FIXED 2026-07-09 — this required `systemIds` but nothing documented
 * that, so `buildAllManifests()` threw "systemIds is not iterable". The module
 * had zero consumers; this is plausibly why. It now defaults to every system
 * in orchestrator.config.json's `ports` block, which AX-010 established as the
 * single source of truth for what systems exist.
 */
function buildAllManifests(systemIds) {
  if (!systemIds) {
    try {
      const nexusConfig = require('./nexus-config');
      systemIds = Object.keys(nexusConfig.getPath('ports', {}) || {});
    } catch (_) { systemIds = []; }
  }
  if (!Array.isArray(systemIds)) throw new Error('[system-manifest] systemIds must be an array of system ids');
  const out = {};
  for (const id of systemIds) {
    // §1.2 — one system that fails to project must not silently drop the rest.
    try { out[id] = buildManifest(id); }
    catch (e) { out[id] = { systemId: id, errors: [String(e.message)] }; }
  }
  return out;
}

module.exports = { buildManifest, buildAllManifests };
