'use strict';
/**
 * lib/release-version.js — VR1: one version, said the same everywhere.
 * component_id: nexus.lib.release-version
 * Map: docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec (addendum 2026-10-15, VR1)
 *
 * James (2026-10-14): "i also want versions in idearium, github, and each zip, needs to match." He had uploaded
 * Nexus-main-6.zip, and nothing in its name or on its surface said which version it was: the coder compared it file by
 * file with commits to learn it was 0.60.23, six versions behind main.
 *
 * The release is lib/version.js VERSION.system — the one source; everything else states it or is checked against it:
 *   current({ root })     → { version, tag: 'v<version>', zipName: 'nexus-<version>.zip', title: 'Nexus <version>', commit }
 *   agreement({ root })   → { ok, version, places: [{ place, says, ok, why }] } — package.json, CHANGELOG-<version>.md,
 *                           and the git tag when one points at HEAD (a tag that says another version is a mismatch)
 *   released({ root })    → every version with a CHANGELOG, oldest first (the order "how far behind" counts in)
 *   fromFiles(files)      → { version, source } | null — the version a zip carries: its VERSION file, its lib/version.js
 *                           system line, or its package.json (Nexus's, at the zip's root or one folder down)
 *   distance(a, b, { root }) → how many releases b is ahead of a (negative: behind), counted over the changelogs
 *   describe(zipVersion, { root }) → one sentence: "Nexus 0.60.23 — 10 versions behind the running 0.60.33"
 * The module versions (IdeaOS 4.35.0, Clear Glass 3.24.0 …) are not the release; they are labelled as modules wherever
 * they are shown.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'nexus.lib.release-version';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function _system(root) {
  if (path.resolve(root) === ROOT) { delete require.cache[require.resolve('./version.js')]; return require('./version.js').system; }
  const m = fs.readFileSync(path.join(root, 'lib/version.js'), 'utf8').match(/^\s*system:\s*'(\d+\.\d+\.\d+)'/m);
  return m ? m[1] : null;
}
function _git(root, args) { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { return null; } }
const cmp = (a, b) => { const x = SEMVER.exec(a) || [], y = SEMVER.exec(b) || []; for (let i = 1; i <= 3; i++) { const d = Number(x[i] || 0) - Number(y[i] || 0); if (d) return d; } return 0; };

function current({ root = ROOT } = {}) {
  const version = _system(root);
  return { version, tag: `v${version}`, zipName: `nexus-${version}.zip`, title: `Nexus ${version}`, commit: _git(root, ['rev-parse', '--short', 'HEAD']) };
}

function released({ root = ROOT } = {}) {
  // every release lib/version.js has a line for (the current one and each `previous: … system: '…'`), and every
  // CHANGELOG — the changelogs alone miss some (0.60.23–0.60.25 have none)
  const set = new Set();
  try { for (const m of fs.readFileSync(path.join(root, 'lib/version.js'), 'utf8').matchAll(/system:\s*'(\d+\.\d+\.\d+)'/g)) set.add(m[1]); } catch (_) {}
  // 0.60.277 VS1 — the changelogs are Versionium's (§5.15): versionium/lib/nexus-releases.js released() adds theirs to these
  return [...set].sort(cmp);
}

function agreement({ root = ROOT } = {}) {
  const version = _system(root);
  const places = [{ place: 'lib/version.js system', says: version, ok: !!version, why: version ? 'the source' : 'no system version found' }];
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    places.push({ place: 'package.json version', says: pj, ok: pj === version, why: pj === version ? null : `says ${pj}, the release is ${version}` });
  } catch (e) { places.push({ place: 'package.json version', says: null, ok: false, why: e.message }); }
  // 0.60.221 — a VERSION file at the root (kept since 0.60.218) is a place the release is said too: it went stale at 0.60.220 while
  // nothing compared it, and the release zip then carried two root VERSION files saying two versions (RV-03)
  const vfile = path.join(root, 'VERSION');
  if (fs.existsSync(vfile)) { const vv = fs.readFileSync(vfile, 'utf8').trim(); places.push({ place: 'VERSION', says: vv, ok: vv === version, why: vv === version ? null : `says ${vv}, the release is ${version}` }); }
  // 0.60.277 VS1 — whether the release has its changelog is Versionium's to say (§5.15: the changelogs are its own): its agreement
  // (versionium/lib/nexus-releases.js agreement, GET /api/versionium/nexus/agreement) is this one with that line added
  const tags = (_git(root, ['tag', '--points-at', 'HEAD']) || '').split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t));
  for (const t of tags) places.push({ place: `git tag ${t} (at HEAD)`, says: t.slice(1), ok: t.slice(1) === version, why: t.slice(1) === version ? null : `HEAD is tagged ${t}, the release is ${version}` });
  return { ok: places.every(p => p.ok), version, places };
}

/** fromFiles(files, { anyPackage }) — files: [{ path, content }] (content: string or Buffer) or a Map path → content.
 *  → { version, source, nexus } — nexus: the zip is Nexus (it has lib/version.js). anyPackage: any project's
 *  package.json counts (a repo export), not only Nexus's. */
