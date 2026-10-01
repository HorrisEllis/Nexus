'use strict';
/**
 * lib/chunker/index.js — the one document-chunking implementation, shared
 * UUID: nexus-lib-chunker-v1-0000-2026-0714-jamesbrooks-001
 * Version: 1.0.0
 *
 * §CONSOLIDATION 2026-07-14 — "i want to consolidate the chunking into one
 * system also. for loom and idearium." Checked first: loom has no competing
 * chunker to reconcile (loom/ingest/index.js does whole-ZIP revision
 * diffing — sha256 + `unzip -l` listing — a completely different job).
 * So this isn't a merge of two implementations; it's the boundary-detection
 * logic that used to live only in idearium/spec-engine/index.js, moved
 * here so idearium calls it instead of owning a private copy, and loom (or
 * anything else that needs to split a document into addressable pieces)
 * has a real place to get the same one, instead of growing its own the
 * day it needs one.
 *
 * §MODULE SYSTEM — CJS, matching the nexus root default and loom's own
 * convention. idearium (ESM, its own package.json) reaches this the same
 * way its own index.js already reaches cortex/meta — createRequire. See
 * idearium/spec-engine/index.js's import for the concrete call.
 *
 * §WHAT MOVED HERE, VERBATIM — the byte-fidelity-fixed boundary detector
 * from spec-engine (three dialects: YAML sibling keys, Markdown headers,
 * line-statement DSL; shallowest repeating indent/depth wins). Same
 * §BYTE-FIDELITY FIX 2026-07-14 history applies — see git-adjacent comments
 * inline. Verified byte-exact against causal-nexus.spec before and after
 * this move (same test, same result: reconstructed === source).
 *
 * §WHAT'S NEW HERE — structuralProfile(): real counts (deps, gate/hook
 * events, failure modes, invariant refs) extracted from a chunk's own raw
 * text, not invented. This is the "cognitive seam" measurement from this
 * session's chat — size alone (chars/tokens) doesn't predict reasoning
 * load; `enforcement` (3307 chars, 12 invariant_refs) proved that directly
 * against `kernel` (6642 chars, 8 invariant_refs spread across 4
 * categories) on the real spec. The extraction patterns below are tuned to
 * THIS spec dialect's actual conventions (`- module_id:`, `- event:`,
 * `- id: FAIL-`, `invariant_refs: [...]`) — documented as dialect-specific,
 * not claimed universal.
 */

// ═══════════════════════════════════════════════════════════════════════
//  BOUNDARY DETECTION — moved from idearium/spec-engine/index.js
// ═══════════════════════════════════════════════════════════════════════

// A block shorter than this is cheap enough to read as one chunk — splitting
// it would just create noise, not clarity. Above it, density is exactly the
// symptom the boundary engine is looking for. Purely a "should we look for
// sub-boundaries at all" gate — NOT a size guarantee on the resulting
// pieces (see structuralProfile below for why that gap matters).
const SPLIT_THRESHOLD_CHARS = 1200;

// Three dialects, tried in order: YAML sibling keys, Markdown headers,
// line-statement DSL. First one that finds real repetition (>=3 matches)
// wins. Silently defeating all three just means one undivided chunk —
// "information not lost but not usefully bounded," not a crash.
function detectSubBoundaries(body) {
  return detectYamlBoundaries(body) || detectMarkdownBoundaries(body) || detectDeclarationBoundaries(body);
}

// Dialect 1 — YAML sibling keys: "  key:" lines grouped by indent depth.
// The shallowest indent with >=3 repeats is the true outer partition (e.g.
// the 21 module names in a MODULES block). Deeper indents recur more often
// (every module repeats "inputs:", "outputs:", ...) but that's structure
// INSIDE each unit, not between units — picking the deepest one would
// slice spans across module boundaries and produce colliding, wrongly-
// scoped chunks.
function detectYamlBoundaries(body) {
  const lines = body.split('\n');
  const keyLineRe = /^(\s+)([a-zA-Z][\w.-]*):\s*$/;
  const byIndent = new Map();
  lines.forEach((line, i) => {
    const m = line.match(keyLineRe);
    if (!m) return;
    const indent = m[1].length;
    if (!byIndent.has(indent)) byIndent.set(indent, []);
    byIndent.get(indent).push({ key: m[2], lineIdx: i });
  });
  let best = null;
  for (const [indent, matches] of [...byIndent.entries()].sort((a, b) => a[0] - b[0])) {
    if (matches.length >= 3) { best = matches; break; }
  }
  return best ? spansFromMatches(lines, best) : null;
}

