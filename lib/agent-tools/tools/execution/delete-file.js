'use strict';
/**
 * lib/agent-tools/tools/execution/delete-file.js — delete_file tool
 * UUID: nexus-tool-delete-file-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — same safe-path containment as read_file/file_tree
 * (reused, not re-derived — §16.5), but this one mutates, so it also
 * requires confirm:true (no accidental delete from a single malformed
 * call) and refuses directories (use a real recursive op deliberately,
 * not folded silently into this one call).
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function _safeResolve(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath || '');
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) return null;
  return resolved;
}

module.exports = {
  name: 'delete_file',
  description: 'Delete a single file from the project by its path, relative to the project root. Requires confirm:true. Refuses directories and any path resolving outside the project root.',
  parameters: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'File path relative to the project root' },
      confirm: { type: 'boolean', description: 'must be true — no accidental delete' },
    },
    required: ['path', 'confirm'],
  },
  execute: async ({ path: requestedPath, confirm } = {}) => {
    if (!requestedPath) return { error: 'path is required' };
    if (confirm !== true) return { error: 'confirm must be true — refusing an unconfirmed delete' };
    const resolved = _safeResolve(requestedPath);
    if (!resolved) return { error: `path '${requestedPath}' resolves outside the project root — refused` };
    if (!fs.existsSync(resolved)) return { error: `file not found: ${requestedPath}` };
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return { error: `'${requestedPath}' is a directory — delete_file only removes single files` };
    fs.unlinkSync(resolved);
    return { ok: true, deleted: requestedPath };
  },
};
