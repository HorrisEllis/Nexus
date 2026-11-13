/**
 * vault/key-slots.js
 * COMPARTMENT OS — Key Slots (AC6, docs/2026-11-13-one-place-for-accounts-phasemap.spec)
 *
 * James, 2026-11-13: "what about a sign in like an account? then cos' vault keeps a backup of the key?" and,
 * weighing rsa2048/a keypair/backup codes: "Windows authentication... backup codes... a keypair?"
 *
 * The problem this answers: cos/vault/crypto.js's own header already flags it — "the 256-bit master key [is]
 * generated once and stored in a local file... anyone with filesystem read access to that one file can decrypt
 * everything." One file, one secret, no backup, no recovery. This is the fix: the real root key is never stored
 * as plain bytes. It is wrapped — encrypted — under one or more SLOTS, the same idea BitLocker/LUKS use for disk
 * encryption: any ONE slot's secret opens the root key; losing a slot (forgetting the password) costs nothing as
 * long as another slot (a recovery code) still works; a slot can be added or removed without touching the data
 * the root key protects, because the root key itself never changes — only how it is wrapped.
 *
 * Built now: a PASSWORD slot (a password you choose) and a RECOVERY slot (a code generated once and shown to you
 * to write down — the backup). Documented, not built this slice: a Windows Hello / DPAPI slot, and a recovery-
 * keypair slot (a private key held offline opens it; AC_D1's reading (c) for sharing). Both fit the same
 * `{ unwrap(secret) }` shape below — adding one is a new slot type, not a redesign.
 *
 * Reuses cos/vault/crypto.js's real AES-256-GCM cipher (encryptWithKey/decryptWithKey) for the wrapping itself —
 * no second cipher implementation. The one new primitive here is the password → key step: Node's built-in
 * crypto.scrypt (a real, audited key-derivation function — no new dependency, no hand-rolled hashing).
 *
 *   generateRecoveryCode()                  → a human-writable code (shown once; never stored in plaintext)
 *   wrapRootKey(rootKey, secret)             → one slot: { salt, iv, authTag, ciphertext } (secret never stored)
 *   unwrapRootKey(slot, secret)              → the root key Buffer, or throws 'wrong password or code' (never more)
 *   createSlots(rootKey, password)           → { password: slot, recovery: slot }, { recoveryCode } shown once
 *   openSlots(slots, { password, recoveryCode }) → the root key Buffer, trying whichever secret was given
 */
'use strict';

const crypto = require('crypto');
const { encryptWithKey, decryptWithKey } = require('./crypto.js');

const SALT_BYTES = 16;
const SCRYPT_KEYLEN = 32;   // 256-bit, matching the AES-256-GCM key size this wraps
// N (cost) 2**15, r 8, p 1 — scrypt's own recommended "interactive" floor is N=2**14; one notch above it, because
// this key is worth protecting and is derived once per process-unlock, not once per request.
const SCRYPT_OPTS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** a password/code → a 32-byte key, salted per slot so two slots never derive the same bytes from the same secret */
function _deriveKey(secret, saltHex) {
  if (typeof secret !== 'string' || !secret) throw new Error('key-slots: a secret (password or recovery code) is required');
  return crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN, SCRYPT_OPTS);
}

/** a code meant to be written down: 6 groups of 4 base32 characters (no 0/O/1/I — easy to tell apart by hand) */
function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) { out += alphabet[bytes[i] % alphabet.length]; if (i % 4 === 3 && i < 23) out += '-'; }
  return out;
}

/** wrap the root key under one secret. The slot records nothing about what kind of secret it is — the caller
 *  (openSlots, below) tries a named slot by its key in the slots object, e.g. slots.password, slots.recovery. */
function wrapRootKey(rootKey, secret) {
  if (!Buffer.isBuffer(rootKey) || rootKey.length !== 32) throw new Error('key-slots: rootKey must be a 32-byte Buffer');
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const slotKey = _deriveKey(secret, salt);
  return { salt, ...encryptWithKey(rootKey.toString('hex'), slotKey) };
}

/** unwrap a slot with its secret. A wrong secret fails the AEAD auth tag check — the same 'wrong password or
 *  code' is said either way, never 'wrong password' vs 'corrupted slot': that distinction would tell an attacker
 *  which guesses were close. */
function unwrapRootKey(slot, secret) {
  if (!slot || typeof slot.salt !== 'string') throw new Error('key-slots: not a slot');
  const slotKey = _deriveKey(secret, slot.salt);
  try { return Buffer.from(decryptWithKey(slot, slotKey), 'hex'); }
  catch (_) { throw new Error('wrong password or code'); }
}

/** a brand-new root key, wrapped under a password slot and a freshly generated recovery slot.
 *  @returns {{ rootKey: Buffer, slots: { password: object, recovery: object }, recoveryCode: string }}
 *  recoveryCode is given back ONCE — show it to him and never log or persist it in the clear. */
function createSlots(rootKey, password) {
  const recoveryCode = generateRecoveryCode();
  return {
    rootKey,
    slots: { password: wrapRootKey(rootKey, password), recovery: wrapRootKey(rootKey, recoveryCode) },
    recoveryCode,
  };
}

/** open with ONE secret, tried against EVERY slot until one unwraps — never by guessing which named key
 *  ("password", "recovery", a later "windows_hello"…) the secret must belong to. This is what makes "any one
 *  slot opens it" true for a slot added after the fact (AC6's "second" slot, say): a caller does not need to
 *  know the new slot's name, only that it has a secret that should open the vault. The cost is a few extra
 *  failed scrypt derivations when a vault has several slots — cheap next to getting this wrong (a found bug:
 *  an earlier version of this function matched a secret to a slot BY NAME, so a secret for any slot but
 *  "password" or "recovery" could never open the vault at all). */
function openSlots(slots, secret) {
  if (secret == null) throw new Error('key-slots: a secret is required');
  for (const slot of Object.values(slots)) { try { return unwrapRootKey(slot, secret); } catch (_) { /* try the next slot */ } }
  throw new Error('wrong password or code');
}

/** add a new slot (e.g. a future Windows Hello / keypair slot) once already open with any existing secret — the
 *  root key is re-wrapped under the new secret; every existing slot, and everything the root key protects, is
 *  untouched. */
function addSlot(slots, openWithSecret, name, newSecret) {
  const rootKey = openSlots(slots, openWithSecret);
  return { ...slots, [name]: wrapRootKey(rootKey, newSecret) };
}

module.exports = { generateRecoveryCode, wrapRootKey, unwrapRootKey, createSlots, openSlots, addSlot };
