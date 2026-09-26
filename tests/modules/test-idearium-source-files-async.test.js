'use strict';
// §0.39.265 — writeSourceFilesAsync: same result as the sync writer, yields to
// the event loop while writing (nexus/core is ~1,800 files), keeps unchanged files.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
let passed = 0, failed = 0;
async function test(d, fn) { try { await fn(); console.log(`  ✓ ${d}`); passed++; } catch (e) { console.error(`  ✗ ${d}\n    ${e.message}`); failed++; } }
(async () => {
  const sf = await import('../../idearium/repo/source-files.js');
  const mk = (n) => Array.from({ length: n }, (_, i) => { const buf = Buffer.from(`file ${i}\n`); return { path: `d${i % 7}/f${i}.txt`, buffer: buf, sha256: crypto.createHash('sha256').update(buf).digest('hex') }; });
  await test('writes the same manifest as the sync writer', async () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'sfa-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'sfs-'));
    const files = mk(120);
    const ra = await sf.writeSourceFilesAsync(a, files), rb = sf.writeSourceFiles(b, files);
    assert.ok(ra.ok && rb.ok);
    assert.deepStrictEqual(ra.manifest.files, rb.manifest.files);
    assert.strictEqual(fs.readFileSync(path.join(a, 'd3/f10.txt'), 'utf8'), 'file 10\n');
  });
  await test('yields to the event loop while writing', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sfy-'));
    let ticks = 0; const t = setInterval(() => ticks++, 0);
    await sf.writeSourceFilesAsync(d, mk(400), { yieldEvery: 20 });
    clearInterval(t);
    assert.ok(ticks > 0, `timers ran during the write (${ticks})`);
  });
  await test('a second sync keeps unchanged files and rewrites only what changed', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sfu-'));
    const files = mk(50);
    await sf.writeSourceFilesAsync(d, files);
    const changed = files.map((f, i) => i === 3 ? { path: f.path, buffer: Buffer.from('new\n') } : f);
    const r = await sf.writeSourceFilesAsync(d, changed);
    assert.strictEqual(r.written, 1); assert.strictEqual(r.unchanged, 49);
    assert.strictEqual(fs.readFileSync(path.join(d, files[3].path), 'utf8'), 'new\n');
    fs.writeFileSync(path.join(d, files[5].path), 'x');   // damaged on disk (size differs) → rewritten
    const r2 = await sf.writeSourceFilesAsync(d, changed);
    assert.strictEqual(r2.written, 1);
    assert.strictEqual(fs.readFileSync(path.join(d, files[5].path), 'utf8'), 'file 5\n');
  });
  await test('nexus-self sync uses the async writer', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../idearium/repo/nexus-self.js'), 'utf8');
    assert.ok(/await rl\.writeSourcesAsync\(repoUuid, realFiles\)/.test(src));
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
