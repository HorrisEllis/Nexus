#!/usr/bin/env node
'use strict';
/**
 * cli/boot-systems.js — NEXUS Per-System Boot Sequencer
 * UUID: nexus-boot-systems-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Extracted from orchestrator.js so diagnose logic lives in one place.
 * Orchestrator calls:
 *   const { _bootSystems } = require('./cli/boot-systems');
 *   setTimeout(() => _bootSystems(ledgerWrite, PORT, connectBridgeSSE, _eventLedger), 500);
 *
 * Responsibilities:
 *   - Spawn each sub-system in order
 *   - Poll health endpoint until up or timeout (15s)
 *   - On failure: spawn cli/diagnose.js, write result to ledger
 *   - Kick hourly invariant scan + bridge registration
 *
 * Fixes carried forward from orchestrator.js:
 *   ORC-08  _waitForHealth: always destroy socket after use to prevent pool exhaustion
 *   ORC-08  explicit r.destroy() on both success and error paths
 *
 * §AXIOM: boot order — bridge → cortex → guardian → idearium → emerge.
 */

const path      = require('path');
const http      = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIAG = path.join(ROOT, 'cli', 'diagnose.js');

// ── Health probe ──────────────────────────────────────────────────────────────

/**
 * _waitForHealth — poll a system's health endpoint until it responds or times out.
 * ORC-08: always destroy socket after use to avoid pool exhaustion.
 *
 * @param {string} systemId
 * @param {number} port
 * @param {string} healthPath
 * @param {number} maxWaitMs
 * @returns {Promise<boolean>}
 */
