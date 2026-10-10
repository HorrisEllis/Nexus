'use strict';
/**
 * guardian/lib/wake-loop.js — agent-initiated "hey nexus," answered back into the agent's chat as a job. 2026-09-19;
 * the ONE owner of agent wakes since 0.39.252 (mesh AND userscript-delivered jobs).
 *
 * The agent hint (wake-hint.js) tells the model it can emit a line starting "hey nexus," to ask NEXUS for real system
 * state. The userscript watches the model's output for that line and answers it back into the chat. A mesh-delivered job
 * has no userscript, so nothing would ever answer. This does it, for MESH completions only:
 *
 *   job completes (transport 'mesh') -> find a wake line in the answer -> ask copilot (:3750/api/prompt/tools, the SAME
 *   target the userscript uses: the sovereign co-pilot with the full tool loop, NOT lifeline and NOT another provider)
 *   -> create a 'wake-reply' guardian job for the same agent/account -> it goes through the normal ladder into the same
 *   deterministic tab -> whose answer may itself contain a wake (depth + 1).
 *
 * 0.39.252 — NOT MESH ONLY ANY MORE. James (2026-09-25, screenshot + log): "is supposed to be injected into the chat like
 * a job. it is for the agents to talk to nexus. not me." The userscript path "answered its own wakes" in the page: it
 * matched the FIRST streaming fragment of the agent's reply ("hey nexus, w" — copilot was asked "w"), drew an overlay
 * for the person, and typed the answer into the composer without sending it; Clear Glass's wake-relay answered the
 * same fragment a second time, as a job that queued behind the still-unfinished reply. A wake is the agent talking to
 * NEXUS, so it is answered here, once, from the COMPLETED reply, as a job the agent actually receives. The page no
 * longer answers (userscript-nexus-wake.js checkMessage), the relay no longer answers agent wakes (wake-relay.js).
 * A wake-reply to a userscript-delivered job is pinned to that userscript tab (transport 'ncp'), like the relay did.
 *
 * SAFETY (each has a test):
 *  - depth cap (GUARDIAN_WAKE_MAX_DEPTH, default 3): an agent asking NEXUS which makes the agent ask again is a loop; it is
 *    refused with an event, never silently continued (compare lib/agent-chat's hop cap).
 *  - the grammar is lib/agent-chat.parseWake, byte-identical to the userscript's (one grammar, two runtimes).
 *  - the wake must START a line. Prose that merely mentions nexus, lines inside ``` fences, and > quotes are ignored:
 *    a model explaining the hint or quoting docs must not trigger a request.
 *  - one wake per completion, idempotent per jobId.
 *  - copilot failing never causes the ORIGINAL prompt to be resent; it only means the wake goes unanswered (event emitted).
 */
const http = require('http');
const { parseWake } = require('../../lib/agent-chat');

const START_RE = /^\s*(?:hey|hi|ok|okay)[,\s]+nexus[,:\s]+\S/i;

