'use strict';
/**
 * src/jobs/intake.js — Clear Glass's intake for guardian jobs
 * UUID: cg-job-intake-v1-0000-0000-000000000033
 *
 * §BUILT 2026-09-23 (v0.39.227) — James: "Guardians jobs need to generate
 * physically to the jobs directory. Then ClearGlass adds it to the intake of
 * the job queue." Then "Do it."
 *
 * The design question guardian.spec left open (open_not_done.
 * clear_glass_job_intake: "watch vs push, and which transport owns a job once
 * both can see it") is decided here, and the answer is PUSH-WITH-CLAIM, not a
 * directory watch:
 *
 *   1. guardian writes <jobId>.job (required at creation since 0.39.225).
 *   2. guardian's dispatch ladder CLAIMS the job for the mesh on disk
 *      (transport:'mesh', claimedBy:'clear-glass') before it sends — so the
 *      .job itself says which transport owns it. Only guardian writes it.
 *   3. Clear Glass's intake (this file) accepts a job ONLY after reading it
 *      back through guardian's own API (GET :7820/jobs?id=) and confirming
 *      guardian claimed it for Clear Glass. No claim, no intake.
 *   4. The intake writes ITS OWN record (<jobId>.intake, in Clear Glass's
 *      data dir) and hands the job to the mesh's dom-transport queue.
 *
 * Why not watch guardian's jobs directory: (a) James's own rule (handoff
 * item 4) — a node's owner is the only one that creates AND reads its
 * nodes; Clear Glass reading guardian's folder breaks that. (b) Every job
 * lands in that folder, including the ones the NCP userscript path owns —
 * a watcher would pick those up too and dispatch them twice, which is the
 * exact duplicate class guardian.spec warned about.
 *
 * What the intake adds: (1) the gate — Clear Glass only runs jobs guardian
 * claimed for it on disk; (2) a durable record in Clear Glass's own data.
 * The dom-transport queue is in memory; guardian's mesh-client already
 * reads `known:false` AFTER it has seen a job as "mesh_restarted, may have
 * been sent" (never resend) — but only if it had seen it. The intake record
 * makes that answer come from Clear Glass itself, and survives a restart of
 * both sides: stage 'clear_glass_restarted', sent:null, which the ladder
 * treats as never-resend (sent_no_response -> ask the user).
 */

const fs   = require('fs');
const path = require('path');

const TERMINAL = new Set(['done', 'error', 'interrupted', 'refused']);
const GUARDIAN_TERMINAL = new Set(['delivered', 'complete', 'completed', 'error', 'cancelled']);

