# Archived 2026-10-17 (0.60.140): the projects folder, until Idearium has sync

James, 2026-10-17: "im saying add a sync feature to idearium. remove it from idearium unntil then"

Built in 0.60.139 (COSA14), taken out of Idearium in 0.60.140 by his call, kept here (§0.3), not deleted:

- `projects-folder.cjs` was `idearium/lib/projects-folder.cjs`: scan a folder for projects (also inside group folders), zip one
  from disk with the import's own skip rules and caps, remember what came in.
- `test-projects-folder.test.js` was `tests/modules/test-projects-folder.test.js` (PF-01..06).
- Removed with them, and recoverable from commit ed82dea: the routes GET/POST /api/my-projects/folder and
  POST /api/my-projects/folder/import, the commands `projects folder` / `projects import`, and the "Projects folder" section of
  My projects.

What replaces it is the sync feature (COSA16, docs/2026-10-15-cos-app-phasemap.spec, addendum (c)). The scan and the zip are its
likely substrate (§8.6), to be brought back from here when that phase is built.
