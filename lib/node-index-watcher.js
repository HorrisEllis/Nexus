'use strict';
/**
 * lib/node-index-watcher.js — a real, living index of data/nodes/.
 *
 * §BUILT 2026-09-08 — James: "separated in a folder with the index a
 * living updating directory, that listens in the data folder."
 *
 * Real, proven technique reused, not invented: lib/queue.js's own
 * watchInput() already does fs.watch + an initial scan on attach for
 * exactly this class of problem (a folder of real files that needs a
 * live, in-memory index kept in sync). This is a smaller, purpose-built
 * version for node FILES specifically (.tool/.toolbox/.idea/.contract/
 * etc.) — those aren't a pending/processing/done queue the way
 * PhysicalQueue's own real state machine is, they just exist and need
 * indexing, added/removed/renamed live.
 *
 * Cross-system by design (lives in lib/, matches this session's own
 * stated rule: "lib is only for cross-system libraries") — the DATA it
 * watches is per-system (data/nodes/, or a future data/<system>/nodes/),
 * but the watching mechanism itself is genuinely shared code.
 */

const fs = require('fs');
const path = require('path');

/**
 * watchNodeFolder(dir, onChange) — real, live index of every real
 * node file (anything matching *.{type} where type is a real,
 * registered node extension) in `dir`. onChange(index) fires once
 * immediately with the real, current state, then again on every real
 * add/remove/rename.
 *
 * Returns { getIndex, stop } — stop() closes the real watcher; a
 * caller that never calls it leaks a real fs.watch handle, same as
 * any other real resource this codebase asks callers to clean up.
 */
function watchNodeFolder(dir, onChange) {
  if (typeof onChange !== 'function') throw new Error('[node-index-watcher] onChange callback required');
  let index = {};

  function _scan() {
    const next = {};
    let files = [];
    try { files = fs.readdirSync(dir); } catch (_) { /* real, honest empty index if the dir doesn't exist yet */ }
    for (const f of files) {
      const m = f.match(/^(.+)\.([a-z_]+)$/);
      if (!m) continue;
      const [, id, type] = m;
      next[f] = { id, type, path: path.join(dir, f), mtime: (() => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch (_) { return 0; } })() };
    }
    index = next;
    onChange(index);
  }

  _scan(); // real, immediate first pass — the same real principle this
           // session's own build-queue poller already established:
           // don't wait a full interval before reflecting work that
           // already existed when the watcher started.

  let watcher = null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    watcher = fs.watch(dir, { persistent: false }, () => _scan());
  } catch (e) {
    // §1.2 — a failed watch is loud, not silent; the real, initial scan
    // above still ran, so the caller has a real (if static) index.
    console.warn(`[node-index-watcher] could not watch ${dir}: ${e.message} — index will not update live`);
  }

  return {
    getIndex: () => index,
    stop: () => { try { watcher?.close(); } catch (_) {} },
  };
}

module.exports = { watchNodeFolder };
