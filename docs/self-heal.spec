spec:
  meta:
    name:        self-heal
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-self-heal-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      5-level escalation ladder wired to the healer organ and escalation engine. Subscribes to HEAL_REQUESTED. Runs level 0 (known fix) → level 1 (safe fix) → level 2 (snapshot+forge) → level 3 (deep scan) → level 4 (failure mode). Friction tracked per fault class.


  # ── ADDENDUM 2026-07-20 (v1.1.0) — BUILT ──
  addendum_2026_07_20:
    status: >
      Built as cortex/self-heal/index.js. 12 tests. Ladder level selected from
      the fault_taxonomy row's own count (min(count,3)); FAILURE_MODE checked
      first as level 4. L2 writes forge_patches status:'proposed' only — never
      'verified', never auto-applied. L3 uses the real 12-engine pack
      (lib/diag-engines via buildDiagSnapshot). SEMANTIC_GAP_TYPES is a §7.2
      judgment call (semantic_drift, spec_ambiguity, idea_unresolved,
      documentation_gap) — flagged as inferred in the file header, not found spec.
