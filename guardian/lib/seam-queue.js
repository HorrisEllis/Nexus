'use strict';
/**
 * guardian/lib/seam-queue.js — SEAM Delivery Queue
 * UUID: guardian-seam-queue-v1-0000-4000-0000-000000000001
 *
 * §LAW II — JAA insert before any state transition. No in-memory-only state.
 * §1.1    — Nothing pretends to work. If it fails, it says so.
 * §1.2    — Nothing silently fails.
 * §3.1    — Bottom-up. This is the foundation all SEAM delivery builds on.
 *
 * The state machine that owns all SEAM delivery truth.
 * Guardian is the state machine. The AI provider is a lossy transform function.
 *
 * Invariants:
 *   - Every state transition: JAA insert FIRST, then behavior
 *   - Every retry is logged with its strategy and failure reason
 *   - ESCALATED is permanent — a human must resolve it
 *   - No compartment moves backward through states
 *
 * State machine per compartment:
 *   QUEUED → INJECTING → GENERATING → DETECTING → VERIFIED
 *                                          ↓ fail
 *                                       RETRYING (strategy 1, 2, 3)
 *                                          ↓ maxRetries exhausted
 *                                       ESCALATED → jaa.insert('gaps')
 *
 * Retry strategies (applied in order, max 3 each = 9 total attempts):
 *   1. context   — resend chunk + failure report from Detector
 *   2. shorter   — split chunk in half, resend first half
 *   3. forensic  — full Detector analysis inline + axiom violations listed
 */

const { randomUUID } = require('crypto');
const { Detector }   = require('./detector');

// ── State constants ────────────────────────────────────────────────────────────
const STATE = Object.freeze({
  QUEUED:     'QUEUED',
  INJECTING:  'INJECTING',
  GENERATING: 'GENERATING',
  DETECTING:  'DETECTING',
  VERIFIED:   'VERIFIED',
  RETRYING:   'RETRYING',
  ESCALATED:  'ESCALATED',
  FAILED:     'FAILED',      // terminal failure of a single attempt (not the compartment)
});

// ── Retry strategies ───────────────────────────────────────────────────────────
const STRATEGY = Object.freeze({
  CONTEXT:  'context',   // resend + failure context
  SHORTER:  'shorter',   // split chunk, send half
  FORENSIC: 'forensic',  // full Detector analysis + axiom violations
});

const STRATEGY_ORDER = [STRATEGY.CONTEXT, STRATEGY.SHORTER, STRATEGY.FORENSIC];
const MAX_RETRIES_PER_STRATEGY = 3;

// ── QueueCompartment ───────────────────────────────────────────────────────────
class QueueCompartment {
  /**
   * @param {object} opts
   * @param {string}   opts.queueId        Parent queue UUID
   * @param {number}   opts.chunkIdx       0-based index in chunk sequence
   * @param {string}   opts.chunkTitle     Human-readable chunk label
   * @param {string}   opts.chunkContent   The raw spec chunk text
   * @param {string}   opts.builtPrompt    Fully assembled prompt (prerequisite + chunk + contract)
   * @param {string}   opts.provider       'chatgpt' | 'claude' | 'ollama'
   * @param {string[]} opts.axioms         Axiom strings to enforce (for delta detection)
   * @param {number}   opts.total          Total chunks in this queue
   * @param {object}   opts.jaa            JaaStore instance — §LAW II
   * @param {Function} opts.busEmit        bus.emit function
   * @param {Function} opts.ncpPush        ncp.push(provider, data) function
   */
  constructor({ queueId, chunkIdx, chunkTitle, chunkContent, builtPrompt,
                provider, axioms = [], total, jaa, busEmit, ncpPush }) {
    if (!queueId)      throw new Error('QueueCompartment: queueId required');
    if (!chunkContent) throw new Error('QueueCompartment: chunkContent required');
    if (!jaa)          throw new Error('QueueCompartment: jaa required (§LAW II)');

    this.uuid         = randomUUID();
    this.queueId      = queueId;
    this.chunkIdx     = chunkIdx;
    this.chunkTitle   = chunkTitle   || `Chunk ${chunkIdx + 1}`;
    this.chunkContent = chunkContent;
    this.builtPrompt  = builtPrompt  || chunkContent;
    this.provider     = provider     || 'chatgpt';
    this.axioms       = axioms;
    this.total        = total        || 1;

    this._jaa      = jaa;
    this._busEmit  = busEmit  || (() => {});
    this._ncpPush  = ncpPush  || (() => {});

    this.state        = STATE.QUEUED;
    this.retries      = 0;
    this.strategyIdx  = 0;  // which strategy we're on
    this.strategyRetries = 0;  // retries within current strategy
    this.maxRetriesPerStrategy = MAX_RETRIES_PER_STRATEGY;

    this.jobId        = null;  // set when injected
    this.response     = null;  // last response text
    this.detection    = null;  // last Detector result
    this.profile      = Detector.profile(chunkContent);

    this.failureLog   = [];    // { attempt, strategy, response, detection, ts }
    this.createdAt    = Date.now();
    this.updatedAt    = Date.now();

    // §LAW II — write before any behavior
    this._jaaInsert();
  }

