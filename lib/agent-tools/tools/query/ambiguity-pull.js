'use strict';
/**
 * lib/agent-tools/tools/query/ambiguity-pull.js — ambiguity_pull tool
 * UUID: nexus-tool-ambiguity-pull-v1-0000-2026-0814-jamesbrooks-001
 *
 * §BUILT 2026-08-14 — AM5 of docs/agent-model-and-user-continuity-
 * phasemap.spec, "mapped, not built" until now. depends_on: [] in that
 * phasemap on purpose — AP1's real pull toolbox + browser_action's real
 * navigate/dom_query are enough to build the mechanism without waiting
 * on AM1/AM4.
 *
 * The ordering IS the point (this phasemap's own stated `drift` risk):
 * cheap/internal before expensive/external, Perplexity before raw
 * browsing. This tool enforces that order in code, not just in a prompt
 * instruction an agent could skip.
 *
 * Real order, checked against what actually exists right now:
 *   1. cortex recall     — query_recall.js (real, wraps cortex /api/recall,
 *                          already covers chat-history per its recency lane —
 *                          AM5's "chat history" step folds into this one,
 *                          not a second call)
 *   2. loom-map           — loom_scan.js (real, "what component/system is this")
 *   3. AM1 agent_model     — HONEST GAP: AM1 itself is still mapped-not-built.
 *                          Skipped with an explicit note in the trace, not
 *                          silently omitted and not faked.
 *   4. Perplexity          — lifeline.route(query, {provider:'perplexity'}),
 *                          the real explicit-agent dispatch path this
 *                          session already confirmed works and carries
 *                          copilot's full tool set.
 *   5. browser_action       — real navigate/dom_query, only reached if
 *                          Perplexity itself errored or came back empty.
 *
 * Every step's outcome is written to component-ledger (§0.3 — "a pattern
 * of 'we always end up asking perplexity about X' becomes visible data,
 * not a repeated blind spot") AND returned in the trace, so a caller sees
 * exactly what was tried and in what order, not just the final answer.
 */
// §FIX 2026-08-14 — caught by actually running this against a sandbox with
// no live NCP channel: copilot/tool-runtime.js's real failure path (line
// 164) returns { text: '[NCP dispatch failed — no response]', ok:false }
// on a dead dispatch — but lifeline.route()'s outer shape wraps that as
// { ok:true, text: '[NCP dispatch failed...]' } once it exits the tool
// loop, so a plain !r.ok / non-empty-text check was fooled into treating
// a failure message as a real answer. Recognized explicitly now.
const NCP_FAILURE_SENTINEL = '[NCP dispatch failed';

function _found(result) {
  if (!result) return false;
  if (result.error) return false;
  if (Array.isArray(result.results) && result.results.length === 0) return false;
  if (Array.isArray(result.entries) && result.entries.length === 0) return false;
  return true;
}

function _perplexityFound(r) {
  if (!(r && r.ok && r.text && r.text.trim().length > 0)) return false;
  if (r.text.startsWith(NCP_FAILURE_SENTINEL)) return false;
  return true;
}

function _logStep(session, step, outcome, detail) {
  try {
    require('../../../component-ledger.js').write({
      system: 'copilot', component: 'ambiguity-pull', action: `pull.${step}`,
      status: outcome, session, detail,
    });
  } catch (_) { /* ledger unavailable — never block the pull on logging */ }
}

