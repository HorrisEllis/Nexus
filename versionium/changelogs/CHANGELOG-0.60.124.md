# 0.60.124 — 2026-10-17

James sent three screenshots and the full log of `npm run start:all` from a fresh 0.60.122 download, with no words. In the
third screenshot every dock panel sits at "reading…" and Home at "loading the Nexus atlas…". The coder's reading, to
confirm: fix what the log shows is broken, root causes first, as with his earlier logs ("next. fix anything you can.").
Recorded in `docs/2026-10-16-code-tab-rebuild-phasemap.spec`, addendum (g).

## SW1 — Idearium stays responsive while it syncs the Nexus repo

- **In his log:**
  - "'idearium' missed its heartbeat — silent 17s", then "[watchdog] idearium → OFFLINE" for 34 s, and 25 s more ten
    minutes later.
  - Each silence is the self-sync's import pipeline. It is synchronous from start to finish, and core has 2,556 files:
    it took 24 s at boot, and 5.9 s after a one-file change.
- **What that caused:** while it ran, Idearium answered nothing.
  - The dock's panels stayed at "reading…".
  - RAID's intake logged "idearium unreachable or refused".
  - Versionium's calls timed out.
- **Fixed:**
  - `runImportPipelineOffThread` runs the same pipeline in a worker thread (`idearium/repo/import-pipeline-worker.js`).
  - The self-sync uses it for every system and for the parent index.
  - If the thread cannot start, the pipeline runs inline as before, and the result says so.
- **Measured on 447 files of `lib/`:** inline, the event loop was held for 4,183 ms; in the thread, 15 ms. The result
  is the same.

## SW2 — Guardian no longer loops on a signed-out tab

- **In his log:** "claude needs a sign-in … its jobs wait", then "flushing 1 queued jobs → claude" every 3 s for five
  minutes, with the connection flapping.
- **Why:** each flush dispatched the job. The tab opened the job's chat, the site sent it back to sign-in, and the tab
  reconnected. The next connect flushed again.
- **Fixed:** a fresh sign-in wall holds the queue, and Guardian says so once. When the tab reports it is signed in, the
  queue flushes. A wall older than five minutes no longer holds jobs, so a lost "signed in" report cannot strand them
  (`guardian/lib/provider-login.js` `holdsJobs`).

## SW3 — COS's system map on Windows

- **In his log:** about thirty "persist failed: EPERM … rename" lines in 5 s, from Idearium and the orchestrator writing
  the same file.
- **Fixed:** the rename is retried. If it is still refused, the file is written in place, and that is said once a
  minute.

## Proof

`tests/modules/test-sync-off-thread.test.js` passes 4/4:
- SW-01: same result off the thread as inline.
- SW-02: the event loop stays under 250 ms on a real tree.
- SW-03: the sign-in hold.
- SW-04: EPERM handled.

Neighbouring suites, all passing:

| Suite | Result |
|---|---|
| test-nexus-self-incremental | 5/5 |
| test-versionium-repo-history | 7/7 |
| test-nexus-inject-approval | 9/9 |
| test-agent-index-ready | 4/4 |
| test-idearium-source-files-async | 4/4 |
| test-import-pipeline-syntax | 12/12 |
| test-mco2-verify-deepening | 18/18 |
| test-repo-graph | 53/53 |

Two failures that were already there before this release:
- test-nexus-atlas-refs: the `products` directory is not in the atlas.
- COS's "stamped event has seq".

## Seen in the log, not changed here

- **His copy was 0.60.122.** The 0.60.123 memory work was not in it, so Eros started and memory went critical at 13:25
  and 13:46. Updating to this release brings both.
- **The self-sync's versions step** (18 s in his second sync) still builds its payload on the main thread. It is next.
- **The PC1 build** reached attempt 12 across five agents and ended contract-incomplete with thin files. That belongs
  to the scale phasemap.
