'use strict';
/**
 * lib/ollama-check.js — CT4 (docs/2026-10-05-code-tab-and-one-router-phasemap.spec), 0.39.350.
 * UUID: nexus-lib-ollama-check-v1-0000-2026-1005-jamesbrooks-001
 *
 * James: "make sure ollama is all wired into idearium."
 *
 * Proven here against a stand-in bridge; on his machine, by this check: every installed Ollama model asked a one-line
 * question THROUGH COPILOT (the same /api/prompt every caller uses, backend ollama, the model named), and every caller
 * idearium has asked copilot's door how it would route — which model answers first, whether Ollama is in its route at
 * all, whether the model it names is installed. Nothing is guessed: a bridge or copilot that does not answer is said.
 * A probe is not a job, so its outcomes are not sent to the door's learning.
 *
 *   CALLERS                         every place idearium asks for a model, with the job kind it sends to the door
 *   routes({ route, installed, defaultProvider }) → [{ id, label, kind, ok, error, answers, ollamaHops, problems }]
 *   ask({ model, post }) → { ok, model, text, ms, error }
 * route(kind, preferAgent) → { ok, route:[hops], error } and post(payload) → { status, json } are given by the caller
 * (idearium/api: copilot's /api/route and /api/prompt), so this file holds no URLs and no I/O of its own.
 */
const MODULE_ID = 'nexus.lib.ollama-check';
const VERSION = '1.0.0';
const PROBE = 'Reply with the single word: ready';

// preferAgent 'default' = the person's default provider (what _agentAsk and the build send); null = the copilot position
const CALLERS = Object.freeze([
  { id: 'void', label: 'the void', kind: 'page:void', prefer: 'default' },
  { id: 'workshop', label: 'the spec workshop', kind: 'page:workshop', prefer: 'default' },
  { id: 'architect', label: 'the architect', kind: 'page:architect', prefer: 'default' },
  { id: 'deliver', label: 'deliver', kind: 'page:deliver', prefer: 'default' },
  { id: 'agent', label: 'a repo agent (copilot decides)', kind: 'agent:chat', prefer: null },
  { id: 'agent-ollama', label: 'a repo agent on Ollama, no model picked', kind: 'agent:chat', prefer: 'ollama' },
  { id: 'build-spec', label: 'the spec build: a section', kind: 'build:overview', prefer: 'default' },
  { id: 'build-code', label: 'the build: a code file', kind: 'build:file.js', prefer: 'default' },
]);

async function routes({ route, installed = null, defaultProvider = null } = {}) {
  const have = Array.isArray(installed) ? new Set(installed) : null;
  const out = [];
  for (const c of CALLERS) {
    const prefer = c.prefer === 'default' ? defaultProvider : c.prefer;
    let r;
    try { r = await route(c.kind, prefer); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok || !Array.isArray(r.route) || !r.route.length) {
      out.push({ ...c, preferAgent: prefer, ok: false, error: (r && r.error) || 'copilot gave no route', answers: null, ollamaHops: [], problems: ['copilot did not route it — nothing reaches a model through the door'] });
      continue;
    }
    const hops = r.route;
    const ollamaHops = hops.filter(h => h.backend === 'ollama').map(h => ({ provider: h.provider, model: h.model || null, installed: h.model && have ? have.has(h.model) : null }));
    const problems = [];
    if (!ollamaHops.length) problems.push(`Ollama is not in its route (${hops.map(h => h.provider).join(' → ')})`);
    for (const h of ollamaHops) {
      if (!h.model) problems.push('an Ollama hop names no model — the bridge\'s default answers');
      else if (h.installed === false) problems.push(`${h.model} is not installed`);
    }
    const f = hops[0];
    out.push({ ...c, preferAgent: prefer, ok: true, error: null, answers: { provider: f.provider, backend: f.backend, model: f.model || null, why: f.why || null }, route: hops.map(h => h.provider), ollamaHops, problems });
  }
  return out;
}

async function ask({ model, post, timeoutMs = 120000 } = {}) {
  if (!model) return { ok: false, model: null, error: 'model is required' };
  const t0 = Date.now();
  let r;
  try { r = await post({ prompt: PROBE, backend: 'ollama', model, channel: 'idearium-ollama-check', sessionId: 'ollama-check', timeoutMs }); }
  catch (e) { return { ok: false, model, ms: Date.now() - t0, error: e.message }; }
  const j = (r && r.json) || {};
  const text = typeof j.text === 'string' ? j.text.trim() : '';
  const ok = !!(r && r.status > 0 && r.status < 400 && j.ok !== false && text);
  return { ok, model, ms: Date.now() - t0, text: text.slice(0, 120) || null,
    error: ok ? null : (j.error || (r && r.status ? `copilot answered ${r.status}${text ? '' : ' with no text'}` : 'copilot did not answer')),
    ...(j.model && j.model !== model ? { answeredBy: j.model, note: `asked ${model}, ${j.model} answered` } : {}) };
}

module.exports = { MODULE_ID, VERSION, PROBE, CALLERS, routes, ask };
