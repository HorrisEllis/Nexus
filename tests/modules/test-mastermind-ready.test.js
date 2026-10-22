'use strict';
/**
 * tests/modules/test-mastermind-ready.test.js — what Idearium needed to work on MASTERMIND (0.60.200)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD18_mastermind_ready).
 * James, 2026-10-21: "i just want you to add what idearium needs to work on mastermind."
 * Found by driving his MASTERMIND-v0_1_50 zip through Idearium's real API (import → index → roadmap → registry → graph → build);
 * each check is one thing that run showed broken, on fixtures with MASTERMIND's shape.
 *
 *   MR-01  a project zipped inside one folder (mm9/) lands at the repo's root, said as `wrapper`; a zip with files at its root,
 *          or two top folders, keeps its paths; only the project-import doors ask for it
 *   MR-02  several roadmap-named files: each counted, one naming no phase left out (said), the JSON-backed one primary
 *   MR-03  proof's "tests pass" runs the project's own runner (node tests/run-all.js) when package.json has no test script
 *   MR-04  integrity notes for a large project fit the notes store; one note that cannot be written does not stop the rest
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

(async () => {
  console.log('\n⬡  what Idearium needed to work on MASTERMIND\n');

  await test('MR-01', 'one wrapping folder is dropped and said; a root file or two folders keep their paths; only project imports ask', () => {
    const Zip = require(path.join(ROOT, 'lib/zip.js'));
    const { extractZipToFiles } = require(path.join(ROOT, 'lib/zip-ingest.js'));
    const zipOf = (files) => { const z = new Zip(); for (const [n, c] of files) z.addFile(n, Buffer.from(c)); return z.toBuffer(); };
    const opts = { maxFiles: 100, maxBytesPerFile: 100000, maxTotalBytes: 1e7, stripWrapper: true };
    const a = extractZipToFiles({ ...opts, buf: zipOf([['mm9/package.json', '{}'], ['mm9/main.js', 'x'], ['mm9/tests/run-all.js', 'y']]) });
    assert.strictEqual(a.wrapper, 'mm9');
    assert.deepStrictEqual(a.realFiles.map(f => f.path).sort(), ['main.js', 'package.json', 'tests/run-all.js']);
    const b = extractZipToFiles({ ...opts, buf: zipOf([['README.md', 'r'], ['mm9/main.js', 'x']]) });
    assert.deepStrictEqual([b.wrapper, b.realFiles.map(f => f.path).sort()], [null, ['README.md', 'mm9/main.js']]);
    const c = extractZipToFiles({ ...opts, buf: zipOf([['a/x.js', 'x'], ['b/y.js', 'y']]) });
    assert.strictEqual(c.wrapper, null);
    const d = extractZipToFiles({ ...opts, stripWrapper: false, buf: zipOf([['mm9/main.js', 'x']]) });
    assert.deepStrictEqual([d.wrapper, d.realFiles[0].path], [null, 'mm9/main.js'], 'off unless asked');
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.strictEqual((api.match(/stripWrapper:\s+true/g) || []).length, 2, 'project-import.finalize and repo.import-archive');
  });

  await test('MR-02', 'nine roadmap-named files: counted, the empty ones left out and said, the JSON-backed one primary', async () => {
    const RIm = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/roadmap-import.js')).href);
    const files = {
      'phasemap/phases.json': JSON.stringify({ phases: [{ id: 'P0', name: 'ground' }, { id: 'P1', name: 'substrate' }] }),
      'phasemap/PHASEMAP.md': '## P0 — GROUND\n',
      'docs/PHASEMAP.md': '## P0 — GROUND\n## P1 — SUBSTRATE\n## P2 — CONTRACT\n',
      'unintegrated/old/Roadmap.md': '# Roadmap\n\nsome prose, no phases\n',
    };
    const r = RIm.rankRoadmaps(RIm.findRoadmaps(Object.keys(files)), (p) => files[p] || null);
    assert.deepStrictEqual(r.roadmaps.map(x => [x.dir, x.phases, x.primary]), [['phasemap', 2, true], ['docs', 3, false]]);
    assert.deepStrictEqual(r.ignored.map(x => [x.dir, x.why]), [['unintegrated/old', 'names no phase']]);
  });

  await test('MR-03', 'no test script: proof runs the project\'s own runner and says which; no runner either: said', async () => {
    const P = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/proof-run.js')).href);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr03-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'mastermind', scripts: { start: 'electron .' } }));
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests/run-all.js'), "console.log('All runnable suites passed — 51 run, 3 skipped, 54 total');\n");
    const ok = await P.runProof({ repoDir: dir, write: false, conditions: [{ says: 'All tests pass', check: { kind: 'tests', contains: 'suites passed' } }] });
    const r0 = ok.run.results[0];
    assert.ok(r0.met, JSON.stringify(r0));
    assert.ok(/`node tests\/run-all\.js` → exit 0/.test(r0.why || r0.evidence || JSON.stringify(r0)), JSON.stringify(r0));
    fs.writeFileSync(path.join(dir, 'tests/run-all.js'), 'process.exit(1)\n');
    const bad = await P.runProof({ repoDir: dir, write: false, conditions: [{ says: 'All tests pass', check: { kind: 'tests' } }] });
    assert.ok(!bad.run.results[0].met, 'a failing runner fails');
    fs.rmSync(path.join(dir, 'tests'), { recursive: true });
    const none = await P.runProof({ repoDir: dir, write: false, conditions: [{ says: 'All tests pass', check: { kind: 'tests' } }] });
    assert.ok(!none.run.results[0].met && /no way to run this project's tests was found/.test(JSON.stringify(none.run.results[0])), JSON.stringify(none.run.results[0]));   // 0.60.201: any project's ways listed
  });

  await test('MR-04', 'a large project\'s integrity notes fit; one that cannot be written does not stop the rest', () => {
    const IC = require(path.join(ROOT, 'lib/import-checks.js'));
    const N = require(path.join(ROOT, 'lib/repo-notes.js'));
    const repoUuid = `mr04-${Date.now().toString(36)}`;
    const many = Array.from({ length: 300 }, (_, i) => `dir${i}/very/long/path/to/a/duplicated/file-${i}.js`);
    const result = { checks: [
      { id: 'CK-008', name: 'duplicate files', ok: false, count: 40, severity: 'warn', items: Array.from({ length: 40 }, () => ({ paths: many })) },
      { id: 'CK-002', name: 'requires resolve', ok: false, count: 143, severity: 'error', items: Array.from({ length: 143 }, (_, i) => ({ path: `lib/m${i}.js`, line: i, spec: './gone.js' })) },
    ] };
    const out = IC.toNotes(repoUuid, result);
    assert.deepStrictEqual([out.added, out.failed], [2, undefined], JSON.stringify(out));
    const notes = N.list({ repoUuid, tag: 'integrity', limit: 10 });
    assert.ok(notes.every(n => n.body.length <= 20000) && notes.some(n => /…/.test(n.body)), notes.map(n => n.body.length).join(','));
    const realAdd = N.add; let calls = 0;
    N.add = (o) => { if (++calls === 1) throw new Error('store refused'); return realAdd(o); };
    try {
      const out2 = IC.toNotes(`${repoUuid}-b`, result);
      assert.deepStrictEqual([out2.added, out2.failed], [1, ['CK-008: store refused']]);
    } finally { N.add = realAdd; }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
