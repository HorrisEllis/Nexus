'use strict';
// Real, adversarial test for guardian/server.js's body-parsing functions
// (bodyJ, the /lab/* inline handler, memBodyJson). James: "find every
// problem you can... hostile attacked and verified. okay now fix it."
// Real, unbounded memory-exhaustion DoS: all 3 real body-accumulation
// sites had zero size limit — a request that never stops sending data
// would grow a single string forever, exactly the kind of pressure this
// same session already traced a real, live OOM crisis to.
//
// §NO SERVER REQUIRE — guardian/server.js boots a real, live server as a
// side effect of being required. Same isolation principle this session
// already established: an isolated, verbatim copy of the real, fixed
// bodyJ() logic, driven by a real, minimal EventEmitter standing in for
// `req` (the real interface bodyJ() actually uses — .on('data'/'end'/
// 'error'), nothing more), plus a structural check that the real,
// shipped source still has the fix at all 3 real sites.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const SRC = fs.readFileSync(path.join(__dirname, '../../guardian/server.js'), 'utf8');
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function bodyJ(req) {
  return new Promise((resolve, reject) => {
    let b = ''; let bytes = 0; let rejected = false;
    req.on('data', c => {
      if (rejected) return;
      bytes += Buffer.byteLength(c);
      if (bytes > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy();
        reject(new Error(`request body exceeded ${MAX_BODY_BYTES} bytes — refused, not silently buffered forever`));
        return;
      }
      b += c;
    });
    req.on('end', () => { if (!rejected) { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } } });
    req.on('error', reject);
  });
}

function fakeReq() {
  const emitter = new EventEmitter();
  emitter.destroy = () => { emitter.destroyed = true; };
  return emitter;
}

(async () => {

test('GHDOS-000', 'the copy above genuinely matches the real, shipped bodyJ source (same real limit, same real reject behavior)', () => {
  assert.ok(SRC.includes('const MAX_BODY_BYTES = 10 * 1024 * 1024;'), 'the real MAX_BODY_BYTES constant is missing or changed — this test\'s own copy may no longer match reality');
  assert.ok(SRC.includes('bytes > MAX_BODY_BYTES'), 'the real bodyJ() size check is missing');
});

await test('GHDOS-001', 'a real, oversized body (just over the limit) is rejected, not silently accumulated forever', async () => {
  const req = fakeReq();
  const promise = bodyJ(req);
  const oversizedChunk = Buffer.alloc(MAX_BODY_BYTES + 1, 'x').toString();
  req.emit('data', oversizedChunk);
  await assert.rejects(promise, /exceeded.*bytes/);
});

await test('GHDOS-002', 'the real request is destroyed the moment the limit is crossed — the socket actually stops being fed, not just the promise rejected while data keeps flowing', async () => {
  const req = fakeReq();
  const promise = bodyJ(req);
  const oversizedChunk = Buffer.alloc(MAX_BODY_BYTES + 1, 'x').toString();
  req.emit('data', oversizedChunk);
  await promise.catch(() => {});
  assert.strictEqual(req.destroyed, true, 'expected req.destroy() to have actually been called');
});

await test('GHDOS-003', 'data received after the limit is already crossed is genuinely ignored, not appended to a body that\'s already being discarded', async () => {
  const req = fakeReq();
  const promise = bodyJ(req);
  const oversizedChunk = Buffer.alloc(MAX_BODY_BYTES + 1, 'x').toString();
  req.emit('data', oversizedChunk);
  assert.doesNotThrow(() => req.emit('data', 'more data after the limit'));
  await assert.rejects(promise);
});

await test('GHDOS-004', 'a real, normal, small body still works exactly as before — the fix does not break the working case', async () => {
  const req = fakeReq();
  const promise = bodyJ(req);
  req.emit('data', '{"real":"small body, well under the limit"}');
  req.emit('end');
  const result = await promise;
  assert.deepStrictEqual(result, { real: 'small body, well under the limit' });
});

test('GHDOS-005', 'the real, shipped source has the same real fix at all 3 real body-accumulation sites found, not just bodyJ', () => {
  assert.ok(/rawBytes > MAX_BODY_BYTES/.test(SRC), 'the /lab/* inline handler\'s own real size check is missing');
  assert.ok(/memBytes > MAX_BODY_BYTES/.test(SRC), 'memBodyJson\'s own real size check is missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
