#!/usr/bin/env node
'use strict';
/**
 * scripts/generate-atlases.js — rewrite the generated section of every system atlas (lib/atlas-generate.js).
 * comp_id: nexus.scripts.generate-atlases
 *
 *   node scripts/generate-atlases.js              every system
 *   node scripts/generate-atlases.js guardian loom only these
 *
 * Reads loom/data/registry.json and loom/data/events.json — run `node loom/bootstrap.js` first when the code moved.
 */
const G = require('../lib/atlas-generate.js');
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const t0 = Date.now();
const r = G.generate({ only: only.length ? only : null });
for (const x of r) console.log(`  ${x.changed ? '✎' : '·'} ${x.atlas.padEnd(40)} ${String(x.files).padStart(5)} files  ${String(x.chars).padStart(7)} chars`);
console.log(`[generate-atlases] ${r.filter(x => x.changed).length}/${r.length} atlases rewritten in ${Date.now() - t0} ms`);
// 0.59.12 — James: "In the git, can you copy the atlas to use as the readme? In the GitHub." The repo's front page is the
// NEXUS atlas; the old README (an Emergence-era design, marked superseded) is kept in _archive/.
const readme = G.syncReadme();
console.log(`  ${readme.changed ? '✎' : '·'} README.md ← docs/atlases/nexus-atlas.md`);
