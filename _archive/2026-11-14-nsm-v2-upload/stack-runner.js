/**
 * NEXUS Stack Runner
 * Starts bridge + ollama + testenv as a coordinated stack.
 * Each component is watched. Stack health reported to console.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');

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
  const candidates = win
    ? ['C:\\Program Files\\nodejs\\node.exe',
       'C:\\Program Files (x86)\\nodejs\\node.exe']
    : ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node'];
  for (const c of candidates) {
    try { if (require('fs').existsSync(c)) return c; } catch(_) {}
  }
  return 'node';
}
const NODE_BIN = resolveNodeBin();
const http   = require('http');

const ROOT  = path.join(__dirname, '..');
const STACK = (process.env.NEXUS_STACK_MODE === 'minimal')
  ? ['bridge']
  : ['bridge', 'ollama', 'testenv'];

const NSM = path.join(__dirname, 'nsm.js');

const components = {};

function startComponent(name) {
  console.log('[stack] Starting:', name);
  const proc = spawn(NODE_BIN, [NSM, 'watchdog', name], {
    stdio: 'inherit', cwd: ROOT, detached: false,
  });
  components[name] = { proc, pid: proc.pid, startedAt: Date.now() };
  proc.on('exit', (code) => {
    console.log('[stack] Component exited:', name, 'code=' + code);
    delete components[name];
  });
}

async function waitForBridge(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const alive = await new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:3747/health', { timeout: 1000 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
      });
      if (alive) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log('[stack] NEXUS Full Stack starting...');
  console.log('[stack] Components:', STACK.join(', '));

  // Bridge first
  startComponent('bridge');

  const bridgeUp = await waitForBridge();
  if (!bridgeUp) {
    console.error('[stack] Bridge failed to start after 30s');
    process.exit(1);
  }
  console.log('[stack] Bridge is up');

  // Start remaining components with 1s gaps
  for (const name of STACK.filter(n => n !== 'bridge')) {
    await new Promise(r => setTimeout(r, 1000));
    startComponent(name);
  }

  // Stack health display
  setInterval(() => {
    const running = Object.keys(components);
    const stopped = STACK.filter(n => !running.includes(n));
    if (stopped.length > 0) {
      console.log('[stack] ⚠ Stopped:', stopped.join(', '));
    }
  }, 10000);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[stack] SIGTERM — stopping all components');
    Object.values(components).forEach(c => { try { c.proc.kill('SIGTERM'); } catch {} });
    process.exit(0);
  });

  console.log('[stack] All components running. Ctrl+C to stop.');
}

main().catch(e => { console.error('[stack] Fatal:', e); process.exit(1); });
