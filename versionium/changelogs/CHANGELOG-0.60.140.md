# NEXUS 0.60.140 — the projects folder out of Idearium, until Idearium has sync

James, 2026-10-17: "im saying add a sync feature to idearium. remove it from idearium unntil then"

## Context

0.60.139 put a "Projects folder" section in Idearium's My projects: scan D:\Projects, tick projects, bring each in as a zip.
Asked about it, James first said "no. ill import them" and "no with the idearium. make it a feature if you want to do that". The
coder read that as "it's already a feature" (cos-app phasemap addendum b). That reading was wrong. What he wants is a sync
feature in Idearium, and the folder feature gone until then. The call is his.

## What changed

- **Archived, not deleted (§0.3).** `idearium/lib/projects-folder.cjs` and `tests/modules/test-projects-folder.test.js` are now
  in `_archive/2026-10-17-projects-folder-until-sync/`, with a README.
- **Removed from Idearium:**
  - the routes GET/POST `/api/my-projects/folder` and POST `/api/my-projects/folder/import`;
  - the commands `projects folder` and `projects import`;
  - the "Projects folder" button and section in My projects;
  - its run-all row and its loom wires.
  All of it is recoverable from commit ed82dea.
- **Mapped, not built:** COSA16 Idearium sync, in `docs/2026-10-15-cos-app-phasemap.spec` addendum (c). It keeps a project in
  Idearium in step with its folder on disk, with the archived scan and zip as its substrate. The coder's reading of "sync" is
  marked to confirm.

## Proof

- The diff removes exactly what 0.60.139 added in api/index.js, route-commands.js, projects.js, run-all.js and run-state-map.js.
- `node --check idearium/ui/js/projects.js` is clean, and route-commands loads with 116 rows.
