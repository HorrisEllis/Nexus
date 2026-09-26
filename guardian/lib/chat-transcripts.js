'use strict';
/**
 * guardian/lib/chat-transcripts.js — every provider chat, logged into Clear
 * Glass's downloads index as one versioned transcript per chat.
 * comp_id: nexus.guardian.chat-transcripts
 *
 * §BUILT 0.39.254 — James: "we were working on getting the download manager
 * logging agent chats." Asked, he chose: a full-transcript sync; one record per
 * chat, versioned; every provider chat including the userscripts in his own
 * browser — "i want nexus to help remember. persistent memory for ai agents."
 *
 * §WHY NOT THE JOB PATH — until now a chat reached the index only through a job
 * COMPLETING (ncp-handler → response-sink / code-artifact recordAgentResponse).
 * The live log for 0.39.253 shows four ChatGPT jobs, none completed (reply
 * detection is the open break), and zero .response nodes on disk. A chat James
 * opens by hand never completes a job at all. The transcript is read from the
 * page itself (each userscript's _nexusGetFullChat, the same reader
 * GUARDIAN_SYNC_REQUEST uses), so it does not depend on reply detection.
 *
 * §TWO WAYS IN, ONE WRITER
 *   GUARDIAN_TRANSCRIPT  — pushed by a userscript when its chat settles (no DOM
 *                          change for a few seconds) and its transcript changed.
 *   GUARDIAN_SYNC_RESULT — every /sync pull (lib/chat-sync.js) is recorded too.
 * Both go through record() → artifact-chat-index.recordChat(), which refuses
 * unchanged and contained-in-latest reads, so a double report is harmless.
 *
 * §WHOSE CHAT — agentId, first found of:
 *   1. the tab's own stamp (window.__NEXUS_AGENT_ID, sent as msg.agentId);
 *   2. the guardian job that ran in this chat — learned from guardian.job.progress,
 *      which carries the job's chat URL, and the job's own agentId;
 *   3. whatever the chat was already filed under (recordChat keeps it).
 * A chat none of these name is James's own, filed with no agent.
 *
 * §READ SIDE — GET /api/chats, /api/chats/versions, /api/chats/item/:id. This is
 * what an agent (or co-pilot, or idearium) reads to remember.
 */

const MODULE_ID = 'guardian/chat-transcripts';
const VERSION = '1.2.0';   // 0.39.259 — each agent's chat is remembered (chatFor) so its next job continues that conversation

const _payload = (d) => (d && d.data && typeof d.data === 'object' ? d.data : d) || {};

/** The chat part of a URL, the key both a job's chatUrl and a transcript's url reduce to. */
function chatPathOf(url) {
  try { const u = new URL(url); return `${u.host}${decodeURIComponent(u.pathname).replace(/\/+$/, '')}`; }
  catch (_) { return null; }
}

const _norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * resumableChatUrl(provider, url) -> the URL when it names one real, finished chat
 * of that provider, else null. 0.39.259 — James: "persistent chaturl". Only a chat
 * that has its own permanent id can be returned to: ChatGPT's /c/<id> (not the
 * /c/WEB:<tmp> it shows for the first seconds of a new chat), Claude's /chat/<id>.
 * Home, /new, and every other provider return null (their URL shapes are not
 * verified here, so they keep today's behaviour: the job runs where the tab is).
 */
const RESUMABLE = {
  chatgpt: { host: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, path: /^\/c\/[A-Za-z0-9-]+$/ },
  claude:  { host: /(^|\.)claude\.ai$/,                             path: /^\/chat\/[A-Za-z0-9-]+$/ },
};
function resumableChatUrl(provider, url) {
  const rule = RESUMABLE[provider];
  if (!rule || !url) return null;
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname).replace(/\/+$/, '');
    return rule.host.test(u.hostname) && rule.path.test(p) ? `${u.origin}${p}` : null;
  } catch (_) { return null; }
}

