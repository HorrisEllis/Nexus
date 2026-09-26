'use strict';
/**
 * tests/modules/test-repo-context.js — dispatch-time retrieval for the compartment agent
 * (lib/repo-context.js, wired into lib/repo-agent.js dispatch).
 * Real repo directories through the real import pipeline; the real hat forge; a stub copilot
 * that RECORDS the prompt, so the assertions are about what actually went over the wire.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rctx-'));
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}

(async () => {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const proofMod = await import(path.join(ROOT, 'idearium/repo/runtime-proof.js'));
  const lazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));

  // stub copilot: records every prompt and /api/agent/switch call
  const seen = { prompts: [], switches: 0 };
  const srv = http.createServer((req, res) => {
    let d = ''; req.on('data', c => { d += c; });
    req.on('end', () => {
      let b = {}; try { b = JSON.parse(d || '{}'); } catch (_) {}
      if (req.url === '/api/agent/switch') seen.switches++;
      if (req.url === '/api/prompt') seen.prompts.push(b.prompt || '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: 'stub answer', model_used: 'stub', confidence: 1, requestId: 'r' }));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RC = require(path.join(ROOT, 'lib/repo-context.js'));
  const NODE_DIR = path.join(ROOT, 'idearium/data/nodes/repository'); const made = [];

  const fn = (name, body, comment) => `${comment ? `// ${comment}\n` : ''}function ${name}(a) {\n  const v = ${body};\n  return v;\n}\n\n`;
  async function makeRepo(name, files) {
    const dir = path.join(TMP, name); made.push(name);
    for (const [rel, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), c); }
    const repo = { uuid: name, name, compartmentId: `cos.test.${name}`, files: Object.keys(files).map(p => ({ path: p })) };
    pipeline.runImportPipeline(repo, dir); await workQueue.get(lazy.QUEUE_NAME).drain();
    return { repo, dir };
  }
  const A = await makeRepo('rctx-a', {
    'src/poller.js': fn('pollQueue', 'a.length + 100', 'drains the work queue on an interval') + fn('flushBuffer', 'a * 3') + 'module.exports = { pollQueue, flushBuffer };\n',
    'src/billing.js': fn('computeInvoice', 'a * 1.2') + fn('applyDiscount', 'a - 5') + 'module.exports = { computeInvoice, applyDiscount };\n',
    'src/noise.js': fn('unrelatedHelper', 'a + 7') + 'module.exports = { unrelatedHelper };\n',
    'tests/poller.test.js': "const p = require('../src/poller.js');\nrequire('assert').strictEqual(p.pollQueue([1, 2]), 102);\n",
  });
  const B = await makeRepo('rctx-b', { 'src/secret.js': fn('otherProjectSecretFn', 'a + 999') + 'module.exports = { otherProjectSecretFn };\n' });

  console.log('\n── retrieval ────────────────────────────────────────────');
  await t('a question that names a function gets that function\'s REAL text, with file, range and symbol', () => {
    const r = RC.retrieve({ repoDir: A.dir, message: 'how does pollQueue work?' });
    assert.ok(r.chunks.length >= 1);
    assert.strictEqual(r.chunks[0].file, 'src/poller.js');
    assert.ok(r.chunks[0].symbols.includes('pollQueue'));
    assert.ok(r.chunks[0].text.includes('a.length + 100'), r.chunks[0].text);
    assert.ok(/\[src\/poller\.js:\d+-\d+ · pollQueue · runtime proof: none recorded\]/.test(r.block), r.block);
  });
  await t('words are matched inside camelCase and snake_case names ("poll queue" finds pollQueue)', () => {
    assert.strictEqual(RC.retrieve({ repoDir: A.dir, message: 'what does the poll queue do' }).chunks[0].file, 'src/poller.js');
    assert.ok(RC.tokens('compute_invoice fooBarBaz').includes('invoice') && RC.tokens('fooBarBaz').includes('bar'));
  });
  await t('a question that names nothing in the code gets NO context and a reason, never invented chunks', () => {
    const r = RC.retrieve({ repoDir: A.dir, message: 'what is the weather like in Portland' });
    // 0.39.257 — with a graph.json the project map is given instead of nothing; still no chunk and no code is invented.
    assert.deepStrictEqual(r.chunks, []); assert.ok(r.block === '' || (/^## This project, from its graph/.test(r.block) && !/```/.test(r.block)), r.block);
    assert.ok(/no chunk matches/.test(r.reason));
    assert.ok(/names nothing searchable/.test(RC.retrieve({ repoDir: A.dir, message: 'is it ok?' }).reason));
  });
  await t('the character budget is HARD: chunk text never exceeds maxChars, and dropped chunks are counted', () => {
    const r = RC.retrieve({ repoDir: A.dir, message: 'pollQueue flushBuffer computeInvoice applyDiscount', maxChars: 200, maxChunks: 10 });
    assert.ok(r.chunks.reduce((n, c) => n + c.text.length, 0) <= 200);
    assert.ok(r.dropped >= 1 && r.chunks.length >= 1);
  });
  await t('maxChunks is respected, and an oversized chunk is cut and says so', () => {
    assert.strictEqual(RC.retrieve({ repoDir: A.dir, message: 'pollQueue flushBuffer computeInvoice applyDiscount', maxChunks: 2 }).chunks.length, 2);
    const r = RC.retrieve({ repoDir: A.dir, message: 'pollQueue', maxCharsPerChunk: 30 });
    assert.ok(/chunk cut for size/.test(r.chunks[0].text));
  });
  await t('an implementation outranks its test unless the question asks about tests', () => {
    assert.strictEqual(RC.retrieve({ repoDir: A.dir, message: 'pollQueue' }).chunks[0].file, 'src/poller.js');
    assert.strictEqual(RC.retrieve({ repoDir: A.dir, message: 'show the test for pollQueue' }).chunks[0].file, 'tests/poller.test.js');
  });
  await t('runtime proof is shown per chunk, and goes STALE when the code changes without a re-proof', () => {
    proofMod.computeRuntimeProof({ repoDir: A.dir });
    assert.ok(/runtime proof: passed/.test(RC.retrieve({ repoDir: A.dir, message: 'pollQueue' }).block));
    fs.writeFileSync(path.join(A.dir, 'src/poller.js'), fs.readFileSync(path.join(A.dir, 'src/poller.js'), 'utf8').replace('a.length + 100', 'a.length + 200'));
    pipeline.runImportPipeline(A.repo, A.dir);
    const r = RC.retrieve({ repoDir: A.dir, message: 'pollQueue' });
    assert.ok(/runtime proof: stale/.test(r.block) || /runtime proof: none recorded/.test(r.block), r.block);
    assert.ok(!/runtime proof: passed/.test(r.block.split('flushBuffer')[0]), 'a proof vouched for code that changed');
  });
  await t('no index, no directory: a reason, not a throw', () => {
    fs.mkdirSync(path.join(TMP, 'bare'), { recursive: true });
    assert.ok(/no chunk index/.test(RC.retrieve({ repoDir: path.join(TMP, 'bare'), message: 'pollQueue' }).reason));
    assert.ok(/no repo directory/.test(RC.retrieve({ repoDir: path.join(TMP, 'nope'), message: 'pollQueue' }).reason));
  });
  await t('a poisoned index that points outside the repo cannot read outside it', () => {
    const d = path.join(TMP, 'poison'); fs.mkdirSync(path.join(d, 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(TMP, 'outside-secret.txt'), 'TOP SECRET secretword\n');
    fs.writeFileSync(path.join(d, 'chunks', 'index.json'), JSON.stringify([{ id: 'x', file: '../outside-secret.txt', range: { start_line: 1, end_line: 1 }, symbols: [], hash: {} }]));
    const r = RC.retrieve({ repoDir: d, message: 'secretword' });
    assert.deepStrictEqual(r.chunks, []); assert.ok(!r.block.includes('TOP SECRET'));
  });

  console.log('\n── in the dispatch: what really goes to the model ───────');
  const before = seen.prompts.length;
  const d1 = await RA.dispatch({ repo: A.repo, repoDir: A.dir, message: 'explain flushBuffer' });
  const prompt1 = seen.prompts[before];
  await t('the outgoing prompt is persona, THEN the matching code, THEN the question', () => {
    assert.strictEqual(d1.ok, true, d1.error);
    const iP = prompt1.indexOf('You are the project agent'), iC = prompt1.indexOf('## Code from this project'), iQ = prompt1.lastIndexOf('explain flushBuffer');
    assert.ok(iP >= 0 && iC > iP && iQ > iC, `${iP} ${iC} ${iQ}`);
    assert.ok(prompt1.includes('a * 3'), 'the real function text is not in the prompt');
  });
  await t('the response and the exchange log say WHICH chunks the agent was given', () => {
    assert.ok(d1.context.chunkIds.length >= 1 && d1.context.files.includes('src/poller.js'));
    assert.deepStrictEqual(RA.history(A.repo.uuid, 1)[0].context.chunkIds, d1.context.chunkIds);
  });
  await t('noContext:true sends the old prompt shape (no code block)', async () => {
    const n = seen.prompts.length; await RA.dispatch({ repo: A.repo, repoDir: A.dir, message: 'explain flushBuffer', noContext: true });
    assert.ok(!seen.prompts[n].includes('## Code from this project'));
  });
  await t('a question that names nothing adds no block and records why', async () => {
    const n = seen.prompts.length; const r = await RA.dispatch({ repo: A.repo, repoDir: A.dir, message: 'hello, how are you today' });
    assert.ok(!seen.prompts[n].includes('## Code from this project')); assert.ok(r.context.reason);
  });
  await t('SCOPE: repo A\'s agent is never handed repo B\'s code, even when asked for it by name', async () => {
    const n = seen.prompts.length; await RA.dispatch({ repo: A.repo, repoDir: A.dir, message: 'explain otherProjectSecretFn' });
    assert.ok(!seen.prompts[n].includes('999') && !seen.prompts[n].includes('otherProjectSecretFn(a)'), 'repo B leaked into repo A\'s prompt');
    const m = seen.prompts.length; await RA.dispatch({ repo: B.repo, repoDir: B.dir, message: 'explain otherProjectSecretFn' });
    assert.ok(seen.prompts[m].includes('a + 999'));
  });
  await t('the retrieval sits INSIDE the size budget: a 3-chunk context stays under maxChars of code', async () => {
    const r = await RA.dispatch({ repo: A.repo, repoDir: A.dir, message: 'pollQueue flushBuffer computeInvoice applyDiscount', contextOptions: { maxChars: 400 } });
    assert.ok(r.context.chars < 400 + 700, `${r.context.chars}`); // text <= 400, plus headers
  });
  await t('nothing was switched: /api/agent/switch has zero calls (the constraint from 0.39.188 still holds)', () => assert.strictEqual(seen.switches, 0));

  srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
  for (const u of made) fs.rmSync(path.join(NODE_DIR, `${u}.repository`), { force: true });
  console.log(`\n${fail ? '✗' : '✓'} repo-context: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
