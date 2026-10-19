# Idearium: control over phases, files and stores; one toolbox; one idea system; everything interconnected (2026-10-19)

James, 2026-10-19: "i need more control over phases." · "need to be able to manage/upload/detect files in the file manager for the
code tab. like idearium all needs to interconnect. map to the correct places, consolidate redundancy in the code tab to more
expanded tabs instead of so many tabs. need to make sure retry logic, response from agent, contract, component store, i need more
control and access to it. logs, flight recorder, able to see into the raid compartment in the files tab. the debug and intelligence
tab should be migrated into one enterprise grade toolbox, especially for cos and testing and verifying. anythingg you can think of.
need to be able to open versionium files in the workarea or surface, only backup the diff changes, consolidate the ideas and notes
tab into one beautiful interconnected idea management system with interconnected features to promote to phase, automatically map
ideas to nexus, nothing exists without dependancies. files names must remain consistent."

Supersedes-and-keeps UI1–UI3 and ID1 of docs/2026-10-19-pipeline-root-causes-phasemap.spec (the earlier, shorter reading).

## Ground truth (read in the uploaded tree, 2026-10-19)

- Phase routes today: repo.phases.{add, build, contract, cost, dag, get, graph, map, map.status, runs, status}; runs: repo.runs.list,
  repo.runs.rewind. No pause/cancel of a running build, no "retry from this brick", no per-phase agent pin, no inline edit of a
  phase's depends_on/files that writes the map.
- Repo tabs (his screenshot): Home, Idea, Notes, Code, Architect, Spec, Phases, Intelligence, Debug, Versionium, Sync & CI, Settings.
  Debug = idearium/ui/js/app.js renderRepoDebug (~2269); Intelligence = renderRepoIntelligence (~2570).
- Code tab pieces: code-surface.js, work-surface.js, code-dock.js, code-tab-panels.js, code-tab-flight.js, plan-panel.js,
  file-manage.js, file-versions.js, components-panel.js, debug-failures.js (idearium/ui/js/).
- Stores with no file view: RAID contract queue + intake drops (cortex JAA raid_contract_queue, intake_drops), agent responses
  (guardian response sink + chat transcripts), retry carry boxes (_carryFor in idearium/api/index.js), component store
  (lib/component-store.js), flight recorder (lib/change-record.js, GET /api/repos/:uuid/changes), logs (data/error.log, ledgers).
- Versionium: repo versions are whole-tree snapshots (lib/repo-versions.js: "the snapshot is of the whole tree"); whether storage is
  content-addressed (unchanged files free) is NOT yet checked. lib/repo-history.js restoreFile reads any file at any version.
- Notes: lib/repo-notes.js KINDS note|idea|decision|todo|question|quote; lib/work-funnel.js maps a request to dependencies, spec,
  phase, chunks.

## Phases. Delivery per phase: backend → route → command → UI (tested in Clear Glass). Archive, never delete.

