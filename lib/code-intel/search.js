'use strict';
/**
 * lib/code-intel/search.js — ranked search over every chunk of a repo, and exact grep over its files.
 * comp_id: nexus.lib.code-intel.search
 * UUID: nexus-lib-code-intel-search-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB3. The 0.39.272 repo search matched query tokens against symbol NAMES and file PATHS only — the body of
 * the code was not searchable, so "where do we retry the upload" found nothing unless a function was named that way.
 *
 * buildIndex(cards, textOf, prev) — BM25 over four weighted fields per chunk:
 *     name  qualified name + everything it defines          x4
 *     doc   its doc comment + signature                       x2
 *     path  the file path                                     x1.5
 *     body  every identifier and word in the chunk            x1
 *   A chunk's term vector is cached by (content hash, file, name) so an incremental import re-tokenizes only what
 *   changed. Deterministic, no model, no network.
 *
 * query(index, cards, q, opts) — ranked chunk hits, each with its card summary and the lines that matched.
 * grep(opts) — literal or regex, line by line, with context and the chunk each hit is in.
 */

const fs = require('fs');
const path = require('path');
const T = require('./text.js');

const SEARCH_VERSION = '1.0.0';
const W = { name: 4, doc: 2, path: 1.5, body: 1 };
const K1 = 1.2, B = 0.75;
const TEST_RE = /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.(?:go|py)$|(?:^|\/)test_[^/]+\.py$/i;

function _vector(card, text) {
  const tf = Object.create(null);
  const add = (list, w) => { for (const t of list) tf[t] = (tf[t] || 0) + w; };
  add(T.terms([card.qualifiedName, card.name, ...(card.defines || [])].filter(Boolean).join(' ')), W.name);
  add(T.terms(`${card.doc || ''} ${card.signature || ''}`), W.doc);
  add(T.terms(card.file.replace(/\.[^.\/]+$/, '')), W.path);
  add(T.terms(text), W.body);
  let len = 0;
  for (const k in tf) { tf[k] = Math.round(tf[k] * 10) / 10; len += tf[k]; }
  return { tf, len: Math.round(len) };
}

/**
 * buildIndex({ cards, textOf, prev }) -> { version, N, avgLen, docs: { [chunkId]: { k, len, tf } } }
 * k = the cache key (hash|file|name): a chunk whose key did not change keeps its previous vector.
 */
function buildIndex({ cards, textOf, prev = null } = {}) {
  const t0 = Date.now();
  const prevDocs = prev && prev.version === SEARCH_VERSION && prev.docs ? prev.docs : {};
  const docs = {};
  let reused = 0, made = 0, total = 0;
  for (const card of Object.values(cards)) {
    const k = `${card.hash || ''}|${card.file}|${card.qualifiedName || card.name || ''}|${(card.doc || '').length}`;
    const old = prevDocs[card.id];
    if (old && old.k === k) { docs[card.id] = old; reused++; }
    else { const v = _vector(card, textOf(card)); docs[card.id] = { k, len: v.len, tf: v.tf }; made++; }
    total += docs[card.id].len;
  }
  const N = Object.keys(docs).length;
  return { version: SEARCH_VERSION, generatedAt: Date.now(), N, avgLen: N ? total / N : 0, docs, stats: { reused, made, ms: Date.now() - t0 } };
}

// ── query-time: an inverted index, built once per loaded index and cached ─────────────────────────────
const _inv = new WeakMap();
function _inverted(index) {
  let x = _inv.get(index);
  if (x) return x;
  const post = new Map();
  for (const [id, d] of Object.entries(index.docs || {})) for (const t in d.tf) { let p = post.get(t); if (!p) post.set(t, p = []); p.push(id); }
  x = { post };
  _inv.set(index, x);
  return x;
}

