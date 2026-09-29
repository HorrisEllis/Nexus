'use strict';
/**
 * cos/workspace/index.js — a repo's working environment as a BRANCH of the original, and its desktop.
 * comp_id: nexus.cos.workspace
 * Status: pre-release · §0.39.279
 *
 * James: "I was thinking we could have cos create the vm environment, and each new repo, if applicable could create a
 * branch of the original, to save resources, can you also make it so once its generated, you can open it like a
 * desktop environment?"
 *
 * Before this, every repo the Code button made got a NEW compartment (a new COS root, its own disk, later its own
 * VM) and a fresh copy of every file — D2 in docs/2026-09-28-graph-build-context-settings-memory-phasemap.spec.
 * Now, when the repo comes FROM another one:
 *
 *   branchWorkspace({ originDir, name })   a git worktree of the original's directory on a new branch
 *                                          (nexus/<name>). One object store, one history: the branch costs only the
 *                                          files it changes, and merging it back is an ordinary git merge. An
 *                                          original that is not yet its own git repository is made one first (a
 *                                          baseline commit) — never a worktree of whatever repository happens to
 *                                          contain it (the NEXUS tree itself).
 *   branchDisk({ backing, dest })          the VM half: a qcow2 overlay backed by the original's disk — the branch's
 *                                          VM boots the original's installed environment and writes only its own
 *                                          changes (qemu-img create -b).
 *   desktopFor(compartmentId)              where the compartment's VM display is: VNC on 127.0.0.1:5900+N and the
 *                                          same display as a websocket on 5700+N (qemu-runtime.js -vnc …,websocket),
 *                                          which the desktop viewer (idearium/ui/desktop.html, noVNC) opens.
 *
 * Nothing here decides WHEN to branch — idearium (the repo's owner) asks, through lib/cos-bridge.js.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'nexus.cos.workspace';
const VERSION = '1.0.0';
const BRANCH_PREFIX = 'nexus/';

function _git(args, { cwd, git = 'git', env } = {}) {
  return execFileSync(git, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(env || {}) } }).trim();
}
function _real(p) { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } }

/** slug(name) -> a branch/dir-safe name */
function slug(name) {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  return s || `branch-${Date.now().toString(36)}`;
}

/** gitAvailable() -> bool */
function gitAvailable({ git = 'git' } = {}) { try { _git(['--version'], { git }); return true; } catch (_) { return false; } }

/**
 * ownRepo(dir) — make `dir` its OWN git repository if it is not one (baseline commit of what is there). A directory
 * inside another repository (NEXUS's own tree) gets a nested repository — its top level must be `dir` itself.
 * -> { ok, created, head }
 */
function ownRepo(dir, { git = 'git' } = {}) {
  let top = null;
  try { top = _real(_git(['rev-parse', '--show-toplevel'], { cwd: dir, git })); } catch (_) {}
  const id = ['-c', 'user.name=NEXUS', '-c', 'user.email=nexus@localhost'];
  let created = false;
  if (top !== _real(dir)) {
    _git(['init', '-q'], { cwd: dir, git });
    created = true;
  }
  let head = null;
  try { head = _git(['rev-parse', 'HEAD'], { cwd: dir, git }); } catch (_) {}
  const dirty = (() => { try { return !!_git(['status', '--porcelain'], { cwd: dir, git }); } catch (_) { return false; } })();
  if (!head || dirty) {
    _git(['add', '-A'], { cwd: dir, git });
    _git([...id, 'commit', '-q', '--allow-empty', '-m', head ? 'nexus: snapshot before branching' : 'nexus: baseline (COS branch point)'], { cwd: dir, git });
    head = _git(['rev-parse', 'HEAD'], { cwd: dir, git });
  }
  return { ok: true, created, head };
}

/**
 * branchWorkspace({ originDir, name, root }) -> { ok, dir, branch, originDir, base, reused } | { ok:false, error }
 * root: where branches live (default <originDir>.branches/). An existing worktree of the same branch is reused.
 */
