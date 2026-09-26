'use strict';
/**
 * tests/modules/test-copilot-tools-guardian-ncp-mesh.js
 * James: "wires tools for copilot for... ncp, agentmesh... guardian."
 * Real functional tests against mock servers matching each real
 * backend's actual confirmed contract (guardian's /command and
 * /providers, clear-glass's /agent-mesh/route) — not structural checks.
 */
const assert = require('assert');
const http = require('http');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  return fn()
    .then(() => { console.log(`  ✓ ${id} ${desc}`); passed++; })
    .catch((e) => { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; });
}

async function withMockServer(responder, fn) {
  const server = http.createServer(responder);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try { await fn(port); } finally { server.close(); }
}

async function run() {

  // ── guardian_dispatch ────────────────────────────────────────────────────
  await test('CT-001', 'guardian_dispatch sends the exact real body shape (including source: copilot) and returns the real result', async () => {
    await withMockServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        assert.strictEqual(parsed.provider, 'claude');
        assert.strictEqual(parsed.prompt, 'hello');
        assert.strictEqual(parsed.source, 'copilot', 'source:copilot is required for RAID approval — must not be omitted');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, jobId: 'test-job-1' }));
      });
    }, async (port) => {
      process.env.GUARDIAN_PORT = String(port);
      delete require.cache[require.resolve('../../lib/agent-tools/tools/guardian/dispatch.js')];
      const tool = require('../../lib/agent-tools/tools/guardian/dispatch.js');
      const result = await tool.execute({ provider: 'claude', prompt: 'hello' });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.jobId, 'test-job-1');
    });
  });

  await test('CT-002', 'guardian_dispatch fails honestly with a specific reason, never throws, when guardian is unreachable', async () => {
    process.env.GUARDIAN_PORT = '1'; // reserved, always refused
    delete require.cache[require.resolve('../../lib/agent-tools/tools/guardian/dispatch.js')];
    const tool = require('../../lib/agent-tools/tools/guardian/dispatch.js');
    const result = await tool.execute({ provider: 'claude', prompt: 'hello' });
    assert.ok(result.error, 'expected a real error message, not a thrown exception or silent success');
  });

  await test('CT-003', 'guardian_dispatch requires provider and prompt, fails honestly without them', async () => {
    delete require.cache[require.resolve('../../lib/agent-tools/tools/guardian/dispatch.js')];
    const tool = require('../../lib/agent-tools/tools/guardian/dispatch.js');
    const r1 = await tool.execute({ prompt: 'hi' });
    assert.ok(r1.error);
    const r2 = await tool.execute({ provider: 'claude' });
    assert.ok(r2.error);
  });

  // ── ncp_status ───────────────────────────────────────────────────────────
  await test('CT-004', 'ncp_status returns the real full provider map when no filter given', async () => {
    await withMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, providers: { claude: 'connected', chatgpt: 'null', gemini: 'connected' } }));
    }, async (port) => {
      process.env.GUARDIAN_PORT = String(port);
      delete require.cache[require.resolve('../../lib/agent-tools/tools/ncp/status.js')];
      const tool = require('../../lib/agent-tools/tools/ncp/status.js');
      const result = await tool.execute({});
      assert.strictEqual(result.providers.claude, 'connected');
      assert.strictEqual(result.providers.chatgpt, 'null');
    });
  });

  await test('CT-005', 'ncp_status filters to a single real provider correctly', async () => {
    await withMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, providers: { claude: 'connected', gemini: 'null' } }));
    }, async (port) => {
      process.env.GUARDIAN_PORT = String(port);
      delete require.cache[require.resolve('../../lib/agent-tools/tools/ncp/status.js')];
      const tool = require('../../lib/agent-tools/tools/ncp/status.js');
      const result = await tool.execute({ provider: 'gemini' });
      assert.strictEqual(result.connected, false);
      assert.strictEqual(result.status, 'null');
    });
  });

  await test('CT-006', 'ncp_status reports a real, honest error for an unknown provider, not a false "connected: false"', async () => {
    await withMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, providers: { claude: 'connected' } }));
    }, async (port) => {
      process.env.GUARDIAN_PORT = String(port);
      delete require.cache[require.resolve('../../lib/agent-tools/tools/ncp/status.js')];
      const tool = require('../../lib/agent-tools/tools/ncp/status.js');
      const result = await tool.execute({ provider: 'nonexistent-provider' });
      assert.ok(result.error);
    });
  });

  // ── agent_mesh_route ─────────────────────────────────────────────────────
  await test('CT-007', 'agent_mesh_route posts to the real /agent-mesh/route endpoint with the correct real body', async () => {
    await withMockServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        assert.strictEqual(req.url, '/agent-mesh/route');
        assert.strictEqual(parsed.prompt, 'say hello');
        assert.strictEqual(parsed.preferAgent, 'gemini');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, response: 'hi there', agentKey: 'gemini' }));
      });
    }, async (port) => {
      process.env.WIRE_PORT = String(port);
      delete require.cache[require.resolve('../../lib/agent-tools/tools/agent-mesh/route.js')];
      const tool = require('../../lib/agent-tools/tools/agent-mesh/route.js');
      const result = await tool.execute({ prompt: 'say hello', preferAgent: 'gemini' });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.agentKey, 'gemini');
    });
  });

  await test('CT-008', 'agent_mesh_route fails honestly when clear-glass is unreachable', async () => {
    process.env.WIRE_PORT = '1';
    delete require.cache[require.resolve('../../lib/agent-tools/tools/agent-mesh/route.js')];
    const tool = require('../../lib/agent-tools/tools/agent-mesh/route.js');
    const result = await tool.execute({ prompt: 'hi' });
    assert.ok(result.error);
  });

  await test('CT-009', 'all three tools are registered in the real tool index', async () => {
    delete require.cache[require.resolve('../../lib/agent-tools/index.js')];
    const agentTools = require('../../lib/agent-tools/index.js');
    for (const name of ['guardian_dispatch', 'ncp_status', 'agent_mesh_route']) {
      assert.ok(agentTools.TOOLS.has(name), `${name} should be registered`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
