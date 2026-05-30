// ═══════════════════════════════════════════════════
// NEXUS — Base Agent Interface
// agents/base.js
//
// All agents implement this contract.
// Law III: agents publish/subscribe via bus only.
// Law I: Ollama agent bypasses no laws.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel } = require('../foundation/kernel');

class BaseAgent {
  constructor(id) {
    this.id      = id;
    this.status  = 'idle'; // idle | busy | error | rate_limited
    this._queue  = [];
    this._inflight = 0;
    this._maxConcurrent = 1;

    // All agents subscribe to their own routing events
    kernel.on('raid.routed', e => {
      if (e.payload.agent === this.id) this._onRouted(e);
    });
  }

  // ── Public interface ──────────────────────────

  // Complete a prompt — returns string response
  async complete(opts) {
    throw new Error(`[${this.id}] complete() not implemented`);
  }

  // Stream a prompt — calls onChunk for each token
  async stream(opts) {
    throw new Error(`[${this.id}] stream() not implemented`);
  }

  // Check if agent is reachable
  async ping() {
    return false;
  }

  // ── Internal ──────────────────────────────────

  _onRouted(event) {
    const { task, tokens, fallbackChain, manifestNodeId } = event.payload;
    kernel.emit('agent.received_task', {
      agentId: this.id,
      task,
      tokens,
      manifestNodeId,
    }, { causedBy: event.id });
  }

  _emitStart(prompt, opts = {}) {
    this.status = 'busy';
    return kernel.emit('agent.response.streaming', {
      agentId:  this.id,
      taskType: opts.taskType,
      tokens:   Math.ceil(prompt.length / 3.8),
    }, { causedBy: opts._eventId });
  }

  _emitDone(content, startEvent, opts = {}) {
    this.status = 'idle';
    const ev = kernel.emit('agent.response.received', {
      agentId:   this.id,
      content,
      tokens:    Math.ceil(content.length / 3.8),
      taskType:  opts.taskType,
      success:   true,
      latency:   opts.latency,
    }, { causedBy: startEvent?.id });
    return ev;
  }

  _emitError(error, startEvent, opts = {}) {
    this.status = 'error';
    kernel.emit('agent.error', {
      agentId:  this.id,
      error:    error.message,
      taskType: opts.taskType,
    }, { causedBy: startEvent?.id });
    kernel.emit('gate.failed', {
      agentId:     this.id,
      failureMode: this._classifyError(error),
      tokens:      opts.tokens,
      taskType:    opts.taskType,
    });
  }

  _classifyError(error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('truncat'))    return 'truncated_output';
    if (msg.includes('rate'))       return 'rate_limited';
    if (msg.includes('timeout'))    return 'timeout';
    if (msg.includes('context'))    return 'context_overflow';
    if (msg.includes('schema'))     return 'schema_violation';
    return 'unknown';
  }
}

module.exports = { BaseAgent };
