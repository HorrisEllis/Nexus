'use strict';
// service/bridge-service.js — Bridge Service Wrapper
// UUID: nexus-bridge-service-v1-0000-4000-0000-000000000001
//
// Thin wrapper that boots bridge/index.js as a managed service.
// Usage:
//   node service/bridge-service.js          — start
//   node service/bridge-service.js status   — check
//   node service/bridge-service.js stop     — stop

const path = require('path');
const fs   = require('fs');
const http = require('http');

const ROOT     = path.join(__dirname, '..');
const PORT     = parseInt(process.env.BRIDGE_PORT || '9999');
const PID_FILE = path.join(ROOT, 'data/bridge/bridge.pid');
const cmd      = process.argv[2];

if      (cmd === 'status') checkStatus();
else if (cmd === 'stop')   stopService();
else                       startService();

function checkStatus() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(1); }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
  try {
    process.kill(pid, 0);
    const req = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 2000 }, res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => {
        console.log(`RUNNING pid=${pid} status=${res.statusCode}`); process.exit(0);
      });
    });
    req.on('error', () => { console.log(`RUNNING pid=${pid} (port not responding)`); process.exit(0); });
  } catch { fs.unlinkSync(PID_FILE); console.log('NOT RUNNING (stale pid)'); process.exit(1); }
}

function stopService() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(0); }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
  try { process.kill(pid, 'SIGTERM'); console.log(`SIGTERM -> pid=${pid}`); }
  catch { console.log('Failed to stop'); }
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(0);
}

function startService() {
  fs.mkdirSync(path.join(ROOT, 'data/bridge'), { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  process.on('SIGTERM', () => {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });
  process.on('SIGINT', () => {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });

  console.log(`[bridge-service] starting bridge/index.js pid=${process.pid}`);
  // Delegate to canonical bridge boot
  require('../bridge/index.js');
}
