#!/usr/bin/env node
'use strict';
/**
 * cli/dedup.js — table-deduplicator.js CLI
 * UUID: nexus-cli-dedup-v1-0000-2026-0912-jamesbrooks-001
 *
 * James: "clear all duplicates from each table. make a tool for it."
 * Standalone runner for cortex/memory/table-deduplicator.js — connects to
 * the real, shared cortex jaaDB (guardian/jaa-store.js underneath, same
 * store every process shares) rather than a mock, so this genuinely
 * dedupes live data on disk, not a simulation of it.
 *
 * Usage:
 *   node cli/dedup.js                       # dry-run report, every real table
 *   node cli/dedup.js --apply                # actually delete duplicates
 *   node cli/dedup.js event_log component_ledger --apply   # specific tables only
 *
 * Without --apply this is a REPORT ONLY run: it counts what WOULD be
 * removed without calling jaaDB.delete() at all, by using a read-only
 * shim instead of the real jaa handle — see _dryRunShim below. §1.2 — a
 * destructive, tree-wide operation should never be one accidental
 * argv-less invocation away from actually deleting anything.
 */

const { jaaDB, ALL_TABLES } = require('../cortex/memory/jaa-db.js');
const { dedupeTable } = require('../cortex/memory/table-deduplicator.js');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const explicitTables = args.filter(a => !a.startsWith('--'));
const tables = explicitTables.length ? explicitTables : (ALL_TABLES || Object.keys(require('../cortex/memory/tiers.js').TABLE_TIERS));

// Read-only shim for the dry-run path — reuses dedupeTable's real
// grouping/keeper logic unchanged, just never actually deletes or writes
// the audit log, so a bare `node cli/dedup.js` can never destroy data.
// §FIXED 2026-09-12 — same reference-identity bug found and fixed in
// cli/compact.js's own shim: an independent real.query() inside delete()
// returns fresh copies that can never match removeRefs.has(r) (built
// from an earlier query() call), silently reporting 0 removed regardless
// of the real count. Cached per table so the same objects are reused.
function _dryRunShim(real) {
  const cache = new Map();
  function cachedRows(table) {
    if (!cache.has(table)) cache.set(table, real.query(table, () => true, 10000000) || []);
    return cache.get(table);
  }
  return {
    query: (table, fn, opts) => cachedRows(table).filter(fn),
    insert: () => null,
    delete: (table, fn) => cachedRows(table).filter(fn).length,
  };
}

const handle = apply ? jaaDB : _dryRunShim(jaaDB);

console.log(`[dedup] ${apply ? 'APPLYING real deletes' : 'DRY RUN — nothing will be deleted (pass --apply to actually remove duplicates)'}`);
console.log(`[dedup] scanning ${tables.length} table(s): ${tables.join(', ')}\n`);

let totalRemoved = 0;
for (const table of tables) {
  const result = dedupeTable(handle, table);
  if (result.skipped) { console.log(`  ${table}: skipped (${result.reason})`); continue; }
  if (result.removed) {
    console.log(`  ${table}: ${result.removed} duplicate(s) across ${result.groups} group(s)${apply ? '' : ' [would be removed]'}`);
    totalRemoved += result.removed;
  }
}

console.log(`\n[dedup] ${apply ? 'removed' : 'would remove'} ${totalRemoved} duplicate row(s) total across ${tables.length} table(s).`);
if (!apply && totalRemoved > 0) console.log(`[dedup] re-run with --apply to actually remove them.`);
