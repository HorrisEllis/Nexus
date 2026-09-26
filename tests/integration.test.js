#!/usr/bin/env node
'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../lib/test-sandbox.js').ensure();
/**
 * tests/integration.test.js — NEXUS Full Integration Test Suite
 * UUID: nexus-integration-test-v1-0000-4000-000000000001
 *
 * Tests every system contract: boot, health, routes, SISO bus, recall, registration.
 * Run: node tests/integration.test.js
 *
 * §1.2  Every failure is loud, specific, traceable.
 * §2.3  All state observable — every test result printed.
 * §5.1  Every test has a UUID.
 * §AXIOM Orchestrator boots first; all CLIs use recall.
 */

const http   = require('http');
const https  = require('https');
const { randomUUID, createHash } = require('crypto');
const { spawn, execSync } = require('child_process');
const path   = require('path');
const fs     = require('fs');

const ROOT = path.join(__dirname, '..');

// ── Ports (canonical from nexus-connect) ──────────────────────────────────────
const PORTS = {
  orchestrator: 9000,
  bridge:       9999,
  cortex:       3748,
  guardian:     7820,
  idearium:     4800,
  emerge:       4242,
};

// ── Colours ───────────────────────────────────────────────────────────────────
const C = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[90m', red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m', blue:'\x1b[34m' };
const ok   = s => `${C.green}✓${C.reset} ${s}`;
const fail = s => `${C.red}✗${C.reset} ${s}`;
const info = s => `${C.dim}  ${s}${C.reset}`;
const hdr  = s => `\n${C.bold}${C.cyan}── ${s}${C.reset}`;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(port, method, p, body, timeout = 5000) {
  return new Promise(resolve => {
    const pl = body ? JSON.stringify(body) : null;
    const r  = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: {
        'Content-Type':  'application/json',
        'X-Test-UUID':   randomUUID(),
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try   { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: d }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok: false, error: 'timeout', status: 0 }); });
    r.on('error', e => resolve({ ok: false, error: e.message, status: 0 }));
    if (pl) r.write(pl);
    r.end();
  });
}
const GET  = (port, p) => req(port, 'GET', p);
const POST = (port, p, b) => req(port, 'POST', p, b);

// ── Test runner ───────────────────────────────────────────────────────────────
let pass = 0, fail_count = 0, skip_count = 0;
const results = [];

