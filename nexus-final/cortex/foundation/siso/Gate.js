'use strict';
// ── SISO Core · Gate ──────────────────────────────────────────────────────────
// A gate has a signature. When a stream emits an event whose type matches
// the signature, the gate's transform() is called. Claimed events do not
// enter the pending queue. Unclaimed events do.
// §5.8 composability: behaviour from composition of simple gates.

class Gate {
  constructor(signature) {
    if (!signature) throw new Error('[Gate] signature required');
    this.signature = signature;
  }

  // Override in subclasses. Return value is ignored.
  // Emit into stream by calling stream.emit(new Event(...))
  transform(event, stream) {}
}

module.exports = { Gate };
