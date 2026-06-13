/**
 * host/gates/process.js
 * COMPARTMENT OS — Process Lifecycle Gates
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Gates in this file:
 *
 *   ProcessSpawnGate    signature: 'comp:process:spawn'
 *     Triggered by: StartCompartmentGate emitting 'host:compartment:started'
 *     but routed through a dedicated spawn command event so the chain is:
 *
 *       CLI emit('host:compartment:start')
 *         → StartCompartmentGate   → emit('host:compartment:started')
 *         → (observer in createHost routes to spawn if entryFile exists)
 *         → emit('comp:process:spawn', { compartmentId, ... })
 *         → ProcessSpawnGate       → spawnProcess() → async events
 *
 *   ProcessKillGate     signature: 'comp:process:kill'
 *     Triggered by: StopCompartmentGate emitting 'host:compartment:stopped'
 *     Same routing pattern.
 *
 * Why a separate 'comp:process:spawn' event rather than spawning inside
 * StartCompartmentGate? Single responsibility (COS-1 aligned with SISO §2.2):
 *   StartCompartmentGate  → owns state transition
 *   ProcessSpawnGate      → owns process lifecycle
 *
 * Author: James Brooks (Erosmancer)
 */

'use strict';

const { Gate }    = require('../../siso/Gate.js');
const { Event }   = require('../../siso/Event.js');
const { COMP, HOST } = require('../../foundation/event-contracts.js');
const { spawnProcess, killProcess, getProcess } = require('../../compartment/process-runner.js');

// ─── ProcessSpawnGate ─────────────────────────────────────────────────────────

/**
 * Handles: 'comp:process:spawn'
 *
 * payload: {
 *   compartmentId, name, runtimeId, entryFile,
 *   entryArgs, cwd, env, bus, store, sysmap
 * }
 *
 * If entryFile is missing or runtimeId is null, emits comp:spawn:failed.
 * Otherwise calls spawnProcess() which handles all further events async.
 */
class ProcessSpawnGate extends Gate {
  constructor() {
    super('comp:process:spawn');
  }

  transform(event, stream) {
    const {
      compartmentId, name, runtimeId, entryFile,
      entryArgs = [], cwd, env = {},
      bus, store, sysmap,
    } = event.data;

    if (!runtimeId) {
      stream.emit(new Event(COMP.SPAWN_FAILED, {
        compartmentId,
        name,
        reason: 'no runtimeId — cannot spawn without a runtime',
      }));
      return;
    }

    if (!entryFile) {
      stream.emit(new Event(COMP.SPAWN_FAILED, {
        compartmentId,
        name,
        reason: 'no entryFile — cannot spawn without an entry point',
      }));
      return;
    }

    // spawnProcess is synchronous setup, async I/O thereafter
    spawnProcess({
      compartmentId, name, runtimeId, entryFile,
      entryArgs, cwd, env,
      bus, store, sysmap,
    });
  }
}

// ─── ProcessKillGate ──────────────────────────────────────────────────────────

/**
 * Handles: 'comp:process:kill'
 *
 * payload: { compartmentId, name }
 *
 * Sends SIGTERM to the compartment's process.
 * If no process is running, emits comp:process:error.
 */
class ProcessKillGate extends Gate {
  constructor() {
    super('comp:process:kill');
  }

  transform(event, stream) {
    const { compartmentId, name } = event.data;

    const killed = killProcess(compartmentId);

    if (!killed) {
      stream.emit(new Event(COMP.PROCESS_ERROR, {
        compartmentId,
        name,
        reason: `no running process found for "${name}"`,
      }));
    }
    // On success: process-runner will emit comp:process:exited async
  }
}

// ─── ProcessStdinGate ─────────────────────────────────────────────────────────

/**
 * Handles: 'comp:process:stdin'
 *
 * payload: { compartmentId, name, text }
 *
 * Writes text to the running process's stdin.
 */
class ProcessStdinGate extends Gate {
  constructor() {
    super('comp:process:stdin');
  }

  transform(event, stream) {
    const { compartmentId, name, text } = event.data;
    const { writeStdin } = require('../../compartment/process-runner.js');

    const ok = writeStdin(compartmentId, text);
    if (!ok) {
      stream.emit(new Event(COMP.PROCESS_ERROR, {
        compartmentId,
        name,
        reason: `cannot write to stdin — no running process for "${name}"`,
      }));
    }
  }
}

module.exports = { ProcessSpawnGate, ProcessKillGate, ProcessStdinGate };
