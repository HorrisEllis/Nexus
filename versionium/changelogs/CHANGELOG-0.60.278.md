# 0.60.278 — every change and every version goes to Versionium, in full

James, 2026-10-29: "can you add that to claude. full changes, and versions have to be pushed to versionium? enforce it everywhere that
you'd find it. maybe the axioms"

The coder's reading, to confirm: "full changes" means each path before and after, not a pointer. Mapped first:
`docs/2026-10-29-versionium-everywhere-phasemap.spec`, with the audit, decisions VE_D1 and VE_D2, and phases VE0–VE5.

## The law (VE0)
- **§17.12 Every Change and Every Version Is Recorded in Versionium, in Full** (`docs/AXIOMS-v3.1.md`, Group 17). Wherever a change or a
  version is made, it is recorded in Versionium with:
  - each path before and after;
  - who made it, why, and the version it belongs to.

  A record made while Versionium is down waits and is never dropped. A dated addendum explains it, and there is one quick-reference line.
  Checked by script: 102 laws, 102 quick-reference lines, matching both ways.
- `CLAUDE.md` says it right after "read the axioms first". `docs/CLAUDE.md` says how: the one recorder, where it is enforced, and the
  coder's duty to record any new place.

## The one recorder (VE1): `lib/versionium-record.js`
- **`record({ kind, system, message, change, by })`** posts a Versionium commit through its contract (`POST /api/versionium/commit`),
  carrying:
  - branch `nexus.<kind>`;
  - system `nexus.<system>`;
  - state `{ kind, by, at, version, change }`.

  It goes through `lib/nexus-client.js` `postDurable`. When Versionium is down the record waits in the disk buffer, and Idearium's
  minute-by-minute `drainBuffer` delivers it.
- **`fullChange(items, { readBlob })`** holds each path's text before and after. For binary content, or text over 256 KB, it holds their
  hashes and a note saying why and where the bytes are.
- **`pending()`** says what still waits (new: `nexus-client.pending()`).

## Where it was not, and now is
| Gap | Where | Now |
|---|---|---|
| G1 | `lib/nexus-self/apply.js` | apply, failed apply and rollback are each recorded with the whole change (VE2). The promise rides on the result unseen, so JSON never carries it. |
| G2 | `lib/nexus-update.js` | every update, rollback and adoption is recorded: from and to (commit and version), and the files `git diff --name-status` says changed (VE3). |
| G3 | Versionium's release sync | records every release's commits by default (VE4). It is idempotent: Versionium fills only what a release lacks. |
| G4 | the nexus-self tree snapshots | each names the running Nexus version ("… · Nexus 0.60.278") (VE4). |
| also found | Idearium's committer | it skipped a repo change when `versions.every_change` was off. That switch was the coder's (0.40.0), against his words there, "needs to snapshot every accept, every change". The setting is kept, and the change is recorded and said (VE5). |

Already recorded before this release, and checked:
- the Nexus tree in full (the nexus-self sync, at boot and every 10 min);
- every Idearium repo's versions and releases;
- agent commits;
- the orchestrator's sigma auto-commit.

## Seen (VE5)
- `GET /api/versionium/pending` and the command `versionium pending` list what is still waiting.
- A line in the Versionium tab's Releases says either "N changes waiting for Versionium, the oldest since …" or "every change and version
  is in Versionium".

## Proof
- `tests/modules/test-versionium-everywhere.test.js` 4/4:
  - VE-01: a commit through the contract, with branch, system, the running version and the change.
  - VE-02: Versionium down → buffered and listed by `pending()`; up → drained; nothing left.
  - VE-03: a real nexus-self apply and its rollback, each recorded with both texts of every path; the size cap is said.
  - VE-04: the wiring everywhere it was found.
- Unchanged: nexus-self-and-cos-run 30/30, nexus-inject-approval 9/9, change-pack 6/6, nexus-update 11/11, repo-versions 6/6,
  mco3-versionium-tab 32/32, system-boundary 10/10, route-contracts 4/4, release-notes 6/6 (RN2-06 finds the releases request among the
  view's calls). test-releases keeps its base result (RL-03, a connection reset here).

## Open, said
Clear Glass's own records (macros, node files, settings) are its data, not versions of code. Recording their edits in Versionium is not in
this map; that is for him to say.
