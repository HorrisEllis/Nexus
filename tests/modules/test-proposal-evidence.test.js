'use strict';
// PE-01..10 (0.60.75): a proposal is checked against the tests that exercise its file, before a person is asked to Apply it.
// James, 2026-10-16: "it needs to be tested before it gets there, and any tests needs to be informative for the agents."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-inject-'));   // sandbox: no background evidence unless a test asks
const ROOTREAL = path.resolve(__dirname, '..', '..');
const q = console.log; console.log = console.warn = () => {};
const TM = require('../../lib/test-map.js'), PE = require('../../lib/proposal-evidence.js'), RI = require('../../lib/repo-inject.js');
console.log = q;
let passed = 0, failed = 0;
const test = async (n, f) => { try { await f(); console.log('  ok ' + n); passed++; } catch (e) { console.log('  FAIL ' + n + '\n    ' + String(e.message).split('\n')[0]); failed++; } };
const mk = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-root-')); for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); } return d; };
const A = "function add(a, b) { return a + b; }\nfunction sub(a, b) { return a - b; }\nmodule.exports = { add, sub };\n";
const T = "const m = require('../lib/a.js');\nlet bad = 0;\nif (m.add(1, 2) !== 3) { console.log('✗ add(1,2) should be 3'); bad++; }\nif (m.sub(3, 1) !== 2) { console.log('✗ sub(3,1) should be 2'); bad++; }\nconsole.log(bad ? '0 passed, ' + bad + ' failed' : '2 passed, 0 failed'); process.exit(bad ? 1 : 0);\n";
const world = () => mk({ 'lib/a.js': A, 'tests/a.test.js': T, 'lib/unrelated.js': 'module.exports = 1;\n', 'tests/other.test.js': "console.log('1 passed, 0 failed');\n" });

