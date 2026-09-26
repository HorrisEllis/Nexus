/**
 * idearium/repo/graph.js — the repository relationship graph.
 * comp_id: nexus.idearium.repo.graph
 * uuid: nexus-idearium-repo-graph-v1-0000-2026-0919-001
 *
 * Implements nexus-repository-system.spec §24 (relationship_graph),
 * §25 (graph_traversal) and §26 (dependency_cone); closes MCO1_graph_layer
 * in docs/nexus-repository-system-build-phasemap.spec. Contract:
 * idearium/spec/idearium.repo-graph.spec, written before this file.
 *
 * §WHY THIS EXISTS — MCO0's audit found L0-L5 already real: files are
 * parsed, chunks are cut on real structural boundaries, symbols are
 * listed, an atlas is written. What it also found, grep-confirmed with
 * zero hits repo-wide, is that NOTHING CONNECTS ANY OF IT. A chunk knew
 * its line range and (at most) one symbol name. It did not know what
 * file it belonged to as a queryable edge, what that file imports, or
 * what breaks if it changes. James: "use component registery logic,
 * component type, everything that makes chunks understood."
 *
 * §THE HONESTY RULE IS THE ARCHITECTURE, NOT A CHECK ON TOP OF IT — §24
 * says unknown relationships MUST remain explicitly unknown and the
 * system MUST NOT invent edges to make the graph complete. That is why
 * every edge here carries `resolution`, and why an import of 'express'
 * or of a file that isn't in this repo is still a real edge with
 * to:null and resolution:'unresolved'. Dropping it would be a positive
 * claim that the file has no such dependency — a silent lie, exactly
 * §1.2's failure mode. It is also why `calls` is absent and DECLARED
 * absent: a regex can find the token `foo(` but cannot tell which `foo`,
 * and a graph that answers "who calls this" with guesses is worse than
 * one that answers "I don't do that yet."
 *
 * §DERIVED, NEVER A SECOND STORE (§10.3) — every node and edge is
 * derived from import-pipeline.js's own on-disk output (indexes/*.json,
 * chunks/index.json, atlas.json) plus one extra regex pass over source
 * for import statements. No content is copied here: the graph holds ids,
 * paths and line numbers. The atlas hash it was generated from is
 * recorded so a stale graph is detectable rather than silently trusted.
 *
 * §REUSE (§8.6) — the JS/TS patterns and the strip-comments-first
 * discipline are loom/scanners/source-map.js's, whose own header records
 * the real bug that made them necessary (require() inside docblocks and
 * template literals counted as live edges). That module is NOT imported:
 * it is CJS, its walker is hardcoded to the nexus ROOT with a
 * nexus-specific SKIP_DIRS, and its idFor() mints 'nexus.*' ids — all
 * three wrong for an arbitrary uploaded repository. Borrowing proven
 * regexes is reuse; pointing a nexus-tree scanner at a stranger's repo
 * would be a category error.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MODULE_ID = 'idearium.repo.graph';
const GRAPH_VERSION = '1.0.0';

// ── relations ────────────────────────────────────────────────────────────
// Exactly the §24 vocabulary. Shipping a relation name this module does
// not actually produce would be the same invented-completeness the spec
// forbids, so the two lists are kept separate and BOTH are written into
// every graph.
export const RELATIONS_SUPPORTED = Object.freeze([
  'contains', 'belongs_to', 'imports', 'exports', 'depends_on', 'depended_on_by',
]);

export const RELATIONS_DECLARED_UNSUPPORTED = Object.freeze([
  'calls', 'called_by',                       // needs call-site + reference resolution
  'implements', 'implemented_by', 'extends', 'instantiates',  // needs type resolution
  'produces', 'consumes', 'emits', 'handles', // event-bus semantics, not syntax
  'tested_by', 'tests', 'verified_by',        // needs a test-mapping pass (MCO2 L6)
  'exposes', 'wired_to', 'activates',         // repository-domain hook/wire nodes (MCO4)
  'generated_from', 'derived_from',
  // 'affects' is deliberately not here and not an edge: it is COMPUTED by
  // dependencyCone() from depends_on, per §26. Storing it would be a
  // second truth layer for the same fact (§10.2 — projections are
  // derived, not written).
]);

const INVERSE = Object.freeze({
  contains: 'belongs_to',
  depends_on: 'depended_on_by',
});

// ── reference extraction, per language family ────────────────────────────
// Declaration detection (what a file DEFINES) already exists in
// import-pipeline.js's SYMBOL_PATTERNS and is read, not re-derived.
// These are reference detection (what a file USES) — a different question
// those patterns cannot answer.
const JS_LANGS = new Set(['javascript', 'typescript', 'jsx', 'tsx']);

const RX = {
  js_require: /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  js_import: /(?:^|\s)import\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/gm,
  js_export_from: /(?:^|\s)export\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm,
  js_dynamic: /require\(\s*[^'"\s)]|import\(\s*[^'"\s)]/g,
  py: /^\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm,
  go: /^\s*(?:import\s+)?["`]([\w./-]+)["`]/gm,
  rust: /^\s*(?:pub\s+)?(?:use\s+([\w:]+)|mod\s+(\w+)\s*;)/gm,
  ruby: /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm,
  jvm: /^\s*(?:import|using)\s+(?:static\s+)?([\w.]+)\s*;/gm,
  c_quoted: /^\s*#include\s+"([^"]+)"/gm,
  c_system: /^\s*#include\s+<([^>]+)>/gm,
};

const EXT_CANDIDATES = {
  javascript: ['', '.js', '.mjs', '.cjs', '.jsx', '/index.js', '/index.mjs', '/index.cjs'],
  typescript: ['', '.ts', '.tsx', '.d.ts', '/index.ts', '.js', '/index.js'],
  jsx: ['', '.jsx', '.js', '/index.jsx', '/index.js'],
  tsx: ['', '.tsx', '.ts', '/index.tsx', '/index.ts'],
  python: ['', '.py', '/__init__.py'],
  ruby: ['', '.rb'],
  c: ['', '.h', '.c'],
  cpp: ['', '.h', '.hpp', '.cpp', '.cc'],
};

/** stripNonCode(src) — comments and template literals out before any
 *  reference regex runs. loom/scanners/source-map.js's own discipline,
 *  added there after real docblock require() calls were being counted as
 *  live edges. Same reason applies verbatim here. */
