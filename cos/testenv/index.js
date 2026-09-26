'use strict';
/**
 * cos/testenv/index.js — test environments for Nexus, Idearium, and any repo.
 * Status: pre-release · §2026-09-21 · §0.39.264
 *
 * James: "expand cos to fully fit idearium's and nexus' needs." (2026-09-21)
 * James: "i need help setting the vm up … needs to be able to create a test env
 *         for any repo." (0.39.264)
 *
 * One result shape, two real backends:
 *
 *   process  playground/sandbox.js SandboxRunner — child process, cwd = the
 *            branch root, clean env, watchdog. Always available. Runs test
 *            FILES (it does not start a shell).
 *   vm       compartment/qemu-runtime.js — an EPHEMERAL qcow2 overlay of a
 *            read-only base image (nothing the guest does persists), a separate
 *            kernel, commands run through qemu-guest-agent. Runs test files AND
 *            the repo's own test commands (npm test, pytest, go test …) from
 *            cos/testenv/detect.js, after installing its dependencies.
 *
 *   auto     vm when it is genuinely available, otherwise process — and the
 *            result always says which ran and why.
 *
 * §0.39.264 — how the repo reaches the guest: a TAR DISK. The branch is packed
 * (cos/testenv/tar.js, pure JS) into a file attached read-only as /dev/vdb and
 * unpacked in the guest. 9p (virtfs) exists only in Linux-host QEMU, so the
 * old share made the VM impossible on Windows; the tar disk works everywhere.
 * `share: '9p'` keeps the old live share, Linux hosts only.
 *
 * §0.39.264 — network: 'none' (default when nothing needs installing) boots
 * with no NIC at all. 'install' boots with NAT, runs the install commands, then
 * pulls the cable over QMP (set_link nic0 off) and checks the guest really is
 * offline BEFORE any test runs. 'nat' leaves it on (asked for explicitly).
 *
 * VM REQUIREMENTS, checked not assumed (capabilities()):
 *   - qemu-system-x86_64 + qemu-img (cos/testenv/host.js finds them, PATH or not)
 *   - a base image: COS_TESTENV_BASE_IMAGE, or the one cos/testenv/provision.js
 *     made (setup-vm.bat on Windows) — a Linux guest with qemu-guest-agent and
 *     the runtimes; its manifest says which runtimes it has.
 * Anything missing -> vm is unavailable with that exact reason and the fix.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const GUEST_MOUNT = '/mnt/cos';
const GUEST_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/root/.cargo/bin';
const GUEST_BIN = { node: 'node', python3: 'python3', python: 'python3', ruby: 'ruby', php: 'php', shell: 'sh', sh: 'sh' };

function _q() { return require('../compartment/qemu-runtime.js'); }
function _ga() { return require('../compartment/guest-agent.js'); }
function _host() { return require('./host.js'); }
function _sandbox() { return require('../playground/sandbox.js').SandboxRunner; }

/**
 * capabilities({ baseImage, env, _probe }) -> { process, vm: { ok, reason, baseImage, qemu, runtimes, setup } }
 * _probe(bin) -> bool replaces the "does this binary run" check (tests).
 */
function capabilities({ baseImage = null, env = process.env, _probe = null } = {}) {
  const H = _host();
  const qm = H.qemu(_probe ? { env, _probe, refresh: true } : { env });
  const b = H.base({ env, baseImage });
  const missing = [];
  if (!qm.found) missing.push(`QEMU not found (qemu-system-x86_64 + qemu-img) — install: ${H.installHint()}`);
  if (!b.image) missing.push(b.reason);
  else if (!fs.existsSync(b.image)) missing.push(`base image not found: ${b.image} — run the setup again`);
  const runtimes = b.manifest && b.manifest.runtimes ? b.manifest.runtimes : null;
  return {
    process: { ok: true },
    vm: { ok: missing.length === 0, reason: missing.join('; ') || 'available', baseImage: b.image, baseSource: b.source || null,
          qemu: qm.found ? { system: qm.system, img: qm.img } : null, runtimes,
          boot: b.manifest && b.manifest.boot ? _bootPaths(b.manifest.boot, H.home(env)) : null,
          setup: process.platform === 'win32' ? 'cos\\testenv\\setup-vm.bat' : 'node cos/testenv/provision.js' },
  };
}

