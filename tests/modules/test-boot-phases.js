'use strict';
const assert = require('assert');
const http = require('http');
let passed = 0, failed = 0;
const _tests = [];
function test(id, desc, fn) { _tests.push({ id, desc, fn }); }

const { _phasePlan, _pollHealth, ALL_KERNELS } = require('../../nexus/autopilot.js');

test('T-001', 'phase plan groups kernels by ascending phase', () => {
  const plan = _phasePlan([
    { name: 'c', phase: 3 }, { name: 'a', phase: 1 }, { name: 'b', phase: 2 }, { name: 'b2', phase: 2 },
  ]);
  assert.deepStrictEqual(plan.map(p => p.phase), [1, 2, 3]);
  assert.deepStrictEqual(plan[1].kernels.map(k => k.name).sort(), ['b', 'b2']);
});

test('T-002', 'onDemand kernels are excluded from the boot plan', () => {
  const plan = _phasePlan([
    { name: 'a', phase: 1 }, { name: 'cg', phase: 1, onDemand: true },
  ]);
  assert.strictEqual(plan.length, 1);
  assert.deepStrictEqual(plan[0].kernels.map(k => k.name), ['a']);
});

test('T-003', 'a kernel with no phase lands in a final catch-all phase, flagged, never silently dropped', () => {
  const plan = _phasePlan([
    { name: 'a', phase: 1 }, { name: 'mystery' },
  ]);
  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[1].undeclared, true);
  assert.deepStrictEqual(plan[1].kernels.map(k => k.name), ['mystery']);
  assert.ok(plan[1].phase > plan[0].phase);
});

test('T-004', 'the REAL kernel table plans in the intended order: cortex → orchestrator+core → apps → emerge', () => {
  // §UPDATED 2026-07-24 — this assertion encoded the ORIGINAL intent
  // (orchestrator first, as registration authority). James changed that
  // intent: "can we make sure that autopilot boots in phases, like cortex
  // first, gated each step." Cortex is the memory core AND, since his
  // 2026-07-24 storage decision, the data root every other system writes
  // into — so the store now comes up before its writers. The test moved with
  // the declared intent rather than being deleted to make the reorder pass,
  // and the reorder was verified safe first: cortex/boot.js's _register() is
  // fire-and-forget with a 5s retry, so it never blocks on orchestrator.
  const plan = _phasePlan(ALL_KERNELS);
  assert.deepStrictEqual(plan[0].kernels.map(k => k.name), ['cortex']);
  assert.deepStrictEqual(plan[1].kernels.map(k => k.name).sort(),
    ['bridge', 'diagnostic', 'guardian', 'orchestrator']);
  assert.ok(plan[2].kernels.map(k => k.name).includes('copilot'));
  assert.deepStrictEqual(plan[3].kernels.map(k => k.name), ['emerge']);
  // clear-glass must NOT appear anywhere — it's onDemand
  for (const p of plan) assert.ok(!p.kernels.some(k => k.name === 'clear-glass'));
});

test('T-005', 'every always-on kernel except emerge declares a healthUrl (emerge has no HTTP surface)', () => {
  for (const k of ALL_KERNELS.filter(k => !k.onDemand)) {
    if (k.name === 'emerge') { assert.strictEqual(k.healthUrl, undefined); continue; }
    assert.ok(k.healthUrl, `${k.name} missing healthUrl — its phase gate would be a no-op`);
    assert.ok(Number.isFinite(k.phase), `${k.name} missing phase`);
  }
});

// ── Gate behavior against a real local HTTP server ────────────────────────────

test('T-006', '_pollHealth passes on 200', async () => {
  const srv = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const healthy = await _pollHealth(`http://127.0.0.1:${port}/health`, 3000);
  srv.close();
  assert.strictEqual(healthy, true);
});

test('T-007', '_pollHealth retries through early 503s and passes once the service becomes ready (the fixed behavior)', async () => {
  let calls = 0;
  const srv = http.createServer((req, res) => {
    calls++;
    if (calls < 3) { res.writeHead(503); res.end('booting'); }
    else { res.writeHead(200); res.end('ok'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const healthy = await _pollHealth(`http://127.0.0.1:${port}/health`, 8000);
  srv.close();
  assert.strictEqual(healthy, true, 'must retry past 503s — the pre-fix behavior failed permanently on the first 503');
  assert.ok(calls >= 3);
});

test('T-008', '_pollHealth times out honestly against a port nothing listens on', async () => {
  const healthy = await _pollHealth('http://127.0.0.1:1/health', 1200);
  assert.strictEqual(healthy, false);
});

(async () => {
  for (const { id, desc, fn } of _tests) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
