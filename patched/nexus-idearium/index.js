#!/usr/bin/env node
'use strict';
// ── start.js — NEXUS Systems boot entry point ─────────────────────────────────
// Run this from the NEXUS-Systems-v1 root:
//
//   node start.js              ← starts Idearium API at :4800
//   node start.js --open       ← starts API + opens systems-ui.html in browser
//   node start.js --status     ← check what's running
//
// Everything else runs through the unified CLI:
//   node nexus.js help
//   node nexus.js idea add "my idea"
//   node nexus.js push "commit message"
//   node nexus.js vortex status

const http     = require('http');
const path     = require('path');
const fs       = require('fs');
const { execSync, spawn } = require('child_process');

const ROOT     = __dirname;
const API_PORT = parseInt(process.env.IDEARIUM_PORT || '4800');

const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', cyan:'\x1b[36m', gray:'\x1b[90m', teal:'\x1b[36m',
};
const c = (col, t) => `${C[col]||''}${t}${C.reset}`;
const ts = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; };
const log = (msg) => console.log(`${c('gray',`[${ts()}]`)} ${msg}`);
const ok  = (msg) => console.log(`${c('green','✓')} ${msg}`);
const err = (msg) => console.error(`${c('red','✗')} ${msg}`);
const inf = (msg) => console.log(`${c('blue','i')} ${msg}`);

const args = process.argv.slice(2);

// ── Status check ──────────────────────────────────────────────────────────────
async function checkPort(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1500 }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ ok: true }); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function showStatus() {
  console.log(`\n  ${c('bold', 'NEXUS Systems — service status')}\n`);
  const idearium = await checkPort(4800);
  const nexus    = await checkPort(3748);
  const guardian = await checkPort(7820);

  console.log(`  ${idearium ? c('green','●') : c('red','○')}  Idearium API    :4800  ${idearium ? c('green','running') : c('red','not running')}`);
  console.log(`  ${nexus    ? c('green','●') : c('red','○')}  Nexus Cobalt    :3748  ${nexus    ? c('green','running') : c('red','not running')}`);
  console.log(`  ${guardian ? c('green','●') : c('red','○')}  Guardian v8     :7820  ${guardian ? c('green','running') : c('red','not running')}`);

  if (!idearium) {
    console.log(`\n  ${c('yellow','→')} Start Idearium:  ${c('cyan','node start.js')}`);
  } else {
    console.log(`\n  ${c('green','→')} Idearium is running.`);
    console.log(`     API:  http://127.0.0.1:4800`);
    console.log(`     UI:   ${path.join(ROOT, 'systems-ui.html')}`);
    console.log(`     IDE:  ${path.join(ROOT, 'idearium', 'ide.html')}`);
  }
  console.log('');
  process.exit(0);
}

if (args.includes('--status') || args.includes('status')) {
  showStatus(); return;
}

// ── Main boot ─────────────────────────────────────────────────────────────────
async function boot() {
  console.log('');
  console.log(c('bold', '  NEXUS Systems v1.0'));
  console.log(c('gray',  '  Idea OS · Spec-aligned version control · Alive IDE'));
  console.log('');

  // 1. Check if already running
  const existing = await checkPort(API_PORT);
  if (existing) {
    ok(`Idearium API already running at :${API_PORT}`);
    showLinks();
    return;
  }

  // 2. Check API file exists
  const apiFile = path.join(ROOT, 'idearium', 'api', 'index.js');
  if (!fs.existsSync(apiFile)) {
    err(`idearium/api/index.js not found at ${apiFile}`);
    err('Make sure you extracted the zip correctly — expected structure:');
    err('  NEXUS-Systems-v1/idearium/api/index.js');
    err('  NEXUS-Systems-v1/vortex/cli.js');
    err('  NEXUS-Systems-v1/start.js  ← (this file)');
    process.exit(1);
  }

  // 3. Start Idearium API
  log('Starting Idearium API...');
  const child = spawn('node', [apiFile], {
    env:   { ...process.env, IDEARIUM_PORT: String(API_PORT) },
    stdio: 'inherit',
    detached: false,
  });

  child.on('error', e => {
    err(`Failed to start Idearium API: ${e.message}`);
    if (e.code === 'ENOENT') err('  Node.js not found — make sure node is in your PATH');
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      err(`Idearium API exited with code ${code}`);
    }
  });

  // 4. Wait for API to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    const h = await checkPort(API_PORT);
    if (h) { ready = true; break; }
  }

  if (!ready) {
    err('Idearium API did not start within 6s');
    err('Check the output above for errors');
    process.exit(1);
  }

  ok(`Idearium API running at http://127.0.0.1:${API_PORT}`);

  // 5. Open browser if --open
  if (args.includes('--open')) {
    const uiFile = path.join(ROOT, 'systems-ui.html');
    const url = `file://${uiFile.replace(/\\/g,'/')}`;
    try {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      execSync(cmd, { stdio: 'ignore' });
      ok(`Opened systems-ui.html in browser`);
    } catch {
      inf(`Open manually: ${uiFile}`);
    }
  }

  showLinks();

  // Keep process alive (API runs in child)
  process.on('SIGINT', () => {
    log('Shutting down...');
    child.kill();
    process.exit(0);
  });
}

function showLinks() {
  console.log('');
  console.log(`  ${c('bold','NEXUS Systems — running')}`);
  console.log('');
  console.log(`  ${c('cyan','Idearium API')}  http://127.0.0.1:${API_PORT}`);
  console.log(`  ${c('cyan','Systems UI')}    ${path.join(ROOT, 'systems-ui.html')}`);
  console.log(`  ${c('cyan','IDE')}           ${path.join(ROOT, 'idearium', 'ide.html')}`);
  console.log('');
  console.log(`  ${c('gray','CLI — open a new terminal and run:')}`);
  console.log(`  ${c('yellow','node nexus.js help')}                   — all commands`);
  console.log(`  ${c('yellow','node nexus.js idea add "my idea"')}     — create idea`);
  console.log(`  ${c('yellow','node nexus.js idea list')}              — list ideas`);
  console.log(`  ${c('yellow','node nexus.js push "commit message"')}  — snapshot`);
  console.log(`  ${c('yellow','node nexus.js vortex status')}          — system state`);
  console.log('');
  console.log(c('gray', '  Ctrl+C to stop'));
  console.log('');
}

boot();
