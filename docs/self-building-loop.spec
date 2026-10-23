spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # self-building-loop.spec — Idearium builds its phases on its own: what can be built now → build → prove → land → close → next.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, invariants
  # valid, no BLACK node (tests/modules/test-substrate-spec.test.js). The build contract: if the code is lost, it is rebuilt from here.
  # Phases: docs/2026-10-23-self-building-loop-phasemap.spec (SL0–SL6; `blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        self-building-loop
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-23T00:00:00Z
    status:      specced
    uuid:        nexus-self-building-loop-spec-v1-0000-2026-1023-jamesbrooks-001
    origin: >-
      James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
      them, we need this to work so it can start building itself." · "contiue getting idearium building phases". The direction is his;
      the coder traced the loop (it is open at five places: nothing marks a phase done, nothing starts the next, nothing lands without
      him, no list of what is buildable, stuck runs keep spending) and wrote these contracts.
    purpose: >-
      Close the loop the phase build already has: one deterministic answer to what can be built now and why the rest cannot; a phase
      whose proof passed and whose changes are on disk closes itself; the stale backlog closes by evidence; the next phase starts when
      one closes, inside a budget and a stop rule; he is asked only what is his.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [deterministic-first, evidence-first, reversible, explainable]
    axioms: ["§0.1 evidence over memory", "§1.1 nothing real until proven", "§1.2 nothing fails silently", "§0.3 nothing lost",
      "§3.3 map before build", "§8.6 reuse before build", "§5.2/§9.1 routing through RAID", "USER_AUTONOMY: what lands without him is his", "REVERSIBILITY"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "phasemaps" }

    constraints:
      - id: SL-001
        description: "A phase closes only on evidence: a proven phase gate whose changes are on disk (SL1), or its own tests passing on the files that exist (SL2). A proof met only by proposals laid over the files never closes it."
        type: hard
        enforced_by: [GATE-SL-EVIDENCE]
      - id: SL-002
        description: "Every close is reversible and said: it names its run, version or tests; undoing a change of its run reopens the phase."
        type: hard
        enforced_by: [GATE-SL-REVERSIBLE]
      - id: SL-003
        description: "One writer of a phase's status: the existing _phaseSetStatus / roadmap.js setPhaseStatus (a repo version per write). No second writer."
        type: hard
        enforced_by: [GATE-SL-ONE-WRITER]
      - id: SL-004
        description: "The queue is deterministic: the same maps and records give the same queue; every open phase is in exactly one group, with its reason."
        type: hard
        enforced_by: [GATE-SL-DETERMINISTIC]
      - id: SL-005
        description: "What lands without him is his rule (SL5); until he sets it, every change waits for him as today, and the loop still builds, proves and lists."
        type: hard
        enforced_by: [GATE-SL-HIS-RULE]
      - id: SL-006
        description: "The loop never spends past its budget or past the stop rule; a skipped phase is listed with why, never dropped."
        type: hard
        enforced_by: [GATE-SL-BOUNDED]

  schemas:

    - id: QueueEntry
      name: QueueEntry
      description: "A phase that can be built now, in build order."
      fields:
        key:       "string — '<map>::<phase id>'"
        map:       "string — the phasemap path"
        id:        "string — the phase id"
        layer:     "number — its DAG layer (lower first)"
        unlocks:   "number — how many open phases wait on it (more first within a layer)"
        files:     "string[] — the files it names"
        why:       "string — 'ready: deps closed, files named, no open decision, not done by evidence, no same-file conflict upstream'"
      behavioral_contracts: ["ordered by layer, then unlocks (desc), then key", "never contains a phase in a Blocked group"]
      error_paths: ["a map that does not parse → its phases are Blocked with group 'map-unreadable'"]

    - id: Blocked
      name: Blocked
      description: "An open phase that cannot be built now, with what would unblock it."
      fields:
        key:       "string"
        group:     "string — decision | deps-open | no-files | cycle | dangling | conflict | done-by-evidence | held | map-unreadable"
        why:       "string — the specific reason (the open dep's id, the cycle, the file both change)"
        unblock:   "string — what would unblock it (his decision named, the files to name, the phase to finish first)"
      behavioral_contracts: ["exactly one group per phase (the first that applies, in the order above)"]
      error_paths: ["none — a phase nothing else explains is group 'deps-open' with its open deps listed"]

    - id: CloseRecord
      name: CloseRecord
      description: "Why a phase was closed (or reopened)."
      fields:
        key:       "string"
        how:       "string — proven-run | by-evidence | reopened"
        run:       "string|null — the run id whose phase gate was proven"
        version:   "string|null — the version (commit) its changes landed in"
        tests:     "string[] — the tests that passed (by-evidence)"
        value:     "string — the status text written ('DONE 0.60.222 — proven by run r1, version v-9')"
        at:        "number — epoch ms"
      behavioral_contracts: ["appended to the activity log and the run; the map's status line carries value"]
      error_paths: ["the write is refused by setPhaseStatus (roundtrip) → not closed, said with the refusal"]

    - id: LoopRun
      name: LoopRun
      description: "One run of the loop over a repo."
      fields:
        repo:      "string — repo uuid"
        started:   "number"
        budget:    "object — { calls, minutes } for this run"
        spent:     "object — { calls, minutes }"
        built:     "string[] — phase keys built in order"
        closed:    "string[] — phase keys closed"
        skipped:   "object[] — { key, why } (his decision, his rule)"
        stopped:   "string|null — budget | stop-rule | queue-empty | stopped-by-person"
      behavioral_contracts: ["one loop per repo at a time", "every step is a flight (FR6)"]
      error_paths: ["a build that throws → the phase is held (group held) and the loop moves on"]

    - id: TrustRule
      name: TrustRule
      description: "His rule for what lands without him, per repo."
      fields:
        repo:      "string"
        rule:      "string — A (always ask) | B (project repos land when every gate passed) | C (B, and Nexus except kept files)"
        kept:      "string[] — files that always ask (C)"
        by:        "string — 'james'"
        words:     "string — his words when he set it"
      behavioral_contracts: ["default A until he sets it", "said on every change it lands"]
      error_paths: ["set without his words → refused"]

  interfaces:

    - id: IF-PHASE-DAG
      name: phase-dag
      path: lib/phase-dag.js
      description: "DG3 — every phase of every phasemap in one DAG."
      exports: ["build(maps, { mapped }) → dag { nodes, ready, cycles, dangling, conflicts, layers }", "slice(dag, key)"]
      behavioral_contracts: ["ready = open, no open depends_on, not in a cycle, no dangling ref"]
      error_paths: ["a map loom cannot parse contributes no phases"]

    - id: IF-PHASE-CENSUS
      name: phase-census
      path: lib/phase-census.js
      description: "CNS1 — each phase judged against its evidence (commits, releases, files)."
      exports: ["census({ root, system, maps, git, rels }) → { phases, counts, order }", "judge(node, ctx)"]
      behavioral_contracts: ["work that names no phase id cannot be seen by it (its own finding)"]
      error_paths: ["no git → judged from files and releases only"]

    - id: IF-FLIGHT
      name: flight-data
      path: lib/flight-data.js
      description: "FR6 — a run read whole: verdict (landed, STUCK …), calls, minutes, per agent."
      exports: ["flight(rows) → { verdict, … }", "summary(flights) → per agent land rate"]
      behavioral_contracts: ["landed = proven or contract-complete"]
      error_paths: ["no rows → no flight"]

    - id: IF-PHASE-STATUS
      name: phase-status
      path: idearium/api/index.js
      description: "_phaseSetStatus(repo, { map, phase, status, reason }) → roadmap.js setPhaseStatus: the one writer of a phase's status; a repo version per write; loom reads it back or nothing changes."
      exports: ["_phaseSetStatus(repo, { map, phase, status, force, reason }) → { ok, … }", "setPhaseStatus({ text, mapName, phaseId, status }) — status planned | active | complete"]
      behavioral_contracts: ["status_previous kept above status (§0.3)"]
      error_paths: ["ROUNDTRIP_FAILED → nothing changed"]

    - id: IF-PHASE-BUILD
      name: phase-build
      path: idearium/api/index.js
      description: "_phaseBuild — the one phase build: DG1/DG2/DG3 gates, the agent ladder, test first, the contract through RAID, the proof."
      exports: ["POST /api/repos/:uuid/phases/build { map, phase } → run", "phase gate proven | contract-complete | contract-incomplete"]
      behavioral_contracts: ["refuses DEPS_OPEN, NO_GRAPH, DAG_INVALID", "the proof runs against the changes laid over the files"]
      error_paths: ["timeouts per rung; the watchdog retries a stall (10 min)"]

    - id: IF-REPO-INJECT
      name: repo-inject
      path: lib/repo-inject.js
      description: "Changes as .inject nodes: propose, apply, revert, the write mode (review | auto)."
      exports: ["list(repoUuid, { status })", "get(id)", "apply(id, { layer, approvedBy })", "revert(id, { layer, merge })", "modeFor(repo)"]
      behavioral_contracts: ["every Nexus repo is review", "an applied or reverted change becomes a version (commitNow, labels name the inject)"]
      error_paths: ["apply refuses a regression its evidence found"]

    - id: IF-TEST-MAP
      name: test-map
      path: lib/test-map.js
      description: "Which tests exercise a file (direct links)."
      exports: ["testsFor(file, { root }) → [{ file, how }]"]
      behavioral_contracts: ["direct links only"]
      error_paths: ["no test linked → []"]

    - id: IF-ECONOMY
      name: economy-resume
      path: idearium/api/index.js
      description: "AB1 (0.60.165) — a rate-limit hold waits and retries; the watchdog _watchRuns/_autoRetry."
      exports: ["_autoRetry(run) on a stall or economy hold"]
      behavioral_contracts: ["re-runs the same phase only"]
      error_paths: ["the stall timeout (10 min) is shorter than a claude-code attempt (15 min)"]

  modules:

    - id: MOD-SL-QUEUE
      name: build-queue
      uuid: nexus-sl-build-queue-v1-0000-2026-1023-001
      path: lib/build-queue.js
      phase: SL0_what_can_be_built_now
      description: >-
        One deterministic answer to "what can be built now". Over a repo's phasemaps: the DAG (phase-dag) gives ready phases;
        each open phase is checked in a fixed order and put in exactly one place: a decision it depends on is open → decision;
        an open depends_on → deps-open; in a cycle → cycle; a dangling reference → dangling; no files → no-files; an open phase
        upstream changes the same file → conflict; every file exists and the census or verify-first already counts it done →
        done-by-evidence; three failed flights the same way → held; else the queue. The queue is ordered by layer, then how many
        phases it unlocks.
      deps: [{ name: phase-dag }, { name: phase-census }, { name: flight-data }]
      schema_refs: [QueueEntry, Blocked]
      exports:
        - "queue({ maps, root, flights, exists }) → { queue: QueueEntry[], blocked: Blocked[], counts: { open, queue, byGroup } }"
        - "lines(result, { limit }) → string[]"
      gate_pipeline:
        - "GATE-SL0-001: maps → dag (phase-dag build); open = nodes not done"
        - "GATE-SL0-002: each open phase → the first group that applies, with why and unblock"
        - "GATE-SL0-003: the rest → QueueEntry, ordered layer, unlocks desc, key"
      behavioral_contracts:
        - "the same input gives the same output (no clock, no model)"
        - "counts.open = queue + every group, always"
      error_paths: ["a map that does not parse → its phases in group map-unreadable, said"]
      acceptance: ["over a fixture with a decision, an open dep, a cycle, a phase with no files, a same-file pair and a done-by-evidence phase: each in its group; the queue in order", "over Nexus's maps: every open phase in exactly one place"]

    - id: MOD-SL-CLOSE
      name: phase-close
      uuid: nexus-sl-phase-close-v1-0000-2026-1023-001
      path: lib/phase-close.js
      phase: SL1_a_proven_phase_closes_itself
      description: >-
        The loop's missing write. closeIfLanded(run) checks the run: its phase gate proven; every change of the run applied (on
        disk), none still a proposal; then writes the phase complete through the one writer, its value naming the run and the
        version ("DONE <version> — proven by run <id>, version <commit>"), and appends a CloseRecord. In review mode it is called
        again when the run's last change is applied. reopenIfUndone(inject) reopens the phase (status active, with why) when a change
        of the closing run is reverted.
      deps: [{ name: phase-status }, { name: repo-inject }, { name: phase-build }]
      schema_refs: [CloseRecord]
      exports:
        - "landed(run, { injects }) → { landed: boolean, waiting: string[], why }"
        - "closeIfLanded({ repo, run, setStatus, injects, version }) → { closed: boolean, record?: CloseRecord, why }"
        - "reopenIfUndone({ repo, inject, setStatus, closes }) → { reopened: boolean, why }"
      gate_pipeline:
        - "GATE-SL1-001: run → proven? else not closed (why: the gate's verdict)"
        - "GATE-SL1-002: the run's injects → all applied? else waiting (their paths)"
        - "GATE-SL1-003: write complete through setStatus; append the record; emit phase.closed"
      behavioral_contracts:
        - "a proof met only by overlays (any change still proposed) never closes it"
        - "closing twice is a no-op (already complete, said)"
      error_paths: ["setStatus refuses (ROUNDTRIP_FAILED) → not closed, said with the refusal"]
      acceptance: ["a proven run with its change applied closes its phase with the run and version in the status", "with the change still proposed it waits and names it", "reverting the change reopens it"]

    - id: MOD-SL-EVIDENCE-CLOSE
      name: done-by-evidence
      uuid: nexus-sl-done-by-evidence-v1-0000-2026-1023-001
      path: lib/phase-close.js
      phase: SL2_done_by_evidence
      description: >-
        The stale backlog closed by evidence. For an open phase whose files all exist: its tests (the phase's own test-first file
        when it has one, else the tests linked to its files, test-map) are run; all pass and at least one ran → it closes as
        "DONE by evidence <date> — <tests>"; else it stays open with what is missing (a file, a failing test, no test). dryRun lists
        what it would close and writes nothing.
      deps: [{ name: test-map }, { name: phase-status }, { name: phase-census }]
      schema_refs: [CloseRecord]
      exports: ["byEvidence({ phases, root, run, dryRun, setStatus }) → { closed: CloseRecord[], open: [{ key, missing }], ran }"]
      gate_pipeline:
        - "GATE-SL2-001: every file exists? else open (missing files)"
        - "GATE-SL2-002: tests → run each; none ran → open (no test: nothing can check it)"
        - "GATE-SL2-003: all passed → close through setStatus (unless dryRun)"
      behavioral_contracts: ["no test, no close (a phase with no test stays open, said)", "dryRun writes nothing"]
      error_paths: ["a test that times out counts as failed"]
      acceptance: ["the dry run over a fixture: one phase closes (its test passes), one stays (its test fails), one stays (no test)"]

    - id: MOD-SL-GROOM
      name: phase-groom
      uuid: nexus-sl-phase-groom-v1-0000-2026-1023-001
      path: lib/phase-groom.js
      phase: SL3_the_backlog_groomed
      description: >-
        The no-files and no-depends_on phases made buildable: the phase mapper's inferred files and dependencies (phase-map-auto)
        are proposed into the map as a change (repo-inject), each with what it came from; a same-file pair with no order gets a
        proposed order from the DAG's layers. Cycles and dangling references are listed for a person.
      deps: [{ name: phase-dag }, { name: repo-inject }]
      exports: ["groom({ maps, root, mapped }) → { proposals: [{ map, phase, files, dependsOn, from }], forAPerson: [{ key, why }] }"]
      gate_pipeline:
        - "GATE-SL3-001: phases with no files or no depends_on → the mapper's inferred ones"
        - "GATE-SL3-002: proposals as one change per map; never written without a person or his rule"
      behavioral_contracts: ["a proposal names its evidence for every file and edge", "nothing is written silently"]
      error_paths: ["the mapper finds nothing → for a person, said"]
      acceptance: ["a phase with no files gets a proposal naming the files its words point at, with their evidence"]

    - id: MOD-SL-LOOP
      name: autobuild-loop
      uuid: nexus-sl-autobuild-loop-v1-0000-2026-1023-001
      path: idearium/lib/autobuild.js
      phase: SL4_the_loop
      description: >-
        The loop: take the queue's first phase, build it (phase-build), and when its run ends call closeIfLanded; then take the next.
        It stops on the budget (calls, minutes), on the stop rule (the same failure from different agents: FR10), on an empty queue,
        or when a person stops it. A phase needing his decision, or a change his rule keeps for him, is skipped and listed. One loop
        per repo. Also raises the stall timeout to cover the longest rung (claude-code 15 min).
      deps: [{ name: build-queue }, { name: phase-close }, { name: phase-build }, { name: economy-resume }, { name: flight-data }, { name: trust-rule }]
      schema_refs: [LoopRun]
      exports: ["start({ repo, budget }) → LoopRun", "stop(repo) → LoopRun", "status(repo) → LoopRun | null", "step(loop) → { built?, closed?, skipped?, stopped? }"]
      gate_pipeline:
        - "GATE-SL4-001: budget left and not stopped? else stop (why)"
        - "GATE-SL4-002: queue first → build; held or refused → skip with why"
        - "GATE-SL4-003: run ended → closeIfLanded; the next"
      behavioral_contracts: ["never two loops on one repo", "every built phase is a flight", "skipped are listed, never dropped"]
      error_paths: ["a build throws → that phase is held and the loop moves on, said"]
      acceptance: ["three chained fixture phases started once build, close and advance in order; a fourth needing a decision is skipped and listed; the budget stops it"]

    - id: MOD-SL-TRUST
      name: trust-rule
      uuid: nexus-sl-trust-rule-v1-0000-2026-1023-001
      path: lib/trust-rule.js
      phase: SL5_when_a_proven_change_lands_alone
      description: >-
        His rule for what lands without him, per repo: A always asks (the default, today); B a change lands by itself in his project
        repos when every deterministic gate passed (test first seen failing then passing, the batch test, the regression and export
        screens), undo one click away; C as B and Nexus too, except the files he keeps. Set only with his words.
      deps: [{ name: repo-inject }]
      schema_refs: [TrustRule]
      exports: ["get(repo) → TrustRule", "set({ repo, rule, kept, words }) → TrustRule", "allows(repo, change) → { lands: boolean, why }"]
      gate_pipeline: ["GATE-SL5-001: no rule set → A", "GATE-SL5-002: B/C → every gate on the change passed? lands : asks, with why"]
      behavioral_contracts: ["set requires by james and his words", "said on every change it lands"]
      error_paths: ["set without words → refused"]
      acceptance: ["A asks; B lands a change whose gates all passed in a project repo and asks in a Nexus repo; C asks for a kept file"]

    - id: MOD-SL-STATS
      name: loop-stats
      uuid: nexus-sl-loop-stats-v1-0000-2026-1023-001
      path: lib/build-queue.js
      phase: SL6_the_loop_counts_itself
      description: "The numbers: phases closed per day without him, land rate per phase kind and per agent, calls and minutes per closed phase, what stopped the loop and how often — read from the flights and the close records."
      deps: [{ name: flight-data }, { name: build-queue }]
      exports: ["stats({ flights, closes, since }) → { closedPerDay, landRate, perPhase, stops }"]
      gate_pipeline: ["GATE-SL6-001: flights + closes → the numbers"]
      behavioral_contracts: ["read only; nothing stored beside the flights and closes"]
      error_paths: ["no flights → zeros, said"]
      acceptance: ["after the loop fixture: closed 3, stopped 1 (decision), calls and minutes per phase match the flights"]

  events:
    loop:
      - "phase.closed { key, how, run, version }"
      - "phase.reopened { key, why }"
      - "loop.started { repo, budget }"
      - "loop.step { repo, key, outcome }"
      - "loop.stopped { repo, why }"

  enforcement:
    gates:
      - { id: GATE-SL-EVIDENCE, name: evidence-only, severity: fatal, check: "phase-close closes only a proven run with every change applied, or a phase whose tests ran and passed", on_failure: "not closed, said" }
      - { id: GATE-SL-REVERSIBLE, name: reversible, severity: fatal, check: "every close names its run/version/tests; reverting a change of the run reopens the phase", on_failure: "suite red" }
      - { id: GATE-SL-ONE-WRITER, name: one-writer, severity: fatal, check: "no module but roadmap.js setPhaseStatus writes a phase's status", on_failure: "build failure" }
      - { id: GATE-SL-DETERMINISTIC, name: deterministic, severity: fatal, check: "build-queue uses no clock or model; counts.open equals queue plus groups", on_failure: "suite red" }
      - { id: GATE-SL-HIS-RULE, name: his-rule, severity: fatal, check: "trust-rule defaults to A; set requires his words", on_failure: "refused" }
      - { id: GATE-SL-BOUNDED, name: bounded, severity: fatal, check: "the loop stops at its budget or the stop rule; every skip is listed", on_failure: "loop stopped" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles in emerge's kg-builder at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines, each a named test in the phase that builds it"
