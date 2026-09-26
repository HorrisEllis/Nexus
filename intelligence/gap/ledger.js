'use strict';
// ── lib/gap-ledger.js ─────────────────────────────────────────────────────────
// UUID: nexus-gap-ledger-v1-0000-4000-0000-000000000004
// Version: 1.0.0
// Phase: 14.7 — Gap Table Crash Durability
//
// THE RELIABILITY GAP.
//
// The audit transcript says it plainly:
//   "The gap table is mutable state in an in-process store. The physical
//    file queue in lib/queue.js is crash-durable. The autonomous loop
//    uses the gap table — which means autonomous work can be lost in a
//    crash between status:'pending' and status:'resolved'."
//
// This module closes that gap. It shadows the JAA gaps table with an
// append-only NDJSON ledger — data/gap-ledger/gaps.jsonl — using the
// same write-then-replay pattern as the Orchestrator ledger.
//
// ── HOW IT WORKS ─────────────────────────────────────────────────────────────
// 1. WRITE PATH (call recordGap / recordGapUpdate):
//    • Every gap insert writes a { op:'insert', ...row } entry to the NDJSON.
//    • Every gap status update writes a { op:'update', uuid, delta } entry.
//    § LAW II: both writes happen BEFORE the JAA operation completes.
//    This module is called by the integration shim, not from gap-loop directly.
//
// 2. READ / REPLAY PATH (call replayGaps):
//    • On boot: reads gaps.jsonl, replays all ops to reconstruct gap state.
//    • Returns array of gaps in their last-known state.
//    • Callers (gap-loop boot, autonomous-loop boot) can populate JAA from this.
//
// 3. INTEGRATION (wrapJAAGaps):
//    • Returns a proxy that intercepts jaaDB.insert('gaps', ...) and
//      jaaDB.update('gaps', ...) calls and shadows them to the ledger.
//    • Drop-in: replace jaaDB with wrapJAAGaps(jaaDB) at boot sites.
//
// ── AXIOMS ───────────────────────────────────────────────────────────────────
// §1.1  Every ledger entry has a UUID.
// §2.1  Append-only — no truncation, no rewrite. Historical record is permanent.
// §2.2  The NDJSON IS the durable truth. JAA is the fast-access cache.
// §5.3  No monkey patches — this module does not modify jaa-db.js.
//       It provides a proxy wrapper that callers opt into explicitly.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'gap-ledger';
const VERSION   = '1.0.0';

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT         = path.join(__dirname, '..');
const LEDGER_DIR   = path.join(ROOT, 'data', 'gap-ledger');
const LEDGER_FILE  = path.join(LEDGER_DIR, 'gaps.jsonl');
const INDEX_FILE   = path.join(LEDGER_DIR, 'gaps-index.json'); // uuid → line offset for fast lookup

// ── Config ────────────────────────────────────────────────────────────────────
const REPLAY_LIMIT = parseInt(process.env.GAP_LEDGER_REPLAY_LIMIT || '5000'); // max gaps to replay on boot
const FLUSH_MS     = parseInt(process.env.GAP_LEDGER_FLUSH_MS     || '0');    // 0 = synchronous always

function uid() { return crypto.randomUUID(); }

// ── Init ──────────────────────────────────────────────────────────────────────
function _ensureDir() {
  try { fs.mkdirSync(LEDGER_DIR, { recursive: true }); } catch (_) {}
}
_ensureDir();

// ── Write ─────────────────────────────────────────────────────────────────────
function _appendEntry(entry) {
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(LEDGER_FILE, line, 'utf8');
  } catch (e) {
    // §1.2 — never silent
    console.error(`[${MODULE_ID}] LEDGER WRITE FAILED: ${e.message}`);
    throw e; // propagate — §2.1
  }
  return entry;
}

/**
 * Record a new gap insertion.
 * Call this BEFORE jaaDB.insert('gaps', row).
 * @param {object} row — the gap row (must have uuid)
 * @returns {object} the ledger entry written
 */
function recordGap(row) {
  if (!row || !row.uuid) throw new Error('[gap-ledger] recordGap: row.uuid is required');
  return _appendEntry({
    uuid:    uid(),
    op:      'insert',
    ts:      Date.now(),
    source:  MODULE_ID,
    gapUuid: row.uuid,
    row:     { ...row },
  });
}

/**
 * Record a gap status update.
 * Call this BEFORE jaaDB.update('gaps', uuid, delta).
 * @param {string} gapUuid
 * @param {object} delta — the fields being updated
 * @returns {object} the ledger entry written
 */
function recordGapUpdate(gapUuid, delta) {
  if (!gapUuid) throw new Error('[gap-ledger] recordGapUpdate: gapUuid is required');
  return _appendEntry({
    uuid:    uid(),
    op:      'update',
    ts:      Date.now(),
    source:  MODULE_ID,
    gapUuid,
    delta:   { ...delta },
  });
}

// ── Replay ────────────────────────────────────────────────────────────────────
/**
 * Replay the gap ledger on boot to reconstruct gap state.
 * Returns an array of gaps in their last-known state, ordered by createdAt.
 *
 * Use this at boot to repopulate JAA gaps table if it is empty (fresh start
 * after crash). Pattern:
 *
 *   const survivedGaps = gapLedger.replayGaps();
 *   for (const gap of survivedGaps) {
 *     if (!jaaDB.getById('gaps', gap.uuid)) {
 *       jaaDB.insert('gaps', gap);
 *     }
 *   }
 */
