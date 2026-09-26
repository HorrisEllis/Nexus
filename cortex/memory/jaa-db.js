'use strict';
/**
 * cortex/memory/jaa-db.js — Cortex memory bridge
 * UUID: nexus-cortex-jaa-db-v1-0000-2026-0628-001
 *
 * Re-exports a shared JaaStore instance pointed at the cortex data dir.
 *
 * §CORRECTED 2026-07-18 — this used to say "single writer, multiple
 * readers, zero duplication." That was never actually true: every process
 * that requires this file gets its OWN JaaStore instance (module-level
 * singleton is per-process, not cross-process) pointed at the same
 * directory — idearium's API server and a concurrent CLI invocation are
 * two real, separate writers today, proven by direct reproduction (see
 * guardian/jaa-store.js's reloadTable() for the full account). What's
 * true is "one file per table, JSON-array format, shared by convention"
 * — not single-writer. reloadTable() below exists because of this.
 *
 * API surface (mirrors what callers expect):
 *   jaaDB.insert(table, row)           → row
 *   jaaDB.upsert(table, row, keyField?) → row
 *   jaaDB.get(table, where)            → row | null
 *   jaaDB.getById(table, id)           → row | null
 *   jaaDB.query(table, where?, opts?)  → row[]
 *   jaaDB.tail(table, n)               → row[]
 *   jaaDB.update(table, where, values) → count
 *   jaaDB.delete(table, where)         → count
 *   jaaDB.reloadTable(table)           → void — refresh from disk before a read-diff-write cycle
 *   jaaDB.uid()                        → uuid string
 *   uid()                              → uuid string (named export compat)
 */

const path = require('path');
const { JaaStore } = require('../../guardian/jaa-store');

// §SANDBOX 2026-08-18 — the store is now relocatable, which it was not.
//
// This was a hardcoded path with no override. Two consequences, both live:
//
//   1. tests/modules/test-user-continuity.js sets process.env.JAA_DATA_DIR
//      expecting an isolated temp store. Nothing read it, so that test has been
//      writing to the PRODUCTION store and passing — a test that believes it is
//      isolated and is not is worse than no isolation, because it is trusted.
//   2. lib/loom-map.js:74 documents "every OTHER JAA-backed module already
//      supports this via JAA_DATA_DIR". Nothing did. The comment described an
//      intention as a fact, which is how it went unnoticed.
//
// It is also the exact blocker for running NEXUS in a sandbox: the code can be
// shared read-only, but the STATE must be isolated or a learning agent is
// experimenting on production memory. One line, and the sandbox becomes possible.
// §SANDBOX 2026-09-25 — a test process gets a temp JAA_DATA_DIR from
// lib/test-sandbox.js before this is read (unless the test chose its own).
// Production: no-op, same path as before.
require('../../lib/test-sandbox.js').ensure();
const DATA_DIR = process.env.JAA_DATA_DIR || path.join(__dirname, '../../data/cortex/memory');

// Singleton — one store for the whole process
//
// §MEASURED 2026-07-24: the store is 14MB on disk and NINE processes each
// load all of it (cortex, guardian, orchestrator, loom, copilot, diagnostic,
// idearium, healer, agents) — roughly 400-600MB of RAM across the system
// holding nine copies of the same tables. That is the driver behind the
// recurring "free memory < 20%" pressure, the 0xC0000409 crashes, and the
// ERR_NO_BUFFER_SPACE socket exhaustion in the 2026-07-24 boot log.
//
// 77% of the store is TWO tables — idearium_spec_chunks (5.4MB) and
// idearium_spec_manifests (5.4MB) — whose ONLY consumers are
// idearium/spec-engine/index.js and idearium/lib/cortex-listeners.js
// (verified by grep, not assumed). Eight processes were holding 10.8MB each
// of data they never touch.
//
// These are skipped at preload. They still lazy-load on first access, so
// idearium reads them exactly as before — it just pays the load cost once,
// and nobody else pays it at all. No caller's behavior changes (§5.14).
const HEAVY_SINGLE_CONSUMER_TABLES = ['idearium_spec_chunks', 'idearium_spec_manifests'];

let _store = null;
function _getStore() {
  if (!_store) _store = new JaaStore(DATA_DIR, { skipTables: HEAVY_SINGLE_CONSUMER_TABLES });
  return _store;
}

