// ═══════════════════════════════════════════════════
// NEXUS — RAID Fallback
// core/raid/fallback.js
//
// Fallback chain: if agent fails, route to next.
// Exhaustion detection: stop retrying when all fail.
// Law I: ollama is always first in the chain.
// APIs (5th tier) require explicit prompt.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel } = require('../../foundation/kernel');

// Priority order — Law I: ollama always first
const PRIORITY = ['ollama', 'chatgpt', 'gemini', 'claude', 'api'];

class Fallback {
  constructor() {
    this._attempts = new Map(); // taskId → { agent, count }
    this._blocked  = new Set(); // temporarily blocked agents
  }

  // Returns fallback chain starting after given agent
  chain(fromAgent) {
    const idx = PRIORITY.indexOf(fromAgent);
    return PRIORITY.slice(idx + 1);
  }

  // Record a failure and get next agent to try
  next(taskId, failedAgent, reason) {
    const key    = `${taskId}::${failedAgent}`;
    const count  = (this._attempts.get(key) || 0) + 1;
    this._attempts.set(key, count);

    kernel.emit('raid.fallback.triggered', {
      taskId, failedAgent, reason, attemptCount: count,
    });

    // Block agent temporarily after 3 failures in flight
    if (count >= 3) {
      this._blocked.add(failedAgent);
      setTimeout(() => this._blocked.delete(failedAgent), 60000); // 1min block
      kernel.emit('raid.agent.blocked', { agentId: failedAgent, duration: 60000 });
    }

    // Find next available agent
    const chain = this.chain(failedAgent).filter(a => !this._blocked.has(a));

    // API tier requires explicit user confirmation
    if (chain[0] === 'api') {
      kernel.emit('raid.api.prompt_required', { taskId, reason: 'all_agents_exhausted' });
      return null;
    }

    return chain[0] || null;
  }

  // Check if all agents are exhausted
  isExhausted(triedAgents) {
    const available = PRIORITY.filter(a => a !== 'api' && !this._blocked.has(a));
    return triedAgents.length >= available.length;
  }

  clearAttempts(taskId) {
    for (const key of this._attempts.keys()) {
      if (key.startsWith(taskId)) this._attempts.delete(key);
    }
  }

  unblock(agentId) {
    this._blocked.delete(agentId);
    kernel.emit('raid.agent.unblocked', { agentId });
  }

  get blocked() { return [...this._blocked]; }
}

module.exports = { Fallback, PRIORITY };
