'use strict';
/**
 * cortex/memory/tiers.js — Memory tier definitions
 * UUID: nexus-cortex-memory-tiers-v1-0000-2026-0712-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-12 — "need what's missing built again, not flat or stubs."
 * cortex.spec has declared `MEMORY_TIERS: { working: 30min, short: 6hr,
 * long: permanent }` since v3.2.0. Confirmed absent from every implementation
 * in this branch (`_workingMemory` in boot.js is a flat, non-expiring object)
 * — this is the real thing, not a second flat object with a different name.
 *
 * The tier numbers and table→tier mapping below are ported verbatim from
 * the other branch's cortex/memory/jaa-db.js (checked two turns ago:
 * real decay ticker, tombstone eviction, its own test file). That's real,
 * already-designed work — reusing it, not reinventing worse numbers from
 * scratch. What's NEW here is wiring it onto THIS tree's actual storage:
 * that branch reimplemented its own in-memory + JSONL store from scratch;
 * this tree already shares one real store with guardian
 * (guardian/jaa-store.js, via cortex/memory/jaa-db.js's thin adapter) —
 * so the tier/decay layer here is built as a layer ON TOP of that existing
 * adapter, not a replacement of it. Guardian's real data isn't touched by
 * any of this; only cortex's own tables are tier-managed.
 */

const MEMORY_TIERS = Object.freeze({
  // WORKING — decays in 2h, represents "this session, right now"
  working: {
    halfLifeMs:    30 * 60 * 1000,        // 30 min
    evictAfterMs:  2  * 60 * 60 * 1000,   // 2 hours
    wipeOnRestart: true,
  },
  // SHORT-TERM — decays in 24h, survives cortex restarts
  short: {
    halfLifeMs:    6  * 60 * 60 * 1000,   // 6 hours
    evictAfterMs:  24 * 60 * 60 * 1000,   // 24 hours
    wipeOnRestart: false,
  },
  // LONG-TERM — no decay, requires explicit graduation (crystallization)
  long: {
    halfLifeMs:    null,
    evictAfterMs:  null,
    wipeOnRestart: false,
  },
});

// Table → tier mapping. Only tables cortex itself owns and actually uses
// in this branch — not a blind copy of the other branch's full list
// (which includes tables like `orion_sessions` that don't exist here).
// Checked each of these against real cortex/*.js writers before listing.
const TABLE_TIERS = Object.freeze({
  // WORKING
  working_memory:   'working',
  active_traces:    'working',  // pinned by tests/modules/jaa-db.test.js §INV eviction cycleId test

  // SHORT-TERM
  cortex_memory:    'short',
  gaps:             'short',
  event_log:        'short',
  sigma_records:    'short',
  sigma_rollups:    'long',   // compacted hourly history of sigma_records — never decays (§0.3: compressed, not destroyed)
  meta_observations:'short',
  sigma_live:       'short',
  // §ADDED 2026-09-12 — James: "we need decay for tables." Confirmed real,
  // high-volume, append-only tables (49,440 and 23,062 rows respectively
  // in this session's own boot logs), previously absent from this list
  // entirely — meaning they were invisible even to decay.js's tombstone
  // sweep, let alone real hard-delete. Wired to real compaction via
  // cortex/memory/table-compactor.js at orchestrator boot (see that
  // module's own header for why tombstone-only isn't enough for a table
  // this size).
  component_ledger:     'short',
  cfr_tension_history:  'short',
  // §ADDED 2026-09-12 — James's own live boot log named these directly.
  // Checked each real writer before classifying, same discipline as
  // every entry above:
  constitution_decisions: 'short', // lib/constitutional-ai.js — real, append-only decision history, 2,256 rows and growing
  chat_log:                'short', // guardian/lib/ncp-handler.js + lib/chat-logger.js — real conversation history
  schema_drift:             'short', // cortex/memory/jaa-db.js — diagnostic log of past drift events, not current state

  // LONG-TERM — no decay, explicit graduation required
  crystals:         'long',
  bep_patterns:     'long',
  trust_scores:     'long',
  fix_map:          'long',
  // §ADDED 2026-09-12 — checked each real writer, these are living/
  // permanent structures, not historical logs — a time-decay would
  // destroy current state, not history:
  memory_unified:       'long', // cortex/boot.js's own comment: the unified push/recall store, "don't scatter" — this IS current memory, not a log of it
  interstitial_spaces:  'long', // intelligence/liminal-space/index.js — inserted AND repeatedly updated in place (found/update calls), an evolving structure, not append-only
  hooks:                'long', // hooks/*.hooks.js writers — component wiring registry, structural/config state
  tool_index:           'long', // registry of real tool nodes, structural
  raid_contract_queue:  'long', // active work queue — current pending work, not history
  intake_drops:         'long', // pending drop-zone items awaiting real action, current state not history
  fault_taxonomy:       'long', // cortex/self-heal/fault-taxonomy.js — per-CLASS aggregate state, not per-occurrence history
  forge_patches:        'long', // structural — a patch that decayed away would be a silent, undiscoverable loss of a real forged artifact
  raid_tunables:        'long', // live configuration, not a log

  // INFRASTRUCTURE — not memory, never decays
  decay_log:        'long',
  settings:         'long',
  components:       'long',
  // §ADDED 2026-09-12 — table-compactor.js's own real audit trail (§0.3:
  // the compressed summary written before every real hard-delete). Same
  // treatment as decay_log above — the log of compaction must never
  // itself decay, or a gap in it becomes indistinguishable from
  // compaction genuinely not having run.
  compaction_log:   'long',
  // §ADDED 2026-09-12 — table-deduplicator.js's own audit trail, same
  // never-decaying treatment as compaction_log/decay_log above.
  dedup_log:        'long',
});

function tierFor(table) {
  return TABLE_TIERS[table] || null;
}

function tierConfig(tierName) {
  return MEMORY_TIERS[tierName] || null;
}

module.exports = { MEMORY_TIERS, TABLE_TIERS, tierFor, tierConfig };
