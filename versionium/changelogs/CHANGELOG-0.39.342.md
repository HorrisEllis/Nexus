# 0.39.342 — 2026-10-05

James: "remove the polling then. need the systems to anounce themselves. that way i can add new systems automatically. also optimizes performance." · "use negative space reasoning for missed heartbeats."

PR1–PR3 of `docs/2026-10-05-announce-pulse-repair-phasemap.spec`. The map was written first, with four pushbacks for him.

- **`lib/pulse-watch.js`, new.** It is fed beats and does no polling.
  - A system is known from its first beat.
  - Each beat is a WARP 2 link, caused by the one before, that expects the next within the system's interval × 1.5.
  - A broken expectation is a gap naming the system, its last beat and how long it has been silent. A late beat recovers it.
  - An expected system that never announces is a gap after 60 s.
  - The ledger is rotated past 20000 entries, so a diagnostic running for days does not grow without bound.
- **`diagnostic/nexus-diagnostic.js`** listens to orchestrator's `/sse` and reads the registry once, at start and after a lost stream.
  - Gone: the 15 s `/health` probe of every system, and the per-system registry checks.
  - A system that announces itself is adopted, with no file edited.
  - `GET /pulse` shows what it sees.
  - clear-glass pulses as nexus-wire, and forge-shell (a page orchestrator serves) as orchestrator.
- **End to end.** The real diagnostic ran against a stand-in orchestrator:
  - a new system was adopted from its first beat;
  - one that went silent at 22 s was named at 36 s ("silent 16s, expected every 10s");
  - the silent system's port received zero requests.

  This run found a bug the unit tests had missed: what broke during another system's beat was dropped. It is fixed and tested (PW-02b).
- **Tests.**
  - `test-pulse-watch` 6/6 (registered).
  - `test-health-authority` 9/9. HA-001–004 and HA-009 were rewritten to the new rule: the pulse decides, and nothing is probed.
  - diagnostic-heal-path, system-registry and boot-log-fixes pass.
  - `healer.test.js` fails before and after this change: it reads `cortex/healer/index.js`, which does not exist.
- **Open:** PR4 (deviation reported in the pulse quickens it) and PR5 (repair through autopilot).
