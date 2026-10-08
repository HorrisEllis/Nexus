'use strict';
/**
 * lib/resource-monitor.js — real resource sampling and pressure classification
 * UUID: nexus-resource-monitor-v1-0000-2026-0710-jamesbrooks-001
 * Version: 1.1.0
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
const v8 = require('v8');

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
  // §0.39.364 — James's console, 2026-10-06: two hours of "ok -> pressure — free memory 19.7%" / "pressure -> ok" every
  // 10 s, and "heap 80.4% of allocated" flipping the same way. Every flip was a nexus.resource.pressure event, and each
  // one pushed intelligence's liminal L2/L4 velocity up until it read "runaway: 1.00" for good. Nothing was wrong:
  // the machine sat ON the line. Three changes, all in what counts as a change of state, none in the thresholds:
  //   clearMarginPct  — a level is left only when free memory is this far back above the line it crossed (20% in,
  //                     25% out; 10% in, 13% out).
  //   confirmSamples  — a calmer or a warning level must hold this many samples in a row before it is reported.
  //                     critical is reported at once: it is the one that must never wait.
  //   heap            — measured against V8's real limit (heap_size_limit), not heapTotal. heapTotal is what V8 has
  //                     reserved so far and grows on demand, so used/total sits near 80–95% in a healthy process.
  //                     Used/limit is how close the process is to an out-of-memory crash.
  clearMarginPct:  0.05,
  criticalClearMarginPct: 0.03,
  confirmSamples:  2,
  heapLimitWarnPct: 0.80,
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
  let heapLimit = 0;
  try { heapLimit = v8.getHeapStatistics().heap_size_limit || 0; } catch (_) { heapLimit = 0; }
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
      heapUsedPct: mem.heapTotal ? mem.heapUsed / mem.heapTotal : 0,   // of what V8 has reserved so far — reported, not judged
      heapLimit,
      heapLimitPct: heapLimit ? mem.heapUsed / heapLimit : null,          // of what it may ever have — the real OOM distance
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
function classify(s, thresholds = DEFAULT_THRESHOLDS, prevLevel = null) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons = [];
  let level = 'ok';
  // §0.39.364 hysteresis — from a level, the line to leave it is further out than the line that entered it
  const wasCritical = prevLevel === 'critical';
  const wasPressed = prevLevel === 'pressure' || wasCritical;
  const halt = t.freeMemHaltPct + (wasCritical ? (t.criticalClearMarginPct || 0) : 0);
  const warn = t.freeMemWarnPct + (wasPressed ? (t.clearMarginPct || 0) : 0);
  const free = s.system.freeMemPct;

  if (free < halt) {
    level = 'critical';
    reasons.push(free < t.freeMemHaltPct
      ? `free memory ${(free * 100).toFixed(1)}% < halt threshold ${(t.freeMemHaltPct * 100)}%`
      : `free memory ${(free * 100).toFixed(1)}% — not yet back above ${(halt * 100).toFixed(0)}% since it went critical`);
  } else if (free < warn) {
    level = 'pressure';
    reasons.push(free < t.freeMemWarnPct
      ? `free memory ${(free * 100).toFixed(1)}% < warn threshold ${(t.freeMemWarnPct * 100)}%`
      : `free memory ${(free * 100).toFixed(1)}% — not yet back above ${(warn * 100).toFixed(0)}%`);
  }

  // the heap against V8's real limit (§0.39.364); heapTotal is only a floor for processes too young to judge
  const heapTotalMB = s.process.heapTotal / (1024 * 1024);
  const hp = s.process.heapLimitPct;
  if (hp != null && heapTotalMB >= (t.heapMinTotalMB ?? 0) && hp > t.heapLimitWarnPct) {
    if (level === 'ok') level = 'pressure';
    reasons.push(`heap ${(hp * 100).toFixed(1)}% of its limit (${Math.round(s.process.heapLimit / 1048576)}MB)`);
  }

  // cpuPct is null on the first sample. A null must never read as 0% and be
  // silently treated as healthy.
  if (s.system.cpuPct !== null && s.system.cpuPct > t.cpuWarnPct) {
    if (level === 'ok') level = 'pressure';
    reasons.push(`cpu ${(s.system.cpuPct * 100).toFixed(0)}%`);
  }

  return { level, reasons, spawnSafe: level !== 'critical' };
}

const _RANK = { ok: 0, pressure: 1, critical: 2 };

/**
 * fitsModel({ model, bytes, loaded, sample }) -> { fits, needBytes, availableBytes, why } — §0.39.364: will a local
 * model fit in memory now. James's log: the ladder climbed from the 3b to the 7b and then the 16b while 1–7% of memory
 * was free; each sat 45 s loading into swap ("ollama sent nothing for 45000 ms") and failed. Ollama frees the models it
 * holds to load another, so what it holds counts as available; the halt line is kept free for everything else.
 * need = bytes × 1.2 (weights plus the context cache). bytes unknown → fits, said so (never a guessed refusal).
 */