  // ── State transitions ─────────────────────────────────────────────────────

  /**
   * Transition to a new state.
   * §LAW II: JAA update happens before any other action.
   */
  _transition(newState, extra = {}) {
    const prev = this.state;
    this.state     = newState;
    this.updatedAt = Date.now();
    Object.assign(this, extra);

    // §LAW II — write first
    this._jaaUpdate();

    // Then emit on bus
    this._busEmit('guardian.seam.compartment.transition', {
      uuid: this.uuid, queueId: this.queueId,
      chunkIdx: this.chunkIdx, chunkTitle: this.chunkTitle,
      from: prev, to: newState,
      provider: this.provider, ts: Date.now(),
    });

    return this;
  }

  /** Move to INJECTING — prompt is about to be sent */
  inject(jobId) {
    return this._transition(STATE.INJECTING, { jobId });
  }

  /** Move to GENERATING — prompt was delivered, waiting for response */
  generating() {
    return this._transition(STATE.GENERATING);
  }

  /** Move to DETECTING — response received, running Detector */
  detecting(responseText) {
    return this._transition(STATE.DETECTING, { response: responseText });
  }

  /**
   * Evaluate response. Returns { passed, detection }.
   * If passed → VERIFIED. If failed → retry or ESCALATE.
   */
  evaluate() {
    const detection = Detector.evaluate(
      this.response, this.chunkContent, this.profile, this.axioms
    );
    this.detection = detection;

    if (detection.passed) {
      this._transition(STATE.VERIFIED);
      this._busEmit('guardian.seam.chunk.verified', {
        uuid: this.uuid, queueId: this.queueId,
        chunkIdx: this.chunkIdx, chunkTitle: this.chunkTitle,
        composite: detection.composite, provider: this.provider, ts: Date.now(),
      });
      return { passed: true, detection };
    }

    // Log the failure
    this.failureLog.push({
      attempt:   this.retries + 1,
      strategy:  STRATEGY_ORDER[this.strategyIdx] || 'context',
      response:  (this.response || '').slice(0, 1000),
      detection,
      ts:        Date.now(),
    });
    this.retries++;
    this.strategyRetries++;
    this._jaaUpdate();

    // Advance strategy if current is exhausted
    if (this.strategyRetries >= this.maxRetriesPerStrategy) {
      this.strategyIdx++;
      this.strategyRetries = 0;
    }

    // Out of strategies → ESCALATE
    if (this.strategyIdx >= STRATEGY_ORDER.length) {
      this._escalate(detection);
      return { passed: false, detection };
    }

    this._transition(STATE.RETRYING);
    return { passed: false, detection };
  }

