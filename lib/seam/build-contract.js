'use strict';
/**
 * lib/seam/build-contract.js — createSeamStream convenience factory
 * UUID: nexus-seam-build-contract-v1-0000-2026-0705-jamesbrooks-001
 * Version: 1.0.0
 *
 * Not a required entry point — a caller can assemble gates.js's pieces by
 * hand instead (register only RegistryGate + ClassifyGate for a read-only
 * feed, write a custom CascadeGate, skip PersistGate entirely). This is
 * just the common case wired up so most callers don't have to.
 *
 * `dispatch` and `persist` are both optional. Omit `dispatch` and
 * seam.axioms.ready events go unconsumed (valid — §1.2, not an error,
 * just nothing has claimed them). Omit `persist` and nothing writes
 * anywhere outside process memory; the caller observes terminal events
 * via stream.on(...) instead.
 */
const { Stream, StreamLog } = require('../../warp/core');
const { RegistryGate, ClassifyGate, AxiomGate, CascadeGate, registerPersistGates, TERMINAL_EVENTS } = require('./gates');

function createSeamStream({ dispatch = null, persist = null, logLevel = null } = {}) {
  const log = logLevel ? new StreamLog(logLevel) : null;
  const stream = new Stream({ log });

  stream.register(new RegistryGate());
  stream.register(new ClassifyGate());
  stream.register(new AxiomGate());

  if (dispatch) {
    stream.register(new CascadeGate({ dispatch }));
  }
  if (persist) {
    registerPersistGates(stream, persist);
  }

  return stream;
}

module.exports = { createSeamStream, TERMINAL_EVENTS };
