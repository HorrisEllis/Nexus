'use strict';
/**
 * guardian/lib/dispatcher.js — the dispatch subsystem, decompiled out of
 * guardian/server.js.
 * comp_id: nexus.guardian.dispatcher
 * UUID: nexus-guardian-dispatcher-v1-0000-2026-0902-001
 *
 * WHY (James, 2026-09-02: "decompile guardian into component, remove
 * bottleneck"): dispatchJob() and _doDispatch() lived inline in
 * guardian/server.js (4681 lines, 70+ top-level functions/routes in one
 * file) as closures over that file's module-scoped `jobs`, `updateJob`,
 * `ncp`, `pendingQueue`, `cockpitBroadcast`, and `_dispatchToMistral`.
 * This file is that same logic, moved verbatim (not reimplemented from
 * memory or guessed) into a standalone component, taking those five
 * things as injected dependencies instead of closing over module scope —
 * that's what makes it a real component instead of a copy-paste that
 * happens to also work.
 *
 * The pool-release bottleneck found the same session (dispatch-pool's
 * complete()/fail() had zero call sites anywhere in the repo) is fixed
 * separately in guardian/lib/dispatch-pool-bridge.js, wired to the same
 * bus events every completion path here already emits — not duplicated
 * inline in doDispatch, because NCP-path completion doesn't happen in
 * doDispatch at all (it arrives later, in server.js's _handleNCPMessage,
 * on a real GUARDIAN_DELIVERED/response message) — a bus-level bridge is
 * the only place that's correct for every dispatch path, not just this one.
 *
 * VERIFICATION STATUS: syntax-checked and dependency-shape-tested with
 * fakes (see the accompanying test run). NOT yet run against the live
 * repo with real ncp/bus/pool instances — that requires this file to
 * actually replace the inline functions in server.js, which is the wiring
 * step below, not done automatically here per §16.5 (delete before add —
 * the inline versions in server.js should be removed once this is
 * confirmed working, not left duplicated).
 */

const { randomUUID } = require('crypto');

/**
 * createDispatcher(deps) — deps are exactly the five things _doDispatch
 * and dispatchJob closed over in server.js. Nothing here invents a new
 * dependency shape; each one is used exactly the way server.js already
 * uses it (updateJob(id, patch), bus.emit(name, payload), ncp.isConnected/
 * push(provider, ...), pendingQueue as a Map<provider, job[]>,
 * cockpitBroadcast(data), dispatchToMistral(job) → Promise).
 */
// §0.39.247 — guardian's SISOStream calls listeners with an envelope
// { type, data }; a plain EventEmitter (tests) passes the payload itself.
// Listeners that destructured the payload got undefined in production and
// did nothing. This accepts both.
const _payload = (e) => (e && typeof e === 'object' && typeof e.type === 'string' && e.data && typeof e.data === 'object') ? e.data : (e || {});

