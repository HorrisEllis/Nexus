'use strict';
/**
 * guardian/lib/ncp-handler.js — the NCP message handler, decompiled out of
 * guardian/server.js.
 * comp_id: nexus.guardian.lib.ncp-handler
 * UUID: nexus-guardian-ncp-handler-v1-0000-2026-0902-002
 *
 * WHY: _handleNCPMessage (server.js 507-1038 pre-decomposition — the
 * single largest remaining logic block per guardian-decomposition's own
 * MANIFEST.md) is the real NCP protocol handler: every GUARDIAN_ and NCP_
 * prefixed message a browser-tab userscript sends over its SSE channel — chunk
 * streaming, completion, gaps, errors, artifacts, SEAM resume/abrupt-stop,
 * session naming — lands here. This is also where dispatch-pool-bridge.js's
 * `guardian.job.complete`/`guardian.job.error` bus events actually
 * originate for the NCP path (browser/mistral/ollama/deepseek dispatch
 * emit them directly in dispatcher.js; NCP-path completion arrives later,
 * asynchronously, as a real message from the tab — this file).
 *
 * Moved verbatim, not reimplemented — every §-tagged comment kept, because
 * each one explains a real fixed bug or a real design decision (SEAM
 * routing on completion/error/abrupt-stop, the chunk-accumulator batching
 * threshold, the currentJobId ReferenceError fix, the ack-only cases that
 * exist specifically to stop log-spam/false-flapping-detection).
 *
 * DEPENDENCIES — this function is the most heavily coupled piece
 * extracted from server.js so far. Two are required directly because
 * they're real, independent, stateless utility modules (same as
 * jobs.js requiring intent-hat-router/hat-forge directly):
 *   - GapHunter (../../intelligence/gap/hunter)
 *   - Detector  (../../lib/seam/detector.js)
 * Everything else is injected because it's a stateful singleton or a
 * still-inline function server.js owns and this file must share the
 * exact same instance/reference, not a new one:
 *   nc              — nexus-connect client (nullable; original `if (!nc)` guards kept)
 *   ncp             — the NCP server (push/updateClient)
 *   bus             — SISOStream event bus
 *   jaa             — the guardian JaaStore instance (guardian/lib/jobs.js's
 *                     _suggestJobHat doesn't touch jaa, so this is this
 *                     file's own, separate real dependency)
 *   jobs            — the same Map guardian/lib/jobs.js's createJobStore() owns
 *   updateJob       — guardian/lib/jobs.js's updateJob
 *   cockpitBroadcast — server.js's SSE broadcast to Forge/cockpit clients
 *   physQueue       — lib/queue's createQueue() instance (conversation logging)
 *   baseline        — intelligence/baseline's createBaseline() instance
 *   evLedger        — intelligence/cfr/ledger's createCFRLedger() instance
 *                     (optional — original uses `_evLedger?.record(...)`)
 *   activeQueues    — the SEAM compartment registry Map (still inline in
 *                     server.js — SEAM/queue-flush decomposition is real,
 *                     separate, not-yet-done work per MANIFEST.md)
 *   extractCodeBlocks       — still inline in server.js (artifact
 *                             extraction, also not-yet-done per MANIFEST.md)
 *   extractToolCallsFromDOM — pure function, no deps of its own, still
 *                             inline in server.js — injected rather than
 *                             duplicated
 *   findActiveSeamCompartment — closes over server.js's `_activeQueues`;
 *                             injected as a function reference rather than
 *                             reimplemented against the injected Map, to
 *                             guarantee identical behavior with zero risk
 *                             of the two copies drifting
 *
 * NOT extracted here, honestly: extractCodeBlocks, _extractToolCallsFromDOM,
 * _findActiveSeamCompartment, and _activeQueues stay inline in server.js —
 * this file takes them as injected dependencies rather than pulling the
 * whole SEAM/artifact-extraction subsystem along with it in the same pass.
 * That's real, separate, larger work (SEAM queue routing has its own
 * watchdog/retry state machine) — see MANIFEST.md's own "not yet traced"
 * list, unchanged by this extraction.
 */

const GapHunter = require('../../intelligence/gap/hunter');
const { Detector } = require('../../lib/seam/detector.js');

/**
 * createNCPMessageHandler(deps) → _handleNCPMessage(msg)
 *
 * Returns the handler function itself (not wrapped in an object) because
 * server.js's createNCPServer({ onMessage: ... }) wants a plain function,
 * and the original relied on per-call-site static properties
 * (_handleNCPMessage._buf / ._count) for the chunk accumulator — that
 * exact pattern is preserved on the returned function so behavior is
 * identical, not just equivalent.
 */
