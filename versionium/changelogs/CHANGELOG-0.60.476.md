# 0.60.476 — every pipeline imported from a physical .pipeline node file

James, 2026-11-09: "Every pipeline should be in the automation tab imported by a physical node fil"

## Read first
- The engine already kept each pipeline as a `.pipeline` file in its own folder.
- But its "bundled" import took a system's files once each, never again.
- Planned and compiled pipelines went into the engine directly.
- Other systems' pipelines came only through a hand-run `import-from`.

## Built (cos/pipeline)
- **One sync for every source.** Each `.pipeline` node file is imported into COS's engine, and so into the Automation tab, from:
  - COS's shipped folder;
  - COS's own nodes folder;
  - each system's own pipelines (Idearium, Clear Glass), fetched by its route and kept as a file first (`nodes/from-<system>/`).
- **New, changed, unchanged.**
  - A new file is imported.
  - A changed one updates the same pipeline, keeping its id.
  - An unchanged one is left alone, judged on the pipeline itself, not on the envelope's export time.
- **Generated pipelines start as files.** A planned phase and a compiled framework are written as their node file first, then imported from it.
- **When it runs:** at COS's start (1.5 s after), and on demand: `POST /api/cos/pipeline/sync`, `GET /api/cos/pipeline/sources`, and the
  commands `cos pipeline-sync` and `cos pipeline-sources`.
- **Language:** the sync is JavaScript in the module's door, because the files are YAML and Emerge has no YAML reader yet (CIE14).

## Proof
- `node tests/modules/test-cos-pipeline.test.js`: 17/17. CP-16 covers:
  - Idearium's pipeline kept as a file, then imported;
  - the planned pipeline coming from its own node file;
  - an unchanged file left alone;
  - a changed one updated in place;
  - all of them in the engine's list;
  - a missing system said;
  - an agent's sync refused.
