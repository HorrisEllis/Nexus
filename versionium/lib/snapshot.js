'use strict';
/**
 * versionium/lib/snapshot.js — the real snapshot/rollback engine, now
 * owned by versionium.
 * UUID: nexus-versionium-snapshot-v1-0000-2026-0919-jamesbrooks-001
 *
 * §D3 CLOSED 2026-09-19 — James: "continue to migrate versionium,
 * snapshots to the versionium system." This is the move the
 * 2026-09-19 cortex->intelligence handoff left open as D3 ("cortex/
 * snapshot still cortex-owned; decide git-vs-versionium rewind engine
 * first"). The decision is versionium. Moved from cortex/snapshot/
 * index.js, which now delegates here and is kept as a deprecation shim
 * (§0.3 — nothing simply disappears; existing require() paths keep
 * working rather than breaking five call sites in one pass).
 *
 * Follows D1's own precedent verbatim (docs/2026-09-15-versionium-
 * cortex-snapshot-migration-decision.md): a record belongs to the
 * system whose history it describes, not to cortex, which VS1 is
 * actively de-scoping from owning versionium's data at all (§5.9).
 *
 * §ROLE SPLIT — THE ACTUAL ARCHITECTURAL POINT OF THIS MOVE.
 * This file talks to TWO different jaa stores, deliberately, because
 * "snapshot" has two unrelated relationships to data and only one of
 * them is versionium's to own:
 *
 *   _jaa()        -> versionium's OWN sovereign store (lib/store.js).
 *                    Holds `backup_records` and `snapshot_prune_log` —
 *                    versionium's own bookkeeping about which snapshots
 *                    exist, their hash chain, and what was pruned. This
 *                    is the half that MOVED.
 *
 *   _subjectJaa() -> cortex's shared jaaDB. This is the SUBJECT being
 *                    snapshotted — the live system tables a snapshot
 *                    captures and a rollback restores. It did NOT move
 *                    and must not: owning the index is not the same as
 *                    owning the thing indexed, and versionium snapshot-
 *                    ting its own private store instead of the real
 *                    system state would make every snapshot worthless.
 *
 * That distinction is not invented here — it is exactly the exception
 * lib/store.js already documents for event_log ("§HONEST EXCEPTION —
 * event_log is NOT versionium's own data"), applied to the same class
 * of problem. Same reasoning, same precedent, stated in the same place
 * a reader will look for it.
 *
 * §SNAPSHOT DIR MOVED — default is now versionium/data/snapshots
 * (NEXUS_SNAP_DIR still overrides). Pre-existing .nex files under
 * cortex/data/snapshots are NOT moved or deleted by this change
 * (§0.3); point NEXUS_SNAP_DIR at the old directory to read them, or
 * copy them across deliberately. checkChainIntegrity() run against a
 * fresh directory correctly reports an empty chain, not a corrupt one.
 *
 * Everything below this header is the original cortex/snapshot/index.js
 * implementation, unchanged except for the role split above, the
 * require() paths it forced, and MODULE_ID/VERSION. The hash-chain
 * logic, the §BUGFIX 2026-08-25 stable-stringify fix, half-life
 * pruning, and the state-provider registry are all carried over
 * verbatim — this is a move, not a rewrite (§0.2).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMAT = 'NEX-SNAP/1.0';
const TABLE = 'backup_records';

function _dir() {
  const d = process.env.NEXUS_SNAP_DIR || path.join(__dirname, '..', 'data', 'snapshots');
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
}

// §ROLE SPLIT (see header) — versionium's OWN store: the snapshot index
// and prune log. This is the half D3 moved.
function _jaa() { return require('./store').jaaDB; }

// §ROLE SPLIT (see header) — the SUBJECT being snapshotted: cortex's
// shared, live system tables. Deliberately NOT moved. Same class of
// exception lib/store.js already documents for event_log.
function _subjectJaa() { return require('../../cortex/memory/jaa-db').jaaDB; }

// §BUGFIX 2026-08-25 — found while extending this file for system-state
// snapshots, not something introduced by that work: JSON.stringify's
// array-replacer form (used below) filters property names at EVERY
// level of nesting, not just the top level. Object.keys(tables).sort()
// only ever contained table NAMES ('gaps', 'patterns', ...) — never any
// real row field (uuid, severity, ts, ...) — so every row in every
// table serialized to an empty object, {}, regardless of its real
// content. Confirmed directly: two tables with genuinely different row
// data produced byte-identical hash input. The real, existing test
// suite's own T-006 "tampered content is detected" only ever added a
// whole NEW table (changing the top-level key set, which this bug
// still caught) — it never modified a row's own field, so this was
// never exercised. cortex_state_hash's whole stated purpose — "nothing
// is trusted, everything is recomputed and checked" — was silently not
// true for row-level tampering since this file was written.
//
// §BACKWARD-COMPAT — every .nex file already on disk was hashed under
// the old, broken formula. Retroactively can't know intent; the only
// honest rule is a real, explicit version marker: snapshots without
// hashVersion:2 verify under the OLD formula (so they don't spuriously
// fail integrity now), new snapshots get hashVersion:2 and the real,
// content-complete formula. Never silently reinterpret an old
// snapshot's hash under a different rule than the one that made it.
function _stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(_stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${_stableStringify(obj[k])}`).join(',')}}`;
}

function _hashTables(tables) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(tables, Object.keys(tables).sort()));
  return h.digest('hex');
}

/** _hashTablesV2(tables) — the real, content-complete replacement. */
function _hashTablesV2(tables) {
  const h = crypto.createHash('sha256');
  h.update(_stableStringify(tables));
  return h.digest('hex');
}