function createNCPMessageHandler(deps) {
  const {
    nc, ncp, bus, jaa, jobs, updateJob, cockpitBroadcast,
    physQueue, baseline, evLedger, activeQueues,
    extractCodeBlocks, extractToolCallsFromDOM, findActiveSeamCompartment,
    retry,   // 0.39.265 — optional () => guardian/lib/job-retry.js instance (late-bound)
  } = deps;
  for (const [name, v] of Object.entries({
    ncp, bus, jaa, jobs, updateJob, cockpitBroadcast, physQueue, baseline,
    extractCodeBlocks, extractToolCallsFromDOM, findActiveSeamCompartment,
  })) {
    if (!v) throw new Error(`[ncp-handler] missing required dependency: ${name}`);
  }
  if (!(activeQueues instanceof Map)) {
    throw new Error('[ncp-handler] activeQueues must be the same Map instance server.js reads elsewhere');
  }
  // nc and evLedger are legitimately nullable — original code guards both
  // (`if (!nc)`, `_evLedger?.record(...)`), not required here.

  function _handleNCPMessage(msg) {
    const { type, jobId, tabId, text, content, lang, hash,
            gaps, error, gate, chatUrl, chatId, account, hatUsed } = msg;
    // 0.39.259 — the userscripts' GUARDIAN_COMPLETE / GUARDIAN_ERROR / GUARDIAN_PROGRESS bodies carry no `provider`
    // (ncpPost adds chatUrl + account only). guardian.job.complete then went out with provider undefined,
    // dispatch-pool-bridge dropped it as malformed, and the one chatgpt slot was never released: job 2 completed,
    // job 3 was created and never dispatched ("only works once"). The job knows its own provider.
    const _jobForProvider = jobId ? jobs.get(jobId) : null;
    const provider = msg.provider || (_jobForProvider && _jobForProvider.provider) || undefined;

    // ── §5.2 Cortex write — every significant userscript event reaches cortex ──
    // Fire-and-forget: timeout 2s, never block the NCP response.
    function _toCortex(eventType, payload) {
      if (!nc) return;
      nc._req('cortex', 'POST', '/api/event', {
        type:     eventType,
        payload:  { ...payload, _provider: provider, _chatUrl: chatUrl, _account: account },
        source:   'guardian-ncp',
        causedBy: jobId || null,
        ts:       Date.now(),
      }, 2000).catch(() => {});
    }

    // Chunk accumulator — flush to cortex every 5 chunks or ≥500 chars
    // Avoids per-token writes while keeping cortex alive with stream data
    if (!_handleNCPMessage._buf)   _handleNCPMessage._buf   = {};
    if (!_handleNCPMessage._count) _handleNCPMessage._count = {};

    switch(type) {

      case 'GUARDIAN_REGISTER':
      case 'NCP_REGISTER': {
        // Provider registered via GET /channel — already handled by NCP onConnect.
        // Propagate claimed/chatId into the NCP client entry NOW so that
        // GET /providers returns the correct state immediately, without waiting
        // for the first heartbeat (HB_MS = 8 s). Fixes the UI badge staying at
        // "NO TAB CONNECTED" or "CONNECTED · PASSIVE" for the first 8 s.
        if (tabId) {
          ncp.updateClient(provider, tabId, {
            claimed: msg.claimed ?? false,
            chatId:  msg.chatId  ?? null,
          });
        }
        ncp.push(provider, { type: 'GUARDIAN_READY', provider, ts: Date.now() });
        bus.emit('guardian.provider.registered', { provider, tabId });
        break;
      }

      case 'GUARDIAN_DELIVERED':
      case 'NCP_DELIVERED': {
        if (jobId) {
          updateJob(jobId, { status: 'delivered_confirmed', confirmedAt: Date.now() });
          bus.emit('guardian.job.confirmed', { jobId, provider });
        }
        break;
      }

      case 'GUARDIAN_CHUNK':
      case 'NCP_CHUNK': {
        if (jobId && text) {
          const full = msg.full || null;
          // §RENAMED 2026-09-13 — James: "why not job.responding then
          // job.complete?" was 'streaming'; renamed for the clearer real
          // lifecycle story (pinging -> dispatched -> responding ->
          // complete). Checked first: zero real strict-equality readers
          // of the old string anywhere in the codebase, safe rename.
          updateJob(jobId, { status: 'responding', lastChunk: Date.now() });
          // 0.39.256 — reset: this chunk replaces the reply so far (a re-render, not a continuation); source: 'transcript' when the userscript's 500 ms transcript streamer sent it
          bus.emit('guardian.job.chunk', { jobId, text, full, provider, anchor: msg.anchor || null, mutations: msg.mutations ?? null, generating: msg.generating ?? null, reset: !!msg.reset, source: msg.source || null });
          cockpitBroadcast({ type: 'job.chunk', jobId, text, full, provider, ts: Date.now() });

          // ── Stream to cortex: batch before writing ────────────────────────
          _handleNCPMessage._buf[jobId]   = (_handleNCPMessage._buf[jobId]   || '') + text;
          _handleNCPMessage._count[jobId] = (_handleNCPMessage._count[jobId] || 0)  + 1;
          const bufLen   = _handleNCPMessage._buf[jobId].length;
          const chunkCnt = _handleNCPMessage._count[jobId];
          if (bufLen >= 500 || chunkCnt % 5 === 0) {
            const batch = _handleNCPMessage._buf[jobId];
            _handleNCPMessage._buf[jobId] = '';
            _toCortex('guardian.job.stream', {
              jobId, provider, text: batch.slice(0, 2000), chars: batch.length,
              chunkIndex: chunkCnt, fullLen: full ? full.length : bufLen,
            });
          }
        }
        break;
      }

      case 'GUARDIAN_COMPLETE':
      case 'NCP_COMPLETE': {
        if (jobId) {
          const finalText = text || content || '';
          const job = jobs.get(jobId);

          // 0.39.259 — an EMPTY completion from a tab is not a reply. James's run: job 2 was sent into the
          // same chat, ChatGPT rendered the new assistant turn empty for a moment, the watch read '' three
          // times as "stable" and completed the job with 0 chars; the real reply landed in the transcript
          // 10 s later, but the job was already 'complete' so the transcript path skipped it, and the Agent
          // tab showed "job completed but carried no response text". Now: withhold it, keep the job open,
          // and let the transcript (guardian/lib/chat-transcripts.js) complete it with the real text.
          // Bounded — if no transcript carries a reply within EMPTY_REPLY_GRACE_MS the job fails loudly.
          if (!String(finalText).trim() && msg.source !== 'transcript' && job
              && job.status !== 'complete' && job.status !== 'error' && job.status !== 'failed'
              && !findActiveSeamCompartment(jobId)) {
            const graceMs = require('../options.js').get('jobs.empty_reply_grace_ms');   // §OP1
            updateJob(jobId, { status: 'awaiting_transcript', emptyCompletionAt: Date.now(), ...(chatUrl ? { chatUrl } : {}) });
            console.warn(`[guardian] job ${String(jobId).slice(0, 8)} — the ${provider || '?'} tab reported an EMPTY reply; withheld, waiting up to ${Math.round(graceMs / 1000)}s for the chat transcript to carry the real one`);
            bus.emit('guardian.job.progress', { jobId, provider, stage: 'empty-reply-withheld', how: 'waiting for the chat transcript', chatUrl: chatUrl || null, ts: Date.now() });
            const t = setTimeout(() => {
              const j = jobs.get(jobId);
              if (!j || j.status !== 'awaiting_transcript') return;
              const err = `the ${provider || 'provider'} tab reported an empty reply and no chat transcript carried one within ${Math.round(graceMs / 1000)}s`;
              updateJob(jobId, { status: 'error', error: err, failedAt: Date.now() });
              console.warn(`[guardian] job ${String(jobId).slice(0, 8)} — ${err}`);
              bus.emit('guardian.job.error', { jobId, provider, agentId: j.agentId || null, error: err, gate: 'empty_reply' });
            }, graceMs);
            if (t && t.unref) t.unref();
            break;
          }

          // ── SEAM queue routing ────────────────────────────────────────────
          // A SEAM-dispatched chunk's jobId is never in the `jobs` Map (that's
          // for raw jobs only) — this is the only place its response goes.
          // §LAW II: onResponse() writes DETECTING to JAA before evaluating.
          const seamQueue = findActiveSeamCompartment(jobId);
          if (seamQueue) {
            seamQueue.onResponse(jobId, finalText);
          }
          // Fall through — gap/artifact extraction below is generically useful
          // for SEAM-generated content too, so it still runs either way.
          // Store response text on job so /response/:jobId can serve it
          if (job) {
            // 2026-09-19: this was slice(0, 100000), a SILENT cap: a whole-code-base answer is routinely several
            // times that and lost its tail with no signal. The cap is now generous, configurable, and flagged.
            const _MAX = require('../options.js').get('jobs.max_response_chars');   // §OP1
            job.responseText = finalText.slice(0, _MAX);
            job.responseTruncated = finalText.length > _MAX;
            if (job.responseTruncated) console.warn(`[guardian] ${jobId}: response of ${finalText.length} chars truncated to ${_MAX} (guardian option jobs.max_response_chars)`);
            job.status = 'complete';
            // §WIRED 2026-08-14 — the tool-call half of P4. See
            // _extractToolCallsFromDOM's header note: this is the one real
            // producer for job.tool_calls, which /command/tools's
            // resolveJob has been reading since P4 shipped with nothing
            // ever writing it.
            job.tool_calls = extractToolCallsFromDOM(finalText);
            // §BUILT 2026-09-08 — James: "the listener for the tools.
            // like when an agent uses one in guardian, from the sse?"
            // Real gap: job.tool_calls was written but nothing ever
            // emitted a real, distinct event for it — only discovered
            // later by /command/tools's own polling. This is the real,
            // live moment a tool call is actually detected.
            if (job.tool_calls && job.tool_calls.length) {
              bus.emit('guardian.tool.called', { jobId, provider, calls: job.tool_calls, ts: Date.now() });
            }
          }

          // Feed event to baseline monitor
          const latencyMs = job?.startedAt ? Date.now() - job.startedAt : 0;
          baseline.observe({ type: 'GUARDIAN_COMPLETE', latencyMs, error: false, ts: Date.now() });

          // §LAW II — log conversation turn before artifact processing
          // (jobId is already guaranteed truthy here — the outer `currentJobId`
          // reference was leftover from the browser-side userscripts, which
          // declare that variable in their own module scope; it doesn't exist
          // in this process and was throwing ReferenceError on every completion)
          if (jobId) {
            // 0.39.258 — a transcript completion carries chatUrl, not chatId. The URL itself was used as the
            // directory name ('https:\\chatgpt.com\\c\\…' on Windows → ENOENT), and the throw escaped this case
            // AFTER job.status='complete' but BEFORE the completion was announced, so the tab's next job waited
            // forever behind it ("didn't work a second time"). The chat's own id is the URL's last segment;
            // lib/queue.js now also refuses any path in a session id. A conversation-log failure is logged
            // loudly and never stops a completion (§1.2).
            const urlId = chatUrl ? String(chatUrl).split(/[?#]/)[0].split('/').filter(Boolean).pop() : null;
            const sessionId = String(chatId || urlId || jobId || 'unknown');
            try {
              physQueue.logConversation(sessionId.slice(0, 40), {
                role:      'assistant',
                content:   (finalText || '').slice(0, 10000),
                jobId,
                provider:  provider || 'unknown',
                ts:        Date.now(),
              });
            } catch (e) {
              console.warn(`[guardian] ${jobId}: conversation log write failed (completion continues): ${e.message}`);
            }
          }

          // §LAW II — write artifact files to disk before JAA insert
          // Chunks and synthesized output written as real files
          const codeBlocks = extractCodeBlocks(finalText, provider || 'ai');
          if (codeBlocks.length > 0) {
            const outDir = require('path').join(
              __dirname, '..', '..', 'data', 'output',
              new Date().toISOString().slice(0, 10),
              jobId.slice(0, 8)
            );
            require('fs').mkdirSync(outDir, { recursive: true });
            for (const block of codeBlocks) {
              const filepath = require('path').join(outDir, block.filename);
              require('fs').writeFileSync(filepath, block.content, 'utf8');
            }
            bus.emit('guardian.artifacts.written', {
              jobId, outDir, count: codeBlocks.length,
              files: codeBlocks.map(b => b.filename),
            });

            // §SR3 2026-09-03 — artifact-extraction -> introspect bridge.
            // James: "artifact extraction also can connect to the
            // introspect tool" — this IS the real mechanism behind "doubt
            // and attack its outputs." Fire-and-forget: this handler must
            // stay a plain, synchronous function (createNCPServer's
            // contract, see this file's own header) — introspect.examine()
            // is async, so it runs after this handler returns and never
            // blocks or delays the real completion path above. Failure
            // here must never affect the artifacts already written — they
            // are real and on disk regardless of what introspect finds.
            try {
              require('../../lib/introspect.js').examine({
                prompt:     job?.prompt || null,
                response:   finalText,
                requestId:  jobId,
                sessionId:  chatId || chatUrl || null,
                intent:     job?.command || null,
              }).then(verdict => {
                try {
                  require('fs').writeFileSync(
                    require('path').join(outDir, '_introspect.json'),
                    JSON.stringify(verdict, null, 2), 'utf8'
                  );
                } catch (_) {}
                bus.emit('guardian.artifacts.examined', {
                  jobId, outDir, verdict: verdict.verdict, confidence: verdict.confidence,
                });
                try {
                  require('../../lib/component-ledger.js').write({
                    system: 'guardian', component: 'ncp-handler.artifact-introspect', action: 'examine',
                    status: (verdict.verdict === 'WRONG' || verdict.verdict === 'SUSPECT') ? 'warn' : 'info',
                    detail: { verdict: verdict.verdict, confidence: verdict.confidence, readable: verdict.readable, total: verdict.total },
                    session: jobId,
                  });
                } catch (_) {}
              }).catch(err => {
                console.warn(`[ncp-handler] introspect.examine failed for job ${jobId}: ${err.message}`);
              });
            } catch (err) {
              console.warn(`[ncp-handler] introspect bridge setup failed for job ${jobId}: ${err.message}`);
            }
          }

          // §FIX 2026-09-22 — James: "creates the job, dispatches the job,
          // gets the acknowledgment but no completion." Root cause: this
          // whole enrichment stretch (gap analysis through chat-log,
          // ~130 lines) had no outer safety net, and guardian/lib/ncp.js's
          // /result handler sends its HTTP 200 BEFORE onMessage() runs —
          // so its own catch()'s res.headersSent guard is already true by
          // the time an exception here would reach it. Any throw in here
          // was silently swallowed: no log, no retry, job stuck at
          // "dispatched" forever. GapHunter/Detector were the two calls
          // with no try/catch at all (found first, by direct read); every
          // step below is now individually guarded so a failure in ONE
          // degrades that step, not the whole completion.
          let gaps = [], gapDrift = null;
          try {
            gaps = GapHunter.analyze(finalText);
            gapDrift = GapHunter.drift(gaps);
            if (gaps.length > 0) {
              for (const g of gaps) {
                jaa.insert('gaps', { uuid: require('crypto').randomUUID(),
                  jobId, provider, type: g.type, domain: g.domain,
                  reason: g.reason, description: g.description,
                  score: g.score, evidence: g.evidence, ts: Date.now() });
              }
              bus.emit('guardian.gaps', { jobId, gaps, drift: gapDrift, provider });
            }
          } catch (e) { console.error(`[guardian] gap analysis failed for job ${jobId} (completion continues without it): ${e.message}`); }

          // Server-side detector — only if we have a SEAM chunk to compare against
          let detection = null;
          try {
            if (job?.seam_chunk_content) {
              const profile = Detector.profile(job.seam_chunk_content);
              detection = Detector.evaluate(finalText, job.seam_chunk_content, profile, job.axioms || []);
              bus.emit('guardian.detection', { jobId, ...detection });
            }
          } catch (e) { console.error(`[guardian] detector failed for job ${jobId} (completion continues without it): ${e.message}`); }

          updateJob(jobId, {
            status: 'complete', response: finalText, completedAt: Date.now(),
            gaps: gaps.length, gapDrift, detection,
          });
          // §CODE-ARTIFACT — the listener. Now one shared implementation
          // (guardian/lib/code-artifact.js onJobComplete) called from
          // every real completion point, instead of living inline here
          // and nowhere else.
          let codeArtifact = null;
          try {
            const { onJobComplete } = require('./code-artifact.js');
            const jobRec = jobs.get(jobId) || { id: jobId, provider };
            codeArtifact = onJobComplete({ job: jobRec, text: finalText, bus });
          } catch (e) {
            console.warn(`[guardian] code-artifact listener failed for job ${jobId} (non-fatal): ${e.message}`);
          }

          // §BUILT 2026-09-22 — James: "yes, do it" (route this completion
          // through response-sink.js instead of a separate, parallel,
          // less-robust implementation). The manual jaa.insert('artifacts',
          // ...) this replaced is now writeLedger()'s own job inside
          // deliver() below — same table, same shape, plus the codeArtifact
          // fields passed through. Not called here: deliver() itself emits
          // guardian.job.complete (see below) — this block now only feeds
          // it codeArtifact for the artifacts row.

          // §CHAT-LOG: persist every exchange for context injection and querying
          // Queryable via GET /api/memory?table=chat_log
          // Used by context-builder to surface recent completions to Ollama
          try {
            const jobRec = jobs.get(jobId);

            // ── Chat logger — full exchange to disk + JAA + vector index ─────
            try {
              const cl = require('../../lib/chat-logger');
              if (!cl.getSession()) cl.startSession({ meta: { source: 'guardian' } });
              const agentIdentity = require('../../lib/agent-identity');
              const resolvedIdentity = agentIdentity.resolveIdentity({ provider, hat: jobRec?.hat });

              // §BUILT 2026-09-17 — James: "guardian is the source of
              // truth for agents." Real, closed loop: guardian dispatches
              // a hat, the userscript honestly reports whether it actually
              // used it (see userscript-chatgpt.js's own §BUILT note —
              // hatHdr can fall through to intel/legacy context on a real,
              // common mismatch), and THAT divergence is exactly the kind
              // of observational claim lib/agent-model.js exists
              // to hold — not "the agent is bad," a real, specific, dated
              // fact about one dispatch. Silent otherwise: a hat that was
              // requested and actually used is not a claim worth logging
              // on every single job, only the real exceptions are.
              if (hatUsed && jobRec?.hat && hatUsed.usedPath !== 'hat') {
                try {
                  const agentModel = require('../../lib/agent-model');
                  agentModel.observe(resolvedIdentity,
                    `requested hat ${jobRec.hat.name || jobRec.hat} but fell back to ${hatUsed.usedPath} context`,
                    'failure_mode', { jobId, source: 'userscript_hatUsed' }, 0.5);
                } catch (_) {} // agent-model not initialized in this process is a real, non-fatal state
              }

              // Log the prompt (user turn)
              if (jobRec?.prompt) {
                cl.log({ role:'user', content: jobRec.prompt, provider: provider||'ollama',
                  jobId, intent: jobRec.command, outcome:'complete', chatUrl, account,
                  agentId: resolvedIdentity }).catch(()=>{});
              }
              // §FIXED 2026-09-06 — James: "all chats from the ncp need to
              // log to the chat log index." Real, confirmed gap: this
              // block's own comment already says "full exchange to disk +
              // JAA + vector index," but only the user's PROMPT (above)
              // ever reached cl.log() — the actual real function that
              // writes to disk, to jaaDB, AND embeds via vector-memory.js
              // for real semantic search (confirmed by reading lib/chat-
              // logger.js's own log() directly before writing this, not
              // assumed). The agent's own response — half of every real
              // exchange — only ever reached the separate, raw
              // jaa.insert('chat_log', ...) below, which writes a row but
              // never embeds it: no disk log, no real index entry, not
              // findable by any real semantic search over past chats.
              // Symmetric fix: the real response gets the exact same
              // real treatment the prompt already had.
              if (finalText) {
                cl.log({ role:'assistant', content: finalText, provider: provider||'ollama',
                  jobId, intent: jobRec?.command || null, outcome:'complete', chatUrl, account,
                  agentId: resolvedIdentity }).catch(()=>{});
              }
            } catch(_) {}

            jaa.insert('chat_log', {
              uuid:       require('crypto').randomUUID(),
              jobId,
              provider:   provider || 'unknown',
              prompt:     (jobRec?.prompt || '').slice(0, 2000),
              response:   finalText.slice(0, 5000),
              tokensIn:   Math.ceil((jobRec?.prompt || '').length / 4),
              tokensOut:  Math.ceil(finalText.length / 4),
              gapCount:   gaps.length,
              chatUrl,
              account,
              ts:         Date.now(),
              source:     'ncp',
            });
          } catch(e) { console.error(`[guardian] failed to insert chat_log record for job ${jobId}: ${e.message}`); }

          // §23.7 — include gapUuid and meta in the complete event so gap-loop's
          // closure verifier can find the gap and run verifyClosure immediately
          //
          // §BUILT 2026-09-22 — James: "verify the .response node or
          // artifact on disk using downloads manager. or event ledger in
          // clearglass" / "yes, do it." This used to be a manual
          // bus.emit('guardian.job.complete', ...) — the ONE real place
          // completion was signaled, with no other sink. Now routes
          // through guardian/lib/response-sink.js's deliver(): the SAME
          // event fires (emitToStream runs synchronously, first, inside
          // deliver — the signal is not delayed by anything below), PLUS
          // three more independent, durable sinks that never existed for
          // an NCP-dispatched job before this: a .response node under
          // guardian/data/nodes/response/ (survives a guardian restart,
          // where jobs — an in-memory Map — would not), Clear Glass's own
          // downloads manager, and the CFR ledger. Any one of node/ledger
          // being durable means synthesize(jobId) (response-sink.js) can
          // reconstruct a stuck-looking job's real answer even if this
          // whole process died before doing anything else. deliver() is
          // NOT awaited — its own sinks run and report independently;
          // this handler has never awaited completion side-effects, and
          // the one thing that MUST happen synchronously (the bus.emit)
          // already does, by the time this call returns control.
          const jobRec2 = jobs.get(jobId);
          require('./response-sink.js').deliver({
            jobId, provider, text: finalText, status: 'complete', source: 'ncp',
            agentId: jobRec2?.agentId || null, // §0.39.246 — the downloads entry is filed under the repo that asked
            prompt: jobRec2?.prompt || null, chatUrl, gaps: gaps.length, gapDrift,
            command: jobRec2?.command || null,
            codeArtifact: codeArtifact && codeArtifact.ok ? codeArtifact : null,
            meta: {
              gapUuid:     jobRec2?.gapUuid    || null,
              gapType:     jobRec2?.gapType    || null,
              raidAgent:   jobRec2?.raidAgent  || provider,
              source:      jobRec2?.source     || 'guardian',
              contractUuid:jobRec2?.contractUuid||null,
            },
          }, { bus, jaa, evLedger, updateJob }).catch(e =>
            console.error(`[guardian] response-sink.deliver failed for job ${jobId} (the completion SIGNAL already fired — this only affects the extra durable sinks): ${e.message}`));
          cockpitBroadcast({ type: 'job.complete', jobId, provider,
            chars: finalText.length, gaps: gaps.length, gapDrift, ts: Date.now() });

          // ── §2.1 Write full response + gaps + artifacts to cortex ─────────
          // Clear chunk buffer for this job
          delete _handleNCPMessage._buf[jobId];
          delete _handleNCPMessage._count[jobId];

          if (nc) {
            // 1. Full response to cortex (cortex_memory + agent_messages via WELL_KNOWN router)
            nc._req('cortex', 'POST', '/api/event', {
              type:    'guardian.job.complete',
              payload: {
                jobId, provider, chars: finalText.length,
                response:    finalText.slice(0, 8000),
                gaps:        gaps.length, gapDrift, detection: detection || null,
                chatUrl, account, completedAt: Date.now(),
              },
              source: 'guardian-ncp', causedBy: jobId, ts: Date.now(),
            }, 3000).catch(() => {});

            // 2. Each gap → cortex gaps table
            for (const g of gaps) {
              nc._req('cortex', 'POST', '/api/event', {
                type:    'cortex.gap.found',
                payload: {
                  jobId, provider, type: g.type, domain: g.domain,
                  reason: g.reason, description: g.description,
                  score: g.score, evidence: g.evidence, source: 'guardian-gaphunter',
                },
                source: 'guardian-ncp', causedBy: jobId, ts: Date.now(),
              }, 1500).catch(() => {});
            }

            // 3. Each extracted code block → cortex artifacts table
            for (const block of codeBlocks.slice(0, 8)) {
              nc._req('cortex', 'POST', '/api/event', {
                type:    'guardian.artifact.extracted',
                payload: {
                  jobId, provider, filename: block.filename,
                  lang: block.lang || null, chars: (block.content || '').length,
                  content: (block.content || '').slice(0, 4000), chatUrl,
                },
                source: 'guardian-ncp', causedBy: jobId, ts: Date.now(),
              }, 1500).catch(() => {});
            }
          }
        }
        break;
      }

      case 'GUARDIAN_ARTIFACT':
      case 'NCP_ARTIFACT': {
        // §FOUND & FIXED 2026-09-07 — non-string content crashed on .slice().
        const safeContent = typeof content === 'string' ? content : JSON.stringify(content ?? '');
        if (jobId && content) {
          const artId = require('crypto').randomUUID();
          jaa.insert('artifacts', {
            uuid: artId, jobId, provider: provider || 'unknown',
            content: safeContent.slice(0, 4000), lang: lang || 'text',
            hash, ts: Date.now(), chatUrl,
          });
          ncp.push(provider, { type: 'GUARDIAN_ARTIFACT_SAVED', jobId, artifactId: artId, ts: Date.now() });
          bus.emit('guardian.artifact', { jobId, artifactId: artId, provider });
          // Write to cortex artifacts table
          _toCortex('guardian.artifact', {
            jobId, artifactId: artId, lang: lang || 'text', hash,
            chars: safeContent.length, content: safeContent.slice(0, 4000), chatUrl,
          });
        }
        break;
      }

      case 'GUARDIAN_GAPS':
      case 'NCP_GAPS': {
        if (gaps?.length) {
          bus.emit('guardian.gaps', { jobId, gaps, provider });
          cockpitBroadcast({ type: 'job.gaps', jobId, gaps, ts: Date.now() });
          // Write each gap to cortex gaps table
          for (const g of gaps) {
            _toCortex('cortex.gap.found', {
              jobId, provider, type: g.type, domain: g.domain,
              reason: g.reason, description: g.description,
              score: g.score, source: 'userscript-detector',
            });
          }
        }
        break;
      }

      // §SUBMIT-EVIDENCE 2026-09-23 — stage reports from the page, so a run's
      // log shows WHERE a job stopped rather than going quiet after dispatch.
      case 'GUARDIAN_PROGRESS':
        // 0.39.259 — 'resuming-chat': the tab is loading the job's own chat (dispatcher.js resumeChatUrl) and
        // will disconnect for the reload; the dispatcher must not requeue the job for that. Any later stage
        // from the job means the tab is back, so a real disconnect after it is handled as before.
        if (jobId && jobs.get(jobId)) {
          if (msg.stage === 'resuming-chat') updateJob(jobId, { resumingChatAt: Date.now(), resumeChatUrl: msg.how || null });
          else if (jobs.get(jobId).resumingChatAt) updateJob(jobId, { resumingChatAt: null });
        }
        // 0.39.244 — anchor/mutations/generating: the page's own evidence (the node read, how much it changed)
        bus.emit('guardian.job.progress', { jobId: msg.jobId, provider, stage: msg.stage, how: msg.how, chatUrl: msg.chatUrl, anchor: msg.anchor || null, mutations: msg.mutations ?? null, generating: msg.generating ?? null });
        break;

      case 'GUARDIAN_ERROR':
      case 'NCP_ERROR': {
        // 0.39.255 — a job that already completed (e.g. from its chat transcript,
        // guardian/lib/chat-transcripts.js) keeps its answer: a late watch timeout
        // or no-reply report from the tab is stale, and turning 'complete' into
        // 'error' would emit a second, contradictory terminal event.
        if (jobId && jobs.get(jobId) && jobs.get(jobId).status === 'complete') {
          console.log(`[guardian] ${jobId}: ignored a late error (${gate || 'no gate'}) — the job already completed`);
          break;
        }
        if (jobId) {
          // ── SEAM queue routing ────────────────────────────────────────────
          // A provider-side error on a SEAM chunk isn't a content failure (no
          // Detector verdict to run), so it goes through the same
          // forceRetryActive() path the watchdog uses, not onResponse().
          const seamQueue = findActiveSeamCompartment(jobId);
          if (seamQueue) {
            seamQueue.forceRetryActive('provider_error');
          }
          // §0.39.265 — a tab that could not take the job (busy, no composer, send failed, no reply) is tried
          // again, after checking whether the answer already exists; only a final error ends the job here.
          const R = !seamQueue && typeof retry === 'function' ? retry() : null;
          if (R) {
            const r = R.onError(jobId, { gate, error, provider });
            if (r.handled) break;
          }
          const job0 = jobs.get(jobId);
          const finalErr = R && job0 && job0.attempts && job0.attempts.length > 1 ? R.finalError(job0, error) : error;
          updateJob(jobId, { status: 'error', error: finalErr, errorGate: gate, errorAt: Date.now() });
          bus.emit('guardian.job.error', { jobId, error: finalErr, gate, provider });
          cockpitBroadcast({ type: 'job.error', jobId, error: finalErr, ts: Date.now() });
        }
        break;
      }

      case 'GUARDIAN_LEDGER_WRITE': {
        // §FOUND & FIXED 2026-09-07 — a circular msg.meta crashed this
        // whole handler via uncaught JSON.stringify. Fails loud and
        // specific (§1.2) instead, the real write still happens.
        let metaJson;
        try {
          metaJson = JSON.stringify(msg.meta || {});
        } catch (e) {
          console.error(`[ncp-handler] GUARDIAN_LEDGER_WRITE from provider=${provider} tabId=${jobId || 'unknown'}: msg.meta failed to serialize (${e.message}) — writing without it, not crashing the process`);
          metaJson = JSON.stringify({ _serializeError: e.message });
        }
        const entry = {
          uuid:     require('crypto').randomUUID(),
          jobId:    jobId || null,
          category: msg.category || 'EVENT',
          msg:      msg.msg || '',
          meta:     metaJson,
          provider: msg.meta?.provider || provider || 'unknown',
          chatUrl:  msg.meta?.chatUrl || chatUrl || '',
          ts:       msg.meta?.ts || Date.now(),
        };
        jaa.insert('ledger', entry);
        bus.emit('guardian.ledger.write', entry);
        evLedger?.record('GUARDIAN_LEDGER_WRITE', entry, { source: 'userscript' });
        break;
      }

      case 'GUARDIAN_LEDGER_EVENT':
      case 'NCP_LEDGER': {
        jaa.insert('ledger', { uuid: require('crypto').randomUUID(),
          category: msg.level || 'EVENT', msg: msg.msg, meta: msg.meta,
          provider, chatUrl, account, ts: Date.now() });
        break;
      }

      case 'GUARDIAN_HEARTBEAT':
      case 'NCP_HEARTBEAT': {
        // Handled directly by ncp.handleHeartbeat() — ACK returned in response body
        break;
      }

      case 'GUARDIAN_CORTEX_RESULT': {
        // Cortex query result from userscript — store in job context
        if (jobId) {
          updateJob(jobId, { cortexResult: msg.result, cortexQuery: msg.query });
          bus.emit('guardian.cortex.result', { jobId, query: msg.query, result: msg.result, provider });
        }
        break;
      }

      case 'GUARDIAN_CLAIM_ACK': {
        // Tab acknowledged a claim request — update provider registry
        const key = `${provider}:${tabId}`;
        if (activeQueues.size) bus.emit('guardian.tab.claimed', { provider, tabId });
        break;
      }

      // §BUILT 2026-09-13 — James: "each .job created has to wait until
      // the gate clears. the event gate sends the ping command, doesn't
      // dispatch until ping is returned, then dispatch the job." Real
      // round trip, same proven shape as GUARDIAN_CLAIM/GUARDIAN_CLAIM_ACK
      // just above — guardian/lib/dispatcher.js's new _pingProvider()
      // sends GUARDIAN_PING and waits on this exact event before letting
      // a job's real content go out. This is a genuine confirmation the
      // tab's own JS is alive and actively processing SSE messages right
      // now — stronger evidence than isConnected()'s passive heartbeat
      // staleness check alone, which only proves the tab answered
      // SOMETHING within the last 30s, not that it can process a real
      // dispatch this instant.
      case 'GUARDIAN_PING_ACK': {
        bus.emit('guardian.ncp.pong', { provider, tabId, pingId: msg.pingId });
        break;
      }

      case 'GUARDIAN_EVENT': {
        // Generic event from userscript — log to ledger
        if (msg.event) {
          bus.emit('guardian.tab.event', { provider, tabId, event: msg.event, data: msg.data });
        }
        break;
      }

      // §BUILT 2026-09-17 — the result half of GUARDIAN_SYNC_REQUEST
      // (dispatched by lib/chat-sync.js's requestSync()). Same real
      // bus-event round trip as GUARDIAN_PING_ACK's 'guardian.ncp.pong'
      // above — requestSync() listens for this exact event.
      case 'GUARDIAN_SYNC_RESULT': {
        bus.emit('guardian.ncp.sync_result', { provider, tabId, agentId: msg.agentId || null, syncId: msg.syncId, chat: msg.chat, error: msg.error });
        break;
      }

      // §BUILT 0.39.254 — a userscript's chat settled and its transcript changed.
      // Recorded by guardian/lib/chat-transcripts.js (one versioned record per chat
      // in Clear Glass's downloads index); this handler only puts it on the bus.
      case 'GUARDIAN_TRANSCRIPT': {
        bus.emit('guardian.ncp.transcript', { provider, tabId, agentId: msg.agentId || null, chat: msg.chat });
        break;
      }

      case 'NEXUS_DOM_MAP': {
        // DOM snapshot from userscript — store in tab context for agent tooling
        if (msg.nodes && Array.isArray(msg.nodes)) {
          bus.emit('guardian.tab.dom_map', { provider, tabId, nodes: msg.nodes, ts: msg.ts || Date.now(), meta: msg.meta });
        }
        break;
      }

      case 'GUARDIAN_SESSION_NAMED': {
        if (msg.chatId && msg.sessionName) {
          bus.emit('guardian.session.named', { chatId: msg.chatId, sessionName: msg.sessionName, provider });
          _toCortex('guardian.session.named', {
            chatId: msg.chatId, sessionName: msg.sessionName, provider,
          });
        }
        break;
      }


      case 'GUARDIAN_ABRUPT_STOP': {
        // §74.2 — userscript detected open fence or suspiciously short SEAM response.
        // Route through forceRetryActive so the compartment enters RETRYING (or
        // ESCALATED if watchdog budget is exhausted) — same path as a watchdog trip.
        // INTERRUPTED is a recoverable state; ESCALATED is not.
        if (jobId) {
          const seamQueue = findActiveSeamCompartment(jobId);
          if (seamQueue) {
            const { escalated } = seamQueue.forceRetryActive('abrupt_stop');
            console.log(`[guardian §74.2] abrupt stop on ${jobId.slice(0,8)} — escalated:${escalated}`);
            _toCortex('guardian.abrupt_stop.handled', {
              jobId,
              seam_queue_id: msg.seam_queue_id ?? null,
              seam_chunk_idx: msg.seam_chunk_idx ?? null,
              escalated,
              provider: provider || 'unknown',
              chunkLen: msg.chunkLen ?? 0,
              openFence: msg.openFence ?? false,
            });
          } else {
            // Non-SEAM job abrupt stop — log as gap, no retry
            _toCortex('cortex.gap.found', {
              jobId, provider: provider || 'unknown',
              type: 'abrupt_stop', score: 0.85,
              reason: `open fence:${msg.openFence} len:${msg.chunkLen}`,
              source: 'userscript-detector',
            });
          }
          bus.emit('guardian.abrupt_stop', { jobId, provider, openFence: msg.openFence, ts: Date.now() });
          cockpitBroadcast({ type: 'job.abrupt_stop', jobId, provider, ts: Date.now() });
        }
        break;
      }

      case 'GUARDIAN_SEAM_RESUME_NEEDED': {
        // §70.2 — tab refreshed mid-SEAM. userscript found interrupted state in
        // localStorage. If the queue is still active, forceRetryActive picks up
        // from the right chunk. If the queue is gone (server restarted), log the
        // orphan as a gap so it surfaces in the review panel.
        const { seam_queue_id, seam_chunk_idx, seam_total, partialText, interruptedAt } = msg;
        if (seam_queue_id) {
          const seamQueue = activeQueues.get(seam_queue_id);
          if (seamQueue) {
            // Queue still alive — force retry on whatever chunk is active
            seamQueue.forceRetryActive('tab_resume');
            console.log(`[guardian §70.2] resume: queue ${seam_queue_id.slice(0,8)} chunk ${(seam_chunk_idx ?? '?')+1}/${seam_total ?? '?'}`);
            _toCortex('guardian.seam.resumed', {
              seam_queue_id, seam_chunk_idx, seam_total, provider: provider || 'unknown',
              interruptedAt, resumedAt: Date.now(),
            });
            ncp.push(provider, {
              type: 'GUARDIAN_SEAM_RESUME_ACK',
              seam_queue_id, seam_chunk_idx,
              status: 'retrying',
              ts: Date.now(),
            });
          } else {
            // Queue gone — server restarted. Surface as orphaned gap.
            console.log(`[guardian §70.2] orphan resume: queue ${seam_queue_id.slice(0,8)} not in memory — logging gap`);
            _toCortex('cortex.gap.found', {
              jobId: seam_queue_id, provider: provider || 'unknown',
              type: 'seam_orphan_resume',
              score: 0.9,
              reason: `tab resumed after server restart, chunk ${(seam_chunk_idx ?? '?')+1}/${seam_total ?? '?'}`,
              description: 'SEAM queue lost on server restart. Manual re-spec needed.',
              source: 'guardian-resume',
            });
            ncp.push(provider, {
              type: 'GUARDIAN_SEAM_RESUME_ACK',
              seam_queue_id, seam_chunk_idx,
              status: 'orphaned',
              message: 'Server restarted — queue lost. Re-submit the spec.',
              ts: Date.now(),
            });
          }
        }
        break;
      }

      case 'GUARDIAN_REPLAY': {
        // Userscript signals it replayed a job result. Acknowledgment only.
        // Without this case the message fell through to 'unhandled' and caused
        // log spam + confused the flapping detector into thinking the tab was
        // misbehaving when it was actually working correctly.
        // §RETIRED 0.39.237 — this used to set status 'complete' and emit
        // guardian.job.complete for the named job: a completion with no
        // response text, i.e. a job reported done that never returned. It
        // only ever arrived with jobId undefined (the userscript sent its IDB
        // record, keyed `uuid`), so it never fired — but it was one field
        // rename away from falsely completing live jobs. The userscripts no
        // longer send it; an older installed copy still might, so it is
        // logged and ignored. Completion comes only from a real result.
        console.warn(`[guardian] ignored GUARDIAN_REPLAY from ${provider} (jobId=${jobId || msg?.uuid || 'none'}): replay is retired and never completes a job — reinstall the ${provider} userscript`);
        break;
      }

      case 'guardian.job.dispatched': {
        // Userscript echoing back that it dispatched the job. Acknowledgment only.
        // §BUILT 2026-08-14 — was log-only, never touched job.status, checked
        // directly before this: no queryable signal existed for this specific
        // ack (distinct from 'delivered', which guardian sets OPTIMISTICALLY
        // right after pushing to NCP, before any real round trip to the
        // browser — 'delivered' means "I tried," this means "the browser
        // actually got it back to me"). Needed for switchAgent's real
        // reachability check (self-model.js's verifyAgentReachable) to have
        // something fast and reliable to poll instead of waiting for a full,
        // costly AI generation just to confirm NCP connectivity.
        const _ackJob = jobs.get(jobId);
        if (_ackJob && _ackJob.status !== 'complete' && _ackJob.status !== 'error') {
          updateJob(jobId, { status: 'acked', ackedAt: Date.now() });
        }
        console.log(`[guardian] job.dispatched ack from ${provider}: ${jobId}`);
        break;
      }

      case 'guardian.job.complete': {
        // Userscript echoing back job completion. Real completion already handled
        // via GUARDIAN_COMPLETE above. Acknowledge and discard.
        console.log(`[guardian] job.complete ack from ${provider}: ${jobId}`);
        break;
      }

      default:
        // Unknown but don't spam the bus — log at debug level only
        if (type && !type.startsWith('GUARDIAN_LEDGER')) {
          console.log(`[guardian] unhandled message type: ${type} from ${provider}`);
        }
    }
  }

  return _handleNCPMessage;
}

module.exports = { createNCPMessageHandler };
