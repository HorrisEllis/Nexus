'use strict';
/**
 * guardian/lib/seam-mode-reducer.js — SEAMQueue Mode Reducer
 * UUID: guardian-seam-mode-reducer-v1-0000-4000-0000-000000000001
 * Phase 71.1 — State Reducer extraction (NEXUS v3 formalization)
 *
 * NOT a replacement for SEAMQueue's dispatch logic. SEAMQueue already does
 * incremental one-at-a-time dispatch + verify + advance, which is a better
 * fit for this system than spec §3's batch intake/buffer/ready/execute model
 * (that model assumes all chunks arrive before anything runs — Guardian's
 * SEAM queue dispatches and verifies one chunk at a time by design).
 *
 * What's missing isn't a different control structure — it's a single,
 * pure, named field summarizing where a queue stands, instead of forcing
 * every caller (escalation ladder, future Anomaly Engine, UI) to re-derive
 * that from raw compartment counts every time. This is that field.
 *
 * deriveMode(stats, running) => one of MODE.*
 * Pure function: same input, same output, every time. No JAA writes, no
 * busEmit, no side effects — callers decide what to do with the result.
 */

const MODE = Object.freeze({
  IDLE:       'idle',        // queue created, start() never called
  DISPATCHING:'dispatching', // running, at least one compartment active or queued
  STALLED:    'stalled',     // running, nothing active AND nothing queued, NOT complete —
                              // the literal chunk-1-stall shape: _next() has nothing to do
                              // and nothing is in flight, but the queue isn't finished.
  ESCALATING: 'escalating',  // running, no active/queued work, but escalated > 0
                              // and not yet complete — distinguishes "stuck" from
                              // "this chunk failed and the rest moved on"
  COMPLETE:   'complete',    // every compartment VERIFIED or ESCALATED
});

/**
 * @param {object} stats   — output of SEAMQueue#stats() (already a pure read)
 * @param {boolean} running — SEAMQueue#running flag
 * @returns {string} one of MODE.*
 */
function deriveMode(stats, running) {
  const { total, verified, escalated, retrying, active, queued } = stats;

  if (verified + escalated >= total) return MODE.COMPLETE;
  if (!running) return MODE.IDLE;

  const inFlight = active > 0 || queued > 0 || retrying > 0;
  if (inFlight) return MODE.DISPATCHING;

  // running === true, nothing in flight, not complete.
  // This is the anomaly: _next() should always find QUEUED or RETRYING work
  // to do until the queue is COMPLETE. If it's running and finds nothing,
  // and there's at least one escalated compartment, that's the most likely
  // explanation (escalation moved past it without finishing the others) —
  // otherwise something is genuinely stuck with no record of why.
  return escalated > 0 ? MODE.ESCALATING : MODE.STALLED;
}

module.exports = { MODE, deriveMode };