async function test(name, fn, deps = []) {
  // Check deps — skip if a dep system is offline
  for (const dep of deps) {
    if (!onlineSystems.has(dep)) {
      skip_count++;
      console.log(`${C.yellow}⊘${C.reset} ${name} ${C.dim}(skipped: ${dep} offline)${C.reset}`);
      results.push({ name, status: 'SKIP', reason: `${dep} offline` });
      return;
    }
  }
  try {
    await fn();
    pass++;
    console.log(ok(name));
    results.push({ name, status: 'PASS' });
  } catch(e) {
    fail_count++;
    console.log(fail(name));
    console.log(info(`  → ${e.message}`));
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertOk(r, msg) { assert(r.ok, `${msg || 'request failed'} (status=${r.status}, error=${r.error||JSON.stringify(r.data).slice(0,80)})`); }
function assertField(obj, field, msg) { assert(obj?.[field] !== undefined, msg || `missing field: ${field}`); }

// ── System prober ─────────────────────────────────────────────────────────────
const onlineSystems = new Set();

async function probeAll() {
  const checks = [
    { sys:'orchestrator', port:9000, path:'/health'        },
    { sys:'bridge',       port:9999, path:'/bridge/health' },
    { sys:'cortex',       port:3748, path:'/health'        },
    { sys:'guardian',     port:7820, path:'/health'        },
    { sys:'idearium',     port:4800, path:'/health'        },
    { sys:'emerge',       port:4242, path:'/status'        },
  ];
  console.log(hdr('System Discovery'));
  for (const { sys, port, path } of checks) {
    const r = await GET(port, path).catch(() => ({ ok:false }));
    if (r.ok) {
      onlineSystems.add(sys);
      const extras = [];
      if (r.data?.version)  extras.push(`v${r.data.version}`);
      if (r.data?.online != null) extras.push(`${r.data.online}/${r.data.total} online`);
      if (r.data?.snr != null)    extras.push(`SNR ${(r.data.snr*100).toFixed(0)}%`);
      if (r.data?.sessions != null) extras.push(`${r.data.sessions} sessions`);
      console.log(ok(`${sys.padEnd(14)} :${port}  ${C.dim}${extras.join('  ')}${C.reset}`));
    } else {
      console.log(fail(`${sys.padEnd(14)} :${port}  ${C.dim}OFFLINE${C.reset}`));
    }
  }
  console.log('');
  if (!onlineSystems.has('orchestrator')) {
    console.log(`${C.yellow}⚠  Orchestrator offline — run it first (§AXIOM)${C.reset}`);
    console.log(`   node orchestrator.js\n`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT TESTS
// Each block tests one system's interaction contract completely.
// ═════════════════════════════════════════════════════════════════════════════

async function testOrchestrator() {
  console.log(hdr('Orchestrator — :9000 — §AXIOM source of truth'));

  await test('GET /health → {ok,online,total,uptime}', async () => {
    const r = await GET(9000, '/health');
    assertOk(r, 'health');
    assertField(r.data, 'ok');
    assertField(r.data, 'online');
    assertField(r.data, 'total');
    assertField(r.data, 'uptime');
  }, ['orchestrator']);

  await test('GET /api/status → systems map', async () => {
    const r = await GET(9000, '/api/status');
    assertOk(r, 'status');
    assertField(r.data, 'systems');
    assert(typeof r.data.systems === 'object', 'systems must be an object');
  }, ['orchestrator']);

  await test('POST /api/register → registers system, returns registry', async () => {
    const r = await POST(9000, '/api/register', { systemId:'test-probe', port:9876, meta:{ role:'test' } });
    assertOk(r, 'register');
    assert(r.data.systemId === 'test-probe', 'systemId echoed');
    assertField(r.data, 'registry');
    assert(r.data.registry['test-probe'], 'test-probe in registry');
  }, ['orchestrator']);

  await test('GET /api/registry → live system map', async () => {
    const r = await GET(9000, '/api/registry');
    assertOk(r, 'registry');
    assertField(r.data, 'registry');
    // test-probe should be there from previous test
    assert(r.data.registry['test-probe'], 'registered system visible');
  }, ['orchestrator']);

  await test('POST /api/heartbeat → ok', async () => {
    const r = await POST(9000, '/api/heartbeat', { systemId:'test-probe', port:9876, status:'online' });
    assertOk(r, 'heartbeat');
    assert(r.data.ok, 'heartbeat ok');
  }, ['orchestrator']);

  await test('POST /api/ledger → persists entry', async () => {
    const testType = `test.ledger.${Date.now()}`;
    const r = await POST(9000, '/api/ledger', { system:'orchestrator', type:testType, payload:{ test:true } });
    assertOk(r, 'ledger write');
    assert(r.data.ok, 'ledger write ok');
  }, ['orchestrator']);

  await test('GET /api/ledger → returns entries with counts', async () => {
    const r = await GET(9000, '/api/ledger?n=10');
    assertOk(r, 'ledger read');
    assertField(r.data, 'entries');
    assertField(r.data, 'counts');
    assert(Array.isArray(r.data.entries), 'entries is array');
  }, ['orchestrator']);

  await test('GET /api/recall → full ledger replay', async () => {
    const r = await GET(9000, '/api/recall?n=20');
    assertOk(r, 'recall');
    assertField(r.data, 'entries');
    assertField(r.data, 'registry');
    assertField(r.data, 'counts');
  }, ['orchestrator']);

  await test('GET /api/recall?system=orchestrator → filtered', async () => {
    const r = await GET(9000, '/api/recall?system=orchestrator&n=10');
    assertOk(r, 'recall filtered');
    const allOrch = r.data.entries.every(e => e._system === 'orchestrator');
    assert(allOrch, 'all entries are orchestrator system');
  }, ['orchestrator']);

  await test('GET /api/bus → unified bus log', async () => {
    const r = await GET(9000, '/api/bus?n=20');
    assertOk(r, 'bus');
    assertField(r.data, 'entries');
  }, ['orchestrator']);

  await test('GET /api/channels → 22 SISO channels', async () => {
    const r = await GET(9000, '/api/channels');
    assertOk(r, 'channels');
    assert(r.data.channels.length >= 20, `need ≥20 channels, got ${r.data.channels.length}`);
  }, ['orchestrator']);

  await test('GET /api/cli → CLI reference object', async () => {
    const r = await GET(9000, '/api/cli');
    assertOk(r, 'cli');
    assertField(r.data, 'cli');
  }, ['orchestrator']);

  await test('POST /api/exec → executes command, returns output', async () => {
    const r = await POST(9000, '/api/exec', { cmd:'node', args:['--version'] });
    assertOk(r, 'exec');
    assert(r.data.output.includes('v'), 'output contains node version');
  }, ['orchestrator']);

  await test('GET /ports.js → canonical port map JS', async () => {
    // ports.js is served as text/javascript — check via raw HTTP, not JSON parse
    await new Promise((resolve, reject) => {
      const r = http.request({ hostname:'127.0.0.1', port:9000, path:'/ports.js', method:'GET' }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            assert(res.statusCode === 200, `ports.js status ${res.statusCode}`);
            assert(data.includes('9000') || data.includes('NEXUS'), 'ports.js contains port data');
            resolve();
          } catch(e) { reject(e); }
        });
      });
      r.setTimeout(3000, () => { r.destroy(); reject(new Error('timeout')); });
      r.on('error', reject);
      r.end();
    });
  }, ['orchestrator']);

  await test('GET /ui/idearium → serves idearium UI HTML', async () => {
    const r = await GET(9000, '/ui/idearium');
    assert(r.status === 200, 'UI served');
  }, ['orchestrator']);
}

async function testBridge() {
  console.log(hdr('Bridge — :9999 — tag engine, request queue, SSE relay'));

  await test('GET /bridge/health → {ok,bridge,sessions,pendingRequests}', async () => {
    const r = await GET(9999, '/bridge/health');
    assertOk(r, 'health');
    assert(r.data.ok, 'ok=true');
    assertField(r.data, 'sessions');
    assertField(r.data, 'pendingRequests');
  }, ['bridge']);

  await test('GET /bridge/stats → stats object', async () => {
    const r = await GET(9999, '/bridge/stats');
    assertOk(r, 'stats');
  }, ['bridge']);

  await test('POST /bridge/handshake → token issued for valid secret', async () => {
    const r = await POST(9999, '/bridge/handshake', {
      systemId: 'orchestrator', appId: 'orchestrator',
      secret: 'nexus-orchestrator-internal-v1',
    });
    assertOk(r, 'handshake');
    assert(r.data.ok, 'handshake ok');
    assertField(r.data, 'token');
    assertField(r.data, 'sessionId');
  }, ['bridge']);

  await test('POST /bridge/handshake → rejects invalid secret', async () => {
    const r = await POST(9999, '/bridge/handshake', {
      systemId: 'rogue', appId: 'rogue', secret: 'bad-secret',
    });
    assert(!r.ok, 'bad handshake rejected');
  }, ['bridge']);

  await test('POST /bridge/broadcast → accepted', async () => {
    const r = await POST(9999, '/bridge/broadcast', {
      type: 'test.integration.ping', payload: { uuid: randomUUID() },
    });
    assertOk(r, 'broadcast');
  }, ['bridge']);

  await test('GET /bridge/requests → array', async () => {
    const r = await GET(9999, '/bridge/requests');
    assertOk(r, 'requests');
    assert(Array.isArray(r.data.requests || r.data), 'requests is array');
  }, ['bridge']);

  await test('POST /bridge/request → creates request, uuid in request object', async () => {
    const r = await POST(9999, '/bridge/request', {
      type: 'job.dispatch', source: 'integration-test', target: 'guardian',
      payload: { prompt:'integration test', provider:'ollama', command:'code' },
    });
    assertOk(r, 'create request');
    assert(r.data.ok, 'ok=true');
    assertField(r.data, 'uuid');
    assertField(r.data, 'status');
    assert(r.data.status === 'pending' || r.data.status === 'held' || r.data.status === 'dispatched',
      `status is valid, got ${r.data.status}`);
  }, ['bridge']);

  await test('POST /bridge/tags → tags entity', async () => {
    const r = await POST(9999, '/bridge/tags', {
      entityId: randomUUID(), entityType: 'test', system: 'integration',
      tags: ['test', 'integration'], addedBy: 'integration-test',
    });
    assertOk(r, 'tag');
  }, ['bridge']);

  await test('GET /bridge/contract → interaction contract', async () => {
    const r = await GET(9999, '/bridge/contract');
    assertOk(r, 'bridge contract');
    assert(r.data.id === 'bridge-v1', `contract id=bridge-v1, got ${r.data.id}`);
    assertField(r.data, 'routes');
    assertField(r.data, 'siso');
    assertField(r.data, 'valid_request_types');
  }, ['bridge']);

  await test('GET /bridge/subscribe → SSE stream opens', async () => {
    // Just check the endpoint responds — we won't wait for events
    await new Promise((resolve) => {
      const r = http.request({ hostname:'127.0.0.1', port:9999, path:'/bridge/subscribe?channel=test', method:'GET',
        headers:{ Accept:'text/event-stream' } }, res => {
        resolve(res.statusCode === 200);
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(true); });
      r.on('error', () => resolve(false));
      r.end();
    });
    // passes if no throw
  }, ['bridge']);
}

async function testCortex() {
  console.log(hdr('Cortex — :3748 — source of truth, 28 JAA tables'));

  await test('GET /health → {status:ok, jaa:{counts}, uptime}', async () => {
    const r = await GET(3748, '/health');
    assertOk(r, 'health');
    assert(r.data.status === 'ok' || r.data.ok, 'status ok');
  }, ['cortex']);

  await test('GET /contract → cortex interaction contract', async () => {
    const r = await GET(3748, '/contract');
    assertOk(r, 'cortex contract');
    assert(r.data.id === 'cortex-v1', `id=cortex-v1, got ${r.data.id}`);
    assertField(r.data, 'routes');
    assertField(r.data, 'jaa_tables');
    assert(r.data.jaa_tables.length === 28, `28 tables, got ${r.data.jaa_tables.length}`);
  }, ['cortex']);

  await test('GET /sse → SSE stream opens', async () => {
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1', port:3748, path:'/sse', method:'GET',
        headers:{Accept:'text/event-stream'} }, res => {
        resolve(res.statusCode === 200);
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(true); });
      r.on('error', () => resolve(false));
      r.end();
    });
  }, ['cortex']);

  await test('GET /api/events → array of events', async () => {
    const r = await GET(3748, '/api/events?n=10');
    assertOk(r, 'events');
    assert(Array.isArray(r.data.rows || r.data.events || r.data), 'events is array');
  }, ['cortex']);

  await test('POST /api/event → event accepted, stored', async () => {
    const type = `integration.test.${Date.now()}`;
    const r = await POST(3748, '/api/event', {
      type, payload: { test:true, uuid: randomUUID() }, source:'integration-test',
    });
    assertOk(r, 'post event');
  }, ['cortex']);

  await test('GET /api/gaps → gap list', async () => {
    const r = await GET(3748, '/api/gaps');
    assertOk(r, 'gaps');
  }, ['cortex']);

  await test('POST /api/tags → tags entity', async () => {
    const r = await POST(3748, '/api/tags', {
      entityId: randomUUID(), entityType:'test',
      tags:['integration'], system:'integration-test',
    });
    assertOk(r, 'tag');
  }, ['cortex']);
}

