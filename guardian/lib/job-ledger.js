'use strict';
/**
 * guardian/lib/job-ledger.js — the job ledger (JL1, docs/2026-10-30-pipeline-consolidation-and-job-ledger-phasemap.spec)
 *
 * James, 2026-10-30: "also the phase that has each job from guardian saved in the queue, the formeer .response, and
 * have it be the job ledger, each job has to have it's corrasponding .response node to be fullfilled from clearglass'
 * end." Restated 2026-11-13: "need a ledger for agents using the jobs and .response in the back end and logging the
 * status maybe. guardian is the source of truth. lets get it built and integrated into the backend."
 *
 * §8.6 reuse, not a new store: the job ledger is a JOIN over two things that already exist and are each already real —
 * Guardian's own job store (guardian/lib/jobs.js, the in-memory + on-disk .job files: the source of truth for a job's
 * state) and the .response node (guardian/lib/response-sink.js, schema.response: the durable, re-readable record of
 * what an agent answered, written from NCP's completion path — a job "fulfilled from Clear Glass' end"). Nothing new
 * is written here; this file only reads both and says, per job, whether it is fulfilled.
 *
 * §SOVEREIGNTY (2026-11-13, SW_D5) — this lives in guardian/lib/, not lib/: Guardian is the source of truth for jobs
 * (his words, today), so the ledger over its own jobs is Guardian's, read by other systems through its route, never
 * by requiring this file.
 *
 *   row(job)                → one ledger row for a single job object (pure; no I/O beyond response-sink's readNode)
 *   list({ jobs, limit, provider, queueState })  → { rows, counts: { queued, claimed, fulfilled, error, total } }
 *   QUEUE_STATE              → the job.status → queue-state map, named so a new status is a decision, not a silent 'queued'
 */
const sink = require('./response-sink.js');

const MODULE_ID = 'guardian.job-ledger';
const VERSION = '1.0.0';

// job.status (guardian/lib/jobs.js, guardian/lib/dispatcher.js, ncp-handler.js) → the three queue states JL_D1 names.
// 'fulfilled' is decided by the .response node below, not by status alone — a job can read 'complete' in the store
// and still have no node (a restart before the node write, §1.2), which is exactly the case JL_D1 asks to name.
const QUEUE_STATE = Object.freeze({
  pending: 'queued', queued: 'queued', retry_wait: 'queued', retrying: 'queued',
  dispatched: 'claimed', acked: 'claimed', pinging: 'claimed', responding: 'claimed',
  awaiting_transcript: 'claimed', delivered: 'claimed', delivered_confirmed: 'claimed',
  complete: 'fulfilled',
  error: 'error', failed: 'error', cancelled: 'error', orphaned: 'error',
});

function queueStateOf(status) { return QUEUE_STATE[status] || 'queued'; }

/** one ledger row for a job: its queue state, and whether (and how) its .response node is written */
function row(job) {
  if (!job || !job.id) throw new Error('guardian.job-ledger: row() needs a job with an id');
  let node = null;
  try { node = sink.readNode(job.id); } catch (e) { node = null; }   // §1.2 — unreadable is "no node", never thrown out of a ledger read
  const fulfilled = !!node;
  return {
    id: job.id, provider: job.provider || 'unknown', agentId: job.agentId || null, command: job.command || null,
    status: job.status, queueState: queueStateOf(job.status),
    fulfilled,
    response: fulfilled ? { status: node.status, source: node.source, chars: node.chars, contentHash: node.contentHash } : null,
    // §1.2 — named, not inferred: a job the store calls 'complete' with no node is the exact silent gap JL_D1 asks for
    unfulfilled_why: fulfilled ? null
      : (job.status === 'complete' ? 'the job store says complete but its .response node was never written — a restart gap, said'
        : (queueStateOf(job.status) === 'error' ? `job ${job.status}, no response` : 'still in flight')),
    ts: job.ts || null, updatedAt: job.updatedAt || null,
  };
}

/** list({ jobs: Map|iterable, limit, provider, queueState }) → { rows, counts } — newest first */
function list({ jobs, limit = 100, provider = null, queueState = null } = {}) {
  if (!jobs) throw new Error('guardian.job-ledger: list() needs jobs (the job store\'s Map)');
  const all = [...jobs.values()].filter(Boolean);
  let rows = all.map(row);
  if (provider) rows = rows.filter(r => r.provider === provider);
  if (queueState) rows = rows.filter(r => r.queueState === queueState);
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const counts = { queued: 0, claimed: 0, fulfilled: 0, error: 0, total: all.length };
  for (const r of all.map(row)) counts[r.queueState] = (counts[r.queueState] || 0) + 1;
  return { rows: rows.slice(0, Math.max(1, Math.min(1000, Number(limit) || 100))), counts };
}

module.exports = { MODULE_ID, VERSION, QUEUE_STATE, queueStateOf, row, list };
