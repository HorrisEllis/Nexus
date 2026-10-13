/**
 * compartment/qemu-runtime.js
 * COMPARTMENT OS — QEMU/KVM Virtual Machine Runtime Driver
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Backs runtimeId 'qemu-windows' (foundation/runtime-enum.js). Gives COS a
 * compartment whose isolation boundary is a real hardware-virtualized guest
 * kernel instead of a host OS process — the only way to run an actual
 * Windows environment, isolated, from any host OS (Linux/macOS/Windows).
 *
 * Two isolation postures, selected by vmConfig.ephemeral:
 *
 *   ephemeral: true   ("windows-sandbox" archetype — Sandboxie-style)
 *     Every start boots from a throwaway qcow2 overlay backed by a
 *     read-only golden base image. The base is never opened for writes.
 *     On stop, the overlay is deleted — nothing the guest did persists.
 *     `cos vm reset` (cli/commands/vm.js) does this on demand, mid-session.
 *
 *   ephemeral: false  ("windows-vm" archetype — persistent daily-driver VM)
 *     Boots the disk directly. Changes persist across restarts. Point-in-time
 *     recovery is still available via qemu-img internal snapshots
 *     (qemuImgSnapshotSave/Apply/List below), independent of COS's own
 *     file-diff SnapshotEngine (foundation/snapshot.js), which snapshots
 *     compartment *config*, not a VM's disk state — the two are
 *     complementary, not overlapping.
 *
 * Network posture defaults to fully isolated (vmConfig.network = 'none'),
 * matching COS-wide isolation-by-default (see archetype 'containment').
 * 'nat' opens QEMU user-mode networking (outbound only, no host allowlist
 * enforcement inside QEMU itself — for a real per-host allowlist, front
 * the VM with a 'reverse-proxy' compartment, the same pattern the
 * 'reverse-proxy' archetype already implies via networkPreset.proxyPort).
 *
 * COS-1: Nothing silently fails — every failure is an event or a thrown,
 *        readable error naming exactly what QEMU/qemu-img/QMP said.
 * COS-4: Compartments never share memory — a VM enforces that at the
 *        hardware-virtualization boundary, strictly stronger than the
 *        process boundary every other runtime here relies on.
 */

'use strict';

const { spawn, execFileSync } = require('child_process');
const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ─── Binaries ──────────────────────────────────────────────────────────────────

const QEMU_BIN     = process.platform === 'win32' ? 'qemu-system-x86_64.exe' : 'qemu-system-x86_64';
const QEMU_IMG_BIN = process.platform === 'win32' ? 'qemu-img.exe'           : 'qemu-img';

// §0.39.264 — the binaries as found on this host (cos/testenv/host.js: COS_QEMU_DIR,
// PATH, then the default install folders — a fresh `winget install QEMU` is not on
// the PATH of an already-running Nexus). Falls back to the bare names above.
function qemuSystemBin() { try { const h = require('../testenv/host.js').qemu(); if (h.found) return h.system; } catch (_) {} return QEMU_BIN; }
function qemuImgBin()    { try { const h = require('../testenv/host.js').qemu(); if (h.found) return h.img; } catch (_) {} return QEMU_IMG_BIN; }

// ─── Errors ────────────────────────────────────────────────────────────────────

class QemuRuntimeError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.name   = 'QemuRuntimeError';
    this.detail = detail;
  }
}

// ─── Accelerator detection ─────────────────────────────────────────────────────

/**
 * Pick the best available hardware-acceleration backend for this host.
 * Never throws — falls back to 'tcg' (software emulation) which always
 * works everywhere, just slower. This is the thing that makes "any OS"
 * true: KVM on Linux, HVF on macOS, WHPX on Windows, TCG as universal
 * fallback (e.g. inside a CI container or nested-virt-less VM, like the
 * one this file was developed and tested in).
 *
 * @param {string} [override] — explicit accel from vmConfig/env, wins if valid
 * @returns {{ accel: string, reason: string }}
 */
