'use strict';
/**
 * ollama/routes/generate.js — POST /api/generate: one model call through the bridge, answered when it is done.
 * 0.60.241 LM1 (docs/2026-10-24-loom-into-cos-phasemap.spec LM_D1). James, 2026-10-07: "make sure the ollama additions stay with ollama".
 * The one door (OR1, ollama/lib/ollama-client.js callOllamaRaw: continued when cut, recorded on the tape) for a system that is not the
 * bridge: it used to require ollama-client in its own process, which a COS compartment cannot. lib/ollama-port.js calls this.
 *   body { model, prompt, system?, temperature?, maxTokens?, timeoutMs?, caller }  →  { ok, text } | { ok: false, error }
 * caller is required: the tape and the activity log name who asked (RC6's rule for jobs, §1.2).
 */
const { json, readBody } = require('../lib/http-utils.js');
const { state } = require('../lib/state.js');
const { callOllamaRaw } = require('../lib/ollama-client.js');

async function handle(req, res, { method, pathname }) {
  if (!(method === 'POST' && pathname === '/api/generate')) return false;
  const b = await readBody(req);
  if (!b || !b.prompt) { json(res, 400, { ok: false, error: 'prompt required' }); return true; }
  if (!b.caller) { json(res, 400, { ok: false, error: 'caller required: the tape names who asked' }); return true; }
  if (!state.ollamaOnline) { json(res, 503, { ok: false, error: 'Ollama host unreachable' }); return true; }
  try {
    const text = await callOllamaRaw(b.model || state.defaultModel, String(b.prompt), b.maxTokens || null, Math.min(parseInt(b.timeoutMs, 10) || 120000, 600000),
      String(b.caller), { ...(b.system ? { system: String(b.system) } : {}), ...(b.temperature != null ? { temperature: Number(b.temperature) } : {}) });
    json(res, 200, { ok: true, text: String(text || '') });
  } catch (e) { json(res, 502, { ok: false, error: e.message, code: e.code || null }); }
  return true;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'POST', path: '/api/generate', description: 'one model call through the bridge (continued when cut, on the tape); body { model, prompt, system, temperature, caller }' },
];
