'use strict';
// §gap-field unification — one agnostic gap pipeline for system + user-model domains.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const gapField = require(path.join(__dirname, '../..', 'lib/gap-field'));
const diagnosticCausal = require(path.join(__dirname, '../..', 'lib/diagnostic-causal'));

const RUN_TAG = `unit-test-${Date.now()}`;

(async () => {
  await test('T-001', 'report() creates a real gap and it appears in openGaps()', async () => {
    const r = gapField.report({ type: `TEST_TYPE_${RUN_TAG}`, body: 'a test gap', source: RUN_TAG, domain: 'system', severity: 'high' });
    assert.strictEqual(r.created, true);
    const open = gapField.openGaps({ domain: 'system' });
    assert.ok(open.some(g => g.source === RUN_TAG));
  });

  await test('T-002', 'a second report() with the same type+source+domain dedupes (occurrence bump, not a new row)', async () => {
    const before = gapField.openGaps({ domain: 'system' }).find(g => g.source === RUN_TAG);
    const r = gapField.report({ type: `TEST_TYPE_${RUN_TAG}`, body: 'same gap again', source: RUN_TAG, domain: 'system' });
    assert.strictEqual(r.created, false, 'a duplicate report must dedupe, not create a second row');
    assert.strictEqual(r.gap.occurrences, (before.occurrences || 1) + 1);
  });

  await test('T-003', 'domain is agnostic — a user-model gap and a system gap use the identical shape', async () => {
    const r = gapField.report({ type: `TEST_UM_${RUN_TAG}`, body: 'a modeling-James gap', source: `user-model.${RUN_TAG}`, domain: 'user-model', severity: 'medium' });
    assert.strictEqual(r.created, true);
    assert.strictEqual(r.gap.domain, 'user-model');
    // same fields present as the system gap from T-001 — no domain-specific branching in the shape
    const sysGap = gapField.openGaps({ domain: 'system' }).find(g => g.source === RUN_TAG);
    assert.deepStrictEqual(Object.keys(r.gap).sort(), Object.keys(sysGap).sort());
  });

  await test('T-004', 'severity is a real top-level field on the stored gap (was buried in meta before this fix)', async () => {
    const g = gapField.openGaps({ domain: 'system' }).find(gg => gg.source === RUN_TAG);
    assert.strictEqual(g.severity, 'high', 'severity must be readable at g.severity, not only g.meta.severity');
  });

  await test('T-005', 'asFindings() reshapes gaps into the {type,system,severity,uuid} shape diagnostic-causal expects', async () => {
    const findings = gapField.asFindings({ domain: 'system' });
    const f = findings.find(x => x.system === RUN_TAG);
    assert.ok(f);
    assert.strictEqual(f.severity, 'high');
    assert.ok(f.uuid);
  });

  await test('T-006', 'diagnoseDeep() with NO findings argument now defaults to real open gaps, not an empty array', async () => {
    // This is the actual loop-closing fix: before, diagnoseDeep(undefined) behaved
    // like diagnoseDeep([]) via a default parameter. Now it pulls real gaps.
    const deep = await diagnosticCausal.diagnoseDeep(undefined, {});
    assert.ok(deep.total >= 1, `expected at least the test gaps created above, got total=${deep.total}`);
    assert.ok(deep.findings.some(f => f.system === RUN_TAG || f.system === `user-model.${RUN_TAG}`),
      'the real gap created in this test run must appear in the default diagnosis');
  });

  await test('T-007', 'an explicit findings array still overrides the default (a caller investigating something specific is not forced to see everything)', async () => {
    const deep = await diagnosticCausal.diagnoseDeep([{ type: 'X', system: 'only-this-one', severity: 'low' }], {});
    assert.strictEqual(deep.total, 1);
    assert.strictEqual(deep.findings[0].system, 'only-this-one');
  });

  await test('T-008', 'checkContradictions no longer double-inserts on repeated calls (the real bug found while unifying)', async () => {
    const userModel = require(path.join(__dirname, '../..', 'copilot/lib/user-model'));
    const { jaaDB } = require(path.join(__dirname, '../..', 'cortex/memory/jaa-db'));
    // Seed two high-confidence conflicting hypotheses so checkContradictions has a real hit.
    const now = Date.now();
    jaaDB.insert('user_model_hypotheses', { uuid: require('crypto').randomUUID(), claim: `fast pace ${RUN_TAG}`, confidence: 0.9, status: 'active', ts: now });
    // checkContradictions matches on substring against a fixed pair list ('fast pace','slow/deliberate pace') —
    // use the real pair so this test exercises the real code path, not a fabricated one.
    jaaDB.insert('user_model_hypotheses', { uuid: require('crypto').randomUUID(), claim: 'fast pace', confidence: 0.9, status: 'active', ts: now });
    jaaDB.insert('user_model_hypotheses', { uuid: require('crypto').randomUUID(), claim: 'slow/deliberate pace', confidence: 0.9, status: 'active', ts: now });
    userModel.checkContradictions();
    const countAfterFirst = gapField.openGaps({ domain: 'user-model' }).filter(g => g.type === 'CONFLICT').length;
    userModel.checkContradictions();   // call again — a real duplicate-insert bug would double this count
    const countAfterSecond = gapField.openGaps({ domain: 'user-model' }).filter(g => g.type === 'CONFLICT').length;
    assert.strictEqual(countAfterSecond, countAfterFirst, 'calling checkContradictions twice must not double-insert the same conflict');
  });

  await test('T-009', 'openGaps({domain:"system"}) includes legacy rows with no domain field at all (found live: 99 real autopilot kernel_circuit_open rows predate gap-field.js)', async () => {
    const { jaaDB } = require(path.join(__dirname, '../..', 'cortex/memory/jaa-db'));
    const legacyType = `LEGACY_NO_DOMAIN_${RUN_TAG}`;
    jaaDB.insert('gaps', { uuid: require('crypto').randomUUID(), type: legacyType, source: 'legacy-writer', status: 'open', detectedAt: Date.now() });
    // deliberately NO domain field — matches the real pre-gap-field shape found in the live store
    const found = gapField.openGaps({ domain: 'system' }).some(g => g.type === legacyType);
    assert.strictEqual(found, true, 'a legacy gap with no domain field must count as system, not vanish from domain-scoped queries');
  });

  await test('T-010', 'intent-classifier no longer double-inserts on repeated low-confidence calls (a sixth writer, found while verifying "intention" was really wired in)', async () => {
    const ic = require(path.join(__dirname, '../..', 'lib/intent-classifier'));
    const before = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'intent.low_confidence').length;
    const gibberish = { text: `zzqqxx unrecognizable garbage ${RUN_TAG}`, source: 'unit-test' };
    ic.classify(gibberish);
    ic.classify(gibberish);
    const after = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'intent.low_confidence');
    assert.strictEqual(after.length, before, 'two identical low-confidence classifications must not create two rows');
  });

  // ── R1: repair contract schema — additive, backward-compatible ──────────
  await test('R1-001', 'report() accepts the full repair_contract_schema fields and round-trips every one intact', async () => {
    const r = gapField.report({
      type: `r1-schema-${RUN_TAG}`, body: 'x', source: `r1-src-${RUN_TAG}`, domain: 'system', severity: 'high',
      requested: 'the user asked for X', received: 'the system returned Y instead',
      location: 'lib/foo.js:42', error: 'TypeError: cannot read property of undefined',
    });
    assert.strictEqual(r.created, true);
    assert.strictEqual(r.gap.requested, 'the user asked for X');
    assert.strictEqual(r.gap.received, 'the system returned Y instead');
    assert.strictEqual(r.gap.location, 'lib/foo.js:42');
    assert.strictEqual(r.gap.error, 'TypeError: cannot read property of undefined');
    const found = gapField.openGaps({ domain: 'system' }).find(g => g.uuid === r.gap.uuid);
    assert.strictEqual(found.requested, 'the user asked for X', 'every new field must round-trip through openGaps(), not just the in-memory return value');
  });

  await test('R1-002', 'systemsInvolved defaults to [source] when not explicitly given, not an empty array', async () => {
    const r = gapField.report({ type: `r1-sys-${RUN_TAG}`, body: 'x', source: `r1-src2-${RUN_TAG}`, domain: 'system' });
    assert.deepStrictEqual(r.gap.systemsInvolved, [`r1-src2-${RUN_TAG}`]);
  });

  await test('R1-003', 'resourceState is auto-populated when not explicitly given — cheap, real, not left null by default', async () => {
    const r = gapField.report({ type: `r1-res-${RUN_TAG}`, body: 'x', source: `r1-src3-${RUN_TAG}`, domain: 'system' });
    assert.ok(r.gap.resourceState, 'a report with no explicit resourceState must still get a real auto-sampled one');
    assert.ok(r.gap.resourceState.pressure && r.gap.resourceState.pressure.level, 'must carry a real classify() result, not just raw numbers');
  });

  await test('R1-004', 'why is null at report time — not auto-run on every report (§0.5, causal tracing is real work, only on demand)', async () => {
    const r = gapField.report({ type: `r1-why-${RUN_TAG}`, body: 'x', source: `r1-src4-${RUN_TAG}`, domain: 'system' });
    assert.strictEqual(r.gap.why, null);
  });

  await test('R1-005', 'explainWhy() populates a real causal trace and persists it back onto the gap', async () => {
    const r = gapField.report({ type: `r1-why2-${RUN_TAG}`, body: 'x', source: `r1-src5-${RUN_TAG}`, domain: 'system' });
    const result = await gapField.explainWhy(r.gap.uuid);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.why.available, 'boolean', 'explainFinding\'s real shape must come through, not a stub');
    const updated = gapField.openGaps({ domain: 'system' }).find(g => g.uuid === r.gap.uuid);
    assert.ok(updated.why, 'the why must be PERSISTED, not just returned in memory');
  });

  await test('R1-006', 'explainWhy() on an unknown uuid fails honestly, not silently', async () => {
    const result = await gapField.explainWhy('nonexistent-uuid-does-not-exist');
    assert.strictEqual(result.ok, false);
  });

  await test('R1-007', 'a caller using the OLD report() signature (no new fields at all) still works — full backward compatibility', async () => {
    const r = gapField.report({ type: `r1-old-${RUN_TAG}`, body: 'x', source: `r1-src6-${RUN_TAG}`, domain: 'system', severity: 'medium' });
    assert.strictEqual(r.created, true);
    assert.strictEqual(r.gap.requested, null);
    assert.strictEqual(r.gap.received, null);
    assert.strictEqual(r.gap.location, null);
    assert.strictEqual(r.gap.error, null);
  });

  await test('R1-008', 'asFindings() output is unaffected by the new fields — diagnostic-causal still gets exactly the shape it expects', async () => {
    gapField.report({ type: `r1-findings-${RUN_TAG}`, body: 'x', source: `r1-src7-${RUN_TAG}`, domain: 'system', requested: 'extra data' });
    const findings = gapField.asFindings({ domain: 'system' });
    const f = findings.find(x => x.system === `r1-src7-${RUN_TAG}`);
    assert.ok(f);
    assert.deepStrictEqual(Object.keys(f).sort(), ['domain', 'entry', 'severity', 'system', 'type', 'uuid'].sort());
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
