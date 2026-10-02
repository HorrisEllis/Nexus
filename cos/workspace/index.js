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
const { execFileSync, execFile } = require('child_process');

const MODULE_ID = 'nexus.cos.workspace';
const VERSION = '1.1.0';   // 0.39.293 DK1 — refuses an image without the desktop; overlays stamped with their base, stale ones archived
const BRANCH_PREFIX = 'nexus/';

// §0.39.280 BS14 — James's log: "git worktree failed: warning: in the working copy of 'atlas.json', LF will be replaced by
// CRLF …". On Windows every git call printed a CRLF warning per file, and the reason shown was the first 300 characters
// of that — the real failure (often the 60s timeout on a 90 MB tree) was cut off. Now: no line-ending conversion and no
// warning (core.autocrlf / core.safecrlf off, per call — the person's own git config is untouched), 10 minutes for a
// large tree, and gitWhy() reports git's own error lines, never its warnings.
const GIT_TIMEOUT_MS = 600000;
function _git(args, { cwd, git = 'git', env } = {}) {
  return execFileSync(git, ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(env || {}) } }).trim();
}
/** gitWhy(error) — why a git call failed, in git's words: its error lines (warnings dropped), or the timeout/exit. */
function gitWhy(e) {
  if (!e) return 'unknown';
  if (e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM') return `git timed out after ${GIT_TIMEOUT_MS / 1000}s`;
  const lines = String(e.stderr || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^warning:/i.test(l) && !/^hint:/i.test(l));
  const msg = lines.slice(-3).join(' | ') || (e.status != null ? `git exited ${e.status}` : String(e.message || e).split('\n')[0]);
  return msg.slice(0, 400);
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

// §0.39.284 W1 — James's log: idearium OFFLINE for 3.5 minutes (14 missed pulses, its own build trigger refused on :4800)
// while speceng.codegen branched a 91 MB original: the sync git above holds idearium's event loop for the whole run.
// The *Async twins run the same steps with execFile, so the server keeps answering while git works. The sync ones
// stay for their other callers (§0.3); the steps and the results are the same.
function _gitAsync(args, { cwd, git = 'git', env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(git, ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...args], { cwd, encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(env || {}) } }, (e, stdout, stderr) => {
      if (e) { e.stderr = stderr; e.stdout = stdout; if (e.killed && !e.signal) e.signal = 'SIGTERM'; return reject(e); }
      resolve(String(stdout).trim());
    });
  });
}
async function gitAvailableAsync({ git = 'git' } = {}) { try { await _gitAsync(['--version'], { git }); return true; } catch (_) { return false; } }
async function ownRepoAsync(dir, { git = 'git' } = {}) {
  let top = null;
  try { top = _real(await _gitAsync(['rev-parse', '--show-toplevel'], { cwd: dir, git })); } catch (_) {}
  const id = ['-c', 'user.name=NEXUS', '-c', 'user.email=nexus@localhost'];
  let created = false;
  if (top !== _real(dir)) { await _gitAsync(['init', '-q'], { cwd: dir, git }); created = true; }
  let head = null;
  try { head = await _gitAsync(['rev-parse', 'HEAD'], { cwd: dir, git }); } catch (_) {}
  let dirty = false;
  try { dirty = !!(await _gitAsync(['status', '--porcelain'], { cwd: dir, git })); } catch (_) {}
  if (!head || dirty) {
    await _gitAsync(['add', '-A'], { cwd: dir, git });
    await _gitAsync([...id, 'commit', '-q', '--allow-empty', '-m', head ? 'nexus: snapshot before branching' : 'nexus: baseline (COS branch point)'], { cwd: dir, git });
    head = await _gitAsync(['rev-parse', 'HEAD'], { cwd: dir, git });
  }
  return { ok: true, created, head };
}
async function listBranchesAsync(originDir, { git = 'git' } = {}) {
  let out = '';
  try { out = await _gitAsync(['worktree', 'list', '--porcelain'], { cwd: originDir, git }); } catch (_) { return []; }
  return _parseWorktrees(out, originDir);
}
/** branchWorkspaceAsync — branchWorkspace without holding the event loop (same arguments, same result). */
async function branchWorkspaceAsync({ originDir, name, root = null, git = 'git' } = {}) {
  if (!originDir || !fs.existsSync(originDir) || !fs.statSync(originDir).isDirectory()) return { ok: false, error: `the original's directory does not exist: ${originDir}` };
  if (!(await gitAvailableAsync({ git }))) return { ok: false, error: 'git is not installed — the branch needs it (the repo can still be made as a copy)' };
  const s = slug(name);
  const branch = BRANCH_PREFIX + s;
  const dir = path.join(root || `${originDir.replace(/[\\/]+$/, '')}.branches`, s);
  try {
    const own = await ownRepoAsync(originDir, { git });
    const existing = (await listBranchesAsync(originDir, { git })).find(w => w.branch === branch);
    if (existing && fs.existsSync(existing.dir)) return { ok: true, dir: existing.dir, branch, originDir, base: own.head, reused: true };
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    let hasBranch = false;
    try { await _gitAsync(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: originDir, git }); hasBranch = true; } catch (_) {}
    await _gitAsync(hasBranch ? ['worktree', 'add', '-q', dir, branch] : ['worktree', 'add', '-q', '-b', branch, dir, 'HEAD'], { cwd: originDir, git });
    return { ok: true, dir, branch, originDir, base: own.head, reused: false };
  } catch (e) { return { ok: false, error: `git worktree failed: ${gitWhy(e)}` }; }
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
  } catch (e) { return { ok: false, error: `git worktree failed: ${gitWhy(e)}` }; }
}

