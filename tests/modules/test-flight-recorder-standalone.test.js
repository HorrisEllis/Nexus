'use strict';
/**
 * tests/modules/test-flight-recorder-standalone.test.js — FR4a (docs/2026-10-16-repo-carve-phasemap.spec), 0.60.118
 * James, 2026-10-17: "Okay. Keep going." — the flight recorder on its own. The proof the map asks for: carve the product into an
 * empty folder (lib/repo-carve.js, the same as Branch from Nexus) and, from THERE, on a fixture project:
 *   FS-01  the carved copy has the command and everything it needs; init makes .flight-recorder/ in the project
 *   FS-02  propose (with --agent and --why) writes nothing; test runs its linked test in the project; apply writes it as a version
 *   FS-03  show: the whole record — who, why (its run), checked, the version it landed in
 *   FS-04  a second change, then undo the first: the later edit kept, both undo and apply are versions, all in the list
 *   FS-05  a change that breaks its test: test says REGRESSED and apply refuses; --json is clean on stdout
 *   FS-06  nothing of Nexus is reached: every state file is under the project's .flight-recorder/
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const CV = require(path.join(ROOT, 'lib/repo-carve.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-standalone-'));
const copy = path.join(work, 'flight-recorder'), proj = path.join(work, 'proj');
// a clean environment: none of Nexus's own store locations, no test sandbox (the command must place its stores itself)
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(NEXUS_|JAA_|VERSIONIUM_|RUN_STATE_|IDEARIUM_)/.test(k)));
const fr = (...a) => {
  const r = spawnSync(process.execPath, [path.join(copy, 'products/flight-recorder/bin/flight-recorder.js'), ...a], { cwd: proj, env, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};
const ok = (r) => { assert.strictEqual(r.code, 0, `exit ${r.code}: ${r.err.split('\n').slice(-3).join(' | ')}`); return r.out; };
const idOf = (pred) => JSON.parse(ok(fr('list', '--json'))).find(pred).id.slice(0, 8);
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true }); fs.writeFileSync(path.join(work, rel), text); return path.join(work, rel); };
const A0 = "'use strict';\nconst f = () => 1;\n\nconst keep = true;\n\nmodule.exports = { f, keep };\n";
const A1 = "'use strict';\nconst f = () => 1;\nconst g = () => 2;\nconst keep = true;\n\nmodule.exports = { f, keep };\n";
const A2 = "'use strict';\nconst f = () => 1;\nconst g = () => 2;\nconst keep = true;\n\nmodule.exports = { f, keep, extra: 3 };\n";

(async () => {
  await test('FS-01', 'the product carved into an empty folder carries the command; init starts recording the project', async () => {
    const P = CV.preset('flight-recorder', ROOT);
    const plan = CV.plan({ root: ROOT, seeds: P.seeds, cut: P.cut, must: P.must });
    assert.deepStrictEqual(plan.mustMissing, []);
    for (const f of CV.build(plan, { root: ROOT, name: 'flight-recorder' })) { const to = path.join(copy, f.path); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, f.content); }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(copy, 'node_modules'), 'junction');
    assert.ok(fs.existsSync(path.join(copy, 'products/flight-recorder/bin/flight-recorder.js')), 'the command is in the copy');
    write('proj/lib/a.js', A0);
    write('proj/tests/a.test.js', "const a = require('../lib/a.js');\nif (a.f() !== 1) { console.log('✗ f'); process.exit(1); }\nconsole.log('1 passed, 0 failed');\n");
    assert.match(ok(fr('init')), /^recording .*proj \(fr-/);
    assert.ok(fs.existsSync(path.join(proj, '.flight-recorder/project.json')));
  });

  await test('FS-02', 'propose writes nothing; test runs the linked test in the project; apply writes it and makes a version', async () => {
    assert.match(ok(fr('propose', 'lib/a.js', '--from', write('a1.js', A1), '--agent', 'the_builder', '--why', 'add g')), /nothing written yet/);
    assert.strictEqual(fs.readFileSync(path.join(proj, 'lib/a.js'), 'utf8'), A0);
    const id = idOf(x => x.status === 'proposed');
    assert.match(ok(fr('test', id)), /1 test linked to this file; ran 1: 1 pass, 0 REGRESSED/);
    assert.match(ok(fr('apply', id)), /^applied lib\/a\.js — version vtm-/);
    assert.strictEqual(fs.readFileSync(path.join(proj, 'lib/a.js'), 'utf8'), A1);
  });

  await test('FS-03', 'show: who, why (its run), checked in the project, the version it landed in — nothing missing', async () => {
    const id = idOf(x => x.status === 'applied');
    const r = JSON.parse(ok(fr('show', id, '--json')));
    assert.deepStrictEqual([r.who.agent, r.why.run.goal, r.why.run.how, r.checked.where, r.checked.regressions], ['the_builder', 'add g', 'task', 'repo', 0]);
    assert.strictEqual(r.landed.length, 1); assert.deepStrictEqual(r.holes, [], JSON.stringify(r.holes));
  });

  await test('FS-04', 'a later change, then undo the first: the later edit is kept; apply and undo are versions; the list says it', async () => {
    const first = idOf(x => x.status === 'applied');
    ok(fr('propose', 'lib/a.js', '--from', write('a2.js', A2), '--agent', 'other', '--why', 'add extra'));
    ok(fr('apply', idOf(x => x.status === 'proposed')));
    assert.match(ok(fr('undo', first)), /the later edits were kept — version vtm-/);
    assert.strictEqual(fs.readFileSync(path.join(proj, 'lib/a.js'), 'utf8'), "'use strict';\nconst f = () => 1;\n\nconst keep = true;\n\nmodule.exports = { f, keep, extra: 3 };\n");
    const versions = ok(fr('versions')).split('\n');
    assert.strictEqual(versions.length, 3, versions.join('\n'));
    assert.match(ok(fr('list')), new RegExp(`${first}\\s+reverted`));
  });

  await test('FS-05', 'a change that breaks its test: REGRESSED, and apply refuses with nothing written; --json is clean', async () => {
    ok(fr('propose', 'lib/a.js', '--from', write('bad.js', "'use strict';\nconst f = () => 2;\n\nconst keep = true;\n\nmodule.exports = { f, keep, extra: 3 };\n"), '--agent', 'the_builder'));
    const id = idOf(x => x.status === 'proposed');
    assert.match(ok(fr('test', id)), /1 REGRESSED/);
    const before = fs.readFileSync(path.join(proj, 'lib/a.js'), 'utf8');
    const r = fr('apply', id);
    assert.strictEqual(r.code, 1); assert.match(r.err, /linked test.*fail on this proposal — nothing applied/);
    assert.strictEqual(fs.readFileSync(path.join(proj, 'lib/a.js'), 'utf8'), before);
    assert.doesNotThrow(() => JSON.parse(fr('list', '--json').out), 'stdout is only the answer');
  });

  await test('FS-06', 'nothing of Nexus is reached: the state is all under the project\'s .flight-recorder/', async () => {
    for (const d of ['changes', 'store', 'runs', 'versions']) assert.ok(fs.existsSync(path.join(proj, '.flight-recorder', d)), d);
    assert.ok(fs.readdirSync(path.join(proj, '.flight-recorder/versions')).some(f => /versionium_commits/.test(f)), 'the versions are on disk');
    assert.ok(!fs.existsSync(path.join(copy, 'data')) || !fs.readdirSync(path.join(copy, 'data')).length, 'the copy wrote nothing into its own data/');
  });

  fs.rmSync(work, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
