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

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**27** files · **23** code files · **0** registry components declared here · **22** events emitted · **5** heard · **0** routes · **7** code files with a covering test

### Events it emits (22) — and who hears them

- **cortex.gap.found** — from `orchestrator/lib/spec-drift.js` → `orchestrator/orchestrator.js`, `tests/modules/test-gap-finder.js` (core)
- **sigma.event.halt_risk** — from `orchestrator/lib/sigma-writer.js` → `cortex/orion/index.js` (cortex)
- **sigma.event.warning** — from `orchestrator/lib/sigma-writer.js` → `cortex/orion/index.js` (cortex)
- **sigma.composite.halt_risk** — from `orchestrator/lib/sigma-writer.js` → `orchestrator/lib/versionium-auto-commit.js`
- **sigma.composite.warning** — from `orchestrator/lib/sigma-writer.js` → `orchestrator/lib/versionium-auto-commit.js`
- **autonomous-loop.complete** — from `orchestrator/lib/autonomous-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autonomous-loop.error** — from `orchestrator/lib/autonomous-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autonomous-loop.started** — from `orchestrator/lib/autonomous-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **autonomous-loop.step** — from `orchestrator/lib/autonomous-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cortex.gap.resolved** — from `orchestrator/lib/spec-drift.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **hot-loader.complete** — from `orchestrator/lib/hot-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **hot-loader.failed** — from `orchestrator/lib/hot-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **hot-loader.integrated** — from `orchestrator/lib/hot-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **hot-loader.proving** — from `orchestrator/lib/hot-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **hot-loader.quarantine** — from `orchestrator/lib/hot-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **hot-loader.rolled_back** — from `orchestrator/lib/hot-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **pulse.missed** — from `orchestrator/orchestrator.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **request.received** — from `orchestrator/lib/request-handler.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ui.deregistered** — from `orchestrator/lib/ui-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ui.disconnected** — from `orchestrator/lib/ui-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ui.reconnected** — from `orchestrator/lib/ui-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ui.registered** — from `orchestrator/lib/ui-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)

### Events it hears from elsewhere (2)

**copilot.error.detected** (copilot) · **nexus.resource.pressure** (core)

### Files, directory by directory (3 directories)

#### `orchestrator/`

2 code · 3 other file(s).

- `orchestrator/event-taxonomy.js` (53 lines) — // orchestrator/event-taxonomy.js — ET4_orchestrator_autopilot_event_taxonomy. // Conforms to lib/event-taxonomy-pattern.js's real ET1 shape.
- `orchestrator/orchestrator.js` (3611 lines) — // ════════════════════════════════════════════════════════════════════════════ // NEXUS ORCHESTRATOR — v2.0.0  
  requires 18 · required by 0 · emits pulse.missed · hears copilot.error.detected, cortex.gap.found, nexus.resource.pressure
- other: `orchestrator/interaction-contract.json`, `orchestrator/orchestrator-contract.json`, `orchestrator/orchestrator.config.json`

#### `orchestrator/lib/`

21 code file(s).

- `orchestrator/lib/autonomous-loop.js` (548 lines) — lib/autonomous-loop.js — Phase 13: Autonomous Loop Ollama as brain. Multi-step autonomous task execution inside hard limits.  
  exports init, run, startRun, status, validateWiring, MODULE_ID +1 · requires 3 · required by 0 · emits autonomous-loop.complete, autonomous-loop.error, autonomous-loop.started, autonomous-loop.step · tested by `tests/modules/autonomous-loop.test.js`
- `orchestrator/lib/changelog.js` (153 lines) — // ── lib/changelog.js ──────────────────────────────────────────────────────── // UUID: nexus-changelog-v1-0000-0000-0000-000000000001  
  exports diff, update, MODULE_ID, VERSION · requires 0 · required by 1
- `orchestrator/lib/contract-handshake.js` (244 lines) — lib/contract-handshake.js — Interaction Contract Verification Layer Status: pre-release  
  exports verifySystem, verifyAll, getEntry, getAllEntries, getTrustMap, TRUST +2 · requires 0 · required by 1
- `orchestrator/lib/contract-poller.js` (64 lines) — lib/contract-poller.js Meta-system poller. Runs in orchestrator process.  
  exports start, stop, scan, stats · requires 1 · required by 1
- `orchestrator/lib/file-push.js` (279 lines) — lib/file-push.js — NEXUS File Push System Status: pre-release  
  exports processPush, pushToPeer, routeFor, ROUTES, MODULE_ID
- `orchestrator/lib/grammar-misfire-tracker.js` (138 lines) — // ── lib/grammar-misfire-tracker.js ────────────────────────────────────────── // UUID: nexus-grammar-misfire-tracker-v1-0000-4000-0000-000000000001  
  exports init, recordMisfire, MODULE_ID, VERSION, MISFIRE_THRESHOLD · requires 0 · required by 2 · tested by `tests/modules/grammar-misfire-tracker.test.js`
- `orchestrator/lib/hot-loader.js` (222 lines) — lib/hot-loader.js — Phase 14: Hot Module Loader Drop → QUARANTINE → PROVE (validateInvariants()) → INTEGRATE → MONITOR (60s)  
  exports init, load, status, STATES, MODULE_ID, VERSION · requires 0 · required by 1 · emits hot-loader.complete, hot-loader.failed, hot-loader.integrated, hot-loader.proving +2
- `orchestrator/lib/intent-map.js` (172 lines) — lib/intent-map.js — NEXUS Interaction Intent Map Gap 2 of the "UIs float on a verified interaction contract" architecture.  
  exports CATEGORIES, INTERACTIONS, buildIntentMap · requires 1 · required by 0
- `orchestrator/lib/mcp-server.js` (762 lines) — lib/mcp-server.js — Phase 67: MCP Tool Bridge Exposes NEXUS routes as MCP (Model Context Protocol) tools.  
  exports start, stop, status, TOOLS, MODULE_ID, VERSION · requires 2 · required by 2 · tested by `tests/nexus-full-audit.js`
- `orchestrator/lib/mcp-stdio.js` (91 lines) — lib/mcp-stdio.js — NEXUS MCP stdio transport Runs the MCP server over stdio so Claude Code can connect  
  requires 1 · required by 0
- `orchestrator/lib/mcp-tools-tokensave.js` (235 lines) — orchestrator/lib/mcp-tools-tokensave.js Token-reduction MCP tools for NEXUS. These are all local filesystem reads —  
  exports TOOLS · requires 0 · required by 1
- `orchestrator/lib/mutation-contract.js` (192 lines)  
  exports init, checkTarget, mutateProperty, FORBIDDEN_TOP, ALLOWED_PREFIX, MODULE_ID +1 · requires 1 · required by 2 · tested by `tests/modules/test-mutation-contract.js`
- `orchestrator/lib/peer-relay.js` (225 lines) — lib/peer-relay.js — NEXUS Peer Relay (Remote System Bridge) Status: pre-release  
  exports handleAnnounce, announceToRemote, proxyToRemote, pruneStalePeers, getPeer, getAllPeers +3 · requires 1 · required by 0
- `orchestrator/lib/pulse.js` (299 lines) — lib/pulse.js — NEXUS Pulse System v1.0.0 The pulse is the heartbeat made active. Every system that imports this  
  exports createPulse, createNCPPulse, _Ring · requires 0 · required by 1
- `orchestrator/lib/quick-notes.js` (96 lines) — // ── lib/quick-notes.js ────────────────────────────────────────────────────── // UUID: nexus-quick-notes-v1-0000-3500-0000-000000000001  
  exports init, listNotes, createNote, deleteNote, MODULE_ID, VERSION · requires 0 · required by 1 · tested by `tests/modules/quick-notes.test.js`
- `orchestrator/lib/request-handler.js` (831 lines) — // ── lib/request-handler.js ──────────────────────────────────────────────────── // UUID: nexus-request-handler-v1-0000-4000-0000-000000000001  
  exports handle, prompt, validateWiring, OUTCOME, COST_TIERS, DEFAULT_COST_CEILING +2 · requires 16 · required by 0 · emits request.received
- `orchestrator/lib/sigma-compaction.js` (146 lines)  
  exports MODULE_ID, VERSION, RETENTION_MS, BUCKET_MS, rollup, mergeRollups +3 · requires 1 · required by 0 · tested by `tests/modules/test-sigma-compaction.js`
- `orchestrator/lib/sigma-writer.js` (327 lines) — // ── lib/sigma-writer.js ─────────────────────────────────────────────────────── // UUID: nexus-sigma-writer-v1-0000-4000-0000-000000000002  
  exports init, stop, validateWiring, getComposite, _scoreEvent, VERSION +2 · requires 5 · required by 0 · emits sigma.composite.halt_risk, sigma.composite.warning, sigma.event.halt_risk, sigma.event.warning
- `orchestrator/lib/spec-drift.js` (366 lines) — lib/spec-drift.js — NEXUS Spec Drift Detector Compares the version declared in each system's .spec file against  
  exports check, bootPhase, MODULE_ID, VERSION · requires 1 · required by 2 · emits cortex.gap.found, cortex.gap.resolved
- `orchestrator/lib/ui-registry.js` (258 lines) — lib/ui-registry.js — NEXUS UI Registry (Phase 2: UI Handshake) Any UI that wants to connect to NEXUS does a three-step handshake:  
  exports init, register, heartbeat, deregister, list, listOnline +6 · requires 0 · required by 1 · emits ui.deregistered, ui.disconnected, ui.reconnected, ui.registered · tested by `tests/modules/test-ui-registry.js`
- `orchestrator/lib/versionium-auto-commit.js` (129 lines)  
  exports init, MODULE_ID, VERSION, COOLDOWN_MS · requires 2 · required by 0 · hears sigma.composite.halt_risk, sigma.composite.warning

#### `orchestrator/spec/`

1 other file(s).

- other: `orchestrator/spec/orchestrator.spec`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