function pickAccelerator(override = null) {
  const KNOWN = new Set(['kvm', 'hvf', 'whpx', 'tcg']);
  if (override && KNOWN.has(override)) {
    return { accel: override, reason: 'explicit override' };
  }

  if (process.platform === 'linux') {
    try {
      fs.accessSync('/dev/kvm', fs.constants.R_OK | fs.constants.W_OK);
      return { accel: 'kvm', reason: '/dev/kvm accessible' };
    } catch (_) {
      return { accel: 'tcg', reason: '/dev/kvm not accessible — no hardware virt (nested-virt host, missing kvm module, or permissions)' };
    }
  }

  if (process.platform === 'darwin') {
    // HVF is built into every QEMU on macOS >= 10.10; no reliable pre-check
    // short of trying it, and QEMU itself reports a clear error if unavailable.
    return { accel: 'hvf', reason: 'macOS host — HVF assumed available' };
  }

  if (process.platform === 'win32') {
    // Whether WHPX is actually enabled (Windows Hypervisor Platform optional
    // feature) can't be cheaply checked from here; QEMU fails fast and
    // legibly if it isn't. COS-1: we don't hide that failure, we let it
    // surface as comp:spawn:failed with QEMU's own stderr.
    return { accel: 'whpx', reason: 'Windows host — WHPX assumed available' };
  }

  return { accel: 'tcg', reason: `unrecognized platform "${process.platform}" — software emulation` };
}

// ─── VM config resolution ──────────────────────────────────────────────────────

/**
 * A VM's config can arrive two ways:
 *   1. entryFile is a `vm.json` — fully declarative, every field explicit.
 *   2. entryFile is a `.qcow2` disk path directly — everything else comes
 *      from env vars (COS_VM_*), with sane defaults. This is the path a
 *      compartment created from the 'windows-sandbox'/'windows-vm'
 *      archetypes takes, since archetypes pass config through `env`
 *      (host/index.js already forwards `comp.envVars` as `env` — no schema
 *      change needed to foundation/types.js, which is frozen post-v1.0.0).
 *
 * @param {string} entryFile
 * @param {object} env
 * @param {string} compartmentRoot
 * @returns {object} vmConfig
 */
function resolveVmConfig(entryFile, env = {}, compartmentRoot = process.cwd()) {
  let fileConfig = {};

  if (entryFile && entryFile.endsWith('.json')) {
    let raw;
    try {
      raw = fs.readFileSync(entryFile, 'utf8');
    } catch (e) {
      throw new QemuRuntimeError(`vm config file not readable: ${entryFile}`, e.message);
    }
    try {
      fileConfig = JSON.parse(raw);
    } catch (e) {
      throw new QemuRuntimeError(`vm config file is not valid JSON: ${entryFile}`, e.message);
    }
  }

  const truthy = (v) => v === true || v === 'true' || v === '1';

  // Relative paths in vm.json (the common case — "disk": "overlay.qcow2")
  // must resolve against the compartment's own root, not process.cwd() —
  // confirmed the hard way: with process.cwd() this silently pointed at
  // wherever `cos` happened to be invoked from instead of the compartment,
  // so a fresh overlay/base lookup missed entirely on a real cos start.
  const resolveAgainst = (p) => (p ? path.resolve(compartmentRoot, p) : null);

  const disk = fileConfig.disk
    || (entryFile && entryFile.endsWith('.qcow2') ? entryFile : null)
    || env.COS_VM_DISK
    || null;

  if (!disk) {
    throw new QemuRuntimeError(
      'no disk specified — provide a .qcow2 entryFile, a vm.json with "disk", or COS_VM_DISK'
    );
  }

  return {
    disk:          resolveAgainst(disk),
    baseImage:     resolveAgainst(fileConfig.baseImage    || env.COS_VM_BASE_IMAGE    || null),
    iso:           resolveAgainst(fileConfig.iso          || env.COS_VM_ISO           || null),
    ramMB:         parseInt(fileConfig.ramMB || env.COS_VM_RAM_MB || '4096', 10),
    cpus:          parseInt(fileConfig.cpus || env.COS_VM_CPUS   || '2', 10),
    ephemeral:     fileConfig.ephemeral !== undefined ? !!fileConfig.ephemeral : truthy(env.COS_VM_EPHEMERAL),
    network:       fileConfig.network      || env.COS_VM_NETWORK      || 'none',   // 'none' | 'nat'
    headless:      fileConfig.headless !== undefined ? !!fileConfig.headless : !truthy(env.COS_VM_DISPLAY),
    accelerator:   fileConfig.accelerator  || env.COS_VM_ACCEL        || null,
    machineType:   fileConfig.machineType  || env.COS_VM_MACHINE      || 'q35',
    vmStateDir:    path.join(compartmentRoot, '.cos-vm'),
    // §2026-09-21 test environments (cos/testenv): both opt-in, default off,
    // so every existing VM compartment boots exactly as before.
    //   guestAgent — virtio-serial channel for qemu-guest-agent: the only way
    //                to run a command in the guest and get exit code + output.
    //   shareDir   — host dir exposed to the guest (9p virtfs on a Linux host,
    //                mount_tag cos_share), so code under test reaches the guest
    //                without being baked into the image.
    guestAgent:    fileConfig.guestAgent !== undefined ? !!fileConfig.guestAgent : truthy(env.COS_VM_GUEST_AGENT),
    shareDir:      resolveAgainst(fileConfig.shareDir || env.COS_VM_SHARE_DIR || null),
  };
}