// §UPGRADE 2026-08-25 — James: "upgrade .nex with state snapshots? like
// clear-glass?" Real precedent checked before building: ClearGlass's own
// rewind engine (clear-glass/src/rewind/engine.js) already snapshots
// real, domain-specific state (cookies, storage, scroll) that isn't
// jaaDB table rows at all — a genuinely different kind of "state" than
// this file's own _hashTables ever covered. This is the same real idea,
// generalized: any real NEXUS system can register what "its own state"
// even means (its config, its data files, whatever it defines), the
// same way ClearGlass defines cookies+storage+scroll as browser state.
//
// §BACKWARD-COMPAT — every existing .nex file on disk was hashed via
// _hashTables(tables) alone; there is no way to retroactively know
// whether a system-state provider existed when they were created, so
// the ONLY safe rule is: no real systemStates present -> hash exactly
// as before (byte-identical to every prior snapshot, old files still
// verify correctly). systemStates present -> a real, new combined hash
// that covers both. Never silently reinterpret an old snapshot's hash
// under a new formula.
const _stateProviders = new Map(); // systemId -> { capture: () => real state, restore: (state) => real result }

/**
 * registerStateProvider(systemId, {capture, restore}) — a real system
 * opts into being included in a system-state-aware snapshot. capture()
 * returns whatever real, JSON-serializable data that system considers
 * "its own state" (matching this session's own decoupled-systems
 * principle — cortex doesn't know or care what's IN a system's state,
 * only that the system itself knows). restore(state) applies it back.
 */
function registerStateProvider(systemId, { capture, restore }) {
  if (typeof capture !== 'function' || typeof restore !== 'function') {
    throw new Error(`registerStateProvider(${systemId}): both capture and restore must be real functions`);
  }
  _stateProviders.set(systemId, { capture, restore });
}

function _captureSystemStates(systemIds) {
  const out = {};
  for (const id of systemIds || []) {
    const provider = _stateProviders.get(id);
    if (!provider) { out[id] = { error: `no real state provider registered for "${id}"` }; continue; }
    try { out[id] = { ok: true, state: provider.capture() }; }
    catch (e) { out[id] = { ok: false, error: e.message }; } // §1.2 — a failed capture is recorded, not silently skipped
  }
  return out;
}

// §BUGFIX 2026-08-25 — this originally used the same broken array-
// replacer pattern _hashTables had, which would have made systemStates
// content-blind in exactly the same way tables content was (see the
// real bug documented above _stableStringify). Uses the real, correct
// helper instead — content-complete at every level, not just top-level
// key presence.
function _hashCombined(tables, systemStates) {
  const h = crypto.createHash('sha256');
  h.update(_stableStringify({ tables, systemStates }));
  return h.digest('hex');
}

