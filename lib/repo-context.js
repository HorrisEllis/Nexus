'use strict';
/**
 * lib/repo-context.js -- dispatch-time retrieval for a compartment agent.
 * UUID: nexus-lib-repo-context-v1-0000-2026-0921-jamesbrooks-001
 *
 * This exists for small models (0.6B-3B on James's 4 GB GPU). A small model is weakest at planning a
 * multi-step lookup, so the agent is not asked to. Before the prompt is sent, this reads the repo's OWN
 * chunk index, picks the few chunks that match the question, and puts their real text in the prompt with
 * a hard character budget. Scoping to the agent's repo is by construction: it only ever reads the repoDir
 * it is handed.
 *
 * Deterministic, no model, no network. Ranking is keyword/symbol/path scoring, not semantic: it finds
 * what the question NAMES. It will miss a question that names nothing in the code, and says so by
 * returning no chunks, never by inventing some. Stale runtime proof is labelled stale.
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  maxChunks: parseInt(process.env.REPO_CONTEXT_MAX_CHUNKS || '4', 10),
  maxChars: parseInt(process.env.REPO_CONTEXT_MAX_CHARS || '3000', 10),      // ~750 tokens: fits a 1-3B model's window with room to answer
  maxCharsPerChunk: parseInt(process.env.REPO_CONTEXT_MAX_CHARS_PER_CHUNK || '1200', 10),
  maxGraphChars: parseInt(process.env.REPO_CONTEXT_MAX_GRAPH_CHARS || '900', 10),        // 0.39.257 — the graph section's own budget
  maxGlyphChars: parseInt(process.env.REPO_CONTEXT_MAX_GLYPH_CHARS || '1500', 10),       // 0.39.261 — the compressed section's own budget
});

// §0.39.261 GLYPHS — James: "leverage the most compressed semantix or linguistics
// for the chunks." The full-text budget above holds ~4 chunks. Each chunk's glyph
// (lib/chunk-glyph.js — what it defines, calls, pulls in, emits, touches, and
// says it is for) is ~12-40x smaller, so in its own budget the agent also sees
// the chunks that ALMOST matched, and the rest of the files it was given, in
// compressed form: it knows they exist and what they do, and can read_file the
// one it needs instead of guessing. Glyphs come from indexes/glyphs.json (the
// import pipeline writes it); a repo imported before glyphs existed simply has
// no compressed section until its next reindex.
function readGlyphs(repoDir) {
  const g = readJson(path.join(repoDir, 'indexes', 'glyphs.json'), null);
  return g && g.byChunk ? g.byChunk : null;
}
function glyphSection(glyphs, ids, budget = DEFAULTS.maxGlyphChars, { title = '## More of this project, compressed', bare = false } = {}) {
  const lines = [];
  let used = 0;
  for (const id of ids) {
    const g = glyphs[id];
    if (!g || !g.glyph) continue;
    const line = `${g.file}:${g.range ? g.range.start_line : '?'} ${g.glyph}`;
    if (used + line.length + 1 > budget) break;
    lines.push(line); used += line.length + 1;
  }
  if (!lines.length) return '';
  return [...(bare ? [] : [title, '(each line: file:line then what that chunk defines · ← pulls in · → calls · ⚑ emits · ⇄ routes · $ env · io side effects · ¶ its purpose — read_file for the full text)']), ...lines].join('\n');
}
const STOP = new Set(('the and for are but not you all can had her was one our out has have how why what when where which this that with from into '
  + 'does did use using make made need want please show tell about them then than there here will would could should just like get got set').split(/\s+/));
const TEST_RE = /(?:(?:^|\/)(?:tests?|__tests__)\/)|(?:\.(?:test|spec)\.[cm]?[jt]sx?$)/i;

const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fb; } };

function tokens(message) {
  const out = new Set();
  for (const m of String(message || '').matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) {
    const w = m[0]; const lw = w.toLowerCase();
    if (!STOP.has(lw)) out.add(lw);
    // fooBarBaz / foo_bar -> foo, bar, baz, so "the poll handler" finds pollHandler
    for (const part of w.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_]+/)) { const p = part.toLowerCase(); if (p.length > 2 && !STOP.has(p)) out.add(p); }
  }
  return [...out];
}

function score(chunk, text, toks, wantsTests) {
  let s = 0; const file = (chunk.file || '').toLowerCase(); const base = path.basename(file);
  const syms = (chunk.symbols || []).map(x => String(x.name || x).toLowerCase());
  const body = text.toLowerCase();
  for (const t of toks) {
    if (syms.includes(t)) s += 6; else if (syms.some(x => x.includes(t))) s += 3;
    if (base.includes(t)) s += 3; else if (file.includes(t)) s += 2;
    let n = 0, i = -1; while (n < 3 && (i = body.indexOf(t, i + 1)) !== -1) n++;
    s += n;
  }
  if (TEST_RE.test(file)) {
    // tests are context, but rarely THE answer unless the question asks about tests, and then they must lead
    if (!wantsTests) s *= 0.7; else if (s > 0) s = s * 1.5 + 12;
  }
  return s;
}

/**
 * retrieve({ repoDir, message, maxChunks, maxChars, maxCharsPerChunk })
 * -> { chunks:[{id,file,range,symbols,proof,score,text}], block:string, chars, dropped, reason? }
 */
