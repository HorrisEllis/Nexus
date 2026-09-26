'use strict';
// service/idearium-service.js — Idearium ICO Kernel Service
// UUID: nexus-idearium-service-v1-0000-4000-0000-000000000001
//
// Boots idearium as an ICO kernel instance.
// Usage:
//   node service/idearium-service.js          — start
//   node service/idearium-service.js status   — check
//   node service/idearium-service.js stop     — stop

const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const { createICO }      = require('../lib/ico');
const { createBaseline } = require('../intelligence/baseline');
const { createQueue }    = require('../lib/queue');

const ROOT     = path.join(__dirname, '..');
const PORT     = 4800;
const PID_FILE = path.join(ROOT, 'data/idearium/idearium.pid');
const cmd      = process.argv[2];

if      (cmd === 'status') checkStatus();
else if (cmd === 'stop')   stopService();
else                       startService();

function checkStatus() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(1); }
  const pid = parseInt(fs.readFileSync(PID_FILE,'utf8').trim());
  try {
    process.kill(pid, 0);
    const req = http.get(`http://127.0.0.1:${PORT}/api/health`, { timeout:2000 }, res => {
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>{
        console.log(`RUNNING pid=${pid} status=${res.statusCode}`); process.exit(0);
      });
    });
    req.on('error',()=>{ console.log(`RUNNING pid=${pid} (port not responding)`); process.exit(0); });
  } catch { fs.unlinkSync(PID_FILE); console.log('NOT RUNNING (stale pid)'); process.exit(1); }
}

function stopService() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(0); }
  const pid = parseInt(fs.readFileSync(PID_FILE,'utf8').trim());
  try { process.kill(pid, 'SIGTERM'); console.log(`SIGTERM -> pid=${pid}`); }
  catch { console.log('Failed to stop'); }
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(0);
}

function startService() {
  fs.mkdirSync(path.join(ROOT, 'data/idearium'), { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  const ico = createICO({
    name: 'idearium',
    root: path.join(ROOT, 'data/idearium'),
  });

  const baseline = createBaseline({
    name:           'idearium',
    ledgerDir:      path.join(ROOT, 'data/idearium/ledger'),
    failuresDir:    path.join(ROOT, 'data/idearium/failures'),
    invariantDir:   path.join(ROOT, 'data/idearium/invariant'),
    baselineN:      20,
    sigmaThreshold: 0.3,
    onGap: (gap) => {
      ico.ledger.append('gaps', { ...gap, ts: Date.now() });
      console.log(`[idearium-service] GAP: ${gap.type} sigma=${gap.sigma}`);
    },
  });

  const queue = createQueue({
    inputDir:    path.join(ROOT, 'data/idearium/input'),
    outputDir:   path.join(ROOT, 'data/idearium/output'),
    failuresDir: path.join(ROOT, 'data/idearium/failures'),
    logsDir:     path.join(ROOT, 'data/idearium/conversations'),
    queueDir:    path.join(ROOT, 'data/idearium/queue'),
  });

  const replayed = queue.replay();
  if (replayed.length) console.log(`[idearium-service] replayed ${replayed.length} queue items`);

  ico.ledger.append('boot', { type: 'service.start', pid: process.pid, ts: Date.now() });
  require('../idearium/api/index.js');

  setInterval(() => {
    baseline.observe({ type: 'heartbeat', latencyMs: 0, error: false });
    ico.ledger.append('heartbeat', { type: 'heartbeat', friction: baseline.friction(),
      uptime: process.uptime(), ts: Date.now() });
  }, 30000).unref();

  process.on('SIGTERM', () => {
    ico.ledger.append('boot', { type: 'service.stop', reason: 'SIGTERM', ts: Date.now() });
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });
  process.on('SIGINT', () => {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });

  console.log(`[idearium-service] started pid=${process.pid} port=${PORT}`);
}
