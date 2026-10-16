# docs/2026-10-15-code-tab-run-state-phasemap.spec
# Nexus holds the workload, not the agent: a durable run state the gates keep, and the Code tab as the one place it is seen and driven.
# MAPPED 2026-10-15, before building (docs/CLAUDE.md rule 1). To register in docs/SPEC-REGISTRY.spec.
# Follows docs/2026-10-15-automatic-tracking-phasemap.spec (GT2/GA1 done; CX1, CP1 open) and
# docs/2026-10-05-code-tab-and-one-router-phasemap.spec (CT1-CT8 built: the Code tab as the work surface).

origin:
  date: 2026-10-15
  james: >-
    "i like the code tab, but i feel lime also needs to use the gates to maintain persistence using the memory. so we
    can use nexus for the workload, instead of relying on the agents to remember. also needs way more events i feel
    like. also can you expand the code tab into a enterprise grade interconnected fully built tab. also the manage from
    the files tab, should be in the code tab. if theyre is going to be 2, i feel like code should only be whats being
    coded, that or consolidate them into one and add ai assisted coding using the chunking and line count tool for the
    ai to change lines at a time or a section. so the cli can read the current worksurface in the code tab. expand it as
    much as you can."
  second_message: >-
    "that and manage and histry should be one menu i feel like. versioning each diff using versioning in versionium, also
    make the versioning more competant and universal. rewind engine for each file. full history tracked and tagged.
    looking at the last phases from the last phasemap. also make sure those are in idearium. phases need to be in idearium."
  earlier_same_day:
    - >-
      "it hasn't really coded anything. i want it to start exactly where it left off if it restarts. the code tab in
      idearium, i feel needs more, likthe tasks, logs, control, visual of the pipeline, raid, each gate, etc. look at
      brainos, like i want brainos built for these kinds of pipeline workflow or automation"
    - >-
      "no decouple from brain os, unless you think its a good idea. the gates are supposed to be checks, can alos be
      compertments. also that tab menu of. versions, log, control, versions, machine. code tab needs all the activity,
      response ledger, etc."
  reading: >-
    The coder's reading: the agent is a lossy worker (the same line James used for ChatGPT in the SISO notes: "Guardian
    owns state"). So Nexus keeps the plan, the steps done, what was read and what comes next, and hands the agent only the
    next step with its task header. A restart loads that state; it never replays the original prompt. The gates are the
    writers of that state (each gate move already emits an event, GT2); the Code tab is its reader and its control.
    This map is wiring plus one new node, not a new system.

evidence:
  # read 2026-10-15 from James's own runs (the .response files he attached), not from memory
  - "BL30 build, 7 tool calls (3m26s), last reply (c2e60104): 'What would you like me to do with this material?' - the task was gone; the step still showed done (reply arrived)."
  - "The retry (2012e2a0) is a new job with the full persona prompt; its first call is code_map again - the 7 calls of reading were not carried."
  - "Tool-result turns carry only '[tool result - ...] {...}': no phase id, goal, step number or what is done. The goal lives only in the first turn."
  - "30 earlier replies (gemini/chatgpt/deepseek): the same task fanned out to three providers, each cold; gemini cycled search -> loom.find -> search -> read -> code_check({}) and one reply claimed 'we've already updated ...' with no write call anywhere."
  - "guardian log 17:51:32: 'the chatgpt tab was handed the job and did nothing with it for 90 s - the prompt was not typed, so it is not sent there again' - a job lost with no fallback."
  - "The agent's prompt says 'One call per reply' - by design; idearium.code_batch exists for several reads in one call."

