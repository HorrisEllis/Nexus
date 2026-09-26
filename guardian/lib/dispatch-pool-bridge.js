'use strict';
/**
 * guardian/lib/dispatch-pool-bridge.js — the missing half of §P11.
 * comp_id: nexus.guardian.dispatch-pool-bridge
 * UUID: nexus-guardian-dispatch-pool-bridge-v1-0000-2026-0902-001
 *
 * REAL BOTTLENECK FOUND (James, 2026-09-02, "remove bottleneck"):
 * guardian/lib/dispatch-pool.js's enqueue() claims a per-provider slot
 * (cap: claude 3, chatgpt 3, ollama 8, default 2) before every dispatch —
 * but complete(provider, jobId) and fail(provider, jobId, reason), the
 * only two functions that ever release a slot, had ZERO call sites
 * anywhere in the repo (grep -rn "_dispatchPool\.\(complete\|fail\)"
 * across every .js file, excluding node_modules — zero hits). Every one
 * of guardian/server.js's 9 real completion/error emit sites
 * (bus.emit('guardian.job.complete'|'guardian.job.error', {jobId,
 * provider, ...})) marks the job done in `jobs`/updateJob() but never
 * frees the pool slot that same job claimed. After `cap` jobs per
 * provider, the pool is permanently full — worse than the plain serial
 * pendingQueue it replaced, which at least kept moving.
 *
 * FIX: one generic listener, not nine call-site edits. Every completion
 * path already emits the same {jobId, provider} shape on the same two
 * bus events — that consistency is what makes a single bridge safe here
 * instead of needing to touch browser/mistral/ollama/NCP dispatch
 * branches individually.
 *
 * Wiring (guardian/server.js, once, near the pool's require):
 *   const { pool: _dispatchPool } = require('./lib/dispatch-pool');
 *   require('./lib/dispatch-pool-bridge')(bus, _dispatchPool);
 */

// §0.39.247 — guardian's SISOStream calls listeners with an envelope
// { type, data }; a plain EventEmitter (tests) passes the payload itself.
// Listeners that destructured the payload got undefined in production and
// did nothing. This accepts both.
const _payload = (e) => (e && typeof e === 'object' && typeof e.type === 'string' && e.data && typeof e.data === 'object') ? e.data : (e || {});

function wireDispatchPoolRelease(bus, pool) {
  if (!bus || typeof bus.on !== 'function') {
    throw new Error('[dispatch-pool-bridge] bus with .on() is required');
  }
  if (!pool || typeof pool.complete !== 'function' || typeof pool.fail !== 'function') {
    throw new Error('[dispatch-pool-bridge] pool with .complete()/.fail() is required');
  }

  bus.on('guardian.job.complete', (ev) => {
    const payload = _payload(ev);
    if (!payload || !payload.provider || !payload.jobId) return; // §AX-2: malformed payload, not our job to guess
    pool.complete(payload.provider, payload.jobId);
  });

  bus.on('guardian.job.error', (ev) => {
    const payload = _payload(ev);
    if (!payload || !payload.provider || !payload.jobId) return;
    pool.fail(payload.provider, payload.jobId, payload.error || 'unknown');
  });

  return { wired: true };
}

module.exports = wireDispatchPoolRelease;
