# NEXUS — Sovereign Multi-System Kernel

> **status: full map (0.39.264)** · 14 systems (13 kernels + core), every top-level directory placed, every system with an atlas of its own · each system is a module of NEXUS, and each module is its own modular system with components: the same shape, one zoom level further out.

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

The top zoom level is this repo. One level in are fourteen systems. Thirteen are kernels: each is a process with its own port, its own entry file, its own data folder and its own spec, started by [autopilot](nexus/autopilot.js) in dependency order. The fourteenth, `core`, is everything no kernel owns: the shared libraries in `lib/`, the event fabric (`warp/`, `siso/`, `nexus/nexus-bus.js`), the Compartment OS in `cos/`, the command line in `cli/`, the tests, the docs, and the UI shells. Who owns which file is decided in exactly one place, `lib/nexus-self/systems.js`, and everything that splits NEXUS into systems (the snapshot, the per-system repos in Idearium, the apply gate) goes through its ownerOf().

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
| 3 | `eravos` | :3751 | `eravos/server.js` | the organism canvas and its kernel |
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
  eravos/                eravos — organism canvas kernel :3751
  intelligence/          intelligence — CFR, sigma, RFR2, causal :3753
  ollama/                ollama-bridge — local models :3749
  versionium/            versionium — causal version control :3754
  copilot/               copilot — intent, context, tool loop :3750
  loom/                  loom — component/hook/wire registry :3752
  clear-glass/           clear-glass — the sovereign browser :7704
  lib/                   core — shared libraries (375 files)
  cos/                   core — Compartment OS: compartments, branches, runtimes, test VM
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
  erosmancer/            core — ErosmancerOS, CDP browser automation
  cockpit/               core — the forge IDE spec and its core
  nexus-healer/          core — healer proposals, scaffolded system
  architecture-spec/     core — the scaffold every new system is built on
  service/               core — ICO kernel service wrappers
  sentinel/              core — the sentinel's interaction contract
  scripts/               core — verification and release scripts
  skills/                core — session skills (changelog, persona)
  tablet/                core — tablet homepage and 3D map
  ui/                    core — UI shells: home, tv-shell, brainos, eravos canvas
  docs/                  core — axioms, specs, phasemaps, handoffs, atlases
  tests/                 core — every suite and its runners
