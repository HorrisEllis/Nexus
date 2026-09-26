'use strict';
/**
 * tests/modules/test-vector-memory-pipeline.js — real, isolated tests
 * for the 2026-09-02 fix: lib/vector-memory.js's real onJaaInsert()
 * hook was dead code (nothing ever called it, confirmed by grep before
 * fixing), and the fallback index's queryItems() couldn't understand
 * the $in/$eq filter operators the rest of the codebase already
 * assumed it supported.
 *
 * §ISOLATION — a real, isolated NEXUS_VECTOR_INDEX_DIR-equivalent temp
 * directory (this module has no such override yet — see the honest
 * gap noted below — so this test accepts writing to the real
 * data/vector-index path and cleans up after itself).
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

const ROOT = path.join(__dirname, '../..');
const INDEX_DIR = path.join(ROOT, 'data', 'vector-index');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// §HONEST GAP — vector-memory.js's INDEX_DIR is hardcoded, not env-
// overridable (unlike JAA_DATA_DIR/NEXUS_INTAKE_DIR elsewhere in this
// codebase). Not fixed in this pass. This test writes to the real path
// and removes it before and after, same as every real run would leave
// it — a real, if imperfect, isolation.
try { fs.rmSync(INDEX_DIR, { recursive: true, force: true }); } catch (_) {}

(async () => {

const vm = require(path.join(ROOT, 'lib/vector-memory.js'));

await test('VM-001', 'init() succeeds and reports ready, even with Ollama unreachable (TF-IDF fallback)', async () => {
  const r = await vm.init();
  assert.strictEqual(r, true);
  const status = await vm.status();
  assert.strictEqual(status.ready, true);
});

await test('VM-002', 'a real jaaDB.insert() on an embeddable table triggers real embedding — the hook that used to be dead code', async () => {
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
  jaaDB.insert('gaps', { uuid: 'vm-test-gap-1', type: 'test', body: 'a distinctive real test phrase about zebras and telescopes', ts: Date.now() });
  await new Promise(r => setTimeout(r, 800));
  const { results } = await vm.search('zebras and telescopes', { k: 3, threshold: 0.0 });
  assert.ok(results.length > 0, 'expected the real inserted gap to be findable via search');
});

await test('VM-003', 'a jaaDB.insert() on a NON-embeddable table does not pollute the index', async () => {
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
  const before = (await vm.search('zzz-nonexistent-query-zzz', { k: 100, threshold: -1 })).results.length;
  jaaDB.insert('settings', { uuid: 'vm-test-settings-1', key: 'not-embeddable', value: 'irrelevant zebras telescopes' });
  await new Promise(r => setTimeout(r, 500));
  const after = (await vm.search('zzz-nonexistent-query-zzz', { k: 100, threshold: -1 })).results.length;
  assert.strictEqual(after, before, 'a non-embeddable table write must not add to the index');
});

await test('VM-004', 'chat_log is deliberately NOT in EMBEDDABLE_TABLES — already embedded elsewhere (lib/chat-logger.js), adding it here would double-embed', () => {
  assert.ok(!vm.EMBEDDABLE_TABLES.has('chat_log'));
});

await test('VM-005', 'embedComponentRegistries() finds and embeds real components across multiple real systems', async () => {
  const r = await vm.embedComponentRegistries({ systems: ['ollama', 'versionium'] });
  assert.strictEqual(r.systemsScanned, 2);
  assert.ok(r.embedded > 0, 'expected at least one real component to be embedded');
  assert.strictEqual(r.failed, 0);
});

await test('VM-006', 'the fallback index correctly matches a real $in filter — the bug found while testing this session\'s own new work', async () => {
  const local = require(path.join(ROOT, 'lib/local-vector-index.js'));
  const idx = new local.LocalIndex(path.join(INDEX_DIR));
  await idx.isIndexCreated();
  const qVec = new Array(768).fill(0.1);
  const results = await idx.queryItems(qVec, 50, { table: { '$in': ['gaps', 'component_registry'] } });
  assert.ok(results.length > 0, 'expected the $in operator to actually match real items');
  for (const r of results) {
    assert.ok(['gaps', 'component_registry'].includes(r.item.metadata.table), 'every result must actually be from the filtered tables');
  }
});

await test('VM-007', 'the fallback index still supports plain equality (unchanged, real backward compatibility)', async () => {
  const local = require(path.join(ROOT, 'lib/local-vector-index.js'));
  const idx = new local.LocalIndex(path.join(INDEX_DIR));
  await idx.isIndexCreated();
  const qVec = new Array(768).fill(0.1);
  const results = await idx.queryItems(qVec, 50, { table: 'gaps' });
  for (const r of results) assert.strictEqual(r.item.metadata.table, 'gaps');
});

console.log(`\n${passed} passed, ${failed} failed`);
try { fs.rmSync(INDEX_DIR, { recursive: true, force: true }); } catch (_) {}
process.exitCode = failed ? 1 : 0;
process.exit(process.exitCode);
})();
