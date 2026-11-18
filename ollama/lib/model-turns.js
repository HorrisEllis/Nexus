'use strict';
/**
 * ollama/lib/model-turns.js — one line for every model call the Ollama system makes (OL5b, docs/2026-11-18-ollama-local-agent-phasemap.spec).
 * James, 2026-11-18: "i was using ollama in the background." · "okay. do it." · "also what about saving performance metrics to a node file to
 * understand how to optimize performance in relation to events in the ledger and the deltas between"
 *
 * Ollama holds one model (OLLAMA_MAX_LOADED_MODELS 1): two callers on two models evicted each other's model call by call (NM1's 30B dropped out
 * when he used the 3b). Every call waits its turn here. The next turn goes to a caller of the model the last turn used, so a model's work stays
 * together; a caller that has waited longer than maxWaitMs goes next whatever its model, so nothing starves. One turn at a time (Ollama runs one).
 *
 *   pick(waiters, lastModel, now, maxWaitMs) → index   pure: the next waiter
 *   createTurns({ maxWaitMs, write, now, freeMem }) → { run(model, meta, fn), status() }
 *     run waits its turn, calls fn(), and writes one .metric node: model, caller, door, waitMs, runMs, swap (the model differed from the last
 *     turn's: Ollama had to load it), free memory before and after, ok, error.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function pick(waiters, lastModel, now, maxWaitMs) {
  if (!waiters.length) return -1;
  // the longest waiter past the cap goes first, whatever its model
  let oldest = 0;
  for (let i = 1; i < waiters.length; i++) if (waiters[i].since < waiters[oldest].since) oldest = i;
  if (now - waiters[oldest].since >= maxWaitMs) return oldest;
  // else the earliest caller of the model already loaded
  if (lastModel) { const same = waiters.findIndex((w) => w.model === lastModel); if (same >= 0) return same; }
  return oldest;
}

// 2026-11-18 — James: "also make sure it doesn't become a performance issue". One asynchronous append per turn (a turn is a model call of
// seconds); the folder made once; a write that fails is dropped, never retried in the call's path.
function metricWriter(dir) {
  let made = false;
  return (node) => {
    try {
      if (!made) { fs.mkdirSync(dir, { recursive: true }); made = true; }
      fs.appendFile(path.join(dir, `turns-${new Date(node.payload.at).toISOString().slice(0, 10)}.jsonl`), JSON.stringify(node) + '\n', () => {});
    } catch (_) { /* a metric not written never stops a call */ }
  };
}

// sigmas (his: "and sigmas"): a running baseline per model of how long a turn runs (Welford: constant time and memory per turn). A turn's sigma is
// how many standard deviations it ran from its model's baseline; under 3 turns there is no baseline yet, said as null, never 0.
function baselines() {
  const by = new Map();
  return {
    add(model, x) { const b = by.get(model) || { n: 0, mean: 0, m2: 0 }; b.n++; const d = x - b.mean; b.mean += d / b.n; b.m2 += d * (x - b.mean); by.set(model, b); },
    sigma(model, x) { const b = by.get(model); if (!b || b.n < 3) return null; const sd = Math.sqrt(b.m2 / (b.n - 1)); return sd > 0 ? Math.round(((x - b.mean) / sd) * 100) / 100 : 0; },
    of(model) { const b = by.get(model); return b ? { n: b.n, meanMs: Math.round(b.mean), sdMs: b.n > 1 ? Math.round(Math.sqrt(b.m2 / (b.n - 1))) : null } : null; },
    all() { const o = {}; for (const k of by.keys()) o[k] = this.of(k); return o; },
  };
}

function createTurns({ maxWaitMs = 10 * 60000, write = () => {}, emit = () => {}, seed = [], now = () => Date.now(), freeMem = () => Math.round(os.freemem() / 1048576) } = {}) {
  const waiters = [];
  let busy = false, lastModel = null, seq = 0;
  const recent = [];
  const base = baselines();
  for (const p of seed) if (p && p.ok && typeof p.runMs === 'number' && p.model) base.add(p.model, p.runMs);

  function next() {
    if (busy || !waiters.length) return;
    const i = pick(waiters, lastModel, now(), maxWaitMs);
    const w = waiters.splice(i, 1)[0];
    busy = true;
    w.start();
  }

  function run(model, meta, fn) {
    return new Promise((resolve, reject) => {
      const w = { model: String(model || ''), since: now(), meta: meta || {} };
      w.start = async () => {
        const started = now(), memBefore = freeMem(), swap = lastModel !== null && lastModel !== w.model;
        let ok = true, error = null, out;
        try { out = await fn(); } catch (e) { ok = false; error = e && e.message ? e.message : String(e); out = e; }
        const ended = now(), runMs = ended - started;
        // a swap's load time is not the model's speed: only a turn that kept its model counts toward its baseline
        const sigma = ok && !swap ? base.sigma(w.model, runMs) : null;
        if (ok && !swap) base.add(w.model, runMs);
        const node = { envelope: 1, type: 'metric', id: `turn-${started}-${++seq}`,
          payload: { at: started, model: w.model, caller: w.meta.caller || null, door: w.meta.door || null, waitMs: started - w.since, runMs,
            swap, firstTurn: lastModel === null, freeMemMBBefore: memBefore, freeMemMBAfter: freeMem(), waitingAfter: waiters.length, ok, error,
            sigma, baseline: base.of(w.model) } };
        write(node);
        try { emit(node.payload); } catch (_) {}   // his "heartbeat not polling": each turn is an event; nobody needs to ask /api/queue
        recent.unshift(node.payload); if (recent.length > 20) recent.pop();
        lastModel = w.model;
        busy = false;
        next();
        if (ok) resolve(out); else reject(out);
      };
      waiters.push(w);
      next();
    });
  }

  function status() {
    return { busy, lastModel, waiting: waiters.map((w) => ({ model: w.model, caller: w.meta.caller || null, door: w.meta.door || null, waitedMs: now() - w.since })), recent, baselines: base.all() };
  }

  return { run, status };
}

let _shared = null;
// the Ollama system's one line, its metrics in its own data (config.DATA_DIR/metrics)
function shared() {
  if (_shared) return _shared;
  let dir = null; try { dir = path.join(require('../config.js').DATA_DIR, 'metrics'); } catch (_) {}
  const max = parseInt(process.env.OLLAMA_TURN_MAX_WAIT_MS || '', 10);
  let emit = () => {}; try { const { broadcast } = require('./state.js'); emit = (p) => broadcast('ollama.turn', p); } catch (_) {}
  _shared = createTurns({ maxWaitMs: Number.isFinite(max) && max > 0 ? max : 10 * 60000, write: dir ? metricWriter(dir) : () => {}, emit, seed: dir ? seedFrom(dir) : [] });
  return _shared;
}

// the baselines resume from disk (persistence): the last 64 KB of the newest metrics file, read once at start, never a scan
function seedFrom(dir, bytes = 65536) {
  try {
    const files = fs.readdirSync(dir).filter((f) => /^turns-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
    if (!files.length) return [];
    const f = path.join(dir, files[files.length - 1]); const size = fs.statSync(f).size; const fd = fs.openSync(f, 'r');
    const buf = Buffer.alloc(Math.min(bytes, size)); fs.readSync(fd, buf, 0, buf.length, size - buf.length); fs.closeSync(fd);
    return buf.toString('utf8').split('\n').slice(buf.length < size ? 1 : 0).map((l) => { try { return JSON.parse(l).payload; } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

module.exports = { pick, createTurns, metricWriter, baselines, seedFrom, shared };
