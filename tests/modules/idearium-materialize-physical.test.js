'use strict';
// Real, isolated test for RepoLayer's materialize() — James: "files in
// the compartment/repo are physical in the /projects/repo name or
// uuid... make idearium solid. persistent. physical."
//
// §ISOLATED — same real IDEARIUM_DATA_DIR/JAA_DATA_DIR convention this
// session already established.
const fs = require('fs');
const os = require('os');
const path = require('path');
const _isolatedData = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-materialize-'));
const _isolatedJaa = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-materialize-jaa-'));
process.env.IDEARIUM_DATA_DIR = _isolatedData;
process.env.JAA_DATA_DIR = _isolatedJaa;
process.on('exit', () => {
  try { fs.rmSync(_isolatedData, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_isolatedJaa, { recursive: true, force: true }); } catch (_) {}
});

const assert = require('assert');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

async function main() {
  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const { getIdeaOS } = await import('../../idearium/core/index.js');
  const repoLayer = new RepoLayer({ ideaOS: getIdeaOS(), specEngine: se });

  test('T-001', 'the real, physical /projects/<repoUuid>/ directory exists the moment the repo is created, even with 0 built chunks', () => {
    const manifest = se.createSpec({ name: 'materialize-test-1', type: 'component' });
    const result = repoLayer.ingest({ name: manifest.name, specUuid: manifest.uuid, source: 'spec.create.auto' });
    const projectDir = path.join(_isolatedData, 'projects', result.repo.uuid);
    assert.ok(fs.existsSync(projectDir), `expected a real, physical directory at ${projectDir}`);
  });

  test('T-002', 'writing a real chunk actually appears as a real, physical file on disk, not just in the manifest', () => {
    const manifest = se.createSpec({ name: 'materialize-test-2', type: 'component' });
    const result = repoLayer.ingest({ name: manifest.name, specUuid: manifest.uuid, source: 'spec.create.auto' });
    const firstChunk = manifest.chunks[0];
    repoLayer.writeFile(result.repo.uuid, firstChunk.sectionId, 'real, physical content');
    const physicalPath = path.join(_isolatedData, 'projects', result.repo.uuid, firstChunk.fileName || firstChunk.sectionId);
    // fileName may differ slightly from sectionId — read the real repo listing to get the exact real path, not guess it
    const realFile = repoLayer.get(result.repo.uuid).files.find(f => f.path.includes(firstChunk.sectionId));
    assert.ok(realFile, 'expected the written chunk to appear in the real repo file listing');
    const actualPath = path.join(_isolatedData, 'projects', result.repo.uuid, realFile.path);
    assert.ok(fs.existsSync(actualPath), `expected a real physical file at ${actualPath}`);
    assert.strictEqual(fs.readFileSync(actualPath, 'utf8'), 'real, physical content');
  });

  test('T-003', 'deleting a file makes it genuinely disappear from disk, not just from the manifest', () => {
    const manifest = se.createSpec({ name: 'materialize-test-3', type: 'component' });
    const result = repoLayer.ingest({ name: manifest.name, specUuid: manifest.uuid, source: 'spec.create.auto' });
    const firstChunk = manifest.chunks[0];
    repoLayer.writeFile(result.repo.uuid, firstChunk.sectionId, 'will be deleted');
    const realFile = repoLayer.get(result.repo.uuid).files.find(f => f.path.includes(firstChunk.sectionId));
    const physicalPath = path.join(_isolatedData, 'projects', result.repo.uuid, realFile.path);
    assert.ok(fs.existsSync(physicalPath), 'sanity check: the file really exists on disk before deletion');
    repoLayer.deleteFile(result.repo.uuid, firstChunk.sectionId);
    assert.ok(!fs.existsSync(physicalPath), 'the real, physical file must actually be gone after deleteFile(), not left as a stale copy');
  });

  test('T-004', 'materialize() is a real projection, not a second store — editing the manifest and re-materializing overwrites a stale physical file', () => {
    const manifest = se.createSpec({ name: 'materialize-test-4', type: 'component' });
    const result = repoLayer.ingest({ name: manifest.name, specUuid: manifest.uuid, source: 'spec.create.auto' });
    const firstChunk = manifest.chunks[0];
    repoLayer.writeFile(result.repo.uuid, firstChunk.sectionId, 'version one');
    const realFile = repoLayer.get(result.repo.uuid).files.find(f => f.path.includes(firstChunk.sectionId));
    const physicalPath = path.join(_isolatedData, 'projects', result.repo.uuid, realFile.path);
    // Simulate a stray, out-of-band edit directly on disk — must never survive a re-materialize.
    fs.writeFileSync(physicalPath, 'a stray edit that bypassed the real manifest');
    repoLayer.writeFile(result.repo.uuid, firstChunk.sectionId, 'version two, the real content');
    assert.strictEqual(fs.readFileSync(physicalPath, 'utf8'), 'version two, the real content', 'the manifest must remain the one real source of truth — a stray physical edit must not survive a real re-materialize');
  });

  test('T-005', 'materialize() on a repo with a failed spec-engine lookup returns a real error, not a silent no-op or a throw', () => {
    const result = repoLayer.materialize('genuinely-nonexistent-repo-uuid');
    assert.ok(result.error, 'expected a real, honest error for a repo that does not exist');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
