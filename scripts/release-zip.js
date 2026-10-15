#!/usr/bin/env node
'use strict';
/**
 * scripts/release-zip.js — VR1: the release zip, named and stamped with the one version.
 *
 * James (2026-10-14): "i also want versions in idearium, github, and each zip, needs to match."
 *
 *   node scripts/release-zip.js [--out dir] [--ref HEAD] [--check]
 * Builds <out>/nexus-<version>.zip from the commit (git archive — tracked files only, so never data/**), every path under
 * nexus-<version>/, with a VERSION file inside saying <version>. --check first requires the versions to agree
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
  const prefix = `nexus-${cur.version}/`;
  execFileSync('git', ['archive', '--format=zip', `--prefix=${prefix}`, `--add-file=${vf}`, '-o', zip, ref], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { version: cur.version, tag: cur.tag, title: cur.title, zip, bytes: fs.statSync(zip).size, notes: fs.existsSync(path.join(root, `CHANGELOG-${cur.version}.md`)) ? `CHANGELOG-${cur.version}.md` : null };
}

if (require.main === module) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  try { console.log(JSON.stringify(build({ out: arg('--out') ? path.resolve(arg('--out')) : undefined, ref: arg('--ref') || 'HEAD', check: process.argv.includes('--check') }))); }
  catch (e) { console.error(`release-zip: ${e.message}`); process.exit(1); }
}

module.exports = { build };
