'use strict';
/**
 * cos/testenv/installer.js — what a run needs, whether this host has it, and installing it on request.
 * comp_id: nexus.cos.testenv.installer
 * Status: pre-release · §0.39.265
 *
 * James: "Can you have the run button menu prompt to install when it's not detected in the path? This is so
 * close to being able to manage nexus from inside, with the compartments."
 *
 * TOOLS lists what COS's run options can need: QEMU (the test VM), Python, Ruby, PHP, Go, Git. For each:
 *   find(tool)    -> { found, bin, version } — the PATH first; on Windows also the machine+user PATH as the
 *                    registry has it NOW (a fresh install is not on a running process's PATH), and the
 *                    usual install folders; `python3` is also found as `python` or `py -3`.
 *   plan(tool)    -> how this host installs it: winget (Windows), brew (macOS), apt/dnf (Linux) — with the
 *                    exact command, and whether it can run unattended (Linux needs `sudo -n`, i.e. no password
 *                    prompt; otherwise the command is handed to the person to run).
 *   install(tool) -> a background job (one per tool at a time), progress lines, and on success the running
 *                    process's PATH is refreshed so the tool is found without restarting Nexus.
 * Nothing installs on its own: only an explicit click in the Run menu (POST /api/cos/install) starts one (§I7).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

const TOOLS = {
  qemu:    { label: 'QEMU', why: 'the test VM (Run all tests in a VM)', winget: 'SoftwareFreedomConservancy.QEMU', brew: 'qemu', apt: ['qemu-system-x86', 'qemu-utils'], dnf: ['qemu-system-x86', 'qemu-img'],
             bins: ['qemu-system-x86_64', 'qemu-img'], winDirs: ['qemu'] },
  python3: { label: 'Python', why: 'Python files and tests', winget: 'Python.Python.3.12', brew: 'python', apt: ['python3', 'python3-venv', 'python3-pip'], dnf: ['python3', 'python3-pip'],
             bins: ['python3'], alt: [['python'], ['py', '-3']], winDirs: [] },
  ruby:    { label: 'Ruby', why: 'Ruby files and tests', winget: 'RubyInstallerTeam.RubyWithDevKit.3.3', brew: 'ruby', apt: ['ruby-full'], dnf: ['ruby'], bins: ['ruby'], winDirs: [] },
  php:     { label: 'PHP', why: 'PHP files and tests', winget: 'PHP.PHP.8.3', brew: 'php', apt: ['php-cli'], dnf: ['php-cli'], bins: ['php'], winDirs: [] },
  go:      { label: 'Go', why: 'Go modules (go test)', winget: 'GoLang.Go', brew: 'go', apt: ['golang-go'], dnf: ['golang'], bins: ['go'], winDirs: ['Go\\bin'] },
  git:     { label: 'Git', why: 'repos that fetch dependencies from git', winget: 'Git.Git', brew: 'git', apt: ['git'], dnf: ['git'], bins: ['git'], winDirs: ['Git\\cmd'] },
};

function _works(bin, args = ['--version']) {
  try { const out = execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 8000, windowsHide: true, encoding: 'utf8' }); return { ok: true, out: String(out || '').trim().split('\n')[0] }; }
  catch (e) { return { ok: false }; }
}

/**
 * refreshPath() — Windows: rebuild process.env.PATH from the registry (machine + user), keeping anything this
 * process added. A winget install updates the registry, not running processes; this makes the new tool visible
 * to Nexus (and every child it starts) without a restart. Elsewhere: no-op.
 */
