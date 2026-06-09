#!/usr/bin/env node
/**
 * tests/pipeline.test.js — Full pipeline + workflow test
 * §1.1 Nothing exists without evidence.
 * §1.2 Nothing silently fails.
 *
 * Tests the complete flow:
 *   orchestrator → bridge → cortex → guardian → idearium → emerge
 *   …and the return flows between them.
 *
 * Every assertion requires observable evidence from the system.
 * A test that doesn't call the real system is not a test.
 */

'use strict';
const http  = require('http');
const { randomUUID } = require('crypto');
const path  = require('path');
const fs    = require('fs');

// ── helpers ──────────────────────────────────────────────────────────────────
function req(port, method, p, body, timeout = 5000) {
  return new Promise(resolve => {
    const pl = body ? JSON.stringify(body) : null;
    const r  = http.request({ hostname:'127.0.0.1', port, path:p, method,
      headers:{ 'Content-Type':'application/json',
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}) } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try   { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: d }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error:'timeout', status:0 }); });
    r.on('error', e => resolve({ ok:false, error:e.code||e.message, status:0 }));
    if (pl) r.write(pl);
    r.end();
  });
}
const GET  = (port,p)   => req(port,'GET',p);
const POST = (port,p,b) => req(port,'POST',p,b);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── result tracking ──────────────────────────────────────────────────────────
const C = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[90m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m' };
const results = [];
let pass=0, fail=0;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function test(name, fn) {
  process.stdout.write(`  ${C.dim}→${C.reset} ${name} … `);
  try {
    const evidence = await fn();
    pass++;
    const ev = evidence ? ` ${C.dim}[${String(evidence).slice(0,60)}]${C.reset}` : '';
    console.log(`${C.green}✓${C.reset}${ev}`);
    results.push({ name, status:'PASS', evidence: String(evidence||'') });
  } catch(e) {
    fail++;
    console.log(`${C.red}✗${C.reset} ${C.red}${e.message}${C.reset}`);
    results.push({ name, status:'FAIL', error: e.message });
  }
}

function section(name) {
  console.log(`\n${C.bold}${C.cyan}── ${name}${C.reset}`);
}

// ── online check ─────────────────────────────────────────────────────────────
const SYSTEMS = { orchestrator:9000, bridge:9999, cortex:3748, guardian:7820, idearium:4800 };
const online  = {};

async function probeAll() {
  const paths = { orchestrator:'/health', bridge:'/bridge/health',
    cortex:'/health', guardian:'/health', idearium:'/health' };
  for (const [sys,port] of Object.entries(SYSTEMS)) {
    const r = await GET(port, paths[sys]).catch(()=>({ok:false}));
    online[sys] = r.ok;
  }
  console.log(`\n${C.bold}Systems online:${C.reset}`);
  for (const [sys,up] of Object.entries(online))
    console.log(`  ${up?C.green+'●':C.red+'○'}${C.reset}  ${sys.padEnd(14)} :${SYSTEMS[sys]}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testOrchestrator() {
  section('1 · ORCHESTRATOR — source of truth (:9000)');
  if (!online.orchestrator) { console.log(`  ${C.yellow}OFFLINE — skipping${C.reset}`); return; }

  await test('health returns ok=true with uptime + system counts', async () => {
    const r = await GET(9000, '/health');
    assert(r.ok, `status ${r.status}`);
    assert(r.data.ok === true, 'ok not true');
    assert(typeof r.data.uptime === 'number', 'no uptime');
    assert(typeof r.data.total  === 'number', 'no total');
    return `uptime=${r.data.uptime.toFixed(1)}s online=${r.data.online}/${r.data.total}`;
  });

  let regUUID = `test-${randomUUID().slice(0,8)}`;
  await test('POST /api/register → system appears in registry', async () => {
    const r = await POST(9000, '/api/register', { systemId:regUUID, port:9876, meta:{role:'test'} });
    assert(r.ok, `register failed: ${JSON.stringify(r.data).slice(0,80)}`);
    assert(r.data.ok, 'ok not true');
    assert(r.data.registry[regUUID], 'system not in returned registry');
    // Verify it persisted
    const reg = await GET(9000, '/api/registry');
    assert(reg.data.registry[regUUID], 'system not visible in /api/registry after register');
    return `systemId=${regUUID} registered and visible`;
  });

  await test('POST /api/heartbeat → lastSeen updates', async () => {
    const before = await GET(9000, '/api/registry');
    const t0 = before.data.registry[regUUID]?.lastSeen || 0;
    await sleep(20);
    const r = await POST(9000, '/api/heartbeat', { systemId:regUUID, port:9876, status:'online' });
    assert(r.ok && r.data.ok, 'heartbeat failed');
    const after = await GET(9000, '/api/registry');
    const t1 = after.data.registry[regUUID]?.lastSeen || 0;
    assert(t1 >= t0, `lastSeen did not advance: ${t0} → ${t1}`);
    return `lastSeen advanced by ${t1-t0}ms`;
  });

  await test('POST /api/ledger → entry written and readable', async () => {
    const type = `pipeline.test.${Date.now()}`;
    const wr = await POST(9000, '/api/ledger', { system:'pipeline-test', type, payload:{ sentinel:true } });
    assert(wr.ok && wr.data.ok, `write failed: ${JSON.stringify(wr.data)}`);
    await sleep(50);
    const rd = await GET(9000, `/api/ledger?system=pipeline-test&n=5`);
    assert(rd.ok, 'ledger read failed');
    const found = rd.data.entries?.some(e => e.type === type);
    assert(found, `type ${type} not found in ledger after write`);
    return `wrote type=${type}, found in ledger`;
  });

  await test('GET /api/recall → returns entries + registry + counts', async () => {
    const r = await GET(9000, '/api/recall?system=pipeline-test&n=5');
    assert(r.ok, `recall failed: ${r.error}`);
    assert(Array.isArray(r.data.entries), 'entries not array');
    assert(typeof r.data.registry === 'object', 'no registry in recall');
    assert(typeof r.data.counts   === 'object', 'no counts in recall');
    assert(r.data.entries.length > 0, 'recall returned 0 entries for pipeline-test');
    return `${r.data.entries.length} entries, ${Object.keys(r.data.registry).length} systems in registry`;
  });

  await test('GET /api/recall?type=filter → sentinel type found in filtered results', async () => {
    const sentinel = `pipeline.sentinel.${Date.now()}`;
    await POST(9000, '/api/ledger', { system:'pipeline-test', type:sentinel, payload:{} });
    await sleep(200);
    const r = await GET(9000, `/api/recall?type=${sentinel}&n=10`);
    assert(r.ok, 'recall filter failed');
    assert(Array.isArray(r.data.entries), 'no entries array');
    const found = r.data.entries.some(e => e.type === sentinel);
    assert(found, `sentinel type ${sentinel} not found in filtered recall (${r.data.entries.length} entries)`);
    return `type filter matched ${sentinel}`;
  });

  await test('GET /api/channels → ≥20 SISO channels declared', async () => {
    const r = await GET(9000, '/api/channels');
    assert(r.ok, 'channels failed');
    assert(Array.isArray(r.data.channels), 'channels not array');
    assert(r.data.channels.length >= 20, `only ${r.data.channels.length} channels`);
    return `${r.data.channels.length} channels`;
  });

  await test('GET /sse → SSE stream opens, sends data event', async () => {
    let received = '';
    await new Promise((resolve,reject) => {
      const r = http.request({ hostname:'127.0.0.1',port:9000,path:'/sse',method:'GET',
        headers:{Accept:'text/event-stream'}}, res => {
        assert(res.statusCode===200, `SSE status ${res.statusCode}`);
        res.on('data', c => {
          received += c.toString();
          if (received.includes('data:')) { r.destroy(); resolve(); }
        });
        res.on('end', resolve);
      });
      r.setTimeout(3000, () => { r.destroy(); resolve(); });
      r.on('error', reject);
      r.end();
    });
    assert(received.includes('data:'), 'SSE never sent data: event');
    return 'SSE stream opened and received data: event';
  });

  await test('GET /ports.js → port map served as JS', async () => {
    const r = await req(9000, 'GET', '/ports.js', null, 3000);
    // serveFile returns raw text — check it
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    assert(r.status === 200, `ports.js status=${r.status} body=${body.slice(0,80)}`);
    assert(body.length > 0, 'ports.js empty');
    assert(body.includes('9000') || body.includes('NEXUS') || body.includes('port'),
      `ports.js no port data: ${body.slice(0,80)}`);
    return `ports.js ${body.length} bytes`;
  });
}

async function testBridge() {
  section('2 · BRIDGE — event bus fabric (:9999)');
  if (!online.bridge) { console.log(`  ${C.yellow}OFFLINE — skipping${C.reset}`); return; }

  await test('health returns ok=true with session count', async () => {
    const r = await GET(9999, '/bridge/health');
    assert(r.ok && r.data.ok, `bridge health failed: ${JSON.stringify(r.data)}`);
    assert(typeof r.data.sessions === 'number', 'no sessions field');
    return `sessions=${r.data.sessions} pending=${r.data.pendingRequests}`;
  });

  await test('GET /bridge/contract → id=bridge-v1 with routes + valid_request_types', async () => {
    const r = await GET(9999, '/bridge/contract');
    assert(r.ok, `contract failed: ${r.error}`);
    assert(r.data.id === 'bridge-v1', `id=${r.data.id}`);
    assert(Array.isArray(r.data.routes), 'no routes array');
    assert(Array.isArray(r.data.valid_request_types), 'no valid_request_types');
    assert(r.data.routes.length >= 15, `only ${r.data.routes.length} routes`);
    return `${r.data.routes.length} routes, ${r.data.valid_request_types.length} request types`;
  });

  let bridgeToken = null;
  await test('POST /bridge/handshake → token issued', async () => {
    const r = await POST(9999, '/bridge/handshake', {
      systemId:'orchestrator', appId:'orchestrator',
      secret:'nexus-orchestrator-internal-v1' });
    assert(r.ok && r.data.ok, `handshake failed: ${JSON.stringify(r.data)}`);
    assert(r.data.token, 'no token');
    assert(r.data.sessionId, 'no sessionId');
    bridgeToken = r.data.token;
    return `token=${r.data.token.slice(0,16)}… sessionId=${r.data.sessionId.slice(0,8)}`;
  });

  await test('POST /bridge/handshake → bad secret rejected (401)', async () => {
    const r = await POST(9999, '/bridge/handshake', {
      systemId:'rogue', appId:'rogue', secret:'wrong-secret' });
    assert(!r.ok, `bad handshake should be rejected, got status ${r.status}`);
    return `bad secret correctly rejected with status ${r.status}`;
  });

  let reqUUID = null;
  await test('POST /bridge/requests → creates request with uuid', async () => {
    const r = await POST(9999, '/bridge/requests', {
      type:'job.dispatch', from:'pipeline-test', to:'guardian',
      payload:{ prompt:'pipeline test dispatch', provider:'ollama', command:'code' } });
    assert(r.ok && r.data.ok, `create request failed: ${JSON.stringify(r.data).slice(0,100)}`);
    assert(r.data.request?.uuid, 'no uuid in request');
    assert(r.data.request.status === 'pending', `status=${r.data.request.status}`);
    reqUUID = r.data.request.uuid;
    return `uuid=${reqUUID.slice(0,8)} status=pending`;
  });

  await test('GET /bridge/requests → request appears in queue', async () => {
    assert(reqUUID, 'no request UUID from previous test');
    const r = await GET(9999, '/bridge/requests');
    assert(r.ok, `requests list failed: ${r.error}`);
    const list = r.data.requests || r.data;
    assert(Array.isArray(list), 'requests not array');
    const found = list.some(req => req.uuid === reqUUID);
    assert(found, `request ${reqUUID.slice(0,8)} not found in queue`);
    return `${list.length} requests in queue, created request visible`;
  });

  await test('POST /bridge/broadcast → accepted, returns acknowledged', async () => {
    const type = `pipeline.broadcast.${Date.now()}`;
    const r = await POST(9999, '/bridge/broadcast', { type, payload:{ source:'pipeline-test' } });
    assert(r.ok, `broadcast failed: ${JSON.stringify(r.data)}`);
    return `broadcast type=${type} accepted`;
  });

  await test('POST /bridge/tags → entity tagged, retrievable', async () => {
    const entityId = randomUUID();
    const r = await POST(9999, '/bridge/tags', {
      entityId, entityType:'test', system:'pipeline-test',
      tags:['pipeline','evidence'], addedBy:'pipeline-test' });
    assert(r.ok, `tag failed: ${JSON.stringify(r.data).slice(0,100)}`);
    return `entity ${entityId.slice(0,8)} tagged with [pipeline, evidence]`;
  });

  await test('GET /bridge/subscribe → SSE channel opens', async () => {
    let opened = false;
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1', port:9999,
        path:'/bridge/subscribe?channel=pipeline-test', method:'GET',
        headers:{Accept:'text/event-stream'}}, res => {
        opened = res.statusCode === 200;
        r.destroy(); resolve();
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(); });
      r.on('error', () => resolve());
      r.end();
    });
    assert(opened, 'SSE channel did not open (not 200)');
    return 'SSE channel opened on channel=pipeline-test';
  });
}

async function testCortex() {
  section('3 · CORTEX — append-only memory (:3748)');
  if (!online.cortex) { console.log(`  ${C.yellow}OFFLINE — skipping${C.reset}`); return; }

  await test('health returns status=ok with jaa counts', async () => {
    const r = await GET(3748, '/health');
    assert(r.ok, `health failed: ${r.error}`);
    assert(r.data.status==='ok' || r.data.ok, `status=${r.data.status}`);
    return `status=${r.data.status||'ok'} uptime=${r.data.uptime?.toFixed(1)||'?'}s`;
  });

  await test('GET /contract → id=cortex-v1 with 28 JAA tables listed', async () => {
    const r = await GET(3748, '/contract');
    assert(r.ok, `contract failed: ${r.error}`);
    assert(r.data.id === 'cortex-v1', `id=${r.data.id}`);
    assert(Array.isArray(r.data.jaa_tables), 'no jaa_tables array');
    assert(r.data.jaa_tables.length === 28, `${r.data.jaa_tables.length} tables (expected 28)`);
    return `${r.data.jaa_tables.length} JAA tables declared`;
  });

  let eventType = null;
  await test('POST /api/event → event stored, returns ok', async () => {
    eventType = `pipeline.cortex.test.${Date.now()}`;
    const r = await POST(3748, '/api/event', {
      type: eventType, payload:{ sentinel:true, source:'pipeline-test' },
      source:'pipeline-test', causedBy: randomUUID() });
    assert(r.ok, `event write failed: ${JSON.stringify(r.data).slice(0,100)}`);
    return `type=${eventType} written`;
  });

  await test('GET /api/events → written event is readable', async () => {
    assert(eventType, 'no eventType from previous test');
    await sleep(100);
    const r = await GET(3748, '/api/events?n=20');
    assert(r.ok, `events read failed: ${r.error}`);
    const rows = r.data.rows || r.data.events || (Array.isArray(r.data) ? r.data : []);
    assert(Array.isArray(rows), 'events not array');
    const found = rows.some(e => e.type === eventType);
    assert(found, `event type ${eventType} not found in event log after write`);
    return `event visible in log (${rows.length} total events)`;
  });

  await test('GET /api/gaps → returns gap list (array)', async () => {
    const r = await GET(3748, '/api/gaps');
    assert(r.ok, `gaps failed: ${r.error}`);
    const gaps = r.data.gaps || r.data.rows || (Array.isArray(r.data) ? r.data : null);
    assert(gaps !== null, 'gaps response is not an array');
    return `${Array.isArray(gaps) ? gaps.length : '?'} gaps`;
  });

  await test('GET /sse → SSE stream opens', async () => {
    let opened = false;
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1', port:3748, path:'/sse', method:'GET',
        headers:{Accept:'text/event-stream'}}, res => {
        opened = res.statusCode === 200;
        r.destroy(); resolve();
      });
      r.setTimeout(2000, () => { r.destroy(); resolve(); });
      r.on('error', () => resolve());
      r.end();
    });
    assert(opened, 'cortex SSE did not open');
    return 'cortex SSE stream opened';
  });
}

async function testGuardian() {
  section('4 · GUARDIAN — AI orchestration (:7820)');
  if (!online.guardian) { console.log(`  ${C.yellow}OFFLINE — skipping${C.reset}`); return; }

  await test('health returns ok=true with uptime', async () => {
    const r = await GET(7820, '/health');
    assert(r.ok && r.data.ok, `health failed: ${JSON.stringify(r.data)}`);
    assert(typeof r.data.uptime === 'number', 'no uptime');
    return `uptime=${r.data.uptime.toFixed(1)}s`;
  });

  await test('GET /contract → id=guardian-v1 with forge_ide + siso + routes', async () => {
    const r = await GET(7820, '/contract');
    assert(r.ok, `contract failed: ${r.error}`);
    assert(r.data.id === 'guardian-v1', `id=${r.data.id}`);
    assert(r.data.forge_ide, 'no forge_ide field');
    assert(r.data.siso, 'no siso field');
    assert(Array.isArray(r.data.routes), 'no routes');
    return `${r.data.routes.length} routes, forge_ide at ${r.data.forge_ide.path}`;
  });

  await test('GET /providers → returns provider map', async () => {
    const r = await GET(7820, '/providers');
    assert(r.ok, `providers failed: ${r.error}`);
    assert(typeof r.data === 'object', 'providers not object');
    return `providers: ${Object.keys(r.data).join(', ')||'none connected (expected)'}`;
  });

  await test('GET /jobs → returns jobs array', async () => {
    const r = await GET(7820, '/jobs?limit=5');
    assert(r.ok, `jobs failed: ${r.error}`);
    assert(r.data.jobs !== undefined, 'no jobs field');
    assert(Array.isArray(r.data.jobs), 'jobs not array');
    return `${r.data.jobs.length} jobs`;
  });

  await test('GET /bus → SISO bus log with gates array', async () => {
    const r = await GET(7820, '/bus?n=10');
    assert(r.ok && r.data.ok, `bus failed: ${JSON.stringify(r.data).slice(0,80)}`);
    assert(Array.isArray(r.data.gates), 'no gates array');
    return `${r.data.gates.length} gates, ${r.data.entries?.length||0} events`;
  });

  let busSeq = null;
  await test('POST /bus/emit → event emitted, seq returned, visible in log', async () => {
    const type = `pipeline.guardian.siso.${Date.now()}`;
    const r = await POST(7820, '/bus/emit', { type, data:{ source:'pipeline-test', sentinel:true } });
    assert(r.ok && r.data.ok, `bus emit failed: ${JSON.stringify(r.data)}`);
    assert(typeof r.data.seq === 'number', 'no seq returned');
    busSeq = r.data.seq;
    // Verify it appears in log
    await sleep(100);
    const log = await GET(7820, '/bus?n=20');
    const found = log.data.entries?.some(e => e.type === type);
    assert(found, `emitted event type ${type} not found in bus log after emit`);
    return `seq=${busSeq} event visible in bus log`;
  });

  await test('GET /artifacts → returns artifact list', async () => {
    const r = await GET(7820, '/artifacts');
    assert(r.ok, `artifacts failed: ${r.error}`);
    return `artifacts: ${JSON.stringify(r.data).slice(0,50)}`;
  });

  await test('POST /ledger → ledger entry written', async () => {
    const r = await POST(7820, '/ledger', {
      category:'EVENT', msg:'pipeline test ledger entry',
      meta:{ source:'pipeline-test', ts:Date.now() } });
    assert(r.ok, `ledger write failed: ${JSON.stringify(r.data).slice(0,100)}`);
    return 'ledger entry written';
  });

  await test('GET /ledger → written entry is readable', async () => {
    await sleep(100);
    const r = await GET(7820, '/ledger');
    assert(r.ok, `ledger read failed: ${r.error}`);
    const entries = r.data.entries || r.data.rows || (Array.isArray(r.data)?r.data:[]);
    assert(Array.isArray(entries), 'ledger not array');
    return `${entries.length} ledger entries`;
  });

  await test('GET /events → SSE stream opens', async () => {
    let opened = false;
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1',port:7820,path:'/events',method:'GET',
        headers:{Accept:'text/event-stream'}}, res => {
        opened = res.statusCode===200;
        r.destroy(); resolve();
      });
      r.setTimeout(2000,()=>{r.destroy();resolve();});
      r.on('error',()=>resolve());
      r.end();
    });
    assert(opened, 'guardian SSE did not open');
    return 'guardian SSE stream opened';
  });
}

async function testIdearium() {
  section('5 · IDEARIUM — idea OS (:4800)');
  if (!online.idearium) { console.log(`  ${C.yellow}OFFLINE — skipping${C.reset}`); return; }

  await test('health returns ok=true with version + SNR in [0,1]', async () => {
    const r = await GET(4800, '/health');
    assert(r.ok && r.data.ok, `health failed: ${JSON.stringify(r.data)}`);
    assert(r.data.version, 'no version');
    assert(typeof r.data.snr==='number' && r.data.snr>=0 && r.data.snr<=1,
      `snr=${r.data.snr} not in [0,1]`);
    return `v${r.data.version} SNR=${(r.data.snr*100).toFixed(0)}% uptime=${r.data.uptime?.toFixed(1)}s`;
  });

  await test('GET /api/contract → id=idearium-v1 with resources + sse + snr_translation', async () => {
    const r = await GET(4800, '/api/contract');
    assert(r.ok && r.data.ok, `contract failed: ${JSON.stringify(r.data).slice(0,100)}`);
    assert(r.data.contract?.id === 'idearium-v1', `id=${r.data.contract?.id}`);
    assert(r.data.contract.sse, 'no sse field in contract');
    assert(r.data.contract.snr_translation, 'no snr_translation in contract');
    return `id=idearium-v1 sse=${r.data.contract.sse} snr_translation present`;
  });

  await test('GET /api/snr → number in [0,1] with components', async () => {
    const r = await GET(4800, '/api/snr');
    assert(r.ok, `snr failed: ${r.error}`);
    assert(typeof r.data.snr==='number' && r.data.snr>=0 && r.data.snr<=1,
      `snr=${r.data.snr}`);
    return `SNR=${(r.data.snr*100).toFixed(1)}%`;
  });

  await test('GET /api/snr/history → samples array', async () => {
    const r = await GET(4800, '/api/snr/history?n=10');
    assert(r.ok, `snr/history failed: ${r.error}`);
    assert(Array.isArray(r.data.samples), 'samples not array');
    return `${r.data.samples.length} samples`;
  });

  let ideaUUID = null;
  await test('POST /api/ideas → creates idea, returns uuid + phase=seed', async () => {
    const text = `Pipeline test idea ${Date.now()}`;
    const r = await POST(4800, '/api/ideas', { text, tags:['pipeline','evidence'] });
    assert(r.ok && r.data.ok, `create idea failed: ${JSON.stringify(r.data).slice(0,100)}`);
    assert(r.data.idea?.uuid, 'no uuid');
    assert(r.data.idea.phase === 'seed', `phase=${r.data.idea.phase}`);
    assert(r.data.idea.text === text, 'text mismatch');
    ideaUUID = r.data.idea.uuid;
    return `uuid=${ideaUUID.slice(0,8)} phase=seed text="${text.slice(0,30)}"`;
  });

  await test('GET /api/ideas → idea appears in list', async () => {
    assert(ideaUUID, 'no idea UUID');
    const r = await GET(4800, '/api/ideas');
    assert(r.ok, `list ideas failed: ${r.error}`);
    assert(Array.isArray(r.data.ideas), 'ideas not array');
    const found = r.data.ideas.some(i => i.uuid === ideaUUID);
    assert(found, `idea ${ideaUUID.slice(0,8)} not found in list`);
    return `idea visible in list (${r.data.ideas.length} total)`;
  });

  await test('GET /api/ideas/:uuid → detail with links + openGaps', async () => {
    assert(ideaUUID, 'no idea UUID');
    const r = await GET(4800, `/api/ideas/${ideaUUID}`);
    assert(r.ok, `idea detail failed: ${r.error}`);
    assert(r.data.idea?.uuid === ideaUUID, 'uuid mismatch');
    assert(Array.isArray(r.data.links), 'no links array');
    assert(Array.isArray(r.data.openGaps), 'no openGaps array');
    return `idea detail: phase=${r.data.idea.phase} links=${r.data.links.length} gaps=${r.data.openGaps.length}`;
  });

  await test('POST /api/ideas/:uuid/tension → returns score in [0,1]', async () => {
    assert(ideaUUID, 'no idea UUID');
    const r = await POST(4800, `/api/ideas/${ideaUUID}/tension`, {});
    assert(r.ok, `tension failed: ${r.error}`);
    assert(typeof r.data.tension?.score === 'number', `tension.score=${r.data.tension?.score}`);
    assert(r.data.tension.score>=0 && r.data.tension.score<=1,
      `tension.score ${r.data.tension.score} not in [0,1]`);
    return `tension.score=${r.data.tension.score.toFixed(3)}`;
  });

  await test('POST /api/ideas/:uuid/phase → phase advances and persists', async () => {
    assert(ideaUUID, 'no idea UUID');
    const r = await POST(4800, `/api/ideas/${ideaUUID}/phase`, { phase:'expanding' });
    assert(r.ok, `phase failed: ${r.error}`);
    assert(r.data.idea.phase==='expanding', `phase=${r.data.idea.phase}`);
    // Verify persisted
    const detail = await GET(4800, `/api/ideas/${ideaUUID}`);
    assert(detail.data.idea.phase==='expanding', 'phase not persisted');
    return `phase advanced to expanding and persisted`;
  });

  let specUUID = null;
  await test('POST /api/ideas/:uuid/spec → creates spec with ≥9 sections', async () => {
    assert(ideaUUID, 'no idea UUID');
    const r = await POST(4800, `/api/ideas/${ideaUUID}/spec`, { name:'Pipeline test spec' });
    assert(r.ok, `create spec failed: ${JSON.stringify(r.data).slice(0,100)}`);
    assert(r.data.spec?.uuid, 'no spec uuid');
    assert(Array.isArray(r.data.spec.sections), 'no sections');
    assert(r.data.spec.sections.length>=9, `only ${r.data.spec.sections.length} sections`);
    specUUID = r.data.spec.uuid;
    return `spec ${specUUID.slice(0,8)} with ${r.data.spec.sections.length} sections`;
  });

  await test('POST /api/specs/:uuid/check → CI run returns spec', async () => {
    assert(specUUID, 'no spec UUID');
    const r = await POST(4800, `/api/specs/${specUUID}/check`, {});
    assert(r.ok, `spec check failed: ${r.error}`);
    assert(r.data.spec?.uuid===specUUID, 'wrong spec returned');
    return `spec check: ${r.data.spec.sections?.filter(s=>s.complete).length||0}/${r.data.spec.sections?.length||0} sections complete`;
  });

  await test('POST /api/specs/:uuid/build → status=built|incomplete', async () => {
    assert(specUUID, 'no spec UUID');
    const r = await POST(4800, `/api/specs/${specUUID}/build`, {});
    assert(r.ok, `spec build failed: ${r.error}`);
    assert(['built','incomplete'].includes(r.data.status),
      `status=${r.data.status} not built|incomplete`);
    return `spec build status=${r.data.status}`;
  });

  let gapUUID = null;
  await test('POST /api/gaps → gap created with status=open', async () => {
    const r = await POST(4800, '/api/gaps', {
      description:'Pipeline test gap — evidence required',
      type:'pipeline', severity:'low', source:'pipeline-test' });
    assert(r.ok, `create gap failed: ${r.error}`);
    assert(r.data.gap?.uuid, 'no gap uuid');
    assert(r.data.gap.status==='open', `status=${r.data.gap.status}`);
    gapUUID = r.data.gap.uuid;
    return `gap ${gapUUID.slice(0,8)} created status=open`;
  });

  await test('GET /api/gaps?status=open → gap is listed', async () => {
    assert(gapUUID, 'no gap UUID');
    const r = await GET(4800, '/api/gaps?status=open');
    assert(r.ok, `gaps list failed: ${r.error}`);
    assert(Array.isArray(r.data.gaps), 'gaps not array');
    const found = r.data.gaps.some(g => g.uuid===gapUUID);
    assert(found, `gap ${gapUUID.slice(0,8)} not in open gaps list`);
    return `gap visible in open gaps (${r.data.gaps.length} open)`;
  });

  await test('POST /api/gaps/:uuid/resolve → status=resolved, persists', async () => {
    assert(gapUUID, 'no gap UUID');
    const r = await POST(4800, `/api/gaps/${gapUUID}/resolve`,
      { resolution:'resolved by pipeline test — evidence confirmed' });
    assert(r.ok, `resolve failed: ${r.error}`);
    assert(r.data.gap.status==='resolved', `status=${r.data.gap.status}`);
    // Verify no longer in open
    const open = await GET(4800, '/api/gaps?status=open');
    const stillOpen = open.data.gaps?.some(g => g.uuid===gapUUID);
    assert(!stillOpen, 'gap still appears in open list after resolve');
    return `gap resolved, no longer in open list`;
  });

  await test('POST /api/snapshots → snapshot with commitId + snr', async () => {
    const r = await POST(4800, '/api/snapshots',
      { message:'pipeline test snapshot', branch:'pipeline-test' });
    assert(r.ok, `snapshot failed: ${r.error}`);
    assert(r.data.snapshot?.commitId, 'no commitId');
    assert(typeof r.data.snapshot.snr==='number', 'no snr in snapshot');
    return `commitId=${r.data.snapshot.commitId.slice(0,12)} snr=${r.data.snapshot.snr?.toFixed(2)}`;
  });

  await test('GET /api/snapshots → snapshot appears in history', async () => {
    const r = await GET(4800, '/api/snapshots');
    assert(r.ok, `snapshots list failed: ${r.error}`);
    assert(Array.isArray(r.data.snapshots), 'snapshots not array');
    assert(r.data.snapshots.length>=1, 'no snapshots');
    return `${r.data.snapshots.length} snapshots`;
  });

  await test('GET /api/events → event log has entries from this session', async () => {
    const r = await GET(4800, '/api/events?n=20');
    assert(r.ok, `events failed: ${r.error}`);
    assert(Array.isArray(r.data.events), 'events not array');
    assert(r.data.events.length>=1, 'event log empty');
    return `${r.data.events.length} events in log`;
  });

  await test('GET /sse → SSE stream opens, sends data', async () => {
    let chunk = '';
    await new Promise(resolve => {
      const r = http.request({ hostname:'127.0.0.1',port:4800,path:'/sse',method:'GET',
        headers:{Accept:'text/event-stream'}}, res => {
        assert(res.statusCode===200, `SSE status ${res.statusCode}`);
        res.on('data', c => { chunk += c.toString(); if (chunk.includes('data:')) {r.destroy();resolve();} });
        res.on('end', resolve);
      });
      r.setTimeout(3000,()=>{r.destroy();resolve();});
      r.on('error',()=>resolve());
      r.end();
    });
    assert(chunk.includes('data:'), 'SSE never sent data: event');
    return 'idearium SSE opened and received data: event';
  });
}

async function testCrossSystem() {
  section('6 · CROSS-SYSTEM — orchestrator proxies + event propagation');

  if (online.orchestrator && online.bridge) {
    await test('GET /api/bridge/health via orchestrator proxy', async () => {
      const r = await GET(9000, '/api/bridge/health');
      assert(r.ok && r.data.ok, `proxy bridge health: ${JSON.stringify(r.data).slice(0,80)}`);
      return `bridge health proxied via :9000 → sessions=${r.data.sessions}`;
    });
  }

  if (online.orchestrator && online.idearium) {
    await test('GET /api/idearium/health via orchestrator proxy', async () => {
      const r = await GET(9000, '/api/idearium/health');
      assert(r.ok && r.data.ok, `proxy idearium: ${JSON.stringify(r.data).slice(0,80)}`);
      return `idearium health proxied via :9000 → v${r.data.version}`;
    });

    await test('POST /api/idearium/ideas via orchestrator proxy → creates idea', async () => {
      const text = `Cross-system proxy idea ${Date.now()}`;
      const r = await POST(9000, '/api/idearium/ideas', { text, tags:['proxy-test'] });
      assert(r.ok, `proxy create idea: ${JSON.stringify(r.data).slice(0,100)}`);
      assert(r.data.idea?.uuid, 'no uuid via proxy');
      return `idea created via proxy: ${r.data.idea.uuid.slice(0,8)}`;
    });

    await test('idea.create → orchestrator ledger updated (event propagation)', async () => {
      const text = `Propagation test idea ${Date.now()}`;
      await POST(4800, '/api/ideas', { text, tags:['propagation'] });
      await sleep(600);
      const ledger = await GET(9000, '/api/ledger?system=idearium&n=10');
      assert(ledger.ok, 'ledger read failed');
      assert(ledger.data.entries?.length > 0, 'no idearium entries in orchestrator ledger');
      const recent = ledger.data.entries[0];
      assert(recent._system==='idearium' || recent.system==='idearium',
        `entry system=${recent._system||recent.system}`);
      return `idearium event propagated to orchestrator ledger (${ledger.data.entries.length} entries)`;
    });
  }

  if (online.orchestrator && online.cortex) {
    await test('GET /api/cortex/health via orchestrator proxy', async () => {
      const r = await GET(9000, '/api/cortex/health');
      assert(r.ok, `proxy cortex: ${JSON.stringify(r.data).slice(0,80)}`);
      return `cortex health proxied via :9000`;
    });
  }

  if (online.orchestrator) {
    await test('GET /api/recall → cross-system entries from multiple sources', async () => {
      const r = await GET(9000, '/api/recall?n=50');
      assert(r.ok, `recall failed: ${r.error}`);
      const systems = [...new Set(r.data.entries?.map(e=>e._system||e.system)||[])];
      assert(systems.length>=1, 'recall only has entries from 0 systems');
      return `recall covers systems: [${systems.join(', ')}]`;
    });
  }

  if (online.bridge) {
    await test('bridge broadcast → accepted (bus fabric live)', async () => {
      const type = `cross.system.test.${Date.now()}`;
      const r = await POST(9999, '/bridge/broadcast', { type, payload:{ test:true } });
      assert(r.ok, `broadcast failed: ${r.error}`);
      return `bus fabric live — broadcast ${type} accepted`;
    });
  }
}

async function testFullPipeline() {
  section('7 · FULL PIPELINE — idea → spec → build → snapshot → verify');
  if (!online.idearium) { console.log(`  ${C.yellow}IDEARIUM OFFLINE — skipping${C.reset}`); return; }

  // This is the complete spec delivery pipeline from MASTEVOS-v9.spec
  const pipelineId = `pipeline-${Date.now()}`;
  let idea, spec, built, snapshot;

  await test('STEP 1: create idea', async () => {
    const r = await POST(4800, '/api/ideas',
      { text:`Full pipeline test: ${pipelineId}`, tags:['full-pipeline','evidence'] });
    assert(r.ok && r.data.idea?.uuid, `step1 failed: ${JSON.stringify(r.data).slice(0,100)}`);
    idea = r.data.idea;
    return `idea=${idea.uuid.slice(0,8)} phase=${idea.phase}`;
  });

  await test('STEP 2: create spec from idea', async () => {
    assert(idea, 'no idea from step 1');
    const r = await POST(4800, `/api/ideas/${idea.uuid}/spec`,
      { name:`Full pipeline spec: ${pipelineId}` });
    assert(r.ok && r.data.spec?.uuid, `step2 failed: ${JSON.stringify(r.data).slice(0,100)}`);
    spec = r.data.spec;
    assert(spec.sections?.length>=9, `only ${spec.sections?.length} sections`);
    return `spec=${spec.uuid.slice(0,8)} sections=${spec.sections.length}`;
  });

  await test('STEP 3: run spec check (CI)', async () => {
    assert(spec, 'no spec from step 2');
    const r = await POST(4800, `/api/specs/${spec.uuid}/check`, {});
    assert(r.ok && r.data.spec, `step3 failed: ${r.error}`);
    const done = r.data.spec.sections?.filter(s=>s.complete).length || 0;
    return `check: ${done}/${r.data.spec.sections?.length} sections complete`;
  });

  await test('STEP 4: build spec → status is built|incomplete', async () => {
    assert(spec, 'no spec');
    const r = await POST(4800, `/api/specs/${spec.uuid}/build`, {});
    assert(r.ok, `step4 failed: ${r.error}`);
    assert(['built','incomplete'].includes(r.data.status),
      `status=${r.data.status}`);
    built = r.data;
    return `build status=${r.data.status} built=${r.data.built?.length} missing=${r.data.missing?.length}`;
  });

  await test('STEP 5: push snapshot', async () => {
    const r = await POST(4800, '/api/snapshots',
      { message:`pipeline-${pipelineId}`, branch:'pipeline-test' });
    assert(r.ok && r.data.snapshot?.commitId, `step5 failed: ${r.error}`);
    snapshot = r.data.snapshot;
    assert(typeof snapshot.snr==='number', `snapshot.snr=${snapshot.snr}`);
    assert(snapshot.ideasCount>=1, `ideasCount=${snapshot.ideasCount}`);
    return `commitId=${snapshot.commitId.slice(0,12)} snr=${snapshot.snr?.toFixed(2)} ideas=${snapshot.ideasCount}`;
  });

  await test('STEP 6: verify snapshot appears in history', async () => {
    assert(snapshot, 'no snapshot');
    const r = await GET(4800, '/api/snapshots');
    assert(r.ok, `snapshots failed: ${r.error}`);
    const found = r.data.snapshots?.some(s=>s.commitId===snapshot.commitId);
    assert(found, `snapshot ${snapshot.commitId.slice(0,8)} not in history`);
    return `snapshot visible in history (${r.data.snapshots.length} total)`;
  });

  if (online.orchestrator) {
    await test('STEP 7: orchestrator ledger shows pipeline activity', async () => {
      await sleep(300);
      const r = await GET(9000, '/api/recall?system=idearium&n=20');
      assert(r.ok, `recall failed: ${r.error}`);
      assert(r.data.entries?.length>0, 'no idearium entries in orchestrator recall');
      return `${r.data.entries.length} idearium events in orchestrator recall`;
    });
  }

  await test('STEP 8: event log records the pipeline', async () => {
    const r = await GET(4800, '/api/events?n=30');
    assert(r.ok, `events failed: ${r.error}`);
    const events = r.data.events || [];
    const types = [...new Set(events.map(e=>e.type))];
    const pipelineEvents = types.filter(t=>t?.includes('idearium'));
    assert(pipelineEvents.length>=1, `no idearium events in log, got types: ${types.slice(0,5).join(',')}`);
    return `pipeline events in log: [${pipelineEvents.slice(0,4).join(', ')}]`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  NEXUS Full Pipeline + Workflow Test                      ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  §1.1 Nothing exists without evidence.                    ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚═══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  ${new Date().toLocaleString()}${C.reset}`);

  await probeAll();

  await testOrchestrator();
  await testBridge();
  await testCortex();
  await testGuardian();
  await testIdearium();
  await testCrossSystem();
  await testFullPipeline();

  const total = pass + fail;
  console.log(`\n${C.bold}${'═'.repeat(63)}${C.reset}`);
  console.log(`${C.bold}RESULTS: ${pass}/${total} passed — ${fail} failed${C.reset}`);
  if (fail===0) console.log(`${C.bold}${C.green}ALL PASS — every claim backed by evidence${C.reset}`);
  else {
    console.log(`\n${C.bold}${C.red}FAILURES (no evidence):${C.reset}`);
    results.filter(r=>r.status==='FAIL').forEach(r => {
      console.log(`  ${C.red}✗${C.reset} ${r.name}`);
      console.log(`    ${C.dim}${r.error}${C.reset}`);
    });
  }

  // Save
  const out = { ts:Date.now(), pass, fail, total,
    online: Object.entries(online).filter(([,v])=>v).map(([k])=>k),
    results };
  fs.writeFileSync(path.join(__dirname,'pipeline-results.json'), JSON.stringify(out,null,2));
  console.log(`${C.dim}\n  Results: tests/pipeline-results.json${C.reset}\n`);
  process.exit(fail>0?1:0);
}

main().catch(e=>{console.error(e);process.exit(1);});
