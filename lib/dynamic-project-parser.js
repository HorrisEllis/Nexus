'use strict';
/**
 * lib/dynamic-project-parser.js — general-purpose project zip -> project map
 * UUID: nexus-dynamic-project-parser-v1-0000-2026-0903-001
 *
 * §WHY "DYNAMIC" — lib/project-compartment.js and the repo.import-archive
 * route (idearium/api/index.js) both decide text-vs-binary from a FIXED
 * extension allowlist (TEXT_EXT). That's fine for a known, narrow project
 * shape, wrong for "any project zip a person drops on this system" — a
 * real project can have .rs, .go, .toml, .lock, .cfg, .env.example, or no
 * extension at all (Dockerfile, Makefile, LICENSE) and every one of those
 * is real, readable, relevant text. This module decides text-vs-binary by
 * actually sniffing the bytes (null-byte + non-printable ratio in the
 * first 4KB — same heuristic `file`/git/most editors use), not a list
 * that has to be maintained by hand for every stack that shows up.
 *
 * Reuses, does not reimplement:
 *   - MAX_FILES / MAX_BYTES_PER_FILE / MAX_TOTAL_BYTES from
 *     lib/project-compartment.js — same real, reasoned bounds.
 *   - lib/spec-from-markdown.js for any .spec/.md found inside the zip —
 *     a project that ships its own spec should have it parsed, not just
 *     listed as an opaque text file.
 *
 * §TESTED — run directly against all four zips uploaded 2026-09-03
 * (nexus-merged-1.zip, files.zip, BrainOS-main.zip, nexus.zip) before
 * this header was written. See conversation record for output; not
 * re-pasted here — a comment claiming numbers is not the same as the
 * numbers being real, so they're not duplicated into a comment that could
 * drift from the actual code.
 */

const fs   = require('fs');
const path = require('path');
const { MAX_FILES, MAX_BYTES_PER_FILE, MAX_TOTAL_BYTES } = require('./project-compartment.js');

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'build', '__pycache__', '.next', 'vendor', 'target']);

// Manifest files that identify a stack. Order matters only for the
// "primary stack" pick when a project has more than one (a JS+Python
// monorepo, say) — first match wins for `primaryStack`, all matches are
// still returned in `stacks[]`.
const MANIFESTS = [
  { file: 'package.json',      stack: 'node' },
  { file: 'pyproject.toml',    stack: 'python' },
  { file: 'requirements.txt',  stack: 'python' },
  { file: 'Cargo.toml',        stack: 'rust' },
  { file: 'go.mod',            stack: 'go' },
  { file: 'composer.json',     stack: 'php' },
  { file: 'pom.xml',           stack: 'java-maven' },
  { file: 'build.gradle',      stack: 'java-gradle' },
  { file: 'Gemfile',           stack: 'ruby' },
  { file: '.spec',             stack: 'nexus-spec-project', matchExt: true },
];

/**
 * _looksLikeText(buf) — real byte-sniff, not an extension guess.
 * Same convention `file(1)` and git's own binary-detection use: a null
 * byte anywhere in the sample, or a high ratio of non-printable bytes,
 * means binary. Checked against real files of both kinds before writing
 * this (a .png and a .js from BrainOS-main.zip) to confirm the ratio
 * chosen (30%) doesn't misclassify either.
 */
function _looksLikeText(buf) {
  if (!buf.length) return true; // empty file — nothing to misclassify
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false; // null byte — binary, no exceptions
    if (b < 9 || (b > 13 && b < 32)) nonPrintable++;
  }
  return (nonPrintable / sample.length) < 0.3;
}

function _detectStacks(entryNames) {
  const found = [];
  for (const m of MANIFESTS) {
    const hit = m.matchExt
      ? entryNames.find(e => e.toLowerCase().endsWith(m.file))
      : entryNames.find(e => path.basename(e) === m.file);
    if (hit) found.push({ stack: m.stack, manifest: hit });
  }
  return found;
}

/**
 * parseProjectZip(zipPath, opts) — main entry.
 * Returns: {
 *   name, fileCount, totalEntries,
 *   stacks: [{stack, manifest}], primaryStack,
 *   specs: [{ path, meta, chunkCount, wasCanonical }],  // any .spec/.md found
 *   files: { relPath: {bytes, content, truncated} },     // bounded, real content
 *   omitted: [{path, why}],
 * }
 */
function parseProjectZip(zipPath, opts = {}) {
  if (!fs.existsSync(zipPath)) return { ok: false, reason: `no such file: ${zipPath}` };

  const AdmZip = require('adm-zip');
  let zip;
  try { zip = new AdmZip(zipPath); }
  catch (e) { return { ok: false, reason: `could not read zip: ${e.message}` }; }

  const allEntries = zip.getEntries().filter(e => !e.isDirectory);
  const entryNames = allEntries.map(e => e.entryName);

  const maxFiles          = opts.maxFiles || MAX_FILES;
  const maxBytesPerFile   = opts.maxBytesPerFile || MAX_BYTES_PER_FILE;
  const maxTotalBytes     = opts.maxTotalBytes || MAX_TOTAL_BYTES;

  const stacks = _detectStacks(entryNames);

  const files = {};
  const specs = [];
  const omitted = [];
  let totalBytes = 0;
  let included = 0;

  const { parseMarkdownToSpec } = require('./spec-from-markdown.js');

  for (const entry of allEntries) {
    const rel = entry.entryName;
    const topDir = rel.split('/')[0];
    if (SKIP_DIRS.has(topDir) || rel.split('/').some(seg => SKIP_DIRS.has(seg))) {
      omitted.push({ path: rel, why: 'skipped dir (node_modules/.git/build/etc.)' });
      continue;
    }
    if (included >= maxFiles) { omitted.push({ path: rel, why: 'maxFiles reached' }); continue; }
    if (totalBytes >= maxTotalBytes) { omitted.push({ path: rel, why: 'maxTotalBytes reached' }); continue; }

    let buf;
    try { buf = entry.getData(); }
    catch (e) { omitted.push({ path: rel, why: `read failed: ${e.message}` }); continue; }

    if (!_looksLikeText(buf)) {
      omitted.push({ path: rel, why: `binary (byte-sniffed, ${buf.length}b)` });
      continue;
    }

    const text = buf.toString('utf8');
    const truncated = text.length > maxBytesPerFile;
    const slice = truncated ? text.slice(0, maxBytesPerFile) : text;
    totalBytes += slice.length;
    included++;
    files[rel] = { bytes: entry.header.size, content: slice, truncated };

    if (/\.(spec|md)$/i.test(rel)) {
      try {
        const parsed = parseMarkdownToSpec(text, { filenameFallback: path.basename(rel) });
        specs.push({ path: rel, meta: parsed.meta, chunkCount: parsed.chunks.length, wasCanonical: parsed.wasCanonical });
      } catch (e) {
        specs.push({ path: rel, error: e.message });
      }
    }
  }

  return {
    ok: true,
    name: (opts.name || path.basename(zipPath).replace(/\.zip$/i, '')),
    totalEntries: allEntries.length,
    fileCount: included,
    stacks,
    primaryStack: stacks[0]?.stack || 'unknown',
    specs,
    files,
    omitted,
  };
}

module.exports = { parseProjectZip, _looksLikeText, _detectStacks, MODULE_ID: 'nexus-dynamic-project-parser', VERSION: '1.0.0' };
