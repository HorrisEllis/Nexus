'use strict';
// ── lib/engine-ledger.js — DEPRECATED, kept as a compatibility shim ─────────
// Superseded 2026-06-24 by lib/component-ledger.js — per-component,
// per-system, physically-partitioned-by-day-or-session, and wired straight
// into event_log so the pattern engine sees it. This file existed for one
// turn (RAID + reflection only, single shared table, no physical files, no
// pattern-engine connection) before that request got generalized.
//
// Kept so nothing that already wired against require('./engine-ledger')
// breaks. New code should require('./component-ledger') directly.
//
// Old call shape: record({ engine, action, status, tags, detail, causedBy, contractUuid })
// New call shape: write({ system, component, action, status, tags, detail, causedBy, contractUuid, session })
// 'engine' maps to BOTH system and component here since the old shim had no
// per-component split — real callers should migrate to passing a real
// component_id instead of reusing the engine name as the component too.

const componentLedger = require('./component-ledger');

function record({ engine, action, status, tags, detail, causedBy, contractUuid }) {
  return componentLedger.write({
    system: engine, component: engine, action, status, tags, detail, causedBy, contractUuid,
  });
}

function tail(engine, limit = 50) {
  return engine ? componentLedger.bySystem(engine, limit) : componentLedger.tail(limit);
}

module.exports = {
  record, tail,
  MODULE_ID: 'engine-ledger', VERSION: '1.0.0-deprecated',
  VALID_ENGINES: new Set(['raid', 'reflection', 'gap-lifecycle', 'autopilot']),
};