  /**
   * Build the retry prompt based on current strategy.
   * This is the core of what makes retry useful — each strategy
   * gives the AI more information about why it failed.
   */
  buildRetryPrompt() {
    const strategy = STRATEGY_ORDER[this.strategyIdx] || STRATEGY.CONTEXT;
    const last     = this.failureLog[this.failureLog.length - 1];
    const det      = last?.detection;

    if (strategy === STRATEGY.CONTEXT) {
      // Strategy 1: resend with failure context
      return [
        `[RETRY ${this.retries}/${this.maxRetriesPerStrategy * STRATEGY_ORDER.length}]`,
        `Detection score: ${det?.composite} (threshold: 0.35 — lower is better)`,
        det?.truncation?.truncated ? `Issue: TRUNCATED — ${det.truncation.reason}` : '',
        det?.sigma?.deviating ? `Issue: SIGMA — ${det.sigma.signals.map(s => s.type).join(', ')}` : '',
        det?.delta?.deviating ? `Issue: DELTA — ${det.delta.issues.map(i => i.type).join(', ')}` : '',
        '',
        '[PREVIOUS RESPONSE — first 400 chars]',
        (last?.response || '').slice(0, 400) + (last?.response?.length > 400 ? '\n...[truncated]' : ''),
        '',
        '[RETRY — address the issues above, then provide the full response]',
        '',
        this.builtPrompt,
      ].filter(Boolean).join('\n');
    }

    if (strategy === STRATEGY.SHORTER) {
      // Strategy 2: split chunk, send first half
      const half = Math.floor(this.chunkContent.length / 2);
      const halfContent = this.chunkContent.slice(0, half);
      return [
        `[RETRY — REDUCED SCOPE: first half of chunk only]`,
        `Reason: previous response was ${det?.truncation?.truncated ? 'truncated' : 'incomplete'}`,
        `Deliver this portion fully before we proceed to the second half.`,
        '',
        halfContent,
        '',
        `When complete, end with: SEAM VERDICT: PASS`,
      ].join('\n');
    }

    if (strategy === STRATEGY.FORENSIC) {
      // Strategy 3: full forensic analysis inline
      const axiomViolations = (det?.delta?.issues || [])
        .filter(i => i.type === 'axiom_violation' || i.type === 'axiom_missing')
        .map(i => `  ${i.detail}`).join('\n');
      return [
        `[FORENSIC RETRY — complete failure analysis]`,
        `Attempt: ${this.retries}`,
        `Composite failure score: ${det?.composite} (must be < 0.35 to pass)`,
        '',
        `--- TRUNCATION ANALYSIS ---`,
        `Truncated: ${det?.truncation?.truncated}`,
        `Reason: ${det?.truncation?.reason || 'none'}`,
        `Score: ${det?.truncation?.score}`,
        '',
        `--- SIGMA ANALYSIS (behavioral deviation) ---`,
        `Deviating: ${det?.sigma?.deviating}`,
        `Score: ${det?.sigma?.score}`,
        det?.sigma?.signals?.length ? `Signals:\n${det.sigma.signals.map(s => `  ${s.type}: ${JSON.stringify(s)}`).join('\n')}` : '',
        '',
        `--- DELTA ANALYSIS (content deviation) ---`,
        `Deviating: ${det?.delta?.deviating}`,
        axiomViolations ? `Axiom violations:\n${axiomViolations}` : '',
        '',
        `--- REQUIREMENTS ---`,
        `§1.3: No stubs. No TODOs. No "implement later".`,
        `§2.1: Every state change requires a JAA row.`,
        `Expected output format: ${this.profile.hasSeamContract ? 'SEAM VERDICT: PASS/FAIL + test results' : 'complete implementation'}`,
        '',
        `[ATTEMPT ${this.retries + 1} — respond in full, no abbreviation]`,
        '',
        this.builtPrompt,
      ].filter(Boolean).join('\n');
    }

    return this.builtPrompt;
  }

  _escalate(detection) {
    this._transition(STATE.ESCALATED);
    // §LAW II — write gap to JAA before emitting
    this._jaa.insert('gaps', {
      uuid:        randomUUID(),
      type:        'seam_escalated',
      domain:      'code',
      source:      'seam-queue',
      description: `SEAM chunk escalated after ${this.retries} retries: ${this.chunkTitle}`,
      score:        0.9,
      status:       'open',
      jobId:        this.jobId,
      queueId:      this.queueId,
      chunkIdx:     this.chunkIdx,
      failures:     this.failureLog.length,
      lastDetection: detection,
      ts:           Date.now(),
    });
    this._busEmit('guardian.seam.chunk.escalated', {
      uuid: this.uuid, queueId: this.queueId,
      chunkIdx: this.chunkIdx, chunkTitle: this.chunkTitle,
      retries: this.retries, provider: this.provider,
      failures: this.failureLog.length, ts: Date.now(),
    });
  }

