'use strict';
// ── SISO Core · StreamLog ─────────────────────────────────────────────────────
// Audit trail. Shared across a stream and its sub-streams.
// Level is mutable at runtime. Not a gate — self-observation by infrastructure.
// Ported from SISO (Core)/src/core/StreamLog.js to CJS.

const LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };

let _streamIdCounter = 0;

class StreamLog {
  constructor(level = 'EVENTS') {
    this.level   = level;
    this.entries = [];
    this.seq     = 0;
  }

  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = LEVELS[this.level] || 0;
    if (lvl === 0) return;

    const entry = {
      seq:     this.seq++,
      time:    Date.now(),
      type:    eventType,
      claimed: gateClaimed,
    };

    if (lvl >= 2) {
      entry.streamId = streamId;
      if (parentStreamId != null) entry.parentStreamId = parentStreamId;
    }

    if (lvl >= 3) {
      entry.data = eventData;
    }

    this.entries.push(entry);
  }

  nextStreamId() {
    return ++_streamIdCounter;
  }

  sample() {
    return {
      level:   this.level,
      count:   this.entries.length,
      entries: [...this.entries],
    };
  }

  clear() {
    this.entries = [];
    this.seq     = 0;
  }
}

module.exports = { StreamLog };
