/**
 * idearium/repo/import-pipeline.js — PROJECT_IMPORT, layers L2-L5
 * (nexus-repository-system.spec §34, §6): PARSE -> ATLAS -> CHUNKS ->
 * VERIFY -> INDEX.
 *
 * Runs AFTER RepoLayer.ingest()+materialize() have produced a real,
 * physical repo directory on disk (repoDir). Reads FROM that
 * materialized projection — not from spec-engine's manifest directly —
 * so it sees exactly what a human or Git would see.
 *
 * §CHUNKS-OWN-FOLDER 2026-09-15 — James: "chunks should be in their own
 * folder." These are structural, sub-file, boundary-verified units per
 * the new spec's chunk schema (§11) — a SECOND, additive representation
 * from spec-engine's existing one-markdown-chunk-per-whole-file store
 * (still flat in idearium/repo/repos/<uuid>/*.md, untouched here).
 * Written to idearium/repo/repos/<uuid>/chunks/, never mixed with the
 * former. repo/index.js's materialize() PRESERVE list was extended
 * (see that file) so a later file edit's quiet re-materialize doesn't
 * wipe this directory.
 *
 * §HONEST SCOPE — "parsing" here is deterministic, regex-based
 * structural-boundary detection per language family (function/class/
 * export boundaries for brace languages, def/class for Python) — not a
 * real AST. Enough to find non-arbitrary chunk boundaries (never cuts
 * mid-body) and list top-level symbols; not semantic analysis. Per
 * spec §10's on_failure rule, a file that can't be read or doesn't
 * parse cleanly stays observable (parse.status='failed', chunkable:
 * false) — it never disappears from the repository model.
 *
 * §42 state machine — run() walks PARSING -> MAPPING -> CHUNKING ->
 * VERIFYING -> INDEXING -> READY|FAULT. A step that throws logs the
 * matching canonical failure event (spec §39) and returns immediately
 * with state:'FAULT' plus whatever earlier steps already completed —
 * nothing is silently swallowed, and prior successful state is never
 * discarded just because a later step failed.
 *
 * §35 INCREMENTAL 2026-09-15 — CHUNKING diffs against its own PREVIOUS
 * output (chunks/index.json + indexes/files.json's per-file
 * contentHash) rather than always doing a full-repo rescan. Every
 * native edit through RepoLayer (writeFile/deleteFile) now reruns this
 * whole pipeline (see repo/index.js's _materializeQuiet), so this
 * matters for real: editing one function in a 500-file repo re-chunks
 * one file, not 500.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { writeRepositoryNode } from './repo-node.js';

const MODULE_ID = 'idearium/repo/import-pipeline';

// §MCO1 — static import, deliberately not a dynamic one. A dynamic
// import() would have forced runImportPipeline() to become async, and
// its 5 real callers include repo/index.js's SYNCHRONOUS
// _materializeQuiet() (run on every native file write/delete). Turning a
// sync contract async across five call sites to add a DERIVED projection
// is the tail wagging the dog (§16.6 — the architecture decides, not the
// call site's convenience). Both files are ESM in the same package, so a
// plain import costs nothing here.
import { buildGraph, writeGraph } from './graph.js';
import { buildSpecGraph, writeSpecGraph } from './spec-graph.js';
import { makeEmitter } from './pipeline-events.js';

// §MCO2 — the lazy L6-L8 pass. Same static-import reasoning as MCO1's
// own note directly above: runImportPipeline() has 5 real synchronous
// callers and must not become async to accommodate a DERIVED, deferred
// projection. scheduleLazyVerification() itself never blocks — see that
// module's own header.
import { scheduleLazyVerification } from './verify-lazy.js';

// lib/languages.js is CJS and idearium is type:module — Node's own
// interop exposes module.exports as the default, so this is a plain
// import, not a createRequire shim.
import languages from '../../lib/languages.js';

// ── language detection (§1 file discovery / language detection) ──────────
// §DERIVED + EXPANDED 2026-09-20 — James: "Expand into the other
// languages." This was a hand-maintained 15-extension map and the
// narrowest of the four that existed; it is why MCO1's graph reported
// languagesUndetectedUpstream for Go/Rust/Ruby/Java/C#/C/C++ — seven
// real reference extractors that could never fire because nothing
// upstream ever labelled a file as one of those languages. That gap was
// named at the time and deliberately not patched with a second table in
// graph.js (§17.1 — detection has one owner). This is the fix at the
// owner: 15 extensions to 62, from lib/languages.js.
//
// §WHAT THIS CHANGES, STATED PLAINLY — a newly-detected language is no
// longer status:'unsupported', so its files are now PARSED, CHUNKED and
// INDEXED where before they were observable but excluded. That is the
// point. What it does NOT do is claim more than it can: BRACE_LANGS and
// SYMBOL_PATTERNS below are unchanged, so a .rs or .swift file chunks on
// the generic whole-file boundary and yields no symbols until a real
// pattern set exists for it. Better than being invisible, and honest
// about the difference — an empty symbol list for a chunked file is a
// visible gap; an unsupported file is a silent one.
const LANGUAGES = languages.EXT_TO_LANGUAGE;
function detectLanguage(relPath) {
  return LANGUAGES[path.extname(relPath).toLowerCase()] || null;
}

const BRACE_LANGS = new Set(['javascript', 'typescript', 'css']);

/**
 * braceDepth(src) — brace balance that ignores braces which are not code.
 *
 * §REAL BUG FIXED 2026-09-19, found by measurement, not by reading. The
 * previous implementation was a bare `for (const ch of content)` counting
 * every `{` and `}` in the file, including ones inside string literals,
 * comments, template literals and regex character classes. Any file whose
 * prose or regexes happen to contain unbalanced braces was marked
 * status:'failed' — which per §10 means chunkable:false, so it is
 * EXCLUDED FROM CHUNKING ENTIRELY and (since MCO1) from the relationship
 * graph too.
 *
 * Measured across 407 real .js files in guardian/, lib/, idearium/ and
 * cortex/ before the fix: 6 files marked parse-failed, and `node --check`
 * passes on ALL SIX. A 100% false-positive rate on this check, and the
 * casualties included guardian/server.js — the single largest and most
 * connected file in the system. Silently dropping the biggest file in the
 * repo out of the map is precisely the failure the chunker exists to
 * prevent.
 *
 * §REUSE (§8.6) — this is the same class of bug lib/version.js's 0.39.125
 * entry already records being found and fixed in cli/decompose.js, whose
 * walkBraceBlock() gained "genuine regex-literal tracking (including
 * character classes, where an unescaped `/` does NOT end the regex) using
 * the same regex-vs-division heuristic every real JS tokenizer uses."
 * That function is a block FINDER in a CJS CLI and neither it nor its
 * stripCommentsAndStrings() is exported, so the state machine is applied
 * here rather than imported — the discipline is reused, and the earlier
 * fix is credited rather than rediscovered as if new.
 *
 * §STILL NOT A PARSER, honestly — this counts braces correctly, it does
 * not validate syntax. A file with balanced braces and genuinely broken
 * syntax still reads as ok. That is unchanged from before and is stated
 * rather than implied away; a real parser is a separate decision.
 */