const ACTIONS = {
  resolve: async (a) => {
    if (!a.query) return { error: 'resolve needs query — what copilot is ambiguous about' };
    const session = a.session || `ambiguity-pull-${Date.now()}`;
    const trace = [];

    // 1 — cortex recall (folds in chat history via the recency lane)
    try {
      const qr = require('./query-recall.js');
      const r = await qr.execute({ intent: 'general', query: a.query, tier: 'user' });
      const found = _found(r);
      trace.push({ step: 'cortex_recall', found, result: found ? r : undefined });
      _logStep(session, 'cortex_recall', found ? 'found' : 'not_found', a.query);
      if (found) return { ok: true, resolvedAt: 'cortex_recall', answer: r, trace };
    } catch (e) { trace.push({ step: 'cortex_recall', found: false, error: e.message }); _logStep(session, 'cortex_recall', 'error', e.message); }

    // 2 — loom-map
    try {
      const ls = require('../diagnostic/loom-scan.js');
      const r = await ls.execute({ mode: 'capabilities' });
      const found = _found(r) && JSON.stringify(r).toLowerCase().includes(String(a.query).toLowerCase().split(' ')[0] || '');
      trace.push({ step: 'loom_map', found, result: found ? r : undefined });
      _logStep(session, 'loom_map', found ? 'found' : 'not_found', a.query);
      if (found) return { ok: true, resolvedAt: 'loom_map', answer: r, trace };
    } catch (e) { trace.push({ step: 'loom_map', found: false, error: e.message }); _logStep(session, 'loom_map', 'error', e.message); }

    // 3 — AM1 agent_model — HONEST GAP, not built yet
    trace.push({ step: 'agent_model', found: false, skipped: true, reason: 'AM1 (per-agent learned model) is mapped, not built — see docs/agent-model-and-user-continuity-phasemap.spec' });
    _logStep(session, 'agent_model', 'skipped_not_built', null);

    // 4 — Perplexity, real explicit-agent dispatch
    try {
      const lifeline = require('../../../../copilot/lifeline.js');
      const r = await lifeline.route(a.query, { provider: 'perplexity', requestId: session });
      const found = _perplexityFound(r);
      trace.push({ step: 'perplexity', found, result: found ? { text: r.text, confidence: r.confidence } : undefined });
      _logStep(session, 'perplexity', found ? 'found' : 'not_found', a.query);
      if (found) return { ok: true, resolvedAt: 'perplexity', answer: { text: r.text, confidence: r.confidence }, trace };
    } catch (e) { trace.push({ step: 'perplexity', found: false, error: e.message }); _logStep(session, 'perplexity', 'error', e.message); }

    // 5 — raw browser_action, final fallback
    if (a.allowBrowserFallback !== false) {
      try {
        const ba = require('../browser/browser-action.js');
        const r = await ba.execute({ action: 'navigate', url: a.fallbackUrl || `https://www.google.com/search?q=${encodeURIComponent(a.query)}` });
        const found = _found(r);
        trace.push({ step: 'browser_action', found, result: found ? r : undefined });
        _logStep(session, 'browser_action', found ? 'found' : 'not_found', a.query);
        if (found) return { ok: true, resolvedAt: 'browser_action', answer: r, trace };
      } catch (e) { trace.push({ step: 'browser_action', found: false, error: e.message }); _logStep(session, 'browser_action', 'error', e.message); }
    }

    return { ok: false, resolvedAt: null, error: 'exhausted every real pull without resolution', trace };
  },
};

module.exports = {
  name: 'ambiguity_pull',
  description:
    'Resolve something ambiguous by pulling in strict cheap-to-expensive order: cortex recall (incl. ' +
    'chat history) → loom-map → [agent_model, honestly skipped — not built yet] → Perplexity → raw ' +
    'browser search, only reaching each next step if the previous one came back empty or erroring. ' +
    'Returns the full trace of what was tried, not just the final answer — use "resolve" (needs query, ' +
    'optional session, optional allowBrowserFallback:false to stop before raw browsing).',
  parameters: {
    type: 'object',
    properties: {
      action:               { type: 'string', enum: Object.keys(ACTIONS) },
      query:                { type: 'string', description: 'the ambiguous thing to resolve' },
      session:              { type: 'string', description: 'optional — groups this pull\'s ledger entries' },
      allowBrowserFallback: { type: 'boolean', description: 'default true — set false to stop after Perplexity' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `ambiguity_pull ${args.action} failed: ${e.message}` }; }
  },
};
