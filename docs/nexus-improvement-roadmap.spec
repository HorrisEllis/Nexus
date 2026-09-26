spec:
  meta:
    name:        nexus-improvement-roadmap
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    status:      proposed
    uuid:        nexus-improvement-roadmap-v1-0000-2026-0627-jamesbrooks-001
    purpose: >
      All 30 improvements from the combined what-if loop (two rounds,
      deduplicated), specced as phase-style entries. leverage_tier follows
      NEXUS-IMPROVEMENT-MAP.md's plain-language groupings — 1 is highest
      (changes the cost of future work), 5 is hardening (no new capability,
      less failure). status is proposed for all — none of these are built.
      Plain-language explanation of each lives in NEXUS-IMPROVEMENT-MAP.md;
      this file is the engineering-reference half of that document.

  roadmap:

    'IMP-01':
      name: 'Session-to-spec compiler'
      leverage_tier: 1
      status: proposed
      maps_to: 'liminal assumption/structural detectors + CQL + module-builder.map(), run over a transcript'
      deps: ['liminal', 'cfr (query)', 'copilot/module-builder.js']

    'IMP-02':
      name: 'Standing spec-vs-code structural diff'
      leverage_tier: 1
      status: built  # corrected 2026-06-28 — was 'proposed', spec itself had drifted from code
      maps_to: 'lib/file-integrity.js — FNV-1a content hash of every system''s registry-components.js, checked on boot. Maps to IMP-02 + Phase 105 by its own header comment.'
      deps: ['lib/file-integrity.js', 'component-registry']
      note: >
        Original maps_to (spec-drift.js extended) was never built this way —
        file-integrity.js solves it independently. The other 29 IMP-* entries
        in this spec are still uniformly status:proposed and have not been
        re-audited against code — that was checked for IMP-02 only, on direct
        evidence, not assumed for the rest.

    'IMP-03':
      name: 'Spec-linter as eravos organism'
      leverage_tier: 1
      status: proposed
      maps_to: 'eravos organism wrapping IMP-02, via organism.spawn/wire.connect'
      deps: ['IMP-02', 'eravos']

    'IMP-04':
      name: 'Self-built audit tooling'
      leverage_tier: 1
      status: proposed
      maps_to: 'copilot/module-builder.js map→spec→QC→build loop applied recursively to build IMP-01 through IMP-03'
      deps: ['IMP-01', 'IMP-02', 'IMP-03', 'copilot/module-builder.js']

    'IMP-05':
      name: 'Unbuilt-idea ledger'
      leverage_tier: 1
      status: proposed
      maps_to: 'every what-if idea logged to JAA with a UUID, same pattern as gap-loop pending[] residue'
      deps: ['jaa-db', 'gap-loop']

    'IMP-06':
      name: 'Unify RAID trust and foreign-peer trust'
      leverage_tier: 2
      status: proposed
      maps_to: 'RAID constraint-then-fitness scoring unified with kern-v2 continuous sigma/regime trust decay (foundation addendum L4-EXTERNAL)'
      deps: ['raid', 'nexus-system-foundation-addendum-v1.1.0']

    'IMP-07':
      name: 'Component registry as MCP server'
      leverage_tier: 2
      status: proposed
      maps_to: 'expose component-registry.js capabilities via MCP, extending CLI=UI=API to CLI=UI=API=MCP'
      deps: ['component-registry']

    'IMP-08':
      name: 'Instance federation'
      leverage_tier: 2
      status: proposed
      maps_to: 'L4-EXTERNAL grammar-intersection handshake extended from system-to-system to instance-to-instance'
      deps: ['nexus-system-foundation-addendum-v1.1.0']

    'IMP-09':
      name: 'Bounded copilot-to-copilot negotiation'
      leverage_tier: 2
      status: proposed
      maps_to: 'grammar-intersection bounds assistant-to-assistant requests by construction, contingent on IMP-08'
      deps: ['IMP-08']

    'IMP-10':
      name: 'Personal OS and platform as one product'
      leverage_tier: 2
      status: proposed
      maps_to: 'user-model.js / affect.js / idea-lattice ported 1:1 as a platform account backing state'
      deps: ['lib/user-model.js', 'copilot/affect.js']

    'IMP-11':
      name: 'Stalled-feature trend detection'
      leverage_tier: 3
      status: proposed
      maps_to: 'lib/ase.js trajectory model (deepening/dissolving) applied to phase-map status history'
      deps: ['lib/ase.js']

    'IMP-12':
      name: 'Build-velocity regime classification'
      leverage_tier: 3
      status: proposed
      maps_to: 'nexus-analysis-module-foundation template applied to features-shipped-per-week'
      deps: ['nexus-analysis-module-foundation', 'lib/cfr/sigma.js', 'lib/cfr/delta.js']

    'IMP-13':
      name: 'RAID self-plateau detection'
      leverage_tier: 3
      status: proposed
      maps_to: 'nexus-analysis-module-foundation template applied to RAID routing-success-rate over time'
      deps: ['nexus-analysis-module-foundation', 'raid']

    'IMP-14':
      name: 'Scheduled self-audit'
      leverage_tier: 3
      status: proposed
      maps_to: 'architect spec-builder running the analysis-module template against its own drift history'
      deps: ['architect', 'nexus-analysis-module-foundation']

    'IMP-15':
      name: 'Recurring-gap trend tracking'
      leverage_tier: 3
      status: proposed
      maps_to: 'lib/ase.js trajectory model applied to diagnostic recurring-gap entries'
      deps: ['lib/ase.js', 'diagnostic']

    'IMP-16':
      name: 'Idea-momentum tracking'
      leverage_tier: 3
      status: proposed
      maps_to: 'lib/ase.js trajectory model applied to idearium ideas as works'
      deps: ['lib/ase.js', 'idearium']

    'IMP-17':
      name: 'Authorship authentication'
      leverage_tier: 4
      status: proposed
      maps_to: 'lib/ase.js identity-scale signature drift, AuthorSignature schema, evidence-and-confidence contract (see MASTER-SESSION-SPEC.md §7)'
      deps: ['lib/ase.js']

    'IMP-18':
      name: 'Non-verbal communication teaching tool'
      leverage_tier: 4
      status: proposed
      maps_to: 'expression-engine.js (FACS action units) + video-module.js (MediaPipe), reframed as general-pattern teaching, not profiling of identifiable people in source footage'
      deps: ['ALK expression-engine.js', 'ALK video-module.js']

    'IMP-19':
      name: 'Camera-driven mood reflection'
      leverage_tier: 4
      status: proposed
      maps_to: 'cfr-mesh-bridge.js 34-point landmark skeleton driving lib/cfr/field.js'
      deps: ['ALK cfr-mesh-bridge.js', 'lib/cfr/field.js']

    'IMP-20':
      name: 'Universal CLI autocomplete coverage'
      leverage_tier: 4
      status: proposed
      maps_to: 'close registry-components.js gaps (diagnostic, idearium) so lib/grammar-engine.js complete() has full coverage'
      deps: ['lib/grammar-engine.js']

    'IMP-21':
      name: 'Affect-gated autonomy'
      leverage_tier: 4
      status: proposed
      maps_to: 'copilot/affect.js regime gates copilot/module-builder.js MAX_ITER and auto-fix permission'
      deps: ['copilot/affect.js', 'copilot/module-builder.js']

    'IMP-22':
      name: 'Copilot-initiated reflection on INVERSION'
      leverage_tier: 4
      status: proposed
      maps_to: 'user-model.js INVERSION candidate triggers a copilot-initiated question in conversation'
      deps: ['lib/user-model.js (INVERSION revival)']

    'IMP-23':
      name: 'Live trajectory canvas view'
      leverage_tier: 4
      status: proposed
      maps_to: 'lib/ase.js trajectory view wired as an eravos organism'
      deps: ['lib/ase.js', 'eravos']

    'IMP-24':
      name: 'Platform-integrity behavior detection'
      leverage_tier: 4
      status: proposed
      maps_to: 'full ALK behavior-detector kernel applied to coordinated-inauthentic-behavior signals instead of interpersonal reading'
      deps: ['kernel-alk (full port)']

    'IMP-25':
      name: 'Account-takeover detection'
      leverage_tier: 4
      status: proposed
      maps_to: 'identity-scale ASE signature drift as account-security flag, visible only to account holder'
      deps: ['lib/ase.js']

    'IMP-26':
      name: 'Deliberate filter-bubble counter'
      leverage_tier: 4
      status: proposed
      maps_to: 'resonance-distance matching deliberately surfaces "far field" results on a schedule, labeled as such'
      deps: ['resonance package (consented scope only)']

    'IMP-27':
      name: 'Copilot-voiced relational signal'
      leverage_tier: 4
      status: proposed
      maps_to: 'private rupture/repair signal delivered conversationally by copilot; also nudges copilot/affect.js uncertainty/strain'
      deps: ['copilot/affect.js', 'relational detector (private-signal scope only, per prior session agreement)']

    'IMP-28':
      name: 'Epistemic-branch pilot on bridge'
      leverage_tier: 5
      status: proposed
      maps_to: 'clip/context/adapter-sandbox cluster piloted on bridge circuit-breaker decisions before wider rollout'
      deps: ['rfr2 nexus v6.0.0 cluster (clip, context, adapter-sandbox)']

    'IMP-29':
      name: 'Chronic hot-load strain flagging'
      leverage_tier: 5
      status: proposed
      maps_to: 'lib/hot-loader.js rollback cycles accumulate a strain score; chronic-strain modules flagged for human review'
      deps: ['lib/hot-loader.js']

    'IMP-30':
      name: 'Adaptive SEAM retry strategy'
      leverage_tier: 5
      status: proposed
      maps_to: 'per-job affect-style strain score changes SEAM retry prompt strategy per attempt instead of repeating unchanged'
      deps: ['seam']

  cut_from_this_round:
    description: >
      Both source rounds stopped generating once ideas stopped pointing at
      a real mechanism already in the codebase and started reusing
      vocabulary from earlier entries on systems with no actual analog
      (no audience, no repeat-encounter, no regime). Not specced, on purpose.
    examples: ['orchestrator dreaming', 'mood on the hook registry', 'ASE on NCP providers']
