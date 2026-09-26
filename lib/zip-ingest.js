'use strict';
/**
 * lib/zip-ingest.js — shared zip → bounded extraction.
 *
 * §EXTRACTED 2026-09-15 — this logic (adm-zip, skipDirs/textExt
 * filtering, the maxFiles/maxBytesPerFile/maxTotalBytes bounds) lived
 * inline in idearium/api/index.js's repo.import-archive case until
 * lib/project-container.js needed the identical behavior for the "Import
 * Repository" step. Two inline copies of the same bounded extraction is
 * what DECOMP.md's law ("never inline what belongs in a module") exists
 * to prevent; this file is that module.
 *
 * §REAL FILES 2026-09-15 — James: "it needs to import the real files
 * from the uploaded project to the repo, not just the chunks."
 *
 * The confirmed gap, and it was worse than it looked: this function only
 * ever returned `included`, a list filtered to a 15-extension text
 * whitelist AND truncated at maxBytesPerFile. Everything downstream —
 * RepoLayer.ingest() -> ingestFilesAsSpec() -> one chunk per file ->
 * materialize() writing chunk CONTENT back out — meant the repo's files
 * WERE the chunks. So an imported project silently lost: every binary
 * (images, fonts, .zip, .pdf), every unlisted text extension (.toml,
 * .sql, .env, .lock, Dockerfile, LICENSE — no extension at all), and the
 * tail of every file over 200 KB. The repo looked complete and was not,
 * with no error anywhere, because nothing ever compared what went in to
 * what came out.
 *
 * The fix is to stop conflating two different jobs:
 *   - `included`  — the CHUNKING input. Text only, still bounded by
 *                   maxBytesPerFile, still capped at maxFiles. Unchanged
 *                   shape, so every existing caller keeps working.
 *   - `realFiles` — the REPO content. Every entry that isn't in a
 *                   skipped dir, bytes exactly as they were in the zip,
 *                   binaries included, carried as a Buffer, bounded only
 *                   by maxRealFileBytes and maxTotalBytes.
 * A file normally appears in both: chunked as text, written verbatim as
 * bytes. A .png appears only in realFiles. A 4 MB .js appears in both —
 * truncated in its chunk (flagged `truncated`), complete on disk. The
 * two layers now agree about what is real, and disagree only where the
 * disagreement is recorded.
 *
 * §TRUNCATION IS A BYTE BOUND NOW, NOT A CHARACTER ONE — the previous
 * code compared `text.length` (UTF-16 code units) against a limit named
 * maxBytes and sliced by the same, so a file of multibyte characters was
 * bounded to roughly twice its stated byte cap and `totalBytes` was
 * wrong by the same factor. Measured in real bytes here. This is a real
 * behavior change, small, in the direction of the bound meaning what it
 * says.
 *
 * §DEPENDENCY — adm-zip is a real, already-declared dependency
 * (package.json), not newly added. The one deliberate exception to the
 * zero-npm default elsewhere in lib/: reading arbitrary zip byte layouts
 * (central directory, deflate) by hand is a correctness risk not worth
 * taking for an already-solved problem. Contrast lib/intake.js's
 * expandArchive(), which shells out to the system `unzip` because it
 * only needs "put these files somewhere", not in-memory entry reads.
 */

const path   = require('path');
const crypto = require('crypto');

const DEFAULT_SKIP_DIRS = ['node_modules', '.git', '.svn', 'dist', 'build', '__pycache__', '.next'];
const DEFAULT_TEXT_EXT  = ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.py', '.html', '.css', '.yml', '.yaml', '.spec', '.sh'];

/**
 * _isProbablyText(buf) — a real check on real bytes, not an extension
 * guess. A NUL byte in the first 8 KB is the standard, reliable binary
 * signal (it is what git itself uses); a high proportion of bytes
 * outside printable/whitespace ASCII catches the rest. Used only to
 * LABEL a realFile, never to decide whether to import it — the label
 * tells the repo layer whether a file can be written as utf8 or must
 * stay binary, which is a different question from "should this exist".
 */
function _isProbablyText(buf) {
  const n = Math.min(buf.length, 8192);
  if (n === 0) return true; // an empty file is a real, writable text file
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 7 || (b > 14 && b < 32)) suspicious++;
  }
  return suspicious / n < 0.3;
}

/** Path safety — no absolute paths, no '..' escape, no drive letters. */
function _safeRelPath(entryName) {
  const cleaned = String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/');
  return cleaned || null;
}

/**
 * extractZipToFiles({ buf, maxFiles, maxBytesPerFile, maxTotalBytes,
 *   maxRealFileBytes, realFiles, includeBinary, verifyHashes, skipDirs,
 *   textExt })
 *
 * buf is the raw zip bytes (a Buffer).
 * Returns { ok:true, included, realFiles, omitted, stats } or
 *         { ok:false, error }.
 *
 *   included:  [{ path, bytes, content, truncated }]     — chunking input
 *   realFiles: [{ path, bytes, buffer, binary, sha256 }] — verbatim repo content
 *   omitted:   [{ path, why }]                           — every real exclusion, with its reason
 *
 * §OMISSIONS ARE STILL RECORDED PER LAYER — a .png is no longer
 * "omitted"; it is a realFile that was not chunked, which is a different
 * and true statement. `omitted` now means genuinely excluded from BOTH
 * layers. stats.notChunked counts the second case separately so a caller
 * can report "312 files imported, 47 not chunked (binary)" honestly
 * instead of calling them all skipped.
 */