// ─── Disk management (qemu-img) ────────────────────────────────────────────────

function _runQemuImg(args) {
  try {
    return execFileSync(qemuImgBin(), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    const stderr = (e.stderr || e.message || '').toString().trim();
    throw new QemuRuntimeError(`qemu-img ${args[0]} failed: ${stderr}`, { args, stderr });
  }
}

/**
 * Create a new blank qcow2 disk (e.g. for `cos vm base-image create`).
 * @param {string} diskPath
 * @param {string} size — qemu-img size string, e.g. '64G'
 */
function createBlankDisk(diskPath, size = '64G') {
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });
  _runQemuImg(['create', '-f', 'qcow2', diskPath, size]);
  return { diskPath, size };
}

/**
 * Create (or recreate) a copy-on-write overlay backed by a golden base
 * image. This is the literal Sandboxie mechanic: the guest writes land in
 * the overlay only, the base image is never touched, and discarding the
 * overlay == a full revert.
 *
 * @param {string} baseImage — path to the read-only golden qcow2
 * @param {string} overlayPath — path to (re)create
 */
function ensureEphemeralOverlay(baseImage, overlayPath) {
  if (!baseImage) {
    throw new QemuRuntimeError('ephemeral:true requires baseImage (COS_VM_BASE_IMAGE or vm.json "baseImage")');
  }
  if (!fs.existsSync(baseImage)) {
    throw new QemuRuntimeError(`base image not found: ${baseImage}`);
  }

  fs.mkdirSync(path.dirname(overlayPath), { recursive: true });

  // Discard any overlay left from a previous run — ephemeral means every
  // start is clean, not just every explicit `cos vm reset`.
  if (fs.existsSync(overlayPath)) {
    fs.unlinkSync(overlayPath);
  }

  _runQemuImg(['create', '-f', 'qcow2', '-F', 'qcow2', '-b', path.resolve(baseImage), overlayPath]);
  return { baseImage, overlayPath };
}

/** Discard an ephemeral overlay outright (mid-session `cos vm reset`). */
function discardOverlay(overlayPath) {
  if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);
  return { discarded: overlayPath };
}

/** Internal qcow2 point-in-time snapshot — works whether or not the VM is running via QMP, or offline directly on the file. */
function qemuImgSnapshotSave(diskPath, tag) {
  _runQemuImg(['snapshot', '-c', tag, diskPath]);
  return { diskPath, tag, action: 'saved' };
}

function qemuImgSnapshotApply(diskPath, tag) {
  _runQemuImg(['snapshot', '-a', tag, diskPath]);
  return { diskPath, tag, action: 'applied' };
}

function qemuImgSnapshotDelete(diskPath, tag) {
  _runQemuImg(['snapshot', '-d', tag, diskPath]);
  return { diskPath, tag, action: 'deleted' };
}

function qemuImgSnapshotList(diskPath) {
  // `qemu-img snapshot -l` prints a human table whose "VM SIZE" and "DATE"
  // columns each contain internal spaces ("0 B", "2026-09-06 20:02:56"),
  // which breaks whitespace-run splitting — confirmed empirically against
  // qemu-img 8.2. `info --output=json` exposes the same data structured
  // (verified present since at least qemu-img 2.x), so use that instead of
  // parsing a display table not meant to be machine-read.
  const out  = _runQemuImg(['info', '--output=json', diskPath]);
  const info = JSON.parse(out);
  return (info.snapshots || []).map(s => ({
    id:      s.id,
    tag:     s.name,
    vmSize:  s['vm-state-size'],
    date:    new Date(s['date-sec'] * 1000).toISOString(),
    vmClock: s['vm-clock-sec'],
  }));
}

