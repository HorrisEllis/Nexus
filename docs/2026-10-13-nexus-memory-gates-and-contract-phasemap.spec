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
      status: "OPEN"
      james: '"the contract is like a reference, like it needs to list everything needed to be done, dependancies,, context, everything in as little context as possible, each blocvk a task or phase to the llm to reference each gate"'
      builds_on: "RD4 (the fulfilled contract is one file, projects phasemap) · his request spine RQ0–RQ27 · lib/phase-plan.js (the plan names files and exports) · lib/context-atlas.js"
      does: >-
        One contract file per piece of work: one block per task/phase, each block ≤ a few lines — id, the task, its
        dependencies (block ids), its inputs as REFERENCES (file:line ranges, component ids, spec section ids, note ids —
        never pasted text), its gate (the check that proves it), and its status. An agent is handed one block plus the
        references it names, resolved on demand (LN0 for lines, loom for components). The smallest representation that
        keeps the meaning: anything resolvable is a pointer.
      proof: "a phase's contract under 1/10 of the context the same phase sends today, and the phase still builds"
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
