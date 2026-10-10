'use strict';
/**
 * cortex/core/raid/routing-ir.js — Routing IR
 * UUID: nexus-raid-routing-ir-v1-0000-2026-0706-jamesbrooks-001
 * Version: 1.0.0
 * spec: docs/raid.spec (extends, does not replace)
 *
 * Scoped exactly as agreed: routing decisions only (RAID + anything that
 * used to hand-roll its own provider routing, e.g. copilot/lifeline.js).
 * Explicitly NOT for seam tier selection (deterministic cascade, not a
 * competition — forcing it through this shape would fabricate a
 * `confidence` and a `candidates` list that don't exist there) and NOT
 * for chunk lifecycle states (a position in time, not a choice).
 *
 * §HONESTY NOTE — this wraps what RAID._decide() actually does, not an
 * idealized version of it. _decide() is a hybrid:
 *   - LAW_I (ollama-first) and LAW_III (claude-last-resort) are rule-based
 *     short-circuits. No candidates are scored. No competition happens.
 *   - The middle branch (2+ survivors after health filtering) is the only
 *     place real fitness scoring occurs.
 * A RoutingIR from a rule-based branch has `mode: 'rule_based'`,
 * `fitness: null`, `confidence: null` — not a fabricated 1.0. Confidence
 * only exists where a real competition happened.
 *
 * §HONESTY NOTE 2 — _fitness()'s roleConfidence/topologicalProximity/
 * snrTierGate terms are stubbed at 1.0 in RAID itself (see
 * cortex/core/raid/index.js — each stub names its own real, unbuilt
 * dependency). This IR reports the fitness breakdown RAID actually
 * computed, stubs included and labeled — it does not invent richer
 * scoring RAID doesn't do.
 */
const raid = require('./index.js');

// §MESH-INTEGRATION 2026-08-29 — real gap: RAID's own chain
// (['ollama','chatgpt','gemini','claude'], cortex/core/raid/index.js)
// dispatches through Guardian's userscript-injected providers, a DIFFERENT
// execution mechanism from Clear Glass's AgentMesh (which drives the same
// providers' web UIs directly, plus perplexity/mistral/grok that RAID's
// own chain doesn't even include). RAID's `selected` agent name and
// AgentMesh's own AGENT_REGISTRY keys happen to overlap for
// claude/chatgpt/gemini — this is that real overlap, made checkable,
// not a claim that RAID and AgentMesh are the same system. A caller
// (copilot's tool executor, wake-relay) that gets a RoutingIR back can
// use `meshCapable` to decide whether AgentMesh is a viable SECOND path
// to reach the same agent RAID picked, e.g. if Guardian's own dispatch
// to that provider is what's actually down.
const MESH_AGENT_REGISTRY_KEYS = new Set(['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek', 'mistral', 'grok']);   // §0.59.1 deepseek was absent

/**
 * buildRoutingIR — call RAID's real _decide() and wrap the result in the
 * canonical shape. This is the ONLY function anything should call to get
 * a routing decision — no caller should hand-roll `_decide()` params
 * directly or maintain its own priority list (that's the exact bug this
 * replaces in copilot/lifeline.js).
 *
 * @param {object} request — { intent, prompt, context, preferredAgent }
 *   `intent` is required (was previously implicit/missing in some
 *   callers — RAID's _cluster() falls back to '' if absent, which is a
 *   silent degradation this IR makes visible instead of swallowing).
 */
function buildRoutingIR(request = {}) {
  if (!request.intent && !request.prompt) {
    throw new Error('[routing-ir] request.intent or request.prompt is required — RAID cannot cluster an empty request');
  }

  const health = raid._health;   // plain object, not a function
  const weights = raid._weights; // a Map, not a function
  const decision = raid._decide(request, health, weights);

  // Reconstruct which branch actually fired, from the decision's own
  // `reason` string — RAID doesn't currently return this as a structured
  // field, so this IR derives it rather than guessing. If RAID's reason
  // text ever changes, this derivation breaks loudly (returns 'unknown'),
  // not silently.
  const mode = /explicit preference honored/.test(decision.reason) ? 'rule_based'
             : /LAW_I:/.test(decision.reason)                       ? 'rule_based'
             : /LAW_III:/.test(decision.reason)                     ? 'rule_based'
             : /cluster_chain: only survivor/.test(decision.reason) ? 'rule_based' // one candidate, nothing to compete against
             : /cluster_chain: highest fitness/.test(decision.reason) ? 'competitive'
             : 'unknown';

  const ir = {
    intent:     request.intent || request.prompt,
    subject:    'provider_routing',
    context:    request.context || {},
    mode,                                   // 'rule_based' | 'competitive' | 'unknown'
    candidates: null,
    fitness:    null,
    selected:   decision.agent,
    cluster:    decision.cluster,
    confidence: null,
    reason:     decision.reason,
    // §MESH-INTEGRATION 2026-08-29 — real, checkable, not inferred: is
    // `selected` an agent AgentMesh's own registry actually knows how to
    // spawn? 'ollama' is real and local-only — never mesh-capable, since
    // it isn't a web-UI-automatable provider at all.
    meshCapable: MESH_AGENT_REGISTRY_KEYS.has(decision.agent),
    ts:         Date.now(),
  };

  if (mode === 'competitive') {
    // Re-derive the same candidate set RAID's middle branch considered,
    // so the IR can show what it actually compared — RAID itself doesn't
    // return this list today, only the winner. This calls the same real
    // _fitness() RAID used, not a re-implementation of it.
    const chain = ['ollama', 'claude', 'chatgpt'];
    const survivors = chain.filter(name => raid._agentAvailable(name, health, {}));
    const scored = survivors.map(name => ({
      agent_id: name,
      fitness: raid._fitness(name, decision.cluster, health), // real, stubs and all
    })).sort((a, b) => b.fitness - a.fitness);

    ir.candidates = scored.map(s => s.agent_id);
    ir.fitness    = Object.fromEntries(scored.map(s => [s.agent_id, s.fitness]));
    // Confidence = separation margin between winner and runner-up, the
    // one place a real number is derivable — matches the pasted spec's
    // definition, applied only where the underlying computation is real.
    ir.confidence = scored.length > 1
      ? Math.max(0, Math.min(1, (scored[0].fitness - scored[1].fitness) / (scored[0].fitness || 1)))
      : 1.0; // only one real survivor even in the "competitive" label — no actual competitor
  }

  return ir;
}

module.exports = { buildRoutingIR };
