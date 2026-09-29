'use strict';
/**
 * tests/modules/test-import-history.test.js — 0.39.282 N27 (docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James: "I have 700 nexus zips. Some with .git a lot without. I want to import the full (mostly) history from them."
 * A fixture of real zips — a nexus/-rooted one, the same release re-zipped without the root folder (a duplicate), one
 * carrying a real .git with two commits, one whose version is only in package.json, one corrupt — imported into a
 * fresh repo by cli/import-history.js, and every claim in its header checked against git itself.
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');
const Zip = require(path.join(ROOT, 'lib', 'zip.js'));
const IH = require(path.join(ROOT, 'cli', 'import-history.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const G = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'import-history-'));
const ZIPS = path.join(TMP, 'zips');
fs.mkdirSync(ZIPS);
const vjs = (v) => `module.exports = {\n  system: '${v}',   // release\n};\n`;
function mkZip(name, files, when) { fs.writeFileSync(path.join(ZIPS, name), Zip.create(files.map(f => ({ ...f, mtime: when })))); }

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push({ path: path.relative(base, p).split(path.sep).join('/'), data: fs.readFileSync(p) });
  }
  return out;
}

try {
  console.log('\ntest-import-history\n');
  // the repo James runs it in: his own branch with one commit, which must never change
  const INTO = path.join(TMP, 'nexus');
  fs.mkdirSync(INTO);
  G(INTO, 'init', '-q', '-b', 'main'); G(INTO, 'config', 'user.name', 'James'); G(INTO, 'config', 'user.email', 'james@example.com');
  fs.writeFileSync(path.join(INTO, 'README.md'), 'current\n'); G(INTO, 'add', '.'); G(INTO, 'commit', '-q', '-m', 'current work');
  const mainBefore = G(INTO, 'rev-parse', 'main');

  const d1 = new Date(2026, 0, 10, 9, 0, 0), d2 = new Date(2026, 1, 20, 14, 30, 0), d3 = new Date(2026, 4, 5, 18, 0, 0);
  const rel1 = [
    { path: 'lib/version.js', data: vjs('0.1.0') }, { path: 'package.json', data: '{"name":"nexus","version":"0.1.0"}\n' },
    { path: 'src/a.js', data: 'export const a = 1;\n' }, { path: 'node_modules/x/index.js', data: 'junk' }, { path: 'data/state.json', data: '{"live":true}' },
  ];
  mkZip('nexus-0.1.0.zip', rel1.map(f => ({ ...f, path: `nexus/${f.path}` })), d1);
  mkZip('copy-of-first.zip', rel1, d1);                                     // the same release, re-zipped without the root folder
  // 0.2.0 carries a real .git with two commits
  const src2 = path.join(TMP, 'src2'); fs.mkdirSync(path.join(src2, 'lib'), { recursive: true }); fs.mkdirSync(path.join(src2, 'src'));
  G(src2, 'init', '-q', '-b', 'master'); G(src2, 'config', 'user.name', 'James'); G(src2, 'config', 'user.email', 'james@example.com');
  fs.writeFileSync(path.join(src2, 'lib/version.js'), vjs('0.2.0')); fs.writeFileSync(path.join(src2, 'package.json'), '{"name":"nexus","version":"0.2.0"}\n');
  fs.writeFileSync(path.join(src2, 'src/a.js'), 'export const a = 2;\n'); G(src2, 'add', '.'); G(src2, 'commit', '-q', '-m', 'first real commit');
  fs.writeFileSync(path.join(src2, 'src/b.js'), 'export const b = 2;\n'); G(src2, 'add', '.'); G(src2, 'commit', '-q', '-m', 'second real commit');
  const realTip = G(src2, 'rev-parse', 'HEAD');
  mkZip('nexus-0.2.0-with-git.zip', walk(src2), d2);
  mkZip('nexus-0.3.0.zip', [{ path: 'package.json', data: '{"name":"nexus","version":"0.3.0"}\n' }, { path: 'src/a.js', data: 'export const a = 3;\n' }], d3);
  fs.writeFileSync(path.join(ZIPS, 'broken.zip'), 'this is not a zip');

  // ── scan ──
  const s = IH.scanZip(path.join(ZIPS, 'nexus-0.1.0.zip'));
  check('IH-01 scan: sha256, the nexus/ root, the version from lib/version.js, the date from the entries, no .git, files outside node_modules',
    /^[0-9a-f]{64}$/.test(s.sha256) && s.root === 'nexus/' && s.version === '0.1.0' && s.date === d1.toISOString() && s.hasGit === false && s.files === 4, JSON.stringify(s));
  check('IH-02 scan: a .git in the zip is seen; a version only in package.json is read; a broken zip is an error, not a crash',
    IH.scanZip(path.join(ZIPS, 'nexus-0.2.0-with-git.zip')).hasGit === true && IH.scanZip(path.join(ZIPS, 'nexus-0.3.0.zip')).version === '0.3.0' && !!IH.scanZip(path.join(ZIPS, 'broken.zip')).error);

  const dry = IH.run({ inputs: [ZIPS], into: INTO, dryRun: true }, () => {});
  check('IH-03 --dry-run orders by version (dates break ties) and changes nothing', dry.ok && dry.scanned.filter(x => !x.error).map(x => x.version).join() === '0.1.0,0.1.0,0.2.0,0.3.0'
    && G(INTO, 'branch', '--list', 'history/snapshots') === '');

  // ── import ──
  const r = IH.run({ inputs: [ZIPS], into: INTO }, () => {});
  check('IH-04 three releases imported, the re-zip a duplicate, the broken zip failed (reported, the rest still done)',
    r.counts.imported === 3 && r.counts.duplicate === 1 && r.counts.failed === 1 && r.ok === false, JSON.stringify(r.counts));
  const log = G(INTO, 'log', '--format=%s|%aI|%an', 'history/snapshots').split('\n');
  check('IH-05 history/snapshots: one commit per release, oldest first, each dated to its zip, by the repo\'s own author',
    log.length === 3 && /^nexus 0\.3\.0/.test(log[0]) && /^nexus 0\.1\.0/.test(log[2]) && new Date(log[2].split('|')[1]).getTime() === d1.getTime() && log.every(l => l.endsWith('|James')), log.join('\n'));
  const tree1 = G(INTO, 'ls-tree', '-r', '--name-only', 'history/snapshots~2').split('\n');
  check('IH-06 a snapshot holds the release\'s files at the repo root — node_modules and data/ left out', tree1.join() === 'lib/version.js,package.json,src/a.js', tree1.join());
  const body = G(INTO, 'log', '-1', '--format=%B', 'history/snapshots~1');
  check('IH-07 provenance rides in the trailers (zip name, sha256, date, version, source, the fetched refs)',
    /Zip-Name: nexus-0\.2\.0-with-git\.zip/.test(body) && /Zip-Sha256: [0-9a-f]{64}/.test(body) && new RegExp(`Zip-Date: ${d2.toISOString().replace(/\./g, '\\.')}`).test(body)
    && /Nexus-Version: 0\.2\.0/.test(body) && /Import-Source: snapshot\+git/.test(body) && /Git-Refs: refs\/import\/[0-9a-f]{12}\/\*/.test(body), body);
  const sha12 = r.results.find(x => x.zip === 'nexus-0.2.0-with-git.zip').sha256.slice(0, 12);
  check('IH-08 the zip\'s real commits are in refs/import/<sha12>/master — real messages, the real tip', G(INTO, 'rev-parse', `refs/import/${sha12}/master`) === realTip
    && G(INTO, 'log', '--format=%s', `refs/import/${sha12}/master`) === 'second real commit\nfirst real commit');
  check('IH-09 the snapshot of the git zip has no nested .git', !G(INTO, 'ls-tree', '-r', '--name-only', 'history/snapshots~1').split('\n').some(p => p.startsWith('.git')));
  check('IH-10 James\'s own branch is untouched', G(INTO, 'rev-parse', 'main') === mainBefore && G(INTO, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main');
  check('IH-11 a YAML report lands in .git/nexus-history-import/', fs.existsSync(r.report) && /counts:/.test(fs.readFileSync(r.report, 'utf8')) && r.report.includes(path.join('.git', 'nexus-history-import')));

  // ── again ──
  const tipBefore = G(INTO, 'rev-parse', 'history/snapshots');
  const again = IH.run({ inputs: [ZIPS], into: INTO }, () => {});
  check('IH-12 running it again adds nothing: every imported zip is skipped by its sha, the duplicate is still a duplicate',
    G(INTO, 'rev-parse', 'history/snapshots') === tipBefore && again.counts.skipped === 3 && again.counts.duplicate === 1 && !again.counts.imported, JSON.stringify(again.counts));
  // a release found later, older than the tip: appended, and it says so
  mkZip('nexus-0.1.5-found-later.zip', [{ path: 'package.json', data: '{"name":"nexus","version":"0.1.5"}\n' }, { path: 'src/a.js', data: 'export const a = 15;\n' }], new Date(2026, 0, 30));
  const late = IH.run({ inputs: [ZIPS], into: INTO }, () => {});
  const lateR = late.results.find(x => x.zip === 'nexus-0.1.5-found-later.zip');
  check('IH-13 a release found later, older than the tip, is appended (history is never rewritten) and says so', lateR.status === 'imported' && G(INTO, 'rev-list', '--count', 'history/snapshots') === '4'
    && /--rebuild to reorder/.test(lateR.note || ''), JSON.stringify(lateR));
  const rb = IH.run({ inputs: [ZIPS], into: INTO, rebuild: true }, () => {});
  const order = G(INTO, 'log', '--reverse', '--format=%s', 'history/snapshots').split('\n').map(x => x.split(' ')[1]);
  const prev = G(INTO, 'branch', '--list', 'history/snapshots-prev-*');
  check('IH-14 --rebuild rebuilds in full version order and keeps the old branch (nothing lost)', rb.counts.imported === 4 && order.join() === '0.1.0,0.1.5,0.2.0,0.3.0' && /history\/snapshots-prev-\d+/.test(prev), `${order.join()} | ${prev}`);
} catch (e) {
  fail++; console.log(`  ✗ crashed: ${e.stack}`);
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
