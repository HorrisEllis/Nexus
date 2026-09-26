'use strict';
/**
 * lib/agent-tools/tools/nexus-help.js — "ask co-pilot anything about NEXUS."
 * comp_id: nexus.lib.agent-tools.tools.nexus-help
 * UUID: nexus-tool-nexus-help-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P11 of docs/copilot-full-capability-phasemap.spec).
 * copilot/lib/nexus-awareness.js — systemRundown/whatsWrong/answerAbout — is
 * complete and real, but was reachable ONLY as an HTTP-path intent-classifier
 * shortcut inside copilot/server.js (~line 1091), never from the agentic tool
 * loop itself. nexus_status (loom concerns/impact) does not include it either
 * — checked its real ACTIONS keys directly before concluding that. This tool
 * is the wrap (§16.5, no new awareness logic) plus the one genuinely new
 * piece: docs/spec full-text search, which did not exist anywhere.
 */
const fs = require('fs');
const path = require('path');
const DOCS = path.resolve(__dirname, '../../../../docs');

const na = require('../../../../copilot/lib/nexus-awareness.js');

function _excerpt(content, query, contextChars = 150) {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(content.length, idx + query.length + contextChars);
  return (start > 0 ? '…' : '') + content.slice(start, end).replace(/\s+/g, ' ').trim() + (end < content.length ? '…' : '');
}

const ACTIONS = {
  rundown:  async () => ({ ok: true, ...na.systemRundown({}) }),
  diagnose: async (a) => ({ ok: true, ...(await na.whatsWrong({ findings: a.findings || [] })) }),
  ask:      async (a) => {
    if (!a.prompt) return { error: 'ask needs prompt' };
    const r = await na.answerAbout(a.prompt, {});
    return r ? { ok: true, ...r } : { ok: false, reason: 'not a recognized NEXUS-state question — try rundown/diagnose directly, or search_docs' };
  },
  // §NEW 2026-08-12 — did not exist anywhere: docs/*.spec and docs/*.md were
  // readable only by a human or by loom's own narrow phasemap/spec-map
  // scanners, never as free-text "explain X" lookups. Excerpt-only, never
  // the whole file (§1.2 — grounded in what's actually found, not a
  // fabricated summary of a doc that doesn't cover something).
  search_docs: (a) => {
    if (!a.query) return { error: 'search_docs needs query' };
    const files = fs.readdirSync(DOCS).filter(f => f.endsWith('.spec') || f.endsWith('.md'));
    const hits = [];
    for (const f of files) {
      let content;
      try { content = fs.readFileSync(path.join(DOCS, f), 'utf8'); } catch (_) { continue; }
      const excerpt = _excerpt(content, a.query);
      if (excerpt) hits.push({ file: f, excerpt });
      if (hits.length >= (a.limit || 10)) break;
    }
    return { ok: true, filesSearched: files.length, matches: hits.length, hits };
  },
};

module.exports = {
  name: 'nexus_help',
  description:
    'Ask anything about NEXUS itself — the system, not the user\'s task. Actions: "rundown" (capability ' +
    'count, versions, live coverage, declared-vs-served — the full current-state picture), "diagnose" ' +
    '(real findings from the diagnostic causal layer, optionally pass findings: gaps already known), ' +
    '"ask" (routes a NEXUS-state question like "what\'s wrong" or "system status" to the right real ' +
    'source; returns ok:false if the prompt isn\'t actually a NEXUS-state question), "search_docs" ' +
    '(full-text search over docs/*.spec and docs/*.md, returns file + excerpt, never the whole file). ' +
    'Use search_docs when the question is about how a specific subsystem or tool works in depth.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS) },
      prompt:   { type: 'string', description: 'for "ask" — the question' },
      findings: { type: 'array', description: 'for "diagnose" — known gaps to diagnose against, optional' },
      query:    { type: 'string', description: 'for "search_docs" — text to find' },
      limit:    { type: 'number', description: 'for "search_docs" — max files with a match (default 10)' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `nexus_help ${args.action} failed: ${e.message}` }; }
  },
};
