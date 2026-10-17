# 0.60.127 — 2026-10-17

James: "shadow and negative space reasoning for debugging. maybe every repo has to generate a component registry. the
component registry can also be a dependancy graph?
yes, interaction contract and event bus and queue and dependancy and wiring harness and spine and the only way to interact
between the systems using the api routes and the cli interface, with a handshake verification for the ui and handoffs for
contracts and nodes, etc for tracking, debugging, making the ui disposable, soveriegn.

cos is the isolated compartment for each system using the regisry as a drawbridge"

## His decisions, recorded

His decisions are in `docs/2026-10-17-system-drawbridge-phasemap.spec`, addendum (a):
- The registry is the interaction contract, the event bus, the queue, the dependency graph, the wiring harness and the
  spine.
- The routes and the CLI are the only way between systems.
- There is a handshake for the UI, so the UI is disposable and the system is sovereign.
- Handoffs carry contracts and nodes.
- COS is each system's isolated compartment, with the registry as its drawbridge.

What is still open, and the coder's readings:
- **DB0b, to confirm:** the coder recommended that a call inside one process could use the same contract without HTTP.
  His words say routes and CLI. The coder reads COS compartments as making that physical, and names the cost: calls made
  thousands of times a run become HTTP calls.
- **DB0a, still open:** the coder recommends that `lib/` is the shared kernel, mounted into each compartment.
- **Phases added:** DB9 (every repo generates its registry), DB10 (shadow and negative space at the drawbridge), DB11 (a
  COS compartment per system) and DB12 (the UI handshake).

## His question: can the registry be a dependency graph?

Yes. It already is one in two places:
- loom's wires are require() edges;
- `idearium/repo/architecture.js` already generates any repo's registry, with components, wires, consumers and orphans.

What was missing was the same thing for Nexus's own systems, and the comparison between what each one declares and what is
there.

## Built: DB9 + DB10

`lib/drawbridge-registry.js` composes three existing pieces and adds no new scanner:
- **The declared half** is each system's `registry-components.js`, checked against its source by loom
  (`loom/scanners/capability-map.js`).
- **The observed half** is DB1's crossings: what each system depends on, and who consumes it.
- **The negative space** is his idea of 2026-09-29, built as `lib/shadow.js` in 0.39.282. The registry is the shadow, and
  the difference from the source is the data:
  - **absent:** 27 of the 544 declared routes are not served by their system's source (cortex 4, idearium 5, others).
  - **extra:** 195 files are reached directly by another system, past the drawbridge: intelligence 40, cos 36, cortex 23,
    copilot 15.
  - **no registry:** 16 systems are used by other systems and have no registry at all, cos among them. This matters
    because COS is meant to be the compartment.
- `settle` turns each absence into a gap and a liminal item, the same path build steps use, so intelligence can reason
  over what is missing at a boundary.

Routes: `GET /api/system/registry` (the graph), `GET /api/system/registry/:system`, `POST /api/system/registry/:system/settle`.
Command: `system registry [<system>] [--settle]`.

## Found and fixed

- Loom's capability map never read the registries of **intelligence** (61 routes) or **versionium** (13). Both are now
  in loom's self-model.
- DB1 named a file by its require() string, so `intelligence/cfr/field` and `intelligence/cfr/field.js` were two names
  for one file. It now resolves the real file. `contracts/drawbridge-baseline.json` was rewritten the same day it was
  made: 532 edges became 530, because 2 were the same edge under two names. That is the only change in it.

## A mistake, said

The first commit of this release (5e514f2) wrote this module as `lib/system-registry.js`, which overwrote a file of the same
name: his 2026-09-06 "need a system registry." That module merges the running kernels' ports, health URLs and versions from
autopilot, diagnostic and `lib/version.js`, and `cli/compartments.js` and `copilot/server.js` use it. Its test,
`test-system-registry.js`, went from passing to 0 of 9.

The full suite found it before anything reached main. It is restored byte for byte from main, and this module is now
`lib/drawbridge-registry.js`. The coder had not checked that the name was free: rule 2 (reuse before build) and §0.3
(nothing lost).

That module is also the runtime half of the registry he described: which systems are up, on which port, at which
version. DB5 (the handshake for every system) composes it rather than building another.

## Proof

- `tests/modules/test-drawbridge-registry.test.js`: SR-01..08 pass. SR-07 calls the real routes. SR-08 settles cortex into
  the test sandbox, never into the real data.
- `test-system-boundary` SB-01..08 still pass, as do the loom tests (loom-map 19, capability-registry 8, the phasemap
  tests and clear-glass-gig 7).
