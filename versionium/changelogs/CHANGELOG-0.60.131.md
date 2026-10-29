# 0.60.131 — 2026-10-17

James: "do it. what other systems?"

"It" is P33b, the next step 0.60.130 named. It belongs to sovereign-node P33, "every system runs its node registry": each
system starts its own node listener, in its own process.

## Which systems

| System | Runs as | Its listener | Its bus |
|---|---|---|---|
| orchestrator | `orchestrator/orchestrator.js` | at listen | nexus-bus |
| cortex | `cortex/boot.js` | at listen | nexus-bus |
| guardian | `guardian/server.js` | at boot, replacing its own registry | nexus-bus |
| idearium | `idearium/api/index.js` | at listen | its IdeaOS bus |
| architect | `architect/service.js` | at listen | its `busEmit` |
| diagnostic | `diagnostic/nexus-diagnostic.js` | at listen | its `broadcast` (SSE) |
| intelligence | `intelligence/server.js` | at listen | nexus-bus |
| ollama | `ollama/server.js` | at listen | none, said |
| versionium | `versionium/server.js` | at listen | none, said |
| copilot | `copilot/server.js` | at listen | its own `_copilotBus` |
| loom | `loom/server.js` | at listen | none, said |
| clear-glass | `clear-glass/src/main/index.js` (Electron) | at bootstrap | its SISO bus |

Five systems have nodes but no process of their own: **cos, emerge, nexus-healer, sentinel, warp**. The boot sync indexes
them. They get a listener when each runs in its own compartment (DB11).

**The other systems** (cli, meta, nexus, siso, auth, mesh, cockpit, remote-desktop, jaa, erosmancer, security) have no
`data/nodes` at all. They need a registry first (DB16), because their nodes are generated from it.

## One writer per database (N8), and a flaw in 0.60.130 fixed

In 0.60.130 the boot sync, running in the orchestrator, indexed every system's database. With each system now writing its
own database from its own process, that would have been two writers on one store. Now:
- a system with its own process is the only writer of its database;
- the boot sync still writes every system's node files, and indexes only the systems with no process;
- the read route opens a fresh view from disk instead of a cached one.

## Guardian onto the shared registry

Guardian's own registry (`guardian/lib/node-registry.js`) indexed into the central cortex store. Guardian now runs the
shared `lib/node-registry.js`, which keeps the same per-file rules and indexes into `guardian/data/node-index`, with its node
events on nexus-bus. The old module is kept, because `test-node-index.js` still uses it.

The X2 check in `test-one-idearium-phases-nodes` looked for the old start call. It now looks for the new one, because the
change is intended.

## Proof

- Booted for real:
  - loom: "node registry: 74 indexed … listening on 4 type folder(s) · loom/data/node-index";
  - versionium: 27 indexed, listening on 3.
  The data the boot touched was restored afterwards, so nothing in the tree changed.
- `tests/modules/test-node-registry-system.test.js` NR-01..11 pass:
  - NR-09: all 12 entry points start their system's registry, and Guardian no longer starts the old one;
  - NR-10: one writer per database, on a fixture repo;
  - NR-11: skipped in a test process, and said why; forced, it starts and listens.
- The ratchet holds at 552: the 12 wirings add no crossing between systems.
- Failures that are not this release's, compared on the clean tree:
  - test-guardian-job-correlation (2);
  - clear-glass-library-ui (1);
  - accounts-picker-cos (4);
  - cg-accounts-portal-settings (2);
  - brainos-real-access-path (1).
  Each fails the same way there.

## Next (owning phases)

- **SB22 and P36:** each command, route and tool carries its events as nodes, with an event ledger per registry.
- **DB16 and P8:** a registry for each system that has none, so its nodes can exist.
- **The .store node (STORE_IS_A_NODE).**
