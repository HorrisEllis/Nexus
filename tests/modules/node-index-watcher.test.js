'use strict';
// Real, live test for lib/node-index-watcher.js. James: "separated in a
// folder with the index a living updating directory, that listens in
// the data folder."
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { watchNodeFolder } = require('../../lib/node-index-watcher.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

async function main() {
  await test('NIW-001', 'a real, empty folder produces a real, empty index immediately, not an error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niw-empty-'));
    let received = null;
    const w = watchNodeFolder(dir, (idx) => { received = idx; });
    assert.deepStrictEqual(received, {});
    w.stop();
  });

  await test('NIW-002', 'a real node file added after the watcher starts is picked up live', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niw-live-'));
    const w = watchNodeFolder(dir, () => {});
    fs.writeFileSync(path.join(dir, 'realtool.uuid-123.tool'), 'real content');
    await new Promise(r => setTimeout(r, 200));
    const idx = w.getIndex();
    assert.ok(idx['realtool.uuid-123.tool'], 'expected the real, new file to appear in the live index');
    assert.strictEqual(idx['realtool.uuid-123.tool'].type, 'tool');
    w.stop();
  });

  await test('NIW-003', 'a nonexistent directory produces a real, honest empty index rather than throwing', () => {
    let received;
    const w = watchNodeFolder('/genuinely/nonexistent/path/xyz', (idx) => { received = idx; });
    assert.deepStrictEqual(received, {});
    w.stop();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
