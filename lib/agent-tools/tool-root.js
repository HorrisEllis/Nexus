'use strict';
/**
 * lib/agent-tools/tool-root.js — which tree a file tool works in.
 * comp_id: nexus.lib.agent-tools.tool-root
 *
 * §BUILT 0.39.257 — James: "the toolscope for the agents tab. need the full
 * capabilities". A repo's project agent now runs the real tool loop, but read_file,
 * file_tree and search_files were rooted at the NEXUS folder and refused anything
 * outside it — and a repo's files live in its own COS compartment, elsewhere. So a
 * run can carry context.repoDir (runToolLoop → executeTool → tool.execute(args, opts)),
 * and these tools resolve against it by default, or against NEXUS itself when asked
 * (args.where = 'nexus'). The containment check is the same one the tools always had:
 * resolve, then refuse anything outside the chosen root.
 */
const path = require('path');

const NEXUS_ROOT = path.resolve(__dirname, '..', '..');

/** rootFor(args, opts) -> { root, where } */
function rootFor(args = {}, opts = {}) {
  const repoDir = opts && opts.context && typeof opts.context.repoDir === 'string' && opts.context.repoDir ? path.resolve(opts.context.repoDir) : null;
  if (args && args.where === 'nexus') return { root: NEXUS_ROOT, where: 'nexus' };
  if (args && args.where === 'repo' && !repoDir) return { root: null, where: 'repo', error: 'where "repo" asked, but this run has no repo — use where "nexus"' };
  return repoDir ? { root: repoDir, where: 'repo' } : { root: NEXUS_ROOT, where: 'nexus' };
}

/** safeResolve(root, p) -> absolute path inside root, or null. */
function safeResolve(root, requested) {
  if (!root) return null;
  const resolved = path.resolve(root, requested || '.');
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

const WHERE_PARAM = Object.freeze({
  type: 'string', enum: ['repo', 'nexus'],
  description: 'Which tree: "repo" = this project\'s own files (the default when you are a project agent), "nexus" = the NEXUS system itself',
});

module.exports = { NEXUS_ROOT, rootFor, safeResolve, WHERE_PARAM };
