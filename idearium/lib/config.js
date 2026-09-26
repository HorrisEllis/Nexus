/**
 * idearium/lib/config.js — idearium.config, the ESM entry point.
 *
 * §BUILT 2026-09-15 — James: "limit 500 for chunks needs to change. have
 * that as an option in the configuration file in idearium."
 * §EXPANDED 2026-09-15 — James: "500 chunks is too low, make a full
 * config file for idearium to change those kinds of values." The first
 * pass held five keys while every other real bound in the import path
 * stayed hardcoded or env-only in lib/project-import.config.js
 * (maxBytesPerFile, maxTotalBytes, skipDirs, textExt, the repo storage
 * dir, the git identity, the compartment budgets) plus the API's own
 * PORT/BINDING/CHUNK_EVENTS_LIMIT in a second file (idearium/config.js).
 * "Those kinds of values" is all of them — they are all in the schema
 * now, and the modules that used to own them read from here.
 *
 * §THIN ON PURPOSE — the schema, the three-layer merge and all the
 * validation live in idearium/lib/config-core.cjs, NOT here. That file's
 * own header explains why: lib/project-import.config.js is CJS and
 * cannot import this ESM module, so putting the logic here would have
 * forced a second copy on the CJS side, and two readers that disagree
 * about the same key is precisely the drift this config exists to end.
 * This module is the ESM face of that shared core, and adds exactly one
 * thing the core deliberately does not have: the database.
 *
 * §THREE LAYERS, lowest to highest — SCHEMA defaults ->
 * idearium/idearium.config.json (re-read every call, so an edit needs no
 * restart) -> the persisted row in JAA table 'idearium_config'. A runtime
 * set() shadows the file; resetConfig() drops the override so the file
 * shows through again. describe() reports which layer every key actually
 * came from, which is what makes a layered config debuggable rather than
 * mysterious.
 *
 * §PERSISTENCE — idearium/lib/db.js -> cortex's JaaStore, one singleton
 * row, same seam every other idearium store uses.
 */

import fs from 'fs';
import { loadTable, syncTable } from './db.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const core = require('./config-core.cjs');

const { TABLE, ROW_UUID, CONFIG_FILE, SCHEMA, ALIASES } = core;

function _load() {
  const rows = loadTable(TABLE);
  const row  = rows.find((r) => r.uuid === ROW_UUID);
  const persisted = core.foldAliases(row && row.values);
  return {
    uuid: ROW_UUID,
    values: core.resolveValues(persisted),
    _persisted: persisted,
    updatedAt: (row && row.updatedAt) || null,
    updatedBy: (row && row.updatedBy) || null,
  };
}

function _save(state) {
  // Only the RUNTIME layer is written back. Persisting the merged result
  // would freeze today's defaults and file values into the row, so a
  // later edit to idearium.config.json — or a changed default — would
  // appear to do nothing forever after the first write. This is the
  // difference between a config that layers and one that silently
  // collapses the moment anything sets a key.
  syncTable(TABLE, [{
    uuid: ROW_UUID, values: state._persisted,
    updatedAt: state.updatedAt, updatedBy: state.updatedBy,
  }], 'uuid');
}

/** Full current config, all layers merged. */
export function getConfig() { return _load().values; }

/**
 * One key's live value. Accepts a nested path ('chunking.chunk_cap') or
 * a legacy top-level alias ('chunk_cap') — see core's ALIASES for why
 * both keep working.
 */
export function getValue(keyPath) {
  const { parts } = core.resolve(keyPath);
  return core.getAt(_load().values, parts);
}

/**
 * setConfig(keyPath, value, { actor }) — validates against the schema
 * (type, min/max, enum), enforces copilot_writable, persists to the
 * runtime layer only, and returns the event idearium.config.set fires.
 * A human write and a copilot write differ ONLY in the actor field.
 */
export function setConfig(keyPath, value, { actor = 'user' } = {}) {
  const { parts, real } = core.resolve(keyPath);
  const coerced = core.validate(keyPath, value, actor);

  const state = _load();
  core.setAt(state._persisted, parts, coerced);
  core.setAt(state.values, parts, coerced);
  state.updatedAt = Date.now();
  state.updatedBy = actor;
  _save(state);

  console.log(`[idearium/config] ${real} -> ${JSON.stringify(coerced)} (actor: ${actor})`);
  return { type: 'idearium.config.set', key: real, value: coerced, actor, at: state.updatedAt };
}

/**
 * resetConfig(keyPath, { actor }) — drops the runtime override so the
 * file layer (or the default) shows through again. Without this the
 * runtime layer would be a one-way door: once anything wrote a key, no
 * edit to idearium.config.json could ever be seen for it again.
 */
export function resetConfig(keyPath, { actor = 'user' } = {}) {
  const { parts, def, real } = core.resolve(keyPath);
  if (actor !== 'user' && !def.copilot_writable) {
    throw new Error(`idearium/lib/config: '${keyPath}' is not copilot_writable — human reset required`);
  }
  const state = _load();
  core.deleteAt(state._persisted, parts);
  state.updatedAt = Date.now();
  state.updatedBy = actor;
  _save(state);
  const effective = core.getAt(_load().values, parts);
  console.log(`[idearium/config] reset ${real} -> ${JSON.stringify(effective)} (actor: ${actor})`);
  return { type: 'idearium.config.reset', key: real, value: effective, actor, at: state.updatedAt };
}

/**
 * describe() — every key with its value, the layer it actually came
 * from, its bounds and whether a non-human actor may write it. The
 * `source` field ('default' | 'file' | 'runtime') is the part that makes
 * "I changed the file and nothing happened" answerable.
 */
export function describe() {
  const state = _load();
  const file  = core.fileLayer();
  const defs  = core.defaults();
  const keys  = [];
  (function walk(schema, prefix) {
    for (const [k, v] of Object.entries(schema)) {
      const keyPath = prefix ? `${prefix}.${k}` : k;
      const parts = keyPath.split('.');
      if (core.isLeaf(v)) {
        const inRuntime = core.getAt(state._persisted, parts) !== undefined;
        const inFile    = core.getAt(file, parts) !== undefined;
        keys.push({
          key: keyPath,
          value: core.getAt(state.values, parts),
          source: inRuntime ? 'runtime' : inFile ? 'file' : 'default',
          default: core.getAt(defs, parts),
          type: v.type,
          min: v.min == null ? null : v.min,
          max: v.max == null ? null : v.max,
          enum: v.enum || null,
          copilot_writable: !!v.copilot_writable,
        });
      } else walk(v, keyPath);
    }
  })(SCHEMA, '');
  return {
    configFile: CONFIG_FILE,
    configFileExists: fs.existsSync(CONFIG_FILE),
    configFileError: core.fileError(),
    updatedAt: state.updatedAt, updatedBy: state.updatedBy,
    keys,
  };
}

export const MODULE_ID = 'idearium-config';
export const VERSION = '2.0.0';
export { SCHEMA, ALIASES, CONFIG_FILE };
