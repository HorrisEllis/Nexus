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

// Gap types that are signals, not fixable problems
// These should never sit in the queue — auto-resolve immediately
const SIGNAL_TYPES = new Set([
  'DELTA.TENSION', 'delta.tension', 'tension', 'cfr.tension',
  'cfr.delta', 'signal', 'observation',
]);

async function _tick() {
  try {
    const pending = jaaDB.query('gaps', r => r.status === 'pending', 20);
    if (!pending.length) return;

    // Auto-resolve signal gaps immediately — don't process through forge
    const signals = pending.filter(g => SIGNAL_TYPES.has(g.type));
    if (signals.length) {
      for (const g of signals) {
        jaaDB.update('gaps', g.uuid, {
          status:       'resolved',
          resolvedAt:   Date.now(),
          fixStrategy:  'signal-auto-resolve',
          resolveReason:'Signal type — not an actionable gap',
          claimedBy:    MODULE_ID,
        });
      }
      console.log(`[${MODULE_ID}] auto-resolved ${signals.length} signal gaps`);
    }

    // Only process real actionable gaps
    const actionable = pending.filter(g => !SIGNAL_TYPES.has(g.type));
    if (!actionable.length) return;

    for (const gap of actionable.slice(0, 10)) {
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

        // §ESCALATE-09: emit HEAL_REQUESTED on nexus-bus — decouples healer from repair engine
        if (fix.escalate) {
          try {
            const _bus = require('../../nexus-bus');
            _bus.emit('HEAL_REQUESTED', {
              gapUuid:    gap.uuid,
              gapType:    gap.type,
              modulePath: gap.path,
              strategy:   fix.strategy,
              body:       gap.body,
              sigma:      gap.sigma || 0,
              causedBy:   gap.causedBy,
              ts:         Date.now(),
            });
          } catch (_) {
            // nexus-bus not loaded — record as event_log entry for SSE pickup
            jaaDB.insert('event_log', {
              uuid:    uid(),
              type:    'HEAL_REQUESTED',
              payload: { gapUuid: gap.uuid, strategy: fix.strategy, modulePath: gap.path },
              source:  MODULE_ID,
              causedBy:gap.uuid,
              ts:      Date.now(),
            });
          }
        }

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

    case 'DELTA.TENSION':
    case 'delta.tension':
    case 'tension':
      // Tension signals are CFR field observations, not fixable gaps.
      // Route to observe — they feed the diagnostic tension score.
      return { strategy: 'log_and_observe', action: `tension signal at ${gap.path}`, automated: true, escalate: false };

    case 'deviation':
      return { strategy: 'log_and_observe', action: `alert on ${gap.path}`, automated: false };

    default:
      return { strategy: 'manual_review', action: `review ${gap.path}`, automated: false };
  }
}

// ── Tension scoring — open gaps accumulate tension over time ─────────────────
// Every open gap is an open loop. The longer it stays open, the more tension.
// tension(gap) = severity_weight × age_factor × retry_penalty
// This is the signal the diagnostic service uses for the tension map.
function scoreTension(gap) {
  const SEVERITY_WEIGHT = { critical: 4.0, high: 2.0, medium: 1.0, low: 0.4 };
  const weight    = SEVERITY_WEIGHT[gap.severity] || 1.0;
  const ageMs     = Date.now() - (gap.createdAt || gap.ts || Date.now());
  const ageHours  = ageMs / 3600000;
  const ageFactor = Math.min(3.0, 1.0 + Math.log1p(ageHours) * 0.5); // caps at 3x
  const retries   = gap.attempts || 0;
  const retryPenalty = 1.0 + retries * 0.3; // each failed attempt adds 30% tension
  return Math.round(weight * ageFactor * retryPenalty * 1000) / 1000;
}

module.exports = { init, stop, scoreTension };


