# 0.60.328 — COS's supervisor (MG15)

James, 2026-10-31:
> "okay we need the orchastration completed." · "do it 72% be effecient, and save as much tokens as possible"

## Built

- **`cos/manager/supervisor.js`, COS's one supervisor.** It reads the plan from what each system declares in its compartment.json (MG15a).
  Autopilot's rules are kept exactly:
  - A crash restarts after a backoff that doubles from 1 s to 30 s, and resets after 60 s up.
  - Six crashes in 5 min open the circuit. A port held by another process (EADDRINUSE) opens it at once.
  - A spawn is refused below 10% free memory (5% for a critical system) and tried again 15 s later.
  - Every Node child gets its heap cap and `--expose-gc`.
  - Boot runs phase by phase, each phase waiting up to 30 s for health.
  - An on-demand system starts on touch and stops when idle.
  - Clear Glass exiting cleanly within 20 s is another instance, not a crash.

  New:
  - Every act is written to the ledger before it happens.
  - `bootSet: 'core'` is CS4a ("COS boots alone").
- **`cos/manager/server.js`:** `/api/cos/*` on :7799, 127.0.0.1 only.
  - Every act must say who acts (MG-006).
  - While autopilot holds :7799, it says so and exits, so there is never a second supervisor (MG-001).
- **Idearium:** `/api/cos/*` reaches it by name, with `cos` added to the ports table. Command rows: `cos ps`, `cos <start|stop|restart|touch|reset-circuit> <system>`,
  `cos boot [all|core]`, `cos ledger [system]`.
- **Loom:** both files are registered with their wire.

## Found by the test

A system started outside of boot stayed "starting" forever: its health was read once, at spawn, before it was listening. Now it is
watched like a boot phase, and if it never answers it is marked "degraded" and the reason is said.

## Proof

- `tests/modules/test-cos-supervisor.test.js` **8/8**, on real child processes. The defaults are read against autopilot's own constants.
- Command-table suites pass. CL-07 fails on main without this change: it needs Guardian running.

## Not yet

Autopilot still runs everything. Next are MG16 (the old door's routes answered by COS) and MG17 (the handover).
