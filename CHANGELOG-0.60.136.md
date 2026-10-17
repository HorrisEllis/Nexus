# 0.60.136 — 2026-10-17

James: "no, this is my system. come to me for problems, else use the axioms. continue with each system."

James: "diagnostic and nexus healer should be one system."

## Whose decisions

0.60.135 recorded the decisions made by the axioms as "the coder's, never his". He corrected that. The axioms are his, so
those decisions are his system deciding by its own law, and the coder applies and cites them. What goes to him is a
problem: something the axioms do not settle, two of them in conflict, a failure, or a cost he would want to know about
first.

- `docs/CLAUDE.md` has the correction. The first wording is kept beside it (§0.3).
- `docs/2026-10-17-decisions-by-the-axioms.spec` has addendum (a): "decided by his axioms".
- The owning maps' statuses say the same.

## Diagnostic and the healer: one system

**His decision.** The coder's reading of how to do it, by the axioms: the healer joins diagnostic, not the other way
round.
- Diagnostic is the one that runs. Autopilot starts it on port 7825.
- Diagnostic already holds the heal loop (`diagnostic/nexus-heal-loop.js`).
- nexus-healer never ran: nothing started its port 3755.

Keeping the name "diagnostic" is a reading, to confirm.

**Moved**, with `git mv`, so history is kept:
- `nexus-healer/api` → `diagnostic/healer/api`
- `nexus-healer/cli` → `diagnostic/healer/cli`
- `nexus-healer/schemas` → `diagnostic/schemas`
- the spec and docs → `diagnostic/spec/healer.*`
- `nexus-healer/registry-components.js` → `diagnostic/registry-components.js`

The old contract and the generated data are kept in `_archive/2026-10-17-nexus-healer-into-diagnostic/`, with a README.

**Served.** Diagnostic's running server answers the healer's routes under `/healer`: propose, list, evaluate through
intelligence's forge route, merge and archive. Diagnostic's contract lists them. So the healer runs for the first time, as
part of diagnostic.

**Its data.** `healer_proposals` lives in diagnostic's own store (`diagnostic/data/jaa`). It is brought home once, from
whichever source holds rows: nexus-healer's own store (0.60.133-0.60.135, untracked, so git leaves it in place) or cortex's.
The source rows are kept. `lib/system-store.js` migrations take a list of sources for this.

**Diagnostic's first registry.** It holds the healer's 5 rows and diagnostic's 30 contract routes, read from
`interaction-contract.json` and never copied. Without the 30, `lib/system-nodes.js` would have dropped them from
diagnostic's nodes, because it reads the registry over the contract. Diagnostic now has 75 nodes, 35 of them capabilities.

**Its consumers.**
- copilot's `nexus_heal` tool and the status tool find diagnostic through the tunnel (`lib/system-registry.js`), under
  `/healer`.
- `nexus /healer` runs `diagnostic/healer/cli`.
- loom's capability map, its closed-door scanner and vector-memory read diagnostic.

Found, and not changed in this release: the port map in `lib/agent-tools/tools/coordination/capability-tools.js` is wrong
for most systems (copilot 7010, loom 7830, ollama 7840 and others).

## COS: what a compartment's start spawns

COS already spawns a compartment's process at start, when the compartment has a runtime and an entry file. Until now
nothing could set those for an existing compartment except an archetype. The new gate `host:compartment:set-runtime` does
it. It takes a runtime COS knows and an absolute entry file that exists; anything else is refused, with the reason. It is
registered in the host and declared in COS's event contracts and taxonomy.

`lib/cos-bridge.js` `setRuntime()` uses the gate. It writes nothing directly, so there is no side door into COS's store.
This is the piece that lets a sealed system move into its compartment.

## Proof

- Booted diagnostic for real. `POST /healer/proposals` answered `{"ok":true,"proposalId":…}`, `GET /healer/proposals`
  listed the proposal from `diagnostic/data/jaa`, an unknown healer path was refused with the real routes named, and
  diagnostic's node registry indexed 61 nodes. The data the boot wrote was removed afterwards.
- `test-cos-compartment-template` CT-01..08 pass. CT-08 covers the set-runtime gate: an unknown runtime and a missing
  entry are refused, a good one is recorded, and the bridge listens for the event names COS declares.
- Updated for the merge, all passing:
  - `test-sovereign-systems` 8;
  - `test-rfr2-cjs` 31. T-job2b had failed since 0.60.133, when the healer stopped requiring forge, and now checks the
    route;
  - `test-intelligence-organs-move` 14;
  - `test-adversarial-sim` 20;
  - `test-drawbridge-registry` 8 and `test-system-tunnel` 7, whose "no registry" example is now orchestrator.
- Also passing: loom-map 19, capability-registry 8, node-registry 11, one-idearium-phases-nodes 21, system-boundary 10, the
  COS app tests and cos-mount.
- The ratchet holds at 540.
- Failing the same way on the clean tree, so not this release's: `test-event-contracts` EC-05, and `cos/test/test.js`,
  164/165 ("Stream: stamped event has seq + timestamp").
