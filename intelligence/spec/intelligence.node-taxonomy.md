# Node type → system map — Intelligence

The richest system checked so far — it has its own real, comprehensive local
schema file, `intelligence/schemas.js` ("James: 'schemas for each type of
data it stores. the rest is probabilistic and fluid.'"), same spirit as
guardian's `schemas/index.js`.

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `pat` | NOT INTELLIGENCE'S — corrected 2026-09-19 | `pat` is `lib/case-library.js`'s `pattern_signature` shape alone (domain/verb/compartment_uuid/trace_log) — checked directly, intelligence's own bep_patterns rows never matched it and were never actually exported under this type. See `bep_pattern` and `pattern_sequence` below for what intelligence really writes. |
| `bep_pattern` | WRITES — real, closed 2026-09-19 | `intelligence/lib/domain-nodes.js`'s `writePatternNode()`, wired at both of `intelligence/index.js`'s bep_patterns sites (co-occurrence/cross_system_causal and meta_noise_source — two real sub-shapes, one schema with the fields unique to each made optional, not split into two types; see `lib/node-schemas/schema.bep_pattern`'s own header). |
| `pattern_sequence` | WRITES — real, new type 2026-09-19 | `intelligence/lib/domain-nodes.js`'s `writePatternNode()`, wired at `intelligence/mastermind.js`'s `detectRecurringPatterns()` — a genuinely different real shape (upserts on `sequence`, never assigns a uuid) that doesn't fit `bep_pattern`'s schema even relaxed; given its own type rather than forced in. See `lib/node-schemas/schema.pattern_sequence`. |
| `gap` | WRITES — node-export closed 2026-09-19 | `intelligence/schemas.js`'s own `gaps` table, plus a full local subsystem: `intelligence/gap/hunter.js`, `ledger.js`, `index.js`, `predicate.js`. Real `.gap` node-export now wired at both real gap-writing sites (`intelligence/index.js`'s drift gap, `intelligence/causal/compound.js`'s tidal-cascade gap) via `domain-nodes.js`. `lib/node-schemas/schema.gap`'s `occurrences` field relaxed to optional — neither real site implements dedup/occurrence-counting the way `lib/gap-field.js` (schema.gap's original grounding) does. |
| `event` | WRITES | `intelligence/schemas.js`'s own `event_log` table — the same shared jaaDB table `schema.event` is grounded in. |
| `capability` | WRITES | `intelligence/registry-components.js`. |
| `spec` | WRITES | `intelligence/spec/intelligence.spec`. |
| `component` | NOT USED — real, confirmed gap | Checked `capability-map.js`'s `SYSTEMS` map directly: `intelligence` is **not** in it, despite having a real `registry-components.js`. Same class of gap already found for versionium. |
| `hook` | NOT USED — same confirmed gap | Same reasoning as `component`. |
| `wire` | NOT USED — same confirmed gap | Same reasoning as `component`. |
| `node` | WRITES — real, closed 2026-09-19 | `intelligence/lib/domain-nodes.js` — real `.gap`/`.bep_pattern`/`.pattern_sequence`/`.resonance_crystal` files under `intelligence/data/nodes/`, indexed into `intelligence/data/node-index/`'s real jaaDB tables via `lib/node-index.js`. Schema-checked on write, not exported blind — see `domain-nodes.js`'s own header. |
| `fault` | READS/ADJACENT | `intelligence/schemas.js` documents `fault_taxonomy`, but per guardian's own schema index, `cortex/self-heal/fault-taxonomy.js` is sole write authority — intelligence documents it, doesn't own writing it. |
| `failure_mode` | STILL NOT FOUND | `fault_taxonomy` is the closest real thing anywhere in the codebase to this still-`OPEN` type, and it isn't the same shape — didn't force a match. |
| `system` | IS ONE | `intelligence` is a real, named system in `NEXUS_MAP.md`'s top-level list. |

## The 4 esoteric excluded types — confirmed to belong here

`vector`, `resonance_crystal`, `relationship_edge`, `interstitial_space` were
excluded from the central 32 earlier this session as "belonging to other
subsystems." Mapping intelligence directly confirms it: `resonance_crystal`
← `intelligence/liminal-space/index.js`, `relationship_edge` ←
`intelligence/lattice/associative-lattice.js`. Real, but intelligence's own
separate taxonomy — not orphaned, just not part of guardian's central 32.

**§CLOSED 2026-09-19 — `resonance_crystal` now WRITES.** `domain-nodes.js`'s
`writeCrystalNode()` exports every real liminal-space crystal at the exact
construction site (`_crystallise()`, right after its own `jaaDB.insert(
'crystals', ...)`), using `resonance_crystal` and never the generic
`crystal` type — that one is `meta/crystal-lattice.js`'s, a different,
unrelated real mechanism; `lib/node-export.js`'s own `KNOWN_TYPES` comment
warns about exactly this confusion by name. `relationship_edge` and
`vector` remain unwritten — genuinely separate, not chased in this pass.

## One drift found, not chased further

`guardian/lib/gap-hunter.js`'s own header says its canonical replacement is
`meta/gap/hunter.js`. No `meta/gap/` directory exists in this snapshot — the
real file is at `intelligence/gap/hunter.js`, whose own internal header
still says `guardian/lib/gap-hunter.js` (a copy-paste artifact). Comment
drift, flagged, not resolved.
