# orchestrator — the root coordinator

> **status: mapped (0.39.264)** · one process on :9000 · the front door every UI, CLI and external consumer uses · a module of `nexus`, back up one level in `nexus-atlas.md`

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

The orchestrator is the single focal point of NEXUS. Every system registers with it, every UI is served by it, every live event passes through its one SSE stream, and every command a person types can be routed through it. Its spec, `orchestrator/spec/orchestrator.spec`, states the rule that keeps it small enough to trust: the orchestrator never does business logic. It routes, verifies and coordinates, and the concerns it owns are the ones that are system-wide by nature: the component registry, the contract handshake, the UI handshake, sigma and pulse, and the version history those produce.

It boots in phase 2 of `nexus/autopilot.js`, after `cortex`, alongside `guardian` and `diagnostic`. Under autopilot it runs with NEXUS_SUPERVISED set, which tells it to skip booting the other systems itself: before autopilot existed, `orchestrator/orchestrator.js` started them through `cli/boot-systems.js`, and two copies of every system then fought over the same ports. Today autopilot spawns and supervises, and the orchestrator is the HTTP and UI front end.

---

## File Structure

```
orchestrator/
  orchestrator.js               the process: unified API, SSE, UI server, CLI (3,500 lines)
  orchestrator.config.json      its configuration
  orchestrator-contract.json    the contract it declares for itself
  interaction-contract.json     derived interaction contract
  lib/
    contract-handshake.js       verifies each registered system's contract
    contract-poller.js          re-checks contracts on a timer
    ui-registry.js              the UI handshake: sessions, heartbeat, routing
    request-handler.js          request lifecycle, recorded outcome
    intent-map.js               what each interaction intends
    spec-drift.js               specs compared against code
    changelog.js                the living changelog from real version bumps
    pulse.js                    the pulse system
    sigma-writer.js             produces sigma records
    sigma-compaction.js         rolls sigma records up and evicts old ones
    versionium-auto-commit.js   commits to versionium when sigma says so
    autonomous-loop.js          the autonomous loop
    hot-loader.js               swaps modules without a restart
    file-push.js                pushes files to systems
    mutation-contract.js        what a mutation must declare
    grammar-misfire-tracker.js  where the command grammar guessed wrong
    quick-notes.js              notes synchronized across every pill
    peer-relay.js               two NEXUS instances proxying through each other
    mcp-server.js               NEXUS tools over MCP
    mcp-stdio.js                MCP over stdio
    mcp-tools-tokensave.js      token-saving MCP tool set
  spec/
    orchestrator.spec           what it is supposed to be
```

---

## Architecture

### The unified surface

`orchestrator/orchestrator.js` exposes one API over every system. It proxies each system's routes under its own name (cortex, guardian, idearium and the rest), lists every route across all systems, streams every system's events through one SSE endpoint, and serves the UIs: each system's shell from `ui/`, Idearium's from `idearium/ui/`, and the Architect canvases from `architect/src/ui/`. The same file is also a command line: run with a command, it executes it against the right system and prints the result.

### Registration and contracts

A system that boots registers with the orchestrator and declares its components, the routes listed in its own `registry-components.js`. `lib/component-registry.js` persists them to the JAA components table and records each in the component ledger. `orchestrator/lib/contract-handshake.js` then verifies the system's contract and gives it a trust state: verified, degraded, mismatched or unreachable. `orchestrator/lib/contract-poller.js` repeats the check, so a system that goes away is noticed, not assumed alive. The boot log line "contract.unreachable — erosmancer-os" is this layer reporting honestly that ErosmancerOS registered but nothing answers on its port.

### The UI handshake

`orchestrator/lib/ui-registry.js` tracks every connected UI: a UI registers, sends heartbeats, and is routed the events it subscribed to; one that stops beating is marked disconnected. This is how the orchestrator knows which shells are open.

### Sigma, pulse and history

`orchestrator/lib/sigma-writer.js` turns system events into sigma records with warning and halt thresholds, `orchestrator/lib/sigma-compaction.js` keeps that table bounded, and `orchestrator/lib/versionium-auto-commit.js` listens for a composite sigma warning and commits the state to `versionium`, with a cooldown. `orchestrator/lib/pulse.js` is the pulse every system reports into. Together they make "something significant changed" a recorded event rather than an impression.

### Drift and the changelog

`orchestrator/lib/spec-drift.js` compares each system's spec against its code and reports what disagrees, and `orchestrator/lib/changelog.js` keeps a living changelog driven by real version bumps in the specs. Both exist because the specs are living documents that drift, and drift is only harmless when it is visible.

### Tools and peers

`orchestrator/lib/mcp-server.js` and `orchestrator/lib/mcp-stdio.js` expose NEXUS's tools to any MCP client, and `orchestrator/lib/peer-relay.js` lets two NEXUS instances discover each other and proxy requests through each other.

---

## Boundaries

| orchestrator does | orchestrator does not |
|---|---|
| route, verify, coordinate | decide what a prompt means (that is `copilot`) |
| hold the component and UI registries | dispatch to AI providers (that is `guardian`) |
| serve every UI | remember anything long-term (that is `cortex`) |
| commit to versionium when sigma warns | keep history itself (that is `versionium`) |

---

## Tests

`tests/modules/orchestrator-cli.test.js` exercises the command line; the contract and registry paths are covered by the suites run from `tests/modules/run-all.js`.

---

## Version History

| release | what changed here |
|---|---|
| 0.39.263 | serves Idearium's UI and the Architect canvases under /ui/ by name, from their own folders |
| 0.39.264 | this atlas written, so the `orchestrator` repo in Idearium opens into a real map |

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