function braceDepth(src) {
  let depth = 0;
  let inString = null, inLineComment = false, inBlockComment = false;
  let inRegex = false, inRegexClass = false, lastSig = '';
  const templateStack = [];   // brace depth at each open `${` — see below
  for (let i = 0; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inRegex) {
      if (c === '\\') { i++; continue; }
      if (c === '[') { inRegexClass = true; continue; }
      if (c === ']') { inRegexClass = false; continue; }
      if (c === '/' && !inRegexClass) inRegex = false;
      continue;
    }
    if (inString) {
      if (c === '\\') { i++; continue; }
      // A template literal's ${...} IS code and its braces are real, so
      // the scanner has to leave string mode and come back.
      //
      // §CAUGHT BY MEASUREMENT, NOT BY READING — the first version of
      // this just did depth++ and dropped back to code mode, never
      // returning to the template. Everything after the first `${x}` in
      // any template literal was then scanned as code, which cratered
      // the real chunk count from 4731 to 195 and ADDED false positives.
      // Re-measuring against the same 407 files caught it immediately;
      // shipping on the strength of "the logic reads right" would not
      // have. Hence a real stack: templateStack records the brace depth
      // at which each interpolation began, and the matching `}` restores
      // backtick-string mode.
      if (inString === '`' && c === '$' && next === '{') {
        templateStack.push(depth);
        depth++;
        inString = null;
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue; }
    if (c === '/' && !/[\w$)\]]/.test(lastSig)) { inRegex = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      // Closing the brace that opened an interpolation puts us back
      // inside the template literal it belongs to.
      if (templateStack.length && templateStack[templateStack.length - 1] === depth) {
        templateStack.pop();
        inString = '`';
        continue;
      }
    }
    if (!/\s/.test(c)) lastSig = c;
  }
  return depth;
}

// Top-level-only, deterministic regex per language family — not an AST.
const SYMBOL_PATTERNS = {
  javascript: [
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z0-9_$]+)/,
    /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/,
    /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>/,
  ],
  python: [
    /^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/,
    /^class\s+([A-Za-z0-9_]+)/,
  ],
};
SYMBOL_PATTERNS.typescript = [
  ...SYMBOL_PATTERNS.javascript,
  /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/,
  /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/,
];

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

