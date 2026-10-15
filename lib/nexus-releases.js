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

const MODULE_ID = 'nexus.lib.nexus-releases';
const REPOSITORY = 'nexus';
const ROOT = path.resolve(__dirname, '..');

/** quoteOf(body) — James's opening words in a version line's [v: …] body, verbatim; null when it does not open with him */
function quoteOf(body) {
  const full = String(body || '').replace(/\*/g, '');
  const at = full.search(/\bJames\b/);
  if (at < 0 || at > 200) return null;
  const s = full.slice(at);
  const m = /^James\b\s*(?:[—:–-]\s*)?/.exec(s);
  let i = m[0].length, end = -1;
  // the leading run: quotes, dates in parentheses, '·' between them — stops at the first word that is not his
  for (;;) {
    const rest = s.slice(i);
    const t = /^(\s+|·|…|—|–|"[^"]*"|'[^']*'(?=\s*(?:·|"|$))|\([^)]{0,120}\))/.exec(rest);
    if (!t) break;
    i += t[0].length;
    if (t[0][0] === '"' || t[0][0] === "'" || (t[0][0] === '(' && end > 0)) end = i;   // a note on what he answered stays with it
  }
  if (end > 0) return s.slice(0, end).trim();
  // a line that tells what he did and then quotes him ("James restarted on 0.59.6 and said "try now"") keeps that context
  const q = /"[^"]*"/.exec(s);
  return q && q.index < 400 ? s.slice(0, q.index + q[0].length).trim() : null;
}

function _lines(root) {
  const src = fs.readFileSync(path.join(root, 'lib/version.js'), 'utf8');
  const out = new Map();
  for (const line of src.split('\n')) {
    const m = /^\s*(?:\/\/\s*previous:\s*[\d.]+\s*—\s*)?system:\s*'(\d+\.\d+\.\d+)',?\s*(?:\/\/\s*\[(?:\d+\.\d+\.\d+):\s*(.*?)\]?\s*)?$/.exec(line);
    if (!m || out.has(m[1])) continue;
    const body = (m[2] || '').trim();
    const p = body.search(/\bProof:/);
    out.set(m[1], { body, proof: p >= 0 ? body.slice(p + 6).trim() : null });
  }
  return out;
}

function _gitCommits(root) {
  // one pass over lib/version.js's history: the commit whose diff added the live `system: '<v>'` line released <v>
  const at = new Map();
  let log = '';
  try { log = execFileSync('git', ['log', '--format=@@C %H %cI', '-p', '--unified=0', '--', 'lib/version.js'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return { at, shallow: null }; }
  let cur = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@C ')) { const [, sha, date] = line.split(' '); cur = { sha, date }; continue; }
    const m = /^\+\s+system:\s*'(\d+\.\d+\.\d+)'/.exec(line);
    if (m && cur) at.set(m[1], cur);   // newest first: a later re-add (a revert) is overwritten by the earlier, first one
  }
  let shallow = null;
  try { shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true'; } catch (_) {}
  return { at, shallow };
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
  const RV = require('./release-version.js');
  const lines = _lines(root);
  const { at, shallow } = _gitCommits(root);
  return RV.released({ root }).map(version => {
    const l = lines.get(version) || { body: '', proof: null };
    const g = at.get(version) || null;
    const cl = `CHANGELOG-${version}.md`;
    const has = fs.existsSync(path.join(root, cl));
    const c = has ? _changelog(root, cl) : { title: null, quote: null };
    return {
      repository: REPOSITORY, version, title: c.title, quote: quoteOf(l.body) || c.quote, notes: l.body || null, proof: l.proof,
      changelog: has ? cl : null,
      gitCommit: g ? g.sha : null, at: g ? Date.parse(g.date) || null : null,
      why: g ? null : shallow ? 'this clone is shallow; its history does not reach this release' : 'no commit in lib/version.js history sets it',
      by: 'nexus.lib.nexus-releases',
    };
  });
}

async function sync(v, { root = ROOT, batch = 100 } = {}) {
  const all = read({ root });
  let recorded = 0, already = 0; const refused = [];
  for (let i = 0; i < all.length; i += batch) {
    const r = await v('POST', '/api/versionium/releases', { releases: all.slice(i, i + batch) }, 60000);
    recorded += r.recorded || 0; already += r.already || 0; refused.push(...(r.refused || []));
  }
  return { ok: !refused.length, repository: REPOSITORY, releases: all.length, recorded, already, refused, unpinned: all.filter(r => !r.gitCommit).length };
}

module.exports = { MODULE_ID, REPOSITORY, quoteOf, read, sync };
