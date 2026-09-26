'use strict';
/**
 * cortex/self-heal/escalation.js — Escalation Organ
 * UUID: nexus-cortex-self-heal-escalation-v1-0000-2026-0720-001
 * Version: 1.0.0
 *
 * The friction ledger's reactive half. cortex/self-heal/fault-taxonomy.js
 * (Phase 1) is the data layer — schema, thresholds, raiseFriction/recordSuccess.
 * This file is the organ: it listens to the real bus and calls that layer.
 *
 * Two independent inputs, per the evidence found wiring this (not invented):
 *
 *   1. anomaly.detected (meta/causal/anomaly.js) — { anomalyUuid, type, severity,
 *      sessionId }. `wireAnomalyTrigger(bus)` is the pre-existing contract this
 *      file is required to satisfy — tests/nexus-full-audit.js already checks
 *      for both this exact function name and this exact subscription (Phase 71.4,
 *      "closes the loop"). A real, detected anomaly raises friction for its
 *      fault class directly — this is the organ's primary trigger.
 *
 *   2. HEAL_REQUESTED (service/nexus-diagnostic.js, guardian userscripts, CLI —
 *      all real, all already emitting this today) — a request that a fix be
 *      attempted. This organ does not run fixes (that's self-heal/index.js,
 *      Phase 3, not yet built). What it does here: refuse the request outright
 *      if the fault class is already in FAILURE_MODE, per docs/self-heal.spec
 *      level 4 ("no more auto-attempts"). It does not raise friction on a bare
 *      request — only a real anomaly or a reported failed attempt does that.
 *
 * recordAttemptOutcome() is exported for Phase 3 (self-heal's ladder) to call
 * after each attempt — raw code before interface (§3.4): this organ's actual
 * friction logic is provable and tested here, before anything above it exists.
 *
 * Emits:
 *   escalation.friction.increased — exact event name liminal-space already
 *     subscribes to (cortex/liminal-space/index.js) — this closes that dead
 *     listener from the earlier audit.
 *   escalation.failure_mode — no existing listener pins this name down yet;
 *     chosen to match the same dot-separated, no-cortex-prefix convention as
 *     the confirmed one above. Flagged as inferred, not confirmed, per §0.1.
 *
 * §14.2 Gates are pure functions, no side effects except emitting events —
 *   the one exception, matching every other organ in this codebase
 *   (liminal-space, intelligence): JAA write happens first (§9.2), via
 *   fault-taxonomy's raiseFriction/recordSuccess, then the event is emitted.
 * §14.4 Infinite loop prevention — neither anomaly.detected nor HEAL_REQUESTED
 *   is re-emitted by this organ, so there is no cycle to guard against here
 *   (unlike liminal-space's crystallisation gate, which re-emitted its own
 *   trigger condition). Noted rather than bolted on unearned (§0.5).
 */

const faultTaxonomy = require('./fault-taxonomy');
// §BUILT 2026-09-12 — James: "using oscillations to balance resources."
// This is the exact, real, previously-named gap from docs/escalation.spec's
// own addendum_2026_07_20 ("Oscillation damping... via telemetry-codec's
// OscillationEngine before it can walk a fault class into FAILURE_MODE on
// rhythm alone. Named, not built.") — a real, already-built, already-tested
// engine (IS IT RHYTHMIC: period/regularity/amplitude, built for exactly
// this class of signal — "retry storm oscillation" is named in its own
// header), just never wired to the one consumer that was always meant to
// use it.
const { OscillationEngine } = require('../../intelligence/telemetry-codec/engines.js');

const MODULE_ID = 'cortex/self-heal/escalation';
const VERSION = '1.0.0';

let _bus = null;

// Anomaly severity → self-heal ladder level. Not spec'd numerically anywhere
// found; a defensible, documented mapping — high severity costs more friction
// per occurrence than low, matching the ladder's own 0.10→0.50 progression.
const SEVERITY_TO_LEVEL = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

function _levelForSeverity(severity) {
  return SEVERITY_TO_LEVEL[severity] ?? 1; // unrecognised severity → level 1, not a silent 0
}

// ── anomaly.detected → raise friction directly ─────────────────────────────────
function _onAnomalyDetected(event) {
  const { anomalyUuid, type, severity, sessionId } = event?.payload || {};
  if (!type) {
    console.warn(`[${MODULE_ID}] anomaly.detected with no type — ${anomalyUuid || 'no uuid'}, ignoring (§1.2: named, not silently dropped)`);
    return;
  }

  const level = _levelForSeverity(severity);
  let result;
  try {
    result = faultTaxonomy.raiseFriction(type, level, { example: { anomalyUuid, sessionId, ts: Date.now() } });
  } catch (e) {
    console.warn(`[${MODULE_ID}] raiseFriction failed for '${type}': ${e.message}`);
    return;
  }

  _emitFrictionChange(type, result, { cause: 'anomaly.detected', anomalyUuid, sessionId });
}