async function _waitForHealth(systemId, port, healthPath, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const ok = await new Promise(resolve => {
        const chunks = [];
        // ORC-08: always destroy socket after use to avoid pool exhaustion
        const r = http.get(`http://127.0.0.1:${port}${healthPath}`, res => {
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            r.destroy(); // ORC-08: explicit cleanup on success path
            const d = Buffer.concat(chunks).toString('utf8');
            try { const j = JSON.parse(d); resolve(res.statusCode === 200 && (j.ok !== false)); }
            catch (_) { resolve(res.statusCode === 200); }
          });
        });
        r.setTimeout(2000, () => { r.destroy(); resolve(false); });
        r.on('error', () => { r.destroy(); resolve(false); });
      });
      if (ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

// ── Single-system boot + diagnose-on-fail ─────────────────────────────────────

/**
 * _bootOneSys — spawn a system, wait for health, diagnose on failure.
 *
 * @param {object} opts    { systemId, port, cmd, args, healthPath, label }
 * @param {function} ledgerWrite
 * @param {number} orchPort
 * @returns {Promise<{ok, proc, diagPass?, diagFail?}>}
 */
async function _bootOneSys({ systemId, port, cmd, args, healthPath, label, extraEnv }, ledgerWrite, orchPort) {
  console.log(`\n\x1b[90m[boot-systems] starting ${label}…\x1b[0m`);
  ledgerWrite('orchestrator', 'orchestrator.system.starting', { systemId, port, cmd });

  const proc = spawn(process.execPath, [cmd, ...args], {
    detached: false,
    stdio: 'inherit',
    env: { ...process.env, ORCHESTRATOR_PORT: String(orchPort), ...(extraEnv || {}) },
  });
  proc.on('error', err => {
    ledgerWrite('orchestrator', 'orchestrator.system.spawn.error', { systemId, error: err.message });
  });

  const up = await _waitForHealth(systemId, port, healthPath);

  if (up) {
    console.log(`\x1b[32m  ✓ ${label} healthy on :${port}\x1b[0m`);
    ledgerWrite('orchestrator', `${systemId}.system.online`, { systemId, port });
    return { ok: true, proc };
  }

  // System failed — spawn cli/diagnose.js in a NEW terminal window
  console.error(`\x1b[31m  ✗ ${label} did not come up within 15s\x1b[0m`);
  ledgerWrite('orchestrator', 'orchestrator.system.failed', { systemId, port });
  console.log(`\x1b[36m  → opening diagnose window for ${systemId}…\x1b[0m`);

  // Spawn diagnose in a new terminal so the main boot log stays readable.
  // Windows: cmd /c start; macOS: open -a Terminal; Linux: x-terminal-emulator / xterm fallback.
  const isWin  = process.platform === 'win32';
  const isMac  = process.platform === 'darwin';
  let diagProc;
  try {
    if (isWin) {
      // Use powershell to open a new window — avoids cmd /c start title-quoting bugs on Windows
      const diagCmd = `node "${DIAG}" ${systemId}`;
      diagProc = spawn('powershell', [
        '-NoExit', '-Command', diagCmd,
      ], { detached: true, stdio: 'ignore', shell: false });
    } else if (isMac) {
      const script = `tell application "Terminal" to do script "node '${DIAG}' ${systemId}"`;
      diagProc = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    } else {
      // Linux: try common terminal emulators in order
      const terms = ['x-terminal-emulator', 'gnome-terminal', 'xfce4-terminal', 'xterm'];
      const term  = terms[0]; // x-terminal-emulator covers most distros
      diagProc = spawn(term, ['-e', `node "${DIAG}" ${systemId}`], {
        detached: true, stdio: 'ignore',
      });
    }
    diagProc?.unref(); // don't hold the event loop
  } catch(e) {
    console.warn(`\x1b[33m  [diagnose] could not open terminal window: ${e.message}\x1b[0m`);
    console.warn(`\x1b[33m  run manually: node cli/diagnose.js ${systemId}\x1b[0m`);
  }

  ledgerWrite('orchestrator', `${systemId}.diagnose.window.opened`, { systemId, ts: Date.now() });
  return { ok: false, proc, diagPass: 0, diagFail: 0 };
}

// ── Full boot sequence ────────────────────────────────────────────────────────

/**
 * _bootSystems — start all sub-systems in order.
 *
 * @param {function} ledgerWrite        — orchestrator's ledgerWrite(system, type, payload)
 * @param {number}   orchPort           — orchestrator's own port (passed to sub-systems via env)
 * @param {object}   [_eventLedger]     — event ledger ref for hourly invariant scan
 */
async function _bootSystems(ledgerWrite, orchPort, connectBridgeSSE, _eventLedger) {
  const systems = [
    {
      systemId: 'bridge',    port: 9999, healthPath: '/health',
      label: 'Bridge',       cmd: path.join(ROOT, 'bridge', 'index.js'),             args: [],
      // §AXIOM: bridge boots first — all other systems register through it
    },
    {
      systemId: 'cortex',    port: 3748, healthPath: '/health',
      label: 'Cortex',       cmd: path.join(ROOT, 'cortex', 'boot.js'),              args: [],
    },
    {
      systemId: 'guardian',  port: 7820, healthPath: '/health',
      label: 'Guardian',     cmd: path.join(ROOT, 'guardian', 'server.js'),          args: [],
    },
    {
      systemId: 'idearium',  port: 4800, healthPath: '/health',
      label: 'Idearium',     cmd: path.join(ROOT, 'idearium', 'api', 'index.js'),    args: [],
      // Idearium is internal-only — no LAN/remote exposure. The orchestrator
      // (:9000) is the sole gateway for outside access.
    },
    {
      systemId: 'architect', port: 3747, healthPath: '/health',
      label: 'Architect',    cmd: path.join(ROOT, 'architect', 'service.js'),        args: [],
    },
    {
      systemId: 'emerge',    port: 4242, healthPath: '/status',
      label: 'Emerge IDE',   cmd: path.join(ROOT, 'emerge', 'emerge-ide.js'),                  args: [],
    },
    {
      systemId: 'diagnostic', port: 7825, healthPath: '/status',
      label: 'Diagnostic',    cmd: path.join(ROOT, 'diagnostic', 'nexus-diagnostic.js'), args: [],
      // §MONITOR: boots last — needs all other systems running to monitor them
    },
  ];

  console.log('\n\x1b[1m\x1b[36m── Boot-systems: starting sub-systems one by one ──\x1b[0m');
  ledgerWrite('orchestrator', 'orchestrator.systems.sequence.started', {
    systems: systems.map(s => s.systemId), ts: Date.now(),
  });

  const results = [];
  for (const sys of systems) {
    const r = await _bootOneSys(sys, ledgerWrite, orchPort);
    results.push({ ...sys, ...r });
    await new Promise(res => setTimeout(res, 800)); // brief pause between systems
  }

  const up   = results.filter(r => r.ok).length;
  const down = results.filter(r => !r.ok).length;
  console.log(`\n\x1b[1m\x1b[36m── Systems sequence complete: ${up}/${results.length} online\x1b[0m`);
  if (down > 0) {
    console.log(`\x1b[33m  ${down} system(s) degraded — check diagnose output above\x1b[0m`);
  }
  ledgerWrite('orchestrator', 'orchestrator.systems.sequence.complete', {
    up, down, total: results.length, ts: Date.now(),
  });

  // Connect bridge SSE relay
  if (typeof connectBridgeSSE === 'function') {
    setTimeout(connectBridgeSSE, 1000);
  }

  // Hourly invariant scan — the ledger IS the learning system
  if (_eventLedger) {
    setInterval(() => {
      try {
        const invariants = _eventLedger.scanInvariants(5000);
        const baselines  = _eventLedger.getAllBaselines();
        const stats      = _eventLedger.getAllStats();
        ledgerWrite('orchestrator', 'orchestrator.invariants.scanned', {
          eventTypes:        Object.keys(stats).length,
          baselineTypes:     Object.keys(baselines).length,
          topCoOccurrences:  Object.entries(invariants.coOccurrences || {})
            .sort(([, a], [, b]) => b - a).slice(0, 10)
            .map(([pair, count]) => ({ pair, count })),
          failurePrecursors: Object.entries(invariants.failurePrecursors || {})
            .sort(([, a], [, b]) => b - a).slice(0, 5)
            .map(([type, count]) => ({ type, count })),
          eventCount: invariants.eventCount,
          ts: Date.now(),
        });
      } catch (e) {
        ledgerWrite('orchestrator', 'orchestrator.invariants.scan.error', { error: e.message });
      }
    }, 3600000).unref();
  }

  // Bridge registration
  setTimeout(async () => {
    try {
      const nc = require('../nexus/nexus-connect');
      const r = await nc._req('orchestrator', 'POST', '/api/register', {
        systemId: 'orchestrator', appId: 'orchestrator',
        secret: 'nexus-orchestrator-internal-v1',
      }, 4000);
      if (r.ok) {
        await nc.postBridge('orchestrator.booted', { version: '2.0.0', port: orchPort });
      }
    } catch (_) {}
  }, 2000);

  return results;
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = { _waitForHealth, _bootOneSys, _bootSystems };