// ── component classification (§16) — deterministic path/name evidence
// first, per spec §16's own rule ("deterministic structural evidence
// first, semantic inference second"). Ported from the standalone
// chunk-index.js prototype built earlier and never wired in — same
// boundary logic, ­added here instead of as a second, competing storage
// system, since this pipeline is the one actually integrated end to end
// (incremental re-chunk on every write, a real .repository node, atlas/
// indexes on disk). "component" is the default, smallest unit — one
// executable file — when nothing more specific matches.
const KIND_BOUNDARY_BEFORE = '(?:^|[\\/\\-_])';
const KIND_BOUNDARY_AFTER  = '(?=[\\/.\\-_]|$)';
function kindRe(pattern) { return new RegExp(KIND_BOUNDARY_BEFORE + pattern + KIND_BOUNDARY_AFTER, 'i'); }
const KIND_RULES = [
  [kindRe('kernel'),                    'kernel'],
  [kindRe('engine'),                    'engine'],
  [kindRe('runtime'),                   'runtime'],
  [kindRe('cli'),                       'CLI'],
  [kindRe('api'),                       'API'],
  [/\.test\.[jt]sx?$|\.spec\.[jt]sx?$|(^|\/)tests?(\/|$)/i, 'test'],
  [kindRe('(routes?|router|controllers?)'), 'controller'],
  [kindRe('(adapters?|bridge)'),        'adapter'],
  [/(^|\/)(config)(\/|\.|$)|\.config\.[jt]s$/i, 'configuration'],
  [kindRe('registry'),                  'registry'],
  [kindRe('(store|storage|db)'),        'storage'],
  [kindRe('dispatch(er)?'),             'dispatcher'],
  [kindRe('pars(er|e)'),                'parser'],
  [kindRe('compil(er|e)'),              'compiler'],
  [kindRe('providers?'),                'provider'],
  [kindRe('services?'),                 'service'],
  [kindRe('(events?|bus)'),             'event-bus'],
  [kindRe('interfaces?'),               'interface'],
];
function classifyKind(filePath) {
  for (const [re, kind] of KIND_RULES) if (re.test(filePath)) return kind;
  return 'component';
}

// ── PARSE (L2) ─────────────────────────────────────────────────────────────
function parseFile(repoDir, relPath) {
  const abs = path.join(repoDir, relPath);
  const language = detectLanguage(relPath);
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); }
  catch (e) {
    return {
      path: relPath, language, status: 'failed', error: e.message,
      observable: true, indexable: true, chunkable: false, symbols: [], lineCount: 0,
    };
  }

  const lines = content.split('\n');
  const contentHash = sha256(content);

  if (!language) {
    // unrecognized extension — not a failure, just unclassified; still
    // observable/indexable/chunkable as a single whole-file unit.
    return { path: relPath, language: null, status: 'unsupported', observable: true, indexable: true, chunkable: true, symbols: [], lineCount: lines.length, content, contentHash };
  }

  const patterns = SYMBOL_PATTERNS[language] || null;
  const symbols = [];
  if (patterns) {
    for (let i = 0; i < lines.length; i++) {
      for (const re of patterns) {
        const m = lines[i].match(re);
        if (m && m[1]) { symbols.push({ name: m[1], line: i + 1 }); break; }
      }
    }
  }

  let braceBalance = null;
  if (BRACE_LANGS.has(language)) braceBalance = braceDepth(content);
  const syntaxOk = braceBalance === null || braceBalance === 0;

  return {
    path: relPath, language, status: syntaxOk ? 'complete' : 'failed',
    error: syntaxOk ? null : `unbalanced braces (delta ${braceBalance})`,
    observable: true, indexable: true,
    chunkable: syntaxOk, // §10 on_failure — malformed files are observable/indexable but NOT chunked
    symbols, lineCount: lines.length, content, contentHash,
  };
}

function parse(repoDir, files) {
  return files.map(f => parseFile(repoDir, f.path));
}

function summarizeParse(parsed) {
  return {
    fileCount: parsed.length,
    failed: parsed.filter(p => p.status === 'failed').map(p => ({ path: p.path, error: p.error })),
    unsupported: parsed.filter(p => p.status === 'unsupported').length,
  };
}

// ── ATLAS (L4) — compressed topology, not raw source ────────────────────────
function buildAtlas(repo, parsed) {
  const tree = {};
  const components = [];
  for (const p of parsed) {
    const parts = p.path.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || { __dir: true, children: {} };
      node = node[parts[i]].children;
    }
    const kind = classifyKind(p.path);
    node[parts[parts.length - 1]] = { language: p.language, status: p.status, symbolCount: p.symbols.length, lineCount: p.lineCount, kind };
    components.push({ path: p.path, kind, language: p.language, symbolCount: p.symbols.length });
  }
  const byLanguage = {};
  for (const p of parsed) { const l = p.language || 'unknown'; byLanguage[l] = (byLanguage[l] || 0) + 1; }
  const byKind = {};
  for (const c of components) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  return {
    repository: repo.uuid, generatedAt: Date.now(),
    fileCount: parsed.length, byLanguage, byKind,
    failedCount: parsed.filter(p => p.status === 'failed').length,
    tree, components,
  };
}