function extractWake(text) {
  if (typeof text !== 'string' || !text) return null;
  const lines = text.split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence || /^\s*>/.test(l)) continue;
    if (!START_RE.test(l)) continue;
    const para = [l];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== '' && !/^\s*(```|~~~)/.test(lines[j]); j++) para.push(lines[j]);
    const p = parseWake(para.join('\n'));
    return p.addressed ? p.ask : null;
  }
  return null;
}

/** What the agent receives: its own question, then NEXUS's answer. */
function frameReply(ask, text) {
  const q = String(ask || '').replace(/\s+/g, ' ').trim();
  return `[NEXUS] answer to your "hey nexus, ${q.length > 240 ? q.slice(0, 237) + '...' : q}"\n\n${String(text || '').trim()}`;
}

function createCopilotAsk({ url = process.env.COPILOT_URL || 'http://127.0.0.1:3750', timeoutMs = parseInt(process.env.GUARDIAN_WAKE_COPILOT_TIMEOUT_MS || '600000', 10) } = {}) {
  return (request, { sessionId } = {}) => new Promise((resolve) => {
    const u = new URL('/api/prompt/tools', url);
    const body = JSON.stringify({ prompt: request, channel: 'wake', sessionId });
    const req = http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      res.setEncoding('utf8'); let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const j = JSON.parse(d); resolve({ ok: !!(j && (j.text || j.response)), text: j.text || j.response || '', raw: j }); } catch (e) { resolve({ ok: false, error: `bad copilot response: ${e.message}` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'copilot timeout' }); });
    req.write(body); req.end();
  });
}

function createWakeLoop({ askCopilot, createJob, dispatchJob, getJob, bus = { emit() {} }, maxDepth = require('../options.js').get('routing.wake_max_depth'), log = () => {}, answeredTtlMs = 10 * 60e3, now = Date.now } = {}) {
  const handled = new Set();
  // §0.39.279 — one answer per wake when BOTH paths see the same turn (a job's completion and that chat's transcript).
  // Each path records the asks it answered; the other path yields to a matching record ONCE (consumed), within
  // answeredTtlMs. Two different jobs asking the same thing are still both answered (the job path never yields to itself).
  const answeredBy = { job: new Map(), transcript: new Map() };
  const _k = (provider, ask) => `${provider}|${String(ask || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
  function _yield(other, provider, ask) {
    const m = answeredBy[other], k = _k(provider, ask), t = m.get(k);
    for (const [x, ts] of m) if (now() - ts >= answeredTtlMs) m.delete(x);
    if (t && now() - t < answeredTtlMs) { m.delete(k); return true; }
    return false;
  }
  function _record(path, provider, ask) { answeredBy[path].set(_k(provider, ask), now()); }
  async function handleComplete({ jobId }) {
    if (!jobId || handled.has(jobId)) return { skipped: 'already_handled' };
    const job = getJob(jobId);
    if (!job) return { skipped: 'no_job' };
    if (job.command === 'wake') return { skipped: 'wake_job' };
    const ask = extractWake(job.responseText || job.response || '');
    if (!ask) return { skipped: 'no_wake' };
    handled.add(jobId);
    const depth = job.wakeDepth || 0;
    if (depth >= maxDepth) {
      log(`wake refused for ${jobId}: depth ${depth} >= ${maxDepth}`);
      bus.emit('guardian.wake.refused', { jobId, provider: job.provider, depth, reason: 'max_depth' });
      return { refused: 'max_depth', depth };
    }
    if (_yield('transcript', job.provider, ask)) return { skipped: 'answered_from_transcript' };
    _record('job', job.provider, ask);
    bus.emit('guardian.wake.detected', { jobId, provider: job.provider, agentId: job.agentId || null, depth, ask: ask.slice(0, 200) });
    const ans = await askCopilot(ask, { sessionId: `wake-${job.agentId || job.provider}`, provider: job.provider });
    if (!ans || !ans.ok || !ans.text) {
      bus.emit('guardian.wake.failed', { jobId, provider: job.provider, error: (ans && ans.error) || 'empty answer' });
      return { failed: (ans && ans.error) || 'empty answer' };
    }
    // The agent receives this as its next turn, so it says what it answers — the agent asked a question, often several
    // turns back in its own reasoning; a bare copilot answer reads like a stranger's message.
    const reply = createJob({ command: 'wake-reply', provider: job.provider, prompt: frameReply(ask, ans.text), source: 'copilot',
      accountId: job.accountId || null, agentId: job.agentId || null, wakeDepth: depth + 1,
      transport: job.transport === 'mesh' ? null : 'ncp' });   // back into the tab that asked: mesh stays mesh, a userscript tab stays pinned
    dispatchJob(reply);
    bus.emit('guardian.wake.replied', { jobId, replyJobId: reply.id, provider: job.provider, depth: depth + 1 });
    return { replied: reply.id, depth: depth + 1 };
  }

  /**
   * handleTranscript({ provider, tabId, agentId, chat }) — §0.39.279. James: "i want the agents to be able to use hey
   * nexus, its detected but the response from nexus isnt injected as a job." handleComplete only answers a wake inside
   * the reply to a guardian JOB. An agent talking in a chat no job owns (a conversation James opened, a reply the job
   * path never completed) had its "hey nexus" detected by the page (userscript-nexus-wake checkMessage) and answered by
   * nothing. Here the settled transcript is read: the newest turn, if it is the agent's and starts a line with a wake,
   * is answered as a wake-reply job typed into THAT chat (job.chatUrl). Once per turn. A turn that is some job's reply
   * is left to handleComplete (it waits jobGraceMs for the job path first). Depth = how many "[NEXUS] answer to your"
   * turns in a row the agent has just been sent, capped like the job path.
   */
  const handledTurns = new Set();
  const _norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  async function handleTranscript({ provider, tabId = null, agentId = null, chat } = {}, { jobGraceMs = 3000, listJobs = null, sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
    if (!chat || !provider || !chat.chatId || chat.chatId === 'home') return { skipped: 'no_chat' };
    if (chat.settled === false || chat.generating === true) return { skipped: 'not_settled' };
    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    const i = msgs.length - 1;
    const last = msgs[i];
    if (!last || last.role !== 'assistant') return { skipped: 'last_turn_not_the_agent' };
    const ask = extractWake(last.text || '');
    if (!ask) return { skipped: 'no_wake' };
    const key = `${provider}|${chat.chatId}|${i}|${_norm(ask).slice(0, 120)}`;
    if (handledTurns.has(key)) return { skipped: 'already_handled' };
    handledTurns.add(key);
    // a job's reply: the job path answers it (handleComplete) — give it the grace period to claim it
    if (jobGraceMs) await sleep(jobGraceMs);
    const turn = _norm(last.text);
    const owned = (listJobs ? listJobs() : []).find(j => j && j.provider === provider && j.responseText && handled.has(j.id)
      && (_norm(j.responseText).includes(turn.slice(0, 200)) || turn.includes(_norm(j.responseText).slice(0, 200))));
    if (owned) return { skipped: 'job_path', jobId: owned.id };
    if (_yield('job', provider, ask)) return { skipped: 'job_path' };
    _record('transcript', provider, ask);
    let depth = 0;
    for (let k = i - 1; k >= 0; k -= 2) { const u = msgs[k]; if (u && u.role === 'user' && /^\s*\[NEXUS\] answer to your/.test(u.text || '')) depth++; else break; }
    if (depth >= maxDepth) {
      bus.emit('guardian.wake.refused', { provider, chatId: chat.chatId, depth, reason: 'max_depth', via: 'transcript' });
      return { refused: 'max_depth', depth };
    }
    bus.emit('guardian.wake.detected', { provider, agentId, chatId: chat.chatId, depth, ask: ask.slice(0, 200), via: 'transcript' });
    const ans = await askCopilot(ask, { sessionId: `wake-${agentId || provider}`, provider });
    if (!ans || !ans.ok || !ans.text) {
      bus.emit('guardian.wake.failed', { provider, chatId: chat.chatId, error: (ans && ans.error) || 'empty answer', via: 'transcript' });
      return { failed: (ans && ans.error) || 'empty answer' };
    }
    const reply = createJob({ command: 'wake-reply', provider, prompt: frameReply(ask, ans.text), source: 'copilot',
      agentId: agentId || null, wakeDepth: depth + 1, transport: 'ncp', chatUrl: chat.url || null, join: false });
    dispatchJob(reply);
    bus.emit('guardian.wake.replied', { provider, chatId: chat.chatId, replyJobId: reply.id, depth: depth + 1, via: 'transcript' });
    return { replied: reply.id, depth: depth + 1 };
  }
  return { handleComplete, handleTranscript, extractWake, _handled: handled, _handledTurns: handledTurns };
}
module.exports = { createWakeLoop, createCopilotAsk, extractWake, frameReply };
