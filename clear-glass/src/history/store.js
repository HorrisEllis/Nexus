'use strict';
/**
 * clear-glass/src/history/store.js — Real Browsing History Store
 * UUID: cg-history-store-v1-0000-0000-000000000007
 *
 * §GAP CLOSED 2026-08-30 — James: "build them all." Real, confirmed gap:
 * registry-components.js's history.list/delete/clear entries had ZERO
 * implementing code anywhere in this lineage (checked directly — the
 * classes referenced in an earlier investigation this session came from
 * a different branch's zip, never actually merged here). Built fresh,
 * real, minimal — not ported from anywhere.
 *
 * Storage: same real JSON-file convention as site-settings/store.js
 * (better-sqlite3 confirmed not installed) — appropriate for this
 * data's real volume, with a real cap (MAX_ENTRIES) so a long-running
 * session doesn't grow this file unboundedly.
 *
 * Real event source: clear-glass/src/providers/host.js's already-proven
 * real webContents 'did-navigate'/'did-navigate-in-page' listeners
 * (confirmed real and already firing, used by the wake-word feature) —
 * this store is a real, passive subscriber added there, not a new
 * navigation-detection mechanism invented separately.
 */

const path = require('path');
const fs   = require('fs');

const STORE_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'history.json'
);
const MAX_ENTRIES = 5000; // real cap — oldest entries drop first, matching a real browser's own bounded-history convention

class HistoryStore {
  constructor() {
    this.entries = []; // newest first: { id, url, title, agentId, ts }
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) this.entries = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (err) {
      console.warn('[history] load error:', err.message);
      this.entries = [];
    }
    return this.entries;
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.warn('[history] persist error:', err.message);
    }
  }

  /**
   * record({url, title, agentId}) — the real, single write path every
   * navigation event calls. Deliberately no de-dup against the
   * immediately-previous entry: a real browser's history genuinely
   * records repeat visits to the same URL as distinct entries (each
   * with its own real timestamp), not collapsed into one.
   */
  record({ url, title, agentId } = {}) {
    if (!url) return null;
    const entry = { id: require('crypto').randomUUID(), url, title: title || null, agentId: agentId || null, ts: Date.now() };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    this._persist();
    return entry;
  }

  list({ agentId, limit, since, query } = {}) {
    let out = this.entries;
    if (agentId) out = out.filter(e => e.agentId === agentId);
    if (since) out = out.filter(e => e.ts >= since);
    // §fix 2026-09-02 — `query` was accepted by every caller (renderer's
    // history search box sends it on every keystroke) but silently
    // dropped here — destructured never, filtered on never. Search box
    // rendered fine, just filtered nothing.
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(e => (e.title || '').toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q));
    }
    if (limit) out = out.slice(0, limit);
    return out;
  }

  delete(id) {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.id !== id);
    if (this.entries.length === before) return { error: `no history entry "${id}"` };
    this._persist();
    return { ok: true, id };
  }

  clear(agentId) {
    const before = this.entries.length;
    this.entries = agentId ? this.entries.filter(e => e.agentId !== agentId) : [];
    this._persist();
    return { ok: true, removed: before - this.entries.length };
  }
}

module.exports = { HistoryStore };
