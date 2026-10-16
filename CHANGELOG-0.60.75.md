# 0.60.75 — 2026-10-16

James: "pipeline is vitam, the intent and ruoting and chubkiing and gating"

James, 2026-10-15: "each contract tracked through the system using the event ledger, tagging and each gate"

James, deciding GW0: "Yes. It’s analysis. The bricks."

This is GW3 of `docs/2026-10-15-gate-held-work-phasemap.spec`, the first slice. It is step 2 (gating) of his order in the
pipeline-focus map. The brick is the unit, so the trace is per brick.

## What changed

- **`cortex/core/raid/contract-trace.js`** (new) joins what Nexus already writes during a build into one timeline,
  oldest first:
  - the contract's own evidence log: every record, with who wrote it and when;
  - its checkpoints: each pass, with its input hashes and the commit it passed at;
  - every ledger row of the run: each brick move, with the agent, the failure class, the file and the commit;
  - RAID's queue row for the contract.

  It is a projection, not a second record.
- **Per brick:** who built it (scheduler entries excluded), its files (a rewound file included), its commits, its
  attempts and any rewind.
- **Holes are named, never filled:**
  - a pass with no commit, which cannot be rewound to;
  - a move with no agent named;
  - a brick that ran according to its state but has no move on the ledger;
  - a checkpoint commit that no move carries.
- **Delivered in order:**
  - backend: `contract-trace.js` above;
  - route: `GET /api/repos/:uuid/phases/contract?trace=1`;
  - command: `repo contract <repo> <phase> --trace` (lines, then bricks, then holes);
  - UI: a **trace** button on the Plan panel's contract row.

## Proof

- `tests/modules/test-contract-trace.test.js` 5/5. A fixture contract has each hole planted, so the test fails if the
  trace stops naming one.
- `tests/modules/test-contract-phase-build.test.js` 12/12. The new CP-05b traces a real contract build through the
  router: both bricks passed, each with its agent, its file, a ledger move and a checkpoint, in time order.
- Loom suites green; the build-path census is unchanged (no new agent calls).

## Open (GW3 continues)

- `contract:<id>` and `gate:<id>` are not yet written onto the component ledger and bus events (`contractUuid` is a
  column nobody passes).
- File writes are not yet recorded with before and after hashes.
- There is no response node per move.