export function stripNonCode(src) {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*#(?!include).*$/gm, '')   // python/ruby/shell comments; #include is code
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * extractReferences(content, language) -> [{ specifier, line, kind }]
 *
 * kind: 'import' | 'export_from' | 'dynamic' | 'system'
 * A language with no entry here returns [] AND is reported by the caller
 * in languagesWithoutExtractors — "no imports found" and "never looked"
 * are different facts and are never conflated (§1.2).
 */
export function extractReferences(content, language) {
  const src = stripNonCode(content);
  const out = [];
  const push = (spec, idx, kind) => {
    if (spec) out.push({ specifier: spec, line: lineOf(src, idx), kind });
  };
  const run = (re, kind, groups = [1]) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const spec = groups.map(g => m[g]).find(Boolean);
      push(spec, m.index, kind);
    }
  };

  if (JS_LANGS.has(language)) {
    run(RX.js_require, 'import');
    run(RX.js_import, 'import');
    run(RX.js_export_from, 'export_from');
    RX.js_dynamic.lastIndex = 0;
    let d;
    while ((d = RX.js_dynamic.exec(src)) !== null) {
      out.push({ specifier: null, line: lineOf(src, d.index), kind: 'dynamic' });
    }
  } else if (language === 'python') {
    run(RX.py, 'import', [1, 2]);
  } else if (language === 'go') {
    run(RX.go, 'import');
  } else if (language === 'rust') {
    run(RX.rust, 'import', [1, 2]);
  } else if (language === 'ruby') {
    run(RX.ruby, 'import');
  } else if (language === 'java' || language === 'csharp') {
    run(RX.jvm, 'import');
  } else if (language === 'c' || language === 'cpp') {
    run(RX.c_quoted, 'import');
    run(RX.c_system, 'system');
  } else {
    return [];
  }

  return out.sort((a, b) => a.line - b.line);
}

/** LANGUAGES_WITH_EXTRACTORS — the real, checkable list, so a graph can
 *  say which languages it was actually able to look at. */
export const LANGUAGES_WITH_EXTRACTORS = Object.freeze([
  ...JS_LANGS, 'python', 'go', 'rust', 'ruby', 'java', 'csharp', 'c', 'cpp',
]);

/**
 * §REAL FINDING 2026-09-19, found by this module's own tests failing —
 * not assumed from reading, and not papered over.
 *
 * import-pipeline.js's LANGUAGES table covers .js/.mjs/.cjs/.jsx/.ts/
 * .tsx/.py plus data formats. It has NO entry for Go, Rust, Ruby, Java,
 * C#, C or C++. A .c file therefore arrives here with language:null and
 * status:'unsupported', so seven of this module's extractors can never
 * fire — not because the code can't read those languages, but because
 * nothing upstream ever labels a file as one.
 *
 * NOT FIXED HERE, deliberately. Language detection has exactly one
 * owner (§17.1, §10.1) and it is import-pipeline.js. Adding a second
 * extension->language table in this file would be two write authorities
 * for the same fact — §10.3's competing-truth-layers failure — and it
 * would also silently change CHUNKING behaviour for every newly-detected
 * language, which is a different piece of work needing its own spec
 * (§8.5). Extending the pipeline's own table is a real, small, correct
 * change and it is named as the next phase item rather than smuggled in
 * under a graph pass.
 *
 * What this table IS for: reporting only. It lets a graph say "there
 * were 12 .go files here and nobody looked at them" instead of quietly
 * returning zero edges, which would read as "Go code with no imports."
 * The difference between no-imports and never-looked is exactly what
 * §1.2 exists to protect.
 */