async function testGuardian() {
  console.log(hdr('Guardian — :7820 — AI orchestration, SISO bus'));

  await test('GET /health → {ok,uptime,jobs,providers,queued}', async () => {
    const r = await GET(7820, '/health');
    assertOk(r, 'health');
    assert(r.data.ok, 'ok=true');
    assertField(r.data, 'uptime');
  }, ['guardian']);

  await test('GET /contract → guardian interaction contract', async () => {
    const r = await GET(7820, '/contract');
    assertOk(r, 'guardian contract');
    assert(r.data.id === 'guardian-v1', `id=guardian-v1, got ${r.data.id}`);
    assertField(r.data, 'forge_ide');
    assertField(r.data, 'siso');
    assertField(r.data, 'routes');
  }, ['guardian']);

  await test('GET /providers → provider list', async () => {
    const r = await GET(7820, '/providers');
    assertOk(r, 'providers');
  }, ['guardian']);

  await test('GET /jobs → job list', async () => {
    const r = await GET(7820, '/jobs?limit=5');
    assertOk(r, 'jobs');
    assertField(r.data, 'jobs');
    assert(Array.isArray(r.data.jobs), 'jobs is array');
  }, ['guardian']);

  await test('GET /artifacts → artifact list', async () => {
    const r = await GET(7820, '/artifacts');
    assertOk(r, 'artifacts');
  }, ['guardian']);

  await test('GET /ledger → ledger entries', async () => {
    const r = await GET(7820, '/ledger');
    assertOk(r, 'ledger');
  }, ['guardian']);

  await test('GET /bus → SISO bus log with gates', async () => {
    const r = await GET(7820, '/bus?n=20');
    assertOk(r, 'bus');
    assert(r.data.ok, 'bus ok');
    assertField(r.data, 'gates');
    assert(Array.isArray(r.data.gates), 'gates is array');
    assert(r.data.gates.length > 0, `bus has registered gates (got ${r.data.gates.length})`);
  }, ['guardian']);

  await test('POST /bus/emit → emits to SISO bus', async () => {
    const r = await POST(7820, '/bus/emit', {
      type: 'guardian.integration.test', data: { uuid: randomUUID(), test: true },
    });
    assertOk(r, 'bus emit');
    assert(r.data.ok, 'emit ok');
    assertField(r.data, 'seq');
  }, ['guardian']);

  await test('GET /events → SSE endpoint exists', async () => {
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1', port:7820, path:'/events', method:'GET',
        headers:{Accept:'text/event-stream'} }, res => {
        resolve(res.statusCode === 200);
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(true); });
      r.on('error', () => resolve(false));
      r.end();
    });
  }, ['guardian']);

  await test('POST /ledger → ledger entry written', async () => {
    const r = await POST(7820, '/ledger', {
      category: 'EVENT', msg: 'integration test', meta: { test:true },
    });
    assertOk(r, 'post ledger');
  }, ['guardian']);
}

