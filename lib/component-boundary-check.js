'use strict';

/**
 * lib/component-boundary-check.js
 *
 * §MCO15 2026-09-13 (Track C — component compiler, boundary detection).
 * cli/find-orphans.js's resolveRequireTarget() walked BACKWARD (who
 * requires this file, for orphan detection). This walks the same real
 * resolution FORWARD instead: given a component's real owned files
 * (component-registry's owns[], MCO15's other addition this pass), what
 * do they actually require, and does any of that cross into a file owned
 * by a DIFFERENT registered component — a real, undeclared architectural
 * boundary crossing, not assumed from either component's stated intent.
 *
 * §HONEST SCOPE — this does NOT yet check for a declared loom hook/wire
 * that would legitimize a cross-component reference (e.g., an intentional,
 * wired integration point). Every cross-component reference found here is
 * reported as a real crossing; deciding which crossings are legitimate
 * (wire-declared) vs. genuine violations is real, separate work this pass
 * did not build — stated plainly rather than silently narrowing the
 * violation list to look more finished than it is.
 */

const path = require('path');
const { getRequireTargets } = require('./require-graph.js');

/**
 * checkComponentBoundary(componentId, componentRegistry) — walks
 * componentId's real owned files' real requires and classifies each
 * resolved target.
 *
 * @param {string} componentId
 * @param {object} componentRegistry - a component-registry.js-shaped
 *   module (get(id), list()) — passed in rather than required directly
 *   so this stays testable against a fake registry, not only the real
 *   singleton.
 * @returns {{ok:true, componentId, internal:string[], external:string[],
 *   crossings:{target:string, ownedBy:string}[]} | {ok:false, reason}}
 */
function checkComponentBoundary(componentId, componentRegistry) {
  const repoRoot = path.resolve(__dirname, '..');
  const component = componentRegistry.get(componentId);
  if (!component) return { ok: false, reason: `no real component registered as "${componentId}"` };
  const owns = Array.isArray(component.owns) ? component.owns : [];
  if (!owns.length) {
    return { ok: false, reason: `"${componentId}" has no real owns[] entries — nothing to check (§1.1, not guessed at)` };
  }

  // Build a real path -> owning-component-id map across every OTHER
  // registered component, so a crossing can be attributed to who
  // actually owns the target, not just flagged as "some other file."
  const ownerOf = new Map();
  const all = typeof componentRegistry.list === 'function' ? componentRegistry.list() : [];
  for (const c of all) {
    if (c.id === componentId || !Array.isArray(c.owns)) continue;
    for (const f of c.owns) ownerOf.set(path.resolve(repoRoot, f), c.id);
  }
  const ownFiles = new Set(owns.map(f => path.resolve(repoRoot, f)));

  const internal = new Set();
  const external = new Set();
  const crossings = [];

  for (const rel of owns) {
    const abs = path.resolve(repoRoot, rel);
    for (const target of getRequireTargets(abs)) {
      if (ownFiles.has(target)) { internal.add(target); continue; }
      if (ownerOf.has(target)) { crossings.push({ target, ownedBy: ownerOf.get(target) }); continue; }
      external.add(target); // real file, but not owned by any registered component — not a crossing
    }
  }

  return {
    ok: true,
    componentId,
    internal: [...internal],
    external: [...external],
    crossings,
  };
}

module.exports = { checkComponentBoundary };