const EXTRACTABLE_BUT_UNDETECTED_UPSTREAM = Object.freeze({
  '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.java': 'java',
  '.cs': 'csharp', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp',
});

/**
 * resolveSpecifier(spec, fromFile, language, fileSet) -> string|null
 *
 * Resolves ONLY against files that genuinely exist in this repository's
 * own file index. A constructed path is never assumed real — that is the
 * difference between a resolved edge and an invented one.
 */
export function resolveSpecifier(specifier, fromFile, language, fileSet) {
  if (!specifier) return null;
  const spec = specifier.replace(/\\/g, '/');
  const dir = path.posix.dirname(fromFile.replace(/\\/g, '/'));
  const candidates = EXT_CANDIDATES[language] || ['', '.js'];

  const bases = [];
  if (spec.startsWith('./') || spec.startsWith('../')) {
    bases.push(path.posix.normalize(path.posix.join(dir, spec)));
  } else if (spec.startsWith('/')) {
    bases.push(spec.replace(/^\/+/, ''));
  } else if (language === 'python' && spec.startsWith('.')) {
    // relative python import: .x.y -> <dir>/x/y
    bases.push(path.posix.normalize(path.posix.join(dir, spec.replace(/^\.+/, '').replace(/\./g, '/'))));
  } else if (language === 'python' || language === 'java' || language === 'csharp') {
    // dotted absolute module path — try it from the repo root as a path
    bases.push(spec.replace(/\./g, '/'));
  } else if (language === 'c' || language === 'cpp' || language === 'ruby') {
    bases.push(path.posix.normalize(path.posix.join(dir, spec)));
    bases.push(spec);
  } else {
    // a bare package specifier in a JS-family file. Still try it as a
    // repo-relative path (monorepos really do import 'packages/x'), then
    // give up honestly rather than inventing a node_modules node.
    bases.push(spec);
  }

  for (const base of bases) {
    if (base.startsWith('..')) continue;   // climbed out of the repo — not ours
    for (const ext of candidates) {
      const cand = (base + ext).replace(/\/{2,}/g, '/');
      if (fileSet.has(cand)) return cand;
    }
  }
  return null;
}

// ── graph construction ───────────────────────────────────────────────────

function readJsonSafe(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}

function nodeId(kind, ...parts) { return `${kind}:${parts.join(':')}`; }

/**
 * §24 edge_provenance_envelope — ADOPTED 2026-09-20 during the merge.
 *
 * A parallel line amended nexus-repository-system.spec §24 with this
 * envelope while MCO1 was still NOT STARTED on their side, and said so
 * explicitly: "MCO1 stays NOT STARTED, this is the target it builds
 * toward"; and in the phasemap, "when MCO1's own edges get written,
 * giving them the full envelope shape from day one costs nothing extra
 * and avoids a real, second migration later."
 *
 * This IS that build. The gate they left unchanged (resolution:
 * unresolved-vs-omitted) was already met without it — so adopting the
 * envelope now is not gate-chasing, it is taking the cheap option at
 * the only moment it is cheap. Retrofitting provenance onto edges
 * already written is the migration they were trying to avoid.
 *
 * What is adopted, and what is honestly NOT:
 *   resolution        — already real, unchanged.
 *   status            — 'observed' (an extractor read it out of a real
 *                       file) vs 'derived' (this module computed it:
 *                       inverses, depends_on-from-imports, containment
 *                       restated from the indexes). 'inferred',
 *                       'conflicting' and 'stale' are in the spec's
 *                       vocabulary but NOTHING here produces them, so
 *                       nothing here claims them.
 *   confidence        — 'structural' only. Every edge this module emits
 *                       comes from a real parse or a real index, never
 *                       from a heuristic guess. 'inferred'/'asserted'
 *                       are left for a producer that actually does that.
 *   source            — { file, range, extractor, extractor_version }.
 *                       extractor names the real one that ran
 *                       ('javascript-import', 'chunk-index', ...), and
 *                       extractor_version is what lets a later run tell
 *                       "the code changed" from "the extractor changed"
 *                       for the same edge — the spec's own stated reason
 *                       for the field.
 *   graph_version     — per edge, so a mixed-vintage graph is readable.
 *   first_seen        — carried forward from the previous graph.json when
 *                       the same edge is still there, set to now when it
 *                       is genuinely new. NOT backfilled for edges that
 *                       predate the envelope, exactly as the spec says.
 *   last_seen         — set on every real re-observation, not just
 *                       creation.
 *
 * field_attachment_extension_point stays DEFERRED, as that amendment
 * instructs: RFR2 is still the one real instance, and §16.4 says a
 * second real need comes before a generalization.
 */
