'use strict';
/**
 * guardian/ask.js — synchronous ask over Guardian's real async job machinery
 * UUID: nexus-guardian-ask-v1-0000-2026-0707-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-07 — Guardian had ZERO working synchronous ask
 * endpoints, confirmed two independent ways this session:
 *   - /api/copilot/prompt: called by copilot/lifeline.js's escalation
 *     path, does not exist anywhere in guardian/server.js.
 *   - /chatgpt-mode/query: exists, correctly written, but 503s on every
 *     call — the file it requires (guardian/agents/chatgpt-mode.js) does
 *     not exist.
 * This blocked lifeline's RAID escalation, which was itself wired and
 * tested earlier this session but terminated at a dead endpoint.
 *
 * §WHY NOT BUILD chatgpt-mode.js — that path implies a real browser-tab
 * agent driving ChatGPT directly. Guardian already HAS that: the NCP
 * (browser-tab) job machinery, working, with RAID provider selection
 * already wired into /command's raw path. Building a second, parallel
 * agent would duplicate real infrastructure — exactly the "competing
 * truth layers" mistake this session repeatedly found and undid. This
 * wraps the real machinery instead.
 *
 * §HONEST ABOUT WHAT THIS IS — a synchronous facade over an inherently
 * asynchronous system. It cannot make a job finish faster; it can only
 * wait for it. Two consequences, both handled explicitly rather than
 * hidden:
 *   1. FAIL FAST — if no NCP provider is connected, the job would sit in
 *      'queued_waiting_for_provider' forever. This checks first and
 *      returns a clear error immediately instead of polling for 60s and
 *      then timing out with a vague message.
 *   2. REAL TIMEOUT — a connected-but-slow provider gets a bounded wait,
 *      then a specific timeout error naming the jobId, so the caller can
 *      still poll GET /jobs for it later. The work is never lost, only
 *      un-awaited.
 *
 * §FIELD-NAME INCONSISTENCY — Guardian itself stores completion text in
 * `responseText` on one code path (GUARDIAN_COMPLETE) and `result` on
 * another (the stream-buffer path). This reads both. That is a real
 * inconsistency in Guardian, and this is an honest patch over it, not a
 * fix to Guardian — noted so it isn't mistaken for one.
 *
 * §INJECTABLE — takes createJob/dispatchJob/getJob/isProviderConnected
 * rather than reaching into server internals. Testable standalone.
 */

const DEFAULT_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS   = 500;

function _extractText(job) {
  // Both real field names, plus a defensive third. Never invents text.
  return job.responseText || job.result || job.text || null;
}

/**
 * askSync(prompt, opts, deps) — enqueue a job through Guardian's real
 * pipeline and wait for it to reach a terminal state.
 *
 * @param {string} prompt
 * @param {object} opts — { provider, content, timeoutMs, command }
 * @param {object} deps — { createJob, dispatchJob, getJob, isProviderConnected }
 * @returns {Promise<{ok, text?, jobId, provider, error?}>}
 */
/** §HP16 — did the tab confirm typing this job's prompt? (the same reading as guardian/lib/dispatcher.js _typed) */
function _typed(j) {
  if (!j) return false;
  if (j.confirmedAt || j.lastChunk || ['delivered_confirmed', 'responding', 'awaiting_transcript', 'complete', 'done'].includes(j.status)) return true;
  return Array.isArray(j.gates) && j.gates.some(e => (e.gate === 'submit' || e.gate === 'reply') && e.state === 'passed' && !e.implied);
}
/** §HP16 — cancel a job nobody waits for (deps.cancelJob, guardian/lib/dispatcher.js cancel); absent → left as before */
function _abandon(deps, jobId, reason) {
  try { if (typeof deps.cancelJob === 'function') deps.cancelJob(jobId, reason); } catch (_) {}
}

