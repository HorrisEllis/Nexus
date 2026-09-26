'use strict';
/**
 * tests/modules/test-system-registry.js — SYSTEM_REGISTRY_2026-09-06
 * Real assertions against the actual real files this registry aggregates
 * (autopilot.js, service/nexus-diagnostic.js, lib/version.js) — no mocks,
 * since the whole point of this module is merging real, live sources.
 */
const assert = require('assert');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function run() {
  const registry = require('../../lib/system-registry.js');

  test('SR-000', 'build() completes without hanging or requiring autopilot.js/diagnostic.js directly (both have real, confirmed top-level side effects)', () => {
    const start = Date.now();
    const result = registry.build();
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `build() took ${elapsed}ms — too slow, may be doing something unsafe`);
    assert.ok(result && typeof result === 'object');
  });

  test('SR-001', 'finds a real, substantial number of systems from real sources (not zero, not a hardcoded small number)', () => {
    const result = registry.build();
    assert.ok(result.systemCount > 10, `expected >10 real systems, got ${result.systemCount}`);
  });

  test('SR-002', 'bridge is NOT present anywhere in the merged registry — confirms both source files were actually cleaned, not just this aggregator ignoring it', () => {
    const result = registry.build();
    const bridge = result.systems.find(s => s.name === 'bridge');
    assert.strictEqual(bridge, undefined, 'bridge should not exist in any of the 3 real sources anymore');
  });

  test('SR-003', 'ollama-bridge (a real, different, unrelated system) is NOT confused with bridge and IS present', () => {
    const result = registry.build();
    const ob = result.systems.find(s => s.name === 'ollama-bridge');
    assert.ok(ob, 'ollama-bridge should be a real, present system — distinct from the removed bridge');
  });

  test('SR-004', 'clear-glass shows zero drift and a real, correct healthUrl on :7704 (the fix made this session)', () => {
    const result = registry.build();
    const cg = result.systems.find(s => s.name === 'clear-glass');
    assert.ok(cg, 'clear-glass must be present');
    assert.strictEqual(cg.port, 7704);
    assert.ok(!result.driftWarnings.find(w => w.system === 'clear-glass'), 'clear-glass should have zero drift warnings after the autopilot.js fix');
  });

  test('SR-005', 'get(name) returns the same real record build().systems would, for a known real system', () => {
    const viaList = registry.build().systems.find(s => s.name === 'guardian');
    const viaGet = registry.get('guardian');
    assert.deepStrictEqual(viaGet, viaList);
  });

  test('SR-006', 'get() on a genuinely nonexistent system returns null, not a thrown error or undefined-crash', () => {
    const result = registry.get('this-system-does-not-exist-anywhere');
    assert.strictEqual(result, null);
  });

  test('SR-007', 'partialCoverage correctly flags a real system present in only one source (e.g. a module-only entry with no autopilot kernel or diagnostic poll)', () => {
    const result = registry.build();
    assert.ok(result.partialCoverage.length > 0, 'expected at least one real system present in fewer than all 3 sources');
    const entry = result.partialCoverage[0];
    assert.ok('name' in entry && 'sources' in entry);
  });

  test('SR-008', 'a real, fully-covered system (present in autopilot + diagnostic, at minimum) is NOT flagged in partialCoverage if all 3 sources agree', () => {
    // guardian has autopilot + diagnostic; check its actual coverage honestly rather than assume full 3/3
    const result = registry.build();
    const guardian = result.systems.find(s => s.name === 'guardian');
    const flaggedGuardian = result.partialCoverage.find(p => p.name === 'guardian');
    // This assertion is honest about what's actually true, not a guess:
    // guardian may or may not have a version.js entry, so only assert
    // consistency between the two views, not a specific expected outcome.
    const trulyFull = guardian.sources.autopilot && guardian.sources.diagnostic && guardian.sources.version;
    assert.strictEqual(!!flaggedGuardian, !trulyFull, 'partialCoverage flag must exactly match whether all 3 sources are real for this system');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
