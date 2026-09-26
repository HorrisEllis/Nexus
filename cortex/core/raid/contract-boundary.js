'use strict';
/**
 * cortex/core/raid/contract-boundary.js — real boundary registry + resolver
 * comp_id: cortex.raid.contract-boundary
 * uuid: nexus-cortex-raid-contract-boundary-v1-0000-2026-0902-jamesbrooks-001
 * Version: 0.1.0
 *
 * §BUILT 2026-09-02 — docs/contracts/synthesis-contract.spec's `boundary`
 * block (primitive + invariants[] + principles[]) and docs/contracts/
 * context-synthesis-pipeline.spec's `real_rows` (stage_2_schema_registry),
 * made real: a lookup keyed `${source}:${intention}` — NOT `${system}:...`,
 * corrected against contract-intake.js's own real submitContract() call
 * sites, none of which ever set opts.system (grep-checked, all 5).
 *
 * §HONEST SCOPE — every real (source, intention) pair that exists in this
 * codebase today: self-heal (see §KEY-SHAPE FIX below), idearium:build,
 * agent-mesh:build, officiator:build, officiator-synthesis-tool:build,
 * copilot:build. No speculative rows added ahead of real traffic, per
 * IC3_intention_taxonomy_per_system's own sequencing rule
 * (docs/2026-08-30-interaction-contract-context-phasemap.spec). The count
 * in this comment previously said "4" and was already stale against the
 * officiator/officiator-synthesis-tool rows added 2026-09-03 below — fixed
 * here (§1.1, same class of drift as the count in this comment itself).
 *
 * §KEY-SHAPE FIX 2026-09-13 — found via a real runtime log: "no registered
 * boundary for self-heal:heal:memory_pressure ... REGISTRY has 6 real
 * row(s) today". cortex/self-heal/index.js's real _enterFailureMode()
 * submits intention: `heal:${gapType}`, so the real key is
 * `self-heal:heal:${gapType}` (3 segments) — not `self-heal:heal` (2
 * segments), which never matches anything real and was dead on arrival.
 * gapType is not free text: _attemptLevel1() (same file) hard-checks it
 * against faultTaxonomy.KNOWN_FAULT_CLASSES before this point is ever
 * reached, so the real, closed set of values is exactly the 8 in
 * cortex/self-heal/fault-taxonomy.js's frozen KNOWN_FAULT_CLASSES array —
 * confirmed by reading it directly, not inferred. Only 'memory_pressure'
 * has been directly observed in real log data so far; the other 7 are
 * registered because _enterFailureMode() already treats all 8 identically
 * (same call, same code path) — this completes real, already-shipped
 * coverage, not speculation about a fault class that doesn't exist yet.
 * resolveBoundary() does exact-match only, no fuzzy/prefix matching (see
 * its own docstring below) — one explicit row per real fault class, not a
 * wildcard, to keep that contract unchanged.
 *
 * §PRIMITIVE FIELD — per synthesis-contract.spec's corrected boundary.
 * primitive note: 2 of these 4 (self-heal, agent-mesh) have no HTTP
 * route and are NOT loom-registered — confirmed by direct read of
 * lib/component-registry.js's register(), which hard-requires
 * route:{method,path} in validate(), not defaultable. Fabricating a
 * route for a non-routed internal module would violate §1.1 ("nothing
 * pretends to work"). primitive below is a confirmed-real module/
 * function path in every row, never a loom id these two don't have.
 */

