# docs/2026-10-16-repo-carve-phasemap.spec
# Branch a part of Nexus into its own Idearium repo: the files named, everything they require, and a record of where it came from.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Touches: docs/2026-10-13-projects-raid-and-gates-phasemap.spec (RF0 architecture read, RF1 migration as phases, RF2 applied one
# phase at a time; VM0 versionium per repo), docs/2026-10-15-cos-app-phasemap.spec (COS as the test env), docs/rfr2.spec.

origin:
  date: 2026-10-16
  james: '"look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?" · then: "can you branch it into a idearium repo?"'
  context: >-
    He asked whether those pieces together are a product. The coder's answer (a reading, his to confirm): yes, narrower than
    Nexus. An undo button and flight recorder for AI coding agents: every change an agent makes is tested in a throwaway
    environment (COS testenv), kept as a version you can compare and put back (Versionium), recorded with what caused it
    (event ledgers, the causal graph), and replayable (RFR2). The coder recommended building RF2 as its demo. He then asked
    for it to be branched into an Idearium repo.
  decided: >-
    His: branch it into an Idearium repo. The coder's reading (to confirm): a NEW repo in his Idearium holding those
    systems' files and everything they require, with Nexus as its parent (fork lineage), so the product can be worked on
    as its own project while Nexus stays whole. Nothing moves out of Nexus and nothing is deleted (§0.3). The working name
    "flight-recorder" is the coder's, not his; he names it.
  why_a_tool_not_a_copy: >-
    One copy made by hand would be stale the next release and say nothing about why each file came along. A carve is
    repeatable (run it again at any Nexus version), reports what every file was pulled in by, and works for any other part
    of Nexus he wants to branch out later (§8.6: the tree scanner already resolves requires; Idearium's repo.ingest already
    takes files and a parent).

found:
  # read in code, 2026-10-16
  closure_measured: >-
    Seeds versionium/, intelligence/rfr2/, cos/testenv/, cos/compartment/, lib/code-edit.js, lib/repo-history.js,
    lib/repo-inject.js → 207 files, 43,293 lines, across 15 Nexus systems (lib 55, cos 66, intelligence 23, versionium 21,
    loom 13, warp 11, emerge 5, guardian 4, ...). npm: js-yaml, vectra, express and a few CLI parsers. 3 requires that resolve
    to nothing (intelligence/rfr2/compress → ./src/kernel, ./src/adapter; emerge/compiler → a computed path).
  meaning: >-
    The product does not stand alone yet: loom, warp, guardian and emerge come along through requires. That tangle is what
    RF0 (architecture read) is for; the carve report is its first real input.
  substrate:
    requires: "lib/phase-map-auto.js envFromTree: requiresOf / consumersOf over the tree (the work funnel uses it)"
    repo_create: "idearium/api repo.ingest → RepoLayer.ingest({ name, files: [{path, content}], parent, source }): parent records fork lineage"
    notes: "lib/repo-notes.js add({ repoUuid, body, kind }) — kinds include quote and decision"
    nexus_parent: "the repo whose nexusSelf.role is 'parent' (lib/nexus-self) is Nexus in Idearium"

phases:
  CV1_carve_backend_route_command_ui:
    status: "BUILT 0.60.112 — test-repo-carve 8/8; preset flight_recorder 217 files (63 named, 154 pulled in), 15 systems, carved in 0.8 s"
    found_while_building: "envFromTree counts requires in comments (44 files nothing loads); the carve reads requires with comments left out (CV-01)"
    layer: library
    systems: [idearium, core]
    component: lib.repo-carve
    files: [lib/repo-carve.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/projects.js, tests/modules/test-repo-carve.test.js]
    does: >-
      lib/repo-carve.js: plan({ root, seeds }) walks the seeds (files or folders), follows requires through envFromTree to
      a closed set, and returns each file with what pulled it in, the npm packages used (with the versions Nexus pins), the
      requires that resolve to nothing, counts by system, and lines. build() adds three files: package.json (the npm deps),
      CARVED.json (seeds, Nexus version and commit, every file's pulled-by edge, the missing requires) and README.md (his
      words, where it came from, how to carve it again). PRESETS.flight_recorder is the seed list above.
      POST /api/repos/carve { name, seeds | preset, dryRun }: dryRun returns the plan; otherwise repo.ingest with source
      'carve' and parent = the Nexus repo when one exists, and a quote note of his words on the new repo. Seeds are paths
      inside Nexus only (no other folder is read). Command repo.carve. UI: "Branch from Nexus" in My projects: preset or
      paths, Preview (the counts and what came along), Create.
    proof: "test-repo-carve: a fixture tree's closure (pulled-by, npm, missing), the real preset's plan, a repo created through the real router with its parent and note, the command row, the UI"
  CV2_untangle_with_rf0:
    status: OPEN
    depends_on: [CV1_carve_backend_route_command_ui]
    does: >-
      Feed the carve report to RF0: which requires drag loom/warp/guardian/emerge in, and which can be cut (optional
      requires inside try/catch, comment-only mentions) so the product stands on its own. Then RF1/RF2 apply the cuts as
      phases in the new repo, each one a version, tested in a COS test environment.
    proof: "the carved repo's closure shrinks, its tests pass in a COS testenv, every step is a version in its Versionium tab"
