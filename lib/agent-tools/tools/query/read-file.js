'use strict';
/**
 * lib/agent-tools/tools/read-file.js — read_file tool
 * UUID: nexus-agent-tools-read-file-v1-0000-2026-0707-jamesbrooks-001
 *
 * The actual answer to "Ollama reading a file should be a tool it
 * decides to use, not an explicit pre-upload step" — the model requests
 * a path mid-generation, this executes it for real and feeds the
 * content back in the same turn.
 *
 * Path safety tested the same way Loom's upload sanitizer was tested
 * this session (../../../etc/passwd and friends) — real path
 * resolution + a root-containment check, not a regex strip (a tool
 * reading real project files needs real paths like "lib/seam/gates.js",
 * a regex that strips "/" would break every legitimate request).
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MAX_READ_BYTES = 256 * 1024; // matches cortex/push-recall.js's own real ceiling, same reasoning

function _safeResolve(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  // §real containment check, not a regex — resolve() collapses ../ for
  // real, then confirm the result is still inside PROJECT_ROOT. Tested
  // against the exact traversal strings this session already proved
  // dangerous elsewhere: '../../../etc/passwd' resolves outside root and
  // is rejected; a real in-project path like 'lib/seam/gates.js' resolves
  // inside root and is allowed.
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return null;
  }
  return resolved;
}

module.exports = {
  name: 'read_file',
  description: 'Read a text file by its path, relative to the root of this project (a project agent) or of NEXUS (where: "nexus"). Returns the file content as plain text.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the root, e.g. "lib/seam/gates.js"' },
      where: require('../../tool-root.js').WHERE_PARAM,
    },
    required: ['path'],
  },
  // 0.39.257 — opts.context.repoDir (a project agent's run) makes the repo the default root (lib/agent-tools/tool-root.js).
  execute: async ({ path: requestedPath, where } = {}, opts = {}) => {
    if (!requestedPath) return { error: 'path is required' };
    const TR = require('../../tool-root.js');
    const r = TR.rootFor({ where }, opts);
    if (r.error) return { error: r.error };
    const resolved = r.where === 'nexus' && r.root === PROJECT_ROOT ? _safeResolve(requestedPath) : TR.safeResolve(r.root, requestedPath);
    if (!resolved) return { error: `path '${requestedPath}' resolves outside the ${r.where} root — refused` };
    if (!fs.existsSync(resolved)) return { error: `file not found: ${requestedPath}` };
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return { error: `'${requestedPath}' is a directory, not a file` };
    if (stat.size > MAX_READ_BYTES) return { error: `file exceeds ${MAX_READ_BYTES} byte read limit (${stat.size} bytes) — request a smaller file or a specific section` };
    const content = fs.readFileSync(resolved, 'utf8');
    return { path: requestedPath, where: r.where, content, bytes: stat.size };
  },
};
