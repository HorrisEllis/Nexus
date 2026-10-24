# The belief loop: claim → evidence (weighed, with provenance) → adversary → confidence → crystal → root cause → trust (2026-10-20)

origin: >-
  James, 2026-10-19: "tell me about the idea of it all? i want to map the traversal agnostically, using invarants overtime,
  primitives, and principles, what about using invariants to learn overtime, nexus, i mean."
  · 2026-10-20: "valuable? then the persistent memory, graphs, cross domain verification and borrowing"
  · 2026-10-20: "look at the crystalization memory"
  · 2026-10-20: "adversarial system. confidence scoring. evidence weighing and provenance root causal analysi"
  · 2026-10-20: "spec it."
  Earlier, his, and kept: 2026-10-05 (docs/2026-10-05-verified-primitives-phasemap.spec): "Clearglass can be used to verify, lifeline
  can ask other agents. Adversarial agents. Use the confidence score. … I want provinance." · the liminal-space design: "The
  intersection IS the verification." The idea, the direction and every piece are his; this map joins them into one loop. The coder's
  part: the census, the findings, the readings (marked) and the phase cut.

status: MAPPED 2026-10-20 — nothing built by this map yet. Stands on docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec.

supersedes-and-keeps: >-
  VP1_confidence_from_evidence, VP2_adversarial_review, VP4_the_primitive_field (its belief half), VP5_provenance of
  docs/2026-10-05-verified-primitives-phasemap.spec — absorbed as CF1, AV1, CY2, PV1 here; those phases stay in their map as the
  earlier reading (§0.3), with an addendum pointing here.

## Ground truth (read in the tree, 2026-10-20)

Crystals (the belief store he designed) — three producers, three schemas, one JAA table `crystals`, tier 'long' (never decays):
- meta/crystal-lattice.js: (domain, verb, outcome) seen ≥3× → CREATE_CRYSTAL / CREATE_NEGATIVE_CRYSTAL; plus lattice_edges (weights
  up on success, down on failure, decaying). FINDING: after crystallizing it resets its counter, so every 3 more sightings write a NEW
  row; usage_count stays 1, success_probability is fixed 1.0/0.0 — support never accumulates on a crystal; counts are in memory
  (a restart loses them).
- intelligence/liminal-space: crystallises by evidence (≥5 items, avg confidence ≥0.75) OR focal-point confirmation (the pattern
  appears where two memory levels meet — "The intersection IS the verification"); forward inference pre-stages a known fix.
- warp/plugins/crystallizer-flatfile.js: an exact cache digest → verdict, with invalidate() rollback (data: 1 entry). Memoization,
  not belief.
- cortex/cortex-v2.js `crystal show` READS the richest schema — statement, state (candidate|stable|decaying), confidence,
  stabilityScore, fragility, supportCount, crossLaneCount, contradictionScore, sourceUuids, promotedAt — which NO producer writes.
  FINDING: `ask-full` injects "ESTABLISHED BELIEFS" only from state === 'stable' crystals, so it always injects none.
Confidence — no shared score: lifeline's is from wording, crystals average, liminal thresholds at 0.75. lib/confidence.js (VP1) does
  not exist.
Evidence — strong verdicts that stand alone: lib/proposal-evidence.js (tests run before/after in a shadow copy: REGRESSION / fixed /
  unchanged), lib/verify-first.js, build-verify, the boundary ratchet, loom scanners (declared ≠ served). Nothing weighs one against
  another.
Adversarial — meta/adversary-suite.js (6 attack classes on execution results), intelligence/adversarial.js compare() (contradiction
  score between two reasoning outputs), copilot/adversarial.js (pings copilot's two faculties every 60 s). VP2 (others try to break a
  built thing; only reproduced findings count) is open.
