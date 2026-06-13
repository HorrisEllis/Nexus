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
