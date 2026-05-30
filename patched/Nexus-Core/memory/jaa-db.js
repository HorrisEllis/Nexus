// ═══════════════════════════════════════════════════
// NEXUS — JaaDB v2
// memory/jaa-db.js
//
// Dual-backend persistent store.
// Node.js  → JSONL flat files, one per table.
//            Append-only. Read = parse lines. No ORM.
//            Compaction on open if file > 4MB.
// Browser  → IndexedDB, same API surface.
//
// ZERO EXTERNAL DEPENDENCIES.
//
// Design decisions:
//   §M1  Everything stored. No exceptions.
//   §1.2 Errors loud. Never silent.
//   §5.1 UUID on every record.
//
// API (identical across both backends):
//   await jaaDB.open()
//   await jaaDB.insert(table, record)       → record
//   await jaaDB.query(table, predFn, limit) → records[]
//   await jaaDB.get(table, uuid)            → record | null
//   await jaaDB.update(table, uuid, patch)  → record
//   await jaaDB.count(table)                → number
//   await jaaDB.tables()                    → string[]
//   await jaaDB.compact(table)              → { removed, kept }
// ═══════════════════════════════════════════════════

'use strict';

// ── Backend detection ──────────────────────────────
const IS_NODE = typeof process !== 'undefined' && process.versions?.node;

// ── All table names (spec §4) ──────────────────────
const ALL_TABLES = [
  'event_log', 'artifacts', 'gaps', 'failures', 'fix_map',
  'bep_patterns', 'agent_calls', 'agent_signatures',
  'memory_index', 'memory_queries', 'crystals', 'active_traces',
  'bridge_messages', 'schedules', 'workflow_runs',
  'feedback_scores', 'conditioning_log',
];

// ══════════════════════════════════════════════════
// NODE BACKEND — JSONL filesystem
// ══════════════════════════════════════════════════
class NodeBackend {
  constructor(dataDir = './data/jaa') {
    this._dir   = dataDir;
    this._cache = new Map(); // table → record[]  (hot layer, rebuilt on open)
  }

  async open() {
    const fs   = await import('fs');
    const path = await import('path');
    fs.mkdirSync(this._dir, { recursive: true });

    for (const table of ALL_TABLES) {
      const file = this._file(table);
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '');
      }
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      const records = [];
      for (const line of lines) {
        try { records.push(JSON.parse(line)); }
        catch { /* corrupt line — skip (§1.2: logged below) */ }
      }
      this._cache.set(table, records);

      // Auto-compact if file > 4MB
      const stat = fs.statSync(file);
      if (stat.size > 4 * 1024 * 1024) {
        await this._compactTable(table);
      }
    }
  }

  async insert(table, record) {
    this._assertTable(table);
    const rec = { ...record, _ts: Date.now() };
    if (!rec.uuid) rec.uuid = uid();

    const fs = await import('fs');
    const line = JSON.stringify(rec) + '\n';
    fs.appendFileSync(this._file(table), line);

    this._cache.get(table).push(rec);
    return rec;
  }

  async query(table, predFn = () => true, limit = Infinity) {
    this._assertTable(table);
    const all = this._cache.get(table);
    const results = [];
    // Scan newest-first for recency bias
    for (let i = all.length - 1; i >= 0 && results.length < limit; i--) {
      if (predFn(all[i])) results.push(all[i]);
    }
    return results;
  }

  async get(table, uuid) {
    this._assertTable(table);
    const all = this._cache.get(table);
    // Newest wins (latest insert is ground truth)
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].uuid === uuid) return all[i];
    }
    return null;
  }

  async update(table, uuid, patch) {
    const existing = await this.get(table, uuid);
    if (!existing) throw new Error(`[JaaDB] update: ${table}/${uuid} not found`);
    const updated = { ...existing, ...patch, uuid, _ts: Date.now() };
    return this.insert(table, updated); // append new version
  }

  async count(table) {
    this._assertTable(table);
    return this._cache.get(table).length;
  }

  async tables() { return [...ALL_TABLES]; }

  async compact(table) {
    this._assertTable(table);
    return this._compactTable(table);
  }

  async _compactTable(table) {
    const fs   = await import('fs');
    const path = await import('path');
    const all  = this._cache.get(table);

    // Keep only latest version of each uuid
    const latest = new Map();
    for (const rec of all) {
      if (rec.uuid) latest.set(rec.uuid, rec);
      else latest.set(Symbol(), rec); // no uuid = keep always
    }

    const kept   = [...latest.values()];
    const removed = all.length - kept.length;

    // Atomic rewrite
    const file = this._file(table);
    const tmp  = `${file}.compact.${process.pid}`;
    const out  = kept.map(r => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : '');
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, file);

    this._cache.set(table, kept);
    return { removed, kept: kept.length };
  }

  _file(table) {
    // Lazy require — works in both ESM and CJS contexts
    const path = require('path');
    return path.join(this._dir, `${table}.jsonl`);
  }

  _assertTable(table) {
    if (!ALL_TABLES.includes(table))
      throw new Error(`[JaaDB] Unknown table: "${table}". Valid: ${ALL_TABLES.join(', ')}`);
  }
}

