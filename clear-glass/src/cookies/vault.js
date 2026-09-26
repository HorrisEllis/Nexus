'use strict';

/**
 * Cookie Vault
 * Encrypted per-agent cookie storage with versioned snapshots.
 * Supports save, restore, snapshot, and diff for RAID fallback routing.
 * Cortex events on every state change.
 *
 * §JAA 0.39.243 — James: "use jaa for the database" (then "yes jaa" for this
 * vault). Storage is a JaaStore (guardian/jaa-store.js — pure JS, the store every
 * NEXUS system runs on) in <vault>/jaa/, two tables:
 *   cookie_snapshots  { id: '<agent>:<version>', agent_id, version, ts, label, data }
 *   account_cookies   { id: '<agent>|<account>|<domain>', agent_id, account_id, domain, data, count, updated_at }
 * `data` is the same encrypted blob as before (vault-key.js; never plaintext on
 * disk). Before this, better-sqlite3 was tried first and — absent on every real
 * install — a loose-file store ran instead (account-*.json, <agent>-<n>.json).
 * Those files are imported into JAA (snapshots on open, an account on its first
 * read) and left where they are.
 */

const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const VAULT_DIR  = path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'vault');
// §CLOSED 2026-09-23 — the old 'TODO: derive from machine ID'. This string is
// now only the LEGACY key (kept so records written before the fix stay
// readable); new writes use a random key sealed by Electron safeStorage —
// see src/security/vault-key.js.
const VAULT_KEY  = 'clear-glass-vault-key-v1';
const { loadVaultKey, encryptWith, decryptWithFallback } = require('../security/vault-key');
const T_SNAP = 'cookie_snapshots', T_ACCT = 'account_cookies';

class CookieVault {
  // noSqlite: accepted and ignored since 0.39.243 (there is no SQLite path any more).
  constructor({ dir = VAULT_DIR, safeStorage } = {}) {
    this.snapshots = new Map();   // agentId → [{ ts, cookies }]
    this.dir       = dir;
    this._safeStorage = safeStorage;
    this._store    = null;        // JaaStore, opened on first use (save() may run before init())
    // Usable before init() (legacy key) so nothing that constructs-then-uses
    // without awaiting init() breaks; init() upgrades it to the sealed key.
    this._k = { key: this._deriveKey(VAULT_KEY), legacyKey: this._deriveKey(VAULT_KEY), source: 'legacy', reason: 'init() not yet run' };
    this.key = this._k.key;
  }

  keyStatus() { return { source: this._k.source, reason: this._k.reason || null }; }

  async init() {
    fs.mkdirSync(this.dir, { recursive: true });
    this._k = loadVaultKey({ name: 'cookie-vault', legacyPassphrase: VAULT_KEY, dir: this.dir, safeStorage: this._safeStorage });
    this.key = this._k.key;
    this._jaa();
  }

  /** The JAA store; opened (and legacy files imported) on first use. */
  _jaa() {
    if (this._store) return this._store;
    const { JaaStore } = require('../../../guardian/jaa-store.js');
    fs.mkdirSync(this.dir, { recursive: true });
    this._store = new JaaStore(path.join(this.dir, 'jaa'), { tables: [T_SNAP, T_ACCT], settings: false });
    const imported = this._importLegacyFiles();
    if (imported) console.log(`[CookieVault] imported ${imported} file-store record(s) into JAA (files left in place)`);
    return this._store;
  }

  /** One-time, idempotent: account-*.json and <agent>-<n>.json → JAA rows. Encrypted blobs copied as-is. */
  _importLegacyFiles() {
    let n = 0;
    let names; try { names = fs.readdirSync(this.dir); } catch (_) { return 0; }
    const st = this._store;
    for (const name of names) {
      const file = path.join(this.dir, name);
      try {
        // account-*.json: imported on first read by exact name (_legacyAccount) — the name alone can't be split
        // back into agent and account when either contains '-'.
        let m;
        m = /^(.+)-(\d+)\.json$/.exec(name);
        if (m && !name.startsWith('account-')) {
          const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (!rec || !rec.iv || !rec.data) continue;
          const agentId = m[1], version = Number(m[2]);
          if (st.count(T_SNAP, { agent_id: agentId, version })) continue;
          st.insert(T_SNAP, { id: `${agentId}:${version}`, agent_id: agentId, version, ts: rec.ts || 0, label: rec.label || `snapshot-${version}`,
            data: JSON.stringify({ iv: rec.iv, tag: rec.tag, data: rec.data }), importedFrom: name });
          n++;
        }
      } catch (_) { /* an unreadable legacy file is left untouched on disk */ }
    }
    if (n) st.flushAll();
    return n;
  }

