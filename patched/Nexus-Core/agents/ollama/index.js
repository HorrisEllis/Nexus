// ═══════════════════════════════════════════════════
// NEXUS — Ollama Agent
// agents/ollama/index.js
//
// Primary agent. Law I: always evaluated first.
// Orchestrator: manifest gen, RAID decisions, healing.
// Streaming via /api/generate.
// Model: deepseek-coder-v2:16b-lite-instruct-q4_K_M
// R7 3700x: 7 threads, 4096 token context.
// ═══════════════════════════════════════════════════

'use strict';

const { BaseAgent } = require('../base');
const { kernel }    = require('../../foundation/kernel');

const OLLAMA_BASE   = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b-lite-instruct-q4_K_M';
const NUM_THREAD    = 7;    // R7 3700x: 8 cores, leave 1 for OS
const NUM_CTX       = 4096; // 4K token budget

class OllamaAgent extends BaseAgent {
  constructor() {
    super('ollama');
    this._model   = DEFAULT_MODEL;
    this._baseUrl = OLLAMA_BASE;
    this._models  = [];
  }

  // ── Streaming completion ──────────────────────
  async complete(opts = {}) {
    const {
      prompt,
      temperature  = 0.15,
      maxTokens    = NUM_CTX,
      model        = this._model,
      taskType,
      _eventId,
    } = opts;

    const startEv = this._emitStart(prompt, { taskType, _eventId });
    const t0      = Date.now();

    try {
      const res = await fetch(`${this._baseUrl}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature,
            top_p:          0.92,
            num_ctx:        maxTokens,
            num_thread:     NUM_THREAD,
            repeat_penalty: 1.1,
          },
        }),
        signal: opts.signal || AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama ${res.status}: ${text}`);
      }

      const data    = await res.json();
      const content = data.response || '';
      const latency = Date.now() - t0;

      this._emitDone(content, startEv, { taskType, latency });
      return content;

    } catch (e) {
      this._emitError(e, startEv, { taskType, tokens: Math.ceil(prompt.length / 3.8) });
      throw e;
    }
  }

  // ── Streaming with chunk callback ─────────────
  async stream(opts = {}) {
    const {
      prompt,
      temperature = 0.15,
      model       = this._model,
      onChunk,
      taskType,
      _eventId,
      signal,
    } = opts;

    const startEv = this._emitStart(prompt, { taskType, _eventId });
    const t0      = Date.now();

    try {
      const res = await fetch(`${this._baseUrl}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: { temperature, top_p: 0.92, num_ctx: NUM_CTX, num_thread: NUM_THREAD },
        }),
        signal: signal || AbortSignal.timeout(120_000),
      });

      if (!res.ok) throw new Error(`Ollama ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   full    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
          try {
            const j = JSON.parse(line);
            if (j.response) { full += j.response; onChunk?.(j.response); }
            if (j.done) break;
          } catch {}
        }
      }

      const latency = Date.now() - t0;
      this._emitDone(full, startEv, { taskType, latency });
      return full;

    } catch (e) {
      if (e.name !== 'AbortError') {
        this._emitError(e, startEv, { taskType });
      }
      throw e;
    }
  }

  // ── Ping / model list ─────────────────────────
  async ping() {
    try {
      const res = await fetch(`${this._baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return false;
      const data  = await res.json();
      this._models = (data.models || []).map(m => m.name);
      kernel.emit('agent.ollama.ping', { models: this._models, available: true });
      return true;
    } catch {
      kernel.emit('agent.ollama.ping', { available: false });
      return false;
    }
  }

  // ── Orchestrator: decide which identity builds which gate ──
  // Called by RAID engine — Ollama reads delta logs and
  // context to select the best agent per task node.
  async orchestrate(task) {
    const prompt = buildOrchestratorPrompt(task);
    const raw    = await this.complete({
      prompt,
      temperature: 0,  // Law IV: deterministic orchestration
      taskType: 'orchestration',
    });
    try {
      return JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim());
    } catch {
      return { agent: 'ollama', reason: 'parse_fallback' };
    }
  }

  get models() { return this._models; }
  setModel(m)  { this._model = m; kernel.emit('agent.ollama.model_changed', { model: m }); }
}

function buildOrchestratorPrompt(task) {
  return `You are the NEXUS orchestrator. Assign the best agent for this task.
Available agents: ollama (local, free), chatgpt (code), claude (large files), gemini (adversarial).
Task: ${JSON.stringify(task)}
Context: ${task.context || 'standard build'}
Output only JSON: { "agent": "...", "reason": "..." }`;
}

const ollamaAgent = new OllamaAgent();
module.exports = { OllamaAgent, ollamaAgent };