async function askSync(prompt, opts = {}, deps = {}) {
  const { createJob, dispatchJob, getJob, isProviderConnected } = deps;
  if (typeof createJob !== 'function' || typeof dispatchJob !== 'function' || typeof getJob !== 'function') {
    return { ok: false, error: 'guardian/ask: createJob, dispatchJob and getJob must be injected' };
  }
  if (!prompt) return { ok: false, error: 'prompt required' };

  const provider  = opts.provider || 'auto';
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  // §BUG FIXED 2026-07-07 (caught before shipping) — the first version of
  // this passed provider straight to createJob. But createJob stores the
  // provider verbatim and dispatchJob enqueues to pendingQueue[provider];
  // a literal 'auto' therefore creates a job queued to a bucket NO real
  // provider ever drains — a permanently-stuck job that only the timeout
  // below would ever release. /command resolves 'auto' via RAID BEFORE
  // createJob, and so must this. resolveProvider is injected (not a hard
  // RAID require) so this module stays sovereign and testable standalone.
  let resolved = provider;
  if (resolved === 'auto') {
    if (typeof deps.resolveProvider !== 'function') {
      return { ok: false, error: "provider 'auto' requires an injected resolveProvider() — refusing to enqueue a job to a queue nothing drains" };
    }
    try {
      // Awaited: resolveProvider is now async, because resolving a provider
      // means ASKING cortex over its API rather than requiring its files.
      // Without the await, `resolved` would be a Promise and every job would
      // enqueue to pendingQueue['[object Promise]'] — the same silent-wire
      // failure this whole session has been about.
      resolved = await deps.resolveProvider(prompt);
    } catch (e) {
      return { ok: false, error: `provider resolution failed: ${e.message}` };
    }
    if (!resolved || resolved === 'auto') {
      return { ok: false, error: 'provider resolution returned no concrete provider' };
    }
  }

  // §FAIL FAST — an unconnected provider means this job can never complete
  // in the caller's lifetime. Say so now, don't poll into a timeout.
  //
  // §MESSAGE CORRECTED TWICE. It first said "no browser tab available",
  // which encoded an unverified assumption. It then pointed at
  // clear-glass/ncp-client.js — a provider *I* wrote, which turned out to
  // duplicate the real mechanism: Clear Glass's ProviderHost injects
  // Guardian's own userscripts (guardian/userscript-<agent>.js) into its
  // webviews, and those connect to /channel. That is canonical; my client
  // is now tests/helpers/clear-glass-ncp-provider.js, a test double only.
  // The real production failure is upstream and specific: ProviderHost
  // needs GUARDIAN_DIR set (autopilot now sets it), and CookieVault must
  // restore a session or the tab lands on a login page and can never answer.
  // §AGENT-TAB 0.39.244 — not for a job aimed at a repo's own tab (opts.agentId): the
  // dispatcher opens that tab itself and waits for it (lib/dispatcher.js _awaitAgentTab),
  // so the shared tab being down is no evidence the job can't complete.
  if (!opts.agentId && typeof isProviderConnected === 'function' && !isProviderConnected(resolved)) {
    return { ok: false, error: `no provider connected on NCP channel '${resolved}' — check that Clear Glass booted with GUARDIAN_DIR set and that its '${resolved}' tab has a restored session (not a login page)`, provider: resolved };
  }

  let job;
  try {
    // §BUILT 2026-08-18 — James: "upgrade them with what you can, accounting
    // for cors and user policy... try not to change any of [the chatgpt
    // WSS path] if you don't need to." Entirely server-side, entirely
    // additive: only activates when a caller explicitly passes opts.tools
    // (a curated array of real tool names) -- every existing caller's
    // prompt is byte-identical to before if this isn't set. Zero userscript
    // changes anywhere -- this is the actual reason it's safe for the
    // chatgpt/WSS path: nothing about how a tab receives or sends text
    // changes, only what guardian does with the text AFTER it comes back
    // through the exact same real NCP round trip that already exists.
    // No CORS surface either -- tool execution below runs in guardian's
    // own process, in-process, never as a browser-originated request.
    // §FIX 2026-09-02 — real bug, found by tracing why an NCP-dispatched
    // agent (chatgpt/claude/gemini/perplexity) told a user it had no real
    // tools despite opts.tools being set (ESCALATION_TOOLS, from
    // copilot/lifeline.js's dispatchToNcpAgent default). Root cause: two
    // independent tool-call mechanisms exist on this same path and were
    // never reconciled —
    //   (1) this function's own finalPrompt manifest (below, until this
    //       fix), which resolved names correctly and told the model to
    //       reply with `TOOL_CALL: {"name":..., "args":{...}}`; and
    //   (2) each userscript's own _buildToolsHeader (built in the phase 1/2
    //       commits, 100fe02 + 40e3de7), which reads job.tools directly off
    //       the NCP payload and tells the model to reply with
    //       `[[TOOL: name {"arg":"val"}]]` instead — a DIFFERENT syntax.
    // job.tools was stored as the raw opts.tools array (createJob's own
    // `tools: Array.isArray(tools) ? tools : null`, unchanged) — i.e. plain
    // name strings for every caller that (like ESCALATION_TOOLS) never
    // resolved them, exactly what this function's own manifest-building
    // below already did correctly for (1). _buildToolsHeader assumes
    // {name, description} objects (`t.name`, `t.description`), so a plain
    // string produced `- undefined` for every tool. Net effect for any
    // NCP-dispatched job: the model received a broken, unusable tools list
    // under the NEW syntax, immediately followed by a second, correct,
    // CONFLICTING manifest under the OLD syntax later in the same prompt —
    // two different real conventions, one visibly broken, in one message.
    // A model reasonably refusing to act on that is not a model bug.
    //
    // Real fix, done once, upstream, rather than patched separately in 4
    // near-duplicate userscript copies: resolve tool names to real
    // {name, description} objects HERE, store the resolved objects (not
    // raw strings) on the job, and stop injecting this function's own
    // separate TOOL_CALL: instruction into the prompt text. The userscript
    // side (client-side interception, before the reply is even "final",
    // with its own 5-call safety cap) is the more capable of the two real
    // mechanisms for NCP/browser-tab providers — this makes it the single
    // source of truth for that path instead of two competing ones.
    // finalPrompt therefore stays byte-identical to prompt again, same as
    // any caller that never sets opts.tools — additive only in what
    // job.tools now correctly carries.
    let resolvedTools = null;
    if (Array.isArray(opts.tools) && opts.tools.length) {
      const agentTools = require('../lib/agent-tools/index.js');
      resolvedTools = opts.tools
        .map(name => agentTools.TOOLS.get(name))
        .filter(Boolean)
        .map(t => ({ name: t.name, description: (t.description || '').split('\n')[0].slice(0, 140) }));
      if (!resolvedTools.length) resolvedTools = null;
    }
    // §TR1 2026-09-22 — the last confirmed real gap in this chain: jobs.js's
    // createJob() already has a real agentId field (agentId: agentId || null),
    // this call just never passed one. opts.agentId traced back through
    // guardian/server.js, copilot/lifeline.js, copilot/server.js, to
    // idearium's lib/repo-agent.js — every hop now forwards it.
    job = createJob({ command: opts.command || 'ask', provider: resolved, prompt, content: opts.content || '', tools: resolvedTools, agentId: opts.agentId || undefined,
      canonical: opts.canonical || undefined, reuse: opts.reuse || undefined });   // 0.39.265 — an identical in-flight job is joined, not sent twice
    if (job.status !== 'complete') dispatchJob(job);
  } catch (e) {
    return { ok: false, error: `failed to enqueue job: ${e.message}` };
  }

  const deadline = Date.now() + timeoutMs;
  // §HP17 0.55.2 — no tab for the provider: the repo agent (an agentId job skips the fail-fast above) waited its whole
  // 295 s at "provider tab" while guardian knew in the first second. GUARDIAN_NO_TAB_MS (45 s — time for Clear Glass to
  // open one) with the provider still not connected and nothing typed: said, and the job cancelled (HP16).
  const noTabMs = parseInt(process.env.GUARDIAN_NO_TAB_MS || '45000', 10);
  let noTabSince = null;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const current = getJob(job.id);
    if (!current) continue; // not yet visible in the store — keep waiting
    // §HP21 0.55.2 — the economy holds the job longer than this caller will wait (or longer than GUARDIAN_ECONOMY_WAIT_MS,
    // 30 s): said now, with the limit, and the job cancelled — the copilot route reads it as rate-limit and moves on
    const econMax = parseInt(process.env.GUARDIAN_ECONOMY_WAIT_MS || '30000', 10);
    if (current.economyWaitUntil && current.status === 'queued' && !_typed(current)) {
      const left = current.economyWaitUntil - Date.now();
      if (left > econMax || Date.now() + left > deadline) {
        const p = current.provider || resolved, why = String(current.queueReason || '').replace(/^economy:\s*/, '');
        _abandon(deps, job.id, `the economy holds ${p} ${Math.round(left / 1000)} s`);
        return { ok: false, jobId: job.id, provider: p, gate: current.gate || null,
          error: `economy: ${p} is at its limit (${why}) — next slot in ${Math.round(left / 1000)} s; nothing was typed, the job is cancelled — use another agent, or change the limits in Settings → economy` };
      }
    }
    if (typeof isProviderConnected === 'function' && !_typed(current) && !['complete', 'done', 'error', 'failed', 'cancelled'].includes(current.status)) {
      const p = current.provider || resolved;
      if (isProviderConnected(p)) noTabSince = null;
      else if (noTabSince === null) noTabSince = Date.now();
      else if (Date.now() - noTabSince >= noTabMs) {
        _abandon(deps, job.id, `no ${p} tab connected for ${Math.round(noTabMs / 1000)} s`);
        return { ok: false, jobId: job.id, provider: p, gate: current.gate || null,
          error: `not connected — no ${p} tab open in guardian for ${Math.round(noTabMs / 1000)} s: open ${p} in Clear Glass (or the browser with its Guardian userscript), signed in — nothing was typed, the job is cancelled` };
      }
    }

    if (current.status === 'complete' || current.status === 'done') {
      const text = _extractText(current);
      if (!text) {
        // §1.2 — a "complete" job with no text is a real anomaly, not an
        // empty success. Report it as the failure it is.
        return { ok: false, jobId: job.id, provider: current.provider, error: 'job completed but carried no response text' };
      }
      return await _maybeRunToolCall({ text, job, current, opts });
    }
    // 0.39.256 — a failure says which gate it stopped at (lib/gate-trail.js), not just "job failed".
    // 'failed' is the dispatcher's own terminal state (retries exhausted); it was never recognised
    // here, so the caller waited out its whole timeout for a job guardian had already given up on.
    if (current.status === 'error' || current.status === 'failed') {
      const g = current.gate || null;
      const why = current.error || current.failReason || 'job failed';
      return { ok: false, jobId: job.id, provider: current.provider, gate: g, error: g && g.state !== 'passed' ? `${g.sentence}` : why };
    }
    // still queued/dispatching/streaming — keep polling
  }

  // Timed out. The job is still alive and may complete later — name it so
  // the caller can retrieve it via GET /jobs rather than assume it's lost.
  // 0.39.256 — said with the gate it is waiting at (lib/gate-trail.js), so the caller knows WHERE it is stuck.
  const _last = getJob(job.id) || {};
  const _g = _last.gate || null;
  // §HP16 0.55.2 — nobody waits for it now: never typed → cancelled (it would be sent later, to nobody); typed → left
  // to finish, its reply adoptable late (§LATE)
  if (!_typed(_last)) {
    _abandon(deps, job.id, `the caller stopped waiting after ${Math.round(timeoutMs / 1000)} s`);
    return { ok: false, jobId: job.id, provider: _last.provider || resolved, gate: _g, cancelled: true,
      error: `timed out after ${timeoutMs}ms — ${_g ? _g.sentence : 'no gate reported yet'} · nothing was typed, so the job is cancelled (not sent later)` };
  }
  return { ok: false, jobId: job.id, provider: resolved, gate: _g,
    error: `timed out after ${timeoutMs}ms — ${_g ? _g.sentence : 'no gate reported yet'} · job ${job.id} may still complete (GET /status/${job.id})` };
}

