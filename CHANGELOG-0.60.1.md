# 0.60.1 — 2026-10-12

James: "like this needs to be the way each system is built in idearium using the nexus system template. like nexus is recursive, builds itself, using itself. the same architecture on every level. like it should be a template. update genasis and the architecture spec and the system tempalte skeleton if its not already."
· "each system hands the file off to the target system, using the registry and hanbdshake verification to tag the progress and success or failure of the handoff and why. then if it passes can be moved to the physical input folder or queue of the system that recieved the handoff."
· "like anything resuable needs a schema and template. contracts and nodes for persistent data, and expanding the system. events. like nothing pretends to work, and everything is tangible until completed."

## What the template already was

The nexus-system skeleton (`cos/archetype/nexus-system`, genesis 1.4.0's catalog) already had most of this:

- a registry spine: every component connects only to it
- routes and commands as nodes, which go live when dropped into their folder
- an interaction contract and a handshake
- a bus that writes every event to the ledger first

Two things were missing:

- **Handoffs.** The `input/` and `output/` folders existed, but nothing used them.
- **Recursion.** A module could not itself be a system.

## The handoff — the drawbridge (`lib/handoff.js`)

- Work moves between systems as a `.handoff` node file. Its state is the folder it is in:
  - at the receiver: `input/` (queued) → `processing/` (taken) → `done/` (with the result) or `failed/` (with why)
  - at the sender: the receipt in `output/`, updated when the receiver reports back
- **Nothing moves until it is verified**:
  1. The target is in the registry: a module node, the parent, or a peer in config.
  2. The handshake: the contract is the target's own (its id), and it accepts this kind.
  3. The payload matches the target's `schema.<kind>`, when it has one.

  A refused handoff is a receipt saying why, and nothing is written to the target.
- A command takes a kind by declaring `accepts`. `GET /contract` lists every kind the system accepts.
- `POST /handoff` and `POST /handoff/receipt` are in the fixed contract, so a system on another port receives the same way.
- A crash leaves work in `processing/`. At boot it goes back to `input/`, and its history says so.
- `handoffs` (CLI, or `GET /handoffs`) lists every handoff by folder, which ones are stalled, and the peers the registry gives.

## Recursion — a module is a system (`lib/modules.js`)

- Every laid-out system carries the template it came from: `template/nexus-system.template.json`, with placeholders written `[[key]]`.
- `node cli.js module --name "Audio Engine"` (or `POST /modules`) lays that template out again under `modules/audio-engine/`. The result is a whole system with its own registry, contract, nodes, schemas, bus, ledger and handoff folders.
- The module carries the template too, so it can lay out modules of its own.
- The parent knows the module by one node, `data/nodes/module/<slug>.module`: its folder, its mode (library, in the parent's process) and the hash of its contract.
- The two meet only through the contract and handoffs.

## The specs

- **genesis 1.4.0**: the catalog is regenerated from the archetype. It now includes handoff, modules, the template file and the `processing/`, `done/` and `failed/` folders. `genesis-catalog.js` now scans only code files for `require()`s.
- **The architecture-spec template**: the file tree shows the handoff folders, `modules/`, `template/` and module nodes. Six new rules cover:
  - a schema and a template for anything reusable
  - handoffs instead of bare calls
  - folders as states
  - handing off only to what the registry knows
  - `accepts` on commands
  - modules as systems

  `docs/architecture-spec` is now 0.11.1.
- **Schemas**: `schema.handoff` and `schema.module` are new. `schema.command` gains `accepts` and `handler`.

## Idearium builds this way

- System specs already start from genesis, and spec codegen slots the idea into the skeleton.
- Now the phase planner (0.60.0) also knows when a repo is a Nexus system. It slots each new component the template way: a registry entry plus its nodes. Work for another system becomes a handoff, never a `require`. A part big enough to be its own system becomes a module.

## Tests

- The skeleton's self-test, which every laid-out system runs, now also:
  - lays out a module, and has that module lay out one of its own
  - checks the module's contract against its registered hash
  - refuses a kind the module does not accept, and a target the registry does not know
  - queues a verified handoff, drains it to `done/`, and checks the sender's receipt reads `verifying → queued → taken → done`
  - recovers a crashed handoff from `processing/` back to `input/`

  A laid-out module passes the same self-test.

| Suite | Result | Note |
|---|---|---|
| `test-system-skeleton` | 8/8 | SK-04's counts now include the two template components |
| `test-genesis-and-architecture-spec` | 7/7 | |
| `test-plan-code-run-attention` | 40/40 | PC-21 is new |
| `test-pipeline-routing` | 19/19 | |
| `test-system-template` | 5/5 | |
| `test-spec-document` | 8/8 | |
| `idearium-loop` | 18/18 | |
