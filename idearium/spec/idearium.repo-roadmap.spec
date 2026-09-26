spec:
  meta:
    name:        idearium.repo-roadmap
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    owner:       idearium
    uuid:        nexus-idearium-repo-roadmap-v1-0000-2026-0920-001
    author:      james-brooks
    compiled_by: claude
    created:     2026-09-20
    status:      Specified
    implements:  'docs/idearium-repository-overhaul-phasemap.spec MCO-E_roadmap_ui'
    purpose: >
      A repo's roadmap: the phases in the phasemaps inside it, ordered so every
      dependency comes before what depends on it, with a control to change a
      phase's status. Render layer only.

  build_order:
    law: '§8.5 — spec before build; §3.4 — raw code before interfaces.'
    written_before_code: 'PARTLY. idearium/repo/roadmap.js was written first as a probe against the real overhaul phasemap; this spec was written before the routes, the UI and the tests, and records what that probe settled. Stated rather than implied.'
    sequence:
      - 'loom/scanners/phasemap-map.js — parsePhasemapText() extracted, hyphenated ids (MCO-A_) recognised'
      - 'idearium/repo/roadmap.js — buildRoadmap() and setPhaseStatus(), callable from raw node'
      - 'tests/modules/test-moce-roadmap.js — real phasemaps, loom reads back every edit'
      - 'RepoLayer.writeTextFile + routes repo.roadmap.get / repo.roadmap.phase.update'
      - 'idearium UI: Roadmap repo subtab'

  decisions:
    source_of_truth: >
      The phasemap files. phase_node rows are a DERIVED view, produced on every
      read and never stored. The phasemap's "edits update the same rows loom's
      scanner reads" is met by editing the file loom reads. Storing rows as well
      would give two copies that can disagree.
    reuse_of_loom: >
      loom's per-phase parser (header regex, status rules, depends_on rules) was a
      loop inside loadAll(). It is extracted UNCHANGED into
      parsePhasemapText(text, name), and loadAll() calls it. idearium reads a
      repo's phasemap text with that same function. Measured across the 529
      phases in docs/ before and after: 525 identical; the 4 that differ are
      phases of the overhaul phasemap whose body used to run into the next
      MCO-x phase and now stops at it (their `systems` tags shed words that came
      from the neighbour; statuses and dependencies are identical); +14 phases
      become visible (below).
    loom_bug_fixed: >
      loom's phase header regex required digits after the letters
      (/[A-Z]{1,3}\d+_/), so a hyphenated id like `MCO-A_schemas` never matched.
      The overhaul phasemaps' own phases MCO-A..MCO-G were invisible to loom's
      roadmap. The regex now also accepts `-[A-Z0-9]+`. Exactly 14 phases are
      added across docs/, all of them those. Bare `MCO-A:` still does not match
      (the underscore guard against drift dictionaries stays).
    dependency_reading: >
      `depends_on: [MCO0]` names a phase by its KEY (the id up to the first
      underscore). An exact id also resolves. A token that is not a phase in the
      same phasemap (a spec file name, a URL) is reported as unresolved and does
      not order or block anything. An ambiguous key is reported, not guessed.
    status_vocabulary: >
      loom reads three values: done, in-progress, pending. They map to the
      phase_node enum complete, active, planned. `blocked` is in the enum but is
      NOT stored: loom has no such value and a phase is blocked when a dependency
      is not complete, which is shown (blocked_by), not written. An edit to
      'blocked' is refused with that reason.
    edits: >
      Allowed targets: planned, active, complete. The `status:` value becomes
      `DONE <date>.`, `IN PROGRESS <date>.` or `NOT STARTED`. The previous value
      is kept in a `status_previous:` key and a `# roadmap edit` comment above the
      status, neither of which loom's status reader looks at. Marking a phase
      complete while a resolved dependency is not complete is refused
      (DEPS_INCOMPLETE) unless force is sent. After rewriting, the result is
      re-parsed with loom: the target must read back as requested, no other
      phase's id/status/dependency may change, and a file that was valid YAML must
      still be. Otherwise the edit is refused (ROUNDTRIP_FAILED) and nothing is
      written. After writing, the file is read back from disk and parsed again.
    writing_through_the_repo: >
      The file is written through RepoLayer.writeTextFile: a chunk-backed file via
      writeFile, and a file the repo's source layer owns (an imported project)
      as bytes via the source layer, with its chunk kept in step. The next
      snapshot picks the change up like any other.
    duplicates: >
      loom counts every header-shaped line, including a dictionary entry that
      repeats a phase id lower in the file. The first is the phase. Later ones are
      reported (duplicate_phase_id) and not edited.

  not_done:
    - 'creating a phasemap or adding a phase from the UI (edits change a status only)'
    - 'editing depends_on from the UI'
    - 'roadmaps across repos, or the NEXUS docs/ phasemaps (loom serves those)'
    - 'module_path (needs MCO-D zoom levels)'
    - 'authorship of an edit: the comment records a date, not who'
