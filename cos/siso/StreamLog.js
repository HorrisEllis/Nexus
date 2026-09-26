/**
 * §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports StreamLog from
 * warp/core/StreamLog.js instead of this file. Nothing in the tree requires
 * this file anymore (checked). Left in place, not deleted, per this
 * codebase's own §7.4 (nothing discarded) — but it is dead code. See
 * cos/siso/index.js's header for why the switch happened and what, if
 * anything, warp/core/StreamLog.js had to gain to replace it.
 */
/**
 * siso/StreamLog.js
 * COMPARTMENT OS — SISO Core: StreamLog
 *
 * Ported from SISO Core v1.0.0 (ES module → CJS).
 * Spec: Jonathan Bailey, SISO paper §2.1
 * Integration: James Brooks (Erosmancer)
 *
 * The audit trail. A shared object that streams write to.
 * One log sees every event across a stream and its sub-streams.
 * Not a gate. Not a primitive. Self-observation by the
 * infrastructure that already makes the decisions.
 *
 * Levels (each includes everything below):
 *   OFF    — nothing
 *   EVENTS — sequence, timestamp, type, claimed/pending
 *   DEEP   — sub-streams participate with parent/child IDs
 *   DATA   — includes full event payloads
 *
 * Level is mutable at runtime. Change it and the next
 * emit() respects it immediately.
 *
 * In COS: this is the Nexus master kernel's audit backbone.
 * Every kernel event that flows through the host stream
 * is recorded here at whatever resolution you set.
 */

'use strict';

const LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };

let _streamIdCounter = 0;

class StreamLog {
  /**
   * @param {'OFF'|'EVENTS'|'DEEP'|'DATA'} level
   */
  constructor(level = 'EVENTS') {
    this.level   = level;
    this.entries = [];
    this.seq     = 0;
  }

  /**
   * Called by Stream.emit(). The stream passes what it already knows.
   * No extra work unless logging is on.
   */
  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = LEVELS[this.level] || 0;
    if (lvl === 0) return;

    const entry = {
      seq:     this.seq++,
      time:    Date.now(),
      type:    eventType,
      claimed: gateClaimed,
    };

    // DEEP — include stream lineage
    if (lvl >= 2) {
      entry.streamId = streamId;
      if (parentStreamId != null) {
        entry.parentStreamId = parentStreamId;
      }
    }

    // DATA — include full payload
    if (lvl >= 3) {
      entry.data = eventData;
    }

    this.entries.push(entry);
  }

  /**
   * Generate a unique stream ID. Called by Stream on construction
   * when a log is present.
   */
  nextStreamId() {
    return ++_streamIdCounter;
  }

  /**
   * Read the full log. Observation, not consumption.
   * Same philosophy as Stream.sampleHere().
   */
  sample() {
    return {
      level:   this.level,
      count:   this.entries.length,
      entries: [...this.entries],
    };
  }

  /**
   * Clear the log. The one concession to mutability —
   * for long-running systems that need to shed history.
   */
  clear() {
    this.entries = [];
    this.seq     = 0;
  }

  /**
   * Return all entries since a given seq number.
   * Mirrors EventBus.since() semantics for compatibility.
   * @param {number} afterSeq
   */
  since(afterSeq) {
    return this.entries.filter(e => e.seq > afterSeq);
  }
}

module.exports = { StreamLog };
