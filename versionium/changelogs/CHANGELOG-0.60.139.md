# 0.60.139 — 2026-10-17

James: "these are all my projects i have so far. way more. in some folders. i was hoping to use idearium and cos to manage
them"

With it, a screenshot of `D:\Projects`: 38 folders (Behavior Engine, BodyOS, Bridge Mesh, Clear-glass, Cobalt, Co-create,
Components, Embodiement alarm, Emergence, Eravos, Eravos Canvas, Eravos DAW, Fixing AI, Forge, Guardian, Ideas,
Infrastructure, Mastermind, Modules, …), and more inside some of them. The day before, he had said "i figure cos could be
helpfui for managing my projects so im not so overwhelmed."

## What was there

"My projects" (COSA10) listed the repos already in Idearium. A project came in only as an uploaded zip. Nothing could read a
folder on his disk.

## Built: COSA14, his projects folder

He names the folder once. Idearium remembers it (`my-projects-folder.json` in its data dir), together with which project
became which repo.

**The scan.** Every project under the folder:
- **A project** is a folder with a marker: `package.json`, `.git`, `pyproject.toml`, `Cargo.toml`, `go.mod`, a `.sln`, a
  `.spec`, `index.html`, `requirements.txt`, and others.
- **Inside groups.** A folder with no marker whose subfolders hold projects is a group, and the scan looks inside it, down
  to three levels. That covers his "in some folders".
- **A folder of files with no marker** (notes, ideas, docs) is a project too, marked "files". His words were "these are all
  my projects".
- **Only an empty folder** is listed as not a project, and it is listed, not dropped.

**The import.** The projects he ticks come in one by one:
- Each is zipped from his disk with the import's own skip rules (`node_modules`, `.git`, `dist`, `build`, and others) and its
  caps.
- Then it is imported through `repo.import-archive`, the same door as an uploaded zip. So each gets its own repo, chunks and
  index, and the COS container that import already starts for a repo.
- A project that is too big is refused with the reason.

**Read only.** His folder is read and never changed.

**Where he finds it:**
- Routes: `GET /api/my-projects/folder`, `POST /api/my-projects/folder` (`{ root }`), and `POST /api/my-projects/folder/import`
  (`{ paths }`, at most 50 per request).
- Commands: `projects folder [<dir>]` and `projects import <path…>`, so every agent has them too.
- Screen: Idearium → My projects → "Projects folder". There he sets the folder, scans it, sees every project (new, files,
  or already in), ticks what to bring in, and presses "Bring in the ticked".

## Still open

COSA15: running a project from COS (start, stop, its versions and branches), the way Nexus is run there. This release
brings the projects into Idearium, each with its container. Running them from COS's window is the next step.

## Proof

`tests/modules/test-projects-folder.test.js` PF-01..06 pass:
- PF-01: the scan, on a fixture laid out like his folder, with a group folder, a `.git` project, a folder of notes and an
  empty folder;
- PF-02: the zip's skip rules and cap, and the folder left unchanged;
- PF-03: the state kept;
- PF-04: end to end through the real import, with the project then shown as "in";
- PF-05: a path outside the folder refused, and a missing folder said;
- PF-06: the commands and the panel.

Also passing: projects-overview 7, repo-inject 83. The ratchet holds at 540. test-cli-route-commands CL-07 fails as it did
before this release.
