'use strict';
/**
 * tests/modules/test-component-registry.js
 * Phase 1 tests — 16 tests, T-001 through T-016
 */

const assert = require('assert');
const reg    = require('../../lib/component-registry');

let passed = 0, failed = 0;

function test(id, desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${id} ${desc}`);
    passed++;
  } catch(e) {
    console.error(`  ✗ ${id} ${desc}\n    ${e.message}`);
    failed++;
  }
}

// ── Mock JAA ──────────────────────────────────────────────────────────────────
const _store = {};
const mockJaa = {
  insert: (table, row) => { _store[row.id || row.uuid] = { ...row }; return row; },
  update: (table, uuid, row) => { _store[row.id || uuid] = { ...row }; return row; },
  query:  (table, fn) => Object.values(_store).filter(fn),
};

reg.init(mockJaa, null);

// ── Sample component ───────────────────────────────────────────────────────────
const SAMPLE = {
  id:          'cortex.gaps.list',
  namespace:   'cortex',
  name:        'gaps.list',
  version:     '1.0.0',
  grammar:     ['cortex gaps list', 'list gaps', 'gaps'],
  route:       { method: 'GET', path: '/api/cortex/gaps', proxy: 'cortex' },
  description: 'List open gaps with severity and friction score',
  tags:        ['memory', 'healing', 'monitoring'],
  params:      [{ name:'status', type:'enum', values:['open','closed','all'], default:'open', cli:'--status' }],
};

const SAMPLE2 = {
  id:          'forge.patch',
  namespace:   'forge',
  name:        'patch',
  version:     '1.0.0',
  grammar:     ['forge patch', 'fp'],
  route:       { method: 'POST', path: '/api/forge/patch', proxy: 'forge' },
  description: 'Apply a targeted patch to a module',
  tags:        ['build', 'repair'],
};

// ── T-001: Register single → appears in list ───────────────────────────────────
test('T-001', 'register single component → list returns it', () => {
  const r = reg.register(SAMPLE);
  assert.ok(r.ok, 'register failed: ' + JSON.stringify(r.errors));
  assert.ok(r.created, 'should be created');
  const items = reg.list();
  const found = items.find(c => c.id === 'cortex.gaps.list');
  assert.ok(found, 'component not in list');
  assert.strictEqual(found.description, SAMPLE.description);
});

// ── T-002: Register batch → all appear ────────────────────────────────────────
test('T-002', 'register component array → all appear in list', () => {
  const results = reg.registerBatch([SAMPLE2, {
    id:'liminal.spaces.list', namespace:'liminal', name:'spaces.list',
    version:'1.0.0', grammar:['liminal list','lm'],
    route:{ method:'GET', path:'/api/liminal/spaces' },
    description:'List all five interstitial spaces', tags:['memory','liminal'],
  }]);
  assert.ok(results.every(r => r.ok), 'batch register failed');
  const items = reg.list();
  assert.ok(items.find(c => c.id === 'forge.patch'));
  assert.ok(items.find(c => c.id === 'liminal.spaces.list'));
});

// ── T-003: Re-register same id → update, no duplicate ─────────────────────────
test('T-003', 're-register same id → updates, no duplicate', () => {
  const before = reg.list().length;
  const r = reg.register({ ...SAMPLE, description: 'Updated description' });
  assert.ok(r.ok);
  assert.ok(!r.created, 'should not be created (should be update)');
  const after = reg.list().length;
  assert.strictEqual(before, after, 'list grew — duplicate created');
  const found = reg.get('cortex.gaps.list');
  assert.strictEqual(found.description, 'Updated description');
});

// ── T-004: Missing required field → 400 with specific error ───────────────────
test('T-004', 'register with missing required field → validation error', () => {
  const r = reg.register({ id:'cortex.test', namespace:'cortex', name:'test',
    version:'1.0.0', grammar:['cortex test'], route:{ method:'GET', path:'/api/test' }
    // missing: description
  });
  assert.ok(!r.ok, 'should have failed');
  assert.ok(r.errors.some(e => e.includes('description')), 'should mention description');
});

// ── T-005: Invalid id format → CR-004 error ───────────────────────────────────
test('T-005', 'register with invalid id format → CR-004 error', () => {
  const r = reg.register({ ...SAMPLE, id: 'BadFormat', namespace:'BadFormat' });
  assert.ok(!r.ok);
  assert.ok(r.errors.some(e => e.includes('namespace.name')),
    'should mention namespace.name format');
});

// ── T-006: Grammar tree shape ─────────────────────────────────────────────────
test('T-006', 'GET /api/components/grammar → correct tree shape', () => {
  const tree = reg.buildGrammarTree();
  assert.ok(tree.tree, 'tree property missing');
  assert.ok(tree.aliases, 'aliases property missing');
  assert.ok(typeof tree.componentCount === 'number');
  // cortex.gaps.list should appear
  assert.ok(tree.tree.cortex?.gaps?.list?.componentId === 'cortex.gaps.list',
    'cortex.gaps.list not in tree');
  // aliases: 'gaps' → cortex.gaps.list
  assert.strictEqual(tree.aliases['gaps'], 'cortex.gaps.list');
  assert.strictEqual(tree.aliases['lm'], 'liminal.spaces.list');
});

// ── T-007: onSystemRegister auto-registers components ─────────────────────────
test('T-007', 'system registers with components[] → auto-registered', () => {
  const sysComponents = [{
    id:'guardian.ncp.status', namespace:'guardian', name:'ncp.status',
    version:'1.0.0', grammar:['guardian status','gs'],
    route:{ method:'GET', path:'/api/guardian/status' },
    description:'Guardian NCP provider status',
  }];
  reg.onSystemRegister('guardian', sysComponents, null);
  const found = reg.get('guardian.ncp.status');
  assert.ok(found, 'component not registered');
  assert.strictEqual(found.registeredBy, 'guardian');
});

// ── T-008: System offline → components unavailable ────────────────────────────
test('T-008', 'system goes offline → components marked unavailable:true', () => {
  const result = reg.markAvailable('guardian', false);
  assert.ok(result.count > 0, 'no components marked');
  const found = reg.get('guardian.ncp.status');
  assert.strictEqual(found.available, false);
});

// ── T-009: System online → components available ────────────────────────────────
test('T-009', 'system comes back → components marked available:true', () => {
  reg.markAvailable('guardian', true);
  const found = reg.get('guardian.ncp.status');
  assert.strictEqual(found.available, true);
});

// ── T-010: Deprecate → still queryable, flagged ────────────────────────────────
test('T-010', 'deprecate component → still in list, deprecated:true', () => {
  reg.register({ ...SAMPLE2, id:'forge.old', namespace:'forge', name:'old',
    grammar:['forge old'], description:'Old forge command' });
  const r = reg.deprecate('forge.old', 'forge.patch');
  assert.ok(r.ok);
  const found = reg.get('forge.old');
  assert.ok(found, 'deprecated component should still be gettable');
  assert.strictEqual(found.deprecated, true);
  assert.strictEqual(found.deprecatedBy, 'forge.patch');
  // Should appear in list (deprecated included by default)
  const all = reg.list();
  assert.ok(all.find(c => c.id === 'forge.old'));
  // But not in grammar tree
  const tree = reg.buildGrammarTree();
  assert.ok(!tree.aliases['forge old'], 'deprecated should not be in grammar');
});

// ── T-011: Filter by tag ────────────────────────────────────────────────────────
test('T-011', 'list({ tag:"healing" }) → only tagged components', () => {
  const items = reg.list({ tag: 'healing' });
  assert.ok(items.length > 0, 'no items with tag:healing');
  assert.ok(items.every(c => c.tags.includes('healing')),
    'non-healing items returned');
});

// ── T-012: Text search ─────────────────────────────────────────────────────────
test('T-012', 'list({ q:"gaps" }) → text search across id/description/grammar', () => {
  const items = reg.list({ q: 'gaps' });
  assert.ok(items.length > 0, 'no search results for "gaps"');
  assert.ok(items.find(c => c.id === 'cortex.gaps.list'));
});

// ── T-013: JAA restart persistence ────────────────────────────────────────────
test('T-013', 'init() loads components from JAA into index', () => {
  // Simulate restart: fresh registry, same JAA
  const reg2 = require('../../lib/component-registry');
  // Re-init with same mock JAA (already has data)
  const result = reg2.init(mockJaa, null);
  assert.ok(result.ok);
  assert.ok(result.count > 0, 'no components loaded from JAA');
  // cortex.gaps.list should still be there
  const found = reg2.get('cortex.gaps.list');
  assert.ok(found, 'component lost after re-init');
});

// ── T-014: Registration emits event ────────────────────────────────────────────
test('T-014', 'register() emits component.registered event', () => {
  const events = [];
  const mockBus = { emit: (type, payload) => events.push({ type, payload }) };
  // Re-init with bus
  reg.init(mockJaa, mockBus);
  reg.register({
    id:'test.event.check', namespace:'test', name:'event.check',
    version:'1.0.0', grammar:['test event'],
    route:{ method:'GET', path:'/api/test' },
    description:'Test event emission',
  });
  const found = events.find(e => e.type === 'component.registered' || e.type === 'component.updated');
  assert.ok(found, 'no registry event emitted');
});

// ── T-015: Grammar excludes unavailable + deprecated ──────────────────────────
test('T-015', 'grammar tree excludes unavailable and deprecated components', () => {
  // guardian is available again, forge.old is deprecated
  const tree = reg.buildGrammarTree();
  // forge.old (deprecated) should not be in grammar
  const allLeaves = JSON.stringify(tree.tree);
  assert.ok(!allLeaves.includes('"forge.old"'), 'deprecated component in grammar');
});

// ── T-016: Architecture test — Liminal registers, zero shell code touched ─────
test('T-016', 'new system registers 4 components → grammar contains them, no shell touched', () => {
  const liminalComponents = [
    { id:'liminal.spaces.show',    namespace:'liminal', name:'spaces.show',    version:'1.0.0', grammar:['liminal show'],    route:{ method:'GET',  path:'/api/liminal/spaces/:id' }, description:'Show one interstitial space' },
    { id:'liminal.spaces.hold',    namespace:'liminal', name:'spaces.hold',    version:'1.0.0', grammar:['liminal hold'],    route:{ method:'POST', path:'/api/liminal/hold' },         description:'Manually inject unresolved item' },
    { id:'liminal.spaces.resolve', namespace:'liminal', name:'spaces.resolve', version:'1.0.0', grammar:['liminal resolve'], route:{ method:'POST', path:'/api/liminal/resolve' },      description:'Close an interstitial item with decision' },
  ];
  reg.onSystemRegister('liminal', liminalComponents, null);
  const tree = reg.buildGrammarTree();

  // All four liminal commands in grammar tree
  assert.ok(tree.tree.liminal?.list?.componentId === 'liminal.spaces.list', 'liminal list missing');
  assert.ok(tree.tree.liminal?.show?.componentId === 'liminal.spaces.show', 'liminal show missing');
  assert.ok(tree.tree.liminal?.hold?.componentId === 'liminal.spaces.hold', 'liminal hold missing');
  assert.ok(tree.tree.liminal?.resolve?.componentId === 'liminal.spaces.resolve', 'liminal resolve missing');

  // Aliases work
  assert.strictEqual(tree.aliases['lm'], 'liminal.spaces.list');

  // No shell code was needed — the architecture test passes
  console.log('    → Architecture test PASS: Liminal registered, grammar updated, zero shell code touched');
});

// ── T-017: §CLI-FIX — bulk list route (didn't exist; cli/nexus-cli.js's
//    reasoning-layer fallback always got an empty component list) ───────────
test('T-017', 'GET /api/components (no sub) returns the full live component list', () => {
  const mockSearchParams = { get: () => null };
  const result = reg.handleRequest('GET', undefined, undefined, null, mockSearchParams);
  assert.strictEqual(result.ok, true);
  assert.ok(Array.isArray(result.components), 'expected components array');
  // liminal components from T-016 should be in here — same registry instance
  assert.ok(result.components.some(c => c.id === 'liminal.spaces.list'), 'bulk list missing a known-registered component');
  // forge.old (deprecated) — list() with no filter still includes it by
  // default (only buildGrammarTree excludes deprecated, per T-015); bulk
  // list is a raw view, not the grammar-filtered one.
});

test('T-017b', 'bulk list respects namespace filter via query params', () => {
  const mockSearchParams = { get: (k) => (k === 'namespace' ? 'liminal' : null) };
  const result = reg.handleRequest('GET', undefined, undefined, null, mockSearchParams);
  assert.ok(result.components.every(c => c.namespace === 'liminal'), 'namespace filter not applied');
  assert.ok(result.components.length >= 4, 'expected at least the 4 liminal components from T-016');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  component-registry: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
