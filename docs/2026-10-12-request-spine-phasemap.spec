spec:
  meta:
    name:     request-spine
    version:  1.2.0
    date:     2026-10-12
    release:  "0.60.0 (base)"
    uuid:     nexus-request-spine-phasemap-v1-0000-2026-1012-jamesbrooks-001
    owner:    "cortex (cortex/core/raid — a request's obligations, chunks, gates) · core (lib/ — verifiers, failure vocabulary, intent) · cos (cells, parallel branches, differential runs) · idearium (where he sees it)"
    status:   "MAPPED 2026-10-12, before building; nothing built. Everything under `exists` was read in source this session, none of it was run (RQ0 runs it). ADDENDUM 1.1.0 (same day, second pass): RQ21–RQ27 and three decisions (decision_raid_home, decision_contract_files, decision_revert_authority) added from James's contract-intelligence idea; read in source, not run, by the same rule. RQ0–RQ20 are unchanged. ADDENDUM 1.2.0 (2026-10-13): James answered decision_contract_format and decision_contract_files in his words (recorded under each `chosen:`), and asked where the failure-mode field is specced (answered in `failure_mode_field`); no phase changed."
    voice: >-
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §1.1 nothing pretends to work, §1.2 nothing silently fails, §0.3 nothing lost, §10.1 one write authority per data type
    origin: >-
      James, 2026-10-12: "All of the last couple of messages, needs to be mapped, files need to be read, gather all context
      from loom, atlas, spec files, anything that gives context, then into phases. Then let’s talk at length about it all."
      · "Everything has to get read, mapped, phased and chunked into contracts." · "Basically need full provenance, mapped
      to current codebase, anything new specced, mapped to the architecture using the registry, and phased, chunked." ·
      "anything deterministic or reusable can be created into a tool, schema, framework, macro, or anything that can use
      nexus instead of the agents." · "Each step gated, anything that it can’t find context to, is a gap that the agents
      needs to prompt the user for." · "Priorities and getting it all coding since it’s not really doing much currently."
      Then, after the siso/gate read: "like each step is gated. look at siso. event gate per step? gated, with checks,
      retry logic and logging fault or failure to taxonomy or faulirue mode index to learn from. anything we can do to
      improve the capability of the smallest models, and only use the agents or bigger models if we need to. like if we
      need to reason with better reasoning?" · "yes, map it all out, and phase it."
      · 2026-10-12, later, to add to this map: "what if we move raid to a copilot module or intelligence system? we can
      use decomposition, analysis, all the memory, ledgers, etc, and synthesis using primitives, invariants, principles,
      etc as a boundary using dependancies. like these need to be real .contract files(literally .contract as the
      extension using the yaml files like the rest of the system uses for nodes.) each gate, tags, updates the progress
      in idearium, backs up on success, then can revert upon failure, uses the comparison engine, behaioral drift
      engine, creates conditions for acceptable to complete the contract."

  # ── What exists (read on 0.60.0, not recalled — §8.6) ──────────────────────
  exists:
    gates_and_checks:
      - "siso/Gate.js, warp/core/Gate.js — a gate is a pure transform with an optional output schema (requiredKeys, types); validateOutput() says what is missing or the wrong type."
      - "warp/core/Axiom.js — hard or soft, weighted (hard 1.0, soft 0.3), versioned so a changed rule invalidates cached results. A hard axiom rejects outright; the Engine writes the rejection to the ledger."
      - "warp/core/Engine.js + Expectation.js — a ledger where every link names its cause; expect({cause, effect, within}) declares what must happen next and a missed window becomes a gap naming both ends."
      - "warp/dispatch/index.js unifiedDispatch — exact cache, fuzzy reuse (pregen), population seed, cheapest-first cascade, axiom gate per candidate, score and retain, retry with the failure fed back as context. Called from ollama/lib/dispatch.js, lib/seam/adapters/warp-cascade.js, idearium/spec-engine/warp-build-dispatch.js."
      - "lib/seam/axioms.js — builds Axioms from a seam contract. Its own header: a keyword-presence floor, not semantic verification; static analysis or test execution is a named, unbuilt dependency."
      - "lib/phase-plan.js (0.60.0, PC1) — a reasoning agent maps a phase to one JSON plan (files mapped to registry components, exports with signatures, imports, order, conditions); each file is then one chunk for the coder. checkChunk() verifies ONE thing: that the planned export names appear in the code."
      - "idearium/repo/proof-run.js — the phase-level proof: file, command, tests and page checks, run after the build."
    routing_and_escalation:
      - "lib/pipeline-routing.js — CLASSES (empty, truncated, refused, timeout, provider-down, rate-limit, login, tool-errors, unknown), VERDICTS (test-failed, dismissed, constraint; recorded for the model, never open a breaker), the escalation ladder (3b → 7b → 16b → agents, configurable, CT6), climb(), shouldEscalate() on failed/blocked/incomplete/tool-errors, learned order per kind of chunk."
      - "lib/model-door.js (CT1), lib/agent-record.js (AR1: per-agent landed / proven / undone / failed by size bucket, a projection), lib/agent-capability-profile.js."
    failure_and_learning:
      - "cortex/self-heal/fault-taxonomy.js — 8 runtime fault classes with a friction ladder; escalation.js; failure-mode-forensics.js (.failure_mode and .debug_macro nodes with a causal chain). These are about SYSTEM faults, not a model's bad chunk."
      - "guardian/lib/job-retry.js — transport failure kinds (tab-busy, input, submit, no-reply, provider-error, needs-you) with retry or stop."
      - "lib/case-library.js, lib/tool-forge.js (composition, not codegen), lib/tool-index.js (living: who consumed which tool, with what intent, which edge case), lib/component-store.js, lib/agent-memory.js."
    request_context_and_contracts:
      - "lib/intent-classifier.js (16 verbs, risk level, confidence, low-confidence gap, frozen at execution), copilot/intents.js (7 intents), cos/foundation/intent.js (a compartment's end state, conditions, axioms — a different thing), orchestrator/lib/intent-map.js (UI interactions). Four vocabularies; none has spec, debug, test, attack or observe."
      - "cortex/core/raid/contract-intake.js — submitContract, submitIdeariumChunk, submitBuildPhaseContract, synthesizeContract, BUILD_CONTRACT_SCHEMA; a compartment per contract; the contract's own criteria as the end state; dependsOn, onFail. cortex/core/raid/officiator.js synthesizes a contract from a staged artifact."
      - "cortex/core/raid/context-synthesis.js (candidate stream over the query tools), context-gate.js (primitive_match only; invariants carried, not evaluated), contract-boundary.js, lib/build-context.js (a bounded block per file, deterministic, says what did not fit), lib/chunk-glyph.js."
      - "lib/registry-harness.js (a component's card: requires, required-by, events, tests — loom wires or a repo's graph.json), lib/context-atlas.js (one search across ~70 tables, specs, changelogs; every hit cites source and id), loom /api/context-graph, friction, tension, gaps."
      - "idearium/repo/work-surface.js (a projection: files with diffs, tools used), lib/repo-inject.js (every write with its `before`), lib/code-edit.js (the unified diff), versionium snapshots."
    execution:
      - "cos/playground/branch.js (fork, diff, checkout, per-compartment branches), cos/playground/compare.js, cos/runtime/run.js (syntax and dependency check without running), cos/testenv (a repo's tests in a QEMU guest, network cut and proven), cos/foundation/snapshot.js. There is no scheduler that runs several branches at once; cos/spec/torture-chamber.spec specifies one (cells) and is not built."
    observability:
      - "lib/component-ledger.js (a ledger per system and component, causedBy where the writer knows it), lib/ledger-fanin, lib/rfr2-bridge.js, intelligence/rfr2 (typed causal edges, clips), fault_log, query tools in lib/agent-tools/tools/query and diagnostic."

    contract_files_and_gates:   # read 2026-10-12, second pass; none of it run
      - ".contract is already a real file. lib/node-export.js wraps any node in one YAML envelope (envelope, uuid, type, id, context, intent, summary, system, tags, exported_at, source, payload) and queryDir({type, tags, tagMode}) reads them back by tag. contract-intake.submitContract writes one to the owning system's input/ (the shared data/raid/input when that system has none) and _advanceToOutputFolder writes the result to output/. The queue row (jaaDB raid_contract_queue) stays the source of truth; the file is its tangible companion. The row's stage walks queued, handshake_verified, input_folder, system_queue, processing, output_folder, qc_pending."
      - "schema.contract exists twice (lib/node-schemas, the shared one; cortex/schemas, the sovereign copy) and documents BUILD_CONTRACT_SCHEMA's fields. schema.raid_contract is the queue-row shape, kept apart on purpose; its text grounds .contract in lib/end-state.js while cortex's copy grounds it in contract-intake.js — two groundings for one extension."
      - "The queue: dependsOn with _dependenciesSatisfied and _dependencyPermanentlyFailed (a dependent of a permanently failed row becomes blocked); onFail defaults to retry twice, or fallbackAgent, or halt; reconcileOnBoot re-queues, or fails, rows a process death orphaned; a qaqcLayer checks a result against the contract's own seam verdict. Every processed row spawns a compartment-engine compartment, a COS compartment (raid-<id>, network isolated) and an idearium repo (skipped when the row already has a repoUuid). submitIdeariumChunk already makes one contract per idearium chunk."
      - "What 'done' means today: checkEndState is a function on the in-memory contract, so it is not in the file, and submitIdeariumChunk and submitBuildPhaseContract both set it to 'the response is non-empty'. conditions in BUILD_CONTRACT_SCHEMA is { pre, post } strings."
      - "cortex/core/raid/index.js verify() is the fused spine of docs/raid-warp-verification-phasemap.spec (P1–P7, complete 2026-07-30): the constitution as a hard axiom first, then verifyInIsolation (lib/execution-pipeline: COS branch, sandbox run, CompareEngine against the last-promoted 'golden' branch, written to the real directory only on pass), a lib/replay-engine snapshot on failure (a decision snapshot for replay, not a file restore), _scoreRun (sigma + BDA, soft), recordDecision."
      - "cos/playground/compare.js CompareEngine.runCompare(compartment, branchA, branchB, {command}) runs one command in both branches and reports file diff, run metrics, stdout diff and a regression map with a verdict, kept in .nex/comparisons. The pipeline skips it, rather than fails, when no golden exists."
      - "intelligence/bda BDAKernel.observe({role, text}) scores five signals of a text (valence, certainty, openness, tension, selfref) into a regime STABLE through COLLAPSING, ledgered. intelligence/cfr/sigma.js computeSigma(event, baseline, cfrState, intervalMs) scores an event on structural, temporal and contextual axes against a baseline from the event ledger."
      - "lib/end-state.js: declare({goal, conditions}) freezes conditions ({id, describe, evaluate(artifact) returning {met, progress}}), evaluate and pursue with stuck-detection, outcomes REACHED · FAILED · STUCK · UNVERIFIABLE (an evaluator that could not run, never a pass) · ABANDONED, the rule 'conditions are frozen, strategy is free', proposeAmendment for an agent and amend for a person. lib/charter.js with cos/foundation/intent.js: a compartment's charter.spec (axioms, always-true conditions, end_state, check kinds file · command · tests · page); idearium_charter_runs are the compartment's progress on the Plan."
      - "Undo and backup: lib/repo-inject.js keeps `before` and appliedSha256 for every inject, revert(id) writes it back or deletes a created file, refuses when the file changed since apply, and reads the file back to prove it; its header says an undo must not depend on another service being up. versionium/lib/engine.js has commit, restore and createBranch. cos/foundation/snapshot.js has take and restore. RAID calls none of the three per gate, and nothing in RAID calls idearium's POST /api/queue/:queueId/progress or /api/ideas/:uuid/progress (both exist)."
      - "Boot order (compartment.json): cortex phase 1 critical; guardian phase 2 critical; intelligence phase 3 required, not critical; idearium phase 3; copilot, versionium and loom phase 3 optional. By grep, 60 source files outside cortex/core/raid (55 outside cortex) and 35 test files require core/raid. Precedent for a move: copilot/analysis.js notes intelligence was moved out of cortex 2026-09-19, and cortex still depends on it."
      - "contract-boundary.js REGISTRY is keyed source:intention (not per contract) and every row's invariants is an empty list; context-gate carries them and evaluates none. intelligence/synthesis is GAP synthesis (ranks Nexus's own gaps) — a different thing from RAID's context synthesis under the same word."

  missing:
    - "M1 nothing turns a request into a checklist of what must be known, with a status per item, so an unfound fact is a named gap rather than a guess (context-gate matches tokens only)."
    - "M2 the per-chunk gate is thin: exports present. No parse, no require resolution, no symbol-exists, no scope or size bound, no per-chunk test. The gate machinery is mature; its checks are not."
    - "M3 failures are named by transport (CLASSES), by late verdict (VERDICTS) and by ladder state. Nothing names what the CHECKS found: syntax error, unresolved require, missing export, invented symbol, edit out of scope, oversize, stale anchor, repeated output. So the failure index cannot say which model fails at which kind of chunk, or why."
    - "M4 the contract is per request. A chunk with file, line range, anchor hash, phase id, reason and acceptance criteria — and a revision history — does not exist; lib/phase-plan.js's plan is its nearest ancestor."
    - "M5 nothing re-resolves a chunk's source anchor before an edit, and nothing reconciles the finished patch against the declared chunks (undeclared files, criteria with no evidence)."
    - "M6 provenance exists as ids in many tables (request, contract uuid, inject, phase run, ledger row) but there is no query that walks them in both directions."
    - "M7 several branches run at once, with a baseline-versus-changed test comparison and a conflict check before integration, does not exist (specced as torture-chamber cells and SN0–SN2)."
    - "M8 nothing watches for the same tool sequence being worked out by an agent again and again and proposes a macro, tool or schema for it."
    - "M9 the .contract file is the queue row at birth, not the contract's record. submitContract writes the input file from `row` before synthesizeContract attaches endState, conditions, warpPrimitives, axioms and tools to the row, and nothing re-exports it, so a synthesized contract's file lacks the fields schema.contract documents. No gate result, checkpoint, tag or progress is ever written back, and the output file reuses type contract with a different payload (the result)."
    - "M10 the boundary is a lookup by source:intention, not a property of the contract, and no invariant exists in it: every row's invariants is empty, carried and never evaluated. The invariants that do exist are prose in the phasemaps (charter.js says as much)."
    - "M11 nothing says what 'acceptable to complete' is. A contract's conditions are strings; the evaluators in lib/end-state.js take functions; nothing maps one to the other, and the acceptance the intake applies to idearium and build-phase contracts is 'the response is non-empty'. A function is not in a YAML file, so the file cannot say what done meant."
    - "M12 the comparison and the drift are fed too little to see a change. Comparison needs a golden, which the first run does not have, and judges nothing against what the change was meant to do. By the arithmetic of the code, the sigma RAID computes for a verify has no payload, no error word in its name, an empty baseline (nothing passes sigmaBaseline) and so cannot exceed about 0.13, below its own 0.7 spike flag; BDA is given a sentence RAID wrote about itself. Read, not run."
    - "M13 there is no gate transaction. Nothing takes a checkpoint when a gate passes, nothing reverts to it when a later gate fails, and nothing reports a gate to idearium. The pieces exist apart (inject revert, versionium commit, the replay snapshot, the queue.progress route); none is joined to a contract's gates."
    - "M14 RAID's reasoning (context synthesis, the gate, the officiator) and its enforcement (queue, files, drain, retry) are one folder, so a change to either touches both and neither can be reached as a service. Whether the reasoning half has a home elsewhere is decision_raid_home."

  drift_note: >-
    An earlier note in this session said no generation-failure classes existed and that the escalation triggers needed
    building. That overstated it: CT2 (VERDICTS) and CT6 (the ladder, climb, escalateOn) are done and 0.60.0 PC1 (plan
    then code) landed today. What is missing is narrower — M2 and M3 above — and this map builds on those pieces, it
    does not replace them. Divergent copies of a vocabulary are two contracts: RQ2 adds to the existing ones.

  # ── Design ─────────────────────────────────────────────────────────────────
  design:
    rule: >-
      Every request produces a persistent, evidence-backed work surface that can be resumed, audited, executed in bounded
      chunks and verified against the original intent. One door, one table, one tool (Leverage): the spine is read
      through the one nexus.command door, so an agent and a person get the same answers.
    the_gated_step: >-
      Every step of the spine, and every chunk of a build, passes the same shape. In SISO terms: a Gate whose signature
      is the step's event type, with an output schema; Axioms as the checks (hard first, soft after, weighted); an
      Expectation declared before the step runs (this obligation must be satisfied or become a gap within N). In order:
      (1) input schema, (2) deterministic pre-checks, (3) ONE bounded call — a tool when the step is deterministic, the
      smallest model that has proven it can do this kind of chunk when it is not, (4) post-checks, (5) the outcome is
      exactly one of pass · repair · escalate · ask, (6) a ledger row with causedBy, and on failure a failure record
      (class, model, chunk kind, context-pack hash, the check's own words) that the failure-mode index and the learned
      order read. Nothing in (5) is chosen by a model.
    raising_the_smallest_models:
      - "Make the task small and slot-shaped: plan first (PC1), then one file at a time with exact export signatures — already built; the contract chunk narrows it to a line range."
      - "Do the deterministic part with no model at all: the exact cache, the genesis skeleton, tool-forge compositions, macros."
      - "Verify with real checks (RQ1), so a model's wrong answer is caught before it is believed."
      - "Repair with the check's own words — file, line, expected, got — not 'try again' (RQ3)."
      - "Offer choices instead of free generation where the answer is a pick: the workshop's [A] [B] [C] shape; constrain output to a schema where the model server supports it (check the Ollama bridge's version first)."
      - "Best of N with a verifier (exploreWidth already exists), and proven examples of the same kind of chunk (case-library, component store) as the few-shot."
      - "Learn per model and per kind of chunk (RQ2 feeds agent-record), so chunk size and format fit the model."
    when_a_bigger_model: >-
      Triggers are deterministic and read from the failure index, never from a model saying it is stuck: (a) K repairs
      failed with checks that differ each time; (b) no verifier exists for this chunk — a judgment task; (c) the contract
      itself must be authored or revised (the planner role, already a reasoning agent); (d) two invariants conflict;
      (e) the failures show the decomposition was wrong; (f) irreversible or security-sensitive. A fact that evidence
      cannot supply goes to the person as a gap, not to a larger model. The climb carries a compact dossier (what was
      tried, each check's output) and never the whole context; what the larger model fixes is stored as an exemplar and
      a cache entry so the next occurrence stays on the small rung. The measure is the escalation rate per kind of
      chunk — it has to fall.
    division_of_responsibility:
      - "Context obligations and the contract (what is justified, what it depends on, what proves it): cortex/core/raid."
      - "Verifiers, the failure vocabulary, intent: core lib/."
      - "Where and how work runs — branches, snapshots, parallel cells, differential runs: COS."
      - "The proposed changes' lifecycle and approval: RAID's gate and the inject nodes. Snapshots and history: versionium. Memory and the ledgers: cortex."
      - "Who the request is shown to and where he answers a gap: idearium and the copilot pane."

  decisions:   # offered as choices, the coder's recommendation marked; chosen stays open until he picks
    decision_where_obligations_live:
      choices:
        - "[A] cortex/core/raid beside contract-boundary, context-synthesis, context-gate  ← recommended (RAID already owns a contract's context; no second path)"
        - "[B] copilot — closest to the talk, but a second owner of context"
        - "[C] idearium — closest to the screen, but Nexus-wide requests would depend on a repo UI"
      chosen: open
    decision_contract_format:
      choices:
        - "[A] extend BUILD_CONTRACT_SCHEMA with chunks[] and keep the .contract envelope  ← recommended (one contract, one queue, one compartment per contract)"
        - "[B] a .contract v2 beside it — cleaner, but two formats"
        - "[C] idearium manifest chunks only — already per file, but not RAID's"
      chosen: >-
        2026-10-13, James: "contract format, maybe using primitives, priniciples, or invariants or maybe depenedancies as a
        boundary or constrain field for the contract, using a yaml file each as a block, then chunked, just like idearium."
        The coder's reading, his to correct: [A] — the one .contract envelope, extended. Its payload gains `boundary:`
        with four lists — primitives (the proven building blocks the work may use: lib/build-context.js's PROVEN
        PRIMITIVES, the component store), principles (the axioms that govern it: AXIOMS-v3.1 §ids, the charter's axioms),
        invariants (what must stay true, each with a check kind: file · command · tests · page, run by RQ22 — never
        carried unevaluated), dependencies (the components it requires and is required by, from the registry card, which
        bound what it may touch) — and `blocks:`, each block a YAML section shaped like an idearium spec block (id, title,
        intent, files, lines, change, why, depends_on, conditions), chunked one per file change exactly as idearium chunks a
        spec. `failure_modes:` names the failure classes each block is checked against (failure_mode_field below).
    decision_failure_vocabulary:
      choices:
        - "[A] one lib/failure-vocab.js that pipeline-routing VERDICTS, agent-record and the verifiers all read; fault_taxonomy stays the system-fault ladder  ← recommended"
        - "[B] fold generation failures into fault_taxonomy's friction ladder — one table, but a bad chunk is not a system fault and would raise friction on a healthy system"
        - "[C] a new table beside both"
      chosen: open
    decision_first_slice:
      choices:
        - "[A] verifiers and the failure index first (RQ0–RQ5): improves every dispatch path that exists today and gives the learning real signal  ← recommended"
        - "[B] the spine first (RQ6 on): the new flow sooner, but the chunks it makes are judged by the thin gate"
      chosen: open
    decision_parallel_cells:
      choices:
        - "[A] COS cells, as the torture-chamber template's cell, after SN0 unifies branching  ← recommended"
        - "[B] a scheduler in idearium over today's branch.js — sooner, a fourth branch mechanism"
      chosen: open

    decision_raid_home:
      asked: 'James: "what if we move raid to a copilot module or intelligence system?"'
      choices:
        - "[A] split it. The queue, the .contract files, the gates' enforcement and the revert stay in cortex/core/raid (phase 1, critical, the one write authority for contracts). The reasoning half — decompose, analyse, recall, synthesize — becomes one module in intelligence/ that RAID calls through the contract door (§5.10). If it is down a contract is refused as a named gap, never made without its reasoning, and the deterministic gates keep running  ← recommended (it is what he described, and it does not put a safety gate after the things it gates)"
        - "[B] move all of RAID into copilot. Copilot is phase 3 and optional; cortex (phase 1, critical) and guardian (phase 2, critical) require RAID, so the gate would start after what it gates and vanish when copilot is down. About 60 source files and 35 tests change their require"
        - "[C] move all of RAID into intelligence. It boots as required but still after cortex and guardian, the same 60 + 35 files move, and intelligence/synthesis is a different synthesis under the same name. The precedent (intelligence moved out of cortex 2026-09-19) is real, and cortex still depends on it"
        - "[D] the reasoning half in copilot instead of intelligence. Copilot already has analysis.js (slow, derivation-based cognition over the CFR kernel, vector memory, diagnostics and invariants) and the pane, but it is optional, and a second owner of context (the same objection as decision_where_obligations_live [B])"
      note: "Reopens decision_where_obligations_live: under [A] here, obligations.js (RQ7) splits the same way — the table and the rule that only evidence closes an obligation stay in cortex, the expansion step (what to ask the registry, the atlas, the ledgers) is the module's."
      chosen: open
    decision_contract_files:
      asked: 'James: "these need to be real .contract files"'
      choices:
        - "[A] one .contract envelope per contract, as today, extended: the payload gains boundary, conditions, gates[], checkpoints[], progress and a revision; a chunk and a gate are entries inside it; 'each gate tags' means each gate adds its tags to that one file  ← recommended (every queue row makes a compartment, a COS compartment and an idearium repo, so a file per chunk multiplies that by the chunk count on a 4 GB box)"
        - "[B] a parent .contract (payload.kind: manifest) plus one child .contract per chunk, linked by dependsOn, each tagged and queryable alone. The most literal reading, and submitIdeariumChunk already makes a contract per idearium chunk; costs a compartment, a COS compartment and a repo per child unless children run inside the parent's"
        - "[C] [A] as the record, plus a child .contract only where a chunk has to run apart (a parallel cell, RQ15; a repair that was escalated) — the file count follows the work"
      chosen: >-
        2026-10-13, James: "using a yaml file each as a block, then chunked". Read as: each block is its own YAML section of
        the one .contract (as an idearium spec's blocks are sections of one spec), so [A]; where a block has to run apart
        it is written out as a child .contract ([C]). If he meant one file per block on disk, that is [B] — to confirm.
    decision_revert_authority:
      choices:
        - "[A] two layers. lib/repo-inject.js's revert (the `before` of every inject: exact, per chunk, self-contained) is the revert; a versionium commit at each passing gate is the named backup that survives a restart and can be browsed  ← recommended (versionium is optional, so when it is down the gate says 'backup unavailable' and only reversible work goes on)"
        - "[B] versionium only — one mechanism, but optional and not always up when needed, and a commit is a whole state, not a chunk"
        - "[C] a COS snapshot of the contract's compartment at each pass — isolates well, heavier (a manifest of every file in the root) and restores a compartment, not a repo's working tree"
      chosen: open

  failure_mode_field:   # ADDENDUM 1.2.0 — James: "failure mode field, should be specced somewhere, check all of the phases, a lot of this is mapped already i feel like."
    answer: >-
      It is specced, in three places that agree, and this map already builds on them: (1) RQ2 here — the generation
      failure vocabulary (syntax-error · bad-require · missing-export · unknown-symbol · out-of-scope · oversize ·
      stale-anchor · test-failed · repeated-output · constraint) and the record each failure writes; (2)
      lib/node-schemas/schema.failure_mode — the .failure_mode node (a causal chain, written by
      cortex/self-heal/failure-mode-forensics.js) that a recurring class is promoted to; (3)
      docs/2026-10-05-failure-reproduction-phasemap.spec FM4 (the failure-mode report) and FM2 (a failure is a clip).
      fault_taxonomy (cortex/self-heal/fault-taxonomy.js) stays the SYSTEM-fault ladder (decision_failure_vocabulary).
      What is new is only the field on the contract: `failure_modes:` per block, naming RQ2's classes — so a gate knows
      which checks to run on that block and the index knows which block a failure belongs to.
    other_maps_that_already_cover_this: >-
      SB11/SB13 (each block / each component chunked, build-from-the-spec), IC5 (the input → queue → output lifecycle),
      CH1–CH5 + lib/end-state.js (conditions frozen, check kinds), contract-boundary.js + context-gate.js (the boundary
      keyed by source:intention, invariants carried, none evaluated — M10), BUILD_CONTRACT_SCHEMA (endState, conditions,
      warpPrimitives, axioms — the boundary's ancestors). The contract format above is these, put in one file.

  # ── Phases ─────────────────────────────────────────────────────────────────
  # Delivery order for every phase (CLAUDE.md): backend JS → API route → a row in idearium/cli/route-commands.js SPEC
  # (so copilot and every agent have it through nexus.command) → UI. A phase is not done while it has no screen; `ui:`
  # says what, or says deferred. Every new component is mapped into loom WITH its require() wires; a dated ADDENDUM goes
  # to the specs that own what changed; the test is registered in tests/modules/run-all.js; lib/version.js bumps.
  phases:
    RQ0_the_inventory_proved:
      layer: docs
      status: OPEN
      james: '"Priorities and getting it all coding since it’s not really doing much currently."'
      depends_on: []
      files: [docs/2026-10-12-request-spine-phasemap.spec, tests/modules/test-request-spine-inventory.js (new)]
      does: >-
        Run what this map only read. unifiedDispatch with a stand-in model through each of its three callers; checkChunk;
        climb() across a two-rung ladder; contract-intake submit → compartment; registry-harness card for a real file;
        the work-surface projection. One short table: runs / fails / not reachable, with the failure text. Fix this map's
        `exists` where the run disagrees. Also records which of the open health items (HG1, HG2, HG9) block any of it.
      proof: "the table, from a run, on 0.60.0; every `exists` line is confirmed or corrected"
      ui: "deferred — a table in the phase's changelog"

    RQ1_the_verifier_library:
      layer: library
      status: OPEN
      james: '"gated, with checks"'
      depends_on: [RQ0]
      files: [lib/chunk-verify.js (new), lib/phase-plan.js (checkChunk becomes one verifier), lib/seam/axioms.js, cos/runtime/run.js (reused, not copied), lib/code-edit.js]
      does: >-
        Cheap, deterministic checks as plain { id, severity, weight, check, explain } objects (the shape lib/seam/axioms.js
        already uses, so WARP wraps them in Axiom at the call site and nothing else needs WARP). Each check returns not
        just pass or fail but the location and the expected and found values. First set: parses (the language's own
        parser, via COS's runtime check); every require/import resolves to a file or a package in package.json; planned
        exports present (today's checkChunk, generalised, with signatures); a name the code calls on another module is
        exported by it (registry-harness card); the edit stays inside the contract's allowed file and line range; the
        diff size is inside a bound; a per-kind list of forbidden calls; the chunk's own test, when one exists, passes in
        a COS branch. A check that cannot run says why (the torture chamber's AX4); it is never counted as passed.
      proof: "a seeded set of wrong chunks (syntax error, bad require, missing export, invented symbol, out-of-range edit) is each rejected with a precise reason through unifiedDispatch's axiom gate; a correct chunk passes; a check that cannot run is reported 'unknown', not 'ok'"
      ui: "the Plan row of a chunk shows each check, pass or fail with its words (code-surface.js already shows a plan's gates)"

    RQ2_the_generation_failure_vocabulary_and_index:
      layer: library
      status: OPEN
      james: '"logging fault or failure to taxonomy or faulirue mode index to learn from."'
      depends_on: [RQ1]
      files: [lib/failure-vocab.js (new), lib/pipeline-routing.js (VERDICTS read from it), lib/agent-record.js (byClass), lib/component-ledger.js, lib/agent-capability-profile.js]
      does: >-
        One vocabulary for what the checks found, added to what CT2 already records: syntax-error · bad-require ·
        missing-export · unknown-symbol · out-of-scope · oversize · stale-anchor · test-failed (exists) · repeated-output ·
        constraint (exists, CT2 'NOT YET'). Each record: { class, model (ollama:<model> as the ladder names it), chunk
        kind, context-pack hash, the check's words, attempt, outcome after repair }. Verdicts never open a breaker (CT2's
        rule, kept). A record is a ledger row with causedBy; a class that recurs for one model on one kind of chunk is
        promoted to a .failure_mode node through the FM4 path, not on a single occurrence. The index answers: which model
        fails at which kind of chunk, how, and does repair fix it — and agent-record and the learned order read it.
        fault_taxonomy stays the system-fault ladder (decision_failure_vocabulary).
      proof: "after the seeded failures of RQ1, the index names each model's classes per chunk kind; the ladder order and the chunk size for a model change on a recorded run; a single failure promotes nothing"
      ui: "Settings → Routing: the index as a table (model × kind × class), and what it changed"

    RQ3_repair_with_the_checks_own_words:
      layer: library
      status: OPEN
      james: '"retry logic"'
      depends_on: [RQ1, RQ2]
      files: [lib/phase-plan.js (chunkBrief gains a REPAIR section), lib/pipeline-routing.js (climb passes the failing checks), idearium/api/index.js (_phaseBuild)]
      does: >-
        A retry on the same rung carries only the failing check output — file, line, expected, found — plus the chunk
        brief, not a rerun of the whole context. A retry never repeats an identical prompt (cascade.js's own rule).
        Check first what the retry carries today: this map did not read _phaseBuild's retry text.
      proof: "a stand-in model that fails with a bad require is repaired on the second attempt from the check's text alone; the repair prompt is shorter than the first"
      ui: "the attempt row shows what was sent back"

    RQ4_escalate_on_the_checks_and_keep_the_lesson:
      layer: library
      status: OPEN
      james: '"only use the agents or bigger models if we need to."'
      depends_on: [RQ3]
      files: [lib/pipeline-routing.js (escalateOn reads verdict classes and K), lib/warp-cascade adapter (exactCacheOnFirstSuccess for a proven chunk), lib/case-library.js, lib/component-store.js, idearium/lib/config-core.cjs (routing.repairs_per_rung, routing.escalate_on_checks)]
      does: >-
        The climb triggers of design.when_a_bigger_model, as settings (options over code): K repairs with differing
        checks; no verifier; contract authoring; conflict; wrong decomposition; irreversible. The climb carries a compact
        dossier. When a higher rung's chunk passes the gate, it is stored as a cache entry and as an exemplar for that
        kind of chunk, and the small rung is offered it as the few-shot next time. The escalation rate per kind of chunk
        is written to the index.
      proof: "a chunk the 3b cannot pass climbs after K repairs with a dossier no longer than the checks' words; the next chunk of that kind goes to the 3b with the exemplar and passes; the escalation rate for that kind falls across the run"
      ui: "Settings → Routing → Escalation ladder shows the triggers and each kind's rate"

    RQ5_the_small_model_baseline:
      layer: tests
      status: OPEN
      james: '"how capable would this make small models. what could this build? if the pipeline works from end to end?"'
      depends_on: [RQ4]
      files: [tests/bench/request-spine/ (new: ~10 real tasks from the open phases, each with a starting revision and a proof), tests/sim/loop.js (reused)]
      does: >-
        Before any spine exists, measure: the same ~10 tasks (a route with its command row and wiring; a rollout across
        systems; a spec addendum; a repair), with the 3b alone, and the 3b with RQ1–RQ4 and the ladder. Record verified
        completion, repairs, climbs, tokens, wall time, and what needed him. This is the number RQ14 has to beat, and
        the only way to know whether the above raised the floor or only felt like it.
      proof: "a report with both columns, repeated trials where it varies, tasks and revisions pinned so it can be re-run"
      ui: "deferred — the report in docs"

    RQ6_one_intent_map:
      layer: library
      status: OPEN
      james: '"Need the intent map for the reasoning. Need intents for speccing, debugging, test and attacking, contracting? Observing?"'
      depends_on: [RQ0]
      files: [lib/intent-classifier.js (VALID_VERBS gain the verbs; a table maps each to a workflow), copilot/intents.js, orchestrator/lib/intent-map.js, cos/foundation/intent.js (not merged — an end state, linked)]
      does: >-
        One set of reasoning intents over the four existing vocabularies: explore, spec, contract, plan, debug, test,
        attack, observe, reconcile, learn, build. Each is a table row: required inputs, prerequisites, allowed
        operations, the obligations it opens (RQ7), its done condition, its risk level. An explicit command resolves by
        rule, an ambiguous request by the existing classifier with its confidence; low confidence asks (the classifier's
        own gap). The row names the EXISTING workflow it routes to before any new one is made. COS's intent stays what it
        is — a compartment's end state — and is the done condition a contract's compartment is given.
      proof: "a corpus of real requests (this session's, the chat ledgers') routes to the right row; none of the four old vocabularies loses a verb; a request that is only a question retrieves nothing it does not need"
      ui: "the copilot pane says which intent it read and why (one line)"

    RQ7_the_context_obligations:
      layer: library
      status: OPEN
      james: '"a checklist of context needed per dependancy. Incremental and one step at a time, to account for small llms."'
      depends_on: [RQ6, RQ1]
      files: [cortex/core/raid/obligations.js (new), cortex/core/raid/context-synthesis.js, cortex/core/raid/context-gate.js, lib/registry-harness.js, lib/context-atlas.js, lib/build-context.js, cortex/registry-components.js]
      does: >-
        An obligation is { id, reason, retrieval (which tool and query), evidence[], status, dependsOn[] } with status
        pending · satisfied · blocked · ambiguous · not_applicable. Evidence is a reference — { source, id, revision or
        content hash, retrievedAt, excerpt } — and the original stays the authority. A failed search is `blocked`, never
        `not_applicable`; only evidence (or his word) closes an obligation. One step expands one obligation: ask the
        registry card who requires this file, which tests cover it, which spec owns it, which events it emits and who
        hears them, what the ledger says of its last failure — each answer may open new obligations, to a depth bound.
        Every expansion is a gated step (the shape above); the table is raid_obligations (JAA, as the contract queue is),
        so a fresh agent resumes where the last stopped. Reads only — it changes nothing.
      proof: "interrupt a run after three obligations and resume: completed ones are reused, none silently skipped; a deliberately empty search leaves the obligation blocked; the same request twice does not re-fetch evidence whose revision is unchanged"
      ui: "the request's checklist in the work surface: each obligation, its status, its evidence"

    RQ8_the_gap_is_a_question:
      layer: library
      status: OPEN
      james: '"anything that it can’t find context to, is a gap that the agents needs to prompt the user for."'
      depends_on: [RQ7]
      files: [cortex/core/raid/obligations.js, lib/gap-field.js (a request gap is a gap), intelligence/gap/hunter.js (OBLIGATION type, reused), copilot/server.js (the pane), idearium/ui/js (the question card)]
      does: >-
        An obligation that stays blocked or ambiguous after the evidence sources are searched becomes the smallest
        useful question, with the evidence found and the competing readings. His answer is stored as a decision (the
        decision_log table) linked to the request and the obligation, and the obligation closes on it. A later
        contradicting piece of evidence reopens it. A fact the repository already states never reaches him.
      proof: "a request naming a file that exists asks nothing about it; one that depends on an undecided behavior blocks the contract and asks once; his answer closes it and survives a restart"
      ui: "the question card in the pane and the repo's Plan; the answer is one tap where the choices are enumerable"

    RQ9_the_chunked_contract:
      layer: library
      status: OPEN
      james: '"Begin a .contract file using each block as chunks for each file that needs to be changed."'
      depends_on: [RQ7, RQ1]
      files: [cortex/core/raid/contract-intake.js (BUILD_CONTRACT_SCHEMA gains chunks[] and a revision), cortex/core/raid/officiator.js, lib/phase-plan.js (parsePlan is the ancestor), lib/seam/spec-parser.js, cortex/schemas/schema.contract]
      does: >-
        The satisfied obligations are synthesized into a manifest plus independently addressable chunks: { id, file,
        directory, lines [from, to], anchor { symbol, hash, revision }, change { from, to }, why, evidence[], dependsOn[],
        phase, accept[] }. Generated one chunk at a time from satisfied obligations; required fields and cross-references
        validated deterministically; a change to the contract is a new revision with a reason, never an overwrite. The
        `accept` conditions become the Axioms the chunk's gate runs (RQ1) and the compartment's end state. Submitted
        through submitContract, so RAID makes its compartment as it does today (decision_contract_format).
      proof: "every chunk maps to a requirement and carries evidence; a chunk with a missing field or a dangling dependsOn is refused; a revision keeps the earlier one readable; the contract round-trips through the queue and the compartment"
      ui: "the contract as chunk cards in the Plan: file, lines, why, status per chunk"

    RQ10_anchors_and_the_diff_reconciled:
      layer: library
      status: OPEN
      james: '"Basically need full provenance, mapped to current codebase"'
      depends_on: [RQ9]
      files: [lib/chunk-verify.js (the anchor and scope checks), lib/repo-inject.js (`before`), lib/code-edit.js, versionium (snapshot hash)]
      does: >-
        Before a chunk edits anything, its anchor is re-resolved against the file as it is now — symbol, hash, then the
        line range — and the edit is blocked, not guessed, when the source no longer matches the contract's assumption;
        only the evidence and obligations that depend on that file are refreshed. After a phase, the actual patch is
        reconciled with the declared chunks: files and symbols changed that no chunk names, criteria with no evidence,
        new interfaces not registered. Each gets an explicit disposition (fixed, deferred with a reason, accepted by
        him). A request is never complete because an agent said so.
      proof: "edit the file between planning and execution: the chunk refreshes or blocks, never patches stale; an extra file in the patch is flagged; a criterion with no evidence keeps the request open"
      ui: "a chunk shows 'anchor stale — refreshed' or 'blocked'; the request shows its open dispositions"

    RQ11_spec_and_registry_reconciled:
      layer: library
      status: OPEN
      james: '"Add addendum or change the .spec" · "anything new specced, mapped to the architecture using the registry"'
      depends_on: [RQ9]
      files: [loom/scanners/spec-map.js, orchestrator/lib/spec-drift.js, docs/SPEC-REGISTRY.spec, lib/registry-plan.js, loom/maps]
      does: >-
        Each chunk gets a disposition against the spec: existing spec satisfied · addendum proposed · new spec proposed ·
        justified exception. The proposal (the dated ADDENDUM text, the registry row, the loom component with its real
        require() wires, any event declared in the system's event taxonomy first) is generated from the chunk and held as
        a PROPOSAL, kept apart from the accepted architecture, and goes through the same approval as a code change. It
        detects a conflicting or duplicate spec and a behavior no spec covers. This automates CLAUDE.md rules 3 and 4 as
        a check; it does not write them unattended.
      proof: "a chunk that adds a route yields a spec addendum, a registry row and a loom component with its wires as proposals; an event not in the taxonomy is flagged; nothing is written to a spec before approval"
      ui: "the proposals beside the code diff in the work surface"

    RQ12_the_phase_dag:
      layer: library
      status: OPEN
      james: '"Build phases per file change?"'
      depends_on: [RQ9]
      files: [idearium/spec-engine/index.js, idearium/ui/js/plan-panel.js, loom/scanners/phasemap-map.js]
      does: >-
        The phases are computed from the chunks' dependsOn: a directed acyclic graph, grouped only where the chunks can
        be reasoned about and verified together; a cycle is reported and needs an explicit decision, never silently
        broken. Each phase carries its preconditions, expected outputs, rollback and a completion gate. A failure or a
        new dependency re-plans the affected part and keeps completed evidence. This is J3 (the Plan reads the chunk
        graph, not the generated build_order prose) and SD14's cut at primitives.
      proof: "a contract with a dependency cycle is refused with the cycle named; independent chunks land in one ready set; a failed chunk re-plans only what depends on it"
      ui: "the Plan shows the DAG's phases and which chunks are ready, running, blocked"

    RQ13_the_work_surface_and_provenance:
      layer: library
      status: OPEN
      james: '"Create a compartment for the uncomited changes, maybe in raid, to hold each file that has changed, and the contract, and relavent context"'
      depends_on: [RQ9, RQ10]
      files: [cortex/core/raid/contract-intake.js (the compartment), idearium/repo/work-surface.js, lib/provenance-query.js (new, a read-only join), idearium/cli/route-commands.js (rows: spine, trace), lib/agent-tools/tools/nexus/command.js]
      does: >-
        The contract's compartment holds the contract and its revisions, the obligations and their evidence references,
        each chunk's patch and result, and the decisions he made. It is isolated from unrelated uncommitted work: a
        baseline revision, the allowed paths, a conflict check against existing uncommitted changes, rollback and
        recovery from a failed phase. Provenance is a join over ids that already exist — request, requirement,
        obligation, evidence, chunk, phase, inject, test result, disposition — read both ways: "what will this request
        affect" and "why does this change exist". It stores nothing of its own (a projection, as work-surface.js is).
        Command rows `spine <request>` and `trace <chunk|requirement>` give the same answer to a person and an agent.
      proof: "pick any changed chunk and recover its reason, evidence, dependencies and verification; pick a requirement and list its chunks and their proof status; two concurrent requests stay isolated and a conflict is explicit"
      ui: "the Code tab's work surface lists the request's compartment, with trace on any chunk"

    RQ14_the_spine_end_to_end:
      layer: tests
      status: OPEN
      james: '"Basically get context, one step at a time using dependencies, then then synthesize just what is needed to understand what is needed, if the agent doesn’t understand ask the user."'
      depends_on: [RQ5, RQ8, RQ10, RQ11, RQ12, RQ13]
      files: [tests/bench/request-spine/, tests/sim/fake-tab.js, tests/sim/loop.js]
      does: >-
        The RQ5 tasks, through the whole spine: request → intent → obligations → gaps asked → chunked contract →
        gated chunks on the cheapest rung → anchors and reconciliation → proposals → provenance. Driven through the real
        path (the copilot pane in Clear Glass, never Playwright), with the sim's fake tab where a model is needed. The
        comparison to RQ5 is the finding, whichever way it falls; the escalation rate, the repairs and the questions he
        was asked are reported per task.
      proof: "the report: verified completion, repairs, climbs, tokens and questions per task against RQ5; a task marked complete has evidence for every acceptance criterion, not an agent's word"
      ui: "the run is watchable in the Plan and the work surface"

    RQ15_cells_in_parallel:
      layer: cos
      status: OPEN
      james: '"Independent contract chunks can run in separate COS branches or test environments simultaneously."'
      depends_on: [RQ14]
      files: [cos/playground/branch.js, cos/spec/torture-chamber.spec (the cell), docs/2026-10-10-snapshot-compartments-phasemap.spec (SN0 SN1 SN2), cos/testenv, cos/event-taxonomy.js]
      does: >-
        After SN0 (one branch interface) and SN1 (a snapshot as a compartment): the ready set of the phase DAG is
        scheduled into cells, each a branch of the baseline with a work-environment id, patch hash, commands, logs and
        cleanup status as evidence, within resource limits. Dependent chunks wait. Differential verification runs the
        same tests on the baseline and the changed branch so an old failure is not blamed on the change and a timeout is
        not a pass. Before integration: overlapping files, shared symbols, registry and event-contract changes, then the
        integration tests on the combined result. Parallelism is only used where the chunks are independent; shared
        interfaces and registry entries are prerequisites, not parallel work. Events are declared in cos/event-taxonomy.js
        before they are emitted (cos.cell.started, .done).
      proof: "two independent chunks run in two cells at once and a dependent third waits; a seeded regression is flagged by the differential run and an old failure is not; two chunks that both edit one file are caught before integration"
      ui: "cells in the work surface: branch, state, evidence"

    RQ16_hypotheses_in_parallel:
      layer: cos
      status: OPEN
      james: '"like maybe monitoring the logs, or have a way for an agent to get event log with errors or something."'
      depends_on: [RQ15, RQ17]
      files: [docs/2026-10-05-failure-reproduction-phasemap.spec (FM2 FM3), cortex/self-heal/failure-mode-forensics.js, intelligence/rfr2]
      does: >-
        For a debug request: the failure's clip and trace, ranked hypotheses each with the observation that would
        confirm or refute it, and the smallest experiment that tells two apart, run in separate cells that share no
        mutable state. A hypothesis is never a fact because it ranks first; the outcome is recorded and the diagnosis
        updated. Where a failure's writer passed no causedBy the macro says it has a hole instead of inventing a chain
        (FM's own rule).
      proof: "on a curated set of known failures the diagnosis names the real cause; a hypothesis refuted by its experiment is recorded as refuted"
      ui: "the Debug tab lists hypotheses with their experiment and result"

    RQ17_observe_by_request:
      layer: library
      status: OPEN
      james: '"Observing? Like maybe monitoring the logs, or have a way for an agent to get event log with errors or something."'
      depends_on: [RQ6]
      files: [lib/component-ledger.js, lib/ledger-fanin.js, lib/agent-tools/tools/diagnostic, idearium/cli/route-commands.js (row: observe), docs/2026-10-05-failure-reproduction-phasemap.spec (FM1)]
      does: >-
        The `observe` intent: events, errors, stack traces, timeouts and failed operations by request, contract, chunk,
        component or phase, through one command and one bounded window (the ledger rows with their causedBy, the error's
        own text, the original event preserved — a summary never replaces it). The request id is the correlation id every
        gated step already writes. Folds FM1 where the same work is wanted.
      proof: "given a failed chunk, `observe` returns its event sequence and the originating error without dumping the log, in a bounded number of characters"
      ui: "an Activity view filtered by request"

    RQ18_test_and_attack_intents:
      layer: cos
      status: OPEN
      james: '"Need intents for speccing, debugging, test and attacking"'
      depends_on: [RQ15]
      files: [cos/spec/torture-chamber.spec, cos/spec/qa-catalog.spec, intelligence (adversary-suite), copilot/adversarial.js]
      does: >-
        The `test` and `attack` intents route to the torture chamber's presets (the phase preset first: property-based,
        mutation, the hallucination check, the phase's own tests, as-is and mutated) and take the contract's invariants
        and dependency boundaries as the attack surface. Every failure ships its reproduction and becomes a regression
        test linked to the chunk. This map adds the intent and the contract link; the stations are the torture-chamber
        spec's own.
      proof: "a seeded defect in a chunk is found by the preset and kept as a reproducible test; the verdict is the chunk's proof"
      ui: "the preset's verdicts on the chunk card"

    RQ19_what_nexus_can_take_over:
      layer: library
      status: OPEN
      james: '"anything deterministic or reusable can be created into a tool, schema, framework, macro, or anything that can use nexus instead of the agents. Anything that it can be offloaded onto nexus can be suggested. Automatically created."'
      depends_on: [RQ14]
      files: [lib/tool-index.js, lib/tool-forge.js, lib/case-library.js, lib/component-store.js, docs/2026-10-01-work-visibility-job-reuse-phasemap.spec (J4)]
      does: >-
        Reads the tool index and the ledgers for the same operation sequence done by an agent again and again, or a step
        a model did that a verifier could have done, or a retrieval that keeps failing; checks the existing capabilities
        first; and proposes a tool-forge composition, a macro, a schema or a workflow with its input and output schema,
        its error handling, and test cases taken from the recorded runs. A proposal runs in a COS cell against the
        recordings, and is registered only after it matches or beats the agent's result and he approves. It records its
        use, failure rate and the tokens it saved. Proposals only — nothing is created unattended (tool-forge's own rule:
        composition, not code the process runs).
      proof: "a seeded repeated sequence is found and proposed once (not again while the proposal is open); an approved one reproduces the recorded results with fewer model calls; one that does not match is not offered"
      ui: "a Suggestions list: what, the evidence, the estimated saving, approve or dismiss"

    RQ20_the_budget_meter:
      layer: library
      status: OPEN
      james: '"remember to use as little tokens for as much leverage and power as possible."'
      depends_on: [RQ14]
      files: [lib/economy, docs/2026-10-09-one-model-engine-phasemap.spec (ME3), lib/pipeline-routing.js]
      does: >-
        Tokens, calls, rung, cache hits and repair counts per request and per phase, read from the ledger the gated steps
        already write, with a budget per task and the stopping condition. Reported beside correctness — tokens saved per
        verified chunk, the first-try pass rate, the escalation rate, the questions asked — never as a number optimised
        alone. Folds ME3 where it is the same table.
      proof: "the report for RQ14's run shows tokens per verified chunk beside completion and rework; a request over its budget stops and says so"
      ui: "the numbers on the request's card"

    RQ21_the_contract_file_is_its_record:
      layer: library
      status: OPEN
      james: '"like these need to be real .contract files(literally .contract as the extension using the yaml files like the rest of the system uses for nodes.)" · "each gate, tags, updates the progress in idearium"'
      depends_on: [RQ0]
      files: [lib/node-export.js, lib/node-schemas/schema.contract and cortex/schemas/schema.contract (the sovereign copy; both change together), cortex/core/raid/contract-intake.js (the file is written again at every transition), cortex/core/raid/event-taxonomy.js]
      does: >-
        Make the file the contract's record, not its birth certificate. The envelope stays exactly as lib/node-export.js
        writes it (no new extension, no second format). The payload gains what the queue row does not hold: boundary
        (RQ22), conditions (RQ23), gates[] (one entry per gate: id, when, the checks with their words, the outcome, the
        failure class from RQ2), checkpoints[] (RQ24), progress (RQ25), and a revision (a change is a new revision with
        a reason, RQ9's rule). Write it at submit with endState and conditions already in it (M9), and rewrite it
        through node-export, never by hand, at every stage transition and every gate. Tags are envelope tags in a small
        closed grammar declared with the events: request:<id> · phase:<id> · gate:<id> ·
        outcome:<pass|fail|reverted|unverifiable> · rung:<model> · kind:<chunk kind>, so queryDir({type:'contract',
        tags}) answers 'everything this request did that failed' with no table. The output file keeps type contract and
        says payload.kind: result, so the two payload shapes are named instead of guessed. The queue row stays the one
        write authority for status (§10.1); the file is a projection rewritten from it, and a disagreement between the
        two is a fault that is reported, not merged.
      proof: "submit a synthesized contract: the file on disk has endState and conditions; run it through three gates: the same file lists three gates with the checks' words and carries the tags, and queryDir by tag finds it; kill the process mid-gate and boot: file and row agree or the mismatch is reported; both schema.contract copies describe the new fields"
      ui: "the request's card opens the .contract as it is — gates, tags, checkpoints, progress — the file, not a rendering of something else"

    RQ22_the_dependency_boundary_with_invariants_that_run:
      layer: library
      status: OPEN
      james: '"synthesis using primitives, invariants, principles, etc as a boundary using dependancies"'
      depends_on: [RQ7, RQ9, RQ1]
      files: [cortex/core/raid/contract-boundary.js, cortex/core/raid/context-gate.js, lib/registry-harness.js, lib/charter.js, cos/foundation/intent.js, lib/chunk-verify.js (RQ1 - its scope check reads this)]
      does: >-
        Today the boundary is a lookup keyed source:intention with a primitive and principles, and every row's
        invariants is empty. Make it a property of the contract, computed from the dependency graph. The primitive is
        the registry component the chunk's file belongs to (the card from registry-harness: requires, required-by,
        events, tests). The EDIT boundary is that component's files. The VERIFICATION radius is the component plus what
        requires it, because that is what a change can break. Principles are §N.N refs validated against
        docs/AXIOMS-v3.1.md (synthesizeContract already does this). Invariants are rules written as data { id, says,
        check { kind: file | command | tests | page | compare }, source } and come from where they already live: the
        charter's always-true conditions; the owning spec's invariants: prose (charter.js says it is never checked —
        this makes them checkable one at a time, and one that cannot be made checkable stays prose and is reported as
        unchecked); a registry component's declared events and wires. The gate evaluates them. An invariant that cannot
        run is UNVERIFIABLE, never passed. A change outside the edit boundary is out-of-scope (RQ1's check); a change
        inside the radius with no test covering it is flagged, not assumed safe.
      proof: "a chunk that edits a file outside its component is refused naming the boundary; one that breaks a seeded invariant (an event the component promises and no longer emits) fails at the gate with the invariant's id; an invariant with no check is listed as unchecked and does not count toward completion; the registered source:intention rows (including the 8 self-heal ones) keep resolving"
      ui: "a chunk card shows its primitive, its radius and each invariant: checked, passed, failed or unchecked"

    RQ23_acceptance_conditions_that_cannot_be_moved:
      layer: library
      status: OPEN
      james: '"creates conditions for acceptable to complete the contract."'
      depends_on: [RQ9, RQ1]
      files: [lib/end-state.js, lib/charter.js, cos/foundation/intent.js, cortex/core/raid/contract-intake.js (BUILD_CONTRACT_SCHEMA conditions grows from pre/post strings to checks), idearium/repo/proof-run.js (the check kinds)]
      does: >-
        A contract is complete when its conditions are met by evidence, not when an agent says so (RQ10's rule, given
        its mechanism). The conditions are data in the .contract — { id, says, check { kind, run or expect }, weight },
        with the kinds the charter and the proof runner already have (file, command, tests, page) plus compare (RQ26)
        and invariant (RQ22). They are declared through lib/end-state.js, which already freezes them, evaluates them
        with evaluators the agent does not supply, reports partial progress, and ends REACHED, FAILED, STUCK,
        UNVERIFIABLE or ABANDONED. The map from a YAML condition to an evaluator is a registry by kind, owned by the
        system, not by the run — that is what lets a function-shaped end-state live in a file (M11). WHO writes them is
        the point: the decomposer (the planner role, a reasoning agent, as RQ9) writes them at contract creation from
        the satisfied obligations, and a model that does the work never writes the tests it is judged by. A condition
        that proves wrong goes through end-state's proposeAmendment, a review queue and his accept; the amendment is a
        new revision and the old one stays readable. The compartment's charter.spec axioms and conditions are inherited
        (cos-bridge withInherited already does this for repos). A contract also declares its EXPECTED deltas — the
        behaviours it is meant to change — so RQ26 can tell an intended change from drift.
      proof: "a run that edits its own conditions is refused (frozen); a condition whose check cannot run leaves the contract UNVERIFIABLE, not complete; a contract with unmet conditions stays open however the agent reports; STUCK is reported apart from FAILED; an amendment waits in the review queue and changes nothing until he accepts it"
      ui: "the contract shows each condition — met, unmet or unverifiable — with its evidence and the progress from 0 to 1; an amendment is a card he accepts or declines"

    RQ24_the_gate_transaction:
      layer: library
      status: OPEN
      james: '"each gate, tags, updates the progress in idearium, backs up on success, then can revert upon failure"'
      depends_on: [RQ21, RQ23, RQ2, RQ10]
      files: [lib/chunk-verify.js, lib/repo-inject.js (revert exists), versionium/lib/engine.js (commit, restore, createBranch), cortex/core/raid/index.js (verify() becomes the tail of the gate), cortex/core/raid/contract-intake.js (onFail), lib/replay-engine.js]
      does: >-
        One shape for every gate of a contract: design.the_gated_step with a transaction around it. (1) Tag the file
        gate:<id> outcome:running. (2) Pre-checks (RQ1) and the boundary (RQ22). (3) The one bounded step. (4) Post-
        checks: the checks, the invariants, the conditions that apply at this gate, the comparison and the drift (RQ26).
        (5) On PASS: a checkpoint — the applied injects' ids and file hashes, and a versionium commit as the named
        backup — written to checkpoints[], the gate entry written to gates[], the tags set, progress pushed (RQ25). (6)
        On FAIL: revert to the LAST passing checkpoint, then the failure record (RQ2's vocabulary), then exactly one of
        repair · escalate · ask · halt by the contract's onFail and the escalation triggers; nothing in that is chosen
        by a model. Revert is lib/repo-inject.js's revert, which already writes `before` back (or deletes a file the
        inject created), refuses when the file changed since apply, and reads the file back to prove it; the versionium
        commit is the backup that survives a restart. A gate that cannot checkpoint does not run work that cannot be
        undone. The ledger rows are never reverted (§0.3: the failure is data); files are. A failed chunk leaves its
        dependents blocked, as the queue already does for a permanently failed row, until RQ12 re-plans only them.
      proof: "a passing chunk leaves a checkpoint whose hashes match the tree; a chunk that fails at the third gate leaves the tree byte-identical to the second gate's checkpoint (hashes compared), the failure recorded, the dependents blocked; with versionium down the gate says backup unavailable, a reversible chunk still reverts from `before` and an irreversible one is not run; a file edited by hand after apply is refused by revert, not overwritten"
      ui: "each gate on the chunk card: tags, outcome, checkpoint, and a Revert that says what it will restore"

    RQ25_progress_is_evidence_not_activity:
      layer: library
      status: OPEN
      james: '"updates the progress in idearium"'
      depends_on: [RQ21, RQ23]
      files: [idearium/api/index.js (POST /api/queue/:queueId/progress and /api/ideas/:uuid/progress exist), lib/charter.js (idearium_charter_runs), cortex/core/raid/event-taxonomy.js, idearium/cli/route-commands.js (row: progress), idearium/ui/js/plan-panel.js]
      does: >-
        At each gate RAID reports to idearium over idearium's own API (§5.10; RAID never writes idearium's tables,
        §10.1): the existing queue.progress route for the event, idea.progress where the contract came from an idea, and
        a charter run where the compartment has an end_state. The number sent is the contract's end-state progress —
        conditions met, weighted, from lib/end-state.js's evaluate — not gates passed over gates planned, so a contract
        that has passed ten gates and met no condition reads 0, not 80. The events (raid.contract.gate.passed, .failed,
        .reverted, .unverifiable) are declared in cortex/core/raid/event-taxonomy.js before they are emitted. A push
        that fails is not a failed gate (contract-intake already degrades its idearium calls this way) but is held,
        retried and shown as unsent, never dropped (§1.2). The progress is also a command row, so an agent is told what
        a person sees.
      proof: "run three gates, one failing and reverted: idearium's Plan shows progress move with conditions, drop back on the revert, and list the failure; stop idearium mid-run: the pushes are held and delivered in order on its return; a contract with every gate passed and no condition met shows 0"
      ui: "the request's Plan row: progress from conditions, the last gate, the last failure"

    RQ26_comparison_and_drift_on_real_signals:
      layer: library
      status: OPEN
      james: '"uses the comparison engine, behaioral drift engine"'
      depends_on: [RQ0, RQ23]
      files: [cos/playground/compare.js, lib/execution-pipeline.js, cortex/core/raid/index.js (_scoreRun), intelligence/bda, intelligence/cfr/sigma.js, intelligence/cfr/ledger.js, lib/component-ledger.js]
      does: >-
        Two engines, each used for what it can see. COMPARISON (cos/playground/compare.js) is the one that sees code
        behaviour: the same command in the baseline branch and the changed branch — file diff, run metrics, stdout diff,
        a regression map. Today it compares against the last-promoted 'golden' and is skipped when there is none; give
        it the contract's own baseline revision, so the first change has something to be compared with, and judge its
        output against the contract's declared EXPECTED deltas (RQ23): a declared delta is progress, an undeclared one
        is drift, a regression is a failure. That is the hard drift condition, and it is deterministic. DRIFT
        (intelligence/bda and intelligence/cfr/sigma) is read as it is built — BDA scores five signals of a text
        (valence, certainty, openness, tension, selfref) into a regime, sigma scores how far an event is from its ledger
        baseline — so it is pointed at what it can see: the agent's own output text across a chunk's attempts, and the
        run's real ledger events with their payloads against a baseline from the event ledger. It stays what RAID built
        it to be, a soft signal (weight 0.3) that raises a question; it never fails or completes a contract by itself.
        Both write what they saw into the gate entry. Today (read, not run): verifyInIsolation scores a synthetic event
        with no payload and no error word in its name against an empty baseline, and BDA a sentence RAID wrote about
        itself; by the arithmetic the sigma cannot exceed about 0.13 for the actions it names, so its 0.7 spike flag
        cannot fire. RQ0 runs it to confirm.
      proof: "a seeded behaviour change nobody declared fails the comparison gate naming the unexpected delta; the same change declared as expected passes; a regression fails; on a seeded run where the agent's repairs turn incoherent the drift signal rises on the new feed and does not on today's; the first change in a compartment is compared with its baseline revision, not skipped"
      ui: "the gate shows the comparison (expected, unexpected, regressed) and the drift signal beside it, labelled soft"

    RQ27_the_reasoning_half_gets_its_home:
      layer: library
      status: OPEN - blocked on decision_raid_home
      james: '"what if we move raid to a copilot module or intelligence system? we can use decomposition, analysis, all the memory, ledgers, etc, and synthesis"'
      depends_on: [RQ7, RQ9, RQ12, RQ21]
      files: [cortex/core/raid/context-synthesis.js, cortex/core/raid/context-gate.js, cortex/core/raid/officiator.js, intelligence (one module beside bda cfr gap rfr2 - the name is his; not synthesis, which is gap synthesis), lib/registry-harness.js, lib/context-atlas.js, lib/case-library.js, lib/agent-memory.js, lib/component-store.js, copilot/analysis.js (reads the same), intelligence/registry-components.js, idearium/cli/route-commands.js (rows)]
      does: >-
        Only if decision_raid_home chooses [A] or his own variant. Four verbs, each a gated step with a schema in and
        out. DECOMPOSE: a request into obligations, then chunks and the dependency DAG (RQ7, RQ9, RQ12). ANALYSE: what a
        chunk touches and what it can break — the registry card, the context atlas, the ledgers' last failures, the cfr
        and rfr2 causal edges. RECALL: the memory — case-library exemplars, component-store, agent-memory, RQ2's failure
        index; what was tried before on this kind of chunk and how it ended. SYNTHESIZE: the satisfied obligations into
        the contract with its boundary, its conditions and its expected deltas (RQ9, RQ22, RQ23). The module reads; it
        never writes a contract. RAID, in cortex, stays the one write authority for the queue, the files, the gates and
        the revert, and calls the module through the one nexus.command door as a contract (§5.10), so a person, copilot
        and an agent get the same answers. If the module is unreachable a contract is not made without its reasoning: it
        is refused as a named gap (RQ8), and the deterministic gates on contracts already made keep running. What moves
        is the code that reasons; what stays is the code that enforces. Nothing moves until RQ0 has run both halves, and
        a move is one require at a time with the old path left as a shim until a test per caller passes (§16.5).
      proof: "a contract synthesized with the module up carries the same fields as today's; with the module down it is refused naming the gap and an already queued contract still drains; no caller of core/raid changes its require; each verb's output validates against its schema; request to contract uses only the command door"
      ui: "the copilot pane says which verb ran and what it read; the work surface shows the reasoning the contract came from"

  # ── Where this map meets maps that are already open (his call; nothing here moves them) ──
  folds:
    - "SD12 (a spec starts from its primitives) and SD14 (chunks cut at primitives): RQ9's chunks and RQ12's DAG are SD14's cut, made on a request; propose RQ9 depends on SD14 where it is built first."
    - "SD10 (the adversarial gate): RQ18 is the contract-side of it."
    - "J0–J3 (work events, guardian job as the record, the background panel, the plan from the chunk graph): RQ12 is J3; RQ13's compartment view and RQ17's observe read J0's work.* events once they exist."
    - "SN0–SN4 (one branch, a snapshot as a compartment, parallel, rfr2 measure, benchmarks teach) and the torture chamber: RQ15 is their consumer. SN0 is a prerequisite, not a duplicate."
    - "ME3 (one budget), ME5, ME6 (the chooser and the learner): RQ2 and RQ20 feed them; do not build a second learner."
    - "FM1–FM4 (ledgers into rfr2, a failure is a clip, run it in COS, the failure-mode report): RQ16 and RQ17 consume them."
    - "VP1, VP2, VP5 (confidence from evidence, adversarial review, provenance): RQ13's provenance is VP5's join; RQ1's checks are VP1's evidence."
    - "CT2's open item (constraint verdicts): RQ2 supplies the stations that make them real."
    - "docs/raid-warp-verification-phasemap.spec (P1–P7, complete): RQ24's gate is its fused verify() with a transaction around it, and RQ26 repairs what P4 and P5 were fed. One verify path, not two (§10.3)."
    - "CH1–CH5 (lib/charter.js) and lib/end-state.js: RQ23 builds no new kind of condition; it gives a contract the ones a compartment already has, and keeps their frozen rule."
    - "docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (SY1, SY2): intelligence/synthesis is gap synthesis; RQ27's module must not take its name or its tables."
    - "SN0–SN4 (docs/2026-10-10-snapshot-compartments-phasemap.spec): RQ24's checkpoints use repo-inject's revert and a versionium commit now and become snapshot compartments when SN1 lands; RQ15 stays the consumer of parallel."
    - "IC1–IC5 (docs/2026-08-30-interaction-contract-context-phasemap.spec): the .contract's stage walk is IC5's. RQ21 writes it into the file and adds no stage."

  pushback:
    - >-
      Thirty features is not thirty phases. The blueprint's list was a target architecture; this map keeps what is not
      already built and folds the rest. Where a built piece satisfies a feature, the work is to prove it and connect it
      (RQ0), not rebuild it.
    - >-
      The gates are only as good as the checks. A passing weak check is worse than none because it looks like proof.
      That is why RQ1 comes before the spine, and why a check that cannot run is reported unknown rather than ok.
    - >-
      A small model's reliability is a measurement, not a claim. RQ5 and RQ14 exist so that "the smallest models can do
      this" is a number from a pinned set of tasks. Until RQ5 has run, any such figure is a prediction.
    - >-
      Authoring the contract is not a small-model job. The planner (PC1) is a reasoning agent and stays one; the small
      model writes one file at a time inside a contract it did not write. Pushing contract authoring down to the 3b
      would move the failure upstream, where it costs more.
    - >-
      Parallel cells cost real machine time and memory on a 4 GB box. RQ15 uses bounded concurrency and the economy's
      right to refuse (torture-chamber AX7), and does nothing in parallel that shares mutable state.
    - >-
      Placement on the path is his decision (one-roadmap OR1): this map's phases are OPEN and count as roadmap until he
      marks the map PATH or LATER. The coder's suggestion is RQ0–RQ5 on the path, behind solid, and the rest LATER until
      RQ5's report exists.
    - >-
      The move as asked is two moves. RAID is a queue, files, gates and a revert that must exist before anything else boots
      (cortex is phase 1 and critical, guardian phase 2 and critical; copilot and versionium are phase 3 and optional) — and a body
      of reasoning that can arrive late. Moving the first into copilot or intelligence puts a safety gate after the things it gates,
      removes it when that process is down, and changes about 60 source files and 35 tests. Moving the second is cheap and is what
      he described: decomposition, analysis, memory, synthesis. That is decision_raid_home [A].
    - >-
      'Behavioral drift' is two things and only one is built for this. BDA reads the affect of a text and sigma reads how unusual
      an event is; neither reads what code does. The engine that reads code behaviour is the comparison engine, and it can say
      expected or unexpected only if the contract declared what it was meant to change (RQ23). Until RQ26's proof shows the drift
      signal move on a seeded run, no phase may call it a gate; it is a flag. A passing weak check is worse than none.
    - >-
      Whoever writes the conditions decides what 'done' means. lib/end-state.js names the failure: a loop that may innovate and may
      edit its own target will reinterpret the target. So the conditions are written by the planner, frozen, and amended only by
      him; a model that does the work never writes the tests it is judged by. This is also why authoring stays a reasoning-agent job.
    - >-
      Revert restores files, not the world. A step that sent a message, wrote another system's table or emitted an event did that,
      and the ledger keeps it on purpose (§0.3). A gate whose step has such effects is irreversible: it needs his approval before it
      runs (design.when_a_bigger_model, trigger f), not a revert after.
    - >-
      A file per chunk is the literal reading of 'each gate' and the most expensive: every queue row makes a compartment, a COS
      compartment and an idearium repo, and idearium once re-chunked a repo on every retry (fixed 2026-09-15). Gates are entries in
      one contract's file; a child file only where a chunk has to run apart (decision_contract_files).
    - >-
      Placement (one-roadmap OR1): RQ21–RQ27 are OPEN and count as roadmap until he marks them. The coder's suggestion, after RQ5's
      report: RQ21 first (it needs only RQ0), RQ22–RQ26 alongside RQ9 and RQ10 because they are what make the gate a gate, RQ27 last
      and only after decision_raid_home. Everything added in 1.1.0 was read in source, not run; the sigma figure is arithmetic on the
      code, not a measurement.

  measures:
    - "first-try pass rate of the gate, per model and per kind of chunk"
    - "repairs per chunk, and the share fixed from the check's words alone"
    - "escalation rate per kind of chunk (has to fall) and the share of chunks finished on the smallest rung"
    - "questions put to him per request, and the share that were facts the repository already stated (has to be zero)"
    - "tokens per verified chunk, beside verified completion and rework — never alone"
    - "cache and exemplar hit rate"
    - "reverts that restore the checkpoint byte for byte (has to be all of them), and gates that could not checkpoint"
    - "contracts closed with every condition met by evidence, against contracts an agent reported done (the gap has to be zero)"
    - "conditions amended after a run began, and by whom (has to be only him)"
    - "drift flags a later check confirmed, and drift a seeded run contained that no flag caught"

  definition_of_done:
    each_phase: >-
      A phase is done when it has: its purpose (which repeated cost, risk or failure it removes); exact input and output
      schemas; the NEXUS capabilities it reuses (named); which steps are deterministic and which use a model; what
      happens when context is missing, stale or contradictory; its allowed scope and what needs approval (retrieved
      text and agent history can never override the execution policy); normal, boundary, adversarial and recovery tests;
      the events and numbers that prove it worked, declared in the system's event taxonomy first; where its outputs and
      evidence come from; and whether it cuts tokens, time, retries or his effort without lowering correctness. Generated
      code, a new tool or a passing isolated unit test is not proof of value — the proof runs through the real path.
    version: "one version line per phase in lib/version.js, opening with his words verbatim; a CHANGELOG-*.md that does the same; nothing in data/** is committed"

  deferred:
    - "Cross-project capability sharing and the model-routing statistics across repositories: after RQ19 has produced a proposal that survived use; local validation before a procedure runs in another repo."
    - "A benchmark laboratory beyond RQ5 and RQ14 (a large corpus, repeated trials across model versions): after RQ14, if the report says the spine is worth measuring harder."
    - "A drift-and-health monitor that raises proposed contracts for repair work: the pieces are loom's friction, tension and spec-drift; after RQ13 a repair can be a contract, and the monitor then only has to raise one."
    - "Capability and integration API for outside clients: nexus.command is the one door already; a versioned external schema waits until two clients need it."
    - "A child .contract per chunk as the default (decision_contract_files [B]): after RQ24 shows how many chunks have to run apart."
    - "Invariants that span two components' contracts: after RQ22 has run on one component."
