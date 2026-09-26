'use strict';
/**
 * intelligence/schemas.js — real, complete data shapes for every table
 * and file the intelligence system reads or writes. James: "schemas for
 * each type of data it stores. the rest is probabilistic and fluid."
 *
 * These document real, confirmed shapes — every field checked against
 * an actual insert()/write() call in the real code, not invented. What's
 * deliberately NOT here: the pattern-matching thresholds, confidence
 * math, and crystallisation heuristics themselves — that's the
 * "probabilistic and fluid" half James named directly, and forcing a
 * rigid schema onto tuning constants that are meant to keep changing
 * would be exactly the wrong kind of rigor.
 *
 * Storage is honestly two real, different mechanisms, not one uniform
 * one — documented as such rather than papered over:
 *   - jaaDB (cortex's shared, file-backed store) for everything under
 *     JAA_TABLES below.
 *   - CFR's own real, per-directory disk files (cfr_state.json,
 *     event_log.jsonl, event_stats.json) — a deliberate, separate,
 *     per-process persistence confirmed correct in phase 3 (see
 *     intelligence/spec/intelligence.spec's phase 3 correction) —
 *     NOT migrated into jaaDB, because doing so would collapse 28 real,
 *     independent per-system instances into one shared one.
 */

const JAA_TABLES = {
  bep_patterns: {
    description: 'A crystallised or candidate behavioral pattern — the real output of pattern crystallisation.',
    fields: {
      uuid: 'string, real row id',
      signature: 'string — the real pair/sequence this pattern represents',
      patternType: "'cross_system_causal' | 'co_occurrence' | (others exist per scan type — see intelligence/index.js's real scan functions)",
      typeA: 'string, real event type', typeB: 'string, real event type',
      systemA: 'string|null', systemB: 'string|null', crossSystem: 'boolean',
      count: 'number — real, observed occurrence count',
      confidence: 'number 0..1 — count-derived, not independently modeled',
      description: 'string — real, human-readable summary, generated at write time',
      actionable: 'boolean', crystallised: 'boolean — crosses the real threshold for this pattern type',
      noiseTainted: 'boolean — real suppression flag, set when a pattern is statistically noise, not signal',
      source: 'string, always the writing module id', ts: 'number, real epoch ms',
    },
  },
  fault_taxonomy: {
    description: 'Real, classified failure modes — read by lib/fault-log.js for pre-action precedent checks.',
    fields: { note: 'see lib/fault-log.js — the real, canonical writer for this table' },
  },
  reuse_index: {
    description: 'Real, indexed reusable code/patterns, scored by success rate.',
    fields: {
      uuid: 'string', hash: 'string — real content hash', type: 'string', lang: 'string',
      intent: 'string', successRate: 'number 0..1', usedCount: 'number',
      source: 'string', ts: 'number, real epoch ms',
    },
  },
  event_log: {
    description: "The real, shared event stream every system writes to. Real, canonical types live in lib/event-types.js.",
    fields: {
      type: "string — must be a real value from lib/event-types.js's ALL export",
      blockId: "string — a real, stable per-turn/per-call correlation id",
      agent: 'string|null — which real agent this event concerns, a FIELD not a type suffix',
      ts: 'number, real epoch ms',
      other: 'additional fields vary honestly by type — see lib/event-types.js for the full, real convention',
    },
  },
  sigma_records: {
    description: 'Real deviation-from-baseline records, generic across domains.',
    fields: { note: 'see intelligence/baseline.js and intelligence/cfr/sigma.js — the real writers' },
  },
  gaps: {
    description: 'Real, open system gaps — the same table lib/gap-field.js writes to.',
    fields: { note: "see lib/gap-field.js's real report() — the one, canonical writer" },
  },
  nexus_wake_events: {
    description: '"hey nexus, ..." moments, captured server-side, whether or not anything was live-listening.',
    fields: {
      id: 'string', request: 'string — the real text after the wake phrase',
      agent: 'string|null', chatUrl: 'string|null', account: 'string|null', sessionId: 'string|null',
      role: "'user'|'assistant'", ts: 'number', consumed: 'boolean', answer: 'string|null',
    },
  },
  account_identity_index: {
    description: 'Real, stable UUID per (agent, real detected account) — distinct from per-session UUIDs.',
    fields: { uuid: 'string', agentId: 'string', account: 'string — real, detected account string', createdAt: 'number', lastSeenAt: 'number' },
  },
  agent_notes: {
    description: 'Real, editable, agent-authored constraints/workarounds log.',
    fields: {
      uuid: 'string', agent: 'string', body: 'string — real, specific text',
      kind: "'token-limit'|'workaround'|'constraint'|'persistence'|'other'",
      source: 'string|null', relatesTo: 'string|null', createdAt: 'number', updatedAt: 'number', supersedes: 'string|null',
    },
  },
};

const CFR_FILES = {
  'cfr_state.json': "Real, current field state (coherence/friction/resonance/entropy) for ONE caller's own ledgerDir — per-process, not shared.",
  'event_log.jsonl': "Real, append-only ledger of every event that caller's CFR instance has recorded, one JSON object per line.",
  'event_stats.json': "Real, aggregated per-event-type stats for that same caller's own ledger.",
};

module.exports = { JAA_TABLES, CFR_FILES, MODULE_ID: 'intelligence.schemas', VERSION: '1.0.0' };
