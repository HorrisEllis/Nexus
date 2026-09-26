'use strict';
/**
 * cos/playground/sandbox.js  -  Compartment Sandbox Runner
 * UUID: cos-sandbox-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Runs a branch in a fully isolated child process.
 * The branch root is the cwd. The process gets a clean env.
 * stdout/stderr stream back as events. Exit code captured.
 *
 * Isolation model:
 *   - Separate process (child_process.spawn)  -  no shared memory
 *   - cwd = branch root  -  cannot see parent tree
 *   - Env = parent env + overrides + NEXUS_SANDBOX=1
 *   - No bus connection  -  output flows only through events
 *   - Watchdog: max runtime, max output bytes, crash loop guard
 *
 * API:
 *   SandboxRunner.run(compartment, branchId, opts)
 *     -> streams events to bus
 *     -> returns RunResult when process exits
 *
 *   SandboxRunner.kill(compartment, branchId)
 *     -> SIGTERM the running process
 */

'use strict';

const cp     = require('child_process');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const { compartmentPaths } = require('../foundation/constants.js');
const { CosAxiomError }    = require('../foundation/axioms.js');
const { BranchEngine }     = require('./branch.js');

// Registry of running sandboxes: "compartmentId:branchId" -> { proc, startedAt, runId }
const _running = new Map();

// Runtime resolver (node by default)
const RUNTIME_BINS = {
  node:    process.execPath,
  python:  'python3', python3: 'python3',
  deno:    'deno', bun: 'bun',
  shell:   process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  php:     'php', ruby: 'ruby', java: 'java',
};

class SandboxRunner {
  /**
   * Run a branch in isolation.
   *
   * @param {object} compartment
   * @param {string} branchId       -  'working-tree' runs the live root
   * @param {object} opts
   * @param {string}   opts.command       -  command to run (default: entryFile or 'node index.js')
   * @param {string[]} opts.args          -  extra args
   * @param {string}   opts.runtimeId     -  override runtime (default: compartment.runtimeId)
   * @param {object}   opts.env           -  extra env vars
   * @param {number}   opts.timeoutMs     -  max runtime (default: 30s)
   * @param {number}   opts.maxOutputBytes  -  max stdout+stderr bytes (default: 1MB)
   * @param {object}   opts.bus           -  event bus for streaming events
   * @param {function} opts.onLine        -  (line, stream) -> void  -  live output callback
   * @returns {Promise<RunResult>}
   */
  static run(compartment, branchId, opts = {}) {
    const key = `${compartment.id}:${branchId}`;
    if (_running.has(key)) {
      return Promise.reject(new Error(`sandbox: already running: ${key}`));
    }

    const brRoot = branchId === 'working-tree'
      ? compartment.fs?.root
      : path.join(compartmentPaths(compartment.id).nexDir, 'branches', branchId, 'root');

    if (!brRoot || !fs.existsSync(brRoot)) {
      return Promise.reject(new CosAxiomError('COS-1',
        `sandbox: root not found: ${brRoot}`, { branchId }));
    }

    // Resolve what to run
    const runtimeId = opts.runtimeId || compartment.runtimeId || 'node';
    const bin       = RUNTIME_BINS[runtimeId] || runtimeId;
    const entryFile = opts.command || compartment.entryFile || 'index.js';
    const args      = [entryFile, ...(opts.args || []), ...(compartment.entryArgs || [])];

    const runId = `run-${crypto.randomUUID().slice(0, 8)}`;
    // §2026-09-21 opts.cleanEnv — opt-in: the child gets only what a process
    // needs to start (PATH, temp dirs, OS roots), never the parent's secrets.
    // Default unchanged for every existing caller. Used by lib/repo-run.js,
    // whose code under test may have been written by an agent.
    const CLEAN_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'ComSpec'];
    const baseEnv = opts.cleanEnv
      ? Object.fromEntries(CLEAN_KEYS.filter(k => process.env[k] != null).map(k => [k, process.env[k]]))
      : process.env;
    const env   = {
      ...baseEnv,
      ...(opts.env || {}),
      NEXUS_SANDBOX:    '1',
      NEXUS_BRANCH_ID:  branchId,
      NEXUS_RUN_ID:     runId,
      NEXUS_COMP_ID:    compartment.id,
    };