// ── The graph in the context — §GRAPH 0.39.257 ───────────────────────────────
// James: "context on by default and wire in the graph". Context was on, but a question that names nothing in the
// code ("hello") got nothing at all ("context: none — no chunk matches"), and a question that did match got the
// matching chunks with no idea how their files connect. The import pipeline already writes <repoDir>/graph.json
// (idearium/repo/graph.js: file:<path> nodes, 'imports' edges resolved to file:<path>). Now:
//   · chunks matched → a short "how these files connect" section: what each imports, what imports it;
//   · nothing matched → the project map from the graph instead of nothing: size, top folders, entry points, the
//     most depended-on files — so the agent knows the project it is standing in.
// Both inside their own budget (DEFAULTS.maxGraphChars), after the chunks; never instead of a chunk that matched.

function readGraph(repoDir) {
  const g = readJson(path.join(repoDir, 'graph.json'), null);
  if (!g || !Array.isArray(g.nodes)) return null;
  const files = g.nodes.filter(n => n && n.kind === 'file' && n.file).map(n => n.file);
  const out = new Map(), inn = new Map();
  for (const e of g.edges || []) {
    if (!e || e.relation !== 'imports' || !e.to || !String(e.from).startsWith('file:') || !String(e.to).startsWith('file:')) continue;
    const a = String(e.from).slice(5), b = String(e.to).slice(5);
    if (a === b) continue;
    (out.get(a) || out.set(a, new Set()).get(a)).add(b);
    (inn.get(b) || inn.set(b, new Set()).get(b)).add(a);
  }
  return { files, out, inn, unresolved: g.unresolvedCount || 0 };
}

function _list(set, max) {
  const a = [...(set || [])].sort();
  return a.length > max ? `${a.slice(0, max).join(', ')} (+${a.length - max})` : a.join(', ');
}

/** connections(graph, files, budget) — "how these files connect", one line per file that has any edge. */
function connections(g, files, budget = DEFAULTS.maxGraphChars) {
  const lines = [];
  let used = 0;
  for (const f of [...new Set(files)]) {
    const o = g.out.get(f), i = g.inn.get(f);
    if (!(o && o.size) && !(i && i.size)) continue;
    const line = `- ${f}${o && o.size ? ` imports ${_list(o, 6)}` : ''}${o && o.size && i && i.size ? ';' : ''}${i && i.size ? ` imported by ${_list(i, 6)}` : ''}`;
    if (used + line.length > budget) break;
    lines.push(line); used += line.length;
  }
  return lines.length ? ['## How these files connect (from this project\'s graph)', ...lines].join('\n') : '';
}

