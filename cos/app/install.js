'use strict';
/**
 * cos/app/install.js — COS installs Nexus from GitHub itself, first run, no folder to link and no zip to drop (CA5, COS 0.6.0).
 * Map: docs/2026-11-02-cos-the-application-phasemap.spec CA5_cos_installs_nexus_from_github.
 *
 * James, 2026-11-04, with COS 0.5.0 open on "no Nexus folder is linked yet" and the old window behind it: "okay. what is this ? where is the
 * cos ui ? also, have it pull from the git. it should be installing the cos ui. this is redundant garbage." · "i know i downloaded it. this is
 * what i get."
 *
 * Into <COS root>/nexus (beside COS's own settings), then linked and started like a folder he linked himself (MG35), so the cockpit opens:
 *   with git      git clone --filter=blob:none <repo> <dir>   (an existing clone: git pull --ff-only) — Nexus's own updater (SC7) keeps it current
 *   without git   the latest release's asset nexus-<version>.zip from GitHub, unpacked (lib/zip.js); the updater attaches it to git once git exists
 *   then          npm install in <dir> (Nexus's dependencies, Clear Glass's Electron with them)
 * Each step is said as it happens (onStep) and the first failure stops it with its reason; nothing half-done is linked.
 *
 *   plan({ dir, git, npm, repoUrl }) → [{ id, cmd?, args?, cwd?, what }]
 *   run({ dir, git, npm, exec, fetch, unzip, exists, onStep }) → Promise<{ ok, dir, via, version?, error?, step? }>
 *   findTool(name, where) → path | null
 *   spawnSpec(cmd, args, platform?) → { file, args, verbatim }   (CA6: a .cmd under Program Files, quoted for cmd.exe)
 *   targetDir(picked) → the install folder inside the one he picked (CA6)
 */
const fs = require('fs');
const path = require('path');

const REPO = 'HorrisEllis/Nexus';
const REPO_URL = `https://github.com/${REPO}.git`;

function findTool(name, where = null) {
  try {
    const w = where || ((n) => require('child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', [n], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }));
    const first = String(w(name) || '').split(/\r?\n/).map(x => x.trim()).find(Boolean);
    return first || null;
  } catch (_) { return null; }
}

function plan({ dir, git = null, npm = null, repoUrl = REPO_URL, existing = false } = {}) {
  if (!dir) throw new Error('plan needs dir');
  const steps = [];
  if (git) steps.push(existing
    ? { id: 'pull', cmd: git, args: ['-C', dir, 'pull', '--ff-only'], what: 'updating your Nexus from GitHub' }
    : { id: 'clone', cmd: git, args: ['clone', '--filter=blob:none', repoUrl, dir], what: 'downloading Nexus from GitHub (git clone)' });
  else steps.push({ id: 'download', what: 'downloading the latest Nexus release from GitHub (no git on this machine)' });
  steps.push(npm ? { id: 'npm', cmd: npm, args: ['install', '--no-audit', '--no-fund'], cwd: dir, what: 'installing Nexus\'s dependencies (npm install, a few minutes the first time)' }
    : { id: 'npm', what: 'npm not found', missing: true });
  return steps;
}