/** a manifest's boot { kernel, initrd, append } with paths made absolute against the testenv home */
function _bootPaths(boot, home) {
  const abs = (p) => (p ? (path.isAbsolute(p) ? p : path.join(home, p)) : null);
  return { kernel: abs(boot.kernel), initrd: abs(boot.initrd), append: boot.append || null };
}

const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** the guest-side command for one test file */
function _fileCommand(t) {
  const bin = GUEST_BIN[t.runtimeId] || t.runtimeId;
  return `exec ${bin} ${sh(t.file)}`;
}

/** which runtimes a set of targets/plan needs that the base image's manifest says it lacks */
function missingRuntimes(runtimes, need) {
  if (!runtimes) return [];   // an image without a manifest: we cannot tell — the run will say
  const have = new Set(Object.keys(runtimes).filter(k => runtimes[k]));
  const alias = { python3: 'python3', python: 'python3', node: 'node', sh: 'sh', shell: 'sh', go: 'go', cargo: 'cargo', ruby: 'ruby', php: 'php', make: 'make' };
  return [...new Set(need.map(n => alias[n] || n))].filter(n => n !== 'sh' && !have.has(n));
}

/**
 * runVm({ compartmentId, root, targets, plan, network, share, timeoutMs, installTimeoutMs, baseImage, onEvent, … })
 * One ephemeral VM for everything; always torn down.
 *   targets  [{ file, runtimeId }]                     — test files, each its own run
 *   plan     { install:[{command,why}], suite:[{command,why,stack}] } — from detect.plan()
 *   network  'auto' (install when plan.install is non-empty, else none) | 'none' | 'install' | 'nat'
 *   share    'disk' (default, any host) | '9p' (Linux host only)
 * -> runs: [{ file, kind:'file'|'suite'|'install', command, exitCode, stdout, stderr, durationMs, … }]
 *    runs.meta = { accel, network, share, offlineVerified, events }
 */
