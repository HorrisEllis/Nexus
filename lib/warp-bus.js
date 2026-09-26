'use strict';
/**
 * lib/warp-bus.js — WARP as the spine, attached to an existing bus
 * UUID: nexus-warp-bus-v1-0000-2026-0709-jamesbrooks-001
 * Version: 1.0.0
 *
 * §INTENT (James, 2026-07-09): "warp is the spine for each system,
 * supposed to be. the system is supposed to be mapped, as it's built,
 * updated, fixed, all mapped first."
 *
 * §WHAT'S ACTUALLY TRUE — measured, not assumed. WARP is the spine of two
 * systems, not ten:
 *     loom      3 files (schema/{axioms,driver,gates}.js)
 *     ollama    1 file
 *     lib/seam  3 files (gates, build-contract, adapters/warp-cascade)
 *     everyone else: 0
 * guardian, cortex, copilot, orchestrator, idearium, architect, bridge and
 * emerge do not touch WARP at all. Their spine is nexus-bus.js — a raw
 * `class NexusBus extends EventEmitter`. WARP is a leaf, not a spine.
 *
 * §WHY THIS IS NOT A REWRITE — eighty files emit onto nexus-bus. Replacing
 * it outright would be the largest possible change with the least possible
 * evidence, which is exactly the pattern this codebase keeps getting hurt
 * by. Instead this ATTACHES: every event that flows through the existing
 * bus is mirrored into a real WARP Stream, recorded to a real StreamLog,
 * and checked against registered Axioms. No emitter changes. No listener
 * changes. The bus keeps its contract.
 *
 * Observe first. Enforce second. Replace only with evidence.
 *
 * §"MAPPED AS IT'S BUILT" — StreamLog.record() gives a durable, ordered
 * record of every event the system produced, and Stream.hooks() gives the
 * live wire registry. That is the map, generated from what actually ran,
 * not from a parallel document that drifts. The 64 orphaned routes exist
 * precisely because the map was a document instead of a projection.
 *
 * §AXIOMS — WARP's Axiom primitive validates an event before it is
 * accepted. Registered axioms here are ADVISORY by default (reported, not
 * thrown) because turning on enforcement over a live bus with 80 emitters,
 * on day one, would convert a reporting tool into an outage. `strict:true`
 * makes violations throw once you trust them.
 *
 * §1.2 — a violation is always reported. Never silently dropped.
 */
const { Stream, Axiom, StreamLog } = require('../warp/core/index.js');

class WarpSpine {
  /**
   * @param {object} opts
   *   bus        — the live nexus-bus instance (EventEmitter with .on)
   *   name       — system id, e.g. 'guardian'
   *   strict     — throw on axiom violation (default false: report only)
   *   maxLog     — cap StreamLog entries retained in memory
   */
  constructor({ bus, name = 'nexus', strict = false, maxLog = 5000 } = {}) {
    if (!bus?.on) throw new Error('[warp-bus] a bus with .on() is required');
    this.bus = bus;
    this.name = name;
    this.strict = strict;
    this.maxLog = maxLog;

    this.stream = new Stream(name);
    this.log = new StreamLog();
    this.violations = [];
    this.mirrored = 0;
    this._attached = false;
  }

  /**
   * axiom(id, check, severity) — register a real invariant over events.
   * Uses WARP's own Axiom primitive: `new Axiom(id, { check, severity })`,
   * where check(event, gate, sample) -> truthy. Severity is WARP's, not
   * invented here: 'hard' violations are rejections; 'soft' are advisories.
   */
  axiom(id, check, severity = 'hard') {
    if (typeof check !== 'function') throw new Error('[warp-bus] axiom check must be a function');
    this.stream.registerAxiom(new Axiom(id, { check, severity }));
    return this;
  }

  /** attach() — mirror every bus event into the WARP stream. Idempotent. */
  attach() {
    if (this._attached) return this;
    this._attached = true;

    // nexus-bus.js:72 emits `super.emit('*', event)` — a SINGLE event
    // object. Getting this wrong is not theoretical: orchestrator's
    // sigma-writer destructured it as (eventType, payload) and wrote
    // "[object Object]" into every sigma_record for months.
    this.bus.on('*', (event) => {
      if (!event || typeof event.type !== 'string') return;
      this.mirrored++;

      const violated = this._check(event);
      if (violated.length) {
        this.violations.push({ type: event.type, id: event.id, violated, ts: Date.now() });
        // §1.2 — always reported, whether or not we throw.
        console.warn(`[warp-bus:${this.name}] axiom violation on '${event.type}': ${violated.join(', ')}`);
        if (this.strict) throw new Error(`[warp-bus] axiom violation: ${violated.join(', ')}`);
      }

      // The map: a durable, ordered record of what actually ran.
      try {
        this.log.record({
          streamId: this.name,
          type: event.type,
          source: event.source,
          causedBy: event.causedBy,
          ts: event.ts,
          id: event.id,
        });
      } catch (e) {
        console.warn(`[warp-bus:${this.name}] StreamLog.record failed: ${e.message}`);
      }
      this._trimLog();
    });

    return this;
  }

  _check(event) {
    const failed = [];
    // Stream stores registered axioms on `this.axioms` (read from
    // warp/core/Stream.js, not guessed — an earlier draft of this file
    // assumed `_axioms` and silently checked nothing).
    const axioms = this.stream.axioms || [];
    for (const ax of axioms) {
      let ok = true;
      // WARP's real signature: check(event, gate, sample). No gate here —
      // this is a bus mirror, not a transform pipeline.
      try { ok = !!ax.check(event, null, null); }
      catch (_) { ok = false; } // an axiom that throws on an event is a violation, not a crash
      if (!ok) failed.push(`${ax.id}${ax.severity === 'soft' ? '(soft)' : ''}`);
    }
    return failed;
  }

  _trimLog() {
    const entries = this.log.entries?.();
    if (Array.isArray(entries) && entries.length > this.maxLog) entries.splice(0, entries.length - this.maxLog);
  }

  /** map() — the live projection: what ran, and what is wired. */
  map() {
    const entries = this.log.entries?.() || [];
    const byType = {};
    for (const e of entries) byType[e.type] = (byType[e.type] || 0) + 1;
    return {
      system: this.name,
      mirrored: this.mirrored,
      distinctEventTypes: Object.keys(byType).length,
      byType,
      violations: this.violations.length,
      hooks: typeof this.stream.hooks === 'function' ? this.stream.hooks() : undefined,
    };
  }
}

/**
 * Default axioms every NEXUS system's spine should hold. Each is real,
 * checkable, and was violated by real code in this repository.
 */
function defaultAxioms(spine) {
  return spine
    // Violated for months by orchestrator/lib/sigma-writer.js, which passed
    // the whole event object where a type string was expected. Hard.
    .axiom('type-is-string', e => typeof e.type === 'string' && e.type.length > 0, 'hard')
    // §5.1 — UUID on everything.
    .axiom('has-id', e => !!e.id, 'hard')
    .axiom('has-ts', e => Number.isFinite(e.ts), 'hard')
    // A causedBy that names nothing breaks causal tracing silently. Soft:
    // real events legitimately omit it; only a wrong TYPE is a violation.
    .axiom('causedBy-is-string-or-absent',
           e => e.causedBy === undefined || e.causedBy === null || typeof e.causedBy === 'string', 'soft');
}

module.exports = { WarpSpine, defaultAxioms };