found:
  # §8.6 - what already exists
  - "gate nodes are data: lib/step-gates/*.step_gate (reply.accept: non_empty, not_refusal with a phrases list - 'extend them here, not in code'); code.write; guardian/lib/gate-trail.js (8 dispatch gates); lib/checks (CK-nnn catalogue, 121 checks); cortex/core/raid/contract-gates.js (GT2 progress events)"
  - "memory: lib/agent-memory.js record / recall / search over the .response ledger (agentIdFor repo|spec|session) - already read by the repo agent (lib/repo-agent.js _withMemory) and the phase build; it holds exchanges, not run state"
  - "lines: lib/line-edit.js numberFile / readRange / verifyEdit / applyEdits (checksummed, atomic, refuses data/**)"
  - "chunks and tools: idearium code_map / code_search / code_chunk / code_read / code_edit / code_write / code_check / code_batch (agent tools); idearium/ui/js/code-surface.js (CT3-CT8: tree with file states, search, outline, diffs, docked agent, activity strip, live dots)"
  - "Files tab: idearium/ui/js/file-manage.js (BS8) - file states vs last snapshot, Manage (expand / iterate / rebuild / debug on a file or lines) through POST /api/repos/:uuid/manage; the Code tab already reuses its states"
  - "Activity panel: idearium/ui/js/repo-tasks.js (tasks / log / control) + repo-drawer-views.js (versions / machine) in the Plan panel - not in the Code tab"
  - "responses: .response nodes (guardian/lib/response-sink.js) with tags provider / status / source / agent; Library > Responses (clear-glass/renderer/library/sections/responses.js)"
  - "events: idearium/event-taxonomy.cjs (190 lines; checked against emits by lib/event-contract-check.js); idearium.repo.agent.tool for tool calls (CT8)"
  - "the work surface in the Code tab is client-side state (the CS object in code-surface.js); the CLI cannot read it - the only worksurface route is GET /api/repos/:uuid/worksurface (changes), idearium/cli/route-commands.js:45"
  - "BrainOS: clear-glass/src/mesh/ (agent-mesh, route-graph) + docs/2026-09-11-brainos-agent-orchestration-phasemap.spec; kept coupled (James: 'no decouple from brain os')"

open_decisions:
  CE0_one_tab_or_two:
    asked: "if theyre is going to be 2, i feel like code should only be whats being coded, that or consolidate them into one"
    options:
      a: "One tab: Code absorbs Files (the tree with states, Manage, versions). The Files route stays as a redirect to Code with the same deep links, so nothing is lost (§0.3)."
      b: "Two tabs, strict split: Files = every file and its management; Code = only what is being coded now (the run, its files, its changes)."
    coder_recommends: >-
      a. The Code tab already draws the Files tree and states; two trees of one repo is the drift the project keeps
      having (SH1, one home per concept). To confirm with James.
    status: DECIDED - one tab (James, 2026-10-15: "yes one tab.")
  CE0b_batching:
    asked: "can one reply carry several tool calls?"
    coder_recommends: "no change to 'one call per reply'; teach the persona to use code_batch for reads. To confirm."
    status: OPEN
  CV0_versioning_scope:
    asked: "making the versioning more competant and universal"
    coder_reading: >-
      'universal' read as: the same history for every node type Nexus keeps (CV5), not a second version system. To confirm
      - it could also mean versioning that works for any project James imports, which Versionium's files layer already does.
    status: OPEN

