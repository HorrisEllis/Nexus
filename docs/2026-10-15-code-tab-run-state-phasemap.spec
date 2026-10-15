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
    status: OPEN
  CE0b_batching:
    asked: "can one reply carry several tool calls?"
    coder_recommends: "no change to 'one call per reply'; teach the persona to use code_batch for reads. To confirm."
    status: OPEN

phases:
  # order: bottom-up. backend -> API -> command -> UI, versioned, tested in Clear Glass (never Playwright), loom-wired.

  CE1_the_run_state:
    status: OPEN
    files: [lib/run-state.js (new), lib/agent-memory.js, cortex/core/raid/contract-gates.js, lib/node-export.js, lib/repo-agent.js, idearium/api/index.js]
    depends_on: []
    does: >-
      One durable node per run (phase, build step or Agent-tab session): { runId, repoUuid, goal, plan[], steps[{n,
      status, tool, args, resultRef}], filesRead[], filesChanged[], next, attempt, provider, updatedAt }. Written by the
      gate that moves (GT2's events) and after every tool result; stored as a node-export envelope next to the .job /
      .response nodes (a new type, added to KNOWN_TYPES). Read-only projection over it for the UI. Resume = load it.
    proof: "kill the agent mid-run; start it again; its first call is the next unread step, not code_map."

  CE2_the_task_header:
    status: OPEN
    files: [lib/repo-agent.js, lib/agent-tools/tool-call-listener.js]
    depends_on: [CE1_the_run_state]
    does: >-
      Every tool-result turn is prefixed with a header built from the run state: the goal in one line, 'step n of N', what
      is done (files read, files changed), what is next. A retry or a new tab gets the same header plus the memory hits
      (lib/agent-memory recall) - never only the original prompt. Context size is bounded (header under 600 chars).

  CE3_reply_on_task_gate:
    status: OPEN
    files: [lib/step-gates/reply.on_task.step_gate (new), lib/step-gates loader, guardian/lib/gate-trail.js]
    depends_on: [CE1_the_run_state]
    does: >-
      A data gate in reply.accept's form: a reply must be a tool call, code, the requested plan, or an answer that closes
      the goal. Blocked as off-task: asks the user what to do ('what would you like me to do'), restates the material,
      offers a menu. Blocked at the STEP, not at the phase 3 minutes later. on_block: re-prompt once with the header, then
      escalate to the next provider with the run state. The same reply.accept refusal list stays; phrases live in the node.
    proof: "c2e60104's reply is blocked off-task at its step and the retry continues at step 7."

  CE4_reply_kind_and_tags:
    status: OPEN
    files: [guardian/lib/response-sink.js, lib/agent-memory.js, clear-glass/renderer/library/sections/responses.js]
    depends_on: [CE1_the_run_state]
    does: >-
      Each .response gets kind (tool-call / prose / code / plan / spec / off-task) and repo, phase, task, step, attempt
      tags from the run state (the file already carries provider, status, source, agent). 'Done' for a step needs the
      kind to be what the step asked for; a 59-char tool-call stub is 'tool-call', not done. Library > Responses shows the
      status badge and groups by agent / repo / phase / task.

  CE5_events:
    status: OPEN
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
    status: OPEN (blocked by CE0_one_tab_or_two)
    files: [idearium/ui/js/code-surface.js, idearium/ui/js/file-manage.js, idearium/ui/js/app.js]
    depends_on: [CE0_one_tab_or_two]
    does: >-
      With option a: Manage (expand / iterate / rebuild / debug on a file or lines) and file versions move into the Code
      tab's tree and right rail; the Files tab opens Code on the same file. Nothing is deleted: file-manage.js's
      functions are reused by the Code tab, the old tab is archived behind a redirect.

  CE7_ai_assisted_editing:
    status: OPEN
    files: [idearium/ui/js/code-surface.js, lib/line-edit.js, idearium/api/index.js, lib/agent-tools/tools]
    depends_on: [CE1_the_run_state, CE5_events]
    does: >-
      Select lines or a chunk (from the outline), choose an action (change, expand, refactor, fix, explain), and the agent
      is given exactly that range with its checksum (line-edit readRange) plus the chunk card (uses / used by / tests).
      Its reply is an edit set verified against the current file (verifyEdit) before it becomes a diff card; Apply writes
      atomically (applyEdits), a failed expect rejects the whole set. A snapshot is taken first (as Manage does today).
      Edits land in the run state so a restart does not redo them.

  CE8_the_cli_reads_the_surface:
    status: OPEN
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/code-surface.js, lib/run-state.js]
    depends_on: [CE5_events]
    does: >-
      The Code tab publishes its surface (open file, selection or lines, picked chunk, pending diffs, the run and its
      current step, filters) to the server on change: PUT /api/repos/:uuid/surface; GET returns it. The CLI gets
      `code surface <repo>` (read), `code open <repo> <path> [--lines a-b]` and `code select` (set), so the CLI and the
      Code tab see one surface. The agents' nexus.command tool gets the same rows (route-commands is the one table).

  CE9_the_panels:
    status: OPEN
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
    status: OPEN
    files: [guardian/lib/dispatcher.js, guardian/lib/job-retry.js, lib/run-state.js]
    depends_on: [CE1_the_run_state]
    does: >-
      A job a tab took and never acted on (90 s, 'the prompt was not typed') emits idearium.job.lost and is retried on the
      next provider in the ladder with the run state, instead of ending. Found in James's log 2026-10-15 17:51.

  CE11_contract_panel_and_context:
    status: OPEN (is automatic-tracking CX1 + CP1; not re-specced here)
    depends_on: [CE1_the_run_state]
    does: "CX1 (context from the dependencies: lines, spec, memory, loom impact) feeds CE2's header; CP1 (the contract panel) is a Code-tab panel next to the gates."

  CE12_proof_and_wiring:
    status: OPEN
    files: [tests/modules/run-all.js, loom/maps/*, docs/atlases/idearium-atlas.md, docs/SPEC-REGISTRY.spec, lib/version.js]
    depends_on: [CE1_the_run_state]
    does: >-
      Tests in Clear Glass (clear-glass/src/driver/glass.js, never Playwright); loom wires for every new require/consumer
      edge (rule 3); dated ADDENDUM to automatic-tracking and code-tab-and-one-router (rule 4); a version bump with James's
      words quoted, a CHANGELOG entry and a PROOF-OF-COMPETENCY line; archive, never delete (rule 5).

build_order: [CE1, CE2, CE3, CE4, CE5, CE10, CE8, CE7, CE9, CE6, CE11, CE12]
first_slice: "CE1 + CE2 + CE3: the three that stop the agent losing the task. Everything else reads what they write."

not_verified:
  - "repo-tasks.js and repo-drawer-views.js internals were not read in full; CE9's data sources are from their headers."
  - "whether guardian's dispatcher exposes a hook where CE10's retry fits (guardian/lib/dispatcher.js, job-retry.js) is to be read before CE10."
  - "the stored prompt of 2012e2a0 ends at '## Context'; whether that is the storage cap or what was sent is not known."
