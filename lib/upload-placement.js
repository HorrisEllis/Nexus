'use strict';
/**
 * lib/upload-placement.js — UP1/UP2: where each file of an uploaded zip goes in a repo, said with why, before anything is written.
 * comp_id: nexus.lib.upload-placement
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (UP1_placement_tool, UP2_learned_placements)
 *
 * James, 2026-10-19: "i want to be able to upload files to idearium repos. upload zip with an intent, have it map to nexus using a
 * tool, then ask me with the option to edit the location and where they go in relation to the system or the registry. like i want
 * to try to make something that can do what you can, when uploading zips, or making requests."
 *
 * What the coder does with a zip, written down as a tool (no model — deterministic first, docs/CLAUDE.md):
 *   1. the zip's wrapper folder is packaging, not location — stripped only when that lands on the repo's real paths (lib/intake.js
 *      _claimedPath's rule, applied to the whole zip so one file cannot be stripped differently from its siblings);
 *   2. each file: his learned rule first → the same path already there (identical or replace) → the same bytes / the one file of
 *      that name elsewhere → a folder that already exists → the system the intent names → new, kept where the zip had it;
 *   3. what it means for the system and the registry: its system (top-level folder), what it requires (resolved against the tree
 *      and the rest of the upload), and who already requires that path (requiredBy — what a replace can break).
 * Every row says why and how sure; nothing here writes. answer() checks his edits; learn() turns his edits into rules (UP2).
 *
 *   index({ paths, sha, readText, maxScan })  → the tree, once: paths, dirs, systems, basenames, reverse requires
 *   plan({ files, intent, tree, learned })    → { strip, rows: [{ from, rel, to, action, system, why, confidence, alternatives,
 *                                                 requires, requiredBy, binary, sha256, conflict }], skipped, stats }
 *   answer(plan, edits)                       → { ok, writes: [{ from, to, action, binary }], skipped, errors }
 *   learn(plan, edits, rules)                 → rules (merged, counted)
 *
 * NC0 debt (docs/CLAUDE.md addendum): requiresOf() is a small JS/ESM scan; every edge it gives says discovered: 'js-require-scan'
 * and a file in any other language says requires: 'unknown'. It moves behind the JS adapter when AD2 lands.
 */
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.upload-placement';
const VERSION = '1.0.0';

const JUNK = /(^|\/)(__MACOSX(\/|$)|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;
const JS_EXT = /\.(c|m)?(j|t)sx?$/i;
const RESOLVE_EXT = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '/index.js', '/index.mjs', '/index.ts'];
// names too common to say "this is that file" from the name alone
const GENERIC = new Set(['index.js', 'index.ts', 'index.html', 'index.mjs', 'main.js', 'app.js', 'readme.md', 'package.json', 'package-lock.json',
  'config.js', 'config.json', 'utils.js', 'util.js', 'helpers.js', 'types.ts', 'styles.css', 'style.css', 'test.js', 'license', 'version',
  '.gitignore', 'changelog.md', 'server.js', 'cli.js']);
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'into', 'on', 'it', 'this', 'that', 'with', 'my', 'i', 'is', 'be',
  'add', 'put', 'make', 'new', 'files', 'file', 'zip', 'upload', 'some', 'these', 'those', 'want', 'need', 'so', 'as', 'from', 'at']);

const _norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/').replace(/^\/+/, '');
const _sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const _words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));

/** safeRel(p) — a repo-relative path a person or the tool may write to, or null (absolute, .., empty, a drive letter). */
function safeRel(p) {
  const n = _norm(p);
  if (!n || /^[a-zA-Z]:/.test(String(p)) || String(p).startsWith('/')) return null;
  if (n.split('/').some(s => s === '..' || s === '.' || s === '')) return null;
  return n;
}

/** requiresOf(code) → [spec] — relative and bare specifiers of require()/import/import()/export-from, comments and strings aside. */
function requiresOf(code) {
  const src = String(code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  const out = new Set();
  const re = /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)|\bimport\s*(?:[\w*{}\s,]+\s*from\s*)?(['"])([^'"]+)\3|\bimport\s*\(\s*(['"])([^'"]+)\5\s*\)|\bexport\s+[\w*{}\s,]+\s+from\s+(['"])([^'"]+)\7/g;
  let m; while ((m = re.exec(src))) out.add(m[2] || m[4] || m[6] || m[8]);
  return [...out];
}

