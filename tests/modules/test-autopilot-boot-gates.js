'use strict';
// run-all: timeout 180000   (§0.39.282 — waits through real autopilot boot phases; ~82s alone, past the 60s default)
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autopilot-boot-gates.js — pins the 2026-07-24 boot
 * discipline James asked for: "autopilot boots in phases, like cortex first,
 * gated each step, stopping on faults, running the diagnostic tool each time
 * it stalls."
 *
 * Phased boot and health gates already existed. What did not:
 *   1. cortex leading (it was phase 2 behind orchestrator)
 *   2. a stall HALTING the sequence (it logged a warning and marched on)
 *   3. the diagnostic tool running on a stall (nothing ran)
 *
 * The tests below spawn real child processes against dead ports so a gate
 * genuinely times out — the stall is real, not simulated by stubbing
 * _pollHealth (§1.3: a mocked gate would prove nothing about the gate).
 * Timeouts are shortened via spawnTimeoutMs, which is a real per-kernel field
 * the gate already honoured.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const ap = require('../../nexus/autopilot.js');
const SRC = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');

// Swap KERNELS in place (it is the same array the module reads) and restore
// after, so no test leaks a fake kernel into another suite.
const REAL_KERNELS = ap.KERNELS.slice();
function withKernels(list, fn) {
  ap.KERNELS.length = 0;
  for (const k of list) {
    ap.KERNELS.push(k);
    ap._state[k.name] = { status: 'starting', restarts: 0, crashes: [], lastExit: null, downSince: null, proc: null };
  }
  return Promise.resolve(fn()).finally(() => {
    ap.KERNELS.length = 0;
    for (const k of REAL_KERNELS) ap.KERNELS.push(k);
  });
}
// A process that stays alive but serves nothing, so its health gate must time out.
const IDLE = { cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},9999)'] };

