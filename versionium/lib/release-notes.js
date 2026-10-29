'use strict';
/**
 * lib/release-notes.js — RN2: a release's changelog written from what landed. component_id: nexus.lib.release-notes
 * Map: docs/2026-10-15-one-contract-raid-releases-phasemap.spec (RN2_changelog_from_the_commits)
 *
 * James (2026-10-16): "tell me all the recent changes. i want a changelog for each change or diff. i want it all syncd
 * with git, versionium, the zip."
 *
 * A release's CHANGELOG-<v>.md is written by the coder; the commits are what actually landed. Between 0.60.48 and
 * 0.60.71, 23 of 47 commits (maps, addenda, docs) belonged to no release and had no changelog at all. Here every commit
 * belongs to the FIRST release that contains it (by the release's commit date), so nothing is counted twice or lost:
 *
 *   commitsOf(releases, { root }) → Map(version → [{ sha, subject, at, files: [{ path, added, removed }], systems }]),
 *                                   plus 'unreleased' for commits after the newest release. releases: nexus-releases read().
 *   attach(releases, { root })    → the releases, each with .commits and .files (paths, by system) filled from git.
 *   markdown(releases, { since }) → one readable record: per release his words, the changelog's title, then every commit
 *                                   with its own message and files. Nothing an agent claims: only what git holds.
 *   write({ root, since, out })   → writes it (default CHANGES.md); `npm run changes -- --since 0.60.47`.
 * Read-only on git; deterministic; no model.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'nexus.lib.release-notes';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..', '..');   // 0.60.277 VS1 — in versionium/lib
const SEP = '\u001e';   // a record separator no commit message carries

const _systemOf = (p) => { const top = String(p).split('/')[0]; return /\./.test(top) && !String(p).includes('/') ? 'root' : top; };
const _cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function _log(root, args) {
  const out = execFileSync('git', ['log', '--no-merges', `--format=${SEP}%H %cI %s`, '--numstat', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const commits = [];
  for (const block of out.split(SEP).slice(1)) {
    const [head, ...rest] = block.split('\n');
    const m = /^(\S+) (\S+) (.*)$/.exec(head); if (!m) continue;
    const files = rest.map(l => l.split('\t')).filter(x => x.length === 3).map(([a, r, p]) => ({ path: p, added: a === '-' ? null : Number(a), removed: r === '-' ? null : Number(r) }));
    commits.push({ sha: m[1], at: m[2], subject: m[3], files, systems: [...new Set(files.map(f => _systemOf(f.path)))].sort() });
  }
  return commits;
}

function _revs(root, args) {
  return execFileSync('git', ['rev-list', '--no-merges', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
}
/** commitsOf(releases) — each commit to the first release (by its commit's date) that contains it. The diffs are read in
 *  one git log; each release only lists ids (rev-list), so the whole history takes about a second, not one diff per release. */
function commitsOf(releases, { root = ROOT, since = null } = {}) {
  const pinned = releases.filter(r => r.gitCommit).sort((a, b) => (a.at || 0) - (b.at || 0) || _cmpV(a.version, b.version));
  // with since: only the diffs after the releases at or before it (git stops at them), not the whole history
  const floor = since ? pinned.filter(r => _cmpV(r.version, String(since)) <= 0).map(r => r.gitCommit) : [];
  const all = new Map(); try { for (const c of _log(root, ['HEAD', ...(floor.length ? ['--not', ...floor] : [])])) all.set(c.sha, c); } catch (_) {}
  const out = new Map(); const before = [];
  for (const r of pinned) {
    const want = !since || _cmpV(r.version, String(since)) > 0;
    if (want) { let ids = []; try { ids = _revs(root, [r.gitCommit, ...(before.length ? ['--not', ...before] : [])]); } catch (_) {} out.set(r.version, ids.map(id => all.get(id)).filter(Boolean)); }
    before.push(r.gitCommit);
  }
  let rest = []; try { rest = _revs(root, ['HEAD', ...(before.length ? ['--not', ...before] : [])]); } catch (_) {}
  out.set('unreleased', rest.map(id => all.get(id)).filter(Boolean));
  return out;
}

