// ═══════════════════════════════════════════════════
// NEXUS — FileRefs
// foundation/store/FileRefs.js
//
// Named pointers to content hashes in the FileStore.
// Maps human-readable names → SHA256 hashes.
//
// e.g.  fileRefs.set('manifest.current', hash)
//       fileRefs.get('manifest.current') → hash
//
// Names are sanitised (non-alphanumeric → '_') before
// hitting the filesystem. Atomic: reads the symlink
// layer, never races with FileStore object writes.
//
// Design:
//   §2.1  Persistence is the golden rule. Every set()
//         is a synchronous-safe atomic rename.
//   §1.2  get() on unknown name returns null, never throws.
//   §5.1  snapshot() returns a plain object — no hidden
//         state, fully serialisable into .nex files.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

class FileRefs {
  /**
   * @param {string} base  Root of the store directory.
   *                       Refs live under <base>/refs/.
   */
  constructor(base = './data/store') {
    this._base = path.join(base, 'refs');
    fs.mkdirSync(this._base, { recursive: true });
  }

  // ── Write ────────────────────────────────────────

  /**
   * Point a named ref at a content hash.
   * Atomic: write to tmp then rename.
   *
   * @param {string} name   Human-readable pointer name.
   * @param {string} hash   SHA256 hex from FileStore.put().
   */
  async set(name, hash) {
    if (!name || typeof name !== 'string') throw new Error('FileRefs.set: name must be a non-empty string');
    if (!hash || typeof hash !== 'string') throw new Error('FileRefs.set: hash must be a non-empty string');

    const dest = this._refPath(name);
    const tmp  = `${dest}.tmp.${process.pid}.${Date.now()}`;

    await fs.promises.writeFile(tmp, hash, 'utf8');
    await fs.promises.rename(tmp, dest);   // atomic on POSIX + Windows (same volume)
  }

  // ── Read ─────────────────────────────────────────

  /**
   * Resolve a named ref to its hash.
   * Returns null if the ref does not exist.
   *
   * @param  {string}       name
   * @returns {Promise<string|null>}
   */
  async get(name) {
    if (!name || typeof name !== 'string') return null;
    const p = this._refPath(name);
    if (!fs.existsSync(p)) return null;
    return (await fs.promises.readFile(p, 'utf8')).trim() || null;
  }

  /**
   * Check whether a named ref exists (no I/O beyond stat).
   *
   * @param  {string}  name
   * @returns {boolean}
   */
  has(name) {
    if (!name || typeof name !== 'string') return false;
    return fs.existsSync(this._refPath(name));
  }

  // ── Delete ───────────────────────────────────────

  /**
   * Remove a named ref. No-op if it does not exist.
   *
   * @param {string} name
   */
  async delete(name) {
    const p = this._refPath(name);
    if (fs.existsSync(p)) await fs.promises.unlink(p);
  }

  // ── Enumerate ────────────────────────────────────

  /**
   * List all ref names currently stored.
   *
   * @returns {Promise<string[]>}
   */
  async list() {
    return fs.promises.readdir(this._base);
  }

  /**
   * Return a plain {name → hash} snapshot of every ref.
   * Used by .nex serialisation (spec §12).
   *
   * @returns {Promise<Object.<string,string>>}
   */
  async snapshot() {
    const names  = await this.list();
    const result = {};
    await Promise.all(names.map(async n => {
      result[n] = await this.get(n);
    }));
    return result;
  }

  // ── Private ──────────────────────────────────────

  /**
   * Sanitise name and resolve to a filesystem path.
   * Non-word characters are replaced with '_' so that
   * dot-separated names like 'manifest.current' stay
   * readable but can't escape the refs directory.
   */
  _refPath(name) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this._base, safe);
  }
}

module.exports = { FileRefs };
