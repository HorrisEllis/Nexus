'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/work-queue.js — one heavy job at a time, and none at all under pressure
// UUID: nexus-work-queue-v1-0000-2026-0819-001
// Version: 1.0.0
// Component: lib.work-queue
// Hook: lib.work-queue:v1:p0001
//
// James: "what about queueing co-pilot inputs, and locking ollama to one
// instance?"
//
// Both instincts are right, and the 2026-08-19 run shows exactly why:
//
//   00:41:31  free memory 3.1% — 'memory_pressure' entered FAILURE_MODE
//   00:42:29  gemini renderer gone: oom
//   00:42:29  chatgpt renderer gone: oom
//   00:42:29  perplexity renderer gone: oom
//   00:42:29  claude renderer gone: oom          ← all four, same second
//   00:42:29  [jaa] Flush error (event_log): EPERM ... rename .tmp -> .json
//   00:43:28  [copilot] exited code=3221226505   ← STATUS_STACK_BUFFER_OVERRUN
//
// ── WHY A PLAIN QUEUE IS NOT ENOUGH ─────────────────────────────────────────
//
// A queue that keeps admitting work while memory is critical does not prevent
// an OOM; it schedules one. The jobs still run, just later, and "later" arrives
// while the machine is still at 3% free. That is the failure this module is
// shaped around, so admission is gated on ACTUAL free memory, not just on how
// many jobs are already running.
//
// autopilot already proved the pattern works — from the same run:
//
//   [autopilot] REFUSING to spawn copilot: only 5.8% memory free. Spawning now
//   would fail with 'spawn UNKNOWN' and be miscounted as a crash.
//
// That guard exists for process spawns and nothing else. This applies the same
// judgement to in-process work, and reuses the same thresholds rather than
// inventing a second set that can disagree with autopilot's.
//
// §1.2 — a deferred job is REPORTED as deferred, never dropped and never
// silently held forever. A caller must be able to tell "queued behind other
// work" from "refused because the machine cannot take it" — they call for
// different responses, and a single "pending" hides that.
// ─────────────────────────────────────────────────────────────────────────────

const os = require('os');

const MODULE_ID = 'work-queue';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.work-queue';
const HOOK_ID   = 'lib.work-queue:v1:p0001';

// Matched to autopilot's resource-monitor thresholds on purpose. Two components
// disagreeing about what "critical" means is how a system ends up refusing
// spawns while cheerfully starting the work that caused the pressure.
const WARN_FREE_PCT     = +(process.env.NEXUS_MEM_WARN_PCT     || 20);
const CRITICAL_FREE_PCT = +(process.env.NEXUS_MEM_HALT_PCT     || 10);
const RECHECK_MS        = +(process.env.WORK_QUEUE_RECHECK_MS  || 3000);

function freeMemPct() {
  try { return (os.freemem() / os.totalmem()) * 100; }
  catch (_) { return null; }   // null = unknowable, and never treated as "fine"
}

/**
 * createQueue(name, opts) — a bounded, memory-aware FIFO.
 *
 * @param {number} [opts.concurrency=1]  jobs in flight. 1 = strict serial.
 * @param {number} [opts.maxDepth=50]    queued jobs before admission is refused.
 * @param {number} [opts.timeoutMs]      per-job ceiling; a hung job must not
 *                                       hold the only slot forever.
 * @param {boolean}[opts.memoryAware=true]
 */
