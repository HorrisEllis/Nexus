'use strict';
/**
 * tests/modules/test-mco2-verify-deepening.js — idearium/repo/import-pipeline.js
 * L4-L5 (synchronous) + idearium/repo/verify-lazy.js L6-L8 (lazy) — MCO2.
 *
 * §12.2 — no fixture verification anywhere in this file. A real
 * multi-file repository (with a real broken import, a real failing
 * test, and a real interaction-contract.json) is written to a real temp
 * directory, the REAL import pipeline is run over it, the REAL shared
 * work-queue is drained, and verification.json + verification.lazy.json
 * are read back off real disk.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mco2-'));
const repoDir = path.join(tmp, 'repo');

const FILES = {
  // clean file, imported by a passing test — should be fully green
  'src/good.js':
    "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
  'src/good.test.js':
    "const assert = require('assert');\nconst { add } = require('./good.js');\nassert.strictEqual(add(2, 3), 5);\nconsole.log('good.test.js ok');\n",

  // a file that imports something broken — real L7 case: the import
  // RESOLVES (the file exists) but the target itself fails to parse.
  'src/consumer.js':
    "const { thing } = require('./broken.js');\nfunction use() { return thing; }\nmodule.exports = { use };\n",
  'src/broken.js':
    "function open() { return {  \n", // unbalanced brace — real parse failure

  // a real failing test, standalone-runnable — must be RUN, must FAIL,
  // must not be reported as passed.
  'src/bad.js':
    "function sub(a, b) { return a - b; }\nmodule.exports = { sub };\n",
  'src/bad.test.js':
    "const assert = require('assert');\nconst { sub } = require('./bad.js');\nassert.strictEqual(sub(5, 2), 999);\n", // real, deliberate failure

  // a non-JS test file — must be FOUND, must be 'skipped', never faked
  'tests/thing_test.py':
    "def test_thing():\n    assert True\n",

  // a real interaction-contract.json — L8 basis
  'interaction-contract.json': JSON.stringify({
    routes: [
      { method: 'GET', path: '/health' },       // declared AND present below
      { method: 'GET', path: '/api/not-real' },  // declared, NOT present anywhere
    ],
  }, null, 2),
  'src/server.js':
    "function route(req) { if (req.path === '/health') return { ok: true }; }\nmodule.exports = { route };\n",
};

for (const [rel, content] of Object.entries(FILES)) {
  const abs = path.join(repoDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

(async () => {
  const pipeline = await import('../../idearium/repo/import-pipeline.js');
  const verifyLazy = await import('../../idearium/repo/verify-lazy.js');
  const workQueue = require('../../lib/work-queue.js');

  const repo = { uuid: 'mco2-test-repo', files: Object.keys(FILES).map(p => ({ path: p })) };

  const result = pipeline.runImportPipeline(repo, repoDir);

  console.log('\n── synchronous: L4/L5 land in the same call ────────────');

  t('pipeline reaches READY, not FAULT', () => {
    assert.strictEqual(result.state, 'READY');
  });

  t('verification.json has L4 and L5 alongside L0-L3', () => {
    const levels = result.verification.tiers.map(x => x.level);
    assert.deepStrictEqual(levels, ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
  });

  t('L4 semantic consistency passes on a clean, self-consistent index', () => {
    const l4 = result.verification.tiers.find(x => x.level === 'L4');
    assert.strictEqual(l4.passed, true);
    assert.deepStrictEqual(l4.failures, []);
  });

  t('L5 dependency consistency passes — every resolved edge target is indexed', () => {
    const l5 = result.verification.tiers.find(x => x.level === 'L5');
    assert.strictEqual(l5.passed, true);
  });

  t('a broken.js parse failure does NOT fault the whole import (§10 unchanged)', () => {
    assert.strictEqual(result.parse.failed.some(f => f.path === 'src/broken.js'), true);
    assert.strictEqual(result.state, 'READY');
  });

  t('L4/L5 are also on disk in verification.json, not just in-memory', () => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(repoDir, 'verification.json'), 'utf8'));
    assert.strictEqual(onDisk.tiers.some(x => x.level === 'L5'), true);
  });

  t('the pipeline reports the lazy pass scheduled, not run inline', () => {
    assert.strictEqual(result.lazyVerification.scheduled, true);
    assert.ok(Array.isArray(result.lazyVerification.scopedTo));
  });

  t('verification.lazy.json exists immediately as pending — never a stale gap', () => {
    const pending = verifyLazy.readLazyVerification(repoDir);
    assert.ok(pending);
    assert.strictEqual(pending.status, 'pending');
  });

  console.log('\n── lazy: L6-L8, drained for real, off the request path ─');

  await workQueue.get(verifyLazy.QUEUE_NAME).drain();
  const lazy = verifyLazy.readLazyVerification(repoDir);

  t('lazy pass finished with a real status, not stuck pending', () => {
    assert.ok(['passed', 'partial', 'error'].includes(lazy.status));
  });

  t('L6 found all three test files, ran only the standalone-runnable JS ones', () => {
    const l6 = lazy.tiers.find(x => x.level === 'L6');
    assert.strictEqual(l6.testsFound, 3);
    assert.strictEqual(l6.testsRun, 2); // good.test.js + bad.test.js
    assert.strictEqual(l6.testsSkipped, 1); // thing_test.py — no standalone runner
  });

  t('L6 actually RAN bad.test.js and reports it failed — never faked as passed', () => {
    const l6 = lazy.tiers.find(x => x.level === 'L6');
    const bad = l6.results.find(r => r.file === 'src/bad.test.js');
    assert.strictEqual(bad.status, 'failed');
    assert.ok(bad.error && bad.error.length > 0);
  });

  t('L6 reports good.test.js passed and thing_test.py skipped with a stated reason', () => {
    const l6 = lazy.tiers.find(x => x.level === 'L6');
    const good = l6.results.find(r => r.file === 'src/good.test.js');
    const py = l6.results.find(r => r.file === 'tests/thing_test.py');
    assert.strictEqual(good.status, 'passed');
    assert.strictEqual(py.status, 'skipped');
    assert.ok(py.reason.includes('python'));
  });

  t('L6 overall passed:false because at least one real test failed', () => {
    const l6 = lazy.tiers.find(x => x.level === 'L6');
    assert.strictEqual(l6.passed, false);
  });

  t('L7 catches consumer.js -> broken.js: resolves, but target does not parse', () => {
    const l7 = lazy.tiers.find(x => x.level === 'L7');
    assert.strictEqual(l7.passed, false);
    assert.ok(l7.failures.some(f => f.from === 'src/consumer.js' && f.to === 'src/broken.js'));
  });

  t('L8 finds /health present and /api/not-real declared-but-missing', () => {
    const l8 = lazy.tiers.find(x => x.level === 'L8');
    assert.strictEqual(l8.status, 'checked');
    assert.strictEqual(l8.passed, false);
    assert.strictEqual(l8.missing.length, 1);
    assert.strictEqual(l8.missing[0].path, '/api/not-real');
  });

  t('overall lazy status is partial — L6 and L7 and L8 each have a real failure', () => {
    assert.strictEqual(lazy.status, 'partial');
  });

  console.log('\n── a repo with no interaction-contract.json ────────────');

  {
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mco2-noctract-'));
    const repoDir2 = path.join(tmp2, 'repo');
    fs.mkdirSync(repoDir2, { recursive: true });
    fs.writeFileSync(path.join(repoDir2, 'a.js'), 'module.exports = {};\n', 'utf8');
    const repo2 = { uuid: 'mco2-test-repo-2', files: [{ path: 'a.js' }] };
    pipeline.runImportPipeline(repo2, repoDir2);
    await workQueue.get(verifyLazy.QUEUE_NAME).drain();
    const lazy2 = verifyLazy.readLazyVerification(repoDir2);
    t('L8 is not_applicable, not failed, when no contract file exists', () => {
      const l8 = lazy2.tiers.find(x => x.level === 'L8');
      assert.strictEqual(l8.status, 'not_applicable');
      assert.strictEqual(l8.passed, true);
    });
    t('a repo with no contract can still reach overall status passed', () => {
      assert.strictEqual(lazy2.status, 'passed');
    });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n${fail ? '✗' : '✓'} mco2-verify-deepening: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
