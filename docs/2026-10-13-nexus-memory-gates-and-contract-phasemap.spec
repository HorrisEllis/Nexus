spec:
  meta:
    name:     nexus-memory-gates-and-contract
    version:  1.0.0
    date:     2026-10-13
    release:  "0.60.14 (base)"
    uuid:     nexus-memory-gates-contract-phasemap-v1-0000-2026-1013-jamesbrooks-001
    owner:    "idearium (contract, gates, context) · cortex/RAID (the gate decisions, ledgers) · versionium (checkpoints) · clear-glass (profiles ↔ hats)"
    status:   "MAPPED 2026-10-13. Done in 0.60.14: LN0 (lines tool), IM0 (his intent map). Everything else OPEN, built on what exists (named per phase)."
    voice:    "`james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-13: "need to use nexus as persitent storage, each interaction gated, that way each gate can be a
      different agent, using the ledgers or previous conversations, or anything as a way to use nexus for consistencey
      across domains. a tool to request lines from a file to copy to the worksurface or a new file to edit so it can be tiny
      amounts of code. like i want to make nexus hold as much as possible, as much data, and checkpoints that can save our
      progress the better. need to be able to change the intent map and routing. like all data in the repo needs to
      persist. mapping, gathering context from the dependancies look at the phases from today, get this working with new
      context gathering methods, and intent routing, all the phases from today and yesterday that will idearium working.
      profiles in clearlgas that can link to hats. multiaccunt setup in clearglass, using porofiles?" · then: "the context
      from synthesis needs to be the smallest representation of the context without losing its meaning. like make sure
      the contract is like a reference, like it needs to list everything needed to be done, dependancies,, context,
      everything in as little context as possible, each blocvk a task or phase to the llm to reference each gate?"

  phases:
    LN0_lines_tool:
      status: "DONE — 0.60.14"
      james: '"a tool to request lines from a file to copy to the worksurface or a new file to edit so it can be tiny amounts of code"'
      files: [idearium/api/index.js, idearium/cli/route-commands.js]
      does: "repo lines <repo> <path> <from> [to] (numbered); repo lines copy … → worksurface/<name>.L<from>-<to><ext> as a proposed inject (apply writes it, revert undoes it)."
      proof: "test-reasoning-route WR-04"
    IM0_intent_map_his_to_change:
      status: "DONE — 0.60.14 (0.60.12 on/off + reasoner, put back after the 0.60.13 merge)"
      james: '"need to be able to change the intent map and routing"'
      files: [lib/reasoning-route.js, lib/pipeline-routing.js, idearium/ui/settings.html]
      does: "Settings → routing: reason_route on/off, reasoner, reason_kinds (his kinds; prefix*; !kind removes a built-in)."
      proof: "test-reasoning-route DR-04, DR-05"

    CT0_the_contract_is_a_reference:
      status: "DONE — 0.60.15 (proof: test-contract-gates 11/11, test-contract-ct0-self 2/2; CT0 complete by its own contract)"
      james: '"the contract is like a reference, like it needs to list everything needed to be done, dependancies,, context, everything in as little context as possible, each blocvk a task or phase to the llm to reference each gate" · "Intent and outcome … Dependency graph … Context references … Primitive requirements and invariants … Tasks, phases and gates … Verification and failure handling … each block in a .contract file(literally contract as the file extension.) using yaml file, each gated as steps"'
      decision: >-
        James, 2026-10-13, approving the coder's proposal: "extend Nexus's existing .contract system and make it executable,
        rather than create another planning format alongside it." Build on BUILD_CONTRACT_SCHEMA (cortex/core/raid/
        contract-intake.js), the node envelope (lib/node-export.js), the check catalogue and .chunk references; duplicate none.
      exists: [cortex/core/raid/contract-intake.js (BUILD_CONTRACT_SCHEMA, synthesizeContract, submitContract, dependsOn/onFail), lib/node-export.js (envelope, toYaml/fromYaml), cortex/input/*.contract and guardian/input/*.contract (v1, real), lib/import-checks.js (CK-001/002/060 executable), cos/spec/check-catalogue.spec]
      files: [cortex/core/raid/contract-gates.js, idearium/cli/route-commands.js, docs/contracts/ct0-executable-contracts.contract, tests/modules/test-contract-gates.test.js]
      does: >-
        .contract v2 (same envelope, same file type; every v2 field optional so v1 loads as v1): outcome (what, why,
        done_when), refs (path + content hash, line range, component id), invariants (each with a check), gaps
        (missing, inspected, blocks, resolve_when), gates (context | task | verification | phase; depends_on, requires,
        actions, pass_when, proof, on_failure), completion, failure policy, and state (each gate's status, evidence, the
        hashes it passed against, attempts). Gate states BLOCKED · READY · RUNNING · PASSED · FAILED · STALE (SKIPPED only by
        a rule that marks a gate optional). Conditions are machine-checkable — test <file>, exists <path>, evidence <key>
        [match], gate <id>, check CK-nnn — anything else is unverifiable and can never pass. Commands: contract new, contract
        gates, contract packet <gate> (the minimal context for one gate), contract check <gate> (verify and record),
        contract status.
      acceptance:   # his four, verbatim in substance (2026-10-13)
        - "Backward compatibility: existing contracts load and behave correctly under v2 — tested on the real legacy files (cortex/input, guardian/input), not only fixtures."
        - "Evidence-driven evaluation: every mandatory completion condition resolves to a machine-checkable check or recorded evidence with a validation rule; missing proof is never a pass."
        - "Reliable invalidation: a hash mismatch invalidates the gates that require that ref and, through depends_on, only those downstream — unrelated gates keep their result."
        - "Self-hosting proof: CT0 runs through its own contract; its completion is established by the evaluator, not declared by the agent building it."
      note: "His: a content hash proves the content is a given version, not that it is correct — the checks prove correctness."
      success: "Nexus loads a contract, builds a minimal gate packet, evaluates the gate against real evidence, records the result, and resumes safely without trusting an unsupported claim of completion."
    CT1_dynamic_chunking:
      status: "DONE — 0.60.16 (split, shouldSplit, learned boundaries; contract split / contract budget; test-contract-gates CC-11–14)"
      james: '"everything can be broken down into smaller pieces, with gates between. dynamic chunking for smaller agents or if the agent is struggling?"'
      depends_on: [CT0_the_contract_is_a_reference]
      builds_on: "pipeline-routing shouldChunk/planMode (per-file chunking for Ollama) · the door's learned outcomes · CT0 gates"
      does: >-
        A gate whose packet exceeds its agent's budget (a small model's context), or that failed twice, is split into
        sub-gates — one per required ref, action or file — each with its own pass_when, the parent passing only when all its
        children pass. The split is recorded in the contract (nothing lost), so the next run starts from the smaller gates.
    GT0_every_interaction_gated:
      status: "OPEN"
      james: '"each interaction gated, that way each gate can be a different agent, using the ledgers or previous conversations"'
      builds_on: "the model door (one route per kind) · RAID decideForContract · the ledgers · lib/repo-agent.js conversationFor"
      does: >-
        Each CT0 block passes its gate before the next starts; the gate is a kind on the door, so each gate can have its own
        agent (IM0 decides which). What the gate saw and decided is written to the ledger — the next gate (and any agent,
        any provider) reads that, not a re-sent conversation.
    MEM0_nexus_holds_everything:
      status: "OPEN"
      james: '"i want to make nexus hold as much as possible, as much data, and checkpoints that can save our progress … all data in the repo needs to persist"'
      builds_on: "versionium (snapshots, history import, 0.60.7) · repo notes · the ledgers · nodes"
      does: "A checkpoint per passed gate (a Versionium snapshot + the contract's state), so work resumes from the last passed block after any crash, restart or provider switch. A census of what a repo keeps where, and what does not persist yet."
    CX0_context_from_dependencies:
      status: "OPEN"
      james: '"mapping, gathering context from the dependancies"'
      builds_on: "lib/component-store.js closure · loom wires · lib/project-decompose.js"
      does: "A block's context is its dependencies' contracts (exports, signatures) from the component store and loom — not their files."
    TD0_today_and_yesterday_working:
      status: "OPEN"
      james: '"all the phases from today and yesterday that will idearium working"'
      does: "The open phases of 2026-10-12/13 that make Idearium work end to end, in order — request spine (RQ), projects (PL1, PL5), identities (ID1, TB1), then CT0 → GT0 → MEM0 — run as a contract through the pipeline itself."
    PF0_profiles_linked_to_hats:
      status: "OPEN — mapped as ID1 in docs/2026-10-13-identities-tabs-and-automation-phasemap.spec; his 0.60.13 session hub is its base"
      james: '"profiles in clearlgas that can link to hats. multiaccunt setup in clearglass, using porofiles?"'
    CT2_ingestion_as_contracts:
      status: "OPEN"
      james: '"like this is meant to be agent tools. like the chunking. for data ingestion. like this could be immensly powerful to intake data. like think clearglass. etc. also learns better boundaries overtime, nuance, uses nexus to hold the complexity, models or compartments."'
      depends_on: [CT1_dynamic_chunking]
      builds_on: "contract-gates (split, packet, Boundaries) · Clear Glass readPage / the interaction field · lib/import-checks.js · the component store · idearium spec-engine chunking"
      does: >-
        Intake as a contract: a source (a page Clear Glass reads, a zip, a repo, a document) becomes refs; one gate per
        piece; each piece's packet goes to the agent the door picks; what it extracted is evidence; a piece too big for its
        agent splits (CT1), and the sizes each agent handled are learned per kind of source (Boundaries, kind = the source
        kind) — so boundaries get better with use. Nexus holds the whole (the contract, its refs, the evidence); each agent
        only ever holds one piece.
    CT1b_reviewed:
      status: "DONE — 0.60.17"
      asked: "the review he brought: split also on capability mismatch, verification complexity and dependency complexity; every child keeps the original requirement; a parent must not pass merely because its children did — integration is a first-class gate; test a cycle, a child stale mid-execution, and children-pass-but-integration-fails"
      does: "shouldSplit: context · capability · verification · dependency. split: each child carries requirement {gate, outcome, actions}; the parent needs its own integration condition (or <gate>.integrated evidence); validate refuses a split parent without one. STALE now sticks until re-verified (a bug the mid-execution case found)."
      proof: "test-contract-gates CC-15–18"
    SC0_scheduler:
      status: "DONE — 0.60.17 (core); executors beyond the agent tools registry OPEN (EX0)"
      james: '"include from copilots tools, brainos, and clearglass automatation, and pipeline workflow and macros, and frameworks and programmable. like a lot of this exists, in clearglass, brainos, phases already."'
      files: [cortex/core/raid/contract-gates.js, idearium/cli/route-commands.js]
      does: "schedule(): every READY (or STALE) brick runs — independent ones concurrently — its run { tool, args } through lib/agent-tools executeTool (the one registry: copilot tools, clear-glass/automation.js · macro.js · browser-automation.js, execution/run-pipeline.js · run-chain.js · run-closed-loop.js, nexus/command.js); output recorded as evidence; the gate checked; repeat until nothing is ready. A brick whose kind of work has no executor is set aside and said. contract run."
      proof: "test-contract-gates CC-19 (two independent bricks overlap in time; outputs recorded; complete by the evaluator; a no-executor brick reported)"
    EX0_executors_he_already_built:
      depends_on: [SC0_scheduler]   # mapped from the files they share: SC0_scheduler (cortex/core/raid/contract-gates.js)
      status: "agent + phase adapters and the Build integration DONE — 0.60.18 (EX0a–f); glass and pipeline executors OPEN; the live update-system run with Ollama is his (CHANGELOG-0.60.18)"
      builds_on: "lib/agent-tools/tools/* (registered) · BrainOS workflows · Clear Glass automation nodes + macros (clear-glass/src/automation/*, src/macros) · the phase pipeline (plan → code) · the model door (agent work by kind)"
      does: "One executor kind per thing that exists: tool (done), agent (the door: a brick's kind picks the model — 0.60.9 routing), glass (a Clear Glass automation or macro on a named tab), pipeline (a BrainOS / Idearium workflow), phase (an Idearium phase build). No new runner: each is an adapter onto what is already there."
      james: '"Yes. Build the agent and phase adapters next, then wire Idearium''s phase build through the contract scheduler... build and test the adapters independently first, then connect the phase-build action." · "the scheduler must distinguish a failed task from a task that has no available executor. The latter should be reported as blocked or unsupported, not repeatedly retried or incorrectly marked complete." · "Keep the existing tool registry as the execution boundary, avoid duplicating routing logic and make the first real phase build produce an auditable record of every brick, dependency, checkpoint and gate."'
      chunks:
        EX0a_scheduler_outcomes:
          files: [cortex/core/raid/contract-gates.js]
          does: "schedule() reads what an executor says: { unsupported, why } → the brick is set aside as blocked/unsupported (reported under blocked[], never retried, never FAILED, never complete); { decompose } → split() when the brick has pieces, else unsupported (too big for every routed agent and indivisible); { evidence } → recorded. A FAILED brick under the retry limit is run again (recovery); twice failed with pieces → split (capability trigger). Every pass is a checkpoint: p.state.checkpoints[] { gate, at, hashes, agent } and onCheckpoint(p, gate) so the caller saves. Children of a split keep the parent's run and kind."
        EX0b_agent_adapter:
          files: [cortex/core/raid/contract-adapters.js]
          does: "agentExecutor({ route, dispatch }) — route defaults to lib/model-door.js route() by the brick's kind (no routing of its own); each routed agent's learned budget (Boundaries.budget) is checked against the brick's packet; agents it is too big for are skipped, said; none fit → decompose. dispatch(hops, ctx) is the caller's existing runner (Idearium: PRt.climb over the existing makeAttempt — the ladder escalates). Evidence: <brick>.agent, <brick>.route, plus the runner's verification. No dispatcher or no agent → unsupported."
        EX0c_phase_adapter:
          files: [cortex/core/raid/contract-adapters.js, lib/phase-plan.js]
          does: "fromPhasePlan(plan) → a v2 contract: one brick per planned file (kind build:file.<ext>, requirement = the file's purpose and exports, actions = its steps, depends_on = the plan's import edges via phase-plan depsOf), pass_when = the verification evidence (<brick>.verified matching ^ok — checkChunk: every planned export present) plus { exists } when writes go to disk; refs = the inputs given (the phasemap) + every existing file the plan edits; a parent `phase` gate whose integration is <phase>.integrated matching ^met (the phase's proof run). plan_hash kept so a changed plan rejects old checkpoints."
        EX0d_checkpoints_and_audit:
          files: [cortex/core/raid/contract-adapters.js]
          does: "openCheckpoint(file, built): no file → fresh; plan_hash differs → the old contract archived beside it (.superseded-<ts>, §0.3) and fresh, said; same plan → resumed: PASSED kept, changed inputs STALE (evaluate), exhausted FAILED reset to READY with the old attempts kept in state.history. audit(p) → every brick (file, status, agent, attempts), every dependency edge, every checkpoint, every gate."
        EX0e_build_integration:
          files: [idearium/api/index.js, lib/pipeline-routing.js]
          does: "_phaseBuild's planned path runs the plan as a contract (routing.contract_build, default on; off = the sequential loop, kept). The contract lives at data/contracts/phase-builds/<repo>/<map>.<phase>.contract (state, never committed). Bricks run through the scheduler (routing.contract_concurrency, default 2); the agent executor's dispatch is the existing climb + makeAttempt with the plan's chunkBrief (what earlier bricks really export, read from their evidence); the integrate executor is the existing _provePhase. Each pass saved; a 'contract' row on idearium_phase_runs carries the audit, so the Plan shows it."
        EX0f_command_route_ui:
          files: [idearium/cli/route-commands.js, idearium/api/index.js, idearium/ui/js/phases-manager.js]
          does: "contract.audit <file> (command row, every agent has it); GET /api/idearium/repos/:uuid/phases/contract?map&phase → the audit; the Plan shows the contract row (bricks, checkpoints, blocked)."
      proof: "tests/modules/test-contract-adapters.test.js — EA-01 agent routed through the door, evidence recorded; EA-02 over every budget → decompose; EA-03 no dispatcher → blocked, not retried, not complete; EA-04 a failed brick recovers on retry; EA-05 plan → contract keeps files, deps, requirements, integration; EA-06 a changed input makes the checkpoint stale and only that brick and its dependents re-run; EA-07 a changed plan rejects the checkpoint (archived); EA-08 the phase cannot pass until integration is met; EA-09 audit lists every brick, edge, checkpoint, gate. Live: the end-to-end run on update-system with Ollama is his (commands in CHANGELOG-0.60.18)."
      reading: "The coder's reading, to confirm: 'the existing tool registry as the execution boundary' — nothing runs outside schedule()'s executors; the tool executor stays lib/agent-tools executeTool and the agent executor dispatches through the repo agent Idearium already uses (its tools are the registry's). No new runner."

## ADDENDUM 2026-10-13 — EX0 built (0.60.18)

# James: "Yes. Build the agent and phase adapters next, then wire Idearium's phase build through the contract scheduler... build and test the adapters independently first, then connect the phase-build action." His order was kept: EX0a–d were built and tested alone (test-contract-adapters 11/11) before EX0e touched _phaseBuild (test-contract-phase-build 5/5 on the real route).

# - Decided by him: the order; blocked/unsupported is not failed; the tool registry stays the execution boundary; no
#   duplicated routing; an auditable record of every brick, dependency, checkpoint and gate.
# - The coder's calls, his to confirm:
#   - routing.contract_build is on by default. Off restores the sequential loop, which is kept.
#   - Contracts live in Idearium's data dir as state.
#   - An indivisible brick over every learned budget is tried anyway, its route saying so, rather than blocked. A budget
#     is a prediction, and his rule was "escalate or decompose".
#   - A transient provider failure no longer teaches Boundaries a size.
# - Drift from the map: none in scope. One real defect was found by CP-04: one provider error capped the learned budget,
#   and the next brick read as "too big". It is fixed and recorded in CHANGELOG-0.60.18.
# - Registration: contract-gates (owed since 0.60.15), contract-adapters, model-door and phase-plan are now in
#   loom/maps/raid-events-and-tools-map.js with their real edges, plus idearium/api as their consumer.

