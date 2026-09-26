'use strict';
/**
 * cos/testenv/index.js — test environments for Nexus and Idearium.
 * Status: pre-release · §2026-09-21
 *
 * James: "expand cos to fully fit idearium's and nexus' needs." What they
 * need from COS is one thing: run a set of files from a directory in an
 * isolated place and get each one's exit code and output back. Two real
 * backends, one result shape:
 *
 *   process  playground/sandbox.js SandboxRunner — child process, cwd = the
 *            branch root, clean env, watchdog. Always available.
 *   vm       compartment/qemu-runtime.js — an EPHEMERAL qcow2 overlay of a
 *            read-only base image (nothing the guest does persists), network
 *            'none', the branch shared in over 9p, and each target run inside
 *            the guest through qemu-guest-agent (compartment/guest-agent.js).
 *            A hardware-virtualised boundary: separate kernel, separate user.
 *
 *   auto     vm when it is genuinely available, otherwise process — and the
 *            result always says which ran and why.
 *
 * VM REQUIREMENTS, checked not assumed (capabilities()):
 *   - qemu-system-x86_64 and qemu-img on PATH
 *   - a base image: opts.baseImage or COS_TESTENV_BASE_IMAGE — a LINUX guest
 *     with qemu-guest-agent enabled, 9p support (virtio 9p is in stock
 *     kernels), and the runtimes the tests need (node, python3) installed
 *   - a Linux host for the 9p share (virtfs is Linux-host-only in QEMU)
 * Anything missing -> vm is unavailable with that exact reason.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const GUEST_MOUNT = '/mnt/cos';
const GUEST_BIN = { node: 'node', python3: 'python3', python: 'python3', ruby: 'ruby', php: 'php', shell: 'sh' };

function _q() { return require('../compartment/qemu-runtime.js'); }
function _ga() { return require('../compartment/guest-agent.js'); }
function _sandbox() { return require('../playground/sandbox.js').SandboxRunner; }

function _has(bin) { try { execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 5000 }); return true; } catch (_) { return false; } }

function capabilities({ baseImage = null, env = process.env, _probe = _has } = {}) {
  const q = _q();
  const img = baseImage || env.COS_TESTENV_BASE_IMAGE || null;
  const missing = [];
  if (!_probe(q.QEMU_BIN || 'qemu-system-x86_64')) missing.push('qemu-system-x86_64 not on PATH');
  if (!_probe(q.QEMU_IMG_BIN || 'qemu-img')) missing.push('qemu-img not on PATH');
  if (!img) missing.push('no base image (COS_TESTENV_BASE_IMAGE)');
  else if (!fs.existsSync(img)) missing.push(`base image not found: ${img}`);
  if (process.platform !== 'linux') missing.push('9p share needs a Linux host');
  return { process: { ok: true }, vm: { ok: missing.length === 0, reason: missing.join('; ') || 'available', baseImage: img } };
}

const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** runVm — one ephemeral VM for all targets; always torn down. */
async function runVm({ compartmentId, root, targets, timeoutMs = 30000, baseImage, bootTimeoutMs = 180000, _qemu = null, _spawn = spawn } = {}) {
  const q = _qemu || _q();
  const stateDir = path.join(path.dirname(root), '.cos-testenv');
  fs.mkdirSync(stateDir, { recursive: true });
  const overlay = path.join(stateDir, 'overlay.qcow2');
  q.ensureEphemeralOverlay(baseImage, overlay);
  const vmConfig = { disk: overlay, baseImage, iso: null, ramMB: 2048, cpus: 2, ephemeral: true, network: 'none', headless: true,
                     accelerator: null, machineType: 'q35', vmStateDir: stateDir, guestAgent: true, shareDir: root };
  const built = q.buildQemuArgs(vmConfig, compartmentId, `testenv-${compartmentId.slice(0, 8)}`);
  const proc = _spawn(q.QEMU_BIN || 'qemu-system-x86_64', built.args, { stdio: 'ignore' });
  let agent = null;
  const runs = [];
  try {
    agent = await _ga().connectWhenReady(built.qga, { timeoutMs: bootTimeoutMs });
    const m = await agent.run('/bin/sh', ['-c', `mkdir -p ${GUEST_MOUNT} && mount -t 9p -o trans=virtio,version=9p2000.L cos_share ${GUEST_MOUNT}`], { timeoutMs: 20000 });
    if (m.exitCode !== 0) throw new Error(`could not mount the shared branch in the guest: ${m.stderr.trim() || `exit ${m.exitCode}`}`);
    for (const t of targets) {
      const bin = GUEST_BIN[t.runtimeId] || t.runtimeId;
      const started = Date.now();
      const r = await agent.run('/bin/sh', ['-c', `cd ${GUEST_MOUNT} && exec ${bin} ${sh(t.file)}`], { timeoutMs });
      runs.push({ file: t.file, runtimeId: t.runtimeId, exitCode: r.exitCode, signal: r.signal, durationMs: Date.now() - started,
                  killedByTimeout: r.timedOut, killedByOutputLimit: !!r.truncated, stdout: r.stdout.slice(-20000), stderr: r.stderr.slice(-20000) });
    }
  } finally {
    if (agent) { try { await agent.execute('guest-shutdown', undefined, { timeoutMs: 2000 }); } catch (_) { /* no reply is normal */ } agent.close(); }
    try { proc.kill('SIGKILL'); } catch (_) {}
    try { q.discardOverlay(overlay); } catch (_) {}
  }
  return runs;
}

