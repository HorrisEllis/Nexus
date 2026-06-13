'use strict';
/**
 * hooks/index.js — NEXUS Hooks Living Registry
 * UUID: nexus-hooks-index-v1-0000-4000
 * Status: pre-release
 * Status: living
 *
 * §A-2  Hooks are the wire. This is the complete map.
 * §A-3  Map before build. This file is read before any system boots.
 * §A-4  Spec is living — every hook change updates its system file.
 *
 * This index:
 *   1. Loads all system hook maps
 *   2. Provides a unified query interface across all systems
 *   3. Seeds the Architect hook registry on boot
 *   4. Exports the SEAM component registry (all hooks with SEAM declarations)
 *
 * To add hooks for a new system:
 *   1. Create hooks/<system>.hooks.js following the same structure
 *   2. Add require() below
 *   3. Add to SYSTEMS map
 * That's it. The registry auto-discovers.
 *
 * SEAM component tracking:
 *   Every hook with a seam: { componentId, intentId } entry is a SEAM-tracked
 *   component. The componentId is stable across versions. The intentId describes
 *   what the component does in the context of a SEAM sequence.
 *   When the spec-compiler emits a SEAM chunk, it assigns the componentId to
 *   the chunk so cortex can track reuse causally — not just by hash.
 */

const guardianHooks   = require('./guardian.hooks');
const cortexHooks     = require('./cortex.hooks');
const orchestratorHooks = require('./orchestrator.hooks');
const idearium        = require('./idearium.hooks');
const architect       = require('./architect.hooks');
const bridge          = require('./bridge.hooks');

const SYSTEMS = {
  guardian:    guardianHooks,
  cortex:      cortexHooks,
  orchestrator: orchestratorHooks,
  idearium,
  architect,
  bridge,
};

// ── Unified query interface ────────────────────────────────────────────────

function allHooks() {
  return canonicalizeHooks(Object.values(SYSTEMS).flatMap(s => s.hooks || []));
}

function bySystem(systemId) {
  return SYSTEMS[systemId]?.hooks || [];
}

function byType(type) {
  return allHooks().filter(h => h.type === type);
}

function byId(id) {
  return allHooks().find(h => h.id === id);
}

function byName(name) {
  return allHooks().find(h => h.name === name);
}

function withSEAM() {
  return allHooks().filter(h => h.seam !== null);
}

function seamByComponent(componentId) {
  return allHooks().filter(h => h.seam?.componentId === componentId);
}

function active() {
  return allHooks().filter(h => h.status === 'active');
}

function summary() {
  const hooks = allHooks();
  const byType = {};
  for (const h of hooks) { byType[h.type] = (byType[h.type]||0) + 1; }
  return {
    total:        hooks.length,
    systems:      Object.keys(SYSTEMS).length,
    active:       hooks.filter(h => h.status === 'active').length,
    deprecated:   hooks.filter(h => h.status === 'deprecated').length,
    seed:         hooks.filter(h => h.status === 'seed').length,
    withSEAM:     hooks.filter(h => h.seam !== null).length,
    byType,
    updatedAt:    new Date().toISOString(),
  };
}

// ── Seed architect registry ────────────────────────────────────────────────
// Called from architect/service.js boot — seeds all hook maps into the
// live Architect hook registry so the UI shows real system hooks, not just
// the 5 built-in seeds.
async function seedArchitectRegistry(registry) {
  if (!registry) return;
  let seeded = 0, skipped = 0;
  for (const hook of active()) {
    // Don't re-register if already present by name
    if (registry.get(hook.name)) { skipped++; continue; }
    try {
      registry.register({
        ...hook,
        schema:  hook.schema || { input:{ type:'object' }, output:{ type:'object' }, errors:[] },
        contract: hook.contract || { axioms:[], sideEffects:[], idempotent:false, replayable:false, snrGated:false },
        causedBy: 'hooks-index.seed',
      });
      seeded++;
    } catch(e) {
      // Validation failure — log but never crash boot
      console.warn(`[hooks/index] §SOFT seed failed for ${hook.name}: ${e.message}`);
    }
  }
  console.log(`[hooks/index] seeded ${seeded} hooks into architect registry (${skipped} already present)`);
  return { seeded, skipped };
}

// ── SEAM component manifest ────────────────────────────────────────────────
// Used by spec-compiler to assign componentIds to SEAM chunks.
// Every chunk knows what component it belongs to and what the intent is.
// Cortex uses this to track reuse causally across sessions.
function seamManifest() {
  return withSEAM().map(h => ({
    hookId:      h.id,
    hookName:    h.name,
    system:      Object.entries(SYSTEMS).find(([,s]) => s.hooks?.some(sh => sh.id === h.id))?.[0] || 'unknown',
    componentId: h.seam.componentId,
    intentId:    h.seam.intentId,
    type:        h.type,
    status:      h.status,
  }));
}

// ── G-A-003: canonicalize webserver hook port declarations ──────────────────
// Ensures every webserver-type hook has a canonical port at hook.config.port
function canonicalizeWebserverHook(hook) {
  if (hook.type !== 'webserver') return hook;
  // Derive canonical port: config.port || to.port || from.port
  const port = hook.config?.port ?? hook.to?.port ?? hook.from?.port ?? null;
  if (port && (!hook.config || hook.config.port === undefined)) {
    return { ...hook, config: { ...(hook.config || {}), port } };
  }
  return hook;
}

function canonicalizeHooks(hooks) {
  return hooks.map(canonicalizeWebserverHook);
}

module.exports = {
  SYSTEMS,
  allHooks,
  bySystem,
  byType,
  byId,
  byName,
  withSEAM,
  seamByComponent,
  active,
  summary,
  seedArchitectRegistry,
  seamManifest,
};
