'use strict';
/**
 * idearium/lib/guardian-stream.cjs — real guardian job-completion subscriber
 * + boot-time reconciliation for chunks orphaned by a process restart.
 * UUID: nexus-idearium-guardian-stream-v1-0000-2026-0903-jamesbrooks-001
 *
 * §BUILT 2026-09-03 — James: "we need guardian/copilot/clearglass/agent
 * mesh sse listeners... needs a queue, that survives restart." Traced the
 * real options before building:
 *
 * - idearium.spec has claimed "guardian.job.complete → artifact.store"
 *   as a handled event since before this session and it was never real
 *   (grepped, corrected in idearium.spec earlier this session). This
 *   module is what makes that claim true for the first time.
 * - copilot/server.js's own _connectGuardianStream() — the pattern this
 *   was going to copy — has a real, confirmed bug: it builds its URL from
 *   `${GD_URL}/events` but requests path '/bus' instead. guardian's real
 *   /bus (server.js) is a plain one-shot JSON endpoint (bus.sample(n)),
 *   NOT text/event-stream — copilot's res.on('data',...) SSE-line parser
 *   never matches anything against a JSON body, so it silently never
 *   ingests, just reconnects every 2s forever. Not fixed here (separate
 *   system, real scope boundary) — NOT copied into idearium either. This
 *   connects to the real thing: guardian's /events, confirmed directly
 *   (every bus.emit() unconditionally calls cockpitBroadcast(), which
 *   /events streams — guardian/server.js, checked by reading the code,
 *   not assumed from copilot's version of the pattern).
 * - No new persisted queue table. chunk.jobId/dispatchDir/dispatchedAt
 *   (recordDispatchJob, spec-engine/index.js, built earlier this session)
 *   IS the durable record — JAA-backed via saveSpec, survives a restart
 *   on its own. What was missing is this: something that reads it back.
 *
 * Two real pieces:
 *   connectGuardianStream() — live subscription, guardian.job.complete/
 *     .error → resolve the matching chunk (by jobId) via completeChunk/
 *     failChunk, the SAME real functions the synchronous poll path uses.
 *     §FIX 2026-09-22 — that parity claim was true for completeChunk/
 *     failChunk themselves but NOT for the code-extraction step in front
 *     of them (warp-build-dispatch.js's generate() runs extractCode()
 *     before ever calling completeChunk; this module didn't). Fixed —
 *     see _prepareChunkContent below.
 *     Reconnects with backoff (copilot's own real retry timings, 2s/5s —
 *     that part of the pattern IS real and worth keeping).
 *   reconcileInFlightChunks() — one-time boot sweep. For every chunk
 *     across every real spec still 'building' with a real jobId: ask
 *     guardian's real /jobs?limit=200 (same endpoint chunk-dispatch.js's
 *     own _pollGuardianJob already polls) whether it finished while this
 *     process was down. Already done → resolve now. Guardian doesn't
 *     know it either (guardian itself restarted, or the job aged out) →
 *     fail the chunk with an honest, named reason — never left silently
 *     stuck at 'building' forever with no trace of what happened.
 */

const http = require('http');
const path = require('path');
const { extractCode } = require('../../lib/extract-code.js');
const CODE_EXTENSIONS = require('../../lib/languages.js').codeExtensions();

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

// §FIX 2026-09-22 — James: "how does guardian or clearglass get the
// actual code file to the right end point for build or expanding
// repos?" Traced end to end, not assumed: idearium/spec-engine/warp-
// build-dispatch.js's generate() already does this correctly — when
// record.expectCode is set, it runs the raw agent reply through
// lib/extract-code.js's extractCode() (built 2026-09-19 for exactly
// this — "whatever an agent's reply was... became the chunk's real
// content verbatim") and fails LOUDLY rather than silently keeping raw
// prose+fences. But that only runs inside the WARP cascade's OWN
// internal poll. THIS module — the live SSE push (_handleGuardianEvent)
// and the boot-time reconciliation sweep (reconcileInFlightChunks) —
// is the real, separate recovery path for a chunk that completes after
// idearium restarted or reconnected mid-dispatch, and it called
// completeChunk() directly with guardian's raw job text: no extraction,
// ever. A code chunk (one with a real chunk.realPath and a code
// extension) recovered through EITHER of this module's two paths would
// get whatever prose+fences the agent actually sent written straight
// into the real repo file via materialize() — silently, since nothing
// here checked. expectCode is computed the exact same way idearium/
// api/index.js already computes it for the live dispatch path (a real
// chunk.realPath with a real code extension) — not a second definition
// of what counts as code.
function _prepareChunkContent(chunk, text) {
  const expectCode = !!(chunk.realPath && CODE_EXTENSIONS.has(path.extname(chunk.realPath).toLowerCase()));
  if (!expectCode) return { ok: true, content: text };
  const extracted = extractCode(text, { allowMultiple: false });
  if (!extracted.ok) {
    return { ok: false, error: `guardian returned a reply but it wasn't usable code for ${chunk.realPath}: ${extracted.error}` };
  }
  return { ok: true, content: extracted.code };
}

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