const REGISTRY = {
  // §KEY-SHAPE FIX 2026-09-13 — one explicit row per real value in
  // fault-taxonomy.js's frozen KNOWN_FAULT_CLASSES, replacing the single
  // dead 'self-heal:heal' row (see header comment). All 8 share the same
  // primitive/principles as the row they replace — only the key changes.
  'self-heal:heal:stale_module': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:timeout': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:api_degraded': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:queue_saturated': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:memory_pressure': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:bottleneck': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:circuit_breaker': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'self-heal:heal:import_error': {
    primitive:  'cortex/self-heal (MODULE_ID)',
    invariants: [],
    principles: ['§1.2'],
  },
  'idearium:build': {
    primitive:  'idearium.spec-engine (MODULE_ID)',
    invariants: [],
    principles: ['§2.2', '§3.1'],
  },
  'agent-mesh:build': {
    primitive:  'cortex/core/raid/contract-intake.js#submitBuildPhaseContract',
    invariants: [],
    principles: ['§3.1'],
  },
  // §BUGFIX 2026-09-03 — found while investigating "RAID keeps failing
  // contracts": officiator.js (2026-09-02) submits with source
  // 'officiator-synthesis-tool' and 'officiator-synthesis-tool' (see
  // synthesizeFromContext) but was never added here, so every real
  // synthesized contract logged "no registered boundary" on every
  // submission — not a hard failure (§1.2's own design: unregistered
  // is real, inspectable information, not a swallowed gap), but a real,
  // easy-to-close gap directly adjacent to the SEAM VERDICT fix in the
  // same file this session, added while already here for it.
  'officiator:build': {
    primitive:  'cortex/core/raid/officiator.js#officiate',
    invariants: [],
    principles: ['§3.1'],
  },
  'officiator-synthesis-tool:build': {
    primitive:  'cortex/core/raid/officiator.js#synthesizeFromContext',
    invariants: [],
    principles: ['§3.1'],
  },
  'copilot:build': {
    primitive:  'copilot/server.js /build handler',
    invariants: [],
    principles: ['§1.2'],
  },
  // §MCO8 2026-09-13 — track_d (axiom §5.2 compliance, docs/2026-09-13-
  // axiom-5-2-raid-routing-phasemap.spec). architect/service.js's real
  // POST /api/blueprint/scan had zero RAID wiring before this — a real,
  // synchronous write action with no observability trail at all. Reuses
  // the exact submitContract()+reportExternalOutcome() additive pattern
  // idearium's chunk-dispatch already proved safe (§1.2: never blocks
  // real work on a RAID call failing).
  'architect:blueprint.scan': {
    primitive:  'architect/service.js POST /api/blueprint/scan',
    invariants: [],
    principles: ['§1.2', '§5.2'],
  },
  // §MCO12 2026-09-13 (Track D continuation) — the 3 remaining architect
  // routes confirmed to be real write work, not reads. blueprint.diff and
  // snr.check were named as Track D candidates too but checked directly
  // this pass and excluded: both are pure read/compute (blueprint.diff
  // reads two existing blueprints and diffs them; snr.check calls
  // snrGate.check() with no jaa write anywhere in the handler) — same
  // reads-are-excluded principle MCO7 already applied to GETs, just
  // caught on a POST verb this time. Only these 3 do real jaa.insert().
  'architect:map.scan': {
    primitive:  'architect/service.js POST /api/map/scan',
    invariants: [],
    principles: ['§1.2', '§5.2'],
  },
  'architect:translate.utl': {
    primitive:  'architect/service.js POST /api/translate/utl',
    invariants: [],
    principles: ['§1.2', '§5.2'],
  },
  'architect:gaps.open': {
    primitive:  'architect/service.js POST /api/gaps',
    invariants: [],
    principles: ['§1.2', '§5.2'],
  },
};

/**
 * resolveBoundary(source, intention) — real lookup, no fuzzy matching.
 * Returns the real { primitive, invariants, principles } object for an
 * EXACT (source, intention) pair, or null.
 *
 * §NEVER REFUSES — per synthesis-contract.spec's own corrected posture,
 * an unresolved boundary is real, honest information ("this contract's
 * source/intention combination has no registered boundary yet"), not a
 * reason to block submitContract(). The registry is sparse by design
 * (not pre-populated speculatively) — most contracts will legitimately
 * resolve to null for a while. Refusing on null would block real
 * traffic the same way a fabricated route would have; this module
 * only ever informs, never gates.
 */
function resolveBoundary(source, intention) {
  if (!source || !intention) return null;
  const key = `${source}:${intention}`;
  const row = REGISTRY[key];
  return row ? { key, ...row } : null;
}

/**
 * listBoundaries() — every real row, for an auditor or a UI to enumerate
 * without reaching into the module-private REGISTRY object directly.
 */
function listBoundaries() {
  return Object.entries(REGISTRY).map(([key, row]) => ({ key, ...row }));
}

module.exports = { resolveBoundary, listBoundaries, REGISTRY };
