# docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec
# Every build through WARP; agents write .spec files from an injected framework; Nexus collects them; intent-based
# .inject blocks with every setting shown in the repo. Registered in docs/SPEC-REGISTRY.spec. MAPPED; PT1 (specs tagged per phase) built 0.60.63.

origin:
  date: 2026-10-15
  james: >-
    "make sure all builds use warp. also need the agents to use the spec compiler? like the yaml. need to inject a
    framework for generating a .spec file. then need to listen for it to collect it. intent based .inject nodes, with
    full expanded settings in the repos.e"
  james_4: >-
    "Merge with main. Then look at the recent spacs for idearium. And begin on the pipeline. The speccing, mapping, listener. It doesn't know how to map. Nexus needs to generate dependancies for each phase, with files. The agent keeps having to find context, with tools.  Need them all mapped. Need that be automatic for every new phase from any project. Look at the new spec per module phase from main"
  james_3: "phases tags by system/nested repo"
  james_2: >-
    "can you make sure those are added to the phases in idearium. make sure all of the files and dependancies are
    mapped. and i want the specs to tagged per phase"

found:
  # §8.6, read on 2026-10-15
  - "WARP (idearium/spec-engine/warp-build-dispatch.js → lib/seam/adapters/warp-cascade.js): cache, population seed, axiom-gated cascade. USED by spec-chunk builds (idearium/api/index.js ~8436), plan drafts (~7994, ~8128) and expand (~7647)."
  - "NOT used by: the phase build (makeAttempt → RA.dispatch, lib/repo-agent.js, climbed by lib/pipeline-routing.js climb, index.js ~904–990); the whole-phase brick (BR1, same dispatch); the RAID officiator and RAID worker bricks (copilot/lifeline.js dispatchToNcpAgent). compile is deterministic T0/T1 (no agent) — nothing to route."
  - "The spec compiler's format is docs/spec-compiler.spec (meta, axioms, pipeline, modules, schemas); emerge/compiler/index.js compile/emitT0/emitT1; idearium/compiler-bridge.js turns Idearium specs into it; lib/spec-document.js parse/check reads .spec files."
  - "Prompt blocks (lib/repo-prompt-blocks.js) are the only text a repo agent is sent — James 2026-09-26: 'not to inject anything into it that i cant edit in the agent settings'. Each block has `when`: always | tools | guardian | build. No block is chosen by intent."
  - "lib/repo-inject.js fromReply already turns a fenced block with a path (```yaml spec/x.spec) into a .inject node (proposed → applied → reverted). Nothing reacts when the landed file is a .spec."
  - "lib/intent-classifier.js already classifies every request (RAID's entry gate)."

decided:
  warp_where:
    reading: >-
      Coder's reading and recommendation (to confirm): WARP wraps the ONE agent call of every build (RA.dispatch in
      makeAttempt; dispatchToNcpAgent for RAID bricks/officiator) — cache and population first, axiom gate on the
      reply, retention after a passed gate — while the ladder and RAID still choose who answers. Not: WARP's own cascade
      replacing the ladder (that would undo RAID routing, §5.2).
  intent_inject:
    reading: >-
      Coder's reading (to confirm): "intent based .inject nodes" = prompt blocks chosen by the request's intent
      (`when: intent:spec`, intent from lib/intent-classifier.js), e.g. the spec framework block is sent only when the
      intent is writing a spec; "full expanded settings" = every block and per-intent setting shown open in Repo →
      Settings → Agents, editable, nothing hidden. Other reading: each .inject NODE (a code write) carries its intent and
      the repo has per-intent landing settings — IS1 covers that too; to confirm which he meant, or both.

