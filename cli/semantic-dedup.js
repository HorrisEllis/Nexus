#!/usr/bin/env node
'use strict';
/**
 * cli/semantic-dedup.js — lib/semantic-dedup.js CLI
 * UUID: nexus-cli-semantic-dedup-v1-0000-2026-0912-jamesbrooks-001
 *
 * James: "vector memory? like semantic memory help reduce dedups" — yes.
 * Real, content-similarity near-duplicate detection, on top of
 * lib/vector-memory.js's real search() — genuinely different from
 * cli/dedup.js's exact-fingerprint dedup (see lib/semantic-dedup.js's
 * own header for the distinction).
 *
 * Usage:
 *   node cli/semantic-dedup.js                       # dry-run report, every embeddable table with real data
 *   node cli/semantic-dedup.js gaps bep_patterns      # specific tables only
 *   node cli/semantic-dedup.js --apply                # actually remove near-duplicates (keeps the oldest in each cluster)
 *   node cli/semantic-dedup.js --threshold=0.9        # override the default 0.95 similarity cutoff
 *   node cli/semantic-dedup.js event_log --force      # run against a table past the safe brute-force row limit
 *
 * Without --apply this is a REPORT ONLY run — clusters are found and
 * printed, nothing is deleted. Same §1.2 discipline cli/compact.js and
 * cli/dedup.js already use: a destructive, similarity-based operation
 * should never be one accidental argv-less invocation away from actually
 * removing anything, doubly so here since near-duplicate is a fuzzier
 * call than an exact match.
 */

const { jaaDB } = require('../cortex/memory/jaa-db.js');
const vm = require('../lib/vector-memory.js');
const { findNearDuplicates } = require('../lib/semantic-dedup.js');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const thresholdArg = args.find((a) => a.startsWith('--threshold='));
const threshold = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 0.95;
const explicitTables = args.filter((a) => !a.startsWith('--'));
const tables = explicitTables.length ? explicitTables : [...vm.EMBEDDABLE_TABLES];

async function main() {
  console.log('[semantic-dedup] initializing vector-memory...');
  await vm.init();
  const st = await vm.status();
  console.log(`[semantic-dedup] embed mode: ${st.ollamaOk ? 'ollama (real neural embeddings)' : 'TF-IDF fallback (no live Ollama in this environment — real, deterministic, but not neural-embedding quality)'}`);
  console.log(`[semantic-dedup] ${apply ? 'APPLYING real deletes' : 'DRY RUN — nothing will be deleted (pass --apply to actually remove near-duplicates)'}`);
  console.log(`[semantic-dedup] threshold: ${threshold}, tables: ${tables.join(', ')}\n`);

  let totalClusters = 0, totalRemoved = 0;
  for (const table of tables) {
    const result = await findNearDuplicates(jaaDB, table, { threshold, force });
    if (!result.ok) { console.log(`  ${table}: skipped (${result.error})`); continue; }
    if (!result.clusters.length) { console.log(`  ${table}: ${result.rowCount} rows, 0 near-duplicate clusters`); continue; }

    console.log(`  ${table}: ${result.rowCount} rows, ${result.clusters.length} near-duplicate cluster(s) [${result.embedMode}]`);
    for (const c of result.clusters) {
      console.log(`    keep ${c.keep} <- remove ${c.remove.length} (min similarity ${c.similarity.toFixed(3)})${apply ? '' : ' [would remove]'}`);
      totalClusters++;
      if (apply) {
        for (const uuid of c.remove) {
          try { jaaDB.delete(table, (r) => (r.uuid || r.id) === uuid); totalRemoved++; }
          catch (e) { console.warn(`      delete failed for ${uuid}: ${e.message}`); }
        }
      } else {
        totalRemoved += c.remove.length;
      }
    }
  }

  console.log(`\n[semantic-dedup] ${apply ? 'removed' : 'would remove'} ${totalRemoved} near-duplicate row(s) across ${totalClusters} cluster(s), ${tables.length} table(s) scanned.`);
  if (!apply && totalRemoved > 0) console.log('[semantic-dedup] re-run with --apply to actually remove them.');
}

main().catch((e) => { console.error('[semantic-dedup] fatal:', e.message); process.exit(1); });