// §BUILT 2026-09-12 — see the require() comment above. One instance per
// resource-pressure-driven fault class (currently just memory_pressure —
// the only real caller of _onResourcePressure), window=60 samples at
// resource-monitor's real 10s sampling cadence (orchestrator/orchestrator.js)
// = ~10min of real history, plenty for OSC_MIN_CYCLES (3) to resolve a
// genuine rhythm rather than reacting to the first two data points.
const _pressureOsc = new OscillationEngine(60);
const PRESSURE_LEVEL_NUM = Object.freeze({ ok: 0, pressure: 1, critical: 2 });

// ── nexus.resource.pressure → memory_pressure friction ────────────────────────
// §BUILT 2026-07-20, from a live crash log: guardian and orchestrator both
// died with 0xC0000409 under 16.7% free memory, two minutes AFTER
// resource-monitor emitted 'nexus.resource.pressure' on the bus — an event
// that, until this handler, had zero consumers. The system knew and had no
// reflex. 'memory_pressure' has been one of KNOWN_FAULT_CLASSES since
// Phase 1 (docs/self-heal.spec) — this wires the real signal to the fault
// class that was defined to receive it. Cross-process path: orchestrator's
// resource-monitor emits on its bus → orchestrator relays to cortex
// POST /api/event (the same path guardian already uses) → cortex re-emits
// in-process → this handler.
//   level 'pressure' → raiseFriction level 1   (0.20)
//   level 'critical' → raiseFriction level 3   (0.50 — two criticals = FAILURE_MODE)
//   level 'ok'       → recordSuccess           (friction decays ×0.5, not amnesia)
// Transitions only (resource-monitor's own contract), so sustained pressure
// cannot march friction up on repetition alone.
//
// §BUILT 2026-09-12 — oscillation damping, previously named as future work
// above this same line (git blame: "not built here" until now). Every
// reading (ok/pressure/critical, mapped to 0/1/2) feeds a real
// OscillationEngine. A REGULAR, rhythmic flap (this exact session's own
// boot logs show ok↔pressure↔critical cycling every 10-30s, sustained for
// over an hour) caps a 'critical' reading's escalation at ladder level 1
// instead of 3 — the condition is predictably going to self-resolve on its
// own rhythm, so it shouldn't be allowed to walk memory_pressure into
// FAILURE_MODE on rhythm alone (two full-severity criticals = FAILURE_MODE
// per the table above). A NON-oscillating, or still-forming (<3 cycles),
// critical reading is untouched — a genuinely worsening, non-rhythmic
// crisis still escalates at full severity. Emergency GC (below) is
// deliberately NOT damped — it is cheap, already rate-limited to once per
// 30s, and a pure resource-saving action with no false-escalation risk, so
// there's no reason to withhold it during a real oscillation.
function _onResourcePressure(event) {
  const { level, reasons } = event?.payload || {};
  if (!level) return;

  const osc = _pressureOsc.feed(PRESSURE_LEVEL_NUM[level] ?? 0);
  const isDampedRhythm = osc.oscillating && osc.regularity > 0.5;

  if (level === 'ok') {
    const result = faultTaxonomy.recordSuccess('memory_pressure');
    if (result && _bus) {
      _bus.emit('escalation.friction.increased', {
        faultClass: 'memory_pressure', newFric: result.friction, band: result.band,
        cause: 'pressure_recovered',
      });
    }
    return;
  }

  // §FIX 2026-08-27 — 'critical' pressure is the exact condition that killed
  // guardian+orchestrator (0xC0000409) at 16.7% free memory on 2026-07-20 (see
  // header comment above). This process has since seen 'critical' readings as
  // low as 8.6% free — worse than that crash — and up to now the only response
  // at any friction level, including FAILURE_MODE, was this file's own
  // console.warn: raiseFriction() ran, escalation.failure_mode was emitted,
  // and nothing in the live codebase subscribes to that event (confirmed by
  // grep — only tests do). cortex/self-heal/index.js's 5-level ladder
  // (known-fix replay, safe-fix request, propose-to-forge, 12-engine deep
  // scan, and a real `failure_modes` JAA write on level 4) already exists and
  // already lists 'memory_pressure' in KNOWN_FAULT_CLASSES, but nothing ever
  // called it for this fault class — resource pressure and HEAL_REQUESTED
  // were two disconnected paths. This closes that: a real, safe, immediate
  // action on 'critical' (forced GC, if the process exposes it), plus routing
  // into the actual ladder so a human-visible failure_modes record gets
  // written instead of the alarm firing into a room with nobody in it.
  if (level === 'critical') {
    _attemptEmergencyGC(reasons); // never damped — see header comment above
    if (isDampedRhythm) {
      console.warn(`[${MODULE_ID}] memory_pressure oscillating (period~${osc.period} samples, regularity ${osc.regularity}) — treating this 'critical' reading as ladder level 1, not escalating to FAILURE_MODE-track severity on rhythm alone`);
    }
  }

  const ladderLevel = (level === 'critical' && !isDampedRhythm) ? 3 : 1;
  let result;
  try {
    result = faultTaxonomy.raiseFriction('memory_pressure', ladderLevel,
      { example: { reasons, level, ts: Date.now() } });
  } catch (e) {
    console.warn(`[${MODULE_ID}] pressure raiseFriction failed: ${e.message}`);
    return;
  }
  _emitFrictionChange('memory_pressure', result, { cause: 'nexus.resource.pressure', level });

  // Route into the real ladder (cortex/self-heal/index.js), same event shape
  // its own _onHealRequested expects. On 'critical' this reaches level 3
  // (deep scan) or, if friction just crossed FAILURE_MODE, the ladder's own
  // level-4 handler — which writes a `failure_modes` row and emits
  // cortex.self-heal.failure_mode, giving this a persisted, queryable trace
  // instead of a log line that scrolls past.
  if (_bus) {
    _bus.emit('HEAL_REQUESTED', {
      gapType: 'memory_pressure',
      gapUuid: null,
      body: `nexus.resource.pressure level=${level} reasons=${JSON.stringify(reasons || [])}`,
      modulePath: 'orchestrator/lib/resource-monitor',
    });
  }
}

