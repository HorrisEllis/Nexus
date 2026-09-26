'use strict';
// Real, isolated test for idearium's build-queue poller. James: "it
// needs to start the queue each boot. So the chunks in the repo in
// idearium build."
//
// §ISOLATED — same real IDEARIUM_DATA_DIR/JAA_DATA_DIR convention this
// session already established.
const fs = require('fs');
const os = require('os');
const path = require('path');
const _isolatedData = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-build-poller-'));
const _isolatedJaa = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-build-poller-jaa-'));
process.env.IDEARIUM_DATA_DIR = _isolatedData;
process.env.JAA_DATA_DIR = _isolatedJaa;
process.on('exit', () => {
  try { fs.rmSync(_isolatedData, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_isolatedJaa, { recursive: true, force: true }); } catch (_) {}
});

const assert = require('assert');
const http = require('http');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function mockServer(port, handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
function closeServer(server) {
  return new Promise(resolve => server.close(() => setTimeout(resolve, 50)));
}

async function main() {
  const se = await import('../../idearium/spec-engine/index.js');
  const { _startBuildQueuePoller, _buildingSpecs } = await import('../../idearium/api/index.js');
  const TEST_PORT = 19801;

  await test('T-001', 'a real spec with genuinely pending chunks triggers a real POST to /api/spec-engine/specs/:uuid/build', async () => {
    const manifest = se.createSpec({ name: 'poller-test-1', type: 'component' });
    let received = null;
    const server = await mockServer(TEST_PORT, (req, res) => {
      received = { method: req.method, url: req.url };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, done: true }));
    });
    const timer = _startBuildQueuePoller(TEST_PORT);
    await new Promise(r => setTimeout(r, 300)); // real, immediate first tick fires synchronously-ish — give it a moment
    clearInterval(timer);
    assert.ok(received, 'expected a real POST request for a spec with pending chunks');
    assert.strictEqual(received.method, 'POST');
    assert.strictEqual(received.url, `/api/spec-engine/specs/${manifest.uuid}/build`);
    await closeServer(server);
  });

  await test('T-002', 'the in-flight guard prevents a second build trigger for the same spec while one is still running', async () => {
    _buildingSpecs.clear();
    const manifest = se.createSpec({ name: 'poller-test-2', type: 'component' });
    const hitsByUuid = {};
    let holdResponse = null;
    const server = await mockServer(TEST_PORT + 1, (req, res) => {
      const uuid = req.url.split('/')[4];
      hitsByUuid[uuid] = (hitsByUuid[uuid] || 0) + 1;
      if (uuid === manifest.uuid) holdResponse = res; // deliberately never respond for THIS spec — simulates a real, still-building chunk
      else res.end('{"ok":true,"done":true}'); // any other real, leftover pending spec (e.g. from an earlier test sharing this isolated data dir) — real behavior, not what this test is about
    });
    const timer = _startBuildQueuePoller(TEST_PORT + 1);
    await new Promise(r => setTimeout(r, 200));
    clearInterval(timer);
    assert.strictEqual(hitsByUuid[manifest.uuid], 1, `expected exactly one real trigger for THIS spec while its previous build is still in flight, got: ${JSON.stringify(hitsByUuid)}`);
    assert.ok(_buildingSpecs.has(manifest.uuid), 'the in-flight guard must actually track this spec as building');
    if (holdResponse) holdResponse.end('{"ok":true}');
    await closeServer(server);
  });

  // §NEW 2026-09-11 — James, live: "the problem is idearium doesn't
  // retry, if nexus restarts it wont try to build the chunks again."
  // Real, direct reproduction: a chunk left BUILDING by a simulated
  // "process death" (no completeChunk/failChunk ever called — exactly
  // what a real crash mid-dispatch looks like), then a fresh poller
  // start, matching a real restart. Before the fix, this chunk stays
  // BUILDING forever and the poller never touches it again.
  await test('T-003', 'a chunk orphaned in BUILDING state (simulated process death mid-dispatch) is recovered and retried on the next real poller tick, not left stuck forever', async () => {
    _buildingSpecs.clear();
    const manifest = se.createSpec({ name: 'poller-test-3-orphan-recovery', type: 'component' });
    const chunk = se.nextPendingChunk(manifest.uuid);
    assert.ok(chunk, 'a freshly created spec must have at least one real pending chunk to orphan');

    // §CORRECTED — a real spec here has 10 chunks; marking only ONE
    // BUILDING leaves 9 genuinely pending, so nextPendingChunk() would
    // correctly (and unhelpfully, for this test) just find one of
    // those instead, proving nothing about the orphaned one. Marking
    // every chunk BUILDING reproduces the real, total-stuck case this
    // fix exists for — no other pending work to fall through to.
    const all = se.loadSpec(manifest.uuid).chunks;
    for (const c of all) se.markChunkBuilding(manifest.uuid, c.uuid, { agent: 'claude' });
    const stuck = se.loadSpec(manifest.uuid).chunks.find(c => c.uuid === chunk.uuid);
    assert.strictEqual(stuck.status, 'building', 'setup check — the chunk must genuinely be BUILDING before recovery runs, or this test proves nothing');
    assert.strictEqual(se.nextPendingChunk(manifest.uuid), null, 'setup check — confirming the real bug exists first: with every chunk BUILDING, nextPendingChunk() finds nothing, proving the spec is genuinely, totally stuck before any fix runs');

    let received = null;
    const server = await mockServer(TEST_PORT + 2, (req, res) => {
      // §CORRECTED — this poller sees every spec in the shared temp dir
      // (including T-001/T-002's own, still-pending-by-design leftovers),
      // not just this test's. Only recording a hit for THIS test's own
      // spec is what actually proves the orphaned chunk specifically got
      // recovered and retried, not just that the poller ran at all.
      if (req.url === `/api/spec-engine/specs/${manifest.uuid}/build`) received = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, done: true }));
    });

    // A fresh _startBuildQueuePoller() call IS the real restart case —
    // this is the exact function idearium/api/index.js's own boot path
    // calls every time the process comes up.
    const timer = _startBuildQueuePoller(TEST_PORT + 2);
    await new Promise(r => setTimeout(r, 300));
    clearInterval(timer);

    const recoveredChunk = se.loadSpec(manifest.uuid).chunks.find(c => c.uuid === chunk.uuid);
    assert.strictEqual(recoveredChunk.status, 'pending', `expected the orphaned chunk to be reset to pending by recovery, got: ${recoveredChunk.status}`);
    assert.strictEqual(recoveredChunk.jobId, null, 'a recovered chunk must not still claim a stale in-flight jobId');
    assert.ok(received, 'expected the real poller to actually dispatch a build request for the now-recovered chunk in the same tick cycle, not just reset its status and stop');
    assert.strictEqual(received, `/api/spec-engine/specs/${manifest.uuid}/build`);
    await closeServer(server);
  });

  await test('T-004', 'recoverOrphanedChunks() only touches BUILDING chunks — a genuinely COMPLETE chunk is left alone', async () => {
    const manifest = se.createSpec({ name: 'poller-test-4-complete-untouched', type: 'component' });
    const chunk = se.nextPendingChunk(manifest.uuid);
    se.markChunkBuilding(manifest.uuid, chunk.uuid, { agent: 'claude' });
    se.completeChunk(manifest.uuid, chunk.uuid, 'real completed content, not a stub');
    const before = se.loadSpec(manifest.uuid).chunks.find(c => c.uuid === chunk.uuid);
    assert.strictEqual(before.status, 'complete', 'setup check');

    const recovered = se.recoverOrphanedChunks();
    assert.ok(!recovered.some(r => r.chunkUuid === chunk.uuid), 'a genuinely complete chunk must never be touched by recovery');
    const after = se.loadSpec(manifest.uuid).chunks.find(c => c.uuid === chunk.uuid);
    assert.strictEqual(after.status, 'complete', 'recovery must not have changed a real, completed chunk\'s status');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
