'use strict';
/**
 * lib/agent-memory.js — an agent's memory is the Clear Glass download manager.
 * comp_id: nexus.lib.agent-memory
 * UUID: nexus-lib-agent-memory-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.269 — James: "ollama is supposed to have persistent memory, same with the agents using the models. like
 * theyre supposed to use the memory systems, chatlogs, nodes, etc for context, everything is supposed to persist
 * with agents. using the download manager." · "look at clearglass download manager"
 *
 * What was there: the download manager already is the durable record of agent exchanges — each Guardian reply goes
 * through guardian/lib/response-sink.js (a .response node, the ledger, Clear Glass's downloads list via
 * POST :7702/cli/downloads with a pending queue, SSE) and guardian/lib/code-artifact.js writes the raw
 * { prompt, response, agentId, provider, codeBlocks } into clear-glass/src/downloads/artifact-chat-index.js (its own
 * COS compartment; .response files are the source of truth, a JAA index over them). But:
 *   - only Guardian wrote to it — Ollama (bridge jobs, copilot's answers, the Agent tab on ollama, chunk builds on
 *     ollama) left nothing there;
 *   - nothing read it back as context — only the Library's Responses tab and the Agent tab's late-reply adoption did.
 *
 * This module is the one write path and the one read path, both over the download manager:
 *   record(exchange) — any backend: the same response-sink.deliver() Guardian uses (node + ledger + downloads list),
 *                      the same artifact-chat-index row shape, and a chat-logger line (JSONL + chat_log, embedded
 *                      for semantic search where vector memory runs). Guardian's own replies are already recorded
 *                      by Guardian; callers pass its agentId so they are filed under the agent that asked.
 *   recall(query)    — before a call: this agent's own recent exchanges from the download manager (ranked by the
 *                      words they share with the question, then recency), files already built in its compartment
 *                      (the chunk nodes the caller passes), and semantically related chat_log lines when vector
 *                      memory is up. One bounded block; each source is labelled; nothing is invented.
 *
 * Identity: agentId is who is remembering. `repo-<uuid>` for a repo's agent (the same id repo-agent.js and Guardian
 * already use), `spec-<uuid>` for a spec with no repo, `copilot` (or a copilot session) for copilot itself.
 */

const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.agent-memory';
const VERSION = '1.0.0';
const DEFAULT_BUDGET = parseInt(process.env.AGENT_MEMORY_BUDGET_CHARS || '3500', 10);
const GUARDIAN_PROVIDERS = () => { try { return require('./agent-providers.js').guardianProviders(); } catch (_) { return []; } };

function _index() { return require('../clear-glass/src/downloads/artifact-chat-index.js'); }
function _root() { return process.env.AGENT_MEMORY_ROOT || _index().defaultRoot(); }

/** agentIdFor({ repoUuid, specUuid, sessionId }) — who is remembering. */
function agentIdFor({ repoUuid = null, specUuid = null, sessionId = null } = {}) {
  if (repoUuid) return `repo-${repoUuid}`;
  if (specUuid) return `spec-${specUuid}`;
  if (sessionId) return `copilot-${sessionId}`;
  return 'copilot';
}

// ── write ────────────────────────────────────────────────────────────────────

/**
 * record({ agentId, provider, prompt, response, jobId, model, compartmentId, repoUuid, kind, path, source, intent })
 * -> Promise<{ ok, jobId, sinks: { deliver, index, chatlog } }>. Never throws.
 * Guardian providers are skipped unless `force` — Guardian records its own replies (with the agentId it was given).
 */
