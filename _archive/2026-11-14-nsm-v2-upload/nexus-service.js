/**
 * NEXUS Bridge — Windows Service Wrapper
 * Installs the bridge server as a Windows service using node-windows.
 * The bridge runs as a background service at port 3747, starts at boot,
 * restarts on crash, and survives the Electron UI closing.
 *
 * Usage:
 *   node service/nexus-service.js install    — install the service
 *   node service/nexus-service.js uninstall  — remove the service
 *   node service/nexus-service.js start      — start if installed
 *   node service/nexus-service.js stop       — stop if running
 *   node service/nexus-service.js status     — check status
 *   node service/nexus-service.js run        — run directly (no install)
 *
 * Requires: npm install node-windows -g && npm link node-windows
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { execSync, spawn } = require('child_process');

const ROOT       = path.join(__dirname, '..');
const BRIDGE     = path.join(ROOT, 'bridge', 'nexus-bridge-server.js');
const SERVICE_NAME = 'NexusBridge';
const SERVICE_DESC = 'NEXUS Cognitive OS — Bridge Server (port 3747)';

const cmd = process.argv[2] || 'help';
// Resolve real node binary — never use process.execPath in Electron context
function resolveNodeBin() {
  if (process.env.NEXUS_NODE_BIN) return process.env.NEXUS_NODE_BIN;
  const self = process.execPath;
  const base = require('path').basename(self).toLowerCase();
  if (base === 'node.exe' || base === 'node') return self;
  const win = process.platform === 'win32';
  try {
    const found = require('child_process')
      .execSync(win ? 'where node' : 'which node', { encoding: 'utf8', timeout: 3000 })
      .trim().split(win ? '\r\n' : '\n')[0].trim();
    if (found && require('fs').existsSync(found)) return found;
  } catch(_) {}
  return 'node';
}
const NODE_BIN = resolveNodeBin();


// ── Detect platform ─────────────────────────────────────────────────────────
if (process.platform !== 'win32' && cmd !== 'run' && cmd !== 'status') {
  console.log('[nexus-service] Non-Windows platform — use "run" to start the bridge directly.');
  if (cmd === 'run') runDirect();
  process.exit(0);
}

// ── Commands ────────────────────────────────────────────────────────────────

if (cmd === 'run') { runDirect(); process.exit(0); }
if (cmd === 'status') { showStatus(); process.exit(0); }

// Windows-only commands
try {
  const Service = require('node-windows').Service;

  const svc = new Service({
    name:        SERVICE_NAME,
    description: SERVICE_DESC,
    script:      BRIDGE,
    nodeOptions: [],
    env: [
      { name: 'NEXUS_PORT',     value: '3747' },
      { name: 'NEXUS_HOST',     value: '127.0.0.1' },
      { name: 'DATA_DIR',       value: path.join(ROOT, 'bridge', 'data') },
      { name: 'PROFILES_DIR',   value: path.join(ROOT, 'profiles') },
    ],
  });

  if (cmd === 'install') {
    svc.on('install', () => {
      console.log('[nexus-service] ✓ Service installed');
      console.log('[nexus-service] Starting NexusBridge...');
      svc.start();
    });
    svc.on('start', () => {
      console.log('[nexus-service] ✓ NexusBridge started — bridge is live at http://127.0.0.1:3747');
    });
    svc.on('error', (e) => console.error('[nexus-service] Error:', e));
    svc.install();

  } else if (cmd === 'uninstall') {
    svc.on('uninstall', () => console.log('[nexus-service] ✓ Service uninstalled'));
    svc.uninstall();

  } else if (cmd === 'start') {
    svc.on('start', () => console.log('[nexus-service] ✓ Started'));
    svc.start();

  } else if (cmd === 'stop') {
    svc.on('stop', () => console.log('[nexus-service] ✓ Stopped'));
    svc.stop();

  } else {
    showHelp();
  }

} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.error('[nexus-service] node-windows not installed.');
    console.error('  Run: npm install -g node-windows && npm link node-windows');
    console.error('  Or use NSSM: see service/NSSM-INSTALL.md');
    process.exit(1);
  }
  throw e;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function runDirect() {
  console.log('[nexus-service] Starting bridge directly (no install)...');
  const env = Object.assign({}, process.env, {
    NEXUS_PORT:   '3747',
    NEXUS_HOST:   '127.0.0.1',
    DATA_DIR:     path.join(ROOT, 'bridge', 'data'),
    PROFILES_DIR: path.join(ROOT, 'profiles'),
  });
  const proc = spawn(NODE_BIN, [BRIDGE], {
    env, cwd: path.join(ROOT, 'bridge'),
    stdio: 'inherit',
  });
  proc.on('exit', (code) => {
    console.log('[nexus-service] Bridge exited with code', code);
  });
}

function showStatus() {
  if (process.platform !== 'win32') {
    // Check if port 3747 is open
    try {
      const result = require('http').get('http://127.0.0.1:3747/health', (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            console.log('[nexus-service] ● BRIDGE RUNNING — v' + j.version + ' uptime: ' + j.uptime + 's');
          } catch {
            console.log('[nexus-service] ● BRIDGE RUNNING (could not parse health)');
          }
          process.exit(0);
        });
      });
      result.on('error', () => {
        console.log('[nexus-service] ○ BRIDGE OFFLINE');
        process.exit(1);
      });
      result.setTimeout(2000, () => {
        console.log('[nexus-service] ○ BRIDGE TIMEOUT');
        process.exit(1);
      });
    } catch {
      console.log('[nexus-service] ○ BRIDGE OFFLINE');
      process.exit(1);
    }
    return;
  }

  try {
    const result = execSync('sc query NexusBridge 2>&1', { encoding: 'utf8' });
    if (result.includes('RUNNING')) {
      console.log('[nexus-service] ● NexusBridge service is RUNNING');
    } else if (result.includes('STOPPED')) {
      console.log('[nexus-service] ○ NexusBridge service is STOPPED');
    } else {
      console.log('[nexus-service] ? NexusBridge service status unknown');
    }
  } catch {
    console.log('[nexus-service] ○ NexusBridge service not installed');
  }
}

function showHelp() {
  console.log(`
NEXUS Bridge Service Manager
  install   — Install + start as Windows service (starts at boot)
  uninstall — Remove service
  start     — Start installed service
  stop      — Stop service
  status    — Check if running
  run       — Run bridge directly without installing as service

Requires node-windows:
  npm install -g node-windows
  npm link node-windows
  `);
}