// §PHASEMAP P3 (docs/cortex-schema-registry-phasemap.spec) — observe-on-write.
// After a row is inserted, consult the schema-registry and record a schema_drift
// row if the row deviates from the table's schema. NON-BLOCKING: the insert has
// already succeeded and returned; observation is a side-channel (§13.4 integrity
// by observation, not lockdown — James: fluid, not rigid). Recursion-guarded:
// the registry's OWN writes (schemas, schema_drift) must not trigger observation,
// or an insert would loop. §16.5 — wraps the facade, never touches the shared
// §WIRED 2026-09-02 — James, building toward "give agents context,
// persistent memory, reduce noise": lib/vector-memory.js's own real
// onJaaInsert(table, row) hook has existed since that module was
// built, but nothing in this file (the one real choke point every
// cortex-domain jaaDB write passes through) ever called it — checked
// directly, confirmed by grep, not assumed. The vector index has
// therefore been receiving zero real writes in production; every table
// already in EMBEDDABLE_TABLES has been dead weight. Fire-and-forget,
// same real non-blocking discipline _observeWrite (above) already
// uses — a slow or failed embed must never delay or break a real
// jaaDB write.
let _embedding = false;
function _observeForEmbedding(table, row) {
  if (_embedding) return; // reentrancy guard, same pattern as _observeWrite
  _embedding = true;
  try {
    const vm = require('../../lib/vector-memory.js');
    vm.onJaaInsert(table, row).catch(() => {}); // real, already-established fire-and-forget contract
  } catch (_) {
    // vector-memory unavailable (Ollama down, index not ready) — a
    // real, honest degradation, never a reason to fail the write itself.
  } finally {
    _embedding = false;
  }
}

// JaaStore class the 9 processes depend on.
const _OBSERVE_SKIP = new Set(['schemas', 'schema_drift', 'event_log', 'component_ledger']);
let _observing = false;   // reentrancy guard
function _observeWrite(table, row) {
  if (_observing) return;
  if (_OBSERVE_SKIP.has(table)) return;   // never observe the observer's own tables
  _observing = true;
  try {
    const reg = require('../../lib/schema-registry');
    const schema = reg.getSchema(table);
    if (!schema) return;   // unschematized table = unobserved, not drift (fluid)
    const verdict = reg.checkShape(table, row);
    if (verdict && verdict.drift) {
      // Record the deviation as data (the already-named SCHEMA_VIOLATION fault).
      _getStore().insert('schema_drift', {
        uuid: _uid(),
        kind: 'schema_drift',
        table,
        rowUuid: row && row.uuid || null,
        schemaVersion: verdict.schemaVersion,
        missing: verdict.missing,
        typeMismatches: verdict.typeMismatches,
        unexpected: verdict.unexpected,
        ts: Date.now(),
      });
    }
  } catch (_) {
    // §1.2 — a schema-registry failure must NEVER break a write. Observation is
    // best-effort; the data is already safely stored.
  } finally {
    _observing = false;
  }
}

// Thin adapter — exposes the jaaDB call shape used across the codebase
const jaaDB = {
  insert(table, row)             { const r = _getStore().insert(table, row); _observeWrite(table, r); _observeForEmbedding(table, r); return r; },
  upsert(table, row, keyField)   { return _getStore().upsert(table, row, keyField); },
  get(table, where)              { return _getStore().get(table, where); },
  getById(table, id)             { return _getStore().get(table, { id }); },
  query(table, where, opts)      { return _getStore().all(table, where, typeof opts === 'number' ? { limit: opts } : opts); },
  // §BUGFIX 2026-08-17 — was { orderBy: 'id', order: 'DESC' }. Checked
  // insert() directly: `id` is a real UUID (row.id || row.key || _uuid()),
  // never a sequential value — sorting UUID strings alphabetically has
  // ZERO correlation with insertion time or any 'ts' field a caller might
  // set. tail() has claimed to return "the most recent N rows" (its own
  // doc comment, line 24) for every one of its real callers across the
  // codebase while actually returning an effectively random N rows,
  // deterministic only in the sense that the same random slice repeats
  // until the table's contents change.
  //
  // Real fix: `tbl` in the underlying store is a genuine JS Map
  // (guardian/jaa-store.js's insert(): tbl.set(id, row)) — Map iteration
  // order is GUARANTEED insertion order by the language spec, which is
  // already correctly chronological, for free, with no sort needed at
  // all. all() with no orderBy returns exactly that natural order.
  tail(table, n) { const rows = _getStore().all(table, {}); const nn = n || 10; return rows.slice(-nn).reverse(); },
  update(table, where, values)   { return _getStore().update(table, where, values); },
  delete(table, where)           { return _getStore().delete(table, where); },
  count(table, where)            { return _getStore().count(table, where); },
  reloadTable(table)              { return _getStore().reloadTable(table); },
  uid()                          { return _uid(); },
  // raw store access for modules that need it
  _store()                       { return _getStore(); },
};