    const timeoutMs      = opts.timeoutMs      ?? 30_000;
    const maxOutputBytes = opts.maxOutputBytes ?? 1_048_576;
    const bus            = opts.bus            || null;

    return new Promise((resolve) => {
      const startedAt    = Date.now();
      let   stdout       = '';
      let   stderr       = '';
      let   outputBytes  = 0;
      let   killed       = false;
      let   timerHandle  = null;

      const emit = (type, payload) => {
        if (bus) {
          try { bus.emit(type, payload); } catch { /* non-fatal */ }
        }
      };

      const proc = cp.spawn(bin, args, {
        cwd:   brRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      _running.set(key, { proc, startedAt, runId });

      emit('comp:sandbox:started', {
        compartmentId: compartment.id,
        branchId, runId, bin, args, cwd: brRoot, ts: startedAt,
      });

      // Timeout watchdog
      if (timeoutMs > 0) {
        timerHandle = setTimeout(() => {
          killed = true;
          proc.kill('SIGTERM');
          setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 2000);
          emit('comp:sandbox:timeout', {
            compartmentId: compartment.id, branchId, runId, timeoutMs,
          });
        }, timeoutMs);
      }

      proc.stdout.on('data', chunk => {
        const str = chunk.toString();
        outputBytes += Buffer.byteLength(chunk);
        stdout += str;
        str.split('\n').filter(Boolean).forEach(line => {
          emit('comp:sandbox:stdout', { compartmentId: compartment.id, branchId, runId, line });
          opts.onLine?.(line, 'stdout');
        });
        if (outputBytes > maxOutputBytes) {
          killed = true;
          proc.kill('SIGTERM');
          emit('comp:sandbox:output-limit', {
            compartmentId: compartment.id, branchId, runId, maxOutputBytes,
          });
        }
      });

      proc.stderr.on('data', chunk => {
        const str = chunk.toString();
        outputBytes += Buffer.byteLength(chunk);
        stderr += str;
        str.split('\n').filter(Boolean).forEach(line => {
          emit('comp:sandbox:stderr', { compartmentId: compartment.id, branchId, runId, line });
          opts.onLine?.(line, 'stderr');
        });
      });

      proc.on('error', err => {
        _running.delete(key);
        if (timerHandle) clearTimeout(timerHandle);
        const result = {
          ok: false, runId, branchId,
          exitCode: null, signal: null,
          stdout, stderr,
          error: err.message,
          durationMs: Date.now() - startedAt,
          killedByTimeout: false, killedByOutputLimit: false,
        };
        emit('comp:sandbox:error', { compartmentId: compartment.id, ...result });
        BranchEngine.recordRun(compartment, branchId, result);
        resolve(result);
      });

      proc.on('exit', (code, signal) => {
        _running.delete(key);
        if (timerHandle) clearTimeout(timerHandle);
        const durationMs = Date.now() - startedAt;
        const result = {
          ok:          code === 0,
          runId, branchId,
          exitCode:    code,
          signal:      signal || null,
          stdout, stderr,
          outputBytes,
          durationMs,
          killedByTimeout:     killed && timerHandle !== null,
          killedByOutputLimit: outputBytes > maxOutputBytes,
          startedAt,
          finishedAt: Date.now(),
        };
        emit('comp:sandbox:exited', { compartmentId: compartment.id, ...result });
        BranchEngine.recordRun(compartment, branchId, result);
        resolve(result);
      });
    });
  }

  /**
   * Kill a running sandbox.
   */
  static kill(compartment, branchId) {
    const key    = `${compartment.id}:${branchId}`;
    const record = _running.get(key);
    if (!record) return { ok: false, reason: 'not running' };
    try { record.proc.kill('SIGTERM'); } catch { }
    _running.delete(key);
    return { ok: true, branchId, runId: record.runId };
  }

  /**
   * Check if a branch is currently running.
   */
  static isRunning(compartment, branchId) {
    return _running.has(`${compartment.id}:${branchId}`);
  }

  /**
   * List all currently running sandboxes.
   */
  static listRunning() {
    return [..._running.entries()].map(([key, r]) => ({
      key, runId: r.runId, startedAt: r.startedAt,
      durationMs: Date.now() - r.startedAt,
    }));
  }
}

module.exports = { SandboxRunner };
