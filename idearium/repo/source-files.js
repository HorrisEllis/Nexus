/**
 * idearium/repo/source-files.js — the repo's REAL files, written
 * verbatim, underneath the chunk projection.
 *
 * §BUILT 2026-09-15 — James: "it needs to import the real files from the
 * uploaded project to the repo, not just the chunks."
 *
 * §THE REAL PROBLEM THIS SOLVES — repo/index.js's own header states its
 * architecture plainly and correctly: "a repo no longer has its own
 * content store at all... the spec-engine manifest IS the archive... one
 * source of truth, never a stale second copy." materialize() follows
 * that faithfully — it regenerates the whole tree from chunk content on
 * every call, deleting anything not in its PRESERVE list first, so the
 * manifest can never drift from disk.
 *
 * That is right for AUTHORED content, where the manifest genuinely is
 * the source. It is wrong for IMPORTED content, where the source is the
 * uploaded project and the manifest is a derived, lossy reading of it:
 * text-only, extension-filtered, truncated at maxBytesPerFile. Running
 * the authored rule over imported content is what silently deleted every
 * binary and truncated every large file — not a bug in materialize(),
 * a category error about which thing was the original.
 *
 * §SO: TWO LAYERS, ONE TREE, CLEAR PRECEDENCE.
 *   - Source files (this module) are the real bytes from the upload.
 *     They are written once at import and are NOT regenerated, because
 *     nothing can regenerate them — the zip is gone.
 *   - Chunks remain the manifest's projection, and materialize() still
 *     regenerates them exactly as before.
 *   - Where both claim the same path, THE SOURCE FILE WINS and the chunk
 *     is not written over it. A chunk is a possibly-truncated reading of
 *     that same file; overwriting real bytes with a truncated copy of
 *     themselves is pure loss.
 * The manifest stays the source of truth for everything it actually
 * authored. It never gets to claim authorship of a file it only read.
 *
 * §THE RECORD — .idearium-sources.json in the repo dir lists every real
 * file with its size and sha256. It is what makes the two layers
 * separable at all: materialize() reads it to know which paths are
 * source-owned (so it neither deletes them nor writes chunks over them),
 * and verify() reads it to prove the tree on disk still matches what was
 * imported. Without it the distinction would have to be re-guessed from
 * file contents on every call.
 *
 * §HONEST LIMIT — a source file edited directly on disk is NOT detected
 * until verify() is called; nothing watches this tree. verify() reports
 * such a file as 'modified', which is a real answer, not a silent
 * repair: this module will not overwrite a user's edit with the imported
 * bytes on its own.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const SOURCE_MANIFEST_FILE = '.idearium-sources.json';
export const MODULE_ID = 'idearium-repo-source-files';
export const VERSION = '1.0.0';

/**
 * Path safety, applied again here even though lib/zip-ingest.js already
 * sanitizes. This module writes to disk from data that crossed a process
 * boundary (an HTTP body, base64-decoded, extracted) and a write path is
 * exactly the place to not trust an upstream guarantee. Returns null for
 * anything that would escape repoDir.
 */
function _safeRel(p) {
  const cleaned = String(p || '')
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
  return cleaned || null;
}

function _sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/**
 * writeSourceFiles(repoDir, realFiles, { verify }) — writes every real
 * file verbatim into repoDir at its real relative path, then records the
 * manifest.
 *
 * realFiles: [{ path, buffer|content, bytes, binary, sha256 }] — the
 * shape lib/zip-ingest.js's realFiles produces. `content` (a string) is
 * accepted as well as `buffer` so a caller that already has text (the
 * legacy `included` shape) can use this path without re-encoding.
 *
 * Returns { ok, dir, written, failed, skipped, manifest }.
 * §1.2 — an individual file that fails to write is recorded in `failed`
 * with its real reason and does not abort the rest; a repo with 312 of
 * 313 files and one honest error beats an all-or-nothing throw that
 * leaves a half-written tree with no record of what happened.
 */