Provenance — lib/idea-provenance.js (his vs an agent's), change records, .inject nodes (who, model, task), ledgers, work-journal. VP5
  (provenance for every primitive) is open.
Root cause — intelligence/cfr/graph.js (causal graph), lib/causal/anomaly.js, lib/diagnostic-causal.js. FINDING: nexus_rca returns
  gap.root_cause || 'unresolved', and nothing writes gap.root_cause — it always says "unresolved": the tool names an analysis that
  does not run.
Learning stores already counting invariants of their own: clear-glass page-memory (block stability, intent outcomes), upload rules
  (his moves), boundaries' learned budgets, agent-build-learning, bep_patterns.

## Readings (the coder's; to confirm where marked)

- "using invariants to learn overtime" — Nexus learns statements that keep holding (invariants), each with support and
  counterexamples per scope; scope lifts when it holds across contexts (one page → a kind of page → every site); invariants that
  hold across scopes are principles; making one law is his.
- "persistent memory" — the observation log (append-only) plus the beliefs derived from it (crystals), rebuildable from the log.
- "cross domain verification" — a claim is verified only when two independent domains agree (his focal-point rule, generalized).
- "borrowing" — an invariant learned in one domain proposed in another through a correspondence, entering with zero local support.
  To confirm: whether he also means borrowing between repos/projects (BW1 includes it).
- "evidence weighing and provenance root causal analysi" — read as one mechanism: weigh evidence by kind, independence, recency and
  source trust; when something breaks, follow provenance back through the causal graph to the belief and source that let it through,
  and lower that source's trust. To confirm.

## Decisions (decided by his axioms; he can overturn any — §0.3 addendum)

decisions:
  BL_D1_crystals_are_the_store:
    depends_on: []
    chosen: >-
      §8.6, §10.3: no new belief store. The crystal schema the CLI already reads becomes THE schema; the producers write it; WARP's
      exact cache stays separate (memoization, not belief) and lends its invalidate() rollback.
  BL_D2_evidence_over_wording:
    depends_on: []
    chosen: >-
      §0.1, §17.10: confidence is computed only from evidence; how sure an answer sounds is not an input; no evidence → "unscored",
      never a default.
  BL_D3_only_reproduced_attacks_count:
    depends_on: []
    chosen: >-
      §1.1: an adversary's claimed flaw becomes a check that is run; only a reproduced finding moves confidence; an unreproduced claim
      is recorded (and counts against that adversary's trust).
  BL_D4_unknown_stays_unknown:
    depends_on: []
    chosen: NC0 evidence rule — an unverifiable claim is unknown, never support.
  BL_D5_learning_is_counting:
    depends_on: []
    chosen: >-
      EXPLAINABILITY, REVERSIBILITY: support, counterexamples, decay and trust are counts with their sources; every belief can say
      why it is held; any belief can be rolled back (its evidence rows stay, §0.3).
  BL_D6_law_is_his:
    depends_on: []
    chosen: >-
      USER_AUTONOMY: Nexus may propose "this held N times across M scopes"; promoting it to a principle he relies on, or to an axiom,
      is his call, recorded as his decision with his words.

## Phases. Delivery per phase: backend → route → command → UI (UI tested in Clear Glass). Archive, never delete.

phases:

  RA0_rca_says_what_it_does:
    layer: integration
    status: OPEN
    depends_on: []
    files: [orchestrator/lib/mcp-server.js, intelligence/routes.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-RCA-HONEST]
    does: >-
      Today, first, small: nexus_rca and /api/intelligence/rca stop presenting "unresolved" as a finding. A gap with no analysis says
      "no root cause analysis has run for this gap" and names what evidence exists for it (its causal neighbours, its events). The
      record matches the code until RA1 lands.
    proof: the tool's output on a gap with no root_cause names that no analysis ran; its test asserts the wording

  CY0_one_crystal_schema:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [lib/crystal.js, lib/node-schemas/schema.crystal, lib/meta/crystal-lattice.js, intelligence/liminal-space/index.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-CRYSTAL]
    does: >-
      One schema (the CLI's: statement, kind, scope, state, confidence, stabilityScore, fragility, supportCount, crossLaneCount,
      contradictionScore, sourceUuids, evidence refs, provenance, promotedAt) and one writer lib/crystal.js (upsert by statement +
      scope: support ACCUMULATES on one crystal). crystal-lattice and liminal-space write through it; their own fields kept as a
      producer block. Existing rows read through an adapter, duplicates folded into supportCount on read, nothing deleted.
    proof: three sightings past threshold give ONE crystal with supportCount 3, not three rows; old rows still listed; a restart
      keeps the counts

  CY1_lifecycle_and_injection:
    layer: library
    status: OPEN
    depends_on: [CY0_one_crystal_schema, CF1_confidence_from_evidence]
    files: [lib/crystal.js, cortex/memory/tiers.js, cortex/cortex-v2.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-CRYSTAL-LIFECYCLE]
    does: >-
      candidate → stable → decaying → dissolved, and re-opened by a contradiction; decay by staleness and by counterexamples (the
      crystal tier stops being never-decay for beliefs; the evidence rows stay long-term). ask-full injects stable crystals — the
      empty injection fixed. Route + `crystal` commands (list/show/search exist in cortex-v2; they read real data).
    proof: a crystal reaches stable with support, decays when unseen, re-opens on a counterexample; ask-full shows the injected ones

  CY2_invariants_are_crystals:
    layer: integration
    status: OPEN
    depends_on: [CY0_one_crystal_schema, IV2_invariant_miner, CY1_lifecycle_and_injection]   # CY1 first: both change lib/crystal.js
    files: [lib/crystal.js, clear-glass/src/page/page-memory.js, lib/upload-placement.js, lib/core/invariant.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-CRYSTAL-SOURCES]
    does: >-
      Mined invariants are written as crystals; page-memory's stability and intent outcomes, and the upload rules learned from his
      answers, become crystal sources (their stores stay, read as views) — one belief store, many producers. VP4's "crystal" tier
      for proven components joins here (proven N times independently).
    proof: a block stable over five visits and an upload rule used three times both appear as crystals with their sources

  IV0_belief_census:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [docs/atlases/belief-census.md]
    spec: docs/belief-loop.spec
    blocks: [MOD-BELIEF-CENSUS]
    does: >-
      Every store that already learns by counting (crystals ×3 schemas, lattice_edges, page-memory, upload rules, learned budgets,
      agent-build-learning, bep_patterns, interstitial_spaces, warp crystals): what it counts, its scope, whether it decays, who reads
      it.
    proof: the census lists each with its real row counts on his data/

  IV1_invariant_kinds:
    layer: foundation
    status: OPEN
    depends_on: [IV0_belief_census, GR1_graph_primitive]
    files: [lib/core/invariant.js, lib/node-schemas/schema.invariant]
    spec: docs/belief-loop.spec
    blocks: [MOD-INVARIANT]
    does: >-
      A small, fixed set of invariant kinds over GR1 blocks and edges — exists · stable (address/signature) · cardinality · relation
      (contains / requires / never-crosses) · order · shape (a value's type) · outcome (intent → target works) — each checked against
      an observation as holds | broken | not-applicable.
    proof: each kind checked against a page observation and a code observation by the same code

  IV2_invariant_miner:
    layer: library
    status: OPEN
    depends_on: [IV1_invariant_kinds, TV1_traversal_primitive]
    files: [lib/core/invariant.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-INVARIANT-MINER]
    does: >-
      From the observation log: candidate invariants with minimum support AND varied contexts (two sightings never make a belief);
      scope lifting (one page → /jobs/:id → every site; one file → module → system → every repo); counterexamples kept, never
      averaged away.
    proof: a planted regularity across 5 pages is proposed at the generalized scope; one seen twice is not; a counterexample is kept

  PV1_provenance_on_every_claim:
    layer: foundation
    status: OPEN
    depends_on: [GR1_graph_primitive, NM1_one_name_per_file]
    files: [lib/provenance.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-PROVENANCE]
    does: >-
      §17.5 for every claim, verdict and crystal: who (agent, model, hat, or James — idea-provenance's rule), from what (spec,
      prompt digest, inputs), when, against which version, through which gate. Joined from the records that already exist (change
      records, injects, work-journal, ledgers) — a projection, not a new store. The claim's id is its registry id (NM1).
    proof: a crystal, a gate verdict and an applied change each answer who / from what / when / proved by, from existing records

  EW1_evidence_record_and_weights:
    layer: library
    status: OPEN
    depends_on: [GW1_gate_primitive, PV1_provenance_on_every_claim]
    files: [lib/evidence.js, lib/node-schemas/schema.evidence]
    spec: docs/belief-loop.spec
    blocks: [MOD-EVIDENCE]
    does: >-
      Every gate verdict and observation becomes evidence for a claim: { claim, kind: executed | static | declared | agent-claim |
      wording, domain, source, ts, provenance }. Weight = kind (an executed test > a static check > a declaration > an agent's say-so
      > wording, which is 0) × independence (a second domain counts more than a second sighting) × recency × source trust (RA2).
      Every weight says its parts.
    proof: two agreeing sightings from one source weigh less than one from a second domain; wording alone weighs zero, said

  CF1_confidence_from_evidence:
    layer: library
    status: OPEN
    depends_on: [EW1_evidence_record_and_weights]
    files: [lib/confidence.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-CONFIDENCE]
    does: >-
      VP1, as written by him: one score per claim from its evidence only, each part named; reproduced adversarial findings lower it;
      no evidence → "unscored". Every place with its own confidence (lifeline wording, liminal's average, crystal averages) reads this
      one or says why not.
    proof: a proven component with met conditions scores above one that only parses; a reproduced flaw lowers it; no evidence reads
      unscored

  AV1_adversarial_review:
    layer: service
    status: OPEN
    depends_on: [CF1_confidence_from_evidence, GW1_gate_primitive]
    files: [lib/adversarial-review.js, lib/meta/adversary-suite.js, intelligence/adversarial.js, copilot/lifeline.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-ADVERSARIAL-REVIEW]
    does: >-
      VP2, as written by him: a claim (a built component, a stable crystal before promotion) is sent through lifeline to agents other
      than its author, independently (agent-council's rule), to break it — attack classes from adversary-suite; reasoning claims
      compared with intelligence/adversarial.js. Each attack becomes a gate check that runs; only reproduced findings count; RAID
      governs. Local first: Ollama adversaries before any paid one.
    proof: a fixture with a real bug — the adversary's finding becomes a failing check and lowers confidence; a false claim is
      recorded, leaves the score unchanged, and lowers that adversary's trust

  RA1_root_cause_through_provenance:
    layer: library
    status: OPEN
    depends_on: [PV1_provenance_on_every_claim, TV1_traversal_primitive, EW1_evidence_record_and_weights, RA0_rca_says_what_it_does]
    files: [lib/root-cause.js, intelligence/routes.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-ROOT-CAUSE]
    does: >-
      When a gap opens or a gate fails: walk the causal graph back (cfr graph, phase runs, change records) to the beliefs and
      evidence that let the failure through, then to their sources. Writes gap.root_cause as a chain (failure ← change ← belief ←
      evidence ← source), each link with its evidence; a chain that cannot be closed says where it stops (L0_UNKNOWN, liminal's root
      terminus). nexus_rca returns the chain.
    proof: a planted regression traced to the change, the stale crystal that waved it through, and the source of that crystal

  RA2_learned_source_trust:
    layer: library
    status: OPEN
    depends_on: [RA1_root_cause_through_provenance]
    files: [lib/evidence.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-SOURCE-TRUST]
    does: >-
      RCA outcomes adjust the trust term of EW1 per source (an agent, a model, a check, a domain): a source on the chain of a failure
      loses trust; a source whose evidence held gains it; decays toward neutral; every change explained by the RCA that caused it.
    proof: after two RCAs blaming one model's evidence, its weight drops and the reason names both RCAs

  XD1_cross_domain_verification:
    layer: integration
    status: OPEN
    depends_on: [EW1_evidence_record_and_weights, GR2_graph_views, AD2_javascript_adapter, PRC1_phase_reality_check]
    files: [lib/cross-domain.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-CROSS-DOMAIN]
    does: >-
      His focal-point rule generalized: a claim is "verified" only when two independent domains agree. First pairs: DOM ↔ code (a
      button's request hits a route that exists and is served), docs ↔ code (a phase marked done has its files and passing proof —
      PRC1), upload ↔ run (an upload's resolved requires load). Disagreement is a finding, not an average.
    proof: a page button pointing at a missing route is flagged by the pair; a phase marked done without its files is flagged

  BW1_borrowing:
    layer: library
    status: OPEN
    depends_on: [XD1_cross_domain_verification, CY2_invariants_are_crystals]
    files: [lib/borrowing.js, lib/node-schemas/schema.correspondence]
    spec: docs/belief-loop.spec
    blocks: [MOD-BORROWING]
    does: >-
      A correspondence table (form ↔ function: field ↔ parameter, required ↔ non-optional, submit ↔ call · page region ↔ module ·
      navigation ↔ imports · this repo ↔ another repo) lets a crystal from one domain be proposed in another as a candidate with zero
      local support — never trusted until local evidence confirms it. Each correspondence's transfer rate is counted, so Nexus learns
      which analogies hold.
    proof: "one submit per form" proposed as "one entry point per module" enters as a candidate with zero support; confirmed locally it
      rises; a correspondence that keeps failing is demoted, said

  CY3_belief_panel:
    layer: interface
    status: OPEN
    depends_on: [CY1_lifecycle_and_injection, CF1_confidence_from_evidence, RA1_root_cause_through_provenance, TB1_toolbox]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/belief-panel.js]
    spec: docs/belief-loop.spec
    blocks: [MOD-BELIEF-PANEL]
    does: >-
      In the Toolbox: crystals by state with their confidence parts, evidence, provenance chain and counterexamples; RCA chains; the
      proposed principles, each with promote / reject — his decision, recorded with his words (BL_D6). `beliefs`, `belief <id>`,
      `promote <id>` commands.
    proof: tested in Clear Glass — a stable crystal opens to its evidence and provenance; promote records his decision

## First milestone (small, and it turns on what he already built)

RA0 (the RCA tool stops overstating — today) → CY0 (one crystal schema, support accumulates) → EW1 + CF1 on gate verdicts that already
exist (proposal-evidence, verify-first, build-verify) → CY1 (stable crystals actually injected). Then PV1 → RA1 → RA2 closes the loop.

## ADDENDUM 2026-10-20 — built from a full spec now; each phase specced again
James, 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt if
lost. … specs, then phases then specced again with dag and related files for it, look at the handoff"
The build contract is docs/belief-loop.spec (emerge module format; every module at specDepth 1.0). Each phase above now names `spec:` and the
module ids it builds in `blocks:`. Each phase is specced again as <owner>/phases/2026-10-20-belief-loop/<phase>.phase and its
graph/<phase>-<hash>.graph (related files with roles, crossings, the DAG slice), written by emerge/compiler/phase-specs.js.
