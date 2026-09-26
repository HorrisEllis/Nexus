'use strict';
/**
 * tests/modules/test-boot-log-fixes.js — pins the four defects found in
 * James's REAL boot log (2026-07-30), which was worth more than either
 * simulation round: it exercised the true startup ordering, on a real machine,
 * with real timing.
 *
 * Three of the four were mine, introduced the same session. The most important
 * one is a lesson about defensive features: my halt-on-fault gate did NOT
 * malfunction — it worked exactly as designed and, in doing so, converted a
 * long-standing latent misconfiguration into a total outage. A gate that stops
 * the boot is only as safe as the correctness of what it gates on.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
// §CAUGHT BEFORE IT SHIPPED — BL-009 is async, and a sync runner would have
// let it resolve after process.exit(), reporting a pass for a test that never
// actually ran. A false green is worse than a red.
const _async = [];
function testAsync(id, desc, fn) { _async.push([id, desc, fn]); }

const ROOT = path.join(__dirname, '../..');
const DIAG = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');
const CLI  = fs.readFileSync(path.join(ROOT, 'cli/diagnose.js'), 'utf8');
const LEDG = fs.readFileSync(path.join(ROOT, 'lib/component-ledger.js'), 'utf8');
const NC   = fs.readFileSync(path.join(ROOT, 'nexus', 'nexus-connect.js'), 'utf8');
const AP   = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');

// ── BUG 1: the diagnostic service never served /health ─────────────────────
test('BL-001', 'CRITICAL: diagnostic serves /health — the route autopilot has ALWAYS gated it on', () => {
  // It served /cfr/health, /audit/health and /status, but never /health. So it
  // could never pass its phase gate. Survivable while a stalled gate merely
  // warned — which is exactly why it went unnoticed for so long.
  assert.ok(/url\.pathname === '\/health'/.test(DIAG), 'the universal health route must exist');
  const kernel = AP.slice(AP.indexOf("name: 'diagnostic'"), AP.indexOf("name: 'diagnostic'") + 200);
  assert.ok(/7825\/health/.test(kernel), 'and match what autopilot gates on');
});

test('BL-002', '/health reports LIVENESS separately from what it OBSERVES — a monitor is not unhealthy because the things it watches are', () => {
  const route = DIAG.slice(DIAG.indexOf("url.pathname === '/health'"), DIAG.indexOf("url.pathname === '/status'"));
  assert.ok(/ok: true/.test(route), 'the service reports its own liveness');
  assert.ok(/systemsOffline/.test(route), 'and reports observed outages as data, not as its own failure');
  assert.ok(/uptimeMs/.test(route), 'with real uptime');
  assert.ok(!/version: VERSION\b/.test(route),
    'must not reference a VERSION constant that does not exist in scope — caught by RUNNING the route, not reading it');
});

test('BL-003', 'the halt-on-fault gate is UNCHANGED — it did not malfunction, it exposed a real defect', () => {
  // Worth pinning explicitly: the correct response to this incident was to fix
  // what the gate revealed, NOT to weaken the gate. A boot that marches past a
  // broken required kernel is how the misconfiguration survived unnoticed.
  assert.ok(/BOOT HALTED at phase/.test(AP), 'the halt must remain');
  assert.ok(/optional/.test(AP), 'and optional kernels must still not halt');
});

// ── BUG 2: the stall diagnostic knew only 5 of 13 kernels ──────────────────
test('BL-004', 'an unknown diagnostic target now RUNS cross-system checks instead of exiting useless', () => {
  // autopilot invokes `cli/diagnose.js <kernel>` for whichever kernel stalled,
  // but SYSTEM_MAP covers 5 of 13. For the other 8 it printed "Unknown system"
  // and exited 1 — producing no diagnosis at the one moment it existed for.
  assert.ok(/No system-specific diagnostic suite exists/.test(CLI), 'must explain rather than just refuse');
  assert.ok(/diagCrossSystem\(\)/.test(CLI) && /diagPortsFor\(TARGET\)/.test(CLI),
    'must still produce real findings for a kernel with no dedicated suite');
  assert.ok(/process\.exit\(2\)/.test(CLI), 'and use a distinct exit code from a hard failure');
});

test('BL-005', 'the generic port check reads autopilot\'s OWN kernel table — no second topology map to drift', () => {
  const fn = CLI.slice(CLI.indexOf('async function diagPortsFor'), CLI.indexOf('if (TARGET === \'all\')'));
  assert.ok(/ALL_KERNELS/.test(fn), 'must source ports from the supervisor, not a hardcoded copy (§10.3)');
  assert.ok(/is NOT SERVED/.test(fn),
    'and must name the most likely cause when a port is open but health does not answer — which is exactly what happened here');
});

// ── BUG 3: the schema warning drowned the boot log ─────────────────────────
test('BL-006', 'the hook/wire warning SAMPLES then summarises — it previously emitted ~100 lines per boot', () => {
  // component-registry registers 217 components, so warn-once-per-component
  // meant ~100 lines drowning everything else — including, in that very boot,
  // the BOOT HALTED message that actually mattered. A warning that hides the
  // thing you need to read is noise wearing transparency's clothes.
  assert.ok(/HOOK_WARN_SAMPLE/.test(LEDG), 'must sample rather than warn per component');
  assert.ok(/further per-component warnings suppressed/.test(LEDG), 'and say that it is suppressing');
  assert.ok(/schemaCoverage\(\) for the full list/.test(LEDG), 'and point at where the full picture still lives — nothing is hidden');
});

test('BL-007', 'REAL: 100 components without hook/wire produce a handful of lines, not 100', () => {
  const { write } = require('../../lib/component-ledger.js');
  const { purgeTestRows } = require('./_purge-test-rows');
  const S = `bl7-${Date.now()}`;
  let warns = 0;
  const orig = console.warn;
  console.warn = () => { warns++; };
  try {
    for (let i = 0; i < 100; i++) write({ system: S, component: `${S}.c${i}`, action: 'a' });
  } finally {
    console.warn = orig;
    purgeTestRows(S);
    fs.rmSync(path.join(ROOT, 'data/ledger', S), { recursive: true, force: true });
  }
  assert.ok(warns <= 10, `expected a sample, got ${warns} warning lines — the flood would drown the boot log again`);
  assert.ok(warns >= 1, 'but the problem must still be visible at all');
});

// ── BUG 4: registration gave up forever on a lost race ─────────────────────
test('BL-008', 'a system that loses the registration race RETRIES — it previously gave up forever', () => {
  // In phase 2 all four kernels start in parallel. Whichever reaches
  // registration before orchestrator has bound :9000 stayed permanently
  // unregistered. In that boot guardian was slow enough to succeed and BRIDGE
  // LOST — so bridge ran healthy, served traffic, and was invisible to the
  // registry for the whole session.
  assert.ok(/_scheduleRegisterRetry/.test(NC), 'registration must retry');
  assert.ok(/Math\.pow\(1\.6/.test(NC), 'with backoff');
  assert.ok(/REGISTER_MAX_ATTEMPTS/.test(NC), 'and a bound — silent infinite retry is indistinguishable from having given up');
  assert.ok(/INVISIBLE to the registry/.test(NC),
    'and a final failure must state the real consequence: health, contract verification and the connectome all omit an unregistered system');
  assert.ok(/t\.unref/.test(NC), 'the retry timer must never hold a process open');
});

testAsync('BL-009', 'REAL: a system registering BEFORE orchestrator exists still ends up registered', async () => {
  // Deliberately reproduces the exact race from the boot log.
  const nc = require('../../nexus/nexus-connect.js');
  let registered = null;
  const srv = http.createServer((q, s) => {
    let b = ''; q.on('data', c => b += c);
    q.on('end', () => {
      if (q.url === '/api/register') { try { registered = JSON.parse(b).systemId; } catch (_) {} }
      s.writeHead(200, { 'Content-Type': 'application/json' }); s.end('{"ok":true}');
    });
  });
  // Orchestrator appears late, after the first attempt has already failed.
  const started = new Promise(r => setTimeout(() => srv.listen(9000, '127.0.0.1', r), 2500));
  nc.registerWithOrchestrator('bl9-late', 9999, {}, []);
  await started;
  await new Promise(r => setTimeout(r, 6000));
  srv.close();
  assert.strictEqual(registered, 'bl9-late', 'a late orchestrator must still receive the registration');
});

(async () => {
  for (const [id, desc, fn] of _async) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
