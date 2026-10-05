'use strict';
// tests/modules/test-build-verify.test.js — 0.39.291, master phasemap PV1–PV2 (the pieces of the proof loop, each alone).
// James: "Conrinue it first. Make sure it's enterprise grade." · "gate, verify, check, if failed, send back and fix it,
// then back through." The whole loop is tests/modules/test-prove-loop.test.js.
//
//   BV-01  verify, in real COS: passing tests → proven
//   BV-02  a syntax error → failed, on that file, with the line
//   BV-03  a relative import of a file that does not exist → failed on the importer
//   BV-04  a failing test → attributed to the code the test loads (not the test), with actual/expected and the test's source
//   BV-05  no tests → parses, NOT proven, and it says why; a broken JSON file → failed (data)
//   BV-06  a package that is neither built in nor declared → failed (dependency); a declared, uninstalled one → tests not
//          run, said, never a failure of the code
//   BV-07  markForRepair + the repair block: the chunk goes back to pending; its prompt carries the failures and the file;
//          completing it moves the repair to repairHistory; a file the spec does not build is returned, not dropped
//   BV-08  the component store: markFailed keeps the version on disk and drops every reuse key to it
//   BV-09  the seam detector judges a file chunk as a file: a correct 3-line module passes, an unclosed fence does not
//   BV-10  the build path: a file reply becomes the code inside its fence (both completion paths); repairs skip reuse;
//          the Ollama chunk path goes through the hardened client; jaaDB.flush exists
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
const BV = require('../../lib/build-verify.js');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const mk = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-')); for (const [k, v] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, k)), { recursive: true }); fs.writeFileSync(path.join(d, k), v); } return d; };
const comp = { id: `bv-${Date.now()}` };
const repo = { uuid: 'r-bv' };
const TEST = 'const assert = require("node:assert");\nconst sum = require("../lib/sum");\nassert.strictEqual(sum(2, 3), 5);\nconsole.log("ok");\n';
const v = (files) => BV.verify({ repo, repoDir: mk(files), compartment: comp });

