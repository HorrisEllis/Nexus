/**
 * vaultd/daemon.js
 * COMPARTMENT OS — vaultd Daemon Lifecycle (spec §66)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * start(): spawns vaultd/server.js as a real detached child process
 *   (`detached: true`, unref()'d after readiness) — it genuinely
 *   survives the parent CLI process exiting. Waits for the child to
 *   print "VAULTD_READY <port>" on stdout before resolving, so callers
 *   know the HTTP server is actually listening, not just spawned.
 * stop(): reads the PID file, sends SIGTERM.
 * status(): checks if the PID is alive (process.kill(pid, 0) — a probe,
 *   not an actual signal), and if so, hits the real /status endpoint.
 * backup()/restore(): file-level copy of the encrypted vault store —
 *   still encrypted at rest, same guarantee as vault/index.js's
 *   exportVault().
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const { VAULTD_PID_FILE, DEFAULT_VAULTD_PORT } = require('./config.js');
const { COS_VAULT_STORE_FILE, COS_STATE_FILE, COS_MAP_FILE } = require('../foundation/constants.js');

class VaultdError extends Error {
  constructor(message) {
    super(`vaultd: ${message}`);
    this.name = 'VaultdError';
  }
}

function readPidFile(pidFile = VAULTD_PID_FILE) {
  try { return JSON.parse(fs.readFileSync(pidFile, 'utf8')); }
  catch { return null; }
}

function writePidFile(data, pidFile = VAULTD_PID_FILE) {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, JSON.stringify(data));
}

function deletePidFile(pidFile = VAULTD_PID_FILE) {
  try { fs.unlinkSync(pidFile); } catch { /* already gone */ }
}

/** @param {number} pid @returns {boolean} */
function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

/**
 * @param {{ port?: number, stateFile?: string, mapFile?: string, pidFile?: string }} opts
 * @returns {Promise<{ pid: number, port: number }>}
 */
async function startVaultd(opts = {}) {
  const requestedPort = opts.port ?? DEFAULT_VAULTD_PORT;
  const pidFile = opts.pidFile || VAULTD_PID_FILE;

  const existing = readPidFile(pidFile);
  if (existing && isPidAlive(existing.pid)) {
    // async function: this synchronous throw automatically becomes a
    // rejected Promise — found via assert.rejects() failing to catch
    // this when startVaultd was a plain (non-async) function.
    throw new VaultdError(`already running (pid ${existing.pid}, port ${existing.port})`);
  }

  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server.js');
    const args = [serverPath, String(requestedPort), opts.stateFile || COS_STATE_FILE, opts.mapFile || COS_MAP_FILE];

    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new VaultdError('server did not signal readiness within 5s'));
      }
    }, 5000);

    child.stdout.on('data', (chunk) => {
      if (settled) return;
      const match = /VAULTD_READY (\d+)/.exec(chunk.toString());
      if (match) {
        settled = true;
        clearTimeout(timeout);
        // Use the REAL bound port server.js reported, not whatever was
        // requested — they can differ (port 0 = OS-assigned ephemeral).
        const actualPort = parseInt(match[1], 10);
        writePidFile({ pid: child.pid, port: actualPort, startedAt: Date.now() }, pidFile);
        child.unref();
        resolve({ pid: child.pid, port: actualPort });
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new VaultdError(`failed to spawn: ${err.message}`));
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new VaultdError(`server exited immediately (code ${code}) — port may be in use`));
      }
    });
  });
}

/**
 * @param {{ pidFile?: string }} opts
 * @returns {{ stopped: boolean, wasRunning: boolean }}
 */
function stopVaultd(opts = {}) {
  const pidFile = opts.pidFile || VAULTD_PID_FILE;
  const existing = readPidFile(pidFile);
  if (!existing || !isPidAlive(existing.pid)) {
    deletePidFile(pidFile);
    return { stopped: false, wasRunning: false };
  }

  try { process.kill(existing.pid, 'SIGTERM'); } catch { /* already gone */ }
  deletePidFile(pidFile);
  return { stopped: true, wasRunning: true };
}

/**
 * @param {{ pidFile?: string }} opts
 * @returns {Promise<object>} VaultdState shape
 */
function statusVaultd(opts = {}) {
  const pidFile = opts.pidFile || VAULTD_PID_FILE;
  const existing = readPidFile(pidFile);

  if (!existing || !isPidAlive(existing.pid)) {
    return Promise.resolve({ running: false, pid: null, uptime: 0, secretCount: 0, grantCount: 0, tpmBound: false, lastAccess: null });
  }

  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: existing.port, path: '/status', timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ running: true, pid: existing.pid, uptime: Date.now() - existing.startedAt, secretCount: 0, grantCount: 0, tpmBound: false, lastAccess: null }); }
      });
    });
    req.on('error', () => {
      // Process alive but HTTP unreachable — report alive-but-degraded
      // rather than silently claiming "not running."
      resolve({ running: true, pid: existing.pid, uptime: Date.now() - existing.startedAt, secretCount: 0, grantCount: 0, tpmBound: false, lastAccess: null, degraded: true });
    });
    req.on('timeout', () => req.destroy());
  });
}

/**
 * @param {string} backupPath
 * @param {string} [storeFile]
 * @returns {{ backedUp: boolean, path: string }}
 */
function backupVaultd(backupPath, storeFile = COS_VAULT_STORE_FILE) {
  if (!fs.existsSync(storeFile)) throw new VaultdError('no vault store to back up');
  fs.copyFileSync(storeFile, backupPath);
  return { backedUp: true, path: backupPath };
}

/**
 * @param {string} backupPath
 * @param {string} [storeFile]
 * @returns {{ restored: boolean }}
 */
function restoreVaultd(backupPath, storeFile = COS_VAULT_STORE_FILE) {
  if (!fs.existsSync(backupPath)) throw new VaultdError(`backup file "${backupPath}" not found`);
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.copyFileSync(backupPath, storeFile);
  return { restored: true };
}

module.exports = {
  VaultdError,
  startVaultd,
  stopVaultd,
  statusVaultd,
  backupVaultd,
  restoreVaultd,
  isPidAlive,
  readPidFile,
};
