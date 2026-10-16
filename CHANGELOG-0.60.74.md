# 0.60.74 — 2026-10-16

James: "i figure cos could be helpfui for managing my projects so im not so overwhelmed." · "heklp wirth overwhekm need to
be done."

And, answering "is a gate's work unit the brick?": "Yes. It’s analysis. The bricks."

This is step 1 of his four musts, in the order recorded in `docs/2026-10-15-pipeline-focus-phasemap.spec` (addendum
2026-10-16). It is COSA10 of `docs/2026-10-15-cos-app-phasemap.spec`.

## What changed

- **Every project on one list** (`idearium/lib/projects.cjs`, new). Each row shows:
  - the questions and todos waiting on him;
  - phases done out of total;
  - the phase in progress, or the next ready one;
  - the last thing that happened.

  Rows are sorted newest activity first. Nothing new is stored: it composes `lib/repo-notes.js` counts, the phase roadmap
  (`idearium/repo/roadmap.js`) and the activity log. Nexus is one project (its core repo), and RAID's per-contract repos
  are not projects (the same rule the repo library uses). A reader that fails is named on its row, and the row stays.
- **Delivered in order:**
  - backend: the overview above;
  - route: `GET /api/my-projects` (`projects.overview`);
  - command: `projects` (every agent has it through `nexus.command`);
  - UI: Idearium's repo rail gains a **My projects** button. A row opens its repo.
- **GW0 is decided, and it is his:** the brick is the unit of work (`docs/2026-10-15-gate-held-work-phasemap.spec`,
  addendum (d)). "It’s analysis" is read as agreement. The other reading, that a brick analyses before it builds, is
  marked to confirm.

## Found while building

- **`GET /api/projects` already existed.** It is the uploaded-zip shelf (`project.list`). The router takes the first
  match without a word, so the new route answered with the shelf's empty list until it was renamed.
- **A guard now exists.** `PJ-06` fails on any two Idearium API routes that share a method and path. Re-inserting the
  original collision makes it fail, naming both actions.

## Proof

- `tests/modules/test-projects-overview.test.js` 6/6:
  - sorting, and which repos are projects;
  - what needs him;
  - a failing reader said on its row;
  - the Nexus parent when there is no core repo;
  - one request through the real router, with a real repo and a real question note;
  - the route-collision guard.
- Loom: `test-loom-map` 19/19, `test-build-surface` 13/13, `test-build-surface-2` 3/3.
- Pre-existing failures, the same on the code before this release:
  - `test-cli-route-commands` CL-07 (Guardian not running);
  - `test-agent-tools-and-graph` AT-13.

## Open

- **Nexus's "next" phase** is the first in-progress or ready phase across all of its maps. It should follow the
  pipeline-focus order instead.
