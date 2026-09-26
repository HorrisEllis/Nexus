'use strict';
/**
 * tests/modules/test-runtime-proof.js — idearium/repo/runtime-proof.js.
 * Real repo directories, the real import pipeline, and REAL node processes running the
 * tests under V8 coverage: nothing about execution is simulated. The synthetic input is
 * only the unit test of executedLines(), which takes coverage data as its argument.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}

(async () => {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const rp = await import(path.join(ROOT, 'idearium/repo/runtime-proof.js'));
  const lazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const workQueue = require(path.join(ROOT, 'lib/work-queue.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rproof-t-'));
  const NODE_DIR = path.join(ROOT, 'idearium/data/nodes/repository'); const made = [];

  async function makeRepo(name, files) {
    const dir = path.join(tmp, name); made.push(name);
    for (const [rel, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), c); }
    const repo = { uuid: name, name, files: Object.keys(files).map(p => ({ path: p })) };
    pipeline.runImportPipeline(repo, dir, { runtimeProof: false }); await workQueue.get(lazy.QUEUE_NAME).drain();
    return { repo, dir };
  }
  const fn = (name, body) => `function ${name}(a) {\n  const v = ${body};\n  return v;\n}\n\n`;
  const FILES = {
    'src/calc.js': fn('add', 'a + 1') + fn('unusedFn', 'a * 2') + fn('alsoUnused', 'a - 1') + 'module.exports = { add, unusedFn, alsoUnused };\n',
    'src/other.js': fn('loose', 'a - 1') + 'module.exports = { loose };\n',
    'src/never.js': fn('never', 'a * 9') + 'module.exports = { never };\n',
    'src/util.py': 'def helper(x):\n    y = x + 1\n    return y\n',
    'tests/calc.test.js': "const c = require('../src/calc.js');\nrequire('assert').strictEqual(c.add(1), 2);\n",
    'tests/other.test.js': "const c = require('../src/calc.js');\nconst o = require('../src/other.js');\nc.add(5);\no.loose(3);\nthrow new Error('deliberate failure');\n",
  };
  const A = await makeRepo('rp-a', FILES);
  const chunkAt = (proof, file, line) => proof.chunks.find(c => c.file === file && c.range && c.range.start_line <= line && line <= c.range.end_line);
  const before = process.env.NODE_V8_COVERAGE;
  const res = rp.computeRuntimeProof({ repoDir: A.dir, repository: 'rp-a' });
  const P = res.proof;

  console.log('\n── running real tests under V8 coverage ─────────────────');
  await t('the proof is computed and written to proof.json', () => {
    assert.strictEqual(res.ok, true, res.error);
    assert.ok(fs.existsSync(path.join(A.dir, 'proof.json')));
    assert.strictEqual(P.version, 1);
  });
  await t('each test file is really run: calc passes, other fails, with the failure text', () => {
    const by = Object.fromEntries(P.tests.map(x => [x.file, x]));
    assert.strictEqual(by['tests/calc.test.js'].status, 'passed');
    assert.strictEqual(by['tests/other.test.js'].status, 'failed');
    assert.ok(/deliberate failure/.test(by['tests/other.test.js'].error));
    assert.ok(by['tests/calc.test.js'].scriptsCovered > 0, 'no coverage was collected');
  });
  await t('a function a passing test CALLED is proven (passed), with the test named', () => {
    const c = chunkAt(P, 'src/calc.js', 2);
    assert.strictEqual(c.proof, 'passed', JSON.stringify(c));
    assert.ok(c.executedBy.some(e => e.test === 'tests/calc.test.js' && e.result === 'passed' && e.linesRan > 0));
  });
  await t('a function in the SAME FILE that no test called is `none` (per-chunk, not per-file)', () => {
    assert.strictEqual(chunkAt(P, 'src/calc.js', 7).proof, 'none');
    assert.strictEqual(chunkAt(P, 'src/calc.js', 12).proof, 'none');
  });
  await t('run by both a passing and a failing test: passed, and both are listed', () => {
    const c = chunkAt(P, 'src/calc.js', 2);
    assert.deepStrictEqual(c.executedBy.map(e => `${e.test}:${e.result}`).sort(), ['tests/calc.test.js:passed', 'tests/other.test.js:failed']);
  });
  await t('a chunk that ran ONLY under a failing test is `failed`', () => assert.strictEqual(chunkAt(P, 'src/other.js', 2).proof, 'failed'));
  await t('a file no test loads is `none`; a python file is `unsupported` (not failed); test files are `test`', () => {
    assert.strictEqual(chunkAt(P, 'src/never.js', 2).proof, 'none');
    const py = P.chunks.find(c => c.file === 'src/util.py'); assert.strictEqual(py.proof, 'unsupported'); assert.ok(/python/i.test(py.reason));
    assert.ok(P.chunks.filter(c => c.file.startsWith('tests/')).every(c => c.proof === 'test'));
  });
  await t('the summary counts every chunk exactly once', () => {
    assert.strictEqual(Object.values(P.summary).reduce((a, b) => a + b, 0), P.chunks.length);
    assert.ok(P.summary.passed >= 1 && P.summary.failed >= 1 && P.summary.none >= 3 && P.summary.unsupported >= 1);
  });
  await t('running it did not leave NODE_V8_COVERAGE in this process\'s environment', () => assert.strictEqual(process.env.NODE_V8_COVERAGE, before));

  console.log('\n── proof is tied to the chunk hash ──────────────────────');
  await t('right after computing, nothing is stale', () => {
    const r = rp.readRuntimeProof(A.dir); assert.strictEqual(r.staleCount, 0);
  });
  fs.writeFileSync(path.join(A.dir, 'src/calc.js'), FILES['src/calc.js'].replace('a + 1', 'a + 100'));
  // 0.39.246 — this suite drives proof itself; the import's own auto-proof
  // would erase the stale window it tests, so it is switched off here.
  pipeline.runImportPipeline(A.repo, A.dir, { runtimeProof: false }); await workQueue.get(lazy.QUEUE_NAME).drain();
  await t('after the code CHANGES and is re-indexed, the old proof for it is stale; untouched chunks stay valid', () => {
    const r = rp.readRuntimeProof(A.dir);
    const oldAdd = r.chunks.find(c => c.file === 'src/calc.js' && c.proof === 'passed');
    assert.strictEqual(oldAdd.stale, true, 'a proof survived an edit to the code it vouched for');
    assert.strictEqual(r.chunks.find(c => c.file === 'src/never.js').stale, false);
  });
  await t('recomputing after the change is fresh again and the test really ran the NEW code', () => {
    // add() now returns a+100, the test expects 2 -> the test fails, and add is proven only as `failed`
    const p2 = rp.computeRuntimeProof({ repoDir: A.dir }).proof;
    assert.strictEqual(p2.tests.find(x => x.file === 'tests/calc.test.js').status, 'failed');
    assert.strictEqual(chunkAt(p2, 'src/calc.js', 2).proof, 'failed');
    assert.strictEqual(rp.readRuntimeProof(A.dir).staleCount, 0);
  });

  console.log('\n── the edges ────────────────────────────────────────────');
  await t('a repo with no runnable tests: every JS chunk is `no_tests`, not `none` and not passed', async () => {
    const B = await makeRepo('rp-b', { 'src/a.js': fn('f', 'a + 1') + 'module.exports = { f };\n' });
    const p = rp.computeRuntimeProof({ repoDir: B.dir }).proof;
    assert.ok(p.chunks.every(c => c.proof === 'no_tests'), JSON.stringify(p.summary));
  });
  await t('a test that never returns is stopped at the timeout, reported failed, and does not hang the run', async () => {
    const C = await makeRepo('rp-c', { 'src/a.js': fn('f', 'a + 1') + 'module.exports = { f };\n', 'tests/hang.test.js': "require('../src/a.js').f(1);\nwhile (true) {}\n" });
    const t0 = Date.now(); const p = rp.computeRuntimeProof({ repoDir: C.dir, timeoutMs: 1200 }).proof;
    assert.ok(Date.now() - t0 < 8000);
    assert.strictEqual(p.tests[0].status, 'failed'); assert.ok(/timed out/.test(p.tests[0].error), p.tests[0].error);
  });
  await t('a repo that has not been indexed is refused with a reason', () => {
    const d = path.join(tmp, 'bare'); fs.mkdirSync(d, { recursive: true });
    const r = rp.computeRuntimeProof({ repoDir: d }); assert.strictEqual(r.ok, false); assert.ok(/not been indexed/.test(r.error));
  });
  await t('no proof stored yet reads as null, not as an empty success', () => assert.strictEqual(rp.readRuntimeProof(path.join(tmp, 'bare')), null));
  await t('executedLines: comments and blanks are not candidates; a nested zero-count range is not executed', () => {
    const text = '// header\nfunction a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n';
    const off = (line) => text.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    const cov = { functions: [{ ranges: [{ startOffset: 0, endOffset: text.length, count: 1 }] }, { ranges: [{ startOffset: off(6), endOffset: text.length, count: 0 }] }] };
    const { ran, candidates } = rp.executedLines(text, cov);
    assert.deepStrictEqual(candidates, [2, 3, 4, 6, 7, 8]);
    assert.deepStrictEqual([...ran].sort((x, y) => x - y), [2, 3, 4]);
  });

  console.log('\n── wiring ───────────────────────────────────────────────');
  await t('proof.json survives materialize (it is in the PRESERVE set), and isTestPath is L6\'s own', () => {
    assert.ok(/'proof\.json'/.test(fs.readFileSync(path.join(ROOT, 'idearium/repo/index.js'), 'utf8')));
    assert.strictEqual(typeof lazy.isTestPath, 'function'); assert.ok(lazy.isTestPath('tests/a.test.js') && !lazy.isTestPath('src/a.js'));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  for (const u of made) fs.rmSync(path.join(NODE_DIR, `${u}.repository`), { force: true });
  console.log(`\n${fail ? '✗' : '✓'} runtime-proof: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
