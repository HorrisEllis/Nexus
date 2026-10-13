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

