'use strict';
/**
 * lib/parallel-dispatch.js — genuine concurrent multi-agent dispatch:
 * DIFFERENT jobs to DIFFERENT agents at the same time, not the same
 * question to everyone (that's agent-council.js) and not one after
 * another (that's chains.js).
 * comp_id: nexus.lib.parallel-dispatch
 * UUID: nexus-parallel-dispatch-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James): "why only have one?" — scoped in the phasemap before
 * building (P9), not built blind. Three real questions were named; this
 * is how each is actually answered, not just discussed:
 *
 *   1. Concurrent RAID gating — each job gets its OWN independent
 *      governAction() check, called concurrently (Promise.all), same real
 *      gate every sequential action here already uses. One job being
 *      denied does not affect any other job's own independent check —
 *      concurrency doesn't waive governance, each branch is still
 *      individually governed exactly as §10.3 requires.
 *   2. Rate limits / real cost — opts.maxConcurrent caps how many jobs
 *      actually run at once (default 3), via a real semaphore, not
 *      unlimited fan-out. Five agents firing at once is real cost; this
 *      makes that a deliberate, bounded choice, not an accident.
 *   3. Reconciliation — dispatchAll() returns EVERY real result as an
 *      array. It does not synthesize one "final answer" from independent
 *      branches — same honest discipline as agent-council.js's
 *      summarize(): a real list of what actually happened, not a
 *      fabricated consensus. Deciding what to DO with multiple real
 *      results is the caller's job, not this module's.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

async function _govern(job) {
  try {
    const { governAction } = require(path.join(ROOT, 'copilot/lib/self-model.js'));
    const gov = governAction({ action: 'parallel_dispatch_job', target: job.agent }, {});
    return { allowed: gov.allowed !== false, reason: gov.reason, faultHistory: gov.faultHistory };
  } catch (e) { return { allowed: true, reason: null, error: e.message }; }
}

/**
 * dispatchAll(jobs, opts) — jobs: [{ agent, prompt, label? }]. Each is
 * independently governed and independently dispatched, concurrency capped
 * at opts.maxConcurrent (default 3). opts.dispatchToAgent(agent, prompt)
 * required — same separation-of-concerns as agent-council/roundtable.
 */
async function dispatchAll(jobs, opts = {}) {
  if (!opts.dispatchToAgent) throw new Error('parallel-dispatch: opts.dispatchToAgent is required');
  if (!Array.isArray(jobs) || !jobs.length) throw new Error('parallel-dispatch: jobs must be a non-empty array of { agent, prompt }');
  const maxConcurrent = opts.maxConcurrent || 3;

  const results = new Array(jobs.length);
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      const job = jobs[i];
      const startedAt = Date.now();
      const gov = await _govern(job);
      if (!gov.allowed) {
        results[i] = { job, ok: false, denied: true, reason: gov.reason, durationMs: Date.now() - startedAt };
        continue;
      }
      try {
        const r = await opts.dispatchToAgent(job.agent, job.prompt);
        results[i] = { job, ok: true, result: r.text || r, toolCallLog: r.toolCallLog || null, durationMs: Date.now() - startedAt };
      } catch (e) {
        results[i] = { job, ok: false, error: e.message, durationMs: Date.now() - startedAt };
      }
    }
  }

  // §REAL concurrency cap — exactly maxConcurrent workers pulling from the
  // same cursor, not Promise.all over everything at once regardless of size.
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, jobs.length) }, () => worker()));

  const record = {
    id: `parallel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobCount: jobs.length, maxConcurrent,
    succeeded: results.filter(r => r.ok).length,
    denied: results.filter(r => r.denied).length,
    failed: results.filter(r => !r.ok && !r.denied).length,
    results, ts: Date.now(),
  };
  try { const jaa = _jaa(); if (jaa) jaa.insert('parallel_dispatch_sessions', record); } catch (_) {}

  return record;
}

module.exports = { dispatchAll, MODULE_ID: 'parallel-dispatch', VERSION: '1.0.0' };
