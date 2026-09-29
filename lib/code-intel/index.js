'use strict';
/**
 * lib/code-intel/index.js — code intelligence for any repo idearium holds: structural chunks, a card per chunk,
 * ranked search, grep, outlines, and the repo overview. The one module both the import pipeline (writes) and the
 * idearium API / agent tools (read) go through.
 * comp_id: nexus.lib.code-intel
 * UUID: nexus-lib-code-intel-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 (docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec, CB1-CB3).
 *
 * On disk, next to the pipeline's own output (never a second store — every file is derived and rebuilt by the same
 * pipeline run, invariant I2):
 *   indexes/cards.json    { version, generatedAt, byChunk:{ id: card }, stats }
 *   indexes/search.json   { version, N, avgLen, docs:{ id: { k, len, tf } } }
 *
 * Reads are cached per repoDir by file mtime, so an agent's tenth search in a row does not re-parse a 20 MB index.
 */

const fs = require('fs');
const path = require('path');
const { planChunks, VERSION: CHUNKER_VERSION, LIMITS } = require('./chunker.js');
const cards = require('./cards.js');
const search = require('./search.js');
const T = require('./text.js');

const INTEL_VERSION = '1.0.0';
const MAX_READ_LINES = parseInt(process.env.CODE_INTEL_READ_MAX_LINES || '250', 10);
const MAX_READ_CHARS = parseInt(process.env.CODE_INTEL_READ_MAX_CHARS || '16000', 10);

const _json = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };
const _mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch (_) { return 0; } };

// ── build (called by idearium/repo/import-pipeline.js after GRAPHING) ─────────────────────────────────
/**
 * buildIntel({ repoDir, files, chunks, resolve, glyphs }) -> { ok, cards:stats, search:stats, error? }
 * files: parsed files with content; chunks: every chunk record of this run (fresh + reused).
 */
function buildIntel({ repoDir, files, chunks, resolve, glyphs = null } = {}) {
  const idx = path.join(repoDir, 'indexes');
  fs.mkdirSync(idx, { recursive: true });
  const built = cards.buildCards({ files, chunks, resolve, glyphs });
  const contentOf = new Map(files.map(f => [f.path, String(f.content || '').split('\n')]));
  const textOf = (c) => { const l = contentOf.get(c.file); return l ? l.slice(c.range.start_line - 1, c.range.end_line).join('\n') : ''; };
  const prev = _json(path.join(idx, 'search.json'));
  const sx = search.buildIndex({ cards: built.byChunk, textOf, prev });
  fs.writeFileSync(path.join(idx, 'cards.json'), JSON.stringify(built), 'utf8');
  fs.writeFileSync(path.join(idx, 'search.json'), JSON.stringify(sx), 'utf8');
  _cache.delete(path.resolve(repoDir));
  return { ok: true, version: INTEL_VERSION, cards: built.stats, search: { N: sx.N, ...sx.stats } };
}

// ── load (cached by mtime) ───────────────────────────────────────────────────────────────────────────
const _cache = new Map();
function load(repoDir) {
  const dir = path.resolve(repoDir);
  const cp = path.join(dir, 'indexes', 'cards.json'), sp = path.join(dir, 'indexes', 'search.json'), fp = path.join(dir, 'indexes', 'files.json');
  const key = `${_mtime(cp)}|${_mtime(sp)}|${_mtime(fp)}`;
  const hit = _cache.get(dir);
  if (hit && hit.key === key) return hit.value;
  const c = _json(cp);
  if (!c || !c.byChunk) return { error: 'this repo has no chunk cards yet — it has not been indexed since 0.39.273 (reindex it: POST /api/repos/:uuid/chunk)' };
  const s = _json(sp) || { docs: {}, N: 0, avgLen: 0 };
  const files = _json(fp) || [];
  const byFile = new Map();
  for (const card of Object.values(c.byChunk)) { if (!byFile.has(card.file)) byFile.set(card.file, []); byFile.get(card.file).push(card); }
  for (const l of byFile.values()) l.sort((a, b) => a.range.start_line - b.range.start_line);
  const byName = new Map();
  for (const card of Object.values(c.byChunk)) {
    for (const n of new Set([card.qualifiedName, card.name, ...(card.defines || [])].filter(Boolean))) {
      const k = n.toLowerCase();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(card.id);
    }
  }
  const value = { dir, cards: c.byChunk, stats: c.stats || null, generatedAt: c.generatedAt, search: s, files, byFile, byName, _lines: new Map() };
  _cache.set(dir, { key, value });
  return value;
}

