'use strict';
/**
 * tests/modules/test-readme-atlas.test.js — 0.59.12. James: "In the git, can you copy the atlas to use as the readme? In
 * the GitHub." README.md is the NEXUS atlas; an atlas edit without `node scripts/generate-atlases.js` fails here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'lib/atlas-generate.js'));
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const atlas = fs.readFileSync(path.join(ROOT, 'docs/atlases/nexus-atlas.md'), 'utf8');
try {
  assert.strictEqual(readme, G.README_HEAD + atlas, 'README.md differs from docs/atlases/nexus-atlas.md — run node scripts/generate-atlases.js');
  assert.ok(fs.existsSync(path.join(ROOT, '_archive/README-v5.1.0-superseded-2026-10-11.md')), 'the old README is kept');
  console.log('  ✓ RA-01 README.md is the NEXUS atlas; the old one is archived\n\n1 passed, 0 failed');
} catch (e) { console.error(`  ✗ RA-01 ${e.message}\n\n0 passed, 1 failed`); process.exit(1); }