// Dialect 2 — Markdown headers: "## Title" lines grouped by "#" depth.
// Same rule as YAML: shallowest depth with >=3 repeats wins.
function detectMarkdownBoundaries(body) {
  const lines = body.split('\n');
  const headerRe = /^(#{1,6})\s+(.+?)\s*$/;
  const byDepth = new Map();
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const m = line.match(headerRe);
    if (!m) return;
    const depth = m[1].length;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push({ key: m[2], lineIdx: i });
  });
  let best = null;
  for (const [depth, matches] of [...byDepth.entries()].filter(([d]) => d >= 2).sort((a, b) => a[0] - b[0])) {
    if (matches.length >= 3) { best = matches; break; }
  }
  if (!best) {
    const depth1 = byDepth.get(1);
    if (depth1 && depth1.length >= 3) best = depth1;
  }
  return best ? spansFromMatches(lines, best) : null;
}

// Dialect 3 — line-statement DSLs (e.g. `domain "name"`): a bare keyword
// at column 0 (or a shared indent), followed by a quoted or bare
// identifier, repeated 3+ times.
function detectDeclarationBoundaries(body) {
  const lines = body.split('\n');
  const declRe = /^(\s*)([a-zA-Z][\w-]*)\s+"?([\w][\w.\/-]*)"?\s*(\{|\bversion\b|$)/;
  const byKeyword = new Map();
  lines.forEach((line, i) => {
    const m = line.match(declRe);
    if (!m) return;
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) return;
    if (/:/.test(line.slice(0, line.indexOf(m[3])))) return;
    const groupKey = `${m[1].length}:${m[2]}`;
    if (!byKeyword.has(groupKey)) byKeyword.set(groupKey, []);
    byKeyword.get(groupKey).push({ key: m[3], lineIdx: i });
  });
  let best = null;
  for (const matches of byKeyword.values()) {
    if (matches.length >= 3 && (!best || matches.length > best.length)) best = matches;
  }
  return best ? spansFromMatches(lines, best) : null;
}

// §BYTE-FIDELITY — lines.slice(a,b).join('\n') across CONTIGUOUS, gapless
// partitions of the same split array is a lossless roundtrip on its own.
// No trim() here — trimming is what broke byte-fidelity originally (ate
// the newline separating one span from the next). Raw slices preserved;
// callers that need the separator back (see chunkDocument below) add
// exactly one '\n', never two.
function spansFromMatches(lines, matches) {
  const spans = matches.map((m, idx) => {
    const startLine = m.lineIdx;
    const endLine = idx + 1 < matches.length ? matches[idx + 1].lineIdx : lines.length;
    return { key: m.key, text: lines.slice(startLine, endLine).join('\n') };
  });
  const preamble = lines.slice(0, matches[0].lineIdx).join('\n');
  return { spans, preamble };
}