// ── CHUNKS (L3) — one chunk per top-level symbol, else one whole-file chunk.
// A symbol's chunk runs from its own start line to the line before the
// NEXT top-level symbol (or EOF) — never cuts mid-body. A leading
// preamble before the first symbol (imports, etc.) becomes its own
// chunk rather than being silently dropped.
function chunkFile(repo, parsed, chunkDir) {
  if (!parsed.chunkable) return [];
  const lines = (parsed.content || '').split('\n');
  const bounds = parsed.symbols.length
    ? parsed.symbols.map((s, i) => ({ startLine: s.line, endLine: (parsed.symbols[i + 1]?.line ?? lines.length + 1) - 1, symbol: s.name }))
    : [{ startLine: 1, endLine: lines.length, symbol: null }];

  const chunks = [];
  if (bounds.length && bounds[0].startLine > 1) chunks.push({ startLine: 1, endLine: bounds[0].startLine - 1, symbol: null });
  chunks.push(...bounds);

  return chunks.map((b, idx) => {
    const text = lines.slice(b.startLine - 1, b.endLine).join('\n');
    const id = `chunk-${sha256(`${repo.uuid}:${parsed.path}:${idx}`).slice(0, 16)}`;
    const fileName = `${parsed.path.replace(/[\\/]/g, '__')}__${idx}.json`;
    const chunk = {
      id, repository: repo.uuid, file: parsed.path,
      range: { start_line: b.startLine, end_line: b.endLine },
      symbols: b.symbol ? [b.symbol] : [],
      parent: null, tags: [], relations: [], dependencies: [], contracts: [], tests: [],
      hash: { content: sha256(text) },
      status: text.trim().length ? 'complete' : 'empty',
    };
    fs.writeFileSync(path.join(chunkDir, fileName), JSON.stringify({ ...chunk, content: text }, null, 2), 'utf8');
    return { ...chunk, _file: fileName };
  });
}

// ── MCO2 L4 — semantic consistency, basis: existing symbol table ─────────
// §HONEST SCOPE — "semantic" here is exactly what indexes/symbols.json
// already claims to know, cross-checked against a second, independently
// -built view of the same fact: each chunk's own recorded `symbols`
// (assigned during CHUNKING, from the same parse pass but a different
// code path). Two views of one fact disagreeing is a real bug — a
// chunk boundary computed from a symbol the index does not have on
// record for that file. This is not new extraction; it is the
// consistency check §37 asks for, using only data already in memory.
function verifySemanticConsistency(indexes) {
  const symbolsByFile = new Map();
  for (const s of indexes.symbols) {
    if (!symbolsByFile.has(s.file)) symbolsByFile.set(s.file, new Set());
    symbolsByFile.get(s.file).add(s.name);
  }
  const failures = [];
  for (const c of indexes.chunks) {
    for (const sym of c.symbols || []) {
      const known = symbolsByFile.get(c.file);
      if (!known || !known.has(sym)) failures.push({ file: c.file, chunk: c.id, symbol: sym });
    }
  }
  return { level: 'L4', name: 'semantic consistency', passed: failures.length === 0, failures };
}

// ── MCO2 L5 — dependency consistency, basis: MCO1 graph ──────────────────
// §HONEST SCOPE — distinct from L1 (a CHUNK addressed to a file that
// exists). This checks the GRAPH's own resolved edges: an edge marked
// 'resolved' (not 'unresolved' — those are §24's honestly-named misses,
// not failures) whose target is a file this import's own index does not
// contain would mean the graph and the index have drifted from each
// other — genuinely inconsistent, not merely incomplete.
function verifyDependencyConsistency(graph, indexes) {
  const filePaths = new Set(indexes.files.map(f => f.path));
  const failures = [];
  for (const e of graph.edges) {
    if (e.resolution !== 'resolved' || !e.to || !e.to.startsWith('file:')) continue;
    const targetPath = e.to.slice('file:'.length);
    if (!filePaths.has(targetPath)) failures.push({ from: e.from, to: e.to, relation: e.relation });
  }
  return { level: 'L5', name: 'dependency consistency', passed: failures.length === 0, failures };
}