/** listBranches(originDir) -> [{ dir, branch, head }] — the original's worktrees other than itself */
function listBranches(originDir, { git = 'git' } = {}) {
  let out = '';
  try { out = _git(['worktree', 'list', '--porcelain'], { cwd: originDir, git }); } catch (_) { return []; }
  return _parseWorktrees(out, originDir);
}
function _parseWorktrees(out, originDir) {
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
  } catch (e) { return { ok: false, error: gitWhy(e) }; }
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

// §0.39.293 DK1 — which base image an overlay was made over. Rebuilding the base (provision.js keeps the old one as
// base.prev.qcow2) left every repo's desktop.qcow2 pointing at a DIFFERENT image under the same path: an overlay over
// bytes it was not made from is a corrupt disk. Each overlay now carries a stamp (desktop.json) naming its base.
function _baseIdentity(base, manifest) {
  if (manifest && (manifest.createdAt || manifest.userDataSha256)) return `manifest:${manifest.createdAt || ''}:${manifest.userDataSha256 || ''}`;
  try { const st = fs.statSync(base); return `file:${path.resolve(base)}:${st.size}:${Math.floor(st.mtimeMs)}`; } catch (_) { return null; }
}
function _stampPath(disk) { return path.join(path.dirname(disk), path.basename(disk, '.qcow2') + '.json'); }
function _writeOverlayStamp(disk, stamp) { try { fs.writeFileSync(_stampPath(disk), JSON.stringify(stamp, null, 2)); } catch (_) {} }
/** an overlay is current when its stamp names this base; a disk from before the stamps counts as current only when
 *  it is newer than the base's manifest (it was made over this base) */
function _overlayCurrent(disk, baseId) {
  if (!baseId) return true;   // nothing to compare against: leave it as it is
  try { const st = JSON.parse(fs.readFileSync(_stampPath(disk), 'utf8')); return st.baseId === baseId; } catch (_) {}
  const created = baseId.startsWith('manifest:') ? Date.parse(baseId.slice(9, baseId.lastIndexOf(':'))) : NaN;
  try { return Number.isFinite(created) ? fs.statSync(disk).mtimeMs >= created : true; } catch (_) { return true; }
}
/** §0.3 — a stale overlay is kept beside, renamed with the time, never deleted */
function _archiveOverlay(disk) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const to = path.join(path.dirname(disk), `desktop.stale-${stamp}.qcow2`);
  try { fs.renameSync(disk, to); } catch (e) { return { error: e.message }; }
  try { if (fs.existsSync(_stampPath(disk))) fs.renameSync(_stampPath(disk), to.replace(/\.qcow2$/, '.json')); } catch (_) {}
  return { to };
}

/**
 * startDesktop({ compartmentId, name, workDir, stateRoot, originStateRoot, baseImage, ramMB, cpus, network })
 *   -> { ok, state: 'booting'|'running', compartmentId, disk, backing, ports, reused } | { ok:false, error }
 * Returns once QEMU is spawned; the repo is copied in the background (desktopStatus says when it is there).
 */
const EARLY_EXIT_MS = 15000;

