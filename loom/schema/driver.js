'use strict';
/**
 * loom/schema/driver.js — the one function outside code calls: declare().
 * comp_id: nexus.loom.driver
 * UUID: nexus-loom-driver-v1-0000-2026-0701-jamesbrooks-001
 *
 * Wires the four Gates + five Axioms into a real Warp Stream+StreamLog,
 * emits the declaration, and persists whatever the Gate legitimately
 * produced to the disk-first LoomRegistry. This is CLI/API's future
 * entry point (Phase 132/133) — those layers call declare(), they don't
 * reimplement any of this.
 *
 * Why a Gate's transform() is called directly here, not only reached
 * via stream.emit(): Stream.emit() is void — it recurses internally and
 * returns nothing, by design (Warp's Stream, like SISO's, drives a
 * pipeline, it doesn't hand results back to the caller). We still route
 * every declaration through stream.emit() first, for the real axiom-
 * checked, logged, audited path — rejected declarations stop there and
 * never reach transform(). Only for a declaration that already passed
 * every hard axiom do we call gate.transform(event) directly to obtain
 * its output for persistence. This is safe specifically because
 * Gate.transform is guaranteed pure ("same input -> same output,
 * always" — Warp's own design law): calling it a second time after
 * stream.emit() already called it once produces byte-identical output,
 * so there is no double-effect, only a double-computation of a pure
 * function. No warp/core file is modified to make this work.
 */
const { Stream, StreamLog } = require('../../warp/core');
const { Event } = require('../../warp/core');
const { LoomRegistry } = require('./registry');
const { makeLoomAxioms } = require('./axioms');
const {
  componentDeclareGate, seamDeclareGate, hookDeclareGate, wireDeclareGate, concernDeclareGate,
} = require('./gates');

const KIND_TO_GATE = {
  component: componentDeclareGate,
  seam: seamDeclareGate,
  hook: hookDeclareGate,
  wire: wireDeclareGate,
  concern: concernDeclareGate,
};

class LoomDriver {
  constructor({ dataDir = null } = {}) {
    this.registry = new LoomRegistry({ dataDir });
    this.log = new StreamLog();
    this.stream = new Stream({ log: this.log, axioms: makeLoomAxioms(this.registry) });
    for (const gate of Object.values(KIND_TO_GATE)) this.stream.register(gate);
  }

  /**
   * declare(kind, payload) -> { ok, stored?, rejected?, reason? }
   * kind: 'component' | 'seam' | 'hook' | 'wire'
   */
  declare(kind, payload) {
    if (!KIND_TO_GATE[kind]) {
      throw new Error(`[loom/driver] unknown declaration kind: ${kind}`);
    }
    const gate = KIND_TO_GATE[kind];
    const event = new Event(`loom.${kind}.declare`, payload);

    // Real axiom-checked, logged path first.
    const preCheck = this.stream._checkAxioms(event, gate);
    this.stream.emit(event);

    if (!preCheck.ok) {
      return { ok: false, reason: 'axiom-rejected', failures: preCheck.failures };
    }

    // Axioms passed — obtain the Gate's pure output for persistence.
    const produced = gate.transform(event);
    const registered = produced.find(e => e.type === `loom.${kind}.registered`);
    const rejected = produced.find(e => e.type === `loom.${kind}.rejected`);

    if (rejected) {
      return { ok: false, reason: 'schema-rejected', detail: rejected.data };
    }
    if (!registered) {
      return { ok: false, reason: 'no-output-produced' };
    }

    const stored = this.registry.add(kind, registered.data);
    return { ok: true, stored };
  }

  graph() {
    return this.registry.graph();
  }

  rejectedLog() {
    return [...this.stream.rejected];
  }

  auditTrail() {
    return this.log.entries();
  }
}

module.exports = { LoomDriver };
