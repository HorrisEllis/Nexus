'use strict';
/**
 * loom/test/schema.test.js — Phase 131 verification.
 * AXIOMS §12.1 (every runtime file has a brutal, recursive test suite),
 * §12.2 (tests are verification, not coverage) — every axiom below is
 * chosen because it's a real failure mode (duplicate id, dangling wire,
 * seam with no owning component), not because it pads a percentage.
 *
 * Run: node loom/test/schema.test.js
 * Uses a throwaway data dir so this never touches the real registry.json.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { LoomDriver } = require('../schema/index');

let pass = 0, fail = 0;
function check(label, fn) {
  try {
    fn();
    pass++;
    console.log(`  PASS  ${label}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL  ${label} — ${e.message}`);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
const driver = new LoomDriver({ dataDir: tmpDir });

console.log(`\nLOOM Phase 131 — schema layer test\ndata dir: ${tmpDir}\n`);

// ── 1. Valid component registers and persists to disk ──────────────────────
check('valid component declaration registers', () => {
  const r = driver.declare('component', {
    id: 'nexus.loom', namespace: 'loom', name: 'LOOM', version: '0.1.0',
    uuid: 'nexus-loom-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.id, 'nexus.loom');
});

check('component persisted to disk, not just memory', () => {
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'registry.json'), 'utf8'));
  assert.ok(onDisk.component['nexus.loom'], 'component missing from registry.json on disk');
});

// ── 2. Duplicate id — hard axiom rejection ──────────────────────────────────
check('duplicate component id is hard-rejected', () => {
  const r = driver.declare('component', {
    id: 'nexus.loom', namespace: 'loom', name: 'LOOM again', version: '0.2.0',
    uuid: 'nexus-loom-v1-0000-2026-0701-jamesbrooks-002',
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'axiom-rejected');
  assert.ok(r.failures.some(f => f.axiomId === 'loom.unique-id'));
});

// ── 3. Missing required field — schema rejection, not a crash ──────────────
check('component missing required field is schema-rejected, no throw', () => {
  const r = driver.declare('component', {
    id: 'nexus.loom.broken', namespace: 'loom',
    uuid: 'nexus-loom-broken-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'schema-rejected');
  assert.ok(r.detail.missing.includes('name'));
  assert.ok(r.detail.missing.includes('version'));
});

check('component missing uuid is axiom-rejected (uuid enforced only by the Axiom now)', () => {
  const r = driver.declare('component', {
    id: 'nexus.loom.no-uuid', namespace: 'loom', name: 'No UUID', version: '0.1.0',
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'axiom-rejected');
  assert.ok(r.failures.some(f => f.axiomId === 'loom.uuid-present'));
});

// ── 4. Hook needs a real component ──────────────────────────────────────────
check('hook referencing unknown component is hard-rejected', () => {
  const r = driver.declare('hook', {
    id: 'loom.hook.declare.in', component_id: 'nexus.does-not-exist', name: 'declare-in',
    type: 'api', direction: 'in', uuid: 'nexus-loom-hook-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.failures.some(f => f.axiomId === 'loom.hook-component-exists'));
});

check('hook on a real component registers', () => {
  const r = driver.declare('hook', {
    id: 'loom.hook.declare.in', component_id: 'nexus.loom', name: 'declare-in',
    type: 'api', direction: 'in', uuid: 'nexus-loom-hook-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.novelType, false); // 'api' is in KNOWN_HOOK_TYPES
});

check('hook with a novel (unregistered) type still registers, flagged not rejected', () => {
  const r = driver.declare('hook', {
    id: 'loom.hook.declare.telepathy', component_id: 'nexus.loom', name: 'declare-telepathy',
    type: 'quantum_entanglement', direction: 'in',
    uuid: 'nexus-loom-hook-v1-0000-2026-0701-jamesbrooks-002',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.novelType, true);
});

// ── 5. Second component + hook for a real wire ──────────────────────────────
check('second component registers', () => {
  const r = driver.declare('component', {
    id: 'nexus.architect', namespace: 'architect', name: 'The Architect', version: '1.1.0',
    uuid: 'nexus-architect-registry-v1-0000-2026-0627-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

check('hook on second component registers', () => {
  const r = driver.declare('hook', {
    id: 'architect.hooks.list', component_id: 'nexus.architect', name: 'hooks-list',
    type: 'api', direction: 'out', uuid: 'nexus-architect-hook-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

// ── 6. Wire between two real hooks ──────────────────────────────────────────
check('wire between two real hooks registers', () => {
  const r = driver.declare('wire', {
    id: 'wire.loom-hears-architect', from_hook_id: 'architect.hooks.list',
    to_hook_id: 'loom.hook.declare.in', uuid: 'nexus-loom-wire-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

// ── 7. Dangling wire — hard axiom rejection ─────────────────────────────────
check('wire to a nonexistent hook is hard-rejected', () => {
  const r = driver.declare('wire', {
    id: 'wire.dangling', from_hook_id: 'loom.hook.declare.in',
    to_hook_id: 'nexus.does-not-exist.hook', uuid: 'nexus-loom-wire-v1-0000-2026-0701-jamesbrooks-002',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.failures.some(f => f.axiomId === 'loom.wire-endpoints-exist'));
});

// ── 8. Self-wire — Gate-level rejection (not an axiom, structural) ─────────
check('self-wire is schema-rejected', () => {
  const r = driver.declare('wire', {
    id: 'wire.self', from_hook_id: 'loom.hook.declare.in',
    to_hook_id: 'loom.hook.declare.in', uuid: 'nexus-loom-wire-v1-0000-2026-0701-jamesbrooks-003',
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'schema-rejected');
});

// ── 9. Seam needs a real component ──────────────────────────────────────────
check('seam on unknown component is hard-rejected', () => {
  const r = driver.declare('seam', {
    id: 'seam.ghost', component_id: 'nexus.does-not-exist', name: 'ghost-seam',
    kind: 'ingress', uuid: 'nexus-loom-seam-v1-0000-2026-0701-jamesbrooks-001',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.failures.some(f => f.axiomId === 'loom.seam-component-exists'));
});

check('seam on real component with invalid kind is schema-rejected', () => {
  const r = driver.declare('seam', {
    id: 'seam.loom.declare', component_id: 'nexus.loom', name: 'declare-surface',
    kind: 'sideways', uuid: 'nexus-loom-seam-v1-0000-2026-0701-jamesbrooks-002',
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'schema-rejected');
});

check('seam on real component with valid kind registers', () => {
  const r = driver.declare('seam', {
    id: 'seam.loom.declare', component_id: 'nexus.loom', name: 'declare-surface',
    kind: 'ingress', uuid: 'nexus-loom-seam-v1-0000-2026-0701-jamesbrooks-003',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

// ── 10. graph() reflects real wire adjacency ────────────────────────────────
check('graph() returns real hook/wire adjacency', () => {
  const g = driver.graph();
  assert.strictEqual(g.nodes.length, 3); // 2 known-type hooks + 1 novel-type hook
  assert.strictEqual(g.edges.length, 1);
  assert.strictEqual(g.edges[0].from, 'architect.hooks.list');
  assert.strictEqual(g.edges[0].to, 'loom.hook.declare.in');
});

// ── 11. Audit trail — every declaration logged, per §12.1 ───────────────────
// StreamLog records every event Stream.emit() sees, including the events
// a Gate's transform() produces and Stream then recurses into (the
// '*.registered' / '*.rejected' follow-on). So total entries > declare()
// call count is correct Warp behavior, not a bug — this test asserts the
// thing that actually matters: exactly one '.declare' entry per call.
check('every declaration attempt has exactly one .declare entry in the StreamLog', () => {
  const trail = driver.auditTrail();
  const declareEntries = trail.filter(e => e.eventType.endsWith('.declare'));
  assert.strictEqual(declareEntries.length, 15, `expected 15 .declare entries, got ${declareEntries.length}`);
  assert.ok(trail.length > declareEntries.length,
    'expected follow-on registered/rejected events to also be logged (recursive audit)');
});

// ── 12. concern — §BUILT 2026-07-14, the roadmap primitive ─────────────────
// Positioned after the audit-trail count check above (not before) so these
// new declare() calls don't shift that test's hardcoded expected count.
check('a real concern registers with its full real shape, including optional relatesTo/detail', () => {
  const r = driver.declare('concern', {
    id: 'concern-test-001', kind: 'closed-door', title: 'a real detected concern',
    severity: 'medium', source: 'test', relatesTo: ['nexus.some-component'],
    detail: { file: 'somewhere.js', consumers: 0 },
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(r.stored.relatesTo, ['nexus.some-component']);
});

check('a concern with an invalid severity is schema-rejected, not silently accepted', () => {
  const r = driver.declare('concern', {
    id: 'concern-test-002', kind: 'closed-door', title: 'bad severity',
    severity: 'catastrophic', source: 'test',
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('rejected') || r.detail?.reason?.includes('severity'), JSON.stringify(r));
});

check('a concern missing required fields is schema-rejected with the real missing list, not a generic error', () => {
  const r = driver.declare('concern', { id: 'concern-test-003', kind: 'closed-door' });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.detail.missing.sort(), ['severity', 'source', 'title']);
});

check('a real concern persists and is queryable back by id', () => {
  const fetched = driver.registry.get('concern', 'concern-test-001');
  assert.strictEqual(fetched.title, 'a real detected concern');
});

check('kind is open-ended (not a closed enum) — an unseen concern kind still registers, same philosophy as hook type', () => {
  const r = driver.declare('concern', {
    id: 'concern-test-004', kind: 'a-brand-new-kind-nobody-has-used-yet',
    title: 'novel kind', severity: 'low', source: 'test',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

// ── §SB1 2026-08-14 (docs/nexus-self-build-pipeline-phasemap.spec) ─────────
// dir (component), type+intent (wire), schemaVersion — additive, optional
// fields, added to loom's own gates (not warp/core/Gate.js, which does not
// check optional fields at all — confirmed by reading Gate.validateOutput
// directly before writing these). §12.1: hostile inputs, not happy path only.

check('a component WITH a real dir field registers and the field round-trips', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-with-dir', namespace: 'test', name: 'Has Dir', version: '1.0.0',
    dir: 'lib/agent-system', uuid: 'test-sb1-comp-dir-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.dir, 'lib/agent-system');
});

check('a component WITHOUT dir still registers fine — optional means optional, not silently required', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-no-dir', namespace: 'test', name: 'No Dir', version: '1.0.0',
    uuid: 'test-sb1-comp-nodir-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.dir, undefined);
});

check('a component with dir as the WRONG TYPE (number) is rejected, not silently coerced', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-bad-dir-type', namespace: 'test', name: 'Bad Dir', version: '1.0.0',
    dir: 12345, uuid: 'test-sb1-comp-baddir-001',
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.detail?.wrongType?.some(w => w.key === 'dir'), JSON.stringify(r));
});

check('a component with dir as an empty string is accepted — empty is a valid (if unusual) string, not the same as absent', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-empty-dir', namespace: 'test', name: 'Empty Dir', version: '1.0.0',
    dir: '', uuid: 'test-sb1-comp-emptydir-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

check('a component with dir=null is treated as absent, not as a type error — null is the honest "no value" case', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-null-dir', namespace: 'test', name: 'Null Dir', version: '1.0.0',
    dir: null, uuid: 'test-sb1-comp-nulldir-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

check('a component with an extremely long dir path (10,000 chars) still registers — no arbitrary length ceiling assumed', () => {
  const longDir = 'a/'.repeat(5000);
  const r = driver.declare('component', {
    id: 'sb1-comp-long-dir', namespace: 'test', name: 'Long Dir', version: '1.0.0',
    dir: longDir, uuid: 'test-sb1-comp-longdir-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.dir.length, longDir.length);
});

check('a component with unicode in dir (emoji, RTL text) round-trips exactly, not mangled', () => {
  const weirdDir = 'lib/日本語/🎉/مرحبا';
  const r = driver.declare('component', {
    id: 'sb1-comp-unicode-dir', namespace: 'test', name: 'Unicode Dir', version: '1.0.0',
    dir: weirdDir, uuid: 'test-sb1-comp-unicodedir-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.dir, weirdDir);
});

check('a fresh component registration gets a real schemaVersion, not undefined', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-schemaver', namespace: 'test', name: 'Schema Ver', version: '1.0.0',
    uuid: 'test-sb1-comp-schemaver-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(typeof r.stored.schemaVersion, 'string');
  assert.ok(r.stored.schemaVersion.length > 0);
});

check('a caller-supplied schemaVersion is preserved, not silently overwritten by the default', () => {
  const r = driver.declare('component', {
    id: 'sb1-comp-explicit-schemaver', namespace: 'test', name: 'Explicit Ver', version: '1.0.0',
    schemaVersion: '9.9.9-custom', uuid: 'test-sb1-comp-explicitver-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.schemaVersion, '9.9.9-custom');
});

check('a wire WITH real type + intent registers and both round-trip', () => {
  driver.declare('hook', { id: 'sb1.hook.a', component_id: 'sb1-comp-with-dir', name: 'a', type: 'event', direction: 'out', uuid: 'test-sb1-hook-a-001' });
  driver.declare('hook', { id: 'sb1.hook.b', component_id: 'sb1-comp-no-dir', name: 'b', type: 'event', direction: 'in', uuid: 'test-sb1-hook-b-001' });
  const r = driver.declare('wire', {
    id: 'sb1-wire-with-type-intent', from_hook_id: 'sb1.hook.a', to_hook_id: 'sb1.hook.b',
    type: 'event', intent: 'test wire carries a real reason', uuid: 'test-sb1-wire-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.type, 'event');
  assert.strictEqual(r.stored.intent, 'test wire carries a real reason');
});

check('a wire with type as the WRONG TYPE (array) is rejected', () => {
  const r = driver.declare('wire', {
    id: 'sb1-wire-bad-type', from_hook_id: 'sb1.hook.a', to_hook_id: 'sb1.hook.b',
    type: ['not', 'a', 'string'], uuid: 'test-sb1-wire-badtype-001',
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.detail?.wrongType?.some(w => w.key === 'type'), JSON.stringify(r));
});

check('a wire without type/intent still registers — the historical majority of real wires (source-map.js pre-fix) had neither', () => {
  const r = driver.declare('wire', {
    id: 'sb1-wire-no-type-intent', from_hook_id: 'sb1.hook.a', to_hook_id: 'sb1.hook.b',
    uuid: 'test-sb1-wire-notype-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

// ── §SB1-EXT 2026-08-14 — comp_status + comp_dependencies ──────────────────
// Naming: person's own correction of an earlier collision (two tiers were
// both drafted "Acceptable") — final: stub / acceptable / release.

check('a component with a valid comp_status registers and round-trips', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-comp-status', namespace: 'test', name: 'Status', version: '1.0.0',
    comp_status: 'release', uuid: 'test-sb1ext-status-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.stored.comp_status, 'release');
});

check('all three real comp_status values (stub/acceptable/release) are each individually accepted', () => {
  for (const status of ['stub', 'acceptable', 'release']) {
    const r = driver.declare('component', {
      id: `sb1ext-status-${status}`, namespace: 'test', name: status, version: '1.0.0',
      comp_status: status, uuid: `test-sb1ext-status-${status}-001`,
    });
    assert.strictEqual(r.ok, true, `${status}: ${JSON.stringify(r)}`);
  }
});

check('an invalid comp_status ("done", not a real tier) is rejected, not silently accepted as a typo', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-bad-status', namespace: 'test', name: 'Bad Status', version: '1.0.0',
    comp_status: 'done', uuid: 'test-sb1ext-badstatus-001',
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.detail?.wrongType?.some(w => w.key === 'comp_status'), JSON.stringify(r));
});

check('comp_status as the wrong TYPE (number) is rejected the same way', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-numeric-status', namespace: 'test', name: 'Numeric Status', version: '1.0.0',
    comp_status: 2, uuid: 'test-sb1ext-numstatus-001',
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
});

check('a component without comp_status still registers fine — optional, not required', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-no-status', namespace: 'test', name: 'No Status', version: '1.0.0',
    uuid: 'test-sb1ext-nostatus-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

check('a component with a real comp_dependencies array registers and round-trips', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-comp-deps', namespace: 'test', name: 'Deps', version: '1.0.0',
    comp_dependencies: ['sb1ext-comp-status', 'sb1ext-status-stub'],
    uuid: 'test-sb1ext-deps-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(r.stored.comp_dependencies, ['sb1ext-comp-status', 'sb1ext-status-stub']);
});

check('an EMPTY comp_dependencies array is valid — a component can genuinely depend on nothing', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-empty-deps', namespace: 'test', name: 'Empty Deps', version: '1.0.0',
    comp_dependencies: [], uuid: 'test-sb1ext-emptydeps-001',
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

check('comp_dependencies as a non-array (a bare string) is rejected', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-string-deps', namespace: 'test', name: 'String Deps', version: '1.0.0',
    comp_dependencies: 'sb1ext-comp-status', uuid: 'test-sb1ext-strdeps-001',
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
});

check('comp_dependencies with a NON-STRING element (a number mixed into the array) is rejected, with the offending index named', () => {
  const r = driver.declare('component', {
    id: 'sb1ext-mixed-deps', namespace: 'test', name: 'Mixed Deps', version: '1.0.0',
    comp_dependencies: ['real.id', 42, 'other.id'], uuid: 'test-sb1ext-mixeddeps-001',
  });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.detail?.wrongType?.some(w => w.key === 'comp_dependencies[1]'), JSON.stringify(r));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);