(async () => {
  await test('BG-001', 'CORTEX LEADS: cortex is phase 1, alone, ahead of orchestrator', async () => {
    const plan = ap._phasePlan(REAL_KERNELS);
    const p1 = plan.find(p => p.phase === 1);
    assert.ok(p1, 'a phase 1 must exist');
    assert.deepStrictEqual(p1.kernels.map(k => k.name), ['cortex'],
      'cortex must be the only phase-1 kernel — the store comes up before its writers');
    const orch = REAL_KERNELS.find(k => k.name === 'orchestrator');
    assert.strictEqual(orch.phase, 2, 'orchestrator follows cortex');
  });

  await test('BG-002', 'the reorder is SAFE, verified in cortex\'s source: its registration is fire-and-forget with retry, so it never blocks on orchestrator', async () => {
    const cortexSrc = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
    const reg = cortexSrc.slice(cortexSrc.indexOf('function _register'), cortexSrc.indexOf('function _register') + 900);
    assert.ok(/req\.on\('error',\s*\(\)\s*=>\s*setTimeout\(_register/.test(reg),
      'cortex must retry registration on error rather than awaiting orchestrator — this is what makes cortex-first safe');
    assert.ok(!/await .*register/.test(reg), 'registration must not be awaited at boot');
  });

  await test('BG-003', 'STOPS ON FAULT: a stalled REQUIRED kernel halts the sequence and later phases never start', async () => {
    await withKernels([
      { name: 'bgRequired', ...IDLE, phase: 1, healthUrl: 'http://127.0.0.1:59897/health', spawnTimeoutMs: 2000 },
      { name: 'bgLater',    ...IDLE, phase: 2, healthUrl: 'http://127.0.0.1:59896/health', spawnTimeoutMs: 2000 },
    ], async () => {
      const r = await ap._bootPhases();
      assert.strictEqual(r.halted, true, 'a required stall must halt');
      assert.strictEqual(r.phase, 1, 'must halt AT the failing phase');
      assert.deepStrictEqual(r.blocking, ['bgRequired'], 'must name what blocked');
      assert.notStrictEqual(ap._state.bgLater.status, 'running', 'phase 2 must never have been started on a broken foundation');
    });
  });

  await test('BG-004', 'OPTIONAL kernels do NOT halt — the boot is not stricter than the architecture declares', async () => {
    await withKernels([
      { name: 'bgOptional', ...IDLE, optional: true, phase: 1, healthUrl: 'http://127.0.0.1:59895/health', spawnTimeoutMs: 2000 },
      { name: 'bgAfter',    ...IDLE, phase: 2 },
    ], async () => {
      const r = await ap._bootPhases();
      assert.strictEqual(r.halted, false, 'an optional stall must not halt boot');
      assert.strictEqual(r.phases, 2, 'every phase must still run');
    });
  });

  await test('BG-005', 'RUNS THE DIAGNOSTIC ON STALL — the real cli/diagnose.js, not a reimplementation', async () => {
    const fn = SRC.slice(SRC.indexOf('function _runDiagnosticOnStall'), SRC.indexOf('function _runDiagnosticOnStall') + 2200);
    assert.ok(/cli['"],\s*['"]diagnose\.js/.test(fn), 'must invoke the real cli/diagnose.js');
    assert.ok(/DIAGNOSTIC_TIMEOUT_MS/.test(fn), 'must be time-bounded — a hanging diagnostic must not become the reason boot never finishes');
    assert.ok(/proc\.on\('error'/.test(fn), 'a diagnostic that cannot start must be reported, not mask the original stall');
    // And prove it actually runs, on a real stall, by capturing the log line.
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => { logs.push(a.join(' ')); };
    try {
      await withKernels([
        { name: 'bgDiag', ...IDLE, optional: true, phase: 1, healthUrl: 'http://127.0.0.1:59894/health', spawnTimeoutMs: 2000 },
      ], () => ap._bootPhases());
    } finally { console.log = origLog; }
    assert.ok(logs.some(l => /running diagnostic for stalled 'bgDiag'/.test(l)), 'the diagnostic must actually be invoked on a real stall');
    assert.ok(logs.some(l => /diagnostic for 'bgDiag'/.test(l) && /exit/.test(l)), 'its result must be reported');
  });

  await test('BG-006', 'a halt leaves already-healthy kernels RUNNING — one fault must not become an outage', async () => {
    const fn = SRC.slice(SRC.indexOf('const stalled = results.filter'), SRC.indexOf('const stalled = results.filter') + 1600);
    assert.ok(/keep running under supervision/.test(fn), 'the halt path must state that healthy kernels are left alone');
    assert.ok(!/kill\(/.test(fn), 'the halt path must not kill anything');
  });

  await test('BG-007', 'a halt is OBSERVABLE, not just logged — /status carries the boot result and warp records it', async () => {
    assert.ok(/boot: _bootResult/.test(SRC), '/status must expose the boot result so the tablet can see a halt');
    assert.ok(/_warpEmit\('autopilot\.boot\.halted'/.test(SRC), 'a halt must land on the WARP spine');
    assert.ok(/_warpEmit\('autopilot\.phase\.gate_stalled'/.test(SRC), 'each stalled gate must be recorded individually');
    assert.ok(/_warpEmit\('autopilot\.diagnostic\.run'/.test(SRC), 'diagnostic runs must be recorded');
    assert.strictEqual(typeof ap._getBootResult, 'function', 'the boot result must be readable programmatically');
  });

  await test('BG-008', 'a clean boot reports completion with its real phase count', async () => {
    await withKernels([
      { name: 'bgClean1', ...IDLE, phase: 1 },   // no healthUrl → spawned-not-verified, never a stall
      { name: 'bgClean2', ...IDLE, phase: 2 },
    ], async () => {
      const r = await ap._bootPhases();
      assert.strictEqual(r.halted, false);
      assert.strictEqual(r.phases, 2);
    });
  });

  await test('BG-009', 'THE DIAGNOSTIC TOOL ACTUALLY RUNS — it was 100% dead (TDZ on DEEP) until wiring it to the boot gate exposed it', async () => {
    // This is the whole point of running it on a stall: the tool crashed on
    // EVERY invocation with "Cannot access 'DEEP' before initialization",
    // because the const was declared ~400 lines AFTER the runAll() call that
    // reads it. Nothing ran it automatically, and by hand the banner printed
    // before the crash — so it looked like it worked.
    const src = fs.readFileSync(path.join(ROOT, 'cli/diagnose.js'), 'utf8');
    const declIdx = src.indexOf('const DEEP = process.argv.includes');
    const useIdx  = src.indexOf('if (DEEP) {');
    const callIdx = src.indexOf('runAll().catch(');
    assert.ok(declIdx > 0 && useIdx > 0 && callIdx > 0, 'all three sites must be locatable');
    assert.ok(declIdx < useIdx, 'DEEP must be declared BEFORE the code that reads it');
    assert.ok(declIdx < callIdx, 'DEEP must be initialised before runAll() is invoked — this is the exact TDZ that killed the tool');

    // And prove it end-to-end: a real run must get past the banner into real checks.
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'cli/diagnose.js'), 'cortex'], { encoding: 'utf8', timeout: 60000, cwd: ROOT });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.ok(!/Cannot access 'DEEP'/.test(out), 'the TDZ crash must be gone');
    assert.ok(/\[1\/\d+\]/.test(out), `the tool must reach real numbered checks, not die after the banner — got: ${out.slice(0, 300)}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
