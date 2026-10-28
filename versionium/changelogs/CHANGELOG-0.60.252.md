# 0.60.252 — the co-pilot hat can update Nexus from GitHub

James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using github?"

Asked how an update should land on his machine, he was given three options:
- a git clone (the coder's recommendation);
- through COS;
- a zip side by side.

He said: "first one but the second one needs to be the end state". Map: `docs/2026-10-25-nexus-update-phasemap.spec`.

## What it is
One update interface over drivers, so the tool, its commands and its page stay the same when the COS driver lands (UP5, his end state).

- `lib/nexus-update.js`:
  - **detect**: `git` (a clone with an origin), `cos` (a COS store version: said, and the driver is UP5), or `folder` (an unzipped
    release, which is his install today; it is told the one-time clone).
  - **check**:
    - `git fetch origin main`;
    - this version against GitHub's, and how many commits behind or ahead;
    - every release in between, with his own opening words from that version's line;
    - the systems it changes, and whether the lockfile changes;
    - what an update would set aside, and what it would refuse.
  - **apply** `{confirm:true}`:
    - A data file he changed that the update also changes is copied to `_archive/update/<time>/` first. A file the update does not
      touch is kept as it is.
    - His edit to code the update changes stops it, named. So do local commits: merging is his.
    - Then `git merge --ff-only`, and `npm install` only when `package-lock.json` changed.
    - Every update is a row in `data/update/history.jsonl`.
  - **rollback** `{confirm:true}`: back to the commit the last update came from (`git reset --keep`, which refuses to drop his edits).
  - **adopt** `{from, confirm:true}` (`node lib/nexus-update.js adopt <old folder> --yes`): the one-time move from an unzipped folder into
    the clone, run before the clone is started. His state comes across, code never does.
- **Routes** (Idearium): `GET /api/update`, `GET /api/update/history`, `POST /api/update/apply|rollback|restart`. Apply, rollback and
  restart are ADMIN.
- **Commands:** `update`, `update apply --yes`, `update rollback --yes`, `update history`. An agent going through `nexus.command` is
  refused apply and rollback. Those are his.
- **The tool:** `nexus.update.tool` (check · history · apply · rollback) is on the co-pilot hat (`the_clearglass_operator`, added once
  per install by `SEED_ADDITIONS`). That follows his 2026-09-19 "copilot should be a hat": any agent wearing it has the tool.
- **The Clear Glass co-pilot:** `update.check|apply|rollback|history`. "is there an update?" runs the check with no model. The apply is
  always his "yes".
- **The page:** `idearium/ui/update.html` (`/update` in the CLI). It shows:
  - what is newer, with his words for each release;
  - Update and Roll back, each asking first;
  - a Restart button for each system the update changed, through the supervisor (the same call as NC2's system control).

  The tool never restarts anything (UP_D2).

## Found by its own test (§0.1)
Git's status lines start with a two-column code (` M file`). Trimming them lost the first column, so a data collision was never seen and
the fast-forward refused instead. The status is now read untrimmed. UP-04 is the check.

## Proof
`tests/modules/test-nexus-update.test.js`, 9/9, on real git repos in a temp folder: an origin with a newer release, and an install one
release behind it.
- detect;
- check, with his quote;
- refusals: no confirm, a code collision, local commits;
- the data file archived, then the update;
- rollback;
- the wiring;
- UP-09: adopt;
- UP-08: the Updates page driven in Clear Glass (glass.js) over the real `lib/nexus-update.js`. It updated the clone, then rolled it back.

`check` was also run against the real GitHub from this container: 0.60.251 on both sides, up to date. loom-map 19/19.

## For his machine
His install, `D:\Backups\Downloads\nexus-0.60.250`, is an unzipped folder, so the tool says it cannot update it in place. Once:
1. `git clone https://github.com/HorrisEllis/Nexus.git`
2. In the clone: `node lib/nexus-update.js adopt D:\Backups\Downloads\nexus-0.60.250 --yes`. His state comes across (every file the
   clone ignores, such as Cortex's memory stores, plus his runtime copy of every tracked file under a data/ folder, with the clone's copy
   kept in `_archive/update/`). Code and node_modules never do, and the old folder is only read.
3. `npm install`
4. Start Nexus from the clone.

From then on, `idearium update`, the Updates page, or the co-pilot does it.

## Open
1. UP5, the COS driver (his end state). It waits on COS's Windows build being verified, and on him running Nexus from the COS app.
2. `adopt` brings his tracked data files across as his runtime copies. Where a newer release changed one on purpose, the release's
   copy is in `_archive/update/<time>-adopt/`, not lost. The next `update` brings it back only if that release changes the file again.
