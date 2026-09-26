'use strict';
/**
 * src/rewind/engine.js — Clear Glass Rewind Engine
 * UUID: cg-rewind-v1-0000-0000-000000000020
 *
 * Rewind is the session time-machine. Every N seconds (or on significant
 * events), it snapshots:
 *   - The current URL and page title
 *   - A DOM state hash (shallow fingerprint, not full tree)
 *   - The cookie vault snapshot (real session, via ContextMgr — previously
 *     this was a dead stub that always returned null, so cookie
 *     snapshot/restore silently never ran despite looking wired)
 *   - Full localStorage/sessionStorage contents, plus scroll position
 *     (changed from the original "sizes only, no PII" design — exact-state
 *     restore needs real values; this does mean auth tokens/app state in
 *     storage are now persisted to disk in the snapshot file)
 *   - The agentId and contextId
 *
 * On rewind({ agentId, steps }):
 *   - Walks back N snapshots
 *   - Navigates to the snapshot URL
 *   - Restores cookies from vault if a snapshot key exists
 *   - Re-applies storage contents + scroll position post-navigation
 *   - Emits rewind.restored on SSE
 *
 * Gates: rewind.snapshot (manual), rewind.list, rewind.restore, rewind.clear
 * Auto-snapshot: triggered by nav.loaded events on the bus
 *
 * Storage: JSON file per agent, bounded to MAX_SNAPSHOTS entries.
 * Restores URL + cookies + storage + scroll — not a full JS-heap/app-state
 * snapshot (no browser exposes that). For a true SPA, "exact" means same
 * data, not same in-memory React/Vue state.
 */

const path = require('path');
const fs   = require('fs');
const { randomUUID } = require('crypto');

const REWIND_DIR     = path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'rewind');
const MAX_SNAPSHOTS  = 50; // per agent
const AUTO_INTERVAL  = 30000; // 30s auto-snapshot when page is idle

// §NEW 2026-08-24 — real "system state" upgrade: live form field values,
// not just storage/cookies/scroll. Deliberately EXCLUDES input[type=
// password] — a rewind snapshot is an unencrypted JSON file on disk
// (checked directly: _persist() below is a plain fs.writeFileSync, no
// encryption); capturing plaintext passwords there would be a real
// security regression given src/passwords/vault.js already exists
// specifically to store credentials encrypted (AES-256-GCM). Extracted
// as a standalone string (not inlined in the template literal) so the
// actual capture LOGIC is independently testable against a mocked DOM,
// not just trusted because it looks right inside a larger eval string.
const FORM_FIELDS_CAPTURE_JS = `(function() {
  var els = Array.prototype.slice.call(document.querySelectorAll('input, textarea, select'));
  return els.map(function(el, i) {
    if (el.type === 'password') return null; // never capture password field values — see engine.js's own header
    var selector = el.id ? ('#' + CSS.escape(el.id)) : (el.name ? ('[name="' + el.name.replace(/"/g, '\\\\"') + '"]') : null);
    var value = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    if (value === '' || value === false) return null; // nothing meaningful to restore
    return { selector: selector, index: i, isBoolean: (el.type === 'checkbox' || el.type === 'radio'), value: value };
  }).filter(Boolean);
})()`;

// Restore counterpart — selector first (survives DOM reordering), falls
// back to positional index within the same query (survives elements
// with neither id nor name, but only if the page's form structure
// hasn't changed since the snapshot — a real, honest limitation, not
// hidden: a page whose form markup changed between snapshot and restore
// may restore some fields to the wrong element or none at all).
const FORM_FIELDS_RESTORE_JS = (fieldsJson) => `(function(fields) {
  var all = document.querySelectorAll('input, textarea, select');
  fields.forEach(function(f) {
    var el = null;
    if (f.selector) { try { el = document.querySelector(f.selector); } catch(_) {} }
    if (!el) el = all[f.index] || null;
    if (!el) return;
    if (f.isBoolean) el.checked = f.value; else el.value = f.value;
    try { el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); } catch(_) {}
  });
})(${fieldsJson})`;

class RewindEngine {
  constructor({ vault, driver, sse, busOn, ctxMgr }) {
    this.vault  = vault;   // CookieVault
    this.driver = driver;  // ClearDriver
    this.sse    = sse;
    this.busOn  = busOn;   // bus.on subscription fn
    this.ctxMgr = ctxMgr;  // ContextMgr — needed to resolve the real session for cookie snapshot/restore
    this._sessions = new Map(); // agentId → RewindSession[]
    this._autoTimers = new Map();
  }

