'use strict';
/**
 * lib/options.js — one options shape for every system (OP0, docs/2026-10-10-shape-of-nexus-phasemap.spec).
 * comp_id: nexus.lib.options
 *
 * James, 2026-10-10: "i prefer options over hard coded, and i prefer it over code honestly. anything high leverage, or
 * that removes the need to understand code so i dont have to change it."
 *
 * Idearium already had this (idearium/lib/config-core.cjs: a schema of leaves { type, default, min, max,
 * copilot_writable }, layered). Every other system kept its knobs as environment variables or literals. This is the same
 * leaf shape, for any system, owned by that system:
 *
 *   <system>/options.js        its schema: { group: { key: { type, default, min, max, unit, description, env, copilot_writable } } }
 *   <system>/data/options.json its values (written only through set(); the system owns the file)
 *   <system>/data/options-ledger.jsonl   every change: when, key, old, new, who — the history
 *
 * Layers, lowest first: the default → the system's file → the environment variable the option names (so every env var
 * that worked before still works, and the option says it is being overridden). Read on every get() (the file is
 * re-read when it changes), so a change takes effect on the next use without a restart. A bad value is refused with the
 * reason — never clamped, never silently ignored.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.options';
const VERSION = '1.0.0';
const TYPES = new Set(['number', 'boolean', 'string', 'enum']);

function _leaves(schema) {
  const out = [];
  for (const [group, keys] of Object.entries(schema || {})) {
    for (const [key, leaf] of Object.entries(keys || {})) {
      if (!leaf || !TYPES.has(leaf.type)) throw new Error(`[options] ${group}.${key}: type must be one of ${[...TYPES].join(', ')}`);
      out.push({ id: `${group}.${key}`, group, key, ...leaf });
    }
  }
  return out;
}

function _coerce(leaf, raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: false, error: 'empty' };
  if (leaf.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) return { ok: false, error: `${leaf.id} must be a number (got ${JSON.stringify(raw)})` };
    if (leaf.min != null && n < leaf.min) return { ok: false, error: `${leaf.id} must be at least ${leaf.min}${leaf.unit ? ` ${leaf.unit}` : ''} (got ${n})` };
    if (leaf.max != null && n > leaf.max) return { ok: false, error: `${leaf.id} must be at most ${leaf.max}${leaf.unit ? ` ${leaf.unit}` : ''} (got ${n})` };
    return { ok: true, value: n };
  }
  if (leaf.type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    const s = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return { ok: true, value: true };
    if (['0', 'false', 'no', 'off'].includes(s)) return { ok: true, value: false };
    return { ok: false, error: `${leaf.id} must be true or false (got ${JSON.stringify(raw)})` };
  }
  if (leaf.type === 'enum') {
    const s = String(raw);
    if (!(leaf.values || []).includes(s)) return { ok: false, error: `${leaf.id} must be one of ${(leaf.values || []).join(', ')} (got ${JSON.stringify(raw)})` };
    return { ok: true, value: s };
  }
  return { ok: true, value: String(raw) };
}

/**
 * createOptions({ system, schema, dir, env }) → { get, describe, set, reset, file, ledgerFile }
 *   dir: the system's data folder (default <repo>/<system>/data; <SYSTEM>_OPTIONS_DIR overrides, for tests)
 */
