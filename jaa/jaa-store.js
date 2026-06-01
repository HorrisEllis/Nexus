/**
 * jaa-store.js — Guardian v8 Pure-JS Relational Store
 *
 * Zero native dependencies. Works on any platform, any Node version.
 * Jaa-inspired: tables-as-Maps, SISO-compliant, flat-file persistence.
 *
 * Persistence model:
 *   Each table → memory_store/<table>.json  (full snapshot on debounced write)
 *   On boot: load all tables from disk → rebuild in-memory Maps
 *
 * API (mirrors better-sqlite3 call shapes so server.js diff is minimal):
 *   store.run(table, op, row, where?)   → { changes, lastInsertRowid }
 *   store.get(table, where)             → row | null
 *   store.all(table, where, opts?)      → row[]
 *   store.insert(table, row)            → row
 *   store.upsert(table, row, keyField?) → row
 *   store.update(table, where, values)  → count
 *   store.delete(table, where)          → count
 *   store.count(table, where?)          → number
 *   store.exec(sql)                     → void  (ignored — compat shim)
 *   store.pragma(p)                     → void  (ignored — compat shim)
 *
 * Where clause: plain object { field: value, ... } — all fields must match (AND).
 * Opts: { orderBy, order: 'ASC'|'DESC', limit, offset }
 *
 * Settings table bootstrapped from schema defaults on first run.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Default settings (mirrors schema.sql INSERT OR IGNORE INTO settings) ──────

const DEFAULT_SETTINGS = {
  session_greeting_enabled: 'true',
  session_greeting_text:    'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',
  scan_debounce_ms:         '1500',
  artifact_max:             '500',
  gap_min_score:            '0.25',
  gap_taxonomy_version:     '3.0.0',
  pa_enabled:               'true',
  memory_auto_push:         'true',
  dropzone_auto_upload:     'true',
  stream_log_level:         'EVENTS',
  lan_host:                 '0.0.0.0',
  greeting_delay_ms:        '1200',
  poll_interval_ms:         '500',
  stable_count_threshold:   '5',
};

// ── JaaStore ───────────────────────────────────────────────────────────────────

class JaaStore {
  /**
   * @param {string} dir  Directory for .json files (memory_store/)
   */
  constructor(dir) {
    this.dir      = dir;
    this._tables  = new Map();  // table name → Map<id, row>
    this._dirty   = new Set();  // tables needing flush
    this._timers  = new Map();  // table → setTimeout handle
    this._closed  = false;

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._loadAll();
    this._bootstrapSettings();
    console.log('[jaa] Store ready —', dir);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /** INSERT a row. row.id must exist (caller provides UUID). */
  insert(table, row) {
    const tbl = this._table(table);
    const id  = row.id || row.key || _uuid();
    const r   = { ...row, id };
    tbl.set(id, r);
    this._schedule(table);
    return r;
  }

  /** INSERT OR REPLACE — upserts by keyField (default 'id'). */
  upsert(table, row, keyField = 'id') {
    const tbl = this._table(table);
    const key = row[keyField];
    if (key) {
      // find existing by keyField value
      for (const [id, existing] of tbl) {
        if (existing[keyField] === key) {
          const updated = { ...existing, ...row, id };
          tbl.set(id, updated);
          this._schedule(table);
          return updated;
        }
      }
    }
    return this.insert(table, row);
  }

  /** SELECT one row matching where. */
  get(table, where = {}) {
    const tbl = this._table(table);
    for (const row of tbl.values()) {
      if (_matches(row, where)) return { ...row };
    }
    return null;
  }

  /** SELECT all rows matching where with optional orderBy/limit. */
  all(table, where = {}, opts = {}) {
    const tbl  = this._table(table);
    let   rows = [];
    for (const row of tbl.values()) {
      if (_matches(row, where)) rows.push({ ...row });
    }
    if (opts.orderBy) {
      const dir = (opts.order || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
      rows.sort((a, b) => {
        const va = a[opts.orderBy], vb = b[opts.orderBy];
        if (va == null && vb == null) return 0;
        if (va == null) return dir;
        if (vb == null) return -dir;
        return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      });
    }
    if (opts.offset) rows = rows.slice(opts.offset);
    if (opts.limit)  rows = rows.slice(0, opts.limit);
    return rows;
  }

  /** UPDATE rows matching where with values object. Returns changed count. */
  update(table, where, values) {
    const tbl = this._table(table);
    let   n   = 0;
    for (const [id, row] of tbl) {
      if (_matches(row, where)) {
        tbl.set(id, { ...row, ...values });
        n++;
      }
    }
    if (n > 0) this._schedule(table);
    return n;
  }

  /** DELETE rows matching where. Returns deleted count. */
  delete(table, where) {
    const tbl = this._table(table);
    let   n   = 0;
    for (const [id, row] of tbl) {
      if (_matches(row, where)) { tbl.delete(id); n++; }
    }
    if (n > 0) this._schedule(table);
    return n;
  }

  /** COUNT rows matching where. */
  count(table, where = {}) {
    const tbl = this._table(table);
    if (!Object.keys(where).length) return tbl.size;
    let n = 0;
    for (const row of tbl.values()) if (_matches(row, where)) n++;
    return n;
  }

  // ── better-sqlite3 compat shims (so server.js dbRun/dbGet/dbAll still work) ─

  exec()   { /* schema DDL — no-op */ }
  pragma() { /* WAL/FK pragmas — no-op */ }

  // ── Settings helpers ──────────────────────────────────────────────────────────

  getSetting(key, fallback = null) {
    const row = this.get('settings', { key });
    return row ? row.value : fallback;
  }

  setSetting(key, value) {
    const ts  = Date.now();
    const row = this.get('settings', { key });
    if (row) {
      this.update('settings', { key }, { value: String(value), updated_ts: ts });
    } else {
      this.insert('settings', { id: _uuid(), key, value: String(value), updated_ts: ts });
    }
  }

  getAllSettings() {
    return this.all('settings').reduce((m, r) => { m[r.key] = r.value; return m; }, {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FULL-TEXT SEARCH
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Search across artifacts, gaps, and ledger for query string.
   * Returns { artifacts[], gaps[], ledger[] }
   */
  search(q, limit = 50) {
    if (!q) return { artifacts: [], gaps: [], ledger: [] };
    const ql = q.toLowerCase();
    const match = (row, fields) => fields.some(f => (row[f] || '').toLowerCase().includes(ql));
    return {
      artifacts: this.all('artifacts')
        .filter(r => match(r, ['name', 'content', 'lang', 'account', 'chat_id']))
        .slice(0, limit),
      gaps: this.all('gaps')
        .filter(r => match(r, ['description', 'type', 'domain']))
        .slice(0, limit),
      ledger: this.all('ledger_entries')
        .filter(r => match(r, ['msg', 'category']))
        .slice(0, limit),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STATS
  // ══════════════════════════════════════════════════════════════════════════

  stats() {
    return {
      artifacts:   this.count('artifacts'),
      gaps:        this.count('gaps'),
      ledger:      this.count('ledger_entries'),
      sessions:    this.count('sessions'),
      jobs:        this.count('jobs'),
      downloads:   this.count('downloads'),
      pa_sessions: this.count('pa_sessions'),
      settings:    this.count('settings'),
      dbFile:      path.join(this.dir, '*.json'),
      dbExists:    true,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PERSISTENCE
  // ══════════════════════════════════════════════════════════════════════════

  /** Force flush all dirty tables to disk. */
  flushAll() {
    for (const table of this._dirty) this._flush(table);
  }

  /** Graceful shutdown — flush all and stop timers. */
  close() {
    this._closed = true;
    for (const [, timer] of this._timers) clearTimeout(timer);
    this.flushAll();
    console.log('[jaa] Store closed — all tables flushed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PRIVATE
  // ══════════════════════════════════════════════════════════════════════════

  _table(name) {
    if (!this._tables.has(name)) this._tables.set(name, new Map());
    return this._tables.get(name);
  }

  _file(table) {
    return path.join(this.dir, `${table}.json`);
  }

  _loadAll() {
    // Load any existing JSON files in the store dir
    let files;
    try { files = fs.readdirSync(this.dir); }
    catch (_) { return; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const name = f.slice(0, -5);
      this._loadTable(name);
    }
  }

  _loadTable(name) {
    const file = this._file(name);
    if (!fs.existsSync(file)) return;
    try {
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      const tbl  = this._table(name);
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const id = row.id || row.key || _uuid();
          tbl.set(id, { ...row, id });
        }
        console.log(`[jaa] Loaded ${tbl.size} rows — ${name}`);
      }
    } catch (e) {
      console.error(`[jaa] Load error (${name}): ${e.message}`);
    }
  }

  _schedule(table, delay = 1500) {
    this._dirty.add(table);
    if (this._timers.has(table)) clearTimeout(this._timers.get(table));
    this._timers.set(table, setTimeout(() => {
      this._flush(table);
      this._timers.delete(table);
    }, delay));
  }

  _flush(table) {
    if (!this._dirty.has(table)) return;
    this._dirty.delete(table);
    const tbl  = this._tables.get(table);
    if (!tbl) return;
    const rows = [...tbl.values()];
    const file = this._file(table);
    try {
      fs.writeFileSync(file, JSON.stringify(rows, null, 0), 'utf8');
    } catch (e) {
      console.error(`[jaa] Flush error (${table}): ${e.message}`);
    }
  }

  _bootstrapSettings() {
    const tbl = this._table('settings');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      let exists = false;
      for (const row of tbl.values()) { if (row.key === key) { exists = true; break; } }
      if (!exists) {
        this.insert('settings', { id: _uuid(), key, value, updated_ts: Date.now() });
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _matches(row, where) {
  for (const [k, v] of Object.entries(where)) {
    if (v === null || v === undefined) {
      if (row[k] != null) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
}

let _uuidCounter = 0;
function _uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const t = Date.now().toString(16);
  const r = Math.random().toString(16).slice(2);
  const c = (++_uuidCounter).toString(16).padStart(4, '0');
  return `${t.slice(0,8)}-${t.slice(8,12)}-4${r.slice(0,3)}-${(8+Math.random()*4|0).toString(16)}${r.slice(4,7)}-${r.slice(7,19)}${c}`;
}

module.exports = { JaaStore };
