'use strict';
/**
 * lib/resource-monitor.js — real resource sampling and pressure classification
 * UUID: nexus-resource-monitor-v1-0000-2026-0710-jamesbrooks-001
 * Version: 1.0.0
 *
 * §WHY — from a live Windows console, 2026-07-10:
 *     [orchestrator] exited code=3221226505 signal=null — crashes in window: 1/6
 *     Error: spawn UNKNOWN  errno: -4094
 *
 * 3221226505 is 0xC0000409, Windows STATUS_STACK_BUFFER_OVERRUN — the fast-fail
 * path Node takes on a fatal error, most often OOM. errno -4094 is UV_UNKNOWN;
 * on Windows a spawn() failing this way during a restart is a resource-
 * exhaustion signature, not a bad path: the same command spawned fine seconds
 * earlier.
 *
 * §MEASURED, NOT GUESSED — autopilot.js spawns twelve Node processes and passes
 * NO heap limit to any of them. Each is free to grow to V8's default maximum
 * (~4GB on 64-bit). Add Clear Glass (Electron + four provider webviews) and the
 * machine has no headroom left. Nothing was watching, so the first symptom was
 * a crash.
 *
 * §WHAT THIS CAN AND CANNOT DO — stated up front, because a monitor that
 * overstates its reach is worse than none:
 *   CAN, zero-dependency, cross-platform:
 *     - os.totalmem/freemem, os.loadavg, os.cpus() delta-sampled for real CPU%
 *     - this process's own memoryUsage() (rss, heapUsed, heapTotal, external)
 *   CANNOT, without a native dep (pidusage/ps):
 *     - another process's RSS from the parent.
 *   So per-child memory is SELF-REPORTED: each supervised system exposes its own
 *   memoryUsage() and the supervisor collects it. A child that cannot answer is
 *   recorded as unreachable — never as healthy, never as zero (§1.2).
 *
 * §NO HIDDEN STATE — sample() returns a value. It does not log, throttle, or
 * decide. Classification is a pure function of a sample, so it is testable
 * without a clock.
 */
const os = require('os');

// Thresholds are the memory HEADROOM below which the machine starts failing
// spawns and OOM-killing processes. Chosen from the observed failure, not from
// a round number: the crash occurred while twelve uncapped heaps were resident.
const DEFAULT_THRESHOLDS = {
  freeMemWarnPct:  0.20,  // < 20% free  -> pressure
  freeMemHaltPct:  0.10,  // < 10% free  -> refuse new spawns
  heapWarnPct:     0.80,  // process heapUsed/heapTotal
  // §FIXED 2026-07-15 — found from a real boot log: "[resource-monitor:
  // autopilot] ok -> pressure — heap 83.6% of allocated" fired at the very
  // start of a real run, before autopilot had spawned a single child
  // process. Not a real signal — V8 allocates heapTotal in small
  // increments and grows it as needed; heapUsed/heapTotal is a noisy,
  // often-misleading ratio until heapTotal has grown past its initial
  // small allocation. A floor stops the ratio from being evaluated at all
  // until there's enough real heap for the percentage to mean something.
  heapMinTotalMB:  64,
  cpuWarnPct:      0.90,
};

let _lastCpu = null;

/** _cpuPercent — real CPU utilisation across a sampling interval, not a snapshot. */
function _cpuPercent() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  if (!_lastCpu) { _lastCpu = { idle, total }; return null; } // §1.1 — first call has no delta; say null, don't invent 0
  const idleDelta  = idle  - _lastCpu.idle;
  const totalDelta = total - _lastCpu.total;
  _lastCpu = { idle, total };
  if (totalDelta <= 0) return null;
  return 1 - (idleDelta / totalDelta);
}

/**
 * sample() — one real observation. Pure with respect to the system: it reads,
 * it does not act.
 */
function sample() {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const mem      = process.memoryUsage();
  return {
    ts: Date.now(),
    pid: process.pid,
    system: {
      totalMem,
      freeMem,
      freeMemPct: freeMem / totalMem,
      usedMemPct: 1 - (freeMem / totalMem),
      cpuPct: _cpuPercent(),          // null on first sample — honest, not zero
      loadavg: os.loadavg(),          // all zeros on Windows; reported as-is, not faked
      cpuCount: os.cpus().length,
      platform: process.platform,
    },
    process: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      heapUsedPct: mem.heapTotal ? mem.heapUsed / mem.heapTotal : 0,
      external: mem.external,
      uptimeSec: Math.round(process.uptime()),
    },
  };
}

/**
 * classify(sample, thresholds) -> { level, reasons, spawnSafe }
 * level: 'ok' | 'pressure' | 'critical'
 *
 * spawnSafe is the one the supervisor cares about. Restarting a process while
 * the machine is out of memory is how a single crash becomes a crash storm:
 * the spawn fails with UNKNOWN, the supervisor counts a crash, and it tries
 * again immediately.
 */
