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

// ── §FIX 2026-09-17 — process-level flush-on-exit ──────────────────────────────
// One listener per process, shared across every JaaStore instance that process
// creates (cortex/memory/jaa-db.js's shared singleton, guardian/server.js's own
// store, etc. — each just calls _registerStore(this) from its constructor).
// Idempotent: a second construction in the same process adds to the Set, not a
// second listener.
const _liveStores = new Set();
let _exitHandlerInstalled = false;

function _registerStore(store) {
  _liveStores.add(store);
  if (_exitHandlerInstalled) return;
  _exitHandlerInstalled = true;
  const _flushAllOnSignal = (signal) => {
    console.log(`[jaa] ${signal} received — flushing ${_liveStores.size} store(s) before exit`);
    for (const s of _liveStores) {
      try { s.close(); } catch (e) { console.error('[jaa] flush-on-exit failed for a store:', e.message); }
    }
    // Re-raise the default behavior so the process actually exits afterward
    // rather than hanging on an unhandled signal.
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGTERM', () => _flushAllOnSignal('SIGTERM'));
  process.on('SIGINT',  () => _flushAllOnSignal('SIGINT'));
}

// ── JaaStore ───────────────────────────────────────────────────────────────────

class JaaStore {
  /**
   * @param {string} dir  Directory for .json files (memory_store/)
   * @param {object} [opts]
   * @param {string} [opts.tablePrefix]  §MULTI-TENANT 2026-07-18 — when
   *   multiple systems share one directory (see cortex/memory/jaa-db.js and
   *   guardian/server.js both constructing a JaaStore), an unprefixed
   *   instance's _loadAll() would blindly load every .json file in the
   *   directory as its own table — including another system's same-named
   *   table ('settings' exists in both cortex's and guardian's table lists
   *   today; without this, pointing guardian at cortex's directory would
   *   silently merge two unrelated 'settings' tables). Prefix is applied
   *   only at the disk-file layer (_file/_loadAll) — every caller keeps
   *   using bare table names ('settings', not 'guardian_settings'); the
   *   in-memory Maps and every existing insert/query/update call site are
   *   untouched. Same pattern idearium/lib/db.js already uses at the
   *   application level, pushed down into the store itself so a second
   *   consumer doesn't have to reimplement it.
   */
  constructor(dir, opts = {}) {
    this.dir         = dir;
    this.tablePrefix = opts.tablePrefix || '';
    this._tables  = new Map();  // table name → Map<id, row>
    this._dirty   = new Set();  // tables needing flush
    this._timers  = new Map();  // table → setTimeout handle
    this._pendingDeletes = new Map(); // table → Set<id> deleted by this process since its last flush
    this._closed  = false;
    // §2026-07-24 — optional selective-load allowlist. See _loadAll(). Omitted
    // = load everything (unchanged behavior). Declared = preload only these;
    // anything else lazily loads on first access with a warning.
    this._only = Array.isArray(opts.tables) && opts.tables.length
      ? new Set(opts.tables) : null;
    // §2026-07-24 — the inverse: skip named tables at preload. For a SHARED
    // singleton store (cortex/memory/jaa-db.js serves every process) no fixed
    // allowlist could be correct for all of them, but an exclusion of known
    // heavy single-consumer tables is. Excluded tables still lazy-load on
    // first access via _table(), so the one real consumer is unaffected.
    this._skip = Array.isArray(opts.skipTables) && opts.skipTables.length
      ? new Set(opts.skipTables) : null;

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._loadAll();
    // §0.39.241 — opts.settings === false: a store that is not guardian's own
    // (clear-glass's Responses index) skips guardian's DEFAULT_SETTINGS rows.
    if (opts.settings !== false) this._bootstrapSettings();
    console.log('[jaa] Store ready —', dir, this.tablePrefix ? `(prefix: ${this.tablePrefix})` : '');

    // §FIX 2026-09-17 — close() (flush + stop timers, above) has existed since
    // the flush-lock work but nothing ever called it on process exit. Every
    // kernel crash or supervisor restart therefore skipped it: dirty tables
    // never flushed and the in-progress flush's lock file (if any) was left
    // for the next boot to find and break as "STALE FLUSH LOCK ... presumed
    // crashed mid-flush" — a real, repeated symptom in boot logs, not a
    // hypothetical one. SIGTERM/SIGINT are the signals autopilot's normal
    // restart and shutdown paths actually send; a bare `process.kill()`/
    // taskkill /F still bypasses this, same as it bypasses any Node exit
    // handler, so this closes the ordinary-restart case, not every case.
    // Registered once per process (all instances in this process share the
    // listener) so N stores sharing a directory don't install N handlers.
    _registerStore(this);
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
      if (_matches(row, where)) {
        tbl.delete(id);
        n++;
        // §MULTI-PROCESS FIX 2026-07-18 — remember what THIS process
        // deleted, so the pre-flush merge (see _flush) can reload fresh
        // disk state without resurrecting a row this process just
        // legitimately removed. See _flush's own comment for why the
        // reload has to happen this late in the first place.
        if (!this._pendingDeletes.has(table)) this._pendingDeletes.set(table, new Set());
        this._pendingDeletes.get(table).add(id);
      }
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
    if (!this._tables.has(name)) {
      // §FIX 2026-07-24 — SAFETY for the `tables` allowlist. Previously this
      // created an empty Map for any unknown table, which is correct when the
      // table genuinely doesn't exist yet. But with a selective-load allowlist,
      // a process that under-declares would read a table that EXISTS ON DISK as
      // empty — silently losing data, the worst failure class in this codebase
      // (§1.2: fail loudly, never silently). So: if we skipped this table at
      // load time and a file for it exists, load it now, on first access.
      // Worst case is a slower first read; never a wrong answer.
      if ((this._only && !this._only.has(name)) || (this._skip && this._skip.has(name))) {
        try {
          if (fs.existsSync(this._file(name))) {
            // Warn ONCE per table, not per access. Without this guard the
            // message fires on every _table() call — thousands of lines in a
            // single run, which would drown the boot log it's meant to inform.
            if (!this._warnedTables) this._warnedTables = new Set();
            if (!this._warnedTables.has(name)) {
              this._warnedTables.add(name);
              console.warn(`[jaa] '${name}' was not in this store's declared tables — loading on demand. Add it to the tables list to preload.`);
            }
            // §FIX 2026-07-24b — create the slot BEFORE loading. _loadTable()
            // calls this._table(name) internally to get the Map to populate;
            // without this line that call re-enters this same lazy-load branch
            // (map still doesn't exist, skip-list still matches) and recurses
            // forever, re-reading and re-parsing the whole file at every level
            // since none of the stack frames ever return — that's the exact
            // heap-OOM idearium hit on first access to a skip-listed table.
            // Pre-setting an empty Map here means _loadTable's this._table()
            // call hits the has(name) branch and returns immediately instead.
            this._tables.set(name, new Map());
            this._loadTable(name);
          }
        } catch (_) { /* fall through to empty map */ }
      }
      if (!this._tables.has(name)) this._tables.set(name, new Map());
    }
    return this._tables.get(name);
  }

  _file(table) {
    return path.join(this.dir, `${this.tablePrefix}${table}.json`);
  }

  _loadAll() {
    // Load any existing JSON files in the store dir that belong to THIS
    // instance's namespace. Unprefixed instances (tablePrefix='') keep
    // exactly the old behavior — every .json file in the dir is theirs,
    // same as before this change. Prefixed instances only ever see their
    // own files; a shared directory's other tenants are invisible to them.
    //
    // §FIX 2026-07-24 — MEASURED memory finding, not a theory: the store is
    // 14MB on disk and NINE processes each load all of it (cortex, guardian,
    // orchestrator, loom, copilot, diagnostic, idearium, healer, agents).
    // Parsed to JS objects that is roughly 400-600MB of RAM holding nine
    // copies of the same tables — the driver behind the recurring
    // "free memory < 20%" pressure, the 0xC0000409 crashes, and the
    // ERR_NO_BUFFER_SPACE socket exhaustion in the 2026-07-24 log.
    // 77% of it is two tables (idearium_spec_chunks 5.4MB +
    // idearium_spec_manifests 5.4MB) that ONLY idearium reads — verified by
    // grep: idearium/spec-engine/index.js and idearium/lib/cortex-listeners.js
    // are the sole consumers. Eight processes hold 10.8MB each of data they
    // never touch.
    //
    // `tables` is an OPT-IN allowlist. Omitted → every table loads, exactly
    // as before, so no existing caller changes behavior (§5.14 — same
    // contract, replaceable implementation). A process that declares its
    // tables loads only those; anything it later asks for still works,
    // because _table() lazily loads on first access (see below).
    let files;
    try { files = fs.readdirSync(this.dir); }
    catch (_) { return; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const stem = f.slice(0, -5);
      if (this.tablePrefix) {
        if (!stem.startsWith(this.tablePrefix)) continue;
        const name = stem.slice(this.tablePrefix.length);
        if (this._only && !this._only.has(name)) continue;
        if (this._skip && this._skip.has(name)) continue;
        this._loadTable(name);
      } else {
        if (this._only && !this._only.has(stem)) continue;
        if (this._skip && this._skip.has(stem)) continue;
        this._loadTable(stem);
      }
    }
  }

  /**
   * reloadTable(name) — force-refresh this table's in-memory Map from
   * whatever is currently on disk, merging in any rows written by another
   * process since this instance last read them.
   *
   * §BUG FOUND AND FIXED 2026-07-18 — this file's own header claims
   * "single writer, multiple readers, zero duplication," but that was
   * never actually enforced: nothing stops two processes (idearium's own
   * API server and a concurrent CLI invocation both call getIdeaOS(),
   * each opening its own JaaStore pointed at the same directory) from
   * both holding this table open. Proven, not theorized: reproduced
   * directly — two processes each wrote 2 real rows to the same table,
   * final state had only 2 of the 4, the other process's writes were
   * silently destroyed by a plain overwrite that never saw them. The
   * root cause: query()/all() always read the in-process Map, populated
   * once at construction and never refreshed — a caller diffing "current
   * vs new" before a sync-style write was diffing against data that was
   * already stale the moment a second process existed. This method is
   * the fix's other half — callers doing a read-diff-write cycle (see
   * idearium/lib/db.js's syncTable) call this immediately before reading,
   * so the diff is against real current disk state, not a memory of what
   * disk looked like at boot.
   *
   * Known remaining limitation, not silently papered over: this ADDS/
   * UPDATES from disk into memory, it does not remove rows that exist in
   * memory but were deleted from disk by another process — _loadTable's
   * own behavior, inherited here deliberately rather than reimplemented,
   * since idearium's own rows are essentially never hard-deleted (§M1 —
   * archived in place, not removed). A consumer relying on real deletes
   * propagating correctly across processes would need more than this.
   */
  reloadTable(name) {
    // §FIX 2026-09-20 — James, from a real pasted log: intelligence/routes.js's
    // freshReader() throttles this to at most once per second PER POLLED
    // TABLE, but that's still once per second while something has that
    // table's endpoint open (e.g. a UI panel tailing /api/intelligence/
    // crystals) — "[jaa] Loaded 3 rows — crystals" printing every few
    // seconds forever, looking exactly like a crash-restart loop from the
    // outside when it's actually the cross-process freshness fix (§BUG
    // FOUND AND FIXED 2026-07-18, this method's own doc comment above)
    // working as designed, just loud about it. Silenced here — this is a
    // refresh, not a boot; _loadTable()'s cold-load callers (_loadAll(),
    // _table()'s on-demand branch) still log, since that IS worth knowing
    // once per process.
    this._loadTable(name, { silent: true });
  }

  _loadTable(name, { silent = false } = {}) {
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
        if (!silent) console.log(`[jaa] Loaded ${tbl.size} rows — ${name}`);
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

    // §MP-001 ROOT-CAUSE FIX 2026-07-24 — cross-process lock around the
    // whole read-merge-write cycle. Third occurrence of this bug class
    // (first closed 2026-07-15 with atomic rename, second 2026-07-18 with
    // the pre-flush merge below) — §17.7 says the third occurrence
    // promotes to architecture, and the 2026-07-18 comment below already
    // named the missing primitive itself: "not eliminated by anything
    // short of true cross-process locking." This is that primitive.
    //
    // PROVEN, not theorized, before building: deterministic reproduction
    // (frozen interleaving: B reads disk → A's entire flush lands → B
    // writes) destroys A's WHOLE BATCH, not just same-id collisions — the
    // old comment's "only way to lose a row is two writes to the SAME id
    // in the same few-millisecond window" claim was wrong, and matches
    // the whole-batch loss the (previously orphaned) MP-001 test showed
    // intermittently.
    //
    // Mechanism: O_EXCL lock file per table. 'wx' open is atomic at the
    // OS level (fails if the file exists) — the standard zero-dependency
    // cross-process mutex on every platform including Windows. Holder
    // writes its pid; a lock older than LOCK_STALE_MS is presumed
    // abandoned (holder crashed mid-flush) and broken loudly, not
    // silently. If the lock can't be acquired within LOCK_WAIT_MS, we
    // re-schedule this flush rather than proceeding unlocked — a delayed
    // write is recoverable, a clobbered one is not (§16.3: an invalid
    // state is refused, not passed through). Data stays safe in this
    // process's in-memory map + _dirty flag the entire time.
    //
    // §BUGFIX 2026-08-24 — _acquireFlushLock() now returns the real,
    // specific string 'gone' (not just falsy) when the lock file's own
    // parent directory is permanently missing — distinct from ordinary
    // lock contention (another process mid-flush), which is genuinely
    // transient and worth retrying. Without this distinction, a
    // permanently deleted directory (a test's own torn-down temp dir,
    // with a flush still pending) caused a real, confirmed-live infinite
    // retry loop — every 250ms, forever, since the directory never
    // comes back — which kept the whole Node process alive indefinitely.
    const lockResult = this._acquireFlushLock(table);
    if (lockResult === 'gone') {
      this._dirty.delete(table); // §1.2 — honest: the storage location is gone, there is nowhere left to write this to; not silently pretending it was saved
      return;
    }
    if (!lockResult) {
      this._dirty.add(table);        // keep it flagged
      this._schedule(table, 250);    // retry soon — lock holder's flush is ms-scale
      return;
    }

    try {
      const deletedByMe = this._pendingDeletes.get(table);
      try {
        const file = this._file(table);
        if (fs.existsSync(file)) {
          const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (Array.isArray(onDisk)) {
            for (const row of onDisk) {
              const id = row.id || row.key;
              if (id == null) continue;
              if (deletedByMe && deletedByMe.has(id)) continue; // respect this process's own pending delete
              if (!tbl.has(id)) tbl.set(id, { ...row, id }); // only fill in what THIS process doesn't already know about — do not clobber an in-flight local edit with an older on-disk copy
            }
          }
        }
      } catch (e) {
        console.error(`[jaa] pre-flush merge error (${table}): ${e.message} — flushing this process's own view only`);
      }
      this._pendingDeletes.delete(table);

      const rows = [...tbl.values()];
      const file = this._file(table);
      // §MULTI-PROCESS FIX 2026-07-15 — write to a temp file then rename over
      // the target, instead of writeFileSync-ing the target directly. A rename
      // is atomic at the filesystem level where an in-place write is not — a
      // second process reading this file mid-write can never observe a
      // truncated/corrupt partial JSON.
      //
      // §UPDATE 2026-07-18 — pre-flush merge added (above).
      // §UPDATE 2026-07-24 — the residual race that comment left open
      // ("two processes flushing the same table at the same instant both
      // merge against the same pre-write disk state") is now closed by the
      // flush lock wrapping this whole section: read-merge-write is a
      // critical section, exactly one process at a time.
      const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;
      try {
        fs.writeFileSync(tmpFile, JSON.stringify(rows, null, 0), 'utf8');
        fs.renameSync(tmpFile, file);
      } catch (e) {
        console.error(`[jaa] Flush error (${table}): ${e.message}`);
        try { fs.unlinkSync(tmpFile); } catch (_) {} // best-effort cleanup, don't mask the real error
      }
    } finally {
      this._releaseFlushLock(table);
    }
  }

  // ── §MP-001 cross-process flush lock ────────────────────────────────────────
  // O_EXCL ('wx') create is the atomic primitive; everything else is policy:
  //   - spin briefly (LOCK_WAIT_MS) — flushes are milliseconds, contention rare
  //   - a stale lock (holder crashed mid-flush) is broken LOUDLY after
  //     LOCK_STALE_MS, never silently (§1.2)
  //   - failure to acquire → caller re-schedules; never proceeds unlocked

  _lockFile(table) { return this._file(table) + '.lock'; }

  _acquireFlushLock(table) {
    const LOCK_WAIT_MS  = 200;   // total time to spin before giving up this attempt
    const LOCK_STALE_MS = 10000; // a flush takes ms — 10s means the holder died
    const lockPath = this._lockFile(table);
    const deadline = Date.now() + LOCK_WAIT_MS;

    for (;;) {
      try {
        const fd = fs.openSync(lockPath, 'wx'); // atomic create-or-fail
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
        return true;
      } catch (e) {
        if (e.code !== 'EEXIST') {
          // §BUGFIX 2026-08-24 — found while running the full real test
          // suite: this branch treated EVERY non-EEXIST error as
          // "transient, retry soon," including ENOENT from the lock
          // file's own PARENT DIRECTORY being gone (a test's temp dir,
          // torn down after the test finished, with a flush still
          // pending on a debounce timer). That's not transient — it's
          // permanent. The caller (_flush(), above) used to reschedule
          // on ANY falsy return, creating a real, genuine infinite
          // retry loop: every 250ms, forever, since the directory never
          // comes back. Confirmed live — 216+ identical errors in under
          // 15s, and the Node process never exited on its own (a real,
          // live-leaked process, not just noisy logs). Real fix: return
          // the distinct string 'gone' so the caller can tell "give up,
          // permanently" from "retry soon, this is normal contention."
          // §1.2 still applies — loud, not silent — but "loud once,
          // then give up" is the honest response to a permanently gone
          // directory; "loud forever" is not.
          console.error(`[jaa] flush-lock error (${table}): ${e.code} ${e.message}`);
          if (e.code === 'ENOENT' && !fs.existsSync(path.dirname(lockPath))) {
            console.error(`[jaa] flush-lock (${table}): parent directory is gone — this is permanent, not transient. Dropping this flush rather than retrying forever.`);
            return 'gone';
          }
          return false;
        }
        // Lock held. Stale?
        try {
          const st = fs.statSync(lockPath);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
            const holder = (() => { try { return fs.readFileSync(lockPath, 'utf8'); } catch (_) { return '?'; } })();
            console.error(`[jaa] BREAKING STALE FLUSH LOCK (${table}) — held by pid ${holder} for >${LOCK_STALE_MS}ms, presumed crashed mid-flush. (§1.2 — loud, never silent.)`);
            try { fs.unlinkSync(lockPath); } catch (_) {}
            continue; // retry the atomic create immediately
          }
        } catch (_) { /* lock vanished between EEXIST and stat — retry */ continue; }

        if (Date.now() >= deadline) return false;
        // Synchronous ms-scale busy-wait, deliberately: _flush is already a
        // synchronous fs function on a debounce timer, its callers hold no
        // locks of their own, and the expected hold time is single-digit ms.
        const until = Date.now() + 5;
        while (Date.now() < until) { /* spin 5ms */ }
      }
    }
  }

  _releaseFlushLock(table) {
    try { fs.unlinkSync(this._lockFile(table)); }
    catch (e) {
      // ENOENT here means someone broke our lock as stale mid-flush (we
      // held it >10s — shouldn't happen, worth hearing about). Anything
      // else is a real FS problem. Either way: loud, not swallowed.
      if (e.code !== 'ENOENT') console.error(`[jaa] flush-lock release error (${table}): ${e.code} ${e.message}`);
      else console.error(`[jaa] flush lock (${table}) was already gone at release — a peer broke it as stale; this process's flush exceeded the ${10000}ms stale threshold`);
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
  // §the systemic fix — `where` arrives as a predicate function at the
  // overwhelming majority of real call sites across this codebase
  // (raid/snr-filter.js, cortex/intelligence, lib/replay-engine.js,
  // lib/constitutional-ai.js, orchestrator/request-handler.js, and others).
  // Object.entries() on a function returns [], so the loop below never ran
  // and every one of those calls silently matched every row in the table,
  // ignoring the predicate entirely — reproduced directly: querying `gaps`
  // for a type that doesn't exist anywhere still returned rows. Object-shape
  // where clauses (the other real convention — fault-taxonomy.js, fix-map.js)
  // are unaffected by this branch.
  if (typeof where === 'function') return !!where(row);
  // Third sibling, same family, also reproduced before fixing: update(table,
  // someUuidString, values) — the convention copilot/lib/user-model.js and
  // orchestrator/lib/spec-drift.js both use. Object.entries() on a string
  // yields indexed characters ([['0','m'],...]), so it matched nothing and
  // every such update was a silent no-op. A string where matches by id or uuid.
  if (typeof where === 'string') return row.id === where || row.uuid === where;
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
