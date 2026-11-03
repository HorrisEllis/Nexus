'use strict';
/**
 * tests/modules/test-registry-sovereign.test.js — AXIOMS §5.16 enforced (RG0, 0.60.383; docs/2026-11-03-registry-per-system-phasemap.spec).
 * James, 2026-11-03: "And enforce that. I’m sick of you confusing that. It’s fucking sovereign. Do not  make this mistake again."
 *   RS-01  the real tree holds the line: no new caller of the central registry, no new or grown Loom map, the law written in all three places
 *   RS-02  on a fixture: a new caller is named; a new Loom map and a grown one are named; a removed caller is counted as shrunk; a law file
 *          without §5.16 is named; with no baseline it says so instead of passing
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'lib/registry-sovereign-check.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
console.log('\n⬢  every system\'s component registry is its own (AXIOMS §5.16)\n');
test('RS-01', 'the real tree: no new central caller, no new or grown Loom map, the law in all three places', () => {
  const r = R.check({ root: ROOT });
  assert.ok(r.ok, `§5.16 broken: ${JSON.stringify({ newCallers: r.newCallers, newMaps: r.newMaps, grownMaps: r.grownMaps, lawMissing: r.lawMissing, error: r.error })} — add the capability to its own system's registry, never the central one or Loom`);
});
test('RS-02', 'a fixture: each way of breaking it is named; shrinking is counted; no baseline is said', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  const W = (f, s) => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), s); };
  W('lib/component-registry.js', 'module.exports = {};\n'); W('a/old.js', "require('../lib/component-registry');\n"); W('b/gone.js', "require('../lib/component-registry.js');\n");
  W('loom/maps/one.js', 'x\ny\n'); W('docs/AXIOMS-v3.1.md', "**§5.16 Every System's Component Registry Is Its Own**\n"); W('docs/CLAUDE.md', 'THE COMPONENT REGISTRY IS PER SYSTEM, AND SOVEREIGN\n'); W('CLAUDE.md', 'component registry is its own ... Loom is NOT it\n');
  assert.match(R.check({ root: t }).error, /no baseline/);
  const base = R.scan({ root: t }); assert.deepStrictEqual(base.centralCallers, ['a/old.js', 'b/gone.js']);
  assert.ok(R.check({ root: t, baseline: base }).ok);
  W('c/new.js', "const reg = require('../lib/component-registry');\n"); W('loom/maps/one.js', 'x\ny\nz\n'); W('loom/maps/two.js', 'w\n'); fs.rmSync(path.join(t, 'b/gone.js'));
  W('CLAUDE.md', 'nothing about it\n');
  const r = R.check({ root: t, baseline: base });
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.newCallers, ['c/new.js']); assert.deepStrictEqual(r.newMaps, ['loom/maps/two.js']);
  assert.deepStrictEqual(r.grownMaps, [{ file: 'loom/maps/one.js', was: 3, now: 4 }]); assert.deepStrictEqual(r.shrunk.callers, ['b/gone.js']); assert.deepStrictEqual(r.lawMissing, ['CLAUDE.md']);
  fs.rmSync(t, { recursive: true, force: true });
});
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
