# docs/2026-10-24-guardian-into-cos-phasemap.spec
# Guardian decoupled, one way at a time, until it can run in its own COS compartment. The first system of the one-at-a-time sweep.
# MAPPED 2026-10-24, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. Context: docs/2026-10-23-cos-spine-phasemap.spec
# (CS_D7: a system is opened by COS only once it is sovereign; his 2026-10-24 direction: boundaries only, until COS can be integrated).

origin:
  date: 2026-10-24
  james: '"focus on just decoupling so we can get every system in a cos compartment. maybe start with one at a time? like guardian?"'
  context: >-
    After the spec compiler moved into Idearium (0.60.239). Guardian, by the census (lib/system-boundary.js): 27 ways out to 19 files in
    other systems, 6 ways in, 88 uses of the kernel. The phase cut below is the coder's, decided by his axioms; the order and the choice of
    Guardian first are his.

census:
  out:
    raid (cortex/core/raid, contract-intake): "7 — _approveTool (5: browser jobs, forge, the size-chosen spec path, chat), recordOutcome (2), _decide, listQueue"
    intelligence (alk, liminal, gap/hunter, gap/predicate, baseline, cfr/ledger): "9"
    nexus (nexus-bus, nexus-connect, nexus-cfr-influence): "3"
    clear-glass/src/downloads/artifact-chat-index.js (the .response store): "4 — cli, chat-transcripts, code-artifact, response-sink"
    cos (host, playground/llm-lab): "2"
    ollama/lib/model-inventory.js, copilot/tool-runtime.js, cortex/snapshot: "1 each"
    dead: "cockpit/forge (the folder is gone; /forge/health requires it), meta/gap/hunter (a comment the census reads)"
  in:
    - lib/agent-memory.js -> guardian/lib/response-sink.js
    - lib/pipeline-routing.js -> guardian/lib/job-retry.js
    - lib/repo-inject.js -> guardian/lib/code-artifact.js
    - lib/system-control.js -> guardian/clear-glass-bridge.js
    - orchestrator/orchestrator.js -> guardian/api-dispatch.js
    - service/guardian-service.js -> guardian/server.js   (the launcher; becomes the compartment's entry, GD8)

decisions:

  GD_D0_raid_is_reached_never_loaded:
    status: DECIDED 2026-10-24 by his axioms
    problem: >-
      Guardian requires cortex/core/raid and runs _approveTool in its own process: a second RAID, with its own in-memory weights, beside
      Cortex's. §9.1: RAID is the only write authority for the system's own decisions; §5.2: routing goes through RAID. A copy loaded into
      another process is a side door, and inside a compartment it cannot load at all.
    chosen: >-
      lib/raid-port.js (the pattern of lib/spec-compiler-port.js, 0.60.239). In the Cortex process, Cortex provides RAID; everywhere else the
      port calls Cortex's routes (/api/raid/...). Approval fails closed: if RAID cannot be reached, the action is denied and the reason says
      so, as the dispatcher already does today (§1.2).
    axioms: "§9.1, §5.2, §1.2, DB6 (a capability is a route)"

  GD_D1_pure_primitives_to_the_kernel:
    status: DECIDED 2026-10-24 by his axioms
    chosen: >-
      intelligence/liminal (no requires, no state), intelligence/gap/hunter (liminal + meta/confidence, no state) and intelligence/baseline
      (a factory: each caller's instance keeps its own files) are primitives living in a system's folder. They move to the kernel, and
      intelligence keeps a one-line re-export at each old path. That is IM4's own rule (lib/system-boundary.js PRIMITIVES note).
    axioms: "§5.9 (no state or lifecycle of its own → not a system's capability), §0.3 (old paths re-exported, nothing lost)"

  GD_D2_stateful_capabilities_by_route:
    status: DECIDED 2026-10-24 by his axioms
    chosen: >-
      Anything that keeps state in another system is asked through that system's route, never loaded: alk (record, query),
      gap/predicate, the CFR ledger and the influence read (intelligence); model inventory (ollama: GET /api/models); makeNcpCallModel
      (copilot); the COS host and the LLM lab (lib/cos-bridge.js); the snapshot state provider (registered over Cortex's route, because a
      provider registered in Guardian's process is invisible to Cortex's snapshot today: a latent bug, found by the census).
    axioms: "DB6, §5.2, §0.0 (the in-process registration only looks like it works)"

  GD_D3_the_response_store:
    status: "DECIDED 2026-11-17 by James and his axioms — \"Need one source of truth. .jobs with the relative .response node. Queue and ledger.\" · asked three readings, his answer: \"As long as systems stay decoupled.\""
    chosen_2026_11_17: >-
      One source of truth for an agent reply, and it is Guardian's: the .job (guardian/data/jobs/, the queue, lib/data-home.js) and its
      .response node (guardian/data/nodes/response/, response-sink.js), each naming the other by a path relative to Guardian's data folder.
      The job ledger (guardian/lib/job-ledger.js, GET /jobs/ledger, JL1) is the read over both. The Clear Glass compartment store
      (artifact-chat-index.js) stops being written by Guardian; what Guardian put there is imported once (GD5d) and the store keeps only
      Clear Glass's own captures. Axioms: §5.9/§5.15.1 (one owner per kind of data: agent jobs are Guardian's), §5.15.3 (one system's
      outage breaks no other: today Guardian loads Clear Glass's code to write), §10.1/§10.3 (one write authority; two .response stores per
      reply are competing truth layers), §2.2 (the storage device is the source of truth), §8.6 (reuse: the .job, the node, the ledger and
      the downloads route all exist), §0.3 (the old store archived, not deleted).
      Found the same day (the cause of his report, from his own log 2026-11-17 07:22): since 2026-11-01 COS starts Guardian as the SYSTEM
      account, so defaultRoot() resolves %APPDATA% to C:\WINDOWS\system32\config\systemprofile\AppData\Roaming\CompartmentOS while the
      Library reads his own %APPDATA%. Every reply since went to a folder he never sees. Guardian/data is repo-relative (data-home), so
      this decision ends that split for replies; other COS compartments still resolve %APPDATA% per account (said, not fixed here:
      cos/foundation/constants.js already honours COS_DATA_ROOT for the supervisor to pin).
    readings_2026_11_17: >-
      The three questions put to him, decided by "as long as systems stay decoupled" plus the axioms:
      (1) "relative .response node": kept in nodes/response/ (reuse §8.6: node registry, job-ledger readNode, synthesize all read it
          there), with relative references both ways (.job -> response, node -> job). The other reading (the .response beside its .job
          in jobs/) is equally decoupled; TO CONFIRM, a path change only.
      (2) chats no job ran: Guardian's chat transcripts (guardian/lib/chat-transcripts.js: Guardian reads them from the page and serves
          /api/chats) become Guardian's own transcript nodes, not .job files (a chat nobody dispatched is not a job). Provider-tab file
          downloads (clear-glass/src/providers/download-capture.js) are Clear Glass's, and stay in Clear Glass's store (§5.15.2).
      (3) the downloads list: Guardian keeps posting its entry through Clear Glass's route POST /cli/downloads (his 2026-09-15 call, and
          already decoupled); unchanged.
    corrected_2026_11_17: >-
      James, 2026-11-17, on readings (2) and the GD5c/GD5d below as first written: "No the .responses in the library turn into that. The
      full store and ledger." Superseding (2) (kept above, §0.3): the WHOLE Library store becomes the one source of truth, not only what
      Guardian wrote there. Every item it holds (agent replies, chat transcripts, provider-tab downloads) becomes a .job with its .response
      node in Guardian's store, and the Library's Responses page is that store and its ledger, nothing beside it. A capture no one dispatched
      is a .job too (source: capture, fulfilled when its .response is written), so every row has the one shape his 2026-10-30 words ask for
      ("each job has to have it's corrasponding .response node to be fullfilled from clearglass' end"). Clear Glass hands its captures to
      Guardian's route and keeps no store of its own for them (§5.15.1; decoupled: by route, with an outbox while Guardian is down, the
      pattern response-sink's downloads-pending already proves). The coder's reading of "turn into that" = into the .job/.response store
      and ledger, matching this decision's own 2026-10-24 leaning; the other reading (the Library store becomes the source) would put agent
      jobs in Clear Glass and is not taken. (1) is still to confirm; (3) stands.
    problem: >-
      clear-glass/src/downloads/artifact-chat-index.js holds the .response files and their index. Guardian writes them (response-sink,
      code-artifact, chat-transcripts, cli); Clear Glass captures downloads into the same store and its Library shows it. One store, two
      writers, in two systems. His 2026-10-22 rule: "make each system responsible for it's own data". His CB3 call: the job ledger replaces
      the Library's .response view.
    leaning: >-
      The coder's reading, to ground in GD5: the .job/.response ledger is Guardian's (agent jobs are Guardian's). Clear Glass hands its
      captures to Guardian's route, and the Library reads Guardian's ledger, which is CB3's view.

phases:

  GD0_dead_edges:
    layer: foundation
    status: DONE 0.60.240 — guardian lost its edges to cockpit/ and meta/
    depends_on: []
    files: [guardian/server.js, guardian/lib/gap-hunter.js]
    does: "/forge/health answers that cockpit/forge is gone (said, not a crash); the comment naming meta/gap/hunter no longer reads as a require."
    proof: "the census: guardian loses its edges to cockpit/ and meta/"

  GD1_raid_through_its_port:
    layer: backend
    status: DONE 0.60.240 — lib/raid-port.js; test-raid-port 4/4; a booted Cortex answered through it; guardian 27 → 20 ways out
    depends_on: [GD_D0_raid_is_reached_never_loaded]
    files: [lib/raid-port.js (new), cortex/boot.js, guardian/server.js, guardian/api-dispatch.js, guardian/lib/dispatcher.js, tests/modules/test-raid-port.test.js (new)]
    does: >-
      The port: approveTool, recordOutcome, decide, listQueue. Cortex provides RAID in its own process and serves whatever routes are
      missing (POST /api/raid/approve-tool, /api/raid/outcome; GET /api/raid/queue exists). Guardian's 7 RAID edges go through the port.
    proof: "a route answer from a booted Cortex; approval denied when Cortex is down; guardian loses its 7 cortex/core/raid edges"

  GD2_primitives_to_the_kernel:
    layer: foundation
    status: OPEN
    depends_on: [GD_D1_pure_primitives_to_the_kernel]
    files: [lib/liminal.js (new), lib/gap-hunter.js (new), lib/baseline.js (new), intelligence/liminal/index.js, intelligence/gap/hunter.js, intelligence/baseline.js, guardian/api-dispatch.js, guardian/lib/gap-hunter.js, guardian/lib/ncp-handler.js, guardian/server.js]
    does: "git mv each to lib/; the old intelligence path re-exports it; guardian requires the kernel."
    proof: "intelligence's own tests pass through the re-exports; guardian loses 5 edges"

  GD3_intelligence_by_route:
    layer: backend
    status: OPEN
    depends_on: [GD_D2_stateful_capabilities_by_route, GD2_primitives_to_the_kernel]
    files: [guardian/lib/dispatcher.js, guardian/server.js, guardian/lib/ncp.js, intelligence/server.js]
    does: "alk record/query, gap predicate, the CFR ledger and the CFR influence through intelligence's routes (missing ones served)."
    proof: "guardian loses its remaining intelligence and nexus-cfr-influence edges"

  GD4_the_other_systems_by_route:
    layer: backend
    status: OPEN
    depends_on: [GD_D2_stateful_capabilities_by_route]
    files: [guardian/lib/dispatcher.js, guardian/routes/autonomous-loop.js, guardian/cli.js, guardian/server.js, cortex/boot.js]
    does: "model inventory (ollama route), makeNcpCallModel (copilot route), COS host and LLM lab (lib/cos-bridge.js), snapshot provider (Cortex route)."
    proof: "guardian loses its ollama, copilot, cos and cortex/snapshot edges; a snapshot shows guardian's state (it does not today)"

  GD5_the_response_store:
    layer: backend
    status: "OPEN — expanded 2026-11-17 into GD5a-GD5d (his \"one source of truth\"); GD5 is closed when all four are"
    depends_on: [GD_D3_the_response_store]
    files: [clear-glass/src/downloads/artifact-chat-index.js, guardian/lib/response-sink.js, guardian/lib/code-artifact.js, guardian/lib/chat-transcripts.js, guardian/cli.js]
    does: "the store gets one owner (GD_D3); the other system reaches it by route."
    proof: "guardian and clear-glass have no edge between them over the store"

  GD5a_one_write_the_job_and_its_response:
    layer: backend
    status: OPEN
    depends_on: [GD_D3_the_response_store, JL1_job_ledger_backend]
    files: [guardian/lib/response-sink.js, guardian/lib/code-artifact.js, guardian/lib/jobs.js, guardian/lib/job-ledger.js, guardian/lib/ncp-handler.js, guardian/server.js, lib/node-schemas/schema.response]
    does: >-
      A completed job is written once, by Guardian, to its own data: the .response node carries what recordAgentResponse put in the
      Clear Glass store (the code blocks with their syntax, ext, bytes, sha256 and code; the declared file; the prompt) beside the CE4
      tags it already has, and the node names its job (job: jobs/<id>.job) while the .job names its node (response:
      nodes/response/<id>.response), both relative to Guardian's data folder. recordAgentResponse stops requiring
      clear-glass/src/downloads/artifact-chat-index.js; synthesize() step 6 asks Clear Glass's route for captures instead of loading its
      code. The node is written before the job flips to complete (§9.2 ledger before state), so a restart between them leaves a
      fulfilled-but-unflipped job the ledger names, never a complete job with no node. Persistence (his 2026-11-14): nothing in memory only.
    proof: "a job through ncp-handler and one through POST /response/:jobId each leave exactly one .response (Guardian's), with codeBlocks and both relative references; guardian's census row has no edge to clear-glass/src/downloads; GET /jobs/ledger shows both fulfilled; run under a COS_DATA_ROOT pointed elsewhere, the reply lands in the same place (it no longer depends on the account)"

  GD5b_transcripts_are_guardians:
    layer: backend
    status: OPEN
    depends_on: [GD5a_one_write_the_job_and_its_response]
    files: [guardian/lib/chat-transcripts.js, guardian/cli.js, guardian/server.js, guardian/lib/jobs.js, clear-glass/src/providers/download-capture.js, clear-glass/src/downloads/artifact-chat-index.js, clear-glass/src/ipc/bridge.js]
    expanded_2026_11_17: >-
      His correction (GD_D3 corrected_2026_11_17): not transcripts only, every capture. A chat transcript and a provider-tab download each
      become a .job (source: capture) with its .response node in Guardian's store, through a Guardian route (POST, idempotent by content
      hash; transcript versions kept as the node's history). download-capture.js posts to that route instead of recordResponse; while
      Guardian is unreachable it queues in Clear Glass's own outbox and replays in order (nothing lost, nothing blocked). The capture's file
      bytes (≤10 MB, as today) travel with it. artifact-chat-index.js stops being a store: archived once GD5d has imported it (§0.3).
    does: >-
      Guardian's chat transcripts (one per chat, versioned, refusing unchanged reads: recordChat's rules, moved not rewritten) are
      written as Guardian's own transcript nodes in its data folder, served by its existing /api/chats routes. guardian sync
      (cli.js) writes there too. Clear Glass's provider-tab downloads stay Clear Glass's (download-capture.js, its own store).
    proof: "a settled chat leaves one transcript node in guardian/data, a second unchanged read writes nothing, /api/chats returns it; no require of clear-glass/ from guardian/ is left (census); a provider-tab download becomes a capture .job with its .response; with Guardian stopped it waits in Clear Glass's outbox and lands on restart, once"

  GD5c_the_library_reads_the_ledger:
    layer: ui
    status: OPEN
    depends_on: [GD5a_one_write_the_job_and_its_response, GD5b_transcripts_are_guardians, JL2_route_command_ui]
    files: [clear-glass/src/ipc/bridge.js, clear-glass/renderer/library/sections/responses.js, lib/agent-memory.js, lib/repo-agent.js, idearium/cli/route-commands.js]
    expanded_2026_11_17: >-
      His correction: the Responses page IS the full store and ledger, not Guardian's ledger beside a Clear Glass list. One list: every
      .job (agent jobs and captures), its queue state and its .response, filterable by agent, repo, run, kind and source. Guardian down: the
      page says Guardian is unreachable and shows what is waiting in Clear Glass's outbox, named as not yet in the store.
    does: >-
      His order of delivery, the UI step JL2 named as not done: the Library's Responses page reads Guardian's job ledger and transcripts
      through Guardian's routes (by agent, repo, run, kind, as now), and Clear Glass's own captures from its own store, side by side,
      each labelled with its owner. A row opens its .response through GET /response/:jobId. lib/agent-memory.js and lib/repo-agent.js
      (findLate/adoptLate) read replies through Guardian's route, not Clear Glass's files. Guardian down: the page says so and still
      shows Clear Glass's own captures (§5.15.3). Tested in Clear Glass (glass.js), never Playwright.
    proof: "in Clear Glass, a reply completed now is at the top of Responses within one refresh, filed under its agent; the page with Guardian stopped shows the captures and names Guardian as unreachable; the census shows no edge from lib/ or clear-glass/ into the store's files"

  GD5d_bring_the_lost_days_home:
    layer: backend
    status: OPEN
    depends_on: [GD5a_one_write_the_job_and_its_response, GD5b_transcripts_are_guardians]
    files: [guardian/cli.js, guardian/server.js, guardian/lib/response-sink.js, guardian/lib/chat-transcripts.js]
    does: >-
      A one-time import, run by him (a Guardian command and route, never automatic): for each Clear Glass compartment store it is given
      (his own %APPDATA% one and the SYSTEM account's, which needs admin), every item Guardian wrote there (a reply with a job_id, a
      transcript) becomes Guardian's node when Guardian does not already hold it (matched by jobId, then content hash); a reply with no
      .job gets its node and is named in the ledger as imported, not invented. Clear Glass's own captures are left where they are. The
      old store is archived whole (§0.3), never deleted; the import writes a report (imported, already held, unreadable, left).
    expanded_2026_11_17: >-
      His correction: the FULL store is imported, not only what Guardian wrote. Every item in each old store (his and SYSTEM's) becomes a
      .job with its .response: a reply joins its existing .job by jobId when there is one; everything else (transcripts with every version,
      provider-tab downloads with their copied bytes, items with no job) becomes a capture .job. Unreadable files are imported as named,
      unreadable records with their bytes kept. After the import the old stores are archived whole.
    proof: "a dry run lists what it would import from each store; the real run is idempotent (a second run imports 0); c98bb7d3 from 2026-11-17 is in GET /jobs/ledger with its text; the report is kept"

  GD6_the_ways_in:
    layer: backend
    status: OPEN
    depends_on: [GD5_the_response_store]
    files: [lib/agent-memory.js, lib/pipeline-routing.js, lib/repo-inject.js, lib/system-control.js, orchestrator/orchestrator.js]
    does: "each file that reaches into guardian/ goes through Guardian's route, or the reached file is a kernel primitive and moves (job-retry's classify is pure)."
    proof: "no way into guardian/ but its launcher"

  GD7_the_bus_and_connect:
    layer: foundation
    status: OPEN
    depends_on: [GD6_the_ways_in]
    files: [guardian/server.js, nexus/nexus-bus.js, nexus/nexus-connect.js]
    does: "nexus/'s bus and connect are primitives in an unhomed folder; inside a compartment the bus is COS's. Decided when grounded (the census marks them primitive)."
    proof: "guardian's sovereignty row: 0 out"

  GD8_guardian_in_its_compartment:
    layer: integration
    status: OPEN
    depends_on: [GD7_the_bus_and_connect, CS3_the_registry_is_the_bridge]
    files: [service/guardian-service.js, cos/compartment/process-runner.js]
    does: "Guardian boots inside its own COS compartment; it is reached only through its routes and the COS bus."
    proof: "Guardian's health answers from inside the compartment; a job goes in and its .response comes back through the route"

## ADDENDUM 2026-10-24 (0.60.240) — GD0 and GD1 built; what they found
- GD0: /forge/health says cockpit/forge is not in the tree (the route only ever threw). gap-hunter's comment no longer names meta/gap/hunter.
- GD1: lib/raid-port.js. Cortex provides RAID at boot and serves POST /api/raid/approve-tool. The feedback route's body became
  _raidFeedback(), so an outcome lands the same way in-process or over the route.
- Guardian now asks the one RAID in all 9 places:
  - approval: /build, forge, the size-chosen chunking path, chat, browser jobs;
  - decide: the raw dispatch;
  - outcome: both api-dispatch paths;
  - the contract queue: /api/intake.
- Three defects found and fixed by the move (§0.0: they only looked like they worked):
  1. **/build never reached RAID.** At guardian/server.js:3054, `raid` was never defined in that scope, so every call threw
     "raid is not defined".
  2. **RAID never learned from API dispatches.** api-dispatch called recordOutcome(jobId, ok, ms), but its signature is
     (agent, cluster, success), so it passed a job id as the agent. It now sends the provider.
  3. **The raw dispatch ran a second RAID.** It called _decide inside Guardian with Guardian's own copy of the health and weights,
     never what Cortex had learned. Cortex's /api/raid/decide now decides, applying its own CFR field, so Guardian's read of
     nexus-cfr-influence is gone as well.
- Proof:
  - Run: a booted Cortex (port 3791, sandboxed env), asked through the port from another process: approve chat → approved ("allowed");
    no source → refused ("source is required"); decide → ollama ("health=100 regime=stable"); outcome → recorded.
  - Census: guardian 27 → 20 ways out; no new crossing.
- Found, not fixed (not boundary work, logged): booting Cortex with the test sandbox's env still ran its data-home clear-up against the
  real tree. It moved data/lattice/relationship_lattice.buffer.jsonl into cortex/data and wrote cortex/data/* and
  versionium/data/settings.json. All of it was restored. lib/data-home.js atBoot does not honour the sandbox for a booted system.

## ADDENDUM 2026-10-24 (0.60.241) — a correction to the 0.60.240 finding
The 0.60.240 addendum said booting Cortex "with the test sandbox's env" ran its data-home clear-up against the real tree, and blamed
lib/data-home.js atBoot. That was wrong. The coder's proof script spread require('lib/test-sandbox.js').childEnv() itself, which returns
{ env, root, cleanup }, instead of its .env, so Cortex booted with no sandbox at all. bringHome already refuses to move the tree in a test
process. Re-run correctly in 0.60.241 (the Loom proof), nothing moved. The earlier text is kept (§0.3); the code in the tree that uses
childEnv (lib/phase-close.js, tests/modules/run-all.js) uses .env correctly. The 0.60.239 Idearium proof had the same mistake: it said
"sandboxed" and was not.

# ## ADDENDUM 2026-10-24 (on main) — GD1 is done on main at 0.60.246
# This map came over from brave-cori verbatim (BCR3), where GD1 says "DONE 0.60.240". That was true on brave-cori. On main,
# raid-port arrived at 0.60.242 (BCR2), and Guardian's last four RAID loads were rewired at 0.60.246, ported from brave-cori's
# GD1: the intake queue match, decide, and the chunking and chat gates. test-raid-port 4/4 (RP-04) is in run-all. Both version
# numbers are kept (§0.3).

# ── ADDENDUM 2026-10-29 — categories and cos.exe as the full compartment manager (his) ──
# James, 2026-10-29: "catagories using either the architypes or the templates, with a full manager and editor, with the schemas, then catagories
# which can be managed, including systems which would then list each system compartment. also really need cos.exe to be a fully compartment
# manager with controls for the rewind engine, diagnostic tools, versions, data browser and tools. cli access. index.html/ui for the
# thumbnail. look at all of the cos phases, and add all of this to them." · and: "yes, clear glass macros and settings too."
# Mapped in full in docs/2026-10-24-cos-manager-phasemap.spec (addendum 2026-10-29: MG10 categories, MG11 the category manager UI, MG12 the
# exe is the compartment manager, MG13 CLI in the exe, MG14 live thumbnails).
# Here: Guardian in its compartment (GD8) is listed in the built-in 'systems' category (MG10). Its data (GD5, the response store) is browsed in
# MG12's Data tab only through Guardian's routes (MG_D3, §5.15).

# ADDENDUM 2026-10-29 (0.60.288) — pre-clean before the compartment
# James, 2026-10-29: "Well, first of all, let's clean it. Pre-clean it out". Archived to _archive/2026-10-29-guardian-preclean/ (README there):
#   - guardian/mesh/ and guardian/routes/mesh.js: his 2026-09-06 "redundant and should be deleted", left behind by RF2;
#   - guardian/guardian-api.js: unused, and calling routes that 404.
# Kept: guardian-service.js (GD8's entry), dropzone.js (a standalone CLI), command-registry.js and agent-model-nodes.js (his features, built
# and unwired — to wire, not to drop). Guardian: 82 → 67 files, 35,928 → 30,380 lines.

## ADDENDUM 2026-10-29 — measured: what Guardian reaches outside its compartment
James, 2026-10-29: "need it in a cos compartment then the component registry spine". The coder's reading: "it" = Guardian, following his
"Is there any reason why guardian can't be compressed down into a plugin for nexus?" (to confirm).
Run (anyone can repeat): guardian/guardian-service.js under cos/compartment/boundary.js, mode audit, allow [guardian/, node_modules/].
86 files outside the wall load at boot: 51 in lib (the shared kernel), 35 in other systems. Guardian's own direct edges into other systems
are six; everything else comes in behind them:
- GD2 (primitives to the kernel): guardian-service.js → intelligence/baseline.js; server.js → intelligence/gap/hunter.js
- GD3 (intelligence by route): server.js → intelligence/cfr/ledger.js (pulls cfr/*, causal/compound, lib/domain-nodes)
- GD4 (by route): server.js → cortex/snapshot/index.js (pulls versionium/lib/snapshot.js); server.js → cos/playground/llm-lab.js
- GD5 (one owner for the response store): guardian/lib/chat-transcripts.js → clear-glass/src/downloads/artifact-chat-index.js
Through lib, not Guardian's own: lib/component-ledger.js → cortex/memory/jaa-db.js (→ tiers, lib/vector-memory → ollama/config.js), and
loom/scanners/event-taxonomy-map.js reading every system's event-taxonomy.js. These are lib's crossings; they cross into Guardian's
compartment only because lib is mounted whole.
Guardian started and indexed its nodes in audit mode; enforce mode would refuse at the first of these. So GD8 is six edges away for
Guardian's own code, plus the lib crossings above.
