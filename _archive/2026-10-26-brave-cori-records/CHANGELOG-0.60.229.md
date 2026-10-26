# 0.60.229 — 2026-10-24

James: "then we need to resume the component registery for each system, get the mall sovereign, then cos phases to migrate." · then, to "1 registries per system (DB16), COS first … 2 specs via local models": "1"

## Built (DB16, in the drawbridge map; no new map)

`lib/registry-draft.js` drafts a registry for each system that has none. Every line comes from the tree:

- **components:** the routes its `interaction-contract.json` declares. `lib/route-contract-check.js` already holds those to the code.
- **events:** its `event-taxonomy.js`, pointed at and counted, because it is the one truth for its event names (ET1). Beside it, the
  literal event names the system's own files emit and handle.
- **reached_into:** the files other systems require from it today (DB1). Each one is a capability that needs a route before the system
  is sovereign (DB6).
- **sovereignty:** its own way out, split into data, primitive and capability blockers.

Drafts are written for all 16 systems with none: auth, cli, cockpit, cos, emergence, erosmancer, jaa, mesh, meta, nexus, orchestrator,
remote-desktop, security, sentinel, siso, warp. Each is `<system>/registry-components.draft.json`.

**Doors:** `GET /api/system/registry-drafts` (lowest friction first), `GET /api/system/registry/:system/draft`, and `system drafts
[<system>]`. There is no screen yet; the UI is deferred.

## A draft is not in force until he accepts it

`lib/system-registry.js`, `lib/system-nodes.js` and other readers take any `<system>/registry-components.js` as declared. The first try
used that name, which would have put the drafts in force, and it was caught before commit. Drafts are JSON under their own name (JSON
because siso is an ES module package). Accepting one makes it the system's `registry-components.js` and puts the system on loom's SYSTEMS
list.

## Measured: the way to sovereign

- No system is sovereign today.
- Eight have no way out at all: auth, erosmancer, jaa, mesh, remote-desktop, security, sentinel, siso. What they still need is their own
  registry, bus, handshake and compartment.
- **COS:**
  - 5 ways out: 1 data (`cos/manager.js` → `cortex/memory/jaa-db.js`) and 4 primitives (siso, warp/core);
  - 39 of its files reached into by others (`cos/host/index.js` by four systems);
  - its draft has the 7 vaultd routes and the 155 events of its taxonomy.
- The most entangled: orchestrator has 38 ways out, cli 20, meta 12, emergence 9, nexus 8.

## Proof

- `tests/modules/test-registry-draft.test.js` 4/4:
  - **RD-01:** COS's draft from the tree;
  - **RD-02:** every missing system has its draft, and each written draft matches what the tree gives now;
  - **RD-03:** no draft is in force: none is named `registry-components.js`, and loom reads none;
  - **RD-04:** the real API and the command rows.
- Also green: test-drawbridge-registry 8/8, test-system-registry 9/9, mco15-component-boundary-check 5/5, test-loom-phasemap 8/8.
- **Already red on main, not this change:** test-system-boundary SB-06/SB-08 fail the same way without this change. Three crossings are
  not in the baseline: `idearium/repo/roadmap-import.js` → `loom/scanners/phasemap-map.js` since 0.60.199, `lib/phase-dag.js` → the
  same, and `lib/verify-first.js` → `cos/testenv/run-target.js`. test-cli-route-commands CL-07 needs Guardian running.
