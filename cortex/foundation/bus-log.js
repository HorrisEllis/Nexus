'use strict';
// ── foundation/bus-log.js ─────────────────────────────────────────────────────
// UUID: mod-bus-log-v5-0000-4000-0000-000000000001
//
// v5.0: No wildcard subscription. Reads event_log on its own poll interval.
// Serves busLog.query() / tail() / stats() from JAA directly.
// Optionally mirrors to cobalt bus for debug visibility in the cockpit.
//
// §M1: init(cfg) + stop() only.
// §M2: reads: event_log. writes: poll_log.
// §M3: pollMs from cfg.

const { jaaDB, uid } = require('../memory/jaa-db');
const { core }       = require('./cobalt-core');

const MODULE_ID = 'bus-log';

let _interval  = null;
let _cfg       = {};
let _lastRowId = 0;

function init(cfg = {}) {
  _cfg = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 1000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    // Find new rows since last poll
    const newRows = jaaDB.query('event_log', r => r._rowId > _lastRowId, 200);
    if (!newRows.length) return;

    _lastRowId = newRows[newRows.length - 1]._rowId;

    // Mirror to cobalt bus (debug only — no coordination)
    for (const row of newRows) {
      core.bus.ingest(row.type || 'event_log.row', row.payload || {}, {
        source:   row.source || MODULE_ID,
        causedBy: row.causedBy || null,
      });
    }

    // Log own tick to poll_log (§G-V5-06)
    jaaDB.insert('poll_log', {
      uuid:     uid(),
      module:   MODULE_ID,
      rowsMirrored: newRows.length,
      lastRowId:    _lastRowId,
      ts:       Date.now(),
      source:   MODULE_ID,
    });

  } catch (err) {
    jaaDB.insert('failures', {
      uuid:   uid(),
      source: MODULE_ID,
      error:  err.message,
      stack:  err.stack,
      ts:     Date.now(),
    });
  }
}

// ── Query helpers (read-only, own tables only) ────────────────────────────────
const busLog = {
  query: (pred, limit)  => jaaDB.query('event_log', pred, limit),
  tail:  (n)            => jaaDB.tail('event_log', n),
  stats: ()             => ({
    module:    MODULE_ID,
    lastRowId: _lastRowId,
    total:     jaaDB.count('event_log'),
  }),
};

module.exports = { init, stop, busLog };