// CA6 (2026-11-05) — his screen: "'C:\\Program' is not recognized as an internal or external command". npm on Windows is npm.cmd under
// C:\\Program Files\\nodejs; a .cmd needs cmd.exe, and spawn's shell:true joined the path unquoted, so cmd split it at the space. A .cmd now runs
// as cmd.exe /d /s /c ""<path>" <args>" with verbatim arguments, every part with a space quoted. Arguments are COS's own, never his text.
function spawnSpec(cmd, args, platform = process.platform, comspec = process.env.ComSpec || 'cmd.exe') {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(cmd)) return { file: cmd, args, verbatim: false };
  const q = (x) => (/[\s&()^|<>"]/.test(x) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  return { file: comspec, args: ['/d', '/s', '/c', `"${[`"${cmd}"`, ...args.map(q)].join(' ')}"`], verbatim: true };
}

// CA6 — where Nexus goes inside the folder he picked: the folder itself when it is already named nexus or is empty, else <picked>/nexus
function targetDir(picked, { readdir = (d) => { try { return fs.readdirSync(d); } catch (_) { return []; } } } = {}) {
  if (!picked) return null;
  if (path.basename(picked).toLowerCase() === 'nexus' || readdir(picked).length === 0) return picked;
  return path.join(picked, 'nexus');
}

function execDefault(cmd, args, { cwd } = {}) {
  return new Promise((resolve) => {
    const sp = spawnSpec(cmd, args);
    const child = require('child_process').spawn(sp.file, sp.args, { cwd, windowsVerbatimArguments: sp.verbatim, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (d) => { tail = (tail + d.toString()).slice(-2000); };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    child.on('error', (e) => resolve({ code: 1, tail: e.message }));
    child.on('close', (code) => resolve({ code, tail }));
  });
}

async function latestReleaseZip({ fetch = globalThis.fetch, repo = REPO } = {}) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-cos' } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const list = await r.json();
  const rel = (Array.isArray(list) ? list : []).filter(x => !x.draft && !x.prerelease && /^v\d+\.\d+\.\d+$/.test(x.tag_name || ''))
    .map(x => ({ version: x.tag_name.slice(1), asset: (x.assets || []).find(a => /^nexus-\d+\.\d+\.\d+\.zip$/.test(a.name || '')) }))
    .find(x => x.asset);
  if (!rel) throw new Error(`${repo} has no Nexus release with a nexus-<version>.zip`);
  return { version: rel.version, url: rel.asset.browser_download_url };
}

async function run({ dir, git = findTool('git'), npm = findTool(process.platform === 'win32' ? 'npm.cmd' : 'npm') || findTool('npm'), exec = execDefault,
  fetch = globalThis.fetch, unzip = null, exists = fs.existsSync, onStep = () => {}, repoUrl = REPO_URL } = {}) {
  if (!dir) return { ok: false, error: 'no folder to install into' };
  const existing = exists(path.join(dir, '.git'));
  if (!existing && exists(path.join(dir, 'VERSION')) && exists(path.join(dir, 'node_modules'))) return { ok: true, dir, via: 'already-installed' };
  const steps = plan({ dir, git, npm, repoUrl, existing });
  let version = null;
  for (const s of steps) {
    onStep({ id: s.id, what: s.what, state: 'running' });
    if (s.missing) { const error = 'npm was not found: install Node.js (it brings npm) from https://nodejs.org, then press Install Nexus again'; onStep({ id: s.id, state: 'failed', error }); return { ok: false, dir, step: s.id, error }; }
    if (s.id === 'download') {
      try {
        const rel = await latestReleaseZip({ fetch }); version = rel.version;
        const res = await fetch(rel.url, { headers: { 'User-Agent': 'nexus-cos' } });
        if (!res.ok) throw new Error(`the download answered ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(dir, { recursive: true });
        (unzip || ((b, d) => { const Zip = require('../../lib/zip.js'); new Zip(b).extractAllTo(d, true); }))(buf, dir);
      } catch (e) { const error = `the Nexus release could not be downloaded: ${e.message}`; onStep({ id: s.id, state: 'failed', error }); return { ok: false, dir, step: s.id, error }; }
      onStep({ id: s.id, state: 'done', version }); continue;
    }
    if (s.id === 'clone') { try { fs.mkdirSync(path.dirname(dir), { recursive: true }); } catch (_) {} }
    const r = await exec(s.cmd, s.args, { cwd: s.cwd });
    if (r.code !== 0) { const error = `${s.what} failed (exit ${r.code}): ${String(r.tail || '').trim().split('\n').slice(-3).join(' ').slice(0, 300)}`; onStep({ id: s.id, state: 'failed', error }); return { ok: false, dir, step: s.id, error }; }
    onStep({ id: s.id, state: 'done' });
  }
  try { version = version || fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(); } catch (_) {}
  return { ok: true, dir, via: git ? (existing ? 'git-pull' : 'git-clone') : 'release-zip', version };
}

module.exports = { REPO, REPO_URL, findTool, plan, run, latestReleaseZip, spawnSpec, targetDir, MODULE_ID: 'cos.app.install', VERSION: '1.1.0' };
