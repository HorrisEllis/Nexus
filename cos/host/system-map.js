/**
 * host/system-map.js
 * COMPARTMENT OS — Live System Map
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * The system map is always current (COS-7).
 * Updated on every mutation — not batched, not deferred.
 * Persisted to system-map.json after every update.
 * Readable at any time via get() → deep clone.
 *
 * Spec §10: Every variable in the system is listed here.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { makeSystemMap }                  = require('../foundation/types.js');
const { getAxiomDefs }                   = require('../foundation/axioms.js');
const { RUNTIMES }                       = require('../foundation/runtime-enum.js');
const { COMPILERS }                      = require('../foundation/compiler-enum.js');
const { COS_MAP_FILE, COS_STATE_DIR, COS_VERSION } = require('../foundation/constants.js');

// ─── SystemMap ────────────────────────────────────────────────────────────────

class SystemMap {
  /**
   * @param {{ mapFile?: string, eventBus?: object }} opts
   */
  constructor({ mapFile = COS_MAP_FILE, eventBus = null } = {}) {
    this._file     = mapFile;
    this._bus      = eventBus;
    this._map      = makeSystemMap({
      version:   COS_VERSION,
      axioms:    getAxiomDefs(),
      runtimes:  RUNTIMES.map(({ id, displayName, minVersion }) => ({ id, displayName, minVersion })),
      compilers: COMPILERS.map(({ id, displayName, configFile }) => ({ id, displayName, configFile })),
    });
    this._loaded   = false;
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /**
   * Load from disk if file exists, otherwise write empty map.
   * Must be called once before mutations.
   */
  load() {
    const dir = path.dirname(this._file);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this._file)) {
      try {
        const raw = fs.readFileSync(this._file, 'utf8');
        const parsed = JSON.parse(raw);
        // Merge persisted compartments/hooks/pipes into the live map.
        // Runtimes, compilers, axioms are always regenerated from foundation.
        this._map = makeSystemMap({
          ...this._map,
          compartments: parsed.compartments || [],
          hooks:        parsed.hooks        || [],
          pipes:        parsed.pipes        || [],
          files:        parsed.files        || [],
          variables:    parsed.variables    || [],
          plugins:      parsed.plugins      || [],
          // §BUGFIX 2026-09-06: these six fields existed nowhere before —
          // see DEFAULT_SYSTEM_MAP in foundation/types.js for the full story.
          archetypes:         parsed.archetypes         || [],
          blueprintDefs:      parsed.blueprintDefs      || [],
          blueprintInstances: parsed.blueprintInstances || [],
          playgrounds:        parsed.playgrounds        || [],
          vaultKeys:          parsed.vaultKeys          || [],
          vaultdState:        parsed.vaultdState        ?? null,
        });
      } catch (_) {
        // Corrupted map file — regenerate from foundation defaults
      }
    }

    this._loaded = true;
    this._persist();
    return this;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Return a deep clone of the current system map.
   * @returns {object}
   */
  get() {
    return JSON.parse(JSON.stringify({ ...this._map, generatedAt: Date.now() }));
  }

  // ── Compartments ──────────────────────────────────────────────────────────

  /** @param {object} compartment */
  upsertCompartment(compartment) {
    const idx = this._map.compartments.findIndex(c => c.id === compartment.id);
    const clone = JSON.parse(JSON.stringify(compartment));
    if (idx >= 0) {
      this._map.compartments[idx] = clone;
    } else {
      this._map.compartments.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removeCompartment(id) {
    this._map.compartments = this._map.compartments.filter(c => c.id !== id);
    this._touch();
  }

  // ── Hooks ─────────────────────────────────────────────────────────────────

  /** @param {object} hook */
  upsertHook(hook) {
    const idx = this._map.hooks.findIndex(h => h.id === hook.id);
    const clone = JSON.parse(JSON.stringify(hook));
    if (idx >= 0) {
      this._map.hooks[idx] = clone;
    } else {
      this._map.hooks.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removeHook(id) {
    this._map.hooks = this._map.hooks.filter(h => h.id !== id);
    this._touch();
  }

  // ── Pipes ─────────────────────────────────────────────────────────────────

  /** @param {object} pipe */
  upsertPipe(pipe) {
    const idx = this._map.pipes.findIndex(p => p.id === pipe.id);
    const clone = JSON.parse(JSON.stringify(pipe));
    if (idx >= 0) {
      this._map.pipes[idx] = clone;
    } else {
      this._map.pipes.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removePipe(id) {
    this._map.pipes = this._map.pipes.filter(p => p.id !== id);
    this._touch();
  }

  // ── Variables ─────────────────────────────────────────────────────────────

  /** @param {object} variable */
  upsertVariable(variable) {
    const idx = this._map.variables.findIndex(v => v.id === variable.id);
    const clone = JSON.parse(JSON.stringify(variable));
    if (idx >= 0) {
      this._map.variables[idx] = clone;
    } else {
      this._map.variables.push(clone);
    }
    // Variables are considered "metadata" — no touch() to avoid
    // spam-persisting on every variable registration at boot.
  }

  // ── Archetypes ────────────────────────────────────────────────────────────
  // §BUGFIX 2026-09-06: added — host/gates/archetype.js and
  // archetype/index.js both call this; see DEFAULT_SYSTEM_MAP for context.

  /** @param {object} archetype */
  upsertArchetype(archetype) {
    const idx = this._map.archetypes.findIndex(a => a.id === archetype.id);
    const clone = JSON.parse(JSON.stringify(archetype));
    if (idx >= 0) {
      this._map.archetypes[idx] = clone;
    } else {
      this._map.archetypes.push(clone);
    }
    this._touch();
  }

  // ── Blueprints ────────────────────────────────────────────────────────────
  // §BUGFIX 2026-09-06: added — host/gates/blueprint.js calls all three.
  // Defs (the template) and instances (a launched copy) are tracked
  // separately, mirroring archetype/blueprint's own def-vs-instance split.

  /** @param {object} blueprint */
  upsertBlueprintDef(blueprint) {
    const idx = this._map.blueprintDefs.findIndex(b => b.id === blueprint.id);
    const clone = JSON.parse(JSON.stringify(blueprint));
    if (idx >= 0) {
      this._map.blueprintDefs[idx] = clone;
    } else {
      this._map.blueprintDefs.push(clone);
    }
    this._touch();
  }

  /** @param {object} instance */
  upsertBlueprintInstance(instance) {
    const idx = this._map.blueprintInstances.findIndex(i => i.id === instance.id);
    const clone = JSON.parse(JSON.stringify(instance));
    if (idx >= 0) {
      this._map.blueprintInstances[idx] = clone;
    } else {
      this._map.blueprintInstances.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removeBlueprintInstance(id) {
    this._map.blueprintInstances = this._map.blueprintInstances.filter(i => i.id !== id);
    this._touch();
  }

  // ── Playgrounds ───────────────────────────────────────────────────────────
  // §BUGFIX 2026-09-06: added — host/gates/playgrounds.js and
  // playgrounds/index.js both call these.

  /** @param {object} playground */
  upsertPlayground(playground) {
    const idx = this._map.playgrounds.findIndex(p => p.id === playground.id);
    const clone = JSON.parse(JSON.stringify(playground));
    if (idx >= 0) {
      this._map.playgrounds[idx] = clone;
    } else {
      this._map.playgrounds.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removePlayground(id) {
    this._map.playgrounds = this._map.playgrounds.filter(p => p.id !== id);
    this._touch();
  }

  // ── Vault Keys ────────────────────────────────────────────────────────────
  // §BUGFIX 2026-09-06: added — vault/index.js calls both. Per vault/store.js's
  // own header: "value is NEVER present in SystemMap or any log" — records
  // held here are metadata only (key name, scope, grants), never the secret
  // value itself. That's enforced by vault/index.js's callers, not here;
  // this method just stores whatever record it's given, same as every other
  // upsertX in this class.

  /** @param {object} record */
  upsertVaultKey(record) {
    const idx = this._map.vaultKeys.findIndex(k => k.id === record.id);
    const clone = JSON.parse(JSON.stringify(record));
    if (idx >= 0) {
      this._map.vaultKeys[idx] = clone;
    } else {
      this._map.vaultKeys.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removeVaultKey(id) {
    this._map.vaultKeys = this._map.vaultKeys.filter(k => k.id !== id);
    this._touch();
  }

  // ── Plugins ───────────────────────────────────────────────────────────────
  // §BUGFIX 2026-09-06: added — the `plugins` array field already existed
  // (with a safe || [] fallback in load()), but no mutation methods did.
  // host/gates/plugin.js and plugin/index.js both call these.

  /** @param {object} record */
  upsertPlugin(record) {
    const idx = this._map.plugins.findIndex(p => p.id === record.id);
    const clone = JSON.parse(JSON.stringify(record));
    if (idx >= 0) {
      this._map.plugins[idx] = clone;
    } else {
      this._map.plugins.push(clone);
    }
    this._touch();
  }

  /** @param {string} id */
  removePlugin(id) {
    this._map.plugins = this._map.plugins.filter(p => p.id !== id);
    this._touch();
  }

  // ── Vaultd State ──────────────────────────────────────────────────────────
  // §BUGFIX 2026-09-06: added — cli/commands/vaultd.js calls this after
  // every start/stop/status check. COS-42 (per that file's own header):
  // "vaultd state is visible in SystemMap whether running or not" — pass
  // null when not running, never omit the field.

  /** @param {object|null} state */
  setVaultdState(state) {
    this._map.vaultdState = state ? JSON.parse(JSON.stringify(state)) : null;
    this._touch();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _touch() {
    this._map.generatedAt = Date.now();
    this._persist();
    if (this._bus) {
      this._bus.emit('host:map:updated', { generatedAt: this._map.generatedAt });
    }
  }

  _persist() {
    try {
      const json = JSON.stringify({ ...this._map, generatedAt: Date.now() }, null, 2);
      const tmp  = this._file + '.tmp';
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, this._file);
    } catch (err) {
      console.error('[system-map] persist failed:', err.message);
    }
  }
}

module.exports = { SystemMap };