export function writeSourceFiles(repoDir, realFiles = [], { verify = true } = {}) {
  if (!repoDir) return { ok: false, error: 'repoDir required' };
  if (!Array.isArray(realFiles) || !realFiles.length) {
    return { ok: true, dir: repoDir, written: 0, failed: [], skipped: [], manifest: null };
  }

  fs.mkdirSync(repoDir, { recursive: true });

  const files   = [];
  const failed  = [];
  const skipped = [];
  let written = 0;

  for (const f of realFiles) {
    const rel = _safeRel(f.path);
    if (!rel) { skipped.push({ path: f.path, why: 'unsafe path' }); continue; }
    // The manifest file is ours; a project that happens to contain one
    // must not be able to overwrite the record of itself.
    if (rel === SOURCE_MANIFEST_FILE) { skipped.push({ path: rel, why: 'reserved filename' }); continue; }

    const buf = Buffer.isBuffer(f.buffer) ? f.buffer
      : (typeof f.content === 'string' ? Buffer.from(f.content, 'utf8') : null);
    if (!buf) { failed.push({ path: rel, error: 'no buffer or content on realFile entry' }); continue; }

    const dest = path.join(repoDir, rel);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    } catch (e) {
      failed.push({ path: rel, error: e.message });
      continue;
    }

    const hash = f.sha256 || _sha256(buf);
    if (verify) {
      // §1.1 nothing real until proven — the same discipline
      // spec-engine's completeChunk() applies to a chunk artifact,
      // applied to a source file. Re-read what was just written and
      // compare hashes; a write that reported success but produced
      // different bytes (a full disk, a filesystem that mangled the
      // path) is caught here rather than discovered months later.
      try {
        const back = fs.readFileSync(dest);
        const backHash = _sha256(back);
        if (backHash !== hash) {
          failed.push({ path: rel, error: `write verification failed — expected ${hash.slice(0, 12)}…, disk has ${backHash.slice(0, 12)}…` });
          continue;
        }
      } catch (e) {
        failed.push({ path: rel, error: `write verification read failed: ${e.message}` });
        continue;
      }
    }

    files.push({ path: rel, bytes: buf.length, sha256: hash, binary: !!f.binary });
    written++;
  }

  const manifest = {
    version: '1.0.0',
    writtenAt: Date.now(),
    totalFiles: files.length,
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    files,
    // Failures are recorded IN the manifest, not only returned to the
    // caller, so the repo dir itself carries an honest account of what
    // did not make it in. A caller that drops the return value can't
    // accidentally erase that.
    failed,
    skipped,
  };

  try {
    fs.writeFileSync(path.join(repoDir, SOURCE_MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8');
  } catch (e) {
    console.error(`[${MODULE_ID}] §1.2 source manifest write failed for ${repoDir}: ${e.message} — the files are real and on disk, but materialize() will not know they are source-owned and may delete them`);
    return { ok: false, error: `source manifest write failed: ${e.message}`, dir: repoDir, written, failed, skipped, manifest: null };
  }

  if (failed.length) {
    console.warn(`[${MODULE_ID}] §1.2 ${written} source file(s) written, ${failed.length} failed — see ${SOURCE_MANIFEST_FILE}`);
  } else {
    console.log(`[${MODULE_ID}] ${written} real source file(s) written to ${repoDir} (${manifest.totalBytes} bytes)`);
  }

  return { ok: true, dir: repoDir, written, failed, skipped, manifest };
}

/**
 * setSourceFile(repoDir, rel, buffer) — replace (or add) ONE source-owned file's
 * bytes and its manifest entry, leaving every other entry alone.
 * §MCO-C 2026-09-20 — writeSourceFiles() rewrites the whole manifest from the
 * files it is handed, so it cannot be used to change one file. Snapshot restore
 * needs exactly that: an imported repo's real files (binaries included) are
 * owned by this layer, and RepoLayer.writeFile() only edits the chunk, which
 * materialize() then declines to write over the real file. Refuses when the
 * repo has no source layer (nothing to be owned by).
 */
export function setSourceFile(repoDir, rel, buffer) {
  const safe = _safeRel(rel);
  // _safeRel() CLEANS a path ('../x' -> 'x'). For a single-file write that would
  // silently write somewhere other than what was asked, so a path that needed
  // cleaning is refused instead.
  if (!safe || safe !== rel || safe === SOURCE_MANIFEST_FILE) return { ok: false, error: `unsafe or reserved path: ${rel}` };
  if (!Buffer.isBuffer(buffer)) return { ok: false, error: 'buffer required' };
  const man = loadSourceManifest(repoDir);
  if (!man || man.unreadable) return { ok: false, error: 'repo has no readable source layer' };
  const dest = path.join(repoDir, safe);
  try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buffer); }
  catch (e) { return { ok: false, error: `write failed: ${e.message}` }; }
  const hash = _sha256(buffer);
  try { if (_sha256(fs.readFileSync(dest)) !== hash) return { ok: false, error: 'write verification failed' }; }
  catch (e) { return { ok: false, error: `write verification read failed: ${e.message}` }; }
  const prev = (man.files || []).find(f => f.path === safe);
  const binary = prev ? !!prev.binary : (buffer.includes(0) || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer));
  const files = (man.files || []).filter(f => f.path !== safe);
  files.push({ path: safe, bytes: buffer.length, sha256: hash, binary });
  return _writeManifest(repoDir, man, files);
}

