// ═══════════════════════════════════════════════════
// NEXUS — Guardian Bridge Agents
// agents/chatgpt/index.js  (pattern for all cloud agents)
//
// Cloud agents operate via Guardian web extension.
// Guardian injects prompts into browser tabs, scrapes
// responses via MutationObserver, returns via WebSocket.
//
// Priority order (Law I enforced by RAID):
//   2. ChatGPT  — small scripts, quick fixes
//   3. Gemini   — adversarial testing
//   4. Claude   — large files, last resort
// ═══════════════════════════════════════════════════

'use strict';

const { BaseAgent } = require('./base');
const { kernel }    = require('../foundation/kernel');

// ── Guardian API connector (v8) ────────────────────────────────────────────────
// All Guardian HTTP traffic now routes through guardian-api.js.
// Authoritative server: guardian/server.js @ HTTP :7820, WSS :7821.
// /api/complete does NOT exist in v8 — use GuardianAPI.dispatch() instead.
// Config resolution order: guardian.config.json → env vars → defaults.
const { GuardianAPI } = require('../guardian-api');

// NEXUS admin port is a separate concern — not the Guardian server port.
const NEXUS_ADMIN_PORT = parseInt(process.env.NEXUS_ADMIN_PORT || '3748');

// Guardian v8 server port — read from env or guardian.config.json (auto-resolved by GuardianAPI)
const guardian = new GuardianAPI({
  port:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  ipcToken: process.env.GUARDIAN_IPC_TOKEN || '',
});

// ── Guardian dispatch bridge ───────────────────
// Replaces the old /api/complete stub.
// Uses POST /command → poll /status/:jobId → GET /response/:jobId.
async function guardianRequest(service, prompt, opts = {}) {
  const { signal } = opts;
  // Map service name to Guardian provider name
  const provider = _normaliseProvider(service);

  // Attach abort signal to poll deadline if provided
  let aborted = false;
  if (signal) signal.addEventListener('abort', () => { aborted = true; });

  const result = await guardian.dispatch(provider, prompt, {
    command: 'code',
    timeout: 60_000,
  });

  if (aborted) throw new DOMException('Aborted', 'AbortError');
  return result;
}

function _normaliseProvider(service) {
  const map = { chatgpt: 'chatgpt', claude: 'claude', gemini: 'gemini', ollama: 'ollama' };
  return map[service?.toLowerCase()] || service;
}

// ── ChatGPT Agent ─────────────────────────────
class ChatGPTAgent extends BaseAgent {
  constructor() { super('chatgpt'); }

  async complete(opts = {}) {
    const { prompt, temperature = 0.15, taskType, _eventId, signal } = opts;
    const startEv = this._emitStart(prompt, { taskType, _eventId });
    const t0 = Date.now();
    try {
      const content = await guardianRequest('chatgpt', prompt, { temperature, signal });
      this._emitDone(content, startEv, { taskType, latency: Date.now() - t0 });
      return content;
    } catch (e) {
      this._emitError(e, startEv, { taskType, tokens: Math.ceil(prompt.length / 3.8) });
      throw e;
    }
  }

  async ping() {
    try {
      const r = await fetch(`${GUARDIAN_URL}/ping`, { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }
}

// ── Claude Agent ──────────────────────────────
// Used last. For large complex files. Via Guardian.
class ClaudeAgent extends BaseAgent {
  constructor() { super('claude'); }

  async complete(opts = {}) {
    const { prompt, temperature = 0.15, taskType, _eventId, signal } = opts;
    const startEv = this._emitStart(prompt, { taskType, _eventId });
    const t0 = Date.now();
    try {
      const content = await guardianRequest('claude', prompt, { temperature, signal });
      this._emitDone(content, startEv, { taskType, latency: Date.now() - t0 });
      return content;
    } catch (e) {
      this._emitError(e, startEv, { taskType, tokens: Math.ceil(prompt.length / 3.8) });
      throw e;
    }
  }

  async ping() {
    try {
      const r = await fetch(`${GUARDIAN_URL}/ping`, { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }
}

// ── Gemini Agent ──────────────────────────────
// Used for adversarial testing only.
class GeminiAgent extends BaseAgent {
  constructor() { super('gemini'); }

  async complete(opts = {}) {
    const { prompt, temperature = 0.3, taskType, _eventId, signal } = opts;
    const startEv = this._emitStart(prompt, { taskType, _eventId });
    const t0 = Date.now();
    try {
      const content = await guardianRequest('gemini', prompt, { temperature, signal });
      this._emitDone(content, startEv, { taskType, latency: Date.now() - t0 });
      return content;
    } catch (e) {
      this._emitError(e, startEv, { taskType, tokens: Math.ceil(prompt.length / 3.8) });
      throw e;
    }
  }

  async ping() {
    try {
      const r = await fetch(`${GUARDIAN_URL}/ping`, { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }
}

// ── Agent registry ────────────────────────────
const { ollamaAgent }  = require('./ollama');
const chatgptAgent     = new ChatGPTAgent();
const claudeAgent      = new ClaudeAgent();
const geminiAgent      = new GeminiAgent();

const AGENTS = {
  ollama:  ollamaAgent,
  chatgpt: chatgptAgent,
  claude:  claudeAgent,
  gemini:  geminiAgent,
};

function getAgent(id) {
  const agent = AGENTS[id];
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  return agent;
}

async function pingAll() {
  const results = {};
  for (const [id, agent] of Object.entries(AGENTS)) {
    results[id] = await agent.ping().catch(() => false);
    kernel.emit(`agent.${id}.${results[id] ? 'connected' : 'disconnected'}`, { agentId: id });
  }
  return results;
}

module.exports = { ChatGPTAgent, ClaudeAgent, GeminiAgent, getAgent, pingAll, AGENTS };