function slug(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

// ═══════════════════════════════════════════════════════════════════════
//  DOCUMENT-LEVEL SPLIT — block banners + sub-boundaries, byte-verified
// ═══════════════════════════════════════════════════════════════════════

/**
 * chunkDocument(text, opts) -> { queue, byteFidelity }
 *
 * queue: [{ id, title, desc, content, sourceBlock, sourceKey }] — in
 *   document order, content already includes the exact separators needed
 *   to reconstruct the source when concatenated.
 * byteFidelity: { verified, sourceBytes, reconstructedBytes } — checked
 *   by actual reconstruction, not assumed. §1.1 nothing exists until proven.
 *
 * bannerRe defaults to the "# BLOCK N — TITLE" convention idearium's specs
 * use; pass a different one for other document dialects.
 */
function chunkDocument(text, opts = {}) {
  const bannerRe = opts.bannerRe || /#\s*BLOCK\s*\d+\s*[—-]\s*([A-Z][A-Z _]+)/g;
  const splitThreshold = opts.splitThresholdChars || SPLIT_THRESHOLD_CHARS;

  const blocks = {};
  const banners = [...text.matchAll(bannerRe)];
  if (banners.length) {
    if (banners[0].index > 0) blocks['preamble'] = text.slice(0, banners[0].index);
    for (let i = 0; i < banners.length; i++) {
      // §0.39.290 — two sections with the same heading ("## Overview" twice) used to share one key, and the later
      // silently replaced the earlier (content lost, byte fidelity failed). Each now keeps its own key.
      let title = banners[i][1].trim().toLowerCase();
      if (blocks[title] !== undefined) { let n = 2; while (blocks[`${title} (${n})`] !== undefined) n++; title = `${title} (${n})`; }
      const start = banners[i].index;
      const end = i + 1 < banners.length ? banners[i + 1].index : text.length;
      blocks[title] = text.slice(start, end);
    }
  } else {
    blocks['document'] = text;
  }

  const queue = [];
  for (const [title, body] of Object.entries(blocks)) {
    const sl = slug(title);
    const boundaries = body.length > splitThreshold ? detectSubBoundaries(body) : null;

    if (boundaries) {
      let first = true;
      for (const span of boundaries.spans) {
        let content;
        if (first && boundaries.preamble) content = `${boundaries.preamble}\n${span.text}`;
        else if (first) content = span.text;
        else content = `\n${span.text}`;
        first = false;
        queue.push({
          id: `${sl}-${slug(span.key)}`,
          title: `${title} — ${span.key}`,
          desc: `auto-split from "${title}" (natural boundary: ${span.key})`,
          content, sourceBlock: title, sourceKey: span.key,
        });
      }
    } else {
      queue.push({ id: sl, title, desc: `block: ${title}`, content: body, sourceBlock: title, sourceKey: null });
    }
  }

  // §1.1 nothing exists until proven — reconstruct and diff before calling
  // this trustworthy. Non-fatal (a novel document shape could legitimately
  // fail this), never silent either way.
  const reconstructed = queue.map(q => q.content).join('');
  const verified = reconstructed === text;
  const byteFidelity = { verified, sourceBytes: text.length, reconstructedBytes: reconstructed.length };
  if (!verified) {
    let i = 0;
    const n = Math.min(reconstructed.length, text.length);
    while (i < n && reconstructed[i] === text[i]) i++;
    byteFidelity.firstDivergence = i;
  }

  // Defensive dedup — two blocks producing the same slug collide on one id.
  const seenIds = new Map();
  for (const q of queue) {
    const n = (seenIds.get(q.id) || 0) + 1;
    seenIds.set(q.id, n);
    if (n > 1) q.id = `${q.id}-${n}`;
  }

  return { queue, byteFidelity, blocksFound: Object.keys(blocks).length };
}

// ═══════════════════════════════════════════════════════════════════════
//  STRUCTURAL PROFILE — real counts, not size, per chunk
// ═══════════════════════════════════════════════════════════════════════

// §DIALECT-SPECIFIC — tuned to causal-nexus.spec's actual conventions.
// Verified against real measured output this session: kernel (6642 chars)
// scored deps=4/hookEvents=4/failureModes=3/invariantRefs=8 (total 19);
// enforcement (3307 chars — half the size) scored deps=1/hookEvents=2/
// failureModes=1/invariantRefs=12 (total 16) — proving size doesn't
// predict this. A different spec dialect needs different patterns; these
// are not claimed universal, and callers should pass their own via opts
// if their document doesn't use `- module_id:` / `invariant_refs: [...]`
// conventions.
function structuralProfile(chunkText, opts = {}) {
  const patterns = opts.patterns || {
    deps:          /- module_id:/g,
    hookEvents:    /- event:/g,
    failureModes:  /- id: FAIL-/g,
  };
  const count = (re) => (chunkText.match(re) || []).length;

  const invMatch = chunkText.match(/invariant_refs:\s*\[([^\]]*)\]/);
  const invariantRefs = invMatch && invMatch[1].trim() ? invMatch[1].split(',').length : 0;

  const deps = count(patterns.deps);
  const hookEvents = count(patterns.hookEvents);
  const failureModes = count(patterns.failureModes);

  return {
    chars: chunkText.length,
    structure: { deps, hookEvents, failureModes },
    constraints: { invariantRefs },
    // Deliberately NOT collapsed into one scalar — "complexity is a shape,
    // not a scalar" (this session's own finding, kernel vs enforcement).
    // structuralTotal is provided as a cheap sort key only, not an
    // authoritative score — see cognition below for why a raw sum
    // conflates cheap mentions (a dep name) with expensive ones (a full
    // invariant statement).
    structuralTotal: deps + hookEvents + failureModes + invariantRefs,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  LOOM PROJECTION — chunk -> component/hook declarations
// ═══════════════════════════════════════════════════════════════════════

/**
 * toLoomDeclarations(chunk, specMeta) -> { component, hooks }
 *
 * Projects a chunk into the shape loom/schema/definitions.js's
 * COMPONENT_SCHEMA and HOOK_SCHEMA expect, so a chunked spec's own
 * comp_id/seam_id addressing (idearium/spec-engine's convention) can
 * actually be registered as real loom components/hooks instead of only
 * existing as chunk metadata nothing else can see. Does not itself write
 * to loom/data/registry.json — caller passes these through loom's real
 * gates (loom/schema/gates.js) same as any other declaration, so
 * validation/collision rules stay in one place.
 */
function toLoomDeclarations(chunk, specMeta = {}) {
  const componentId = `${specMeta.namespace || 'spec'}.${slug(chunk.sourceBlock || chunk.id)}`;
  return {
    component: {
      id: componentId,
      namespace: specMeta.namespace || 'spec',
      name: chunk.title || chunk.id,
      version: specMeta.version || '1.0.0',
    },
    hooks: [{
      id: `${componentId}.${slug(chunk.id)}`,
      component_id: componentId,
      name: chunk.title || chunk.id,
      type: 'direct',
      direction: 'in',
    }],
  };
}

module.exports = {
  chunkDocument,
  structuralProfile,
  toLoomDeclarations,
  detectSubBoundaries,
  slug,
  SPLIT_THRESHOLD_CHARS,
};
