/**
 * vault/store.js
 * COMPARTMENT OS — Encrypted Vault Store (Phase 28, spec §52)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * The on-disk store is keyed by VaultEntryID -> { iv, authTag, ciphertext }.
 * It holds ONLY encrypted values — no key names, no scope, no grants.
 * That metadata lives in SystemMap.vaultKeys (already wired in the
 * foundation bump), which is the spec's own split: "value is NEVER
 * present in SystemMap or any log."
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { COS_VAULT_STORE_FILE } = require('../foundation/constants.js');
const { encrypt, decrypt } = require('./crypto.js');

/**
 * @param {string} storeFile
 * @returns {Record<string, {iv:string, authTag:string, ciphertext:string}>}
 */
function readStore(storeFile = COS_VAULT_STORE_FILE) {
  if (!fs.existsSync(storeFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  } catch {
    return {}; // corrupted store file — fail safe to empty, don't crash the host
  }
}

/**
 * @param {Record<string, object>} data
 * @param {string} storeFile
 */
function writeStore(data, storeFile = COS_VAULT_STORE_FILE) {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(data), { mode: 0o600 });
}

/**
 * @param {string} entryId
 * @param {string} plaintextValue
 * @param {{ storeFile?: string, keyFile?: string }} opts
 */
function putEncryptedValue(entryId, plaintextValue, opts = {}) {
  const storeFile = opts.storeFile || COS_VAULT_STORE_FILE;
  const data = readStore(storeFile);
  data[entryId] = encrypt(plaintextValue, opts.keyFile);
  writeStore(data, storeFile);
}

/**
 * @param {string} entryId
 * @param {{ storeFile?: string, keyFile?: string }} opts
 * @returns {string|null} plaintext, or null if no such entry
 */
function getDecryptedValue(entryId, opts = {}) {
  const storeFile = opts.storeFile || COS_VAULT_STORE_FILE;
  const data = readStore(storeFile);
  if (!(entryId in data)) return null;
  return decrypt(data[entryId], opts.keyFile);
}

/**
 * @param {string} entryId
 * @param {{ storeFile?: string }} opts
 */
function deleteEncryptedValue(entryId, opts = {}) {
  const storeFile = opts.storeFile || COS_VAULT_STORE_FILE;
  const data = readStore(storeFile);
  delete data[entryId];
  writeStore(data, storeFile);
}

module.exports = {
  readStore,
  writeStore,
  putEncryptedValue,
  getDecryptedValue,
  deleteEncryptedValue,
};
