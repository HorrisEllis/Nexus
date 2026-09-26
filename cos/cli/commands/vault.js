/**
 * cli/commands/vault.js
 * COMPARTMENT OS — cos vault set | get | list | delete | grant | revoke | audit | export | import
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * vault subcommands (all 9 hooks, hk-va-001..009):
 *   cos vault set <comp> KEY=VALUE [--scope=global|shared|blueprint]
 *   cos vault get <comp> KEY [--reveal]
 *   cos vault list <comp>
 *   cos vault delete <comp> KEY
 *   cos vault grant <fromComp> <toComp> KEY
 *   cos vault revoke <fromComp> <toComp> KEY
 *   cos vault audit                         → tails the event log for vault:* events
 *   cos vault export <file.json>
 *   cos vault import <file.json>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { VAULT } = require('../../foundation/event-contracts.js');
const { listSecrets } = require('../../vault/index.js');

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

// ─── Set ──────────────────────────────────────────────────────────────────────

function setCommand(host, compartmentName, kv, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  const eqIdx = (kv || '').indexOf('=');
  if (!compartmentName || eqIdx < 0) {
    error('  Usage: cos vault set <compartment> KEY=VALUE [--scope=global|shared|blueprint]');
    return null;
  }
  const key = kv.slice(0, eqIdx);
  const value = kv.slice(eqIdx + 1);

  let result = null, errored = null;
  const u1 = host.bus.on(VAULT.SET, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(VAULT.ERROR, (ev) => { errored = ev.payload; });
  host.bus.emit('host:vault:set', { host, compartmentName, key, value, scope: flags.scope, blueprintId: flags.blueprintId });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Set "${key}" for "${compartmentName}"`);
  return result;
}

// ─── Get ──────────────────────────────────────────────────────────────────────

function getCommand(host, compartmentName, key, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!compartmentName || !key) {
    error('  Usage: cos vault get <compartment> KEY [--reveal]');
    return null;
  }

  let revealed = null, accessed = null, errored = null, denied = null;
  const u1 = host.bus.on(VAULT.REVEALED, (ev) => { revealed = ev.payload; });
  const u2 = host.bus.on(VAULT.ACCESSED, (ev) => { accessed = ev.payload; });
  const u3 = host.bus.on(VAULT.ERROR, (ev) => { errored = ev.payload; });
  const u4 = host.bus.on(VAULT.ACCESS_DENIED, (ev) => { denied = ev.payload; });
  host.bus.emit('host:vault:get', { host, compartmentName, key, reveal: !!flags.reveal });
  u1(); u2(); u3(); u4();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  if (denied) { error(`  Access denied: "${compartmentName}" cannot read "${key}"`); return null; }

  if (flags.reveal) {
    log(`  ${key} = ${revealed.value}`);
    return revealed;
  }
  log(`  ✓ "${key}" exists and is accessible to "${compartmentName}" (use --reveal to see the value)`);
  return accessed;
}

// ─── List ─────────────────────────────────────────────────────────────────────

function listCommand(host, compartmentName, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!compartmentName) { error('  Usage: cos vault list <compartment>'); return null; }

  let records;
  try {
    records = listSecrets(host, compartmentName);
  } catch (err) {
    error(`  Error: ${err.message}`);
    return null;
  }
  host.bus.emit(VAULT.LISTED, { compartmentName, count: records.length });

  if (flags.json) { log(JSON.stringify(records, null, 2)); return records; }

  const lines = [''];
  lines.push('  ' + pad('KEY', 24) + '  ' + pad('SCOPE', 12) + '  ' + pad('GRANTS', 10));
  lines.push('  ' + pad('─'.repeat(24), 24) + '  ' + pad('─'.repeat(12), 12) + '  ' + pad('─'.repeat(10), 10));
  for (const r of records) {
    lines.push('  ' + pad(r.key, 24) + '  ' + pad(r.scope, 12) + '  ' + pad(String(r.grants.length), 10));
  }
  lines.push('', `  ${records.length} secret${records.length !== 1 ? 's' : ''} accessible to "${compartmentName}"`, '');
  log(lines.join('\n'));
  return records;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function deleteCommand(host, compartmentName, key, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName || !key) { error('  Usage: cos vault delete <compartment> KEY'); return null; }

  let result = null, errored = null;
  const u1 = host.bus.on(VAULT.DELETED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(VAULT.ERROR, (ev) => { errored = ev.payload; });
  host.bus.emit('host:vault:delete', { host, compartmentName, key });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Deleted "${key}"`);
  return result;
}

// ─── Grant / Revoke ─────────────────────────────────────────────────────────────

function grantCommand(host, fromCompartmentName, toCompartmentName, key, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!fromCompartmentName || !toCompartmentName || !key) {
    error('  Usage: cos vault grant <fromCompartment> <toCompartment> KEY');
    return null;
  }
  let result = null, errored = null;
  const u1 = host.bus.on(VAULT.GRANT_ADDED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(VAULT.ERROR, (ev) => { errored = ev.payload; });
  host.bus.emit('host:vault:grant', { host, fromCompartmentName, toCompartmentName, key });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Granted "${toCompartmentName}" access to "${key}"`);
  return result;
}

function revokeCommand(host, fromCompartmentName, toCompartmentName, key, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!fromCompartmentName || !toCompartmentName || !key) {
    error('  Usage: cos vault revoke <fromCompartment> <toCompartment> KEY');
    return null;
  }
  let result = null, errored = null;
  const u1 = host.bus.on(VAULT.GRANT_REVOKED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(VAULT.ERROR, (ev) => { errored = ev.payload; });
  host.bus.emit('host:vault:revoke', { host, fromCompartmentName, toCompartmentName, key });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Revoked "${toCompartmentName}"'s access to "${key}"`);
  return result;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

/**
 * Reads the persisted audit log (vault/audit-log.js) rather than the
 * in-memory event bus — each CLI invocation is a fresh process, so
 * host.bus.tail() would be empty by the time a separate `cos vault
 * audit` command runs. Found by testing: the first version of this
 * function used bus.tail() and always printed "0 events."
 */
