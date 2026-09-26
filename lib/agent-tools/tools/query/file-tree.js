'use strict';
/**
 * lib/agent-tools/tools/query/file-tree.js — file_tree tool
 * UUID: nexus-agent-tools-file-tree-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "give you a tool to check loom, cortex and
 * file tree and system." read_file (2026-07-07) only ever handled ONE
 * named file — the model had to already know a path to read it. There
 * was no way for the model to discover what's actually there. Checked
 * before building: grepped lib/agent-tools/tools for listDir/fileTree/
 * walkTree — zero hits, genuinely missing, not a duplicate.
 *
 * Same safety pattern as read_file, reused verbatim rather than
 * re-derived (§16.5): real path resolution + root-containment check,
 * not a regex strip. Excludes match snapshot.js's MANIFEST_EXCLUDES
 * (cos/foundation/snapshot.js) by intent — kept as a local literal here
 * since that const isn't exported, noted honestly rather than silently
 * duplicated and left to drift unremarked.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MAX_ENTRIES = 2000;      // hard cap so a huge tree can't blow the response
const DEFAULT_MAX_DEPTH = 3;

// §see header note — mirrors cos/foundation/snapshot.js's MANIFEST_EXCLUDES
// intent (not imported: that const isn't exported by that module).
const EXCLUDES = new Set([
  '.nex', '.cos-wal', 'node_modules', '.git', '__pycache__', '.venv', 'venv',
]);

function _safeResolve(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath || '.');
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return null;
  }
  return resolved;
}

function _walk(absDir, relDir, depth, maxDepth, out) {
  if (out.length >= MAX_ENTRIES) return;
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
  catch (e) { out.push({ path: relDir || '.', error: e.message }); return; }

  for (const ent of entries) {
    if (EXCLUDES.has(ent.name)) continue;
    if (out.length >= MAX_ENTRIES) return;
    const relPath = relDir ? `${relDir}/${ent.name}` : ent.name;
    const absPath = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      out.push({ path: relPath, type: 'dir' });
      if (depth < maxDepth) _walk(absPath, relPath, depth + 1, maxDepth, out);
    } else {
      let size = null;
      try { size = fs.statSync(absPath).size; } catch (_) {}
      out.push({ path: relPath, type: 'file', bytes: size });
    }
  }
}

module.exports = {
  name: 'file_tree',
  description: 'List files and directories under a path in the project, relative to the project root, recursively up to a max depth. Use this to discover what exists before calling read_file on a specific path.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to the project root. Omit or use "." for the project root.' },
      maxDepth: { type: 'integer', description: `How many directory levels to recurse. Default ${DEFAULT_MAX_DEPTH}.` },
      where: require('../../tool-root.js').WHERE_PARAM,
    },
  },
  // 0.39.257 — a project agent's run lists its repo by default (lib/agent-tools/tool-root.js).
  execute: async ({ path: requestedPath, maxDepth, where } = {}, opts = {}) => {
    const TR = require('../../tool-root.js');
    const r = TR.rootFor({ where }, opts);
    if (r.error) return { error: r.error };
    const resolved = r.root === PROJECT_ROOT ? _safeResolve(requestedPath) : TR.safeResolve(r.root, requestedPath);
    if (!resolved) return { error: `path '${requestedPath}' resolves outside the ${r.where} root — refused` };
    if (!fs.existsSync(resolved)) return { error: `path not found: ${requestedPath || '.'}` };
    if (!fs.statSync(resolved).isDirectory()) return { error: `'${requestedPath}' is a file, not a directory — use read_file` };

    const depth = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : DEFAULT_MAX_DEPTH;
    const out = [];
    _walk(resolved, requestedPath && requestedPath !== '.' ? requestedPath.replace(/\/$/, '') : '', 0, depth, out);

    return {
      root: requestedPath || '.', where: r.where,
      maxDepth: depth,
      count: out.length,
      truncated: out.length >= MAX_ENTRIES,
      entries: out,
    };
  },
};
