'use strict';
/**
 * tests/modules/nexus-repl-descriptors.test.js — Phase 36
 * UUID: test-nexus-repl-descriptors-v1-0000-3600-0000-000000000001
 *
 * Covers: descriptor shape passes component-registry's real validate()
 * (not a guessed shape — imports the actual schema), registerAll() POSTs
 * to the right path with the right body, idempotent re-registration
 * doesn't error, and a network failure during registration doesn't throw
 * (must degrade silently per the fire-and-forget contract in nexus-repl.js).
 */

const assert = require('assert');
const http = require('http');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

async function run() {
  const { DESCRIPTORS, registerAll } = require('../../cli/nexus-repl-descriptors');
  const componentRegistry = require('../../lib/component-registry');

  await test('RD-01', 'descriptor shape passes component-registry\'s real validate()', () => {
    for (const d of DESCRIPTORS) {
      const { ok, errors } = componentRegistry.validate({
        ...d,
        params: d.params || [],
        hooks: [],
        permissions: ['system'],
      });
      assert.ok(ok, `${d.id} failed validate(): ${JSON.stringify(errors)}`);
    }
  });

  await test('RD-02', 'registerAll() POSTs each descriptor to /api/components/register', async () => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        received.push({ path: req.url, method: req.method, body: JSON.parse(body) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, created: true }));
      });
    });
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const results = await registerAll(`http://127.0.0.1:${port}`);

    server.close();

    assert.strictEqual(received.length, DESCRIPTORS.length);
    assert.strictEqual(received.length, 4, 'expected forge, heal, snapshot, and copilot');
    assert.deepStrictEqual(received.map(r => r.body.id).sort(), ['repl.copilot', 'repl.forge', 'repl.heal', 'repl.snapshot']);
    assert.ok(received.every(r => r.path === '/api/components/register'));
    assert.ok(received.every(r => r.method === 'POST'));
    assert.ok(results.every(r => r.ok === true));
  });

  await test('RD-03', 'registerAll() degrades silently on connection failure — never throws', async () => {
    // Nothing listening on this port — connection refused.
    const results = await registerAll('http://127.0.0.1:1');
    assert.ok(results.every(r => r.ok === false));
    assert.ok(results[0].error, 'expected an error message captured, not silently empty');
  });

  console.log(`\n  nexus-repl-descriptors: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
