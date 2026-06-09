'use strict';
// ── foundation/store/FileRefs.js ──────────────────────────────────────────────
// Named reference layer over FileStore. Maps human names → content hashes.
// Mutable names, immutable objects. Like git branches over git objects.

const fs   = require('fs');
const path = require('path');

class FileRefs {
  constructor({ store, dir = './store/refs' } = {}) {
    if (!store) throw new Error('[FileRefs] store is required');
    this._store = store;
    this._dir   = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write named ref → hash
  set(name, hash) {
    const safe = this._safeName(name);
    fs.writeFileSync(path.join(this._dir, safe), hash, 'utf8');
  }

  // Read named ref → hash, or null
  resolve(name) {
    const file = path.join(this._dir, this._safeName(name));
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8').trim();
  }

  // Store object and set named ref
  put(name, obj) {
    const hash = this._store.put(obj);
    this.set(name, hash);
    return hash;
  }

  // Resolve ref and retrieve object, or null
  get(name) {
    const hash = this.resolve(name);
    if (!hash) return null;
    return this._store.has(hash) ? this._store.get(hash) : null;
  }

  list() {
    try { return fs.readdirSync(this._dir); } catch { return []; }
  }

  _safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}

module.exports = { FileRefs };