function classify(s, thresholds = DEFAULT_THRESHOLDS) {
  const reasons = [];
  let level = 'ok';

  if (s.system.freeMemPct < thresholds.freeMemHaltPct) {
    level = 'critical';
    reasons.push(`free memory ${(s.system.freeMemPct * 100).toFixed(1)}% < halt threshold ${(thresholds.freeMemHaltPct * 100)}%`);
  } else if (s.system.freeMemPct < thresholds.freeMemWarnPct) {
    level = 'pressure';
    reasons.push(`free memory ${(s.system.freeMemPct * 100).toFixed(1)}% < warn threshold ${(thresholds.freeMemWarnPct * 100)}%`);
  }

  const heapTotalMB = s.process.heapTotal / (1024 * 1024);
  if (heapTotalMB >= (thresholds.heapMinTotalMB ?? 0) && s.process.heapUsedPct > thresholds.heapWarnPct) {
    if (level === 'ok') level = 'pressure';
    reasons.push(`heap ${(s.process.heapUsedPct * 100).toFixed(1)}% of allocated`);
  }

  // cpuPct is null on the first sample. A null must never read as 0% and be
  // silently treated as healthy.
  if (s.system.cpuPct !== null && s.system.cpuPct > thresholds.cpuWarnPct) {
    if (level === 'ok') level = 'pressure';
    reasons.push(`cpu ${(s.system.cpuPct * 100).toFixed(0)}%`);
  }

  return { level, reasons, spawnSafe: level !== 'critical' };
}

/**
 * ResourceMonitor — periodic sampling with a bounded history and an optional bus.
 * The history is capped; a monitor that leaks memory to watch memory is a joke
 * that writes itself.
 */
class ResourceMonitor {
  constructor({ bus = null, intervalMs = 10000, historySize = 180, thresholds = DEFAULT_THRESHOLDS, name = 'nexus' } = {}) {
    this.bus = bus;
    this.intervalMs = intervalMs;
    this.historySize = historySize;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.name = name;
    this.history = [];
    this.lastLevel = 'ok';
    this._timer = null;
  }

  tick() {
    const s = sample();
    const verdict = classify(s, this.thresholds);
    const entry = { ...s, level: verdict.level, reasons: verdict.reasons };

    this.history.push(entry);
    if (this.history.length > this.historySize) this.history.shift();

    // §1.2 — a transition is always reported. Only transitions, so a machine
    // under sustained pressure does not drown its own logs.
    if (verdict.level !== this.lastLevel) {
      const msg = `[resource-monitor:${this.name}] ${this.lastLevel} -> ${verdict.level}${verdict.reasons.length ? ' — ' + verdict.reasons.join('; ') : ''}`;
      if (verdict.level === 'critical') console.error(msg); else console.warn(msg);
      this.bus?.emit?.('nexus.resource.pressure', { level: verdict.level, reasons: verdict.reasons, sample: s }, { source: `resource-monitor:${this.name}` });
      this.lastLevel = verdict.level;
    }
    return entry;
  }

  start() {
    if (this._timer) return this;
    this.tick();
    this._timer = setInterval(() => this.tick(), this.intervalMs);
    if (this._timer.unref) this._timer.unref();  // never hold the process open
    return this;
  }

  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  /** current() — the newest observation, or a fresh one if never ticked. */
  current() { return this.history[this.history.length - 1] || this.tick(); }

  /** spawnSafe(overrides) — the supervisor's gate. Fresh sample; never a
   *  stale verdict. Accepts optional threshold overrides so callers can gate
   *  a specific kernel more strictly (e.g. a heavy optional process) or more
   *  leniently (e.g. a critical core process) than the monitor's own
   *  defaults, without mutating shared state. */
  spawnSafe(overrides) {
    const thresholds = overrides ? { ...this.thresholds, ...overrides } : this.thresholds;
    return classify(sample(), thresholds).spawnSafe;
  }

  /** report() — a bounded summary suitable for an API response. */
  report() {
    const cur = this.current();
    const mem = this.history.map(h => h.system.usedMemPct).filter(Number.isFinite);
    return {
      name: this.name,
      level: cur.level,
      reasons: cur.reasons,
      spawnSafe: cur.level !== 'critical',
      samples: this.history.length,
      current: cur,
      trend: mem.length > 1 ? { usedMemPctFirst: mem[0], usedMemPctLast: mem[mem.length - 1], rising: mem[mem.length - 1] > mem[0] } : null,
    };
  }
}

module.exports = { ResourceMonitor, sample, classify, DEFAULT_THRESHOLDS };
