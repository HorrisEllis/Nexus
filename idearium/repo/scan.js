/**
 * idearium/repo/scan.js — the repository intelligence scan.
 * UUID: nexus-idearium-repo-scan-v1-0000-2026-0920-jamesbrooks-001
 *
 * §SCAN 2026-09-20 — James: "Another tab for the repo, intelligence
 * system scan for gaps, tension, dangling hooks."
 *
 * §WHAT THIS IS NOT. This module computes NOTHING of its own about the
 * code. It reads three artifacts the import pipeline already produced —
 * graph.json (repo/graph.js), verification.json (import-pipeline.js),
 * verification-lazy.json (repo/verify-lazy.js) — and reports what is
 * already true in them. Every number below traces to a real edge, a real
 * tier result, or a real file entry. There is no heuristic "code smell"
 * scoring here and no language model in the path: if an artifact is
 * missing, the corresponding section says so and reports nothing, rather
 * than degrading into a guess.
 *
 * The three axes, and exactly what each one is:
 *
 *   DANGLING HOOKS — graph edges with resolution:'unresolved'. graph.js
 *   already refuses to drop an import it cannot resolve (see its own
 *   "THE RULE" comment), so these are sitting in graph.json waiting to
 *   be asked for. The one judgement this module DOES make is severity,
 *   and it makes it on a structural fact rather than a feeling: an
 *   unresolved specifier beginning with '.' or '/' names a path inside
 *   this repo that is not there — genuinely broken. A bare specifier
 *   ('express') names a package outside the repo, which an intra-repo
 *   graph cannot resolve BY DESIGN and which is not a defect. Those two
 *   are counted separately and never summed into one scary number.
 *
 *   GAPS — verification tiers that did not pass, plus files present in
 *   the graph that no chunk covers. Both are absences the pipeline
 *   itself recorded; this module locates them, it does not judge them.
 *
 *   TENSION — fan-in/fan-out concentration over RESOLVED depends_on
 *   edges. A file that many files depend on is a structural stress
 *   point: changing it moves everything downstream. This is reported as
 *   a ranked list of real degree counts with the threshold stated, not
 *   as a 0-100 "health score" that would imply a precision this data
 *   does not have.
 */

import fs from 'fs';
import path from 'path';
import { readGraph } from './graph.js';
import { readLazyVerification } from './verify-lazy.js';

// §ENVELOPE 2026-09-20 — `ok` here means "the scan ran", NOT "the repo is
// clean" and NOT "the repo is indexed". idearium's own ui/js/app.js api()
// helper throws whenever a response body carries ok:false, so returning
// ok:false for the perfectly ordinary "this repo has never been indexed"
// state made the UI's own empty-state branch unreachable — it always fell
// into the catch and showed an error for a non-error. Caught by
// idearium/test/repo-scan.test.js. Whether a scan was possible is
// `scanned`, a payload field; `ok` stays transport-level, as everywhere
// else in this API.
export const MODULE_ID = 'nexus-idearium-repo-scan-v1-0000-2026-0920-jamesbrooks-001';
export const SCAN_VERSION = '1.0.0';

// Unresolved reasons that are NOT defects. Each is a case where the
// graph deliberately records an edge it cannot resolve, for a reason
// that is correct behaviour rather than a broken link.
//   dynamic        — require(expr) / import(expr); not statically knowable, ever.
//   system-header  — a C/C++ <stdio.h>-style include; outside the repo by definition.
const BENIGN_REASONS = new Set(['dynamic', 'system-header']);

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

/** A specifier that names a path inside this repo rather than a package. */
function isIntraRepoSpecifier(spec) {
  if (typeof spec !== 'string' || !spec) return false;
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/') || spec === '.' || spec === '..';
}

/** 'file:src/a.js' -> 'src/a.js'; anything else returned unchanged. */
function fileOf(nodeIdStr) {
  if (typeof nodeIdStr !== 'string') return null;
  return nodeIdStr.startsWith('file:') ? nodeIdStr.slice(5) : nodeIdStr;
}

/**
 * scanDangling(graph) — every unresolved edge, bucketed by what it
 * actually means. Returns counts plus a bounded sample of each bucket
 * (the full set can be thousands of edges on a real repo; the caller
 * gets the count truthfully and a sample to act on).
 */
