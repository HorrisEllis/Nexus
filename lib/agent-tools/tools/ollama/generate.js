'use strict';
/**
 * lib/agent-tools/tools/ollama/generate.js
 *
 * §BUILT 2026-09-08 — James: "need to check the agent tools... fix and
 * expand the tools." Real, confirmed gap: no ollama tool category
 * existed at all before this — agents had no way to invoke local ollama
 * generation directly as a tool call. Confirmed the real, standard
 * Ollama REST API directly (POST /api/generate on OLLAMA_HOST, same
 * real port convention already used consistently across this codebase:
 * idearium/agent-suite/index.js's own OLLAMA_PORT, ollama/config.js's
 * own OLLAMA_HOST) rather than importing idearium's own
 * generateWithOllama() cross-module-system (that wrapper carries
 * idearium-specific defaults not necessarily right for a general tool
 * any agent can call).
 */
const http = require('http');

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1:11434';
const [OLLAMA_HOSTNAME, OLLAMA_PORT] = OLLAMA_HOST.split(':');

function _generate(model, prompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model, prompt, stream: false });
    const req = http.request(
      { hostname: OLLAMA_HOSTNAME, port: parseInt(OLLAMA_PORT, 10) || 11434,
        path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: timeoutMs },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`bad response from ollama: ${e.message}`)); } });
      }
    );
    req.on('error', (e) => reject(new Error(`ollama unreachable at ${OLLAMA_HOST}: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('ollama request timeout')); });
    req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'ollama_generate',
  description: 'Generate text using a local Ollama model, running on this machine — no external API call, no cost. Use for fast, private, local reasoning when a full agent dispatch is not needed.',
  parameters: {
    type: 'object',
    properties: {
      model:  { type: 'string', description: 'Real, exact Ollama model tag (e.g. "huihui_ai/qwen2.5-coder-abliterate:7b"). Must already be pulled locally.' },
      prompt: { type: 'string', description: 'The real prompt to send to the local model.' },
    },
    required: ['model', 'prompt'],
  },
  async execute({ model, prompt }) {
    if (!model || typeof model !== 'string') return { ok: false, error: 'model required (a real, exact, already-pulled Ollama tag)' };
    if (!prompt || typeof prompt !== 'string') return { ok: false, error: 'prompt required' };
    try {
      const r = await _generate(model, prompt);
      if (r.error) return { ok: false, error: `ollama: ${r.error}` };
      return { ok: true, text: r.response || '', model: r.model || model, done: r.done !== false };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