function _fileLines(intel, file) {
  const abs = path.resolve(intel.dir, file);
  if (!abs.startsWith(intel.dir + path.sep)) return null;
  const m = _mtime(abs);
  const hit = intel._lines.get(file);
  if (hit && hit.m === m) return hit.lines;
  let lines = null;
  try { lines = fs.readFileSync(abs, 'utf8').split('\n'); } catch (_) { lines = null; }
  if (intel._lines.size > 400) intel._lines.clear();
  intel._lines.set(file, { m, lines });
  return lines;
}
function textOf(intel, card) {
  const l = _fileLines(intel, card.file);
  return l ? l.slice(card.range.start_line - 1, card.range.end_line).join('\n') : '';
}
/** the card's range still describes the file on disk? (an edit since the last index shows up as stale) */
function _stale(intel, card) {
  const l = _fileLines(intel, card.file);
  if (!l) return 'file missing';
  if (card.range.end_line > l.length) return 'file is shorter than the indexed range';
  if (card.hash) {
    const h = require('crypto').createHash('sha256').update(l.slice(card.range.start_line - 1, card.range.end_line).join('\n'), 'utf8').digest('hex');
    if (h !== card.hash) return 'file changed since it was indexed';
  }
  return null;
}

// ── resolve: whatever a model wrote → chunk(s) ─────────────────────────────────────────────────────────
/**
 * resolveRef(intel, ref) -> { ids:[chunkId], how } — accepts a chunk id, "path:line", "path#Name", a qualified name
 * ("RepoLayer.writeFile"), a plain name, or a file path (every chunk of it).
 */
