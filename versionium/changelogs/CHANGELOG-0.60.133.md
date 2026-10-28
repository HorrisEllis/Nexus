# 0.60.133 — 2026-10-17

James: "need to get the systems soveriegn again like we were talking about"

The migration map (`docs/2026-10-17-infrastructure-migration-phasemap.spec`) waits on his four answers (IM0a-d). This release
does the part that needs none of them: measure, then make the least depended-on running system sovereign end to end, so the
pattern is proven before it is repeated. `lib/` is treated as the kernel throughout. That is the coder's recommendation for
IM0d/DB0a, not yet his decision.

## IM1: the census as a command

`system sovereign [<system>]` (`GET /api/system/sovereign`, `lib/system-boundary.js` `sovereignty()`) shows which systems
are sovereign, meaning nothing they require is in another system's folder. For each system that is not, it names the
blockers by kind:

| Kind | What it is | Where it goes |
|---|---|---|
| **data** | its tables kept in cortex's one store, through `cortex/memory/jaa-db.js` | its own store (IM6) |
| **primitive** | a building block every system uses, living in one system's folder: the bus, the connector, warp's core, siso, hooks | the kernel (IM4). The list is the coder's reading and his to change |
| **capability** | another system's capability, required as a file | that system's route (IM3) |

Sovereign today: nexus-healer and sentinel among the running systems, plus the folders that require nothing outside
themselves. Nearest after them:
- cockpit: 1 blocker, data;
- warp: 1 blocker, a capability;
- emerge: 5;
- cos: 5, 4 of them primitives;
- architect: 6.

## IM6: a system's own database

`lib/system-store.js` `openStore(system, { tables, migrate })` opens `<system>/data/jaa`. That is the convention guardian
and clear-glass already use. It keeps jaaDB's call shapes, so a system moves home by changing one require.

Its tables come home once: copied from cortex's store the first time the system's own table is empty, and recorded as
`migrated.<table>`, with the row count, the source and the time. The rows in cortex's store are kept (§0.3), and are
archived later once nothing reads them (IM2). In a test the store is in the sandbox, never in the real tree.

## The first running system made sovereign: nexus-healer

| Before | After |
|---|---|
| `require('../../cortex/memory/jaa-db.js')`: its `healer_proposals` table inside cortex's store | its own store, `nexus-healer/data/jaa`, with the table brought home once |
| `require('../../intelligence/rfr2/forge/index.js')`: intelligence's forge, required as a file | asks intelligence over `POST /api/intelligence/rfr2/forge/patch`, a new route declared in intelligence's registry, found through the tunnel (`lib/system-registry.js` `get('intelligence')`) |

An unreachable intelligence is said, never faked. What nexus-healer requires now is only the kernel: `system-store`,
`system-registry` and `node-export`.

## The store's requires repointed

The 9 files that required `guardian/jaa-store.js` (clear-glass ×4, copilot, cortex, intelligence, versionium and two in
`lib/`) now require `lib/jaa-store.js`, where it moved in 0.60.130. The old path still re-exports it.

Two tests checked the old require's text, `test-artifact-index-jaa` JX-01 and `test-cookie-vault-jaa` VJ-01. They now
accept either path. What they test is unchanged: no sqlite, storage is the JAA store.

## The ratchet

From 552 down to 540 crossings: 12 closed, and the baseline lowered so they cannot come back. The closed edges are listed in
`contracts/drawbridge-baseline.json` under `closed`, with the reason.

## Proof

- `tests/modules/test-sovereign-systems.test.js` SV-01..08 pass:
  - SV-01: the store brings a table home once and keeps the source;
  - SV-02: the store is in the sandbox during a test;
  - SV-03: nexus-healer has no crossing out;
  - SV-04: intelligence's route is owned and declared, and refuses a bad request;
  - SV-05: nexus-healer proposes into its own store;
  - SV-06: a round trip to a stand-in intelligence on its registered port, through the tunnel;
  - SV-07: an unreachable intelligence is said;
  - SV-08: the census, its route and its command.
- Passing: jaa-db 53, deletes-stick, pf3 append, artifact index 9, cookie vault 7, cookie IPC, versionium-sovereign 11,
  the inject tests (repo-inject 83), hook-ownership, bus-subscriptions, table-deduplicator, node-registry 11,
  system-boundary 10, loom-map 19.
- Not this release's, same counts as before it:
  - test-guardian-data-sovereignty, 3 failing;
  - test-guardian-cfr-consolidation, 2 failing;
  - healer.test.js, which needs `cortex/healer/index.js`, a file that does not exist.
