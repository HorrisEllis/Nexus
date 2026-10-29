# 0.60.190 — 2026-10-21 — An approved change, connected end to end

James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log when
approved. what about an api route or the pulse emission system"

The ask is his. The coder's part: checking what already held, and building what didn't.

## What already held, and what didn't
| What you asked for | Before |
|---|---|
| Changes logged | Yes. Every approval was a row in the repo's activity log. |
| The diff snapshotted in Versionium when approved | Yes for a repo (VR1). For Nexus's own tree, a commit by the sync that didn't say who approved what. |
| A change log | No. A commit's message was just "1 file: x — by person". |
| An API route for it | No. Only the raw commit list. |
| The pulse emission system | No. Idearium's events stayed on its own bus. Only "idea created" and "booted" reached the orchestrator's ledger, each through its own hand-written copy of the same call. |

## What's built (decided by your axioms: one record, §7.6 and §0.3)
- **The change log lives in the commit.** An approved change's entry is written into the Versionium commit of its diff. The commit's
  message is the change-log line, for example:

  `GR1_loud_b · src/a.js: make b loud (+2 −1) — approved by james`

  The commit also carries the full entry: why, each file with lines added and removed, who proposed it, who approved it, the run it came
  from, and who started that run (RC7). The change log you read is built from the commits, so it can't drift from the diffs.
- **The same for Nexus's own tree.** An approval there rides on the system's sync commit. If that commit fails, the entry goes back in
  the queue. A failed commit in a repo keeps its entries too.
- **Where to read it:**
  - `GET /api/repos/:uuid/changelog` (`?all=1` includes commits with no approval);
  - the command `repo changelog <repo>`;
  - the repo drawer's Versions view, which shows each commit's change-log lines: ✓ approved, ↺ reverted, the run and who started it.
- **The pulse emission system.** Five events now go onto the orchestrator's ledger:
  - a run started, with who started it;
  - a change approved or reverted, with its entry;
  - a version committed, with its entries;
  - a release.

  The orchestrator records each one in Idearium's own event ledger, writes it to disk, and broadcasts it as `ledger.entry` on SSE. That's
  the spine your 0.39.173 "make pulse emission an event" built, and what BrainOS and the coming Flow graph listen to.
- **Nothing lost.**
  - Emission goes through the shared client's `postDurable`, so if the orchestrator is down the event is buffered on disk.
  - Nothing in the tree ever drained that buffer, which also means the failure modes `lib/failure-post.js` buffered were never
    delivered. Idearium now drains it every minute.
  - `GET /api/ledger/out` and the command `ledger out` show what was sent, buffered, drained and failed.

## Measured
- `test-approval-chain` 6/6, against the real Idearium API and Versionium's own routes on a sandboxed store:
  - **APC-01:** the entry;
  - **APC-02:** one commit, carrying the entry from a real run row, with the activity log saying it;
  - **APC-03:** entries survive a Versionium outage, and gate entries wait and come back;
  - **APC-04:** the route and the command;
  - **APC-05:** the ledger, with approval then commit carrying the same inject, counted;
  - **APC-06:** the drawer, in Clear Glass.
- The spec compiles at full depth (`test-substrate-spec`).
- The phase graphs show no new crossing between systems.

## Not done, said
- **Approvals that skip the `change.approved` event.** The repo's auto mode and the upload answer approve through a different door.
  Their commits still carry the entry and still emit `version.commit`.
- **Not run on your Windows machine.** To check there:
  - approve a proposal, then run `repo changelog <repo>`;
  - run `ledger out`;
  - open the orchestrator's ledger and look for `idearium.change.approved`.
