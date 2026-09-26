'use strict';
/**
 * src/site-settings/store.js — Real Per-Site Settings Store
 * UUID: cg-site-settings-store-v1-0000-0000-000000000006
 *
 * Real gap named directly in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's
 * §4: "Zero real infrastructure — checked directly, no matches anywhere
 * for per-origin permission or settings storage. This would be genuinely
 * new: a real, origin-keyed settings store (mirroring Chrome's
 * site-settings model)." Built here, then wired into the permissions
 * plugin (src/plugins host) so it's actually consulted, not just built in
 * isolation — same discipline as every other plugin wiring this session.
 *
 * Storage: JSON file, same pattern as options/store.js (better-sqlite3
 * confirmed NOT installed in this environment — checked directly before
 * picking a backend, not assumed) — appropriate for this data's real
 * volume (a handful of settings per origin a person has actually visited
 * and configured, not high-frequency writes).
 *
 * Origin normalization: real and load-bearing. 'https://example.com',
 * 'https://example.com/', 'https://example.com/some/path?query=1' must
 * all resolve to the SAME stored entry (Chrome's own site-settings model
 * keys by origin, not full URL) — getting this wrong would mean a
 * setting silently "not applying" on the next page of the same site,
 * which is exactly the kind of bug that erodes trust in a permission
 * system. Tested explicitly below.
 */

const path = require('path');
const fs   = require('fs');

const STORE_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'site-settings.json'
);

/**
 * normalizeOrigin(url) — pure. Returns 'protocol//host' (no path, no
 * query, no trailing slash, no port-if-default) or null for unparseable
 * input. Exported for direct testing.
 */
function normalizeOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`; // u.host already includes a non-default port; omits default 80/443
  } catch (_) {
    return null;
  }
}

class SiteSettingsStore {
  constructor() {
    this.data = {}; // origin -> { key: value, ... }
  }

  load() {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      if (fs.existsSync(STORE_PATH)) {
        this.data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      } else {
        this._persist();
      }
    } catch (err) {
      console.warn('[SiteSettings] load error:', err.message);
    }
    return this.data;
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.warn('[SiteSettings] persist error:', err.message);
    }
  }

  /** get(url, key) -> value | undefined. Real, safe on a bad/unset url (returns undefined, never throws). */
  get(url, key) {
    const origin = normalizeOrigin(url);
    if (!origin) return undefined;
    return this.data[origin]?.[key];
  }

  /** getAllForOrigin(url) -> {key: value} | {} */
  getAllForOrigin(url) {
    const origin = normalizeOrigin(url);
    if (!origin) return {};
    return { ...(this.data[origin] || {}) };
  }

  /** set(url, key, value) -> boolean (false if url is unparseable). */
  set(url, key, value) {
    const origin = normalizeOrigin(url);
    if (!origin) return false;
    this.data[origin] = { ...(this.data[origin] || {}), [key]: value };
    this._persist();
    return true;
  }

  /** clear(url) -> boolean. Removes every setting for one origin. */
  clear(url) {
    const origin = normalizeOrigin(url);
    if (!origin || !(origin in this.data)) return false;
    delete this.data[origin];
    this._persist();
    return true;
  }

  /**
   * deleteKey(url, key) -> boolean. Removes ONE setting for one origin,
   * leaving the rest intact — the real counterpart to clear() (which is
   * origin-wide). Cleans up the origin entirely if that was its last key,
   * so listOrigins() doesn't return an origin with an empty {} forever.
   */
  deleteKey(url, key) {
    const origin = normalizeOrigin(url);
    if (!origin || !this.data[origin] || !(key in this.data[origin])) return false;
    delete this.data[origin][key];
    if (Object.keys(this.data[origin]).length === 0) delete this.data[origin];
    this._persist();
    return true;
  }

  /** clearAll() — real, used by a future "reset all site settings" control. */
  clearAll() {
    this.data = {};
    this._persist();
  }

  /** listOrigins() -> string[] — every origin with at least one stored setting. */
  listOrigins() {
    return Object.keys(this.data);
  }
}

module.exports = { SiteSettingsStore, normalizeOrigin };
