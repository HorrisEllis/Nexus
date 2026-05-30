// ═══════════════════════════════════════════════════
// NEXUS — Core Index Layer
// core/index/query.js + store.js combined
//
// Check FileStore before generating anything.
// Content-addressed: same input = same hash = cache hit.
// ═══════════════════════════════════════════════════

'use strict';

const path = require('path');
const { FileStore } = require('../../foundation/store/FileStore');
const { FileRefs }  = require('../../foundation/store/FileRefs');
const { kernel } = require('../../foundation/kernel');

// Singleton store — shared across all core modules
const fileStore = new FileStore(path.join(process.cwd(), 'data', 'store'));
const fileRefs  = new FileRefs(path.join(process.cwd(), 'data', 'store'));

// ── Index Query Gate ──────────────────────────────
// Check FileStore before emitting a generate request.
// Emits index.hit (reuse) or index.miss (generate).
async function query(contentHash, context = {}) {
  kernel.emit('index.querying', { hash: contentHash, context });

  const existing = await fileStore.get(contentHash);
  if (existing) {
    kernel.emit('index.hit', { hash: contentHash, ...context });
    return { hit: true, content: existing, hash: contentHash };
  }

  kernel.emit('index.miss', { hash: contentHash, ...context });
  return { hit: false, hash: contentHash };
}

// ── Index Store Gate ──────────────────────────────
// Store generated content. Returns hash for dedup.
async function storeContent(content, name = null) {
  const hash = await fileStore.put(content);
  if (name) await fileRefs.set(name, hash);
  kernel.emit('index.stored', { hash, name, size: JSON.stringify(content).length });
  return hash;
}

// ── Content hash for cache key ────────────────────
// Deterministic: same prompt + params = same key
function contentKey(prompt, params = {}) {
  const crypto = require('crypto');
  const canonical = JSON.stringify({ prompt, params }, Object.keys({ prompt, params }).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = { query, storeContent, contentKey, fileStore, fileRefs, store: { fileStore, fileRefs } };
