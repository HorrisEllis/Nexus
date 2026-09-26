'use strict';
/**
 * lib/agent-tools/tools/agent-chat-search.js — "do you remember when we
 * talked about X" / "do you remember when I talked to Y about X".
 * comp_id: nexus.lib.agent-tools.tools.agent-chat-search
 * UUID: nexus-tool-agent-chat-search-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P1 of docs/copilot-full-capability-phasemap.spec).
 *
 * §WHY A NEW TOOL, NOT AN EXTENSION OF query_recall — checked before
 * building: cortex/push-recall.js's CortexPushRecall.recall() is a real,
 * tested, tunable-weighted multi-lane scoring engine (lexical/recency/
 * failure/bep/causal) over ONE unified store, with no participant/provider
 * axis anywhere in its shape. Bolting cross-table, cross-provider filtering
 * onto that pinned engine would either (a) change what its 7 existing
 * intents mean, or (b) require threading a new axis through every lane's
 * scoring math untested. Smaller and safer: a separate, simple keyword
 * search directly over the two REAL tables this actually needs — chat_log
 * (copilot's own conversations, keyed by `agent`) and guardian_chat_log
 * (other providers' conversations, keyed by `provider`: claude/chatgpt/
 * ollama/gemini/mistral, confirmed live in this session's own data). No
 * scoring model, no tunable weights — literal substring match over
 * prompt+response, newest first. §16.5 — this is new because nothing else
 * in the tree does this, not a duplicate of push-recall's real job.
 */

function _jaa() { return require('../../../../cortex/memory/jaa-db').jaaDB; }

function _search(rows, query, textFields) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter(r => textFields.some(f => String(r[f] || '').toLowerCase().includes(q)));
}

function _trim(row, fields, maxLen = 300) {
  const out = {};
  for (const f of fields) {
    if (row[f] == null) continue;
    out[f] = typeof row[f] === 'string' && row[f].length > maxLen ? row[f].slice(0, maxLen) + '…' : row[f];
  }
  return out;
}

const ACTIONS = {
  search: (a) => {
    if (!a.query) return { error: 'search needs query — what to look for' };
    const scope = a.scope || 'all';
    const limit = a.limit || 10;
    let results = [];

    if (scope === 'mine' || scope === 'all') {
      let mine = _jaa().query('chat_log', () => true);
      if (a.withAgent) mine = mine.filter(r => r.agent === a.withAgent);
      mine = _search(mine, a.query, ['prompt', 'response']);
      results.push(...mine.map(r => ({ source: 'chat_log', with: r.agent, ts: r.ts, ..._trim(r, ['prompt', 'response']) })));
    }
    if (scope === 'agents' || scope === 'all') {
      let agents = _jaa().query('guardian_chat_log', () => true);
      if (a.withAgent) agents = agents.filter(r => r.provider === a.withAgent);
      agents = _search(agents, a.query, ['prompt', 'response']);
      results.push(...agents.map(r => ({ source: 'guardian_chat_log', with: r.provider, ts: r.ts, ..._trim(r, ['prompt', 'response']) })));

      // §FOUND 2026-08-12, tracing the claude/chatgpt-console dispatch-fail bug —
      // guardian_chat_log has NO current writer anywhere in the tree (its 168
      // rows are from a since-removed write path). The REAL live path for
      // guardian-routed (NCP) conversations is chat_log with source:'ncp'
      // (guardian/server.js, jaa.insert('chat_log', ...)) — confirmed live:
      // 0 of chat_log's 253 rows had source:'ncp' before this session's fix
      // to the consoles' RAID contract denial, meaning this branch was
      // querying a table nothing had written to in a long time. Both queried
      // now so "agents" scope doesn't silently miss the real data.
      let ncpInChatLog = _jaa().query('chat_log', r => r.source === 'ncp');
      if (a.withAgent) ncpInChatLog = ncpInChatLog.filter(r => r.provider === a.withAgent);
      ncpInChatLog = _search(ncpInChatLog, a.query, ['prompt', 'response']);
      results.push(...ncpInChatLog.map(r => ({ source: 'chat_log(ncp)', with: r.provider, ts: r.ts, ..._trim(r, ['prompt', 'response']) })));
    }

    results.sort((x, y) => (y.ts || 0) - (x.ts || 0));
    return { ok: true, total: results.length, results: results.slice(0, limit) };
  },
  providers: () => {
    const agents = _jaa().query('guardian_chat_log', () => true);
    const mine = _jaa().query('chat_log', () => true);
    return {
      ok: true,
      copilotOwn: [...new Set(mine.map(r => r.agent).filter(Boolean))],
      guardianRouted: [...new Set(agents.map(r => r.provider).filter(Boolean))],
    };
  },
};

module.exports = {
  name: 'agent_chat_search',
  description:
    '"Do you remember when we talked about X" or "do you remember when I talked to Y about X" — plain ' +
    'keyword search across real conversation logs, newest first. Actions: "search" (needs query; scope: ' +
    '"mine" for copilot\'s own conversations [chat_log], "agents" for other providers routed through ' +
    'guardian [guardian_chat_log], "all" for both — default all; withAgent filters to one provider name, ' +
    'e.g. "claude"/"ollama"/"chatgpt"), "providers" (lists which agent/provider names actually appear in ' +
    'the real data, so you know what\'s valid for withAgent). Literal substring match, not semantic — ' +
    'no scoring model, exactly what\'s there.',
  parameters: {
    type: 'object',
    properties: {
      action:    { type: 'string', enum: Object.keys(ACTIONS) },
      query:     { type: 'string', description: 'for "search" — text to look for in prompt/response' },
      scope:     { type: 'string', enum: ['mine', 'agents', 'all'], description: 'for "search" — default all' },
      withAgent: { type: 'string', description: 'for "search" — filter to one agent/provider name' },
      limit:     { type: 'number', description: 'for "search" — max results (default 10)' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `agent_chat_search ${args.action} failed: ${e.message}` }; }
  },
};
