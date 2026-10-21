# The approval chain: an approved change interconnected end to end — run, starter, activity log, a Versionium commit of its diff
# carrying its change-log entry, a route, a command, a screen, and the orchestrator's ledger (2026-10-21)

origin: >-
  James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log when
  approved. what about an api route or the pulse emission system"

Build contract: docs/approval-chain.spec (emerge module format, specDepth 1.0).

## Ground truth (2026-10-21, read from the code)

| His ask | A repo | Nexus's own tree (the gate) |
|---|---|---|
| change logged | yes — lib/repo-inject.js _logActivity → activity log inject.applied; repo-versions logs version.commit | inject.applied only |
| diff snapshotted in Versionium on approval | yes — RV.commitNow (VR1, CV2): approver and inject in provenance | the sync's commit "nexus/<system> @ snapshot", no approver or inject |
| a change log | no — the message is "1 file: x — by person" | no |
| an API route | GET …/snapshots (raw commits); no change log | none |
| the pulse emission system | no — events stay on Idearium's own bus and /sse; only idea.create and booted reach POST /api/ledger, each hand-rolled | no |

The orchestrator's POST /api/ledger is the spine his 0.39.173 "make pulse emission an event" built on: ledgerWrite records to the
emitting system's own event ledger (baselines, causal graph), to disk, and broadcasts ledger.entry on SSE. lib/nexus-client.js postDurable
buffers a write when the target is down; nothing in the tree drains that buffer (lib/failure-post.js's failure modes included) — §1.2.

## Decisions

decisions:
  APV0_one_record:
    status: DECIDED
    question: Where does an approved change's change log live?
    chosen: >-
      Decided by his axioms: §7.6 (the codebase is a materialised view of the ledger), §0.3 (nothing lost), §8.6 (reuse). In the Versionium
      commit of the diff itself — provenance.changelog, and the entry's title as the commit message. The change log he reads (route, command,
      drawer) is a projection of those commits; no second store that could drift from the diffs. The emission onto the orchestrator's ledger
      carries the same entry, so every listener sees the same record. He can overturn this by an addendum.

phases:

  APV1_change_entry:
    layer: foundation
    status: DONE 0.60.190 — test-approval-chain APC-01
    depends_on: [APV0_one_record]
    files: [lib/change-entry.js]
    spec: docs/approval-chain.spec
    blocks: [MOD-APV-ENTRY]
    does: "ChangeEntry from an inject and its run: title, why, files with +/−, proposer, approver, run, phase, starter."
    proof: test-approval-chain APC-01

  APV2_commit_carries_it:
    layer: library
    status: DONE 0.60.190 — test-approval-chain APC-02, APC-03
    depends_on: [APV1_change_entry, RC7_every_run_names_its_starter]
    files: [lib/repo-versions.js, lib/repo-inject.js, idearium/repo/snapshot.js, idearium/api/index.js]
    spec: docs/approval-chain.spec
    blocks: [MOD-APV-COMMIT]
    does: "The approval's commit carries its entry (message + provenance.changelog); a gate approval's entry rides on the sync commit."
    proof: test-approval-chain APC-02, APC-03

  APV3_changelog_read:
    layer: api
    status: DONE 0.60.190 — test-approval-chain APC-04, APC-06
    depends_on: [APV2_commit_carries_it]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-drawer-views.js]
    spec: docs/approval-chain.spec
    blocks: [MOD-APV-READ]
    does: "GET /api/repos/:uuid/changelog, `repo changelog <repo>`, the change-log line in the drawer's Versions view."
    proof: test-approval-chain APC-04, APC-06 (Clear Glass)

  APV4_emit_on_the_ledger:
    layer: api
    status: DONE 0.60.190 — test-approval-chain APC-05
    depends_on: [APV2_commit_carries_it]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, lib/nexus-client.js]
    spec: docs/approval-chain.spec
    blocks: [MOD-APV-EMIT]
    does: "run started, change approved/reverted, version committed, released → POST /api/ledger (postDurable); the buffer drained; GET /api/ledger/out."
    proof: test-approval-chain APC-05

  APV5_wired_in_loom:
    layer: library
    status: DONE 0.60.190 — test-run-state, test-loom-map
    depends_on: [APV1_change_entry]
    files: [loom/maps/run-state-map.js]
    spec: docs/approval-chain.spec
    blocks: [MOD-APV-WIRES]
    does: "lib/change-entry.js in loom with its real edges."
    proof: test-loom-map, test-run-state


## ADDENDUM 2026-10-21 (0.60.190) — built

James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log when
approved. what about an api route or the pulse emission system"
- **One approval, every end.** An approved change now:
  - is logged, as it already was (activity log `inject.applied`);
  - commits its diff to Versionium, as it already did. Now that commit's message is the change-log line, and its
    `provenance.changelog` holds the entry: the phase, why, the files ±, who proposed, who approved, the run, and who started the run
    (RC7);
  - goes onto the orchestrator's ledger as `idearium.change.approved` and then `idearium.version.commit`, with the same inject id;
  - can be read back three ways: `GET /api/repos/:uuid/changelog`, `repo changelog`, and the drawer's Versions view.

  A run starting is on the ledger too (`idearium.phase.run.started`, with its starter). So are releases and reverts.
- **Nexus's own tree.** A gate approval's entry waits by system and rides on that system's sync commit. If that commit fails, it goes
  back in the queue (§0.3).
- **Nothing lost.** Emission uses `postDurable`, so when the orchestrator is down the event is buffered on disk. Nothing drained that
  buffer before; Idearium now drains it every minute. That also delivers `lib/failure-post.js`'s buffered failure modes, which were never
  retried (§1.2). `GET /api/ledger/out` and `ledger out` count sent, buffered, drained and failed.
- **Doors not covered by `change.approved`.** The repo's auto mode and the upload answer apply through `RI.apply` directly, so they emit
  no `change.approved`. Their commits still carry the entry and still emit `version.commit`. That is said here, not hidden.
- **Proof:**
  - test-approval-chain APC-01..06, against the real API and Versionium's own routes; APC-06 runs in Clear Glass;
  - test-substrate-spec: the spec compiles at full depth.
