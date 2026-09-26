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
const fs   = require('fs');
const path = require('path');
const { Detector }   = require('./detector');
const { MODE, deriveMode } = require('./mode-reducer');
const { parseCosSeams } = require('./cos-seam-parser');

// §BUILT 2026-09-06 — James: "the listener for ncp needs to find the
// seams. code block automatically download as artifacts." Real, checked
// gap: QueueCompartment below tracks no target filename or directory at
// all (unlike idearium/spec-engine's own chunk objects, which already
// know theirs) — nothing in this whole subsystem writes a file to disk
// anywhere (grepped for writeFileSync across lib/seam/ before building
// this, zero real hits). Staged to a real, clearly-labeled, dedicated
// location rather than guessing at "the compartment's real directory" —
// lib/compartment-engine.js does no filesystem work of its own to copy a
// convention from. Same "arrival ≠ acceptance" principle clear-glass's
// download-capture.js already established: this announces a real
// artifact exists; nothing here decides it's accepted into anything.
const SEAM_ARTIFACTS_DIR = path.join(__dirname, '../../data/guardian/seam-artifacts');

function _writeCosSeamArtifacts(seams, { queueId, chunkIdx, jobId, provider, busEmit }) {
  // §BUILT 2026-09-06 — James: "do it" (route through the real download
  // manager, not just a staging folder). lib/intake.js's real stage()
  // already does everything needed here — real dropId, real provenance,
  // guardian/server.js's own /api/intake handler resolves jobId/
  // raidQueueId against live job state for a download-triggered drop;
  // this is that same real, existing intake, called directly in-process
  // instead of round-tripping through a browser download event, since
  // guardian already has real filesystem access and comp.jobId already
  // IS the real job id this response came from — no correlation lookup
  // needed here at all, unlike download-capture.js's own real, harder
  // case (a download with no guaranteed jobId at all).
  const intake = require('../intake.js');
  for (const seam of seams) {
    const dir = path.join(SEAM_ARTIFACTS_DIR, seam.compartmentUuid || 'unfiled');
    const fileName = seam.fileName || `chunk-${seam.contractNumber ?? chunkIdx}.txt`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, seam.code, 'utf8');
      busEmit('guardian.seam.artifact.staged', {
        queueId, chunkIdx, filePath, fileName,
        compartmentUuid: seam.compartmentUuid, contractNumber: seam.contractNumber,
        language: seam.language, bytes: seam.code.length, ts: Date.now(),
      });
      const staged = intake.stage({
        source: filePath,
        provenance: { provider: provider || null, filename: fileName, jobId: jobId || null, downloadedAt: Date.now() },
      });
      if (staged.ok) {
        busEmit('guardian.seam.artifact.intake', { queueId, chunkIdx, filePath, dropId: staged.dropId, ts: Date.now() });
      } else {
        busEmit('guardian.seam.artifact.intake_failed', { queueId, chunkIdx, filePath, errors: staged.errors, ts: Date.now() });
      }
    } catch (e) {
      // §1.2 — a failed stage is stated, not swallowed. A seam detected
      // but never written is a code block that looked handled and wasn't.
      busEmit('guardian.seam.artifact.stage_failed', {
        queueId, chunkIdx, fileName, error: e.message, ts: Date.now(),
      });
    }
  }
}

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

