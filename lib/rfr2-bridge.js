'use strict';
/**
 * lib/rfr2-bridge.js — ESM→CJS bridge for meta/rfr2/*
 * UUID: nexus-rfr2-bridge-v1-0000-2026-0707-jamesbrooks-001
 *
 * §GAP CLOSED (partial) 2026-07-07 — RFR2 confirmed this session as the
 * largest disconnected surface in the codebase: 13 real, built ESM
 * submodules, zero consumers anywhere. docs/raid-simulation-engine.spec
 * already names the exact reason and the exact fix: "Wire
 * computeEventDelta() from rfr2/delta — needs the ESM→CJS adapter (same
 * integration needed for all rfr2 modules, do it once here)". This is
 * that bridge, built once, reusable for all 13 — not a one-off adapter
 * for just `delta`.
 *
 * Every consumer in this codebase so far (cortex/core/raid/, cortex/boot.js,
 * orchestrator.js, etc.) is CJS. Every meta/rfr2/* module is real ESM
 * (`export function`). Node's dynamic `import()` bridges CJS -> ESM
 * (the reverse of the CJS->ESM interop already used this session for
 * idearium/spec-engine/chunk-dispatch.js importing lib/seam/queue.js) —
 * but it's async, so callers get a Promise the first time and a cached
 * synchronous reference after that, matching the same lazy-init pattern
 * meta/crystal-lattice.js's own _getJAA() already uses for its
 * dependency.
 */
const path = require('path');

const _cache = new Map();

/**
 * loadRFR2Module(name) — dynamic-imports meta/rfr2/<name>/index.js once,
 * caches the resolved module namespace, returns it on every subsequent
 * call without re-importing. `name` is the submodule directory
 * (e.g. 'delta', 'enforcement', 'clip') — same 13 real names already on
 * disk, not invented here.
 */
async function loadRFR2Module(name) {
  if (_cache.has(name)) return _cache.get(name);
  const modulePath = path.join(__dirname, '..', 'intelligence', 'rfr2', name, 'index.js');
  const mod = await import(`file://${modulePath}`);
  _cache.set(name, mod);
  return mod;
}

module.exports = { loadRFR2Module };
