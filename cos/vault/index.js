/**
 * vault/index.js
 * COMPARTMENT OS — Vault Public API (Phase 28, spec §52)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * ACCESS CONTROL, FLAGGED: spec gives the VaultKeyRecord shape (scope,
 * compartmentId, blueprintId, group, grants) and the event list, but not
 * the narrative section defining exactly how scope+grants resolve access.
 * This build's construction:
 *   - scope 'global'      → every compartment can read it
 *   - scope 'compartment' → only the owning compartmentId, or anyone in `grants`
 *   - scope 'shared'      → opt-in only — anyone in `grants` (no implicit owner read)
 *   - scope 'blueprint'   → any compartment sharing the same blueprintId, or in `grants`
 *   - delete/grant/revoke → owner only (compartmentId match) — granted access
 *     never includes the right to delete or re-grant
 * If a future spec revision defines this differently, this module is the
 * seam to revisit — canAccess() is the single function that encodes it.
 */

'use strict';

const { randomUUID } = require('crypto');

const { putEncryptedValue, getDecryptedValue, deleteEncryptedValue } = require('./store.js');

class VaultError extends Error {
  constructor(message) {
    super(`Vault: ${message}`);
    this.name = 'VaultError';
  }
}

/**
 * @param {object} record  VaultKeyRecord
 * @param {object} requestingCompartment
 * @returns {boolean}
 */
function canAccess(record, requestingCompartment) {
  if (!requestingCompartment) return false;
  if (record.scope === 'global') return true;
  if (record.grants.includes(requestingCompartment.id)) return true;
  if (record.scope === 'compartment') return record.compartmentId === requestingCompartment.id;
  if (record.scope === 'blueprint') return !!record.blueprintId && requestingCompartment.blueprintId === record.blueprintId;
  return false; // 'shared' with no grant
}

function findRecord(host, key, scopeHint = null) {
  const records = host.sysmap.get().vaultKeys.filter(r => r.key === key);
  if (scopeHint) return records.find(r => r.scope === scopeHint) || null;
  // Prefer the most specific scope when multiple entries share a key name.
  const order = ['compartment', 'blueprint', 'shared', 'global'];
  records.sort((a, b) => order.indexOf(a.scope) - order.indexOf(b.scope));
  return records[0] || null;
}

function resolveCompartment(host, compartmentName) {
  const comp = host.store.getCompartmentByName(compartmentName) || host.store.getCompartment(compartmentName);
  if (!comp) throw new VaultError(`compartment "${compartmentName}" not found`);
  return comp;
}

// ─── Set ────────────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {{ compartmentName: string, key: string, value: string, scope?: string, blueprintId?: string, group?: string }} opts
 * @returns {object} the VaultKeyRecord (metadata only — no value)
 */
function setSecret(host, opts) {
  const { compartmentName, key, value, scope = 'compartment', blueprintId = null, group = null } = opts;
  if (!key) throw new VaultError('key is required');
  if (value === undefined || value === null) throw new VaultError('value is required');

  const comp = resolveCompartment(host, compartmentName);
  const existing = host.sysmap.get().vaultKeys.find(r => r.key === key && r.compartmentId === comp.id);

  const record = existing
    ? Object.assign({}, existing, { updatedAt: Date.now() })
    : {
        id: randomUUID(), key, scope, compartmentId: scope === 'global' ? null : comp.id,
        blueprintId, group, grants: [], createdAt: Date.now(), updatedAt: Date.now(),
      };

  putEncryptedValue(record.id, String(value), host.vaultOpts || {});
  host.sysmap.upsertVaultKey(record);
  return record;
}

// ─── Get ────────────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {{ compartmentName: string, key: string, reveal?: boolean }} opts
 * @returns {{ record: object, value: string|null, denied: boolean }}
 */
