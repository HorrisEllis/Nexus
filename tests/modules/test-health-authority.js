'use strict';
/**
 * tests/modules/test-health-authority.js — pins the 2026-07-24 reconciliation
 * of the competing health checkers.
 *
 * THE PHASE MAP OVERSTATED THIS, and reading the three properly corrected it.
 * The earlier claim was "three independent checkers, three answers to 'is
 * guardian healthy'". Wrong:
 *
 *   autopilot _pollHealth  is NOT a competing truth. It answers a DIFFERENT
 *     question — "has this kernel come up yet?" — with retry-until-timeout
 *     semantics where a non-2xx means "not ready", not "failed". It runs once
 *     per spawn as a boot gate. Folding it into a shared authority would be
 *     actively wrong: a supervisor must judge liveness without depending on
 *     the systems it supervises.
 *
 *   orchestrator vs diagnostic WAS a real §10.3 competing truth:
 *     orchestrator: 3s probe OR registry lastSeen < 15s  → online
 *     diagnostic:   2s probe, NO registry fallback       → online
 *   A system alive but briefly slow to answer was online to orchestrator and
 *   offline to diagnostic AT THE SAME MOMENT. And diagnostic ACTS on its
 *   answer — raising a system_offline gap and firing HEAL_REQUESTED — so the
 *   divergence was a spurious-heal generator that fired hardest exactly when
 *   the system was under load and slow.
 *
 * Fix: orchestrator is the registration authority (every system registers and
 * heartbeats there), so it owns liveness. Diagnostic defers to it instead of
 * holding a private opinion, consulted over HTTP per the decoupling law.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const DIAG = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');
const ORCH = fs.readFileSync(path.join(ROOT, 'orchestrator', 'orchestrator.js'), 'utf8');
const AP   = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');

(async () => {
  await test('HA-001', 'diagnostic now consults the registry before declaring a system offline', () => {
    assert.ok(/COMPETING TRUTH FIXED/.test(DIAG), 'the fix must be documented where it happens');
    assert.ok(/api\/registry/.test(DIAG), 'must consult orchestrator\'s registry');
    assert.ok(/registry-fallback/.test(DIAG), 'and record WHICH source decided the answer');
  });

  await test('HA-002', 'the fallback threshold MATCHES orchestrator\'s — the two can no longer disagree by construction', () => {
    // orchestrator: regOnline = lastSeen && (now - lastSeen) < 15000
    assert.ok(/< 15000/.test(ORCH), 'orchestrator uses a 15s registry window');
    assert.ok(/< 15000/.test(DIAG), 'diagnostic must use the SAME window — a different number would just move the disagreement');
  });

  await test('HA-003', 'it consults over HTTP, never by require — the decoupling law', () => {
    assert.ok(!/require\(['"]\.\.\/orchestrator/.test(DIAG), 'must not import orchestrator internals');
    const block = DIAG.slice(DIAG.indexOf('COMPETING TRUTH FIXED'), DIAG.indexOf('Feed to baseline'));
    assert.ok(/http\.get/.test(block), 'must reach it over HTTP');
  });

  await test('HA-004', 'a registry that cannot be reached leaves the local probe standing, with the degradation NAMED', () => {
    const block = DIAG.slice(DIAG.indexOf('COMPETING TRUTH FIXED'), DIAG.indexOf('Feed to baseline'));
    assert.ok(/probe-only\(registry unreachable\)/.test(block),
      'an unreachable authority must be recorded as a degraded answer, not silently trusted as authoritative');
    assert.ok(/onlineSource/.test(block), 'every answer must carry its provenance');
  });

  await test('HA-005', 'REAL: the parser matches orchestrator\'s ACTUAL registry shape, not an assumed one', async () => {
    // My first pass assumed { systems: [...] }. The real shape is
    // { ok, registry: { <id>: {...} } }. A wrong parser would have found
    // nothing forever — the fallback would look wired and never fire, which
    // is the exact failure class this session keeps surfacing.
    assert.ok(/reg\.registry && reg\.registry\[name\]/.test(DIAG), 'must read reg.registry[name]');
    assert.ok(/registryAll\(\)/.test(ORCH), 'and orchestrator must still serve that shape');

    // Prove it against a live server returning the genuine shape.
    const srv = http.createServer((q, s) => {
      s.writeHead(200, { 'Content-Type': 'application/json' });
      s.end(JSON.stringify({ ok: true, registry: { ghost: { systemId: 'ghost', lastSeen: Date.now() - 3000, online: true } }, ts: Date.now() }));
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    const reg = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/api/registry`, r => {
        let b = ''; r.on('data', d => b += d); r.on('end', () => resolve(JSON.parse(b)));
      });
    });
    srv.close();
    const entry = reg && reg.registry && reg.registry['ghost'];
    assert.ok(entry, 'the parser must find the entry in the real shape');
    assert.ok(Date.now() - entry.lastSeen < 15000, 'a system seen 3s ago is inside the window → rescued from false-offline');
  });

  await test('HA-006', 'a genuinely dead system is STILL declared offline — the fallback must not mask real death', () => {
    const staleLastSeen = Date.now() - 40000;
    assert.ok(!((Date.now() - staleLastSeen) < 15000),
      'a 40s-stale registration must fall outside the window, or the fix would suppress every real outage');
  });

  await test('HA-007', 'autopilot\'s boot gate is DELIBERATELY untouched — it answers a different question', () => {
    const fn = AP.slice(AP.indexOf('function _pollHealth'), AP.indexOf('function _pollHealth') + 1200);
    assert.ok(/not ready yet/.test(fn), 'a non-2xx during boot means "not ready", not "failed"');
    assert.ok(/setTimeout\(tick, 500\)/.test(fn), 'it retries — continuous checkers do not');
    assert.ok(!/api\/registry/.test(fn),
      'the supervisor must NOT depend on the registry of a system it supervises: at boot, orchestrator may not exist yet, and a supervisor that cannot judge liveness alone cannot restart anything');
  });

  await test('HA-008', 'the phase map records the correction rather than the original overstatement', () => {
    const map = fs.readFileSync(path.join(ROOT, 'docs/PHASE-MAP-TEMP.md'), 'utf8');
    assert.ok(/CORRECTED 2026-07-24/.test(map), 'the earlier claim must be visibly corrected, not quietly edited');
    assert.ok(/spurious-heal generator/.test(map), 'and name the real consequence');
    assert.ok(/is NOT a competing truth/.test(map), 'and exonerate autopilot explicitly');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
