'use strict';
// ── SISO Core · Event ─────────────────────────────────────────────────────────
// Immutable value. Type + data. Frozen on construction.
// §5.6 structural self-similarity: every layer speaks Event.

class Event {
  constructor(type, data = {}) {
    this.type = type;
    this.data = data;
    Object.freeze(this);
  }
}

module.exports = { Event };
