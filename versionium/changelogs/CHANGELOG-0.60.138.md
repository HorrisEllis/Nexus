# 0.60.138 — 2026-10-17

James: "and the diagnostic needs to be a real system matching genasis."

## Matching genesis, made checkable

`lib/system-shape.js` lists genesis 1.5.0's roles and checks a system against them. Each role is filled by the system's own
file, filled by the kernel (for a system that predates the template, by decision D1), or missing.

| Filled by | Roles |
|---|---|
| the system's own file | entry, cli, config, config-file, compartment, registry, contract, events, schemas, spec, node-taxonomy, handshake, tests, nodes |
| the kernel | store (`lib/jaa-store.js`), node-index and listener (`lib/node-registry.js`), heartbeat (`lib/system-registry.js`), boundary (`lib/system-boundary.js`) |

Its test SH-01 requires every file of the genesis skeleton to be either a role or a named skeleton internal, so the check
cannot drift from genesis.

`system shape [<system>]` (`GET /api/system/shape`) gives every system's row.

## Diagnostic, a genesis system

Built:
- `server.js`: the entry. Autopilot still starts `nexus-diagnostic.js`, and both start the same service.
- `cli.js`: every command in its registry, 35 of them, run against its own service through the route the registry names.
  The service's own verbs (status, stop, gaps, audit) are kept.
- `config.js` and `diagnostic.config.json`: the port and heartbeat come from the file, with `DIAGNOSTIC_PORT` over it. The
  service no longer has the literal 7825.
- `compartment.json`: its COS compartment, `nexus-self-diagnostic`.
- `event-taxonomy.js`: 13 events in ET1 shape, each a real `broadcast` in its service.
- `spec/diagnostic.node-taxonomy.md`.
- `contracts/handshake.js`: laid out from the genesis skeleton.

Moved, with `git mv`, history kept:
- `docs/diagnostic.spec` → `diagnostic/spec/diagnostic.spec`, with an addendum.
- `nexus-heal-loop.js` → `lib/heal-loop.js`.
- `wire-integrity.js` → `lib/wire-integrity.js`.
- `lib/pulse-watch.js` and `lib/diagnostic-contract.js` → `diagnostic/lib/`. Only diagnostic used them (DB17).
- `test-pulse-watch` → `diagnostic/tests/`, under D6. Diagnostic's own `tests/shape.test.js` is new.

`docs/SPEC-REGISTRY.spec` said diagnostic.spec had "DRIFTED: describes a registry-components.js and handshake that don't
exist in code". Both exist now.

## The other systems, by the same check

| System | Missing |
|---|---|
| guardian | handshake, tests |
| copilot | config-file, handshake, tests |
| intelligence | cli, config-file, handshake, tests |
| versionium | cli, config-file, handshake, tests |
| cortex | entry, cli, config-file, handshake, tests |
| idearium | entry, cli, events, handshake, tests |
| loom | cli, config-file, events, handshake, tests |
| ollama | cli, config-file, events, handshake, tests |
| emerge | 6 roles |
| architect | 7 roles |
| clear-glass | 7 roles |

Matching genesis is not the same as sovereign. Diagnostic still has 10 crossings out:
- cortex's database (1);
- RAID, CFR, the gap engine and loom's schema (9).

## Proof

- `test-system-shape` SH-01..04 pass, and so does `diagnostic/tests/shape.test.js` DG-01..05. DG-03 checks that every
  contract route is in the registry, and DG-04 that every named event is a real broadcast.
- `test-pulse-watch` 6 pass, from its new place.
- Updated for the moves and passing: dangling-hooks 19, health-authority 9.
- The ratchet holds at 540. The 4 renamed edges are recorded under `renamed` in the baseline.
- Also passing: boundary 10, drawbridge-registry 8, tunnel 7, sovereign 8, compartment 8, loom-map 19, phases-nodes 21,
  capability-registry 8, boot-log 9, heal-path 9, system-registry 9, node-registry 11.
- Failing the same way on the clean tree, so not this release's: test-emerge-direct-compile EM-005.