// ── find every chunk, across every real spec, still 'building' with a
// real jobId — the exact set both the live subscriber and the boot sweep
// need to search. §2.2 disk is source of truth — reads through spec-
// engine's own loadSpec/listSpecs, never a separate index of its own.
async function _findInFlightChunks(se) {
  const out = [];
  for (const s of se.listSpecs()) {
    let manifest;
    try { manifest = se.loadSpec(s.uuid); } catch { continue; }
    for (const c of manifest.chunks) {
      if (c.status === 'building' && c.jobId) out.push({ specUuid: manifest.uuid, chunk: c });
    }
  }
  return out;
}

async function _resolveByJobId(se, jobId) {
  const inFlight = await _findInFlightChunks(se);
  return inFlight.find(({ chunk }) => String(chunk.jobId) === String(jobId)) || null;
}

/**
 * reconcileInFlightChunks(se) — boot-time sweep. Call once, before the
 * live subscriber starts (or at any point a restart is suspected — SOFT
 * boot phase, never blocks idearium's own startup on guardian being up).
 */
async function reconcileInFlightChunks(se) {
  const inFlight = await _findInFlightChunks(se);
  if (!inFlight.length) { console.log('[idearium/guardian-stream] reconcile: no in-flight chunks found'); return { checked: 0, resolved: 0, failed: 0 }; }

  console.log(`[idearium/guardian-stream] reconcile: ${inFlight.length} chunk(s) still 'building' with a real jobId — checking guardian`);
  const jobsRes = await _httpGet(GUARDIAN_PORT, '/jobs?limit=200');
  let resolved = 0, failed = 0;

  for (const { specUuid, chunk } of inFlight) {
    const job = jobsRes.ok && jobsRes.data?.jobs ? jobsRes.data.jobs.find(j => j.id === chunk.jobId || j.uuid === chunk.jobId) : null;

    if (job && (job.status === 'complete' || job.status === 'done')) {
      const text = job.responseText || job.result || job.text;
      if (text) {
        const prepared = _prepareChunkContent(chunk, text);
        if (!prepared.ok) {
          try { se.failChunk(specUuid, chunk.uuid, prepared.error); failed++; console.warn(`[idearium/guardian-stream] reconcile: '${chunk.sectionId}' — ${prepared.error}`); }
          catch (_) {}
          continue;
        }
        try { se.completeChunk(specUuid, chunk.uuid, prepared.content); resolved++; console.log(`[idearium/guardian-stream] reconcile: '${chunk.sectionId}' completed while idearium was down — resolved`); continue; }
        catch (e) { console.warn(`[idearium/guardian-stream] reconcile: completeChunk failed for '${chunk.sectionId}': ${e.message}`); }
      }
    }
    if (job && job.status === 'error') {
      try { se.failChunk(specUuid, chunk.uuid, job.error || 'guardian reported job error while idearium was down'); failed++; continue; }
      catch (_) {}
    }
    // Neither guardian's job list has it complete/errored, nor does
    // guardian know the job at all (guardian restarted too, or the job
    // aged out of its own in-memory list) — genuinely orphaned. Named
    // honestly, not left silently 'building' forever.
    try {
      se.failChunk(specUuid, chunk.uuid, `orphaned — process restarted mid-dispatch, guardian job ${chunk.jobId} not resolvable (${jobsRes.ok ? 'not found in guardian\'s job list' : 'guardian unreachable'})`);
      failed++;
    } catch (e) { console.warn(`[idearium/guardian-stream] reconcile: failChunk failed for '${chunk.sectionId}': ${e.message}`); }
  }

  console.log(`[idearium/guardian-stream] reconcile complete: ${inFlight.length} checked, ${resolved} resolved, ${failed} marked failed`);
  return { checked: inFlight.length, resolved, failed };
}