/**
 * _maybeRunToolCall({text, job, current, opts}) — real, in-process tool
 * execution when the agent's own response contains the TOOL_CALL marker.
 * Only ever reachable when opts.tools was set on this same call (the
 * marker instruction was only ever given to the agent in that case) —
 * but checked defensively regardless, since text is real, untrusted
 * model output, not a guaranteed-well-formed protocol.
 */
async function _maybeRunToolCall({ text, job, current, opts }) {
  const m = text.match(/TOOL_CALL:\s*(\{.*\})\s*$/s);
  if (!m || !Array.isArray(opts.tools) || !opts.tools.length) {
    return { ok: true, jobId: job.id, provider: current.provider, text, modelUsed: current.provider };
  }
  let req;
  try { req = JSON.parse(m[1]); } catch (_) {
    // Malformed JSON after a real marker — the agent tried, honest partial
    // failure: return the real text as-is rather than silently drop it.
    return { ok: true, jobId: job.id, provider: current.provider, text, modelUsed: current.provider };
  }
  if (!req.name || !opts.tools.includes(req.name)) {
    // Real, but either missing a name or asking for a tool that wasn't
    // actually offered — never execute something never advertised.
    return { ok: true, jobId: job.id, provider: current.provider, text, modelUsed: current.provider, toolCallRejected: req.name ? `"${req.name}" was not in the offered tool set` : 'no tool name given' };
  }
  try {
    const agentTools = require('../lib/agent-tools/index.js');
    const result = await agentTools.executeTool(req.name, req.args || {}, { source: 'guardian-escalation', agent: current.provider });
    return { ok: true, jobId: job.id, provider: current.provider, text, modelUsed: current.provider, toolCall: { name: req.name, args: req.args || {}, result } };
  } catch (e) {
    return { ok: true, jobId: job.id, provider: current.provider, text, modelUsed: current.provider, toolCallError: e.message };
  }
}

