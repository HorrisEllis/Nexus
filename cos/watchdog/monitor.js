/**
 * watchdog/monitor.js
 * COMPARTMENT OS — Watchdog Resource Monitor
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * One WatchdogMonitor per running, watchdog-enabled compartment. Started
 * when its process spawns, stopped when it exits. Polls real OS-level
 * stats (watchdog/proc-stats.js) on an interval and compares against the
 * compartment's OWN archetype-derived watchdog config — not a global
 * default, the per-compartment values every archetype already declares.
 *
 * One-shot-per-anomaly-type-per-process-lifetime: once memory/cpu/stall
 * fires for a given monitor instance, it won't fire again for that same
 * type until the process restarts (a fresh monitor is created then).
 * Otherwise a compartment sitting 1MB over its memory limit would
 * trigger a fresh snapshot+anomaly every poll interval forever.
 */

'use strict';

const { readProcStats } = require('./proc-stats.js');
const { dispatchAnomaly } = require('./actions.js');
const { WATCHDOG, COMP } = require('../foundation/event-contracts.js');

const POLL_INTERVAL_MS = 2000;

const _monitors = new Map(); // compartmentId -> WatchdogMonitor

class WatchdogMonitor {
  /**
   * @param {object} host          { store, sysmap, bus }
   * @param {object} compartment
   */
  constructor(host, compartment) {
    this.host = host;
    this.compartmentId = compartment.id;
    this.lastActivityAt = Date.now();
    this.lastCpuSample = null;
    this.fired = new Set(); // anomaly types already dispatched this process lifetime
    this.intervalHandle = null;
    this.stopped = false;

    this._onStdout = (ev) => { if (ev.payload.compartmentId === this.compartmentId) this.lastActivityAt = Date.now(); };
    this._onStderr = this._onStdout;
    this._unsubStdout = host.bus.on(COMP.PROCESS_STDOUT, this._onStdout);
    this._unsubStderr = host.bus.on(COMP.PROCESS_STDERR, this._onStderr);
  }

  start() {
    this.intervalHandle = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Node: don't let this timer keep a one-shot CLI process alive.
    if (this.intervalHandle.unref) this.intervalHandle.unref();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.intervalHandle);
    if (this._unsubStdout) this._unsubStdout();
    if (this._unsubStderr) this._unsubStderr();
  }

  /** @param {string} type @returns {boolean} true if this is the first time this type fired */
  _markFired(type) {
    if (this.fired.has(type)) return false;
    this.fired.add(type);
    return true;
  }

  poll() {
    if (this.stopped) return;

    const comp = this.host.store.getCompartment(this.compartmentId);
    if (!comp || !comp.watchdog.enabled) { this.stop(); return; }

    const { getProcess } = require('../compartment/process-runner.js');
    const proc = getProcess(this.compartmentId);
    if (!proc) { this.stop(); return; } // process already exited

    const stats = readProcStats(proc.process.pid);
    if (!stats) return; // transient read failure (e.g. process exiting right now) — try again next tick

    const wd = comp.watchdog;
    const now = Date.now();

    // ── Memory ──────────────────────────────────────────────────────────────
    if (wd.memoryLimitMB > 0 && stats.rssMB > wd.memoryLimitMB && this._markFired('memory')) {
      this.host.bus.emit(WATCHDOG.MEMORY_EXCEEDED, {
        compartmentId: comp.id, name: comp.name, rssMB: stats.rssMB, limitMB: wd.memoryLimitMB,
      });
      dispatchAnomaly(this.host, comp, 'memory', `RSS ${stats.rssMB.toFixed(1)}MB exceeds limit ${wd.memoryLimitMB}MB`);
    }

    // ── CPU (needs two samples to compute a rate) ──────────────────────────
    if (this.lastCpuSample) {
      const wallDeltaMs = now - this.lastCpuSample.ts;
      const cpuDeltaMs = stats.cpuTimeMs - this.lastCpuSample.cpuTimeMs;
      const cpuPct = wallDeltaMs > 0 ? (cpuDeltaMs / wallDeltaMs) * 100 : 0;

      if (wd.cpuLimitPct > 0 && cpuPct > wd.cpuLimitPct && this._markFired('cpu')) {
        this.host.bus.emit(WATCHDOG.CPU_EXCEEDED, {
          compartmentId: comp.id, name: comp.name, cpuPct: Math.round(cpuPct), limitPct: wd.cpuLimitPct,
        });
        dispatchAnomaly(this.host, comp, 'cpu', `CPU ${Math.round(cpuPct)}% exceeds limit ${wd.cpuLimitPct}%`);
      }
    }
    this.lastCpuSample = { ts: now, cpuTimeMs: stats.cpuTimeMs };

    // ── Stall (no stdout/stderr activity within stallTimeoutMs) ────────────
    if (wd.stallTimeoutMs > 0 && (now - this.lastActivityAt) > wd.stallTimeoutMs && this._markFired('stall')) {
      this.host.bus.emit(WATCHDOG.PROCESS_STALLED, {
        compartmentId: comp.id, name: comp.name, silentForMs: now - this.lastActivityAt,
      });
      dispatchAnomaly(this.host, comp, 'stall', `no output for ${now - this.lastActivityAt}ms (limit ${wd.stallTimeoutMs}ms)`);
    }
  }
}

/**
 * @param {object} host
 * @param {object} compartment
 */
function startMonitoring(host, compartment) {
  if (!compartment.watchdog || !compartment.watchdog.enabled) return null;
  stopMonitoring(compartment.id); // replace any stale monitor for this compartment
  const monitor = new WatchdogMonitor(host, compartment);
  monitor.start();
  _monitors.set(compartment.id, monitor);
  return monitor;
}

/** @param {string} compartmentId */
function stopMonitoring(compartmentId) {
  const monitor = _monitors.get(compartmentId);
  if (monitor) {
    monitor.stop();
    _monitors.delete(compartmentId);
  }
}

/** @param {string} compartmentId @returns {WatchdogMonitor|null} */
function getMonitor(compartmentId) {
  return _monitors.get(compartmentId) || null;
}

module.exports = {
  WatchdogMonitor,
  startMonitoring,
  stopMonitoring,
  getMonitor,
  POLL_INTERVAL_MS,
};