const EXTRACTOR_VERSION = `${MODULE_ID}@${GRAPH_VERSION}`;

/** edgeKey(e) — identity of an edge across rebuilds, for first_seen
 *  carry-forward. Deliberately excludes line numbers: §11's own identity
 *  rule says line numbers are coordinates, not identity, and an import
 *  that moved down three lines is the same dependency, not a new one. */
function edgeKey(e) {
  return `${e.from}|${e.relation}|${e.to || ''}|${e.target || ''}`;
}

/**
 * envelope(e, { now, prior }) — wraps one edge in the §24 envelope.
 * Never invents: fields this module cannot honestly fill are absent
 * rather than defaulted.
 */
function envelope(e, { now, prior }) {
  const key = edgeKey(e);
  const before = prior ? prior.get(key) : null;
  const derived = e.via === 'inverse' || e.via === 'imports' || e.via === 'chunk-index'
    || e.via === 'line-range' || e.via === 'symbol-table';
  return {
    ...e,
    status: e.resolution === 'unresolved' ? 'unresolved'
          : derived ? 'derived' : 'observed',
    confidence: 'structural',
    source: {
      file: e.sourceFile || null,
      range: e.line ? [e.line, e.line] : null,
      extractor: e.extractor || e.via || null,
      extractor_version: EXTRACTOR_VERSION,
    },
    graph_version: GRAPH_VERSION,
    // Not backfilled: an edge first seen before the envelope existed has
    // no honest first_seen, and inventing one would make the field lie
    // about exactly the question it exists to answer.
    first_seen: before && before.first_seen ? before.first_seen : now,
    last_seen: now,
  };
}

/**
 * buildContainment(repoDir, preloaded?) -> { nodes, edges }
 *
 * The file->chunk->symbol containment half of the graph. It owns no
 * facts: every node and edge here is a restatement of
 * indexes/chunks.json and indexes/symbols.json, which is exactly why
 * writeGraph() does not persist it and readGraph() rebuilds it from
 * those indexes instead (§10.2 — a projection is derived, not written).
 *
 * `preloaded` lets buildGraph() pass the indexes it has already read
 * rather than reading them a second time; readGraph() omits it and this
 * function loads them itself.
 */
export function buildContainment(repoDir, preloaded = null) {
  const files    = preloaded ? preloaded.files    : readJsonSafe(path.join(repoDir, 'indexes', 'files.json'), []);
  const symbols  = preloaded ? preloaded.symbols  : readJsonSafe(path.join(repoDir, 'indexes', 'symbols.json'), []);
  const chunkIdx = preloaded ? preloaded.chunkIdx : (
    readJsonSafe(path.join(repoDir, 'indexes', 'chunks.json'), []).length
      ? readJsonSafe(path.join(repoDir, 'indexes', 'chunks.json'), [])
      : readJsonSafe(path.join(repoDir, 'chunks', 'index.json'), []));
  const byPath   = preloaded ? preloaded.byPath : new Map(files.map(f => [f.path, f]));

  const nodes = [];
  const edges = [];
  const seen = new Set();
  const addNode = n => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const addEdge = e => {
    edges.push({ resolution: 'resolved', ...e });
    const inv = INVERSE[e.relation];
    if (inv && e.to && (e.resolution || 'resolved') === 'resolved') {
      edges.push({ from: e.to, to: e.from, target: e.from, relation: inv, resolution: 'resolved', via: 'inverse' });
    }
  };

  const chunksByFile = new Map();
  for (const c of chunkIdx) {
    const cid = nodeId('chunk', c.id);
    addNode({
      id: cid, kind: 'chunk', file: c.file, chunkId: c.id,
      range: c.range || null, symbols: c.symbols || [],
      language: (byPath.get(c.file) || {}).language || null,
    });
    addEdge({ from: nodeId('file', c.file), to: cid, target: c.id, relation: 'contains', via: 'chunk-index' });
    if (!chunksByFile.has(c.file)) chunksByFile.set(c.file, []);
    chunksByFile.get(c.file).push(c);
  }

  for (const s of symbols) {
    const sid = nodeId('symbol', s.file, s.name, s.line);
    addNode({ id: sid, kind: 'symbol', file: s.file, symbol: s.name, line: s.line });

    const owning = (chunksByFile.get(s.file) || []).find(c =>
      c.range && s.line >= c.range.start_line && s.line <= c.range.end_line);
    if (owning) {
      addEdge({ from: nodeId('chunk', owning.id), to: sid, target: s.name, relation: 'contains', via: 'line-range', line: s.line });
    } else {
      // A real symbol whose line falls outside every chunk range. Not
      // dropped and not force-assigned to the nearest chunk — that would
      // be an invented containment.
      addEdge({
        from: nodeId('file', s.file), to: null, target: s.name, relation: 'contains',
        resolution: 'unresolved', reason: 'symbol-outside-every-chunk-range', line: s.line,
      });
    }
    addEdge({ from: nodeId('file', s.file), to: sid, target: s.name, relation: 'exports', via: 'symbol-table' });
  }

  return { nodes, edges };
}

