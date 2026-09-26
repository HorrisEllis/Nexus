'use strict';
// James: "idearium crashes when chunking, its not stable... working with
// guardian." Pins the fixes for the crash measured in the 2026-09-21 boot log
// (V8 heap limit at chunk ~313 of 369 during a project ingest):
//   - a bulk ingest completes in one manifest write and stays small in memory
//   - the shared-store mirror holds metadata only, never chunk content
//   - an ingested project's unfinished chunks are never sent to an AI agent
//   - listSpecs() re-reads a manifest only when the file changed
// Run with --expose-gc to enable the memory assertion (skipped, loudly, otherwise).
const fs = require('fs');
const os = require('os');
const path = require('path');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-ingest-stab-'));
const _jaa  = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-ingest-stab-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.on('exit', () => {
  try { fs.rmSync(_data, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_jaa,  { recursive: true, force: true }); } catch (_) {}
});
const assert = require('assert');
const http = require('http');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const mkFiles = (n) => Array.from({ length: n }, (_, i) => ({
  path: `dir${i % 7}/file-${i}.js`,
  content: '// line\nconst x = 1;\n'.repeat(300 + (i % 5) * 200) + i,
}));

async function main() {
  const se = await import('../../idearium/spec-engine/index.js');
  const { jaaDB } = await import('../../idearium/lib/db.js');
  const { _startBuildQueuePoller, _buildingSpecs, _reconcileSpecRepos } = await import('../../idearium/api/index.js');

  let big;
  await test('T-001', 'a 369-file ingest completes, clears `ingesting`, and stays small in memory', async () => {
    const files = mkFiles(369);
    const t0 = Date.now();
    big = se.ingestFilesAsSpec({ name: 'stab-big', files });
    assert.strictEqual(big.totalChunks, 369);
    assert.strictEqual(big.doneChunks, 369);
    assert.strictEqual(big.status, 'complete');
    assert.ok(!big.ingesting, 'ingesting must be cleared by the final save');
    assert.ok(Date.now() - t0 < 15000, `ingest took ${Date.now() - t0}ms — the per-file full-manifest round trips are back`);
    const onDisk = JSON.parse(fs.readFileSync(path.join(_data, 'specs', big.uuid, 'manifest.json'), 'utf8'));
    assert.ok(!onDisk.ingesting);
    assert.strictEqual(onDisk.rootHash, se.computeRootHash(onDisk));
    if (global.gc) {
      global.gc();
      const mb = process.memoryUsage().heapUsed / 1048576;
      assert.ok(mb < 150, `heap after GC ${mb.toFixed(0)}MB — before the fix this was ~200MB at 120 files and grew with N squared`);
    } else console.log('    (heap assertion skipped — run node with --expose-gc)');
  });

  await test('T-002', 'each chunk is written like completeChunk writes it: same file, front matter, fields; realPath sanitized', async () => {
    const m = se.ingestFilesAsSpec({ name: 'stab-fmt', files: [
      { path: '../../etc/passwd', content: '  root:x:0:0  \n' },
      { path: '/abs/a.js', content: 'const a = 1;' },
    ] });
    const [c0, c1] = m.chunks;
    assert.strictEqual(c0.realPath, 'etc/passwd');
    assert.strictEqual(c1.realPath, 'abs/a.js');
    for (const c of [c0, c1]) {
      assert.strictEqual(c.status, 'complete');
      assert.strictEqual(c.agent, 'ingest');
      assert.strictEqual(c.agentModel, 'ingest:drop');
      const txt = fs.readFileSync(c.filePath, 'utf8');
      assert.ok(txt.startsWith(`---\nchunk_uuid: ${c.uuid}\nspec_uuid: ${m.uuid}\nsection: ${c.sectionId}\n`), 'front matter changed');
      assert.ok(txt.endsWith(`---\n\n${c.content}`));
      assert.strictEqual(c.byteSize, Buffer.byteLength(txt));
    }
    assert.strictEqual(c0.content, 'root:x:0:0', 'content is trimmed exactly as completeChunk trims it');
  });

  await test('T-003', 'a file with no text fails loudly and the spec is not marked complete', async () => {
    const m = se.ingestFilesAsSpec({ name: 'stab-empty', files: [
      { path: 'ok.js', content: 'x' }, { path: 'blob.bin', content: '' },
    ] });
    assert.strictEqual(m.chunks[0].status, 'complete');
    assert.strictEqual(m.chunks[1].status, 'failed');
    assert.match(m.chunks[1].failureMode, /no text content captured for blob\.bin/);
    assert.notStrictEqual(m.status, 'complete');
    assert.strictEqual(m.failedChunks, 1);
  });

  await test('T-004', 'the shared-store mirror holds metadata only — no chunk content anywhere in it', async () => {
    const rows = jaaDB.query('idearium_spec_chunks').filter(r => r.specUuid === big.uuid);
    assert.strictEqual(rows.length, 369, 'every chunk is still mirrored');
    assert.ok(rows.every(r => !('content' in r)), 'a mirror row still carries content');
    assert.ok(rows.every(r => r.contentBytes > 0), 'contentBytes should say how much lives on disk');
    const mrow = jaaDB.query('idearium_spec_manifests').find(r => r.uuid === big.uuid);
    assert.ok(mrow && !Array.isArray(mrow.chunks), 'the manifest row must not embed its chunks');
    assert.strictEqual(mrow.chunkCount, 369);
    // and disk is still the source of truth
    assert.ok(se.loadSpec(big.uuid).chunks.every(c => c.content));
  });

  await test('T-005', 'listSpecs() serves a cached summary until the manifest file changes, then refreshes', async () => {
    const before = se.listSpecs().find(s => s.uuid === big.uuid);
    const again  = se.listSpecs().find(s => s.uuid === big.uuid);
    assert.strictEqual(before, again, 'unchanged manifest should reuse the cached summary object');
    const m = se.loadSpec(big.uuid); m.name = 'stab-big-renamed'; se.saveSpec(m);
    const after = se.listSpecs().find(s => s.uuid === big.uuid);
    assert.strictEqual(after.name, 'stab-big-renamed');
  });

  await test('T-006', 'the build queue never triggers an AI build for an ingested project or an interrupted import', async () => {
    _buildingSpecs.clear();
    // the normal spec is created FIRST so it is the OLDEST — the poller walks newest first,
    // so without the skip the two specs below would be reached (and, with one trigger in flight
    // at a time, would starve it). That ordering is what makes this test able to fail.
    const normal = se.createSpec({ name: 'stab-normal', type: 'component' });
    await new Promise(r => setTimeout(r, 15));
    // an ingested project with one file still pending (what a cut-short import looks like)
    const cut = se.ingestFilesAsSpec({ name: 'stab-cut', files: mkFiles(3) });
    const m = se.loadSpec(cut.uuid); m.chunks[2].status = 'pending'; m.doneChunks = 2; m.status = 'building'; se.saveSpec(m);
    await new Promise(r => setTimeout(r, 15));
    // an import that died before its final save
    const dead = se.ingestFilesAsSpec({ name: 'stab-dead', files: mkFiles(2) });
    const d = se.loadSpec(dead.uuid); d.ingesting = true; d.chunks[1].status = 'pending'; d.doneChunks = 1; d.status = 'building'; se.saveSpec(d);

    const hits = new Set();
    const server = http.createServer((req, res) => { hits.add(req.url.split('/')[4]); res.end('{"ok":true,"done":true}'); });
    await new Promise(r => server.listen(19831, '127.0.0.1', r));
    const timer = _startBuildQueuePoller(19831);
    await new Promise(r => setTimeout(r, 400));
    clearInterval(timer);
    await new Promise(r => server.close(r));
    assert.ok(hits.has(normal.uuid), 'a normal pending spec must still be built');
    assert.ok(!hits.has(cut.uuid),  'an ingested project must not be sent to an agent');
    assert.ok(!hits.has(dead.uuid), 'an interrupted import must not be sent to an agent');
  });

  await test('T-007', 'a spec with no repo (the shape a crashed import leaves) is adopted into a repo once, and only once', async () => {
    const orphan = se.ingestFilesAsSpec({ name: 'stab-orphan', files: mkFiles(4) });   // spec-engine only — no RepoLayer, so no repo record
    const r1 = await _reconcileSpecRepos();
    const got = r1.adopted.find(a => a.specUuid === orphan.uuid);
    assert.ok(got && got.repoUuid, `orphan not adopted: ${JSON.stringify(r1)}`);
    const r2 = await _reconcileSpecRepos();
    assert.ok(!r2.adopted.find(a => a.specUuid === orphan.uuid), 'a second reconcile must not adopt it again');
    assert.strictEqual(r2.failed.length, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
