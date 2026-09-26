'use strict';
// §CA3 — stepwise chains: sequential agent/command/http/fn steps, RAID-gated, halt-on-failure.
const assert = require('assert');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const chains = require(path.join(__dirname, '../..', 'lib/chains'));

(async () => {
  await test('T-001', 'a chain needs a non-empty steps[]', async () => {
    const r = await chains.runChain({ name: 'empty' });
    assert.strictEqual(r.ok, false);
  });

  await test('T-002', 'fn steps run in order, each receiving the prior step\'s output as carry', async () => {
    const r = await chains.runChain({
      name: 'math',
      input: 2,
      steps: [
        { kind: 'fn', fn: (c) => c * 3 },
        { kind: 'fn', fn: (c) => c + 1 },
      ],
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.output, 7, `expected 2*3+1=7, got ${r.output}`);
    assert.strictEqual(r.results.length, 2);
  });

  await test('T-003', 'keepCarry lets a step pass carry through unchanged instead of replacing it', async () => {
    const r = await chains.runChain({
      name: 'sidecar',
      input: 5,
      steps: [
        { kind: 'fn', fn: (c) => 999, keepCarry: true },
        { kind: 'fn', fn: (c) => c },
      ],
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.output, 5, 'keepCarry step must not overwrite carry for the next step');
  });

  await test('T-004', 'a throwing step halts the chain — later steps do not run', async () => {
    let ran3 = false;
    const r = await chains.runChain({
      name: 'boom',
      steps: [
        { kind: 'fn', fn: () => { throw new Error('step2 fails'); } },
        { kind: 'fn', fn: () => { ran3 = true; } },
      ],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.haltedAt, 0);
    assert.strictEqual(ran3, false, 'a step after a failure must not run');
  });

  await test('T-005', 'an unknown step.kind throws (and halts) rather than silently no-op', async () => {
    const r = await chains.runChain({ name: 'bad-kind', steps: [{ kind: 'nonsense' }] });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('unknown step.kind'));
  });

  await test('T-006', 'a denied step (RAID gate) halts the chain and is marked denied, not silently skipped', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    let ran2 = false;
    const r = await chains.runChain({
      name: 'denied',
      steps: [
        { kind: 'fn', fn: () => {} },
        { kind: 'fn', fn: () => { ran2 = true; } },
      ],
    });
    sm.governAction = orig;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.results[0].denied, true);
  });

  await test('T-007', 'an http step makes a real call to a local server and parses JSON', async () => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ echoed: JSON.parse(body || '{}') }));
      });
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    try {
      const r = await chains.runChain({
        name: 'http-chain',
        steps: [{ kind: 'http', method: 'POST', url: `http://127.0.0.1:${port}/echo`, body: { hello: 'world' } }],
      });
      assert.strictEqual(r.ok, true);
      assert.deepStrictEqual(r.output.body, { echoed: { hello: 'world' } });
      assert.strictEqual(r.output.status, 200);
    } finally {
      server.close();
    }
  });

  await test('T-008', 'an http step to an unreachable port halts the chain with an error, not a hang', async () => {
    const r = await chains.runChain({
      name: 'http-fail',
      steps: [{ kind: 'http', url: 'http://127.0.0.1:1/nope', timeoutMs: 500 }],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.haltedAt, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
