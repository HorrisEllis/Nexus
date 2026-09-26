'use strict';
/**
 * guardian/lib/raid-feedback.js — what guardian tells RAID about EVERY finished job (2026-09-19).
 *
 * Found: guardian sent {provider, ok, ms, cluster} but cortex's /api/raid/feedback read {agent, outcome}, so
 * `agent` was always undefined, nothing updated, and the route still answered ok:true: guardian's feedback has never
 * reached RAID. This builds a body carrying BOTH shapes, plus what RAID needs to learn which TRANSPORT works
 * (mesh vs userscript), which account, and why a job fell back. Fire-and-forget and fail-open by design: RAID
 * learning must never be able to stop a job (cortex down => the sample is dropped, nothing else happens).
 *
 * 'needs_user' is its own outcome: a login wall / captcha is not the agent failing, so it must not lower its health.
 */
const http = require('http');

function buildFeedback({ provider, ok, ms = 0, job = null, error = null, needsUser = false } = {}) {
  const outcome = needsUser ? 'needs_user' : (ok ? 'success' : 'failure');
  const trail = (job && job.transportTrail) || [];
  const last = trail.length ? trail[trail.length - 1] : null;
  return {
    agent: provider, provider, outcome, ok: outcome === 'success', ms: Number(ms) || 0, cluster: 'seam',
    jobId: job ? job.id : null,
    transport: (job && job.transport) || 'ncp',                       // jobs the ladder did not touch went over the userscript
    fallbackReason: (job && job.transportFallbackReason) || null,
    tier: last ? last.tier : null,
    stage: (last && last.stage) || (error ? String(error).slice(0, 80) : null),
    agentId: (job && job.agentId) || null,
    accountId: (job && job.accountId) || null,
  };
}

function postFeedback(body, { port = parseInt(process.env.NEXUS_PORT || '3748', 10), timeoutMs = 2000, request = http.request } = {}) {
  try {
    const data = JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port, path: '/api/raid/feedback', method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, r => r.resume());
    req.on('error', () => {});                       // cortex may be down/restarting: drop the sample
    req.on('timeout', () => req.destroy());
    req.write(data); req.end();
  } catch (_) {}
}

module.exports = { buildFeedback, postFeedback };
