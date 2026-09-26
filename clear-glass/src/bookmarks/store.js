'use strict';
/**
 * src/bookmarks/store.js — Clear Glass Bookmark Store
 * UUID: cg-bookmarks-v1-0000-0000-000000000019
 *
 * Per-agent bookmarks. Named, tagged, bus-controllable.
 * Gates: bookmarks.add, bookmarks.remove, bookmarks.list, bookmarks.open
 * Cortex/copilot can add, tag, and open bookmarks through the bus.
 * Renderer syncs on every change via SSE.
 *
 * Schema per entry:
 *   { id, url, title, agentId, tags[], faviconUrl, createdAt, visitCount,
 *     lastVisited, snapshotId, accountId }
 *
 * §STATE-LINK 2026-08-27 — snapshotId/accountId, both optional, both null
 * unless explicitly linked via linkState() below. A plain bookmark (the
 * existing add() path, unchanged) never gets either — this is additive,
 * not a new bookmark type. snapshotId points into RewindEngine's real
 * snapshot store (clear-glass/src/rewind/engine.js — same mechanism
 * lib/agent-tools/tools/clear-glass/macro.js's bookmark()/openBookmark()
 * already use for macros, reused here rather than a second one).
 * accountId points into NexusOptions' real account entities
 * (src/options/store.js) — which of possibly several logins for this
 * bookmark's agent the captured cookies/storage belong to. Neither field
 * is populated by this file — the caller (ipc/bridge.js, which already
 * holds live references to both RewindEngine and NexusOptions) does the
 * capture and passes the ids in; this store only holds and returns them.
 */

const path = require('path');
const fs   = require('fs');
const { JaaRows } = require('../storage/jaa');
const { randomUUID } = require('crypto');

const BOOKMARKS_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'bookmarks.json'
);

class BookmarkStore {
  constructor() {
    this.data = []; // flat array — filter by agentId on query
  }

  // §JAA 2026-09-26 — James: "with clearglass, make it jaa. no json." Rows live in
  // the Clear Glass JAA store (src/storage/jaa.js); the old bookmarks.json is imported
  // once on first load and left on disk.
  _rows() { return this._jaa || (this._jaa = new JaaRows('cg_bookmarks', { legacyFile: BOOKMARKS_PATH })); }

  async load() {
    try { this.data = this._rows().load(); }
    catch (err) { console.warn('[Bookmarks] Load error:', err.message); this.data = []; }
    return this.data;
  }

  _save() {
    try {
      this._rows().replaceAll(this.data);
    } catch (err) {
      // Non-fatal in test environments without home dir
    }
  }

  add({ url, title, agentId = 'default', tags = [], faviconUrl }) {
    if (!url) throw new Error('url required');

    // Deduplicate by url + agentId
    const existing = this.data.find(b => b.url === url && b.agentId === agentId);
    if (existing) {
      // Update title/tags if provided
      if (title)        existing.title      = title;
      if (tags.length)  existing.tags       = [...new Set([...existing.tags, ...tags])];
      if (faviconUrl)   existing.faviconUrl = faviconUrl;
      existing.updatedAt = Date.now();
      this._save();
      return { bookmark: existing, added: false };
    }

    const bookmark = {
      id:          randomUUID(),
      url,
      title:       title || url,
      agentId,
      tags:        [...new Set(tags)],
      faviconUrl:  faviconUrl || null,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
      visitCount:  0,
      lastVisited: null,
      snapshotId:  null,   // §STATE-LINK — set via linkState(), never here
      accountId:   null,   // §STATE-LINK — set via linkState(), never here
    };

    this.data.push(bookmark);
    this._save();
    return { bookmark, added: true };
  }

  /**
   * linkState({id, snapshotId, accountId}) — attach a real rewind snapshot
   * and/or account to an EXISTING bookmark. Separate from add() on purpose,
   * same reasoning options/store.js already documents for its own account
   * CRUD: add() runs synchronously off a single click (§the quick path
   * must stay quick); the snapshot capture is an async round trip to
   * RewindEngine the caller does first, then links the result here once
   * it has a real snapshotId — never a placeholder written up front and
   * filled in later.
   */
  linkState({ id, snapshotId, accountId }) {
    const bk = this.data.find(b => b.id === id);
    if (!bk) return { error: `no bookmark "${id}"` };
    if (snapshotId !== undefined) bk.snapshotId = snapshotId;
    if (accountId  !== undefined) bk.accountId  = accountId;
    bk.updatedAt = Date.now();
    this._save();
    return { bookmark: bk };
  }

  remove({ id, url, agentId }) {
    const before = this.data.length;
    if (id) {
      this.data = this.data.filter(b => b.id !== id);
    } else if (url && agentId) {
      this.data = this.data.filter(b => !(b.url === url && b.agentId === agentId));
    } else {
      throw new Error('id or (url + agentId) required');
    }
    this._save();
    return { removed: before - this.data.length };
  }

  list({ agentId, tag, query } = {}) {
    let results = this.data;
    if (agentId) results = results.filter(b => b.agentId === agentId || b.agentId === '*');
    if (tag)     results = results.filter(b => b.tags.includes(tag));
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(b =>
        b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
      );
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  recordVisit({ id, url, agentId }) {
    const bk = id
      ? this.data.find(b => b.id === id)
      : this.data.find(b => b.url === url && b.agentId === agentId);
    if (!bk) return;
    bk.visitCount++;
    bk.lastVisited = Date.now();
    this._save();
  }

  isBookmarked({ url, agentId = 'default' }) {
    return this.data.some(b => b.url === url && b.agentId === agentId);
  }

  tag({ id, tags }) {
    const bk = this.data.find(b => b.id === id);
    if (!bk) throw new Error('Bookmark not found');
    bk.tags = [...new Set([...bk.tags, ...tags])];
    bk.updatedAt = Date.now();
    this._save();
    return bk;
  }
}

module.exports = BookmarkStore;