/**
 * matchJobs(messages, candidates) — which guardian job each user turn of a chat
 * was. 0.39.255: a chat's URL cannot say (ChatGPT answers a job at /c/WEB:<tmp>
 * and files the chat at /c/<real id> seconds later — James's 0.39.254 log), but
 * the turn's own text can: the userscript types the job's prompt verbatim, with
 * the tools preamble and a hat line before it and the agent hint after. So a user
 * turn is a job's when it contains the job's whole prompt (whitespace-normalized),
 * or — for a very long prompt the page may render differently — its first 300 and
 * last 150 characters. Newest job first, each claiming the LAST unclaimed turn it
 * matches, so a prompt sent twice maps job-to-turn in order.
 * -> [{ job, index, reply }] — reply = the assistant turn right after, or null.
 */
function matchJobs(messages, candidates) {
  const msgs = Array.isArray(messages) ? messages : [];
  const users = msgs.map((m, i) => ({ i, t: m && m.role === 'user' ? _norm(m.text) : null })).filter(u => u.t);
  const taken = new Set();
  const out = [];
  for (const job of [...candidates].sort((a, b) => (b.ts || 0) - (a.ts || 0))) {
    const p = _norm(job.prompt);
    if (p.length < 8) continue;                         // "hi" matches everything; not evidence
    const head = p.slice(0, 300), tail = p.slice(-150);
    for (let k = users.length - 1; k >= 0; k--) {
      const u = users[k];
      if (taken.has(u.i)) continue;
      if (u.t.includes(p) || (p.length > 450 && u.t.includes(head) && u.t.includes(tail))) {
        taken.add(u.i);
        const next = msgs[u.i + 1];
        out.push({ job, index: u.i, reply: next && next.role === 'assistant' && _norm(next.text) ? next.text : null });
        break;
      }
    }
  }
  return out;
}

