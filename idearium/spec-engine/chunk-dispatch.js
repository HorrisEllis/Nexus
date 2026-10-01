'use strict';
/**
 * idearium/spec-engine/chunk-dispatch.js — Real retry/verification for chunk builds
 * UUID: nexus-idearium-chunk-dispatch-v1-0000-2026-0706-jamesbrooks-001
 * Version: 1.0.1
 *
 * §THE DEEPER MERGE — this is the behavioral half of consolidating
 * lib/seam/queue.js's SEAMQueue/QueueCompartment with Idearium's
 * CHUNK_STATES, named as still-open in lib/seam/chunk-lifecycle.js.
 * Idearium's real dispatch (idearium/api/index.js's `speceng.build`
 * handler) was a single promise-based call to
 * agentSuite.buildChunkWithAgent() — one attempt, no retry, no quality
 * check; a bad response was indistinguishable from a good one until a
 * human noticed. This wraps that same dispatch call inside a real
 * QueueCompartment (lib/seam/queue.js) — the same multi-strategy retry
 * ladder and Detector-based verification Guardian already uses for its
 * own chunks, driven synchronously here instead of via NCP's
 * async-event model, since Idearium's dispatch is a plain promise, not
 * a fire-and-forget push-then-later-callback.
 *
 * §MODULE SYSTEM — Idearium is ESM ("type": "module" in
 * idearium/package.json); lib/seam/queue.js is CommonJS. Node's CJS/ESM
 * interop synthesizes named exports from a CJS module.exports object,
 * so `import { QueueCompartment, STATE } from '...queue.js'` works
 * directly — confirmed by actually running it below, not assumed.
 *
 * §WHY NOT jaa — QueueCompartment requires a `jaa` object
 * ({insert(table,row), update(table,filter,row)}), §LAW II ("write
 * before behavior"). Idearium doesn't have a JAA store of its own; the
 * shim below is a real, working in-memory implementation, not a stub —
 * it satisfies the exact interface QueueCompartment calls, scoped to one
 * chunk-build's lifetime (the compartment's own audit trail doesn't need
 * to outlive one dispatch cycle; Idearium's own manifest, saved via its
 * existing loadSpec/saveSpec, remains the durable record of what the
 * chunk ended up looking like).
 */
import http from 'http';
import { QueueCompartment, STATE } from '../../lib/seam/queue.js';
import { createRequire } from 'module';
const _req = createRequire(import.meta.url);   // §0.39.286 — this file is ESM: a bare require() is undefined here

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

function _httpGet(port, path, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs }, (res) => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => { try { resolve({ ok: res.statusCode < 400, data: JSON.parse(data) }); } catch { resolve({ ok: false, data: null }); } });
    });
    req.on('error', () => resolve({ ok: false, data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, data: null }); });
    req.end();
  });
}

/**
 * §GAP CLOSED 2026-07-06 — buildChunkWithAgent()'s own comment says
 * "return jobId so caller can poll," but no caller anywhere in this
 * codebase ever did. A chatgpt/claude chunk got marked `queued` and was
 * then abandoned in BUILDING state permanently — confirmed by grepping
 * for every real caller of the one endpoint (`speceng.chunk.complete`)
 * that could have closed the loop: zero matches, anywhere. This is that
 * poller. Guardian has no single-job lookup endpoint (checked) — only
 * `GET /jobs?status=X&limit=N` — so this polls the list and filters by
 * id client-side. Text lands in either `job.responseText` or
 * `job.result` depending on which of Guardian's internal code paths
 * completed it (a real inconsistency in Guardian itself, not something
 * to paper over) — checks both.
 */
async function _pollGuardianJob(jobId, { timeoutMs = 300000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await _httpGet(GUARDIAN_PORT, '/jobs?limit=200');
    if (r.ok && r.data?.jobs) {
      const job = r.data.jobs.find(j => j.id === jobId || j.uuid === jobId);
      if (job) {
        if (job.status === 'complete' || job.status === 'done') {
          const text = job.responseText || job.result || job.text;
          if (text) return { ok: true, text };
          return { ok: false, error: 'job completed with no text in responseText/result/text' };
        }
        if (job.status === 'error') return { ok: false, error: job.error || 'guardian job failed' };
        // else still running — keep polling
      }
    }
    await new Promise(r2 => setTimeout(r2, intervalMs));
  }
  return { ok: false, error: `guardian job ${jobId} did not complete within ${timeoutMs}ms` };
}

