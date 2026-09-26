'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// ── The shared class does real CRUD against a real JaaStore ──────────────────
const { HookRegistry } = require('../../lib/hook-registry');
const { JaaStore } = require('../../guardian/jaa-store');

test('T-001', 'shared lib/hook-registry does real register/get/update/wire/unwire against a real store', () => {
  const store = new JaaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-')));
  const jaa = {
    query: (t, w, n) => store.all(t, w, typeof n === 'number' ? { limit: n } : n),
    get: (t, w) => store.get(t, w), insert: (t, r) => store.insert(t, r),
    update: (t, w, v) => store.update(t, w, v), delete: (t, w) => store.delete(t, w),
    upsert: (t, r, k) => store.upsert(t, r, k), tail: (t, n) => store.all(t, {}, { limit: n }),
  };
  const reg = new HookRegistry({ jaa });
  reg.init();
  const a = reg.register({ name: 'test.hook.a', type: 'event-bus', direction: 'unidirectional',
    from: { surface: 'test-a', layer: 1 }, to: { surface: 'test-b', layer: 1 }, schema: { input: { x: 'number' } } });
  const b = reg.register({ name: 'test.hook.b', type: 'event-bus', direction: 'unidirectional',
    from: { surface: 'test-b', layer: 1 }, to: { surface: 'test-c', layer: 1 }, schema: { output: { y: 'number' } } });
  assert.ok(a.id && b.id);
  assert.strictEqual(reg.list().length, 2);
  reg.update(a.id, { layer: 2 });
  assert.strictEqual(reg.get(a.id).layer, 2);
  const binding = reg.wire(a.id, b.id, { notes: 'test wire' });
  assert.ok(binding.id);
  reg.unwire(binding.id);
  reg.deprecate(b.id, 'test done', 'test');
  assert.strictEqual(reg.get(b.id).meta.status, 'deprecated');
});

// ── Ownership contract — static, per docs/hooks-migration.spec ───────────────
const loomSrc = fs.readFileSync(path.join(__dirname, '../../loom/server.js'), 'utf8');
const archSrc = fs.readFileSync(path.join(__dirname, '../../architect/service.js'), 'utf8');

test('T-002', 'loom requires the shared class and exposes the mutation surface', () => {
  assert.ok(loomSrc.includes("require('../lib/hook-registry')"));
  for (const marker of ['hookRegistry.register(', 'hookRegistry.update(', 'hookRegistry.wire(', 'hookRegistry.unwire(', 'hookRegistry.remove(', 'hookRegistry.deprecate(']) {
    assert.ok(loomSrc.includes(marker), `loom missing mutation surface: ${marker}`);
  }
});

test('T-003', 'loom owns seeding and the component-registry sync loop', () => {
  assert.ok(loomSrc.includes('_seedBuiltinHooks'));
  assert.ok(loomSrc.includes('hook-sync-from-component-registry'));
});

test('T-004', 'architect no longer seeds, syncs, or mutates — read view only (§10.1)', () => {
  assert.ok(!archSrc.includes('_seedBuiltinHooks(registry)'), 'architect must not seed');
  assert.ok(!archSrc.includes("require('./src/hooks/sync-from-component-registry')"), 'architect must not run the sync loop');
  for (const marker of ['registry.register(', 'registry.update(', 'registry.remove(', 'registry.deprecate(', 'registry.wire(', 'registry.unwire(']) {
    assert.ok(!archSrc.includes(marker), `architect still mutates: ${marker}`);
  }
  assert.ok(archSrc.includes('registry.list('), 'architect keeps the read view');
});

test('T-005', 'architect answers hook mutations with a loud 410 pointer to loom, not silence', () => {
  assert.ok(archSrc.includes('410'));
  assert.ok(archSrc.includes('hook mutations moved to loom'));
  assert.ok(archSrc.includes('3752'));
});

test('T-006', 'old class location is gone — one shared source (§10.3)', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '../../architect/src/hooks/Registry.js')));
  assert.ok(fs.existsSync(path.join(__dirname, '../../lib/hook-registry.js')));
});


test('T-007', 'architect reads the CANONICAL hook store, not a private one (§10.3)', () => {
  // The 269-vs-230 divergence: architect built its HookRegistry on
  // createJAA(DATA_DIR) — its own private store — so it reported a stale hook
  // count nothing else could see. The read view must read what loom writes.
  assert.ok(/cortex\/memory\/jaa-db/.test(archSrc),
    'architect must require the canonical jaa-db for its hook registry');
  assert.ok(/new HookRegistry\(\{\s*jaa:\s*hookJaa/.test(archSrc),
    'architect HookRegistry must be constructed with the canonical store, not its local jaa');
});

test('T-008', 'loom /health reports the registry it owns (§12.6)', () => {
  assert.ok(/hooks:\s*\{\s*total/.test(loomSrc), 'loom health must report hook total');
  assert.ok(/components:\s*\{\s*total/.test(loomSrc), 'loom health must report component total');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
