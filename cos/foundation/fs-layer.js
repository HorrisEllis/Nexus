/**
 * compartment/fs-layer.js
 * COMPARTMENT OS — Compartment Virtual Filesystem Layer
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * The FsLayer wraps a compartment's root path and enforces:
 *   - Writable paths: writes allowed (default: entire root)
 *   - Readonly paths: writes blocked, reads allowed
 *   - Mount table:   host path → compartment-relative path (read-only by default)
 *
 * All path resolution normalises to absolute, within root.
 * Attempts to escape root (path traversal) throw CosAxiomError(COS-1).
 * Unauthorised writes emit watchdog:fs:unauthorized-write and throw.
 *
 * API:
 *   const layer = new FsLayer(compartment)
 *   layer.resolve(relPath)              → absolute path (throws on escape)
 *   layer.canWrite(relPath)             → boolean
 *   layer.assertWrite(relPath)          → throws if not writable
 *   layer.read(relPath)                 → Buffer
 *   layer.readText(relPath, enc?)       → string
 *   layer.write(relPath, data, opts?)   → void
 *   layer.readdir(relPath)              → string[]
 *   layer.stat(relPath)                 → fs.Stats
 *   layer.exists(relPath)               → boolean
 *   layer.mkdir(relPath, opts?)         → void
 *   layer.unlink(relPath)               → void
 *   layer.tree(relPath?, opts?)         → FileNode[]
 *   layer.listMounts()                  → Mount[]
 *
 * Events emitted (via bus if provided):
 *   comp:file:written   { compartmentId, path, sizeBytes }
 *   watchdog:fs:unauthorized-write  { compartmentId, path, pid: null }
 *
 * COS-1: Nothing silently fails.
 * COS-11: Readonly mounts are the default.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { CosAxiomError } = require('../foundation/axioms.js');
const { COMP, WATCHDOG } = require('../foundation/event-contracts.js');

// Max tree depth to prevent runaway recursion on deeply nested projects
const MAX_TREE_DEPTH = 20;

// Files/dirs always excluded from tree walks
const TREE_EXCLUDES = new Set([
  'node_modules', '.git', '.nex', '.cos-wal', '__pycache__',
  '.venv', 'venv', 'dist', '.next', '.nuxt', 'coverage',
]);

class FsLayer {
  /**
   * @param {object} compartment     — Compartment object from types.js
   * @param {object} [opts]
   * @param {object} [opts.bus]      — host event bus (optional; no events if absent)
   */
  constructor(compartment, opts = {}) {
    if (!compartment || !compartment.id) {
      throw new CosAxiomError('COS-1', 'FsLayer requires compartment with id', {});
    }

    this._id  = compartment.id;
    this._bus = opts.bus || null;

    // Normalise root — must be absolute
    const root = compartment.fs && compartment.fs.root
      ? path.resolve(compartment.fs.root)
      : null;

    if (!root) {
      throw new CosAxiomError('COS-1', 'FsLayer: compartment.fs.root is required', { id: this._id });
    }

    this._root = root;

    // Writable paths — resolved absolute. Empty = entire root is writable.
    const writablePaths = (compartment.fs.writable || []).map(p =>
      path.isAbsolute(p) ? path.normalize(p) : path.resolve(root, p)
    );

    // Readonly paths — take precedence over writable
    const readonlyPaths = (compartment.fs.readonly || []).map(p =>
      path.isAbsolute(p) ? path.normalize(p) : path.resolve(root, p)
    );

    this._writable  = writablePaths;   // [] = whole root writable
    this._readonly  = readonlyPaths;

    // Mount table: { hostPath, compartmentPath, readonly }
    this._mounts = (compartment.fs.mounts || []).map(m => ({
      hostPath:        path.resolve(m.hostPath || m.host || ''),
      compartmentPath: path.resolve(root, m.compartmentPath || m.target || ''),
      readonly:        m.readonly !== false,  // default readonly
    }));
  }

  // ── Root ─────────────────────────────────────────────────────────────────────

  get root() { return this._root; }

  // ── Path resolution ───────────────────────────────────────────────────────────

  /**
   * Resolve a relative-or-absolute path within the compartment root.
   * Throws CosAxiomError(COS-1) if the resolved path escapes the root.
   *
   * @param {string} relPath
   * @returns {string} absolute path
   */
  resolve(relPath) {
    if (typeof relPath !== 'string') {
      throw new CosAxiomError('COS-1', 'FsLayer.resolve: path must be a string', { relPath });
    }

    const abs = path.isAbsolute(relPath)
      ? path.normalize(relPath)
      : path.resolve(this._root, relPath);

    // Ensure it's under root — root itself is allowed
    if (abs !== this._root && !abs.startsWith(this._root + path.sep)) {
      throw new CosAxiomError('COS-1', `Path traversal blocked: ${relPath}`, {
        compartmentId: this._id,
        relPath,
        resolved: abs,
        root: this._root,
      });
    }

    return abs;
  }

  // ── Access control ────────────────────────────────────────────────────────────

  /**
   * Returns true if the given path (relative or absolute) is writable.
   * Logic:
   *   1. If path is under a readonly entry → false
   *   2. If _writable is empty → entire root is writable → true
   *   3. If path is under any writable entry → true
   *   4. Otherwise → false
   *
   * @param {string} relPath
   * @returns {boolean}
   */
  canWrite(relPath) {
    let abs;
    try { abs = this.resolve(relPath); } catch { return false; }

    // Readonly mount check
    for (const m of this._mounts) {
      if (abs === m.compartmentPath || abs.startsWith(m.compartmentPath + path.sep)) {
        if (m.readonly) return false;
      }
    }

    // Explicit readonly paths take precedence
    for (const ro of this._readonly) {
      if (abs === ro || abs.startsWith(ro + path.sep)) return false;
    }

    // If writable list is empty → whole root is writable
    if (this._writable.length === 0) return true;

    // Check against writable list
    for (const w of this._writable) {
      if (abs === w || abs.startsWith(w + path.sep)) return true;
    }

    return false;
  }

  /**
   * Throws and emits watchdog event if path is not writable.
   * @param {string} relPath
   */
  assertWrite(relPath) {
    if (!this.canWrite(relPath)) {
      const abs = (() => { try { return this.resolve(relPath); } catch { return relPath; } })();
      this._emitUnauthorized(abs);
      throw new CosAxiomError('COS-1', `Write blocked on readonly path: ${relPath}`, {
        compartmentId: this._id,
        path:          abs,
      });
    }
  }

  // ── File I/O ──────────────────────────────────────────────────────────────────

  /**
   * Read file as Buffer.
   * @param {string} relPath
   * @returns {Buffer}
   */
  read(relPath) {
    return fs.readFileSync(this.resolve(relPath));
  }

  /**
   * Read file as string.
   * @param {string} relPath
   * @param {BufferEncoding} [enc='utf8']
   * @returns {string}
   */
  readText(relPath, enc = 'utf8') {
    return fs.readFileSync(this.resolve(relPath), enc);
  }

  /**
   * Write data to file. Enforces write access. Creates parent dirs.
   * @param {string} relPath
   * @param {string|Buffer} data
   * @param {object} [opts]
   * @param {string} [opts.encoding='utf8']
   * @param {boolean} [opts.append=false]
   */
  write(relPath, data, opts = {}) {
    this.assertWrite(relPath);
    const abs = this.resolve(relPath);
    const dir = path.dirname(abs);
    fs.mkdirSync(dir, { recursive: true });

    if (opts.append) {
      fs.appendFileSync(abs, data, opts.encoding || 'utf8');
    } else {
      fs.writeFileSync(abs, data, opts.encoding || 'utf8');
    }

    const sizeBytes = Buffer.byteLength(data);
    this._emitFileWritten(abs, sizeBytes);
  }

  /**
   * Read directory entries.
   * @param {string} [relPath='.']
   * @returns {string[]}
   */
  readdir(relPath = '.') {
    return fs.readdirSync(this.resolve(relPath));
  }

  /**
   * stat a path.
   * @param {string} relPath
   * @returns {fs.Stats}
   */
  stat(relPath) {
    return fs.statSync(this.resolve(relPath));
  }

  /**
   * Does path exist?
   * @param {string} relPath
   * @returns {boolean}
   */
  exists(relPath) {
    try {
      fs.accessSync(this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create directory (recursive).
   * @param {string} relPath
   * @param {object} [opts]
   */
  mkdir(relPath, opts = {}) {
    this.assertWrite(relPath);
    fs.mkdirSync(this.resolve(relPath), { recursive: true, ...opts });
  }

  /**
   * Delete a file.
   * @param {string} relPath
   */
  unlink(relPath) {
    this.assertWrite(relPath);
    fs.unlinkSync(this.resolve(relPath));
  }

  // ── Directory tree ────────────────────────────────────────────────────────────

  /**
   * Walk directory tree and return FileNode[].
   * Excludes TREE_EXCLUDES dirs by default.
   *
   * @param {string} [relPath='.']
   * @param {object} [opts]
   * @param {number}   [opts.maxDepth=MAX_TREE_DEPTH]
   * @param {string[]} [opts.exclude]     — additional exclusions
   * @param {boolean}  [opts.includeHidden=false]
   * @returns {FileNode[]}
   */
  tree(relPath = '.', opts = {}) {
    const abs      = this.resolve(relPath);
    const maxDepth = opts.maxDepth ?? MAX_TREE_DEPTH;
    const exclude  = new Set([...TREE_EXCLUDES, ...(opts.exclude || [])]);
    const inclHidden = opts.includeHidden === true;

    return this._walk(abs, abs, 0, maxDepth, exclude, inclHidden);
  }

  /**
   * @private
   */
  _walk(abs, rootAbs, depth, maxDepth, exclude, inclHidden) {
    if (depth > maxDepth) return [];

    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); }
    catch { return []; }

    const nodes = [];

    for (const entry of entries) {
      if (!inclHidden && entry.name.startsWith('.')) continue;
      if (exclude.has(entry.name)) continue;

      const entryAbs  = path.join(abs, entry.name);
      const entryRel  = path.relative(rootAbs, entryAbs);
      let   stat;
      try { stat = fs.statSync(entryAbs); } catch { continue; }

      /** @type {FileNode} */
      const node = {
        name:          entry.name,
        path:          entryRel.replace(/\\/g, '/'),  // normalise to forward-slash
        absolutePath:  entryAbs,
        type:          entry.isDirectory() ? 'dir' : 'file',
        sizeBytes:     entry.isDirectory() ? null : stat.size,
        mtime:         stat.mtimeMs,
        writable:      this.canWrite(entryRel),
        children:      null,
      };

      if (entry.isDirectory()) {
        node.children = this._walk(entryAbs, rootAbs, depth + 1, maxDepth, exclude, inclHidden);
      }

      nodes.push(node);
    }

    // dirs first, then files, both alpha
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }

  // ── Mounts ────────────────────────────────────────────────────────────────────

  /** @returns {object[]} */
  listMounts() {
    return this._mounts.map(m => ({ ...m }));
  }

  // ── Private event emitters ────────────────────────────────────────────────────

  _emitFileWritten(absPath, sizeBytes) {
    if (!this._bus) return;
    this._bus.emit(COMP.FILE_WRITTEN, {
      compartmentId: this._id,
      path:          absPath,
      sizeBytes,
    });
  }

  _emitUnauthorized(absPath) {
    if (!this._bus) return;
    this._bus.emit(WATCHDOG.FS_UNAUTHORIZED, {
      compartmentId: this._id,
      path:          absPath,
      pid:           null,
    });
  }
}

module.exports = { FsLayer };
