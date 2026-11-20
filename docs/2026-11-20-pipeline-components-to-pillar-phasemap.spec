# docs/2026-11-20-pipeline-components-to-pillar-phasemap.spec — the pipeline's components in Pillar, reached through the drawbridge
# author: james-brooks (the direction and the calls are his; the map is the coder's, to his words)
origin: >-
  James, 2026-11-20: "okay. idearium needs to be fixed. it is killing my pc. i want each system in idearium to only load the compartment I am
  using. like we need to migrate the pipeline backend from idearium into the automation engine. so it stops crashing from idearium." · "all of
  the features the automation engine could use, side tabs that cos ui could use." · "what about moving to pillar?" · "no i mean the components
  for the pipeline. i dont want coupling, nor do I, break idearium by stripping the pipeline components out like a caveman. need to use the
  drawbrige." · "This is the beginning of my ambition. everything builds from the moment nexus, can code effectively, stable, and without hand
  holdikng". His drawbridge, 2026-11-03: "The drawbridge is the the component registry, which is also the event bus, and interaction contract
  and bridge into the compartment." His Pillar, 2026-11-05/06: one kernel of primitives, each concept once, with its contract and conformance
  ("the primitives letting a small local model do what needs a big one").
measured: >-
  2026-11-20, at rest: Intelligence 719 MB, Cortex 242, Idearium 154, the Orchestrator 129; all node 1.9 GB; 7 GB RAM free of 15.9. Idearium is
  heavy while it works: the whole phase build (snapshot, plan, shadow tests, the Emerge rung, model calls) runs in its one process; during
  today's builds it did not answer HTTP for over 90 s at a time (runs phrun-mwoybi65-ospo, phrun-mwoylks4-btbp).
