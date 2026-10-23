# 0.60.221 — 2026-10-23

James, uploading worker_clean-5.2.0.zip and core13.2.1.zip: "some work for my mentor. need a way to real the data. the phases, convert md to spec. just get nexus building itself"

## What he brought

- **worker_clean 5.2.0**, "AI Game Master": a text adventure Claude narrates, written in PHP and JS on SISO core 13.1. Its
  plan is `SPEC.md`: `## Phase 6 — Inventory Panel + Zone Map UI`, each phase with a **Goal:**, a `### Changelog.6`
  (`[ADDED]`/`[CHANGED]` paths), a `### File Manifest.6`, and a "Completed Phases" table. Its README keeps a "Project status"
  table.
- **core13.2.1**, the SISO core in JS, PHP, Python and Lua. It has no phase plan: its `doc/SPEC.md` is a contract spec, and its
  open work is `doc/ISSUES.md` (bullets under groups), with settlement logs for what each release finished.

## Found

Idearium's roadmap import (0.60.199, SD17) read only MASTERMIND's shape (`## P1 — TITLE` in PHASEMAP.md or ROADMAP.md, and
phases.json). Both projects read as **0 phases**.

## Built (SD17b)

`idearium/repo/roadmap-import.js` 1.1.0. The existing writer, its check that loom's own parser reads the result back, the
route, the command and the Phases tab are all unchanged.

- **A phased `SPEC.md`:**
  - each `## Phase N — Title` is a phase, and its Goal is what it does;
  - its changelog's added and changed files, and its build list, are its files (`named_in_source`, so the file mapper and the
    dependency-graph gate have them);
  - the numbering is its order, and the import says so;
  - the Completed table is done, and so is the README's status table, which is the project's own record (5.1 and 5.2 join
    in their place);
  - a phase whose changelog's added files all exist in the repo is done by that evidence.
- **An `ISSUES.md`:**
  - each bullet is an open item that keeps its group;
  - items the source says are other projects' work ("not this project's work") are not imported, and the import lists them;
  - "Deferred" and "named, not fixed" are kept as the source state.
- `SPEC.md` and `ISSUES.md` join the names the import looks for. One that names no phase, such as core13's contract spec, is
  left out, and the import says so. An `ISSUES.md` becomes its own map, `issues-phasemap.spec`.

## On his two projects

| | before | after |
|---|---|---|
| worker_clean | 0 phases | 12 phases, 7 done (1–4 from the table, 5, 5.1 and 5.2 from the README). Next: **P6, Inventory Panel + Zone Map UI** |
| core13 | 0 phases | 21 open issues (9 consumer notes for other projects left out, listed). Its contract `SPEC.md` is left out |

## Also

- `docs/2026-10-23-self-building-loop-phasemap.spec`: its phases are renamed SL0–SL6. SB0–SB39 already belong to the
  build-from-the-spec map, which the first check missed. The map also records how it relates to his 2026-10-21 "stop adding
  more phases" decision (a reading, to confirm).
- `docs/2026-10-10-idearium-solid-phasemap.spec`: a `\'` inside a single-quoted string had made it invalid YAML since
  0.60.202. It is fixed to `''`, and loom read it either way.

- The tracked root `VERSION` file (kept since 0.60.218) still said 0.60.220, and nothing compared it. The release zip then
  carried two root `VERSION` files saying two versions, and RV-03 failed. `VERSION` now follows the release.
  `lib/release-version.js` `agreement()` compares it, and `scripts/release-zip.js` adds no second one when the commit
  already tracks it.

## Proof

`tests/modules/test-roadmap-import.test.js`: 8/8.
- RI-06: a phased spec in worker_clean's shape. It has goals, files, order, both tables and done by evidence; it reads back
  through loom, and its graph has no cycles or dangling links.
- RI-07: an issue list in core13's shape, plus `findRoadmaps` and the contract `SPEC.md` left out.
- RI-08: the real API importing a phased spec with the repo's own files and README as evidence.

test-release-version 5/5 (RV-03 green again), test-moce-roadmap-ui 17/17 and test-phase-census 6/6. test-moce-roadmap's 3 failures were red on main before this change.
