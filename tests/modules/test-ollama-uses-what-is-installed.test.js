'use strict';
// 0.60.535 PC18 slice a — Ollama runs on what is installed. James, 2026-11-13: "Have it use any that's on my pc. Fallback to any other?" ·
// 2026-11-14: "We need the highest leverage, that gets me closer to cutting depende on you and using it the pipeline to build nexus."
// Found on his PC 2026-11-14: the default qwen2.5-coder:7b was not installed, so the build's Ollama rung was left off and the bridge's calls failed.
const assert = require('assert');
const http = require('http');
let passed = 0, failed = 0;
async function t(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}: ${e.message}`); } }
(async () => {
  const PR = require('../../lib/pipeline-routing.js');
  await t('OI-01', 'the ladder: a missing model runs on an installed coder model, said as swapped', () => {
    const rungs = PR.ladder(PR.policyFrom({ escalation: 'ollama:qwen2.5-coder:7b > claude' })).rungs;
    const p = PR.present(rungs, { reachable: true, installed: ['llama3.2:latest', 'qwen2.5-coder:3b'] });
    assert.deepStrictEqual(p.rungs.map(r => r.provider), ['ollama:qwen2.5-coder:3b', 'claude']);
    assert.strictEqual(p.rungs[0].swappedFrom, 'qwen2.5-coder:7b');
    assert.match(p.swapped[0].why, /qwen2\.5-coder:7b is not installed in Ollama — qwen2\.5-coder:3b runs in its place/);
  });
  await t('OI-02', 'the ladder: nothing installed → skipped, as before; agents stay', () => {
    const rungs = PR.ladder(PR.policyFrom({ escalation: 'ollama:qwen2.5-coder:7b > claude' })).rungs;
    const p = PR.present(rungs, { reachable: true, installed: [] });
    assert.deepStrictEqual(p.rungs.map(r => r.provider), ['claude']);
    assert.strictEqual(p.skipped.length, 1); assert.deepStrictEqual(p.swapped, []);
  });
  // the bridge's one door, against a stand-in Ollama that lists two models and answers /api/generate with the model it was asked for
  const asked = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5-coder:3b' }] })); return; }
      const j = JSON.parse(b || '{}'); asked.push(j.model);
      res.end(JSON.stringify({ model: j.model, response: `ran on ${j.model}`, done: true, done_reason: 'stop' }) + '\n');
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_HOST = `127.0.0.1:${srv.address().port}`;
  for (const k of Object.keys(require.cache)) if (k.includes('/ollama/')) delete require.cache[k];
  const OC = require('../../ollama/lib/ollama-client.js');
  await t('OI-03', 'pickInstalled: the wanted when installed (name ≡ name:latest); else a coder; else the first; null when none', () => {
    assert.strictEqual(OC.pickInstalled('llama3.2', ['llama3.2:latest', 'qwen2.5-coder:3b']), 'llama3.2:latest');
    assert.strictEqual(OC.pickInstalled('qwen2.5-coder:7b', ['llama3.2:latest', 'qwen2.5-coder:3b']), 'qwen2.5-coder:3b');
    assert.strictEqual(OC.pickInstalled('x', ['llama3.2:latest']), 'llama3.2:latest');
    assert.strictEqual(OC.pickInstalled('x', []), null);
  });
  await t('OI-04', 'the bridge: a call naming a missing model runs on an installed one', async () => {
    const m = await OC.resolveModel('qwen2.5-coder:7b', 'test');
    assert.strictEqual(m, 'qwen2.5-coder:3b');
    const kept = await OC.resolveModel('llama3.2:latest', 'test');
    assert.strictEqual(kept, 'llama3.2:latest');
  });
  srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