function getSecret(host, opts) {
  const { compartmentName, key, reveal = false } = opts;
  const comp = resolveCompartment(host, compartmentName);
  const record = findRecord(host, key);

  if (!record) return { record: null, value: null, denied: false };
  if (!canAccess(record, comp)) return { record, value: null, denied: true };

  if (!reveal) return { record, value: null, denied: false };

  const value = getDecryptedValue(record.id, host.vaultOpts || {});
  return { record, value, denied: false };
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {string} compartmentName
 * @returns {object[]} VaultKeyRecord[] (no values) the compartment can access
 */
function listSecrets(host, compartmentName) {
  const comp = resolveCompartment(host, compartmentName);
  return host.sysmap.get().vaultKeys.filter(r => canAccess(r, comp));
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {{ compartmentName: string, key: string }} opts
 */
function deleteSecret(host, opts) {
  const { compartmentName, key } = opts;
  const comp = resolveCompartment(host, compartmentName);
  const record = findRecord(host, key, null);
  if (!record) throw new VaultError(`key "${key}" not found`);
  if (record.compartmentId !== comp.id) {
    throw new VaultError(`"${compartmentName}" does not own "${key}" — only the owner can delete`);
  }
  deleteEncryptedValue(record.id, host.vaultOpts || {});
  host.sysmap.removeVaultKey(record.id);
  return record;
}

// ─── Grant / Revoke ─────────────────────────────────────────────────────────────

/**
 * @param {object} host
 * @param {{ fromCompartmentName: string, toCompartmentName: string, key: string }} opts
 */
function grantAccess(host, opts) {
  const { fromCompartmentName, toCompartmentName, key } = opts;
  const from = resolveCompartment(host, fromCompartmentName);
  const to = resolveCompartment(host, toCompartmentName);
  const record = findRecord(host, key, null);
  if (!record) throw new VaultError(`key "${key}" not found`);
  if (record.compartmentId !== from.id) {
    throw new VaultError(`"${fromCompartmentName}" does not own "${key}" — only the owner can grant access`);
  }
  if (!record.grants.includes(to.id)) record.grants.push(to.id);
  record.updatedAt = Date.now();
  host.sysmap.upsertVaultKey(record);
  return record;
}

/**
 * @param {object} host
 * @param {{ fromCompartmentName: string, toCompartmentName: string, key: string }} opts
 */
function revokeAccess(host, opts) {
  const { fromCompartmentName, toCompartmentName, key } = opts;
  const from = resolveCompartment(host, fromCompartmentName);
  const to = resolveCompartment(host, toCompartmentName);
  const record = findRecord(host, key, null);
  if (!record) throw new VaultError(`key "${key}" not found`);
  if (record.compartmentId !== from.id) {
    throw new VaultError(`"${fromCompartmentName}" does not own "${key}" — only the owner can revoke access`);
  }
  record.grants = record.grants.filter(id => id !== to.id);
  record.updatedAt = Date.now();
  host.sysmap.upsertVaultKey(record);
  return record;
}

// ─── Export / Import ────────────────────────────────────────────────────────────

/**
 * Exports metadata + STILL-ENCRYPTED values. Decryptable only with the
 * same master key — that's correct security behavior (an export isn't a
 * key-escrow mechanism), not an oversight.
 * @param {object} host
 * @returns {{ entryCount: number, encrypted: true, entries: object[] }}
 */
function exportVault(host) {
  const { readStore } = require('./store.js');
  const records = host.sysmap.get().vaultKeys;
  const store = readStore((host.vaultOpts || {}).storeFile);
  const entries = records.map(r => ({ record: r, encryptedValue: store[r.id] || null }));
  return { entryCount: entries.length, encrypted: true, entries };
}

/**
 * @param {object} host
 * @param {{ entries: Array<{record: object, encryptedValue: object}> }} data
 * @returns {{ importedCount: number }}
 */
function importVault(host, data) {
  const { readStore, writeStore } = require('./store.js');
  const storeFile = (host.vaultOpts || {}).storeFile;
  const store = readStore(storeFile);
  let importedCount = 0;
  for (const { record, encryptedValue } of data.entries || []) {
    host.sysmap.upsertVaultKey(record);
    if (encryptedValue) store[record.id] = encryptedValue;
    importedCount++;
  }
  writeStore(store, storeFile);
  return { importedCount };
}

// ─── Injection (vault:secret:injected) ─────────────────────────────────────────

/**
 * Returns decrypted env vars for everything a compartment can access —
 * used by the start-time injection hook (host/index.js, playgrounds/kernel.js).
 * @param {object} host
 * @param {object} compartment
 * @returns {Record<string,string>}
 */
function getInjectionEnvVars(host, compartment) {
  const records = host.sysmap.get().vaultKeys.filter(r => canAccess(r, compartment));
  const env = {};
  for (const r of records) {
    const value = getDecryptedValue(r.id, host.vaultOpts || {});
    if (value !== null) env[r.key] = value;
  }
  return env;
}

module.exports = {
  VaultError,
  canAccess,
  setSecret,
  getSecret,
  listSecrets,
  deleteSecret,
  grantAccess,
  revokeAccess,
  exportVault,
  importVault,
  getInjectionEnvVars,
};
