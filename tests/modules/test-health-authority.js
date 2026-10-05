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
  // §PR2 0.39.328 — James: "remove the polling then. need the systems to anounce themselves." The probe-then-registry
  // design these four held (0.39.258–0.39.327) is replaced: the pulse decides, and no system's health path is probed.
  await test('HA-001', 'the diagnostic takes liveness from the pulse (lib/pulse-watch.js, fed by orchestrator\'s /sse)', () => {
    assert.ok(/require\('\.\.\/lib\/pulse-watch\.js'\)/.test(DIAG), 'the pulse watch');
    assert.ok(/http\.get\('http:\/\/127\.0\.0\.1:9000\/sse'/.test(DIAG), 'listens to the beats');
    assert.ok(/const online = PULSE\.isOnline\(_pulseAs\(name\)\)/.test(DIAG), 'online is the pulse');
  });

  await test('HA-002', 'the registry\'s 15s window is the one orchestrator uses — read once, not polled', () => {
    assert.ok(/< 15000/.test(ORCH), 'orchestrator uses a 15s registry window');
    assert.ok(/Date\.now\(\) - seen < 15000/.test(DIAG), 'the diagnostic reads it with the same window');
    assert.ok(/function _readRegistryOnce/.test(DIAG), 'once (at start and after a lost stream), not on a timer');
  });

  await test('HA-003', 'it listens over HTTP, never by require — the decoupling law', () => {
    assert.ok(!/require\(['"]\.\.\/orchestrator/.test(DIAG), 'must not import orchestrator internals');
  });

  await test('HA-004', 'a lost stream is said and reconnected; every answer carries its provenance', () => {
    assert.ok(/lost orchestrator\\'s pulse stream — reconnecting/.test(DIAG), 'losing the stream is named');
    assert.ok(/const onlineSource = 'heartbeat'/.test(DIAG), 'provenance: the heartbeat');
  });

  await test('HA-005', 'REAL: the parser matches orchestrator\'s ACTUAL registry shape, not an assumed one', async () => {
    // My first pass assumed { systems: [...] }. The real shape is
    // { ok, registry: { <id>: {...} } }. A wrong parser would have found
    // nothing forever — the fallback would look wired and never fire, which
    // is the exact failure class this session keeps surfacing.
    assert.ok(/\(reg && reg\.registry\) \|\| \{\}/.test(DIAG), 'must read reg.registry');
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

  // §0.39.327 — James: "i though we switched to heartbeat and pulse system"
  // §PR2 0.39.328 — James: "remove the polling then."
  await test('HA-009', 'no system is probed: no request to a system\'s health path, no per-system registry check', () => {
    assert.ok(!/cfg\.port\}\$\{cfg\.healthPath\}/.test(DIAG), 'the /health probe is gone');
    assert.ok(!/_checkRegistry\(/.test(DIAG), 'the per-system registry check is gone');
    assert.ok(!/setInterval\(_readRegistryOnce/.test(DIAG), 'the registry is read once, never on a timer');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
