/**
 * §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports Stream from
 * warp/core/Stream.js instead of this file. Nothing in the tree requires
 * this file anymore (checked). Left in place, not deleted, per this
 * codebase's own §7.4 (nothing discarded) — but it is dead code. See
 * cos/siso/index.js's header for why the switch happened and what, if
 * anything, warp/core/Stream.js had to gain to replace it.
 */
/**
 * siso/Stream.js
 * COMPARTMENT OS — SISO Core: Stream
 *
 * Ported from SISO Core v1.0.0 (ES module → CJS).
 * Spec: Jonathan Bailey, SISO paper §2.1
 * Integration: James Brooks (Erosmancer)
 *
 * The processing loop.
 *
 * Gates register by signature. Events arrive via emit().
 * The stream looks up the event's type in the gate table — O(1).
 * If a gate claims it, transform runs immediately (depth-first).
 * If nothing claims it, the event lands in pending.
 *
 * COS extension over base SISO:
 *   - Ring buffer of last N events (for late-joining SSE clients,
 *     cos events tail, and the Nexus audit trail)
 *   - seq counter (monotonic, for since() queries)
 *   - Wildcard listeners (*) for onAny() fan-out (SSE, StreamLog)
 *     — these are OBSERVERS only, not gates. They do not transform.
 *   - SSE client broadcast hook
 *
 * The gate contract is preserved exactly:
 *   one signature → one gate, collision is a hard error.
 *
 * This is →E→E→
 */

'use strict';

const { DEFAULT_RING_CAP } = require('../foundation/constants.js');

class Stream {
  /**
   * @param {{ log?: StreamLog, parentStreamId?: number, ringCap?: number }} opts
   */
  constructor({ log = null, parentStreamId = null, ringCap = DEFAULT_RING_CAP } = {}) {
    this.gates          = new Map();    // signature → Gate
    this.pending        = [];           // unclaimed events
    this.eventCount     = 0;
    this.log            = log;
    this.streamId       = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;

    // COS extensions
    this._seq         = 0;
    this._ringCap     = ringCap;
    this._ring        = [];             // circular buffer of stamped events
    this._wildcards   = [];             // observer functions (not gates)
    this._sseClients  = new Set();      // SSE broadcast targets
  }

  // ── Gate Registration ─────────────────────────────────────────────────────

  /**
   * Register a gate. Signature must be unique.
   * Collision is a hard error — not a silent precedence bug.
   * @param {Gate} gate
   */
  register(gate) {
    if (this.gates.has(gate.signature)) {
      throw new Error(`Signature collision: '${gate.signature}'`);
    }
    this.gates.set(gate.signature, gate);
  }

  /**
   * Unregister a gate by signature. No-op if not found.
   * Used when compartments are destroyed and their gates deregistered.
   * @param {string} signature
   */
  deregister(signature) {
    this.gates.delete(signature);
  }

  // ── Emit ──────────────────────────────────────────────────────────────────

  /**
   * Emit an event into the stream.
   *
   * Stamps the event with seq + timestamp.
   * Dispatches depth-first to the gate that owns this type.
   * If no gate claims it → pending.
   * All emissions go to: ring buffer, StreamLog, wildcard observers, SSE.
   *
   * @param {Event} event
   * @returns {object} stamped event
   */
  emit(event) {
    this.eventCount++;
    const seq  = ++this._seq;
    const gate = this.gates.get(event.type);

    // Stamp for ring buffer + observers
    const stamped = {
      seq,
      type:      event.type,
      payload:   event.data,      // COS uses .payload externally, SISO uses .data internally
      timestamp: Date.now(),
    };

    // Ring buffer (COS extension)
    this._ring.push(stamped);
    if (this._ring.length > this._ringCap) this._ring.shift();

    // StreamLog (SISO audit trail)
    if (this.log) {
      this.log.record({
        streamId:       this.streamId,
        parentStreamId: this.parentStreamId,
        eventType:      event.type,
        gateClaimed:    gate ? gate.signature : null,
        eventData:      event.data,
      });
    }

    // Wildcard observers (COS extension — SSE, cos events stream)
    for (const fn of this._wildcards) {
      try { fn(stamped); } catch (_) {}
    }

    // SSE broadcast (COS extension)
    this._broadcastSSE(stamped);

    // Gate dispatch — depth-first, synchronous (SISO core contract)
    if (gate) {
      gate.transform(event, this);
    } else {
      this.pending.push(event);
    }

    return stamped;
  }

  // ── Observation ───────────────────────────────────────────────────────────

  /**
   * Not getResult. The flow is ongoing.
   * We choose to look now. What we read is a cross-section of →E→E→
   */
  sampleHere() {
    return {
      pending:    [...this.pending],
      eventCount: this.eventCount,
      gateCount:  this.gates.size,
    };
  }

  // ── COS Ring Buffer API ───────────────────────────────────────────────────

  /** Return last N stamped events from ring buffer. */
  tail(n = 50) {
    return this._ring.slice(-n);
  }

  /** Return all stamped events since a given seq number. */
  since(afterSeq) {
    return this._ring.filter(e => e.seq > afterSeq);
  }

  get seq() { return this._seq; }

  // ── COS Observer API (wildcard — not gates) ───────────────────────────────

  /**
   * Subscribe to ALL events as a read-only observer.
   * Does NOT transform. Does NOT register as a gate.
   * Used by: cos events stream, SSE relay, StreamLog integration.
   *
   * Returns an unsubscribe function.
   *
   * @param {function} fn  receives stamped event
   * @returns {function} unsubscribe
   */
  onAny(fn) {
    this._wildcards.push(fn);
    return () => {
      this._wildcards = this._wildcards.filter(f => f !== fn);
    };
  }

  /**
   * Subscribe to a specific event type as a read-only observer.
   * Does NOT register as a gate — does NOT block other listeners.
   * Used sparingly; prefer gates for transformation logic.
   *
   * Returns an unsubscribe function.
   *
   * @param {string} type
   * @param {function} fn  receives stamped event
   * @returns {function} unsubscribe
   */
  on(type, fn) {
    return this.onAny(stamped => {
      if (stamped.type === type) fn(stamped);
    });
  }

  // ── COS SSE API ───────────────────────────────────────────────────────────

  subscribeSSE(client) {
    this._sseClients.add(client);
    return () => this._sseClients.delete(client);
  }

  _broadcastSSE(stamped) {
    if (this._sseClients.size === 0) return;
    const data = `data: ${JSON.stringify(stamped)}\n\n`;
    for (const client of this._sseClients) {
      try { client.write(data); } catch (_) { this._sseClients.delete(client); }
    }
  }

  get sseClientCount() { return this._sseClients.size; }
}

module.exports = { Stream };