function fitsModel({ model = null, bytes = null, loaded = [], sample: s = null, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const gb = (b) => `${(b / 1073741824).toFixed(1)}GB`;
  if (!(bytes > 0)) return { fits: true, needBytes: null, availableBytes: null, why: `${model || 'the model'}'s size is unknown — tried` };
  const held = (loaded || []).filter(Boolean);
  if (model && held.some(x => x.name === model)) return { fits: true, needBytes: 0, availableBytes: null, why: `${model} is already loaded` };
  const smp = s || sample();
  const reclaim = held.reduce((a, x) => a + (Number(x.size) || 0), 0);
  const keep = smp.system.totalMem * t.freeMemHaltPct;
  const availableBytes = Math.max(0, smp.system.freeMem + reclaim - keep);
  const needBytes = Math.round(bytes * 1.2);
  const fits = needBytes <= availableBytes;
  return { fits, needBytes, availableBytes,
    why: `${model || 'the model'} needs ~${gb(needBytes)}; ${gb(availableBytes)} available (${gb(smp.system.freeMem)} free${reclaim ? ` + ${gb(reclaim)} Ollama can release` : ''}, ${gb(keep)} kept back)` };
}

/**
 * ResourceMonitor — periodic sampling with a bounded history and an optional bus.
 * The history is capped; a monitor that leaks memory to watch memory is a joke
 * that writes itself.
 */
class ResourceMonitor {
  constructor({ bus = null, intervalMs = 10000, historySize = 180, thresholds = DEFAULT_THRESHOLDS, name = 'nexus', sampler = null } = {}) {
    this._sample = typeof sampler === 'function' ? sampler : sample;   // injectable, so a recorded run can be replayed
    this.bus = bus;
    this.intervalMs = intervalMs;
    this.historySize = historySize;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.name = name;
    this.history = [];
    this.lastLevel = 'ok';
    this._pending = null;
    this.transitions = 0;
    this._timer = null;
  }

  tick() {
    const s = this._sample();
    const verdict = classify(s, this.thresholds, this.lastLevel);
    // §0.39.364 — a new level is reported once it holds confirmSamples in a row; critical at once
    const need = verdict.level === 'critical' ? 1 : Math.max(1, this.thresholds.confirmSamples || 1);
    if (verdict.level === this.lastLevel) this._pending = null;
    else if (this._pending && this._pending.level === verdict.level) this._pending.n++;
    else this._pending = { level: verdict.level, n: 1 };
    const level = this._pending && this._pending.n >= need ? verdict.level : this.lastLevel;
    const entry = { ...s, level, observed: verdict.level, reasons: verdict.reasons };

    this.history.push(entry);
    if (this.history.length > this.historySize) this.history.shift();

    // §1.2 — a transition is always reported. Only transitions, so a machine
    // under sustained pressure does not drown its own logs.
    if (level !== this.lastLevel) {
      const msg = `[resource-monitor:${this.name}] ${this.lastLevel} -> ${level}${verdict.reasons.length ? ' — ' + verdict.reasons.join('; ') : ''}`;
      if (level === 'critical') console.error(msg); else console.warn(msg);
      this.bus?.emit?.('nexus.resource.pressure', { level, reasons: verdict.reasons, sample: s }, { source: `resource-monitor:${this.name}` });
      this.lastLevel = level;
      this._pending = null;
      this.transitions = (this.transitions || 0) + 1;
    }
    return entry;
  }

  /** level() — the settled level (hysteresis and confirmation applied); what a scheduler should act on */
  level() { return this.current().level; }

  /** backgroundAllowed() — §0.39.364: background work (probes, sweeps) runs only while the machine is ok */
  backgroundAllowed() { return this.level() === 'ok'; }

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
      transitions: this.transitions,
      current: cur,
      trend: mem.length > 1 ? { usedMemPctFirst: mem[0], usedMemPctLast: mem[mem.length - 1], rising: mem[mem.length - 1] > mem[0] } : null,
    };
  }
}

let _shared = null;
/** shared(name) — one started monitor per process, for whatever in it wants to ask "should I run now" */
function shared(name = 'nexus') { if (!_shared) _shared = new ResourceMonitor({ name, intervalMs: 10000 }).start(); return _shared; }

module.exports = { ResourceMonitor, sample, classify, fitsModel, shared, DEFAULT_THRESHOLDS, _RANK };
