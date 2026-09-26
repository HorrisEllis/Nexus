'use strict';
/**
 * lib/cfr/sigma.js — Sigma (divergence) scorer
 * UUID: nexus-cfr-sigma-v1-0000-4000-0000-000000000001
 *
 * Sigma measures how far a given event deviates from the established
 * baseline for that event type. It is stored permanently in the ledger
 * at write time — never recomputed later, because the context that
 * produced it (baseline state, CFR field) no longer exists.
 *
 * Score 0.0 = expected. Score 1.0 = extreme anomaly.
 *
 * Three input axes:
 *   structural  — payload shape, type pattern, required fields
 *   temporal    — interval since last event of this type vs baseline
 *   contextual  — current CFR field state (high entropy = higher sigma)
 */

'use strict';

// ── Math helpers ──────────────────────────────────────────────────────────────

// §23.10 — names the actual upstream caller instead of warning blind, and
// stops flooding the log on every single occurrence (this was firing once
// per call with zero throttling — see computeSigma's comment above).
let _coercionCount = 0;
function _warnCoercion(badValue) {
  _coercionCount++;
  const first = _coercionCount === 1;
  const everyNth = _coercionCount % 50 === 0;
  if (!first && !everyNth) return;

  // Walk the stack past this file and sigma's own callers (cfr/ledger.js's
  // record()) to find the actual upstream call site that built a malformed
  // event/type in the first place.
  //
  // §BUG FIXED 2026-07-09 (from a live Windows console log) — these checks
  // compared forward-slash paths ('cfr/sigma.js'), but V8 stack frames use
  // the platform separator. On Windows every frame reads 'meta\cfr\sigma.js',
  // so NONE of these filters ever matched: the function skipped nothing and
  // reported ITSELF ("at _warnCoercion (...sigma.js:36)") as the upstream
  // caller. 600 warnings, each naming the warner. Normalize separators so
  // the diagnostic can actually do its one job on every platform.
  const stack = ((new Error()).stack?.split('\n').slice(1) || []).map(l => l.replace(/\\/g, '/'));
  // Skip all cfr/ internal frames to find the real upstream caller
  const callerLine = stack.find(l =>
    !l.includes('cfr/sigma.js') &&
    !l.includes('cfr/ledger.js') &&
    !l.includes('cfr/field.js') &&
    !l.includes('cfr/delta.js') &&
    !l.includes('node:internal')
  ) || stack.find(l => !l.includes('cfr/sigma.js')) || stack[0] || '(no stack)';

  console.warn(`[cfr/sigma] §23.10 non-string event.type received (${typeof badValue}) — coercing. ` +
    `Occurrence #${_coercionCount}${everyNth ? ' (every 50th logged)' : ''}. ` +
    `Caller: ${callerLine.trim()}`);

  try {
    require('../../lib/component-ledger').write({
      system: 'cortex', component: 'lib.cfr-sigma', action: 'type_coercion',
      status: 'coerced', tags: ['malformed-caller'],
      detail: `occurrence #${_coercionCount} — ${callerLine.trim()}`, causedBy: null,
    });
  } catch (_) {}
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

// ── Sigma computation ─────────────────────────────────────────────────────────

/**
 * computeSigma — score divergence for a single event.
 *
 * @param {object} event        — the event being scored
 * @param {object} baseline     — from event-ledger.getBaseline(type)
 * @param {object} cfrState     — current CFR field { coherence, entropy, friction, resonance }
 * @param {number} intervalMs   — ms since last event of this type (0 = first occurrence)
 * @returns {object}            — { score, axes: { structural, temporal, contextual }, reason }
 */
function computeSigma(event, baseline, cfrState = {}, intervalMs = 0) {
  let structural  = 0;
  let temporal    = 0;
  let contextual  = 0;
  const reasons   = [];

  // ── Structural axis ────────────────────────────────────────────────────────
  // Error/failure types carry inherent structural deviation
  let t = event.type || '';
  if (typeof t !== 'string') {
    // §DEFENSE-CFR-01: a non-string type must never crash the ledger write
    // path — that takes down every system whose events route through here.
    //
    // §23.10 — this used to warn on EVERY call with no caller information,
    // which both flooded the log hard enough to bury everything else in it
    // and never actually named who was upstream. I traced several real
    // candidate call chains (orchestrator's POST /api/ledger destructures
    // `type` from the request body with zero validation; several systems'
    // postEvent/_postEvent/ledgerWrite wrappers forward whatever they're
    // given) without being able to pin the exact one from static reading
    // alone — there are too many forwarding layers to be certain which one
    // is the real source by inspection. So: capture the actual call stack
    // here instead of guessing. Next time this fires, the log names the
    // real file and line, not a 4th hypothesis.
    _warnCoercion(t);
    t = '';
  }
  if (t.includes('error') || t.includes('failed') || t.includes('failure')) {
    structural += 0.35;
    reasons.push('error event');
  }
  if (t.includes('retry')) {
    structural += 0.20;
    reasons.push('retry pattern');
  }
  if (t.includes('timeout')) {
    structural += 0.25;
    reasons.push('timeout');
  }
  if (!event.payload || Object.keys(event.payload || {}).length === 0) {
    structural += 0.10;
    reasons.push('empty payload');
  }
  if (t.includes('corrupt') || t.includes('malformed')) {
    structural += 0.40;
    reasons.push('corrupt data');
  }

  // ── Temporal axis ──────────────────────────────────────────────────────────
  // How far from the expected inter-event interval?
  if (baseline && baseline.avgIntervalMs > 0 && intervalMs > 0) {
    const deviation    = Math.abs(intervalMs - baseline.avgIntervalMs);
    const stddevMs     = baseline.stddevMs || (baseline.avgIntervalMs * 0.3);
    const sigmaCounts  = stddevMs > 0 ? deviation / stddevMs : 0;
    // > 3 sigma from baseline interval = temporal anomaly
    if (sigmaCounts > 3) {
      temporal = Math.min(0.5, sigmaCounts / 10);
      reasons.push(`temporal drift ${sigmaCounts.toFixed(1)}σ`);
    }
  } else if (intervalMs > 60000 && t !== '') {
    // Long silence then event — mild temporal signal
    temporal = 0.05;
  }

  // ── Contextual axis ────────────────────────────────────────────────────────
  // System under stress amplifies sigma of every event
  const entropy   = cfrState.entropy   ?? 0.5;
  const coherence = cfrState.coherence ?? 0.5;
  const friction  = cfrState.friction  ?? 0.5;

  if (entropy > 0.7) {
    contextual += (entropy - 0.7) * 0.5;
    reasons.push(`high entropy ${entropy.toFixed(2)}`);
  }
  if (coherence < 0.3) {
    contextual += (0.3 - coherence) * 0.6;
    reasons.push(`low coherence ${coherence.toFixed(2)}`);
  }
  if (friction > 0.7) {
    contextual += (friction - 0.7) * 0.3;
    reasons.push(`high friction ${friction.toFixed(2)}`);
  }

  const score = Math.min(1.0,
    structural * 0.50 +
    temporal   * 0.30 +
    contextual * 0.20
  );

  return {
    score:  +score.toFixed(4),
    axes:   {
      structural:  +structural.toFixed(4),
      temporal:    +temporal.toFixed(4),
      contextual:  +contextual.toFixed(4),
    },
    reason: reasons.join('; ') || 'nominal',
  };
}

module.exports = { computeSigma, mean, stddev, getCoercionCount: () => _coercionCount };