/** removeSourceFile(repoDir, rel) — delete one source-owned file and its manifest entry. */
export function removeSourceFile(repoDir, rel) {
  const safe = _safeRel(rel);
  if (!safe || safe !== rel || safe === SOURCE_MANIFEST_FILE) return { ok: false, error: `unsafe or reserved path: ${rel}` };
  const man = loadSourceManifest(repoDir);
  if (!man || man.unreadable) return { ok: false, error: 'repo has no readable source layer' };
  if (!(man.files || []).some(f => f.path === safe)) return { ok: false, error: `not a source-owned file: ${safe}` };
  try { fs.rmSync(path.join(repoDir, safe), { force: true }); } catch (e) { return { ok: false, error: `delete failed: ${e.message}` }; }
  return _writeManifest(repoDir, man, (man.files || []).filter(f => f.path !== safe));
}

function _writeManifest(repoDir, man, files) {
  const next = { ...man, writtenAt: Date.now(), totalFiles: files.length, totalBytes: files.reduce((n, f) => n + f.bytes, 0), files };
  try { fs.writeFileSync(path.join(repoDir, SOURCE_MANIFEST_FILE), JSON.stringify(next, null, 2), 'utf8'); }
  catch (e) { return { ok: false, error: `source manifest write failed: ${e.message}` }; }
  return { ok: true, manifest: next };
}

/** loadSourceManifest(repoDir) -> the manifest, or null when this repo has no source layer. */
export function loadSourceManifest(repoDir) {
  if (!repoDir) return null;
  const p = path.join(repoDir, SOURCE_MANIFEST_FILE);
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    // Loud: a repo that HAS source files but whose manifest is
    // unreadable is the one case where materialize() could delete real,
    // unrecoverable content. The caller (preserveEntries) treats this as
    // "preserve everything" rather than "preserve nothing" — see there.
    console.error(`[${MODULE_ID}] §1.2 ${p} unreadable: ${e.message}`);
    return { unreadable: true, error: e.message, files: [] };
  }
}

/**
 * sourcePathSet(manifest) -> Set of relative paths the source layer owns.
 * materialize() uses this to skip writing a chunk over a real file.
 */
export function sourcePathSet(manifest) {
  const set = new Set();
  if (!manifest || !Array.isArray(manifest.files)) return set;
  for (const f of manifest.files) set.add(f.path);
  return set;
}

/**
 * preserveEntries(repoDir) -> Set of TOP-LEVEL entry names materialize()
 * must not delete.
 *
 * Top-level, not full paths, because materialize()'s delete loop works on
 * readdirSync(outDir) entries and removes whole subtrees. A source file
 * at src/a/b.js means the entire `src` entry has to survive that loop;
 * the finer-grained protection (not overwriting the file itself) is
 * sourcePathSet's job.
 *
 * §FAIL SAFE, NOT FAIL QUIET — if the manifest exists but is unreadable,
 * this returns null, and the caller is expected to skip the destructive
 * sweep entirely for that call. Deleting real files because we couldn't
 * read the list of which ones to keep is the single worst thing this
 * code could do, so the unreadable case is the one that gets the
 * conservative answer.
 */
export function preserveEntries(repoDir) {
  const manifest = loadSourceManifest(repoDir);
  if (!manifest) return new Set();          // no source layer — nothing extra to preserve
  if (manifest.unreadable) return null;     // caller must not sweep
  const out = new Set([SOURCE_MANIFEST_FILE]);
  for (const f of manifest.files) out.add(f.path.split('/')[0]);
  return out;
}

/**
 * verify(repoDir) -> { ok, total, intact, modified, missing, details }.
 * Real re-hash of every source file against the manifest. Reports; never
 * repairs — see §HONEST LIMIT in this file's header.
 */
export function verify(repoDir) {
  const manifest = loadSourceManifest(repoDir);
  if (!manifest || manifest.unreadable) {
    return { ok: false, error: manifest ? manifest.error : 'no source manifest for this repo', total: 0, intact: 0, modified: 0, missing: 0, details: [] };
  }
  const details = [];
  let intact = 0, modified = 0, missing = 0;
  for (const f of manifest.files) {
    const p = path.join(repoDir, f.path);
    try {
      if (!fs.existsSync(p)) { missing++; details.push({ path: f.path, state: 'missing' }); continue; }
      const hash = _sha256(fs.readFileSync(p));
      if (hash === f.sha256) { intact++; }
      else { modified++; details.push({ path: f.path, state: 'modified', expected: f.sha256, actual: hash }); }
    } catch (e) {
      missing++; details.push({ path: f.path, state: 'unreadable', error: e.message });
    }
  }
  return {
    ok: modified === 0 && missing === 0,
    total: manifest.files.length, intact, modified, missing,
    details: details.slice(0, 200),
  };
}

export default { writeSourceFiles, setSourceFile, removeSourceFile, loadSourceManifest, sourcePathSet, preserveEntries, verify, SOURCE_MANIFEST_FILE, MODULE_ID, VERSION };