function createJobIntake({ dir, fetchGuardianJob, sendViaDom, getDomJob, now = Date.now, log = () => {} } = {}) {
  if (!dir || typeof fetchGuardianJob !== 'function' || typeof sendViaDom !== 'function' || typeof getDomJob !== 'function') {
    throw new Error('createJobIntake needs dir, fetchGuardianJob, sendViaDom and getDomJob');
  }
  fs.mkdirSync(dir, { recursive: true });
  const safe = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileOf = (jobId) => path.join(dir, `${safe(jobId)}.intake`);

  function readRec(jobId) {
    const f = fileOf(jobId);
    if (!fs.existsSync(f)) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }
  }
  // Same write discipline as guardian's .job: temp + rename, never a half-written record.
  function writeRec(rec) {
    const f = fileOf(rec.jobId), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, f);
    return rec;
  }
  function patch(jobId, p) { const r = readRec(jobId); return r ? writeRec({ ...r, ...p, updatedAt: now() }) : null; }

  const refuse = (jobId, error) => ({ accepted: false, sent: false, stage: 'intake_refused', jobId, error });

  /**
   * intake(payload) — payload is guardian's /agent-mesh/send body. The job must
   * exist in guardian and be claimed for Clear Glass. The PROMPT sent is the
   * payload's, not the .job's, on purpose: guardian's ladder adds the wake hint
   * to the sent prompt only (dispatch-ladder.js), and replacing it would drop it.
   */
  async function intake(payload = {}) {
    const { jobId } = payload;
    if (!jobId) return refuse(null, 'jobId required — every mesh job comes from a guardian .job');

    const existing = readRec(jobId);
    if (existing) {
      // Idempotent: guardian re-asking (restart, timeout) never re-sends.
      const live = getDomJob(jobId);
      return { accepted: true, existing: true, jobId, status: live && live.known ? live.status : existing.status };
    }

    let g;
    try { g = await fetchGuardianJob(jobId); }
    catch (e) { return refuse(jobId, `could not read job ${jobId} from guardian: ${e.message}`); }
    if (!g) return refuse(jobId, `guardian has no job "${jobId}" — nothing to take in`);
    if (g.transport !== 'mesh' || g.claimedBy !== 'clear-glass') {
      return refuse(jobId, `job ${jobId} is not claimed for Clear Glass (transport=${g.transport || 'none'}, claimedBy=${g.claimedBy || 'none'}) — refusing so it cannot be delivered twice`);
    }
    if (GUARDIAN_TERMINAL.has(g.status)) return refuse(jobId, `job ${jobId} is already ${g.status} in guardian`);
    if (payload.provider && g.provider && payload.provider !== g.provider) {
      return refuse(jobId, `provider mismatch: send says ${payload.provider}, the .job says ${g.provider}`);
    }

    // Record FIRST, then queue: a crash between the two leaves a record that
    // recover() marks interrupted — never a job that was sent and forgotten.
    writeRec({ jobId, provider: g.provider, accountId: payload.accountId || g.accountId || null, agentId: payload.agentId || null,
      guardianStatusAtIntake: g.status, status: 'accepted', acceptedAt: now(), updatedAt: now() });
    log(`[intake] took in ${jobId} (${g.provider}) from guardian`);

    let r;
    try { r = await sendViaDom({ ...payload, provider: g.provider }); }
    catch (e) { patch(jobId, { status: 'error', error: e.message }); return { accepted: false, sent: false, stage: 'inject_failed', jobId, error: e.message }; }
    if (r && r.accepted === false) patch(jobId, { status: 'error', error: r.error || r.stage || 'mesh refused', stage: r.stage || null });
    else patch(jobId, { status: 'queued' });
    return r;
  }

  /** status(jobId) — the mesh's live view, falling back to the intake record after a restart. */
  function status(jobId) {
    const live = getDomJob(jobId);
    const rec = readRec(jobId);
    if (live && live.known) {
      // dom-transport reports 'done' for success AND failure (the verdict is result.ok).
      if (rec && !TERMINAL.has(rec.status) && live.status === 'done') patch(jobId, { status: live.result && live.result.ok ? 'done' : 'error', stage: live.result && live.result.stage || null });
      return live;
    }
    if (!rec) return { known: false };
    if (rec.status === 'interrupted') {
      // 'done' + result is the shape guardian's mesh-client waitForJob() returns on.
      return { known: true, jobId, status: 'done', progress: { phase: 'interrupted' },
        result: { ok: false, sent: null, stage: 'clear_glass_restarted',
          error: 'Clear Glass restarted while this job was in its queue; the prompt may already be in the chat, so it is not resent' } };
    }
    if (rec.status === 'done' || rec.status === 'error') {
      // Finished before a restart, result no longer in memory: say so rather than inventing one.
      return { known: true, jobId, status: 'done', progress: { phase: rec.status },
        result: { ok: false, sent: null, stage: 'clear_glass_restarted', error: `job finished (${rec.status}) but Clear Glass restarted before guardian collected the result` } };
    }
    return { known: true, jobId, status: rec.status, progress: { phase: rec.status } };
  }

  /** recover() — at boot: anything accepted but not finished is now interrupted (its tab and queue are gone). */
  function recover() {
    let n = 0;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.intake')) continue;
      let rec; try { rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch (_) { continue; }
      if (!TERMINAL.has(rec.status)) { writeRec({ ...rec, status: 'interrupted', interruptedAt: now(), updatedAt: now() }); n++; }
    }
    if (n) log(`[intake] ${n} job(s) were in the queue when Clear Glass stopped — marked interrupted`);
    return { interrupted: n };
  }

  function list({ limit = 50 } = {}) {
    return fs.readdirSync(dir).filter(n => n.endsWith('.intake'))
      .map(n => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_) { return null; } })
      .filter(Boolean).sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0)).slice(0, limit);
  }

  return { intake, status, recover, list, dir };
}

/** guardianJobFetcher({port}) — reads a job through guardian's OWN API (GET /jobs?id=). null = guardian has no such job. */
function guardianJobFetcher({ port = 7820, host = '127.0.0.1', timeoutMs = 5000, request = require('http').request } = {}) {
  return (jobId) => new Promise((ok, fail) => {
    const req = request({ host, port, path: `/jobs?id=${encodeURIComponent(jobId)}`, method: 'GET', timeout: timeoutMs }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 404) return ok(null);
        let j = null; try { j = JSON.parse(body); } catch (_) { /* below */ }
        if (res.statusCode !== 200 || !j || !j.ok || !j.job) return fail(new Error(`guardian /jobs?id= returned ${res.statusCode}`));
        ok(j.job);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => fail(new Error(`guardian unreachable on :${port} (${e.code || e.message})`)));
    req.end();
  });
}

module.exports = { createJobIntake, guardianJobFetcher };
