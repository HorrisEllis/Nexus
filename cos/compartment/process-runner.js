/**
 * compartment/process-runner.js
 * COMPARTMENT OS — Compartment Process Runner
 *
 * Author: James Brooks (Erosmancer)
 * Version: 1.0.0
 *
 * Manages the lifecycle of a spawned compartment process.
 * Every process event flows back into the host event bus as a SISO Event.
 *
 * Responsibilities:
 *   - Resolve the correct binary for a given runtimeId
 *   - Spawn the process with proper env, cwd, stdio capture
 *   - Emit comp:process:stdout / comp:process:stderr per line
 *   - Emit comp:process:exited on clean exit
 *   - Emit comp:process:crashed on non-zero exit
 *   - Emit comp:process:error on spawn failure (ENOENT, EACCES, etc.)
 *   - Track crash loop count → emit watchdog:process:crash-loop
 *   - Maintain a registry of live processes keyed by compartmentId
 *
 * Phase 4 scope: Node.js runtime only.
 * Python, Deno, Bun, Go, Rust, Shell — Phase 6 (runtime plugins).
 *
 * COS-1: Nothing silently fails — every failure is an event.
 * COS-4: Compartments never share memory — only events.
 */

'use strict';

const { spawn }   = require('child_process');
const path        = require('path');
const { Event }   = require('../siso/Event.js');
const { COMP, WATCHDOG } = require('../foundation/event-contracts.js');

// ─── Runtime → binary resolver ────────────────────────────────────────────────

const RUNTIME_BINS = Object.freeze({
  node:   process.execPath,          // same node binary running COS
  python: 'python3',
  python3: 'python3',
  deno:   'deno',
  bun:    'bun',
  go:     'go',
  rust:   'cargo',
  shell:  process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  php:    'php',
  ruby:   'ruby',
  java:   'java',
});

const RUNTIME_ARGS = Object.freeze({
  go:   ['run'],
  rust: ['run', '--'],
  shell: process.platform === 'win32' ? ['/c'] : [],
});

/**
 * Resolve the binary and leading args for a given runtimeId + entryFile.
 * @param {string} runtimeId
 * @param {string} entryFile
 * @returns {{ bin: string, args: string[] }}
 */
function resolveRuntime(runtimeId, entryFile) {
  const bin  = RUNTIME_BINS[runtimeId] || runtimeId;
  const pre  = RUNTIME_ARGS[runtimeId] || [];
  return { bin, args: [...pre, entryFile] };
}

// ─── Process registry ─────────────────────────────────────────────────────────
// Maps compartmentId → { process, startedAt, crashCount, killRequested }

const _registry = new Map();

/**
 * Get the live process record for a compartment, or null.
 * @param {string} compartmentId
 */
function getProcess(compartmentId) {
  return _registry.get(compartmentId) || null;
}

/**
 * Kill a running process for a compartment.
 * @param {string} compartmentId
 * @returns {boolean} true if a process was found and killed
 */
function killProcess(compartmentId) {
  const rec = _registry.get(compartmentId);
  if (!rec) return false;
  rec.killRequested = true;
  try {
    rec.process.kill('SIGTERM');
    // Grace period then SIGKILL
    setTimeout(() => {
      if (!rec.process.killed) {
        try { rec.process.kill('SIGKILL'); } catch (_) {}
      }
    }, 3000);
  } catch (_) {}
  return true;
}

// ─── Crash loop detection ─────────────────────────────────────────────────────

const CRASH_LOOP_WINDOW_MS = 60_000;
const CRASH_LOOP_LIMIT     = 3;

// ─── spawnProcess ─────────────────────────────────────────────────────────────

/**
 * Spawn a compartment's runtime process.
 *
 * This is called by ProcessSpawnGate.transform() and returns immediately.
 * All lifecycle events are emitted asynchronously via the bus.
 *
 * @param {object} opts
 *   compartmentId  — UUID
 *   name           — human name (for event payloads)
 *   runtimeId      — 'node' | 'python' | ...
 *   entryFile      — absolute path to entry file
 *   entryArgs      — additional args to pass to entry file
 *   cwd            — working directory (compartment root)
 *   env            — additional env vars (merged with process.env)
 *   bus            — EventBus to emit events into
 *   store          — StateStore (for state updates on exit)
 *   sysmap         — SystemMap (for state updates on exit)
 */
