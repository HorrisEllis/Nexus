'use strict';
// §AP1 — the pull toolbox (agents reach back into NEXUS) + the living cortex tool
// index that populates over time.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ROOT = path.join(__dirname, '../..');
const pull = require(path.join(ROOT, 'lib/agent-pull'));
const idx = require(path.join(ROOT, 'lib/tool-index'));

(async () => {
  await test('T-001', 'an agent pulls a capability query from NEXUS', async () => {
    const r = await pull.pull('code-architect', 'query_capability', { intent: 'chunk' });
    assert.ok(r.ok, r.reason); assert.ok('total' in r);
  });
  await test('T-002', 'read-only discovery is broadly allowed (schemas/capabilities)', async () => {
    const r = await pull.pull('test-writer', 'get_schema', { name: 'nonexistent' });
    assert.notStrictEqual(r.scoped, false, 'discovery not scope-refused');
  });
  await test('T-003', 'the WRITE boundary still holds — pull never grants write', () => {
    const ac = require(path.join(ROOT, 'lib/gemini-toolbox/agent-contracts'));
    assert.strictEqual(ac.agentCan('test-writer', 'write_patch'), false);
    assert.strictEqual(ac.agentCan('diagnostician', 'write_patch'), false);
  });
  await test('T-004', 'an unknown pull tool returns a stated miss (§1.2)', async () => {
    const r = await pull.pull('code-architect', 'get_nonsense', {});
    assert.strictEqual(r.ok, false); assert.ok(r.reason);
  });
  await test('T-005', 'the tool index populates over time from real pulls', async () => {
    idx._resetForTest();
    await pull.pull('code-architect', 'query_capability', { intent: 'health' });
    await pull.pull('code-architect', 'get_schema', { name: 'missing' });
    const s = idx.summary();
    assert.ok(s.tools >= 1 && s.totalCalls >= 2, 'index recorded the pulls');
  });
  await test('T-006', 'the index records EDGE CASES (a failed/refused pull)', () => {
    idx._resetForTest();
    idx.record({ tool: 'get_schema', intent: 'x', ok: false, reason: 'no schema', agentId: 'a' });
    const ec = idx.list({ withEdgeCases: true });
    assert.ok(ec.length >= 1 && ec[0].edgeCases.length >= 1, 'edge case recorded');
  });
  await test('T-007', 'the index tracks consumers + intents over time', () => {
    idx._resetForTest();
    idx.record({ tool: 'get_chunk', intent: 'parse', ok: true, agentId: 'code-architect' });
    idx.record({ tool: 'get_chunk', intent: 'refactor', ok: true, agentId: 'refactorer' });
    const t = idx.get('get_chunk');
    assert.strictEqual(t.consumers.length, 2, 'two consumers');
    assert.strictEqual(t.intents.length, 2, 'two intents');
  });
  await test('T-008', 'register seeds a tool with file/dir/provides', () => {
    idx._resetForTest();
    idx.register({ id: 'get_seam', file: 'lib/agent-pull.js', dir: 'lib', provides: 'seam contracts' });
    assert.strictEqual(idx.get('get_seam').provides, 'seam contracts');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
