'use strict';
/**
 * lib/ledger-store.js — per-system ledger stores. One JaaStore per
 * system, living in that system's own data directory.
 * UUID: nexus-ledger-store-v1-0000-2026-0919-jamesbrooks-001
 *
 * §2026-09-19 — James: "the ledgers in cortex need to be per system."
 * Before this, lib/component-ledger.js's write() did two things: wrote a
 * real per-system physical file under data/ledger/<system>/<component>/,
 * then mirrored the SAME row into one central `component_ledger` table
 * inside CORTEX's shared jaaDB. The physical half was already per-system
 * (confirmed: _partitionPath() has partitioned by system since it was
 * built). The mirror was not — 742 real rows across 12 different systems
 * (copilot 364, diagnostic 133, idearium 43, eros 40, cg 39, guardian 33,
 * loom 25, cortex 23, architect 17, eravos 12, ollama 7, versionium 6)
 * all sat in cortex's store, which is exactly the §5.9 sovereignty
 * violation the versionium VS1 migration already fixed for commits.
 *
 * §MODELLED ON versionium/lib/store.js, NOT INVENTED. Same real JaaStore
 * class every sovereign system already uses, same thin adapter shape,
 * same insert/query/tail/update/delete surface, so a reader who knows
 * that file knows this one (§5.6). The one real difference: that store
 * serves ONE system and can hold a module-level singleton; this one
 * serves many, so stores are cached per system id instead.
 *
 * §PATH CONVENTION IS THE EXISTING ONE. <system>/data/ledger/ follows
 * the per-system layout already established by v0.39.115's node-index
 * work — guardian/data/node-index/, loom/data/node-index/,
 * intelligence/data/node-index/ and so on. Checked directly: every one
 * of the 12 systems above that exists as a directory already has its own
 * <system>/data/. Nothing new is being invented about where a system
 * keeps its data.
 *
 * §SYSTEMS WITHOUT A DIRECTORY resolve to data/ledger-store/<system>/
 * instead of silently failing or writing into cortex. Real cases exist
 * in the live data: 'eros' and 'cg' are short names that are not
 * directories at this root ('erosmancer' and 'clear-glass' are). They
 * get a real, honest home of their own rather than being force-mapped
 * to a directory this file guessed at — an alias table can be added
 * later from evidence, but guessing which is which now would be
 * authoring, not observing (§0.1).
 */

const fs = require('fs');
const path = require('path');
const { JaaStore } = require('../guardian/jaa-store');

const ROOT = path.join(__dirname, '..');
const FALLBACK_ROOT = path.join(ROOT, 'data', 'ledger-store');
const TABLE = 'component_ledger';

const _stores = new Map();

function _safe(s) {
  return String(s || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Where this system's ledger store lives. Exported so tests and the
 *  migration can assert the real path rather than re-deriving it. */
function dirFor(system) {
  const s = _safe(system);
  if (process.env.LEDGER_STORE_ROOT) return path.join(process.env.LEDGER_STORE_ROOT, s);
  const own = path.join(ROOT, s, 'data', 'ledger');
  // A system owns its ledger only if the system itself is a real directory.
  if (fs.existsSync(path.join(ROOT, s))) return own;
  return path.join(FALLBACK_ROOT, s);
}

/** The real JaaStore for one system, created on first use, cached after. */
function storeFor(system) {
  const s = _safe(system);
  if (_stores.has(s)) return _stores.get(s);
  const dir = dirFor(s);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const store = new JaaStore(dir);
  _stores.set(s, store);
  return store;
}

/** insert(row) — routes on row.system. The row is unchanged. */
function insert(row) {
  return storeFor(row && row.system).insert(TABLE, row);
}

/** Every system that currently has a ledger store on disk. */
function knownSystems() {
  const out = new Set();
  for (const s of _stores.keys()) out.add(s);
  const scan = (base, nested) => {
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = nested ? path.join(base, e.name, 'data', 'ledger') : path.join(base, e.name);
      if (fs.existsSync(path.join(p, `${TABLE}.json`))) out.add(e.name);
    }
  };
  if (process.env.LEDGER_STORE_ROOT) scan(process.env.LEDGER_STORE_ROOT, false);
  else { scan(ROOT, true); scan(FALLBACK_ROOT, false); }
  return [...out];
}

/**
 * query(pred, limit) — read ACROSS every system's store.
 * §1.2 — a system whose store fails to open is skipped and named in the
 * returned rows' absence, never allowed to look like "no matching rows".
 */
function queryAll(pred, limit = 50) {
  const rows = [];
  const failed = [];
  for (const s of knownSystems()) {
    try { rows.push(...(storeFor(s).all(TABLE, {}) || [])); }
    catch (e) { failed.push({ system: s, error: e.message }); }
  }
  rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const matched = typeof pred === 'function' ? rows.filter(pred) : rows;
  const out = limit ? matched.slice(-limit) : matched;
  if (failed.length) Object.defineProperty(out, '_unreadableSystems', { value: failed, enumerable: false });
  return out;
}

module.exports = { storeFor, dirFor, insert, queryAll, knownSystems, TABLE, FALLBACK_ROOT };
