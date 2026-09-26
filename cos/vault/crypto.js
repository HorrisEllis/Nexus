/**
 * vault/crypto.js
 * COMPARTMENT OS — Vault Encryption (Phase 28, spec §52)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SECURITY MODEL, FLAGGED EXPLICITLY (this was an explicit decision, not
 * a silent default):
 *   Spec §65 (TPM) describes the vault master key as TPM-sealed, with
 *   Windows DPAPI as the fallback when no TPM is present. Neither TPM nor
 *   DPAPI is reachable from Node without native bindings, and this dev
 *   environment has neither hardware nor Windows to bind to anyway.
 *
 *   What's built: a real AES-256-GCM cipher (Node's built-in `crypto`,
 *   not a toy substitute), with the 256-bit master key generated once
 *   and stored in a local file. This is genuinely weaker than TPM/DPAPI
 *   binding — anyone with filesystem read access to that one file can
 *   decrypt everything. That's the honest tradeoff of "no hardware
 *   binding," not a flaw hidden behind the word "encrypted." TPM binding
 *   (§65) is the seam to harden this later: swap getOrCreateMasterKey()'s
 *   internals for a TPM-sealed key, keep encrypt()/decrypt()'s signatures.
 *
 *   The key file is written with mode 0600 on POSIX. Windows ACLs aren't
 *   settable from Node without native bindings either — on win32 this is
 *   a plain file with whatever permissions the user's account default
 *   gives it. Flagged, not hidden.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { COS_VAULT_DIR, COS_VAULT_KEY_FILE } = require('../foundation/constants.js');

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12;  // 96 bits, standard for GCM

const _keyCache = new Map(); // keyFilePath -> Buffer

/**
 * Returns the vault master key, generating and persisting one on first
 * use. Cached in memory per key-file-path after the first read.
 * @param {string} [keyFilePath]  defaults to the real COS_VAULT_KEY_FILE —
 *        tests pass their own path for isolation, same pattern createHost()
 *        uses for stateFile/mapFile.
 * @returns {Buffer}
 */
function getOrCreateMasterKey(keyFilePath = COS_VAULT_KEY_FILE) {
  if (_keyCache.has(keyFilePath)) return _keyCache.get(keyFilePath);

  fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });

  if (fs.existsSync(keyFilePath)) {
    const key = Buffer.from(fs.readFileSync(keyFilePath, 'utf8').trim(), 'hex');
    _keyCache.set(keyFilePath, key);
    return key;
  }

  const key = crypto.randomBytes(KEY_BYTES);
  fs.writeFileSync(keyFilePath, key.toString('hex'), { mode: 0o600 });
  try { fs.chmodSync(keyFilePath, 0o600); } catch { /* best-effort on platforms without POSIX perms */ }
  _keyCache.set(keyFilePath, key);
  return key;
}

/**
 * @param {string} plaintext
 * @param {string} [keyFilePath]
 * @returns {{ iv: string, authTag: string, ciphertext: string }}  all hex-encoded
 */
function encrypt(plaintext, keyFilePath = COS_VAULT_KEY_FILE) {
  const key = getOrCreateMasterKey(keyFilePath);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), authTag: authTag.toString('hex'), ciphertext: ciphertext.toString('hex') };
}

/**
 * @param {{ iv: string, authTag: string, ciphertext: string }} encrypted
 * @param {string} [keyFilePath]
 * @returns {string} plaintext
 * @throws if the authTag doesn't verify — tampered or wrong key
 */
function decrypt(encrypted, keyFilePath = COS_VAULT_KEY_FILE) {
  const key = getOrCreateMasterKey(keyFilePath);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * Test-only escape hatch — clears the in-memory key cache for one path
 * (or all paths if none given) so a test can verify fresh-key generation
 * behavior.
 * @param {string} [keyFilePath]
 */
function _resetKeyCacheForTests(keyFilePath) {
  if (keyFilePath) _keyCache.delete(keyFilePath);
  else _keyCache.clear();
}

module.exports = {
  getOrCreateMasterKey,
  encrypt,
  decrypt,
  _resetKeyCacheForTests,
};