function branchWorkspace({ originDir, name, root = null, git = 'git' } = {}) {
  if (!originDir || !fs.existsSync(originDir) || !fs.statSync(originDir).isDirectory()) return { ok: false, error: `the original's directory does not exist: ${originDir}` };
  if (!gitAvailable({ git })) return { ok: false, error: 'git is not installed — the branch needs it (the repo can still be made as a copy)' };
  const s = slug(name);
  const branch = BRANCH_PREFIX + s;
  const dir = path.join(root || `${originDir.replace(/[\\/]+$/, '')}.branches`, s);
  try {
    const own = ownRepo(originDir, { git });
    const existing = listBranches(originDir, { git }).find(w => w.branch === branch);
    if (existing && fs.existsSync(existing.dir)) return { ok: true, dir: existing.dir, branch, originDir, base: own.head, reused: true };
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    let hasBranch = false;
    try { _git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: originDir, git }); hasBranch = true; } catch (_) {}
    _git(hasBranch ? ['worktree', 'add', '-q', dir, branch] : ['worktree', 'add', '-q', '-b', branch, dir, 'HEAD'], { cwd: originDir, git });
    return { ok: true, dir, branch, originDir, base: own.head, reused: false };
  } catch (e) { return { ok: false, error: `git worktree failed: ${(e.stderr || e.message || '').toString().trim().slice(0, 300)}` }; }
}

