'use strict';
/**
 * lib/shadow-space.js — SH1 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec), 0.39.322.
 * component_id: nexus.lib.shadow-space
 *
 * James: "shadow space?" · "next"
 *
 * Where a generated change acts before it is real. A shadow space is a COS workspace branch of the repo (a git
 * worktree — cos/workspace branchWorkspace) with the step's shadow declared on it (lib/shadow.js: what must exist
 * afterwards). A model writes only into the space. commit() runs the test INSIDE the space itself — a result handed
 * in is not proof — and settles the shadow:
 *   the test fails, or something declared is absent → the space is discarded; the real tree is untouched; each
 *     absence is a gap (lib/gap-field) with the step as its cause
 *   both hold → the space's commit is merged into the real tree, fast-forward only (the real tree moved meanwhile →
 *     refused, said, nothing lost: the branch is kept)
 *
 *   open({ originDir, step, expects, causedBy? }) -> { ok, space } | { ok:false, error }
 *   write(space, relPath, text)                   -> inside the space only; a path outside it is refused
 *   commit(space, { test: [cmd, ...args], message }) -> { ok, merged, test, shadow } | { ok:false, stage, ... }
 *   discard(space)                                -> the worktree and its branch removed
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const MODULE_ID = 'nexus.lib.shadow-space';
const VERSION = '1.0.0';

const W = () => require('../cos/workspace/index.js');
const SH = () => require('./shadow.js');
const _git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let _n = 0;

function open({ originDir, step, expects = {}, causedBy = null } = {}) {
  if (!step) return { ok: false, error: 'shadow-space: a step is required — it is the cause of anything absent' };
  const name = `shadow-${String(step).replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}-${process.pid}-${++_n}`;
  const b = W().branchWorkspace({ originDir, name });
  if (!b.ok) return { ok: false, error: b.error };
  const shadow = SH().declare({ step, expects, subject: path.basename(originDir), causedBy: causedBy || step });
  return { ok: true, space: Object.freeze({ dir: b.dir, branch: b.branch, originDir: b.originDir, base: b.base, step, shadow }) };
}

function write(space, rel, text) {
  const abs = path.resolve(space.dir, rel);
  if (abs !== space.dir && !abs.startsWith(space.dir + path.sep)) throw new Error(`shadow-space: ${rel} is outside the space — refused`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  return abs;
}

function _files(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r); else out.push(r);
    }
  };
  walk('');
  return out;
}

function discard(space) {
  return W().removeBranch({ originDir: space.originDir, dir: space.dir, deleteBranch: true });
}

function commit(space, { test = null, message = null, timeoutMs = 120000 } = {}) {
  let t = { ran: false, passed: true };
  if (test) {
    const [cmd, ...args] = test;
    const r = spawnSync(cmd, args, { cwd: space.dir, encoding: 'utf8', timeout: timeoutMs });
    t = { ran: true, passed: r.status === 0, exitCode: r.status, output: String(r.stdout || '').slice(-2000) + String(r.stderr || '').slice(-2000) };
  }
  const settled = SH().settle(space.shadow, { files: _files(space.dir), fields: [] });
  if (!t.passed || !settled.ok) {
    discard(space);
    return { ok: false, stage: !t.passed ? 'test' : 'shadow', merged: false, test: t, shadow: { absent: settled.absent, gaps: settled.gaps } };
  }
  try {
    _git(['add', '-A'], space.dir);
    const dirty = _git(['status', '--porcelain'], space.dir);
    if (dirty) _git(['-c', 'user.name=nexus', '-c', 'user.email=nexus@localhost', 'commit', '-q', '-m', message || `${space.step} (shadow space)`], space.dir);
    _git(['merge', '--ff-only', '-q', space.branch], space.originDir);
  } catch (e) {
    return { ok: false, stage: 'merge', merged: false, kept: space.branch, error: String(e.stderr || e.message).trim().split('\n').pop(), test: t };
  }
  discard(space);
  return { ok: true, merged: true, test: t, shadow: { present: settled.present } };
}

module.exports = { MODULE_ID, VERSION, open, write, commit, discard };
