# 0.60.518: autopilot's duties run inside COS's manager (SW5a); heavy work waits for 25% free, not 30% (CP6a)

James, 2026-11-13: "orchastrator and autopilot need to migrate to cos superviser" · "yes, watch it and start SW5a" ·
"Lower the line for heavy work (CP6a, your load balancing). It's a number to choose, and the choice is yours."

## SW5a: autopilot's remains into COS's supervisor
- `lib/nexus/core-duties.js` → `cos/manager/duties.js` (git mv; history kept). Its six duties (the wire, vitals, updates, the loom
  refresh, the minute's snapshot, following COS's ledger) ran in the launcher's own process beside COS. They run in COS's manager now.
- Inside COS they act on the supervisor itself (`inProcess`: its systems, its restarts), and the ledger is **heard as it is written**
  (the supervisor's `ledger` event), no longer read by route every 5 s (PR6). Only `/idle` still goes by route, to the same process.
- `lib/nexus/autopilot.js` only starts COS. It stays the foreground parent, as the entry COS's exe and the NexusCOS service start: the
  console, Ctrl+C, and starting COS again after an update. `--no-duties` is passed on to the manager; `--duties-only` says where they went.
- `cos/app/runtime.js`: a release hands over when it has `cos/manager/duties.js` or the old `lib/nexus/core-duties.js`.
- lib/ holds no duty (SW_D5).

## CP6a: the line for heavy work
`lib/prevention.js` PREVENT_FREE **0.30 → 0.25**. After one critical moment, heavy work (the RAID worker, its officiator, Idearium's
snapshot) waited for 30% free for a day; his 16 GB machine sat at 26.5–30% all afternoon and nothing heavy ran. 25% is the monitor's
own way back to "ok" after pressure (pressure under 20%, left at 25%), and a heavy job of 0.5–1 GB started there ends above the
pressure line. The coder's choice, by his word. `NEXUS_PREVENT_FREE` (0.05–0.9) changes it without a release.

## Proof
- Launched through `autopilot.js` in the sandbox: one COS manager ran the wire, fan-in, ledger wire, intelligence wiring and the
  snapshot; its ledger says "autopilot's duties run inside COS's manager"; no duties process ran beside it.
- test-autopilot-handover 7/7 (AH-06 added: the ledger heard by event, each line once, the supervisor acted on, the listener let go),
  test-cos-hidden-windows 4/4, test-prevention 8/8 (27% free now runs).
- test-nexus-update UP-07 and test-test-sandbox "every test that starts a NEXUS process puts it in a sandbox first" fail the same
  before this change (checked with it stashed); not looked into.

## Not proved
Vitals, automatic updates and the loom refresh say "skipped: test run" in the sandbox, as they must; they run on his PC.
