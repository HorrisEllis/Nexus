# docs/2026-10-31-spec-everything-phasemap.spec — every piece traced to its origin; spec ids and types; one library and one queue; phased only
# The ideas are James's (quoted below); the census, the cut and the order are the coder's. Spec: idearium/spec/spec-library.spec.

origin: >-
  James, 2026-10-31: "Spec it all out. go through the .phases. and spec out everything that is a module, capability, or new component? that
  way we can have every component traced to its origin, and each piece tracked also. like it all builds from the origin as a foundation/core
  like the system.js, which needs the config. map all of whats missing from all of this, to the architecture spec and genesis spec." ·
  "how about anything new, spec, any changes, fixes, or additions is phased only." · "like what if we use spec ids and types, then have a
  queue/library for specs."

status: "MAPPED 2026-10-31. Nothing built by this map."

census: >-
  2026-10-31, main 0.60.320: 1,876 code files in 14 systems; 233 (12%) owned by a spec module, 1,028 (55%) named in a phase, 203 (11%)
  both, 818 (44%) neither. 2,239 .phase files from 207 maps; 460 .spec files. Seven systems have a server.js (copilot, diagnostic,
  guardian, intelligence, loom, ollama, versionium); six have no origin yet (idearium, clear-glass, cortex, architect, orchestrator, cos). Per-system missing skeleton slots in idearium/spec/spec-library.spec's census.