async function record(ex = {}) {
  const out = { ok: false, jobId: null, sinks: {} };
  try {
    const text = typeof ex.response === 'string' ? ex.response : '';
    if (!text.trim()) return { ...out, error: 'nothing to record — empty response' };
    const provider = ex.provider || 'ollama';
    if (!ex.force && GUARDIAN_PROVIDERS().includes(provider)) return { ...out, ok: true, skipped: 'guardian records its own replies' };
    const agentId = ex.agentId || 'copilot';
    const jobId = ex.jobId || `mem-${crypto.randomUUID()}`;
    out.jobId = jobId;

    // 1. the same four-sink delivery Guardian uses: .response node, ledger, Clear Glass downloads list (queued if closed)
    try {
      const sink = require('../guardian/lib/response-sink.js');
      const d = await sink.deliver({
        jobId, provider, text, status: 'complete', source: ex.source || MODULE_ID,
        agentId, compartmentId: ex.compartmentId || null, prompt: ex.prompt || null, command: ex.kind || 'ask',
        meta: { model: ex.model || null, repoUuid: ex.repoUuid || null, path: ex.path || null, intent: ex.intent || null },
      }, {});
      out.sinks.deliver = { ok: !!d.ok, node: d.sinks && d.sinks.node && d.sinks.node.ok, downloads: d.sinks && d.sinks.downloads && (d.sinks.downloads.ok || (d.sinks.downloads.queued ? 'queued' : false)) };
    } catch (e) { out.sinks.deliver = { ok: false, error: e.message }; }

    // 2. the chat/artifact index — the same raw shape guardian/lib/code-artifact.js writes, so readers need one parser
    try {
      let blocks = [];
      try { const x = require('./extract-code.js').extractCode(text, { allowMultiple: true }); if (x.ok) blocks = x.blocks; } catch (_) {}
      const r = _index().recordResponse(_root(), {
        kind: 'chat', provider, chatId: agentId, agentId, jobId,
        raw: {
          jobId, provider, agentId, command: ex.kind || 'ask', prompt: ex.prompt || null, response: text,
          model: ex.model || null, compartmentId: ex.compartmentId || null, repoUuid: ex.repoUuid || null,
          declaredFileName: ex.path || null, intent: ex.intent || null,
          codeBlockCount: blocks.length,
          codeBlocks: blocks.map(b => ({ index: b.index, syntax: b.lang || null, ext: b.ext || null, bytes: Buffer.byteLength(b.code, 'utf8'), code: b.code })),
          capturedBy: MODULE_ID,
        },
      });
      out.sinks.index = { ok: true, id: r.id, indexed: r.indexed };
    } catch (e) { out.sinks.index = { ok: false, error: e.message }; }

    // 3. chat-logger — chat_log + JSONL, embedded for semantic recall where vector memory runs
    try {
      const cl = require('./chat-logger.js');
      if (ex.prompt) await cl.log({ role: 'user', content: String(ex.prompt), provider, intent: ex.intent || null, jobId, agentId });
      await cl.log({ role: 'assistant', content: text, provider, intent: ex.intent || null, jobId, agentId });
      out.sinks.chatlog = { ok: true };
    } catch (e) { out.sinks.chatlog = { ok: false, error: e.message }; }

    out.ok = !!((out.sinks.deliver && out.sinks.deliver.ok) || (out.sinks.index && out.sinks.index.ok));
    return out;
  } catch (e) { return { ...out, error: e.message }; }
}

// ── read ─────────────────────────────────────────────────────────────────────