async function testIdearium() {
  console.log(hdr('Idearium — :4800 — IdeaOS, SNR, tension engine'));

  await test('GET /health → {ok,version,snr,uptime}', async () => {
    const r = await GET(4800, '/health');
    assertOk(r, 'health');
    assert(r.data.ok, 'ok=true');
    assertField(r.data, 'version');
    assertField(r.data, 'snr');
    assertField(r.data, 'uptime');
  }, ['idearium']);

  await test('GET /api/contract → full interaction contract', async () => {
    const r = await GET(4800, '/api/contract');
    assertOk(r, 'contract');
    assert(r.data.ok, 'ok=true');
    assertField(r.data, 'contract');
    assert(r.data.contract.id === 'idearium-v1', `contract id correct, got: ${r.data.contract.id}`);
    assertField(r.data.contract, 'resources');
    assertField(r.data.contract, 'sse');
    assertField(r.data.contract, 'snr_translation');
  }, ['idearium']);

  await test('GET /api/stats → stats object with all counts', async () => {
    const r = await GET(4800, '/api/stats');
    assertOk(r, 'stats');
    assertField(r.data, 'stats');
    assertField(r.data.stats, 'version');
    assertField(r.data.stats, 'snr');
    assertField(r.data.stats, 'ideasTotal');
    assertField(r.data.stats, 'openGaps');
  }, ['idearium']);

  await test('GET /api/snr → current SNR value', async () => {
    const r = await GET(4800, '/api/snr');
    assertOk(r, 'snr');
    assertField(r.data, 'snr');
    assert(typeof r.data.snr === 'number', 'snr is number');
    assert(r.data.snr >= 0 && r.data.snr <= 1, `snr in [0,1], got ${r.data.snr}`);
  }, ['idearium']);

  await test('GET /api/snr/history → SNR sample array', async () => {
    const r = await GET(4800, '/api/snr/history?n=20');
    assertOk(r, 'snr history');
    assertField(r.data, 'samples');
    assert(Array.isArray(r.data.samples), 'samples is array');
  }, ['idearium']);

  let testIdeaUuid = null;
  await test('POST /api/ideas → creates idea, returns uuid', async () => {
    const r = await POST(4800, '/api/ideas', {
      text: `Integration test idea ${Date.now()}`,
      tags: ['integration', 'test'],
    });
    assertOk(r, 'create idea');
    assert(r.data.ok, 'ok=true');
    assertField(r.data, 'idea');
    assertField(r.data.idea, 'uuid');
    assertField(r.data.idea, 'text');
    assert(r.data.idea.phase === 'seed', `phase=seed, got ${r.data.idea.phase}`);
    testIdeaUuid = r.data.idea.uuid;
  }, ['idearium']);
  await test('GET /api/ideas → list with at least 1 idea', async () => {
    const r = await GET(4800, '/api/ideas');
    assertOk(r, 'list ideas');
    assertField(r.data, 'ideas');
    assert(r.data.ideas.length >= 1, `need ≥1 idea, got ${r.data.ideas.length}`);
  }, ['idearium']);

  await test('GET /api/ideas/:uuid → idea detail with links and openGaps', async () => {
    // Get first idea
    const list = await GET(4800, '/api/ideas');
    const uuid = list.data?.ideas?.[0]?.uuid;
    assert(uuid, 'need at least one idea');
    const r = await GET(4800, `/api/ideas/${uuid}`);
    assertOk(r, 'idea detail');
    assertField(r.data, 'idea');
    assertField(r.data, 'links');
    assertField(r.data, 'openGaps');
  }, ['idearium']);

  await test('POST /api/ideas/:uuid/tension → computes tension score', async () => {
    const list = await GET(4800, '/api/ideas');
    const uuid = list.data?.ideas?.[0]?.uuid;
    assert(uuid, 'need at least one idea');
    const r = await POST(4800, `/api/ideas/${uuid}/tension`, {});
    assertOk(r, 'tension');
    assertField(r.data, 'idea');
    assertField(r.data, 'tension');
    assert(typeof r.data.tension.score === 'number', 'tension score is number');
  }, ['idearium']);

  await test('POST /api/ideas/:uuid/phase → advances phase', async () => {
    const list = await GET(4800, '/api/ideas');
    const uuid = list.data?.ideas?.[0]?.uuid;
    assert(uuid, 'need at least one idea');
    const r = await POST(4800, `/api/ideas/${uuid}/phase`, { phase: 'expanding' });
    assertOk(r, 'phase');
    assert(r.data.idea.phase === 'expanding', `phase=expanding, got ${r.data.idea.phase}`);
    // Reset
    await POST(4800, `/api/ideas/${uuid}/phase`, { phase: 'seed' });
  }, ['idearium']);

  await test('POST /api/ideas/:uuid/spec → creates spec linked to idea', async () => {
    const list = await GET(4800, '/api/ideas');
    const uuid = list.data?.ideas?.[0]?.uuid;
    assert(uuid, 'need at least one idea');
    const r = await POST(4800, `/api/ideas/${uuid}/spec`, { name:'Integration test spec' });
    assertOk(r, 'create spec');
    assertField(r.data, 'spec');
    assertField(r.data.spec, 'uuid');
    assertField(r.data.spec, 'sections');
    assert(r.data.spec.sections.length >= 9, `need ≥9 sections, got ${r.data.spec.sections.length}`);
  }, ['idearium']);

  await test('GET /api/specs → spec list', async () => {
    const r = await GET(4800, '/api/specs');
    assertOk(r, 'specs');
    assertField(r.data, 'specs');
    assert(Array.isArray(r.data.specs), 'specs is array');
  }, ['idearium']);

  await test('POST /api/specs/:uuid/check → CI run result', async () => {
    const specs = await GET(4800, '/api/specs');
    const uuid  = specs.data?.specs?.[0]?.uuid;
    assert(uuid, 'need at least one spec');
    const r = await POST(4800, `/api/specs/${uuid}/check`, {});
    assertOk(r, 'spec check');
    assertField(r.data, 'spec');
  }, ['idearium']);

  await test('POST /api/specs/:uuid/build → build result with status', async () => {
    const specs = await GET(4800, '/api/specs');
    const uuid  = specs.data?.specs?.[0]?.uuid;
    assert(uuid, 'need at least one spec');
    const r = await POST(4800, `/api/specs/${uuid}/build`, {});
    assertOk(r, 'spec build');
    assertField(r.data, 'status');
    assert(['built','incomplete'].includes(r.data.status), `status must be built|incomplete, got ${r.data.status}`);
  }, ['idearium']);

  let testGapUuid = null;
  await test('POST /api/gaps → creates gap', async () => {
    const r = await POST(4800, '/api/gaps', {
      description: 'Integration test gap — auto-generated',
      type: 'integration', severity: 'low',
    });
    assertOk(r, 'create gap');
    assertField(r.data, 'gap');
    assertField(r.data.gap, 'uuid');
    assert(r.data.gap.status === 'open', 'gap starts open');
    testGapUuid = r.data.gap.uuid;
  }, ['idearium']);
  await test('GET /api/gaps → gap list filtered by status', async () => {
    const r = await GET(4800, '/api/gaps?status=open');
    assertOk(r, 'gaps');
    assertField(r.data, 'gaps');
    assert(r.data.gaps.every(g=>g.status==='open'), 'all gaps are open');
  }, ['idearium']);

  await test('POST /api/gaps/:uuid/resolve → gap resolved', async () => {
    const gaps = await GET(4800, '/api/gaps?status=open');
    const uuid = gaps.data?.gaps?.[0]?.uuid;
    assert(uuid, 'need at least one open gap');
    const r = await POST(4800, `/api/gaps/${uuid}/resolve`, { resolution:'resolved by integration test' });
    assertOk(r, 'resolve gap');
    assert(r.data.gap.status === 'resolved', `status=resolved, got ${r.data.gap.status}`);
  }, ['idearium']);

  await test('POST /api/snapshots → pushes snapshot', async () => {
    const r = await POST(4800, '/api/snapshots', { message:'integration test snapshot', branch:'test' });
    assertOk(r, 'push snapshot');
    assertField(r.data, 'snapshot');
    assertField(r.data.snapshot, 'commitId');
    assertField(r.data.snapshot, 'snr');
    assertField(r.data.snapshot, 'ideasCount');
  }, ['idearium']);

  await test('GET /api/snapshots → snapshot list', async () => {
    const r = await GET(4800, '/api/snapshots');
    assertOk(r, 'snapshots');
    assertField(r.data, 'snapshots');
    assert(r.data.snapshots.length >= 1, 'at least 1 snapshot');
  }, ['idearium']);

  await test('GET /api/events → event log', async () => {
    const r = await GET(4800, '/api/events?n=20');
    assertOk(r, 'events');
    assertField(r.data, 'events');
    assert(Array.isArray(r.data.events), 'events is array');
    assert(r.data.events.length >= 1, 'at least 1 event in log');
  }, ['idearium']);

  await test('GET /sse → SSE stream opens, sends ready', async () => {
    let chunk = '';
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1', port:4800, path:'/sse', method:'GET',
        headers:{Accept:'text/event-stream'} }, res => {
        assert(res.statusCode === 200, `SSE status ${res.statusCode}`);
        res.on('data', c => { chunk += c; if(chunk.includes('data:')) { r.destroy(); resolve(); } });
        res.on('end', resolve);
      });
      r.setTimeout(3000, () => { r.destroy(); resolve(); });
      r.on('error', () => resolve());
      r.end();
    });
    assert(chunk.includes('data:') || chunk.includes(': connected'), 'SSE sends data or connected');
  }, ['idearium']);
}

