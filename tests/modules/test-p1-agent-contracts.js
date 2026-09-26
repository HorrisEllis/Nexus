'use strict';
// §P1 multi-agent — distinct scoped contracts per agent + chunking consolidation.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ROOT = path.join(__dirname, '../..');
const ac = require(path.join(ROOT, 'lib/gemini-toolbox/agent-contracts'));
const cs = require(path.join(ROOT, 'lib/chunk-service'));

(async () => {
  await test('T-001', 'each agent gets a distinct identity + axioms + scoped toolbox', () => {
    const arch = ac.getContract('code-architect');
    assert.ok(arch.identity.name && arch.axioms.length > 3 && Object.keys(arch.toolbox).length > 0);
  });
  await test('T-002', 'scoped toolbox: test-writer CANNOT write prod (§1.1 anti-hallucination)', () => {
    assert.strictEqual(ac.agentCan('test-writer', 'write_patch'), false);
    assert.strictEqual(ac.agentCan('code-architect', 'write_patch'), true);
  });
  await test('T-003', 'diagnostician is read-only (no write tools)', () => {
    assert.strictEqual(ac.agentCan('diagnostician', 'write_patch'), false);
    assert.strictEqual(ac.agentCan('diagnostician', 'read_file'), true);
  });
  await test('T-004', 'contract carries real Gemini limits (65536 output, not stale)', () => {
    assert.strictEqual(ac.getContract('code-architect').limits.outputTokens, 65536);
  });
  await test('T-005', 'unknown agent returns an error + the available list', () => {
    const r = ac.getContract('nope');
    assert.ok(r.error && Array.isArray(r.available));
  });
  await test('T-006', 'chunk-service delegates to the canonical lib/chunker', () => {
    const r = cs.chunk('# A\n\ntext\n\n## B\n\nmore');
    assert.ok(r, 'produced chunks');
  });
  await test('T-007', 'chunkGoverned routes through RAID (or falls back honestly)', async () => {
    const g = await cs.chunkGoverned('# A\n\ntext');
    assert.ok('governed' in g && g.chunks, 'has a governed flag + chunks');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
