/**
 * vault/keyring.js
 * COMPARTMENT OS — the Keyring (AC6, docs/2026-11-13-one-place-for-accounts-phasemap.spec)
 *
 * Ties key-slots.js (the pure wrap/unwrap math) to crypto.js's master key (the real AES-256-GCM key every
 * existing vault entry is already encrypted under) and to disk. This is the one new thing a caller needs to know
 * about: unlock({ password }) once per process, then every existing crypto.js / store.js call (encrypt, decrypt,
 * putEncryptedValue, getDecryptedValue — none of them changed) uses the unlocked key, same as always.
 *
 * Optional, by design (his "can this be optional?", asked of provider sign-in, applies here too): a caller that
 * never calls unlock() sees exactly today's behaviour — getOrCreateMasterKey() auto-creates a plain key file on
 * first use, as it always has. Nothing is forced to adopt key slots to keep working.
 *
 * MIGRATION, never silent: the first time unlock() is called and master.key already exists as a plain file (the
 * vault as it is today), that exact key is wrapped into a fresh keyring under the password you give — the same
 * AES key, so every entry already in store.json keeps decrypting with no re-encryption needed. The plaintext
 * master.key file is left exactly where it is; this never deletes it (§0.3, nothing lost unless redundant — a
 * person decides when the old file can go, not this code).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { COS_VAULT_KEY_FILE, COS_VAULT_KEYRING_FILE } = require('../foundation/constants.js');
const { primeMasterKey } = require('./crypto.js');
const slots = require('./key-slots.js');

// §1.2 — a keyring file that exists but will not parse is NEVER treated as "no keyring yet": that path would
// silently create and persist a brand-new root key over it, destroying access to every entry the real keyring
// protects. Only ENOENT (truly absent) reads as null; anything else throws, loudly, before any key is touched.
function _readKeyring(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`vault/keyring: ${file} could not be read (${e.message}) — refusing to treat this as no keyring`); }
  try { return JSON.parse(raw); } catch (e) { throw new Error(`vault/keyring: ${file} exists but will not parse (${e.message}) — refusing to overwrite it; restore it or move it aside yourself first`); }
}
function _writeKeyring(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch (_) { /* best-effort on platforms without POSIX perms */ }
}

/**
 * unlock({ password, recoveryCode, keyFile, keyringFile }) → { rootKey, created, migrated, recoveryCode }
 * - no keyring yet, a plain master.key exists → migrates it into slots under `password` (created once from the
 *   secret you give the FIRST time; after that, unlock again with the same password or the recovery code).
 * - no keyring yet, no master.key either → a brand-new vault, same migration path with a fresh random key.
 * - a keyring already exists → opens it with `password` or `recoveryCode` (wrong secret throws, nothing primed).
 * Either way the opened/created key is primed into crypto.js's cache for keyFile, so every existing call site
 * (encrypt/decrypt/putEncryptedValue/getDecryptedValue) now uses it with no further change.
 */
function unlock({ password, recoveryCode, keyFile = COS_VAULT_KEY_FILE, keyringFile = COS_VAULT_KEYRING_FILE } = {}) {
  const existing = _readKeyring(keyringFile);
  if (existing) {
    // tried against EVERY slot (key-slots.js openSlots), not matched to a slot by name — so a slot added later
    // (addSlot, any name) opens with its own secret here with no special-casing needed for its name.
    const rootKey = slots.openSlots(existing.slots, password != null ? password : recoveryCode);
    primeMasterKey(rootKey, keyFile);
    return { rootKey, created: false, migrated: false, recoveryCode: null };
  }
  if (password == null) throw new Error('vault/keyring: a password is required to create or migrate the keyring (recoveryCode alone cannot create one)');
  const migrating = fs.existsSync(keyFile);
  const rootKey = migrating ? Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex') : crypto.randomBytes(32);
  const made = slots.createSlots(rootKey, password);
  _writeKeyring(keyringFile, { v: 1, createdAt: Date.now(), slots: made.slots });
  primeMasterKey(rootKey, keyFile);
  return { rootKey, created: true, migrated: migrating, recoveryCode: made.recoveryCode };
}

/** true once a keyring exists — the vault is password/recovery-protected, not a bare key file */
function hasKeyring(keyringFile = COS_VAULT_KEYRING_FILE) { return fs.existsSync(keyringFile); }

/**
 * "just enough to get it integrated" (his, 2026-11-13) — every system that wants to protect something through the
 * vault calls this once at its own startup, instead of each wiring its own prompt or its own copy of unlock()'s
 * logic. It is the ONE lever: set COS_VAULT_PASSWORD once (the OS environment, or COS's own settings — COS's
 * supervisor already forwards its env to every system it spawns, so one setting reaches every process) and every
 * system that calls this gets the SAME root key, independently, with no process talking to another (AC_D1: a
 * library, never a service). Leave it unset and nothing here changes: no password, no keyring touched, no error
 * — a caller gets { ok:false } back and falls back to its own unprotected default, exactly as before this existed.
 * Never throws: a wrong password (a keyring exists under a DIFFERENT password than the one now in the env) comes
 * back as { ok:false, reason }, not an exception a caller must remember to catch.
 */
function unlockFromEnv({ envVar = 'COS_VAULT_PASSWORD', keyFile = COS_VAULT_KEY_FILE, keyringFile = COS_VAULT_KEYRING_FILE } = {}) {
  const password = process.env[envVar];
  if (!password) return { ok: false, reason: `${envVar} is not set` };
  try { return { ok: true, ...unlock({ password, keyFile, keyringFile }) }; }
  catch (e) { return { ok: false, reason: e.message }; }
}

/** add a slot (e.g. a future Windows Hello or recovery-keypair slot) once already unlocked this process */
function addSlot({ openWith, name, newSecret, keyringFile = COS_VAULT_KEYRING_FILE }) {
  const existing = _readKeyring(keyringFile);
  if (!existing) throw new Error('vault/keyring: no keyring to add a slot to — unlock() first to create one');
  const next = slots.addSlot(existing.slots, openWith.password != null ? openWith.password : openWith.recoveryCode, name, newSecret);
  _writeKeyring(keyringFile, { ...existing, slots: next });
  return true;
}

module.exports = { unlock, unlockFromEnv, hasKeyring, addSlot };
