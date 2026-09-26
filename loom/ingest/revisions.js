'use strict';
/**
 * loom/ingest/revisions.js — disk-first store for ingested revisions.
 * comp_id: nexus.loom.ingest.revisions
 * UUID: nexus-loom-revisions-v1-0000-2026-0702-jamesbrooks-001
 * Phase: 144 (this session — drag-and-drop-equivalent ingest, backend half)
 *
 * A revision is NOT a component/seam/hook/wire — forcing "nexus-consolidated
 * (23).zip" into that schema would be a category error (a zip snapshot
 * isn't a named wire between two surfaces). This is its own small store,
 * same disk-first discipline (§2.1/§2.2) as loom/schema/registry.js, kept
 * separate on purpose.
 *
 * One revision record:
 *   { id, sourceFileName, sha256, byteSize, fileCount, ingestedAt,
 *     parentId, diff: { added, removed, changed, unchanged } }
 *
 * Lineage is a simple parent pointer, same shape as idearium/repo/index.js's
 * fork(repoUuid) -> parent tracking — nothing here is a new lineage model,
 * it's the same one, ported to LOOM's own store.
 */
const fs = require('fs');
const path = require('path');

class RevisionRegistry {
  constructor({ dataDir = null } = {}) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    this.file = path.join(this.dataDir, 'revisions.json');
    this._state = this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return raw.revisions || {};
    } catch (_) {
      return {};
    }
  }

  _persist() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ revisions: this._state }, null, 2));
  }

  add(record) {
    if (this._state[record.id]) {
      throw new Error(`[loom/revisions] duplicate revision id: ${record.id}`);
    }
    this._state[record.id] = { ...record };
    this._persist();
    return this._state[record.id];
  }

  get(id) {
    return this._state[id] || null;
  }

  all() {
    return { ...this._state };
  }

  /** latest() — most recently ingested revision, by ingestedAt. Null if none. */
  latest() {
    const all = Object.values(this._state);
    if (!all.length) return null;
    return all.reduce((a, b) => (a.ingestedAt > b.ingestedAt ? a : b));
  }

  /** chain(id) — full lineage from root to id, oldest first. */
  chain(id) {
    const out = [];
    let cur = this.get(id);
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? this.get(cur.parentId) : null;
    }
    return out;
  }
}

module.exports = { RevisionRegistry };
