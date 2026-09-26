#!/usr/bin/env node
'use strict';
/**
 * cli/purge-pollution.js — tests/modules/_purge-test-rows.js CLI, for
 * cleaning up test pollution that ALREADY accumulated in the real,
 * live store before the root-cause fix (see that file's own header for
 * the full trace).
 *
 * James's own live boot log showed cortex/intelligence's pattern-
 * crystallization engine finding "100% confidence" patterns built on
 * literal test fixtures — bl7-<timestamp> synthetic system ids
 * (tests/modules/test-boot-log-fixes.js's own real BL-007 test) that
 * leaked into component_ledger/event_log and were never fully cleaned,
 * because purgeTestRows() only ever edited the on-disk file while the
 * SAME test process's live jaaDB singleton still held the polluted rows
 * dirty with a pending flush — which then resurrected them ~1.5s later.
 * That race is fixed at the source now; this is the one-time real
 * cleanup for rows already sitting in the live store from BEFORE the fix.
 *
 * Usage:
 *   node cli/purge-pollution.js                # dry-run report
 *   node cli/purge-pollution.js --apply         # actually remove them
 *   node cli/purge-pollution.js --prefix=bl7-   # scan a different real prefix
 *
 * Dry-run by default, same §1.2 discipline as cli/compact.js/cli/dedup.js
 * — a tree-wide delete should never be one accidental argv-less
 * invocation away from actually removing anything.
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'cortex', 'memory');
const TABLES = ['event_log', 'component_ledger'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const prefixArg = args.find((a) => a.startsWith('--prefix='));
// bl7- is the one real, confirmed pattern (tests/modules/test-boot-log-fixes.js's
// own real BL-007 test) — not guessing at others that haven't actually been found.
const prefix = prefixArg ? prefixArg.split('=')[1] : 'bl7-';

console.log(`[purge-pollution] ${apply ? 'APPLYING real deletes' : 'DRY RUN — nothing will be deleted (pass --apply to actually remove them)'}`);
console.log(`[purge-pollution] prefix: "${prefix}"\n`);

let totalRemoved = 0;
for (const t of TABLES) {
  const f = path.join(STORE, `${t}.json`);
  if (!fs.existsSync(f)) { console.log(`  ${t}: file not found, skipped`); continue; }
  let rows;
  try { rows = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.log(`  ${t}: unreadable (${e.message}), skipped`); continue; }
  if (!Array.isArray(rows)) { console.log(`  ${t}: not an array, skipped`); continue; }

  const matches = rows.filter((r) => String(r.system || r.source || r.systemId || r.component || '').startsWith(prefix));
  if (!matches.length) { console.log(`  ${t}: ${rows.length} rows, 0 matching "${prefix}"`); continue; }

  // Group by the real batch id (the prefix + its own run-timestamp),
  // not the full per-row system/component string — event_log rows carry
  // a per-row-unique component suffix (bl7-<ts>.c0, .c1, ...), which
  // would otherwise print one line per row instead of one per real batch.
  const batchRe = new RegExp(`^(${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[0-9]+)`);
  const bySystem = new Map();
  for (const r of matches) {
    const raw = String(r.system || r.source || r.systemId || r.component || '');
    const batchMatch = raw.match(batchRe);
    const sys = batchMatch ? batchMatch[1] : raw;
    bySystem.set(sys, (bySystem.get(sys) || 0) + 1);
  }
  console.log(`  ${t}: ${rows.length} rows, ${matches.length} matching "${prefix}" across ${bySystem.size} real batch(es)${apply ? '' : ' [would be removed]'}`);
  for (const [sys, count] of bySystem) console.log(`    - ${sys}: ${count} row(s)`);

  totalRemoved += matches.length;

  if (apply) {
    const keep = rows.filter((r) => !String(r.system || r.source || r.systemId || r.component || '').startsWith(prefix));
    const tmp = `${f}.${process.pid}.purge.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(keep), 'utf8');
    fs.renameSync(tmp, f);
  }
}

console.log(`\n[purge-pollution] ${apply ? 'removed' : 'would remove'} ${totalRemoved} row(s) total.`);
if (!apply && totalRemoved > 0) console.log('[purge-pollution] re-run with --apply to actually remove them.');
if (apply && totalRemoved > 0) {
  console.log('[purge-pollution] IMPORTANT: if cortex (or any process sharing this jaaDB) is currently running, its own in-memory copy still has these rows and may flush them back — restart that process after this apply for the cleanup to stick, same root cause this tool exists to close.');
}