function _uid() {
  return require('crypto').randomUUID();
}

// ═══════════════════════════════════════════════════════════════════════════════
// JaaDB class — append-only JSONL journal store with tier-based decay.
//
// §BUILT 2026-07-20 against a pinned contract that predates it: 52 tests in
// tests/modules/jaa-db.test.js, plus tests/pipeline.test.js, plus a live
// caller — cos/manager.js's `new JaaDB({ root }); await db.open()` for
// sovereign per-compartment memory, which until now silently fell back to
// SHARED memory through a bare catch{} because this class didn't exist.
// Searched unintegrated/ and the whole tree first: no prior implementation
// anywhere — the tests were written against code that never landed.
//
// Deliberately a DIFFERENT storage design than JaaStore (guardian/jaa-store.js):
// JaaStore is JSON-array-per-table, last-write-wins; this is an append-only
// journal (one JSONL line per insert, `{_mutation:true, uuid, ...patch}` lines
// for updates, replayed in order on open). The pinned tests specify the
// journal format on disk byte-for-byte (they append raw lines and expect
// correct replay), so wrapping JaaStore was not an option.
//
// Tier semantics come from tiers.js — the single authority (§10.1), not
// duplicated here.
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const { TABLE_TIERS, MEMORY_TIERS, tierConfig } = require('./tiers.js');
const ALL_TABLES = Object.freeze(Object.keys(TABLE_TIERS));

class JaaDB {
  constructor(opts = {}) {
    // cos/manager.js passes { root }; the test suite passes { dir }. Both real.
    this.dir = opts.dir || opts.root || null;
    this._tables = {};
    this._streams = new Map();   // table → WriteStream (lazy)
    this._nextRowId = 1;
    this._ready = false;
  }

  async open(dir) {
    if (this._ready) return this;
    this.dir = dir || this.dir;
    if (!this.dir) throw new Error('[JaaDB] open() requires a directory ({dir}/{root} in constructor or open(dir))');
    fs.mkdirSync(this.dir, { recursive: true });

    for (const t of ALL_TABLES) if (!this._tables[t]) this._tables[t] = [];

    let maxRowId = 0;
    for (const f of fs.readdirSync(this.dir).filter(f => f.endsWith('.jsonl'))) {
      const table = f.slice(0, -6);
      if (!this._tables[table]) this._tables[table] = [];
      const raw = fs.readFileSync(path.join(this.dir, f), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch (_) { continue; } // corrupt line: skipped, neighbours survive
        if (obj && obj._mutation) {
          const row = this._tables[table].find(r => r.uuid === obj.uuid);
          if (row) {
            const { _mutation, uuid, ...patch } = obj;
            Object.assign(row, patch);
          }
          continue;
        }
        this._tables[table].push(obj);
        if (typeof obj._rowId === 'number' && obj._rowId > maxRowId) maxRowId = obj._rowId;
      }
    }
    this._nextRowId = maxRowId + 1;

    fs.writeFileSync(path.join(this.dir, '.cortex.pid'), String(process.pid));
    this._ready = true;
    return this;
  }

  async close() {
    const closings = [];
    for (const stream of this._streams.values()) {
      closings.push(new Promise((resolve) => {
        stream.end(() => resolve());
      }));
    }
    this._streams.clear();
    await Promise.all(closings);
    this._ready = false;
  }

  _append(table, obj) {
    let stream = this._streams.get(table);
    if (!stream) {
      stream = fs.createWriteStream(path.join(this.dir, `${table}.jsonl`), { flags: 'a' });
      this._streams.set(table, stream);
    }
    stream.write(JSON.stringify(obj) + '\n');
  }

