'use strict';
/**
 * src/downloads/store.js — Real Local Downloads Store
 * UUID: cg-downloads-store-v1-0000-0000-000000000007
 *
 * Real gap named directly in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's
 * §3: "Genuinely missing: any visual downloads list/manager UI (Ctrl+J
 * style), and no real 'change download directory' setting anywhere...
 * The routing backend is real; the management UI and the directory
 * setting are not."
 *
 * §WHY A NEW STORE, NOT REUSE OF download-capture.js — checked directly
 * before building this: download-capture.js only ANNOUNCES to Guardian's
 * HTTP intake (by its own header: "NOTHING IS APPLIED HERE. This
 * announces."), and its own attach() is only ever called on provider
 * (NCP chat) sessions, never on a regular agent browsing session
 * (confirmed: grepped every attach() call site — only providers/host.js
 * calls it, for persist:ncp-<id> partitions). A file downloaded while
 * just browsing in a real Clear Glass agent window today has ZERO
 * capture at all, provider or otherwise, and even a provider download's
 * only record is a remote HTTP call that silently does nothing useful if
 * Guardian is unreachable (its own honest comment: "File is on disk...
 * untracked"). A real user-facing downloads LIST needs a real local
 * record independent of a remote service's reachability — this is that
 * record, not a replacement for download-capture's real, different job
 * (provenance-tagged staging into Guardian for provider chats).
 */

const path = require('path');
const fs   = require('fs');

const STORE_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'downloads.json'
);
const MAX_ENTRIES = 500; // real cap — a downloads list isn't meant to grow forever

class DownloadsStore {
  constructor() {
    this.items = []; // newest first
  }

  load() {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      if (fs.existsSync(STORE_PATH)) {
        this.items = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      } else {
        this._persist();
      }
    } catch (err) {
      console.warn('[Downloads] load error:', err.message);
    }
    return this.items;
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.items, null, 2));
    } catch (err) {
      console.warn('[Downloads] persist error:', err.message);
    }
  }

  /**
   * add(entry) -> the stored record (with a real generated id).
   * entry: { agentId, filename, url, savePath, mimeType, bytes, state,
   *          startedAt, updatedAt }
   */
  add(entry) {
    const record = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId:   entry.agentId || null,
      filename:  entry.filename || '(unknown)',
      url:       entry.url || null,
      savePath:  entry.savePath || null,
      mimeType:  entry.mimeType || null,
      bytes:     entry.bytes || 0,
      state:     entry.state || 'in_progress', // in_progress | completed | cancelled | interrupted
      // §0.39.246 — kept, not dropped: a response entry must stay linked to
      // its job and to the agent/compartment that asked, and be tellable
      // apart from a browser download. Absent for ordinary downloads.
      ...(entry.jobId ? { jobId: entry.jobId } : {}),
      ...(entry.kind ? { kind: entry.kind } : {}),
      ...(entry.provider ? { provider: entry.provider } : {}),
      ...(entry.compartmentId ? { compartmentId: entry.compartmentId } : {}),
      ...(entry.source ? { source: entry.source } : {}),
      startedAt: entry.startedAt || Date.now(),
      updatedAt: Date.now(),
    };
    this.items.unshift(record);
    if (this.items.length > MAX_ENTRIES) this.items.length = MAX_ENTRIES;
    this._persist();
    return record;
  }

  /** updateState(id, state, extra?) -> the updated record | null if not found. */
  updateState(id, state, extra = {}) {
    const record = this.items.find(i => i.id === id);
    if (!record) return null;
    Object.assign(record, extra, { state, updatedAt: Date.now() });
    this._persist();
    return record;
  }

  list({ agentId, state } = {}) {
    return this.items.filter(i =>
      (agentId === undefined || i.agentId === agentId) &&
      (state === undefined || i.state === state)
    );
  }

  /** clearItem(id) — removes one entry from the LIST only; never touches the file on disk. */
  clearItem(id) {
    const before = this.items.length;
    this.items = this.items.filter(i => i.id !== id);
    if (this.items.length !== before) { this._persist(); return true; }
    return false;
  }

  /** clearCompleted() — real, matches every real browser's "clear downloads" affordance. */
  clearCompleted() {
    const before = this.items.length;
    this.items = this.items.filter(i => i.state !== 'completed');
    this._persist();
    return before - this.items.length;
  }
}

module.exports = { DownloadsStore };
