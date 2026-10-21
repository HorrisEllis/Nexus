spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # pipeline.spec — the build pipeline: a request or a phase → dependencies, spec, phase, chunks → gates → plan → test first →
  # verify first → contract bricks or planned files → landing → proof → the run record. As built (specced from the source, so it
  # can be rebuilt) plus what connects it to the rest of Nexus.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec); compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK
  # node, invariants valid (tests/modules/test-substrate-spec.test.js). Modules with `status: built` are the as-built contract and
  # name the release that built them; the others name their phase and map.
  # Siblings: cortex/spec/raid-build.spec (RAID, contracts, gates) · idearium/spec/workspace.spec (Code, Phases, Ideas & Notes).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        pipeline
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-20T00:00:00Z
    status:      specced
    uuid:        nexus-pipeline-spec-v1-0000-2026-1020-jamesbrooks-001
    origin: >-
      James, 2026-10-20: "specs that relate to the pipeline, idearium, raid. the coding tab, phase tab, ideas and notes tab
      interconnected to the rest of the project" · "everything needs  to be speccced before built,so it can be rebuilt if lost."
      The pipeline is the record of his calls, each quoted where it was built: "Every thing the agents do. Needs to determine
      dependancies, spec, phase, then chunk." (FN0) · "an intent for the reasoning, to map and plan, then ollama codes in chunks" (PC1)
      · "needs to build a test first then use that to shape expectation and conditions." (TF2) · "need verify first" (VF1) · "each
      phase, has to have a dependany graph before executing." (DG2) · "every phasemap phase needs extensive dag" (DG3) · "that needs to
      ask me, like proposals'" (AQ).
    purpose: >-
      Turn a phase (or a request) into landed, proven code with every step gated, recorded, and recoverable after a restart; ask him
      only for what the axioms do not settle.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, gated, evidence-first, append-only runs]
    axioms: ["§3.3 map before build", "§1.2 nothing fails silently", "§5.2 routing through RAID", "§0.1 evidence over memory",
      "docs/CLAUDE.md deterministic first, local by default", "USER_AUTONOMY: a conflict between his plan and his test is his"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "phasemaps and nodes" }

    constraints:
      - id: PL-001
        description: "No phase is built without its dependency graph (DG2), with open dependencies (DG1, unless anyway), or in a cycle / with a dangling depends_on (DG3, unless anyway)."
        type: hard
        enforced_by: [GATE-PL-GRAPH]
      - id: PL-002
        description: "Every build step writes a run row (idearium_phase_runs) before and after it acts; a final state is always reached (run-watch)."
        type: hard
        enforced_by: [GATE-PL-RUN-ROWS]
      - id: PL-003
        description: "Code lands only through lib/repo-inject.js (propose → apply), never by a direct file write from the pipeline."
        type: hard
        enforced_by: [GATE-PL-ONE-DOOR]
      - id: PL-004
        description: "A file that already exists is checked with no model before any agent is asked (verify-first)."
        type: hard
        enforced_by: [GATE-PL-VERIFY-FIRST]
      - id: PL-005
        description: "A plan that contradicts a frozen test stops the build and asks him; it is never guessed past."
        type: hard
        enforced_by: [GATE-PL-ASK]

  schemas:

    - id: PhaseRun
      name: PhaseRun
      description: "One row of idearium_phase_runs: one step of one build of one phase."
      fields:
        uuid:      "string — runId + step suffix (-started, -plan1-planned, -c2-…)"
        runId:     "string — the build"
        repoUuid:  "string"
        map:       "string — the phasemap path"
        phase:     "string — the phase key"
        state:     "string — building | planning | planned | plan-refused | plan-failed | test-first | routed | running | replied | reviewing | contract | contract-blocked | contract-complete | contract-incomplete | paused | retrying | refused | failed | stalled | skipped | proven | unproven | no-proof | needs-you"
        provider:  "string|null — the agent/model of this step"
        snapshot:  "string — the Versionium commit taken before the build"
        graphHash: "string — the phase graph it was built against (DG2)"
        error:     "string|null — why, in words"
        ts:        "number"
      behavioral_contracts: ["append-only; a build's final state is one of run-watch FINAL", "a refusal row says the gate and its remedy"]
      error_paths: ["a row with no runId or phase → refused by appendRow"]

    - id: PhasePlan
      name: PhasePlan
      description: "lib/phase-plan.js PLAN_SHAPE — what the planner maps for a phase before any code."
      fields:
        system:    "string|null — the owning system"
        read:      "string[] — what the planner read"
        intent:    "string"
        spec:      "string[] — spec sections it builds"
        files:     "object[] — { path, new, layer, purpose, exports: [{ name, signature }], imports, steps }"
        order:     "string[] — file order"
        conditions: "object[] — CHECK_KINDS checks the build must meet"
        testFirst: "object|null — { path, code } when TF2 wrote it"
      behavioral_contracts: ["parsePlan refuses a plan missing files or order; derivePlan exists for a plan-less phase (no model)"]
      error_paths: ["unparseable planner reply → plan-refused row with the reason, retried up to the planner limit"]

    - id: FunnelAnswer
      name: FunnelAnswer
      description: "lib/work-funnel.js funnel() — a request answered in his order, no model."
      fields:
        request:   "string"
        dependencies: "object — files and components the request touches, and what uses them"
        spec:      "object — the spec and section that owns it, or none"
        phase:     "object — the phase it belongs to, or a proposed new one"
        chunks:    "object[] — the units it would be built in"
        open:      "boolean — isOpen(): any answer still missing"
        lines:     "string[] — the four answers as text"
        enters:    "string — ENTERS: where it came in (Code tab, CLI, agent)"
      behavioral_contracts: ["the four answers in his order: dependencies, spec, phase, chunks"]
      error_paths: ["no repo dir → dependencies unknown, said"]

    - id: PlanTestAsk
      name: PlanTestAsk
      description: "AQ: a plan that contradicts a frozen test, put to him (shape fixed by tests/modules/test-plan-conflict.test.js)."
      fields:
        uuid:      "string — ask-… ; a new row each time it is asked again, never the same id twice"
        kind:      "string — ask | ask-answer"
        repoUuid:  "string"
        map:       "string"
        phase:     "string"
        says:      "string — 'The plan says title() -> string (at most 0 arguments), but tests/x.test.js calls title with 1 (line 4: title(…))'"
        options:   "object[] — ids signature | skip | test, in that order"
        suggestion: "string — a signature that takes enough arguments (title(input) -> string)"
      behavioral_contracts: ["an answered ask is closed; answering twice → 404"]
      error_paths: ["a signature answer that still takes too few → 400, not recorded"]

  interfaces:

    - id: IF-RAID-CONTRACTS
      name: raid-contracts
      path: cortex/core/raid/contract-gates.js
      description: "cortex/spec/raid-build.spec MOD-CONTRACT-GATES + MOD-CONTRACT-ADAPTERS — the .contract v2 scheduler the phase build runs bricks through."
      exports: ["contract-adapters fromPhasePlan(plan, opts) → contract", "contract-gates schedule(contract, executors) → progress", "Boundaries.budget(agent, kind)"]
      behavioral_contracts: ["bricks are gated, checkpointed, resumable"]
      error_paths: ["a brick over every learned budget is decomposed"]

    - id: IF-SUBSTRATE
      name: substrate
      path: docs/substrate.spec
      description: "docs/substrate.spec — graph, traverse, chunk, gate (not built yet); the pipeline adopts them phase by phase."
      exports: ["gate(subject, checks) → Verdict", "chunk(input, opts) → Chunk[]", "walk(...) → WalkResult"]
      behavioral_contracts: ["unknown never passes"]
      error_paths: ["not built yet — the pipeline keeps its own gates until GW1/CH1 wrap them"]

    - id: IF-REPO-LAYER
      name: repo-layer
      path: idearium/repo/index.js
      description: "The repo layer: get, readFile, writeFile, writeTextFile, writeSourceBytes, materialize."
      exports: ["getRepoLayer().get(uuid)", "readFile(uuid, path)", "writeTextFile(uuid, path, text)", "writeSourceBytes(uuid, path, buffer)"]
      behavioral_contracts: ["a write is materialized and reindexed once"]
      error_paths: ["immutable repo → IMMUTABLE"]

    - id: IF-VERSIONIUM
      name: versionium
      path: versionium/
      description: "Versionium snapshots: a build takes one before acting (refused without it)."
      exports: ["POST /api/versionium/commit", "history", "files plan/record"]
      behavioral_contracts: ["the snapshot commit id goes on every run row"]
      error_paths: ["unreachable → the build is refused (no snapshot), said"]

    - id: IF-AGENTS
      name: agents
      path: lib/repo-agent.js
      description: "lib/repo-agent.js dispatch(...) and lib/model-door.js route(...) — the one way a phase asks an agent (Guardian browser agents, Ollama, Claude)."
      exports: ["repo-agent dispatch({ repo, layer, message, session, provider, ... }) → { ok, text, injects, provider, elapsedMs }", "model-door route({ kind, size }) → provider order"]
      behavioral_contracts: ["RAID governs routing (§5.2)"]
      error_paths: ["no agent available → NO_RUNG refusal row"]

    - id: IF-COS
      name: cos-run-target
      path: cos/testenv/run-target.js
      description: "COS process sandbox — runs a phase's test with a clean env, timeout and output cap (CT1, 0.60.166)."
      exports: ["runTarget({ root, cmd, timeoutMs }) → { ok, code, out }"]
      behavioral_contracts: ["no network; portable without KVM"]
      error_paths: ["timeout → not-ok with the reason"]

    - id: IF-LOOM-ATLAS
      name: grounding
      path: lib/context-atlas.js
      description: "What the planner reads before it maps: the atlas, the loom map slice, reuse candidates, learned rejections."
      exports: ["phase-plan atlasSection, loomSlice, reuseCandidates", "context-atlas search(q)"]
      behavioral_contracts: ["read-only"]
      error_paths: ["a source missing → said in the plan's read list"]

  modules:

    - id: MOD-FUNNEL
      name: funnel
      uuid: nexus-pipeline-funnel-v1-0000-2026-1020-001
      path: lib/work-funnel.js
      status: built
      built_in: "0.60.95 (FN0)"
      description: "Any request answered in his order before work starts: dependencies, spec, phase, chunks. POST /api/repos/:uuid/funnel; the Code tab's work panel."
      deps: [{ name: repo-layer }]
      schema_refs: [FunnelAnswer]
      exports: ["funnel({ request, intent, repo, root }) → FunnelAnswer", "lines(answer) → string[]", "isOpen(answer) → boolean", "ENTERS"]
      gate_pipeline: ["GATE-FN-001: request → dependencies (files, components, consumers)", "GATE-FN-002: → the owning spec", "GATE-FN-003: → the phase (or a proposed one)", "GATE-FN-004: → chunks"]
      behavioral_contracts: ["no model is asked", "an answer it cannot give is said open"]
      error_paths: ["no repo dir → dependencies unknown"]
      acceptance: ["tests for FN0 (test-work-funnel) pass"]

    - id: MOD-PHASE-BUILD
      name: phase-build
      uuid: nexus-pipeline-phase-build-v1-0000-2026-1020-001
      path: idearium/api/index.js
      status: built
      built_in: "0.39.271 → 0.60.172 (_phaseBuild, repo.phases.build)"
      description: >-
        POST /api/repos/:uuid/phases/build { map, phase, backend, agent, provider, note, replan, anyway } → _phaseBuild: refuse a
        complete phase (409 ALREADY_COMPLETE) → DG1 open depends_on (409 DEPS_OPEN unless anyway) → DG3 cycle/dangling (409
        DAG_INVALID unless anyway) → DG2 graph (409 NO_GRAPH, no anyway) written as file + .graph/.phase nodes → owner system (nexus
        scope) → Versionium snapshot (refused without) → fault precedent, charter, mapping context → the ladder of rungs (NO_RUNG,
        NOT_READY, memory fit MF1) → planner (kept plan, planning/planned/plan-refused/plan-failed rows; derived plan when none) →
        test first (TF2; already-satisfied phases accepted, 0.60.167) → verify first (VF1) → contract bricks through RAID (the
        default, routing.contract_build) or the planned per-file loop (one fresh session per chunk; paused repos wait) → landing
        through repo-inject → proof → final row. Every step a PhaseRun row.
      deps: [{ name: phase-deps-gate }, { name: phase-plan }, { name: test-first }, { name: verify-first }, { name: coder-brief }, { name: pipeline-routing }, { name: landing }, { name: raid-contracts }, { name: versionium }, { name: agents }, { name: run-watch }]
      schema_refs: [PhaseRun, PhasePlan]
      exports: ["route repo.phases.build", "_phaseBuild(repo, dir, opts) → { ok, data: { runId } } | { ok:false, status, error, extra: { code } }"]
      gate_pipeline: ["GATE-PB-001: complete? DG1 DG3 DG2", "GATE-PB-002: snapshot", "GATE-PB-003: ladder + memory fit", "GATE-PB-004: plan", "GATE-PB-005: test first", "GATE-PB-006: verify first", "GATE-PB-007: bricks or planned files", "GATE-PB-008: land, prove, final row"]
      behavioral_contracts: ["the graph hash goes on every row", "a refusal is a row and a code, never a silent no-op"]
      error_paths: ["any step throwing → failed row with the error; run-watch closes stalls"]
      acceptance: ["contract-phase-build, chunked-phase-build, phase-graph, phase-deps-gate, phase-dag, test-first, verify-first suites"]

    - id: MOD-PHASE-DEPS-GATE
      name: phase-deps-gate
      uuid: nexus-pipeline-phase-deps-gate-v1-0000-2026-1020-001
      path: lib/phase-deps-gate.js
      status: built
      built_in: "0.60.125 (DG1)"
      description: "James chose 'Refuse, say why': a phase whose depends_on are still open is not built."
      deps: [{ name: repo-layer }]
      exports: ["openDeps({ phase, map, phases }) → { open: [{ key, status }], unknown: [] }", "line(gate, phase) → string"]
      gate_pipeline: ["GATE-DG1-001: depends_on → statuses", "GATE-DG1-002: open → refuse with keys"]
      behavioral_contracts: ["anyway builds and records depsOverride on every row"]
      error_paths: ["a dep that names nothing → unknown[]"]
      acceptance: ["test-phase-deps-gate"]

    - id: MOD-PHASE-PLAN
      name: phase-plan
      uuid: nexus-pipeline-phase-plan-v1-0000-2026-1020-001
      path: lib/phase-plan.js
      status: built
      built_in: "0.60.0 (PC1/PC2)"
      description: "Plan, then code: a reasoning agent maps the phase into PhasePlan; a small local model writes it one file at a time."
      deps: [{ name: grounding }]
      schema_refs: [PhasePlan]
      exports: ["planPrompt(...)", "parsePlan(text) → PhasePlan | { error }", "derivePlan(phase) → PhasePlan", "planFeedback", "chunkBrief", "checkChunk", "targetSystem({ files, tags, ownerOf, tagSystem })", "exportsOf(code)", "reuseCandidates", "summary"]
      gate_pipeline: ["GATE-PP-001: grounding read", "GATE-PP-002: plan prompt", "GATE-PP-003: parse or refuse", "GATE-PP-004: derive when no planner"]
      behavioral_contracts: ["a kept plan (saved per phase) is reused across restarts unless replan"]
      error_paths: ["plan refused N times → plan-failed; still bricks the whole phase as one gated brick (BR1)"]
      acceptance: ["test-phase-plan"]

    - id: MOD-TEST-FIRST
      name: test-first
      uuid: nexus-pipeline-test-first-v1-0000-2026-1020-001
      path: lib/test-first.js
      status: built
      built_in: "0.60.141 (TF2), 0.60.167 (already-done)"
      description: "The phase's test is written first and shapes expectations; fail-first enforced for new code; a passing test over files that already exist is accepted as already satisfied."
      deps: [{ name: cos-run-target }]
      exports: ["pathFor(plan)", "brief(plan)", "extract(reply)", "validate({ root, plan, testPath, code }) → { verdict }", "decide(verdict, { alreadyDone }) → accept | accept-already | reject", "shape(plan, test)"]
      gate_pipeline: ["GATE-TF-001: write the test", "GATE-TF-002: run it in COS", "GATE-TF-003: decide"]
      behavioral_contracts: ["routing.test_first: off | prefer | require"]
      error_paths: ["no usable test under require on new code → refused, said"]
      acceptance: ["test-test-first (TF-04 known red)", "test-test-done"]

    - id: MOD-VERIFY-FIRST
      name: verify-first
      uuid: nexus-pipeline-verify-first-v1-0000-2026-1020-001
      path: lib/verify-first.js
      status: built
      built_in: "0.60.171 (VF1)"
      description: "A file that exists is checked with no model — parse, planned exports, the phase test in COS — before any agent: pass → no agent; fail → the agent gets exactly what failed; shallow → never 'done'."
      deps: [{ name: cos-run-target }, { name: phase-plan }]
      exports: ["check({ root, file, plan, test }) → { verdict: verified | failed | shallow, failures }", "feedback(result) → string"]
      gate_pipeline: ["GATE-VF-001: parse", "GATE-VF-002: exports", "GATE-VF-003: test in COS"]
      behavioral_contracts: ["wired into both build paths"]
      error_paths: ["COS unavailable → shallow, said"]
      acceptance: ["test-verify-first 10/10"]

    - id: MOD-CODER-BRIEF
      name: coder-brief
      uuid: nexus-pipeline-coder-brief-v1-0000-2026-1020-001
      path: lib/coder-brief.js
      status: built
      built_in: "0.60.171 (CB1)"
      description: "The brief for one file in Gemini's five parts (stack, constraints = AXIOMS v3.1 rules, contract and context, output format, self-critique)."
      deps: [{ name: verify-first }]
      exports: ["compose({ plan, file, context, failures }) → string", "stackOf(root)", "AXIOM_RULES"]
      gate_pipeline: ["GATE-CB-001: five parts in order"]
      behavioral_contracts: ["the frozen test and what failed are in the brief"]
      error_paths: ["missing plan file → brief says so"]
      acceptance: ["CB-01 in test-verify-first"]

    - id: MOD-PIPELINE-ROUTING
      name: pipeline-routing
      uuid: nexus-pipeline-routing-v1-0000-2026-1020-001
      path: lib/pipeline-routing.js
      status: built
      built_in: "0.39.352 (CT6) → 0.60.171 (CB2)"
      description: "The ladder: which coder rungs, in what order (learned), escalation on failure classes, model fit to free memory (MF1), gemini-first among browser coders (CB2)."
      deps: [{ name: agents }]
      exports: ["ladder(opts)", "coderRungs(opts)", "fittingModels(mem)", "preferFirst(order, prefs)", "shouldEscalate(verdict)", "climb(...)", "classify(out)", "plan(policy)", "learned(...)", "recordHop(...)"]
      gate_pipeline: ["GATE-PR-001: present rungs", "GATE-PR-002: fit memory", "GATE-PR-003: learned order", "GATE-PR-004: prefer"]
      behavioral_contracts: ["a rung whose model is not installed is left off, said"]
      error_paths: ["no rung → NO_RUNG refusal"]
      acceptance: ["test-pipeline-routing 19/19"]

    - id: MOD-LANDING
      name: landing
      uuid: nexus-pipeline-landing-v1-0000-2026-1020-001
      path: lib/repo-inject.js
      status: built
      built_in: "0.39.2xx (INJECT) → 0.60.170 (RC4 path guard)"
      description: "Agent-built code lands as .inject nodes: propose (path guard, screens, base) → apply (by the repo's mode, or James at the Nexus approval gate) → revert. proposal-evidence runs the file's tests before/after in a shadow copy."
      deps: [{ name: repo-layer }]
      exports: ["propose({ layer, repo, hat, path, content, source }) → { ok, inject }", "apply(id, { layer, approvedBy })", "reject(id)", "revert(id)", "fromReply({ layer, repo, text, repoDir })", "modeFor(repo)", "proposal-evidence gather(...)"]
      gate_pipeline: ["GATE-LD-001: path guard", "GATE-LD-002: screen", "GATE-LD-003: propose", "GATE-LD-004: apply by mode"]
      behavioral_contracts: ["the only door a pipeline write goes through (PL-003)"]
      error_paths: ["screened content → refused with why; unsafe path → refused"]
      acceptance: ["test-repo-inject (83 here)", "test-proposal-evidence"]

    - id: MOD-RUN-WATCH
      name: run-watch
      uuid: nexus-pipeline-run-watch-v1-0000-2026-1020-001
      path: lib/run-watch.js
      status: built
      built_in: "0.60.21 → 0.60.165 (economy retry)"
      description: "No run left in limbo: FINAL states, stalls closed, economy-held builds retried once the hold clears; paused is never a stall."
      deps: [{ name: repo-layer }]
      schema_refs: [PhaseRun]
      exports: ["runsOf(rows)", "isFinal(row)", "stalled(rows)", "economyHeld(rows)", "retriesFor(...)", "limitFor(...)", "FINAL"]
      gate_pipeline: ["GATE-RW-001: rows → runs", "GATE-RW-002: not final and silent past the limit → stalled"]
      behavioral_contracts: ["needs-you is waiting on him, never a stall (AQ)"]
      error_paths: ["rows unreadable → nothing closed, said"]
      acceptance: ["test-run-watch", "test-economy-resume"]

    - id: MOD-RUN-RECORD
      name: run-record
      uuid: nexus-pipeline-run-record-v1-0000-2026-1020-001
      path: lib/flight-data.js
      status: built
      built_in: "0.60.114 (FR1) · 0.60.144 (FR6) · 0.60.145 (TL2a) · 0.39.366 (activity)"
      description: "How a run is read back: flight-data (each run whole: landed, stuck, cost, waste), change-record (one record per change), work-journal (per-contract ledger of every gate's attempts and replies), repo-activity (background tasks), phase-faults (every way a build went wrong, learned)."
      deps: [{ name: run-watch }]
      exports: ["flight-data flight(rows) / summary / lines", "change-record record({ inject, ... })", "work-journal record / gates / reusable / view", "repo-activity begin / step / end / list", "phase-faults faultsOf / log / precedent / learnRejection"]
      gate_pipeline: ["GATE-RR-001: rows → per run", "GATE-RR-002: join injects, versions, tasks"]
      behavioral_contracts: ["projections; nothing stored twice"]
      error_paths: ["a missing link is named as a hole, never filled"]
      acceptance: ["test-flight-data", "test-change-record", "test-work-journal"]

    - id: MOD-PLAN-CONFLICT
      name: plan-conflict
      uuid: nexus-pipeline-plan-conflict-v1-0000-2026-1020-001
      path: lib/plan-conflict.js
      phase: AQ1_plan_conflict_found
      map: docs/2026-10-19-pipeline-root-causes-phasemap.spec
      description: >-
        His test, tests/modules/test-plan-conflict.test.js (AQ-01, AQ-02), is this module's contract. findConflicts({ plan, tests })
        finds every planned export whose signature takes fewer arguments than a test passes: calls bound through require/import
        (destructured, aliased, namespace), counted with nested commas and a trailing comma right; a spread is skipped, not guessed;
        strings and comments are not calls; another module's same-named function is not this one; a rest parameter takes any number;
        no signature, nothing to contradict. askRow / answerRow / openAsks / suggestSignature / decide as the test fixes them.
      deps: [{ name: phase-plan }]
      schema_refs: [PlanTestAsk, PhasePlan]
      exports: ["findConflicts({ plan, tests: [{ path, code }] }) → [{ file, name, signature, maxArgs, usedArgs, tests: [{ path, calls: [{ line, text }] }] }]", "askRow(conflict, { repoUuid, map, phase, runId, ts, n }) → PlanTestAsk", "answerRow(ask, { choice, signature, ts }) → { ok, row } | { error }", "openAsks(rows, { repoUuid }) → PlanTestAsk[]", "suggestSignature(signature, name, n) → string", "decide({ plan, tests, rows, repoUuid, phase }) → { plan, conflicts, asked, fresh }"]
      gate_pipeline: ["GATE-AQ1-001: plan exports with signatures → max args", "GATE-AQ1-002: tests naming a planned file → bound names → calls counted", "GATE-AQ1-003: used > max → conflict", "GATE-AQ1-004: his answers laid over the plan, newest wins"]
      behavioral_contracts: ["the plan passed in is never mutated", "'test' is not an override: the conflict stays and is asked again as a new row"]
      error_paths: ["a signature answer that still takes too few → error 'at most N arguments; the test passes M'", "unknown choice → 'choice must be one of'"]
      acceptance: ["AQ-01, AQ-02 of tests/modules/test-plan-conflict.test.js"]

    - id: MOD-PLAN-CONFLICT-ASK
      name: plan-conflict-ask
      uuid: nexus-pipeline-plan-conflict-ask-v1-0000-2026-1020-001
      path: idearium/api/index.js
      phase: AQ2_plan_conflict_asks_in_the_build
      map: docs/2026-10-19-pipeline-root-causes-phasemap.spec
      description: >-
        In _phaseBuild, after the plan and before any brick (AQ-03…AQ-07): the tests that name a planned file (and the test written
        first) are read (_testSourcesOfForTest: only *.test.js under tests/, depth ≤ 4, never node_modules); decide(); a conflict
        writes the ask (idearium_asks) and a 'needs-you' row ("waiting for you, nothing was built: <file> <name> — the plan says …, a
        test passes N") and stops; building again reuses the open ask. GET /api/repos/:uuid/asks { open } · POST
        …/asks/:id/answer { choice, signature } → signature: laid on the plan and the build RESUMES ("his answer applied to the plan:
        old → new" on the routed row); test: nothing built; skip: signature dropped. GET …/phases carries asks. run-watch, phase-faults
        and failure-post treat needs-you as waiting, not a stall or a fault. Switch routing.plan_test_conflict: ask (default) | off.
      deps: [{ name: plan-conflict }, { name: phase-build }, { name: run-watch }]
      exports: ["routes repo.asks.list, repo.asks.answer", "_testSourcesOfForTest(root, plan) → [{ path, code }]", "config routing.plan_test_conflict"]
      gate_pipeline: ["GATE-AQ2-001: after plan → read tests", "GATE-AQ2-002: decide → conflict → ask + needs-you row → stop", "GATE-AQ2-003: answer → resume with his signature"]
      behavioral_contracts: ["no brick, no contract, no coder call before the answer"]
      error_paths: ["answer to an unknown or answered ask → 404"]
      acceptance: ["AQ-03 … AQ-07 of tests/modules/test-plan-conflict.test.js (AQ-07's UI half is MOD-PLAN-CONFLICT-UI in idearium/spec/workspace.spec)"]

    - id: MOD-RUN-LINKS
      name: run-links
      uuid: nexus-pipeline-run-links-v1-0000-2026-1020-001
      path: idearium/api/index.js
      phase: IX1_everything_linked
      map: docs/2026-10-19-idearium-control-phasemap.spec
      description: >-
        The pipeline's half of "everything linked": every PhaseRun row carries the ids the link index joins on — spec + block
        (the phase's spec:/blocks:), phase key, contract id, graph hash, inject ids it landed, change-record ids, the idea or note it
        came from (when promoted, MOD-PROMOTE-TO-PHASE) — so any of them leads to the others without a search.
      deps: [{ name: phase-build }, { name: run-record }]
      schema_refs: [PhaseRun]
      exports: ["PhaseRun.links: { spec, blocks, contract, graphHash, injects, changes, idea, note }"]
      gate_pipeline: ["GATE-RL-001: build start → spec/blocks/idea/note from the phase", "GATE-RL-002: landing → injects, changes"]
      behavioral_contracts: ["ids only, never copies of what they point to"]
      error_paths: ["a phase with no spec: → links.spec null, said"]
      acceptance: ["a run row of a spec'd phase names its spec block, its injects and its changes"]

  events:
    pipeline:
      - "idearium.phase.mapped { repoUuid, map, phase, source, files }"
      - "idearium.phase.build.refused { repoUuid, phase, code }"
      - "idearium.phase.run { repoUuid, runId, phase, state }"
      - "idearium.ask.opened { repoUuid, phase, ask }"
      - "idearium.ask.answered { repoUuid, ask, choice, built }"

  enforcement:
    gates:
      - { id: GATE-PL-GRAPH, name: graph-before-build, severity: fatal, check: "DG1/DG2/DG3 run before the snapshot", on_failure: "409 with code" }
      - { id: GATE-PL-RUN-ROWS, name: run-rows, severity: fatal, check: "every exit path of _phaseBuild appends a row", on_failure: "suite red" }
      - { id: GATE-PL-ONE-DOOR, name: one-door, severity: fatal, check: "no fs.writeFileSync into a repo dir from the pipeline outside repo-inject / repo layer", on_failure: "review refuses" }
      - { id: GATE-PL-VERIFY-FIRST, name: verify-first, severity: fatal, check: "check() before dispatch on an existing file in both build paths", on_failure: "suite red" }
      - { id: GATE-PL-ASK, name: ask-him, severity: fatal, check: "a plan/test conflict yields needs-you and zero coder calls", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — compiles this spec at full depth"
    - "tests/modules/test-plan-conflict.test.js — his test, the contract for MOD-PLAN-CONFLICT / -ASK / -UI"

# ADDENDUM 2026-10-21 (0.60.189, RC7) — the run record names its starter
# James, 2026-10-21: "It built 5 phases in a row."
# - Every idearium_phase_runs row carries startedBy { who, whence }, with whence one of:
#   - access: the gate's keyed caller;
#   - declared: person:ui | person:ui:retry | person:ui:workshop | person:cli | agent:<name>;
#   - system: watchdog:<kind>;
#   - unknown.
# - Set by _phaseBuild from _starter(req, body) on POST …/phases/build and …/spec/build, and by _autoRetry for the watchdog.
#   build-plan.js historyOf carries it onto each run.
# - A listener's build is agent:listener: lib/listener-commands.js runs up to 5 lines per reply through the agent command tool.
#   Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec RC7.