  async init() {
    fs.mkdirSync(REWIND_DIR, { recursive: true });

    // Auto-snapshot on nav.loaded
    if (this.busOn) {
      this.busOn('nav.loaded', (event) => {
        const { agentId, url, title } = event.data;
        if (agentId && url && !url.startsWith('about:')) {
          this._scheduleAutoSnapshot(agentId, url, title);
        }
      });

      // Also snapshot when url.match fires (significant page event)
      this.busOn('url.match', (event) => {
        const { agentId } = event.data;
        if (agentId) this._scheduleAutoSnapshot(agentId, null, null);
      });

      // §NEW 2026-08-24 — "make it actually capture system state,
      // snapshots from events including bookmarks." Real reconciliation,
      // not cosmetic: every native bookmark (src/bookmarks/store.js's
      // BookmarkStore.add, reached via the real bookmarks.add gate,
      // which emits 'bookmarks.added' on success) now ALSO takes a real,
      // IMMEDIATE state snapshot — not the debounced, generically-
      // labeled 'auto' path _scheduleAutoSnapshot uses for passive
      // browsing, since bookmarking is a deliberate, explicit action
      // that should capture state right now, not 2 seconds from now.
      // Uses the exact same 'bookmark:<name>' label convention already
      // shared by macro.js's bookmark(a) agent tool and the rewind
      // panel's own 🔖 button (checked directly, not reinvented) — a
      // bookmark saved through ANY of the three real paths (native
      // bookmarks bar, the 🔖 button, or an agent tool call) now shows
      // up correctly labeled in all the others, because all three write
      // through the identical engine and label string shape.
      this.busOn('bookmarks.added', (event) => {
        const bk = event.data?.bookmark;
        if (!bk?.agentId || !bk?.url) return;
        this.snapshot(bk.agentId, { url: bk.url, title: bk.title, label: `bookmark:${bk.title || bk.url}` })
          .catch(() => {}); // best-effort — a bookmark that fails to also snapshot is still a real, saved bookmark, not a failed operation
      });
    }

    console.log('[Rewind] Engine ready');
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────
  async snapshot(agentId, { url, title, label } = {}) {
    if (!agentId) throw new Error('agentId required');

    // Get current page state from driver
    let pageUrl = url, pageTitle = title;
    try {
      if (!pageUrl) {
        const urlResult = await this.driver.exec({ action: 'getUrl', agentId });
        pageUrl = urlResult.url;
      }
      if (!pageTitle) {
        const titleResult = await this.driver.exec({ action: 'getTitle', agentId });
        pageTitle = titleResult.title;
      }
    } catch (_) {}

    if (!pageUrl || pageUrl === 'about:blank') return null;

    // Snapshot cookies into vault
    let cookieKey = null;
    try {
      const ctx = this._getSession(agentId)?.session;
      if (ctx && this.vault) {
        const snap = await this.vault.snapshot(agentId, ctx);
        cookieKey = snap?.version ? `${agentId}-${snap.version}` : null;
      }
    } catch (_) {}

    // DOM hash (lightweight — just node count + body text hash)
    let domHash = null;
    try {
      const result = await this.driver.exec({
        action:  'eval',
        agentId,
        code:    `(document.querySelectorAll('*').length + ':' + document.body?.innerText?.slice(0,200)).length`,
      });
      domHash = String(result?.result || '');
    } catch (_) {}

    // Exact-state capture: scroll position + full storage contents.
    // NOTE: this stores real localStorage/sessionStorage values (auth
    // tokens, app state, etc.) to disk — a deliberate change from the
    // original "sizes only, no PII" design. Flagged, not silent.
    let stateBlob = null;
    try {
      const result = await this.driver.exec({
        action: 'eval',
        agentId,
        code: `JSON.stringify({
          scrollX: window.scrollX, scrollY: window.scrollY,
          localStorage: (function(){ try { return Object.assign({}, localStorage); } catch(_) { return {}; } })(),
          sessionStorage: (function(){ try { return Object.assign({}, sessionStorage); } catch(_) { return {}; } })(),
          formFields: ${FORM_FIELDS_CAPTURE_JS}
        })`,
      });
      stateBlob = result?.result || null;
    } catch (_) {}

    const entry = {
      id:         randomUUID(),
      agentId,
      url:        pageUrl,
      title:      pageTitle || pageUrl,
      label:      label || null,
      cookieKey,
      domHash,
      stateBlob,
      ts:         Date.now(),
    };

    this._pushSnapshot(agentId, entry);
    this._persist(agentId);

    this.sse?.emit('rewind.snapshot', { agentId, entry });
    return entry;
  }

  // ── List ──────────────────────────────────────────────────────────────────
  list(agentId, limit = 20) {
    this._loadIfNeeded(agentId);
    const snaps = this._sessions.get(agentId) || [];
    return snaps.slice(-limit).reverse(); // most recent first
  }

  // ── Restore ───────────────────────────────────────────────────────────────
  async restore({ agentId, snapshotId, steps = 1 }) {
    this._loadIfNeeded(agentId);
    const snaps = this._sessions.get(agentId) || [];
    if (!snaps.length) throw new Error('No rewind snapshots for agent');

    let target;
    if (snapshotId) {
      target = snaps.find(s => s.id === snapshotId);
      if (!target) throw new Error(`Snapshot not found: ${snapshotId}`);
    } else {
      // steps back from most recent
      const idx = snaps.length - 1 - steps;
      target = snaps[Math.max(0, idx)];
    }

    if (!target) throw new Error('No snapshot to restore to');

    this.sse?.emit('rewind.restoring', { agentId, target });

    // Restore cookies first
    if (target.cookieKey && this.vault) {
      const [, version] = target.cookieKey.split('-').slice(-1);
      await this.vault.restore({ agentId, version: parseInt(version) || undefined }).catch(() => {});
    }

    // Navigate to the snapshot URL
    await this.driver.exec({ action: 'navigate', agentId, url: target.url });

    // Re-apply storage + scroll position now that the page has loaded
    if (target.stateBlob) {
      try {
        const state = JSON.parse(target.stateBlob);
        await this.driver.exec({
          action: 'eval',
          agentId,
          code: `(function(s){
            try { for (const k in s.localStorage)   localStorage.setItem(k, s.localStorage[k]); } catch(_) {}
            try { for (const k in s.sessionStorage) sessionStorage.setItem(k, s.sessionStorage[k]); } catch(_) {}
            window.scrollTo(s.scrollX || 0, s.scrollY || 0);
          })(${target.stateBlob})`,
        });
        // §NEW 2026-08-24 — real form field restore, the counterpart to
        // FORM_FIELDS_CAPTURE_JS above. Separate eval call from
        // storage/scroll: form elements need the page's own JS to have
        // finished initializing (framework-rendered inputs may not exist
        // yet immediately post-navigation) — kept as its own best-effort
        // step rather than bundled into the same call as the more
        // reliably-available storage/scroll restore.
        if (Array.isArray(state.formFields) && state.formFields.length) {
          await this.driver.exec({ action: 'eval', agentId, code: FORM_FIELDS_RESTORE_JS(JSON.stringify(state.formFields)) });
        }
      } catch (_) {}
    }

    this.sse?.emit('rewind.restored', { agentId, target, ts: Date.now() });
    return { restored: target };
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  clear(agentId) {
    this._sessions.delete(agentId);
    try {
      const fp = path.join(REWIND_DIR, `${agentId}.json`);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_) {}
    return { cleared: true };
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  _pushSnapshot(agentId, entry) {
    if (!this._sessions.has(agentId)) this._sessions.set(agentId, []);
    const snaps = this._sessions.get(agentId);
    // Don't snapshot the same URL twice in a row
    if (snaps.length && snaps[snaps.length - 1].url === entry.url) return;
    snaps.push(entry);
    if (snaps.length > MAX_SNAPSHOTS) snaps.splice(0, snaps.length - MAX_SNAPSHOTS);
  }

  _scheduleAutoSnapshot(agentId, url, title) {
    // Debounce — reset timer on every nav event
    if (this._autoTimers.has(agentId)) clearTimeout(this._autoTimers.get(agentId));
    const timer = setTimeout(() => {
      this.snapshot(agentId, { url, title, label: 'auto' }).catch(() => {});
      this._autoTimers.delete(agentId);
    }, 2000); // 2s after last nav event
    this._autoTimers.set(agentId, timer);
  }

  _persist(agentId) {
    try {
      const fp   = path.join(REWIND_DIR, `${agentId.replace(/[^a-z0-9-]/gi, '_')}.json`);
      const data = this._sessions.get(agentId) || [];
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}
  }

  _loadIfNeeded(agentId) {
    if (this._sessions.has(agentId)) return;
    try {
      const fp = path.join(REWIND_DIR, `${agentId.replace(/[^a-z0-9-]/gi, '_')}.json`);
      if (fs.existsSync(fp)) {
        this._sessions.set(agentId, JSON.parse(fs.readFileSync(fp, 'utf8')));
      }
    } catch (_) {}
  }

  _getSession(agentId) {
    if (!this.ctxMgr) return null;
    const ses = this.ctxMgr.getSession(agentId);
    return ses ? { session: ses } : null;
  }
}

module.exports = RewindEngine;
module.exports.FORM_FIELDS_CAPTURE_JS = FORM_FIELDS_CAPTURE_JS;
module.exports.FORM_FIELDS_RESTORE_JS = FORM_FIELDS_RESTORE_JS;