/** resolve(spec, fromRel, has) → repo path | null — a relative spec against a set of paths, Node's extension order. */
function resolve(spec, fromRel, has) {
  if (!/^\.{1,2}\//.test(spec)) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  if (base.startsWith('..')) return null;
  for (const e of RESOLVE_EXT) if (has(base + e)) return base + e;
  return null;
}

/**
 * index({ paths, sha, readText, maxScan }) — the repo's tree, read once.
 *   paths     every file path in the repo (repo-relative)
 *   sha(p)    optional — the file's sha256 (used only for files sharing a basename with an upload)
 *   readText(p) optional — a JS file's text, for the reverse require index (who requires what); bounded by maxScan files
 */
function index({ paths = [], sha = null, readText = null, maxScan = 4000 } = {}) {
  const set = new Set(paths.map(_norm));
  const dirs = new Set(); const byBase = new Map(); const systems = new Set();
  for (const p of set) {
    const parts = p.split('/');
    if (parts.length > 1) systems.add(parts[0]);
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    const b = parts[parts.length - 1].toLowerCase();
    if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(p);
  }
  const requiredBy = new Map(); let scanned = 0, cut = 0;
  if (readText) {
    for (const p of set) {
      if (!JS_EXT.test(p) || /(^|\/)node_modules\//.test(p)) continue;
      if (scanned >= maxScan) { cut++; continue; }
      scanned++;
      let t = null; try { t = readText(p); } catch (_) {}
      if (!t) continue;
      for (const s of requiresOf(t)) { const r = resolve(s, p, (x) => set.has(x)); if (r) { if (!requiredBy.has(r)) requiredBy.set(r, []); requiredBy.get(r).push(p); } }
    }
  }
  return { paths: set, dirs, byBase, systems, requiredBy, sha: sha || (() => null), scanned, cut };
}

/** treeFromDir(root, { maxFiles }) → index(...) over a repo on disk (node_modules, .git, .nexus and dot-folders skipped) */
function treeFromDir(root, { maxFiles = 50000, maxScan = 4000 } = {}) {
  const fs = require('fs');
  const SKIP = new Set(['node_modules', '.git', '.nexus', '.svn', '__pycache__']);
  const paths = [];
  (function walk(dir, rel) {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (paths.length >= maxFiles) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), r); }
      else if (e.isFile() && !e.name.startsWith('.nexus-')) paths.push(r);
    }
  })(root, '');
  const shaCache = new Map();
  const sha = (p) => { if (!shaCache.has(p)) { let s = null; try { s = _sha(fs.readFileSync(path.join(root, p))); } catch (_) {} shaCache.set(p, s); } return shaCache.get(p); };
  const readText = (p) => { try { const st = fs.statSync(path.join(root, p)); return st.size > 512 * 1024 ? null : fs.readFileSync(path.join(root, p), 'utf8'); } catch (_) { return null; } };
  const t = index({ paths, sha, readText, maxScan });
  t.truncated = paths.length >= maxFiles;
  return t;
}

/** the wrapper strip for the whole zip: the k (0..3) leading folders whose removal lands most files on the repo's real paths/dirs */
function _strip(rels, tree) {
  const depth = Math.min(3, Math.min(...rels.map(r => r.split('/').length - 1)));
  let best = { k: 0, score: -1, landed: 0 };
  for (let k = 0; k <= depth; k++) {
    const lead = new Set(rels.map(r => r.split('/').slice(0, k).join('/')));
    if (k > 0 && lead.size !== 1) break;   // only a wrapper every file shares is packaging
    let landed = 0, dirHit = 0;
    for (const r of rels) { const s = r.split('/').slice(k).join('/'); if (tree.paths.has(s)) landed++; else if (tree.dirs.has(path.posix.dirname(s))) dirHit++; }
    const score = landed * 2 + dirHit;
    if (score > best.score) best = { k, score, landed, dirHit, wrapper: k ? [...lead][0] : null };
  }
  if (best.k > 0 && best.score === 0) best = { k: 0, score: 0, landed: 0, dirHit: 0, wrapper: null };
  return best;
}

/** intent → the systems it names: a top-level folder whose name (or its words) appears in the intent */
function _intentSystems(intent, tree) {
  const w = new Set(_words(intent));
  const hits = [];
  for (const s of tree.systems) {
    const sw = _words(s); if (!sw.length) continue;
    const n = sw.filter(x => w.has(x) || w.has(x.replace(/s$/, '')) || w.has(x + 's')).length;
    if (n) hits.push({ system: s, score: n / sw.length });
  }
  return hits.sort((a, b) => b.score - a.score || a.system.localeCompare(b.system)).map(h => h.system);
}

