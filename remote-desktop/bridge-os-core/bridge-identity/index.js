// Copyright (c) 2026 James Brooks. All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-identity/index.js
 * Public API: { Identity, KeyStore, loadOrInit, verifyHandshake }
 *
 * Usage:
 *   const { loadOrInit } = require('./bridge-identity');
 *   const identity = await loadOrInit({ dataDir, groupHint });
 *   identity.uuid         // → "a7f3c2d1-..."
 *   identity.handshake()  // → { uuid, publicKey, ts, sig }
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { Identity, verifyHandshake, deriveUUID } = require('./identity');
const { selectKeyStore, FileKeyStore, DPAPIKeyStore, PassphraseKeyStore } = require('./keystore/index');

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');

// ── Legacy keystore migration ──────────────────────────────────────────────
// A key file written by an older version of this app (machine-fingerprint
// FileKeyStore, or Windows DPAPI) has a different record shape than
// PassphraseKeyStore expects (no `salt` field, different `backend` tag).
// Pointing PassphraseKeyStore at one directly throws an opaque low-level
// Buffer error instead of failing safely — so this is handled explicitly:
// decrypt with whatever backend actually wrote the file, back the original
// up (never overwritten in place), re-encrypt with the new backend, and
// verify the migrated file decrypts back to the exact same key before
// trusting it. The backup is kept, not deleted — for identity material
// that may be the only copy someone has, "prompt cleanup" is a worse
// failure mode than "one extra file sitting on disk."
function migrateKeyStoreBackend({ keyPath, rawRecord, uuid, passphrase }) {
  let oldStore;
  if (rawRecord.backend === 'file')   oldStore = new FileKeyStore(keyPath);
  else if (rawRecord.backend === 'dpapi') oldStore = new DPAPIKeyStore(keyPath);
  else throw new Error(`[bridge-identity] Cannot migrate — unrecognized legacy keystore backend "${rawRecord.backend}"`);

  const privateKeyPem = oldStore.load(uuid); // decrypt with the scheme that actually wrote this file

  const backupPath = `${keyPath}.pre-passphrase-migration.${Date.now()}`;
  fs.copyFileSync(keyPath, backupPath);

  const newStore = new PassphraseKeyStore(keyPath, passphrase);
  newStore.save(uuid, privateKeyPem);

  // Verify before trusting: reload from the file we just wrote and confirm
  // it round-trips to the exact same key material.
  const verifyStore = new PassphraseKeyStore(keyPath, passphrase);
  const reloaded = verifyStore.load(uuid);
  if (reloaded !== privateKeyPem) {
    fs.copyFileSync(backupPath, keyPath); // restore — do not leave a half-migrated file in place
    throw new Error('[bridge-identity] Keystore migration verification failed — restored the previous file. No data was lost; the backup is intact.');
  }

  _log(`Identity keystore migrated: ${rawRecord.backend} → passphrase (previous file backed up to ${backupPath})`);
  return privateKeyPem;
}

// ── Load existing identity or generate new one ────────────────────────────────
async function loadOrInit({ dataDir = DEFAULT_DATA_DIR, groupHint = null, passphrase = null } = {}) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const publicFile = path.join(dataDir, 'identity.json');
  const keyPath     = path.join(dataDir, 'identity.key');

  const identity = new Identity();

  if (fs.existsSync(publicFile) && fs.existsSync(keyPath)) {
    // Existing identity — load and verify
    const publicRecord = JSON.parse(fs.readFileSync(publicFile, 'utf8'));

    // Peek at the on-disk record's backend tag before committing to a
    // keystore class, so a mismatch is handled deliberately (migrate, or
    // a clear error) instead of a cryptic crash three layers down.
    let rawRecord = null;
    try { rawRecord = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch { /* fall through to selectKeyStore's own error handling */ }

    let privateKeyPem;
    let keyStoreType;
    if (rawRecord && rawRecord.backend === 'passphrase' && !passphrase) {
      throw new Error('[bridge-identity] This identity is protected by a passphrase, but none was provided. Unlock the vault first.');
    } else if (rawRecord && passphrase && rawRecord.backend && rawRecord.backend !== 'passphrase') {
      privateKeyPem = migrateKeyStoreBackend({ keyPath, rawRecord, uuid: publicRecord.uuid, passphrase });
      keyStoreType = 'passphrase (migrated)';
    } else {
      const keyStore = selectKeyStore(keyPath, passphrase);
      privateKeyPem = keyStore.load(publicRecord.uuid);
      keyStoreType = keyStore.type();
    }

    identity.load(privateKeyPem, publicRecord);
    _log(`Identity loaded: ${identity.uuid} (via ${keyStoreType})`);
  } else {
    // First run — generate
    const keyStore = selectKeyStore(keyPath, passphrase);
    identity.generate(groupHint);
    const privateKeyPem = identity._privateKey.export({ type: 'pkcs8', format: 'pem' });
    keyStore.save(identity.uuid, privateKeyPem);
    fs.writeFileSync(publicFile, JSON.stringify(identity.publicRecord(), null, 2));
    _log(`Identity generated: ${identity.uuid} (via ${keyStore.type()})`);
  }

  return identity;
}

// ── Reset identity (explicit only — new UUID) ─────────────────────────────────
async function resetIdentity({ dataDir = DEFAULT_DATA_DIR, groupHint = null, confirm = false } = {}) {
  if (!confirm) throw new Error('[bridge-identity] --reset-identity requires confirm:true');

  const publicFile = path.join(dataDir, 'identity.json');
  let oldUUID = null;

  if (fs.existsSync(publicFile)) {
    try { oldUUID = JSON.parse(fs.readFileSync(publicFile, 'utf8')).uuid; } catch {}
    fs.renameSync(publicFile, publicFile + '.old.' + Date.now());
  }

  const keyStorePath = path.join(dataDir, 'identity.key');
  if (fs.existsSync(keyStorePath)) fs.renameSync(keyStorePath, keyStorePath + '.old.' + Date.now());

  const identity = await loadOrInit({ dataDir, groupHint });
  _log(`Identity reset. Old UUID: ${oldUUID || 'none'}. New UUID: ${identity.uuid}`);
  return { identity, oldUUID };
}

// ── Migration assertion (same human, new key) ─────────────────────────────────
async function migrateIdentity({ dataDir, oldUUID, reason = 'reset', groupHint = null }) {
  const identity = await loadOrInit({ dataDir, groupHint });
  const assertion = identity.makeMigrationAssertion(oldUUID, reason);

  const lineageFile = path.join(dataDir, 'identity-lineage.json');
  let lineage = [];
  if (fs.existsSync(lineageFile)) {
    try { lineage = JSON.parse(fs.readFileSync(lineageFile, 'utf8')); } catch {}
  }
  lineage.push(assertion);
  fs.writeFileSync(lineageFile, JSON.stringify(lineage, null, 2));
  _log(`Migration recorded: ${oldUUID} → ${identity.uuid} (${reason})`);
  return { identity, assertion };
}

function _log(msg) {
  // Suppressed: boot.js printPhase already surfaces identity info at Phase 1
  if (process.env.NEXUS_LOG === 'DEBUG') process.stderr.write(`[bridge-identity] ${msg}\n`);
}

module.exports = {
  loadOrInit,
  resetIdentity,
  migrateIdentity,
  verifyHandshake,
  deriveUUID,
  Identity,
};
