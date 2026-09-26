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
// §ONE-TAB 0.39.247 — a browser provider is ONE tab, and one tab answers
// one prompt at a time: a second GUARDIAN_JOB arriving mid-reply replaced
// the userscript's currentJobId, killing the first job's reply watcher.
// So every browser-tab provider is capped at 1; jobs wait their turn in
// this pool. ollama is a local model server and keeps real concurrency.
const DEFAULT_CAP = {
  chatgpt:    1,
  claude:     1,
  gemini:     1,
  perplexity: 1,
  deepseek:   1,
  mistral:    1,
  ollama:     8,
  default:    1,
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

    // §0.39.247 — job stealing removed. It moved the SLOT to another
    // provider but the job still carried its own provider, so dispatch went
    // to the original (full) tab anyway: the cap was bypassed and the
    // borrowed slot was never released (completion releases the job's own
    // provider). A job goes where it was sent, or waits.

    // Queue it — will flush when a slot opens
    this._enqueueWaiting(provider, job, dispatchFn);
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

  // ── release(provider, jobId) — give a slot back without counting an outcome.
  // §0.39.247 — for a job that was handed a slot but NOT delivered (no tab
  // connected, stale socket, timed out and requeued). It goes back on
  // guardian's pendingQueue and comes through enqueue() again on flush;
  // holding its slot meant it later waited on itself. Idempotent.
  release(provider, jobId) {
    const active = this._active.get(provider);
    if (!active || !active.has(jobId)) return false;
    active.delete(jobId);
    this.emit('slot-freed', { provider, jobId, released: true });
    this._flush(provider);
    return true;
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

  // ── _enqueueWaiting — priority queue ────────────────────────────────────
  // §0.39.247 — the waiting job keeps the function that dispatches it. A
  // freed slot used to call _flush(provider) with no function, which took
  // the job off this queue and emitted 'dispatch-ready' — an event nothing
  // listens to. The job was dropped. Invisible at a cap of 3 until a 4th
  // concurrent job; at a cap of 1 it was every job after the first.
  _enqueueWaiting(provider, job, dispatchFn = null) {
    if (!this._waiting.has(provider)) this._waiting.set(provider, []);
    const queue = this._waiting.get(provider);
    if (dispatchFn) Object.defineProperty(job, '_dispatchFn', { value: dispatchFn, enumerable: false, configurable: true });
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
      const fn = dispatchFn || job._dispatchFn;
      if (fn) this._dispatch(provider, job, fn);
      else this.emit('dispatch-ready', { provider, job }); // a job enqueued without a function (direct pool users)
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