// ── VERIFY (§37) — import performs syntax, boundary, structural integrity ──
function verify(repoDir, parsed, chunks) {
  const chunkDir = path.join(repoDir, 'chunks');
  const tiers = [];

  const existenceOk = chunks.every(c => fs.existsSync(path.join(chunkDir, c._file)));
  tiers.push({ level: 'L0', name: 'existence', passed: existenceOk });

  const fileSet = new Set(parsed.map(p => p.path));
  const addressOk = chunks.every(c => fileSet.has(c.file));
  tiers.push({ level: 'L1', name: 'address', passed: addressOk });

  const syntaxFailures = parsed.filter(p => p.status === 'failed').map(p => p.path);
  tiers.push({ level: 'L2', name: 'syntax', passed: syntaxFailures.length === 0, failures: syntaxFailures });

  let boundaryOk = true;
  const byFile = {};
  for (const c of chunks) (byFile[c.file] ||= []).push(c);
  for (const list of Object.values(byFile)) {
    list.sort((a, b) => a.range.start_line - b.range.start_line);
    for (let i = 0; i < list.length; i++) {
      if (list[i].range.end_line < list[i].range.start_line) boundaryOk = false;
      if (i > 0 && list[i].range.start_line <= list[i - 1].range.end_line) boundaryOk = false;
    }
  }
  tiers.push({ level: 'L3', name: 'structural boundary', passed: boundaryOk });

  const allPassed = tiers.every(t => t.passed);
  return { tiers, status: allPassed ? 'passed' : 'partial', level: allPassed ? 'L3' : tiers.find(t => !t.passed).level };
}

// ── INDEX (L5) — deterministic address resolution, not raw source ──────────
function buildIndexes(parsed, chunks) {
  const files = parsed.map(p => ({ path: p.path, language: p.language, status: p.status, contentHash: p.contentHash || null, chunkCount: chunks.filter(c => c.file === p.path).length }));
  const symbols = [];
  for (const p of parsed) for (const s of p.symbols) symbols.push({ name: s.name, file: p.path, line: s.line });
  const chunkIndex = chunks.map(c => ({ id: c.id, file: c.file, range: c.range, symbols: c.symbols, hash: c.hash.content }));
  return { files, symbols, chunks: chunkIndex };
}

// ── Query surface — reads what runImportPipeline() already wrote to
// disk (atlas.json, indexes/*.json, chunks/*.json). No second storage
// system: everything below is a read, never a write, of the same files
// the pipeline itself produces.
function loadJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

/** readAtlas(repoDir) — §14 compressed map: files/symbols/chunk metadata,
 * component kinds, no chunk content. */
export function readAtlas(repoDir) {
  const atlas = loadJsonSafe(path.join(repoDir, 'atlas.json'));
  const files = loadJsonSafe(path.join(repoDir, 'indexes', 'files.json')) || [];
  const symbols = loadJsonSafe(path.join(repoDir, 'indexes', 'symbols.json')) || [];
  const chunks = loadJsonSafe(path.join(repoDir, 'indexes', 'chunks.json')) || [];
  if (!atlas) return { error: 'no atlas.json — repo has not been through the import pipeline yet' };
  return { ...atlas, indexes: { files, symbols, chunks } };
}

/** queryByKind(repoDir, kind) — components of one kind (kernel/engine/runtime/...). */
export function queryByKind(repoDir, kind) {
  const atlas = loadJsonSafe(path.join(repoDir, 'atlas.json'));
  if (!atlas) return [];
  return (atlas.components || []).filter(c => c.kind === kind);
}

function tokenize(s) {
  if (!s) return [];
  return (s.match(/[A-Za-z]+|[0-9]+/g) || [])
    .flatMap(w => w.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_\-./]+/))
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 2);
}

/**
 * searchRepo(repoDir, query) — deterministic token-overlap search over
 * symbol names and chunk file paths (no LLM, no separate index to keep
 * in sync — reads indexes/symbols.json + indexes/chunks.json directly).
 * Ranks by how many distinct query tokens matched.
 */
export function searchRepo(repoDir, query) {
  const qTokens = new Set(tokenize(query));
  if (!qTokens.size) return [];
  const symbols = loadJsonSafe(path.join(repoDir, 'indexes', 'symbols.json')) || [];
  const chunkIdx = loadJsonSafe(path.join(repoDir, 'indexes', 'chunks.json')) || [];
  const scoreByChunkFile = new Map(); // file -> {score, chunkIds}

  for (const s of symbols) {
    const matched = tokenize(s.name).filter(t => qTokens.has(t)).length;
    if (!matched) continue;
    const forFile = scoreByChunkFile.get(s.file) || { score: 0, chunkIds: new Set(), symbols: [] };
    forFile.score += matched; forFile.symbols.push(s.name);
    scoreByChunkFile.set(s.file, forFile);
  }
  for (const c of chunkIdx) {
    const nameTokens = (c.symbols || []).flatMap(tokenize).concat(tokenize(c.file));
    const matched = nameTokens.filter(t => qTokens.has(t)).length;
    if (!matched) continue;
    const forFile = scoreByChunkFile.get(c.file) || { score: 0, chunkIds: new Set(), symbols: [] };
    forFile.score += matched; forFile.chunkIds.add(c.id);
    scoreByChunkFile.set(c.file, forFile);
  }

  return [...scoreByChunkFile.entries()]
    .map(([file, v]) => ({ file, score: v.score, symbols: v.symbols, chunkIds: [...v.chunkIds] }))
    .sort((a, b) => b.score - a.score);
}

