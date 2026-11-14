/**
 * NEXUS Test Environment Runner
 * Manages PHP, MySQL, Apache, Redis sandboxes.
 * Wires into the bridge via /testenv endpoints.
 * Registered as service: node service/nsm.js start testenv
 */

'use strict';

const http   = require('http');
const https  = require('https');
const path   = require('path');
const fs     = require('fs');
const { spawn, execSync } = require('child_process');

const BRIDGE    = process.env.NEXUS_BRIDGE   || 'http://127.0.0.1:3747';
const PHP_VER   = process.env.TESTENV_PHP_VERSION || '8.3';
const AUTO_START = process.env.TESTENV_AUTO_START === 'true';

const SERVICES  = ['apache2', 'mysql', `php${PHP_VER}-fpm`, 'redis-server', 'mailhog'];
const SANDBOXES = {
  php:   { docroot: '/var/www/nexus-sandbox', port: 8081 },
  node:  { port: 8082 },
  mysql: { db: 'nexus_sandbox', user: 'nexus', pass: 'nexus_dev' },
};

let bridgeConnected = false;
const STATE = { services: {}, sandboxes: {}, startedAt: Date.now() };

// ── Bridge communication ───────────────────────────────────────────────────────

function bridgePost(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const url  = new URL(BRIDGE + path);
    const opts = {
      hostname: url.hostname, port: url.port || 3747,
      path: url.pathname, method: 'POST', timeout: 5000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.write(data); req.end();
  });
}

// ── Service detection ─────────────────────────────────────────────────────────

function checkService(name) {
  try {
    const r = execSync(`service ${name} status 2>&1 || sc query ${name} 2>&1`, { timeout: 3000, encoding: 'utf8' });
    return r.includes('running') || r.includes('active') || r.includes('RUNNING');
  } catch { return false; }
}

async function detectAll() {
  for (const svc of SERVICES) {
    STATE.services[svc] = { running: checkService(svc), lastCheck: Date.now() };
  }
  return STATE.services;
}

// ── Sandbox setup ─────────────────────────────────────────────────────────────

function setupPhpSandbox() {
  const docroot = SANDBOXES.php.docroot;
  if (!fs.existsSync(docroot)) {
    try {
      fs.mkdirSync(docroot, { recursive: true });
      fs.writeFileSync(path.join(docroot, 'index.php'), '<?php phpinfo(); ?>');
      console.log('[testenv] PHP sandbox docroot created:', docroot);
    } catch (e) {
      console.warn('[testenv] Could not create docroot:', e.message);
    }
  }
}

function setupNodeSandbox() {
  // Start a simple HTTP echo server for Node tests
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true, method: req.method, path: req.url,
        headers: req.headers, body: body ? body.slice(0, 500) : undefined,
        ts: Date.now(),
      }));
    });
  });
  server.listen(SANDBOXES.node.port, '127.0.0.1', () => {
    console.log('[testenv] Node sandbox listening on :' + SANDBOXES.node.port);
    STATE.sandboxes.node = { running: true, port: SANDBOXES.node.port };
  });
  server.on('error', (e) => {
    console.warn('[testenv] Node sandbox error:', e.message);
    STATE.sandboxes.node = { running: false, error: e.message };
  });
}

// ── Health reporting to bridge ─────────────────────────────────────────────────

async function reportToBridge() {
  const services = await detectAll();
  await bridgePost('/bus/emit', {
    type: 'testenv:health-report',
    ts: Date.now(),
    services,
    sandboxes: STATE.sandboxes,
    uptime: Math.floor((Date.now() - STATE.startedAt) / 1000),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[testenv] NEXUS Test Environment Runner starting...');
  console.log('[testenv] Bridge:', BRIDGE);
  console.log('[testenv] PHP:', PHP_VER, '| Auto-start:', AUTO_START);

  // Setup sandboxes
  setupPhpSandbox();
  setupNodeSandbox();

  // Initial service detection
  const services = await detectAll();
  console.log('[testenv] Services detected:', Object.entries(services)
    .map(([k,v]) => k + ':' + (v.running ? '✓' : '✗')).join(' '));

  // Auto-start services if configured
  if (AUTO_START) {
    for (const svc of SERVICES) {
      if (!services[svc]?.running) {
        console.log('[testenv] Auto-starting:', svc);
        await bridgePost('/testenv/service', { service: svc, action: 'start' });
      }
    }
  }

  // Report to bridge
  await reportToBridge();

  // Health check loop every 30s
  setInterval(reportToBridge, 30000);

  // Register with bridge pulse
  setInterval(async () => {
    await bridgePost('/pulse', {
      type: 'guardian:pulse',
      instanceId: 'testenv-' + require('os').hostname(),
      logicalId: 'testenv',
      ts: Date.now(),
      capabilities: ['php', 'mysql', 'apache', 'redis', 'node-sandbox'],
      version: '1.0.0',
    });
  }, 5000);

  console.log('[testenv] Ready. Reporting to bridge every 30s.');
}

main().catch(e => { console.error('[testenv] Fatal:', e); process.exit(1); });
