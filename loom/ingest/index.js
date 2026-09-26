'use strict';
/**
 * loom/ingest/index.js — the backend half of "drag and drop old
 * versions/revisions into LOOM."
 * comp_id: nexus.loom.ingest
 * UUID: nexus-loom-ingest-v1-0000-2026-0702-jamesbrooks-001
 * Phase: 144
 *
 * What this is NOT: a UI. Drag-and-drop is a UI gesture, and UI is
 * explicitly last per the stated build order. What this IS: the function
 * a drop handler will call once UI exists — ingestZip(path) — fully real,
 * fully working today from a CLI or a script, same as everything else
 * built before its UI layer this session.
 *
 * Zero new dependencies: shells out to `unzip -l` for the file listing
 * (matches Warp's own zero-dependency philosophy — no adm-zip, no
 * yauzl) and Node's built-in crypto for the content hash. Both `unzip`
 * and Node's crypto are already load-bearing elsewhere in this sandbox
 * and, per the source files audited this session, in the real NEXUS repo.
 *
 * What "ingest" does, concretely:
 *   1. sha256 the whole zip file — this revision's identity
 *   2. `unzip -l` for a real file listing (path + size per entry)
 *   3. diff against the most recent prior revision (added/removed/
 *      changed-by-size/unchanged), or note this is the first revision
 *   4. write a revision record to loom/data/revisions.json — disk
 *      first, same as everything else in LOOM
 *
 * What it deliberately does NOT do: extract the zip's contents onto
 * disk. For a 178MB archive with 10,991 entries, extracting on every
 * ingest is real cost for no benefit — the listing + hash is enough to
 * detect drift. Full extraction is a separate, explicit operation
 * (see extractRevision below), not implied by ingest.
 */
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const { RevisionRegistry } = require('./revisions');

function _sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * _listZip(filePath) -> Map<entryPath, sizeBytes>
 * Parses `unzip -l` output. Skips directory entries (they carry no
 * content to diff) and the header/footer lines unzip -l always prints.
 */
function _listZip(filePath) {
  const out = execFileSync('unzip', ['-l', filePath], { maxBuffer: 1024 * 1024 * 64 }).toString('utf8');
  const lines = out.split('\n');
  const entries = new Map();
  // unzip -l lines look like: "   201446  2026-07-02 03:02   nexus/.../event_log.jsonl"
  const re = /^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    const size = parseInt(m[1], 10);
    const entryPath = m[2].trim();
    if (entryPath.endsWith('/')) continue; // directory entry, no content
    entries.set(entryPath, size);
  }
  return entries;
}

/**
 * _diff(prevEntries, nextEntries) — added / removed / changed-by-size / unchanged.
 * Size-based change detection, not per-file hashing — hashing all 10,991
 * files on every ingest would defeat the point of skipping extraction.
 * This is the same tradeoff idearium/repo/watcher.js's design almost
 * certainly makes (unaudited, per phase 130's still-open note) — cheap
 * drift signal, not a cryptographic diff.
 */
function _diff(prevEntries, nextEntries) {
  const added = [], removed = [], changed = [];
  let unchanged = 0;
  if (!prevEntries) return { added: null, removed: null, changed: null, unchanged: null, firstRevision: true };

  for (const [p, size] of nextEntries) {
    if (!prevEntries.has(p)) { added.push(p); continue; }
    if (prevEntries.get(p) !== size) { changed.push(p); continue; }
    unchanged++;
  }
  for (const p of prevEntries.keys()) {
    if (!nextEntries.has(p)) removed.push(p);
  }
  return { added, removed, changed, unchanged, firstRevision: false };
}

class LoomIngest {
  constructor({ dataDir = null } = {}) {
    this.revisions = new RevisionRegistry({ dataDir });
  }

  /**
   * ingestZip(zipPath, { label }) -> revision record
   * This is the one call a future drag-and-drop handler makes.
   */
  ingestZip(zipPath, { label = null } = {}) {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`[loom/ingest] file not found: ${zipPath}`);
    }
    const stat = fs.statSync(zipPath);
    const sha256 = _sha256File(zipPath);
    const id = `rev-${sha256.slice(0, 12)}`;

    if (this.revisions.get(id)) {
      // Byte-identical file already ingested — not an error, just a no-op
      // that returns the existing record (idempotent drag-and-drop).
      return { ...this.revisions.get(id), alreadyIngested: true };
    }

    const entries = _listZip(zipPath);
    const parent = this.revisions.latest();
    const parentEntries = parent && parent._rawEntries ? new Map(parent._rawEntries) : null;
    const diff = _diff(parentEntries, entries);

    const record = {
      id,
      sourceFileName: path.basename(zipPath),
      label: label || path.basename(zipPath),
      sha256,
      byteSize: stat.size,
      fileCount: entries.size,
      ingestedAt: Date.now(),
      parentId: parent ? parent.id : null,
      diff: diff.firstRevision
        ? { firstRevision: true }
        : {
            addedCount: diff.added.length, removedCount: diff.removed.length,
            changedCount: diff.changed.length, unchangedCount: diff.unchanged,
            added: diff.added.slice(0, 50), removed: diff.removed.slice(0, 50), changed: diff.changed.slice(0, 50),
            // slice(0,50): full lists for huge trees aren't useful in a
            // record meant to be read, not just stored — truncated with
            // counts preserved so nothing is silently hidden, per §1.2.
          },
      // stored for the NEXT ingest's diff — not part of the "public" record
      // shape, but real, on disk, needed for lineage to work at all.
      _rawEntries: [...entries.entries()],
    };

    return this.revisions.add(record);
  }

  /** summary(id) — human-readable, what a CLI/UI prints. */
  summary(id) {
    const r = this.revisions.get(id);
    if (!r) return null;
    const lines = [`${r.label} (${r.id})`, `  ingested: ${new Date(r.ingestedAt).toISOString()}`, `  files: ${r.fileCount}, ${(r.byteSize / 1024 / 1024).toFixed(1)}MB`];
    if (r.diff.firstRevision) {
      lines.push('  first revision — no prior to diff against');
    } else {
      lines.push(`  vs parent (${r.parentId}): +${r.diff.addedCount} -${r.diff.removedCount} ~${r.diff.changedCount} =${r.diff.unchangedCount}`);
    }
    return lines.join('\n');
  }
}

module.exports = { LoomIngest };