/**
 * converseWithOllama(prompt, opts) — a real, single dispatch to ollama-
 * bridge's actual job API. Same real polling shape askSync already uses
 * for guardian's own jobs (queued -> poll -> complete), reused, not
 * reinvented — job.result holds the real text, job.status ===
 * 'complete' is the real terminal state (confirmed by reading ollama/
 * server.js's own code, not assumed).
 */
async function converseWithOllama(prompt, opts = {}) {
  const nx = require('../lib/nexus-client.js');
  const timeoutMs = opts.timeoutMs || 30000;
  let created;
  try { created = await nx.post('ollama', '/api/jobs', { prompt, sessionId: opts.sessionId, intent: opts.intent || 'ask' }); }
  catch (e) { return { ok: false, error: `ollama-bridge unreachable: ${e.message}` }; }
  if (!created?.jobId) return { ok: false, error: created?.error || 'ollama-bridge did not return a jobId' };

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
    let got;
    try { got = await nx.get('ollama', `/api/jobs/${created.jobId}`); }
    catch (_) { continue; } // a transient poll miss — real, keep trying within the real timeout
    const job = got?.job;
    if (!job) continue;
    if (job.status === 'complete') return { ok: true, text: job.result || '', jobId: created.jobId };
    if (job.status === 'error' || job.status === 'failed') return { ok: false, error: job.error || 'ollama job failed', jobId: created.jobId };
  }
  return { ok: false, error: `ollama-bridge job ${created.jobId} did not complete within ${timeoutMs}ms` };
}

