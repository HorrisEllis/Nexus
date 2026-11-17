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

// ── PC16 slice a (2026-11-17) — routing.* is RAID's ─────────────────────────────────────────────────────────────────────────────────────
// James, 2026-11-17: "i need ideariums settings to work better. this is meant to be in raid. all of the routing." RAID (Cortex,
// cortex/core/raid/routing.js) owns the routing policy. Idearium keeps the last copy it read on disk (the mirror, its own data folder) and
// lays it over its three layers for routing.* only: a fourth, top layer, 'raid'. A write here goes to RAID through the outbox (Cortex down:
// kept, delivered on replay) and into the mirror at once, so what was set is what is read. Every reader of routing.* is unchanged.
function _mirrorFile() {
  if (process.env.IDEARIUM_RAID_ROUTING_MIRROR) return process.env.IDEARIUM_RAID_ROUTING_MIRROR;
  try { return require('../../lib/data-home.js').home('idearium', 'raid', 'routing.mirror.json'); } catch (_) { return null; }
}
let _mirror = { mtime: -2, doc: { policy: {} } };
function _raidDoc() {
  const f = _mirrorFile(); if (!f) return { policy: {} };
  try { const st = fs.statSync(f); if (st.mtimeMs !== _mirror.mtime) _mirror = { mtime: st.mtimeMs, doc: JSON.parse(fs.readFileSync(f, 'utf8')) || { policy: {} } }; }
  catch (_) { _mirror = { mtime: -1, doc: { policy: {} } }; }
  return _mirror.doc && _mirror.doc.policy ? _mirror.doc : { policy: {} };
}
/** writeRaidMirror({ policy, at, by }) — the copy of RAID's routing Idearium reads from (the sync and every write keep it current) */
export function writeRaidMirror(doc) {
  const f = _mirrorFile(); if (!f) return false;
  const path = require('path');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify({ policy: (doc && doc.policy) || {}, at: (doc && doc.at) || null, by: (doc && doc.by) || null, readAt: Date.now() }, null, 2) + '\n');
  fs.renameSync(f + '.tmp', f);
  _mirror = { mtime: -2, doc: { policy: {} } };
  return true;
}
let _pushRaid = (body) => { try { return Promise.resolve(require('../../lib/nexus-client.js').postDurable('cortex', '/api/raid/routing', body)).catch(() => null); } catch (_) { return Promise.resolve(null); } };
/** setRaidRoutingPusher(fn) — how a routing change reaches RAID (tests hand in their own) */
export function setRaidRoutingPusher(fn) { const prev = _pushRaid; if (typeof fn === 'function') _pushRaid = fn; return prev; }
/** routingWithoutRaid() — Idearium's own routing values (defaults, file, runtime), what it hands RAID once when RAID has none */
export function routingWithoutRaid() { const rows = loadTable(TABLE); const row = rows.find((r) => r.uuid === ROW_UUID); return (core.resolveValues(core.foldAliases(row && row.values)) || {}).routing || {}; }
function _overlayRaid(values) {
  const pol = _raidDoc().policy || {}, sch = SCHEMA.routing || {};
  for (const [k, v] of Object.entries(pol)) {
    if (!sch[k] || !core.isLeaf(sch[k])) continue;                       // not a key Idearium knows: left to its owner
    try { const c = core.validate(`routing.${k}`, v, 'user'); values.routing = values.routing || {}; values.routing[k] = c; } catch (_) { /* out of bounds here: the lower layers stand, said by describe() */ }
  }
  return values;
}

function _load() {
  const rows = loadTable(TABLE);
  const row  = rows.find((r) => r.uuid === ROW_UUID);
  const persisted = core.foldAliases(row && row.values);
  return {
    uuid: ROW_UUID,
    values: _overlayRaid(core.resolveValues(persisted)),
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
  const { parts, real, def } = core.resolve(keyPath);
  const coerced = core.validate(keyPath, value, actor);

  const state = _load();
  core.setAt(state._persisted, parts, coerced);
  core.setAt(state.values, parts, coerced);
  state.updatedAt = Date.now();
  state.updatedBy = actor;
  _save(state);

  // PC16 slice a — routing.* goes to RAID, its owner, and into the mirror now (what was set is what is read)
  if (parts[0] === 'routing' && parts.length === 2) {
    const d = _raidDoc(); writeRaidMirror({ ...d, policy: { ...(d.policy || {}), [parts[1]]: coerced } });
    _pushRaid({ key: parts[1], value: coerced, by: `idearium:${actor}` });
  }
  // a secret's value is never logged or put in the event — only that it was set
  const shown = def && def.secret ? '(secret — set, not shown)' : coerced;
  console.log(`[idearium/config] ${real} -> ${def && def.secret ? shown : JSON.stringify(coerced)} (actor: ${actor})`);
  return { type: 'idearium.config.set', key: real, value: shown, actor, at: state.updatedAt };
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
  if (parts[0] === 'routing' && parts.length === 2) {   // PC16 slice a — RAID's value goes too, so the default or the file shows through
    const d = _raidDoc(); const pol = { ...(d.policy || {}) }; delete pol[parts[1]]; writeRaidMirror({ ...d, policy: pol });
    _pushRaid({ key: parts[1], unset: true, by: `idearium:${actor}` });
  }
  const state = _load();
  core.deleteAt(state._persisted, parts);
  state.updatedAt = Date.now();
  state.updatedBy = actor;
  _save(state);
  const effective = core.getAt(_load().values, parts);
  const shownReset = def && def.secret ? '(secret — reset, not shown)' : effective;
  console.log(`[idearium/config] reset ${real} -> ${def && def.secret ? shownReset : JSON.stringify(effective)} (actor: ${actor})`);
  return { type: 'idearium.config.reset', key: real, value: shownReset, actor, at: state.updatedAt };
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
  const raid  = _raidDoc().policy || {};
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
          source: (parts[0] === 'routing' && parts.length === 2 && raid[parts[1]] !== undefined) ? 'raid' : inRuntime ? 'runtime' : inFile ? 'file' : 'default',
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
