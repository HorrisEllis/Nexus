'use strict';
/**
 * lib/seam/gates.js — Composable seam-chunking gates
 * UUID: nexus-seam-gates-v1-0000-2026-0705-jamesbrooks-002
 * Version: 2.0.0
 *
 * §MIGRATED 2026-07-06 — WARP is the backbone now, replacing the plain
 * inline SISO copy this file used to import from ./stream.js. Two real
 * things had to be true before this migration was safe, both checked and
 * fixed, not assumed:
 *   1. WARP's core Gate/Stream had to actually support async transforms
 *      (CascadeGate/PersistGate are inherently async — real dispatch,
 *      real Cortex writes). Confirmed WARP's Stream.emit() was
 *      synchronous-only before this session's fix — extended it to
 *      detect a thenable return value and only go async then, tested
 *      against Loom's own real 18-test suite (18/18 still pass) plus
 *      four new tests covering sync, async, mixed sync-then-async-then-sync
 *      chains, and synchronous-throw regression, before touching this
 *      file at all.
 *   2. Every gate's imperative `stream.emit(...)` call had to become a
 *      pure returned Event[] — WARP's Gate.transform(event) returns
 *      what it produces; Stream is the only thing that calls emit().
 *      lib/seam/stream.js (the old inline SISO copy) is no longer
 *      required by this file — kept only for anything else that might
 *      still reference it directly, not deleted in this pass.
 *   3. WARP's Stream.register() has no unregister/deregister method,
 *      unlike the old inline copy this replaces. Checked before dropping
 *      it: registerPersistGates()'s combined-unregister return value had
 *      zero real callers using it anywhere in the codebase. Dropped
 *      rather than faked; a real per-gate teardown need would be a real
 *      addition to WARP's core itself, not something to paper over here.
 *
 * Five gates. None of them know about WARP's dispatch layer, RAID, or
 * Cortex by name — where a backend is needed (generation, persistence),
 * the gate takes an injected function in its constructor and calls that.
 * The WARP dependency here is purely the core Event/Gate/Stream
 * primitives (the architectural backbone), not warp/dispatch (the
 * cache/cascade layer) — those stay separate, pluggable adapters exactly
 * as before (see lib/seam/adapters/).
 *
 * Event flow — unchanged from v1.0.0, still non-linear by construction:
 *
 *   seam.registry.build   -> RegistryGate  -> seam.record.ready (x N)
 *                                          -> seam.registry.built (once)
 *   seam.record.ready     -> ClassifyGate  -> seam.blocked | seam.skipped |
 *                                            seam.mechanical | seam.dispatchable
 *   seam.dispatchable     -> AxiomGate     -> seam.axioms.ready
 *   seam.axioms.ready     -> CascadeGate   -> seam.generated | seam.rejected   (pluggable)
 *   any terminal event    -> PersistGate   -> seam.persisted                  (pluggable)
 */
const { Event, Gate } = require('../../warp/core');
const { buildSeamRecord, buildSeamRegistry } = require('./kg-seam-bridge');
const { buildAxiomsForSeam } = require('./axioms');

// -- RegistryGate -------------------------------------------------------------
function _registryTransform(event) {
  const { compileResult, opts = {} } = event.data;
  let records;
  try {
    records = buildSeamRegistry(compileResult, opts);
  } catch (err) {
    return [new Event('seam.registry.error', { error: err.message })];
  }
  const out = records.map(record => new Event('seam.record.ready', { record }));
  out.push(new Event('seam.registry.built', { records, count: records.length }));
  return out;
}
class RegistryGate extends Gate {
  constructor() { super('seam.registry.build', { transform: _registryTransform }); }
}

// -- ClassifyGate --------------------------------------------------------------
function _classifyTransform(event) {
  const { record } = event.data;
  const decision = record.decision;

  if (!decision) {
    return [new Event('seam.blocked', { record, reason: 'no_tier_decision' })];
  }
  if (decision.tier === 'BLOCKED' || decision.tier === 'MISSING') {
    return [new Event('seam.blocked', { record, reason: decision.reason })];
  }
  if (decision.tier === 'SKIP') {
    return [new Event('seam.skipped', { record, reason: decision.reason })];
  }
  if (!decision.requiresLLM) {
    return [new Event('seam.mechanical', {
      record, output: { scaffold: true, tier: decision.tier, action: decision.action, exports: record.contract.exports },
    })];
  }
  return [new Event('seam.dispatchable', { record })];
}
class ClassifyGate extends Gate {
  constructor() { super('seam.record.ready', { transform: _classifyTransform }); }
}

// -- AxiomGate ------------------------------------------------------------------
function _axiomTransform(event) {
  const { record } = event.data;
  const axioms = buildAxiomsForSeam(record);
  return [new Event('seam.axioms.ready', { record, axioms })];
}
class AxiomGate extends Gate {
  constructor() { super('seam.dispatchable', { transform: _axiomTransform }); }
}

// -- CascadeGate ----------------------------------------------------------------
class CascadeGate extends Gate {
  constructor({ dispatch }) {
    if (typeof dispatch !== 'function') {
      throw new Error('[seam/gates] CascadeGate requires a dispatch(record, axioms) function -- no default backend is assumed');
    }
    super('seam.axioms.ready', {
      transform: async (event) => {
        const { record, axioms } = event.data;
        try {
          const result = await dispatch(record, axioms);
          return [new Event(result?.ok ? 'seam.generated' : 'seam.rejected', { record, result })];
        } catch (err) {
          return [new Event('seam.rejected', { record, result: { ok: false, error: err.message } })];
        }
      },
    });
  }
}

// -- PersistGate ------------------------------------------------------------------
const TERMINAL_EVENTS = ['seam.blocked', 'seam.skipped', 'seam.mechanical', 'seam.generated', 'seam.rejected'];

class PersistGate extends Gate {
  constructor(signature, { persist }) {
    if (typeof persist !== 'function') {
      throw new Error('[seam/gates] PersistGate requires a persist(kind, record, payload) function -- no default backend is assumed');
    }
    const kind = signature.replace('seam.', '');
    super(signature, {
      transform: async (event) => {
        const payload = event.data;
        try {
          await persist(kind, payload.record, payload);
        } catch (_) { /* persistence is a mirror, never blocks the stream */ }
        return [new Event('seam.persisted', { kind, record: payload.record })];
      },
    });
  }
}

function registerPersistGates(stream, persist) {
  for (const sig of TERMINAL_EVENTS) stream.register(new PersistGate(sig, { persist }));
}

module.exports = {
  RegistryGate, ClassifyGate, AxiomGate, CascadeGate, PersistGate,
  registerPersistGates, TERMINAL_EVENTS,
};
