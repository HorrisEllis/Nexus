'use strict';

/**
 * src/diagnostic/process-metrics.js — real process instrumentation
 * UUID: cg-diagnostic-process-metrics-v1-0000-000000000001
 * Version: 1.0.0
 *
 * §NEW 2026-07-11 — built in direct response to "I need to actually know
 * what is happening." Every claim made about the GPU-crash fix and the
 * provider-auto-boot fix up to this point was verified by syntax check
 * and reading Electron's documented behavior — never by watching real
 * numbers on a real machine, because this sandbox can't run Electron.
 * That's a real limit, not a hedge to explain away: this module exists so
 * the person running the real app doesn't have to take those claims on
 * faith. It reports exactly what Electron itself says is running, using
 * Electron's own instrumentation APIs — nothing here is inferred or
 * estimated.
 *
 * app.getAppMetrics() — one row per OS process Electron has spawned,
 * each with a real `type` field ('Browser'|'Tab'|'GPU'|'Utility'|
 * 'Sandbox helper'|'Zygote'|...) and real memory/CPU numbers pulled from
 * the OS, not Electron's own bookkeeping.
 * app.getGPUFeatureStatus() — Chromium's own report of which GPU
 * features are enabled/disabled/software-only, which directly answers
 * "did --disable-gpu actually take effect" instead of assuming it did.
 */

class ProcessMetrics {
  constructor({ app, sse, providerHost = null }) {
    this.app = app;
    this.sse = sse;
    this.providerHost = providerHost;
    this._pollTimer = null;
  }

  // A single, real, complete snapshot — this is the thing to trust, not
  // any narrative summary built from it.
  snapshot() {
    const metrics = this.app.getAppMetrics(); // real OS process list, from Electron
    const gpuStatus = this._safeGpuStatus();

    const byType = {};
    let totalMemoryKB = 0;
    for (const m of metrics) {
      const type = m.type || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
      // workingSetSize is KB, real resident memory, not a JS heap estimate
      totalMemoryKB += m.memory?.workingSetSize || 0;
    }

    const gpuProcesses = metrics.filter(m => m.type === 'GPU');
    const providerWindows = this.providerHost ? this._describeProviderWindows(metrics) : [];

    return {
      ts: Date.now(),
      processCount: metrics.length,
      byType,
      totalMemoryMB: Math.round(totalMemoryKB / 1024),
      gpu: {
        // The direct, literal answer to "did the GPU fix actually work":
        // zero GPU-type processes running, full stop — not "should be
        // disabled," an actual count of what's running right now.
        processCount: gpuProcesses.length,
        processes: gpuProcesses.map(m => ({ pid: m.pid, memoryMB: Math.round((m.memory?.workingSetSize || 0) / 1024) })),
        featureStatus: gpuStatus, // null if getGPUFeatureStatus() itself unavailable/errored
      },
      providerWindows, // [] if providerHost wasn't passed in — reported honestly, not silently omitted
      raw: metrics.map(m => ({
        pid: m.pid, type: m.type,
        cpuPercent: m.cpu?.percentCPUUsage != null ? Math.round(m.cpu.percentCPUUsage * 10) / 10 : null,
        memoryMB: Math.round((m.memory?.workingSetSize || 0) / 1024),
      })),
    };
  }

  _safeGpuStatus() {
    try {
      // Chromium's own ground truth on whether GPU compositing/rasterization
      // etc. are actually disabled — not our assumption that the switches worked.
      return this.app.getGPUFeatureStatus();
    } catch (e) {
      return { error: e.message }; // reported, not swallowed
    }
  }

  _describeProviderWindows(metrics) {
    if (!this.providerHost || typeof this.providerHost.list !== 'function') return [];
    const providers = this.providerHost.list() || [];
    // Best-effort pid correlation isn't available from BrowserWindow directly
    // without extra plumbing — reported as boot status + running flag, not a
    // false one-to-one pid match that would look more precise than it is.
    return providers.map(p => ({
      providerId: p.id, name: p.name, running: p.running,
      status: p.status || 'not-started', startedAt: p.startedAt || null,
    }));
  }

  startPolling(intervalMs = 5000) {
    if (this._pollTimer) return; // already polling — §1.2 no silent double-start
    const poll = () => {
      try {
        const snap = this.snapshot();
        this.sse.emit('process.metrics', snap);
      } catch (e) {
        this.sse.emit('process.metrics.error', { error: e.message, ts: Date.now() });
      }
    };
    poll(); // first sample immediately, don't wait a full interval
    this._pollTimer = setInterval(poll, intervalMs);
  }

  stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }
}

module.exports = { ProcessMetrics };