function _memoryJaa() {
  const rows = new Map();
  return {
    insert: (table, row) => { rows.set(`${table}:${row.uuid}`, { ...row }); return row; },
    update: (table, filter, row) => {
      const key = `${table}:${filter.uuid}`;
      if (!rows.has(key)) throw new Error('row not found'); // triggers QueueCompartment's own insert-fallback, matches real jaa semantics
      rows.set(key, { ...row });
      return row;
    },
    _dump: () => [...rows.values()], // exposed for the caller to persist a summary if it wants one
  };
}

/**
 * dispatchChunkWithVerification — drop-in replacement for the bare
 * `agentSuite.buildChunkWithAgent(prompt, opts)` call in
 * idearium/api/index.js's `speceng.build` handler. Same promise-based
 * contract in (`prompt`, options), but internally retries against the
 * real strategy ladder and verifies each response with the same
 * Detector Guardian uses, instead of trusting the first response
 * unconditionally.
 *
 * @param {string} chunkPrompt   — the built prompt for this chunk (same as before)
 * @param {object} chunk         — Idearium's chunk object (chunkIdx, chunkTitle used for the compartment's identity)
 * @param {function} dispatchFn  — (prompt, opts) => Promise<{ok, text, error, queued, jobId, agent}> — this IS agentSuite.buildChunkWithAgent, unchanged
 * @param {object} opts          — { preferAgent, axioms, specUuid, busEmit }
 * @returns {Promise<{ok, text, escalated, detection, attempts, queued, jobId, agent}>}
 */
