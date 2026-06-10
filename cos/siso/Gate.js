/**
 * siso/Gate.js
 * COMPARTMENT OS — SISO Core: Gate
 *
 * Ported from SISO Core v1.0.0 (ES module → CJS).
 * Spec: Jonathan Bailey, SISO paper §2.1
 * Integration: James Brooks (Erosmancer)
 *
 * A shape that recognizes one event type and transforms it
 * into zero or more new events.
 *
 * The signature is a unique key. No two gates in a stream
 * may share one. Collision is a hard error, not silent.
 * The stream uses signature for direct lookup — O(1).
 *
 * This is the shape of the arrow in →E→E→
 */

'use strict';

class Gate {
  /**
   * @param {string} signature — must match the event type this gate handles
   */
  constructor(signature) {
    if (!signature || typeof signature !== 'string') {
      throw new Error('Gate: signature must be a non-empty string');
    }
    this.signature = signature;
  }

  /**
   * Transform the event. May call stream.emit() zero or more times.
   * The original event is consumed — it does not land in pending.
   *
   * Override in subclass. The base no-op is intentional —
   * a gate that consumes and discards is valid.
   *
   * @param {Event} event
   * @param {Stream} stream
   */
  transform(event, stream) {
    // Override in subclass.
  }
}

module.exports = { Gate };
