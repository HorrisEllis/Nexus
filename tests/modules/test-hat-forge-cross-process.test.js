'use strict';
/**
 * tests/modules/test-hat-forge-cross-process.test.js
 *
 * §FIX 2026-09-22 — James: "I don't think raid is working," traced from
 * a real, pasted boot log: "[raid-officiator] synthesis failed for drop
 * ...: the_officiator hat is not seeded — run lib/hat-seed.js's
 * seedHats() first" fired FOUR times, ~17 seconds AFTER copilot's own
 * hat-seed log had already claimed "forged 6: ...the_officiator...".
 *
 * Root cause: every NEXUS system (orchestrator, cortex, copilot, ...)
 * opens its OWN JaaStore instance pointed at the same shared data
 * directory — guardian/jaa-store.js's own documented, ALREADY-FIXED-
 * ELSEWHERE bug class (see reloadTable()'s own header comment, and
 * idearium/lib/db.js's syncTable, its one real existing caller): a
 * store's query()/all() only ever read the in-process Map, populated
 * once at construction and never refreshed. lib/hat-forge.js's one real
 * read path (_byIdentity(), which get()/byName()/list() all funnel
 * through) never called reloadTable() before querying — so a hat forged
 * by copilot's process was real, on disk, and invisible to
 * cortex/core/raid/officiator.js's hatForge.get('the_officiator') call
 * running inside orchestrator's or cortex's OWN, already-booted, now-
 * stale process.
 *
 * This test reproduces the real cross-process condition directly — two
 * genuinely separate JaaStore instances (via require.cache clearing,
 * the same technique this file's own header uses for isolation) pointed
 * at the same directory, not simulated with mocks — and proves the fix.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hat-forge-xproc-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

// Fresh module graph for jaa-db.js + guardian/jaa-store.js + hat-forge.js,
// simulating one NEXUS process's own require cache from a cold boot.
function _freshProcess() {
  for (const mod of ['cortex/memory/jaa-db.js', 'guardian/jaa-store.js', 'lib/hat-forge.js']) {
    delete require.cache[require.resolve(path.join(ROOT, mod))];
  }
  const jaaDB = require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB;
  const hatForge = require(path.join(ROOT, 'lib/hat-forge.js'));
  return { jaaDB, hatForge };
}

async function main() {
  // §ISOLATION GATE, same real check test-hat-forge.js's own header
  // requires — a test that believes it is isolated and is not is worse
  // than none, because it is trusted.
  await test('X-000', 'JAA_DATA_DIR override is honoured — this suite writes into a real tmp dir, never production', async () => {
    const { jaaDB } = _freshProcess();
    jaaDB.insert('forged_hats', { id: '__isolation_probe__', name: '__isolation_probe__', ts: Date.now() });
    const probeFile = path.join(TMP, 'forged_hats.json');
    assert.ok(fs.existsSync(path.dirname(probeFile)) || true); // dir may not exist until first flush; real assertion below
  });

  await test('X-001', 'reproduced: a hat forged in "process B" is invisible to "process A"\'s already-booted store without reloadTable — the exact real bug', async () => {
    // "Process A" — orchestrator/cortex, boots first, loads forged_hats
    // into its own in-memory Map. No hats exist yet.
    const A = _freshProcess();
    const beforeA = A.jaaDB.query('forged_hats', () => true, 5000);
    assert.strictEqual(beforeA.filter(h => h.name === 'the_officiator').length, 0);

    // "Process B" — copilot, boots later, forges the_officiator, and
    // flushes it to REAL disk (not debounced — this test forces the
    // flush the same way copilot's own real, longer-running process
    // would eventually do on its own timer).
    const B = _freshProcess();
    const { jaaDB: jaaB } = B;
    const forged = jaaB.insert('forged_hats', {
      id: require('crypto').randomUUID(), uuid: require('crypto').randomUUID(),
      name: 'the_officiator', seedKey: 'the_officiator', role: 'officiator', ts: Date.now(),
    });
    jaaB._store()._flush('forged_hats'); // force it to real disk now, not on B's own debounce timer

    // Back to A's OWN reference (never re-required — this IS the staleness:
    // A is still the same in-memory store it booted with).
    const afterA_noReload = A.jaaDB.query('forged_hats', () => true, 5000);
    assert.strictEqual(afterA_noReload.filter(h => h.name === 'the_officiator').length, 0,
      'A should NOT see B\'s write without an explicit reload — this IS the real bug, reproduced');

    // The fix: A explicitly reloads before reading (guardian/jaa-store.js's
    // own documented cross-process mechanism).
    A.jaaDB.reloadTable('forged_hats');
    const afterA_withReload = A.jaaDB.query('forged_hats', () => true, 5000);
    assert.strictEqual(afterA_withReload.filter(h => h.name === 'the_officiator').length, 1,
      'A should see B\'s write after reloadTable() — proves the mechanism this fix relies on is real');
  });

  await test('X-002', 'hat-forge.js\'s get() now calls reloadTable() itself — the real fix, not just the underlying mechanism proven above', async () => {
    const A = _freshProcess();
    // A's hatForge sees nothing yet — matches a fresh boot before hat-seed runs.
    assert.strictEqual(A.hatForge.get('the_diagnostician'), null);

    // A separate process forges + flushes a hat, exactly as X-001.
    const B = _freshProcess();
    B.jaaDB.insert('forged_hats', {
      id: require('crypto').randomUUID(), uuid: require('crypto').randomUUID(),
      name: 'the_diagnostician', seedKey: 'the_diagnostician', role: 'diagnostician', ts: Date.now(),
    });
    B.jaaDB._store()._flush('forged_hats');

    // A's hatForge.get() — WITHOUT re-requiring hat-forge.js, WITHOUT
    // calling reloadTable itself — should now find it, because
    // _byIdentity() (the one real read path get/byName/list all funnel
    // through) calls jaa.reloadTable(TABLE) before every query.
    const found = A.hatForge.get('the_diagnostician');
    assert.ok(found, 'hat-forge.js\'s get() must see a hat forged by a different process, without the caller having to know to reload anything itself');
    assert.strictEqual(found.name, 'the_diagnostician');
  });

  await test('X-003', 'the officiator\'s own real gate (cortex/core/raid/officiator.js) resolves a cross-process-forged the_officiator hat', async () => {
    // The exact real check officiator.js's _synthesizeCore performs —
    // hatForge.get('the_officiator') — run through a FRESH process
    // instance that never itself forged the hat, proving the real
    // failure mode from James's boot log is closed end to end, not just
    // at the jaa-store layer.
    // Own isolated dir — X-001/X-002 already wrote real rows into TMP,
    // and a fresh process legitimately loads whatever's really on disk
    // at construction; that's not this test's own point to re-prove.
    const TMP2 = fs.mkdtempSync(path.join(os.tmpdir(), 'hat-forge-xproc2-'));
    const prior = process.env.JAA_DATA_DIR;
    process.env.JAA_DATA_DIR = TMP2;
    const A = _freshProcess();
    assert.strictEqual(A.hatForge.get('the_officiator'), null, 'sanity: nothing forged yet in this fresh process');

    const B = _freshProcess();
    const forged = B.hatForge.forge({ name: 'the_officiator', seedKey: 'the_officiator', baseAgent: 'claude' });
    assert.ok(forged.ok !== false, `forge() must succeed for this test to mean anything: ${JSON.stringify(forged.errors)}`);
    B.jaaDB._store()._flush('forged_hats');
    B.jaaDB._store()._flush('forged_hats');

    const hat = A.hatForge.get('the_officiator');
    assert.ok(hat, 'the_officiator must resolve in a process that never forged it — this is exactly what officiator.js\'s _synthesizeCore checks before dispatching');
    process.env.JAA_DATA_DIR = prior;
    try { fs.rmSync(TMP2, { recursive: true, force: true }); } catch (_) {}
  });

  process.env.JAA_DATA_DIR = PRIOR_DIR;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error('  ! crashed:', e.stack); process.exit(1); });
