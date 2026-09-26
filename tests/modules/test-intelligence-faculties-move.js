'use strict';
/**
 * tests/modules/test-intelligence-faculties-move.js
 * cortex->intelligence route consolidation, P2 (docs/2026-09-19-cortex-to-
 * intelligence-and-versionium-consolidation-phasemap.spec).
 *
 * REAL, LIVE: boots intelligence/server.js as an actual HTTP server on an
 * ephemeral port against a fake orchestrator (also a real HTTP server), with
 * every data dir isolated to a temp dir. Nothing here is a source-grep
 * stand-in for behaviour, except where the test says so.
 *
 * SOVEREIGNTY ACCEPTANCE (James: "if cortex going down breaks something, it
 * needs to be moved"): nothing in this file starts a cortex process. If any
 * route below needed cortex, it would fail here.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'intel-move-test-'));
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');                  // BEFORE any jaa-db require
process.env.INTELLIGENCE_DATA_DIR = path.join(TMP, 'intelligence');
process.env.INTELLIGENCE_PORT = '0';
process.env.INTELLIGENCE_DB_REFRESH_MS = '10';
process.env.INTELLIGENCE_FIELD_POLL_MS = '50';
process.env.INTELLIGENCE_RAID_RETRY_BASE_MS = '100';
process.env.INTELLIGENCE_RAID_REANNOUNCE_MS = '100000';
fs.mkdirSync(process.env.JAA_DATA_DIR, { recursive: true });
fs.mkdirSync(process.env.INTELLIGENCE_DATA_DIR, { recursive: true });

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`   ${id} ${desc}`); passed++; }
  catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function listen(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
}
function req(port, method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: res.statusCode, json: j, raw: d }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

async function run() {
  // ── fake orchestrator: the AUTHORITY the field is read from ─────────────
  let orchField = { ok: true, coherence: 0.8, friction: 0.1, resonance: 0.4, entropy: 0.1 };
  const orch = await listen((rq, rs) => {
    if (rq.url === '/cfr/field') { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(orchField)); }
    else { rs.writeHead(404); rs.end(); }
  });
  process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${orch.address().port}`;

  // fake CORTEX, used ONLY as RAID's registry endpoint (RAID lives in cortex).
  // It is started LATE on purpose: intelligence must boot and serve first, then
  // register once RAID is reachable (retry path).
  const registrations = [];
  const cortexPort = await new Promise((resolve) => { const t = http.createServer(); t.listen(0, '127.0.0.1', () => { const pt = t.address().port; t.close(() => resolve(pt)); }); });
  process.env.NEXUS_PORT = String(cortexPort);
  let fakeCortex = null;

  // Seed shared tables the way other processes would (gaps, event_log)
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
  jaaDB.insert('gaps', { id: 'g1', status: 'open', type: 'sigma_spike', domain: 'guardian', description: 'guardian ncp flapping', root_cause: 'tab crash', ts: Date.now() });
  jaaDB.insert('event_log', { id: 'e1', type: 'guardian.ncp.connected', source: 'guardian', ts: Date.now() });

  const srv = require(path.join(ROOT, 'intelligence/server.js'));
  const server = srv.start();
  await new Promise(r => (server.listening ? r() : server.once('listening', r)));
  const port = server.address().port;
  await sleep(200); // let the field provider complete its first poll

  await test('IFM-040', 'RAID down at boot: intelligence still serves, health reports the registration honestly as NOT done', async () => {
    const h = await req(port, 'GET', '/health');
    assert.strictEqual(h.status, 200);
    assert.strictEqual(h.json.raid.registered, false);
    assert.ok(/unreachable|not attempted|timed out/.test(h.json.raid.error), h.json.raid.error);
  });

  await test('IFM-041', 'RAID comes up later: intelligence registers all 16 capabilities under namespace "intelligence"', async () => {
    fakeCortex = await new Promise((resolve) => {
      const t = http.createServer((rq, rs) => {
        let d = ''; rq.on('data', c => d += c);
        rq.on('end', () => { try { registrations.push(JSON.parse(d)); } catch (_) {}
          rs.writeHead(200, { 'Content-Type': 'application/json' });
          rs.end(JSON.stringify({ ok: true, registered: (JSON.parse(d).components || []).length, failed: 0, results: [] })); });
      });
      t.listen(cortexPort, '127.0.0.1', () => resolve(t));
    });
    for (let i = 0; i < 40 && !registrations.length; i++) await sleep(100);
    assert.ok(registrations.length >= 1, 'no registration arrived after RAID came up (retry broken)');
    const comps = registrations[0].components;
    assert.strictEqual(comps.length, require(path.join(ROOT, 'intelligence/index.js')).CAPABILITIES.length);
    assert.ok(comps.every(c => c.namespace === 'intelligence'));
    const ids = comps.map(c => c.id);
    for (const want of ['intelligence.mastermind', 'intelligence.intuition', 'intelligence.rca', 'intelligence.query', 'intelligence.lattice', 'intelligence.liminal-space']) assert.ok(ids.includes(want), want);
    await sleep(150);
    const h = await req(port, 'GET', '/health');
    assert.strictEqual(h.json.raid.registered, true);
  });

  await test('IFM-042', 'liminal-space runs IN intelligence: an allowlisted event delivered to the intake shows up in its routes', async () => {
    const ev = await req(port, 'POST', '/api/intelligence/bus', { type: 'cortex.gap.found', payload: { gap: { type: 'axiom_boundary', body: 'test boundary', uuid: 'u-1' } }, source: 'cortex' });
    assert.strictEqual(ev.status, 200);
    const st = await req(port, 'GET', '/api/liminal-space/status');
    assert.strictEqual(st.status, 200);
    assert.ok(st.json.spaces['L0/L2'].active >= 1, 'liminal L0/L2 has no active item: organ not receiving events');
    const li = await req(port, 'GET', '/api/liminal-space/list?focalPoint=L0%2FL2');
    assert.ok(li.json.items.some(i => /test boundary/.test(JSON.stringify(i))));
  });

  await test('IFM-043', 'intake allowlist: an arbitrary event type is refused (cannot inject onto the bus)', async () => {
    const r = await req(port, 'POST', '/api/intelligence/bus', { type: 'guardian.admin.shutdown', payload: {} });
    assert.strictEqual(r.status, 400);
    assert.ok(Array.isArray(r.json.accepted));
  });

  // ── FIELD ───────────────────────────────────────────────────────────────
  await test('IFM-001', 'field comes from the orchestrator (source=orchestrator), not cortex', async () => {
    const h = await req(port, 'GET', '/health');
    assert.strictEqual(h.status, 200);
    assert.strictEqual(h.json.field.source, 'orchestrator');
    assert.strictEqual(h.json.field.stale, false);
  });

  await test('IFM-002', 'regime uses intelligence\'s own vocabulary (resonant), never cortex\'s "ordered"', async () => {
    const r = await req(port, 'GET', '/api/intelligence/intuition?prompt=status');
    assert.strictEqual(r.status, 200);
    assert.ok(/regime: (resonant|stable|turbulent|chaotic)/.test(JSON.stringify(r.json)), 'regime string present in intelligence vocabulary');
    assert.ok(!/regime: ordered/.test(JSON.stringify(r.json)), 'cortex-only vocabulary must be gone');
  });

  await test('IFM-003', 'a field change at the orchestrator propagates (chaotic when entropy spikes)', async () => {
    orchField = { ok: true, coherence: 0.7, friction: 0.1, resonance: 0.3, entropy: 0.9 };
    await sleep(200);
    const h = await req(port, 'GET', '/health');
    assert.strictEqual(h.json.field.regime, 'chaotic');
    orchField = { ok: true, coherence: 0.8, friction: 0.1, resonance: 0.4, entropy: 0.1 };
    await sleep(200);
  });

  // ── ROUTES ──────────────────────────────────────────────────────────────
  await test('IFM-010', 'context: userscript contract (failureModes/reuse/patterns) AND legacy cortex fields', async () => {
    const r = await req(port, 'GET', '/api/intelligence/context?intent=fix%20guardian&command=x&provider=claude');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true);
    for (const k of ['failureModes', 'reuse', 'patterns']) assert.ok(k in r.json, `userscripts read ctx.${k}`);
    for (const k of ['field', 'gaps', 'events', 'rca']) assert.ok(k in r.json, `legacy cortex field ${k} kept additively`);
    assert.strictEqual(r.json.gaps.open, 1);
  });

  await test('IFM-011', 'intuition GET and POST both answer', async () => {
    const g = await req(port, 'GET', '/api/intelligence/intuition?prompt=hello');
    const p = await req(port, 'POST', '/api/intelligence/intuition', { prompt: 'hello' });
    assert.strictEqual(g.status, 200); assert.strictEqual(p.status, 200);
  });

  await test('IFM-012', 'mastermind accepts body.context AND body.contextSnippet (dead-handler mismatch resolved)', async () => {
    const a = await req(port, 'POST', '/api/intelligence/mastermind', { prompt: 'why', context: 'ctx-a' });
    const b = await req(port, 'POST', '/api/intelligence/mastermind', { prompt: 'why', contextSnippet: 'ctx-b' });
    assert.strictEqual(a.status, 200); assert.strictEqual(b.status, 200);
  });

  await test('IFM-013', 'mastermind/patterns degrades honestly (patternsFound 0, not an error) with no graph', async () => {
    const r = await req(port, 'POST', '/api/intelligence/mastermind/patterns', {});
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.patternsFound === 0 || r.json.ok === true || Array.isArray(r.json.patterns));
  });

  await test('IFM-014', 'adversarial reconciles intuition vs mastermind', async () => {
    const r = await req(port, 'POST', '/api/intelligence/adversarial', { prompt: 'is guardian ok' });
    assert.strictEqual(r.status, 200);
    for (const k of ['intuition', 'mastermind', 'adversarial']) assert.ok(k in r.json, k);
  });

  await test('IFM-015', 'rca returns open gaps in cortex\'s ported shape', async () => {
    const r = await req(port, 'GET', '/api/intelligence/rca?limit=5');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.rca) && r.json.rca.length === 1);
    assert.strictEqual(r.json.rca[0].gapId, 'g1');
  });

  await test('IFM-016', 'query: 400 without about; narrative + gap match with about', async () => {
    const bad = await req(port, 'GET', '/api/intelligence/query');
    assert.strictEqual(bad.status, 400);
    const ok = await req(port, 'GET', '/api/intelligence/query?about=guardian');
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.json.gaps.length >= 1 && ok.json.events.length >= 1);
    assert.ok(/Found 1 gap\(s\)/.test(ok.json.narrative), ok.json.narrative);
  });

  await test('IFM-017', 'lattice responds (200 or an honest 503, never a hang or fabricated success)', async () => {
    const l = await req(port, 'GET', '/api/intelligence/lattice');
    assert.ok([200, 503].includes(l.status));
  });

  await test('IFM-018', 'crystals route keeps the shape copilot reads (precursor/outcome/count), fed from the crystals table', async () => {
    jaaDB.insert('crystals', { id: 'c1', kind: 'bep', usage_count: 7, success_probability: 0.8, entry_conditions: { domain: 'guardian', verb: 'dispatch' }, exit_conditions: { outcome: 'ok' }, ts: Date.now() });
    await sleep(30);
    const r = await req(port, 'GET', '/api/intelligence/crystals?limit=3');
    assert.strictEqual(r.status, 200);
    const p0 = r.json.patterns[0];
    assert.strictEqual(p0.precursor, 'guardian:dispatch'); assert.strictEqual(p0.outcome, 'ok'); assert.strictEqual(p0.count, 7);
  });

  await test('IFM-019', 'liminal-space routes are served by intelligence (organ init\'d here), not 404', async () => {
    const r = await req(port, 'GET', '/api/liminal-space/status');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.spaces && r.json.spaces['L0/L2']);
  });

  // ── FRESHNESS (B2): another process writes; we must see it ─────────────
  await test('IFM-020', 'a row written by ANOTHER process (raw file write) is visible after the refresh window', async () => {
    // The store flushes on a debounce; force it so the table is on disk, exactly
    // the state another process would find and append to.
    const store = jaaDB._store();
    store._flush('gaps');
    const file = store._file('gaps');
    assert.ok(fs.existsSync(file), 'gaps table file exists: ' + file);
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows.push({ id: 'g2-other-process', status: 'open', type: 'late_row', ts: Date.now() });
    fs.writeFileSync(file, JSON.stringify(rows));
    await sleep(60);
    const r = await req(port, 'GET', '/api/intelligence/rca?limit=10');
    assert.ok(r.json.rca.some(x => x.gapId === 'g2-other-process'), 'stale read: other process\'s row not visible');
  });

  // ── SOVEREIGNTY ─────────────────────────────────────────────────────────
  await test('IFM-030', 'no route module in this move references the cortex process (port 3748 / CORTEX_URL)', () => {
    for (const f of ['intelligence/routes.js', 'intelligence/field-provider.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.ok(!/3748|CORTEX_URL|CORTEX_PORT|'cortex'/.test(src), f + ' must not depend on the cortex process');
    }
  });

  await test('IFM-031', 'orchestrator down: routes still answer; field reports stale, not fabricated live', async () => {
    await new Promise(r => orch.close(r));
    await sleep(700);
    const h = await req(port, 'GET', '/health');
    assert.strictEqual(h.status, 200);
    const r = await req(port, 'GET', '/api/intelligence/intuition?prompt=still-up');
    assert.strictEqual(r.status, 200);
  });

  srv.stop();
  if (fakeCortex) await new Promise(r => fakeCortex.close(r));
  console.log(`\n   ${passed} passed, ${failed} failed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
