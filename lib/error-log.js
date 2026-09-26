'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/error-log.js — the one physical error log (agnostic lib tool)
// UUID: nexus-error-log-v1-0000-2026-0817-001
// Version: 1.0.0
// Component: lib.error-log
// Hook: lib.error-log:v1:p0001
//
// James: "…with event ledger that matches the event ledger schema. error.log."
//
// WHAT ALREADY EXISTED, AND WHY IT WASN'T ENOUGH — lib/activity-log already
// posts error rows to a cortex `error_log` TABLE. That is real and it stays.
// But a table in JAA is only readable if cortex is up and the store is
// loadable, and the failures you most need to read are exactly the ones where
// that is not true: a boot halt, a wedged store, a crashed kernel. The five
// CRASHED test suites in the 2026-08-17 run printed their stack traces to
// stdout and nowhere else — nothing about them is queryable today.
//
// THIS: a plain append-only file at data/error.log, one JSON object per line,
// in the SAME schema as lib/component-ledger — so an error row is a ledger row,
// readable by the same parsers, and `tail -f data/error.log` works when
// everything else is down. §2.1 disk first. Deliberately dependency-free: it
// must outlive the systems it reports on.
//
// §1.1 — a row with no system/component/action is refused, not guessed at.
// §1.2 — a write failure here NEVER throws to the caller. Telemetry is not in
// the critical path. But it is counted, and health() reports it, because a
// silently broken error log is worse than none at all.
// §0.3 — append-only. Rotates by size, keeps the previous file; nothing is
// deleted to make room.
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const MODULE_ID = 'error-log';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.error-log';
const HOOK_ID   = 'lib.error-log:v1:p0001';

const DATA_ROOT = path.join(__dirname, '..', 'data');
const LOG_PATH  = process.env.NEXUS_ERROR_LOG || path.join(DATA_ROOT, 'error.log');
const MAX_BYTES = parseInt(process.env.NEXUS_ERROR_LOG_MAX || String(16 * 1024 * 1024), 10);
const DETAIL_MAX = parseInt(process.env.LEDGER_DETAIL_MAX || '16384', 10);   // same cap as component-ledger

// Mirrors lib/activity-log._isError and lib/ledger-sse._statusOf. One rule for
// "is this an error" across all three, so they cannot disagree about what gets
// recorded — a disagreement here would look like data loss.
const ERROR_RE = /error|fail|crash|denied|exception|fault|unreachable|reject/;

let _written = 0, _refused = 0, _writeErrors = 0, _lastWriteError = null;

function isError(row) {
  if (!row) return false;
  if (row.status && ERROR_RE.test(String(row.status).toLowerCase())) return true;
  const probe = `${row.type || ''} ${row.action || ''} ${row.component || ''}`.toLowerCase();
  if (ERROR_RE.test(probe)) return true;
  const d = row.detail || row.payload;
  return !!(d && typeof d === 'object' && (d.error || d.failed || d.severity === 'high'));
}

/**
 * write(row) — append one error, in canonical ledger schema.
 * Returns the written row, or null if refused (§1.1). Never throws.
 */
