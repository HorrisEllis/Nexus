'use strict';
// copilot/lib/agent-model-nodes.js — a real `.agent_model` node per agent.
//
// §BUILT 2026-09-17 — James: "hats and .agent nodes... a model of the
// agent. To persist." Mirrors idearium/lib/chunk-nodes.js's own real
// pattern exactly: model computes, writer persists — never the reverse.
// This file does not decide what an agent's behavior means; it reads
// copilot/lib/agent-model.js's current hypothesis state and calls the
// same shared nodeExport.exportToFile() every other real node type
// uses. See lib/node-schemas/schema.agent_model, status:REAL, and its
// own note on why this is a genuinely different type from schema.health
// (RAID's real-time dispatch-availability snapshot) — the two were kept
// deliberately separate, not merged, per that decision.

const path = require('path');
const nodeExport = require('../../lib/node-export');
const agentModel = require('../../lib/agent-model');

const MODULE_ID = 'agent-model-nodes';
let _lastError = null;

function _slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}

/** agentModelNodeId(agentId) -> "<slug>" — exportToFile() turns it into "<id>.agent_model". */
function agentModelNodeId(agentId) {
  return _slug(agentId);
}

function _nodesDir() {
  // §FIXED 2026-09-17 — James: "copilot and guardian are sovereign
  // systems." This file itself moved from copilot/lib/ to guardian/lib/
  // for the same reason — guardian is the one that actually observes
  // and writes agent behavior in real time (ncp-handler.js), so it owns
  // persisting the result, the same way it already owns capability/
  // command/component/system under its own real data/nodes/ (checked
  // directly: guardian/data/nodes/{capability,command,component,system}
  // already exist). agent_model joins that same real, per-system
  // convention rather than living in a shared or ambiguous location.
  return path.join(__dirname, '..', 'data', 'nodes', 'agent_model');
}

/**
 * toNodePayload(agentId, hypotheses) — the real snapshot shape, matching
 * schema.agent_model exactly. Every hypothesis is included as-is, off
 * agent-model.js's own getHypotheses() — nothing recomputed, nothing
 * summarized, nothing dropped except what getHypotheses() already
 * excludes (archived hypotheses stay queryable in the table directly,
 * not duplicated into this node — same real choice chunk-nodes.js made
 * about chunk lifecycle history living in its own ledger table instead).
 */
function toNodePayload(agentId, hypotheses) {
  return {
    agentId,
    hypotheses,
    hypothesisCount: hypotheses.length,
    generatedAt: Date.now(),
  };
}

/**
 * writeAgentModelNode(agentId) -> the file path written, or null.
 *
 * §OVERWRITE IS CORRECT HERE, same real reasoning as writeChunkNode()'s
 * own note: this node records current standing, not a history — a node
 * that stopped updating would be confidently wrong, not merely stale.
 * The actual lifecycle (every confirm/decay/archive transition) already
 * lives in agent_model_hypotheses directly; this node is a read-optimized
 * snapshot of it, not a second copy of its history.
 */
function writeAgentModelNode(agentId, { force = false } = {}) {
  if (!agentId) return null;
  try {
    const hypotheses = agentModel.getHypotheses(agentId);
    const payload = toNodePayload(agentId, hypotheses);
    const id = agentModelNodeId(agentId);
    const filePath = nodeExport.exportToFile(
      'agent_model',
      id,
      payload,
      {
        context: `agent-model behavioral snapshot for ${agentId}`,
        system: 'guardian',
        summary: `${hypotheses.length} active hypothesis(es)`,
        // Real, queryable tags — claimType is the one dimension anyone
        // actually filters agent models by (e.g. "every agent with an
        // active failure_mode claim").
        tags: [
          `agent:${agentId}`,
          ...[...new Set(hypotheses.map(h => h.claimType))].map(t => `claimType:${t}`),
        ],
      },
      _nodesDir()
    );
    _lastError = null;
    return filePath;
  } catch (e) {
    // Loud once per distinct reason, same real §1.2 discipline chunk-
    // nodes.js applies — a busy agent must not spam identical failures.
    if (_lastError !== e.message) {
      console.warn(`[${MODULE_ID}] §1.2 agent_model node write failed (non-fatal, agent-model itself is unaffected): ${e.message}`);
      _lastError = e.message;
    }
    return null;
  }
}

module.exports = { agentModelNodeId, toNodePayload, writeAgentModelNode };
