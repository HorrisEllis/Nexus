#!/usr/bin/env node
'use strict';
/**
 * scripts/release-zip.js — VR1: the release zip, named and stamped with the one version.
 *
 * James (2026-10-14): "i also want versions in idearium, github, and each zip, needs to match."
 *
 *   node scripts/release-zip.js [--out dir] [--ref HEAD] [--check]
 * Builds <out>/nexus-<version>.zip from the commit (git archive — tracked files only, so never data/**), the project's files
 * at the zip's root (no folder around them), with a VERSION file at the root saying <version>.
 * §2026-10-17 — James: "the zips need to match the release, and no nest folders". Before, every path sat under
 * nexus-<version>/, so extracting it gave nexus-<version>/nexus-<version>/. COS (cos/app/store.js inspect) and Idearium's
 * zip import already read a zip whose files sit at its root; the name and the VERSION inside still say the release. --check first requires the versions to agree
 * (lib/release-version.js agreement — CK-253) and exits 1 if they do not. Prints one JSON line: { version, tag, zip, bytes }.
 * .github/workflows/release.yml runs it and attaches the zip to the GitHub release v<version>.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const R = require(path.join(ROOT, 'lib/release-version.js'));

function build({ out = path.join(ROOT, 'dist'), ref = 'HEAD', check = false, root = ROOT } = {}) {
  if (check) {
    const a = R.agreement({ root });
    if (!a.ok) { const bad = a.places.filter(p => !p.ok).map(p => `${p.place}: ${p.why}`).join('; '); throw Object.assign(new Error(`versions do not agree — ${bad}`), { code: 'VERSIONS_DISAGREE' }); }
  }
  const cur = R.current({ root });
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-release-'));
  const vf = path.join(tmp, 'VERSION');
  fs.writeFileSync(vf, `${cur.version}\n`);
  const zip = path.join(out, cur.zipName);
  // 0.60.221 — a commit that tracks VERSION at its root already carries it (and --check holds it to the release): adding a second
  // gave the zip two root VERSION files saying two versions
  let tracked = false; try { execFileSync('git', ['cat-file', '-e', `${ref}:VERSION`], { cwd: root, stdio: 'ignore' }); tracked = true; } catch (_) {}
  execFileSync('git', ['archive', '--format=zip', ...(tracked ? [] : [`--add-file=${vf}`]), '-o', zip, ref], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });   // no --prefix: no folder
  fs.rmSync(tmp, { recursive: true, force: true });
  return { version: cur.version, tag: cur.tag, title: cur.title, zip, bytes: fs.statSync(zip).size, notes: (require('../versionium/lib/changelogs.js').forVersion(root, cur.version) || {}).rel || null };   // 0.60.277 — Versionium's (a script may require it)
}

if (require.main === module) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  try { console.log(JSON.stringify(build({ out: arg('--out') ? path.resolve(arg('--out')) : undefined, ref: arg('--ref') || 'HEAD', check: process.argv.includes('--check') }))); }
  catch (e) { console.error(`release-zip: ${e.message}`); process.exit(1); }
}

module.exports = { build };
