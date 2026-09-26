'use strict';
/**
 * src/security/vault-key.js — one real key source for every clear-glass vault
 * UUID: cg-vault-key-v1-0000-0000-000000000031
 *
 * §BUILT 2026-09-23 — James: "yes clearglass" (Clear Glass owns accounts;
 * login portals put real provider sessions and optional app passwords into
 * the vaults). Both vaults (src/cookies/vault.js, src/passwords/vault.js)
 * derived their AES-256-GCM key from a hardcoded string with a
 * "TODO: derive from machine ID" beside it — anyone holding the source could
 * decrypt either file. That TODO is closed here, once, for both.
 *
 * Mechanism: a random 32-byte data key per vault, sealed at rest with
 * Electron's safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on
 * Linux) in <dir>/<name>.key. Nothing about the key is derivable from source.
 *
 * Migration (§0.3 nothing gets lost): data written under the old hardcoded
 * key stays readable — decrypt() tries the sealed key first and the legacy
 * key second. Every NEW write uses the sealed key, so each record migrates
 * the next time it is saved. No bulk rewrite, no window where data is
 * unreadable.
 *
 * §1.2 — when safeStorage is not available (plain Node, a test, a Linux box
 * with no keyring) this does NOT silently pretend to be secure: it returns
 * source:'legacy' with a reason, logs it loudly, and status() reports it so
 * the Settings page can show "vault key: legacy (not OS-sealed)".
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function _safeStorage(explicit) {
  if (explicit !== undefined) return explicit;
  try { return require('electron').safeStorage || null; } catch (_) { return null; }
}

/**
 * loadVaultKey({name, legacyPassphrase, dir, safeStorage?, log?})
 *   -> { key, legacyKey, source: 'safeStorage'|'legacy', reason|null, keyPath }
 */
function loadVaultKey({ name, legacyPassphrase, dir, safeStorage, log = console.warn } = {}) {
  if (!name || !legacyPassphrase || !dir) throw new Error('loadVaultKey needs name, legacyPassphrase and dir');
  const legacyKey = crypto.createHash('sha256').update(legacyPassphrase).digest();
  const keyPath   = path.join(dir, `${name}.key`);
  const ss        = _safeStorage(safeStorage);

  let available = false;
  try { available = !!(ss && ss.isEncryptionAvailable && ss.isEncryptionAvailable()); } catch (_) { available = false; }
  if (!available) {
    const reason = ss ? 'safeStorage reports encryption unavailable (no OS keyring?)' : 'electron safeStorage not present (not running inside Electron)';
    log(`[vault-key] ${name}: using LEGACY hardcoded key — ${reason}`);
    return { key: legacyKey, legacyKey, source: 'legacy', reason, keyPath };
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(keyPath)) {
      const hex = ss.decryptString(fs.readFileSync(keyPath));
      const key = Buffer.from(hex, 'hex');
      if (key.length !== 32) throw new Error(`sealed key has ${key.length} bytes, expected 32`);
      return { key, legacyKey, source: 'safeStorage', reason: null, keyPath };
    }
    const key = crypto.randomBytes(32);
    const tmp = keyPath + '.tmp';
    fs.writeFileSync(tmp, ss.encryptString(key.toString('hex')));
    fs.renameSync(tmp, keyPath);
    return { key, legacyKey, source: 'safeStorage', reason: null, keyPath };
  } catch (err) {
    // A sealed key that exists but cannot be opened (different OS user, keyring
    // reset) is serious: data sealed with it is unreadable. Say so; do not mint
    // a new key over it (that would orphan the old data for good).
    const reason = `sealed key at ${keyPath} could not be used: ${err.message}`;
    log(`[vault-key] ${name}: ${reason} — falling back to LEGACY key; the sealed file is left untouched`);
    return { key: legacyKey, legacyKey, source: 'legacy', reason, keyPath };
  }
}

function encryptWith(key, plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: enc };
}

function _decryptOne(key, { iv, tag, data }) {
  const d = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  let out = d.update(data, 'hex', 'utf8');
  out += d.final('utf8');
  return out;
}

/** decryptWithFallback(k, blob) — sealed key first, legacy second; throws if neither opens it. */
function decryptWithFallback(k, blob) {
  try { return _decryptOne(k.key, blob); }
  catch (first) {
    if (k.legacyKey && !k.legacyKey.equals(k.key)) {
      try { return _decryptOne(k.legacyKey, blob); } catch (_) { /* fall through */ }
    }
    throw new Error(`vault record could not be decrypted with the current or legacy key: ${first.message}`);
  }
}

module.exports = { loadVaultKey, encryptWith, decryptWithFallback, ALGORITHM };