function createDispatcher(deps) {
  const { updateJob, bus, ncp, pendingQueue, cockpitBroadcast, dispatchToMistral, dispatchToDeepseek, pingTimeoutMs, completionTimeoutMs,
          ladder, completeFromMesh, chatFor, answerFirst, erosType, completeWith, economy } = deps;   // 0.39.281: optional economy — guardian/lib/economy-guard.js   // 0.39.265: optional answerFirst(job) / erosType(job) / completeWith(job, text, chatUrl, source) — guardian/lib/job-retry.js, eros-typist.js   // 0.39.259: optional chatFor(job) -> the agent's chat URL (guardian/lib/chat-transcripts.js)   // 2026-09-19: optional mesh-first ladder (guardian/lib/dispatch-ladder.js)
  for (const [name, fn] of Object.entries({ updateJob, bus, ncp, cockpitBroadcast, dispatchToMistral, dispatchToDeepseek })) {
    if (!fn) throw new Error(`[dispatcher] missing required dependency: ${name}`);
  }
  if (!(pendingQueue instanceof Map)) {
    throw new Error('[dispatcher] pendingQueue must be the same Map instance server.js reads elsewhere (queue flush/replay code reads it directly)');
  }

  const { pool: _dispatchPool } = require('./dispatch-pool'); // §P11: per-provider semaphore

  // §BUILT 2026-09-16 — James: "negative space... events to trigger from
  // the lack." Real, confirmed gap traced before building this, not
  // assumed: gap-finder (cortex/gap-finder) only ever reacts to events
  // something ELSE actively emitted (anomaly.detected, sigma.*) — it has
  // no mechanism of its own for noticing an expected event that never
  // arrived. And dispatchJob below has a PRE-dispatch ping timeout, but
  // nothing watched what happens AFTER a job is marked 'delivered' — if
  // completion never comes (dead tab, dropped SSE frame, crashed
  // renderer — every real failure mode this whole session traced back
  // to), the job just sits silently until a human notices the console
  // still says "no response." This map + the two blocks below are that
  // missing watch: jobId → timer. The event fired on expiry is the real
  // shadow/negative-space event — it exists BECAUSE something expected
  // did not happen, not because anything positively went wrong.
  const _completionWatch = new Map();
  // 2026-09-19: was a fixed 90s, then REQUEUE (i.e. resend the prompt). A whole-code-base answer routinely generates
  // for many minutes, so a slow-but-alive generation was asked twice. Now an IDLE window (default 15 min) that is
  // re-armed by real activity (userscript chunks / confirmation), configurable via GUARDIAN_COMPLETION_TIMEOUT_MS.
  const _COMPLETION_TIMEOUT_MS = completionTimeoutMs || parseInt(process.env.GUARDIAN_COMPLETION_TIMEOUT_MS || '900000', 10);
  const _watchedJobs = new Map();
  const _MAX_TIMEOUT_RETRIES = 2; // §1.2 — bounded, not an infinite requeue loop

  // §SHARED 2026-09-20 — was inlined only in the setTimeout below (the
  // 15-minute idle-window path). Extracted so guardian.provider.disconnected
  // (added below) can requeue through the exact same bounded-retry logic
  // instead of a second, drifting copy of it (§no repetition).
  function _requeueOrFail(job, reason, waitedMs) {
    _clearCompletionWatch(job.id);
    const retries = (job._timeoutRetries || 0) + 1;
    job._timeoutRetries = retries;
    bus.emit('guardian.job.timeout', { jobId: job.id, provider: job.provider, waitedMs, retry: retries, reason });
    // §0.39.247 — either way the tab slot comes back: with one tab per
    // provider, a timed-out job holding it blocked every job behind it.
    _dispatchPool.release(job.provider, job.id);
    if (retries > _MAX_TIMEOUT_RETRIES) {
      const failReason = `${reason} after ${retries - 1} retr${retries - 1 === 1 ? 'y' : 'ies'} — giving up, not requeuing forever`;
      updateJob(job.id, { status: 'failed', failedAt: Date.now(), failReason });
      console.warn(`[guardian] ${job.id} → ${job.provider}: ${reason}, retries exhausted — marked failed`);
      // Said on the bus too: a caller waiting on this job (askSync, idearium's
      // repo-agent) learns it failed instead of waiting out its own timeout.
      bus.emit('guardian.job.error', { jobId: job.id, provider: job.provider, agentId: job.agentId || null, error: failReason });
      return;
    }
    updateJob(job.id, { status: 'queued', queuedAt: Date.now(), queueReason: `${reason} — requeued (attempt ${retries})` });
    console.warn(`[guardian] ${job.id} → ${job.provider}: ${reason} — requeuing (attempt ${retries})`);
    if (!pendingQueue.has(job.provider)) pendingQueue.set(job.provider, []);
    pendingQueue.get(job.provider).push(job);
  }

  function _armCompletionWatch(job) {
    _clearCompletionWatch(job.id);
    _watchedJobs.set(job.id, job);
    const t = setTimeout(() => {
      _completionWatch.delete(job.id);
      _requeueOrFail(job, `no completion within ${_COMPLETION_TIMEOUT_MS}ms — real absence, not a guess`, _COMPLETION_TIMEOUT_MS);
    }, _COMPLETION_TIMEOUT_MS);
    // 0.39.248 — unref'd: the watchdog still fires in guardian (its HTTP server keeps
    // the process up), but it no longer keeps a process alive on its own. It did:
    // tests/dispatcher-stale-socket.test.js passed and then never exited, so the boot
    // vitals check timed it out and reported it as a regression (same on 0.39.236).
    if (t.unref) t.unref();
    _completionWatch.set(job.id, t);
  }

  function _clearCompletionWatch(jobId) {
    const t = _completionWatch.get(jobId);
    if (t) { clearTimeout(t); _completionWatch.delete(jobId); }
  }
  // activity => the generation is alive: restart the idle window instead of letting it expire mid-stream
  const _touch = (ev) => { const { jobId } = _payload(ev); if (_completionWatch.has(jobId) && _watchedJobs.get(jobId)) _armCompletionWatch(_watchedJobs.get(jobId)); };
  bus.on('guardian.job.chunk', _touch);
  bus.on('guardian.job.confirmed', _touch);
  bus.on('guardian.job.complete', (ev) => _watchedJobs.delete(_payload(ev).jobId));

  // Real completion, from anywhere (NCP GUARDIAN_COMPLETE, GUARDIAN_REPLAY's
  // non-replay branch, dispatch-pool-bridge) all emit this same bus event —
  // see this file's own header comment on why that's the one correct place.
  bus.on('guardian.job.complete', (ev) => _clearCompletionWatch(_payload(ev).jobId));

  // §BUILT 2026-09-20 — James, from a real pasted log: a job dispatched to
  // chatgpt whose ping gate had already failed (line 362 below, "dispatching
  // anyway — uncertain evidence") got an ack, then the tab genuinely died
  // 31s later (guardian.provider.disconnected). Before this, that job just
  // sat in _watchedJobs for up to the full 15-minute _COMPLETION_TIMEOUT_MS
  // before anything noticed — guardian already KNEW the target was dead,
  // seconds after it happened, and did nothing with that knowledge.
  // Dispatch is provider-scoped, not tab-scoped (no tabId recorded on the
  // job — "active client" is whichever tab NCP currently has for that
  // provider), so a disconnect for provider P means every job still
  // in-flight to P lost its target; each is requeued immediately through
  // the same bounded-retry path the idle-timeout uses; a fresh tab
  // reconnecting (as ClearGlass's re-spawn-and-reinject already does,
  // separately, within seconds) picks the requeued job back up normally.
  // 0.39.259 — a tab that navigates to the job's own chat (resumeChatUrl, below) reloads and
  // disconnects ON PURPOSE; it carries the job across the load itself. Requeueing it here would send
  // the prompt twice. Bounded: after RESUME_GRACE_MS the disconnect is treated as real again.
  const RESUME_GRACE_MS = parseInt(process.env.GUARDIAN_RESUME_GRACE_MS || '60000', 10);
  bus.on('guardian.provider.disconnected', (ev) => { const { provider } = _payload(ev);
    for (const job of _watchedJobs.values()) {
      if (job.provider !== provider) continue;
      if (job.resumingChatAt && Date.now() - job.resumingChatAt < RESUME_GRACE_MS) {
        console.log(`[guardian] ${job.id} → ${provider}: tab disconnected while opening the job's chat — expected, not requeued`);
        continue;
      }
      _watchedJobs.delete(job.id);
      _requeueOrFail(job, `provider '${provider}' disconnected mid-flight`, job.dispatchedAt ? (Date.now() - job.dispatchedAt) : 0);
    }
  });

  // §0.39.265 — a job the pool already holds (active or waiting) is not enqueued twice: a joined twin
  // (guardian/lib/jobs.js) or a caller that dispatches again gets the one run already under way.
  const _inPool = new Set();
  _dispatchPool.on('slot-freed', ({ jobId }) => _inPool.delete(jobId));
  _dispatchPool.on('job-failed', ({ jobId }) => _inPool.delete(jobId));

  function dispatchJob(job) {
    if (!job) return;
    if (job.status === 'retry_wait') { console.log(`[guardian] ${job.id}: waiting to retry — guardian/lib/job-retry.js sends it when its backoff ends`); return; }
    if (_inPool.has(job.id)) { console.log(`[guardian] ${job.id}: already queued or running — not dispatched twice`); return; }
    // §0.39.281 EC6 — the provider economy (lib/economy/*): wait, stop, or the fallback the person configured
    if (economy && typeof economy.check === 'function') {
      let d = null; try { d = economy.check(job); } catch (e) { console.warn(`[guardian/economy] check failed (dispatching as before): ${e.message}`); }
      if (d && d.verdict === 'wait') {
        updateJob(job.id, { status: 'queued', queuedAt: Date.now(), queueReason: `economy: ${d.reason}` });
        bus.emit('guardian.economy.wait', { jobId: job.id, provider: job.provider, ms: d.ms, reason: d.reason });
        console.log(`[guardian/economy] ${job.id} → ${job.provider} waits ${Math.round(d.ms / 1000)}s — ${d.reason}`);
        const t = setTimeout(() => dispatchJob(job), Math.max(1000, d.ms)); if (t.unref) t.unref();
        return;
      }
      if (d && d.verdict === 'stop') {
        updateJob(job.id, { status: 'failed', failedAt: Date.now(), failReason: `economy: ${d.reason}` });
        bus.emit('guardian.job.error', { jobId: job.id, provider: job.provider, agentId: job.agentId || null, error: `economy: ${d.reason}` });
        return;
      }
      if (d && d.verdict === 'fallback' && d.provider && d.provider !== job.provider) {
        const from = job.provider;
        const moved = updateJob(job.id, { provider: d.provider, economyFallback: { from, to: d.provider, reason: d.reason, at: Date.now() } }) || job;
        bus.emit('guardian.economy.fallback', { jobId: job.id, from, to: d.provider, reason: d.reason });
        console.log(`[guardian/economy] ${job.id}: ${from} → ${d.provider} — ${d.reason}`);
        job = moved; job.provider = d.provider;
        if (economy.check(job).verdict !== 'allow') return dispatchJob(job);   // the fallback's own limits apply too
      }
      try { economy.begin(job); } catch (_) {}
    }
    _inPool.add(job.id);
    // §P11: route through dispatch pool — per-provider semaphore, job stealing.
    // Slot release is NOT here — see dispatch-pool-bridge.js's header for why.
    _dispatchPool.enqueue(job.provider, { id: job.id, provider: job.provider, priority: job.priority || 'normal', payload: job },
      (poolJob) => {
        // §0.39.247 — a job handed a slot but NOT delivered (no tab, stale
        // socket) went back on pendingQueue still holding that slot; on the
        // tab's connect, flushQueuedJobs re-enqueued it and it waited on
        // itself. _doDispatch returns false exactly when it queued instead
        // of delivering, so the slot goes back then. true/undefined = handed
        // on (delivered, or a non-tab transport that completes via the bus).
        Promise.resolve(_doDispatch(poolJob.payload)).then((delivered) => {
          if (delivered === false) _dispatchPool.release(poolJob.provider, poolJob.id);
        }, (e) => {
          _dispatchPool.release(poolJob.provider, poolJob.id);
          console.error(`[guardian] ${poolJob.id} → ${poolJob.provider}: dispatch threw — ${e.message}`);
        });
      });
    // If pool enqueued (slot available) _doDispatch was called synchronously.
    // If queued or stolen, it will be called when a slot frees.
    return;
  }

  /**
   * _pingProvider(provider, timeoutMs) — real round trip, same proven
   * shape as GUARDIAN_CLAIM/GUARDIAN_CLAIM_ACK: push a GUARDIAN_PING,
   * wait for the matching GUARDIAN_PING_ACK's real bus event
   * ('guardian.ncp.pong', wired in guardian/lib/ncp-handler.js). Genuine
   * confirmation the tab's own JS is alive and processing SSE messages
   * RIGHT NOW — stronger evidence than isConnected()'s passive heartbeat
   * staleness check, which only proves the tab answered something within
   * the last 30s.
   *
   * §HONEST SCOPE — this proves the tab is *responsive*, not that the
   * page is on the right view or that the composer element specifically
   * exists; that failure mode still surfaces the same way it always has,
   * as injectText() honestly failing inside handleJob(). A ping cannot
   * prove the DOM element it hasn't looked at yet is there.
   */
  function _pingProvider(provider, timeoutMs = pingTimeoutMs || 3000) {
    return new Promise((resolve) => {
      const pingId = randomUUID();
      let settled = false;
      const onPong = (ev) => {
        if (ev?.data?.provider !== provider || ev?.data?.pingId !== pingId) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bus.off('guardian.ncp.pong', onPong);
        resolve({ ok: true });
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        bus.off('guardian.ncp.pong', onPong);
        resolve({ ok: false, reason: 'ping timeout' });
      }, timeoutMs);
      bus.on('guardian.ncp.pong', onPong);
      const sent = ncp.push(provider, { type: 'GUARDIAN_PING', pingId });
      if (sent === 0) {
        // Real evidence up front — no client actually received the
        // write, no reason to wait out the full timeout for nothing.
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bus.off('guardian.ncp.pong', onPong);
        resolve({ ok: false, reason: 'ping write reached 0 clients' });
      }
    });
  }

  // ── §ONE-TAB 0.39.247 — one tab per provider, jobs take turns ──────────────
  // James (2026-09-25): "repo-agent jobs must use ONE ChatGPT tab". The
  // 0.39.237 design sent a repo job to that repo's OWN tab and, when the tab
  // had not registered within 60 s, fell back to the shared one while the
  // repo tab kept opening — the two-window symptom. Removed: a job carrying
  // an agentId now goes to the provider's one tab like any other. agentId is
  // still carried on the job, so the reply is filed under the repo that
  // asked (.response node, downloads entry, Library). One-at-a-time is
  // enforced by dispatch-pool.js (browser providers capped at 1).

  async function _doDispatch(job) {
    // §BUILT 2026-07-13 — Clear Glass command surface, not a chat provider.
    if (job.provider === 'browser') {
      let _approval;
      try {
        const raid = require('../../cortex/core/raid');
        _approval = raid._approveTool(job.source || 'unknown', String(job.command || ''), { action: 'browser' });
      } catch (e) {
        updateJob(job.id, { status: 'error', error: `RAID approval gate unavailable: ${e.message}` });
        bus.emit('guardian.job.error', { jobId: job.id, error: 'raid_unavailable', provider: 'browser' });
        return true;
      }
      if (!_approval.approved) {
        updateJob(job.id, { status: 'error', error: `RAID denied browser dispatch: ${_approval.reason}` });
        bus.emit('guardian.job.error', { jobId: job.id, error: _approval.reason, provider: 'browser' });
        return true;
      }
      updateJob(job.id, { status: 'dispatched', dispatchedAt: Date.now() });
      console.log(`[guardian] browser job → Clear Glass :7702/cmd (${job.command})`);
      const { dispatchBrowserCommand } = require('../clear-glass-bridge.js');
      let cmdData = job.content;
      if (typeof cmdData === 'string') {
        try { cmdData = JSON.parse(cmdData); } catch (_) { cmdData = { raw: cmdData }; }
      }
      dispatchBrowserCommand({ eventType: job.command, data: cmdData || {} })
        .then(result => {
          if (result.ok) {
            updateJob(job.id, { status: 'complete', response: JSON.stringify(result.result), completedAt: Date.now() });
            bus.emit('guardian.job.complete', { jobId: job.id, provider: 'browser', command: job.command });
          } else {
            updateJob(job.id, { status: 'error', error: result.error });
            bus.emit('guardian.job.error', { jobId: job.id, error: result.error, provider: 'browser' });
          }
        })
        .catch(e => {
          updateJob(job.id, { status: 'error', error: e.message });
          bus.emit('guardian.job.error', { jobId: job.id, error: e.message, provider: 'browser' });
        });
      return true;
    }

    // Mistral routes directly to ollama-bridge — no NCP browser tab needed
    if (job.provider === 'mistral') {
      updateJob(job.id, { status: 'dispatched', dispatchedAt: Date.now() });
      console.log('[guardian] mistral job → ollama-bridge :3749');
      dispatchToMistral(job).catch(e => {
        updateJob(job.id, { status: 'error', error: e.message });
        bus.emit('guardian.job.error', { jobId: job.id, error: e.message, provider: 'mistral' });
      });
      return true;
    }

    // §BUILT — James: "deepseek as a ncp provider." §RECONCILED 2026-09-02's
    // original branch always routed to ollama-bridge unconditionally, which
    // meant a real, connected chat.deepseek.com NCP tab (userscript-
    // deepseek.js, now real) could never be reached — this intercepted
    // every deepseek job before the generic NCP path below ever saw it.
    // Fixed with the same guardian-first-else-fallback precedent already
    // proven in clear-glass/src/mesh/agent-mesh.js's route() (DA1): a real,
    // connected browser tab wins; only fall back to the local ollama model
    // when no tab is connected — never removed, still a real, legitimate
    // option, just no longer unconditionally shadowing the browser path.
    if (job.provider === 'deepseek' && !ncp.isConnected('deepseek')) {
      updateJob(job.id, { status: 'dispatched', dispatchedAt: Date.now() });
      console.log('[guardian] deepseek job → ollama-bridge :3749 (no NCP tab connected)');
      dispatchToDeepseek(job).catch(e => {
        updateJob(job.id, { status: 'error', error: e.message });
        bus.emit('guardian.job.error', { jobId: job.id, error: e.message, provider: 'deepseek' });
      });
      return true;
    }

    // Ollama provider also routes to bridge (legacy path)
    if (job.provider === 'ollama') {
      updateJob(job.id, { status: 'dispatched', dispatchedAt: Date.now() });
      console.log('[guardian] ollama job → ollama-bridge :3749');
      dispatchToMistral({ ...job, provider: 'ollama' }).catch(e => {
        updateJob(job.id, { status: 'error', error: e.message });
        bus.emit('guardian.job.error', { jobId: job.id, error: e.message, provider: 'ollama' });
      });
      return true;
    }

    // §0.39.265 — a re-sent job first checks whether its answer already exists (its .response node, its chat
    // transcript): found → completed from it, never typed again (guardian/lib/job-retry.js answerFirst).
    if ((job.attempts && job.attempts.length) || job._timeoutRetries) {
      const found = typeof answerFirst === 'function' ? answerFirst(job) : null;
      if (found && typeof completeWith === 'function') {
        console.log(`[guardian] ${job.id}: answer already exists (${found.source}) — completed from it, not re-sent`);
        completeWith(job, found.text, found.chatUrl || null, found.source);
        return true;
      }
    }
    // §0.39.265 — ErosmancerOS as the fallback typist (James: "hook that in to ErosmancerOS"): after the tab
    // could not take the job twice, Clear Glass's ErosmancerOS types it into the provider's own tab with human
    // timing and presses send. The reply returns through the tab's transcript (chat-transcripts), as any other.
    if (job.transport === 'eros' && typeof erosType === 'function') {
      updateJob(job.id, { status: 'dispatched', dispatchedAt: Date.now() });
      let r;
      try { r = await erosType(job); } catch (e) { r = { ok: false, error: e.message }; }
      if (r && r.ok) {
        updateJob(job.id, { status: 'delivered', deliveredAt: Date.now(), transport: 'eros', erosTyping: { chars: r.typed, ms: r.ms, tab: r.url || null } });
        _armCompletionWatch(job);
        console.log(`[guardian] dispatched ${job.id} → ${job.provider} via ErosmancerOS (${r.typed} chars typed${r.url ? ` into ${r.url}` : ''})`);
        bus.emit('guardian.job.dispatched', { jobId: job.id, provider: job.provider, transport: 'eros' });
        bus.emit('guardian.job.progress', { jobId: job.id, provider: job.provider, stage: 'submitted', how: 'ErosmancerOS typed it and pressed send', ts: Date.now() });
        return true;
      }
      console.warn(`[guardian] ${job.id}: ErosmancerOS could not type it (${r && r.error}) — back to the tab's userscript`);
      updateJob(job.id, { transport: 'ncp', erosError: r && r.error });
    }

    // NCP: push job via SSE channel instead of WebSocket
    // ── §BUILT 2026-09-19 — mesh-first ladder (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec).
    // Guardian is the source of truth for agents: try the Clear Glass agent mesh (queue, spawn tab, inject,
    // archaeology/DOM-mapping repair) BEFORE the userscript. Default policy is 'ncp-only' (today's behaviour),
    // so nothing changes until GUARDIAN_TRANSPORT=mesh-first. 'ncp' below is the FALLBACK, not a rewrite.
    if (ladder) {
      const lr = await ladder.attempt(job);
      if (lr.kind === 'complete') {
        updateJob(job.id, { status: 'delivered', deliveredAt: Date.now(), transport: 'mesh', transportTrail: lr.trail, agentId: lr.agentId, accountId: lr.accountId });
        try { completeFromMesh(job, lr); }
        catch (e) { updateJob(job.id, { status: 'error', error: `mesh completed but guardian could not record it: ${e.message}` }); bus.emit('guardian.job.error', { jobId: job.id, error: e.message, provider: job.provider }); return true; }
        bus.emit('guardian.job.dispatched', { jobId: job.id, provider: job.provider, transport: 'mesh' });
        return true;
      }
      if (lr.kind === 'user' || lr.kind === 'failed') {
        updateJob(job.id, { status: lr.kind === 'user' ? 'needs_user' : 'error', error: lr.note || lr.error || lr.reason, transport: 'mesh', transportTrail: lr.trail });
        if (lr.kind === 'user') { try { await ladder.escalateToUser(job, lr.reason, { note: lr.note }); } catch (_) {} }
        bus.emit('guardian.job.error', { jobId: job.id, error: lr.reason, provider: job.provider, needsUser: lr.kind === 'user' });
        return true;
      }
      // v0.39.227: the mesh claim is released on fallback — the .job must never say two transports own it.
      if (lr.reason && lr.reason !== 'policy_ncp_only') updateJob(job.id, { transport: 'ncp', claimedBy: null, transportFallbackReason: lr.reason, transportTrail: lr.trail });
    }

    if (!ncp.isConnected(job.provider)) {
      if (!pendingQueue.has(job.provider)) pendingQueue.set(job.provider, []);
      pendingQueue.get(job.provider).push(job);
      updateJob(job.id, { status: 'queued', queuedAt: Date.now(),
        queueReason: (() => { try { return require('./provider-login.js').blockedReason(job.provider); } catch (_) { return null; } })() || `waiting for ${job.provider} NCP channel` });   // §0.39.280 BS16
      console.log(`[guardian] queued ${job.id} — waiting for ${job.provider} userscript`);
      bus.emit('guardian.job.queued', { jobId: job.id, provider: job.provider });
      const provUrls = {
        claude:     'https://claude.ai/new',
        chatgpt:    'https://chatgpt.com/',
        gemini:     'https://gemini.google.com/',
        perplexity: 'https://www.perplexity.ai/',
        mistral:    'https://chat.mistral.ai/',
        deepseek:   'https://chat.deepseek.com/',
      };
      const url = provUrls[job.provider];
      if (url) {
        bus.emit('guardian.tab.needed', { provider: job.provider, url, jobId: job.id });
        cockpitBroadcast({ type: 'GUARDIAN_TAB_NEEDED', provider: job.provider, url, jobId: job.id });
        console.log(`[guardian] tab needed: ${url} — job ${job.id} will flush when connected`);
        // §WIRED 2026-09-12 — James: "only have chatgpt open. the other 3
        // event driven." Real, confirmed gap: guardian.tab.needed has
        // been emitted at exactly this point all along, but nothing ever
        // listened for it — clear-glass's own providerHost.start() (real,
        // already does everything needed: persistent session partition,
        // GM shim, userscript injection) was never actually reachable
        // from here. Fire-and-forget on purpose: the job above is
        // already correctly queued regardless of whether this succeeds
        // or clear-glass is even running right now — this is a nudge to
        // spawn sooner, not the thing the job's delivery depends on.
        try {
          const http = require('http');
          // §0.39.364 — the answer is read now. James's console: "claude loadURL failed: ERR_FAILED (-2)" and the job sat
          // "waiting for claude userscript" with nothing left to wake it. When the tab did not load (clear-glass retries
          // it first, ~70 s at most), every job queued for that provider fails with the reason, so its caller moves on
          // (a phase build climbs to its next rung) instead of waiting out its own timeout.
          const req = http.request({
            host: '127.0.0.1', port: parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10),
            path: `/providers/${encodeURIComponent(job.provider)}/start`, method: 'POST', timeout: 90000,
          }, (r) => {
            let raw = ''; r.on('data', (c) => { raw += c; });
            r.on('end', () => {
              let d = null; try { d = JSON.parse(raw); } catch (_) { return; }
              if (!d || d.status !== 'failed') return;
              const waiting = (pendingQueue.get(job.provider) || []).splice(0);
              const error = `the ${job.provider} tab did not load: ${d.error || 'unknown'}`;
              console.warn(`[guardian] ${error} — failing ${waiting.length} queued job(s)`);
              for (const j of waiting) {
                updateJob(j.id, { status: 'error', error, failedAt: Date.now() });
                bus.emit('guardian.job.error', { jobId: j.id, error, provider: j.provider, tabLoadFailed: true });
              }
            });
          });
          req.on('timeout', () => req.destroy(new Error('no answer in 90 s')));
          req.on('error', (e) => console.warn(`[guardian] on-demand provider-start request failed (non-fatal, job still queued): ${e.message}`));
          req.end();
        } catch (e) { console.warn(`[guardian] could not send on-demand provider-start request: ${e.message}`); }
      }
      return false;
    }

    // Push via SSE — userscript's EventSource.onmessage receives it
    // §FIXED 2026-09-06 — see ncp.js's own _write()/push() comments for
    // the full trace. This return value used to be silently discarded —
    // ncp.isConnected() (the check above) can say true one moment and
    // the actual write can still fail the next if the socket died in
    // between (exactly what a disconnect/reconnect cycle produces), and
    // nothing here ever noticed. A job that reaches zero real clients is
    // functionally identical to "not connected" from the job's own point
    // of view, so it gets the exact same real recovery path — requeued,
    // a fresh tab requested — instead of being falsely marked delivered
    // with nothing left to ever retry it.

    // §BUILT 2026-09-13 — James: "each .job created has to wait until
    // the gate clears. the event gate sends the ping command, doesn't
    // dispatch until ping is returned, then dispatch the job." Real
    // gate, real evidence, before the real content ever goes out.
    // §FAIL-OPEN-ON-UNCERTAIN-EVIDENCE — same rule copilot/lifeline.js's
    // own _tryGuardian already uses for the identical shape of problem
    // (fail CLOSED when you have real evidence something is wrong, fail
    // OPEN when you have none): a ping timeout alone doesn't prove the
    // tab is dead — the ack could have been dropped, delayed, or the
    // main thread briefly busy with something else entirely legitimate.
    // Only refuse to dispatch when the ping AND the passive heartbeat
    // both say the same thing — two independent signals agreeing is
    // real evidence; one uncertain signal alone is not.
    updateJob(job.id, { status: 'pinging', pingedAt: Date.now() });
    const ping = await _pingProvider(job.provider);
    if (!ping.ok && !ncp.isConnected(job.provider)) {
      if (!pendingQueue.has(job.provider)) pendingQueue.set(job.provider, []);
      pendingQueue.get(job.provider).push(job);
      updateJob(job.id, { status: 'queued', queuedAt: Date.now(),
        queueReason: `ping gate failed (${ping.reason}) and heartbeat also stale — real evidence, not dispatching blind` });
      console.log(`[guardian] ${job.id} → ${job.provider}: ping gate failed (${ping.reason}), heartbeat also stale — requeued`);
      bus.emit('guardian.job.queued', { jobId: job.id, provider: job.provider, reason: 'ping_gate_failed' });
      return false;
    }
    if (!ping.ok) {
      console.warn(`[guardian] ${job.id} → ${job.provider}: ping gate did not clear (${ping.reason}) but heartbeat is still healthy — dispatching anyway (uncertain evidence, not refusing on it alone)`);
    }

    // §FIXED 2026-09-15 — James: "it doubles every time." Was ncp.push(),
    // which broadcasts a job to every client registered for this
    // provider — the real source of doubled dispatch/acks/completion
    // when clear-glass legitimately has more than one live client for
    // one provider (pre-warm overlapping the real tab, or two windows
    // briefly coexisting mid-restart). pushActive() targets exactly the
    // one client currently tracked as active for this provider — see
    // guardian/lib/ncp.js's own §FIXED note on why nothing gets force-
    // closed to make that true, just correctly aimed.
    //
    // §ONE-TAB 0.39.247 — every job, repo or not, goes to the provider's one
    // active tab (pushActive). The 0.39.237/TR1 per-repo tab routing
    // (pushTab by agentId, wait for the repo tab, fall back after 60 s) is
    // removed — see the §ONE-TAB note above _doDispatch. The job keeps its
    // agentId so the reply is still filed under the repo that asked.
    // 0.39.259 — James: "conversations need back and forth, also persistent chaturl". A repo agent's job
    // carries the chat that agent was last talking in; the tab opens it before typing, so every turn lands
    // in one conversation — across a guardian restart or a tab that wandered to another chat.
    // GUARDIAN_RESUME_CHAT=0 turns it off (every job runs wherever the tab is, as before).
    let resumeChatUrl = null;
    if (typeof chatFor === 'function' && process.env.GUARDIAN_RESUME_CHAT !== '0') {
      try { resumeChatUrl = chatFor(job) || null; } catch (e) { console.warn(`[guardian] ${job.id}: chat lookup failed (job runs where the tab is): ${e.message}`); }
    }
    // §0.39.279 — a job that names its chat (a wake answered from that chat's transcript) goes back to it, whatever
    // chat the agent last used; only a real, resumable chat URL of this provider is honoured.
    if (job.chatUrl && process.env.GUARDIAN_RESUME_CHAT !== '0') {
      try { resumeChatUrl = require('./chat-transcripts.js').resumableChatUrl(job.provider, job.chatUrl) || resumeChatUrl; } catch (_) {}
    }
    const payload = {
      type: 'GUARDIAN_JOB', jobId: job.id, command: job.command,
      provider: job.provider, prompt: job.prompt, content: job.content,
      tools: job.tools || null,
      hat: job.hat || null,
      resumeChatUrl,
      // §0.39.266 — the agent has no chat of its own yet: the tab opens a new one (and does not wait for earlier turns)
      newChat: !!(resumeChatUrl && require('./chat-transcripts.js').isNewChatUrl(resumeChatUrl)),
    };
    const sent = ncp.pushActive(job.provider, payload);
    const via = job.agentId ? `the ${job.provider} tab, for ${job.agentId}` : `the ${job.provider} tab`;
    if (sent === 0) {
      if (!pendingQueue.has(job.provider)) pendingQueue.set(job.provider, []);
      pendingQueue.get(job.provider).push(job);
      updateJob(job.id, { status: 'queued', queuedAt: Date.now(),
        queueReason: `NCP reported connected for ${job.provider} but the real write reached zero clients — socket likely stale` });
      console.log(`[guardian] ${job.id} → ${job.provider}: NCP said connected, real write reached 0 clients — requeued, not falsely marked delivered`);
      bus.emit('guardian.job.queued', { jobId: job.id, provider: job.provider, reason: 'stale_socket' });
      return false;
    }
    updateJob(job.id, { status: 'delivered', deliveredAt: Date.now() });
    _armCompletionWatch(job);
    // §FIXED 2026-09-15 — pushActive() only ever returns 0 or 1 now (single-
    // target, not a broadcast count), so the old "(N clients)" phrasing was
    // stale — always printed "(1 client)" and implied a fan-out that no
    // longer happens. Says what actually occurred instead.
    console.log(`[guardian] dispatched ${job.id} → ${job.provider} via NCP (${via})${resumeChatUrl ? ` · chat ${resumeChatUrl}` : ''}`);
    try {
      const alk = require('../../intelligence/alk');
      alk.record({
        actor:   'llm',
        intent:  'generate',
        payload: { jobId: job.id, provider: job.provider, command: job.command, promptHash: job.prompt?.slice(0,40) },
      });
    } catch(_) {}
    bus.emit('guardian.job.dispatched', { jobId: job.id, provider: job.provider });
    return true;
  }

  return { dispatchJob, _doDispatch, pool: _dispatchPool };
}

module.exports = { createDispatcher };