/**
 * bridgeConversation({ initialPrompt, provider, maxRounds, sessionId }) —
 * James: "guardian agents can, if needed, talk to ollama, like a
 * conversation. inputs from guardian agent into ollama co-pilot, outputs
 * from ollama co-pilot into guardian agent." Real, bounded, bidirectional
 * loop: a guardian-dispatched agent's real response becomes ollama's
 * real input; ollama's real response becomes the guardian agent's next
 * real input. Every real turn logged to event_log — §1.2, nothing in
 * silence, same discipline as every other real pipeline this session.
 */
async function bridgeConversation({ initialPrompt, provider, maxRounds = 3, sessionId, deps = {} } = {}) {
  if (!initialPrompt || !provider) return { ok: false, error: 'bridgeConversation needs initialPrompt and provider' };
  const MAX_ROUNDS_HARD_CAP = 8; // §1.1 — a real, stated bound regardless of what a caller requests, never an unbounded loop
  const rounds = Math.min(maxRounds, MAX_ROUNDS_HARD_CAP);
  const transcript = [];
  let jaaDB, uid;
  try { ({ jaaDB, uid } = require('../cortex/memory/jaa-db.js')); } catch (_) { /* logging optional, the real conversation still runs without it */ }

  function _logTurn(from, to, text) {
    if (!jaaDB) return;
    try { jaaDB.insert('event_log', { uuid: uid(), type: 'guardian.ollama.bridge.turn', payload: { from, to, textPreview: (text || '').slice(0, 300), round: transcript.length }, source: 'guardian-ollama-bridge', causedBy: null, ts: Date.now() }); }
    catch (_) { /* real logging failure never breaks the real conversation */ }
  }

  let currentPrompt = initialPrompt;
  let currentSpeaker = 'guardian'; // real, alternating: guardian agent speaks first, matching "inputs from guardian agent into ollama"
  for (let i = 0; i < rounds * 2; i++) {
    if (currentSpeaker === 'guardian') {
      const r = await askSync(currentPrompt, { provider }, deps);
      if (!r.ok) { transcript.push({ speaker: 'guardian', error: r.error, round: transcript.length }); break; }
      transcript.push({ speaker: 'guardian', provider: r.provider, text: r.text, round: transcript.length });
      _logTurn('guardian', 'ollama', r.text);
      currentPrompt = r.text;
      currentSpeaker = 'ollama';
    } else {
      const r = await converseWithOllama(currentPrompt, { sessionId });
      if (!r.ok) { transcript.push({ speaker: 'ollama', error: r.error, round: transcript.length }); break; }
      transcript.push({ speaker: 'ollama', text: r.text, round: transcript.length });
      _logTurn('ollama', 'guardian', r.text);
      currentPrompt = r.text;
      currentSpeaker = 'guardian';
    }
  }
  return { ok: true, transcript, rounds: Math.ceil(transcript.length / 2) };
}

module.exports = { askSync, DEFAULT_TIMEOUT_MS, converseWithOllama, bridgeConversation };


