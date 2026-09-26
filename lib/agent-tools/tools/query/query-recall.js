'use strict';
/**
 * lib/agent-tools/tools/query-recall.js — query_recall tool
 * UUID: nexus-agent-tools-query-recall-v1-0000-2026-0710-jamesbrooks-001
 * Spec: docs/nexus-copilot-recall.spec chunk_1
 *
 * §RECALL CHUNK 1 — the deliberate "what did we discuss about X" path.
 * cortex /api/recall EXISTS (CortexPushRecall.recall) — copilot WROTE to
 * recall but never READ it. This tool is that read path, exposed to the
 * agent loop.
 *
 * §UPDATED 2026-07-12 — this honestly said "2 of 5 lanes are real,
 * causal/failure/bep need the kernel causal graph (absent)" when it was
 * written, and that was correct then. It isn't anymore: fix_map (failure),
 * bep_patterns + a real writer (bep), and the Causal Nexus kernel + a
 * causal-graph connectivity lookup (causal) were all built and tested this
 * session — see cortex/push-recall.js's own updated header for the real
 * mechanism behind each. All 5 lanes are real now. Per this spec's own
 * failure-mode clause ("do NOT claim 5-lane recall... a wire that pretends
 * it works is a lie") — this isn't loosening that rule, it's the rule
 * still holding: the claim changed because the underlying reality did,
 * confirmed by running the actual tests, not asserted.
 */

const http = require('http');

const CX_URL = () => process.env.CORTEX_URL || 'http://127.0.0.1:3748';

// All 7 named intents in cortex/push-recall.js's INTENT_LANES map now
// resolve to fully-real lanes (lexical, recency, failure, bep, causal —
// checked directly, none of the 7 mix in an unimplemented lane anymore).
// Kept as an explicit list rather than "anything goes" so a future intent
// added to INTENT_LANES without a matching real lane still degrades
// honestly here instead of silently being assumed real.
const REAL_INTENTS = ['general', 'session_resume', 'pattern_lookup', 'crystal_query', 'debug_failure', 'gap_fill', 'causal_trace'];

function _recall(intent, query, tier, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const body = Buffer.from(JSON.stringify({ intent, query, tier }));
      const u = new URL(CX_URL() + '/api/recall');
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }, timeout: timeoutMs }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ ok: false, error: `bad JSON: ${e.message}` }); } });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'cortex recall timeout' }); });
      req.on('error', e => resolve({ ok: false, error: `cortex unreachable: ${e.message}` }));
      req.write(body); req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

module.exports = {
  name: 'query_recall',
  description:
    'Search past conversations and stored memory for relevant context. Use when the user references something from before ("what did we decide about X", "the thing we discussed") or when past context would help. ' +
    'Params: query (required — what to search for), intent (optional: general|session_resume|pattern_lookup|crystal_query|debug_failure|gap_fill|causal_trace, default general). ' +
    'Returns ranked past exchanges. Recall uses lexical (word-overlap), recency, failure-pattern, BEP-pattern, and causal-graph-connectivity ranking — 5 real lanes, weighted per intent.',
  parameters: {
    type: 'object',
    properties: {
      query:  { type: 'string', description: 'What to search past conversations for (required)' },
      intent: { type: 'string', description: 'general (default) | session_resume | pattern_lookup | crystal_query | debug_failure | gap_fill | causal_trace' },
      tier:   { type: 'string', description: 'optional memory tier filter' },
    },
    required: ['query'],
  },
  execute: async ({ query, intent = 'general', tier = null } = {}) => {
    if (!query) return { error: 'query is required' };
    const useIntent = REAL_INTENTS.includes(intent) ? intent : 'general';
    const r = await _recall(useIntent, query, tier);
    if (!r.ok) return { error: r.error || 'recall failed' };
    return {
      ok: true,
      count: r.count || (r.results || []).length,
      results: (r.results || []).slice(0, 8),
      note: useIntent !== intent ? `intent "${intent}" is not a recognized recall intent; used "general" instead` : undefined,
    };
  },
};
