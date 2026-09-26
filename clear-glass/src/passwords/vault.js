'use strict';
/**
 * src/passwords/vault.js — Real Encrypted Password Vault
 * UUID: cg-password-vault-v1-0000-0000-000000000009
 *
 * Real gap named directly in CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's
 * §7: "Zero real code anywhere. Genuinely new — credential storage,
 * autofill detection, a real UI." The cookie vault (clear-glass/seam/,
 * per-agent, encrypted) is real infrastructure for a DIFFERENT kind of
 * secret; passwords need their own real, separate design.
 *
 * §CRYPTO REUSE, NOT REINVENTION — same AES-256-GCM pattern as
 * src/cookies/vault.js (CookieVault), read directly before writing this:
 * key = sha256(passphrase), random IV per encryption, auth tag stored
 * alongside ciphertext. Not sharing code (CookieVault is real, working,
 * in-production code with its own callers — refactoring it to extract a
 * shared crypto helper is real, legitimate follow-up work, but touching
 * working production code as an unrequested side effect of building
 * something new carries real risk this pass doesn't need to take).
 * Parallel construction, same proven algorithm, separate module.
 *
 * §SAME HONEST CAVEAT AS COOKIEVAULT — the passphrase is a fixed string,
 * not yet derived from machine ID (CookieVault's own vault.js has the
 * identical 'TODO: derive from machine ID' left in place; this file
 * doesn't pretend to have solved a problem the vault it's modeled on
 * hasn't solved either).
 *
 * §DESIGN — list() never decrypts. It returns {id, origin, username,
 * createdAt, updatedAt} for UI display — a password list panel showing
 * every saved account doesn't need every plaintext password in memory at
 * once. get(origin) decrypts only the entries actually being offered for
 * autofill on that specific origin.
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { normalizeOrigin } = require('../site-settings/store');

const VAULT_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'passwords');
// §CLOSED 2026-09-23 — legacy key only now (see src/security/vault-key.js).
const VAULT_KEY  = 'clear-glass-password-vault-key-v1';
const { loadVaultKey, encryptWith, decryptWithFallback } = require('../security/vault-key');

class PasswordVault {
  constructor({ dir = VAULT_DIR, safeStorage } = {}) {
    this.entries = []; // [{id, origin, username, encrypted:{iv,tag,data}, createdAt, updatedAt}]
    this.dir = dir;
    this.path = path.join(dir, 'passwords.json');
    this._safeStorage = safeStorage;
    this._k = { key: this._deriveKey(VAULT_KEY), legacyKey: this._deriveKey(VAULT_KEY), source: 'legacy', reason: 'load() not yet run' };
    this.key = this._k.key;
  }

  keyStatus() { return { source: this._k.source, reason: this._k.reason || null }; }

  load() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this._k = loadVaultKey({ name: 'password-vault', legacyPassphrase: VAULT_KEY, dir: this.dir, safeStorage: this._safeStorage });
      this.key = this._k.key;
      if (fs.existsSync(this.path)) {
        this.entries = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      } else {
        this._persist();
      }
    } catch (err) {
      console.warn('[PasswordVault] load error:', err.message);
    }
    return this.entries;
  }

  _persist() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.warn('[PasswordVault] persist error:', err.message);
    }
  }

  /**
   * save(origin, username, password) -> the stored record's public shape
   * (no plaintext password in the return value). If an entry for this
   * exact origin+username already exists, it's UPDATED (password
   * rotated), not duplicated — real, matches every real browser's
   * password-manager behavior.
   */
  save(origin, username, password) {
    if (!origin || !username || typeof password !== 'string') {
      throw new Error('PasswordVault.save requires origin, username, and password');
    }
    // §BUGFIX 2026-08-24 — found before shipping, same class of bug
    // already fixed once this session for site-settings: without
    // normalization, saving from 'https://x.com/login' and looking up
    // from 'https://x.com/' would silently never match. Reusing the
    // already-tested normalizeOrigin rather than risking the same bug
    // twice.
    const normalized = normalizeOrigin(origin) || origin;
    const encrypted = this._encrypt(password);
    const existing = this.entries.find(e => e.origin === normalized && e.username === username);
    if (existing) {
      existing.encrypted = encrypted;
      existing.updatedAt = Date.now();
      this._persist();
      return this._publicShape(existing);
    }
    const record = {
      id: `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      origin: normalized, username, encrypted,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.entries.push(record);
    this._persist();
    return this._publicShape(record);
  }

  /** get(origin) -> [{id, origin, username, password}] — decrypted, only for this origin. */
  get(origin) {
    const normalized = normalizeOrigin(origin) || origin;
    return this.entries
      .filter(e => e.origin === normalized)
      .map(e => ({ id: e.id, origin: e.origin, username: e.username, password: this._decrypt(e.encrypted) }));
  }

  /** list() -> [{id, origin, username, createdAt, updatedAt}] — NEVER decrypts. */
  list() {
    return this.entries.map(e => this._publicShape(e));
  }

  /** delete(id) -> boolean */
  delete(id) {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.id !== id);
    if (this.entries.length !== before) { this._persist(); return true; }
    return false;
  }

  _publicShape(e) {
    return { id: e.id, origin: e.origin, username: e.username, createdAt: e.createdAt, updatedAt: e.updatedAt };
  }

  _deriveKey(passphrase) {
    return crypto.createHash('sha256').update(passphrase).digest();
  }

  _encrypt(plaintext) { return encryptWith(this._k.key, plaintext); }

  _decrypt(blob) { return decryptWithFallback(this._k, blob); }
}

module.exports = { PasswordVault };