phases:
  # order: bottom-up. backend -> API -> command -> UI, versioned, tested in Clear Glass (never Playwright), loom-wired.

  CE1_the_run_state:
    status: BUILT 0.60.50 (tests/modules/test-run-state.test.js)
    systems: [core, cortex, idearium]
    files: [lib/run-state.js (new), lib/agent-memory.js, cortex/core/raid/contract-gates.js, lib/node-export.js, lib/repo-agent.js, idearium/api/index.js]
    depends_on: []
    does: >-
      One durable node per run (phase, build step or Agent-tab session): { runId, repoUuid, goal, plan[], steps[{n,
      status, tool, args, resultRef}], filesRead[], filesChanged[], next, attempt, provider, updatedAt }. Written by the
      gate that moves (GT2's events) and after every tool result; stored as a node-export envelope next to the .job /
      .response nodes (a new type, added to KNOWN_TYPES). Read-only projection over it for the UI. Resume = load it.
    proof: "kill the agent mid-run; start it again; its first call is the next unread step, not code_map."

  CE2_the_task_header:
    status: BUILT 0.60.50 (tests/modules/test-run-state.test.js)
    systems: [core]
    files: [lib/repo-agent.js, lib/agent-tools/tool-call-listener.js]
    depends_on: [CE1_the_run_state]
    does: >-
      Every tool-result turn is prefixed with a header built from the run state: the goal in one line, 'step n of N', what
      is done (files read, files changed), what is next. A retry or a new tab gets the same header plus the memory hits
      (lib/agent-memory recall) - never only the original prompt. Context size is bounded (header under 600 chars).

  CE3_reply_on_task_gate:
    status: BUILT 0.60.50 (tests/modules/test-run-state.test.js)
    systems: [core, guardian]
    files: [lib/step-gates/reply.on_task.step_gate (new), lib/step-gates loader, guardian/lib/gate-trail.js]
    depends_on: [CE1_the_run_state]
    does: >-
      A data gate in reply.accept's form: a reply must be a tool call, code, the requested plan, or an answer that closes
      the goal. Blocked as off-task: asks the user what to do ('what would you like me to do'), restates the material,
      offers a menu. Blocked at the STEP, not at the phase 3 minutes later. on_block: re-prompt once with the header, then
      escalate to the next provider with the run state. The same reply.accept refusal list stays; phrases live in the node.
    proof: "c2e60104's reply is blocked off-task at its step and the retry continues at step 7."

  CE4_reply_kind_and_tags:
    status: BUILT 0.60.50 (tests/modules/test-run-state.test.js)
    systems: [guardian, clear-glass]
    files: [guardian/lib/response-sink.js, lib/agent-memory.js, clear-glass/renderer/library/sections/responses.js]
    depends_on: [CE1_the_run_state]
    does: >-
      Each .response gets kind (tool-call / prose / code / plan / spec / off-task) and repo, phase, task, step, attempt
      tags from the run state (the file already carries provider, status, source, agent). 'Done' for a step needs the
      kind to be what the step asked for; a 59-char tool-call stub is 'tool-call', not done. Library > Responses shows the
      status badge and groups by agent / repo / phase / task.

  CE5_events:
    status: BUILT 0.60.50 (tests/modules/test-run-state.test.js)
    systems: [idearium]
    files: [idearium/event-taxonomy.cjs, lib/event-contract-check.js, lib/run-state.js]
    depends_on: [CE1_the_run_state, CE3_reply_on_task_gate]
    does: >-
      The missing events, each with a payloadShape (CI holds the file to the code): idearium.run.started | resumed |
      step.started | step.done | step.blocked | step.retried | finished | failed; idearium.gate.passed | blocked
      (gate id, check id, evidence); idearium.reply.classified (kind); idearium.tool.called | returned (name, ms, ok);
      idearium.file.read | opened | selected (path, lines); idearium.edit.proposed | applied | rejected | reverted
      (path, range, checksum); idearium.surface.changed (the work surface); idearium.job.lost (pickup timeout);
      idearium.provider.fallback. Each is shown in the Log view and sent to the activity log.

  CE6_one_tab:
    status: BUILT 0.60.81 (tests/modules/test-code-tab-merge.test.js MG-00, MG-10, MG-11)
    systems: [idearium]
    files: [idearium/ui/js/code-surface.js, idearium/ui/js/file-manage.js, idearium/ui/js/app.js]
    depends_on: [CE0_one_tab_or_two]
    does: >-
      With option a: Manage (expand / iterate / rebuild / debug on a file or lines) and file versions move into the Code
      tab's tree and right rail; the Files tab opens Code on the same file. Nothing is deleted: file-manage.js's
      functions are reused by the Code tab, the old tab is archived behind a redirect.

  CE7_ai_assisted_editing:
    status: BUILT 0.60.80 backend (test-code-tab-expand CX-01..03), 0.60.81 UI (test-code-tab-merge MG-13)
    systems: [idearium, core]
    files: [idearium/ui/js/code-surface.js, lib/line-edit.js, idearium/api/index.js, lib/agent-tools/tools]
    depends_on: [CE1_the_run_state, CE5_events]
    does: >-
      Select lines or a chunk (from the outline), choose an action (change, expand, refactor, fix, explain), and the agent
      is given exactly that range with its checksum (line-edit readRange) plus the chunk card (uses / used by / tests).
      Its reply is an edit set verified against the current file (verifyEdit) before it becomes a diff card; Apply writes
      atomically (applyEdits), a failed expect rejects the whole set. A snapshot is taken first (as Manage does today).
      Edits land in the run state so a restart does not redo them.

  CE8_the_cli_reads_the_surface:
    status: BUILT 0.60.79 (tests/modules/test-code-surface-state.test.js)
    systems: [idearium]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/code-surface.js, lib/run-state.js]
    depends_on: [CE5_events]
    does: >-
      The Code tab publishes its surface (open file, selection or lines, picked chunk, pending diffs, the run and its
      current step, filters) to the server on change: PUT /api/repos/:uuid/surface; GET returns it. The CLI gets
      `code surface <repo>` (read), `code open <repo> <path> [--lines a-b]` and `code select` (set), so the CLI and the
      Code tab see one surface. The agents' nexus.command tool gets the same rows (route-commands is the one table).

  CE9_the_panels:
    status: BUILT 0.60.81 (test-code-tab-merge MG-14, MG-15); the Clear Glass mesh mount not done (see addendum (c))
    systems: [idearium, clear-glass]
    files: [idearium/ui/js/repo-tasks.js, idearium/ui/js/repo-drawer-views.js, idearium/ui/js/code-surface.js, clear-glass/src/mesh/route-graph.js]
    depends_on: [CE5_events, CE4_reply_kind_and_tags]
    does: >-
      The Activity views (tasks / log / control / versions / machine) become Code-tab panels over the same data, plus:
      responses (the ledger: status badge, kind, grouping), gates (every check, last result, evidence; gates are checks
      and each can be a compartment node), RAID (route chosen, fallback taken, cost), pipeline (the run as a graph:
      phase -> steps -> gates, drawn with the mesh's route-graph). Control: pause, resume, retry from step n, stop, send
      to another provider. One component, mounted in the Code tab and in the Clear Glass mesh panel (BrainOS stays
      coupled - one set of data, two mounts).

  CE10_lost_jobs_fall_back:
    status: BUILT 0.60.50 (tests/modules/test-run-state.test.js)
    systems: [guardian]
    files: [guardian/lib/dispatcher.js, guardian/lib/job-retry.js, lib/run-state.js]
    depends_on: [CE1_the_run_state]
    does: >-
      A job a tab took and never acted on (90 s, 'the prompt was not typed') emits idearium.job.lost and is retried on the
      next provider in the ladder with the run state, instead of ending. Found in James's log 2026-10-15 17:51.

  CE11_contract_panel_and_context:
    status: OPEN (is automatic-tracking CX1 + CP1; not re-specced here)
    systems: [idearium, cortex]
    depends_on: [CE1_the_run_state]
    does: "CX1 (context from the dependencies: lines, spec, memory, loom impact) feeds CE2's header; CP1 (the contract panel) is a Code-tab panel next to the gates."

  CE12_proof_and_wiring:
    status: DONE per slice: 0.60.79, 0.60.80, 0.60.81 (tests, loom wires, versions, CHANGELOGs, addenda)
    systems: [core, loom]
    files: [tests/modules/run-all.js, loom/maps/*, docs/atlases/idearium-atlas.md, docs/SPEC-REGISTRY.spec, lib/version.js]
    depends_on: [CE1_the_run_state]
    does: >-
      Tests in Clear Glass (clear-glass/src/driver/glass.js, never Playwright); loom wires for every new require/consumer
      edge (rule 3); dated ADDENDUM to automatic-tracking and code-tab-and-one-router (rule 4); a version bump with James's
      words quoted, a CHANGELOG entry and a PROOF-OF-COMPETENCY line; archive, never delete (rule 5).

  # ── Added 2026-10-15 (second message): one menu for Manage + History, and versioning made universal ──────────────
  CV1_one_menu:
    status: BUILT 0.60.81 (test-code-tab-merge MG-12)
    systems: [idearium]
    files: [idearium/ui/js/file-manage.js, idearium/ui/js/file-versions.js, idearium/ui/js/code-surface.js]
    depends_on: [CE0_one_tab_or_two]
    does: >-
      Manage and History become one dialog on one file: the action cards and scope (Change / Fix & prove / Understand)
      on one side, and the file's whole timeline on the other - its manage runs (replied, blocked, incomplete, reviewed,
      with the reason), its Versionium versions, its tags and restore points - in one list, newest first. Pick any entry to
      see it, diff any two, restore one. The two modals today (file-manage.js, file-versions.js) share one data call.

  CV2_a_version_per_diff:
    status: BUILT 0.60.80 (test-code-tab-expand CX-04, CX-05)
    systems: [core, versionium, idearium]
    files: [lib/repo-versions.js, versionium/lib/files.js, versionium/lib/releases.js, lib/line-edit.js]
    depends_on: [CE7_ai_assisted_editing]
    does: >-
      Today a burst of writes settles into ONE commit after 1.5 s (repo-versions.js SETTLE_MS) - good for a six-file run,
      wrong for 'each diff'. An applied edit (CE7 Apply, a Manage run, a restore) is its own commit with labels: {run,
      phase, step, provider or hat, action, checksum before/after, kind: edit|manage|agent|restore|person}. Bulk writes
      still settle; the edit path commits at once. Named milestones keep using Versionium tag() (immovable names).

  CV3_file_rewind:
    status: BUILT 0.60.80 run rewind (CX-07), 0.60.81 UI (MG-14); a file restores from the Manage timeline (MG-12)
    systems: [idearium, versionium, clear-glass]
    files: [idearium/ui/js/file-versions.js, idearium/api/index.js, versionium/lib/files.js, lib/run-state.js]
    depends_on: [CV2_a_version_per_diff, CE1_the_run_state]
    does: >-
      A rewind per file: a timeline to scrub, preview any version, diff any two, restore (the restore is itself a commit).
      And a rewind per run: 'undo this run' puts every file the run touched back to its state before the run, found
      through the run state (CE1) and the commit labels (CV2). Clear Glass's rewind engine (clear-glass/src/rewind/engine.js)
      is a BROWSER-session rewind (URL, cookies, storage, scroll; 50 snapshots per agent); only its shape is borrowed (a
      bounded list, list / restore / clear), not its code.

  CV4_tagged_history:
    status: BUILT 0.60.80 (test-code-tab-expand CX-06, CX-08)
    systems: [idearium, versionium, core]
    files: [versionium/lib/files.js, idearium/api/index.js, idearium/cli/route-commands.js]
    depends_on: [CV2_a_version_per_diff]
    does: >-
      Every version carries tags, and history is queried by them: GET /api/repos/:uuid/file/history?path=&tag= (run:,
      phase:, agent:, provider:, kind:), `repo history <repo> <path> [--tag t]` in the one command table so agents have it
      too. versions() today returns commit, sha, kind, wall and message; tags are the addition.

  CV5_universal_versioning:
    status: OPEN (scope to confirm - see open_decisions CV0)
    systems: [versionium, core]
    files: [versionium/lib/files.js, lib/node-export.js, lib/repo-versions.js]
    depends_on: [CV4_tagged_history]
    does: >-
      The same versioning for every kind of thing Nexus keeps, not only a repo's code files: specs and phasemaps,
      .job / .response nodes, step gates, repo notes, settings - each in its own Versionium namespace (files.js already
      takes a `repository`), with the same history, diff, restore and tags. Plus the competence a replacement for GitHub
      needs (James, VR1: 'supposed to be an alternative to github to an extent. but i want to replace it for myself'):
      verify a tree against its hash, retention and compaction that never drops a tagged version, export.

  CV6_phases_in_idearium:
    status: BUILT 0.60.81 (systems already read by PT1/PT2; open_decisions entries now kind: decision)
    systems: [idearium, loom]
    files: [loom/scanners/phasemap-map.js, idearium/repo/thread.js, idearium/ui/js/phases.js]
    depends_on: []
    does: >-
      Every CE and CV phase is declared with a `systems:` line (done in this file) so the Phases tab and the roadmap place it
      by what was declared, not guessed from prose (the scanner parsed 13 phases on 2026-10-15 and guessed each one's
      system). As each phase is built its run and commits attach to it (the thread, RS9), so a phase shows the versions that
      built it. The two entries parsed as phases from open_decisions (CE0) are marked decisions, not phases.

build_order: [CE1, CE2, CE3, CE4, CE5, CE10, CE8, CE7, CV2, CV4, CV3, CV1, CE9, CE6, CV5, CV6, CE11, CE12]
first_slice: "CE1 + CE2 + CE3: the three that stop the agent losing the task. Everything else reads what they write."

not_verified:
  - "repo-tasks.js and repo-drawer-views.js internals were not read in full; CE9's data sources are from their headers."
  - "whether guardian's dispatcher exposes a hook where CE10's retry fits (guardian/lib/dispatcher.js, job-retry.js) is to be read before CE10."
  - "the stored prompt of 2012e2a0 ends at '## Context'; whether that is the storage cap or what was sent is not known."

## ADDENDUM 2026-10-15 - CE1-CE5 + CE10 built (0.60.50)

James: "need the full pipeline working." (after pasting the CE1-CE5 + CE10 list)

- Built: lib/run-state.js (the run node, resume on the same goal), the 'task-header' prompt block (editable in
  Settings -> Agents), the reply.on_task step gate + lib/reply-kind.js, reply tags on .response nodes and Library rows
  (kind, repo, session, run, step, attempt) with grouping, the run.* / guardian.reply.classified events, and the 'lost'
  failure class that always falls back to the next provider.
- Proof: tests/modules/test-run-state.test.js 27/27. The live reply that started this (job c2e60104, "What would you like
  me to do with this material?") is blocked by the gate node in RS-20.
- Not verified: no live run through ChatGPT yet. The Ollama loop does not get the task header (browser agents only).
- Reading to confirm (the coder's, not James's decision): James wrote "no versions per file using versionium, only the
  diff." The coder reads it as: file history shows the Versionium diffs/deltas, not whole-file versions. CV1 and CV3
  are written for that reading and stay OPEN until he confirms.
- Pre-existing, not caused by this: test-event-contracts EC-05 fails on main for idearium.repo.released and
  versionium.released / versionium.tagged (undeclared).

## ADDENDUM 2026-10-16 - CE8 built: the CLI reads the Code tab's surface (0.60.79)

James: "tell me recent phases. can we do the code tab now?" CE8 was next in build_order after the 0.60.50 slice. It
serves his words from 2026-10-15: "so the cli can read the current worksurface in the code tab."

- Built:
  - idearium/lib/surface-state.cjs: one surface per repo, holding the open file, the picked lines, the chunk, the
    filters, who set it and a rev;
  - GET / PUT /api/repos/:uuid/surface. GET adds the picked lines' text, the proposals waiting, and the latest run
    (CE1);
  - the event idearium.surface.changed;
  - the commands `code surface | code open [--lines a-b] | code select`;
  - the tab publishes its surface, follows a change it did not make, and opens where it was left.
- Narrower than written (the coder's call; the rest is to come):
  - the surface does not carry the pending diffs' contents, only their paths and ids (`repo changes` has the diffs);
  - it carries the run as a summary, not the current step.
- Drift: none against CE1. The run comes from lib/run-state.js list(), not a second store.
- Proof: tests/modules/test-code-surface-state.test.js 6/6 (SS-10..12 in Clear Glass).
- Not verified: a live run on his machine.
- Still OPEN, in build order: CE7, CV2, CV4, CV3, CV1, CE9, CE6, CV5, CV6, CE11, CE12.
- Still to confirm with James: CE0b (batching), CV0 (what "universal" versioning covers), and the coder's reading of
  "no versions per file using versionium, only the diff" (addendum 2026-10-15).

## ADDENDUM 2026-10-16 (b) - "all of it": the build plan for the rest of the Code tab (mapped before building)

James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"

- Context: he was shown CE8 built and the remaining phases in build order. He was asked whether to start CE7.
- What he decided:
  - build every remaining phase of this map;
  - merge Files into Code. This repeats his CE0 call ("yes one tab.").
- The coder's reading, to confirm:
  - "phases3" is read as "the phases", i.e. this map's open phases.
  - "all of it" is read as everything that does not wait on one of his open answers. CV5 waits on CV0, so it is mapped
    here but not built.

Grounding (§8.6), read 2026-10-16. What each phase composes from, and what it adds:

- **CE7** composes:
  - lib/line-edit.js (verify against the current text, apply atomically). It is bound to the Nexus root, so pure text
    forms verifyText / applyText are added and the root forms use them;
  - repo-inject propose (the one write path for an agent's change);
  - repo-agent dispatch (noContext, the picked hop), which records the run itself (CE1).
  - New: POST /api/repos/:uuid/code/edit (a checked line-edit set becomes a proposal) and POST
    /api/repos/:uuid/code/assist (a picked range plus an action; the model returns only the replacement for that range,
    and Nexus builds the edit with `expect` set to the current text, so a stale range is refused, never applied).
  - Commands: `code edit`, `code assist`.
- **CV2** composes lib/repo-versions.js. Commits settle after 1.5 s and already carry provenance (by, refs, files).
  - New: commitNow(repoUuid, labels). An applied proposal (CE7, Manage, an agent's change) and a restore each commit at
    once, with labels { kind: edit|manage|agent|restore|person, inject, run, checksum before/after }.
  - Bulk writes still settle. idearium/repo/snapshot.js projects the labels into history.
- **CV4** composes repo.history. New: ?tag=k:v filters on the labels (kind, run, by, inject); the command
  `repo history <repo> <path> [--tag k:v]`.
- **CV3** composes RH.restoreFile and RH.diff (already a per-file restore and a diff of any two versions).
  - New: POST /api/repos/:uuid/runs/:runId/rewind. It puts back every file in the run's filesChanged (CE1) as it was
    at the last commit before the run started; a file the run created is named, never deleted.
  - New: GET /api/repos/:uuid/runs (the repo's runs).
  - Commands: `repo runs`, `repo rewind-run`.
- **CV1** composes the Manage workbench (file-manage.js) and its history rail. The rail becomes one timeline, newest
  first:
  - the file's manage runs;
  - its commits with their labels (repo.history);
  - its Versionium versions.
  - Each version has diff (against now) and restore. file-versions.js stays as it is, a second entry to the same data
    (§0.3).
- **CE9** composes repo-tasks.js (tasks · log · control) and repo-drawer-views.js (versions · machine), which draw into
  #rt-views / #rt-list.
  - The Code tab gets a bottom panel with tabs: activity (as now), run (the run state, its steps, the agents tried, its
    gates on the plan step, and rewind), responses (the repo agent's exchanges, GET …/agent/history), and the Plan
    panel's views mounted in place.
  - One set of data, two mounts. When the Plan panel's activity section is open, the Code tab points to it rather than
    drawing a second copy with the same ids.
- **CE6** composes the Files tab's tree actions (filter, add, delete), its editor (save through POST …/file, the one
  write path) and Manage. In the Code tab:
  - the tree gets the filter, add file and delete;
  - the open file gets an edit mode (a textarea, save) and Manage (the same workbench, given the Code tab's file and
    picked lines).
  - The Files button is removed. setRepoSubtab('files') opens Code, so every deep link keeps working. The Files panel's
    DOM and renderApiRepoPanel stay (archived, §0.3), because other code still calls them.
- **CV6** is checked, not rebuilt. PT1 and PT2 (0.60.63–64) tag phases from their systems and files. This map's
  phases all declare `systems:`; the proof is the phasemap reader returning them.
- **CE11** is not here: it is CX1 + CP1 in docs/2026-10-15-automatic-tracking-phasemap.spec.
- **CE12** is done per slice: tests, loom wires, version, CHANGELOG.

Build order for these slices:
1. Backend: CE7, then CV2, then CV4, then CV3.
2. Commands.
3. UI: CE6 first, because the merge gives the rest its home; then CE7's UI, CV1 and CE9.

## ADDENDUM 2026-10-16 (c) - the rest built: CE6 · CE7 · CE9 · CV1 · CV2 · CV3 · CV4 · CV6 (0.60.80, 0.60.81)

James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"

Built to the plan in addendum (b), backend first (0.60.80), then the UI (0.60.81).

- **The Files tab is merged into Code.**
  - The button is gone. setRepoSubtab('files') and openApiRepoFile() open the Code tab, so every old link still lands.
  - The Files panel and its opener (openApiRepoFileInFiles) are kept, archived (§0.3).
  - The Code tab's tree gained the filter, + file and × delete (to .trash/).
  - The open file gained edit (save through POST …/file, so a save is a version) and "manage · history".
- **CV1: Manage and History are one menu.** Manage opens on the Code tab's file and its picked lines. Its rail is one
  timeline:
  - the file's manage runs;
  - the commits with their labels;
  - its versions.
  - Tag chips (edit · agent · manage · person · restore · revert) filter the timeline. Any version can be diffed with
    now or restored. file-versions.js stays as it was, a second door to the same data.
- **CE7, picked lines:** the right pane gains change · expand · refactor · fix · document · explain. These go to
  …/code/assist; the answer is a diff above the code.
- **CE9, the bottom panel**, with these tabs:
  - activity, as before;
  - runs: the route copilot gives; each run as a pipeline (goal → steps ✓/✗ → its state); the agents that tried it,
    what happened to it, the files read and changed; rewind (a dry run first);
  - responses: the repo agent's exchanges;
  - tasks · log · control · versions · machine: the Plan panel's own views, drawn in the Code tab through one resolver
    (repo-tasks.js _rtEl). One set of data, two mounts.
- **CV6:**
  - Every phase here already parsed with its declared systems (PT1/PT2).
  - Entries under `open_decisions:` / `decisions:` are now kind: decision (loom's reader, the roadmap node,
    schema.phase_node and a "decision" chip on the Phases tab).
  - A DECIDED decision reads as done. Nothing is dropped, so no count changes.

Narrower than written (the coder's calls, to confirm):
- CE9 says "one component, mounted in the Code tab and in the Clear Glass mesh panel". The Clear Glass mount is not
  built: the views are Idearium page scripts, and the mesh panel is Clear Glass's renderer. This is still open.
- CE9's "gates (every check, last result, evidence)" is shown as the current plan step's gate bar in the runs panel,
  not a list of every check. The full check list is still open.
- CE9's "Control: pause, resume, retry from step n, stop, send to another provider" is shown in two ways:
  - the control view (the repo's run controls and desktop, as the Plan panel has them);
  - run rewind.
  - "Retry from step n" and "send to another provider" have no route yet. Both are still open.

Still OPEN:
- CV5, which waits on CV0 (what "universal" covers).
- CE11 (automatic-tracking CX1 + CP1).
- To confirm with James: CE0b, CV0, and the coder's reading of "only the diff" (addendum 2026-10-15).

Proof:
- test-code-tab-expand 8/8 and test-code-tab-merge 7/7 (six driven in Clear Glass);
- test-code-tab 16/16, test-code-surface-state 6/6, test-build-surface 13/13, test-phases-tab 5/5,
  test-loom-phasemap 7/7, test-loom-phasemap-status 14/14.
- Pre-existing and unchanged: moce-roadmap's 3 failures, EC-05, and the stale probes repo-drawer-views-glass and
  repo-tasks-drawer-glass (all fail the same way without these changes).
