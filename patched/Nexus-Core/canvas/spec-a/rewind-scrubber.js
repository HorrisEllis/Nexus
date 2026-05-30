// ═══════════════════════════════════════════════════
// NEXUS — RewindScrubber
// canvas/spec-a/rewind-scrubber.js
// UUID: nexus-canvas-rewind-4000-000000000001
//
// Wraps cfr-kernel/rewind for the pipeline canvas.
// Owns the snapshot ring and causal log.
// Exposes scrub/seek/pause/live as kernel events.
//
// DESIGN:
//   The scrubber sits between the kernel bus and the
//   renderer. It intercepts significant events, logs
//   them to the causal timeline, and triggers snapshots
//   at gate/healer/crystal boundaries.
//
//   Seek puts the canvas in a "frozen" state — the
//   renderer stops calling step(dt) and replays the
//   snapshot at that tick. goLive() resumes.
//
//   .nex serialisation: calls serialise(timeline)
//   which produces a CFR payload compatible with the
//   .nex snapshot format (§12 of spec).
//
// EVENTS EMITTED:
//   canvas.rewind.snapshot_taken   { idx, ts, snapCount }
//   canvas.rewind.seeking          { idx, ts }
//   canvas.rewind.live             {}
//   canvas.rewind.paused           { idx }
//   canvas.rewind.event_logged     { cls, data }
//
// §2.1 — every snapshot persisted to timeline ring.
// §3.2 — seeks are by logical tick, not wall time.
// §5.7 — zero direct renderer calls; uses renderer API.
// ═══════════════════════════════════════════════════
'use strict';

const { kernel } = require('../../foundation/kernel');
const {
  createTimeline, takeSnapshot, seekTo, step,
  goLive, togglePause, logEvent, serialise,
  onTimelineChange, clearTimeline,
} = require('./cfr-rewind');

// ── Events that trigger an automatic snapshot ──────
const SNAPSHOT_TRIGGERS = new Set([
  'gate.passed',
  'gate.failed',
  'healer.resolved',
  'healer.exhausted',
  'crystalball.crystal.formed',
  'manifest.ready',
  'system.booted',
]);

// ── Log classification: bus event type → 'ok'|'err'|'warn'|'cfr' ─
function classifyEvent(type) {
  if (type.includes('fail') || type.includes('error') || type.includes('exhausted')) return 'err';
  if (type.includes('warn') || type.includes('gap')   || type.includes('limited'))  return 'warn';
  if (type.includes('crystal') || type.includes('bep') || type.includes('cfr'))     return 'cfr';
  return 'ok';
}

class RewindScrubber {
  /**
   * @param {object} opts
   * @param {object} opts.nexusKernel — ALKKernel
   * @param {object} opts.renderer    — from canvas/spec-a/renderer.js
   */
  constructor({ nexusKernel, renderer }) {
    this._nk       = nexusKernel;
    this._renderer = renderer;
    this._timeline = createTimeline(renderer._world ?? renderer._world, {
      snapMax: 200,
      logMax:  2000,
    });

    // Wire renderer's own timeline (already created in renderer.js)
    // Prefer the renderer's timeline so physics state is consistent.
    if (renderer.timeline) {
      this._timeline = renderer.timeline;
    }

    this._attached = false;
  }

  // ── Boot ──────────────────────────────────────

  attach() {
    if (this._attached) return;
    this._attached = true;

    const nk = this._nk;

    // Snapshot on significant transitions
    for (const ch of SNAPSHOT_TRIGGERS) {
      nk.on(ch, e => {
        this._snap(ch, e.id);
        this._log(ch, e.id, e.payload);
      });
    }

    // Log all gate events even if not snapshot triggers
    nk.on('gap.found',          e => this._log('gap.found', e.id, e.payload));
    nk.on('agent.error',        e => this._log('agent.error', e.id, e.payload));
    nk.on('raid.exhausted',     e => this._log('raid.exhausted', e.id, e.payload));
    nk.on('automation.workflow.started',  e => this._log('automation.workflow.started', e.id, e.payload));
    nk.on('automation.workflow.complete', e => this._log('automation.workflow.complete', e.id, e.payload));

    // Rewind commands via bus (admin UI emits these)
    nk.on('canvas.rewind.cmd.seek',    e => this.seek(e.payload.idx));
    nk.on('canvas.rewind.cmd.step',    e => this.step(e.payload.dir));
    nk.on('canvas.rewind.cmd.live',    () => this.goLive());
    nk.on('canvas.rewind.cmd.pause',   () => this.pause());
    nk.on('canvas.rewind.cmd.clear',   () => this.clear());

    // onChange wired to kernel events
    onTimelineChange(this._timeline, state => {
      if (state.live) {
        kernel.emit('canvas.rewind.live', {});
      } else if (state.paused && !state.live) {
        kernel.emit('canvas.rewind.paused', { idx: state.idx, ts: state.ts });
      } else {
        kernel.emit('canvas.rewind.seeking', { idx: state.idx, ts: state.ts });
      }
    });

    kernel.emit('canvas.rewind.attached', { snapMax: this._timeline.snapMax });
  }

  // ── Controls ───────────────────────────────────

  seek(idx) {
    seekTo(this._timeline, idx);
    kernel.emit('canvas.rewind.seeking', {
      idx,
      ts: this._timeline.snapshots[idx]?.ts ?? null,
    });
  }

  step(dir) {
    step(this._timeline, dir);
  }

  goLive() {
    goLive(this._timeline);
    kernel.emit('canvas.rewind.live', {});
  }

  pause() {
    togglePause(this._timeline);
  }

  clear() {
    clearTimeline(this._timeline);
    kernel.emit('canvas.rewind.cleared', {});
  }

  // ── Serialise → .nex payload ──────────────────
  // Returns a CFR payload compatible with .nex §12.
  toNex() {
    return serialise(this._timeline);
  }

  // ── Status ─────────────────────────────────────
  get snapCount() { return this._timeline.snapshots.length; }
  get logCount()  { return this._timeline.causalLog.length; }
  get isPaused()  { return this._timeline.paused; }
  get currentIdx(){ return this._timeline.idx; }

  /** Full causal log, newest first. */
  get causalLog() {
    return [...this._timeline.causalLog].reverse();
  }

  // ── Internal ───────────────────────────────────

  _snap(triggerType, causedByEventId) {
    takeSnapshot(this._timeline);
    const idx = this._timeline.snapshots.length - 1;
    kernel.emit('canvas.rewind.snapshot_taken', {
      idx,
      ts:        Date.now(),
      snapCount: this._timeline.snapshots.length,
      trigger:   triggerType,
    }, { causedBy: causedByEventId });
  }

  _log(type, causedByEventId, data = null) {
    const cls = classifyEvent(type);
    logEvent(this._timeline, cls, { type, causedBy: causedByEventId, ...data });
    kernel.emit('canvas.rewind.event_logged', { cls, type });
  }
}

module.exports = { RewindScrubber, SNAPSHOT_TRIGGERS };