// ─── Port allocation ────────────────────────────────────────────────────────────

/**
 * Deterministic-but-spread TCP port derived from compartmentId, used for
 * VNC display and (on win32, where AF_UNIX QMP sockets aren't used) QMP.
 * Not collision-proof under concurrent allocation — acceptable for a
 * single-user personal-OS host; if QEMU can't bind it, the failure surfaces
 * honestly via comp:spawn:failed (COS-1), same as any other spawn error.
 */
function derivePort(compartmentId, base, span) {
  const hash = crypto.createHash('sha256').update(compartmentId).digest();
  return base + (hash.readUInt16BE(0) % span);
}

/** desktopPorts(compartmentId) -> { display, vncPort, wsPort } — where a headless VM's screen is (§0.39.279). */
function desktopPorts(compartmentId) {
  const display = derivePort(String(compartmentId), 0, 100);
  return { display, vncPort: 5900 + display, wsPort: 5700 + display };
}

// ─── Argv construction ──────────────────────────────────────────────────────────

/**
 * Build the full qemu-system-x86_64 argv for a compartment.
 *
 * @param {object} vmConfig — from resolveVmConfig()
 * @param {string} compartmentId
 * @param {string} name — human name, used for -name
 * @returns {{ args: string[], qmp: { transport: 'unix'|'tcp', path?: string, host?: string, port?: number }, vncDisplayNum: number|null }}
 */