function createQueue(name, {
  concurrency = 1, maxDepth = 50, timeoutMs = 120000, memoryAware = true,
} = {}) {
  if (!name) throw new Error(`[${MODULE_ID}] §1.1 a queue needs a name — an anonymous queue cannot be reported on`);

  const waiting = [];
  const running = new Set();
  const stats = {
    admitted: 0, completed: 0, failed: 0, timedOut: 0,
    refusedDepth: 0, deferredMemory: 0, maxObservedDepth: 0,
  };
  let deferTimer = null;

  function _admissible() {
    if (!memoryAware) return { ok: true };
    const free = freeMemPct();
    if (free === null) {
      // §1.2 — memory unreadable. Proceed, but say so: an unknowable value must
      // not silently become a green light.
      return { ok: true, note: 'memory unreadable — admitting without a pressure check, which is NOT the same as verifying there is room' };
    }
    if (free < CRITICAL_FREE_PCT) {
      return { ok: false, reason: `only ${free.toFixed(1)}% memory free (< ${CRITICAL_FREE_PCT}% halt threshold)`, free };
    }
    return { ok: true, free, pressured: free < WARN_FREE_PCT };
  }

  function _pump() {
    if (!waiting.length) return;
    if (running.size >= concurrency) return;

    const adm = _admissible();
    if (!adm.ok) {
      // Do NOT drain into an OOM. Hold, re-check, and say why exactly once per
      // wait rather than logging on every tick.
      if (!deferTimer) {
        stats.deferredMemory++;
        console.warn(`[${MODULE_ID}:${name}] holding ${waiting.length} job(s) — ${adm.reason}. ` +
          `Running them now would schedule the OOM rather than prevent it. Re-checking every ${RECHECK_MS / 1000}s.`);
        deferTimer = setTimeout(() => { deferTimer = null; _pump(); }, RECHECK_MS);
        if (deferTimer.unref) deferTimer.unref();
      }
      return;
    }
    if (deferTimer) { clearTimeout(deferTimer); deferTimer = null; }

    const job = waiting.shift();
    running.add(job);

    let settled = false;
    const timer = timeoutMs ? setTimeout(() => {
      if (settled) return;
      settled = true;
      stats.timedOut++;
      running.delete(job);
      // §1.2 — a hung job must not hold the only slot forever. Stated, so the
      // caller knows the work may still be running somewhere unobserved.
      job.reject(new Error(`[${MODULE_ID}:${name}] job '${job.label}' exceeded ${timeoutMs}ms — slot released. ` +
        `The underlying work may still be in flight; this queue has stopped waiting on it.`));
      _pump();
    }, timeoutMs) : null;
    if (timer && timer.unref) timer.unref();

    Promise.resolve()
      .then(() => job.fn())
      .then(v => {
        if (settled) return;
        settled = true; stats.completed++;
        if (timer) clearTimeout(timer);
        running.delete(job); job.resolve(v); _pump();
      })
      .catch(e => {
        if (settled) return;
        settled = true; stats.failed++;
        if (timer) clearTimeout(timer);
        running.delete(job); job.reject(e); _pump();
      });
  }

  return {
    name,

    /**
     * push(fn, label, opts) — enqueue. Rejects immediately when the queue is
     * full, rather than growing without bound; an unbounded queue under
     * pressure is just a slower memory leak.
     *
     * §BUILT 2026-08-19 — opts.priority: 'highest' jumps to the front instead
     * of the back. Found while merging: copilot's own "hey nexus" handshake
     * already made a request jump ollama's OWN queue (ollama/server.js,
     * body.priority), but this queue sits IN FRONT of that one — a
     * handshake-priority request still waited FIFO behind everything else
     * here first, undermining the feature at the one chokepoint that
     * actually mattered most. Same real mechanism, same real reasoning,
     * applied at the layer that was actually missing it.
     */
    push(fn, label = 'unlabelled', opts = {}) {
      if (typeof fn !== 'function') return Promise.reject(new Error(`[${MODULE_ID}] push requires a function`));
      if (waiting.length >= maxDepth) {
        stats.refusedDepth++;
        return Promise.reject(Object.assign(
          new Error(`[${MODULE_ID}:${name}] queue full (${maxDepth}) — refusing '${label}'. ` +
            `Backpressure is deliberate: an unbounded queue under load defers the failure instead of preventing it.`),
          { code: 'QUEUE_FULL', depth: waiting.length }));
      }
      stats.admitted++;
      return new Promise((resolve, reject) => {
        const entry = { fn, label, resolve, reject, queuedAt: Date.now() };
        if (opts.priority === 'highest') waiting.unshift(entry); else waiting.push(entry);
        stats.maxObservedDepth = Math.max(stats.maxObservedDepth, waiting.length);
        _pump();
      });
    },

    /** health() — the honest picture, including WHY nothing is moving. */
    health() {
      const adm = _admissible();
      return {
        name, concurrency, maxDepth,
        running: running.size, waiting: waiting.length,
        stats: { ...stats },
        admissible: adm.ok,
        // The distinction a caller actually needs: idle because there is no
        // work, versus idle because the machine cannot take any.
        state: running.size ? 'working'
             : !adm.ok ? 'held-memory-pressure'
             : waiting.length ? 'pumping'
             : 'idle',
        blockedReason: adm.ok ? null : adm.reason,
        freeMemPct: adm.free != null ? +adm.free.toFixed(1) : null,
        note: adm.note || null,
      };
    },

    /** drain() — resolve when everything in flight and queued has settled. */
    async drain() {
      while (running.size || waiting.length) await new Promise(r => setTimeout(r, 50));
    },

    _reset() { waiting.length = 0; running.clear(); if (deferTimer) { clearTimeout(deferTimer); deferTimer = null; }
      Object.keys(stats).forEach(k => stats[k] = 0); },
  };
}

// ── Named singletons ─────────────────────────────────────────────────────────
// One queue per shared scarce resource, created once per process. Two queues
// guarding the same resource would each think they hold the only slot.
const _queues = new Map();

/**
 * get(name, opts) — the shared queue for a named resource.
 * Options apply on FIRST creation only; a later caller cannot quietly widen a
 * concurrency limit another caller is relying on.
 */
function get(name, opts = {}) {
  if (!_queues.has(name)) _queues.set(name, createQueue(name, opts));
  return _queues.get(name);
}

function healthAll() {
  const qs = [...
    _queues.values()].map(q => q.health());
  return {
    ok: true, version: VERSION, queues: qs,
    held: qs.filter(q => q.state === 'held-memory-pressure').map(q => q.name),
    thresholds: { warnPct: WARN_FREE_PCT, criticalPct: CRITICAL_FREE_PCT },
    note: 'thresholds match autopilot\'s resource-monitor deliberately — two components disagreeing about "critical" is how a supervisor refuses spawns while the work that caused the pressure keeps starting',
  };
}

module.exports = { createQueue, get, healthAll, freeMemPct,
  WARN_FREE_PCT, CRITICAL_FREE_PCT, MODULE_ID, VERSION, COMP_ID, HOOK_ID,
  _clearAll() { _queues.clear(); } };
