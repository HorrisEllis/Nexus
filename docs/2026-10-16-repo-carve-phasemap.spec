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
    status: "PARTLY BUILT 0.60.113 — CV2a and CV2b built; CV2c (the edits) open"
    depends_on: [CV1_carve_backend_route_command_ui]
    james: '"expand it."'
    reading: >-
      The coder's reading of "expand it" (to confirm): make the branched product real, not just copied. First the step that
      tells how far it is from standing alone, then the product's own phases (FR1-FR5 below), mapped.
    does: >-
      CV2a — every link says how it loads: load (top of file: cannot load without it), lazy (inside a function: only when it
      runs), optional (inside a try: the code already runs without it), asset (data read beside the file with
      path.join(__dirname, ...), never cut; state under data/ is never carried). The tangle: each link from a named file to one
      outside, ranked by how many files come in only through it. cut: ['optional'] leaves those links out and lists them;
      'lazy' can be cut too, said as a risk (a function that uses it would throw). The flight_recorder preset carries
      cut: ['optional'].
      CV2b — verify: the carve written to an empty folder (Nexus's node_modules linked, nothing else of Nexus reachable), one
      child process loads every named file and says which threw and why; servers and CLIs are skipped by name. Creating a repo
      always runs it and records it in CARVED.json, the README and the decision note. Loading is not running: it proves the
      requires are all there, not that the code works.
      CV2c (open) — the edits in the carved repo itself, as RF1/RF2 phases: the lazy guardian link (lib/repo-inject.js →
      guardian/lib/code-artifact.js) and the other load links outside the product, each one a version, tested in a COS testenv.
    measured_2026_10_16: >-
      flight_recorder over Nexus 0.60.112: keep every link 326 files / 51,266 lines / 15 systems; optional cut 168 / 27,044 / 8;
      optional+lazy 135 / 20,438 / 5. Every cut loads alone: 57/57 named files (versionium/server.js skipped). Two links had
      carried 81 of the first 154 pulled-in files: lib/repo-inject.js → guardian/lib/code-artifact.js (54, lazy, written
      `function _ca() { return require(...) }` on one line) and lib/diagnostic-causal.js → lib/gap-field.js (27, optional).
    found_while_building:
      - "the one-line lazy require read as load at first (any line at column 0); a require after an unclosed { on its own line is lazy"
      - "intelligence/lib/domain-nodes.js → lib/node-schemas.js reads lib/node-schemas/ from disk: the first carve did not load alone until assets were carried"
      - "a relative root made verify's node_modules link point at itself: roots are resolved first"
    proof: "test-repo-carve CV-09..12 (kinds, tangle, cut, verify pass and fail, the preset through the route); the preset loads alone in every cut"

  # The flight recorder as a product: the coder's reading of "its a product?", mapped, nothing built. Each phase reuses what
  # already exists; none is a second system beside it (§8.6).
  FR1_one_record_per_change:
    status: "BUILT 0.60.114 — test-change-record 6/6 (CR-06 the panel in Clear Glass)"
    found_while_building:
      - "a task's runId is the PHASE run (repo-activity runOf: phrun-…), not run-state's; a session's run-state id is <repo>__<session>, so the record finds the run by the task's session"
      - "'repo.changes' was already a command (the agent's proposals, --prove); a second row with the key was silently shadowed: this one is `repo record`, and CR-05 checks command keys are unique"
      - "test-proposal-evidence PE-10 fails on main too: the export-loss screen (0.60.105) refuses its fixture before the evidence check it tests; not this phase's, said"
    built_as: "lib/change-record.js; lib/repo-inject.js propose() keeps .task; GET /api/repos/:uuid/changes(/:id); `repo record`; the Code tab's changes panel"
    depends_on: [CV2_untangle_with_rf0]
    james: '"next" (2026-10-16, after FR1 was named as the coder''s pick)'
    found:
      # read in code, 2026-10-16
      the_change: "an .inject node (lib/repo-inject.js) IS one change by one agent: path, op, content, before (at apply), baseSha, status proposed → staged → applied → reverted | rejected, history, evidence (lib/proposal-evidence.js: linked tests run, regressions), approvedBy, hatName"
      where_it_landed: "applying or reverting an inject calls RV.commitNow(repo, { kind, inject: uuid, by, path, run }) (lib/repo-versions.js): the commit's labels name the inject; the activity log gets a version.commit row (ref = commitId, detail.labels)"
      timeline: "lib/activity-log/compartment.js rows kind inject.<status> with ref = the inject's uuid"
      who_and_why: "lib/repo-activity.js current() — the task an agent dispatch runs in (id, hat, provider, model, session, runId, title) — is known while the agent writes, but propose() never kept it; lib/run-state.js runs carry goal, attempt, brick, filesChanged, startedAt/updatedAt"
      causal: "versionium/lib/causality.js causalChain(commit uuid) over versionium_commits + event_log"
    does: >-
      lib/change-record.js record(inject, { activity, runs, base }) → one record: what (path, op, lines added/removed by
      versionium's own text-diff), who (the hat, the provider, who approved), why (the task and the run: goal, attempt, brick
      — by the task the inject now records, or matched by path and time for injects written before, said as matched), checked
      (the evidence: tests run, regressions), where it landed (the version commits that name it), the timeline (its activity
      rows and commits, oldest first), undo (possible or not, and why), and holes (each missing link named, never filled).
      repo-inject propose() records the task it was written in (forward fix). GET /api/repos/:uuid/changes and
      /changes/:id, `repo changes [id]`, the Code tab's "changes" panel.
    proof: "a fixture inject proposed inside a task, applied, committed: its record joins all of it; an old inject without a task is matched by path and time and says so; a missing commit is a hole, named"
  FR2_tested_before_it_lands:
    status: "BUILT 0.60.115 — test-tested-before-lands 5/5"
    james: '"merge. then next phase." (2026-10-17)'
    found: >-
      Most of it existed: lib/proposal-evidence.js runs a change's linked tests twice in a shadow copy (before, after) and
      apply() refuses a regression. Two real gaps: (1) every change was tested in NEXUS's tree (gather's default root), so a
      repo's src/x.js found no test and a carved repo's lib/zip.js ran Nexus's own tests on Nexus's own file; (2) a staged
      change's evidence was thrown away (attachEvidence kept it only while 'proposed', and code-edit stages at once), so
      promote applied a staged batch untested — and each file was only ever tested alone.
    built_as: >-
      repo-inject setEvidenceRoot (Idearium: the repo's folder; a Nexus change keeps Nexus's tree; no folder → not tested,
      said); staged changes keep their evidence; proposal-evidence shadow() with several overlays and gatherBatch() (the
      union of every file's linked tests, once on the tree as it is, once with the whole batch in place); code-edit
      promoteTested() refuses a regressing batch (nothing applied) and notes the batch on each change; POST code/promote uses
      it (409 + batch); the record and the changes panel say where it was tested and the batch's result. The COS testenv's
      VM path (a repo's own npm test / pytest) is not used yet: the shadow is a process sandbox, said.
    depends_on: [FR1_one_record_per_change]
    does: >-
      lib/code-edit.js stage → the repo's tests in a COS test environment (cos/testenv: a process, or a throwaway VM) →
      promote only when they pass; the result is part of the record. promote already rolls back all-or-nothing.
    proof: "a change that breaks a test is staged, tested, refused, and the repo is unchanged; one that passes lands"
  FR3_undo_any_change:
    status: OPEN
    depends_on: [FR1_one_record_per_change]
    james: '"Next and Merge." (2026-10-17)'
    found:
      # read in code, 2026-10-17
      revert: "lib/repo-inject.js revert() writes `before` back, but REFUSES when the file changed since the change was applied (sha check) — so the newest change can be undone and any earlier one cannot, without force, which discards every later edit"
      recorded: "a revert already becomes its own version (repo-versions commitNow kind 'revert') and activity row; the FR1 record shows it"
      merge: "no three-way merge exists anywhere in Nexus (searched: three-way, merge3, diff3); versionium/lib/text-diff.js has diff and a strict apply"
    does: >-
      versionium/lib/merge3.js: a line-based three-way merge (base, ours, theirs) on versionium's own LCS limits; a region
      both sides changed differently is a conflict, returned with its lines, never resolved by guessing. repo-inject
      revert({ merge: true }): when the file changed after the change, undo = merge3(base = what the change wrote, ours =
      the file now, theirs = what was there before): the change's own lines are reversed, every later edit kept; a
      conflict refuses with the regions named. A created file that was edited later is not deleted (it would lose those
      edits): refused, said. The undo is recorded as its own change (version kind revert; history says "merged with later
      edits"). The revert route opts in (body.merge, default on); the changes panel gets Undo; `repo undo <repo> <id>`.
    proof: "three changes to one file, the middle one undone: the first and third kept, all three in the history; a later change on the same lines refuses with the region"
  FR4_stands_alone:
    status: MAPPED
    depends_on: [CV2_untangle_with_rf0]
    does: >-
      The carved repo runs as its own thing: Versionium's server and one small API/CLI over FR1-FR3, its own package.json,
      no Nexus checkout needed. CV2b already proves it loads; this proves it runs.
    proof: "a fresh folder: npm install, start, record a change, undo it"
  FR5_the_demo:
    status: MAPPED
    depends_on: [FR2_tested_before_it_lands, FR3_undo_any_change]
    does: >-
      RF2 (the refactor tool applied one phase at a time) on a messy real repo (MASTERMIND), recorded end to end: each step a
      record, tested before it lands, any step undone. The thing to show someone.
    proof: "the recording: diff, tests green, undo, in the Versionium tab"
