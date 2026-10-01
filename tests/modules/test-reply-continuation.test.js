'use strict';
// tests/modules/test-reply-continuation.test.js — 0.39.289.
// James: "ollama has been known to cut off blocks … if it gets cut off, what about injecting the cut off part into the
// agent, and having it finish it." And his phase build: "ollama · 46s · blocked: empty — 0 non-blank character(s)".
//
//   RC-01  looksCut: a token-limit stop, an open fence, a mid-statement end are cut; a finished reply, an empty one are not
//   RC-02  stitch drops the repeated overlap and a re-opened fence
//   RC-03  complete() continues until whole, and stops when a continuation adds nothing
//   RC-04  the bridge: a reply stopped at num_predict inside a code block is continued and stitched (a fake Ollama)
//   RC-05  the bridge: thinking and no answer → asked again with think:false
//   RC-06  the bridge: the timeout is IDLE — a slow but steady stream passes the old 45 s-style limit, a silent one fails
//   RC-07  chunk dispatch: a cut chunk reply is finished by the same agent before the detector judges it
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

const RC = require('../../lib/reply-continuation.js');

// a fake Ollama: `script(body, n)` returns an array of [delayMs, lineObject] to stream for the n-th request
function fakeOllama(script) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', async () => {
      const body = JSON.parse(b); seen.push(body);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      for (const [ms, o] of script(body, seen.length)) {
        if (ms) await new Promise(r => setTimeout(r, ms));
        if (o === null) return;   // go silent, never end
        res.write(JSON.stringify(o) + '\n');
      }
      res.end();
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port, seen })));
}