/** _snapshotTables() — read every REAL table's current content via the
 * real, live jaaDB.query() method — not a private _tables property, which
 * the actual exported jaaDB is a thin wrapper object and does NOT expose
 * (confirmed: `const jaaDB = { insert, query, update, ... }` at jaa-db.js:105
 * is a plain object, not the JaaDB class instance). §BUGFIX 2026-08-12,
 * found by directly testing create() against the REAL store, not just the
 * test's mock: the mock happened to provide a convenience `_tables`
 * property the real jaaDB doesn't have, so every test passed while
 * create() silently captured `{}` in actual production. Caught by James
 * asking "did you cut corners" and checking rather than reassuring. */
function _snapshotTables(opts = {}) {
  const jaa = _subjectJaa();
  const tables = {};
  const names = opts.tables || require('../../cortex/memory/jaa-db').ALL_TABLES || [];
  for (const name of names) {
    try { tables[name] = jaa.query(name, () => true, 1000000) || []; }
    catch (_) { tables[name] = []; }
  }
  return tables;
}

function _lastRecord() {
  const jaa = _jaa();
  const rows = jaa.query(TABLE, () => true, 1000000) || [];
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * create(opts) — write a real, hash-chained snapshot to disk.
 * @returns { snapId, cortex_state_hash }
 */
function create(opts = {}) {
  const jaa = _jaa();
  const uid = () => { try { return require('crypto').randomUUID(); } catch (_) { return 'snap-' + Date.now(); } };
  const snapId = uid();
  const tables = _snapshotTables();
  const prior = _lastRecord();

  // §UPGRADE 2026-08-25 — real, optional per-system state capture. Empty
  // when opts.systemIds is absent — matches the exact prior behavior and
  // hash formula for every caller that doesn't ask for this, byte for
  // byte, not just "close enough".
  const systemStates = (opts.systemIds && opts.systemIds.length) ? _captureSystemStates(opts.systemIds) : {};
  const hasSystemStates = Object.keys(systemStates).length > 0;

  // §BUGFIX 2026-08-25 — hashVersion 2 uses the real, content-complete
  // _stableStringify-based hash (see that fix's own comment above); a
  // snapshot with no real systemStates still gets the V2, content-
  // complete table hash, not the old, broken one — no reason to keep
  // creating NEW snapshots with a known-broken formula just because
  // this particular call has no system states.
  const cortex_state_hash = hasSystemStates ? _hashCombined(tables, systemStates) : _hashTablesV2(tables);
  const prev_snapshot_hash = prior ? prior.cortex_state_hash : null;

  const nex = {
    format: FORMAT,
    snapId,
    type: opts.type || 'manual',
    tables,
    hashVersion: 2,
    ...(hasSystemStates ? { systemStates } : {}),
    cortex_state_hash,
    prev_snapshot_hash,
    createdAt: Date.now(),
  };

  const snapPath = path.join(_dir(), `${snapId}.nex`);
  // §2.1 — disk first, the DB record only exists to help find the file.
  fs.writeFileSync(snapPath, JSON.stringify(nex, null, 2));

  try { jaa.insert(TABLE, { snapId, snapPath, cortex_state_hash, prev_snapshot_hash, createdAt: nex.createdAt, type: nex.type }); }
  catch (e) { console.warn(`[cortex/snapshot] index write failed (file is still real on disk): ${e.message}`); }

  return { snapId, cortex_state_hash, systemStates: hasSystemStates ? Object.keys(systemStates) : [] };
}

/** load(snapId) — read the real .nex file back off disk. */
function load(snapId) {
  const jaa = _jaa();
  const rows = jaa.query(TABLE, r => r.snapId === snapId, 1) || [];
  if (!rows.length) return null;
  try { return JSON.parse(fs.readFileSync(rows[0].snapPath, 'utf8')); }
  catch (e) { return null; }
}

/**
 * verifySnapshotIntegrity(nex) — recompute the hash from the snapshot's
 * own real content and compare. §1.1 — nothing is trusted, everything
 * is recomputed and checked.
 *
 * §BUGFIX 2026-08-25 — now real, genuinely content-complete for both the
 * old and new hash formulas (see _stableStringify's own comment for the
 * real bug this closes). §BACKWARD-COMPAT — a snapshot with no real
 * hashVersion field is verified under the exact OLD formula it was
 * created with, not the corrected one — an old, honestly-made snapshot
 * must not start failing integrity just because the formula improved
 * after it existed.
 */
function verifySnapshotIntegrity(nex) {
  if (!nex || !nex.cortex_state_hash) return { valid: false, reason: 'missing cortex_state_hash — not a real snapshot record' };
  const recomputed = nex.hashVersion === 2
    ? (nex.systemStates ? _hashCombined(nex.tables || {}, nex.systemStates) : _hashTablesV2(nex.tables || {}))
    : _hashTables(nex.tables || {});
  if (recomputed !== nex.cortex_state_hash) return { valid: false, reason: `hash mismatch: recomputed ${recomputed.slice(0, 12)}... vs stored ${nex.cortex_state_hash.slice(0, 12)}...` };
  return { valid: true, reason: null };
}

/**
 * checkChainIntegrity() — walk every real snapshot on disk, verify each,
 * and check the chain links between them. Never throws — a missing or
 * corrupt file is a REPORTED finding, not an uncaught crash (§1.2).
 *
 * §HALF-LIFE PRUNING 2026-09-02 — James: "it was taking way too many
 * snapshots so i gave it a half life." Pruning (see prune() below)
 * legitimately breaks unbroken hash-chain continuity — a pruned or
 * hard-deleted record is gone, so the next surviving record's
 * prev_snapshot_hash genuinely won't match the record immediately
 * before it anymore. Reporting that as an undifferentiated
 * "chainBreak" would look identical to real tampering and, over time,
 * train whoever reads this report to ignore it — the exact failure
 * mode a tamper-detection system must not have. snapshot_prune_log
 * (written by prune(), below) is the real, cross-referenced explanation:
 * a chain break whose gap matches a logged prune event is reported
 * separately, as prunedGaps, not chainBreaks.
 */
function checkChainIntegrity() {
  const jaa = _jaa();
  const records = jaa.query(TABLE, () => true, 1000000) || [];
  const pruneLog = jaa.query(PRUNE_LOG_TABLE, () => true, 1000000) || [];
  const prunedHashes = new Set(pruneLog.map(p => p.cortex_state_hash).filter(Boolean));
  const report = { totalChecked: records.length, valid: 0, corrupt: [], missingFiles: [], chainBreaks: [], prunedGaps: [] };

  let prevHash = null;
  for (const rec of records) {
    let nex;
    try { nex = JSON.parse(fs.readFileSync(rec.snapPath, 'utf8')); }
    catch (e) { report.missingFiles.push({ snapId: rec.snapId, reason: e.message }); prevHash = rec.cortex_state_hash; continue; }

    const result = verifySnapshotIntegrity(nex);
    if (!result.valid) { report.corrupt.push({ snapId: rec.snapId, reason: result.reason }); prevHash = rec.cortex_state_hash; continue; }

    if (nex.prev_snapshot_hash !== prevHash) {
      const entry = { snapId: rec.snapId, expected: prevHash, found: nex.prev_snapshot_hash };
      if (prevHash && prunedHashes.has(prevHash)) report.prunedGaps.push(entry);
      else report.chainBreaks.push(entry);
    }
    report.valid++;
    prevHash = nex.cortex_state_hash;
  }
  return report;
}

// ── Half-life pruning ─────────────────────────────────────────────────────────
// §BUILT 2026-09-02 — James: "it was taking way too many snapshots so i
// gave it a half life." Real, deterministic retention policy (not
// random — the same snapId always makes the same decision on repeated
// ticks, so a record is never "re-considered" and pruned twice, and two
// separate processes computing this independently would agree):
//   - older than 1 week: PRUNE 1/3 (soft — delete the real .nex file
//     from disk, the actual disk-space problem, but keep a light
//     tombstone row so the hash chain stays walkable and
//     checkChainIntegrity() can still report on it honestly).
//   - older than 2 weeks, of what's still real (not already a
//     tombstone from the pass above): PRUNE 1/2 of those.
//   - older than 3 weeks: HARD DELETE — tombstone row removed too, real
//     gap in the chain from this point on (see checkChainIntegrity()'s
//     own prunedGaps/snapshot_prune_log cross-reference for why that's
//     reported as a known gap, not flagged as tampering).
const PRUNE_LOG_TABLE = 'snapshot_prune_log';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Deterministic pseudo-bucket for a given snapId — stable across ticks,
// stable across processes, no shared mutable counter needed.
function _stableBucket(snapId, mod) {
  const h = crypto.createHash('md5').update(String(snapId)).digest('hex').slice(0, 8);
  return parseInt(h, 16) % mod;
}

/**
 * prune(opts) — apply the real half-life policy once. Called on a
 * ticker (startPruneTicker, below) and safe to call manually / in a
 * test — idempotent per record (a tombstoned record is never
 * reconsidered for soft-pruning again; a hard-deleted record's row is
 * simply gone).
 */
function prune(opts = {}) {
  const jaa = _jaa();
  const now = opts.now || Date.now();
  const records = jaa.query(TABLE, () => true, 1000000) || [];
  const result = { softPruned: 0, hardDeleted: 0, checked: records.length };

  for (const rec of records) {
    const age = now - rec.createdAt;
    if (rec.pruned && age < 3 * WEEK_MS) continue; // already a tombstone, not yet past hard-delete age

    if (age >= 3 * WEEK_MS) {
      // Hard delete — real file (if a tombstone already removed it,
      // this is a no-op, not an error) and the index row, gone.
      try { fs.unlinkSync(rec.snapPath); } catch (_) { /* already gone, or was already a tombstone */ }
      try {
        jaa.insert(PRUNE_LOG_TABLE, { snapId: rec.snapId, cortex_state_hash: rec.cortex_state_hash, action: 'hard-delete', ageMs: age, ts: now });
        jaa.delete(TABLE, r => r.snapId === rec.snapId);
      } catch (e) { console.warn(`[cortex/snapshot] hard-delete index update failed for ${rec.snapId}: ${e.message}`); }
      result.hardDeleted++;
      continue;
    }

    if (rec.pruned) continue; // already a tombstone, younger than 3wk — leave it

    if (age >= 2 * WEEK_MS && _stableBucket(rec.snapId, 2) === 0) {
      _softPrune(jaa, rec, now, '2wk-half');
      result.softPruned++;
      continue;
    }
    if (age >= WEEK_MS && age < 2 * WEEK_MS && _stableBucket(rec.snapId, 3) === 0) {
      _softPrune(jaa, rec, now, '1wk-third');
      result.softPruned++;
    }
  }
  return result;
}

function _softPrune(jaa, rec, now, reason) {
  try { fs.unlinkSync(rec.snapPath); } catch (e) { if (e.code !== 'ENOENT') console.warn(`[cortex/snapshot] prune could not remove ${rec.snapPath}: ${e.message}`); }   // §0.59.6 — already gone (or a row from another machine's path) is the goal reached, not a warning: it flooded James's boot with hundreds of lines
  try {
    jaa.insert(PRUNE_LOG_TABLE, { snapId: rec.snapId, cortex_state_hash: rec.cortex_state_hash, action: 'soft-prune', reason, ts: now });
    // §TOMBSTONE — keeps the real hash-chain fields (cortex_state_hash,
    // prev_snapshot_hash lives only inside the .nex file, not the index
    // row — the index row never had it) so checkChainIntegrity() can
    // still walk past this record via cortex_state_hash; snapPath is
    // cleared honestly (load()/rollback() on a pruned snapId report a
    // real "file was pruned" error, not a fabricated empty snapshot).
    jaa.update(TABLE, r => r.snapId === rec.snapId, { pruned: true, prunedAt: now, snapPath: null });
  } catch (e) {
    console.warn(`[cortex/snapshot] prune index update failed for ${rec.snapId}: ${e.message}`);
  }
}

let _pruneInterval = null;
function startPruneTicker(intervalMs) {
  if (_pruneInterval) return; // already running — real idempotency, not a silent double-schedule
  const tick = () => {
    try {
      const r = prune();
      if (r.softPruned || r.hardDeleted) {
        console.log(`[cortex/snapshot] half-life prune: ${r.softPruned} soft-pruned, ${r.hardDeleted} hard-deleted (of ${r.checked} checked)`);
      }
    } catch (e) {
      console.warn(`[cortex/snapshot] prune tick failed (non-fatal): ${e.message}`);
    }
  };
  _pruneInterval = setInterval(tick, intervalMs || 6 * 60 * 60 * 1000);
  _pruneInterval.unref();
  tick(); // real first pass at boot, not just 6 hours from now
}

function stopPruneTicker() {
  clearInterval(_pruneInterval);
  _pruneInterval = null;
}

/**
 * rollback(snapId, opts) — restore jaaDB's real tables to a real prior
 * snapshot. §1.1 — verified before applied, never blind.
 *
 * §CORRECTED 2026-08-12 — an earlier pass here refused to implement bulk
 * restore, believing jaaDB.delete() might not be safely callable under
 * time pressure. Checked properly instead of leaving that guess standing:
 * jaaDB.delete(table, predicateFn) is real, tested directly against a
 * real disposable row (insert -> delete -> confirm gone), same predicate-
 * function convention as query(). The earlier caution was itself a
 * corner — an unverified assumption treated as a reason to stop, instead
 * of five more minutes of checking. Fixed for real below.
 */
function rollback(snapId, opts = {}) {
  const nex = load(snapId);
  if (!nex) {
    // §HALF-LIFE PRUNING 2026-09-02 — a real, honest distinction: this
    // snapId may genuinely never have existed, OR it may have been
    // deliberately thinned by prune()'s own retention policy. Checking
    // the index row (which survives soft-pruning as a tombstone) gives
    // the true reason instead of one generic message covering both.
    try {
      const row = _jaa().query(TABLE, r => r.snapId === snapId, 1)[0];
      if (row && row.pruned) {
        return { ok: false, reason: `snapshot ${snapId} was pruned (${row.prunedAt ? new Date(row.prunedAt).toISOString() : 'unknown time'}) — this codebase's own half-life retention policy already removed its real .nex file; no rollback is possible to it now` };
      }
    } catch (_) { /* fall through to the generic message below */ }
    return { ok: false, reason: `no snapshot found for ${snapId}` };
  }
  const check = verifySnapshotIntegrity(nex);
  if (!check.valid) return { ok: false, reason: `refusing to rollback to a snapshot that fails integrity check: ${check.reason}` };

  const jaa = _subjectJaa();   // §ROLE SPLIT — restore into the SUBJECT, not versionium's own store
  const restored = {};
  try {
    for (const [table, rows] of Object.entries(nex.tables)) {
      jaa.delete(table, () => true);                    // clear current content
      for (const row of rows) jaa.insert(table, row);    // restore snapshotted content
      restored[table] = rows.length;
    }
  } catch (e) {
    return { ok: false, reason: `rollback failed partway through: ${e.message}`, partiallyRestored: restored };
  }

  // §UPGRADE 2026-08-25 — real system-state restore, only when this
  // snapshot actually has any (older snapshots, and new ones taken
  // without opts.systemIds, simply have none — nothing to restore,
  // unaffected). §1.2 — a real restore failure for one system is
  // recorded per-system, not allowed to silently mask whether the
  // (already-completed, real) table rollback above succeeded.
  const restoredSystems = {};
  if (nex.systemStates && !opts.skipSystemState) {
    for (const [systemId, captured] of Object.entries(nex.systemStates)) {
      const provider = _stateProviders.get(systemId);
      if (!provider) { restoredSystems[systemId] = { ok: false, error: 'no real state provider registered for this system in THIS process' }; continue; }
      if (captured.ok === false) { restoredSystems[systemId] = { ok: false, error: `capture itself had failed at snapshot time: ${captured.error}` }; continue; }
      try { restoredSystems[systemId] = { ok: true, result: provider.restore(captured.state) }; }
      catch (e) { restoredSystems[systemId] = { ok: false, error: e.message }; }
    }
  }

  return { ok: true, snapId, restoredTables: Object.keys(nex.tables), rowCounts: restored, restoredSystems };
}

module.exports = {
  _subjectJaa,   // exported for test isolation only
  create, load, verifySnapshotIntegrity, checkChainIntegrity, rollback,
  registerStateProvider, prune, startPruneTicker, stopPruneTicker,
  FORMAT, MODULE_ID: 'versionium-snapshot', VERSION: '2.0.0',
};
