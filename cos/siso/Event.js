/**
 * siso/Event.js
 * COMPARTMENT OS — SISO Core: Event
 *
 * Ported from SISO Core v1.0.0 (ES module → CJS).
 * Spec: Jonathan Bailey, SISO paper §2.1
 * Integration: James Brooks (Erosmancer)
 *
 * A datum flowing through the stream.
 * Has a type (its signature) and arbitrary data.
 * This is E in →E→E→
 *
 * Immutable by convention — gates emit new events,
 * never mutate existing ones.
 */

'use strict';

class Event {
  /**
   * @param {string} type   — event type string, e.g. 'host:compartment:created'
   * @param {object} data   — arbitrary payload
   */
  constructor(type, data = {}) {
    this.type = type;
    this.data = data;
  }
}

module.exports = { Event };