(async () => {
  await test('PE-01 test-map: the real hat-seed.js is linked to its real tests, by how (requires/path/name); lib/test-map.js is not a test', () => {
    const r = TM.testsFor('lib/hat-seed.js', { root: ROOTREAL, fresh: true });
    assert.ok(r.some(x => x.file === 'tests/modules/test-hat-forge.js'), JSON.stringify(r)); assert.ok(r.every(x => ['requires', 'path', 'name'].includes(x.how))); assert.ok(!r.some(x => x.file === 'lib/test-map.js'));
  });
  await test('PE-02 test-map: a test that only reaches the file through another module is NOT listed (direct links only, said so)', () => {
    const d = mk({ 'lib/a.js': A, 'lib/b.js': "module.exports = require('./a.js');\n", 'tests/b.test.js': "require('../lib/b.js');\n" });
    assert.deepStrictEqual(TM.testsFor('lib/a.js', { root: d, fresh: true }), []); assert.strictEqual(TM.testsFor('lib/b.js', { root: d, fresh: true })[0].how, 'requires');
  });
  await test('PE-03 compare names the declarations and EXPORTS a proposal removes', () => {
    const c = PE.compare('lib/a.js', A, "function add(a, b) { return a + b; }\nmodule.exports = { add };\n");
    assert.deepStrictEqual(c.symbols.lost, ['sub']); assert.deepStrictEqual(c.exports.lost, ['sub']); assert.strictEqual(c.parseError, null);
  });
  await test('PE-04 an unparseable proposal: says so, and runs no test', async () => {
    const d = world(); const ev = await PE.gather({ path: 'lib/a.js', base: A, content: 'function add( {', root: d });
    assert.ok(ev.parseError); assert.strictEqual(ev.tests.ran, 0); assert.match(ev.summary, /DOES NOT PARSE/); assert.match(ev.summary, /no test was run/);
  });
  await test('PE-05 an identical file: the linked test runs on both and passes; the unlinked test is not run', async () => {
    const d = world(); const ev = await PE.gather({ path: 'lib/a.js', base: A, content: A, root: d });
    assert.strictEqual(ev.tests.linked, 1); assert.strictEqual(ev.tests.ran, 1); assert.strictEqual(ev.regressions, 0); assert.strictEqual(ev.tests.results[0].verdict, 'passes');
  });
  await test('PE-06 a parse-clean change that breaks the test: REGRESSION, with the test\'s own words and the removed export', async () => {
    const d = world(); const ev = await PE.gather({ path: 'lib/a.js', base: A, content: "function add(a, b) { return a + b; }\nmodule.exports = { add };\n", root: d });
    assert.strictEqual(ev.regressions, 1); assert.match(ev.summary, /EXPORTS REMOVED.*sub/); assert.match(ev.summary, /REGRESSION tests\/a\.test\.js/); assert.match(ev.summary, /sub is not a function/);
  });
  await test('PE-07 a fix is "fixed"; a test that fails on both is "already-failing" and is not blamed on the proposal', async () => {
    const d = world(); const broken = "function add(a, b) { return a - b; }\nfunction sub(a, b) { return a - b; }\nmodule.exports = { add, sub };\n";
    let ev = await PE.gather({ path: 'lib/a.js', base: broken, content: A, root: d }); assert.strictEqual(ev.fixed, 1); assert.strictEqual(ev.regressions, 0);
    ev = await PE.gather({ path: 'lib/a.js', base: broken, content: broken.replace('a - b; }\nfunction sub', 'a - b; }\nfunction sub'), root: d }); assert.strictEqual(ev.tests.results[0].verdict, 'already-failing'); assert.strictEqual(ev.regressions, 0);
  });
  await test('PE-08 isolation: the real file is untouched, and a test that writes to data/ writes to the shadow\'s empty data/, not the real one', async () => {
    const d = mk({ 'lib/a.js': A, 'tests/a.test.js': "require('../lib/a.js'); require('fs').writeFileSync(require('path').join(__dirname, '..', 'data', 'leak.txt'), 'x'); console.log('1 passed, 0 failed');\n" });
    fs.mkdirSync(path.join(d, 'data')); await PE.gather({ path: 'lib/a.js', base: A, content: A + '// changed\n', root: d });
    assert.strictEqual(fs.readFileSync(path.join(d, 'lib/a.js'), 'utf8'), A); assert.ok(!fs.existsSync(path.join(d, 'data', 'leak.txt')));
  });
  await test('PE-09 the shadow overlays the proposal: the test saw the NEW file (a sentinel the test reads back)', async () => {
    const d = mk({ 'lib/a.js': "module.exports = { v: 1 };\n", 'tests/a.test.js': "const v = require('../lib/a.js').v; console.log(v === 2 ? '1 passed, 0 failed' : '0 passed, 1 failed (v is ' + v + ')'); process.exit(v === 2 ? 0 : 1);\n" });
    const ev = await PE.gather({ path: 'lib/a.js', base: "module.exports = { v: 1 };\n", content: "module.exports = { v: 2 };\n", root: d });
    assert.strictEqual(ev.tests.results[0].verdict, 'fixed');
  });
  await test('PE-10 on the real tree: apply() refuses an agent proposal whose evidence has a regression; edit() clears evidence', async () => {
    process.env.NEXUS_EVIDENCE = 'on';
    const real = fs.readFileSync(path.join(ROOTREAL, 'lib/hat-seed.js'), 'utf8');
    const layer = { readFile: (u, p) => p === 'lib/hat-seed.js' ? { content: real } : { error: 'no' }, writeFile() { throw new Error('must not write'); } };
    const repo = { uuid: 'r1' }, hat = { name: 'the_builder', uuid: 'h' };
    const p = RI.propose({ layer, repo, hat, path: 'lib/hat-seed.js', content: real.replace('module.exports = { seedHats, SEED_HATS, SEED_ADDITIONS, MODULE_ID, VERSION };', 'module.exports = { MODULE_ID };') });
    assert.strictEqual(p.ok, true, JSON.stringify(p));
    await new Promise(r => setTimeout(r, 50));
    const ev = await RI.attachEvidence(p.inject.uuid); process.env.NEXUS_EVIDENCE = 'off';
    assert.ok(ev && ev.regressions >= 1, ev && ev.summary);
    const a = RI.apply(p.inject.uuid, { layer }); assert.strictEqual(a.ok, false); assert.strictEqual(a.regressed, true); assert.match(a.errors[0], /fail on this proposal — nothing applied/);
    const e = RI.edit(p.inject.uuid, real); assert.strictEqual(e.ok, true); assert.strictEqual(RI.get(p.inject.uuid).evidence, null);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
