# 0.60.322 — everything traced to its origin: spec ids, a library and queue, phased only; doors, Guardian's nodes, Diagnostic's schemas

James, 2026-10-31:
> "Spec it all out. go through the .phases. and spec out everything that is a module, capability, or new component? that way we can have
> every component traced to its origin, and each piece tracked also. like it all builds from the origin as a foundation/core like the
> system.js, which needs the config. map all of whats missing from all of this, to the architecture spec and genesis spec."
> "how about anything new, spec, any changes, fixes, or additions is phased only."
> "like what if we use spec ids and types, then have a queue/library for specs."

From the same message:
> "create a server.js for the cli and api, and route to the index.js" · "make a server.js for cortex, and reroute the boot.js to component
> registry and retire the boot.js" · "check guardian, for me, make sure all the nodes, are actual files, in the data folder, the database per
> server.js" · "then all the schemas for the diagnostic system"

Spec and map only. No code. Each phase is built on his word, in DAG order.

## What was measured (main 0.60.320)

| | |
|---|---|
| Code files (14 systems) | 1,876 |
| Owned by a spec module | 233 (12%) |
| Named in a phase | 1,028 (55%) |
| Both | 203 (11%) |
| Neither (no line to an origin) | **818 (44%)** |
| `.phase` files / maps / `.spec` files | 2,239 / 207 / 460 |
| Systems booting from the skeleton's `lib/system.js` | **0 of 13** |

- **The origin exists, and no system uses it.** `cos/archetype/nexus-system/lib/system.js` loads the config, schemas, store, ledger and
  bus, node index, listener and heartbeat, and server.js and cli.js start from it. That is his "system.js, which needs the config". Every
  system predates it.
- **Guardian, the reference system, breaks its own axiom.**
  - 12 JAA tables have no node files: artifacts, jobs, gaps, sessions, chat_log, ledger and others.
  - It indexes 10 of the 12 node types it writes; `component` and `agent_model` are written but not indexed.
  - It writes twice outside its folder: Cortex's memory, and the root `data/`.

  His data folder is not in git, so the files on his machine are checked by GND1, run there.
- **Diagnostic has no schema for what it records:** 16 kinds of finding, beats, pulse, causality, heal attempts and the wire report.
  - Its `system_offline` fix text tells him to run `node <name>/boot.js`, a hard-coded guess that is wrong for most systems.
- **Missing skeleton slots, per system:** recorded in the architecture-spec addendum.
  - Idearium has no server.js; it listens from its 11,738-line `api/index.js`.
  - Cortex's server is its 1,677-line `boot.js`.
  - Orchestrator and COS lack six slots each.

## Specced (four full specs, each at specDepth 1.0 with no BLACK node, tied to their phases; SS-01/02 green)

| Spec | Map | What |
|---|---|---|
| `idearium/spec/spec-library.spec` | SE1–SE6 | His spec ids and types (`<type>:<system>:<slug>`, legacy names kept as aliases); SPEC-REGISTRY as the library; one queue, foundation first; the origin trace; drafts from code for the 818 files; his "phased only" as a check; Library and Queue in the Spec tab |
| `docs/system-doors.spec` | DO0–DO5, DO2a | The 0-routes handshake fixed first. server.js per system on its registry: Idearium, Architect (first to boot from the skeleton's core), Cortex (boot.js's routes become registry components, then boot.js is archived). Clear Glass's door waits for his yes |
| `guardian/spec/guardian-nodes.spec` | GND1–GND4 | His audit as a command; every type indexed; the 12 tables become node files with no row lost; writes kept home |
| `diagnostic/spec/diagnostic-schemas.spec` | DSC1–DSC4 | Seven schemas (finding, heartbeat, pulse, causality, repair spec, heal attempt, wire report); findings in one shape; the fix text read from each system's declaration; every heal attempt recorded |

## Mapped to the architecture spec and genesis

- **Architecture spec 0.14.0:**
  - RULE E: every piece is traced to its origin, through its skeleton slot, its spec module with id and type, and its phase.
  - RULE F: phased only, his rule.
  - What is missing from rules A–F, measured: 0 behaviour schemas, 0 `.benchmark` files, 0 `.dep` files, 0 pipe doors, and the trace
    numbers above.
- **Genesis:** a PROPOSED 1.6.0 note covering:
  - the axioms TRACED_TO_THE_ORIGIN and PHASED_ONLY;
  - the boot core no system uses;
  - the harness not yet in the catalog;
  - Guardian against ALL_DATA_ARE_NODES;
  - Diagnostic's records.

  The version line stays 1.5.0 until SE2 and DO2a are built.
- **docs/CLAUDE.md:** his three rules, quoted.

## Proof

- `test-substrate-spec` 3/3, with the four specs added.
- `test-phase-dag` 8/8. No DAG problems in the new maps.
- `test-genesis-and-architecture-spec` 7/7.
- 21 `.phase` and `.graph` files. Their 32 crossings are all already in the boundary ratchet, so none is new.

## His to confirm

- That his "system.js" is the skeleton's `lib/system.js` (SE_D2).
- That "phased only" exempts tests, docs and the version files (SE_D0).
- The id grammar and the ten types (SE_D1).
- That server.js is the connector, not the internal bus (DO_D0).
- Whether Clear Glass gets a door too (DO_D1).

## Not done

- The ChatGPT sign-in fix (0.60.321) was built before his "phased only" rule. It gets its phase in the next map that touches attention.js.
- Not recorded in Versionium from this sandbox (§17.12).