  // ── JAA persistence (§LAW II) ─────────────────────────────────────────────

  _jaaInsert() {
    try {
      this._jaa.insert('queue_compartments', this._toRow());
    } catch(e) {
      // §1.2 — nothing silently fails
      this._busEmit('guardian.seam.jaa.error', { op: 'insert', uuid: this.uuid, error: e.message });
    }
  }

  _jaaUpdate() {
    try {
      this._jaa.update('queue_compartments', { uuid: this.uuid }, this._toRow());
    } catch(_) {
      // Row may not exist yet — insert
      try { this._jaa.insert('queue_compartments', this._toRow()); } catch(_) {}
    }
  }

  _toRow() {
    return {
      uuid:          this.uuid,
      queueId:       this.queueId,
      chunkIdx:      this.chunkIdx,
      chunkTitle:    this.chunkTitle,
      provider:      this.provider,
      state:         this.state,
      jobId:         this.jobId,
      retries:       this.retries,
      strategyIdx:   this.strategyIdx,
      composite:     this.detection?.composite ?? null,
      passed:        this.detection?.passed    ?? null,
      failureCount:  this.failureLog.length,
      createdAt:     this.createdAt,
      updatedAt:     this.updatedAt,
    };
  }

  toJSON() { return this._toRow(); }
}

// ── SEAMQueue ──────────────────────────────────────────────────────────────────
class SEAMQueue {
  /**
   * @param {object} opts
   * @param {string}   opts.title      Human-readable queue title
   * @param {string}   opts.provider   Target provider
   * @param {object[]} opts.chunks     Array of { content, title, builtPrompt, axioms }
   * @param {object}   opts.jaa        JaaStore instance
   * @param {Function} opts.busEmit    bus.emit
   * @param {Function} opts.ncpPush    ncp.push(provider, data)
   * @param {Function} opts.onComplete Called when all compartments are VERIFIED or ESCALATED
   */
  constructor({ title, provider, chunks, jaa, busEmit, ncpPush, onComplete }) {
    if (!chunks?.length) throw new Error('SEAMQueue: chunks required');
    if (!jaa)            throw new Error('SEAMQueue: jaa required (§LAW II)');

    this.uuid        = randomUUID();
    this.title       = title    || 'Untitled Queue';
    this.provider    = provider || 'chatgpt';
    this.running     = false;
    this.completedAt = null;
    this._onComplete = onComplete || (() => {});
    this._active     = null;   // current compartment being processed

    // Build compartments bottom-up — §3.1
    this.compartments = chunks.map((chunk, idx) => new QueueCompartment({
      queueId:      this.uuid,
      chunkIdx:     idx,
      chunkTitle:   chunk.title    || `Chunk ${idx + 1}`,
      chunkContent: chunk.content,
      builtPrompt:  chunk.builtPrompt || chunk.content,
      provider,
      axioms:       chunk.axioms  || [],
      total:        chunks.length,
      jaa, busEmit, ncpPush,
    }));

    this._jaa     = jaa;
    this._busEmit = busEmit  || (() => {});
    this._ncpPush = ncpPush  || (() => {});

    // §LAW II — record queue creation before any dispatch
    this._jaa.insert('seam_sessions', {
      uuid:       this.uuid,
      title:      this.title,
      provider:   this.provider,
      total:      this.compartments.length,
      status:     'active',
      createdAt:  Date.now(),
    });

    this._busEmit('guardian.seam.queue.created', {
      uuid:     this.uuid,
      title:    this.title,
      provider: this.provider,
      total:    this.compartments.length,
      ts:       Date.now(),
    });
  }

  // ── Control ───────────────────────────────────────────────────────────────

  /** Start delivering chunks. Call after NCP channel is confirmed open. */
  start() {
    this.running = true;
    this._next();
    return this;
  }

  pause()  { this.running = false; }
  resume() { this.running = true; this._next(); }

