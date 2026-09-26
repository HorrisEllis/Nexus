'use strict';
// lib/agent-identity.js — §NEW 2026-09-17
//
// James: "we need to deepen the jobId, provider and identity." Real
// finding this traces to: "agentId" already meant three genuinely
// different, real things in this codebase before this file existed —
//
//   guardian/lib/chat-logger.js  agentId = provider (a flat string,
//     no deeper identity existed to give it — the exact limit this
//     file exists to actually fix, not paper over)
//   clear-glass/src/mesh/agent-mesh.js  agentId = a browser-context /
//     vault-restored-session identity ("contextId-as-agentId
//     convention," its own real comment says so) — nothing to do with
//     a hat or a dispatch provider
//   cortex/core/raid/index.js  dispatchName — a flat per-provider
//     routing/health key, its own separate real concept again
//
// Same class of collision this whole session already found and kept
// SEPARATE twice (COS's real compartment vs RAID's governance one; the
// real .agent dispatch-health node vs the new .agent_model behavioral
// one) — so this file does not merge agent-mesh's or RAID's own real
// identity concepts into this one. It gives guardian's own flat
// provider-as-agentId a real deepening — provider + active hat, the one
// piece of real, already-available identity guardian has never
// composed into the value it hands to chat-logger/agent-model — and
// nothing more. Cross-referencing this identity INTO agent-mesh or RAID
// is real, separate future work, not something to default into this
// same file just because the word "identity" is shared.

/**
 * resolveIdentity({ provider, hat }) -> a real, composite agentId string.
 * `provider:hat` when a hat is active (the one already-real, already-
 * dispatched piece of identity beyond bare provider — see guardian/lib/
 * dispatcher.js:345, job.hat is computed once at job creation, not
 * guessed here), else just the bare provider — the same value every
 * call site already fell back to before this file existed, so nothing
 * regresses for a hat-less job.
 */
function resolveIdentity({ provider, hat } = {}) {
  const p = provider || 'unknown';
  return hat ? `${p}:${hat}` : p;
}

/**
 * parseIdentity(agentId) -> { provider, hat } — the inverse, for a
 * reader (chat-index.js, agent-model.js) that has the composite string
 * and needs the parts back. Never throws on a bare provider (hat: null).
 */
function parseIdentity(agentId) {
  if (!agentId) return { provider: null, hat: null };
  const idx = agentId.indexOf(':');
  return idx === -1
    ? { provider: agentId, hat: null }
    : { provider: agentId.slice(0, idx), hat: agentId.slice(idx + 1) };
}

module.exports = { resolveIdentity, parseIdentity, MODULE_ID: 'lib.agent-identity', VERSION: '1.0.0' };