function extractZipToFiles({
  buf,
  maxFiles,
  maxBytesPerFile,
  maxTotalBytes,
  maxRealFileBytes = 50 * 1024 * 1024,
  realFiles: wantRealFiles = true,
  includeBinary = true,
  verifyHashes = true,
  skipDirs = DEFAULT_SKIP_DIRS,
  textExt  = DEFAULT_TEXT_EXT,
} = {}) {
  if (!buf || !buf.length) return { ok: false, error: 'empty zip buffer' };

  const SKIP_DIRS = new Set(skipDirs);
  const TEXT_EXT  = new Set(textExt);

  let AdmZip;
  try { AdmZip = require('adm-zip'); }
  catch (e) { return { ok: false, error: `adm-zip unavailable: ${e.message}` }; }

  // §MATCHED, NOT SHARED — the original handler wrote a temp file to disk
  // before handing the path to AdmZip; adm-zip also accepts a Buffer
  // directly, which avoids the tmp write/cleanup entirely. Confirmed
  // against adm-zip's own README before relying on it — a real,
  // documented constructor overload, not an assumption.
  let zip, entries;
  try {
    zip = new AdmZip(buf);
    entries = zip.getEntries().filter(e => !e.isDirectory);
  } catch (e) {
    return { ok: false, error: `could not read zip (adm-zip): ${e.message}` };
  }

  const included  = [];
  const realOut   = [];
  const omitted   = [];
  let totalBytes  = 0;   // real bytes written into realFiles
  let chunkBytes  = 0;   // bytes handed to the chunking layer
  let notChunked  = 0;

  for (const entry of entries) {
    const raw = entry.entryName;
    const rel = _safeRelPath(raw);
    if (!rel) { omitted.push({ path: raw, why: 'unsafe or empty path after sanitization' }); continue; }

    if (rel.split('/').some(seg => SKIP_DIRS.has(seg))) {
      omitted.push({ path: rel, why: 'skipped dir (node_modules/.git/etc.)' });
      continue;
    }

    // Read the real bytes once. Everything below is a decision about
    // these bytes, not a second read of the entry.
    let data;
    try { data = entry.getData(); }
    catch (e) { omitted.push({ path: rel, why: `read failed: ${e.message}` }); continue; }

    const size = data.length;
    const isText = _isProbablyText(data);
    const ext = path.extname(rel).toLowerCase();

    // ── layer 1: the real file ────────────────────────────────────────
    let keptReal = false;
    if (wantRealFiles) {
      if (size > maxRealFileBytes) {
        omitted.push({ path: rel, why: `exceeds maxRealFileBytes (${size} > ${maxRealFileBytes})` });
      } else if (!isText && !includeBinary) {
        omitted.push({ path: rel, why: 'binary, and includeBinary is off' });
      } else if (totalBytes + size > maxTotalBytes) {
        omitted.push({ path: rel, why: `maxTotalBytes reached (${totalBytes} + ${size} > ${maxTotalBytes})` });
      } else {
        totalBytes += size;
        realOut.push({
          path: rel,
          bytes: size,
          buffer: data,
          binary: !isText,
          // Real content identity, computed once here so the repo layer
          // can verify the write landed byte-for-byte without re-reading
          // and re-hashing the whole tree.
          sha256: verifyHashes ? crypto.createHash('sha256').update(data).digest('hex') : null,
        });
        keptReal = true;
      }
    }

    // ── layer 2: the chunk ────────────────────────────────────────────
    // Only text gets chunked, and only within the chunk cap. A file that
    // is real on disk but not chunked is normal now, not a loss — it is
    // counted, not reported as an omission.
    if (!isText || !TEXT_EXT.has(ext)) {
      if (keptReal) notChunked++;
      else if (!wantRealFiles) omitted.push({ path: rel, why: `binary/unlisted extension (${ext || 'none'})` });
      continue;
    }
    if (included.length >= maxFiles) {
      if (keptReal) { notChunked++; omitted.push({ path: rel, why: `maxFiles (chunk_cap) reached — file imported, not chunked` }); }
      else omitted.push({ path: rel, why: 'maxFiles (chunk_cap) reached' });
      continue;
    }

    // Byte-accurate truncation (see §TRUNCATION header note).
    const truncated = size > maxBytesPerFile;
    const text = (truncated ? data.subarray(0, maxBytesPerFile) : data).toString('utf8');
    chunkBytes += Buffer.byteLength(text);
    included.push({ path: rel, bytes: size, content: text, truncated });
  }

  if (!wantRealFiles && !included.length) {
    return { ok: false, error: 'no text files matched the bounds — nothing to import (see omitted reasons)' };
  }

  return {
    ok: true,
    included,
    realFiles: realOut,
    omitted,
    stats: {
      entries: entries.length,
      chunked: included.length,
      realFiles: realOut.length,
      notChunked,
      omitted: omitted.length,
      totalBytes,
      chunkBytes,
      truncatedChunks: included.filter(f => f.truncated).length,
    },
  };
}

module.exports = { extractZipToFiles, _isProbablyText, _safeRelPath };
