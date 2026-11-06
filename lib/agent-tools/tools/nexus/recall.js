'use strict';
/**
 * lib/agent-tools/tools/nexus/recall.js — nexus.recall.tool: what just happened, in one read, for an agent's context and memory (RC1, 0.60.261)
 * comp_id: nexus.agent-tools.nexus.recall
 * Map: docs/2026-10-26-recall-tool-phasemap.spec
 *
 * James, 2026-10-26: "what if we have a tool for the agents to capture the recent event ledger or orchastrator? using the .response nodes,
 * chat ledgers for the repo, and log for context. for persistent memory?" · then: "make the tool."
 *
 * One call gathers what already exists (§8.6), each through its owner's door, never another system's files:
 *   activity   Idearium GET /api/activity — the event ledger every system writes (who did what, ok or failed)
 *   runs       Idearium GET /api/repos/:uuid/runs — a repo's phase runs (with repo)
 *   ledger     Idearium GET /api/ledger/out — what went to the orchestrator's ledger
 *   responses  Guardian GET /api/responses/recent — the newest .response nodes (agents' replies)
 *   chats      Clear Glass /cli/downloads/ledgers — the chat ledgers (lib/chat-ledger-client.js)
 *   log        lib/nexus-read.js tailLog — the end of a Nexus log, keys redacted
 * Each source says ok, or why not (unreachable, refused): nothing is silently empty (§1.2). The whole answer fits `budget` characters
 * (default 6000), so an agent reads a compact projection, not a dump (his leverage rule).
 */
const http = require('http');
const { toolName } = require('../../naming.js');

const SOURCES = ['activity', 'runs', 'ledger', 'responses', 'chats', 'log'];
// _call answers { error } when Idearium is down or refuses; a reader turns that into a said 'not read'
const _idearium = async (m, p) => { const d = await require('../idearium/code.js')._call(m, p, null, 8000); if (d && d.error && !d.rows && !d.runs) throw new Error(d.error); return d || {}; };
function _guardian(p, timeoutMs = 4000) {
  const port = parseInt(process.env.GUARDIAN_PORT || '7820', 10);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: process.env.GUARDIAN_HOST || '127.0.0.1', port, path: p, method: 'GET', timeout: timeoutMs }, (res) => {
      let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`Guardian answered ${res.statusCode}, not JSON`)); } });
    });
    req.on('timeout', () => req.destroy(new Error('Guardian did not answer in time'))); req.on('error', reject); req.end();
  });
}
const _q = (o) => { const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString(); return s ? `?${s}` : ''; };
const _cut = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// each reader → { ok, items: [line strings] } | { ok:false, why }
const READ = {
  async activity(a) {
    const qs = _q({ limit: a.limit, q: a.grep, status: a.failedOnly ? 'failed' : null });
    const d = await _idearium('GET', a.repo ? `/api/repos/${encodeURIComponent(a.repo)}/activity${qs}` : `/api/activity${qs}`);
    const rows = d.rows || d.activity || d.items || [];
    return { ok: true, items: rows.slice(0, a.limit).map(r => `${(r.ts ? new Date(r.ts).toISOString().slice(5, 16) : '')} ${r.status || ''} ${r.kind || ''} ${r.actor || ''} — ${_cut(r.title || r.summary || '', 140)}`.trim()) };
  },
  async runs(a) {
    if (!a.repo) return { ok: false, why: 'needs repo (a repo uuid)' };
    const d = await _idearium('GET', `/api/repos/${encodeURIComponent(a.repo)}/runs${_q({ limit: a.limit })}`);
    const rows = d.runs || d.items || (Array.isArray(d) ? d : []);
    return { ok: true, items: rows.slice(0, a.limit).map(r => `${r.runId || r.id || ''} ${r.status || r.state || ''} ${r.provider || ''} — ${_cut(r.goal || r.phase || '', 140)}${r.error ? ` · ${_cut(r.error, 100)}` : ''}`.trim()) };
  },
  async ledger(a) {
    const d = await _idearium('GET', '/api/ledger/out');
    return { ok: true, items: [`to ${d.target || 'the orchestrator'}: sent ${d.sent || 0} · buffered ${d.buffered || 0} · failed ${d.failed || 0} · drained ${d.drained || 0}${d.lastType ? ` · last ${d.lastType}${d.lastAt ? ` at ${new Date(d.lastAt).toISOString().slice(5, 16)}` : ''}` : ''}${d.lastError ? ` · last error: ${_cut(d.lastError, 120)}` : ''}`] };
  },
  async responses(a) {
    const d = await _guardian(`/api/responses/recent${_q({ limit: a.limit, agent: a.agent, repo: a.repo, chars: Math.min(400, Math.floor(a.budget / 8)) })}`);
    if (!d.ok) return { ok: false, why: d.error || 'Guardian refused' };
    return { ok: true, items: (d.responses || []).map(r => `${r.at.slice(5, 16)} ${r.provider || '?'} ${r.status || ''} ${r.kind || ''}${r.run ? ` run ${_cut(r.run, 40)}` : ''} (${r.chars} ch): ${_cut(r.text, 300)}`), ...(d.unreadable ? { said: `${d.unreadable} node(s) unreadable` } : {}) };
  },
  async chats(a) {
    const l = await require('../../../chat-ledger-client.js').list({ agentId: a.agent || null, limit: Math.min(a.limit, 10) });
    if (l === null) return { ok: false, why: 'Clear Glass not reachable (:7702)' };
    return { ok: true, items: l.map(c => `${c.provider || ''} ${c.agentId || ''} ${c.turns != null ? `${c.turns} turns` : ''}${c.generating ? ' (generating)' : ''} ${c.url || c.chatKey || ''}`.trim()) };
  },
  async log(a) {
    const r = require('../../../nexus-read.js').tailLog(a.log || 'errors', { lines: Math.min(a.limit * 3, 120), grep: a.grep || undefined });
    if (!r || r.ok === false || r.error) return { ok: false, why: (r && r.error) || 'log not readable' };
    return { ok: true, items: String(r.text || '').split('\n').filter(Boolean).slice(-a.limit * 2).map(l => _cut(l, 200)) };
  },
};

