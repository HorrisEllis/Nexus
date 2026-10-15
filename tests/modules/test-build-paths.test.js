'use strict';
/**
 * tests/modules/test-build-paths.test.js — WB0 (docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec)
 * James, 2026-10-15: "make sure all builds use warp."
 * The census is measured from source, so these check it against Nexus's own build code and against a fixture where a
 * new build path appears unclassified.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const B = require(path.join(ROOT, 'lib/build-paths.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

(async () => {
  const c = B.census();
  const by = (id) => c.paths.find(p => p.id === id);

  await test('BP-01', 'Nexus today: the spec-chunk build, codegen and expand go through WARP; the phase build does not', async () => {
    assert.strictEqual(by('expand').warp, 'yes');
    assert.strictEqual(by('codegen-plan').warp, 'yes');
    assert.strictEqual(by('spec-chunk-build').warp, 'fallback', 'WARP, with a direct call only when WARP cannot load');
    assert.strictEqual(by('phase-build').warp, 'no');
    assert.ok(by('phase-build').sites.every(s => s.call === 'RA.dispatch'));
  });

  await test('BP-02', 'every agent call in the build code is classified — chat and notices are named as not builds', async () => {
    assert.deepStrictEqual(c.unknown, [], JSON.stringify(c.unknown));
    assert.ok(c.notBuilds.some(n => n.where === 'repo.agent.prompt'), 'the Agent tab chat is not a build');
  });

  await test('BP-03', 'a new build path nobody classified cannot hide: it is "unknown" and the census fails', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-paths-'));
    fs.mkdirSync(path.join(tmp, 'x'));
    fs.writeFileSync(path.join(tmp, 'x', 'api.js'), "async function _newBuild() {\n  const r = await RA.dispatch({ message: 'build it' });\n}\n// a comment naming RA.dispatch( is not a call\nasync function _phaseBuild() {\n  await warpFn('p');\n}\n");
    const r = B.census({ root: tmp, files: ['x/api.js'] });
    assert.strictEqual(r.unknown.length, 1); assert.strictEqual(r.unknown[0].where, '_newBuild'); assert.strictEqual(r.unknown[0].line, 2);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.paths.find(p => p.id === 'phase-build').warp, 'yes', 'and a path through warpFn counts as WARP');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await test('BP-04', 'CK-255 runs from the check catalogue: red today, naming every path that bypasses WARP and where', async () => {
    const C = require(path.join(ROOT, 'lib/check-catalogue.js'));
    const r = C.run('CK-255');
    assert.strictEqual(r.ok, false); assert.strictEqual(r.verifiable, true);
    for (const id of ['phase-build', 'proof-repair', 'draft-review', 'officiator-synthesis', 'raid-worker-brick']) assert.ok(r.reason.includes(id), `${id} named`);
    assert.ok(r.items.every(i => i.file && i.line), 'each with file and line');
    assert.ok(C.get('CK-255'), 'catalogued in cos/spec/check-catalogue.spec');
  });

  // Found while shipping 0.60.67: addenda written as plain text had broken six YAML specs (check-catalogue among them —
  // the catalogue stopped loading). An addendum in a YAML spec is a # comment.
  await test('BP-05', 'the specs this pipeline addends still parse as YAML (an addendum is a # comment there)', async () => {
    const yaml = require('js-yaml');
    for (const f of ['cos/spec/check-catalogue.spec', 'docs/spec-compiler.spec', 'docs/warp.spec', 'idearium/spec/idearium.spec', 'idearium/spec/idearium.repo-roadmap.spec', 'idearium/spec/nexus-repository-system.spec']) {
      try { yaml.load(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { throw new Error(`${f} no longer parses: ${e.message.split('\n')[0]}`); }
    }
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
