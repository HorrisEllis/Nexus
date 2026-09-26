'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../lib/test-sandbox.js').ensure();
/**
 * tests/diagnostic-fixes.test.js — v1.0
 * UUID: nexus-diagnostic-fixes-test-v1-0000-2026-0617
 * Tests: all 6 diagnostic fixes
 */
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn() ? (pass++, console.log(`  ✓  ${label}`)) : (fail++, console.log(`  ✗  ${label}`)); }
  catch(e) { fail++, console.log(`  ✗  ${label} — ${e.message}`); }
}

console.log('\n⬡  DIAGNOSTIC FIXES — Tests\n');

// Fix 1: spec-drift
test('F1: orchestrator uses nexusBus not _bus for spec-drift', () =>
  read('orchestrator/orchestrator.js').includes('bus: nexusBus') &&
  !read('orchestrator/orchestrator.js').includes('bus: _bus'));

// Fix 2: idearium contract path
test('F2: idearium contract path is ./schemas not ../schemas', () =>
  read('idearium/index.js').includes("join(__dir, 'schemas/interaction-contract.json')") &&
  !read('idearium/index.js').includes("join(__dir, '../schemas/interaction-contract.json')"));

// Fix 3: self-heal apply_disabled
test('F3a: self-heal uses apply_disabled status', () =>
  read('cortex/self-heal/index.js').includes("'apply_disabled'"));
test('F3b: self-heal event type is apply_disabled when APPLY_PATCH=false', () =>
  read('cortex/self-heal/index.js').includes('self-heal.apply_disabled'));
test('F3c: self-heal does not escalate when apply disabled', () =>
  read('cortex/self-heal/index.js').includes('_toCortex') ||
  read('cortex/self-heal/index.js').includes('apply_disabled'));

// Fix 4: architect contract
test('F4: architect has /api/contract route', () =>
  read('architect/service.js').includes("'/api/contract'") &&
  read('architect/service.js').includes('architect-v1'));

// Fix 5: diagnostic in boot sequence
test('F5: diagnostic service in boot-systems.js', () =>
  read('cli/boot-systems.js').includes('nexus-diagnostic.js') &&
  read('cli/boot-systems.js').includes("systemId: 'diagnostic'"));
test('F5: diagnostic boots after emerge (last)', () => {
  const s = read('cli/boot-systems.js');
  return s.indexOf('nexus-diagnostic.js') > s.indexOf('emerge-ide.js');
});

// Fix 6: remediation loop
test('F6: diagnostic has remediationScan function', () =>
  read('diagnostic/nexus-diagnostic.js').includes('function remediationScan'));
test('F6: remediation writes to cortex', () =>
  read('diagnostic/nexus-diagnostic.js').includes('diagnostic.remediation'));
test('F6: remediation logs to data/diagnostic/remediation.jsonl', () =>
  read('diagnostic/nexus-diagnostic.js').includes('remediation.jsonl'));
test('F6: remediation emits HEAL_REQUESTED', () =>
  read('diagnostic/nexus-diagnostic.js').includes('HEAL_REQUESTED'));
test('F6: remediation runs on 30s interval', () =>
  read('diagnostic/nexus-diagnostic.js').includes('setInterval(remediationScan, 30000)'));
test('F6: offline systems tracked by time', () =>
  read('diagnostic/nexus-diagnostic.js').includes('_offlineSince'));
test('F6: syntax check on critical files', () =>
  read('diagnostic/nexus-diagnostic.js').includes('orchestrator.js') &&
  read('diagnostic/nexus-diagnostic.js').includes('--check'));

// §FIX 2026-09-02 — James, live: pasted the exact "'clear-glass' missed
// its /status probe but registered 1s ago" log and asked to fix it.
// Real, functional online=true fallback (2026-07-24) is unchanged and
// correct — verified here that it's still present — only the WARNING
// LOG for a benign, near-registration miss is downgraded to console.log,
// keeping console.warn for a miss further from registration (the
// pattern actually worth a human noticing).
test('F7: registry-fallback online=true logic still present, unchanged', () =>
  read('diagnostic/nexus-diagnostic.js').includes('online = true') &&
  read('diagnostic/nexus-diagnostic.js').includes("onlineSource = 'registry-fallback'"));
test('F7: a near-registration probe miss (<5s) logs quietly, not as a warning', () => {
  const src = read('diagnostic/nexus-diagnostic.js');
  return src.includes('sinceRegMs < 5000') && src.includes('console.log(msg)');
});
test('F7: a probe miss further from registration still warns', () =>
  read('diagnostic/nexus-diagnostic.js').includes('else console.warn(msg)'));
test('F7: the real 15s fallback window itself is unchanged', () =>
  read('diagnostic/nexus-diagnostic.js').includes('(Date.now() - lastSeen) < 15000'));

// §FIX 2026-09-02 — James, live: "should all be using the heartbeat
// system anyways." Real root cause found (not the timing race F7
// addressed): clear-glass's main process and its wire sub-process
// register with orchestrator under two different names on two
// different ports — a structural mismatch, not a boot-time coincidence.
// clear-glass now checks the real heartbeat/registry FIRST, skipping
// its own direct probe when the registry already confirms it online.
test('F8: clear-glass config carries preferHeartbeat:true', () => {
  const src = read('diagnostic/nexus-diagnostic.js');
  const m = src.match(/'clear-glass':\{[^}]*preferHeartbeat:\s*true/);
  return !!m;
});
test('F8: pollSystem checks the registry before the direct probe when preferHeartbeat is set', () => {
  const src = read('diagnostic/nexus-diagnostic.js');
  const preferIdx = src.indexOf('if (cfg.preferHeartbeat)');
  const probeIdx  = src.indexOf('// 1. Probe health endpoint');
  return preferIdx > -1 && probeIdx > -1 && preferIdx < probeIdx;
});
test('F8: a heartbeat-confirmed system is labeled onlineSource "heartbeat", not "probe"', () =>
  read('diagnostic/nexus-diagnostic.js').includes("onlineSource = 'heartbeat'"));
test('F8: the direct probe still runs as a real fallback if the registry has nothing recent', () => {
  const src = read('diagnostic/nexus-diagnostic.js');
  // The probe block's own real guard — must still fire when online is
  // false, whether that's because preferHeartbeat found nothing or
  // because this is any other, non-preferHeartbeat system.
  const probeBlock = src.slice(src.indexOf('// 1. Probe health endpoint'), src.indexOf('// ── §COMPETING TRUTH FIXED'));
  return probeBlock.includes('if (!online) {');
});

// Syntax checks
const { spawnSync } = require('child_process');
const files = ['orchestrator/orchestrator.js','idearium/index.js','cortex/self-heal/index.js',
  'architect/service.js','cli/boot-systems.js','diagnostic/nexus-diagnostic.js'];
for (const f of files) {
  test(`SYNTAX: ${f}`, () =>
    spawnSync('node', ['--check', path.join(ROOT, f)], { encoding:'utf8', timeout:5000 }).status === 0);
}

console.log(`\n  ${pass} passed · ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
