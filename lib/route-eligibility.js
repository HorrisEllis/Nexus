'use strict';
/**
 * lib/route-eligibility.js — RT1: a route is two steps, eligibility then preference.
 * component_id: nexus.lib.route-eligibility
 * Map: docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec (RT1_eligibility_then_preference, folds RQ6)
 *
 * James (2026-10-14): "and we have intent routing? that way the complex reasoning can be done by the bigger models or
 * agents. like claude or deepseek?" · "yes we need to get it all working."
 *
 * Before this the door ordered every candidate by preference alone (the learned order, the reasoner first), so a
 * well-scored agent could be routed work it cannot do at all: browser work to a chat tab, a 60k-token packet to a 16k
 * Ollama window. Now the hard requirements come first. A candidate that fails one is removed and the reason is said; the
 * learned order then decides among the rest (lib/model-door.js route).
 *
 *   needsOf({ kind, message, needs, tokens }) → { tools[], tokens, from[] }  what the job requires, and where each came from
 *   factsOf(provider) → { tools[], contextTokens, source }                   what the agent can do, and who says so
 *   check(hops, needs, { ready }) → { eligible[], rejected[{ provider, requirement, why }] }
 *
 * Facts, from their owners — never a second table beside them:
 *   - a browser agent: its Guardian provider node (guardian/data/nodes/provider, GA1): `tools`, `contextTokens`.
 *   - ollama: the window Nexus gives it (lib/ollama-activity.js MAX, OLLAMA_NUM_CTX_MAX); text and code.
 *   - copilot: its registered tools (lib/agent-tools: browser_action, files, nexus commands).
 *   - claude-code: the tools its runs are allowed (lib/claude-code-backend.js argsFor: files, shell, the nexus MCP).
 * A fact that is not stated never removes an agent: unknown is eligible, and the hop says the fact is unknown.
 * Availability: a breaker already removes an agent (pipeline-routing plan, skipped[]); Guardian's readiness (0.60.28,
 * GET /api/providers/ready) removes one that cannot answer now. A browser tab that is not open is NOT removed — Clear
 * Glass opens it when a job needs it (0.60.25); byTabs only orders it later.
 */
const path = require('path');

const MODULE_ID = 'nexus.lib.route-eligibility';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');

// the tools vocabulary: what a job can require of the agent that runs it
const TOOLS = Object.freeze(['text', 'code', 'web', 'browser', 'files', 'shell', 'nexus']);

const _base = (id) => { const s = String(id || ''); const i = s.indexOf(':'); return i > 0 ? s.slice(0, i) : s; };

/** kinds that name a tool, as a whole ':' segment (agent:browser, page:research — never map:phase-files); files and
 *  shell are only ever asked for explicitly (needs.tools). The caller's own `needs` always wins over these. */
const KIND_TOOLS = [
  [/(^|:)(browser|clear-?glass|browse|navigate)(:|$)/i, 'browser'],
  [/(^|:)(research|web-search|web)(:|$)/i, 'web'],
];

/** needsOf → what this job requires: tools (explicit, else from its kind) and its size in tokens */
function needsOf({ kind = '', message = '', needs = null, tokens = null } = {}) {
  const from = [];
  const tools = new Set();
  const asked = needs && Array.isArray(needs.tools) ? needs.tools : (needs && typeof needs.tools === 'string' ? needs.tools.split(/[\s,]+/) : []);
  for (const t of asked.filter(Boolean)) { tools.add(String(t).toLowerCase()); from.push(`${t}: asked for`); }
  if (!asked.length) for (const [rx, t] of KIND_TOOLS) if (rx.test(String(kind || ''))) { tools.add(t); from.push(`${t}: the kind ${kind}`); }
  let size = Number((needs && needs.tokens) || tokens) || 0;
  if (size) from.push(`~${size} tokens: stated`);
  else if (message) { size = Math.ceil(String(message).length / 3.5); from.push(`~${size} tokens: the message`); }
  return { tools: [...tools].filter(t => TOOLS.includes(t)), unknownTools: [...tools].filter(t => !TOOLS.includes(t)), tokens: size || null, from };
}

let _nodeCache = null, _nodeAt = 0;
function _guardianFacts() {
  if (_nodeCache && Date.now() - _nodeAt < 5000) return _nodeCache;
  const out = {};
  try { for (const p of require(path.join(ROOT, 'guardian/lib/agent-facts.js')).list()) out[p.id] = p; } catch (_) { /* guardian not present: facts unknown */ }
  _nodeCache = out; _nodeAt = Date.now();
  return out;
}

/** factsOf(provider) → what it can do and how much it holds, with who says so; null fields are unknown */
function factsOf(provider) {
  const base = _base(provider);
  if (base === 'ollama' || base === 'mistral') {
    let max = null; try { max = require('./ollama-activity.js').MAX; } catch (_) { max = null; }
    return { tools: ['text', 'code'], contextTokens: max, source: 'the window Nexus gives Ollama (OLLAMA_NUM_CTX_MAX)' };
  }
  if (base === 'copilot' || base === 'auto') return { tools: ['text', 'code', 'browser', 'files', 'nexus'], contextTokens: null, source: 'copilot\'s registered tools (lib/agent-tools)' };
  if (base === 'claude-code') return { tools: ['text', 'code', 'files', 'shell', 'nexus'], contextTokens: 200000, source: 'its allowed tools (lib/claude-code-backend.js)' };
  const n = _guardianFacts()[base];
  if (n) return { tools: Array.isArray(n.tools) && n.tools.length ? n.tools : null, contextTokens: Number(n.contextTokens) || null, source: `Guardian's provider node (${base}.provider)` };
  return { tools: null, contextTokens: null, source: 'no facts stated' };
}

/**
 * check(hops, needs, { ready, facts }) — the hard requirements. hops: [{ provider, … }] in preference order (kept).
 * ready: Guardian's readiness map { <provider>: { ready, why } } (null: not asked — nothing removed for it).
 */
function check(hops = [], needs = {}, { ready = null, facts = factsOf } = {}) {
  const eligible = [], rejected = [];
  for (const h of hops) {
    const f = facts(h.provider) || {};
    const notes = [];
    let why = null, requirement = null;
    const missing = (needs.tools || []).filter(t => Array.isArray(f.tools) && !f.tools.includes(t));
    if (missing.length) { requirement = 'tools'; why = `cannot use ${missing.join(', ')} (it has ${f.tools.join(', ')} — ${f.source})`; }
    else if ((needs.tools || []).length && !Array.isArray(f.tools)) notes.push(`its tools are not stated (${f.source})`);
    if (!why && needs.tokens && f.contextTokens && needs.tokens > f.contextTokens) { requirement = 'context'; why = `~${needs.tokens} tokens does not fit its ${f.contextTokens}-token window (${f.source})`; }
    else if (!why && needs.tokens && !f.contextTokens) notes.push('its window is not stated');
    const r = ready && ready[_base(h.provider)];
    if (!why && r && r.ready === false) { requirement = 'availability'; why = `not ready: ${r.why || r.reason || 'Guardian says it cannot take a job now'}`; }
    if (why) rejected.push({ provider: h.provider, requirement, why });
    else eligible.push(notes.length ? { ...h, eligibility: notes.join('; ') } : h);
  }
  return { eligible, rejected };
}

module.exports = { MODULE_ID, VERSION, TOOLS, needsOf, factsOf, check };