covers: >-
  Expands, does not rewrite: IF_D1 (decided: what runs work is COS's), IF2 (the build as a pipeline, the strangler), IF5 (one compartment), IF6
  (the loop is COS), PC12 (every pipeline in COS), PIL4 (three identities), PIL5 (the duplicates census). Each of those keeps its own scope;
  this map is the way their components move: into Pillar, through the drawbridge, never ripped out.

decisions:
  DB_D1_components_move_by_contract_never_ripped_out:
    status: "DECIDED 2026-11-20 by his words (above); the coder's reading of the mechanism, to confirm"
    chosen: >-
      Each pipeline component moves the same way, one at a time (IF2's strangler): (1) its meaning becomes a Pillar contract with conformance
      cases; (2) an Emerge implementation passes them; (3) a system that uses it installs it into its own compartment by contract, pinned by
      hash (PIL4's identities), and registers it in its own component registry: the drawbridge; (4) the system switches its callers to the
      installed one; its old code stays until the conformance cases and the system's own tests pass on the new; then the old is archived (§0.3).
      No system reads another's files at runtime (§5.15); Pillar is installed from, never called into.
    readings:
      a_installed_by_contract: "Pillar stays a store with no server; each system installs the components it uses into its compartment (the coder's recommendation: no runtime coupling, one outage breaks nothing)"
      b_pillar_serves: "Pillar becomes a system with its own server.js and routes; systems call its components over the drawbridge at runtime"
    his_to_choose: "a or b (the coder recommends a: §5.15 rule 3, one system's outage breaks no other)"
    answered: >-
      2026-11-20, reading a, by his rule the same hour: "any memory system that a system relies on to operate needs to have a copy, or version."
      A system that relies on a Pillar component to operate keeps its own installed, versioned copy.
    axioms: "§5.9, §5.14, §5.15, §5.16 (each registry its own), §0.3 (archive, never delete), §8.6 (reuse), §16.5"
  DB_D2_memory_in_cortex_copies_where_relied_on:
    status: "DECIDED 2026-11-20 (his); the coder's reading of the mechanism, to confirm"
    james: >-
      "i feel that cortex should hold the memory systems. associative lattice, and the ring buffer, and the causal field. what do you think? also
      with the phases?" · then: "any memory system that a system relies on to operate needs to have a copy, or version."
    found: >-
      2026-11-20: the associative lattice in intelligence/lattice/ (associative, node, fan-in), copilot/lib/person-model/lattice.js,
      idearium/architecture-spec/registry/lattice.js, data/lattice/; ring buffers in idearium/spec-engine/spec-compiler/compiler/ring-buffer.js and
      lib/emergence/.../RingBufferCore.js; the causal field's state kept apart by guardian, the orchestrator and idearium (data/*/cfr), its code in
      intelligence/causal/, cortex/memory/causal-lookup.js, diagnostic/lib/causality.js, lib/diagnostic-causal.js. Three to five homes each
      (§10.3). Intelligence, 719 MB at rest, the heaviest system, holds the lattice in memory.
    chosen: >-
      Cortex holds each memory canonically (one writer, on disk, indexed, queried by its routes): the lattice's nodes and edges, the events' ring,
      the causal field's ledger, and the books (the phase ledger, run histories, failure modes: his 2026-11-09 "the ledgers, the failure modes, the
      records of what happened are Cortex's"). A system that relies on a memory to operate keeps its own versioned copy: it reads its copy, writes
      go to Cortex, and with Cortex down it runs on its copy and reconciles when Cortex is back (Versionium's postDurable pattern: waits, never
      dropped). The reasoning over memory (association, causal inference, anomaly) stays Intelligence's, reached through Cortex's routes (§7.3,
      cognition is not history). The ring buffer is a Pillar primitive; Cortex holds the instance that keeps events. Maps and .phase files stay
      with the system each phase builds. Moved the drawbridge way, never ripped out.
    to_confirm: "the phase ledger moving from Idearium (his 2026-11-06: 'add a phase ledger, to idearium') to Cortex's books, Idearium keeping a versioned copy"
    axioms: "§5.15 rules 1 and 3, §10.1, §10.3, §7.3, §2.1, §17.12 (the buffer pattern)"

phases:
  DB1_the_pipeline_census:
    status: OPEN
    depends_on: [IF_D1_the_factory_is_cos]
    files: [pillar/census/pipeline.eg, pillar/test/census.test.eg]
    does: >-
      Every component the pipeline uses, found where it lives today and named by meaning: the build's stages (_phaseBuild's snapshot, map,
      plan, test first, chunks, the Emerge rung, the ladder, land, prove, verdict, ledger), the loop's timers, gates, rewind, tasks, procedures,
      the flight recorder, the tape's reader, gaps.eg (lesson, struggle, link, guard), the ladder, reuse, a step's method. Each: its file, its
      callers, its owner today, its meaning in one line, whether Pillar already holds that meaning, and its weight (lines, calls, how often it runs).
    proof: "a census a stranger can read: every pipeline component with its callers and its Pillar status; nothing moved"
  DB2_the_contracts:
    status: OPEN
    depends_on: [DB1_the_pipeline_census, PIL3_conformance]
    files: [pillar/contracts/contracts.eg, pillar/test/contracts.test.eg]
    does: >-
      A Pillar contract per pipeline meaning not yet held, each with its conformance cases: the step, the stage, the ladder, the lesson, the
      chain (a gap linked before the gap it unblocks), the method, the rewind to a gate, the task. pillar:gap and pillar:gate exist; pillar:gate's
      source is lib/siso/Gate.js, his mentor's: its meaning is kept, its Emerge implementation is Nexus's own (his 2026-11-19: "I want to move away
      from siso").
    proof: "contracts.test.eg: each new contract checked and its cases run; a second contract for the same meaning refused"
  DB3_the_drawbridge_installs:
    status: OPEN
    depends_on: [DB2_the_contracts, PIL4_three_identities]
    files: [pillar/install.eg, pillar/test/install.test.eg, lib/handoff.js]
    does: >-
      A system installs a Pillar component into its own compartment: the component's Emerge file and its built JS copied in by the handoff
      (verified, input/ → done/), pinned by its three identities, entered in the system's own component registry with the contract it meets.
      A later Pillar version is offered, never forced: the system's tests decide. Reading a: no runtime call into Pillar.
    proof: "a component installed into two systems' compartments; Pillar's folder removed; both systems still pass their tests"
  DB4_the_first_move_gaps:
    status: OPEN
    depends_on: [DB3_the_drawbridge_installs]
    files: [idearium/lib/gaps.eg, idearium/lib/emerge-rung.cjs, cos/automation/method.eg, cos/automation/ladder.eg]
    does: >-
      The first component moved, because it is already Emerge, pure and tested: gaps.eg (lesson, struggle, link, guard) becomes Pillar's; the
      Emerge rung installs it through the drawbridge; idearium/lib/gaps.eg stays until the rung's tests pass on the installed one, then is
      archived. Then method.eg and ladder.eg the same way.
    proof: "test-emerge-rung and gaps.test.eg pass on the installed component; the old file archived; Idearium never stopped building"
  DB5_the_build_runs_in_cos:
    status: OPEN
    depends_on: [DB4_the_first_move_gaps, IF2_the_build_as_a_pipeline, IF6_the_loop_is_cos]
    files: [cos/pipeline/pipelines/phase-build.pipeline, cos/automation/pipeline.js, idearium/api/index.js]
    does: >-
      The build's stages run in COS's engine from installed components, stage by stage (IF2); Idearium's ▶ build hands its request to COS through
      the drawbridge and keeps its data (repos, specs, proposals) served by its routes. Idearium's process stops carrying the build.
    proof: "a phase built end to end with Idearium's memory and response time measured before and after; Idearium answers HTTP throughout"
  DB6_the_dock_from_pillar:
    status: OPEN
    depends_on: [DB5_the_build_runs_in_cos]
    files: [pillar/panels/, cos/ui/cockpit/, idearium/ui/js/code-dock.js]
    does: >-
      His side tabs (the dock: Plan, Outputs, Changes, Tasks, Context, Tools, Control; DK2, DK3) as Pillar panel components, installed by COS's UI
      and by Idearium's, each reading its owner's routes. A live preview shown to him first (his rule), then built.
    proof: "the same panels in COS's cockpit and in Idearium's Code tab, one source; Idearium's dock unchanged for him until the swap is shown"

  DB7_memory_into_cortex_with_copies:
    status: OPEN
    depends_on: [DB3_the_drawbridge_installs, DB_D2_memory_in_cortex_copies_where_relied_on]
    files: [cortex/memory/, intelligence/lattice/associative-lattice.js, intelligence/lattice/node-lattice.js, intelligence/causal/index.js, idearium/spec-engine/phase-ledger.cjs]
    does: >-
      DB_D2 built, one memory at a time, the drawbridge way: a census of every memory each system relies on (its readers and writers); Cortex's
      canonical store for each, chunked on disk and indexed; each relying system's versioned copy with its reconcile; the old homes switched only
      after their tests pass on the copy, then archived. The lattice first (the heaviest, in Intelligence), then the causal field, then the books.
    proof: "Cortex stopped: each relying system still answers from its copy and reconciles after; Intelligence's memory at rest measured before and after"
build_order: [DB1, DB2, DB3, DB4, DB5, DB6, DB7]
first_slice: "DB1, the census: nothing moves until every pipeline component is found with its callers (§8.4: scan dependencies and consumers before changing any file)."
failure_modes:
  - "Two copies alive at once drift: each move ends with the old archived, and the census marks a meaning held twice (PIL5)."
  - "An installed component falls behind Pillar: offered, not forced; the system's tests decide, and the version each runs is in its registry."
  - "The move itself breaks Idearium: never in one step; each component switches only after its tests pass on the installed one, and switches back by the registry entry."

# ── HANDOFF 2026-11-20 (0.60.626) — DB1 read, the migration's next steps (his: "like we need to migrate, i cant even use idearium, so it needs
#    to be for the pipeline automation") ──
# DB1 census, read from the code: Idearium's pipeline backend is idearium/api/index.js _phaseBuild → _watchRuns, 1,261 lines (1116–2377). It
# requires 44 lib/ modules (compartment, agent-providers, charter, coder-brief, component-store, context-stream, cos-bridge, tokens, …),
# 3 of Cortex/RAID (contract-adapters, contract-gates, contract-intake), cos/testenv, and idearium/lib/emerge-rung.cjs. COS's boundary audit
# (cos/data/manager/logs/idearium.err.log) lists its reaches into cortex/core/raid, cos/testenv, guardian/lib, clear-glass, loom.
# Measured: every real build takes Idearium's heap to ~93% of 1,024 MB and it goes down (EMB3 runs 10–11); its loop and watchdog start builds
# on their own (NM1, NM1a, BX1 for ~46 h). Done the same day: 0.60.625 (a phase failing the same way twice is held), 0.60.626 (dynamic heap for
# a high-priority system: his cap the floor, half the free memory up to 3 GB).
# Next, in order (DB5's strangler, sliced):
#   1. Lift _phaseBuild out of the server file into idearium/build/phase-build.js with its Idearium access passed in (repo layer, run rows,
#      proposals, events); Idearium calls it as before, no behaviour change; its tests prove it.
#   2. COS's automation engine runs that module in its own process, the Idearium access implemented over Idearium's routes (the drawbridge);
#      the build pipeline's build step calls COS. This is what stops builds crashing Idearium.
#   3. Components to Pillar one by one (DB2–DB4); the dock to COS (DB6, preview first).
# Open question put to him: switch off Idearium's own build starts (repos.on_stall, the loop) until step 2 lands, so it builds only on ▶.
# EMB3 state: its test is written by Nexus from its ten examples (0.60.624); not yet built through the rung because Idearium went down mid-run.
