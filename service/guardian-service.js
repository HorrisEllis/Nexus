'use strict';
// service/guardian-service.js — Guardian ICO Kernel Service
// UUID: nexus-guardian-service-v1-0000-4000-0000-000000000001
//
// Boots the guardian HTTP server as an ICO kernel instance.
// Every lifecycle event written to data/guardian/ledger/.
// Exposes clean start/stop/health/status.
//
// Usage:
//   node service/guardian-service.js          — start service
//   node service/guardian-service.js status   — check running service
//   node service/guardian-service.js stop     — stop running service

const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const { createICO }      = require('../lib/ico');
const { createBaseline } = require('../intelligence/baseline');
const { createQueue }    = require('../lib/queue');

const ROOT    = path.join(__dirname, '..');
const PID_FILE = path.join(ROOT, 'data/guardian/guardian.pid');

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const cmd = process.argv[2];

if (cmd === 'status') {
  checkStatus();
} else if (cmd === 'stop') {
  stopService();
} else {
  startService();
}

// ── Check status ──────────────────────────────────────────────────────────────

function checkStatus() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('[guardian-service] NOT RUNNING (no pid file)');
    process.exit(1);
  }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
  try {
    process.kill(pid, 0); // check if process exists
    // Also ping /health
    const req = http.get('http://127.0.0.1:7820/health', { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          console.log(`[guardian-service] RUNNING pid=${pid} uptime=${Math.round(d.uptime||0)}s jobs=${d.jobs||0}`);
          process.exit(0);
        } catch {
          console.log(`[guardian-service] RUNNING pid=${pid} (health parse failed)`);
          process.exit(0);
        }
      });
    });
    req.on('error', () => {
      console.log(`[guardian-service] pid=${pid} exists but :7820 not responding`);
      process.exit(1);
    });
  } catch {
    fs.unlinkSync(PID_FILE);
    console.log('[guardian-service] NOT RUNNING (stale pid)');
    process.exit(1);
  }
}

// ── Stop service ──────────────────────────────────────────────────────────────

function stopService() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('[guardian-service] NOT RUNNING');
    process.exit(0);
  }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[guardian-service] SIGTERM sent to pid=${pid}`);
    fs.unlinkSync(PID_FILE);
    process.exit(0);
  } catch {
    console.log(`[guardian-service] Failed to stop pid=${pid} (not running?)`);
    fs.unlinkSync(PID_FILE);
    process.exit(1);
  }
}

// ── Start service ─────────────────────────────────────────────────────────────

function startService() {
  // Write PID file
  fs.mkdirSync(path.join(ROOT, 'data/guardian'), { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  // Boot the ICO kernel for guardian
  const ico = createICO({
    name:        'guardian',
    root:        path.join(ROOT, 'data/guardian'),
    compartment: path.join(__dirname, '../guardian/compartment.js'),
  });

  // Register custom axioms from spec
  ico.registerAxiom({
    name:      '§LAW_II-no-in-memory-only',
    rule:      (d) => d !== null && d !== undefined,
    violation: '§LAW_II: null signal — state must be persisted, not in-memory-only',
  });

  // Bootstrap the baseline monitor on the ICO instance
  const baseline = createBaseline({
    name:           'guardian',
    ledgerDir:      path.join(ROOT, 'data/guardian/ledger'),
    failuresDir:    path.join(ROOT, 'data/guardian/failures'),
    invariantDir:   path.join(ROOT, 'data/guardian/invariant'),
    baselineN:      20,
    sigmaThreshold: 0.3,
  });

  // Physical queue
  const queue = createQueue({
    inputDir:    path.join(ROOT, 'data/guardian/input'),
    outputDir:   path.join(ROOT, 'data/guardian/output'),
    failuresDir: path.join(ROOT, 'data/guardian/failures'),
    logsDir:     path.join(ROOT, 'data/guardian/conversations'),
    queueDir:    path.join(ROOT, 'data/guardian/queue'),
  });

  // Replay any interrupted queue items from before restart
  const replayed = queue.replay();
  if (replayed.length > 0) {
    ico.ledger.append('boot', { type: 'queue.replay', count: replayed.length, ts: Date.now() });
    console.log(`[guardian-service] replayed ${replayed.length} interrupted queue items`);
  }

  // Log boot to ledger
  ico.ledger.append('boot', {
    type:    'service.start',
    pid:     process.pid,
    version: '3.5.0',
    ts:      Date.now(),
  });

  // Now boot the guardian HTTP server
  // We pass the ICO instance, baseline, and queue to the server
  process.env.GUARDIAN_ICO_ROOT   = path.join(ROOT, 'data/guardian');
  process.env.GUARDIAN_SERVICE    = '1';

  // Boot guardian server (it handles its own http.createServer)
  require('../guardian/server.js');

  // Feed server events into ICO pipe for SNR/baseline
  process.on('uncaughtException', (err) => {
    ico.ledger.append('errors', { type: 'uncaught', error: err.message, stack: err.stack, ts: Date.now() });
    baseline.logFailure({ id: 'uncaught-exception', error: err.message, friction: 1.0 });
    console.error('[guardian-service] UNCAUGHT:', err.message);
    // §1.2 — don't silently die, but do restart after brief delay
    setTimeout(() => {
      fs.writeFileSync(PID_FILE, String(process.pid));
    }, 1000);
  });

  process.on('SIGTERM', () => {
    ico.ledger.append('boot', { type: 'service.stop', reason: 'SIGTERM', ts: Date.now() });
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    console.log('[guardian-service] SIGTERM — shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    ico.ledger.append('boot', { type: 'service.stop', reason: 'SIGINT', ts: Date.now() });
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });

  // Heartbeat — write service health every 30s
  setInterval(() => {
    const stats = baseline.stats();
    ico.ledger.append('heartbeat', {
      type:     'service.heartbeat',
      friction: stats.friction,
      sigma:    stats.sigma,
      uptime:   process.uptime(),
      memory:   process.memoryUsage().heapUsed,
      ts:       Date.now(),
    });

    // Feed into baseline monitor
    baseline.observe({ type: 'heartbeat', latencyMs: 0, error: false });
  }, 30000).unref();

  console.log(`[guardian-service] started pid=${process.pid}`);
  console.log(`[guardian-service] ICO kernel: data/guardian/`);
  console.log(`[guardian-service] HTTP: :7820`);
}
