// ═══════════════════════════════════════════════════
// NEXUS — RAID Decision Engine
// core/raid/index.js
//
// Routes tasks to agents using:
//   cost × capability × availability × history × drift
//
// Constitutional Law I enforced: Ollama first, always.
// Constitutional Law III: all routing via kernel.emit()
//
// AgentSignature pattern adapted from Resonance/
// TrajectoryStore — stable axes, drift tracking,
// high/low variance capability fingerprinting.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel }    = require('../../foundation/kernel');
const { weights }   = require('./weights');
const { Learner }   = require('./learner');
const { Fallback }  = require('./fallback');
const { usage }     = require('../usage');

class RAIDEngine {
  constructor() {
    this._learner  = new Learner();
    this._fallback = new Fallback();
    this._log      = [];          // decision log for admin/RAID page
    this._overrides = new Map();  // manual routing overrides

    // Subscribe to events that update learner
    kernel.on('agent.response.received', e => this._learner.record(e.payload));
    kernel.on('gate.failed',             e => this._learner.recordFailure(e.payload));
    kernel.on('agent.rate_limited',      e => this._learner.recordRateLimit(e.payload));
  }

  // ── Main routing decision ──────────────────────
  // Returns chosen agent and full fallback chain.
  // Law I: Ollama is always evaluated first unless usage > 90%.
  async decide(task) {
    const { type, tokens = 2000, context = {}, manifestNodeId } = task;

    kernel.emit('raid.deciding', { task: type, tokens, manifestNodeId });

    // Check manual overrides
    const override = this._overrides.get(type) || this._overrides.get('*');
    if (override) {
      return this._route(override, task, 'manual_override');
    }

    // Get all candidate agents with their scores
    const candidates = this._scoreCandidates(type, tokens, context);

    // Law I: if Ollama is available (usage < 90%), it is always primary candidate
    const ollamaScore = candidates.find(c => c.agentId === 'ollama');
    const ollamaUsage = usage.get('ollama').percent;

    if (ollamaUsage < 90 && ollamaScore && ollamaScore.score > 0.3) {
      return this._route('ollama', task, `local_first law_i score:${ollamaScore.score.toFixed(2)}`);
    }

    // Sort remaining candidates by composite score
    const ranked = candidates
      .filter(c => c.agentId !== 'ollama')
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) {
      kernel.emit('raid.exhausted', { task: type });
      throw new Error(`RAID: no available agents for task type: ${type}`);
    }

    const chosen = ranked[0];
    return this._route(chosen.agentId, task, `score:${chosen.score.toFixed(2)} drift:${chosen.drift.toFixed(3)}`);
  }

  // ── Score all agents for a task ───────────────
  _scoreCandidates(taskType, tokens, context) {
    return Object.entries(weights.agents).map(([agentId, w]) => {
      const sig     = this._learner.signature(agentId);
      const current = usage.get(agentId);
      const score   = this._composite(agentId, taskType, tokens, w, sig, current);
      return { agentId, score, drift: sig.drift.magnitude };
    });
  }

  // ── Composite score: cost × capability × availability × drift ──
  _composite(agentId, taskType, tokens, w, sig, usageStat) {
    // Availability penalty
    const avail = usageStat.percent < 70  ? 1.0
                : usageStat.percent < 90  ? 0.6
                : 0.0; // route away above 90%

    // Capability: base weight × task-type affinity
    const taskAffinity = (w.taskAffinities || {})[taskType] || w.baseCapability || 0.5;

    // Drift penalty: reduce score proportional to drift magnitude
    const driftPenalty = Math.max(0, 1 - sig.drift.magnitude * 2);

    // Token ceiling penalty: reduce score if task exceeds learned ceiling
    const ceiling      = sig.core.tokenCeiling || Infinity;
    const tokenPenalty = tokens > ceiling ? Math.max(0.1, 1 - (tokens - ceiling) / ceiling) : 1.0;

    // History: success rate from learner
    const successRate  = sig.core.successRate || 0.8;

    // Cost tier inverse (lower cost = higher score contribution)
    const costScore    = 1 - (w.costTier || 0.5);

    return (
      avail       * 0.30 +
      taskAffinity* 0.25 +
      successRate * 0.20 +
      driftPenalty* 0.10 +
      tokenPenalty* 0.10 +
      costScore   * 0.05
    );
  }

  // ── Route and emit ────────────────────────────
  _route(agentId, task, reason) {
    const sig      = this._learner.signature(agentId);
    const chain    = this._fallback.chain(agentId);
    const decision = {
      agent:          agentId,
      task:           task.type,
      tokens:         task.tokens,
      reason,
      fallbackChain:  chain,
      signature:      sig,
      ts:             Date.now(),
    };
    this._log.unshift(decision);
    if (this._log.length > 500) this._log.pop();

    kernel.emit('raid.routed', decision, { causedBy: task._eventId });
    return decision;
  }

  // ── Manual override ───────────────────────────
  setOverride(taskType, agentId) {
    this._overrides.set(taskType, agentId);
    kernel.emit('raid.override.set', { taskType, agentId });
  }

  clearOverride(taskType) {
    this._overrides.delete(taskType);
    kernel.emit('raid.override.cleared', { taskType });
  }

  get decisionLog() { return this._log; }
  get learner()     { return this._learner; }
}

const raid = new RAIDEngine();
module.exports = { RAIDEngine, raid };
