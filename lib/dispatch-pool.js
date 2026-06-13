'use strict';
/**
 * lib/dispatch-pool.js — Per-provider Dispatch Pool
 * UUID: nexus-dp-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Solves: guardian's pendingQueue is serial per provider — one job at a time.
 * Fix: configurable concurrency cap per provider + job stealing + backpressure signal.
 *
 * §1.2: Nothing silently fails — every queue state observable via stats()
 * §LAW II: Physical queue remains file-first — pool is an in-memory concurrency layer on top
 */

const EventEmitter = require('events');

// Default concurrency caps
const DEFAULT_CAP = {
  claude:   3, // browser tab processes sequentially — cap at 3 in-flight
  chatgpt:  3,
  ollama:   8, // local, can handle more
  default:  2,
};

class DispatchPool extends EventEmitter {
  constructor(caps = {}) {
    super();
    this._caps    = { ...DEFAULT_CAP, ...caps };
    this._active  = new Map(); // provider → Set of in-flight jobIds
    this._waiting = new Map(); // provider → job[] (priority-sorted)
    this._stats   = { dispatched: 0, stolen: 0, rejected: 0, completed: 0, failed: 0 };
  }

  // ── cap(provider) — get concurrency cap for a provider ───────────────────
  cap(provider) {
    return this._caps[provider] || this._caps.default;
  }

  // ── available(provider) — open slots ────────────────────────────────────
  available(provider) {
    const active = this._active.get(provider)?.size || 0;
    return Math.max(0, this.cap(provider) - active);
  }

  // ── pressure(provider) — 0.0 (idle) to 1.0 (full) ───────────────────────
  pressure(provider) {
    const active = this._active.get(provider)?.size || 0;
    return active / this.cap(provider);
  }

  // ── enqueue(provider, job, priority) → { dispatched, queued, stolen } ───
  // If slots available: dispatch immediately (return dispatched:true)
  // If full: queue and try job stealing to another provider
  // job: { id, provider, priority, payload }
  enqueue(provider, job, dispatchFn) {
    // Try to dispatch immediately
    if (this.available(provider) > 0) {
      return this._dispatch(provider, job, dispatchFn);
    }

    // Try job stealing — find an idle provider that can handle this job type
    const stolen = this._trySteal(provider, job, dispatchFn);
    if (stolen) {
      this._stats.stolen++;
      return { dispatched: true, stolen: true, provider: stolen };
    }

    // Queue it — will flush when a slot opens
    this._enqueueWaiting(provider, job);
    return { dispatched: false, queued: true, provider };
  }

  // ── complete(provider, jobId) — release a slot ───────────────────────────
  complete(provider, jobId) {
    const active = this._active.get(provider);
    if (active) active.delete(jobId);
    this._stats.completed++;
    this.emit('slot-freed', { provider, jobId });
    // Flush waiting queue for this provider
    this._flush(provider);
  }

  fail(provider, jobId, reason) {
    const active = this._active.get(provider);
    if (active) active.delete(jobId);
    this._stats.failed++;
    this.emit('job-failed', { provider, jobId, reason });
    this._flush(provider);
  }

  // ── _dispatch(provider, job, fn) ─────────────────────────────────────────
  _dispatch(provider, job, dispatchFn) {
    if (!this._active.has(provider)) this._active.set(provider, new Set());
    this._active.get(provider).add(job.id);
    this._stats.dispatched++;
    try { dispatchFn(job); } catch(e) { this.fail(provider, job.id, e.message); }
    return { dispatched: true, stolen: false, provider };
  }

  // ── _trySteal — reroute to an idle provider ──────────────────────────────
  _trySteal(originalProvider, job, dispatchFn) {
    // Only steal to providers that have available slots
    for (const [provider, cap] of Object.entries(this._caps)) {
      if (provider === originalProvider) continue;
      if (provider === 'default') continue;
      if (this.available(provider) > 0) {
        const stolenJob = { ...job, provider, _stolenFrom: originalProvider };
        this._dispatch(provider, stolenJob, dispatchFn);
        this.emit('job-stolen', { from: originalProvider, to: provider, jobId: job.id });
        return provider;
      }
    }
    return null;
  }

  // ── _enqueueWaiting — priority queue ────────────────────────────────────
  _enqueueWaiting(provider, job) {
    if (!this._waiting.has(provider)) this._waiting.set(provider, []);
    const queue = this._waiting.get(provider);
    queue.push(job);
    // Sort: high > normal > low
    const pri = { high: 0, normal: 1, low: 2 };
    queue.sort((a, b) => (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1));
  }

  // ── _flush — dispatch waiting jobs when slots free up ────────────────────
  _flush(provider, dispatchFn) {
    const queue = this._waiting.get(provider) || [];
    while (queue.length > 0 && this.available(provider) > 0) {
      const job = queue.shift();
      if (dispatchFn) this._dispatch(provider, job, dispatchFn);
      else this.emit('dispatch-ready', { provider, job });
    }
  }

  // ── backpressure() — health signal for RAID routing ──────────────────────
  backpressure() {
    const result = {};
    for (const provider of [...this._active.keys(), ...Object.keys(this._caps)]) {
      if (provider === 'default') continue;
      result[provider] = {
        active:   this._active.get(provider)?.size || 0,
        cap:      this.cap(provider),
        pressure: this.pressure(provider),
        waiting:  this._waiting.get(provider)?.length || 0,
        available:this.available(provider),
      };
    }
    return result;
  }

  stats() {
    return { ...this._stats, backpressure: this.backpressure() };
  }
}

// ── Singleton export for guardian to use ─────────────────────────────────────
const _pool = new DispatchPool();
module.exports = { DispatchPool, pool: _pool };