async function main() {
  await test('BV-01', 'passing tests → proven', async () => {
    const r = await v({ 'package.json': '{"name":"x"}', 'lib/sum.js': 'module.exports = (a, b) => a + b;\n', 'test/sum.test.js': TEST });
    assert.strictEqual(r.verdict, 'proven', JSON.stringify(r));
    assert.ok(r.checks.tests.ran && r.checks.tests.passed >= 1);
  });

  await test('BV-02', 'a syntax error → failed on that file, with the line', async () => {
    const r = await v({ 'lib/sum.js': 'module.exports = (a, b) => {\n  return a + ;\n};\n', 'test/sum.test.js': TEST });
    assert.strictEqual(r.verdict, 'failed');
    const f = r.failures.find(x => x.file === 'lib/sum.js');
    assert.ok(f && f.kind === 'syntax' && f.line === 2, JSON.stringify(r.failures));
    assert.match(r.checks.tests.why, /must parse and resolve first/, 'tests are not run on broken files');
  });

  await test('BV-03', 'a missing relative import → failed on the importer', async () => {
    const r = await v({ 'lib/sum.js': 'const h = require("./helpers");\nmodule.exports = (a, b) => a + b;\n' });
    const f = r.failures.find(x => x.kind === 'import');
    assert.ok(f && f.file === 'lib/sum.js' && /'\.\/helpers'/.test(f.error), JSON.stringify(r.failures));
  });

  let bug;
  await test('BV-04', 'a failing test → the code it loads, with actual/expected and what the test asks', async () => {
    bug = await v({ 'lib/sum.js': 'module.exports = function sum(a, b) {\n  return a - b;\n};\n', 'test/sum.test.js': TEST });
    assert.strictEqual(bug.verdict, 'failed');
    const f = bug.byFile['lib/sum.js'];
    assert.ok(f && f[0].kind === 'test' && f[0].test === 'test/sum.test.js', JSON.stringify(bug.failures));
    const text = BV.repairText(f);
    assert.match(text, /-1 !== 5|actual: -1/); assert.match(text, /assert\.strictEqual\(sum\(2, 3\), 5\)/);
    assert.ok(!/node:internal\/modules\/cjs/.test(text), 'runtime internals are dropped');
    assert.ok(!/\.nex\/branches\//.test(text), 'sandbox paths are dropped');
  });

  await test('BV-05', 'no tests → parses (not proven, says why); broken JSON → failed', async () => {
    const r = await v({ 'lib/sum.js': 'module.exports = (a, b) => a + b;\n' });
    assert.strictEqual(r.verdict, 'parses'); assert.match(r.why, /nothing proves it works/);
    const j = await v({ 'lib/sum.js': 'module.exports = 1;\n', 'config.json': '{ "a": 1, }' });
    assert.ok(j.failures.some(x => x.file === 'config.json' && x.kind === 'data' && x.line === 1), JSON.stringify(j.failures));
  });

  await test('BV-06', 'undeclared package → failed; declared but not installed → tests not run, said', async () => {
    const u = await v({ 'lib/a.js': 'const x = require("left-pad-nowhere");\nmodule.exports = x;\n' });
    assert.ok(u.failures.some(x => x.kind === 'dependency' && x.file === 'lib/a.js'), JSON.stringify(u.failures));
    const d = await v({ 'package.json': '{"name":"x","dependencies":{"left-pad-nowhere":"1.0.0"}}', 'lib/a.js': 'module.exports = require("left-pad-nowhere");\n', 'test/a.test.js': 'require("../lib/a");\n' });
    assert.strictEqual(d.verdict, 'parses', JSON.stringify(d));
    assert.match(d.checks.tests.why, /not installed here/);
  });

  const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
  await test('BV-07', 'markForRepair + the repair block + repairHistory', async () => {
    const m = se.createFileTreeSpec({ name: 'bv-sum', plan: { files: [{ path: 'lib/sum.js', layer: 'kernel', purpose: 'sum' }, { path: 'test/sum.test.js', layer: 'test' }] } });
    const c = m.chunks.find(x => x.realPath === 'lib/sum.js');
    se.completeChunk(m.uuid, c.uuid, 'module.exports = function sum(a, b) {\n  return a - b;\n};');
    const text = BV.repairText(bug.byFile['lib/sum.js']);
    const r = se.markForRepair(m.uuid, [{ realPath: 'lib/sum.js', failures: text, round: 2 }, { realPath: 'README.md', failures: 'x', round: 2 }]);
    assert.deepStrictEqual(r, { marked: ['lib/sum.js'], unknown: ['README.md'] });
    const m2 = se.loadSpec(m.uuid);
    const c2 = m2.chunks.find(x => x.realPath === 'lib/sum.js');
    assert.strictEqual(c2.status, 'pending'); assert.strictEqual(c2.repair.round, 2);
    const prompt = se.buildChunkPrompt(m2, c2, '');
    assert.match(prompt, /^Write the complete file `lib\/sum\.js`/);
    assert.match(prompt, /THIS FILE FAILED VERIFICATION \(round 2\)/);
    assert.match(prompt, /return a - b;/, 'the file as it is now');
    assert.match(prompt, /-1 !== 5|actual: -1/, 'the exact failure');
    se.completeChunk(m.uuid, c.uuid, 'module.exports = function sum(a, b) {\n  return a + b;\n};');
    const c3 = se.loadSpec(m.uuid).chunks.find(x => x.realPath === 'lib/sum.js');
    assert.ok(!c3.repair && c3.repairHistory.length === 1 && c3.repairHistory[0].round === 2 && !('previous' in c3.repairHistory[0] && c3.repairHistory[0].previous));
    assert.ok(!/THIS FILE FAILED/.test(se.buildChunkPrompt(se.loadSpec(m.uuid), c3, '')), 'no repair block once fixed');
  });

  await test('BV-08', 'component store: markFailed keeps the version, drops its reuse keys', () => {
    const CS = require('../../lib/component-store.js');
    const bad = 'module.exports = (a, b) => a - b;\n';
    const put = CS.put({ project: 'bv-store', path: 'lib/sum.js', content: bad, contract: { path: 'lib/sum.js', layer: 'kernel', purpose: 'sum' }, prompt: 'write sum' });
    assert.ok(CS.byContract({ path: 'lib/sum.js', layer: 'kernel', purpose: 'sum' }), 'reusable before');
    const r = CS.markFailed({ project: 'bv-store', path: 'lib/sum.js', content: bad, reason: 'test failed: -1 !== 5' });
    assert.ok(r.marked && r.keysDropped >= 2, JSON.stringify(r));
    assert.strictEqual(CS.byContract({ path: 'lib/sum.js', layer: 'kernel', purpose: 'sum' }), null);
    assert.strictEqual(CS.byPrompt('write sum'), null);
    assert.ok(CS.get(put.id, put.version), 'still on disk');
    assert.match(CS.manifest(put.id, put.version).failedVerification.reason, /-1 !== 5/);
  });

  await test('BV-09', 'the detector judges a file chunk as a file', () => {
    const { Detector } = require('../../lib/seam/detector.js');
    const prompt = 'Write the complete file `lib/sum.js` for the project "x".\n' + 'THE FILE TREE:\n'.repeat(200);
    const small = 'module.exports = (a, b) => a + b;';
    assert.strictEqual(Detector.evaluate(small, prompt, Detector.profile(prompt, { kind: 'file' })).passed, true, 'a correct short file passes');
    assert.strictEqual(Detector.evaluate(small, prompt, Detector.profile(prompt)).passed, false, 'as prose it was "too short" (the old behaviour, for documents)');
    assert.strictEqual(Detector.truncation('```js\nconst a = 1;\n', Detector.profile(prompt, { kind: 'file' })).reason, 'code_fence_not_closed');
    assert.strictEqual(Detector.truncation('   ', Detector.profile(prompt, { kind: 'file' })).reason, 'empty');
    // §0.39.307 — a document section is now judged as a 'section' (it was null); a file chunk is still a 'file'
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/chunk-dispatch.js'), 'utf8'), /kind:\s*chunk\.realPath \? 'file' : \(chunk\.sectionId \? 'section' : null\)/);
  });

  await test('BV-10', 'the build path: fence → code on both paths; repairs skip reuse; Ollama via the hardened client; flush', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const build = api.slice(api.indexOf("case 'speceng.build':"), api.indexOf("case 'speceng.chunk.fail':"));
    assert.match(build, /if \(!body\.noReuse && !chunk\.repair\) \{/);
    assert.match(build, /if \(!body\.noReuse && !chunk\.repair && chunk\.realPath\) \{/);
    assert.match(build, /_fileContentFromReply\(chunk, result\.text\)/);
    assert.match(build.slice(build.indexOf("case 'speceng.chunk.complete':")), /_fileContentFromReply\(pre, content\)/);
    // the normaliser itself, lifted out of the module and run
    const src = api.slice(api.indexOf('function _fileContentFromReply('), api.indexOf('function _storeBuilt('));
    const fn = new Function('path', '_require', `${src}; return _fileContentFromReply;`)(path, (p) => require(path.join(ROOT, 'idearium/api', p)));
    assert.deepStrictEqual(fn({ realPath: 'package.json' }, '```json\n{"a":1}\n```'), { ok: true, content: '{"a":1}\n' });
    assert.deepStrictEqual(fn({ realPath: 'src/a.js' }, 'Here you go:\n```js\nconst a = 1;\n```\nDone.'), { ok: true, content: 'const a = 1;\n' });
    assert.strictEqual(fn({ realPath: 'src/a.js' }, '```js\nconst a = ').ok, false, 'an unclosed fence is never written');
    assert.deepStrictEqual(fn({ realPath: 'README.md' }, '```markdown\n# Title\n\ntext\n```'), { ok: true, content: '# Title\n\ntext\n' });
    const keep = '# Title\n\n```js\nx()\n```\n';
    assert.deepStrictEqual(fn({ realPath: 'README.md' }, keep), { ok: true, content: keep }, 'a README keeps its own fences');
    assert.deepStrictEqual(fn({ sectionId: 'purpose' }, '```x```'), { ok: true, content: '```x```' }, 'a prose section is untouched');
    const as = fs.readFileSync(path.join(ROOT, 'idearium/agent-suite/index.js'), 'utf8');
    assert.match(as.slice(as.indexOf('export async function generateWithOllama')), /OC\.callOllamaRaw\(model, prompt, null, Math\.min\(timeoutMs, 120000\), 'idearium\/agent-suite', \{ system, temperature: 0\.3 \}\)/);
    assert.strictEqual(typeof require('../../cortex/memory/jaa-db.js').jaaDB.flush, 'function');
  });

  await test('BV-11', 'the surfaces: routes, CLI, the Plan panel', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    for (const r of ["['POST',   ['api','repos',    ':uuid','verify'],                'repo.verify']", "['POST',   ['api','repos',    ':uuid','prove'],                 'repo.prove']",
      "['GET',    ['api','repos',    ':uuid','prove'],                 'repo.prove.status']", "['POST',   ['api','repos',    ':uuid','prove','cancel'],        'repo.prove.cancel']"]) assert.ok(api.includes(r), r);
    assert.match(api, /_buildingSpecs\.add\(repo\.specUuid\)/, 'the queue never builds a spec a proof run is building');
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    assert.match(cli, /async 'verify'\(os/); assert.match(cli, /async 'prove'\(os/);
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    assert.match(pp, /\$\{_planProof\(\)\}/); assert.match(pp, /\/api\/repos\/\$\{repo\.uuid\}\/verify/); assert.match(pp, /\/api\/repos\/\$\{repo\.uuid\}\/prove/);
    assert.match(pp, /prove\\\.\|verify/, 'the panel repaints on prove/verify events');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
