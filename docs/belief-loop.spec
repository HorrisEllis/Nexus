spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # belief-loop.spec — claim → evidence (weighed, with provenance) → adversary → confidence → crystal → root cause → trust.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js; every module and schema at
  # specDepth 1.0, invariants valid, no BLACK node (tests/modules/test-substrate-spec.test.js checks both specs). This file is the
  # build contract: if the code is lost, it is rebuilt from here. Stands on docs/substrate.spec (declared below as interfaces).
  # Phases: docs/2026-10-20-belief-loop-phasemap.spec (`blocks:` name these modules); per-phase specs written by substrate's
  # MOD-PHASE-SPECS beside each owner system.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        belief-loop
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-20T00:00:00Z
    status:      specced
    uuid:        nexus-belief-loop-spec-v1-0000-2026-1020-jamesbrooks-001
    origin: >-
      James, 2026-10-19: "what about using invariants to learn overtime, nexus, i mean." · 2026-10-20: "valuable? then the persistent
      memory, graphs, cross domain verification and borrowing" · "look at the crystalization memory" · "adversarial system. confidence
      scoring. evidence weighing and provenance root causal analysi" · "not phasemaps. full specs to build them. everything needs  to
      be speccced before built,so it can be rebuilt if lost."
      Kept and carried: his 2026-10-05 verified primitives ("Use the confidence score", "Adversarial agents", "I want provinance") and
      liminal-space's "The intersection IS the verification." The idea and the pieces are his; the coder wrote the contracts.
    purpose: >-
      Nexus holds beliefs the way it holds code: each with its evidence, its provenance, how sure it is and why, what contradicts it,
      and how it changed. It learns by counting what keeps holding (invariants) and lowers trust in sources whose evidence let a
      failure through. No model is trained; every belief can say why it is held, and can be rolled back.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, evidence-first, append-only, explainable]
    axioms: ["§0.1 evidence over memory", "§1.1 nothing real until proven", "§1.2 nothing fails silently", "§17.5 provenance",
      "§17.10 verify before promote", "§10.3 one truth layer", "§0.3 nothing lost", "USER_AUTONOMY: law is his", "NC0 unknown stays unknown"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "schemas and nodes" }

    constraints:
      - id: BL-001
        description: "Confidence is computed only from evidence records; wording is never an input; no evidence reads unscored."
        type: hard
        enforced_by: [GATE-BL-EVIDENCE-ONLY]
      - id: BL-002
        description: "One belief store: the crystals table, one schema, one writer (lib/crystal.js). WARP's exact cache stays separate."
        type: hard
        enforced_by: [GATE-BL-ONE-STORE]
      - id: BL-003
        description: "An adversary's claimed flaw counts only when its check runs and reproduces."
        type: hard
        enforced_by: [GATE-BL-REPRODUCED]
      - id: BL-004
        description: "Unknown evidence is never support; an unverifiable claim stays unknown."
        type: hard
        enforced_by: [GATE-BL-UNKNOWN]
      - id: BL-005
        description: "Every belief, weight and trust change carries its reasons and sources; rows are appended, never rewritten."
        type: hard
        enforced_by: [GATE-BL-EXPLAINED]
      - id: BL-006
        description: "Promoting a belief to a principle he relies on, or to an axiom, is his decision, recorded with his words."
        type: hard
        enforced_by: [GATE-BL-HIS-LAW]

  schemas:

    - id: Claim
      name: Claim
      description: "Something said to be true, about a block or a relation, by someone, at a time."
      fields:
        id:        "string — hash of statement + scope"
        statement: "string — the claim in one line (\"lib/bus.js exports emit(type, data)\")"
        subject:   "string — Block.id it is about (substrate)"
        scope:     "string — where it is claimed to hold (a repo, a site key, a map, 'nexus', 'any')"
        kind:      "string — fact | invariant | verdict | prediction | placement"
        by:        "string — who claimed it (agent+model, a check, a person, a producer module)"
        at:        "number — epoch ms"
        provenance: "string — Provenance.id"
      behavioral_contracts: ["the same statement + scope is the same claim (id), whoever says it"]
      error_paths: ["missing statement or scope → refused"]

    - id: Evidence
      name: Evidence
      description: "One piece of support or contradiction for a claim."
      fields:
        id:        "string"
        claim:     "string — Claim.id"
        polarity:  "string — supports | contradicts"
        kind:      "string — executed | static | declared | agent-claim | wording | unknown"
        domain:    "string — the domain it was observed in (js, docs, page, runs …)"
        source:    "string — the check, adapter, agent+model or person that produced it"
        at:        "number — epoch ms"
        provenance: "string — Provenance.id"
        ref:       "string — the record it came from (a Verdict, an Observation, a run row)"
      behavioral_contracts: ["appended, never edited", "kind unknown carries weight 0 and is kept"]
      error_paths: ["claim missing → refused", "a kind outside the list → refused"]

    - id: Provenance
      name: Provenance
      description: "§17.5 for anything Nexus holds: who, from what, when, against which version, through which gate."
      fields:
        id:        "string"
        who:       "object — { kind: person|agent|check|producer, name, model?, hat? }"
        fromWhat:  "object — { spec?, block?, promptDigest?, inputs[] }"
        when:      "number — epoch ms"
        version:   "string — the Nexus or repo version (commit) it was made against"
        through:   "string[] — the gates it passed (Verdict refs)"
        record:    "string — the existing record it was joined from (change record, inject, work-journal row, ledger entry)"
        his:       "boolean — true only when James himself is the author (idea-provenance's rule)"
      behavioral_contracts: ["a projection over existing records; never invents a field it cannot find — missing is said"]
      error_paths: ["no record found → { who: unknown, missing: [...] }"]

    - id: Crystal
      name: Crystal
      description: "A belief: a claim that has accumulated evidence, with a lifecycle (the schema cortex-v2's crystal show already reads)."
      fields:
        uuid:      "string"
        statement: "string — Claim.statement"
        claim:     "string — Claim.id"
        kind:      "string — fact | invariant | pattern | negative | principle"
        scope:     "string"
        state:     "string — candidate | stable | decaying | dissolved | reopened"
        confidence: "number|null — ConfidenceScore.value; null = unscored"
        stabilityScore: "number — fraction of observations of its scope in which it held"
        fragility: "number — contradictions weighted by recency, 0..1"
        supportCount: "number — supporting evidence rows"
        crossLaneCount: "number — independent domains/providers among the support"
        contradictionScore: "number — weighted contradictions"
        sourceUuids: "string[] — Evidence ids (latest 50), the rest by query"
        producers: "object — producer-specific fields kept (crystal-lattice, liminal-space)"
        promotedAt: "number|null — when he promoted it (BL-006)"
        updatedAt: "number"
      behavioral_contracts: ["upserted by claim id: support accumulates on one crystal, never a new row per sighting"]
      error_paths: ["a row of an older schema is read through the adapter, never rewritten"]

    - id: Invariant
      name: Invariant
      description: "A statement over blocks and edges that is expected to keep holding in a scope."
      fields:
        id:        "string — hash of kind + pattern + scope"
        kind:      "string — exists | stable | cardinality | relation | order | shape | outcome"
        pattern:   "object — the kind's parameters (e.g. { relation: 'never-crosses', from: 'lib', to: 'system:*' })"
        scope:     "string — where it is checked"
        support:   "number — observations in which it held"
        counter:   "number — observations in which it broke"
        contexts:  "number — distinct contexts (sites, repos, maps) among the support"
        lastHeld:  "number — epoch ms"
        lastBroken: "number|null"
      behavioral_contracts: ["a candidate needs support ≥ 3 in ≥ 2 contexts before it is written as a crystal"]
      error_paths: ["a kind outside the list → refused"]

    - id: ConfidenceScore
      name: ConfidenceScore
      description: "One number for a claim, from its evidence only, with each part named."
      fields:
        value:     "number|null — 0..1, null when unscored"
        parts:     "object[] — { evidence, weight, contribution }"
        support:   "number — summed supporting weight"
        against:   "number — summed contradicting weight"
        domains:   "number — independent domains in the support"
        reproducedFlaws: "number — adversarial findings that reproduced"
        unscoredWhy: "string|null — why there is no score"
        computedAt: "number"
      behavioral_contracts: ["value = support / (support + against + 1) × (1 − 0.25 × min(reproducedFlaws, 3)); null with unscoredWhy when support + against = 0"]
      error_paths: ["any wording-kind evidence is listed with weight 0"]

    - id: RootCauseChain
      name: RootCauseChain
      description: "Why a failure got through, from the failure back to the sources whose evidence let it."
      fields:
        failure:   "string — the gap, failed gate or regression it explains"
        links:     "object[] — ordered { kind: change|belief|evidence|source|gate, id, why, evidenceRef }"
        terminus:  "string — closed | L0_UNKNOWN (cannot be traced further; liminal's root terminus)"
        stopsAt:   "string|null — where the chain could not continue and why"
        sources:   "string[] — the sources implicated (for trust)"
        at:        "number"
        by:        "string — root-cause module version"
        confidence: "number|null — the chain's own confidence (min of its links)"
      behavioral_contracts: ["every link carries the evidence that connects it to the next; a guessed link is not written"]
      error_paths: ["no causal ancestor found → terminus L0_UNKNOWN with stopsAt"]

    - id: Correspondence
      name: Correspondence
      description: "A mapping that lets a belief from one domain be proposed in another."
      fields:
        id:        "string"
        from:      "string — domain + kind (page:form)"
        to:        "string — domain + kind (js:function)"
        roles:     "object — role mapping (field → parameter, required → non-optional, submit → call)"
        tried:     "number — borrowed beliefs proposed through it"
        confirmed: "number — of those, confirmed by local evidence"
        failed:    "number — of those, contradicted locally"
        author:    "string — who wrote the mapping (declared)"
      behavioral_contracts: ["transfer rate = confirmed / tried; demoted below 0.2 after 10 tries, said"]
      error_paths: ["roles that name a kind the target domain lacks → refused"]

  interfaces:

    - id: IF-GRAPH
      name: graph
      path: lib/core/graph.js
      description: "docs/substrate.spec MOD-GRAPH — Block, Edge, Observation and the append-only observation log."
      exports: ["observe(...) → Observation", "latest(scope)", "diff(prev, next)"]
      behavioral_contracts: ["edges carry evidence"]
      error_paths: ["not built yet — modules here wait on its phase (GR1)"]

    - id: IF-TRAVERSE
      name: traverse
      path: lib/core/traverse.js
      description: "docs/substrate.spec MOD-TRAVERSE — the one budgeted, deterministic walk."
      exports: ["walk(...) → WalkResult", "path(...)", "reach(...)"]
      behavioral_contracts: ["a cut names what was not visited"]
      error_paths: ["not built yet (TV1)"]

    - id: IF-GATE
      name: gate
      path: lib/core/gate.js
      description: "docs/substrate.spec MOD-GATE — pass | fail | unknown with evidence and residue."
      exports: ["gate(subject, checks, opts) → Verdict", "adapters.*"]
      behavioral_contracts: ["unknown never coerced to pass"]
      error_paths: ["not built yet (GW1)"]

    - id: IF-GRAPH-VIEWS
      name: graph-views
      path: lib/core/views/index.js
      description: "docs/substrate.spec MOD-GRAPH-VIEWS — existing graphs read as views."
      exports: ["read(viewId, opts) → { blocks, edges, cut }"]
      behavioral_contracts: ["views never write"]
      error_paths: ["not built yet (GR2)"]

    - id: IF-CRYSTAL-PRODUCERS
      name: crystal-producers
      path: lib/meta/crystal-lattice.js
      description: "The two producers writing crystals today: meta/crystal-lattice.js (domain:verb:outcome ≥3 → crystal) and intelligence/liminal-space (evidence ≥5 @0.75, or focal-point confirmation)."
      exports: ["crystal-lattice _maybeCrystallize(compartment, outcomeKind)", "liminal-space hold(focalPoint, item) → _checkCrystallisation"]
      behavioral_contracts: ["both insert into JAA `crystals` with their own schemas (2026-10-20 census)"]
      error_paths: ["crystal-lattice re-crystallizes the same signature as new rows; counts in memory"]

    - id: IF-CORTEX-CLI
      name: cortex-cli
      path: cortex/cortex-v2.js
      description: "crystal list/show/search and ask-full — read the Crystal schema above; ask-full injects state === 'stable'."
      exports: ["cmdCrystalList", "cmdCrystalShow", "cmdAskFull"]
      behavioral_contracts: ["reads only"]
      error_paths: ["no producer writes state → ask-full injects nothing (found 2026-10-20)"]

    - id: IF-RCA-ROUTE
      name: rca-route
      path: intelligence/routes.js
      description: "/api/intelligence/rca buildRCA() and the nexus_rca MCP tool (orchestrator/lib/mcp-server.js)."
      exports: ["buildRCA(limit) → [{ gapId, type, cause: g.root_cause || 'unresolved', since, sigma }]"]
      behavioral_contracts: ["reads open gaps"]
      error_paths: ["nothing writes gap.root_cause → always 'unresolved' (found 2026-10-20)"]

    - id: IF-CAUSAL
      name: causal
      path: intelligence/cfr/graph.js
      description: "The causal graph over the ledger (causedBy, sessionId, jobId) plus lib/causal/anomaly.js."
      exports: ["CausalGraph"]
      behavioral_contracts: ["edges only from fields events carry"]
      error_paths: ["an event with no causal fields is isolated"]

    - id: IF-EVIDENCE-SOURCES
      name: evidence-sources
      path: lib/proposal-evidence.js
      description: "Verdicts that already exist: proposal-evidence (REGRESSION/fixed/unchanged), verify-first (verified/failed/shallow), build-verify, the boundary ratchet, loom scanners."
      exports: ["each module's own verdict function"]
      behavioral_contracts: ["each verdict stands alone today; nothing weighs them"]
      error_paths: ["a verdict without provenance → Provenance.missing said"]

    - id: IF-PROVENANCE-RECORDS
      name: provenance-records
      path: lib/change-record.js
      description: "Records provenance is joined from: change-record (FR1), .inject nodes (who, model, task), lib/work-journal.js, lib/idea-provenance.js, ledgers."
      exports: ["change-record record(...)", "repo-inject get(id)", "idea-provenance tag rules"]
      behavioral_contracts: ["nothing here is a new store"]
      error_paths: ["a record that cannot be found → missing, said"]

    - id: IF-ADVERSARIES
      name: adversaries
      path: lib/meta/adversary-suite.js
      description: "meta/adversary-suite.js (6 attack classes), intelligence/adversarial.js compare() (contradiction score), copilot/lifeline.js (ask other agents), lib/agent-council.js (independent answers)."
      exports: ["adversary-suite attack classes", "compare({ left, right }) → { contradictionScore }", "lifeline ask(...)"]
      behavioral_contracts: ["RAID governs dispatch"]
      error_paths: ["no adversary available → review is unknown, said"]

    - id: IF-COUNTING-STORES
      name: counting-stores
      path: clear-glass/src/page/page-memory.js
      description: "Stores that already learn by counting: page-memory (block stability, intent outcomes), upload rules (lib/upload-placement.js learn), learned budgets, agent-build-learning, bep_patterns."
      exports: ["page-memory forPage(page)", "upload-placement learn(plan, edits, rules)"]
      behavioral_contracts: ["their stores stay; they are read as crystal sources"]
      error_paths: ["store unavailable → source skipped, said"]

    - id: IF-REALITY-CHECK
      name: reality-check
      path: lib/phase-reality.js
      description: "PRC1_phase_reality_check (OPEN, infrastructure-spine map) — phases checked against the tree."
      exports: ["check(phase) → consistent | drift | maybe-done | uncheckable | orphaned"]
      behavioral_contracts: ["docs ↔ code pair for cross-domain"]
      error_paths: ["not built yet — XD1 waits on it"]

    - id: IF-JS-ADAPTER
      name: js-adapter
      path: lib/adapters/js.js
      description: "AD2_javascript_adapter (OPEN) — the JS domain behind the neutral contract."
      exports: ["detect, parse, symbols, dependencies, test, build — any may answer unknown"]
      behavioral_contracts: ["wraps verify-first, exportsOf, loom's scanner, run-target"]
      error_paths: ["not built yet — XD1 waits on it"]

  modules:

    - id: MOD-RCA-HONEST
      name: rca-honest
      uuid: nexus-belief-rca-honest-v1-0000-2026-1020-001
      path: intelligence/routes.js
      phase: RA0_rca_says_what_it_does
      description: "buildRCA and nexus_rca stop presenting 'unresolved' as a finding: a gap with no analysis says so and lists the evidence that exists for it."
      deps: [{ name: rca-route }, { name: causal }]
      exports: ["buildRCA(limit) → [{ gapId, type, cause: string|null, analysed: boolean, evidence: { events, causalNeighbours }, since, sigma }]", "nexus_rca text: 'no root cause analysis has run for this gap' when analysed is false"]
      gate_pipeline: ["GATE-RA0-001: gap → root_cause present? analysed true : false", "GATE-RA0-002: not analysed → count its events and causal neighbours", "GATE-RA0-003: tool text from analysed"]
      behavioral_contracts: ["the route's existing fields keep their names; cause is null (not 'unresolved') when nothing ran"]
      error_paths: ["causal graph unavailable → evidence.causalNeighbours null with why"]
      acceptance: ["a gap with no root_cause: the tool says no analysis ran and names its evidence"]

    - id: MOD-CRYSTAL
      name: crystal
      uuid: nexus-belief-crystal-v1-0000-2026-1020-001
      path: lib/crystal.js
      phase: CY0_one_crystal_schema
      description: >-
        The one writer of the crystals table. upsert(claim, evidenceRow) finds the crystal by claim id and accumulates
        (supportCount, crossLaneCount, contradictionScore, sourceUuids) — never a new row per sighting. crystal-lattice and
        liminal-space call it, their own fields kept under producers.<name>. read() adapts the older rows: a crystal-lattice row
        (pattern_signature) and a liminal row (focalPoint/type) become Crystals; duplicates of one signature fold into one with their
        counts summed. Nothing is deleted.
      deps: [{ name: crystal-producers }, { name: graph }]
      schema_refs: [Crystal, Claim, Evidence]
      exports:
        - "upsert({ claim, evidence, producer, producerFields }) → Crystal"
        - "read({ state, kind, scope, limit }) → Crystal[] (old rows adapted)"
        - "get(uuidOrClaim) → Crystal | null"
      gate_pipeline:
        - "GATE-CY-001: claim → Claim.id; find crystal by claim (and by legacy signature)"
        - "GATE-CY-002: evidence → counts; crossLaneCount = distinct domains/sources of support"
        - "GATE-CY-003: write: append the new version row (same uuid, newer updatedAt); readers take the latest"
        - "GATE-CY-004: emit crystal.updated { uuid, supportCount, state }"
      behavioral_contracts:
        - "three sightings past threshold → one crystal, supportCount 3"
        - "a restart keeps counts (they are in the rows, not memory)"
      error_paths:
        - "JAA unavailable → returns { ok:false, why } and the producer logs it (§1.2)"
      acceptance: ["one crystal with supportCount 3, not three rows", "old rows still listed", "counts survive a restart"]

    - id: MOD-CRYSTAL-LIFECYCLE
      name: crystal-lifecycle
      uuid: nexus-belief-crystal-lifecycle-v1-0000-2026-1020-001
      path: lib/crystal.js
      phase: CY1_lifecycle_and_injection
      description: >-
        state from evidence: candidate → stable when confidence ≥ 0.7 and supportCount ≥ 5 and crossLaneCount ≥ 2 (settings);
        stable → decaying when unseen for 30 days or fragility ≥ 0.3; decaying → dissolved after 90 days unseen; any state →
        reopened on a contradiction with weight ≥ the latest support. The belief tier decays (cortex/memory/tiers.js gains
        crystals_beliefs: decaying), the evidence rows stay long-term. ask-full injects stable crystals (the empty injection fixed).
      deps: [{ name: crystal }, { name: confidence }, { name: cortex-cli }]
      exports: ["transition(crystal, now) → { state, why }", "sweep(now) → { changed: [{ uuid, from, to, why }] }"]
      gate_pipeline: ["GATE-CL1-001: crystal + confidence → rule table above", "GATE-CL1-002: changed → append version, emit crystal.state"]
      behavioral_contracts: ["thresholds are settings (never hidden)", "every transition says its rule"]
      error_paths: ["confidence unscored → stays candidate, said"]
      acceptance: ["stable with support; decays unseen; reopens on a counterexample; ask-full shows injected crystals"]

    - id: MOD-CRYSTAL-SOURCES
      name: crystal-sources
      uuid: nexus-belief-crystal-sources-v1-0000-2026-1020-001
      path: lib/crystal-sources.js
      phase: CY2_invariants_are_crystals
      description: "Producers feed crystals through MOD-CRYSTAL: mined invariants (MOD-INVARIANT-MINER), page-memory stability and intent outcomes, upload rules learned from his answers, learned chunk granularity, proven components (VP4)."
      deps: [{ name: crystal }, { name: invariant-miner }, { name: counting-stores }]
      exports: ["sync({ since }) → { written, skipped: [{ source, why }] }"]
      gate_pipeline: ["GATE-CS2-001: each source → claims + evidence rows", "GATE-CS2-002: upsert each through MOD-CRYSTAL"]
      behavioral_contracts: ["the sources' stores stay; they are read"]
      error_paths: ["a source unreadable → skipped, said"]
      acceptance: ["a block stable over five visits and an upload rule used three times appear as crystals with their sources"]

    - id: MOD-BELIEF-CENSUS
      name: belief-census
      uuid: nexus-belief-census-v1-0000-2026-1020-001
      path: lib/belief-census.js
      phase: IV0_belief_census
      description: "Every store that learns by counting: what it counts, scope, decay, readers, row counts on James's data; output docs/atlases/belief-census.md."
      deps: [{ name: counting-stores }, { name: crystal-producers }]
      exports: ["census({ root, dataDir }) → stores[]", "toMarkdown(census)"]
      gate_pipeline: ["GATE-IV0-001: known stores + grep for jaa.insert into *_patterns/*crystal*/*_edges", "GATE-IV0-002: counts from data"]
      behavioral_contracts: ["read-only, counts from reads"]
      error_paths: ["data absent → counts null with why"]
      acceptance: ["each store listed with real counts"]

    - id: MOD-INVARIANT
      name: invariant
      uuid: nexus-belief-invariant-v1-0000-2026-1020-001
      path: lib/core/invariant.js
      phase: IV1_invariant_kinds
      description: >-
        The seven kinds and their checks against an Observation: exists (a block matching pattern is present) · stable (a block's
        address/signature unchanged since last) · cardinality (count of matching children within [min,max]) · relation (contains /
        requires / never-crosses between kinds) · order (a before b in a sequence) · shape (an attribute's type/format) · outcome (an
        intent's chosen target succeeded). check() → holds | broken | not-applicable with the blocks that decided it.
      deps: [{ name: graph }, { name: belief-census }]
      schema_refs: [Invariant]
      exports: ["check(invariant, observation) → { result, blocks, why }", "kinds() → string[]", "stable(scope) → Invariant[] (crystals of kind invariant, state stable)"]
      gate_pipeline: ["GATE-IV1-001: kind → checker", "GATE-IV1-002: pattern → matching blocks/edges", "GATE-IV1-003: result with deciding blocks"]
      behavioral_contracts: ["the same code checks a page observation and a code observation"]
      error_paths: ["unknown kind → refused", "observation lacks the domain → not-applicable"]
      acceptance: ["each kind checked on a page and a code observation"]

    - id: MOD-INVARIANT-MINER
      name: invariant-miner
      uuid: nexus-belief-invariant-miner-v1-0000-2026-1020-001
      path: lib/core/invariant.js
      phase: IV2_invariant_miner
      description: >-
        From the observation log of a scope: propose candidates per kind (templates over frequent block kinds and edge relations),
        count support and counterexamples across observations, keep those with support ≥ 3 in ≥ 2 contexts; lift scope when the
        same invariant holds in ≥ 3 sibling scopes (pages of one site key → the site; sites → any site; files → module → system →
        any repo). Counterexamples are kept, never averaged away.
      deps: [{ name: invariant }, { name: traverse }]
      exports: ["mine({ scope, observations, limit }) → Invariant[]", "lift(invariants) → Invariant[]"]
      gate_pipeline: ["GATE-IV2-001: observations → candidate templates", "GATE-IV2-002: check each over all observations", "GATE-IV2-003: threshold", "GATE-IV2-004: lift"]
      behavioral_contracts: ["two sightings never make a belief", "mining is bounded (limit, said when cut)"]
      error_paths: ["fewer than 2 observations → nothing proposed, said"]
      acceptance: ["a regularity across 5 pages proposed at the generalized scope; one seen twice is not; a counterexample kept"]

    - id: MOD-PROVENANCE
      name: provenance
      uuid: nexus-belief-provenance-v1-0000-2026-1020-001
      path: lib/provenance.js
      phase: PV1_provenance_on_every_claim
      description: "Provenance as a projection: for a claim, verdict, crystal or change, join who/from what/when/version/through from the existing records; missing parts said."
      deps: [{ name: provenance-records }, { name: graph }]
      schema_refs: [Provenance]
      exports: ["of(ref) → Provenance", "chain(ref) → Provenance[] (what it was made from, recursively, budgeted)"]
      gate_pipeline: ["GATE-PV-001: ref kind → the record type", "GATE-PV-002: join fields", "GATE-PV-003: missing listed"]
      behavioral_contracts: ["no new store", "his flag only from idea-provenance's rule"]
      error_paths: ["record not found → who unknown, missing listed"]
      acceptance: ["a crystal, a verdict and an applied change each answer who/from what/when/proved by"]

    - id: MOD-EVIDENCE
      name: evidence
      uuid: nexus-belief-evidence-v1-0000-2026-1020-001
      path: lib/evidence.js
      phase: EW1_evidence_record_and_weights
      description: >-
        Evidence rows from verdicts and observations, and their weights: weight = kindWeight × independence × recency × trust.
        kindWeight: executed 1.0, static 0.6, declared 0.4, agent-claim 0.2, wording 0, unknown 0. independence: the first row from a
        domain counts 1, further rows from the same source and domain count 0.25 each (a second sighting) — a new domain counts 1.
        recency: half-life 60 days. trust: MOD-SOURCE-TRUST's value for the source (1 when none).
      deps: [{ name: gate }, { name: provenance }, { name: evidence-sources }]
      schema_refs: [Evidence, Claim]
      exports: ["record(evidence) → Evidence", "fromVerdict(verdict, claim) → Evidence[]", "weigh(claimId, now) → [{ evidence, weight, parts }]"]
      gate_pipeline: ["GATE-EW-001: row → schema", "GATE-EW-002: append", "GATE-EW-003: weigh on read"]
      behavioral_contracts: ["every weight returns its four parts", "wording is listed with weight 0, never dropped silently"]
      error_paths: ["unknown claim → refused"]
      acceptance: ["two sightings from one source weigh less than one from a second domain; wording weighs zero, said"]

    - id: MOD-CONFIDENCE
      name: confidence
      uuid: nexus-belief-confidence-v1-0000-2026-1020-001
      path: lib/confidence.js
      phase: CF1_confidence_from_evidence
      description: "VP1 as he wrote it: one score per claim from its weighed evidence only (ConfidenceScore formula in the schema); every place with its own confidence reads this or says why not."
      deps: [{ name: evidence }]
      schema_refs: [ConfidenceScore]
      exports: ["score(claimId, now) → ConfidenceScore"]
      gate_pipeline: ["GATE-CF-001: weigh(claim)", "GATE-CF-002: sum support/against, count domains and reproduced flaws", "GATE-CF-003: formula or unscored"]
      behavioral_contracts: ["no evidence → value null, unscoredWhy 'no evidence'"]
      error_paths: ["evidence store unavailable → null with why"]
      acceptance: ["proven + conditions met scores above parses-only; a reproduced flaw lowers it; no evidence reads unscored"]

    - id: MOD-ADVERSARIAL-REVIEW
      name: adversarial-review
      uuid: nexus-belief-adversarial-review-v1-0000-2026-1020-001
      path: lib/adversarial-review.js
      phase: AV1_adversarial_review
      description: >-
        VP2 as he wrote it: a claim (a built component, a crystal before promotion) is sent through lifeline to agents other than its
        author, independently (agent-council), local models first; each claimed flaw must come as a runnable check (a test or a
        condition); the check runs through MOD-GATE; reproduced → contradicting evidence (kind executed) and reproducedFlaws +1;
        not reproduced → recorded, no score change, the adversary's trust lowered.
      deps: [{ name: confidence }, { name: gate }, { name: adversaries }]
      exports: ["review({ claim, adversaries, budget }) → { findings: [{ by, check, reproduced, verdict }] }"]
      gate_pipeline: ["GATE-AV-001: pick adversaries ≠ author", "GATE-AV-002: ask independently", "GATE-AV-003: each finding → check → gate()", "GATE-AV-004: evidence rows"]
      behavioral_contracts: ["no adversary sees another's answer", "RAID governs dispatch"]
      error_paths: ["a finding with no runnable check → recorded as unreproducible"]
      acceptance: ["a real bug's finding becomes a failing check and lowers confidence; a false claim leaves it and lowers the adversary's trust"]

    - id: MOD-ROOT-CAUSE
      name: root-cause
      uuid: nexus-belief-root-cause-v1-0000-2026-1020-001
      path: lib/root-cause.js
      phase: RA1_root_cause_through_provenance
      description: >-
        failure → walk the causal graph backwards (in, relations causes/changed-by, budget) to the change that introduced it → the
        beliefs and verdicts that waved the change through (their Evidence) → those evidence rows' sources. Writes gap.root_cause as
        the RootCauseChain; nexus_rca returns it. A chain that cannot close ends L0_UNKNOWN with where it stopped.
      deps: [{ name: provenance }, { name: traverse }, { name: evidence }, { name: rca-honest }, { name: causal }]
      schema_refs: [RootCauseChain]
      exports: ["analyse(failureRef) → RootCauseChain", "write(gapId, chain) → void"]
      gate_pipeline: ["GATE-RA1-001: failure → causal ancestors", "GATE-RA1-002: change → verdicts and crystals that passed it", "GATE-RA1-003: their evidence → sources", "GATE-RA1-004: write chain, emit rca.chain"]
      behavioral_contracts: ["every link carries its evidence; no guessed link"]
      error_paths: ["no ancestor → L0_UNKNOWN with stopsAt"]
      acceptance: ["a planted regression traced to the change, the stale crystal that passed it, and that crystal's source"]

    - id: MOD-SOURCE-TRUST
      name: source-trust
      uuid: nexus-belief-source-trust-v1-0000-2026-1020-001
      path: lib/evidence.js
      phase: RA2_learned_source_trust
      description: "Trust per source from outcomes: a source on a root-cause chain −0.1, a source whose evidence held when checked +0.02; bounded [0.2, 1.5]; decays toward 1 with a 90-day half-life; every change cites the chain or check that caused it."
      deps: [{ name: root-cause }]
      exports: ["trust(source) → { value, history }", "adjust(source, delta, cause) → void"]
      gate_pipeline: ["GATE-ST-001: chain → implicated sources", "GATE-ST-002: append adjustment rows", "GATE-ST-003: value = bounded decayed sum"]
      behavioral_contracts: ["no adjustment without a cause ref"]
      error_paths: ["unknown source → value 1"]
      acceptance: ["after two chains blaming one model, its weight drops and names both"]

    - id: MOD-CROSS-DOMAIN
      name: cross-domain
      uuid: nexus-belief-cross-domain-v1-0000-2026-1020-001
      path: lib/cross-domain.js
      phase: XD1_cross_domain_verification
      description: "His focal-point rule generalized: verified(claim) iff supporting evidence from ≥ 2 independent domains and no unrefuted contradiction. Pairs first: DOM ↔ code (a button's request hits a served route), docs ↔ code (PRC1), upload ↔ run."
      deps: [{ name: evidence }, { name: graph-views }, { name: js-adapter }, { name: reality-check }]
      exports: ["verified(claimId) → { verified, domains, disagreements }", "pairs() → [{ a, b, check }]"]
      gate_pipeline: ["GATE-XD-001: claim → evidence by domain", "GATE-XD-002: pair checks run", "GATE-XD-003: disagreement → finding, not an average"]
      behavioral_contracts: ["one domain, however many sightings, is never 'verified'"]
      error_paths: ["a domain adapter missing → unknown for that pair, said"]
      acceptance: ["a page button pointing at a missing route flagged; a done phase without its files flagged"]

    - id: MOD-BORROWING
      name: borrowing
      uuid: nexus-belief-borrowing-v1-0000-2026-1020-001
      path: lib/borrowing.js
      phase: BW1_borrowing
      description: "A crystal from domain A proposed in domain B through a Correspondence, as a candidate with zero local support; local evidence decides; the correspondence's transfer rate is counted and it is demoted when it keeps failing."
      deps: [{ name: cross-domain }, { name: crystal-sources }]
      schema_refs: [Correspondence]
      exports: ["propose({ crystal, correspondence }) → Claim (candidate)", "settle(correspondenceId) → { rate, demoted }"]
      gate_pipeline: ["GATE-BW-001: crystal → mapped statement", "GATE-BW-002: candidate claim, support 0", "GATE-BW-003: outcomes → counts"]
      behavioral_contracts: ["a borrowed claim never starts with support"]
      error_paths: ["roles do not map → refused, said"]
      acceptance: ["'one submit per form' → 'one entry point per module' enters at zero support; confirmed it rises; a failing correspondence is demoted"]

    - id: MOD-BELIEF-PANEL
      name: belief-panel
      uuid: nexus-belief-panel-v1-0000-2026-1020-001
      path: idearium/ui/js/belief-panel.js
      phase: CY3_belief_panel
      description: "Routes GET /api/beliefs, /api/beliefs/:id, POST /api/beliefs/:id/promote|reject (his, with his words); commands beliefs, belief, promote; a Toolbox section: crystals by state with confidence parts, evidence, provenance chain, counterexamples, RCA chains."
      deps: [{ name: crystal-lifecycle }, { name: confidence }, { name: root-cause }]
      exports: ["routes beliefs.*", "commands beliefs, belief, promote", "ui renderBeliefPanel"]
      gate_pipeline: ["GATE-BP-001: read crystals + scores + provenance", "GATE-BP-002: promote requires { by: 'james', words } — recorded as his decision"]
      behavioral_contracts: ["promote and reject only by him (BL-006)", "everything else read-only"]
      error_paths: ["promote without words → 400"]
      acceptance: ["tested in Clear Glass: a stable crystal opens to evidence and provenance; promote records his decision"]

  events:
    belief:
      - "crystal.updated { uuid, supportCount, state }"
      - "crystal.state { uuid, from, to, why }"
      - "evidence.recorded { id, claim, kind, domain, source }"
      - "confidence.scored { claim, value, unscoredWhy }"
      - "adversary.finding { claim, by, reproduced }"
      - "rca.chain { failure, terminus, sources }"
      - "trust.adjusted { source, delta, cause }"
      - "belief.promoted { uuid, by, words }"

  enforcement:
    gates:
      - { id: GATE-BL-EVIDENCE-ONLY, name: evidence-only, severity: fatal, check: "lib/confidence.js reads only lib/evidence.js weigh()", on_failure: "build failure" }
      - { id: GATE-BL-ONE-STORE, name: one-store, severity: fatal, check: "no module but lib/crystal.js inserts into `crystals`", on_failure: "build failure" }
      - { id: GATE-BL-REPRODUCED, name: reproduced-only, severity: fatal, check: "an adversary finding changes confidence only with a gate Verdict ref", on_failure: "row refused" }
      - { id: GATE-BL-UNKNOWN, name: unknown-not-support, severity: fatal, check: "kind unknown weighs 0", on_failure: "suite red" }
      - { id: GATE-BL-EXPLAINED, name: explained, severity: fatal, check: "every weight, state change and trust change has parts/why/cause", on_failure: "row refused" }
      - { id: GATE-BL-HIS-LAW, name: his-law, severity: fatal, check: "promote requires by james and his words", on_failure: "400" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles in emerge's kg-builder at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines, each a named test in the phase that builds it"
