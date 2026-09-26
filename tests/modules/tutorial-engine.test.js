'use strict';
// Tests the tutorial engine's detection core (_check) in Node — the
// machine-checkable half that makes "copilot detects when it's not
// working" real. DOM/toast/spotlight halves are browser-only by nature.
const assert = require('assert');
const http = require('http');
require('../../ui/tv-shell/tutorial/tutorial.js'); // attaches to globalThis
const { _check } = globalThis.NexusTutorial;

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
(async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === '/good') { res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"ideas":[{"x":1}]}'); }
    else { res.writeHead(500); res.end('{}'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  await test('T-001', 'url expectation passes on real 200 + checkFn true', async () => {
    const r = await _check({ url: `${base}/good`, checkFn: d => d.ideas.length > 0 });
    assert.strictEqual(r.ok, true);
  });
  await test('T-002', 'url expectation fails honestly on 500, observed carries the status', async () => {
    const r = await _check({ url: `${base}/bad` });
    assert.strictEqual(r.ok, false);
    assert.ok(r.observed.includes('500'));
  });
  await test('T-003', 'checkFn false → failed even on HTTP 200', async () => {
    const r = await _check({ url: `${base}/good`, checkFn: d => d.ideas.length > 99 });
    assert.strictEqual(r.ok, false);
  });
  await test('T-004', 'unreachable endpoint → failed with real error, not a throw', async () => {
    const r = await _check({ url: 'http://127.0.0.1:1/none' });
    assert.strictEqual(r.ok, false);
  });
  await test('T-005', 'unverifiable expectation → failed, not silently passed', async () => {
    const r = await _check({ something: 'else' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.observed.includes('unverifiable'));
  });
  srv.close();
  console.log(`\n  tutorial-engine: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
