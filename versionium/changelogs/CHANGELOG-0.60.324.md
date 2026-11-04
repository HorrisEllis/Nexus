# 0.60.324 — the handshake counts a contract's real routes (DO0)

James, 2026-10-31, after the coder named DO0 as next:
> "yes do that also"

The first of the door phases (`docs/2026-10-31-system-doors-phasemap.spec`). Every door's handshake depends on it.

## The defect

The orchestrator's handshake (`orchestrator/lib/contract-handshake.js`) counted only `contract.routes || contract.channels`.

Clear Glass, Copilot, Ollama and Versionium serve their registry at `/contract`: `components[]`, each carrying its route. So each was
reported with **0 routes**.

## Built

- **`countRoutes(contract) → { count, shape }`** reads every shape:
  - `routes`, as an array or an object;
  - `channels`;
  - `components[]` that carry a route, with any malformed ones counted.

  A contract in no shape it knows gives `null` and `"unknown"`, never 0 (§1.2).
- **`verifySystem`** reports `routeCount` and `routeShape`.
- **The orchestrator's boot line** names the shape, for example "117 routes (as components)".
  - `orchestrator.js` was added to DO0's files before it was changed. This is his phased-only rule, applied for the first time.

## Proof (on the real contracts)

| System | Before | After |
|---|---|---|
| Clear Glass | 0 | 117 |
| Copilot | 0 | 81 |
| Ollama | 0 | 9 |
| Versionium | 0 | 18 |

- Every `routes[]` contract counts as before.
- `tests/modules/test-contract-handshake-routes.test.js` **4/4**. HR-04 runs through `verifySystem` over HTTP.
- `contract-handshake-paths` 8/8 and `copilot-handshake-dispatch` 12/12 pass, as do 20 other contract and orchestrator suites.

## Open

These fail on main without this change. They are said here, not yet traced:
- `test-contract-ct0-self`: CT0-02, stale gates.
- `test-event-contracts`: EC-05, events emitted but not declared (idearium, cos); EC-06.
