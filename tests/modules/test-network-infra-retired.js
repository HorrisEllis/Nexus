'use strict';
/**
 * tests/modules/test-network-infra-retired.js
 * James: "DNS/firewall/crypto/host-rotation is redundant and should be
 * deleted." Verifies the real boundary: everything except pulse-registry
 * (src/mesh/agent-mesh.js's genuine, load-bearing dependency) is gone.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
async function atest(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const NET_DIR = path.join(__dirname, '../../clear-glass/src/network');
const ARCHIVE_DIR = path.join(__dirname, '../../_archive/2026-09-06-brainos-network-infra-retired');

async function run() {

  test('NIR-001', 'the 12 genuinely redundant files are gone from the live network folder', () => {
    for (const f of ['canvas-persistence.js','crypto-engine.js','daemons.js','ddns.js','dns-server.js','firewall.js','host-rotation.js','key-manager.js','network-snr-filter.js','port-registry.js','reverse-proxy.js','config.js']) {
      assert.ok(!fs.existsSync(path.join(NET_DIR, f)), `${f} should be gone from the live location`);
    }
  });

  test('NIR-002', 'every retired file is archived, not deleted without a trace — §0.3', () => {
    for (const f of ['canvas-persistence.js','crypto-engine.js','daemons.js','ddns.js','dns-server.js','firewall.js','host-rotation.js','key-manager.js','network-snr-filter.js','port-registry.js','reverse-proxy.js','config.js']) {
      assert.ok(fs.existsSync(path.join(ARCHIVE_DIR, f)), `${f} should exist in the archive`);
    }
  });

  test('NIR-003', 'pulse-registry.js — the real, load-bearing dependency — is untouched', () => {
    assert.ok(fs.existsSync(path.join(NET_DIR, 'pulse-registry.js')));
  });

  await atest('NIR-004', 'install() wires pulse and ONLY pulse — no snr/keys/hosts/ports/canvas/engine', async () => {
    delete require.cache[require.resolve(path.join(NET_DIR, 'install.js'))];
    const install = require(path.join(NET_DIR, 'install.js'));
    const net = install.install({ emit: () => {} });
    assert.strictEqual(net.installed, true);
    assert.ok(net.pulse, 'pulse must be real and present');
    for (const key of ['snr', 'keys', 'hosts', 'ports', 'canvas', 'engine']) {
      assert.strictEqual(net[key], undefined, `net.${key} should no longer exist`);
    }
  });

  await atest('NIR-005', 'a removed route (e.g. /network/keys/*) 404s cleanly instead of crashing', async () => {
    const routes = require(path.join(NET_DIR, 'routes.js'));
    const res = { writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    routes.handle({}, res, { method: 'GET', url: new URL('http://x/network/keys/list'), body: {} });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(res.status, 404);
    assert.strictEqual(JSON.parse(res.body).ok, false);
  });

  await atest('NIR-006', 'the surviving /network/pulse and /network/modules routes genuinely work', async () => {
    const routes = require(path.join(NET_DIR, 'routes.js'));
    const res = { writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    routes.handle({}, res, { method: 'GET', url: new URL('http://x/network/modules'), body: {} });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.strictEqual(parsed.modules.pulse.ok, true);
    assert.ok(parsed.modules.hosts === undefined, 'hosts should no longer appear in the modules status at all');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
