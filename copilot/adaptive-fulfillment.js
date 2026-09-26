'use strict';
/**
 * copilot/adaptive-fulfillment.js — Iterate to Fulfillment, Not to One Attempt
 * UUID: nexus-copilot-adaptive-fulfillment-v1-0000-2026-0629-jamesbrooks-001
 * Version: 1.0.0
 * spec: docs/AXIOMS-v3.0.md §15.1-§15.3 (Group 15 — Adaptive Fulfillment, new this session)
 *
 * "I want co-pilot to learn how to fulfill a request however it can,
 * iterating and adapting each time using the RAID engine and failure/fault
 * taxonomy to learn from its mistakes including the reflection engine."
 *
 * What this actually does, mechanically:
 *   1. RAID (cortex/core/raid, built session 7) picks an agent.
 *   2. dispatchFn (injected by the caller — see below) tries it.
 *   3. lib/reflection.js's scoreDecision() scores the attempt.
 *   4. If it failed or scored low, lib/open-loop-taxonomy.js's classify()
 *      names *why*, RAID's recordOutcome() marks that agent down for this
 *      cluster, and the next attempt excludes it.
 *   5. Every attempt emits its own event (§15.2) — nothing is a hidden loop.
 *   6. recordOutcome() persists past the current request (§15.3) — RAID's
 *      weights Map is module-level state, not request-scoped.
 *
 * §AX-002 boundary, stated plainly: dispatchFn is dependency-injected on
 * purpose. This module owns the iterate/classify/reflect/re-route *logic*
 * and is tested against that logic directly. It does not itself know how
 * to reach claude/chatgpt through Guardian's NCP — copilot/server.js's
 * existing _dispatchToOllama() covers the ollama case; a guardian-NCP
 * dispatch function for claude/chatgpt is not wired here. Faking that
 * integration would violate §1.1 (nothing exists until proven) — it isn't
 * proven, so it isn't claimed.
 */

const RAID_PATH = '../cortex/core/raid';
const REFLECTION_PATH = '../lib/reflection';
const TAXONOMY_PATH = '../lib/open-loop-taxonomy';

function _require(path) {
  try { return require(path); } catch (e) { return null; }
}

/**
 * fulfill — the adaptive loop itself.
 *
 * @param {string} prompt
 * @param {function} dispatchFn  async (agent, prompt, ctx) => { ok, output?, error?, errorType? }
 * @param {object} opts
 *   maxAttempts   default 3 — the iteration budget (§15.1, must be bounded)
 *   reflectionFloor default 0.7 — score below this is treated as "keep trying"
 *   context       passed straight to RAID's _decide() as call.context (cfrSigmaFloor/cfrRegime flow through)
 *   onAttempt     optional (attemptRecord) => void — caller's event-emission hook (§15.2)
 * @returns {{ ok, agent?, output?, attempts, reason? }}
 */
async function fulfill(prompt, dispatchFn, opts = {}) {
  const raid       = _require(RAID_PATH);
  const reflection = _require(REFLECTION_PATH);
  const taxonomy   = _require(TAXONOMY_PATH);

  if (!raid?._decide) {
    return { ok: false, attempts: [], reason: 'RAID engine unavailable — cannot route, cannot iterate' };
  }
  if (typeof dispatchFn !== 'function') {
    return { ok: false, attempts: [], reason: 'dispatchFn is required — this module does not know how to reach providers itself' };
  }

  const maxAttempts     = opts.maxAttempts || 3;
  const reflectionFloor = opts.reflectionFloor != null ? opts.reflectionFloor : 0.7;
  const excluded        = new Set();
  const attempts        = [];

  for (let i = 1; i <= maxAttempts; i++) {
    // §15.1 — re-route through RAID, not a blind repeat of the same call.
    // Excluded agents from prior failed attempts are removed from health
    // before deciding, so _decide() can't just pick the same loser again.
    const health = { ...raid._health };
    for (const agentName of excluded) {
      const key = (raid.HEALTH_KEY && raid.HEALTH_KEY[agentName]) || agentName;
      if (health[key]) health[key] = { ...health[key], online: false };
      else health[key] = { online: false, consecutiveFails: 99 };
    }

    const decision = raid._decide(
      { prompt, context: opts.context, preferredAgent: opts.preferredAgent && !excluded.has(opts.preferredAgent) ? opts.preferredAgent : undefined },
      health,
      raid._weights
    );

    let dispatchResult;
    try {
      dispatchResult = await dispatchFn(decision.agent, prompt, opts.context || {});
    } catch (e) {
      dispatchResult = { ok: false, error: e.message, errorType: 'dispatch_threw' };
    }

    // §reflection — score the attempt the same way request-handler.js's
    // decision-scoring path does, not a fresh ad-hoc judgment.
    const reflectionRow = {
      chosen:  dispatchResult.ok ? 'RESOLVED' : 'UNRESOLVED',
      outcome: dispatchResult.ok ? 'executed' : 'failed',
      output:  dispatchResult.output,
    };
    const scored = reflection?.scoreDecision
      ? reflection.scoreDecision(reflectionRow)
      : { score: dispatchResult.ok ? 0.8 : 0.3, reason: 'reflection engine unavailable — fallback score' };

    const succeeded = dispatchResult.ok && scored.score >= reflectionFloor;

    // §13.3 — classify the failure through the named fault taxonomy, not a
    // fresh error string, whenever the attempt didn't clearly succeed.
    let fault = null;
    if (!succeeded && taxonomy?.classify) {
      fault = taxonomy.classify({
        type: dispatchResult.errorType || 'fulfillment_attempt_failed',
        body: dispatchResult.error || `agent ${decision.agent} produced a low-reflection-score result (${scored.score})`,
      });
    }

    const attemptRecord = {
      attempt:   i,
      agent:     decision.agent,
      cluster:   decision.cluster,
      reason:    decision.reason,
      ok:        !!dispatchResult.ok,
      reflectionScore: scored.score,
      reflectionReason: scored.reason,
      faultType: fault?.loop_type || null,
      ts: Date.now(),
    };
    attempts.push(attemptRecord);

    // §15.2 — every iteration is a traceable event. The caller wires this
    // to its own event bus; this module doesn't assume one exists.
    try { opts.onAttempt?.(attemptRecord); } catch (_) {}

    // §15.3 — learning is cumulative across requests, not just this one.
    // recordOutcome() writes into RAID's module-level _weights/_health,
    // which is still there for the *next* fulfill() call, not reset here.
    try { raid.recordOutcome?.(decision.agent, decision.cluster, succeeded); } catch (_) {}

    if (succeeded) {
      return { ok: true, agent: decision.agent, output: dispatchResult.output, attempts };
    }

    excluded.add(decision.agent);
  }

  // §1.2 / §15.1 — budget exhausted is a loud, specific failure, not a
  // silent give-up. The caller gets every attempt's fault classification,
  // not just "it didn't work."
  return {
    ok: false,
    attempts,
    reason: `iteration budget (${maxAttempts}) exhausted — last fault: ${attempts[attempts.length - 1]?.faultType || 'unknown'}`,
  };
}

module.exports = { fulfill };
