'use strict';
/**
 * tests/modules/test-cfr-field-authority.js
 * The CFR field's authority is the ORCHESTRATOR's own ledger (each system mounts
 * handleCFRRoute() on its own port). Cortex used to relay a copy; the relay is gone
 * (docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec).
 * REAL: a real ledger route mounted the way orchestrator/orchestrator.js mounts it, a
 * real HTTP server, and the real nexus-cfr-influence polling it.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cfr-auth-'));
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa'); fs.mkdirSync(process.env.JAA_DATA_DIR, { recursive: true });
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (port, p) => new Promise((res, rej) => http.get({ hostname: '127.0.0.1', port, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, json: JSON.parse(d) })); }).on('error', rej));

(async () => {
  const { createCFRLedger } = require(path.join(ROOT, 'intelligence/cfr/ledger'));
  const ledger = createCFRLedger({ ledgerDir: path.join(TMP, 'ledger'), systemId: 'orchestrator', maxHistory: 50 });
  ledger.open();
  const orch = http.createServer((req, res) => {           // exactly how orchestrator.js mounts it
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/cfr') && ledger.handleCFRRoute(req, res, u)) return;
    res.writeHead(404); res.end('{}');
  });
  await new Promise(r => orch.listen(0, '127.0.0.1', r));
  const port = orch.address().port;
  process.env.ORCHESTRATOR_PORT = String(port);

  await test('CFA-001', 'the orchestrator ledger\'s /cfr/field carries the real dimensions and NO tension', async () => {
    const r = await get(port, '/cfr/field');
    assert.strictEqual(r.status, 200);
    for (const k of ['coherence', 'friction', 'resonance', 'entropy', 'regime']) assert.ok(k in r.json, k);
    assert.ok(!('tension' in r.json), 'no CFR dimension is called tension');
    assert.ok(['stable', 'resonant', 'turbulent', 'chaotic'].includes(r.json.regime));
  });

  await test('CFA-002', 'nexus-cfr-influence runs its real poll against that route WITHOUT tension (previously skipped every poll)', async () => {
    const infl = require(path.join(ROOT, 'nexus/nexus-cfr-influence.js'));
    const bus = { emit() {}, setSigmaFloor() {} };
    infl.init({ bus, pollMs: 40 });
    for (let i = 0; i < 40 && !infl.getState().lastInfluenceAt; i++) await sleep(50);
    const st = infl.getState();
    infl.stop();
    assert.ok(st.lastInfluenceAt, 'influence() never ran: the poll is still being rejected');
    for (const k of ['coherence', 'friction', 'entropy', 'resonance']) assert.strictEqual(typeof st.lastField[k], 'number', k);
    assert.strictEqual(st.lastField.tension, undefined, 'tension must be genuinely absent, not fabricated');
    assert.strictEqual(infl.getSigmaFloor(), 0, 'with no tension the SNR floor stays untouched (same as the old constant 0.1)');
  });

  await test('CFA-003', 'influence() still acts on a real tension when one is supplied (branches kept, just guarded)', () => {
    const infl = require(path.join(ROOT, 'nexus/nexus-cfr-influence.js'));
    infl.init({ bus: { emit() {}, setSigmaFloor() {} }, pollMs: 1e9 });
    infl.influence({ tension: 0.9, coherence: 0.8, friction: 0.1, entropy: 0.1, resonance: 0.4 });
    const floor = infl.getSigmaFloor();
    infl.stop();
    assert.strictEqual(floor, 0.70);
  });

  ledger.close && ledger.close();
  await new Promise(r => orch.close(r));
  console.log(`\n   ${passed} passed, ${failed} failed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
