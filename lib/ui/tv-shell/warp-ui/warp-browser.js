/**
 * ui/tv-shell/warp-ui/warp-browser.js
 * UUID: nexus-warp-browser-v1-0000-2026-0704-jamesbrooks-001
 *
 * Browser-compatible Warp core — Event, Gate, Stream, Axiom.
 * Transcribed from warp/core/* (pure JS, no deps) into a single browser
 * IIFE. Zero framework, zero bundler. Drop in a <script src=...> tag.
 *
 * Exposes: window.Warp = { Event, Gate, Stream, Axiom }
 *
 * The dispatch loop drives the TV-shell component tree:
 *   stream.emit(event) → Gates transform → Axioms verify → DOM updates
 *
 * Design rule: Warp gates only call routes declared in the system contract.
 * Any gate that would fetch an undeclared route is rejected by the
 * ContractOnlyAxiom before it touches the DOM.
 */
(function(global) {
'use strict';

// ── Event — immutable, uuid-stamped ─────────────────────────────────────────
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

class Event {
  constructor(type, data = {}) {
    this.type = type;
    this.data = Object.freeze({ ...data });
    this.uuid = uuidv4();
    this.ts   = Date.now();
    Object.freeze(this);
  }
}

// ── Gate — pure function, matches + transform ────────────────────────────────
class Gate {
  constructor({ signature, matches, transform, schema = null }) {
    this.signature = signature;
    this.schema    = schema;
    this._matches  = matches;
    this._transform = transform;
  }

  matches(event)     { return this._matches(event); }
  transform(event)   { return this._transform(event); }

  validateSchema(result) {
    if (!this.schema || !this.schema.requiredKeys) return true;
    for (const key of this.schema.requiredKeys) {
      if (!(key in result)) return false;
      if (this.schema.types && this.schema.types[key]) {
        if (typeof result[key] !== this.schema.types[key]) return false;
      }
    }
    return true;
  }
}

// ── Axiom — hard check, never silent ────────────────────────────────────────
class Axiom {
  constructor({ id, version = '1.0', severity = 'hard', check, description = '' }) {
    this.id          = id;
    this.version     = version;
    this.severity    = severity;
    this.description = description;
    this._check      = check;
  }

  check(event, gate, streamState) {
    return this._check(event, gate, streamState);
  }
}

// ── Stream — dispatch loop ───────────────────────────────────────────────────
class Stream {
  constructor(name = 'nexus-warp') {
    this.name   = name;
    this._gates = [];
    this._axioms = [];
    this._log   = [];
    this._hooks = {};
    this._state = {};
  }

  register(gate) { this._gates.push(gate); return this; }
  addAxiom(axiom) { this._axioms.push(axiom); return this; }
  hook(kind, plugin) { this._hooks[kind] = plugin; return this; }

  emit(event) {
    const matching = this._gates.filter(g => g.matches(event));
    const results  = [];

    for (const gate of matching) {
      // Run axioms before transform
      let blocked = false;
      for (const axiom of this._axioms) {
        const pass = axiom.check(event, gate, this._state);
        this._log.push({ ts: Date.now(), axiomId: axiom.id, pass, eventType: event.type, gate: gate.signature });
        if (!pass && axiom.severity === 'hard') {
          console.warn(`[Warp/Axiom] HARD violation: ${axiom.id} blocked gate ${gate.signature} on ${event.type}`);
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // Transform
      let output;
      try {
        output = gate.transform(event);
      } catch(e) {
        console.error(`[Warp/Gate] ${gate.signature} threw:`, e.message);
        continue;
      }

      // Output can be Event[] or a single Event or null
      const produced = Array.isArray(output) ? output : (output ? [output] : []);
      for (const ev of produced) {
        results.push(ev);
        // Recurse for downstream gates
        this.emit(ev);
      }
    }

    this._log.push({ ts: Date.now(), type: event.type, uuid: event.uuid, gatesHit: matching.length });
    if (this._log.length > 500) this._log.shift();
    return results;
  }

  getLog(n = 20) { return this._log.slice(-n); }
  setState(k, v) { this._state[k] = v; }
  getState(k)    { return this._state[k]; }
}

// ── Export ───────────────────────────────────────────────────────────────────
global.Warp = { Event, Gate, Axiom, Stream };

})(typeof window !== 'undefined' ? window : globalThis);
