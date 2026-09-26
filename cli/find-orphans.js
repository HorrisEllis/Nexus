#!/usr/bin/env node
'use strict';
/**
 * cli/find-orphans.js — dead-code / orphan / stub finder
 * UUID: nexus-cli-find-orphans-v1-0000-2026-0912-jamesbrooks-001
 *
 * James: "make any other tools that reduce tokens from your end. find
 * stubs, orphaned code, dead code."
 *
 * Real problem this solves: every "is this file safe to delete/move"
 * question this whole session (codefactory/, root siso/, cos/manager.js,
 * cli/nexus-cli.js) was a fresh, manual grep -rln "require(...)" dance,
 * repeated from scratch each time — and once, that manual process
 * missed a real ESM `import` statement (idearium/index.js's import of
 * ../siso/core/index.js), which shipped a real production regression.
 * This tool checks BOTH require() and import syntax by construction, so
 * that specific mistake can't repeat by omission.
 *
 * Reports three real categories, not blended together:
 *   ORPHANED — zero real requirers/importers anywhere in the tree.
 *     Real candidate for archive/delete, but still needs the SAME
 *     verify-before-touch discipline this session used throughout
 *     (check package.json scripts, dynamic requires, spawned-as-a-
 *     process usage — this tool finds STATIC require/import references
 *     only, and says so, rather than claiming more certainty than it has).
 *   STUB — small, and its content matches real stub markers (TODO, FIXME,
 *     "not implemented", a function body that's just a comment, or a
 *     file under STUB_LINE_THRESHOLD lines that does almost nothing).
 *     Reported even if it has real requirers — a stub with callers is a
 *     real gap, not dead code, and shouldn't be silently lumped in with
 *     orphans.
 *   Both categories can apply to the same file.
 *
 * Usage:
 *   node cli/find-orphans.js                    # whole tree
 *   node cli/find-orphans.js cortex              # scoped to one top-level dir
 *   node cli/find-orphans.js --json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '_archive', 'coverage']);
const STUB_LINE_THRESHOLD = 15;
const STUB_MARKERS = /\bTODO\b|\bFIXME\b|not implemented|not yet implemented|stub only|placeholder only/i;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const scope = args.find(a => !a.startsWith('--'));

function listJsFiles(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listJsFiles(full, out);
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// A file's own require()/import targets, resolved to real paths on disk
// (relative requires only — bare package specifiers like 'express' are
// never orphan candidates and are skipped).
const REQUIRE_RE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const IMPORT_RE = /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"](\.[^'"]+)['"]/g;

function resolveRequireTarget(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function isTestFile(rel) {
  return /(^|\/)(test|tests)\//.test(rel) || /\.test\.js$/.test(rel) || /^test-/.test(path.basename(rel));
}

function loadPackageJsonRefs() {
  const refs = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const text = JSON.stringify({ main: pkg.main, bin: pkg.bin, scripts: pkg.scripts });
    for (const f of listJsFiles(ROOT)) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (text.includes(rel)) refs.add(f);
    }
  } catch (_) {}
  return refs;
}

function loadHtmlScriptRefs() {
  const refs = new Set();
  const htmlFiles = [];
  (function walkHtml(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkHtml(full);
      else if (e.name.endsWith('.html')) htmlFiles.push(full);
    }
  })(ROOT);
  const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"']+\.js)["']/g;
  for (const h of htmlFiles) {
    let src;
    try { src = fs.readFileSync(h, 'utf8'); } catch (_) { continue; }
    let m;
    SCRIPT_SRC_RE.lastIndex = 0;
    while ((m = SCRIPT_SRC_RE.exec(src))) {
      const target = path.resolve(path.dirname(h), m[1]);
      if (fs.existsSync(target)) refs.add(target);
    }
  }
  return refs;
}

function hasShebang(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);
    return buf.toString('utf8').startsWith('#!');
  } catch (_) { return false; }
}

function loadAutopilotKernelRefs() {
  const refs = new Set();
  try {
    const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
    for (const f of listJsFiles(ROOT)) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (src.includes(`'${rel}'`) || src.includes(`"${rel}"`)) refs.add(f);
    }
  } catch (_) {}
  return refs;
}

function run() {
  const startDir = scope ? path.join(ROOT, scope) : ROOT;
  if (!fs.existsSync(startDir)) {
    console.error(`[find-orphans] no such directory: ${scope}`);
    process.exit(1);
  }

  // §FIXED 2026-09-12 — scoping used to scan ONLY the requested
  // subdirectory for requirers too, so a real external requirer outside
  // the scope (e.g. orchestrator/orchestrator.js requiring cortex/core/
  // raid/officiator.js) was invisible, falsely flagging real, live files
  // as orphaned. The requiredBy map is now always built from the WHOLE
  // tree; only which files get REPORTED is scoped.
  const allFiles = listJsFiles(ROOT);
  const reportFiles = scope ? listJsFiles(startDir) : allFiles;
  const requiredBy = new Map(); // absolute file path -> Set of files that require/import it
  const pkgRefs = loadPackageJsonRefs();
  const htmlRefs = loadHtmlScriptRefs();
  const kernelRefs = loadAutopilotKernelRefs();

  for (const f of allFiles) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    let m;
    REQUIRE_RE.lastIndex = 0;
    while ((m = REQUIRE_RE.exec(src))) {
      const target = resolveRequireTarget(f, m[1]);
      if (target) { if (!requiredBy.has(target)) requiredBy.set(target, new Set()); requiredBy.get(target).add(f); }
    }
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(src))) {
      const target = resolveRequireTarget(f, m[1]);
      if (target) { if (!requiredBy.has(target)) requiredBy.set(target, new Set()); requiredBy.get(target).add(f); }
    }
  }

  const orphaned = [];
  const excludedTests = [];
  const excludedEntryPoints = [];
  const stubs = [];

  for (const f of reportFiles) {
    const rel = path.relative(ROOT, f);
    const requirers = requiredBy.get(f);
    const hasStaticRequirer = requirers && requirers.size > 0;

    if (!hasStaticRequirer) {
      if (isTestFile(rel)) { excludedTests.push(rel); }
      else if (pkgRefs.has(f) || htmlRefs.has(f) || kernelRefs.has(f) || hasShebang(f)) { excludedEntryPoints.push(rel); }
      else { orphaned.push(rel); }
    }

    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const lines = src.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
    const isSmall = lines.length > 0 && lines.length <= STUB_LINE_THRESHOLD;
    const hasMarker = STUB_MARKERS.test(src);
    if (hasMarker || isSmall) {
      stubs.push({ file: rel, realLines: lines.length, marker: hasMarker, hasRequirers: !!(requirers && requirers.size) });
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ orphaned, excludedTests, excludedEntryPoints, stubs }, null, 2));
    return;
  }

  console.log(`[find-orphans] scanned ${reportFiles.length} .js file(s) under ${scope || '.'} (checked against ${allFiles.length} total for real cross-tree requirers)\n`);
  console.log('Static analysis only — checks require() and import targets that resolve');
  console.log('to a real file on disk. Does NOT catch: dynamic require(variable) or');
  console.log('requires built from a template string. Test files (run by filename list,');
  console.log(`not require()) and real package.json/HTML entry points are excluded below`);
  console.log('(reported separately, not silently dropped) — verify anything else here');
  console.log('the same way this session checked every real deletion.\n');

  console.log(`ORPHANED — zero static requirers, not a known test/entry point (${orphaned.length}):`);
  for (const f of orphaned.sort()) console.log(`  ${f}`);

  console.log(`\nExcluded as test files (${excludedTests.length}) — not orphaned, discovered by filename list:`);
  console.log(`  (run with --json to see the full list)`);

  console.log(`\nExcluded as real entry points (${excludedEntryPoints.length}) — referenced in package.json or an HTML <script> tag:`);
  for (const f of excludedEntryPoints.sort()) console.log(`  ${f}`);

  console.log(`\nSTUB CANDIDATES — small and/or marked incomplete (${stubs.length}):`);
  for (const s of stubs.sort((a, b) => a.realLines - b.realLines)) {
    console.log(`  ${s.file} — ${s.realLines} real line(s)${s.marker ? ', has TODO/FIXME/stub marker' : ''}${s.hasRequirers ? ' [has real requirers — a real gap, not dead code]' : ''}`);
  }
}

run();
