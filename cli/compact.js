#!/usr/bin/env node
'use strict';
/**
 * cli/compact.js — table-compactor.js CLI
 * UUID: nexus-cli-compact-v1-0000-2026-0912-jamesbrooks-001
 *
 * Same dry-run-by-default convention as cli/dedup.js, for the same
 * reason: a tree-wide destructive scan should never be one bare
 * argv-less invocation away from actually deleting real data.
 *
 * Usage:
 *   node cli/compact.js                # dry-run report, both age + count-cap
 *   node cli/compact.js --apply         # actually delete
 *   node cli/compact.js --age-only --apply
 *   node cli/compact.js --caps-only --apply
 */

const { jaaDB } = require('../cortex/memory/jaa-db.js');
const { compactTable, capTable } = require('../cortex/memory/table-compactor.js');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ageOnly = args.includes('--age-only');
const capsOnly = args.includes('--caps-only');

// Same real, explicit lists this session wired into orchestrator boot —
// not re-derived, read from the same source of truth.
const AGE_TABLES = ['event_log', 'component_ledger', 'cfr_tension_history', 'constitution_decisions', 'chat_log', 'schema_drift'];
const CAP_SPECS = [{ table: 'sigma_records', keyFn: (r) => r.type || null, maxPerGroup: 100 }];

// §FIXED 2026-09-12 — the first version of this shim's delete() did its
// own independent real.query() call, which JaaStore's real all() returns
// as fresh {...row} spread copies every time (confirmed directly) — so
// removeRefs.has(r) (reference equality, built from compactTable/
// capTable's OWN earlier query() call) could never match a freshly
// re-queried copy, silently reporting 0 removed regardless of the real
// count. Caught by cross-checking against a direct, independent count
// before trusting the dry run's own numbers — real sigma_records groups
// were being reported as "nothing over cap" when 7 of them genuinely
// exceeded it by thousands of rows. Fixed by caching each table's query
// result once per run, so the same row objects are reused for both the
// "what to remove" and "count what was removed" calls.
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

console.log(`[compact] ${apply ? 'APPLYING real deletes' : 'DRY RUN — nothing will be deleted (pass --apply to actually compact)'}\n`);

let totalRemoved = 0;

if (!capsOnly) {
  console.log(`[compact] age-based sweep — ${AGE_TABLES.join(', ')}`);
  for (const table of AGE_TABLES) {
    const result = compactTable(handle, table);
    if (result.skipped) { console.log(`  ${table}: skipped (${result.reason})`); continue; }
    if (result.deleted) {
      console.log(`  ${table}: ${result.deleted} expired row(s)${apply ? '' : ' [would be removed]'}`);
      totalRemoved += result.deleted;
    } else {
      console.log(`  ${table}: nothing expired`);
    }
  }
}

if (!ageOnly) {
  console.log(`\n[compact] count-cap sweep — ${CAP_SPECS.map(s => `${s.table} (${s.maxPerGroup}/group)`).join(', ')}`);
  for (const spec of CAP_SPECS) {
    const result = capTable(handle, spec.table, spec.keyFn, spec.maxPerGroup);
    if (result.skipped) { console.log(`  ${spec.table}: skipped (${result.reason})`); continue; }
    if (result.removed) {
      console.log(`  ${spec.table}: ${result.removed} row(s) over cap across ${result.groups} group(s)${apply ? '' : ' [would be removed]'}`);
      totalRemoved += result.removed;
    } else {
      console.log(`  ${spec.table}: nothing over cap`);
    }
  }
}

console.log(`\n[compact] ${apply ? 'removed' : 'would remove'} ${totalRemoved} row(s) total.`);
if (!apply && totalRemoved > 0) console.log(`[compact] re-run with --apply to actually remove them.`);
