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
  const t = event.type || '';
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

module.exports = { computeSigma, mean, stddev };