/** attach(releases) — .commits (sha, subject, at, systems, file count) and .files (every path, by system) on each release */
function attach(releases, { root = ROOT, since = null } = {}) {
  const by = commitsOf(releases, { root, since });
  return releases.map(r => {
    const cs = by.get(r.version);
    if (!cs) return r;
    const files = {};
    for (const c of cs) for (const f of c.files) (files[_systemOf(f.path)] = files[_systemOf(f.path)] || new Set()).add(f.path);
    return { ...r, commits: cs.map(c => ({ sha: c.sha, at: c.at, subject: c.subject, systems: c.systems, files: c.files.length, added: c.files.reduce((a, f) => a + (f.added || 0), 0), removed: c.files.reduce((a, f) => a + (f.removed || 0), 0) })),
      files: Object.fromEntries(Object.entries(files).sort().map(([k, v]) => [k, [...v].sort()])) };
  });
}

function _since(releases, since) { return since ? releases.filter(r => _cmpV(r.version, String(since)) > 0) : releases; }

/** markdown(releases, { since, root }) — the record a person reads: newest first, every commit under its release */
function markdown(releases, { since = null, root = ROOT, unreleased = true } = {}) {
  const by = commitsOf(releases, { root, since });
  const list = _since(releases, since).sort((a, b) => _cmpV(b.version, a.version));
  const L = [`# Changes${since ? ` since ${since}` : ''}`, '',
    `Written from git by \`lib/release-notes.js\` (RN2), not by hand: every commit is listed once, under the first release that contains it. ` +
    `Each release links its own changelog (the coder's write-up with James's words). Regenerate: \`npm run changes -- --since ${since || '<version>'}\`.`, ''];
  const extra = by.get('unreleased') || [];
  if (unreleased && extra.length) { L.push('## Not yet in a release', ''); for (const c of extra) L.push(..._commitLines(c)); L.push(''); }
  let n = 0, unversioned = 0;
  for (const r of list) {
    const cs = by.get(r.version) || [];
    n += cs.length; unversioned += cs.filter(c => !/^(WIP )?\d+\.\d+\.\d+/.test(c.subject) && !c.subject.includes(`(${r.version})`)).length;
    L.push(`## ${r.version}${r.at ? ` — ${new Date(r.at).toISOString().slice(0, 10)}` : ''}`, '');
    if (r.quote) L.push(`${r.quote}`, '');
    L.push(`- Changelog: ${r.changelog ? `[${r.changelog}](${r.changelog})${r.title ? ` — ${r.title}` : ''}` : 'none'}`);
    L.push(`- Commit: ${r.gitCommit ? `\`${r.gitCommit.slice(0, 8)}\`${r.pinnedBy === 'version' ? ' (found by its number only)' : ''}` : `not pinned — ${r.why || 'no commit found'}`}`);
    L.push(`- ${cs.length} commit(s):`, '');
    for (const c of cs) L.push(..._commitLines(c));
    L.push('');
  }
  L.splice(4, 0, `${list.length} release(s), ${n} commit(s); ${unversioned} of them carried no version of their own (maps, addenda, docs) and are listed under the release that shipped them.`, '');
  return L.join('\n');
}
function _commitLines(c) {
  const add = c.files.reduce((a, f) => a + (f.added || 0), 0), rem = c.files.reduce((a, f) => a + (f.removed || 0), 0);
  const out = [`  - \`${c.sha.slice(0, 8)}\` ${c.at.slice(0, 16).replace('T', ' ')} — ${c.subject}`, `    ${c.files.length} file(s), +${add} −${rem}; systems: ${c.systems.join(', ') || '—'}`];
  const shown = c.files.slice(0, 12).map(f => `\`${f.path}\``);
  if (shown.length) out.push(`    ${shown.join(' · ')}${c.files.length > 12 ? ` · … ${c.files.length - 12} more` : ''}`);
  return out;
}

function write({ root = ROOT, since = null, out = 'CHANGES.md' } = {}) {
  const R = require('./nexus-releases.js');
  const text = markdown(R.read({ root }), { since, root });
  fs.writeFileSync(path.join(root, out), text.endsWith('\n') ? text : text + '\n');
  return { ok: true, out, bytes: Buffer.byteLength(text) };
}

if (require.main === module) {
  const a = process.argv.slice(2); const at = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const r = write({ since: at('--since'), out: at('--out') || 'CHANGES.md' });
  console.log(`[release-notes] ${r.out} written (${r.bytes} bytes)`);
}

module.exports = { MODULE_ID, VERSION, commitsOf, attach, markdown, write };
