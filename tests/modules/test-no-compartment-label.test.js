'use strict';
/**
 * tests/modules/test-no-compartment-label.test.js — 0.60.11 — regression guard.
 * James (2026-10-13): "so why is compartment browser in clearglass ui. should be gone" · "it should have it no where. im
 * scared of regression." No page or window Clear Glass or Idearium draws may show a "compartment · <kind>" label.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
const RX = /compartment\s*(·|&middot;|\\u00b7)\s*\$?\{?[a-z]/i;
const hits = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|css)$/.test(e.name)) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (RX.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) hits.push(`${path.relative(ROOT, p)}:${i + 1}`);
      });
    }
  }
}
for (const d of ['clear-glass/renderer', 'clear-glass/src', 'idearium/ui']) walk(path.join(ROOT, d));
console.log('\ntest-no-compartment-label\n');
if (hits.length) { console.log(`  ✗ NL-01 no "compartment · …" label is drawn anywhere — found:\n    ${hits.join('\n    ')}`); console.log('\n0 passed, 1 failed'); process.exit(1); }
console.log('  ✓ NL-01 no "compartment · …" label is drawn anywhere (Clear Glass renderer + src, Idearium UI)');
console.log('\n1 passed, 0 failed');
