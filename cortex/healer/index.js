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

// ── Engine-informed prescription ──────────────────────────────────────────────
let _lastEngineRun = 0, _lastEngineResult = null;
const ENGINE_TTL   = 30000;

function _getEngineInsights() {
  const now = Date.now();
  if (_lastEngineResult && (now - _lastEngineRun) < ENGINE_TTL) return _lastEngineResult;
  try {
    const de   = require('../../lib/diagnostic-engines');
    const evts = jaaDB.tail('event_log', 100);
    const gaps = jaaDB.query('gaps', r => r.status === 'open', 30);
    const states = { cortex:{online:true,friction:Math.min(1,gaps.length*0.05)}, guardian:{online:true,friction:0.1} };
    _lastEngineResult = de.runAllEngines({ events: evts, systemStates: states });
    _lastEngineRun = now;
    return _lastEngineResult;
  } catch(_) { return null; }
}

function _prescribe(gap) {
  // ── Engine-informed pre-routing ───────────────────────────────────────────
  try {
    const ins = _getEngineInsights();
    if (ins) {
      const gapSys = (gap.path||gap.source||'').split('/')[0];
      const cb     = ins.engines?.circuit_breaker;
      if (cb?.breakers?.some(b => b.system === gapSys && b.state === 'OPEN'))
        return { strategy:'pause_and_observe', action:`circuit OPEN for ${gapSys} — pausing retries`, automated:false, escalate:true, reason:'circuit_breaker' };
      if (ins.engines?.fault_tree?.topEventActive)
        return { strategy:'human_review', action:`fault tree active — system-level failure detected`, automated:false, reason:'fault_tree' };
      if (ins.engines?.homeostasis?.regime === 'vulnerable')
        return { strategy:'snapshot_then_forge', action:`homeostasis vulnerable — snapshot before patching ${gap.path}`, automated:false, escalate:true, reason:'homeostasis' };
      const cascade = (ins.engines?.cascade_risk||[]).find(r => r.system === gapSys && (r.blastRadius||[]).length > 2);
      if (cascade)
        return { strategy:'quarantine_and_patch', action:`cascade risk — blast radius: ${cascade.blastRadius.join(', ')}`, automated:false, escalate:true, reason:'cascade_risk' };
    }
  } catch(_) {}

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


