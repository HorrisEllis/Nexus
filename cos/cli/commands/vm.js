/**
 * cli/commands/vm.js
 * COMPARTMENT OS — cos vm status | reset | snapshot | base-image | cleanup
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * CLI surface for compartment/qemu-runtime.js (runtimeId 'qemu-windows').
 * Same split as everywhere else in this CLI (COS-2/COS-13): logic lives in
 * qemu-runtime.js and process-runner.js, this file is input + formatting.
 *
 *   cos vm status      <compartment>
 *   cos vm reset        <compartment>                        — discard ephemeral overlay ("Sandboxie revert")
 *   cos vm snapshot     save|list|apply|delete <compartment> [tag]
 *   cos vm base-image   create <path> [size]                 — new golden qcow2 (default 64G)
 *   cos vm cleanup      [compartment]                        — reap orphaned QEMU processes after a host crash
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

/**
 * The one truly reliable cross-invocation liveness check for a VM: try the
 * durable QMP socket directly. More trustworthy than comp.state (which
 * only reflects whatever `cos start`/`cos stop` last wrote, and can go
 * stale — e.g. a crashed guest never updates it) and more trustworthy than
 * process-runner's in-memory registry (empty in any invocation other than
 * the one that spawned it). Best-effort: on any connect failure we treat
 * it as "not verifiably running" rather than raising, since a stale or
 * missing socket just means there's nothing to protect against.
 */
async function _isVmLive(vmConfig) {
  const path = require('path');
  const qmpSockPath = path.join(vmConfig.vmStateDir, 'qmp.sock');
  if (!fs.existsSync(qmpSockPath)) return false;
  const { QMPClient } = require('../../compartment/qemu-runtime.js');
  const client = new QMPClient({ transport: 'unix', path: qmpSockPath });
  try {
    await client.connect(1500);
    client.disconnect();
    return true;
  } catch (_) {
    return false;
  }
}

function _resolveComp(host, name) {
  const comp = host.store.getCompartmentByName(name) || host.store.getCompartment(name);
  if (!comp) throw new Error(`compartment not found: "${name}"`);
  if (comp.runtimeId !== 'qemu-windows') {
    throw new Error(`compartment "${name}" is runtime "${comp.runtimeId}", not "qemu-windows" — cos vm only applies to qemu-windows compartments`);
  }
  return comp;
}

function _vmConfigFor(comp) {
  const { resolveVmConfig } = require('../../compartment/qemu-runtime.js');
  const cwd = (comp.fs && comp.fs.root) || process.cwd();
  return resolveVmConfig(comp.entryFile, comp.envVars || {}, cwd);
}

// ─── status ─────────────────────────────────────────────────────────────────────

function statusCommand(host, compartmentName, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName) { error('  Usage: cos vm status <compartment>'); return null; }

  let comp, vmConfig;
  try {
    comp     = _resolveComp(host, compartmentName);
    vmConfig = _vmConfigFor(comp);
  } catch (e) { error(`  Error: ${e.message}`); return null; }

  const { getProcess } = require('../../compartment/process-runner.js');
  const live = getProcess(comp.id);

  // comp.state (persisted) is authoritative across CLI invocations — each
  // `cos` call is a separate process, so process-runner's in-memory
  // registry (`live`) only has anything in it when this call happens to be
  // in the same process that spawned it. Same convention as cli/commands/
  // status.js: state drives the headline, `live` only adds bonus detail
  // (pid/vnc/accel) when we get lucky enough to still be in that process.
  const result = {
    compartment: comp.name,
    state:       comp.state,
    running:     comp.state === 'running',
    pid:         live ? live.process.pid : null,
    disk:        vmConfig.disk,
    ephemeral:   vmConfig.ephemeral,
    network:     vmConfig.network,
    ramMB:       vmConfig.ramMB,
    cpus:        vmConfig.cpus,
    accel:       live && live.extra ? live.extra.accel : null,
    vnc:         live && live.extra && live.extra.vncDisplayNum != null
                   ? `127.0.0.1:${5900 + live.extra.vncDisplayNum}` : null,
    qmp:         live && live.extra ? live.extra.qmp : null,
  };

  if (flags.json) { log(JSON.stringify(result, null, 2)); return result; }

  log('');
  log(`  ${result.compartment}  ${result.running ? '● running' : '○ ' + result.state}`);
  log(`  disk:      ${result.disk}${result.ephemeral ? '  (ephemeral overlay)' : ''}`);
  log(`  resources: ${result.ramMB}MB RAM, ${result.cpus} vCPU`);
  log(`  network:   ${result.network}`);
  if (result.pid) {
    log(`  pid:       ${result.pid}  (live detail — this CLI call happens to be in the process that started it)`);
    log(`  accel:     ${result.accel}`);
    if (result.vnc) log(`  vnc:       ${result.vnc}  (connect with any VNC viewer to see the guest display)`);
  } else if (result.running) {
    log(`  pid:       unknown — running, but this CLI call is a separate process from the one that started it`);
  }
  log('');
  return result;
}

// ─── reset (Sandboxie-style revert) ────────────────────────────────────────────

