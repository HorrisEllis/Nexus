# 0.60.126 — 2026-10-17

James: "lets work on wiring everything together. i want to eventually have the component registry for each system be the interaction contract and event bus, with handshake verification. basically the spine of each system, like looms component registry but as the drawbridge for each compartment for each system, the only way to interact between systems. using the api routes, and cli interface. ui floats ontop"

Just before, on the debugging systems: "need the debugging, intelligence,cos and debugging system, cfr and rfr2, sigma deviation
and tensino and frictoin system for debugging. should be soome phases recentlty"

## What was there

His design already exists in one place: the COS archetype (`cos/archetype/nexus-system`). There, `registry-components.js` is
"the spine. Every component connects only to this". `lib/bus.js` is the one way an event moves. `lib/handoff.js` is the
drawbridge, and it quotes him: "each system hands the file off to the target system, using the registry and handshake
verification to tag the progress and success or failure of the handoff and why."

No existing Nexus system was built from it. Thirteen systems have a `registry-components.js`, but in each it is a list of
routes, with no consumers, no wires and no events. `orchestrator/lib/contract-handshake.js` verifies systems that run as HTTP
services, not code that one system requires from another.

## Built: DB1, the census and the ratchet

Before the drawbridge can be the only way between systems, the other ways have to be seen.

- `lib/system-boundary.js` reads every system's source and finds each `require()` or `import` that lands in another system's
  folder. Measured on Nexus today: 953 file-to-file crossings in 1,589 files.
  - 277 go system to system (copilot → cortex 15, orchestrator → cortex 14, meta → intelligence 11, …).
  - 255 are `lib/` reaching up into a system (lib → cortex 75, lib → cos 51).
  - 421 are a system using `lib/`. These are allowed until he decides DB0a ("is lib/ a system?").
- `contracts/drawbridge-baseline.json` holds the 532 system and upward edges as they are. This is a ratchet: a new crossing
  fails `tests/modules/test-system-boundary.test.js` SB-06, and moving one to the drawbridge removes its line. It holds file
  edges, not counts, so a move cannot hide a new crossing. This is the same pattern `contracts/event-contract-baseline.json`
  already uses for events.
- `GET /api/system/drawbridge` (`?new=1` returns only the drift) and the command `system drawbridge [--new]`, so every
  agent has it through nexus.command. The loom wires are in `loom/maps/run-state-map.js`.
- The UI is DB7, and it is deferred. Today the numbers are reached through the command and the route.

## His to decide (the coder's recommendations, named as the coder's)

- DB0a: is `lib/` the shared kernel (recommended) or a system behind its own drawbridge?
- DB0b: one contract with two transports, in-process or HTTP (recommended), or HTTP always?
- DB0c: is it enforced by the ratchet (recommended, built), by observing only, or by refusing now?

## Proof

`node tests/modules/test-system-boundary.test.js`: SB-01..08 pass. SB-08 calls the real route.

Next, in the map's order: DB2 (each registry says what it offers, seeded from the crossings), then DB6 starting with the
debugging systems (cfr, rfr2, sigma, friction, tension), which is GW23 done through the drawbridge.
