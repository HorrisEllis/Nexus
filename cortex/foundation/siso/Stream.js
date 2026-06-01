'use strict';
// ── SISO Core · Stream ────────────────────────────────────────────────────────
// The event stream. Gates register by signature. Emit dispatches to matching gate.
// Unclaimed events accumulate in pending. Sub-streams share a parent StreamLog.
// Ported from SISO (Core) to CJS for Node.js runtime.

const { Event }     = require('./Event');
const { Gate }      = require('./Gate');
const { StreamLog } = require('./StreamLog');

class Stream {
  constructor({ log = null, parentStreamId = null } = {}) {
    this.gates          = new Map(); // signature → Gate
    this._pending       = [];
    this._log           = log;
    this._streamId      = log ? log.nextStreamId() : null;
    this._parentStreamId = parentStreamId;
  }

  // Register a gate by its signature. Collisions throw.
  register(gate) {
    if (!(gate instanceof Gate)) throw new Error('[Stream] register() requires a Gate instance');
    if (this.gates.has(gate.signature)) {
      throw new Error(`[Stream] Signature collision: '${gate.signature}'`);
    }
    this.gates.set(gate.signature, gate);
    return this;
  }

  // Emit an event. Claimed by matching gate or falls to pending.
  emit(event) {
    if (!(event instanceof Event)) throw new Error('[Stream] emit() requires an Event instance');

    const gate    = this.gates.get(event.type);
    const claimed = !!gate;

    this._log?.record({
      streamId:       this._streamId,
      parentStreamId: this._parentStreamId,
      eventType:      event.type,
      gateClaimed:    claimed,
      eventData:      event.data,
    });

    if (claimed) {
      gate.transform(event, this);
    } else {
      this._pending.push(event);
    }

    return claimed;
  }

  // Create a sub-stream that shares this stream's log.
  sub() {
    return new Stream({ log: this._log, parentStreamId: this._streamId });
  }

  // Observational snapshot — does not consume.
  sampleHere() {
    return {
      gates:   [...this.gates.keys()],
      pending: [...this._pending],
    };
  }

  // Drain pending — consume and clear.
  drainPending() {
    const drained  = this._pending.slice();
    this._pending  = [];
    return drained;
  }
}

module.exports = { Stream };