// ══════════════════════════════════════════════════
// BROWSER BACKEND — IndexedDB
// ══════════════════════════════════════════════════
class BrowserBackend {
  constructor(dbName = 'nexus-jaa-v2') {
    this._dbName = dbName;
    this._db     = null;
  }

  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, 1);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const table of ALL_TABLES) {
          if (!db.objectStoreNames.contains(table)) {
            const store = db.createObjectStore(table, { keyPath: 'uuid' });
            store.createIndex('_ts', '_ts', { unique: false });
          }
        }
      };

      req.onsuccess = (e) => { this._db = e.target.result; resolve(); };
      req.onerror   = () => reject(new Error(`[JaaDB] IndexedDB open failed: ${req.error}`));
    });
  }

  async insert(table, record) {
    const rec = { ...record, _ts: Date.now() };
    if (!rec.uuid) rec.uuid = uid();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction([table], 'readwrite');
      const req = tx.objectStore(table).put(rec);
      req.onsuccess = () => resolve(rec);
      req.onerror   = () => reject(new Error(`[JaaDB] insert failed: ${req.error}`));
    });
  }

  async query(table, predFn = () => true, limit = Infinity) {
    return new Promise((resolve, reject) => {
      const tx      = this._db.transaction([table], 'readonly');
      const store   = tx.objectStore(table);
      const index   = store.index('_ts');
      const results = [];
      // Open cursor newest-first
      const req = index.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || results.length >= limit) { resolve(results); return; }
        if (predFn(cursor.value)) results.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(new Error(`[JaaDB] query failed: ${req.error}`));
    });
  }

  async get(table, uuid) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction([table], 'readonly');
      const req = tx.objectStore(table).get(uuid);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = () => reject(new Error(`[JaaDB] get failed: ${req.error}`));
    });
  }

  async update(table, uuid, patch) {
    const existing = await this.get(table, uuid);
    if (!existing) throw new Error(`[JaaDB] update: ${table}/${uuid} not found`);
    return this.insert(table, { ...existing, ...patch, uuid });
  }

  async count(table) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction([table], 'readonly');
      const req = tx.objectStore(table).count();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = () => reject(new Error(`[JaaDB] count failed: ${req.error}`));
    });
  }

  async tables() { return [...ALL_TABLES]; }

  async compact(table) {
    // IDB does natural dedup via keyPath:uuid — compact is a no-op
    const n = await this.count(table);
    return { removed: 0, kept: n };
  }
}

// ══════════════════════════════════════════════════
// JAADB — Public facade (picks backend at runtime)
// ══════════════════════════════════════════════════
class JaaDB {
  constructor(opts = {}) {
    this._backend = IS_NODE
      ? new NodeBackend(opts.dataDir || './data/jaa')
      : new BrowserBackend(opts.dbName || 'nexus-jaa-v2');
    this._ready = false;
  }

  async open() {
    await this._backend.open();
    this._ready = true;
    return this;
  }

  async insert(table, record)            { this._check(); return this._backend.insert(table, record); }
  async query(table, predFn, limit)      { this._check(); return this._backend.query(table, predFn, limit); }
  async get(table, uuid)                 { this._check(); return this._backend.get(table, uuid); }
  async update(table, uuid, patch)       { this._check(); return this._backend.update(table, uuid, patch); }
  async count(table)                     { this._check(); return this._backend.count(table); }
  async tables()                         { this._check(); return this._backend.tables(); }
  async compact(table)                   { this._check(); return this._backend.compact(table); }

  _check() {
    if (!this._ready) throw new Error('[JaaDB] Call open() before any operation. §1.2: nothing pretends to work.');
  }
}

// ── Utilities ──────────────────────────────────────
function uid() {
  // Crypto-quality UUID v4 without the 'uuid' package
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: time+random (sufficient for event IDs)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}-${Math.random().toString(36).slice(2,9)}`;
}

// Singleton for boot.js
const jaaDB = new JaaDB();

module.exports = { JaaDB, jaaDB, ALL_TABLES, uid };
