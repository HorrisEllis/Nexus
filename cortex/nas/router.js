'use strict';
// ── nas/router.js ─────────────────────────────────────────────────────────────
// UUID: mod-nas-router-v5-0000-4000-0000-000000000001
//
// NAS (Network Attached Storage) routing layer.
// Resolves file-path requests to FileStore hashes via FileRefs.
// Reads: requests (type='file_resolve'). Writes: requests (status update), event_log.
//
// §M1: init(cfg) + stop() + setDeps(deps).
// §M2: reads: requests. writes: requests, event_log, failures.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'nas/router';

let _interval = null;
let _cfg      = {};
let _jaaDB    = null; // may be overridden by setDeps

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 2000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

function setDeps({ jaaDB: db }) {
  _jaaDB = db || jaaDB;
}

async function _tick() {
  const db = _jaaDB || jaaDB;
  try {
    // §BRIDGE-GATE: file_resolve requests must be written by Bridge, not directly to JAA.
    // Until Bridge is live this tick is a no-op. NAS router is a consumer, not a writer.
    // When Bridge routes a file_resolve request to Cortex, this tick will process it.
    const pending = db.query('requests', r => r.type === 'file_resolve' && r.status === 'pending', 10);
    if (!pending.length) return;

    for (const req of pending) {
      // Verify request has a Bridge UUID before claiming — reject phantom rows
      if (!req.bridgeUuid && !req._bridge) {
        db.insert('failures', {
          uuid: uid(), source: MODULE_ID, ts: Date.now(),
          error: `file_resolve request ${req.uuid} has no Bridge provenance — quarantined`,
        });
        db.update('requests', req.uuid, { status: 'quarantined', reason: 'no_bridge_provenance' });
        continue;
      }

      db.update('requests', req.uuid, { status: 'processing', claimedBy: MODULE_ID });

      const claimed = db.get('requests', req.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      // Resolution delegated to admin endpoint — NAS router just marks as queued
      // Full FileRefs resolution requires fileRefs dep (injected via boot setDeps if available)
      db.update('requests', req.uuid, {
        status:     'queued',
        routedTo:   'nas',
        routedAt:   Date.now(),
        resolvedAt: null,
      });

      db.insert('event_log', {
        uuid:     uid(),
        type:     'nas.file.queued',
        payload:  { reqUuid: req.uuid, path: req.path },
        source:   MODULE_ID,
        causedBy: req.uuid,
        ts:       Date.now(),
      });
    }
  } catch (err) {
    db.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop, setDeps };
