# 0.60.173 — 2026-10-19 — upload a zip with an intent: placed against the repo, asked of him, written only by his answer

James, 2026-10-19: "i want to be able to upload files to idearium repos. upload zip with an intent, have it map to nexus using a
tool, then ask me with the option to edit the location and where they go in relation to the system or the registry. like i want to
try to make something that can do what you can, when uploading zips, or making requests."

The idea and the direction are his. The coder's part: the placement rules, the routes and the panel. Map:
docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (UP1–UP4; UP5–UP6 open).

## What it stands on (§8.6)
lib/zip-ingest.js (the importer's bounded unzip) · lib/intake.js's rule that a wrapper folder is stripped only onto real paths ·
lib/repo-inject.js (the one door a write goes through) · the source layer's single-file write (setSourceFile) · the Code tab's
panel frame (code-tab-panels.js). Nothing existing placed a zip INTO an existing repo — repo.import-archive makes a new repo.

## Built
- **UP1 `lib/upload-placement.js`, no model.** The wrapper folder goes only when that lands the zip on the repo's real paths. Each
  file is then placed by: his learned rule → the same path (identical or replace) → the same bytes, or the one file of that name →
  a folder that already exists → the system the intent names → new, kept where the zip had it. Every row says why, how sure, the
  alternatives, its system, what it requires (resolved against the repo AND the rest of the upload) and who already requires that
  path, so a replace says what it can break. Junk (`__MACOSX`, `.DS_Store`) and `..` paths are skipped and said.
- **UP2 learning.** A file he moves teaches its folder; a file he renames teaches its name. Counted, read first next time
  (`why: learned`).
- **UP3 routes + commands.** `POST /api/repos/:uuid/uploads {name, intent, contentBase64}` → the plan, waiting as **needs-you**;
  nothing is written. `GET …/uploads` (open first, his rules) · `GET …/uploads/:id` · `POST …/uploads/:id/answer {rows:[{from,
  to?, skip?}]}` → his answer is checked (paths inside the repo, no two files to one path), text goes through repo-inject
  propose + apply (the live Nexus repo leaves them at its approval gate), binaries through the source layer's single-file write.
  `repo upload <repo> <zip> --intent "…"` · `repo uploads <repo> [id]` · `repo upload-answer <repo> <id> [--to from=path] [--skip from]`.
- **UP4 the Code tab's upload panel.** Drop a zip, write the intent, see each file's place, system, reason and neighbours; edit
  the path, pick another place, skip; Apply.

## Found on the way
`writeSources()` (the import path for binaries) rewrites the repo's source manifest from only the files it is given — an upload
through it would have left every earlier source file unowned, for materialize() to delete. The single-file `writeSourceBytes`
is used instead.

## Proof
`tests/modules/test-upload-placement.test.js` 4/4: placement rules (UP-01), answer + learning (UP-02), the real router end to end
— waits, refuses a bad answer and writes nothing, writes his answer only, refuses a second answer, reads his rule on the next
upload (UP-03), the panel in Clear Glass (UP-04).

## Not proven
Not run on Windows. Placement is deterministic: a file nothing places is kept where the zip had it with low confidence — the
model suggestion for those is UP6 (open). Loom wires for what an upload adds to the Nexus repo are UP5 (open).
