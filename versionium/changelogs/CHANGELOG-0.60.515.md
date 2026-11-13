# 0.60.515: two Clear Glass bugs from his console; the orchestrator and autopilot into COS's supervisor, mapped

James, 2026-11-13: "orchastrator and autopilot need to migrate to cos superviser"

## Fixed (from his console, the same hour)
- **`[main-process:unhandledRejection] _erosHold is not defined`** (`clear-glass/src/main/index.js`). 0.60.509 added
  `GET /eros-supervisor`'s reason, which reads `_erosHold` and `_erosAutostart`, but both were declared inside the boot function,
  out of the route's reach. They are module-level now, assigned where they were. Settings › ErosmancerOS no longer throws.
- **chatgpt "script changed on disk, re-injecting…" every minute** (`clear-glass/src/providers/host.js`). The tab sat on its
  sign-in page; `_inject` skips a sign-in page before it caches the script, so the minute's check read "never loaded" as
  "changed". The check now skips sign-in pages and names a first load as a first load.

## Mapped, not built: SW5 expanded (docs/2026-11-13-sovereign-and-wired-phasemap.spec)
The census of orchestrator/orchestrator.js: about 180 route branches, 146 only forward; 21 requires into other systems
(Cortex 17: its RAID worker, officiator, compactor and deduplicator run in the orchestrator's process, which his console shows
as `orchestrator [raid-worker] waiting`). Autopilot's remains (the launcher and core-duties.js) still run as a second process.
Slices SW5a (autopilot's duties into COS's manager) and SW5b (Cortex's workers home to Cortex) first, then SW5c–SW5h.
Two readings his: SW5_R1 (the shell pages and auth), SW5_R2 (how long :9000 forwards).

## Proof
clear-glass-eros-autostart 13/13, test-provider-host-load 5/5, test-provider-host-one-tab 7/7, test-session-hub-signin 2/2.
Not proved on his PC until Clear Glass restarts on this release.
