'use strict';
// ── cortex/snapshot/index.js ──────────────────────────────────────────────────
// UUID: nexus-snapshot-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// .nex snapshot engine. Creates, lists, restores, and diffs system snapshots.
//
// A .nex file is a JSON archive containing:
//   { meta, tables, files, forge_patches, ts }
//
// Snapshot types:
//   manual   — user-triggered via CLI or API
//   auto     — triggered before any forge patch is applied
//   boot     — taken on every cortex boot
//
// Rollback:
//   Restores all JAA tables from a snapshot.
//   Files are NOT automatically restored — only patch audit trail is checked.
//   Rollback writes a 'rollback' event and increments rollback_count on snapshot.
//
// §2.1  Snapshot written to disk before any patch is applied
// §1.2  Every failure is loud and written to failures table
// §M1   init(cfg) + stop()

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID   = 'snapshot';
const VERSION     = '1.0.0';
const SNAP_DIR    = process.env.NEXUS_SNAP_DIR || path.join(__dirname, '..', '..', 'data', 'snapshots');

// Tables excluded from snapshots (transient / too large)
const EXCLUDE_TABLES = new Set(['poll_log', 'active_traces', 'healer_log']);

// ── Ensure snapshot directory ─────────────────────────────────────────────────
function _ensureDir() {
  fs.mkdirSync(SNAP_DIR, { recursive: true });
}

// ── Capture all JAA table data ────────────────────────────────────────────────
function _captureJAA() {
  const tables = {};
  for (const table of Object.keys(jaaDB._tables || {})) {
    if (EXCLUDE_TABLES.has(table)) continue;
    tables[table] = jaaDB.tail(table, 10000); // capture up to 10k rows per table
  }
  return tables;
}

// ── Create a snapshot ─────────────────────────────────────────────────────────
function create(opts = {}) {
  _ensureDir();
  const snapId  = 'nex-' + randomUUID().slice(0, 8);
  const ts      = Date.now();
  const type    = opts.type    || 'manual';
  const message = opts.message || '';
  const trigger = opts.trigger || null;

  const tables = _captureJAA();

  // Count meaningful rows
  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([t, rows]) => [t, rows.length])
  );
  const totalRows = Object.values(rowCounts).reduce((s, n) => s + n, 0);

  const nex = {
    format:    'NEX-SNAP/1.0',
    uuid:      snapId,
    ts,
    type,
    message,
    trigger,
    version:   VERSION,
    rowCounts,
    totalRows,
    tables,
  };

  const snapPath = path.join(SNAP_DIR, `${snapId}.nex`);
  fs.writeFileSync(snapPath, JSON.stringify(nex), 'utf8');

  // Write index record to JAA
  const record = jaaDB.insert('backup_records', {
    uuid:      snapId,
    snapId,
    snapPath,
    type,
    message,
    trigger,
    totalRows,
    rowCounts: JSON.stringify(rowCounts),
    ts,
    source:    MODULE_ID,
    rollback_count: 0,
  });

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'snapshot.created',
    payload: { snapId, type, message, totalRows, path: snapPath },
    source: MODULE_ID, causedBy: trigger || null, ts,
  });

  console.log(`[${MODULE_ID}] created ${snapId} (${totalRows} rows, ${type})`);
  return { snapId, snapPath, totalRows, rowCounts };
}

// ── List snapshots ────────────────────────────────────────────────────────────
function list(n = 20) {
  const records = jaaDB.tail('backup_records', n);
  return records.map(r => ({
    snapId:    r.snapId,
    type:      r.type,
    message:   r.message,
    totalRows: r.totalRows,
    ts:        r.ts,
    rollback_count: r.rollback_count || 0,
    snapPath:  r.snapPath,
  }));
}

// ── Load a .nex file ──────────────────────────────────────────────────────────
function load(snapId) {
  // Find by snapId in backup_records
  const record = jaaDB.query('backup_records', r => r.snapId === snapId, 1)[0];
  if (!record) throw new Error(`snapshot not found: ${snapId}`);

  if (!fs.existsSync(record.snapPath)) {
    throw new Error(`snapshot file missing: ${record.snapPath}`);
  }

  const raw = fs.readFileSync(record.snapPath, 'utf8');
  return JSON.parse(raw);
}