function fromFiles(files, { anyPackage = false } = {}) {
  const list = files instanceof Map ? [...files].map(([p, c]) => ({ path: p, content: c })) : (files || []);
  const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const depth = (p) => norm(p).split('/').length;
  const text = (c) => (Buffer.isBuffer(c) ? c.toString('utf8') : String(c || ''));
  const pick = (rx) => list.filter(f => rx.test(norm(f.path)) && depth(f.path) <= 2).sort((a, b) => depth(a.path) - depth(b.path))[0] || null;
  const lv = list.find(f => /(^|\/)lib\/version\.js$/.test(norm(f.path)) && depth(f.path) <= 3) || null;
  const nexus = !!lv;
  const vf = pick(/(^|\/)VERSION$/);
  if (vf) { const v = text(vf.content).trim().split(/\s+/)[0].replace(/^v/, ''); if (SEMVER.test(v)) return { version: v, source: norm(vf.path), nexus }; }
  if (lv) { const m = text(lv.content).match(/^\s*system:\s*'(\d+\.\d+\.\d+)'/m); if (m) return { version: m[1], source: `${norm(lv.path)} (system)`, nexus }; }
  const pj = pick(/(^|\/)package\.json$/);
  if (pj) { try { const j = JSON.parse(text(pj.content)); if (j && (anyPackage || /^nexus/i.test(String(j.name || ''))) && SEMVER.test(String(j.version || ''))) return { version: j.version, source: norm(pj.path), nexus: nexus || /^nexus/i.test(String(j.name || '')) }; } catch (_) {} }
  return null;
}

function distance(a, b, { root = ROOT } = {}) {
  if (a === b) return 0;
  const all = released({ root });
  const sign = cmp(b, a) >= 0 ? 1 : -1;
  const lo = sign > 0 ? a : b, hi = sign > 0 ? b : a;
  return sign * all.filter(v => cmp(v, lo) > 0 && cmp(v, hi) <= 0).length;
}

function describe(zipVersion, { root = ROOT } = {}) {
  const run = _system(root);
  if (!zipVersion) return `no Nexus version in it (no VERSION file, lib/version.js or package.json) — the running Nexus is ${run}`;
  if (zipVersion === run) return `Nexus ${zipVersion} — the same as the running Nexus`;
  const d = distance(zipVersion, run, { root });
  if (d > 0) return `Nexus ${zipVersion} — ${d} version${d === 1 ? '' : 's'} behind the running ${run}`;
  if (d < 0) return `Nexus ${zipVersion} — ${-d} version${d === -1 ? '' : 's'} ahead of the running ${run}`;
  return `Nexus ${zipVersion} — ${cmp(zipVersion, run) > 0 ? 'newer than' : 'older than'} the running ${run} (a release this Nexus has no record of)`;
}

// 0.60.277 VS1 — the version-line parsers, moved here from lib/nexus-releases.js (now versionium/lib): they read lib/version.js, which lib
// owns (§5.15 rule 2). Versionium's release records, nexus-update and the tests use them from here.
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
    const t = /^(\s+|·|…|—|–|:(?=\s*")|"[^"]*"|'[^']*'(?=\s*(?:·|"|$))|\([^)]{0,160}\))/.exec(rest);   // RN2: '(answering …): "alright."' keeps his answer
    if (!t) break;
    i += t[0].length;
    if (t[0][0] === '"' || t[0][0] === "'" || (t[0][0] === '(' && end > 0)) end = i;   // a note on what he answered stays with it
  }
  if (end > 0) return s.slice(0, end).trim();
  // a line that tells what he did and then quotes him ("James restarted on 0.59.6 and said "try now"") keeps that context
  const q = /"[^"]*"/.exec(s);
  return q && q.index < 400 ? s.slice(0, q.index + q[0].length).trim() : null;
}

/**
 * lineOf(line) → { version, body } for a release line of lib/version.js, in any of the shapes the sessions have written:
 *   system: '0.60.71',   // [0.60.71: …]                 the live one
 *   // prev system: '0.60.69',   // [0.60.69 (built …): …]  (RN2: this shape was not read; its notes were lost)
 *   // previous: '0.60.55',   // [0.60.55: …]
 *   // previous: 0.41.0 — system: '0.41.0',   // [0.41.0: …]
 * The bracket must open with the same version, so another component's line (copilot: '3.7.1', // [0.39.282: …]) is not one.
 */
const LINE_SHAPES = [
  /^\s*(?:\/\/\s*previous:\s*[\d.]+\s*—\s*)?system:\s*'(\d+\.\d+\.\d+)',?\s*(?:\/\/\s*\[(?:\d+\.\d+\.\d+):\s*(.*?)\]?\s*)?$/,
  /^\s*(?:\/\/\s*)?(?:prev(?:ious)?\s*)?(?:system)?:?\s*'(\d+\.\d+\.\d+)',?\s*\/\/\s*\[\1\b[^:\]]*:\s*(.*?)\]?\s*$/,
];
function lineOf(line) {
  for (const re of LINE_SHAPES) { const m = re.exec(line); if (m) return { version: m[1], body: (m[2] || '').trim() }; }
  return null;
}
/** lines({ root }) → [{ version, body }] — every release line of lib/version.js, in file order (lib's file, read by lib) */
function lines({ root = ROOT } = {}) {
  let src = ''; try { src = fs.readFileSync(path.join(root, 'lib/version.js'), 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of src.split('\n')) { const m = lineOf(line); if (m) out.push(m); }
  return out;
}

module.exports = { MODULE_ID, VERSION, current, agreement, released, fromFiles, distance, describe, cmp, quoteOf, lineOf, lines };
