'use strict';
// §CA4 — scoped http/sse connection tool. Default-deny domain allowlist + RAID gate.
const assert = require('assert');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const conn = require(path.join(__dirname, '../..', 'lib/connections'));

(async () => {
  await test('T-001', 'a call to an unregistered scope is default-denied', async () => {
    conn._resetForTest();
    const r = await conn.call({ scope: 'nope', url: 'http://127.0.0.1:1/x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.includes('unknown scope'));
  });

  await test('T-002', 'registerScope requires a non-empty allowedDomains (no wildcard scope)', async () => {
    conn._resetForTest();
    const r = conn.registerScope('bad', {});
    assert.strictEqual(r.ok, false);
  });

  await test('T-003', 'a domain not in the scope\'s allowlist is denied even with a valid scope', async () => {
    conn._resetForTest();
    conn.registerScope('local-only', { allowedDomains: ['example.com'] });
    const r = await conn.call({ scope: 'local-only', url: 'http://127.0.0.1:1/x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.includes('not in scope'));
  });

  await test('T-004', 'a scoped call to an allowed domain succeeds against a real local server', async () => {
    const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      conn._resetForTest();
      conn.registerScope('test-scope', { allowedDomains: ['127.0.0.1'] });
      const r = await conn.call({ scope: 'test-scope', url: `http://127.0.0.1:${port}/health` });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.body, { ok: true });
    } finally { server.close(); }
  });

  await test('T-005', 'allowedMethods narrows a scope further (POST allowed, DELETE not)', async () => {
    conn._resetForTest();
    conn.registerScope('methods-scoped', { allowedDomains: ['127.0.0.1'], allowedMethods: ['GET', 'POST'] });
    const r = await conn.call({ scope: 'methods-scoped', url: 'http://127.0.0.1:1/x', method: 'DELETE' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.includes('not allowed in scope'));
  });

  await test('T-006', 'a denied action (RAID gate) blocks the call even inside an allowed scope', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    conn._resetForTest();
    conn.registerScope('governed', { allowedDomains: ['127.0.0.1'] });
    const r = await conn.call({ scope: 'governed', url: 'http://127.0.0.1:1/x' });
    sm.governAction = orig;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'test-deny');
  });

  await test('T-007', 'openSSE streams real events from a local SSE server and close() stops delivery', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ n: 1 })}\n\n`);
      setTimeout(() => res.write(`data: ${JSON.stringify({ n: 2 })}\n\n`), 15);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      conn._resetForTest();
      conn.registerScope('sse-scope', { allowedDomains: ['127.0.0.1'] });
      const events = [];
      const handle = await conn.openSSE({ scope: 'sse-scope', url: `http://127.0.0.1:${port}/stream` });
      assert.strictEqual(handle.ok, true);
      handle.on('message', (m) => events.push(m));
      await new Promise((r) => setTimeout(r, 60));
      handle.close();
      assert.deepStrictEqual(events, [{ n: 1 }, { n: 2 }]);
    } finally { server.close(); }
  });

  await test('T-008', 'closeAll() closes every open stream (no leaked connections)', async () => {
    const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      conn._resetForTest();
      conn.registerScope('sse-scope2', { allowedDomains: ['127.0.0.1'] });
      await conn.openSSE({ scope: 'sse-scope2', url: `http://127.0.0.1:${port}/a` });
      await conn.openSSE({ scope: 'sse-scope2', url: `http://127.0.0.1:${port}/b` });
      assert.strictEqual(conn.listOpenStreams().length, 2);
      conn.closeAll();
      assert.strictEqual(conn.listOpenStreams().length, 0);
    } finally { server.close(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
