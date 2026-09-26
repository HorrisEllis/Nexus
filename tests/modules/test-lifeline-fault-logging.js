'use strict';
// §lifeline fault-logging — real stand-in provider servers, verifying silent failures now report real gaps.
const assert = require('assert');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const gapField = require(path.join(__dirname, '../..', 'lib/gap-field'));

function freshLifeline(env) {
  Object.assign(process.env, env);
  delete require.cache[require.resolve(path.join(__dirname, '../..', 'copilot/lifeline.js'))];
  return require(path.join(__dirname, '../..', 'copilot/lifeline.js'));
}

(async () => {
  await test('T-001', 'a real ollama job that reports status:failed produces a real gap, not a silent null', async () => {
    const jobs = {};
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/jobs') {
        const id = 'job-fail-' + Date.now();
        jobs[id] = 'failed';
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jobId: id }));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/api/jobs/')) {
        const id = req.url.split('/').pop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ job: { status: jobs[id] || 'failed' } }));
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
      const before = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'lifeline.provider-failure').length;
      const lifeline = freshLifeline({ OLLAMA_URL: `http://127.0.0.1:${port}`, GUARDIAN_URL: 'http://127.0.0.1:1' });
      await lifeline.route('test prompt', { requestId: 'test-fail-' + Date.now() });
      const after = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'lifeline.provider-failure');
      assert.ok(after.length > before, 'a real ollama job failure must produce a real gap-field report');
    } finally { server.close(); }
  });

  await test('T-002', 'a thrown error during the ollama call produces a real gap, not a silent null', async () => {
    // No server listening at all — a real connection error, not a mocked one.
    const before = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'lifeline.provider-error' || g.type === 'lifeline.provider-failure').length;
    const lifeline = freshLifeline({ OLLAMA_URL: 'http://127.0.0.1:1', GUARDIAN_URL: 'http://127.0.0.1:1' });
    await lifeline.route('test prompt', { requestId: 'test-error-' + Date.now() });
    const after = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'lifeline.provider-error' || g.type === 'lifeline.provider-failure');
    assert.ok(after.length > before, 'an unreachable ollama must produce a real gap, not vanish silently');
  });

  await test('T-003', 'a successful response gets contract-checked and the result carries contract_valid', async () => {
    const jobs = {};
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/jobs') {
        const id = 'job-ok-' + Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jobId: id }));
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/api/jobs/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ job: { status: 'complete', result: 'Paris is the capital of France, a real and complete answer with plenty of length to score well on heuristics.' } }));
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
      const lifeline = freshLifeline({ OLLAMA_URL: `http://127.0.0.1:${port}` });
      const result = await lifeline.route('what is the capital of France', { requestId: 'test-ok-' + Date.now(), intent: 'ask' });
      assert.strictEqual(typeof result.contract_valid, 'boolean', 'a real successful response must carry a contract_valid flag');
    } finally { server.close(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