function resolveRef(intel, ref) {
  const r = String(ref || '').trim().replace(/^['"`]|['"`]$/g, '');
  if (!r) return { ids: [], how: 'empty' };
  if (intel.cards[r]) return { ids: [r], how: 'id' };
  if (/^chunk:/.test(r) && intel.cards[r.slice(6)]) return { ids: [r.slice(6)], how: 'id' };
  const at = /^(.+?):(\d+)(?:-\d+)?$/.exec(r);
  if (at && intel.byFile.has(at[1].replace(/^\.\//, ''))) {
    const id = search.chunkAt(intel.byFile, at[1].replace(/^\.\//, ''), parseInt(at[2], 10));
    return { ids: id ? [id] : [], how: 'file:line' };
  }
  const hashed = /^(.+?)#(.+)$/.exec(r);
  if (hashed && intel.byFile.has(hashed[1])) {
    const want = hashed[2].toLowerCase();
    const ids = intel.byFile.get(hashed[1]).filter(c => [c.qualifiedName, c.name, ...(c.defines || [])].filter(Boolean).some(n => n.toLowerCase() === want || n.toLowerCase().endsWith('.' + want))).map(c => c.id);
    return { ids, how: 'file#name' };
  }
  const clean = r.replace(/^\.\//, '');
  if (intel.byFile.has(clean)) return { ids: intel.byFile.get(clean).map(c => c.id), how: 'file' };
  const byName = intel.byName.get(r.toLowerCase());
  if (byName && byName.length) return { ids: byName, how: 'name' };
  // "Class.method" where the method is not a chunk of its own (small members group with the class head): the chunk
  // under Class that defines it
  const parts = r.split(/[.#]/);
  if (parts.length === 2) {
    const [owner, member] = parts.map(x => x.toLowerCase());
    const held = Object.values(intel.cards).filter(c => (c.defines || []).some(d => d.toLowerCase() === member)
      && [(c.qualifiedName || ''), (c.parent && intel.cards[c.parent] ? intel.cards[c.parent].qualifiedName || '' : '')].some(q => q.toLowerCase() === owner)).map(c => c.id);
    if (held.length) return { ids: held, how: 'member of' };
  }
  // "Class.method" where the index holds a deeper qualified name, or "method" alone
  const tail = r.toLowerCase().split(/[.#]/).pop();
  const loose = Object.values(intel.cards).filter(c => (c.qualifiedName || '').toLowerCase().endsWith('.' + tail) || (c.name || '').toLowerCase() === tail).map(c => c.id);
  return { ids: loose, how: loose.length ? 'name (loose)' : 'none' };
}

// ── the read surface ─────────────────────────────────────────────────────────────────────────────────
function _brief(c) { return c ? { id: c.id, file: c.file, lines: `${c.range.start_line}-${c.range.end_line}`, kind: c.kind, name: c.qualifiedName || c.name || null, summary: c.summary } : null; }

/**
 * card(repoDir, ref, { code, around }) -> { card, code?, neighbours, stale } | { error, candidates? }
 *   code:true adds the chunk's text with line numbers (capped); around:true adds the prev/next/parent briefs.
 */
function card(repoDir, ref, { code = false, around = true, proof = null } = {}) {
  const intel = load(repoDir);
  if (intel.error) return intel;
  const r = resolveRef(intel, ref);
  if (!r.ids.length) return { error: `no chunk matches "${ref}" — search first (code_search), or pass a chunk id / path:line / path#Name` };
  if (r.ids.length > 1 && r.how !== 'id') {
    return { error: `"${ref}" matches ${r.ids.length} chunks — pick one id`, candidates: r.ids.slice(0, 12).map(id => _brief(intel.cards[id])) };
  }
  const c = intel.cards[r.ids[0]];
  const out = { card: { ...c, lines: `${c.range.start_line}-${c.range.end_line}`, lineCount: c.lines } };
  delete out.card.hash;
  const stale = _stale(intel, c);
  if (stale) out.stale = `${stale} — the text below is the file as it is now; reindex for a fresh card`;
  if (proof) out.proof = proof;
  if (around) out.around = { parent: _brief(intel.cards[c.parent]), prev: _brief(intel.cards[c.prev]), next: _brief(intel.cards[c.next]) };
  if (code) {
    const r = readLines(repoDir, c.file, { start: c.range.start_line, end: c.range.end_line, intel });
    // `more` here means the CHUNK was cut (it is over the read cap), not that the file goes on
    Object.assign(out, r, { more: r.end < c.range.end_line ? `chunk lines ${r.end + 1}-${c.range.end_line} not shown — code_read ${c.file} start=${r.end + 1}` : null });
  }
  return out;
}

/**
 * readLines(repoDir, file, { start, end }) -> { file, start, end, totalLines, text (numbered), more }
 */
function readLines(repoDir, file, { start = 1, end = null, intel = null, maxLines = MAX_READ_LINES, maxChars = MAX_READ_CHARS } = {}) {
  const I = intel || load(repoDir);
  const dir = I.dir || path.resolve(repoDir);
  const rel = String(file || '').replace(/^\.\//, '');
  const abs = path.resolve(dir, rel);
  if (!rel || !abs.startsWith(dir + path.sep)) return { error: `path escapes the repo: ${file}` };
  let lines;
  try { lines = fs.readFileSync(abs, 'utf8').split('\n'); } catch (e) { return { error: `cannot read ${rel}: ${e.code === 'ENOENT' ? 'no such file' : e.message}` }; }
  const total = lines.length;
  const s = Math.max(1, Math.min(total, parseInt(start, 10) || 1));
  let e = Math.min(total, end ? parseInt(end, 10) || total : s + maxLines - 1, s + maxLines - 1);
  if (e < s) e = s;
  let body = '';
  for (let i = s; i <= e; i++) {
    const line = `${i}\t${lines[i - 1]}\n`;
    if (body.length + line.length > maxChars && i > s) { e = i - 1; break; }
    body += line;
  }
  return { file: rel, start: s, end: e, totalLines: total, text: body,
    more: e < total ? `lines ${e + 1}-${total} not shown — read again with start=${e + 1}` : null };
}

/** outline(repoDir, file) -> { file, lines, chunks:[{ id, lines, kind, name, summary, depth }] } */
function outline(repoDir, file) {
  const intel = load(repoDir);
  if (intel.error) return intel;
  const rel = String(file || '').replace(/^\.\//, '');
  const list = intel.byFile.get(rel);
  if (!list) {
    const near = [...intel.byFile.keys()].filter(p => p.endsWith('/' + rel) || p.split('/').pop() === rel.split('/').pop()).slice(0, 8);
    return { error: `no indexed file "${rel}"`, ...(near.length ? { didYouMean: near } : {}) };
  }
  const depthOf = (c) => { let d = 0, x = c; const seen = new Set(); while (x && x.parent && intel.cards[x.parent] && !seen.has(x.id)) { seen.add(x.id); d++; x = intel.cards[x.parent]; } return d; };
  const f = (intel.files || []).find(x => x.path === rel) || {};
  return { file: rel, language: f.language || (list[0] && list[0].language) || null, lineCount: f.lineCount || null,
    chunks: list.map(c => ({ id: c.id, lines: `${c.range.start_line}-${c.range.end_line}`, kind: c.kind, name: c.qualifiedName || c.name || null, depth: depthOf(c), summary: c.summary, exported: c.exported || undefined })) };
}

/** query(repoDir, q, opts) — ranked chunk search (see search.js) */
function query(repoDir, q, opts = {}) {
  const intel = load(repoDir);
  if (intel.error) return intel;
  const limit = Math.max(1, Math.min(50, parseInt(opts.limit, 10) || 10));
  const r = search.query(intel.search, intel.cards, q, { ...opts, limit, textOf: (c) => textOf(intel, c) });
  return { query: q, ...r, ...(r.total > limit ? { more: `${r.total - limit} more chunk(s) matched — narrow with path/kind/language or raise limit` } : {}) };
}

/** grepRepo(repoDir, opts) — exact/regex search over the indexed files */
function grepRepo(repoDir, opts = {}) {
  const intel = load(repoDir);
  const dir = path.resolve(repoDir);
  const files = intel.error ? (_json(path.join(dir, 'indexes', 'files.json')) || []).map(f => f.path) : intel.files.map(f => f.path);
  if (!files.length) return { error: 'this repo has no file index yet — reindex it first' };
  return search.grep({ repoDir: dir, files, chunksByFile: intel.error ? null : intel.byFile, ...opts, limit: Math.max(1, Math.min(200, parseInt(opts.limit, 10) || 50)) });
}

/**
 * definition(repoDir, name) -> { name, definitions:[brief], usedBy:[{ chunkId, name, file, basis }] }
 * "where is X defined and who uses it" in one call.
 */
function definition(repoDir, name) {
  const intel = load(repoDir);
  if (intel.error) return intel;
  const r = resolveRef(intel, name);
  if (!r.ids.length) return { name, definitions: [], note: `nothing in this repo defines "${name}" — try code_search or code_grep` };
  const defs = r.ids.map(id => intel.cards[id]).filter(Boolean);
  const users = [];
  for (const d of defs.slice(0, 5)) for (const u of d.usedBy || []) users.push({ ...u, of: d.id });
  return { name, how: r.how, definitions: defs.slice(0, 12).map(_brief), usedBy: users.slice(0, 40), usedByTotal: defs.reduce((n, d) => n + (d.usedByTotal || 0), 0) };
}

/**
 * overview(repoDir, { graph }) -> the repo in one screen: size, languages, top folders, the files most used, entry
 * points, tests, and how to navigate. For a small model's first call.
 */
function overview(repoDir, { maxFolders = 12 } = {}) {
  const intel = load(repoDir);
  if (intel.error) return intel;
  const files = intel.files || [];
  const langs = {};
  for (const f of files) { const l = f.language || 'other'; langs[l] = (langs[l] || 0) + 1; }
  const folders = new Map();
  for (const f of files) { const top = f.path.includes('/') ? f.path.split('/')[0] + '/' : '(root)'; const x = folders.get(top) || { files: 0, lines: 0 }; x.files++; x.lines += f.lineCount || 0; folders.set(top, x); }
  const usedCount = new Map();
  // "most used" counts resolved imports only — a by-name match is too weak to rank a file on
  for (const c of Object.values(intel.cards)) for (const u of c.usedBy || []) if (u.file !== c.file && u.basis === 'import') usedCount.set(c.file, (usedCount.get(c.file) || 0) + 1);
  const core = [...usedCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f, n]) => ({ file: f, usedFrom: n }));
  const tests = files.filter(f => cards.TEST_RE.test(f.path)).length;
  const readme = files.find(f => /^readme(\.md)?$/i.test(f.path)) || files.find(f => /(^|\/)readme\.md$/i.test(f.path));
  let readmeLine = null;
  if (readme) { const l = _fileLines(intel, readme.path); if (l) readmeLine = (l.find(x => x.trim() && !/^#|^!\[|^<|^\[!/.test(x.trim())) || '').trim().slice(0, 200) || null; }
  const entry = files.map(f => f.path).filter(p => /^(index|main|server|app|cli)\.[cm]?[jt]sx?$|(^|\/)(main|__main__)\.py$|^cmd\/|(^|\/)main\.go$|^src\/(index|main|app)\.[jt]sx?$|package\.json$|pyproject\.toml$|Cargo\.toml$|go\.mod$/.test(p)).slice(0, 10);
  const kinds = {};
  for (const c of Object.values(intel.cards)) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  return {
    files: files.length, chunks: Object.keys(intel.cards).length, lines: files.reduce((n, f) => n + (f.lineCount || 0), 0),
    languages: Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`),
    folders: [...folders.entries()].sort((a, b) => b[1].files - a[1].files).slice(0, maxFolders).map(([k, v]) => `${k} ${v.files} files, ${v.lines} lines`),
    mostUsed: core, entryPoints: entry, testFiles: tests, readme: readmeLine, chunkKinds: kinds,
    indexedAt: intel.generatedAt || null,
    howTo: 'code_search "<what it does>" → code_chunk <id> (card + code) → code_edit. code_outline <file> lists a file; code_grep finds exact text.',
  };
}

/** tree(repoDir, { path, depth }) -> directory listing from the index (files + line counts), bounded */
function tree(repoDir, { path: under = '', depth = 2, limit = 300 } = {}) {
  const intel = load(repoDir);
  const dir = path.resolve(repoDir);
  const files = intel.error ? (_json(path.join(dir, 'indexes', 'files.json')) || []) : intel.files;
  const base = String(under || '').replace(/^\.\/|\/+$/g, '');
  const pref = base ? base + '/' : '';
  const entries = new Map();
  let shown = 0;
  for (const f of files) {
    if (pref && !f.path.startsWith(pref)) continue;
    const rest = f.path.slice(pref.length).split('/');
    const d = Math.max(1, parseInt(depth, 10) || 2);
    const key = rest.length > d ? rest.slice(0, d).join('/') + '/' : rest.join('/');
    const e = entries.get(key) || { files: 0, lines: 0, dir: rest.length > d };
    e.files++; e.lines += f.lineCount || 0; entries.set(key, e);
  }
  const out = [];
  for (const [k, e] of [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (shown++ >= limit) break;
    out.push(e.dir ? `${pref}${k}  (${e.files} files)` : `${pref}${k}  ${e.lines} lines`);
  }
  return { path: base || '.', entries: out, total: entries.size, ...(entries.size > limit ? { more: `${entries.size - limit} more — pass a path to narrow` } : {}) };
}

module.exports = {
  INTEL_VERSION, CHUNKER_VERSION, LIMITS,
  planChunks, buildIntel, load, resolveRef, card, readLines, outline, query, grepRepo, definition, overview, tree, textOf,
  terms: T.terms, cards, search, chunker: require('./chunker.js'), structure: require('./structure.js'),
};