// Watchdog-forced retries (dead connection / stalled response) are a separate
// counter from content-strategy retries above — no Detector verdict exists
// yet when the watchdog fires, so it can't consume a CONTEXT/SHORTER/FORENSIC
// slot. Capped independently so a provider that's actually dead escalates to
// a human instead of being retried forever. See guardian/lib/seam-watchdog.js.
const MAX_WATCHDOG_RETRIES = 3;

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

    // Watchdog-forced retries — see MAX_WATCHDOG_RETRIES above
    this.watchdogRetries    = 0;
    this.maxWatchdogRetries = MAX_WATCHDOG_RETRIES;
    this.stallReason        = null;  // last watchdog trip reason, for audit
    // Which kind of RETRYING this is — buildRetryPrompt() needs to know
    // before it picks a template. A watchdog/manual-retry trip has no
    // Detector verdict to report (nothing was evaluated — the connection
    // just died or stalled); a content-failure retry does. Conflating the
    // two produced "[RETRY 0/9] Detection score: undefined" prompts.
    this._lastRetryWasWatchdog = false;

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
    this._lastRetryWasWatchdog = false;  // this retry has a real Detector verdict behind it
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
    // Connectivity/stall retry — nothing was evaluated, there's no Detector
    // verdict, no previous-response excerpt to show. The strategy-based
    // templates below all assume a content failure happened; using them here
    // produces "[RETRY 0/9] Detection score: undefined" — true but useless.
    if (this._lastRetryWasWatchdog) {
      return [
        `[RETRY — connection interrupted, no response was received]`,
        `Reason: ${this.stallReason || 'unknown'}`,
        `This is not a content failure — nothing about any previous output was evaluated.`,
        `Resending the original request unchanged. Please respond in full.`,
        '',
        this.builtPrompt,
      ].join('\n');
    }

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

  /**
   * Force this compartment out of GENERATING when the provider connection
   * died or no response ever arrived. This is not a content failure — no
   * Detector verdict exists yet — so it does not touch the strategy/retries
   * counters above. It has its own cap (maxWatchdogRetries) so a provider
   * that's genuinely dead escalates to human review instead of looping.
   * Called by SEAMQueue#forceRetryActive — see that method and
   * guardian/lib/seam-watchdog.js for the two callers (manual + automatic).
   */
  watchdogRetry(reason) {
    this.watchdogRetries++;
    this.stallReason = reason || 'watchdog_timeout';

    if (this.watchdogRetries > this.maxWatchdogRetries) {
      this._escalate({
        composite:       null,
        watchdog:        true,
        reason:          this.stallReason,
        watchdogRetries: this.watchdogRetries,
      });
      return { escalated: true };
    }

    this._lastRetryWasWatchdog = true;
    this._transition(STATE.RETRYING, { stallReason: this.stallReason });
    return { escalated: false };
  }

  // ── Repair actions (NEXUS v3 §6.2 — Phase 71.4) ───────────────────────────
  // Distinct from watchdogRetry above: watchdogRetry is the system's OWN
  // automatic response to a stall it detected itself. The three methods below
  // are invoked from OUTSIDE the compartment's own lifecycle — by a human via
  // /seam/repair, or later by the Anomaly Engine (Phase 71.3) once it exists.
  // §1.1 — nothing pretends to work: every one of these writes a JAA row
  // marking the result as machine-forced, never indistinguishable from a real
  // Detector pass or a real provider response.

  /**
   * repair.inject — { type:"repair.inject", inject:"seam.end", seam_id:N }
   * Forces VERIFIED on a compartment whose real response is known-good
   * through some out-of-band channel (human confirms it, or a future Anomaly
   * Engine correlates it from logs) but never reached evaluate() — e.g. the
   * NCP/userscript bridge delivered the text but the GUARDIAN_COMPLETE
   * message that should have carried it back was lost.
   * This does NOT run the Detector — there is no real response to evaluate.
   * Use forceTransition() instead if you want VERIFIED without claiming a
   * verdict was reached at all.
   */
  injectEvent(eventType, payload = {}) {
    if (eventType !== 'seam.end') {
      return { ok: false, error: `injectEvent: unsupported event type "${eventType}" (only "seam.end" implemented)` };
    }
    if (this.state === STATE.VERIFIED) {
      return { ok: false, error: 'compartment already VERIFIED — nothing to inject' };
    }

    const prev = this.state;
    this.response  = payload.response || this.response || '[injected — no response text recorded]';
    this.detection = {
      passed: true, composite: null, injected: true,
      reason: payload.reason || 'repair.inject — seam.end forced',
    };

    this._transition(STATE.VERIFIED, { injectedRepair: true, injectedFrom: prev });

    this._busEmit('guardian.seam.chunk.verified', {
      uuid: this.uuid, queueId: this.queueId,
      chunkIdx: this.chunkIdx, chunkTitle: this.chunkTitle,
      composite: null, injected: true, injectedFrom: prev,
      provider: this.provider, ts: Date.now(),
    });

    return { ok: true, action: 'repair.inject', chunkIdx: this.chunkIdx, from: prev, to: STATE.VERIFIED };
  }

  /**
   * repair.transition — { type:"repair.transition", to:"<STATE>" }
   * Forces a direct state transition with no side effects beyond the
   * transition itself (no Detector run, no NCP push, no response assumed).
   * Refuses unknown target states rather than silently no-op'ing — §1.1.
   */
  forceTransition(to) {
    if (!Object.values(STATE).includes(to)) {
      return { ok: false, error: `forceTransition: "${to}" is not a known STATE` };
    }
    const prev = this.state;
    this._transition(to, { forcedRepair: true, forcedFrom: prev });
    this._busEmit('guardian.seam.repair.transition', {
      uuid: this.uuid, queueId: this.queueId, chunkIdx: this.chunkIdx,
      from: prev, to, ts: Date.now(),
    });
    return { ok: true, action: 'repair.transition', chunkIdx: this.chunkIdx, from: prev, to };
  }

  /**
   * repair.rollback — { type:"repair.rollback", to_event:"chunk.received.N" }
   * Spec's to_event addresses an event in the causal graph; this system has
   * no graph yet (that's Phase 71.1+), so the only rollback target that
   * means anything today is "this compartment's own beginning." Clears
   * retries/strategy/response/detection and returns it to QUEUED so _next()
   * picks it up fresh, as if it had never been dispatched.
   */
  rollback() {
    const prev = this.state;
    this.retries         = 0;
    this.strategyIdx      = 0;
    this.strategyRetries  = 0;
    this.watchdogRetries  = 0;
    this.stallReason      = null;
    this.response         = null;
    this.detection        = null;
    this.jobId            = null;
    this.failureLog       = [];

    this._transition(STATE.QUEUED, { rolledBack: true, rolledBackFrom: prev });
    this._busEmit('guardian.seam.repair.rollback', {
      uuid: this.uuid, queueId: this.queueId, chunkIdx: this.chunkIdx,
      from: prev, to: STATE.QUEUED, ts: Date.now(),
    });
    return { ok: true, action: 'repair.rollback', chunkIdx: this.chunkIdx, from: prev, to: STATE.QUEUED };
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
      watchdogRetries: this.watchdogRetries,
      stallReason:     this.stallReason,
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
      // §BUILT 2026-09-06 — see this file's own top-of-file comment for
      // the full reasoning. Only a genuinely ACCEPTED response's seams
      // get staged — a response still RETRYING or ESCALATED hasn't
      // passed Detector's own real quality check yet, and its code
      // (if any) may be exactly what's being rejected.
      const seams = parseCosSeams(responseText);
      if (seams.length) {
        _writeCosSeamArtifacts(seams, { queueId: this.uuid, chunkIdx: comp.chunkIdx, jobId: comp.jobId, provider: this.provider, busEmit: comp._busEmit });
      }
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

  /**
   * Force the currently active compartment out of a stuck or disconnected
   * state. Single entry point for both POST /seam/retry (manual, human-
   * triggered) and guardian/lib/seam-watchdog.js (automatic, timer-triggered)
   * — one signature, no duplicated retry logic between the two callers.
   * @param {string} [reason]
   * @returns {{ok:true, escalated:boolean, chunkUuid:string} | {ok:false, error:string}}
   */
  forceRetryActive(reason) {
    const comp = this._active;
    if (!comp) return { ok: false, error: 'no active compartment' };

    this._active = null;
    const { escalated } = comp.watchdogRetry(reason);

    this._busEmit('guardian.seam.watchdog.fired', {
      uuid:            comp.uuid,
      queueId:         this.uuid,
      chunkIdx:        comp.chunkIdx,
      chunkTitle:      comp.chunkTitle,
      provider:        comp.provider,
      reason:          reason || 'watchdog_timeout',
      escalated,
      watchdogRetries: comp.watchdogRetries,
      ts:              Date.now(),
    });

    if (escalated) this._checkComplete();   // queue may now be fully resolved
    setTimeout(() => this._next(), 100);    // either re-dispatch (RETRYING) or advance past it (ESCALATED)

    return { ok: true, escalated, chunkUuid: comp.uuid };
  }

  /**
   * repair(action) — single entry point for all four NEXUS v3 §6.2 repair
   * shapes (Phase 71.4). Compartment-scoped actions (inject/transition/
   * rollback) need a chunkIdx; system.reset is queue-scoped and has none.
   * Same pattern as forceRetryActive above: one signature, callable from
   * POST /seam/repair (human) or, once it exists, the Anomaly Engine (71.3) —
   * no duplicated dispatch logic between the two callers.
   *
   * @param {object} action
   * @param {"repair.inject"|"repair.transition"|"repair.rollback"|"system.reset"} action.type
   * @param {number} [action.chunkIdx]  required for all but system.reset
   * @param {string} [action.inject]    repair.inject — event name, e.g. "seam.end"
   * @param {string} [action.to]        repair.transition — target STATE
   * @param {object} [action.payload]   repair.inject — optional response text/reason
   */
  repair(action = {}) {
    const { type, chunkIdx, inject, to, payload } = action;

    if (type === 'system.reset') {
      const wasActive = this._active;
      this._active = null;
      let resetCount = 0;
      for (const comp of this.compartments) {
        if (comp.state !== STATE.VERIFIED) { comp.rollback(); resetCount++; }
      }
      this._busEmit('guardian.seam.repair.system_reset', {
        uuid: this.uuid, queueId: this.uuid, resetCount,
        wasActiveChunk: wasActive ? wasActive.chunkIdx : null, ts: Date.now(),
      });
      this.running = true;
      setTimeout(() => this._next(), 100);
      return { ok: true, action: 'system.reset', resetCount };
    }

    if (chunkIdx === undefined || chunkIdx === null) {
      return { ok: false, error: `repair: action.chunkIdx required for ${type}` };
    }
    const comp = this.compartments[chunkIdx];
    if (!comp) return { ok: false, error: `repair: no compartment at chunkIdx ${chunkIdx}` };

    let result;
    switch (type) {
      case 'repair.inject':
        // If this was the active dispatch, the slot must be released —
        // otherwise _next() sees _active still set and refuses to advance,
        // even though the compartment it points at is now VERIFIED. This is
        // the exact failure shape Phase 71.4 exists to fix.
        if (this._active === comp) this._active = null;
        result = comp.injectEvent(inject, payload || {});
        break;
      case 'repair.transition':
        if (this._active === comp) this._active = null;
        result = comp.forceTransition(to);
        break;
      case 'repair.rollback':
        // If this compartment was the active dispatch, release the slot first
        // so _next() doesn't think something is still in flight.
        if (this._active === comp) this._active = null;
        result = comp.rollback();
        break;
      default:
        return { ok: false, error: `repair: unknown action type "${type}"` };
    }

    if (result.ok) {
      this._checkComplete();          // a forced VERIFIED may finish the queue
      setTimeout(() => this._next(), 100);  // a rollback frees the queue to dispatch again
    }
    return result;
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
    const raw = {
      total:     cs.length,
      verified:  cs.filter(c => c.state === STATE.VERIFIED).length,
      escalated: cs.filter(c => c.state === STATE.ESCALATED).length,
      retrying:  cs.filter(c => c.state === STATE.RETRYING).length,
      active:    cs.filter(c => [STATE.INJECTING, STATE.GENERATING, STATE.DETECTING].includes(c.state)).length,
      queued:    cs.filter(c => c.state === STATE.QUEUED).length,
      pct:       Math.round(cs.filter(c => c.state === STATE.VERIFIED).length / cs.length * 100),
    };
    // Phase 71.1 — derived mode, pure function of the counts above + running.
    // Read-only projection: nothing here writes to JAA or changes dispatch
    // behavior. Just names the aggregate state so callers (escalation,
    // future Anomaly Engine, UI) don't each re-derive "is this stuck" themselves.
    raw.mode = deriveMode(raw, this.running);
    return raw;
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

module.exports = { SEAMQueue, QueueCompartment, STATE, STRATEGY, MODE, _writeCosSeamArtifacts, SEAM_ARTIFACTS_DIR };
