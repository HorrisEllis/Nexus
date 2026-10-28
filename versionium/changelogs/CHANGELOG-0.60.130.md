# 0.60.130 — 2026-10-17

James: "each system, reads, writes, and manages its nodes. each system has a database for each index of nodes with all the
history. listener, schemas for all the  node types, the database. nodes for all persistant data. look at the node taxonomy in
lib, as a baseline. using nodes as a way to make the system explicit. look at the architecture spec in idearium.
thats the point of using the component registry as the spine that way its easy to move them around and use it as a map. look
at all of the specs for nodes, each tool, command and route has its events. expand capabilities through the nodes. all of
this and more is phased already."

## The phases that already own this

He was right that this is phased already. The drawbridge map's addendum (d) names the owners, and new work names the owning
phase first.

| Where | What it already holds |
|---|---|
| `docs/2026-09-11-sovereign-node-architecture-phasemap.spec` | P33 every system runs its node registry; P35 Copilot edits nodes; P36 an event ledger per registry; P37 the UI floats on the registry; P38 every graph has its route, command and node |
| `docs/2026-09-29-nex-node-store-phasemap.spec` | I0–I9: everything that persists is a node, one store per system. Also N6 history, N8 one writer per system, N17 data moves home |
| `docs/2026-10-05-build-from-the-spec-phasemap.spec` | SB20 each system owns its own; SB22 capability → command → events as nodes |
| `docs/architecture-spec/architecture-spec.spec`, addendum 2026-10-10 | NODE_SYSTEM; THE_STACK (UI → contract → registry → bus → event ledger → node registry → own store). Its census: a node registry runs in 1 of 16 systems |
| The template `idearium/spec-engine/templates/architecture-spec.template.yaml` and `cos/archetype/nexus-system` | The whole shape, built once as a template and used by no existing system |

One correction to the request: the node taxonomy is at the repo root (`NODE-TAXONOMY.md`, 39 slots), not in `lib/`.

## Built: P33a, a node registry any system runs

`lib/node-registry.js` `createNodeRegistry({ system })` is built from Guardian's registry, the one that already runs. Its
per-file rules are kept exactly:
- parse the node;
- check that the folder's type matches the node's;
- check the schema (`lib/node-schemas.js`);
- write a ledger line;
- index the node;
- emit a bus event.

Two things change. It is an instance per system, where Guardian's is a single module. And it indexes into the system's
**own** database, `<system>/data/node-index`:
- `nodes_<type>`, the index;
- `nodes_<type>_ledger`, the whole history: every add, change and removal.

What it does:
- `scan()` indexes everything now, catches up on nodes removed while nothing listened, and records changes, not re-reads.
- `start()` adds the listener: a node dropped in goes live, and `<system>.node.added|changed|removed|invalid` goes on the
  bus.
- Every system's nodes are indexed into its own database at the boot sync (`lib/system-nodes.js`). Guardian is left out,
  because its own registry runs.

Route `GET /api/system/nodes/:system[?type&id]`; command `system nodes <system> [<type> [<id>]]`. A read creates nothing: a
system with no database yet is told so.

## Moved: the store is the kernel's

`guardian/jaa-store.js` is the store that cortex, idearium, clear-glass, intelligence, copilot, versionium and the CLI all
use, yet it lived inside Guardian. It is now `lib/jaa-store.js`. The old path is a one-line re-export of the same module,
so nothing that requires it broke. This is the reverse of DB17: a shared base file that sat in one system's folder.

## Found

- **Guardian's registry indexes into the central cortex store, not its own.** It moves onto the factory and into
  `guardian/data/node-index` in P33b.
- **cortex's 9 `failure_mode` nodes fail their schema.** `gapUuid` is null, and `schema.failure_mode` says string. The
  check refuses them and says so. The schema was not changed: which side is wrong is a decision.
- **One store adapter is written three times,** in intelligence, copilot and versionium. `lib/node-registry.js` holds it
  once. The three are reported, not removed, until each moves onto it.
- **74 files under `*/data/node-index` are tracked in git, and nothing writes them.** They are state from an old run.

## Still open (P33b and the owning phases)

- **P33b:** each system's own server starts its listener at boot, so it manages its nodes in its own process. Guardian
  moves onto the factory.
- **SB22 and P36:** each command, route and tool carries its events as nodes, with an event ledger per registry. Today
  only 4 registries declare events, and no `event/` node exists.
- **P3:** schemas for route, bundle, handoff and module.
- **N6:** history views.
- **P35:** Copilot edits nodes through the contract.

## Proof

- `tests/modules/test-node-registry-system.test.js`: NR-01..08 pass. They cover the database, no churn on a rescan, a
  change, a removal while nothing listened, a schema refusal, the live listener with its bus event, the moved store, and
  the route.
- Unchanged and passing: jaa-db 53, jaa multiprocess, deletes, flush lock, selective load, cookie vault, artifact index,
  node-export, one-idearium-phases-nodes, system-node-relations, system-boundary, system-registry, system-tunnel, loom-map,
  and the older root-level `test-node-index.js`.
- `test-guardian-data-sovereignty` and `test-guardian-cfr-consolidation` fail the same way on the tree before this release.
