'use strict';
// service/cortex-service.js — Cortex ICO Kernel Service
// UUID: nexus-cortex-service-v1-0000-4000-0000-000000000001
//
// Boots cortex as an ICO kernel instance.
// Usage:
//   node service/cortex-service.js          — start
//   node service/cortex-service.js status   — check
//   node service/cortex-service.js stop     — stop

const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const { createICO }      = require('../lib/ico');
const { createBaseline } = require('../intelligence/baseline');
const { createQueue }    = require('../lib/queue');

const ROOT     = path.join(__dirname, '..');
const PORT     = 3748;
const PID_FILE = path.join(ROOT, 'data/cortex/cortex.pid');
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
  fs.mkdirSync(path.join(ROOT, 'data/cortex'), { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  const ico = createICO({
    name: 'cortex',
    root: path.join(ROOT, 'data/cortex'),
  });

  const baseline = createBaseline({
    name:           'cortex',
    ledgerDir:      path.join(ROOT, 'data/cortex/ledger'),
    failuresDir:    path.join(ROOT, 'data/cortex/failures'),
    invariantDir:   path.join(ROOT, 'data/cortex/invariant'),
    baselineN:      20,
    sigmaThreshold: 0.3,
    onGap: (gap) => {
      ico.ledger.append('gaps', { ...gap, ts: Date.now() });
      console.log(`[cortex-service] GAP: ${gap.type} sigma=${gap.sigma}`);
    },
  });

  const queue = createQueue({
    inputDir:    path.join(ROOT, 'data/cortex/input'),
    outputDir:   path.join(ROOT, 'data/cortex/output'),
    failuresDir: path.join(ROOT, 'data/cortex/failures'),
    logsDir:     path.join(ROOT, 'data/cortex/conversations'),
    queueDir:    path.join(ROOT, 'data/cortex/queue'),
  });

  const replayed = queue.replay();
  if (replayed.length) console.log(`[cortex-service] replayed ${replayed.length} queue items`);

  ico.ledger.append('boot', { type: 'service.start', pid: process.pid, ts: Date.now() });
  require('../cortex/boot.js');

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

  console.log(`[cortex-service] started pid=${process.pid} port=${PORT}`);
}
