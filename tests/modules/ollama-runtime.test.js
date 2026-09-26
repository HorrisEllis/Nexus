'use strict';
/**
 * tests/modules/ollama-runtime.test.js — Ollama Runtime Silent-Hang Fix
 * UUID: test-ollama-runtime-v1-0000-4800-0000-000000000001
 *
 * Covers the fix for "ollama isn't working" (James, 2026-06-19): the old
 * streamGenerate() had no statusCode check and no timeout, so the two most
 * likely real-world failure modes — an unpulled/missing model, and a
 * service that just stops responding — produced total silence: no token,
 * no onDone, no onError. The job sat "delivered" forever with nothing to
 * diagnose. Every test here asserts onError actually fires with a useful
 * message for each failure shape, using a real local HTTP server standing
 * in for Ollama (not a mocked http module) so the assertions are against
 * real socket/status-code behaviour.
 */

const assert = require('assert');
const http   = require('http');

let passed = 0, failed = 0;
const _registry = [];
function test(id, desc, fn) { _registry.push({ id, desc, fn }); }

async function runAll() {
  for (const { id, desc, fn } of _registry) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  await new Promise(r => fakeServer.close(r));
  process.stdout.write(`\n  ollama-runtime.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

// ── Fake Ollama server ─────────────────────────────────────────────────────────
// A single long-lived server whose behaviour is swapped per-test via
// `currentHandler`, so OLLAMA_HOST/ENDPOINT (captured once at module load
// in the source file) stays pointed at one stable port for the whole suite.
let currentHandler = (req, res) => { res.writeHead(200); res.end('{}'); };
const fakeServer = http.createServer((req, res) => currentHandler(req, res));

let runtime; // required after the server is listening, so ENDPOINT is correct

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`test itself timed out waiting for ${label}`)), ms)),
  ]);
}

// ── Setup ────────────────────────────────────────────────────────────────────

const _ready = new Promise(resolve => {
  fakeServer.listen(0, '127.0.0.1', () => {
    const port = fakeServer.address().port;
    process.env.OLLAMA_HOST = `http://127.0.0.1:${port}`;
    runtime = require('../../ollama/ollama-runtime.js');
    resolve();
  });
});

// ── §A: happy path still works ────────────────────────────────────────────────

test('A1', 'successful stream: tokens arrive, onDone fires, onError never called', async () => {
  await _ready;
  currentHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify({ response: 'hello ' }) + '\n');
    res.write(JSON.stringify({ response: 'world' }) + '\n');
    res.end(JSON.stringify({ done: true }) + '\n');
  };

  const tokens = [];
  let doneFired = false, errorFired = null;
  await withTimeout(new Promise(resolve => {
    runtime.streamGenerate(
      { model: 'qwen2.5-coder:1.5b', prompt: 'hi' },
      (t) => tokens.push(t),
      () => { doneFired = true; resolve(); },
      (e) => { errorFired = e; resolve(); },
    );
  }), 3000, 'A1 completion');

  assert.strictEqual(errorFired, null, `onError should not fire on success, got: ${errorFired?.message}`);
  assert(doneFired, 'onDone should fire on success');
  assert.strictEqual(tokens.join(''), 'hello world', 'tokens should concatenate correctly');
});

// ── §B: the actual bug — model-not-found / non-200 ───────────────────────────

test('B1', 'FIX: non-200 response (model not found) now calls onError, not silence', async () => {
  await _ready;
  currentHandler = (req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "model 'ghost:1b' not found, try pulling it first" }));
  };

  let errorFired = null, doneFired = false, tokenFired = false;
  await withTimeout(new Promise(resolve => {
    runtime.streamGenerate(
      { model: 'ghost:1b', prompt: 'hi' },
      () => { tokenFired = true; },
      () => { doneFired = true; resolve(); },
      (e) => { errorFired = e; resolve(); },
    );
  }), 3000, 'B1 error callback');

  assert(errorFired, 'onError should fire for a 404/model-not-found response — old code did NOTHING here');
  assert(!doneFired, 'onDone should not fire on a hard HTTP error');
  assert(!tokenFired, 'no tokens should fire on a hard HTTP error');
  assert(errorFired.message.includes('404'), `error message should mention the status code, got: ${errorFired.message}`);
  assert(errorFired.message.includes('not found'), `error message should surface ollama's own error text, got: ${errorFired.message}`);
});

// ── §C: mid-stream error with a 200 status ───────────────────────────────────

