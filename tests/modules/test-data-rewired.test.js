'use strict';
/**
 * tests/modules/test-data-rewired.test.js — every system rewired to lib/data-home.js stays rewired (DL3, 0.60.209)
 * Map: docs/2026-10-21-data-layout-phasemap.spec DL3_rewire_writers
 * James, 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each
 * system responsible for it's own data." · "continue"
 *
 * One rule for each system in data-home REWIRED, so each later step only adds a name:
 *   RW-01  no code names data/<its folder> (the census's refs), so its files come home at its boot
 *   RW-02  Diagnostic's table (the registry's dataDir) points at <folder>/data
 *   RW-03  rewired() answers to the name and to the folder; the shared writers resolve it to its own folder, the rest stay put
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DH = require(path.join(ROOT, 'lib/data-home.js'));
const C = require(path.join(ROOT, 'lib/data-clearup.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

console.log(`\n⬡  rewired systems: ${[...DH.REWIRED].join(', ')}\n`);

test('RW-01', 'no code names data/<folder> for any rewired system', () => {
  const named = {};
  for (const s of DH.REWIRED) { const r = C.refsTo(ROOT, DH.folder(s)); if (r.length) named[s] = r; }
  assert.deepStrictEqual(named, {}, `still named: ${JSON.stringify(named)}`);
});

test('RW-02', 'Diagnostic\'s table (the registry\'s dataDir) points each rewired system at <folder>/data', () => {
  const src = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');
  let seen = 0;
  for (const s of DH.REWIRED) {
    const m = src.match(new RegExp(`^\\s*'?${s.replace('-', '\\-')}'?:\\s*\\{[^\\n]*dataDir: '([^']+)'`, 'm'));
    if (!m) continue;   // not every system is in the table (versionium has no dataDir there)
    assert.strictEqual(m[1], `${DH.folder(s)}/data`, `${s}: ${m[1]}`); seen++;
  }
  assert.ok(seen >= 6, `the table was read (${seen} rewired systems found in it)`);
});

test('RW-03', 'rewired() by name and folder; ledger-writer puts a rewired system in its own folder and leaves the rest', () => {
  assert.ok(DH.rewired('ollama-bridge') && DH.rewired('ollama'), 'name and folder');
  const LW = require(path.join(ROOT, 'lib/ledger-writer.js'));
  for (const s of DH.REWIRED) assert.strictEqual(LW.dataDir(s), DH.dir(s), s);
  const notYet = DH.SYSTEMS().find(s => !DH.rewired(s));
  if (notYet) assert.strictEqual(LW.dataDir(notYet), path.join(LW.DATA_ROOT, notYet), `${notYet} not yet rewired stays put`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
