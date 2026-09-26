'use strict';
// §SANDBOX — real spec-engine under a throwaway data root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-idearium-spec-meta-cache.test.js — §0.39.265
 *
 * James: "its really unstable. idearium." A repo list parsed every repo's whole
 * manifest (chunk content included — nexus/core's is ~20 MB) on every call.
 * loadSpecMeta(): chunk content stripped, cached against the manifest's
 * mtime+size, dropped by saveSpec, used by RepoLayer._enrich.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.IDEARIUM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'specmeta-idearium-'));

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

(async () => {
  console.log('\n  idearium — spec metadata cache');
  const se = await import(path.join(ROOT, 'idearium', 'spec-engine', 'index.js'));
  const big = se.ingestFilesAsSpec({ name: 'big', files: Array.from({ length: 400 }, (_, i) => ({ path: `src/f${i}.js`, content: `// file ${i}\n` + 'x'.repeat(20000) })) });

  await test('metadata has every chunk and no chunk content', () => {
    const m = se.loadSpecMeta(big.uuid);
    assert.strictEqual(m.chunks.length, 400);
    assert.ok(m.chunks.every(c => !('content' in c) && c.realPath && c.status === 'complete'));
    assert.ok(se.loadSpec(big.uuid).chunks[0].content.length > 20000, 'loadSpec still returns content');
  });

  await test('a second read is served from the cache, and is far cheaper than a full parse', () => {
    const a = se.loadSpecMeta(big.uuid);
    let t = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) se.loadSpecMeta(big.uuid);
    const cached = Number(process.hrtime.bigint() - t) / 1e6;
    t = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) se.loadSpec(big.uuid);
    const full = Number(process.hrtime.bigint() - t) / 1e6;
    assert.strictEqual(se.loadSpecMeta(big.uuid), a, 'same cached object');
    assert.ok(cached * 10 < full, `cached ${cached.toFixed(1)}ms vs full ${full.toFixed(1)}ms`);
    console.log(`    (20 reads: cached ${cached.toFixed(1)} ms, full parse ${full.toFixed(1)} ms)`);
  });

  await test('saving the spec invalidates the cache — no stale file list', () => {
    const m = se.loadSpec(big.uuid);
    m.name = 'renamed';
    se.saveSpec(m);
    assert.strictEqual(se.loadSpecMeta(big.uuid).name, 'renamed');
    se.addChunk(big.uuid, { sectionId: 'added', title: 'src/added.js', content: 'module.exports = 1;\n', realPath: 'src/added.js' });
    assert.ok(se.loadSpecMeta(big.uuid).chunks.some(c => c.realPath === 'src/added.js'));
  });

  await test('an unknown spec throws the same "not found" as loadSpec', () => {
    assert.throws(() => se.loadSpecMeta('00000000-0000-0000-0000-000000000000'), /not found/);
  });

  await test('the repo list reads metadata, not whole manifests', () => {
    const repo = fs.readFileSync(path.join(ROOT, 'idearium', 'repo', 'index.js'), 'utf8');
    const i = repo.indexOf('  _enrich(r) {');
    assert.ok(/this\.se\.loadSpecMeta\(r\.specUuid\)/.test(repo.slice(i, i + 900)));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