// ── orchestrator ─────────────────────────────────────────────────────────
/**
 * runImportPipeline(repo, repoDir) — repo is a RepoLayer.get()-shaped
 * record (needs .uuid and .files[]), repoDir is the repo's real,
 * materialized directory. Synchronous, disk-only, no network — safe to
 * call right after RepoLayer.materialize() succeeds and before the
 * compartment resolves (spec §34: parse -> atlas -> chunks -> verify ->
 * index -> compartment:import:ready).
 */
/**
 * runImportPipeline(repo, repoDir, { onEvent }) — parse, atlas, chunk, verify, index, graph.
 * §MCO4 2026-09-20 — `onEvent(e)` receives the §20 events catalogued in
 * pipeline-events.js: { type, repository, at, payload }. Optional; without it
 * nothing changes.
 */
export function runImportPipeline(repo, repoDir, opts = {}) {
  const emit = makeEmitter(repo.uuid, opts.onEvent);
  emit('repository:import:start', { fileCount: (repo.files || []).length });
  const r = _runImportPipeline(repo, repoDir, emit, opts);
  if (r.state === 'FAULT') emit('repository:import:failed', { error: r.error || 'see verification tiers' });
  else emit('repository:import:ready', { state: r.state, chunks: r.chunks?.count ?? null });
  return r;
}

