'use strict';
/**
 * lib/agent-tools/tools/system-tools/syntax-debug.js — nexus.syntax_debug.tool
 *
 * James's taxonomy: "Debugger for broken syntax."
 *
 * §CHECKED FIRST — `node --check` is already real and used in exactly
 * this shape (spawnSync(process.execPath, ['--check', full], ...))
 * in scripts/precommit-check.js, but scoped only to staged files at
 * commit time. scripts/verify-boot.js's parses() checks one known
 * entry file at a time. Neither is an ad-hoc "check this subtree right
 * now" tool a caller (or agent) can point at an arbitrary directory —
 * confirmed by grep across scripts/ and lib/agent-tools/tools/ before
 * writing this. Same underlying mechanism as precommit-check.js, reused
 * on purpose rather than reimplemented, just not gated to staged files.
 *
 * §SCOPE — syntax only, exactly what `node --check` checks. Does not
 * catch runtime errors, missing requires (that's loom's own
 * dangling-report.js), or logic bugs. Named honestly as a syntax
 * debugger, not a general one.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { toolName } = require('../../naming.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '_archive', '.next', 'dist', 'build']);

function _safeScope(rel) {
  const abs = path.resolve(REPO_ROOT, rel || '.');
  if (!abs.startsWith(REPO_ROOT)) throw new Error('scope escapes repo root — refused');
  return abs;
}

function _collectJsFiles(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) _collectJsFiles(full, out);
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Runs `node --check` on one file. Pure side-effect function, but isolated so tests can stub spawnSync's shape. */
function checkFile(full) {
  const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8', timeout: 5000 });
  if (result.status === 0) return null;
  return (result.stderr || result.error?.message || 'unknown --check failure').trim().split('\n').slice(0, 3).join(' | ');
}

module.exports = {
  name: toolName('nexus', 'syntax_debug'),
  description:
    'Scan a subtree for real JS syntax errors via `node --check` (same mechanism scripts/precommit-check.js uses ' +
    'for staged files, applied here to an arbitrary scope). Returns ONLY files that fail, with the real error — ' +
    'a clean subtree returns an explicit pass, not silence.',
  parameters: {
    type: 'object',
    properties: {
      scope: { type: 'string', default: '.', description: 'subdirectory to scan, relative to repo root' },
      maxFiles: { type: 'number', default: 500, description: 'safety cap on how many files to check in one call' },
    },
  },
  execute: async ({ scope = '.', maxFiles = 500 }) => {
    let dir;
    try { dir = _safeScope(scope); } catch (e) { return { error: e.message }; }
    const files = _collectJsFiles(dir).slice(0, maxFiles);
    if (!files.length) return { ok: true, checked: 0, message: `No .js files found under ${scope}` };
    const failures = [];
    for (const f of files) {
      const err = checkFile(f);
      if (err) failures.push({ file: path.relative(REPO_ROOT, f), error: err });
    }
    return {
      ok: failures.length === 0,
      checked: files.length,
      truncated: files.length === maxFiles,
      failures,
      summary: failures.length
        ? `${failures.length}/${files.length} file(s) failed to parse`
        : `All ${files.length} file(s) parse cleanly`,
    };
  },
  _checkFile: checkFile, // exposed for tests
};
