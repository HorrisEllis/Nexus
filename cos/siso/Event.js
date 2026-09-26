/**
 * §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports Event from
 * warp/core/Event.js instead of this file. Nothing in the tree requires
 * this file anymore (checked). Left in place, not deleted, per this
 * codebase's own §7.4 (nothing discarded) — but it is dead code. See
 * cos/siso/index.js's header for why the switch happened and what, if
 * anything, warp/core/Event.js had to gain to replace it.
 */
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