function _globRe(glob) {
  if (!glob) return null;
  let g = String(glob).trim();
  if (!/[*?{]/.test(g)) return new RegExp('^' + g.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\/?$/, '') + '(?:/|$)');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') { if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; } else re += '[^/]*'; }
    else if (c === '?') re += '[^/]';
    else if (c === '{') { const j = g.indexOf('}', i); if (j > i) { re += '(?:' + g.slice(i + 1, j).split(',').map(s => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|') + ')'; i = j; } else re += '\\{'; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function pathMatcher(glob) {
  const re = _globRe(glob);
  if (!re) return () => true;
  const basenameOnly = !String(glob).includes('/');
  return (p) => re.test(p) || (basenameOnly && re.test(p.split('/').pop()));
}

/**
 * query(index, cards, q, { limit, path, language, kind, textOf, includeTests }) -> { hits, total, terms }
 *   hit: { id, file, range, kind, name, summary, score, matched:[term], snippet:[{ line, text }] }
 */
function query(index, cards, q, { limit = 10, path: pathGlob = null, language = null, kind = null, textOf = null, includeTests = null } = {}) {
  const raw = String(q || '').trim();
  if (!raw) return { hits: [], total: 0, terms: [] };
  const qTerms = [...new Set(T.terms(raw))];
  if (!qTerms.length) return { hits: [], total: 0, terms: [], note: 'the query has no searchable words' };
  const inv = _inverted(index);
  const { post } = inv;
  const N = index.N || 1, avg = index.avgLen || 1;
  // a query word that is a prefix of an indexed word, or has one as its prefix ("ident" ~ "identifier", "config" ~
  // "configuration"), counts at half weight — never below 4 letters, never for words that matched exactly
  const expanded = [];
  for (const t of qTerms) {
    if (t.length < 4 || /\d/.test(t)) continue;
    if (!inv.vocab) inv.vocab = [...post.keys()].filter(k => k.length >= 4 && !/\d/.test(k));
    for (const v of inv.vocab) if (v !== t && (v.startsWith(t) || t.startsWith(v)) && Math.min(v.length, t.length) / Math.max(v.length, t.length) >= 0.45) expanded.push([v, t]);
  }
  const wantsTests = includeTests != null ? !!includeTests : /\b(tests?|spec|specs|coverage|assert)\b/i.test(raw);
  const pm = pathMatcher(pathGlob);
  const scores = new Map();
  const matched = new Map();
  const addTerm = (t, credit, weight) => {
    const p = post.get(t);
    if (!p) return;
    const idf = Math.log(1 + (N - p.length + 0.5) / (p.length + 0.5));
    for (const id of p) {
      const d = index.docs[id];
      const f = d.tf[t];
      const s = weight * idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / avg));
      scores.set(id, (scores.get(id) || 0) + s);
      if (!matched.has(id)) matched.set(id, new Set());
      matched.get(id).add(credit);
    }
  };
  for (const t of qTerms) addTerm(t, t, 1);
  for (const [v, t] of expanded) addTerm(v, t, 0.5);
  // exact identifier: the query names a chunk (or something it defines)
  const idents = (raw.match(/[A-Za-z_$][\w$.#]*/g) || []).filter(w => w.length >= 3);
  const identSet = new Set(idents.map(w => w.toLowerCase()));
  const phrase = raw.length >= 4 && raw.length <= 80 && /\s/.test(raw) ? raw.toLowerCase() : null;
  const out = [];
  for (const [id, s0] of scores) {
    const c = cards[id];
    if (!c) continue;
    if (!pm(c.file)) continue;
    if (language && c.language !== language) continue;
    if (kind && c.kind !== kind) continue;
    let s = s0;
    const cover = matched.get(id).size / qTerms.length;
    s *= 0.5 + cover;                                                      // all words present beats one word many times
    const names = [c.qualifiedName, c.name, ...(c.defines || [])].filter(Boolean).map(x => x.toLowerCase());
    if (names.some(n => identSet.has(n) || identSet.has(n.split('.').pop()))) s += 8;
    const isTest = TEST_RE.test(c.file);
    if (isTest && wantsTests) s += 8;                                      // "the test for X": the test outranks X itself
    if (isTest) s *= wantsTests ? 1.6 : 0.55;                              // implementation first, unless tests were asked for
    if (c.kind === 'preamble' || c.kind === 'imports') s *= 0.8;
    if (c.kind === 'export' || c.kind === 'import') s *= 0.5;           // a list of names is where things are wired, not what they do
    out.push({ id, s, cover });
  }
  // phrase: the literal words in order, checked only on the top slice (reads text)
  out.sort((a, b) => b.s - a.s);
  if (phrase && textOf) for (const o of out.slice(0, 60)) { const txt = String(textOf(cards[o.id]) || '').toLowerCase(); if (txt.includes(phrase)) o.s *= 1.4; }
  out.sort((a, b) => b.s - a.s || (cards[a.id].file < cards[b.id].file ? -1 : 1));
  const hits = out.slice(0, limit).map(o => {
    const c = cards[o.id];
    return { id: o.id, file: c.file, range: c.range, kind: c.kind, name: c.qualifiedName || c.name || null, summary: c.summary,
      score: Math.round(o.s * 100) / 100, matched: [...matched.get(o.id)], snippet: textOf ? snippet(textOf(c), c.range.start_line, qTerms, raw) : [] };
  });
  return { hits, total: out.length, terms: qTerms };
}

/** snippet(text, firstLine, terms) — up to 3 lines where the most query terms appear */
function snippet(text, firstLine, qTerms, raw = '') {
  const lines = String(text || '').split('\n');
  const low = raw.toLowerCase();
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const lt = new Set(T.terms(l));
    let n = 0; for (const t of qTerms) if (lt.has(t)) n++;
    if (low && l.toLowerCase().includes(low)) n += qTerms.length;
    if (n) scored.push({ i, n });
  }
  scored.sort((a, b) => b.n - a.n || a.i - b.i);
  return scored.slice(0, 3).sort((a, b) => a.i - b.i).map(({ i }) => ({ line: firstLine + i, text: lines[i].trim().slice(0, 180) }));
}

// ── grep ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * grep({ repoDir, files, chunksByFile, pattern, regex, caseSensitive, path, context, limit, maxFileBytes })
 * -> { matches:[{ file, line, text, chunkId, before?, after? }], filesScanned, filesMatched, total, truncated }
 * files: repo-relative paths (the index's file list — never a walk outside the repo).
 */
function grep({ repoDir, files, chunksByFile = null, pattern, regex = false, caseSensitive = false, path: pathGlob = null, context = 0, limit = 50, maxFileBytes = 2 * 1024 * 1024, wholeWord = false } = {}) {
  if (!pattern) return { error: 'pattern is required' };
  let re;
  try {
    let src = regex ? String(pattern) : String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) src = `\\b(?:${src})\\b`;
    re = new RegExp(src, caseSensitive ? '' : 'i');
  } catch (e) { return { error: `invalid regex: ${e.message}` }; }
  const pm = pathMatcher(pathGlob);
  const root = path.resolve(repoDir);
  const ctx = Math.max(0, Math.min(10, parseInt(context, 10) || 0));
  const matches = [];
  let scanned = 0, matchedFiles = 0, total = 0, truncated = false, skipped = 0;
  for (const rel of files) {
    if (!pm(rel)) continue;
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) continue;
    let buf;
    try { const st = fs.statSync(abs); if (!st.isFile() || st.size > maxFileBytes) { skipped++; continue; } buf = fs.readFileSync(abs); }
    catch (_) { continue; }
    if (buf.subarray(0, 8000).includes(0)) { skipped++; continue; }
    scanned++;
    const lines = buf.toString('utf8').split('\n');
    let fileHit = false;
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      total++; fileHit = true;
      if (matches.length >= limit) { truncated = true; continue; }
      const m = { file: rel, line: i + 1, text: lines[i].length > 240 ? lines[i].slice(0, 239) + '…' : lines[i], chunkId: chunkAt(chunksByFile, rel, i + 1) };
      if (ctx) { m.before = lines.slice(Math.max(0, i - ctx), i).map(s => s.slice(0, 240)); m.after = lines.slice(i + 1, i + 1 + ctx).map(s => s.slice(0, 240)); }
      matches.push(m);
    }
    if (fileHit) matchedFiles++;
  }
  return { matches, total, filesScanned: scanned, filesMatched: matchedFiles, filesSkipped: skipped, truncated,
    ...(truncated ? { more: `${total - matches.length} more match(es) not shown — narrow with path or a tighter pattern, or raise limit` } : {}) };
}

function chunkAt(chunksByFile, file, line) {
  const list = chunksByFile && chunksByFile.get(file);
  if (!list) return null;
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, c = list[mid];
    if (line < c.range.start_line) hi = mid - 1;
    else if (line > c.range.end_line) lo = mid + 1;
    else return c.id;
  }
  return null;
}

module.exports = { buildIndex, query, grep, snippet, pathMatcher, chunkAt, SEARCH_VERSION, TEST_RE };