function refreshPath({ _reg = null } = {}) {
  if (!WIN && !_reg) return { changed: false };
  const read = _reg || ((key) => { try { const out = execFileSync('reg', ['query', key, '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); const m = out.match(/Path\s+REG(?:_EXPAND)?_SZ\s+(.*)/i); return m ? m[1].trim() : ''; } catch (_) { return ''; } });
  const expand = (s) => s.replace(/%([^%]+)%/g, (_m, k) => process.env[k] || _m);
  const fromReg = [read('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'), read('HKCU\\Environment')].filter(Boolean).map(expand).join(';');
  if (!fromReg) return { changed: false };
  const sep = WIN ? ';' : path.delimiter;
  const cur = String(process.env.PATH || process.env.Path || '').split(sep).filter(Boolean);
  const add = fromReg.split(';').filter(Boolean).filter(p => !cur.some(c => c.toLowerCase() === p.toLowerCase()));
  if (!add.length) return { changed: false };
  const next = [...cur, ...add].join(sep);
  process.env.PATH = next; if (WIN) process.env.Path = next;
  return { changed: true, added: add };
}

/** find(tool) -> { tool, found, bin, args, version, where } */
function find(tool, { _probe = _works } = {}) {
  const t = TOOLS[tool];
  if (!t) throw new Error(`unknown tool: ${tool} — one of ${Object.keys(TOOLS).join(', ')}`);
  if (tool === 'qemu') {
    const q = require('./host.js').qemu(_probe === _works ? { refresh: true } : { refresh: true, _probe: (b) => _probe(b).ok });
    return { tool, found: q.found, bin: q.system, args: [], version: null, where: q.dir || (q.found ? 'PATH' : null) };
  }
  const tries = [[t.bins[0]], ...(t.alt || [])];
  for (const [bin, ...pre] of tries) {
    const r = _probe(bin, [...pre, '--version']);
    if (r.ok) return { tool, found: true, bin, args: pre, version: r.out || null, where: 'PATH' };
  }
  if (WIN) {
    for (const base of [process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)) {
      for (const d of t.winDirs) {
        const exe = path.join(base, d, `${t.bins[0]}.exe`);
        if (fs.existsSync(exe) && _probe(exe).ok) return { tool, found: true, bin: exe, args: [], version: _probe(exe).out || null, where: path.dirname(exe) };
      }
    }
  }
  return { tool, found: false, bin: null, args: [], version: null, where: null };
}

/** plan(tool) -> { tool, manager, command, argv, unattended, note } */
function plan(tool, { platform = process.platform, _has = (b) => _works(b, b === 'sudo' ? ['-n', 'true'] : ['--version']).ok } = {}) {
  const t = TOOLS[tool];
  if (!t) throw new Error(`unknown tool: ${tool}`);
  if (platform === 'win32') {
    const argv = ['winget', 'install', '--id', t.winget, '-e', '--accept-package-agreements', '--accept-source-agreements', '--silent'];
    return { tool, manager: 'winget', argv, command: argv.join(' '), unattended: _has('winget'), note: _has('winget') ? null : 'winget is not available on this Windows — install "App Installer" from the Microsoft Store, or install the tool by hand' };
  }
  if (platform === 'darwin') {
    const argv = ['brew', 'install', t.brew];
    return { tool, manager: 'brew', argv, command: argv.join(' '), unattended: _has('brew'), note: _has('brew') ? null : 'Homebrew is not installed — https://brew.sh' };
  }
  const apt = _has('apt-get');
  const pkgs = apt ? t.apt : t.dnf;
  const mgr = apt ? 'apt-get' : 'dnf';
  const sudoOk = _has('sudo');
  const root = typeof process.getuid === 'function' && process.getuid() === 0;
  const argv = [...(root ? [] : ['sudo', '-n']), mgr, 'install', '-y', ...pkgs];
  return { tool, manager: mgr, argv, command: `${root ? '' : 'sudo '}${mgr} install -y ${pkgs.join(' ')}`, unattended: root || sudoOk,
           note: root || sudoOk ? null : 'this needs your password — run the command in a terminal, then press "check again"' };
}

// ── background install jobs (one per tool) ──────────────────────────────────
const _jobs = new Map();

function status(tool = null) {
  const snap = (j) => ({ tool: j.tool, state: j.state, startedAt: j.startedAt, endedAt: j.endedAt, command: j.command, log: j.log.slice(-60), result: j.result });
  if (tool) { const j = _jobs.get(tool); return j ? snap(j) : { tool, state: 'idle' }; }
  return Object.fromEntries([..._jobs.values()].map(j => [j.tool, snap(j)]));
}

/**
 * install(tool) -> status(tool). Starts the plan's command in the background; on exit, refreshes PATH and
 * checks again with find() — success means the tool is FOUND afterwards, not that the installer exited 0.
 */
function install(tool, { _spawn = spawn, _plan = plan, _find = find, _refresh = refreshPath } = {}) {
  if (!TOOLS[tool]) return { tool, state: 'failed', result: { ok: false, error: `unknown tool: ${tool}` } };
  const cur = _jobs.get(tool);
  if (cur && cur.state === 'running') return status(tool);
  const p = _plan(tool);
  const job = { tool, state: 'running', startedAt: Date.now(), endedAt: null, command: p.command, log: [], result: null };
  _jobs.set(tool, job);
  const push = (msg) => { job.log.push({ at: Date.now(), msg }); if (job.log.length > 300) job.log.shift(); };
  const finish = (ok, error) => {
    job.endedAt = Date.now();
    try { _refresh(); } catch (_) {}
    const f = _find(tool);
    job.result = f.found ? { ok: true, found: f } : { ok: false, error: error || `${TOOLS[tool].label} still not found after the install${ok ? ' — it may need a new terminal or a sign-out on this system' : ''}`, command: p.command };
    job.state = job.result.ok ? 'done' : 'failed';
    push(job.result.ok ? `${TOOLS[tool].label} found: ${f.bin}${f.version ? ` (${f.version})` : ''}` : job.result.error);
  };
  if (!p.unattended) { push(p.note); job.state = 'needs_you'; job.endedAt = Date.now(); job.result = { ok: false, needsYou: true, command: p.command, error: p.note }; return status(tool); }
  push(`running: ${p.command}`);
  let child;
  try { child = _spawn(p.argv[0], p.argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
  catch (e) { finish(false, `could not start ${p.argv[0]}: ${e.message}`); return status(tool); }
  const lines = (d) => String(d).split(/\r?\n|\r/).map(s => s.replace(/[▀-▟─-╿]+/g, '').trim()).filter(s => s && s.length > 1).forEach(push);
  if (child.stdout && child.stdout.on) child.stdout.on('data', lines);
  if (child.stderr && child.stderr.on) child.stderr.on('data', lines);
  child.on('error', (e) => { if (job.state === 'running') finish(false, `${p.argv[0]}: ${e.message}`); });
  child.on('exit', (code) => { if (job.state === 'running') finish(code === 0, code === 0 ? null : `${p.manager} exited ${code}`); });
  return status(tool);
}

/**
 * needsFor(files, { vmUnavailableBecauseQemu }) -> [{ tool, label, why, count, plan }]
 * What the Run menu should offer to install for THIS repo: a runtime its files need that this host lacks,
 * and QEMU when the VM option is unavailable only because QEMU is missing.
 */
function needsFor(files = [], { qemuMissing = false, _find = find, _plan = plan } = {}) {
  const byExt = { '.py': 'python3', '.rb': 'ruby', '.php': 'php', '.go': 'go' };
  const counts = {};
  for (const f of files) { const t = byExt[path.extname(f).toLowerCase()]; if (t) counts[t] = (counts[t] || 0) + 1; }
  const out = [];
  if (qemuMissing) out.push({ tool: 'qemu', label: TOOLS.qemu.label, why: TOOLS.qemu.why, count: null });
  for (const [tool, count] of Object.entries(counts)) {
    if (_find(tool).found) continue;
    out.push({ tool, label: TOOLS[tool].label, why: `${count} ${TOOLS[tool].label} file${count === 1 ? '' : 's'} in this repo can't run without it`, count });
  }
  for (const o of out) { try { const p = _plan(o.tool); o.plan = { manager: p.manager, command: p.command, unattended: p.unattended, note: p.note }; } catch (_) {} }
  return out;
}

module.exports = { TOOLS, find, plan, install, status, needsFor, refreshPath };