async function runProcess({ compartment, branchId, targets, timeoutMs = 30000 }) {
  const SR = _sandbox();
  const runs = [];
  for (const t of targets) {
    const r = await SR.run(compartment, branchId, { command: t.file, runtimeId: t.runtimeId, timeoutMs, maxOutputBytes: 262144, cleanEnv: true });
    runs.push({ file: t.file, runtimeId: t.runtimeId, exitCode: r.exitCode, signal: r.signal || null, durationMs: r.durationMs,
                killedByTimeout: !!r.killedByTimeout, killedByOutputLimit: !!r.killedByOutputLimit,
                stdout: String(r.stdout || '').slice(-20000), stderr: String(r.stderr || '').slice(-20000) });
  }
  return runs;
}

/**
 * run({ backend, compartment, branchId, root, targets, timeoutMs, baseImage, _caps, _qemu, _spawn })
 * -> { backend, backendReason, runs }
 */
async function run(opts = {}) {
  const want = opts.backend || 'auto';
  if (!['auto', 'process', 'vm'].includes(want)) throw new Error(`testenv: backend must be auto, process or vm (got ${want})`);
  const caps = opts._caps || capabilities({ baseImage: opts.baseImage });
  let backend = want, backendReason;
  if (want === 'auto') { backend = caps.vm.ok ? 'vm' : 'process'; backendReason = caps.vm.ok ? 'vm available' : `vm unavailable (${caps.vm.reason}) — process sandbox`; }
  else if (want === 'vm' && !caps.vm.ok) throw new Error(`testenv: vm backend unavailable — ${caps.vm.reason}`);
  else backendReason = `${want} requested`;
  const runs = backend === 'vm'
    ? await runVm({ compartmentId: opts.compartment.id, root: opts.root, targets: opts.targets, timeoutMs: opts.timeoutMs, baseImage: caps.vm.baseImage, _qemu: opts._qemu, _spawn: opts._spawn, bootTimeoutMs: opts.bootTimeoutMs })
    : await runProcess({ compartment: opts.compartment, branchId: opts.branchId, targets: opts.targets, timeoutMs: opts.timeoutMs });
  for (const r of runs) r.passed = r.exitCode === 0 && !r.killedByTimeout && !r.killedByOutputLimit;
  return { backend, backendReason, runs };
}

module.exports = { capabilities, run, runVm, runProcess, GUEST_MOUNT };
