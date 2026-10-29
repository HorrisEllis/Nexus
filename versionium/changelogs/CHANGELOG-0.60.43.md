# 0.60.43 — 2026-10-15

James: "Is this going in a good direction." · "Yes like gates can asses if dependacies are being met or if context is needed."

## QA2: one phase build, end to end, with the real Versionium

Until now, GS1's rewind, GT2's gate tags and RN1's releases had each been proven only with Versionium stubbed out. This run uses the real Versionium routes and store (sandboxed), the real Idearium phase build, the repo, injects, RAID and the proof run. Only the model is stubbed, because this container has no Ollama.

What held, all together:

1. **A half-write is caught and undone.** The first reply for `lib/notes.js` was missing the `list` export. The brick failed (capability), was rewound to the build's snapshot (the half-written file removed from disk), was retried, and passed.
2. **Every gate that passed is tagged** on a real commit of the repo's Versionium branch, and the tags can't be moved.
3. **Progress is complete.** RAID shows 2/2. Every gate move is on the Plan's ledger, in order, none missing, and the moves are in the activity log too.
4. **Releases work after a build.** A release cut afterwards (v0.1.0) lists the build's 5 commits. A second cut with nothing new is refused.

**Found by the run and fixed:** the record read *rewound → failed*. The rewind ran, and reported itself, before the failure was reported. It now runs after, so the record reads *failed → rewound → retried*, the order it actually happened.

**The numbers:**

| Measure | Value |
|---|---|
| Agent calls | 4 (1 plan, 2 notes, 1 test) |
| Gate moves | 5 |
| Gate tags | 3 |
| Release tags | 1 |
| Versionium commits | 5 |
| Plan ledger rows | 14 |
| Time | about 7.8 s |

**Not proven here:** a real model's output, timing on a 4 GB GPU, and the Plan as drawn in Clear Glass. That run needs James's machine.

## Proof

- test-qa2-real-run: 5/5.
- These suites still pass with no changes:
  - gate-versioning: 6/6
  - gate-tracking: 4/4
  - contract-gates: 20/20
  - recursive-split: 5/5
  - contract-phase-build: 11/11
  - raid-runs-contract: 7/7
  - contract-adapters: 19/19
  - chunked-phase-build: 15/15
  - hardening: 9/9
- CT0 was re-checked.
- One note: contract-phase-build failed 0/11 once, run immediately after the first QA2 run. The likely cause is the Versionium port not yet being released. It passed 11/11 in both reruns, including one run straight after QA2.
