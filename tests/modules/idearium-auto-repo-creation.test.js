'use strict';
// Real, isolated test for the auto-repo-creation fix. James, direct,
// repeated: "the moment a spec is made the compartment and repo are
// made... specs build compartments, which are repositories. it is not
// creating repositories." Confirmed by reading createSpec()'s full body
// first: it never touched RepoLayer at all — a repo only ever appeared
// later, through the separate, explicit promote path.
//
// §ISOLATED — same real IDEARIUM_DATA_DIR/JAA_DATA_DIR convention this
// session already established, set before anything requires idearium's
// real modules, so this test never touches the real, shipped
// idearium/data/ or the real shared JAA store.
const fs = require('fs');
const os = require('os');
const path = require('path');
const _isolatedData = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-repo-autocreate-'));
const _isolatedJaa = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-repo-autocreate-jaa-'));
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

  test('T-001', 'a repo can be created immediately for a fresh spec whose chunks are all still pending, using the exact real code path speceng.create now calls', () => {
    const manifest = se.createSpec({ name: 'auto-repo-test-1', type: 'component' });
    assert.ok(manifest.chunks.every(c => c.status === 'pending'), 'sanity check: a fresh spec\'s chunks really are all pending');

    const repoLayer = new RepoLayer({ ideaOS: getIdeaOS(), specEngine: se });
    const result = repoLayer.ingest({
      name: manifest.name, specUuid: manifest.uuid,
      source: 'spec.create.auto', parent: manifest.ideaUuid || null, promotedFromSpec: null,
    });

    assert.ok(!result.error, `expected no error, got: ${result.error}`);
    assert.ok(result.repo && result.repo.uuid, 'expected a real repo with a real uuid');
    assert.strictEqual(result.repo.specUuid, manifest.uuid);
  });

  test('T-002', 'two different fresh specs (identical, all-pending content) get two DIFFERENT repos, not deduped into one', () => {
    // §BUG this test guards against, already found and fixed by a prior
    // real commit (2026-09-03), re-verified here: an all-pending
    // manifest's rootHash is identical across every fresh spec built
    // from the same block set — a real dedup bug would have silently
    // collapsed every new spec's auto-created repo into the very first
    // one ever made.
    const m1 = se.createSpec({ name: 'auto-repo-test-2a', type: 'component' });
    const m2 = se.createSpec({ name: 'auto-repo-test-2b', type: 'component' });
    const repoLayer = new RepoLayer({ ideaOS: getIdeaOS(), specEngine: se });
    const r1 = repoLayer.ingest({ name: m1.name, specUuid: m1.uuid, source: 'spec.create.auto' });
    const r2 = repoLayer.ingest({ name: m2.name, specUuid: m2.uuid, source: 'spec.create.auto' });
    assert.ok(!r1.error && !r2.error);
    assert.notStrictEqual(r1.repo.uuid, r2.repo.uuid, 'two distinct fresh specs must get two distinct repos, not be deduped together');
    assert.strictEqual(r1.deduped, undefined, 'the first repo of its kind must never be reported as a dedup');
    assert.strictEqual(r2.deduped, undefined, 'a second, independently-created spec must never be reported as a dedup of the first');
  });

  test('T-003', 'a repo auto-created for a fresh spec can immediately receive real chunk writes as they build', () => {
    const manifest = se.createSpec({ name: 'auto-repo-test-3', type: 'component' });
    const repoLayer = new RepoLayer({ ideaOS: getIdeaOS(), specEngine: se });
    const result = repoLayer.ingest({ name: manifest.name, specUuid: manifest.uuid, source: 'spec.create.auto' });
    const firstChunk = manifest.chunks[0];
    const write = repoLayer.writeFile(result.repo.uuid, firstChunk.sectionId, 'real content, built after the repo already existed');
    assert.ok(write.ok, `expected a successful write into the pre-existing repo, got: ${JSON.stringify(write)}`);
    const read = repoLayer.readFile(result.repo.uuid, firstChunk.sectionId);
    assert.strictEqual(read.content, 'real content, built after the repo already existed');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
