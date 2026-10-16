# docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec
# Every build through WARP; agents write .spec files from an injected framework; Nexus collects them; intent-based
# .inject blocks with every setting shown in the repo. Registered in docs/SPEC-REGISTRY.spec. MAPPED; PT1 (specs tagged per phase) built 0.60.63.

origin:
  date: 2026-10-15
  james: >-
    "make sure all builds use warp. also need the agents to use the spec compiler? like the yaml. need to inject a
    framework for generating a .spec file. then need to listen for it to collect it. intent based .inject nodes, with
    full expanded settings in the repos.e"
  james_5: "Use the templates. The genesis by default."
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
    status: "DONE (0.60.67 — CK-255 red: 5 build paths bypass WARP)"
    systems: [core, idearium, cos]
    files: [lib/build-paths.js (new), lib/checks/ck-255-warp-builds.js (new), lib/check-catalogue.js, cos/spec/check-catalogue.spec, tests/modules/test-build-paths.test.js (new)]
    depends_on: []
    specs: [docs/warp.spec, cos/spec/check-catalogue.spec, idearium/spec/idearium.spec]
    does: "lib/build-paths.js: every build path, the call it makes, whether WARP is on it; CK-255 red while one bypasses WARP."
    proof: "today: red, naming phase build, whole-phase brick, officiator, RAID worker"
  WB1_warp_at_the_rung:
    status: "DONE (0.60.73) — lib/warp-rung.js; James chose option 1 (2026-10-16)"
    systems: [idearium, core]
    files: [idearium/api/index.js, idearium/spec-engine/warp-build-dispatch.js, lib/seam/adapters/warp-cascade.js, lib/repo-agent.js, lib/pipeline-routing.js, lib/warp-rung.js (new), tests/modules/test-warp-rung.test.js (new)]
    depends_on: [WB0_census]
    specs: [docs/warp.spec, idearium/spec/idearium.spec, docs/2026-10-15-one-contract-raid-releases-phasemap.spec]
    does: "lib/warp-rung.js wraps RA.dispatch in makeAttempt: cache/population lookup keyed by (repo, file, prompt hash), axiom gate on the injects, retain after the gate passes; the ladder unchanged."
    proof: "an identical brick retained 3x is served from WARP with no agent call; a reply failing an axiom never lands"
  WB2_raid_bricks_and_officiator_through_warp:
    status: "DONE (0.60.73) — CK-255 green on Nexus"
    systems: [cortex, copilot, core]
    files: [cortex/core/raid/contract-intake.js, cortex/core/raid/officiator.js, copilot/lifeline.js, lib/warp-rung.js, tests/modules/test-raid-officiator.js, tests/modules/test-lifeline-ollama-dispatch.test.js]
    depends_on: [WB1_warp_at_the_rung]
    specs: [docs/warp.spec, cortex/spec/cortex.spec, copilot/spec/copilot.spec, docs/raid-warp-verification-phasemap.spec]
    does: "contract-intake _realAgentExecutor and the officiator call through the same wrapper; CK-255 green."
    proof: "CK-255 green on Nexus"
  SF1_intent_blocks:
    status: DONE (0.60.66)
    systems: [idearium, core]
    files: [lib/repo-prompt-blocks.js, lib/context-prereqs.js, lib/repo-agent.js, idearium/ui/js/agent-blocks.js, idearium/ui/settings.html, tests/modules/test-spec-pipeline.test.js (new)]
    depends_on: []
    specs: [idearium/spec/idearium.spec, docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec]
    does: "prompt blocks gain `when: intent:<name>`; dispatch passes the classified intent; Repo > Settings > Agents shows each block's intent, expanded."
    proof: "a spec-intent request carries the block; a build request does not"
  SF2_spec_framework_block:
    status: DONE (0.60.66)
    systems: [idearium, core]
    files: [lib/repo-prompt-blocks.js, docs/spec-compiler.spec, idearium/compiler-bridge.js, tests/modules/test-spec-pipeline.test.js]
    depends_on: [SF1_intent_blocks]
    specs: [docs/spec-compiler.spec, idearium/spec/idearium.spec]
    does: "default block 'spec-framework' (when intent:spec): the spec-compiler YAML skeleton (meta, purpose, axioms, modules with exports, schemas, gates, tests) and the rule: reply with ```yaml spec/<name>.spec. Editable like every block."
    proof: "the block text is the compiler's own sections; edited text is what is sent"
  SF3_collect_the_spec:
    status: DONE (0.60.66 — gate + collect + phase tag; registering in the spec engine is not built, see addendum)
    systems: [idearium, core]
    files: [lib/repo-inject.js, lib/spec-collect.js (new), lib/step-gate.js, lib/step-gates/code.write.step_gate, lib/repo-agent.js, idearium/api/index.js, tests/modules/test-spec-pipeline.test.js]
    depends_on: [SF2_spec_framework_block]
    specs: [docs/spec-compiler.spec, idearium/spec/idea-to-spec.spec, idearium/spec/idearium.spec]
    does: "lib/spec-collect.js: when an .inject lands a *.spec (or yaml with a spec: root) — validate (spec-document check + compiler shape); valid -> registered on the repo's specs and the spec engine, event idearium.spec.collected, tagged with the phase that asked for it; invalid -> errors back to the agent once, said."
    proof: "a planted good reply is collected, registered and tagged to its phase; a bad one returns its errors, nothing registered"
  SF4_compile_on_collect:
    status: DONE (0.60.67)
    systems: [idearium, core]
    files: [lib/spec-collect.js, emerge/compiler/index.js, lib/repo-inject.js, idearium/lib/config-core.cjs, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/app.js, tests/modules/test-spec-pipeline.test.js]
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
    status: DONE (0.60.66 — phase builds; the chat Agent tab still finds context with tools)
    systems: [idearium, core]
    files: [idearium/api/index.js, lib/repo-prompt-blocks.js, lib/phase-map-auto.js, tests/modules/test-chunked-phase-build.test.js]
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

