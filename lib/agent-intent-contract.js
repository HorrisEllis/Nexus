'use strict';
/**
 * lib/agent-intent-contract.js — AM1: real, RAID-checkable per-agent
 * intent contracts.
 * UUID: nexus-lib-agent-intent-contract-v1-0000-2026-0902-jamesbrooks-001
 *
 * §AM1 (docs/2026-09-02-agent-mesh-full-map-phasemap.spec) — James: "do
 * am1." That phasemap's own real_reuse_candidates note called this
 * correctly before it was built: a hat already IS an agent+persona+
 * toolScope+allowedAgents bundle; the one real thing it was missing to
 * also be a checkable intent CONTRACT was allowedIntents (added to
 * lib/hat-forge.js's own schema in this same pass) — this module is the
 * real CHECK, not a second config surface.
 *
 * §WHAT THIS IS NOT — lib/agent-router.js's own real strength map
 * (perplexity: research, claude: large codebases, ...) is ROUTING
 * ADVICE: "who's probably best at this." This module is a GATE:
 * "is this base agent, via ANY hat that allows it, even PERMITTED to
 * receive this intent at all." Routing advice and a permission gate are
 * different questions with different failure modes — routing advice
 * degrades gracefully to a worse choice; a gate that's silently skipped
 * degrades to "any agent can be asked to do anything," which is exactly
 * what RAID's own real handshake (contract-intake.js's acknowledge())
 * exists to prevent.
 */
const hatForge = require('./hat-forge.js');
const { VALID_BASE_AGENTS } = require('./hat-forge.js');

const MODULE_ID = 'nexus.lib.agent-intent-contract';
const VERSION = '1.0.0';

/**
 * checkAgentIntentContract(agent, intent) — real, read-only check.
 * agent must be a real base agent (claude/chatgpt/gemini/perplexity/
 * ollama/mistral). intent must be a real verb from intent-classifier's
 * VERB_PATTERNS. Returns:
 *   { ok: true,  matchedHat }               — at least one live hat that
 *                                              allows this agent also
 *                                              allows this intent
 *   { ok: true,  matchedHat: null, reason }  — no hat exists naming this
 *                                              agent+intent combo, BUT
 *                                              also no hat exists naming
 *                                              this agent at all — an
 *                                              unrestricted agent (the
 *                                              honest default for every
 *                                              agent nobody has scoped
 *                                              yet, matching every
 *                                              existing hat's own
 *                                              "omit allowedIntents for
 *                                              no restriction" behavior)
 *   { ok: false, reason, checkedHats }       — real hats exist for this
 *                                              agent, at least one of
 *                                              them declares a real
 *                                              allowedIntents list, and
 *                                              NONE of them include this
 *                                              intent — a real, informed
 *                                              refusal, not a guess
 */
function checkAgentIntentContract(agent, intent) {
  if (!agent || !VALID_BASE_AGENTS.has(agent)) {
    return { ok: false, reason: `"${agent}" is not a real base agent — one of: ${[...VALID_BASE_AGENTS].join(', ')}` };
  }
  if (!intent || typeof intent !== 'string') {
    return { ok: false, reason: 'a real intent verb is required' };
  }

  const hats = hatForge.list().filter(h =>
    h.baseAgent === agent || (Array.isArray(h.allowedAgents) && h.allowedAgents.includes(agent)));

  if (!hats.length) {
    // §HONEST DEFAULT — no hat has ever named this agent at all. This is
    // NOT the same as "every hat that names it forbids this intent" —
    // conflating the two would make an agent MORE restricted the less
    // anyone has bothered to configure it, which is backwards.
    return { ok: true, matchedHat: null, reason: `no hat names "${agent}" — unrestricted (nothing has scoped it yet)` };
  }

  const scopedHats = hats.filter(h => Array.isArray(h.allowedIntents) && h.allowedIntents.length);
  if (!scopedHats.length) {
    // Real hats exist for this agent, but none of them opted into an
    // intent restriction — same honest "unrestricted" outcome, for a
    // different real reason (checked, not assumed).
    return { ok: true, matchedHat: null, reason: `${hats.length} real hat(s) name "${agent}" but none declare allowedIntents — unrestricted` };
  }

  const match = scopedHats.find(h => h.allowedIntents.includes(intent));
  if (match) return { ok: true, matchedHat: match.name };

  return {
    ok: false,
    reason: `"${agent}" has ${scopedHats.length} real intent-scoped hat(s) (${scopedHats.map(h => h.name).join(', ')}), and none of them allow intent "${intent}"`,
    checkedHats: scopedHats.map(h => ({ name: h.name, allowedIntents: h.allowedIntents })),
  };
}

module.exports = { checkAgentIntentContract, MODULE_ID, VERSION };