function createChatTranscripts({ bus, jobs, ncp, complete, rootFn, index, log = console, jobWindowMs = 6 * 3600e3 } = {}) {
  const idx = index || require('../../clear-glass/src/downloads/artifact-chat-index.js');
  const root = rootFn || (() => idx.defaultRoot());
  const _agentByChat = new Map();   // chatPath -> { agentId, jobId }
  const _chatByAgent = new Map();   // `${provider}|${agentId}` -> { url, ts } — the agent's conversation, newest wins
  const stats = { recorded: 0, refused: {}, failed: 0, completed: 0, withheld: {} };

  function rememberAgentChat(provider, agentId, url) {
    const r = resumableChatUrl(provider, url);
    if (!r || !agentId) return false;
    _chatByAgent.set(`${provider}|${agentId}`, { url: r, ts: Date.now() });
    return true;
  }

  /**
   * chatFor(job) -> the URL of the chat this job's agent was last talking in on this
   * provider, or null (no agent, provider not resumable, no chat yet). Memory first;
   * after a restart, the newest transcript filed under the agent in the downloads
   * index — that index is on disk, so the conversation survives a reboot.
   */
  function chatFor(job) {
    if (!job || !job.agentId || !RESUMABLE[job.provider]) return null;
    const hit = _chatByAgent.get(`${job.provider}|${job.agentId}`);
    if (hit) return hit.url;
    try {
      const row = idx.listChats(root(), { agentId: job.agentId, provider: job.provider, limit: 1 })[0];
      if (!row) return null;
      const it = typeof idx.readItem === 'function' ? idx.readItem(root(), row.id) : null;
      const url = resumableChatUrl(job.provider, it && it.raw && it.raw.url);
      if (url) rememberAgentChat(job.provider, job.agentId, url);
      return url;
    } catch (e) {
      log.warn && log.warn(`[${MODULE_ID}] could not read ${job.agentId}'s last ${job.provider} chat from the index: ${e.message}`);
      return null;
    }
  }

  function learnJobChat({ jobId, chatUrl }) {
    if (!jobId || !chatUrl || !jobs) return;
    const job = jobs.get(jobId);
    const p = chatPathOf(chatUrl);
    if (!p || !job || !job.agentId) return;
    _agentByChat.set(p, { agentId: job.agentId, jobId });
    rememberAgentChat(job.provider, job.agentId, chatUrl);
  }

  function _candidates(provider) {
    if (!jobs) return [];
    const since = Date.now() - jobWindowMs;
    const out = [];
    for (const j of jobs.values()) if (j && j.provider === provider && typeof j.prompt === 'string' && (j.ts || 0) >= since) out.push(j);
    return out;
  }

  /**
   * _completeFromTranscript — 0.39.255. James: "the agent tab, in idearium is looking
   * for the hash" — the reply was in the chat's transcript, but the job never
   * completed (reply detection is the open ChatGPT break), so nothing the Agent tab
   * waits for (guardian.job.complete, a .response with this job_id) ever appeared.
   * A job whose prompt is a user turn of this chat, answered by the next turn, is
   * completed through the SAME handler a userscript's GUARDIAN_COMPLETE takes —
   * one completion path: every sink, the pool, idearium, the wake loop.
   * Only from a settled read (a real quiet period, not the max-wait push) of a page
   * that says it is not generating: a reply still streaming must not complete a job.
   * The tab is told first (GUARDIAN_JOB_DONE) so it stops watching and can take the
   * next job the pool sends on this completion.
   */
  function _completeFromTranscript(matches, { provider, tabId, chat }) {
    for (const m of matches) {
      const job = m.job;
      if (job.status === 'complete' || !m.reply) continue;
      const why = chat.settled === false ? 'unsettled' : chat.generating === true ? 'generating' : !complete ? 'no-completer' : null;
      if (why) {
        stats.withheld[why] = (stats.withheld[why] || 0) + 1;
        log.log && log.log(`[${MODULE_ID}] job ${String(job.id).slice(0, 8)}'s reply is in the transcript but not taken yet (${why})`);
        continue;
      }
      try {
        const done = { type: 'GUARDIAN_JOB_DONE', jobId: job.id, provider, reason: 'reply read from the chat transcript' };
        if (ncp) { if (!(tabId && ncp.pushTab && ncp.pushTab(provider, tabId, done))) ncp.push && ncp.push(provider, done); }
        complete(job, m.reply, chat.url || null);
        stats.completed++;
        log.log && log.log(`[${MODULE_ID}] job ${String(job.id).slice(0, 8)} completed from the transcript of ${provider}:${chat.chatId} (${m.reply.length} chars)`);
        bus && bus.emit('guardian.job.completed_from_transcript', { jobId: job.id, provider, agentId: job.agentId || null, chatId: chat.chatId, chatUrl: chat.url || null, chars: m.reply.length });
      } catch (e) {
        stats.failed++;
        log.warn && log.warn(`[${MODULE_ID}] completing job ${job.id} from the transcript failed: ${e.message}`);
      }
    }
  }

  /**
   * record({ provider, tabId, agentId, chat, source }) -> recordChat's answer,
   * or { recorded:false, reason:'failed', error }. Never throws.
   */
  function record({ provider, tabId, agentId, chat, source } = {}) {
    try {
      if (!chat || typeof chat !== 'object') return { recorded: false, reason: 'no-chat' };
      const prov = chat.provider || provider;
      const viaJob = chat.url ? _agentByChat.get(chatPathOf(chat.url)) : null;
      const matches = matchJobs(chat.messages, _candidates(prov));
      const viaPrompt = matches.find(m => m.job.agentId);
      const r = idx.recordChat(root(), {
        provider: prov, chatId: chat.chatId, url: chat.url, tabId,
        agentId: agentId || (viaPrompt && viaPrompt.job.agentId) || (viaJob && viaJob.agentId) || null,
        messages: chat.messages, partial: chat.partial, extractedAt: chat.extractedAt,
        source: source || 'push',
      });
      const filedUnder = r.agentId || agentId || (viaPrompt && viaPrompt.job.agentId) || (viaJob && viaJob.agentId) || null;
      if (filedUnder && chat.url) rememberAgentChat(prov, filedUnder, chat.url);
      if (r.recorded) {
        stats.recorded++;
        log.log && log.log(`[${MODULE_ID}] ${r.chatKey} v${r.version} · ${r.messageCount} messages${r.agentId ? ` · ${r.agentId}` : ''} (${source || 'push'})`);
        bus && bus.emit('guardian.chat.transcript.recorded', {
          chatKey: r.chatKey, version: r.version, id: r.id, agentId: r.agentId, provider: prov,
          messageCount: r.messageCount, source: source || 'push',
        });
      } else {
        stats.refused[r.reason] = (stats.refused[r.reason] || 0) + 1;
      }
      if (matches.length) _completeFromTranscript(matches, { provider: prov, tabId, chat });
      return r;
    } catch (e) {
      stats.failed++;
      log.warn && log.warn(`[${MODULE_ID}] transcript not recorded (${provider}): ${e.message}`);
      return { recorded: false, reason: 'failed', error: e.message };
    }
  }

  function attach() {
    if (!bus) return;
    bus.on('guardian.job.progress', (d) => learnJobChat(_payload(d)));
    bus.on('guardian.ncp.transcript', (d) => {
      const p = _payload(d);
      record({ provider: p.provider, tabId: p.tabId, agentId: p.agentId, chat: p.chat, source: 'push' });
    });
    bus.on('guardian.ncp.sync_result', (d) => {
      const p = _payload(d);
      if (p.chat && !p.error) record({ provider: p.provider, tabId: p.tabId, agentId: p.agentId, chat: p.chat, source: 'sync' });
    });
  }

  /** HTTP read side. Returns true when it answered. */
  function route(method, url, res, pRes) {
    if (method !== 'GET' || !url.pathname.startsWith('/api/chats')) return false;
    try {
      const q = Object.fromEntries(url.searchParams);
      if (url.pathname === '/api/chats') {
        const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 1000);
        const chats = idx.listChats(root(), { agentId: q.agentId || undefined, provider: q.provider || undefined, q: q.q || undefined, limit });
        pRes(res, 200, { ok: true, chats, stats });
        return true;
      }
      if (url.pathname === '/api/chats/versions') {
        if (!q.key) { pRes(res, 400, { ok: false, error: 'key required (provider:chatId)' }); return true; }
        pRes(res, 200, { ok: true, key: q.key, versions: idx.chatVersions(root(), q.key) });
        return true;
      }
      const m = url.pathname.match(/^\/api\/chats\/item\/([^/]+)$/);
      if (m) {
        const it = idx.readItem(root(), decodeURIComponent(m[1]));
        if (!it) pRes(res, 404, { ok: false, error: `no chat record ${m[1]}` });
        else if (it.error && !it.status) pRes(res, 400, { ok: false, error: it.error });
        else pRes(res, 200, { ok: true, item: it });
        return true;
      }
      pRes(res, 404, { ok: false, error: `no route ${url.pathname}` });
      return true;
    } catch (e) {
      pRes(res, 503, { ok: false, error: `downloads index unavailable: ${e.message}` });
      return true;
    }
  }

  /**
   * replyFor(job) -> { text, chatUrl, chatKey } | null — §0.39.265 "check for the response first … chat logs?".
   * The newest transcripts filed under the job's agent (or, without an agent, this provider's newest chats):
   * if the job's prompt is a user turn there and the next turn answers it, that is the job's answer.
   * Read-only; the caller decides what to do with it (guardian/lib/job-retry.js answerFirst).
   */
  function replyFor(job, { chats = 3 } = {}) {
    if (!job || typeof job.prompt !== 'string') return null;
    let rows = [];
    try { rows = idx.listChats(root(), { agentId: job.agentId || undefined, provider: job.provider, limit: chats }) || []; } catch (_) { return null; }
    for (const row of rows) {
      let it = null;
      try { it = typeof idx.readItem === 'function' ? idx.readItem(root(), row.id) : null; } catch (_) { continue; }
      const raw = it && it.raw;
      const messages = raw && (raw.messages || (raw.chat && raw.chat.messages));
      if (!Array.isArray(messages)) continue;
      const m = matchJobs(messages, [job])[0];
      if (m && m.reply) return { text: m.reply, chatUrl: raw.url || null, chatKey: row.chatKey || null };
    }
    return null;
  }

  return { record, attach, route, learnJobChat, chatFor, rememberAgentChat, replyFor, stats };
}

module.exports = { createChatTranscripts, chatPathOf, matchJobs, resumableChatUrl, MODULE_ID, VERSION };