/** recall(args) → { ok, at, sources: { name: { ok, items | why } }, text } — text is the whole answer as lines, within budget */
async function recall(args = {}) {
  const a = { limit: Math.max(1, Math.min(Number(args.limit) || 8, 50)), budget: Math.max(1000, Math.min(Number(args.budget) || 6000, 30000)),
    repo: args.repo || null, agent: args.agent || null, grep: args.grep || null, log: args.log || 'errors', failedOnly: args.failedOnly === true };
  const want = (Array.isArray(args.sources) && args.sources.length ? args.sources : SOURCES).filter(s => SOURCES.includes(s));
  const sources = {};
  await Promise.all(want.map(async (s) => { try { sources[s] = await READ[s](a); } catch (e) { sources[s] = { ok: false, why: e.message }; } }));
  const lines = [];
  for (const s of want) {
    const r = sources[s];
    lines.push(`## ${s}${r.ok ? ` (${r.items.length})` : ` — not read: ${r.why}`}${r.said ? ` · ${r.said}` : ''}`);
    if (r.ok) lines.push(...r.items.map(i => `- ${i}`));
  }
  let text = lines.join('\n');
  const cut = text.length > a.budget;
  if (cut) text = `${text.slice(0, a.budget - 60)}\n… (cut to the ${a.budget}-character budget: ask one source, or a smaller limit)`;
  return { ok: Object.values(sources).some(r => r.ok), at: new Date().toISOString(), sources, text, cut };
}

module.exports = {
  name: toolName('nexus', 'recall'),
  description:
    'Recall what just happened in Nexus, in one compact read, for context and memory: the event ledger (activity), a repo\'s phase runs, ' +
    'what went to the orchestrator\'s ledger, the newest agent replies (.response nodes), the chat ledgers, and the end of a log. ' +
    'Each source through its own system\'s route; each says ok or why not. Use it before asking the person what happened, and to pick up ' +
    'where a run left off. Params: sources (subset of activity, runs, ledger, responses, chats, log), repo (uuid), agent, grep, log ' +
    '(errors | autopilot | <path>.log), failedOnly, limit (per source, default 8), budget (characters, default 6000).',
  parameters: {
    type: 'object',
    properties: {
      sources: { type: 'array', items: { type: 'string', enum: SOURCES } },
      repo: { type: 'string' }, agent: { type: 'string' }, grep: { type: 'string' }, log: { type: 'string' },
      failedOnly: { type: 'boolean' }, limit: { type: 'number' }, budget: { type: 'number' },
    },
  },
  async execute(a = {}) { try { return await recall(a); } catch (e) { return { ok: false, error: `recall failed: ${e.message}` }; } },
  recall, READ, SOURCES,
};
