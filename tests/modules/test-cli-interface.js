'use strict';
// The --cli interface: help menu + routes to the co-pilot additions.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const cli = require(path.join(__dirname, '../..', 'lib/nexus-cli-interface'));

(async () => {
  await test('T-001', 'help returns the menu', async () => {
    const h = await cli.handle('help');
    assert.ok(h.includes('what can you do') && h.includes('rundown') && h.includes('who am i'));
  });
  await test('T-002', '"what can you do" routes to real capabilities', async () => {
    const r = await cli.handle('what can you do');
    assert.ok(/\d+ .*capabilities/.test(r), 'lists real capabilities');
  });
  await test('T-003', 'rundown routes to nexus-awareness', async () => {
    const r = await cli.handle('rundown');
    assert.ok(/NEXUS rundown/.test(r));
  });
  await test('T-004', 'roadmap routes to the loom phasemap section', async () => {
    const r = await cli.handle('roadmap');
    assert.ok(/phases across .* phasemaps/.test(r));
    const c = await cli.handle('roadmap cortex');
    assert.ok(/cortex:.*phases/.test(c));
  });
  await test('T-005', 'who am i routes to the self-model', async () => {
    const r = await cli.handle('who am i');
    assert.ok(r.length > 0);
  });
  await test('T-006', 'exit returns the exit sentinel', async () => {
    assert.strictEqual(await cli.handle('exit'), '__EXIT__');
    assert.strictEqual(await cli.handle('quit'), '__EXIT__');
  });
  await test('T-007', 'unknown input degrades gracefully (never throws)', async () => {
    const r = await cli.handle('zxcv asdf qwer');
    assert.ok(/help|Unrecognized|match/.test(r));
  });
  await test('T-008', 'empty line returns empty (no crash)', async () => {
    assert.strictEqual(await cli.handle(''), '');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