test('C1', 'FIX: a 200-status stream that turns into a JSON error line now calls onError', async () => {
  await _ready;
  currentHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify({ response: 'partial ' }) + '\n');
    res.end(JSON.stringify({ error: 'model crashed mid-generation' }) + '\n');
  };

  let errorFired = null;
  await withTimeout(new Promise(resolve => {
    runtime.streamGenerate(
      { model: 'qwen2.5-coder:1.5b', prompt: 'hi' },
      () => {},
      () => { resolve(); },
      (e) => { errorFired = e; resolve(); },
    );
  }), 3000, 'C1 mid-stream error');

  assert(errorFired, 'a mid-stream JSON error line should call onError, not be silently dropped by the old catch(e){}');
  assert(errorFired.message.includes('crashed'), `error message should surface the mid-stream error text, got: ${errorFired.message}`);
});

// ── §D: stream ends with no tokens and no done marker ────────────────────────

test('D1', 'FIX: stream that ends with zero tokens and no done marker calls onError instead of silently doing nothing', async () => {
  await _ready;
  currentHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(); // closes immediately, no body at all
  };

  let errorFired = null, doneFired = false;
  await withTimeout(new Promise(resolve => {
    runtime.streamGenerate(
      { model: 'qwen2.5-coder:1.5b', prompt: 'hi' },
      () => {},
      () => { doneFired = true; resolve(); },
      (e) => { errorFired = e; resolve(); },
    );
  }), 3000, 'D1 empty stream');

  assert(errorFired, 'an empty stream with no tokens/done should surface an error — old code called onDone({}) on ANY res.on("end"), success or not');
  assert(!doneFired, 'onDone should not fire for an empty/failed stream');
});

// ── §E: connection refused (ollama not running at all) ───────────────────────

test('E1', 'connection refused still calls onError with a clear message (this path already worked)', async () => {
  // Point at a port nothing is listening on.
  const _origHost = process.env.OLLAMA_HOST;
  process.env.OLLAMA_HOST = 'http://127.0.0.1:1'; // privileged/unused port, ECONNREFUSED
  delete require.cache[require.resolve('../../ollama/ollama-runtime.js')];
  const freshRuntime = require('../../ollama/ollama-runtime.js');

  let errorFired = null;
  await withTimeout(new Promise(resolve => {
    freshRuntime.streamGenerate(
      { model: 'qwen2.5-coder:1.5b', prompt: 'hi' },
      () => {},
      () => { resolve(); },
      (e) => { errorFired = e; resolve(); },
    );
  }), 3000, 'E1 connection refused');

  assert(errorFired, 'connection refused should call onError');
  assert(/refused|running|ollama/i.test(errorFired.message), `error message should be diagnosable, got: ${errorFired.message}`);

  // Restore real endpoint + module for any tests after this one.
  process.env.OLLAMA_HOST = _origHost;
  delete require.cache[require.resolve('../../ollama/ollama-runtime.js')];
  runtime = require('../../ollama/ollama-runtime.js');
});

// ── §F: timeout — server accepts but never responds ──────────────────────────

test('F1', 'FIX: a request that hangs forever now times out instead of hanging the caller forever', async () => {
  await _ready;
  currentHandler = (req, res) => {
    // Never write, never end — simulates a stalled/hung ollama process.
  };

  let errorFired = null;
  await withTimeout(new Promise(resolve => {
    runtime.streamGenerate(
      { model: 'qwen2.5-coder:1.5b', prompt: 'hi', timeoutMs: 300 },
      () => {},
      () => { resolve(); },
      (e) => { errorFired = e; resolve(); },
    );
  }), 3000, 'F1 timeout');

  assert(errorFired, 'a hung request should time out and call onError — old code had no timeout at all and would hang indefinitely');
  assert(/timed out/i.test(errorFired.message), `error message should say it timed out, got: ${errorFired.message}`);
});

// ── §G: module contract ───────────────────────────────────────────────────────

test('G1', 'exports ping, listModels, streamGenerate, bestFor, MODEL_CATALOG', () => {
  assert.strictEqual(typeof runtime.ping, 'function');
  assert.strictEqual(typeof runtime.listModels, 'function');
  assert.strictEqual(typeof runtime.streamGenerate, 'function');
  assert.strictEqual(typeof runtime.bestFor, 'function');
  assert(Array.isArray(runtime.MODEL_CATALOG));
});

test('G2', 'streamGenerate returns an abort function', async () => {
  await _ready;
  currentHandler = (req, res) => { /* hang */ };
  const abort = runtime.streamGenerate({ model: 'x', prompt: 'hi', timeoutMs: 5000 }, () => {}, () => {}, () => {});
  assert.strictEqual(typeof abort, 'function', 'streamGenerate should return an abort/destroy function');
  abort(); // should not throw
});

// ── RUN ───────────────────────────────────────────────────────────────────────
runAll();

module.exports = { passed: () => passed, failed: () => failed };