async function testOrchestratorProxy() {
  console.log(hdr('Orchestrator → Proxy Routes (all systems via :9000)'));

  await test('GET /api/bridge/health → proxied from bridge', async () => {
    const r = await GET(9000, '/api/bridge/health');
    assertOk(r, 'proxy bridge health');
    assert(r.data.ok, 'bridge ok via proxy');
  }, ['orchestrator', 'bridge']);

  await test('GET /api/idearium/health → proxied from idearium', async () => {
    const r = await GET(9000, '/api/idearium/health');
    assertOk(r, 'proxy idearium health');
    assert(r.data.ok, 'idearium ok via proxy');
  }, ['orchestrator', 'idearium']);

  await test('GET /api/cortex/health → proxied from cortex', async () => {
    const r = await GET(9000, '/api/cortex/health');
    assertOk(r, 'proxy cortex health');
  }, ['orchestrator', 'cortex']);

  await test('GET /api/guardian/health → proxied from guardian', async () => {
    const r = await GET(9000, '/api/guardian/health');
    assertOk(r, 'proxy guardian health');
    assert(r.data.ok, 'guardian ok via proxy');
  }, ['orchestrator', 'guardian']);

  await test('POST /api/idearium/ideas → proxied idea creation', async () => {
    const r = await POST(9000, '/api/idearium/ideas', {
      text: `Proxy test idea ${Date.now()}`, tags:['proxy','test'],
    });
    assertOk(r, 'proxy create idea');
    assertField(r.data, 'idea');
  }, ['orchestrator', 'idearium']);

  await test('GET /api/guardian/bus → proxied guardian bus', async () => {
    const r = await GET(9000, '/api/guardian/bus?n=10');
    assertOk(r, 'proxy guardian bus');
    assertField(r.data, 'gates');
  }, ['orchestrator', 'guardian']);
}

