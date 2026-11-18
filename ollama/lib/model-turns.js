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

function metricWriter(dir) {
  return (node) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, `turns-${new Date(node.payload.at).toISOString().slice(0, 10)}.jsonl`), JSON.stringify(node) + '\n');
    } catch (_) { /* a metric not written never stops a call */ }
  };
}

function createTurns({ maxWaitMs = 10 * 60000, write = () => {}, now = () => Date.now(), freeMem = () => Math.round(os.freemem() / 1048576) } = {}) {
  const waiters = [];
  let busy = false, lastModel = null, seq = 0;
  const recent = [];

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
        const ended = now();
        const node = { envelope: 1, type: 'metric', id: `turn-${started}-${++seq}`,
          payload: { at: started, model: w.model, caller: w.meta.caller || null, door: w.meta.door || null, waitMs: started - w.since, runMs: ended - started,
            swap, firstTurn: lastModel === null, freeMemMBBefore: memBefore, freeMemMBAfter: freeMem(), waitingAfter: waiters.length, ok, error } };
        write(node);
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
    return { busy, lastModel, waiting: waiters.map((w) => ({ model: w.model, caller: w.meta.caller || null, door: w.meta.door || null, waitedMs: now() - w.since })), recent };
  }

  return { run, status };
}

let _shared = null;
// the Ollama system's one line, its metrics in its own data (config.DATA_DIR/metrics)
function shared() {
  if (_shared) return _shared;
  let dir = null; try { dir = path.join(require('../config.js').DATA_DIR, 'metrics'); } catch (_) {}
  const max = parseInt(process.env.OLLAMA_TURN_MAX_WAIT_MS || '', 10);
  _shared = createTurns({ maxWaitMs: Number.isFinite(max) && max > 0 ? max : 10 * 60000, write: dir ? metricWriter(dir) : () => {} });
  return _shared;
}

module.exports = { pick, createTurns, metricWriter, shared };