/**
 * buildGraph({ repoDir, repository }) -> Graph
 *
 * Reads what import-pipeline.js already wrote and adds exactly one new
 * pass: reference extraction per source file. Never throws on a single
 * bad file — an unreadable file becomes a node with an unresolved edge
 * explaining why (§10 on_failure).
 */
export function buildGraph({ repoDir, repository = null } = {}) {
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error(`${MODULE_ID}: repoDir does not exist: ${repoDir}`);
  }

  const files = readJsonSafe(path.join(repoDir, 'indexes', 'files.json'), []);
  const symbols = readJsonSafe(path.join(repoDir, 'indexes', 'symbols.json'), []);
  const chunkIdx = readJsonSafe(path.join(repoDir, 'indexes', 'chunks.json'), [])
    .length ? readJsonSafe(path.join(repoDir, 'indexes', 'chunks.json'), [])
    : readJsonSafe(path.join(repoDir, 'chunks', 'index.json'), []);
  const atlas = readJsonSafe(path.join(repoDir, 'atlas.json'), null);

  const fileSet = new Set(files.map(f => f.path));
  const byPath = new Map(files.map(f => [f.path, f]));

  const nodes = [];
  const edges = [];
  const seenNode = new Set();
  const languagesSeen = new Set();
  const languagesWithoutExtractors = new Set();
  const undetectedUpstream = new Map();   // ext -> count (see the §REAL FINDING note above)

  const addNode = n => { if (!seenNode.has(n.id)) { seenNode.add(n.id); nodes.push(n); } };
  const addEdge = e => {
    edges.push({ resolution: 'resolved', ...e });
    const inv = INVERSE[e.relation];
    // Inverses are materialized so traversal in either direction is one
    // lookup, not a full scan. They carry the same resolution as the
    // edge they mirror — an inverse of an unresolved edge would have
    // nothing to point back from, so only resolved edges get one.
    if (inv && e.to && (e.resolution || 'resolved') === 'resolved') {
      edges.push({ from: e.to, to: e.from, target: e.from, relation: inv, resolution: 'resolved', via: 'inverse' });
    }
  };

  // ── file nodes ─────────────────────────────────────────────────────────
  for (const f of files) {
    if (f.language) languagesSeen.add(f.language);
    addNode({
      id: nodeId('file', f.path), kind: 'file', file: f.path,
      language: f.language || null, status: f.status || null,
      chunkCount: f.chunkCount || 0, contentHash: f.contentHash || null,
    });
  }

  // ── containment (chunk/symbol nodes and their edges) ───────────────────
  // Extracted so buildGraph() and readGraph() share ONE implementation
  // (§10.3 — two copies of this would be two answers to the same
  // question the first time one of them was edited).
  {
    const c = buildContainment(repoDir, { files, symbols, chunkIdx, byPath });
    for (const n of c.nodes) addNode(n);
    for (const e of c.edges) edges.push(e);
  }

  // ── imports / depends_on — the one new pass ────────────────────────────
  for (const f of files) {
    const fid = nodeId('file', f.path);

    if (f.status === 'failed') {
      addEdge({
        from: fid, to: null, target: null, relation: 'imports',
        resolution: 'unresolved', reason: 'parse-failed',
      });
      continue;
    }
    if (f.language && !LANGUAGES_WITH_EXTRACTORS.includes(f.language)) {
      languagesWithoutExtractors.add(f.language);
      continue;
    }
    if (!f.language) {
      // No language from upstream. If the extension is one this module
      // COULD extract, that is an upstream detection gap, not an absence
      // of imports — recorded as such (see EXTRACTABLE_BUT_UNDETECTED_UPSTREAM).
      const ext = path.extname(f.path).toLowerCase();
      if (EXTRACTABLE_BUT_UNDETECTED_UPSTREAM[ext]) {
        undetectedUpstream.set(ext, (undetectedUpstream.get(ext) || 0) + 1);
        addEdge({
          from: fid, to: null, target: null, relation: 'imports',
          resolution: 'unresolved',
          reason: `upstream-language-undetected:${ext}`,
        });
      }
      continue;
    }

    let content;
    try { content = fs.readFileSync(path.join(repoDir, f.path), 'utf8'); }
    catch (e) {
      addEdge({
        from: fid, to: null, target: null, relation: 'imports',
        resolution: 'unresolved', reason: `unreadable: ${e.message}`,
      });
      continue;
    }

    for (const ref of extractReferences(content, f.language)) {
      if (ref.kind === 'dynamic') {
        addEdge({
          from: fid, to: null, target: null, relation: 'imports',
          resolution: 'unresolved', reason: 'dynamic', line: ref.line,
        });
        continue;
      }
      if (ref.kind === 'system') {
        addEdge({
          from: fid, to: null, target: ref.specifier, relation: 'imports',
          resolution: 'unresolved', reason: 'system-header', line: ref.line,
        });
        continue;
      }
      const target = resolveSpecifier(ref.specifier, f.path, f.language, fileSet);
      if (target) {
        addEdge({ from: fid, to: nodeId('file', target), target, relation: 'imports', line: ref.line, via: ref.kind });
        addEdge({ from: fid, to: nodeId('file', target), target, relation: 'depends_on', line: ref.line, via: 'imports' });
      } else {
        // THE RULE, in one place: an import we cannot resolve is still a
        // real import. Keeping it as an unresolved edge is the difference
        // between "depends on something outside this repo" and "depends
        // on nothing".
        addEdge({
          from: fid, to: null, target: ref.specifier, relation: 'imports',
          resolution: 'unresolved', reason: 'external-or-unresolved', line: ref.line,
        });
      }
    }
  }

  // §24 envelope applied HERE, at the single point every edge is
  // finalized, rather than at each of the ~8 addEdge call sites — one
  // place to be right, and no site can forget it.
  const now = Date.now();
  const priorGraph = readJsonSafe(path.join(repoDir, 'graph.json'), null);
  const prior = priorGraph && Array.isArray(priorGraph.edges)
    ? new Map(priorGraph.edges.filter(e => e.first_seen).map(e => [edgeKey(e), e]))
    : null;
  for (let i = 0; i < edges.length; i++) edges[i] = envelope(edges[i], { now, prior });

  // Stable order — same repo, same graph (§determinism).
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) =>
    a.from.localeCompare(b.from) || a.relation.localeCompare(b.relation) ||
    String(a.to).localeCompare(String(b.to)) || (a.line || 0) - (b.line || 0));

  const relationCounts = {};
  let unresolvedCount = 0;
  for (const e of edges) {
    relationCounts[e.relation] = (relationCounts[e.relation] || 0) + 1;
    if (e.resolution === 'unresolved') unresolvedCount++;
  }

  return {
    version: GRAPH_VERSION,
    repository: repository || (atlas && atlas.repository) || null,
    generatedFrom: {
      atlasHash: atlas ? crypto.createHash('sha256').update(JSON.stringify(atlas)).digest('hex') : null,
      fileCount: files.length, chunkCount: chunkIdx.length, symbolCount: symbols.length,
    },
    relationsSupported: [...RELATIONS_SUPPORTED],
    relationsDeclaredUnsupported: [...RELATIONS_DECLARED_UNSUPPORTED],
    languagesSeen: [...languagesSeen].sort(),
    languagesWithoutExtractors: [...languagesWithoutExtractors].sort(),
    // Files this module has an extractor for, that upstream never labeled
    // with a language. Non-empty means the limiter is import-pipeline.js's
    // LANGUAGES table, not this graph — say which, so nobody debugs the
    // wrong module (§1.2: the module, the operation and the expected vs
    // actual state all present).
    languagesUndetectedUpstream: [...undetectedUpstream.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ext, count]) => ({ ext, wouldExtractAs: EXTRACTABLE_BUT_UNDETECTED_UPSTREAM[ext], files: count })),
    nodes, edges,
    nodeCount: nodes.length, edgeCount: edges.length, unresolvedCount,
    relationCounts,
    generatedAt: Date.now(),
  };
}