function resetCommand(host, compartmentName, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName) { error('  Usage: cos vm reset <compartment> [--force]'); return null; }

  let comp, vmConfig;
  try {
    comp     = _resolveComp(host, compartmentName);
    vmConfig = _vmConfigFor(comp);
  } catch (e) { error(`  Error: ${e.message}`); return null; }

  if (!vmConfig.ephemeral) {
    error(`  Error: "${compartmentName}" is not ephemeral (ephemeral:false in its vm.json) — there is no overlay to discard. Use "cos vm snapshot apply" to roll back a persistent VM instead.`);
    return null;
  }

  return (async () => {
    // A real QMP probe beats persisted state — confirmed the hard way that
    // comp.state and the in-memory registry can both be wrong here (see
    // _isVmLive's comment). This is the one check across this whole file
    // that can actually tell "is this disk still open by a live QEMU
    // process right now", from any invocation.
    if (await _isVmLive(vmConfig) && !flags.force) {
      error(`  Error: "${compartmentName}" is running — stop it first (cos vm stop ${compartmentName}) or pass --force to reset anyway (the running VM will keep using its already-open disk handle until it exits).`);
      return null;
    }

    const { discardOverlay } = require('../../compartment/qemu-runtime.js');
    const result = discardOverlay(vmConfig.disk);
    log(`  ✓ Discarded overlay for "${compartmentName}" — next start will boot clean from ${vmConfig.baseImage || '(base image)'}`);
    return result;
  })();
}

// ─── stop (cross-invocation graceful shutdown) ─────────────────────────────────

/**
 * `cos stop` only flips persisted state and relies on process-runner's
 * in-memory registry to actually deliver a kill signal — and that registry
 * is a plain JS Map, scoped to whichever `cos` process is currently
 * running. Confirmed by inspecting host/index.js + process-runner.js: a
 * `cos stop` invoked from a different terminal call than the `cos start`
 * that spawned the process finds nothing in the registry, so nothing is
 * actually signaled — the real process (VM or otherwise) is silently left
 * running. This is true for every runtime here, not specific to
 * qemu-windows; there's no persistent kernel/daemon in this extract to hold
 * the registry open across invocations (playgrounds/kernel.js is a scoped
 * *event bus*, not a long-lived process — it doesn't help here).
 *
 * A VM gets a way around this that a plain child process doesn't: QEMU's
 * QMP control channel is a real filesystem object (a unix socket at a
 * deterministic, persisted path — see buildQemuArgs), not in-memory JS
 * state. `cos vm stop` reconnects to it directly, from any invocation,
 * and issues a genuine graceful ACPI powerdown — no registry required.
 */
function stopCommand(host, compartmentName, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName) { error('  Usage: cos vm stop <compartment> [--force]'); return null; }

  let comp, vmConfig;
  try {
    comp     = _resolveComp(host, compartmentName);
    vmConfig = _vmConfigFor(comp);
  } catch (e) { error(`  Error: ${e.message}`); return null; }

  const qr = require('../../compartment/qemu-runtime.js');
  const path = require('path');
  const qmpSockPath = path.join(vmConfig.vmStateDir, 'qmp.sock');

  if (!fs.existsSync(qmpSockPath)) {
    log(`  "${compartmentName}" has no live QMP socket at ${qmpSockPath} — nothing to stop (already stopped, or never started from this host).`);
    return { stopped: false, reason: 'no-qmp-socket' };
  }

  return (async () => {
    const client = new (require('../../compartment/qemu-runtime.js').QMPClient)({ transport: 'unix', path: qmpSockPath });
    try {
      await client.connect(3000);
      await client.command('system_powerdown');
      log(`  ✓ Sent ACPI powerdown to "${compartmentName}" via QMP (${qmpSockPath})`);
      log(`    The guest OS decides when to actually exit — check "cos vm status ${compartmentName}" shortly, or pass --force for an immediate hard stop.`);
      if (flags.force) {
        const pidPath = path.join(vmConfig.vmStateDir, 'qemu.pid');
        if (fs.existsSync(pidPath)) {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
          if (pid) { try { process.kill(pid, 'SIGKILL'); log(`  ✓ --force: sent SIGKILL to pid ${pid}`); } catch (_) {} }
        }
      }
      client.disconnect();
      return { stopped: true };
    } catch (e) {
      error(`  Error: couldn't reach "${compartmentName}"'s QMP socket — ${e.message}. It may have already exited; try "cos vm cleanup ${compartmentName}" to clear stale state.`);
      return null;
    }
  })();
}

// ─── snapshot (qemu-img internal, disk-level) ──────────────────────────────────

