# 0.60.227 — 2026-10-23

James: "need to do something about the dependancy graph."

(From his request of 2026-10-23, quoted in full in CHANGELOG-0.60.226.md.) SL3 of the self-building-loop map. This release is
deterministic: no model is asked.

## What was wrong, measured first, each traced to its root

1. **The deps gate (DG1) skipped 1073 of 1176 open phases.**
   - Cause: `lib/phase-deps-gate.js` read a phase only from a top-level `phases:` key of a map that parses as strict YAML. 797 phases
     sit under `spec:`, `phases_added_…:` or other sections. 276 are in maps that loom reads but js-yaml does not.
   - Effect: those phases were built with their `depends_on` never checked, and nothing said so.
   - Now: the YAML read is kept where it finds the phase, and loom's reader is used everywhere else. **1156 of 1156** open phases are
     checked.
2. **Most dangling references were words, not phases.**
   - Cause: a `depends_on` item with a note after its id (`"SN0_one_branch (snapshot-compartments)"`) or written as prose (`each
     phase's code landing`) was split on every space. That made 16 of the 17 dangling references.
   - Now: one reader, `lib/phase-dag.js` `refKey`, used by the DAG, DG1 and DG2. Prose is reported as prose; it is never an edge and
     never dangling. Two dangling references are left, and both are real: `REPO_PAGE1` and `OR2` exist in no map.
3. **No inferred edge ever reached a build's DAG.**
   - Cause: MP1 gives `{ on, file }`, and the DAG turned it into `'[object Object]'`.
   - Now: 201 inferred edges join the DAG. An inferred edge that would close a cycle is left out and listed.
4. **Cycles: 3 → 0.**
   - Two were written into the maps by MP4 (0.60.29) from shared files, against the other phase's authored `depends_on`. By the axioms
     (an inferred edge never overrides an authored one, §0.1), those two lines are now `depends_on: []`, with the old edge kept as a
     dated comment (§0.3). MP4 now checks for a cycle before it writes an edge.
   - GA6↔GA9 were both authored. GA6's own words use GA9's work, so GA9 goes first; GA9's `[GA6]` is kept as a comment.
   - Maps edited: `2026-10-12-browser-providers-and-work` (PV1), `2026-10-13-projects-raid-and-gates` (PL6),
     `copilot-guardian-cos-expansion` (GA9).
5. **28 decisions were offered as buildable phases.**
   - Cause: they sit under `decisions_needed:`, `decisions_recorded:`, `open_decision:` and similar sections, which loom did not know
     held decisions.
   - Now: any section whose name says decision holds decisions, and the DAG keeps loom's kind.
6. **A status the build wrote could read back wrong, and the writer refused it.**
   - Cause: loom read a status from its key line plus the 3 lines after it. A sibling `status_before: "NOT STARTED"` made the `active`
     the build writes read back as pending (test-moce-roadmap, red on main).
   - Now: only the status value is read.
   - The test that pinned the old window was rewritten to a case the writer truly cannot keep. The schema now declares `shelf`,
     `specs`, `blocks` and `kind: finding`, which the roadmap already carried.

## Built

- **`lib/phase-groom.js`.** Proposes files from a phase's own words, a `depends_on` from a shared file, and an order for a same-file
  pair. Lists what needs a person: cycles, dangling and prose references, orders it can't add, and phases nothing can place. It edits
  a map only by adding keys a phase lacks.
- **Doors:**
  - `POST /api/repos/:uuid/phases/groom`: a dry run unless `apply: true`;
  - `repo groom <repo> [--apply]`;
  - the Phases rail's "⛓ groom the graph": a dry run; writing asks first.
- **Registry:** loom's run-state map, with its real requires and consumers.

## Not done, said

The dry run over Nexus proposes files for 295 phases and a `depends_on` for 31, in 57 maps. They were **not written**: 57 of your
maps at once is a cost to see first. The build already uses the same mapping in memory, so nothing waits on the write. To write them,
press the rail button or run `repo groom nexus/core --apply`.

233 open phases can't be placed by anything deterministic. SL8 (the agent maps them at build time) is next.

## Proof

| Suite | Result |
| --- | --- |
| test-phase-groom (new) | 6/6 |
| test-moce-roadmap | 43/43 (was 40/43 on main) |
| phase-dag | 8/8 |
| phase-deps-gate | 3/3 |
| phase-mapping | 12/12 |
| loom-phasemap | 8/8 |
| loom-phasemap-status | 14/14 |
| phase-census | 6/6 |
| build-queue | 6/6 |
| phase-graph | 4/4 |
| phase-node schema | 3/3 |
| root-findings | 5/5 |
