#!/usr/bin/env node
/**
 * NEXUS Service Manager (NSM)
 * A portable, powerful Windows service manager — no NSSM required.
 * Pure Node.js. Works with node-windows OR as a standalone watchdog.
 *
 * Features:
 *   — Install / uninstall / start / stop / restart as Windows service
 *   — Standalone watchdog mode (cross-platform)
 *   — Health-check based restart (not just process exit)
 *   — Log rotation (10MB, keep last 5)
 *   — Exponential backoff on crash (max 30s)
 *   — Grace period before forced kill
 *   — Status dashboard
 *   — Eventually: compile to .exe via pkg/nexe for standalone distribution
 *
 * Usage:
 *   node service/nexus-svc.js <command> [options]
 *
 * Commands:
 *   install     Install as Windows service + set autostart
 *   uninstall   Remove Windows service
 *   start       Start service (or watchdog if not installed)
 *   stop        Stop service / watchdog
 *   restart     Restart service
 *   status      Show service + bridge health
 *   watch       Run as watchdog process (no install required)
 *   logs        Tail bridge logs
 *   build-exe   Instructions for compiling to .exe
 *
 * Options:
 *   --port <n>       Bridge port (default: 3747)
 *   --data <path>    Data directory
 *   --autostart      Set Windows startup on install
 *   --hidden         Start Electron hidden to tray on autostart
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const { spawn, execSync } = require('child_process');
const os      = require('os');

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT         = path.join(__dirname, '..');
const BRIDGE_SCRIPT = path.join(ROOT, 'bridge', 'nexus-bridge-server.js');
const DATA_DIR     = process.env.DATA_DIR || path.join(ROOT, 'bridge', 'data');
const PROFILES_DIR = path.join(ROOT, 'profiles');
const LOG_DIR      = path.join(DATA_DIR, 'logs');
const LOG_FILE     = path.join(LOG_DIR, 'bridge.log');
const ERR_FILE     = path.join(LOG_DIR, 'bridge-error.log');
const PID_FILE     = path.join(DATA_DIR, 'bridge.pid');

// ── Args (must be before PORT) ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const cmd = args[0] || 'help';

// ── Resolve real node binary (never use process.execPath from Electron) ───────
// process.execPath inside an Electron packaged app = NEXUS.exe, not node.
// Spawning it with a .js script arg boots a full Electron instance.
function resolveNodeBin() {
  if (process.env.NEXUS_NODE_BIN) return process.env.NEXUS_NODE_BIN;
  // If we're already running under a real node (dev mode), use it
  const self = process.execPath;
  const selfBase = require('path').basename(self).toLowerCase();
  if (selfBase === 'node.exe' || selfBase === 'node') return self;
  // Packaged: search PATH and common locations
  const win = process.platform === 'win32';
  try {
    const found = require('child_process')
      .execSync(win ? 'where node' : 'which node', { encoding: 'utf8', timeout: 3000 })
      .trim().split(win ? '\r\n' : '\n')[0].trim();
    if (found && require('fs').existsSync(found)) return found;
  } catch(_) {}
  const candidates = win
    ? [
        require('path').join(process.env.ProgramFiles||'C:\\Program Files','nodejs','node.exe'),
        require('path').join(process.env['ProgramFiles(x86)']||'','nodejs','node.exe'),
        require('path').join(process.env.APPDATA||'','..','Local','Programs','node','node.exe'),
      ]
    : ['/usr/local/bin/node','/usr/bin/node','/opt/homebrew/bin/node'];
  for (const c of candidates) {
    try { if (require('fs').existsSync(c)) return c; } catch(_) {}
  }
  return 'node'; // last resort — let OS find it
}
const NODE_BIN = resolveNodeBin();

const PORT         = parseInt(process.env.NEXUS_PORT || getArg('--port') || '3747');
const SERVICE_NAME = 'NexusBridge';
const SERVICE_DESC = 'NEXUS Cognitive OS — Bridge Server';
const HEALTH_URL   = `http://127.0.0.1:${PORT}/health`;

// Watchdog config
const WATCHDOG = {
  healthInterval:  10000,   // ms between health checks
  restartDelay:    2000,    // initial restart delay ms
  maxRestartDelay: 30000,   // max backoff ms
  maxCrashes:      10,      // before giving up
  gracePeriod:     5000,    // ms to wait for clean shutdown before SIGKILL
  logMaxBytes:     10 * 1024 * 1024,  // 10MB log rotation
  logKeepCount:    5,       // rotated logs to keep
};


// ── Ensure dirs ───────────────────────────────────────────────────────────────

[DATA_DIR, LOG_DIR].forEach(d => { try { fs.mkdirSync(d, { recursive: true }); } catch {} });

// ── Health check ──────────────────────────────────────────────────────────────

function checkHealth(url, timeoutMs) {
  timeoutMs = timeoutMs || 3000;
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const body = JSON.parse(d);
          resolve({ alive: res.statusCode === 200 && body.ok, status: res.statusCode, version: body.version });
        } catch {
          resolve({ alive: res.statusCode === 200, status: res.statusCode });
        }
      });
    });
    req.on('error',   () => resolve({ alive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ alive: false }); });
  });
}

// ── Log writer ────────────────────────────────────────────────────────────────

function rotateLogs(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size < WATCHDOG.logMaxBytes) return;
    for (let i = WATCHDOG.logKeepCount - 1; i >= 1; i--) {
      const old = `${file}.${i}`;
      const next = `${file}.${i + 1}`;
      if (fs.existsSync(old)) fs.renameSync(old, next);
    }
    fs.renameSync(file, `${file}.1`);
    console.log(`[nsm] Log rotated: ${file}`);
  } catch {}
}

function appendLog(file, line) {
  try {
    rotateLogs(file);
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
}

// ── Watchdog (cross-platform) ─────────────────────────────────────────────────

let watchdogProc     = null;
let watchdogCrashes  = 0;
let watchdogDelay    = WATCHDOG.restartDelay;
let watchdogStopped  = false;
let watchdogHBTimer  = null;

function startWatchdog(silent) {
  if (watchdogStopped) return;
  if (watchdogCrashes >= WATCHDOG.maxCrashes) {
    console.error(`[nsm] Bridge crashed ${watchdogCrashes} times — giving up. Check ${ERR_FILE}`);
    appendLog(ERR_FILE, `FATAL: exceeded max crash count (${watchdogCrashes})`);
    process.exit(1);
  }

  const env = Object.assign({}, process.env, {
    NEXUS_PORT:   String(PORT),
    NEXUS_HOST:   '127.0.0.1',
    DATA_DIR,
    PROFILES_DIR,
  });

  const outStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  const errStream = fs.createWriteStream(ERR_FILE, { flags: 'a' });

  watchdogProc = spawn(NODE_BIN, [BRIDGE_SCRIPT], {
    cwd:   path.dirname(BRIDGE_SCRIPT),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  watchdogProc.stdout.pipe(outStream);
  watchdogProc.stderr.pipe(errStream);

  watchdogProc.stdout.on('data', (d) => {
    if (!silent) process.stdout.write('[bridge] ' + d.toString());
  });
  watchdogProc.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (s && !s.includes('Cannot find module')) process.stderr.write('[bridge:err] ' + s + '\n');
  });

  writePid(watchdogProc.pid);
  appendLog(LOG_FILE, `START pid=${watchdogProc.pid} crashes=${watchdogCrashes}`);

  if (!silent) {
    console.log(`[nsm] Bridge started  pid=${watchdogProc.pid}  port=${PORT}  crashes=${watchdogCrashes}`);

    // If bridge crashed and restarted, signal NEXUS to run diagnostics
    if (watchdogCrashes > 0) {
      const pidFile = path.join(ROOT, 'bridge', 'data', 'nexus-app.pid');
      if (fs.existsSync(pidFile)) {
        try {
          const nexusPid = JSON.parse(fs.readFileSync(pidFile,'utf8')).pid;
          if (nexusPid) {
            appendLog(LOG_FILE, '[watchdog] Bridge restarted after crash — signaling NEXUS diag');
            // Write a trigger file that NEXUS polls
            fs.writeFileSync(path.join(ROOT,'bridge','data','bridge-restart-trigger.json'),
              JSON.stringify({ts: Date.now(), crashes: watchdogCrashes, reason:'bridge-restart'}));
          }
        } catch(_) {}
      }
    }
  }

  // Start NEXUS crash monitor 15s after bridge starts (gives time for Electron to boot)
  setTimeout(startNexusCrashMonitor, 15000);

  watchdogProc.on('exit', (code, signal) => {
    clearInterval(watchdogHBTimer);
    clearPid();
    appendLog(ERR_FILE, `EXIT code=${code} signal=${signal} crashes=${watchdogCrashes}`);

    if (watchdogStopped) return;

    watchdogCrashes++;
    if (!silent) console.log(`[nsm] Bridge exited (${code}) — restarting in ${watchdogDelay}ms`);

    setTimeout(() => {
      watchdogDelay = Math.min(watchdogDelay * 2, WATCHDOG.maxRestartDelay);
      startWatchdog(silent);
    }, watchdogDelay);
  });

  // Health check loop
  watchdogHBTimer = setInterval(async () => {
    const h = await checkHealth(HEALTH_URL);
    if (!h.alive && watchdogProc && !watchdogStopped) {
      appendLog(ERR_FILE, `HEALTH_FAIL — killing and restarting`);
      if (!silent) console.log('[nsm] Health check failed — killing bridge process');
      watchdogProc.kill('SIGTERM');
    } else if (h.alive) {
      watchdogDelay = WATCHDOG.restartDelay; // reset backoff on healthy
      watchdogCrashes = 0; // reset crash count
    }
  }, WATCHDOG.healthInterval);
}

function stopWatchdog() {
  watchdogStopped = true;
  clearInterval(watchdogHBTimer);
  if (!watchdogProc) return Promise.resolve();
  return new Promise((resolve) => {
    const proc = watchdogProc;
    watchdogProc = null;
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, WATCHDOG.gracePeriod);
  });
}

// ── PID management ────────────────────────────────────────────────────────────

function writePid(pid) { try { fs.writeFileSync(PID_FILE, String(pid)); } catch {} }
function clearPid()    { try { fs.unlinkSync(PID_FILE); } catch {} }
function readPid()     { try { return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim()); } catch { return null; } }

function isProcessAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ── Windows service ───────────────────────────────────────────────────────────

function getNodeWindowsSvc() {
  try {
    const { Service } = require('node-windows');
    return new Service({
      name:        SERVICE_NAME,
      description: SERVICE_DESC,
      script:      BRIDGE_SCRIPT,
      env: [
        { name: 'NEXUS_PORT',   value: String(PORT) },
        { name: 'DATA_DIR',     value: DATA_DIR },
        { name: 'PROFILES_DIR', value: PROFILES_DIR },
      ],
    });
  } catch {
    return null;
  }
}

function scQuery(name) {
  try {
    const r = execSync(`sc query ${name} 2>&1`, { encoding: 'utf8', timeout: 5000 });
    if (r.includes('RUNNING')) return 'running';
    if (r.includes('STOPPED')) return 'stopped';
    if (r.includes('does not exist')) return 'not-installed';
    return 'unknown';
  } catch { return 'not-installed'; }
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdStatus() {
  console.log('\n── NEXUS Service Manager Status ──');
  console.log(`  Platform:  ${os.platform()} ${os.release()}`);
  console.log(`  Node:      ${process.version}`);
  console.log(`  Bridge:    ${BRIDGE_SCRIPT}`);
  console.log(`  Port:      ${PORT}`);
  console.log(`  Data:      ${DATA_DIR}`);
  console.log(`  Log:       ${LOG_FILE}`);

  // Bridge health
  const h = await checkHealth(HEALTH_URL, 2000);
  console.log(`  Health:    ${h.alive ? '● LIVE v' + (h.version || '?') : '○ OFFLINE'}`);

  // PID file
  const pid = readPid();
  if (pid) {
    const alive = isProcessAlive(pid);
    console.log(`  PID:       ${pid} (${alive ? 'alive' : 'dead — stale PID file'})`);
    if (!alive) clearPid();
  } else {
    console.log(`  PID:       none`);
  }

  // Windows service
  if (os.platform() === 'win32') {
    const sc = scQuery(SERVICE_NAME);
    console.log(`  Service:   ${sc}`);
  }

  console.log('');
}


// ── NEXUS App Crash Monitor (module-level, called by both watch and cmdWatch) ──
const _NEXUS_PID_FILE  = require('path').join(ROOT, 'bridge', 'data', 'nexus-app.pid');
const _CRASH_LOG_FILE  = require('path').join(ROOT, 'bridge', 'data', 'nexus-crash.log');
let _nexusMonitorTimer = null;
let _crashPromptActive = false;

function startNexusCrashMonitor() {
  if (_nexusMonitorTimer) return; // already running
  _nexusMonitorTimer = setInterval(function() {
    try {
      if (!fs.existsSync(_NEXUS_PID_FILE)) return;
      var data;
      try { data = JSON.parse(fs.readFileSync(_NEXUS_PID_FILE, 'utf8')); } catch(_) { return; }
      var pid = data && data.pid;
      if (!pid) return;
      try {
        process.kill(pid, 0); // 0 = check existence, throws ESRCH if dead
      } catch(e) {
        if (e.code !== 'ESRCH') return;
        // Grace: don't fire if PID file written < 20s ago (race on startup)
        var age = Date.now() - (data.started || 0);
        if (age < 20000) return;
        clearInterval(_nexusMonitorTimer); _nexusMonitorTimer = null;
        if (_crashPromptActive) return;
        _crashPromptActive = true;
        appendLog(LOG_FILE, '[crash-monitor] NEXUS pid=' + pid + ' gone — crash detected');
        var nexusExe     = data.exe || require('path').join(require('path').dirname(ROOT), 'NEXUS.exe');
        var promptScript = require('path').join(__dirname, 'crash-prompt.js');
        if (fs.existsSync(promptScript)) {
          var prompt = require('child_process').spawn(NODE_BIN, [
            promptScript, '--exe', nexusExe, '--log', _CRASH_LOG_FILE,
          ], { detached: true, stdio: 'ignore' });
          prompt.unref();
          prompt.on('exit', function() { _crashPromptActive = false; });
        }
      }
    } catch(_) {}
  }, 3000);
}

async function cmdWatch() {
  const silent = args.includes('--silent');
  if (!silent) {
    console.log(`[nsm] Starting watchdog for NEXUS Bridge on port ${PORT}`);
    console.log(`[nsm] Logs: ${LOG_FILE}`);
    console.log(`[nsm] Ctrl+C to stop\n`);
  }

  process.on('SIGINT', async () => {
    if (!silent) console.log('\n[nsm] Stopping...');
    await stopWatchdog();
    clearPid();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopWatchdog();
    clearPid();
    process.exit(0);
  });

  // When spawned by main.js (--silent), the bridge is ALREADY running.
  // Don't spawn a second bridge — just monitor the NEXUS app PID.
  if (silent) {
    const already = await checkHealth(HEALTH_URL, 2000);
    if (already.alive) {
      appendLog(LOG_FILE, '[watchdog] Bridge already running — monitoring only (no respawn)');
      // Start only the NEXUS crash monitor, not the bridge watchdog
      startNexusCrashMonitor();
      return;
    }
  }

  // Not already running (standalone use) — spawn and manage the bridge
  startWatchdog(silent);
}

function cmdInstall() {
  if (os.platform() !== 'win32') {
    console.log('[nsm] Windows service install requires Windows.');
    console.log('[nsm] Use "node service/nexus-svc.js watch" on non-Windows.');
    return;
  }

  const svc = getNodeWindowsSvc();
  if (!svc) {
    console.error('[nsm] node-windows not available.');
    console.error('  Run: npm install -g node-windows && npm link node-windows');
    console.error('  Or use watchdog mode: node service/nexus-svc.js watch');
    process.exit(1);
  }

  const autostart = args.includes('--autostart');
  svc.on('install', () => {
    console.log('[nsm] ✓ Service installed');
    if (autostart) {
      try {
        execSync(`sc config ${SERVICE_NAME} start= auto`, { encoding: 'utf8' });
        console.log('[nsm] ✓ Set to autostart at boot');
      } catch (e) {
        console.warn('[nsm] Could not set autostart (run as admin):', e.message);
      }
    }
    svc.start();
  });
  svc.on('start',   () => console.log(`[nsm] ✓ ${SERVICE_NAME} started — http://127.0.0.1:${PORT}`));
  svc.on('error',   e  => console.error('[nsm] Error:', e));
  svc.install();
}

function cmdUninstall() {
  if (os.platform() !== 'win32') { console.log('[nsm] Not on Windows'); return; }
  const svc = getNodeWindowsSvc();
  if (!svc) { console.error('[nsm] node-windows not available'); return; }
  svc.on('uninstall', () => console.log('[nsm] ✓ Service uninstalled'));
  svc.uninstall();
}

async function cmdStop() {
  const pid = readPid();
  if (pid && isProcessAlive(pid)) {
    console.log(`[nsm] Stopping bridge pid=${pid}...`);
    try { process.kill(pid, 'SIGTERM'); } catch {}
    await new Promise(r => setTimeout(r, WATCHDOG.gracePeriod));
    if (isProcessAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
      console.log('[nsm] Force-killed');
    } else {
      console.log('[nsm] ✓ Stopped');
    }
    clearPid();
  } else {
    console.log('[nsm] Bridge not running (no PID)');
  }

  if (os.platform() === 'win32') {
    try { execSync(`sc stop ${SERVICE_NAME}`, { encoding: 'utf8' }); console.log('[nsm] ✓ Service stopped'); }
    catch {}
  }
}

async function cmdRestart() {
  await cmdStop();
  await new Promise(r => setTimeout(r, 1000));
  cmdWatch();
}

async function cmdLogs() {
  if (!fs.existsSync(LOG_FILE)) { console.log('[nsm] No log file yet'); return; }
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lines   = content.split('\n').filter(Boolean);
  const last100 = lines.slice(-100).join('\n');
  console.log(last100);
}

function cmdBuildExe() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  NEXUS Service Manager — Compile to .exe                 ║
╚══════════════════════════════════════════════════════════╝

The NSM can be compiled to a standalone .exe using:

1. pkg (Vercel):
   npm install -g pkg
   pkg service/nexus-svc.js --target node18-win-x64 --output dist/nexus-svc.exe

2. nexe:
   npm install -g nexe
   nexe service/nexus-svc.js -o dist/nexus-svc.exe

3. Node SEA (Node 21+, no npm required):
   node --experimental-sea-config service/sea-config.json
   (see docs/SEA-BUILD.md for full instructions)

Once compiled, users can install the bridge as a service with:
   nexus-svc.exe install --autostart

The compiler in NEXUS Forge IDE can target this:
   Build target: "Windows Service (.exe)"
   → runs pkg internally, bundles Node runtime
   → outputs installer-ready nexus-svc.exe to dist/

This is registered as Phase 10B in the NEXUS roadmap.
`);
}

function cmdHelp() {
  console.log(`
NEXUS Service Manager (nsm) v0.41.0
  watch      Run bridge as watched process (cross-platform, recommended dev)
  install    Install as Windows service  [--autostart]
  uninstall  Remove Windows service
  start      Start bridge / service
  stop       Stop bridge / service  
  restart    Stop then start
  status     Show health, PID, service state
  logs       Tail last 100 log lines
  build-exe  Instructions for compiling to standalone .exe

Examples:
  node service/nexus-svc.js watch           # dev: watchdog in foreground
  node service/nexus-svc.js install --autostart  # prod: Windows service at boot
  node service/nexus-svc.js status          # check everything
  `);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

(async () => {
  switch (cmd) {
    case 'watch':     await cmdWatch();     break;
    case 'install':   cmdInstall();         break;
    case 'uninstall': cmdUninstall();       break;
    case 'start':     await cmdWatch();     break;
    case 'stop':      await cmdStop();      break;
    case 'restart':   await cmdRestart();   break;
    case 'status':    await cmdStatus();    break;
    case 'logs':      await cmdLogs();      break;
    case 'build-exe': cmdBuildExe();        break;
    default:          cmdHelp();            break;
  }
})().catch(e => { console.error('[nsm] Fatal:', e.message); process.exit(1); });
