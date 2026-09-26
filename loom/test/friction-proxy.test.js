'use strict';
// §loom friction/tension proxy — real HTTP round trip through CA4's connections.js,
// against both a live stand-in "kernel" and a genuinely unreachable one.
const assert = require('assert');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }

process.env.LOOM_PORT = '13799';

(async () => {
  await test('T-001', '/api/friction proxies a real stand-in kernel and returns its actual body', async () => {
    // A minimal stand-in for service/nexus-diagnostic.js's real /friction route —
    // tests the PROXY, not the kernel's own internals (those are exercised live
    // by actually booting the real kernel, done manually this session; a unit
    // test shouldn't require a 2297-line service to be running to pass in CI).
    const stand_in = http.createServer((req, res) => {
      if (req.url === '/friction') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, friction: { testsystem: { friction: 0.42 } } })); return; }
      res.writeHead(404); res.end();
    });
    await new Promise(r => stand_in.listen(17825, '127.0.0.1', r));
    process.env.DIAGNOSTIC_URL = 'http://127.0.0.1:17825';
    process.env.LOOM_PORT = '13797';
    delete require.cache[require.resolve(path.join(__dirname, '../..', 'loom/server.js'))];
    const loomModule = require(path.join(__dirname, '../..', 'loom/server.js'));
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch('http://127.0.0.1:13797/api/friction');
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.friction.testsystem.friction, 0.42, 'must be the stand-in\'s real data, not fabricated');
    } finally {
      stand_in.close();
      await new Promise(r => loomModule.server.close(r));
    }
  });

  await test('T-002', '/api/friction returns an honest 502 when the diagnostic kernel is unreachable — not a fake 200', async () => {
    process.env.DIAGNOSTIC_URL = 'http://127.0.0.1:1';   // nothing listens on port 1
    process.env.LOOM_PORT = '13798';
    delete require.cache[require.resolve(path.join(__dirname, '../..', 'loom/server.js'))];
    const loomModule = require(path.join(__dirname, '../..', 'loom/server.js'));
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch('http://127.0.0.1:13798/api/friction');
      assert.strictEqual(res.status, 502, 'an unreachable kernel must surface as a real error, not a silent empty success');
      const body = await res.json();
      assert.strictEqual(body.ok, false);
    } finally {
      await new Promise(r => loomModule.server.close(r));
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