function spawnProcess(opts) {
  const {
    compartmentId,
    name,
    runtimeId,
    entryFile,
    entryArgs  = [],
    cwd,
    env        = {},
    bus,
    store,
    sysmap,
  } = opts;

  if (_registry.has(compartmentId)) {
    bus.emit(COMP.SPAWN_FAILED, {
      compartmentId,
      name,
      reason: `process already running for "${name}"`,
    });
    return;
  }

  const { bin, args } = resolveRuntime(runtimeId, entryFile);
  const fullArgs      = [...args, ...entryArgs];

  const proc = spawn(bin, fullArgs, {
    cwd:   cwd || process.cwd(),
    env:   Object.assign({}, process.env, env, { COS_COMPARTMENT_ID: compartmentId }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const record = {
    process:       proc,
    startedAt:     Date.now(),
    crashCount:    0,
    crashTimes:    [],
    killRequested: false,
    compartmentId,
    name,
    runtimeId,
  };

  _registry.set(compartmentId, record);

  // ── Spawn error (ENOENT, EACCES, etc.) ──────────────────────────────────
  proc.on('error', (err) => {
    _registry.delete(compartmentId);
    bus.emit(COMP.SPAWN_FAILED, {
      compartmentId,
      name,
      runtimeId,
      bin,
      reason: err.message,
      code:   err.code,
    });

    // Transition compartment to error state
    _transitionState(compartmentId, 'error', store, sysmap, bus);
  });

  // ── stdout ───────────────────────────────────────────────────────────────
  let stdoutBuf = '';
  proc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop(); // keep incomplete line
    for (const line of lines) {
      bus.emit(COMP.PROCESS_STDOUT, {
        compartmentId,
        name,
        line,
        ts: Date.now(),
      });
    }
  });

  // ── stderr ───────────────────────────────────────────────────────────────
  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split('\n');
    stderrBuf = lines.pop();
    for (const line of lines) {
      bus.emit(COMP.PROCESS_STDERR, {
        compartmentId,
        name,
        line,
        ts: Date.now(),
      });
    }
  });

  // ── exit ─────────────────────────────────────────────────────────────────
  proc.on('close', (code, signal) => {
    // Flush remaining buffer content
    if (stdoutBuf) {
      bus.emit(COMP.PROCESS_STDOUT, { compartmentId, name, line: stdoutBuf, ts: Date.now() });
      stdoutBuf = '';
    }
    if (stderrBuf) {
      bus.emit(COMP.PROCESS_STDERR, { compartmentId, name, line: stderrBuf, ts: Date.now() });
      stderrBuf = '';
    }

    _registry.delete(compartmentId);

    const clean     = code === 0 || record.killRequested;
    const eventType = clean ? COMP.PROCESS_EXITED : COMP.PROCESS_CRASHED;
    const duration  = Date.now() - record.startedAt;

    bus.emit(eventType, {
      compartmentId,
      name,
      runtimeId,
      code,
      signal,
      duration,
      killRequested: record.killRequested,
    });

    if (!clean) {
      // Track crash times for loop detection
      const now = Date.now();
      record.crashTimes = record.crashTimes.filter(t => now - t < CRASH_LOOP_WINDOW_MS);
      record.crashTimes.push(now);
      record.crashCount++;

      if (record.crashCount >= CRASH_LOOP_LIMIT) {
        bus.emit(WATCHDOG.PROCESS_CRASH_LOOP, {
          compartmentId,
          name,
          restartCount: record.crashCount,
        });
      }
    }

    // Transition compartment state on exit
    const newState = clean ? 'stopped' : 'error';
    _transitionState(compartmentId, newState, store, sysmap, bus);
  });

  // Emit process started event with PID
  bus.emit(COMP.PROCESS_STARTED, {
    compartmentId,
    name,
    runtimeId,
    pid:       proc.pid,
    bin,
    args:      fullArgs,
    startedAt: record.startedAt,
  });
}

// ─── State transition helper ──────────────────────────────────────────────────

function _transitionState(compartmentId, newState, store, sysmap, bus) {
  const comp = store.getCompartment(compartmentId);
  if (!comp) return;

  const updated = Object.assign({}, comp, {
    state:     newState,
    updatedAt: Date.now(),
  });

  store.setCompartment(updated);
  store.flushSync();
  sysmap.upsertCompartment(updated);
}

// ─── stdin write ─────────────────────────────────────────────────────────────

/**
 * Write a string to a running process's stdin.
 * @param {string} compartmentId
 * @param {string} text
 * @returns {boolean}
 */
function writeStdin(compartmentId, text) {
  const rec = _registry.get(compartmentId);
  if (!rec || !rec.process.stdin) return false;
  try {
    rec.process.stdin.write(text);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { spawnProcess, killProcess, getProcess, writeStdin, resolveRuntime };
