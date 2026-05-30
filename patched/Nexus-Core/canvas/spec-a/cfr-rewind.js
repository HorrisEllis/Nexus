// ═══════════════════════════════════════════════════
// NEXUS — CFR Rewind shim
// canvas/spec-a/cfr-rewind.js
//
// CJS shim for cfr-kernel/rewind.js (snapshot ring + .nex).
// Full implementation — not a stub — because the rewind
// logic is pure JS with no DOM dependency.
//
// API:
//   createTimeline(world, opts)     → Timeline
//   takeSnapshot(timeline)          → void
//   seekTo(timeline, idx)           → void
//   step(timeline, dir)             → void  (+1/-1)
//   goLive(timeline)                → void
//   togglePause(timeline)           → void
//   logEvent(timeline, cls, data)   → void
//   serialise(timeline)             → object  (.nex payload)
//   onTimelineChange(tl, cb)        → void
//   clearTimeline(timeline)         → void
//
// §2.1 — ring-capped, never unbounded.
// §5.5 — zero external deps.
// §12  — serialise() matches .nex CFR snapshot format.
// ═══════════════════════════════════════════════════
'use strict';

const DEFAULT_SNAP_MAX = 200;
const DEFAULT_LOG_MAX  = 2000;

// ── Timeline factory ──────────────────────────────

/**
 * @param {object} world       — cfr-kernel world (or any object with .field)
 * @param {object} [opts]
 * @param {number} [opts.snapMax=200]
 * @param {number} [opts.logMax=2000]
 */
function createTimeline(world, opts = {}) {
  return {
    world,
    snapshots:  [],                               // ring of {ts, field, attractors, idx}
    causalLog:  [],                               // ring of {ts, cls, data}
    snapMax:    opts.snapMax ?? DEFAULT_SNAP_MAX,
    logMax:     opts.logMax  ?? DEFAULT_LOG_MAX,
    idx:        -1,                               // -1 = live
    paused:     false,
    live:       true,
    _onChange:  null,
  };
}

// ── Snapshot ──────────────────────────────────────

function takeSnapshot(tl) {
  const snap = {
    ts:        Date.now(),
    field:     { ...tl.world.field },
    attractors: (tl.world.attractors ?? []).map(a => ({ ...a })),
    idx:       tl.snapshots.length,
  };
  tl.snapshots.push(snap);
  if (tl.snapshots.length > tl.snapMax) tl.snapshots.shift();
  _notify(tl);
}

// ── Seek / step ───────────────────────────────────

function seekTo(tl, idx) {
  const clamped = Math.max(0, Math.min(idx, tl.snapshots.length - 1));
  tl.idx    = clamped;
  tl.paused = true;
  tl.live   = false;
  const snap = tl.snapshots[clamped];
  if (snap) {
    Object.assign(tl.world.field, snap.field);
  }
  _notify(tl);
}

function step(tl, dir) {
  const next = tl.idx + (dir < 0 ? -1 : 1);
  seekTo(tl, next);
}

function goLive(tl) {
  tl.idx    = -1;
  tl.paused = false;
  tl.live   = true;
  _notify(tl);
}

function togglePause(tl) {
  tl.paused = !tl.paused;
  if (!tl.paused) tl.live = tl.idx === -1;
  _notify(tl);
}

// ── Causal log ────────────────────────────────────

/**
 * @param {Timeline} tl
 * @param {'ok'|'err'|'warn'|'cfr'} cls
 * @param {object} data
 */
function logEvent(tl, cls, data) {
  tl.causalLog.push({ ts: Date.now(), cls, data });
  if (tl.causalLog.length > tl.logMax) tl.causalLog.shift();
}

// ── Serialise → .nex payload ──────────────────────
// §12: CFR snapshot format.

function serialise(tl) {
  return {
    magic:      'NEX-SNAP',
    version:    '1.0',
    capturedAt: Date.now(),
    snapCount:  tl.snapshots.length,
    logCount:   tl.causalLog.length,
    snapshots:  tl.snapshots.map(s => ({
      ts:        s.ts,
      field:     s.field,
      attractors:s.attractors,
    })),
    causalLog:  tl.causalLog.slice(-200), // last 200 entries in .nex
    currentField: { ...tl.world.field },
  };
}

// ── Change notification ───────────────────────────

function onTimelineChange(tl, cb) {
  tl._onChange = cb;
}

function _notify(tl) {
  if (typeof tl._onChange === 'function') {
    tl._onChange({ idx: tl.idx, live: tl.live, paused: tl.paused, ts: Date.now() });
  }
}

// ── Clear ─────────────────────────────────────────

function clearTimeline(tl) {
  tl.snapshots.length = 0;
  tl.causalLog.length = 0;
  tl.idx    = -1;
  tl.live   = true;
  tl.paused = false;
  _notify(tl);
}

module.exports = {
  createTimeline,
  takeSnapshot,
  seekTo,
  step,
  goLive,
  togglePause,
  logEvent,
  serialise,
  onTimelineChange,
  clearTimeline,
};
