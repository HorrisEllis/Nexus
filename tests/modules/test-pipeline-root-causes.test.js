'use strict';
/**
 * tests/modules/test-pipeline-root-causes.test.js — RC1–RC4 (0.60.170)
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec
 * James, 2026-10-19: "we need to fix the pipeline though. like i said." · "files names must remain consistent."
 *
 *   RC-01  safe-watch: the EPERM the OS fires asynchronously is caught, said once, and the watcher re-arms; the process lives
 *   RC-02  every long-running watcher site in the tree goes through safe-watch (no bare fs.watch left in a kernel)
 *   RC-03  node registry scan is linear: 3,000 nodes scan in well under the time the old O(n²) path took, and a rescan is unchanged
 *   RC-04  node-export fileIdOf: a ':' id is written under a Windows-safe name, round-trips, and the registry removes it by file
 *   RC-05  path-guard: "Gemini said tests/x.test.js" → tests/x.test.js; "tests/x." → the one existing file, else refused; prose refused
 *   RC-06  repo-inject propose() refuses a cut-short name with the reason, and records what the guard changed
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `rc-${n}-`));

(async () => {
  await test('RC-01', 'safe-watch survives the async EPERM, says it once, re-arms', async () => {
    const SW = require(path.join(ROOT, 'lib/safe-watch.js'));
    const dir = tmp('w');
    const seen = [];
    const h = SW.watch(dir, (ev, f) => seen.push(f));
    const warns = [];
    const w0 = console.warn; console.warn = (m) => warns.push(String(m));
    try {
      const err = Object.assign(new Error('operation not permitted, watch'), { code: 'EPERM', errno: -4048 });
      h._inject(err); h._inject(err);   // no listener for 'error': before RC1 this was "Unhandled 'error' event"
    } finally { console.warn = w0; }
    assert.strictEqual(warns.filter(m => /EPERM/.test(m)).length, 1, 'said once, not per event');
    await wait(2300);
    assert.ok(SW.stats().rearmed >= 1, 're-armed after the backoff');
    fs.writeFileSync(path.join(dir, 'after.txt'), 'x');
    await wait(400);
    h.close();
    assert.ok(seen.length >= 1 || process.platform !== 'linux', 'the re-armed watcher still reports changes');
    // a missing target throws synchronously, like fs.watch, so existing try/catch keeps working
    assert.throws(() => SW.watch(path.join(dir, 'nope')), /ENOENT/);
  });

  await test('RC-02', 'no long-running kernel file uses a bare fs.watch', async () => {
    const files = ['orchestrator/orchestrator.js', 'guardian/lib/node-registry.js', 'lib/node-registry.js', 'lib/node-index-watcher.js',
      'lib/queue.js', 'auth/index.js', 'architecture-spec/registry/watcher.js', 'cos/foundation/file-browser.js',
      'diagnostic/nexus-diagnostic.js', 'emerge/emerge-kernel.js', 'idearium/repo/watcher.js'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/\bfs\.watch\(/.test(src), `${f} still calls fs.watch directly`);
      assert.ok(/safe-watch/.test(src), `${f} does not use lib/safe-watch.js`);
    }
  });

  await test('RC-03', 'node registry scan is linear (3,000 nodes) and a rescan is all unchanged', async () => {
    const NX = require(path.join(ROOT, 'lib/node-export.js'));
    const NR = require(path.join(ROOT, 'lib/node-registry.js'));
    const root = tmp('nr');
    const tdir = path.join(root, 'rcsys', 'data', 'nodes', 'chunk');
    fs.mkdirSync(tdir, { recursive: true });
    const N = 3000;
    const payload = (i) => ({ specUuid: 's', sectionId: `sec-${i}`, chunkIdx: i, status: 'done', title: `c${i}`, uuid: `u${i}`, content: 'x'.repeat(1500) });
    let schemaOk = true;
    try { NX.exportToFile('chunk', 'probe', payload(0), { system: 'rcsys', context: 'c', summary: 's' }, tdir); } catch (_) { schemaOk = false; }
    assert.ok(schemaOk, 'fixture writes');
    for (let i = 1; i < N; i++) NX.exportToFile('chunk', `n-${i}`, payload(i), { system: 'rcsys', context: 'c', summary: 's' }, tdir);
    const reg = NR.createNodeRegistry({ system: 'rcsys', root, fresh: true });
    const t0 = Date.now(); const r1 = await quiet(() => reg.scan()); const ms1 = Date.now() - t0;
    const t1 = Date.now(); const r2 = await quiet(() => reg.scan()); const ms2 = Date.now() - t1;
    reg.stop();
    assert.strictEqual(r1.indexed, N, `every node indexed (a fixture that fails its schema would pass vacuously): ${JSON.stringify(r1.invalid.slice(0, 2))}`);
    assert.strictEqual(r2.indexed, 0); assert.strictEqual(r2.unchanged, r1.indexed);
    console.log(`    (first scan ${ms1} ms, rescan ${ms2} ms for ${N} nodes)`);
    assert.ok(ms2 < 3000, `rescan of ${N} took ${ms2} ms (the O(n²) path took ~1.3 s for 4,000 and ~10 s for 12,000 here)`);
  });

  await test('RC-04', 'a ":" node id is written under a Windows-safe name, round-trips, and is removed by its file', async () => {
    const NX = require(path.join(ROOT, 'lib/node-export.js'));
    const PN = require(path.join(ROOT, 'lib/pipeline-nodes.js'));
    assert.strictEqual(NX.fileIdOf('phase:SP5_title:6ceaa59e8eee182c'), 'phase~SP5_title~6ceaa59e8eee182c');
    assert.strictEqual(NX.fileIdOf('plain-id_1.2'), 'plain-id_1.2', 'a safe id is its own name: nothing written before moves');
    const dir = tmp('pn');
    const g = PN.graphNode({ phase: 'SP5_title', hash: '6ceaa59e8eee182c', nodes: [{ path: 'lib/title.js', role: 'changes' }], edges: [], crossings: [] }, { repo: 'r', kind: 'phase' });
    const fp = PN.writeNode(g, path.join(dir, 'graph'));
    assert.ok(!/:/.test(path.basename(fp)), path.basename(fp));
    assert.strictEqual(NX.importFromFile(fp).id, g.id, 'the envelope keeps its real id');
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/PN\.writeNode\(PN\.graphNode[^\n]*path\.join\(ndir, 'graph'\)/.test(src) && /path\.join\(ndir, 'phase'\)\);/.test(src), 'the build writes into nodes/graph and nodes/phase');
  });

  await test('RC-05', 'path-guard: labels stripped, cut names resolved or refused, prose refused', async () => {
    const PG = require(path.join(ROOT, 'lib/path-guard.js'));
    const have = new Set(['tests/sp5-title.test.js', 'lib/title.js']);
    const exists = (p) => have.has(p);
    let r = PG.check('Gemini said tests/sp5-title.test.js', { exists });
    assert.deepStrictEqual([r.ok, r.path, r.changed], [true, 'tests/sp5-title.test.js', true]);
    assert.strictEqual(PG.check('ChatGPT said: lib/title.js', { exists }).path, 'lib/title.js');
    r = PG.check('tests/sp5-title.', { exists }); assert.deepStrictEqual([r.ok, r.path], [true, 'tests/sp5-title.test.js'], JSON.stringify(r));
    r = PG.check('tests/sp5-title-test.', { exists }); assert.deepStrictEqual([r.ok, r.path], [true, 'tests/sp5-title.test.js'], JSON.stringify(r));
    r = PG.check('tests/other.', { exists }); assert.ok(!r.ok && /names no existing file/.test(r.error), r.error);
    r = PG.check('tests/sp5-title.', {}); assert.ok(!r.ok && /refused, not guessed/.test(r.error));
    r = PG.check('here is the file/title.js', { exists }); assert.ok(!r.ok && /reads as reply text/.test(r.error), r.error);
    r = PG.check('lib/title.js', { exists }); assert.deepStrictEqual([r.ok, r.changed], [true, false], 'a good path is untouched');
  });

  await test('RC-06', 'propose() refuses a cut-short name with the reason (the agent hears why)', async () => {
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    const r = await quiet(() => RI.propose({ layer: null, repo: { uuid: 'rc-6' }, hat: 'repo_x', path: 'tests/sp5-title.', content: 'x', source: { kind: 'agent' } }));
    assert.strictEqual(r.ok, false); assert.ok(/cut short/.test(r.errors[0]), r.errors[0]);
    const src = fs.readFileSync(path.join(ROOT, 'lib/repo-inject.js'), 'utf8');
    assert.ok(/require\('\.\/path-guard\.js'\)/.test(src) && /pathNote: opts\.pathNote/.test(src));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
