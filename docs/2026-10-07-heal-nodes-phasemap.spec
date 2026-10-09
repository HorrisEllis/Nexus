spec:
  meta:
    name:     heal-nodes
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:  1.0.0
    date:     2026-10-07
    release:  "each phase its own minor (0.4x.0)"
    uuid:     nexus-heal-nodes-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "cortex/self-heal + nexus/autopilot.js + lib/nexstore + intelligence/liminal-space"
    status:   "MAPPED. Nothing built."
    origin: >
      James, 2026-10-07: "anything else you can use to improve the performance? intelligence? also diagnostic system
      and self-heal system, creating .heal nodes? for repairing nexus?"
    continues: >-
      docs/self-heal.spec (the 5-level ladder), docs/2026-10-05-failure-reproduction-phasemap.spec (FM1–FM4: a failure
      is a macro, run in COS), docs/2026-09-28-staging-self-heal-phasemap.spec (S2 heal loop onto staging, S3 verify
      gate), docs/2026-10-07-runtime-load-phasemap.spec (PF2 velocity, PF6 slow ticks), docs/2026-10-07-versionium-releases-phasemap.spec (VR1: every change a commit).

  grounded:
    ladder:   "cortex/self-heal/index.js — level 0 replay forge_patches (successRate>0.5) + fix_map; 1 the 8 known fault classes; 2 propose (never auto-applied); 3 the 12 diag engines; 4 failure_mode (a human's)"
    forensics: "cortex/self-heal/failure-mode-forensics.js — .failure_mode nodes with causal chain + sigma deltas, and .debug_macro"
    taxonomy: "cortex/self-heal/fault-taxonomy.js — the one writer of fault_taxonomy (friction, count, successRate)"
    forward:  "intelligence/liminal-space _forwardInference — when a crystallised pattern predicts a precursor, it looks up a known fix in forge_patches and pre-stages it"
    nodes:    "lib/nexstore/record.js — typed nodes with by, at, causedBy (required), prev hash; intelligence/data/nodes/<type>/<uuid>.<type>"
    gap: >-
      The ladder only hears gaps and anomaly.detected. The faults in James's run never reached it: nexus/autopilot.js
      emits autopilot.kernel.crash and autopilot.circuit.open (with the child's stderr in hand: "Reached heap limit")
      and NOTHING subscribes to either; a cortex stall is not an event at all. And a fix that worked is a forge_patches
      row with a success rate — not a node that says what broke, why, what fixed it, and how that was proven.

  decided:
    what_a_heal_is: >-
      A .heal node is the immune memory of one repair: failure → cause → fix → proof → outcome. It is CAUSED BY the
      .failure_mode it answers (causedBy required by the node store), points at the .debug_macro that reproduced it,
      and at the versionium commit that is the fix (code) — or names the runtime act (restart with a larger heap, defer
      a ticker, change a setting). It is not trusted because it was written; it is trusted because its proof ran.
    shape: >-
      { signature: { faultClass, fingerprint },   # what it answers (fingerprint: the normalised error + where)
        failureMode, macro,                        # causedBy and the reproduction
        cause,                                     # the rfr2 root (FM1) or the slow tick (PF6)
        fix: { kind: code|config|runtime, commit?, setting?, act? },
        proof: { kind: macro|metric, before, after, at },   # the macro now passes, or the metric back in band for N min
        outcome: { applied, held, recurred, successRate }, # updated each time it is used
        state: proposed|proven|trusted|demoted, by, at }
    authority: "a runtime/config heal inside bounds may apply itself once proven; a CODE heal always lands through land() as a proposal the person approves (personOnly). Same rule as today's level 2 — 'never auto-applied' stays true for code."
    notes_cannot_lie: "a heal whose signature recurs after it was applied is demoted and its failure_mode reopened — success is measured, never declared."

  phases:
    HL0_runtime_faults_reach_the_ladder:
      does: >-
        Subscribe the ladder to autopilot.kernel.crash and autopilot.circuit.open; classify from the stderr tail the
        supervisor already holds (heap_exhaustion "Reached heap limit", eperm_rename, port_in_use, module_not_found …,
        added to fault-taxonomy's named classes); PF6's tick.slow → loop_stall; PF2's runaway → overload. Each becomes a
        .failure_mode with the crash's own evidence (process, rss/heap at death, the last slow ticks, the tables' sizes).
      proof: "a child that dies of heap exhaustion under a real autopilot becomes a heap_exhaustion failure_mode naming the process and its biggest tables"
    HL1_the_heal_node:
      does: "the node type, its one writer (cortex/self-heal/heal.js), proposed from level 2 and from a person's or agent's fix tied to a failure_mode; proof by macro (FM3) or by metric (a runtime heal: heap/lag back in band for N minutes)."
      proof: "a failure_mode + a fix commit → a proposed heal; its macro passes → proven; it recurs → demoted, failure_mode reopened"
    HL2_level_zero_reads_heals:
      does: "level 0 replays a TRUSTED heal whose signature matches (runtime/config: applied in bounds; code: a proposal to the person with the heal's proof attached). forge_patches stays the proposal table; heals are what was proven."
      proof: "the second heap_exhaustion of the same signature is met by its heal, not by a new ladder climb"
    HL3_heal_before_it_breaks:
      does: "liminal forward inference looks heals up instead of forge_patches: when the precursors of a known failure appear (velocity runaway, a tick turning slow, a table near its cap), the heal is pre-staged — or, for a runtime heal, applied early."
      proof: "precursors of a fixture failure → its heal staged before the failure happens"
    HL4_the_heal_ledger:
      does: "every heal on the activity log and the Nexus compartment's release notes (RN3): what broke, what fixed it, proven how, how often it has held. `idearium heals` (a CM1 row, so copilot has it too)."
      proof: "a heal shows in `idearium heals` and copilot's nexus.command with its proof"

  ordering: "HL0 → HL1 → HL2 → HL3 → HL4. HL0 needs nothing; HL1's code heals need FM2/FM3 (the macro), runtime heals do not; HL3 needs PF2."
