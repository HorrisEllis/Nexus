'use strict';
/**
 * loom/scanners/closed-door.js — real "built but never wired" detector
 * UUID: nexus-loom-scanner-closed-door-v1-0000-2026-0714-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-14 — "a roadmap that loom automatically builds from."
 * This session found the same shape of gap by hand, repeatedly: a real,
 * substantial, tested file with zero real callers anywhere else in the
 * tree — RFR2's delta engine, the ledger viewer, meta/causal-nexus's 16
 * unused modules, lib/loop-topology.js, cos/foundation/file-browser.js.
 * Every one of those was found by the same manual process: grep a file's
 * basename against the rest of the tree, count real hits, decide by hand.
 * This is that process, made real and repeatable, declaring what it finds
 * as real LOOM concerns instead of a paragraph in a chat response that's
 * gone once the conversation ends.
 *
 * §HONEST SCOPE — this is require()/import string matching, the same
 * method used by hand all session, not real static analysis. It has the
 * same real failure modes already found and corrected by hand along the
 * way:
 *   - ESM `import {x} from './y.js'` and CJS `require('./y.js')` are both
 *     matched (checked directly against real false positives from earlier
 *     this session — idearium's own ESM imports were missed by a first,
 *     CJS-only pass and had to be corrected).
 *   - Files delivered by a mechanism other than require/import at all
 *     (guardian's userscripts, read as raw bytes and injected into a
 *     browser tab) will show as false positives. Known, not silently
 *     ignored — see EXCLUDE_PATTERNS below, extended each time a real
 *     one is found, same as this session's own manual sweeps had to.
 *   - A file only ever invoked via a CLI entry point (node somefile.js)
 *     rather than required by another module is a real false positive
 *     too — not detectable by this method at all. Flagged in the return
 *     shape's `caveat` field, not hidden.
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'loom.scanner.closed-door';

// Directories confirmed to hold real, requireable NEXUS source — not an
// exhaustive tree walk (would pull in data/, node_modules-equivalents,
// generated output) but the real, named systems this session actually
// worked in. Extend this list the same way EXCLUDE_PATTERNS gets
// extended — when a real system is found missing from it.
const DEFAULT_SCAN_DIRS = [
  'cortex', 'cos', 'warp', 'guardian', 'idearium', 'copilot', 'bridge',
  'orchestrator', 'hooks', 'lib', 'meta', 'loom', 'emerge', 'ollama',
  'service', 'clear-glass/src', 'nexus-healer',
];

// Files known, by hand, this session, to be real despite zero require()
// hits — delivered a different way, or are themselves entry points.
// Extended here rather than silently re-flagging the same false
// positives every scan.
const EXCLUDE_PATTERNS = [
  /userscript-.*\.js$/,        // delivered to a browser tab, read as raw bytes
  /\.test\.js$/,                // entry points, run directly, never required
  /\/test\//,                   // test files generally, same reasoning
  /\/tests\//,
];

function _listJsFiles(rootDir, dirs) {
  const out = [];
  for (const d of dirs) {
    const full = path.join(rootDir, d);
    if (!fs.existsSync(full)) continue;
    _walk(full, out);
  }
  return out;
}

function _walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { _walk(full, out); continue; }
    if (e.isFile() && /\.(js|cjs)$/.test(e.name)) out.push(full);
  }
}

function _isExcluded(filePath) {
  return EXCLUDE_PATTERNS.some(re => re.test(filePath));
}

/**
 * scan({ rootDir, dirs, minLines, declare }) — the real entry point.
 *
 * declare — a real function(kind, payload) -> {ok, ...}, same shape as
 * LoomDriver.declare. Passed in rather than required directly, so this
 * scanner stays testable without a live LOOM instance and doesn't assume
 * one particular way of reaching the registry.
 *
 * Returns { scanned, flagged: [...concern payloads], declared: [...ids],
 *           errors: [...], caveat }.
 */
function scan({ rootDir, dirs = DEFAULT_SCAN_DIRS, minLines = 80, declare = null } = {}) {
  if (!rootDir) throw new Error('[closed-door scanner] rootDir is required');

  const allFiles = _listJsFiles(rootDir, dirs);
  const candidates = allFiles.filter(f => !_isExcluded(f));

  // Build a real basename -> full-path index, and a real corpus of every
  // file's content, once — O(n) reads instead of grep-per-candidate
  // against the whole tree repeated N times.
  const corpus = new Map(); // filePath -> content
  for (const f of allFiles) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      if (content.split('\n').length >= 1) corpus.set(f, content);
    } catch (_) { /* unreadable file — skip, not fatal to the whole scan */ }
  }

  const flagged = [];
  const declared = [];
  const errors = [];

  for (const file of candidates) {
    const content = corpus.get(file);
    if (!content) continue;
    const lineCount = content.split('\n').length;
    if (lineCount < minLines) continue; // real capability threshold, not a stub-sized file

    // §FIXED before first run, not after a wrong result — caught by
    // checking real Node module resolution before trusting this: a file
    // named index.js is required by its PARENT DIRECTORY's name
    // (require('../causality') resolves to causality/index.js), never by
    // the literal string "index". Matching on the literal basename here
    // would have silently missed exactly the closed doors already
    // confirmed by hand this session — meta/causal-nexus's 16 unused
    // modules are all index.js.
    const base = path.basename(file, path.extname(file));
    const searchTerm = base === 'index' ? path.basename(path.dirname(file)) : base;
    const relPath = path.relative(rootDir, file);
    // Real match: the file's own basename appearing inside a require()/
    // import string anywhere else in the corpus. Checked against every
    // OTHER file's content, not itself.
    let consumers = 0;
    for (const [otherFile, otherContent] of corpus) {
      if (otherFile === file) continue;
      const reReq  = new RegExp(`require\\([^)]*['"\`][^'"\`]*${_escapeRe(searchTerm)}(\\.js)?['"\`]`);
      const reImp  = new RegExp(`from\\s+['"\`][^'"\`]*${_escapeRe(searchTerm)}(\\.js)?['"\`]`);
      if (reReq.test(otherContent) || reImp.test(otherContent)) { consumers++; break; }
    }

    if (consumers === 0) {
      const concern = {
        id: `concern-closed-door-${_slug(relPath)}`,
        kind: 'closed-door',
        title: `${relPath} — ${lineCount} real lines, zero external consumers found`,
        severity: lineCount > 300 ? 'high' : lineCount > 150 ? 'medium' : 'low',
        source: MODULE_ID,
        relatesTo: [],
        detail: { file: relPath, lineCount, scannedAt: Date.now() },
      };
      flagged.push(concern);

      if (typeof declare === 'function') {
        try {
          const r = declare('concern', concern);
          if (r?.ok) declared.push(concern.id);
          else errors.push({ file: relPath, error: r?.reason || 'declare rejected' });
        } catch (e) {
          errors.push({ file: relPath, error: e.message });
        }
      }
    }
  }

  return {
    scanned: candidates.length,
    flagged,
    declared,
    errors,
    caveat: 'require()/import string matching only, single-hop — a file only ever invoked as a CLI entry point, delivered by a non-require mechanism, or required only by another file that is ITSELF never required by anything live (confirmed by testing: meta/causal-nexus/modules/causality is re-exported by modules/index.js, which has zero outside consumers of its own — single-hop detection reports causality as "consumed" and misses it) will under- or over-report. Confirmed by hand before acting on any single result, same as every closed door found this session.',
  };
}

function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function _slug(s) { return s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase(); }

module.exports = { scan, DEFAULT_SCAN_DIRS, EXCLUDE_PATTERNS };
