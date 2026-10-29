'use strict';
/**
 * lib/changelog-files.js — the self-model scanners' view of the changelogs: every CHANGELOG*.md in the tree, as source text (0.60.277)
 * component_id: nexus.lib.changelog-files
 *
 * James, 2026-10-29: "a" — Versionium owns the changelogs and the release logic that reads them (§5.15). The scanners (phase-census,
 * spec-census) read the text of every file in the tree the way they read code and .spec files, so they find the changelogs by walking it:
 * at the root (an older tree) and in any system's own changelogs/ folder. They never write them, require no system's code, and are not
 * their canonical reader; a release's changelog as data is Versionium's (GET /api/versionium/nexus/changelog). Decided by his axioms
 * (decision VS_D4, docs/2026-10-07-versionium-releases-phasemap.spec), the coder's reading of §5.15 for scanners, to confirm.
 *
 *   list(root) → [{ name, version, rel, abs }]   one per name, a system's changelogs/ folder before the root
 */
const fs = require('fs');
const path = require('path');

const NAME = /^CHANGELOG.*\.md$/;
const SKIP = new Set(['node_modules', 'data', '_archive', '.git', 'tests', 'docs']);

function list(root) {
  const seen = new Map();
  const add = (dirRel) => {
    let names = []; try { names = fs.readdirSync(path.join(root, dirRel)); } catch (_) { return; }
    for (const n of names) {
      if (!NAME.test(n) || seen.has(n)) continue;
      const m = /^CHANGELOG-(\d+\.\d+\.\d+)/.exec(n);
      seen.set(n, { name: n, version: m ? m[1] : null, rel: dirRel ? `${dirRel}/${n}` : n, abs: path.join(root, dirRel, n) });
    }
  };
  let tops = []; try { tops = fs.readdirSync(root, { withFileTypes: true }); } catch (_) {}
  for (const d of tops) if (d.isDirectory() && !SKIP.has(d.name) && !d.name.startsWith('.')) add(`${d.name}/changelogs`);
  add('');
  return [...seen.values()];
}

module.exports = { list, MODULE_ID: 'nexus.lib.changelog-files' };
