'use strict';
/**
 * lib/cfr/delta.js — Delta (transition physics) engine
 * UUID: nexus-cfr-delta-v1-0000-4000-0000-000000000001
 *
 * Delta measures the *transition* between two consecutive ledger entries.
 * It captures the rate of change across three axes:
 *
 *   tension  — how much did complexity/payload change? (0..1)
 *   friction — how slow was the transition? (0..1)
 *   slope    — direction of change (positive = growing, negative = shrinking)
 *
 * Delta is stored in the ledger at write time alongside sigma and the
 * CFR snapshot — never recomputed, because the "previous" event context
 * is ephemeral.
 */

'use strict';

/**
 * computeDelta — transition physics between prev and curr events.
 *
 * @param {object|null} prev   — previous ledger entry (null = first entry)
 * @param {object}      curr   — current event being written
 * @returns {{ tension, friction, slope }}
 */
function computeDelta(prev, curr) {
  if (!prev) {
    return { tension: 0, friction: 0, slope: 0 };
  }

  const dt = Math.max(1, (curr.ts || Date.now()) - (prev.ts || 0));

  // Complexity proxy: payload byte size
  const prevSize = _payloadSize(prev);
  const currSize = _payloadSize(curr);

  // Tension = normalized absolute change in complexity
  const tension = Math.min(1.0, Math.abs(currSize - prevSize) / 2000);

  // Friction = latency proxy — longer gaps = more friction
  // Tuned: < 500ms = no friction, > 30s = max friction
  const friction = Math.min(1.0, Math.max(0, (dt - 500) / 30000));

  // Slope = direction of complexity change, normalized
  // Positive = system generating more output (active)
  // Negative = system becoming quieter (contracting)
  const slope = dt > 0 ? (currSize - prevSize) / Math.max(dt, 1) : 0;
  const slopeN = Math.max(-1, Math.min(1, slope * 1000)); // normalize to -1..1

  // Type-based tension adjustments
  const ct = curr.type  || '';
  const pt = prev.type  || '';

  let typeTension = 0;
  // dom_map payloads are always large by design — don't spike tension on them
  if (ct.includes('dom_map') || pt.includes('dom_map')) typeTension = -0.6;
  // Transition from ok → error = high tension
  if (!pt.includes('error') && ct.includes('error')) typeTension = 0.4;
  // Transition from error → ok = medium tension (recovery)
  if (pt.includes('error') && !ct.includes('error')) typeTension = 0.2;
  // Consecutive retries = tension spike
  if (ct.includes('retry') && pt.includes('retry')) typeTension = 0.5;
  // Job lifecycle: queued → dispatched → complete = expected low tension
  if (_isJobTransition(pt, ct)) typeTension = -0.1; // negative tension = good flow

  return {
    tension:  +Math.min(1, Math.max(0, tension + typeTension)).toFixed(4),
    friction: +friction.toFixed(4),
    slope:    +slopeN.toFixed(4),
  };
}

function _payloadSize(entry) {
  try {
    return JSON.stringify(entry.payload || {}).length;
  } catch {
    return 0;
  }
}

function _isJobTransition(prev, curr) {
  const JOB_FLOW = [
    ['guardian.job.queued',      'guardian.job.dispatched'],
    ['guardian.job.dispatched',  'guardian.job.complete'],
    ['guardian.job.queued',      'guardian.job.complete'],
    ['cortex.gap.found',         'cortex.gap.resolved'],
    ['seam.chunk.injected',      'seam.chunk.stable'],
    ['seam.chunk.stable',        'seam.chunk.verified'],
  ];
  return JOB_FLOW.some(([p, c]) => prev.includes(p) && curr.includes(c));
}

module.exports = { computeDelta };
