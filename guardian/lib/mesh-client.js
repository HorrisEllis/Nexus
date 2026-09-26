'use strict';
/**
 * guardian/lib/mesh-client.js — guardian's client for the Clear Glass agent mesh (:7702, CLEARGL_IPC_PORT).
 * 2026-09-19. Built for whole-code-base jobs, so it is a JOB protocol, not one long HTTP call:
 *
 *   POST /agent-mesh/send      {provider,prompt,content,agentId,accountId,jobId,selectors,timeoutMs,opts} -> {accepted, ...}
 *   GET  /agent-mesh/job?jobId -> {known, status:'queued'|'running'|'done', progress, result?}
 *   POST /agent-mesh/diagnose  {provider,agentId,accountId,stage,selectors} -> {ok, repaired, selectors?, evidence?}
 *   POST /agent-mesh/read      {jobId, selectors}   re-read an already-sent job's answer with repaired selectors
 *
 * The mesh is IDEMPOTENT by jobId: asking again (e.g. after a guardian restart) attaches to the running/finished job
 * and never sends the prompt twice. `sent` is three-valued (true | false | null); null = possibly sent, NEVER resend.
 * What we can and cannot prove:
 *   connection refused / 404 on POST   => nothing was sent            => sent:false (mesh_unreachable) => userscript fallback
 *   the mesh forgot the job (restart)  => the prompt may have been sent => sent:null (mesh_restarted) => user
 *   we lose the mesh for > graceMs     => unknown                      => sent:null (mesh_lost)       => user
 * Bodies are decoded as UTF-8 STREAMS (setEncoding): decoding chunks one by one corrupts multi-byte characters that
 * straddle a chunk boundary, which is exactly what a multi-MB prompt or answer full of non-ASCII source would hit.
 */
const http = require('http');
const PRE_DELIVERY = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH']);

function request(method, pathname, body, { port, timeoutMs = 60000 }) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      res.setEncoding('utf8');
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        let json = null; try { json = JSON.parse(d); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', (e) => resolve({ error: e.code || e.message, preDelivery: PRE_DELIVERY.has(e.code) }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (data) req.write(data); req.end();
  });
}

function createMeshClient({ port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10), pollMs = 2000, graceMs = 300000, sleep = (ms) => new Promise(r => setTimeout(r, ms)), now = Date.now } = {}) {
  const rq = (m, p, b, t) => request(m, p, b, { port, timeoutMs: t });

  // Wait for a job to finish. `everSeen` = the mesh has confirmed it knows this job (so it was accepted).
  async function waitForJob(jobId, { timeoutMs, onProgress, everSeen = false }) {
    const deadline = now() + (timeoutMs || 3600000) + 120000;
    let lostSince = null;
    for (;;) {
      const r = await rq('GET', `/agent-mesh/job?jobId=${encodeURIComponent(jobId)}`, undefined, 20000);
      if (r.error || r.status >= 500 || !r.json) {
        lostSince = lostSince || now();
        if (now() - lostSince > graceMs) return { ok: false, sent: everSeen ? null : false, stage: everSeen ? 'mesh_lost' : 'mesh_unreachable', error: `lost contact with the mesh (${r.error || r.status})` };
      } else {
        lostSince = null;
        const j = r.json;
        if (j.known === false) return { ok: false, sent: everSeen ? null : false, stage: everSeen ? 'mesh_restarted' : 'mesh_unreachable', error: 'the mesh does not know this job' };
        everSeen = true;
        if (j.progress && onProgress) { try { onProgress(j.progress); } catch (_) {} }
        if (j.status === 'done') return j.result || { ok: false, sent: null, stage: 'mesh_lost', error: 'job finished without a result' };
      }
      if (now() > deadline) return { ok: false, sent: null, stage: 'timeout', error: 'guardian gave up waiting for the mesh job' };
      await sleep(pollMs);
    }
  }

  return {
    async send(a) {
      const { onProgress, ...payload } = a;
      const r = await rq('POST', '/agent-mesh/send', payload, 120000);
      if (r.error && r.preDelivery) return { ok: false, sent: false, stage: 'mesh_unreachable', error: r.error };
      if (r.status === 404) return { ok: false, sent: false, stage: 'mesh_unreachable', error: '/agent-mesh/send not served by Clear Glass (404)' };
      if (r.json && r.json.accepted === false) return { ok: false, sent: r.json.sent === undefined ? false : r.json.sent, stage: r.json.stage || 'mesh_unreachable', error: r.json.error || null };
      // A timeout/reset AFTER connecting is ambiguous, but the job protocol resolves it: if the mesh accepted the job it
      // will know it (and idempotency makes asking again harmless); if it never did, `known:false` says nothing was sent.
      return waitForJob(payload.jobId, { timeoutMs: payload.timeoutMs, onProgress, everSeen: !!(r.json && r.json.accepted) });
    },
    async read(a) {
      const { onProgress, ...payload } = a;
      const r = await rq('POST', '/agent-mesh/read', payload, 30000);
      if (!r.json || r.json.ok === false) return { ok: false, sent: true, stage: 'mesh_unreachable', error: (r.json && r.json.error) || r.error || 'read failed' };
      return waitForJob(payload.jobId, { timeoutMs: payload.timeoutMs, onProgress, everSeen: true });
    },
    async diagnose(a) {
      const r = await rq('POST', '/agent-mesh/diagnose', a, 45000);
      return r.json || { ok: false, repaired: false, error: r.error || 'no response' };
    },
  };
}
module.exports = { createMeshClient };
