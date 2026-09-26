'use strict';
/**
 * src/storage/jaa.js — Clear Glass's one database
 * component_id: cg.storage.jaa
 *
 * §BUILT 2026-09-26 — James: "with clearglass, make it jaa. no json."
 * Before this, the cookie vault was the only Clear Glass store on JAA
 * (src/cookies/vault.js, 0.39.243). Every other store — options, API
 * settings, site settings, history, downloads, bookmarks, autofill,
 * fingerprints, passwords — hand-wrote its own <name>.json file with
 * fs.writeFileSync on every mutation. They now all live in ONE JaaStore
 * (guardian/jaa-store.js, the store every NEXUS system runs on) at
 * ~/.clear-glass/jaa/, one table per store, one row per record.
 *
 * Two shapes cover every store:
 *   JaaKV    — an object of settings  → one row per key   { id: key, value }
 *   JaaRows  — a list of records      → one row per record { id: record[idField], ...record, _ord }
 * Both expose load() → the store's in-memory shape, and replaceAll(shape)
 * → diff-writes only the rows that changed (and deletes the ones that
 * are gone), so each store keeps its own logic and only its load/persist
 * pair changes.
 *
 * Legacy files: imported once (marked in cg_jaa_meta) and LEFT ON DISK,
 * same convention as the cookie vault — nothing is deleted.
 *
 * Honest limit: JaaStore itself snapshots each table to <table>.json under
 * the jaa/ directory. "No JSON" here means no store owns a JSON file any
 * more — one database, one access path, row-level writes — not that the
 * bytes on disk stop being JSON; that is JaaStore's persistence format.
 */

const fs   = require('fs');
const path = require('path');

const META    = 'cg_jaa_meta';
const cgDir   = () => path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass');
const CG_DIR  = cgDir();

let _store = null, _storeDir = null;
let _dirOverride = null;

function _dir() { return _dirOverride || process.env.CG_JAA_DIR || path.join(cgDir(), 'jaa'); }

/**
 * The shared store. Location is resolved on every call (CG_JAA_DIR, then
 * $APPDATA/$HOME) so a process whose HOME changes — the test suites give
 * each test its own tmp HOME — gets the store for the HOME it has now, not
 * the one it booted with.
 */
function store() {
  const dir = _dir();
  if (_store && _storeDir === dir) return _store;
  if (_store) { try { _store.close(); } catch (_) {} }
  const { JaaStore } = require('../../../guardian/jaa-store.js');
  fs.mkdirSync(dir, { recursive: true });
  _store = new JaaStore(dir, { settings: false });
  _storeDir = dir;
  return _store;
}
/** Point the shared store somewhere else (tests). */
function setDir(dir) { _dirOverride = dir; }

function _same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function _importOnce(st, table, legacyFile, toShape, write) {
  const key = `imported:${table}`;
  if (st.get(META, { id: key })) return false;
  if (st.count(table) > 0) { st.insert(META, { id: key, table, file: null, ts: Date.now(), note: 'table already populated' }); return false; }
  let imported = false;
  if (legacyFile && fs.existsSync(legacyFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      write(toShape ? toShape(raw) : raw);
      imported = true;
      console.log(`[cg-jaa] imported ${path.basename(legacyFile)} → ${table} (file left in place)`);
    } catch (e) {
      console.warn(`[cg-jaa] ${path.basename(legacyFile)} unreadable, not imported: ${e.message}`);
    }
  }
  st.insert(META, { id: key, table, file: legacyFile || null, ts: Date.now(), imported });
  return imported;
}

class JaaKV {
  /** @param {string} table @param {{legacyFile?:string, fromLegacy?:(raw)=>object}} opts */
  constructor(table, { legacyFile = null, fromLegacy = null, store: st = null } = {}) {
    this.table = table; this.legacyFile = legacyFile; this.fromLegacy = fromLegacy; this._st = st;
  }
  get st() { return this._st ? this._st() : store(); }
  load() {
    _importOnce(this.st, this.table, this.legacyFile, this.fromLegacy, (obj) => this.replaceAll(obj || {}));
    const out = {};
    for (const r of this.st.all(this.table)) out[r.id] = r.value;
    return out;
  }
  replaceAll(obj) {
    const st = this.st;
    const cur = new Map(st.all(this.table).map(r => [r.id, r]));
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined) continue;
      const prev = cur.get(k);
      if (!prev || !_same(prev.value, v)) st.insert(this.table, { id: k, value: v });
      cur.delete(k);
    }
    for (const k of cur.keys()) st.delete(this.table, { id: k });
  }
  flush() { this.st.flushAll(); }
}

class JaaRows {
  /**
   * @param {string} table
   * @param {{idField?:string, legacyFile?:string, fromLegacy?:(raw)=>object[], orderBy?:string, order?:'ASC'|'DESC'}} opts
   * orderBy: a record field that already orders the list (e.g. ts, newest
   * first). Without it, position is stored as _ord — fine for lists that
   * append, but a list that prepends (history, downloads) would rewrite
   * every row's _ord on every insert, so those order by their own field.
   */
  constructor(table, { idField = 'id', legacyFile = null, fromLegacy = null, orderBy = null, order = 'ASC', store: st = null } = {}) {
    this.table = table; this.idField = idField; this.legacyFile = legacyFile; this.fromLegacy = fromLegacy;
    this.orderBy = orderBy; this.order = order; this._st = st;
  }
  get st() { return this._st ? this._st() : store(); }
  load() {
    _importOnce(this.st, this.table, this.legacyFile, this.fromLegacy, (rows) => this.replaceAll(Array.isArray(rows) ? rows : []));
    return this.st.all(this.table, {}, { orderBy: this.orderBy || '_ord', order: this.orderBy ? this.order : 'ASC' })
      .map(({ id, _ord, ...rest }) => (this.idField === 'id' ? { id, ...rest } : rest));
  }
  replaceAll(rows) {
    const st = this.st;
    const cur = new Map(st.all(this.table).map(r => [r.id, r]));
    (rows || []).forEach((row, i) => {
      const id = row[this.idField];
      if (id === undefined || id === null) return; // a record with no identity cannot be stored by row
      const next = this.orderBy ? { ...row, id: String(id) } : { ...row, id: String(id), _ord: i };
      const prev = cur.get(String(id));
      if (!prev || !_same(prev, next)) st.insert(this.table, next);
      cur.delete(String(id));
    });
    for (const k of cur.keys()) st.delete(this.table, { id: k });
  }
  flush() { this.st.flushAll(); }
}

module.exports = { store, setDir, JaaKV, JaaRows, CG_DIR };
