# NEXUS — Sovereign Multi-System Kernel

> **status: full map (0.60.153)** · 15 systems (12 kernels + components + cos + core; cos since 0.39.341, ERAVOS deleted 0.60.83 at his call), every top-level directory placed, every system with an atlas of its own, and below the narrative every module and every file, every phase, the data structure, all of Idearium's routes and commands, and every release in his words, generated from the tree · each system is a module of NEXUS, and each module is its own modular system with components: the same shape, one zoom level further out.

**Author:** James Brooks (Erosmancer) · rheon.world

---

## How to read this atlas

This page is the Home of the `nexus` repo in Idearium. Everything written in code style here, every file-tree line, every port like :9000 and every name ending in -atlas.md is a live link, resolved against the immutable snapshot by [the resolver](idearium/repo/nexus-self.js) the page calls:

- a **system** name such as `guardian` or `ollama-bridge` opens that system's repo, nested under `nexus`, and its Home starts with the system's own atlas;
- a **file** such as `lib/nexus-self/systems.js` opens in its system repo's editor, on that file;
- a **directory** such as `cos/testenv/` opens its repo's Files tab, filtered to it;
- a **document**, any Markdown file, renders right here with its own references live, so `guardian-atlas.md` opens the nested atlas in place and the breadcrumb brings you back.

Under each system heading below, the page adds that system's live numbers from the last sync (files, versions, phases, symbols, import resolution) and two links: into its nested atlas, and into its repo. A reference the snapshot does not hold is struck through and says so; it is never guessed. [The page itself](idearium/ui/js/nexus-atlas.js) renders this Markdown, and [a test](tests/modules/test-nexus-atlas-refs.test.js) renders it the same way and resolves every reference against the real tree, so a dead link here fails the build rather than waiting for someone to click it.

---

## What NEXUS is

NEXUS is a personal AI operating system built as one Node.js monorepo. It does not call AI providers through API keys. It drives real provider chats in browser tabs (ChatGPT, Claude, Gemini, Perplexity, DeepSeek) and local models through Ollama, and it wraps that dispatch in everything an operating system would give a program: a registry of what exists, a memory of what happened, version control of every change, a diagnostic layer that watches every system, a sandboxed place to run code, and a design surface where new systems are specified before they are built.

The top zoom level is this repo. One level in are fifteen systems. Twelve are kernels: each is a process with its own port, its own entry file, its own data folder and its own spec, started by [autopilot](nexus/autopilot.js) in dependency order. Two are nested repos with no process: `components`, the store of everything WARP builds, and `cos`, the Compartment OS (its own system since 0.39.341). The fifteenth, `core`, is everything no other system owns: the shared libraries in `lib/`, the event fabric (`warp/`, `siso/`, `nexus/nexus-bus.js`), the command line in `cli/`, the tests, the docs, and the UI shells. Who owns which file is decided in exactly one place, `lib/nexus-self/systems.js`, and everything that splits NEXUS into systems (the snapshot, the per-system repos in Idearium, the apply gate) goes through its ownerOf().

The systems never import each other's internals. They talk over HTTP, over the event bus, and through declared contracts: every system ships a `registry-components.js` listing its routes as components, an `interaction-contract.json` generated from it, and a .spec describing what it is supposed to be. Loom keeps the combined registry of components, hooks and wires, which is how NEXUS stays aware of its own shape. The rules that govern all of it are written down in `docs/AXIOMS-v3.1.md`, distilled for daily work in `docs/CLAUDE.md`, and every session starts by reading `docs/SESSION-PROTOCOL.md`.

This atlas is the narrative map. Each system's own atlas in `docs/atlases/` is the next zoom level. Idearium's machine atlas, an atlas.json per repo written by [the import pipeline](idearium/repo/import-pipeline.js), is the level below that: every file, its language, its symbols. [The aggregator](architecture-spec/registry/nexus-atlas-aggregate.js) rolls those per-repo files up into the numbers at the top of this page.

---

## The shape: kernels, phases, ports

Autopilot boots NEXUS in four phases. A phase does not start until every kernel in the one before it answers its /health route, or its timeout expires loudly. The order is not arbitrary. It came from boot logs in which all twelve kernels starting in the same instant produced connection-refused storms and one memory spike that took down a renderer, as the comment above the kernel list in [autopilot](nexus/autopilot.js) records.

| phase | system | port | entry | why it is in this phase |
|---|---|---|---|---|
| 1 | `cortex` | :3748 | `cortex/boot.js` | the memory core and the data root every other system writes into; it comes up before its writers |
| 2 | `orchestrator` | :9000 | `orchestrator/orchestrator.js` | registration authority, the unified API and SSE surface, and the UI server |
| 2 | `guardian` | :7820 | `guardian/server.js` | the AI engine; the orchestrator's gap relay dials it |
| 2 | `diagnostic` | :7825 | `diagnostic/nexus-diagnostic.js` | reads every ledger; the gap relay's other dial target |
| 3 | `idearium` | :4800 | `idearium/api/index.js` | ideas, specs and repos, including the `nexus` repo this page lives in |
| 3 | `architect` | :3747 | `architect/service.js` | hook registry, blueprints, the block canvas |
| 3 | `intelligence` | :3753 | `intelligence/server.js` | the cognition layer: CFR, sigma, causal field, RFR2 |
| 3 | `ollama-bridge` | :3749 | `ollama/server.js` | local model dispatch, isolated from guardian |
| 3 | `versionium` | :3754 | `versionium/server.js` | causal version control |
| 3 | `copilot` | :3750 | `copilot/server.js` | intent, context and the tool loop |
| 3 | `loom` | :3752 | `loom/server.js` | the component, hook and wire registry |
| 3 | `clear-glass` | :7704 | `clear-glass/src/main/index.js` | the Electron browser that holds the provider tabs |
| — | `core` | none | none | shared code; it runs inside whichever kernel requires it |

Phase 4 holds the optional `intelligence/consumer.js`. The critical kernels are cortex, orchestrator, guardian and diagnostic: if one of them cannot come up, autopilot says so and NEXUS is not considered booted. The others are optional in the sense that NEXUS runs without them, not that they are unimportant.

---

## File structure

Every top-level directory of the tree, with the system that owns it. Directories that are runtime state (any data folder, node_modules, .git, _archive) are never part of the snapshot and are not listed.

```
nexus/
  orchestrator/          orchestrator — root coordinator :9000
  cortex/                cortex — memory core, organs, RAID :3748
  guardian/              guardian — AI engine, provider tabs, jobs :7820
  idearium/              idearium — ideas, specs, repos, this page :4800
  architect/             architect — hooks, blueprints, block canvas :3747
  diagnostic/            diagnostic — ledgers, gaps, heal loop :7825
  intelligence/          intelligence — CFR, sigma, RFR2, causal :3753
  ollama/                ollama-bridge — local models :3749
  versionium/            versionium — causal version control :3754
  copilot/               copilot — intent, context, tool loop :3750
  loom/                  loom — component/hook/wire registry :3752
  clear-glass/           clear-glass — the sovereign browser :7704
  lib/                   core — shared libraries (about 525 files)
  cos/                   cos — Compartment OS: compartments, branches, runtimes, test VM
  cli/                   core — the nexus command line
  nexus/                 core — autopilot, the bus, query and connect layers
  warp/                  core — the five-primitive event spine
  siso/                  core — single input, single output: Event, Gate, Stream
  jaa/                   core — the JAA table schema
  contracts/             core — the NEXUS interaction contract and contract nodes
  hooks/                 core — per-system hook declarations
  seams/                 core — seam contracts and the port table
  auth/                  core — the sovereign auth layer (keys, policy)
  security/              core — the signed signaling envelope
  meta/                  core — domain-agnostic measurement (confidence, lattice)
  mesh/                  core — networking daemons ported from BrainOS
  remote-desktop/        core — remote desktop host, viewer, bridge-os-core
  emerge/                core — the .eg DSL runtime and spec compiler
  emergence/             core — James's Emergence: observation that feeds back into observation, on WARP
  erosmancer/            core — ErosmancerOS, CDP browser automation
  cockpit/               core — the forge IDE spec and its core
  architecture-spec/     core — the scaffold every new system is built on
  products/              core — what Nexus is made into: Flight Recorder
  service/               core — ICO kernel service wrappers
  sentinel/              core — the sentinel's interaction contract
  scripts/               core — verification and release scripts
  skills/                core — session skills (changelog, persona)
  tablet/                core — tablet homepage and 3D map
  ui/                    core — UI shells: home, tv-shell, brainos
  docs/                  core — axioms, specs, phasemaps, handoffs, atlases
  tests/                 core — every suite and its runners
```

Each directory is described in its own section: the twelve kernels under **The modules**, and every `core` directory under **core, directory by directory**.

---

## How work moves through NEXUS

The systems are easiest to understand by following the four things NEXUS does all day.

### How a prompt is answered

A prompt starts in a UI: the home shell in `ui/home/index.html`, the TV shell, Idearium's Agent tab in `idearium/ui/js/app.js`, or the command line in `cli/nexus-cli.js`. It reaches `copilot` over HTTP. Copilot decides what the prompt is (its intent router in `copilot/lib/grammar-router.js`), assembles context from memory and from the repo it concerns (`lib/repo-context.js`, `copilot/lib/copilot-context.js`), and chooses a backend: a local model through `ollama-bridge`, or a provider tab through `guardian`. When tools are allowed, copilot runs the tool loop in `copilot/tool-runtime.js` against the registered tools in `lib/agent-tools/`.

Guardian turns the request into a job (`guardian/lib/jobs.js`) and hands it to its dispatcher (`guardian/lib/dispatcher.js`), which finds or opens the tab the job belongs to through the dispatch pool (`guardian/lib/dispatch-pool.js`). The tab lives in `clear-glass`, the Electron browser, and a provider userscript such as `guardian/userscript-chatgpt.js` types the prompt, watches the reply, streams it back in chunks, and pushes the settled transcript. Guardian's gate trail (`guardian/lib/gate-trail.js`) records every step a job passes, so a failure names the gate it stopped at. The reply is written through the response sink (`guardian/lib/response-sink.js`), versioned as a transcript (`guardian/lib/chat-transcripts.js`), and remembered by `cortex`.

### How a repo is built and changed

An idea becomes a spec in `idearium`, and a spec becomes a repo with its own compartment in `cos/`. The import pipeline in `idearium/repo/import-pipeline.js` parses a repo's files, writes the per-repo atlas, chunks and verifies it, and builds the code graph (`idearium/repo/graph.js`) and spec graph (`idearium/repo/spec-graph.js`). NEXUS is itself one of these repos: `idearium/repo/nexus-self.js` snapshots the live tree into content-addressed blobs (`lib/nexus-self/store.js`), splits it into one repo per system, and lets an edit happen only on a COS branch (`lib/nexus-self/branch.js`) that is run and tested before the apply gate (`lib/nexus-self/apply.js`) lets it back into the live files.

A phase of a repo is built in two jobs. A reasoning agent plans it (`lib/phase-plan.js`): it reads the code, this atlas, the spec and the loom map first, maps every file to the component registry (the spec's own, then the repo's code), names each file's exports, imports and steps, and writes the phase's proof conditions from the intent; a plan for the wrong system, or with a file mapped to nothing, goes back. Then each planned file is one small request to the coder ladder, Ollama first (`lib/pipeline-routing.js` planMode, coderRungs), its exports checked when it comes back, and the conditions prove the phase. What each planner and coder did is read back into the next plan (`lib/plan-learning.js`). A repo plays, pauses and rewinds like a VM (`lib/repo-run-state.js`): paused, no agent call, phase attempt or spec chunk of it starts until it is played.

Running happens through the COS run menu in `lib/cos-run.js`: run the entry, boot it and probe its health, run the tests, check syntax, resolve dependencies. The strongest option is a real virtual machine (`cos/testenv/index.js`): an ephemeral Linux guest on a throwaway overlay of a base image, the repo handed in as a read-only tar disk (`cos/testenv/tar.js`), dependencies installed online, the network then cut over QMP and the cut proven from inside the guest before any test runs. `cos/testenv/detect.js` decides what "test this repo" means for any repo, and `cos/testenv/provision.js` makes the base image; on Windows, `cos/testenv/setup-vm.bat` does the whole setup.

### How NEXUS heals

`diagnostic` reads every system's ledger on a timer and computes sigma, friction and drift per system (`diagnostic/nexus-diagnostic.js`). A deviation becomes a gap. The heal loop (`diagnostic/lib/heal-loop.js`) classifies the gap, has `architect` propose a blueprint for the fix, sends the patch work to `guardian`, snapshots before and after in `versionium`, and either closes the gap or escalates it. Loom's wiring checks feed the same path: `diagnostic/lib/wire-integrity.js` decides which dangling hooks are real gaps and which are simply files nothing requires.

### How NEXUS knows itself

`loom` holds the registry. At bootstrap (`loom/bootstrap.js`) it scans the whole tree for real require and import edges (`loom/scanners/source-map.js`), runs the hand maps in `loom/maps/` for edges a scanner cannot see (HTTP calls, spawned processes, postMessage), maps capabilities and specs (`loom/scanners/capability-map.js`, `loom/scanners/spec-map.js`), and reports anything declared but served by nothing. The phasemap scanner (`loom/scanners/phasemap-map.js`) reads every phasemap spec (`docs/*-phasemap.spec`) and stamps each transition with the Versionium commit that holds the spec's bytes. `intelligence` measures the result, and this atlas is the part of that self-knowledge written for a person.

---

## Governing law

The axioms are immutable law in `docs/AXIOMS-v3.1.md`; earlier versions stay beside it (`docs/AXIOMS-v3.0.md`, `docs/AXIOMS-v2.0.md`, `docs/AXIOMS-v1.0.md`) because nothing is lost. `docs/CLAUDE.md` distills five standing rules every change follows: map before build, in a `docs/*-phasemap.spec`; reuse before build; update loom's registry with real wires; add a dated addendum to every spec a change touches, and register new specs in `docs/SPEC-REGISTRY.spec`; and archive instead of delete. Evidence discipline sits over all of it: a route, a wire or a claim is not real until it is checked against the source, and nothing fails silently.

Two axioms shape the code most visibly. Sovereignty (§5.9, §5.10) is why systems talk only through contracts: `contracts/nexus-interaction-contract.js` is the single table of every endpoint, port, event name and CLI command, and each system's `interaction-contract.json` is derived from its own `registry-components.js`. SISO (§14) is why cross-system features are pipelines of pure gates over immutable events: the pattern lives in `siso/`, its hardened successor with digests and axioms in `warp/`, and its persistence in the JAA tables defined by `jaa/schema.sql`.

The process rules are as concrete. `docs/SESSION-PROTOCOL.md` exists because sessions once worked on isolated zip snapshots and silently forked; it is why the delivered zip always carries the .git folder. `lib/version.js` is the single source of every version number, with a dated entry per release; `package.json` follows it. Tests register in `tests/modules/run-all.js` and must never write to the tree, which `lib/test-sandbox.js` enforces by giving every suite a throwaway data root.

---

## The modules

One section per system. The page adds each system's live numbers under its heading, with links into its nested atlas and its repo.

### orchestrator

The root coordinator, and the one front door every UI, CLI and external consumer uses. `orchestrator/orchestrator.js` is a single process on :9000 that executes commands against every system's API, exposes a unified API surface over all of them, streams every live event through one SSE endpoint, and serves each system's UI under /ui/ by name, hot-swapped, including Idearium's own UI from `idearium/ui/` and the Architect canvases from `architect/src/ui/`. Its spec, `orchestrator/spec/orchestrator.spec`, puts the discipline in one line: the orchestrator never does business logic; it routes, verifies and coordinates.

Its library is where the system-wide concerns live. `orchestrator/lib/contract-handshake.js` and `orchestrator/lib/contract-poller.js` verify every registered system's interaction contract and mark it verified, degraded, mismatched or unreachable. `orchestrator/lib/ui-registry.js` is the UI handshake. `orchestrator/lib/spec-drift.js` compares specs against code. `orchestrator/lib/pulse.js` is the pulse system, `orchestrator/lib/sigma-writer.js` and `orchestrator/lib/sigma-compaction.js` produce and roll up sigma records, and `orchestrator/lib/versionium-auto-commit.js` commits to `versionium` when sigma says a change is significant. `orchestrator/lib/mcp-server.js` and `orchestrator/lib/mcp-stdio.js` expose NEXUS's tools over MCP. `orchestrator/lib/peer-relay.js` bridges to remote systems, and `orchestrator/lib/hot-loader.js` swaps modules without a restart.

It owns its declared components in `orchestrator/orchestrator-contract.json` and `orchestrator/interaction-contract.json`, and its configuration in `orchestrator/orchestrator.config.json`. The next zoom level is `orchestrator-atlas.md`.

<!-- generated:readme:system:orchestrator:start -->
#### orchestrator: every module and every file

Orchestrator is 27 files in 3 modules, entry `orchestrator/orchestrator.js`, port 9000, spec `orchestrator/spec/orchestrator.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/orchestrator-atlas.md`.

<details>
<summary>`orchestrator/` · 5 files</summary>

- `orchestrator/event-taxonomy.js` — // orchestrator/event-taxonomy.js — ET4_orchestrator_autopilot_event_taxonomy. // Conforms to…
- `orchestrator/interaction-contract.json`
- `orchestrator/orchestrator-contract.json`
- `orchestrator/orchestrator.config.json`
- `orchestrator/orchestrator.js` — // ════════════════════════════════════════════════════════════════════════════ // NEXUS ORCHESTRATOR — v2.0.0

</details>

<details>
<summary>`orchestrator/lib/` · 21 files</summary>

- `orchestrator/lib/autonomous-loop.js`
- `orchestrator/lib/changelog.js`
- `orchestrator/lib/contract-handshake.js`
- `orchestrator/lib/contract-poller.js`
- `orchestrator/lib/file-push.js`
- `orchestrator/lib/grammar-misfire-tracker.js`
- `orchestrator/lib/hot-loader.js`
- `orchestrator/lib/intent-map.js`
- `orchestrator/lib/mcp-server.js`
- `orchestrator/lib/mcp-stdio.js`
- `orchestrator/lib/mcp-tools-tokensave.js`
- `orchestrator/lib/mutation-contract.js`
- `orchestrator/lib/peer-relay.js`
- `orchestrator/lib/pulse.js`
- `orchestrator/lib/quick-notes.js`
- `orchestrator/lib/request-handler.js`
- `orchestrator/lib/sigma-compaction.js`
- `orchestrator/lib/sigma-writer.js`
- `orchestrator/lib/spec-drift.js`
- `orchestrator/lib/ui-registry.js`
- `orchestrator/lib/versionium-auto-commit.js`

</details>

<details>
<summary>`orchestrator/spec/` · 1 file</summary>

- `orchestrator/spec/orchestrator.spec` — ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──

</details>

6 release notes name a file of orchestrator: 0.60.131., 0.60.126., 0.39.355., 0.39.277., 0.39.173., 0.39.172.. Each is in the version history below, in his words.

<!-- generated:readme:system:orchestrator:end -->

### cortex

The memory core, and since the 2026-07-24 storage decision the data root the other systems write into, which is why it boots first. `cortex/boot.js` brings up six organs in a fixed sequence (gap finder, healer, self-heal, orion, RAID, heartbeat), and the organs never call each other: they subscribe to and emit events. Memory lives in `cortex/memory/`: the JAA table layer in `cortex/memory/jaa-db.js`, relevance and decay in `cortex/memory/relevance.js` and `cortex/memory/decay.js`, tiers in `cortex/memory/tiers.js`, and compaction and deduplication in `cortex/memory/table-compactor.js` and `cortex/memory/table-deduplicator.js`.

RAID, the routing authority every request passes through (§5.2, §9.1), lives in `cortex/core/raid/`: it writes the ledger entry before anything is dispatched, and it is where contracts are taken in and officiated (`cortex/core/raid/contract-intake.js`, `cortex/core/raid/contract-boundary.js`). Cortex's configuration is `cortex/config.js`, its personas `cortex/personas.js`, its schemas `cortex/schemas/`, and its spec `cortex/spec/cortex.spec`. The next zoom level is `cortex-atlas.md`.

<!-- generated:readme:system:cortex:start -->
#### cortex: every module and every file

Cortex is 78 files in 13 modules, entry `cortex/boot.js`, port 3748, spec `cortex/spec/cortex.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/cortex-atlas.md`.

<details>
<summary>`cortex/` · 9 files</summary>

- `cortex/boot.js`
- `cortex/compartment.json`
- `cortex/config.js`
- `cortex/cortex-v2.js`
- `cortex/event-taxonomy.js`
- `cortex/interaction-contract.json`
- `cortex/personas.js`
- `cortex/push-recall.js`
- `cortex/registry-components.js`

</details>

<details>
<summary>`cortex/contract/` · 1 file</summary>

- `cortex/contract/index.js` — Agent Interaction Contracts One source of truth for "what is this source of requests allowed to do."

</details>

<details>
<summary>`cortex/core/` · 16 files</summary>

- `cortex/core/raid/context-gate.js`
- `cortex/core/raid/context-synthesis.js`
- `cortex/core/raid/contract-adapters.js`
- `cortex/core/raid/contract-boundary.js`
- `cortex/core/raid/contract-gates.js`
- `cortex/core/raid/contract-intake.js`
- `cortex/core/raid/contract-trace.js`
- `cortex/core/raid/envelope.js`
- `cortex/core/raid/event-taxonomy.js`
- `cortex/core/raid/index.js`
- `cortex/core/raid/officiator.js`
- `cortex/core/raid/router.js`
- `cortex/core/raid/routing-ir.js`
- `cortex/core/raid/snr-filter.js`
- `cortex/core/raid/tunables.js`
- `cortex/core/raid/worker.js`

</details>

<details>
<summary>`cortex/gap-finder/` · 1 file</summary>

- `cortex/gap-finder/index.js` — Gap-Finder Organ Turns real signal into real gaps. Two inputs, both already live in the

</details>

<details>
<summary>`cortex/input/` · 1 file</summary>

- `cortex/input/1b508067-bc0c-4a83-953c-7603c87fdec3.contract`

</details>

<details>
<summary>`cortex/memory/` · 9 files</summary>

- `cortex/memory/bep-lookup.js`
- `cortex/memory/causal-lookup.js`
- `cortex/memory/decay.js`
- `cortex/memory/fix-map.js`
- `cortex/memory/jaa-db.js`
- `cortex/memory/relevance.js`
- `cortex/memory/table-compactor.js`
- `cortex/memory/table-deduplicator.js`
- `cortex/memory/tiers.js`

</details>

<details>
<summary>`cortex/orion/` · 1 file</summary>

- `cortex/orion/index.js` — Orion Classification Organ "Sensor + policy. Classifies requests, routes to context" (cortex.spec).

</details>

<details>
<summary>`cortex/output/` · 2 files</summary>

- `cortex/output/.gitkeep`
- `cortex/output/1b508067-bc0c-4a83-953c-7603c87fdec3.contract`

</details>

<details>
<summary>`cortex/schemas/` · 27 files</summary>

- `cortex/schemas/index.js`
- `cortex/schemas/schema.account_identity_index_entry`
- `cortex/schemas/schema.bep_pattern`
- `cortex/schemas/schema.capability`
- `cortex/schemas/schema.chat_log`
- `cortex/schemas/schema.component`
- `cortex/schemas/schema.component_projection`
- `cortex/schemas/schema.constitution_decision`
- `cortex/schemas/schema.contract`
- `cortex/schemas/schema.debug_macro`
- `cortex/schemas/schema.event`
- `cortex/schemas/schema.failure_mode`
- `cortex/schemas/schema.fault`
- `cortex/schemas/schema.gap`
- `cortex/schemas/schema.hook`
- `cortex/schemas/schema.hook_contract`
- `cortex/schemas/schema.idea`
- `cortex/schemas/schema.interstitial_space`
- `cortex/schemas/schema.ledger`
- `cortex/schemas/schema.node`
- `cortex/schemas/schema.raid_contract`
- `cortex/schemas/schema.resonance_crystal`
- `cortex/schemas/schema.sigma_record`
- `cortex/schemas/schema.synthesis`
- `cortex/schemas/schema.system`
- `cortex/schemas/schema.tool_index_entry`
- `cortex/schemas/schema.wire`

</details>

<details>
<summary>`cortex/self-heal/` · 6 files</summary>

- `cortex/self-heal/escalation.js`
- `cortex/self-heal/failure-intake.js`
- `cortex/self-heal/failure-mode-forensics.js`
- `cortex/self-heal/failure-report.js`
- `cortex/self-heal/fault-taxonomy.js` — // cortex/self-heal/fault-taxonomy.js — Phase 1: schema + sole write authority for 'fault_taxonomy' // UUID:…
- `cortex/self-heal/index.js`

</details>

<details>
<summary>`cortex/snapshot/` · 1 file</summary>

- `cortex/snapshot/index.js`

</details>

<details>
<summary>`cortex/spec/` · 2 files</summary>

- `cortex/spec/cortex.node-taxonomy.md` — Node type → system map — Cortex
- `cortex/spec/cortex.spec` — ── ADDENDUM 2026-09-29 (0.39.282) — cortex 3.6.0 ──

</details>

<details>
<summary>`cortex/tools/` · 2 files</summary>

- `cortex/tools/materialize-cli.js` — CLI for table-materializer.js. Usage: node cortex/tools/materialize-cli.js [--apply]
- `cortex/tools/table-materializer.js`

</details>

28 release notes name a file of cortex: 0.60.157., 0.60.150., 0.60.149., 0.60.147., 0.60.145., 0.60.133., 0.60.132., 0.60.131., 0.60.94., 0.60.79., 0.60.78., 0.60.75., 0.60.73., 0.60.36., 0.60.30., 0.60.29., 0.60.18., 0.60.16., 0.60.15., 0.60.3., 0.59.6., 0.43.0., 0.39.342., 0.39.333., 0.39.277., 0.39.267., 0.39.236., 0.39.181.. Each is in the version history below, in his words.

<!-- generated:readme:system:cortex:end -->

### guardian

The AI engine and NEXUS's only point of contact with AI providers: no API keys, no external inference calls, browser tabs only. `guardian/server.js` on :7820 receives jobs, and `guardian/lib/` is where they are handled: `guardian/lib/jobs.js` and `guardian/lib/dispatcher.js` for the job lifecycle, `guardian/lib/dispatch-pool.js` and `guardian/lib/dispatch-ladder.js` for choosing a tab, `guardian/lib/ncp.js` and `guardian/lib/ncp-handler.js` for the NCP protocol the userscripts speak, `guardian/lib/agent-registry.js` and `guardian/lib/selector-map.js` for each provider's page selectors, `guardian/lib/wake-loop.js` for an agent's "hey nexus" to NEXUS, and `guardian/lib/node-registry.js` for its JAA-backed node types, the watcher pattern `architecture-spec` generalizes. When a tab needs the person, a sign-in wall, a chat it cannot map, a tab that never connects, `guardian/lib/provider-attention.js` asks Clear Glass to show that tab with a Nexus panel and its element picker (`clear-glass/src/providers/attention.js`).

The provider side is the userscripts: `guardian/userscript-chatgpt.js`, `guardian/userscript-claude.js`, `guardian/userscript-gemini.js`, `guardian/userscript-perplexity.js` and `guardian/userscript-deepseek.js`, declared in `guardian/userscripts.yaml`. Its commands live in `guardian/commands/`, its routes in `guardian/routes/`, and its spec in `guardian/spec/guardian.spec`. The next zoom level is `guardian-atlas.md`.

<!-- generated:readme:system:guardian:start -->
#### guardian: every module and every file

Guardian is 202 files in 10 modules, entry `guardian/server.js`, port 7820, spec `guardian/spec/guardian.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/guardian-atlas.md`.

<details>
<summary>`guardian/` · 35 files</summary>

- `guardian/api-dispatch.js`
- `guardian/artifact-upload.js`
- `guardian/ask.js`
- `guardian/clear-glass-bridge.js`
- `guardian/cli.js`
- `guardian/compartment.json`
- `guardian/config.js`
- `guardian/dropzone-persist.js`
- `guardian/dropzone.js`
- `guardian/event-taxonomy.js`
- `guardian/guardian-api.js`
- `guardian/guardian-cert.pem`
- `guardian/guardian-key.pem`
- `guardian/guardian.config.json`
- `guardian/interaction-contract.json`
- `guardian/interaction-contract.v2.json`
- `guardian/jaa-store.js`
- `guardian/nexus-hey-claude.user.js`
- `guardian/options.js`
- `guardian/registry-components.js`
- `guardian/server.js`
- `guardian/spec-namer.js`
- `guardian/tool-runtime.js`
- `guardian/userscript-chat-stream.js`
- `guardian/userscript-chatgpt.js`
- `guardian/userscript-claude.js`
- `guardian/userscript-deepseek.js`
- `guardian/userscript-field-map.js`
- `guardian/userscript-gemini.js`
- `guardian/userscript-memory.js`
- `guardian/userscript-nexus-wake.js`
- `guardian/userscript-ollama.js.deprecated`
- `guardian/userscript-orchestrator.js.deprecated`
- `guardian/userscript-perplexity.js`
- `guardian/userscripts.yaml`

</details>

<details>
<summary>`guardian/agents/` · 1 file</summary>

- `guardian/agents/index.js` — // ── agents/callto/index.js ──────────────────────────────────────────────────── // UUID: agents-callto

</details>

<details>
<summary>`guardian/commands/` · 49 files</summary>

- `guardian/commands/get-alk-last.command`
- `guardian/commands/get-api-guardian-cfr-state.command`
- `guardian/commands/get-api-guardian-hooks-summary.command`
- `guardian/commands/get-api-guardian-nerve-snapshot.command`
- `guardian/commands/get-api-guardian-organism-queue.command`
- `guardian/commands/get-api-intake.command`
- `guardian/commands/get-api-tools.command`
- `guardian/commands/get-artifacts.command`
- `guardian/commands/get-baseline.command`
- `guardian/commands/get-bus.command`
- `guardian/commands/get-channel.command`
- `guardian/commands/get-cockpit.command`
- `guardian/commands/get-commands.command`
- `guardian/commands/get-contract.command`
- `guardian/commands/get-events.command`
- `guardian/commands/get-gaps-summary.command`
- `guardian/commands/get-gaps.command`
- `guardian/commands/get-health.command`
- `guardian/commands/get-jobs.command`
- `guardian/commands/get-providers.command`
- `guardian/commands/get-queue-compartments.command`
- `guardian/commands/get-queue.command`
- `guardian/commands/get-root.command`
- `guardian/commands/get-seam-queues.command`
- `guardian/commands/get-seam-sessions.command`
- `guardian/commands/get-seam-status-cross-system.command`
- `guardian/commands/get-seam-watchdog-status.command`
- `guardian/commands/get-sessions.command`
- `guardian/commands/get-version.command`
- `guardian/commands/post-api-account-identity.command`
- `guardian/commands/post-api-copilot-prompt.command`
- `guardian/commands/post-api-guardian-cfr-event.command`
- `guardian/commands/post-api-intake-promote.command`
- `guardian/commands/post-api-intake-rollback.command`
- `guardian/commands/post-api-intake-verdict.command`
- `guardian/commands/post-api-intake.command`
- `guardian/commands/post-build.command`
- `guardian/commands/post-bus-emit.command`
- `guardian/commands/post-chatgpt-mode-query.command`
- `guardian/commands/post-cli-exec.command`
- `guardian/commands/post-command-tools.command`
- `guardian/commands/post-command.command`
- `guardian/commands/post-heartbeat.command`
- `guardian/commands/post-queue-compartments.command`
- `guardian/commands/post-queue-enqueue.command`
- `guardian/commands/post-result.command`
- `guardian/commands/post-seam-retry.command`
- `guardian/commands/post-seam-sessions.command`
- `guardian/commands/post-wake-job-ack.command`

</details>

<details>
<summary>`guardian/input/` · 28 files</summary>

- `guardian/input/21be4c17-8aeb-4f45-8348-ebbe70cb9f41.contract`
- `guardian/input/38214f9b-381e-457c-a760-a34c6065b778.contract`
- `guardian/input/3d66e369-e2c5-415a-a35f-46a3f5bb062a.contract`
- `guardian/input/43e3c367-7f24-4814-8267-6eca61180111.contract`
- `guardian/input/54262237-5dd5-48f2-8736-865c1212fe9d.contract`
- `guardian/input/547bac67-abf5-4739-be7a-b2df01808167.contract`
- `guardian/input/64c3aeea-dbd3-4955-99d4-91f09a069286.contract`
- `guardian/input/6729653e-15d1-4c7f-a3bf-b685f534799d.contract`
- `guardian/input/6861fada-0c44-455c-b9af-21bf6bcf467f.contract`
- `guardian/input/757a7719-723f-4916-b54b-95c912e2b747.contract`
- `guardian/input/76637fea-b9ad-4cfc-8dc6-e4ccf293faf6.contract`
- `guardian/input/77b66689-ed28-47ec-ac40-155cf4791bcf.contract`
- `guardian/input/79efbcdb-7531-4c98-a7d6-524553d13bc9.contract`
- `guardian/input/7f8129c9-ec89-4768-95ef-c0a3448b5638.contract`
- `guardian/input/89803f6c-cfb5-4cd1-b44e-5149d3961306.contract`
- `guardian/input/89c220ce-6d73-4135-ba47-8a491c4c26fd.contract`
- `guardian/input/955c4d3b-c480-4274-8bdb-63aa7be4ad9a.contract`
- `guardian/input/9f0fb136-ae15-403f-9650-7330b8e767a2.contract`
- `guardian/input/b48310e4-8bd2-45d1-b64c-ae1a87f91227.contract`
- `guardian/input/c12624c0-870e-4415-9489-765e4373c3a1.contract`
- `guardian/input/c4f2189a-b6f7-4cba-b705-99d845efb718.contract`
- `guardian/input/c9137aae-71a0-4c27-b4ca-6b4bd611fac7.contract`
- `guardian/input/ca885e67-edf2-48ac-acb7-547f6ac3ae70.contract`
- `guardian/input/cd1262af-279a-4e29-bad9-e079e602a103.contract`
- `guardian/input/d3235712-2362-4a51-bb11-88ea255c3270.contract`
- `guardian/input/dc183a7f-653c-4ebf-9bdb-961592ef2cd5.contract`
- `guardian/input/dde80285-278c-416b-a2f5-9da44df25400.contract`
- `guardian/input/fdc24fa8-e6bb-4740-9a68-fd1fa1fea613.contract`

</details>

<details>
<summary>`guardian/lib/` · 38 files</summary>

- `guardian/lib/account-routing.js`
- `guardian/lib/agent-facts.js`
- `guardian/lib/agent-model-nodes.js`
- `guardian/lib/agent-registry.js`
- `guardian/lib/agent-registry.seed.json`
- `guardian/lib/artifact-namer.js`
- `guardian/lib/cg-account-authority.js`
- `guardian/lib/chat-sync.js`
- `guardian/lib/chat-transcripts.js`
- `guardian/lib/code-artifact.js`
- `guardian/lib/command-index-extract.js`
- `guardian/lib/command-registry.js`
- `guardian/lib/dispatch-ladder.js`
- `guardian/lib/dispatch-pool-bridge.js`
- `guardian/lib/dispatch-pool.js`
- `guardian/lib/dispatcher.js`
- `guardian/lib/economy-guard.js`
- `guardian/lib/eros-typist.js`
- `guardian/lib/gap-hunter.js`
- `guardian/lib/gate-trail.js`
- `guardian/lib/grammar-fallback.js`
- `guardian/lib/index.js`
- `guardian/lib/job-retry.js`
- `guardian/lib/jobs.js`
- `guardian/lib/mesh-client.js`
- `guardian/lib/ncp-handler.js`
- `guardian/lib/ncp.js`
- `guardian/lib/node-registry.js`
- `guardian/lib/profile-lanes.js`
- `guardian/lib/provider-attention.js`
- `guardian/lib/provider-login.js`
- `guardian/lib/provider-ready.js`
- `guardian/lib/provider-routing.js`
- `guardian/lib/raid-feedback.js`
- `guardian/lib/response-sink.js`
- `guardian/lib/selector-map.js`
- `guardian/lib/wake-hint.js`
- `guardian/lib/wake-loop.js`

</details>

<details>
<summary>`guardian/memory_store/` · 11 files</summary>

- `guardian/memory_store/artifacts.json`
- `guardian/memory_store/cfr_state.json`
- `guardian/memory_store/chat_log.json`
- `guardian/memory_store/event_log.json`
- `guardian/memory_store/event_stats.json`
- `guardian/memory_store/gaps.json`
- `guardian/memory_store/jobs.json`
- `guardian/memory_store/ledger.json`
- `guardian/memory_store/queue_compartments.json`
- `guardian/memory_store/seam_sessions.json`
- `guardian/memory_store/settings.json`

</details>

<details>
<summary>`guardian/output/` · 1 file</summary>

- `guardian/output/.gitkeep`

</details>

<details>
<summary>`guardian/routes/` · 3 files</summary>

- `guardian/routes/autonomous-loop.js` — // guardian/routes/autonomous-loop.js — the first real caller of // lib/autonomous-loop.js's run(). Phase 13…
- `guardian/routes/mesh.js` — // guardian/routes/mesh.js — routes for the mesh subsystem (mesh/install.js). // UUID:…
- `guardian/routes/settings.js` — // guardian/routes/settings.js — the real /settings cluster (3 routes), // extracted verbatim from…

</details>

<details>
<summary>`guardian/schemas/` · 32 files</summary>

- `guardian/schemas/index.js`
- `guardian/schemas/schema.agent`
- `guardian/schemas/schema.artifact`
- `guardian/schemas/schema.capability`
- `guardian/schemas/schema.command`
- `guardian/schemas/schema.component`
- `guardian/schemas/schema.event`
- `guardian/schemas/schema.fault`
- `guardian/schemas/schema.gap`
- `guardian/schemas/schema.guardian_chat_log`
- `guardian/schemas/schema.guardian_download`
- `guardian/schemas/schema.guardian_job`
- `guardian/schemas/schema.guardian_listener`
- `guardian/schemas/schema.guardian_pa_session`
- `guardian/schemas/schema.guardian_queue_compartment`
- `guardian/schemas/schema.guardian_seam_session`
- `guardian/schemas/schema.guardian_session`
- `guardian/schemas/schema.guardian_setting`
- `guardian/schemas/schema.guardian_timeline_event`
- `guardian/schemas/schema.hat`
- `guardian/schemas/schema.health`
- `guardian/schemas/schema.hook`
- `guardian/schemas/schema.hook_contract`
- `guardian/schemas/schema.input`
- `guardian/schemas/schema.intent`
- `guardian/schemas/schema.ledger`
- `guardian/schemas/schema.model`
- `guardian/schemas/schema.node`
- `guardian/schemas/schema.output`
- `guardian/schemas/schema.system`
- `guardian/schemas/schema.tool`
- `guardian/schemas/schema.wire`

</details>

<details>
<summary>`guardian/spec/` · 4 files</summary>

- `guardian/spec/agents-and-accounts.spec` — Agents and accounts — made in the spec workshop (idearium)
- `guardian/spec/guardian.code-artifact.spec`
- `guardian/spec/guardian.node-taxonomy.md` — Node type → system map — Guardian
- `guardian/spec/guardian.spec` — ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──

</details>

54 release notes name a file of guardian: 0.60.149., 0.60.148., 0.60.146., 0.60.143., 0.60.133., 0.60.132., 0.60.131., 0.60.130., 0.60.124., 0.60.120., 0.60.113., 0.60.100., 0.60.70., 0.60.28., 0.60.15., 0.60.10., 0.60.2., 0.60.0., 0.59.15., 0.57.0., 0.54.0., 0.42.0., 0.41.0., 0.40.1., 0.39.335., 0.39.282., 0.39.281., 0.39.279., 0.39.278., 0.39.269., 0.39.268., 0.39.267., 0.39.266., 0.39.263., 0.39.256., 0.39.255., 0.39.254., 0.39.252., 0.39.249., 0.39.248., and 14 older. Each is in the version history below, in his words.

<!-- generated:readme:system:guardian:end -->

### idearium

Where work begins and where this page lives. `idearium/api/index.js` on :4800 serves ideas, brainstorms, specs, repos and their compartments, and `idearium/ui/` is the whole Idearium interface: Welcome and Repos, where each repo opens into 12 tabs: Home, Idea, Files, Architect, Spec (the living spec), Phases (every phasemap as one manager), Intelligence, Agent, Debug, Versionium, Sync & CI and Settings, then Create (Brainstorm, Ideas) and Build (the Architect block canvas, the Spec Builder; the Eravos canvas until 0.60.83), which belong to the open repo. The Agent tab is the repo's own agent, a hat forged for that one project that answers on Ollama, through copilot or through a browser agent, remembers its work in the Clear Glass download manager, and proposes its code as injects. `idearium/ui/js/app.js` is the interface, `idearium/ui/js/nexus-atlas.js` renders this atlas, `idearium/ui/js/compartment.js` draws compartments, and `idearium/ui/js/agent-blocks.js` edits exactly what an agent is sent.

The spec engine in `idearium/spec-engine/` turns an idea into a spec by chunking it into blocks (`idearium/spec-engine/blocks.yaml`), dispatching each chunk to guardian (`idearium/spec-engine/chunk-dispatch.js`), and planning a file tree first when asked. The repo layer in `idearium/repo/` imports, snapshots, watches and graphs repos; `idearium/repo/nexus-self.js` is what makes NEXUS one of them. Its spec is `idearium/spec/idearium.spec`, with the roadmap and graph specs beside it. The next zoom level is `idearium-atlas.md`.

<!-- generated:readme:system:idearium:start -->
#### idearium: every module and every file

Idearium is 210 files in 20 modules, entry `idearium/api/index.js`, port 4800, spec `idearium/spec/idearium.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/idearium-atlas.md`.

<details>
<summary>`idearium/` · 12 files</summary>

- `idearium/CHANGES-2026-07-11-MERGE.md`
- `idearium/CHANGES-2026-07-11.md`
- `idearium/CHANGES-2026-09-21.md`
- `idearium/compartment.json`
- `idearium/compiler-bridge.js`
- `idearium/config.js`
- `idearium/event-taxonomy.cjs`
- `idearium/idearium.config.json`
- `idearium/index.js`
- `idearium/interaction-contract.json`
- `idearium/package.json`
- `idearium/registry-components.js`

</details>

<details>
<summary>`idearium/agent-suite/` · 1 file</summary>

- `idearium/agent-suite/index.js` — Agent Tool Suite Phase: 40.5 — Agent Suite: full NEXUS tool access for spec builders

</details>

<details>
<summary>`idearium/api/` · 2 files</summary>

- `idearium/api/build-surface.js`
- `idearium/api/index.js` — ╔══════════════════════════════════════════════════════════════════════════╗ ║ Idearium HTTP API —…

</details>

<details>
<summary>`idearium/cli/` · 3 files</summary>

- `idearium/cli/index.js`
- `idearium/cli/route-commands.js` — §0.39.374: every capability is a command. James: "That was fantastic. Everything needs to be available as…
- `idearium/cli/store-chatter.js` — §0.39.374: imported FIRST by idearium/cli/index.js (ES modules run their imports in order, before the…

</details>

<details>
<summary>`idearium/copilot-adapter/` · 1 file</summary>

- `idearium/copilot-adapter/index.js`

</details>

<details>
<summary>`idearium/core/` · 1 file</summary>

- `idearium/core/index.js` — // ── idearium/core/index.js ──────────────────────────────────────────────────── // Re-exports from…

</details>

<details>
<summary>`idearium/lib/` · 17 files</summary>

- `idearium/lib/access.cjs`
- `idearium/lib/architect.js`
- `idearium/lib/chunk-nodes.js`
- `idearium/lib/config-core.cjs`
- `idearium/lib/config.js`
- `idearium/lib/cortex-listeners.js`
- `idearium/lib/data-dir.cjs`
- `idearium/lib/db.js`
- `idearium/lib/event-ledger.cjs`
- `idearium/lib/guardian-stream.cjs`
- `idearium/lib/idea-workbench.js`
- `idearium/lib/projects.cjs`
- `idearium/lib/spec-container.cjs`
- `idearium/lib/spec-library-import.js`
- `idearium/lib/surface-state.cjs`
- `idearium/lib/void.js`
- `idearium/lib/workshop.js`

</details>

<details>
<summary>`idearium/output/` · 1 file</summary>

- `idearium/output/.gitkeep`

</details>

<details>
<summary>`idearium/repo/` · 31 files</summary>

- `idearium/repo/architecture.js`
- `idearium/repo/build-plan.js`
- `idearium/repo/code-api.js`
- `idearium/repo/deviation.js`
- `idearium/repo/file-state.js`
- `idearium/repo/graph.js`
- `idearium/repo/import-baseline.js`
- `idearium/repo/import-pipeline-worker.js`
- `idearium/repo/import-pipeline.js`
- `idearium/repo/index.js`
- `idearium/repo/living-spec.js`
- `idearium/repo/nexus-self.js`
- `idearium/repo/phase-mapping.js`
- `idearium/repo/phases.js`
- `idearium/repo/pipeline-events.js`
- `idearium/repo/proof-run.js`
- `idearium/repo/repo-node.js`
- `idearium/repo/roadmap.js`
- `idearium/repo/run-reconcile.js`
- `idearium/repo/runtime-proof.js`
- `idearium/repo/scan.js`
- `idearium/repo/snapshot-files.js`
- `idearium/repo/snapshot-restore.js`
- `idearium/repo/snapshot.js`
- `idearium/repo/source-files.js`
- `idearium/repo/spec-graph.js`
- `idearium/repo/spec-plan.js`
- `idearium/repo/thread.js`
- `idearium/repo/verify-lazy.js`
- `idearium/repo/watcher.js`
- `idearium/repo/work-surface.js`

</details>

<details>
<summary>`idearium/schemas/` · 11 files</summary>

- `idearium/schemas/index.js`
- `idearium/schemas/interaction-contract.json`
- `idearium/schemas/schema.capability`
- `idearium/schemas/schema.command`
- `idearium/schemas/schema.component`
- `idearium/schemas/schema.hook`
- `idearium/schemas/schema.idea`
- `idearium/schemas/schema.node`
- `idearium/schemas/schema.phase_node`
- `idearium/schemas/schema.system`
- `idearium/schemas/schema.wire`

</details>

<details>
<summary>`idearium/spec-engine/` · 7 files</summary>

- `idearium/spec-engine/blocks.yaml` — Block-ID Schema
- `idearium/spec-engine/chunk-dispatch.js`
- `idearium/spec-engine/compiler-t0.js` — // idearium/spec-engine/compiler-t0.js — spec-compiler's T0: Structure Emission // UUID:…
- `idearium/spec-engine/guardian-extract.js` — chunk prose -> compiler-bridge input §THE GAP THIS CLOSES — compiler-bridge.js's sectionsToYAMLSpec() can only
- `idearium/spec-engine/index.js` — Spec Compiler Engine Phase: 40 — Component Descriptor + Spec Chunk System
- `idearium/spec-engine/templates.js`
- `idearium/spec-engine/warp-build-dispatch.js`

</details>

<details>
<summary>`idearium/spec-engine/manifest/` · 8 files</summary>

- `idearium/spec-engine/manifest/cli.js` — // idearium/spec-engine/manifest/cli.js // UUID: nexus-idearium-manifest-cli-v1-0000-2026-0925-jamesbrooks-001
- `idearium/spec-engine/manifest/commands.js` — // idearium/spec-engine/manifest/commands.js // UUID:…
- `idearium/spec-engine/manifest/file-list.js` — // idearium/spec-engine/manifest/file-list.js // UUID:…
- `idearium/spec-engine/manifest/graph.js` — order(nodes) — nodes: [{ id, depends: [id] }] (all ids resolved). Kahn's algorithm, ties sorted for a…
- `idearium/spec-engine/manifest/index.js` — // idearium/spec-engine/manifest/index.js // UUID:…
- `idearium/spec-engine/manifest/parse-catalog.js` — // idearium/spec-engine/manifest/parse-catalog.js // UUID:…
- `idearium/spec-engine/manifest/registry.js` — Component registry: id → where it lives and what it needs. Generated, never hand-edited.
- `idearium/spec-engine/manifest/wire-check.js` — // idearium/spec-engine/manifest/wire-check.js // UUID:…

</details>

<details>
<summary>`idearium/spec-engine/templates/` · 25 files</summary>

- `idearium/spec-engine/templates/ai-agent-system.spec`
- `idearium/spec-engine/templates/api-service.spec`
- `idearium/spec-engine/templates/architecture-spec.template.yaml`
- `idearium/spec-engine/templates/architecture.spec`
- `idearium/spec-engine/templates/atlas-template.md`
- `idearium/spec-engine/templates/axioms.spec`
- `idearium/spec-engine/templates/checklists.spec`
- `idearium/spec-engine/templates/compartments.spec`
- `idearium/spec-engine/templates/eravos-canvas.spec`
- `idearium/spec-engine/templates/eravos-tool.spec`
- `idearium/spec-engine/templates/event-system.spec`
- `idearium/spec-engine/templates/genesis.spec`
- `idearium/spec-engine/templates/minimal-kernel.spec`
- `idearium/spec-engine/templates/plugin-runtime.md`
- `idearium/spec-engine/templates/schemas.spec`
- `idearium/spec-engine/templates/system/schemas/schema.bundle`
- `idearium/spec-engine/templates/system/schemas/schema.capability`
- `idearium/spec-engine/templates/system/schemas/schema.command`
- `idearium/spec-engine/templates/system/schemas/schema.component`
- `idearium/spec-engine/templates/system/schemas/schema.event`
- `idearium/spec-engine/templates/system/schemas/schema.handoff`
- `idearium/spec-engine/templates/system/schemas/schema.hook`
- `idearium/spec-engine/templates/system/schemas/schema.module`
- `idearium/spec-engine/templates/system/schemas/schema.route`
- `idearium/spec-engine/templates/system/schemas/schema.wire`

</details>

<details>
<summary>`idearium/spec/` · 8 files</summary>

- `idearium/spec/idea-to-spec.spec` — Idea to spec — made in the spec workshop (idearium)
- `idearium/spec/idearium.node-taxonomy.md` — Node type → system map — Idearium
- `idearium/spec/idearium.repo-graph.spec` — ── ADDENDUM 2026-09-27 (0.39.273) ───────────────────────────────────────────────────────────────────────
- `idearium/spec/idearium.repo-roadmap.spec` — ── ADDENDUM 2026-09-28 (0.39.275) — cross-spec dependencies (idearium/repo/roadmap.js buildRoadmap) ──
- `idearium/spec/idearium.repo-snapshot.spec` — # ADDENDUM 2026-10-07 — 0.40.0 VR1: every change is a snapshot
- `idearium/spec/idearium.spec` — ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──
- `idearium/spec/nexus-repository-system.spec` — # ADDENDUM 2026-10-15 — 0.60.64 PT2: phases by nested repo
- `idearium/spec/void.spec` — The Void — made in the spec workshop (idearium)

</details>

<details>
<summary>`idearium/test/` · 7 files</summary>

- `idearium/test/compartment-ui.smoke.cjs` — // idearium/test/compartment-ui.smoke.cjs — the idea lanes (brainstorm · problem // solving · expand ·…
- `idearium/test/e2e-pipeline.test.js` — full pipeline, every real stage §BRUTAL 2026-07-14 — "i just want the idearium pipeline to work, end to
- `idearium/test/idea-workbench.test.js` — // idearium/test/idea-workbench.test.js — pure model of the Compartment (lib/idea-workbench.js)
- `idearium/test/run-e2e-pipeline-isolated.cjs` — idearium/test/run-e2e-pipeline-isolated.js — real isolation wrapper for e2e-pipeline.test.js.
- `idearium/test/scan-unindexed.smoke.cjs`
- `idearium/test/test-mco-a-phase-node-schema.js` — MCO-A gate proof, half 2. idearium-repository-overhaul-phasemap.spec's own gate: "MET when both
- `idearium/test/ui-restructure.smoke.cjs`

</details>

<details>
<summary>`idearium/ui/` · 9 files</summary>

- `idearium/ui/archive-import.html`
- `idearium/ui/desktop.html`
- `idearium/ui/index.html`
- `idearium/ui/login.html`
- `idearium/ui/settings.html`
- `idearium/ui/spec-library.html`
- `idearium/ui/ui-editor.html`
- `idearium/ui/void.html`
- `idearium/ui/workshop.html`

</details>

<details>
<summary>`idearium/ui/css/` · 16 files</summary>

- `idearium/ui/css/agent-blocks.css`
- `idearium/ui/css/agent-options.css`
- `idearium/ui/css/arch-canvas.css`
- `idearium/ui/css/code-surface.css`
- `idearium/ui/css/code-tab-flight.css`
- `idearium/ui/css/debug-failures.css`
- `idearium/ui/css/desktop-setup.css`
- `idearium/ui/css/file-manage.css`
- `idearium/ui/css/nexus-theme.css`
- `idearium/ui/css/ollama-check.css`
- `idearium/ui/css/phase-graph-view.css`
- `idearium/ui/css/phases.css`
- `idearium/ui/css/repo-tasks.css`
- `idearium/ui/css/void-theme.css`
- `idearium/ui/css/work-surface.css`
- `idearium/ui/css/workshop.css`

</details>

<details>
<summary>`idearium/ui/fonts/` · 8 files</summary>

- `idearium/ui/fonts/LICENSE-bebas-neue.txt`
- `idearium/ui/fonts/LICENSE-dm-mono.txt`
- `idearium/ui/fonts/LICENSE-space-grotesk.txt`
- `idearium/ui/fonts/bebas-neue-400.woff2`
- `idearium/ui/fonts/dm-mono-400.woff2`
- `idearium/ui/fonts/dm-mono-500.woff2`
- `idearium/ui/fonts/space-grotesk-400.woff2`
- `idearium/ui/fonts/space-grotesk-600.woff2`

</details>

<details>
<summary>`idearium/ui/js/` · 38 files</summary>

- `idearium/ui/js/access-guard.js`
- `idearium/ui/js/agent-blocks.js`
- `idearium/ui/js/agent-options.js`
- `idearium/ui/js/app.js`
- `idearium/ui/js/arch-canvas.js`
- `idearium/ui/js/code-dock.js`
- `idearium/ui/js/code-surface.js`
- `idearium/ui/js/code-tab-flight.js`
- `idearium/ui/js/code-tab-panels.js`
- `idearium/ui/js/compartment.js`
- `idearium/ui/js/components-panel.js`
- `idearium/ui/js/debug-failures.js`
- `idearium/ui/js/desktop-setup.js`
- `idearium/ui/js/file-manage.js`
- `idearium/ui/js/file-versions.js`
- `idearium/ui/js/living-spec.js`
- `idearium/ui/js/nexus-atlas.js`
- `idearium/ui/js/ollama-check.js`
- `idearium/ui/js/phase-graph-view.js`
- `idearium/ui/js/phases.js`
- `idearium/ui/js/plan-panel.js`
- `idearium/ui/js/projects.js`
- `idearium/ui/js/repo-card-time.js`
- `idearium/ui/js/repo-drawer-views.js`
- `idearium/ui/js/repo-environment.js`
- `idearium/ui/js/repo-notes.js`
- `idearium/ui/js/repo-releases.js`
- `idearium/ui/js/repo-settings.js`
- `idearium/ui/js/repo-tasks.js`
- `idearium/ui/js/repo-versions.js`
- `idearium/ui/js/template-picker.js`
- `idearium/ui/js/theme.js`
- `idearium/ui/js/ui-editor-doc.js`
- `idearium/ui/js/ui-editor.js`
- `idearium/ui/js/void-sky.js`
- `idearium/ui/js/window-chrome.js`
- `idearium/ui/js/work-surface.js`
- `idearium/ui/js/workshop.js`

</details>

<details>
<summary>`idearium/ui/vendor/` · 4 files</summary>

- `idearium/ui/vendor/grapesjs/LICENSE`
- `idearium/ui/vendor/grapesjs/VERSION`
- `idearium/ui/vendor/grapesjs/grapes.min.css`
- `idearium/ui/vendor/grapesjs/grapes.min.js` — ! grapesjs - 0.23.8

</details>

111 release notes name a file of idearium: 0.60.156., 0.60.153., 0.60.151., 0.60.150., 0.60.148., 0.60.145., 0.60.143., 0.60.141., 0.60.140., 0.60.134., 0.60.132., 0.60.131., 0.60.130., 0.60.128., 0.60.127., 0.60.124., 0.60.123., 0.60.122., 0.60.121., 0.60.118., 0.60.107., 0.60.105., 0.60.103., 0.60.102., 0.60.99., 0.60.94., 0.60.80., 0.60.79., 0.60.74., 0.60.73., 0.60.67., 0.60.65., 0.60.63., 0.60.29., 0.60.19., 0.60.12., 0.60.11., 0.60.10., 0.60.6., 0.60.5., and 71 older. Each is in the version history below, in his words.

<!-- generated:readme:system:idearium:end -->

### architect

The design surface for hooks and blueprints. `architect/service.js` on :3747 boots in a fixed order (JAA, then the hook registry, then blueprints, SNR and translation, then HTTP, then registration with the orchestrator), and serves the hook registry: named, typed, wireable contracts between systems. A blueprint is a path scanned into a map of gaps and components. `architect/compile-route.js` bridges the block canvas to the spec compiler, turning canvas JSON into a compiled spec and, on request, into an Idearium spec. The canvases themselves are `architect/src/ui/arch-builder.html`, `architect/src/ui/spec-builder.html` and `architect/src/ui/alk-lattice.html`.

Its node schemas live in `architect/schemas/`, and its spec `architect/spec/architect.spec` records a three-way version drift honestly instead of hiding it. The next zoom level is `architect-atlas.md`.

<!-- generated:readme:system:architect:start -->
#### architect: every module and every file

Architect is 24 files in 6 modules, entry `architect/service.js`, port 3747, spec `architect/spec/architect.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/architect-atlas.md`.

<details>
<summary>`architect/` · 6 files</summary>

- `architect/compile-route.js` — /api/compile route handler Bridges the Architect canvas → spec-compiler pipeline.
- `architect/config.js` — real, distinct config, not inline constants scattered across architect/service.js. Matches the pattern
- `architect/interaction-contract.json`
- `architect/package.json`
- `architect/registry-components.js` — architect/registry-components.js
- `architect/service.js` — The Architect HTTP Service Port: 3747

</details>

<details>
<summary>`architect/docs/` · 1 file</summary>

- `architect/docs/ARCHITECT-SPEC-v1.1.0.md` — THE ARCHITECT

</details>

<details>
<summary>`architect/output/` · 1 file</summary>

- `architect/output/.gitkeep`

</details>

<details>
<summary>`architect/schemas/` · 8 files</summary>

- `architect/schemas/index.js` — // architect/schemas/index.js — architect's own, fully sovereign schema registry. //
- `architect/schemas/schema.capability`
- `architect/schemas/schema.command`
- `architect/schemas/schema.component`
- `architect/schemas/schema.hook`
- `architect/schemas/schema.node`
- `architect/schemas/schema.system`
- `architect/schemas/schema.wire`

</details>

<details>
<summary>`architect/spec/` · 2 files</summary>

- `architect/spec/architect.node-taxonomy.md` — Node type → system map — Architect
- `architect/spec/architect.spec`

</details>

<details>
<summary>`architect/src/` · 6 files</summary>

- `architect/src/spec/Blueprint.js` — architect/src/spec/Blueprint.js L1 — Spec Engine
- `architect/src/ui/alk-lattice.html`
- `architect/src/ui/arch-builder.html`
- `architect/src/ui/architect_universe.svg`
- `architect/src/ui/layered-snr-gates-axioms.svg`
- `architect/src/ui/spec-builder.html`

</details>

3 release notes name a file of architect: 0.60.131., 0.60.0., 0.39.299.. Each is in the version history below, in his words.

<!-- generated:readme:system:architect:end -->

### diagnostic

The system that watches the others. `diagnostic/nexus-diagnostic.js` on :7825 reads every system's ledger on a timer, computes sigma, friction and drift, detects gaps (baseline deviations, missing heartbeats, stuck queues), and serves them live. `diagnostic/lib/heal-loop.js` is the closed loop from a detected gap to a resolved one, and `diagnostic/lib/wire-integrity.js` classifies loom's dangling hooks so the boot log reports real gaps instead of hundreds of unwired root files. Since 0.60.136 (his call: diagnostic and the healer are one system) the healer lives inside it, in `diagnostic/healer/`, and its spec is `diagnostic/spec/diagnostic.spec`. Since FMR0 (built on his line as 0.60.146, on main as 0.60.150) it also answers what caused what: `diagnostic/lib/causality.js` reads the ledgers for rows that name their cause, and the failure-mode report (`docs/2026-10-17-failure-mode-report-phasemap.spec`) turns every failure into a record Nexus can replay in a COS test environment. The next zoom level is `diagnostic-atlas.md`.

<!-- generated:readme:system:diagnostic:start -->
#### diagnostic: every module and every file

Diagnostic is 33 files in 7 modules, entry `diagnostic/nexus-diagnostic.js`, port 7825, spec `diagnostic/spec/diagnostic.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/diagnostic-atlas.md`.

<details>
<summary>`diagnostic/` · 9 files</summary>

- `diagnostic/cli.js`
- `diagnostic/compartment.json`
- `diagnostic/config.js`
- `diagnostic/diagnostic.config.json`
- `diagnostic/event-taxonomy.js`
- `diagnostic/interaction-contract.json`
- `diagnostic/nexus-diagnostic.js`
- `diagnostic/registry-components.js`
- `diagnostic/server.js`

</details>

<details>
<summary>`diagnostic/contracts/` · 1 file</summary>

- `diagnostic/contracts/handshake.js` — verify(theirs, { id, version, needs: [resource paths], hash }) -> { ok, problems }

</details>

<details>
<summary>`diagnostic/healer/` · 2 files</summary>

- `diagnostic/healer/api/index.js` — the healer, part of diagnostic since 0.60.136 (was nexus-healer/api/index.js, generated by…
- `diagnostic/healer/cli/index.js` — the healer's CLI, part of diagnostic since 0.60.136 (was nexus-healer/cli/index.js, generated by…

</details>

<details>
<summary>`diagnostic/lib/` · 5 files</summary>

- `diagnostic/lib/causality.js`
- `diagnostic/lib/diagnostic-contract.js` — // ── lib/diagnostic-contract.js — Diagnostic Contract Lifecycle ────────────── // Phase 23.13 — "needs to…
- `diagnostic/lib/heal-loop.js` — nexus-heal-loop.js — Self-Healing Gap Closure Pipeline Status: pre-release
- `diagnostic/lib/pulse-watch.js` — lib/pulse-watch.js — the systems as they announce themselves, and the negative space of a missed heartbeat.…
- `diagnostic/lib/wire-integrity.js` — diagnostic/wire-integrity.js — which loom hooks are dangling, and which of those are worth a gap. Pure:…

</details>

<details>
<summary>`diagnostic/schemas/` · 9 files</summary>

- `diagnostic/schemas/index.js`
- `diagnostic/schemas/schema.capability`
- `diagnostic/schemas/schema.command`
- `diagnostic/schemas/schema.component`
- `diagnostic/schemas/schema.healer_proposal`
- `diagnostic/schemas/schema.hook`
- `diagnostic/schemas/schema.node`
- `diagnostic/schemas/schema.system`
- `diagnostic/schemas/schema.wire`

</details>

<details>
<summary>`diagnostic/spec/` · 4 files</summary>

- `diagnostic/spec/diagnostic.node-taxonomy.md` — Node type → system map — Diagnostic
- `diagnostic/spec/diagnostic.spec` — # ADDENDUM 2026-10-05 — 0.39.342, the diagnostic listens to the pulse; no polling (announce-pulse-repair…
- `diagnostic/spec/healer.node-taxonomy.md` — Node type → system map — Nexus-Healer
- `diagnostic/spec/healer.spec.md` — nexus-healer

</details>

<details>
<summary>`diagnostic/tests/` · 3 files</summary>

- `diagnostic/tests/causality.test.js` — // diagnostic/tests/causality.test.js — FMR0 (docs/2026-10-17-failure-mode-report-phasemap.spec), 0.60.146.…
- `diagnostic/tests/shape.test.js` — // diagnostic/tests/shape.test.js — diagnostic is a genesis system and alive in its parts (0.60.138). //…
- `diagnostic/tests/test-pulse-watch.test.js` — tests/modules/test-pulse-watch.test.js — PR1, PR3 (docs/2026-10-05-announce-pulse-repair-phasemap.spec),…

</details>

8 release notes name a file of diagnostic: 0.60.150., 0.60.138., 0.60.136., 0.60.131., 0.39.342., 0.39.327., 0.39.260., 0.39.173.. Each is in the version history below, in his words.

<!-- generated:readme:system:diagnostic:end -->

### intelligence

The cognition layer, consolidated from three places that had no single home. `intelligence/server.js` on :3753 serves it, and `intelligence/index.js` gathers it. CFR, the causal friction record with its field, graph, delta, sigma and ledger, is `intelligence/cfr/`; RFR2, the relational field kernel, is `intelligence/rfr2/`; the causal layer is `intelligence/causal/`; the mastermind that combines them is `intelligence/mastermind.js`; and the baseline every deviation is measured against is `intelligence/baseline.js`. Its spec, `intelligence/spec/intelligence.spec`, was written as the map-first step before any file moved. The next zoom level is `intelligence-atlas.md`.

<!-- generated:readme:system:intelligence:start -->
#### intelligence: every module and every file

Intelligence is 128 files in 37 modules, entry `intelligence/server.js`, port 3753, spec `intelligence/spec/intelligence.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/intelligence-atlas.md`.

<details>
<summary>`intelligence/` · 18 files</summary>

- `intelligence/adversarial.js`
- `intelligence/baseline.js`
- `intelligence/compartment.json`
- `intelligence/config.js`
- `intelligence/consumer.js`
- `intelligence/event-taxonomy.js`
- `intelligence/field-provider.js`
- `intelligence/framework-builder.js`
- `intelligence/index.js`
- `intelligence/interaction-contract.json`
- `intelligence/intuition.js`
- `intelligence/mastermind.js`
- `intelligence/registry-components.js`
- `intelligence/relational-field.js`
- `intelligence/routes.js`
- `intelligence/schemas.js`
- `intelligence/server.js`
- `intelligence/snapshot-trigger.js`

</details>

<details>
<summary>`intelligence/alk-perception/` · 1 file</summary>

- `intelligence/alk-perception/index.js` — lib/meta/alk-perception/index.js — ALK Perception Layer (CJS wrapper) Associative Lattice Kernel —…

</details>

<details>
<summary>`intelligence/alk/` · 1 file</summary>

- `intelligence/alk/index.js` — lib/alk/index.js — Associative Lattice Kernel Status: pre-release

</details>

<details>
<summary>`intelligence/bda/` · 6 files</summary>

- `intelligence/bda/gaps.js` — BDA Gap Detector Detects named gap types in text using Liminal pattern engine.
- `intelligence/bda/index.js` — lib/meta/bda/index.js — Behavioral Drift Analyzer (BDA) Ported from BDA standalone system. Composes:
- `intelligence/bda/kernel.js` — BDA Kernel Behavioral Drift Analyzer — core runtime.
- `intelligence/bda/ledger.js` — BDA Ledger Append-only causal chain. SHA-256 hash-linked entries.
- `intelligence/bda/pendulum.js` — BDA Pendulum Engine Computes behavioral drift metrics from a time-series of signal means.
- `intelligence/bda/signals.js` — BDA Signal Extractor Converts raw text into 5 normalized signals [0,1].

</details>

<details>
<summary>`intelligence/causal/` · 3 files</summary>

- `intelligence/causal/anomaly.js` — lib/causal/anomaly.js — Phase 71.3: Anomaly Engine Consumes mismatch signals from the Expectation Engine…
- `intelligence/causal/compound.js`
- `intelligence/causal/index.js` — meta/causal/index.js — Causal engines

</details>

<details>
<summary>`intelligence/cfr/` · 7 files</summary>

- `intelligence/cfr/contract-verifier.js` — lib/cfr/contract-verifier.js — Runtime interaction contract verifier This is the gap between spec and…
- `intelligence/cfr/delta.js` — lib/cfr/delta.js — Delta (transition physics) engine Delta measures the *transition* between two consecutive…
- `intelligence/cfr/field.js` — lib/cfr/field.js — CFR Field state machine The CFR field is a continuous physics model of system health.
- `intelligence/cfr/graph.js` — lib/cfr/graph.js — Causal graph builder Every ledger entry is also a node in the causal graph.
- `intelligence/cfr/index.js` — lib/cfr/index.js — CFR-Ω module exports Single entry point for all CFR-Ω subsystems.
- `intelligence/cfr/ledger.js` — lib/cfr/ledger.js — CFR-Ω Ledger v1.0.0 THE TRUTH SUBSTRATE.
- `intelligence/cfr/sigma.js` — lib/cfr/sigma.js — Sigma (divergence) scorer Sigma measures how far a given event deviates from the…

</details>

<details>
<summary>`intelligence/commands/` · 22 files</summary>

- `intelligence/commands/get-api-commands-history.command`
- `intelligence/commands/get-api-commands.command`
- `intelligence/commands/get-api-intelligence-context.command`
- `intelligence/commands/get-api-intelligence-failures.command`
- `intelligence/commands/get-api-intelligence-map.command`
- `intelligence/commands/get-api-intelligence-patterns.command`
- `intelligence/commands/get-api-intelligence-reuse.command`
- `intelligence/commands/get-api-intelligence-status.command`
- `intelligence/commands/get-api-intelligence-synthesis-fill.command`
- `intelligence/commands/get-api-intelligence-synthesis-history.command`
- `intelligence/commands/get-api-intelligence-synthesis-themes.command`
- `intelligence/commands/get-api-intelligence-synthesis.command`
- `intelligence/commands/get-cfr-events.command`
- `intelligence/commands/get-cfr-field.command`
- `intelligence/commands/get-cfr-health.command`
- `intelligence/commands/get-cfr-sse.command`
- `intelligence/commands/get-health.command`
- `intelligence/commands/get-sse.command`
- `intelligence/commands/post-api-adversarial.command`
- `intelligence/commands/post-api-framework-create.command`
- `intelligence/commands/post-api-intelligence-synthesis-ingest.command`
- `intelligence/commands/post-api-intelligence-synthesis-run.command`

</details>

<details>
<summary>`intelligence/gap/` · 4 files</summary>

- `intelligence/gap/hunter.js` — guardian/lib/gap-hunter.js — GapHunter v3 Ported from userscript v8.3. Runs server-side so gap analysis
- `intelligence/gap/index.js` — meta/gap/index.js — Gap detection, predicate, and ledger
- `intelligence/gap/ledger.js` — // ── lib/gap-ledger.js ───────────────────────────────────────────────────────── // UUID:…
- `intelligence/gap/predicate.js` — lib/gap-predicate.js — Gap Predicate Library + Closure Verifier Phase: 23.7 — gap-lifecycle.spec

</details>

<details>
<summary>`intelligence/lattice/` · 3 files</summary>

- `intelligence/lattice/associative-lattice.js`
- `intelligence/lattice/fanin-listener.js`
- `intelligence/lattice/node-lattice.js`

</details>

<details>
<summary>`intelligence/lib/` · 1 file</summary>

- `intelligence/lib/domain-nodes.js` — // intelligence/lib/domain-nodes.js — real node files for intelligence's // own domain data, following…

</details>

<details>
<summary>`intelligence/liminal-space/` · 1 file</summary>

- `intelligence/liminal-space/index.js`

</details>

<details>
<summary>`intelligence/liminal/` · 1 file</summary>

- `intelligence/liminal/index.js` — lib/meta/liminal/index.js — Liminal Gap Detection System (CJS, all 12 modules) 12 domain-agnostic gap…

</details>

<details>
<summary>`intelligence/output/` · 1 file</summary>

- `intelligence/output/.gitkeep`

</details>

<details>
<summary>`intelligence/rfr2/` · 1 file</summary>

- `intelligence/rfr2/index.js` — meta/rfr2/index.js — RFR2 Causal Toolkit entry point

</details>

<details>
<summary>`intelligence/rfr2/adapter-sandbox/` · 1 file</summary>

- `intelligence/rfr2/adapter-sandbox/index.js` — @module adapter-sandbox @uuid b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e

</details>

<details>
<summary>`intelligence/rfr2/adapter/` · 1 file</summary>

- `intelligence/rfr2/adapter/index.js` — @module adapter @uuid dc2cfbff-daf6-42f5-9a56-8039854403aa

</details>

<details>
<summary>`intelligence/rfr2/causality/` · 1 file</summary>

- `intelligence/rfr2/causality/index.js` — @module causality @uuid 32a3f387-655c-4531-87a5-1b98641a8895

</details>

<details>
<summary>`intelligence/rfr2/clip/` · 1 file</summary>

- `intelligence/rfr2/clip/index.js` — @module clip @uuid d2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a

</details>

<details>
<summary>`intelligence/rfr2/compress/` · 1 file</summary>

- `intelligence/rfr2/compress/index.js` — @module compress @uuid f50d7ace-fe96-4aae-995e-4534a9ad7163

</details>

<details>
<summary>`intelligence/rfr2/context/` · 1 file</summary>

- `intelligence/rfr2/context/index.js`

</details>

<details>
<summary>`intelligence/rfr2/delta/` · 1 file</summary>

- `intelligence/rfr2/delta/index.js`

</details>

<details>
<summary>`intelligence/rfr2/enforcement/` · 1 file</summary>

- `intelligence/rfr2/enforcement/index.js`

</details>

<details>
<summary>`intelligence/rfr2/forge/` · 1 file</summary>

- `intelligence/rfr2/forge/index.js`

</details>

<details>
<summary>`intelligence/rfr2/identity/` · 1 file</summary>

- `intelligence/rfr2/identity/index.js` — @module identity @uuid fabbc95c-5da4-44f0-ba14-acd13fb1e3a7

</details>

<details>
<summary>`intelligence/rfr2/kernel/` · 1 file</summary>

- `intelligence/rfr2/kernel/index.js` — @module kernel @uuid 5d90c63d-c55f-43e8-bc2e-169b960fddd9

</details>

<details>
<summary>`intelligence/rfr2/lazy/` · 1 file</summary>

- `intelligence/rfr2/lazy/index.js` — meta/rfr2/lazy/index.js — Lazy evaluation utilities stub This module was referenced by rfr2/delta/index.js…

</details>

<details>
<summary>`intelligence/rfr2/observer/` · 1 file</summary>

- `intelligence/rfr2/observer/index.js` — @module observer @uuid f7a8b9c0-d1e2-4f3a-4b5c-6d7e8f9a0b1c

</details>

<details>
<summary>`intelligence/rfr2/query/` · 1 file</summary>

- `intelligence/rfr2/query/index.js` — @module query @uuid e3bca332-8937-441f-a2a0-9babae81afb6

</details>

<details>
<summary>`intelligence/rfr2/sigma/` · 1 file</summary>

- `intelligence/rfr2/sigma/index.js`

</details>

<details>
<summary>`intelligence/rfr2/time/` · 1 file</summary>

- `intelligence/rfr2/time/index.js` — @module time @uuid ce9aac88-c293-4951-a2ea-0f565538c1da

</details>

<details>
<summary>`intelligence/rfr2/version-gate/` · 1 file</summary>

- `intelligence/rfr2/version-gate/index.js`

</details>

<details>
<summary>`intelligence/schemas/` · 18 files</summary>

- `intelligence/schemas/index.js`
- `intelligence/schemas/schema.account_identity_index_entry`
- `intelligence/schemas/schema.bep_pattern`
- `intelligence/schemas/schema.capability`
- `intelligence/schemas/schema.event`
- `intelligence/schemas/schema.fault`
- `intelligence/schemas/schema.fault_taxonomy`
- `intelligence/schemas/schema.gap`
- `intelligence/schemas/schema.interstitial_space`
- `intelligence/schemas/schema.nexus_wake_event`
- `intelligence/schemas/schema.pat`
- `intelligence/schemas/schema.pattern_sequence`
- `intelligence/schemas/schema.relationship_edge`
- `intelligence/schemas/schema.resonance_crystal`
- `intelligence/schemas/schema.reuse_index_entry`
- `intelligence/schemas/schema.sigma_record`
- `intelligence/schemas/schema.system`
- `intelligence/schemas/schema.vector`

</details>

<details>
<summary>`intelligence/spatial/` · 4 files</summary>

- `intelligence/spatial/index.js` — lib/meta/spatial/index.js — Spatial meta-layer modules sigma — entropy/slope/trajectory regime classification
- `intelligence/spatial/lattice.js` — lib/meta/spatial/lattice.js — Associative Lattice (CJS) Ported from @spatial/lattice v1.0.0
- `intelligence/spatial/sigma.js` — lib/meta/spatial/sigma.js — Spatial Sigma Engine (CJS) Ported from @spatial/sigma v1.0.0
- `intelligence/spatial/system-lattice.js`

</details>

<details>
<summary>`intelligence/spec/` · 3 files</summary>

- `intelligence/spec/intelligence.node-taxonomy.md` — Node type → system map — Intelligence
- `intelligence/spec/intelligence.spec` — ── ADDENDUM 2026-10-17 (0.60.146) — CFR's delta offered through the contract…
- `intelligence/spec/self-awareness.spec` — Self-awareness — made in the spec workshop (idearium)

</details>

<details>
<summary>`intelligence/synthesis/` · 3 files</summary>

- `intelligence/synthesis/engine.js` — the synthesis operators: raw gaps in, a ranked set of synthesized gaps out (0.39.300 SY1). component_id:…
- `intelligence/synthesis/index.js` — GAP SYNTHESIS: Nexus's own gaps, read as one set and ranked by leverage (0.39.300 SY1). component_id:…
- `intelligence/synthesis/sources.js` — where Nexus's own gaps are written down, read as one set (0.39.300 SY1). component_id:…

</details>

<details>
<summary>`intelligence/telemetry-codec/` · 8 files</summary>

- `intelligence/telemetry-codec/adapter.js`
- `intelligence/telemetry-codec/bus.js` — @module bus @uuid b0530000-0000-4000-9000-000000000001
- `intelligence/telemetry-codec/drift-engine.js`
- `intelligence/telemetry-codec/engines.js` — @module engines @uuid e0910000-0000-4000-9000-000000000001
- `intelligence/telemetry-codec/index.js` — lib/meta/telemetry-codec/index.js — Telemetry Codec CJS wrapper Ports Telemetry Codec engines for use inside…
- `intelligence/telemetry-codec/latent-model.js` — @module latent-model @uuid la7e0000-0000-4000-9000-000000000001
- `intelligence/telemetry-codec/runtime.js`
- `intelligence/telemetry-codec/topology.js`

</details>

<details>
<summary>`intelligence/topo-kernel/` · 5 files</summary>

- `intelligence/topo-kernel/bus.js` — TOPO-KERNEL — BUS Sovereign SISO event bus. Nothing else lives here.
- `intelligence/topo-kernel/field.schema.json`
- `intelligence/topo-kernel/index.js` — TOPO-KERNEL — Public API Sovereign entry point. Mount what you need. Nothing is assumed.
- `intelligence/topo-kernel/signal.schema.json`
- `intelligence/topo-kernel/snr.js` — TOPO-KERNEL — SNR Signal/Noise Root. The law of the system.

</details>

15 release notes name a file of intelligence: 0.60.157., 0.60.150., 0.60.148., 0.60.133., 0.60.131., 0.60.127., 0.39.330., 0.39.321., 0.39.300., 0.39.252., 0.39.236., 0.39.182., 0.39.181., 0.39.173., 0.39.172.. Each is in the version history below, in his words.

<!-- generated:readme:system:intelligence:end -->

### ollama-bridge

Local model dispatch, deliberately isolated from guardian: if guardian goes down, local models keep answering, and a slow model never blocks guardian. `ollama/server.js` on :3749 is a sovereign HTTP wrapper around Ollama; `ollama/lib/ollama-client.js` talks to the Ollama daemon, `ollama/lib/dispatch.js` runs requests, and `ollama/ollama-runtime.js` manages the runtime. RAID routes to it by name. Its folder is `ollama/` while its system name is `ollama-bridge`, a mismatch its spec (`ollama/spec/ollama.spec`) records after it once made a spec-coverage check report the spec missing. The next zoom level is `ollama-atlas.md`.

<!-- generated:readme:system:ollama-bridge:start -->
#### ollama-bridge: every module and every file

Ollama-bridge is 56 files in 7 modules, entry `ollama/server.js`, port 3749. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/ollama-atlas.md`.

<details>
<summary>`ollama/` · 7 files</summary>

- `ollama/abliterated-catalog.js`
- `ollama/compartment.json`
- `ollama/config.js` — real, distinct config, not inline constants scattered across ollama/server.js and every other file that…
- `ollama/interaction-contract.json`
- `ollama/ollama-runtime.js` — // §CONFIG 2026-08-23 — real, shared model config, not this file's own // separate hardcode.…
- `ollama/registry-components.js` — ollama/registry-components.js
- `ollama/server.js` — Sovereign Ollama Bridge Port: 3749

</details>

<details>
<summary>`ollama/commands/` · 19 files</summary>

- `ollama/commands/delete-api-jobs-id.command`
- `ollama/commands/get-api-jobs-id.command`
- `ollama/commands/get-api-jobs.command`
- `ollama/commands/get-api-models.command`
- `ollama/commands/get-api-queue.command`
- `ollama/commands/get-api-stream-id.command`
- `ollama/commands/get-api-streams.command`
- `ollama/commands/get-api-tape-run.command`
- `ollama/commands/get-api-tape.command`
- `ollama/commands/get-api-upload-id.command`
- `ollama/commands/get-contract.command`
- `ollama/commands/get-events.command`
- `ollama/commands/get-health.command`
- `ollama/commands/post-api-jobs-tools.command`
- `ollama/commands/post-api-jobs.command`
- `ollama/commands/post-api-stream-id.command`
- `ollama/commands/post-api-upload.command`
- `ollama/commands/put-api-model.command`
- `ollama/commands/put-api-stream-id-context.command`

</details>

<details>
<summary>`ollama/lib/` · 8 files</summary>

- `ollama/lib/command-index.js` — phase 2 of docs/command-index-per-system.spec. §MECHANISM, exactly as specced — each real route module already
- `ollama/lib/dispatch.js` — ollama/lib/dispatch.js Owns the job lifecycle: pulling from the queue, running each job through
- `ollama/lib/http-utils.js` — ollama/lib/http-utils.js Small, dependency-free helpers every route module uses.
- `ollama/lib/idle-unload.js` — 0.60.123 MP — a model nobody is using does not hold the machine's memory under pressure. James (2026-10-13):…
- `ollama/lib/model-inventory.js` — what Ollama has installed (with sizes) and what it holds in memory now. §0.39.364 James's console, 2026-10-06:
- `ollama/lib/ollama-client.js` — ollama/lib/ollama-client.js Every HTTP call this bridge makes TO the local Ollama daemon
- `ollama/lib/state.js` — ollama/lib/state.js All shared, mutable, in-process state for the Ollama bridge, in one place.
- `ollama/lib/tape.js`

</details>

<details>
<summary>`ollama/output/` · 1 file</summary>

- `ollama/output/.gitkeep`

</details>

<details>
<summary>`ollama/routes/` · 7 files</summary>

- `ollama/routes/jobs.js` — ollama/routes/jobs.js POST /api/jobs, POST /api/jobs/tools, GET /api/jobs, GET /api/jobs/:id,
- `ollama/routes/models.js` — ollama/routes/models.js GET /api/models, PUT /api/model — matches registry-components.js: models.list
- `ollama/routes/queue.js` — ollama/routes/queue.js GET /api/queue — matches registry-components.js: queue.status
- `ollama/routes/stream.js` — ollama/routes/stream.js PUT /api/stream/:id/context, GET/POST /api/stream/:id, GET /api/streams
- `ollama/routes/system.js` — ollama/routes/system.js GET /health, GET /contract, GET /events (SSE), OPTIONS *
- `ollama/routes/tape.js` — the Ollama tape (ollama/lib/tape.js). §0.45.0 CM3 GET /api/tape — every run recorded: calls, callers,…
- `ollama/routes/uploads.js` — ollama/routes/uploads.js POST /api/upload, GET /api/upload/:id

</details>

<details>
<summary>`ollama/schemas/` · 12 files</summary>

- `ollama/schemas/index.js`
- `ollama/schemas/schema.capability`
- `ollama/schemas/schema.command`
- `ollama/schemas/schema.component`
- `ollama/schemas/schema.health`
- `ollama/schemas/schema.hook`
- `ollama/schemas/schema.model`
- `ollama/schemas/schema.node`
- `ollama/schemas/schema.ollama_job`
- `ollama/schemas/schema.system`
- `ollama/schemas/schema.tool`
- `ollama/schemas/schema.wire`

</details>

<details>
<summary>`ollama/spec/` · 2 files</summary>

- `ollama/spec/ollama.node-taxonomy.md` — Node type → system map — Ollama
- `ollama/spec/ollama.spec`

</details>

12 release notes name a file of ollama-bridge: 0.60.149., 0.60.131., 0.60.123., 0.60.10., 0.46.0., 0.39.350., 0.39.289., 0.39.274., 0.39.269., 0.39.267., 0.39.190., 0.39.181.. Each is in the version history below, in his words.

<!-- generated:readme:system:ollama-bridge:end -->

### versionium

Causal version control: temporal replay, calendar playback, sigma-gated commits. `versionium/server.js` on :3754 became a sovereign system on 2026-09-02, out of a library that lived inside cortex. `versionium/lib/engine.js` is the engine, `versionium/lib/store.js` and `versionium/lib/snapshot.js` the storage, `versionium/lib/causality.js` the causal links between commits, and `versionium/lib/files.js` the per-file versions that loom's phasemap scanner reads instead of git. Its routes are `versionium/routes/versionium.js`, `versionium/routes/files.js` and `versionium/routes/system.js`, and every sync of the `nexus` repo commits there. The next zoom level is `versionium-atlas.md`.

<!-- generated:readme:system:versionium:start -->
#### versionium: every module and every file

Versionium is 32 files in 5 modules, entry `versionium/server.js`, port 3754, spec `versionium/spec/versionium.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/versionium-atlas.md`.

<details>
<summary>`versionium/` · 6 files</summary>

- `versionium/compartment.json`
- `versionium/config.js` — real, distinct config, matching ollama/config.js's and intelligence/config.js's exact established pattern:…
- `versionium/event-taxonomy.js` — // versionium/event-taxonomy.js — real event vocabulary for the sovereign // Versionium system. Conforms to…
- `versionium/interaction-contract.json`
- `versionium/registry-components.js` — versionium/registry-components.js
- `versionium/server.js`

</details>

<details>
<summary>`versionium/lib/` · 12 files</summary>

- `versionium/lib/causality.js`
- `versionium/lib/engine.js`
- `versionium/lib/files.js`
- `versionium/lib/http-utils.js`
- `versionium/lib/merge3.js`
- `versionium/lib/migrate-cortex-snapshots.js`
- `versionium/lib/migrate-idearium-snapshots.js`
- `versionium/lib/migrate-legacy-data.js`
- `versionium/lib/releases.js`
- `versionium/lib/snapshot.js`
- `versionium/lib/store.js`
- `versionium/lib/text-diff.js`

</details>

<details>
<summary>`versionium/routes/` · 3 files</summary>

- `versionium/routes/files.js` — HTTP surface of the per-file layer (MCO-B). Logic lives in lib/files.js; this only parses, bounds and maps…
- `versionium/routes/system.js` — versionium/routes/system.js GET /health, GET /contract, OPTIONS *
- `versionium/routes/versionium.js` — the real commit/history/restore/ state/calendar API, migrated wholesale from cortex/boot.js's own

</details>

<details>
<summary>`versionium/schemas/` · 8 files</summary>

- `versionium/schemas/index.js` — // versionium/schemas/index.js — versionium's own, fully sovereign schema registry. //
- `versionium/schemas/schema.capability`
- `versionium/schemas/schema.command`
- `versionium/schemas/schema.event`
- `versionium/schemas/schema.file_delta`
- `versionium/schemas/schema.file_snapshot`
- `versionium/schemas/schema.system`
- `versionium/schemas/schema.versionium_commit`

</details>

<details>
<summary>`versionium/spec/` · 3 files</summary>

- `versionium/spec/versionium.file-versioning.spec` — # ADDENDUM 2026-10-10 — 0.56.0 SD0: over the limit is a 413, not a reset…
- `versionium/spec/versionium.node-taxonomy.md` — Node type → system map — Versionium
- `versionium/spec/versionium.spec` — ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──

</details>

8 release notes name a file of versionium: 0.60.131., 0.60.117., 0.60.113., 0.60.41., 0.59.6., 0.39.252., 0.39.250., 0.39.176.. Each is in the version history below, in his words.

<!-- generated:readme:system:versionium:end -->

### copilot

Intelligence as opposed to dispatch: copilot receives intent, assembles context, routes through RAID, and answers, and if guardian is down it can still answer from memory. `copilot/server.js` on :3750 serves it. `copilot/lifeline.js` decides which backend answers a prompt, `copilot/tool-runtime.js` runs the tool loop, `copilot/lib/self-model.js` and `copilot/lib/nexus-awareness.js` are what copilot knows about NEXUS, `copilot/lib/capabilities.js` is what it can do, and `copilot/diagnostics.js`, `copilot/movement-map.js` and `copilot/optimizer.js` measure and improve the whole system. Its spec is `copilot/spec/copilot.spec`. The next zoom level is `copilot-atlas.md`.

<!-- generated:readme:system:copilot:start -->
#### copilot: every module and every file

Copilot is 64 files in 7 modules, entry `copilot/server.js`, port 3750, spec `copilot/spec/copilot.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/copilot-atlas.md`.

<details>
<summary>`copilot/` · 26 files</summary>

- `copilot/adaptive-fulfillment.js`
- `copilot/adversarial.js`
- `copilot/analysis.js`
- `copilot/assist-loop.js`
- `copilot/axiom-manager.js`
- `copilot/capability-extend.js`
- `copilot/cli.js`
- `copilot/compartment.json`
- `copilot/config.js`
- `copilot/diagnostic-sweep.js`
- `copilot/diagnostics.js`
- `copilot/event-taxonomy.js`
- `copilot/intents.js`
- `copilot/interaction-contract.json`
- `copilot/intuition.js`
- `copilot/lifeline.js`
- `copilot/module-builder.js`
- `copilot/movement-map.js`
- `copilot/optimizer.js`
- `copilot/recursive-diagnose.js`
- `copilot/registry-components.js`
- `copilot/repair-on-prompt.js`
- `copilot/server.js`
- `copilot/stream-digest.js`
- `copilot/system-status.js`
- `copilot/tool-runtime.js`

</details>

<details>
<summary>`copilot/lib/` · 18 files</summary>

- `copilot/lib/activity-recall.js`
- `copilot/lib/autonomy-router.js`
- `copilot/lib/capabilities.js`
- `copilot/lib/copilot-context.js`
- `copilot/lib/descriptor-projector.js`
- `copilot/lib/expectation-watcher.js`
- `copilot/lib/grammar-router.js`
- `copilot/lib/inject-config.js`
- `copilot/lib/intent-learning.js`
- `copilot/lib/lifeline-contracts.js`
- `copilot/lib/nexus-ask.js`
- `copilot/lib/nexus-awareness.js`
- `copilot/lib/person-model/index.js`
- `copilot/lib/person-model/lattice.js`
- `copilot/lib/reword.js`
- `copilot/lib/self-model.js`
- `copilot/lib/user-model.js`
- `copilot/lib/workset.js`

</details>

<details>
<summary>`copilot/output/` · 1 file</summary>

- `copilot/output/.gitkeep`

</details>

<details>
<summary>`copilot/routes/` · 2 files</summary>

- `copilot/routes/opportunity.js` — /api/opportunity/* and /api/context/* on copilot port 3750. 0.39.272. The HTTP door to lib/opportunity…
- `copilot/routes/person-model.js` — copilot/routes/person-model.js All /api/person-model/* routes — the co-pilot's model of the USER

</details>

<details>
<summary>`copilot/schemas/` · 14 files</summary>

- `copilot/schemas/index.js`
- `copilot/schemas/schema.capability`
- `copilot/schemas/schema.command`
- `copilot/schemas/schema.component`
- `copilot/schemas/schema.hook`
- `copilot/schemas/schema.inject_rule`
- `copilot/schemas/schema.injection`
- `copilot/schemas/schema.input`
- `copilot/schemas/schema.intent`
- `copilot/schemas/schema.node`
- `copilot/schemas/schema.output`
- `copilot/schemas/schema.system`
- `copilot/schemas/schema.tool`
- `copilot/schemas/schema.wire`

</details>

<details>
<summary>`copilot/spec/` · 2 files</summary>

- `copilot/spec/copilot.node-taxonomy.md` — Node type → system map — Copilot
- `copilot/spec/copilot.spec` — ── ADDENDUM 2026-07-09 (v3.2.0) — what changed this session ──

</details>

<details>
<summary>`copilot/ui/` · 1 file</summary>

- `copilot/ui/person-model.html`

</details>

20 release notes name a file of copilot: 0.60.131., 0.60.127., 0.60.77., 0.60.70., 0.60.62., 0.60.26., 0.59.11., 0.59.6., 0.55.0., 0.39.337., 0.39.336., 0.39.330., 0.39.271., 0.39.269., 0.39.267., 0.39.256., 0.39.253., 0.39.248., 0.39.244., 0.39.188.. Each is in the version history below, in his words.

<!-- generated:readme:system:copilot:end -->

### loom

The registry authority. `loom/server.js` on :3752 serves the registry of components, hooks and wires that every other system declares into, and `loom/schema/` defines those records (`loom/schema/component.js`, `loom/schema/hook.js`, `loom/schema/wire.js`, `loom/schema/driver.js`). `loom/bootstrap.js` rebuilds the registry from source: the scanners in `loom/scanners/` find real edges, the hand maps in `loom/maps/` add the edges a scanner cannot see, and the result is checked for wires whose endpoints do not exist. The phasemap section of loom, `loom/scanners/phasemap-map.js`, is the roadmap of every system. Its spec is `loom/spec/loom.spec`, and it is the most deeply mapped system in NEXUS. The next zoom level is `loom-atlas.md`.

<!-- generated:readme:system:loom:start -->
#### loom: every module and every file

Loom is 80 files in 14 modules, entry `loom/server.js`, port 3752, spec `loom/spec/loom.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/loom-atlas.md`.

<details>
<summary>`loom/` · 7 files</summary>

- `loom/bootstrap.js` — seeds loom/data/registry.json. v2: replaces the earlier monolithic 'nexus.warp' single-component
- `loom/compartment.json`
- `loom/config.js` — real, distinct config, not inline constants scattered across loom/server.js. Matches the pattern established…
- `loom/doc-generator.js` — R6: documentation generated from what's real, not hand-maintained prose that can drift
- `loom/interaction-contract.json`
- `loom/registry-components.js` — loom/registry-components.js Declares every LOOM capability to the orchestrator on boot.
- `loom/server.js` — Sovereign LOOM system Port: 3752

</details>

<details>
<summary>`loom/agent-suite/` · 1 file</summary>

- `loom/agent-suite/index.js`

</details>

<details>
<summary>`loom/contracts/` · 1 file</summary>

- `loom/contracts/index.js`

</details>

<details>
<summary>`loom/ingest/` · 2 files</summary>

- `loom/ingest/index.js`
- `loom/ingest/revisions.js` — disk-first store for ingested revisions. Phase: 144 (this session — drag-and-drop-equivalent ingest, backend…

</details>

<details>
<summary>`loom/lib/` · 1 file</summary>

- `loom/lib/changelog.js` — recordVersion({version, changes, releasedAt}) — real, append-only. Refuses (not throws) a duplicate version…

</details>

<details>
<summary>`loom/maps/` · 22 files</summary>

- `loom/maps/accounts-authority-map.js`
- `loom/maps/agent-memory-map.js`
- `loom/maps/build-context-map.js`
- `loom/maps/build-surface-map.js`
- `loom/maps/chat-ledger-map.js`
- `loom/maps/compartment-activity-map.js`
- `loom/maps/component-intake-map.js`
- `loom/maps/copilot-capability-map.js`
- `loom/maps/cos-testenv-map.js`
- `loom/maps/declare-map.js`
- `loom/maps/economy-map.js`
- `loom/maps/idearium-codebase-map.js`
- `loom/maps/ledger-wire-person-model-map.js`
- `loom/maps/observability-map.js`
- `loom/maps/one-idearium-map.js`
- `loom/maps/raid-events-and-tools-map.js`
- `loom/maps/releases-map.js`
- `loom/maps/run-state-map.js`
- `loom/maps/session-2026-08-14-map.js`
- `loom/maps/ui-map.js`
- `loom/maps/verified-primitives-map.js`
- `loom/maps/warp-map.js`

</details>

<details>
<summary>`loom/scanners/` · 10 files</summary>

- `loom/scanners/capability-map.js`
- `loom/scanners/closed-door.js`
- `loom/scanners/dangling-report.js`
- `loom/scanners/event-taxonomy-map.js`
- `loom/scanners/mock-data-finder.js`
- `loom/scanners/phasemap-map.js`
- `loom/scanners/source-map.js`
- `loom/scanners/spec-map.js`
- `loom/scanners/stub-finder.js`
- `loom/scanners/wiring-gaps.js`

</details>

<details>
<summary>`loom/schema/` · 12 files</summary>

- `loom/schema/axioms.js`
- `loom/schema/component.js`
- `loom/schema/concern.js`
- `loom/schema/cortex-sync.js`
- `loom/schema/definitions.js`
- `loom/schema/driver.js`
- `loom/schema/gates.js`
- `loom/schema/hook.js`
- `loom/schema/index.js`
- `loom/schema/registry.js`
- `loom/schema/seam.js`
- `loom/schema/wire.js`

</details>

<details>
<summary>`loom/schemas/` · 8 files</summary>

- `loom/schemas/index.js` — // loom/schemas/index.js — loom's own, fully sovereign schema registry. //
- `loom/schemas/schema.capability`
- `loom/schemas/schema.command`
- `loom/schemas/schema.component`
- `loom/schemas/schema.hook`
- `loom/schemas/schema.node`
- `loom/schemas/schema.system`
- `loom/schemas/schema.wire`

</details>

<details>
<summary>`loom/seed/` · 1 file</summary>

- `loom/seed/2026-07-11-session-wires.js` — loom/seed/2026-07-11-session-wires.js §NEW 2026-07-11 — every wire found broken or missing this session,

</details>

<details>
<summary>`loom/spec/` · 2 files</summary>

- `loom/spec/loom.node-taxonomy.md` — Node type → system map — Loom
- `loom/spec/loom.spec` — ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──

</details>

<details>
<summary>`loom/templates/` · 2 files</summary>

- `loom/templates/cos-compartment.js`
- `loom/templates/system-scaffold.js`

</details>

<details>
<summary>`loom/test/` · 10 files</summary>

- `loom/test/agent-suite.test.js`
- `loom/test/component-detail.test.js`
- `loom/test/contracts.test.js`
- `loom/test/doc-generator.test.js`
- `loom/test/friction-proxy.test.js`
- `loom/test/history-routes.test.js`
- `loom/test/ingest.test.js`
- `loom/test/phasemap-map.test.js`
- `loom/test/schema.test.js`
- `loom/test/system-scaffold.test.js`

</details>

<details>
<summary>`loom/ui/` · 1 file</summary>

- `loom/ui/index.html`

</details>

49 release notes name a file of loom: 0.60.157., 0.60.156., 0.60.155., 0.60.153., 0.60.150., 0.60.143., 0.60.134., 0.60.131., 0.60.127., 0.60.126., 0.60.118., 0.60.80., 0.60.72., 0.60.63., 0.60.41., 0.60.7., 0.60.5., 0.60.4., 0.59.11., 0.53.0., 0.49.0., 0.44.0., 0.39.367., 0.39.359., 0.39.349., 0.39.334., 0.39.332., 0.39.330., 0.39.329., 0.39.313., 0.39.310., 0.39.305., 0.39.302., 0.39.298., 0.39.281., 0.39.280., 0.39.278., 0.39.275., 0.39.273., 0.39.271., and 9 older. Each is in the version history below, in his words.

<!-- generated:readme:system:loom:end -->

### clear-glass

The sovereign browser: Electron and Chromium, with its own fingerprint control, and the place every provider tab lives. `clear-glass/src/main/index.js` starts it; `clear-glass/src/` holds the browser's subsystems (accounts, cookies, downloads, the DevTools-protocol driver in `clear-glass/src/driver/`, providers, userscripts, site settings), `clear-glass/renderer/` its windows (the browser, Settings, the Library), and `clear-glass/plugins/` its plugins. It serves its control API on port 7704 and streams on 7701. `clear-glass/registry-components.js` is its live contract, the largest in NEXUS, and `clear-glass/spec/clear-glass.spec` was written from that contract rather than from scratch. The next zoom level is `clear-glass-atlas.md`.

<!-- generated:readme:system:clear-glass:start -->
#### clear-glass: every module and every file

Clear-glass is 266 files in 68 modules, port 7704, spec `clear-glass/spec/clear-glass.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/clear-glass-atlas.md`.

<details>
<summary>`clear-glass/` · 6 files</summary>

- `clear-glass/README.md` — Clear Glass v3 — NEXUS Sovereign Browser
- `clear-glass/compartment.json`
- `clear-glass/fix-orchestrator.js` — fix-orchestrator.js Fixes: Error: Cannot find module './lib/intent-map'
- `clear-glass/interaction-contract.json`
- `clear-glass/package.json`
- `clear-glass/registry-components.js` — Clear Glass System Contract Served at GET /contract from the IPC server (port 7702).

</details>

<details>
<summary>`clear-glass/docs/` · 1 file</summary>

- `clear-glass/docs/clear-glass-seam.spec.md` — CLEAR GLASS — NEXUS SEAM Integration Spec

</details>

<details>
<summary>`clear-glass/docs/gigs/` · 3 files</summary>

- `clear-glass/docs/gigs/gig-template.gig`
- `clear-glass/docs/gigs/nodejs-automation-scraping.gig`
- `clear-glass/docs/gigs/nodejs-automation-scraping.gig.json`

</details>

<details>
<summary>`clear-glass/input/` · 1 file</summary>

- `clear-glass/input/.gitkeep`

</details>

<details>
<summary>`clear-glass/plugins/adblocker/` · 2 files</summary>

- `clear-glass/plugins/adblocker/index.js` — plugins/adblocker/index.js — real content-filter contribution. §HONEST SCOPE — the actual Electron wiring…
- `clear-glass/plugins/adblocker/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/captcha-pause/` · 2 files</summary>

- `clear-glass/plugins/captcha-pause/index.js` — plugins/captcha-pause/index.js — real pause-resume-gate contribution. Composes two ALREADY-REAL primitives,…
- `clear-glass/plugins/captcha-pause/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/guardian-listeners/` · 2 files</summary>

- `clear-glass/plugins/guardian-listeners/index.js` — plugins/guardian-listeners/index.js — real userscript contributions. §HONEST LIMIT — the original…
- `clear-glass/plugins/guardian-listeners/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/passwords/` · 2 files</summary>

- `clear-glass/plugins/passwords/index.js` — plugins/passwords/index.js — real userscript + page-detector + toolbar-command contributions.
- `clear-glass/plugins/passwords/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/permissions/` · 2 files</summary>

- `clear-glass/plugins/permissions/index.js` — plugins/permissions/index.js — real permission-filter contribution. §UPDATED 2026-08-24 — now consults the…
- `clear-glass/plugins/permissions/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/zoom/` · 2 files</summary>

- `clear-glass/plugins/zoom/index.js` — plugins/zoom/index.js — real toolbar-command contributions. Composes the real driver.exec 'zoom' action…
- `clear-glass/plugins/zoom/manifest.json`

</details>

<details>
<summary>`clear-glass/renderer/` · 11 files</summary>

- `clear-glass/renderer/browser.css`
- `clear-glass/renderer/browser.html`
- `clear-glass/renderer/browser.js`
- `clear-glass/renderer/copilot-cli.js`
- `clear-glass/renderer/cos-theme.css`
- `clear-glass/renderer/gig-panel.js`
- `clear-glass/renderer/guardian-picker.js`
- `clear-glass/renderer/library.html`
- `clear-glass/renderer/mesh-picker.js`
- `clear-glass/renderer/selector-check.js`
- `clear-glass/renderer/settings.html`

</details>

<details>
<summary>`clear-glass/renderer/library/` · 18 files</summary>

- `clear-glass/renderer/library/api.js`
- `clear-glass/renderer/library/boot.js`
- `clear-glass/renderer/library/sections/accounts.css`
- `clear-glass/renderer/library/sections/accounts.js`
- `clear-glass/renderer/library/sections/autofill.css`
- `clear-glass/renderer/library/sections/autofill.js`
- `clear-glass/renderer/library/sections/bookmarks.css`
- `clear-glass/renderer/library/sections/bookmarks.js`
- `clear-glass/renderer/library/sections/downloads.css`
- `clear-glass/renderer/library/sections/downloads.js`
- `clear-glass/renderer/library/sections/history.css`
- `clear-glass/renderer/library/sections/history.js`
- `clear-glass/renderer/library/sections/macros.css`
- `clear-glass/renderer/library/sections/macros.js`
- `clear-glass/renderer/library/sections/passwords.css`
- `clear-glass/renderer/library/sections/passwords.js`
- `clear-glass/renderer/library/sections/responses.css`
- `clear-glass/renderer/library/sections/responses.js`

</details>

<details>
<summary>`clear-glass/renderer/selector-assign/` · 2 files</summary>

- `clear-glass/renderer/selector-assign/selector-assign.css`
- `clear-glass/renderer/selector-assign/selector-assign.js` — v0.39.251 The element picker assigns selectors (handoff 2026-09-25, step 1). One area,

</details>

<details>
<summary>`clear-glass/renderer/settings/` · 41 files</summary>

- `clear-glass/renderer/settings/boot.js`
- `clear-glass/renderer/settings/core.js`
- `clear-glass/renderer/settings/sections/accounts.css`
- `clear-glass/renderer/settings/sections/accounts.js`
- `clear-glass/renderer/settings/sections/autofill.css`
- `clear-glass/renderer/settings/sections/autofill.js`
- `clear-glass/renderer/settings/sections/automation.css`
- `clear-glass/renderer/settings/sections/automation.js`
- `clear-glass/renderer/settings/sections/chats.css`
- `clear-glass/renderer/settings/sections/chats.js`
- `clear-glass/renderer/settings/sections/connections.css`
- `clear-glass/renderer/settings/sections/connections.js`
- `clear-glass/renderer/settings/sections/copilot.css`
- `clear-glass/renderer/settings/sections/copilot.js`
- `clear-glass/renderer/settings/sections/diagnostics.css`
- `clear-glass/renderer/settings/sections/diagnostics.js`
- `clear-glass/renderer/settings/sections/downloads.css`
- `clear-glass/renderer/settings/sections/downloads.js`
- `clear-glass/renderer/settings/sections/eros.css`
- `clear-glass/renderer/settings/sections/eros.js`
- `clear-glass/renderer/settings/sections/fingerprint.css`
- `clear-glass/renderer/settings/sections/fingerprint.js`
- `clear-glass/renderer/settings/sections/general.css`
- `clear-glass/renderer/settings/sections/general.js`
- `clear-glass/renderer/settings/sections/macros.css`
- `clear-glass/renderer/settings/sections/macros.js`
- `clear-glass/renderer/settings/sections/mesh.css`
- `clear-glass/renderer/settings/sections/mesh.js`
- `clear-glass/renderer/settings/sections/plugins.css`
- `clear-glass/renderer/settings/sections/plugins.js`
- `clear-glass/renderer/settings/sections/privacy.css`
- `clear-glass/renderer/settings/sections/privacy.js`
- `clear-glass/renderer/settings/sections/providers.css`
- `clear-glass/renderer/settings/sections/providers.js`
- `clear-glass/renderer/settings/sections/shortcuts.css`
- `clear-glass/renderer/settings/sections/shortcuts.js`
- `clear-glass/renderer/settings/sections/sites.css`
- `clear-glass/renderer/settings/sections/sites.js`
- `clear-glass/renderer/settings/sections/suite.css`
- `clear-glass/renderer/settings/sections/suite.js`
- `clear-glass/renderer/settings/settings.css`

</details>

<details>
<summary>`clear-glass/schemas/` · 11 files</summary>

- `clear-glass/schemas/index.js`
- `clear-glass/schemas/schema.capability`
- `clear-glass/schemas/schema.clearglass_search_engine`
- `clear-glass/schemas/schema.command`
- `clear-glass/schemas/schema.component`
- `clear-glass/schemas/schema.event`
- `clear-glass/schemas/schema.hook`
- `clear-glass/schemas/schema.macro`
- `clear-glass/schemas/schema.node`
- `clear-glass/schemas/schema.system`
- `clear-glass/schemas/schema.wire`

</details>

<details>
<summary>`clear-glass/seam/` · 2 files</summary>

- `clear-glass/seam/registry-components.js` — seam/registry-components.js — Clear Glass Component Registry Follows lib/component-registry.js schema exactly.
- `clear-glass/seam/watchdog-gates.js` — seam/watchdog-gates.js — Co-pilot Watchdog Gates Co-pilot as watchdog — active, not passive.

</details>

<details>
<summary>`clear-glass/siso/` · 2 files</summary>

- `clear-glass/siso/index.js` — siso/index.js — Clear Glass SISO Core (CJS) Jonathan Bailey's SISO primitives ported to CJS for Electron/Node.
- `clear-glass/siso/package.json`

</details>

<details>
<summary>`clear-glass/spec/` · 5 files</summary>

- `clear-glass/spec/clear-glass.node-taxonomy.md` — Node type → system map — Clear-glass
- `clear-glass/spec/clear-glass.spec` — ── ADDENDUM 2026-10-05 (0.39.357) — 3.24.0 ──
- `clear-glass/spec/design-surface.spec` — Design surface — made in the spec workshop (idearium)
- `clear-glass/spec/guided-browser.spec` — Guided browser — made in the spec workshop (idearium)
- `clear-glass/spec/semantic-tree.spec` — SP1 (0.60.49). Surface drafted from the code (lib/capability-spec.js draft); purpose from the map.

</details>

<details>
<summary>`clear-glass/src/` · 1 file</summary>

- `clear-glass/src/event-taxonomy.js` — (userscript // errors). Every event below is copied from the actual real emit()

</details>

<details>
<summary>`clear-glass/src/accounts/` · 2 files</summary>

- `clear-glass/src/accounts/idearium-login.js` — src/accounts/idearium-login.js — Clear Glass signs in to Idearium for you (IA4,…
- `clear-glass/src/accounts/login-portal.js`

</details>

<details>
<summary>`clear-glass/src/api/` · 1 file</summary>

- `clear-glass/src/api/settings.js` — src/api/settings.js — NEXUS Connection Settings Stores NEXUS service ports and co-pilot routing config.

</details>

<details>
<summary>`clear-glass/src/autofill/` · 4 files</summary>

- `clear-glass/src/autofill/gig.js`
- `clear-glass/src/autofill/matcher.js` — real form-field matching §BUILT 2026-09-19 — pure functions, no DOM/network access, so this
- `clear-glass/src/autofill/proposal.js` — cover letters and freelance proposals from an autofill profile.
- `clear-glass/src/autofill/store.js` — Autofill Profile Store §BUILT 2026-09-19 — James: "autofill." Deliberately NOT named

</details>

<details>
<summary>`clear-glass/src/automation/` · 8 files</summary>

- `clear-glass/src/automation/cron.js` — standard 5-field cron, local time. component_id: cg.automation.cron
- `clear-glass/src/automation/dom.js` — the in-page half of the automation DOM tools. component_id: cg.automation.dom
- `clear-glass/src/automation/from-macro.js` — a saved macro, as workflow steps. component_id: cg.automation.from-macro
- `clear-glass/src/automation/nodes.js`
- `clear-glass/src/automation/routes.js` — every /automation/* route of Clear Glass's wire server. component_id: cg.automation.routes
- `clear-glass/src/automation/steps.js` — what every workflow step is, for the UI and for validation. component_id: cg.automation.steps
- `clear-glass/src/automation/template.js`
- `clear-glass/src/automation/templates.js` — ready-made workflows for "New workflow". component_id: cg.automation.templates

</details>

<details>
<summary>`clear-glass/src/bookmarks/` · 2 files</summary>

- `clear-glass/src/bookmarks/browser.js` — // §fix 2026-06-29, take 2 — the Proxy-wrapping approach below broke // everything:…
- `clear-glass/src/bookmarks/store.js` — src/bookmarks/store.js — Clear Glass Bookmark Store Per-agent bookmarks. Named, tagged, bus-controllable.

</details>

<details>
<summary>`clear-glass/src/chats/` · 3 files</summary>

- `clear-glass/src/chats/crawler.js` — drives lib/chat-crawl-plan.js: reads the chat list, visits one chat at a time, reports, saves (PI5, 0.60.84)…
- `clear-glass/src/chats/ports.js` — the three ports the chat crawler needs, made of Clear Glass automations (PI5b, 0.60.85) Map:…
- `clear-glass/src/chats/service.js` — starts, stops and reports the chat crawler per account (PI5b, 0.60.85) James, 2026-10-16: "build it." One…

</details>

<details>
<summary>`clear-glass/src/contexts/` · 3 files</summary>

- `clear-glass/src/contexts/google-signin.js`
- `clear-glass/src/contexts/manager.js` — Context Manager One Chromium session partition per agent.
- `clear-glass/src/contexts/session-headers.js` — src/contexts/session-headers.js — Shared CSP / X-Frame-Options / PNA bypass Originally this lived inline in…

</details>

<details>
<summary>`clear-glass/src/cookies/` · 2 files</summary>

- `clear-glass/src/cookies/session-hub.js`
- `clear-glass/src/cookies/vault.js` — Cookie Vault Encrypted per-agent cookie storage with versioned snapshots.

</details>

<details>
<summary>`clear-glass/src/copilot/` · 6 files</summary>

- `clear-glass/src/copilot/bridge.js`
- `clear-glass/src/copilot/chat-store.js` — the co-pilot pane's conversation, kept. §0.39.278 — James: "copilot and clearglass, isnt really working. its…
- `clear-glass/src/copilot/hat.js` — src/copilot/hat.js — the Clear Glass hat component_id: cg.copilot.hat
- `clear-glass/src/copilot/tools.js` — src/copilot/tools.js — Co-pilot Tool Registry Every Clear Glass capability the co-pilot can invoke, declared…
- `clear-glass/src/copilot/verbs.js`
- `clear-glass/src/copilot/wake-relay.js` — src/copilot/wake-relay.js — closes the real loop James described: "hey nexus" said in any agent tab ->…

</details>

<details>
<summary>`clear-glass/src/core/` · 1 file</summary>

- `clear-glass/src/core/bus.js` — src/core/bus.js — Clear Glass Central SISO Bus The single Stream that owns all Clear Glass events.

</details>

<details>
<summary>`clear-glass/src/diagnostic/` · 3 files</summary>

- `clear-glass/src/diagnostic/engine.js` — Diagnostic Engine Playwright-equivalent powered by ClearDriver.
- `clear-glass/src/diagnostic/error-capture.js` — src/diagnostic/error-capture.js — Clear Glass Error Capture §fix 2026-06-30 — built because the actual gap…
- `clear-glass/src/diagnostic/process-metrics.js` — src/diagnostic/process-metrics.js — real process instrumentation §NEW 2026-07-11 — built in direct response…

</details>

<details>
<summary>`clear-glass/src/dom/` · 1 file</summary>

- `clear-glass/src/dom/archaeology.js` — DOM Archaeology Maps the live DOM into a NEXUS-readable addressable tree.

</details>

<details>
<summary>`clear-glass/src/downloads/` · 5 files</summary>

- `clear-glass/src/downloads/adapter.js` — src/downloads/adapter.js — will-download wiring for agent sessions Same session.on('will-download', ...)…
- `clear-glass/src/downloads/artifact-chat-index.js`
- `clear-glass/src/downloads/chat-ledger.js`
- `clear-glass/src/downloads/intake-bridge.js`
- `clear-glass/src/downloads/store.js` — src/downloads/store.js — Real Local Downloads Store Real gap named directly in…

</details>

<details>
<summary>`clear-glass/src/driver/` · 6 files</summary>

- `clear-glass/src/driver/glass-host/main.js` — Clear Glass's engine, run as a page host for glass.js. §0.39.263 — James: "playright? no what is that for?…
- `clear-glass/src/driver/glass-host/package.json`
- `clear-glass/src/driver/glass.js`
- `clear-glass/src/driver/index.js` — ClearDriver — NEXUS sovereign browser automation No Playwright. No Puppeteer. Own the primitives.
- `clear-glass/src/driver/page-resolver.js` — the ONE place that turns an agentId into the webContents of the page the agent lives in. 2026-09-19.
- `clear-glass/src/driver/url-listener.js` — URL Listener Add a listener for any URL pattern — fires a NEXUS hook on match.

</details>

<details>
<summary>`clear-glass/src/eros/` · 1 file</summary>

- `clear-glass/src/eros/supervisor.js` — ErosmancerOS runs with Clear Glass. §0.39.264 — James: "hook it in to run with clearglass" / "just need

</details>

<details>
<summary>`clear-glass/src/fingerprint/` · 2 files</summary>

- `clear-glass/src/fingerprint/engine.js` — Fingerprint Engine Builds and manages per-agent Firefox fingerprint profiles.
- `clear-glass/src/fingerprint/firefox-version.js` — src/fingerprint/firefox-version.js — the Firefox version Clear Glass claims, computed from Mozilla's release…

</details>

<details>
<summary>`clear-glass/src/gates/` · 1 file</summary>

- `clear-glass/src/gates/index.js` — src/gates/index.js — Clear Glass Gate Registry Every system behavior is a Gate registered on the central bus.

</details>

<details>
<summary>`clear-glass/src/history/` · 1 file</summary>

- `clear-glass/src/history/store.js` — Real Browsing History Store §GAP CLOSED 2026-08-30 — James: "build them all." Real, confirmed gap:

</details>

<details>
<summary>`clear-glass/src/ipc/` · 3 files</summary>

- `clear-glass/src/ipc/agent-routes.js`
- `clear-glass/src/ipc/bridge.js` — src/ipc/bridge.js — SISO-native IPC Bridge NEXUS commands arrive as HTTP POST /cmd → become SISO Events →…
- `clear-glass/src/ipc/handler-registry.js`

</details>

<details>
<summary>`clear-glass/src/jobs/` · 1 file</summary>

- `clear-glass/src/jobs/intake.js`

</details>

<details>
<summary>`clear-glass/src/macros/` · 3 files</summary>

- `clear-glass/src/macros/live-recording.js` — a recording that IS a .macro node file from the first second (MR1, 0.60.57) James, 2026-10-15: "this is…
- `clear-glass/src/macros/recorder-script.js` — the page-side recorder, as a script string (MR1, 0.60.57) James, 2026-10-15: "this is wrong... needs to…
- `clear-glass/src/macros/recording.js` — src/macros/recording.js — recorded page events → macro steps (pure) component_id: cg.macros.recording

</details>

<details>
<summary>`clear-glass/src/main/` · 4 files</summary>

- `clear-glass/src/main/compartment-window.js` — idearium's pop-out pages as COS-compartment windows. §0.39.280. James: "can you have the electron popup…
- `clear-glass/src/main/index.js` — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):
- `clear-glass/src/main/index.pre-userscripts.js` — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):
- `clear-glass/src/main/window-frame.js` — one dark frame for every Clear Glass window that is not the main browser (CS1, 0.60.54) Map:…

</details>

<details>
<summary>`clear-glass/src/mesh/` · 5 files</summary>

- `clear-glass/src/mesh/agent-mesh.js` — Agent Mesh Free AI agent channels baked into Clear Glass.
- `clear-glass/src/mesh/automation-engine.js`
- `clear-glass/src/mesh/dom-transport.js` — host side of the mesh's DOM transport (2026-09-19). Drives page/agent-page.js inside an agent's chat page…
- `clear-glass/src/mesh/page/agent-page.js`
- `clear-glass/src/mesh/route-graph.js` — real, persisted node-to-node routing edges for BrainOS's canvas (docs/2026-09-11-brainos-agent-

</details>

<details>
<summary>`clear-glass/src/net/` · 3 files</summary>

- `clear-glass/src/net/policy.js` — which way does a request go? (NP2, 0.60.60). Pure: no Electron, no network. James, 2026-10-15: "protocol…
- `clear-glass/src/net/service.js` — the one door for routes and the transport (NP1+NP2+NP3 slice, 0.60.60). CLI first (James's order):…
- `clear-glass/src/net/transport-host.js` — tor with Snowflake as its bridge, run as an isolated child (NP1, 0.60.60). Everything impure is injected.…

</details>

<details>
<summary>`clear-glass/src/network/` · 3 files</summary>

- `clear-glass/src/network/install.js` — // clear-glass/src/network/install.js — wires the network subsystem's one // remaining real module:…
- `clear-glass/src/network/pulse-registry.js` — // clear-glass/src/network/pulse-registry.js — node handshake/heartbeat/ // liveness registry.
- `clear-glass/src/network/routes.js` — — Pulse Registry (network/pulse-registry.js) — // the one real, load-bearing module left here,

</details>

<details>
<summary>`clear-glass/src/options/` · 1 file</summary>

- `clear-glass/src/options/store.js` — src/options/store.js — Nexus Options Store Persistent, bus-controllable settings for Clear Glass's own…

</details>

<details>
<summary>`clear-glass/src/page/` · 5 files</summary>

- `clear-glass/src/page/attention.js` — where each window's attention is (FN2, docs/2026-10-10-shape-of-nexus-phasemap.spec). James, 2026-10-10:…
- `clear-glass/src/page/field.js`
- `clear-glass/src/page/nexus-chat.js`
- `clear-glass/src/page/reader.js` — one call that tells an agent what is on the page. James, 2026-09-27: "i want copilot completely aware of…
- `clear-glass/src/page/semantic-tree.js`

</details>

<details>
<summary>`clear-glass/src/passwords/` · 1 file</summary>

- `clear-glass/src/passwords/vault.js`

</details>

<details>
<summary>`clear-glass/src/plugins/` · 6 files</summary>

- `clear-glass/src/plugins/contribution-types.js`
- `clear-glass/src/plugins/host.js`
- `clear-glass/src/plugins/permission-adapter.js` — src/plugins/permission-adapter.js — permission-filter ↔ Electron wiring §HONEST LIMIT — traced against…
- `clear-glass/src/plugins/schema.js`
- `clear-glass/src/plugins/webextensions.js` — src/plugins/webextensions.js — Chrome WebExtensions in Clear Glass component_id: cg.plugins.webextensions
- `clear-glass/src/plugins/webrequest-adapter.js` — src/plugins/webrequest-adapter.js — content-filter ↔ Electron wiring §HONEST LIMIT — traced against real,…

</details>

<details>
<summary>`clear-glass/src/preload/` · 4 files</summary>

- `clear-glass/src/preload/compartment-window.js` — // clear-glass/src/preload/compartment-window.js — §0.39.280. The only thing idearium's compartment windows…
- `clear-glass/src/preload/google-signin.js` — src/preload/google-signin.js — a session preload: on Google's sign-in pages, before Google's own scripts…
- `clear-glass/src/preload/index.js` — Preload — contextIsolation bridge Exposes a minimal, typed API to the renderer.
- `clear-glass/src/preload/webview-bridge.js` — src/preload/webview-bridge.js §BUILD 2026-07-09 — the injected PICKER_SCRIPT in renderer/browser.html

</details>

<details>
<summary>`clear-glass/src/providers/` · 8 files</summary>

- `clear-glass/src/providers/account-switch.js`
- `clear-glass/src/providers/attention.js`
- `clear-glass/src/providers/download-capture.js` — a file downloaded from a provider tab is announced to Guardian, with the chat it came from attached.
- `clear-glass/src/providers/gm-shim.js`
- `clear-glass/src/providers/host.js` — src/providers/host.js — NCP Provider Auto-Host v2 Spawns one hidden BrowserWindow per NCP provider on boot.
- `clear-glass/src/providers/profile-tabs.js`
- `clear-glass/src/providers/registry.js` — src/providers/registry.js — NCP Provider Registry: a CACHE of Guardian's agent facts (GA1, map invariant…
- `clear-glass/src/providers/selector-assign.js` — v0.39.251 Main-process half of "the element picker assigns selectors" (handoff

</details>

<details>
<summary>`clear-glass/src/releases/` · 2 files</summary>

- `clear-glass/src/releases/deliver.js` — Clear Glass brings a Nexus release to COS's inbox (COSA7, 0.60.93) Map:…
- `clear-glass/src/releases/service.js` — what Clear Glass knows about COS, and the two calls the bridge and the command use (COSA7, 0.60.93) James,…

</details>

<details>
<summary>`clear-glass/src/rewind/` · 1 file</summary>

- `clear-glass/src/rewind/engine.js` — src/rewind/engine.js — Clear Glass Rewind Engine Rewind is the session time-machine. Every N seconds (or on…

</details>

<details>
<summary>`clear-glass/src/screen-qa/` · 1 file</summary>

- `clear-glass/src/screen-qa/detector.js` — detect open-ended on-screen questions (job-application screening questions, "why do you want this

</details>

<details>
<summary>`clear-glass/src/seam/` · 1 file</summary>

- `clear-glass/src/seam/index.js` — src/seam/index.js — NEXUS registration shim This module is kept for gate backward-compat. Actual NEXUS…

</details>

<details>
<summary>`clear-glass/src/security/` · 1 file</summary>

- `clear-glass/src/security/vault-key.js` — src/security/vault-key.js — one real key source for every clear-glass vault §BUILT 2026-09-23 — James: "yes…

</details>

<details>
<summary>`clear-glass/src/shortcuts/` · 1 file</summary>

- `clear-glass/src/shortcuts/registry.js` — src/shortcuts/registry.js — keyboard shortcuts: the actions, their default keys, and turning a key press…

</details>

<details>
<summary>`clear-glass/src/site-settings/` · 1 file</summary>

- `clear-glass/src/site-settings/store.js` — src/site-settings/store.js — Real Per-Site Settings Store Real gap named directly in…

</details>

<details>
<summary>`clear-glass/src/speech/` · 2 files</summary>

- `clear-glass/src/speech/engine.js` — src/speech/engine.js — Real Speech-to-Text Engine Real gap named in…
- `clear-glass/src/speech/transcribe.py`

</details>

<details>
<summary>`clear-glass/src/sse/` · 1 file</summary>

- `clear-glass/src/sse/server.js` — src/sse/server.js — SSE Bus Bridge Subscribes to the SISO bus via bus.on('*', ...) and broadcasts

</details>

<details>
<summary>`clear-glass/src/storage/` · 1 file</summary>

- `clear-glass/src/storage/jaa.js` — src/storage/jaa.js — Clear Glass's one database component_id: cg.storage.jaa

</details>

<details>
<summary>`clear-glass/src/tls/` · 2 files</summary>

- `clear-glass/src/tls/helper.js` — src/tls/helper.js — runs cg-tls-helper (clear-glass/tls-helper/), Clear Glass's TLS layer, and says what…
- `clear-glass/src/tls/proxy.js` — TLS Proxy — Firefox JA4 Fingerprint Layer Sits between Clear Glass and the internet.

</details>

<details>
<summary>`clear-glass/src/toolbar/` · 1 file</summary>

- `clear-glass/src/toolbar/commands.js`

</details>

<details>
<summary>`clear-glass/src/userscripts/` · 1 file</summary>

- `clear-glass/src/userscripts/manager.js` — src/userscripts/manager.js — Clear Glass Userscript Manager Manages userscripts per agent. Scripts can be:

</details>

<details>
<summary>`clear-glass/test/` · 24 files</summary>

- `clear-glass/test/bus.test.js`
- `clear-glass/test/chats-settings.test.js`
- `clear-glass/test/content-filter-exempt.test.js`
- `clear-glass/test/copilot-cli.test.js`
- `clear-glass/test/dark-popups.test.js`
- `clear-glass/test/downloads-intake-bridge.test.js`
- `clear-glass/test/gig-file.test.js`
- `clear-glass/test/google-signin.test.js`
- `clear-glass/test/login-portal-elsewhere.test.js`
- `clear-glass/test/macros-guide.test.js`
- `clear-glass/test/network-install.test.js`
- `clear-glass/test/phase2.test.js`
- `clear-glass/test/privacy-merge.test.js`
- `clear-glass/test/provider-account-sync.test.js`
- `clear-glass/test/session-hub.test.js`
- `clear-glass/test/settings-merge-render.test.js`
- `clear-glass/test/settings-merge.test.js`
- `clear-glass/test/signin-window-quiet.test.js`
- `clear-glass/test/storage-jaa.test.js`
- `clear-glass/test/userscripts-dedupe.test.js`
- `clear-glass/test/userscripts-manifest.test.js`
- `clear-glass/test/watchdog.test.js`
- `clear-glass/test/webextensions.test.js`
- `clear-glass/test/window-frame.test.js`

</details>

<details>
<summary>`clear-glass/tls-helper/` · 5 files</summary>

- `clear-glass/tls-helper/build.js` — builds cg-tls-helper for each platform into bin/-/, with SHA256SUMS. Map:…
- `clear-glass/tls-helper/go.mod`
- `clear-glass/tls-helper/go.sum`
- `clear-glass/tls-helper/main.go`
- `clear-glass/tls-helper/main_test.go`

</details>

<details>
<summary>`clear-glass/tls-helper/bin/` · 3 files</summary>

- `clear-glass/tls-helper/bin/SHA256SUMS`
- `clear-glass/tls-helper/bin/linux-amd64/cg-tls-helper`
- `clear-glass/tls-helper/bin/windows-amd64/cg-tls-helper.exe`

</details>

<details>
<summary>`clear-glass/tools/` · 1 file</summary>

- `clear-glass/tools/process-monitor.html`

</details>

<details>
<summary>`clear-glass/wire/` · 2 files</summary>

- `clear-glass/wire/eros-registry-components.js` — wire/eros-registry-components.js ErosmancerOS component declarations for NEXUS component-registry.
- `clear-glass/wire/nexus-wire.js` — wire/nexus-wire.js — ErosmancerOS ↔ Clear Glass ↔ NEXUS Standalone HTTP bridge process at port 7704.

</details>

68 release notes name a file of clear-glass: 0.60.149., 0.60.146., 0.60.145., 0.60.137., 0.60.131., 0.60.109., 0.60.108., 0.60.106., 0.60.93., 0.60.85., 0.60.84., 0.60.71., 0.60.70., 0.60.69., 0.60.60., 0.60.58., 0.60.55., 0.60.54., 0.60.51., 0.60.49., 0.60.29., 0.60.14., 0.60.13., 0.60.12., 0.60.11., 0.60.10., 0.60.7., 0.60.5., 0.60.4., 0.60.3., 0.60.2., 0.60.0., 0.59.12., 0.59.11., 0.59.10., 0.59.9., 0.59.8., 0.59.7., 0.59.6., 0.59.5., and 28 older. Each is in the version history below, in his words.

<!-- generated:readme:system:clear-glass:end -->

### components

The component store: every file WARP builds through Idearium, kept in `components/` as one folder per component version with its dependencies pinned by id and version, and asked before any new build spends a token. `lib/component-store.js` is the store; `idearium/api/index.js` writes to it and reads from it in the build path; agents find stored components with the registry harness in `lib/registry-harness.js`. It has no port and no process of its own, and loom never scans it because it is built output rather than Nexus source. The next zoom level is `components-atlas.md`.

<!-- generated:readme:system:components:start -->
#### components: every module and every file

Components is 1 files in 1 modules. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/components-atlas.md`.

<details>
<summary>`components/` · 1 file</summary>

- `components/index.json`

</details>

<!-- generated:readme:system:components:end -->

### cos

The Compartment OS: isolated sandboxes with their own process, network and runtime boundary, persistent state on disk and real snapshots, and the virtual machines the test environment and the repo desktops run in. `cos/kernel.js` and `cos/manager.js` run compartments, `cos/compartment/qemu-runtime.js` gives one a hardware-virtualized guest, and `cos/testenv/` builds a test environment for any repo. Its spec is `cos/spec/cos.spec`. Like components it has no process of its own; until 0.39.341 it was part of core (James: "cos needs to be a nested compartment"). The next zoom level is `cos-atlas.md`.

<!-- generated:readme:system:cos:start -->
#### cos: every module and every file

Cos is 307 files in 31 modules, spec `cos/spec/cos.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/cos-atlas.md`.

<details>
<summary>`cos/` · 5 files</summary>

- `cos/event-taxonomy.js` — // cos/event-taxonomy.js — every event COS emits, in the ET1 shape (lib/event-taxonomy-pattern.js). //…
- `cos/interaction-contract.json`
- `cos/kernel.js` — @param {object} opts @param {string} opts.id Unique compartment ID
- `cos/manager.js` — // ───────────────────────────────────────────────────────────────────────────── // Compartment Manager
- `cos/package.json`

</details>

<details>
<summary>`cos/app/` · 9 files</summary>

- `cos/app/app-update.js`
- `cos/app/cli.js`
- `cos/app/controller.js`
- `cos/app/runtime.js`
- `cos/app/settings.js`
- `cos/app/shell.js`
- `cos/app/store.js`
- `cos/app/switch.js`
- `cos/app/version.js`

</details>

<details>
<summary>`cos/app/desktop/` · 6 files</summary>

- `cos/app/desktop/icon.png`
- `cos/app/desktop/main.js` — COS for Windows: the window, the tray, the inbox watcher (COSA6, 0.60.89) James, 2026-10-16: "cos app for…
- `cos/app/desktop/preload.js` — // cos/app/desktop/preload.js — the only door between the COS window and the machine: named calls, nothing…
- `cos/app/desktop/ui/app.js` — the COS window. Draws what the controller says (window.cos); decides nothing itself. (COSA6, 0.60.89) James,…
- `cos/app/desktop/ui/index.html`
- `cos/app/desktop/ui/style.css`

</details>

<details>
<summary>`cos/archetype/` · 7 files</summary>

- `cos/archetype/detector.js` — archetype/detector.js COMPARTMENT OS — Archetype Auto-Detector (spec §43/§60, ArchetypeDetectionConfidence)
- `cos/archetype/eravos.js` — the COS archetypes eravos-canvas, eravos-tool and eravos-sound-tool, from James's ERAVOS. Map:…
- `cos/archetype/genesis-catalog.js` — genesis's file catalog, generated from the nexus-system archetype's real files. §0.39.359 SB28 — genesis…
- `cos/archetype/index.js` — archetype/index.js COMPARTMENT OS — Archetype Public API
- `cos/archetype/nexus-system.js` — the COS archetype "nexus-system": a new system in Guardian's shape. §0.39.359 SB30 — James: "Like I want…
- `cos/archetype/registry.js` — archetype/registry.js COMPARTMENT OS — Built-in Archetype Registry (spec §60.2)
- `cos/archetype/schema.js` — archetype/schema.js COMPARTMENT OS — Archetype Contract Validator

</details>

<details>
<summary>`cos/archetype/components/` · 1 file</summary>

- `cos/archetype/components/index.js` — reusable system components, the parts the nexus-system template is made of. §0.39.359 SB30 — James: "then we…

</details>

<details>
<summary>`cos/archetype/eravos-canvas/` · 58 files</summary>

- `cos/archetype/eravos-canvas/.template-tree`
- `cos/archetype/eravos-canvas/README.md`
- `cos/archetype/eravos-canvas/build/index-tools.mjs`
- `cos/archetype/eravos-canvas/build/new-tool.mjs`
- `cos/archetype/eravos-canvas/build/validate.mjs`
- `cos/archetype/eravos-canvas/canvas/index.html`
- `cos/archetype/eravos-canvas/canvas/kernel/intake.js`
- `cos/archetype/eravos-canvas/canvas/kernel/kernel.js`
- `cos/archetype/eravos-canvas/canvas/runtime/add-menu.js`
- `cos/archetype/eravos-canvas/canvas/runtime/canvas-wm.js`
- `cos/archetype/eravos-canvas/canvas/runtime/content-packs.js`
- `cos/archetype/eravos-canvas/canvas/runtime/desktop-bridge.js`
- `cos/archetype/eravos-canvas/canvas/runtime/eravos.css`
- `cos/archetype/eravos-canvas/canvas/runtime/expansion.js`
- `cos/archetype/eravos-canvas/canvas/runtime/history.js`
- `cos/archetype/eravos-canvas/canvas/runtime/organism-factory.js`
- `cos/archetype/eravos-canvas/canvas/runtime/organism-sdk.js`
- `cos/archetype/eravos-canvas/canvas/runtime/pack-editor.js`
- `cos/archetype/eravos-canvas/canvas/runtime/plain-errors.js`
- `cos/archetype/eravos-canvas/canvas/runtime/preview.css`
- `cos/archetype/eravos-canvas/canvas/runtime/preview.js`
- `cos/archetype/eravos-canvas/canvas/runtime/recipes.js`
- `cos/archetype/eravos-canvas/canvas/runtime/tool-settings.js`
- `cos/archetype/eravos-canvas/canvas/runtime/ui-kit.js`
- `cos/archetype/eravos-canvas/canvas/runtime/wire-menu.css`
- `cos/archetype/eravos-canvas/canvas/runtime/wire-system.js`
- `cos/archetype/eravos-canvas/canvas/runtime/workspace.js`
- `cos/archetype/eravos-canvas/canvas/scripts.js`
- `cos/archetype/eravos-canvas/index.html`
- `cos/archetype/eravos-canvas/schemas/category.schema.json`
- `cos/archetype/eravos-canvas/schemas/domain.schema.json`
- `cos/archetype/eravos-canvas/schemas/mode.schema.json`
- `cos/archetype/eravos-canvas/schemas/pack.schema.json`
- `cos/archetype/eravos-canvas/schemas/tool.schema.json`
- `cos/archetype/eravos-canvas/serve.js`
- `cos/archetype/eravos-canvas/templates/category/category.json`
- `cos/archetype/eravos-canvas/templates/domain/domain.json`
- `cos/archetype/eravos-canvas/templates/mode/__MODE__.mode.json`
- `cos/archetype/eravos-canvas/templates/pack/pack.json`
- `cos/archetype/eravos-canvas/templates/tool-sound/README.md`
- `cos/archetype/eravos-canvas/templates/tool-sound/__TOOL__.engine.js`
- `cos/archetype/eravos-canvas/templates/tool-sound/__TOOL__.spec`
- `cos/archetype/eravos-canvas/templates/tool-sound/__TOOL__.test.js`
- `cos/archetype/eravos-canvas/templates/tool-sound/__TOOL__.ui.js`
- `cos/archetype/eravos-canvas/templates/tool-sound/packs/factory/pack.json`
- `cos/archetype/eravos-canvas/templates/tool-sound/preview.svg`
- `cos/archetype/eravos-canvas/templates/tool-sound/tool.json`
- `cos/archetype/eravos-canvas/templates/tool/README.md`
- `cos/archetype/eravos-canvas/templates/tool/__TOOL__.engine.js`
- `cos/archetype/eravos-canvas/templates/tool/__TOOL__.spec`
- `cos/archetype/eravos-canvas/templates/tool/__TOOL__.test.js`
- `cos/archetype/eravos-canvas/templates/tool/__TOOL__.ui.js`
- `cos/archetype/eravos-canvas/templates/tool/packs/factory/pack.json`
- `cos/archetype/eravos-canvas/templates/tool/preview.svg`
- `cos/archetype/eravos-canvas/templates/tool/tool.json`
- `cos/archetype/eravos-canvas/tests/harness.js`
- `cos/archetype/eravos-canvas/tests/run.html`
- `cos/archetype/eravos-canvas/tools/index.js`

</details>

<details>
<summary>`cos/archetype/eravos-domains/` · 26 files</summary>

- `cos/archetype/eravos-domains/.template-tree`
- `cos/archetype/eravos-domains/dataflow/core/dataflow.js`
- `cos/archetype/eravos-domains/dataflow/domain.json`
- `cos/archetype/eravos-domains/dataflow/index.js`
- `cos/archetype/eravos-domains/music/content/bundles/80s/pack.json`
- `cos/archetype/eravos-domains/music/content/bundles/club/pack.json`
- `cos/archetype/eravos-domains/music/content/bundles/edm-pads/pack.json`
- `cos/archetype/eravos-domains/music/content/bundles/index.js`
- `cos/archetype/eravos-domains/music/content/bundles/seq-songs/pack.json`
- `cos/archetype/eravos-domains/music/core/audio-recorder.js`
- `cos/archetype/eravos-domains/music/core/audio.js`
- `cos/archetype/eravos-domains/music/core/codecs.js`
- `cos/archetype/eravos-domains/music/core/master-transport.js`
- `cos/archetype/eravos-domains/music/core/music-theory.js`
- `cos/archetype/eravos-domains/music/core/music.css`
- `cos/archetype/eravos-domains/music/core/plain-errors-music.js`
- `cos/archetype/eravos-domains/music/core/precision-clock.js`
- `cos/archetype/eravos-domains/music/core/preview-music.js`
- `cos/archetype/eravos-domains/music/core/sdk-music.js`
- `cos/archetype/eravos-domains/music/core/ui-music.js`
- `cos/archetype/eravos-domains/music/core/vendor/LAME-LICENSE.txt`
- `cos/archetype/eravos-domains/music/core/vendor/README.txt`
- `cos/archetype/eravos-domains/music/core/vendor/lame.min.js`
- `cos/archetype/eravos-domains/music/core/xen-theory.js`
- `cos/archetype/eravos-domains/music/domain.js`
- `cos/archetype/eravos-domains/music/index.js`

</details>

<details>
<summary>`cos/archetype/eravos-sound-tool/` · 9 files</summary>

- `cos/archetype/eravos-sound-tool/.template-tree`
- `cos/archetype/eravos-sound-tool/README.md`
- `cos/archetype/eravos-sound-tool/__TOOL__.engine.js`
- `cos/archetype/eravos-sound-tool/__TOOL__.spec`
- `cos/archetype/eravos-sound-tool/__TOOL__.test.js`
- `cos/archetype/eravos-sound-tool/__TOOL__.ui.js`
- `cos/archetype/eravos-sound-tool/packs/factory/pack.json`
- `cos/archetype/eravos-sound-tool/preview.svg`
- `cos/archetype/eravos-sound-tool/tool.json`

</details>

<details>
<summary>`cos/archetype/eravos-tool/` · 9 files</summary>

- `cos/archetype/eravos-tool/.template-tree`
- `cos/archetype/eravos-tool/README.md`
- `cos/archetype/eravos-tool/__TOOL__.engine.js`
- `cos/archetype/eravos-tool/__TOOL__.spec`
- `cos/archetype/eravos-tool/__TOOL__.test.js`
- `cos/archetype/eravos-tool/__TOOL__.ui.js`
- `cos/archetype/eravos-tool/packs/factory/pack.json`
- `cos/archetype/eravos-tool/preview.svg`
- `cos/archetype/eravos-tool/tool.json`

</details>

<details>
<summary>`cos/archetype/nexus-system/` · 35 files</summary>

- `cos/archetype/nexus-system/.template-tree`
- `cos/archetype/nexus-system/cli.js`
- `cos/archetype/nexus-system/compartment.json`
- `cos/archetype/nexus-system/config.js`
- `cos/archetype/nexus-system/contracts/handshake.js`
- `cos/archetype/nexus-system/done/.gitkeep`
- `cos/archetype/nexus-system/event-taxonomy.js`
- `cos/archetype/nexus-system/failed/.gitkeep`
- `cos/archetype/nexus-system/input/.gitkeep`
- `cos/archetype/nexus-system/interaction-contract.json`
- `cos/archetype/nexus-system/jaa-store.js`
- `cos/archetype/nexus-system/lib/atomic-write.js`
- `cos/archetype/nexus-system/lib/boundary.js`
- `cos/archetype/nexus-system/lib/bus.js`
- `cos/archetype/nexus-system/lib/commands.js`
- `cos/archetype/nexus-system/lib/core.js`
- `cos/archetype/nexus-system/lib/envelope.js`
- `cos/archetype/nexus-system/lib/handoff.js`
- `cos/archetype/nexus-system/lib/heartbeat.js`
- `cos/archetype/nexus-system/lib/ledger.js`
- `cos/archetype/nexus-system/lib/listener.js`
- `cos/archetype/nexus-system/lib/modules.js`
- `cos/archetype/nexus-system/lib/node-index.js`
- `cos/archetype/nexus-system/lib/system.js`
- `cos/archetype/nexus-system/output/.gitkeep`
- `cos/archetype/nexus-system/package.json`
- `cos/archetype/nexus-system/processing/.gitkeep`
- `cos/archetype/nexus-system/registry-components.js`
- `cos/archetype/nexus-system/schemas/index.js`
- `cos/archetype/nexus-system/server.js`
- `cos/archetype/nexus-system/skeleton.json`
- `cos/archetype/nexus-system/spec/{{slug}}.node-taxonomy.md`
- `cos/archetype/nexus-system/spec/{{slug}}.spec`
- `cos/archetype/nexus-system/tests/skeleton.test.js`
- `cos/archetype/nexus-system/{{slug}}.config.json`

</details>

<details>
<summary>`cos/blueprint/` · 3 files</summary>

- `cos/blueprint/index.js` — blueprint/index.js COMPARTMENT OS — Blueprint Public API (Phase 22, spec §44/§61)
- `cos/blueprint/registry.js` — blueprint/registry.js COMPARTMENT OS — Built-in Blueprint Registry (spec §61.3)
- `cos/blueprint/schema.js` — blueprint/schema.js COMPARTMENT OS — Blueprint Contract Validator

</details>

<details>
<summary>`cos/ci/` · 4 files</summary>

- `cos/ci/ci-keys.smoke.cjs`
- `cos/ci/ci.smoke.cjs` — // 1. validation refuses what it cannot run // 2. a real passing pipeline
- `cos/ci/index.js`
- `cos/ci/keys.js`

</details>

<details>
<summary>`cos/cli/` · 1 file</summary>

- `cos/cli/index.js` — cli/index.js COMPARTMENT OS — cos CLI entry point

</details>

<details>
<summary>`cos/cli/commands/` · 23 files</summary>

- `cos/cli/commands/advance-work-phase.js`
- `cos/cli/commands/archetype.js`
- `cos/cli/commands/blueprint.js`
- `cos/cli/commands/branch.js`
- `cos/cli/commands/compare.js`
- `cos/cli/commands/create.js`
- `cos/cli/commands/destroy.js`
- `cos/cli/commands/events.js`
- `cos/cli/commands/hooks.js`
- `cos/cli/commands/intent.js`
- `cos/cli/commands/list.js`
- `cos/cli/commands/map.js`
- `cos/cli/commands/playground.js`
- `cos/cli/commands/plugin.js`
- `cos/cli/commands/run.js`
- `cos/cli/commands/schema.js`
- `cos/cli/commands/snapshot.js`
- `cos/cli/commands/start.js`
- `cos/cli/commands/status.js`
- `cos/cli/commands/stop.js`
- `cos/cli/commands/vault.js`
- `cos/cli/commands/vaultd.js`
- `cos/cli/commands/vm.js`

</details>

<details>
<summary>`cos/compartment/` · 3 files</summary>

- `cos/compartment/guest-agent.js` — qemu-guest-agent (QGA) client. Status: pre-release · §2026-09-21 for cos/testenv's vm backend.
- `cos/compartment/process-runner.js` — compartment/process-runner.js COMPARTMENT OS — Compartment Process Runner
- `cos/compartment/qemu-runtime.js`

</details>

<details>
<summary>`cos/foundation/` · 14 files</summary>

- `cos/foundation/axioms.js`
- `cos/foundation/cli-detector.js`
- `cos/foundation/command-schema.js`
- `cos/foundation/compiler-enum.js`
- `cos/foundation/constants.js`
- `cos/foundation/enums.js`
- `cos/foundation/event-contracts.js`
- `cos/foundation/file-browser.js`
- `cos/foundation/fs-layer.js`
- `cos/foundation/hook-schema.js`
- `cos/foundation/intent.js`
- `cos/foundation/runtime-enum.js`
- `cos/foundation/snapshot.js`
- `cos/foundation/types.js`

</details>

<details>
<summary>`cos/host/` · 4 files</summary>

- `cos/host/event-bus.js` — host/event-bus.js COMPARTMENT OS — Host Event Bus
- `cos/host/index.js` — host/index.js COMPARTMENT OS — Host Shell Bootstrap
- `cos/host/state-store.js` — host/state-store.js COMPARTMENT OS — State Store
- `cos/host/system-map.js` — host/system-map.js COMPARTMENT OS — Live System Map

</details>

<details>
<summary>`cos/host/gates/` · 7 files</summary>

- `cos/host/gates/archetype.js` — host/gates/archetype.js COMPARTMENT OS — Host Archetype Gates (Phase 21, spec §43/§60)
- `cos/host/gates/blueprint.js` — host/gates/blueprint.js COMPARTMENT OS — Host Blueprint Gates (Phase 22, spec §44/§61)
- `cos/host/gates/compartment.js` — host/gates/compartment.js COMPARTMENT OS — Host Compartment Lifecycle Gates
- `cos/host/gates/playgrounds.js` — host/gates/playgrounds.js COMPARTMENT OS — Host Playground Gates (Phase 30, spec §67)
- `cos/host/gates/plugin.js` — host/gates/plugin.js COMPARTMENT OS — Host Plugin Gates (Phase 29, spec §62-64)
- `cos/host/gates/process.js` — host/gates/process.js COMPARTMENT OS — Process Lifecycle Gates
- `cos/host/gates/vault.js` — host/gates/vault.js COMPARTMENT OS — Host Vault Gates (Phase 28, spec §52)

</details>

<details>
<summary>`cos/nodes/` · 26 files</summary>

- `cos/nodes/archetype.js`
- `cos/nodes/attach.js`
- `cos/nodes/blueprint.js`
- `cos/nodes/branch.js`
- `cos/nodes/compare.js`
- `cos/nodes/create.js`
- `cos/nodes/destroy.js`
- `cos/nodes/events.js`
- `cos/nodes/hooks.js`
- `cos/nodes/index.js`
- `cos/nodes/intent.js`
- `cos/nodes/list.js`
- `cos/nodes/map.js`
- `cos/nodes/nodes.js`
- `cos/nodes/playground.js`
- `cos/nodes/plugin.js`
- `cos/nodes/run.js`
- `cos/nodes/schema.js`
- `cos/nodes/snapshot.js`
- `cos/nodes/start.js`
- `cos/nodes/status.js`
- `cos/nodes/stop.js`
- `cos/nodes/vault.js`
- `cos/nodes/vaultd.js`
- `cos/nodes/verify.js`
- `cos/nodes/vm.js`

</details>

<details>
<summary>`cos/playground/` · 5 files</summary>

- `cos/playground/branch.js` — Compartment Branch Engine Status: pre-release
- `cos/playground/compare.js` — Iteration Comparison Engine Status: pre-release
- `cos/playground/index.js` — Playground barrel
- `cos/playground/llm-lab.js` — NEXUS Lab Status: pre-release
- `cos/playground/sandbox.js` — Compartment Sandbox Runner Status: pre-release

</details>

<details>
<summary>`cos/playgrounds/` · 5 files</summary>

- `cos/playgrounds/cow-fs.js` — playgrounds/cow-fs.js COMPARTMENT OS — Copy-on-Write Filesystem Layer (spec §67)
- `cos/playgrounds/factory.js` — playgrounds/factory.js COMPARTMENT OS — Playground Factory (Phase 30, spec §67)
- `cos/playgrounds/index.js` — playgrounds/index.js COMPARTMENT OS — Playgrounds Public API (Phase 30, spec §67)
- `cos/playgrounds/kernel.js` — playgrounds/kernel.js COMPARTMENT OS — Scoped Nexus Kernel for a Playground (spec §67)
- `cos/playgrounds/network-sim.js` — playgrounds/network-sim.js COMPARTMENT OS — Simulated Network for Playgrounds (spec §67)

</details>

<details>
<summary>`cos/plugin/` · 5 files</summary>

- `cos/plugin/host-api.js`
- `cos/plugin/index.js` — plugin/index.js COMPARTMENT OS — Plugin Public API (Phase 29, spec §62-64)
- `cos/plugin/installer.js` — plugin/installer.js COMPARTMENT OS — Plugin Installer (spec §63 Plugin Manager)
- `cos/plugin/registry.js` — plugin/registry.js COMPARTMENT OS — Built-in Plugin Manifest Registry (spec §62.2 / §62.3)
- `cos/plugin/schema.js` — plugin/schema.js COMPARTMENT OS — Plugin Manifest Validator (spec §62.1)

</details>

<details>
<summary>`cos/runtime/` · 5 files</summary>

- `cos/runtime/preload.cjs`
- `cos/runtime/register.mjs` — // cos/runtime/register.mjs — installs resolve-hook.mjs (node --import). // module.register exists from Node…
- `cos/runtime/resolve-hook.mjs` — // cos/runtime/resolve-hook.mjs — ESM resolution fallback for COS runs. // UUID:…
- `cos/runtime/run.js` — COS's JS runtime: run node code from a branch or a workspace with dependency resolution, isolation and port…
- `cos/runtime/syntax-check.cjs` — parse every file given on stdin (JSON array of absolute paths) WITHOUT running any of it, and print one JSON…

</details>

<details>
<summary>`cos/siso/` · 5 files</summary>

- `cos/siso/Event.js` — §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports Event from warp/core/Event.js instead of this file.…
- `cos/siso/Gate.js` — siso/Gate.js COMPARTMENT OS — SISO Core: Gate
- `cos/siso/Stream.js` — §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports Stream from warp/core/Stream.js instead of this file.…
- `cos/siso/StreamLog.js` — §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports StreamLog from warp/core/StreamLog.js instead of this…
- `cos/siso/index.js`

</details>

<details>
<summary>`cos/spec/` · 9 files</summary>

- `cos/spec/check-catalogue.spec`
- `cos/spec/cos-design-v1.7.0.md`
- `cos/spec/cos.spec`
- `cos/spec/deny-list.spec`
- `cos/spec/lab.spec`
- `cos/spec/language-toolchains.spec`
- `cos/spec/qa-catalog.spec`
- `cos/spec/the-machine.spec`
- `cos/spec/torture-chamber.spec`

</details>

<details>
<summary>`cos/test/` · 1 file</summary>

- `cos/test/test.js` — test/test.js COMPARTMENT OS — Test Suite (Phase 0 + 1 + 2)

</details>

<details>
<summary>`cos/testenv/` · 10 files</summary>

- `cos/testenv/detect.js`
- `cos/testenv/environment.js`
- `cos/testenv/host.js`
- `cos/testenv/index.js`
- `cos/testenv/installer.js`
- `cos/testenv/provision.js`
- `cos/testenv/setup-job.js`
- `cos/testenv/setup-vm.bat`
- `cos/testenv/setup-vm.sh`
- `cos/testenv/tar.js`

</details>

<details>
<summary>`cos/vault/` · 4 files</summary>

- `cos/vault/audit-log.js` — vault/audit-log.js COMPARTMENT OS — Persisted Vault Audit Log (spec §52, hk-va-007)
- `cos/vault/crypto.js` — vault/crypto.js COMPARTMENT OS — Vault Encryption (Phase 28, spec §52)
- `cos/vault/index.js` — vault/index.js COMPARTMENT OS — Vault Public API (Phase 28, spec §52)
- `cos/vault/store.js` — vault/store.js COMPARTMENT OS — Encrypted Vault Store (Phase 28, spec §52)

</details>

<details>
<summary>`cos/vaultd/` · 3 files</summary>

- `cos/vaultd/config.js` — vaultd/config.js COMPARTMENT OS — vaultd Configuration (spec §66)
- `cos/vaultd/daemon.js` — vaultd/daemon.js COMPARTMENT OS — vaultd Daemon Lifecycle (spec §66)
- `cos/vaultd/server.js` — vaultd/server.js COMPARTMENT OS — vaultd HTTP Server (spec §66)

</details>

<details>
<summary>`cos/watchdog/` · 3 files</summary>

- `cos/watchdog/actions.js` — watchdog/actions.js COMPARTMENT OS — Watchdog Anomaly Dispatch
- `cos/watchdog/monitor.js` — watchdog/monitor.js COMPARTMENT OS — Watchdog Resource Monitor
- `cos/watchdog/proc-stats.js` — watchdog/proc-stats.js COMPARTMENT OS — Process Resource Reader (Phase: Watchdog Monitor)

</details>

<details>
<summary>`cos/workspace/` · 2 files</summary>

- `cos/workspace/index.js`
- `cos/workspace/vm-control.js` — a compartment desktop's VM, controlled like VMware: pause, resume, live checkpoints, rewind. §0.39.371 VM1 ·…

</details>

50 release notes name a file of cos: 0.60.157., 0.60.151., 0.60.149., 0.60.148., 0.60.137., 0.60.136., 0.60.134., 0.60.132., 0.60.130., 0.60.126., 0.60.111., 0.60.105., 0.60.104., 0.60.103., 0.60.101., 0.60.96., 0.60.91., 0.60.89., 0.60.88., 0.60.87., 0.60.67., 0.60.33., 0.60.19., 0.60.12., 0.60.6., 0.60.5., 0.60.1., 0.59.6., 0.59.2., 0.39.375., 0.39.371., 0.39.370., 0.39.367., 0.39.363., 0.39.359., 0.39.344., 0.39.330., 0.39.293., 0.39.284., 0.39.282., and 10 older. Each is in the version history below, in his words.

<!-- generated:readme:system:cos:end -->

### core

Everything no kernel owns. Core has no port and no entry: its code runs inside whichever kernel requires it, and its documents and tests describe and check every system. It is by far the largest system by file count, because `lib/` alone is about 525 files, `tests/` about 760, and `docs/` about 400 (the exact counts, file by file, are in core's generated section below). The directories below are its components, one zoom level down; the full map of each is in `core-atlas.md`.

<!-- generated:readme:system:core:start -->
#### core: every module and every file

Core is 2620 files in 48 modules. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/core-atlas.md`.

<details>
<summary>the files at the top of the tree · 18 files</summary>

- `.gitignore`
- `.mcp.json`
- `.npmrc`
- `CHANGES.md`
- `CLAUDE.md`
- `MANIFEST.json`
- `NEXUS-NODE-TAXONOMY-SESSION-README-2026-09-12.md`
- `NODE-TAXONOMY.md`
- `README-PATCH.md`
- `README.md`
- `blueprint-index.json`
- `package-lock.json`
- `package.json`
- `run-all.js`
- `test-new-plugins.js`
- `test-node-index.js`
- `verification-manifest.json`
- `writeback-failures.jsonl`

</details>

<details>
<summary>`architecture-spec/` · 14 files</summary>

- `architecture-spec/registry/api.js`
- `architecture-spec/registry/bundle.js`
- `architecture-spec/registry/component.js`
- `architecture-spec/registry/config.js`
- `architecture-spec/registry/create-atlas.js`
- `architecture-spec/registry/decompose.js`
- `architecture-spec/registry/edit-atlas.js`
- `architecture-spec/registry/friction.js`
- `architecture-spec/registry/hook.js`
- `architecture-spec/registry/lattice.js`
- `architecture-spec/registry/nexus-atlas-aggregate.js`
- `architecture-spec/registry/phases.js`
- `architecture-spec/registry/watcher.js`
- `architecture-spec/registry/wire.js`

</details>

<details>
<summary>`auth/` · 5 files</summary>

- `auth/client.js` — NEXUS Remote Client First-run: generates RSA-2048 keypair, prints public key for admin to register
- `auth/index.js`
- `auth/keys/nexus-private.pem`
- `auth/keys/nexus-public.pem`
- `auth/policy.json`

</details>

<details>
<summary>`cli/` · 27 files</summary>

- `cli/axiom.js`
- `cli/boot-systems.js`
- `cli/cfr-debug.js`
- `cli/clear-idearium.js`
- `cli/compact.js`
- `cli/compartments.js`
- `cli/copilot-window.js`
- `cli/data-audit.js`
- `cli/decompose.js`
- `cli/dedup.js`
- `cli/diagnose.js`
- `cli/find-orphans.js`
- `cli/import-history.js`
- `cli/nexus-cli.js`
- `cli/nexus-movement.js`
- `cli/nexus-repl-descriptors.js`
- `cli/nexus-repl.js`
- `cli/nexus.js`
- `cli/nodes.js`
- `cli/opportunity.js`
- `cli/pressure.js`
- `cli/purge-pollution.js`
- `cli/run-supervised.js`
- `cli/semantic-dedup.js`
- `cli/sentinel.js`
- `cli/session.js`
- `cli/spec/cli.spec`

</details>

<details>
<summary>`cockpit/` · 5 files</summary>

- `cockpit/cli.js` — forge-cli.js — CLI command layer + interaction contract All commands route through SISO bus — same hooks,…
- `cockpit/cockpit.spec`
- `cockpit/core.js` — forge-core.js — SISO bus + JAA browser store + Bayesian trust + SNR PORT: depends on forge-ui (Idearium at…
- `cockpit/live.js` — the live, composed cockpit instance §THE REAL GAP THIS CLOSES — checked before writing: ForgeCLI,
- `cockpit/pipeline.js` — forge-pipeline.js — Pipeline engine + SEAM compiler + condition evaluator Node types (all SEAM-web-aligned):

</details>

<details>
<summary>`contracts/` · 18 files</summary>

- `contracts/SYSTEM-CONTRACTS.js`
- `contracts/drawbridge-baseline.json`
- `contracts/event-contract-baseline.json`
- `contracts/nexus-interaction-contract.js`
- `contracts/nodes/axioms.node.js`
- `contracts/nodes/bottlenecks.node.js`
- `contracts/nodes/causal-physics.node.js`
- `contracts/nodes/deltas.node.js`
- `contracts/nodes/divergent.node.js`
- `contracts/nodes/edges.node.js`
- `contracts/nodes/events.node.js`
- `contracts/nodes/faults.node.js`
- `contracts/nodes/gaps.node.js`
- `contracts/nodes/interaction-contracts.node.js`
- `contracts/nodes/ledgers.node.js`
- `contracts/nodes/self-awareness.node.js`
- `contracts/nodes/systems.node.js`
- `contracts/nodes/verification-contracts.node.js`

</details>

<details>
<summary>`docs/` · 408 files</summary>

- `docs/2026-08-22-session-full-phasemap.spec`
- `docs/2026-08-23-backlog-phasemap.spec`
- `docs/2026-08-27-event-taxonomy-and-brainstorm-phasemap.spec`
- `docs/2026-08-28-definition-of-complete-phasemap.spec`
- `docs/2026-08-28-self-building-pipeline-phasemap.spec`
- `docs/2026-08-30-interaction-contract-context-phasemap.spec`
- `docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec`
- `docs/2026-09-02-agent-mesh-full-map-phasemap.spec`
- `docs/2026-09-02-nexus-vision-master-phasemap.spec`
- `docs/2026-09-02-session-handoff.md`
- `docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec`
- `docs/2026-09-03-session-handoff-2.md`
- `docs/2026-09-05-observability-sovereignty-and-agent-mesh-phasemap.spec`
- `docs/2026-09-11-brainos-agent-orchestration-phasemap.spec`
- `docs/2026-09-11-brainos-external-concept-mapping.spec`
- `docs/2026-09-11-compartment-nodetype-and-reorg-phasemap.spec`
- `docs/2026-09-11-gap-migration-manifest-summary.md`
- `docs/2026-09-11-gap-migration-manifest.json`
- `docs/2026-09-11-sovereign-node-architecture-phasemap.spec`
- `docs/2026-09-13-axiom-5-2-raid-routing-phasemap.spec`
- `docs/2026-09-13-track-b-sovereignty-phasemap.spec`
- `docs/2026-09-15-session-handoff.md`
- `docs/2026-09-15-versionium-cortex-snapshot-migration-decision.md`
- `docs/2026-09-15-versionium-migration-and-mco-a-handoff.md`
- `docs/2026-09-19-agents-clearglass-guardian-idearium-copilot-phasemap.spec`
- `docs/2026-09-19-architect-blueprint-forge-idearium-phasemap.spec`
- `docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec`
- `docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec`
- `docs/2026-09-19-versionium-snapshot-and-ledger-decision.md`
- `docs/2026-09-22-brainos-agent-suite-phasemap.spec`
- `docs/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion-phasemap.spec`
- `docs/2026-09-23-handoff.md`
- `docs/2026-09-25-handoff.md`
- `docs/2026-09-25-spec-engine-manifest-first-phasemap.spec`
- `docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec`
- `docs/2026-09-26-guardian-retry-novelty-and-installs-phasemap.spec`
- `docs/2026-09-26-handoff.md`
- `docs/2026-09-26b-handoff.md`
- `docs/2026-09-26c-handoff.md`
- `docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec`
- `docs/2026-09-27-clearglass-whole-copilot-learning-phasemap.spec`
- `docs/2026-09-27-components-store-and-atlases-phasemap.spec`
- `docs/2026-09-27-idearium-atlas-phasemap.spec`
- `docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec`
- `docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec`
- `docs/2026-09-27-registry-harness-and-stability-phasemap.spec`
- `docs/2026-09-28-graph-build-context-settings-memory-phasemap.spec`
- `docs/2026-09-28-staging-self-heal-phasemap.spec`
- `docs/2026-09-29-build-surface-phasemap.spec`
- `docs/2026-09-29-handoff.md`
- `docs/2026-09-29-nex-node-store-phasemap.spec`
- `docs/2026-09-29-provider-economy-phasemap.spec`
- `docs/2026-09-29-tool-layers-and-pane-memory-phasemap.spec`
- `docs/2026-09-30-idearium-coding-flow-phasemap.spec`
- `docs/2026-10-01-idearium-agent-ready-master-phasemap.spec`
- `docs/2026-10-01-routing-registry-genesis-phasemap.spec`
- `docs/2026-10-01-work-visibility-job-reuse-phasemap.spec`
- `docs/2026-10-02-emerge-field-memory-build-phasemap.spec`
- `docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec`
- `docs/2026-10-02-spatial-void-phasemap.spec`
- `docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec`
- `docs/2026-10-02-workshop-codex-rewind-phasemap.spec`
- `docs/2026-10-05-announce-pulse-repair-phasemap.spec`
- `docs/2026-10-05-build-from-the-spec-phasemap.spec`
- `docs/2026-10-05-cli-data-code-phasemap.spec`
- `docs/2026-10-05-code-tab-and-one-router-phasemap.spec`
- `docs/2026-10-05-cos-machines-phasemap.spec`
- `docs/2026-10-05-failure-reproduction-phasemap.spec`
- `docs/2026-10-05-fiverr-guide-phasemap.spec`
- `docs/2026-10-05-idea-to-spec-workshop-phasemap.spec`
- `docs/2026-10-05-spec-workshop-rebuild-phasemap.spec`
- `docs/2026-10-05-verified-primitives-phasemap.spec`
- `docs/2026-10-07-compartment-control-and-activity-phasemap.spec`
- `docs/2026-10-07-heal-nodes-phasemap.spec`
- `docs/2026-10-07-idearium-one-surface-phasemap.spec`
- `docs/2026-10-07-ollama-recorder-phasemap.spec`
- `docs/2026-10-07-runtime-load-phasemap.spec`
- `docs/2026-10-07-system-expectations-phasemap.spec`
- `docs/2026-10-07-versionium-releases-phasemap.spec`
- `docs/2026-10-09-hardening-pass-phasemap.spec`
- `docs/2026-10-09-one-model-engine-phasemap.spec`
- `docs/2026-10-09-one-roadmap-phasemap.spec`
- `docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec`
- `docs/2026-10-10-design-surface-phasemap.spec`
- `docs/2026-10-10-idearium-access-phasemap.spec`
- `docs/2026-10-10-idearium-solid-phasemap.spec`
- `docs/2026-10-10-open-phases-index.spec`
- `docs/2026-10-10-self-awareness-phasemap.spec`
- `docs/2026-10-10-shape-of-nexus-phasemap.spec`
- `docs/2026-10-10-snapshot-compartments-phasemap.spec`
- `docs/2026-10-12-browser-providers-and-work-phasemap.spec`
- `docs/2026-10-12-request-spine-phasemap.spec`
- `docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec`
- `docs/2026-10-13-identities-tabs-and-automation-phasemap.spec`
- `docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec`
- `docs/2026-10-13-projects-raid-and-gates-phasemap.spec`
- `docs/2026-10-15-automatic-tracking-phasemap.spec`
- `docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec`
- `docs/2026-10-15-clear-glass-network-posture-phasemap.spec`
- `docs/2026-10-15-clear-glass-surfaces-phasemap.spec`
- `docs/2026-10-15-code-tab-run-state-phasemap.spec`
- `docs/2026-10-15-cos-app-phasemap.spec`
- `docs/2026-10-15-fiverr-ledger-phasemap.spec`
- `docs/2026-10-15-gate-held-work-phasemap.spec`
- `docs/2026-10-15-macro-node-recording-phasemap.spec`
- `docs/2026-10-15-one-contract-raid-releases-phasemap.spec`
- `docs/2026-10-15-personal-chat-import-phasemap.spec`
- `docs/2026-10-15-pipeline-focus-phasemap.spec`
- `docs/2026-10-15-spec-foundation-model-phasemap.spec`
- `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec`
- `docs/2026-10-16-agent-work-funnel-phasemap.spec`
- `docs/2026-10-16-canvas-compartments-phasemap.spec`
- `docs/2026-10-16-code-tab-rebuild-phasemap.spec`
- `docs/2026-10-16-cos-console-phasemap.spec`
- `docs/2026-10-16-durable-work-timeline-phasemap.spec`
- `docs/2026-10-16-eravos-removal-phasemap.spec`
- `docs/2026-10-16-google-signin-phasemap.spec`
- `docs/2026-10-16-intent-hat-agent-chain-phasemap.spec`
- `docs/2026-10-16-mobile-compartments-phasemap.spec`
- `docs/2026-10-16-nexus-git-sync-phasemap.spec`
- `docs/2026-10-16-plan-sidebar-phasemap.spec`
- `docs/2026-10-16-proposal-evidence-phasemap.spec`
- `docs/2026-10-16-reject-learn-retry-phasemap.spec`
- `docs/2026-10-16-repo-carve-phasemap.spec`
- `docs/2026-10-16-tls-layer-phasemap.spec`
- `docs/2026-10-17-debugging-product-phasemap.spec`
- `docs/2026-10-17-decisions-by-the-axioms.spec`
- `docs/2026-10-17-failure-mode-report-phasemap.spec`
- `docs/2026-10-17-infrastructure-migration-phasemap.spec`
- `docs/2026-10-17-pieces-not-order-phasemap.spec`
- `docs/2026-10-17-system-drawbridge-phasemap.spec`
- `docs/2026-10-18-debugging-product-phasemap.spec`
- `docs/2026-10-18-gate-memory-phasemap.spec`
- `docs/2026-10-18-gating-census-phasemap.spec`
- `docs/AXIOMS-PHASE-MAP.md`
- `docs/AXIOMS-v1.0.md`
- `docs/AXIOMS-v2.0.md`
- `docs/AXIOMS-v3.0.md`
- `docs/AXIOMS-v3.1.md`
- `docs/CHANGELOG.md`
- `docs/CLAUDE.md`
- `docs/CLEAR-GLASS-PLUGIN-SYSTEM-DESIGN-2026-08-23.md`
- `docs/CLI.md`
- `docs/HANDOFF-0.39.272.md`
- `docs/HANDOFF-0.39.273.md`
- `docs/HANDOFF-2026-09-18-next-steps.md`
- `docs/HANDOFF-2026-09-19-cortex-intelligence-move.md`
- `docs/HANDOFF-2026-09-19-merge-0.39.157.md`
- `docs/HANDOFF-2026-09-19-mesh-first-dispatch.md`
- `docs/HANDOFF-2026-09-19-pulse-and-domain-nodes.md`
- `docs/HANDOFF-2026-09-22.md`
- `docs/HANDOFF-2026-10-06.md`
- `docs/HANDOFF-local-claude-code.md`
- `docs/HANDOFF.md`
- `docs/HISTORY-BOOKSHELF.md`
- `docs/IDEARIUM-PHASE-MAP-v2.md`
- `docs/IDEARIUM-PHASE-MAP.md`
- `docs/INTERACTION_CONTRACTS.md`
- `docs/MAP-2026-08-18-pressure-and-toolkit.md`
- `docs/MAP-2026-08-19-idearium-agent-pipeline.md`
- `docs/META-SYSTEM-AND-SUBSYSTEM-SPECS.md`
- `docs/NEXUS-IMPROVEMENT-MAP.md`
- `docs/NEXUS-INTEGRATION-MAP.md`
- `docs/NEXUS-INTELLIGENCE-LAYER-INDEX.md`
- `docs/NEXUS-LATTICE-COGNITION-ROADMAP-v0_1.md`
- `docs/PHASE-CENSUS-2026-10-15.md`
- `docs/PHASE-MAP-TEMP.md`
- `docs/PROOF-OF-COMPETENCY.md`
- `docs/RFR2-KERNEL-CONTRACT.md`
- `docs/SCHEMA.md`
- `docs/SESSION-CHANGELOG.md`
- `docs/SESSION-PROTOCOL.md`
- `docs/SPEC-REGISTRY.spec`
- `docs/START.md`
- `docs/SYSTEM-MAP.md`
- `docs/UI-DESIGN-PHILOSOPHY.md`
- `docs/WIRES.md`
- `docs/Wiring the intelligence system - Claude.htm`
- `docs/activity-recall.spec`
- `docs/agent-intelligence-loop-phasemap.spec`
- `docs/agent-memory.spec`
- `docs/agent-model-and-user-continuity-phasemap.spec`
- `docs/agent-providers.spec`
- `docs/alk-gl-intelligence-canvas-face.spec`
- `docs/alk-gl-intelligence-canvas.spec`
- `docs/alk-perception.spec`
- `docs/api-dispatch.spec`
- `docs/architect.spec`
- `docs/architecture-spec/architecture-spec.spec`
- `docs/atlases/architect-atlas.md`
- `docs/atlases/architecture-spec-atlas.md`
- `docs/atlases/clear-glass-atlas.md`
- `docs/atlases/components-atlas.md`
- `docs/atlases/copilot-atlas.md`
- `docs/atlases/core-atlas.md`
- `docs/atlases/cortex-atlas.md`
- `docs/atlases/cos-atlas.md`
- `docs/atlases/diagnostic-atlas.md`
- `docs/atlases/guardian-atlas.md`
- `docs/atlases/idearium-atlas.md`
- `docs/atlases/intelligence-atlas.md`
- `docs/atlases/loom-atlas.md`
- `docs/atlases/nexus-atlas.md`
- `docs/atlases/ollama-atlas.md`
- `docs/atlases/orchestrator-atlas.md`
- `docs/atlases/versionium-atlas.md`
- `docs/auth.spec`
- `docs/autonomous-loop.spec`
- `docs/bda.spec`
- `docs/behavioral-boundary.spec`
- `docs/blueprint.spec`
- `docs/brainos-live-control-panel.spec`
- `docs/build-context.spec`
- `docs/builder.spec`
- `docs/case-library.spec`
- `docs/cfr-contract-wire.spec`
- `docs/cfr.spec`
- `docs/chat-logger.spec`
- `docs/clear-glass-toolkit.spec`
- `docs/clear-glass.spec`
- `docs/clearglass-agent-suite-and-cfr-loom-phasemap.spec`
- `docs/clearglass-snowflake-relay.spec`
- `docs/cli-reasoning.spec`
- `docs/cli.spec`
- `docs/cocreation.spec`
- `docs/code-intel.spec`
- `docs/command-index-per-system.spec`
- `docs/component-registry.spec`
- `docs/constitutional-ai.spec`
- `docs/context-builder.spec`
- `docs/contract-queue.spec`
- `docs/contracts.spec`
- `docs/contracts/context-candidate.spec`
- `docs/contracts/context-synthesis-pipeline.spec`
- `docs/contracts/ct0-executable-contracts.contract`
- `docs/contracts/synthesis-contract.spec`
- `docs/copilot-autonomous-phasemap.spec`
- `docs/copilot-awareness-routing-phasemap.spec`
- `docs/copilot-expansion.spec`
- `docs/copilot-full-capability-phasemap.spec`
- `docs/copilot-guardian-cos-expansion-phasemap.spec`
- `docs/copilot-migration-and-new-capabilities.spec`
- `docs/copilot-omniscience-phasemap.spec`
- `docs/copilot-system-programmer.spec`
- `docs/copilot-tool-system.spec`
- `docs/copilot-user-guide.md`
- `docs/copilot.spec`
- `docs/cortex-dual-cognition.spec`
- `docs/cortex-intelligence.spec`
- `docs/cortex-phase-map.md`
- `docs/cortex-schema-registry-phasemap.spec`
- `docs/cortex.spec`
- `docs/cos-debug-report.spec`
- `docs/cos.spec`
- `docs/diagnostic-engines.spec`
- `docs/diagnostic-fixes.spec`
- `docs/diagnostic-phase-map.spec`
- `docs/emerge-copies-divergence.md`
- `docs/emerge.spec`
- `docs/erosmancer.spec`
- `docs/escalation.spec`
- `docs/forge.spec`
- `docs/gap-finder.spec`
- `docs/gap-lifecycle.spec`
- `docs/gemini-multiagent-coding-phasemap.spec`
- `docs/grammar-engine.spec`
- `docs/grammar-fallback.spec`
- `docs/guardian-user-understanding.spec`
- `docs/guardian.spec`
- `docs/guides/tutorial-build-first-spec.guide`
- `docs/handshake-ledger.spec`
- `docs/healer.spec`
- `docs/heartbeat.spec`
- `docs/home-ui.spec`
- `docs/hooks-migration.spec`
- `docs/hooks.spec`
- `docs/hot-module-loader.spec`
- `docs/idearium-agent-pipeline.spec`
- `docs/idearium-creative-repo-overhaul-phasemap.md`
- `docs/idearium-creative-repo-overhaul-phasemap.spec`
- `docs/idearium-creative-repo.spec`
- `docs/idearium-repository-overhaul-phasemap.spec`
- `docs/idearium-templates.spec`
- `docs/idearium.spec`
- `docs/intelligence-bridge.spec`
- `docs/intelligence.spec`
- `docs/jaa-db.spec`
- `docs/jaa-store.spec`
- `docs/language-routing.spec`
- `docs/lib.spec`
- `docs/liminal-space.spec`
- `docs/liminal.spec`
- `docs/living-spec.spec`
- `docs/looking-glass/PHASEMAP.md`
- `docs/looking-glass/README.md`
- `docs/looking-glass/SPEC.md`
- `docs/loom-phasemap-section-phasemap.spec`
- `docs/loom.spec`
- `docs/loop-topology.spec`
- `docs/mcp-claude-desktop-config.json`
- `docs/mcp.spec`
- `docs/meta-layer.spec`
- `docs/movement.spec`
- `docs/mutation-contract.spec`
- `docs/ncp.spec`
- `docs/nexstore-type-catalogue.yaml`
- `docs/nexstore-writers.yaml`
- `docs/nexus-analysis-module-foundation.spec`
- `docs/nexus-architecture-rebuild-phasemap.spec`
- `docs/nexus-cli.spec`
- `docs/nexus-convergence-phasemap.md`
- `docs/nexus-copilot-recall.spec`
- `docs/nexus-decomposition-architecture.spec`
- `docs/nexus-full-audit.md`
- `docs/nexus-improvement-roadmap.spec`
- `docs/nexus-intelligence-system.spec`
- `docs/nexus-live-mind-phasemap.spec`
- `docs/nexus-mind-map.md`
- `docs/nexus-nerve-design-philosophy.spec`
- `docs/nexus-nerve.spec`
- `docs/nexus-observability-tablet-phasemap.spec`
- `docs/nexus-optimization-service.spec`
- `docs/nexus-organisms.spec`
- `docs/nexus-orphan-inventory.md`
- `docs/nexus-project-flow.spec`
- `docs/nexus-query-surface.spec`
- `docs/nexus-relationship-shape.spec`
- `docs/nexus-repo-compartment-and-rich-dispatch-phasemap.spec`
- `docs/nexus-repository-system-build-phasemap.spec`
- `docs/nexus-repository-system.spec`
- `docs/nexus-roadmap-combined.html`
- `docs/nexus-self-build-pipeline-phasemap.spec`
- `docs/nexus-sentinel.spec`
- `docs/nexus-shell-ui.spec`
- `docs/nexus-system-foundation-addendum-v1.1.0.spec`
- `docs/nexus-system-foundation-addendum-v1.2.0.spec`
- `docs/nexus-system-foundation-addendum-v1.3.0.spec`
- `docs/nexus-system-foundation.spec`
- `docs/nexus-system-standardization-phasemap.spec`
- `docs/nexus-tablet.spec`
- `docs/nexus-uri-clearglass-mesh-integration.spec`
- `docs/nexus-worklog-and-phasemap.md`
- `docs/nexus.spec`
- `docs/nexus_complete_phase_map_v5.html`
- `docs/ollama.spec`
- `docs/open-loop-taxonomy.spec`
- `docs/orchestrator.spec`
- `docs/phase_map_11.html`
- `docs/phases-manager.spec`
- `docs/pressure-causality.spec`
- `docs/raid-routing-fidelity-phasemap.spec`
- `docs/raid-simulation-engine.spec`
- `docs/raid-snr-filter.spec`
- `docs/raid-verification-spine-phasemap.spec`
- `docs/raid-warp-verification-phasemap.spec`
- `docs/raid.spec`
- `docs/reflection-engine.spec`
- `docs/registry-consolidation.spec`
- `docs/remote-access.spec`
- `docs/repair-contract-and-loom-hub-phasemap.spec`
- `docs/replay-engine.spec`
- `docs/request-handler.spec`
- `docs/rfr2.spec`
- `docs/rich-atlas-phasemap.spec`
- `docs/roadmap-triage.md`
- `docs/roadmap/2026-08-22-copilot-end-state-vision.md`
- `docs/roadmap/2026-08-22-full-phase-map.md`
- `docs/roadmap/NEXUS-ROADMAP.md`
- `docs/seam-component-registry.spec`
- `docs/seam-queue.spec`
- `docs/seam.spec`
- `docs/self-heal.spec`
- `docs/service.spec`
- `docs/session-2026-08-18-axioms-governed-phasemap.spec`
- `docs/siso.spec`
- `docs/snapshot-trigger-phasemap.spec`
- `docs/snapshot.spec`
- `docs/spatial.spec`
- `docs/spec-compiler.spec`
- `docs/spec-drift.spec`
- `docs/specs/BRIDGE-CAUSAL-SPINE-v1.0.0.md`
- `docs/specs/CAUSAL-NEXUS.spec.md`
- `docs/specs/COBALT-CORE.spec.md`
- `docs/specs/CONTROL-PANEL.spec.md`
- `docs/specs/CORTEX.spec.md`
- `docs/specs/GUARDIAN-COMPLETE.md`
- `docs/specs/GUARDIAN.spec.md`
- `docs/specs/IDEARIUM.spec.md`
- `docs/specs/MODULES.spec.md`
- `docs/specs/NEXUS-SELF.spec.md`
- `docs/specs/ORCHESTRATOR-COS.spec.md`
- `docs/specs/SYSTEM-MAP.spec.md`
- `docs/specs/VERSIONIUM.spec.md`
- `docs/system-architecture.spec`
- `docs/system-nodes.spec`
- `docs/telemetry-codec.spec`
- `docs/tests.spec`
- `docs/the-path.md`
- `docs/topo-kernel.spec`
- `docs/ui-location.spec`
- `docs/ui-registry.spec`
- `docs/ui.spec`
- `docs/universal-block-primitive.spec`
- `docs/user-model.spec`
- `docs/vector-memory.spec`
- `docs/versionium.spec`
- `docs/warp-devkit-addendum-v1.4.1.spec`
- `docs/warp.spec`

</details>

<details>
<summary>`emerge/` · 63 files</summary>

- `emerge/SPEC_COMPILER.spec`
- `emerge/chunk/index.js`
- `emerge/compiler/baseline-tracker.js`
- `emerge/compiler/emit.js`
- `emerge/compiler/gap-field-engine.js`
- `emerge/compiler/index.js`
- `emerge/compiler/invariants-engine.js`
- `emerge/compiler/kg-builder.js`
- `emerge/compiler/pipeline.js`
- `emerge/compiler/reply-engine.js`
- `emerge/compiler/ring-buffer.js`
- `emerge/compiler/t2-gate.js`
- `emerge/compiler/tier-contract.js`
- `emerge/config.js`
- `emerge/core/budget.js`
- `emerge/core/constraint.js`
- `emerge/core/field.js`
- `emerge/core/gap.js`
- `emerge/core/history.js`
- `emerge/core/index.js`
- `emerge/core/lens.js`
- `emerge/core/level.js`
- `emerge/core/observation.js`
- `emerge/core/seed.js`
- `emerge/core/transition.js`
- `emerge/cortex-query/index.js`
- `emerge/cortex-query/writeback.js`
- `emerge/emerge-codegen-v2.js`
- `emerge/emerge-ide.js`
- `emerge/emerge-kernel.js`
- `emerge/emerge.spec`
- `emerge/event-taxonomy.js`
- `emerge/idearium/client.js`
- `emerge/interaction-contract.json`
- `emerge/output/.gitkeep`
- `emerge/package.json`
- `emerge/registry-components.js`
- `emerge/schemas/index.js`
- `emerge/schemas/schema.capability`
- `emerge/schemas/schema.command`
- `emerge/schemas/schema.component`
- `emerge/schemas/schema.hook`
- `emerge/schemas/schema.node`
- `emerge/schemas/schema.system`
- `emerge/schemas/schema.wire`
- `emerge/seams/CORTEX_QUERY_SEAM.js`
- `emerge/siso/Event.js`
- `emerge/siso/Gate.js`
- `emerge/siso/Stream.js`
- `emerge/siso/StreamLog.js`
- `emerge/siso/index.js`
- `emerge/spec/emerge-core.spec`
- `emerge/spec/emerge.node-taxonomy.md`
- `emerge/spec/emerge.spec`
- `emerge/test/gap-field.test.js`
- `emerge/test/invariants.test.js`
- `emerge/test/kg.test.js`
- `emerge/test/propagation.test.js`
- `emerge/test/reply-engine.test.js`
- `emerge/test/tier-contract.test.js`
- `emerge/verify.js`
- `emerge/version.js`
- `emerge/writeback-failures.jsonl`

</details>

<details>
<summary>`emergence/` · 84 files</summary>

- `emergence/ARCHITECTURE.md`
- `emergence/MANIFEST.json`
- `emergence/README.md`
- `emergence/cli.js`
- `emergence/components/associative-lattice/component.spec`
- `emergence/components/associative-lattice/index.js`
- `emergence/components/causal-graph/component.spec`
- `emergence/components/causal-graph/index.js`
- `emergence/components/cfr-creator/component.spec`
- `emergence/components/cfr-creator/index.js`
- `emergence/components/event-ledger/component.spec`
- `emergence/components/event-ledger/index.js`
- `emergence/components/feedback-loop-buffer/README.md`
- `emergence/components/feedback-loop-buffer/api/server.js`
- `emergence/components/feedback-loop-buffer/cli/ring-cli.js`
- `emergence/components/feedback-loop-buffer/component.spec`
- `emergence/components/feedback-loop-buffer/core/RingBufferCore.js`
- `emergence/components/feedback-loop-buffer/core/wire.js`
- `emergence/components/feedback-loop-buffer/diagnostics/health.js`
- `emergence/components/feedback-loop-buffer/index.js`
- `emergence/components/feedback-loop-buffer/package.json`
- `emergence/components/feedback-loop-buffer/persist/EvictionLedger.js`
- `emergence/components/feedback-loop-buffer/persist/FilePersistence.js`
- `emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`
- `emergence/components/feedback-loop-buffer/test/runner.js`
- `emergence/components/idea-store/component.spec`
- `emergence/components/idea-store/index.js`
- `emergence/components/idea-store/test/idea-store.test.js`
- `emergence/components/pattern-engine/component.spec`
- `emergence/components/pattern-engine/index.js`
- `emergence/components/pattern-engine/test/pattern-engine.test.js`
- `emergence/components/rfr2-observer/component.spec`
- `emergence/components/rfr2-observer/index.js`
- `emergence/components/rfr2-observer/kernel-adapter.mjs`
- `emergence/components/rfr2-observer/sentiment-scorer.js`
- `emergence/components/rfr2-observer/test/affective-field.test.js`
- `emergence/components/rfr2-observer/test/oscillatory.test.js`
- `emergence/components/rfr2-observer/test/relational-gaps.test.js`
- `emergence/components/rfr2-observer/test/reversal-negspace.test.js`
- `emergence/components/rfr2-observer/test/sentiment-scorer.test.js`
- `emergence/components/rfr2-observer/test/shadow-etc.test.js`
- `emergence/contracts/LLM_CONTRACT.js`
- `emergence/contracts/test/llm-contract.test.js`
- `emergence/emerge-language.spec`
- `emergence/emergence.spec`
- `emergence/loop.js`
- `emergence/package.json`
- `emergence/schemas/created.schema.json`
- `emergence/schemas/idea-edge.schema.json`
- `emergence/schemas/idea.schema.json`
- `emergence/schemas/ledger-record.schema.json`
- `emergence/schemas/observation.schema.json`
- `emergence/schemas/target.schema.json`
- `emergence/schemas/test/schemas.test.js`
- `emergence/schemas/tick-result.schema.json`
- `emergence/server.js`
- `emergence/test/loop.test.js`
- `emergence/test/server.test.js`
- `emergence/vendor/jaa/FileRefs.js`
- `emergence/vendor/jaa/FileStore.js`
- `emergence/vendor/jaa/Recovery.js`
- `emergence/vendor/jaa/canonicalize.js`
- `emergence/vendor/jaa/test/jaa-port.test.js`
- `emergence/vendor/resonance-v5.1/relational-physics.js`
- `emergence/vendor/rfr2/causality/index.js`
- `emergence/vendor/rfr2/cfr-kernel/index.js`
- `emergence/vendor/rfr2/cfr-kernel/physics.js`
- `emergence/vendor/rfr2/cfr-kernel/render.js`
- `emergence/vendor/rfr2/cfr-kernel/rewind.js`
- `emergence/vendor/rfr2/field/ALKModule.js`
- `emergence/vendor/rfr2/field/relational.js`
- `emergence/vendor/rfr2/lattice/lattice.js`
- `emergence/vendor/rfr2/ledger/index.js`
- `emergence/vendor/rfr2/liminal/assumption.js`
- `emergence/vendor/rfr2/liminal/bus.js`
- `emergence/vendor/rfr2/liminal/contrastive.js`
- `emergence/vendor/rfr2/liminal/core.js`
- `emergence/vendor/rfr2/liminal/existential.js`
- `emergence/vendor/rfr2/liminal/negative-space.js`
- `emergence/vendor/rfr2/liminal/oscillatory.js`
- `emergence/vendor/rfr2/liminal/relational-gaps.js`
- `emergence/vendor/rfr2/liminal/reversal.js`
- `emergence/vendor/rfr2/liminal/shadow.js`
- `emergence/vendor/rfr2/liminal/structural.js`

</details>

<details>
<summary>`erosmancer/` · 27 files</summary>

- `erosmancer/erosmancer-os/CHANGELOG.md`
- `erosmancer/erosmancer-os/MANIFEST.json`
- `erosmancer/erosmancer-os/README.md`
- `erosmancer/erosmancer-os/ROADMAP.md`
- `erosmancer/erosmancer-os/package.json`
- `erosmancer/erosmancer-os/src/adaptive/index.ts`
- `erosmancer/erosmancer-os/src/api/server.ts`
- `erosmancer/erosmancer-os/src/behavior/index.ts`
- `erosmancer/erosmancer-os/src/bridge/index.ts`
- `erosmancer/erosmancer-os/src/dispatcher/index.ts`
- `erosmancer/erosmancer-os/src/hostile/index.ts`
- `erosmancer/erosmancer-os/src/index.ts`
- `erosmancer/erosmancer-os/src/observer/index.ts`
- `erosmancer/erosmancer-os/src/registry/index.ts`
- `erosmancer/erosmancer-os/src/replay/index.ts`
- `erosmancer/erosmancer-os/src/routing/index.ts`
- `erosmancer/erosmancer-os/src/selector/index.ts`
- `erosmancer/erosmancer-os/src/telemetry/index.ts`
- `erosmancer/erosmancer-os/src/types/index.ts`
- `erosmancer/erosmancer-os/tests/adaptive.test.ts`
- `erosmancer/erosmancer-os/tests/google-signin.test.ts`
- `erosmancer/erosmancer-os/tests/hostile.test.ts`
- `erosmancer/erosmancer-os/tests/integration.test.ts`
- `erosmancer/erosmancer-os/tests/replay.test.ts`
- `erosmancer/erosmancer-os/tests/suite.ts`
- `erosmancer/erosmancer-os/tsconfig.json`
- `erosmancer/spec/erosmancer.spec`

</details>

<details>
<summary>`hooks/` · 11 files</summary>

- `hooks/architect.hooks.js`
- `hooks/copilot.hooks.js`
- `hooks/cortex.hooks.js`
- `hooks/emerge.hooks.js`
- `hooks/guardian.hooks.js`
- `hooks/idearium.hooks.js`
- `hooks/index.js`
- `hooks/intelligence.hooks.js`
- `hooks/ollama.hooks.js`
- `hooks/orchestrator.hooks.js`
- `hooks/side-effect-parser.js`

</details>

<details>
<summary>`jaa/` · 2 files</summary>

- `jaa/schema-full.sql`
- `jaa/schema.sql`

</details>

<details>
<summary>`lib/` · 274 files</summary>

- `lib/account-identity-index.js`
- `lib/account-registry.js`
- `lib/agent-build-learning.js`
- `lib/agent-build-loop.js`
- `lib/agent-capability-profile.js`
- `lib/agent-capability.js`
- `lib/agent-chat.js`
- `lib/agent-council.js`
- `lib/agent-facts-hash.js`
- `lib/agent-identity.js`
- `lib/agent-intent-contract.js`
- `lib/agent-memory.js`
- `lib/agent-model.js`
- `lib/agent-notes.js`
- `lib/agent-providers.js`
- `lib/agent-pull.js`
- `lib/agent-reach.js`
- `lib/agent-record.js`
- `lib/agent-router.js`
- `lib/agent-tool-call.js`
- `lib/atlas-generate.js`
- `lib/autonomous-loop.js`
- `lib/autonomous-repair.js`
- `lib/autopilot-intelligence.js`
- `lib/blueprint-index.js`
- `lib/blueprint.js`
- `lib/boot-sequence.js`
- `lib/build-context.js`
- `lib/build-paths.js`
- `lib/build-pipeline.js`
- `lib/build-verify.js`
- `lib/bus-subscriptions.js`
- `lib/canvas-compartments.js`
- `lib/capability-registry.js`
- `lib/capability-spec.js`
- `lib/case-library.js`
- `lib/cg-learning.js`
- `lib/chains.js`
- `lib/change-record.js`
- `lib/charter.js`
- `lib/chat-crawl-plan.js`
- `lib/chat-crawl-settings.js`
- `lib/chat-index.js`
- `lib/chat-logger.js`
- `lib/check-catalogue.js`
- `lib/chunk-build-orchestrator.js`
- `lib/chunk-glyph.js`
- `lib/chunk-service.js`
- `lib/claude-code-backend.js`
- `lib/clear-glass-stream-bridge.js`
- `lib/cli-map.js`
- `lib/cli-reasoning.js`
- `lib/code-edit.js`
- `lib/command-builder.js`
- `lib/compartment-dom-ledger.js`
- `lib/compartment-engine.js`
- `lib/component-boundary-check.js`
- `lib/component-exec-test.js`
- `lib/component-ledger.js`
- `lib/component-registry.js`
- `lib/component-store.js`
- `lib/config-governance.js`
- `lib/connections.js`
- `lib/consent.js`
- `lib/constant-autonomy.js`
- `lib/constitutional-ai.js`
- `lib/consumer-registry.js`
- `lib/context-atlas.js`
- `lib/context-builder.js`
- `lib/context-prereqs.js`
- `lib/context-sources.js`
- `lib/context-stream.js`
- `lib/contract-queue.js`
- `lib/contract-registry-writer.js`
- `lib/contract-repo-provision.js`
- `lib/cortex-write.js`
- `lib/cos-bridge.js`
- `lib/cos-debug-report.js`
- `lib/cos-remote.js`
- `lib/cos-run.js`
- `lib/diagnostic-causal.js`
- `lib/diagnostic-engines.js`
- `lib/diagnostic-report.js`
- `lib/draft-review.js`
- `lib/drawbridge-registry.js`
- `lib/dynamic-project-parser.js`
- `lib/edge-cases.js`
- `lib/emergence.js`
- `lib/end-state.js`
- `lib/engine-ledger.js`
- `lib/error-log.js`
- `lib/ess.js`
- `lib/event-contract-check.js`
- `lib/event-taxonomy-pattern.js`
- `lib/event-types.js`
- `lib/execution-pipeline.js`
- `lib/expectation-tests.js`
- `lib/extract-code.js`
- `lib/failure-post.js`
- `lib/fault-log.js`
- `lib/file-integrity.js`
- `lib/file-tree-plan.js`
- `lib/flight-data.js`
- `lib/fs-tree.js`
- `lib/gap-field.js`
- `lib/gap-priority.js`
- `lib/gap-relay.js`
- `lib/gate-context.js`
- `lib/gig-ledger-listener.js`
- `lib/gig-ledger.js`
- `lib/grammar-engine.js`
- `lib/hat-forge.js`
- `lib/hat-seed-ollama-personalities.js`
- `lib/hat-seed.js`
- `lib/heartbeat.js`
- `lib/history-import-job.js`
- `lib/hook-registry.js`
- `lib/hook-sync-from-component-registry.js`
- `lib/ico.js`
- `lib/idea-provenance.js`
- `lib/import-checks.js`
- `lib/intake.js`
- `lib/integrity-revert.js`
- `lib/intent-classifier.js`
- `lib/intent-hat-router.js`
- `lib/introspect.js`
- `lib/jaa-store.js`
- `lib/languages.js`
- `lib/lean-mode.js`
- `lib/ledger-sse.js`
- `lib/ledger-store.js`
- `lib/ledger-tail.js`
- `lib/ledger-writer.js`
- `lib/lenses.js`
- `lib/line-edit.js`
- `lib/listener-commands.js`
- `lib/local-vector-index.js`
- `lib/loom-map.js`
- `lib/loop-topology.js`
- `lib/manifest.js`
- `lib/micro-http.js`
- `lib/migrate-ledger-per-system.js`
- `lib/model-door.js`
- `lib/movement.js`
- `lib/nano-ws.js`
- `lib/nerve-gap-bridge.js`
- `lib/nerve-ollama-bridge.js`
- `lib/nexus-cli-interface.js`
- `lib/nexus-client.js`
- `lib/nexus-config.js`
- `lib/nexus-expansion-boot.js`
- `lib/nexus-read.js`
- `lib/nexus-releases.js`
- `lib/nexus-uri.js`
- `lib/nexus-wake-events.js`
- `lib/node-edges.js`
- `lib/node-export.js`
- `lib/node-index-watcher.js`
- `lib/node-index.js`
- `lib/node-ledger.js`
- `lib/node-registry.js`
- `lib/node-schemas.js`
- `lib/ollama-activity.js`
- `lib/ollama-check.js`
- `lib/open-loop-taxonomy.js`
- `lib/open-loop-taxonomy.patch.js`
- `lib/options.js`
- `lib/parallel-dispatch.js`
- `lib/pattern-leverage.js`
- `lib/phase-cost.js`
- `lib/phase-deps-gate.js`
- `lib/phase-faults.js`
- `lib/phase-files.js`
- `lib/phase-graph.js`
- `lib/phase-map-auto.js`
- `lib/phase-plan.js`
- `lib/pipeline-routing.js`
- `lib/plan-learning.js`
- `lib/pressure-window.js`
- `lib/prevention.js`
- `lib/project-compartment.js`
- `lib/project-container.js`
- `lib/project-decompose.js`
- `lib/project-import.config.js`
- `lib/proof-overlay.js`
- `lib/proposal-evidence.js`
- `lib/queue.js`
- `lib/readme-generate.js`
- `lib/reasoning-route.js`
- `lib/reflection.js`
- `lib/registry-harness.js`
- `lib/registry-plan.js`
- `lib/relational-context.js`
- `lib/release-notes.js`
- `lib/release-version.js`
- `lib/replay-engine.js`
- `lib/reply-continuation.js`
- `lib/reply-kind.js`
- `lib/repo-activity.js`
- `lib/repo-agent-node.js`
- `lib/repo-agent.js`
- `lib/repo-carve.js`
- `lib/repo-context.js`
- `lib/repo-expand.js`
- `lib/repo-git.js`
- `lib/repo-hat-memory.js`
- `lib/repo-hat.js`
- `lib/repo-hat.smoke.cjs`
- `lib/repo-history.js`
- `lib/repo-inject.js`
- `lib/repo-notes.js`
- `lib/repo-procedures.js`
- `lib/repo-prompt-blocks.js`
- `lib/repo-prompt-blocks.previous.json`
- `lib/repo-releases.js`
- `lib/repo-run-state.js`
- `lib/repo-run.js`
- `lib/repo-versions.js`
- `lib/require-graph.js`
- `lib/resource-monitor.js`
- `lib/rfr2-bridge.js`
- `lib/roundtable.js`
- `lib/route-contract-check.js`
- `lib/route-eligibility.js`
- `lib/routing-config.js`
- `lib/run-ready.js`
- `lib/run-state.js`
- `lib/run-watch.js`
- `lib/safe-apply.js`
- `lib/scheduler.js`
- `lib/schema-registry.js`
- `lib/self-build-loop.js`
- `lib/self-register-remote.js`
- `lib/self-register.js`
- `lib/semantic-dedup.js`
- `lib/semantic-variant.js`
- `lib/shadow-space.js`
- `lib/shadow.js`
- `lib/sigma-gate.js`
- `lib/sigma-roles.js`
- `lib/spec-census.js`
- `lib/spec-collect.js`
- `lib/spec-digest.js`
- `lib/spec-document.js`
- `lib/spec-from-markdown.js`
- `lib/spec-library.js`
- `lib/step-gate.js`
- `lib/stream-digest.js`
- `lib/stub-scanner.js`
- `lib/system-boundary.js`
- `lib/system-check.js`
- `lib/system-control.js`
- `lib/system-manifest.js`
- `lib/system-nodes.js`
- `lib/system-registry.js`
- `lib/system-shape.js`
- `lib/system-store.js`
- `lib/test-first.js`
- `lib/test-map.js`
- `lib/test-sandbox.js`
- `lib/tool-config.js`
- `lib/tool-forge.js`
- `lib/tool-index.js`
- `lib/triggers.js`
- `lib/vector-memory.js`
- `lib/version.js`
- `lib/warp-bus.js`
- `lib/warp-rung.js`
- `lib/work-funnel.js`
- `lib/work-journal.js`
- `lib/work-queue.js`
- `lib/zip-ingest.js`
- `lib/zip-writer.js`
- `lib/zip.js`

</details>

<details>
<summary>`lib/activity-log/` · 2 files</summary>

- `lib/activity-log/compartment.js`
- `lib/activity-log/index.js` — per-system activity + error logging into cortex James: "a log for each system, a full log for activity to…

</details>

<details>
<summary>`lib/agent-system/` · 2 files</summary>

- `lib/agent-system/contracts.js`
- `lib/agent-system/submit.js` — an agent's output → a file matching the output contract → RAID for testing → integration decision.

</details>

<details>
<summary>`lib/agent-tools/` · 116 files</summary>

- `lib/agent-tools/generate-agent-nodes.js`
- `lib/agent-tools/generate-tool-nodes.js`
- `lib/agent-tools/index.js`
- `lib/agent-tools/naming.js`
- `lib/agent-tools/tool-call-listener.js`
- `lib/agent-tools/tool-catalog.js`
- `lib/agent-tools/tool-guide.js`
- `lib/agent-tools/tool-root.js`
- `lib/agent-tools/tools/accounts/account-manage.js`
- `lib/agent-tools/tools/agent-mesh/route.js`
- `lib/agent-tools/tools/autofill/autofill-manage.js`
- `lib/agent-tools/tools/bookmarks/bookmarks-manage.js`
- `lib/agent-tools/tools/browser/browser-action.js`
- `lib/agent-tools/tools/clear-glass/automation.js`
- `lib/agent-tools/tools/clear-glass/browser-automation.js`
- `lib/agent-tools/tools/clear-glass/browser.js`
- `lib/agent-tools/tools/clear-glass/command-index.js`
- `lib/agent-tools/tools/clear-glass/dom-archaeology.js`
- `lib/agent-tools/tools/clear-glass/learned.js`
- `lib/agent-tools/tools/clear-glass/macro.js`
- `lib/agent-tools/tools/clear-glass/net.js`
- `lib/agent-tools/tools/clear-glass/provider-deploy.js`
- `lib/agent-tools/tools/clear-glass/search-engine.js`
- `lib/agent-tools/tools/clear-glass/stream-bridge.js`
- `lib/agent-tools/tools/clear-glass/tab-visibility.js`
- `lib/agent-tools/tools/clear-glass/userscripts.js`
- `lib/agent-tools/tools/coordination/agent-capability.js`
- `lib/agent-tools/tools/coordination/agent-chat.js`
- `lib/agent-tools/tools/coordination/agent-council.js`
- `lib/agent-tools/tools/coordination/agent-notes.js`
- `lib/agent-tools/tools/coordination/capability-tools.js`
- `lib/agent-tools/tools/coordination/framework-builder.js`
- `lib/agent-tools/tools/coordination/intelligence-query.js`
- `lib/agent-tools/tools/coordination/nexus-wake-events.js`
- `lib/agent-tools/tools/coordination/parallel-dispatch.js`
- `lib/agent-tools/tools/coordination/roundtable.js`
- `lib/agent-tools/tools/cortex/node-tag.js`
- `lib/agent-tools/tools/diagnostic/diagnose.js`
- `lib/agent-tools/tools/diagnostic/loom-scan.js`
- `lib/agent-tools/tools/diagnostic/mock-data-finder.js`
- `lib/agent-tools/tools/diagnostic/nexus-heal.js`
- `lib/agent-tools/tools/diagnostic/resource-monitor.js`
- `lib/agent-tools/tools/diagnostic/stub-finder.js`
- `lib/agent-tools/tools/diagnostic/system-priority.js`
- `lib/agent-tools/tools/execution/call-system.js`
- `lib/agent-tools/tools/execution/dedup-table.js`
- `lib/agent-tools/tools/execution/delete-file.js`
- `lib/agent-tools/tools/execution/emergence.js`
- `lib/agent-tools/tools/execution/forge-tool.js`
- `lib/agent-tools/tools/execution/move-data.js`
- `lib/agent-tools/tools/execution/run-chain.js`
- `lib/agent-tools/tools/execution/run-closed-loop.js`
- `lib/agent-tools/tools/execution/run-command.js`
- `lib/agent-tools/tools/execution/run-pipeline.js`
- `lib/agent-tools/tools/execution/safe-apply.js`
- `lib/agent-tools/tools/faculty/faculty-tools.js`
- `lib/agent-tools/tools/faculty/ui-tools.js`
- `lib/agent-tools/tools/governance/ask-james.js`
- `lib/agent-tools/tools/governance/axiom-manage.js`
- `lib/agent-tools/tools/governance/loom-register.js`
- `lib/agent-tools/tools/governance/propose-idea.js`
- `lib/agent-tools/tools/governance/raid-snr.js`
- `lib/agent-tools/tools/governance/register-trigger.js`
- `lib/agent-tools/tools/governance/schedule-task.js`
- `lib/agent-tools/tools/governance/spec-wizard.js`
- `lib/agent-tools/tools/governance/tool-config.js`
- `lib/agent-tools/tools/governance/versionium-commit.js`
- `lib/agent-tools/tools/guardian/build.js`
- `lib/agent-tools/tools/guardian/dispatch.js`
- `lib/agent-tools/tools/history/history-manage.js`
- `lib/agent-tools/tools/idearium/code.js`
- `lib/agent-tools/tools/idearium/repo-chunks.js`
- `lib/agent-tools/tools/identity/copilot-identity.js`
- `lib/agent-tools/tools/identity/hat-forge.js`
- `lib/agent-tools/tools/identity/intent-hat.js`
- `lib/agent-tools/tools/identity/switch-agent.js`
- `lib/agent-tools/tools/loom/harness.js`
- `lib/agent-tools/tools/mesh/agent-mesh-route.js`
- `lib/agent-tools/tools/ncp/status.js`
- `lib/agent-tools/tools/nexus/command.js`
- `lib/agent-tools/tools/nexus/tool-layers.js`
- `lib/agent-tools/tools/ollama/generate.js`
- `lib/agent-tools/tools/opportunity/opportunity.js`
- `lib/agent-tools/tools/query/agent-chat-search.js`
- `lib/agent-tools/tools/query/ambiguity-pull.js`
- `lib/agent-tools/tools/query/compiler-info.js`
- `lib/agent-tools/tools/query/context-atlas.js`
- `lib/agent-tools/tools/query/fault-log.js`
- `lib/agent-tools/tools/query/file-tree.js`
- `lib/agent-tools/tools/query/learn.js`
- `lib/agent-tools/tools/query/meta-query.js`
- `lib/agent-tools/tools/query/nexus-help.js`
- `lib/agent-tools/tools/query/nexus-map.js`
- `lib/agent-tools/tools/query/nexus-status.js`
- `lib/agent-tools/tools/query/notes-todo.js`
- `lib/agent-tools/tools/query/query-intelligence.js`
- `lib/agent-tools/tools/query/query-lenses.js`
- `lib/agent-tools/tools/query/query-movement.js`
- `lib/agent-tools/tools/query/query-recall.js`
- `lib/agent-tools/tools/query/read-file.js`
- `lib/agent-tools/tools/query/search-files.js`
- `lib/agent-tools/tools/sandbox/cos-archetype.js`
- `lib/agent-tools/tools/sandbox/cos-blueprint.js`
- `lib/agent-tools/tools/sandbox/cos-compartment.js`
- `lib/agent-tools/tools/sandbox/cos-playground.js`
- `lib/agent-tools/tools/sandbox/cos-plugin.js`
- `lib/agent-tools/tools/sandbox/cos-simulate.js`
- `lib/agent-tools/tools/sandbox/cos-vault.js`
- `lib/agent-tools/tools/sandbox/rewind-replay.js`
- `lib/agent-tools/tools/sandbox/self-repair.js`
- `lib/agent-tools/tools/site-settings/site-settings-manage.js`
- `lib/agent-tools/tools/system-tools/cortex-restep.js`
- `lib/agent-tools/tools/system-tools/syntax-debug.js`
- `lib/agent-tools/tools/versionium/history.js`
- `lib/agent-tools/tools/versionium/snapshot.js`
- `lib/agent-tools/user-guide-generator.js`

</details>

<details>
<summary>`lib/checks/` · 11 files</summary>

- `lib/checks/ck-230-shadow.js`
- `lib/checks/ck-231-half-states.js`
- `lib/checks/ck-233-deny.js`
- `lib/checks/ck-237-verifiable.js`
- `lib/checks/ck-239-two-ends.js`
- `lib/checks/ck-247-decomposition.js`
- `lib/checks/ck-248-toolchain.js`
- `lib/checks/ck-252-primitive.js`
- `lib/checks/ck-253-versions.js`
- `lib/checks/ck-254-surface.js`
- `lib/checks/ck-255-warp-builds.js`

</details>

<details>
<summary>`lib/chunker/` · 1 file</summary>

- `lib/chunker/index.js`

</details>

<details>
<summary>`lib/code-intel/` · 7 files</summary>

- `lib/code-intel/cards.js` — a card per chunk: what it is, what it uses, what uses it. §0.39.273 CB2. James: "all context is easy to…
- `lib/code-intel/chunker.js` — structural chunk plan for one file. §0.39.273 CB1. planChunks(content, language) -> { chunks, symbols,…
- `lib/code-intel/decls.js` — what a statement-start line declares, per language. §0.39.273 CB1. Applied ONLY to lines ./structure.js…
- `lib/code-intel/index.js` — code intelligence for any repo idearium holds: structural chunks, a card per chunk, ranked search, grep,…
- `lib/code-intel/search.js` — ranked search over every chunk of a repo, and exact grep over its files. §0.39.273 CB3. The 0.39.272 repo…
- `lib/code-intel/structure.js`
- `lib/code-intel/text.js` — the one tokenizer every code-intel index and query uses. §0.39.273 CB3. Identifiers are indexed whole…

</details>

<details>
<summary>`lib/diag-engines/` · 1 file</summary>

- `lib/diag-engines/index.js` — // ── lib/diag-engines/index.js ───────────────────────────────────────────────── // UUID:…

</details>

<details>
<summary>`lib/economy/` · 6 files</summary>

- `lib/economy/gate.js` — may this job go to this provider now? §0.39.281 EC2. decide({ provider, jobType, estTokens }, { policy,…
- `lib/economy/ledger.js` — the economy's usage ledger: the ONE writer of usage records (I3). §0.39.281 EC1. Map:…
- `lib/economy/policy.js` — the provider economy's configuration. §0.39.281 EC0. Map: docs/2026-09-29-provider-economy-phasemap.spec…
- `lib/economy/router.js` — the learning router ("smart economy"). §0.39.281 EC4. James: "Smart economy like dynamically evolving and…
- `lib/economy/store.js` — where the economy's policy lives: /economy/policy.json. §0.39.281 (EC0's persistence). load(providers) → the…
- `lib/economy/tokens.js` — token estimates and the limits learned from what actually happened. §0.39.281 EC3. James: "What about using…

</details>

<details>
<summary>`lib/gemini-toolbox/` · 4 files</summary>

- `lib/gemini-toolbox/agent-contracts.js` — per-agent contracts (§P1 multi-agent) James's structured-injection blueprint: a DISTINCT contract per agent to
- `lib/gemini-toolbox/index.js` — the Gemini coding toolbox (agnostic lib tool) James: "a tool for gemini, to inject a toolbox of tools…
- `lib/gemini-toolbox/injection.js` — the injection tool (§P2 multi-agent) James: "a parsing tool with a tree command for file structure, cortex…
- `lib/gemini-toolbox/routes.js` — HTTP surface for the Gemini toolbox Mounts under /gemini-tool on guardian (port 7820), so the…

</details>

<details>
<summary>`lib/ledger-fanin/` · 2 files</summary>

- `lib/ledger-fanin/boot.js` — wire the nervous system live (§P1 nexus-live-mind) James: "every system and the intelligence system needs to…
- `lib/ledger-fanin/index.js` — the unified event fan-in (agnostic lib tool) James: "every system and the intelligence system needs to read…

</details>

<details>
<summary>`lib/nerve/` · 1 file</summary>

- `lib/nerve/index.js` — NEXUS Nerve System (Phase 1: read layer) Spec: docs/nexus-nerve.spec v0.2.0

</details>

<details>
<summary>`lib/nexstore/` · 5 files</summary>

- `lib/nexstore/census.js`
- `lib/nexstore/log.js` — the append-only log under every node-store type (0.39.300, N1). component_id: nexus.lib.nexstore.log
- `lib/nexstore/record.js` — the record frame of the node store (0.39.300, N1). component_id: nexus.lib.nexstore.record
- `lib/nexstore/types.js` — the type registry and the gate per type (0.39.300, N2). component_id: nexus.lib.nexstore.types
- `lib/nexstore/writers.js` — every place the code persists data, each with its node type or its stated reason (0.39.300). component_id:…

</details>

<details>
<summary>`lib/nexus-self/` · 5 files</summary>

- `lib/nexus-self/apply.js` — the apply gate: the ONLY path from the immutable Nexus repo back into the live tree.
- `lib/nexus-self/branch.js` — editing Nexus from inside Nexus: COS branches of one system's slice of the immutable base.
- `lib/nexus-self/inject-gate.js` — an agent's code on a Nexus repo, through the apply gate on approval. §0.39.266 — James: "really close to…
- `lib/nexus-self/store.js` — the immutable base: content-addressed blobs and append-only snapshots of the live Nexus tree.
- `lib/nexus-self/systems.js` — which files of the live tree belong to which system. §0.39.261 — James: "i want a nexus repo in idearium,…

</details>

<details>
<summary>`lib/node-schemas/` · 65 files</summary>

- `lib/node-schemas/schema.account_identity_index_entry`
- `lib/node-schemas/schema.agent`
- `lib/node-schemas/schema.agent_model`
- `lib/node-schemas/schema.agent_tool`
- `lib/node-schemas/schema.artifact`
- `lib/node-schemas/schema.bep_pattern`
- `lib/node-schemas/schema.capability`
- `lib/node-schemas/schema.chat_log`
- `lib/node-schemas/schema.chunk`
- `lib/node-schemas/schema.command`
- `lib/node-schemas/schema.component`
- `lib/node-schemas/schema.component_projection`
- `lib/node-schemas/schema.constitution_decision`
- `lib/node-schemas/schema.contract`
- `lib/node-schemas/schema.cos`
- `lib/node-schemas/schema.crystal`
- `lib/node-schemas/schema.debug_macro`
- `lib/node-schemas/schema.event`
- `lib/node-schemas/schema.failure_mode`
- `lib/node-schemas/schema.fault`
- `lib/node-schemas/schema.filetree`
- `lib/node-schemas/schema.framework`
- `lib/node-schemas/schema.gap`
- `lib/node-schemas/schema.guardian_listener`
- `lib/node-schemas/schema.hat`
- `lib/node-schemas/schema.health`
- `lib/node-schemas/schema.hook`
- `lib/node-schemas/schema.hook_contract`
- `lib/node-schemas/schema.hypothesis`
- `lib/node-schemas/schema.idea`
- `lib/node-schemas/schema.inject`
- `lib/node-schemas/schema.inject_rule`
- `lib/node-schemas/schema.injection`
- `lib/node-schemas/schema.input`
- `lib/node-schemas/schema.intent`
- `lib/node-schemas/schema.interstitial_space`
- `lib/node-schemas/schema.lattice_edge`
- `lib/node-schemas/schema.ledger`
- `lib/node-schemas/schema.macro`
- `lib/node-schemas/schema.model`
- `lib/node-schemas/schema.node`
- `lib/node-schemas/schema.note`
- `lib/node-schemas/schema.output`
- `lib/node-schemas/schema.pat`
- `lib/node-schemas/schema.pattern_sequence`
- `lib/node-schemas/schema.procedure`
- `lib/node-schemas/schema.provider`
- `lib/node-schemas/schema.raid_contract`
- `lib/node-schemas/schema.relationship_edge`
- `lib/node-schemas/schema.repo_agent`
- `lib/node-schemas/schema.repository`
- `lib/node-schemas/schema.resonance_crystal`
- `lib/node-schemas/schema.response`
- `lib/node-schemas/schema.run`
- `lib/node-schemas/schema.schema`
- `lib/node-schemas/schema.sigma_record`
- `lib/node-schemas/schema.step_gate`
- `lib/node-schemas/schema.synthesis`
- `lib/node-schemas/schema.system`
- `lib/node-schemas/schema.tool`
- `lib/node-schemas/schema.tool_index_entry`
- `lib/node-schemas/schema.toolbox`
- `lib/node-schemas/schema.vector`
- `lib/node-schemas/schema.wire`
- `lib/node-schemas/schema.workflow`

</details>

<details>
<summary>`lib/opportunity/` · 8 files</summary>

- `lib/opportunity/answers.js` — the answer bank: every screening question answered once, reused after. Application forms ask the same forty…
- `lib/opportunity/apply.js` — fill a real application (or a reply box) in Clear Glass, and stop where James decides. THE FLOW (each step a…
- `lib/opportunity/draft.js` — cover letters, proposals, replies, screening answers, follow-ups, gig copy. Same rule as idearium's repo…
- `lib/opportunity/index.js`
- `lib/opportunity/score.js` — how well an opportunity fits the profile, with every point explained. Pure, deterministic, no model. A score…
- `lib/opportunity/sources.js`
- `lib/opportunity/stages.js` — the gated states an opportunity moves through, and who may move it. Pure. The compartment model (QUEUED → ……
- `lib/opportunity/store.js` — the opportunity pipeline's persistence: cortex's JAA store, six tables, one ledger. TABLES (none decays —…

</details>

<details>
<summary>`lib/seam/` · 17 files</summary>

- `lib/seam/adapters/cortex-persist.js`
- `lib/seam/adapters/warp-cascade.js`
- `lib/seam/axioms.js`
- `lib/seam/build-contract.js`
- `lib/seam/chunk-lifecycle.js`
- `lib/seam/cos-seam-parser.js`
- `lib/seam/cross-system-status.js`
- `lib/seam/detector.js`
- `lib/seam/gates.js`
- `lib/seam/index.js`
- `lib/seam/kg-seam-bridge.js`
- `lib/seam/mode-reducer.js`
- `lib/seam/queue.js`
- `lib/seam/spec-bridge/index.js`
- `lib/seam/spec-parser.js`
- `lib/seam/stream.js`
- `lib/seam/watchdog.js`

</details>

<details>
<summary>`lib/spec/` · 1 file</summary>

- `lib/spec/capability-spec.spec` — the first capability spec: CS1 specs itself (0.60.49).

</details>

<details>
<summary>`lib/step-gates/` · 3 files</summary>

- `lib/step-gates/code.write.step_gate`
- `lib/step-gates/reply.accept.step_gate`
- `lib/step-gates/reply.on_task.step_gate`

</details>

<details>
<summary>`lib/uid/` · 5 files</summary>

- `lib/uid/component-map.js` — NEXUS Component Registry Status: pre-release
- `lib/uid/config-schema.js` — Component Config Inheritance Status: pre-release
- `lib/uid/index.js` — NEXUS Structured UID Factory Status: pre-release
- `lib/uid/migrate.js` — NEXUS UID Migration & Conformance Tool Walks every UUID in the system, normalizes it to canonical form,…
- `lib/uid/normalize.js` — NEXUS UID Normalization Layer Status: pre-release

</details>

<details>
<summary>`mesh/` · 14 files</summary>

- `mesh/README.md`
- `mesh/config.js`
- `mesh/daemons.js`
- `mesh/install.js`
- `mesh/lib/canvas-persistence.js`
- `mesh/lib/crypto-engine.js`
- `mesh/lib/ddns.js`
- `mesh/lib/dns-server.js`
- `mesh/lib/firewall.js`
- `mesh/lib/host-rotation.js`
- `mesh/lib/key-manager.js`
- `mesh/lib/mesh-snr-filter.js`
- `mesh/lib/port-registry.js`
- `mesh/lib/reverse-proxy.js`

</details>

<details>
<summary>`meta/` · 4 files</summary>

- `meta/adversary-suite.js` — // ── lib/adversary-suite.js ──────────────────────────────────────────────────── // UUID:…
- `meta/confidence.js` — lib/meta/confidence.js — Weakest-Link Confidence Aggregator Replaces arithmetic-mean confidence aggregation…
- `meta/crystal-lattice.js` — // ── lib/crystal-lattice.js ──────────────────────────────────────────────────── // UUID:…
- `meta/index.js` — NEXUS Meta Layer v2.0.0 Sovereign intelligence modules. Every module here is domain-agnostic —

</details>

<details>
<summary>`nexus/` · 6 files</summary>

- `nexus/autopilot.js` — // ── autopilot.js — NEXUS Process Supervisor ───────────────────────────────── // UUID:…
- `nexus/nexus-bus.js` — Unified Event Multiplex Status: pre-release
- `nexus/nexus-cfr-influence.js` — CFR Field → System Behavior Influence Status: pre-release
- `nexus/nexus-connect.js` — Universal cross-system connection layer Status: pre-release
- `nexus/nexus-knowledge.js` — Knowledge Memory Layer Status: pre-release
- `nexus/nexus-query.js` — Unified Query Layer Status: pre-release

</details>

<details>
<summary>`products/` · 5 files</summary>

- `products/flight-recorder/README.md` — flight-recorder
- `products/flight-recorder/bin/flight-recorder.js` — FR4a: the flight recorder as one command, over any project folder. Product: flight-recorder (part of…
- `products/flight-recorder/lib/project.js` — FR4a: the flight recorder over any project folder, on its own. Product: flight-recorder (part of…
- `products/flight-recorder/lib/versions.js` — FR4a: a project's versions, through Versionium in-process (no server). Product: flight-recorder (part of…
- `products/flight-recorder/product.json`

</details>

<details>
<summary>`remote-desktop/` · 54 files</summary>

- `remote-desktop/README.md`
- `remote-desktop/bridge-electron/assets/icon.png`
- `remote-desktop/bridge-electron/assets/tray-icon.png`
- `remote-desktop/bridge-electron/main.js`
- `remote-desktop/bridge-electron/package.json`
- `remote-desktop/bridge-electron/preload.js`
- `remote-desktop/bridge-os-core/README.md`
- `remote-desktop/bridge-os-core/bridge-IME/index.js`
- `remote-desktop/bridge-os-core/bridge-IME/tests/test-ime-deep.js`
- `remote-desktop/bridge-os-core/bridge-IME/tests/test-ime.js`
- `remote-desktop/bridge-os-core/bridge-contracts/index.js`
- `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts-deep.js`
- `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts.js`
- `remote-desktop/bridge-os-core/bridge-core/bus.js`
- `remote-desktop/bridge-os-core/bridge-core/crypto-engine.js`
- `remote-desktop/bridge-os-core/bridge-core/index.js`
- `remote-desktop/bridge-os-core/bridge-core/registry/index.js`
- `remote-desktop/bridge-os-core/bridge-core/siso/index.js`
- `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`
- `remote-desktop/bridge-os-core/bridge-data/index.js`
- `remote-desktop/bridge-os-core/bridge-data/tests/test-data-deep.js`
- `remote-desktop/bridge-os-core/bridge-data/tests/test-data.js`
- `remote-desktop/bridge-os-core/bridge-heartbeat/index.js`
- `remote-desktop/bridge-os-core/bridge-heartbeat/tests/test-heartbeat-deep.js`
- `remote-desktop/bridge-os-core/bridge-heartbeat/tests/test-heartbeat.js`
- `remote-desktop/bridge-os-core/bridge-identity/identity.js`
- `remote-desktop/bridge-os-core/bridge-identity/index.js`
- `remote-desktop/bridge-os-core/bridge-identity/keystore/index.js`
- `remote-desktop/bridge-os-core/bridge-identity/tests/test-identity-deep.js`
- `remote-desktop/bridge-os-core/bridge-identity/tests/test-identity.js`
- `remote-desktop/bridge-os-core/bridge-node/boot.js`
- `remote-desktop/bridge-os-core/bridge-sngate/index.js`
- `remote-desktop/bridge-os-core/bridge-sngate/tests/test-sngate-deep.js`
- `remote-desktop/bridge-os-core/bridge-sngate/tests/test-sngate.js`
- `remote-desktop/bridge-os-core/index.js`
- `remote-desktop/bridge-os-core/package.json`
- `remote-desktop/contracts.js`
- `remote-desktop/host.html`
- `remote-desktop/input-auth.js`
- `remote-desktop/input-injector.js`
- `remote-desktop/package-lock.json`
- `remote-desktop/package.json`
- `remote-desktop/remote-desktop.spec`
- `remote-desktop/scripts/start-signal-background.bat`
- `remote-desktop/scripts/stop-signal-background.bat`
- `remote-desktop/session-token.js`
- `remote-desktop/signal.js`
- `remote-desktop/tests/test-input-auth.js`
- `remote-desktop/tests/test-input-injector.js`
- `remote-desktop/tests/test-input-pipeline.js`
- `remote-desktop/tests/test-session-token.js`
- `remote-desktop/tests/test-signal-integration.js`
- `remote-desktop/viewer.html`

</details>

<details>
<summary>`scripts/` · 17 files</summary>

- `scripts/analyze-methodless-routes.js`
- `scripts/bench-file-prompt.js`
- `scripts/bench-warp2-vs-siso.mjs`
- `scripts/build-cos-app.js`
- `scripts/bump-version.py`
- `scripts/confirm-build.mjs`
- `scripts/fix-phasemap-yaml.js`
- `scripts/generate-atlases.js`
- `scripts/generate-hooks.js`
- `scripts/mco5-one-real-job.js`
- `scripts/mco6-ic9-kill-and-restart.js`
- `scripts/precommit-check.js`
- `scripts/release-zip.js`
- `scripts/run-verification-manifest.cjs`
- `scripts/update.js`
- `scripts/verify-boot.js`
- `scripts/verify-wires.js`

</details>

<details>
<summary>`seams/` · 1 file</summary>

- `seams/seam-contracts.js` — NEXUS Seam Contract Registry §SEAM: Growth happens at the seam. Every seam is declared here.

</details>

<details>
<summary>`security/` · 2 files</summary>

- `security/e2e-channel.js`
- `security/signaling-envelope.js` — signed envelope for the signaling channel (join/offer/answer/ice), closing remote-desktop.spec phase 6's

</details>

<details>
<summary>`sentinel/` · 1 file</summary>

- `sentinel/interaction-contract.json`

</details>

<details>
<summary>`service/` · 3 files</summary>

- `service/cortex-service.js` — // service/cortex-service.js — Cortex ICO Kernel Service // UUID:…
- `service/guardian-service.js` — // service/guardian-service.js — Guardian ICO Kernel Service // UUID:…
- `service/idearium-service.js` — // service/idearium-service.js — Idearium ICO Kernel Service // UUID:…

</details>

<details>
<summary>`siso/` · 10 files</summary>

- `siso/Event.js`
- `siso/Gate.js`
- `siso/MANIFEST.json`
- `siso/Stream.js`
- `siso/StreamLog.js`
- `siso/core/index.js`
- `siso/core/package.json`
- `siso/index.js`
- `siso/package.json`
- `siso/spec/siso.spec`

</details>

<details>
<summary>`skills/` · 4 files</summary>

- `skills/james-brooks.skill`
- `skills/james-brooks/SKILL.md` — James Brooks — Working Context
- `skills/james-brooks/versions/2026-10-13-as-pasted.md` — James Brooks — Working Context
- `skills/nexus-session-changelog/SKILL.md` — NEXUS Session Changelog Skill

</details>

<details>
<summary>`tablet/` · 2 files</summary>

- `tablet/index.html`
- `tablet/map3d.html`

</details>

<details>
<summary>`tests/` · 766 files</summary>

- `tests/audit-results.json`
- `tests/brutal.test.js`
- `tests/connection-generation-guard.test.js`
- `tests/connection-watchdog.test.js`
- `tests/copilot-bridge-direct-dispatch.test.js`
- `tests/create-job-meta.test.js`
- `tests/diagnostic-fixes.test.js`
- `tests/dispatcher-ping-gate.test.js`
- `tests/dispatcher-stale-socket.test.js`
- `tests/escalation-spam.test.js`
- `tests/fixtures/chatgpt-like.html`
- `tests/full.test.js`
- `tests/helpers/clear-glass-ncp-provider.js`
- `tests/helpers/cos-mini-guest.js`
- `tests/helpers/home-page-source.js`
- `tests/home-ui.test.js`
- `tests/hooks-side-effect-parser.test.js`
- `tests/infra-gap-priority.test.js`
- `tests/integration-results.json`
- `tests/integration.test.js`
- `tests/kernel.test.js`
- `tests/known-gaps.yaml`
- `tests/lib/cos-seam-artifact-staging.test.js`
- `tests/lib/cos-seam-parser.test.js`
- `tests/lib/mco04-cos-bridge-work-phase.test.js`
- `tests/lib/mco04-cos-work-phase.test.js`
- `tests/lib/mco05-loom-changelog.test.js`
- `tests/local-vector-index.test.js`
- `tests/loom-schema-split.test.js`
- `tests/manual-chatgpt-console.glass.js`
- `tests/modules/_purge-test-rows.js`
- `tests/modules/_test-bus-helper.js`
- `tests/modules/admin-server-routes.test.js`
- `tests/modules/adversarial.test.js`
- `tests/modules/adversary-suite.test.js`
- `tests/modules/agent-mesh-drainer.test.js`
- `tests/modules/agent-mesh-hostile.test.js`
- `tests/modules/alk.test.js`
- `tests/modules/architect-spec-builder-theme.test.js`
- `tests/modules/associative-lattice.test.js`
- `tests/modules/automation-engine.test.js`
- `tests/modules/automation-nodes.test.js`
- `tests/modules/automation-settings-ui.test.js`
- `tests/modules/automation-v2.test.js`
- `tests/modules/autonomous-loop.test.js`
- `tests/modules/autopilot-restart-delay.test.js`
- `tests/modules/autopilot-status-server-eaddrinuse.test.js`
- `tests/modules/baseline.test.js`
- `tests/modules/brainos-app-hostile.test.js`
- `tests/modules/brainos-canvas.test.js`
- `tests/modules/brainos-float-cg.test.js`
- `tests/modules/brainos-panel-canvas-integration.test.js`
- `tests/modules/brainos-panel-wiring.test.js`
- `tests/modules/brainos-panel.test.js`
- `tests/modules/canvas-intelligence.test.js`
- `tests/modules/case-library.test.js`
- `tests/modules/cfr-graph-component-distance.test.js`
- `tests/modules/changelog.test.js`
- `tests/modules/clear-glass-accounts.test.js`
- `tests/modules/clear-glass-agent-surface.test.js`
- `tests/modules/clear-glass-autofill.test.js`
- `tests/modules/clear-glass-gig.test.js`
- `tests/modules/clear-glass-hostile-html.test.js`
- `tests/modules/clear-glass-indicators.test.js`
- `tests/modules/clear-glass-library-ui.test.js`
- `tests/modules/clear-glass-plugin-routes.test.js`
- `tests/modules/clear-glass-pressure.test.js`
- `tests/modules/clear-glass-screen-qa-ui.test.js`
- `tests/modules/clear-glass-screen-qa.test.js`
- `tests/modules/cli-copilot-fallback.test.js`
- `tests/modules/closed-loop-tool.test.js`
- `tests/modules/compartment-engine.test.js`
- `tests/modules/constitutional-ai.test.js`
- `tests/modules/contract-intake-dependency-graph.test.js`
- `tests/modules/contract-intake-tangible-file.test.js`
- `tests/modules/copilot-adversarial-consolidation.test.js`
- `tests/modules/copilot-adversarial-wire.test.js`
- `tests/modules/copilot-confidence.test.js`
- `tests/modules/copilot-handshake-dispatch.test.js`
- `tests/modules/copilot-provider-toggle.test.js`
- `tests/modules/copilot.test.js`
- `tests/modules/cortex-sse-broadcast.test.js`
- `tests/modules/crystal-lattice.test.js`
- `tests/modules/diagnose-move-data-tools.test.js`
- `tests/modules/error-capture.test.js`
- `tests/modules/expectation-watcher.test.js`
- `tests/modules/fixtures/hat-seed-proposed-0.60.73.js`
- `tests/modules/flush-redundancy.test.js`
- `tests/modules/grammar-misfire-tracker.test.js`
- `tests/modules/grammar-router-closed-loop.test.js`
- `tests/modules/guardian-cfr-proxy.test.js`
- `tests/modules/guardian-command-index.test.js`
- `tests/modules/guardian-hostile-body-dos.test.js`
- `tests/modules/guardian-hostile-file-read.test.js`
- `tests/modules/guardian-job-persistence.test.js`
- `tests/modules/guardian-picker-answer-roundtrip.test.js`
- `tests/modules/guardian-picker-cookies-wiring.test.js`
- `tests/modules/healer.test.js`
- `tests/modules/idea-provenance.test.js`
- `tests/modules/idearium-agent-routing.test.mjs`
- `tests/modules/idearium-auto-repo-creation.test.js`
- `tests/modules/idearium-brainstorm-assist.test.js`
- `tests/modules/idearium-build-queue-poller.test.js`
- `tests/modules/idearium-chunk-dependencies.test.js`
- `tests/modules/idearium-guardian-dispatch.test.js`
- `tests/modules/idearium-ingest-stability.test.js`
- `tests/modules/idearium-loop.test.js`
- `tests/modules/idearium-materialize-physical.test.js`
- `tests/modules/idearium-phase-compartment-integration.test.js`
- `tests/modules/idearium-phase-compartment.test.mjs`
- `tests/modules/idearium-phase-sync.test.mjs`
- `tests/modules/idearium-repo-watcher.test.mjs`
- `tests/modules/idearium-reuse.test.mjs`
- `tests/modules/idearium-warp-cache.test.mjs`
- `tests/modules/intelligence.test.js`
- `tests/modules/interaction-contract.test.js`
- `tests/modules/intuition-upgrade.test.js`
- `tests/modules/jaa-db.test.js`
- `tests/modules/jaa-store-multiprocess.test.js`
- `tests/modules/ledger-tail.test.js`
- `tests/modules/lenses.test.js`
- `tests/modules/lifeline-fluid-routing.test.js`
- `tests/modules/loom-context-intent.test.js`
- `tests/modules/manifest.test.js`
- `tests/modules/mastermind-fractals.test.js`
- `tests/modules/mastermind-upgrade.test.js`
- `tests/modules/mco01-project-root-unwrap.test.js`
- `tests/modules/mco04-executor-cos-migration.test.js`
- `tests/modules/mco10-compartment-dom-ledger.test.js`
- `tests/modules/mco11-contract-repo-provision.test.js`
- `tests/modules/mco15-component-boundary-check.test.js`
- `tests/modules/mco15-component-exec-test.test.js`
- `tests/modules/mco19-clearglass-dispatch.test.js`
- `tests/modules/mco4-stage-transitions.test.js`
- `tests/modules/mco6-reconcile-on-boot.test.js`
- `tests/modules/movement.test.js`
- `tests/modules/ncp-hostile-payload.test.js`
- `tests/modules/nerve-phase0-phase1.test.js`
- `tests/modules/nexus-cli-switch.test.js`
- `tests/modules/nexus-nerve.test.js`
- `tests/modules/nexus-options-autoboot.test.js`
- `tests/modules/nexus-repl-descriptors.test.js`
- `tests/modules/nexus-seam.test.js`
- `tests/modules/node-index-watcher.test.js`
- `tests/modules/ollama-command-index.test.js`
- `tests/modules/ollama-runtime.test.js`
- `tests/modules/orchestrator-cli.test.js`
- `tests/modules/queue.test.js`
- `tests/modules/quick-notes.test.js`
- `tests/modules/raid-approve-tool.test.js`
- `tests/modules/raid-fitness-real-terms.test.js`
- `tests/modules/raid-retry-escalation.test.js`
- `tests/modules/raid-tunables.test.js`
- `tests/modules/read-time-expiry.test.js`
- `tests/modules/reflection.test.js`
- `tests/modules/relevance.test.js`
- `tests/modules/route-graph.test.js`
- `tests/modules/run-all.js`
- `tests/modules/run-command-tool.test.js`
- `tests/modules/run-pipeline-tool.test.js`
- `tests/modules/snapshot-integrity.test.js`
- `tests/modules/spec-container.test.js`
- `tests/modules/spec-import.test.mjs`
- `tests/modules/spec-list-merge.test.mjs`
- `tests/modules/spec-promote.test.mjs`
- `tests/modules/system-lattice.test.js`
- `tests/modules/test-account-fallback.test.js`
- `tests/modules/test-account-registry.js`
- `tests/modules/test-accounts-picker-cos.test.js`
- `tests/modules/test-ack-injection-fix.js`
- `tests/modules/test-activity-log.js`
- `tests/modules/test-adversarial-causal-wire.js`
- `tests/modules/test-adversarial-sim.js`
- `tests/modules/test-agent-build-learning.js`
- `tests/modules/test-agent-capability.js`
- `tests/modules/test-agent-chat.js`
- `tests/modules/test-agent-context-always.test.js`
- `tests/modules/test-agent-facts.test.js`
- `tests/modules/test-agent-feed.test.js`
- `tests/modules/test-agent-hat-agnostic.test.js`
- `tests/modules/test-agent-index-ready.test.js`
- `tests/modules/test-agent-live.test.js`
- `tests/modules/test-agent-memory.test.js`
- `tests/modules/test-agent-mesh-guardian-coverage.js`
- `tests/modules/test-agent-mesh-view-endpoint.js`
- `tests/modules/test-agent-reach.js`
- `tests/modules/test-agent-record.test.js`
- `tests/modules/test-agent-routing.js`
- `tests/modules/test-agent-tools-and-graph.test.js`
- `tests/modules/test-agent-tools-every-backend.test.js`
- `tests/modules/test-agnostic-lib-tools.js`
- `tests/modules/test-alk-lattice-live.js`
- `tests/modules/test-am1-intent-contract.js`
- `tests/modules/test-ap1-agent-pull.js`
- `tests/modules/test-architect-pulse-migration.js`
- `tests/modules/test-architect.test.js`
- `tests/modules/test-artifact-index-jaa.test.js`
- `tests/modules/test-artifact-namer.js`
- `tests/modules/test-ask-tools-shape.js`
- `tests/modules/test-assist-loop.js`
- `tests/modules/test-autonomous-repair.js`
- `tests/modules/test-autonomy-router.js`
- `tests/modules/test-autopilot-boot-gates.js`
- `tests/modules/test-autopilot-idle.test.js`
- `tests/modules/test-autopilot-intelligence.js`
- `tests/modules/test-autopilot-warp-spine.js`
- `tests/modules/test-b1-synthesize-contract.js`
- `tests/modules/test-back-and-forth.test.js`
- `tests/modules/test-boot-log-fixes.js`
- `tests/modules/test-boot-phases.js`
- `tests/modules/test-brainos-canvas-agent-mesh.js`
- `tests/modules/test-brainos-dynamic-mesh-canvas.js`
- `tests/modules/test-brainos-real-access-path.js`
- `tests/modules/test-brainos-v2-rebuild.js`
- `tests/modules/test-browser-action-screenshot.js`
- `tests/modules/test-build-context.test.js`
- `tests/modules/test-build-from-the-spec.test.js`
- `tests/modules/test-build-paths.test.js`
- `tests/modules/test-build-surface-2.test.js`
- `tests/modules/test-build-surface.api.js`
- `tests/modules/test-build-surface.test.js`
- `tests/modules/test-build-verify.test.js`
- `tests/modules/test-bus-subscriptions.js`
- `tests/modules/test-c0-cfr-collapse-anchor.test.js`
- `tests/modules/test-c1-compound-failure-mode.test.js`
- `tests/modules/test-call-system.js`
- `tests/modules/test-canvas-compartments.test.js`
- `tests/modules/test-capability-extend.js`
- `tests/modules/test-capability-registry.js`
- `tests/modules/test-capability-spec.test.js`
- `tests/modules/test-causal-hygiene.js`
- `tests/modules/test-cfr-field-authority.js`
- `tests/modules/test-cg-accounts-portal-settings.test.js`
- `tests/modules/test-cg-attention-focus.test.js`
- `tests/modules/test-cg-autofill-jobs.test.js`
- `tests/modules/test-cg-bookmark-account-state.test.js`
- `tests/modules/test-cg-command-index.test.js`
- `tests/modules/test-cg-copilot-no-api.test.js`
- `tests/modules/test-cg-copilot-verbs.test.js`
- `tests/modules/test-cg-eros-supervisor.js`
- `tests/modules/test-cg-field.test.js`
- `tests/modules/test-cg-job-intake.test.js`
- `tests/modules/test-cg-listener-decay.test.js`
- `tests/modules/test-cg-selector-assign.test.js`
- `tests/modules/test-cg-settings-ui-files.test.js`
- `tests/modules/test-cg-shortcuts.test.js`
- `tests/modules/test-cg-toolbar-live.test.js`
- `tests/modules/test-chains.js`
- `tests/modules/test-change-record.test.js`
- `tests/modules/test-chat-crawl-plan.test.js`
- `tests/modules/test-chat-crawler.test.js`
- `tests/modules/test-chat-ledger-stream.test.js`
- `tests/modules/test-chat-per-agent.test.js`
- `tests/modules/test-chat-ports.test.js`
- `tests/modules/test-chat-sync-agent-routing.test.js`
- `tests/modules/test-chat-transcripts.test.js`
- `tests/modules/test-chatgpt-scrape-template.test.js`
- `tests/modules/test-check-catalogue.test.js`
- `tests/modules/test-checklist-workset.test.js`
- `tests/modules/test-checks-layer-one.test.js`
- `tests/modules/test-chunk-build-orchestrator.js`
- `tests/modules/test-chunked-phase-build.test.js`
- `tests/modules/test-claude-code-backend.test.js`
- `tests/modules/test-clear-glass-idle-vs-open.js`
- `tests/modules/test-clear-glass-single-instance.js`
- `tests/modules/test-clear-idearium.test.js`
- `tests/modules/test-clearglass-jobs.test.js`
- `tests/modules/test-cli-consolidation.js`
- `tests/modules/test-cli-interface.js`
- `tests/modules/test-cli-route-commands.test.js`
- `tests/modules/test-cm3-commands.test.js`
- `tests/modules/test-code-artifact.js`
- `tests/modules/test-code-dock.test.js`
- `tests/modules/test-code-edit.test.js`
- `tests/modules/test-code-intel.test.js`
- `tests/modules/test-code-repo-wears-original-hat.test.js`
- `tests/modules/test-code-surface-state.test.js`
- `tests/modules/test-code-tab-expand.test.js`
- `tests/modules/test-code-tab-merge.test.js`
- `tests/modules/test-code-tab.test.js`
- `tests/modules/test-code-tools.test.js`
- `tests/modules/test-command-builder.js`
- `tests/modules/test-command-parse-null-guard.test.js`
- `tests/modules/test-compartment-activity-log.test.js`
- `tests/modules/test-compartment-window.test.js`
- `tests/modules/test-component-registry.js`
- `tests/modules/test-component-store.test.js`
- `tests/modules/test-composed-prompt.test.js`
- `tests/modules/test-config-governance.js`
- `tests/modules/test-connections.js`
- `tests/modules/test-constant-autonomy.js`
- `tests/modules/test-consumer-registry.js`
- `tests/modules/test-context-budget.test.js`
- `tests/modules/test-context-prereqs.test.js`
- `tests/modules/test-context-stream.test.js`
- `tests/modules/test-contract-adapters.test.js`
- `tests/modules/test-contract-ct0-self.test.js`
- `tests/modules/test-contract-gates.test.js`
- `tests/modules/test-contract-handshake-paths.js`
- `tests/modules/test-contract-phase-build.test.js`
- `tests/modules/test-contract-queue-hardening.js`
- `tests/modules/test-contract-trace.test.js`
- `tests/modules/test-cookie-vault-ipc-roundtrip.js`
- `tests/modules/test-cookie-vault-jaa.test.js`
- `tests/modules/test-copilot-claude-code.test.js`
- `tests/modules/test-copilot-probe.js`
- `tests/modules/test-copilot-tool-runtime.js`
- `tests/modules/test-copilot-tools-guardian-ncp-mesh.js`
- `tests/modules/test-copilot-window.js`
- `tests/modules/test-copilot-workset.test.js`
- `tests/modules/test-cortex-heartbeat.js`
- `tests/modules/test-cos-app-build.test.js`
- `tests/modules/test-cos-app-runtime.test.js`
- `tests/modules/test-cos-app-self-update.test.js`
- `tests/modules/test-cos-app-shell.test.js`
- `tests/modules/test-cos-app-store.test.js`
- `tests/modules/test-cos-app-switch.test.js`
- `tests/modules/test-cos-app-ui.test.js`
- `tests/modules/test-cos-app-update.test.js`
- `tests/modules/test-cos-compartment-template.test.js`
- `tests/modules/test-cos-mount-idempotent.test.js`
- `tests/modules/test-cos-remote-api.test.js`
- `tests/modules/test-cos-remote.test.js`
- `tests/modules/test-cos-testenv-any-repo.js`
- `tests/modules/test-cos-testenv.js`
- `tests/modules/test-cos-vm-shell.test.js`
- `tests/modules/test-cos-workspace.test.js`
- `tests/modules/test-dangling-hooks-and-idearium-load.test.js`
- `tests/modules/test-decompose.js`
- `tests/modules/test-desktop-activity.test.js`
- `tests/modules/test-desktop-setup-popup.test.js`
- `tests/modules/test-detector-code-endings.test.js`
- `tests/modules/test-diagnostic-heal-path.js`
- `tests/modules/test-diagnostic-sweep.js`
- `tests/modules/test-diagnostics.js`
- `tests/modules/test-dispatcher-deepseek-ncp.js`
- `tests/modules/test-downloads-responses.test.js`
- `tests/modules/test-draft-review.test.js`
- `tests/modules/test-drawbridge-registry.test.js`
- `tests/modules/test-dynamic-tension.js`
- `tests/modules/test-economy-guardian.test.js`
- `tests/modules/test-economy.more.js`
- `tests/modules/test-economy.test.js`
- `tests/modules/test-emerge-core.test.js`
- `tests/modules/test-emerge-direct-compile.js`
- `tests/modules/test-emergence-and-warp-suites.test.js`
- `tests/modules/test-end-state.js`
- `tests/modules/test-eros-telemetry-bounded.test.js`
- `tests/modules/test-eros-workbench.test.js`
- `tests/modules/test-escalation-ladder.test.js`
- `tests/modules/test-escalation.js`
- `tests/modules/test-event-contracts.test.js`
- `tests/modules/test-expectation-tests.test.js`
- `tests/modules/test-extract-code.js`
- `tests/modules/test-faculty-tools.js`
- `tests/modules/test-failure-modes.test.js`
- `tests/modules/test-fault-taxonomy.js`
- `tests/modules/test-field-nerve.test.js`
- `tests/modules/test-file-tree-plan.js`
- `tests/modules/test-file-versions-and-reassign.test.js`
- `tests/modules/test-flight-data.test.js`
- `tests/modules/test-flight-recorder-standalone.test.js`
- `tests/modules/test-gap-field.js`
- `tests/modules/test-gap-finder.js`
- `tests/modules/test-gap-tools.js`
- `tests/modules/test-gate-assess.test.js`
- `tests/modules/test-gate-context.test.js`
- `tests/modules/test-gate-tracking.test.js`
- `tests/modules/test-gate-versioning.test.js`
- `tests/modules/test-gemini-toolbox.js`
- `tests/modules/test-genesis-and-architecture-spec.test.js`
- `tests/modules/test-gig-ledger.test.js`
- `tests/modules/test-gm-shim-sse-streaming.js`
- `tests/modules/test-grammar-engine.js`
- `tests/modules/test-grammar-fallback.js`
- `tests/modules/test-guardian-agent-registry.js`
- `tests/modules/test-guardian-cfr-consolidation.js`
- `tests/modules/test-guardian-data-sovereignty.js`
- `tests/modules/test-guardian-dispatch-ladder.js`
- `tests/modules/test-guardian-field-pick.test.js`
- `tests/modules/test-guardian-job-correlation.js`
- `tests/modules/test-guardian-job-persistence.js`
- `tests/modules/test-guardian-json-routes.test.js`
- `tests/modules/test-guardian-mesh-client.js`
- `tests/modules/test-guardian-raid-feedback.js`
- `tests/modules/test-guardian-replay-retired.test.js`
- `tests/modules/test-guardian-retry-novelty-installs.js`
- `tests/modules/test-guardian-stack-sim.test.js`
- `tests/modules/test-guardian-state-provider.test.js`
- `tests/modules/test-guardian-stream-extraction.test.js`
- `tests/modules/test-guardian-tool-runtime.js`
- `tests/modules/test-guardian-wake.js`
- `tests/modules/test-hardening-pass.test.js`
- `tests/modules/test-hat-forge-cross-process.test.js`
- `tests/modules/test-hat-forge.js`
- `tests/modules/test-health-authority.js`
- `tests/modules/test-history-import-job.test.js`
- `tests/modules/test-home-ui-files.test.js`
- `tests/modules/test-hook-ownership.js`
- `tests/modules/test-ico-ledger-writethrough.js`
- `tests/modules/test-idea-dump.test.js`
- `tests/modules/test-idearium-access.test.js`
- `tests/modules/test-idearium-cjs-under-esm.js`
- `tests/modules/test-idearium-codegen.test.js`
- `tests/modules/test-idearium-solid.test.js`
- `tests/modules/test-idearium-source-files-async.test.js`
- `tests/modules/test-idearium-spec-meta-cache.test.js`
- `tests/modules/test-idearium-theme.test.js`
- `tests/modules/test-import-history.test.js`
- `tests/modules/test-import-pipeline-syntax.js`
- `tests/modules/test-inject-screen.test.js`
- `tests/modules/test-injection-node-type.js`
- `tests/modules/test-intake.js`
- `tests/modules/test-integrity-revert.js`
- `tests/modules/test-intelligence-bridge.js`
- `tests/modules/test-intelligence-causal.js`
- `tests/modules/test-intelligence-core-wired.js`
- `tests/modules/test-intelligence-faculties-move.js`
- `tests/modules/test-intelligence-layer.js`
- `tests/modules/test-intelligence-organs-move.js`
- `tests/modules/test-intent-learning.js`
- `tests/modules/test-introspect.js`
- `tests/modules/test-jaa-deletes-stick.test.js`
- `tests/modules/test-jaa-flush-lock.js`
- `tests/modules/test-jaa-selective-load.js`
- `tests/modules/test-language-checks.test.js`
- `tests/modules/test-languages.js`
- `tests/modules/test-lean-mode.test.js`
- `tests/modules/test-lean-quiet.test.js`
- `tests/modules/test-ledger-fanin.js`
- `tests/modules/test-ledger-schema.js`
- `tests/modules/test-ledger-sse.js`
- `tests/modules/test-lifeline-ask.js`
- `tests/modules/test-lifeline-contracts.js`
- `tests/modules/test-lifeline-fault-logging.js`
- `tests/modules/test-lifeline-guardian-timeout.test.js`
- `tests/modules/test-lifeline-ollama-dispatch.test.js`
- `tests/modules/test-liminal-space.js`
- `tests/modules/test-listener-commands.test.js`
- `tests/modules/test-live-everywhere.test.js`
- `tests/modules/test-live-recording.test.js`
- `tests/modules/test-live-stream-and-gates.test.js`
- `tests/modules/test-loom-map.js`
- `tests/modules/test-loom-phasemap-status.js`
- `tests/modules/test-loom-phasemap.js`
- `tests/modules/test-macro.js`
- `tests/modules/test-manifest-phase1.test.mjs`
- `tests/modules/test-map3d.js`
- `tests/modules/test-mco-a-file-delta-schema.js`
- `tests/modules/test-mco2-verify-deepening.js`
- `tests/modules/test-mco3-repo-snapshot.js`
- `tests/modules/test-mco3-versionium-tab.js`
- `tests/modules/test-mcob-file-versioning.js`
- `tests/modules/test-mcob-snapshot-restore.js`
- `tests/modules/test-mcoc-import-baseline.js`
- `tests/modules/test-mcof-config-gate.js`
- `tests/modules/test-mesh-agent-page.js`
- `tests/modules/test-mesh-chat-reload.test.js`
- `tests/modules/test-mesh-dom-transport.js`
- `tests/modules/test-moce-roadmap-ui.js`
- `tests/modules/test-moce-roadmap.js`
- `tests/modules/test-mock-data-finder.js`
- `tests/modules/test-model-door.test.js`
- `tests/modules/test-module-builder-resolve.js`
- `tests/modules/test-movement-map.js`
- `tests/modules/test-mutation-contract.js`
- `tests/modules/test-native-toast.js`
- `tests/modules/test-ncp-half-open.test.js`
- `tests/modules/test-ncp-handler-sr3.js`
- `tests/modules/test-nerve-gap-bridge.js`
- `tests/modules/test-net-routes.test.js`
- `tests/modules/test-network-infra-retired.js`
- `tests/modules/test-nex-system-state.test.js`
- `tests/modules/test-nexstore-census.test.js`
- `tests/modules/test-nexstore-log.test.js`
- `tests/modules/test-nexstore-types.test.js`
- `tests/modules/test-nexstore-writers.test.js`
- `tests/modules/test-nexus-ask.test.js`
- `tests/modules/test-nexus-atlas-and-glass.test.js`
- `tests/modules/test-nexus-atlas-refs.test.js`
- `tests/modules/test-nexus-chat.test.js`
- `tests/modules/test-nexus-command-tool.test.js`
- `tests/modules/test-nexus-inject-approval.test.js`
- `tests/modules/test-nexus-intelligence-section.js`
- `tests/modules/test-nexus-mcp.test.js`
- `tests/modules/test-nexus-read.test.js`
- `tests/modules/test-nexus-self-and-cos-run.test.js`
- `tests/modules/test-nexus-self-incremental.test.js`
- `tests/modules/test-nexus-self-visible.test.js`
- `tests/modules/test-nexus-specs-and-ideas-cleanup.test.js`
- `tests/modules/test-nexus-wake.js`
- `tests/modules/test-no-compartment-label.test.js`
- `tests/modules/test-node-export.js`
- `tests/modules/test-node-lattice.test.js`
- `tests/modules/test-node-registry-system.test.js`
- `tests/modules/test-node-schemas.js`
- `tests/modules/test-observability-map.js`
- `tests/modules/test-ollama-activity.test.js`
- `tests/modules/test-ollama-check.test.js`
- `tests/modules/test-ollama-tape.test.js`
- `tests/modules/test-one-idearium-phases-nodes.test.js`
- `tests/modules/test-one-tab-e2e.test.js`
- `tests/modules/test-opportunity.test.js`
- `tests/modules/test-options.test.js`
- `tests/modules/test-orion.js`
- `tests/modules/test-p1-agent-contracts.js`
- `tests/modules/test-p1-fanin-live.js`
- `tests/modules/test-p2-injection.js`
- `tests/modules/test-p2-snapshot-sigma.js`
- `tests/modules/test-p3-diagnostic-causal.js`
- `tests/modules/test-p4-awareness.js`
- `tests/modules/test-p4-capabilities.js`
- `tests/modules/test-p5-grammar-router.js`
- `tests/modules/test-p5p6-self-model.js`
- `tests/modules/test-person-model.js`
- `tests/modules/test-pf1-stalls.test.js`
- `tests/modules/test-pf3-append-store.test.js`
- `tests/modules/test-pf5-bounded-tables.test.js`
- `tests/modules/test-phase-actually-builds.test.js`
- `tests/modules/test-phase-cost.test.js`
- `tests/modules/test-phase-deps-gate.test.js`
- `tests/modules/test-phase-graph.test.js`
- `tests/modules/test-phase-map-auto.test.js`
- `tests/modules/test-phase-mapping.test.js`
- `tests/modules/test-phase-proof.test.js`
- `tests/modules/test-phase-specs-tag.test.js`
- `tests/modules/test-phasemap-diagnosis-facts.test.js`
- `tests/modules/test-phases-tab.test.js`
- `tests/modules/test-pipeline-routing.test.js`
- `tests/modules/test-plan-code-run-attention.test.js`
- `tests/modules/test-plan-lands.test.js`
- `tests/modules/test-plan-pieces.test.js`
- `tests/modules/test-plan-sidebar.test.js`
- `tests/modules/test-pressure-window.js`
- `tests/modules/test-prevention.test.js`
- `tests/modules/test-profile-tabs.test.js`
- `tests/modules/test-project-decompose.test.js`
- `tests/modules/test-projects-overview.test.js`
- `tests/modules/test-proof-run.test.js`
- `tests/modules/test-proposal-evidence.test.js`
- `tests/modules/test-prove-loop.test.js`
- `tests/modules/test-provider-host-load.test.js`
- `tests/modules/test-provider-host-one-tab.test.js`
- `tests/modules/test-provider-host-respawn.js`
- `tests/modules/test-provider-lists.test.js`
- `tests/modules/test-qa2-real-run.test.js`
- `tests/modules/test-raid-agent-nodes.js`
- `tests/modules/test-raid-compare-gate.js`
- `tests/modules/test-raid-constitution-gate.js`
- `tests/modules/test-raid-decision-record.js`
- `tests/modules/test-raid-drift-score.js`
- `tests/modules/test-raid-isolation-verify.js`
- `tests/modules/test-raid-officiator.js`
- `tests/modules/test-raid-orion-wiring.js`
- `tests/modules/test-raid-processnext-am1-gate.js`
- `tests/modules/test-raid-rewind.js`
- `tests/modules/test-raid-router.js`
- `tests/modules/test-raid-runs-contract.test.js`
- `tests/modules/test-raid-verify-fused.js`
- `tests/modules/test-readme-atlas.test.js`
- `tests/modules/test-readme-generate.test.js`
- `tests/modules/test-reasoning-route.test.js`
- `tests/modules/test-recursive-split.test.js`
- `tests/modules/test-registration-shape.js`
- `tests/modules/test-registry-drives-build.test.js`
- `tests/modules/test-registry-harness.test.js`
- `tests/modules/test-reject-learn-retry.test.js`
- `tests/modules/test-relational-context.js`
- `tests/modules/test-relational-field.js`
- `tests/modules/test-release-deliver.test.js`
- `tests/modules/test-release-notes.test.js`
- `tests/modules/test-release-version.test.js`
- `tests/modules/test-releases.test.js`
- `tests/modules/test-relevance-classify.js`
- `tests/modules/test-repair-on-prompt.js`
- `tests/modules/test-reply-continuation.test.js`
- `tests/modules/test-reply-not-found-attention.test.js`
- `tests/modules/test-repo-activity.test.js`
- `tests/modules/test-repo-agent-late.test.js`
- `tests/modules/test-repo-agent-learn.js`
- `tests/modules/test-repo-agent-node.js`
- `tests/modules/test-repo-agent-provider.js`
- `tests/modules/test-repo-agent.js`
- `tests/modules/test-repo-architecture.test.js`
- `tests/modules/test-repo-carve.test.js`
- `tests/modules/test-repo-chunks-tool.js`
- `tests/modules/test-repo-context.js`
- `tests/modules/test-repo-expand.test.js`
- `tests/modules/test-repo-git.test.js`
- `tests/modules/test-repo-graph.js`
- `tests/modules/test-repo-hat-coder-link.js`
- `tests/modules/test-repo-hat-memory.js`
- `tests/modules/test-repo-history.test.js`
- `tests/modules/test-repo-inject.js`
- `tests/modules/test-repo-notes.test.js`
- `tests/modules/test-repo-procedures.test.js`
- `tests/modules/test-repo-run.js`
- `tests/modules/test-repo-settings-ui.test.js`
- `tests/modules/test-repo-toolbar-mode.js`
- `tests/modules/test-repo-versions.test.js`
- `tests/modules/test-resource-adaptive.test.js`
- `tests/modules/test-response-downloads.test.js`
- `tests/modules/test-response-sink-passthrough.test.js`
- `tests/modules/test-rfr2-cjs.js`
- `tests/modules/test-route-contracts.test.js`
- `tests/modules/test-route-eligibility.test.js`
- `tests/modules/test-run-all-process-group.test.js`
- `tests/modules/test-run-pipeline.test.js`
- `tests/modules/test-run-ready.test.js`
- `tests/modules/test-run-state.test.js`
- `tests/modules/test-run-watch.test.js`
- `tests/modules/test-runtime-proof.js`
- `tests/modules/test-scheduler.js`
- `tests/modules/test-schema-observe-write.js`
- `tests/modules/test-schema-registry.js`
- `tests/modules/test-scroll-until.test.js`
- `tests/modules/test-selector-map.test.js`
- `tests/modules/test-self-build-loop.js`
- `tests/modules/test-self-heal-context.js`
- `tests/modules/test-self-heal.js`
- `tests/modules/test-self-register.js`
- `tests/modules/test-semantic-field-map.test.js`
- `tests/modules/test-semantic-page-tree.test.js`
- `tests/modules/test-sentinel-cli.js`
- `tests/modules/test-settings-console.test.js`
- `tests/modules/test-setup-job-settles.test.js`
- `tests/modules/test-shadow-space.test.js`
- `tests/modules/test-shadow.test.js`
- `tests/modules/test-shared-stream.js`
- `tests/modules/test-sigma-compaction.js`
- `tests/modules/test-snapshot-half-life-prune.js`
- `tests/modules/test-snr-filter.js`
- `tests/modules/test-sovereign-systems.test.js`
- `tests/modules/test-spatial-void.test.js`
- `tests/modules/test-spawn-guard.js`
- `tests/modules/test-spec-blanks.test.js`
- `tests/modules/test-spec-document.test.js`
- `tests/modules/test-spec-gaps-intelligence.test.js`
- `tests/modules/test-spec-library.test.js`
- `tests/modules/test-spec-pipeline.test.js`
- `tests/modules/test-spec-workshop.test.js`
- `tests/modules/test-sr11-import-pipeline.js`
- `tests/modules/test-staging-s0-s1.test.js`
- `tests/modules/test-step-gate.test.js`
- `tests/modules/test-stub-finder.js`
- `tests/modules/test-stub-scanner.js`
- `tests/modules/test-sync-off-thread.test.js`
- `tests/modules/test-synthesis-declared-value.test.js`
- `tests/modules/test-synthesis-zoom-versionium.test.js`
- `tests/modules/test-system-boundary.test.js`
- `tests/modules/test-system-check-emerge-stale-entry.js`
- `tests/modules/test-system-control.js`
- `tests/modules/test-system-control.test.js`
- `tests/modules/test-system-node-relations.test.js`
- `tests/modules/test-system-record-discipline.js`
- `tests/modules/test-system-registry.js`
- `tests/modules/test-system-shape.test.js`
- `tests/modules/test-system-skeleton.test.js`
- `tests/modules/test-system-status.js`
- `tests/modules/test-system-template.test.js`
- `tests/modules/test-system-tunnel.test.js`
- `tests/modules/test-table-compactor.js`
- `tests/modules/test-table-deduplicator.js`
- `tests/modules/test-table-materializer.js`
- `tests/modules/test-tablet-container-api.js`
- `tests/modules/test-tablet-graph-api.js`
- `tests/modules/test-tablet-homepage.js`
- `tests/modules/test-tablet-ledger-api.js`
- `tests/modules/test-template-picker.test.js`
- `tests/modules/test-test-first.test.js`
- `tests/modules/test-test-sandbox.test.js`
- `tests/modules/test-tested-before-lands.test.js`
- `tests/modules/test-thread.test.js`
- `tests/modules/test-three-graphs.test.mjs`
- `tests/modules/test-tls-layer.test.js`
- `tests/modules/test-tool-config.js`
- `tests/modules/test-tool-guide.js`
- `tests/modules/test-tool-layers-and-pane-memory.test.js`
- `tests/modules/test-tool-naming-convention.js`
- `tests/modules/test-tool-required-alias.test.js`
- `tests/modules/test-triggers.js`
- `tests/modules/test-ui-editor.test.js`
- `tests/modules/test-ui-registry.js`
- `tests/modules/test-ui-tools.js`
- `tests/modules/test-undo-any-change.test.js`
- `tests/modules/test-update-script.test.js`
- `tests/modules/test-user-continuity.js`
- `tests/modules/test-user-model-capture.js`
- `tests/modules/test-user-model-editable.js`
- `tests/modules/test-user-model-everywhere.js`
- `tests/modules/test-user-model-radiate.js`
- `tests/modules/test-user-model-schema.js`
- `tests/modules/test-userscript-mixed-content-fix.js`
- `tests/modules/test-userscript-protocol-parity.js`
- `tests/modules/test-vector-memory-embed-check.test.js`
- `tests/modules/test-vector-memory-pipeline.js`
- `tests/modules/test-versionium-migration.js`
- `tests/modules/test-versionium-repo-history.test.js`
- `tests/modules/test-versionium-snapshot-migration.js`
- `tests/modules/test-versionium-sovereign.js`
- `tests/modules/test-vm-control.test.js`
- `tests/modules/test-vsb1-versionium-split-brain-fix.js`
- `tests/modules/test-wake-relay-real-endpoint.js`
- `tests/modules/test-warp-cascade-provider-fallback.js`
- `tests/modules/test-warp-rung.test.js`
- `tests/modules/test-warp2.test.js`
- `tests/modules/test-work-funnel.test.js`
- `tests/modules/test-work-journal.test.js`
- `tests/modules/test-work-queue.js`
- `tests/modules/test-work-surface.test.js`
- `tests/modules/test-workshop-full.test.js`
- `tests/modules/test-workshop-nexus-specs.test.js`
- `tests/modules/test-workshop-thread.test.js`
- `tests/modules/tool-call-listener.test.js`
- `tests/modules/tool-forge.test.js`
- `tests/modules/tutorial-engine.test.js`
- `tests/modules/ui-self-diagnosis.test.js`
- `tests/modules/uid.test.js`
- `tests/modules/user-model.test.js`
- `tests/modules/version-sync-and-registry.test.js`
- `tests/modules/warp-compounding.test.js`
- `tests/modules/wire-pressure.test.js`
- `tests/ncp-dual-live-flap.test.js`
- `tests/ncp-race.test.js`
- `tests/nexus-full-audit.js`
- `tests/node-export-idea-tagged-query.test.js`
- `tests/node-schemas-split.test.js`
- `tests/pipeline.test.js`
- `tests/probe/_glass-probe.js`
- `tests/probe/agent-blocks-chromium.js`
- `tests/probe/archive-import-chromium.js`
- `tests/probe/build-surface-ui-chromium.js`
- `tests/probe/chat-stream-chromium.js`
- `tests/probe/clearglass-library-window.js`
- `tests/probe/clearglass-menu-library.js`
- `tests/probe/copilot-probe.js`
- `tests/probe/economy-console-chromium.js`
- `tests/probe/field-chromium.js`
- `tests/probe/gemini-deepseek-reader-chromium.js`
- `tests/probe/gig-panel-glass.js`
- `tests/probe/guardian-picker-glass.js`
- `tests/probe/home-split-equivalence.js`
- `tests/probe/idearium-access-glass.js`
- `tests/probe/idearium-coding-flow-chromium.js`
- `tests/probe/idearium-one-surface-glass.js`
- `tests/probe/live-stream-chromium.js`
- `tests/probe/login-wall-chromium.js`
- `tests/probe/manage-workbench-chromium.js`
- `tests/probe/menu-overlay-hit-chromium.js`
- `tests/probe/nerve-field-glass.js`
- `tests/probe/nexus-atlas-home.js`
- `tests/probe/repo-drawer-views-glass.js`
- `tests/probe/repo-tasks-drawer-glass.js`
- `tests/probe/selector-assign-guardian.js`
- `tests/probe/selector-assign-ui-chromium.js`
- `tests/probe/selector-check-chromium.js`
- `tests/probe/settings-console-chromium.js`
- `tests/probe/transcript-push-chromium.js`
- `tests/seam-resume-dedup.test.js`
- `tests/sim/fake-tab.js`
- `tests/sim/loop.js`
- `tests/spawn-provider-tab.test.js`
- `tests/spec-engine-yaml-import.test.js`
- `tests/stale-sweep-socket-close.test.js`
- `tests/userscript-adapter-consistency.test.js`
- `tests/verify-ncp-agents.js`

</details>

<details>
<summary>`ui/` · 114 files</summary>

- `ui/agents/chatgpt/index.html`
- `ui/agents/claude/index.html`
- `ui/agents/gemini/code-suite.html`
- `ui/agents/gemini/index.html`
- `ui/agents/perplexity/index.html`
- `ui/api.js`
- `ui/brainos-float/brainos-float-cg.js`
- `ui/brainos-float/brainos-float-contract.json`
- `ui/brainos-float/brainos-float.css`
- `ui/brainos-float/brainos-float.js`
- `ui/brainos-float/index.html`
- `ui/brainos/brainos-app.css`
- `ui/brainos/brainos-app.js`
- `ui/brainos/brainos-automation.js`
- `ui/brainos/brainos-canvas.js`
- `ui/brainos/brainos-interaction-contract.json`
- `ui/brainos/index.html`
- `ui/channels/causal/causal.html`
- `ui/channels/conversations/conversations.html`
- `ui/channels/idearium/idearium.html`
- `ui/channels/log/log.html`
- `ui/consent/consent-gate.js`
- `ui/contract-renderer.js`
- `ui/contracts.js`
- `ui/control-panel/index.html`
- `ui/copilot/copilot.js`
- `ui/copilot/copilot.test.js`
- `ui/cortex/index.html`
- `ui/emerge/emerge-ide.html`
- `ui/emerge/index.html`
- `ui/forge-shell/forge-shell.html`
- `ui/forge-shell/index.html`
- `ui/guardian/index.html`
- `ui/home/DECOMP.md`
- `ui/home/STRUCTURE.md`
- `ui/home/areas/agent-suite.css`
- `ui/home/areas/agent-suite.js`
- `ui/home/areas/assistant.css`
- `ui/home/areas/assistant.js`
- `ui/home/areas/bridge.css`
- `ui/home/areas/bridge.js`
- `ui/home/areas/causal.css`
- `ui/home/areas/causal.js`
- `ui/home/areas/console.css`
- `ui/home/areas/console.js`
- `ui/home/areas/conversations.css`
- `ui/home/areas/conversations.js`
- `ui/home/areas/cortex.css`
- `ui/home/areas/cortex.js`
- `ui/home/areas/diagnose.css`
- `ui/home/areas/diagnose.js`
- `ui/home/areas/forge-tile.css`
- `ui/home/areas/forge-tile.js`
- `ui/home/areas/guardian.css`
- `ui/home/areas/guardian.js`
- `ui/home/areas/idearium.css`
- `ui/home/areas/idearium.js`
- `ui/home/areas/inspect.css`
- `ui/home/areas/inspect.js`
- `ui/home/areas/log.css`
- `ui/home/areas/log.js`
- `ui/home/areas/mode-selector.css`
- `ui/home/areas/mode-selector.js`
- `ui/home/areas/overview.css`
- `ui/home/areas/overview.js`
- `ui/home/areas/rail.css`
- `ui/home/areas/rail.js`
- `ui/home/areas/rewind.css`
- `ui/home/areas/rewind.js`
- `ui/home/areas/settings-btn.css`
- `ui/home/areas/settings-btn.js`
- `ui/home/areas/shell.css`
- `ui/home/areas/shell.js`
- `ui/home/areas/spec-wizard.css`
- `ui/home/areas/spec-wizard.js`
- `ui/home/areas/void.css`
- `ui/home/areas/void.js`
- `ui/home/core/boot.js`
- `ui/home/core/config.js`
- `ui/home/core/keys.js`
- `ui/home/core/logging.js`
- `ui/home/core/sse.js`
- `ui/home/core/ui-state.js`
- `ui/home/home.css`
- `ui/home/index.html`
- `ui/home/intent.html`
- `ui/home/nexus-home.html`
- `ui/home/shell.js`
- `ui/import-project/import-project.css`
- `ui/import-project/import-project.html`
- `ui/lib/api.js`
- `ui/lib/api.test.js`
- `ui/lib/repo-ingest.js`
- `ui/ncp.js`
- `ui/ports.js`
- `ui/pulse.js`
- `ui/store.js`
- `ui/themes/nexus-dark.css`
- `ui/themes/nexus-light.css`
- `ui/tv-shell/DECOMP.md`
- `ui/tv-shell/components/guardian.js`
- `ui/tv-shell/components/system-component.js`
- `ui/tv-shell/forge-shell/index.html`
- `ui/tv-shell/index.html`
- `ui/tv-shell/menu.js`
- `ui/tv-shell/nerve/nerve.css`
- `ui/tv-shell/nerve/nerve.html`
- `ui/tv-shell/nerve/nerve.js`
- `ui/tv-shell/spotlight/spotlight.css`
- `ui/tv-shell/spotlight/spotlight.js`
- `ui/tv-shell/tutorial/tutorial.js`
- `ui/tv-shell/tv-shell.css`
- `ui/tv-shell/warp-ui/nexus-shell.js`
- `ui/tv-shell/warp-ui/warp-browser.js`

</details>

<details>
<summary>`warp/` · 37 files</summary>

- `warp/CHANGELOG.md`
- `warp/LICENSE`
- `warp/MANIFEST.json`
- `warp/README.md`
- `warp/adapters/emerge-field.js`
- `warp/adapters/siso-gates.js`
- `warp/core/Axiom.js`
- `warp/core/Engine.js`
- `warp/core/Event.js`
- `warp/core/Expectation.js`
- `warp/core/Gate.js`
- `warp/core/GateFusion.js`
- `warp/core/Ledger.js`
- `warp/core/Link.js`
- `warp/core/Stream.js`
- `warp/core/StreamLog.js`
- `warp/core/index.js`
- `warp/dispatch/benchmark.js`
- `warp/dispatch/canonicalize.js`
- `warp/dispatch/cascade.js`
- `warp/dispatch/deltaCache.js`
- `warp/dispatch/digest.js`
- `warp/dispatch/index.js`
- `warp/dispatch/population.js`
- `warp/dispatch/pregen.js`
- `warp/index.js`
- `warp/interaction-contract.json`
- `warp/package.json`
- `warp/plugins.zip`
- `warp/plugins/crystallizer-flatfile.js`
- `warp/plugins/scorer-default.js`
- `warp/spec/warp.spec`
- `warp/test/core.test.js`
- `warp/test/digest-regression.test.js`
- `warp/test/dispatch.test.js`
- `warp/test/v1.1.0-additions.test.js`
- `warp/test/v1.4-additions.test.js`

</details>

<details>
<summary>the release notes · 362 files (each is in the version history below, in his words)</summary>

`CHANGELOG-0.60.157.md` · `CHANGELOG-0.60.156.md` · `CHANGELOG-0.60.155.md` · `CHANGELOG-0.60.154.md` · `CHANGELOG-0.60.153.md` · `CHANGELOG-0.60.152.md` · `CHANGELOG-0.60.151.md` · `CHANGELOG-0.60.150.md` · `CHANGELOG-0.60.149.md` · `CHANGELOG-0.60.148.md` · `CHANGELOG-0.60.147.md` · `CHANGELOG-0.60.146.md` · `CHANGELOG-0.60.145.md` · `CHANGELOG-0.60.144.md` · `CHANGELOG-0.60.143.md` · `CHANGELOG-0.60.142.md` · `CHANGELOG-0.60.141.md` · `CHANGELOG-0.60.140.md` · `CHANGELOG-0.60.139.md` · `CHANGELOG-0.60.138.md` · `CHANGELOG-0.60.137.md` · `CHANGELOG-0.60.136.md` · `CHANGELOG-0.60.135.md` · `CHANGELOG-0.60.134.md` · `CHANGELOG-0.60.133.md` · `CHANGELOG-0.60.132.md` · `CHANGELOG-0.60.131.md` · `CHANGELOG-0.60.130.md` · `CHANGELOG-0.60.129.md` · `CHANGELOG-0.60.128.md` · `CHANGELOG-0.60.127.md` · `CHANGELOG-0.60.126.md` · `CHANGELOG-0.60.125.md` · `CHANGELOG-0.60.124.md` · `CHANGELOG-0.60.123.md` · `CHANGELOG-0.60.122.md` · `CHANGELOG-0.60.121.md` · `CHANGELOG-0.60.120.md` · `CHANGELOG-0.60.119.md` · `CHANGELOG-0.60.118.md` · `CHANGELOG-0.60.117.md` · `CHANGELOG-0.60.116.md` · `CHANGELOG-0.60.115.md` · `CHANGELOG-0.60.114.md` · `CHANGELOG-0.60.113.md` · `CHANGELOG-0.60.112.md` · `CHANGELOG-0.60.111.md` · `CHANGELOG-0.60.110.md` · `CHANGELOG-0.60.109.md` · `CHANGELOG-0.60.108.md` · `CHANGELOG-0.60.107.md` · `CHANGELOG-0.60.106.md` · `CHANGELOG-0.60.105.md` · `CHANGELOG-0.60.104.md` · `CHANGELOG-0.60.103.md` · `CHANGELOG-0.60.102.md` · `CHANGELOG-0.60.101.md` · `CHANGELOG-0.60.100.md` · `CHANGELOG-0.60.99.md` · `CHANGELOG-0.60.98.md` · `CHANGELOG-0.60.97.md` · `CHANGELOG-0.60.96.md` · `CHANGELOG-0.60.95.md` · `CHANGELOG-0.60.94.md` · `CHANGELOG-0.60.93.md` · `CHANGELOG-0.60.92.md` · `CHANGELOG-0.60.91.md` · `CHANGELOG-0.60.90.md` · `CHANGELOG-0.60.89.md` · `CHANGELOG-0.60.88.md` · `CHANGELOG-0.60.87.md` · `CHANGELOG-0.60.86.md` · `CHANGELOG-0.60.85.md` · `CHANGELOG-0.60.84.md` · `CHANGELOG-0.60.83.md` · `CHANGELOG-0.60.82.md` · `CHANGELOG-0.60.81.md` · `CHANGELOG-0.60.80.md` · `CHANGELOG-0.60.79.md` · `CHANGELOG-0.60.78.md` · `CHANGELOG-0.60.77.md` · `CHANGELOG-0.60.76.md` · `CHANGELOG-0.60.75.md` · `CHANGELOG-0.60.74.md` · `CHANGELOG-0.60.73.md` · `CHANGELOG-0.60.72.md` · `CHANGELOG-0.60.71.md` · `CHANGELOG-0.60.70.md` · `CHANGELOG-0.60.69.md` · `CHANGELOG-0.60.68.md` · `CHANGELOG-0.60.67.md` · `CHANGELOG-0.60.66.md` · `CHANGELOG-0.60.65.md` · `CHANGELOG-0.60.64.md` · `CHANGELOG-0.60.63.md` · `CHANGELOG-0.60.62.md` · `CHANGELOG-0.60.61.md` · `CHANGELOG-0.60.60.md` · `CHANGELOG-0.60.59.md` · `CHANGELOG-0.60.58.md` · `CHANGELOG-0.60.57.md` · `CHANGELOG-0.60.56.md` · `CHANGELOG-0.60.55.md` · `CHANGELOG-0.60.54.md` · `CHANGELOG-0.60.53.md` · `CHANGELOG-0.60.52.md` · `CHANGELOG-0.60.51.md` · `CHANGELOG-0.60.50.md` · `CHANGELOG-0.60.49.md` · `CHANGELOG-0.60.48.md` · `CHANGELOG-0.60.47.md` · `CHANGELOG-0.60.46.md` · `CHANGELOG-0.60.45.md` · `CHANGELOG-0.60.44.md` · `CHANGELOG-0.60.43.md` · `CHANGELOG-0.60.42.md` · `CHANGELOG-0.60.41.md` · `CHANGELOG-0.60.40.md` · `CHANGELOG-0.60.39.md` · `CHANGELOG-0.60.38.md` · `CHANGELOG-0.60.37.md` · `CHANGELOG-0.60.36.md` · `CHANGELOG-0.60.35.md` · `CHANGELOG-0.60.34.md` · `CHANGELOG-0.60.33.md` · `CHANGELOG-0.60.32.md` · `CHANGELOG-0.60.31.md` · `CHANGELOG-0.60.30.md` · `CHANGELOG-0.60.29.md` · `CHANGELOG-0.60.28.md` · `CHANGELOG-0.60.27.md` · `CHANGELOG-0.60.26.md` · `CHANGELOG-0.60.21.md` · `CHANGELOG-0.60.20.md` · `CHANGELOG-0.60.19.md` · `CHANGELOG-0.60.18.md` · `CHANGELOG-0.60.17.md` · `CHANGELOG-0.60.16.md` · `CHANGELOG-0.60.15.md` · `CHANGELOG-0.60.14.md` · `CHANGELOG-0.60.13.md` · `CHANGELOG-0.60.12.md` · `CHANGELOG-0.60.11.md` · `CHANGELOG-0.60.10.md` · `CHANGELOG-0.60.9.md` · `CHANGELOG-0.60.8.md` · `CHANGELOG-0.60.7.md` · `CHANGELOG-0.60.6.md` · `CHANGELOG-0.60.5.md` · `CHANGELOG-0.60.4.md` · `CHANGELOG-0.60.3.md` · `CHANGELOG-0.60.2.md` · `CHANGELOG-0.60.1.md` · `CHANGELOG-0.60.0.md` · `CHANGELOG-0.59.15.md` · `CHANGELOG-0.59.14.md` · `CHANGELOG-0.59.13.md` · `CHANGELOG-0.59.12.md` · `CHANGELOG-0.59.11.md` · `CHANGELOG-0.59.10.md` · `CHANGELOG-0.59.9.md` · `CHANGELOG-0.59.8.md` · `CHANGELOG-0.59.7.md` · `CHANGELOG-0.59.6.md` · `CHANGELOG-0.59.5.md` · `CHANGELOG-0.59.4.md` · `CHANGELOG-0.59.3.md` · `CHANGELOG-0.59.2.md` · `CHANGELOG-0.59.1.md` · `CHANGELOG-0.59.0.md` · `CHANGELOG-0.58.0.md` · `CHANGELOG-0.57.1.md` · `CHANGELOG-0.57.0.md` · `CHANGELOG-0.56.0.md` · `CHANGELOG-0.55.2.md` · `CHANGELOG-0.55.1.md` · `CHANGELOG-0.55.0.md` · `CHANGELOG-0.54.2.md` · `CHANGELOG-0.54.1.md` · `CHANGELOG-0.54.0.md` · `CHANGELOG-0.53.0.md` · `CHANGELOG-0.52.0.md` · `CHANGELOG-0.51.0.md` · `CHANGELOG-0.50.0.md` · `CHANGELOG-0.49.0.md` · `CHANGELOG-0.48.0.md` · `CHANGELOG-0.47.0.md` · `CHANGELOG-0.46.0.md` · `CHANGELOG-0.45.0.md` · `CHANGELOG-0.44.0.md` · `CHANGELOG-0.43.0.md` · `CHANGELOG-0.42.0.md` · `CHANGELOG-0.41.0.md` · `CHANGELOG-0.40.1.md` · `CHANGELOG-0.40.0.md` · `CHANGELOG-0.39.376.md` · `CHANGELOG-0.39.375.md` · `CHANGELOG-0.39.374.md` · `CHANGELOG-0.39.373.md` · `CHANGELOG-0.39.372.md` · `CHANGELOG-0.39.371.md` · `CHANGELOG-0.39.370.md` · `CHANGELOG-0.39.369.md` · `CHANGELOG-0.39.368.md` · `CHANGELOG-0.39.367.md` · `CHANGELOG-0.39.366.md` · `CHANGELOG-0.39.365.md` · `CHANGELOG-0.39.364.md` · `CHANGELOG-0.39.363.md` · `CHANGELOG-0.39.362.md` · `CHANGELOG-0.39.361.md` · `CHANGELOG-0.39.360.md` · `CHANGELOG-0.39.359.md` · `CHANGELOG-0.39.358.md` · `CHANGELOG-0.39.357.md` · `CHANGELOG-0.39.356.md` · `CHANGELOG-0.39.355.md` · `CHANGELOG-0.39.354.md` · `CHANGELOG-0.39.353.md` · `CHANGELOG-0.39.352.md` · `CHANGELOG-0.39.351.md` · `CHANGELOG-0.39.350.md` · `CHANGELOG-0.39.349.md` · `CHANGELOG-0.39.348.md` · `CHANGELOG-0.39.347.md` · `CHANGELOG-0.39.346.md` · `CHANGELOG-0.39.345.md` · `CHANGELOG-0.39.344.md` · `CHANGELOG-0.39.343.md` · `CHANGELOG-0.39.342.md` · `CHANGELOG-0.39.341.md` · `CHANGELOG-0.39.340.md` · `CHANGELOG-0.39.339.md` · `CHANGELOG-0.39.338.md` · `CHANGELOG-0.39.337.md` · `CHANGELOG-0.39.336.md` · `CHANGELOG-0.39.335.md` · `CHANGELOG-0.39.334.md` · `CHANGELOG-0.39.333.md` · `CHANGELOG-0.39.332.md` · `CHANGELOG-0.39.331.md` · `CHANGELOG-0.39.330.md` · `CHANGELOG-0.39.329.md` · `CHANGELOG-0.39.328.md` · `CHANGELOG-0.39.327.md` · `CHANGELOG-0.39.326.md` · `CHANGELOG-0.39.325.md` · `CHANGELOG-0.39.324.md` · `CHANGELOG-0.39.323.md` · `CHANGELOG-0.39.322.md` · `CHANGELOG-0.39.321.md` · `CHANGELOG-0.39.320.md` · `CHANGELOG-0.39.319.md` · `CHANGELOG-0.39.318.md` · `CHANGELOG-0.39.317.md` · `CHANGELOG-0.39.316.md` · `CHANGELOG-0.39.315.md` · `CHANGELOG-0.39.314.md` · `CHANGELOG-0.39.313.md` · `CHANGELOG-0.39.312.md` · `CHANGELOG-0.39.311.md` · `CHANGELOG-0.39.310.md` · `CHANGELOG-0.39.309.md` · `CHANGELOG-0.39.308.md` · `CHANGELOG-0.39.307.md` · `CHANGELOG-0.39.306.md` · `CHANGELOG-0.39.305.md` · `CHANGELOG-0.39.304.md` · `CHANGELOG-0.39.303.md` · `CHANGELOG-0.39.302.md` · `CHANGELOG-0.39.301.md` · `CHANGELOG-0.39.300.md` · `CHANGELOG-0.39.299.md` · `CHANGELOG-0.39.298.md` · `CHANGELOG-0.39.297.md` · `CHANGELOG-0.39.296.md` · `CHANGELOG-0.39.295.md` · `CHANGELOG-0.39.294.md` · `CHANGELOG-0.39.293.md` · `CHANGELOG-0.39.292.md` · `CHANGELOG-0.39.291.md` · `CHANGELOG-0.39.290.md` · `CHANGELOG-0.39.289.md` · `CHANGELOG-0.39.288.md` · `CHANGELOG-0.39.287.md` · `CHANGELOG-0.39.286.md` · `CHANGELOG-0.39.285.md` · `CHANGELOG-0.39.284.md` · `CHANGELOG-0.39.283.md` · `CHANGELOG-0.39.282.md` · `CHANGELOG-0.39.281.md` · `CHANGELOG-0.39.280.md` · `CHANGELOG-0.39.279.md` · `CHANGELOG-0.39.278.md` · `CHANGELOG-0.39.277.md` · `CHANGELOG-0.39.276.md` · `CHANGELOG-0.39.275.md` · `CHANGELOG-0.39.274.md` · `CHANGELOG-0.39.273.md` · `CHANGELOG-0.39.272.md` · `CHANGELOG-0.39.271.md` · `CHANGELOG-0.39.270.md` · `CHANGELOG-0.39.269.md` · `CHANGELOG-0.39.268.md` · `CHANGELOG-0.39.267.md` · `CHANGELOG-0.39.266.md` · `CHANGELOG-0.39.264.md` · `CHANGELOG-0.39.263.md` · `CHANGELOG-0.39.262.md` · `CHANGELOG-0.39.261.md` · `CHANGELOG-0.39.260.md` · `CHANGELOG-0.39.259.md` · `CHANGELOG-0.39.258.md` · `CHANGELOG-0.39.257.md` · `CHANGELOG-0.39.256.md` · `CHANGELOG-0.39.255.md` · `CHANGELOG-0.39.254.md` · `CHANGELOG-0.39.253.md` · `CHANGELOG-0.39.252.md` · `CHANGELOG-0.39.251.md` · `CHANGELOG-0.39.250.md` · `CHANGELOG-0.39.249.md` · `CHANGELOG-0.39.248.md` · `CHANGELOG-0.39.247.md` · `CHANGELOG-0.39.246.md` · `CHANGELOG-0.39.245.md` · `CHANGELOG-0.39.244.md` · `CHANGELOG-0.39.243.md` · `CHANGELOG-0.39.242.md` · `CHANGELOG-0.39.241.md` · `CHANGELOG-0.39.240.md` · `CHANGELOG-0.39.239.md` · `CHANGELOG-0.39.238.md` · `CHANGELOG-0.39.237.md` · `CHANGELOG-0.39.236.md` · `CHANGELOG-0.39.228.md` · `CHANGELOG-0.39.227.md` · `CHANGELOG-0.39.223.md` · `CHANGELOG-0.39.194.md` · `CHANGELOG-0.39.193.md` · `CHANGELOG-0.39.192.md` · `CHANGELOG-0.39.191.md` · `CHANGELOG-0.39.190.md` · `CHANGELOG-0.39.188.md` · `CHANGELOG-0.39.182.md` · `CHANGELOG-0.39.181.md` · `CHANGELOG-0.39.179.md` · `CHANGELOG-0.39.178.md` · `CHANGELOG-0.39.177.md` · `CHANGELOG-0.39.176.md` · `CHANGELOG-0.39.175.md` · `CHANGELOG-0.39.174.md` · `CHANGELOG-0.39.173.md` · `CHANGELOG-0.39.172.md` · `CHANGELOG-0.39.170.md` · `CHANGELOG-0.39.169.md` · `CHANGELOG-0.39.168.md` · `CHANGELOG-0.39.167.md` · `CHANGELOG-0.39.166.md` · `CHANGELOG-0.39.165.md` · `CHANGELOG-0.39.144.md` · `CHANGELOG-0.39.144-part2.md`

</details>

<!-- generated:readme:system:core:end -->

---

## core, directory by directory

#### `lib/` — the shared libraries

The code more than one kernel needs. The groups that matter most: the agent layer (`lib/agent-router.js`, `lib/agent-tools/`, `lib/agent-system/`, `lib/repo-agent.js`, `lib/repo-hat.js`, `lib/repo-prompt-blocks.js`, `lib/repo-inject.js`, `lib/repo-context.js`); ledgers and events (`lib/ledger-writer.js`, `lib/ledger-fanin/`, `lib/event-types.js`, `lib/warp-bus.js`); the registries (`lib/component-registry.js`, `lib/capability-registry.js`, `lib/hook-registry.js`, `lib/schema-registry.js`, `lib/tool-index.js`); diagnosis (`lib/diagnostic-engines.js`, `lib/diag-engines/`, `lib/fault-log.js`, `lib/gap-field.js`); COS glue (`lib/cos-bridge.js`, `lib/cos-run.js`, `lib/repo-run.js`, `lib/compartment-engine.js`); NEXUS as a repo (`lib/nexus-self/`); and the rules every test lives under (`lib/test-sandbox.js`, `lib/version.js`).

#### `cos/` — now its own system

Since 0.39.341 `cos/` is the system `cos` (above, and `cos-atlas.md`), no longer one of core's directories.

#### `cli/` — the command line

`cli/nexus-cli.js` is the grammar-driven command line, `cli/nexus-repl.js` the interactive shell, `cli/boot-systems.js` the ordered boot the orchestrator used before autopilot, and `cli/diagnose.js` runs every diagnostic engine against one system's ledger. The rest are maintenance tools: `cli/data-audit.js`, `cli/find-orphans.js`, `cli/purge-pollution.js`, `cli/semantic-dedup.js`, `cli/compact.js`. Its spec is `cli/spec/cli.spec`.

#### `nexus/` — autopilot and the fabric

`nexus/autopilot.js` starts and supervises every kernel in phases. `nexus/nexus-bus.js` is the common event fabric every system emits to; `nexus/nexus-query.js` is one query interface over every system; `nexus/nexus-connect.js` is the universal cross-system call with a UUID on every call; `nexus/nexus-knowledge.js` and `nexus/nexus-cfr-influence.js` join knowledge and CFR influence.

#### `warp/` and `siso/` — the spine

`siso/` is SISO, the coding model credited to Jonathan Bailey: every function one input and one output, state in the data structure, transformation as events (`siso/Gate.js`, `siso/Stream.js`, `siso/StreamLog.js`, `siso/spec/siso.spec`). `warp/` is the standalone devkit built on that idea, with five primitives, Event, Gate, Stream, StreamLog and Axiom (`warp/core/`), content digests and a delta cache for dispatch (`warp/dispatch/`), and its spec `warp/spec/warp.spec`. NEXUS imports WARP; WARP never imports NEXUS.

#### `jaa/` — the tables

`jaa/schema.sql` and `jaa/schema-full.sql` define the JAA tables: every row has a UUID and hook fields, and state is a row, never an in-place mutation. The live implementation is `cortex/memory/jaa-db.js`, and guardian keeps its own in `guardian/jaa-store.js`.

#### `contracts/`, `hooks/`, `seams/` — the declared connections

`contracts/nexus-interaction-contract.js` is the one table of every endpoint, port, SSE event and command; `contracts/nodes/` holds the contract node types (axioms, gaps, faults, edges, ledgers, verification contracts). `hooks/index.js` is the living hook registry with one file per system (`hooks/guardian.hooks.js`, `hooks/cortex.hooks.js`, and the rest) and `hooks/side-effect-parser.js` to find undeclared side effects. `seams/seam-contracts.js` declares every seam and the port table.

#### `auth/`, `security/` — identity and trust

`auth/index.js` is the sovereign authentication layer: an RSA keypair per client, signed requests, and a policy in `auth/policy.json`, with `auth/client.js` for callers. `security/signaling-envelope.js` signs the remote-desktop signaling channel so a replayed or hijacked session is refused.

#### `meta/` — measurement

`meta/index.js` gathers modules that measure, detect, classify and score without knowing what NEXUS is: `meta/confidence.js` and `meta/crystal-lattice.js`, the crystallization and lattice mechanism.

#### `mesh/` — networking

Daemons ported from BrainOS and kept optional: DNS, dynamic DNS, a reverse proxy and a firewall in `mesh/lib/`, started by `mesh/daemons.js` and configured in `mesh/config.js`, with `mesh/install.js` for the host side.

#### `remote-desktop/` — remote control of a machine

A host (`remote-desktop/host.html`), a viewer (`remote-desktop/viewer.html`), input authorization and injection (`remote-desktop/input-auth.js`, `remote-desktop/input-injector.js`), a signaling server (`remote-desktop/signal.js`), an Electron bridge (`remote-desktop/bridge-electron/main.js`), and the vendored `remote-desktop/bridge-os-core/` for identity and key storage. Its spec, `remote-desktop/remote-desktop.spec`, orders the work as a bottom-up phasemap.

#### `emerge/` — the DSL runtime

Emerge reads .eg files, a declarative language with a 569-keyword vocabulary: tokenizer, parser gated on signal-to-noise, kernel and emitter (`emerge/emerge-kernel.js`), with Ollama-backed code generation for the gaps (`emerge/emerge-codegen-v2.js`). Its spec compiler in `emerge/compiler/` runs the T0 to T3 pipeline, querying cortex first (`emerge/cortex-query/`). Specs: `emerge/spec/emerge.spec` and `emerge/SPEC_COMPILER.spec`.

#### `erosmancer/`, `cockpit/`, `products/` — adjacent systems and the products

`erosmancer/erosmancer-os/` is ErosmancerOS, a TypeScript browser-automation platform over the Chrome DevTools Protocol for flows userscripts cannot handle (`erosmancer/spec/erosmancer.spec`). `cockpit/cockpit.spec` is the forge IDE's full specification, with its core in `cockpit/core.js`. The healer that used to stand beside them as its own scaffolded system moved into diagnostic in 0.60.136 (`diagnostic/healer/`). `products/` holds what Nexus is turned into for someone else: `products/flight-recorder/` is Flight Recorder, his "its a product?" (2026-10-16), an undo button and flight recorder for AI coding agents, built inside Nexus with a real boundary and carved out at each release (`products/flight-recorder/product.json` names what it must carry; `products/flight-recorder/bin/flight-recorder.js` runs it on any project folder).

#### `architecture-spec/` — how a new system is scaffolded

The base every new sovereign system is built on before it has features: components, hooks and wires compiled into a lattice that proves what connects (`architecture-spec/registry/lattice.js`), with friction and decomposition (`architecture-spec/registry/friction.js`, `architecture-spec/registry/decompose.js`) and the atlas tools (`architecture-spec/registry/create-atlas.js`, `architecture-spec/registry/edit-atlas.js`). Its atlas is `architecture-spec-atlas.md`.

#### `service/`, `sentinel/`, `scripts/`, `skills/`, `tablet/`

`service/guardian-service.js` and `service/idearium-service.js` boot a kernel as a supervised service with every lifecycle event in its ledger. `sentinel/interaction-contract.json` is the sentinel's contract; its command is `cli/sentinel.js`. `scripts/` holds release and verification tools (`scripts/verify-boot.js`, `scripts/verify-wires.js`, `scripts/precommit-check.js`, `scripts/run-verification-manifest.cjs`). `skills/` holds session skills, among them `skills/nexus-session-changelog/SKILL.md`. `tablet/` is the tablet homepage (`tablet/index.html`) and its 3D map (`tablet/map3d.html`).

#### `ui/` — the shells

The home shell (`ui/home/index.html`), the TV shell (`ui/tv-shell/`), BrainOS and its floating panel (`ui/brainos/`, `ui/brainos-float/`), the control panel (`ui/control-panel/index.html`), the provider agents' pages (`ui/agents/`), and shared UI code (`ui/api.js`, `ui/ports.js`, `ui/pulse.js`). The orchestrator serves each one under /ui/.

#### `docs/` — the written record

Axioms (`docs/AXIOMS-v3.1.md`), the working agreement (`docs/CLAUDE.md`), the session protocol (`docs/SESSION-PROTOCOL.md`), the spec registry (`docs/SPEC-REGISTRY.spec`), dated phasemaps (this release's is `docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec`), handoffs (`docs/2026-09-26b-handoff.md`), the changelog (`docs/CHANGELOG.md`), and the atlases in `docs/atlases/`.

#### `tests/` — the proof

`tests/modules/` holds one suite per component, run by `tests/modules/run-all.js`; `tests/brutal.test.js`, `tests/kernel.test.js` and `tests/full.test.js` are the older whole-system suites; `tests/probe/` drives real pages; `tests/helpers/` holds shared fixtures, among them `tests/helpers/cos-mini-guest.js`, which assembles a real Linux guest from the host's own kernel so the COS VM can be proven with a real boot.

---

## Cross-cutting concerns

### Contracts and registration

Every kernel declares its routes as components in its own `registry-components.js` (for example `idearium/registry-components.js`), and the orchestrator verifies each system's contract at registration and on a poll (`orchestrator/lib/contract-handshake.js`). A route that is declared but served by nothing is a finding, reported by loom's capability scanner, never a silent pass. `lib/component-registry.js` records every registration in the component ledger.

### Events and ledgers

Every system writes its own ledger through `lib/ledger-writer.js`, and `lib/ledger-fanin/` joins all of them into one stream that intelligence, autopilot, copilot and logging subscribe to once. `lib/event-types.js` is the event-type registry. The rule from §9.2 is that the ledger entry is written before the thing it records is dispatched.

### Data and persistence

Runtime state lives in data folders at any depth, never in the snapshot and never committed. The single place that decides where a system's data goes is `lib/ledger-writer.js` with the data root cortex owns; tests get their own throwaway root from `lib/test-sandbox.js`. JAA tables (`cortex/memory/jaa-db.js`) are the store for rows; Versionium holds the history of files.

### Versions and releases

`lib/version.js` is the single source of every version: the platform release and each system's own semver, with a dated entry explaining every bump. `package.json` follows it. Every release also has a changelog at the root, this one `CHANGELOG-0.39.264.md`, and its record in Versionium.

---

## Build and run reference

- Start everything: `nexus/autopilot.js` through the start:all script in `package.json`, or only the core kernels with start:core.
- Run the module suites: `tests/modules/run-all.js`; the whole-system suites through the test:all script.
- Set up the COS test VM: `cos/testenv/setup-vm.bat` on Windows, `cos/testenv/setup-vm.sh` elsewhere, or the cos:vm-setup script; the run menu in Idearium also offers it when the VM is missing.
- Rebuild loom's registry: `loom/bootstrap.js`.
- Check wiring and boot: `scripts/verify-wires.js`, `scripts/verify-boot.js`.

---

## Known drift

Named here so nobody mistakes it for a design (§12.5, §13.4):

- **Stale references in older system atlases.** The atlas reference test lists, for each older atlas, the references the tree no longer has; `clear-glass-atlas.md` has the most. The atlases written in 0.39.264, and `idearium-atlas.md` rewritten in 0.39.270, have none, and the test fails if one appears.
- **Two maps for one request.** His "can we spec the product for debugging" was answered by two sessions working from 0.60.142: `docs/2026-10-17-debugging-product-phasemap.spec` (his line, whose phases were built there: flight data, the failure-mode report, the phase graph) and `docs/2026-10-18-debugging-product-phasemap.spec` (main, mapped). They are kept side by side as two contracts. They agree that no single uuid joins every record and that every gap goes through one door, and differ on how a chunk is named and kept across a move (decisions D10 and D13 in `docs/2026-10-17-decisions-by-the-axioms.spec`). Which one stands is his to say.
- **Two version lines, one history.** His upload of 2026-10-18 carried releases numbered 0.60.143 to 0.60.148 that another session had built beside main's own 0.60.143 to 0.60.146. They were merged by a three-way merge and renumbered 0.60.147 to 0.60.152; each release note and version line says the number it was built as, and the version tags in that code's comments are kept as written, so a comment marked 0.60.146 in `diagnostic/lib/causality.js` is the release now called 0.60.150.
- **Two run-all lists.** `tests/modules/run-all.js` and the root `run-all.js` are copies kept in step by hand.

---

<!-- generated:readme:start -->
## The whole of NEXUS, generated from the tree and its records

Everything below is written by `lib/readme-generate.js` from the tree as it is and the records it keeps, each time `scripts/generate-atlases.js` runs, so it cannot drift from the code. The narrative above is written by hand; this is the inventory under it.

### Every phase

Every phase of every phasemap, 1691 phases across 136 maps, read by the one phasemap parser loom uses (`loom/scanners/phasemap-map.js`). 677 are done, 10 in progress and 1004 pending. A decision (a question for James, or one his axioms decided) is marked as one. The maps are newest first; each opens to its phases, each phase with its status and what it does. The map itself, with the reasons and the proof, is the file named.

<details>
<summary>`docs/snapshot-trigger-phasemap.spec` · 2 · 0 done, 0 in progress, 2 pending</summary>

- **SS1_drift_triggered_snapshot** · pending
- **SS2_snapshot_in_diagnostics** · pending

</details>

<details>
<summary>`docs/rich-atlas-phasemap.spec` · 3 · 2 done, 0 in progress, 1 pending</summary>

- **AT1_full_enumeration_and_clickable_links** · done
- **AT2_atlas_editor** · done
- **AT3_agent_queryable_atlas** · pending

</details>

<details>
<summary>`docs/repair-contract-and-loom-hub-phasemap.spec` · 11 · 10 done, 0 in progress, 1 pending</summary>

- **R0_phasemap_history_in_cortex** · done
- **R1_repair_contract_schema** · done
- **R2_real_snapshot_rollback** · pending
- **R3_autonomous_repair_trigger** · done
- **R4_loom_ledger_awareness** · done
- **R5_loom_visual_map** · done
- **R6_living_documentation** · done
- **R7_fault_taxonomy_reconnection** · done
- **R8_ui_diagnostic_surfaces_wired_together** · done
- **R9_ui_design_philosophy** · done
- **R10_relational_context_and_reuse** · done

</details>

<details>
<summary>`docs/raid-warp-verification-phasemap.spec` · 11 · 11 done, 0 in progress, 0 pending</summary>

- **P1_raid_records_every_decision** · done
- **P2_constitution_gate** · done
- **P3_cos_isolate_and_verify** · done
- **P4_sigma_drift_score** · done
- **P5_compare_contract_vs_output** · done
- **P6_rewind_on_fail** · done
- **P7_one_raid_verify_spine** · done
- **P8_ui_as_copilot_tools** · done
- **P9_gated_events_to_copilot** · done
- **P10_diagnose_and_notify** · done
- **P11_diagnose_and_repair_on_prompt** · done

</details>

<details>
<summary>`docs/raid-verification-spine-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **P1_raid_records_every_tool_decision** · done
- **P2_constitution_on_the_approve_path** · done
- **P3_isolate_and_verify_via_cos** · done
- **P4_sigma_and_drift_scoring** · done
- **P5_compare_contract_vs_output** · done
- **P6_rewind_on_fail** · done
- **P7_one_raid_verify_entrypoint** · done

</details>

<details>
<summary>`docs/raid-routing-fidelity-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **RR1_verify_and_wire_the_snr_fidelity_gate** · done
- **RR2_contract_based_chunking** · done
- **RR3_per_agent_config_in_cortex** · done
- **RR4_governed_handshake_on_handoff** · done
- **RR5_clearglass_accounts_and_features** · done
- **RR6_cortex_fitness_and_fluid_configs** · done
- **RR7_per_system_dashboards_in_tablet** · done

</details>

<details>
<summary>`docs/nexus-system-standardization-phasemap.spec` · 8 · 0 done, 0 in progress, 8 pending</summary>

- **SS0_clear_clutter** · pending
- **SS1_system_manifest** · pending
- **SS2_config_per_system** · pending
- **SS3_event_driven_handshake_contracts** · pending
- **SS4_full_logging_per_system** · pending
- **SS5_diagnostics_reads_and_fixes** · pending
- **SS6_dynamic_commands_and_cortex_data** · pending
- **SS7_decoupling_audit** · pending

</details>

<details>
<summary>`docs/nexus-self-build-pipeline-phasemap.spec` · 9 · 1 done, 0 in progress, 8 pending</summary>

- **SB1_schema_extension** · done
- **SB2_universal_file_parse** · pending
- **SB3_guided_build_loop** · pending
- **SB4_decision_lattice_wiring** · pending
- **SB5_self_modification_from_inside** · pending
- **SB6_contract_type_schemas_and_toolbox_directory** · pending
- **SB7_compartments_as_sessions** · pending
- **SB8_tool_agnosticism_and_new_tool_flow** · pending
- **SB9_full_clearglass_control** · pending

</details>

<details>
<summary>`docs/nexus-repository-system-build-phasemap.spec` · 8 · 4 done, 0 in progress, 4 pending</summary>

- **MCO0_audit_real_coverage** · done
- **MCO1_graph_layer** · done
- **MCO2_verification_deepening** · done
- **MCO3_snapshot_compliance** · done
- **MCO4_hooks_wires_flows_tools** · pending
- **MCO5_git_integration_credentials** · pending
- **MCO6_compartment_ownership** · pending
- **MCO7_nexus_systems_as_repo_compartments** · pending

</details>

<details>
<summary>`docs/nexus-repo-compartment-and-rich-dispatch-phasemap.spec` · 7 · 1 done, 0 in progress, 6 pending</summary>

- **RD1_multi_file_response_parser** · done
- **RD2_response_to_multiple_artifact_types** · pending
- **NC1_compartment_bootstrapping_decision** · pending
- **NC2_nested_compartment_support** · pending
- **AG1_agent_nodes_sorted_by_provider** · pending
- **RS1_repo_settings_sections** · pending
- **GC1_global_component_reuse_store** · pending

</details>

<details>
<summary>`docs/nexus-observability-tablet-phasemap.spec` · 11 · 11 done, 0 in progress, 0 pending</summary>

- **OB1_live_diagnostics** · done
- **OB2_gap_detection_diagnostic** · done
- **OB3_movement_map** · done
- **OB4_bottleneck_detection** · done
- **OB5_tablet_modules** · done
- **OB6_continuous_ollama_injection** · done
- **OB7_intelligence_optimization** · done
- **OB8_pattern_leverage_ratio** · done
- **OB10_sigma_role_intent_map** · done
- **OB11_edge_case_mapping** · done
- **OB9_3d_visual_map** · done

</details>

<details>
<summary>`docs/nexus-live-mind-phasemap.spec` · 6 · 6 done, 0 in progress, 0 pending</summary>

- **P1_nervous_system_live** · done
- **P2_snapshot_on_sigma** · done
- **P3_diagnostic_kernel** · done
- **P4_copilot_awareness** · done
- **P5_copilot_dynamic_and_user_aware** · done
- **P6_copilot_programmable** · done

</details>

<details>
<summary>`docs/nexus-architecture-rebuild-phasemap.spec` · 22 · 10 done, 0 in progress, 12 pending</summary>

- **P1_dangling_hook_flood** · done
- **P2_autopilot_spawn_crash** · done
- **P3_remaining_dangling_hooks** · pending
- **P4_forge_shell_rebuild** · done
- **P5_cockpit_to_copilot_control_surface** · pending
- **P6_copilot_toasts** · pending
- **P7_schema_based_persistence_system_wide** · pending
- **P8_hat_forge_command** · done
- **P9_multi_agent_parallel_dispatch** · done
- **P10_safe_apply_verify_before_merge** · done
- **P11_agent_council** · done
- **P12_fault_logging_first_class** · done
- **P13_roundtable_shared_council_chat** · done
- **P14_emergence_axioms_endstate** · done
- **P15_forge_shell_into_loom** · pending
- **P16_architect_node_canvas_in_loom** · pending
- **P17_blueprint_builder_onto_canvas** · pending
- **P18_tv_ui_triage** · pending
- **P19_tablet_continue** · pending
- **P20_intelligence_reads_present_not_oldest** · pending
- **P21_loom_boundary_import_hooks** · pending
- **P22_scanner_hand_map_id_drift** · pending

</details>

<details>
<summary>`docs/loom-phasemap-section-phasemap.spec` · 3 · 3 done, 0 in progress, 0 pending</summary>

- **LP1_phasemap_scanner** · done
- **LP2_split_by_system** · done
- **LP3_loom_section** · done

</details>

<details>
<summary>`docs/idearium-repository-overhaul-phasemap.spec` · 13 · 12 done, 0 in progress, 1 pending</summary>

- **MCO0_audit_real_coverage** · done
- **MCO-A_schemas** · done
- **MCO-B_versionium_bridge** · done
- **MCO-C_repo_materialize** · done
- **MCO1_graph_layer** · done
- **MCO2_verification_deepening** · done
- **MCO-E_roadmap_ui** · done
- **MCO4_hooks_wires_flows_tools** · done
- **MCO3_snapshot_compliance** · done
- **MCO-F_config** · done
- **MCO-D_zoom_subrepo** · pending
- **MCO6_compartment_ownership** · done
- **MCO-G_git_cicd_credentials** · done

</details>

<details>
<summary>`docs/idearium-creative-repo-overhaul-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **MCO-A_schemas** · done
- **MCO-B_versionium_bridge** · done
- **MCO-C_repo_materialize** · done
- **MCO-D_zoom_subrepo** · done
- **MCO-E_roadmap_ui** · done
- **MCO-F_config** · done
- **MCO-G_cicd_ssh** · done

</details>

<details>
<summary>`docs/gemini-multiagent-coding-phasemap.spec` · 5 · 2 done, 0 in progress, 3 pending</summary>

- **P1_per_agent_contracts** · done
- **P2_tree_parse_recall_injection** · done
- **P3_line_block_seam_sync** · pending
- **P4_structured_agent_to_agent** · pending
- **P5_autonomous_multiagent_loop** · pending

</details>

<details>
<summary>`docs/cortex-schema-registry-phasemap.spec` · 9 · 7 done, 0 in progress, 2 pending</summary>

- **P1_schema_table_in_cortex** · done
- **P2_conformance_check_lib** · done
- **P3_observe_on_write_no_block** · done
- **P4_editable_surface** · pending
- **P5_expectation_for_consumers** · pending
- **UM1_schema_for_user_model** · done
- **UM2_query_on_every_path** · done
- **UM3_richer_capture** · done
- **UM4_editable_self_optimizing_surface** · done

</details>

<details>
<summary>`docs/copilot-omniscience-phasemap.spec` · 8 · 7 done, 0 in progress, 1 pending</summary>

- **P1_copilot_tool_loop** · done
- **P2_persistence_threaded** · done
- **P3_continuous_stream_to_copilot** · done
- **P4_guardian_tool_loop** · done
- **P5_faculties_as_tools** · done
- **P6_every_system_reachable** · done
- **P7_stream_to_all_systems** · done
- **P4_gate_never_actually_verified** · pending

</details>

<details>
<summary>`docs/copilot-guardian-cos-expansion-phasemap.spec` · 10 · 3 done, 0 in progress, 7 pending</summary>

- **GA1_guardian_nexus_reconciliation** · pending
- **GA2_diagnostic_system_depth** · done
- **GA3_guardian_userscript_capability_wiring** · pending
- **GA4_lib_meta_as_cortex_tools** · pending
- **GA5_history_and_spec_integrity** · done
- **GA6_spec_builder_depth** · pending
- **GA7_clear_glass_guardian_userscript_expansion** · pending
- **GA8_sse_announcements** · done
- **GA9_cos_expansion_via_copilot** · pending
- **GA10_copilot_capability_self_awareness** · pending

</details>

<details>
<summary>`docs/copilot-full-capability-phasemap.spec` · 11 · 11 done, 0 in progress, 0 pending</summary>

- **P1_cross_agent_recall** · done
- **P2_never_say_no_completion** · done
- **P3_cos_toolkit_tools** · done
- **P4_raid_snr_query_tool** · done
- **P5_clear_glass_url_tools** · done
- **P6_identity_naming** · done
- **P7_continuous_nerve_dom_to_ollama** · done
- **P8_rewind_replay_tool** · done
- **P9_meta_systems_toolkit** · done
- **P10_load_balancer** · done
- **P11_nexus_help_tool** · done

</details>

<details>
<summary>`docs/copilot-awareness-routing-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **CA1_status_report** · done
- **CA2_tool_self_awareness** · done
- **CA3_tool_first** · done
- **CA4_capability_extend** · done
- **CA5_intent_routing** · done
- **CA6_routing_config** · done
- **CA7_clearglass_multi_account** · done

</details>

<details>
<summary>`docs/copilot-autonomous-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **CA1_scheduler** · done
- **CA2_triggers_conditions** · done
- **CA3_pipeline_chains** · done
- **CA4_connections** · done
- **CA5_system_control_and_clearglass** · done
- **CA6_self_building_commands** · done
- **CA7_constant_autonomy** · done

</details>

<details>
<summary>`docs/clearglass-agent-suite-and-cfr-loom-phasemap.spec` · 16 · 2 done, 0 in progress, 14 pending</summary>

- **TX1_clearglass_agent_suite_composition** · pending
- **TX2_sequential_event_queue** · pending
- **TX3_talk_to_agent_launcher** · pending
- **TX4_provider_tab_tool_loop** · pending
- **TX5_backup_snapshot_for_talk_to_agent** · done
- **TX6_stop_using_this_chat_migration** · pending
- **TX7_cfr_diagnostic_for_loom** · pending
- **TX8_3d_cfr_visual_for_loom** · pending
- **TX9_build_contract_file_dir** · pending
- **TX10_component_registry_discipline** · pending
- **TX11_plugin_architecture_decision** · done
- **TX14_plugin_system_v1_build** · pending
- **TX12_bookmark_reconciliation** · pending
- **TX13_browser_chrome_backlog** · pending
- **TX15_whisper_as_a_real_optional_capability** · pending
- **TX16_persistent_listener_registry_and_callable_elements** · pending

</details>

<details>
<summary>`docs/agent-model-and-user-continuity-phasemap.spec` · 10 · 1 done, 0 in progress, 9 pending</summary>

- **AM1_per_agent_learned_model** · pending
- **AM2_incident_debrief** · pending
- **AM3_open_ended_grounded_conversation** · pending
- **AM4_full_user_continuity** · pending
- **AM5_ambiguity_triggered_pull** · pending
- **AM6_perplexity_confidence_loop** · pending
- **AM7_agent_switch_continuity_and_chat_recall** · pending
- **AM8_lifeline_as_general_channel_and_reasoning_upgrade** · done
- **AM9_get_to_know_you_and_idea_capture** · pending
- **AM10_thinking_partner_rename_and_ui_builder** · pending

</details>

<details>
<summary>`docs/agent-intelligence-loop-phasemap.spec` · 5 · 5 done, 0 in progress, 0 pending</summary>

- **AP1_pull_toolbox** · done
- **AP2_agent_events_to_intelligence** · done
- **AP3_strategy_dynamic_db** · done
- **AP4_intelligence_optimizes** · done
- **AP5_autonomous_build_loop** · done

</details>

<details>
<summary>`docs/2026-10-18-gating-census-phasemap.spec` · 7 · 1 done, 0 in progress, 6 pending</summary>

- **L0_the_record_tells_the_truth** · pending
- **L1_primitives_no_decision** · pending
- **L2_one_of_each** · pending
- **L3_needs_GM0a** · pending
- **L4_above** · pending
- **GC0_the_census** · done
- **GC1_layer_one** · pending

</details>

<details>
<summary>`docs/2026-10-18-gate-memory-phasemap.spec` · 8 · 2 done, 0 in progress, 6 pending</summary>

- **GM1_the_gate_record** · pending
- **GM2_restarts_resume_from_records** · pending
- **GM3_the_fulfilled_contract_index** · pending
- **GM4_the_node_lattice** · done
- **GM5_the_context_ladder** · done
- **GM6_crystallized_from_what_was_approved** · pending
- **GM7_the_context_panel_per_gate** · pending
- **GM8_agents_have_it** · pending

</details>

<details>
<summary>`docs/2026-10-18-debugging-product-phasemap.spec` · 8 · 0 done, 0 in progress, 8 pending</summary>

- **DBG1_the_key** · pending
- **DBG2_the_case** · pending
- **DBG3_deviation_and_friction_per_run** · pending
- **DBG4_dependency_gaps** · pending
- **DBG5_rewind_from_a_case** · pending
- **DBG6_cases_crystallize** · pending
- **DBG7_route_command_ui** · pending
- **DBG8_in_the_product** · pending

</details>

<details>
<summary>`docs/2026-10-17-system-drawbridge-phasemap.spec` · 19 · 4 done, 0 in progress, 15 pending</summary>

- **DB1_the_census_and_the_ratchet** · done
- **DB2_the_registry_says_what_it_offers** · pending
- **DB3_the_drawbridge** · pending
- **DB4_one_bus_per_system** · pending
- **DB5_the_handshake_for_every_system** · pending
- **DB6_move_the_crossings** · pending
- **DB7_the_ui_floats_on_top** · pending
- **DB8_agents_have_it** · pending
- **DB9_every_repo_generates_its_registry** · pending
- **DB10_shadow_and_negative_space_at_the_drawbridge** · pending
- **DB11_cos_compartment_per_system** · pending
- **DB12_the_ui_handshake** · pending
- **DB13_the_tunnel** · done
- **DB14_heartbeat_over_routes** · pending
- **DB15_toasts_declared** · pending
- **DB16_a_registry_for_each_system** · pending
- **DB17_files_stay_with_their_system** · pending
- **DB18_nodes_in_relation_to_their_system** · done
- **P33_slices** · done

</details>

<details>
<summary>`docs/2026-10-17-pieces-not-order-phasemap.spec` · 6 · 0 done, 0 in progress, 6 pending</summary>

- **PC1_the_point_first** · pending
- **PC2_any_order** · pending
- **PC3_verified_alone_resumed_by_recheck** · pending
- **PC4_a_procedure_per_kind** · pending
- **PC5_control_when_he_chooses** · pending
- **PC6_assembled_and_checked_whole** · pending

</details>

<details>
<summary>`docs/2026-10-17-infrastructure-migration-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **IM1_the_shape_census_as_a_command** · pending
- **IM2_clean_the_redundant** · pending
- **IM3_wire_what_exists** · pending
- **IM4_the_kernel_boundary** · pending
- **IM5_each_system_to_the_template** · pending
- **IM6_cortex_unclumped** · pending
- **IM7_the_ui_on_the_registry** · pending

</details>

<details>
<summary>`docs/2026-10-17-failure-mode-report-phasemap.spec` · 12 · 2 done, 0 in progress, 10 pending</summary>

- **FMR0_causality_measured** · done
- **FMR1_every_ledger_into_rfr2** · pending
- **FMR2_every_failure_reaches_the_record** · pending
- **FMR3_the_report** · done
- **FMR4_the_macro_bundle** · pending
- **FMR5_replay_routes** · pending
- **FMR6_run_it_in_cos** · pending
- **FMR7_a_fix_proven_by_its_macro** · pending
- **FMR8_the_report_on_screen** · pending
- **FMR9_agents_have_it** · pending
- **FMR10_it_compounds** · pending
- **FMR11_import_into_any_test_env** · pending

</details>

<details>
<summary>`docs/2026-10-17-debugging-product-phasemap.spec` · 12 · 0 done, 0 in progress, 12 pending</summary>

- **DP1_the_doors** · pending
- **DP2_one_gap_door** · pending
- **DP3_runtime_deviation_reaches_the_diagnostic** · pending
- **DP4_every_ledger_into_rfr2** · pending
- **DP5_the_case** · pending
- **DP6_reproduce_in_cos** · pending
- **DP7_back_to_known_good** · pending
- **DP8_a_proven_fix** · pending
- **DP9_crystallize_the_fix** · pending
- **DP10_the_report_and_the_debug_tab** · pending
- **DP11_the_product_boundary** · pending
- **GD1_gaps_from_the_graph_for_any_repo** · pending

</details>

<details>
<summary>`docs/2026-10-16-tls-layer-phasemap.spec` · 3 · 3 done, 0 in progress, 0 pending</summary>

- **TLS1_helper** · done
- **TLS2_clear_glass_runs_it** · done
- **TLS3_personas_use_it** · done

</details>

<details>
<summary>`docs/2026-10-16-repo-carve-phasemap.spec` · 14 · 6 done, 0 in progress, 8 pending</summary>

- **CV1_carve_backend_route_command_ui** · done
- **CV2_untangle_with_rf0** · pending
- **PB1_the_product_boundary** · done
- **FR1_one_record_per_change** · done
- **FR2_tested_before_it_lands** · done
- **FR3_undo_any_change** · done
- **FR4_stands_alone** · pending
- **FR5_the_demo** · pending
- **FR6_flight_data** · done
- **FR7_the_causal_record** · pending
- **FR8_branches_for_benchmarks** · pending
- **FR9_sandboxed_in_compartments** · pending
- **FR10_stop_the_ladder** · pending
- **FR5_the_demo_note** · pending

</details>

<details>
<summary>`docs/2026-10-16-reject-learn-retry-phasemap.spec` · 4 · 4 done, 0 in progress, 0 pending</summary>

- **RL1_classify_the_rejection** · done
- **RL2_learn_then_retry** · done
- **RL3_stop_the_regression_before_it_reaches_him** · done
- **RL4_the_lessons_on_the_door** · done

</details>

<details>
<summary>`docs/2026-10-16-proposal-evidence-phasemap.spec` · 9 · 4 done, 0 in progress, 5 pending</summary>

- **PE1_test_map** · done
- **PE2_evidence** · done
- **PE3_wired_and_gated** · done
- **PE4_rejection_context** · done
- **PE5_show_it** · pending
- **PE6_tests_first** · pending
- **PE7_comparison_engine** · pending
- **PE8_learn** · pending
- **PE9_infrastructure_failures** · pending

</details>

<details>
<summary>`docs/2026-10-16-plan-sidebar-phasemap.spec` · 3 · 3 done, 0 in progress, 0 pending</summary>

- **PS1_context_recorded** · done
- **PS2_plan_panel_three_cards** · done
- **PS3_the_rest_their_own_panels** · done

</details>

<details>
<summary>`docs/2026-10-16-nexus-git-sync-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **GS0_authority** · pending
- **GS1_commands** · pending
- **GS2_nexus_as_a_repo** · pending
- **GS3_pull_is_a_switch** · pending
- **GS4_push_policy** · pending
- **GS5_release_alignment** · pending
- **GS6_update_notice** · pending

</details>

<details>
<summary>`docs/2026-10-16-mobile-compartments-phasemap.spec` · 6 · 2 done, 0 in progress, 4 pending</summary>

- **MB1_terminal_passthrough** · done
- **MB2_android_compartment** · pending
- **MB3_testenv_stacks** · pending
- **MB4_apple_via_a_real_mac** · pending
- **MB5_language_checks** · done
- **MB6_everything_else** · pending

</details>

<details>
<summary>`docs/2026-10-16-intent-hat-agent-chain-phasemap.spec` · 5 · 0 done, 0 in progress, 5 pending</summary>

- **IH1_intent_nodes_point_at_hats** · pending
- **IH2_agents_bound** · pending
- **IH3_routers_read_the_chain** · pending
- **IH4_api_command_ui** · pending
- **IH5_proof_and_wiring** · pending

</details>

<details>
<summary>`docs/2026-10-16-google-signin-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **GS1_present_as_firefox_on_google_signin** · done
- **GS2_request_hooks_compose** · done
- **GS3_domains_and_version** · done
- **GS4_page_without_a_debugger** · done
- **GS5_contexts_one_firefox** · done
- **GS6_proxy** · done
- **GS7_no_debugger_on_signin** · done

</details>

<details>
<summary>`docs/2026-10-16-eravos-removal-phasemap.spec` · 3 · 3 done, 0 in progress, 0 pending</summary>

- **ER1_delete_the_system** · done
- **ER2_unwire_the_platform** · done
- **ER3_unwire_the_screens** · done

</details>

<details>
<summary>`docs/2026-10-16-durable-work-timeline-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **TL0_find_the_loss** · pending
- **TL1_chunks_land_as_they_arrive** · pending
- **TL2_resume_at_boot** · pending
- **TL3_the_timeline** · pending
- **TL4_rewind_to_a_gate** · pending
- **TL5_the_code_tab_timeline** · pending
- **TL6_proof_and_wiring** · pending

</details>

<details>
<summary>`docs/2026-10-16-cos-console-phasemap.spec` · 12 · 0 done, 0 in progress, 12 pending</summary>

- **CON1_one_door_client** · pending
- **CON2_grammar_and_completion** · pending
- **CON3_system_controls** · pending
- **CON4_safety_gate** · pending
- **CON5_pane** · pending
- **CON6_shell_escape** · pending
- **CON7_enterprise_bar** · pending
- **CON8_nexus_server_hook** · pending
- **CON1_one_door_client** · pending
- **CON3_system_controls** · pending
- **CON8_nexus_server_hook** · pending
- **CON9_configure** · pending

</details>

<details>
<summary>`docs/2026-10-16-code-tab-rebuild-phasemap.spec` · 11 · 2 done, 0 in progress, 9 pending</summary>

- **TB0_decisions** · pending
- **TB1_read_model_per_tab** · pending
- **TB2_persistence_audit** · pending
- **TB3_close_the_persistence_gaps** · pending
- **TB4_reuse_responses** · pending
- **TB5_tab_shell** · pending
- **TB6_files_changes_plans_cos_tabs** · pending
- **TB7_runs_tab** · pending
- **TB8_proof_and_wiring** · pending
- **DK1_procedures_backend** · done
- **DK2_the_dock** · done

</details>

<details>
<summary>`docs/2026-10-16-canvas-compartments-phasemap.spec` · 6 · 5 done, 0 in progress, 1 pending</summary>

- **CN1_canvas_archetype** · done
- **CN2_tool_archetypes** · done
- **CN3_nested_compartments** · done
- **CN4_workshop_templates** · done
- **CN5_idearium** · done
- **CN6_canvas_screen** · pending

</details>

<details>
<summary>`docs/2026-10-16-agent-work-funnel-phasemap.spec` · 5 · 1 done, 0 in progress, 4 pending</summary>

- **FN0_the_funnel_as_data** · done
- **FN1_every_door_goes_through_it** · pending
- **FN2_what_is_missing_is_made_first** · pending
- **FN3_every_answer_a_node** · pending
- **FN4_the_screen** · pending

</details>

<details>
<summary>`docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec` · 14 · 12 done, 0 in progress, 2 pending</summary>

- **WB0_census** · done
- **WB1_warp_at_the_rung** · done
- **WB2_raid_bricks_and_officiator_through_warp** · done
- **SF1_intent_blocks** · done
- **SF2_spec_framework_block** · done
- **SF3_collect_the_spec** · done
- **SF4_compile_on_collect** · done
- **IS1_intent_settings_per_repo** · pending
- **PT1_specs_tagged_per_phase** · done
- **PT2_phases_tagged_by_system_repo** · done
- **MP1_nexus_maps_every_phase** · done
- **MP2_automatic_in_every_repo** · done
- **MP3_builds_get_the_mapped_context** · done
- **MP4_a_model_only_where_nothing_maps** · pending

</details>

<details>
<summary>`docs/2026-10-15-spec-foundation-model-phasemap.spec` · 7 · 0 done, 1 in progress, 6 pending</summary>

- **SF1_foundation_field** · pending
- **SF2_state_and_gate** · pending
- **SF3_evidence_not_claims** · pending
- **SF4_the_listener** · in-progress
- **SF5_hat_intent_injection** · pending
- **SF6_addenda_view** · pending
- **SF7_get_his_run_current** · pending

</details>

<details>
<summary>`docs/2026-10-15-personal-chat-import-phasemap.spec` · 9 · 0 done, 0 in progress, 9 pending</summary>

- **PI0_where_it_is_read** · pending
- **PI1_the_importer** · pending
- **PI2_the_listener** · pending
- **PI3_the_intelligence_pass** · pending
- **PI4_the_review_screen** · pending
- **PI5_the_sync** · pending
- **PI6_the_firefox_script** · pending
- **PI5_the_crawler** · pending
- **PI7_the_links** · pending

</details>

<details>
<summary>`docs/2026-10-15-one-contract-raid-releases-phasemap.spec` · 11 · 7 done, 0 in progress, 4 pending</summary>

- **RD0_raid_runs_the_contract** · done
- **RD1_every_build_goes_through_raid** · pending
- **BR1_bricks_on_every_path** · done
- **GS1_a_snapshot_per_gate_rewind_and_compare** · done
- **BR2_recursion_to_a_depth** · done
- **RN1_versionium_tags_and_releases** · done
- **RN2_changelog_from_the_commits** · done
- **RN3_releases_in_idearium** · done
- **AT1_atlases_and_specs_from_releases** · pending
- **FR1_failure_reports** · pending
- **ST1_stability_checks** · pending

</details>

<details>
<summary>`docs/2026-10-15-macro-node-recording-phasemap.spec` · 18 · 3 done, 0 in progress, 15 pending</summary>

- **MR0_where_the_file_lives** · pending
- **MR1_live_node** · done
- **MR2_richer_events** · done
- **MR3_dialog** · done
- **MR4_listener_as_nodes** · pending
- **MR5_role_tags** · pending
- **MR6_macro_to_automation** · pending
- **MR7_hotkeys_scope** · pending
- **MR12_p2p_scope** · pending
- **MR13_finance_field** · pending
- **MR7_bind_and_trigger** · pending
- **MR8_virtual_mouse_record** · pending
- **MR9_page_event_record** · pending
- **MR10_capabilities_as_steps** · pending
- **MR11_into_nexus** · pending
- **MR12_magnet_p2p** · pending
- **MR13_hypothesis_tracker** · pending
- **MR14_tasks_and_mesh_spec** · pending

</details>

<details>
<summary>`docs/2026-10-15-gate-held-work-phasemap.spec` · 24 · 1 done, 0 in progress, 23 pending</summary>

- **GW0_what_is_a_gate** · done
- **GW1_the_baton** · pending
- **GW2_the_run_follows_the_gate** · pending
- **GW3_a_contract_is_traced** · pending
- **GW4_copilot_on_the_gates** · pending
- **GW5_agents_are_copilot** · pending
- **GW6_the_intelligence_system_on_every_gate** · pending
- **GW7_failure_macro_and_rewind** · pending
- **GW8_causal_graph_and_failure_mode_field** · pending
- **GW9_the_contract_panel** · pending
- **GW10_the_listener_knows_what_to_hear** · pending
- **GW11_a_snapshot_per_gate** · pending
- **GW12_desktop_is_optional** · pending
- **GW13_the_sandbox_door** · pending
- **GW14_copy_in_diff_out** · pending
- **GW15_every_file_tested** · pending
- **GW16_parallel_branches_benchmark** · pending
- **GW17_friction_and_tension_per_file** · pending
- **GW18_debug_by_bisect** · pending
- **GW22_find_before_generate** · pending
- **GW23_wire_what_exists** · pending
- **GW24_the_gate_holds_the_agent_gets_a_projection** · pending
- **GW25_the_systems_at_the_gate_moments** · pending
- **GW26_everything_declares_what_it_needs** · pending

</details>

<details>
<summary>`docs/2026-10-15-fiverr-ledger-phasemap.spec` · 4 · 1 done, 0 in progress, 3 pending</summary>

- **PF0_the_ledger** · done
- **PF1_the_sources** · pending
- **PF2_the_slots_into_a_gig** · pending
- **PF3_the_screen** · pending

</details>

<details>
<summary>`docs/2026-10-15-code-tab-run-state-phasemap.spec` · 20 · 17 done, 0 in progress, 3 pending</summary>

- **CE0_one_tab_or_two** · done
- **CV0_versioning_scope** · pending
- **CE1_the_run_state** · done
- **CE2_the_task_header** · done
- **CE3_reply_on_task_gate** · done
- **CE4_reply_kind_and_tags** · done
- **CE5_events** · done
- **CE6_one_tab** · done
- **CE7_ai_assisted_editing** · done
- **CE8_the_cli_reads_the_surface** · done
- **CE9_the_panels** · done
- **CE10_lost_jobs_fall_back** · done
- **CE11_contract_panel_and_context** · pending
- **CE12_proof_and_wiring** · done
- **CV1_one_menu** · done
- **CV2_a_version_per_diff** · done
- **CV3_file_rewind** · done
- **CV4_tagged_history** · done
- **CV5_universal_versioning** · pending
- **CV6_phases_in_idearium** · done

</details>

<details>
<summary>`docs/2026-10-15-clear-glass-surfaces-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **PF0_internal_vs_client_facing** · pending
- **PF1_read_the_log** · pending
- **PF2_the_items** · pending
- **PF3_the_section** · pending
- **CS1_one_popup_frame** · pending
- **CS2_settings_providers_and_accounts** · pending
- **CS3_clear_glass_users_as_plugins** · pending

</details>

<details>
<summary>`docs/2026-10-15-clear-glass-network-posture-phasemap.spec` · 27 · 0 done, 4 in progress, 23 pending</summary>

- **MR7_hotkeys_scope** · pending
- **MR12_p2p_scope** · pending
- **MR13_finance_field** · pending
- **NP0_binaries** · pending
- **NP1_compartment** · in-progress
- **NP2_policy_and_storage** · in-progress
- **NP3_apply_to_electron** · in-progress
- **NP4_webrtc** · pending
- **NP5_leak_test** · pending
- **NP6_settings** · pending
- **NP7_p2p** · pending
- **NP8_macro_hooks** · pending
- **NP9_sentinel_meaning** · pending
- **NP9_cli_first** · in-progress
- **NP10_browser_surface** · pending
- **NP11_context_menu** · pending
- **NP12_plugin_split** · pending
- **NP13_settings_html** · pending
- **NP14_macros_and_automation** · pending
- **NP15_kill_switch** · pending
- **NP16_default_quarantine** · pending
- **NP16_quarantine_pipeline** · pending
- **NP17_hold_primitive** · pending
- **NP18_freeze_plugin** · pending
- **NP0_binaries** · pending
- **NP19_passphrase** · pending
- **NP19_container** · pending

</details>

<details>
<summary>`docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec` · 6 · 3 done, 0 in progress, 3 pending</summary>

- **CS1_capability_spec_and_surface_check** · done
- **CS2_spec_the_unspecced** · pending
- **CS3_feature_starts_as_a_spec** · pending
- **SP1_semantic_page_tree** · done
- **SP2_semantic_addresses_for_the_field_map** · done
- **SP3_the_browser_agent_reads_the_tree** · pending

</details>

<details>
<summary>`docs/2026-10-15-automatic-tracking-phasemap.spec` · 12 · 2 done, 0 in progress, 10 pending</summary>

- **LA0_loom_or_architect** · pending
- **GT2_each_gate_tags_and_reports** · done
- **QA2_a_real_run** · pending
- **GA1_the_gate_assesses_before_it_spends** · done
- **KT1_observations_on_a_semantic_tree** · pending
- **CX1_context_from_the_dependencies** · pending
- **CP1_the_contract_panel** · pending
- **AU1_addenda_written_for_you** · pending
- **CS1_every_brick_a_component** · pending
- **RT2_routed_by_intent_account_and_fallback** · pending
- **MC1_macros_from_repeats** · pending
- **LA1_one_self_model** · pending

</details>

<details>
<summary>`docs/2026-10-13-projects-raid-and-gates-phasemap.spec` · 21 · 8 done, 0 in progress, 13 pending</summary>

- **NT0_notes** · done
- **PL0_his_projects_imported_for_real** · done
- **PL1_many_projects_at_once** · pending
- **PL2_history_kept** · done
- **PL3_versions_become_history** · done
- **PL4_import_reports_what_is_broken** · done
- **VM0_versionium_managed_per_repo** · done
- **RF0_architecture_read** · pending
- **RF1_migration_proposed_as_phases** · pending
- **RF2_applied_one_phase_at_a_time** · pending
- **PL5_specs_become_the_roadmap** · pending
- **PL6_global_links_seen** · pending
- **RD0_raid_has_its_own_contract** · pending
- **RD1_raid_commands** · pending
- **RD2_idearium_routes_through_raid** · pending
- **RD3_the_registry_carries_events** · pending
- **RD4_the_fulfilled_contract_is_one_file** · pending
- **CK0_the_catalogue_written** · done
- **CK1_the_catalogue_runs** · pending
- **WF0_workflows** · pending
- **LM0_loom_wires_have_stable_ids** · done

</details>

<details>
<summary>`docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec` · 12 · 7 done, 0 in progress, 5 pending</summary>

- **LN0_lines_tool** · done
- **IM0_intent_map_his_to_change** · done
- **CT0_the_contract_is_a_reference** · done
- **CT1_dynamic_chunking** · done
- **GT0_every_interaction_gated** · pending
- **MEM0_nexus_holds_everything** · pending
- **CX0_context_from_dependencies** · done
- **TD0_today_and_yesterday_working** · pending
- **PF0_profiles_linked_to_hats** · done
- **CT2_ingestion_as_contracts** · pending
- **SC0_scheduler** · done
- **EX0_executors_he_already_built** · pending

</details>

<details>
<summary>`docs/2026-10-13-identities-tabs-and-automation-phasemap.spec` · 18 · 5 done, 0 in progress, 13 pending</summary>

- **ID0_signed_in_where_he_signs_in** · done
- **ID1_identities** · pending
- **ID2_every_cookie_a_row** · pending
- **ID3_bookmarks_carry_the_identity** · pending
- **ID4_incognito** · pending
- **TB1_tab_is_a_view** · pending
- **TB2_new_tab_menu** · pending
- **TB3_browser_rebuilt** · pending
- **HM0_the_hat_keeps_a_model_of_the_repo** · pending
- **HM1_chatgpt_connection_kept** · pending
- **CU0_chat_url_reload_before_escalating** · done
- **IR0_intent_routing_for_reasoning** · done
- **NV0_scripts_injected_once** · done
- **NV1_words_to_elements** · pending
- **NV2_tell_clear_glass_what_to_do** · pending
- **MC0_recorder_records_the_tab** · done
- **MC1_steps_as_events_and_snapshots** · pending
- **MC2_hotkeys_for_macros** · pending

</details>

<details>
<summary>`docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec` · 4 · 3 done, 0 in progress, 1 pending</summary>

- **GT1_gates_route_diagnose_retry** · done
- **RT1_eligibility_then_preference** · done
- **PF1_profiles_hats_tabs** · done
- **QA1_the_catalogue_runs** · pending

</details>

<details>
<summary>`docs/2026-10-12-request-spine-phasemap.spec` · 28 · 1 done, 0 in progress, 27 pending</summary>

- **RQ0_the_inventory_proved** · pending
- **RQ1_the_verifier_library** · pending
- **RQ2_the_generation_failure_vocabulary_and_index** · pending
- **RQ3_repair_with_the_checks_own_words** · pending
- **RQ4_escalate_on_the_checks_and_keep_the_lesson** · pending
- **RQ5_the_small_model_baseline** · pending
- **RQ6_one_intent_map** · pending
- **RQ7_the_context_obligations** · pending
- **RQ8_the_gap_is_a_question** · pending
- **RQ9_the_chunked_contract** · pending
- **RQ10_anchors_and_the_diff_reconciled** · pending
- **RQ11_spec_and_registry_reconciled** · pending
- **RQ12_the_phase_dag** · pending
- **RQ13_the_work_surface_and_provenance** · pending
- **RQ14_the_spine_end_to_end** · pending
- **RQ15_cells_in_parallel** · pending
- **RQ16_hypotheses_in_parallel** · pending
- **RQ17_observe_by_request** · pending
- **RQ18_test_and_attack_intents** · pending
- **RQ19_what_nexus_can_take_over** · pending
- **RQ20_the_budget_meter** · pending
- **RQ21_the_contract_file_is_its_record** · pending
- **RQ22_the_dependency_boundary_with_invariants_that_run** · pending
- **RQ23_acceptance_conditions_that_cannot_be_moved** · pending
- **RQ24_the_gate_transaction** · done
- **RQ25_progress_is_evidence_not_activity** · pending
- **RQ26_comparison_and_drift_on_real_signals** · pending
- **RQ27_the_reasoning_half_gets_its_home** · pending

</details>

<details>
<summary>`docs/2026-10-12-browser-providers-and-work-phasemap.spec` · 32 · 7 done, 2 in progress, 23 pending</summary>

- **TB0_the_webview_session_proved** · pending
- **TB1_a_tab_is_its_own_webview** · pending
- **TB2_a_tab_runs_as_an_account** · pending
- **TB3_tabs_are_compartments** · pending
- **TB4_bookmark_checklists** · pending
- **TB5_site_and_account_nodes** · pending
- **TB6_element_endpoints** · pending
- **TB7_human_tabs_never_spoofed** · in-progress
- **PV0_claude_code_is_a_guardian_provider** · pending
- **PV1_providers_read_from_nodes** · pending
- **PV2_hats_are_nodes** · pending
- **PV3_input_nodes** · pending
- **PV4_inputs_are_history** · pending
- **PV5_conversation_carries_across_providers** · done
- **PV6_raid_reads_health_everywhere** · done
- **JB0_gig_files** · done
- **JB1_the_agent_writes_the_gig_file** · pending
- **JB2_the_copilot_hat_agent_and_account** · pending
- **JB3_autofill_fields_mapped_by_pick** · pending
- **JB4_resume_import** · pending
- **JB5_varied_wording_true_facts** · pending
- **JB6_the_application_ledger** · pending
- **JB7_the_follow_up** · pending
- **MX0_phases_tagged_to_components** · pending
- **MX1_nothing_built_unmapped** · pending
- **MX2_the_0_60_components_wired_in_loom** · in-progress
- **MX4_one_system_digest** · pending
- **RN0_the_renderer_as_a_cos_window** · done
- **CS0_projects_decomposed_into_components** · done
- **CS1_drop_zips_to_decompose** · done
- **CS2_uploaded_projects_managed** · pending
- **AS1_provider_tab_runs_as_the_default_account** · done

</details>

<details>
<summary>`docs/2026-10-10-snapshot-compartments-phasemap.spec` · 5 · 0 done, 0 in progress, 5 pending</summary>

- **SN0_one_branch** · pending
- **SN1_open_a_snapshot_as_a_compartment** · pending
- **SN2_run_in_parallel** · pending
- **SN3_measured_by_rfr2** · pending
- **SN4_benchmarks_teach** · pending

</details>

<details>
<summary>`docs/2026-10-10-shape-of-nexus-phasemap.spec` · 18 · 7 done, 1 in progress, 10 pending</summary>

- **OP0_one_options_shape_for_every_system** · done
- **OP1_every_system_declares_its_options** · in-progress
- **OP2_the_system_settings_in_its_repo** · done
- **OP3_copilot_reads_and_sets_options** · done
- **OP4_environment_and_desktop_one_menu** · done
- **TU1_the_nexus_tutorial** · pending
- **CG1_the_field_injects_once** · pending
- **FN1_the_field_as_commands** · done
- **FN2_nerve_sees_the_field** · done
- **FN3_the_nerve_shows_it_and_the_field_sees_the_nerve** · done
- **CG2_one_source_of_truth_for_the_browser** · pending
- **CG3_the_fiverr_tutorial_in_the_browser** · pending
- **EP1_every_claim_says_how_it_is_known** · pending
- **EP2_cos_is_the_empirical_layer** · pending
- **SH1_one_home_for_every_concept** · pending
- **SH2_explain_this_anywhere** · pending
- **LR0_the_shared_primitives_are_the_glyph** · pending
- **LR1_each_component_in_the_language_that_fits** · pending

</details>

<details>
<summary>`docs/2026-10-10-self-awareness-phasemap.spec` · 6 · 0 done, 0 in progress, 6 pending</summary>

- **AW0_no_guessed_causes** · pending
- **AW1_guardian_reflected_in_nodes** · pending
- **AW2_every_call_says_who_asked** · pending
- **AW3_the_field_hears_the_lifecycle** · pending
- **AW4_the_door_reads_the_lattice** · pending
- **AW5_its_own_face** · pending

</details>

<details>
<summary>`docs/2026-10-10-idearium-solid-phasemap.spec` · 17 · 4 done, 0 in progress, 13 pending</summary>

- **SD0_versionium_down_is_said_and_restarted** · done
- **SD1_rewind_and_versions_on_the_repo_card** · done
- **SD2_copilot_never_answers_ok_with_nothing** · done
- **SD3_the_person_goes_first** · done
- **SD4_agents_live_in_guardian** · pending
- **SD5_account_fallback** · pending
- **SD6_an_idea_logged_asked_expanded** · pending
- **SD7_blocks_that_generate_themselves** · pending
- **SD8_an_agent_can_see_and_fix_a_tab** · pending
- **SD9_claude_code_inside_idearium** · pending
- **SD10_the_adversarial_gate** · pending
- **SD11_the_desktop_inside_idearium** · pending
- **SD12_a_spec_starts_from_its_primitives** · pending
- **SD13_the_machine_is_cos** · pending
- **SD14_chunks_cut_at_primitives** · pending
- **SD15_no_website_can_drive_nexus** · pending
- **SD16_a_plan_step_never_proposes_code** · pending

</details>

<details>
<summary>`docs/2026-10-10-idearium-access-phasemap.spec` · 8 · 5 done, 0 in progress, 3 pending</summary>

- **IA0_the_door_checks_who_is_asking** · done
- **IA1_the_routes** · done
- **IA2_the_command** · done
- **IA3_the_screens** · done
- **IA4_clear_glass_signs_in_for_you** · done
- **IA5_provider_accounts_per_hat_and_repo** · pending
- **IA6_every_local_caller_carries_the_key** · pending
- **IA7_the_hat_is_the_actor** · pending

</details>

<details>
<summary>`docs/2026-10-10-design-surface-phasemap.spec` · 9 · 0 done, 0 in progress, 9 pending</summary>

- **DS0_one_token_source** · pending
- **DS1_tokens_edited_live** · pending
- **DS2_pick_and_edit_any_page** · pending
- **DS3_components_are_mods** · pending
- **DS4_interface_types_by_adapter** · pending
- **DS5_the_agents_design_too** · pending
- **DS6_one_module_contract_nested** · pending
- **DS7_tools_are_mods** · pending
- **DS8_the_registry_routes_the_ui_reflects** · pending

</details>

<details>
<summary>`docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec` · 4 · 0 done, 0 in progress, 4 pending</summary>

- **TN1** · pending
- **TN2** · pending
- **TN3** · pending
- **TN4** · pending

</details>

<details>
<summary>`docs/2026-10-09-one-roadmap-phasemap.spec` · 9 · 5 done, 1 in progress, 3 pending</summary>

- **OR0_the_census** · done
- **OR1_five_answers_for_an_open_phase** · pending
- **OR2_how_done_is_checked** · done
- **OR2_the_proposal** · done
- **OR3_his_decisions_applied** · done
- **OR6_old_code_out** · in-progress
- **OR7_the_shelf_combed** · done
- **OR4_one_roadmap_in_idearium** · pending
- **OR5_it_stays_decluttered** · pending

</details>

<details>
<summary>`docs/2026-10-09-one-model-engine-phasemap.spec` · 16 · 0 done, 0 in progress, 16 pending</summary>

- **ME0_the_inventory_proved** · pending
- **ME1_one_failure_list** · pending
- **ME2_caller_policy** · pending
- **ME3_one_engine_one_budget** · pending
- **ME4_one_attempt_record** · pending
- **ME5_one_chooser** · pending
- **ME6_one_learner** · pending
- **ME7_raid_spine_joins** · pending
- **ME8_the_drainers_run_the_engine** · pending
- **ME9_the_layers_below_report** · pending
- **ME10_nested_ladders_folded** · pending
- **ME11_old_settings_translated** · pending
- **ME12_callers_moved** · pending
- **ME13_no_bypass** · pending
- **ME15_the_docs_tell_the_truth** · pending
- **ME14_across_callers** · pending

</details>

<details>
<summary>`docs/2026-10-09-hardening-pass-phasemap.spec` · 22 · 22 done, 0 in progress, 0 pending</summary>

- **HP1_stale_spreads_along_dependencies** · done
- **HP2_interrupted_runs_are_said** · done
- **HP3_the_ladder_climbs_only_what_is_installed** · done
- **HP4_signals_weighted** · done
- **HP5_odd_files_round_trip** · done
- **HP6_the_build_surface_opens** · done
- **HP7_a_browser_agent_gets_its_wait** · done
- **HP8_the_ladder_says_why_ollama_is_missing** · done
- **HP9_the_plan_is_current_work** · done
- **HP10_the_work_surface_in_view** · done
- **HP11_a_reply_on_the_page_is_never_sent_again** · done
- **HP12_a_failure_names_the_agent** · done
- **HP13_the_failure_is_put_at_the_right_gate** · done
- **HP14_a_tab_that_does_not_take_the_job_is_said_in_seconds** · done
- **HP15_a_typed_prompt_is_never_sent_again** · done
- **HP16_a_job_nobody_waits_for_is_not_sent_later** · done
- **HP17_no_tab_is_said_in_seconds** · done
- **HP18_auto_tries_agents_with_a_tab_first** · done
- **HP19_the_simulator_stays** · done
- **HP20_a_routing_try_is_not_a_job** · done
- **HP21_the_economy_holding_a_job_is_said** · done
- **HP22_a_missing_tab_is_not_a_login_wall** · done

</details>

<details>
<summary>`docs/2026-10-07-versionium-releases-phasemap.spec` · 7 · 1 done, 0 in progress, 6 pending</summary>

- **VR1_every_change_a_commit** · done
- **VR2_history_and_diff** · pending
- **LT1_provenance_lattice** · pending
- **RN1_release_is_a_node_and_a_tag** · pending
- **RN2_cortex_is_the_bookkeeper** · pending
- **RN3_releases_section** · pending
- **GH1_the_git_bridge** · pending

</details>

<details>
<summary>`docs/2026-10-07-system-expectations-phasemap.spec` · 5 · 0 done, 0 in progress, 5 pending</summary>

- **EX1_the_expectation_schema** · pending
- **EX2_vitals_from_every_process** · pending
- **EX3_the_diagnostic_reads_expectations** · pending
- **EX4_intelligence_learns_the_normal** · pending
- **EX5_time_to_breach** · pending

</details>

<details>
<summary>`docs/2026-10-07-runtime-load-phasemap.spec` · 6 · 4 done, 0 in progress, 2 pending</summary>

- **PF1_the_stall** · done
- **PF2_velocity_steers_the_governor** · pending
- **PF3_append_not_rewrite** · done
- **PF4_hold_only_what_you_read** · done
- **PF5_bounded_tables** · done
- **PF6_slow_ticks_name_themselves** · pending

</details>

<details>
<summary>`docs/2026-10-07-ollama-recorder-phasemap.spec` · 5 · 3 done, 0 in progress, 2 pending</summary>

- **OR1_one_door** · done
- **OR2_every_call_a_frame** · done
- **OR3_the_cassette** · done
- **OR4_live_and_what_if** · pending
- **OR5_model_vitals** · pending

</details>

<details>
<summary>`docs/2026-10-07-idearium-one-surface-phasemap.spec` · 12 · 12 done, 0 in progress, 0 pending</summary>

- **OS1_commits_say_what_they_touched** · done
- **OS2_the_plan_panel_holds_it** · done
- **OS3_the_code_tab_knows_its_history** · done
- **OS4_every_agent_option_in_the_agent_tab** · done
- **OS5_settings_without_iframes** · done
- **OS6_proved_on_the_real_page** · done
- **OS7_one_proposal_surface** · done
- **SP1_phases_from_the_sections** · done
- **SP2_complete_the_blanks** · done
- **SP3_the_file_tree_is_the_spine** · done
- **OS8_settings_agents_holds_every_agent_option** · done
- **OS9_the_agent_is_in_the_code_tab** · done

</details>

<details>
<summary>`docs/2026-10-07-heal-nodes-phasemap.spec` · 5 · 0 done, 0 in progress, 5 pending</summary>

- **HL0_runtime_faults_reach_the_ladder** · pending
- **HL1_the_heal_node** · pending
- **HL2_level_zero_reads_heals** · pending
- **HL3_heal_before_it_breaks** · pending
- **HL4_the_heal_ledger** · pending

</details>

<details>
<summary>`docs/2026-10-07-compartment-control-and-activity-phasemap.spec` · 15 · 11 done, 0 in progress, 4 pending</summary>

- **CC1_claude_code_lands_like_every_agent** · done
- **AL1_activity_log** · done
- **AL2_log_tab** · done
- **DT1_desktop_into_the_log** · done
- **VM1_checkpoints_on_the_log** · done
- **NC2_nexus_systems_as_compartments** · done
- **BO1_brainos_reads_the_log** · done
- **CM1_every_capability_a_command** · done
- **CM2_every_command_for_every_agent** · done
- **CM3_this_sessions_work_as_commands** · done
- **UI1_the_screens_for_cm3** · done
- **UN1_nexus_surfaces_in_the_field** · pending
- **SP1_one_spotlight** · pending
- **DC1_a_click_that_did_nothing** · pending
- **DX1_diagnose_it** · pending

</details>

<details>
<summary>`docs/2026-10-05-verified-primitives-phasemap.spec` · 8 · 2 done, 0 in progress, 6 pending</summary>

- **VP0_map_and_atlas** · done
- **VP1_confidence_from_evidence** · pending
- **VP2_adversarial_review** · pending
- **VP3_the_repo_model_of_the_user** · pending
- **VP4_the_primitive_field** · pending
- **VP5_provenance** · pending
- **VP6_debug_and_intelligence_in_the_desktop** · pending
- **VP7_the_settings_tab_in_categories** · done

</details>

<details>
<summary>`docs/2026-10-05-spec-workshop-rebuild-phasemap.spec` · 11 · 5 done, 0 in progress, 6 pending</summary>

- **RS1_the_generation_recorder** · pending
- **RS2_replay_rewind_branch** · pending
- **RS3_the_spec_document** · done
- **RS4_the_pipeline_on_warp2** · pending
- **RS5_the_template_picker** · done
- **RS6_the_workshop_as_the_editor** · pending
- **RS7_architect_and_blueprint_stations** · pending
- **RS8_what_converges_becomes_deterministic** · pending
- **RS9_the_thread** · done
- **RS10_the_phases_tab_rebuilt** · done
- **RS11_workshop_and_phases_one_surface** · done

</details>

<details>
<summary>`docs/2026-10-05-idea-to-spec-workshop-phasemap.spec` · 7 · 4 done, 0 in progress, 3 pending</summary>

- **WK0_pop_out_windows_borderless** · done
- **WK1_the_workshop_is_blocks_from_the_templates** · done
- **WK2_templates_edited_saved_removed** · done
- **WK3_the_agent_drafts_every_block** · done
- **WK4_the_void_feeds_the_workshop** · pending
- **WK5_lanes_feed_gaps_and_phases** · pending
- **WK6_enterprise_grade** · pending

</details>

<details>
<summary>`docs/2026-10-05-fiverr-guide-phasemap.spec` · 2 · 0 done, 0 in progress, 2 pending</summary>

- **FR1_the_guide** · pending
- **FR2_show_me_on_the_page** · pending

</details>

<details>
<summary>`docs/2026-10-05-failure-reproduction-phasemap.spec` · 4 · 0 done, 0 in progress, 4 pending</summary>

- **FM1_every_ledger_into_rfr2** · pending
- **FM2_a_failure_is_a_clip** · pending
- **FM3_run_it_in_cos** · pending
- **FM4_the_report** · pending

</details>

<details>
<summary>`docs/2026-10-05-cos-machines-phasemap.spec` · 9 · 1 done, 0 in progress, 8 pending</summary>

- **VM1_control_like_vmware** · done
- **OS1_compartments_as_operating_systems** · pending
- **OS2_images_downloaded_and_kept_current** · pending
- **AP1_android_build_compartment** · pending
- **AP2_test_on_the_android_compartment** · pending
- **AP3_release_like_an_enterprise** · pending
- **EL1_electron_compiler** · pending
- **SU1_the_setup_asks_the_os_and_its_version** · pending
- **SU2_every_language_and_the_repos_own_dependencies** · pending

</details>

<details>
<summary>`docs/2026-10-05-code-tab-and-one-router-phasemap.spec` · 9 · 9 done, 0 in progress, 0 pending</summary>

- **CT1_one_door_for_models** · done
- **CT2_it_learns_and_switches** · done
- **CT3_the_code_tab_is_the_work_surface** · done
- **CT4_ollama_checked_on_his_machine** · done
- **CT5_hooked_into_the_plan** · done
- **CT6_the_escalation_ladder** · done
- **CT7_the_plan_shows_current_work** · done
- **CT8_live_agent_activity** · done
- **CT9_the_plan_pull_tab** · done

</details>

<details>
<summary>`docs/2026-10-05-cli-data-code-phasemap.spec` · 26 · 15 done, 0 in progress, 11 pending</summary>

- **CL1_commands_declared_by_their_system** · pending
- **CL2_the_agent_tab_is_the_endpoint** · pending
- **DS1_cortex_the_catalog** · pending
- **DS2_one_system_moves_home** · pending
- **CT1_one_pending_change_path** · pending
- **CT2_the_code_tab** · pending
- **HG1_components_store_map_parses** · pending
- **HG2_loom_bootstrap_rejections** · pending
- **HG3_bv09_the_detector_and_files** · done
- **HG4_scripts_inside_the_sandbox** · pending
- **HG5_bootstrap_keeps_registration_times** · pending
- **HG6_scanner_status_vocabulary** · done
- **HG7_the_law_and_clear_glass** · done
- **HG8_raid_phases_belong_to_cortex** · done
- **HG9_persist_history_diff** · pending
- **SY1_fifteen_systems** · done
- **SY2_cos_its_own_system** · done
- **PB1_no_build_below_a_floor** · done
- **PB2_a_reply_that_changed_nothing_is_incomplete** · done
- **PB3_verify_counts_what_this_run_broke** · done
- **PB4_imports_inside_text_are_not_imports** · done
- **PB5_the_real_broken_imports** · done
- **LS1_the_bridge_job_holds_what_is_written_so_far** · done
- **LS2_copilot_sends_the_text_as_it_comes** · done
- **LS3_one_feed_for_every_agent** · done
- **LS4_live_in_the_code_tab_and_the_work_surface** · done

</details>

<details>
<summary>`docs/2026-10-05-build-from-the-spec-phasemap.spec` · 58 · 31 done, 0 in progress, 27 pending</summary>

- **SB0_map** · done
- **SB1_templates_are_the_default_frame** · done
- **SB2_his_words_seed_the_spec** · done
- **SB3_the_section_prompt_is_domain_agnostic** · done
- **SB4_template_fidelity** · pending
- **SB5_nexus_rebuilds_a_system_from_its_spec** · pending
- **SB6_hundreds_of_specs** · pending
- **SB7_domain_file_tree_templates** · pending
- **SB8_promote_with_full_block_options** · pending
- **SB9_the_spec_is_a_spec_file** · pending
- **SB10_reuse_first_keyed_on_the_contract** · pending
- **SB11_each_block_chunked** · pending
- **SB12_the_registry_is_the_component_list** · done
- **SB13_each_component_chunked** · pending
- **SB14_reuse_compounds** · pending
- **BC1_build_context** · done
- **BC2_the_build_agent_gets_all_of_the_hat_and_repo_context** · done
- **BC3_what_a_build_was_sent_as_a_node** · pending
- **BC4_relational_context_wired_or_archived** · done
- **SB15_empty_is_not_built** · pending
- **SB16_genesis_nodes_domain** · done
- **SB17_the_system_template_is_complete** · done
- **SB18_the_system_template_is_used** · pending
- **SB19_atlases_per_component** · pending
- **SB20_each_system_owns_its_own** · pending
- **SB21_deterministic_parts_grow_with_the_system** · pending
- **SB22_every_component_capability_command_events_as_nodes** · pending
- **SB23_a_new_system_slots_in** · pending
- **SB24_loom_builds_a_new_system** · pending
- **SB25_atlas_template_in_his_structure** · pending
- **SB26_an_imported_project_shows_its_progress** · pending
- **SB27_expanding_a_repo_keeps_its_spec_and_phases_current** · pending
- **SB28_genesis_in_the_shape_nexus_systems_have** · done
- **SB29_the_build_flow_in_his_order** · pending
- **SB30_the_template_is_a_skeleton** · done
- **SB31_every_new_repo_is_the_skeleton_the_idea_slots_in** · done
- **SB32_context_is_never_optional** · done
- **SB33_the_agent_runs_the_pipeline** · done
- **SB34_context_is_the_code_tab_the_graphs_and_memory** · done
- **SB35_the_index_is_there_when_the_agent_asks** · done
- **SB36_every_agent_can_use_the_tools** · done
- **SB37_the_working_set_signal_to_noise** · done
- **SB38_prerequisites_the_questions_first** · done
- **SB39_the_checklist_builds_the_working_set** · done
- **SB42_a_repo_expands_from_its_spec** · done
- **SB43_the_expansion_is_phased** · done
- **SB44_phases_are_chunked_then_coded** · done
- **SB45_skeletons_grey_until_coded** · done
- **SB46_every_step_by_hand** · pending
- **SB47_built_and_run_in_cos** · pending
- **SB48_proof_in_cos_closes_the_phase** · pending
- **SB49_an_idea_runs_through_by_itself** · pending
- **SB50_every_task_timestamped** · done
- **SB51_a_phase_built_in_chunks** · done
- **SB52_proven_on_the_proposed_code** · done
- **CH1_compartment_charter** · done
- **WS1_agents_use_the_work_surface** · done
- **WS2_the_work_surface_streams_the_writing** · done

</details>

<details>
<summary>`docs/2026-10-05-announce-pulse-repair-phasemap.spec` · 5 · 3 done, 0 in progress, 2 pending</summary>

- **PR1_the_announced_registry_is_the_list** · done
- **PR2_the_diagnostic_listens_not_polls** · done
- **PR3_negative_space_for_missed_heartbeats** · done
- **PR4_deviation_raises_the_bpm** · pending
- **PR5_repair_for_real** · pending

</details>

<details>
<summary>`docs/2026-10-02-workshop-codex-rewind-phasemap.spec` · 15 · 7 done, 0 in progress, 8 pending</summary>

- **RW1_rewind_engine_vm_snapshots** · pending
- **CX0_codex_component_store** · pending
- **BP1_destroy_and_rebuild_blueprint** · pending
- **SW1_spec_workshop** · done
- **SW2_workshop_page_in_the_voids_style** · done
- **AR2_architect_in_the_workshop** · done
- **AR3_one_architect_canvas** · done
- **AR4_pipeline_architect_on_the_canvas** · done
- **AR5_repo_architect_on_the_canvas** · done
- **PL1_one_entry_point** · pending
- **GD1_guardian_supervises_cos** · pending
- **DP1_desktop_popout_options** · pending
- **UI12_workshop_surface** · pending
- **WS7_the_full_workshop** · done
- **NX1_nexus_in_a_vm** · pending

</details>

<details>
<summary>`docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec` · 6 · 6 done, 0 in progress, 0 pending</summary>

- **VX1_versionium_degrades_not_crashes** · done
- **WS3_the_pipeline_together** · done
- **AZ1_semantic_zoom** · done
- **SY1_gap_synthesis_engine** · done
- **SY2_synthesis_surfaces** · done
- **LV1_fill_the_highest_leverage** · done

</details>

<details>
<summary>`docs/2026-10-02-spatial-void-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **V1_fonts_local** · done
- **V2_void_engine** · done
- **V3_ideas_carry_the_void** · done
- **V4_routes_and_cli** · done
- **V5_the_page** · done
- **V6_replaces_ideas_and_brainstorm** · done
- **V7_proof** · done

</details>

<details>
<summary>`docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec` · 8 · 0 done, 0 in progress, 8 pending</summary>

- **FG1_containment_tree** · pending
- **FG2_token_budget_chunking** · pending
- **FG3_summaries_up_the_tree** · pending
- **FG4_context_for_any_agent** · pending
- **FG5_recursive_build** · pending
- **FG6_relations_and_fractals** · pending
- **WS5_the_whole_workshop** · pending
- **UV1_versioned_ui_compartments** · pending

</details>

<details>
<summary>`docs/2026-10-02-emerge-field-memory-build-phasemap.spec` · 48 · 6 done, 0 in progress, 42 pending</summary>

- **EM0_ground** · done
- **EV0_contracts_for_every_system** · done
- **UI0_the_stations_agree** · pending
- **EM1_emerge_core** · done
- **EM2_warp_his_own** · pending
- **CF1_cfr_improved_with_rfr2** · pending
- **RF1_relational_field** · pending
- **OT1_one_write_path** · pending
- **MR1_recall_triad_and_context_table** · pending
- **MR2_vector_space_for_the_field** · pending
- **MR3_gap_driven_search** · pending
- **MR4_field_memory** · pending
- **MR5_fractal_levels_with_the_field** · pending
- **MR6_contradictions_held** · pending
- **MR7_recipes** · pending
- **MR8_crystallization** · pending
- **MR9_liminal_on_the_agents** · pending
- **MR10_the_field_between_james_and_the_agents** · pending
- **MR11_rewind_the_mind** · pending
- **CB1_cfr_build_logic** · pending
- **CB2_analysis_then_synthesis** · pending
- **CB3_the_causal_spec_block** · pending
- **CB4_the_emergence_loop_builds** · pending
- **WS6_workshop_parts_and_modes** · pending
- **RC1_the_repo_main_chat** · pending
- **LN1_lenses_on_the_canvas** · pending
- **EC6_economy_and_the_tokenizer** · pending
- **SH1_shadow_space** · pending
- **GA1_guardian_source_of_truth** · done
- **BT1_build_teams** · pending
- **FV1_client_jobs** · pending
- **FV0_fulfil_a_taken_order** · pending
- **ST1_settings** · pending
- **IN1_nexus_as_claude_codes_toolbox** · pending
- **IN2_claude_code_inside_nexus** · pending
- **AC1_accounts_into_agents** · pending
- **PR1_proof_run_the_delivery_checker** · done
- **PR2_screenshots_through_clear_glass** · pending
- **LB1_the_end_state_lab** · pending
- **FM1_mining_failure_modes** · pending
- **MS1_mental_simulation** · pending
- **RD1_raid_complete_or_build** · pending
- **DA1_domain_agnostic_end_states** · pending
- **GL1_the_graphs_as_a_model** · pending
- **PH1_phase_runs_end_in_proof** · done
- **GG1_graphs_generate_code** · pending
- **CL1_the_component_lab** · pending
- **CX0_codex_component_store** · pending

</details>

<details>
<summary>`docs/2026-10-01-work-visibility-job-reuse-phasemap.spec` · 11 · 3 done, 0 in progress, 8 pending</summary>

- **D0** · done
- **D1** · done
- **D2** · done
- **J0** · pending
- **J1** · pending
- **J2** · pending
- **J3** · pending
- **J4** · pending
- **J5** · pending
- **J6** · pending
- **J7** · pending

</details>

<details>
<summary>`docs/2026-10-01-routing-registry-genesis-phasemap.spec` · 10 · 10 done, 0 in progress, 0 pending</summary>

- **RG0_map** · done
- **RG1_routing_policy_library** · done
- **RG2_routing_config_api_cli** · done
- **RG3_dispatch_uses_the_route** · done
- **RG4_routing_ui** · done
- **RC1_registry_block** · done
- **RC2_registry_as_nodes** · done
- **GN1_genesis** · done
- **AR1_architecture_spec** · done
- **RG9_release** · done

</details>

<details>
<summary>`docs/2026-10-01-idearium-agent-ready-master-phasemap.spec` · 57 · 22 done, 0 in progress, 35 pending</summary>

- **M0_map** · done
- **PF1_sync_names_its_slow_step** · done
- **PF2_yielding_ingest** · done
- **PF3_snapshot_names_changed_files** · done
- **PF4_manifest_meta_sidecar** · done
- **PF5_in_place_spec_update** · done
- **PF6_boot_sync_yields_to_the_person** · pending
- **PF7_pipeline_scoped_to_changes** · pending
- **PF8_settings_console_one_cheap_read** · pending
- **PF9_boot_memory_census** · pending
- **PF10_clear_glass_err_aborted_9000** · pending
- **DT1_persistence_census** · pending
- **DT2_failure_mode_field** · done
- **DT3_failure_modes_routes_and_preflight** · pending
- **DT4_registry_block_to_nodes** · pending
- **DT5_pipeline_routing_spec** · done
- **DT6_node_store** · done
- **CI1_compounding_iterate** · pending
- **RM1_registry_driven_moves** · pending
- **HC1_hat_agent_to_cos_build** · pending
- **AG1_coding_agent_provider** · done
- **DK1_desktop_image_and_login** · done
- **DK2_desktop_setup_popup** · done
- **DK3_vm_engines** · pending
- **DK4_the_screen_through_remote_desktop** · pending
- **CP1_copilot_drives_idearium_and_talks_to_its_agents** · pending
- **UI1_history_and_save_in_manage** · pending
- **UI2_desktop_environment_menu** · pending
- **UI3_settings_tab_retheme_collapse** · pending
- **UI4_w7_open_items** · pending
- **UI5_work_surface_from_contracts** · pending
- **R1_release_per_phase** · done
- **CT1_cut_replies_are_finished** · done
- **BK1_blocked_is_actionable** · pending
- **BK2_phase_build_writes_code** · pending
- **UI6_idea_and_phases_one_tab** · pending
- **UI7_phasemaps_out_of_files_and_tree_ops** · pending
- **UI8_code_tab_is_code** · pending
- **UI11_nav_and_look_restored** · pending
- **UI9_plan_and_work_surface_panels** · pending
- **CX1_context_cascade** · pending
- **DI1_chunking_for_data_ingestion** · pending
- **CG1_clear_glass_accounts_and_private** · pending
- **CG2_clear_glass_drag_wrapper_and_fluid_url_bar** · pending
- **UI10_debug_and_intelligence_one_tab** · pending
- **GL1_gate_verify_fix_loop** · done
- **PV1_verify** · done
- **PV2_repair_feedback** · done
- **PV3_prove_loop** · done
- **PV4_cli_and_ui** · done
- **UM1_nexus_understands_james** · pending
- **IL1_spec_library_as_ideas** · done
- **IL2_library_spec_into_the_pipeline** · done
- **SW1_spec_workshop** · done
- **FT1_file_tools_merge_patch_drop** · pending
- **TP1_promote_to_spec_templates** · pending
- **EN1_run_isolated_and_environments** · pending

</details>

<details>
<summary>`docs/2026-09-30-idearium-coding-flow-phasemap.spec` · 8 · 7 done, 0 in progress, 1 pending</summary>

- **W0_map** · done
- **W1_idearium_never_blocks_on_git** · done
- **W2_plan_always_lands** · done
- **W3_work_surface** · done
- **W4_navigation** · done
- **W5_theme_and_css** · done
- **W7_next_mapped_2026_09_30** · pending
- **W6_release** · done

</details>

<details>
<summary>`docs/2026-09-29-tool-layers-and-pane-memory-phasemap.spec` · 2 · 1 done, 0 in progress, 1 pending</summary>

- **P5** · done
- **P6** · pending

</details>

<details>
<summary>`docs/2026-09-29-provider-economy-phasemap.spec` · 12 · 12 done, 0 in progress, 0 pending</summary>

- **EC0_policy_model** · done
- **EC1_usage_ledger** · done
- **EC2_gate** · done
- **EC3_token_constraints** · done
- **EC4_learning_router** · done
- **EC5_staging_by_economy** · done
- **EC6_guardian_enforcement** · done
- **EC7_router_in_builds** · done
- **EC8_economy_console** · done
- **EC9_input_path_in_editors** · done
- **EC10_eros_workbench** · done
- **EC11_release** · done

</details>

<details>
<summary>`docs/2026-09-29-nex-node-store-phasemap.spec` · 31 · 11 done, 0 in progress, 20 pending</summary>

- **N0_census** · done
- **N1_record_and_log** · done
- **N2_types_and_gates** · done
- **N3_projection_and_indexes** · pending
- **N4_kinds_record_ledger_ring_blob** · pending
- **N5_kinds_edge_and_lattice** · pending
- **N6_time** · pending
- **N7_views_yaml_and_nex** · pending
- **N8_service** · pending
- **N9_cli** · pending
- **N10_migration** · pending
- **N11_adopters** · pending
- **N12_ui** · pending
- **N13_release** · pending
- **N14_failure_mode_field** · pending
- **N15_contract_history** · pending
- **N16_settings_without_iframes** · pending
- **N17_data_migration_to_owning_systems** · pending
- **N18_hardcode_census** · pending
- **N19_suite_triage_and_known_gaps** · done
- **N20_desktop_login** · done
- **N21_no_empty_generation_event_gates** · done
- **N22_shadow_and_negative_space_reasoning** · done
- **N23_ollama_first_build_then_agent_review** · done
- **N24_no_json_yaml_node_types_only** · pending
- **N25_manage_button_enterprise** · done
- **N26_work_surface_and_tv_ui_from_contracts** · pending
- **N27_history_import_from_700_zips** · done
- **N28_live_run_findings** · pending
- **N29_full_run_only_failures** · pending
- **N30_archive_import_dropbox_and_copilot_command** · done

</details>

<details>
<summary>`docs/2026-09-29-build-surface-phasemap.spec` · 20 · 20 done, 0 in progress, 0 pending</summary>

- **BS0_compartment_windows** · done
- **BS1_rewind_hit_test** · done
- **BS2_file_states** · done
- **BS3_baseline_deviation** · done
- **BS4_environment_check** · done
- **BS5_spec_to_phasemap** · done
- **BS6_build_plan** · done
- **BS7_api** · done
- **BS8_files_ui** · done
- **BS9_spec_and_phase_build_ui** · done
- **BS10_settings_and_environment_ui** · done
- **BS11_plan_panel** · done
- **BS13_provider_sovereignty** · done
- **BS14_branch_git_honest** · done
- **BS15_code_repo_delete** · done
- **BS16_provider_login_wall** · done
- **BS17_copilot_browser_verbs** · done
- **BS18_sync_ci_theme** · done
- **BS19_copilot_atlas_guide** · done
- **BS12_release** · done

</details>

<details>
<summary>`docs/2026-09-28-staging-self-heal-phasemap.spec` · 13 · 4 done, 0 in progress, 9 pending</summary>

- **S0** · done
- **S1** · done
- **S2** · pending
- **S3** · pending
- **C0** · done
- **C1** · done
- **S4** · pending
- **S5** · pending
- **S6** · pending
- **S7** · pending
- **L1** · pending
- **A1** · pending
- **X1** · pending

</details>

<details>
<summary>`docs/2026-09-28-graph-build-context-settings-memory-phasemap.spec` · 29 · 0 done, 0 in progress, 29 pending</summary>

- **M0** · pending
- **M1** · pending
- **M4** · pending
- **G0** · pending
- **G1** · pending
- **G2** · pending
- **G3** · pending
- **R0** · pending
- **R1** · pending
- **R2** · pending
- **SV0** · pending
- **SV1** · pending
- **SV2** · pending
- **SV3** · pending
- **C0** · pending
- **C1** · pending
- **C2** · pending
- **C3** · pending
- **B0** · pending
- **B1** · pending
- **B3** · pending
- **B4** · pending
- **M2** · pending
- **M3** · pending
- **M5** · pending
- **M6** · pending
- **L1** · pending
- **A1** · pending
- **X1** · pending

</details>

<details>
<summary>`docs/2026-09-27-registry-harness-and-stability-phasemap.spec` · 9 · 9 done, 0 in progress, 0 pending</summary>

- **S1** · done
- **S2** · done
- **S3** · done
- **S4** · done
- **H1** · done
- **H2** · done
- **H3** · done
- **H4** · done
- **H5** · done

</details>

<details>
<summary>`docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec` · 20 · 20 done, 0 in progress, 0 pending</summary>

- **R1_ui_dir_redirect** · done
- **V1_versionium_proxies** · done
- **V2_nexus_versionium_view** · done
- **N1_one_idearium** · done
- **P1_phasemap_list_form** · done
- **P2_phases_model** · done
- **P3_phase_build** · done
- **P4_phases_ui** · done
- **S1_living_spec** · done
- **S2_spec_tab** · done
- **T1_suite_process** · done
- **T2_all_tests** · done
- **T3_debug_report** · done
- **C1_copilot_contract** · done
- **X1_system_nodes** · done
- **X2_guardian_hat_agent** · done
- **X3_nodes_route** · done
- **X4_command_index_spec** · done
- **X5_core_scripts** · done
- **Z1_release** · done

</details>

<details>
<summary>`docs/2026-09-27-idearium-atlas-phasemap.spec` · 4 · 4 done, 0 in progress, 0 pending</summary>

- **A1** · done
- **A2** · done
- **A3** · done
- **A4** · done

</details>

<details>
<summary>`docs/2026-09-27-components-store-and-atlases-phasemap.spec` · 7 · 5 done, 0 in progress, 2 pending</summary>

- **C1** · done
- **C2** · done
- **C3** · done
- **C4** · done
- **A1** · done
- **A2** · pending
- **A3** · pending

</details>

<details>
<summary>`docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec` · 18 · 18 done, 0 in progress, 0 pending</summary>

- **O1** · done
- **O2** · done
- **O3** · done
- **H1** · done
- **H2** · done
- **H3** · done
- **H4** · done
- **G1** · done
- **G2** · done
- **G3** · done
- **G4** · done
- **G5** · done
- **M1** · done
- **M2** · done
- **M3** · done
- **M4** · done
- **M5** · done
- **X1** · done

</details>

<details>
<summary>`docs/2026-09-26-guardian-retry-novelty-and-installs-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **R1** · pending
- **N1** · pending
- **N2** · pending
- **E1** · pending
- **I1** · pending
- **T1** · pending
- **X1** · pending

</details>

<details>
<summary>`docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec` · 12 · 12 done, 0 in progress, 0 pending</summary>

- **T1** · done
- **T2** · done
- **T3** · done
- **T4** · done
- **T5** · done
- **T6** · done
- **T7** · done
- **A1** · done
- **A2** · done
- **N1** · done
- **E1** · done
- **R1** · done

</details>

<details>
<summary>`docs/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion-phasemap.spec` · 8 · 1 done, 0 in progress, 7 pending</summary>

- **AN1_anchor_node_capture** · pending
- **CLI1_headless_dispatch_via_mesh** · pending
- **TX1_converge_the_three_transports** · pending
- **TR1_repo_derived_agentId_in_dispatch** · done
- **TR2_tab_lifecycle_and_visibility** · pending
- **UI1_progress_2026_09_23** · pending
- **UI1_one_file_per_ui_area** · pending
- **UI2_downloads_manager_chat_view** · pending

</details>

<details>
<summary>`docs/2026-09-22-brainos-agent-suite-phasemap.spec` · 6 · 0 done, 0 in progress, 6 pending</summary>

- **AS1_agent_system_tab** · pending
- **HT1_hat_manager** · pending
- **IJ1_injection_editor** · pending
- **TL1_tool_browser** · pending
- **MM1_module_manager** · pending
- **RD1_reader** · pending

</details>

<details>
<summary>`docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec` · 15 · 0 done, 0 in progress, 15 pending</summary>

- **T1_loop** · pending
- **T2_duplicate_prompt** · pending
- **T3_wrong_page** · pending
- **T4_two_actuators** · pending
- **T5_untestable_here** · pending
- **P1_driver** · pending
- **P2_mesh_transport** · pending
- **P3_endpoint** · pending
- **P4_identity** · pending
- **P5_guardian_transport** · pending
- **P6_verify** · pending
- **D1_default** · pending
- **D2_tabs** · pending
- **D3_account_choice** · pending
- **D3_decided_2026_09_23** · pending

</details>

<details>
<summary>`docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec` · 21 · 1 done, 0 in progress, 20 pending</summary>

- **B1_field_ownership** · pending
- **B2_jaadb_not_single_writer** · pending
- **B3_availability_tier** · pending
- **B4_userscript_cutover** · pending
- **B5_port_3753_collision** · pending
- **B6_two_intelligence_runtimes** · pending
- **D1_field_source** · pending
- **D2_cutover_policy** · pending
- **D3_snapshot_ownership** · pending
- **D4_names** · pending
- **P0_map** · done
- **P1_characterization** · pending
- **P2_intelligence_gains_routes** · pending
- **P3_cortex_becomes_forwarder** · pending
- **P4_repoint_callers** · pending
- **P5_retire_second_runtime** · pending
- **P6_versionium_residue** · pending
- **P7_hostile_verify_and_ship** · pending
- **D5_new** · pending
- **P6_versionium_residue** · pending
- **D3_snapshot** · pending

</details>

<details>
<summary>`docs/2026-09-19-architect-blueprint-forge-idearium-phasemap.spec` · 10 · 0 done, 0 in progress, 10 pending</summary>

- **D1_canvas_authority** · pending
- **D2_spec_authority** · pending
- **D3_forge_home** · pending
- **P0_place_spec_compiler** · pending
- **P1_reconcile_node_schema_precedent** · pending
- **P2_decide_D1_D2_D3** · pending
- **P3_architect_canvas_onto_loom_registry** · pending
- **P4_blueprint_as_canvas_mode** · pending
- **P5_forge_as_phasemap_view** · pending
- **P6_idearium_build_authority** · pending

</details>

<details>
<summary>`docs/2026-09-13-track-b-sovereignty-phasemap.spec` · 3 · 3 done, 0 in progress, 0 pending</summary>

- **MCO16_component_projections_retracted** · done
- **MCO17_contract_boundary_retracted** · done
- **MCO18_interaction_contract_split_scoped** · done

</details>

<details>
<summary>`docs/2026-09-13-axiom-5-2-raid-routing-phasemap.spec` · 5 · 5 done, 0 in progress, 0 pending</summary>

- **MCO7_map_real_proxy_traffic** · done
- **MCO8_wire_the_honest_subset** · done
- **MCO12_architect_remaining_routes** · done
- **MCO12_guardian_list_was_unreliable** · done
- **MCO12_guardian_audit_complete** · done

</details>

<details>
<summary>`docs/2026-09-11-sovereign-node-architecture-phasemap.spec` · 35 · 0 done, 1 in progress, 34 pending</summary>

- **P1_fix_the_declared_living_maps** · pending
- **P2_per_system_interaction_contracts** · pending
- **P3_per_system_node_schemas** · pending
- **P4_full_node_type_coverage_per_system** · pending
- **P5_data_folder_completion** · pending
- **P6_per_system_contract_schemas** · pending
- **P7_copilot_ticket_queue** · pending
- **P8_per_system_component_registry** · pending
- **P9_diagnostic_from_expected_behavior** · pending
- **P10_intelligence_reads_sse_and_data_folders** · pending
- **P11_unify_failure_tracking** · pending
- **P12_compartment_per_contract** · pending
- **P13_interaction_contract_plus_handshake_for_every_cross_system_call** · pending
- **P14_per_system_living_gap_index** · pending
- **P15_redundant_file_purge** · pending
- **P19_dynamic_nodes_via_causal_graph** · pending
- **P20_intelligence_reflexive_cfr_field** · pending
- **P21_versionium_causal_field** · in-progress
- **P22_ledger_data_integrity_checker** · pending
- **P23_guardian_job_durability** · pending
- **P24_response_queue_and_delivery_ack** · pending
- **P25_universal_per_system_queue** · pending
- **P26_unify_conversation_logging** · pending
- **P27_guardian_picker_userscript_manager** · pending
- **P31_job_reference_command_syntax** · pending
- **P32_clearglass_enterprise_ui_scope** · pending
- **P28_dom_tool_and_command_flow** · pending
- **P29_clearglass_brainos_canvas** · pending
- **P30_provider_ping_delta** · pending
- **P33_every_system_runs_its_node_registry** · pending
- **P34_nodes_in_the_lattice** · pending
- **P35_copilot_reads_edits_creates_nodes** · pending
- **P36_an_event_ledger_per_registry** · pending
- **P37_the_ui_floats_on_the_registry** · pending
- **P38_every_graph_has_its_route_command_and_node** · pending

</details>

<details>
<summary>`docs/2026-09-11-compartment-nodetype-and-reorg-phasemap.spec` · 17 · 6 done, 0 in progress, 11 pending</summary>

- **T1_extend_system_scaffold** · done
- **T2_idearium_genesis_alignment** · pending
- **T3_warp_replaces_siso** · pending
- **T4_cos_role_confirmed** · pending
- **V1_repoint_old_versionium_refs** · done
- **V2_snapshot_ownership_decision** · pending
- **D1_diagnostic_real_folder** · pending
- **D2_self_heal_migration** · done
- **I1_boot_js_intelligence_routes** · pending
- **R1_recall_to_lib** · pending
- **C1_cli_per_system_split** · pending
- **N1_root_md_consolidation** · done
- **N2_root_nexus_js_to_nexus_folder** · done
- **AR1_architect_retirement_and_hooks_to_loom** · pending
- **X1_node_decomposition_tool** · pending
- **N3_stray_root_files_found_after_N1** · done
- **AR2_decentralize_interaction_contracts** · pending

</details>

<details>
<summary>`docs/2026-09-05-observability-sovereignty-and-agent-mesh-phasemap.spec` · 30 · 4 done, 0 in progress, 26 pending</summary>

- **RF1_ncp_liveness_is_console_only** · pending
- **RF2_shared_data_directory_is_the_root_of_the_crash** · pending
- **RF3_selfheal_permanently_stuck** · pending
- **RF4_versionium_split_brain** · pending
- **RF5_agent_registry_is_hardcoded** · pending
- **RF6_tools_have_no_contracts** · pending
- **RF7_three_disconnected_debug_surfaces** · pending
- **RF8_nexus_spec_is_stale** · pending
- **CG1_ncp_events_real** · pending
- **CG2_route_ncp_onto_guardian_sse** · pending
- **DF1_guardian_own_data_folder** · done
- **CG3_relay_into_cortex_sse** · pending
- **DA1_fix_stale_guardian_coverage_gate** · done
- **DA2_dispatch_outcome_events** · pending
- **BR1_brainos_cross_system_relay** · pending
- **BR2_brainos_controls_agents** · pending
- **TC1_tools_get_real_contracts** · pending
- **DBG1_consolidate_debug_surfaces** · pending
- **ID1_resolve_versionium_cortex_dependency** · pending
- **VSB1_fix_versionium_split_brain** · done
- **ID2_verify_idearium_reconciliation_reads_right_store** · pending
- **DF2_cortex_and_versionium_off_root_data** · pending
- **EVT1_commands_and_tools_emit_events** · pending
- **REG1_component_registry_remap** · pending
- **CP1_tool_index_hooked_to_living_model** · pending
- **CP2_copilot_versionium_awareness** · pending
- **CP3_git_vs_versionium_decision** · done
- **IDU1_idearium_homepage_and_repo_browser** · pending
- **UX1_design_philosophy_consolidation** · pending
- **RP1_repository_per_system** · pending

</details>

<details>
<summary>`docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec` · 10 · 0 done, 0 in progress, 10 pending</summary>

- **VS1_sovereign_folder_and_foundation** · pending
- **VS2_ring_buffer_and_causal_field** · pending
- **VS3_agent_chat_log_query** · pending
- **VS4_active_drift_enforcement** · pending
- **CG1_process_manager_in_settings** · pending
- **CG2_native_password_permission_zoom** · pending
- **CG3_ublock_style_adblocker** · pending
- **MEM1_three_tier_memory_formalized** · pending
- **MEM2_ledger_folder_reorg** · pending
- **MEM3_timestamps_everywhere** · pending

</details>

<details>
<summary>`docs/2026-09-02-nexus-vision-master-phasemap.spec` · 58 · 2 done, 0 in progress, 56 pending</summary>

- **T1_tool_listing_command** · pending
- **T2_event_taxonomy_per_system** · pending
- **T3_tool_to_event_mapping** · pending
- **T4_userscript_event_types** · pending
- **T5_raid_full_cli** · pending
- **B1_full_build_contract_schema** · done
- **B2_chunk_contract_chaining** · pending
- **C1_copilot_spec_wizard** · pending
- **C2_templates_folder_structure** · pending
- **C3_component_import_decomposition** · pending
- **C4_build_wizard_two_modes** · pending
- **D1_bridgeos_readme_template** · pending
- **D2_idearium_compartment_structure** · pending
- **D3_loom_compartment_readme** · pending
- **D4_spec_bulk_import** · pending
- **AM7_agent_suite_welcome_ui** · pending
- **AM8_element_picker_agent_wiring** · pending
- **AM9_per_account_sub_agents** · pending
- **AM10_ollama_models_in_mesh** · pending
- **AM11_per_agent_tasks_automation** · pending
- **WF1_workflow_automation_engine** · pending
- **WF2_canvas_visual_pipeline** · pending
- **WF3_cockpit_ui_shell** · pending
- **G1_guardian_agents_folder** · pending
- **CG4_macros_plugin_autofill** · pending
- **CG5_copilot_guided_spotlight_macro** · pending
- **CG6_element_picker_to_listener_queue** · pending
- **CG7_cli_first_architecture** · pending
- **CG8_devtools_screenshot_dom_archaeology** · pending
- **CG9_history_via_rewind_engine** · pending
- **CG10_zoom_and_hotkeys_bug** · pending
- **CG11_ublock_adblocker_native_features** · pending
- **V8_full_change_tracking_hashing** · pending
- **V9_precommit_gate_for_raid_contracts** · pending
- **VM1_versionium_owns_loom_map_sync** · pending
- **V10_dynamic_registry_self_wiring** · pending
- **LM2_per_system_living_model_completion** · pending
- **LM3_component_registry_hooks_spec** · pending
- **LM4_hotswap_ui_contracts** · pending
- **LM5_data_decay_per_system** · pending
- **LM6_model_template** · pending
- **CP1_less_rigid_copilot** · pending
- **CP2_copilot_learning_memory** · pending
- **CP3_dynamic_model_selection** · pending
- **CP4_copilot_cli_deterministic_toggle** · pending
- **SR1_per_agent_wake_words** · pending
- **SR2_copilot_clarifying_questions** · pending
- **SR3_artifact_extraction_introspect_bridge** · done
- **SR4_fitness_driven_contract_adjustment** · pending
- **SR5_large_file_chunk_working_memory** · pending
- **SR6_per_output_build_surface** · pending
- **SR7_token_reduction_toolkit** · pending
- **SR8_deterministic_claude_replication** · pending
- **SR9_autonomous_self_build_end_state** · pending
- **SR10_iterative_prompt_optimization_loop** · pending
- **SR11_spec_project_import_to_compartment** · pending
- **SR12_system_parse_query_surface** · pending
- **SR13_copilot_chat_ui** · pending

</details>

<details>
<summary>`docs/2026-09-02-agent-mesh-full-map-phasemap.spec` · 6 · 1 done, 0 in progress, 5 pending</summary>

- **AM1_raid_intent_contracts_per_agent** · pending
- **AM2_first_principles_hat_or_modifier** · pending
- **AM3_agent_mesh_folder_consolidation** · pending
- **AM4_userscript_shared_core_dedup** · pending
- **AM5_tool_forge_real_usage_audit** · pending
- **AM6_raid_contract_gate_before_dispatch** · done

</details>

<details>
<summary>`docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec` · 26 · 0 done, 0 in progress, 26 pending</summary>

- **LM1_spec_as_living_model** · pending
- **LM2_registry_as_hub_with_watchdog** · pending
- **LM3_interaction_contract_wired_to_registry** · pending
- **LM4_per_system_tool_index** · pending
- **LM5_copilot_capability_zoom** · pending
- **LM6_who_creates_contracts** · pending
- **LM7_agent_mesh_intent_programming** · pending
- **LM8_full_pipeline_wiring** · pending
- **LM9_deterministic_agent_switch_cli** · pending
- **LM10_per_agent_wake_words** · pending
- **LM11_copilot_ollama_guardian_toggle** · pending
- **LM12_successful_prompt_caching** · pending
- **LM13_guardian_agents_folder_refactor** · pending
- **LM14_components_store** · pending
- **LM15_master_settings** · pending
- **LM16_per_system_data_decay** · pending
- **LM17_downloads_manager_for_artifacts** · pending
- **LM18_atlas_map_each_system_first** · pending
- **LM19_atlas_spec_coverage_prerequisite** · pending
- **LM20_atlas_schema_and_deterministic_seed** · pending
- **LM21_atlas_fact_extractors** · pending
- **LM22_atlas_structure_ledger** · pending
- **LM23_atlas_history_versions_calendar** · pending
- **LM24_atlas_prose_layer** · pending
- **LM25_atlas_living_update** · pending
- **LM26_atlas_completeness_and_release_gate** · pending

</details>

<details>
<summary>`docs/2026-08-30-interaction-contract-context-phasemap.spec` · 13 · 1 done, 0 in progress, 12 pending</summary>

- **IC1_context_by_uuid_injection** · pending
- **IC2_raid_test_env_hook** · pending
- **IC3_intention_taxonomy_per_system** · pending
- **IC4_idearium_system_template_update** · pending
- **IC5_full_input_queue_output_qc_lifecycle** · pending
- **IC9_diagnostic_stall_detection_and_autofix** · pending
- **IC10_diagnostic_own_real_system_structure** · pending
- **IC11_agent_truth_fragmentation** · done
- **IC12_universal_gap_and_symmetry_detection** · pending
- **IC13_agent_mesh_chat_index** · pending
- **IC6_multi_source_code_request_intake** · pending
- **IC7_drift_and_comparison_tracking_in_the_pipeline** · pending
- **IC8_callto_event_driven_cli_injection** · pending

</details>

<details>
<summary>`docs/2026-08-28-self-building-pipeline-phasemap.spec` · 13 · 13 done, 0 in progress, 0 pending</summary>

- **SBP1_reconcile_repo_layer_vs_cos_compartment** · done
- **SBP7_agent_suite_lives_in_clearglass** · done
- **SBP7_DESIGN_PRINCIPLE_automation_over_code** · done
- **SBP8_agent_mesh_consolidation** · done
- **SBP9_hat_forge_real_hats** · done
- **SBP10_per_hat_model_assignment** · done
- **SBP11_agent_tools_registry_awareness** · done
- **SBP12_listener_and_userscript_suite_view** · done
- **SBP2_loom_idearium_template_to_cos_blueprint_bridge** · done
- **SBP3_wire_contract_intake_through_routing_ir** · done
- **SBP4_wire_loom_and_selfheal_as_real_contract_sources** · done
- **SBP5_cortex_data_organization_scoping** · done
- **SBP6_system_schema_inventory** · done

</details>

<details>
<summary>`docs/2026-08-28-definition-of-complete-phasemap.spec` · 8 · 8 done, 0 in progress, 0 pending</summary>

- **DOD1_fully_autonomous** · done
- **DOD2_diagnose_and_self_repair** · done
- **DOD3_build_using_idearium** · done
- **DOD4_build_and_expand_from_loom** · done
- **DOD5_maps_snapshots_backups_living_model** · done
- **DOD6_respects_axioms** · done
- **DOD7_tested_using_cos** · done
- **DOD8_contract_conditions_comparison_and_drift_engines** · done

</details>

<details>
<summary>`docs/2026-08-27-event-taxonomy-and-brainstorm-phasemap.spec` · 16 · 1 done, 0 in progress, 15 pending</summary>

- **ET1_event_taxonomy_pattern** · pending
- **ET2_guardian_event_taxonomy** · pending
- **ET3_clearglass_event_taxonomy** · pending
- **ET4_orchestrator_autopilot_event_taxonomy** · pending
- **ET5_loom_event_taxonomy_map** · pending
- **ET6_sigma_gates_on_taxonomy** · pending
- **BR1_callto_component_hotswap_catalog** · pending
- **BR2_ollama_output_folder_listener** · pending
- **BR3_account_registry_userscript_hook** · pending
- **BR4_erosmancer_as_clearglass_plugin** · pending
- **BR9_theme_consolidation_to_nexus_dark** · pending
- **BR5_build_contract_per_agent_per_intent** · pending
- **BR6_copilot_as_agent_chat_model** · pending
- **BR7_guardian_dispatch_connectivity_sweep** · done
- **BR8_clearglass_full_agent_tool_parity** · pending
- **SS3_unified_living_model_system_plus_person** · pending

</details>

<details>
<summary>`docs/2026-08-23-backlog-phasemap.spec` · 32 · 15 done, 0 in progress, 17 pending</summary>

- **BL0_macro_system** · done
- **BL1_macro_erosmancer_integration** · done
- **BL2_guardian_zip_mining_report** · done
- **BL3_port_social_listener_pattern** · pending
- **BL4_port_element_picker_ux** · pending
- **BL5_port_killswitch_pattern** · pending
- **BL6_captcha_detection** · pending
- **BL7_emerge_files_to_emerge_folder** · done
- **BL8_docs_consolidation** · pending
- **BL9_per_system_phasemap_folders** · pending
- **BL10_nexus_roadmap_html_files** · pending
- **BL11_orchestrator_folder_consolidation** · done
- **BL12_nexus_heal_loop_to_diagnostic** · done
- **BL13_cortex_component_registry_move** · done
- **BL14_seam_to_lib_seam** · done
- **BL15_agent_tools_tree_restructure** · pending
- **BL16_per_server_configs** · done
- **BL20_loom_map_becomes_real_visual_graph** · done
- **BL19_roadmap_readability** · done
- **BL17_nexus_url_scheme** · pending
- **BL18_tools_per_url** · pending
- **BL21_agent_mesh_real_connection** · done
- **BL22_rewind_timeline_ui** · pending
- **BL23_ncp_providers_start_verification** · pending
- **BL24_userscript_suite_enterprise_grade** · done
- **BL25_nexus_options_config** · pending
- **BL26_account_agent_window_uuid_linking** · done
- **BL27_agent_suite_consolidation** · done
- **BL28_background_tabs_setting** · pending
- **BL29_tab_context_menu_move_to_background** · pending
- **BL30_registry_components_drift_audit** · pending
- **BL31_architect_block_canvas_component_swap** · pending

</details>

<details>
<summary>`docs/2026-08-22-session-full-phasemap.spec` · 19 · 18 done, 0 in progress, 1 pending</summary>

- **SF1_sse_reconnect_leak** · done
- **SF2_providerhost_stopall_missing** · done
- **SF3_chat_history_panel_wrong_url** · done
- **SF4_copilot_missing_own_tools** · done
- **SF5_wiring_gap_bridge** · done
- **SF6_wiring_gaps_applied** · done
- **SF7_axiom_8_7** · done
- **SF8_meta_shim_cleanup** · done
- **SF9_account_identity_capture** · done
- **SF10_agent_notes** · done
- **SF11_phasemap_backfill** · done
- **SF12_end_state_vision_and_full_phase_map_docs** · done
- **SF13_orchestrator_agent_pipeline** · pending
- **SF14_wake_pipeline_real_architecture** · done
- **SF15_wake_pipeline_real_bugs_fixed** · done
- **SF16_event_types_real_registry** · done
- **SF17_intelligence_system_all_4_phases** · done
- **SF18_intelligence_becomes_a_real_system** · done
- **SF19_loom_registry_never_auto_synced** · done

</details>


### The data structure

NEXUS keeps its state out of git: everything under a data folder is runtime state, never code (docs/CLAUDE.md: "NEVER commit data/**"). The stores below are read from the code itself: every store whose folder can be moved by an environment variable, with the default it falls back to and the files that open it. The test sandbox (`lib/test-sandbox.js`) points each of these into a throwaway folder, so a test never touches the real ones.

<details>
<summary>the stores · 34 folders, each placed by an environment variable</summary>

- **CG_JAA_DIR** — default cgDir(), 'jaa' — opened by `clear-glass/src/storage/jaa.js`
- **CG_USERSCRIPTS_DIR** — default process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'userscripts' — opened by `clear-glass/src/userscripts/manager.js`
- **COPILOT_INJECTION_DIR** — default copilot/, 'data', 'nodes', 'injection' — opened by `copilot/tool-runtime.js`
- **COPILOT_WORKSET_DIR** — default copilot/lib/, '..', 'data', 'worksets' — opened by `copilot/lib/workset.js`
- **COS_DATA_ROOT** — default '' — opened by `lib/cos-bridge.js`
- **EMERGENCE_DATA_DIR** — default process.cwd(), 'data' — opened by `emergence/cli.js`
- **GIG_LEDGER_DIR** — default , 'data', 'gig-ledger' — opened by `lib/gig-ledger.js`
- **GUARDIAN_ACCOUNTS_DIR** — default guardian/lib/, '../../data/guardian/accounts' — opened by `guardian/lib/account-routing.js`
- **GUARDIAN_AGENTS_DIR** — default guardian/lib/, '../../data/guardian/agents' — opened by `guardian/lib/agent-registry.js`
- **GUARDIAN_DIR** — default clear-glass/src/main/, // '../../../guardian' — opened by `clear-glass/src/main/index.js`
- **GUARDIAN_JOBS_DIR** — default , 'data', 'guardian', 'jobs' — opened by `cli/clear-idearium.js`, `guardian/lib/jobs.js`
- **GUARDIAN_RESPONSE_NODES_DIR** — default guardian/lib/, '..', 'data', 'nodes', 'response' — opened by `guardian/lib/response-sink.js`
- **IDEARIUM_ACCESS_DIR** — default ideariumDataDir(), 'access' — opened by `idearium/lib/access.cjs`
- **INTELLIGENCE_DATA_DIR** — default intelligence/, '..', 'data', 'intelligence' — opened by `intelligence/config.js`
- **INTELLIGENCE_NODES_DIR** — default intelligence/lib/, '..', 'data' — opened by `intelligence/lib/domain-nodes.js`
- **INTELLIGENCE_SYNTHESIS_DIR** — default process.env.INTELLIGENCE_DATA_DIR || , 'data', 'intelligence'), 'synthesis' — opened by `intelligence/synthesis/index.js`
- **JAA_DATA_DIR** — default , 'data', 'cortex', 'memory' — opened by `cli/clear-idearium.js`, `cortex/memory/jaa-db.js`, `cortex/memory/table-compactor.js`, `lib/context-atlas.js`
- **MEMORY_STORE_DIR** — default guardian/, '..', 'data', 'cortex', 'memory' — opened by `guardian/server.js`
- **NEXUS_CLIENT_DIR** — default os.homedir(), '.nexus-client' — opened by `auth/client.js`
- **NEXUS_CODE_ARTIFACT_DIR** — default process.env.NEXUS_DATA_ || , 'data'), 'guardian', 'code-artifacts' — opened by `guardian/lib/code-artifact.js`
- **NEXUS_DATA_DIR** — default process.cwd(), 'data' — opened by `remote-desktop/bridge-os-core/bridge-node/boot.js`, `remote-desktop/bridge-os-core/index.js`
- **NEXUS_DATA_ROOT** — default clear-glass/src/ipc/, '..', '..', '..', 'data' — opened by `clear-glass/src/ipc/bridge.js`, `clear-glass/src/mesh/automation-engine.js`, `clear-glass/src/providers/registry.js`, `idearium/lib/data-dir.cjs`
- **NEXUS_INTAKE_DIR** — default cortex/core/raid/, '../../../data/intake' — opened by `cortex/core/raid/officiator.js`, `lib/intake.js`
- **NEXUS_PHASEMAP_DIR** — default , 'docs' — opened by `lib/spec-census.js`, `loom/scanners/phasemap-map.js`
- **NEXUS_SNAP_DIR** — default versionium/lib/, '..', 'data', 'snapshots' — opened by `versionium/lib/migrate-cortex-snapshots.js`, `versionium/lib/snapshot.js`
- **NEXUS_VECTOR_INDEX_DIR** — default lib/, '..', 'data', 'vector-index' — opened by `lib/vector-memory.js`
- **RAID_INPUT_DIR** — default cortex/core/raid/, '../../../data/raid/input' — opened by `cortex/core/raid/contract-intake.js`
- **RAID_OUTPUT_DIR** — default cortex/core/raid/, '../../../data/raid/output' — opened by `cortex/core/raid/contract-intake.js`
- **RAID_SYSTEMS_ROOT** — default cortex/core/raid/, '../../../' — opened by `cortex/core/raid/contract-intake.js`
- **RUN_STATE_DIR** — default lib/, '..', 'data', 'run-state' — opened by `lib/run-state.js`
- **VERSIONIUM_DATA_DIR** — default versionium/, '..', 'data', 'versionium' — opened by `versionium/config.js`
- **VERSIONIUM_FILE_BLOB_DIR** — default process.env.VERSIONIUM_DATA_DIR || versionium/, '..', 'data', 'versionium'), 'file-blobs' — opened by `versionium/config.js`
- **WORK_JOURNAL_DIR** — default lib/, '..', 'data', 'work' — opened by `lib/work-journal.js`
- **XDG_DATA_HOME** — default os.homedir(), '.local', 'share' — opened by `cos/app/store.js`

</details>

The tables. Cortex's JAA store (`jaa/`, `cortex/memory/`) holds the named tables most systems write into. These are the ones described in `lib/context-atlas.js`, each checked against a real writer, with the system that owns it and the tool that reads it deeper. A table not described there is still searchable by its name.

<details>
<summary>the JAA tables · 50 described</summary>

- **chat_log** (cortex) — every AI exchange (NCP, Ollama, direct) with content — read with agent_chat_search
- **guardian_chat_log** (guardian) — guardian-side chat transcript — read with agent_chat_search
- **memory_unified** (cortex) — the unified push/recall store — current long-term memory — read with query_recall
- **cortex_memory** (cortex) — short-term cortex memory rows — read with query_recall
- **working_memory** (cortex) — this-session working memory (decays in 2h) — read with query_recall
- **crystals** (intelligence) — crystallised patterns (graduated long-term knowledge) — read with nexus_intelligence
- **bep_patterns** (cortex) — behaviour/error patterns learned from runs — read with query_recall
- **fix_map** (cortex) — failure → fix that worked — read with query_recall
- **failure_modes** (cortex) — named failure modes — read with fault_log
- **fault_log** (nexus) — every fault, richly tagged — first-class failure data — read with fault_log
- **fault_taxonomy** (cortex) — fault classes and their aggregate state — read with fault_log
- **gaps** (cortex) — open gaps (gap field) — what is missing or broken — read with diagnose
- **decision_log** (cortex) — routing/agent decisions and why — read with raid_snr
- **raid_decisions** (orchestrator) — RAID routing decisions — read with raid_snr
- **agent_notes** (nexus) — per-agent constraint notes (token limits, quirks) — read with agent_notes
- **agent_capability** (nexus) — measured per-agent capability stats — read with agent_capability
- **agent_model_hypotheses** (nexus) — hypotheses about each agent model
- **repo_hat_memory** (idearium) — what each repo agent learned about its project (@learn) — read with nexus.context.tool
- **repo_agent_log** (idearium) — repo agent exchanges per compartment — read with nexus.context.tool
- **repo_notes** (idearium) — his notes per repo and on no repo: ideas, decisions, todos, questions, quotes (0.60.6) — read with nexus.command notes
- **repo_agent_settings** (idearium) — repo agent provider / scope / prompt blocks
- **idearium_ideas** (idearium) — ideas, with provenance (user vs agent) — read with propose_idea
- **idearium_project_containers** (idearium) — project containers
- **person_model_nodes** (copilot) — the model of James — nodes (graph)
- **person_model_edges** (copilot) — the model of James — edges (graph)
- **person_model_sessions** (copilot) — session ledger chaining conversations
- **relationship_lattice** (copilot) — relationship lattice (graph)
- **self_model** (copilot) — copilot's model of itself — read with copilot_identity
- **tool_index** (nexus) — living tool index: consumers, intents, edge cases — read with nexus_help
- **tool_call_reuse** (nexus) — past tool results for reuse
- **reuse_index** (nexus) — reusable outputs index
- **case_index** (nexus) — queryable case library (compartment outcomes)
- **notes_todos** (nexus) — notes and todos — read with notes_todo
- **interstitial_spaces** (intelligence) — liminal/interstitial spaces — read with nexus_intelligence
- **forged_tools** (nexus) — tools agents forged — read with forge_tool
- **forged_hats** (nexus) — hats (personas) forged — read with hat_forge
- **scheduled_tasks** (nexus) — scheduled tasks — read with schedule_task
- **triggers** (nexus) — registered triggers — read with register_trigger
- **artifacts** (guardian) — artifacts produced by jobs
- **snapshots** (nexus) — snapshots
- **opportunities** (nexus) — job/gig/lead pipeline (stage, score, drafts, fill reports) — read with nexus.opportunity.tool
- **opportunity_profile** (nexus) — James's job profile (skills, roles, policy) — read with nexus.opportunity.tool
- **opportunity_answers** (nexus) — answer bank for application questions — read with nexus.opportunity.tool
- **opportunity_ledger** (nexus) — every pipeline transition and action — read with nexus.opportunity.tool
- **opportunity_outcomes** (nexus) — what applications led to (responses, interviews, offers) — learned weights — read with nexus.opportunity.tool
- **cg_site_memory** (clear-glass) — what copilot learned about each site: actions that worked or failed, healed selectors — read with clearglass.learned.tool
- **cg_learned_flows** (clear-glass) — flows that worked on a site, replayable, promotable to macros — read with clearglass.learned.tool
- **ollama_activity** (ollama) — every Ollama call
- **idearium_spec_chunks** (idearium) — spec chunks (large; opt-in: sources=["jaa:idearium_spec_chunks"]) — read with idearium.repo_chunks.tool
- **idearium_spec_manifests** (idearium) — spec manifests (large; opt-in)

</details>

The node types. Everything NEXUS keeps as a file is a node: one envelope (`lib/node-export.js`: uuid, type, id, context, intent, summary, system, tags, occurrences, payload) around a typed payload, written as YAML. These are the types the envelope accepts.

<details>
<summary>the node types · 61</summary>

.hat · .contract · .component · .cos · .agent · .health · .model · .schema · .provider · .crystal · .ledger · .command · .gap · .pat · .macro · .tool · .node · .failure_mode · .idea · .framework · .toolbox · .job · .intent · .hook · .wire · .inject · .filetree · .repo_agent · .system · .event · .capability · .synthesis · .input · .output · .note · .hypothesis · .agent_tool · .injection · .fault · .bep_pattern · .resonance_crystal · .interstitial_space · .account_identity_index_entry · .pattern_sequence · .inject_rule · .sigma_record · .hook_contract · .component_projection · .constitution_decision · .chat_log · .tool_index_entry · .raid_contract · .debug_macro · .chunk · .response · .repository · .agent_model · .workflow · .step_gate · .run · .procedure

</details>

The ledgers. What happened is append-only: each ledger keeps its rows in order and never rewrites one. The contract ledger (`lib/work-journal.js`, 0.60.146) is one per contract, every gate's attempts, jobs and replies; a browser agent's reply text lives once, in Clear Glass's chat ledger (`clear-glass/src/downloads/chat-ledger.js`).

<details>
<summary>the ledgers and records · 15 modules</summary>

- `lib/activity-log/compartment.js`
- `lib/activity-log/index.js` — per-system activity + error logging into cortex James: "a log for each system, a full log for activity to save in cortex, like
- `lib/compartment-dom-ledger.js` — lib/compartment-dom-ledger.js §MCO10 2026-09-13 — James: "stream the DOM to the compartment ledger per
- `lib/component-ledger.js` — // ── lib/component-ledger.js — Per-Component, Per-System Ledger ────────────── // UUID: nexus-component-ledger-v1-0000-4000-0000-000000000001
- `lib/engine-ledger.js` — // ── lib/engine-ledger.js — DEPRECATED, kept as a compatibility shim ───────── // Superseded 2026-06-24 by lib/component-ledger.js — per-component,
- `lib/gig-ledger-listener.js` — agents' finished work becomes a candidate claim, with its evidence (PF0, 0.60.53) James, 2026-10-15: "you can have the agents also have a listener for that?…
- `lib/gig-ledger.js`
- `lib/ledger-sse.js` — // ───────────────────────────────────────────────────────────────────────────── // lib/ledger-sse.js — the cross-process ledger wire (agnostic lib tool)
- `lib/ledger-store.js`
- `lib/ledger-tail.js` — ledger-tail — backwards block reader for append-only JSONL ledgers. Built end-to-end through idearium's real spec-engine (spec
- `lib/ledger-writer.js` — Unified Ledger Write Surface Status: pre-release
- `lib/migrate-ledger-per-system.js` — move existing component_ledger rows out of cortex's shared table into each system's own ledger store.
- `lib/node-ledger.js` — Node Identity Ledger Persistent record of every node ever seen by this system.
- `lib/run-state.js`
- `lib/work-journal.js`

</details>


### All the Idearium work

Idearium is where work starts in NEXUS: ideas, specs, repos, their phases and builds, and the Code tab where the agents work. Everything it can do is a route on :4800, served by `idearium/api/index.js`, and every route a person uses is also a command row in `idearium/cli/route-commands.js`, so every agent can do it through the one command tool. Read from the route table itself: 395 routes, and 124 command rows. Its files, module by module, are under its own section above; what each release did to it is in the version history below.

<details>
<summary>the routes · 395, grouped by path</summary>

- **/** — GET /
- **/api/access** — GET /me · POST /login · POST /logout · GET /keys · POST /keys · POST /keys/:id/revoke
- **/api/accounts** — GET /chain · POST /chain · GET /profiles · POST /rest
- **/api/activity** — GET /
- **/api/agent-providers** — GET /
- **/api/architect** — GET / · POST / · GET /registry · GET /:id · POST /:id · POST /:id/draft · POST /:id/proposal/:pid · POST /:id/save
- **/api/brainstorms** — GET / · POST / · DELETE /:uuid · POST /:uuid/promote
- **/api/canvas** — GET / · POST / · GET /:id · POST /:id/tools
- **/api/census** — GET /
- **/api/checks** — GET / · POST /:id/run
- **/api/cli** — POST /exec
- **/api/components** — POST /decompose · GET /:id/bundle · GET / · GET /:id · POST /:id/invalidate
- **/api/config** — GET / · POST /reset · POST /
- **/api/context** — GET /directory · GET /search · GET /get · POST /find · GET /sources
- **/api/contract** — GET / · GET /live
- **/api/copilot** — POST /suggest
- **/api/cos** — GET /testenv · POST /testenv/setup · GET /install · POST /install · GET /compartments · GET /compartments/:cid/remotes · POST /compartments/:cid/remotes · DELETE /compartments/:cid/remotes/:name · GET /compartments/:cid/remotes/:name/status · POST /compartments/:cid/remotes/:name/push · POST /compartments/:cid/remotes/:name/pull · POST /remote/browse · POST /remote/clone
- **/api/economy** — GET / · POST / · GET /:what
- **/api/events** — GET /
- **/api/gaps** — GET / · POST / · GET /:uuid · POST /:uuid/resolve · POST /:uuid/ignore
- **/api/git** — POST /clone
- **/api/history** — GET /import · POST /import · PUT /import/upload
- **/api/ideas** — GET / · POST / · GET /:uuid/workbench · POST /:uuid/workbench/admit · POST /:uuid/workbench · GET /:uuid · PATCH /:uuid · DELETE /:uuid · POST /:uuid/tension · POST /:uuid/link · POST /:uuid/spec · POST /:uuid/phase · POST /:uuid/progress
- **/api/lattice** — POST /neighbours
- **/api/my-projects** — GET /
- **/api/nexus** — GET /store · GET /tape · GET /tape/:run
- **/api/notes** — GET / · POST / · PATCH /:id
- **/api/ollama** — GET /check · POST /check/ask · GET /models
- **/api/projects** — GET / · POST / · GET /:uuid/download · DELETE /:uuid
- **/api/providers** — GET /ready
- **/api/queue** — POST /:queueId/progress · GET /:queueId
- **/api/raid** — GET /held · POST /held/unpark
- **/api/releases** — GET / · POST /sync · GET /changes
- **/api/repos** — GET / · POST /
- **/api/repos/:uuid** — GET / · DELETE /
- **/api/repos/:uuid/activity** — GET /
- **/api/repos/:uuid/agent** — GET / · POST /prompt · GET /route · POST /tool-event · GET /tool-events · POST /stream · GET /feed · GET /late · POST /late · GET /history · DELETE /history · GET /tools · POST /tools/run · POST /debug · GET /graph · GET /memory · POST /memory · DELETE /memory/:obs · GET /settings · POST /settings · GET /blocks · POST /blocks · POST /blocks/preview · POST /export · POST /import
- **/api/repos/:uuid/architecture** — GET / · POST /
- **/api/repos/:uuid/artifacts** — GET /
- **/api/repos/:uuid/branches** — GET /
- **/api/repos/:uuid/changes** — GET / · GET /:id
- **/api/repos/:uuid/charter** — GET / · PUT / · POST /check
- **/api/repos/:uuid/chunk** — GET /:chunkUuid · POST /
- **/api/repos/:uuid/chunks** — GET / · GET /:chunkId
- **/api/repos/:uuid/ci** — GET /keys · POST /keys · DELETE /keys/:alias · GET /secrets · POST /secrets · DELETE /secrets/:name · GET / · PUT / · POST /run · GET /runs · GET /runs/:runId
- **/api/repos/:uuid/code** — POST /edit · POST /assist · GET /:op · POST /:op
- **/api/repos/:uuid/context** — GET / · POST /find
- **/api/repos/:uuid/debug** — GET /
- **/api/repos/:uuid/deliver** — POST /check · GET /check · POST /conditions
- **/api/repos/:uuid/desktop** — GET / · POST / · DELETE / · GET /checkpoints · POST /:op
- **/api/repos/:uuid/deviation** — GET / · POST /
- **/api/repos/:uuid/environment** — GET / · POST / · POST /setup
- **/api/repos/:uuid/expand** — POST /
- **/api/repos/:uuid/export** — GET /
- **/api/repos/:uuid/failure-modes** — GET / · GET /:id
- **/api/repos/:uuid/file** — GET / · POST / · DELETE / · GET /versions · GET /version
- **/api/repos/:uuid/files** — GET /state
- **/api/repos/:uuid/flight** — GET / · GET /:runId
- **/api/repos/:uuid/fork** — POST /
- **/api/repos/:uuid/funnel** — POST /
- **/api/repos/:uuid/git** — GET / · POST /remote · POST /commit · POST /push · POST /pull · POST /keygen
- **/api/repos/:uuid/graph** — GET / · GET /traverse · GET /cone · GET /spec
- **/api/repos/:uuid/graphs** — GET /
- **/api/repos/:uuid/harness** — GET /find · GET /card · GET /read · POST /write · POST /test
- **/api/repos/:uuid/hat** — GET / · POST / · POST /refresh · DELETE /
- **/api/repos/:uuid/history** — GET / · POST /import
- **/api/repos/:uuid/idea** — GET / · PATCH / · POST /iterations · POST /iterations/:id/status · POST /iterations/:id/roadmap
- **/api/repos/:uuid/index** — GET /
- **/api/repos/:uuid/injects** — GET / · POST / · GET /:id · PUT /:id · POST /:id/apply · POST /:id/reject · POST /:id/revert
- **/api/repos/:uuid/integrity** — GET / · POST /
- **/api/repos/:uuid/lessons** — GET /
- **/api/repos/:uuid/lineage** — GET /
- **/api/repos/:uuid/lines** — GET / · POST /copy
- **/api/repos/:uuid/manage** — POST /
- **/api/repos/:uuid/map** — GET /
- **/api/repos/:uuid/notes** — GET / · POST /
- **/api/repos/:uuid/phases** — GET / · GET /runs · GET /graph · GET /contract · GET /cost · POST /map · GET /map · POST /status · POST /add · POST /build
- **/api/repos/:uuid/plan** — GET /
- **/api/repos/:uuid/procedures** — GET / · POST / · POST /from-run · POST /:id/replay · DELETE /:id
- **/api/repos/:uuid/proof** — POST / · GET /
- **/api/repos/:uuid/prove** — POST / · GET / · POST /cancel
- **/api/repos/:uuid/reindex** — POST /
- **/api/repos/:uuid/releases** — GET / · POST /
- **/api/repos/:uuid/roadmap** — GET / · POST /phase
- **/api/repos/:uuid/run** — GET / · POST /:op · POST / · GET /capabilities · GET /options
- **/api/repos/:uuid/runs** — GET / · POST /:runId/rewind
- **/api/repos/:uuid/scan** — GET /
- **/api/repos/:uuid/search** — GET /
- **/api/repos/:uuid/snapshot** — POST /
- **/api/repos/:uuid/snapshots** — GET / · GET /:commitId · POST /:commitId/restore
- **/api/repos/:uuid/spec** — GET /blanks · POST /complete · GET /plan · POST /plan · POST /build
- **/api/repos/:uuid/specs** — POST /compile
- **/api/repos/:uuid/surface** — GET / · PUT /
- **/api/repos/:uuid/symbols** — GET /
- **/api/repos/:uuid/system** — GET / · POST /:op
- **/api/repos/:uuid/tasks** — GET /
- **/api/repos/:uuid/thread** — GET /
- **/api/repos/:uuid/verification** — GET /
- **/api/repos/:uuid/verify** — POST /
- **/api/repos/:uuid/versions** — GET / · GET /diff · GET /tree · POST /restore-file
- **/api/repos/:uuid/worksurface** — GET / · POST /prove
- **/api/repos/carve** — POST /
- **/api/route** — POST /assess
- **/api/routing** — GET / · GET /plan · GET /learned · GET /agents · POST /breaker/reset
- **/api/settings** — GET /console · GET /console/:uuid
- **/api/snapshots** — GET / · POST / · GET /:uuid · GET /:a/diff/:b · POST /:uuid/restore
- **/api/snr** — GET / · GET /history
- **/api/spec-engine** — GET /warp-status · GET /templates · GET /specs · POST /specs · POST /import · POST /specs/:uuid/promote · POST /wizard · GET /context · GET /specs/:uuid · POST /specs/:uuid/build · POST /specs/:uuid/codegen · POST /specs/:uuid/chunk/:chunkUuid/complete · POST /specs/:uuid/chunk/:chunkUuid/fail · POST /specs/:uuid/chunk/:chunkUuid/agent · POST /specs/:uuid/warp-primitives · POST /specs/:uuid/archive · DELETE /specs/:uuid · POST /specs/:uuid/restore · POST /specs/:uuid/expand · GET /specs/:uuid/promote
- **/api/specs** — GET / · POST / · GET /:uuid · PATCH /:uuid · POST /:uuid/check · POST /:uuid/build · GET /:uuid/export · DELETE /:uuid
- **/api/stats** — GET /
- **/api/system** — GET /lean · POST /prevention/clear · GET /drawbridge · GET /homes · GET /sovereign · GET /shape · GET /nodes · GET /nodes/:system · GET /tunnel · GET /tunnel/:name · GET /heartbeat · GET /registry · GET /registry/:system · POST /registry/:system/settle · POST /lean
- **/api/systems** — GET /:system/options · POST /:system/options
- **/api/version** — GET /
- **/api/void** — GET / · POST /idea · POST /ideas · GET /idea/:uuid · POST /idea/:uuid · POST /idea/:uuid/echo · POST /idea/:uuid/spec · POST /collide · POST /echo/:id · POST /spark/:uuid/idea
- **/api/workbench** — GET / · PATCH /:uuid · DELETE /:uuid · POST /:uuid/spawn · POST /:uuid/assist
- **/api/workshop** — GET / · POST / · GET /sources · GET /templates · POST /templates · POST /templates/:tid/remove · GET /:id · POST /:id · POST /:id/feed · POST /:id/proposal/:pid · POST /:id/save
- **/health** — GET /
- **/sse** — GET /

</details>

<details>
<summary>the command rows · 124 (every agent has them through nexus.command)</summary>

- **repo ask "" [--provider claude-code|ollama|chatgpt|…] [--model m]** — talk to the agent wearing the repo's hat (its code lands as proposals)
- **repo agent [--provider p] [--inject review|auto|off] [--scope s] [--model m]** — who wears the hat, and how its code lands
- **repo tool [--args '{"path":"README.md"}']** — run one agent tool for this repo, as a person (the agent's door, the repo's scope)
- **repo procedures** — the repo's replayable procedures (tool calls kept as .procedure files)
- **repo procedure replay | from-run [--name "…"] | remove** — replay a procedure in order (the first failure stops it), keep a run's tool calls as one, or archive one
- **repo changes [--status proposed|applied|…] [--prove]** — the agent's proposals; --prove checks them on a scratch copy against the charter
- **repo charter [show | set | check]** — axioms, conditions, end state — with what it inherits (a Nexus system: Nexus's)
- **repo feed [] [--gate ::[::]] [--gates] [--contract ::] [--limit n]** — the agent's replies and thinking as they streamed, kept on disk: newest jobs, one job with its timeline, or per contract gate every attempt
- **repo tasks [--running] [--failed]** — background tasks: every call of the agent wearing its hat, runs, setup
- **repo activity [--kind task|phase|inject|fault|run|checkpoint|system] [--actor a] [--status failed] [--q…** — the repo's durable activity log, newest first
- **system releases [--sync [--all]] [--limit n] [--version x.y.z]** — every Nexus release, newest first, from Versionium: James's words, the git commit, the changelog, its commits; --sync records any missing (with the…
- **system changes [--since x.y.z] [--write]** — every change since a release: each commit under the first release that contains it, with its files (written from git, not by hand); --write saves…
- **version** — the Nexus release (lib/version.js): its GitHub tag and zip name, whether every place that states it agrees (CK-253), and the module versions, labelled
- **checks list [--family=shadow] [--runnable]** — the check catalogue (cos/spec/check-catalogue.spec): every check, its family and stage, and which ones Nexus can run now
- **checks run [--repo=] [--path=dir] [--step=]** — run one check now: CK-233 (nothing forbidden is back), CK-248 (every file passes its language's own parser), CK-230 (a step's shadow settled)
- **route assess [--kind=agent:browser] [--tools=browser,files] [--tokens=N]** — how hard a request is and where it would be routed: complex → a reasoning agent (agent:reason), simple → the usual route; then the door's route —…
- **repo lines [to]** — lines from..to of a repo file, numbered (80 lines when to is left out)
- **repo lines copy [--to newPath]** — copy those lines to the work surface as a new file to edit (a proposal: apply writes it)
- **code surface** — what the Code tab has open: the file, the picked lines (with their text), the chunk, the proposals waiting, the latest run
- **code open [--lines a-b]** — open a file on the Code tab's surface (the tab follows), optionally with lines picked
- **code select [to] | --chunk | --clear** — pick lines (or a chunk) of the open file on the Code tab's surface; --clear unpicks
- **code edit --with "" [--expect ""]** — replace lines from..to with new text — checked against the file as it is now; lands as a proposal (apply writes it)
- **code assist ["instructions"] [--provider p] [--model m]** — hand lines from..to to the repo's agent with an action; its replacement for exactly those lines lands as a proposal (explain answers only)
- **repo runs [--status running|done|failed]** — the runs Nexus kept for this repo: goal, attempt, agents tried, steps, files read and changed
- **repo lessons [--phase P] [--limit N]** — what the agents were taught: each rejection read for its failure mode (gutted, exports-lost, regressed …), with the agent's own diagnosis, and every…
- **repo rewind-run [--dry]** — put every file a run changed back as it was before the run (each restore is a version; --dry says what it would do)
- **canvas list** — every canvas compartment, with how many tools it holds
- **canvas new "" [--description "…"]** — a canvas: a COS compartment laid out from his ERAVOS canvas (tools are added as nested compartments)
- **canvas show** — a canvas, its nested tool compartments, and whether each is linked in
- **canvas add-tool "" [--sound]** — a tool on a canvas: its own nested COS compartment, from his tool template, linked into the canvas
- **contract new [--what text] [--why text]** — a new v2 contract (context → build → verify gates) to edit
- **contract gates** — every gate and its state (BLOCKED · READY · PASSED · FAILED · STALE), and whether the contract is complete — and why not
- **lattice neighbours [--kinds=causal,reference,temporal] [--window=ms] [--limit=n]** — the nodes joined to a node (or to what the words find), each edge typed — causal, wire, reference, or temporal (when they happened, never a cause)
- **lattice nodes** — the node lattice: how many nodes and edges of each kind, which systems were read and which could not be
- **context find [--need=a|b|c] [--repo=] [--gate=] [--sources=atlas,vector]** — what Nexus already holds for a request — every context source asked at once (non-linear), each piece with its source and kind; the need nothing…
- **context sources** — the context stream's sources: each row's signature, system, cost (free | model | build) and kinds — joining is a row, never a line in the finder
- **contract packet** — the smallest context one gate needs (its refs resolved, upstream evidence, its gaps) — what an agent is handed
- **contract check** — verify one gate now against real evidence and record the result (missing proof is never a pass)
- **contract evidence** — record evidence a gate condition reads ({ evidence: key }) — who and when are kept
- **contract split [--by requires|actions] [--agent name] [--budget tokens] [--force]** — split a gate into child gates — when it is too big for the agent (its learned budget) or has failed twice; --force splits anyway
- **contract budget [kind]** — how big a piece this agent passes reliably, learned from every contract check (null while untried)
- **contract run [--concurrency n]** — run every READY brick — independent ones at the same time — through the agent tools (copilot, Clear Glass automation and macros, pipelines,…
- **contract status** — complete or not, and exactly why — derived from the gates, gaps and invariants
- **contract audit** — every brick (its agent, attempts, verification), every dependency edge, every checkpoint and every gate — the auditable record of a contract run
- **repo contract [--map name] [--gate id] [--trace]** — a phase build's contract, audited: every brick (its agent, attempts, verification, the commit it passed at, a rewind), every dependency, checkpoint…
- **repo map-phases [status] [--limit n] [--no-apply] [--done] [--untrusted]** — map every phase that names no files to its files (an agent, scored first on phases whose files are known) and every phase to its dependencies (from…
- **repo compile-spec [--into folder] [--template genesis|compiler|]** — lay out a .spec in the compiler's format from its template — genesis by default (the nexus-system skeleton, the spec's modules slotted in as…
- **repo plan [phase] [--map name]** — the build plan: each phase with its pieces (one per planned file: pending, running, written, failed, proven) — or one phase with every run and its log
- **repo cost [phase] [--map name]** — what each phase cost in agent calls and tokens: plan, code and review calls, local vs remote, tokens in and out (estimated), per run
- **system routing [ ]** — the build routing policy (planner, contract_build, test_first, ladder…), or set one switch: routing. =
- **system compartment [] [--apply]** — each system's COS compartment from loom's template (nexus-self-): its intent (end state: sovereign; conditions; the genesis axioms), runtime, mounts…
- **system shape []** — does each system match genesis (the skeleton cos/archetype/nexus-system): every role — entry, cli, config, compartment, registry, contract, events,…
- **system sovereign []** — which systems are sovereign (nothing they require is in another system's folder; lib/ is the kernel) and, for each that is not, what is in the way:…
- **system nodes [ []]** — a system's own node database (/data/node-index): each node type with its files, its index and its history; with a type, its nodes; with an id, that…
- **failure list [--open] [--class ] [--limit n]** — every failure mode Nexus recorded (cortex): what failed, where, how often, whether it has a cause chain and a macro yet
- **failure show** — one failure mode as its report: what failed, the conditions that led to it and the holes in that chain, ripple/wave/tidal, sigma, the CFR field, how…
- **system causality []** — the share of each system's ledger rows that name their cause (causedBy) and how many of those resolve to a row that exists: what a failure report…
- **system homes []** — files in the shared folders (lib/, hooks/, service/, contracts/ …) that belong to one system: used only by it, or named for it in hooks/ and…
- **system tunnel []** — the tunnel into each system (lib/system-registry.js): where it runs, the routes it declares, the commands that reach them, its toasts and…
- **system heartbeat** — every system asked over its own health route, now: up, degraded (answered badly or slowly), down, with why
- **system registry [] [--settle]** — with no system: every system and what it depends on (the dependency graph). With one: its registry generated from the source — what it declares…
- **system drawbridge [--new]** — every require() that crosses from one system into another, by pair and kind (system, upward from lib/, kernel), and the ratchet: crossings new since…
- **system lean [on|off]** — lean mode: stop the services a build does not use (now and at every start), or start them again
- **system prevention [clear ]** — the failure modes preventing now (a memory crisis makes heavy work wait for headroom for a day), and whether heavy work may run; clear ends one early
- **providers ready** — can each browser agent take a job now, and if not why: a sign-in wall, every account resting, a usage limit, a reply waiting on your ◎ pick
- **accounts chain [account1,account2,…]** — a provider's account fallback chain: show it (and which accounts rest at their limit), or set it in order
- **accounts profiles** — every account tab: each provider's own tab (and the account it runs) and its profile tabs (other accounts, in their own sessions), busy or idle —…
- **repo diff [b|working] [--path file]** — what changed between two versions (b defaults to the files on disk now)
- **repo restore-file** — put one file back as it was at a version (the change is itself versioned)
- **repo history-import [zip…] [--dry] [--allow-secrets]** — import the project's past as real versions: a zip with its .git gives every commit; several zips of one project become one version each, in order
- **repo integrity [--notes]** — the import checks: parses, requires resolve, npm declared, duplicate files, secrets, files arrived (--notes writes them as the repo's notes)
- **repo notes [--q words] [--kind idea|decision|todo|question|quote|note]** — the repo's notes, pinned first then newest
- **repo note [--kind idea|decision|todo|question|quote|note] [--tags a,b]** — add a note to the repo (who wrote it is recorded)
- **notes [--q words] [--kind k] [--loose]** — every note, on every repo (--loose: only those on no repo)
- **note [--kind k] [--tags a,b]** — a note on no repo in particular
- **note done** — tick a todo or answer a question
- **repo funnel [--intent change|build|debug|spec]** — the four answers for a request, in order — its dependencies, its spec, its phase, its chunks — or where it stops and why (no model)
- **repo record [] [--status applied|proposed|reverted|rejected] [--limit n]** — each change an agent made: what (lines), who, why (its task and run), what was checked, the version it landed in, whether it can be undone, and any…
- **repo flight [] [--limit n]** — each agent run read whole: landed or stuck and why, the ladder of agents it climbed, what it cost, what was spent on attempts that never landed,…
- **repo undo [--no-merge] [--force]** — undo one change: what was there before is put back and every later edit is kept; if a later change touched the same lines, nothing changes and the…
- **repo carve | repo carve --preset flight_recorder [--name n] [--cut optional|optional,lazy|none] [--verify]…** — copy a part of Nexus (files or folders) into a new Idearium repo with everything it requires; says what pulled each file in, the npm it needs, and…
- **raid parked** — what the officiator holds back: the agents' wait (no agent answered) and each staged drop's tries, why, and when it is tried next
- **raid unpark []** — clear what the officiator holds back: one drop (by id or its first characters), or everything (the agents' wait included) — tried on the next tick
- **projects** — every project of yours on one list: what is waiting on you, what is next, what moved last
- **components [--q words] [--limit n]** — the component store: every stored component, or those matching words
- **components decompose [--project name]** — decompose a project folder into the component store: every code file a component, its requires resolved, its npm packages named
- **components bundle** — one component and everything it requires as one organized zip (component.json, package.json, README, files at their project paths)
- **activity [--kind k] [--actor a] [--status failed] [--q words] [--limit n]** — every compartment's activity log at once (what BrainOS shows)
- **repo phasemap [--ready] [--map name]** — every phase of the repo's phasemaps: done, ready to build, blocked — and its last run
- **repo phase-graph [--map name]** — a phase's dependency graph, the one a build is refused without: the files it changes, what they use, who uses them (what a change can break), the…
- **repo phase [build [--map name] [--provider ollama|claude-code|claude|…] [--note "…"] [--replan] [--anyway]]** — one phase: its runs (and why one stopped), or build it now as a background task (a build started again keeps its saved plan and resumes; --replan…
- **repo versions [--limit n] [--kind snapshot|backup|staging|history|revision]** — every version of the repo, newest first: snapshots (VR1: every change a commit), backups, staging, imported history, work-surface revisions
- **repo releases [--cut] [--version x.y.z] [--quote "…"] [--notes "…"]** — the repo's releases, newest first (Versionium tags with the commits since each last one); --cut releases the head now
- **repo desktop [status | start | stop | pause | resume | checkpoint [--label "…"] | checkpoints | rewind ]** — the repo's desktop VM: power, pause, live checkpoints, rewind
- **repo system [status | restart | stop | start] [--process name]** — a Nexus system repo's processes, controlled through autopilot (never the system itself)
- **perf** — memory, heap and CPU as the resource monitor sees them (orchestrator)
- **repo blanks [complete [--section id]] [--path spec/x.spec]** — the spec's blank sections and empty files — complete drafts each one as a workshop proposal you accept
- **repo history [--tag kind:edit|run:id|by:who|inject:id]** — the commits that touched one file — when, who, why (VR1), newest first; --tag filters by their labels (CV4)
- **options [ | --reset] [--actor copilot]** — a system's options — every value its code reads, with its default, range and source; set or reset one
- **access** — who Idearium sees you as, and its access mode (open · origin · password)
- **access keys** — the app passwords: label, hat, repos, capabilities, last used (never the password)
- **access new [--hat h] [--repos a,b] [--caps read_ideas,write_ideas,admin]** — make an app password — shown once; save it in Clear Glass to be signed in everywhere
- **access revoke** — revoke an app password — its sign-ins end at once
- **field [--on ] [--overlay] [--all] [--limit n]** — the interaction field: every clickable thing in a Clear Glass window, numbered, with x, y and z (0 = on top) — --overlay draws the numbers on the page
- **field off [--on ]** — take the field's numbers (and any spotlight) off the page
- **field at [--on ]** — what is under one point, top first — what a click there would hit
- **field show [label…] [--on ] [--off]** — spotlight a target — a ring on it and the page dimmed around it, with a label
- **field point [click|double|right|move|scroll|type] [--text t] [--via native|eros] [--on ]** — act on a numbered target, the way a person's pointer would — a covered target is said, never clicked through
- **picks [--last] [--html]** — the elements James handed to the agents with the Guardian picker (→ CLAUDE CODE): selector, page, text — newest first
- **glass signin [provider]** — bring a provider tab (or every one) to its default account's saved sign-in in Clear Glass; says what it did per provider
- **field windows** — what the field is doing in each Clear Glass window: its last map, spotlight and pointer, and how lately the page changed
- **nerve** — Nexus Nerve: the field's regime, which systems are present, and where each window's attention is
- **dump [--lines]** — drop an idea (or many, one per line with --lines) into the Void — verbatim, sorted later
- **census [--verdict claimed|verified|contradicted|built?|open] [--specs…** — 
- **store** — the shared memory store by its files: each table's size, append segments, cap and archive (cortex)
- **ollama tape [] [--chars n]** — every Ollama call recorded: the runs, or one run's macro — each call asked and answered, in order
- **models** — the Ollama models installed, their sizes, what is loaded — and which fit in memory now
- **glass open** — show James a page in Clear Glass: the window already on that site comes to the front, else the main window goes there, else a new one
- **log [autopilot|errors|.log] [--lines n] [--grep pattern]** — the end of a Nexus log (autopilot by default; errors = data/error.log), keys redacted
- **file [--from n] [--lines n]** — read a file (or list a folder) of the Nexus tree, numbered — never a secret, under data/ only logs
- **grep [--path dir] [--limit n]** — search the Nexus code for a pattern: file:line: text (no node_modules, data or archive)
- **chat-crawl []** — the personal-chat crawler: reads an account's chat list, then each chat once, then only new or changed ones; off until the account's switch is on in…
- **nexus-release** — the latest Nexus release and COS: status says what is out, what COS has and what a fetch would do (downloads nothing); fetch puts the zip in COS's…
- **net |add --via V [--provider p] [--url pattern] [--origin host] [--caller c] [--protocols https,wss]…** — 

</details>


### Every release, in his words

Every release note in the tree, 362 of them, newest first. Each opens with James's own words: what he asked, as he wrote it, his spelling kept. Then what was built, from the note's own section headings. The note itself is the file named, at the top of the tree. Releases are grouped by series; each series opens to its releases.

<details>
<summary>0.60.x · 154 releases · 0.60.0. to 0.60.157.</summary>

- **0.60.157.** — 2026-10-18 — James: "associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp and cuasal graph." — built: The node lattice · Delivered in order · Measured on this tree
- **0.60.156.** — 2026-10-18 — James: "it needs to be non linear and agnostic" — built: The context stream · Delivered in order · Fixed on the way: a regression of the coder's
- **0.60.155.** — 2026-10-18 — James: "okay lets finish the gating, or next steps. look at all of the phases that mention gates." — built: Layer 0: the record tells the truth · One of each, where several maps mapped the same thing · Decided by his axioms (D15–D23)
- **0.60.154.** — 2026-10-18 — James: "it needs to be non linear and agnostic" — built: The coder's reading, to confirm · GM5 redesigned on SISO (addendum b) · Kept, and superseded
- **0.60.153.** — 2026-10-18 — James: "can you update and expand the read me. expand anything thats a list. all the phases. have a full section of for each of the 15 systems,…" — built: Generated (lib/readme-generate.js) · Corrected by hand · Found on the way
- **0.60.152.** — 2026-10-18 — James: "what about using verctor memory or associative memory or the pattern engine. intuition to find context if needed. like the tools the…" — built: The map · His rule, applied · Decisions
- **0.60.151.** — 2026-10-18 — James: "each phase, has to have a dependany graph before executing." — built: What was there · DG2 — a dependency graph before every phase · It binds the coder too
- **0.60.150.** — 2026-10-17 — James: "do it. did you spec it out. we need to add this all to nexus, there is boundaries mapping it" — built: The boundary, first · FMR0 — causality measured (diagnostic) · FMR2 — every failure reaches the record (cortex), partly
- **0.60.149.** — 2026-10-17 — James: "failure mode report thats also a macro to import into a cos test env. nexus nerve, spotlight and interaction field for debugging. like…" — built: The map · The sweep: what was lurking · Found
- **0.60.148.** — 2026-10-17 — James: "we need to continue building the flight recorder. look at rfr2, and cfr for friction and tension. versionium, cos test envirenements and…" — built: Why FR6 first · FR6 — flight data · Fixed, found while building
- **0.60.147.** — 2026-10-17 — James: "can we spec the product for debugging. the intelligence system crystalization memory, rewind engine, versionium, cos, rfr2, cos, runtime…" — built: The map · Decided by his axioms · Found while reading
- **0.60.146.** — 2026-10-18 — James: "okay only one record. maybe use it as a contract ledger for each contract." — built: The contract ledger (lib/work-journal.js 2.0.0) · One record of a reply · Found and fixed
- **0.60.145.** — 2026-10-18 — James: "alright the gates need context. needs persistence, needs to survive restarts, reuse contracts, jobs and responses." — built: Read first: what a gate already kept across a restart · What was missing · TL2a
- **0.60.144.** — 2026-10-18 — James: "You got it persistent per gate" — built: What 0.60.143 did not do · TL1c — kept per gate · Fixed on the way
- **0.60.143.** — 2026-10-18 — James: "We need persistent data look at the last commit." — built: What was lost · TL1b — the reply on disk as it streams · Mapped in the same release: the product for debugging
- **0.60.142.** — 2026-10-17 — James: "modified a file but no where to be found. i want to see it live in the code tab. plan panel isn't bonud to the tab like the other. fix it…" — built: Why nothing showed · LV1 — the thinking streams · LV2 — live in Code › changes and on the open file
- **0.60.141.** — 2026-10-17 — James: "needs to build a test first then use that to shape expectation and conditions." — built: Before · Now: the test is written first, and it shapes the build · Found and fixed on the way
- **0.60.140.** — the projects folder out of Idearium, until Idearium has sync — James: "im saying add a sync feature to idearium. remove it from idearium unntil then" — built: Context · What changed
- **0.60.139.** — 2026-10-17 — James: "these are all my projects i have so far. way more. in some folders. i was hoping to use idearium and cos to manage them" — built: What was there · Built: COSA14, his projects folder · Still open
- **0.60.138.** — 2026-10-17 — James: "and the diagnostic needs to be a real system matching genasis." — built: Matching genesis, made checkable · Diagnostic, a genesis system · The other systems, by the same check
- **0.60.137.** — 2026-10-17 — James: "and the diagnostic needs to be a real system matching genasis. also can you fix cos for me? the zip doesn't have nested folders anymore.…" — built: What his screenshot showed · COS 0.1.2: it says when a newer COS is out · Found and fixed: Clear Glass picked the wrong release
- **0.60.136.** — 2026-10-17 — James: "no, this is my system. come to me for problems, else use the axioms. continue with each system." — built: Whose decisions · Diagnostic and the healer: one system · COS: what a compartment's start spawns
- **0.60.135.** — 2026-10-17 — James: "use the axioms in the docs for each disicio nthat doesn't show my competence" — built: Decided by the axioms (docs/2026-10-17-decisions-by-the-axioms.spec) · Still his · What it changes
- **0.60.134.** — 2026-10-17 — James: "and you know i mean cos compartment right? make a template for it now that loom holds" — built: The compartments already exist · Built: loom/templates/cos-compartment.js · What it shows
- **0.60.133.** — 2026-10-17 — James: "need to get the systems soveriegn again like we were talking about" — built: IM1: the census as a command · IM6: a system's own database · The first running system made sovereign: nexus-healer
- **0.60.132.** — 2026-10-17 — James: "Update the genesis template. And the system template skeleton. Then when we are done. Should work on the infrastructure. Soon. Migrating…" — built: Genesis 1.5.0 (idearium/spec-engine/templates/genesis.spec) · The system template skeleton (cos/archetype/nexus-system) · The system spec template (architecture-spec.template.yaml)
- **0.60.131.** — 2026-10-17 — James: "do it. what other systems?" — built: Which systems · One writer per database (N8), and a flaw in 0.60.130 fixed · Guardian onto the shared registry
- **0.60.130.** — 2026-10-17 — James: "each system, reads, writes, and manages its nodes. each system has a database for each index of nodes with all the history. listener,…" — built: The phases that already own this · Built: P33a, a node registry any system runs · Moved: the store is the kernel's
- **0.60.129.** — 2026-10-17 — James: "all system relevant files should stay with the system. the data nodes should reflect guardians nodes but in relation to the system they…" — built: His decisions, recorded · Built: DB18, nodes in relation to their system · Built: DB17, the census (nothing moves yet)
- **0.60.128.** — 2026-10-17 — James: "okay each system needs one right?" — built: His decisions, recorded · Built · What it shows, measured
- **0.60.127.** — 2026-10-17 — James: "shadow and negative space reasoning for debugging. maybe every repo has to generate a component registry. the component registry can also…" — built: His decisions, recorded · His question: can the registry be a dependency graph? · Built: DB9 + DB10
- **0.60.126.** — 2026-10-17 — James: "lets work on wiring everything together. i want to eventually have the component registry for each system be the interaction contract and…" — built: What was there · Built: DB1, the census and the ratchet · His to decide (the coder's recommendations, named as the coder's)
- **0.60.125.** — 2026-10-17 — built: DG1 — a phase is not built while what it depends on is open
- **0.60.124.** — 2026-10-17 — built: SW1 — Idearium stays responsive while it syncs the Nexus repo · SW2 — Guardian no longer loops on a signed-out tab · SW3 — COS's system map on Windows
- **0.60.123.** — 2026-10-17 — James: "check main. we aare way ahead. then look at the plan panel, can you integrate it with the rest of the new panels? like this should be the…" — built: The Plan: pieces, runs, and the dock (PP1–PP4) · Memory: a failure mode that happened becomes a prevention (MP)
- **0.60.122.** — 2026-10-17 — James: "the ui editor is for editing uis, whether its electron, html, etc. can pull from outside sources but we need a full editor like your…" — built: The engine: an outside source, checked (UE0) · Scope, said
- **0.60.121.** — 2026-10-17 — James: "like yours but with a control panel." — built: The Code tab's Control panel (DK3, idearium/ui/js/code-dock.js) · The release zip has no folder around it (scripts/release-zip.js) · His order for the UI editor, recorded
- **0.60.120.** — 2026-10-17 (built on claude/brave-cori-eczug1 as 0.60.118; renumbered at the merge with main, which used 0.60.118 and 0.60.119) — James: "Okay. Keep going." — built: FR4a: the flight recorder on its own · Found while building · Not yet
- **0.60.119.** — 2026-10-17 — James: "Tests need to be first." — built: TF1 — a file's expectation, written first (lib/expectation-tests.js, new) · RA1 — the right agent for each kind of job (lib/agent-record.js 1.1.0) · On "crystallization memory" (his question)
- **0.60.118.** — 2026-10-17 — James: "i want the code tab better. like you have on the right. outputs for proposals and artifacts. changes for the worksurface and workspace.…" — built: The dock (idearium/ui/js/code-dock.js, new) · Tools and procedures (lib/repo-procedures.js, new) · Not done, said
- **0.60.117.** — 2026-10-17 — James: "Next and Merge." — built: What was missing · Built · Noted
- **0.60.116.** — 2026-10-17 — James: "Okay so where is the product being made? Or are we building the capability first, then branching?" — built: His decision, and what it was between · Found while answering: the coder's own claim was wrong · PB1: the product boundary
- **0.60.115.** — 2026-10-17 — James: "merge. then next phase." — built: What was already there, and what was not · Built · Not yet
- **0.60.114.** — 2026-10-16 — James: "next" — built: What a record says · Built · Found while building
- **0.60.113.** — 2026-10-16 — James: "expand it." — built: CV2a: how each link loads, and the tangle · CV2b: does it load alone? · Measured on the flight recorder
- **0.60.112.** — 2026-10-16 — James: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?" — built: The product question (the coder's reading, his to confirm) · What was built: CV1, branch a part of Nexus into its own Idearium repo · What the preset showed
- **0.60.111.** — 2026-10-16 — James: "please fix this. the naming in github doesn't even match that..." — built: Why it was still broken after 0.60.103 · What changed · Not verified here
- **0.60.110.** — 2026-10-16 (built on the branch as 0.60.104; renumbered at the merge with main, which used 0.60.104–0.60.109) — James: "can you do the code tab changes?" — built: 1. A placeholder is not the work (the code.write gate) · 2. The Code tab, one view at a time, made solid (TB5) · 3. TL0 is a question for him, not a build
- **0.60.109.** — 2026-10-16 — James: "fix it. i don't want the trouble again" — built: What it is now · "No trouble again", built in · Not done (said, not hidden)
- **0.60.108.** — 2026-10-16 — James: "for the google login, can you do everything you can to prevent that? like across domains, contexts, erosmanceros, proxy," — built: What was found, and what changed · Not done (said, not hidden)
- **0.60.107.** — 2026-10-16 — James: "Can you make something like the sidebar, for contexT? can you strip the plan panel to just the plan with context, and progress? make the…" — built: Built · Not done (said, not hidden)
- **0.60.106.** — 2026-10-16 — James: "need this fixed. completely" — built: Why Google refused · Built · Not done (said, not hidden)
- **0.60.105.** — 2026-10-16 — James: "okay, it" — built: Why so much regression (what the run showed) · Built · Not done (said, not hidden)
- **0.60.104.** — 2026-10-16 — James: "here, use this. what about using cos for the canvas, then each tool a nested compartment? remove it from idearium also. creating templates…" — built: His idea, and the coder's reading · Built (CN1–CN4) · Not shipped, and why
- **0.60.103.** — 2026-10-16 — James: "the ui is fucked up. its too cluttered. thats why i want you to rebuild it the way i told you." — built: Code tab (TB5, first cut) · COS zip import (cos/app/store.js) · Not done
- **0.60.102.** — 2026-10-16 — James: "just needs to recover and retry after rejection. like log the fault or failure mode and retry." — built: What was wrong · What changed
- **0.60.101.** — 0.60.101 (built on the branch as 0.60.77; renumbered at the merge with main) - 2026-10-16 — James: "I'm saying from all domains, relative to coding, qa, qc, all checks and test. Any for all syntax and languages, compilers, and software,…" — built: Built · The coder's call, not a tooling limit · Not built
- **0.60.100.** — 0.60.100 (built on the branch as 0.60.76; renumbered at the merge with main) - 2026-10-16 — built: What went wrong · What changed
- **0.60.99.** — 0.60.99 (built on the branch as 0.60.75; renumbered at the merge with main) - 2026-10-16 — James: "it's stopped. needs to retry, also probably should gather context on why it was rejected. even injecting it into complex reasoning agents.…" — built: Why it stopped (found, not guessed) · What changed · Not built (mapped as PE5-PE9)
- **0.60.98.** — 0.60.98 (built on the branch as 0.60.74; renumbered at the merge with main) - 2026-10-16 — James: "what about generating the tests first, wouldn't that be easier and then it would help shape the expectation of the output?" — built: Why this came first · What changed (lib/repo-inject.js) · Not built (the larger idea, mapped)
- **0.60.97.** — 0.60.97 (built on the branch as 0.60.73; renumbered at the merge with main) - 2026-10-16 — James: "good embedded check isnt working, need to fix that for good." — built: What was wrong · What changed (lib/vector-memory.js, lib/local-vector-index.js) · Limits
- **0.60.96.** — 2026-10-16 — James: "okay the cos windows app?" — built: What was wrong (read in the run's log and in git) · What changed · Not proven
- **0.60.95.** — 2026-10-16 — James: "code tab?" — built: What changed · Still open
- **0.60.94.** — 2026-10-16 — James: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk." — built: What changed · Measured on Nexus itself · Not built yet
- **0.60.93.** — 2026-10-16 — James: "auto updates from dropping in new zips, downloading it from clearglass." — built: What changed (COSA7: Clear Glass delivers) · Honest limits
- **0.60.92.** — 2026-10-16 — James: "do it" — built: What changed
- **0.60.91.** — 2026-10-16 — James: "just need a cli to replace powershell, to run the npm run start:all command, and cli commands." — built: What changed
- **0.60.90.** — 2026-10-16 — James: "being upgrade cos executable" — built: What changed (COSA12 and the first slice of COSA13)
- **0.60.89.** — 2026-10-16 — James: "cos app for windows" — built: What changed (COSA6: the window)
- **0.60.88.** — 2026-10-16 — James: "cos app for windows" — built: What changed (COSA2, COSA3, COSA4: COS runs and switches your installed…
- **0.60.87.** — 2026-10-16 — James: "cos exe for my pc to run nexus on, so i can just replace the zip each time." — built: What changed (COSA1: the version store and zip import)
- **0.60.86.** — 2026-10-16 — James: "can you make a bunch of jobs for me for clearglass." — built: What I read · The five
- **0.60.85.** — 2026-10-16 — James: "build it." — built: What I read · What changed
- **0.60.84.** — 2026-10-16 — James: "chatgpt the thing we talked about earlier, that indexes novel one by one" — built: What I read · What changed
- **0.60.83.** — 2026-10-16 — James: "can you remove eravos?" — built: Deleted (ER1) · Unwired (ER2, ER3) · Kept on purpose
- **0.60.82.** — 2026-10-16 — James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3" — built: The Files tab is merged into Code (CE6) · Manage and History are one menu (CV1) · The picked lines, with an action (CE7)
- **0.60.81.** — 2026-10-16 — James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3" — built: CE7: AI editing by lines or a section · CV2: a version per diff (his words: "versioning each diff using versionium") · CV4: tagged history ("full history tracked and tagged")
- **0.60.80.** — 2026-10-16 — James: "tell me recent phases. can we do the code tab now?" — built: What was wrong · What changed (backend → route → command → UI) · Not done
- **0.60.79.** — 2026-10-16 — James: "can we not have it chunk everytime it restarts. it needs to persist. all data is meant to persist. hardcoded has to earn its place..." — built: What was wrong (read in idearium/api/index.js _phaseBuild and… · What changed · Not done, said
- **0.60.78.** — 2026-10-16 — James: "Next" — built: What was wrong (read in cortex/core/raid/officiator.js) · What changed (the GT1 rule: classify before learning)
- **0.60.77.** — 2026-10-16 — James: "Step 4" — built: What was wrong (read in source) · Measured on the way · What changed
- **0.60.76.** — 2026-10-16 — James: "Let’s get this pipeline working" — built: What was wrong (read in source) · What changed · Not proven yet
- **0.60.75.** — 2026-10-16 — James: "pipeline is vitam, the intent and ruoting and chubkiing and gating" — built: What changed
- **0.60.74.** — 2026-10-16 — James: "i figure cos could be helpfui for managing my projects so im not so overwhelmed." — built: What changed · Found while building
- **0.60.73.** — 2026-10-16 — James: "Option 1 (my recommendation): wrap each of those agent calls in WARP (its cache, then the axiom gate, then keeping the result), while the…" — built: What changed · Found while building (read in source)
- **0.60.72.** — 2026-10-16 — James: "tell me all the recent changes. i want a changelog for each change or diff. i want it all syncd with git, versionium, the zip. like lets…" — built: What the record was missing (read, not remembered) · What changed · Known, said
- **0.60.71.** — 2026-10-16 — James: "actually wen its asking me to pick the inputs or response, or what ever. its needs to use the guardian picker so i can traverse through…" — built: What was there · What changed · Not proven here
- **0.60.70.** — 2026-10-16 — James: "alright." — built: SP2: a picked field is found by what it is, not only by its class names · From his log · Not proven here
- **0.60.69.** — 2026-10-15 — James: "should not rely on raid." — built: What I found · What changed
- **0.60.68.** — 2026-10-15 — James: "Use the templates. The genesis by default." — built: Read first · What changed · To confirm
- **0.60.67.** — 2026-10-15 — James: "Next." — built: WB0: which builds go through WARP, measured (lib/build-paths.js, CK-255) · SF4: a collected spec compiled · Found and fixed while shipping (my own regression)
- **0.60.66.** — 2026-10-15 — James: "Continue" — built: SF1: prompt blocks chosen by intent · SF2: the spec framework · SF3: the listener that collects it
- **0.60.65.** — 2026-10-15 — James: "Merge with main. Then look at the recent spacs for idearium. And begin on the pipeline. The speccing, mapping, listener. It doesn't know…" — built: Merged with main · Read first · MP1: Nexus maps every phase, with no model (lib/phase-map-auto.js)
- **0.60.64.** — 2026-10-15 — James: "phases tags by system/nested repo" — built: What was there · What changed · To confirm
- **0.60.63.** — 2026-10-15 — James: "can you make sure those are added to the phases in idearium. make sure all of the files and dependancies are mapped. and i want the specs…" — built: What was there · What changed · To confirm
- **0.60.62.** — 2026-10-15 — James: "bricks keep failing." — built: What his log showed · Root cause (read from source) · The fix
- **0.60.61.** — 2026-10-15 — James: "now can we get the pipeline working?" — built: What I found · What changed · Still needed from him
- **0.60.60.** — 2026-10-15 — James: "im saying add support for snowflake, using cli, then you can add the commands to the agents, or make agent tools. what about an encrypted…" — built: What it does (CLI first, as he ordered) · What it does not do yet (status says so) · The encrypted container (mapped as NP19, not built)
- **0.60.59.** — 2026-10-15 — James: "downloads any files into the sandbox, shows in the downloads library, a safe pipeline. okay, can you consolidate the settings? if you…" — built: Settings, consolidated (the second pass) · Dark popups (the second pass) · Mapped, not built (NP16,…
- **0.60.58.** — 2026-10-15 — James: "have a simple step by step guide for making a macro on a webpage, and have a optional toast for macro recording when you press the hotkey"
- **0.60.57.** — 2026-10-15 — James: "this is wrong... needs to start recording a macro node file. i was saying the whole process of the chat listener.. like expand the…" — built: What changed · Not done (mapped in docs/2026-10-15-macro-node-recording-phasemap.spec)
- **0.60.56.** — 2026-10-15 — James: "use erosmanceros, scroll slowly, using the arrow keys or something, could also make it a macro and or automation in clearglass, a good way…" — built: What it does · The test he asked for
- **0.60.55.** — 2026-10-15 — James: "i dont [want] anything missed. then it only logs the chaturl once unless it has new data, maybe check the previous chat url once, but use…" — built: The plan (lib/chat-crawl-plan.js, 18 tests) · The settings (lib/chat-crawl-settings.js, Settings -> Chat capture) · Not built, said plainly
- **0.60.54.** — 2026-10-15 — James: "can you make all pop ups from clear glass look like this" — built: Popups (CS1) · One section (CS2)
- **0.60.53.** — 2026-10-15 — James: "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a fact? like i want to keep a record…" — built: What it is · The agents' listener
- **0.60.52.** — 2026-10-15 — James: "i cant click the login on the popup for chatgpt. just chat gpt." — built: ChatGPT login click · Toolbar · Not proven
- **0.60.51.** — 2026-10-15 — built: What the window is · Cause (from reading the code; not reproduced here) · Fix
- **0.60.50.** — 2026-10-15 — James: "i feel lime also needs to use the gates to maintain persistence using the memory. so we can use nexus for the workload, instead of relying…" — built: What was wrong · What changed (CE1-CE5, CE10) · Found afterwards (same day)
- **0.60.49.** — 2026-10-15 — James: "should we have each module or capability specced. … like specs can reduce surface area, then the phases also. like i want the specs to be…" — built: CS1: a spec per capability, and its surface is the gate · SP1: the page as a semantic tree for Clear Glass's browser agent · Every gap spec drift finds goes to the intelligence system
- **0.60.48.** — 2026-10-15 — James: "im so sick of zips" — built: npm run update: the latest Nexus without a zip
- **0.60.47.** — 2026-10-15 — James: "Claude's reply not found … it should have poped up with the claude window but didint." — built: A reply that can't be found now opens the agent's window
- **0.60.46.** — 2026-10-15 — built: A dropped provider tab reconnects within one heartbeat · Seen in the same log, named and not fixed here
- **0.60.45.** — 2026-10-15 — James: "still says signed out. also escape does nothing. also i can't sign in on the popup. i click login and it closes the login. like i cant…" — built: The provider tab stops fighting the person · Still open
- **0.60.44.** — 2026-10-15 — James: "Yes like gates can asses if dependacies are being met or if context is needed." — built: GA1: the gate checks before it spends · Not done
- **0.60.43.** — 2026-10-15 — James: "Is this going in a good direction." — built: QA2: one phase build, end to end, with the real Versionium
- **0.60.42.** — 2026-10-15 — James: "then each gate tags and tracks progress through the system." — built: GT2: each gate tags and reports its progress · Changed from the map (to confirm)
- **0.60.41.** — 2026-10-15 — James: "need more coordination for releases. like i want idearium to have releases and a changelog for each version. it was added to the wrong…" — built: RN1: releases live in Versionium · Not done
- **0.60.40.** — 2026-10-15 — James: "we added gating and chunking recursively, dynamically, like bricks" — built: BR2: splitting recursively, up to a depth limit · Not done · Next
- **0.60.39.** — 2026-10-15 — James: "rewind engine and snapshots for each gate, comparing using the contract, for the gating what ever is needed, so much of this exists, just…" — built: GS1: a snapshot per gate, rewind, compare · Next
- **0.60.38.** — 2026-10-15 — James: "we added gating and chunking recursively, dynamically, like bricks … i feel something happened" — built: BR1: bricks on every path · Next
- **0.60.37.** — 2026-10-15 — James: "we have all contracts, whether its from loom, idearium, co-pilot, self-heal go to raid's input folder, and queue, then through raid" — built: RD1a: every build goes through RAID · Found by the test · Not yet: RD1b
- **0.60.36.** — 2026-10-15 — James: "we have all contracts, whether its from loom, idearium, co-pilot, self-heal go to raid's input folder, and queue, then through raid" — built: RD0: RAID runs the .contract · Found by the test · Next
- **0.60.35.** — 2026-10-15 — James: "we added gating and chunking recursively, dynamically, like bricks. look at the contracts also and raid. i feel something happened" — built: What happened · Fixed · Mapped (not built yet)
- **0.60.34.** — 2026-10-15 — James: "i also want versions in idearium, github, and each zip, needs to match." — built: One version, said the same everywhere · Found and fixed · Not yet proven
- **0.60.33.** — 2026-10-14 — James: "now what? does that make it more stalbe?" — built: QA1, first cut: the check catalogue runs · First real runs on Nexus · Where to see it
- **0.60.32.** — 2026-10-14 — James: "also multiaccount routing in clearglass, each tab can be a different profile?" — built: What changed · Found while grounding it, fixed · Where to see it
- **0.60.31.** — 2026-10-14 — James: "and we have intent routing? that way the complex reasoning can be done by the bigger models or agents. like claude or deepseek? also…" — built: RT1: a route is eligibility, then preference · Where to see it · Not done
- **0.60.30.** — 2026-10-14 — James: "Build GT1 here (Recommended)" — built: What changed · Found on the way · Not done
- **0.60.29.** — 2026-10-13 — James: "All the phases need to be mapped to files and dependencies. With nexus and all projects." — built: Measured first · How phases get mapped now · Applied to Nexus in this release
- **0.60.28.** — 2026-10-13 — James: "can we work on inventing anything that will get this pipeline going. like why doesn't this work yet?" — built: Why it didn't work · A: ready before run (PF1) · B: a plan without a model (PF2)
- **0.60.27.** — 2026-10-13 — James: "conintue" — built: What a phase cost, in agent calls and tokens · Found by the count · Also
- **0.60.26.** — 2026-10-13 — James: "next. fix anything you can." — built: What lean mode holds stays quiet · The officiator stops re-sending the same failed drops · A deepseek job is never sent to a model he does not have
- **0.60.21.** — 2026-10-13 — James: "needs to retry when you reject it. what if you have copilot monitor repos every now and again if they stall? or have an agent check in?…" — built: No run left in limbo · The coder's reading, his to confirm
- **0.60.20.** — 2026-10-13 — James: "start lean? why not just have that a toggle? i want to test it now" — built: Lean mode: one switch, in Idearium · A build is never reworded first · Rejecting tells the agent
- **0.60.19.** — 2026-10-13 — James: "can you delete this architecture afrom idearium? dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a…" — built: The Architect page is gone from Idearium · His list, in Nexus · The map: docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec
- **0.60.18.** — 2026-10-13 — James: "Yes. Build the agent and phase adapters next, then wire Idearium's phase build through the contract scheduler... build and test the…" — built: The scheduler knows blocked from failed (EX0a) · The agent adapter (EX0b) · The phase adapter and checkpoints (EX0c, EX0d)
- **0.60.17.** — 2026-10-13 — James: "the split should be triggered by more than context overflow or two failures … a parent must not pass merely because its children…" — built: CT1, refined · SC0, the scheduler (contract run)
- **0.60.16.** — 2026-10-13 — James: "everything can be broken down into smaller pieces, with gates between. dynamic chunking for smaller agents or if the agent is struggling?" — built: CT1, dynamic chunking (cortex/core/raid/contract-gates.js) · Seen working · Mapped
- **0.60.15.** — 2026-10-13 — James: "each block in a .contract file(literally contract as the file extension.) using yaml file, each gated as steps, each chunk or gap can be…" — built: .contract v2 (cortex/core/raid/contract-gates.js) · His acceptance conditions, proven · Mapped next
- **0.60.14.** — 2026-10-13 — James: "need to use nexus as persitent storage, each interaction gated … a tool to request lines from a file to copy to the worksurface or a new…" — built: His 0.60.13: merged, and one merge mistake put right · New · Mapped
- **0.60.13.** — 2026-10-13 — James: "providers, accounts, and agent mesh all need to be using the same cookies. none of them are separate but I'm signed in and the provider…"
- **0.60.12.** — 2026-10-13 — James: "can you quickly make intent mapping and routing a setting in idearium?" — built: Intent routing is now a setting · The VM: mouse and terminal · Also 0.60.12, on his machine (his release of the same number, kept as written)
- **0.60.11.** — 2026-10-13 — James: "so why is compartment browser in clearglass ui. should be gone"
- **0.60.10.** — 2026-10-13 — James: "stop. need you to merge these. new models. qwen3.5:9b qwen2.5-coder:7b" — built: Merged: his two uploads · Ollama: his new models · His changelog, as written on his machine (labelled 0.60.7 there)
- **0.60.9.** — 2026-10-13 — James: "speccing, mapping, like needs to do the complex parts of the project. like spec, map, read, like anything that needs complex reasoning.…"
- **0.60.8.** — 2026-10-13 — James: "can you have the chaturl logged an reused for agents, unless it is blocked. like i want it to reload using the chat url before it…" — built: The chat URL reload, before anything escalates · Intent routing for reasoning (lib/reasoning-route.js)
- **0.60.7.** — 2026-10-13 — James: "yeah but can you manage it completely? also maybe, add in claude, also to follow axioms. name the tools, and best areas to get context,…" — built: Versionium for every repo (lib/repo-history.js, the Versionium tab) · Integrity checks on import (lib/import-checks.js) · The eyes, and what they found
- **0.60.6.** — 2026-10-13 — James: "here is two huge ones. i have more. this is what i mean by i need to be able to log these somewhere, its too much. like can we have a…" — built: Notes (lib/repo-notes.js, the Notes tab) · His decisions, quoted with context (docs/CLAUDE.md, new root CLAUDE.md) · The 34,000 lines, checked
- **0.60.5.** — 2026-10-13 — James: "contract format, maybe using primitives, priniciples, or invariants or maybe depenedancies as a boundary or constrain field for the…" — built: Clear Glass in the COMPARTMENT OS window style… · Decompose projects into components (lib/project-decompose.js) · Mapped
- **0.60.4.** — 2026-10-12 — James: "stop. before you continue. I dont want anything to go unmapped. here is some uncomited changes. can you commit them for me in clearglass…" — built: His gig work, committed · .gig files are YAML (clear-glass/src/autofill/gig.js) · Everything asked is mapped
- **0.60.3.** — 2026-10-12 — James: "It needs a human touch · PRESS & HOLD" — built: A human tab reads as plain Chrome… · RAID decides with real health in every process (cortex/core/raid/index.js) · The conversation carries across providers (lib/repo-agent.js,…
- **0.60.2.** — 2026-10-12 — James: "can you merge with the main branch? can you merge all of the if theyre additive?" — built: Merge · Account routing — Guardian decides, Clear Glass switches, the JAA vault keeps… · Google's CookieMismatch on ChatGPT's "Continue with Google"
- **0.60.1.** — 2026-10-12 — James: "like this needs to be the way each system is built in idearium using the nexus system template. like nexus is recursive, builds itself,…" — built: What the template already was · The handoff — the drawbridge (lib/handoff.js) · Recursion — a module is a system (lib/modules.js)
- **0.60.0.** — 2026-10-12 — James: "need it to generate code. not sure why its not using ollama in chunks, but i want to have a intent for the reasoning, to map and plan,…" — built: Why Ollama was not coding · Plan, then code (PC1, PC2) · Play, pause, rewind (RS1)

</details>

<details>
<summary>0.59.x · 16 releases · 0.59.0. to 0.59.15.</summary>

- **0.59.15.** — 2026-10-12 — James: "Okay but any of the agents need to be able to do that too for the agent switching. Like guardian is the source of truth for browser agents." — built: One instruction, every agent
- **0.59.14.** — 2026-10-12 — James: "Can you build the capability? Like first I thought of using you as copilot, then you would have full range of the system. Then I was…" — built: Claude Code as the co-pilot
- **0.59.13.** — 2026-10-12 — James: "youre open in clearglass. the point of nexus also is so im not held bacvk by token limits" — built: Fixed
- **0.59.12.** — 2026-10-11 — James: "the nexus> is for you. not me. give yourself the tools using nexus>. dude...." — built: The agent's own nexus> tools · README · Fixed
- **0.59.11.** — 2026-10-10 — James: "okay. now. make it useful like; hooked into copilot so you can talk to nexus" — built: Talk to Nexus in plain words (TN2, TN3) · A command's answer as plain text (TN1) · Fixes
- **0.59.10.** — 2026-10-10 — built: Changes
- **0.59.9.** — 2026-10-10 — James: "i want all sessions captured. i want this: ⌘ Nexus ran: census --limit 4 … hooked into copilot so you can talk to nexus" — built: Talk to Nexus from the co-pilot (clear-glass/src/copilot/bridge.js, verbs.js) · Every session captured (clear-glass/src/page/nexus-chat.js 1.4.0) · Browse rule (handoff item 3)
- **0.59.8.** — 2026-10-10 — built: Changes to the reader (clear-glass/src/page/nexus-chat.js)
- **0.59.7.** — 2026-10-10 — James: "try now" — built: The chat loop says what it does (clear-glass/src/page/nexus-chat.js)
- **0.59.6.** — 2026-10-10 — built: Why the command didn't run, and the fix · From his boot log · Co-pilot, from his panel
- **0.59.5.** — 2026-10-10 — James: "All I'm going to do. Is open this chat in clearglass. Then you should be able to talk to nexus right now." — built: Not proven yet
- **0.59.4.** — 2026-10-10 — James: "No I mean just using the capture. Like open the chat url. In general. Use the listener to have you use a command." — built: A listener that runs Nexus commands · Fixed along the way · Not yet
- **0.59.3.** — 2026-10-10 — James: "fiverr tutorial for helping me speed up gigs as much as possible, i need serious help. i have no bandwidth, and this is my only chance.…" — built: Fiverr, in the browser · A raw idea dump · Copilot reaches all of Nexus
- **0.59.2.** — 2026-10-10 — James: "can you make it so i can use guardian element picker for claude code. also the popup when picking an element needs buttons that wre…" — built: The Guardian picker's popup closes now, and its buttons are useful · The workshop starts from Nexus's own specs · No .md files
- **0.59.1.** — 2026-10-10 — James: "deepseek is absent." — built: DeepSeek was missing from the agent lists · The census: every spec and phase checked against the tree · Inbox
- **0.59.0.** — 2026-10-10 — James: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?" — built: The interaction field as commands (FN1) · Nerve sees the field (FN2) · The two meet on the nerve canvas (FN3)

</details>

<details>
<summary>0.58.x · 1 release · 0.58.0. to 0.58.0.</summary>

- **0.58.0.** — 2026-10-10 — James: "okay, lets get something built in idearium. what about a app password style login in idearium from clearglass panel, then we could…" — built: Idearium has a door · Not yet (mapped)

</details>

<details>
<summary>0.57.x · 2 releases · 0.57.0. to 0.57.1.</summary>

- **0.57.1.** — 2026-10-10 — James: "okay lets get idearium working." — built: Idearium's loop, run end to end · Mapped: LR1, each component in the language that fits
- **0.57.0.** — 2026-10-10 — James: "can you have these settings broken up into repos? or at least expand the settings drastically, i prefer options over hard coded, and i…" — built: Options instead of code, starting with guardian (OP0–OP3) · Environment & desktop in one menu (OP4) · Mapped, not built

</details>

<details>
<summary>0.56.x · 1 release · 0.56.0. to 0.56.0.</summary>

- **0.56.0.** — 2026-10-10 — James: "yes." — built: SD0 — a dropped versionium no longer loses the build · SD1 — versions and rewind on the repo's box · SD2 — copilot never says "ok" with nothing

</details>

<details>
<summary>0.55.x · 3 releases · 0.55.0. to 0.55.2.</summary>

- **0.55.2.** — 2026-10-10 — James: "loop simulations of every deep and drecursive test and debug method you can for idearium and the agents. fix the biggest most structural…" — built: How it was tested · What changed, bottom up · Not done here, said
- **0.55.1.** — 2026-10-10 — James: "plan panel, needs to not show all the phases. it is for the current plans only, basically the queue also for the build surface which has…" — built: The Plan is the queue (HP9) · The build surface is back in view (HP10) · A reply on the page is never sent again (HP11)
- **0.55.0.** — 2026-10-10 — James: "claude failed — timed out after 90000ms — waiting at gate 7/8 \" — built: Browser agents were cut off at 90 seconds (HP7) · The build surface shows again (HP6) · The ladder says why Ollama is missing (HP8)

</details>

<details>
<summary>0.54.x · 3 releases · 0.54.0. to 0.54.2.</summary>

- **0.54.2.** — 2026-10-09 — James: "Include any useful or important." — built: The shelf, combed · The roadmap
- **0.54.1.** — 2026-10-09 — James: "okay go ahead." — built: The path, phase by phase · Where the roadmap stands
- **0.54.0.** — 2026-10-09 — James: "okay" — built: The roadmap, decluttered · Old code, archived

</details>

<details>
<summary>0.53.x · 1 release · 0.53.0. to 0.53.0.</summary>

- **0.53.0.** — 2026-10-09 — James: "we also need to declutter the roadmap." — built: The roadmap reads finished work as finished · The roadmap triage, first pass · Checking what is done

</details>

<details>
<summary>0.52.x · 1 release · 0.52.0. to 0.52.0.</summary>

- **0.52.0.** — 2026-10-09 — James: "Do the hardening pass" — built: HP1: stale spreads along dependencies · HP2: interrupted runs are said · HP3: the ladder climbs only what is installed

</details>

<details>
<summary>0.51.x · 1 release · 0.51.0. to 0.51.0.</summary>

- **0.51.0.** — 2026-10-08 — James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected" — built: In the workshop: each section knows its phases · In the Phases tab · Found on the way, fixed

</details>

<details>
<summary>0.50.x · 1 release · 0.50.0. to 0.50.0.</summary>

- **0.50.0.** — 2026-10-08 — James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected" — built: Left: the specs · Middle: the phases in lanes by build order · Right: the phase

</details>

<details>
<summary>0.49.x · 1 release · 0.49.0. to 0.49.0.</summary>

- **0.49.0.** — 2026-10-08 — James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected" — built: RS3: the spec document, lib/spec-document.js · RS9: the thread, idearium/repo/thread.js and GET /api/repos/:uuid/thread · Not here

</details>

<details>
<summary>0.48.x · 1 release · 0.48.0. to 0.48.0.</summary>

- **0.48.0.** — agent settings in Settings → Agents; the agent in the Code tab — James: "no. all agent settings and options in the options tab under agents. the agents tab should maybe merge with the code tab." — built: Settings → Agents · No Agent tab

</details>

<details>
<summary>0.47.x · 1 release · 0.47.0. to 0.47.0.</summary>

- **0.47.0.** — Idearium, one surface — James: "thats supposed to be a idearium feature. also needs to look like the rest of it like the plan panel. also hooked into the code tab, same…" — built: One surface · The spec engine · Not done

</details>

<details>
<summary>0.46.x · 1 release · 0.46.0. to 0.46.0.</summary>

- **0.46.0.** — UI1: the screens, the tape with Ollama, agents with every command — James: "always add backend js first, then the ui. can you do that. make sure you build the ui. then make sure the ollama additions stay with…"

</details>

<details>
<summary>0.45.x · 1 release · 0.45.0. to 0.45.0.</summary>

- **0.45.0.** — CM3: this session's work as commands — James: "where is any of this? like i dont see any changes. like what have you been adding? also next make sure these are all commands first, api…"

</details>

<details>
<summary>0.44.x · 1 release · 0.44.0. to 0.44.0.</summary>

- **0.44.0.** — OR1–OR3: Ollama on tape — James: "can we use the rewind engine on ollama? like record ollamas process as a macro?" — built: Built: lib/ollama-tape.js · Not yet built

</details>

<details>
<summary>0.43.x · 1 release · 0.43.0. to 0.43.0.</summary>

- **0.43.0.** — PF5: bounded tables, nothing lost — James: "do it. tell me what that would do"

</details>

<details>
<summary>0.42.x · 1 release · 0.42.0. to 0.42.0.</summary>

- **0.42.0.** — PF4: hold only what you read — James: "yes. can we use the rewind engine on ollama? like record ollamas process as a macro?" — built: Built: guardian/jaa-store.js · Mapped: docs/2026-10-07-ollama-recorder-phasemap.spec

</details>

<details>
<summary>0.41.x · 1 release · 0.41.0. to 0.41.0.</summary>

- **0.41.0.** — PF3: the store appends, never rewrites — James: "yes, lets improve the intelligence system. maybe make the schemas for the diagnostic system for the expectionn for each system. ehat do…" — built: Found · Built: guardian/jaa-store.js · Mapped: docs/2026-10-07-system-expectations-phasemap.spec

</details>

<details>
<summary>0.40.x · 2 releases · 0.40.0. to 0.40.1.</summary>

- **0.40.1.** — PF1: the 5-minute cortex stall — James: "whats up with the optimization? it seems almost worst? also liminal space with the velocity, like use that also?"
- **0.40.0.** — VR1: every change a commit (the new numbering begins) — James: "and link the releases with versionium. needs to snapshot every accept, every change, diff, write, only the changes. like github., supposed…" — built: Numbering · Built

</details>

<details>
<summary>0.39.x · 167 releases · 0.39.144 (part 2) to 0.39.376.</summary>

- **0.39.376.** — CM2: every command, for copilot and every agent — James: "Yes. And copilot. Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can. Like look at nexus nerve and tv…" — built: Built · Mapped, not built
- **0.39.375.** — 2026-10-07 — James: "That was fantastic." — built: The full sweep after 0.39.364–0.39.374 · Two regressions of this session, fixed · Now passing again
- **0.39.374.** — 2026-10-07 — James: "That was fantastic. Everything needs to be available as commands." — built: CM1 — every capability a command · Not as commands yet
- **0.39.373.** — 2026-10-07 — James: "Wait what about brainos instead?" — built: BO1 — BrainOS reads the same log · The phasemap is built
- **0.39.372.** — 2026-10-07 — James: "Do you think we should have each repo a control panel for the system, and compartment for the nexus repos?" — built: NC2 — each Nexus repo is its system's compartment and control panel
- **0.39.371.** — 2026-10-07 — James: "I want to use snapshots, pause, rewind, etc. like full VMware style. Not actual VMware." — built: VM1 — the desktop, like VMware · CK1 — the log is the rewind · Not yet
- **0.39.370.** — 2026-10-07 — James: "hooks into the desktop envirement. also look at the idearium and cos phases." — built: DT1 — the repo's desktop is a source of its activity
- **0.39.369.** — 2026-10-07 — James: "I also want to have a full extensive activity log in each repo." — built: AL2 — the Activity log view
- **0.39.368.** — 2026-10-07 — James: "I also want to have a full extensive activity log in each repo." — built: AL1 — a repo's durable activity log · Found while building
- **0.39.367.** — 2026-10-07 — James: "okay begin building this, phase it, build it, one by one, focus on coding using overlapping primitives?. honestly. i want to be able to…" — built: Mapped first · CC1 — Claude Code lands like every agent · Brought up to date (docs/CLAUDE.md's rules)
- **0.39.366.** — 2026-10-07 — built: One door, so one record · Where it shows · Declared
- **0.39.365.** — 2026-10-07 — James: "can you make sure the claude provider is…" — built: What was wrong · Now · What this can't settle from here
- **0.39.364.** — 2026-10-07 — James: "what is that performance? and can we start using it with the resource monitor to optimize performance dynamically." — built: What his console showed · The monitor now drives what runs
- **0.39.363.** — 2026-10-07 — James: "im saying to add that to cos. the conditions. like the intent of compartment is the end state." — built: A compartment's intent · Nesting · Where it lives in COS
- **0.39.362.** — 2026-10-06 — James: "we could have each compartment in idearium support axioms, conditions, or end state. like for example, use the least amount of code with…" — built: Each compartment has a charter (CH1) · Agents use the work surface (WS1) · The work surface streams the writing (WS2)
- **0.39.361.** — 2026-10-06 — James: "tasks need time stamped. phases need chunked i feel like. at least for small ollama models." — built: Every task timestamped (SB50) · A phase built in chunks (SB51) · Proven on the code it proposed (SB52)
- **0.39.360.** — 2026-10-06 — James: "the daw is a test. fuck the daw. were building capacity to build the daw, not the daw" — built: Expanded from the spec (SB42) · Phased (SB43) · Chunked, then coded (SB44)
- **0.39.359.** — 2026-10-06 — James: "the daw repo had none of the right files." — built: SB30: the skeleton, a COS template with reusable components · SB28: genesis 1.4.0 is that skeleton · SB31: every new repo is the skeleton, and the idea slots in
- **0.39.358.** — 2026-10-06 — built: Why you didn't see it · Now · Versions
- **0.39.357.** — 2026-10-05 — James: "Should the workshop's start page become the RS5" — built: The picker (idearium/ui/js/template-picker.js) · What a template puts in the workshop · Templates you keep
- **0.39.356.** — 2026-10-05 — James: "you're building the capability, not the spec right? need to be able to build phases. i need to be able to add features, capabilites,…" — built: The capability, not the spec · The agent writing, live (LS1–LS4, in… · Needs a restart
- **0.39.355.** — 2026-10-05 — James: "okay. i clicked on a phase in the phases tab in nexus core to have it built. it needs to actually build it" — built: Why it didn't build · Now · Left for you to decide
- **0.39.354.** — 2026-10-05 — James: "okay spec workshop looks like shit. needs to be enterprise grade. feed the pipeline" — built: What was wrong (from your screenshot and the page) · The workshop now (ui/workshop.html, css/workshop.css, js/workshop.js) · Server side (kept small)
- **0.39.353.** — 2026-10-05 — James: "need a little pull tab on the very right for when i close the plan."
- **0.39.352.** — 2026-10-05 — James: "the plan needs to only show current work. needs escalating retry logic and fallback routing. like if the 3b fails, switch to the 7b, then…" — built: CT6: the escalation ladder · CT7: the Plan shows current work · CT8: the agent's activity, live, in the Code tab
- **0.39.351.** — 2026-10-05 — James: "i like it but, can we have this hooked into the plan and work surface panel"
- **0.39.350.** — 2026-10-05 — James: "make sure ollama is all wired into idearium."
- **0.39.349.** — 2026-10-05 — James: "the code tab the agent tab, work surface, like full activity, enterprise grade?"
- **0.39.348.** — 2026-10-05 — James: "and learn from it. failure modes, dynamically switch models, if its not equipped for the task"
- **0.39.347.** — 2026-10-05 — James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes, dynamically switch models, if its…"
- **0.39.346.** — 2026-10-05 — James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes, dynamically switch models, if its…"
- **0.39.345.** — 2026-10-05 — James: "should we have the lanes, be hooked into gaps, phases? like i want to be able to brainstorm. also the reach. like its meant to use genesis…"
- **0.39.344.** — 2026-10-05 — James: "okay its stuck."
- **0.39.343.** — 2026-10-05 — James: "the setup desktop envirement. the cos test env. the setup needs, select operating system. with the offocial downloads for each versions,.…"
- **0.39.342.** — 2026-10-05 — James: "remove the polling then. need the systems to anounce themselves. that way i can add new systems automatically. also optimizes performance."
- **0.39.341.** — 2026-10-05 — James: "cos needs to be a nested compartment" — built: COS is its own system · Atlases
- **0.39.340.** — 2026-10-05 — James: "when clicking on setup desktop, i want to have a popup with the progress. like show me what its doing. like when you run setup in the run…" — built: DK2: the desktop setup popup · Found and fixed · Mapped, needs your call
- **0.39.339.** — 2026-10-05 — James: "do it. we could use that for more than coding. coudl use it for debugging, dom in clearglass, or any data fed into a pipeline" — built: One agnostic context tool · The checklist builds the working set · Kept to what was asked
- **0.39.338.** — 2026-10-05 — James: "What if instead of just a tool, it's a compartment, like the work surface is in COS. Right? It would be like ask a question or or a intent…" — built: The questions first · Found while testing
- **0.39.337.** — 2026-10-05 — James: "what if it builds a temporary, index of context, copies the relevant context to it, one by one until it synthesize it into it into only…" — built: The problem · The working set · Measured
- **0.39.336.** — 2026-10-05 — James: "like its not working. the tool. the agents job is to find context. ollama, copilot, guardian agents need to be able to use the agent tools." — built: What his two screenshots showed, traced in the code · Fixed · Found, not touched
- **0.39.335.** — 2026-10-05 — James: "why are the agents still not using the context. fix it. actualy fix it. do not hand it back until you. wasting my fucking tokens" — built: What his log showed · Fixed at each cause · Also in this release
- **0.39.334.** — 2026-10-05 — James: "There is only 15 systems. Not 27. Any system that’s in idearium is a system, nothing more." — built: One list of systems (SY1) · Found
- **0.39.333.** — 2026-10-05 — James: "Im saying im the phasemaps in the nexus repo." — built: The phasemaps in the Nexus repo · RAID's phases are cortex's (HG8) · The law: Clear Glass, never Playwright (HG7)
- **0.39.332.** — 2026-10-05 — James: "make sure this is all mapped." — built: Every request has a phase · What wasn't mapped, now is · The maps read correctly in loom
- **0.39.331.** — 2026-10-05 — James: "Don’t just agree. Give input" — built: Clear Glass, not Playwright · Mapped, with input: docs/2026-10-05-cli-data-code-phasemap.spec · Questions for James
- **0.39.330.** — 2026-10-05 — James: "Clearglass can be used to verify, lifeline can ask other agents. Adversarial agents. Use the confidence score. Can reuse any component in…" — built: Mapped first · Built: the Settings tab, in categories (VP7) · The idearium atlas
- **0.39.329.** — 2026-10-05 — James: "Parse rhe axioms in the docs folder. Do not deviate They are law" — built: The agent that builds a file gets all of it · The axioms, applied to 0.39.308 · The loom registry
- **0.39.328.** — 2026-10-05 — James: "Should be more than that. Like using the traversal of chunks, primitives, like the relationship between words when generating code. The…" — built: What was found · What a build agent is told now · Fewer tokens, more seen
- **0.39.327.** — 2026-10-05 — James: "i though we switched to heartbeat and pulse system"
- **0.39.326.** — 2026-10-05 — James: "im not saying the atlas. im saying the graphs, chunking, the code tab, all of it, actually look at the context retrival."
- **0.39.325.** — 2026-10-05 — James: "agents always need context, not optional. also running the pipeline the agent should be able to do. like context isnt optional its vital"
- **0.39.324.** — 2026-10-05 — James: "can you benchmark it?"
- **0.39.323.** — 2026-10-05 — James: "still i want to make warp mine"
- **0.39.322.** — 2026-10-05 — James: "next"
- **0.39.321.** — 2026-10-05 — James: "next"
- **0.39.320.** — 2026-10-05 — James: "next."
- **0.39.319.** — 2026-10-05 — James: "okay now the spine. lets continue the phases for emerge."
- **0.39.318.** — 2026-10-05 — James: "maybe fork it, for me."
- **0.39.317.** — 2026-10-05 — James: "I was telling you about the skeleton. Not setting an axiom. Stop assuming and adding noise."
- **0.39.316.** — 2026-10-05 — James: "Like I want this to be a skeleton, only using the minimal code. Then expands from there. Using the .spec as a living model. Then an atlas…" — built: Mapped first · The architecture spec, 0.10.0 · Also
- **0.39.315.** — 2026-10-05 — James: "Maybe add, if applicant, data dir with the directory for the data, consumers, intent, data type/system like node, vector, database or…" — built: The registry, in the template · The template's own node schemas
- **0.39.314.** — 2026-10-05 — James: "dont add noise. only what we talked about. then show me." — built: The system template, from his description only
- **0.39.313.** — 2026-10-05 — James: "yes add it the spec for genesis. like genesis is the exact architecture for a new system template. like look at the directory. loom, like…" — built: Genesis is the template's architecture (genesis 1.3.0) · The three agree (SB17 done) · Mapped (build-from-the-spec 1.8.0)
- **0.39.312.** — 2026-10-05 — James: "why not identity context file_structure modules -> components summary, with routes and commands, anything else relevant. then everything…" — built: The system template, in his structure · Still to do in SB17
- **0.39.311.** — 2026-10-05 — James: "like with the genasis spec, needs to have the component registry event interaction contract, with the heartbeat and pulse system, node…" — built: Mapped first: the system template · Built before it was mapped: SB16, genesis 1.2.0 Domain 2d "nodes"
- **0.39.310.** — 2026-10-05 — James: "every system is supposed to be sovereign. the components registry is a an event driven interaction contract. nodes for data to persist or…" — built: Every atlas now carries its generated half · Fixed in the generator · Not in it yet
- **0.39.309.** — 2026-10-05 — James: "Using the register as a dependancy and file check list." — built: The registry drives the build (SB12) · Found while wiring it · Fixed
- **0.39.308.** — 2026-10-05 — James: "the agents hat should be created with the repo." — built: The hat comes with the repo · Was it additive?
- **0.39.307.** — 2026-10-05 — James: "integration (failed: every route hop failed (ollama: truncated → gemini: truncated → chatgpt: truncated) … TRUNCATED:too_short);…" — built: Why every provider's answer was "too short" · Why Guardian couldn't be clicked
- **0.39.306.** — 2026-10-05 — James: "I just need to get this all mapped. Like idearium is for my ideas. Promote into a spec with full options for each block and a custom…" — built: The whole pipeline, mapped · Found while mapping, fixed
- **0.39.305.** — 2026-10-05 — James: "here is an example of an idea i was trying to get built. like it needs to use the templates as default." — built: What the DAW spec showed · Templates are the default frame (SB1) · His words seed the spec (SB2)
- **0.39.304.** — 2026-10-02 — James: "get ollama solid. i need this done." — built: Every phase that names files can now be proven
- **0.39.303.** — 2026-10-02 — James: "It can build it. Piece by piece look at idearium." — built: A phase run now ends in a proof run (PH1) · Wired
- **0.39.302.** — 2026-10-02 — James: "Yes, then I can use idearium to build anything needed. I mean look at docs." — built: The delivery checker: does the work do what was promised? · Found while building · Wired
- **0.39.301.** — 2026-10-02 — James: "I just want it to write gigs for me. Not automate talking or posting. Just write the gigs for me." — built: Clear Glass writes your Fiverr gigs (3.23.0) · Wired
- **0.39.300.** — 2026-10-02 — James: "make sure its enterprise grade, beautiful. need increments of zoom. like each system is a node, which zooming in has the components as…" — built: Versionium (VX1) · The pipeline together (WS3) · Semantic zoom (AZ1)
- **0.39.299.** — 2026-10-02 — James: "no. look at architect in idearium. rebuild it, fully. enterprise grade, beautiful style and consistent, open ui." — built: The no, recorded · One canvas, stripped from MASTERMIND · The pipeline's Architect (Build › Architect, ui/architect.html)
- **0.39.298.** — 2026-10-02 — James: "build the spec workshop, with architect for archiecture using the component registry, components store with dependancies, you know, like…" — built: ARCHITECT, the third station · Sequencing, said · Surfaces
- **0.39.297.** — 2026-10-02 — James: "I hate that ui you made. The spacial void is its own page. all of it needs to be isolated, in its own pages. i was describing the pipeline…" — built: The spec workshop, rebuilt as its own page · One look, shared · Enterprise grade, as the Void
- **0.39.296.** — 2026-10-02 — James: "alright but no lowercase. and make sure its enterprise grade" — built: No lowercase · The enterprise pass · Measured
- **0.39.295.** — 2026-10-02 — James: "I hate that ui you made. The spacial void is its own page. all of it needs to be isolated, in its own pages. i was describing the pipeline…" — built: The Spatial Void, rebuilt · The spec workshop · Found while building
- **0.39.294.** — 2026-10-02 — James: "need the spec workshop, completely destroy the spec builder, and build the spec workshop, with architect for archiecture using the…" — built: The spec workshop · What is not done yet (said, not hidden)
- **0.39.293.** — 2026-10-02 — James: "i mean that i cant login to my desktop envirement in idearium with the default credientials, not sure if its a upstream problem" — built: What was wrong · What changed · What to do
- **0.39.292.** — 2026-10-02 — James: "how can i import into the pipeline. the specs also need to convert into actual spec files. also cant import into the pipeline, since you…" — built: A library document into the pipeline · Where · Mapped, in his words (master phasemap 1.8.0)
- **0.39.291.** — 2026-10-01 — James: "Conrinue it first. Make sure it's enterprise grade. Let's finish what idearium needs, then I'll record it" — built: Verify (lib/build-verify.js) · Repair · Prove: the loop
- **0.39.290.** — 2026-10-01 — James: "my goal is to build these, eventually. im, the idea guy" — built: The spec library · Faster spec import · Fixed
- **0.39.289.** — 2026-10-01 — James: "please get the agents building more stable. ollama has been known to cut off blocks, unless you fixed that." — built: Why Ollama cut off or came back empty — found in ollama/lib/ollama-client.js · A cut reply is finished, not thrown away — lib/reply-continuation.js · James's voice
- **0.39.288.** — 2026-10-01 — James: "running really bad … the settings in idearium. it takes forever to load the repos on boot." — built: Boot and the Nexus repo sync · Vitals · Mapped
- **0.39.287.** — 2026-10-01 — James: "smart fallback for ollama and guardian, learn which models are best for what chunks." — built: Learned routing
- **0.39.286.** — 2026-10-01 — James: "can we have full options for fallback logic, routing. what could improve stability with the pipeline? can we add the components registry…" — built: Routing and fallback (RG1–RG4) · The registry: the 11th block (RC1–RC2) · Genesis and the architecture spec (GN1, AR1)
- **0.39.285.** — 2026-10-01 — James: "its not opening. i just added a new idea and promoted to spec. it needs to show the plan when building." — built: Code builds no longer stall · The Plan shows the build · telemetry.jsonl: 8.6 GB → bounded
- **0.39.284.** — getting idearium to code a project — the plan always lands, the work surface, one look — and the archive drop box — James: "can you give copilot a command, or something. like i want to import my archives of nexus. have it pull up a drop box ui and run the command?" — built: What the log showed · idearium never blocks on git (W1) · The plan always lands (W2)
- **0.39.283.** — builds that account for what they didn't make, Ollama drafts reviewed by an agent, the Manage workbench, history from the release zips,… — James: "continue" — built: Nothing written empty or broken (N21, slice 2) · What a step did NOT produce is data (N22) · Ollama drafts, a guardian agent reviews (N23)
- **0.39.282.** — the suite green with every gap named, the test sandbox closed, step gates (nothing written empty), the desktop login, Ollama by default — James: "Get the suite green, or mark each failing test as a known gap with its reason." — built: The suite · Real bugs fixed · The test sandbox, closed
- **0.39.281.** — the provider economy — tiers and limits per provider, learned token limits, a learning router, staging by tier; ErosmancerOS in workflows… — James: "What if we have economy tags for each provider. With staging branches. Like id love an extensive configurable options for this. What about…" — built: Not built, on purpose · Provenance — the commits, in build order · New
- **0.39.280.** — the build surface — plan a spec bottom-up, build it phase by phase, manage single files, see the plan; honest windows, providers and… — James: "can you have the electron popup windows for the desktop envirement and settings, be in a borderless windowed … like i want each spec to…" — built: Provenance — the commits, in build order · Bugs found and fixed (root causes, read not guessed) · New
- **0.39.279.** — agents in Clear Glass, Gemini and DeepSeek whole, "hey nexus" from any chat, branches and desktops, a settings console, staging S0 + S1 — James: "can you fix gemini and deepseek. i want the agents to be able to use clearglass. i also want to be able to have copilot interact on…" — built: Gemini and DeepSeek read the whole conversation · "hey nexus" is answered from any chat, as a job · Context by tools; only necessities injected
- **0.39.278.** — tools as layers, a co-pilot pane that remembers, every chat streamed live into the download manager — James: "can you move and wire these in correctly? you ran out of tokens. working on getting copilot and clearglass solid. maybe use the download…" — built: Tools as layers · The co-pilot pane remembers · Every chat, streamed live into the download manager (no polling)
- **0.39.277.** — staging C0 + C1 in the full tree; the graph/build map revised for sovereignty — James: "just know every system should be sovereign self contained." — built: Merged: staging-self-heal C0 and C1 · Revised: docs/2026-09-28-graph-build-context-settings-memory-phasemap.spec →… · Fixed in passing
- **0.39.276.** — the Code button's repo wears the original repo's hat — James: "the code tab needs to use the same hat from the original repo. when you click code in the original spec, it creates a new repo, i need…" — built: What was wrong · What changed · Not done
- **0.39.275.** — the dependency graph reads what the specs say — built: What changed · Records · Noted, not changed
- **0.39.274.** — the Clear Glass co-pilot pane uses Ollama or Guardian, never an API — James: "go to google.com" — built: What was wrong · What changed (clear-glass/src/copilot/bridge.js) · Registry and specs
- **0.39.273.** — Idearium, solid for building codebases — James: "I want idearium solid for building codebases. Fully built, enterprise grade. Agent tools completely solid, all context is easy to search…" — built: What was wrong (measured on 0.39.272, before any change) · Chunks (lib/code-intel/, chunker 2.0.0) · A card for every chunk (indexes/cards.json)
- **0.39.272.** — copilot can do everything Clear Glass can, and learns from it — James: "i want copilot completely aware of clearglass, hooked in completely. all of it … automate job applications, fiverr … idearium agents…" — built: Clear Glass, whole, for copilot · Copilot learns (lib/cg-learning.js, clearglass.learned.tool) · Jobs, Fiverr, Upwork (lib/opportunity, cli/opportunity.js, copilot…
- **0.39.271.** — one Idearium, a real phases manager, the living spec, COS debugging, every system as nodes — James: "can you fix this? also get versionium working. its like there are two ideariums or something … i want the roadmap and phases combined into…" — built: The port 9000 "route not found: GET /idearium/" · Versionium · One Idearium
- **0.39.270.** — the Idearium atlas, written from the code — James: "tell me about idearium. agent tabs. expand the atlas if you can. it needs to be solid" — built: What was wrong · What changed
- **0.39.269.** — agents remember, and the memory is the Clear Glass download manager — James: "ollama is supposed to have persistent memory, same with the agents using the models. like theyre supposed to use the memory systems,…" — built: Map · lib/agent-memory.js: one write path, one read path, both over the download… · Wired
- **0.39.268.** — Guardian keeps the code, builds stop timing out on the 7b, no Eravos in New Spec — James: "music maker" — built: Guardian read code replies without their fences (guardian/userscript-*.js,… · ChatGPT's A/B chooser held jobs (guardian/userscript-chatgpt.js) · Retries told the agent the wrong thing (lib/seam/queue.js)
- **0.39.267.** — Ollama explained, copilot says what it's been up to, one hat on any backend — James: "i have no idea what ollama is doing." — built: Map · Ollama: the self-test (copilot/adversarial.js) · Intuition was crashing (copilot/intuition.js)
- **0.39.266.** — nexus back in Idearium, agents build it through the registry harness, deletes stick — James: "nexus should be in idearium but isn't. really close to being able to use idearium to build nexus from inside nexus using you as the agent." — built: Map · Failure 1: Delete archived an immutable repo, and the sync never undid it · Failure 2: on first boot the library stayed empty until a reload
- **0.39.264.** — the Nexus atlas written out, a test VM for any repo, ErosmancerOS runs with Clear Glass — James: "merge. to 264. keep the git, loom relies on it. the nexus atlas in the nexus repo. expand it completely, don't make it just a list. then…" — built: The merge, with the git · The Nexus atlas, written out · Create and Build live inside a repo
- **0.39.263.** — Nexus is one repo, its Home is the Nexus atlas, and Clear Glass replaces Playwright — James: "playright? no what is that for? litterally have clearglas... also nexus is the repo, not 15, just nexus, then clicking inside of it, shows…" — built: Nexus is one repo · Playwright is gone: Clear Glass drives the pages · Versionium holds every repo's history; loom no longer reads .git
- **0.39.262.** — Idearium Compartment + recursive tabs; Clear Glass on JAA, copilot hat CLI, macros, WebExtensions, site settings — James: "in idearium can you make the tabs much more recursive, deep and expanded fully? interconnected. i want ideas once promoted to move to the…" — built: Fixed: unhandledrejection GUEST_VIEW_MANAGER_CALL … ERR_CONNECTION_REFUSED… · Idearium: the Compartment · Clear Glass: JAA, no JSON files
- **0.39.261.** — Nexus as immutable repos inside Nexus, the COS run menu, working agent tools, and 116 fewer packages — James: "i want a nexus repo in idearium, that immutable with nested compartments per system so i can manage nexus from inside nexus. phases split…" — built: Built: Nexus, managed from inside Nexus · Built: the COS run menu, in JS · Fixed: the agent's tool call "did nothing"
- **0.39.260.** — dangling hooks cut from 545 to real ones, large imports no longer stall idearium, "online" means idearium — James: "can we fix some of these dangling hooks" — built: Fixed: idearium stalled after the 1364-file MASTERMIND import · Fixed: 545 dangling-hook GAP lines per boot · Fixed: the Idearium UI said "connected" when idearium was down
- **0.39.259.** — turns 2 and 3 of a conversation now complete, and each agent keeps its chat — James: "not great at jobs that persist. only works once. like conversations need back and forth, also persistent chaturl" — built: Fixed: turn 3 was never sent (the tab's slot was never released) · Fixed: turn 2 completed empty · Fixed: the first job of a new chat lost its reply watch
- **0.39.258.** — the second job completes; the agent is sent only what you can edit — James: "progress. didn't work a second time. the paste, shouldn't be injecting. only injecting the persona and the .inject nodes set in the agent…" — built: Fixed — the second job waited forever · Changed — the prompt is only what Settings → Agents shows · Changed — the two gaps left in the first cut, closed
- **0.39.257.** — the repo agent gets every tool; plain-language CLI; the graph in context — James: "the toolscope for the agents tab. need the full capabilities, with the /help and tool awareness … debugging, using the intelligence system…" — built: Changed · Not done
- **0.39.256.** — replies stream live; every failure names its gate — James: "supposed to stream it live as it happens. do you think a delay between gates wouold help? like even just 500 ms?" — built: Answered first: a delay between gates · Changed · Not done / known
- **0.39.255.** — the Agent tab gets its reply from the transcript, and repo jobs wear their repo hat — James: "it worked. though the hat should be repo specific not builder. the agent tab, in idearium is looking for the hash" — built: What the live run showed (log + screenshots) · Changed · Not done / known
- **0.39.254.** — the download manager logs every agent chat, one versioned record per chat — James: "we were working on getting the download manager logging agent chats." — built: Mapped · Built · Records
- **0.39.253.** — Idearium's agent backend is a three-way switch; Ollama's models are a dropdown — James: "i want the cli in idearium to be like the 3 way cli in the floating menu cli in the tv ui. that way it doesn't use check box. also have…" — built: Mapped · Changed · Not done
- **0.39.252.** — an agent's "hey nexus" is answered once, as a job — James: "it sends the response the wrong location … 'NEXUS CO-PILOT: I'm here and ready to assist you. How can I help you today?' is supposed to be…" — built: What the screenshot and log showed · Mapped: three answerers for one agent wake · Changed
- **0.39.251.** — the element picker assigns provider selectors — built: Mapped first · Built · Fixed on the way
- **0.39.250.** — records and handoff — James: "give me a handoff with a detailed map for the rest. also make sure you are updating the atlas and .spec when changes are made, and…"
- **0.39.249.** — one selector map, and the userscripts read it — James: "i want to have the element picker, aware of the cleardriver and userscripts, usermesh. … could copilot potentially be tasked to fixing it…" — built: Mapped first · Built (step 1 of the plan) · Not done — next, in this order
- **0.39.248.** — the boot vitals check passes — built: 1. dispatcher-stale-socket ("delivered to zero clients") · 2. copilot-provider-toggle T-018 ("provider toggle") · Result
- **0.39.247.** — agents reply: one tab, one job at a time, every reply back — James: "repo-agent jobs must use ONE ChatGPT tab" — built: The root cause: listeners that never heard anything · One tab · Pool fixes (each invisible at cap 3, fatal at cap 1)
- **0.39.246.** — responses reach the downloads manager; all three graphs hooked into repo import — James: "we need the responses to save to the downloads manager. also can you make sure the 3 graphs are hooked in?" — built: 1. Responses → Clear Glass downloads manager · 2. The three graphs (2026-09-19 graph-field design: code · execution · spec) · Not built
- **0.39.245.** — spec-engine phase 1: file list → wiring, no LLM — James: "generate a manifest and component registry from the file list. that's why it's vital to generate components and file list first.…" — built: What it does · Commands · genesis.spec, checked by its own rules
- **0.39.244.** — repo jobs reach their own tab; the Agent tab shows the provider tab live — built: 1. Why "hello" failed instantly · 2. The live feed · What you'll see
- **0.39.243.** — the cookie vault runs on JAA; better-sqlite3 is gone — James: "yes jaa" — built: Before · Now · Left as is
- **0.39.242.** — the Responses index runs on JAA — built: Before · Now · Not changed
- **0.39.241.** — late replies reach the Agent tab; the Library is a Clear Glass window (Ctrl+J) — James: "idearium Agent tab picking up a late reply from the Responses index, so it stops showing 'thinking…' when a reply arrives after copilot's…" — built: 1. Late replies reach the Agent tab · 2. The Library is a Clear Glass window, styled as Settings · Fixed on the way
- **0.39.240.** — the Library is in Clear Glass's ☰ menu — James: "also needs to be clearglass library. like added to the 3 lines menu"
- **0.39.239.** — the download manager files every response under its agent, and shows it — James: "the download manager in clearglass needs a ui so i can actually see this visually" — built: What already existed (mapped first) · Built · Fixed on the way
- **0.39.238.** — a reply watcher can no longer go silent — built: What the log showed · Cause · Fix
- **0.39.237.** — one tab per repo job; no stray ChatGPT windows — built: What the log showed · Four causes, all fixed · Replay retired
- **0.39.236.** — tests stop generating in Idearium — built: Why they kept coming back · The fix: a test process cannot write real data · Cleanup of what already leaked: cli/clear-idearium.js 0.2.0
- **0.39.228.** — the home UI in one JS + one CSS file per area; stored-mode boot crash fixed — James: "The ui is the index.html file." — built: Mapped first · The split · Bug found and fixed
- **0.39.227.** — Clear Glass takes in guardian's claimed jobs; Settings split one file (JS + CSS) per area — James: "Do it. 1 then 2." — built: 1. Job intake — decided: push-with-claim (not a directory watch) · 2. Settings: one JS + one CSS file per area · Records
- **0.39.223.** — Clear Glass owns accounts; login portals; sealed vaults; Settings rebuilt — James: "login portals like apppassword login to each provider, with a plus to add multiple, which hook into the cookie vault, and create a…" — built: Decided · Built · Fixed (found while wiring)
- **0.39.194.** — the compartment agent is handed the code it needs — built: What changed · Guarantees, tested · Verification
- **0.39.193.** — runtime proof per chunk — James: "Covered by a test" — built: Verification · Limits, stated · Next
- **0.39.192.** — the compartment agent reads its chunk nodes; its commands say where they come from — built: Chunk query — idearium.repo_chunks.tool · Commands · Verification
- **0.39.191.** — the compartment agent is an .agent node — built: Not done
- **0.39.190.** — RAID's .agent is now .health — built: Verification · Not done
- **0.39.188.** — per-compartment repo agent in idearium — built: What shipped · The bug this session found · Honest limits — in the code, not only here
- **0.39.182.** — idearium's spec builds become real cos compartments — built: What "idearium uses cos" actually means (confirmed with James directly)
- **0.39.181.** — MCO7f: P1 (fix the declared living maps) + P2 (per-system interaction contracts) — built: P1 — docs/nexus.spec fixed · P2 — per-system interaction contracts · Still open
- **0.39.179.** — MCO-E: the roadmap UI — built: What it is · Found and fixed in loom · Also
- **0.39.178.** — overhaul phasemap audit — built: MCO-F's gate, now proven · Observed, not fixed · Still open elsewhere
- **0.39.177.** — MCO-C: the baseline hook, and restore for imported repos — built: The hook · Proven over real HTTP with a real .zip · Found and fixed
- **0.39.176.** — MCO-B: per-file versioning under repo snapshots, and restore — built: What a snapshot now keeps · Restore · Proven over real HTTP (booted versionium + idearium, real RepoLayer)
- **0.39.175.** — Versionium repo subtab (MCO3 UI) — built: Found by the test · Verification
- **0.39.174.** — MCO3 repo snapshots (§33), plus two bugs found wiring them — built: MCO3 — done · Bugs found and fixed · Housekeeping
- **0.39.173.** — v0.39.173 — James: "make pulse emission an event, use negative space for when an event is missed a number of times." — built: Intelligence — "2 rows loading" root-caused correctly this time · Guardian — job stuck for up to 15 minutes after its target tab died, fixed · Orchestrator — pulse absence is now a real, negative-space event
- **0.39.172.** — v0.39.172 — built: Eravos — v3-17 catalog swap + organism → mod rename · Ledger — per-system ownership (root cause found, not just piled-up) · Intelligence — "2 rows loading" traced, not yet fixed
- **0.39.170.** — version bump + commit message for 165–169 — built: Phasemap correction
- **0.39.169.** — key management in compartment options — built: Correction first · Two kinds of thing, deliberately different · Value exposure — one door, and it isn't HTTP
- **0.39.168.** — the repo hat (project agent per compartment) — built: New: lib/repo-hat.js · Added to lib/hat-forge.js: update() · Three bugs found by testing
- **0.39.167.** — CI/CD per compartment, as commands — built: New: cos/ci/index.js · Surface · Bug found by testing
- **0.39.166.** — import re-sequencing, test-repo cleanup — James: "import → unzip → take you to the repo → chunk → toast showing the progress." — built: Done · Answers to the three questions asked · NOT done this pass
- **0.39.165.** — Idearium UI restructure + repo intelligence scan — built: Landed and verified · Bugs found by testing (each was real, each is fixed) · NOT done — no backend exists for these
- **0.39.144.** — merge of 0.39.143 / 0.39.142-fixed / nexus-wired-1 — built: Base · Folded back in from nexus-wired-1.zip · Real regressions found and fixed, not just re-added
- **0.39.144 (part 2)** — 0.39.144 (cont'd) — DOM-based chat sync + artifact/chat index — James: "why indexdb? why can't we manipulate the entire dom, what if we had a cli for each agent, then we use that as a way to synchronize the…" — built: New: DOM-based chat synchronization · New: ClearGlass downloads manager as a COS compartment · Found while testing, not assumed: this tree's own cos/ fixes are

</details>

<!-- generated:readme:end -->

## Version History

**Source:** this document, and Versionium's commit of it on every `nexus` sync.

| release | what changed here |
|---|---|
| — | first NEXUS-level atlas: an index of 13 systems, hooked into Idearium's per-repo atlas shape; the pre-0.39.264 text is kept in docs/atlases/_archive/ (outside the snapshot, in git) |
| 0.39.263 | this document became the `nexus` repo's Home in Idearium; every reference in it resolves and opens |
| 0.39.264 | written out in full: every system and every top-level directory, how work moves through NEXUS, the governing law, cross-cutting concerns, known drift; atlases added for `orchestrator`, `architect`, eravos (deleted 0.60.83) and `core` so every system opens into a nested atlas; routes and data folders link to the code that owns them; a contents list; every reference checked against the real tree by `tests/modules/test-nexus-atlas-refs.test.js` |
| 0.60.83 | ERAVOS deleted (James: "can you remove eravos?" · "Delete it outright."): its row, its directory line, its section, its canvas and its drift note left this atlas; docs/2026-10-16-eravos-removal-phasemap.spec holds what it was |
| 0.60.153 | James: "can you update and expand the read me. expand anything thats a list. all the phases. have a full section of for each of the 15 systems, each module and all the files. the data structure. all the idearium work. use all the changelogs to expand it." Each system's section now carries its modules and every file, and the generated half below the narrative carries every phase, the data structure, all of Idearium's routes and commands, and every release note in his words (lib/readme-generate.js, run by scripts/generate-atlases.js). The facts that had gone stale were corrected: fifteen systems, not sixteen; the healer inside diagnostic; the counts of lib, tests and docs; products/ placed |

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.

## Importing history from release zips (v0.39.282)

James: *"I have 700 nexus zips. Some with .git a lot without. I want to import the full (mostly) history from them."* Run `cli/import-history.js` inside the NEXUS checkout, with the folder of zips as its argument; it prints its own help with no arguments. Every zip becomes one snapshot commit on the branch history/snapshots, dated to the newest file in the zip and ordered by version. node_modules, data/ and nested .git folders are left out. A release zipped twice is recorded as a duplicate and gets no commit. A zip that carries a .git also has its real commits fetched under refs/import/. Each commit's trailers say which zip it came from (name, sha256, date, version). A report is written to .git/nexus-history-import/, and running the import again skips every zip that is already on the branch. Your own branch is never touched. The script prints the one command that joins the imported history under your branch and keeps your files exactly as they are. `lib/zip.js` now reads and writes entry dates. Test: `tests/modules/test-import-history.test.js`.

### The drop box (v0.39.283, N30)

James: *"give copilot a command … i want to import my archives of nexus. have it pull up a drop box ui and run the command"*. Type /import-archives (or just "import my archives") in Idearium's Agent CLI, or the same words in the Clear Glass co-pilot pane. It opens `idearium/ui/archive-import.html`. Drop zips or a whole folder, or paste a folder path. **Check the order** is a dry run that writes nothing; **Import** runs `cli/import-history.js` as a background child process (`lib/history-import-job.js`), so idearium never blocks on 700 zips. The page shows a row per zip as it lands, the counts, the report path and the one merge command. API: GET|POST /api/history/import, PUT /api/history/import/upload?name= (a browser without disk paths streams each zip to the data root's history-import/inbox). Tests: `tests/modules/test-history-import-job.test.js`, `tests/probe/archive-import-chromium.js`.