export function scanDangling(graph, { sampleSize = 50 } = {}) {
  const edges = (graph && graph.edges) || [];
  const broken = [];   // intra-repo path that does not exist — real breakage
  const external = []; // outside the repo — expected, informational
  const parseFailed = [];
  const chunkGap = []; // symbol outside every chunk range
  const other = [];
  const byReason = Object.create(null);

  for (const e of edges) {
    if (e.resolution !== 'unresolved') continue;
    const reason = e.reason || 'unspecified';
    // Reasons are open-ended by design (graph.js emits templated ones
    // such as `upstream-language-undetected:.rs` and `unreadable: EACCES`),
    // so bucket on the stable prefix, never on an exact-match allowlist
    // that a new reason string would silently fall out of.
    const head = String(reason).split(':')[0].trim();
    byReason[head] = (byReason[head] || 0) + 1;

    const item = {
      from: fileOf(e.from),
      target: e.target || null,
      relation: e.relation,
      reason,
      line: e.line != null ? e.line : null,
    };

    if (BENIGN_REASONS.has(head)) { external.push(item); continue; }
    if (head === 'parse-failed' || head === 'unreadable') { parseFailed.push(item); continue; }
    if (head === 'symbol-outside-every-chunk-range') { chunkGap.push(item); continue; }
    if (head === 'external-or-unresolved') {
      (isIntraRepoSpecifier(e.target) ? broken : external).push(item);
      continue;
    }
    other.push(item);
  }

  return {
    // The headline number is deliberately ONLY the genuinely broken
    // links. Summing externals into it would make a healthy repo with
    // 200 npm imports look catastrophic.
    brokenCount: broken.length,
    broken: broken.slice(0, sampleSize),
    brokenTruncated: broken.length > sampleSize,

    parseFailedCount: parseFailed.length,
    parseFailed: parseFailed.slice(0, sampleSize),

    chunkGapCount: chunkGap.length,
    chunkGap: chunkGap.slice(0, sampleSize),

    externalCount: external.length,
    external: external.slice(0, sampleSize),

    otherCount: other.length,
    other: other.slice(0, sampleSize),

    byReason,
    totalUnresolved: broken.length + external.length + parseFailed.length + chunkGap.length + other.length,
  };
}

/**
 * scanGaps(verification, lazy, graph) — absences the pipeline recorded.
 * verification.json's exact tier shape has varied across pipeline
 * versions, so this reads defensively and reports what it actually
 * found rather than asserting a shape.
 */
export function scanGaps(verification, lazy, graph) {
  const failedTiers = [];
  const pendingTiers = [];

  // Tier results may appear as an array or as an object keyed by level.
  const rawTiers = verification
    ? (Array.isArray(verification.tiers) ? verification.tiers
      : (verification.tiers && typeof verification.tiers === 'object') ? Object.entries(verification.tiers).map(([k, v]) => ({ level: k, ...(v && typeof v === 'object' ? v : { status: v }) }))
      : [])
    : [];

  for (const t of rawTiers) {
    const status = String(t.status || t.result || (t.passed === true ? 'passed' : t.passed === false ? 'failed' : 'unknown')).toLowerCase();
    // A tier carries its specifics in any of several fields depending on
    // which tier it is (L2/L4/L5 use a `failures` array; others use a
    // scalar detail/error/reason). Surface whichever is actually there —
    // dropping `failures` was throwing away the only part of a failed
    // tier that tells you WHERE it failed.
    const failures = Array.isArray(t.failures) ? t.failures : null;
    const entry = {
      level: t.level ?? t.id ?? t.name ?? 'unknown',
      name: t.name || null,
      status,
      detail: t.detail || t.error || t.reason || null,
      failures: failures && failures.length ? failures.slice(0, 20) : null,
      failureCount: failures ? failures.length : null,
    };
    if (status === 'failed' || status === 'error' || status === 'partial') failedTiers.push(entry);
    else if (status === 'pending' || status === 'unknown') pendingTiers.push(entry);
  }

  // Lazy (L6-L8) states its own status; it is a separate artifact and
  // may legitimately still be 'pending' when this runs.
  const lazyStatus = lazy ? String(lazy.status || 'unknown').toLowerCase() : null;
  if (lazyStatus && ['failed', 'error', 'partial'].includes(lazyStatus)) {
    failedTiers.push({ level: 'L6-L8 (lazy)', status: lazyStatus, detail: lazy.error || null });
  } else if (lazyStatus === 'pending') {
    pendingTiers.push({ level: 'L6-L8 (lazy)', status: 'pending', detail: 'async verification has not finished' });
  }

  // Files in the graph that no chunk contains. graph.js emits
  // 'contains' edges from file -> chunk via 'chunk-index'; a file node
  // with no such outgoing edge was never chunked.
  const uncovered = [];
  if (graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)) {
    const chunked = new Set();
    for (const e of graph.edges) {
      if (e.relation === 'contains' && e.via === 'chunk-index' && e.from) chunked.add(e.from);
    }
    for (const n of graph.nodes) {
      if (n.kind !== 'file') continue;
      if (!chunked.has(n.id)) uncovered.push(n.file || fileOf(n.id));
    }
  }

  return {
    failedTiers,
    pendingTiers,
    uncoveredFileCount: uncovered.length,
    uncoveredFiles: uncovered.slice(0, 50),
    uncoveredTruncated: uncovered.length > 50,
    verificationPresent: !!verification,
    lazyStatus,
  };
}

