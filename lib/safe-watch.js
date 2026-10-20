'use strict';
/**
 * lib/safe-watch.js — 0.60.170 RC1: a file watcher that cannot take its process down.
 * comp_id: nexus.lib.safe-watch
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec RC1
 *
 * James, 2026-10-19: "we need to fix the pipeline though. like i said."
 *
 * Seen in his log (16:22:46, 16:29:43, 16:30:24): the orchestrator and Guardian died on
 *   Error: EPERM: operation not permitted, watch … Emitted 'error' event on FSWatcher instance
 * No fs.watch in the tree had an 'error' listener. On Windows a watched folder that is replaced, deleted or locked (a zip
 * extracted over it, an editor's save-by-rename) fires that error ASYNCHRONOUSLY, after the try/catch around fs.watch has
 * returned, so the process threw "Unhandled 'error' event" and autopilot had to restart it — taking every route, SSE stream
 * and pulse with it.
 *
 *   watch(target, [options], [listener]) → a handle with the FSWatcher surface the callers use (close, ref, unref, on).
 *     The same arguments as fs.watch. An error is said once per target (§1.2) and the watcher is re-armed with a backoff
 *     (2 s → 60 s) while the target exists; a caller that listens for 'error' itself still gets it. A synchronous failure
 *     (the folder missing at start) throws exactly as fs.watch does, so every caller's existing catch keeps working.
 *   stats() → { watching, rearmed, errors } for diagnostics.
 */
const fs = require('fs');
const { EventEmitter } = require('events');

const MODULE_ID = 'nexus.lib.safe-watch';
const VERSION = '1.0.0';
const MIN_MS = 2000, MAX_MS = 60000;
const _said = new Set();
const _stats = { watching: 0, rearmed: 0, errors: 0 };

function watch(target, options, listener) {
  if (typeof options === 'function') { listener = options; options = undefined; }
  const h = new EventEmitter();
  let w = null, closed = false, timer = null, delay = MIN_MS, refd = !(options && options.persistent === false);
  const onChange = (...a) => { delay = MIN_MS; if (listener) listener(...a); h.emit('change', ...a); };
  const onError = (e) => {
    _stats.errors++;
    const key = `${target}::${e && e.code}`;
    if (!_said.has(key)) { _said.add(key); console.warn(`[safe-watch] ${target}: ${e && e.code ? e.code + ' ' : ''}${e && e.message} — the watcher is re-armed, the process keeps running (said once)`); }
    if (h.listenerCount('error')) h.emit('error', e);
    try { if (w) w.close(); } catch (_) {}
    w = null; _stats.watching = Math.max(0, _stats.watching - 1);
    schedule();
  };
  function arm() {
    w = fs.watch(target, options || {}, onChange);   // throws synchronously as fs.watch does
    w.on('error', onError);
    if (!refd && w.unref) w.unref();
    _stats.watching++;
  }
  function schedule() {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (closed) return;
      try { if (!fs.existsSync(target)) { delay = Math.min(MAX_MS, delay * 2); return schedule(); } arm(); _stats.rearmed++; delay = MIN_MS; }
      catch (_) { delay = Math.min(MAX_MS, delay * 2); schedule(); }
    }, delay);
    if (timer.unref) timer.unref();
  }
  arm();
  h.close = () => { closed = true; if (timer) { clearTimeout(timer); timer = null; } try { if (w) { w.close(); _stats.watching = Math.max(0, _stats.watching - 1); } } catch (_) {} w = null; h.emit('close'); };
  h.ref = () => { refd = true; try { if (w && w.ref) w.ref(); } catch (_) {} return h; };
  h.unref = () => { refd = false; try { if (w && w.unref) w.unref(); } catch (_) {} return h; };
  h._inject = (e) => onError(e);   // tests: the EPERM the OS fires, without the OS
  return h;
}

function stats() { return { ..._stats }; }

module.exports = { MODULE_ID, VERSION, watch, stats };