phases:
  # Each phase: systems (declared, not guessed), files (real paths; "(new)" = to be created), depends_on, and specs —
  # the specs that own the behaviour it changes (each gets a dated ADDENDUM when the phase lands, §12.5).
  WB0_census:
    status: OPEN
    systems: [core, idearium, cos]
    files: [lib/build-paths.js (new), lib/checks/ck-255-warp-builds.js (new), cos/spec/check-catalogue.spec, idearium/api/index.js, tests/modules/test-build-paths.test.js (new)]
    depends_on: []
    specs: [docs/warp.spec, cos/spec/check-catalogue.spec, idearium/spec/idearium.spec]
    does: "lib/build-paths.js: every build path, the call it makes, whether WARP is on it; CK-255 red while one bypasses WARP."
    proof: "today: red, naming phase build, whole-phase brick, officiator, RAID worker"
  WB1_warp_at_the_rung:
    status: OPEN
    systems: [idearium, core]
    files: [idearium/api/index.js, idearium/spec-engine/warp-build-dispatch.js, lib/seam/adapters/warp-cascade.js, lib/repo-agent.js, lib/pipeline-routing.js, lib/warp-rung.js (new), tests/modules/test-warp-rung.test.js (new)]
    depends_on: [WB0_census]
    specs: [docs/warp.spec, idearium/spec/idearium.spec, docs/2026-10-15-one-contract-raid-releases-phasemap.spec]
    does: "lib/warp-rung.js wraps RA.dispatch in makeAttempt: cache/population lookup keyed by (repo, file, prompt hash), axiom gate on the injects, retain after the gate passes; the ladder unchanged."
    proof: "an identical brick retained 3x is served from WARP with no agent call; a reply failing an axiom never lands"
  WB2_raid_bricks_and_officiator_through_warp:
    status: OPEN
    systems: [cortex, copilot, core]
    files: [cortex/core/raid/contract-intake.js, cortex/core/raid/officiator.js, copilot/lifeline.js, lib/warp-rung.js, tests/modules/test-raid-officiator.js, tests/modules/test-lifeline-ollama-dispatch.test.js]
    depends_on: [WB1_warp_at_the_rung]
    specs: [docs/warp.spec, cortex/spec/cortex.spec, copilot/spec/copilot.spec, docs/raid-warp-verification-phasemap.spec]
    does: "contract-intake _realAgentExecutor and the officiator call through the same wrapper; CK-255 green."
    proof: "CK-255 green on Nexus"
  SF1_intent_blocks:
    status: OPEN
    systems: [idearium, core]
    files: [lib/repo-prompt-blocks.js, lib/intent-classifier.js, lib/repo-agent.js, idearium/api/index.js, idearium/ui/js/repo-settings.js, tests/modules/test-intent-blocks.test.js (new)]
    depends_on: []
    specs: [idearium/spec/idearium.spec, docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec]
    does: "prompt blocks gain `when: intent:<name>`; dispatch passes the classified intent; Repo > Settings > Agents shows each block's intent, expanded."
    proof: "a spec-intent request carries the block; a build request does not"
  SF2_spec_framework_block:
    status: OPEN
    systems: [idearium, core]
    files: [lib/repo-prompt-blocks.js, docs/spec-compiler.spec, idearium/compiler-bridge.js, tests/modules/test-intent-blocks.test.js]
    depends_on: [SF1_intent_blocks]
    specs: [docs/spec-compiler.spec, idearium/spec/idearium.spec]
    does: "default block 'spec-framework' (when intent:spec): the spec-compiler YAML skeleton (meta, purpose, axioms, modules with exports, schemas, gates, tests) and the rule: reply with ```yaml spec/<name>.spec. Editable like every block."
    proof: "the block text is the compiler's own sections; edited text is what is sent"
  SF3_collect_the_spec:
    status: OPEN
    systems: [idearium, core]
    files: [lib/repo-inject.js, lib/spec-document.js, lib/spec-collect.js (new), idearium/spec-engine/index.js, idearium/api/index.js, idearium/cli/route-commands.js, tests/modules/test-spec-collect.test.js (new)]
    depends_on: [SF2_spec_framework_block]
    specs: [docs/spec-compiler.spec, idearium/spec/idea-to-spec.spec, idearium/spec/idearium.spec]
    does: "lib/spec-collect.js: when an .inject lands a *.spec (or yaml with a spec: root) — validate (spec-document check + compiler shape); valid -> registered on the repo's specs and the spec engine, event idearium.spec.collected, tagged with the phase that asked for it; invalid -> errors back to the agent once, said."
    proof: "a planted good reply is collected, registered and tagged to its phase; a bad one returns its errors, nothing registered"
  SF4_compile_on_collect:
    status: OPEN
    systems: [idearium, core]
    files: [lib/spec-collect.js, idearium/compiler-bridge.js, emerge/compiler/index.js, lib/repo-inject.js, tests/modules/test-spec-collect.test.js]
    depends_on: [SF3_collect_the_spec]
    specs: [docs/spec-compiler.spec, idearium/spec/idearium.spec]
    does: "per-repo setting: a collected spec runs T0/T1 (zero tokens); its files arrive as proposed .inject nodes."
    proof: "a collected spec yields its tree as proposals, nothing overwritten"
  IS1_intent_settings_per_repo:
    status: OPEN
    systems: [idearium, core, loom]
    files: [lib/repo-inject.js, lib/repo-prompt-blocks.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-settings.js, loom/maps/observability-map.js, tests/modules/test-intent-settings.test.js (new)]
    depends_on: [SF1_intent_blocks]
    specs: [idearium/spec/idearium.spec, idearium/spec/nexus-repository-system.spec]
    does: "each .inject node records its intent; per repo, per intent: blocks sent, landing folder, apply mode (auto/review), validator, compile-on-collect — all shown expanded in Repo > Settings; route + `repo intents` command + UI."
    proof: "two intents with different landing modes land differently in one repo"
  PT1_specs_tagged_per_phase:
    status: DONE (0.60.63)
    systems: [loom, idearium, core]
    files: [loom/scanners/phasemap-map.js, idearium/ui/js/phases.js, tests/modules/test-phase-specs-tag.test.js]
    depends_on: []
    specs: [loom/spec/loom.spec, idearium/spec/idearium.repo-roadmap.spec]
    does: "a phase's `specs:` list is read by loom's phasemap reader (key and list forms) and shown on the phase in Idearium; every phase of this map carries its specs."
    proof: "test-phase-specs-tag: this map's phases each carry systems (declared), files and specs"

  PT2_phases_tagged_by_system_repo:
    status: DONE (0.60.64)
    systems: [loom, idearium, core]
    files: [loom/scanners/phasemap-map.js, idearium/ui/js/phases.js, tests/modules/test-phase-specs-tag.test.js]
    depends_on: [PT1_specs_tagged_per_phase]
    specs: [loom/spec/loom.spec, idearium/spec/idearium.repo-roadmap.spec, idearium/spec/nexus-repository-system.spec]
    does: "a phase is tagged with every system (nested repo) that owns a file it names (systems.js ownerOf), beside its declared systems; each system's nested repo lists it (its 'mine' filter, on by default); the phase row and detail show its system tags."
    proof: "test-phase-specs-tag PT-05..07: a phase editing guardian/ is in guardian's repo without declaring it; declared tags always cover the files' owners in this map"

  MP1_nexus_maps_every_phase:
    status: DONE (0.60.65)
    systems: [core]
    files: [lib/phase-map-auto.js (new), lib/phase-files.js, tests/modules/test-phase-map-auto.test.js (new)]
    depends_on: [PT2_phases_tagged_by_system_repo]
    specs: [idearium/spec/idearium.repo-roadmap.spec, docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec]
    does: "no model: each phase's files from what it declares, real paths in its words, code names it mentions (the file that defines them) and hyphenated module names; each with its evidence; one hop of requires and consumers; the phases it waits on through shared files; the specs that own the files. 'none' only when nothing names a file."
    proof: "test-phase-map-auto MA-01..06 on a fixture project; MA-08 on Nexus: 1,496 phases in under a second of mapping"
  MP2_automatic_in_every_repo:
    status: DONE (0.60.65)
    systems: [idearium, core, loom]
    files: [idearium/repo/phases.js, idearium/api/index.js, idearium/ui/js/phases.js, loom/maps/build-surface-map.js, loom/maps/one-idearium-map.js]
    depends_on: [MP1_nexus_maps_every_phase]
    specs: [idearium/spec/idearium.repo-roadmap.spec, idearium/spec/nexus-repository-system.spec, loom/spec/loom.spec]
    does: "the Phases view of any repo (Nexus: the live tree; a project: its own files) carries each phase's mapping, cached by the maps' text; a phase never seen before in a repo is announced (idearium.phase.mapped) with what it was mapped to; the phase detail shows mapped files with why, requires, used by, waits on, specs. James's maps are never rewritten."
    proof: "MA-07: a project's Phases view carries the mapping; a phase added later is announced as new and mapped"
  MP3_builds_get_the_mapped_context:
    status: OPEN
    systems: [idearium, core]
    files: [idearium/api/index.js, lib/repo-prompt-blocks.js, lib/build-context.js, lib/phase-map-auto.js]
    depends_on: [MP2_automatic_in_every_repo, SF1_intent_blocks]
    specs: [idearium/spec/idearium.spec, docs/2026-10-15-automatic-tracking-phasemap.spec]
    does: "a phase build's brief carries its mapping (files with their current lines, requires, consumers, specs) as an editable prompt block (when: build), so the agent starts with the context instead of finding it with tools. This is the automatic-tracking map's CX1, fed by MP1."
    proof: "a build of a mapped phase sends its files and consumers in the first request; tool calls per phase (AG1a's count) drop on the same phase"
  MP4_a_model_only_where_nothing_maps:
    status: OPEN
    systems: [idearium]
    files: [idearium/repo/phase-mapping.js, idearium/api/index.js]
    depends_on: [MP2_automatic_in_every_repo]
    specs: [idearium/spec/idearium.repo-roadmap.spec]
    does: "the 0.60.29 Map phases flow asks a model only for phases MP1 left 'none', scored as before; accepting a mapping writes files:/depends_on into the map through the repo layer or the apply gate."
    proof: "a run sends no request for a phase MP1 mapped"

