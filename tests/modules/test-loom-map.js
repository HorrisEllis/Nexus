'use strict';
/**
 * tests/modules/test-loom-map.js — lib/loom-map.js's first real, permanent
 * test file. Had zero dedicated coverage all session despite being core
 * infrastructure several other modules depend on (cortex/intelligence,
 * lib/gap-field, lib/agent-system) — closing that gap here, alongside
 * the comp_status/comp_dependencies feature that needed real isolation
 * testing to be verifiable at all (see lib/loom-map.js's dataDir override,
 * added same session, same reason).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — ${e.message}`); }
}

const { LoomDriver } = require(path.join(__dirname, '../../loom/schema/index'));
const loomMap = require(path.join(__dirname, '../../lib/loom-map'));

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-map-test-'));
const driver = new LoomDriver({ dataDir: DATA_DIR });

// ── real fixture data ────────────────────────────────────────────────────
driver.declare('component', { id: 'lm.a', namespace: 'test', name: 'A', version: '1.0.0', dir: 'lib/a', comp_status: 'release', uuid: 'lm-a-001' });
driver.declare('component', { id: 'lm.b', namespace: 'test', name: 'B', version: '0.1.0', comp_status: 'acceptable', comp_dependencies: ['lm.a', 'lm.ghost'], uuid: 'lm-b-001' });
driver.declare('hook', { id: 'lm.a.export', component_id: 'lm.a', name: 'export', type: 'direct', direction: 'out', uuid: 'lm-hook-a-001' });
driver.declare('hook', { id: 'lm.b.import', component_id: 'lm.b', name: 'import', type: 'direct', direction: 'in', uuid: 'lm-hook-b-001' });
driver.declare('wire', { id: 'lm.wire.1', from_hook_id: 'lm.a.export', to_hook_id: 'lm.b.import', type: 'direct-call', intent: 'b uses a', uuid: 'lm-wire-001' });

// ── resolveSystem — pure, no I/O ────────────────────────────────────────

check('resolveSystem strips a leading "nexus." prefix', () => {
  assert.strictEqual(loomMap.resolveSystem('nexus.guardian.dropzone'), 'guardian');
});
check('resolveSystem takes the first segment when there is no "nexus." prefix', () => {
  assert.strictEqual(loomMap.resolveSystem('copilot.moduleBuilder'), 'copilot');
});
check('resolveSystem returns null for a bare word with no dots — never guesses', () => {
  assert.strictEqual(loomMap.resolveSystem('copilot'), null);
});
check('resolveSystem returns null for null/undefined/empty input, does not throw', () => {
  assert.strictEqual(loomMap.resolveSystem(null), null);
  assert.strictEqual(loomMap.resolveSystem(undefined), null);
  assert.strictEqual(loomMap.resolveSystem(''), null);
});

// §FIX 2026-09-02 — James, live, twice, watching the real boot log:
// "there isn't 41 systems" and then "isn't 42 systems. please fix."
// Real, live-verified root cause: resolveSystem() trusted ANY first
// dot-segment as a real system name. Verified against real, live
// production data before fixing anything (not assumed): the top
// "systems" by component count were tests (257), lib (234), spec (152),
// cos (85), cg (81) — folder/category prefixes and abbreviations, not
// real systems; cos/cg are the SAME real systems as their fuller names,
// counted twice. Fixed by validating the candidate against a real
// allowlist (orchestrator.config.json's real ports block, merged with a
// small, documented list of systems known to register dynamically
// without one — clear-glass, erosmancer-os). Re-ran the real, live map
// after fixing: 41/42 fell to 13 real systems (+ 'unknown'), matching
// the ~15-17 this session had already estimated by hand — real
// component/hook TOTALS unchanged (1649/1389), only attribution fixed.
check('resolveSystem trusts a real system name (guardian)', () => {
  assert.strictEqual(loomMap.resolveSystem('nexus.guardian.dropzone'), 'guardian');
});
check('resolveSystem refuses a folder/category prefix that is not a real system', () => {
  assert.strictEqual(loomMap.resolveSystem('tests.something.fixture'), null);
  assert.strictEqual(loomMap.resolveSystem('lib.some.helper'), null);
  assert.strictEqual(loomMap.resolveSystem('spec.some.thing'), null);
});
check('resolveSystem trusts clear-glass — a real system with no ports.json entry', () => {
  assert.strictEqual(loomMap.resolveSystem('clear-glass.wire.status'), 'clear-glass');
});
check('a component with a fake system prefix is bucketed as unknown, not counted as its own new system', () => {
  const map = loomMap.getMap({ dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.ok(!('lm' in map.systems), 'the fake "lm" prefix must never appear as a real system key');
  assert.ok('unknown' in map.systems, 'components with an unresolvable system must be bucketed as unknown');
});

// ── resolveComponent — real registry lookup ─────────────────────────────

check('resolveComponent finds a real, registered component by its own id', () => {
  const r = loomMap.resolveComponent('lm.a', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.strictEqual(r.found, true);
  // §FIX 2026-09-02 — James, live, twice: "there isn't 41 systems...
  // please fix." resolveSystem() now validates its candidate against a
  // real system allowlist instead of trusting any first dot-segment
  // (that trust-anything behavior was the actual bug — see lib/
  // loom-map.js's own _isRealSystem() for the real fix and why). This
  // fixture's own 'lm' prefix was never a real system to begin with —
  // asserting 'lm' here was pinning the OLD, buggy behavior. The
  // correct, honest result for a synthetic test id with a made-up
  // prefix is 'unknown', matching every other component whose real
  // system can't be determined.
  assert.strictEqual(r.system, 'unknown');
});
check('resolveComponent finds a component via one of its real hooks', () => {
  const r = loomMap.resolveComponent('lm.a.export', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.componentId, 'lm.a');
});
check('resolveComponent is honest (found:false) for an id that looks plausible but was never registered', () => {
  const r = loomMap.resolveComponent('lm.totally.made.up', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.strictEqual(r.found, false);
});
check('resolveComponent never throws on null/undefined/empty input', () => {
  assert.strictEqual(loomMap.resolveComponent(null).found, false);
  assert.strictEqual(loomMap.resolveComponent(undefined).found, false);
  assert.strictEqual(loomMap.resolveComponent('').found, false);
});

// ── getComponentHistory — composed, not duplicated ──────────────────────

check('getComponentHistory returns an honest empty result for a component with no ledger/gap history', () => {
  const h = loomMap.getComponentHistory('lm.a');
  assert.strictEqual(h.hasHistory, false);
  assert.deepStrictEqual(h.errors, []);
  assert.deepStrictEqual(h.gaps, []);
});
check('getComponentHistory never throws on null/empty componentId', () => {
  assert.strictEqual(loomMap.getComponentHistory(null).componentId, null);
  assert.strictEqual(loomMap.getComponentHistory('').componentId, null);
});

// ── checkDependencyDrift — the real point of this whole feature ────────

check('checkDependencyDrift finds a real declared-but-never-wired dependency (lm.ghost)', () => {
  const d = loomMap.checkDependencyDrift('lm.b', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.ok(d.available);
  assert.ok(d.declaredOnly.includes('lm.ghost'), JSON.stringify(d));
});
check('checkDependencyDrift does NOT flag a dependency that IS both declared and really wired (lm.a)', () => {
  const d = loomMap.checkDependencyDrift('lm.b', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.ok(!d.declaredOnly.includes('lm.a'), JSON.stringify(d));
  assert.ok(d.inSync.includes('lm.a'), JSON.stringify(d));
});
check('checkDependencyDrift on a component with no declared comp_dependencies at all is honest, not an error', () => {
  const d = loomMap.checkDependencyDrift('lm.a', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.ok(d.available);
  assert.deepStrictEqual(d.declaredOnly, []);
});
check('checkDependencyDrift on a totally unknown component id does not throw', () => {
  const d = loomMap.checkDependencyDrift('lm.nonexistent', { dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.ok(d.available);
  assert.deepStrictEqual(d.declaredOnly, []);
});

// ── isolation — the bug this whole feature's dataDir override exists to fix ──

check('a dataDir-scoped getMap call never leaks into the cached default (production) map', () => {
  const scoped = loomMap.getMap({ dataDir: DATA_DIR, maxAgeMs: 0 });
  assert.ok('lm.a' in scoped.components);
  const real = loomMap.getMap({ maxAgeMs: 0 });
  assert.ok(!('lm.a' in real.components), 'test fixture leaked into the real production map');
});

console.log(`\n  loom-map.js: ${pass} passed, ${fail} failed\n`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
