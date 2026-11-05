'use strict';
/**
 * cos/manager/deps.js — Nexus's dependencies installed before COS boots the systems (DP1, 0.60.399).
 * Map: docs/2026-11-02-cos-console-phasemap.spec SC13_dependencies_before_boot.
 * James, 2026-11-05: "cos also needs to install the dependancies."
 *
 * A pulled or unzipped Nexus whose package-lock.json is newer than what npm last installed (node_modules/.package-lock.json, npm 7+), or that
 * has no node_modules at all, gets `npm install` before boot. A system started without its dependencies crashes and is restarted, over and over.
 *   check(root) → { needed, why }      install(root, { exec }) → Promise<{ ok, code, tail, ms }>
 * npm.cmd under Program Files runs quoted through cmd.exe (cos/app/install.js spawnSpec, CA6), never split at the space.
 */
const fs = require('fs');
const path = require('path');

const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch (_) { return null; } };
// what was installed, by content: after a good install COS keeps the lock's hash, so a git pull that only touches the file's time is not an install
const STAMP = (root) => path.join(root, 'node_modules', '.cos-deps.json');
const lockHash = (root) => { for (const f of ['package-lock.json', 'package.json']) { try { return require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex'); } catch (_) {} } return null; };
function check(root) {
  if (!fs.existsSync(path.join(root, 'package.json'))) return { needed: false, why: 'no package.json here' };
  const nm = path.join(root, 'node_modules');
  if (!fs.existsSync(nm)) return { needed: true, why: 'node_modules is missing' };
  try { const st = JSON.parse(fs.readFileSync(STAMP(root), 'utf8')); return st.lock === lockHash(root) ? { needed: false, why: 'dependencies are current' } : { needed: true, why: 'package-lock.json changed since the last npm install' }; } catch (_) { /* no stamp yet: by time, below */ }
  const lock = mtime(path.join(root, 'package-lock.json')) || mtime(path.join(root, 'package.json'));
  const installed = mtime(path.join(nm, '.package-lock.json'));
  if (installed == null) return { needed: true, why: 'npm has no record of an install here (node_modules/.package-lock.json missing)' };
  if (lock && lock > installed + 1000) return { needed: true, why: 'package-lock.json changed since the last npm install' };
  return { needed: false, why: 'dependencies are current' };
}

function npmPath() {
  try { const w = require('child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', [process.platform === 'win32' ? 'npm.cmd' : 'npm'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); return String(w).split(/\r?\n/).map(x => x.trim()).find(Boolean) || null; } catch (_) { return null; }
}
function stamp(root) { try { fs.writeFileSync(STAMP(root), JSON.stringify({ lock: lockHash(root), at: new Date().toISOString() }) + '\n'); } catch (_) {} }
function install(root, { exec = null, npm = npmPath(), now = Date.now } = {}) {
  if (!npm && !exec) return Promise.resolve({ ok: false, code: null, tail: 'npm was not found: install Node.js (it brings npm) from https://nodejs.org', ms: 0 });
  const args = ['install', '--no-audit', '--no-fund'];
  const t0 = now();
  if (exec) return Promise.resolve(exec(npm || 'npm', args, { cwd: root })).then(r => { if (r.code === 0) stamp(root); return { ok: r.code === 0, code: r.code, tail: r.tail || '', ms: now() - t0 }; });
  const { spawnSpec } = require('../app/install.js');
  const sp = spawnSpec(npm, args);
  return new Promise((resolve) => {
    const child = require('child_process').spawn(sp.file, sp.args, { cwd: root, windowsVerbatimArguments: sp.verbatim, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = ''; const keep = (d) => { tail = (tail + d.toString()).slice(-2000); };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    child.on('error', (e) => resolve({ ok: false, code: 1, tail: e.message, ms: now() - t0 }));
    child.on('close', (code) => { if (code === 0) stamp(root); resolve({ ok: code === 0, code, tail, ms: now() - t0 }); });
  });
}

module.exports = { check, install, stamp, npmPath, MODULE_ID: 'cos.manager.deps', VERSION: '1.0.0' };
