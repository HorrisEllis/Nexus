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
    status: OPEN — decided by the axioms once GD5 is grounded; to him only if they do not settle it
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
    status: OPEN
    depends_on: [GD_D3_the_response_store]
    files: [clear-glass/src/downloads/artifact-chat-index.js, guardian/lib/response-sink.js, guardian/lib/code-artifact.js, guardian/lib/chat-transcripts.js, guardian/cli.js]
    does: "the store gets one owner (GD_D3); the other system reaches it by route."
    proof: "guardian and clear-glass have no edge between them over the store"

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
