'use strict';
/**
 * tests/modules/test-phase-specs-tag.test.js — 0.60.63 PT1
 * James, 2026-10-15: "can you make sure those are added to the phases in idearium. make sure all of the files and
 * dependancies are mapped. and i want the specs to tagged per phase"
 * Proves: a phase's `specs:` is read by loom's reader (key and list forms) and kept by Idearium's roadmap; the
 * WARP / spec-framework map's phases each declare systems, files, depends_on and specs; every spec and existing file
 * they name is real.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const MAP = 'docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec';
const pm = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

(async () => {
  const text = fs.readFileSync(path.join(ROOT, MAP), 'utf8');
  const phases = pm.parsePhasemapText(text, path.basename(MAP));

  await test('PT-01', 'loom reads specs on a key-form and a list-form phase', async () => {
    const key = pm.parsePhasemapText('phases:\n  AB1_x:\n    status: OPEN\n    specs: [docs/warp.spec, loom/spec/loom.spec]\n', 'k')[0];
    assert.deepStrictEqual(key.specs, ['docs/warp.spec', 'loom/spec/loom.spec']);
    const list = pm.parsePhasemapText('phases:\n  - id: T1\n    status: OPEN\n    specs: [docs/warp.spec]\n', 'l');
    assert.deepStrictEqual(list[0].specs, ['docs/warp.spec']);
  });

  await test('PT-02', 'every phase of the WARP / spec-framework map declares systems, files and specs; deps resolve', async () => {
    assert.ok(phases.length >= 9, `phases read: ${phases.length}`);
    const ids = new Set(phases.map(p => p.id));
    for (const p of phases) {
      assert.ok(/^declared/.test(p.systemsFrom), `${p.id}: systems ${p.systemsFrom}`);
      assert.ok(p.files.length, `${p.id}: no files`);
      assert.ok(p.specs.length, `${p.id}: no specs`);
      for (const d of (p.dependsOn ? p.dependsOn.split(',').map(s => s.trim()).filter(Boolean) : [])) assert.ok(ids.has(d), `${p.id}: depends on unknown ${d}`);
    }
  });

  await test('PT-03', 'every spec and every existing file named is real (a file this map creates is marked "(new)" where it is made)', async () => {
    const made = new Set(phases.flatMap(p => p.files.filter(f => /\(new\)/.test(f)).map(f => f.replace(/\s*\(new\)\s*$/, ''))));
    for (const p of phases) {
      for (const s of p.specs) assert.ok(fs.existsSync(path.join(ROOT, s)), `${p.id}: spec ${s} does not exist`);
      for (const f of p.files) if (!/\(new\)/.test(f) && !made.has(f)) assert.ok(fs.existsSync(path.join(ROOT, f)), `${p.id}: file ${f} does not exist (mark it "(new)")`);
    }
  });

  await test('PT-04', 'Idearium\'s roadmap keeps the specs on its phase nodes', async () => {
    const { buildRoadmap } = await import(path.join(ROOT, 'idearium/repo/roadmap.js'));
    const r = buildRoadmap({ projectId: 'p', maps: [{ path: MAP, text }] });
    const n = (r.phases || []).find(x => x.phase_key === 'SF3_collect_the_spec');
    assert.ok(n, 'SF3 not on the roadmap');
    assert.ok(n.specs.includes('docs/spec-compiler.spec'), JSON.stringify(n.specs));
  });

  // 0.60.64 PT2 — James: "phases tags by system/nested repo"
  const NS = require(path.join(ROOT, 'lib/nexus-self/systems.js'));
  const inRepo = (ph, system) => (ph.systems || []).some(t => NS.systemForLoomTag(t) === system);   // nexusPhasemaps' own predicate

  await test('PT-05', 'a phase that edits guardian/ is in guardian\'s nested repo though its systems line names only idearium', async () => {
    const ph = pm.parsePhasemapText('phases:\n  AB1_x:\n    status: OPEN\n    systems: [idearium]\n    files: [guardian/server.js, lib/new-thing.js (new)]\n', 'k')[0];
    assert.deepStrictEqual(ph.systems, ['idearium', 'guardian', 'core']);
    assert.strictEqual(ph.systemsFrom, 'declared+files');
    assert.ok(inRepo(ph, 'guardian') && inRepo(ph, 'core') && inRepo(ph, 'idearium'));
    assert.ok(!inRepo(ph, 'cortex'));
  });

  await test('PT-06', 'a phase with files and no systems line is tagged from its files, not guessed from prose', async () => {
    const ph = pm.parsePhasemapText('phases:\n  AB1_x:\n    status: OPEN\n    does: "talks about cortex and guardian"\n    files: [loom/server.js]\n', 'k')[0];
    assert.deepStrictEqual(ph.systems, ['loom']);
    assert.strictEqual(ph.systemsFrom, 'files');
  });

  await test('PT-07', 'in the WARP / spec-framework map, every phase\'s declared systems already cover its files\' owners', async () => {
    for (const p of phases) assert.strictEqual(p.systemsFrom, 'declared', `${p.id}: files add ${(p.systemsFromFiles || []).join(', ')} — declare them`);
    assert.ok(phases.some(p => inRepo(p, 'cortex')) && phases.some(p => inRepo(p, 'loom')));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
