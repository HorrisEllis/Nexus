'use strict';
// tests/modules/test-emergence-and-warp-suites.test.js — 0.39.319, EM0 (3), docs/2026-10-02-emerge-field-memory-build-phasemap.spec.
// James: "okay now the spine. lets continue the phases for emerge." · "no. i want warp 2"
//
// Runs Emergence's own suites (its package.json test list) and WARP's own suites inside Nexus, against Nexus's warp/
// (Emergence requires ../warp — the forked 1.5.0). One total line, so run-all counts every case.
//   warp/test/dispatch.test.js is not run: it reads siso_ref/, which is not in the repo (it failed before the fork too).
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const pkg = require(path.join(ROOT, 'emergence/package.json'));
const suites = [
  ...pkg.scripts.test.split('&&').map(s => s.trim().replace(/^node\s+/, '')).map(f => ['emergence', f]),
  ...['core', 'digest-regression', 'v1.1.0-additions', 'v1.4-additions'].map(n => ['warp', `test/${n}.test.js`]),
];
let passed = 0, failed = 0;
for (const [dir, file] of suites) {
  const r = spawnSync(process.execPath, [file], { cwd: path.join(ROOT, dir), encoding: 'utf8', timeout: 120000 });
  const m = String(r.stdout || '').match(/(\d+)\s*passed,?\s+(\d+)\s*failed/);
  if (!m || r.status !== 0) { failed += m ? Math.max(1, +m[2]) : 1; passed += m ? +m[1] : 0; console.error(`  ✗ ${dir}/${file}\n${String(r.stdout).slice(-800)}${String(r.stderr).slice(-800)}`); continue; }
  passed += +m[1]; failed += +m[2];
  console.log(`  ✓ ${dir}/${file} — ${m[1]} passed`);
}
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
