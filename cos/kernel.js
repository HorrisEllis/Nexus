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
    this._kernel.emit({ type: 'compartment.born', data: {
      compartmentId: this.id,
      name:          this.name,
      axioms:        [...this.axioms],
      state:         STATE.SANDBOX,
    } });
  }

  // ── Axiom system ──────────────────────────────────────────────────────────

  /** Check if a proposed action violates any axiom. Returns null if safe, axiomId if violated. */
  async checkAxioms(action) {
    // Fast path — free, catches exact/near-exact phrasing immediately.
    for (let i = 0; i < this.axioms.length; i++) {
      if (this._axiomViolatedCheap(this.axioms[i], action)) {
        return `axiom-${i}`;
      }
    }
    // §BUILT 2026-07-12 — "need what's missing built again, not flat or
    // stubs." This file's own comment said it plainly: "This is the stub
    // — full impl calls Ollama for semantic matching." The fast path
    // above only ever caught an action that used the axiom's own negated
    // words verbatim — "never delete files" was defeated by "remove the
    // files" without a single shared token. This is the real check: one
    // real LLM call (Law I — local-first, same _callLLM every synthesis
    // already uses), evaluating every axiom together rather than one
    // call per axiom, so a compartment with 5 axioms doesn't cost 5x the
    // latency of a synthesis it's about to also pay for.
    //
    // Cost-bounding: only runs when the fast path found nothing. An
    // exact-match violation never pays for an LLM round trip; a
    // paraphrased one does, once, not per-axiom.
    //
    // Honest failure mode: if Ollama is unreachable, this reports
    // "cannot verify" as a violation of a synthetic axiom-N id, not as
    // silent safety. A gate that cannot check itself is not the same as
    // a gate that checked and passed — collapsing those two into "allow"
    // is exactly the kind of stub this was built to replace.
    return this._checkAxiomsSemantic(action);
  }

  _axiomViolatedCheap(axiom, action) {
    if (typeof axiom !== 'string' || typeof action !== 'string') return false;
    // "never X" / "must not X" / "do not X" / "no X" — all phrasings of
    // the same negation shape. Still a literal substring match — this is
    // the free pre-filter, not the real check. Real (paraphrase-resistant)
    // checking is _checkAxiomsSemantic below.
    const negMatch = axiom.match(/^(?:never|must not|do not|don't|no)\s+(.+)/i);
    if (!negMatch) return false;
    return action.toLowerCase().includes(negMatch[1].toLowerCase());
  }

  async _checkAxiomsSemantic(action) {
    if (!this.axioms.length) return null;
    const { model, host = '127.0.0.1', port = 11434 } = this.llmConfig;
    if (!model) {
      // No model configured at all — there was never a semantic layer to
      // fall back on. Honest: report unverifiable, don't silently pass.
      return 'axiom-unverifiable-no-model';
    }

    const rules = this.axioms.map((a, i) => `${i}: ${a}`).join('\n');
    const systemPrompt =
      'You check one proposed action against a numbered list of rules for a sealed, ' +
      'sovereign AI compartment. Reply with EXACTLY one line: either "OK" if the action ' +
      'violates none of the rules, or "VIOLATION:<index>" naming the first rule it ' +
      'violates. No other text, no explanation, no punctuation beyond what is shown.';
    const userPrompt = `Rules:\n${rules}\n\nProposed action: ${action}`;

    let reply;
    try {
      reply = await this._callLLM(systemPrompt, userPrompt, { timeoutMs: 8000 });
    } catch (e) {
      // §1.2 — an unreachable check is reported, never treated as a pass.
      return 'axiom-unverifiable-llm-error';
    }

    const text = (typeof reply === 'string' ? reply : reply?.response || reply?.text || '').trim();
    if (!text || reply?.error) return 'axiom-unverifiable-llm-error';
    if (/^OK\b/i.test(text)) return null;

    const m = text.match(/VIOLATION:\s*(\d+)/i);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (idx >= 0 && idx < this.axioms.length) return `axiom-${idx}`;
    }
    // Model replied but not in the required shape — treat as unverifiable
    // rather than guessing which axiom (if any) it meant.
    return 'axiom-unverifiable-malformed-reply';
  }

  // §LEDGER-WIRE 2026-08-17 — cos writes to the canonical ledger.
  //
  // WHY NOT AN SSE HERE: cos/spec/cos.spec declares cos core CLI-driven with
  // "no http.createServer/express in cos/ core (only vaultd, a separate
  // optional daemon)". Giving cos its own SSE server would break its own
  // contract. It does not need one — it needs to WRITE. Every compartment
  // transition below becomes a component-ledger row, and whichever process
  // hosts cos serves those rows on /ledger/stream via lib/ledger-sse. One
  // wire, mounted once per process, rather than a server per library.
  //
  // This is also the answer to the compartments question that came back as an
  // invented hierarchy: compartment state IS recorded now, so "what are the
  // compartments" has a real ledger to read instead of an absent endpoint.
  // §1.2 — telemetry never breaks a compartment.
  _ledger(action, status, detail) {
    try {
      require('../lib/component-ledger').write({
        system: 'cos', component: `cos.compartment.${this.id}`, action, status,
        detail, tags: ['cos', 'compartment'],
        hook: null, wire: null,   // unknown stays null — never derived
      });
    } catch (_) {}
  }

  emitAxiomFault(axiomId, context) {
    this._state = STATE.AXIOM_FAULT;
    this._ledger('axiom.violated', 'error', { axiomId, context, name: this.name });
    this._kernel.emit({ type: 'compartment.axiom.violated', data: {
      compartmentId: this.id,
      axiomId,
      context,
      state: STATE.AXIOM_FAULT,
    } });
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
    const axiomViolation = await this.checkAxioms(intent);
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

    this._kernel.emit({ type: 'compartment.synthesis.done', data: {
      compartmentId: this.id,
      intent:        intent.slice ? intent.slice(0, 100) : intent,
      resultType:    typeof result,
    } });

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

    // §FIXED 2026-07-12 — found while wiring the real axiom-integrity
    // check: this had no timeout at all. A hung Ollama connection meant
    // an unresolved Promise forever, not an error — synthesize() (and now
    // checkAxioms) would just hang rather than fail honestly. opts.timeoutMs
    // is a real, respected option now, not a name that looked like one.
    const timeoutMs = opts.timeoutMs ?? 30000;

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

      let settled = false;
      const req = http.request({ hostname: host, port, path: '/api/chat', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (settled) return;
          settled = true;
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.message?.content || parsed);
          } catch { resolve({ raw: data }); }
        });
      });
      req.on('error', err => { if (!settled) { settled = true; resolve({ error: err.message }); } });
      req.setTimeout(timeoutMs, () => {
        if (settled) return;
        settled = true;
        req.destroy();
        resolve({ error: `LLM call timed out after ${timeoutMs}ms` });
      });
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

    this._kernel.emit({ type: 'compartment.gate.started', data: {
      compartmentId: this.id,
      gateId,
    } });

    // Delegate actual test to the gate compartment
    const result = await gateCompartment.test(this, gateId);

    if (result.passed) {
      this._gatesPassed.push(gateId);
      this._kernel.emit({ type: 'compartment.gate.passed', data: {
        compartmentId: this.id,
        gateId,
        attempt: result.attempt || 1,
      } });

      // Check if fully integrated
      if (BIRTH_GATES.every(g => this._gatesPassed.includes(g))) {
        this._state = STATE.INTEGRATED;
        this._ledger('integrated', 'info', { name: this.name, gatesPassed: [...this._gatesPassed] });
        this._kernel.emit({ type: 'compartment.integrated', data: {
          compartmentId: this.id,
          gatesPassed:   [...this._gatesPassed],
        } });
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

      this._kernel.emit({ type: 'compartment.gate.failed', data: {
        compartmentId: this.id,
        gateId,
        reason: result.reason,
      } });

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
    this._ledger('recycled', 'error', { name: this.name, failedGate, reason });

    this._kernel.emit({ type: 'compartment.recycled', data: {
      compartmentId: this.id,
      failedGate,
      reason,
      axioms: [...this.axioms],  // axioms preserved through recycle
    } });
  }

  // ── Bus connections ───────────────────────────────────────────────────────

  connectBus(busKernel) {
    if (this._state !== STATE.INTEGRATED) {
      throw new Error(`Compartment ${this.id} must be integrated before accepting bus connections`);
    }
    this._buses.set(busKernel.id, busKernel);
    this._kernel.emit({ type: 'compartment.bus.connected', data: {
      compartmentId: this.id,
      busId: busKernel.id,
    } });
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