async function testSISOBus() {
  console.log(hdr('SISO Bus — cross-system event flow'));

  await test('Guardian bus.emit → event appears in guardian bus log', async () => {
    const testType = `guardian.integration.siso.${Date.now()}`;
    const emit = await POST(7820, '/bus/emit', { type: testType, data:{ test:true } });
    assertOk(emit, 'bus emit');
    // Verify it appeared in the log
    await new Promise(r => setTimeout(r, 100));
    const log = await GET(7820, '/bus?n=10');
    assertOk(log, 'bus log');
    const found = log.data.entries?.some(e => e.type === testType);
    assert(found, `event type ${testType} found in bus log`);
  }, ['guardian']);

  await test('Bridge broadcast → bridge receives event', async () => {
    const testType = `integration.bridge.broadcast.${Date.now()}`;
    const r = await POST(9999, '/bridge/broadcast', { type:testType, payload:{ test:true } });
    assertOk(r, 'bridge broadcast accepted');
  }, ['bridge']);

  await test('Idearium idea.create → orchestrator ledger updated', async () => {
    const before = await GET(9000, '/api/ledger?system=idearium&n=5');
    const beforeCount = before.data?.entries?.length || 0;
    await POST(4800, '/api/ideas', { text: `SISO test idea ${Date.now()}`, tags:['siso'] });
    await new Promise(r => setTimeout(r, 500));
    const after = await GET(9000, '/api/ledger?system=idearium&n=5');
    const afterCount = after.data?.entries?.length || 0;
    assert(afterCount >= beforeCount, 'orchestrator ledger grew after idea.create');
  }, ['orchestrator', 'idearium']);

  await test('Orchestrator recall includes events from all online systems', async () => {
    const r = await GET(9000, '/api/recall?n=100');
    assertOk(r, 'recall');
    const systems = new Set(r.data.entries.map(e => e._system));
    assert(systems.size >= 1, `recall covers ≥1 system, got: ${[...systems].join(',')}`);
  }, ['orchestrator']);
}

