# 0.60.132 — 2026-10-17

James: "Update the genesis template. And the system template skeleton. Then when we are done. Should work on the
infrastructure. Soon. Migrating to what the architecture spec states. The system spec template. Clean the redundant files,
phase, wire what’s existing, first principles nexus."

## Genesis 1.5.0 (`idearium/spec-engine/templates/genesis.spec`)

Today's decisions are now six axioms, each in his words:

| Axiom | What it says |
|---|---|
| `REGISTRY_IS_THE_DRAWBRIDGE` | The registry is the system's contract, bus, queue, dependency graph, wiring harness and spine. Systems reach each other only through it: routes, the CLI, handoffs, with a handshake, the UI's too |
| `SOVEREIGN_FOLDER` | A system requires no file outside its own folder, and runs in its own compartment. Its heartbeat reports a require that leaves it |
| `FILES_WITH_THEIR_SYSTEM` | A file that serves one system lives in that system's folder. What every system uses is the kernel's |
| `NODES_IN_RELATION` | Every node names its system, and the system's relations are nodes too |
| `TOASTS_IN_THE_REGISTRY` | The events a person should see are declared in the registry and served in the contract. The UI keeps no list |
| `ONE_WRITER_PER_STORE` | The system's own process is the one writer of its node database |

The file catalog is regenerated from the skeleton (`node cos/archetype/genesis-catalog.js --write`).

## The system template skeleton (`cos/archetype/nexus-system`)

- **`lib/boundary.js`** (new): every relative require in the system is resolved. One that leaves the folder is named, and
  the heartbeat reports it as a problem. A system that is not self-contained shows it in its own pulse.
- **`lib/heartbeat.js`** takes `checks`: problems the system knows about itself, beside the ones the index refused.
- **`registry-components.js`** gains `toasts: []`, and `server.js` serves them in `GET /contract`. The UI reads the
  toasts from there.
- **`tests/skeleton.test.js`** proves both:
  - the system holds only its own folder, and the heartbeat is clean;
  - a probe file that requires outside the folder appears in the heartbeat's problems;
  - the contract carries the toasts.

## The system spec template (`architecture-spec.template.yaml`)

Its `rules:` gain the same six rules, so a system spec written in it states them.

## Mapped, not built: the infrastructure migration

`docs/2026-10-17-infrastructure-migration-phasemap.spec`. The target is what the architecture spec states, in the
template's shape. The coder's reading of "first principles nexus", to confirm: measure before moving, one owner per thing,
the registry is the door, the least depended-on first, nothing lost, and Nexus left running after each step.

**The census, measured against the template's tree:**
- No system has the full shape. Guardian and copilot come closest, missing only their own `tests/`.
- Five systems have no registry, and nine have no event taxonomy.
- Every test lives in `tests/modules`; no system has its own `tests/`.
- cortex is reached 155 times by other systems, 70 of them for one file: its database, `cortex/memory/jaa-db.js`.

**Redundancy candidates:**
- 1,845 tracked files under `data/**`, which are state in git, against his rule "NEVER commit data/**";
- 336 CHANGELOGs at the repo root;
- 58 shared files that no file requires by path;
- the store adapter written three times;
- the superseded `guardian/lib/node-registry.js`;
- 2 test files at the repo root.

**His to decide first (IM0a-d):**
- state in git;
- where the CHANGELOGs live;
- tests per system;
- `lib/` as the kernel.

**Phases:**
- **IM1:** the census as a command.
- **IM2:** clean the redundant. Archive, never delete.
- **IM3:** wire what exists. This includes the debugging systems' commands.
- **IM4:** the kernel boundary.
- **IM5:** each system to the template, least depended-on first (sentinel, nexus-healer, architect first; cortex last).
- **IM6:** cortex unclumped.
- **IM7:** the UI on the registry.

## Proof

- `test-system-skeleton.test.js` SK-01..08 pass. SK-01 is the regenerated catalog matching the skeleton file for file.
  SK-02 is a laid-out system standing alone and passing its own test, which now includes the boundary and the toasts.
- `test-genesis-and-architecture-spec.test.js` passes 7/7. GA-01, GA-04 and GA-04b accept genesis 1.5.0; before, they
  pinned 1.4.0, the way each earlier bump was pinned.
- `test-system-template`, `test-spec-pipeline`, `test-spec-document` and `idearium-loop` pass.