/** overview(graph, budget) — the project map when the question matched no code. */
function overview(g, budget = DEFAULTS.maxGraphChars, { bare = false } = {}) {
  const folders = new Map();
  for (const f of g.files) { const top = f.includes('/') ? f.split('/')[0] + '/' : '(root)'; folders.set(top, (folders.get(top) || 0) + 1); }
  const topFolders = [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`);
  const entry = g.files.filter(f => (g.out.get(f) || new Set()).size && !(g.inn.get(f) || new Set()).size)
    .sort((a, b) => g.out.get(b).size - g.out.get(a).size).slice(0, 6);
  const core = g.files.filter(f => (g.inn.get(f) || new Set()).size).sort((a, b) => g.inn.get(b).size - g.inn.get(a).size).slice(0, 6)
    .map(f => `${f} (${g.inn.get(f).size})`);
  const edges = [...g.out.values()].reduce((n, x) => n + x.size, 0);
  // 0.39.258 — bare: data lines only. The repo agent's heading and instruction for this block live in its editable
  // 'context-map' prompt block (lib/repo-prompt-blocks.js), so nothing here is sent that James cannot edit.
  const lines = [
    ...(bare ? [] : ['## This project, from its graph',
      '(Your question named nothing in the code, so here is the project\'s shape. Ask about a file or symbol for its code.)']),
    `- ${g.files.length} files, ${edges} import links${g.unresolved ? `, ${g.unresolved} unresolved` : ''}`,
    topFolders.length ? `- top folders: ${topFolders.join(' · ')}` : null,
    entry.length ? `- entry points (import others, nothing imports them): ${entry.join(', ')}` : null,
    core.length ? `- most depended on (importers): ${core.join(', ')}` : null,
  ].filter(Boolean);
  let block = lines.join('\n');
  if (block.length > budget) block = block.slice(0, budget) + '…';
  return block;
}

function retrieve({ repoDir, message, maxChunks = DEFAULTS.maxChunks, maxChars = DEFAULTS.maxChars, maxCharsPerChunk = DEFAULTS.maxCharsPerChunk, graph = true, bare = false } = {}) {
  const none0 = (reason) => ({ chunks: [], block: '', chars: 0, dropped: 0, reason });
  // 0.39.257 — nothing matched: the project map from the graph, when there is one, instead of nothing.
  const none = (reason) => {
    const g = graph && repoDir ? readGraph(repoDir) : null;
    // 0.39.261 — the glyph map: one line per file (its largest chunk), so a question that names nothing
    // still gets what every file is FOR, not only how the files connect
    const glyphs = repoDir && fs.existsSync(repoDir) ? readGlyphs(repoDir) : null;
    let gm = '';
    if (glyphs) {
      const best = new Map();
      for (const [id, x] of Object.entries(glyphs)) { const cur = best.get(x.file); if (!cur || (x.chars || 0) > (cur.chars || 0)) best.set(x.file, { id, chars: x.chars }); }
      gm = glyphSection(glyphs, [...best.values()].sort((a, b) => b.chars - a.chars).map(b => b.id), DEFAULTS.maxGlyphChars, { title: '## This project, compressed', bare });
    }
    if ((!g || !g.files.length) && !gm) return none0(reason);
    const block = [g && g.files.length ? overview(g, undefined, { bare }) : '', gm].filter(Boolean).join('\n\n');
    return { chunks: [], block, kind: 'map', chars: block.length, dropped: 0, reason: `${reason} — the project map${gm ? ' (graph + glyphs)' : ' from its graph'} was given instead`, graph: g ? { overview: true, files: g.files.length } : null, glyphs: gm ? gm.split('\n').length : 0 };
  };
  if (!repoDir || !fs.existsSync(repoDir)) return none('no repo directory');
  const index = readJson(path.join(repoDir, 'chunks', 'index.json'), null);
  if (!Array.isArray(index) || !index.length) return none('repo has no chunk index yet');
  const toks = tokens(message);
  if (!toks.length) return none('the question names nothing searchable');
  const wantsTests = /\btests?\b|\bspec\b|\bcoverage\b/i.test(message);

  const proof = readJson(path.join(repoDir, 'proof.json'), null);
  const proofBy = new Map(((proof && proof.chunks) || []).map(c => [c.chunkId, c]));
  const fileCache = new Map();
  const linesOf = (rel) => {
    if (fileCache.has(rel)) return fileCache.get(rel);
    let lines = null;
    try { const abs = path.resolve(repoDir, rel); if (abs.startsWith(path.resolve(repoDir) + path.sep) && fs.statSync(abs).size < 1e6) lines = fs.readFileSync(abs, 'utf8').split('\n'); } catch (_) { lines = null; }
    fileCache.set(rel, lines); return lines;
  };

  let scored = [];
  // §0.39.273 CB5 — the repo's own search index (lib/code-intel: BM25 over names, docs, paths and the code itself)
  // ranks when it exists; the keyword scorer below stays for repos indexed before it. Precision over recall here:
  // this goes into a small model's first message, so a hit must carry at least half the question's words or name
  // something the chunk defines — a question that names nothing in the code still gets no code.
  let ranker = 'keyword', cardsById = null;
  try {
    if (fs.existsSync(path.join(repoDir, 'indexes', 'search.json')) && fs.existsSync(path.join(repoDir, 'indexes', 'cards.json'))) {
      const CI = require('./code-intel/index.js');
      const r = CI.query(repoDir, message, { limit: Math.max(12, maxChunks * 4), includeTests: wantsTests ? true : null });
      if (!r.error) {
        ranker = 'index';
        const intel = CI.load(repoDir);
        cardsById = intel.error ? null : intel.cards;
        const byId = new Map(index.map(c => [c.id, c]));
        const nTerms = (r.terms || []).length || 1;
        for (const h of r.hits || []) {
          const c = byId.get(h.id); if (!c || !c.range) continue;
          const card = cardsById && cardsById[h.id];
          const names = card ? [card.qualifiedName, card.name, ...(card.defines || [])].filter(Boolean).map(x => String(x).toLowerCase()) : [];
          const named = toks.some(t => names.includes(t));
          if (!named && (h.matched || []).length / nTerms < 0.5) continue;
          const lines = linesOf(c.file); if (!lines) continue;
          scored.push({ c, text: lines.slice(Math.max(0, c.range.start_line - 1), c.range.end_line).join('\n'), s: h.score });
        }
      }
    }
  } catch (_) { ranker = 'keyword'; scored = []; }
  if (ranker === 'keyword') {
    for (const c of index) {
      const lines = linesOf(c.file); if (!lines || !c.range) continue;
      const text = lines.slice(Math.max(0, c.range.start_line - 1), c.range.end_line).join('\n');
      const s = score(c, text, toks, wantsTests);
      if (s > 0) scored.push({ c, text, s });
    }
    scored.sort((a, b) => b.s - a.s || (a.c.file < b.c.file ? -1 : 1) || a.c.range.start_line - b.c.range.start_line);
  }
  if (!scored.length) return none('no chunk matches what the question names');

  const picked = []; let used = 0; let dropped = 0;
  for (const { c, text, s } of scored) {
    if (picked.length >= maxChunks) { dropped++; continue; }
    let body = text.length > maxCharsPerChunk ? text.slice(0, maxCharsPerChunk) + '\n// ... (chunk cut for size)' : text;
    if (used + body.length > maxChars) { dropped++; continue; }
    const p = proofBy.get(c.id);
    const label = !p ? 'none recorded' : (p.hashAtRun !== ((c.hash && c.hash.content) || null) ? 'stale' : p.proof);
    // §0.39.273 — one line from the chunk's card: what it uses and what uses it (ids stay out; names are enough here)
    const card = cardsById && cardsById[c.id];
    const wires = card ? [card.uses && card.uses.length ? `uses ${card.uses.slice(0, 4).map(u => u.name).join(', ')}` : '', card.usedByTotal ? `used by ${card.usedBy.slice(0, 3).map(u => u.name || u.file).join(', ')}${card.usedByTotal > 3 ? ` +${card.usedByTotal - 3}` : ''}` : ''].filter(Boolean).join(' · ') : '';
    picked.push({ id: c.id, file: c.file, range: c.range, symbols: (c.symbols || []).map(x => x.name || x), proof: label, score: Math.round(s * 10) / 10, text: body, ...(wires ? { wires } : {}) });
    used += body.length;
  }
  let block = picked.length ? [
    ...(bare ? [] : ['## Code from this project that matches your question',
      '(Retrieved for you from this project\'s own index. Rely on it; do not guess at what is in these files.)',
      '']),
    ...picked.map(p => `[${p.file}:${p.range.start_line}-${p.range.end_line}${p.symbols.length ? ' · ' + p.symbols.join(', ') : ''} · runtime proof: ${p.proof}]${p.wires ? `\n(${p.wires})` : ''}\n\`\`\`\n${p.text}\n\`\`\``),
  ].join('\n') : '';
  // 0.39.257 — how the matched files connect, from the graph, in its own budget.
  let graphInfo = null;
  if (graph && picked.length) {
    const g = readGraph(repoDir);
    const conn = g ? connections(g, picked.map(p => p.file)) : '';
    if (conn) { block += '\n\n' + conn; graphInfo = { connections: conn.split('\n').length - 1 }; }
  }
  // 0.39.261 — the compressed rest: the next-best matches first, then the other chunks of the files given
  let glyphInfo = null;
  const glyphs = picked.length ? readGlyphs(repoDir) : null;
  if (glyphs) {
    const shown = new Set(picked.map(p => p.id));
    const near = scored.filter(x => !shown.has(x.c.id)).map(x => x.c.id);
    const files = new Set(picked.map(p => p.file));
    const siblings = index.filter(c => files.has(c.file) && !shown.has(c.id) && !near.includes(c.id)).map(c => c.id);
    const gs = glyphSection(glyphs, [...near, ...siblings], DEFAULTS.maxGlyphChars, { bare });
    if (gs) { block += '\n\n' + gs; glyphInfo = { lines: gs.split('\n').length - (bare ? 0 : 2) }; }
  }
  return { chunks: picked, block, kind: picked.length ? 'code' : null, chars: block.length, dropped, ranker, ...(graphInfo ? { graph: graphInfo } : {}), ...(glyphInfo ? { glyphs: glyphInfo } : {}) };
}

module.exports = { retrieve, tokens, DEFAULTS, readGraph, connections, overview, readGlyphs, glyphSection };
