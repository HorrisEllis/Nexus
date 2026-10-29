'use strict';
/**
 * lib/nexus-releases.js — RN1: Nexus's own releases, read from where they already live and recorded in Versionium.
 * component_id: nexus.lib.nexus-releases
 * Map: docs/2026-10-15-one-contract-raid-releases-phasemap.spec (RN1)
 *
 * James (2026-10-15): "use versioning in versionium for versions using the api. should be hooked into the atlas. just
 * need more coordination for versions."
 *
 * Every release Nexus has made is already written down three times: its line in lib/version.js (James's words, what was
 * built, the proof), its CHANGELOG-<v>.md, and the git commit that moved VERSION.system. Nothing new is invented here;
 * this reads the three and joins them:
 *   read({ root })        → [{ version, quote, notes, proof, changelog, gitCommit, at }] oldest first. The quote is the
 *                           version line's opening words from James (verbatim, as the line has them); a line that opens
 *                           with something else has quote null, not a made-up one. gitCommit is the commit whose diff set
 *                           `system: '<v>'` — null when this clone's history does not reach it (a shallow clone), said.
 *   sync(v, { root })     → posts them all to Versionium (POST /api/versionium/releases, repository 'nexus') through the
 *                           transport v(method, path, body, timeout) — Idearium's _vcall, or a test's. Idempotent: a
 *                           release already recorded is left as it was and only what it lacked is filled in.
 *   REPOSITORY            → 'nexus'
 * The GitHub release (.github/workflows/release.yml) stays: it is now a mirror of the same version, not the record.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'versionium.lib.nexus-releases';
const REPOSITORY = 'nexus';
const ROOT = path.resolve(__dirname, '..', '..');   // 0.60.277 VS1 — moved into versionium/lib: the repository root is two up

// 0.60.277 VS1 — quoteOf and lineOf parse lib/version.js, which lib owns (§5.15 rule 2): they live in lib/release-version.js and are used from there
const { quoteOf, lineOf } = require('../../lib/release-version.js');

/** the key a release line is recognised by in history: its version and the opening of its own words */
const _bodyKey = (version, body) => `${version}|${String(body || '').replace(/\s+/g, ' ').slice(0, 80)}`;

function _lines(root) {
  // the version lines are lib's (lib/version.js): read through lib's own reader, never by opening its file here (§5.15 rule 1)
  const out = new Map();
  for (const m of require('../../lib/release-version.js').lines({ root })) {
    if (out.has(m.version)) continue;
    const p = m.body.search(/\bProof:/);
    out.set(m.version, { body: m.body, proof: p >= 0 ? m.body.slice(p + 6).trim() : null });
  }
  return out;
}