function auditCommand(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const { readAuditLog } = require('../../vault/audit-log.js');
  const events = readAuditLog({ auditLogFile: (host.vaultOpts || {}).auditLogFile, limit: flags.n ? Number(flags.n) : 1000 });
  host.bus.emit(VAULT.AUDIT_SHOWN, { count: events.length });

  if (flags.json) { log(JSON.stringify(events, null, 2)); return events; }

  const lines = [''];
  for (const ev of events) {
    const ts = new Date(ev.timestamp).toISOString();
    const detail = ev.payload.key ? `key=${ev.payload.key}` : '';
    lines.push(`  ${ts}  ${pad(ev.type, 24)} ${detail}`);
  }
  lines.push('', `  ${events.length} vault event${events.length !== 1 ? 's' : ''}`, '');
  log(lines.join('\n'));
  return events;
}

// ─── Export / Import ────────────────────────────────────────────────────────────

function exportCommand(host, filePath, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!filePath) { error('  Usage: cos vault export <file.json>'); return null; }

  let result = null;
  const unsub = host.bus.on(VAULT.EXPORTED, (ev) => { result = ev.payload; });
  host.bus.emit('host:vault:export', { host });
  unsub();

  fs.writeFileSync(path.resolve(filePath), JSON.stringify(result.data, null, 2));
  log(`  ✓ Exported ${result.entryCount} entries to ${filePath} (still encrypted)`);
  return result;
}

function importCommand(host, filePath, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!filePath) { error('  Usage: cos vault import <file.json>'); return null; }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (err) {
    error(`  Error: could not read/parse "${filePath}" — ${err.message}`);
    return null;
  }

  let result = null, errored = null;
  const u1 = host.bus.on(VAULT.IMPORTED, (ev) => { result = ev.payload; });
  const u2 = host.bus.on(VAULT.ERROR, (ev) => { errored = ev.payload; });
  host.bus.emit('host:vault:import', { host, data });
  u1(); u2();

  if (errored) { error(`  Error: ${errored.reason}`); return null; }
  log(`  ✓ Imported ${result.entryCount} entries`);
  return result;
}

// ─── Route subcommands ────────────────────────────────────────────────────────

function runVaultCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));

  switch (sub) {
    case 'set':    return setCommand(host, args[0], args[1], flags, out);
    case 'get':    return getCommand(host, args[0], args[1], flags, out);
    case 'list':   return listCommand(host, args[0], flags, out);
    case 'delete': return deleteCommand(host, args[0], args[1], out);
    case 'grant':  return grantCommand(host, args[0], args[1], args[2], out);
    case 'revoke': return revokeCommand(host, args[0], args[1], args[2], out);
    case 'audit':  return auditCommand(host, flags, out);
    case 'export': return exportCommand(host, args[0], out);
    case 'import': return importCommand(host, args[0], out);
    default:
      error('  Usage: cos vault <set|get|list|delete|grant|revoke|audit|export|import> [args]');
      return null;
  }
}

module.exports = {
  runVaultCommand,
  setCommand, getCommand, listCommand, deleteCommand, grantCommand, revokeCommand,
  auditCommand, exportCommand, importCommand,
};