async function _dispatchChunkOnce(chunkPrompt, chunk, dispatchFn, opts = {}) {
  const jaa = _memoryJaa();
  // §RR2 2026-09-13 (MCO2) — the real gap RR2 named: this fell back to a
  // hardcoded 'ollama' with zero reasoning when opts.preferAgent wasn't
  // given. An explicit preferAgent still wins outright (§user-directed,
  // same convention _decide()'s own preferredAgent check uses) — this
  // only replaces the previously-unreasoned default, never a caller's
  // real choice. RAID unreachable → same 'ollama' default as before
  // (§1.2 — a fidelity layer being down must not block real dispatch).
  let resolvedProvider = opts.preferAgent || null;
  if (!resolvedProvider) {
    try {
      const raid = require('../../cortex/core/raid');
      const decision = raid.decideForContract({
        intention: `build:${chunk.chunkTitle || chunk.sectionTitle || 'chunk'}`,
        content: chunkPrompt,
      });
      resolvedProvider = decision.agent;
    } catch (_) { /* RAID unreachable — real dispatch proceeds regardless */ }
  }
  const comp = new QueueCompartment({
    queueId:      opts.specUuid || 'idearium-spec',
    chunkIdx:     chunk.chunkIdx,
    chunkTitle:   chunk.chunkTitle || chunk.sectionTitle,
    chunkContent: chunkPrompt,     // the "expected content" Detector profiles against — the prompt itself, same role SEAMQueue gives it
    builtPrompt:  chunkPrompt,
    provider:     resolvedProvider || 'ollama',
    axioms:       opts.axioms || [],
    total:        opts.total || 1,
    jaa,
    busEmit:      opts.busEmit || (() => {}),
  });

  const maxWallClockAttempts = opts.attemptsPerHop || 6; // §0.39.286 routing.attempts_per_hop · strategy ladder + watchdog ceilings already bound this internally; this is an outer safety cap, not the real limit
  let attempts = 0;
  // §0.39.286 RG3 — the provider's own last error survives to the caller (it was replaced by "exceeded outer wall-clock
  // attempt cap", so nothing downstream could tell a dead provider from a slow one), and a login or a limit ends this
  // provider's attempts at once: retrying the same provider cannot fix either (guardian/lib/job-retry.js: needs-you).
  let lastErr = null;
  const _final = (msg) => { try { const c = _req('../../lib/pipeline-routing.js').classify({ error: msg }); return c === 'login' || c === 'rate-limit'; } catch (_) { return false; } };

  while (attempts < maxWallClockAttempts) {
    attempts++;
    const prompt = comp.state === STATE.RETRYING ? comp.buildRetryPrompt() : comp.builtPrompt;

    comp.inject(`idearium-${comp.uuid}-${attempts}`);
    comp.generating();

    let dispatchResult;
    try {
      dispatchResult = await dispatchFn(prompt, opts);
    } catch (e) {
      // A real dispatch-layer failure (network, provider down) — not a
      // content-quality failure Detector should judge. Treat as a
      // connectivity retry, same distinction QueueCompartment's own
      // watchdogRetry() draws for stalls vs. content failures.
      lastErr = e.message;
      const { escalated } = comp.watchdogRetry(e.message);
      if (escalated || _final(e.message)) return { ok: false, escalated: true, detection: null, attempts, error: e.message };
      continue;
    }

    // §GAP CLOSED 2026-07-06 — used to return dispatchResult (queued,
    // unresolved) straight to the caller here, which is exactly the dead
    // end traced above: nothing downstream ever polled it. Now polls to
    // real resolution and feeds the result through the same
    // detecting()/evaluate() verification every direct response gets —
    // a chatgpt/claude chunk is no longer a second-class, unverified path.
    //
    // §BUILT 2026-09-03 — James: "contracts always need an end point...
    // each contract has the start dir. defaults back to the start point."
    // Between here and _pollGuardianJob resolving (up to 5 real minutes
    // for a browser-automated NCP provider), this jobId exists on
    // guardian's side and NOWHERE ELSE — a process restart mid-poll loses
    // it completely, and the chunk sits at 'building' forever with no
    // record anything was ever in flight. opts.onQueued, when the caller
    // supplies it, fires HERE — before the poll, not after — so the
    // chunk's own record on disk (its "start dir," spec-engine/index.js's
    // recordDispatchJob) gets the real jobId the moment it exists,
    // regardless of whether the poll below ever gets to finish. No
    // RAID compartment, no new machinery — the spec's own directory IS
    // the compartment; this just writes the return address into it.
    if (dispatchResult.queued) {
      if (typeof opts.onQueued === 'function') {
        try { opts.onQueued({ jobId: dispatchResult.jobId, agent: dispatchResult.agent }); }
        catch (e) { console.warn('[chunk-dispatch] onQueued hook failed (poll proceeds regardless):', e.message); }
      }
      const polled = await _pollGuardianJob(dispatchResult.jobId);
      if (!polled.ok) {
        lastErr = polled.error;
        const { escalated } = comp.watchdogRetry(polled.error);
        if (escalated || _final(polled.error)) return { ok: false, escalated: true, detection: null, attempts, error: polled.error };
        continue;
      }
      dispatchResult = { ok: true, text: polled.text, agent: dispatchResult.agent };
      // falls through to the same detecting()/evaluate() block below
    }

    if (!dispatchResult.ok || !dispatchResult.text) {
      lastErr = dispatchResult.error || 'no text in response (empty reply)';
      const { escalated } = comp.watchdogRetry(lastErr);
      if (escalated || _final(lastErr)) return { ok: false, escalated: true, detection: null, attempts, error: dispatchResult.error || lastErr };
      continue;
    }

    // §0.39.289 — a reply cut mid-way is FINISHED, not asked for again whole (the same limit cut it again, then the
    // chunk moved to another provider): the tail is shown back to the same agent, it continues, the parts are
    // stitched (lib/reply-continuation.js). Then the detector judges the whole.
    let continued = null;
    try {
      const RC = _req('../../lib/reply-continuation.js');
      if (RC.looksCut(dispatchResult.text).cut) {
        const call = async (p) => {
          let r = await dispatchFn(p, opts);
          if (r && r.queued) { const pr = await _pollGuardianJob(r.jobId); r = pr.ok ? { ok: true, text: pr.text } : { ok: false, error: pr.error }; }
          if (!r || !r.ok) throw new Error((r && r.error) || 'no reply');
          return { text: r.text };
        };
        continued = await RC.complete(call, prompt, { first: { text: dispatchResult.text }, maxRounds: opts.continueRounds || 2 });
        if (continued.rounds) dispatchResult = { ...dispatchResult, text: continued.text };
      }
    } catch (e) { console.warn(`[chunk-dispatch] continuation skipped (the reply is judged as it came): ${e.message}`); }

    comp.detecting(dispatchResult.text);
    const { passed, detection } = comp.evaluate();

    if (passed) {
      // §PASS-THROUGH 2026-07-09 — this returned a fixed field set, silently
      // dropping anything the dispatchFn reported beyond {ok, text, agent}.
      // With WARP in the build path that means source/cost/cacheHit vanish
      // here, and a zero-token exact-cache hit becomes indistinguishable from
      // a full LLM generation in every downstream event and ledger row.
      // Verification owns quality, not provenance — forward what it did not
      // produce rather than erasing it.
      return {
        ok: true, escalated: false, text: dispatchResult.text, detection, attempts,
        agent: dispatchResult.agent,
        source:   dispatchResult.source,
        cost:     dispatchResult.cost,
        cacheHit: dispatchResult.cacheHit,
        digest:   dispatchResult.digest,
        continued: continued && continued.rounds ? { rounds: continued.rounds, reasons: continued.reasons, stillCut: continued.cut } : null,
      };
    }
    if (comp.state === STATE.ESCALATED) {
      return { ok: false, escalated: true, detection, attempts, text: dispatchResult.text };
    }
    // else state === RETRYING — loop continues, buildRetryPrompt() picks it up next iteration
  }

  // §0.39.284 — say WHY every attempt was refused (the detector's own summary), not only that the cap was reached
  return { ok: false, escalated: true, detection: comp.detection, attempts, error: `exceeded outer wall-clock attempt cap${comp.detection && comp.detection.summary ? ` — last check: ${comp.detection.summary}` : ''}${lastErr ? ` — last error: ${lastErr}` : ''}` };
}

