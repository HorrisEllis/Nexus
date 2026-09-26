/**
 * host/state-store.js
 * COMPARTMENT OS — State Store
 * Atomic flat-file JSON persistence for all compartment state.
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Design:
 *   - Single source of truth: state.json
 *   - Writes are atomic: write to .tmp file, then rename
 *   - Reads return deep clones — callers cannot mutate store internals
 *   - Debounced: rapid mutations coalesce into one write
 *   - Survives process kill: .tmp file is never left as the live file
 *
 * Shape of state.json:
 *   { version, compartments: { [id]: Compartment }, pipes: { [id]: Pipe } }
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { COS_STATE_DIR, COS_STATE_FILE, STATE_WRITE_DELAY_MS, COS_VERSION }
  = require('../foundation/constants.js');

// ─── StateStore ───────────────────────────────────────────────────────────────

class StateStore {
  constructor(stateFile = COS_STATE_FILE) {
    this._file   = stateFile;
    this._dir    = path.dirname(stateFile);
    this._tmp    = stateFile + '.tmp';
    this._state  = this._empty();
    this._timer  = null;
    this._loaded = false;
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /**
   * Load state from disk. Creates state.json if it doesn't exist.
   * Must be called before any reads/writes.
   */
  load() {
    fs.mkdirSync(this._dir, { recursive: true });

    if (fs.existsSync(this._file)) {
      try {
        const raw = fs.readFileSync(this._file, 'utf8');
        const parsed = JSON.parse(raw);
        this._state = this._migrate(parsed);
      } catch (err) {
        // Corrupted state.json — back it up, start fresh
        const backup = this._file + '.bak.' + Date.now();
        try { fs.renameSync(this._file, backup); } catch (_) {}
        console.error(`[state-store] Corrupted state.json backed up to ${backup}. Starting fresh.`);
        this._state = this._empty();
        this._writeSync();
      }
    } else {
      this._state = this._empty();
      this._writeSync();
    }

    this._loaded = true;
    return this;
  }

  // ── Compartments ──────────────────────────────────────────────────────────

  /**
   * @returns {object[]} array of all compartments (deep clones)
   */
  listCompartments() {
    this._assertLoaded();
    return Object.values(this._state.compartments).map(c => this._clone(c));
  }

  /**
   * @param {string} id
   * @returns {object|null}
   */
  getCompartment(id) {
    this._assertLoaded();
    const c = this._state.compartments[id];
    return c ? this._clone(c) : null;
  }

  /**
   * Get compartment by name (case-insensitive).
   * @param {string} name
   * @returns {object|null}
   */
  getCompartmentByName(name) {
    this._assertLoaded();
    const lower = name.toLowerCase();
    const found = Object.values(this._state.compartments)
      .find(c => c.name.toLowerCase() === lower || c.slug === lower);
    return found ? this._clone(found) : null;
  }

  /**
   * @param {object} compartment  — full Compartment object
   */
  setCompartment(compartment) {
    this._assertLoaded();
    if (!compartment.id) throw new Error('state-store: setCompartment requires compartment.id');
    this._state.compartments[compartment.id] = this._clone(compartment);
    this._scheduleSave();
  }

  /**
   * @param {string} id
   */
  deleteCompartment(id) {
    this._assertLoaded();
    delete this._state.compartments[id];
    this._scheduleSave();
  }

  // ── Pipes ─────────────────────────────────────────────────────────────────

  /** @returns {object[]} */
  listPipes() {
    this._assertLoaded();
    return Object.values(this._state.pipes).map(p => this._clone(p));
  }

  /** @param {string} id @returns {object|null} */
  getPipe(id) {
    this._assertLoaded();
    const p = this._state.pipes[id];
    return p ? this._clone(p) : null;
  }

  /** @param {object} pipe */
  setPipe(pipe) {
    this._assertLoaded();
    if (!pipe.id) throw new Error('state-store: setPipe requires pipe.id');
    this._state.pipes[pipe.id] = this._clone(pipe);
    this._scheduleSave();
  }

  /** @param {string} id */
  deletePipe(id) {
    this._assertLoaded();
    delete this._state.pipes[id];
    this._scheduleSave();
  }

  // ── Raw state (for snapshot / map export) ─────────────────────────────────

  /** @returns {object} deep clone of entire state */
  snapshot() {
    this._assertLoaded();
    return this._clone(this._state);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /**
   * Force an immediate synchronous write. Bypasses debounce.
   * Use after critical mutations (compartment create/destroy).
   */
  flushSync() {
    this._assertLoaded();
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._writeSync();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _empty() {
    return {
      version:      COS_VERSION,
      compartments: {},
      pipes:        {},
    };
  }

  _migrate(parsed) {
    // Future: version-based migrations go here.
    // For v1.0.0, just ensure shape is correct.
    return Object.assign(this._empty(), {
      compartments: parsed.compartments || {},
      pipes:        parsed.pipes        || {},
    });
  }

  _scheduleSave() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._writeSync();
    }, STATE_WRITE_DELAY_MS);
  }

  _writeSync() {
    const json = JSON.stringify(this._state, null, 2);
    fs.writeFileSync(this._tmp, json, 'utf8');
    fs.renameSync(this._tmp, this._file);
  }

  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _assertLoaded() {
    if (!this._loaded) throw new Error('state-store: call load() before use');
  }
}

module.exports = { StateStore };
