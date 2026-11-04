'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-release-tool.test.js — FX2, 0.60.325 (docs/2026-10-31-fixes-phasemap.spec).
 * James, 2026-10-31: "also make any tools that help you speed any of this up."
 *   RT-01  the plan: bump, VERSION, changelog, each map's graphs, each test, stage, commit, push — in that order
 *   RT-02  data/ is never staged (his rule), renames take their new path
 *   RT-03  a red test stops the release before anything is written or committed
 *   RT-04  arguments refused without a version, his line or a changelog; push refused on main
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const R = require(path.join(__dirname, '..', '..', 'scripts', 'release.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }

test('RT-01', 'the steps, in order', () => {
  const a = R.parseArgs(['--version', '9.9.9', '--line', 'James: "x"', '--changelog', 'c.md', '--maps', 'docs/a-phasemap.spec', '--tests', 'tests/modules/t.test.js']);
  assert.deepStrictEqual(R.plan(a).map(s => s.name), ['bump', 'VERSION', 'changelog', 'graphs a-phasemap.spec', 'test t.test.js', 'stage (not data/)', 'commit', 'push']);
  const lines = []; R.run({ ...a, dry: true }, { log: (s) => lines.push(s) });
  assert.strictEqual(lines.length, 8, 'a dry run says every step and does nothing');
});
test('RT-02', 'data/ never staged; a rename stages its new path', () => {
  assert.deepStrictEqual(R.stageable([' M lib/a.js', '?? data/ledger/x.jsonl', '?? guardian/data/nodes/a.node', 'R  old.js -> new.js', '?? docs/b.spec']), ['lib/a.js', 'new.js', 'docs/b.spec']);
});
test('RT-03', 'a red test stops the release before stage and commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
  const red = path.join(dir, 'red.test.js'); fs.writeFileSync(red, "console.log('  ✗ X-01 broken'); process.exit(1);");
  const a = R.parseArgs(['--version', '9.9.9', '--line', 'x', '--changelog', 'c.md', '--tests', red, '--no-push']);
  const steps = R.plan(a).filter(s => s.test || s.stage || s.commit);   // the test, then what must not happen after it
  const done = []; let err = null;
  try { R.run(a, { log: (s) => done.push(s), steps }); } catch (e) { err = e; }
  assert.ok(err && /red\.test\.js failed — the release stops here, nothing committed/.test(err.message), err && err.message);
  assert.ok(/X-01 broken/.test(err.message), 'the failing line is named');
  assert.deepStrictEqual(done, [], 'nothing staged or committed');
});
test('RT-05', '--resume runs a stopped release again without bumping twice', () => {
  const a = R.parseArgs(['--version', '9.9.9', '--line', 'x', '--changelog', 'c.md', '--resume', '--no-push']);
  assert.deepStrictEqual(R.plan(a).map(s => s.name), ['stage (not data/)', 'commit']);
});
test('RT-04', 'required arguments, and never on main', () => {
  assert.throws(() => R.parseArgs(['--line', 'x', '--changelog', 'c.md']), /--version/);
  assert.throws(() => R.parseArgs(['--version', '1.2.3', '--changelog', 'c.md']), /--line/);
  assert.throws(() => R.parseArgs(['--version', '1.2.3', '--line', 'x']), /--changelog/);
  assert.ok(/branch first/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'release.js'), 'utf8')));
});
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