function buildQemuArgs(vmConfig, compartmentId, name) {
  const { accel, reason } = pickAccelerator(vmConfig.accelerator);
  const args = [];

  args.push('-name', `cos-${name}`);
  args.push('-machine', `${vmConfig.machineType},accel=${accel}`);
  args.push('-m', String(vmConfig.ramMB));
  args.push('-smp', String(vmConfig.cpus));
  // §0.39.264 — optional CPU model. Test VMs use 'max': every feature the
  // accelerator can offer (TCG's default qemu64 lacks SSE4.2/POPCNT, which
  // current Node builds expect). Unset → QEMU's default, as before.
  if (vmConfig.cpu) args.push('-cpu', String(vmConfig.cpu));
  args.push('-rtc', 'base=localtime');
  args.push('-no-user-config');

  // Disk — virtio for performance; QEMU's virtio-win drivers must be present
  // in the guest for Windows to boot from this directly, hence -cdrom for
  // an install/driver ISO being common on first boot.
  args.push('-drive', `file=${vmConfig.disk},if=virtio,cache=writeback,discard=unmap`);

  if (vmConfig.iso) {
    args.push('-drive', `file=${vmConfig.iso},media=cdrom`);
  }

  // Network
  if (vmConfig.network === 'nat') {
    args.push('-netdev', 'user,id=net0');
    // id=nic0 lets QMP `set_link nic0 off` cut the network mid-run (cos/testenv:
    // dependencies install online, then the tests run with the cable pulled).
    args.push('-device', 'virtio-net-pci,netdev=net0,id=nic0');
  } else {
    // 'none' — matches archetype default (isolated: true). No -netdev at
    // all means no network device is even presented to the guest.
    args.push('-nic', 'none');
  }

  // Display
  let vncDisplayNum = null;
  if (vmConfig.headless) {
    args.push('-display', 'none');
    vncDisplayNum = derivePort(compartmentId, 0, 100); // VNC display N == port 5900+N
    // §0.39.279 — the same display as a websocket on 5700+N, so the desktop viewer (idearium/ui/desktop.html, noVNC)
    // opens it in Clear Glass without a separate VNC client. Loopback only, like the VNC port.
    args.push('-vnc', `127.0.0.1:${vncDisplayNum},websocket=${5700 + vncDisplayNum}`);
  } else {
    args.push('-display', process.platform === 'linux' ? 'gtk' : 'default');
  }

  // QMP control channel — unix socket everywhere except win32, where QEMU's
  // AF_UNIX support is version-dependent; TCP-on-loopback is the safe
  // universal choice there.
  let qmp;
  if (process.platform === 'win32') {
    const port = derivePort(compartmentId, 15000, 5000);
    args.push('-qmp', `tcp:127.0.0.1:${port},server,nowait`);
    qmp = { transport: 'tcp', host: '127.0.0.1', port };
  } else {
    const sockPath = path.join(vmConfig.vmStateDir, 'qmp.sock');
    fs.mkdirSync(vmConfig.vmStateDir, { recursive: true });
    if (fs.existsSync(sockPath)) fs.unlinkSync(sockPath); // stale socket from a crash
    args.push('-qmp', `unix:${sockPath},server,nowait`);
    qmp = { transport: 'unix', path: sockPath };
  }

  let qga = null;
  if (vmConfig.guestAgent) {
    args.push('-device', 'virtio-serial');
    if (process.platform === 'win32') {
      const port = derivePort(compartmentId, 20000, 5000);
      args.push('-chardev', `socket,id=qga0,host=127.0.0.1,port=${port},server=on,wait=off`);
      qga = { transport: 'tcp', host: '127.0.0.1', port };
    } else {
      const qsock = path.join(vmConfig.vmStateDir, 'qga.sock');
      fs.mkdirSync(vmConfig.vmStateDir, { recursive: true });
      if (fs.existsSync(qsock)) fs.unlinkSync(qsock);
      args.push('-chardev', `socket,id=qga0,path=${qsock},server=on,wait=off`);
      qga = { transport: 'unix', path: qsock };
    }
    args.push('-device', 'virtserialport,chardev=qga0,name=org.qemu.guest_agent.0');
  }
  let share = null;
  if (vmConfig.shareDir) {
    if (process.platform === 'linux') {
      args.push('-virtfs', `local,path=${vmConfig.shareDir},mount_tag=cos_share,security_model=none,id=cos_share`);
      share = { kind: '9p', mountTag: 'cos_share' };
    } else {
      // virtfs exists only in Linux-host QEMU; elsewhere the dir is a virtual
      // FAT drive (QEMU marks vvfat rw experimental — guest writes not relied on).
      args.push('-drive', `file=fat:rw:${vmConfig.shareDir},format=raw,if=virtio`);
      share = { kind: 'vvfat' };
    }
  }
  // §0.39.264 — a read-only raw disk the guest reads with `tar -xf /dev/vdb`
  // (cos/testenv/tar.js). Works on every host QEMU runs on, unlike 9p.
  if (vmConfig.shareDisk) {
    args.push('-drive', `file=${vmConfig.shareDisk},format=raw,if=virtio,readonly=on`);
    share = { kind: 'disk', device: '/dev/vdb' };
  }
  // A base can be a kernel + initramfs pair instead of a bootable disk (a test
  // VM's manifest "boot": { kernel, initrd, append }) — direct kernel boot.
  if (vmConfig.kernel) {
    args.push('-kernel', vmConfig.kernel);
    if (vmConfig.initrd) args.push('-initrd', vmConfig.initrd);
    if (vmConfig.append) args.push('-append', String(vmConfig.append));
  }
  // cloud-init NoCloud seed over the user-mode network (cos/testenv/provision.js)
  if (vmConfig.smbiosSerial) args.push('-smbios', `type=1,serial=${vmConfig.smbiosSerial}`);
  // the guest's console, to a file — what the setup shows while a base image is made
  if (vmConfig.serialLog) args.push('-serial', `file:${vmConfig.serialLog}`);
  args.push('-pidfile', path.join(vmConfig.vmStateDir, 'qemu.pid'));
  return { args, qmp, qga, share, vncDisplayNum, accel, accelReason: reason };
}

// ─── QMP client ─────────────────────────────────────────────────────────────────

/**
 * Minimal QEMU Machine Protocol client. Enough to negotiate capabilities,
 * issue commands, and read results — everything the runtime needs for
 * graceful shutdown, live snapshotting, and status queries.
 * https://www.qemu.org/docs/master/interop/qmp-spec.html
 */
