'use strict';
/**
 * tests/modules/test-lifeline-ollama-dispatch.test.js — 0.60.62
 *
 * James, 2026-10-15: "bricks keep failing." Every officiator drop and RAID-worker brick routed to Ollama read
 * "no real agent response (forAgent=ollama)": dispatchToNcpAgent sent the job through guardian's tab check, where
 * Ollama (no browser tab) is always 'null'. These tests run a fake ollama-bridge and a fake guardian on loopback and
 * prove an Ollama dispatch goes to the bridge, never to guardian.
 */
const assert = require('assert');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeline-ollama-'));
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const listen = (h) => new Promise(r => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)); });

(async () => {
  const bridgeJobs = []; let polls = 0; let guardianHits = 0;
  const bridge = await listen((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/api/jobs') { bridgeJobs.push(JSON.parse(b)); return res.end(JSON.stringify({ jobId: 'j1' })); }
      if (req.method === 'GET' && req.url === '/api/jobs/j1') {
        polls++;
        return res.end(JSON.stringify({ job: polls < 2 ? { status: 'running' } : { status: 'complete', result: '{"title":"t","content":"c"}' } }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  const guardian = await listen((req, res) => { guardianHits++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, providers: { ollama: 'null' } })); });
  process.env.OLLAMA_URL   = `http://127.0.0.1:${bridge.address().port}`;
  process.env.GUARDIAN_URL = `http://127.0.0.1:${guardian.address().port}`;
  const lifeline = require('../../copilot/lifeline.js');

  await test('LO1', 'dispatchToNcpAgent(provider:ollama) is answered by the bridge, not refused by guardian\'s tab check', async () => {
    const r = await lifeline.dispatchToNcpAgent('synthesize', { provider: 'ollama' });
    assert.ok(r && r.ok, `expected ok, got ${JSON.stringify(r)}`);
    assert.strictEqual(r.provider, 'ollama');
    assert.match(r.text, /"title"/);
    assert.strictEqual(guardianHits, 0, 'guardian must not be asked about an Ollama job');
  });

  await test('LO2', 'the bridge job carries a timeout that fits a local 7B model (≥ 120 s), not the chat default of 30 s', async () => {
    assert.ok(bridgeJobs[0].timeoutMs >= 120000, `timeoutMs was ${bridgeJobs[0].timeoutMs}`);
  });

  await test('LO3', 'a dead bridge is an honest failure with a reason, not null', async () => {
    bridge.close();
    process.env.OLLAMA_URL = 'http://127.0.0.1:1';
    delete require.cache[require.resolve('../../copilot/lifeline.js')];
    const r = await require('../../copilot/lifeline.js').dispatchToNcpAgent('x', { provider: 'ollama' });
    assert.ok(r && r.ok === false && /ollama-bridge/.test(r.error), JSON.stringify(r));
  });

  guardian.close(); try { bridge.close(); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