async function main() {
  await test('RC-01', 'looksCut', () => {
    assert.strictEqual(RC.looksCut('anything at all here, long enough to judge', { doneReason: 'length' }).cut, true);
    assert.strictEqual(RC.looksCut('Here is the file:\n```js\nfunction a() {\n  return 1;\n').cut, true, 'open fence');
    assert.strictEqual(RC.looksCut('The module reads the config and then returns the value of').cut, true, 'mid-statement');
    assert.strictEqual(RC.looksCut('Here is the file:\n```js\nfunction a() { return 1; }\n```').cut, false);
    assert.strictEqual(RC.looksCut('The module reads the config and returns it.').cut, false);
    assert.strictEqual(RC.looksCut('').cut, false, 'empty is not cut — nothing to continue');
  });

  await test('RC-02', 'stitch drops the repeated overlap and a re-opened fence', () => {
    assert.strictEqual(RC.stitch('const a = 1;\nconst b = ', 'const b = 2;\n'), 'const a = 1;\nconst b = 2;\n');
    assert.strictEqual(RC.stitch('```js\nline1();\nline2', 'line2();\n```'), '```js\nline1();\nline2();\n```');
    assert.strictEqual(RC.stitch('```js\nfoo();\n', '```js\nbar();\n```'), '```js\nfoo();\nbar();\n```', 'the duplicate opener is dropped');
    assert.match(RC.continuePrompt('write x', '```js\nfoo('), /inside an open code block/);
  });

  await test('RC-03', 'complete() continues until whole; stops when nothing is added', async () => {
    const parts = ['() {\n  return 1;\n}\n```'];
    const out = await RC.complete(async () => ({ text: parts.shift() || '' }), 'write f', { first: { text: '```js\nfunction f' } });
    assert.strictEqual(out.text, '```js\nfunction f() {\n  return 1;\n}\n```');
    assert.strictEqual(out.rounds, 1); assert.strictEqual(out.cut, false);
    const stuck = await RC.complete(async () => ({ text: '' }), 'p', { first: { text: '```js\nfoo(' } });
    assert.strictEqual(stuck.cut, true); assert.match(stuck.reasons.join(' '), /empty/);
  });

  // the bridge reads OLLAMA_HOST at require time
  const env = (port) => { process.env.OLLAMA_HOST = `127.0.0.1:${port}`; delete require.cache[require.resolve('../../ollama/config.js')]; delete require.cache[require.resolve('../../ollama/lib/ollama-client.js')]; return require('../../ollama/lib/ollama-client.js'); };

  await test('RC-04', 'the bridge continues a reply stopped at num_predict and stitches it', async () => {
    const f = await fakeOllama((body, n) => n === 1
      ? [[0, { response: '```js\nfunction add(a, b) {\n' }], [0, { response: '  return a +' }], [0, { done: true, done_reason: 'length' }]]
      : [[0, { response: '  return a + b;\n}\n```' }], [0, { done: true, done_reason: 'stop' }]]);
    try {
      const C = env(f.port);
      const text = await C.callOllamaRaw('m', 'write add', 100, 2000, 'test');
      assert.strictEqual(text, '```js\nfunction add(a, b) {\n  return a + b;\n}\n```');
      assert.strictEqual(f.seen.length, 2);
      assert.match(f.seen[1].prompt, /cut off/); assert.match(f.seen[1].prompt, /return a \+$/m);
      assert.strictEqual(f.seen[0].stream, true);
    } finally { f.srv.close(); }
  });

  await test('RC-05', 'thinking and no answer → asked again with think:false', async () => {
    const f = await fakeOllama((body, n) => n === 1
      ? [[0, { thinking: 'let me think about this for a long while' }], [0, { done: true, done_reason: 'length' }]]
      : [[0, { response: 'module.exports = 1;' }], [0, { done: true, done_reason: 'stop' }]]);
    try {
      const C = env(f.port);
      const text = await C.callOllamaRaw('m', 'p', 100, 2000, 'test');
      assert.strictEqual(text, 'module.exports = 1;');
      assert.strictEqual(f.seen[1].think, false);
      assert.ok(!('think' in f.seen[0]), 'think is only sent to a model that showed thinking');
    } finally { f.srv.close(); }
  });

  await test('RC-06', 'the timeout is idle, not total', async () => {
    const steady = await fakeOllama(() => [...Array(6)].map((_, i) => [150, { response: `t${i} ` }]).concat([[0, { done: true, done_reason: 'stop' }]]));
    try { const C = env(steady.port); assert.strictEqual((await C.callOllamaRaw('m', 'p', 100, 400, 'test')).trim(), 't0 t1 t2 t3 t4 t5'); }
    finally { steady.srv.close(); }
    const silent = await fakeOllama(() => [[0, { response: 'start ' }], [0, null]]);
    try { const C = env(silent.port); await assert.rejects(C.callOllamaRaw('m', 'p', 100, 300, 'test'), /idle timeout/); }
    finally { silent.srv.closeAllConnections && silent.srv.closeAllConnections(); silent.srv.close(); }
  });

  await test('RC-07', 'chunk dispatch: a cut reply is finished by the same agent before the detector judges it', async () => {
    const CD = await import(pathToFileURL(path.join(__dirname, '../../idearium/spec-engine/chunk-dispatch.js')).href);
    const body = 'export function total(items) {\n  let sum = 0;\n  for (const it of items) sum += it.price * it.qty;\n';
    const prompts = [];
    const dispatchFn = async (p) => {
      prompts.push(p);
      if (prompts.length === 1) return { ok: true, text: 'Here is the module.\n```js\n' + body, agent: 'stub' };
      return { ok: true, text: '  return sum;\n}\n```\n' + 'The function walks the items once and adds price times quantity for each, so the total is exact for integer prices and stable for floats within the usual rounding. '.repeat(4).trim(), agent: 'stub' };
    };
    const r = await CD.dispatchChunkWithVerification('Write src/total.js: export total(items) summing price*qty.', { chunkIdx: 0, sectionTitle: 'total' }, dispatchFn, { preferAgent: 'stub', attemptsPerHop: 2 });
    assert.ok(prompts.length >= 2, 'a continuation was asked');
    assert.match(prompts[1], /CONTINUE FROM HERE/);
    assert.ok(r.ok, `the stitched whole passes the detector: ${String(r.error || '').slice(0, 200)}`);
    assert.match(r.text, /return sum;\n}\n```/);
    assert.strictEqual(r.continued && r.continued.rounds, 1);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
