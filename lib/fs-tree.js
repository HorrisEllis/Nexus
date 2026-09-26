'use strict';
/**
 * lib/fs-tree.js — file-structure tree (agnostic lib tool)
 * UUID: nexus-fs-tree-v1-0000-2026-0807-001
 *
 * James: "make any of those lib tools if they can be used across systems." The
 * tree capability was born inside the Gemini injection tool, but file structure
 * is something ANY system needs (diagnostics, loom, cockpit, the tablet). Promoted
 * here as an agnostic tool; the Gemini injection tool now delegates to it.
 *
 * §data/** refused (state, not code). Depth + entry capped so it can't explode on
 * a huge tree. §1.2 unreadable dirs are skipped, never thrown.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const IGNORE = new Set(['node_modules', '.git', 'data', '.DS_Store']);

function _safe(rel) {
  const abs = path.resolve(ROOT, rel || '.');
  if (!abs.startsWith(ROOT)) throw new Error('path escapes repo root');
  if (/(^|\/)data(\/|$)/.test(rel || '')) throw new Error('data/** is state, not code — refused');
  return abs;
}

/**
 * tree(relPath, opts) — file structure as a text tree.
 * @param opts { maxDepth=3, maxEntries=500, ignore=Set }
 * @returns { root, entries, text, truncated }
 */
function tree(relPath = '.', opts = {}) {
  const maxDepth = opts.maxDepth != null ? opts.maxDepth : 3;
  const cap = opts.maxEntries || 500;
  const ignore = opts.ignore || IGNORE;
  const abs = _safe(relPath);
  const lines = [];
  let count = 0;

  function walk(dir, prefix, depth) {
    if (depth > maxDepth || count >= cap) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries = entries
      .filter(e => !ignore.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (let i = 0; i < entries.length; i++) {
      if (count >= cap) { lines.push(prefix + '… (truncated)'); return; }
      const e = entries[i], last = i === entries.length - 1;
      lines.push(prefix + (last ? '└── ' : '├── ') + e.name + (e.isDirectory() ? '/' : ''));
      count++;
      if (e.isDirectory()) walk(path.join(dir, e.name), prefix + (last ? '    ' : '│   '), depth + 1);
    }
  }

  lines.push(path.relative(ROOT, abs) || '.');
  walk(abs, '', 1);
  return { root: path.relative(ROOT, abs) || '.', entries: count, text: lines.join('\n'), truncated: count >= cap };
}

module.exports = { tree, MODULE_ID: 'fs-tree', VERSION: '1.0.0' };
