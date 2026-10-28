# 0.60.6 — 2026-10-13

James asked for all of the following:
- "here is two huge ones. i have more. this is what i mean by i need to be able to log these somewhere, its too much. like can we have a notes or something section for the repos so i can note all of this down? im out of ideas"
- "can you add to claude.md to quote me and my decisions, with context to establish credibility. what aboiut 34000 lines? can you check that for me? remember that i want nexus to be able to parse, import, map, and i want you to build anything nexus needs to completely manage a project. past, present and future."
- "you're mapping all of this right. here is some more. remember not just the components. importing them as repositories, so i can continue, expand, fix, manage, and test them."

## Notes (`lib/repo-notes.js`, the Notes tab)

Every repo has a **Notes** tab:
- **Writing:** type, Enter saves, Shift+Enter starts a new line. Choose a kind: note · idea · decision · todo · question · quote. Tags are optional.
- **Each note** can be pinned (★), marked done (✓), edited in place, or archived. An archived note is kept and can be brought back; nothing is deleted.
- **Finding:** search, filter by kind, and switch between "this repo" and "every repo". Notes can also sit on no repo.

Wiring:
- **Routes:** `GET`/`POST /api/repos/:uuid/notes`, `GET`/`POST /api/notes`, `PATCH /api/notes/:id`.
- **Commands** (every agent has them): `repo notes`, `repo note`, `notes`, `note`, `note done`.
- **Search:** the context atlas includes notes, so agents find them.
- **Events and loom:** two new events are declared, and the module is mapped in loom.

## His decisions, quoted with context (`docs/CLAUDE.md`, new root `CLAUDE.md`)

`docs/CLAUDE.md` has a new rule for every decision he makes:
- It is recorded verbatim and dated, with what was being decided and the choices on the table.
- The coder's recommendation and the coder's reading are named as the coder's, and a reading is marked "to confirm" when there is another one.
- A later decision supersedes an earlier one through an addendum that quotes both; nothing is rewritten.

A root `CLAUDE.md` imports `docs/CLAUDE.md`, so the agreement loads in every session.

## The 34,000 lines, checked

| Bootstrap | Lines changed in `registry.json` | Real change |
|---|---|---|
| From scratch | ~34k | +31 components, +40 wires — but ~125 real edges lost (115 unresolved export hooks, including 10 of Clear Glass main's requires) |
| Over the existing registry | ~95k | +31 components, +31 hooks, +40 wires, nothing removed — plus ~2300 duplicate wires under new ids |

Why: a wire's id carries its position in the scan, so one new file renumbers every wire after it.

Neither result was committed, and the registry is unchanged. The fix is phase LM0: ids built from a wire's endpoints, then one regeneration checked edge by edge.

## His projects imported as repos

Five projects were imported through the real Import routes in a sandboxed Idearium, and also decomposed:
- **MASTERMIND**
- **ERAVOS**
- **Bridge-OS**
- **nexus 4.23**
- **update-system**

All five became repos. The only things not imported were `.git` folders: Bridge-OS's history, and the history of a repo nested inside nexus 4.23. That gap is phase PL2.

What decomposing found:
- **MASTERMIND:** 1026 components. 143 imports point at files that aren't in the project, mostly under `unintegrated/`. There are three copies of spatial-v2.
- **ERAVOS:** its scripts share code through `window` globals instead of imports, so it shows no links. That gap is CK-126 / PL6.

Two component-store bugs were found and fixed (`lib/component-store.js`):
- An import from a URL was recorded as the npm package `https:`.
- A required `.json` file was reported missing. It is now recorded as an asset, and URL imports as remote.

The import run itself wrote into the real `idearium/repo/repos/`, because repo storage is not one of the sandbox's stores. The test's five repos were removed, and the gap is named in PL1's proof.

## The check catalogue (`cos/spec/check-catalogue.spec`)

- **96 checks**, built from 12 primitives: boundary, flow, state, transformation, invariant, feedback, identity, time, cause, evidence, meaning, composition. Each primitive was compared across many domains:
  - software, security and QA/QC
  - systems thinking, control theory and traversal
  - linguistics, communication and hermeneutics
  - medicine, aviation, lean manufacturing and law
  - Da Vinci's seven principles
- **86 of the 96 are deterministic**, so a gate can run them instead of an agent.
- **Each check states** what it checks, what it finds, how it runs, which stages it belongs to, and what already does it.
- **Stages:** gate · testenv · torture · debug · diagnostic · intelligence · import.

## Mapped (`docs/2026-10-13-projects-raid-and-gates-phasemap.spec`)

**Done:**
- NT0 — notes
- PL0 — his projects imported
- CK0 — the check catalogue

**Open — projects:**
- PL1 — import many at once
- PL2 — keep `.git` history
- PL3 — versions of a project become its history
- PL4 — import reports what is already broken, as notes
- PL5 — a project's specs become its roadmap
- PL6 — global links seen

**Open — RAID:**
- RD0 — RAID gets its own contract and declared events
- RD1 — RAID commands: axioms, gates and checks, with system axioms his only
- RD2 — Idearium routes through RAID
- RD3 — the registry carries events, starting with one path
- RD4 — his "each chunk a block, synthesized into one contract file", recorded

**Open — other:**
- CK1 — the catalogue runs
- WF0 — workflows, internal and external
- LM0 — stable loom wires

**Also added:**
- His `docs/cocreation.spec`.
- Three entries registered in `docs/SPEC-REGISTRY.spec`.
- His `nexus-uri-clearglass-mesh-integration.spec` upload is older than the repo's copy, which has Thread 4 (Snowflake), so the repo's copy was kept.

## Tests

- **New:** `test-repo-notes` 11/11 and `test-project-decompose` 15/15 (PD-11 is new).
- **Still passing:** component-store, cli-route-commands, nexus-command, atlas, event-contracts, nexstore-writers, idearium-theme and repo-toolbar.
- **Still failing:** `test-repo-settings-ui`, which already failed before these changes.
