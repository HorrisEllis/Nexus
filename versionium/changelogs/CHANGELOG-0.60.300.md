# 0.60.300 — COS is the orchestrator; a system travels as one .spec; add, deploy, connect, import, export

James, 2026-10-30:
> "no cos renamed to emerge. integrating its meant to be for new systems. like a tracker."
> "cos is the orchastrator, manages the overview, look at tablet except it uses the compartments as a way to manage the compartments for each system and run them isolated."
> "i want a full manager for adding, deploying or connecting/importing a system into cos. can also drag and drop zips. any zip with a .spec imports the entire project repo. the .spec is the entire compressed system, the spec is the metadata. i want each system to export as a compressed .spec file, in cos and indearium. the spec is the history of each project, versions, conversations, all of it, logged, tracked, expanded, compared, etc."
> "also idearium and emerge and warp integrate into one?"

## Decisions (`docs/2026-10-24-cos-manager-phasemap.spec`)
- **MG_D5, his: COS is the orchestrator.** It manages the overview and runs each system isolated in its compartment. This confirms the role part of MG_D4.
- **MG_D6, his: the spec is the system.** The file layout follows from his axioms:
  - the YAML metadata comes first and one compressed payload comes last;
  - so every existing `.spec` reader (55 files in lib) still reads the metadata;
  - a zip renamed `.spec` would have broken them.

## Specced (`cos/spec/cos-manager.spec`)
- **SpecBundle.** The spec is the metadata, the payload is the tree, and the history travels inside: versions, commits, conversations, notes, decisions, phases, changelogs and benchmarks. History is appended, never rewritten.
- **MG19, Idearium packs, unpacks and compares.**
  - New route: `GET /api/repos/:uuid/export.spec`.
  - `POST /api/repos/import` also takes `.spec` files, and any zip with a `.spec` in it.
  - Commands: `repo export|import|compare`.
- **MG20, COS's one way in.** Import, deploy from a template, connect to a running system by its address (handshake, never run by COS), and export a compartment.
- **MG21, the Add screen.** A drop anywhere in the window shows what was found and what will happen before anything is written.
- **The Overview page** is the tablet on compartments.

## His three-way question
It was asked and decided on 2026-10-24 (EW_D0/EW_D1, his "okay warp and emerge."): emerge and warp are one system, and the spec compiler and IDE go to Idearium. EW1–EW3 are done; EW4–EW5 are open.

## Proof
- `test-substrate-spec` 3/3.
- The phase DAG has no dangling references and no cycles for MG19–MG21.
- `.phase` and `.graph` files were written for each new phase.

Spec only. Nothing is built.