  insert(table, row) {
    if (!this._tables[table]) this._tables[table] = []; // undeclared table: provisions silently
    const full = { ...row, _rowId: this._nextRowId++, _ts: Date.now() };
    this._tables[table].push(full);
    this._append(table, full);
    return full;
  }

  get(table, uuid) {
    const rows = this._tables[table];
    if (!rows) return null;
    return rows.find(r => r.uuid === uuid && !r._evicted) || null;
  }

  update(table, uuid, values) {
    const rows = this._tables[table];
    if (!rows) return null;
    const row = rows.find(r => r.uuid === uuid && !r._evicted);
    if (!row) return null;
    const _updatedAt = Date.now();
    Object.assign(row, values, { _updatedAt });
    this._append(table, { _mutation: true, uuid, ...values, _updatedAt });
    return row;
  }

  query(table, where, limit) {
    const rows = this._tables[table] || [];
    const pred = typeof where === 'function' ? where
      : typeof where === 'string' ? (r) => r.uuid === where || r.id === where
      : where && typeof where === 'object' ? (r) => Object.entries(where).every(([k, v]) => r[k] === v)
      : () => true;
    const out = [];
    for (const r of rows) {
      if (r._evicted || r._mutation) continue;
      if (!pred(r)) continue;
      out.push(r);
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  count(table, where) {
    return this.query(table, where).length;
  }

  tail(table, n = 10) {
    return (this._tables[table] || []).filter(r => !r._evicted && !r._mutation).slice(-n);
  }

  _weightFor(table, row, now = Date.now()) {
    const tierName = TABLE_TIERS[table];
    const config = tierName ? tierConfig(tierName) : null;
    if (!config || config.halfLifeMs == null) return 1.0; // long tier / unknown table: full weight
    const rowTs = row.ts ?? row._ts ?? row.createdAt;
    if (rowTs == null) return 1.0; // no age signal — don't guess an age
    const age = Math.max(0, now - rowTs);
    return Math.min(1, Math.pow(0.5, age / config.halfLifeMs));
  }

  queryWeighted(table, where, limit) {
    const now = Date.now();
    return this.query(table, where, limit).map(r => ({ ...r, _weight: this._weightFor(table, r, now) }));
  }

  _tickDecay() {
    const cycleId = _uid();
    const now = Date.now();
    let tablesChecked = 0;

    for (const [table, tierName] of Object.entries(TABLE_TIERS)) {
      const config = tierConfig(tierName);
      if (!config || config.evictAfterMs == null) continue; // long tier: never evicts (incl. decay_log itself)
      tablesChecked++;
      for (const row of (this._tables[table] || [])) {
        if (row._evicted || row._mutation) continue;
        const rowTs = row.ts ?? row._ts ?? row.createdAt;
        if (rowTs == null) continue; // no age signal — leave it, don't guess
        const age = now - rowTs;
        if (age < config.evictAfterMs) continue;

        const weightAtEviction = this._weightFor(table, row, now);
        row._evicted = true;
        row._evictedAt = now;
        this._append(table, { _mutation: true, uuid: row.uuid, _evicted: true, _evictedAt: now });
        this.insert('decay_log', {
          uuid: _uid(), cycleId, table, rowUuid: row.uuid,
          rowType: row.type ?? null, ageMs: age, weightAtEviction,
          evictedAt: now, ts: now,
        });
      }
    }

    this.insert('decay_log', {
      uuid: _uid(), cycleId, _isCycleSummary: true, tablesChecked,
      workingMemorySize: (this._tables['working_memory'] || []).length,
      ts: now,
    });
    return { cycleId, tablesChecked };
  }

  get stats() {
    const counts = {};
    for (const [t, rows] of Object.entries(this._tables)) {
      counts[t] = rows.filter(r => !r._evicted && !r._mutation).length;
    }
    const tiers = { working: [], short: [], long: [] };
    for (const t of ALL_TABLES) {
      const tier = TABLE_TIERS[t];
      (tiers[tier] = tiers[tier] || []).push({ table: t, rows: counts[t] || 0 });
    }
    return { counts, tiers };
  }
}

module.exports = { jaaDB, uid: _uid, JaaDB, TABLE_TIERS, MEMORY_TIERS, ALL_TABLES };