function _gitCommits(root) {
  // one pass over lib/version.js's history: the commit whose diff added the live `system: '<v>'` line released <v>.
  // RN2 (0.60.72): merges are read too (--diff-merges=first-parent): a release renumbered at a merge (0.60.63, 0.60.64,
  // 0.60.69) has its line added BY the merge — it was pinned to nothing, said "shallow". And a release is found by its
  // line's own words (byBody) before its number: two sessions both wrote 0.60.62, and the oldest '0.60.62' line was the
  // other session's (now 0.60.69) — the number alone pinned the wrong commit.
  const at = new Map(), byBody = new Map();
  let log = '';
  try { log = execFileSync('git', ['log', '--diff-merges=first-parent', '--format=@@C %H %cI', '-p', '--unified=0', '--', 'lib/version.js'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return { at, byBody, shallow: null }; }   // 0.60.111: byBody was missing here, so a copy with no .git (a GitHub zip) failed with "reading 'get'"
  let cur = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@C ')) { const [, sha, date] = line.split(' '); cur = { sha, date }; continue; }
    if (!cur || line[0] !== '+') continue;
    const m = /^\+\s+system:\s*'(\d+\.\d+\.\d+)'/.exec(line);
    if (m) at.set(m[1], cur);   // newest first: a later re-add (a revert) is overwritten by the earlier, first one
    // any shape: a release renumbered at a merge can enter history already as a "// prev system:" line (0.60.62, 0.60.63)
    const l = lineOf(line.slice(1)); if (l && l.body) byBody.set(_bodyKey(l.version, l.body), cur);
  }
  let shallow = null;
  try { shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true'; } catch (_) {}
  return { at, byBody, shallow };
}

function _changelog(root, file) {
  // its title (the first heading) and, when the version line has no quote, the changelog's own opening line from James
  try {
    const head = fs.readFileSync(path.join(root, file), 'utf8').split('\n').slice(0, 20);
    const t = head.find(l => /^#\s/.test(l));
    return { title: t ? t.replace(/^#\s*/, '').trim() : null, quote: quoteOf(head.find(l => /^\**James\b/.test(l)) || '') };
  } catch (_) { return { title: null, quote: null }; }
}

function read({ root = ROOT } = {}) {
  const RV = require('../../lib/release-version.js');
  const lines = _lines(root);
  const { at, byBody, shallow } = _gitCommits(root);
  return released({ root }).map(version => {
    const l = lines.get(version) || { body: '', proof: null };
    const exact = l.body ? byBody.get(_bodyKey(version, l.body)) : null;
    const g = exact || at.get(version) || null;
    const cf = require('./changelogs.js').forVersion(root, version);   // 0.60.274 — versionium/changelogs (the root for an older tree)
    const cl = cf ? cf.name : null, has = !!cf;
    const c = has ? _changelog(root, cf.rel) : { title: null, quote: null };
    return {
      repository: REPOSITORY, version, title: c.title, quote: quoteOf(l.body) || c.quote, notes: l.body || null, proof: l.proof,
      changelog: has ? cl : null, changelogPath: has ? cf.rel : null,
      gitCommit: g ? g.sha : null, at: g ? Date.parse(g.date) || null : null, pinnedBy: g ? (exact ? 'line' : 'version') : null,
      why: g ? null : shallow ? 'this clone is shallow; its history does not reach this release' : 'no commit in lib/version.js history sets it',
      by: 'nexus.lib.nexus-releases',
    };
  });
}

/**
 * sync(v, { root, commits }) — RN2 (0.60.72): each release also carries what landed: its commits (sha, subject, systems,
 * +/−) and its files by system (lib/release-notes.js attach). commits: 'recent' (default; the newest 30 — a boot must not
 * spend seconds on all history), 'all' (the backfill: `releases --sync --all`), or false. Versionium fills only what a
 * recorded release lacked, so the releases already there gain their commits and nothing is rewritten.
 */
async function sync(v, { root = ROOT, batch = 100, commits = 'recent' } = {}) {
  let all = read({ root });
  if (commits) {
    const sorted = all.map(r => r.version).sort((a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    const since = commits === 'all' ? null : sorted[Math.max(0, sorted.length - 31)];
    try { all = require('./release-notes.js').attach(all, { root, since }); } catch (_) { /* git unreadable: the releases still sync, without commits */ }
  }
  let recorded = 0, already = 0; const refused = [];
  for (let i = 0; i < all.length; i += batch) {
    const r = await v('POST', '/api/versionium/releases', { releases: all.slice(i, i + batch) }, 60000);
    recorded += r.recorded || 0; already += r.already || 0; refused.push(...(r.refused || []));
  }
  return { ok: !refused.length, repository: REPOSITORY, releases: all.length, recorded, already, refused, unpinned: all.filter(r => !r.gitCommit).length, withCommits: all.filter(r => Array.isArray(r.commits)).length };
}

/** released({ root }) — every release: lib's version lines (lib/release-version.js) and every changelog Versionium keeps */
function released({ root = ROOT } = {}) {
  const RV = require('../../lib/release-version.js');
  const set = new Set(RV.released({ root }));
  for (const c of require('./changelogs.js').list(root)) { const m = c.name.match(/^CHANGELOG-(\d+\.\d+\.\d+)\.md$/); if (m) set.add(m[1]); }
  return [...set].sort(RV.cmp);
}

/** agreement({ root }) — lib's agreement (lib/version.js, package.json, VERSION, the git tag) with the line only Versionium can say: the changelog */
function agreement({ root = ROOT } = {}) {
  const a = require('../../lib/release-version.js').agreement({ root });
  if (!a.version) return a;
  const C = require('./changelogs.js'), cf = C.forVersion(root, a.version);
  const place = { place: cf ? cf.rel : C.pathFor(a.version), says: cf ? a.version : null, ok: !!cf, why: cf ? null : 'the release has no changelog (its notes on GitHub come from it)' };
  const places = [...a.places, place];
  return { ...a, places, ok: places.every(p => p.ok) };
}

module.exports = { MODULE_ID, REPOSITORY, quoteOf, lineOf, read, sync, released, agreement };
