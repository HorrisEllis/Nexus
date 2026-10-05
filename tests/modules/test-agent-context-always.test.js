'use strict';
/**
 * tests/modules/test-agent-context-always.test.js — SB32, SB33, SB34 (docs/2026-10-05-build-from-the-spec-phasemap.spec).
 * James: "agents always need context, not optional." · "like context isnt optional its vital" ·
 *        "also running the pipeline the agent should be able to do." ·
 *        "im saying the graphs, chunking, the code tab, all of it, actually look at the context retrival."
 *
 * On a repo indexed by the real import pipeline (chunks, cards, the Code tab's search index, the graph):
 *   CA-01  a question naming no file gets the chunk whose CODE answers it (the Code tab's search), with its card
 *          (what it uses, what uses it), its code and the graph around it (each edge once) — in the prompt the model is sent
 *   CA-02  a question that matches nothing gets the overview from the index — in the prompt, never nothing
 *   CA-03  a persona written before indexing is re-grounded on the live index
 *   CA-04  the agent's chunk tool runs the pipeline (POST /api/repos/:uuid/reindex); an unindexed persona says to
 *   CA-05  memory (context-atlas) is searched with its block switched off, and not twice with it on
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

const FILES = {
  'src/upload.js': "const { backoff } = require('./retry.js');\n\n/** send a file, retrying when the network drops */\nfunction sendFile(file) {\n  return backoff(() => post(file), 3);\n}\nfunction post(file) { return file; }\nmodule.exports = { sendFile };\n",
  'src/retry.js': "/** wait longer after each failed attempt */\nfunction backoff(fn, attempts) {\n  for (let i = 0; i < attempts; i++) { try { return fn(); } catch (_) {} }\n  throw new Error('gave up');\n}\nmodule.exports = { backoff };\n",
  'src/ui.js': "function render() { return '<div/>'; }\nmodule.exports = { render };\n",
  'README.md': '# fixture\nA small project that uploads files.\n',
};

(async () => {
  const server = http.createServer((req, res) => { server.last = `${req.method} ${req.url}`; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ pipeline: { state: 'READY', files: { count: 3 }, chunks: { count: 4 } } })); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.IDEARIUM_PORT = String(server.address().port);

  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const lazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-always-'));
  for (const [f, t] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
  const repo = { uuid: `ctx-${Date.now()}`, name: 'fixture', compartmentId: 'c-1', files: Object.keys(FILES).map(p => ({ path: p })) };
  const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  quiet(() => pipeline.runImportPipeline(repo, dir, { runtimeProof: false }));
  await workQueue.get(lazy.QUEUE_NAME).drain();

  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
  const prompt = (c) => RA.compose({ hat: { personaPrompt: 'p' }, message: 'q', context: { kind: c.kind, block: c.block }, repoUuid: repo.uuid });

  await test('CA-01', 'no file named → the chunk whose code answers it, its card and code, in the prompt', () => {
    const c = RA.contextFor({ repo, repoDir: dir, message: 'where do we retry when the network drops' });
    assert.strictEqual(c.kind, 'search', JSON.stringify(c).slice(0, 400));
    assert.ok(c.chunks.some(x => x.file === 'src/upload.js'), JSON.stringify(c.chunks));
    assert.match(c.block, /The top chunk's code/);
    assert.match(c.block, /uses: backoff \(src\/retry\.js\)|used by:/, 'the card: what it uses or what uses it');
    assert.match(c.reason, /code search/);
    assert.ok(prompt(c).includes(c.block), 'the context is in what the model is sent');
    // the graph reads each edge once, the right way round (the inverse edge used to make it both ways)
    assert.match(c.block, /The graph around src\/upload\.js:\nrequires: src\/retry\.js/);
    assert.doesNotMatch(c.block, /The graph around src\/upload\.js:[\s\S]*required by: src\/retry\.js/);
  });

  await test('CA-02', 'nothing matches → the overview from the index, in the prompt', () => {
    const c = RA.contextFor({ repo, repoDir: dir, message: 'zzqx' });
    assert.strictEqual(c.kind, 'overview');
    assert.match(c.block, /files: \d+ · chunks: \d+/);
    assert.match(c.block, /folders: .*src\//);
    assert.ok(prompt(c).includes(c.block));
  });

  await test('CA-03', 'a persona from before indexing is re-grounded on the live index', () => {
    fs.writeFileSync(path.join(dir, 'atlas.json'), JSON.stringify({ fileCount: 4 }));
    const stale = { name: 'h', personaPrompt: RH.buildPersona({ repoName: 'fixture', repoUuid: repo.uuid, compartmentId: 'c-1', index: RH.readRepoIndex(null) }) };
    assert.match(stale.personaPrompt, /has NOT been indexed yet/);
    const h = RA._grounded(RH, stale, repo, dir);
    assert.doesNotMatch(h.personaPrompt, /has NOT been indexed yet/);
    assert.match(h.personaPrompt, /- files: 4/);
    assert.strictEqual(RA._grounded(RH, h, repo, dir), h, 'a grounded persona is left as it is');
  });

  await test('CA-04', 'the agent runs the pipeline; an unindexed persona says to', async () => {
    const tool = require(path.join(ROOT, 'lib/agent-tools/tools/idearium/repo-chunks.js'));
    const r = await tool.execute({ repoUuid: repo.uuid, action: 'reindex' });
    assert.strictEqual(server.last, `POST /api/repos/${repo.uuid}/reindex`);
    assert.deepStrictEqual(r, { ok: true, state: 'READY', files: 3, chunks: 4, error: null });
    const p = RH.buildPersona({ repoName: 'x', repoUuid: 'u-1', compartmentId: 'c', index: RH.readRepoIndex(null) });
    assert.match(p, /idearium\.repo_chunks\.tool \{"repoUuid":"u-1","action":"reindex"\}/);
  });

  await test('CA-05', 'memory is searched with its block off, and not twice with it on', async () => {
    const A = require(path.join(ROOT, 'lib/context-atlas.js'));
    const real = A.block; let calls = 0;
    A.block = async () => { calls++; return { text: '- [fixes 1] the upload retry was raised to 3', hits: 1 }; };
    try {
      const base = { kind: 'search', block: 'chunks…', chars: 7 };
      const off = await RA._withMemory(base, { repo, repoDir: dir, message: 'retry', blocks: [{ id: 'context-atlas', enabled: false }] });
      assert.match(off.block, /Memory and graphs \(context-atlas\):\n- \[fixes 1\] the upload retry/);
      assert.strictEqual(off.memoryHits, 1);
      const on = await RA._withMemory(base, { repo, repoDir: dir, message: 'retry', blocks: [{ id: 'context-atlas', enabled: true }] });
      assert.strictEqual(on, base, 'on: it is in {atlas} already');
      assert.strictEqual(calls, 1);
    } finally { A.block = real; }
  });

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