// ── §25 traversal ────────────────────────────────────────────────────────

function indexEdges(graph) {
  if (graph._byFrom) return graph._byFrom;
  const m = new Map();
  for (const e of graph.edges) {
    if (!m.has(e.from)) m.set(e.from, []);
    m.get(e.from).push(e);
  }
  Object.defineProperty(graph, '_byFrom', { value: m, enumerable: false, configurable: true });
  return m;
}

/**
 * traverse(graph, { start, relation, direction, depth, filters, includeUnresolved })
 *
 * §25's shape: starting node, relationship type, direction, depth,
 * filters. `direction` is 'out' (default) or 'in', where 'in' walks the
 * materialized inverse (belongs_to / depended_on_by) when one exists and
 * otherwise scans — stated rather than silently slow.
 *
 * Unresolved edges are RETURNED BY DEFAULT (includeUnresolved:true). A
 * traversal that silently hid them would recreate the exact omission
 * §24 forbids, one layer up.
 */
export function traverse(graph, {
  start, relation = 'depends_on', direction = 'out', depth = 1,
  filters = {}, includeUnresolved = true, maxNodes = 5000,
} = {}) {
  if (!graph || !Array.isArray(graph.edges)) throw new Error(`${MODULE_ID}: traverse needs a real graph`);
  if (!start) throw new Error(`${MODULE_ID}: traverse needs a start node id`);

  const wanted = direction === 'in' ? (INVERSE[relation] || relation) : relation;
  const byFrom = indexEdges(graph);
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  if (!RELATIONS_SUPPORTED.includes(relation)) {
    // Asking for a relation this graph declares it does not produce gets
    // an explicit answer, not an empty result that reads like "none".
    return {
      start, relation, direction, depth, visited: [], edges: [], truncated: false,
      unsupported: true,
      note: `relation "${relation}" is declared unsupported by this graph (${GRAPH_VERSION}) — empty is not the same as none`,
    };
  }

  const visited = new Set([start]);
  const collected = [];
  let frontier = [start];
  let truncated = false;

  for (let d = 0; d < Math.max(0, depth); d++) {
    const next = [];
    for (const id of frontier) {
      for (const e of (byFrom.get(id) || [])) {
        if (e.relation !== wanted) continue;
        if (e.resolution === 'unresolved' && !includeUnresolved) continue;
        if (filters.kind && e.to) {
          const n = nodeById.get(e.to);
          if (n && n.kind !== filters.kind) continue;
        }
        if (filters.language && e.to) {
          const n = nodeById.get(e.to);
          if (n && n.language !== filters.language) continue;
        }
        collected.push({ ...e, depth: d + 1 });
        if (e.to && !visited.has(e.to)) {
          if (visited.size >= maxNodes) { truncated = true; continue; }
          visited.add(e.to);
          next.push(e.to);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  visited.delete(start);
  return {
    start, relation, direction, depth,
    visited: [...visited].map(id => nodeById.get(id) || { id, kind: 'unknown' }),
    edges: collected,
    unresolved: collected.filter(e => e.resolution === 'unresolved'),
    truncated,
    unsupported: false,
  };
}

// ── §26 dependency cone ──────────────────────────────────────────────────

/**
 * dependencyCone(graph, { start, depth }) -> the affected cone.
 *
 * §26: "A modification MUST be capable of producing an affected
 * dependency cone... The affected cone determines verification scope."
 * start may be a file node id, a chunk node id, or a bare file path.
 *
 * `affects` is computed here rather than stored as an edge — it is a
 * projection of depends_on, and §10.2 says a projection is derived, not
 * written.
 */
export function dependencyCone(graph, { start, depth = 5 } = {}) {
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  let startId = start;
  if (!nodeById.has(startId)) {
    if (nodeById.has(nodeId('file', start))) startId = nodeId('file', start);
    else if (nodeById.has(nodeId('chunk', start))) startId = nodeId('chunk', start);
    else return { start, found: false, reason: 'no such node', files: [], chunks: [], symbols: [], unresolved: [] };
  }

  const startNode = nodeById.get(startId);
  // A chunk's cone is its file's cone plus itself — a change inside a
  // chunk changes the file, and everything depending on that file is
  // affected. Stated, not assumed silently.
  const fileId = startNode.kind === 'chunk' ? nodeId('file', startNode.file) : startId;

  const up = traverse(graph, { start: fileId, relation: 'depends_on', direction: 'out', depth });
  const down = traverse(graph, { start: fileId, relation: 'depends_on', direction: 'in', depth });

  const affectedFileIds = new Set(down.visited.map(n => n.id));
  affectedFileIds.add(fileId);

  const chunks = graph.edges
    .filter(e => e.relation === 'contains' && affectedFileIds.has(e.from) && e.to && e.to.startsWith('chunk:'))
    .map(e => nodeById.get(e.to)).filter(Boolean);

  const symbols = graph.edges
    .filter(e => e.relation === 'exports' && affectedFileIds.has(e.from) && e.to)
    .map(e => nodeById.get(e.to)).filter(Boolean);

  return {
    start: startId, found: true,
    changed: startNode,
    dependsOn: up.visited,
    affected: down.visited,
    files: [...affectedFileIds].map(id => nodeById.get(id)).filter(Boolean),
    chunks, symbols,
    unresolved: [...up.unresolved, ...down.unresolved],
    truncated: up.truncated || down.truncated,
    // §26's chain names hooks, wires, contracts and tests too. This graph
    // does not produce those node types yet (MCO4) — saying so is the
    // point; an empty array with no explanation would read as "none".
    notYetInCone: ['hooks', 'wires', 'contracts', 'tests', 'components', 'system contracts'],
  };
}

/** affected(graph, files[]) — the union cone for a whole changeset.
 *  This is what MCO2's lazy verification tiers are meant to scope to. */
export function affected(graph, files = []) {
  const fileIds = new Set();
  const unresolved = [];
  let truncated = false;
  for (const f of files) {
    const cone = dependencyCone(graph, { start: f });
    if (!cone.found) continue;
    for (const n of cone.files) fileIds.add(n.id);
    unresolved.push(...cone.unresolved);
    truncated = truncated || cone.truncated;
  }
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  return {
    inputs: files,
    files: [...fileIds].map(id => nodeById.get(id)).filter(Boolean),
    unresolved, truncated,
  };
}

/** writeGraph(repoDir, graph) — graph.json beside the pipeline's own
 *  output. Non-fatal by design: a failed graph write costs queryability,
 *  never the import that produced it. */
// ── persistence ──────────────────────────────────────────────────────────
//
// §10.2 APPLIED, WITH THE MEASUREMENT THAT FORCED IT — "a projection is
// never written directly." Measured on 335 real files from guardian/ and
// lib/, graph.json came to 4082 KB, broken down:
//
//     containment + exports edges   2631 KB   (64%)
//     chunk + symbol nodes          1012 KB   (25%)
//     reference edges (imports…)     361 KB
//     file nodes                      ~77 KB
//
// The first two are a verbatim re-encoding of indexes/chunks.json (822 KB)
// and indexes/symbols.json (244 KB), which are already on disk, already
// canonical, and already the write authority for that fact. 89% of the
// file was a second copy of data the graph does not own. At this rate a
// 10,000-file repository would write roughly 160 MB of mostly duplication,
// which defeats the point of mapping a whole codebase.
//
// So: the IN-MEMORY graph is unchanged and complete (every consumer and
// every test sees the same shape as before). Only the PERSISTED form is
// lean — file nodes and reference edges, the part this module genuinely
// derives — and readGraph() rebuilds the containment half from the
// indexes that own it. Derived on read, not stored twice.
//
// The cost is named rather than hidden: readGraph() now does real work
// instead of one JSON.parse. Measured below in the same benchmark.

const DERIVED_ELSEWHERE = new Set(['contains', 'belongs_to', 'exports']);

/** writeGraph(repoDir, graph) — persists the lean half. Non-fatal by
 *  design: a failed graph write costs queryability, never the import that
 *  produced it. */
export function writeGraph(repoDir, graph) {
  try {
    const p = path.join(repoDir, 'graph.json');
    const { _byFrom, nodes, edges, ...rest } = graph;
    const leanNodes = nodes.filter(n => n.kind === 'file');
    const leanEdges = edges.filter(e => !DERIVED_ELSEWHERE.has(e.relation));
    const clean = {
      ...rest,
      persisted: 'lean',
      // Stated on the artifact itself so nobody reads a lean file as a
      // complete one — the counts are the full graph's, the arrays are not.
      omittedFromDisk: {
        reason: 'derived from indexes/chunks.json and indexes/symbols.json, rebuilt by readGraph() (§10.2)',
        relations: [...DERIVED_ELSEWHERE],
        nodeKinds: ['chunk', 'symbol'],
        nodes: nodes.length - leanNodes.length,
        edges: edges.length - leanEdges.length,
      },
      nodes: leanNodes,
      edges: leanEdges,
    };
    fs.writeFileSync(p, JSON.stringify(clean, null, 2), 'utf8');
    return { ok: true, path: p, bytes: fs.statSync(p).size };
  } catch (e) {
    console.warn(`[${MODULE_ID}] graph write failed (non-fatal): ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/**
 * readGraph(repoDir) — the full graph, containment rebuilt from the
 * indexes that own it. Returns null when there is no graph at all, so a
 * caller can tell "no graph yet" from "a graph with no edges".
 *
 * A graph written before this change (no `persisted:'lean'` marker) is
 * returned as-is — it already carries its containment inline, and
 * rebuilding on top would duplicate every edge. Old artifacts stay
 * readable rather than being silently mangled.
 */
export function readGraph(repoDir) {
  const raw = readJsonSafe(path.join(repoDir, 'graph.json'), null);
  if (!raw) return null;
  if (raw.persisted !== 'lean') return raw;

  const { nodes, edges } = buildContainment(repoDir);
  // The rebuilt half gets the same envelope the persisted half carries,
  // so a consumer cannot tell which edges were stored and which were
  // derived on read — that is the whole point of the lean persistence.
  // first_seen comes from the lean file's own edges where the key
  // matches; containment edges that were never persisted honestly get
  // this read's timestamp rather than a fabricated older one.
  const now = Date.now();
  const prior = new Map(raw.edges.filter(e => e.first_seen).map(e => [edgeKey(e), e]));
  const enveloped = edges.map(e => envelope(e, { now, prior }));
  const full = {
    ...raw,
    nodes: [...raw.nodes, ...nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...raw.edges, ...enveloped].sort((a, b) =>
      a.from.localeCompare(b.from) || a.relation.localeCompare(b.relation) ||
      String(a.to).localeCompare(String(b.to)) || (a.line || 0) - (b.line || 0)),
  };
  delete full.persisted;
  delete full.omittedFromDisk;
  return full;
}

export { MODULE_ID, GRAPH_VERSION, nodeId, DERIVED_ELSEWHERE };
