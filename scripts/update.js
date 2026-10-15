#!/usr/bin/env node
'use strict';
/**
 * scripts/update.js — `npm run update`: the latest Nexus, without a zip.
 * component_id: nexus.scripts.update
 *
 * James (2026-10-15): "im so sick of zips". His Nexus was an unzipped download (no .git: "fatal: not a git repository"),
 * six versions behind main, so every fix meant a new zip. A git clone updates in place:
 *   1. refuses, with the reason, when this folder is not a git clone (and prints the one clone command), or when a pull
 *      would overwrite his local edits (lists them);
 *   2. git pull --ff-only from origin (main by default; --branch name);
 *   3. npm install only when package.json or package-lock.json changed;
 *   4. says the version before and after (lib/version.js, the one release number).
 * data/** is never in git, so an update cannot touch his state. --check reports what would happen and changes nothing.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO = 'https://github.com/HorrisEllis/Nexus.git';

function git(args, root) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function versionAt(root) { try { return (fs.readFileSync(path.join(root, 'lib/version.js'), 'utf8').match(/^\s*system:\s*'(\d+\.\d+\.\d+)'/m) || [])[1] || null; } catch (_) { return null; } }

/** plan({ root, branch }) → what an update would do, changing nothing: { ok, why?, branch, from, ahead, dirty, deps } */
function plan({ root = ROOT, branch = 'main', fetch = true } = {}) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    return { ok: false, code: 'NOT_A_CLONE', why: `this folder is not a git clone (an unzipped download). Clone it once:\n  git clone ${REPO} Nexus\n  cd Nexus && npm install\nthen copy your old data\\ folder into the new one, and from then on: npm run update` };
  }
  const from = versionAt(root);
  if (fetch) { try { git(['fetch', '--quiet', 'origin', branch], root); } catch (e) { return { ok: false, code: 'FETCH_FAILED', why: `could not reach GitHub: ${String(e.stderr || e.message).trim().split('\n')[0]}` }; } }
  // porcelain lines are "XY path" — read raw: trimming the output would cut the first line's leading status space
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').filter(Boolean).map(l => l.slice(3));
  let incoming = [];
  try { incoming = git(['diff', '--name-only', 'HEAD', `origin/${branch}`], root).split('\n').filter(Boolean); } catch (_) {}
  const clash = dirty.filter(f => incoming.includes(f));
  if (clash.length) return { ok: false, code: 'LOCAL_EDITS', why: `your edits to ${clash.join(', ')} would be overwritten — commit or move them first`, dirty, from };
  let ahead = 0; try { ahead = Number(git(['rev-list', '--count', `HEAD..origin/${branch}`], root)) || 0; } catch (_) {}
  return { ok: true, branch, from, ahead, dirty, deps: incoming.some(f => f === 'package.json' || f === 'package-lock.json') };
}

function run({ root = ROOT, branch = 'main', check = false, log = console.log } = {}) {
  const p = plan({ root, branch });
  if (!p.ok) { log(`[update] not updated — ${p.why}`); return p; }
  if (!p.ahead) { log(`[update] Nexus ${p.from} is already the latest on ${branch}`); return { ...p, updated: false }; }
  if (check) { log(`[update] ${p.ahead} new commit(s) on ${branch}${p.deps ? ' (dependencies changed: npm install will run)' : ''} — run without --check to update`); return { ...p, updated: false }; }
  git(['pull', '--ff-only', '--quiet', 'origin', branch], root);
  if (p.deps) { log('[update] dependencies changed — npm install'); execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }); }
  const to = versionAt(root);
  log(`[update] Nexus ${p.from} → ${to} (${p.ahead} commit(s)) — restart it: npm run start:all`);
  return { ...p, updated: true, to };
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--branch');
  const r = run({ check: a.includes('--check'), branch: i >= 0 ? a[i + 1] : 'main' });
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = { plan, run, versionAt, REPO };
