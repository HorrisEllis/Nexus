# Consolidate macros + automation into the pipeline section; the job ledger of Guardian jobs, each with its .response node
# James, 2026-10-30: "consolidate macros, automation into the pipeline section. also the phase that has each job from guardian
# saved in the queue, the formeer .response, and have it be the job ledger, each job has to have it's corrasponding .response
# node to be fullfilled from clearglass' end"
#
# MAPPED 2026-10-30 before code (rule 1). REUSE, not new (rule 2): both already have most of their substrate.
# CAUTION (coder's, to James): the pipeline/gates/nodes and Guardian queue are the area a parallel session (claude/laughing-
# fermi) is actively building (0.60.293–297: gates are pipeline blocks, macros/workflows/pipelines linked, per-site pipelines,
# .pipeline nodes). Building here risks the same collision that AFI hit. This map surfaces the work; the coder recommends
# coordinating (or confirming the parallel session is not already doing it) before CM/JL code lands.

origin:
  date: 2026-10-30
  james: >-
    "consolidate macros, automation into the pipeline section. also the phase that has each job from guardian saved in the
    queue, the formeer .response, and have it be the job ledger, each job has to have it's corrasponding .response node to be
    fullfilled from clearglass' end"
  context: >-
    After the .portfolio node (PF1, 0.60.299) and the dropdown fill (DD1). He is unifying his Clear Glass node/automation
    surfaces (macros, workflows/automation, pipelines are already linked — 0.60.293) and wants one section; and he wants the
    Guardian job queue and the per-job .response node (guardian/lib/response-sink.js) tied into one job ledger, fulfilled from
    Clear Glass.
  reuse_2026_10_30: >-
    CM: clear-glass/renderer/settings/sections/pipelines.js (the Pipelines section), clear-glass/renderer/library/sections/
    macros.js (Macros), the automation engine (lib/automation/engine.js — workflows+macros+pipelines, 0.60.293 linked), the
    .pipeline/.macro/.workflow nodes (lib/automation-nodes.js). JL: guardian/lib/response-sink.js (the per-job .response node),
    lib/node-schemas/schema.response, lib/agent-memory.js (the four-sink delivery: .response node + ledger + Clear Glass
    downloads list), the Guardian queue (guardian/schemas/schema.guardian_queue_compartment, the queue capabilities), the
    ledgers (lib/ledger-*.js).

decisions:
  CM_D1_one_section:
    status: DECIDED 2026-10-30 by James — "consolidate macros, automation into the pipeline section"
    chosen: >-
      Macros and automation (workflows) are shown under the pipeline section — one surface where a pipeline is the top-level
      thing and macros/workflows are its blocks (they are already linked in the engine, 0.60.293). The coder's reading (to
      confirm): consolidate the UI (the Macros and Automation screens fold into the Pipelines section as its block library /
      tabs), not delete the engines; each stays its own node type (.macro/.workflow/.pipeline), reachable there. If he means a
      deeper data-model merge (one node type), that is a larger change — marked to confirm.
  JL_D1_job_ledger_is_queue_plus_response:
    status: DECIDED 2026-10-30 by James — "each job ... saved in the queue ... have it be the job ledger, each job has to have
      it's corrasponding .response node to be fullfilled from clearglass' end"
    chosen: >-
      The job ledger is the Guardian queue's jobs, each paired with its .response node (guardian/lib/response-sink.js writes
      one per job already). A job is "fulfilled" when its .response node is written from Clear Glass's end. The ledger shows
      every job, its queue state, and whether its .response is written (unfulfilled = queued/claimed but no .response). The
      coder's reading (to confirm): this wires together the EXISTING queue + .response + ledger into one view/record, and adds
      the "Clear Glass fulfils it" path where a job's .response comes from Clear Glass; it does not replace Guardian's queue.
      "the former .response" = schema.response / response-sink.js (confirm this is what he means by former).

phases:
  CM1_pipeline_section_absorbs_macros_automation:
    status: OPEN
    layer: ui
    depends_on: []
    files: [clear-glass/renderer/settings/sections/pipelines.js, clear-glass/renderer/library/sections/macros.js]
    does: >-
      The Pipelines section becomes the one surface: its block library lists macros and workflows (the engine already links
      them), with their own import/export (.macro/.workflow/.pipeline nodes kept). The standalone Macros/Automation screens
      fold in (archived, not deleted — §0.3). Backend is already there (the engine); this is the UI consolidation (his order of
      delivery: backend exists → this is the UI). Tested in Clear Glass (glass.js), never Playwright (CG-001b).
    proof: "the Pipelines section shows macros + workflows as blocks with import/export; the old screens redirect; in Clear Glass; GROUNDING FIRST — read pipelines.js/macros.js and the engine's linkage before code"

  JL1_job_ledger_backend:
    status: OPEN
    layer: library
    depends_on: []
    files: [guardian/lib/response-sink.js, lib/ledger-jobs.js]
    does: >-
      A job ledger that joins each Guardian queue job to its .response node: list every job (queue state: queued | claimed |
      fulfilled), with its .response node reference when written, and name the unfulfilled ones (§1.2). Reuses the queue +
      response-sink (the .response node already written per job) + the ledger writer; the one new thing is the JOIN (job ↔ its
      .response) and the "fulfilled from Clear Glass" write path. GROUNDING FIRST — read response-sink.js, the queue schema and
      the four-sink delivery (agent-memory.js) before code, to confirm what exists vs. the gap.
    proof: "the ledger lists each job with its queue state and whether its .response is written; a job fulfilled from Clear Glass gets its .response and flips to fulfilled; a job with no .response is named unfulfilled — tested against injected queue + sink"

  JL2_route_command_ui:
    status: OPEN
    layer: ui
    depends_on: [JL1_job_ledger_backend]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    does: >-
      His order of delivery: a route + command to read the job ledger (jobs, their .response, fulfilled/unfulfilled), and the
      human view (the queue as a ledger, each job a row with its .response). Agents get it through the one command table.
    proof: "the route returns the job ledger; the command prints it; the UI shows each job and its .response state"

order: >-
  GROUND BEFORE BUILD. CM1 and JL1 both need a read of the existing code first (pipelines.js/macros.js/the engine for CM;
  response-sink.js/the queue/agent-memory for JL) — the readings_to_confirm in the decisions are real forks. Given the parallel
  session is live in this exact area, the coder recommends confirming scope with James (and that laughing-fermi is not already
  doing it) before code. Then CM1 (UI consolidation, backend already linked), JL1 (the job↔.response join + Clear Glass fulfil),
  JL2 (route+command+UI). Each phase specced again as .phase + .graph (his 2026-10-20); DG2/DG3 check the DAG.