const STOP = new Set('the and for with that this from into your you are was were have has had not but all any can will what when where which who how why its it\'s file code output only one each real'.split(' '));
function _words(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z0-9_./-]{3,}/g)?.filter(w => !STOP.has(w)) || []);
}
function _overlap(a, b) { let n = 0; for (const w of a) if (b.has(w)) n++; return n; }
function _ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - (ts || now)) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function _firstLine(s, n = 140) {
  const line = String(s || '').split('\n').map(x => x.trim()).find(x => x && !/^\[|^---|^===/.test(x)) || '';
  return line.length > n ? line.slice(0, n - 1) + '…' : line;
}

/** _exchanges(agentId, limit) — this agent's own past exchanges from the download manager, newest first. */
function _exchanges(agentId, limit = 40) {
  const idx = _index();
  const root = _root();
  const rows = idx.queryItems(root, { agentId, kind: 'chat', limit });
  const out = [];
  for (const row of rows) {
    const it = idx.readItem(root, row.id);
    const raw = it && it.raw;
    if (!raw || typeof raw.response !== 'string') continue;   // transcripts (messages[]) and unreadable rows are not exchanges
    out.push({
      ts: it.captured_at || row.captured_at || 0, provider: raw.provider || it.provider || null,
      prompt: raw.prompt || '', response: raw.response, file: raw.declaredFileName || null,
      blocks: Array.isArray(raw.codeBlocks) ? raw.codeBlocks : [],
    });
  }
  return out;
}

function _summarise(ex) {
  const asked = _firstLine(ex.prompt.replace(/^[\s\S]*?(?:USER:|The question|Question:)\s*/i, ''), 120) || '(no prompt recorded)';
  let did;
  if (ex.blocks.length) {
    const b = ex.blocks[0];
    const lines = String(b.code || '').split('\n').length;
    did = `wrote ${ex.file || (b.ext ? `a ${b.ext} file` : 'code')} (${lines} lines${ex.blocks.length > 1 ? `, +${ex.blocks.length - 1} more block${ex.blocks.length > 2 ? 's' : ''}` : ''})`;
  } else did = `answered: ${_firstLine(ex.response, 160)}`;
  return `- ${_ago(ex.ts)}${ex.provider ? ` via ${ex.provider}` : ''}: asked "${asked}" → ${did}`;
}

/** _signature(content) — the lines of a file another file would wire to: exports, requires, top-level defs. */
function _signature(content, max = 6) {
  const keep = [];
  for (const l of String(content || '').split('\n')) {
    const t = l.trim();
    if (/^(export\s|module\.exports|exports\.|class\s|function\s|async function\s|def\s|const\s+\w+\s*=\s*require\(|import\s)/.test(t)) keep.push(t.length > 110 ? t.slice(0, 109) + '…' : t);
    if (keep.length >= max) break;
  }
  return keep;
}

/**
 * recall({ agentId, query, siblings, budget, semantic }) -> { text, sources, chars }
 *   siblings — [{ path, content }] files already built in this agent's compartment (chunk nodes), for wiring.
 * Never throws; a source that can't be read is named in `sources`, not faked.
 */
async function recall({ agentId = 'copilot', query = '', siblings = [], budget = DEFAULT_BUDGET, semantic = true } = {}) {
  const sources = {};
  const parts = [];
  const qw = _words(query);

  // 1. this agent's own exchanges — the download manager
  try {
    const all = _exchanges(agentId);
    sources.exchanges = all.length;
    const ranked = all.map((e, i) => ({ e, score: _overlap(qw, _words(e.prompt + ' ' + (e.file || ''))) * 3 + Math.max(0, 5 - i) }))
      .sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.e).sort((a, b) => b.ts - a.ts);
    if (ranked.length) parts.push({ head: `What you (${agentId}) have done before — from the download manager:`, lines: ranked.map(_summarise), cap: Math.round(budget * 0.45) });
  } catch (e) { sources.exchanges = `unreadable: ${e.message}`; }

  // 2. files already built here — the chunk nodes the caller knows about
  try {
    const sib = (siblings || []).filter(s => s && s.path && s.content);
    sources.siblings = sib.length;
    if (sib.length) {
      const ranked = sib.map(s => ({ s, score: _overlap(qw, _words(s.path + ' ' + _signature(s.content, 12).join(' '))) }))
        .sort((a, b) => b.score - a.score).slice(0, 10);
      const lines = [];
      for (const { s } of ranked) {
        const sig = _signature(s.content);
        lines.push(`- ${s.path}${sig.length ? '' : ' (no exports found)'}`);
        for (const x of sig) lines.push(`    ${x}`);
      }
      parts.push({ head: 'Files already built in this project (wire to these; do not redefine them):', lines, cap: Math.round(budget * 0.4) });
    }
  } catch (e) { sources.siblings = `unreadable: ${e.message}`; }

  // 3. related chat — chat_log through vector memory, only when it actually matched (no recency filler)
  if (semantic && query) {
    try {
      const vm = require('./vector-memory');
      const st = typeof vm.status === 'function' ? await vm.status() : null;
      if (st && (st.ready || st._ready || st.initialized)) {
        const { results = [] } = await vm.search(query, { k: 4, threshold: 0.72, filter: { table: { '$eq': 'chat_log' } } });
        sources.related = results.length;
        if (results.length) parts.push({ head: 'Related earlier conversation (semantic match):', lines: results.map(r => `- ${_firstLine(r.content || r.text || '', 180)}`), cap: Math.round(budget * 0.15) });
      } else sources.related = 'vector memory not running in this process';
    } catch (e) { sources.related = `unavailable: ${e.message}`; }
  }

  if (!parts.length) return { text: '', sources, chars: 0 };
  const out = ['[MEMORY — recalled for this request; use it, do not repeat it back]'];
  let used = out[0].length;
  for (const p of parts) {
    const block = [p.head];
    let n = p.head.length;
    for (const l of p.lines) { if (n + l.length + 1 > p.cap || used + n + l.length + 1 > budget) break; block.push(l); n += l.length + 1; }
    if (block.length > 1) { out.push(block.join('\n')); used += n; }
  }
  out.push('[END MEMORY]');
  const text = out.length > 2 ? out.join('\n\n') : '';
  return { text, sources, chars: text.length };
}

/**
 * search({ query, agentId, limit }) — 0.39.272. The download manager searched by words, across every agent (or one),
 * for lib/context-atlas.js: the same read path recall() uses (_exchanges → queryItems/readItem), no second reader.
 * Returns [{ agentId, ts, provider, prompt, summary, score }], best first; nothing matched → [].
 */
function search({ query = '', agentId = null, limit = 10, scan = 200 } = {}) {
  const qw = _words(query);
  if (!qw.size) return [];
  const idx = _index(), root = _root();
  const rows = idx.queryItems(root, { ...(agentId ? { agentId } : {}), kind: 'chat', limit: scan });
  const out = [];
  for (const row of rows) {
    const it = idx.readItem(root, row.id);
    const raw = it && it.raw;
    if (!raw || typeof raw.response !== 'string') continue;
    const ex = { ts: it.captured_at || row.captured_at || 0, provider: raw.provider || it.provider || null, prompt: raw.prompt || '', response: raw.response,
      file: raw.declaredFileName || null, blocks: Array.isArray(raw.codeBlocks) ? raw.codeBlocks : [] };
    const score = _overlap(qw, _words(ex.prompt + ' ' + ex.response.slice(0, 4000) + ' ' + (ex.file || '')));
    if (score) out.push({ id: row.id, agentId: raw.agentId || row.agentId || it.agentId || null, ts: ex.ts, provider: ex.provider, score, summary: _summarise(ex) });
  }
  return out.sort((a, b) => b.score - a.score || b.ts - a.ts).slice(0, limit);
}

module.exports = { record, recall, search, agentIdFor, _signature, _summarise, MODULE_ID, VERSION };