function write(row) {
  if (!row || !row.system || !row.component || !row.action) {
    _refused++;
    console.warn(`[${MODULE_ID}] §1.1 write() refused — missing system/component/action`,
      { system: row && row.system, component: row && row.component, action: row && row.action });
    return null;
  }

  let detail = row.detail != null ? row.detail : null;
  if (detail != null) {
    let enc = null, unserializable = false;
    try { enc = typeof detail === 'string' ? detail : JSON.stringify(detail); }
    catch (e) { unserializable = e.message; }

    if (unserializable) {
      // FOUND BY EL-004: catching the throw at the physical write was not
      // enough. A circular detail made JSON.stringify(entry) throw, so the
      // WHOLE ROW was dropped — an error silently lost is strictly worse than
      // an error recorded without its payload. The detail degrades to a stated
      // marker and the row still lands. §1.2: honest degrade, never silent loss.
      detail = { _unserializable: true, reason: unserializable, preview: String(detail).slice(0, 512) };
    } else if (enc.length > DETAIL_MAX) {
      detail = { _truncated: true, originalBytes: enc.length, cappedAt: DETAIL_MAX, preview: enc.slice(0, DETAIL_MAX) };
    }
  }

  const entry = {
    uuid: row.uuid || null,
    system: row.system, component: row.component, action: row.action,
    status: row.status || 'error',
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ? [row.tags] : []),
    detail,
    causedBy: row.causedBy || null,
    contractUuid: row.contractUuid || null,
    session: row.session || null,
    hook: row.hook || null,        // unknown stays null — never derived
    wire: row.wire || null,
    faultId: row.faultId || null,
    intent: row.intent || null,
    sourceRef: row.sourceRef || null,
    ts: row.ts || Date.now(),
    loggedAt: Date.now(),
  };

  try {
    _rotateIfNeeded();
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    // Embedded newlines would split one row into two unparseable ones — the
    // exact jsonl corruption AS-012 guards against in the component ledger.
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry).replace(/\n/g, '\\n') + '\n');
    _written++;
    return entry;
  } catch (e) {
    _writeErrors++;
    _lastWriteError = e.message;
    // Loud on the first failure only — an error log that floods the console it
    // shares with real errors is the noise-wearing-transparency's-clothes
    // failure component-ledger already had to fix.
    if (_writeErrors === 1) console.warn(`[${MODULE_ID}] §1.2 PHYSICAL WRITE FAILED — ${LOG_PATH}: ${e.message}`);
    return null;
  }
}

// §0.3 — the previous file is KEPT, never truncated away. One generation back
// is enough to survive a rotation mid-incident without unbounded growth.
function _rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_PATH);
    if (st.size < MAX_BYTES) return;
    fs.renameSync(LOG_PATH, LOG_PATH + '.1');
  } catch (_) { /* ENOENT — nothing to rotate */ }
}

/**
 * attach(fanin) — subscribe to the fan-in and persist every error row.
 * Composes lib/ledger-sse.toLedgerRow so a loose event and a canonical row
 * both land in the same schema. Returns a detach fn.
 */
function attach(fanin, opts = {}) {
  if (!fanin || typeof fanin.subscribe !== 'function') {
    console.warn(`[${MODULE_ID}] attach() — no usable fan-in; error.log will stay empty. Reported, not hidden.`);
    return () => {};
  }
  let toRow;
  try { ({ toLedgerRow: toRow } = require('./ledger-sse')); } catch (_) { toRow = null; }

  return fanin.subscribe(opts.id || 'error-log', (raw) => {
    try {
      if (!isError(raw) && !isError(raw && raw.payload)) return;
      const row = toRow ? toRow(raw, raw.source || raw._system) : raw;
      if (row) write({ ...row, status: row.status === 'info' ? 'error' : row.status });
    } catch (_) { /* §1.2 — telemetry never breaks the emitter */ }
  });
}

/** tail(n) — newest first. Malformed lines are COUNTED, never silently dropped. */
function tail(n = 100) {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const slice = lines.slice(-n);
    const entries = []; let malformed = 0;
    for (const l of slice) { try { entries.push(JSON.parse(l)); } catch (_) { malformed++; } }
    return { ok: true, path: LOG_PATH, total: lines.length, returned: entries.length, malformed, entries: entries.reverse() };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: true, path: LOG_PATH, total: 0, returned: 0, malformed: 0, entries: [], note: 'no errors logged yet' };
    // §1.2 — unreadable is NOT the same as empty, and must never be reported as zero.
    return { ok: false, path: LOG_PATH, error: e.message, note: 'unreadable — this is not the same as no errors' };
  }
}

function health() {
  let bytes = null, exists = false;
  try { const st = fs.statSync(LOG_PATH); bytes = st.size; exists = true; } catch (_) {}
  return { ok: true, version: VERSION, path: LOG_PATH, exists, bytes,
    written: _written, refused: _refused, writeErrors: _writeErrors, lastWriteError: _lastWriteError };
}

function _resetForTest() { _written = 0; _refused = 0; _writeErrors = 0; _lastWriteError = null; }

module.exports = { write, attach, tail, health, isError, LOG_PATH,
  MODULE_ID, VERSION, COMP_ID, HOOK_ID, _resetForTest };