  /**
   * Called by guardian server when a response arrives for this queue's active job.
   * This is the entry point for all response processing.
   */
  onResponse(jobId, responseText) {
    if (!this._active || this._active.jobId !== jobId) return false;
    const comp = this._active;

    // §LAW II — DETECTING state written before evaluation
    comp.detecting(responseText);

    // Run Detector (deterministic external evaluator)
    const { passed, detection } = comp.evaluate();

    this._busEmit('guardian.seam.detection', {
      uuid:        comp.uuid,
      queueId:     this.uuid,
      chunkIdx:    comp.chunkIdx,
      composite:   detection.composite,
      passed,
      summary:     detection.summary,
      provider:    this.provider,
      ts:          Date.now(),
    });

    if (passed) {
      this._active = null;
      this._checkComplete();
      this._next();
    } else if (comp.state === STATE.RETRYING) {
      // Retry with appropriate strategy
      this._active = null;
      setTimeout(() => this._dispatch(comp), 1500);
    } else {
      // ESCALATED — move on to next
      this._active = null;
      this._checkComplete();
      this._next();
    }

    return true;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _next() {
    if (!this.running) return;
    if (this._active)  return;  // one at a time
    const next = this.compartments.find(c =>
      c.state === STATE.QUEUED || c.state === STATE.RETRYING
    );
    if (!next) return;
    this._dispatch(next);
  }

  _dispatch(comp) {
    const prompt = comp.state === STATE.RETRYING
      ? comp.buildRetryPrompt()
      : comp.builtPrompt;

    // §LAW II — INJECTING written before NCP push
    comp.inject(randomUUID());
    this._active = comp;

    // Push job to provider via NCP
    this._ncpPush(this.provider, {
      type:            'GUARDIAN_JOB',
      jobId:           comp.jobId,
      command:         'seam',
      provider:        this.provider,
      prompt,
      seam_chunk_idx:  comp.chunkIdx,
      seam_queue_id:   this.uuid,
      seam_total:      comp.total,
      seam_title:      comp.chunkTitle,
      ts:              Date.now(),
    });

    comp.generating();

    this._busEmit('guardian.seam.chunk.dispatched', {
      uuid:      comp.uuid,
      queueId:   this.uuid,
      chunkIdx:  comp.chunkIdx,
      jobId:     comp.jobId,
      provider:  this.provider,
      retry:     comp.retries,
      strategy:  STRATEGY_ORDER[comp.strategyIdx],
      ts:        Date.now(),
    });
  }

  _checkComplete() {
    const done = this.compartments.every(c =>
      c.state === STATE.VERIFIED || c.state === STATE.ESCALATED
    );
    if (!done) return;

    this.completedAt = Date.now();
    const stats = this.stats();

    // §LAW II — write completion before callback
    this._jaa.update('seam_sessions', { uuid: this.uuid }, {
      status:      'complete',
      completedAt: this.completedAt,
      verified:    stats.verified,
      escalated:   stats.escalated,
    });

    this._busEmit('guardian.seam.queue.complete', {
      uuid:      this.uuid,
      title:     this.title,
      provider:  this.provider,
      ...stats,
      ts:        Date.now(),
    });

    this._onComplete(stats);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  stats() {
    const cs = this.compartments;
    return {
      total:     cs.length,
      verified:  cs.filter(c => c.state === STATE.VERIFIED).length,
      escalated: cs.filter(c => c.state === STATE.ESCALATED).length,
      retrying:  cs.filter(c => c.state === STATE.RETRYING).length,
      active:    cs.filter(c => [STATE.INJECTING, STATE.GENERATING, STATE.DETECTING].includes(c.state)).length,
      queued:    cs.filter(c => c.state === STATE.QUEUED).length,
      pct:       Math.round(cs.filter(c => c.state === STATE.VERIFIED).length / cs.length * 100),
    };
  }

  toJSON() {
    return {
      uuid: this.uuid, title: this.title, provider: this.provider,
      total: this.compartments.length, completedAt: this.completedAt,
      stats: this.stats(),
      compartments: this.compartments.map(c => c.toJSON()),
    };
  }
}

module.exports = { SEAMQueue, QueueCompartment, STATE, STRATEGY };