class QMPClient {
  constructor(addr) {
    this.addr = addr; // { transport: 'unix', path } | { transport: 'tcp', host, port }
    this.sock = null;
    this._buf = '';
    this._pending = [];
    this._greeted = false;
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const opts = this.addr.transport === 'unix'
        ? { path: this.addr.path }
        : { host: this.addr.host, port: this.addr.port };

      const sock = net.createConnection(opts);
      this.sock = sock;

      const timer = setTimeout(() => {
        sock.destroy();
        reject(new QemuRuntimeError('QMP connect timed out'));
      }, timeoutMs);

      sock.once('error', (err) => {
        clearTimeout(timer);
        reject(new QemuRuntimeError(`QMP connect failed: ${err.message}`, err));
      });

      sock.on('data', (chunk) => this._onData(chunk));
      sock.on('close', () => { this.sock = null; });

      // Wait for the greeting banner, then negotiate capabilities.
      this._awaitGreeting = { resolve, reject: () => {}, timer };
      sock.once('connect', () => { /* wait for greeting via _onData */ });
    });
  }

  _onData(chunk) {
    this._buf += chunk.toString('utf8');
    let idx;
    while ((idx = this._buf.indexOf('\n')) >= 0) {
      const line = this._buf.slice(0, idx);
      this._buf = this._buf.slice(idx + 1);
      if (!line.trim()) continue;

      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }

      if (!this._greeted && msg.QMP) {
        this._greeted = true;
        clearTimeout(this._awaitGreeting.timer);
        // Negotiate capabilities, then resolve connect() once that succeeds.
        this._send({ execute: 'qmp_capabilities' })
          .then(() => this._awaitGreeting.resolve(this))
          .catch((err) => this._awaitGreeting.reject(err) || Promise.reject(err));
        continue;
      }

      if (msg.event) continue; // async QMP events (STOP, RESET, ...) — not consumed here

      // Command reply — resolve the oldest pending request (QMP is
      // request/response in order over one connection).
      const pending = this._pending.shift();
      if (!pending) continue;
      if (msg.error) pending.reject(new QemuRuntimeError(`QMP error: ${msg.error.desc}`, msg.error));
      else pending.resolve(msg.return);
    }
  }

  _send(obj) {
    return new Promise((resolve, reject) => {
      this._pending.push({ resolve, reject });
      this.sock.write(JSON.stringify(obj) + '\n');
    });
  }

  /** Issue a QMP command, e.g. command('query-status') or command('system_powerdown'). */
  command(execute, args = undefined) {
    if (!this.sock) return Promise.reject(new QemuRuntimeError('QMP not connected'));
    const payload = args !== undefined ? { execute, arguments: args } : { execute };
    return this._send(payload);
  }

  /** Human monitor passthrough — used for savevm/loadvm live-memory snapshots. */
  humanMonitorCommand(cmdLine) {
    return this.command('human-monitor-command', { 'command-line': cmdLine });
  }

  disconnect() {
    if (this.sock) { try { this.sock.end(); } catch (_) {} }
    this.sock = null;
  }
}

// ─── Spawn / graceful shutdown (called from compartment/process-runner.js) ────

/**
 * Resolve everything process-runner.js's spawnProcess() needs to launch this
 * compartment, without process-runner.js needing to know anything about
 * QEMU argv shape. Mirrors resolveRuntime()'s { bin, args } contract, plus
 * an `extra` bag the registry record carries forward for kill/status/`cos vm`.
 *
 * @param {object} opts — { compartmentId, name, entryFile, cwd, env }
 * @returns {{ bin: string, args: string[], extra: object }}
 */
function resolveSpawnSpec(opts) {
  const { compartmentId, name, entryFile, cwd, env } = opts;
  const vmConfig = resolveVmConfig(entryFile, env, cwd);

  if (vmConfig.ephemeral) {
    // vmConfig.disk IS the overlay target in ephemeral mode — created fresh
    // from baseImage on every spawn (Sandboxie semantics: clean every run).
    ensureEphemeralOverlay(vmConfig.baseImage, vmConfig.disk);
  } else if (!fs.existsSync(vmConfig.disk)) {
    throw new QemuRuntimeError(`disk not found: ${vmConfig.disk} — create it first (cos vm base-image create)`);
  }

  const { args, qmp, vncDisplayNum, accel, accelReason } = buildQemuArgs(vmConfig, compartmentId, name);

  return {
    bin: qemuSystemBin(),
    args,
    extra: { vmConfig, qmp, vncDisplayNum, accel, accelReason },
  };
}

