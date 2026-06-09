'use strict';
// ── foundation/store/FileStore.js ─────────────────────────────────────────────
// Content-addressable SHA-256 object store.
// put(obj) → hash. get(hash) → obj. Append-only. Immutable objects.
// Referenced from cobalt manifest: foundation/store/FileStore.js

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

class FileStore {
  constructor({ dir = './store' } = {}) {
    this._dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  // Compute deterministic SHA-256 hash of a canonical JSON representation
  _hash(obj) {
    const canon = JSON.stringify(this._canonicalize(obj));
    return crypto.createHash('sha256').update(canon).digest('hex');
  }

  // Canonical key ordering for deterministic hashing (§3.2)
  _canonicalize(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(v => this._canonicalize(v));
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = this._canonicalize(obj[k]);
    return sorted;
  }

  // Store object. Returns hash. Idempotent — same content, same hash, no duplicate write.
  put(obj) {
    const hash = this._hash(obj);
    const file = this._file(hash);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(obj));
    }
    return hash;
  }

  // Retrieve by hash. Throws if not found (§1.2 — no silent failure).
  get(hash) {
    const file = this._file(hash);
    if (!fs.existsSync(file)) throw new Error(`[FileStore] Object not found: ${hash}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  has(hash) {
    return fs.existsSync(this._file(hash));
  }

  _file(hash) {
    // Two-level dir split like git — avoids huge flat dirs
    const prefix = hash.slice(0, 2);
    const dir    = path.join(this._dir, prefix);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, hash.slice(2));
  }

  get stats() {
    let count = 0;
    try {
      for (const prefix of fs.readdirSync(this._dir)) {
        const sub = path.join(this._dir, prefix);
        if (fs.statSync(sub).isDirectory()) {
          count += fs.readdirSync(sub).length;
        }
      }
    } catch {}
    return { dir: this._dir, objects: count };
  }
}

module.exports = { FileStore };
