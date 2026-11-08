'use strict';
/**
 * tests/modules/test-pipeline-box.test.js — PC1_one_box_shape (docs/2026-11-08-pipeline-canvas-phasemap.spec), MOD-PC-BOX (cos/spec/pipeline-canvas.spec).
 * James, 2026-11-08: "steps as boxes, with wires as the flow into the hooks of gates" · "using emerge as the language".
 * The box shape is written in Emerge (cos/automation/box.eg); this file only runs Emerge's own tools on it for the Nexus suite. It is also the
 * TEMPORARY harness that converts the tree's YAML node files to JSON, because Emerge has no YAML reader yet (CIE14, found 2026-11-08); it goes
 * when parse_yaml lands.
 *   PB-01  eg check passes on box.eg and cli.eg; eg test passes on cos/automation/test/box.test.eg
 *   PB-02  every .pipeline and .procedure node in the tree round-trips through the box shape unchanged (PCS-002: no second store)
 *   PB-03  §1.2: an unknown command is refused (exit 1) and the commands named
 *   PB-04  §17.13: the box shape is .eg; no .js in cos/automation/
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), EG = path.join(ROOT, 'emerge/emerge/lang/eg.js'), DIR = path.join(ROOT, 'cos/automation');
const yaml = require('js-yaml');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const eg = (...a) => spawnSync(process.execPath, [EG, ...a], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  if (/^(node_modules|data|\.git|_archive)$/.test(e.name)) return [];
  return e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]; });

console.log('\n▢  one box shape, in Emerge (PC1)\n');

test('PB-01', 'eg check and eg test pass on the box shape', () => {
  for (const f of ['box.eg', 'cli.eg']) { const r = eg('check', path.join(DIR, f)); assert.strictEqual(r.status, 0, `${f}: ${r.stdout}${r.stderr}`); }
  const r = eg('test', path.join(DIR, 'test/box.test.eg')); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /\d+ passed, 0 failed/);
});

test('PB-02', 'every .pipeline and .procedure in the tree round-trips unchanged', () => {
  const nodes = walk(ROOT).filter(f => /\.(pipeline|procedure)$/.test(f) && !/node-schemas/.test(f));
  assert.ok(nodes.length >= 2, `found ${nodes.length}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc1-'));
  try {
    for (const f of nodes) {
      const n = yaml.load(fs.readFileSync(f, 'utf8')); const p = n && n.payload ? n.payload : n;
      const j = path.join(tmp, path.basename(f) + '.json'); fs.writeFileSync(j, JSON.stringify(p));
      const r = eg('run', path.join(DIR, 'cli.eg'), 'roundtrip', j); assert.strictEqual(r.status, 0, `${path.relative(ROOT, f)}: ${r.stderr}`);
      const out = JSON.parse(r.stdout.trim().split('\n').pop());
      assert.strictEqual(out.same, true, `${path.relative(ROOT, f)} changed in the round trip`);
      assert.deepStrictEqual(out.problems, [], `${path.relative(ROOT, f)}: ${out.problems.join('; ')}`);
      console.log(`      ${path.relative(ROOT, f)}: ${out.kind}, ${out.boxes} boxes, ${out.wires} wires, unchanged`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PB-03', 'an unknown command is refused, the commands named', () => {
  const r = eg('run', path.join(DIR, 'cli.eg'), 'nope'); assert.strictEqual(r.status, 1); assert.match(r.stderr, /the commands are version, boxes/);
});

test('PB-04', 'the box shape is Emerge: no .js in cos/automation/', () => {
  const js = walk(DIR).filter(f => f.endsWith('.js')); assert.deepStrictEqual(js, []);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