async function runVm({ compartmentId, root, targets = [], plan = null, network = 'auto', share = 'disk', timeoutMs = 30000, installTimeoutMs = 900000,
                       suiteTimeoutMs = null, baseImage, boot = null, bootTimeoutMs = 300000, ramMB = 2048, cpus = 2, onEvent = null,
                       _qemu = null, _spawn = spawn, _ga: _gaMod = null, _qmp = null } = {}) {
  const q = _qemu || _q();
  const GA = _gaMod || _ga();
  const ev = (type, data = {}) => { meta.events.push({ type, at: Date.now(), ...data }); if (onEvent) { try { onEvent({ type, ...data }); } catch (_) {} } };
  const meta = { accel: null, network: null, share, offlineVerified: null, events: [] };
  const installs = (plan && plan.install) || [];
  const suites = (plan && plan.suite) || [];
  const net = network === 'auto' ? (installs.length ? 'install' : 'none') : network;
  if (!['none', 'install', 'nat'].includes(net)) throw new Error(`testenv: network must be none, install or nat (got ${network})`);
  if (share === '9p' && process.platform !== 'linux') throw new Error('testenv: the 9p share needs a Linux host — use share: "disk"');
  meta.network = net;

  const stateDir = path.join(path.dirname(path.resolve(root)), '.cos-testenv');
  fs.mkdirSync(stateDir, { recursive: true });
  const overlay = path.join(stateDir, 'overlay.qcow2');
  const shareDisk = path.join(stateDir, 'share.tar');
  q.ensureEphemeralOverlay(baseImage, overlay);
  if (share === 'disk') {
    const st = require('./tar.js').packDir(root, shareDisk);
    ev('share.packed', { files: st.files, bytes: st.bytes });
  }

  const bootWith = (accelerator) => {
    const vmConfig = { disk: overlay, baseImage, iso: null, ramMB, cpus, cpu: 'max', ephemeral: true, network: net === 'none' ? 'none' : 'nat', headless: true,
                       accelerator, machineType: 'q35', vmStateDir: stateDir, guestAgent: true,
                       shareDir: share === '9p' ? root : null, shareDisk: share === 'disk' ? shareDisk : null,
                       kernel: boot && boot.kernel, initrd: boot && boot.initrd, append: boot && boot.append };
    const built = q.buildQemuArgs(vmConfig, compartmentId, `testenv-${String(compartmentId).slice(0, 8)}`);
    const bin = typeof q.qemuSystemBin === 'function' ? q.qemuSystemBin() : (q.QEMU_BIN || 'qemu-system-x86_64');
    const proc = _spawn(bin, built.args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    const box = { proc, built, stderr: '', exited: null };
    if (proc.stderr && proc.stderr.on) proc.stderr.on('data', d => { if (box.stderr.length < 20000) box.stderr += d; });
    if (proc.on) proc.on('exit', (code) => { box.exited = code; });
    return box;
  };

  let box = bootWith(null);
  meta.accel = box.built.accel;
  ev('vm.boot', { accel: box.built.accel, network: net, share });
  let agent = null, qmp = null;
  const runs = [];
  const guest = (cmd, ms) => agent.run('/bin/sh', ['-c', `export PATH=${GUEST_PATH} HOME=/root CI=1; ${cmd}`], { timeoutMs: ms });
  try {
    // A hardware accelerator that is not really there (WHPX not enabled, no
    // /dev/kvm) makes QEMU exit at once: say so, and boot again under TCG.
    await new Promise(r => setTimeout(r, _spawn === spawn ? 1500 : 0));
    if (box.exited !== null && box.built.accel !== 'tcg') {
      ev('vm.accel.fallback', { from: box.built.accel, why: box.stderr.trim().split('\n').pop() || `qemu exited ${box.exited}` });
      box = bootWith('tcg'); meta.accel = 'tcg';
    }
    try { agent = await GA.connectWhenReady(box.built.qga, { timeoutMs: bootTimeoutMs }); }
    catch (e) { throw new Error(`${e.message}${box.exited !== null ? ` — qemu exited ${box.exited}: ${box.stderr.trim().slice(-400)}` : ''}`); }
    ev('vm.ready');

    // ── the repo into the guest ──
    const unpack = share === '9p'
      ? `mkdir -p ${GUEST_MOUNT} && mount -t 9p -o trans=virtio,version=9p2000.L cos_share ${GUEST_MOUNT}`
      : `mkdir -p ${GUEST_MOUNT} && tar -xf /dev/vdb -C ${GUEST_MOUNT} --no-same-owner 2>/dev/null || tar -xf /dev/vdb -C ${GUEST_MOUNT}`;
    const m = await guest(unpack, 120000);
    if (m.exitCode !== 0) throw new Error(`could not put the repo in the guest: ${m.stderr.trim() || `exit ${m.exitCode}`}`);

    // ── install, online ──
    for (const i of installs) {
      if (net === 'none') { runs.push({ kind: 'install', file: `install: ${i.command}`, command: i.command, exitCode: null, passed: false, skipped: true, stdout: '', stderr: 'skipped — network none (dependencies cannot be fetched)', durationMs: 0 }); continue; }
      ev('install.start', { command: i.command });
      const started = Date.now();
      const r = await guest(`cd ${GUEST_MOUNT} && ${i.command}`, installTimeoutMs);
      runs.push({ kind: 'install', file: `install: ${i.command}`, command: i.command, why: i.why, exitCode: r.exitCode, durationMs: Date.now() - started,
                  killedByTimeout: r.timedOut, stdout: r.stdout.slice(-20000), stderr: r.stderr.slice(-20000), passed: r.exitCode === 0 && !r.timedOut });
    }

    // ── pull the cable, and prove it ──
    if (net === 'install') {
      qmp = _qmp || new q.QMPClient(box.built.qmp);
      await qmp.connect(10000);
      await qmp.command('set_link', { name: 'nic0', up: false });
      const probe = await guest(`node -e "require('dns').lookup('registry.npmjs.org',e=>process.exit(e?0:1))" 2>/dev/null || (getent hosts registry.npmjs.org >/dev/null && exit 1 || exit 0)`, 20000);
      meta.offlineVerified = probe.exitCode === 0;
      ev('network.cut', { offlineVerified: meta.offlineVerified });
      if (!meta.offlineVerified) throw new Error('the guest could still resolve names after the network was cut — refusing to run tests online');
    } else meta.offlineVerified = net === 'none' ? true : false;

    // ── the repo's own test commands ──
    for (const s of suites) {
      ev('suite.start', { command: s.command });
      const started = Date.now();
      const r = await guest(`cd ${GUEST_MOUNT} && ${s.command}`, suiteTimeoutMs || Math.max(timeoutMs * 10, 300000));
      runs.push({ kind: 'suite', file: s.command, command: s.command, why: s.why, stack: s.stack, exitCode: r.exitCode, signal: r.signal, durationMs: Date.now() - started,
                  killedByTimeout: r.timedOut, killedByOutputLimit: !!r.truncated, stdout: r.stdout.slice(-20000), stderr: r.stderr.slice(-20000) });
    }
    // ── individual test files ──
    for (const t of targets) {
      const started = Date.now();
      const r = await guest(`cd ${GUEST_MOUNT} && ${_fileCommand(t)}`, timeoutMs);
      runs.push({ kind: 'file', file: t.file, runtimeId: t.runtimeId, exitCode: r.exitCode, signal: r.signal, durationMs: Date.now() - started,
                  killedByTimeout: r.timedOut, killedByOutputLimit: !!r.truncated, stdout: r.stdout.slice(-20000), stderr: r.stderr.slice(-20000) });
    }
  } finally {
    if (qmp) { try { qmp.disconnect(); } catch (_) {} }
    if (agent) { try { await agent.execute('guest-shutdown', undefined, { timeoutMs: 2000 }); } catch (_) { /* no reply is normal */ } agent.close(); }
    try { box.proc.kill('SIGKILL'); } catch (_) {}
    await new Promise(r => setTimeout(r, _spawn === spawn ? 500 : 0));   // Windows keeps the overlay locked until qemu is gone
    try { q.discardOverlay(overlay); } catch (_) {}
    try { fs.rmSync(shareDisk, { force: true }); } catch (_) {}
    ev('vm.gone');
  }
  for (const r of runs) if (r.passed === undefined) r.passed = r.exitCode === 0 && !r.killedByTimeout && !r.killedByOutputLimit;
  runs.meta = meta;
  return runs;
}

async function runProcess({ compartment, branchId, targets, timeoutMs = 30000 }) {
  const SR = _sandbox();
  const runs = [];
  for (const t of targets) {
    const r = await SR.run(compartment, branchId, { command: t.file, runtimeId: t.runtimeId, timeoutMs, maxOutputBytes: 262144, cleanEnv: true });
    runs.push({ kind: 'file', file: t.file, runtimeId: t.runtimeId, exitCode: r.exitCode, signal: r.signal || null, durationMs: r.durationMs,
                killedByTimeout: !!r.killedByTimeout, killedByOutputLimit: !!r.killedByOutputLimit,
                stdout: String(r.stdout || '').slice(-20000), stderr: String(r.stderr || '').slice(-20000) });
  }
  return runs;
}

/**
 * run({ backend, compartment, branchId, root, targets, plan, network, timeoutMs, baseImage, _caps, _qemu, _spawn })
 * -> { backend, backendReason, runs, vm? }
 */
async function run(opts = {}) {
  const want = opts.backend || 'auto';
  if (!['auto', 'process', 'vm'].includes(want)) throw new Error(`testenv: backend must be auto, process or vm (got ${want})`);
  const caps = opts._caps || capabilities({ baseImage: opts.baseImage });
  let backend = want, backendReason;
  if (want === 'auto') { backend = caps.vm.ok ? 'vm' : 'process'; backendReason = caps.vm.ok ? 'vm available' : `vm unavailable (${caps.vm.reason}) — process sandbox`; }
  else if (want === 'vm' && !caps.vm.ok) throw new Error(`testenv: vm backend unavailable — ${caps.vm.reason}`);
  else backendReason = `${want} requested`;
  let runs, vm = null;
  if (backend === 'vm') {
    runs = await runVm({ compartmentId: opts.compartment.id, root: opts.root, targets: opts.targets, plan: opts.plan || null, network: opts.network || 'auto',
                         share: opts.share || 'disk', timeoutMs: opts.timeoutMs, baseImage: caps.vm.baseImage, boot: caps.vm.boot || null, onEvent: opts.onEvent,
                         _qemu: opts._qemu, _spawn: opts._spawn, _ga: opts._ga, _qmp: opts._qmp, bootTimeoutMs: opts.bootTimeoutMs });
    vm = runs.meta || null;
  } else {
    runs = await runProcess({ compartment: opts.compartment, branchId: opts.branchId, targets: opts.targets, timeoutMs: opts.timeoutMs });
  }
  for (const r of runs) if (r.passed === undefined) r.passed = r.exitCode === 0 && !r.killedByTimeout && !r.killedByOutputLimit;
  return { backend, backendReason, runs: [...runs], vm };
}

module.exports = { capabilities, run, runVm, runProcess, missingRuntimes, GUEST_MOUNT, GUEST_PATH };
