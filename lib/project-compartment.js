'use strict';
// lib/project-compartment.js — turns a staged (and, for archives,
// expanded — see intake.js's expandArchive()) intake drop into a
// compartment's working_memory seed.
//
// §THE GAP THIS CLOSES — checked directly before writing this:
// case-library.js's query() is the only thing that has ever produced a
// workingMemorySeed for compartment-engine.spawn(), and it is scoped
// entirely to PAST COMPARTMENT PATTERN MEMORY (source_compartment_uuid,
// trace_log, prior result — see that file's own query()). There was no
// path anywhere in this codebase for external project data (an imported
// zip/repo) to become a compartment's working memory. This module is
// that path — it does not touch case-library's own semantics; see
// lib/autonomous-loop.js's projectSeed parameter for how the two are
// composed without one overwriting the other.
//
// §BOUNDED — a whole project's file contents cannot go into a prompt.
// Every limit below is real and enforced, not a soft target: maxFiles
// caps file count, maxBytesPerFile truncates any single file,
// maxTotalBytes stops adding files once the seed would be too large to
// be a reasonable prompt payload. Every omission is recorded with a
// reason — never a silent drop.

const fs   = require('fs');
const path = require('path');

const MAX_FILES           = 60;
const MAX_BYTES_PER_FILE  = 4000;
const MAX_TOTAL_BYTES     = 60000;

// Directories never worth seeding into a prompt regardless of project —
// dependency trees and VCS internals dwarf real project code and add
// cost, not signal.
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'build', '__pycache__', '.next']);
const TEXT_EXT  = new Set(['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.py', '.html', '.css', '.yml', '.yaml', '.spec', '.sh']);

function _walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) _walk(abs, base, out);
    else if (entry.isFile()) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/**
 * buildSeedFromPayload(payloadDir, opts) — real file tree + bounded file
 * contents from an on-disk project directory. Works on any directory, not
 * only intake drops — buildSeedFromDrop() below is the intake-specific
 * convenience wrapper.
 */
function buildSeedFromPayload(payloadDir, opts = {}) {
  if (!fs.existsSync(payloadDir)) return { ok: false, reason: `no such directory: ${payloadDir}` };

  const maxFiles          = opts.maxFiles || MAX_FILES;
  const maxBytesPerFile   = opts.maxBytesPerFile || MAX_BYTES_PER_FILE;
  const maxTotalBytes     = opts.maxTotalBytes || MAX_TOTAL_BYTES;

  const fileTree = _walk(payloadDir); // real, complete tree — cheap, never truncated
  const included = {};
  const omitted  = [];
  let totalBytes = 0;

  for (const rel of fileTree) {
    if (Object.keys(included).length >= maxFiles) { omitted.push({ path: rel, why: 'maxFiles reached' }); continue; }
    const ext = path.extname(rel).toLowerCase();
    if (!TEXT_EXT.has(ext)) { omitted.push({ path: rel, why: `binary/unlisted extension (${ext || 'none'})` }); continue; }
    if (totalBytes >= maxTotalBytes) { omitted.push({ path: rel, why: 'maxTotalBytes reached' }); continue; }

    let content;
    try { content = fs.readFileSync(path.join(payloadDir, rel), 'utf8'); }
    catch (e) { omitted.push({ path: rel, why: `read failed: ${e.message}` }); continue; }

    const truncated = content.length > maxBytesPerFile;
    const slice = truncated ? content.slice(0, maxBytesPerFile) : content;
    totalBytes += slice.length;
    included[rel] = { content: slice, truncated };
  }

  return { ok: true, payloadDir, fileCount: fileTree.length, fileTree, files: included, omitted };
}

/**
 * _unwrapSingleChildDir(dir) — real, general "collapse a chain of single-
 * child directories" walk. A freshly-expanded archive almost always has
 * exactly this shape (the zip's own top-level folder, sitting inside
 * intake's own <archive>.expanded/ wrapper) — this walks down through
 * BOTH wrapper layers to find the real project root, however many
 * layers deep, without hardcoding intake.js's own naming convention.
 * Stops the moment a directory has more than one entry or a file —
 * that's the real content, not more wrapping.
 */
function _unwrapSingleChildDir(dir) {
  let cur = dir;
  let prefix = '';
  for (;;) {
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch (_) { break; }
    if (entries.length === 1 && entries[0].isDirectory()) {
      cur = path.join(cur, entries[0].name);
      prefix = prefix ? `${prefix}/${entries[0].name}` : entries[0].name;
    } else break;
  }
  return { dir: cur, prefix };
}

/**
 * buildSeedFromDrop(dropId, opts) — same as above, sourced from a real
 * intake drop. Not a second source of truth for the drop's state — reads
 * dropId → payload path via intake.read(), then delegates.
 *
 * §MCO01 2026-09-18 — James: "I want it to reflect the actual file
 * structure of the project." Real, confirmed gap: intake.expandArchive()
 * deliberately namespaces each archive under <archive>.expanded/ (so two
 * imports never collide) — correct for intake's own bookkeeping, but it
 * meant every file path surfaced to a compartment's working memory was
 * "myproject.zip.expanded/myproject/src/app.js" instead of "src/app.js".
 * Fixed here, not in intake.js — intake's own naming stays exactly as
 * designed (still needed for its collision-safety); this is the one real
 * place external code reads project structure OUT of a drop, so this is
 * where "what does this project's structure actually look like" belongs.
 * Only applies when the payload is unambiguous — exactly one archive,
 * nothing else sitting alongside it in the drop — so it never silently
 * guesses a root when multiple archives or loose files could collide.
 */
function buildSeedFromDrop(dropId, opts = {}) {
  const intake = require('./intake.js');
  const intakeDir = opts.intakeDir || intake.INTAKE_DIR;
  const contract = intake.read(dropId, intakeDir);
  if (!contract) return { ok: false, reason: `no staged drop "${dropId}"` };
  const payloadDir = path.join(intakeDir, dropId, 'payload');

  let effectiveRoot = payloadDir;
  let rootPrefix = null;
  const archives = contract.expanded && contract.expanded.archives;
  if (Array.isArray(archives) && archives.length === 1) {
    const { archive, into } = archives[0];
    let siblings = [];
    try { siblings = fs.readdirSync(payloadDir); } catch (_) { siblings = []; }
    const onlyThisArchiveAndItsExpansion = siblings.length > 0 && siblings.every(s => s === archive || s === into);
    if (onlyThisArchiveAndItsExpansion) {
      const unwrapped = _unwrapSingleChildDir(path.join(payloadDir, into));
      effectiveRoot = unwrapped.dir;
      rootPrefix = unwrapped.prefix ? `${into}/${unwrapped.prefix}` : into;
    }
  }

  const seed = buildSeedFromPayload(effectiveRoot, opts);
  if (!seed.ok) return seed;
  return { ...seed, dropId, provenance: contract.provenance, expanded: !!contract.expanded, rootPrefixStripped: rootPrefix };
}

module.exports = { buildSeedFromPayload, buildSeedFromDrop, MAX_FILES, MAX_BYTES_PER_FILE, MAX_TOTAL_BYTES };
