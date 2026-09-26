'use strict';
/**
 * guardian/lib/seam-watchdog.js — SEAM Queue Stall Watchdog
 * UUID: guardian-seam-watchdog-v1-0000-4000-0000-000000000001
 *
 * Closes the gap surfaced 2026-06-19 (queue liveness detection, deferred at
 * the time) and confirmed live in production the same week: the NCP channel
 * layer self-heals on disconnect (userscript-ollama.js etc. — RECONNECT_MS),
 * but a compartment already in GENERATING when the channel drops has no path
 * back. The channel reconnecting does not resume the job. Nothing was
 * watching the job layer. This does.
 *
 * §LAW II — this module owns no compartment state itself. Every transition
 * it triggers still goes through QueueCompartment#_transition / #_escalate,
 * which write to JAA before anything else happens. The watchdog only decides
 * *when* to call the same lever a human already had (POST /seam/retry).
 *
 * Two independent trip conditions, checked every sweep:
 *   1. provider_disconnected — ncpIsConnected(provider) is false right now
 *   2. stall_timeout         — compartment has sat in GENERATING longer than
 *                              stallTimeoutMs with no state change
 * Either one routes through SEAMQueue#forceRetryActive(reason) — the exact
 * method the manual endpoint also calls. One signature. No duplicated retry
 * logic between manual and automatic triggers (§5.7).
 *
 * Escalation safety valve: forceRetryActive → QueueCompartment#watchdogRetry
 * caps watchdog-forced retries at maxWatchdogRetries (default 3, set on the
 * compartment, see seam-queue.js). Past that, the compartment escalates to a
 * human-review gap instead of being retried forever against infrastructure
 * that is actually dead, not just slow or mid-reconnect.
 */

const DEFAULT_INTERVAL_MS      = 10_000; // sweep cadence
const DEFAULT_STALL_TIMEOUT_MS = 45_000; // generous for local 7B models — wider than any real token gap

class SeamWatchdog {
  /**
   * @param {Map}      opts.activeQueues    Live reference to guardian/server.js's _activeQueues Map (not a copy)
   * @param {Function} opts.ncpIsConnected  (provider) => boolean — same check ncp.isConnected() exposes
   * @param {Function} [opts.busEmit]       (type, data) => void — defaults to no-op (still testable standalone)
   * @param {number}   [opts.intervalMs]    Sweep cadence. Default 10s.
   * @param {number}   [opts.stallTimeoutMs] Age threshold before a connected-but-silent chunk is considered stalled. Default 45s.
   */
  constructor({ activeQueues, ncpIsConnected, busEmit, intervalMs, stallTimeoutMs } = {}) {
    if (!activeQueues || typeof activeQueues.values !== 'function')
      throw new Error('SeamWatchdog: activeQueues (Map) required');
    if (typeof ncpIsConnected !== 'function')
      throw new Error('SeamWatchdog: ncpIsConnected fn required');

    this._activeQueues  = activeQueues;
    this._ncpIsConnected = ncpIsConnected;
    this._busEmit        = busEmit || (() => {});
    this.intervalMs      = intervalMs     || DEFAULT_INTERVAL_MS;
    this.stallTimeoutMs  = stallTimeoutMs || DEFAULT_STALL_TIMEOUT_MS;

    this._timer      = null;
    this.sweeps       = 0;
    this.fires        = 0;
    this.lastSweepAt  = null;
    this.lastFire     = null;
  }

  start() {
    if (this._timer) return this; // already running — idempotent
    this._timer = setInterval(() => this.check(), this.intervalMs);
    this._busEmit('guardian.seam.watchdog.started', {
      intervalMs: this.intervalMs, stallTimeoutMs: this.stallTimeoutMs, ts: Date.now(),
    });
    console.log(`[guardian] seam-watchdog: started — sweep every ${this.intervalMs}ms, stall threshold ${this.stallTimeoutMs}ms`);
    return this;
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    return this;
  }

  /**
   * One sweep over every active queue's currently-dispatched compartment.
   * Exposed standalone (not just via the timer) so it's independently
   * callable/testable without waiting on a real interval.
   * @returns {object[]} fired — one entry per compartment this sweep forced a retry on
   */
  check() {
    this.sweeps++;
    this.lastSweepAt = Date.now();
    const fired = [];

    for (const queue of this._activeQueues.values()) {
      const comp = queue._active;
      if (!comp || comp.state !== 'GENERATING') continue; // nothing in flight on this queue

      const age       = Date.now() - comp.updatedAt;
      const connected = this._ncpIsConnected(comp.provider);
      const stalled   = age > this.stallTimeoutMs;

      if (connected && !stalled) continue; // healthy — leave it alone

      const reason = !connected ? 'provider_disconnected' : 'stall_timeout';
      const result = queue.forceRetryActive(reason);
      if (!result.ok) continue; // active compartment changed between the check and the call — fine, skip

      this.fires++;
      this.lastFire = {
        queueId: queue.uuid, chunkUuid: result.chunkUuid, reason,
        escalated: result.escalated, ageMs: age, ts: Date.now(),
      };
      fired.push(this.lastFire);

      console.log(
        `[guardian] seam-watchdog: ${reason} on "${comp.chunkTitle}" (queue ${queue.uuid.slice(0, 8)}, age ${Math.round(age / 1000)}s)` +
        (result.escalated
          ? ' — watchdog retry limit reached, ESCALATED to human review'
          : ` — forced retry ${comp.watchdogRetries}/${comp.maxWatchdogRetries}`)
      );
    }

    return fired;
  }

  status() {
    return {
      running:        !!this._timer,
      intervalMs:      this.intervalMs,
      stallTimeoutMs:  this.stallTimeoutMs,
      sweeps:          this.sweeps,
      fires:           this.fires,
      lastSweepAt:     this.lastSweepAt,
      lastFire:        this.lastFire,
    };
  }
}

function createSeamWatchdog(opts) { return new SeamWatchdog(opts); }

module.exports = { SeamWatchdog, createSeamWatchdog, DEFAULT_INTERVAL_MS, DEFAULT_STALL_TIMEOUT_MS };