function createOptions({ system, schema, dir = null, env = process.env } = {}) {
  if (!system) throw new Error('[options] system is required');
  const leaves = _leaves(schema);
  const byId = new Map(leaves.map(l => [l.id, l]));
  const base = dir || env[`${system.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_OPTIONS_DIR`] || path.join(__dirname, '..', system, 'data');
  const file = path.join(base, 'options.json');
  const ledgerFile = path.join(base, 'options-ledger.jsonl');
  let _cache = { mtimeMs: -1, values: {} };

  function _file() {
    let st = null; try { st = fs.statSync(file); } catch (_) { _cache = { mtimeMs: -1, values: {} }; return _cache.values; }
    if (st.mtimeMs === _cache.mtimeMs) return _cache.values;
    let v = {}; try { v = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { v = {}; }
    _cache = { mtimeMs: st.mtimeMs, values: v };
    return v;
  }

  /** resolve(id) → { value, source: 'default' | 'file' | 'env', overriddenBy?, invalid? } */
  function resolve(id) {
    const leaf = byId.get(id);
    if (!leaf) throw new Error(`[options] ${system} has no option ${id}`);
    let value = leaf.default, source = 'default', invalid = null;
    const fv = _file()[id];
    if (fv !== undefined) { const c = _coerce(leaf, fv); if (c.ok) { value = c.value; source = 'file'; } else invalid = `${system}/data/options.json: ${c.error}`; }
    if (leaf.env && env[leaf.env] !== undefined && env[leaf.env] !== '') {
      const c = _coerce(leaf, env[leaf.env]);
      if (c.ok) return { value: c.value, source: 'env', overriddenBy: leaf.env, ...(source === 'file' ? { fileValue: fv } : {}), invalid };
      invalid = `${leaf.env}: ${c.error}`;
    }
    return { value, source, invalid };
  }

  function get(id) { return resolve(id).value; }

  function describe() {
    return leaves.map(l => {
      const r = resolve(l.id);
      return { id: l.id, group: l.group, key: l.key, type: l.type, values: l.values || null, default: l.default, value: r.value, source: r.source,
        overriddenBy: r.overriddenBy || null, invalid: r.invalid || null, min: l.min ?? null, max: l.max ?? null, unit: l.unit || null,
        description: l.description || '', env: l.env || null, copilot_writable: l.copilot_writable !== false };
    });
  }

  function _write(values) {
    fs.mkdirSync(base, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(values, null, 2) + '\n');
    fs.renameSync(tmp, file);   // atomic: a crash leaves the old file or the new one, never half of one
    _cache = { mtimeMs: -1, values: {} };
  }
  function _ledger(row) { try { fs.mkdirSync(base, { recursive: true }); fs.appendFileSync(ledgerFile, JSON.stringify(row) + '\n'); } catch (_) { /* the change stands; the ledger failure is said by the caller's reply */ } }

  /** set(id, raw, { actor }) → { ok, value, old, source } | { ok:false, error } — copilot may set only copilot_writable options */
  function set(id, raw, { actor = 'user' } = {}) {
    const leaf = byId.get(id);
    if (!leaf) return { ok: false, error: `${system} has no option ${id}` };
    if (actor === 'copilot' && leaf.copilot_writable === false) return { ok: false, error: `${id} is not copilot-writable — ask James` };
    const c = _coerce(leaf, raw);
    if (!c.ok) return { ok: false, error: c.error };
    const values = { ..._file() };
    const old = resolve(id).value;
    values[id] = c.value;
    _write(values);
    _ledger({ at: Date.now(), system, id, old, value: c.value, actor });
    const r = resolve(id);
    return { ok: true, value: c.value, old, source: r.source, ...(r.source === 'env' ? { note: `saved, but ${r.overriddenBy} is set in the environment and still wins — unset it to use this value` } : {}) };
  }

  /** reset(id, { actor }) — back to the default (the file entry removed) */
  function reset(id, { actor = 'user' } = {}) {
    if (!byId.has(id)) return { ok: false, error: `${system} has no option ${id}` };
    const values = { ..._file() };
    const old = resolve(id).value;
    delete values[id];
    _write(values);
    _ledger({ at: Date.now(), system, id, old, value: byId.get(id).default, actor, reset: true });
    return { ok: true, value: resolve(id).value, old, source: resolve(id).source };
  }

  return { system, get, resolve, describe, set, reset, file, ledgerFile };
}

module.exports = { MODULE_ID, VERSION, createOptions };