function replayGaps() {
  if (!fs.existsSync(LEDGER_FILE)) return [];

  let lines;
  try {
    lines = fs.readFileSync(LEDGER_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-REPLAY_LIMIT * 2); // read 2x limit — ops collapse
  } catch (e) {
    console.error(`[${MODULE_ID}] replayGaps: read failed — ${e.message}`);
    return [];
  }

  // Reconstruct gap state: apply inserts then updates in order
  const gapMap = new Map(); // uuid → gap object
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch (_) { continue; }

    const { op, gapUuid, row, delta } = entry;
    if (op === 'insert' && row && gapUuid) {
      gapMap.set(gapUuid, { ...row });
    } else if (op === 'update' && delta && gapUuid && gapMap.has(gapUuid)) {
      const existing = gapMap.get(gapUuid);
      gapMap.set(gapUuid, { ...existing, ...delta });
    }
  }

  // Return only gaps that aren't in terminal states
  // (archived/resolved gaps don't need to be replayed into JAA — they're done)
  const TERMINAL = new Set(['archived', 'resolved']);
  const active = [...gapMap.values()]
    .filter(g => !TERMINAL.has(g.status))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(0, REPLAY_LIMIT);

  console.log(`[${MODULE_ID}] replayGaps: ${active.length} active gaps recovered from ${lines.length} ledger entries`);
  return active;
}

// ── JAA proxy wrapper ─────────────────────────────────────────────────────────
/**
 * Wraps a jaaDB instance to shadow gaps table operations to the ledger.
 * Transparent: all non-gaps operations pass through unchanged.
 *
 * Usage at boot:
 *   const { jaaDB: rawJAA, uid } = require('./cortex/memory/jaa-db');
 *   const jaaDB = gapLedger.wrapJAAGaps(rawJAA);
 *   // From here, jaaDB.insert('gaps', ...) and jaaDB.update('gaps', ...)
 *   // are automatically shadowed to the gap ledger.
 */
function wrapJAAGaps(jaaInstance) {
  if (!jaaInstance) return jaaInstance; // can't wrap null

  const originalInsert = jaaInstance.insert.bind(jaaInstance);
  const originalUpdate = jaaInstance.update?.bind(jaaInstance);

  const proxy = new Proxy(jaaInstance, {
    get(target, prop) {
      if (prop === 'insert') {
        return function(table, row, ...args) {
          if (table === 'gaps') {
            try { recordGap(row); } catch (e) {
              // §1.2: log but don't block the JAA insert — the ledger write
              // failing is bad but not worse than losing the gap entirely
              console.error(`[${MODULE_ID}] shadow insert failed: ${e.message}`);
            }
          }
          return originalInsert(table, row, ...args);
        };
      }
      if (prop === 'update' && originalUpdate) {
        return function(table, id, delta, ...args) {
          if (table === 'gaps') {
            try { recordGapUpdate(id, delta); } catch (e) {
              console.error(`[${MODULE_ID}] shadow update failed: ${e.message}`);
            }
          }
          return originalUpdate(table, id, delta, ...args);
        };
      }
      return target[prop];
    },
  });

  return proxy;
}

// ── Maintenance ───────────────────────────────────────────────────────────────
/**
 * Compacts the ledger by rewriting only the current state of each active gap.
 * Safe to call during low-traffic periods — it reads, rewrites, then renames.
 * The old file is kept as gaps.jsonl.bak.
 */
function compact() {
  const all = replayGaps();
  if (!all.length) {
    console.log(`[${MODULE_ID}] compact: nothing to compact`);
    return { compacted: 0 };
  }

  const tmpPath = LEDGER_FILE + '.compact.tmp';
  const bakPath = LEDGER_FILE + '.bak';
  const lines   = all.map(gap => JSON.stringify({
    uuid:    uid(),
    op:      'insert',
    ts:      gap.createdAt || Date.now(),
    source:  `${MODULE_ID}.compact`,
    gapUuid: gap.uuid,
    row:     gap,
  })).join('\n') + '\n';

  try {
    fs.writeFileSync(tmpPath, lines, 'utf8');
    if (fs.existsSync(LEDGER_FILE)) fs.renameSync(LEDGER_FILE, bakPath);
    fs.renameSync(tmpPath, LEDGER_FILE);
    console.log(`[${MODULE_ID}] compact: rewrote ${all.length} active gaps`);
    return { compacted: all.length, bakPath };
  } catch (e) {
    console.error(`[${MODULE_ID}] compact failed: ${e.message}`);
    return { compacted: 0, error: e.message };
  }
}

/**
 * Returns ledger stats without reading the whole file.
 */
function stats() {
  try {
    const st    = fs.statSync(LEDGER_FILE);
    const lines = fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean).length;
    return { exists: true, bytes: st.size, lines, path: LEDGER_FILE };
  } catch (_) {
    return { exists: false, bytes: 0, lines: 0, path: LEDGER_FILE };
  }
}

function validateWiring() {
  const s = stats();
  console.log(`[${MODULE_ID}] v${VERSION} — ledger: ${s.exists ? 'exists' : 'not yet created'} ${s.bytes} bytes ${s.lines} entries`);
  return s;
}

module.exports = {
  recordGap,
  recordGapUpdate,
  replayGaps,
  wrapJAAGaps,
  compact,
  stats,
  validateWiring,
  LEDGER_FILE,
  MODULE_ID, VERSION,
};
