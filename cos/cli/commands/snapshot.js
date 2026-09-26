/**
 * cli/commands/snapshot.js
 * COMPARTMENT OS — cos snapshot take | list | restore | delete
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Wraps the existing foundation/snapshot.js SnapshotEngine — fully built
 * before this, with zero CLI exposure or callers anywhere in the
 * codebase. The Watchdog (watchdog/actions.js) is its first real caller;
 * this is the second, giving a person direct access to the same thing.
 *
 * Hooks: hk-008 (take) / hk-009 (restore)
 */

'use strict';

function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function getEngineFor(host, compartmentName) {
  const { SnapshotEngine } = require('../../foundation/snapshot.js');
  const comp = host.store.getCompartmentByName(compartmentName) || host.store.getCompartment(compartmentName);
  if (!comp) return { error: `compartment "${compartmentName}" not found` };
  return { engine: new SnapshotEngine(host, comp), comp };
}

function takeCommand(host, compartmentName, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName) { error('  Usage: cos snapshot take <compartment>'); return null; }

  const { engine, error: err } = getEngineFor(host, compartmentName);
  if (err) { error(`  Error: ${err}`); return null; }

  const snap = engine.take('host:snapshot:manual');
  log(`  ✓ Snapshot ${snap.id} taken for "${compartmentName}" (${snap.sizeBytes} bytes, gzip)`);
  return snap;
}

function listCommand(host, compartmentName, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName) { error('  Usage: cos snapshot list <compartment>'); return null; }

  const { engine, error: err } = getEngineFor(host, compartmentName);
  if (err) { error(`  Error: ${err}`); return null; }

  const metas = engine.list();
  if (flags.json) { log(JSON.stringify(metas, null, 2)); return metas; }

  const lines = [''];
  lines.push('  ' + pad('SNAP ID', 12) + '  ' + pad('CREATED', 24) + '  ' + pad('SIZE', 10));
  for (const m of metas) {
    lines.push('  ' + pad(m.snapId, 12) + '  ' + pad(new Date(m.createdAt).toISOString(), 24) + '  ' + pad(`${m.sizeBytes}B`, 10));
  }
  lines.push('', `  ${metas.length} snapshot${metas.length !== 1 ? 's' : ''}`, '');
  log(lines.join('\n'));
  return metas;
}

function restoreCommand(host, compartmentName, snapId, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName || !snapId) { error('  Usage: cos snapshot restore <compartment> <snapId>'); return null; }

  const { engine, error: err } = getEngineFor(host, compartmentName);
  if (err) { error(`  Error: ${err}`); return null; }

  let result;
  try {
    result = engine.restore(snapId);
  } catch (e) {
    error(`  Error: ${e.message}`);
    return null;
  }
  log(`  ✓ Restored "${compartmentName}" config from snapshot ${snapId}`);
  return result;
}

function deleteCommand(host, compartmentName, snapId, out = {}) {
  const log = out.log || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));
  if (!compartmentName || !snapId) { error('  Usage: cos snapshot delete <compartment> <snapId>'); return null; }

  const { engine, error: err } = getEngineFor(host, compartmentName);
  if (err) { error(`  Error: ${err}`); return null; }

  try {
    engine.delete(snapId);
  } catch (e) {
    error(`  Error: ${e.message}`);
    return null;
  }
  log(`  ✓ Deleted snapshot ${snapId}`);
  return { deleted: true, snapId };
}

function runSnapshotCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));
  switch (sub) {
    case 'take':    return takeCommand(host, args[0], out);
    case 'list':    return listCommand(host, args[0], flags, out);
    case 'restore': return restoreCommand(host, args[0], args[1], out);
    case 'delete':  return deleteCommand(host, args[0], args[1], out);
    default:
      error('  Usage: cos snapshot <take|list|restore|delete> [args]');
      return null;
  }
}

module.exports = { runSnapshotCommand, takeCommand, listCommand, restoreCommand, deleteCommand };
