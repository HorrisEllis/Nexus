'use strict';
// §loom doc-generator (R6) — the gate: regenerating after a real change reflects it, zero manual edit.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }

process.env.LOOM_PORT = '13803';

(async () => {
  const loomModule = require(path.join(__dirname, '../..', 'loom/server.js'));
  const gen = require(path.join(__dirname, '../..', 'loom/doc-generator'));
  process.env.LOOM_URL = 'http://127.0.0.1:13803';
  await new Promise(r => setTimeout(r, 400));

  try {
    await test('T-001', 'generateSystemDoc(architect) produces real markdown with the real hook table, not a fabricated one', async () => {
      const doc = await gen.generateSystemDoc('architect');
      assert.ok(doc.includes('| architect-hook-register |'));
      assert.ok(doc.includes('deprecated'));
      assert.ok(doc.includes('2/3 active'));
    });

    await test('T-002', 'THE GATE — regenerating after a real, live state change reflects it with zero manual doc edit', async () => {
      // Real state change, via the same route the UI itself would use to
      // observe state — not a mock, an actual change to what the endpoint returns.
      const before = await gen.generateSystemDoc('architect');
      assert.ok(before.includes('2/3 active'));

      const hooksPath = path.join(__dirname, '../..', 'hooks/architect.hooks.js');
      const original = fs.readFileSync(hooksPath, 'utf8');
      try {
        const mutated = original.replace("status:'active', updatedAt:'2026-06-11T17:30:00Z' },\n  { id:'arch-hook-scan-0003'", "status:'test-mutated', updatedAt:'2026-06-11T17:30:00Z' },\n  { id:'arch-hook-scan-0003'");
        assert.notStrictEqual(mutated, original, 'the test mutation itself must actually change something, or this test proves nothing');
        fs.writeFileSync(hooksPath, mutated);
        delete require.cache[require.resolve(hooksPath)];

        const after = await gen.generateSystemDoc('architect');
        assert.ok(after.includes('1/3 active'), 'the regenerated doc must reflect the real change — this is the actual gate');
        assert.ok(!after.includes('2/3 active'), 'must not still show the stale prior state');
      } finally {
        fs.writeFileSync(hooksPath, original);
        delete require.cache[require.resolve(hooksPath)];
      }

      const reverted = await gen.generateSystemDoc('architect');
      assert.ok(reverted.includes('2/3 active'), 'reverting the real state and regenerating must produce the original doc again — a closed, honest loop');
    });

    await test('T-003', 'a system with no declared hooks.js gets an honest doc section, not fabricated hooks', async () => {
      const doc = await gen.generateSystemDoc('loom');
      assert.ok(/no hand-declared/i.test(doc));
    });

    await test('T-004', 'generateOverview() produces a real overview from live phasemap + gaps data', async () => {
      const doc = await gen.generateOverview();
      assert.ok(/# NEXUS/.test(doc));
      assert.ok(/phases/i.test(doc));
      assert.ok(/open right now/i.test(doc));
    });
  } finally {
    if (loomModule && loomModule.server) await new Promise(r => loomModule.server.close(r));
  }

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
