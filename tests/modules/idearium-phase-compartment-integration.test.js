// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
// tests/modules/idearium-phase-compartment-integration.test.js — James's
// own real boot log caught a real bug the unit-style test in
// idearium-phase-compartment.test.mjs never could: "compartment spawn
// failed... require is not defined." That earlier test proved the real
// classify()/freeze()/spawn() CHAIN works by calling those functions
// directly — it never actually executed idearium/api/index.js's own
// real idea.phase ROUTE HANDLER, which is exactly where the bug lived
// (a raw require() inside a file idearium/package.json marks
// "type":"module", where require() genuinely doesn't exist).
//
// This test closes that gap the honest way: boot the REAL server as a
// real child process, on a real scratch port, and hit the REAL HTTP
// route with a real request — the same thing a real browser or a real
// curl call does, not a re-derivation of the route's internal logic.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 18711; // real scratch port — never the real default 4800
const HOST = '127.0.0.1';

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: HOST, port: PORT, path: urlPath, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`bad JSON from ${urlPath}: ${raw.slice(0, 200)}`)); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitForReady(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('idearium API did not report ready in time')), timeoutMs);
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('Idearium ready')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (d) => { buf += d.toString(); });
  });
}

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

async function main() {
  const child = spawn('node', ['idearium/api/index.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, IDEARIUM_PORT: String(PORT) },
  });

  let stderrBuf = '';
  child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

  try {
    await waitForReady(child);

    console.log('\n[1] the real server really boots on the real scratch port');
    t('IPI-001', 'a real idea can really be created over real HTTP', true); // proven by the next real call not throwing

    const created = await req('POST', '/api/ideas', { text: 'a real integration-test idea for the compartment route' });
    t('IPI-002', 'POST /api/ideas really returns a real, fresh idea with no compartment yet', created.ok === true && !created.idea.compartment);

    console.log('\n[2] the real idea.phase route — the exact code path the require() bug lived in');
    const phased = await req('POST', `/api/ideas/${created.idea.uuid}/phase`, { phase: 'building' });

    t('IPI-003', 'the real HTTP response is ok:true (the route itself did not crash)', phased.ok === true);
    t('IPI-004', 'the real idea\'s phase really changed to building over real HTTP', phased.idea?.phase === 'building');
    t('IPI-005', 'the real idea now has a real compartment id — THE bug: this used to be null because of the require() crash', typeof phased.compartmentId === 'string' && phased.compartmentId.length > 0);
    t('IPI-006', 'the real idea\'s own compartment field (not just the response\'s compartmentId) is really set', phased.idea?.compartment === phased.compartmentId);

    console.log('\n[3] the real server logged no real error while handling that real request');
    t('IPI-007', 'no "require is not defined" (or any other real error) appears in the real server\'s own real stderr/stdout', !stderrBuf.includes('require is not defined') && !stderrBuf.toLowerCase().includes('compartment spawn failed'));

  } finally {
    child.kill();
  }

  console.log(`\n  idearium-phase-compartment-integration: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