decisions:
  SE_D0_phased_only:
    chosen: "anything new, every spec, change, fix and addition is built only as a phase of a map (with its spec and blocks); a change outside a phase is reported (MOD-SL-PHASED)"
    by: "his, 2026-10-31: \"how about anything new, spec, any changes, fixes, or additions is phased only.\" The check, and that tests, docs and the version files are not code, are the coder's reading by §3.3 — to confirm."
  SE_D1_spec_ids_types_library_queue:
    chosen: "every spec and module has an id and a type (<type>:<system>:<slug>, legacy names kept as aliases); docs/SPEC-REGISTRY.spec becomes the library; one queue of what waits"
    by: "his, 2026-10-31: \"like what if we use spec ids and types, then have a queue/library for specs.\" The grammar, the ten types and building on SPEC-REGISTRY.spec (§8.6, §10.3) are the coder's — to confirm."
  SE_D2_the_origin_is_the_skeleton:
    superseded_by: SE_D3_the_origin_is_server_js
    chosen: "SUPERSEDED 2026-10-31 (the coder's reading, corrected by him; kept, §0.3): the origin every piece traces to is the system skeleton: config → lib/system.js → server.js and cli.js → components → UI (genesis.spec 1.5.0, cos/archetype/nexus-system)"
    by: "his \"like it all builds from the origin as a foundation/core like the system.js, which needs the config\"; the reading that his system.js is the skeleton's lib/system.js is the coder's — to confirm"

  SE_D3_the_origin_is_server_js:
    chosen: >-
      the origin every piece traces to is its system's server.js, which needs the config: config → server.js → the registry → components →
      UI. A file traces to its origin when its system's server.js reaches it (the require graph from the door, or a registry component the
      door mounts). A system with no server.js has no origin yet; the door phases (docs/2026-10-31-system-doors-phasemap.spec) give it one.
    by: "his, 2026-10-31, correcting SE_D2: \"system.js i meant server.js\" (the coder had read his \"like the system.js, which needs the config\" as the skeleton's lib/system.js)"

  SE_D4_md_specs_become_spec_files:
    status: DECIDED 2026-10-31 (his)
    chosen: >-
      Every spec kept as a .md becomes a .spec, its text unchanged (98 of docs' 374 .spec files already hold markdown, so the format is
      the house one; nothing is retyped). 31 files: the *.spec.md files (docs/specs/, Clear Glass's seam spec, Diagnostic's healer spec),
      the specs named SPEC in a .md (architect's ARCHITECT-SPEC-v1.1.0, Looking Glass's SPEC, the meta-system specs), COS's design spec
      v1.7.0, and every system's node taxonomy in its spec/ folder (and the genesis template's). Live references follow; history (the
      changelogs, the version lines, his words) keeps the names it was written with (§0.3). READING TO CONFIRM (the coder's): what counts
      as a spec. Left as .md: the atlases, the spec-coverage report and the phasemaps written as .md (docs/looking-glass PHASEMAP.md,
      docs/IDEARIUM-PHASE-MAP-v2.md) — a phasemap is not a spec in his own order ("specs, then phases").
    by: "his, 2026-10-31: \"before i forget. convert all md specs to .spec files\" (said while MG18 waited)."
  SE_D5_specs_are_yaml_blocks:
    status: DECIDED 2026-10-31 (his)
    chosen: "a .spec is machine-readable YAML, multidimensional, in block files; SE0's rename is the first step, SE0b the form. READING TO CONFIRM: \"at 93%\" read as the share of .spec files already YAML (measured by SE0b's census), not a target"
    by: "his, 2026-10-31, while SE0 ran: \"at 93% machine readable yaml. multidimentional, block files. where are we?\""
phases:
  SE0_md_specs_to_spec:
    status: BUILT 2026-10-31
    depends_on: [SE_D4_md_specs_become_spec_files]
    files: [docs/specs, clear-glass/docs/clear-glass-seam.spec, diagnostic/spec/healer.spec, architect/docs/ARCHITECT-SPEC-v1.1.0.spec, docs/looking-glass/SPEC.spec, docs/META-SYSTEM-AND-SUBSYSTEM-SPECS.spec, cos/spec/cos-design-v1.7.0.spec, lib/system-shape.js, cos/archetype/genesis-catalog.js, docs/SPEC-REGISTRY.spec]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-LIBRARY]
    does: "the 31 .md specs renamed to .spec (git mv, text unchanged), live references repointed, the node-taxonomy role named .spec in the system shape and genesis, each registered in the library"
    proof: "no tracked .md spec left outside _archive; no live reference to an old name; the system-shape, genesis and spec tests pass"
  SE0b_specs_as_yaml_blocks:
    status: OPEN
    depends_on: [SE0_md_specs_to_spec, SE_D5_specs_are_yaml_blocks]
    files: [docs/specs, docs/SPEC-REGISTRY.spec, lib/spec-census.js]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-LIBRARY]
    does: >-
      Each .spec that holds markdown (the 31 of SE0 and the 98 older ones) becomes machine-readable YAML in blocks: meta, purpose, schema,
      api, events, integration, failure_modes, build_order, axioms, tests (the spec engine's ten slots), each block its own addressable
      part; the original text kept in the file as original_full_text (the SPEC-REGISTRY conversion's method, 2026-09-02), so nothing is lost.
    proof: "every converted .spec parses as YAML; its blocks are found by id; original_full_text equals the old file byte for byte; a census of how many .spec files are YAML (his 93%)"
  SE1_spec_ids_and_types:
    status: OPEN
    depends_on: [SE_D1_spec_ids_types_library_queue]
    files: [idearium/spec-engine/spec-id.js, tests/modules/test-spec-id.test.js]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-IDS]
    does: "parse, make and check ids; every existing module and phase gets one, legacy names as aliases"
    proof: "over the tree: one id each, none twice"
  SE2_the_origin_trace:
    status: OPEN
    depends_on: [SE1_spec_ids_and_types, SE_D3_the_origin_is_server_js]
    files: [scripts/origin-trace.js, scripts/systems-report.js, tests/modules/test-origin-trace.test.js]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-TRACE]
    does: "each file's line to its skeleton slot, spec module, phases and Loom; per system its missing slots"
    proof: "reproduces the 2026-10-31 census"
  SE3_the_library_and_the_queue:
    status: OPEN
    depends_on: [SE2_the_origin_trace]
    files: [idearium/spec-engine/library.js, docs/SPEC-REGISTRY.spec, tests/modules/test-spec-library.test.js]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-LIBRARY]
    does: "SPEC-REGISTRY as the library (ids, depth, maps, status); the queue, foundation first"
    proof: "460 specs listed; cortex's queue starts with its missing server.js slot"
  SE4_drafts_from_code:
    status: OPEN
    depends_on: [SE3_the_library_and_the_queue]
    files: [idearium/spec-engine/draft-from-code.js, tests/modules/test-draft-from-code.test.js]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-DRAFT]
    does: "a draft module for each unspecced file from what the code says; below full depth until finished"
    proof: "diagnostic: 14 drafts, each compiling, each queued"
  SE5_phased_only:
    status: OPEN
    depends_on: [SE_D0_phased_only, SE1_spec_ids_and_types]
    files: [scripts/phased-only.js, tests/modules/test-phased-only.test.js, tests/modules/run-all.js]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-PHASED]
    does: "every changed code file is in a phase, or the change is reported with file and commit"
    proof: "0.60.318 passes; a commit outside every phase is reported"
  SE6_the_library_on_screen:
    status: OPEN
    depends_on: [SE3_the_library_and_the_queue, SE2_the_origin_trace]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui]
    spec: idearium/spec/spec-library.spec
    blocks: [MOD-SL-SURFACE]
    does: "routes, command rows, Spec › Library and Spec › Queue"
    proof: "in Idearium: diagnostic's queue; origin of clear-glass/src/driver/index.js names MOD-GT4"

order: >-
  SE1 → SE2 → SE3 → (SE4, SE5) → SE6. The other three maps of 2026-10-31 (system doors, Guardian nodes, Diagnostic schemas) go on the
  queue SE3 builds; until it exists their order is their own maps'.
