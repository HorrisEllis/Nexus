# 0.60.450 — the automation engine starts with COS; the orchestrator's merge into COS mapped

James, 2026-11-08: "Cos is meant to be the orchastrator." · "Continue to get the automation done." · "And the orchastrator needs to be migrated
to the cos supervisor."

- **The engine starts when COS starts.** A scheduled or triggered workflow now fires without waiting for a first request; in the orchestrator, the
  engine woke only on one. `--no-automation` leaves it off. The start, or its failure, is written to COS's ledger.
  - Proven on a real COS boot in the sandbox: the manager came up, the ledger line was written, `/api/cos/automation/active` answered, and no
    process was left behind.
- **MG38 is written** (docs/2026-10-24-cos-manager-phasemap.spec). The orchestrator merges into COS in slices, with :9000 forwarding behind each
  one. It starts with a census of its routes, sorted by kind: orchestration, a UI page, a forward, or another system's own data. This answers
  MG_D5's open question with his words.
- **Also recorded from the same message:**
  - "Eravos tools are meant to have a template or schema for building tools" (ERAVOS tools map).
  - "It’s running poorly on my pc": a cost to measure on his machine.
- **Asked of him:** Clear Glass's own engine instance holds his workflows in its own store. Turning it off needs his choice and a migration.