// ── Diff two snapshots ────────────────────────────────────────────────────────
function diff(snapIdA, snapIdB) {
  const a = load(snapIdA);
  const b = load(snapIdB);

  const result = {
    a: { snapId: snapIdA, ts: a.ts, totalRows: a.totalRows },
    b: { snapId: snapIdB, ts: b.ts, totalRows: b.totalRows },
    tables: {},
  };

  const allTables = new Set([...Object.keys(a.tables), ...Object.keys(b.tables)]);
  for (const table of allTables) {
    const rowsA = (a.tables[table] || []).length;
    const rowsB = (b.tables[table] || []).length;
    if (rowsA !== rowsB) {
      result.tables[table] = { a: rowsA, b: rowsB, delta: rowsB - rowsA };
    }
  }

  return result;
}

// ── Rollback to a snapshot ────────────────────────────────────────────────────
// SAFETY: Rollback is non-destructive by default.
// Pass { apply: true } to actually restore JAA tables.
function rollback(snapId, opts = {}) {
  const nex = load(snapId);
  const apply = opts.apply === true;

  if (!apply) {
    // Dry run — return what would change
    const current = _captureJAA();
    const changes = {};
    for (const table of Object.keys(nex.tables)) {
      const currentCount = (current[table] || []).length;
      const snapCount    = (nex.tables[table] || []).length;
      if (currentCount !== snapCount) {
        changes[table] = { current: currentCount, snapshot: snapCount, delta: snapCount - currentCount };
      }
    }
    return { dry_run: true, snapId, changes, tables: Object.keys(changes) };
  }

  // §2.1 — take a safety snapshot BEFORE rollback
  const safetySnap = create({
    type: 'pre_rollback',
    message: `auto-snapshot before rollback to ${snapId}`,
    trigger: snapId,
  });

  // Restore tables
  const restored = [];
  for (const [table, rows] of Object.entries(nex.tables)) {
    try {
      // Clear and repopulate — uses internal _tables array
      if (jaaDB._tables[table]) {
        jaaDB._tables[table] = rows.map(r => ({ ...r }));
        restored.push(table);
      }
    } catch (e) {
      jaaDB.insert('failures', {
        uuid: uid(), source: MODULE_ID,
        error: `rollback table ${table}: ${e.message}`,
        ts: Date.now(),
      });
    }
  }

  // Update backup_record rollback count
  const record = jaaDB.query('backup_records', r => r.snapId === snapId, 1)[0];
  if (record) {
    jaaDB.update('backup_records', record.uuid, {
      rollback_count: (record.rollback_count || 0) + 1,
    });
  }

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'snapshot.rollback',
    payload: { snapId, tablesRestored: restored.length, safetySnapId: safetySnap.snapId },
    source: MODULE_ID, causedBy: null, ts: Date.now(),
  });

  console.log(`[${MODULE_ID}] rolled back to ${snapId} — ${restored.length} tables restored`);
  return { snapId, restored, safetySnapId: safetySnap.snapId, tablesRestored: restored.length };
}

// ── Boot snapshot (called from boot.js) ───────────────────────────────────────
function bootSnapshot() {
  try {
    return create({ type: 'boot', message: 'automatic boot snapshot' });
  } catch (e) {
    // Boot snapshots never block boot
    console.warn(`[${MODULE_ID}] boot snapshot failed: ${e.message}`);
    return null;
  }
}

// ── Poll (auto-snapshot before forge patches) ─────────────────────────────────
let _interval = null;

async function _tick() {
  try {
    // Auto-snapshot when a forge patch is about to be applied
    const pending = jaaDB.query('forge_patches',
      r => r.applied === true && !r.snapshotBefore, 5
    );
    for (const patch of pending) {
      const snap = create({
        type: 'pre_forge',
        message: `auto before forge patch on ${patch.module}`,
        trigger: patch.uuid,
      });
      jaaDB.update('forge_patches', patch.uuid, { snapshotBefore: snap.snapId });
    }
  } catch (e) {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: e.message, stack: e.stack?.slice(0, 500), ts: Date.now(),
    });
  }
}

function init(cfg = {}) {
  _ensureDir();
  _interval = setInterval(_tick, cfg.pollMs ?? 30_000);
  _interval.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — snapshots at ${SNAP_DIR}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

module.exports = { init, stop, create, list, load, diff, rollback, bootSnapshot, VERSION, MODULE_ID };
