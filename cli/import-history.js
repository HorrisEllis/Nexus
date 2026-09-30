#!/usr/bin/env node
'use strict';
/**
 * cli/import-history.js — import NEXUS's history from a folder of release zips (0.39.282, N27 of
 * docs/2026-09-29-nex-node-store-phasemap.spec).
 *
 * James, 2026-09-29: "I have 700 nexus zips. Some with .git a lot without. I want to import the full (mostly) history
 * from them."
 *
 * Run it on the machine that has the zips, from inside the NEXUS git checkout (or pass --into):
 *
 *   node cli/import-history.js D:\nexus-zips            every *.zip in that folder (not recursive; add --recursive)
 *   node cli/import-history.js a.zip b.zip --dry-run     scan and show the order, change nothing
 *
 * What it does, per zip, in version order (dates break ties, and order zips whose version cannot be read):
 *   1. reads it: sha256, where the project root is inside it (the shallowest folder with package.json or
 *      lib/version.js), its version (lib/version.js system, else package.json), its date (the newest file in it),
 *      and whether it carries a .git.
 *   2. a zip WITH .git: its real commits are fetched into refs/import/<sha12>/<branch> — real authors, real dates;
 *      git itself dedupes what repeats across zips.
 *   3. every zip: one SNAPSHOT commit of its tree on the branch history/snapshots (node_modules, data/ and nested .git
 *      left out, the zip's own .gitignore honoured), dated to the zip. A tree already on the branch is a DUPLICATE —
 *      recorded, no commit.
 *   4. provenance rides in each commit's trailers (Zip-Name, Zip-Sha256, Zip-Date, Nexus-Version, Import-Source,
 *      Git-Refs), and a YAML report lands in .git/nexus-history-import/. Running it again skips every zip whose sha is
 *      already on the branch — resumable, idempotent.
 *
 * It never touches your current branch or rewrites history. To join the imported timeline under your branch afterwards:
 *   git merge --allow-unrelated-histories -s ours history/snapshots -m "join imported history"
 * (-s ours keeps your tree exactly; the imported commits become ancestors). --rebuild starts history/snapshots over in
 * full order and keeps the old one as history/snapshots-prev-<time> (nothing lost).
 *
 * Options: --into <git dir> · --branch <name> (history/snapshots) · --dry-run · --rebuild · --recursive · --list <file> ·
 *          --jsonl (one JSON line per event, for a job) ·
 *          --author "Name <email>" (default: the repo's git user) · --keep-data (include data/) · --json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Zip = require('../lib/zip.js');

const MODULE_ID = 'nexus.cli.import-history';
const VERSION = '1.0.0';

// ── args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { inputs: [], into: process.cwd(), branch: 'history/snapshots', dryRun: false, rebuild: false, recursive: false, author: null, keepData: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--into') o.into = argv[++i];
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--author') o.author = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--rebuild') o.rebuild = true;
    else if (a === '--recursive') o.recursive = true;
    else if (a === '--keep-data') o.keepData = true;
    else if (a === '--json') o.json = true;
    else if (a === '--jsonl') o.jsonl = true;
    else if (a === '--list') { const f = argv[++i]; o.inputs.push(...fs.readFileSync(f, 'utf8').split(/\r?\n/).map(x => x.trim()).filter(Boolean)); }   // paths, one per line (700 paths overflow a Windows command line)   // §0.39.283 N30 — one JSON line per event, for a job (lib/history-import-job.js) to follow
    else if (a === '--help' || a === '-h') o.help = true;
    else o.inputs.push(a);
  }
  return o;
}

function listZips(inputs, recursive) {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (recursive) walk(p, depth + 1); }
      else if (/\.zip$/i.test(e.name)) out.push(p);
    }
  };
  for (const inp of inputs) {
    const st = fs.statSync(inp);
    if (st.isDirectory()) walk(inp, 0); else out.push(inp);
  }
  return [...new Set(out.map(p => path.resolve(p)))];
}

// ── reading one zip ───────────────────────────────────────────────────────────
function _semver(v) { const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)/); return m ? m.slice(1).map(Number) : null; }
function compareVersions(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

/** scanZip(file) -> { file, name, sha256, root, version, date, hasGit, files, error? } — reads, never writes */
function scanZip(file) {
  const out = { file, name: path.basename(file), sha256: null, root: null, version: null, date: null, hasGit: false, files: 0 };
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return { ...out, error: `unreadable: ${e.message}` }; }
  out.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  let entries;
  try { entries = new Zip(buf).getEntries(); } catch (e) { return { ...out, error: `not a readable zip: ${e.message}` }; }
  const names = entries.map(e => e.entryName.replace(/\\/g, '/'));
  // the project root: the shallowest folder holding package.json or lib/version.js
  const roots = names.filter(n => /(^|\/)package\.json$/.test(n) || /(^|\/)lib\/version\.js$/.test(n))
    .map(n => n.replace(/(lib\/version\.js|package\.json)$/, ''))
    .filter(r => !/node_modules\//.test(r));
  roots.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
  out.root = roots.length ? roots[0] : '';
  const inRoot = entries.filter(e => e.entryName.replace(/\\/g, '/').startsWith(out.root));
  out.hasGit = inRoot.some(e => e.entryName.replace(/\\/g, '/') === `${out.root}.git/HEAD`);
  const read = (rel) => { const e = entries.find(x => x.entryName.replace(/\\/g, '/') === out.root + rel); try { return e ? e.getData().toString('utf8') : null; } catch (_) { return null; } };
  const vjs = read('lib/version.js');
  const m = vjs && vjs.match(/^\s*system:\s*'(\d+\.\d+\.\d+)'/m);
  if (m) out.version = m[1];
  else { try { const p = JSON.parse(read('package.json') || 'null'); if (p && _semver(p.version)) out.version = p.version; } catch (_) {} }
  let newest = 0;
  for (const e of inRoot) {
    if (e.isDirectory) continue;
    const n = e.entryName.replace(/\\/g, '/');
    if (/\/(\.git|node_modules)\//.test('/' + n)) continue;
    out.files++;
    const t = e.header.mtime ? e.header.mtime.getTime() : 0;
    if (t > newest) newest = t;
  }
  out.date = newest ? new Date(newest).toISOString() : fs.statSync(file).mtime.toISOString();
  out.dateSource = newest ? 'zip entries' : 'zip file mtime (the zip records no entry dates)';
  return out;
}

/** order: by version when both are known and differ, else by date, then by name */
function orderScans(scans) {
  return scans.slice().sort((a, b) => {
    const va = _semver(a.version), vb = _semver(b.version);
    if (va && vb) { const c = compareVersions(va, vb); if (c) return c; }
    return (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name);
  });
}

// ── git ───────────────────────────────────────────────────────────────────────
function git(into, args, { env = {}, input = null, allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: into, encoding: 'utf8', env: { ...process.env, ...env }, input, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error) throw new Error(`git not runnable: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`);
  return r.status === 0 ? String(r.stdout || '').trim() : null;
}

/** what the branch already holds: the zip shas imported, and every tree → the commit that has it */
function branchState(into, branch) {
  const tip = git(into, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`], { allowFail: true });
  const shas = new Set(), trees = new Map();
  let tipVersion = null;
  if (!tip) return { tip: null, shas, trees, tipVersion };
  const log = git(into, ['log', '--format=%H %T%n%B%n--END--', `refs/heads/${branch}`]);
  let cur = null;
  for (const line of log.split('\n')) {
    const h = line.match(/^([0-9a-f]{40}) ([0-9a-f]{40})$/);
    if (h && !cur) { cur = h[1]; if (!trees.has(h[2])) trees.set(h[2], h[1]); continue; }
    const s = line.match(/^Zip-Sha256:\s*([0-9a-f]{64})/);
    if (s) shas.add(s[1]);
    const v = line.match(/^Nexus-Version:\s*(\d+\.\d+\.\d+)/);
    if (v && cur === tip && !tipVersion) tipVersion = v[1];   // the newest commit comes first in the log
    if (line === '--END--') cur = null;
  }
  return { tip, shas, trees, tipVersion };
}

function _rmNestedGit(dir, isRoot = true) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === '.git') { if (!isRoot) fs.rmSync(p, { recursive: true, force: true }); continue; }
    if (e.isDirectory() && e.name !== 'node_modules') _rmNestedGit(p, false);
  }
}

function authorOf(into, given) {
  const m = given && String(given).match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1], email: m[2] };
  const name = git(into, ['config', 'user.name'], { allowFail: true }) || 'nexus history import';
  const email = git(into, ['config', 'user.email'], { allowFail: true }) || 'history-import@nexus.local';
  return { name, email };
}

/**
 * importOne(into, scan, ctx) -> { status: 'imported'|'duplicate'|'skipped'|'failed', commit?, duplicateOf?, gitRefs?, error? }
 */
function importOne(into, scan, ctx) {
  if (scan.error) return { status: 'failed', error: scan.error };
  if (ctx.state.shas.has(scan.sha256)) return { status: 'skipped', reason: 'already on the branch (Zip-Sha256)' };
  const sha12 = scan.sha256.slice(0, 12);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-history-'));
  try {
    new Zip(fs.readFileSync(scan.file)).extractAllTo(tmp, true);
    const root = path.join(tmp, scan.root || '');
    let gitRefs = null;
    if (scan.hasGit) {
      const got = git(into, ['fetch', '--no-tags', '--quiet', root, `+refs/heads/*:refs/import/${sha12}/*`], { allowFail: true });
      gitRefs = got === null ? `fetch failed (the zip's .git may be partial)` : `refs/import/${sha12}/*`;
    }
    _rmNestedGit(root, true);
    if (fs.existsSync(path.join(root, '.git'))) fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
    // the index lives OUTSIDE the work tree: a zip with no root folder extracts straight into tmp, and git would snapshot
    // its own index lock as a file of the release
    const idxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-history-index-'));
    ctx._cleanup = () => { try { fs.rmSync(idxDir, { recursive: true, force: true }); } catch (_) {} };
    const index = path.join(idxDir, 'index');
    const env = { GIT_INDEX_FILE: index, GIT_WORK_TREE: root };
    const exclude = [':(exclude,glob)**/node_modules/**', ':(exclude,glob)node_modules/**', ...(ctx.keepData ? [] : [':(exclude,glob)data/**'])];
    git(into, ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'add', '-A', '--', '.', ...exclude], { env });
    const tree = git(into, ['write-tree'], { env });
    if (ctx.state.trees.has(tree)) return { status: 'duplicate', duplicateOf: ctx.state.trees.get(tree), tree, gitRefs };
    const when = scan.date;
    const trailers = [
      `Zip-Name: ${scan.name}`, `Zip-Sha256: ${scan.sha256}`, `Zip-Date: ${when}`, `Nexus-Version: ${scan.version || 'unknown'}`,
      `Import-Source: ${scan.hasGit ? 'snapshot+git' : 'snapshot'}`, ...(gitRefs ? [`Git-Refs: ${gitRefs}`] : []), `Imported-By: ${MODULE_ID} ${VERSION}`,
    ];
    const msg = `nexus ${scan.version || '(version unknown)'} — ${scan.name}\n\nA snapshot of the release zip, imported by cli/import-history.js (N27).\n\n${trailers.join('\n')}\n`;
    const a = ctx.author;
    const cenv = { GIT_AUTHOR_NAME: a.name, GIT_AUTHOR_EMAIL: a.email, GIT_AUTHOR_DATE: when, GIT_COMMITTER_NAME: a.name, GIT_COMMITTER_EMAIL: a.email, GIT_COMMITTER_DATE: when };
    const commit = git(into, ['commit-tree', tree, ...(ctx.state.tip ? ['-p', ctx.state.tip] : []), '-F', '-'], { env: cenv, input: msg });
    git(into, ['update-ref', `refs/heads/${ctx.branch}`, commit, ...(ctx.state.tip ? [ctx.state.tip] : ['0'.repeat(40)])]);
    const outOfOrder = ctx.lastVersion && _semver(scan.version) && compareVersions(_semver(scan.version), ctx.lastVersion) < 0;
    ctx.state.tip = commit; ctx.state.trees.set(tree, commit); ctx.state.shas.add(scan.sha256);
    if (_semver(scan.version)) ctx.lastVersion = _semver(scan.version);
    return { status: 'imported', commit, tree, gitRefs, ...(outOfOrder ? { note: 'appended after a newer version (run with --rebuild to reorder)' } : {}) };
  } catch (e) {
    return { status: 'failed', error: e.message };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    if (ctx._cleanup) { ctx._cleanup(); ctx._cleanup = null; }
  }
}

function _yaml(v, ind = '') {
  if (Array.isArray(v)) return v.map(x => `\n${ind}- ${_yaml(x, ind + '  ').replace(/^\n\s*/, '')}`).join('');
  if (v && typeof v === 'object') return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `\n${ind}${k}: ${typeof x === 'object' && x !== null ? _yaml(x, ind + '  ') : JSON.stringify(x)}`).join('');
  return JSON.stringify(v);
}

/** run(opts, log) -> { ok, into, branch, scanned, results, counts, report } */
function run(opts, log = console.log) {
  const into = path.resolve(opts.into || process.cwd());
  if (git(into, ['rev-parse', '--git-dir'], { allowFail: true }) === null) return { ok: false, error: `${into} is not a git repository` };
  const branch = opts.branch || 'history/snapshots';
  const zips = listZips(opts.inputs || [], !!opts.recursive);
  if (!zips.length) return { ok: false, error: 'no .zip files found in what was given' };
  log(`[import-history] scanning ${zips.length} zip(s)…`);
  const ev = typeof opts.onEvent === 'function' ? opts.onEvent : () => {};
  ev({ phase: 'scan', total: zips.length });
  const scans = orderScans(zips.map((z, i) => { const s = scanZip(z); ev({ phase: 'scanned', i: i + 1, total: zips.length, zip: s.name }); if ((i + 1) % 25 === 0) log(`  scanned ${i + 1}/${zips.length}`); return s; }));
  if (opts.dryRun) {
    for (const s of scans) log(`  ${s.version || '?.?.?'}  ${s.date}  ${s.hasGit ? 'git ' : '    '} ${s.name}${s.error ? `  ERROR ${s.error}` : ''}`);
    ev({ phase: 'order', order: scans.map(s => ({ zip: s.name, version: s.version, date: s.date, hasGit: s.hasGit, error: s.error || null, sha256: s.sha256 })) });
    return { ok: true, dryRun: true, into, branch, scanned: scans, results: [], counts: {} };
  }
  if (opts.rebuild && git(into, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`], { allowFail: true })) {
    const keep = `${branch}-prev-${Date.now()}`;
    git(into, ['branch', '-m', branch, keep]);
    log(`[import-history] --rebuild: the old ${branch} is kept as ${keep}`);
  }
  const state = branchState(into, branch);
  const ctx = { branch, state, author: authorOf(into, opts.author), keepData: !!opts.keepData, lastVersion: _semver(state.tipVersion) };
  const results = [];
  scans.forEach((s, i) => {
    const r = importOne(into, s, ctx);
    results.push({ zip: s.name, sha256: s.sha256, version: s.version, date: s.date, hasGit: s.hasGit, ...r });
    ev({ phase: 'zip', i: i + 1, total: scans.length, ...results[results.length - 1] });
    log(`  [${i + 1}/${scans.length}] ${r.status.padEnd(9)} ${s.version || '?'} ${s.name}${r.duplicateOf ? ` = ${r.duplicateOf.slice(0, 10)}` : ''}${r.commit ? ` → ${r.commit.slice(0, 10)}` : ''}${r.gitRefs ? ` (+ ${r.gitRefs})` : ''}${r.error ? ` — ${r.error}` : ''}${r.note ? ` — ${r.note}` : ''}`);
  });
  const counts = results.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
  const gitDir = path.resolve(into, git(into, ['rev-parse', '--git-dir']));
  const repDir = path.join(gitDir, 'nexus-history-import');
  fs.mkdirSync(repDir, { recursive: true });
  const report = path.join(repDir, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.yaml`);
  fs.writeFileSync(report, `# nexus history import — ${MODULE_ID} ${VERSION}${_yaml({ into, branch, tip: ctx.state.tip, counts, results })}\n`);
  log(`[import-history] ${JSON.stringify(counts)} · branch ${branch} at ${ctx.state.tip ? ctx.state.tip.slice(0, 10) : '(none)'} · report ${report}`);
  if (ctx.state.tip) log(`  join it under your branch (your tree unchanged): git merge --allow-unrelated-histories -s ours ${branch} -m "join imported history"`);
  return { ok: !counts.failed, into, branch, tip: ctx.state.tip, scanned: scans, results, counts, report };
}

module.exports = { MODULE_ID, VERSION, parseArgs, listZips, scanZip, orderScans, branchState, importOne, run };

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.inputs.length) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 38).join('\n').replace(/^ \* ?/gm, ''));
    process.exit(o.help ? 0 : 1);
  }
  if (o.jsonl) o.onEvent = (e) => process.stdout.write(JSON.stringify({ event: e }) + '\n');
  const r = run(o, (o.json || o.jsonl) ? () => {} : console.log);
  if (o.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (o.jsonl) process.stdout.write(JSON.stringify({ result: { ok: r.ok, error: r.error || null, dryRun: !!r.dryRun, into: r.into, branch: r.branch, tip: r.tip || null, counts: r.counts || {}, report: r.report || null,
    results: (r.results || []).map(x => ({ zip: x.zip, version: x.version, date: x.date, hasGit: x.hasGit, status: x.status, commit: x.commit || null, duplicateOf: x.duplicateOf || null, gitRefs: x.gitRefs || null, error: x.error || null, note: x.note || null })) } }) + '\n');
  if (!r.ok) { if (!o.json) console.error(`[import-history] ${r.error || 'some zips failed — see the report'}`); process.exitCode = 1; }
}
