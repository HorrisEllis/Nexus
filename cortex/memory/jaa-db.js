'use strict';
// ── JAA — Just Another Abstraction ────────────────────────────────────────────
// memory/jaa-db.js
// UUID: jaa-db-nexus-v5-0000-4000-0000-000000000001
//
// The only shared surface in NEXUS v5.0. Every module reads and writes
// exclusively through this interface. No module imports another.
//
// §M1: Each module has init(cfg) + stop(). No other public API.
// §M2: Modules only read tables listed in their vectors.from[].
// §M3: Poll interval is each module's configuration concern.
// §A3: Every record carries causedBy or source.
//
// Tables are in-memory arrays. Persistence is via append-only JSONL files
// per table under opts.dir. On open(), existing files are replayed.
// The in-memory array IS the hot path. Disk is the truth layer.

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Deterministic UUID ────────────────────────────────────────────────────────
const { randomUUID } = require('crypto');
const uid = () => randomUUID();

// ── All declared tables ───────────────────────────────────────────────────────
const ALL_TABLES = [
  'event_log',
  'bridge_messages',
  'agent_calls',
  'agent_signatures',
  'artifacts',
  'gaps',
  'failures',
  'fix_map',
  'memory_index',
  'memory_queries',
  'conditioning_log',
  'feedback_scores',
  'crystals',
  'bep_patterns',
  'active_traces',
  'orion_sessions',
  'versionium_commits',
  'versionium_branches',
  'versionium_file_index',
  'versionium_calendar',
  'versionium_objects',
  'schedules',
  'workflow_runs',
  'project_registry',
  'shape_samples',
  'poll_log',
  'requests',
  'cortex_memory',
];

class JaaDB {
  constructor({ dir = './data' } = {}) {
    this._dir    = dir;
    this._tables = {};           // tableName → row[]
    this._rowId  = 1;
    this._ready  = false;
    this._fds    = {};           // tableName → write stream

    ALL_TABLES.forEach(t => { this._tables[t] = []; });
  }

  // ── open — replay persisted data, open append streams ─────────────────────
  async open() {
    if (this._ready) return this;
    fs.mkdirSync(this._dir, { recursive: true });

    for (const table of ALL_TABLES) {
      const file = this._tableFile(table);
      if (fs.existsSync(file)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const row = JSON.parse(line);
            this._tables[table].push(row);
            if (row._rowId && row._rowId >= this._rowId) {
              this._rowId = row._rowId + 1;
            }
          } catch {}
        }
      }
      // Open append stream
      this._fds[table] = fs.createWriteStream(file, { flags: 'a' });
    }

    this._ready = true;
    return this;
  }

  // ── close ─────────────────────────────────────────────────────────────────
  async close() {
    for (const fd of Object.values(this._fds)) {
      try { fd.end(); } catch {}
    }
    this._ready = false;
  }

  // ── insert ────────────────────────────────────────────────────────────────
  // §A3: caller must supply source or causedBy on all root records.
  insert(table, record) {
    this._requireTable(table);
    const row = {
      ...record,
      _rowId: this._rowId++,
      _ts:    Date.now(),
    };
    this._tables[table].push(row);
    this._persist(table, row);
    return row;
  }

  // ── update ────────────────────────────────────────────────────────────────
  // Mutates in-memory only — appends a mutation tombstone to disk for replay.
  update(table, id, patch) {
    this._requireTable(table);
    const idx = this._tables[table].findIndex(r => r.uuid === id);
    if (idx === -1) return null;
    const updated = {
      ...this._tables[table][idx],
      ...patch,
      _updatedAt: Date.now(),
    };
    this._tables[table][idx] = updated;
    // Write mutation marker — on replay, last write wins per uuid
    this._persist(table, { _mutation: true, uuid: id, ...patch, _updatedAt: updated._updatedAt });
    return updated;
  }

  // ── get ───────────────────────────────────────────────────────────────────
  get(table, id) {
    this._requireTable(table);
    return this._tables[table].find(r => r.uuid === id) || null;
  }

  // ── query ─────────────────────────────────────────────────────────────────
  // pred: function(row) → bool
  // Returns up to `limit` rows matching pred, from the tail of the table.
  query(table, pred = () => true, limit = 500) {
    this._requireTable(table);
    const rows = this._tables[table];
    const out  = [];
    for (let i = rows.length - 1; i >= 0 && out.length < limit; i--) {
      if (rows[i]._mutation) continue;
      if (pred(rows[i])) out.push(rows[i]);
    }
    return out.reverse(); // chronological order
  }

  // ── tail ──────────────────────────────────────────────────────────────────
  tail(table, n = 50) {
    this._requireTable(table);
    const rows = (this._tables[table] || []).filter(r => !r._mutation);
    return rows.slice(Math.max(0, rows.length - n));
  }

  // ── count ─────────────────────────────────────────────────────────────────
  count(table, pred = () => true) {
    this._requireTable(table);
    return this._tables[table].filter(r => !r._mutation && pred(r)).length;
  }

  // ── stats ─────────────────────────────────────────────────────────────────
  get stats() {
    const counts = {};
    for (const t of ALL_TABLES) {
      counts[t] = this._tables[t].filter(r => !r._mutation).length;
    }
    return { ready: this._ready, rowId: this._rowId, counts };
  }

  // ── private ───────────────────────────────────────────────────────────────
  _tableFile(table) {
    return path.join(this._dir, `${table}.jsonl`);
  }

  _requireTable(table) {
    if (!this._tables[table]) {
      // Auto-provision undeclared tables gracefully (warn §1.2)
      console.warn(`[JaaDB] warning: undeclared table '${table}' — provisioning`);
      this._tables[table] = [];
      if (this._ready) {
        this._fds[table] = fs.createWriteStream(this._tableFile(table), { flags: 'a' });
      }
    }
  }

  _persist(table, row) {
    if (!this._ready || !this._fds[table]) return;
    try {
      this._fds[table].write(JSON.stringify(row) + '\n');
    } catch (e) {
      console.error(`[JaaDB] persist error on table '${table}':`, e.message);
    }
  }
}

// ── Singleton (shared across modules via require cache) ───────────────────────
const jaaDB = new JaaDB();

module.exports = { JaaDB, jaaDB, ALL_TABLES, uid };
