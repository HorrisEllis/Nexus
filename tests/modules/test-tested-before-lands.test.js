'use strict';
/**
 * tests/modules/test-tested-before-lands.test.js — FR2 (docs/2026-10-16-repo-carve-phasemap.spec), 0.60.114
 * James, 2026-10-16: "merge. then next phase." — the flight recorder's second piece: a change is tested before it lands, in the
 * tree it belongs to, and a staged batch is tested together. A real fixture repo with real tests:
 *   lib/a.js  exports f          lib/b.js  calls a.f          tests/a.test.js and tests/b.test.js
 *   TB-01  shadow(): several files overlaid at once (one gone), the tree as it is, the real tree untouched
 *   TB-02  gatherBatch: a change across two files (a adds g, b calls g) breaks b alone but passes TOGETHER; a real break regresses
 *   TB-03  evidence runs in the repo's own tree (not Nexus's); a repo with no folder is not tested, said; staged keeps it
 *   TB-04  promoteTested: a regressing batch is refused and nothing applied (each change notes the batch); a good one lands; force says skipped
 *   TB-05  POST code/promote (idearium/repo/code-api.js) answers 409 with the batch on a regression
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-inj-'));
process.env.NEXUS_EVIDENCE = 'off';   // evidence is called by the test, not scheduled behind it
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const PE = require(path.join(ROOT, 'lib/proposal-evidence.js'));
const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
const CE = require(path.join(ROOT, 'lib/code-edit.js'));
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const A0 = "'use strict';\nmodule.exports = { f: () => 1 };\n";
const B0 = "'use strict';\nconst a = require('./a.js');\nmodule.exports = { run: () => a.f() };\n";
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-repo-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  put('lib/a.js', A0); put('lib/b.js', B0);
  put('tests/a.test.js', "const a = require('../lib/a.js');\nif (typeof (a.f || a.g) !== 'function') { console.log('✗ a has no f or g'); process.exit(1); }\nconsole.log('1 passed, 0 failed');\n");
  put('tests/b.test.js', "const b = require('../lib/b.js');\nif (b.run() !== 1) { console.log('✗ run'); process.exit(1); }\nconsole.log('1 passed, 0 failed');\n");
  return dir;
}
// a repo layer over a folder: what repo-inject's apply and code-edit's promote use
function layerOver(dir) {
  return {
    readFile(u, p) { const f = path.join(dir, p); return fs.existsSync(f) ? { content: fs.readFileSync(f, 'utf8') } : { error: 'no such file' }; },
    readTextFile(u, p) { return this.readFile(u, p); },
    writeTextFile(u, p, text) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); return { ok: true }; },
    deleteTextFile(u, p) { try { fs.unlinkSync(path.join(dir, p)); } catch (_) {} return { ok: true }; },
    deleteFile(u, p) { return this.deleteTextFile(u, p); },
    refresh() { return { ok: true }; },
  };
}
// a adds g and keeps f: an agent may not drop an export (the 0.60.105 screen refuses it), so the cross-file change is an addition
const ADD_G = "'use strict';\nmodule.exports = { f: () => 1, g: () => 1 };\n";
const CALL_G = "'use strict';\nconst a = require('./a.js');\nmodule.exports = { run: () => a.g() };\n";
const CALL_H = "'use strict';\nconst a = require('./a.js');\nmodule.exports = { run: () => a.h() };\n";

(async () => {
  await test('TB-01', 'shadow(): several files overlaid at once (null = gone), {} is the tree as it is, and the real tree is untouched', async () => {
    const dir = fixture();
    const s = PE.shadow(dir, { 'lib/a.js': ADD_G, 'lib/b.js': null, 'lib/new.js': 'x' });
    try {
      assert.strictEqual(fs.readFileSync(path.join(s.dir, 'lib/a.js'), 'utf8'), ADD_G);
      assert.ok(!fs.existsSync(path.join(s.dir, 'lib/b.js')), 'null: the file is gone in the shadow');
      assert.strictEqual(fs.readFileSync(path.join(s.dir, 'lib/new.js'), 'utf8'), 'x');
      assert.strictEqual(fs.readFileSync(path.join(s.dir, 'tests/a.test.js'), 'utf8').length > 0, true);
    } finally { s.remove(); }
    const same = PE.shadow(dir, {}); try { assert.strictEqual(fs.readFileSync(path.join(same.dir, 'lib/a.js'), 'utf8'), A0); } finally { same.remove(); }
    assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/a.js'), 'utf8'), A0); assert.ok(fs.existsSync(path.join(dir, 'lib/b.js')));
    assert.strictEqual(fs.readFileSync(path.join(PE.shadow(dir, 'lib/a.js', ADD_G).dir, 'lib/a.js'), 'utf8'), ADD_G, 'the one-file form still works');
  });

  await test('TB-02', 'a batch is tested together: a change across two files (a adds g, b calls it) passes as a batch though b alone breaks; a real break regresses', async () => {
    const dir = fixture();
    const alone = await PE.gather({ root: dir, path: 'lib/b.js', base: B0, content: CALL_G });
    assert.strictEqual(alone.regressions, 1, 'b calling g while a still has f: broken alone');
    const both = await PE.gatherBatch({ root: dir, changes: [{ path: 'lib/a.js', base: A0, content: ADD_G }, { path: 'lib/b.js', base: B0, content: CALL_G }] });
    assert.deepStrictEqual([both.root, both.tests.linked, both.regressions], ['repo', 2, 0], both.summary);
    assert.match(both.summary, /batch of 2 file\(s\), tested together in the repo's own tree/);
    const bad = await PE.gatherBatch({ root: dir, changes: [{ path: 'lib/a.js', base: A0, content: ADD_G }, { path: 'lib/b.js', base: B0, content: CALL_H }] });
    assert.strictEqual(bad.regressions, 1);
    const r = bad.tests.results.find(x => x.verdict === 'REGRESSION');
    assert.strictEqual(r.file, 'tests/b.test.js'); assert.deepStrictEqual(r.for, ['lib/b.js']);
    assert.match(bad.summary, /REGRESSION tests\/b\.test\.js \(linked to lib\/b\.js\)/);
  });

  const repo = { uuid: 'tb-repo' };
  const hat = { name: 'the_builder', uuid: 'h1' };
  await test('TB-03', 'evidence runs in the repo\'s own tree; a repo with no folder is not tested, said; a staged change keeps its evidence', async () => {
    const dir = fixture(), layer = layerOver(dir);
    RI.setEvidenceRoot(() => dir);
    const p = await quiet(() => RI.propose({ layer, repo, hat, path: 'lib/b.js', content: CALL_H, source: { kind: 'agent' } }));
    const id = (p.inject || p).uuid;
    const ev = await RI.attachEvidence(id);
    assert.deepStrictEqual([ev.root, ev.tests.linked, ev.regressions], ['repo', 1, 1], ev.summary);
    RI.setEvidenceRoot(() => null);
    const p2 = await quiet(() => RI.propose({ layer, repo, hat, path: 'lib/a.js', content: ADD_G, source: { kind: 'agent' } }));
    const ev2 = await RI.attachEvidence((p2.inject || p2).uuid);
    assert.strictEqual(ev2.root, null); assert.match(ev2.tests.skipped, /no folder on disk/); assert.strictEqual(ev2.tests.ran, 0);
    RI.setEvidenceRoot(() => dir);
    const p3 = await quiet(() => RI.propose({ layer, repo, hat, path: 'lib/b.js', content: CALL_G, source: { kind: 'agent' } }));
    const id3 = (p3.inject || p3).uuid;
    RI.stage(id3, { branch: 'x' });
    const ev3 = await RI.attachEvidence(id3);
    assert.ok(ev3 && RI.get(id3).evidence, 'a staged change keeps its evidence (it was thrown away before)');
    for (const x of [id, (p2.inject || p2).uuid]) RI.reject(x);
    RI.reject(id3);
    RI.setEvidenceRoot(null);
  });

  const stageBatch = async (layer, changes) => {
    const r = await quiet(() => CE.stage({ layer, RI, repo, hat, changes, causedBy: 'tb', record: async () => ({ commitId: `c-${Math.random().toString(36).slice(2, 8)}` }) }));
    assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
    return RI.list(repo.uuid, { status: 'staged', limit: 100 }).map(n => n.uuid);
  };
  await test('TB-04', 'promoteTested: a regressing batch is refused, nothing applied, each change notes the batch; a good batch lands; force says skipped', async () => {
    const dir = fixture(), layer = layerOver(dir);
    const ids = await stageBatch(layer, [{ path: 'lib/a.js', content: ADD_G }, { path: 'lib/b.js', content: CALL_H }]);
    const r = await CE.promoteTested({ layer, RI, repo, injects: ids, root: dir });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.regressed, true);
    assert.match(r.errors[0], /tested together and 1 linked test/);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/a.js'), 'utf8'), A0, 'nothing applied');
    for (const id of ids) { const n = RI.get(id); assert.strictEqual(n.status, 'staged'); assert.strictEqual(n.batch.regressions, 1); assert.strictEqual(n.batch.files, 2); }
    for (const id of ids) RI.reject(id);
    const good = await stageBatch(layer, [{ path: 'lib/a.js', content: ADD_G }, { path: 'lib/b.js', content: CALL_G }]);
    const ok = await quiet(() => CE.promoteTested({ layer, RI, repo, injects: good, root: dir }));
    assert.strictEqual(ok.ok, true, JSON.stringify(ok).slice(0, 400));
    assert.deepStrictEqual([ok.batch.linked, ok.batch.regressions], [2, 0]);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/b.js'), 'utf8'), CALL_G, 'the batch landed');
    const dir2 = fixture(), layer2 = layerOver(dir2);
    const f = await stageBatch(layer2, [{ path: 'lib/b.js', content: "'use strict';\nmodule.exports = { run: () => 1 };\n" }]);
    const forced = await quiet(() => CE.promoteTested({ layer: layer2, RI, repo, injects: f, root: dir2, force: true }));
    assert.strictEqual(forced.ok, true); assert.match(forced.batch.skipped, /force/);
  });

  await test('TB-05', 'POST code/promote: 409 with the batch when it regresses; the real route handler', async () => {
    const dir = fixture(), layer = layerOver(dir);
    const ids = await stageBatch(layer, [{ path: 'lib/b.js', content: CALL_H }]);
    const { handleCode } = await import('../../idearium/repo/code-api.js');
    const r = await quiet(() => handleCode({ method: 'POST', op: 'promote', layer, repo, uuid: repo.uuid, dir, query: {}, body: { injects: ids } }));
    assert.strictEqual(r.status, 409, JSON.stringify(r).slice(0, 300));
    assert.strictEqual(r.body.batch.regressions, 1);
    for (const id of ids) RI.reject(id);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