function snapshotCommand(host, sub, compartmentName, tag, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!sub || !compartmentName) { error('  Usage: cos vm snapshot <save|list|apply|delete> <compartment> [tag]'); return null; }

  let comp, vmConfig;
  try {
    comp     = _resolveComp(host, compartmentName);
    vmConfig = _vmConfigFor(comp);
  } catch (e) { error(`  Error: ${e.message}`); return null; }

  return (async () => {
  // Real QMP liveness probe, not comp.state — see _isVmLive's comment.
  // "list" is safe to run regardless (read-only qemu-img metadata scan);
  // save/apply need exclusive access to the disk file, so those two are
  // where a stale "it's fine" answer would actually risk corruption.
  const isRunning = await _isVmLive(vmConfig);
  const qr = require('../../compartment/qemu-runtime.js');

  try {
    switch (sub) {
      case 'list': {
        const snaps = qr.qemuImgSnapshotList(vmConfig.disk);
        log('');
        log('  ' + pad('TAG', 20) + pad('DATE', 26) + 'VM-STATE-SIZE');
        for (const s of snaps) log('  ' + pad(s.tag, 20) + pad(s.date, 26) + s.vmSize);
        log('', `  ${snaps.length} snapshot${snaps.length !== 1 ? 's' : ''}`, '');
        return snaps;
      }
      case 'save':
        if (isRunning) { error(`  Error: "${compartmentName}" is running — stop it first. Writing a disk-level snapshot while QEMU has the file open risks corruption.`); return null; }
        if (!tag) { error('  Usage: cos vm snapshot save <compartment> <tag>'); return null; }
        qr.qemuImgSnapshotSave(vmConfig.disk, tag);
        log(`  ✓ Snapshot "${tag}" saved for "${compartmentName}"`);
        return { ok: true };
      case 'apply':
        if (isRunning) { error(`  Error: "${compartmentName}" is running — stop it first.`); return null; }
        if (!tag) { error('  Usage: cos vm snapshot apply <compartment> <tag>'); return null; }
        qr.qemuImgSnapshotApply(vmConfig.disk, tag);
        log(`  ✓ Rolled "${compartmentName}" back to snapshot "${tag}"`);
        return { ok: true };
      case 'delete':
        if (!tag) { error('  Usage: cos vm snapshot delete <compartment> <tag>'); return null; }
        qr.qemuImgSnapshotDelete(vmConfig.disk, tag);
        log(`  ✓ Deleted snapshot "${tag}"`);
        return { ok: true };
      default:
        error('  Usage: cos vm snapshot <save|list|apply|delete> <compartment> [tag]');
        return null;
    }
  } catch (e) {
    error(`  Error: ${e.message}`);
    return null;
  }
  })();
}

// ─── base-image ─────────────────────────────────────────────────────────────────

function baseImageCommand(host, sub, imgPath, size, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (sub !== 'create' || !imgPath) {
    error('  Usage: cos vm base-image create <path> [size]   (size default: 64G)');
    return null;
  }

  const { createBlankDisk } = require('../../compartment/qemu-runtime.js');
  try {
    const result = createBlankDisk(path.resolve(imgPath), size || '64G');
    log(`  ✓ Created blank disk ${result.diskPath} (${result.size})`);
    log(`    Boot it once with an install ISO (vm.json "iso") to install an OS, then use it as`);
    log(`    "baseImage" in a windows-sandbox compartment for disposable, ephemeral runs.`);
    return result;
  } catch (e) {
    error(`  Error: ${e.message}`);
    return null;
  }
}

// ─── cleanup (orphan reaping) ───────────────────────────────────────────────────

function cleanupCommand(host, compartmentName, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  const { reapOrphan } = require('../../compartment/qemu-runtime.js');

  const targets = compartmentName
    ? [_resolveComp(host, compartmentName)]
    : (host.store.listCompartments ? host.store.listCompartments() : []).filter(c => c.runtimeId === 'qemu-windows');

  if (!targets.length) {
    log('  No qemu-windows compartments to check.');
    return [];
  }

  const results = [];
  for (const comp of targets) {
    const vmStateDir = path.join((comp.fs && comp.fs.root) || '.', '.cos-vm');
    if (!fs.existsSync(vmStateDir)) continue;
    const result = reapOrphan(vmStateDir);
    results.push({ compartment: comp.name, ...result });
    if (result.killed) log(`  ✓ Reaped orphaned QEMU process (pid ${result.pid}) for "${comp.name}"`);
    else if (result.found) log(`  · "${comp.name}": pidfile present but not a live orphan (pid ${result.pid})`);
  }
  if (!results.some(r => r.killed)) log('  No orphaned QEMU processes found.');
  return results;
}

// ─── dispatcher ─────────────────────────────────────────────────────────────────

function runVmCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));
  switch (sub) {
    case 'status':     return statusCommand(host, args[0], flags, out);
    case 'reset':      return resetCommand(host, args[0], flags, out);
    case 'stop':       return stopCommand(host, args[0], flags, out);
    case 'snapshot':   return snapshotCommand(host, args[0], args[1], args[2], out);
    case 'base-image': return baseImageCommand(host, args[0], args[1], args[2], out);
    case 'cleanup':    return cleanupCommand(host, args[0], out);
    default:
      error('  Usage: cos vm <status|reset|stop|snapshot|base-image|cleanup> [args]');
      return null;
  }
}

module.exports = {
  runVmCommand,
  statusCommand,
  resetCommand,
  stopCommand,
  snapshotCommand,
  baseImageCommand,
  cleanupCommand,
};