function _learnedTo(rel, rules) {
  const base = path.posix.basename(rel), dir = path.posix.dirname(rel);
  const exact = (rules || []).filter(r => r.kind === 'file' && r.from === rel).sort((a, b) => b.n - a.n)[0];
  if (exact) return { to: exact.to, rule: exact };
  const named = (rules || []).filter(r => r.kind === 'name' && r.from === base.toLowerCase()).sort((a, b) => b.n - a.n)[0];
  if (named) return { to: named.to, rule: named };
  const dirs = (rules || []).filter(r => r.kind === 'dir' && (dir === r.from || dir.startsWith(r.from + '/') || r.from === '.'))
    .sort((a, b) => b.from.length - a.from.length || b.n - a.n);
  if (dirs.length) { const r = dirs[0]; const tail = r.from === '.' ? rel : rel.slice(r.from.length + 1); return { to: path.posix.join(r.to === '.' ? '' : r.to, tail), rule: r }; }
  return null;
}

/**
 * plan({ files, intent, tree, learned }) → the proposal. files: lib/zip-ingest.js realFiles ({ path, buffer, binary, sha256 })
 * or { path, text }. tree: index(...). learned: rules from learn().
 */
function plan({ files = [], intent = '', tree = index({}), learned = [] } = {}) {
  const skipped = [];
  const items = [];
  for (const f of files) {
    const from = _norm(f.path);
    if (!from) continue;
    if (JUNK.test(from)) { skipped.push({ from, why: 'packaging junk (__MACOSX, .DS_Store, Thumbs.db)' }); continue; }
    if (!safeRel(from)) { skipped.push({ from, why: 'unsafe path in the zip (absolute or ..) — never written' }); continue; }
    const buf = f.buffer ? f.buffer : Buffer.from(String(f.text == null ? '' : f.text), 'utf8');
    items.push({ from, buf, binary: !!f.binary, sha256: f.sha256 || _sha(buf) });
  }
  if (!items.length) return { strip: { k: 0, wrapper: null }, rows: [], skipped, stats: { files: 0 }, intent };
  const strip = _strip(items.map(i => i.from), tree);
  const sysFromIntent = _intentSystems(intent, tree);
  const uploadTargets = new Set();

  const rows = items.map((it) => {
    const rel = it.from.split('/').slice(strip.k).join('/');
    const base = path.posix.basename(rel).toLowerCase();
    const cands = [];
    const add = (to, why, confidence, extra = {}) => { const s = safeRel(to); if (s && !cands.some(c => c.to === s)) cands.push({ to: s, why, confidence, ...extra }); };
    const lr = _learnedTo(rel, learned);
    if (lr) add(lr.to, 'learned', 0.9, { note: `his earlier answer: ${lr.rule.kind} ${lr.rule.from} → ${lr.rule.to} (${lr.rule.n}×)` });
    if (tree.paths.has(rel)) add(rel, strip.k ? 'exists-after-strip' : 'exists', 0.9);
    const same = (tree.byBase.get(base) || []).filter(p => p !== rel);
    for (const p of same) { const s = tree.sha(p); if (s && s === it.sha256) add(p, 'same-bytes', 0.95); }
    if (same.length === 1 && !GENERIC.has(base)) add(same[0], 'same-name', 0.6);
    const dir = path.posix.dirname(rel);
    if (dir !== '.' && tree.dirs.has(dir)) add(rel, 'dir-exists', 0.7);
    for (const s of sysFromIntent.slice(0, 2)) if (rel.split('/')[0] !== s) add(path.posix.join(s, rel), 'intent-system', 0.5, { note: `the intent names ${s}/` });
    add(rel, 'new', 0.3);
    cands.sort((a, b) => b.confidence - a.confidence);
    const pick = cands[0];
    const action = tree.paths.has(pick.to) ? (tree.sha(pick.to) && tree.sha(pick.to) === it.sha256 ? 'identical' : 'replace') : 'create';
    uploadTargets.add(pick.to);
    return { from: it.from, rel, to: pick.to, action, why: pick.why, confidence: pick.confidence, ...(pick.note ? { note: pick.note } : {}),
      alternatives: cands.slice(1).map(c => ({ to: c.to, why: c.why, confidence: c.confidence })), binary: it.binary, sha256: it.sha256, bytes: it.buf.length,
      _code: !it.binary && JS_EXT.test(rel) ? it.buf.toString('utf8') : null };
  });

  // the rest needs every row's place: requires resolve against the tree AND the upload; two rows to one path is a conflict
  const placed = new Map(rows.map(r => [r.to, r]));
  const has = (p) => tree.paths.has(p) || placed.has(p);
  const seen = new Map();
  for (const r of rows) {
    r.system = r.to.includes('/') ? r.to.split('/')[0] : '(root)';
    r.systemExists = r.system === '(root)' || tree.systems.has(r.system);
    if (r._code != null) {
      r.requires = requiresOf(r._code).map(spec => {
        if (!/^\.{1,2}\//.test(spec)) return { spec, kind: spec.startsWith('node:') ? 'builtin' : 'package', discovered: 'js-require-scan' };
        const to = resolve(spec, r.to, has);
        return { spec, resolved: to, in: to ? (tree.paths.has(to) ? 'tree' : 'upload') : 'missing', discovered: 'js-require-scan' };
      });
    } else r.requires = r.binary ? [] : 'unknown';
    r.requiredBy = (tree.requiredBy.get(r.to) || []).slice(0, 20);
    if (r.requiredBy.length && r.action === 'replace') r.risk = `${(tree.requiredBy.get(r.to) || []).length} file(s) require ${r.to} — a replace can break them`;
    const missing = Array.isArray(r.requires) ? r.requires.filter(q => q.in === 'missing').map(q => q.spec) : [];
    if (missing.length) r.warnings = [`requires that resolve nowhere from ${r.to}: ${missing.join(', ')}`];
    delete r._code;
    if (seen.has(r.to)) { r.conflict = seen.get(r.to); rows.find(x => x.from === seen.get(r.to)).conflict = r.from; } else seen.set(r.to, r.from);
  }
  const stats = { files: rows.length, create: rows.filter(r => r.action === 'create').length, replace: rows.filter(r => r.action === 'replace').length,
    identical: rows.filter(r => r.action === 'identical').length, conflicts: rows.filter(r => r.conflict).length, learned: rows.filter(r => r.why === 'learned').length,
    lowConfidence: rows.filter(r => r.confidence < 0.5).length, binary: rows.filter(r => r.binary).length, scanned: tree.scanned, scanCut: tree.cut };
  return { strip: { k: strip.k, wrapper: strip.wrapper || null, landed: strip.landed || 0 }, intent, intentSystems: sysFromIntent, rows, skipped, stats };
}

/**
 * answer(plan, edits) — his answer checked. edits: [{ from, to?, skip? }] (rows he did not touch keep the proposal; an identical
 * row is skipped unless he gives it a path). → { ok, writes, skipped, errors } — nothing written here.
 */
function answer(p, edits = []) {
  const byFrom = new Map((edits || []).map(e => [_norm(e.from), e]));
  const errors = [], writes = [], skipped = [];
  for (const e of edits || []) if (!p.rows.some(r => r.from === _norm(e.from))) errors.push(`${e.from}: not a file of this upload`);
  for (const r of p.rows) {
    const e = byFrom.get(r.from) || {};
    if (e.skip || (r.action === 'identical' && !e.to)) { skipped.push({ from: r.from, why: e.skip ? 'he skipped it' : `identical to ${r.to} already in the repo` }); continue; }
    const to = e.to != null ? safeRel(e.to) : r.to;
    if (!to) { errors.push(`${r.from}: "${e.to}" is not a path inside the repo`); continue; }
    writes.push({ from: r.from, to, binary: r.binary, edited: e.to != null && to !== r.to, proposed: r.to });
  }
  const dup = new Map(); for (const w of writes) dup.set(w.to, (dup.get(w.to) || []).concat(w.from));
  for (const [to, fs] of dup) if (fs.length > 1) errors.push(`${fs.join(' and ')} would both go to ${to} — give one another path or skip it`);
  return { ok: errors.length === 0, writes, skipped, errors };
}

/**
 * learn(plan, edits, rules) — UP2: his edits become rules plan() reads first next time. A moved file whose name he kept teaches
 * its folder (dir rule: the zip folder → his folder); a renamed one teaches its name (name rule). Counted, never replaced (§0.3).
 */
function learn(p, edits = [], rules = []) {
  const out = (rules || []).map(r => ({ ...r }));
  const bump = (kind, from, to) => { const r = out.find(x => x.kind === kind && x.from === from && x.to === to); if (r) { r.n++; r.at = Date.now(); } else out.push({ kind, from, to, n: 1, at: Date.now() }); };
  for (const e of edits || []) {
    const r = p.rows.find(x => x.from === _norm(e.from)); const to = e.to != null ? safeRel(e.to) : null;
    if (!r || e.skip || !to || to === r.to) continue;
    if (path.posix.basename(to) === path.posix.basename(r.rel)) bump('dir', path.posix.dirname(r.rel), path.posix.dirname(to));
    else bump('name', path.posix.basename(r.rel).toLowerCase(), to);
  }
  return out;
}

module.exports = { MODULE_ID, VERSION, index, treeFromDir, plan, answer, learn, requiresOf, resolve, safeRel };
