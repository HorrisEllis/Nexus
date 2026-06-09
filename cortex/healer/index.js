'use strict';
// ── healer/index.js ───────────────────────────────────────────────────────────
// UUID: mod-healer-v5-0000-4000-0000-000000000001
//
// Reads gaps where status='pending'. Attempts resolution.
// Writes fix_map entries. Updates gap status.
//
// §M1: init(cfg) + stop().
// §M2: reads: gaps. writes: fix_map, gaps (status update), event_log, failures.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'healer';

let _interval = null;
let _cfg      = {};

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 5000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    const pending = jaaDB.query('gaps', r => r.status === 'pending', 10);
    if (!pending.length) return;

    for (const gap of pending) {
      // Claim
      jaaDB.update('gaps', gap.uuid, { status: 'processing', claimedBy: MODULE_ID, claimedAt: Date.now() });

      const claimed = jaaDB.get('gaps', gap.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      try {
        const fix = _prescribe(gap);

        jaaDB.insert('fix_map', {
          uuid:      uid(),
          gapUuid:   gap.uuid,
          gapPath:   gap.path,
          gapType:   gap.type,
          strategy:  fix.strategy,
          action:    fix.action,
          automated: fix.automated,
          status:    fix.automated ? 'applied' : 'manual_required',
          source:    MODULE_ID,
          causedBy:  gap.uuid,
          createdAt: Date.now(),
        });

        jaaDB.update('gaps', gap.uuid, {
          status:     fix.automated ? 'resolved' : (fix.escalate ? 'needs_manual' : 'needs_manual'),
          resolvedAt: fix.automated ? Date.now() : null,
          fixStrategy: fix.strategy,
          escalateToForge: fix.escalate || false,
        });

        jaaDB.insert('event_log', {
          uuid:     uid(),
          type:     fix.automated ? 'healer.resolved' : 'healer.escalated',
          payload:  { gapUuid: gap.uuid, strategy: fix.strategy, automated: fix.automated },
          source:   MODULE_ID,
          causedBy: gap.uuid,
          ts:       Date.now(),
        });

      } catch (err) {
        jaaDB.update('gaps', gap.uuid, { status: 'pending' }); // return to queue
        jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

function _prescribe(gap) {
  switch (gap.type) {
    case 'stale_module':
      // Escalate to self-heal — it will probe and attempt forge patch
      return { strategy: 'forge_patch', action: `forge fix for stale ${gap.path}`, automated: false, escalate: true };

    case 'stuck_call':
      return { strategy: 'timeout_and_retry', action: `mark ${gap.path} as failed and re-enqueue`, automated: true };

    case 'recurring_failure':
      // Escalate to forge — recurring failure means the code itself needs fixing
      return { strategy: 'forge_patch', action: `forge fix for recurring failure in ${gap.path}`, automated: false, escalate: true };

    case 'missing_file':
      return { strategy: 'forge_scaffold', action: `forge scaffold for ${gap.path}`, automated: false, escalate: true };

    case 'import_error':
      return { strategy: 'forge_patch', action: `forge fix for import error in ${gap.path}`, automated: false, escalate: true };

    case 'deviation':
      return { strategy: 'log_and_observe', action: `alert on ${gap.path}`, automated: false };

    default:
      return { strategy: 'manual_review', action: `review ${gap.path}`, automated: false };
  }
}

module.exports = { init, stop };
