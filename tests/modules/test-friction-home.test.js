'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-friction-home.test.js — CI6, 0.60.346. Map: docs/2026-10-31-causal-interconnect-phasemap.spec CI6; spec MOD-CI-FRICTION.
 * James, 2026-11-01: "Working, but it lives outside Intelligence, and Intelligence's atlas still marks Loom's friction source as unconfirmed.
 * move that to the intelligence system.."
 *   FH-01  Intelligence's GET /api/intelligence/friction: Diagnostic's per-system measure (asked through its door) beside CFR's field, each sourced
 *   FH-02  tension the same way
 *   FH-03  Diagnostic down: 502 naming it, CFR's field still given; never a 0
 *   FH-04  CI7, 0.60.350 — James: "migrating looms friction and tension system to the intelligence system". Tension computed in Intelligence from
 *          Diagnostic's /friction and Cortex's /api/gaps/tension: the same numbers as Diagnostic's §TENSION-05 for the same inputs
 *   FH-05  Cortex down: loop tension null and said, monitor tension still given
 *   FH-06  Cortex scores every open gap (25 → 25, not the newest 20 Diagnostic used to get), grouped by system, by its own fault taxonomy
 *   (Loom's side — its /api/friction asks Intelligence first, Diagnostic as the said fallback — is loom/test/friction-proxy.test.js T-001..T-003)
 */
const assert = require('assert'), http = require('http'), path = require('path'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
{ const log = console.log; console.log = (...a) => { if (!/^\[(jaa|intelligence|liminal|cortex)/.test(String(a[0]))) log(...a); }; }
let passed = 0, failed = 0, skipped = 0;
async function test(id, d, fn) { try { const r = await fn(); if (r === 'skip') { skipped++; return; } console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const free = (p) => new Promise(r => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });

(async () => {
  console.log('\n⬡  Friction and tension, Intelligence\'s (CI6)\n');
  const ports = require(path.join(ROOT, 'lib/nexus-config')).getPath('ports', {}); const port = ports.diagnostic, cport = ports.cortex;
  const { createRoutes } = require(path.join(ROOT, 'intelligence/routes.js'));
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
  const R = createRoutes({ jaaDB, getField: () => ({ friction: 0.31, coherence: 0.66, regime: 'stable' }) });
  const ask = async (p) => { let out = null; const handled = await R.handle('GET', p, new URLSearchParams(), {}, (s, d) => { out = { s, d }; }); return { handled, ...out }; };
  if (!(await free(port))) { console.log(`  - FH-01..03 SKIPPED: Diagnostic's port :${port} is in use here`); skipped += 3; }
  else {
    let up = true;
    const diag = http.createServer((req, res) => { if (!up) { res.statusCode = 503; return res.end('{}'); } res.setHeader('Content-Type', 'application/json');
      if (req.url === '/friction') return res.end(JSON.stringify({ ok: true, friction: { guardian: { friction: 0.12, sigma: 0.4, errorRate: 0.1, slope: 0.25, monitorGaps: 2 } }, ts: 1 }));
      if (req.url === '/tension') return res.end(JSON.stringify({ ok: true, tension: { guardian: { tension: 0.2 } }, ts: 2 }));
      res.statusCode = 404; res.end('{}'); });
    await new Promise(r => diag.listen(port, '127.0.0.1', r));
    var cortexUp = true;
    const cortex = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json');
      if (!cortexUp) { res.statusCode = 503; return res.end(JSON.stringify({ ok: false, error: 'stand-in down' })); }
      if (req.url === '/api/gaps/tension') return res.end(JSON.stringify({ ok: true, bySystem: { guardian: { total: 1.5, count: 3, top: [] } }, open: 3 }));
      res.statusCode = 404; res.end('{}'); });
    const cortexFree = await free(cport); if (cortexFree) await new Promise(r => cortex.listen(cport, '127.0.0.1', r));
    try {
      await test('FH-01', 'friction: Diagnostic\'s measure beside CFR\'s field, each sourced', async () => {
        const r = await ask('/api/intelligence/friction');
        assert.ok(r.handled && r.s === 200, JSON.stringify(r));
        assert.strictEqual(r.d.friction.guardian.friction, 0.12); assert.deepStrictEqual(r.d.field, { friction: 0.31, coherence: 0.66, regime: 'stable' });
        assert.deepStrictEqual(r.d.sources.map(s => [s.source, s.ok]), [['diagnostic', true], ['cfr', true]]); assert.strictEqual(r.d.by, 'intelligence');
      });
      await test('FH-02', 'tension: computed here, sourced (Diagnostic, Cortex, CFR)', async () => {
        const r = await ask('/api/intelligence/tension'); assert.ok(r.s === 200 && r.d.by === 'intelligence' && /friction\.js/.test(r.d.formula), JSON.stringify(r));
        assert.deepStrictEqual(r.d.sources.map(s => s.source), ['diagnostic', 'cortex', 'cfr']);
      });
      await test('FH-04', 'the same numbers as Diagnostic\'s formula for the same inputs', async () => {
        const r = await ask('/api/intelligence/tension'); const g = r.d.tension.guardian;
        const monitor = 0.12 * (1 + 2 * 0.2) * (1 + 0.25 * 2), loop = 1.5;   // the stand-in Cortex scores guardian's loops 1.5
        assert.strictEqual(g.monitorTension, Math.round(monitor * 1000) / 1000); assert.strictEqual(g.loopTension, loop);
        assert.strictEqual(g.tension, Math.round((monitor + loop * 0.3) * 1000) / 1000); assert.strictEqual(g.openLoops, 3);
        assert.strictEqual(g.regime, (monitor + loop * 0.3) > 0.4 ? 'elevated' : 'stable');
      });
      await test('FH-05', 'Cortex down: loop tension null and said; monitor tension still given', async () => {
        cortexUp = false;
        const r = await ask('/api/intelligence/tension'); const g = r.d.tension.guardian;
        assert.ok(r.s === 200 && g.loopTension === null && /Cortex did not answer/.test(g.loopsWhy) && g.monitorTension > 0 && r.d.loopsKnown === false, JSON.stringify(r.d).slice(0, 400));
        assert.strictEqual(r.d.sources.find(s => s.source === 'cortex').ok, false);
        cortexUp = true;
      });
      await test('FH-03', 'Diagnostic down: 502 naming it, the field still given', async () => {
        diag.close(); await new Promise(r => setTimeout(r, 100));
        const r = await ask('/api/intelligence/friction');
        assert.strictEqual(r.s, 502); assert.match(r.d.error, /diagnostic did not answer/); assert.strictEqual(r.d.field.friction, 0.31);
        assert.deepStrictEqual(r.d.sources.map(s => [s.source, s.ok]), [['diagnostic', false], ['cfr', true]]);
      });
    } finally { try { diag.close(); } catch (_) {} try { cortex.close(); } catch (_) {} }
  }
  await test('FH-06', 'Cortex scores every open gap, grouped by system, by its own taxonomy', () => {
    const FT = require(path.join(ROOT, 'cortex/self-heal/fault-taxonomy.js'));
    const gaps = Array.from({ length: 25 }, (_, i) => ({ uuid: `g${i}`, type: 'baseline_deviation', severity: i < 5 ? 'high' : 'low', source: i % 2 ? 'guardian/x' : 'loom/y' }));
    const by = FT.tensionBySystem(gaps);
    assert.strictEqual(by.guardian.count + by.loom.count, 25, 'all 25, not the newest 20');
    assert.strictEqual(by.guardian.top.length, 3); assert.ok(by.guardian.total > 0 && by.loom.total > 0);
    assert.strictEqual(by.guardian.total, Math.round(gaps.filter(g => g.source.startsWith('guardian')).reduce((n, g) => n + FT.scoreTension(g), 0) * 1000) / 1000);
  });
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
  process.exit(failed ? 1 : 0);
})();