/**
 * scanTension(graph, opts) — fan-in / fan-out concentration over
 * RESOLVED depends_on edges only. Unresolved edges are excluded on
 * purpose: an edge with to:null has no destination to concentrate on,
 * and counting it would inflate out-degree with non-dependencies.
 *
 * The threshold is stated in the output so the number is interpretable.
 * Default: degree >= max(minDegree, mean + 2 standard deviations) —
 * a real outlier test, not an arbitrary "more than 10 is bad".
 */
export function scanTension(graph, { minDegree = 5, top = 20 } = {}) {
  const edges = (graph && graph.edges) || [];
  const inDeg = new Map();
  const outDeg = new Map();
  let considered = 0;

  for (const e of edges) {
    if (e.relation !== 'depends_on') continue;
    if (e.resolution === 'unresolved' || !e.to) continue;
    if (e.via === 'inverse') continue; // inverse edges would double-count every dependency
    considered++;
    const from = fileOf(e.from), to = fileOf(e.to);
    if (from) outDeg.set(from, (outDeg.get(from) || 0) + 1);
    if (to) inDeg.set(to, (inDeg.get(to) || 0) + 1);
  }

  const outlierCut = (map) => {
    const vals = [...map.values()];
    if (!vals.length) return minDegree;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return Math.max(minDegree, Math.ceil(mean + 2 * Math.sqrt(variance)));
  };

  const inCut = outlierCut(inDeg);
  const outCut = outlierCut(outDeg);

  const rank = (map, cut) => [...map.entries()]
    .filter(([, d]) => d >= cut)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([file, degree]) => ({ file, degree }));

  return {
    // "Many things depend on this" — changing it ripples outward.
    highFanIn: rank(inDeg, inCut),
    fanInThreshold: inCut,
    // "This depends on many things" — it is hard to move or test alone.
    highFanOut: rank(outDeg, outCut),
    fanOutThreshold: outCut,
    dependencyEdgesConsidered: considered,
    note: 'thresholds are mean + 2σ over real resolved depends_on degrees (floor 5); inverse edges excluded to avoid double-counting',
  };
}

/**
 * scanRepo(repoDir) — the whole scan. Returns { ok, ... } always;
 * a missing artifact is reported as missing, never faked.
 */
export function scanRepo(repoDir) {
  if (!repoDir || !fs.existsSync(repoDir)) {
    return { ok: true, scanned: false, reason: `repo directory does not exist: ${repoDir}`, scanVersion: SCAN_VERSION };
  }
  // §REUSE, NOT REIMPLEMENT — and this is not a style preference, it is
  // a correctness requirement found by testing. writeGraph() deliberately
  // does NOT persist chunk/symbol nodes or their 'contains' edges
  // (DERIVED_ELSEWHERE): they are rehydrated by readGraph() from
  // indexes/ + chunks/index.json. An earlier version of this file read
  // graph.json directly with JSON.parse and therefore saw ZERO chunk
  // containment, which made scanGaps() report every single file as
  // "covered by no chunk" on a repo the pipeline had chunked correctly
  // (83 chunks). Raw-reading that artifact is wrong; readGraph is the
  // one true loader, the same one repo.graph.traverse/cone already use.
  let graph = null;
  try { graph = readGraph(repoDir); }
  catch (e) { return { ok: true, scanned: false, reason: `graph read failed: ${e.message}`, scanVersion: SCAN_VERSION }; }

  const verification = readJson(path.join(repoDir, 'verification.json'));
  // Likewise: the lazy artifact is verification.lazy.json, NOT
  // verification-lazy.json. Going through verify-lazy.js's own reader
  // means this file cannot drift from that filename again.
  let lazy = null;
  try { lazy = readLazyVerification(repoDir); } catch { lazy = null; }

  if (!graph) {
    return {
      ok: true,
      scanned: false,
      reason: 'this repo has not been through the import pipeline yet, so there is no index to scan',
      remedy: 'reindex',
      scanVersion: SCAN_VERSION,
    };
  }

  const dangling = scanDangling(graph);
  const gaps = scanGaps(verification, lazy, graph);
  const tension = scanTension(graph);

  return {
    ok: true,
    scanned: true,
    scanVersion: SCAN_VERSION,
    scannedAt: Date.now(),
    graphVersion: graph.graph_version || graph.graphVersion || null,
    fileCount: Array.isArray(graph.nodes) ? graph.nodes.filter(n => n.kind === 'file').length : null,
    edgeCount: Array.isArray(graph.edges) ? graph.edges.length : null,
    dangling,
    gaps,
    tension,
    // One line the UI can show without re-deriving anything. Counts only;
    // deliberately no composite score.
    headline: {
      brokenLinks: dangling.brokenCount,
      parseFailures: dangling.parseFailedCount,
      failedTiers: gaps.failedTiers.length,
      uncoveredFiles: gaps.uncoveredFileCount,
      stressPoints: tension.highFanIn.length,
    },
  };
}

export default { scanRepo, scanDangling, scanGaps, scanTension, MODULE_ID, SCAN_VERSION };
