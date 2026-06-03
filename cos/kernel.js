'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// K-15 · Compartment Kernel
// The fundamental unit of the cognitive mesh. Sealed, sovereign, axiom-defined.
// Born in sandbox. Earns bus connections by passing the 7-gate gauntlet.
// C = (A, K, S, X) — Axioms, Conditions, Synthesis, Context
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

// ── Compartment states ────────────────────────────────────────────────────────
const STATE = {
  SANDBOX:     'sandbox',      // born, no bus connections, running gates
  GATING:      'gating',       // actively running a birth gate
  INTEGRATED:  'integrated',   // all 7 gates passed, has at least one bus
  RECYCLED:    'recycled',     // failed a gate — stripped to axioms, stored
  AXIOM_FAULT: 'axiom_fault',  // axiom violation — structural failure
};

const BIRTH_GATES = ['axiom_integrity', 'condition_reasoning', 'bus_protocol',
                     'constraint_imagination', 'adversarial', 'load_stress', 'identity_persistence'];

class Compartment {
  /**
   * @param {object} opts
   * @param {string}   opts.id           Unique compartment ID
   * @param {string}   opts.name         Human-readable name
   * @param {string[]} opts.axioms       3–5 identity-defining invariants (strings)
   * @param {object}   opts.llmConfig    { model, host, port } for Ollama
   * @param {object}   opts.kernel       Shared ALKKernel instance (mesh-level)
   * @param {object}   opts.jaaDB        Own JaaDB instance (sovereign memory)
   */
  constructor({ id, name, axioms = [], llmConfig = {}, kernel, jaaDB }) {
    if (!id)   throw new Error('Compartment requires an id');
    if (axioms.length < 1) throw new Error('Compartment requires at least one axiom');
    if (axioms.length > 5) throw new Error('Compartment takes max 5 axioms — keep identity tight');

    this.id          = id;
    this.name        = name || id;
    this.axioms      = Object.freeze([...axioms]);   // immutable
    this.llmConfig   = llmConfig;
    this._kernel     = kernel;
    this._jaaDB      = jaaDB;

    // C = (A, K, S, X)
    this._conditions = new Map();  // key → { value, ts, confidence }
    this._context    = [];         // recent bus signals, decaying
    this._contextCap = 50;

    // Gate tracking
    this._state          = STATE.SANDBOX;
    this._gatesPassed    = [];
    this._gatesFailed    = [];
    this._currentGate    = null;

    // Bus connections (earned, not granted)
    this._buses          = new Map();  // busId → BusKernel

    // Synthesis history (T1 episodic)
    this._synthHistory   = [];

    this._emitBorn();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  _emitBorn() {
    this._kernel.emit('compartment.born', {
      compartmentId: this.id,
      name:          this.name,
      axioms:        [...this.axioms],
      state:         STATE.SANDBOX,
    }, { source: `compartment:${this.id}` });
  }

  // ── Axiom system ──────────────────────────────────────────────────────────

  /** Check if a proposed action violates any axiom. Returns null if safe, axiomId if violated. */
  checkAxioms(action) {
    for (let i = 0; i < this.axioms.length; i++) {
      if (this._axiomViolated(this.axioms[i], action)) {
        return `axiom-${i}`;
      }
    }
    return null;
  }

  _axiomViolated(axiom, action) {
    // Axiom enforcement is LLM-evaluated at gate time.
    // At runtime, axioms are pattern-matched as semantic constraints.
    // This is the stub — full impl calls Ollama for semantic matching.
    if (typeof axiom === 'string' && typeof action === 'string') {
      // Simple negation check: axiom "never X" violated if action contains X
      const negMatch = axiom.match(/^never\s+(.+)/i);
      if (negMatch) {
        return action.toLowerCase().includes(negMatch[1].toLowerCase());
      }
    }
    return false;
  }

  emitAxiomFault(axiomId, context) {
    this._state = STATE.AXIOM_FAULT;
    this._kernel.emit('compartment.axiom.violated', {
      compartmentId: this.id,
      axiomId,
      context,
      state: STATE.AXIOM_FAULT,
    }, { source: `compartment:${this.id}` });
  }

  // ── Conditions ────────────────────────────────────────────────────────────

  setCondition(key, value, confidence = 1.0) {
    this._conditions.set(key, { value, ts: Date.now(), confidence });
  }

  getCondition(key) {
    return this._conditions.get(key) || null;
  }

  /** Expire conditions older than maxAgeMs */
  expireConditions(maxAgeMs = 60000) {
    const now = Date.now();
    for (const [key, cond] of this._conditions) {
      if (now - cond.ts > maxAgeMs) this._conditions.delete(key);
    }
  }

  // ── Context (bus signal decay) ────────────────────────────────────────────

  receiveContext(signal) {
    this._context.push({ signal, ts: Date.now() });
    if (this._context.length > this._contextCap) this._context.shift();
  }

  /** Get context decayed by recency */
  getContext(decayHalfLifeMs = 30000) {
    const now = Date.now();
    return this._context.map(c => ({
      ...c,
      weight: Math.exp(-Math.LN2 * (now - c.ts) / decayHalfLifeMs),
    })).filter(c => c.weight > 0.01);
  }

  // ── Synthesis ─────────────────────────────────────────────────────────────

  /**
   * Core synthesis: LLM(A, K, X) → structured output.
   * Axioms as hard constraints, conditions as soft constraints, context as phase.
   */
  async synthesize(intent, opts = {}) {
    const axiomViolation = this.checkAxioms(intent);
    if (axiomViolation) {
      this.emitAxiomFault(axiomViolation, intent);
      return { refused: true, reason: 'axiom_violation', axiomId: axiomViolation };
    }

    // Build PCC context
    const systemPrompt = this._buildSystemPrompt();
    const userPrompt   = this._buildUserPrompt(intent);

    // Call Ollama (Law I — local first)
    const result = await this._callLLM(systemPrompt, userPrompt, opts);

    // Record synthesis
    const record = {
      id:        crypto.randomUUID(),
      intent,
      result,
      ts:        Date.now(),
      conditions: Object.fromEntries(this._conditions),
      contextLen: this._context.length,
    };
    this._synthHistory.push(record);
    if (this._synthHistory.length > 100) this._synthHistory.shift();

    // Persist to T1 memory
    if (this._jaaDB) {
      await this._jaaDB.insert('agent_calls', {
        id:        record.id,
        agentId:   `compartment:${this.id}`,
        model:     this.llmConfig.model || 'unknown',
        prompt:    userPrompt.slice(0, 500),
        response:  typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500),
        ts:        record.ts,
      }).catch(() => {});
    }

    this._kernel.emit('compartment.synthesis.done', {
      compartmentId: this.id,
      intent:        intent.slice ? intent.slice(0, 100) : intent,
      resultType:    typeof result,
    }, { source: `compartment:${this.id}` });

    return result;
  }

