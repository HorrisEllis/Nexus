'use strict';
// James's 2026-09-21 boot log, 2 hours of it: every chatgpt/claude/gemini chunk build
// denied ("RAID denied dispatch: proof required, none supplied for 'chat'"), the queue
// re-triggering the same stalled spec every 15s, and ChatGPT being asked to write an
// empty .gitkeep. Pins the three fixes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-gd-'));
const _jaa  = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-gd-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.on('exit', () => {
  try { fs.rmSync(_data, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_jaa,  { recursive: true, force: true }); } catch (_) {}
});
const assert = require('assert');
const http = require('http');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

async function main() {
  const se = await import('../../idearium/spec-engine/index.js');
  const { _startBuildQueuePoller, _buildingSpecs } = await import('../../idearium/api/index.js');
  const raid = require('../../cortex/core/raid');

  await test('T-001', "RAID approves a 'chat' dispatch whose top-level source is 'idearium'", () => {
    const ok = raid._approveTool('idearium', 'write a spec section', { action: 'chat' });
    assert.strictEqual(ok.approved, true, ok.reason);
  });

  await test('T-002', 'the old request shape (source only inside meta => source undefined) is still denied — the contract did not widen _default', () => {
    const denied = raid._approveTool('unknown', 'write a spec section', { action: 'chat' });
    assert.strictEqual(denied.approved, false);
    assert.match(denied.reason, /proof required/);
    const forge = raid._approveTool('idearium', 'x', { action: 'forge' });
    assert.strictEqual(forge.approved, false, 'idearium must not be able to forge');
  });

  await test('T-003', "agent-suite sends top-level source:'idearium' to guardian /command", async () => {
    let got = null;
    const server = await new Promise(r => { const s = http.createServer((req, res) => {
      let b = ''; req.on('data', d => b += d);
      req.on('end', () => { got = { url: req.url, body: JSON.parse(b) }; res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true,"jobId":"j1"}'); });
    }); s.listen(0, '127.0.0.1', () => r(s)); });
    process.env.GUARDIAN_PORT = String(server.address().port);
    // GUARDIAN_PORT is read at module load — import a fresh copy of the module
    const suite = await import('../../idearium/agent-suite/index.js?gd=' + Date.now());
    const r = await suite.buildChunkWithAgent('hello', { preferAgent: 'chatgpt' });
    await new Promise(r => server.close(r));
    assert.strictEqual(got.url, '/command');
    assert.strictEqual(got.body.source, 'idearium');
    assert.strictEqual(got.body.provider, 'chatgpt');
    assert.strictEqual(r.ok, true);
  });

  await test('T-004', 'a directory placeholder (.gitkeep) is completed at creation, never left for an agent; a real file is not', () => {
    const m = se.createFileTreeSpec({ name: 'gd-tree', plan: { files: [
      { path: 'src/kernel/types.js', layer: 'kernel', purpose: 'types' },
      { path: 'storage/data/.gitkeep', layer: 'runtime', purpose: 'keep dir', content: '' },
    ] } });
    const byPath = Object.fromEntries(m.chunks.map(c => [c.realPath, c]));
    assert.strictEqual(byPath['storage/data/.gitkeep'].status, 'complete');
    assert.strictEqual(byPath['src/kernel/types.js'].status, 'pending', 'a normal file must still be built by an agent');
  });

  await test('T-005', 'the queue does not re-trigger a stalled spec (failed kernel file + dependents still pending) every tick', async () => {
    _buildingSpecs.clear();
    const m = se.createFileTreeSpec({ name: 'gd-stalled', plan: { files: [
      { path: 'src/kernel/a.js', layer: 'kernel', purpose: 'a' },
      { path: 'src/engine/b.js', layer: 'engine', purpose: 'b' },
    ] } });
    const a = m.chunks.find(c => c.realPath === 'src/kernel/a.js');
    for (let i = 0; i < 3; i++) { se.markChunkBuilding(m.uuid, a.uuid, { agent: 'chatgpt', model: 'x' }); se.failChunk(m.uuid, a.uuid, 'boom'); }
    const after = se.loadSpec(m.uuid);
    assert.ok(after.chunks.some(c => c.status === 'pending'), 'test setup: a dependent chunk must still be pending');

    let hits = 0;
    const server = await new Promise(r => { const s = http.createServer((req, res) => {
      if (req.url.includes(m.uuid)) hits++;
      res.statusCode = 422; res.setHeader('Content-Type', 'application/json'); res.end('{"ok":false,"error":"1 chunk(s) stalled"}');
    }); s.listen(19851, '127.0.0.1', () => r(s)); });
    for (let i = 0; i < 3; i++) {                       // three "ticks": each poller start runs one immediately
      const t = _startBuildQueuePoller(19851);
      await new Promise(r => setTimeout(r, 250));
      clearInterval(t);
    }
    await new Promise(r => server.close(r));
    assert.strictEqual(hits, 1, `expected the stalled spec to be triggered once, was triggered ${hits} times`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
