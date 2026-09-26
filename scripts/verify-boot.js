#!/usr/bin/env node
'use strict';
/**
 * scripts/verify-boot.js — Runtime boot & health verification
 * UUID: nexus-verify-boot-v1-0000-2026-0709-jamesbrooks-001
 *
 * §WHY THIS EXISTS — this session shipped a guardian/server.js that could
 * not boot, in every package, for many turns. `node --check` passed the
 * whole time: the deleted statement (`const server = http.createServer(...)`)
 * left no orphaned body, so the file was syntactically valid and
 * semantically dead. Nothing caught it because nothing ever started the
 * process. §1.1 says nothing exists until proven; a syntax check proves
 * the file parses, not that the service exists.
 *
 * §EVIDENCE TIERS — the core idea. "Working" is not one property, it is a
 * ladder, and each rung is a strictly stronger claim than the one below.
 * Conflating them is what produced the failure above. This tool reports
 * the highest rung each service actually reached, and never asserts a
 * rung it did not observe:
 *
 *   PARSES    — node --check succeeds. Says nothing about runtime.
 *   BOOTS     — process survives GRACE_MS without exiting or crashing.
 *   SERVING   — its port accepts a TCP connection.
 *   HEALTHY   — GET /health returns HTTP 2xx.
 *   CONTRACT  — that /health body actually reports ok:true.
 *
 * A service can PARSE and still be dead. It can BOOT and never listen. It
 * can SERVE and return 500s. Each rung is earned separately.
 *
 * §NOT AN END-TO-END TEST — reaching CONTRACT does not prove any business
 * behavior. It proves the process is alive and answering. Anything beyond
 * that requires exercising the real path, which this tool deliberately
 * does not claim to do.
 */
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GRACE_MS = 4000;   // time to let a service come up
const PROBE_MS = 2000;

// Real services and their real ports. Only services that own an HTTP
// port belong here — a library has no boot to verify.
const SERVICES = [
  { name: 'orchestrator', entry: 'orchestrator/orchestrator.js',      port: 9000 },
  { name: 'cortex',       entry: 'cortex/boot.js',       port: 3748 },
  { name: 'copilot',      entry: 'copilot/server.js',    port: 3750 },
  { name: 'guardian',     entry: 'guardian/server.js',   port: 7820 },
  { name: 'architect',    entry: 'architect/service.js', port: 3747 },
  { name: 'ollama',       entry: 'ollama/server.js',     port: 3749 },
];

const TIERS = ['NONE', 'PARSES', 'BOOTS', 'SERVING', 'HEALTHY', 'CONTRACT'];

function parses(entry) {
  try { execFileSync('node', ['--check', path.join(ROOT, entry)], { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

function tcpOpen(port) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 1200 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error',   () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

function httpHealth(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: PROBE_MS }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function verify(svc) {
  const result = { name: svc.name, tier: 'NONE', detail: '' };

  if (!parses(svc.entry)) { result.detail = 'node --check failed'; return result; }
  result.tier = 'PARSES';

  const child = spawn('node', [svc.entry], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let exited = null;
  child.stderr.on('data', c => { stderr += c.toString(); });
  child.on('exit', code => { exited = code; });

  await new Promise(r => setTimeout(r, GRACE_MS));

  if (exited !== null) {
    // §1.2 — a crashed boot must surface its real reason, not a bare "failed".
    const firstErr = (stderr.split('\n').find(l => /Error|error:/.test(l)) || '').trim();
    result.detail = `exited(${exited}) ${firstErr.slice(0, 110)}`;
    return result;
  }
  result.tier = 'BOOTS';

  if (!(await tcpOpen(svc.port))) {
    result.detail = `alive but port ${svc.port} not listening`;
    child.kill('SIGKILL');
    return result;
  }
  result.tier = 'SERVING';

  const h = await httpHealth(svc.port);
  child.kill('SIGKILL');

  if (!h) { result.detail = 'no /health response'; return result; }
  if (h.status < 200 || h.status >= 300) { result.detail = `/health HTTP ${h.status}`; return result; }
  result.tier = 'HEALTHY';

  try {
    const parsed = JSON.parse(h.body);
    if (parsed.ok === true) { result.tier = 'CONTRACT'; result.detail = `v${parsed.version || '?'}`; }
    else result.detail = '/health 2xx but ok!==true';
  } catch (_) { result.detail = '/health 2xx but body not JSON'; }

  return result;
}

async function main() {
  const only = process.argv[2];
  const list = only ? SERVICES.filter(s => s.name === only) : SERVICES;
  console.log('Evidence tiers: ' + TIERS.join(' < ') + '\n');

  const results = [];
  for (const svc of list) {
    const r = await verify(svc);
    results.push(r);
    const pad = r.name.padEnd(13);
    const mark = r.tier === 'CONTRACT' ? 'ok  ' : (r.tier === 'PARSES' || r.tier === 'NONE' ? 'FAIL' : 'warn');
    console.log(`  [${mark}] ${pad} ${r.tier.padEnd(9)} ${r.detail}`);
    await new Promise(res => setTimeout(res, 400)); // let the port free
  }

  const dead = results.filter(r => r.tier === 'NONE' || r.tier === 'PARSES');
  console.log(`\n${results.filter(r => r.tier === 'CONTRACT').length}/${results.length} reached CONTRACT.`);
  if (dead.length) {
    console.log(`${dead.length} service(s) DO NOT BOOT: ${dead.map(d => d.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('verify-boot failed:', e.message); process.exitCode = 1; });
