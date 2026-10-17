'use strict';
/**
 * tests/modules/test-sync-off-thread.test.js — SW1–SW3 (0.60.124), from James's 0.60.122 boot log.
 * His words with it: the log itself, and the screenshots before it (every dock panel at "reading…", Home at "loading the
 * Nexus atlas…"). docs/2026-10-16-code-tab-rebuild-phasemap.spec addendum (g).
 *
 *   SW-01  the import pipeline in its own thread gives the same result as inline (state, files, chunks, symbols), its
 *          events come back, and it says it ran off the thread
 *   SW-02  while it runs on a real tree (this repo's lib/, several hundred files), the main thread keeps answering:
 *          the longest gap between 10 ms timers stays under 250 ms (inline, the same run holds the loop for its whole
 *          length: measured and printed, not asserted, since machines differ)
 *   SW-03  Guardian: a fresh sign-in wall holds a provider's queued jobs; an old wall, an ok, or no record does not
 *          (guardian/lib/provider-login.js holdsJobs — the 3-second flush loop in his log)
 *   SW-04  COS's system map: a rename refused with EPERM (Windows, another process on the file) is retried, then
 *          written in place, and said once — not "persist failed" thirty times in five seconds
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };

function copyTree(src, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-repo-'));
  for (const f of files) { const to = path.join(dir, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(src, f), to); }
  return dir;
}
function listJs(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|data/.test(e.name)) listJs(p, base, out); }
    else if (/\.(c?js)$/.test(e.name)) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
function gapMeter() {
  let last = Date.now(), max = 0;
  const t = setInterval(() => { const n = Date.now(); max = Math.max(max, n - last); last = n; }, 10);
  return { stop: () => { clearInterval(t); return Math.max(max, Date.now() - last); } };
}

(async () => {
  const IP = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/import-pipeline.js')).href);
  const libFiles = listJs(path.join(ROOT, 'lib')).map(f => `lib/${f}`);
  const small = libFiles.slice(0, 40);

  await test('SW-01', 'off the thread: the same result as inline, events forwarded, and it says so', async () => {
    const a = copyTree(ROOT, small), b = copyTree(ROOT, small);
    const repoA = { uuid: 'sw-a', name: 'sw', files: small.map(p => ({ path: p })) };
    const repoB = { ...repoA, uuid: 'sw-b' };
    const inline = await quiet(() => IP.runImportPipeline(repoA, a, { runtimeProof: false, lazyTests: false }));
    const events = [];
    const off = await quiet(() => IP.runImportPipelineOffThread(repoB, b, { runtimeProof: false, lazyTests: false, onEvent: (e) => events.push(e.type) }));
    assert.strictEqual(off.offThread, true, JSON.stringify(off).slice(0, 300));
    assert.strictEqual(off.state, inline.state);
    assert.deepStrictEqual([off.parse.total ?? off.parse.files, off.chunks.count, off.indexes.symbolCount], [inline.parse.total ?? inline.parse.files, inline.chunks.count, inline.indexes.symbolCount]);
    assert.ok(fs.existsSync(path.join(b, 'indexes', 'files.json')) && fs.existsSync(path.join(b, 'atlas.json')), 'the same files written');
    assert.ok(events.includes('repository:import:start') && events.includes('repository:import:ready'), events.slice(0, 5).join(' '));
  });

  await test('SW-02', `the main thread keeps answering while a real tree (${libFiles.length} files of lib/) is imported`, async () => {
    const a = copyTree(ROOT, libFiles), b = copyTree(ROOT, libFiles);
    const repoA = { uuid: 'sw-c', name: 'sw', files: libFiles.map(p => ({ path: p })) };
    const repoB = { ...repoA, uuid: 'sw-d' };
    let m = gapMeter(); let t0 = Date.now();
    await quiet(async () => { await new Promise(r => setTimeout(r, 30)); IP.runImportPipeline(repoA, a, { runtimeProof: false, lazyTests: false }); await new Promise(r => setTimeout(r, 30)); });
    const inlineGap = m.stop(), inlineMs = Date.now() - t0;
    m = gapMeter(); t0 = Date.now();
    const off = await quiet(() => IP.runImportPipelineOffThread(repoB, b, { runtimeProof: false, lazyTests: false }));
    const offGap = m.stop(), offMs = Date.now() - t0;
    console.log(`    · inline: ${inlineMs} ms, the loop held up to ${inlineGap} ms · in its thread: ${offMs} ms, the loop held up to ${offGap} ms`);
    assert.strictEqual(off.offThread, true);
    assert.ok(off.state === 'READY' || off.state === 'FAULT', off.state);
    assert.ok(offGap < 250, `the loop was held ${offGap} ms while the pipeline ran in its thread`);
  });

  await test('SW-03', 'Guardian holds queued jobs behind a fresh sign-in wall only', async () => {
    const PL = require(path.join(ROOT, 'guardian/lib/provider-login.js'));
    const now = Date.now();
    PL.set({ provider: 'claude', state: 'wall', at: now, text: 'Log in' });
    assert.ok(PL.holdsJobs('claude', now + 1000), 'a fresh wall holds');
    assert.strictEqual(PL.holdsJobs('claude', now + PL.HOLD_MS + 1), null, 'an old wall does not (a lost ok cannot strand a job)');
    assert.strictEqual(PL.holdsJobs('gemini', now), null, 'no record: nothing held');
    PL.set({ provider: 'claude', state: 'ok', at: now + 2000 });
    assert.strictEqual(PL.holdsJobs('claude', now + 3000), null, 'signed in: released');
    const src = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    assert.ok(/function flushQueuedJobs[\s\S]{0,900}holdsJobs\(provider\)[\s\S]{0,300}return;/.test(src), 'flushQueuedJobs asks before dispatching');
    assert.ok(/state === 'ok'\) \{[^\n]*flushQueuedJobs\(provider\)/.test(src), 'a reported sign-in flushes what waited');
  });

  await test('SW-04', 'COS system map: EPERM on rename → retried, written in place, said once', async () => {
    const { SystemMap } = require(path.join(ROOT, 'cos/host/system-map.js'));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sw-map-')), 'system-map.json');
    const m = new SystemMap({ mapFile: file });
    if (typeof m.load === 'function') m.load();
    const real = fs.renameSync; let tries = 0;
    const said = [], errs = [];
    const w = console.warn, er = console.error;
    console.warn = (s) => said.push(String(s)); console.error = (s) => errs.push(String(s));
    fs.renameSync = () => { tries++; const e = new Error('EPERM: operation not permitted, rename'); e.code = 'EPERM'; throw e; };
    try {
      SystemMap._saidLocked = 0;
      m.setVaultdState({ running: true, mark: 'first' });
      m.setVaultdState({ running: true, mark: 'second' });
    } finally { fs.renameSync = real; console.warn = w; console.error = er; }
    assert.ok(tries >= 8, `retried (${tries} attempts for two writes)`);
    assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).vaultdState.mark, 'second', 'the latest map is on disk');
    assert.deepStrictEqual(errs, [], 'no "persist failed"');
    assert.strictEqual(said.length, 1, said.join(' | '));
    assert.deepStrictEqual(fs.readdirSync(path.dirname(file)).filter(f => f.endsWith('.tmp')), [], 'no .tmp left behind');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