  /** A pre-JAA account file for exactly this agent+account, imported into JAA on first touch (file left in place). */
  _legacyAccount(agentId, accountId) {
    const st = this._jaa();
    if (st.count(T_ACCT, { agent_id: agentId, account_id: accountId })) return;
    const f = this._accountFile(agentId, accountId);
    if (!fs.existsSync(f)) return;
    try {
      const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!rec || !rec.encrypted) return;
      const domain = rec.domain || '*';
      st.insert(T_ACCT, { id: `${agentId}|${accountId}|${domain}`, agent_id: agentId, account_id: accountId, domain,
        data: JSON.stringify(rec.encrypted), count: rec.count ?? null, updated_at: rec.ts || 0, importedFrom: path.basename(f) });
      st.flushAll();
    } catch (_) { /* unreadable legacy file: left untouched */ }
  }

  // ── Snapshot current session cookies ────────────────────────────────
  async snapshot(agentId, ses, label = null) {
    try {
      const cookies = await ses.cookies.get({});
      const version = this._nextVersion(agentId);
      const entry   = {
        agentId,
        version,
        ts:      Date.now(),
        label:   label || `snapshot-${version}`,
        cookies,
      };

      const encrypted = this._encrypt(JSON.stringify(cookies));
      const st = this._jaa();
      st.insert(T_SNAP, { id: `${agentId}:${version}`, agent_id: agentId, version, ts: entry.ts, label: entry.label, data: JSON.stringify(encrypted) });
      st.flushAll();

      // Keep in-memory cache of last 3 snapshots per agent
      if (!this.snapshots.has(agentId)) this.snapshots.set(agentId, []);
      const snaps = this.snapshots.get(agentId);
      snaps.push(entry);
      if (snaps.length > 3) snaps.shift();

      return { version, ts: entry.ts, count: cookies.length };
    } catch (err) {
      console.error('[CookieVault] Snapshot error:', err.message);
      return null;
    }
  }

  // ── Save named account cookies ────────────────────────────────────────
  async save({ agentId, accountId, domain, cookies }) {
    if (!agentId || !accountId) throw new Error('agentId and accountId required');
    const encrypted = this._encrypt(JSON.stringify(cookies || []));
    const d = domain || '*';
    const st = this._jaa();
    st.upsert(T_ACCT, { id: `${agentId}|${accountId}|${d}`, agent_id: agentId, account_id: accountId, domain: d,
      data: JSON.stringify(encrypted), count: (cookies || []).length, updated_at: Date.now() });
    st.flushAll();
    return { ok: true, agentId, accountId };
  }

  // ── Restore cookies into session ──────────────────────────────────────
  async restore({ agentId, accountId, version, ses }) {
    let cookies = [];

    if (accountId) {
      // Restore named account cookies
      cookies = await this._loadAccountCookies(agentId, accountId);
    } else {
      // Restore snapshot version
      cookies = await this._loadSnapshot(agentId, version);
    }

    if (!ses) return { cookies, restored: false, reason: 'no session provided' };

    // Clear existing cookies for these domains
    const domains = [...new Set(cookies.map(c => c.domain).filter(Boolean))];
    for (const domain of domains) {
      await ses.cookies.remove(`https://${domain.replace(/^\./, '')}`, '').catch(() => {});
    }

    // Set restored cookies
    let restored = 0;
    for (const cookie of cookies) {
      try {
        await ses.cookies.set({
          url:      `https://${cookie.domain?.replace(/^\./, '') || 'localhost'}`,
          name:     cookie.name,
          value:    cookie.value,
          domain:   cookie.domain,
          path:     cookie.path || '/',
          secure:   cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: cookie.expirationDate,
        });
        restored++;
      } catch {}
    }

    return { restored, total: cookies.length };
  }

  // ── List snapshots ────────────────────────────────────────────────────
  listSnapshots(agentId) {
    return this._jaa().all(T_SNAP, { agent_id: agentId }, { orderBy: 'ts', order: 'DESC', limit: 20 })
      .map(r => ({ id: r.id, agent_id: r.agent_id, version: r.version, ts: r.ts, label: r.label }));
  }

  // ── Health check — token validity heuristic ───────────────────────────
  async checkTokenHealth(agentId, ses) {
    if (!ses) return { healthy: false };
    try {
      const cookies = await ses.cookies.get({});
      const sessionCookies = cookies.filter(c =>
        c.name.match(/sess|token|auth|jwt|sid/i) && !c.expirationDate
      );
      const expiredCookies = cookies.filter(c =>
        c.expirationDate && c.expirationDate * 1000 < Date.now()
      );
      return {
        healthy:        expiredCookies.length === 0,
        total:          cookies.length,
        sessionTokens:  sessionCookies.length,
        expired:        expiredCookies.length,
      };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────
  async _loadSnapshot(agentId, version) {
    // Try memory cache first
    const cached = this.snapshots.get(agentId);
    if (cached) {
      const snap = version
        ? cached.find(s => s.version === version)
        : cached[cached.length - 1];
      if (snap) return snap.cookies || [];
    }
    const st = this._jaa();
    const row = version
      ? st.get(T_SNAP, { agent_id: agentId, version: Number(version) })
      : st.all(T_SNAP, { agent_id: agentId }, { orderBy: 'version', order: 'DESC', limit: 1 })[0];
    return row ? JSON.parse(this._decrypt(JSON.parse(row.data))) : [];
  }

  async _loadAccountCookies(agentId, accountId) {
    this._legacyAccount(agentId, accountId);
    const row = this._jaa().all(T_ACCT, { agent_id: agentId, account_id: accountId }, { orderBy: 'updated_at', order: 'DESC', limit: 1 })[0];
    return row ? JSON.parse(this._decrypt(JSON.parse(row.data))) : [];
  }

  _accountFile(agentId, accountId) {   // the pre-JAA file store's path; used only to remove a legacy file on delete
    const safe = (v) => String(v).replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.dir, `account-${safe(agentId)}-${safe(accountId)}.json`);
  }

  /** accountMeta(agentId, accountId) — never decrypts: {stored, updatedAt, count|null}. */
  accountMeta(agentId, accountId) {
    this._legacyAccount(agentId, accountId);
    const rows = this._jaa().all(T_ACCT, { agent_id: agentId, account_id: accountId }, { orderBy: 'updated_at', order: 'DESC' });
    if (!rows.length) return { stored: false, updatedAt: null, count: null };
    return { stored: true, updatedAt: rows[0].updated_at || null, count: rows[0].count ?? null };
  }

  /** deleteAccountCookies(agentId, accountId) — real removal of one account's saved session. */
  deleteAccountCookies(agentId, accountId) {
    if (!agentId || !accountId) throw new Error('agentId and accountId required');
    const st = this._jaa();
    const removed = st.delete(T_ACCT, { agent_id: agentId, account_id: accountId });
    st.flushAll();
    // A legacy file would be re-imported on the next start, resurrecting the session — remove it too.
    const f = this._accountFile(agentId, accountId);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return { ok: true, agentId, accountId, removed };
  }

  _nextVersion(agentId) {
    const top = this._jaa().all(T_SNAP, { agent_id: agentId }, { orderBy: 'version', order: 'DESC', limit: 1 })[0];
    const mem = this.snapshots.get(agentId) || [];
    return Math.max(top ? top.version : 0, mem.length ? mem[mem.length - 1].version : 0) + 1;
  }

  _deriveKey(passphrase) {
    return crypto.createHash('sha256').update(passphrase).digest();
  }

  _encrypt(plaintext) { return encryptWith(this._k.key, plaintext); }

  _decrypt(blob) { return decryptWithFallback(this._k, blob); }
}

module.exports = CookieVault;
