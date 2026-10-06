'use strict';
/**
 * lib/proof-overlay.js — prove a phase against the code it proposed, not the files on disk. §0.39.361 SB52.
 * UUID: nexus-lib-proof-overlay-v1-0000-2026-1006-jamesbrooks-001
 *
 * James: "I want to get that pipeline working. Idearium." Driving the whole pipeline end to end showed a phase marked
 * 'proven' while both its files on disk were the skeleton's empty placeholders: in review mode the agent's code is a
 * proposal, waiting for Apply, and the proof ran `node tests/x.test.js` on an empty file — which passes. A proof that
 * cannot fail proves nothing, and it is exactly what a person approves on.
 *
 * prepare({ repoDir, overlays }) -> { dir, overlaid, against, cleanup, note }
 *   overlays  [{ path, content, op }] — the run's proposals (newest per path); op 'delete' removes the file
 *   No overlays → the repo dir itself (against 'disk'). Otherwise a scratch copy of the repo (no .git, node_modules
 *   linked, not copied) with the proposals written over it (against 'proposed'). The person's files are never touched.
 *   A repo too big to copy (over maxBytes) is proved on disk, and says so (note) — never silently.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKIP = new Set(['.git', 'node_modules']);

function _size(dir, cap) {
  let bytes = 0; const stack = [dir];
  while (stack.length) {
    const d = stack.pop(); let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { try { bytes += fs.statSync(p).size; } catch (_) {} if (bytes > cap) return bytes; }
    }
  }
  return bytes;
}

function _safe(root, rel) {
  const abs = path.resolve(root, String(rel || ''));
  return abs !== root && abs.startsWith(root + path.sep) ? abs : null;
}

function prepare({ repoDir, overlays = [], maxBytes = 300 * 1024 * 1024 } = {}) {
  const none = { dir: repoDir, overlaid: [], against: 'disk', cleanup: () => {}, note: null };
  const list = overlays.filter(o => o && o.path && (o.op === 'delete' || typeof o.content === 'string'));
  if (!repoDir || !list.length) return none;
  const size = _size(repoDir, maxBytes);
  if (size > maxBytes) return { ...none, note: `the repo is over ${Math.round(maxBytes / 1048576)} MB — proved against the files on disk, not the ${list.length} proposal(s)` };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proof-'));
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
  try {
    fs.cpSync(repoDir, tmp, { recursive: true, verbatimSymlinks: true, filter: (src) => !SKIP.has(path.basename(src)) || src === repoDir });
    const nm = path.join(repoDir, 'node_modules');
    if (fs.existsSync(nm)) { try { fs.symlinkSync(nm, path.join(tmp, 'node_modules'), 'junction'); } catch (_) {} }
    const overlaid = [];
    for (const o of list) {
      const abs = _safe(tmp, o.path); if (!abs) continue;
      if (o.op === 'delete') { try { fs.rmSync(abs, { force: true }); } catch (_) {} }
      else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, o.content); }
      overlaid.push(o.path);
    }
    return { dir: tmp, overlaid, against: 'proposed', cleanup, note: null };
  } catch (e) {
    cleanup();
    return { ...none, note: `could not lay the proposals over a copy (${e.message}) — proved against the files on disk` };
  }
}

/** overlaysOf(nodes, { since }) — the newest live (proposed / staged) inject per path, created at or after since */
function overlaysOf(nodes = [], { since = 0 } = {}) {
  const by = new Map();
  for (const n of [...nodes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
    if (!n || !n.path || (n.status !== 'proposed' && n.status !== 'staged') || (n.createdAt || 0) < since) continue;
    if (!by.has(n.path)) by.set(n.path, { path: n.path, content: n.content, op: n.op || 'write', id: n.uuid });
  }
  return [...by.values()];
}

module.exports = { MODULE_ID: 'nexus.lib.proof-overlay', VERSION: '1.0.0', prepare, overlaysOf };