/**
 * Graceful shutdown for a running QEMU record: QMP system_powerdown (an ACPI
 * signal — the guest OS gets to shut down cleanly, exactly like pressing the
 * power button), fall back to a hard kill if it doesn't exit in time.
 *
 * @param {object} record — the process-runner.js registry record, which
 *   carries { process, extra: { qmp } } for a qemu-windows compartment.
 * @param {object} [options]
 * @returns {Promise<boolean>} true if shutdown was initiated
 */
async function gracefulShutdown(record, { timeoutMs = 30000 } = {}) {
  const qmpAddr = record.extra && record.extra.qmp;
  if (!qmpAddr) {
    // No QMP info recorded — fall back to a plain SIGTERM/SIGKILL, same as
    // every other runtime. Still correct, just not graceful for the guest.
    try { record.process.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => { try { if (!record.process.killed) record.process.kill('SIGKILL'); } catch (_) {} }, 5000);
    return true;
  }

  let client;
  try {
    client = new QMPClient(qmpAddr);
    await client.connect(3000);
    await client.command('system_powerdown');
  } catch (_) {
    // QMP unreachable (e.g. guest already crashed the way in) — fall back.
    try { record.process.kill('SIGTERM'); } catch (_) {}
  } finally {
    if (client) client.disconnect();
  }

  // Grace period for the guest OS to actually shut down, then force it.
  setTimeout(() => {
    if (!record.process.killed) {
      try { record.process.kill('SIGKILL'); } catch (_) {}
    }
  }, timeoutMs);

  return true;
}

/** Cleanup called after a qemu-windows process exits (process-runner.js close handler). */
function onExit(record) {
  const vmConfig = record.extra && record.extra.vmConfig;
  if (vmConfig && vmConfig.ephemeral) {
    // Sandboxie's core promise: nothing survives the session.
    try { discardOverlay(vmConfig.disk); } catch (_) {}
  }
}

/**
 * Recover from a COS host crash/kill that happened before a running VM's
 * own graceful-shutdown timer got to fire (empirically confirmed possible
 * during development of this driver: a killed Node process abandons its
 * pending setTimeout callbacks, and the QEMU child is simply re-parented
 * and keeps running — the same class of risk process-runner.js's plain
 * SIGTERM/SIGKILL path already has for any child, just costlier for a VM).
 *
 * Reads the pidfile QEMU wrote at boot (-pidfile, set in buildQemuArgs) and,
 * if a process with that PID is still alive and still looks like our own
 * qemu-system process (checked via /proc/<pid>/cmdline on Linux, best
 * effort elsewhere), kills it and removes the stale VM-state directory.
 *
 * @param {string} vmStateDir — the compartment's .cos-vm directory
 * @returns {{ found: boolean, killed: boolean, pid: number|null }}
 */
function reapOrphan(vmStateDir) {
  const pidFile = path.join(vmStateDir, 'qemu.pid');
  if (!fs.existsSync(pidFile)) return { found: false, killed: false, pid: null };

  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (!pid) return { found: false, killed: false, pid: null };

  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch (_) { alive = false; }
  if (!alive) return { found: true, killed: false, pid };

  // Best-effort confirmation this PID is actually our qemu process before
  // killing it — pids get reused, and this is the difference between
  // cleaning up our own orphan and killing an unrelated process.
  if (process.platform === 'linux') {
    try {
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmdline.includes('qemu-system')) return { found: true, killed: false, pid };
    } catch (_) {
      return { found: true, killed: false, pid }; // process vanished between checks, or unreadable — don't guess
    }
  }

  try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  return { found: true, killed: true, pid };
}

module.exports = {
  QEMU_BIN, QEMU_IMG_BIN, qemuSystemBin, qemuImgBin,
  derivePort, desktopPorts,
  QemuRuntimeError,
  QMPClient,
  pickAccelerator,
  resolveVmConfig,
  buildQemuArgs,
  resolveSpawnSpec,
  gracefulShutdown,
  onExit,
  createBlankDisk,
  ensureEphemeralOverlay,
  discardOverlay,
  qemuImgSnapshotSave,
  qemuImgSnapshotApply,
  qemuImgSnapshotDelete,
  qemuImgSnapshotList,
  reapOrphan,
  QEMU_BIN,
  QEMU_IMG_BIN,
};
