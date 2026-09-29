'use strict';
// tests/modules/test-ollama-activity.test.js — 0.39.266.
// James: "don't even know what ollama is doing?" Measured: num_ctx set nowhere (a long prompt is cut from the
// front by Ollama's default window); the bridge logged no jobs; ~8 modules called :11434 directly; the
// 'nexus-live' channel grew every 5 s and was never swept.
//
//   OA-001  num_ctx is sized to the prompt, floored and capped, and says when it cannot fit
//   OA-002  the bridge's generate sends num_ctx and records the call (caller, model, size, window, ms)
//   OA-003  a failed call is recorded as failed
//   OA-004  GET /api/activity on the bridge's routes returns the log
//   OA-005  a channel's context lines are capped; nothing else in its history is touched
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-test-'));
process.env.NEXUS_DATA_ROOT = TMP;
process.env.OLLAMA_CHANNEL_CONTEXT_CAP = '5';
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

async function main() {
  // a fake Ollama: records what it was sent
  const seen = [];
  let failNext = false;
  const fake = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      seen.push({ path: req.url, body: b ? JSON.parse(b) : null });
      if (failNext) { failNext = false; res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'model not found' })); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response: 'ok', done: true }));
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_HOST = `http://127.0.0.1:${fake.address().port}`;
  // the bridge reads its host from config at require time
  const OA = require('../../lib/ollama-activity.js');
  const client = require('../../ollama/lib/ollama-client.js');

  await test('OA-001', 'num_ctx is sized to the prompt, floored and capped', () => {
    assert.strictEqual(OA.numCtxFor(100, 256).numCtx, OA.MIN, 'a short prompt gets the floor');
    const mid = OA.numCtxFor(20000, 2048);          // ~5.7k tokens + answer
    assert.ok(mid.numCtx >= mid.needed && mid.numCtx > OA.MIN && mid.numCtx <= OA.MAX && mid.fits, JSON.stringify(mid));
    const huge = OA.numCtxFor(200000, 2048);
    assert.strictEqual(huge.numCtx, OA.MAX); assert.strictEqual(huge.fits, false);
    assert.match(OA.withNumCtx({}, 200000).warning, /drop the start/);
    assert.strictEqual(OA.withNumCtx({ num_ctx: 999 }, 200000).options.num_ctx, 999, 'a caller\'s own num_ctx is kept');
  });

  const host = require('../../ollama/config.js').OLLAMA_HOST;
  await test('OA-002', 'the bridge\'s generate sends num_ctx and records the call', async () => {
    assert.ok(String(host).includes(String(fake.address().port)), `bridge config points at the fake (${host})`);
    const out = await client.callOllamaRaw('qwen-test', 'x'.repeat(20000), 512, 5000, 'test caller');
    assert.strictEqual(out, 'ok');
    const sent = seen[seen.length - 1].body;
    assert.ok(sent.options.num_ctx > OA.MIN, `num_ctx ${sent.options.num_ctx}`);
    assert.strictEqual(sent.options.num_predict, 512);
    const last = OA.tail(1)[0];
    assert.strictEqual(last.caller, 'test caller'); assert.strictEqual(last.model, 'qwen-test');
    assert.strictEqual(last.promptChars, 20000); assert.strictEqual(last.numCtx, sent.options.num_ctx); assert.strictEqual(last.ok, true);
  });

  await test('OA-003', 'a failed call is recorded as failed', async () => {
    failNext = true;
    await assert.rejects(client.callOllamaRaw('missing', 'hi', 16, 5000, 'test caller'), /model not found/);
    const last = OA.tail(1)[0];
    assert.strictEqual(last.ok, false); assert.match(last.error, /model not found/);
  });

  await test('OA-004', 'GET /api/activity returns the log', async () => {
    const sys = require('../../ollama/routes/system.js');
    let status = null, body = null;
    const res = { writeHead: (s) => { status = s; }, setHeader() {}, end: (b) => { body = JSON.parse(b); } };
    const handled = await sys.handle({ url: '/api/activity?n=5', method: 'GET' }, res, { method: 'GET', pathname: '/api/activity' });
    assert.strictEqual(handled, true); assert.strictEqual(status, 200);
    assert.ok(body.activity.length >= 2); assert.deepStrictEqual(Object.keys(body.numCtx), ['min', 'max']);
  });

  await test('OA-005', 'a channel\'s context lines are capped; other turns kept', async () => {
    const stream = require('../../ollama/routes/stream.js');
    const { state } = require('../../ollama/lib/state.js');
    state.channels.set('nexus-live', { history: [{ role: 'user', content: 'keep me', ts: 1 }], lastActivity: Date.now() });
    for (let i = 0; i < 12; i++) {
      const req = new (require('events'))(); req.method = 'PUT'; req.url = '/api/stream/nexus-live/context';
      const res = { writeHead() {}, setHeader() {}, end() {} };
      const p = stream.handle(req, res, { method: 'PUT', pathname: '/api/stream/nexus-live/context' });
      req.emit('data', Buffer.from(JSON.stringify({ context: `line ${i}` }))); req.emit('end');
      await p;
    }
    const h = state.channels.get('nexus-live').history;
    assert.strictEqual(h.filter(x => x.role === 'context').length, 5);
    assert.deepStrictEqual(h.filter(x => x.role === 'context').map(x => x.content), ['line 7', 'line 8', 'line 9', 'line 10', 'line 11']);
    assert.ok(h.some(x => x.role === 'user' && x.content === 'keep me'));
  });

  fake.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
