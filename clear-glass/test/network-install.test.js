'use strict';
/**
 * test/network-install.test.js — clear-glass/src/network/* coverage
 * (relocated 2026-09-03 from guardian's mesh/ subsystem).
 * UUID: cg-test-network-install-v1-0000-2026-0903-001
 *
 * Real install() against a real scratch data dir, real bus, and a real
 * HTTP server dispatching through routes.js — not mocked.
 *
 * Run: node test/network-install.test.js
 */

const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

function freshModules() {
  Object.keys(require.cache).forEach(k => {
    if (k.includes('clear-glass-v3/siso') || k.includes('clear-glass-v3/src/core') ||
        k.includes('clear-glass-v3/src/network')) {
      delete require.cache[k];
    }
  });
}

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (err) { failed++; results.push({ name, ok: false, error: err.message }); console.log(`  ✗ ${name}: ${err.message}`); }
}
function assert(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

async function main() {
  freshModules();
  const { createBus, on } = require('../src/core/bus');
  const bus = createBus('SILENT');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-network-test-'));

  let readyEvent = null;
  on('network.ready', ev => { readyEvent = ev; });

  const net = require('../src/network/install.js');

  console.log('\n[1] network/install.js');

  await test('install() wires all 6 real modules without throwing', async () => {
    net.install(bus, { dataDir });
    assert(net.installed, 'not marked installed');
    assert(net.snr && net.keys && net.hosts && net.ports && net.canvas && net.engine, 'a module failed to load');
  });

  await test('network.ready is a real Event, not a raw (type,data) throw', async () => {
    // §REGRESSION for the real bug found while building this: clear-
    // glass's Stream.emit() requires an actual Event instance, unlike
    // guardian's bus — the original ported code passed (type, data)
    // straight through and threw on the very first emitted event.
    assert(readyEvent, 'network.ready never fired');
    assert(readyEvent.data && readyEvent.data.engine === true, 'ready payload missing/wrong');
  });

  await test('crypto engine produces a real health check', async () => {
    const h = net.engine.health();
    assert(h.ok === true, 'crypto engine unhealthy');
    assert(h.checks && h.checks.aes_gcm === true, 'aes_gcm check missing/false');
  });

  await test('a second install() call is a real no-op, not a re-init', async () => {
    const before = net.snr;
    net.install(bus, { dataDir });
    assert(net.snr === before, 'install() re-ran and replaced live module instances');
  });

  console.log('\n[2] network/routes.js — real HTTP dispatch');

  const routes = require('../src/network/routes.js');
  const server = http.createServer((req, res) => {
    const handled = routes.handle(req, res, { method: req.method, url: new URL(req.url, 'http://127.0.0.1'), body: null });
    if (!handled) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  function get(p) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${p}`, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch (e) { reject(e); } });
      }).on('error', reject);
    });
  }

  await test('GET /network/modules returns real per-module status', async () => {
    const { status, body } = await get('/network/modules');
    assert(status === 200);
    assert(body.ok === true);
    assert(body.modules.engine.ok === true, 'engine module status missing');
    assert(body.modules.snr.ok === true, 'snr module status missing');
  });

  await test('GET /network/crypto/health returns the real crypto health', async () => {
    const { status, body } = await get('/network/crypto/health');
    assert(status === 200);
    assert(body.allOk === true);
  });

  await test('a non-network path is not intercepted (returns false, falls through)', async () => {
    const { status } = await get('/some/other/route');
    assert(status === 404, 'routes.js must not swallow unrelated paths');
  });

  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Clear Glass — Network Subsystem Tests`);
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
  if (failed > 0) {
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('All tests pass ✓');
    process.exit(0);
  }
}

main();
