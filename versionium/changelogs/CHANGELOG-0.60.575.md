# 0.60.575: a run that stopped is noticed (PC8 slice stall)

James, 2026-11-18: "okay, needs to detect when it's not running"

Why: NM1's dag step timed out while Idearium re-indexed after a restart; the request stayed "active" and nothing moved until he asked "what is going one".

- `cos/pipeline/stall.eg` (Emerge): a failed step with a transient reason (timed out, ECONNREFUSED, ECONNRESET, socket hang up, 503, not answering)
  resumed fewer than 3 times → resume after 30, 60, then 120 s; else → stalled, held for him; no failed step → nothing.
- `cos/pipeline/cli.eg`: the command `stall`.
- `cos/pipeline/index.js`: on `automation.pipeline.done` with the request not met, the check runs (outside the event queue); each decision a COS
  console line (`[cos/pipeline] resuming|stalled: <request> — why`) and an event (`pipeline.request.retried` | `pipeline.request.stalled`); the
  resume counts kept in `<data>/stall-resumed.json`.

Mapped first: docs/2026-11-08-pipeline-canvas-phasemap.spec, PC8 addendum 2026-11-18.
Proof: eg test cos/pipeline/test/stall.test.eg 2/2; gate.test.eg 10/10; the CLI command answered a timed-out dag step with resume after 30 s.
Not covered: a run that hangs without ever ending (IF3 slice e).