// §BUILT 2026-09-03 — James: "set default to chatgpt, fallback gemini."
// The retry ladder above (_dispatchChunkOnce, unchanged) already retries
// against the SAME agent — it has no notion of switching agents on
// failure. This wraps it: one real, named fallback attempt against a
// different agent when the primary genuinely escalates (exhausts its own
// retry ladder), not a silent retry-forever. Never cascades — the
// fallback attempt itself carries no fallbackAgent, so a failing gemini
// attempt fails for real rather than hunting through more agents nobody
// asked for. The chunk's own agent (spec-engine's markChunkBuilding, then
// completeChunk) ends up recording whichever agent actually produced the
// content — real provenance, not "chatgpt" left standing for a chunk
// gemini actually wrote.
export async function dispatchChunkWithVerification(chunkPrompt, chunk, dispatchFn, opts = {}) {
  if (Array.isArray(opts.route) && opts.route.length) return _walkRoute(chunkPrompt, chunk, dispatchFn, opts);
  const primary = await _dispatchChunkOnce(chunkPrompt, chunk, dispatchFn, opts);
  if (primary.ok || !opts.fallbackAgent || opts.fallbackAgent === opts.preferAgent) return primary;

  console.warn(`[chunk-dispatch] ${opts.preferAgent} escalated for '${chunk.sectionId}' (${primary.error || 'verification failed'}) — falling back to ${opts.fallbackAgent}, one attempt`);
  const fallbackResult = await _dispatchChunkOnce(chunkPrompt, chunk, dispatchFn, { ...opts, preferAgent: opts.fallbackAgent, fallbackAgent: null });
  // §HONEST — if the fallback also failed, the caller gets the FALLBACK's
  // error (the more recent, more relevant failure), not the primary's,
  // but both are real and neither is hidden — primaryError is carried
  // alongside so nothing about the first attempt is lost.
  return { ...fallbackResult, primaryAgent: opts.preferAgent, primaryError: primary.error };
}