// ── live subscriber — real guardian.job.complete/.error, /events (not
// /bus — see header). Reconnects with backoff; never throws into the
// caller, matches every other real stream-subscriber's own failure mode
// in this codebase (copilot's _connectGuardianStream/_connectCortexStream).
let _connected = false;
// §FEED 0.39.244 — opts.onFeed(ev): every guardian.job.* frame for a repo agent
// (data.agentId 'repo-<uuid>', now carried by guardian's /events — see its _feedFrame),
// for the Agent tab's live feed. Observation only; the chunk resolution below is unchanged.
let _onFeed = null;
function connectGuardianStream(se, opts = {}) {
  if (typeof opts.onFeed === 'function') _onFeed = opts.onFeed;
  if (_connected) return; // idempotent — a boot-phase retry must not open a second connection
  try {
    const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/events', headers: { Accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) { res.destroy(); _connected = false; setTimeout(() => connectGuardianStream(se), 5000); return; }
      _connected = true;
      console.log('[idearium/guardian-stream] connected — live guardian.job.complete/.error subscription active');
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (_onFeed && typeof ev?.type === 'string' && ev.type.startsWith('guardian.job.') && typeof ev.data?.agentId === 'string' && ev.data.agentId.startsWith('repo-')) {
            try { _onFeed(ev); } catch (e) { console.warn(`[idearium/guardian-stream] feed relay failed: ${e.message}`); }
          }
          if (ev?.type !== 'guardian.job.complete' && ev?.type !== 'guardian.job.error') continue;
          _handleGuardianEvent(se, ev).catch(e => console.warn(`[idearium/guardian-stream] event handling failed: ${e.message}`));
        }
      });
      res.on('end', () => { _connected = false; setTimeout(() => connectGuardianStream(se), 2000); });
      res.on('error', () => { _connected = false; setTimeout(() => connectGuardianStream(se), 2000); });
    });
    req.on('error', () => { _connected = false; setTimeout(() => connectGuardianStream(se), 5000); });
    req.end();
  } catch (_) { _connected = false; setTimeout(() => connectGuardianStream(se), 5000); }
}

async function _handleGuardianEvent(se, ev) {
  const jobId = ev.data?.jobId;
  if (!jobId) return;
  const match = await _resolveByJobId(se, jobId);
  if (!match) return; // real, common case — most guardian jobs are not idearium chunks at all
  const { specUuid, chunk } = match;

  if (ev.type === 'guardian.job.error') {
    se.failChunk(specUuid, chunk.uuid, ev.data.error || 'guardian reported job error (live)');
    console.log(`[idearium/guardian-stream] '${chunk.sectionId}' failed (live push): ${ev.data.error || 'unknown'}`);
    return;
  }

  // guardian.job.complete — the event itself doesn't carry the response
  // text (checked: guardian's real payload is {jobId, provider, ...},
  // no text field). One real lookup against /jobs for the actual text,
  // same field-fallback chunk-dispatch.js's own _pollGuardianJob uses.
  const jobsRes = await _httpGet(GUARDIAN_PORT, '/jobs?limit=200');
  const job = jobsRes.ok && jobsRes.data?.jobs ? jobsRes.data.jobs.find(j => j.id === jobId || j.uuid === jobId) : null;
  const text = job ? (job.responseText || job.result || job.text) : null;
  if (!text) { console.warn(`[idearium/guardian-stream] '${chunk.sectionId}' — guardian.job.complete fired but no response text found for job ${jobId}`); return; }
  const prepared = _prepareChunkContent(chunk, text);
  if (!prepared.ok) {
    se.failChunk(specUuid, chunk.uuid, prepared.error);
    console.warn(`[idearium/guardian-stream] '${chunk.sectionId}' — ${prepared.error}`);
    return;
  }
  se.completeChunk(specUuid, chunk.uuid, prepared.content);
  console.log(`[idearium/guardian-stream] '${chunk.sectionId}' completed (live push, job ${jobId})`);
}

module.exports = { reconcileInFlightChunks, connectGuardianStream };
