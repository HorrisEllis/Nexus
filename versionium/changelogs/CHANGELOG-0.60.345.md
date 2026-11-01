# 0.60.345 — the Emergence page in COS, and Emerge bottom-up mapped

James, 2026-11-01: "i also meant cos ui" · "emerge could also use the same anomoly detection for bottlenecks. also using nexus component
registry, wire, hooks, and component logic. also what if we use you to build emerge from the bottom up. could be better than you. say we only use
enterprise grade code. only the most effective methods and strategies. cant innovate the problem, innovate the method."

## COS's Emergence page (cos/ui/emergence/)
- **One page, two homes.** It is the TV channel's own script and pieces, served read-only by COS's cockpit server from
  lib/ui/tv-shell/channels/emergence/ (that folder, its .js and .css only). No copy is kept.
- **COS's look.** It wears COS's theme: page head, panels, tokens.
- **COS's door.** It reads GET /api/cos/emergence/patterns | liminal | sessions, listed in COS's contract:
  - COS asks Intelligence through its routes, its origin taken from Intelligence's declaration. A silent Intelligence is a 503 that names it.
  - His runs come from the kernel (lib/emergence.js).

## Mapped, not built: docs/2026-11-01-emerge-bottom-up-phasemap.spec
His bar (EB_D0) is enterprise-grade only, and "cant innovate the problem, innovate the method". The phases:
- **EB1:** the registry read whole. Kinds across files, `eg components` following `use`, the checker across files.
- **EB2:** an Emerge project in Loom, with real wires.
- **EB3:** Intelligence's bottleneck detectors over an Emerge run.
- **EB4:** Emerge rebuilt module by module through his emergence loop.
- **EB5:** "better" measured on Emerge's bench, not asserted.

## Proof
- test-emergence-channel 8/8. EC-08 runs the real COS manager and cockpit servers with a stand-in Intelligence, and drives the page in Clear
  Glass.
- test-cos-ui 6/6.