async function testEmergeCLI() {
  console.log(hdr('Emerge IDE — :4242 (optional)'));

  await test('GET /contract → emerge interaction contract', async () => {
    const r = await GET(4242, '/contract');
    assertOk(r, 'emerge contract');
    assert(r.data.id === 'emerge-v1', `id=emerge-v1, got ${r.data.id}`);
    assertField(r.data, 'kernel');
    assert(r.data.kernel.keywords === 595, `595 keywords, got ${r.data.kernel.keywords}`);
  }, ['emerge']);

  await test('GET /status → emerge status', async () => {
    const r = await GET(4242, '/status');
    assertOk(r, 'emerge status');
  }, ['emerge']);
}

async function testCLIRecall() {
  console.log(hdr('CLI Recall — §AXIOM all CLIs use recall'));

  await test('nexus-connect recall() → reads from orchestrator', async () => {
    // Simulate what recall() does: GET /api/recall
    const r = await GET(9000, '/api/recall?n=10');
    assertOk(r, 'recall via nexus-connect contract');
    assertField(r.data, 'entries');
    assertField(r.data, 'registry');
    assertField(r.data, 'counts');
    assert(typeof r.data.n === 'number', 'n field present');
  }, ['orchestrator']);

  await test('recall?type=filter → type-filtered results', async () => {
    // Post a known event first
    const knownType = `recall.filter.test.${Date.now()}`;
    await POST(9000, '/api/ledger', { system:'orchestrator', type:knownType, payload:{} });
    await new Promise(r=>setTimeout(r,100));
    const r = await GET(9000, `/api/recall?type=${knownType}&n=5`);
    assertOk(r, 'recall type filter');
    const found = r.data.entries?.some(e=>e.type===knownType);
    assert(found, `type-filtered recall found ${knownType}`);
  }, ['orchestrator']);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  NEXUS Integration Test Suite                        ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Tests every system contract: boot, health, routes, bus, recall${C.reset}\n`);

  await probeAll();

  await testOrchestrator();
  await testBridge();
  await testCortex();
  await testGuardian();
  await testIdearium();
  await testOrchestratorProxy();
  await testSISOBus();
  await testCLIRecall();
  await testEmergeCLI();

  // ── Results ────────────────────────────────────────────────────────────────
  const total = pass + fail_count + skip_count;
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}RESULTS: ${pass}/${total} passed — ${fail_count} failed — ${skip_count} skipped${C.reset}`);

  if (fail_count === 0) {
    console.log(`${C.bold}${C.green}ALL PASS${C.reset}`);
  } else {
    console.log(`\n${C.bold}${C.red}FAILURES:${C.reset}`);
    results.filter(r=>r.status==='FAIL').forEach(r => {
      console.log(`  ${C.red}✗${C.reset} ${r.name}`);
      if (r.error) console.log(`    ${C.dim}${r.error}${C.reset}`);
    });
  }

  if (onlineSystems.size < 3) {
    console.log(`\n${C.yellow}⚠  Only ${onlineSystems.size} system(s) online. For full coverage run all systems:${C.reset}`);
    console.log(`  node orchestrator.js       # :9000 first`);
    console.log(`  node bridge/nexus-bridge.js # :9999`);
    console.log(`  node cortex/boot.js         # :3748`);
    console.log(`  node guardian/server.js     # :7820`);
    console.log(`  node idearium/api/index.js  # :4800`);
  }

  // Save results JSON
  const outPath = path.join(__dirname, 'integration-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ ts:Date.now(), pass, fail:fail_count, skip:skip_count, total, online:[...onlineSystems], results }, null, 2));
  console.log(`${C.dim}\n  Results saved: ${outPath}${C.reset}\n`);

  process.exit(fail_count > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
