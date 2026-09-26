/**
 * host/gates/vault.js
 * COMPARTMENT OS — Host Vault Gates (Phase 28, spec §52)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Gates: host:vault:set / host:vault:get / host:vault:delete /
 *        host:vault:grant / host:vault:revoke / host:vault:export /
 *        host:vault:import
 * list/audit are read-only — handled directly in the CLI layer, same as
 * archetype 'list' didn't need a gate either.
 */

'use strict';

const { Gate }  = require('../../siso/Gate.js');
const { Event } = require('../../siso/Event.js');
const { VAULT } = require('../../foundation/event-contracts.js');
const { enforce } = require('../../foundation/axioms.js');

const {
  setSecret, getSecret, deleteSecret, grantAccess, revokeAccess, exportVault, importVault,
} = require('../../vault/index.js');

class VaultSetGate extends Gate {
  constructor() { super('host:vault:set'); }
  transform(event, stream) {
    const { host, compartmentName, key, value, scope, blueprintId, group } = event.data;
    try {
      const record = setSecret(host, { compartmentName, key, value, scope, blueprintId, group });
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(VAULT.SET, { vaultEntryId: record.id, key: record.key, compartmentId: record.compartmentId }));
    } catch (err) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'set', reason: err.message }));
    }
  }
}

class VaultGetGate extends Gate {
  constructor() { super('host:vault:get'); }
  transform(event, stream) {
    const { host, compartmentName, key, reveal } = event.data;
    let result;
    try {
      result = getSecret(host, { compartmentName, key, reveal });
    } catch (err) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'get', reason: err.message }));
      return;
    }
    if (!result.record) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'get', reason: `key "${key}" not found` }));
      return;
    }
    if (result.denied) {
      stream.emit(new Event(VAULT.ACCESS_DENIED, { compartmentName, key, reason: 'not authorized for this scope' }));
      return;
    }
    stream.emit(new Event(VAULT.ACCESSED, { compartmentName, key, accessType: reveal ? 'reveal' : 'read' }));
    if (reveal) {
      stream.emit(new Event(VAULT.REVEALED, { compartmentName, key, requestedBy: compartmentName, value: result.value }));
    }
  }
}

class VaultDeleteGate extends Gate {
  constructor() { super('host:vault:delete'); }
  transform(event, stream) {
    const { host, compartmentName, key } = event.data;
    try {
      const record = deleteSecret(host, { compartmentName, key });
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(VAULT.DELETED, { compartmentName, key, vaultEntryId: record.id }));
    } catch (err) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'delete', reason: err.message }));
    }
  }
}

class VaultGrantGate extends Gate {
  constructor() { super('host:vault:grant'); }
  transform(event, stream) {
    const { host, fromCompartmentName, toCompartmentName, key } = event.data;
    try {
      grantAccess(host, { fromCompartmentName, toCompartmentName, key });
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(VAULT.GRANT_ADDED, { fromCompartmentName, toCompartmentName, key }));
    } catch (err) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'grant', reason: err.message }));
    }
  }
}

class VaultRevokeGate extends Gate {
  constructor() { super('host:vault:revoke'); }
  transform(event, stream) {
    const { host, fromCompartmentName, toCompartmentName, key } = event.data;
    try {
      revokeAccess(host, { fromCompartmentName, toCompartmentName, key });
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(VAULT.GRANT_REVOKED, { fromCompartmentName, toCompartmentName, key }));
    } catch (err) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'revoke', reason: err.message }));
    }
  }
}

class VaultExportGate extends Gate {
  constructor() { super('host:vault:export'); }
  transform(event, stream) {
    const { host } = event.data;
    const result = exportVault(host);
    stream.emit(new Event(VAULT.EXPORTED, { entryCount: result.entryCount, encrypted: result.encrypted, data: result }));
  }
}

class VaultImportGate extends Gate {
  constructor() { super('host:vault:import'); }
  transform(event, stream) {
    const { host, data } = event.data;
    try {
      const result = importVault(host, data);
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(VAULT.IMPORTED, { entryCount: result.importedCount }));
    } catch (err) {
      stream.emit(new Event(VAULT.ERROR, { operation: 'import', reason: err.message }));
    }
  }
}

module.exports = {
  VaultSetGate,
  VaultGetGate,
  VaultDeleteGate,
  VaultGrantGate,
  VaultRevokeGate,
  VaultExportGate,
  VaultImportGate,
};
