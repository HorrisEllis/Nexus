'use strict';
const assert = require('assert');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
(async () => {
  // fake diagnostic + cortex on ephemeral ports
  const diag = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type':'application/json'});
    if (req.url === '/status') res.end('{"ok":true,"summary":{"guardian":{"online":true,"sigma":0.2}}}');
    else if (req.url.startsWith('/gaps')) res.end('{"ok":true,"count":1,"gaps":[{"id":"g1","system":"ollama"}]}');
    else if (req.url.startsWith('/summary/guardian')) res.end('{"ok":true,"system":"guardian","friction":0.1}');
    else res.end('{"ok":true}');
  });
  const cortex = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      res.writeHead(200, {'Content-Type':'application/json'});
      if (req.url === '/api/push') res.end(JSON.stringify({ ok: true, stored: JSON.parse(body).content.slice(0,20) }));
      else if (req.url.startsWith('/api/recall')) res.end('{"ok":true,"results":[{"content":"remembered thing"}],"count":1}');
      else if (req.url.startsWith('/api/memory?')) res.end('{"ok":true,"rows":[{"a":1}],"count":1}');
      else if (req.url === '/api/memory/insert') res.end('{"ok":true,"id":"row-1"}');
      else res.end('{"ok":false}');
    });
  });
  await new Promise(r => diag.listen(0, '127.0.0.1', r));
  await new Promise(r => cortex.listen(0, '127.0.0.1', r));
  process.env.DIAGNOSTIC_URL = `http://127.0.0.1:${diag.address().port}`;
  process.env.CORTEX_URL = `http://127.0.0.1:${cortex.address().port}`;
  const { executeTool } = require('../../lib/agent-tools/index.js');

  await test('T-001', 'diagnose status hits the real endpoint and returns real data', async () => {
    const r = await executeTool('diagnose', { action: 'status' });
    assert.strictEqual(r.summary.guardian.online, true);
  });
  await test('T-002', 'diagnose gaps with system filter builds the right query', async () => {
    const r = await executeTool('diagnose', { action: 'gaps', system: 'ollama' });
    assert.strictEqual(r.gaps[0].system, 'ollama');
  });
  await test('T-003', 'diagnose summary without system: honest error, no fabricated diagnosis', async () => {
    const r = await executeTool('diagnose', { action: 'summary' });
    assert.ok(r.error && r.error.includes('requires a system'));
  });
  await test('T-004', 'move_data push stores content via the real /api/push shape', async () => {
    const r = await executeTool('move_data', { action: 'push', content: 'user prefers dark themes', tags: ['pref'], tier: 'long' });
    assert.strictEqual(r.ok, true);
  });
  await test('T-005', 'move_data recall requires intent or query — honest error otherwise', async () => {
    const r = await executeTool('move_data', { action: 'recall' });
    assert.ok(r.error);
    const r2 = await executeTool('move_data', { action: 'recall', intent: 'user preferences' });
    assert.strictEqual(r2.results[0].content, 'remembered thing');
  });
  await test('T-006', 'move_data has NO delete action — nothing-lost law enforced at the tool boundary', async () => {
    const r = await executeTool('move_data', { action: 'forget' });
    assert.ok(r.error);
  });
  await test('T-007', 'unreachable diagnostic → error result, never fabricated health', async () => {
    process.env.DIAGNOSTIC_URL = 'http://127.0.0.1:1';
    delete require.cache[require.resolve('../../lib/agent-tools/tools/diagnostic/diagnose.js')];
    const r = await executeTool('diagnose', { action: 'status' });
    assert.ok(r.error);
  });
  diag.close(); cortex.close();
  console.log(`\n  diagnose-move-data-tools: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
