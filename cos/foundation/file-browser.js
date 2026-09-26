/**
 * compartment/file-browser.js
 * COMPARTMENT OS — Compartment File Browser
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * FileBrowser wraps FsLayer with higher-level operations:
 *   - Structured tree output for API/UI consumption
 *   - File upload (write with MIME type detection)
 *   - Zip extraction (drag-drop → place → events)
 *   - File rename / copy / move
 *   - Watch-mode: fs.watch → comp:file:written events
 *
 * API:
 *   const browser = new FileBrowser(compartment, opts)
 *   browser.tree(relPath?, opts?)             → FileNode[]
 *   browser.read(relPath)                     → { path, content, encoding, sizeBytes }
 *   browser.write(relPath, content, opts?)    → FileNode
 *   browser.upload(relPath, buffer, opts?)    → FileNode
 *   browser.extractZip(relPath, destDir?)     → FileNode[]  (Phase 4 — requires adm-zip)
 *   browser.rename(fromRel, toRel)            → FileNode
 *   browser.copy(srcRel, destRel)             → FileNode
 *   browser.delete(relPath)                   → void
 *   browser.mkdir(relPath)                    → FileNode
 *   browser.startWatch()                      → void
 *   browser.stopWatch()                       → void
 *
 * Events emitted:
 *   comp:file:written  { compartmentId, path, sizeBytes }
 *   comp:fs:tree       { compartmentId, tree }
 *   comp:fs:listed     { compartmentId, path, entries }
 *
 * COS-1: Nothing silently fails.
 * COS-12: Drag-drop is a first-class input (extractZip handles drop payload).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { FsLayer }        = require('./fs-layer.js');
const { CosAxiomError }  = require('../foundation/axioms.js');
const { COMP }           = require('../foundation/event-contracts.js');

// Binary-safe encodings — for non-text files we return base64
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.jsonc', '.json5',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.md', '.mdx', '.txt', '.log', '.csv', '.tsv',
  '.yaml', '.yml', '.toml', '.ini', '.env',
  '.sh', '.bash', '.zsh', '.fish',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.xml', '.svg',
  '.sql',
  '.gitignore', '.gitattributes', '.editorconfig',
  '.eslintrc', '.prettierrc', '.babelrc',
  '.dockerfile', 'makefile',
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(base);
}

class FileBrowser {
  /**
   * @param {object} compartment
   * @param {object} [opts]
   * @param {object} [opts.bus]     — event bus
   */
  constructor(compartment, opts = {}) {
    this._layer = new FsLayer(compartment, opts);
    this._id    = compartment.id;
    this._bus   = opts.bus || null;
    this._watcher = null;
  }

  get layer() { return this._layer; }
  get root()  { return this._layer.root; }

  // ── Tree ─────────────────────────────────────────────────────────────────────

  /**
   * Return directory tree rooted at relPath.
   * @param {string} [relPath='.']
   * @param {object} [opts]
   * @returns {import('./fs-layer.js').FileNode[]}
   */
  tree(relPath = '.', opts = {}) {
    const nodes = this._layer.tree(relPath, opts);
    this._emit(COMP.FS_TREE, { compartmentId: this._id, path: relPath, tree: nodes });
    return nodes;
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  /**
   * Read a file. Returns text or base64 depending on extension.
   * @param {string} relPath
   * @returns {{ path: string, content: string, encoding: 'utf8'|'base64', sizeBytes: number }}
   */
  read(relPath) {
    const abs = this._layer.resolve(relPath);
    const stat = this._layer.stat(relPath);
    if (stat.isDirectory()) {
      throw new CosAxiomError('COS-1', `Cannot read directory as file: ${relPath}`, {});
    }

    const encoding = isTextFile(abs) ? 'utf8' : 'base64';
    const content  = encoding === 'utf8'
      ? this._layer.readText(relPath, 'utf8')
      : this._layer.read(relPath).toString('base64');

    return {
      path:      relPath.replace(/\\/g, '/'),
      content,
      encoding,
      sizeBytes: stat.size,
    };
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  /**
   * Write string content to a file.
   * @param {string} relPath
   * @param {string} content
   * @param {object} [opts]
   * @param {string} [opts.encoding='utf8']
   * @returns {FileNode}
   */
  write(relPath, content, opts = {}) {
    this._layer.write(relPath, content, opts);
    return this._statNode(relPath);
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  /**
   * Upload a Buffer to a path. Used for binary uploads and drag-drop.
   * @param {string} relPath
   * @param {Buffer} buffer
   * @param {object} [opts]
   * @returns {FileNode}
   */
  upload(relPath, buffer, opts = {}) {
    if (!Buffer.isBuffer(buffer)) {
      throw new CosAxiomError('COS-1', 'upload: buffer must be a Buffer', { relPath });
    }
    this._layer.assertWrite(relPath);
    const abs = this._layer.resolve(relPath);
    const dir = path.dirname(abs);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, buffer);
    if (this._bus) {
      this._bus.emit(COMP.FILE_WRITTEN, {
        compartmentId: this._id,
        path:          abs,
        sizeBytes:     buffer.length,
      });
    }
    return this._statNode(relPath);
  }

  // ── Zip extraction ────────────────────────────────────────────────────────────

  /**
   * Extract a zip file into destDir (defaults to same dir as zip minus the .zip).
   * Requires 'adm-zip' — logs warning and returns [] if not available.
   *
   * @param {string} zipRelPath  — path to .zip inside compartment
   * @param {string} [destRel]   — destination directory (relative)
   * @returns {FileNode[]}       — extracted file nodes
   */
  extractZip(zipRelPath, destRel) {
    let AdmZip;
    try { AdmZip = require('../../lib/zip.js'); }   // §0.39.261 — in-house, was adm-zip
    catch {
      // adm-zip not installed — emit event, return empty (Phase 5 installs it)
      if (this._bus) {
        this._bus.emit('comp:file:written', {
          compartmentId: this._id,
          path: zipRelPath,
          sizeBytes: 0,
          error: 'adm-zip not available — install for zip extraction support',
        });
      }
      return [];
    }

    const zipAbs  = this._layer.resolve(zipRelPath);
    const destAbs = destRel
      ? this._layer.resolve(destRel)
      : path.join(path.dirname(zipAbs), path.basename(zipAbs, '.zip'));

    this._layer.assertWrite(destRel || path.relative(this._layer.root, destAbs));
    fs.mkdirSync(destAbs, { recursive: true });

    const zip = new AdmZip(zipAbs);
    zip.extractAllTo(destAbs, true /* overwrite */);

    // Return nodes for extracted root
    const destRel2 = path.relative(this._layer.root, destAbs);
    return this.tree(destRel2 || '.');
  }

  // ── Rename / copy / delete / mkdir ───────────────────────────────────────────

  /**
   * Rename/move a file or directory within the compartment.
   * @param {string} fromRel
   * @param {string} toRel
   * @returns {FileNode}
   */
  rename(fromRel, toRel) {
    this._layer.assertWrite(fromRel);
    this._layer.assertWrite(toRel);
    const fromAbs = this._layer.resolve(fromRel);
    const toAbs   = this._layer.resolve(toRel);
    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    fs.renameSync(fromAbs, toAbs);
    return this._statNode(toRel);
  }

  /**
   * Copy a file within the compartment.
   * @param {string} srcRel
   * @param {string} destRel
   * @returns {FileNode}
   */
  copy(srcRel, destRel) {
    this._layer.assertWrite(destRel);
    const srcAbs  = this._layer.resolve(srcRel);
    const destAbs = this._layer.resolve(destRel);
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.copyFileSync(srcAbs, destAbs);
    return this._statNode(destRel);
  }

  /**
   * Delete a file or directory (recursive for dirs).
   * @param {string} relPath
   */
  delete(relPath) {
    this._layer.assertWrite(relPath);
    const abs  = this._layer.resolve(relPath);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
  }

  /**
   * Create directory (recursive).
   * @param {string} relPath
   * @returns {FileNode}
   */
  mkdir(relPath) {
    this._layer.mkdir(relPath);
    return this._statNode(relPath);
  }

  // ── Watch mode ────────────────────────────────────────────────────────────────

  /**
   * Start watching the compartment root. Emits comp:file:written on changes.
   * Uses fs.watch with { recursive: true } — Windows-native, Linux requires inotify.
   */
  startWatch() {
    if (this._watcher) return;
    try {
      this._watcher = fs.watch(
        this._layer.root,
        { recursive: true },
        (eventType, filename) => {
          if (!filename || !this._bus) return;
          const abs = path.join(this._layer.root, filename);
          if (!this._layer.canWrite(filename)) return; // readonly path changed — ignore

          let sizeBytes = null;
          try { sizeBytes = fs.statSync(abs).size; } catch { /* deleted */ }

          this._bus.emit(COMP.FILE_WRITTEN, {
            compartmentId: this._id,
            path:          abs,
            sizeBytes,
            watchEvent:    eventType,
          });
        }
      );
    } catch {
      // fs.watch not available (sandboxed env) — no-op
    }
  }

  /** Stop watching. */
  stopWatch() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  /**
   * Build a FileNode for a path that definitely exists.
   * @private
   */
  _statNode(relPath) {
    const abs     = this._layer.resolve(relPath);
    let   stat;
    try { stat = fs.statSync(abs); } catch {
      throw new CosAxiomError('COS-1', `_statNode: path not found after write: ${relPath}`, {});
    }
    return {
      name:         path.basename(abs),
      path:         relPath.replace(/\\/g, '/'),
      absolutePath: abs,
      type:         stat.isDirectory() ? 'dir' : 'file',
      sizeBytes:    stat.isDirectory() ? null : stat.size,
      mtime:        stat.mtimeMs,
      writable:     this._layer.canWrite(relPath),
      children:     null,
    };
  }

  _emit(type, payload) {
    if (this._bus) this._bus.emit(type, payload);
  }
}

module.exports = { FileBrowser };