// ── Emergency GC — the one thing this organ can safely do itself, in-process,
// with no cross-process IPC and no risk of killing a healthy kernel. Real,
// not a stub: only fires if the process was started with --expose-gc (guard
// is honest about that, doesn't pretend gc ran when it didn't), and is
// rate-limited so repeated 'critical' ticks inside the same episode don't
// hammer it (V8's gc() is a stop-the-world pause — useful sparingly, harmful
// if spammed every 10s alongside a resource monitor that's already sampling
// that often).
const _GC_COOLDOWN_MS = 30000;
let _lastGcAt = 0;
function _attemptEmergencyGC(reasons) {
  const now = Date.now();
  if (now - _lastGcAt < _GC_COOLDOWN_MS) return;
  if (typeof global.gc !== 'function') {
    console.warn(`[${MODULE_ID}] critical memory pressure but global.gc() is not exposed ` +
      `(start this process with --expose-gc to enable forced collection) — reasons: ${JSON.stringify(reasons || [])}`);
    return;
  }
  _lastGcAt = now;
  try {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    console.warn(`[${MODULE_ID}] critical memory pressure — forced GC freed ` +
      `${((before - after) / 1048576).toFixed(1)}MB (heapUsed ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB)`);
    if (_bus) {
      _bus.emit('cortex.self-heal.emergency_gc', {
        faultClass: 'memory_pressure', freedBytes: before - after, ts: now,
      });
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] forced GC threw: ${e.message}`);
  }
}

// §FIXED 2026-09-06 — James, direct, from a real 5-hour-long log: "the
// system needs to continue... persist through restarts, or crashes" and,
// several turns earlier this same session: "needs to retry even when
// logged in the failure_modes if the problem persists." Confirmed real
// and ongoing from an actual boot log: memory_pressure refused 49 times
// over nearly 5 hours (07:12-12:01), permanently latched, never once
// re-attempted. FAILURE_MODE's original intent (docs/self-heal.spec
// level 4, "no more auto-attempts") was a real, correct safety valve
// against infinite instant retry loops — but "no more, ever" and "the
// condition might have genuinely resolved by now" are different claims.
// RETRY_COOLDOWN_MS gives a real, bounded periodic re-check instead of
// either extreme: not instant re-spam (the original problem), not
// permanent silence (this bug). Cooldown anchored on existing.lastSeen —
// already a real field, already updated by every real raiseFriction()
// call — so this needed no new state, just a real time check before the
// refusal.
const RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 min — real, bounded, not instant, not never

// ── HEAL_REQUESTED → refuse if already in FAILURE_MODE, otherwise no-op ────────
// (this organ tracks friction; self-heal, Phase 3, is what actually attempts fixes)
function _onHealRequested(event) {
  const faultClass = event?.payload?.gapType;
  if (!faultClass) return; // no fault class to check against — nothing this organ can do

  const existing = faultTaxonomy.getFaultClass(faultClass);
  if (existing && faultTaxonomy.bandFor(existing.friction) === 'FAILURE_MODE') {
    const sinceLastSeen = Date.now() - (existing.lastSeen || 0);
    if (sinceLastSeen < RETRY_COOLDOWN_MS) {
      if (_bus) _bus.emit('escalation.failure_mode', {
        faultClass,
        friction: existing.friction,
        cause: 'HEAL_REQUESTED refused',
        gapUuid: event.payload.gapUuid,
        message: `'${faultClass}' is in FAILURE_MODE (friction ${existing.friction}) — no more auto-attempts (docs/self-heal.spec level 4)`,
      });
      console.warn(`[${MODULE_ID}] refused HEAL_REQUESTED for '${faultClass}' — already in FAILURE_MODE`);
      return;
    }
    // Real cooldown has passed — let this one real attempt through. If the
    // condition genuinely resolved, recordSuccess() (called elsewhere on
    // a real successful outcome) decays friction below FAILURE_MODE and
    // this fault class is truly clear again. If it hasn't, raiseFriction
    // updates lastSeen and the same cooldown starts fresh — never a
    // instant-retry storm, never a permanent silence.
    console.warn(`[${MODULE_ID}] '${faultClass}' still in FAILURE_MODE but cooldown (${RETRY_COOLDOWN_MS}ms) elapsed since last real check (${sinceLastSeen}ms ago) — allowing one real re-attempt instead of refusing forever`);
  }
}

function _emitFrictionChange(faultClass, result, meta = {}) {
  if (!_bus) return;
  _bus.emit('escalation.friction.increased', {
    faultClass,
    newFric: result.row.friction,
    band: result.band,
    count: result.row.count,
    ...meta,
  });
  if (result.justEnteredFailureMode) {
    _bus.emit('escalation.failure_mode', {
      faultClass,
      friction: result.row.friction,
      cause: meta.cause || 'friction_accumulation',
      message: `'${faultClass}' crossed into FAILURE_MODE (friction ${result.row.friction}) — no more auto-attempts (docs/self-heal.spec level 4)`,
    });
    console.warn(`[${MODULE_ID}] '${faultClass}' entered FAILURE_MODE`);
  }
}

// ── Exported for Phase 3 (self-heal ladder) to call after each attempt ─────────
// §3.4 — raw code, callable and tested independently of any bus or interface.
function recordAttemptOutcome(faultClass, level, succeeded, meta = {}) {
  let result;
  if (succeeded) {
    result = faultTaxonomy.recordSuccess(faultClass);
    if (_bus && result) {
      _bus.emit('escalation.friction.increased', {
        faultClass, newFric: result.friction, band: result.band,
        cause: 'attempt_succeeded', ...meta,
      });
    }
  } else {
    result = faultTaxonomy.raiseFriction(faultClass, level, meta);
    _emitFrictionChange(faultClass, result, { cause: 'attempt_failed', level, ...meta });
  }
  // §FIXED 2026-09-11 — after raiseFriction/recordSuccess, so the row is
  // guaranteed to exist (recordAttempt() is a no-op against a missing row,
  // and on a brand-new fault class's very first attempt there is no row
  // until the call above creates one). See fault-taxonomy.js row-shape note.
  faultTaxonomy.recordAttempt(faultClass);
  return result;
}

// ── wireAnomalyTrigger — the exact contract tests/nexus-full-audit.js checks for
function wireAnomalyTrigger(bus) {
  _bus = bus; // §1.2 — without this, raiseFriction still runs but the resulting
              // event silently never emits when this is called standalone.
  bus.on('anomaly.detected', _onAnomalyDetected);
}

// ── §12.6 diagnostic engine — health right now, not just a test that passed once
function health() {
  return {
    ok: true,
    module: MODULE_ID,
    version: VERSION,
    busWired: !!_bus,
    thresholds: faultTaxonomy.FRICTION_THRESHOLDS,
  };
}

function init(cfg = {}) {
  if (cfg.bus) {
    wireAnomalyTrigger(cfg.bus);
    cfg.bus.on('HEAL_REQUESTED', _onHealRequested);
    cfg.bus.on('nexus.resource.pressure', _onResourcePressure);
  }
  console.log(`[${MODULE_ID}] v${VERSION} — friction ledger active${_bus ? ' (bus-wired)' : ' (no bus — test mode)'}`);
  return { ok: true };
}

function stop() {
  if (_bus) {
    _bus.off('anomaly.detected', _onAnomalyDetected);
    _bus.off('HEAL_REQUESTED', _onHealRequested);
    _bus.off('nexus.resource.pressure', _onResourcePressure);
  }
  _bus = null; // avoid a stale reference outliving the listeners that used it
}

module.exports = {
  MODULE_ID, VERSION,
  init, stop, health,
  wireAnomalyTrigger,
  recordAttemptOutcome,
  SEVERITY_TO_LEVEL,
  _pressureOsc, // exported for direct testing, §4.1 — real oscillation state, deliberately not reset by stop() (same convention as _lastGcAt/_GC_COOLDOWN_MS above: it tracks real elapsed rhythm, not a per-session fixture)
};