# file -> what it requires (real, measured 2026-10-15) and who consumes it. Each becomes a loom wire when its phase lands.
file_dependencies:
  idearium/api/index.js: {requires: [lib/repo-agent.js, lib/pipeline-routing.js, lib/repo-prompt-blocks.js, lib/repo-inject.js, lib/spec-document.js, idearium/compiler-bridge.js, idearium/spec-engine/warp-build-dispatch.js (dynamic import)], consumers: [autopilot (spawned), every Idearium page]}
  idearium/spec-engine/warp-build-dispatch.js: {requires: [lib/seam/adapters/warp-cascade.js, warp/plugins/crystallizer-flatfile.js, warp/dispatch/population.js, idearium/spec-engine/chunk-dispatch.js, lib/extract-code.js], consumers: [idearium/api/index.js]}
  lib/seam/adapters/warp-cascade.js: {consumers: [idearium/spec-engine/warp-build-dispatch.js, lib/seam/index.js]}
  lib/repo-agent.js: {requires: [lib/pipeline-routing.js, lib/repo-prompt-blocks.js, lib/repo-inject.js], consumers: [idearium/api/index.js, idearium/api/build-surface.js, lib/repo-agent-node.js]}
  lib/pipeline-routing.js: {consumers: [idearium/api/index.js, lib/repo-agent.js, lib/phase-faults.js, lib/model-door.js, lib/agent-record.js]}
  lib/repo-prompt-blocks.js: {consumers: [idearium/api/index.js, lib/repo-agent.js, lib/repo-inject.js]}
  lib/repo-inject.js: {consumers: [idearium/api/index.js, idearium/repo/code-api.js, lib/repo-agent.js]}
  lib/spec-document.js: {consumers: [idearium/api/index.js, idearium/repo/spec-plan.js]}
  idearium/compiler-bridge.js: {requires: [emerge/compiler/index.js], consumers: [idearium/api/index.js]}
  emerge/compiler/index.js: {consumers: [idearium/compiler-bridge.js, cli/diagnose.js]}
  copilot/lifeline.js: {consumers: [cortex/core/raid/officiator.js, cortex/core/raid/contract-intake.js, lib/hat-forge.js, lib/agent-tools/tools/coordination/*, clear-glass/src/mesh/agent-mesh.js, and 7 more (14 files)]}
  cortex/core/raid/officiator.js: {requires: [copilot/lifeline.js, cortex/core/raid/index.js, cortex/core/raid/contract-intake.js], consumers: [orchestrator/orchestrator.js]}
  cortex/core/raid/contract-intake.js: {requires: [copilot/lifeline.js], consumers: [idearium/api/index.js, cortex/core/raid/officiator.js, and 8 more (10 files)]}
  lib/intent-classifier.js: {consumers: [lib/reasoning-route.js, and 6 more (7 files)]}

order: "WB0 → WB1 → WB2 (warp first: he asked 'make sure'); SF1 → SF2 → SF3 → SF4; IS1 after SF1. PT1, PT2 (0.60.63-64), MP1, MP2 (0.60.65) done first. Next: MP3 (needs SF1), MP4. Each phase: backend → route → command → UI."

## ADDENDUM 2026-10-15 — 0.60.63 PT1: in Idearium's phases, files and dependencies mapped, specs tagged per phase
# James: "can you make sure those are added to the phases in idearium. make sure all of the files and dependancies are mapped. and i want the specs to tagged per phase"
# Found: Idearium's Phases tab already reads every docs/*phasemap*.spec through loom (loom/scanners/phasemap-map.js →
# idearium/repo/roadmap.js), so this map was already listed — but with systems GUESSED from prose (WB0 read as cortex,
# WB1 as guardian), no files, and no place for specs. Now each phase declares systems, files (real paths; "(new)" where
# a phase creates one), depends_on and specs; file_dependencies lists each file's measured requires and consumers (to
# become loom wires as each phase lands); loom's reader and Idearium's roadmap carry `specs`, and the phase detail shows
# them. Coder's reading (to confirm): "tagged per phase" = each phase names the specs that own it; a spec an agent
# writes under SF3 is tagged with the phase that asked for it.

## ADDENDUM 2026-10-15 — 0.60.64 PT2: phases tagged by system / nested repo
# James: "phases tags by system/nested repo"
# Found: each Nexus system is a nested repo in Idearium, and its Phases tab already lists the phases tagged for it (the
# "<system>'s only" filter, on by default). But a phase's tags came from a hand-written systems line or a guess from its
# prose — WB0 creates lib/ files and edits a cos/ spec yet was tagged idearium/cortex/copilot. Now loom also tags a phase
# with the owner of every file it names (ownerOf); this map's systems lines were corrected to match. Across all maps:
# 429 phases move from guessed to file-owned tags, 72 declared phases gain one. Coder's reading (to confirm): "nested
# repo" = the per-system repos inside Idearium's Nexus repo, one per system in lib/nexus-self/systems.js.

## ADDENDUM 2026-10-15 — 0.60.65 MP1 + MP2: Nexus maps every phase, in every repo, with no model
# James: "Merge with main. Then look at the recent spacs for idearium. And begin on the pipeline. The speccing, mapping, listener. It doesn't know how to map. Nexus needs to generate dependancies for each phase, with files. The agent keeps having to find context, with tools.  Need them all mapped. Need that be automatic for every new phase from any project. Look at the new spec per module phase from main"
# Read first: main's newest Idearium maps (code-tab run state, gate-held work) and CS2 "spec the unspecced" (capability-
# specs map, still OPEN — the "spec per module" phase). And the 0.60.29 mapper (idearium/repo/phase-mapping.js): it asks
# a model for every phase and writes only when the model scores well — the evidence already in each phase was never used.
# Measured on Nexus: 898 open phases, 436 name files, 196 name real paths in their words, 266 nothing.
# Built: MP1 (lib/phase-map-auto.js) maps from evidence — after it, open phases with no file evidence fall from 462 to
# about 198 (one try with single words reached 41, but they matched files the phase did not mean — "guardian",
# "listener"; dropped, said here). MP2 makes it automatic in every repo's Phases view and announces new phases.
# Coder's reading (to confirm): "listener" = a new phase is mapped the moment any repo's phases are read and announced
# as an event — not a file watcher. MP3 (builds get the mapped context) is the part that stops agents hunting with
# tools; it needs SF1's intent blocks.