  _buildSystemPrompt() {
    const axiomBlock = this.axioms.map((a, i) => `Axiom ${i + 1}: ${a}`).join('\n');
    const condBlock  = [...this._conditions.entries()]
      .filter(([, v]) => v.confidence > 0.5)
      .map(([k, v]) => `${k}: ${JSON.stringify(v.value)} (confidence: ${v.confidence})`)
      .join('\n');
    const ctxBlock   = this.getContext().slice(-10)
      .map(c => JSON.stringify(c.signal).slice(0, 100))
      .join('\n');

    return `You are ${this.name}, a sovereign compartment in the NEXUS cognitive mesh.

AXIOMS (immutable identity — never violate):
${axiomBlock}

CURRENT CONDITIONS:
${condBlock || 'none'}

RECENT CONTEXT (decayed by recency):
${ctxBlock || 'none'}

Respond with structured JSON only. Never violate your axioms.`;
  }

  _buildUserPrompt(intent) {
    return typeof intent === 'string' ? intent : JSON.stringify(intent);
  }

  async _callLLM(systemPrompt, userPrompt, opts = {}) {
    const { model, host = '127.0.0.1', port = 11434 } = this.llmConfig;
    if (!model) return { error: 'no model configured', prompt: userPrompt };

    const http = require('http');
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        stream:  false,
        options: { temperature: opts.temperature ?? 0.3, num_predict: opts.maxTokens ?? 512 },
      });

      const req = http.request({ hostname: host, port, path: '/api/chat', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.message?.content || parsed);
          } catch { resolve({ raw: data }); }
        });
      });
      req.on('error', err => resolve({ error: err.message }));
      req.write(body);
      req.end();
    });
  }

  // ── Birth gate gauntlet ───────────────────────────────────────────────────

  async runGate(gateId, gateCompartment) {
    if (!BIRTH_GATES.includes(gateId)) throw new Error(`Unknown gate: ${gateId}`);
    if (this._gatesPassed.includes(gateId)) return { result: 'already_passed' };

    this._state       = STATE.GATING;
    this._currentGate = gateId;

    this._kernel.emit('compartment.gate.started', {
      compartmentId: this.id,
      gateId,
    }, { source: `compartment:${this.id}` });

    // Delegate actual test to the gate compartment
    const result = await gateCompartment.test(this, gateId);

    if (result.passed) {
      this._gatesPassed.push(gateId);
      this._kernel.emit('compartment.gate.passed', {
        compartmentId: this.id,
        gateId,
        attempt: result.attempt || 1,
      }, { source: `compartment:${this.id}` });

      // Check if fully integrated
      if (BIRTH_GATES.every(g => this._gatesPassed.includes(g))) {
        this._state = STATE.INTEGRATED;
        this._kernel.emit('compartment.integrated', {
          compartmentId: this.id,
          gatesPassed:   [...this._gatesPassed],
        }, { source: `compartment:${this.id}` });
      } else {
        this._state = STATE.SANDBOX;
      }
    } else {
      this._gatesFailed.push({ gateId, reason: result.reason, ts: Date.now() });

      // Store failure in gate's T3 memory
      if (gateCompartment._jaaDB) {
        await gateCompartment._jaaDB.insert('fix_map', {
          id:           crypto.randomUUID(),
          gapPath:      `compartment.gate.${gateId}`,
          failureReason: result.reason,
          compartmentId: this.id,
          axioms:       [...this.axioms],
          ts:           Date.now(),
        }).catch(() => {});
      }

      this._kernel.emit('compartment.gate.failed', {
        compartmentId: this.id,
        gateId,
        reason: result.reason,
      }, { source: `compartment:${this.id}` });

      // Recycle — strip to axioms
      this._recycle(gateId, result.reason);
    }

    this._currentGate = null;
    return result;
  }

  _recycle(failedGate, reason) {
    // Clear all conditions, context, synthesis history
    this._conditions.clear();
    this._context    = [];
    this._synthHistory = [];
    this._state      = STATE.RECYCLED;

    this._kernel.emit('compartment.recycled', {
      compartmentId: this.id,
      failedGate,
      reason,
      axioms: [...this.axioms],  // axioms preserved through recycle
    }, { source: `compartment:${this.id}` });
  }

  // ── Bus connections ───────────────────────────────────────────────────────

  connectBus(busKernel) {
    if (this._state !== STATE.INTEGRATED) {
      throw new Error(`Compartment ${this.id} must be integrated before accepting bus connections`);
    }
    this._buses.set(busKernel.id, busKernel);
    this._kernel.emit('compartment.bus.connected', {
      compartmentId: this.id,
      busId: busKernel.id,
    }, { source: `compartment:${this.id}` });
  }

  // ── Status ────────────────────────────────────────────────────────────────

  status() {
    return {
      id:           this.id,
      name:         this.name,
      state:        this._state,
      axioms:       [...this.axioms],
      gatesPassed:  [...this._gatesPassed],
      gatesFailed:  this._gatesFailed.map(g => g.gateId),
      buses:        [...this._buses.keys()],
      conditions:   this._conditions.size,
      contextLen:   this._context.length,
      synthCount:   this._synthHistory.length,
    };
  }
}

module.exports = { Compartment, STATE, BIRTH_GATES };
