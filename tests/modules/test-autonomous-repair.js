'use strict';
// §autonomous-repair (R3) — real wire from a detected gap to repair-on-prompt's verify spine.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ar = require(path.join(__dirname, '../..', 'lib/autonomous-repair'));
const triggers = require(path.join(__dirname, '../..', 'lib/triggers'));
const scheduler = require(path.join(__dirname, '../..', 'lib/scheduler'));

function stubGapField(gap) {
  const reported = [];
  return {
    openGaps: () => [gap],
    report: (g) => { reported.push(g); return { created: true, gap: { ...g, uuid: 'stub-' + reported.length } }; },
    _reported: reported,
  };
}

(async () => {
  await test('T-001', 'REPAIRABLE_GAP_TYPES only includes gap types that genuinely carry a specPath (chunk-build.*), not every gap', async () => {
    assert.deepStrictEqual(ar.REPAIRABLE_GAP_TYPES, ['chunk-build.exhausted', 'chunk-build.all-agents-unreachable']);
  });

  await test('T-002', '_diagnose returns null specPath honestly when the gap has none — never fabricates one', async () => {
    const d = await ar._diagnose({ type: 'some-other-gap', body: 'x', meta: {} });
    assert.strictEqual(d.specPath, null);
  });

  await test('T-003', '_diagnose extracts the real specPath from a real chunk-build gap', async () => {
    const d = await ar._diagnose({ type: 'chunk-build.exhausted', body: 'x', meta: { specPath: '/a/b.json', outputDir: '/out' } });
    assert.strictEqual(d.specPath, '/a/b.json');
    assert.strictEqual(d.outputDir, '/out');
  });

  await test('T-004', 'a non-repairable gap type does NOT fire the trigger', async () => {
    scheduler.start({ skipRestore: true }); triggers.start({ skipRestore: true }); triggers._resetForTest?.();
    let fired = false;
    const gapField = stubGapField({ uuid: 'g1', type: 'some-unrelated-gap', body: 'x', meta: {}, source: 'x' });
    ar.wireAutonomousRepair({ gapField, triggers, raid: { verify: async () => ({ approved: false, stage: 'constitution' }) }, diagnose: async () => { fired = true; return { specPath: null }; } });
    const fanin = require(path.join(__dirname, '../..', 'lib/ledger-fanin'));
    fanin.emit({ type: 'gap-field.found', gapType: 'some-unrelated-gap', uuid: 'g1', source: 'x' });
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(fired, false, 'a gap type not in REPAIRABLE_GAP_TYPES must never trigger a repair attempt');
  });

  await test('T-005', 'a real repairable gap fires the trigger, and a FAILED verify leaves nothing applied — a real declined gap is reported', async () => {
    scheduler.start({ skipRestore: true }); triggers.start({ skipRestore: true });
    const gap = { uuid: 'g2', type: 'chunk-build.exhausted', body: 'test exhaustion', meta: { specPath: '/fake/spec.json' }, source: 'test' };
    const gapField = stubGapField(gap);
    ar.wireAutonomousRepair({
      gapField, triggers,
      raid: { verify: async () => ({ approved: false, stage: 'compare', contractBreach: true }) },
    });
    const fanin = require(path.join(__dirname, '../..', 'lib/ledger-fanin'));
    fanin.emit({ type: 'gap-field.found', gapType: 'chunk-build.exhausted', uuid: 'g2', source: 'test' });
    await new Promise(r => setTimeout(r, 150));
    const declined = gapField._reported.find(g => g.type === 'autonomous-repair.declined');
    assert.ok(declined, 'a failed verify must produce a real declined-repair gap, not silence');
    assert.strictEqual(declined.meta.causedBy, 'g2');
  });

  await test('T-006', 'a real repairable gap with a PASSING verify results in an applied repair, reported honestly', async () => {
    scheduler.start({ skipRestore: true }); triggers.start({ skipRestore: true });
    const gap = { uuid: 'g3', type: 'chunk-build.exhausted', body: 'test exhaustion', meta: { specPath: '/fake/spec.json' }, source: 'test' };
    const gapField = stubGapField(gap);
    ar.wireAutonomousRepair({
      gapField, triggers,
      raid: { verify: async () => ({ approved: true, stage: 'approved' }) },
    });
    const fanin = require(path.join(__dirname, '../..', 'lib/ledger-fanin'));
    fanin.emit({ type: 'gap-field.found', gapType: 'chunk-build.exhausted', uuid: 'g3', source: 'test' });
    await new Promise(r => setTimeout(r, 150));
    const applied = gapField._reported.find(g => g.type === 'autonomous-repair.applied');
    assert.ok(applied, 'a passing verify must result in a real applied-repair gap');
  });

  await test('T-007', '_applyRepair is honest about not re-doing work runPipeline already did', async () => {
    const r = await ar._applyRepair({ specPath: '/a.json', diagnosis: {}, verdict: {} });
    assert.strictEqual(r.alreadyPromoted, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
