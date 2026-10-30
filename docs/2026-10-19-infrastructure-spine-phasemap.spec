# Infrastructure: the component registry as the spine, quotes out of the code, the tree slimmed, built for any size (2026-10-19)

James, 2026-10-19: "we need to do infrastructure work soon also. clear out old files. reduce the size, maybe move my quotes to a
map or something so it doesn't have to be in the files. migrate each system to the component registry as a spine, and remove the
old wiring." · "then when making changes, only need to rewire the component registry, like in architect, a mirror of the
registry?" · "make sure the spec workshop and phasemaps all have dag. ids, names for each file, mapped to the component registry,
etc." · "remember that this is to build any size codebase."

The coder's reading, to confirm: the registry becomes the one place wiring is written; loom, architect and the build read it.
Today every change also hand-writes rows into loom/maps/*.js (FILES + CONSUMERS) — that is the "old wiring" to retire, not the
real require edges (loom/scanners/source-map.js already reads those from the code).

## Ground truth (measured 2026-10-19 in the uploaded tree)

- 94 MB without node_modules/.git: clear-glass 20 MB, docs 9 MB, lib 6.7 MB, idearium 6.3 MB, guardian 4.5 MB, cos 4.3 MB.
- 376 CHANGELOG-*.md at the root (2 MB). README.md is 9,363 lines, generated (scripts/generate-atlases.js).
- ~1,540 inline quotes of James in lib/, idearium/, guardian/, cortex/ comments (pattern `James, <date>: "…"`); 836 lines in
  lib/*.js mention him.
- Registries that exist: lib/component-registry.js (runtime components per system), lib/project-registry.js (CR1: a built
  project's spine over lib/component-store.js), lib/hook-registry.js, lib/capability-registry.js, loom (combined registry,
  bootstrap from real requires + hand maps). Hand maps: loom/maps/*.js, appended by every release.
- architect: "Hook Registry (read view — loom owns writes)" at boot — already a read mirror of one registry.
- Scale today: node registry scan linear (0.60.170, 12k nodes < 1 s); phase DAG 1,744 phases in ~0.5 s (0.60.172); still whole:
  idearium nexus-self sync (70 s at 18:50), loom bootstrap, JAA whole-table rewrites in the shared cortex store.

## Phases. Order of delivery per phase: backend → route → command → UI. Nothing deleted (§0.3): out of the tree = archived + in git.

phases:

  IN0_baseline:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [scripts/tree-census.js]
    does: >-
      Measure before cutting: size per system and per folder, file counts, the largest files, generated files, files nothing
      requires and no route/spawn/map names (loom capability + source maps), inline-quote count per file. Written as a dated
      report so every later phase shows its before → after.
    proof: the report lists the numbers above; a second run after IN1 shows the drop

  IN1_old_files_out:
    layer: foundation
    status: OPEN
    depends_on: [IN0_baseline]
    files: [scripts/tree-census.js, _archive/]
    does: >-
      From IN0's "nothing reaches it" list, propose (never silently) moving dead files, the root CHANGELOG-*.md (into
      docs/changelogs/<minor>/), old atlases and _archive/ folders out of the working tree into one archive commit + a release
      zip. History stays in git and Versionium, so the move is lossless. James approves the list in batches.
    proof: size drop measured by IN0; the full suite and a boot unchanged

  IN2_quotes_ledger:
    layer: foundation
    status: OPEN
    depends_on: [IN0_baseline]
    files: [docs/quotes/, scripts/extract-quotes.js, scripts/generate-atlases.js]
    does: >-
      His quotes leave the code: one ledger (docs/quotes/YYYY-MM.jsonl: id Q-YYYYMMDD-NNN, date, verbatim text, context, the
      files/phases it drove). A script extracts `James, <date>: "…"` from comments, writes the ledger and replaces the comment with
      `[Q-…]`; the atlas, the competency record and the Code surface render the quote from the ledger. Changelogs keep his words
      verbatim (they are the record). Proposed per system for review; a quote whose extraction is ambiguous stays put, said.
    proof: every `[Q-…]` resolves; no quote text lost (ledger count = extracted count); the source shrinks

  IN3_registry_is_the_spine:
    layer: library
    status: OPEN
    depends_on: [IN0_baseline]
    files: [lib/component-registry.js, lib/project-registry.js, lib/component-store.js, loom/bootstrap.js]
    does: >-
      One registry shape for Nexus's systems and built projects alike: every file is a component with an id (comp_id + UUID, as
      headers already carry), a name, its system, its exports, and its edges (requires, routes served/called, spawns, events).
      Real require edges come from the code (source-map scanner); only edges code cannot show (HTTP, spawn, postMessage) are
      declared — in the registry, next to the component, not in a separate hand map.
    proof: for one system the registry reproduces every edge loom holds today (diff empty)

  IN4_retire_hand_maps:
    layer: library
    status: OPEN
    depends_on: [IN3_registry_is_the_spine]
    files: [loom/maps/, loom/bootstrap.js]
    does: >-
      loom/maps/*.js stop growing: loom reads the registry. Each map is retired when IN3's diff for its files is empty (archived,
      not deleted). A release no longer appends FILES/CONSUMERS rows; wiring a change = editing the registry entry.
    proof: loom's component/hook/wire counts unchanged after a map is retired; verify-wires passes

  IN5_architect_mirrors_the_registry:
    layer: interface
    status: OPEN
    depends_on: [IN3_registry_is_the_spine]
    files: [architect/service.js, architect/src/ui/]
    does: >-
      His "a mirror of the registry": architect shows the registry live (systems → components → edges) and edits it — an edit is a
      registry proposal (through the approval gate), never a direct code change; loom, the build and the DAG read the result.
    proof: rewiring one edge in architect changes the registry, loom's map and the next build's context, with no other file touched

  IN6_systems_onto_the_spine:
    layer: integration
    status: OPEN
    depends_on: [IN4_retire_hand_maps]
    files: [orchestrator/, guardian/, idearium/, copilot/, intelligence/, loom/, versionium/, diagnostic/, architect/, cortex/, ollama/, clear-glass/]
    does: >-
      System by system (smallest crossing count first: ollama, architect, loom …): its registry-components.js becomes a view of the
      spine; old wiring for it (hand-map rows, duplicate registrations) retired. Joins the sovereignty work (SS1–SS4 in
      docs/2026-10-19-pipeline-root-causes-phasemap.spec) and MEM1 (each system its own live data, cortex keeps the books).
    proof: per system, lib/system-boundary.js crossings do not rise; its tests and boot unchanged

  IN7_every_phase_and_spec_on_the_spine:
    layer: library
    status: OPEN
    depends_on: [IN3_registry_is_the_spine]
    files: [lib/phase-dag.js, lib/phase-plan.js, idearium/repo/phase-mapping.js, idearium/spec-engine/]
    does: >-
      His "spec workshop and phasemaps all have dag. ids, names for each file, mapped to the component registry": a phase (and a
      spec section) is complete only with depends_on (DG3), files named, and each file mapped to a registry component (existing
      id, or a new id assigned at plan time); the spec workshop shows the same DAG and refuses a spec section with no files/ids.
      Nexus's own maps brought to the standard is DG4.
    proof: DG3's census for Nexus: 0 cycles, 0 dangling, 0 undeclared; every open phase's files resolve in the registry

  IN8_any_size:
    layer: foundation
    status: OPEN
    depends_on: [IN0_baseline]
    files: [idearium/repo/nexus-self.js, loom/bootstrap.js, lib/jaa-store.js, idearium/repo/import-pipeline.js]
    does: >-
      "this is to build any size codebase": every whole-tree operation becomes incremental (only what changed since its last
      hash), streamed, and yields to the event loop; each has a budget and says when it exceeds it. Targets from the log:
      nexus-self sync (70 s), loom bootstrap, JAA whole-table flushes (append mode, per-system stores), import of a large repo.
    proof: a synthetic 100k-file repo imports, maps and builds a DAG without a /health miss

## ADDENDUM 2026-10-19 — neutral core, adapters, explicit evidence, a schema for everything reusable

James, 2026-10-19: "would this be agnostic in domain, language, all ways? scale?" · then, adopting a reviewer's qualification: "make
the core domain-neutral now, but don't make the feature pilot wait for a grand adapter framework. Establish the boundary and prove
it with two small adapters before expanding it." · "the components in the component registry can be any language. for idearium to
build any project, anyone can unnderstand, and it would be immensly stable. all resuable or deterministic code thats architectural,
memory or data storage, or maintains consistency for stability, should have a schema, template or resuable node type or spec file"

### Decision NC0 (recorded, his): neutral core, replaceable interpreters, explicit evidence
- The CORE knows nothing of a language or a domain: the feature/component manifest, the graphs (feature DAG, phase DAG), the
  registry shape, and the proof contract ("run this check → pass | fail | unknown, with evidence").
- ADAPTERS interpret: a language adapter (parse, symbols/exports, dependencies, tests, build) and a domain adapter (what a component,
  an edge and a proof are in that domain).
- A generic representation is not generic verification. An adapter that cannot discover an edge or prove a claim says `unknown`
  with why; unknown never counts as complete. Each edge and verdict carries its evidence source: `discovered` (by which adapter),
  `declared` (by whom), or `unknown`.
- Registry components may be any language: each carries `language` and `adapter`, and its edges carry their evidence source.

phases:

  NC1_neutral_core_boundary:
    layer: foundation
    status: OPEN
    depends_on: [IN3_registry_is_the_spine]
    files: [lib/core/manifest.js, lib/core/proof.js, lib/phase-dag.js, lib/project-registry.js]
    does: >-
      Draw the line in code: manifest (id, name, kind, language, adapter, provides, requires, components, proof, version, status),
      the proof contract (pass | fail | unknown + evidence), and the evidence field on every edge. phase-dag.js is already neutral
      (it reads phasemap text); verify-first, coder-brief and loom's source-map are the JS-shaped parts that move behind adapters.
    proof: lib/core/* requires nothing language-specific (a test greps its imports); unknown is a distinct verdict end to end

  AD1_adapter_contract:
    layer: foundation
    status: OPEN
    depends_on: [NC1_neutral_core_boundary]
    files: [lib/adapters/contract.js]
    does: >-
      The minimum interface, nothing more: detect(root) → applies?; parse(file) → ok | error; symbols(file) → exports;
      dependencies(file) → edges with evidence; test(target) → proof verdict; build(root) → proof verdict. Any method may answer
      unknown. Expanded only when a second real adapter needs it (no grand framework).
    proof: a conformance suite any adapter runs; the JS adapter passes it

  AD2_javascript_adapter:
    layer: library
    status: OPEN
    depends_on: [AD1_adapter_contract]
    files: [lib/adapters/javascript.js, lib/verify-first.js, lib/coder-brief.js, lib/phase-plan.js, loom/scanners/source-map.js]
    does: >-
      Wrap, do not rewrite: node --check, phase-plan exportsOf/checkChunk, loom's require/import scanner, cos/testenv/run-target, the
      package.json stack read. verify-first and coder-brief call the adapter instead of the JS code directly.
    proof: verify-first, chunked/contract build and coder-brief suites unchanged; the conformance suite passes

  AD3_python_adapter:
    layer: library
    status: OPEN
    depends_on: [AD1_adapter_contract]
    files: [lib/adapters/python.js]
    does: >-
      Small on purpose: `python -m py_compile` for parse; top-level def/class and __all__ for symbols; import statements for
      dependencies (relative and package); pytest or unittest for tests. What it cannot see (dynamic imports, plugins) is unknown.
    proof: the conformance suite; a small real Python repo's edges and test verdicts

  AD4_documents_adapter:
    layer: library
    status: OPEN
    depends_on: [AD1_adapter_contract]
    files: [lib/adapters/documents.js]
    does: >-
      The non-code domain: Nexus's own specs and phasemaps as documents — a component is a section, an edge is a reference (a phase
      key, a file path, a spec link), proof is a declared check (every reference resolves; the DAG standard; required fields present).
    proof: the conformance suite; Nexus's spec set read with its references and their verdicts

  NT1_neutrality_test:
    layer: integration
    status: OPEN
    depends_on: [AD2_javascript_adapter, AD3_python_adapter, AD4_documents_adapter]
    files: [tests/modules/test-neutrality.test.js]
    does: >-
      The acceptance criterion: the same orchestration (registry → graph → verify → plan) runs on a Python repository and on Nexus's
      spec documents with the core UNCHANGED — only adapters and domain proof definitions differ. A core change needed to pass = the
      boundary is wrong, fix the boundary. Only after this passes are more adapters added (tree-sitter / language servers for breadth).
    proof: the test diffs lib/core/* against the commit before it ran — empty

  FP1_feature_pilot:
    layer: integration
    status: OPEN
    depends_on: [NC1_neutral_core_boundary, AD2_javascript_adapter]
    files: [features/verify-first.feature.json, features/phase-dag.feature.json, features/file-manager.feature.json]
    does: >-
      Not waiting for NT1 (his qualification): three features as manifests on the neutral core — verify-first, the phase DAG, the
      file manager — mostly generated from the registry and specs, intent and requires written by hand. The feature DAG and the phase
      DAG must agree. Phases name the feature they move (feature = the unit of spec; phases change features).
    proof: the three manifests validate against the schema; their requires match the phase DAG; their proof runs green or says unknown

  SC1_scaling_limits_named:
    layer: foundation
    status: OPEN
    depends_on: [IN8_any_size]
    files: [lib/phase-dag.js, lib/jaa-store.js, loom/bootstrap.js, idearium/repo/nexus-self.js]
    does: >-
      Explicit limitations, each with its incremental remedy and a budget: phase reachability precomputed for all (fine at 1.7k,
      not 100k → on demand / bitsets) · whole-table JSON rewrites (→ append mode, SQLite, per-system stores) · full-tree rebuilds
      (nexus-self sync 70 s, loom bootstrap → by hash) · version conflicts (one version per feature per repo; resolve only at
      repo boundaries).
    proof: each limit has a test at its budget; exceeding it is said, never silent

  ST1_schema_for_everything_reusable:
    layer: foundation
    status: OPEN
    depends_on: [IN0_baseline]
    files: [lib/node-schemas/, loom/templates/, architecture-spec/, idearium/spec-engine/templates/genesis.spec]
    does: >-
      His rule: "all resuable or deterministic code thats architectural, memory or data storage, or maintains consistency for
      stability, should have a schema, template or resuable node type or spec file." Census every module of those kinds (stores,
      registries, gates, schedulers, ledgers, watchers, adapters) and name, for each, its schema (lib/node-schemas/, 68 today), its
      template (loom/templates/, architecture-spec scaffold, genesis.spec) or its spec — or the gap. New ones are generated from the
      template; a module of these kinds without one is flagged by the census. Language-neutral: the schema and template describe the
      component, not JS.
    proof: the census lists 0 unexplained gaps; a new store/registry built from its template passes its schema

## ADDENDUM 2026-10-19 — phases as nodes per system; phases checked against Nexus; a change entry for every event

James, 2026-10-19: "splitting up all the phasemaps in nexus to their respective system, and into .phase nodes for each phase, and
.dag bundled in?" · "did you make a way to check the phases in relation to nexus. also every contract, file change, diff, phase
completed needs a changelog for versionium?" · "yes, then handoff"

Measured 2026-10-19: 1,780 phases in 151 maps (3.3 MB); 744 tagged with one system, 1,036 (58%) span systems; 141 of 151 maps span
systems. Against the tree: 889 phases name no files; 19 of 394 done phases name files that are missing (e.g. T7
tests/modules/test-cos-testenv-vm.js; some are globs); 367 of 492 open phases name only files that already exist (candidates, not
proof, of SP5-class "already done"). Versionium: every applied agent diff is its own labelled version (kind, inject, run, by, path,
checksums); contracts write nothing to Versionium; a proven phase records a row, not a version entry; changelogs are hand-written
per release only.

phases:

  PN1_phases_to_nodes:
    layer: foundation
    status: OPEN
    depends_on: [ST1_schema_for_everything_reusable]
    files: [scripts/phasemaps-to-nodes.js, lib/node-schemas/schema.phase, lib/node-schemas/schema.phasemap]
    does: >-
      One deterministic script, run as a PROPOSAL: every phase → <owner-system>/phases/<map-id>/<phase-id>.phase (schema.phase;
      Windows-safe names via node-export fileIdOf); every map → one .phasemap narrative node (intent, ground truth, decisions, his
      quotes or their [Q-…] refs, the phase ids it holds). Owner = the system of the phase's primary changed file or the one it is
      declared for; the others go in `touches:`. Because the system tags are a heuristic, an ownership report lists every
      cross-system phase with its proposed owner for James to correct — never decided silently. Do it alongside DG4 (pipeline map)
      so the 3 cycles, 25 dangling and 525 missing depends_on are fixed once, during the move.
      The .phase holds what is AUTHORED (depends_on, files as registry ids, status, proof, feature, quotes). The DAG slice is
      DERIVED: it lives in a .graph node keyed by the DAG hash, regenerated when the hash changes, a stale one detected — not
      bundled into 1,780 files that would all go stale on one edit.
    proof: every phase has exactly one .phase; the ownership report covers all 1,036 cross-system phases; schema-valid

  PN2_dual_read:
    layer: library
    status: OPEN
    depends_on: [PN1_phases_to_nodes]
    files: [lib/phase-dag.js, idearium/repo/phases.js, loom/scanners/phasemap-map.js]
    does: >-
      The DAG, the build and the Phases view read nodes first, text maps second; a check compares both and must produce the SAME DAG
      hash. A mismatch is said with the phases that differ.
    proof: DAG hash from nodes == DAG hash from text for all of Nexus

  PN3_maps_rendered_from_nodes:
    layer: library
    status: OPEN
    depends_on: [PN2_dual_read]
    files: [scripts/render-phasemaps.js, idearium/spec-engine/]
    does: >-
      The readable phasemap becomes output: .phasemap narrative + its .phase nodes → the map text. The original texts archived (§0.3).
      New phases are born as nodes (spec workshop, promote-idea IM2), never hand-typed into a map. Each system's view: its own
      phases plus the ones that touch it.
    proof: re-rendered maps round-trip to the same nodes; a phase added in the spec workshop appears in its map and the DAG

  PRC1_phase_reality_check:
    layer: library
    status: OPEN
    depends_on: []
    files: [lib/phase-reality.js, lib/phase-dag.js, lib/verify-first.js, lib/project-registry.js, idearium/api/index.js]
    does: >-
      "check the phases in relation to nexus": every phase's status against evidence in the tree — consistent · drift (done, but its
      files are missing or its proof fails) · maybe-done (open, but verify-first passes on its files: SP5's class) · uncheckable (no
      files named — the DG3 standard forbids it) · orphaned (a file not in the registry, an owner system that does not exist).
      Census route + command (`repo reality <repo> [phase]`), a Toolbox section (TB1), and the verdicts feed the change entries (VC1).
      Unknown stays unknown (decision NC0).
    proof: on Nexus: the 19 done-with-missing-files named (globs told apart); maybe-done candidates listed with their verify-first verdicts

  VC1_a_change_entry_for_every_event:
    layer: library
    status: OPEN
    depends_on: []
    files: [lib/change-entry.js, lib/node-schemas/schema.change, lib/repo-versions.js, cortex/core/raid/contract-gates.js, idearium/api/index.js]
    does: >-
      A .change node per event — file change, diff, contract pass/fail, phase completed/proven, restore, release: what (diff stats,
      files as registry ids), why (quote [Q-…], phase, idea, feature), who (agent, person, verify-first), evidence (tests, verdicts),
      links (phase, contract, Versionium commit). Built from records that already exist (Versionium labels, gate evidence, proof rows,
      change-record) with no model; an optional one-line summary by a local model is marked as such. The Versionium commit message is
      the rendered entry; contracts and phase completions start writing to Versionium.
    proof: one SP5 build yields entries for its diff, its contract gates and its proof, each linked to the commit

  VC2_changelogs_rendered:
    layer: interface
    status: OPEN
    depends_on: [VC1_a_change_entry_for_every_event, IN2_quotes_ledger]
    files: [scripts/render-changelog.js, idearium/ui/js/repo-versions.js]
    does: >-
      Changelogs become views over .change entries: per repo, per feature (FP1), per phase, per release (the release changelog a
      roll-up, his words linked from the quote ledger). The 376 root changelogs move under docs/changelogs/ (IN1) and stop being
      hand-written.
    proof: the 0.60.172 changelog rendered from entries matches the hand-written one's facts

## ADDENDUM 2026-10-20 — PN1's layout in use for spec'd maps (PS1)
James, 2026-10-20: "specs, then phases then specced again with dag and related files for it, look at the handoff"
emerge/compiler/phase-specs.js (docs/substrate.spec MOD-PHASE-SPECS, 0.60.176) writes PN1's layout for any map whose phases name a
spec: <owner>/phases/<map-id>/<phase>.phase (authored) + graph/<phase>-<hash>.graph (derived, with the DAG slice — pipeline-nodes
graphNode now keeps it). Done for the two 2026-10-20 maps. PN1 proper (all 149+ maps, the ownership report, PN2/PN3 reading nodes
first) stays open; this is its first real use.
Found: the boundary ratchet (tests/modules/test-system-boundary.test.js SB-06) is red since the 0.60.170–172 overlay: lib/phase-dag.js →
loom/scanners/phasemap-map.js and lib/verify-first.js → cos/testenv/run-target.js are new upward crossings (lib reaching into a
system). Not fixed here; each needs a route or a move (§5.9).

## ADDENDUM 2026-10-21 — his decision: each system uses its own component registry

James, 2026-10-21, after the coder answered that the spine should come after Idearium is solid: "each system will use its own component
registry."
- **His decision.** Not one central registry that every system writes into: each system owns its own component registry, in one shared
  shape. It sharpens IN3 ("one registry shape"), which the coder had read as one registry. The shape stays shared; the instance is per
  system. Loom, architect and the build read across them.
- **It agrees with what is partly built.** DB9 generates a registry per system (lib/drawbridge-registry.js `registryOf(system)`, 0.60.127),
  and P33 is "every system runs its node registry". When the spine is built through Idearium, IN3 and DB9 build to this.
- **Order unchanged.** His priority is Idearium solid first (docs/2026-10-10-idearium-solid-phasemap.spec, addendum 2026-10-21).

## ADDENDUM 2026-10-21 — his decision: the registry a build stands on is the spine, the event bus, the interaction contract and the component registry

James, 2026-10-21. SP5 was refused for a missing atlas.json; he asked "what does it need an atlas for?", then "shouldn't that be the
component registry. architecture tab". The coder built 0.60.197 (the snapshot records the registry as well) and asked whether the
registry should replace the atlas as what a build requires. His answer: "yes, the registry should be the spine, event bus, interaction
contract, and component registry."
- **His decision.** A build requires the registry, not the atlas. The registry is four things, one record:
  1. the **component registry**: every file a component (id, layer, type, exports);
  2. the **spine**: the wires between components (require edges);
  3. the **event bus**: every event, who emits it and who consumes it;
  4. the **interaction contract**: what each component serves to the outside (routes, CLI commands). Ports and health checks, which
     docs/INTERACTION_CONTRACTS.md also names per system, are not read from a repo's code today; said, not invented.
- **Grounding (§8.6, read from the code).** idearium/repo/architecture.js already extracts all four from the code-intel cards:
  components, wires, events with emittedBy/consumedBy, routes and cli. The planner already reads it (idearium/api/index.js
  `PP.registryOf({ architecture, … })`). Nothing in the build reads atlas.json; the planner's "atlas" is README text. The gate
  demanded a file the build never uses.
- **What stays.** atlas.json is still recorded on every snapshot (§0.3), and snapshots that are not a build (every change, VR1;
  import baselines) keep their existing gate, so older repos keep their history.
- It is IN3 ("the registry is the spine") made concrete at the repo scale. IN3 for Nexus's own systems stays open, per system (his
  decision earlier today: each system its own registry, one shape).

phases:

  IN3a_build_stands_on_the_registry:
    layer: library
    status: DONE 0.60.198 — test-pipeline-root-causes RC-16, RC-18
    depends_on: []
    files: [idearium/repo/snapshot.js, idearium/api/index.js, idearium/ui/js/app.js]
    spec: idearium/spec/idearium.repo-snapshot.spec
    does: >-
      registryVersion carries the four parts, each with its own sha256 and counts (components, spine, eventBus, contract) and one
      overall hash. A phase build requires it: no registry → the import pipeline runs once (0.60.196), the snapshot is taken again;
      still none → refused NO_REGISTRY, said on the run. The Versionium list shows the four counts.
    proof: RC-16 (an unindexed repo gets a registry with all four parts), RC-18 (the build gate reads registryVersion, not atlas.json)

# ── ADDENDUM 2026-10-23 — the spine is also the bridge between compartments (his decision) ─────────────────────────────────────
# Context: he described COS as the orchestrator, where each Nexus system is a compartment. A compartment's front end is its HTML, or a
# simulated OS (the QEMU/Debian machine COS already boots). The component registry is the event bus and the bridge to the compartment's
# back end, whether that is an OS's SSH connection or a system's server.js, and an interaction contract governs how systems interact.
# On top of that: snapshots and rewind per compartment, performance monitoring and load balancing, deploying from templates,
# spawn/despawn, per-compartment resource caps, and benchmark branches run in parallel. The coder answered with a census of what
# exists (cos/kernel.js, manager.js, compartment/qemu-runtime.js, watchdog/monitor.js, foundation/snapshot.js, archetype/nexus-system.js;
# testenv T1–T7 done; SN, CE and IN not built).
# James, 2026-10-23: "Yeah, this is the, it's, so, oh God. Some shit just like slotted together in my head. ... that's very elegant.
# Because the component registry is the spine for each system, then it would also be the bridge for each compartment."
# Decided (his): one registry, read from inside a system as its spine and from outside as the bridge to that system's compartment.
# There is no second protocol between compartments. Its four parts, recorded since 0.60.198 (components, spine, event bus, interaction
# contract), are what one compartment knows of another; COS checks a compartment's registry before connecting (CE0c's handshake,
# 2026-10-18, already reads it that way for the Debian terminal).
# What it changes: the COS spine map, to be written, builds on IN3/IN6 (the systems onto the spine) and on CE (the handshake) rather
# than adding a separate bridge layer.
# To confirm: (1) which slice comes first; (2) the coder's reading of "hook into the actual threads, PID or IO" is that COS owns each
# compartment's process tree so it can measure and cap it (Windows Job Objects on his PC; QEMU limits for machines), not that it
# reaches inside a running program's threads.

# ADDENDUM 2026-10-29 (0.60.286) — slices of IN3, AD1, AD2 and AD4 built for the project tools; the phases stay OPEN
# James, 2026-10-29, uploading Emerge.zip: "refactor tool for the architecture to use the component registry as the spine, decomposition tool for
# breaking up each component into it's own file and wire it into the spine." Map: docs/2026-10-29-finish-any-project-phasemap.spec (FA0–FA10).
# - IN3 (the registry is the spine), for built projects: lib/project-spine.js writes each project's registry as nexus.spine.json — every component,
#   every wire with its evidence (discovered by which adapter / declared / unknown); declared edges kept across rescans. Nexus's own systems are not
#   moved onto it yet: IN3's proof (one system's registry reproducing loom's edges) is still open.
# - AD1: lib/adapters/contract.js — forFile, parse / units / symbols / dependencies, and a conformance check. Open: the conformance run over the old
#   JS paths (verify-first, coder-brief) and NC1.
# - AD2: lib/adapters/javascript.js wraps code-intel (structure, decls, text) and node --check. Open: verify-first and coder-brief moved behind it.
# - AD4: lib/adapters/documents.js (markdown sections, the files a document names). Open: references between Nexus's own specs and phasemaps.
# - Not in the plan before, built because Emerge needed it: lib/adapters/emerge.js (.eg: use, fn, kind, component …; parse answers unknown).

# ADDENDUM 2026-10-30 — his direction: the system registry migrates to loom
# James, 2026-10-30, after the coder reported where decoupling stands (1,095 cross-folder requires: 695 into lib, 250 lib up into a system,
# 150 system to system; 11 of 15 systems with a registry-components.js, routes only; IN3–IN6 OPEN) and proposed lib/system-registry.js as
# the system registry the per-system registries roll up into: "loom was supposed to be the system builder, and meta system. i feel it should
# migrate to loom"
# - The record agrees with him. loom's own registry-components.js header: "THE registry authority — builds and maps NEXUS". The loom atlas:
#   "the sovereign source of truth for how NEXUS's components, hooks, and wires connect". lib/system-registry.js (2026-09-06) is a
#   read-only aggregator, written "matching loom's own proven read-only-aggregator pattern" (its header): it was built as a loom scanner
#   in all but its folder.
# - What moves (the coder's reading, to confirm): the system registry (each system, its components, its edges, its registry-components.js
#   rolled up) is loom's, and is built by loom. IN3's "registry" is loom's registry, not a new one in lib; IN4 (loom reads the registry) becomes
#   loom IS the registry.
# - The problem that goes to him (§5.15: one system going down must break no other). lib/system-registry.js is also the address book:
#   get('diagnostic') → its port, used by nexus-status, the healer, data-home, node-registry, compartments, the tunnel and the heartbeat.
#   If the address book lives only behind loom's route, loom down = nobody can find anybody, loom included. Options put to him:
#     (a) split (the coder's recommendation): loom owns and builds the system registry (what each system is, its components and wires);
#         lib keeps only the boot address book (name → folder, port, health route), which loom reads as one of its sources;
#     (b) all of it in loom; each caller keeps the last answer it got and works from that while loom is down.
#   Unanswered at the time of writing; no code moves until he answers.