order: "WB0 → WB1 → WB2 (warp first: he asked 'make sure'); SF1 → SF2 → SF3 → SF4; IS1 after SF1. PT1, PT2 (0.60.63-64), MP1, MP2 (0.60.65), SF1, SF2, SF3, MP3 (0.60.66), WB0, SF4 (0.60.67) done. Next: WB1-WB2 (waits on the WARP decision), MP4, IS1. Each phase: backend → route → command → UI."

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

## ADDENDUM 2026-10-15 — 0.60.66 SF1 + SF2 + SF3 + MP3: the spec framework, its listener, and builds that start with their context
# James (continuing the pipeline): "Continue"
# SF1: lib/context-prereqs.js gains the intent `spec` (a request to WRITE a spec, or one naming a .spec file — "does this
#   match the spec?" stays explain); a prompt block can say when: intent:<name>; repo-agent compose() passes the intent to
#   every caller. The Agents settings name an intent block's intent in full.
# SF2: the 'spec-framework' block (when: intent:spec) teaches the spec compiler's own format; its example is checked to be a
#   spec the compiler reads (SP-03), so it cannot teach a broken shape. Editable and switchable like every block.
# SF3: the code.write step gate gains spec_format (lib/spec-collect.js): a .spec whose top key is spec: must satisfy
#   docs/spec-compiler.spec spec_format, else it is refused with exactly what to add. One that lands is collected: its modules
#   and exports on the inject's result, idearium.spec.collected on the bus, tagged with the phase that asked for it (a phase
#   build passes `map::phase` through repo-agent to the reply's injects). Not built (said, §1.2): registering a collected
#   spec in the spec engine or the repo's spec list — the file is in the repo, which is where Idearium reads specs from; and
#   sending the refusal back to the agent for one retry — the reasons are in the reply's refused list, which the person sees.
# MP3: a phase build's request carries the 'build-phase-map' block (editable): the phase's mapped files with why and their
#   exports, requires, used-by, waits-on and specs; a chunked build gets its own file's only, under the small-model budget.
# Found by the run (TRUTH_OVER_COHERENCE): threading the phase broke 9 of 67 test-repo-agent-provider checks ("phase is not
#   defined" — the inject call sits in _finish, not _dispatch); fixed before shipping, 67/67.