/** listBranches(originDir) -> [{ dir, branch, head }] — the original's worktrees other than itself */
function listBranches(originDir, { git = 'git' } = {}) {
  let out = '';
  try { out = _git(['worktree', 'list', '--porcelain'], { cwd: originDir, git }); } catch (_) { return []; }
  const rows = [];
  let cur = null;
  for (const l of out.split('\n')) {
    if (l.startsWith('worktree ')) { cur = { dir: l.slice(9), branch: null, head: null }; rows.push(cur); }
    else if (cur && l.startsWith('HEAD ')) cur.head = l.slice(5);
    else if (cur && l.startsWith('branch ')) cur.branch = l.slice(7).replace(/^refs\/heads\//, '');
  }
  const self = _real(originDir);
  return rows.filter(r => _real(r.dir) !== self);
}

/** removeBranch({ originDir, dir, deleteBranch }) — the worktree goes; the branch (its commits) stays unless asked (§0.3). */
function removeBranch({ originDir, dir, deleteBranch = false, git = 'git' } = {}) {
  try {
    const w = listBranches(originDir, { git }).find(x => _real(x.dir) === _real(dir));
    if (!w) return { ok: false, error: `${dir} is not a branch of ${originDir}` };
    _git(['worktree', 'remove', '--force', dir], { cwd: originDir, git });
    if (deleteBranch && w.branch) _git(['branch', '-D', w.branch], { cwd: originDir, git });
    return { ok: true, removed: dir, branch: w.branch, branchKept: !deleteBranch };
  } catch (e) { return { ok: false, error: (e.stderr || e.message || '').toString().trim().slice(0, 300) }; }
}

/**
 * branchDisk({ backing, dest, runImg }) — the VM half: a qcow2 overlay whose backing file is the original's disk.
 * An existing overlay is kept (it holds the branch's own changes). runImg(args) defaults to qemu-img.
 */
function branchDisk({ backing, dest, runImg = null } = {}) {
  if (!backing || !fs.existsSync(backing)) return { ok: false, error: `the original's disk does not exist: ${backing}` };
  if (fs.existsSync(dest)) return { ok: true, dest, backing, reused: true };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const run = runImg || ((args) => execFileSync(require('../compartment/qemu-runtime.js').qemuImgBin(), args, { stdio: 'pipe', timeout: 120000, windowsHide: true }));
  try { run(['create', '-f', 'qcow2', '-F', 'qcow2', '-b', path.resolve(backing), dest]); }
  catch (e) { return { ok: false, error: `qemu-img create failed: ${(e.stderr || e.message || '').toString().trim().slice(0, 300)}` }; }
  return { ok: true, dest, backing, reused: false };
}

/**
 * desktopFor(compartmentId) -> { display, vncPort, wsPort, host } — the same derivation qemu-runtime.js uses when it
 * starts the VM headless (display N = VNC 5900+N, websocket 5700+N).
 */
function desktopFor(compartmentId) {
  const { desktopPorts } = require('../compartment/qemu-runtime.js');
  return { host: '127.0.0.1', ...desktopPorts(compartmentId) };
}

// ── the desktop session ─────────────────────────────────────────────────────
// One VM per compartment, booted headless (VNC + websocket, qemu-runtime.js) from <state>/desktop.qcow2 — a
// persistent overlay (branchDisk) of the ORIGINAL repo's desktop disk when it has one, else of the base image
// (provision.js --with desktop). The repo's files go in once the guest agent answers: 9p on a Linux host, a
// read-only tar disk elsewhere, unpacked into /home/nexus/<name>. Sessions live in this process.
const _sessions = new Map();   // compartmentId -> session
const DESKTOP_DIR = '.cos-desktop';

function desktopDisk(stateRoot) { return path.join(stateRoot, DESKTOP_DIR, 'desktop.qcow2'); }

/**
 * startDesktop({ compartmentId, name, workDir, stateRoot, originStateRoot, baseImage, ramMB, cpus, network })
 *   -> { ok, state: 'booting'|'running', compartmentId, disk, backing, ports, reused } | { ok:false, error }
 * Returns once QEMU is spawned; the repo is copied in the background (desktopStatus says when it is there).
 */
function startDesktop({ compartmentId, name = 'repo', workDir, stateRoot, originStateRoot = null, baseImage = null, ramMB = 4096, cpus = 2,
                        network = 'nat', _qemu = null, _spawn = null, _ga = null, _host = null, _runImg = null } = {}) {
  if (!compartmentId) return { ok: false, error: 'compartmentId required' };
  const live = _sessions.get(compartmentId);
  if (live && live.exited === null) return { ok: true, reused: true, ...desktopStatus(compartmentId) };
  const q = _qemu || require('../compartment/qemu-runtime.js');
  const spawn = _spawn || require('child_process').spawn;
  const root = stateRoot || workDir;
  if (!root) return { ok: false, error: 'stateRoot (or workDir) required' };
  let base = baseImage;
  if (!base) { try { const b = (_host || require('../testenv/host.js')).base(); base = b.image; } catch (_) {} }
  const originDisk = originStateRoot ? desktopDisk(originStateRoot) : null;
  const backing = originDisk && fs.existsSync(originDisk) ? originDisk : base;
  if (!backing) return { ok: false, error: 'no base image — make one with: node cos/testenv/provision.js --with desktop' };
  const disk = desktopDisk(root);
  const bd = branchDisk({ backing, dest: disk, runImg: _runImg });
  if (!bd.ok) return bd;
  const stateDir = path.dirname(disk);
  const share = process.platform === 'linux' && workDir ? '9p' : 'disk';
  let shareDisk = null;
  if (share === 'disk' && workDir) {
    shareDisk = path.join(stateDir, 'share.tar');
    try { require('../testenv/tar.js').packDir(workDir, shareDisk); } catch (e) { shareDisk = null; }
  }
  const vmConfig = { disk, baseImage: null, iso: null, ramMB, cpus, cpu: 'max', ephemeral: false, network: network === 'none' ? 'none' : 'nat',
    headless: true, accelerator: null, machineType: 'q35', vmStateDir: stateDir, guestAgent: true,
    shareDir: share === '9p' ? workDir : null, shareDisk };
  let built;
  try { built = q.buildQemuArgs(vmConfig, compartmentId, `desktop-${String(compartmentId).slice(0, 8)}`); }
  catch (e) { return { ok: false, error: `could not build the VM: ${e.message}` }; }
  const bin = typeof q.qemuSystemBin === 'function' ? q.qemuSystemBin() : 'qemu-system-x86_64';
  let proc;
  try { proc = spawn(bin, built.args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); }
  catch (e) { return { ok: false, error: `qemu did not start: ${e.message}` }; }
  const sess = { compartmentId, name, disk, backing, branchedFrom: backing === originDisk ? 'original' : 'base', startedAt: Date.now(), exited: null,
    stderr: '', repoIn: workDir ? 'pending' : 'none', repoError: null, accel: built.accel, ports: { display: built.vncDisplayNum, vncPort: 5900 + built.vncDisplayNum, wsPort: 5700 + built.vncDisplayNum }, proc, built };
  if (proc.stderr && proc.stderr.on) proc.stderr.on('data', d => { if (sess.stderr.length < 20000) sess.stderr += d; });
  if (proc.on) proc.on('exit', (code) => { sess.exited = code; });
  _sessions.set(compartmentId, sess);
  if (workDir) {
    const GA = _ga || require('../compartment/guest-agent.js');
    const dest = `/home/nexus/${slug(name)}`;
    const cmd = share === '9p'
      ? `mkdir -p ${dest} && mount -t 9p -o trans=virtio,version=9p2000.L cos_share ${dest}`
      : `mkdir -p ${dest} && (tar -xf /dev/vdb -C ${dest} --no-same-owner 2>/dev/null || tar -xf /dev/vdb -C ${dest}) && chown -R nexus ${dest} 2>/dev/null; true`;
    Promise.resolve().then(async () => {
      const agent = await GA.connectWhenReady(built.qga, { timeoutMs: 600000 });
      const r = await agent.run('/bin/sh', ['-c', cmd], { timeoutMs: 180000 });
      sess.repoIn = r.exitCode === 0 ? dest : 'failed';
      if (r.exitCode !== 0) sess.repoError = (r.stderr || '').trim().slice(0, 300) || `exit ${r.exitCode}`;
      try { agent.close(); } catch (_) {}
    }).catch((e) => { sess.repoIn = 'failed'; sess.repoError = e.message; });
  }
  return { ok: true, reused: false, ...desktopStatus(compartmentId) };
}

/** desktopStatus(compartmentId) -> { state: 'none'|'booting'|'running'|'stopped', ports, disk, branchedFrom, repoIn, … } */
function desktopStatus(compartmentId) {
  const s = _sessions.get(compartmentId);
  if (!s) return { compartmentId, state: 'none', ports: desktopFor(compartmentId) };
  const state = s.exited !== null ? 'stopped' : (s.repoIn === 'pending' ? 'booting' : 'running');
  return { compartmentId, state, ports: s.ports, disk: s.disk, backing: s.backing, branchedFrom: s.branchedFrom, accel: s.accel, repoIn: s.repoIn,
    repoError: s.repoError, startedAt: s.startedAt, exitCode: s.exited, error: s.exited !== null && s.exited !== 0 ? s.stderr.trim().split('\n').slice(-3).join(' ') : null };
}

/** stopDesktop(compartmentId) — powers the VM off; its disk (the branch's changes) is kept (§0.3). */
function stopDesktop(compartmentId) {
  const s = _sessions.get(compartmentId);
  if (!s || s.exited !== null) return { ok: true, state: 'stopped', kept: s ? s.disk : null };
  try { s.proc.kill('SIGTERM'); } catch (_) {}
  return { ok: true, state: 'stopping', kept: s.disk };
}

module.exports = { MODULE_ID, VERSION, BRANCH_PREFIX, DESKTOP_DIR, slug, gitAvailable, ownRepo, branchWorkspace, listBranches, removeBranch, branchDisk, desktopFor,
  desktopDisk, startDesktop, desktopStatus, stopDesktop, _sessions };
