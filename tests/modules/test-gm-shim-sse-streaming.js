'use strict';
/**
 * tests/modules/test-gm-shim-sse-streaming.js
 * James: "clearglass needs to work. the ncp." Real fix: gm-shim.js's
 * GM_xmlhttpRequest used to do one fetch().then(res => res.text()),
 * calling onload exactly once after the FULL body finished — never
 * onprogress. Against a real, live, intentionally-never-closing SSE
 * stream, that never happens, so NCP's _gmEventSource() (which requires
 * onprogress firing repeatedly) could never see a single frame.
 *
 * This test runs the actual injected shim string (extracted via
 * buildGmShim(), not reimplemented) against a REAL chunked HTTP server
 * that sends data in separate writes with delays — genuine streaming,
 * not a single flush — using Node's native fetch/AbortController (same
 * APIs the shim itself uses) to prove it inside a real Node process.
 */
const assert = require('assert');
const http = require('http');
const vm = require('vm');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  return fn()
    .then(() => { console.log(`  ✓ ${id} ${desc}`); passed++; })
    .catch((e) => { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; });
}

function loadShimIntoSandbox() {
  const { buildGmShim } = require('../../clear-glass/src/providers/gm-shim.js');
  const shimSrc = buildGmShim();
  const sandbox = { window: {}, fetch, AbortController, TextDecoder, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(shimSrc, sandbox);
  return sandbox.window.GM_xmlhttpRequest;
}

async function withChunkedServer(chunks, { neverClose = false } = {}, fn) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let i = 0;
    const sendNext = () => {
      if (i >= chunks.length) {
        if (!neverClose) res.end();
        return;
      }
      res.write(chunks[i++]);
      setTimeout(sendNext, 20);
    };
    sendNext();
    req.on('close', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try { await fn(port); } finally { server.close(); }
}

async function run() {
  const GM_xmlhttpRequest = loadShimIntoSandbox();

  await test('GMS-001', 'onprogress fires multiple times with correctly accumulated responseText — the exact real bug fixed', async () => {
    await withChunkedServer(
      ['data: frame-one\n\n', 'data: frame-two\n\n', 'data: frame-three\n\n'],
      {},
      (port) => new Promise((resolve, reject) => {
        const progressCalls = [];
        let openedAt = null;
        GM_xmlhttpRequest({
          method: 'GET', url: `http://127.0.0.1:${port}/`, timeout: 0,
          onreadystatechange: (res) => { if (res.readyState === 3) openedAt = Date.now(); },
          onprogress: (res) => { progressCalls.push(res.responseText); },
          onload: () => {
            try {
              assert.ok(progressCalls.length >= 2, `expected multiple onprogress calls, got ${progressCalls.length}`);
              assert.ok(openedAt !== null, 'onreadystatechange(readyState:3) should have fired');
              const last = progressCalls[progressCalls.length - 1];
              assert.ok(last.includes('frame-one') && last.includes('frame-two') && last.includes('frame-three'), 'final accumulated text should contain all three frames');
              resolve();
            } catch (e) { reject(e); }
          },
          onerror: (e) => reject(new Error('unexpected onerror: ' + e.message)),
        });
      })
    );
  });

  await test('GMS-002', 'a genuinely live, long-running stream is NOT prematurely treated as ended — onload only fires on real close', async () => {
    await withChunkedServer(
      ['data: only-frame\n\n'],
      { neverClose: true },
      (port) => new Promise((resolve, reject) => {
        let onloadFired = false;
        let progressCount = 0;
        const req = GM_xmlhttpRequest({
          method: 'GET', url: `http://127.0.0.1:${port}/`, timeout: 0,
          onprogress: () => { progressCount++; },
          onload: () => { onloadFired = true; },
          onerror: () => {},
        });
        setTimeout(() => {
          try {
            assert.ok(progressCount >= 1, 'onprogress should have fired for the one real chunk sent');
            assert.strictEqual(onloadFired, false, 'onload must NOT fire while the server deliberately keeps the connection open — this is the exact bug: a live SSE stream is not "done"');
            req.abort();
            resolve();
          } catch (e) { reject(e); }
        }, 150);
      })
    );
  });

  await test('GMS-003', 'abort() during an active stream does not fire onerror (a deliberate close is not a real error)', async () => {
    await withChunkedServer(
      ['data: x\n\n'],
      { neverClose: true },
      (port) => new Promise((resolve, reject) => {
        let errorFired = false;
        const req = GM_xmlhttpRequest({
          method: 'GET', url: `http://127.0.0.1:${port}/`, timeout: 0,
          onprogress: () => { req && req.abort && req.abort(); },
          onerror: () => { errorFired = true; },
          onload: () => {},
        });
        setTimeout(() => {
          assert.strictEqual(errorFired, false, 'a deliberate abort() must not be reported as onerror');
          resolve();
        }, 150);
      })
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