## ADDENDUM 2026-10-15 — 0.60.67 WB0 + SF4: the WARP census, and a collected spec compiled
# James: "Next."
# WB0: lib/build-paths.js measures every agent call in the build code and names the function or route it sits in. Today:
#   through WARP — spec-chunk build (direct only when WARP cannot load), codegen plan, new-spec plan, expand;
#   not through WARP — phase build (2 sites), proof repair, draft review, RAID worker brick, officiator synthesis;
#   not builds — the Agent tab chat, the rejection notice. CK-255 (catalogued, runnable: route, `checks run`, Settings →
#   Checks) is red until WB1/WB2 land. Found by the census on its first run: two units I had named from memory
#   ('repo.plan.draft') were really speceng.codegen and speceng.create — the census is why the list is measured, not typed.
# SF4: lib/spec-collect.js compileToProposals runs the spec compiler's T0/T1 (zero tokens) in a temp folder; each file it
#   emits is a PROPOSED .inject (reviewed like any other), a file the repo already has is skipped and named. On request:
#   POST /api/repos/:uuid/specs/compile, `repo compile-spec`, the "compile" button on a collected spec in the Agent tab.
#   At once: specs.compile_on_collect (default off — a scaffold landing unasked is a big change), specs.compile_into.
#   Measured: the compiler's T1 emitted nothing on the test spec (T0 gave the 9-file tree); not investigated here.
# WB1 still waits on James: WARP wraps each build's agent call (the coder's recommendation), or WARP's cascade picks the agent.
# Also found while shipping 0.60.67 (the coder's regression, said): addenda appended as plain text since 0.60.63 broke six
# YAML specs, the check catalogue among them. The added lines are now # comments; test-build-paths BP-05 guards it.

## ADDENDUM 2026-10-15 — 0.60.68 SF4 revised: specs are laid out from the templates, genesis by default
# James: "Use the templates. The genesis by default." (after "So it can spec now?" — the coder had said a compiled spec came
# out as the spec compiler's generic TypeScript package, nothing like a Nexus system)
# Read first: genesis is already Idearium's default system template (speceng.create, GN1 0.39.286); its file tree is the
# nexus-system skeleton (SB31), and lib/file-tree-plan.js plan({ slot }) already slots components into it (slotIn: a registry
# entry plus component / capability / command / event / route / hook nodes each). SF4 now uses that, not a second layout:
# a collected spec's modules ARE the slot (spec-collect slotFromSpec: a module → a component, its exports → its commands).
# Choice of template: the request, the spec's meta.template, then idearium specs.default_template (default genesis);
# compiler and any file-tree template id remain. The components' lib files are listed to build, not stubbed.
# The spec-framework block gains a {template} line (spec-collect templateBrief) and meta.template: genesis in its example.
# Coder's reading (to confirm): "use the templates" = the spec is laid out from Idearium's template catalog (genesis first),
# not that the agent fills a template document's sections.

## ADDENDUM 2026-10-16 — WB1/WB2 built (0.60.73): his decision, and what WARP can and cannot do for an agentic build
# James (2026-10-16), choosing between the two options the coder put to him: "Option 1 (my recommendation): wrap each of
# those agent calls in WARP (its cache, then the axiom gate, then keeping the result), while the build ladder and RAID still
# choose which agent runs." He pasted option 1 back as his choice. Option 2 (WARP's cascade picks the agent) was not taken,
# so RAID stays the one chooser (§9.1).
# Built: lib/warp-rung.js wrap(call, {kind, provider, key, mode, axioms, fresh}) around the 5 bypassing calls: phase build,
# proof repair and draft review (gate mode), the phase planner (cache mode, fresh on a re-plan), the officiator (cache mode,
# hard axiom 'parses-as-contract'), the RAID worker brick (cache mode, fresh on a retry). One provider, one attempt: the ladder
# owns retries. CK-255 green; test-warp-rung WR-01..07, test-build-paths BP-01..05 + BP-03b.
# Found while building (read in source, 2026-10-16), and why gate mode exists: a repo-agent build's work is its side effects
# (tool calls write files; injects land inside RA.dispatch). Replaying the reply text writes nothing, so a cache hit there would
# be a lie. Gate mode retains (WARP learns the gate class) and never serves. Also found: no build caller passes WARP any axioms
# (expand, codegen, spec-chunk build pass none), so WARP's axiom gate has been empty in practice; the officiator's parse check is
# the first real one. Which axioms a build should carry is open (to ask him; the charter's axioms are a candidate).
# Also fixed: this file did not parse as YAML (an unquoted status with ": " at WB0); BP-05 now covers it.