function _runImportPipeline(repo, repoDir, emit, opts = {}) {
  const result = { repository: repo.uuid, state: 'PARSING', startedAt: Date.now() };

  let parsed;
  try { parsed = parse(repoDir, repo.files || []); }
  catch (e) {
    console.error(`[${MODULE_ID}] repository:parse:failed — ${e.message}`);
    return { ...result, state: 'FAULT', error: `parse failed: ${e.message}` };
  }

  for (const p of parsed) {
    if (p.status === 'failed') emit('parse:file:failed', { path: p.path, error: p.error || null });
    else emit('parse:file:complete', { path: p.path, status: p.status });
  }
  emit('parse:batch:complete', { files: parsed.length, failed: parsed.filter(p => p.status === 'failed').length });

  result.state = 'MAPPING';
  let atlas;
  try {
    emit('atlas:build:start', {});
    atlas = buildAtlas(repo, parsed);
    fs.writeFileSync(path.join(repoDir, 'atlas.json'), JSON.stringify(atlas, null, 2), 'utf8');
    emit('atlas:build:complete', { fileCount: atlas.fileCount });
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:atlas:failed — ${e.message}`);
    return { ...result, state: 'FAULT', parse: summarizeParse(parsed), error: `atlas failed: ${e.message}` };
  }

  result.state = 'CHUNKING';
  let chunks, chunkDir, incremental;
  let changedFilePaths = []; // §MCO2 — what the lazy L6-L8 pass scopes to
  try {
    emit('chunk:decompose:start', {});
    chunkDir = path.join(repoDir, 'chunks');
    fs.mkdirSync(chunkDir, { recursive: true });

    // §35 INCREMENTAL — diff against the PREVIOUS run's own output
    // (chunks/index.json + indexes/files.json's per-file contentHash),
    // not the whole repo. Only a file that's new or whose contentHash
    // changed gets re-chunked (its old chunk files removed first, so a
    // shrunk file doesn't leave a stale trailing chunk); every other
    // file's chunks are the exact same, already-verified objects from
    // last run, physical chunk files untouched. "Unchanged verified
    // chunks SHOULD remain valid" (§35) — this is that, literally: nothing
    // is even re-hashed for them, let alone rewritten.
    const prevIndexPath = path.join(chunkDir, 'index.json');
    const prevChunks = fs.existsSync(prevIndexPath) ? JSON.parse(fs.readFileSync(prevIndexPath, 'utf8')) : [];
    const prevByFile = {};
    for (const c of prevChunks) (prevByFile[c.file] ||= []).push(c);

    const prevFilesPath = path.join(repoDir, 'indexes', 'files.json');
    const prevHashByFile = {};
    if (fs.existsSync(prevFilesPath)) {
      for (const f of JSON.parse(fs.readFileSync(prevFilesPath, 'utf8'))) if (f.contentHash) prevHashByFile[f.path] = f.contentHash;
    }

    const currentPaths = new Set(parsed.map(p => p.path));
    const removedPaths = Object.keys(prevByFile).filter(p => !currentPaths.has(p));
    const changedFiles = [];
    const unchangedFiles = [];
    for (const p of parsed) {
      // hash comparison alone, NOT chunk presence — a non-chunkable file
      // (e.g. one that fails syntax verification) legitimately has zero
      // prior chunks even when its content hasn't changed since last run.
      const known = Object.prototype.hasOwnProperty.call(prevHashByFile, p.path) && prevHashByFile[p.path] === p.contentHash;
      (known ? unchangedFiles : changedFiles).push(p);
    }

    // stale physical chunk files: anything belonging to a changed or
    // removed path gets cleared before re-chunking — same
    // wipe-then-rewrite discipline as materialize() itself, just scoped
    // to the affected files instead of the whole directory.
    const staleDirPrefixes = [...changedFiles.map(f => f.path), ...removedPaths].map(p => `${p.replace(/[\\/]/g, '__')}__`);
    if (staleDirPrefixes.length) {
      for (const entry of fs.readdirSync(chunkDir)) {
        if (entry === 'index.json') continue;
        if (staleDirPrefixes.some(prefix => entry.startsWith(prefix))) fs.rmSync(path.join(chunkDir, entry), { force: true });
      }
    }

    const freshChunks = changedFiles.flatMap(p => chunkFile(repo, p, chunkDir));
    const reusedChunks = unchangedFiles.flatMap(p => prevByFile[p.path] || []);
    chunks = [...freshChunks, ...reusedChunks];
    incremental = { changed: changedFiles.length, unchanged: unchangedFiles.length, removed: removedPaths.length };
    changedFilePaths = changedFiles.map(f => f.path);
    fs.writeFileSync(path.join(chunkDir, 'index.json'), JSON.stringify(chunks.map(({ content, ...c }) => c), null, 2), 'utf8');
    emit('chunk:decompose:complete', { chunks: chunks.length, incremental });
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:chunk:failed — ${e.message}`);
    return { ...result, state: 'FAULT', parse: summarizeParse(parsed), atlas, error: `chunk failed: ${e.message}` };
  }

  result.state = 'VERIFYING';
  let verification;
  try {
    verification = { repository: repo.uuid, ...verify(repoDir, parsed, chunks) };
    fs.writeFileSync(path.join(repoDir, 'verification.json'), JSON.stringify(verification, null, 2), 'utf8');
    // L0-L3 (the chunk/structure tiers). L4-L8 (semantic, dependency, lazy) are not evented.
    const failedTiers = (verification.tiers || []).filter(t => !t.passed).map(t => t.level);
    emit(failedTiers.length ? 'chunk:verify:failed' : 'chunk:verify:complete', { failedTiers });
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:verification:failed — ${e.message}`);
    return { ...result, state: 'FAULT', parse: summarizeParse(parsed), atlas, chunks: chunks.length, error: `verify failed: ${e.message}` };
  }

  result.state = 'INDEXING';
  let indexes;
  try {
    indexes = buildIndexes(parsed, chunks);
    const idxDir = path.join(repoDir, 'indexes');
    fs.mkdirSync(idxDir, { recursive: true });
    fs.writeFileSync(path.join(idxDir, 'files.json'), JSON.stringify(indexes.files, null, 2), 'utf8');
    fs.writeFileSync(path.join(idxDir, 'symbols.json'), JSON.stringify(indexes.symbols, null, 2), 'utf8');
    fs.writeFileSync(path.join(idxDir, 'chunks.json'), JSON.stringify(indexes.chunks, null, 2), 'utf8');
    emit('index:build:complete', { files: indexes.files.length, symbols: indexes.symbols.length });
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:index:failed — ${e.message}`);
    return { ...result, state: 'FAULT', parse: summarizeParse(parsed), atlas, chunks: chunks.length, verification, error: `index failed: ${e.message}` };
  }

  // §24-26 GRAPHING — MCO1. Derived from the indexes just written, plus
  // one reference pass. Placed AFTER INDEXING because it reads that
  // output (§3.1 — nothing is built on something that does not exist
  // yet) and BEFORE readiness because a repo's edges are part of what
  // makes it addressable.
  //
  // §NON-FATAL BY DESIGN — a graph failure never FAULTs an import that
  // otherwise parsed, chunked, verified and indexed. The repo is still
  // real and still usable without edges; losing the whole import over a
  // derived projection would be the tail wagging the dog. The failure is
  // recorded on the result, never swallowed (§1.2).
  result.state = 'GRAPHING';
  let graphSummary = null;
  let graphObj = null; // §MCO2 — lifted out of the try so L5 and the lazy
                        // scheduler below can use the real, full graph
                        // (writeGraph's lean copy is a separate object —
                        // see graph.js's own §10.2 note — never this one).
  try {
    graphObj = buildGraph({ repoDir, repository: repo.uuid });
    const written = writeGraph(repoDir, graphObj);
    graphSummary = {
      nodeCount: graphObj.nodeCount, edgeCount: graphObj.edgeCount,
      unresolvedCount: graphObj.unresolvedCount, relationCounts: graphObj.relationCounts,
      languagesUndetectedUpstream: graphObj.languagesUndetectedUpstream,
      written: written.ok, writeError: written.error || null,
    };
    emit('graph:build:complete', { nodes: graphObj.nodeCount, edges: graphObj.edgeCount });
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:graph:failed — ${e.message}`);
    graphSummary = { error: e.message, nodeCount: 0, edgeCount: 0 };
  }

  // §SPEC-GRAPHING 0.39.246 — the specification graph (what is declared),
  // built from every catalog .spec in the repo and compared against the code
  // graph just built. Third of the three graphs (code · execution · spec).
  // Non-fatal by the same rule as GRAPHING: it never displaces READY/FAULT.
  let specGraphSummary = null;
  try {
    const sg = buildSpecGraph({ repoDir, files: indexes.files, codeGraph: graphObj });
    writeSpecGraph(repoDir, sg);
    specGraphSummary = { status: sg.status, ...sg.summary, ...(sg.reason ? { reason: sg.reason } : {}) };
    emit('spec:graph:complete', specGraphSummary);
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:spec-graph:failed — ${e.message}`);
    specGraphSummary = { status: 'failed', error: e.message };
    emit('spec:graph:failed', { error: e.message });
  }

  // §MCO2 DEEPENING — L4 (semantic) and L5 (dependency) extend verify()'s
  // L0-L3 now that indexes.symbols/chunks (INDEXING) and the graph
  // (GRAPHING, just above) both exist. Merged into the SAME
  // verification.json rather than a second file — one verification
  // artifact for L0-L5, all synchronous, all cheap (pure re-reads of
  // data already in memory this same call). Non-fatal by the same rule
  // GRAPHING follows: a deepening failure never displaces the L0-L3
  // result already written above.
  let lazyScheduled = null;
  try {
    const l4 = verifySemanticConsistency(indexes);
    verification.tiers.push(l4);
    if (graphObj) verification.tiers.push(verifyDependencyConsistency(graphObj, indexes));
    const allPassed = verification.tiers.every(t => t.passed);
    verification.status = allPassed ? 'passed' : 'partial';
    verification.level = allPassed ? 'L5' : verification.tiers.find(t => !t.passed).level;
    fs.writeFileSync(path.join(repoDir, 'verification.json'), JSON.stringify(verification, null, 2), 'utf8');
  } catch (e) {
    console.error(`[${MODULE_ID}] repository:verification-deepening:failed — ${e.message}`);
  }

  // §MCO2 LAZY — L6-L8, scoped to exactly this import's changed files'
  // affected cone (§26/§37). Fire-and-forget: never awaited here, never
  // blocks READY/FAULT below, never blocks the caller's response. A
  // graph-less run (GRAPHING threw above) has no cone to scope to, so
  // there is nothing honest to schedule — stated, not silently skipped.
  if (graphObj) {
    try {
      lazyScheduled = scheduleLazyVerification({
        repoDir, repository: repo.uuid, graph: graphObj, changedFiles: changedFilePaths,
        runtimeProof: opts.runtimeProof !== false, // 0.39.246 — execution graph on by default; a caller may opt out
      });
    } catch (e) {
      console.error(`[${MODULE_ID}] repository:lazy-verification-schedule:failed — ${e.message}`);
      lazyScheduled = { scheduled: false, error: e.message };
    }
  } else {
    lazyScheduled = { scheduled: false, reason: 'no graph to scope the affected cone to' };
  }

  // §41 readiness — structurally addressable and safe for the next
  // operation, NOT "every file parsed cleanly." Only L0/L1 (a chunk
  // genuinely missing on disk, or addressed to a file that isn't in
  // the repo) make the REPO unaddressable — that's a real fault. A
  // per-file L2 syntax failure is already handled per §10: the file
  // stays observable/indexable, just excluded from chunking; one
  // malformed file must not FAULT an otherwise-good import.
  const critical = verification.tiers.filter(t => ['L0', 'L1'].includes(t.level) && !t.passed);
  result.state = critical.length ? 'FAULT' : 'READY';

  const finalResult = {
    ...result,
    finishedAt: Date.now(),
    parse: summarizeParse(parsed),
    atlas: { fileCount: atlas.fileCount, byLanguage: atlas.byLanguage, failedCount: atlas.failedCount },
    chunks: { count: chunks.length, dir: chunkDir, incremental },
    verification,
    indexes: { fileCount: indexes.files.length, symbolCount: indexes.symbols.length, chunkCount: indexes.chunks.length },
    graph: graphSummary,
    specGraph: specGraphSummary, // 0.39.246 — spec graph (spec-graph.json)
    lazyVerification: lazyScheduled, // §MCO2 — L6-L8 status; see verification.lazy.json
  };

  // §3 "A repository is a first-class node" — one canonical, addressable
  // node per repo, written here (not by each of runImportPipeline()'s 3
  // callers separately) so it's never possible for a caller to forget
  // it and leave the repo's identity node stale. Reaches this point on
  // both READY and FAULT (a fault from a critical L0/L1 failure still
  // deserves a queryable node saying so — REPO-024, no failure silently
  // swallowed) — only the 4 early-throw paths above (parse/atlas/chunk/
  // index each literally throwing, not just verifying imperfectly) skip
  // it, since there isn't a real result shape yet to write honestly.
  writeRepositoryNode(repo, finalResult, repoDir);

  return finalResult;
}

export { MODULE_ID };
