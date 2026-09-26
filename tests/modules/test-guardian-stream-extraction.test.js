'use strict';
/**
 * tests/modules/test-guardian-stream-extraction.test.js
 *
 * §FIX 2026-09-22 — James: "how does guardian or clearglass get the
 * actual code file to the right end point for build or expanding
 * repos?"
 *
 * Traced end to end: idearium/spec-engine/warp-build-dispatch.js's own
 * WARP-cascade poll already runs a recovered agent reply through
 * lib/extract-code.js's extractCode() before calling completeChunk() —
 * built 2026-09-19 for exactly this reason. idearium/lib/guardian-
 * stream.cjs — the SEPARATE recovery path for a chunk that completes
 * after idearium restarted or reconnected mid-dispatch (both its live
 * SSE push, _handleGuardianEvent, and its boot-time sweep,
 * reconcileInFlightChunks) — called completeChunk() directly with
 * guardian's raw job text, no extraction, ever. A code chunk recovered
 * through either path would get whatever prose+fences the agent
 * actually sent written straight into the real repo file via
 * materialize(). guardian-stream.cjs had zero test coverage before this
 * — checked directly, no tests/modules/*guardian-stream* file existed.
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

// The module under test only exports reconcileInFlightChunks/
// connectGuardianStream — _prepareChunkContent, _handleGuardianEvent,
// _findInFlightChunks are internal. Reached the real, honest way: by
// exercising the two exported functions against a fake `se` (spec-
// engine) and a real local HTTP server standing in for guardian's own
// /jobs endpoint — not by reaching into the module's private scope.
function fakeSpecEngine(chunks) {
  const calls = { completeChunk: [], failChunk: [] };
  const manifest = { uuid: 'spec-1', chunks };
  return {
    listSpecs: () => [{ uuid: 'spec-1' }],
    loadSpec: () => manifest,
    completeChunk: (specUuid, chunkUuid, content) => { calls.completeChunk.push({ specUuid, chunkUuid, content }); },
    failChunk: (specUuid, chunkUuid, reason) => { calls.failChunk.push({ specUuid, chunkUuid, reason }); },
    calls,
  };
}

function fakeGuardianJobsServer(jobs) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/jobs')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs }));
    } else { res.writeHead(404); res.end(); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

async function main() {
  const { reconcileInFlightChunks } = require(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'));

  await test('a code chunk (real extension, one clean fenced block) is properly extracted before completeChunk', async () => {
    const { server, port } = await fakeGuardianJobsServer([
      { id: 'job-1', status: 'complete', responseText: 'Here you go:\n\n```javascript\nfunction add(a,b){return a+b;}\n```\n\nLet me know if you need anything else!' },
    ]);
    process.env.GUARDIAN_PORT = String(port);
    delete require.cache[require.resolve(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'))];
    const { reconcileInFlightChunks: reconcile } = require(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'));
    const se = fakeSpecEngine([{ uuid: 'c1', sectionId: 'add-fn', status: 'building', jobId: 'job-1', realPath: 'lib/add.js' }]);
    await reconcile(se);
    server.close();
    assert.strictEqual(se.calls.completeChunk.length, 1, 'completeChunk should have been called once');
    assert.strictEqual(se.calls.completeChunk[0].content, 'function add(a,b){return a+b;}',
      'the prose and fence markers must NOT be in what gets written to the real file');
    assert.strictEqual(se.calls.failChunk.length, 0);
  });

  await test('a code chunk whose reply has NO fenced block fails loudly instead of writing prose into the real file', async () => {
    const { server, port } = await fakeGuardianJobsServer([
      { id: 'job-2', status: 'complete', responseText: 'I looked at this and I think the function should just add the two numbers together.' },
    ]);
    process.env.GUARDIAN_PORT = String(port);
    delete require.cache[require.resolve(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'))];
    const { reconcileInFlightChunks: reconcile } = require(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'));
    const se = fakeSpecEngine([{ uuid: 'c2', sectionId: 'add-fn', status: 'building', jobId: 'job-2', realPath: 'lib/add.js' }]);
    await reconcile(se);
    server.close();
    assert.strictEqual(se.calls.completeChunk.length, 0, 'must NOT complete with unusable prose as the file content');
    assert.strictEqual(se.calls.failChunk.length, 1);
    assert.ok(/wasn't usable code/.test(se.calls.failChunk[0].reason));
  });

  await test('a real document/prose section (no realPath) is NEVER run through extraction — the 9 legitimately-prose section types stay unaffected', async () => {
    const { server, port } = await fakeGuardianJobsServer([
      { id: 'job-3', status: 'complete', responseText: 'This system exists to answer real user questions accurately and helpfully, with no fenced code anywhere in this reply.' },
    ]);
    process.env.GUARDIAN_PORT = String(port);
    delete require.cache[require.resolve(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'))];
    const { reconcileInFlightChunks: reconcile } = require(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'));
    const se = fakeSpecEngine([{ uuid: 'c3', sectionId: 'purpose', status: 'building', jobId: 'job-3', realPath: null }]);
    await reconcile(se);
    server.close();
    assert.strictEqual(se.calls.completeChunk.length, 1);
    assert.ok(se.calls.completeChunk[0].content.includes('answer real user questions'),
      'a prose section\'s real text must pass through completely unchanged, not be rejected for "no fenced code"');
    assert.strictEqual(se.calls.failChunk.length, 0);
  });

  await test('a non-code realPath extension (e.g. .md) is also left unextracted — expectCode matches idearium/api/index.js\'s own real CODE_EXTENSIONS set, not every realPath', async () => {
    const { server, port } = await fakeGuardianJobsServer([
      { id: 'job-4', status: 'complete', responseText: 'Real README prose, no fences, written directly as markdown content.' },
    ]);
    process.env.GUARDIAN_PORT = String(port);
    delete require.cache[require.resolve(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'))];
    const { reconcileInFlightChunks: reconcile } = require(path.join(ROOT, 'idearium', 'lib', 'guardian-stream.cjs'));
    const se = fakeSpecEngine([{ uuid: 'c4', sectionId: 'readme', status: 'building', jobId: 'job-4', realPath: 'README.md' }]);
    await reconcile(se);
    server.close();
    assert.strictEqual(se.calls.completeChunk.length, 1);
    assert.ok(se.calls.completeChunk[0].content.includes('Real README prose'));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(e => { console.error('  ! crashed:', e.stack); process.exit(1); });
