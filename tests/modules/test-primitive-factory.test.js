'use strict';
// run-all: timeout 300000
/**
 * tests/modules/test-primitive-factory.test.js — CS0 expanded (0.60.420): a project's own tests, run one by one, prove its modules into verified
 * primitives in the component store. Map: docs/2026-10-12-browser-providers-and-work-phasemap.spec CS0_projects_decomposed_into_components.
 * James, 2026-11-06: "i want at some point to haveprimitives built and tested autonomously. using clearglass also for github repos. reusable
 * primitives saving to the component store." · "okay lets get this done. no more distractions"
 *   PF-01  tests found by their names; what each requires, resolved like node (x, x.js, x/index.js, path.join(__dirname, …))
 *   PF-02  run: each test alone in a copy (the project untouched), a time limit, no keys in its env; why said: passed · exited N · needs npm X ·
 *          timed out
 *   PF-03  verdicts and the store: verified (its test passed) · failed (a test requiring it failed) · untested; list({ verified }) and stats
 *          count them; a failed one is not barred from reuse (its machine may be why)
 *   PF-04  through Idearium's real API: decompose { dir, test: true } marks the store; ?verified=1 lists the primitives
 *   PF-05  a dropped zip: its files written to a temp folder (its one top folder stripped as decompose does) and tested there
 *   PF-06  the command rows and the drop panel: --test, --verified; the switch, the filter, the ✓ ✗ marks
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
process.env.NEXUS_COMPONENTS_DIR = path.join(tmp, 'store');   // never the real store
const T = require(path.join(ROOT, 'idearium/lib/primitive-tests.cjs'));
const CS = require(path.join(ROOT, 'lib/component-store.js'));
const PD = require(path.join(ROOT, 'lib/project-decompose.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };
const W = (root, f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); };

// a fixture project: add (proved), broken (its test fails), needy (its test needs an npm package that is not there), slow (times out), lone (no test)
function project(name) {
  const r = path.join(tmp, name);
  W(r, 'package.json', JSON.stringify({ name, version: '1.0.0' }));
  W(r, 'math/add.js', "module.exports = (a, b) => a + b;\n");
  W(r, 'math/index.js', "module.exports = { add: require('./add') };\n");
  W(r, 'broken.js', "module.exports = () => 41;\n");
  W(r, 'needy.js', "module.exports = () => require('left-pad-not-installed')('x', 3);\n");
  W(r, 'slow.js', "module.exports = () => 1;\n");
  W(r, 'lone.js', "module.exports = 'nobody tests me';\n");
  W(r, 'tests/add.test.js', "const assert = require('assert'); const m = require('../math'); assert.strictEqual(m.add(2, 2), 4); require('fs').writeFileSync('ran.txt', process.env.SECRET_TOKEN || 'no secret'); console.log('ok');\n");
  W(r, 'tests/broken.test.js', "const assert = require('assert'); assert.strictEqual(require('../broken')(), 42, 'the answer');\n");
  W(r, 'test/test-needy.js', "require('../needy.js')();\n");
  W(r, 'slow.spec.js', "const path = require('path'); require(path.join(__dirname, 'slow.js')); setTimeout(() => {}, 60000);\n");
  return r;
}

(async () => {
  console.log('\n⬡  the primitive factory: a project\'s own tests make verified primitives (CS0 expanded)\n');

  await test('PF-01', 'tests found by name; what each requires, resolved like node', () => {
    const r = project('p1');
    assert.deepStrictEqual(T.findTests(T.walk(r)), ['slow.spec.js', 'test/test-needy.js', 'tests/add.test.js', 'tests/broken.test.js']);
    assert.deepStrictEqual(T.requiresOf(r, 'tests/add.test.js'), ['math/index.js'], 'a folder resolves to its index.js');
    assert.deepStrictEqual(T.requiresOf(r, 'test/test-needy.js'), ['needy.js']);
    assert.deepStrictEqual(T.requiresOf(r, 'slow.spec.js'), ['slow.js'], 'path.join(__dirname, …) read too');
  });

  let results;
  await test('PF-02', 'each test alone, in a copy, timed, no keys; why said', () => {
    const r = path.join(tmp, 'p1'); process.env.SECRET_TOKEN = 'must-not-leak';
    try { results = T.run({ root: r, timeoutMs: 3000 }); } finally { delete process.env.SECRET_TOKEN; }
    const by = Object.fromEntries(results.map(x => [x.test, x]));
    assert.deepStrictEqual([by['tests/add.test.js'].ok, by['tests/add.test.js'].why], [true, 'passed']);
    assert.strictEqual(by['tests/broken.test.js'].ok, false); assert.match(by['tests/broken.test.js'].why, /^exited 1: .*the answer/);
    assert.match(by['test/test-needy.js'].why, /^needs the npm package left-pad-not-installed \(not installed\)$/);
    assert.match(by['slow.spec.js'].why, /^timed out after 3s$/);
    assert.ok(!fs.existsSync(path.join(r, 'ran.txt')), 'the project folder was never written: the test ran in a copy');
    assert.deepStrictEqual(by['tests/add.test.js'].covers, ['math/index.js']);
  });

  await test('PF-03', 'verdicts in the store: verified · failed · untested; list and stats; failed not barred from reuse', () => {
    const r = path.join(tmp, 'p1');
    const d = PD.fromDir(r, 'p1');
    const t = T.testProject({ root: r, components: d.components, timeoutMs: 3000, store: CS });
    assert.strictEqual(t.verdicts['math/index.js'].state, 'verified'); assert.strictEqual(t.verdicts['broken.js'].state, 'failed');
    assert.strictEqual(t.verdicts['needy.js'].state, 'failed'); assert.strictEqual(t.verdicts['lone.js'].state, 'untested');
    assert.strictEqual(t.verdicts['math/add.js'].state, 'untested', 'only what a test requires directly is proved by it (the coder\'s line: one module at a time)');
    assert.deepStrictEqual(t.stats.needsNpm, ['left-pad-not-installed']);
    const ver = CS.list({ verified: true }); assert.deepStrictEqual(ver.map(c => c.path), ['math/index.js']);
    const m = CS.manifest(ver[0].id); assert.strictEqual(m.tested.state, 'verified'); assert.strictEqual(m.tested.tests[0].test, 'tests/add.test.js');
    const s = CS.stats(); assert.strictEqual(s.verified, 1); assert.strictEqual(s.testedFailed, 3, 'broken, needy, and slow (its test timed out)');
    const broken = d.components.find(c => c.path === 'broken.js'); assert.ok(!(CS.manifest(broken.id, broken.version).failedVerification), 'a failed test does not bar reuse');
    assert.strictEqual(CS.markTested({ id: broken.id, version: broken.version, verdict: { state: 'great' } }).marked, false);
  });

  await test('PF-04', 'through Idearium\'s real API: decompose { dir, test } marks the store; ?verified=1 lists the primitives', async () => {
    const r = project('p2');
    const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
    const d = await quiet(() => api._route('POST', '/api/components/decompose', { dir: r, project: 'p2', test: true, timeoutMs: 3000 }));
    assert.strictEqual(d.status, 200, JSON.stringify(d.json).slice(0, 300));
    assert.deepStrictEqual([d.json.tested.stats.tests, d.json.tested.stats.passed, d.json.tested.stats.verified], [4, 1, 1]);
    const l = await quiet(() => api._route('GET', '/api/components?verified=1&project=p2'));
    assert.deepStrictEqual(l.json.components.map(c => [c.path, c.tested]), [['math/index.js', 'verified']]);
    assert.strictEqual(l.json.stats.verified, 2, 'p1 and p2');
  });

  await test('PF-05', 'a dropped zip: written to a temp folder, its top folder stripped, tested there', () => {
    const files = T.walk(path.join(tmp, 'p1')).map(p => ({ path: `p1-main/${p}`, content: fs.readFileSync(path.join(tmp, 'p1', p), 'utf8') }));
    const dir = T.materialize(files);
    try { assert.ok(fs.existsSync(path.join(dir, 'tests', 'add.test.js')) && !fs.existsSync(path.join(dir, 'p1-main')));
      const res = T.run({ root: dir, tests: ['tests/add.test.js'], timeoutMs: 3000 }); assert.strictEqual(res[0].ok, true, res[0].why);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    const esc = T.materialize([{ path: 'a/../../evil.js', content: 'x' }]); assert.ok(!fs.existsSync(path.join(path.dirname(esc), 'evil.js'))); fs.rmSync(esc, { recursive: true, force: true });
  });

  await test('PF-06', 'the command rows and the drop panel', () => {
    const R = require(path.join(ROOT, 'idearium/cli/route-commands.js')).SPEC; const row = (k) => R.find(r => r.key === k);
    assert.deepStrictEqual(row('components.decompose').req({ args: ['/x'], flags: { test: true, timeout: '5000' } }).body, { dir: '/x', test: true, timeoutMs: 5000 });
    assert.strictEqual(row('components').req({ args: [], flags: { verified: true } }).path, '/api/components?verified=1&');
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/components-panel.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    assert.match(html, /id="cmp-test" checked/); assert.match(html, /id="cmp-verified"/);
    assert.match(ui, /\.\.\.\(test \? \{ test: true \} : \{\}\)/); assert.match(ui, /\?verified=1/); assert.match(ui, /verified primitive\(s\)/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