// §0.39.286 RG3 (docs/2026-10-01-routing-registry-genesis-phasemap.spec) — James: "full options for fallback logic,
// routing". opts.route is lib/pipeline-routing.js plan()'s ordered route. Each hop is the same verified ladder against
// one provider; a failed hop is classified, fed to that provider's breaker, and the walk moves on only if the class is
// in the policy's fallback_on (login never moves on: it needs a person). Every hop is returned (route) so the chunk
// keeps who failed, why and for how long, and who built it.
async function _walkRoute(chunkPrompt, chunk, dispatchFn, opts) {
  const PR = _req('../../lib/pipeline-routing.js');
  const policy = opts.policy || PR.DEFAULTS;
  const hops = [];
  let last = null;
  for (let i = 0; i < opts.route.length; i++) {
    const provider = typeof opts.route[i] === 'string' ? opts.route[i] : opts.route[i].provider;
    const t0 = Date.now();
    // §0.39.287 — a hop may name a model (ollama:<model>): the agent is the provider, the model rides along
    const model = PR.modelOf(provider);
    const r = await _dispatchChunkOnce(chunkPrompt, chunk, dispatchFn, { ...opts, preferAgent: PR.baseOf(provider), ...(model ? { model } : {}), fallbackAgent: null, route: null, attemptsPerHop: policy.attemptsPerHop });
    const ms = Date.now() - t0;
    const jobType = opts.jobType || PR.jobTypeOf(chunk);
    if (r.queued) { hops.push({ provider, outcome: 'queued', ms, jobId: r.jobId || null }); return { ...r, route: hops }; }
    if (r.ok) {
      PR.breaker.success(provider);
      hops.push({ provider, outcome: 'ok', ms, attempts: r.attempts });
      if (!r.cacheHit) PR.recordHop({ jobType, provider, outcome: 'ok', ms });   // §0.39.287 — every real hop teaches the learned mode (a cache hit is not the model's work)
      return { ...r, agent: r.agent || provider, route: hops, primaryAgent: hops.length > 1 ? hops[0].provider : undefined, primaryError: hops.length > 1 ? hops[0].error : undefined };
    }
    const cls = PR.classify(r);
    PR.breaker.failure(provider, cls, policy);
    const go = i < opts.route.length - 1 && PR.shouldFallback(cls, policy);
    hops.push({ provider, outcome: 'failed', class: cls, error: r.error || (r.detection && r.detection.summary) || null, ms, attempts: r.attempts, next: go ? 'fallback' : 'stop' });
    PR.recordHop({ jobType, provider, outcome: 'failed', class: cls, ms, error: hops[hops.length - 1].error });
    last = r;
    if (go) console.warn(`[chunk-dispatch] ${provider} failed '${chunk.sectionId || chunk.title}' (${cls}) — next: ${typeof opts.route[i + 1] === 'string' ? opts.route[i + 1] : opts.route[i + 1].provider}`);
    if (!go) break;
  }
  const why = hops.map(h => `${h.provider}: ${h.class}`).join(' → ');
  return { ...(last || { ok: false, escalated: true }), ok: false, escalated: true, route: hops, error: `every route hop failed (${why})${last && last.error ? ` — last: ${last.error}` : ''}` };
}

// §BROKEN IMPORT FIXED 2026-07-09 — warp-build-dispatch.js does
// `import { pollGuardianJob } from './chunk-dispatch.js'`, but this module
// only ever defined `_pollGuardianJob` privately and exported
// `dispatchChunkWithVerification`. The named import failed, so
// warp-build-dispatch.js could NEVER be imported — an ESM SyntaxError at load.
// It also has zero consumers, so nothing ever tried, and the failure stayed
// invisible. Its header describes test results that cannot have come from
// importing this file. Export the real poller under the name its one consumer
// expects, rather than duplicating a second poller.
export { _pollGuardianJob as pollGuardianJob };