```

Each directory is described in its own section: the thirteen kernels under **The modules**, and every `core` directory under **core, directory by directory**.

---

## How work moves through NEXUS

The systems are easiest to understand by following the four things NEXUS does all day.

### How a prompt is answered

A prompt starts in a UI: the home shell in `ui/home/index.html`, the TV shell, Idearium's Agent tab in `idearium/ui/js/app.js`, or the command line in `cli/nexus-cli.js`. It reaches `copilot` over HTTP. Copilot decides what the prompt is (its intent router in `copilot/lib/grammar-router.js`), assembles context from memory and from the repo it concerns (`lib/repo-context.js`, `copilot/lib/copilot-context.js`), and chooses a backend: a local model through `ollama-bridge`, or a provider tab through `guardian`. When tools are allowed, copilot runs the tool loop in `copilot/tool-runtime.js` against the registered tools in `lib/agent-tools/`.

Guardian turns the request into a job (`guardian/lib/jobs.js`) and hands it to its dispatcher (`guardian/lib/dispatcher.js`), which finds or opens the tab the job belongs to through the dispatch pool (`guardian/lib/dispatch-pool.js`). The tab lives in `clear-glass`, the Electron browser, and a provider userscript such as `guardian/userscript-chatgpt.js` types the prompt, watches the reply, streams it back in chunks, and pushes the settled transcript. Guardian's gate trail (`guardian/lib/gate-trail.js`) records every step a job passes, so a failure names the gate it stopped at. The reply is written through the response sink (`guardian/lib/response-sink.js`), versioned as a transcript (`guardian/lib/chat-transcripts.js`), and remembered by `cortex`.

### How a repo is built and changed

An idea becomes a spec in `idearium`, and a spec becomes a repo with its own compartment in `cos/`. The import pipeline in `idearium/repo/import-pipeline.js` parses a repo's files, writes the per-repo atlas, chunks and verifies it, and builds the code graph (`idearium/repo/graph.js`) and spec graph (`idearium/repo/spec-graph.js`). NEXUS is itself one of these repos: `idearium/repo/nexus-self.js` snapshots the live tree into content-addressed blobs (`lib/nexus-self/store.js`), splits it into one repo per system, and lets an edit happen only on a COS branch (`lib/nexus-self/branch.js`) that is run and tested before the apply gate (`lib/nexus-self/apply.js`) lets it back into the live files.

Running happens through the COS run menu in `lib/cos-run.js`: run the entry, boot it and probe its health, run the tests, check syntax, resolve dependencies. The strongest option is a real virtual machine (`cos/testenv/index.js`): an ephemeral Linux guest on a throwaway overlay of a base image, the repo handed in as a read-only tar disk (`cos/testenv/tar.js`), dependencies installed online, the network then cut over QMP and the cut proven from inside the guest before any test runs. `cos/testenv/detect.js` decides what "test this repo" means for any repo, and `cos/testenv/provision.js` makes the base image; on Windows, `cos/testenv/setup-vm.bat` does the whole setup.

### How NEXUS heals

`diagnostic` reads every system's ledger on a timer and computes sigma, friction and drift per system (`diagnostic/nexus-diagnostic.js`). A deviation becomes a gap. The heal loop (`diagnostic/nexus-heal-loop.js`) classifies the gap, has `architect` propose a blueprint for the fix, sends the patch work to `guardian`, snapshots before and after in `versionium`, and either closes the gap or escalates it. Loom's wiring checks feed the same path: `diagnostic/wire-integrity.js` decides which dangling hooks are real gaps and which are simply files nothing requires.

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

### cortex

The memory core, and since the 2026-07-24 storage decision the data root the other systems write into, which is why it boots first. `cortex/boot.js` brings up six organs in a fixed sequence (gap finder, healer, self-heal, orion, RAID, heartbeat), and the organs never call each other: they subscribe to and emit events. Memory lives in `cortex/memory/`: the JAA table layer in `cortex/memory/jaa-db.js`, relevance and decay in `cortex/memory/relevance.js` and `cortex/memory/decay.js`, tiers in `cortex/memory/tiers.js`, and compaction and deduplication in `cortex/memory/table-compactor.js` and `cortex/memory/table-deduplicator.js`.

RAID, the routing authority every request passes through (§5.2, §9.1), lives in `cortex/core/raid/`: it writes the ledger entry before anything is dispatched, and it is where contracts are taken in and officiated (`cortex/core/raid/contract-intake.js`, `cortex/core/raid/contract-boundary.js`). Cortex's configuration is `cortex/config.js`, its personas `cortex/personas.js`, its schemas `cortex/schemas/`, and its spec `cortex/spec/cortex.spec`. The next zoom level is `cortex-atlas.md`.

### guardian

The AI engine and NEXUS's only point of contact with AI providers: no API keys, no external inference calls, browser tabs only. `guardian/server.js` on :7820 receives jobs, and `guardian/lib/` is where they are handled: `guardian/lib/jobs.js` and `guardian/lib/dispatcher.js` for the job lifecycle, `guardian/lib/dispatch-pool.js` and `guardian/lib/dispatch-ladder.js` for choosing a tab, `guardian/lib/ncp.js` and `guardian/lib/ncp-handler.js` for the NCP protocol the userscripts speak, `guardian/lib/agent-registry.js` and `guardian/lib/selector-map.js` for each provider's page selectors, `guardian/lib/wake-loop.js` for an agent's "hey nexus" to NEXUS, and `guardian/lib/node-registry.js` for its JAA-backed node types, the watcher pattern `architecture-spec` generalizes.

The provider side is the userscripts: `guardian/userscript-chatgpt.js`, `guardian/userscript-claude.js`, `guardian/userscript-gemini.js`, `guardian/userscript-perplexity.js` and `guardian/userscript-deepseek.js`, declared in `guardian/userscripts.yaml`. Its commands live in `guardian/commands/`, its routes in `guardian/routes/`, and its spec in `guardian/spec/guardian.spec`. The next zoom level is `guardian-atlas.md`.

### idearium

Where work begins and where this page lives. `idearium/api/index.js` on :4800 serves ideas, brainstorms, specs, repos and their compartments, and `idearium/ui/` is the whole Idearium interface: Welcome and Repos, where each repo opens into 12 tabs: Home, Idea, Files, Architect, Spec (the living spec), Phases (every phasemap as one manager), Intelligence, Agent, Debug, Versionium, Sync & CI and Settings, then Create (Brainstorm, Ideas) and Build (the Eravos organism canvas, the Architect block canvas, the Spec Builder), which belong to the open repo. The Agent tab is the repo's own agent, a hat forged for that one project that answers on Ollama, through copilot or through a browser agent, remembers its work in the Clear Glass download manager, and proposes its code as injects. `idearium/ui/js/app.js` is the interface, `idearium/ui/js/nexus-atlas.js` renders this atlas, `idearium/ui/js/compartment.js` draws compartments, and `idearium/ui/js/agent-blocks.js` edits exactly what an agent is sent.

The spec engine in `idearium/spec-engine/` turns an idea into a spec by chunking it into blocks (`idearium/spec-engine/blocks.yaml`), dispatching each chunk to guardian (`idearium/spec-engine/chunk-dispatch.js`), and planning a file tree first when asked. The repo layer in `idearium/repo/` imports, snapshots, watches and graphs repos; `idearium/repo/nexus-self.js` is what makes NEXUS one of them. Its spec is `idearium/spec/idearium.spec`, with the roadmap and graph specs beside it. The next zoom level is `idearium-atlas.md`.

### architect

The design surface for hooks and blueprints. `architect/service.js` on :3747 boots in a fixed order (JAA, then the hook registry, then blueprints, SNR and translation, then HTTP, then registration with the orchestrator), and serves the hook registry: named, typed, wireable contracts between systems. A blueprint is a path scanned into a map of gaps and components. `architect/compile-route.js` bridges the block canvas to the spec compiler, turning canvas JSON into a compiled spec and, on request, into an Idearium spec. The canvases themselves are `architect/src/ui/arch-builder.html`, `architect/src/ui/spec-builder.html` and `architect/src/ui/alk-lattice.html`.

Its node schemas live in `architect/schemas/`, and its spec `architect/spec/architect.spec` records a three-way version drift honestly instead of hiding it. The next zoom level is `architect-atlas.md`.

### diagnostic

The system that watches the others. `diagnostic/nexus-diagnostic.js` on :7825 reads every system's ledger on a timer, computes sigma, friction and drift, detects gaps (baseline deviations, missing heartbeats, stuck queues), and serves them live. `diagnostic/nexus-heal-loop.js` is the closed loop from a detected gap to a resolved one, and `diagnostic/wire-integrity.js` classifies loom's dangling hooks so the boot log reports real gaps instead of hundreds of unwired root files. Diagnostic has no spec of its own yet, and its atlas says so. The next zoom level is `diagnostic-atlas.md`.

### eravos

The organism canvas, and a sovereign system rather than a UI folder. `eravos/server.js` on :3751 hosts a kernel, a runtime, a mod registry, a wire system, an audio engine, a catalog, a pack loader and a bridge to NEXUS; RAID routes compose, visualize and sequence intents here, and guardian delivers built mods here. The canvas runs in the browser from `eravos/ui/`: the kernel in `eravos/ui/kernel/kernel.js`, the runtime in `eravos/ui/runtime/`, the catalog in `eravos/ui/catalog/catalog-ui.js`, and each mod in `eravos/ui/mods/`. Its law is `eravos/ui/specs/ERAVOS.kernel.spec`: nothing exists until it is registered, and every connection between mods is a wire owned by the wire registry.

The canvas Idearium embeds is served from a second copy, `ui/eravos/`, which calls its mods organisms (`ui/eravos/catalog/catalog-ui.js`). The two copies have drifted apart and are two contracts until someone reconciles them; the drift is named under **Known drift** below. The catalog's New button in both copies now starts a new organism in Idearium, as an idea or a spec. The next zoom level is `eravos-atlas.md`.

### intelligence

The cognition layer, consolidated from three places that had no single home. `intelligence/server.js` on :3753 serves it, and `intelligence/index.js` gathers it. CFR, the causal friction record with its field, graph, delta, sigma and ledger, is `intelligence/cfr/`; RFR2, the relational field kernel, is `intelligence/rfr2/`; the causal layer is `intelligence/causal/`; the mastermind that combines them is `intelligence/mastermind.js`; and the baseline every deviation is measured against is `intelligence/baseline.js`. Its spec, `intelligence/spec/intelligence.spec`, was written as the map-first step before any file moved. The next zoom level is `intelligence-atlas.md`.

### ollama-bridge

Local model dispatch, deliberately isolated from guardian: if guardian goes down, local models keep answering, and a slow model never blocks guardian. `ollama/server.js` on :3749 is a sovereign HTTP wrapper around Ollama; `ollama/lib/ollama-client.js` talks to the Ollama daemon, `ollama/lib/dispatch.js` runs requests, and `ollama/ollama-runtime.js` manages the runtime. RAID routes to it by name. Its folder is `ollama/` while its system name is `ollama-bridge`, a mismatch its spec (`ollama/spec/ollama.spec`) records after it once made a spec-coverage check report the spec missing. The next zoom level is `ollama-atlas.md`.

### versionium

Causal version control: temporal replay, calendar playback, sigma-gated commits. `versionium/server.js` on :3754 became a sovereign system on 2026-09-02, out of a library that lived inside cortex. `versionium/lib/engine.js` is the engine, `versionium/lib/store.js` and `versionium/lib/snapshot.js` the storage, `versionium/lib/causality.js` the causal links between commits, and `versionium/lib/files.js` the per-file versions that loom's phasemap scanner reads instead of git. Its routes are `versionium/routes/versionium.js`, `versionium/routes/files.js` and `versionium/routes/system.js`, and every sync of the `nexus` repo commits there. The next zoom level is `versionium-atlas.md`.

### copilot

Intelligence as opposed to dispatch: copilot receives intent, assembles context, routes through RAID, and answers, and if guardian is down it can still answer from memory. `copilot/server.js` on :3750 serves it. `copilot/lifeline.js` decides which backend answers a prompt, `copilot/tool-runtime.js` runs the tool loop, `copilot/lib/self-model.js` and `copilot/lib/nexus-awareness.js` are what copilot knows about NEXUS, `copilot/lib/capabilities.js` is what it can do, and `copilot/diagnostics.js`, `copilot/movement-map.js` and `copilot/optimizer.js` measure and improve the whole system. Its spec is `copilot/spec/copilot.spec`. The next zoom level is `copilot-atlas.md`.

### loom

The registry authority. `loom/server.js` on :3752 serves the registry of components, hooks and wires that every other system declares into, and `loom/schema/` defines those records (`loom/schema/component.js`, `loom/schema/hook.js`, `loom/schema/wire.js`, `loom/schema/driver.js`). `loom/bootstrap.js` rebuilds the registry from source: the scanners in `loom/scanners/` find real edges, the hand maps in `loom/maps/` add the edges a scanner cannot see, and the result is checked for wires whose endpoints do not exist. The phasemap section of loom, `loom/scanners/phasemap-map.js`, is the roadmap of every system. Its spec is `loom/spec/loom.spec`, and it is the most deeply mapped system in NEXUS. The next zoom level is `loom-atlas.md`.

### clear-glass

The sovereign browser: Electron and Chromium, with its own fingerprint control, and the place every provider tab lives. `clear-glass/src/main/index.js` starts it; `clear-glass/src/` holds the browser's subsystems (accounts, cookies, downloads, the DevTools-protocol driver in `clear-glass/src/driver/`, providers, userscripts, site settings), `clear-glass/renderer/` its windows (the browser, Settings, the Library), and `clear-glass/plugins/` its plugins. It serves its control API on port 7704 and streams on 7701. `clear-glass/registry-components.js` is its live contract, the largest in NEXUS, and `clear-glass/spec/clear-glass.spec` was written from that contract rather than from scratch. The next zoom level is `clear-glass-atlas.md`.

### components

The component store: every file WARP builds through Idearium, kept in `components/` as one folder per component version with its dependencies pinned by id and version, and asked before any new build spends a token. `lib/component-store.js` is the store; `idearium/api/index.js` writes to it and reads from it in the build path; agents find stored components with the registry harness in `lib/registry-harness.js`. It has no port and no process of its own, and loom never scans it because it is built output rather than Nexus source. The next zoom level is `components-atlas.md`.

### core

Everything no kernel owns. Core has no port and no entry: its code runs inside whichever kernel requires it, and its documents and tests describe and check every system. It is by far the largest system by file count, because `lib/` alone is 375 files, `tests/` is 470, and `docs/` is 280. The directories below are its components, one zoom level down; the full map of each is in `core-atlas.md`.

---

## core, directory by directory

#### `lib/` — the shared libraries

The code more than one kernel needs. The groups that matter most: the agent layer (`lib/agent-router.js`, `lib/agent-tools/`, `lib/agent-system/`, `lib/repo-agent.js`, `lib/repo-hat.js`, `lib/repo-prompt-blocks.js`, `lib/repo-inject.js`, `lib/repo-context.js`); ledgers and events (`lib/ledger-writer.js`, `lib/ledger-fanin/`, `lib/event-types.js`, `lib/warp-bus.js`); the registries (`lib/component-registry.js`, `lib/capability-registry.js`, `lib/hook-registry.js`, `lib/schema-registry.js`, `lib/tool-index.js`); diagnosis (`lib/diagnostic-engines.js`, `lib/diag-engines/`, `lib/fault-log.js`, `lib/gap-field.js`); COS glue (`lib/cos-bridge.js`, `lib/cos-run.js`, `lib/repo-run.js`, `lib/compartment-engine.js`); NEXUS as a repo (`lib/nexus-self/`); and the rules every test lives under (`lib/test-sandbox.js`, `lib/version.js`).

#### `cos/` — the Compartment OS

Isolated sandboxes with their own process, network and runtime boundary, persistent state on disk, and real snapshots. `cos/kernel.js` and `cos/manager.js` run compartments; `cos/archetype/registry.js` holds the sixteen archetypes a compartment can be (web server, test runner, sandbox browser, AI agent, and the rest) and `cos/blueprint/registry.js` the multi-role blueprints; `cos/playground/branch.js` forks a compartment's files into branches that are run and compared; `cos/runtime/run.js` runs JavaScript in a clean environment with ports shifted and network isolated; `cos/compartment/qemu-runtime.js` gives a compartment a hardware-virtualized guest; `cos/vault/` is its encrypted store with `cos/vaultd/server.js` as an optional daemon. `cos/testenv/` is the test environment for any repo: `cos/testenv/index.js` runs it, `cos/testenv/detect.js` plans it, `cos/testenv/provision.js` makes the VM's base image, and `cos/testenv/setup-vm.bat` and `cos/testenv/setup-vm.sh` set the VM up in one command. Its spec is `cos/spec/cos.spec`, beside the design document `cos/spec/cos-design-v1.7.0.md`.

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

#### `erosmancer/`, `cockpit/`, `nexus-healer/` — adjacent systems

`erosmancer/erosmancer-os/` is ErosmancerOS, a TypeScript browser-automation platform over the Chrome DevTools Protocol for flows userscripts cannot handle (`erosmancer/spec/erosmancer.spec`). `cockpit/cockpit.spec` is the forge IDE's full specification, with its core in `cockpit/core.js`. `nexus-healer/` is a system scaffolded by loom's generator that holds healer proposals (`nexus-healer/api/index.js`, `nexus-healer/docs/nexus-healer.spec.md`).

#### `architecture-spec/` — how a new system is scaffolded

The base every new sovereign system is built on before it has features: components, hooks and wires compiled into a lattice that proves what connects (`architecture-spec/registry/lattice.js`), with friction and decomposition (`architecture-spec/registry/friction.js`, `architecture-spec/registry/decompose.js`) and the atlas tools (`architecture-spec/registry/create-atlas.js`, `architecture-spec/registry/edit-atlas.js`). Its atlas is `architecture-spec-atlas.md`.

#### `service/`, `sentinel/`, `scripts/`, `skills/`, `tablet/`

`service/guardian-service.js` and `service/idearium-service.js` boot a kernel as a supervised service with every lifecycle event in its ledger. `sentinel/interaction-contract.json` is the sentinel's contract; its command is `cli/sentinel.js`. `scripts/` holds release and verification tools (`scripts/verify-boot.js`, `scripts/verify-wires.js`, `scripts/precommit-check.js`, `scripts/run-verification-manifest.cjs`). `skills/` holds session skills, among them `skills/nexus-session-changelog/SKILL.md`. `tablet/` is the tablet homepage (`tablet/index.html`) and its 3D map (`tablet/map3d.html`).

#### `ui/` — the shells

The home shell (`ui/home/index.html`), the TV shell (`ui/tv-shell/`), BrainOS and its floating panel (`ui/brainos/`, `ui/brainos-float/`), the control panel (`ui/control-panel/index.html`), the Eravos canvas Idearium embeds (`ui/eravos/index.html`), the provider agents' pages (`ui/agents/`), and shared UI code (`ui/api.js`, `ui/ports.js`, `ui/pulse.js`). The orchestrator serves each one under /ui/.

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

- **Two Eravos canvases.** `eravos/ui/` (mods, served by the eravos system) and `ui/eravos/` (organisms, served by the orchestrator and embedded in Idearium) diverged. Both got the same 0.39.264 change; they are still two contracts.
- **Stale references in older system atlases.** The atlas reference test lists, for each older atlas, the references the tree no longer has; `clear-glass-atlas.md` has the most. The atlases written in 0.39.264, and `idearium-atlas.md` rewritten in 0.39.270, have none, and the test fails if one appears.
- **Diagnostic has no spec.** Its atlas says what exists instead.
- **Two run-all lists.** `tests/modules/run-all.js` and the root `run-all.js` are copies kept in step by hand.

---

## Version History

**Source:** this document, and Versionium's commit of it on every `nexus` sync.

| release | what changed here |
|---|---|
| — | first NEXUS-level atlas: an index of 13 systems, hooked into Idearium's per-repo atlas shape; the pre-0.39.264 text is kept in docs/atlases/_archive/ (outside the snapshot, in git) |
| 0.39.263 | this document became the `nexus` repo's Home in Idearium; every reference in it resolves and opens |
| 0.39.264 | written out in full: every system and every top-level directory, how work moves through NEXUS, the governing law, cross-cutting concerns, known drift; atlases added for `orchestrator`, `architect`, `eravos` and `core` so every system opens into a nested atlas; routes and data folders link to the code that owns them; a contents list; every reference checked against the real tree by `tests/modules/test-nexus-atlas-refs.test.js` |

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.

## Importing history from release zips (v0.39.282)

James: *"I have 700 nexus zips. Some with .git a lot without. I want to import the full (mostly) history from them."* Run `cli/import-history.js` inside the NEXUS checkout, with the folder of zips as its argument; it prints its own help with no arguments. Every zip becomes one snapshot commit on the branch history/snapshots, dated to the newest file in the zip and ordered by version. node_modules, data/ and nested .git folders are left out. A release zipped twice is recorded as a duplicate and gets no commit. A zip that carries a .git also has its real commits fetched under refs/import/. Each commit's trailers say which zip it came from (name, sha256, date, version). A report is written to .git/nexus-history-import/, and running the import again skips every zip that is already on the branch. Your own branch is never touched. The script prints the one command that joins the imported history under your branch and keeps your files exactly as they are. `lib/zip.js` now reads and writes entry dates. Test: `tests/modules/test-import-history.test.js`.

### The drop box (v0.39.283, N30)

James: *"give copilot a command … i want to import my archives of nexus. have it pull up a drop box ui and run the command"*. Type `/import-archives` (or just "import my archives") in Idearium's Agent CLI, or the same words in the Clear Glass co-pilot pane. It opens `idearium/ui/archive-import.html`. Drop zips or a whole folder, or paste a folder path. **Check the order** is a dry run that writes nothing; **Import** runs `cli/import-history.js` as a background child process (`lib/history-import-job.js`), so idearium never blocks on 700 zips. The page shows a row per zip as it lands, the counts, the report path and the one merge command. API: `GET|POST /api/history/import`, `PUT /api/history/import/upload?name=` (a browser without disk paths streams each zip to `<data>/history-import/inbox`). Tests: `tests/modules/test-history-import-job.test.js`, `tests/probe/archive-import-chromium.js`.
