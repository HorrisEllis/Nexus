# 2026-09-15 patch: idearium real-path materialize + MCO-F chunk_cap config

Drop these 6 files into your `nexus/` checkout at the matching paths
(overwrites 5 existing files, adds 1 new one). No `npm install` needed
beyond `js-yaml` (already a workspace dependency — only missing in this
sandbox because it wasn't on disk here).

## Files

- `idearium/lib/config.js` **(new)** — the live `idearium.config` store
  (MCO-F). `chunk_cap` (default 500, min 1, max 5000), `zoom_levels`,
  `snapshot_mode`, `auto_phasemap`, `cicd.*`. Persisted via the same
  cortex/jaa-db seam every other idearium table uses. `copilot_writable`
  enforced per-key (`ssh_key_path` is human-only).
- `idearium/spec-engine/index.js` — `ingestFilesAsSpec` (the raw "drop"
  path) now: (1) enforces `chunk_cap` live, throwing if a drop exceeds
  it; (2) stamps each chunk's real original relative path onto a new
  `realPath` field (sanitized — leading `/` and `..` segments stripped).
  `addChunk` gained an optional `realPath` param for the same reason.
- `idearium/repo/index.js` — the file listing (`_enrich`), file
  resolution (`_resolveChunk`), and read/write/delete paths now prefer
  `chunk.realPath` over the chunk store's numbered `NN-section-id.md`
  name when present. This is what actually fixes materialize(): a
  dropped `src/widgets/button.js` now lands on disk at
  `src/widgets/button.js`, not `00-src-widgets-button-js.md`.
- `idearium/api/index.js` — `GET/POST /api/config` → `config.get` /
  `config.set` actions, wired to the new store.
- `lib/project-import.config.js` — `ZIP.maxFiles` (the "Upload Project"
  zip-import cap) is now a live getter reading the same `chunk_cap`
  value straight out of cortex's store (this file is CJS, `idearium/`
  is ESM, so it reads the persisted row directly rather than importing
  the ESM module) — falls back to the `NEXUS_PROJECT_IMPORT_MAX_FILES`
  env var / 500 only if no config row has been written yet.
- `docs/idearium-repository-overhaul-phasemap.spec` — MCO-A's status
  updated from "NOT STARTED" to "DONE" with the gate_proof (this was
  already true in your `.140` build per the delta zip; only this one doc
  field was stale). MCO-F is still listed as its own phase in the
  phasemap — flip its `status:` to done and add a gate_proof line
  yourself once you're happy with this patch, since that's a judgment
  call for you to make, not something to silently rewrite for you.

## Why (what was actually wrong)

`ingestFilesAsSpec` — the code path that turns raw dropped files into a
repo — was building every chunk's on-disk name from
`${chunkIdx}-${sectionId}.md`, and `repo/index.js`'s materialize()
always wrote files out under that name, **not** the file's real original
path. That's why the three sample repos in your project.import upload
(`nexus-id-repo-c2dd91c5` etc.) are full of files like
`06-idearium-ui-js-app-js.md` instead of `idearium/ui/js/app.js` — the
real content was there, chunked correctly, verified, disk-backed — just
never materialized under a real filename. The "Upload Project" zip-import
path (`lib/zip-ingest.js` + `lib/project-container.js`) was already fine;
this was specifically the raw-drop path.

There was no existing single "500 chunk cap" in code to change — the
only literal `500` was `lib/project-import.config.js`'s `ZIP.maxFiles`,
which bounds the zip-import path only, and was env-var-only (deploy-time,
not live). The merged phasemap's MCO-F already speced the intended fix
exactly (`idearium.config.chunk_cap`, live, copilot-writable, 1–5000)
which this patch implements, and also applies the same cap to the
raw-drop path, which previously had no cap at all.

## Verified in this sandbox

- `node --check` clean on all 5 edited files.
- `idearium/test/test-mco-a-phase-node-schema.js` and
  `tests/modules/test-mco-a-file-delta-schema.js` (the existing MCO-A
  suite, unrelated to this patch) — still 6/6 passing against the edited
  tree, so nothing here broke MCO-A.
- Live smoke test: dropped 3 files including a `../../etc/passwd`
  traversal attempt — `realPath` came back sanitized to `etc/passwd`
  (never escaped the intended dir), real files' paths/extensions
  preserved exactly (`src/widgets/button.js`, `README.md`).
- `chunk_cap` set via `idearium/lib/config.js` (ESM) and read back live
  via `lib/project-import.config.js` (CJS) — confirmed both sides see
  the same persisted value with no restart in between.
- Over-cap drop (501 files against the 500 default) correctly rejected
  with `chunk_cap` named in the error.
- Copilot-actor write to `cicd.ssh_key_path` correctly rejected
  (human-only key); a normal `chunk_cap` write by the same actor
  succeeded — confirms the per-key `copilot_writable` gate.

## Not in scope for this patch

The merged phasemap's other phases (MCO1 graph edges, MCO2 verification
tiers L4-L8, MCO-B versionium bridge, MCO3 snapshot compliance, MCO4
hooks/wires/flows as typed nodes, MCO-D zoom/sub-repo, MCO6 compartment
ownership) are all still genuinely "NOT STARTED" and untouched — that's
a much larger, separate body of work the phasemap itself sequences on
purpose (MCO-A → MCO-B → MCO-C → ... with real dependencies). This patch
is scoped to exactly what you asked for: the `.140` integration gap, the
real-file-import bug, and the chunk cap becoming a live config option.
