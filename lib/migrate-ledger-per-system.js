'use strict';
/**
 * lib/migrate-ledger-per-system.js — move existing component_ledger rows
 * out of cortex's shared table into each system's own ledger store.
 * UUID: nexus-migrate-ledger-per-system-v1-0000-2026-0919-001
 *
 * §2026-09-19 — James: "the ledgers in cortex need to be per system."
 * lib/component-ledger.js now WRITES per-system (see its write() step 2),
 * but 742 real rows for 12 systems were already sitting in cortex's
 * shared table. New writes landing in the right place while the history
 * stays in the wrong one is a half-migration, and the read functions
 * would then report an empty past.
 *
 * Same shape as versionium's own migrate-*.js family per D2: separate
 * file, one responsibility, idempotent by key, safe to re-run.
 *
 * §IDEMPOTENT BY uuid — a row already present in its system's store is
 * counted and skipped, never duplicated.
 *
 * §NOT DESTRUCTIVE BY DEFAULT (§0.3). Cortex's rows are COPIED, not
 * moved. Pass { purgeSource: true } only after verifying the copy, and
 * only knowing that cortex's component_ledger is also read by
 * cli/sentinel.js, lib/introspect.js, intelligence/index.js,
 * cli/compact.js and cli/purge-pollution.js — none of which have been
 * repointed at the per-system stores yet. Purging before those move
 * would blind them (§1.2: they would report "no rows", not "moved").
 */

const TABLE = 'component_ledger';

function migrateLedgerPerSystem(opts = {}) {
  const result = { read: 0, copied: 0, alreadyThere: 0, bySystem: {}, noSystem: 0, errors: [], ok: true, purged: 0 };

  let jaa, ledgerStore;
  try { jaa = require('../cortex/memory/jaa-db').jaaDB; }
  catch (e) { return { ...result, ok: false, reason: `cortex store unreachable: ${e.message}` }; }
  try { ledgerStore = require('./ledger-store'); }
  catch (e) { return { ...result, ok: false, reason: `ledger store unreachable: ${e.message}` }; }

  let rows;
  try { rows = jaa.query(TABLE, () => true, 1000000) || []; }
  catch (e) { return { ...result, ok: false, reason: `read failed: ${e.message}` }; }
  result.read = rows.length;

  // one existing-uuid set per system, built once, not re-queried per row
  const seen = new Map();
  const seenFor = (sys) => {
    if (!seen.has(sys)) {
      let existing = [];
      try { existing = ledgerStore.storeFor(sys).all(TABLE, {}) || []; } catch (_) {}
      seen.set(sys, new Set(existing.map(r => r.uuid).filter(Boolean)));
    }
    return seen.get(sys);
  };

  for (const row of rows) {
    // §0.1 — a row with no system is NOT guessed at. It goes to a real,
    // named 'unknown' store so it stays findable and countable.
    const sys = row.system || 'unknown';
    if (!row.system) result.noSystem++;
    const have = seenFor(sys);
    if (row.uuid && have.has(row.uuid)) { result.alreadyThere++; continue; }
    try {
      ledgerStore.storeFor(sys).insert(TABLE, { ...row, _migratedFrom: 'cortex.component_ledger' });
      if (row.uuid) have.add(row.uuid);
      result.copied++;
      result.bySystem[sys] = (result.bySystem[sys] || 0) + 1;
    } catch (e) {
      result.errors.push({ uuid: row.uuid, system: sys, error: e.message });
    }
  }

  if (opts.purgeSource && result.errors.length === 0 && result.read > 0) {
    try { jaa.delete(TABLE, () => true); result.purged = result.read; }
    catch (e) { result.errors.push({ stage: 'purge', error: e.message }); }
  }
  return result;
}

module.exports = { migrateLedgerPerSystem };
