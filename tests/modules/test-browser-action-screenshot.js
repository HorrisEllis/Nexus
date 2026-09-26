'use strict';
/**
 * test-browser-action-screenshot.js — real test of two real changes to
 * lib/agent-tools/tools/browser/browser-action.js (2026-08-23):
 *   1. screenshot added as a real action.
 *   2. driver.exec-routed actions (navigate, screenshot) now correctly
 *      inject their own sub-action into the payload, since
 *      clear-glass/src/gates/index.js's real driverExecGate reads it
 *      from event.data.action directly — confirmed by reading that file,
 *      not assumed.
 *
 * Runs against the REAL module, with a real, minimal fake guardian HTTP
 * server standing in — not a reimplementation of the tool's logic.
 */
const http = require('http');
const assert = require('assert');

process.env.GUARDIAN_PORT = '17820'; // isolated, real port for this test run

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

async function main() {
  let lastJobBody = null;
  const jobId = 'test-job-1';

  // Real, minimal fake guardian: /command creates a job, /jobs?limit=200
  // reports it complete immediately with a fake response.
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/command') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        lastJobBody = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jobId }));
      });
    } else if (req.method === 'GET' && req.url.startsWith('/jobs')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs: [{ id: jobId, status: 'complete', response: { ok: true, real: true } }] }));
    } else {
      res.writeHead(404); res.end();
    }
  });

  await new Promise(resolve => server.listen(17820, resolve));

  const tool = require('/home/claude/nexus-current-1/nexus/lib/agent-tools/tools/browser/browser-action.js');

  await (async () => {
    test('screenshot is a real, listed action', () => {
      assert.ok(tool.parameters.properties.action.enum.includes('screenshot'), 'screenshot missing from the real enum');
    });

    test('screenshot dispatch reaches guardian with the real, correct payload shape', async () => {
      lastJobBody = null;
      const r = await tool.execute({ action: 'screenshot', data: {} });
      assert.strictEqual(r.ok, true, `expected ok:true, got ${JSON.stringify(r)}`);
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, 'screenshot', 'driverExecGate needs data.action === "screenshot", real payload did not have it');
    });

    test('screenshot with a real rect param passes through correctly', async () => {
      lastJobBody = null;
      await tool.execute({ action: 'screenshot', data: { rect: { x: 0, y: 0, w: 800, h: 600 } } });
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, 'screenshot');
      assert.deepStrictEqual(content.rect, { x: 0, y: 0, w: 800, h: 600 });
    });

    test('toast is a real, listed action', () => {
      assert.ok(tool.parameters.properties.action.enum.includes('toast'), 'toast missing from the real enum');
    });

    test('toast dispatch reaches guardian with the real, correct payload shape', async () => {
      lastJobBody = null;
      const r = await tool.execute({ action: 'toast', data: { msg: 'job application submitted', type: 'success' } });
      assert.strictEqual(r.ok, true, `expected ok:true, got ${JSON.stringify(r)}`);
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, 'toast', 'driverExecGate needs data.action === "toast"');
      assert.strictEqual(content.msg, 'job application submitted');
      assert.strictEqual(content.type, 'success');
    });

    test('navigate ALSO now correctly injects action (the real, pre-existing gap this fix also closed)', async () => {
      lastJobBody = null;
      await tool.execute({ action: 'navigate', data: { url: 'https://example.com' } });
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, 'navigate', 'navigate must also carry data.action for driverExecGate');
      assert.strictEqual(content.url, 'https://example.com');
    });

    test('get_url correctly maps to the real driver sub-action "getUrl" (camelCase), not the tool\'s own snake_case name', async () => {
      lastJobBody = null;
      await tool.execute({ action: 'get_url', data: {} });
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, 'getUrl', 'must be the real driver sub-action name, not "get_url"');
    });

    test('get_title correctly maps to "getTitle"', async () => {
      lastJobBody = null;
      await tool.execute({ action: 'get_title', data: {} });
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, 'getTitle');
    });

    test('dom_query (NOT driver.exec-routed) is correctly unaffected — no injected action field', async () => {
      lastJobBody = null;
      await tool.execute({ action: 'dom_query', data: { selector: '#foo' } });
      const content = JSON.parse(lastJobBody.content);
      assert.strictEqual(content.action, undefined, 'dom_query\'s own real gate does not expect a nested action field — injecting one would be wrong');
      assert.strictEqual(content.selector, '#foo');
    });

    test('an unknown action still fails loud, unaffected by this change', async () => {
      const r = await tool.execute({ action: 'not_a_real_action', data: {} });
      assert.ok(r.error && r.error.includes('unknown action'));
    });
  })();

  server.close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('test harness error:', e); process.exit(1); });