function startDesktop({ compartmentId, name = 'repo', workDir, stateRoot, originStateRoot = null, baseImage = null, ramMB = 4096, cpus = 2,
                        network = 'nat', login = null, _qemu = null, _spawn = null, _ga = null, _host = null, _runImg = null } = {}) {
  if (!compartmentId) return { ok: false, error: 'compartmentId required' };
  const live = _sessions.get(compartmentId);
  if (live && live.exited === null) return { ok: true, reused: true, ...desktopStatus(compartmentId) };
  const q = _qemu || require('../compartment/qemu-runtime.js');
  const spawn = _spawn || require('child_process').spawn;
  const root = stateRoot || workDir;
  if (!root) return { ok: false, error: 'stateRoot (or workDir) required' };
  let base = baseImage, manifest = null;
  if (!base) { try { const b = (_host || require('../testenv/host.js')).base(); base = b.image; manifest = b.manifest || null; } catch (_) {} }
  // §0.39.293 DK1 — James: "i cant login to my desktop envirement in idearium with the default credientials". An
  // image built without the desktop has no xfce and no desktop account: the VM booted to a text console where the
  // login the viewer showed could not work. Said here, with the fix, instead of booting a VM nobody can use.
  if (manifest && Array.isArray(manifest.extras) && !manifest.extras.includes('desktop')) {
    return { ok: false, code: 'NO_DESKTOP_IN_IMAGE', error: `the VM image was built without the desktop (it has: ${manifest.extras.join(', ') || 'no extras'}) — `
      + `there is no desktop or desktop account in it. Rebuild it with the desktop: the run menu → set up the test VM (desktop is ticked), or: node cos/testenv/provision.js --with desktop` };
  }
  const baseId = _baseIdentity(base, manifest);
  const originDisk = originStateRoot ? desktopDisk(originStateRoot) : null;
  // an overlay only means anything over the exact image it was made from: an origin disk made over an older base is
  // not branched from (the base is used instead), and this repo's own stale disk is archived and made again (§0.3)
  const originOk = originDisk && fs.existsSync(originDisk) && _overlayCurrent(originDisk, baseId);
  const backing = originOk ? originDisk : base;
  if (!backing) return { ok: false, error: 'no base image — make one with: node cos/testenv/provision.js --with desktop' };
  const disk = desktopDisk(root);
  const archived = fs.existsSync(disk) && !_overlayCurrent(disk, baseId) ? _archiveOverlay(disk) : null;
  const bd = branchDisk({ backing, dest: disk, runImg: _runImg });
  if (!bd.ok) return bd;
  if (!bd.reused) _writeOverlayStamp(disk, { baseId, backing: path.resolve(backing), madeAt: new Date().toISOString() });
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
  const bin = typeof q.qemuSystemBin === 'function' ? q.qemuSystemBin() : 'qemu-system-x86_64';
  // §0.39.280 — James's screenshot: "unreachable — Could not reach the VM's screen on port 5724 … accel whpx". A VM
  // that dies at once never serves its screen. The one launch below is watched: an exit within EARLY_EXIT_MS on a
  // hardware accelerator (whpx / hvf / kvm — whpx refuses some CPU models and machines) is retried ONCE in software
  // (tcg, cpu qemu64+) and said (accelFallback, with the first attempt's stderr); anything else is reported as it is.
  const launch = (accelerator, cpu) => {
    const built = q.buildQemuArgs({ ...vmConfig, accelerator, cpu }, compartmentId, `desktop-${String(compartmentId).slice(0, 8)}`);
    const proc = spawn(bin, built.args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    return { built, proc };
  };
  let first;
  try { first = launch(null, vmConfig.cpu); }
  catch (e) { return { ok: false, error: `${/buildQemuArgs|vmConfig/.test(e.message) ? 'could not build the VM' : 'qemu did not start'}: ${e.message}` }; }
  const { built } = first;
  const sess = { compartmentId, name, disk, backing, branchedFrom: backing === originDisk ? 'original' : 'base', startedAt: Date.now(), exited: null,
    stderr: '', repoIn: workDir ? 'pending' : 'none', repoError: null, login: login && /^[a-z_][a-z0-9_-]{0,31}$/.test(String(login.user || '')) ? { user: String(login.user), password: String(login.password || ''), applied: 'pending' }
      : (login && login.user ? { user: null, password: null, applied: `refused: '${String(login.user).slice(0, 40)}' is not a valid login name` } : null), accel: built.accel, accelFallback: null,
    ports: { display: built.vncDisplayNum, vncPort: 5900 + built.vncDisplayNum, wsPort: 5700 + built.vncDisplayNum }, proc: first.proc, built };
  const watch = (proc, canRetry) => {
    if (proc.stderr && proc.stderr.on) proc.stderr.on('data', d => { if (sess.stderr.length < 20000) sess.stderr += d; });
    if (!proc.on) return;
    proc.on('exit', (code) => {
      if (sess.proc !== proc) return;
      const early = Date.now() - sess.startedAt < EARLY_EXIT_MS;
      if (canRetry && early && !sess.stopping && sess.accel !== 'tcg') {
        const why = sess.stderr.trim().split('\n').slice(-3).join(' ') || `exit ${code}`;
        try {
          const again = launch('tcg', 'qemu64,+ssse3,+sse4.1,+sse4.2,+popcnt');
          sess.accelFallback = { from: sess.accel, to: 'tcg', reason: why.slice(0, 400) };
          sess.accel = 'tcg'; sess.stderr = ''; sess.startedAt = Date.now(); sess.proc = again.proc; sess.built = again.built;
          watch(again.proc, false);
          return;
        } catch (_) { /* fall through: report the first exit */ }
      }
      sess.exited = code === null ? -1 : code;
    });
  };
  watch(first.proc, true);
  _sessions.set(compartmentId, sess);
  // §0.39.282 N20 — the desktop account gets its known password through the guest agent on every boot, so an image
  // made before provision set one (useradd left it passwordless) still has the login the viewer shows.
  if (sess.login && sess.login.user) {
    const GA = _ga || require('../compartment/guest-agent.js');
    Promise.resolve().then(async () => {
      const agent = await GA.connectWhenReady(sess.built.qga, { timeoutMs: 600000 });
      try { await agent.setUserPassword(sess.login.user, sess.login.password); sess.login.applied = 'set'; }
      catch (e) { sess.login.applied = `failed: ${String(e.message || e).slice(0, 160)}`; }
      try { agent.close(); } catch (_) {}
    }).catch((e) => { sess.login.applied = `failed: ${String(e.message || e).slice(0, 160)}`; });
  }
  if (workDir) {
    const GA = _ga || require('../compartment/guest-agent.js');
    const home = sess.login && sess.login.user ? `/home/${sess.login.user}` : '/home/nexus';
    const dest = `${home}/${slug(name)}`;
    const cmd = share === '9p'
      ? `mkdir -p ${dest} && mount -t 9p -o trans=virtio,version=9p2000.L cos_share ${dest}`
      : `mkdir -p ${dest} && (tar -xf /dev/vdb -C ${dest} --no-same-owner 2>/dev/null || tar -xf /dev/vdb -C ${dest}) && chown -R ${sess.login && sess.login.user ? sess.login.user : 'nexus'} ${dest} 2>/dev/null; true`;
    Promise.resolve().then(async () => {
      const agent = await GA.connectWhenReady(sess.built.qga, { timeoutMs: 600000 });
      const r = await agent.run('/bin/sh', ['-c', cmd], { timeoutMs: 180000 });
      sess.repoIn = r.exitCode === 0 ? dest : 'failed';
      if (r.exitCode !== 0) sess.repoError = (r.stderr || '').trim().slice(0, 300) || `exit ${r.exitCode}`;
      try { agent.close(); } catch (_) {}
    }).catch((e) => { sess.repoIn = 'failed'; sess.repoError = e.message; });
  }
  return { ok: true, reused: false, ...desktopStatus(compartmentId), ...(archived ? { staleDiskArchived: archived.to || null, staleDiskError: archived.error || null } : {}) };
}

/** desktopStatus(compartmentId) -> { state: 'none'|'booting'|'running'|'stopped', ports, disk, branchedFrom, repoIn, … } */
function desktopStatus(compartmentId) {
  const s = _sessions.get(compartmentId);
  if (!s) return { compartmentId, state: 'none', ports: desktopFor(compartmentId) };
  const state = s.exited !== null ? 'stopped' : (s.repoIn === 'pending' ? 'booting' : 'running');
  return { compartmentId, state, ports: s.ports, disk: s.disk, backing: s.backing, branchedFrom: s.branchedFrom, accel: s.accel, accelFallback: s.accelFallback || null, repoIn: s.repoIn,
    repoError: s.repoError, login: s.login || null, startedAt: s.startedAt, exitCode: s.exited, error: s.exited !== null && s.exited !== 0 ? s.stderr.trim().split('\n').slice(-3).join(' ') : null };
}

/** stopDesktop(compartmentId) — powers the VM off; its disk (the branch's changes) is kept (§0.3). */
function stopDesktop(compartmentId) {
  const s = _sessions.get(compartmentId);
  if (!s || s.exited !== null) return { ok: true, state: 'stopped', kept: s ? s.disk : null };
  s.stopping = true;
  try { s.proc.kill('SIGTERM'); } catch (_) {}
  return { ok: true, state: 'stopping', kept: s.disk };
}

module.exports = { gitWhy, branchWorkspaceAsync, ownRepoAsync, listBranchesAsync, gitAvailableAsync, MODULE_ID, VERSION, BRANCH_PREFIX, DESKTOP_DIR, slug, gitAvailable, ownRepo, branchWorkspace, listBranches, removeBranch, branchDisk, desktopFor,
  desktopDisk, startDesktop, desktopStatus, stopDesktop, _sessions };