phases:

  NM1_one_name_per_file:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [lib/path-guard.js, lib/project-registry.js, lib/file-identity.js]
    does: >-
      "files names must remain consistent." A file's identity is its registry id; its path is a property. A rename goes through
      one door that updates the registry, every import that names it, the phasemaps' files lists and the DAG — or is refused
      with what would break. A duplicate detector flags near-twins (tests/sp5-title.test.js · tests/sp5-title-test. ·
      "Gemini said tests/…") for one-click archive (RC4b does the labelled ones).
    proof: renaming lib/title.js updates its require in the test, its phase's files and its registry entry in one version

  PC1_phase_controls:
    layer: library
    status: OPEN
    depends_on: []
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, lib/phase-dag.js]
    does: >-
      "i need more control over phases." Per phase: pause / resume / cancel a running build; retry from one brick or gate
      (keeping the passed ones); rerun only the proof; pin an agent (or "local only"); force or skip verify-first; edit status,
      depends_on and files inline — written to the map, DAG-checked before saving (DG3); split one phase into two, merge two,
      reorder within a layer; its run history with rewind (repo.runs.rewind exists). Every control is a route + a command first.
    proof: each control through the router and the CLI; an inline depends_on edit that would make a cycle is refused with the cycle

  FM1_file_manager:
    layer: interface
    status: OPEN
    depends_on: [NM1_one_name_per_file]
    files: [idearium/ui/js/file-manage.js, idearium/api/index.js, lib/repo-inject.js]
    does: >-
      Manage, upload, detect, in the Code tab's files. Upload (drag in files or a folder) lands as proposals through repo-inject
      (path-guard, screens, versioning — the same door as an agent). Detect: each file's type, owning component (registry id),
      phase(s), tests that cover it, last version, last agent that touched it. Manage: rename (NM1), move, archive, restore.
    proof: an uploaded folder appears with its components and phases mapped; a rename keeps every reference

  FM2_stores_in_the_files_tab:
    layer: interface
    status: OPEN
    depends_on: [FM1_file_manager]
    files: [lib/store-explorer.js, idearium/api/index.js, idearium/ui/js/file-manage.js]
    does: >-
      "able to see into the raid compartment in the files tab": virtual folders beside the repo's files — RAID (contract queue,
      intake drops, each contract's gates and evidence), Agent responses (per job: prompt, reply, transcript, what landed),
      Contracts, Retries (carry boxes, retry rows, why each retried), Component store, Flight recorder (change-record), Logs
      (error log, ledgers, filtered to this repo). Open any of them in the surface; JSON as a tree; upload where a store accepts
      it (a contract, a component); every read through a route.
    proof: SP5's last contract opens from the Files tab with its gates, its agent replies and its retries

  CT0_code_tab_census:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [idearium/ui/js/]
    does: >-
      Before consolidating: list every Code-tab panel/tab, what it shows, its routes, how often it is used, and which overlap
      (plan-panel vs code-dock vs code-tab-panels vs work-surface). Proposed merge for James to choose.
    proof: the census table, with his choice recorded as a decision

  CT1_fewer_wider_tabs:
    layer: interface
    status: OPEN
    depends_on: [CT0_code_tab_census, FM1_file_manager]
    files: [idearium/ui/js/code-tab-panels.js, idearium/ui/js/code-dock.js, idearium/ui/js/work-surface.js, idearium/ui/index.html]
    does: >-
      "consolidate redundancy in the code tab to more expanded tabs instead of so many tabs": the chosen merge (CT0) — e.g. Files
      (FM1+FM2) · Surface (code + diff + versions) · Run & Verify (run, tests, verify-first, proof) · Flight (what happened, by whom)
      — each expanded, not nested.
    proof: every function the old tabs had is reachable; nothing lost (§0.3); tested in Clear Glass

  TB1_toolbox:
    layer: interface
    status: OPEN
    depends_on: [FM2_stores_in_the_files_tab]
    files: [idearium/ui/js/app.js, idearium/ui/js/repo-toolbox.js, idearium/api/index.js]
    does: >-
      Debug + Intelligence → one Toolbox, "enterprise grade, especially for cos and testing and verifying": Health & logs ·
      Flight recorder · Failures (failure-mode report, phase faults) · COS (compartments, sandbox/VM runs, test env status, run a
      test in a compartment) · Verify (verify-first verdicts, proof runs, mutation checks VF3) · Agents (self-models, proposals,
      interrogate — SM2) · DAG (DG3 census, cycles, dangling, critical path) · Resources (memory pressure, model loads, the unowned
      Ollama load RC6).
    proof: every section reads through a route; the old Debug and Intelligence views archived, their functions all present

  VS1_versions_in_the_surface:
    layer: interface
    status: OPEN
    depends_on: []
    files: [idearium/api/index.js, lib/repo-history.js, idearium/ui/js/repo-versions.js, idearium/ui/js/code-surface.js]
    does: >-
      "open versionium files in the workarea or surface": any version's file opens read-only in the surface (route repo.versions.file
      over repo-history's read path), with compare-with-now and put-back (repo.versions.restoreFile exists).
    proof: open lib/title.js at an old version, compare, put back — one new version recorded

  VS2_diff_only_backups:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [lib/repo-versions.js, idearium/repo/snapshot.js, versionium/]
    does: >-
      "only backup the diff changes": first check what a version stores today (whole-tree snapshot per commit; content-addressed or
      full copies). If full copies: content-addressed blobs (an unchanged file costs nothing) and per-file diffs for text, with
      periodic full checkpoints so any version still restores in bounded time.
    proof: 100 one-line commits to a 1,000-file repo grow storage by about 100 diffs, not 100 trees; any version restores exactly

  IX1_everything_linked:
    layer: library
    status: OPEN
    depends_on: []
    files: [lib/link-index.js, idearium/api/index.js]
    does: >-
      "idearium all needs to interconnect … nothing exists without dependancies": one link index over ids — idea, note, spec
      section, phase, file (registry id), component, run, contract, version, agent reply — so every view has "came from / led to /
      used by", and anything with no link is flagged (not hidden).
    proof: from an idea, reach its phase, its files, their last run and version; from a file, back to the idea

  IM1_ideas_and_notes_as_one:
    layer: interface
    status: OPEN
    depends_on: [IX1_everything_linked]
    files: [lib/repo-notes.js, idearium/ui/js/repo-notes.js, idearium/ui/index.html]
    does: >-
      Idea + Notes tabs → one idea system (kinds kept: idea, note, decision, todo, question, quote): a board and a graph view, each
      item showing its links (IX1), status, and what it became; quick capture from anywhere (CLI, chat, Clear Glass).
    proof: every old note and idea present (§0.3); the two tabs archived

  IM2_promote_to_phase:
    layer: integration
    status: OPEN
    depends_on: [IM1_ideas_and_notes_as_one, PC1_phase_controls]
    files: [lib/work-funnel.js, idearium/api/index.js]
    does: >-
      Promote an idea → the funnel (lib/work-funnel.js) proposes the phase: map, layer, depends_on (DAG-checked), files mapped to
      registry ids (IN7), proof; James edits, then it is written to the phasemap with the idea linked.
    proof: a promoted idea is a phase that passes DG3 and links back to the idea

  IM3_ideas_mapped_to_nexus:
    layer: integration
    status: OPEN
    depends_on: [IM1_ideas_and_notes_as_one]
    files: [lib/work-funnel.js, lib/phase-map-auto.js]
    does: >-
      "automatically map ideas to nexus": each idea is mapped (no model first: names, files, components, phases it mentions; a local
      model only when that finds nothing) to the systems, components and phases it touches; unmapped ideas are listed, never dropped.
    proof: on Nexus's own notes, the share mapped and the unmapped list, measured
