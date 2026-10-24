<!-- README.md is docs/atlases/nexus-atlas.md, copied by scripts/generate-atlases.js (0.59.12). Edit the atlas, not this file. -->
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

Orchestrator is 67 files in 4 modules, entry `orchestrator/orchestrator.js`, port 9000, spec `orchestrator/spec/orchestrator.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/orchestrator-atlas.md`.

<details>
<summary>`orchestrator/` · 5 files</summary>

- `orchestrator/event-taxonomy.js` — // orchestrator/event-taxonomy.js — ET4_orchestrator_autopilot_event_taxonomy. // Conforms to…
- `orchestrator/interaction-contract.json`
- `orchestrator/orchestrator-contract.json`
- `orchestrator/orchestrator.config.json`
- `orchestrator/orchestrator.js` — // 0.60.207 DL2 — James: "make each system responsible for it's own data". Its files in the root data/ come…

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
<summary>`orchestrator/phases/` · 40 files</summary>

- `orchestrator/phases/2026-08-27-event-taxonomy-and-brainstorm/ET4_orchestrator_autopilot_event_taxonomy.phase`
- `orchestrator/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET4_orchestrator_autopilot_event_taxonomy-b566d3c8985e27fb.graph`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/CG2_native_password_permission_zoom.phase`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/CG3_ublock_style_adblocker.phase`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/MEM2_ledger_folder_reorg.phase`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/MEM3_timestamps_everywhere.phase`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/VS1_sovereign_folder_and_foundation.phase`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/VS4_active_drift_enforcement.phase`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/CG2_native_password_permission_zoom-9e420f8cb79a33fb.graph`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/CG3_ublock_style_adblocker-303ef29f7a7e41db.graph`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/MEM2_ledger_folder_reorg-2338a73cb6de9f6f.graph`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/MEM3_timestamps_everywhere-3782812ddfa09005.graph`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/VS1_sovereign_folder_and_foundation-0347201816acd368.graph`
- `orchestrator/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/VS4_active_drift_enforcement-225162f916d418e1.graph`
- `orchestrator/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P4_repoint_callers.phase`
- `orchestrator/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P4_repoint_callers-052187ecb12107d5.graph`
- `orchestrator/phases/2026-09-27-one-idearium-phases-living-spec-nodes/R1_ui_dir_redirect.phase`
- `orchestrator/phases/2026-09-27-one-idearium-phases-living-spec-nodes/V1_versionium_proxies.phase`
- `orchestrator/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X3_nodes_route.phase`
- `orchestrator/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/R1_ui_dir_redirect-2635438fe347f665.graph`
- `orchestrator/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/V1_versionium_proxies-2086de738783e68e.graph`
- `orchestrator/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X3_nodes_route-c4340ed9cd3aa9e9.graph`
- `orchestrator/phases/2026-10-05-announce-pulse-repair/PR4_deviation_raises_the_bpm.phase`
- `orchestrator/phases/2026-10-05-announce-pulse-repair/graph/PR4_deviation_raises_the_bpm-5aab20c0be8a099d.graph`
- `orchestrator/phases/2026-10-15-capability-specs-and-semantic-page-tree/CS2_spec_the_unspecced.phase`
- `orchestrator/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/CS2_spec_the_unspecced-9358da2e9e6a8e73.graph`
- `orchestrator/phases/2026-10-17-system-drawbridge/DB5_the_handshake_for_every_system.phase`
- `orchestrator/phases/2026-10-17-system-drawbridge/graph/DB5_the_handshake_for_every_system-78b6fef273ac958e.graph`
- `orchestrator/phases/2026-10-18-gating-census/L0_the_record_tells_the_truth.phase`
- `orchestrator/phases/2026-10-18-gating-census/L3_needs_GM0a.phase`
- `orchestrator/phases/2026-10-18-gating-census/L4_above.phase`
- `orchestrator/phases/2026-10-18-gating-census/graph/L0_the_record_tells_the_truth-7adb29f2991be2a8.graph`
- `orchestrator/phases/2026-10-18-gating-census/graph/L3_needs_GM0a-479b1bdf2c376727.graph`
- `orchestrator/phases/2026-10-18-gating-census/graph/L4_above-712576e859588ca1.graph`
- `orchestrator/phases/2026-10-20-belief-loop/RA0_rca_says_what_it_does.phase`
- `orchestrator/phases/2026-10-20-belief-loop/graph/RA0_rca_says_what_it_does-a63f882b1b3c07af.graph`
- `orchestrator/phases/2026-10-21-data-layout/DL7_cortex_snapshot_out.phase`
- `orchestrator/phases/2026-10-21-data-layout/graph/DL7_cortex_snapshot_out-8a40ede24582f4ff.graph`
- `orchestrator/phases/2026-10-21-data-layout/graph/_superseded/DL7_cortex_snapshot_out-af1c908b9a84788d.graph`
- `orchestrator/phases/INDEX.md`

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

Cortex is 292 files in 14 modules, entry `cortex/boot.js`, port 3748, spec `cortex/spec/cortex.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/cortex-atlas.md`.

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
<summary>`cortex/phases/` · 214 files</summary>

- `cortex/phases/2026-08-23-backlog/BL13_cortex_component_registry_move.phase`
- `cortex/phases/2026-08-23-backlog/graph/BL13_cortex_component_registry_move-7967e5a04f2c6d03.graph`
- `cortex/phases/2026-08-28-self-building-pipeline/SBP3_wire_contract_intake_through_routing_ir.phase`
- `cortex/phases/2026-08-28-self-building-pipeline/SBP4_wire_loom_and_selfheal_as_real_contract_sources.phase`
- `cortex/phases/2026-08-28-self-building-pipeline/SBP5_cortex_data_organization_scoping.phase`
- `cortex/phases/2026-08-28-self-building-pipeline/SBP7_DESIGN_PRINCIPLE_automation_over_code.phase`
- `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP3_wire_contract_intake_through_routing_ir-cd59baa39d390724.graph`
- `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP4_wire_loom_and_selfheal_as_real_contract_sources-8d7fc37478dacfed.graph`
- `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP5_cortex_data_organization_scoping-6d939bafad4b1587.graph`
- `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP7_DESIGN_PRINCIPLE_automation_over_code-d3947752becd8cf4.graph`
- `cortex/phases/2026-08-30-interaction-contract-context/IC6_multi_source_code_request_intake.phase`
- `cortex/phases/2026-08-30-interaction-contract-context/graph/IC6_multi_source_code_request_intake-f808f7b781912a8f.graph`
- `cortex/phases/2026-09-02-nexus-vision-master/LM5_data_decay_per_system.phase`
- `cortex/phases/2026-09-02-nexus-vision-master/SR4_fitness_driven_contract_adjustment.phase`
- `cortex/phases/2026-09-02-nexus-vision-master/T5_raid_full_cli.phase`
- `cortex/phases/2026-09-02-nexus-vision-master/V9_precommit_gate_for_raid_contracts.phase`
- `cortex/phases/2026-09-02-nexus-vision-master/graph/LM5_data_decay_per_system-968c129f68946726.graph`
- `cortex/phases/2026-09-02-nexus-vision-master/graph/SR4_fitness_driven_contract_adjustment-d411d9559fb15a73.graph`
- `cortex/phases/2026-09-02-nexus-vision-master/graph/T5_raid_full_cli-0ea6cdd19666fd57.graph`
- `cortex/phases/2026-09-02-nexus-vision-master/graph/V9_precommit_gate_for_raid_contracts-088f2ec27fdd977e.graph`
- `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CG3_relay_into_cortex_sse.phase`
- `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DF2_cortex_and_versionium_off_root_data.phase`
- `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/HIST1_boundary_constraint_history_schema.phase`
- `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CG3_relay_into_cortex_sse-24e51983a5045f80.graph`
- `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DF2_cortex_and_versionium_off_root_data-878b01658023f007.graph`
- `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/HIST1_boundary_constraint_history_schema-7a9b8b7a2b2c78de.graph`
- `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/D2_self_heal_migration.phase`
- `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/R1_recall_to_lib.phase`
- `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/V2_snapshot_ownership_decision.phase`
- `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/D2_self_heal_migration-5f98a58f11bf4291.graph`
- `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/R1_recall_to_lib-32458afe2804d0bc.graph`
- `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/V2_snapshot_ownership_decision-812e620fe68626d8.graph`
- `cortex/phases/2026-09-11-sovereign-node-architecture/P11_unify_failure_tracking.phase`
- `cortex/phases/2026-09-11-sovereign-node-architecture/graph/P11_unify_failure_tracking-3a5dd3cf9faa33c1.graph`
- `cortex/phases/2026-09-13-axiom-5-2-raid-routing/MCO12_guardian_audit_complete.phase`
- `cortex/phases/2026-09-13-axiom-5-2-raid-routing/MCO8_wire_the_honest_subset.phase`
- `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO12_guardian_audit_complete-ff11ef686e0084e9.graph`
- `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO8_wire_the_honest_subset-ea1b8c0c845ac17a.graph`
- `cortex/phases/2026-09-13-track-b-sovereignty/MCO17_contract_boundary_retracted.phase`
- `cortex/phases/2026-09-13-track-b-sovereignty/MCO18_interaction_contract_split_scoped.phase`
- `cortex/phases/2026-09-13-track-b-sovereignty/graph/MCO17_contract_boundary_retracted-7e7a95ae7baa92ae.graph`
- `cortex/phases/2026-09-13-track-b-sovereignty/graph/MCO18_interaction_contract_split_scoped-cdf5f24602f5099b.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B1_field_ownership.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B2_jaadb_not_single_writer.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B4_userscript_cutover.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B6_two_intelligence_runtimes.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P1_characterization.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P3_cortex_becomes_forwarder.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P5_retire_second_runtime.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P6_versionium_residue.phase`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B1_field_ownership-b57173bf62bbbbb6.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B2_jaadb_not_single_writer-d497d683710ee21c.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B4_userscript_cutover-3f2e8e0e67d4f20b.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B6_two_intelligence_runtimes-0258dad07ec7a2de.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P1_characterization-47dc454012e2d666.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P3_cortex_becomes_forwarder-76fa1bf1526a963a.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P5_retire_second_runtime-7cbaf0dae879f2ed.graph`
- `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P6_versionium_residue-16ec7c94e45a4c8c.graph`
- `cortex/phases/2026-09-28-graph-build-context-settings-memory/C2.phase`
- `cortex/phases/2026-09-28-graph-build-context-settings-memory/M2.phase`
- `cortex/phases/2026-09-28-graph-build-context-settings-memory/M3.phase`
- `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/C2-b34cbf403596480b.graph`
- `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/M2-3bfe2ca613898a9e.graph`
- `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/M3-bad6fa3cd17bd889.graph`
- `cortex/phases/2026-09-28-staging-self-heal/C1.phase`
- `cortex/phases/2026-09-28-staging-self-heal/graph/C1-54047179b286c733.graph`
- `cortex/phases/2026-10-01-idearium-agent-ready-master/PF9_boot_memory_census.phase`
- `cortex/phases/2026-10-01-idearium-agent-ready-master/graph/PF9_boot_memory_census-c2a0c372cf2327b6.graph`
- `cortex/phases/2026-10-02-emerge-field-memory-build/FM1_mining_failure_modes.phase`
- `cortex/phases/2026-10-02-emerge-field-memory-build/MR4_field_memory.phase`
- `cortex/phases/2026-10-02-emerge-field-memory-build/graph/FM1_mining_failure_modes-4584c0639e11da24.graph`
- `cortex/phases/2026-10-02-emerge-field-memory-build/graph/MR4_field_memory-3f0c971304297739.graph`
- `cortex/phases/2026-10-05-cli-data-code/DS1_cortex_the_catalog.phase`
- `cortex/phases/2026-10-05-cli-data-code/DS2_one_system_moves_home.phase`
- `cortex/phases/2026-10-05-cli-data-code/graph/DS1_cortex_the_catalog-9b630dee8890208b.graph`
- `cortex/phases/2026-10-05-cli-data-code/graph/DS2_one_system_moves_home-96e381a353f57785.graph`
- `cortex/phases/2026-10-07-heal-nodes/HL0_runtime_faults_reach_the_ladder.phase`
- `cortex/phases/2026-10-07-heal-nodes/HL1_the_heal_node.phase`
- `cortex/phases/2026-10-07-heal-nodes/HL2_level_zero_reads_heals.phase`
- `cortex/phases/2026-10-07-heal-nodes/HL3_heal_before_it_breaks.phase`
- `cortex/phases/2026-10-07-heal-nodes/HL4_the_heal_ledger.phase`
- `cortex/phases/2026-10-07-heal-nodes/graph/HL0_runtime_faults_reach_the_ladder-947d5607680d7d04.graph`
- `cortex/phases/2026-10-07-heal-nodes/graph/HL1_the_heal_node-15acb9f6783aa960.graph`
- `cortex/phases/2026-10-07-heal-nodes/graph/HL2_level_zero_reads_heals-90ff9b6cb72f2226.graph`
- `cortex/phases/2026-10-07-heal-nodes/graph/HL3_heal_before_it_breaks-9e2f2e991abd05e1.graph`
- `cortex/phases/2026-10-07-heal-nodes/graph/HL4_the_heal_ledger-4d7fa995a99f7a73.graph`
- `cortex/phases/2026-10-07-runtime-load/PF5_bounded_tables.phase`
- `cortex/phases/2026-10-07-runtime-load/graph/PF5_bounded_tables-6ba51de2ef5c30a7.graph`
- `cortex/phases/2026-10-09-one-model-engine/ME7_raid_spine_joins.phase`
- `cortex/phases/2026-10-09-one-model-engine/ME8_the_drainers_run_the_engine.phase`
- `cortex/phases/2026-10-09-one-model-engine/graph/ME7_raid_spine_joins-e2bc735f29322953.graph`
- `cortex/phases/2026-10-09-one-model-engine/graph/ME8_the_drainers_run_the_engine-a10cd5fa948ace2c.graph`
- `cortex/phases/2026-10-12-browser-providers-and-work/PV6_raid_reads_health_everywhere.phase`
- `cortex/phases/2026-10-12-browser-providers-and-work/graph/PV6_raid_reads_health_everywhere-50948b43a1f650ab.graph`
- `cortex/phases/2026-10-12-request-spine/RQ21_the_contract_file_is_its_record.phase`
- `cortex/phases/2026-10-12-request-spine/RQ7_the_context_obligations.phase`
- `cortex/phases/2026-10-12-request-spine/RQ9_the_chunked_contract.phase`
- `cortex/phases/2026-10-12-request-spine/graph/RQ21_the_contract_file_is_its_record-edb46c91a98d61cd.graph`
- `cortex/phases/2026-10-12-request-spine/graph/RQ7_the_context_obligations-31e6486efe8a56e7.graph`
- `cortex/phases/2026-10-12-request-spine/graph/RQ9_the_chunked_contract-3abf89c90ee33111.graph`
- `cortex/phases/2026-10-13-gates-that-learn-and-priorities/GT1_gates_route_diagnose_retry.phase`
- `cortex/phases/2026-10-13-gates-that-learn-and-priorities/graph/GT1_gates_route_diagnose_retry-8014549b43dcfa51.graph`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/CT1b_reviewed.phase`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/EX0_executors_he_already_built.phase`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/MEM0_nexus_holds_everything.phase`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/SC0_scheduler.phase`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/TD0_today_and_yesterday_working.phase`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT1b_reviewed-3178ffe24c2f885c.graph`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/EX0_executors_he_already_built-d7ad680fcecf9144.graph`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/MEM0_nexus_holds_everything-b3af5dee49c651c8.graph`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/SC0_scheduler-c788fb307eb53e0b.graph`
- `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/TD0_today_and_yesterday_working-91e91c8146a1148c.graph`
- `cortex/phases/2026-10-13-projects-raid-and-gates/RD0_raid_has_its_own_contract.phase`
- `cortex/phases/2026-10-13-projects-raid-and-gates/RD1_raid_commands.phase`
- `cortex/phases/2026-10-13-projects-raid-and-gates/RD4_the_fulfilled_contract_is_one_file.phase`
- `cortex/phases/2026-10-13-projects-raid-and-gates/graph/RD0_raid_has_its_own_contract-3b0ad3c04c18a6bb.graph`
- `cortex/phases/2026-10-13-projects-raid-and-gates/graph/RD1_raid_commands-eaf659e67016b3ac.graph`
- `cortex/phases/2026-10-13-projects-raid-and-gates/graph/RD4_the_fulfilled_contract_is_one_file-757df4a3809c380a.graph`
- `cortex/phases/2026-10-15-automatic-tracking/GA1_the_gate_assesses_before_it_spends.phase`
- `cortex/phases/2026-10-15-automatic-tracking/GT2_each_gate_tags_and_reports.phase`
- `cortex/phases/2026-10-15-automatic-tracking/QA2_a_real_run.phase`
- `cortex/phases/2026-10-15-automatic-tracking/RT2_routed_by_intent_account_and_fallback.phase`
- `cortex/phases/2026-10-15-automatic-tracking/graph/GA1_the_gate_assesses_before_it_spends-8219e00f69d5db25.graph`
- `cortex/phases/2026-10-15-automatic-tracking/graph/GT2_each_gate_tags_and_reports-3797d6cbb370567f.graph`
- `cortex/phases/2026-10-15-automatic-tracking/graph/QA2_a_real_run-37774413980dc0ec.graph`
- `cortex/phases/2026-10-15-automatic-tracking/graph/RT2_routed_by_intent_account_and_fallback-e032f09d67bd248e.graph`
- `cortex/phases/2026-10-15-gate-held-work/GW1_the_baton.phase`
- `cortex/phases/2026-10-15-gate-held-work/GW24_the_gate_holds_the_agent_gets_a_projection.phase`
- `cortex/phases/2026-10-15-gate-held-work/GW25_the_systems_at_the_gate_moments.phase`
- `cortex/phases/2026-10-15-gate-held-work/GW26_everything_declares_what_it_needs.phase`
- `cortex/phases/2026-10-15-gate-held-work/graph/GW1_the_baton-2558d35dc4282735.graph`
- `cortex/phases/2026-10-15-gate-held-work/graph/GW24_the_gate_holds_the_agent_gets_a_projection-80b3bd80f12d4cc4.graph`
- `cortex/phases/2026-10-15-gate-held-work/graph/GW25_the_systems_at_the_gate_moments-0b4eab67c2ed65d7.graph`
- `cortex/phases/2026-10-15-gate-held-work/graph/GW26_everything_declares_what_it_needs-c970dbd56ce21cc0.graph`
- `cortex/phases/2026-10-15-one-contract-raid-releases/BR2_recursion_to_a_depth.phase`
- `cortex/phases/2026-10-15-one-contract-raid-releases/GT1a_exhausted_climb_spends_its_attempt.phase`
- `cortex/phases/2026-10-15-one-contract-raid-releases/RD0_raid_runs_the_contract.phase`
- `cortex/phases/2026-10-15-one-contract-raid-releases/graph/BR2_recursion_to_a_depth-2e171420309b04aa.graph`
- `cortex/phases/2026-10-15-one-contract-raid-releases/graph/GT1a_exhausted_climb_spends_its_attempt-6108f2a7ab7f09d8.graph`
- `cortex/phases/2026-10-15-one-contract-raid-releases/graph/RD0_raid_runs_the_contract-e1539a5fce346d1b.graph`
- `cortex/phases/2026-10-15-spec-foundation-model/SF1_foundation_field.phase`
- `cortex/phases/2026-10-15-spec-foundation-model/SF2_state_and_gate.phase`
- `cortex/phases/2026-10-15-spec-foundation-model/SF3_evidence_not_claims.phase`
- `cortex/phases/2026-10-15-spec-foundation-model/SF5_hat_intent_injection.phase`
- `cortex/phases/2026-10-15-spec-foundation-model/SF6_addenda_view.phase`
- `cortex/phases/2026-10-15-spec-foundation-model/SF7_get_his_run_current.phase`
- `cortex/phases/2026-10-15-spec-foundation-model/graph/SF1_foundation_field-403be3a3de4097fa.graph`
- `cortex/phases/2026-10-15-spec-foundation-model/graph/SF2_state_and_gate-adb0d3d7e575647a.graph`
- `cortex/phases/2026-10-15-spec-foundation-model/graph/SF3_evidence_not_claims-2b678b0269fe99ed.graph`
- `cortex/phases/2026-10-15-spec-foundation-model/graph/SF5_hat_intent_injection-10e5a79bbc7cf1e9.graph`
- `cortex/phases/2026-10-15-spec-foundation-model/graph/SF6_addenda_view-d7b4036d0d6df1de.graph`
- `cortex/phases/2026-10-15-spec-foundation-model/graph/SF7_get_his_run_current-b512f674cbcad8ad.graph`
- `cortex/phases/2026-10-17-debugging-product/DP9_crystallize_the_fix.phase`
- `cortex/phases/2026-10-17-debugging-product/graph/DP9_crystallize_the_fix-bb202e146d2c087f.graph`
- `cortex/phases/2026-10-17-failure-mode-report/FMR3_the_report.phase`
- `cortex/phases/2026-10-17-failure-mode-report/FMR4_the_macro_bundle.phase`
- `cortex/phases/2026-10-17-failure-mode-report/FMR9_agents_have_it.phase`
- `cortex/phases/2026-10-17-failure-mode-report/graph/FMR3_the_report-299dbc8fd18c04ed.graph`
- `cortex/phases/2026-10-17-failure-mode-report/graph/FMR4_the_macro_bundle-ae03f54c04d34a09.graph`
- `cortex/phases/2026-10-17-failure-mode-report/graph/FMR9_agents_have_it-63ef698ad90660e2.graph`
- `cortex/phases/2026-10-17-infrastructure-migration/IM4_the_kernel_boundary.phase`
- `cortex/phases/2026-10-17-infrastructure-migration/IM6_cortex_unclumped.phase`
- `cortex/phases/2026-10-17-infrastructure-migration/graph/IM4_the_kernel_boundary-2fa27fc4450f490d.graph`
- `cortex/phases/2026-10-17-infrastructure-migration/graph/IM6_cortex_unclumped-fd9d4833cc2172df.graph`
- `cortex/phases/2026-10-17-pieces-not-order/PC2_any_order.phase`
- `cortex/phases/2026-10-17-pieces-not-order/PC3_verified_alone_resumed_by_recheck.phase`
- `cortex/phases/2026-10-17-pieces-not-order/PC6_assembled_and_checked_whole.phase`
- `cortex/phases/2026-10-17-pieces-not-order/graph/PC2_any_order-6bc0af47ff8e008b.graph`
- `cortex/phases/2026-10-17-pieces-not-order/graph/PC3_verified_alone_resumed_by_recheck-c2d9bfbcf28fdd80.graph`
- `cortex/phases/2026-10-17-pieces-not-order/graph/PC6_assembled_and_checked_whole-02773cb04a5358ed.graph`
- `cortex/phases/2026-10-18-gate-memory/GM1_the_gate_record.phase`
- `cortex/phases/2026-10-18-gate-memory/GM2_restarts_resume_from_records.phase`
- `cortex/phases/2026-10-18-gate-memory/GM3_the_fulfilled_contract_index.phase`
- `cortex/phases/2026-10-18-gate-memory/graph/GM1_the_gate_record-7b2f7b374309d9af.graph`
- `cortex/phases/2026-10-18-gate-memory/graph/GM2_restarts_resume_from_records-2cab55cf6b2e5f35.graph`
- `cortex/phases/2026-10-18-gate-memory/graph/GM3_the_fulfilled_contract_index-5f982253e7259033.graph`
- `cortex/phases/2026-10-19-pipeline-root-causes/SS2_every_system_home.phase`
- `cortex/phases/2026-10-19-pipeline-root-causes/graph/SS2_every_system_home-8abdeb8d18ad7e5d.graph`
- `cortex/phases/2026-10-19-solid-build-foundation/DC1_dynamic_chunk_at_plan.phase`
- `cortex/phases/2026-10-19-solid-build-foundation/graph/DC1_dynamic_chunk_at_plan-a3e911b7984ff47a.graph`
- `cortex/phases/2026-10-20-belief-loop/CY1_lifecycle_and_injection.phase`
- `cortex/phases/2026-10-20-belief-loop/graph/CY1_lifecycle_and_injection-f9114a7b5b7207b8.graph`
- `cortex/phases/2026-10-20-substrate-graph-traversal-chunking-gating/DK1_dynamic_chunking.phase`
- `cortex/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/DK1_dynamic_chunking-2e1c9985830b2941.graph`
- `cortex/phases/2026-10-21-data-layout/DL6_cortex_server.phase`
- `cortex/phases/2026-10-21-data-layout/graph/DL6_cortex_server-12bcbaa9f6f99ef8.graph`
- `cortex/phases/2026-10-21-data-layout/graph/_superseded/DL6_cortex_server-1ac803216ae293ca.graph`
- `cortex/phases/INDEX.md`
- `cortex/phases/agent-model-and-user-continuity/AM4_full_user_continuity.phase`
- `cortex/phases/agent-model-and-user-continuity/graph/AM4_full_user_continuity-3a71daf44b278748.graph`
- `cortex/phases/copilot-awareness-routing/CA5_intent_routing.phase`
- `cortex/phases/copilot-awareness-routing/graph/CA5_intent_routing-3a5f0d9163ea6078.graph`
- `cortex/phases/copilot-full-capability/P1_cross_agent_recall.phase`
- `cortex/phases/copilot-full-capability/P4_raid_snr_query_tool.phase`
- `cortex/phases/copilot-full-capability/graph/P1_cross_agent_recall-a040d6583f3e1e8b.graph`
- `cortex/phases/copilot-full-capability/graph/P4_raid_snr_query_tool-f934b5bf077cf0cd.graph`
- `cortex/phases/gemini-multiagent-coding/P3_line_block_seam_sync.phase`
- `cortex/phases/gemini-multiagent-coding/graph/P3_line_block_seam_sync-4c9b125899b7ce0f.graph`
- `cortex/phases/nexus-architecture-rebuild/P7_schema_based_persistence_system_wide.phase`
- `cortex/phases/nexus-architecture-rebuild/graph/P7_schema_based_persistence_system_wide-553361839aed4212.graph`
- `cortex/phases/nexus-repo-compartment-and-rich-dispatch/NC1_compartment_bootstrapping_decision.phase`
- `cortex/phases/nexus-repo-compartment-and-rich-dispatch/NC2_nested_compartment_support.phase`
- `cortex/phases/nexus-repo-compartment-and-rich-dispatch/RS1_repo_settings_sections.phase`
- `cortex/phases/nexus-repo-compartment-and-rich-dispatch/graph/NC1_compartment_bootstrapping_decision-bf4d956cc2a7c398.graph`
- `cortex/phases/nexus-repo-compartment-and-rich-dispatch/graph/NC2_nested_compartment_support-0b4000d92371184e.graph`
- `cortex/phases/nexus-repo-compartment-and-rich-dispatch/graph/RS1_repo_settings_sections-06ec8dbcca479409.graph`
- `cortex/phases/raid-routing-fidelity/RR1_verify_and_wire_the_snr_fidelity_gate.phase`
- `cortex/phases/raid-routing-fidelity/RR6_cortex_fitness_and_fluid_configs.phase`
- `cortex/phases/raid-routing-fidelity/graph/RR1_verify_and_wire_the_snr_fidelity_gate-811ac85b77bfb21d.graph`
- `cortex/phases/raid-routing-fidelity/graph/RR6_cortex_fitness_and_fluid_configs-6e58e5b8e1945e9b.graph`
- `cortex/phases/snapshot-trigger/SS1_drift_triggered_snapshot.phase`
- `cortex/phases/snapshot-trigger/SS2_snapshot_in_diagnostics.phase`
- `cortex/phases/snapshot-trigger/graph/SS1_drift_triggered_snapshot-a29e09c529c8d673.graph`
- `cortex/phases/snapshot-trigger/graph/SS2_snapshot_in_diagnostics-a6929e53be935126.graph`

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

34 release notes name a file of cortex: 0.60.233., 0.60.226., 0.60.224., 0.60.203., 0.60.177., 0.60.158., 0.60.157., 0.60.150., 0.60.149., 0.60.147., 0.60.145., 0.60.133., 0.60.132., 0.60.131., 0.60.94., 0.60.79., 0.60.78., 0.60.75., 0.60.73., 0.60.36., 0.60.30., 0.60.29., 0.60.18., 0.60.16., 0.60.15., 0.60.3., 0.59.6., 0.43.0., 0.39.342., 0.39.333., 0.39.277., 0.39.267., 0.39.236., 0.39.181.. Each is in the version history below, in his words.

<!-- generated:readme:system:cortex:end -->

### guardian

The AI engine and NEXUS's only point of contact with AI providers: no API keys, no external inference calls, browser tabs only. `guardian/server.js` on :7820 receives jobs, and `guardian/lib/` is where they are handled: `guardian/lib/jobs.js` and `guardian/lib/dispatcher.js` for the job lifecycle, `guardian/lib/dispatch-pool.js` and `guardian/lib/dispatch-ladder.js` for choosing a tab, `guardian/lib/ncp.js` and `guardian/lib/ncp-handler.js` for the NCP protocol the userscripts speak, `guardian/lib/agent-registry.js` and `guardian/lib/selector-map.js` for each provider's page selectors, `guardian/lib/wake-loop.js` for an agent's "hey nexus" to NEXUS, and `guardian/lib/node-registry.js` for its JAA-backed node types, the watcher pattern `architecture-spec` generalizes. When a tab needs the person, a sign-in wall, a chat it cannot map, a tab that never connects, `guardian/lib/provider-attention.js` asks Clear Glass to show that tab with a Nexus panel and its element picker (`clear-glass/src/providers/attention.js`).

The provider side is the userscripts: `guardian/userscript-chatgpt.js`, `guardian/userscript-claude.js`, `guardian/userscript-gemini.js`, `guardian/userscript-perplexity.js` and `guardian/userscript-deepseek.js`, declared in `guardian/userscripts.yaml`. Its commands live in `guardian/commands/`, its routes in `guardian/routes/`, and its spec in `guardian/spec/guardian.spec`. The next zoom level is `guardian-atlas.md`.

<!-- generated:readme:system:guardian:start -->
#### guardian: every module and every file

Guardian is 392 files in 45 modules, entry `guardian/server.js`, port 7820, spec `guardian/spec/guardian.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/guardian-atlas.md`.

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
<summary>`guardian/phases/` · 1 file</summary>

- `guardian/phases/INDEX.md` — guardian — its phases

</details>

<details>
<summary>`guardian/phases/2026-08-22-session-full/` · 14 files</summary>

- `guardian/phases/2026-08-22-session-full/SF15_wake_pipeline_real_bugs_fixed.phase`
- `guardian/phases/2026-08-22-session-full/SF1_sse_reconnect_leak.phase`
- `guardian/phases/2026-08-22-session-full/SF2_providerhost_stopall_missing.phase`
- `guardian/phases/2026-08-22-session-full/SF3_chat_history_panel_wrong_url.phase`
- `guardian/phases/2026-08-22-session-full/SF4_copilot_missing_own_tools.phase`
- `guardian/phases/2026-08-22-session-full/SF8_meta_shim_cleanup.phase`
- `guardian/phases/2026-08-22-session-full/SF9_account_identity_capture.phase`
- `guardian/phases/2026-08-22-session-full/graph/SF15_wake_pipeline_real_bugs_fixed-31df01244706d8fa.graph`
- `guardian/phases/2026-08-22-session-full/graph/SF1_sse_reconnect_leak-36a10b8830fc0eb0.graph`
- `guardian/phases/2026-08-22-session-full/graph/SF2_providerhost_stopall_missing-28f6c81204f42cea.graph`
- `guardian/phases/2026-08-22-session-full/graph/SF3_chat_history_panel_wrong_url-fc0dad959f17616a.graph`
- `guardian/phases/2026-08-22-session-full/graph/SF4_copilot_missing_own_tools-511751da9313072f.graph`
- `guardian/phases/2026-08-22-session-full/graph/SF8_meta_shim_cleanup-dfd2bf6c9c55ba77.graph`
- `guardian/phases/2026-08-22-session-full/graph/SF9_account_identity_capture-3eb75500093ff04c.graph`

</details>

<details>
<summary>`guardian/phases/2026-08-23-backlog/` · 2 files</summary>

- `guardian/phases/2026-08-23-backlog/BL3_port_social_listener_pattern.phase`
- `guardian/phases/2026-08-23-backlog/graph/BL3_port_social_listener_pattern-0f003446efc1eb09.graph`

</details>

<details>
<summary>`guardian/phases/2026-08-30-interaction-contract-context/` · 2 files</summary>

- `guardian/phases/2026-08-30-interaction-contract-context/IC1_context_by_uuid_injection.phase`
- `guardian/phases/2026-08-30-interaction-contract-context/graph/IC1_context_by_uuid_injection-e3fff7e8482237f8.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-02-agent-mesh-full-map/` · 2 files</summary>

- `guardian/phases/2026-09-02-agent-mesh-full-map/AM4_userscript_shared_core_dedup.phase`
- `guardian/phases/2026-09-02-agent-mesh-full-map/graph/AM4_userscript_shared_core_dedup-2a7095a3c05cd5cb.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-02-nexus-vision-master/` · 64 files</summary>

- `guardian/phases/2026-09-02-nexus-vision-master/AM11_per_agent_tasks_automation.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/AM8_element_picker_agent_wiring.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/C1_copilot_spec_wizard.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/C3_component_import_decomposition.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG10_zoom_and_hotkeys_bug.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG11_ublock_adblocker_native_features.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG4_macros_plugin_autofill.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG5_copilot_guided_spotlight_macro.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG6_element_picker_to_listener_queue.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG7_cli_first_architecture.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG8_devtools_screenshot_dom_archaeology.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CG9_history_via_rewind_engine.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/CP1_less_rigid_copilot.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/D1_bridgeos_readme_template.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/D2_idearium_compartment_structure.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/D3_loom_compartment_readme.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/D4_spec_bulk_import.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/G1_guardian_agents_folder.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/LM2_per_system_living_model_completion.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/LM3_component_registry_hooks_spec.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/LM4_hotswap_ui_contracts.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/SR1_per_agent_wake_words.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/SR2_copilot_clarifying_questions.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/SR5_large_file_chunk_working_memory.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/SR6_per_output_build_surface.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/SR8_deterministic_claude_replication.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/T3_tool_to_event_mapping.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/V10_dynamic_registry_self_wiring.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/V8_full_change_tracking_hashing.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/WF1_workflow_automation_engine.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/WF2_canvas_visual_pipeline.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/WF3_cockpit_ui_shell.phase`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/AM11_per_agent_tasks_automation-7883cb15f206e4d3.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/AM8_element_picker_agent_wiring-1e65be4bd0ebc982.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/C1_copilot_spec_wizard-df6cd6e5900b6ad4.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/C3_component_import_decomposition-161153bb675e4ff1.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG10_zoom_and_hotkeys_bug-4433572db3edc3a9.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG11_ublock_adblocker_native_features-fed21457aecdec12.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG4_macros_plugin_autofill-28b2a325170ef2f1.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG5_copilot_guided_spotlight_macro-c2df75d5133452f2.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG6_element_picker_to_listener_queue-94fdca8c6a094fd0.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG7_cli_first_architecture-b57d50165ca5bd29.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG8_devtools_screenshot_dom_archaeology-08ddcfae15dfe9b5.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CG9_history_via_rewind_engine-236f3a18df458ec9.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/CP1_less_rigid_copilot-ce68f1c10420ee04.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/D1_bridgeos_readme_template-4fb8fecea9b65f50.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/D2_idearium_compartment_structure-80dbc60fc6451eb9.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/D3_loom_compartment_readme-8e08088d72c8d83a.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/D4_spec_bulk_import-a8957d46b0a04c43.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/G1_guardian_agents_folder-6b3bc0c422f31286.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/LM2_per_system_living_model_completion-9102177dca43ea27.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/LM3_component_registry_hooks_spec-128374a4d532fba0.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/LM4_hotswap_ui_contracts-3793f13db0642bcf.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/SR1_per_agent_wake_words-e51fea7cf9dc2e35.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/SR2_copilot_clarifying_questions-fe1ec9e7087e46e1.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/SR5_large_file_chunk_working_memory-43d0d7b0b6b6a579.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/SR6_per_output_build_surface-67b0a4481b1bbd4f.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/SR8_deterministic_claude_replication-2655ab144b7b2237.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/T3_tool_to_event_mapping-963fe75d4ce7268a.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/V10_dynamic_registry_self_wiring-c55603e97de1585c.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/V8_full_change_tracking_hashing-4371829fd3cff4f1.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/WF1_workflow_automation_engine-632d349bf949759c.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/WF2_canvas_visual_pipeline-9d8971d7af662125.graph`
- `guardian/phases/2026-09-02-nexus-vision-master/graph/WF3_cockpit_ui_shell-e038ecb5ad9f4172.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-05-observability-sovereignty-and-agent-mesh/` · 2 files</summary>

- `guardian/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DF1_guardian_own_data_folder.phase`
- `guardian/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DF1_guardian_own_data_folder-688ee953c3e55552.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-11-sovereign-node-architecture/` · 4 files</summary>

- `guardian/phases/2026-09-11-sovereign-node-architecture/P26_unify_conversation_logging.phase`
- `guardian/phases/2026-09-11-sovereign-node-architecture/P31_job_reference_command_syntax.phase`
- `guardian/phases/2026-09-11-sovereign-node-architecture/graph/P26_unify_conversation_logging-77d4192f746b7566.graph`
- `guardian/phases/2026-09-11-sovereign-node-architecture/graph/P31_job_reference_command_syntax-05330631270dac6a.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-13-axiom-5-2-raid-routing/` · 2 files</summary>

- `guardian/phases/2026-09-13-axiom-5-2-raid-routing/MCO12_guardian_list_was_unreliable.phase`
- `guardian/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO12_guardian_list_was_unreliable-699ffb5ba2eb8fea.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-19-guardian-mesh-first-dispatch/` · 2 files</summary>

- `guardian/phases/2026-09-19-guardian-mesh-first-dispatch/P5_guardian_transport.phase`
- `guardian/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P5_guardian_transport-ff368c143d948ffb.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/` · 14 files</summary>

- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/AN1_anchor_node_capture.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/CLI1_headless_dispatch_via_mesh.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/TR1_repo_derived_agentId_in_dispatch.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/TX1_converge_the_three_transports.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/UI1_one_file_per_ui_area.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/UI1_progress_2026_09_23.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/UI2_downloads_manager_chat_view.phase`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/AN1_anchor_node_capture-b26c7c736581b2bd.graph`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/CLI1_headless_dispatch_via_mesh-361e4ee667b1a789.graph`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/TR1_repo_derived_agentId_in_dispatch-5c03d66d2ea72bc7.graph`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/TX1_converge_the_three_transports-8d100320582a910a.graph`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/UI1_one_file_per_ui_area-8e0014e69c3c248b.graph`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/UI1_progress_2026_09_23-040c4016ec196fff.graph`
- `guardian/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/UI2_downloads_manager_chat_view-a1b9b83ad247406b.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-26-guardian-retry-novelty-and-installs/` · 4 files</summary>

- `guardian/phases/2026-09-26-guardian-retry-novelty-and-installs/R1.phase`
- `guardian/phases/2026-09-26-guardian-retry-novelty-and-installs/T1.phase`
- `guardian/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/R1-3c37b05f3eb39ced.graph`
- `guardian/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/T1-a15775f6e0b048ee.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-27-agent-hat-memory-download-manager/` · 2 files</summary>

- `guardian/phases/2026-09-27-agent-hat-memory-download-manager/G3.phase`
- `guardian/phases/2026-09-27-agent-hat-memory-download-manager/graph/G3-9e1fa9749c4f73cd.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-27-one-idearium-phases-living-spec-nodes/` · 2 files</summary>

- `guardian/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X2_guardian_hat_agent.phase`
- `guardian/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X2_guardian_hat_agent-03ec77b2152e6de4.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-27-registry-harness-and-stability/` · 2 files</summary>

- `guardian/phases/2026-09-27-registry-harness-and-stability/S1.phase`
- `guardian/phases/2026-09-27-registry-harness-and-stability/graph/S1-e58044a67741c0ac.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-28-graph-build-context-settings-memory/` · 4 files</summary>

- `guardian/phases/2026-09-28-graph-build-context-settings-memory/M4.phase`
- `guardian/phases/2026-09-28-graph-build-context-settings-memory/SV3.phase`
- `guardian/phases/2026-09-28-graph-build-context-settings-memory/graph/M4-02b0ddec35827cc4.graph`
- `guardian/phases/2026-09-28-graph-build-context-settings-memory/graph/SV3-221b311c3eb9b080.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-29-build-surface/` · 2 files</summary>

- `guardian/phases/2026-09-29-build-surface/BS16_provider_login_wall.phase`
- `guardian/phases/2026-09-29-build-surface/graph/BS16_provider_login_wall-b6c1499352b07bb4.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-29-provider-economy/` · 2 files</summary>

- `guardian/phases/2026-09-29-provider-economy/EC6_guardian_enforcement.phase`
- `guardian/phases/2026-09-29-provider-economy/graph/EC6_guardian_enforcement-f302afba554cf0ff.graph`

</details>

<details>
<summary>`guardian/phases/2026-09-29-tool-layers-and-pane-memory/` · 2 files</summary>

- `guardian/phases/2026-09-29-tool-layers-and-pane-memory/P6.phase`
- `guardian/phases/2026-09-29-tool-layers-and-pane-memory/graph/P6-5880174cc33d421b.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-01-work-visibility-job-reuse/` · 2 files</summary>

- `guardian/phases/2026-10-01-work-visibility-job-reuse/J1.phase`
- `guardian/phases/2026-10-01-work-visibility-job-reuse/graph/J1-1e8293ee40b537f7.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-02-emerge-field-memory-build/` · 2 files</summary>

- `guardian/phases/2026-10-02-emerge-field-memory-build/GA1_guardian_source_of_truth.phase`
- `guardian/phases/2026-10-02-emerge-field-memory-build/graph/GA1_guardian_source_of_truth-ccca30879096d636.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-02-workshop-codex-rewind/` · 2 files</summary>

- `guardian/phases/2026-10-02-workshop-codex-rewind/GD1_guardian_supervises_cos.phase`
- `guardian/phases/2026-10-02-workshop-codex-rewind/graph/GD1_guardian_supervises_cos-1d0485d9b5519bbc.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-07-runtime-load/` · 4 files</summary>

- `guardian/phases/2026-10-07-runtime-load/PF3_append_not_rewrite.phase`
- `guardian/phases/2026-10-07-runtime-load/PF4_hold_only_what_you_read.phase`
- `guardian/phases/2026-10-07-runtime-load/graph/PF3_append_not_rewrite-ae5e13b4f39fc2d6.graph`
- `guardian/phases/2026-10-07-runtime-load/graph/PF4_hold_only_what_you_read-e035361560d2d6d0.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-09-hardening-pass/` · 16 files</summary>

- `guardian/phases/2026-10-09-hardening-pass/HP11_a_reply_on_the_page_is_never_sent_again.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP13_the_failure_is_put_at_the_right_gate.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP14_a_tab_that_does_not_take_the_job_is_said_in_seconds.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP15_a_typed_prompt_is_never_sent_again.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP16_a_job_nobody_waits_for_is_not_sent_later.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP17_no_tab_is_said_in_seconds.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP21_the_economy_holding_a_job_is_said.phase`
- `guardian/phases/2026-10-09-hardening-pass/HP22_a_missing_tab_is_not_a_login_wall.phase`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP11_a_reply_on_the_page_is_never_sent_again-fefc2312b6a59efa.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP13_the_failure_is_put_at_the_right_gate-17395f231ced9d63.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP14_a_tab_that_does_not_take_the_job_is_said_in_seconds-484cb9512f837f5a.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP15_a_typed_prompt_is_never_sent_again-5c7b24fc42656fde.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP16_a_job_nobody_waits_for_is_not_sent_later-2655911d9edadb7f.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP17_no_tab_is_said_in_seconds-9bc532dfbe78e5c6.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP21_the_economy_holding_a_job_is_said-987bfbb18c496d42.graph`
- `guardian/phases/2026-10-09-hardening-pass/graph/HP22_a_missing_tab_is_not_a_login_wall-7116d27e8a0491f4.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-09-one-model-engine/` · 2 files</summary>

- `guardian/phases/2026-10-09-one-model-engine/ME9_the_layers_below_report.phase`
- `guardian/phases/2026-10-09-one-model-engine/graph/ME9_the_layers_below_report-cd11715c75119ecd.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-10-copilot-talk-to-nexus/` · 2 files</summary>

- `guardian/phases/2026-10-10-copilot-talk-to-nexus/TN1.phase`
- `guardian/phases/2026-10-10-copilot-talk-to-nexus/graph/TN1-6f462d9a0ad9d3e2.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-10-idearium-solid/` · 4 files</summary>

- `guardian/phases/2026-10-10-idearium-solid/SD15_no_website_can_drive_nexus.phase`
- `guardian/phases/2026-10-10-idearium-solid/SD3_the_person_goes_first.phase`
- `guardian/phases/2026-10-10-idearium-solid/graph/SD15_no_website_can_drive_nexus-c5838680af6ae20a.graph`
- `guardian/phases/2026-10-10-idearium-solid/graph/SD3_the_person_goes_first-244b6541848ccd0b.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-10-self-awareness/` · 2 files</summary>

- `guardian/phases/2026-10-10-self-awareness/AW1_guardian_reflected_in_nodes.phase`
- `guardian/phases/2026-10-10-self-awareness/graph/AW1_guardian_reflected_in_nodes-c659f7d61e4da4c9.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-12-browser-providers-and-work/` · 2 files</summary>

- `guardian/phases/2026-10-12-browser-providers-and-work/PV3_input_nodes.phase`
- `guardian/phases/2026-10-12-browser-providers-and-work/graph/PV3_input_nodes-73528fe4f1a5e74b.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-15-code-tab-run-state/` · 4 files</summary>

- `guardian/phases/2026-10-15-code-tab-run-state/CE10_lost_jobs_fall_back.phase`
- `guardian/phases/2026-10-15-code-tab-run-state/CE4_reply_kind_and_tags.phase`
- `guardian/phases/2026-10-15-code-tab-run-state/graph/CE10_lost_jobs_fall_back-75cbbf1b8a77a1aa.graph`
- `guardian/phases/2026-10-15-code-tab-run-state/graph/CE4_reply_kind_and_tags-98f434cfcf498822.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-16-proposal-evidence/` · 10 files</summary>

- `guardian/phases/2026-10-16-proposal-evidence/PE4_rejection_context.phase`
- `guardian/phases/2026-10-16-proposal-evidence/PE5_show_it.phase`
- `guardian/phases/2026-10-16-proposal-evidence/PE6_tests_first.phase`
- `guardian/phases/2026-10-16-proposal-evidence/PE7_comparison_engine.phase`
- `guardian/phases/2026-10-16-proposal-evidence/PE8_learn.phase`
- `guardian/phases/2026-10-16-proposal-evidence/graph/PE4_rejection_context-f5ec69ca26ebcfda.graph`
- `guardian/phases/2026-10-16-proposal-evidence/graph/PE5_show_it-cd4648aa33c9f614.graph`
- `guardian/phases/2026-10-16-proposal-evidence/graph/PE6_tests_first-4997403b606e1628.graph`
- `guardian/phases/2026-10-16-proposal-evidence/graph/PE7_comparison_engine-97b6ca5d0f989aea.graph`
- `guardian/phases/2026-10-16-proposal-evidence/graph/PE8_learn-46caf2fc3643edf1.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-17-failure-mode-report/` · 2 files</summary>

- `guardian/phases/2026-10-17-failure-mode-report/FMR5_replay_routes.phase`
- `guardian/phases/2026-10-17-failure-mode-report/graph/FMR5_replay_routes-fbcdf4cf365d0b2c.graph`

</details>

<details>
<summary>`guardian/phases/2026-10-19-pipeline-root-causes/` · 3 files</summary>

- `guardian/phases/2026-10-19-pipeline-root-causes/RC5_find_where_the_label_enters.phase`
- `guardian/phases/2026-10-19-pipeline-root-causes/graph/RC5_find_where_the_label_enters-bd2fa8c8c5ea9078.graph`
- `guardian/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC5_find_where_the_label_enters-c11e275559f4451a.graph`

</details>

<details>
<summary>`guardian/phases/copilot-omniscience/` · 2 files</summary>

- `guardian/phases/copilot-omniscience/P4_guardian_tool_loop.phase`
- `guardian/phases/copilot-omniscience/graph/P4_guardian_tool_loop-c8dd2f30f0b16d44.graph`

</details>

<details>
<summary>`guardian/phases/nexus-observability-tablet/` · 2 files</summary>

- `guardian/phases/nexus-observability-tablet/OB2_gap_detection_diagnostic.phase`
- `guardian/phases/nexus-observability-tablet/graph/OB2_gap_detection_diagnostic-94d6f60ae9374459.graph`

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

59 release notes name a file of guardian: 0.60.225., 0.60.208., 0.60.205., 0.60.191., 0.60.158., 0.60.149., 0.60.148., 0.60.146., 0.60.143., 0.60.133., 0.60.132., 0.60.131., 0.60.130., 0.60.124., 0.60.120., 0.60.113., 0.60.100., 0.60.70., 0.60.28., 0.60.15., 0.60.10., 0.60.2., 0.60.0., 0.59.15., 0.57.0., 0.54.0., 0.42.0., 0.41.0., 0.40.1., 0.39.335., 0.39.282., 0.39.281., 0.39.279., 0.39.278., 0.39.269., 0.39.268., 0.39.267., 0.39.266., 0.39.263., 0.39.256., and 19 older. Each is in the version history below, in his words.

<!-- generated:readme:system:guardian:end -->

### idearium

Where work begins and where this page lives. `idearium/api/index.js` on :4800 serves ideas, brainstorms, specs, repos and their compartments, and `idearium/ui/` is the whole Idearium interface: Welcome and Repos, where each repo opens into 12 tabs: Home, Idea, Files, Architect, Spec (the living spec), Phases (every phasemap as one manager), Intelligence, Agent, Debug, Versionium, Sync & CI and Settings, then Create (Brainstorm, Ideas) and Build (the Architect block canvas, the Spec Builder; the Eravos canvas until 0.60.83), which belong to the open repo. The Agent tab is the repo's own agent, a hat forged for that one project that answers on Ollama, through copilot or through a browser agent, remembers its work in the Clear Glass download manager, and proposes its code as injects. `idearium/ui/js/app.js` is the interface, `idearium/ui/js/nexus-atlas.js` renders this atlas, `idearium/ui/js/compartment.js` draws compartments, and `idearium/ui/js/agent-blocks.js` edits exactly what an agent is sent.

The spec engine in `idearium/spec-engine/` turns an idea into a spec by chunking it into blocks (`idearium/spec-engine/blocks.yaml`), dispatching each chunk to guardian (`idearium/spec-engine/chunk-dispatch.js`), and planning a file tree first when asked. The repo layer in `idearium/repo/` imports, snapshots, watches and graphs repos; `idearium/repo/nexus-self.js` is what makes NEXUS one of them. Its spec is `idearium/spec/idearium.spec`, with the roadmap and graph specs beside it. The next zoom level is `idearium-atlas.md`.

<!-- generated:readme:system:idearium:start -->
#### idearium: every module and every file

Idearium is 993 files in 108 modules, entry `idearium/api/index.js`, port 4800, spec `idearium/spec/idearium.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/idearium-atlas.md`.

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
<summary>`idearium/phases/` · 1 file</summary>

- `idearium/phases/INDEX.md` — idearium — its phases

</details>

<details>
<summary>`idearium/phases/2026-08-28-definition-of-complete/` · 6 files</summary>

- `idearium/phases/2026-08-28-definition-of-complete/DOD1_fully_autonomous.phase`
- `idearium/phases/2026-08-28-definition-of-complete/DOD3_build_using_idearium.phase`
- `idearium/phases/2026-08-28-definition-of-complete/DOD7_tested_using_cos.phase`
- `idearium/phases/2026-08-28-definition-of-complete/graph/DOD1_fully_autonomous-e5fd79a1162932ba.graph`
- `idearium/phases/2026-08-28-definition-of-complete/graph/DOD3_build_using_idearium-081cb2e45bf759cd.graph`
- `idearium/phases/2026-08-28-definition-of-complete/graph/DOD7_tested_using_cos-a31ec4e8442ad5dc.graph`

</details>

<details>
<summary>`idearium/phases/2026-08-28-self-building-pipeline/` · 2 files</summary>

- `idearium/phases/2026-08-28-self-building-pipeline/SBP1_reconcile_repo_layer_vs_cos_compartment.phase`
- `idearium/phases/2026-08-28-self-building-pipeline/graph/SBP1_reconcile_repo_layer_vs_cos_compartment-811af61fec93be21.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/` · 2 files</summary>

- `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/LM19_atlas_spec_coverage_prerequisite.phase`
- `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM19_atlas_spec_coverage_prerequisite-8a1244b9d4b5690b.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/` · 2 files</summary>

- `idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/ID2_verify_idearium_reconciliation_reads_right_store.phase`
- `idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/ID2_verify_idearium_reconciliation_reads_right_store-3298f9ee81c629d7.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-11-compartment-nodetype-and-reorg/` · 2 files</summary>

- `idearium/phases/2026-09-11-compartment-nodetype-and-reorg/T2_idearium_genesis_alignment.phase`
- `idearium/phases/2026-09-11-compartment-nodetype-and-reorg/graph/T2_idearium_genesis_alignment-155669da42eb09b4.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-13-axiom-5-2-raid-routing/` · 2 files</summary>

- `idearium/phases/2026-09-13-axiom-5-2-raid-routing/MCO7_map_real_proxy_traffic.phase`
- `idearium/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO7_map_real_proxy_traffic-5b0ac9cdc5f323dc.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/` · 4 files</summary>

- `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/N1.phase`
- `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T6.phase`
- `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/N1-3390cee61d2ebd05.graph`
- `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T6-3810abea7c97f392.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/` · 2 files</summary>

- `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/I1.phase`
- `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/I1-3e215fa27c0ef67b.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-27-agent-hat-memory-download-manager/` · 6 files</summary>

- `idearium/phases/2026-09-27-agent-hat-memory-download-manager/G5.phase`
- `idearium/phases/2026-09-27-agent-hat-memory-download-manager/H3.phase`
- `idearium/phases/2026-09-27-agent-hat-memory-download-manager/M5.phase`
- `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/G5-48560a4db949405d.graph`
- `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/H3-0ab7eb9f0c2f66ba.graph`
- `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/M5-757541e5426618eb.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-27-components-store-and-atlases/` · 4 files</summary>

- `idearium/phases/2026-09-27-components-store-and-atlases/A3.phase`
- `idearium/phases/2026-09-27-components-store-and-atlases/C2.phase`
- `idearium/phases/2026-09-27-components-store-and-atlases/graph/A3-0b6cdaaf9610556c.graph`
- `idearium/phases/2026-09-27-components-store-and-atlases/graph/C2-cd615ce780f27fd5.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-27-idearium-atlas/` · 6 files</summary>

- `idearium/phases/2026-09-27-idearium-atlas/A1.phase`
- `idearium/phases/2026-09-27-idearium-atlas/A3.phase`
- `idearium/phases/2026-09-27-idearium-atlas/A4.phase`
- `idearium/phases/2026-09-27-idearium-atlas/graph/A1-07c090325d3ac0fe.graph`
- `idearium/phases/2026-09-27-idearium-atlas/graph/A3-45d18c7975a04b6f.graph`
- `idearium/phases/2026-09-27-idearium-atlas/graph/A4-05516e0391cf85cd.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/` · 14 files</summary>

- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/N1_one_idearium.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P2_phases_model.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P3_phase_build.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P4_phases_ui.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/S1_living_spec.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/S2_spec_tab.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/V2_nexus_versionium_view.phase`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/N1_one_idearium-5fda47e81740f919.graph`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P2_phases_model-816d5f0b94fe19d0.graph`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P3_phase_build-bb6a1484090698da.graph`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P4_phases_ui-35f5c870235cabfb.graph`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/S1_living_spec-54457ecfb317ec4d.graph`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/S2_spec_tab-13a6b256674ca997.graph`
- `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/V2_nexus_versionium_view-68284806b8692565.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-27-registry-harness-and-stability/` · 14 files</summary>

- `idearium/phases/2026-09-27-registry-harness-and-stability/H2.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/H3.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/H4.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/H5.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/S2.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/S3.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/S4.phase`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H2-37211885df010962.graph`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H3-017eb2a36885874c.graph`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H4-92d77964b48812eb.graph`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H5-03cc29d13bf3176d.graph`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/S2-a5388d560a488d09.graph`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/S3-de417ceb54735a28.graph`
- `idearium/phases/2026-09-27-registry-harness-and-stability/graph/S4-d3b6ee7978d85cca.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-28-graph-build-context-settings-memory/` · 20 files</summary>

- `idearium/phases/2026-09-28-graph-build-context-settings-memory/B0.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/B3.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/C0.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/G0.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/G1.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/G2.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/G3.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/R1.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/R2.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/SV0.phase`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/B0-933386e010c3ebb1.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/B3-d58404b70218a8eb.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/C0-32aeb3adb8f9dce3.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G0-a214982f7f87efc5.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G1-f85015d13bbbc49d.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G2-0901ec7498435dd0.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G3-528cf353349dea70.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/R1-ec37c4f3de4fb0de.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/R2-626eb489d1376cbe.graph`
- `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/SV0-52bc14057534aec7.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-29-build-surface/` · 24 files</summary>

- `idearium/phases/2026-09-29-build-surface/BS10_settings_and_environment_ui.phase`
- `idearium/phases/2026-09-29-build-surface/BS11_plan_panel.phase`
- `idearium/phases/2026-09-29-build-surface/BS13_provider_sovereignty.phase`
- `idearium/phases/2026-09-29-build-surface/BS15_code_repo_delete.phase`
- `idearium/phases/2026-09-29-build-surface/BS18_sync_ci_theme.phase`
- `idearium/phases/2026-09-29-build-surface/BS2_file_states.phase`
- `idearium/phases/2026-09-29-build-surface/BS3_baseline_deviation.phase`
- `idearium/phases/2026-09-29-build-surface/BS5_spec_to_phasemap.phase`
- `idearium/phases/2026-09-29-build-surface/BS6_build_plan.phase`
- `idearium/phases/2026-09-29-build-surface/BS7_api.phase`
- `idearium/phases/2026-09-29-build-surface/BS8_files_ui.phase`
- `idearium/phases/2026-09-29-build-surface/BS9_spec_and_phase_build_ui.phase`
- `idearium/phases/2026-09-29-build-surface/graph/BS10_settings_and_environment_ui-e7b1f0a8ff8eb8f9.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS11_plan_panel-90c293ef2576305c.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS13_provider_sovereignty-a2118e304b33e3d9.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS15_code_repo_delete-adf5a2f3bb4f53af.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS18_sync_ci_theme-58d5e571901660d4.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS2_file_states-f0c78c53f55cc0ca.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS3_baseline_deviation-caf5c578ba0ab542.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS5_spec_to_phasemap-3d49ffccdcc03a7d.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS6_build_plan-d849379e83770f3b.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS7_api-557eb6b884c71f12.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS8_files_ui-c46c3ff81f3ff946.graph`
- `idearium/phases/2026-09-29-build-surface/graph/BS9_spec_and_phase_build_ui-1dcee63c429e1ed4.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-29-nex-node-store/` · 6 files</summary>

- `idearium/phases/2026-09-29-nex-node-store/N12_ui.phase`
- `idearium/phases/2026-09-29-nex-node-store/N16_settings_without_iframes.phase`
- `idearium/phases/2026-09-29-nex-node-store/N25_manage_button_enterprise.phase`
- `idearium/phases/2026-09-29-nex-node-store/graph/N12_ui-278ef4d8f071d90f.graph`
- `idearium/phases/2026-09-29-nex-node-store/graph/N16_settings_without_iframes-81ecfb6e1dbf2207.graph`
- `idearium/phases/2026-09-29-nex-node-store/graph/N25_manage_button_enterprise-76b8735454ef17a9.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-29-provider-economy/` · 2 files</summary>

- `idearium/phases/2026-09-29-provider-economy/EC8_economy_console.phase`
- `idearium/phases/2026-09-29-provider-economy/graph/EC8_economy_console-1d70149370aba577.graph`

</details>

<details>
<summary>`idearium/phases/2026-09-30-idearium-coding-flow/` · 8 files</summary>

- `idearium/phases/2026-09-30-idearium-coding-flow/W2_plan_always_lands.phase`
- `idearium/phases/2026-09-30-idearium-coding-flow/W3_work_surface.phase`
- `idearium/phases/2026-09-30-idearium-coding-flow/W4_navigation.phase`
- `idearium/phases/2026-09-30-idearium-coding-flow/W5_theme_and_css.phase`
- `idearium/phases/2026-09-30-idearium-coding-flow/graph/W2_plan_always_lands-ab26ca62c4c01f00.graph`
- `idearium/phases/2026-09-30-idearium-coding-flow/graph/W3_work_surface-d22aa3fd5498f953.graph`
- `idearium/phases/2026-09-30-idearium-coding-flow/graph/W4_navigation-5dd9ebc74f199860.graph`
- `idearium/phases/2026-09-30-idearium-coding-flow/graph/W5_theme_and_css-ec86ed1c0f589dd1.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-01-idearium-agent-ready-master/` · 60 files</summary>

- `idearium/phases/2026-10-01-idearium-agent-ready-master/BK1_blocked_is_actionable.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/BK2_phase_build_writes_code.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/DK2_desktop_setup_popup.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/DT3_failure_modes_routes_and_preflight.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/DT4_registry_block_to_nodes.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/DT4b_registry_chunk_in_repo_chunking.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/IL1_spec_library_as_ideas.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/IL2_library_spec_into_the_pipeline.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF1_sync_names_its_slow_step.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF2_yielding_ingest.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF4_manifest_meta_sidecar.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF5_in_place_spec_update.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF6_boot_sync_yields_to_the_person.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF7_pipeline_scoped_to_changes.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PF8_settings_console_one_cheap_read.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PV2_repair_feedback.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PV3_prove_loop.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/PV4_cli_and_ui.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/SW1_spec_workshop.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/TP1_promote_to_spec_templates.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI10_debug_and_intelligence_one_tab.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI11_nav_and_look_restored.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI1_history_and_save_in_manage.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI2_desktop_environment_menu.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI3_settings_tab_retheme_collapse.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI5_work_surface_from_contracts.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI6_idea_and_phases_one_tab.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI7_phasemaps_out_of_files_and_tree_ops.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI8_code_tab_is_code.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/UI9_plan_and_work_surface_panels.phase`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/BK1_blocked_is_actionable-01332261b8dcdc42.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/BK2_phase_build_writes_code-44c59481c9cd44ba.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/DK2_desktop_setup_popup-334decc7beb3a1fe.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/DT3_failure_modes_routes_and_preflight-16167e797e66f7b5.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/DT4_registry_block_to_nodes-4c6a53201ba84026.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/DT4b_registry_chunk_in_repo_chunking-8d3fc5c82176532b.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/IL1_spec_library_as_ideas-562cd46bda388a55.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/IL2_library_spec_into_the_pipeline-db5333e7b31f7131.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF1_sync_names_its_slow_step-a427008df9c74099.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF2_yielding_ingest-9f9a7bc28177655b.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF4_manifest_meta_sidecar-406969092594bed8.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF5_in_place_spec_update-ffc0ff73206feef3.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF6_boot_sync_yields_to_the_person-f8e349719667eff2.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF7_pipeline_scoped_to_changes-74c2988f7fb0dbb6.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PF8_settings_console_one_cheap_read-8b3388d417799343.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PV2_repair_feedback-048005a4daa6896a.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PV3_prove_loop-1b213b5688552009.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/PV4_cli_and_ui-5720214899fed175.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/SW1_spec_workshop-72769d08ce74fe9f.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/TP1_promote_to_spec_templates-6373324428f83107.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI10_debug_and_intelligence_one_tab-d3d4f4ec84151974.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI11_nav_and_look_restored-bf1ee50b5fb1fd60.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI1_history_and_save_in_manage-a01c5d1997949e6a.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI2_desktop_environment_menu-4272919c36d8ef27.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI3_settings_tab_retheme_collapse-ccdf3a127c208ee6.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI5_work_surface_from_contracts-c718624c129a0cae.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI6_idea_and_phases_one_tab-3d173a75197812ed.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI7_phasemaps_out_of_files_and_tree_ops-44303ff60d0f06bc.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI8_code_tab_is_code-cfa6aff53868c372.graph`
- `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/UI9_plan_and_work_surface_panels-6013a07a8ca625f2.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-01-routing-registry-genesis/` · 12 files</summary>

- `idearium/phases/2026-10-01-routing-registry-genesis/GN1_genesis.phase`
- `idearium/phases/2026-10-01-routing-registry-genesis/RC1_registry_block.phase`
- `idearium/phases/2026-10-01-routing-registry-genesis/RC2_registry_as_nodes.phase`
- `idearium/phases/2026-10-01-routing-registry-genesis/RG2_routing_config_api_cli.phase`
- `idearium/phases/2026-10-01-routing-registry-genesis/RG3_dispatch_uses_the_route.phase`
- `idearium/phases/2026-10-01-routing-registry-genesis/RG4_routing_ui.phase`
- `idearium/phases/2026-10-01-routing-registry-genesis/graph/GN1_genesis-9c19816095e79246.graph`
- `idearium/phases/2026-10-01-routing-registry-genesis/graph/RC1_registry_block-54c0652a67274b90.graph`
- `idearium/phases/2026-10-01-routing-registry-genesis/graph/RC2_registry_as_nodes-89682c310007557f.graph`
- `idearium/phases/2026-10-01-routing-registry-genesis/graph/RG2_routing_config_api_cli-8fdd3d0d4da406d6.graph`
- `idearium/phases/2026-10-01-routing-registry-genesis/graph/RG3_dispatch_uses_the_route-d3d17279f019b332.graph`
- `idearium/phases/2026-10-01-routing-registry-genesis/graph/RG4_routing_ui-0480ecf02ae62d8c.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-01-work-visibility-job-reuse/` · 10 files</summary>

- `idearium/phases/2026-10-01-work-visibility-job-reuse/D0.phase`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/D2.phase`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/J2.phase`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/J3.phase`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/J6.phase`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/D0-c46d86f5fed6ba44.graph`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/D2-0622afce43bf66fc.graph`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/J2-2dbf1ea4ae7e7b8c.graph`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/J3-7c8a64dbe9e7d597.graph`
- `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/J6-e6e3f0df4bcd8345.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-02-emerge-field-memory-build/` · 26 files</summary>

- `idearium/phases/2026-10-02-emerge-field-memory-build/CB1_cfr_build_logic.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/DA1_domain_agnostic_end_states.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/FV0_fulfil_a_taken_order.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/FV1_client_jobs.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/GL1_the_graphs_as_a_model.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/LN1_lenses_on_the_canvas.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/MR6_contradictions_held.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/PH1_phase_runs_end_in_proof.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/PR1_proof_run_the_delivery_checker.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/RC1_the_repo_main_chat.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/ST1_settings.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/UI0_the_stations_agree.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/WS6_workshop_parts_and_modes.phase`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/CB1_cfr_build_logic-5bec749cb555f4e2.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/DA1_domain_agnostic_end_states-6b50e373c633cffb.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/FV0_fulfil_a_taken_order-848e1bff5519633a.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/FV1_client_jobs-662e29c3c4d7c409.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/GL1_the_graphs_as_a_model-590458d74b8d9a0a.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/LN1_lenses_on_the_canvas-792316b31766a3f3.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/MR6_contradictions_held-66efe147c088270c.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/PH1_phase_runs_end_in_proof-9ce02babee77ae98.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/PR1_proof_run_the_delivery_checker-621112f06399821f.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/RC1_the_repo_main_chat-f42bc647bfb8ea76.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/ST1_settings-c4d6d286b5d353b4.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/UI0_the_stations_agree-70ddba11613a1584.graph`
- `idearium/phases/2026-10-02-emerge-field-memory-build/graph/WS6_workshop_parts_and_modes-c8e779005ab897fb.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-02-fractal-graph-any-size-agent/` · 14 files</summary>

- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG1_containment_tree.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG3_summaries_up_the_tree.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG4_context_for_any_agent.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG5_recursive_build.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG6_relations_and_fractals.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/UV1_versioned_ui_compartments.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/WS5_the_whole_workshop.phase`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG1_containment_tree-aaca074a00f1ef2c.graph`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG3_summaries_up_the_tree-b2a59b562ac95c2c.graph`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG4_context_for_any_agent-b0b88cad66b15693.graph`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG5_recursive_build-b8e78a1fd1f50e1a.graph`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG6_relations_and_fractals-8a43ab6d43bbcebd.graph`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/UV1_versioned_ui_compartments-6876460bb288b810.graph`
- `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/WS5_the_whole_workshop-be72ff97f0f348b3.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-02-spatial-void/` · 12 files</summary>

- `idearium/phases/2026-10-02-spatial-void/V1_fonts_local.phase`
- `idearium/phases/2026-10-02-spatial-void/V2_void_engine.phase`
- `idearium/phases/2026-10-02-spatial-void/V3_ideas_carry_the_void.phase`
- `idearium/phases/2026-10-02-spatial-void/V4_routes_and_cli.phase`
- `idearium/phases/2026-10-02-spatial-void/V5_the_page.phase`
- `idearium/phases/2026-10-02-spatial-void/V6_replaces_ideas_and_brainstorm.phase`
- `idearium/phases/2026-10-02-spatial-void/graph/V1_fonts_local-032a1c9ee94025d4.graph`
- `idearium/phases/2026-10-02-spatial-void/graph/V2_void_engine-92fad98a05ccf78f.graph`
- `idearium/phases/2026-10-02-spatial-void/graph/V3_ideas_carry_the_void-d03b7633ea5d2bc2.graph`
- `idearium/phases/2026-10-02-spatial-void/graph/V4_routes_and_cli-a9f04ac36a0b6f1c.graph`
- `idearium/phases/2026-10-02-spatial-void/graph/V5_the_page-598efc9ae1916e6f.graph`
- `idearium/phases/2026-10-02-spatial-void/graph/V6_replaces_ideas_and_brainstorm-c80f4e0208c7a97c.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-02-synthesis-zoom-versionium/` · 6 files</summary>

- `idearium/phases/2026-10-02-synthesis-zoom-versionium/AZ1_semantic_zoom.phase`
- `idearium/phases/2026-10-02-synthesis-zoom-versionium/VX1_versionium_degrades_not_crashes.phase`
- `idearium/phases/2026-10-02-synthesis-zoom-versionium/WS3_the_pipeline_together.phase`
- `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/AZ1_semantic_zoom-4803c502f673ce60.graph`
- `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/VX1_versionium_degrades_not_crashes-4b86fc459aa038cf.graph`
- `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/WS3_the_pipeline_together-1d67e5ca764d0db6.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-02-workshop-codex-rewind/` · 20 files</summary>

- `idearium/phases/2026-10-02-workshop-codex-rewind/AR2_architect_in_the_workshop.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/AR3_one_architect_canvas.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/AR4_pipeline_architect_on_the_canvas.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/AR5_repo_architect_on_the_canvas.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/DP1_desktop_popout_options.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/PL1_one_entry_point.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/SW1_spec_workshop.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/SW2_workshop_page_in_the_voids_style.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/UI12_workshop_surface.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/WS7_the_full_workshop.phase`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR2_architect_in_the_workshop-32d0b6cc32026023.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR3_one_architect_canvas-78c9c0ecdde06280.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR4_pipeline_architect_on_the_canvas-cec156eb688fb013.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR5_repo_architect_on_the_canvas-c7fee44243c248cf.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/DP1_desktop_popout_options-e73c4e98f5f196a7.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/PL1_one_entry_point-140d09417fa111f5.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/SW1_spec_workshop-143188e3446aa061.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/SW2_workshop_page_in_the_voids_style-acac3b974a3233a1.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/UI12_workshop_surface-005dd01e2ba96ba8.graph`
- `idearium/phases/2026-10-02-workshop-codex-rewind/graph/WS7_the_full_workshop-7115b04f434c37ca.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-build-from-the-spec/` · 58 files</summary>

- `idearium/phases/2026-10-05-build-from-the-spec/CH1_compartment_charter.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB10_reuse_first_keyed_on_the_contract.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB11_each_block_chunked.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB12_the_registry_is_the_component_list.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB13_each_component_chunked.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB14_reuse_compounds.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB16_genesis_nodes_domain.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB17_the_system_template_is_complete.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB18_the_system_template_is_used.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB1_templates_are_the_default_frame.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB26_an_imported_project_shows_its_progress.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB27_expanding_a_repo_keeps_its_spec_and_phases_current.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB28_genesis_in_the_shape_nexus_systems_have.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB29_the_build_flow_in_his_order.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB2_his_words_seed_the_spec.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB30_the_template_is_a_skeleton.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB31_every_new_repo_is_the_skeleton_the_idea_slots_in.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB35_the_index_is_there_when_the_agent_asks.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB3_the_section_prompt_is_domain_agnostic.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB44_phases_are_chunked_then_coded.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB45_skeletons_grey_until_coded.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB49_an_idea_runs_through_by_itself.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB4_template_fidelity.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB50_every_task_timestamped.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB51_a_phase_built_in_chunks.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB52_proven_on_the_proposed_code.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB8_promote_with_full_block_options.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/SB9_the_spec_is_a_spec_file.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/WS2_the_work_surface_streams_the_writing.phase`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/CH1_compartment_charter-3faf15b7b007ec19.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB10_reuse_first_keyed_on_the_contract-9422db472ab6bb14.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB11_each_block_chunked-c80702c27e56d8d4.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB12_the_registry_is_the_component_list-663b7c8d93d31c6f.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB13_each_component_chunked-ee3c5820b2bc2761.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB14_reuse_compounds-b122c110a18dd51b.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB16_genesis_nodes_domain-c9ee88ad2a876a14.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB17_the_system_template_is_complete-3da27595c5dc5343.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB18_the_system_template_is_used-518b2cbff03e266a.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB1_templates_are_the_default_frame-90e92a3e0e88e5e1.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB26_an_imported_project_shows_its_progress-7ddc383988ffdfbc.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB27_expanding_a_repo_keeps_its_spec_and_phases_current-2f6ef3f3a636044e.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB28_genesis_in_the_shape_nexus_systems_have-34ff7104d20a1a90.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB29_the_build_flow_in_his_order-7a9f4dc3ffde4f9b.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB2_his_words_seed_the_spec-c38006264a07413e.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB30_the_template_is_a_skeleton-22cd72ac9008bd9b.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB31_every_new_repo_is_the_skeleton_the_idea_slots_in-a632e63c0a0c153d.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB35_the_index_is_there_when_the_agent_asks-c03d44f4b918532e.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB3_the_section_prompt_is_domain_agnostic-3b5793a0e3e8bb58.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB44_phases_are_chunked_then_coded-e4aee8b08443f21c.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB45_skeletons_grey_until_coded-a6b4f44b25b6f1db.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB49_an_idea_runs_through_by_itself-9272ab6662f32a97.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB4_template_fidelity-b5cd3fe3d598abc0.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB50_every_task_timestamped-31bb47cf8a30809d.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB51_a_phase_built_in_chunks-d52a77216aaefbe3.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB52_proven_on_the_proposed_code-e7942c807caa456b.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB8_promote_with_full_block_options-59a2cc99ce55bb7c.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/SB9_the_spec_is_a_spec_file-2a0075e7f7a66b99.graph`
- `idearium/phases/2026-10-05-build-from-the-spec/graph/WS2_the_work_surface_streams_the_writing-6b554fb740867279.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-cli-data-code/` · 10 files</summary>

- `idearium/phases/2026-10-05-cli-data-code/CL2_the_agent_tab_is_the_endpoint.phase`
- `idearium/phases/2026-10-05-cli-data-code/CT2_the_code_tab.phase`
- `idearium/phases/2026-10-05-cli-data-code/LS3_one_feed_for_every_agent.phase`
- `idearium/phases/2026-10-05-cli-data-code/LS4_live_in_the_code_tab_and_the_work_surface.phase`
- `idearium/phases/2026-10-05-cli-data-code/PB2_a_reply_that_changed_nothing_is_incomplete.phase`
- `idearium/phases/2026-10-05-cli-data-code/graph/CL2_the_agent_tab_is_the_endpoint-cd07a65975c0f372.graph`
- `idearium/phases/2026-10-05-cli-data-code/graph/CT2_the_code_tab-4c5f7f3919966700.graph`
- `idearium/phases/2026-10-05-cli-data-code/graph/LS3_one_feed_for_every_agent-cbe6c8256329685a.graph`
- `idearium/phases/2026-10-05-cli-data-code/graph/LS4_live_in_the_code_tab_and_the_work_surface-02a22b8ffa0fbdc1.graph`
- `idearium/phases/2026-10-05-cli-data-code/graph/PB2_a_reply_that_changed_nothing_is_incomplete-cd4f2e31ab5e8a36.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-code-tab-and-one-router/` · 10 files</summary>

- `idearium/phases/2026-10-05-code-tab-and-one-router/CT3_the_code_tab_is_the_work_surface.phase`
- `idearium/phases/2026-10-05-code-tab-and-one-router/CT4_ollama_checked_on_his_machine.phase`
- `idearium/phases/2026-10-05-code-tab-and-one-router/CT5_hooked_into_the_plan.phase`
- `idearium/phases/2026-10-05-code-tab-and-one-router/CT7_the_plan_shows_current_work.phase`
- `idearium/phases/2026-10-05-code-tab-and-one-router/CT9_the_plan_pull_tab.phase`
- `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT3_the_code_tab_is_the_work_surface-05771164854f548f.graph`
- `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT4_ollama_checked_on_his_machine-1d3a38b45bcc1514.graph`
- `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT5_hooked_into_the_plan-d3f933a20724f93e.graph`
- `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT7_the_plan_shows_current_work-a52abee8ded7dd97.graph`
- `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT9_the_plan_pull_tab-c7ffc8d1f1c7dacb.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-failure-reproduction/` · 2 files</summary>

- `idearium/phases/2026-10-05-failure-reproduction/FM4_the_report.phase`
- `idearium/phases/2026-10-05-failure-reproduction/graph/FM4_the_report-e488e3464b6c5db8.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-idea-to-spec-workshop/` · 12 files</summary>

- `idearium/phases/2026-10-05-idea-to-spec-workshop/WK1_the_workshop_is_blocks_from_the_templates.phase`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/WK2_templates_edited_saved_removed.phase`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/WK3_the_agent_drafts_every_block.phase`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/WK4_the_void_feeds_the_workshop.phase`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/WK5_lanes_feed_gaps_and_phases.phase`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/WK6_enterprise_grade.phase`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK1_the_workshop_is_blocks_from_the_templates-7118b38fec612014.graph`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK2_templates_edited_saved_removed-c001b523d5755bdc.graph`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK3_the_agent_drafts_every_block-06035725e06b5b37.graph`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK4_the_void_feeds_the_workshop-239d2f058e122ae9.graph`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK5_lanes_feed_gaps_and_phases-600c57b241fdd5b2.graph`
- `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK6_enterprise_grade-0d8254a618965546.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-spec-workshop-rebuild/` · 14 files</summary>

- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS10_the_phases_tab_rebuilt.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS11_workshop_and_phases_one_surface.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS4_the_pipeline_on_warp2.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS5_the_template_picker.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS6_the_workshop_as_the_editor.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS7_architect_and_blueprint_stations.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/RS9_the_thread.phase`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS10_the_phases_tab_rebuilt-2b8342c245cb1a43.graph`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS11_workshop_and_phases_one_surface-0c60b2ce6d21565f.graph`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS4_the_pipeline_on_warp2-1b500110a3a75d95.graph`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS5_the_template_picker-2047af4e58c842c4.graph`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS6_the_workshop_as_the_editor-65ed3468201e5940.graph`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS7_architect_and_blueprint_stations-a3f6ef1273789a83.graph`
- `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS9_the_thread-f06ed39fcd8adc6f.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-05-verified-primitives/` · 2 files</summary>

- `idearium/phases/2026-10-05-verified-primitives/VP7_the_settings_tab_in_categories.phase`
- `idearium/phases/2026-10-05-verified-primitives/graph/VP7_the_settings_tab_in_categories-bde114aa4d10f923.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-07-compartment-control-and-activity/` · 12 files</summary>

- `idearium/phases/2026-10-07-compartment-control-and-activity/AL2_log_tab.phase`
- `idearium/phases/2026-10-07-compartment-control-and-activity/BO1_brainos_reads_the_log.phase`
- `idearium/phases/2026-10-07-compartment-control-and-activity/CM1_every_capability_a_command.phase`
- `idearium/phases/2026-10-07-compartment-control-and-activity/CM3_this_sessions_work_as_commands.phase`
- `idearium/phases/2026-10-07-compartment-control-and-activity/NC2_nexus_systems_as_compartments.phase`
- `idearium/phases/2026-10-07-compartment-control-and-activity/UI1_the_screens_for_cm3.phase`
- `idearium/phases/2026-10-07-compartment-control-and-activity/graph/AL2_log_tab-4edf93608071f912.graph`
- `idearium/phases/2026-10-07-compartment-control-and-activity/graph/BO1_brainos_reads_the_log-8567a373d208f9e7.graph`
- `idearium/phases/2026-10-07-compartment-control-and-activity/graph/CM1_every_capability_a_command-7b012b7934a26bf1.graph`
- `idearium/phases/2026-10-07-compartment-control-and-activity/graph/CM3_this_sessions_work_as_commands-65881101a8767d62.graph`
- `idearium/phases/2026-10-07-compartment-control-and-activity/graph/NC2_nexus_systems_as_compartments-bd7a70b20d504253.graph`
- `idearium/phases/2026-10-07-compartment-control-and-activity/graph/UI1_the_screens_for_cm3-66b98ef97a9f4405.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-07-idearium-one-surface/` · 16 files</summary>

- `idearium/phases/2026-10-07-idearium-one-surface/OS2_the_plan_panel_holds_it.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/OS3_the_code_tab_knows_its_history.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/OS4_every_agent_option_in_the_agent_tab.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/OS5_settings_without_iframes.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/OS7_one_proposal_surface.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/OS8_settings_agents_holds_every_agent_option.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/SP1_phases_from_the_sections.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/SP2_complete_the_blanks.phase`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/OS2_the_plan_panel_holds_it-7c79a17a177f132e.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/OS3_the_code_tab_knows_its_history-0b3333775435ecb5.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/OS4_every_agent_option_in_the_agent_tab-e7ab294fffd58bff.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/OS5_settings_without_iframes-17bd8eab79f40c3b.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/OS7_one_proposal_surface-ecf19282ae895337.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/OS8_settings_agents_holds_every_agent_option-b98ee2ed7bced97d.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/SP1_phases_from_the_sections-74d13d62a255e6a3.graph`
- `idearium/phases/2026-10-07-idearium-one-surface/graph/SP2_complete_the_blanks-77fd5cd417d72e25.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-07-system-expectations/` · 6 files</summary>

- `idearium/phases/2026-10-07-system-expectations/EX3_the_diagnostic_reads_expectations.phase`
- `idearium/phases/2026-10-07-system-expectations/EX4_intelligence_learns_the_normal.phase`
- `idearium/phases/2026-10-07-system-expectations/EX5_time_to_breach.phase`
- `idearium/phases/2026-10-07-system-expectations/graph/EX3_the_diagnostic_reads_expectations-2bec3e78837d68f5.graph`
- `idearium/phases/2026-10-07-system-expectations/graph/EX4_intelligence_learns_the_normal-5991de2b3e18f190.graph`
- `idearium/phases/2026-10-07-system-expectations/graph/EX5_time_to_breach-cb016f9887da62f8.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-07-versionium-releases/` · 6 files</summary>

- `idearium/phases/2026-10-07-versionium-releases/RN1_release_is_a_node_and_a_tag.phase`
- `idearium/phases/2026-10-07-versionium-releases/RN3_releases_section.phase`
- `idearium/phases/2026-10-07-versionium-releases/VR1_every_change_a_commit.phase`
- `idearium/phases/2026-10-07-versionium-releases/graph/RN1_release_is_a_node_and_a_tag-ac55d5c78a92cf41.graph`
- `idearium/phases/2026-10-07-versionium-releases/graph/RN3_releases_section-4141ba7fc63cd48b.graph`
- `idearium/phases/2026-10-07-versionium-releases/graph/VR1_every_change_a_commit-14c51a8423588640.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-09-hardening-pass/` · 14 files</summary>

- `idearium/phases/2026-10-09-hardening-pass/HP10_the_work_surface_in_view.phase`
- `idearium/phases/2026-10-09-hardening-pass/HP1_stale_spreads_along_dependencies.phase`
- `idearium/phases/2026-10-09-hardening-pass/HP2_interrupted_runs_are_said.phase`
- `idearium/phases/2026-10-09-hardening-pass/HP3_the_ladder_climbs_only_what_is_installed.phase`
- `idearium/phases/2026-10-09-hardening-pass/HP6_the_build_surface_opens.phase`
- `idearium/phases/2026-10-09-hardening-pass/HP8_the_ladder_says_why_ollama_is_missing.phase`
- `idearium/phases/2026-10-09-hardening-pass/HP9_the_plan_is_current_work.phase`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP10_the_work_surface_in_view-f1241943f37108b2.graph`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP1_stale_spreads_along_dependencies-9df169732afe005e.graph`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP2_interrupted_runs_are_said-79dee1361e48c6a2.graph`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP3_the_ladder_climbs_only_what_is_installed-c8c7d13d9c60af92.graph`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP6_the_build_surface_opens-cb6c79f8c844d719.graph`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP8_the_ladder_says_why_ollama_is_missing-57815805593abe9b.graph`
- `idearium/phases/2026-10-09-hardening-pass/graph/HP9_the_plan_is_current_work-f627db089c793902.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-09-one-model-engine/` · 2 files</summary>

- `idearium/phases/2026-10-09-one-model-engine/ME11_old_settings_translated.phase`
- `idearium/phases/2026-10-09-one-model-engine/graph/ME11_old_settings_translated-5b0ec7fc75e2ad91.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-09-one-roadmap/` · 2 files</summary>

- `idearium/phases/2026-10-09-one-roadmap/OR4_one_roadmap_in_idearium.phase`
- `idearium/phases/2026-10-09-one-roadmap/graph/OR4_one_roadmap_in_idearium-eccb05a79ab9f7b3.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-10-idearium-access/` · 12 files</summary>

- `idearium/phases/2026-10-10-idearium-access/IA0_the_door_checks_who_is_asking.phase`
- `idearium/phases/2026-10-10-idearium-access/IA1_the_routes.phase`
- `idearium/phases/2026-10-10-idearium-access/IA2_the_command.phase`
- `idearium/phases/2026-10-10-idearium-access/IA3_the_screens.phase`
- `idearium/phases/2026-10-10-idearium-access/IA6_every_local_caller_carries_the_key.phase`
- `idearium/phases/2026-10-10-idearium-access/IA7_the_hat_is_the_actor.phase`
- `idearium/phases/2026-10-10-idearium-access/graph/IA0_the_door_checks_who_is_asking-e61c74f72a1e0e07.graph`
- `idearium/phases/2026-10-10-idearium-access/graph/IA1_the_routes-524b4ed85ce0024b.graph`
- `idearium/phases/2026-10-10-idearium-access/graph/IA2_the_command-447eafe8b6ed97e1.graph`
- `idearium/phases/2026-10-10-idearium-access/graph/IA3_the_screens-84728ca7fed20a3f.graph`
- `idearium/phases/2026-10-10-idearium-access/graph/IA6_every_local_caller_carries_the_key-48cf449554a93a5a.graph`
- `idearium/phases/2026-10-10-idearium-access/graph/IA7_the_hat_is_the_actor-cff039c2c9e53264.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-10-idearium-solid/` · 22 files</summary>

- `idearium/phases/2026-10-10-idearium-solid/SD11_the_desktop_inside_idearium.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD12_a_spec_starts_from_its_primitives.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD14_chunks_cut_at_primitives.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD16_a_plan_step_never_proposes_code.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD17_an_imported_project_continues.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD18_mastermind_ready.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD19_a_refusal_goes_back_to_its_agent.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD1_rewind_and_versions_on_the_repo_card.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD21_what_his_run_log_showed.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD22_a_wrapped_repo_lifts_to_its_root.phase`
- `idearium/phases/2026-10-10-idearium-solid/SD6_an_idea_logged_asked_expanded.phase`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD11_the_desktop_inside_idearium-355bfb9bb8b0c1e5.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD12_a_spec_starts_from_its_primitives-5f1332ad4be21d47.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD14_chunks_cut_at_primitives-9c0e825565000d6e.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD16_a_plan_step_never_proposes_code-15a5817d56c7df8e.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD17_an_imported_project_continues-ca41b1efd7fa26c1.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD18_mastermind_ready-0605b1ba0a0ed196.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD19_a_refusal_goes_back_to_its_agent-5ef0ac81785ee32f.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD1_rewind_and_versions_on_the_repo_card-2652c3fb731ca33b.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD21_what_his_run_log_showed-b16c046b8f39cc7d.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD22_a_wrapped_repo_lifts_to_its_root-790d3ecb08212ea7.graph`
- `idearium/phases/2026-10-10-idearium-solid/graph/SD6_an_idea_logged_asked_expanded-05cd4cbce953cad2.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-10-self-awareness/` · 2 files</summary>

- `idearium/phases/2026-10-10-self-awareness/AW5_its_own_face.phase`
- `idearium/phases/2026-10-10-self-awareness/graph/AW5_its_own_face-e328b4fcf66e26af.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-10-shape-of-nexus/` · 8 files</summary>

- `idearium/phases/2026-10-10-shape-of-nexus/FN1_the_field_as_commands.phase`
- `idearium/phases/2026-10-10-shape-of-nexus/OP2_the_system_settings_in_its_repo.phase`
- `idearium/phases/2026-10-10-shape-of-nexus/OP3_copilot_reads_and_sets_options.phase`
- `idearium/phases/2026-10-10-shape-of-nexus/OP4_environment_and_desktop_one_menu.phase`
- `idearium/phases/2026-10-10-shape-of-nexus/graph/FN1_the_field_as_commands-97a9854ac7d50136.graph`
- `idearium/phases/2026-10-10-shape-of-nexus/graph/OP2_the_system_settings_in_its_repo-a31db0f4424409aa.graph`
- `idearium/phases/2026-10-10-shape-of-nexus/graph/OP3_copilot_reads_and_sets_options-32a68d26ad74f22e.graph`
- `idearium/phases/2026-10-10-shape-of-nexus/graph/OP4_environment_and_desktop_one_menu-f9648ccd1a2a07d5.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-12-browser-providers-and-work/` · 6 files</summary>

- `idearium/phases/2026-10-12-browser-providers-and-work/CS1_drop_zips_to_decompose.phase`
- `idearium/phases/2026-10-12-browser-providers-and-work/CS2_uploaded_projects_managed.phase`
- `idearium/phases/2026-10-12-browser-providers-and-work/MX1_nothing_built_unmapped.phase`
- `idearium/phases/2026-10-12-browser-providers-and-work/graph/CS1_drop_zips_to_decompose-122d522bc936da0d.graph`
- `idearium/phases/2026-10-12-browser-providers-and-work/graph/CS2_uploaded_projects_managed-494c0ceef6476375.graph`
- `idearium/phases/2026-10-12-browser-providers-and-work/graph/MX1_nothing_built_unmapped-eebb2de339d0afaf.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-12-request-spine/` · 4 files</summary>

- `idearium/phases/2026-10-12-request-spine/RQ12_the_phase_dag.phase`
- `idearium/phases/2026-10-12-request-spine/RQ25_progress_is_evidence_not_activity.phase`
- `idearium/phases/2026-10-12-request-spine/graph/RQ12_the_phase_dag-657be08a0225c679.graph`
- `idearium/phases/2026-10-12-request-spine/graph/RQ25_progress_is_evidence_not_activity-20b27d207cb31ec8.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-13-identities-tabs-and-automation/` · 2 files</summary>

- `idearium/phases/2026-10-13-identities-tabs-and-automation/IR0_intent_routing_for_reasoning.phase`
- `idearium/phases/2026-10-13-identities-tabs-and-automation/graph/IR0_intent_routing_for_reasoning-d117c137eb21d499.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-13-nexus-memory-gates-and-contract/` · 2 files</summary>

- `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/LN0_lines_tool.phase`
- `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/graph/LN0_lines_tool-88358d2f2c9e4f7e.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-13-projects-raid-and-gates/` · 11 files</summary>

- `idearium/phases/2026-10-13-projects-raid-and-gates/NT0_notes.phase`
- `idearium/phases/2026-10-13-projects-raid-and-gates/PL1_many_projects_at_once.phase`
- `idearium/phases/2026-10-13-projects-raid-and-gates/PL5_specs_become_the_roadmap.phase`
- `idearium/phases/2026-10-13-projects-raid-and-gates/RD2_idearium_routes_through_raid.phase`
- `idearium/phases/2026-10-13-projects-raid-and-gates/VM0_versionium_managed_per_repo.phase`
- `idearium/phases/2026-10-13-projects-raid-and-gates/graph/NT0_notes-6b7863af6bf2d475.graph`
- `idearium/phases/2026-10-13-projects-raid-and-gates/graph/PL1_many_projects_at_once-1adf76c32de48afd.graph`
- `idearium/phases/2026-10-13-projects-raid-and-gates/graph/PL5_specs_become_the_roadmap-494bc4384547022a.graph`
- `idearium/phases/2026-10-13-projects-raid-and-gates/graph/RD2_idearium_routes_through_raid-2983b6458a4a5d56.graph`
- `idearium/phases/2026-10-13-projects-raid-and-gates/graph/VM0_versionium_managed_per_repo-040fc109a1d5cee4.graph`
- `idearium/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/PL5_specs_become_the_roadmap-1b3e39b06f431b10.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-15-automatic-tracking/` · 2 files</summary>

- `idearium/phases/2026-10-15-automatic-tracking/CP1_the_contract_panel.phase`
- `idearium/phases/2026-10-15-automatic-tracking/graph/CP1_the_contract_panel-c237d6f98a19ae59.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-15-code-tab-run-state/` · 19 files</summary>

- `idearium/phases/2026-10-15-code-tab-run-state/CE11_contract_panel_and_context.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CE6_one_tab.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CE7_ai_assisted_editing.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CE8_the_cli_reads_the_surface.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CE9_the_panels.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CV1_one_menu.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CV3_file_rewind.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CV4_tagged_history.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/CV6_phases_in_idearium.phase`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CE11_contract_panel_and_context-1c20d408c33edd4a.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CE6_one_tab-cd0e8325ed28c665.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CE7_ai_assisted_editing-78ed53aff1a36f1d.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CE8_the_cli_reads_the_surface-0aea42978ca6e896.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CE9_the_panels-e21c35e06e99c19e.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CV1_one_menu-ee95a78a4705be68.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CV3_file_rewind-b559809f1fb359df.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CV4_tagged_history-bf93d47b9e08cca2.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/CV6_phases_in_idearium-46e06b29cc567261.graph`
- `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/CV6_phases_in_idearium-219944fafb6e0b35.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-15-gate-held-work/` · 2 files</summary>

- `idearium/phases/2026-10-15-gate-held-work/GW9_the_contract_panel.phase`
- `idearium/phases/2026-10-15-gate-held-work/graph/GW9_the_contract_panel-cab4409f3fc2daed.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-15-one-contract-raid-releases/` · 6 files</summary>

- `idearium/phases/2026-10-15-one-contract-raid-releases/BR1_bricks_on_every_path.phase`
- `idearium/phases/2026-10-15-one-contract-raid-releases/RD1_every_build_goes_through_raid.phase`
- `idearium/phases/2026-10-15-one-contract-raid-releases/RN3_releases_in_idearium.phase`
- `idearium/phases/2026-10-15-one-contract-raid-releases/graph/BR1_bricks_on_every_path-7f1e4cefe519e0ea.graph`
- `idearium/phases/2026-10-15-one-contract-raid-releases/graph/RD1_every_build_goes_through_raid-393f8766ca06b8e6.graph`
- `idearium/phases/2026-10-15-one-contract-raid-releases/graph/RN3_releases_in_idearium-1b5d6979e4dd7138.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-15-warp-builds-and-spec-framework/` · 4 files</summary>

- `idearium/phases/2026-10-15-warp-builds-and-spec-framework/MP2_automatic_in_every_repo.phase`
- `idearium/phases/2026-10-15-warp-builds-and-spec-framework/MP4_a_model_only_where_nothing_maps.phase`
- `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP2_automatic_in_every_repo-bf38793cc2c63870.graph`
- `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP4_a_model_only_where_nothing_maps-caa26af1fd162af7.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-agent-work-funnel/` · 2 files</summary>

- `idearium/phases/2026-10-16-agent-work-funnel/FN4_the_screen.phase`
- `idearium/phases/2026-10-16-agent-work-funnel/graph/FN4_the_screen-ebe40a77dd865050.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-canvas-compartments/` · 2 files</summary>

- `idearium/phases/2026-10-16-canvas-compartments/CN4_workshop_templates.phase`
- `idearium/phases/2026-10-16-canvas-compartments/graph/CN4_workshop_templates-ca880b9d3e8fd1e4.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-code-tab-rebuild/` · 22 files</summary>

- `idearium/phases/2026-10-16-code-tab-rebuild/DK2_the_dock.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB0_decisions.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB2_persistence_audit.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB3_close_the_persistence_gaps.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB4a_recall_in_the_dispatcher.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB4b_nexus_recall_tool.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB4c_measure.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB5_tab_shell.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB6_files_changes_plans_cos_tabs.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB7a_edges_recorded.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/TB7b_keep_every_step.phase`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/DK2_the_dock-fab19127bc19d5c2.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB0_decisions-9af0f76e404926bf.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB2_persistence_audit-dc51aa7374ac0e10.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB3_close_the_persistence_gaps-84bee17604195980.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB4a_recall_in_the_dispatcher-9adab27152f90da2.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB4b_nexus_recall_tool-0850a81b6d5d8bbf.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB4c_measure-a6559845267cef0c.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB5_tab_shell-45459c6b9780f0d9.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB6_files_changes_plans_cos_tabs-53d029fe85983028.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB7a_edges_recorded-69330154410e55a9.graph`
- `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB7b_keep_every_step-0195fb0a003654e7.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-cos-console/` · 2 files</summary>

- `idearium/phases/2026-10-16-cos-console/CON2_grammar_and_completion.phase`
- `idearium/phases/2026-10-16-cos-console/graph/CON2_grammar_and_completion-8bab477abc0720ae.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-durable-work-timeline/` · 2 files</summary>

- `idearium/phases/2026-10-16-durable-work-timeline/TL5_the_code_tab_timeline.phase`
- `idearium/phases/2026-10-16-durable-work-timeline/graph/TL5_the_code_tab_timeline-143fd58bcbeb02d8.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-intent-hat-agent-chain/` · 2 files</summary>

- `idearium/phases/2026-10-16-intent-hat-agent-chain/IH4_api_command_ui.phase`
- `idearium/phases/2026-10-16-intent-hat-agent-chain/graph/IH4_api_command_ui-491e5bd186c25940.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-plan-sidebar/` · 4 files</summary>

- `idearium/phases/2026-10-16-plan-sidebar/PS2_plan_panel_three_cards.phase`
- `idearium/phases/2026-10-16-plan-sidebar/PS3_the_rest_their_own_panels.phase`
- `idearium/phases/2026-10-16-plan-sidebar/graph/PS2_plan_panel_three_cards-0c8cdf906f861391.graph`
- `idearium/phases/2026-10-16-plan-sidebar/graph/PS3_the_rest_their_own_panels-c48c2855bc50e215.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-reject-learn-retry/` · 4 files</summary>

- `idearium/phases/2026-10-16-reject-learn-retry/RL2_learn_then_retry.phase`
- `idearium/phases/2026-10-16-reject-learn-retry/RL4_the_lessons_on_the_door.phase`
- `idearium/phases/2026-10-16-reject-learn-retry/graph/RL2_learn_then_retry-39af0667fca566e6.graph`
- `idearium/phases/2026-10-16-reject-learn-retry/graph/RL4_the_lessons_on_the_door-bbafadd375cd2657.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-16-repo-carve/` · 4 files</summary>

- `idearium/phases/2026-10-16-repo-carve/CV1_carve_backend_route_command_ui.phase`
- `idearium/phases/2026-10-16-repo-carve/FR9_sandboxed_in_compartments.phase`
- `idearium/phases/2026-10-16-repo-carve/graph/CV1_carve_backend_route_command_ui-e3edbcdf3d659991.graph`
- `idearium/phases/2026-10-16-repo-carve/graph/FR9_sandboxed_in_compartments-b650b1973c9adbba.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-17-debugging-product/` · 2 files</summary>

- `idearium/phases/2026-10-17-debugging-product/DP1_the_doors.phase`
- `idearium/phases/2026-10-17-debugging-product/graph/DP1_the_doors-9c5b97f48be11c5b.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-17-failure-mode-report/` · 2 files</summary>

- `idearium/phases/2026-10-17-failure-mode-report/FMR8_the_report_on_screen.phase`
- `idearium/phases/2026-10-17-failure-mode-report/graph/FMR8_the_report_on_screen-36b40641e24aae8e.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-17-pieces-not-order/` · 2 files</summary>

- `idearium/phases/2026-10-17-pieces-not-order/PC5_control_when_he_chooses.phase`
- `idearium/phases/2026-10-17-pieces-not-order/graph/PC5_control_when_he_chooses-11bf61bdc8df910b.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-17-system-drawbridge/` · 18 files</summary>

- `idearium/phases/2026-10-17-system-drawbridge/DB0a_still_open.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB0b_reading.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB15_toasts_declared.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB19_genesis_sandboxed_fork.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB2_the_registry_says_what_it_offers.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB4_one_bus_per_system.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB7_the_ui_floats_on_top.phase`
- `idearium/phases/2026-10-17-system-drawbridge/DB8_agents_have_it.phase`
- `idearium/phases/2026-10-17-system-drawbridge/P33_slices.phase`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB0a_still_open-c850c4ed5b9cba3f.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB0b_reading-33012a35bf1f82ac.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB15_toasts_declared-0e1c1ccd78450583.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB19_genesis_sandboxed_fork-68f0ea951c3c9dae.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB2_the_registry_says_what_it_offers-4121727170f95b81.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB4_one_bus_per_system-2212630faddc3883.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB7_the_ui_floats_on_top-3edb553849e9c3bc.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/DB8_agents_have_it-1436fb94e6e0ff14.graph`
- `idearium/phases/2026-10-17-system-drawbridge/graph/P33_slices-175c69cb48638ad2.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-18-compartment-environment/` · 4 files</summary>

- `idearium/phases/2026-10-18-compartment-environment/CE6_the_code_tab.phase`
- `idearium/phases/2026-10-18-compartment-environment/CE7_agents_and_commands.phase`
- `idearium/phases/2026-10-18-compartment-environment/graph/CE6_the_code_tab-f11d856e1aa25e18.graph`
- `idearium/phases/2026-10-18-compartment-environment/graph/CE7_agents_and_commands-cc438bb660d2012c.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-18-debugging-product/` · 4 files</summary>

- `idearium/phases/2026-10-18-debugging-product/DBG5_rewind_from_a_case.phase`
- `idearium/phases/2026-10-18-debugging-product/DBG7_route_command_ui.phase`
- `idearium/phases/2026-10-18-debugging-product/graph/DBG5_rewind_from_a_case-cfffc4ab781d68ec.graph`
- `idearium/phases/2026-10-18-debugging-product/graph/DBG7_route_command_ui-b81f989842d93bc7.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-18-gate-memory/` · 4 files</summary>

- `idearium/phases/2026-10-18-gate-memory/GM7_the_context_panel_per_gate.phase`
- `idearium/phases/2026-10-18-gate-memory/GM8_agents_have_it.phase`
- `idearium/phases/2026-10-18-gate-memory/graph/GM7_the_context_panel_per_gate-2031c0c663349829.graph`
- `idearium/phases/2026-10-18-gate-memory/graph/GM8_agents_have_it-45a73d0250d2d055.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-gate-quality-checks/` · 8 files</summary>

- `idearium/phases/2026-10-19-gate-quality-checks/GQ2_brick_gate_runs_the_test.phase`
- `idearium/phases/2026-10-19-gate-quality-checks/GQ4_phase_gate_keeps_the_test.phase`
- `idearium/phases/2026-10-19-gate-quality-checks/GQ5_command.phase`
- `idearium/phases/2026-10-19-gate-quality-checks/GQ6_ui.phase`
- `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ2_brick_gate_runs_the_test-44bd9b0fe7114c73.graph`
- `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ4_phase_gate_keeps_the_test-8d183bcb2f8535fe.graph`
- `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ5_command-176adf36740d9ccb.graph`
- `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ6_ui-60394e9276084fea.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-gig-autofill-and-learn/` · 2 files</summary>

- `idearium/phases/2026-10-19-gig-autofill-and-learn/GA5_commands_and_the_panel.phase`
- `idearium/phases/2026-10-19-gig-autofill-and-learn/graph/GA5_commands_and_the_panel-df6524bf85b1a1f6.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-idearium-control/` · 16 files</summary>

- `idearium/phases/2026-10-19-idearium-control/CT0_code_tab_census.phase`
- `idearium/phases/2026-10-19-idearium-control/CT1_fewer_wider_tabs.phase`
- `idearium/phases/2026-10-19-idearium-control/FM1_file_manager.phase`
- `idearium/phases/2026-10-19-idearium-control/FM2_stores_in_the_files_tab.phase`
- `idearium/phases/2026-10-19-idearium-control/IM1_ideas_and_notes_as_one.phase`
- `idearium/phases/2026-10-19-idearium-control/PC1_phase_controls.phase`
- `idearium/phases/2026-10-19-idearium-control/TB1_toolbox.phase`
- `idearium/phases/2026-10-19-idearium-control/VS1_versions_in_the_surface.phase`
- `idearium/phases/2026-10-19-idearium-control/graph/CT0_code_tab_census-68fe806d18a6ee3e.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/CT1_fewer_wider_tabs-454129e18b89f64d.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/FM1_file_manager-30ae3862a6fbedde.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/FM2_stores_in_the_files_tab-0cb3102874e66839.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/IM1_ideas_and_notes_as_one-b11d0d8dc6b1eec4.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/PC1_phase_controls-530560b20a4638d0.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/TB1_toolbox-573f4e5a75544e59.graph`
- `idearium/phases/2026-10-19-idearium-control/graph/VS1_versions_in_the_surface-2f948ae931b8b5ff.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-infrastructure-spine/` · 4 files</summary>

- `idearium/phases/2026-10-19-infrastructure-spine/IN3a_build_stands_on_the_registry.phase`
- `idearium/phases/2026-10-19-infrastructure-spine/IN8_any_size.phase`
- `idearium/phases/2026-10-19-infrastructure-spine/graph/IN3a_build_stands_on_the_registry-a6693c99336de552.graph`
- `idearium/phases/2026-10-19-infrastructure-spine/graph/IN8_any_size-93a371269b367b64.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-pipeline-root-causes/` · 18 files</summary>

- `idearium/phases/2026-10-19-pipeline-root-causes/DG3_the_whole_dag.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/DG4_nexus_maps_meet_the_standard.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/DG5_dag_in_the_brief_and_the_ui.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/PR2_autofill_and_copilot_read_first.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/RC6_unowned_ollama_load.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/RC7_every_run_names_its_starter.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/UI2_version_in_code.phase`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/DG3_the_whole_dag-387f28abb7b7bfa6.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/DG4_nexus_maps_meet_the_standard-8326c3166e4620ea.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/DG5_dag_in_the_brief_and_the_ui-7c64f9ae4e29eb6a.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/PR2_autofill_and_copilot_read_first-b4ddc2d39aad8dc7.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/RC6_unowned_ollama_load-67b8e7d0ffd6cf9d.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/RC7_every_run_names_its_starter-4b99cd95537cb85c.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/UI2_version_in_code-d70b04b30efde11f.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/DG3_the_whole_dag-9cfb242403b7f8b3.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/DG3_the_whole_dag-b29958cf7cd36370.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC7_every_run_names_its_starter-e71ac0a4e3f549ec.graph`
- `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/UI2_version_in_code-a31a39722f93b060.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-solid-build-foundation/` · 8 files</summary>

- `idearium/phases/2026-10-19-solid-build-foundation/GQ2_brick_gate_runs_the_test.phase`
- `idearium/phases/2026-10-19-solid-build-foundation/GQ4_phase_gate_keeps_the_test.phase`
- `idearium/phases/2026-10-19-solid-build-foundation/SET1_autobuild_config_and_command.phase`
- `idearium/phases/2026-10-19-solid-build-foundation/SET2_autobuild_settings_ui.phase`
- `idearium/phases/2026-10-19-solid-build-foundation/graph/GQ2_brick_gate_runs_the_test-384b9e70be3b7f5b.graph`
- `idearium/phases/2026-10-19-solid-build-foundation/graph/GQ4_phase_gate_keeps_the_test-dea1678c49093827.graph`
- `idearium/phases/2026-10-19-solid-build-foundation/graph/SET1_autobuild_config_and_command-8ba4dcf5e6c54fd0.graph`
- `idearium/phases/2026-10-19-solid-build-foundation/graph/SET2_autobuild_settings_ui-c78e2af0f32b3534.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-19-upload-intent-and-page-map/` · 4 files</summary>

- `idearium/phases/2026-10-19-upload-intent-and-page-map/UP3_upload_routes_and_commands.phase`
- `idearium/phases/2026-10-19-upload-intent-and-page-map/UP4_upload_ui.phase`
- `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/UP3_upload_routes_and_commands-482f723155e730e0.graph`
- `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/UP4_upload_ui-dcd2230ed41c4df6.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-20-belief-loop/` · 3 files</summary>

- `idearium/phases/2026-10-20-belief-loop/CY3_belief_panel.phase`
- `idearium/phases/2026-10-20-belief-loop/graph/CY3_belief_panel-38cb88c35d626a37.graph`
- `idearium/phases/2026-10-20-belief-loop/graph/_superseded/CY3_belief_panel-e6a09dc8b785fe0e.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/` · 9 files</summary>

- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/CH3_chunk_inspector.phase`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GR3_graph_query_surface.phase`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GW3_gate_panel.phase`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/CH3_chunk_inspector-c8566fe9a29a7307.graph`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GR3_graph_query_surface-270c359dad6ee6b9.graph`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GW3_gate_panel-69c269bf13faff30.graph`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/CH3_chunk_inspector-99f25ae95f99935d.graph`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GR3_graph_query_surface-d0e57a5baa382165.graph`
- `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GW3_gate_panel-c9d8030a699919e0.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-21-approval-chain/` · 6 files</summary>

- `idearium/phases/2026-10-21-approval-chain/APV3_changelog_read.phase`
- `idearium/phases/2026-10-21-approval-chain/APV4_emit_on_the_ledger.phase`
- `idearium/phases/2026-10-21-approval-chain/graph/APV3_changelog_read-a8799b04b953ec28.graph`
- `idearium/phases/2026-10-21-approval-chain/graph/APV4_emit_on_the_ledger-831e03b8acdf10fc.graph`
- `idearium/phases/2026-10-21-approval-chain/graph/_superseded/APV3_changelog_read-4b56ad2bdd0f2cad.graph`
- `idearium/phases/2026-10-21-approval-chain/graph/_superseded/APV4_emit_on_the_ledger-cedb2fe875e7db6e.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-21-brainos-into-idearium/` · 17 files</summary>

- `idearium/phases/2026-10-21-brainos-into-idearium/BX2_flow_sources.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/BX3_flow_canvas.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/BX4_agents_layer.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/BX5_node_controls.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/BX6_pipeline_edit.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/BX7_automation.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/BX8_dock_panels.phase`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX2_flow_sources-0f02f30efeb426ac.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX3_flow_canvas-0cfcc543816b7eee.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX4_agents_layer-a877f16582b136ef.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX5_node_controls-18d39953f30981ae.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX6_pipeline_edit-a7874d45d8fbf5a0.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX7_automation-1f9e4c1632626090.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX8_dock_panels-13df1648e45b6aa2.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX2_flow_sources-37e364e91aef63f4.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX5_node_controls-8af169be49d40dc5.graph`
- `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX7_automation-6615544c90e45a2a.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-21-data-layout/` · 2 files</summary>

- `idearium/phases/2026-10-21-data-layout/DL4_one_repo_folder.phase`
- `idearium/phases/2026-10-21-data-layout/graph/DL4_one_repo_folder-60343e03dda1be5f.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-22-system-node-db/` · 5 files</summary>

- `idearium/phases/2026-10-22-system-node-db/ND5_every_agent_reaches_every_system.phase`
- `idearium/phases/2026-10-22-system-node-db/ND6_the_nodes_screen.phase`
- `idearium/phases/2026-10-22-system-node-db/graph/ND5_every_agent_reaches_every_system-85c309ce09d5a7d5.graph`
- `idearium/phases/2026-10-22-system-node-db/graph/ND6_the_nodes_screen-84631efc91474720.graph`
- `idearium/phases/2026-10-22-system-node-db/graph/_superseded/ND5_every_agent_reaches_every_system-f07c86902defd601.graph`

</details>

<details>
<summary>`idearium/phases/2026-10-23-self-building-loop/` · 15 files</summary>

- `idearium/phases/2026-10-23-self-building-loop/SL0_what_can_be_built_now.phase`
- `idearium/phases/2026-10-23-self-building-loop/SL10_the_pipeline_simulated.phase`
- `idearium/phases/2026-10-23-self-building-loop/SL1_a_proven_phase_closes_itself.phase`
- `idearium/phases/2026-10-23-self-building-loop/SL4_the_loop.phase`
- `idearium/phases/2026-10-23-self-building-loop/SL7_build_again_is_asked_for.phase`
- `idearium/phases/2026-10-23-self-building-loop/SL8_the_agent_maps_what_nexus_cannot.phase`
- `idearium/phases/2026-10-23-self-building-loop/graph/SL0_what_can_be_built_now-d4b7b03b3139be7f.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/SL10_the_pipeline_simulated-1acb38d7cc404522.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/SL1_a_proven_phase_closes_itself-c3e5309c4ae10c83.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/SL4_the_loop-3dcb223b8d82e43d.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/SL7_build_again_is_asked_for-0f0ab8a3543b9460.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/SL8_the_agent_maps_what_nexus_cannot-0f39da6d2b92c695.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL0_what_can_be_built_now-b32fb6604d2567f7.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL1_a_proven_phase_closes_itself-6bccee108a7faf2e.graph`
- `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL4_the_loop-25e5d0a903e2cd92.graph`

</details>

<details>
<summary>`idearium/phases/idearium-creative-repo-overhaul/` · 2 files</summary>

- `idearium/phases/idearium-creative-repo-overhaul/MCO-E_roadmap_ui.phase`
- `idearium/phases/idearium-creative-repo-overhaul/graph/MCO-E_roadmap_ui-2258bb8a5d931465.graph`

</details>

<details>
<summary>`idearium/phases/idearium-repository-overhaul/` · 14 files</summary>

- `idearium/phases/idearium-repository-overhaul/MCO-C_repo_materialize.phase`
- `idearium/phases/idearium-repository-overhaul/MCO-D_zoom_subrepo.phase`
- `idearium/phases/idearium-repository-overhaul/MCO-F_config.phase`
- `idearium/phases/idearium-repository-overhaul/MCO0_audit_real_coverage.phase`
- `idearium/phases/idearium-repository-overhaul/MCO1_graph_layer.phase`
- `idearium/phases/idearium-repository-overhaul/MCO2_verification_deepening.phase`
- `idearium/phases/idearium-repository-overhaul/MCO3_snapshot_compliance.phase`
- `idearium/phases/idearium-repository-overhaul/graph/MCO-C_repo_materialize-a03f31b0a540144f.graph`
- `idearium/phases/idearium-repository-overhaul/graph/MCO-D_zoom_subrepo-3cf6d02affb08ecc.graph`
- `idearium/phases/idearium-repository-overhaul/graph/MCO-F_config-7292893fe836f4d3.graph`
- `idearium/phases/idearium-repository-overhaul/graph/MCO0_audit_real_coverage-a2d64fda1e986d73.graph`
- `idearium/phases/idearium-repository-overhaul/graph/MCO1_graph_layer-85de28ae27e35120.graph`
- `idearium/phases/idearium-repository-overhaul/graph/MCO2_verification_deepening-6b47c1fa993010fe.graph`
- `idearium/phases/idearium-repository-overhaul/graph/MCO3_snapshot_compliance-db5a3f4597bead05.graph`

</details>

<details>
<summary>`idearium/phases/nexus-repository-system-build/` · 10 files</summary>

- `idearium/phases/nexus-repository-system-build/MCO0_audit_real_coverage.phase`
- `idearium/phases/nexus-repository-system-build/MCO1_graph_layer.phase`
- `idearium/phases/nexus-repository-system-build/MCO2_verification_deepening.phase`
- `idearium/phases/nexus-repository-system-build/MCO5_git_integration_credentials.phase`
- `idearium/phases/nexus-repository-system-build/MCO6_compartment_ownership.phase`
- `idearium/phases/nexus-repository-system-build/graph/MCO0_audit_real_coverage-d1328f345333d6df.graph`
- `idearium/phases/nexus-repository-system-build/graph/MCO1_graph_layer-bec51ffa7d78bab9.graph`
- `idearium/phases/nexus-repository-system-build/graph/MCO2_verification_deepening-385db87094adb932.graph`
- `idearium/phases/nexus-repository-system-build/graph/MCO5_git_integration_credentials-987edd70d4a2ee2a.graph`
- `idearium/phases/nexus-repository-system-build/graph/MCO6_compartment_ownership-cc8efc7174f10e2c.graph`

</details>

<details>
<summary>`idearium/repo/` · 33 files</summary>

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
- `idearium/repo/lift-root.js`
- `idearium/repo/living-spec.js`
- `idearium/repo/nexus-self.js`
- `idearium/repo/phase-mapping.js`
- `idearium/repo/phases.js`
- `idearium/repo/pipeline-events.js`
- `idearium/repo/proof-run.js`
- `idearium/repo/repo-node.js`
- `idearium/repo/roadmap-import.js`
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
<summary>`idearium/spec-engine/templates/` · 26 files</summary>

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
- `idearium/spec-engine/templates/genesis-sandboxed.spec`
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
<summary>`idearium/ui/css/` · 17 files</summary>

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
- `idearium/ui/css/upload-intent.css`
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
<summary>`idearium/ui/js/` · 39 files</summary>

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
- `idearium/ui/js/upload-intent.js`
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

135 release notes name a file of idearium: 0.60.233., 0.60.231., 0.60.230., 0.60.228., 0.60.225., 0.60.223., 0.60.222., 0.60.221., 0.60.206., 0.60.205., 0.60.203., 0.60.199., 0.60.198., 0.60.197., 0.60.196., 0.60.193., 0.60.188., 0.60.177., 0.60.168., 0.60.167., 0.60.165., 0.60.164., 0.60.163., 0.60.162., 0.60.156., 0.60.153., 0.60.151., 0.60.150., 0.60.148., 0.60.145., 0.60.143., 0.60.141., 0.60.140., 0.60.134., 0.60.132., 0.60.131., 0.60.130., 0.60.128., 0.60.127., 0.60.124., and 95 older. Each is in the version history below, in his words.

<!-- generated:readme:system:idearium:end -->

### architect

The design surface for hooks and blueprints. `architect/service.js` on :3747 boots in a fixed order (JAA, then the hook registry, then blueprints, SNR and translation, then HTTP, then registration with the orchestrator), and serves the hook registry: named, typed, wireable contracts between systems. A blueprint is a path scanned into a map of gaps and components. `architect/compile-route.js` bridges the block canvas to the spec compiler, turning canvas JSON into a compiled spec and, on request, into an Idearium spec. The canvases themselves are `architect/src/ui/arch-builder.html`, `architect/src/ui/spec-builder.html` and `architect/src/ui/alk-lattice.html`.

Its node schemas live in `architect/schemas/`, and its spec `architect/spec/architect.spec` records a three-way version drift honestly instead of hiding it. The next zoom level is `architect-atlas.md`.

<!-- generated:readme:system:architect:start -->
#### architect: every module and every file

Architect is 33 files in 7 modules, entry `architect/service.js`, port 3747, spec `architect/spec/architect.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/architect-atlas.md`.

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
<summary>`architect/phases/` · 9 files</summary>

- `architect/phases/2026-09-13-axiom-5-2-raid-routing/MCO12_architect_remaining_routes.phase`
- `architect/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO12_architect_remaining_routes-3f4e0875f3387d46.graph`
- `architect/phases/2026-09-30-idearium-coding-flow/W7_next_mapped_2026_09_30.phase`
- `architect/phases/2026-09-30-idearium-coding-flow/graph/W7_next_mapped_2026_09_30-79c974c5ac8dc850.graph`
- `architect/phases/2026-10-02-workshop-codex-rewind/BP1_destroy_and_rebuild_blueprint.phase`
- `architect/phases/2026-10-02-workshop-codex-rewind/graph/BP1_destroy_and_rebuild_blueprint-62cf850a997b6f1b.graph`
- `architect/phases/2026-10-19-infrastructure-spine/IN5_architect_mirrors_the_registry.phase`
- `architect/phases/2026-10-19-infrastructure-spine/graph/IN5_architect_mirrors_the_registry-20117e52fe90f953.graph`
- `architect/phases/INDEX.md`

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

4 release notes name a file of architect: 0.60.212., 0.60.131., 0.60.0., 0.39.299.. Each is in the version history below, in his words.

<!-- generated:readme:system:architect:end -->

### diagnostic

The system that watches the others. `diagnostic/nexus-diagnostic.js` on :7825 reads every system's ledger on a timer, computes sigma, friction and drift, detects gaps (baseline deviations, missing heartbeats, stuck queues), and serves them live. `diagnostic/lib/heal-loop.js` is the closed loop from a detected gap to a resolved one, and `diagnostic/lib/wire-integrity.js` classifies loom's dangling hooks so the boot log reports real gaps instead of hundreds of unwired root files. Since 0.60.136 (his call: diagnostic and the healer are one system) the healer lives inside it, in `diagnostic/healer/`, and its spec is `diagnostic/spec/diagnostic.spec`. Since FMR0 (built on his line as 0.60.146, on main as 0.60.150) it also answers what caused what: `diagnostic/lib/causality.js` reads the ledgers for rows that name their cause, and the failure-mode report (`docs/2026-10-17-failure-mode-report-phasemap.spec`) turns every failure into a record Nexus can replay in a COS test environment. The next zoom level is `diagnostic-atlas.md`.

<!-- generated:readme:system:diagnostic:start -->
#### diagnostic: every module and every file

Diagnostic is 58 files in 8 modules, entry `diagnostic/nexus-diagnostic.js`, port 7825, spec `diagnostic/spec/diagnostic.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/diagnostic-atlas.md`.

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
<summary>`diagnostic/phases/` · 25 files</summary>

- `diagnostic/phases/2026-08-27-event-taxonomy-and-brainstorm/ET3_clearglass_event_taxonomy.phase`
- `diagnostic/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET3_clearglass_event_taxonomy-716426b659cd5b43.graph`
- `diagnostic/phases/2026-09-28-staging-self-heal/S2.phase`
- `diagnostic/phases/2026-09-28-staging-self-heal/S5.phase`
- `diagnostic/phases/2026-09-28-staging-self-heal/graph/S2-a3384fc440fa0ce2.graph`
- `diagnostic/phases/2026-09-28-staging-self-heal/graph/S5-210d8368d0d1dec3.graph`
- `diagnostic/phases/2026-10-05-announce-pulse-repair/PR2_the_diagnostic_listens_not_polls.phase`
- `diagnostic/phases/2026-10-05-announce-pulse-repair/graph/PR2_the_diagnostic_listens_not_polls-aa9c34277977a16e.graph`
- `diagnostic/phases/2026-10-17-debugging-product/DP10_the_report_and_the_debug_tab.phase`
- `diagnostic/phases/2026-10-17-debugging-product/DP3_runtime_deviation_reaches_the_diagnostic.phase`
- `diagnostic/phases/2026-10-17-debugging-product/DP4_every_ledger_into_rfr2.phase`
- `diagnostic/phases/2026-10-17-debugging-product/DP5_the_case.phase`
- `diagnostic/phases/2026-10-17-debugging-product/DP6_reproduce_in_cos.phase`
- `diagnostic/phases/2026-10-17-debugging-product/DP7_back_to_known_good.phase`
- `diagnostic/phases/2026-10-17-debugging-product/DP8_a_proven_fix.phase`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP10_the_report_and_the_debug_tab-7b6dac6f7055e661.graph`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP3_runtime_deviation_reaches_the_diagnostic-d3704c2cf309571e.graph`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP4_every_ledger_into_rfr2-51d10e03bd0afe5c.graph`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP5_the_case-cf1e15322534ca7f.graph`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP6_reproduce_in_cos-c5f5f220559d416e.graph`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP7_back_to_known_good-ad47526edc616bb2.graph`
- `diagnostic/phases/2026-10-17-debugging-product/graph/DP8_a_proven_fix-33947ca526c2dde4.graph`
- `diagnostic/phases/2026-10-17-failure-mode-report/FMR0_causality_measured.phase`
- `diagnostic/phases/2026-10-17-failure-mode-report/graph/FMR0_causality_measured-f921952916dd5696.graph`
- `diagnostic/phases/INDEX.md`

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

9 release notes name a file of diagnostic: 0.60.207., 0.60.150., 0.60.138., 0.60.136., 0.60.131., 0.39.342., 0.39.327., 0.39.260., 0.39.173.. Each is in the version history below, in his words.

<!-- generated:readme:system:diagnostic:end -->

### intelligence

The cognition layer, consolidated from three places that had no single home. `intelligence/server.js` on :3753 serves it, and `intelligence/index.js` gathers it. CFR, the causal friction record with its field, graph, delta, sigma and ledger, is `intelligence/cfr/`; RFR2, the relational field kernel, is `intelligence/rfr2/`; the causal layer is `intelligence/causal/`; the mastermind that combines them is `intelligence/mastermind.js`; and the baseline every deviation is measured against is `intelligence/baseline.js`. Its spec, `intelligence/spec/intelligence.spec`, was written as the map-first step before any file moved. The next zoom level is `intelligence-atlas.md`.

<!-- generated:readme:system:intelligence:start -->
#### intelligence: every module and every file

Intelligence is 189 files in 60 modules, entry `intelligence/server.js`, port 3753, spec `intelligence/spec/intelligence.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/intelligence-atlas.md`.

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
<summary>`intelligence/phases/` · 1 file</summary>

- `intelligence/phases/INDEX.md` — intelligence — its phases

</details>

<details>
<summary>`intelligence/phases/2026-08-22-session-full/` · 2 files</summary>

- `intelligence/phases/2026-08-22-session-full/SF18_intelligence_becomes_a_real_system.phase`
- `intelligence/phases/2026-08-22-session-full/graph/SF18_intelligence_becomes_a_real_system-9ed23465f0df57af.graph`

</details>

<details>
<summary>`intelligence/phases/2026-08-23-backlog/` · 2 files</summary>

- `intelligence/phases/2026-08-23-backlog/BL16_per_server_configs.phase`
- `intelligence/phases/2026-08-23-backlog/graph/BL16_per_server_configs-a021f5040bbb4163.graph`

</details>

<details>
<summary>`intelligence/phases/2026-08-30-interaction-contract-context/` · 2 files</summary>

- `intelligence/phases/2026-08-30-interaction-contract-context/IC2_raid_test_env_hook.phase`
- `intelligence/phases/2026-08-30-interaction-contract-context/graph/IC2_raid_test_env_hook-6c2cc014708dd5ce.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-02-versionium-sovereign-and-cleanup/` · 2 files</summary>

- `intelligence/phases/2026-09-02-versionium-sovereign-and-cleanup/MEM1_three_tier_memory_formalized.phase`
- `intelligence/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/MEM1_three_tier_memory_formalized-9be52a539ecdbb7a.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-11-compartment-nodetype-and-reorg/` · 2 files</summary>

- `intelligence/phases/2026-09-11-compartment-nodetype-and-reorg/I1_boot_js_intelligence_routes.phase`
- `intelligence/phases/2026-09-11-compartment-nodetype-and-reorg/graph/I1_boot_js_intelligence_routes-18997881da9f86c9.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-11-sovereign-node-architecture/` · 2 files</summary>

- `intelligence/phases/2026-09-11-sovereign-node-architecture/P20_intelligence_reflexive_cfr_field.phase`
- `intelligence/phases/2026-09-11-sovereign-node-architecture/graph/P20_intelligence_reflexive_cfr_field-9c9558f07253d4ee.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-19-architect-blueprint-forge-idearium/` · 2 files</summary>

- `intelligence/phases/2026-09-19-architect-blueprint-forge-idearium/P1_reconcile_node_schema_precedent.phase`
- `intelligence/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P1_reconcile_node_schema_precedent-774ed515bc4d0e37.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/` · 6 files</summary>

- `intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/D3_snapshot.phase`
- `intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P2_intelligence_gains_routes.phase`
- `intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P7_hostile_verify_and_ship.phase`
- `intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/D3_snapshot-e5fca670ff95bc86.graph`
- `intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P2_intelligence_gains_routes-2f2eff88a31edf66.graph`
- `intelligence/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P7_hostile_verify_and_ship-1bb77afdfb5cf6af.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-28-graph-build-context-settings-memory/` · 2 files</summary>

- `intelligence/phases/2026-09-28-graph-build-context-settings-memory/M6.phase`
- `intelligence/phases/2026-09-28-graph-build-context-settings-memory/graph/M6-11c7f177b88ab4a1.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-28-staging-self-heal/` · 6 files</summary>

- `intelligence/phases/2026-09-28-staging-self-heal/S4.phase`
- `intelligence/phases/2026-09-28-staging-self-heal/S6.phase`
- `intelligence/phases/2026-09-28-staging-self-heal/S7.phase`
- `intelligence/phases/2026-09-28-staging-self-heal/graph/S4-b1f73dc53cc4c0b2.graph`
- `intelligence/phases/2026-09-28-staging-self-heal/graph/S6-d5fb158cbc0ba8f0.graph`
- `intelligence/phases/2026-09-28-staging-self-heal/graph/S7-020e2cd2cef915b4.graph`

</details>

<details>
<summary>`intelligence/phases/2026-09-29-nex-node-store/` · 2 files</summary>

- `intelligence/phases/2026-09-29-nex-node-store/N11_adopters.phase`
- `intelligence/phases/2026-09-29-nex-node-store/graph/N11_adopters-f7c6777d110dfd74.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-02-emerge-field-memory-build/` · 2 files</summary>

- `intelligence/phases/2026-10-02-emerge-field-memory-build/CF1_cfr_improved_with_rfr2.phase`
- `intelligence/phases/2026-10-02-emerge-field-memory-build/graph/CF1_cfr_improved_with_rfr2-f185d6cfdfa80ada.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-02-synthesis-zoom-versionium/` · 4 files</summary>

- `intelligence/phases/2026-10-02-synthesis-zoom-versionium/SY1_gap_synthesis_engine.phase`
- `intelligence/phases/2026-10-02-synthesis-zoom-versionium/SY2_synthesis_surfaces.phase`
- `intelligence/phases/2026-10-02-synthesis-zoom-versionium/graph/SY1_gap_synthesis_engine-042dc79969e20121.graph`
- `intelligence/phases/2026-10-02-synthesis-zoom-versionium/graph/SY2_synthesis_surfaces-aae4f3b1d0b3a1d2.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-05-failure-reproduction/` · 2 files</summary>

- `intelligence/phases/2026-10-05-failure-reproduction/FM2_a_failure_is_a_clip.phase`
- `intelligence/phases/2026-10-05-failure-reproduction/graph/FM2_a_failure_is_a_clip-a487cd62141f833a.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-10-self-awareness/` · 4 files</summary>

- `intelligence/phases/2026-10-10-self-awareness/AW0_no_guessed_causes.phase`
- `intelligence/phases/2026-10-10-self-awareness/AW3_the_field_hears_the_lifecycle.phase`
- `intelligence/phases/2026-10-10-self-awareness/graph/AW0_no_guessed_causes-d522d06f2ddb0050.graph`
- `intelligence/phases/2026-10-10-self-awareness/graph/AW3_the_field_hears_the_lifecycle-79083f2ccb474917.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-10-snapshot-compartments/` · 2 files</summary>

- `intelligence/phases/2026-10-10-snapshot-compartments/SN3_measured_by_rfr2.phase`
- `intelligence/phases/2026-10-10-snapshot-compartments/graph/SN3_measured_by_rfr2-0cf6510fcc61eccc.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-12-request-spine/` · 2 files</summary>

- `intelligence/phases/2026-10-12-request-spine/RQ26_comparison_and_drift_on_real_signals.phase`
- `intelligence/phases/2026-10-12-request-spine/graph/RQ26_comparison_and_drift_on_real_signals-4f918005e469cb46.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-15-gate-held-work/` · 2 files</summary>

- `intelligence/phases/2026-10-15-gate-held-work/GW17_friction_and_tension_per_file.phase`
- `intelligence/phases/2026-10-15-gate-held-work/graph/GW17_friction_and_tension_per_file-f7852ec8e72a97a8.graph`

</details>

<details>
<summary>`intelligence/phases/2026-10-18-gate-memory/` · 2 files</summary>

- `intelligence/phases/2026-10-18-gate-memory/GM4_the_node_lattice.phase`
- `intelligence/phases/2026-10-18-gate-memory/graph/GM4_the_node_lattice-e541a10241def49f.graph`

</details>

<details>
<summary>`intelligence/phases/agent-intelligence-loop/` · 6 files</summary>

- `intelligence/phases/agent-intelligence-loop/AP2_agent_events_to_intelligence.phase`
- `intelligence/phases/agent-intelligence-loop/AP3_strategy_dynamic_db.phase`
- `intelligence/phases/agent-intelligence-loop/AP4_intelligence_optimizes.phase`
- `intelligence/phases/agent-intelligence-loop/graph/AP2_agent_events_to_intelligence-7eaa646dd401b978.graph`
- `intelligence/phases/agent-intelligence-loop/graph/AP3_strategy_dynamic_db-0aefb3a3ab80c9af.graph`
- `intelligence/phases/agent-intelligence-loop/graph/AP4_intelligence_optimizes-8f53bceb7cf58c12.graph`

</details>

<details>
<summary>`intelligence/phases/nexus-live-mind/` · 2 files</summary>

- `intelligence/phases/nexus-live-mind/P2_snapshot_on_sigma.phase`
- `intelligence/phases/nexus-live-mind/graph/P2_snapshot_on_sigma-e9c2e2af02f2273e.graph`

</details>

<details>
<summary>`intelligence/phases/nexus-observability-tablet/` · 2 files</summary>

- `intelligence/phases/nexus-observability-tablet/OB10_sigma_role_intent_map.phase`
- `intelligence/phases/nexus-observability-tablet/graph/OB10_sigma_role_intent_map-4415c9c48a379a34.graph`

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

Ollama-bridge is 73 files in 8 modules, entry `ollama/server.js`, port 3749. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/ollama-atlas.md`.

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
<summary>`ollama/phases/` · 17 files</summary>

- `ollama/phases/2026-08-27-event-taxonomy-and-brainstorm/ET1_event_taxonomy_pattern.phase`
- `ollama/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET1_event_taxonomy_pattern-7834cc624fa6c264.graph`
- `ollama/phases/2026-09-27-agent-hat-memory-download-manager/M2.phase`
- `ollama/phases/2026-09-27-agent-hat-memory-download-manager/graph/M2-7c36941b7bccca3b.graph`
- `ollama/phases/2026-10-05-cli-data-code/LS1_the_bridge_job_holds_what_is_written_so_far.phase`
- `ollama/phases/2026-10-05-cli-data-code/graph/LS1_the_bridge_job_holds_what_is_written_so_far-22224f60f8a23d5a.graph`
- `ollama/phases/2026-10-07-ollama-recorder/OR1_one_door.phase`
- `ollama/phases/2026-10-07-ollama-recorder/OR3_the_cassette.phase`
- `ollama/phases/2026-10-07-ollama-recorder/OR4_live_and_what_if.phase`
- `ollama/phases/2026-10-07-ollama-recorder/OR5_model_vitals.phase`
- `ollama/phases/2026-10-07-ollama-recorder/graph/OR1_one_door-1fb3963d095de33b.graph`
- `ollama/phases/2026-10-07-ollama-recorder/graph/OR3_the_cassette-f2cd6cab689d5744.graph`
- `ollama/phases/2026-10-07-ollama-recorder/graph/OR4_live_and_what_if-7005c50c7012704b.graph`
- `ollama/phases/2026-10-07-ollama-recorder/graph/OR5_model_vitals-ce09fca42b652b41.graph`
- `ollama/phases/INDEX.md`
- `ollama/phases/copilot-full-capability/P10_load_balancer.phase`
- `ollama/phases/copilot-full-capability/graph/P10_load_balancer-3732489409fd4b99.graph`

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

13 release notes name a file of ollama-bridge: 0.60.209., 0.60.149., 0.60.131., 0.60.123., 0.60.10., 0.46.0., 0.39.350., 0.39.289., 0.39.274., 0.39.269., 0.39.267., 0.39.190., 0.39.181.. Each is in the version history below, in his words.

<!-- generated:readme:system:ollama-bridge:end -->

### versionium

Causal version control: temporal replay, calendar playback, sigma-gated commits. `versionium/server.js` on :3754 became a sovereign system on 2026-09-02, out of a library that lived inside cortex. `versionium/lib/engine.js` is the engine, `versionium/lib/store.js` and `versionium/lib/snapshot.js` the storage, `versionium/lib/causality.js` the causal links between commits, and `versionium/lib/files.js` the per-file versions that loom's phasemap scanner reads instead of git. Its routes are `versionium/routes/versionium.js`, `versionium/routes/files.js` and `versionium/routes/system.js`, and every sync of the `nexus` repo commits there. The next zoom level is `versionium-atlas.md`.

<!-- generated:readme:system:versionium:start -->
#### versionium: every module and every file

Versionium is 47 files in 6 modules, entry `versionium/server.js`, port 3754, spec `versionium/spec/versionium.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/versionium-atlas.md`.

<details>
<summary>`versionium/` · 6 files</summary>

- `versionium/compartment.json`
- `versionium/config.js` — real, distinct config, matching ollama/config.js's and intelligence/config.js's exact established pattern:…
- `versionium/event-taxonomy.js` — // versionium/event-taxonomy.js — real event vocabulary for the sovereign // Versionium system. Conforms to…
- `versionium/interaction-contract.json`
- `versionium/registry-components.js` — versionium/registry-components.js
- `versionium/server.js` — // 0.60.207 DL2 — James: "make each system responsible for it's own data". Its files in the root data/ come…

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
<summary>`versionium/phases/` · 15 files</summary>

- `versionium/phases/2026-09-11-compartment-nodetype-and-reorg/V1_repoint_old_versionium_refs.phase`
- `versionium/phases/2026-09-11-compartment-nodetype-and-reorg/graph/V1_repoint_old_versionium_refs-18f7f308b8d3dab0.graph`
- `versionium/phases/2026-09-11-sovereign-node-architecture/P21_versionium_causal_field.phase`
- `versionium/phases/2026-09-11-sovereign-node-architecture/graph/P21_versionium_causal_field-550fedf3badde5a5.graph`
- `versionium/phases/2026-09-28-staging-self-heal/S0.phase`
- `versionium/phases/2026-09-28-staging-self-heal/graph/S0-737ffe340934da47.graph`
- `versionium/phases/2026-10-07-versionium-releases/VR2_history_and_diff.phase`
- `versionium/phases/2026-10-07-versionium-releases/graph/VR2_history_and_diff-af17f1343ce4b473.graph`
- `versionium/phases/2026-10-10-snapshot-compartments/SN1_open_a_snapshot_as_a_compartment.phase`
- `versionium/phases/2026-10-10-snapshot-compartments/graph/SN1_open_a_snapshot_as_a_compartment-436e57c6d013f324.graph`
- `versionium/phases/2026-10-15-one-contract-raid-releases/RN1_versionium_tags_and_releases.phase`
- `versionium/phases/2026-10-15-one-contract-raid-releases/graph/RN1_versionium_tags_and_releases-176ac709020a4ba7.graph`
- `versionium/phases/INDEX.md`
- `versionium/phases/idearium-repository-overhaul/MCO-B_versionium_bridge.phase`
- `versionium/phases/idearium-repository-overhaul/graph/MCO-B_versionium_bridge-b5be98b34a3a8658.graph`

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

Copilot is 189 files in 8 modules, entry `copilot/server.js`, port 3750, spec `copilot/spec/copilot.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/copilot-atlas.md`.

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
<summary>`copilot/phases/` · 125 files</summary>

- `copilot/phases/2026-08-23-backlog/BL21_agent_mesh_real_connection.phase`
- `copilot/phases/2026-08-23-backlog/graph/BL21_agent_mesh_real_connection-82582a994731b7ce.graph`
- `copilot/phases/2026-09-01-living-model-and-autonomous-pipeline/LM18_atlas_map_each_system_first.phase`
- `copilot/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM18_atlas_map_each_system_first-3e1939e10f908db4.graph`
- `copilot/phases/2026-09-02-nexus-vision-master/CP2_copilot_learning_memory.phase`
- `copilot/phases/2026-09-02-nexus-vision-master/graph/CP2_copilot_learning_memory-a6a813f538df0a06.graph`
- `copilot/phases/2026-09-11-sovereign-node-architecture/P15_redundant_file_purge.phase`
- `copilot/phases/2026-09-11-sovereign-node-architecture/P7_copilot_ticket_queue.phase`
- `copilot/phases/2026-09-11-sovereign-node-architecture/graph/P15_redundant_file_purge-879b6ff1790cef09.graph`
- `copilot/phases/2026-09-11-sovereign-node-architecture/graph/P7_copilot_ticket_queue-b589a19081663f16.graph`
- `copilot/phases/2026-09-19-guardian-mesh-first-dispatch/T1_loop.phase`
- `copilot/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T1_loop-528376a1fb70a883.graph`
- `copilot/phases/2026-09-22-brainos-agent-suite/AS1_agent_system_tab.phase`
- `copilot/phases/2026-09-22-brainos-agent-suite/IJ1_injection_editor.phase`
- `copilot/phases/2026-09-22-brainos-agent-suite/MM1_module_manager.phase`
- `copilot/phases/2026-09-22-brainos-agent-suite/graph/AS1_agent_system_tab-4907efefd5944bb4.graph`
- `copilot/phases/2026-09-22-brainos-agent-suite/graph/IJ1_injection_editor-e4b57f2548044110.graph`
- `copilot/phases/2026-09-22-brainos-agent-suite/graph/MM1_module_manager-d3b53816c694dbec.graph`
- `copilot/phases/2026-09-26-guardian-retry-novelty-and-installs/N2.phase`
- `copilot/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/N2-03d814e87979bfea.graph`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/H1.phase`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/M3.phase`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/O1.phase`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/O2.phase`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/graph/H1-9a057fb15580f17d.graph`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/graph/M3-9ca7b4fc793e42a3.graph`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/graph/O1-78637aa71993ad81.graph`
- `copilot/phases/2026-09-27-agent-hat-memory-download-manager/graph/O2-5dc25ce343cba266.graph`
- `copilot/phases/2026-09-27-one-idearium-phases-living-spec-nodes/C1_copilot_contract.phase`
- `copilot/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/C1_copilot_contract-c7e07067de82c969.graph`
- `copilot/phases/2026-09-28-graph-build-context-settings-memory/M1.phase`
- `copilot/phases/2026-09-28-graph-build-context-settings-memory/M5.phase`
- `copilot/phases/2026-09-28-graph-build-context-settings-memory/graph/M1-f0b52b32e763c3af.graph`
- `copilot/phases/2026-09-28-graph-build-context-settings-memory/graph/M5-47f9fc2d4ac5f4ef.graph`
- `copilot/phases/2026-10-01-work-visibility-job-reuse/J7.phase`
- `copilot/phases/2026-10-01-work-visibility-job-reuse/graph/J7-58dc5b6c1cc9744f.graph`
- `copilot/phases/2026-10-02-emerge-field-memory-build/RD1_raid_complete_or_build.phase`
- `copilot/phases/2026-10-02-emerge-field-memory-build/graph/RD1_raid_complete_or_build-3aaf92a635841a37.graph`
- `copilot/phases/2026-10-05-build-from-the-spec/SB37_the_working_set_signal_to_noise.phase`
- `copilot/phases/2026-10-05-build-from-the-spec/graph/SB37_the_working_set_signal_to_noise-bd7d6f47a4d010c5.graph`
- `copilot/phases/2026-10-05-cli-data-code/LS2_copilot_sends_the_text_as_it_comes.phase`
- `copilot/phases/2026-10-05-cli-data-code/graph/LS2_copilot_sends_the_text_as_it_comes-92023bff51219ae4.graph`
- `copilot/phases/2026-10-05-verified-primitives/VP3_the_repo_model_of_the_user.phase`
- `copilot/phases/2026-10-05-verified-primitives/graph/VP3_the_repo_model_of_the_user-92bc2dd650ca2e8f.graph`
- `copilot/phases/2026-10-09-hardening-pass/HP7_a_browser_agent_gets_its_wait.phase`
- `copilot/phases/2026-10-09-hardening-pass/graph/HP7_a_browser_agent_gets_its_wait-a4195cb04cac45ee.graph`
- `copilot/phases/2026-10-10-copilot-talk-to-nexus/TN2.phase`
- `copilot/phases/2026-10-10-copilot-talk-to-nexus/TN3.phase`
- `copilot/phases/2026-10-10-copilot-talk-to-nexus/TN4.phase`
- `copilot/phases/2026-10-10-copilot-talk-to-nexus/graph/TN2-55fe5df0d8b17a28.graph`
- `copilot/phases/2026-10-10-copilot-talk-to-nexus/graph/TN3-69be44658219c6e1.graph`
- `copilot/phases/2026-10-10-copilot-talk-to-nexus/graph/TN4-bdbf333184d40c6d.graph`
- `copilot/phases/2026-10-10-idearium-solid/SD2_copilot_never_answers_ok_with_nothing.phase`
- `copilot/phases/2026-10-10-idearium-solid/graph/SD2_copilot_never_answers_ok_with_nothing-8d00d3029511847a.graph`
- `copilot/phases/2026-10-15-gate-held-work/GW4_copilot_on_the_gates.phase`
- `copilot/phases/2026-10-15-gate-held-work/graph/GW4_copilot_on_the_gates-716480a2afed4f07.graph`
- `copilot/phases/INDEX.md`
- `copilot/phases/copilot-full-capability/P11_nexus_help_tool.phase`
- `copilot/phases/copilot-full-capability/P2_never_say_no_completion.phase`
- `copilot/phases/copilot-full-capability/P6_identity_naming.phase`
- `copilot/phases/copilot-full-capability/P9_meta_systems_toolkit.phase`
- `copilot/phases/copilot-full-capability/graph/P11_nexus_help_tool-d7a1283161e7eb97.graph`
- `copilot/phases/copilot-full-capability/graph/P2_never_say_no_completion-b53237e38ad335da.graph`
- `copilot/phases/copilot-full-capability/graph/P6_identity_naming-0c33f7aab8915a01.graph`
- `copilot/phases/copilot-full-capability/graph/P9_meta_systems_toolkit-fb6fd4c9b63c1f34.graph`
- `copilot/phases/copilot-guardian-cos-expansion/GA10_copilot_capability_self_awareness.phase`
- `copilot/phases/copilot-guardian-cos-expansion/GA4_lib_meta_as_cortex_tools.phase`
- `copilot/phases/copilot-guardian-cos-expansion/GA5_history_and_spec_integrity.phase`
- `copilot/phases/copilot-guardian-cos-expansion/GA7_clear_glass_guardian_userscript_expansion.phase`
- `copilot/phases/copilot-guardian-cos-expansion/GA9_cos_expansion_via_copilot.phase`
- `copilot/phases/copilot-guardian-cos-expansion/graph/GA10_copilot_capability_self_awareness-a85de0a884ce625f.graph`
- `copilot/phases/copilot-guardian-cos-expansion/graph/GA4_lib_meta_as_cortex_tools-f334e2fccb2cff97.graph`
- `copilot/phases/copilot-guardian-cos-expansion/graph/GA5_history_and_spec_integrity-aa8b6dbf976bed84.graph`
- `copilot/phases/copilot-guardian-cos-expansion/graph/GA7_clear_glass_guardian_userscript_expansion-ff4aff7c9f9c1eb2.graph`
- `copilot/phases/copilot-guardian-cos-expansion/graph/GA9_cos_expansion_via_copilot-a05b29515f65294a.graph`
- `copilot/phases/copilot-omniscience/P1_copilot_tool_loop.phase`
- `copilot/phases/copilot-omniscience/P3_continuous_stream_to_copilot.phase`
- `copilot/phases/copilot-omniscience/P5_faculties_as_tools.phase`
- `copilot/phases/copilot-omniscience/P7_stream_to_all_systems.phase`
- `copilot/phases/copilot-omniscience/graph/P1_copilot_tool_loop-bbfc868d79c0aa22.graph`
- `copilot/phases/copilot-omniscience/graph/P3_continuous_stream_to_copilot-074a4aec5b0e38e9.graph`
- `copilot/phases/copilot-omniscience/graph/P5_faculties_as_tools-7ce0d0cbf1e459e5.graph`
- `copilot/phases/copilot-omniscience/graph/P7_stream_to_all_systems-765df9d3dc2003cb.graph`
- `copilot/phases/cortex-schema-registry/P3_observe_on_write_no_block.phase`
- `copilot/phases/cortex-schema-registry/P4_editable_surface.phase`
- `copilot/phases/cortex-schema-registry/UM2_query_on_every_path.phase`
- `copilot/phases/cortex-schema-registry/UM3_richer_capture.phase`
- `copilot/phases/cortex-schema-registry/UM4_editable_self_optimizing_surface.phase`
- `copilot/phases/cortex-schema-registry/graph/P3_observe_on_write_no_block-719d251a2203bc5e.graph`
- `copilot/phases/cortex-schema-registry/graph/P4_editable_surface-9c61c4aa8a24d3ff.graph`
- `copilot/phases/cortex-schema-registry/graph/UM2_query_on_every_path-f64a1ce92571c43c.graph`
- `copilot/phases/cortex-schema-registry/graph/UM3_richer_capture-9ad12f13bf921264.graph`
- `copilot/phases/cortex-schema-registry/graph/UM4_editable_self_optimizing_surface-9c4c844e8246ac7c.graph`
- `copilot/phases/idearium-creative-repo-overhaul/MCO-A_schemas.phase`
- `copilot/phases/idearium-creative-repo-overhaul/MCO-B_versionium_bridge.phase`
- `copilot/phases/idearium-creative-repo-overhaul/MCO-C_repo_materialize.phase`
- `copilot/phases/idearium-creative-repo-overhaul/MCO-D_zoom_subrepo.phase`
- `copilot/phases/idearium-creative-repo-overhaul/MCO-F_config.phase`
- `copilot/phases/idearium-creative-repo-overhaul/MCO-G_cicd_ssh.phase`
- `copilot/phases/idearium-creative-repo-overhaul/graph/MCO-A_schemas-afc557e1106f1140.graph`
- `copilot/phases/idearium-creative-repo-overhaul/graph/MCO-B_versionium_bridge-dc0a0680fdc16cf2.graph`
- `copilot/phases/idearium-creative-repo-overhaul/graph/MCO-C_repo_materialize-39f84f1824ac58fb.graph`
- `copilot/phases/idearium-creative-repo-overhaul/graph/MCO-D_zoom_subrepo-226e468de9139f21.graph`
- `copilot/phases/idearium-creative-repo-overhaul/graph/MCO-F_config-2b2b4a75392d248d.graph`
- `copilot/phases/idearium-creative-repo-overhaul/graph/MCO-G_cicd_ssh-08ec48531c316087.graph`
- `copilot/phases/nexus-live-mind/P4_copilot_awareness.phase`
- `copilot/phases/nexus-live-mind/P5_copilot_dynamic_and_user_aware.phase`
- `copilot/phases/nexus-live-mind/graph/P4_copilot_awareness-ccacba0791d50925.graph`
- `copilot/phases/nexus-live-mind/graph/P5_copilot_dynamic_and_user_aware-c4de9a7b4031461d.graph`
- `copilot/phases/nexus-observability-tablet/OB1_live_diagnostics.phase`
- `copilot/phases/nexus-observability-tablet/OB4_bottleneck_detection.phase`
- `copilot/phases/nexus-observability-tablet/OB6_continuous_ollama_injection.phase`
- `copilot/phases/nexus-observability-tablet/OB7_intelligence_optimization.phase`
- `copilot/phases/nexus-observability-tablet/OB8_pattern_leverage_ratio.phase`
- `copilot/phases/nexus-observability-tablet/OB9_3d_visual_map.phase`
- `copilot/phases/nexus-observability-tablet/graph/OB1_live_diagnostics-b96f43f0be72f7ee.graph`
- `copilot/phases/nexus-observability-tablet/graph/OB4_bottleneck_detection-591af951a6da1c78.graph`
- `copilot/phases/nexus-observability-tablet/graph/OB6_continuous_ollama_injection-48971e046feff0e8.graph`
- `copilot/phases/nexus-observability-tablet/graph/OB7_intelligence_optimization-7e1433b5ec9d5df9.graph`
- `copilot/phases/nexus-observability-tablet/graph/OB8_pattern_leverage_ratio-0c003c79fea3e208.graph`
- `copilot/phases/nexus-observability-tablet/graph/OB9_3d_visual_map-7aca0f52f9a1f8aa.graph`
- `copilot/phases/raid-warp-verification/P10_diagnose_and_notify.phase`
- `copilot/phases/raid-warp-verification/P9_gated_events_to_copilot.phase`
- `copilot/phases/raid-warp-verification/graph/P10_diagnose_and_notify-40f9f0bd5ff91845.graph`
- `copilot/phases/raid-warp-verification/graph/P9_gated_events_to_copilot-71cc6b1d9dcc7aa6.graph`

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

24 release notes name a file of copilot: 0.60.230., 0.60.226., 0.60.205., 0.60.182., 0.60.131., 0.60.127., 0.60.77., 0.60.70., 0.60.62., 0.60.26., 0.59.11., 0.59.6., 0.55.0., 0.39.337., 0.39.336., 0.39.330., 0.39.271., 0.39.269., 0.39.267., 0.39.256., 0.39.253., 0.39.248., 0.39.244., 0.39.188.. Each is in the version history below, in his words.

<!-- generated:readme:system:copilot:end -->

### loom

The registry authority. `loom/server.js` on :3752 serves the registry of components, hooks and wires that every other system declares into, and `loom/schema/` defines those records (`loom/schema/component.js`, `loom/schema/hook.js`, `loom/schema/wire.js`, `loom/schema/driver.js`). `loom/bootstrap.js` rebuilds the registry from source: the scanners in `loom/scanners/` find real edges, the hand maps in `loom/maps/` add the edges a scanner cannot see, and the result is checked for wires whose endpoints do not exist. The phasemap section of loom, `loom/scanners/phasemap-map.js`, is the roadmap of every system. Its spec is `loom/spec/loom.spec`, and it is the most deeply mapped system in NEXUS. The next zoom level is `loom-atlas.md`.

<!-- generated:readme:system:loom:start -->
#### loom: every module and every file

Loom is 244 files in 42 modules, entry `loom/server.js`, port 3752, spec `loom/spec/loom.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/loom-atlas.md`.

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
<summary>`loom/phases/` · 1 file</summary>

- `loom/phases/INDEX.md` — loom — its phases

</details>

<details>
<summary>`loom/phases/2026-08-22-session-full/` · 5 files</summary>

- `loom/phases/2026-08-22-session-full/SF11_phasemap_backfill.phase`
- `loom/phases/2026-08-22-session-full/SF19_loom_registry_never_auto_synced.phase`
- `loom/phases/2026-08-22-session-full/graph/SF11_phasemap_backfill-bf4299e5982fba6c.graph`
- `loom/phases/2026-08-22-session-full/graph/SF19_loom_registry_never_auto_synced-73c7fd75c8376239.graph`
- `loom/phases/2026-08-22-session-full/graph/_superseded/SF11_phasemap_backfill-36ccf0662c84b6ce.graph`

</details>

<details>
<summary>`loom/phases/2026-08-23-backlog/` · 8 files</summary>

- `loom/phases/2026-08-23-backlog/BL20_loom_map_becomes_real_visual_graph.phase`
- `loom/phases/2026-08-23-backlog/BL8_docs_consolidation.phase`
- `loom/phases/2026-08-23-backlog/BL9_per_system_phasemap_folders.phase`
- `loom/phases/2026-08-23-backlog/graph/BL20_loom_map_becomes_real_visual_graph-762077890aeb5d5d.graph`
- `loom/phases/2026-08-23-backlog/graph/BL8_docs_consolidation-f11d47b75fd95959.graph`
- `loom/phases/2026-08-23-backlog/graph/BL9_per_system_phasemap_folders-f4b6da5aabf94c14.graph`
- `loom/phases/2026-08-23-backlog/graph/_superseded/BL8_docs_consolidation-4bd638212282d840.graph`
- `loom/phases/2026-08-23-backlog/graph/_superseded/BL9_per_system_phasemap_folders-a0a3b9315f60e821.graph`

</details>

<details>
<summary>`loom/phases/2026-08-27-event-taxonomy-and-brainstorm/` · 3 files</summary>

- `loom/phases/2026-08-27-event-taxonomy-and-brainstorm/ET5_loom_event_taxonomy_map.phase`
- `loom/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET5_loom_event_taxonomy_map-9aaa3b469d6c50fc.graph`
- `loom/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/ET5_loom_event_taxonomy_map-96283cd2a039045a.graph`

</details>

<details>
<summary>`loom/phases/2026-09-01-living-model-and-autonomous-pipeline/` · 32 files</summary>

- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM11_copilot_ollama_guardian_toggle.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM12_successful_prompt_caching.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM13_guardian_agents_folder_refactor.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM15_master_settings.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM16_per_system_data_decay.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM20_atlas_schema_and_deterministic_seed.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM21_atlas_fact_extractors.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM22_atlas_structure_ledger.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM26_atlas_completeness_and_release_gate.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM2_registry_as_hub_with_watchdog.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM3_interaction_contract_wired_to_registry.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM4_per_system_tool_index.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM5_copilot_capability_zoom.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM7_agent_mesh_intent_programming.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/LM9_deterministic_agent_switch_cli.phase`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM11_copilot_ollama_guardian_toggle-209243b79f19c6f8.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM12_successful_prompt_caching-fa9d4d86415f97ee.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM13_guardian_agents_folder_refactor-6ec05f2ae6a14f52.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM15_master_settings-8efc35ac45481212.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM16_per_system_data_decay-750e2cda196b99e0.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM20_atlas_schema_and_deterministic_seed-601c13a899ed4574.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM21_atlas_fact_extractors-4fdac497540c63a7.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM22_atlas_structure_ledger-508f340855c7ea37.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM26_atlas_completeness_and_release_gate-47765d95129f3a03.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM2_registry_as_hub_with_watchdog-519224c23b9cef9e.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM3_interaction_contract_wired_to_registry-449bc0047be37e21.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM4_per_system_tool_index-86152b1c6afc3eb8.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM5_copilot_capability_zoom-9f3676d4351df0b6.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM7_agent_mesh_intent_programming-3488b61a28cf6bff.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM9_deterministic_agent_switch_cli-e66e4bcde0f0b933.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/LM20_atlas_schema_and_deterministic_seed-b4e4374b5ce1026a.graph`
- `loom/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/LM21_atlas_fact_extractors-a213471d50b5a6d7.graph`

</details>

<details>
<summary>`loom/phases/2026-09-11-compartment-nodetype-and-reorg/` · 2 files</summary>

- `loom/phases/2026-09-11-compartment-nodetype-and-reorg/T4_cos_role_confirmed.phase`
- `loom/phases/2026-09-11-compartment-nodetype-and-reorg/graph/T4_cos_role_confirmed-73888c5f227ef76d.graph`

</details>

<details>
<summary>`loom/phases/2026-09-19-architect-blueprint-forge-idearium/` · 11 files</summary>

- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/P2_decide_D1_D2_D3.phase`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/P3_architect_canvas_onto_loom_registry.phase`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/P4_blueprint_as_canvas_mode.phase`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/P5_forge_as_phasemap_view.phase`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/P6_idearium_build_authority.phase`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P2_decide_D1_D2_D3-adc3df99c5a9096d.graph`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P3_architect_canvas_onto_loom_registry-0b52d656863e5839.graph`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P4_blueprint_as_canvas_mode-03cf72ff64e11941.graph`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P5_forge_as_phasemap_view-afc40acee5a4b7cc.graph`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P6_idearium_build_authority-6a967cacc9231f14.graph`
- `loom/phases/2026-09-19-architect-blueprint-forge-idearium/graph/_superseded/P5_forge_as_phasemap_view-041a2d8cb63aeaa0.graph`

</details>

<details>
<summary>`loom/phases/2026-09-27-one-idearium-phases-living-spec-nodes/` · 3 files</summary>

- `loom/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P1_phasemap_list_form.phase`
- `loom/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P1_phasemap_list_form-8e17fb4800a62ea5.graph`
- `loom/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/P1_phasemap_list_form-fd8d361ec32dabe0.graph`

</details>

<details>
<summary>`loom/phases/2026-09-27-registry-harness-and-stability/` · 2 files</summary>

- `loom/phases/2026-09-27-registry-harness-and-stability/H1.phase`
- `loom/phases/2026-09-27-registry-harness-and-stability/graph/H1-d8a53b79e9f88d89.graph`

</details>

<details>
<summary>`loom/phases/2026-09-28-graph-build-context-settings-memory/` · 2 files</summary>

- `loom/phases/2026-09-28-graph-build-context-settings-memory/L1.phase`
- `loom/phases/2026-09-28-graph-build-context-settings-memory/graph/L1-5ea3ba1965c46f0d.graph`

</details>

<details>
<summary>`loom/phases/2026-09-28-staging-self-heal/` · 2 files</summary>

- `loom/phases/2026-09-28-staging-self-heal/L1.phase`
- `loom/phases/2026-09-28-staging-self-heal/graph/L1-f9baab1fe72d6f56.graph`

</details>

<details>
<summary>`loom/phases/2026-10-05-build-from-the-spec/` · 2 files</summary>

- `loom/phases/2026-10-05-build-from-the-spec/SB24_loom_builds_a_new_system.phase`
- `loom/phases/2026-10-05-build-from-the-spec/graph/SB24_loom_builds_a_new_system-bdd03972022356be.graph`

</details>

<details>
<summary>`loom/phases/2026-10-05-cli-data-code/` · 10 files</summary>

- `loom/phases/2026-10-05-cli-data-code/HG2_loom_bootstrap_rejections.phase`
- `loom/phases/2026-10-05-cli-data-code/HG5_bootstrap_keeps_registration_times.phase`
- `loom/phases/2026-10-05-cli-data-code/HG6_scanner_status_vocabulary.phase`
- `loom/phases/2026-10-05-cli-data-code/HG9_persist_history_diff.phase`
- `loom/phases/2026-10-05-cli-data-code/graph/HG2_loom_bootstrap_rejections-966dd95e7e861011.graph`
- `loom/phases/2026-10-05-cli-data-code/graph/HG5_bootstrap_keeps_registration_times-71df2c9ea26652cf.graph`
- `loom/phases/2026-10-05-cli-data-code/graph/HG6_scanner_status_vocabulary-f79a44488c30eea9.graph`
- `loom/phases/2026-10-05-cli-data-code/graph/HG9_persist_history_diff-95c5a644e3d78081.graph`
- `loom/phases/2026-10-05-cli-data-code/graph/_superseded/HG6_scanner_status_vocabulary-49086cd86ee95b15.graph`
- `loom/phases/2026-10-05-cli-data-code/graph/_superseded/HG9_persist_history_diff-4445ae8cae3baf26.graph`

</details>

<details>
<summary>`loom/phases/2026-10-09-one-roadmap/` · 6 files</summary>

- `loom/phases/2026-10-09-one-roadmap/OR1_five_answers_for_an_open_phase.phase`
- `loom/phases/2026-10-09-one-roadmap/OR5_it_stays_decluttered.phase`
- `loom/phases/2026-10-09-one-roadmap/graph/OR1_five_answers_for_an_open_phase-dc0983a787d924ad.graph`
- `loom/phases/2026-10-09-one-roadmap/graph/OR5_it_stays_decluttered-9060a707b377db33.graph`
- `loom/phases/2026-10-09-one-roadmap/graph/_superseded/OR1_five_answers_for_an_open_phase-8767ec179c02d02d.graph`
- `loom/phases/2026-10-09-one-roadmap/graph/_superseded/OR5_it_stays_decluttered-d9858c6f5ddd36e2.graph`

</details>

<details>
<summary>`loom/phases/2026-10-12-browser-providers-and-work/` · 5 files</summary>

- `loom/phases/2026-10-12-browser-providers-and-work/MX0_phases_tagged_to_components.phase`
- `loom/phases/2026-10-12-browser-providers-and-work/MX2_the_0_60_components_wired_in_loom.phase`
- `loom/phases/2026-10-12-browser-providers-and-work/graph/MX0_phases_tagged_to_components-ebed791fafbb5d61.graph`
- `loom/phases/2026-10-12-browser-providers-and-work/graph/MX2_the_0_60_components_wired_in_loom-119b6279fd663960.graph`
- `loom/phases/2026-10-12-browser-providers-and-work/graph/_superseded/MX0_phases_tagged_to_components-27729eaceec7d145.graph`

</details>

<details>
<summary>`loom/phases/2026-10-12-request-spine/` · 2 files</summary>

- `loom/phases/2026-10-12-request-spine/RQ11_spec_and_registry_reconciled.phase`
- `loom/phases/2026-10-12-request-spine/graph/RQ11_spec_and_registry_reconciled-ac250d713085c01a.graph`

</details>

<details>
<summary>`loom/phases/2026-10-13-projects-raid-and-gates/` · 2 files</summary>

- `loom/phases/2026-10-13-projects-raid-and-gates/LM0_loom_wires_have_stable_ids.phase`
- `loom/phases/2026-10-13-projects-raid-and-gates/graph/LM0_loom_wires_have_stable_ids-64d53d8e7a486546.graph`

</details>

<details>
<summary>`loom/phases/2026-10-15-fiverr-ledger/` · 2 files</summary>

- `loom/phases/2026-10-15-fiverr-ledger/PF3_the_screen.phase`
- `loom/phases/2026-10-15-fiverr-ledger/graph/PF3_the_screen-e8d5082305f259ca.graph`

</details>

<details>
<summary>`loom/phases/2026-10-15-gate-held-work/` · 2 files</summary>

- `loom/phases/2026-10-15-gate-held-work/GW23_wire_what_exists.phase`
- `loom/phases/2026-10-15-gate-held-work/graph/GW23_wire_what_exists-cef06578bf31e272.graph`

</details>

<details>
<summary>`loom/phases/2026-10-15-warp-builds-and-spec-framework/` · 6 files</summary>

- `loom/phases/2026-10-15-warp-builds-and-spec-framework/PT1_specs_tagged_per_phase.phase`
- `loom/phases/2026-10-15-warp-builds-and-spec-framework/PT2_phases_tagged_by_system_repo.phase`
- `loom/phases/2026-10-15-warp-builds-and-spec-framework/graph/PT1_specs_tagged_per_phase-d3ea293dbc480b04.graph`
- `loom/phases/2026-10-15-warp-builds-and-spec-framework/graph/PT2_phases_tagged_by_system_repo-abc1512198265fee.graph`
- `loom/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/PT1_specs_tagged_per_phase-621f016cdcca51c1.graph`
- `loom/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/PT2_phases_tagged_by_system_repo-764aabf1594ac20e.graph`

</details>

<details>
<summary>`loom/phases/2026-10-19-infrastructure-spine/` · 2 files</summary>

- `loom/phases/2026-10-19-infrastructure-spine/IN4_retire_hand_maps.phase`
- `loom/phases/2026-10-19-infrastructure-spine/graph/IN4_retire_hand_maps-b5cba90de8bdff76.graph`

</details>

<details>
<summary>`loom/phases/2026-10-19-pipeline-root-causes/` · 2 files</summary>

- `loom/phases/2026-10-19-pipeline-root-causes/SS4_seal_into_compartments.phase`
- `loom/phases/2026-10-19-pipeline-root-causes/graph/SS4_seal_into_compartments-369aaef9557e2030.graph`

</details>

<details>
<summary>`loom/phases/2026-10-21-approval-chain/` · 2 files</summary>

- `loom/phases/2026-10-21-approval-chain/APV5_wired_in_loom.phase`
- `loom/phases/2026-10-21-approval-chain/graph/APV5_wired_in_loom-73a4e2239e5435a3.graph`

</details>

<details>
<summary>`loom/phases/loom-phasemap-section/` · 9 files</summary>

- `loom/phases/loom-phasemap-section/LP1_phasemap_scanner.phase`
- `loom/phases/loom-phasemap-section/LP2_split_by_system.phase`
- `loom/phases/loom-phasemap-section/LP3_loom_section.phase`
- `loom/phases/loom-phasemap-section/graph/LP1_phasemap_scanner-4959567292bb0430.graph`
- `loom/phases/loom-phasemap-section/graph/LP2_split_by_system-0829f785bafd438e.graph`
- `loom/phases/loom-phasemap-section/graph/LP3_loom_section-73211575ee3c6f2a.graph`
- `loom/phases/loom-phasemap-section/graph/_superseded/LP1_phasemap_scanner-9baa3673ba62906c.graph`
- `loom/phases/loom-phasemap-section/graph/_superseded/LP2_split_by_system-31c9d5d0ffc1bfd0.graph`
- `loom/phases/loom-phasemap-section/graph/_superseded/LP3_loom_section-c5805f62164aa4cd.graph`

</details>

<details>
<summary>`loom/phases/nexus-architecture-rebuild/` · 26 files</summary>

- `loom/phases/nexus-architecture-rebuild/P15_forge_shell_into_loom.phase`
- `loom/phases/nexus-architecture-rebuild/P16_architect_node_canvas_in_loom.phase`
- `loom/phases/nexus-architecture-rebuild/P17_blueprint_builder_onto_canvas.phase`
- `loom/phases/nexus-architecture-rebuild/P18_tv_ui_triage.phase`
- `loom/phases/nexus-architecture-rebuild/P19_tablet_continue.phase`
- `loom/phases/nexus-architecture-rebuild/P1_dangling_hook_flood.phase`
- `loom/phases/nexus-architecture-rebuild/P21_loom_boundary_import_hooks.phase`
- `loom/phases/nexus-architecture-rebuild/P22_scanner_hand_map_id_drift.phase`
- `loom/phases/nexus-architecture-rebuild/P3_remaining_dangling_hooks.phase`
- `loom/phases/nexus-architecture-rebuild/P4_forge_shell_rebuild.phase`
- `loom/phases/nexus-architecture-rebuild/P5_cockpit_to_copilot_control_surface.phase`
- `loom/phases/nexus-architecture-rebuild/P6_copilot_toasts.phase`
- `loom/phases/nexus-architecture-rebuild/graph/P15_forge_shell_into_loom-8ba7d89591e9ed40.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P16_architect_node_canvas_in_loom-e1fe4417843573a5.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P17_blueprint_builder_onto_canvas-c9dc8279be53da93.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P18_tv_ui_triage-f01cd98115ddf748.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P19_tablet_continue-d79f4c355f96ff81.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P1_dangling_hook_flood-c2a48d9b68d5b863.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P21_loom_boundary_import_hooks-907e46438b65288f.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P22_scanner_hand_map_id_drift-dded8b9e97b3ca01.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P3_remaining_dangling_hooks-903fa24d744e6bd3.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P4_forge_shell_rebuild-40a2f883e2298610.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P5_cockpit_to_copilot_control_surface-fcb861ad77e320a9.graph`
- `loom/phases/nexus-architecture-rebuild/graph/P6_copilot_toasts-a09fd4021c8e4d8e.graph`
- `loom/phases/nexus-architecture-rebuild/graph/_superseded/P15_forge_shell_into_loom-5354ae367b60de9c.graph`
- `loom/phases/nexus-architecture-rebuild/graph/_superseded/P4_forge_shell_rebuild-8e2cf5d748e1fd80.graph`

</details>

<details>
<summary>`loom/phases/nexus-self-build-pipeline/` · 2 files</summary>

- `loom/phases/nexus-self-build-pipeline/SB1_schema_extension.phase`
- `loom/phases/nexus-self-build-pipeline/graph/SB1_schema_extension-72f0c5f1efbfffb5.graph`

</details>

<details>
<summary>`loom/phases/nexus-system-standardization/` · 10 files</summary>

- `loom/phases/nexus-system-standardization/SS0_clear_clutter.phase`
- `loom/phases/nexus-system-standardization/SS1_system_manifest.phase`
- `loom/phases/nexus-system-standardization/SS4_full_logging_per_system.phase`
- `loom/phases/nexus-system-standardization/SS6_dynamic_commands_and_cortex_data.phase`
- `loom/phases/nexus-system-standardization/SS7_decoupling_audit.phase`
- `loom/phases/nexus-system-standardization/graph/SS0_clear_clutter-868ea5cf38cf8404.graph`
- `loom/phases/nexus-system-standardization/graph/SS1_system_manifest-a9200dbf3224b519.graph`
- `loom/phases/nexus-system-standardization/graph/SS4_full_logging_per_system-80f873187821fffc.graph`
- `loom/phases/nexus-system-standardization/graph/SS6_dynamic_commands_and_cortex_data-2d38a1102ce3d793.graph`
- `loom/phases/nexus-system-standardization/graph/SS7_decoupling_audit-3a4d6d0780b5923e.graph`

</details>

<details>
<summary>`loom/phases/repair-contract-and-loom-hub/` · 3 files</summary>

- `loom/phases/repair-contract-and-loom-hub/R0_phasemap_history_in_cortex.phase`
- `loom/phases/repair-contract-and-loom-hub/graph/R0_phasemap_history_in_cortex-9f7fec7fb67eb3bf.graph`
- `loom/phases/repair-contract-and-loom-hub/graph/_superseded/R0_phasemap_history_in_cortex-d461c96866f2c73e.graph`

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

60 release notes name a file of loom: 0.60.225., 0.60.222., 0.60.199., 0.60.188., 0.60.176., 0.60.170., 0.60.168., 0.60.166., 0.60.164., 0.60.161., 0.60.160., 0.60.157., 0.60.156., 0.60.155., 0.60.153., 0.60.150., 0.60.143., 0.60.134., 0.60.131., 0.60.127., 0.60.126., 0.60.118., 0.60.80., 0.60.72., 0.60.63., 0.60.41., 0.60.7., 0.60.5., 0.60.4., 0.59.11., 0.53.0., 0.49.0., 0.44.0., 0.39.367., 0.39.359., 0.39.349., 0.39.334., 0.39.332., 0.39.330., 0.39.329., and 20 older. Each is in the version history below, in his words.

<!-- generated:readme:system:loom:end -->

### clear-glass

The sovereign browser: Electron and Chromium, with its own fingerprint control, and the place every provider tab lives. `clear-glass/src/main/index.js` starts it; `clear-glass/src/` holds the browser's subsystems (accounts, cookies, downloads, the DevTools-protocol driver in `clear-glass/src/driver/`, providers, userscripts, site settings), `clear-glass/renderer/` its windows (the browser, Settings, the Library), and `clear-glass/plugins/` its plugins. It serves its control API on port 7704 and streams on 7701. `clear-glass/registry-components.js` is its live contract, the largest in NEXUS, and `clear-glass/spec/clear-glass.spec` was written from that contract rather than from scratch. The next zoom level is `clear-glass-atlas.md`.

<!-- generated:readme:system:clear-glass:start -->
#### clear-glass: every module and every file

Clear-glass is 944 files in 128 modules, port 7704, spec `clear-glass/spec/clear-glass.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/clear-glass-atlas.md`.

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
<summary>`clear-glass/phases/` · 1 file</summary>

- `clear-glass/phases/INDEX.md` — clear-glass — its phases

</details>

<details>
<summary>`clear-glass/phases/2026-08-22-session-full/` · 2 files</summary>

- `clear-glass/phases/2026-08-22-session-full/SF14_wake_pipeline_real_architecture.phase`
- `clear-glass/phases/2026-08-22-session-full/graph/SF14_wake_pipeline_real_architecture-197e4087240a93cd.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-08-23-backlog/` · 34 files</summary>

- `clear-glass/phases/2026-08-23-backlog/BL0_macro_system.phase`
- `clear-glass/phases/2026-08-23-backlog/BL10_nexus_roadmap_html_files.phase`
- `clear-glass/phases/2026-08-23-backlog/BL14_seam_to_lib_seam.phase`
- `clear-glass/phases/2026-08-23-backlog/BL17_nexus_url_scheme.phase`
- `clear-glass/phases/2026-08-23-backlog/BL18_tools_per_url.phase`
- `clear-glass/phases/2026-08-23-backlog/BL19_roadmap_readability.phase`
- `clear-glass/phases/2026-08-23-backlog/BL1_macro_erosmancer_integration.phase`
- `clear-glass/phases/2026-08-23-backlog/BL22_rewind_timeline_ui.phase`
- `clear-glass/phases/2026-08-23-backlog/BL23_ncp_providers_start_verification.phase`
- `clear-glass/phases/2026-08-23-backlog/BL26_account_agent_window_uuid_linking.phase`
- `clear-glass/phases/2026-08-23-backlog/BL28_background_tabs_setting.phase`
- `clear-glass/phases/2026-08-23-backlog/BL29_tab_context_menu_move_to_background.phase`
- `clear-glass/phases/2026-08-23-backlog/BL2_guardian_zip_mining_report.phase`
- `clear-glass/phases/2026-08-23-backlog/BL30_registry_components_drift_audit.phase`
- `clear-glass/phases/2026-08-23-backlog/BL31_architect_block_canvas_component_swap.phase`
- `clear-glass/phases/2026-08-23-backlog/BL5_port_killswitch_pattern.phase`
- `clear-glass/phases/2026-08-23-backlog/BL6_captcha_detection.phase`
- `clear-glass/phases/2026-08-23-backlog/graph/BL0_macro_system-58296859ab5e1418.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL10_nexus_roadmap_html_files-80b8c025c01b3474.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL14_seam_to_lib_seam-a139a48406c5ffd1.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL17_nexus_url_scheme-99bb8e363414a436.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL18_tools_per_url-6e529aec0748e9ba.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL19_roadmap_readability-acd486febb7a758e.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL1_macro_erosmancer_integration-16a373b699bcfb38.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL22_rewind_timeline_ui-c303b8516180f930.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL23_ncp_providers_start_verification-68e2b72f9c16e13c.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL26_account_agent_window_uuid_linking-a60e3d64b570800c.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL28_background_tabs_setting-179098e301fdb617.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL29_tab_context_menu_move_to_background-801abdd7b0833200.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL2_guardian_zip_mining_report-064061cd3e8c7740.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL30_registry_components_drift_audit-eac106116feaaa9a.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL31_architect_block_canvas_component_swap-5361bbb7f4319623.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL5_port_killswitch_pattern-48ab969e8779224d.graph`
- `clear-glass/phases/2026-08-23-backlog/graph/BL6_captcha_detection-acc28d69b4475ef7.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/` · 8 files</summary>

- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR1_callto_component_hotswap_catalog.phase`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR4_erosmancer_as_clearglass_plugin.phase`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR8_clearglass_full_agent_tool_parity.phase`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/BR9_theme_consolidation_to_nexus_dark.phase`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR1_callto_component_hotswap_catalog-e6e82690ee483733.graph`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR4_erosmancer_as_clearglass_plugin-03ecdb7f9c99b61f.graph`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR8_clearglass_full_agent_tool_parity-62e54d03c6ab830a.graph`
- `clear-glass/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR9_theme_consolidation_to_nexus_dark-4ab785621dee1689.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-08-28-self-building-pipeline/` · 2 files</summary>

- `clear-glass/phases/2026-08-28-self-building-pipeline/SBP7_agent_suite_lives_in_clearglass.phase`
- `clear-glass/phases/2026-08-28-self-building-pipeline/graph/SBP7_agent_suite_lives_in_clearglass-48087c2a9f893bf5.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-08-30-interaction-contract-context/` · 11 files</summary>

- `clear-glass/phases/2026-08-30-interaction-contract-context/IC11_agent_truth_fragmentation.phase`
- `clear-glass/phases/2026-08-30-interaction-contract-context/IC3_intention_taxonomy_per_system.phase`
- `clear-glass/phases/2026-08-30-interaction-contract-context/IC4_idearium_system_template_update.phase`
- `clear-glass/phases/2026-08-30-interaction-contract-context/IC8_callto_event_driven_cli_injection.phase`
- `clear-glass/phases/2026-08-30-interaction-contract-context/IC9_diagnostic_stall_detection_and_autofix.phase`
- `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC11_agent_truth_fragmentation-0a51b71bfcb6edc5.graph`
- `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC3_intention_taxonomy_per_system-4e285ed5aef34d74.graph`
- `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC4_idearium_system_template_update-9f874130772add91.graph`
- `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC8_callto_event_driven_cli_injection-f44516d2a55c9222.graph`
- `clear-glass/phases/2026-08-30-interaction-contract-context/graph/IC9_diagnostic_stall_detection_and_autofix-13ed862cf85ae1ff.graph`
- `clear-glass/phases/2026-08-30-interaction-contract-context/graph/_superseded/IC11_agent_truth_fragmentation-b9dc58c002c61d18.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/` · 6 files</summary>

- `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/LM17_downloads_manager_for_artifacts.phase`
- `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/LM24_atlas_prose_layer.phase`
- `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/LM8_full_pipeline_wiring.phase`
- `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM17_downloads_manager_for_artifacts-3d19dd972de8a30e.graph`
- `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM24_atlas_prose_layer-fb1d1886928a6b42.graph`
- `clear-glass/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM8_full_pipeline_wiring-b48e3d072c5de953.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-02-nexus-vision-master/` · 2 files</summary>

- `clear-glass/phases/2026-09-02-nexus-vision-master/T4_userscript_event_types.phase`
- `clear-glass/phases/2026-09-02-nexus-vision-master/graph/T4_userscript_event_types-921142887d6d72f5.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/` · 2 files</summary>

- `clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/CG1_process_manager_in_settings.phase`
- `clear-glass/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/CG1_process_manager_in_settings-fb5aa1a99a71129f.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/` · 16 files</summary>

- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CG1_ncp_events_real.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CG2_route_ncp_onto_guardian_sse.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP1_tool_index_hooked_to_living_model.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP2_copilot_versionium_awareness.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP3_git_vs_versionium_decision.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DA2_dispatch_outcome_events.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/ID1_resolve_versionium_cortex_dependency.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/IDU1_idearium_homepage_and_repo_browser.phase`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CG1_ncp_events_real-d173963e478d5d69.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CG2_route_ncp_onto_guardian_sse-5a0bf626fc918b86.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP1_tool_index_hooked_to_living_model-ce14ab9b2c29744b.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP2_copilot_versionium_awareness-dc90fa1d06d6df9e.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP3_git_vs_versionium_decision-5596e1b70a39c284.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DA2_dispatch_outcome_events-24bdcc78690144b7.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/ID1_resolve_versionium_cortex_dependency-4782d4c5e56ab572.graph`
- `clear-glass/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/IDU1_idearium_homepage_and_repo_browser-59239d65a2593d97.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-11-sovereign-node-architecture/` · 32 files</summary>

- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P10_intelligence_reads_sse_and_data_folders.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P13_interaction_contract_plus_handshake_for_every_cross_system_call.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P14_per_system_living_gap_index.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P23_guardian_job_durability.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P24_response_queue_and_delivery_ack.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P27_guardian_picker_userscript_manager.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P28_dom_tool_and_command_flow.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P29_clearglass_brainos_canvas.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P2_per_system_interaction_contracts.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P32_clearglass_enterprise_ui_scope.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P34_nodes_in_the_lattice.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P35_copilot_reads_edits_creates_nodes.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P37_the_ui_floats_on_the_registry.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P5_data_folder_completion.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P6_per_system_contract_schemas.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/P8_per_system_component_registry.phase`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P10_intelligence_reads_sse_and_data_folders-7adf7e1b825e4987.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P13_interaction_contract_plus_handshake_for_every_cross_system_call-58cf76a841513887.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P14_per_system_living_gap_index-9458a22e955dc98a.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P23_guardian_job_durability-27a5e87ffd5ddbc2.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P24_response_queue_and_delivery_ack-df6fe63556075f03.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P27_guardian_picker_userscript_manager-44ddc6e72cdb237e.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P28_dom_tool_and_command_flow-0b2ddb3502c0b4d6.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P29_clearglass_brainos_canvas-bb6cf64c44552e5c.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P2_per_system_interaction_contracts-1cb7c61b5c6e9d93.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P32_clearglass_enterprise_ui_scope-f2ef2defe3ad1ca5.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P34_nodes_in_the_lattice-2e02ff3713ff6e57.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P35_copilot_reads_edits_creates_nodes-4c5e2012491d8686.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P37_the_ui_floats_on_the_registry-c73e397fa682657f.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P5_data_folder_completion-2905a720e667ce30.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P6_per_system_contract_schemas-238173594117490a.graph`
- `clear-glass/phases/2026-09-11-sovereign-node-architecture/graph/P8_per_system_component_registry-9b441101dc4ad8c8.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/` · 18 files</summary>

- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P1_driver.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P2_mesh_transport.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P3_endpoint.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P4_identity.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/P6_verify.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T2_duplicate_prompt.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T3_wrong_page.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T4_two_actuators.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/T5_untestable_here.phase`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P1_driver-ca4c42738e1cad5b.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P2_mesh_transport-fb229d927ed658aa.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P3_endpoint-80b9c1cda9f7d5a5.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P4_identity-f5af86aa56495490.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/P6_verify-e233123773468798.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T2_duplicate_prompt-fd69a7a86a7aeec7.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T3_wrong_page-36dd2c25439e70e1.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T4_two_actuators-1e41d389b0d7fe92.graph`
- `clear-glass/phases/2026-09-19-guardian-mesh-first-dispatch/graph/T5_untestable_here-3ec3c1ec8bf6950c.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-29-build-surface/` · 4 files</summary>

- `clear-glass/phases/2026-09-29-build-surface/BS0_compartment_windows.phase`
- `clear-glass/phases/2026-09-29-build-surface/BS17_copilot_browser_verbs.phase`
- `clear-glass/phases/2026-09-29-build-surface/graph/BS0_compartment_windows-96cfa0a56795fd3f.graph`
- `clear-glass/phases/2026-09-29-build-surface/graph/BS17_copilot_browser_verbs-612a170a43473d39.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-09-29-provider-economy/` · 2 files</summary>

- `clear-glass/phases/2026-09-29-provider-economy/EC9_input_path_in_editors.phase`
- `clear-glass/phases/2026-09-29-provider-economy/graph/EC9_input_path_in_editors-2b376534e7e951b9.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-01-idearium-agent-ready-master/` · 6 files</summary>

- `clear-glass/phases/2026-10-01-idearium-agent-ready-master/CG1_clear_glass_accounts_and_private.phase`
- `clear-glass/phases/2026-10-01-idearium-agent-ready-master/CG2_clear_glass_drag_wrapper_and_fluid_url_bar.phase`
- `clear-glass/phases/2026-10-01-idearium-agent-ready-master/PF10_clear_glass_err_aborted_9000.phase`
- `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/CG1_clear_glass_accounts_and_private-adf380e049b8562f.graph`
- `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/CG2_clear_glass_drag_wrapper_and_fluid_url_bar-c9f738c8197eb8e4.graph`
- `clear-glass/phases/2026-10-01-idearium-agent-ready-master/graph/PF10_clear_glass_err_aborted_9000-8f9d250d6b6fb2ea.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-01-work-visibility-job-reuse/` · 2 files</summary>

- `clear-glass/phases/2026-10-01-work-visibility-job-reuse/J5.phase`
- `clear-glass/phases/2026-10-01-work-visibility-job-reuse/graph/J5-664d74fc10c451b6.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-02-emerge-field-memory-build/` · 2 files</summary>

- `clear-glass/phases/2026-10-02-emerge-field-memory-build/PR2_screenshots_through_clear_glass.phase`
- `clear-glass/phases/2026-10-02-emerge-field-memory-build/graph/PR2_screenshots_through_clear_glass-3444f6584530ed41.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-05-fiverr-guide/` · 4 files</summary>

- `clear-glass/phases/2026-10-05-fiverr-guide/FR1_the_guide.phase`
- `clear-glass/phases/2026-10-05-fiverr-guide/FR2_show_me_on_the_page.phase`
- `clear-glass/phases/2026-10-05-fiverr-guide/graph/FR1_the_guide-c57302eaf1167ddf.graph`
- `clear-glass/phases/2026-10-05-fiverr-guide/graph/FR2_show_me_on_the_page-b6e7861ffe663d01.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-05-idea-to-spec-workshop/` · 2 files</summary>

- `clear-glass/phases/2026-10-05-idea-to-spec-workshop/WK0_pop_out_windows_borderless.phase`
- `clear-glass/phases/2026-10-05-idea-to-spec-workshop/graph/WK0_pop_out_windows_borderless-460dfe0e0222e3da.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-07-compartment-control-and-activity/` · 2 files</summary>

- `clear-glass/phases/2026-10-07-compartment-control-and-activity/DC1_a_click_that_did_nothing.phase`
- `clear-glass/phases/2026-10-07-compartment-control-and-activity/graph/DC1_a_click_that_did_nothing-58a4e2e09bd4dc9c.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-10-design-surface/` · 6 files</summary>

- `clear-glass/phases/2026-10-10-design-surface/DS1_tokens_edited_live.phase`
- `clear-glass/phases/2026-10-10-design-surface/DS2_pick_and_edit_any_page.phase`
- `clear-glass/phases/2026-10-10-design-surface/DS4_interface_types_by_adapter.phase`
- `clear-glass/phases/2026-10-10-design-surface/graph/DS1_tokens_edited_live-8d477dcf2270ac45.graph`
- `clear-glass/phases/2026-10-10-design-surface/graph/DS2_pick_and_edit_any_page-47581699d0b5073d.graph`
- `clear-glass/phases/2026-10-10-design-surface/graph/DS4_interface_types_by_adapter-23e21f01a2f3ded3.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-10-idearium-access/` · 2 files</summary>

- `clear-glass/phases/2026-10-10-idearium-access/IA4_clear_glass_signs_in_for_you.phase`
- `clear-glass/phases/2026-10-10-idearium-access/graph/IA4_clear_glass_signs_in_for_you-5aa67551e81230b4.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-10-idearium-solid/` · 2 files</summary>

- `clear-glass/phases/2026-10-10-idearium-solid/SD8_an_agent_can_see_and_fix_a_tab.phase`
- `clear-glass/phases/2026-10-10-idearium-solid/graph/SD8_an_agent_can_see_and_fix_a_tab-487ac3e1e6056957.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-10-shape-of-nexus/` · 12 files</summary>

- `clear-glass/phases/2026-10-10-shape-of-nexus/CG1_the_field_injects_once.phase`
- `clear-glass/phases/2026-10-10-shape-of-nexus/CG2_one_source_of_truth_for_the_browser.phase`
- `clear-glass/phases/2026-10-10-shape-of-nexus/CG3_the_fiverr_tutorial_in_the_browser.phase`
- `clear-glass/phases/2026-10-10-shape-of-nexus/FN2_nerve_sees_the_field.phase`
- `clear-glass/phases/2026-10-10-shape-of-nexus/SH2_explain_this_anywhere.phase`
- `clear-glass/phases/2026-10-10-shape-of-nexus/TU1_the_nexus_tutorial.phase`
- `clear-glass/phases/2026-10-10-shape-of-nexus/graph/CG1_the_field_injects_once-d4aad8bc65bd8eba.graph`
- `clear-glass/phases/2026-10-10-shape-of-nexus/graph/CG2_one_source_of_truth_for_the_browser-b8620004bc4e6726.graph`
- `clear-glass/phases/2026-10-10-shape-of-nexus/graph/CG3_the_fiverr_tutorial_in_the_browser-aaa3675caef098b9.graph`
- `clear-glass/phases/2026-10-10-shape-of-nexus/graph/FN2_nerve_sees_the_field-716118daf05d258b.graph`
- `clear-glass/phases/2026-10-10-shape-of-nexus/graph/SH2_explain_this_anywhere-ee5f18699614cf8c.graph`
- `clear-glass/phases/2026-10-10-shape-of-nexus/graph/TU1_the_nexus_tutorial-3c410e7addc61b7e.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-12-browser-providers-and-work/` · 38 files</summary>

- `clear-glass/phases/2026-10-12-browser-providers-and-work/AS1_provider_tab_runs_as_the_default_account.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB0_gig_files.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB1_the_agent_writes_the_gig_file.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB2_the_copilot_hat_agent_and_account.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB3_autofill_fields_mapped_by_pick.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB4_resume_import.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB6_the_application_ledger.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/JB7_the_follow_up.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/RN0_the_renderer_as_a_cos_window.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB0_the_webview_session_proved.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB1_a_tab_is_its_own_webview.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB2_a_tab_runs_as_an_account.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB3_tabs_are_compartments.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB4_bookmark_checklists.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB5_site_and_account_nodes.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB6_element_endpoints.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/TB7_human_tabs_never_spoofed.phase`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/AS1_provider_tab_runs_as_the_default_account-8f04aea70b3f8c4c.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB0_gig_files-e3c172dca44dd01b.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB1_the_agent_writes_the_gig_file-897ac09840418686.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB2_the_copilot_hat_agent_and_account-62b2420dcfc3416c.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB3_autofill_fields_mapped_by_pick-2a7158bf98595a74.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB4_resume_import-b1c70c5840717e4e.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB6_the_application_ledger-c7beddcbfaae4371.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/JB7_the_follow_up-ba331fb30a195c2d.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/RN0_the_renderer_as_a_cos_window-4a9bc7c74df8a2b0.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB0_the_webview_session_proved-0413e61ab4296a70.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB1_a_tab_is_its_own_webview-d0d5c9dc749e3d31.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB2_a_tab_runs_as_an_account-ad3933093002c9e3.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB3_tabs_are_compartments-91b6321036f635ee.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB4_bookmark_checklists-8c52de1ac7a8caf8.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB5_site_and_account_nodes-e21cc26fac945969.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB6_element_endpoints-43ef5bbbbaab7af2.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/TB7_human_tabs_never_spoofed-4e31472027e2ef56.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/JB3_autofill_fields_mapped_by_pick-f03c5d98203972f2.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/JB4_resume_import-5f5bfc35c620b31f.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/JB6_the_application_ledger-46f6fdd5ad1b1534.graph`
- `clear-glass/phases/2026-10-12-browser-providers-and-work/graph/_superseded/TB5_site_and_account_nodes-43acd84436dcbc96.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/` · 2 files</summary>

- `clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/PF1_profiles_hats_tabs.phase`
- `clear-glass/phases/2026-10-13-gates-that-learn-and-priorities/graph/PF1_profiles_hats_tabs-559a264e9111dce2.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-13-identities-tabs-and-automation/` · 32 files</summary>

- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/CU0_chat_url_reload_before_escalating.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/HM1_chatgpt_connection_kept.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/ID0_signed_in_where_he_signs_in.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/ID1_identities.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/ID2_every_cookie_a_row.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/ID3_bookmarks_carry_the_identity.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/ID4_incognito.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/MC0_recorder_records_the_tab.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/MC1_steps_as_events_and_snapshots.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/MC2_hotkeys_for_macros.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/NV0_scripts_injected_once.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/NV1_words_to_elements.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/NV2_tell_clear_glass_what_to_do.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/TB1_tab_is_a_view.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/TB2_new_tab_menu.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/TB3_browser_rebuilt.phase`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/CU0_chat_url_reload_before_escalating-d7b06cef88a5d5b8.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/HM1_chatgpt_connection_kept-c58eb03d6c919db7.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/ID0_signed_in_where_he_signs_in-8b26dcbb3d411c99.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/ID1_identities-b977f6b54637a686.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/ID2_every_cookie_a_row-fe5049365936c188.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/ID3_bookmarks_carry_the_identity-fe345d2788c05a2e.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/ID4_incognito-4d6262129208311e.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/MC0_recorder_records_the_tab-5b2c303ade2f84c7.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/MC1_steps_as_events_and_snapshots-b7dfa5c5ff2fcec2.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/MC2_hotkeys_for_macros-a0d99d8f06fb8ca4.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/NV0_scripts_injected_once-10ac55e1555a339a.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/NV1_words_to_elements-b3eedddb8bbbae8e.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/NV2_tell_clear_glass_what_to_do-c31060359b5f7fc4.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/TB1_tab_is_a_view-ee8c681d5d8a4bf4.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/TB2_new_tab_menu-12881bf49a145127.graph`
- `clear-glass/phases/2026-10-13-identities-tabs-and-automation/graph/TB3_browser_rebuilt-cc1d0fefce82b17d.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-13-projects-raid-and-gates/` · 2 files</summary>

- `clear-glass/phases/2026-10-13-projects-raid-and-gates/WF0_workflows.phase`
- `clear-glass/phases/2026-10-13-projects-raid-and-gates/graph/WF0_workflows-974d9c5ead887971.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/` · 6 files</summary>

- `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/CS3_feature_starts_as_a_spec.phase`
- `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/SP1_semantic_page_tree.phase`
- `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/SP2_semantic_addresses_for_the_field_map.phase`
- `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/CS3_feature_starts_as_a_spec-a5a6068f4e05064d.graph`
- `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/SP1_semantic_page_tree-8a8b6900ce74fa3b.graph`
- `clear-glass/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/SP2_semantic_addresses_for_the_field_map-e4824b3db829762f.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-15-clear-glass-network-posture/` · 36 files</summary>

- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP10_browser_surface.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP11_context_menu.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP12_plugin_split.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP13_settings_html.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP14_macros_and_automation.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP15_kill_switch.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP16_quarantine_pipeline.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP17_hold_primitive.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP18_freeze_plugin.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP1_compartment.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP2_policy_and_storage.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP3_apply_to_electron.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP4_webrtc.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP5_leak_test.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP6_settings.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP7_p2p.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP8_macro_hooks.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/NP9_cli_first.phase`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP10_browser_surface-09f4a73e43ffab7d.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP11_context_menu-4075b599a76694ed.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP12_plugin_split-581a7f5c1194fe97.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP13_settings_html-7963737bd097d29a.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP14_macros_and_automation-2847a26c9d226bd5.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP15_kill_switch-bf2c7c8a892bc080.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP16_quarantine_pipeline-36b6cda16caeb659.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP17_hold_primitive-114f488ecf1e98c4.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP18_freeze_plugin-53c52b561aea759a.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP1_compartment-0bc26a82e83f2e24.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP2_policy_and_storage-80223590c3dad8ed.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP3_apply_to_electron-b7c76e01e263d382.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP4_webrtc-e1c386e4367500af.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP5_leak_test-d8d86049fe3ea73a.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP6_settings-01027becd9b14386.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP7_p2p-b46600783db8bec5.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP8_macro_hooks-0ee4cb8e3bf471c6.graph`
- `clear-glass/phases/2026-10-15-clear-glass-network-posture/graph/NP9_cli_first-65e757a992580a74.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-15-clear-glass-surfaces/` · 10 files</summary>

- `clear-glass/phases/2026-10-15-clear-glass-surfaces/CS1_one_popup_frame.phase`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/CS2_settings_providers_and_accounts.phase`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/CS3_clear_glass_users_as_plugins.phase`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/PF2_the_items.phase`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/PF3_the_section.phase`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/CS1_one_popup_frame-2309fce9f645ea6b.graph`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/CS2_settings_providers_and_accounts-377b41fc576de436.graph`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/CS3_clear_glass_users_as_plugins-65f150cb1b4a6789.graph`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/PF2_the_items-63bc80b6b271a79e.graph`
- `clear-glass/phases/2026-10-15-clear-glass-surfaces/graph/PF3_the_section-66f9578d26cb5b2c.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-15-cos-app/` · 2 files</summary>

- `clear-glass/phases/2026-10-15-cos-app/COSA7_clear_glass_delivers.phase`
- `clear-glass/phases/2026-10-15-cos-app/graph/COSA7_clear_glass_delivers-07b5a7f81ad0d2e7.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-15-macro-node-recording/` · 26 files</summary>

- `clear-glass/phases/2026-10-15-macro-node-recording/MR11_into_nexus.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR12_magnet_p2p.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR13_hypothesis_tracker.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR1_live_node.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR2_richer_events.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR3_dialog.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR3b_guide_and_hotkey_toast.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR4_listener_as_nodes.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR5_role_tags.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR6_macro_to_automation.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR7_bind_and_trigger.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR8_virtual_mouse_record.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/MR9_page_event_record.phase`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR11_into_nexus-de5d0fa9290bde04.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR12_magnet_p2p-2f67b50f8b6c45db.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR13_hypothesis_tracker-9895d3d7a9960edd.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR1_live_node-d02eb93be714620a.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR2_richer_events-210b0c392ca052ce.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR3_dialog-d48a589841854876.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR3b_guide_and_hotkey_toast-c7090557628cbfe8.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR4_listener_as_nodes-92f8747119b47a89.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR5_role_tags-947a6872f9bd98e5.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR6_macro_to_automation-806c89ac1dcff4f2.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR7_bind_and_trigger-85a2b68eacd68d1f.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR8_virtual_mouse_record-8f07c8e16762a989.graph`
- `clear-glass/phases/2026-10-15-macro-node-recording/graph/MR9_page_event_record-a54df1454c00eb90.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-15-personal-chat-import/` · 14 files</summary>

- `clear-glass/phases/2026-10-15-personal-chat-import/PI2_the_listener.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/PI3b_the_measured_patterns.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/PI4_the_review_screen.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/PI5_the_crawler.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/PI5_the_sync.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/PI6_the_firefox_script.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/PI7_the_links.phase`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI2_the_listener-d65ed1a624638d21.graph`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI3b_the_measured_patterns-6edf264fc41eb579.graph`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI4_the_review_screen-3419972235b0c3d4.graph`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI5_the_crawler-f8d69ae582cc49df.graph`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI5_the_sync-548476dceeead35e.graph`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI6_the_firefox_script-bf5f6880f62879e2.graph`
- `clear-glass/phases/2026-10-15-personal-chat-import/graph/PI7_the_links-8e6fdc9331be6c5f.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-16-code-tab-rebuild/` · 4 files</summary>

- `clear-glass/phases/2026-10-16-code-tab-rebuild/TB7_runs_tab.phase`
- `clear-glass/phases/2026-10-16-code-tab-rebuild/TB7c_graph_and_zoom.phase`
- `clear-glass/phases/2026-10-16-code-tab-rebuild/graph/TB7_runs_tab-56ae3f6835f01b06.graph`
- `clear-glass/phases/2026-10-16-code-tab-rebuild/graph/TB7c_graph_and_zoom-78e30e5a8955bb39.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-16-google-signin/` · 12 files</summary>

- `clear-glass/phases/2026-10-16-google-signin/GS1_present_as_firefox_on_google_signin.phase`
- `clear-glass/phases/2026-10-16-google-signin/GS2_request_hooks_compose.phase`
- `clear-glass/phases/2026-10-16-google-signin/GS3_domains_and_version.phase`
- `clear-glass/phases/2026-10-16-google-signin/GS4_page_without_a_debugger.phase`
- `clear-glass/phases/2026-10-16-google-signin/GS5_contexts_one_firefox.phase`
- `clear-glass/phases/2026-10-16-google-signin/GS6_proxy.phase`
- `clear-glass/phases/2026-10-16-google-signin/graph/GS1_present_as_firefox_on_google_signin-0c6919648171727e.graph`
- `clear-glass/phases/2026-10-16-google-signin/graph/GS2_request_hooks_compose-0889c4dbc2a8419e.graph`
- `clear-glass/phases/2026-10-16-google-signin/graph/GS3_domains_and_version-be7633a1c9ac3502.graph`
- `clear-glass/phases/2026-10-16-google-signin/graph/GS4_page_without_a_debugger-b89e3f9a2ae563ec.graph`
- `clear-glass/phases/2026-10-16-google-signin/graph/GS5_contexts_one_firefox-8fd91edb7c3ff9cb.graph`
- `clear-glass/phases/2026-10-16-google-signin/graph/GS6_proxy-aea64bd8ae7f3973.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-16-nexus-git-sync/` · 10 files</summary>

- `clear-glass/phases/2026-10-16-nexus-git-sync/GS1_commands.phase`
- `clear-glass/phases/2026-10-16-nexus-git-sync/GS2_nexus_as_a_repo.phase`
- `clear-glass/phases/2026-10-16-nexus-git-sync/GS3_pull_is_a_switch.phase`
- `clear-glass/phases/2026-10-16-nexus-git-sync/GS4_push_policy.phase`
- `clear-glass/phases/2026-10-16-nexus-git-sync/GS6_update_notice.phase`
- `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS1_commands-81faeb652af072b8.graph`
- `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS2_nexus_as_a_repo-202b9f274359c7c1.graph`
- `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS3_pull_is_a_switch-39af288a02e05a34.graph`
- `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS4_push_policy-498533e55109c664.graph`
- `clear-glass/phases/2026-10-16-nexus-git-sync/graph/GS6_update_notice-1d54722ef89351a1.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-16-tls-layer/` · 6 files</summary>

- `clear-glass/phases/2026-10-16-tls-layer/TLS1_helper.phase`
- `clear-glass/phases/2026-10-16-tls-layer/TLS2_clear_glass_runs_it.phase`
- `clear-glass/phases/2026-10-16-tls-layer/TLS3_personas_use_it.phase`
- `clear-glass/phases/2026-10-16-tls-layer/graph/TLS1_helper-65a76242b17b178d.graph`
- `clear-glass/phases/2026-10-16-tls-layer/graph/TLS2_clear_glass_runs_it-b14334ea754ba2f7.graph`
- `clear-glass/phases/2026-10-16-tls-layer/graph/TLS3_personas_use_it-01945ef6a6f43e3f.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-19-gig-autofill-and-learn/` · 23 files</summary>

- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA1_copilot_fills_the_gig.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA1a_a_written_gig_is_remembered.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA2_a_missed_field_asks_the_picker.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA3_the_pick_is_saved_three_ways.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/GA4_the_matcher_learns.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA1_the_matcher_consults_learned.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA2_a_pick_is_saved_per_site.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA3_the_picker_on_a_miss.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA4_the_learn_loop_ui.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/JA5_the_pick_is_also_a_macro.phase`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA1_copilot_fills_the_gig-6d8a7e5ce0db2455.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA1a_a_written_gig_is_remembered-dfa9db0a9ad9b3e7.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA2_a_missed_field_asks_the_picker-5486fbf8b49b9969.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA3_the_pick_is_saved_three_ways-b06bce491aee3a8d.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/GA4_the_matcher_learns-a4442f1b8c96933e.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA1_the_matcher_consults_learned-8650f43be33938ea.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA2_a_pick_is_saved_per_site-af5f76542e8c50de.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA3_the_picker_on_a_miss-5c93f0806d60b930.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA4_the_learn_loop_ui-bf671d3ddbd3bbcc.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/JA5_the_pick_is_also_a_macro-66ae4523314f8948.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA1a_a_written_gig_is_remembered-f600c0df5b9c0f5c.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA2_a_missed_field_asks_the_picker-99874dafdee9dee9.graph`
- `clear-glass/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA3_the_pick_is_saved_three_ways-44b0a16a16b16c5c.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-19-pipeline-root-causes/` · 2 files</summary>

- `clear-glass/phases/2026-10-19-pipeline-root-causes/PR1_page_reader.phase`
- `clear-glass/phases/2026-10-19-pipeline-root-causes/graph/PR1_page_reader-1b941aeeae85b18a.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-19-upload-intent-and-page-map/` · 14 files</summary>

- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM1_blocks.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM2_index_and_chunks.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM3_synthesized_map_that_learns.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM4_intent_to_targets.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM5_tools_routes_commands.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM7_live_injected_map.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/PM8_page_map_panel.phase`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM1_blocks-283abe1c8554e022.graph`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM2_index_and_chunks-7f6219ca6e083920.graph`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM3_synthesized_map_that_learns-96e7aa80c587e8fa.graph`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM4_intent_to_targets-e1554f1dbdf1cb92.graph`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM5_tools_routes_commands-00c3906ed11442c9.graph`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM7_live_injected_map-0026f5b7f1346993.graph`
- `clear-glass/phases/2026-10-19-upload-intent-and-page-map/graph/PM8_page_map_panel-cbb3ab807175cb3c.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-21-adblock/` · 14 files</summary>

- `clear-glass/phases/2026-10-21-adblock/AB1_engine.phase`
- `clear-glass/phases/2026-10-21-adblock/AB2_lists.phase`
- `clear-glass/phases/2026-10-21-adblock/AB3_wiring.phase`
- `clear-glass/phases/2026-10-21-adblock/AB4_surface.phase`
- `clear-glass/phases/2026-10-21-adblock/AB5_import.phase`
- `clear-glass/phases/2026-10-21-adblock/graph/AB1_engine-ce7213dcdf797a4c.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/AB2_lists-403ef9771243dd1b.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/AB3_wiring-0f2843b6cd64ba0b.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/AB4_surface-3faa436c3064d0f8.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/AB5_import-8bd5bbcc7bc580a9.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB1_engine-20cef4608d9b1787.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB2_lists-48ec7173619ce759.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB3_wiring-f21a76a58142b5cf.graph`
- `clear-glass/phases/2026-10-21-adblock/graph/_superseded/AB4_surface-c9c24c363b6af3aa.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-21-brainos-into-idearium/` · 2 files</summary>

- `clear-glass/phases/2026-10-21-brainos-into-idearium/BX10_float.phase`
- `clear-glass/phases/2026-10-21-brainos-into-idearium/graph/BX10_float-718eb952045d7b89.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-21-browser-shell/` · 45 files</summary>

- `clear-glass/phases/2026-10-21-browser-shell/BS10_new_tab.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS11_copilot_pane.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS12_context_automatic.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS13_plugin_settings.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS14_zoom_core.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS15_context_menu.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS16_import_fields.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS17_menu_consolidated.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS18_chrome_context_menus.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS19_ctx_point_from_page.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS1_firefox_import.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS20_bookmark_site_accounts.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS2_shell_rebuild.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS3_menus.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS4_extensions.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS5_downloads_panel.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS6_float_cli.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS7_surface.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS8_design_system.phase`
- `clear-glass/phases/2026-10-21-browser-shell/BS9_agents_hub.phase`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS10_new_tab-e31b41b3f7ee6b17.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS11_copilot_pane-caad6884da55762a.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS12_context_automatic-bf412d88e3d0cd2a.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS13_plugin_settings-1e5c8fe7ff5bb197.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS14_zoom_core-ad165f3fde0be418.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS15_context_menu-afd2ae50d818a04b.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS16_import_fields-598249e869f9e7b4.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS17_menu_consolidated-f5d69e62d20f3d9c.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS18_chrome_context_menus-9123369f3fa7ce07.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS19_ctx_point_from_page-c852821cbea10b9d.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS1_firefox_import-d3c52db1223874d1.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS20_bookmark_site_accounts-17041ebd38f3c392.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS2_shell_rebuild-274f7a19aecede02.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS3_menus-d4a6503f3fdadee9.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS4_extensions-e040b9a57e2237a0.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS5_downloads_panel-f349b0efcf5ca190.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS6_float_cli-1600a40993ac1a76.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS7_surface-650e56a6af5ece66.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS8_design_system-45800c467fe1ee6c.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/BS9_agents_hub-e6c8cd1e2f573362.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS12_context_automatic-0ff3ebe721017029.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS12_context_automatic-953b56c3f6ba45cd.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS14_zoom_core-5aa982aa70280429.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS15_context_menu-b603bd17ec87a808.graph`
- `clear-glass/phases/2026-10-21-browser-shell/graph/_superseded/BS6_float_cli-c0fd47f327b73e8c.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-21-compartment-downloads/` · 12 files</summary>

- `clear-glass/phases/2026-10-21-compartment-downloads/CD1_magnet_parse.phase`
- `clear-glass/phases/2026-10-21-compartment-downloads/CD2_quarantine_downloads.phase`
- `clear-glass/phases/2026-10-21-compartment-downloads/CD3_verified_handoff.phase`
- `clear-glass/phases/2026-10-21-compartment-downloads/CD4_kill_on_disconnect.phase`
- `clear-glass/phases/2026-10-21-compartment-downloads/CD5_surface.phase`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD1_magnet_parse-e3defc132656fe7c.graph`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD2_quarantine_downloads-3d4f0cd284c268ef.graph`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD3_verified_handoff-b1f1f8ce8c648a8f.graph`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD4_kill_on_disconnect-5cffcae8e1562525.graph`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/CD5_surface-925d52606c535ce8.graph`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/_superseded/CD4_kill_on_disconnect-37c214a6e1300775.graph`
- `clear-glass/phases/2026-10-21-compartment-downloads/graph/_superseded/CD5_surface-182f083bae4413ca.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-21-passwords/` · 10 files</summary>

- `clear-glass/phases/2026-10-21-passwords/PW1_service.phase`
- `clear-glass/phases/2026-10-21-passwords/PW2_page.phase`
- `clear-glass/phases/2026-10-21-passwords/PW3_wiring.phase`
- `clear-glass/phases/2026-10-21-passwords/PW4_surface.phase`
- `clear-glass/phases/2026-10-21-passwords/graph/PW1_service-1adb1f53787dac35.graph`
- `clear-glass/phases/2026-10-21-passwords/graph/PW2_page-a3c8be28c7f429ea.graph`
- `clear-glass/phases/2026-10-21-passwords/graph/PW3_wiring-a624445100ffd099.graph`
- `clear-glass/phases/2026-10-21-passwords/graph/PW4_surface-3c20d9cd7701c3e2.graph`
- `clear-glass/phases/2026-10-21-passwords/graph/_superseded/PW1_service-0fb18010d2b4dadf.graph`
- `clear-glass/phases/2026-10-21-passwords/graph/_superseded/PW3_wiring-7f2131c31f53703e.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-21-snowflake-compartment/` · 26 files</summary>

- `clear-glass/phases/2026-10-21-snowflake-compartment/SF1_honest_detection.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF2_bridge_sources.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF3_page_in_the_compartment.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF4_https_only.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF5_circuit_check.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF6_surface.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF7_bridge_automatic.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF8_host_import.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/SF9_install_in_use.phase`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF1_honest_detection-bcc77d2324b63a88.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF2_bridge_sources-ea5b5eea6b68382f.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF3_page_in_the_compartment-0ccd30fdd4450abd.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF4_https_only-502b5c00f2ac8030.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF5_circuit_check-1d7cfbc07fe905be.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF6_surface-87e275793f76b7a7.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF7_bridge_automatic-130bca196028d7d7.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF8_host_import-b02e6f7310f9be5f.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/SF9_install_in_use-0f35a722345fb09e.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF1_honest_detection-8e5bdcaa5c7f6e9f.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF1_honest_detection-e5aa6ec75cff3f9c.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF3_page_in_the_compartment-f34764dd0fbfd96e.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF5_circuit_check-ac5c7c03123bac85.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF5_circuit_check-f8487134f916abcc.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF6_surface-6689d30ab14e6f63.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF6_surface-dfa1169546059591.graph`
- `clear-glass/phases/2026-10-21-snowflake-compartment/graph/_superseded/SF7_bridge_automatic-1fb57e40a95cf705.graph`

</details>

<details>
<summary>`clear-glass/phases/2026-10-23-site-profile-processes/` · 21 files</summary>

- `clear-glass/phases/2026-10-23-site-profile-processes/SP1_one_resolver_for_every_feature.phase`
- `clear-glass/phases/2026-10-23-site-profile-processes/SP2_each_feature_reads_its_site_value.phase`
- `clear-glass/phases/2026-10-23-site-profile-processes/SP3_the_site_settings_screen.phase`
- `clear-glass/phases/2026-10-23-site-profile-processes/SP4_cleardriver_mesh_guardian_settings.phase`
- `clear-glass/phases/2026-10-23-site-profile-processes/SP5_processes_and_activity.phase`
- `clear-glass/phases/2026-10-23-site-profile-processes/SP6_the_processes_screen.phase`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP1_one_resolver_for_every_feature-26dcc9df7dd4d061.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP2_each_feature_reads_its_site_value-5cb374cc92e52409.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP3_the_site_settings_screen-344ad9a833e51ca5.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP4_cleardriver_mesh_guardian_settings-fb57cef4503dcfda.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP5_processes_and_activity-d43cecd51dde3c80.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/SP6_the_processes_screen-ba0b54480cfed70e.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP1_one_resolver_for_every_feature-603b7985ce8f9b73.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP1_one_resolver_for_every_feature-7eae9a633ce4b434.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP2_each_feature_reads_its_site_value-249259a90e6883d4.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP2_each_feature_reads_its_site_value-817ef2353afca489.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP3_the_site_settings_screen-1d671034540d6a5c.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP4_cleardriver_mesh_guardian_settings-4ef5b98a501e3da4.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP4_cleardriver_mesh_guardian_settings-daaaec093ead2831.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP5_processes_and_activity-ca2e1a930897994f.graph`
- `clear-glass/phases/2026-10-23-site-profile-processes/graph/_superseded/SP6_the_processes_screen-d170b15d089baaf0.graph`

</details>

<details>
<summary>`clear-glass/phases/clearglass-agent-suite-and-cfr-loom/` · 16 files</summary>

- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX12_bookmark_reconciliation.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX13_browser_chrome_backlog.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX15_whisper_as_a_real_optional_capability.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX16_persistent_listener_registry_and_callable_elements.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX3_talk_to_agent_launcher.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX5_backup_snapshot_for_talk_to_agent.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX6_stop_using_this_chat_migration.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/TX8_3d_cfr_visual_for_loom.phase`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX12_bookmark_reconciliation-c7c761c27904fff6.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX13_browser_chrome_backlog-6657fef2cd1f6328.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX15_whisper_as_a_real_optional_capability-9064ceff1c0912a4.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX16_persistent_listener_registry_and_callable_elements-22078f9597907db9.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX3_talk_to_agent_launcher-095e5e9f21e07bf9.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX5_backup_snapshot_for_talk_to_agent-c39c26b3536d05a0.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX6_stop_using_this_chat_migration-70835de8de91fd23.graph`
- `clear-glass/phases/clearglass-agent-suite-and-cfr-loom/graph/TX8_3d_cfr_visual_for_loom-ebbf61ff54a94603.graph`

</details>

<details>
<summary>`clear-glass/phases/copilot-autonomous/` · 2 files</summary>

- `clear-glass/phases/copilot-autonomous/CA2_triggers_conditions.phase`
- `clear-glass/phases/copilot-autonomous/graph/CA2_triggers_conditions-92729b5ec5388a88.graph`

</details>

<details>
<summary>`clear-glass/phases/copilot-awareness-routing/` · 8 files</summary>

- `clear-glass/phases/copilot-awareness-routing/CA1_status_report.phase`
- `clear-glass/phases/copilot-awareness-routing/CA3_tool_first.phase`
- `clear-glass/phases/copilot-awareness-routing/CA4_capability_extend.phase`
- `clear-glass/phases/copilot-awareness-routing/CA7_clearglass_multi_account.phase`
- `clear-glass/phases/copilot-awareness-routing/graph/CA1_status_report-12cbbffc8d376eab.graph`
- `clear-glass/phases/copilot-awareness-routing/graph/CA3_tool_first-913f66ec208c6737.graph`
- `clear-glass/phases/copilot-awareness-routing/graph/CA4_capability_extend-7ebf1286b0abb9d9.graph`
- `clear-glass/phases/copilot-awareness-routing/graph/CA7_clearglass_multi_account-efcdff2b11c0d466.graph`

</details>

<details>
<summary>`clear-glass/phases/copilot-full-capability/` · 4 files</summary>

- `clear-glass/phases/copilot-full-capability/P5_clear_glass_url_tools.phase`
- `clear-glass/phases/copilot-full-capability/P8_rewind_replay_tool.phase`
- `clear-glass/phases/copilot-full-capability/graph/P5_clear_glass_url_tools-f149cbe6b2883fce.graph`
- `clear-glass/phases/copilot-full-capability/graph/P8_rewind_replay_tool-ad52bfced684ea88.graph`

</details>

<details>
<summary>`clear-glass/phases/nexus-self-build-pipeline/` · 2 files</summary>

- `clear-glass/phases/nexus-self-build-pipeline/SB9_full_clearglass_control.phase`
- `clear-glass/phases/nexus-self-build-pipeline/graph/SB9_full_clearglass_control-77c994bfadf395ac.graph`

</details>

<details>
<summary>`clear-glass/phases/raid-verification-spine/` · 9 files</summary>

- `clear-glass/phases/raid-verification-spine/P2_constitution_on_the_approve_path.phase`
- `clear-glass/phases/raid-verification-spine/P4_sigma_and_drift_scoring.phase`
- `clear-glass/phases/raid-verification-spine/P5_compare_contract_vs_output.phase`
- `clear-glass/phases/raid-verification-spine/P7_one_raid_verify_entrypoint.phase`
- `clear-glass/phases/raid-verification-spine/graph/P2_constitution_on_the_approve_path-c2b44c2f71d1648f.graph`
- `clear-glass/phases/raid-verification-spine/graph/P4_sigma_and_drift_scoring-0bc9660bb9269c47.graph`
- `clear-glass/phases/raid-verification-spine/graph/P5_compare_contract_vs_output-056dbb544ba1058f.graph`
- `clear-glass/phases/raid-verification-spine/graph/P7_one_raid_verify_entrypoint-f6475ea7b7f6cac4.graph`
- `clear-glass/phases/raid-verification-spine/graph/_superseded/P2_constitution_on_the_approve_path-f38f5f3bd87e3832.graph`

</details>

<details>
<summary>`clear-glass/phases/raid-warp-verification/` · 17 files</summary>

- `clear-glass/phases/raid-warp-verification/P11_diagnose_and_repair_on_prompt.phase`
- `clear-glass/phases/raid-warp-verification/P1_raid_records_every_decision.phase`
- `clear-glass/phases/raid-warp-verification/P2_constitution_gate.phase`
- `clear-glass/phases/raid-warp-verification/P3_cos_isolate_and_verify.phase`
- `clear-glass/phases/raid-warp-verification/P4_sigma_drift_score.phase`
- `clear-glass/phases/raid-warp-verification/P5_compare_contract_vs_output.phase`
- `clear-glass/phases/raid-warp-verification/P7_one_raid_verify_spine.phase`
- `clear-glass/phases/raid-warp-verification/P8_ui_as_copilot_tools.phase`
- `clear-glass/phases/raid-warp-verification/graph/P11_diagnose_and_repair_on_prompt-fd9f03d8e2ba0434.graph`
- `clear-glass/phases/raid-warp-verification/graph/P1_raid_records_every_decision-50590a227a1bc452.graph`
- `clear-glass/phases/raid-warp-verification/graph/P2_constitution_gate-8aac611e5c52d941.graph`
- `clear-glass/phases/raid-warp-verification/graph/P3_cos_isolate_and_verify-3c5807492e4c58ca.graph`
- `clear-glass/phases/raid-warp-verification/graph/P4_sigma_drift_score-f97bb1eb7af72c05.graph`
- `clear-glass/phases/raid-warp-verification/graph/P5_compare_contract_vs_output-aee6030d764aba5b.graph`
- `clear-glass/phases/raid-warp-verification/graph/P7_one_raid_verify_spine-d51684d9b6de9d1f.graph`
- `clear-glass/phases/raid-warp-verification/graph/P8_ui_as_copilot_tools-34bbffc617747a9c.graph`
- `clear-glass/phases/raid-warp-verification/graph/_superseded/P2_constitution_gate-dff121c29106c93f.graph`

</details>

<details>
<summary>`clear-glass/phases/rich-atlas/` · 4 files</summary>

- `clear-glass/phases/rich-atlas/AT1_full_enumeration_and_clickable_links.phase`
- `clear-glass/phases/rich-atlas/AT3_agent_queryable_atlas.phase`
- `clear-glass/phases/rich-atlas/graph/AT1_full_enumeration_and_clickable_links-b44d8db195669926.graph`
- `clear-glass/phases/rich-atlas/graph/AT3_agent_queryable_atlas-528df862578c4752.graph`

</details>

<details>
<summary>`clear-glass/plugins/adblocker/` · 2 files</summary>

- `clear-glass/plugins/adblocker/index.js` — plugins/adblocker/index.js — the Ad Blocker plugin: the surface of Clear Glass's content blocker (AB3,…
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

- `clear-glass/plugins/passwords/index.js` — PW4 (0.60.186) — James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the…
- `clear-glass/plugins/passwords/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/permissions/` · 2 files</summary>

- `clear-glass/plugins/permissions/index.js` — plugins/permissions/index.js — real permission-filter contribution. §UPDATED 2026-08-24 — now consults the…
- `clear-glass/plugins/permissions/manifest.json`

</details>

<details>
<summary>`clear-glass/plugins/snowflake/` · 2 files</summary>

- `clear-glass/plugins/snowflake/index.js` — plugins/snowflake/index.js — "Open link with Snowflake" (context-menu-item), NP11/NP12; its page (settings),…
- `clear-glass/plugins/snowflake/manifest.json`

</details>

<details>
<summary>`clear-glass/renderer/` · 20 files</summary>

- `clear-glass/renderer/browser.css`
- `clear-glass/renderer/browser.html`
- `clear-glass/renderer/browser.js`
- `clear-glass/renderer/copilot-cli.js`
- `clear-glass/renderer/cos-theme.css`
- `clear-glass/renderer/float-cli.css`
- `clear-glass/renderer/float-cli.html`
- `clear-glass/renderer/float-cli.js`
- `clear-glass/renderer/gig-panel.js`
- `clear-glass/renderer/guardian-picker.js`
- `clear-glass/renderer/library.html`
- `clear-glass/renderer/mesh-picker.js`
- `clear-glass/renderer/page-map-panel.js`
- `clear-glass/renderer/processes.css`
- `clear-glass/renderer/processes.html`
- `clear-glass/renderer/processes.js`
- `clear-glass/renderer/selector-check.js`
- `clear-glass/renderer/settings.html`
- `clear-glass/renderer/site-profile-groups.css`
- `clear-glass/renderer/site-profile-groups.js`

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
<summary>`clear-glass/renderer/settings/` · 49 files</summary>

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
- `clear-glass/renderer/settings/sections/driver.css`
- `clear-glass/renderer/settings/sections/driver.js`
- `clear-glass/renderer/settings/sections/eros.css`
- `clear-glass/renderer/settings/sections/eros.js`
- `clear-glass/renderer/settings/sections/fingerprint.css`
- `clear-glass/renderer/settings/sections/fingerprint.js`
- `clear-glass/renderer/settings/sections/general.css`
- `clear-glass/renderer/settings/sections/general.js`
- `clear-glass/renderer/settings/sections/guardian.css`
- `clear-glass/renderer/settings/sections/guardian.js`
- `clear-glass/renderer/settings/sections/import.css`
- `clear-glass/renderer/settings/sections/import.js`
- `clear-glass/renderer/settings/sections/macros.css`
- `clear-glass/renderer/settings/sections/macros.js`
- `clear-glass/renderer/settings/sections/mesh.css`
- `clear-glass/renderer/settings/sections/mesh.js`
- `clear-glass/renderer/settings/sections/network.css`
- `clear-glass/renderer/settings/sections/network.js`
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
<summary>`clear-glass/renderer/shell/` · 12 files</summary>

- `clear-glass/renderer/shell/agents.js`
- `clear-glass/renderer/shell/copilot.css`
- `clear-glass/renderer/shell/ctxmenu.js`
- `clear-glass/renderer/shell/downloads.js`
- `clear-glass/renderer/shell/extensions.js`
- `clear-glass/renderer/shell/icons.js`
- `clear-glass/renderer/shell/menus.js`
- `clear-glass/renderer/shell/newtab.js`
- `clear-glass/renderer/shell/passwords.js`
- `clear-glass/renderer/shell/shell.css`
- `clear-glass/renderer/shell/shell.js`
- `clear-glass/renderer/shell/toolbar.css`

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
<summary>`clear-glass/spec/` · 11 files</summary>

- `clear-glass/spec/adblock.spec`
- `clear-glass/spec/browser-shell.spec`
- `clear-glass/spec/clear-glass.node-taxonomy.md`
- `clear-glass/spec/clear-glass.spec`
- `clear-glass/spec/compartment-downloads.spec`
- `clear-glass/spec/design-surface.spec`
- `clear-glass/spec/guided-browser.spec`
- `clear-glass/spec/passwords.spec`
- `clear-glass/spec/semantic-tree.spec`
- `clear-glass/spec/site-profile.spec`
- `clear-glass/spec/snowflake.spec`

</details>

<details>
<summary>`clear-glass/src/` · 1 file</summary>

- `clear-glass/src/event-taxonomy.js` — (userscript // errors). Every event below is copied from the actual real emit()

</details>

<details>
<summary>`clear-glass/src/accounts/` · 3 files</summary>

- `clear-glass/src/accounts/for-site.js` — which of his accounts are signed in to a site (BS20, 0.60.185). Spec: clear-glass/spec/browser-shell.spec…
- `clear-glass/src/accounts/idearium-login.js` — src/accounts/idearium-login.js — Clear Glass signs in to Idearium for you (IA4,…
- `clear-glass/src/accounts/login-portal.js`

</details>

<details>
<summary>`clear-glass/src/adblock/` · 3 files</summary>

- `clear-glass/src/adblock/engine.js` — the content blocker's engine: filter lists parsed, requests matched, element hiding per page (AB1,…
- `clear-glass/src/adblock/import.js` — his own lists: files, folders, host lists (AB5, 0.60.184). Spec: clear-glass/spec/adblock.spec…
- `clear-glass/src/adblock/lists.js` — the blocker's lists, state and store, and the one service a process has (AB2, 0.60.183). Spec:…

</details>

<details>
<summary>`clear-glass/src/api/` · 1 file</summary>

- `clear-glass/src/api/settings.js` — src/api/settings.js — NEXUS Connection Settings Stores NEXUS service ports and co-pilot routing config.

</details>

<details>
<summary>`clear-glass/src/autofill/` · 5 files</summary>

- `clear-glass/src/autofill/gig.js`
- `clear-glass/src/autofill/learn-pick.js`
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
<summary>`clear-glass/src/copilot/` · 7 files</summary>

- `clear-glass/src/copilot/bridge.js`
- `clear-glass/src/copilot/chat-store.js` — the co-pilot pane's conversation, kept. §0.39.278 — James: "copilot and clearglass, isnt really working. its…
- `clear-glass/src/copilot/context-need.js` — what a message needs from the page, decided before any model is asked (BS12, 0.60.182). Spec:…
- `clear-glass/src/copilot/hat.js` — src/copilot/hat.js — the Clear Glass hat component_id: cg.copilot.hat
- `clear-glass/src/copilot/tools.js` — src/copilot/tools.js — Co-pilot Tool Registry Every Clear Glass capability the co-pilot can invoke, declared…
- `clear-glass/src/copilot/verbs.js`
- `clear-glass/src/copilot/wake-relay.js` — src/copilot/wake-relay.js — closes the real loop James described: "hey nexus" said in any agent tab ->…

</details>

<details>
<summary>`clear-glass/src/core/` · 2 files</summary>

- `clear-glass/src/core/bus.js` — src/core/bus.js — Clear Glass Central SISO Bus The single Stream that owns all Clear Glass events.
- `clear-glass/src/core/zoom.js` — page zoom, one implementation in Clear Glass's core (BS14, 0.60.183). Spec:…

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
<summary>`clear-glass/src/driver/` · 7 files</summary>

- `clear-glass/src/driver/cg-stub.js` — a stand-in window.ClearGlass for driving Clear Glass's own pages in its engine (glass.js) without the…
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
<summary>`clear-glass/src/import/` · 1 file</summary>

- `clear-glass/src/import/firefox.js` — bring a Firefox profile into Clear Glass, for real (BS1, 0.60.179). Spec:…

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
<summary>`clear-glass/src/main/` · 6 files</summary>

- `clear-glass/src/main/compartment-window.js` — idearium's pop-out pages as COS-compartment windows. §0.39.280. James: "can you have the electron popup…
- `clear-glass/src/main/float-cli.js` — the floating CLI's own window (BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-FLOAT-CLI.…
- `clear-glass/src/main/index.js` — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):
- `clear-glass/src/main/index.pre-userscripts.js` — src/main/index.js — Clear Glass v3 SISO-native boot Boot order (law — §3.1 bottom-up only):
- `clear-glass/src/main/passwords-wiring.js` — pages ↔ the password service ↔ the window (PW3, 0.60.186). Spec: clear-glass/spec/passwords.spec…
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
<summary>`clear-glass/src/net/` · 12 files</summary>

- `clear-glass/src/net/bridge-sources.js`
- `clear-glass/src/net/compartment.js`
- `clear-glass/src/net/host-import.js`
- `clear-glass/src/net/https-only.js`
- `clear-glass/src/net/installer.js`
- `clear-glass/src/net/kill-switch.js`
- `clear-glass/src/net/magnet.js`
- `clear-glass/src/net/policy.js`
- `clear-glass/src/net/qbittorrent.js`
- `clear-glass/src/net/quarantine.js`
- `clear-glass/src/net/service.js`
- `clear-glass/src/net/transport-host.js`

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
<summary>`clear-glass/src/page/` · 9 files</summary>

- `clear-glass/src/page/attention.js`
- `clear-glass/src/page/blocks.js`
- `clear-glass/src/page/field.js`
- `clear-glass/src/page/nexus-chat.js`
- `clear-glass/src/page/page-map.js`
- `clear-glass/src/page/page-memory.js`
- `clear-glass/src/page/page-session.js`
- `clear-glass/src/page/reader.js`
- `clear-glass/src/page/semantic-tree.js`

</details>

<details>
<summary>`clear-glass/src/passwords/` · 2 files</summary>

- `clear-glass/src/passwords/service.js` — the one door between pages, the window and the password vault (PW1, 0.60.186). Spec:…
- `clear-glass/src/passwords/vault.js`

</details>

<details>
<summary>`clear-glass/src/plugins/` · 7 files</summary>

- `clear-glass/src/plugins/context-items.js` — src/plugins/context-items.js — the right-click menu entries plugins contribute (contribution type…
- `clear-glass/src/plugins/contribution-types.js`
- `clear-glass/src/plugins/host.js`
- `clear-glass/src/plugins/permission-adapter.js` — src/plugins/permission-adapter.js — permission-filter ↔ Electron wiring §HONEST LIMIT — traced against…
- `clear-glass/src/plugins/schema.js`
- `clear-glass/src/plugins/webextensions.js` — src/plugins/webextensions.js — Chrome WebExtensions in Clear Glass component_id: cg.plugins.webextensions
- `clear-glass/src/plugins/webrequest-adapter.js` — src/plugins/webrequest-adapter.js — content-filter ↔ Electron wiring §HONEST LIMIT — traced against real,…

</details>

<details>
<summary>`clear-glass/src/preload/` · 5 files</summary>

- `clear-glass/src/preload/compartment-window.js` — // clear-glass/src/preload/compartment-window.js — §0.39.280. The only thing idearium's compartment windows…
- `clear-glass/src/preload/google-signin.js` — src/preload/google-signin.js — a session preload: on Google's sign-in pages, before Google's own scripts…
- `clear-glass/src/preload/index.js` — Preload — contextIsolation bridge Exposes a minimal, typed API to the renderer.
- `clear-glass/src/preload/passwords.js` — the page side of the password manager (PW2, 0.60.186). Spec: clear-glass/spec/passwords.spec MOD-PW-PAGE.…
- `clear-glass/src/preload/webview-bridge.js` — src/preload/webview-bridge.js §BUILD 2026-07-09 — the injected PICKER_SCRIPT in renderer/browser.html

</details>

<details>
<summary>`clear-glass/src/processes/` · 1 file</summary>

- `clear-glass/src/processes/index.js`

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
<summary>`clear-glass/src/rewind/` · 2 files</summary>

- `clear-glass/src/rewind/engine.js` — src/rewind/engine.js — Clear Glass Rewind Engine Rewind is the session time-machine. Every N seconds (or on…
- `clear-glass/src/rewind/resume.js` — a site's "resume state": on a revisit, put back where he was (SP2, 0.60.216). Spec:…

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
<summary>`clear-glass/src/site-settings/` · 4 files</summary>

- `clear-glass/src/site-settings/keys.js` — the per-site keys every feature reads (SP1, 0.60.215). Spec: clear-glass/spec/site-profile.spec MOD-SP-KEYS…
- `clear-glass/src/site-settings/profile.js` — one site's settings for every feature, through one resolver (SP1, 0.60.215). Spec:…
- `clear-glass/src/site-settings/readers.js` — each feature reads its site value at its decision point (SP2, 0.60.216). Spec:…
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

90 release notes name a file of clear-glass: 0.60.232., 0.60.231., 0.60.230., 0.60.226., 0.60.225., 0.60.220., 0.60.219., 0.60.218., 0.60.217., 0.60.216., 0.60.215., 0.60.214., 0.60.213., 0.60.211., 0.60.210., 0.60.206., 0.60.204., 0.60.183., 0.60.179., 0.60.178., 0.60.175., 0.60.174., 0.60.149., 0.60.146., 0.60.145., 0.60.137., 0.60.131., 0.60.109., 0.60.108., 0.60.106., 0.60.93., 0.60.85., 0.60.84., 0.60.71., 0.60.70., 0.60.69., 0.60.60., 0.60.58., 0.60.55., 0.60.54., and 50 older. Each is in the version history below, in his words.

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

Cos is 476 files in 66 modules, spec `cos/spec/cos.spec`. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/cos-atlas.md`.

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
<summary>`cos/phases/` · 1 file</summary>

- `cos/phases/INDEX.md` — cos — its phases

</details>

<details>
<summary>`cos/phases/2026-08-22-session-full/` · 2 files</summary>

- `cos/phases/2026-08-22-session-full/SF6_wiring_gaps_applied.phase`
- `cos/phases/2026-08-22-session-full/graph/SF6_wiring_gaps_applied-2514d77da46a8488.graph`

</details>

<details>
<summary>`cos/phases/2026-08-28-self-building-pipeline/` · 2 files</summary>

- `cos/phases/2026-08-28-self-building-pipeline/SBP2_loom_idearium_template_to_cos_blueprint_bridge.phase`
- `cos/phases/2026-08-28-self-building-pipeline/graph/SBP2_loom_idearium_template_to_cos_blueprint_bridge-dea73234c887a0ea.graph`

</details>

<details>
<summary>`cos/phases/2026-09-11-compartment-nodetype-and-reorg/` · 2 files</summary>

- `cos/phases/2026-09-11-compartment-nodetype-and-reorg/T3_warp_replaces_siso.phase`
- `cos/phases/2026-09-11-compartment-nodetype-and-reorg/graph/T3_warp_replaces_siso-4a279856f4f7d1cc.graph`

</details>

<details>
<summary>`cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/` · 8 files</summary>

- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T1.phase`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T2.phase`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T4.phase`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T5.phase`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T1-ea5089d771a5cc69.graph`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T2-b9eb08e456c5fca6.graph`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T4-fc078d75e30b8beb.graph`
- `cos/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T5-196f20cd476129df.graph`

</details>

<details>
<summary>`cos/phases/2026-09-28-graph-build-context-settings-memory/` · 2 files</summary>

- `cos/phases/2026-09-28-graph-build-context-settings-memory/B4.phase`
- `cos/phases/2026-09-28-graph-build-context-settings-memory/graph/B4-220b4ae717d05c04.graph`

</details>

<details>
<summary>`cos/phases/2026-09-28-staging-self-heal/` · 2 files</summary>

- `cos/phases/2026-09-28-staging-self-heal/S3.phase`
- `cos/phases/2026-09-28-staging-self-heal/graph/S3-9e150090cf73a41d.graph`

</details>

<details>
<summary>`cos/phases/2026-09-29-build-surface/` · 4 files</summary>

- `cos/phases/2026-09-29-build-surface/BS14_branch_git_honest.phase`
- `cos/phases/2026-09-29-build-surface/BS4_environment_check.phase`
- `cos/phases/2026-09-29-build-surface/graph/BS14_branch_git_honest-3478da45faa77597.graph`
- `cos/phases/2026-09-29-build-surface/graph/BS4_environment_check-acea625c798e9a60.graph`

</details>

<details>
<summary>`cos/phases/2026-09-29-nex-node-store/` · 2 files</summary>

- `cos/phases/2026-09-29-nex-node-store/N20_desktop_login.phase`
- `cos/phases/2026-09-29-nex-node-store/graph/N20_desktop_login-4254a95488f078bd.graph`

</details>

<details>
<summary>`cos/phases/2026-09-30-idearium-coding-flow/` · 2 files</summary>

- `cos/phases/2026-09-30-idearium-coding-flow/W1_idearium_never_blocks_on_git.phase`
- `cos/phases/2026-09-30-idearium-coding-flow/graph/W1_idearium_never_blocks_on_git-0c2b3bd63ecb5cb9.graph`

</details>

<details>
<summary>`cos/phases/2026-10-01-idearium-agent-ready-master/` · 4 files</summary>

- `cos/phases/2026-10-01-idearium-agent-ready-master/DK1_desktop_image_and_login.phase`
- `cos/phases/2026-10-01-idearium-agent-ready-master/DK3_vm_engines.phase`
- `cos/phases/2026-10-01-idearium-agent-ready-master/graph/DK1_desktop_image_and_login-0ce31841af1a7c24.graph`
- `cos/phases/2026-10-01-idearium-agent-ready-master/graph/DK3_vm_engines-c8c57bc98a3b8bdc.graph`

</details>

<details>
<summary>`cos/phases/2026-10-01-work-visibility-job-reuse/` · 2 files</summary>

- `cos/phases/2026-10-01-work-visibility-job-reuse/D1.phase`
- `cos/phases/2026-10-01-work-visibility-job-reuse/graph/D1-651a6b744089f017.graph`

</details>

<details>
<summary>`cos/phases/2026-10-02-emerge-field-memory-build/` · 2 files</summary>

- `cos/phases/2026-10-02-emerge-field-memory-build/LB1_the_end_state_lab.phase`
- `cos/phases/2026-10-02-emerge-field-memory-build/graph/LB1_the_end_state_lab-e780bee785bbcbb0.graph`

</details>

<details>
<summary>`cos/phases/2026-10-02-workshop-codex-rewind/` · 2 files</summary>

- `cos/phases/2026-10-02-workshop-codex-rewind/RW1_rewind_engine_vm_snapshots.phase`
- `cos/phases/2026-10-02-workshop-codex-rewind/graph/RW1_rewind_engine_vm_snapshots-823f1c8b9650eab6.graph`

</details>

<details>
<summary>`cos/phases/2026-10-05-build-from-the-spec/` · 2 files</summary>

- `cos/phases/2026-10-05-build-from-the-spec/SB46_every_step_by_hand.phase`
- `cos/phases/2026-10-05-build-from-the-spec/graph/SB46_every_step_by_hand-357aee72b6d95aa7.graph`

</details>

<details>
<summary>`cos/phases/2026-10-05-cli-data-code/` · 2 files</summary>

- `cos/phases/2026-10-05-cli-data-code/PB4_imports_inside_text_are_not_imports.phase`
- `cos/phases/2026-10-05-cli-data-code/graph/PB4_imports_inside_text_are_not_imports-d0e4233a40cc3822.graph`

</details>

<details>
<summary>`cos/phases/2026-10-05-cos-machines/` · 16 files</summary>

- `cos/phases/2026-10-05-cos-machines/AP1_android_build_compartment.phase`
- `cos/phases/2026-10-05-cos-machines/AP3_release_like_an_enterprise.phase`
- `cos/phases/2026-10-05-cos-machines/EL1_electron_compiler.phase`
- `cos/phases/2026-10-05-cos-machines/OS1_compartments_as_operating_systems.phase`
- `cos/phases/2026-10-05-cos-machines/OS2_images_downloaded_and_kept_current.phase`
- `cos/phases/2026-10-05-cos-machines/SU1_the_setup_asks_the_os_and_its_version.phase`
- `cos/phases/2026-10-05-cos-machines/SU2_every_language_and_the_repos_own_dependencies.phase`
- `cos/phases/2026-10-05-cos-machines/VM1_control_like_vmware.phase`
- `cos/phases/2026-10-05-cos-machines/graph/AP1_android_build_compartment-f70e475fce428144.graph`
- `cos/phases/2026-10-05-cos-machines/graph/AP3_release_like_an_enterprise-84659775a8f5692d.graph`
- `cos/phases/2026-10-05-cos-machines/graph/EL1_electron_compiler-1d546cb97bd68077.graph`
- `cos/phases/2026-10-05-cos-machines/graph/OS1_compartments_as_operating_systems-b747eb322d0734a6.graph`
- `cos/phases/2026-10-05-cos-machines/graph/OS2_images_downloaded_and_kept_current-7a1fb496219ebe9e.graph`
- `cos/phases/2026-10-05-cos-machines/graph/SU1_the_setup_asks_the_os_and_its_version-9797666d275643e9.graph`
- `cos/phases/2026-10-05-cos-machines/graph/SU2_every_language_and_the_repos_own_dependencies-0d04ebd8abe18320.graph`
- `cos/phases/2026-10-05-cos-machines/graph/VM1_control_like_vmware-6722ac63e2d3dd68.graph`

</details>

<details>
<summary>`cos/phases/2026-10-07-compartment-control-and-activity/` · 2 files</summary>

- `cos/phases/2026-10-07-compartment-control-and-activity/VM1_checkpoints_on_the_log.phase`
- `cos/phases/2026-10-07-compartment-control-and-activity/graph/VM1_checkpoints_on_the_log-120f9c6befec0413.graph`

</details>

<details>
<summary>`cos/phases/2026-10-10-idearium-solid/` · 2 files</summary>

- `cos/phases/2026-10-10-idearium-solid/SD13_the_machine_is_cos.phase`
- `cos/phases/2026-10-10-idearium-solid/graph/SD13_the_machine_is_cos-1141a9ac8cf919f0.graph`

</details>

<details>
<summary>`cos/phases/2026-10-10-shape-of-nexus/` · 2 files</summary>

- `cos/phases/2026-10-10-shape-of-nexus/EP2_cos_is_the_empirical_layer.phase`
- `cos/phases/2026-10-10-shape-of-nexus/graph/EP2_cos_is_the_empirical_layer-abb7cdf7233d1a4c.graph`

</details>

<details>
<summary>`cos/phases/2026-10-10-snapshot-compartments/` · 4 files</summary>

- `cos/phases/2026-10-10-snapshot-compartments/SN0_one_branch.phase`
- `cos/phases/2026-10-10-snapshot-compartments/SN2_run_in_parallel.phase`
- `cos/phases/2026-10-10-snapshot-compartments/graph/SN0_one_branch-1e77410bef5d0634.graph`
- `cos/phases/2026-10-10-snapshot-compartments/graph/SN2_run_in_parallel-e5161f5f9848abe0.graph`

</details>

<details>
<summary>`cos/phases/2026-10-12-request-spine/` · 4 files</summary>

- `cos/phases/2026-10-12-request-spine/RQ15_cells_in_parallel.phase`
- `cos/phases/2026-10-12-request-spine/RQ18_test_and_attack_intents.phase`
- `cos/phases/2026-10-12-request-spine/graph/RQ15_cells_in_parallel-9586f7906829df41.graph`
- `cos/phases/2026-10-12-request-spine/graph/RQ18_test_and_attack_intents-8496c9d2a82eb910.graph`

</details>

<details>
<summary>`cos/phases/2026-10-13-projects-raid-and-gates/` · 2 files</summary>

- `cos/phases/2026-10-13-projects-raid-and-gates/CK0_the_catalogue_written.phase`
- `cos/phases/2026-10-13-projects-raid-and-gates/graph/CK0_the_catalogue_written-79d0db81c79ea43f.graph`

</details>

<details>
<summary>`cos/phases/2026-10-15-cos-app/` · 14 files</summary>

- `cos/phases/2026-10-15-cos-app/COSA10_compartment_window.phase`
- `cos/phases/2026-10-15-cos-app/COSA11_nested_tree.phase`
- `cos/phases/2026-10-15-cos-app/COSA13_auto_update.phase`
- `cos/phases/2026-10-15-cos-app/COSA1_version_store_and_import.phase`
- `cos/phases/2026-10-15-cos-app/COSA2_runtime_and_dependencies.phase`
- `cos/phases/2026-10-15-cos-app/COSA3_run_and_supervise.phase`
- `cos/phases/2026-10-15-cos-app/COSA4_switch_and_rollback.phase`
- `cos/phases/2026-10-15-cos-app/graph/COSA10_compartment_window-b221406d3e785772.graph`
- `cos/phases/2026-10-15-cos-app/graph/COSA11_nested_tree-38fee2523eb2eed8.graph`
- `cos/phases/2026-10-15-cos-app/graph/COSA13_auto_update-5d782bdcac57ed2b.graph`
- `cos/phases/2026-10-15-cos-app/graph/COSA1_version_store_and_import-e72f32ca6a953d76.graph`
- `cos/phases/2026-10-15-cos-app/graph/COSA2_runtime_and_dependencies-df3ed9356c77d331.graph`
- `cos/phases/2026-10-15-cos-app/graph/COSA3_run_and_supervise-d173bfd7f8056f35.graph`
- `cos/phases/2026-10-15-cos-app/graph/COSA4_switch_and_rollback-3bc800982689e9a5.graph`

</details>

<details>
<summary>`cos/phases/2026-10-15-gate-held-work/` · 8 files</summary>

- `cos/phases/2026-10-15-gate-held-work/GW11_a_snapshot_per_gate.phase`
- `cos/phases/2026-10-15-gate-held-work/GW12_desktop_is_optional.phase`
- `cos/phases/2026-10-15-gate-held-work/GW13_the_sandbox_door.phase`
- `cos/phases/2026-10-15-gate-held-work/GW14_copy_in_diff_out.phase`
- `cos/phases/2026-10-15-gate-held-work/graph/GW11_a_snapshot_per_gate-c999f94ef6a49515.graph`
- `cos/phases/2026-10-15-gate-held-work/graph/GW12_desktop_is_optional-382b3d3a9de3de0f.graph`
- `cos/phases/2026-10-15-gate-held-work/graph/GW13_the_sandbox_door-4f040753e8ae2406.graph`
- `cos/phases/2026-10-15-gate-held-work/graph/GW14_copy_in_diff_out-581149a84eca7d04.graph`

</details>

<details>
<summary>`cos/phases/2026-10-16-canvas-compartments/` · 6 files</summary>

- `cos/phases/2026-10-16-canvas-compartments/CN1_canvas_archetype.phase`
- `cos/phases/2026-10-16-canvas-compartments/CN2_tool_archetypes.phase`
- `cos/phases/2026-10-16-canvas-compartments/CN5_idearium.phase`
- `cos/phases/2026-10-16-canvas-compartments/graph/CN1_canvas_archetype-80bf09efae3df71b.graph`
- `cos/phases/2026-10-16-canvas-compartments/graph/CN2_tool_archetypes-9e4df65ef5b2a643.graph`
- `cos/phases/2026-10-16-canvas-compartments/graph/CN5_idearium-cd3acbaaaaf6698a.graph`

</details>

<details>
<summary>`cos/phases/2026-10-16-cos-console/` · 12 files</summary>

- `cos/phases/2026-10-16-cos-console/CON1_one_door_client.phase`
- `cos/phases/2026-10-16-cos-console/CON3_system_controls.phase`
- `cos/phases/2026-10-16-cos-console/CON4_safety_gate.phase`
- `cos/phases/2026-10-16-cos-console/CON6_shell_escape.phase`
- `cos/phases/2026-10-16-cos-console/CON7_enterprise_bar.phase`
- `cos/phases/2026-10-16-cos-console/CON9_configure.phase`
- `cos/phases/2026-10-16-cos-console/graph/CON1_one_door_client-09df167b6e5084dc.graph`
- `cos/phases/2026-10-16-cos-console/graph/CON3_system_controls-9bea20876814d6b2.graph`
- `cos/phases/2026-10-16-cos-console/graph/CON4_safety_gate-6aeb5837dbad6f77.graph`
- `cos/phases/2026-10-16-cos-console/graph/CON6_shell_escape-a539b2efcad651dc.graph`
- `cos/phases/2026-10-16-cos-console/graph/CON7_enterprise_bar-5de970d3b3bb3578.graph`
- `cos/phases/2026-10-16-cos-console/graph/CON9_configure-f5b6397fdf950de4.graph`

</details>

<details>
<summary>`cos/phases/2026-10-16-mobile-compartments/` · 10 files</summary>

- `cos/phases/2026-10-16-mobile-compartments/MB1_terminal_passthrough.phase`
- `cos/phases/2026-10-16-mobile-compartments/MB2_android_compartment.phase`
- `cos/phases/2026-10-16-mobile-compartments/MB3_testenv_stacks.phase`
- `cos/phases/2026-10-16-mobile-compartments/MB4_apple_via_a_real_mac.phase`
- `cos/phases/2026-10-16-mobile-compartments/MB6_everything_else.phase`
- `cos/phases/2026-10-16-mobile-compartments/graph/MB1_terminal_passthrough-eff48fb25b66e772.graph`
- `cos/phases/2026-10-16-mobile-compartments/graph/MB2_android_compartment-9674795718df2e8a.graph`
- `cos/phases/2026-10-16-mobile-compartments/graph/MB3_testenv_stacks-e76b4664f81e1e35.graph`
- `cos/phases/2026-10-16-mobile-compartments/graph/MB4_apple_via_a_real_mac-7d75149232a2bd8e.graph`
- `cos/phases/2026-10-16-mobile-compartments/graph/MB6_everything_else-50374ed305625db3.graph`

</details>

<details>
<summary>`cos/phases/2026-10-17-failure-mode-report/` · 4 files</summary>

- `cos/phases/2026-10-17-failure-mode-report/FMR10_it_compounds.phase`
- `cos/phases/2026-10-17-failure-mode-report/FMR6_run_it_in_cos.phase`
- `cos/phases/2026-10-17-failure-mode-report/graph/FMR10_it_compounds-ef3258cec40e1e23.graph`
- `cos/phases/2026-10-17-failure-mode-report/graph/FMR6_run_it_in_cos-c179a8fd6c6b4eb5.graph`

</details>

<details>
<summary>`cos/phases/2026-10-17-system-drawbridge/` · 2 files</summary>

- `cos/phases/2026-10-17-system-drawbridge/DB20_sealed_archetype.phase`
- `cos/phases/2026-10-17-system-drawbridge/graph/DB20_sealed_archetype-605ac3bd31181a00.graph`

</details>

<details>
<summary>`cos/phases/2026-10-18-compartment-environment/` · 10 files</summary>

- `cos/phases/2026-10-18-compartment-environment/CE1_the_compartment_machine.phase`
- `cos/phases/2026-10-18-compartment-environment/CE1a_cos_answers_on_a_route.phase`
- `cos/phases/2026-10-18-compartment-environment/CE2_the_shell_is_declared.phase`
- `cos/phases/2026-10-18-compartment-environment/CE4_the_terminal_bridge.phase`
- `cos/phases/2026-10-18-compartment-environment/CE5_the_guest_file_tree.phase`
- `cos/phases/2026-10-18-compartment-environment/graph/CE1_the_compartment_machine-eb3bd9235c93618f.graph`
- `cos/phases/2026-10-18-compartment-environment/graph/CE1a_cos_answers_on_a_route-42f314b45461a0f5.graph`
- `cos/phases/2026-10-18-compartment-environment/graph/CE2_the_shell_is_declared-95cc76040589304d.graph`
- `cos/phases/2026-10-18-compartment-environment/graph/CE4_the_terminal_bridge-008607ecef551be9.graph`
- `cos/phases/2026-10-18-compartment-environment/graph/CE5_the_guest_file_tree-828a2472ed4dff16.graph`

</details>

<details>
<summary>`cos/phases/2026-10-19-solid-build-foundation/` · 2 files</summary>

- `cos/phases/2026-10-19-solid-build-foundation/CT1_cos_test_runner.phase`
- `cos/phases/2026-10-19-solid-build-foundation/graph/CT1_cos_test_runner-c61f114e9661a751.graph`

</details>

<details>
<summary>`cos/phases/2026-10-23-cos-spine/` · 22 files</summary>

- `cos/phases/2026-10-23-cos-spine/CS11_raid_in_the_exe.phase`
- `cos/phases/2026-10-23-cos-spine/CS1_a_version_is_a_system_state.phase`
- `cos/phases/2026-10-23-cos-spine/CS2_test_every_version.phase`
- `cos/phases/2026-10-23-cos-spine/CS3_the_registry_is_the_bridge.phase`
- `cos/phases/2026-10-23-cos-spine/CS4_every_system_a_compartment.phase`
- `cos/phases/2026-10-23-cos-spine/CS4a_cos_boots_alone.phase`
- `cos/phases/2026-10-23-cos-spine/CS5_caps_per_compartment.phase`
- `cos/phases/2026-10-23-cos-spine/CS6_rebuild_from_the_spec.phase`
- `cos/phases/2026-10-23-cos-spine/CS7_spawn_despawn_and_balance.phase`
- `cos/phases/2026-10-23-cos-spine/CS8_the_cos_screen.phase`
- `cos/phases/2026-10-23-cos-spine/CS9_every_project_a_compartment.phase`
- `cos/phases/2026-10-23-cos-spine/graph/CS11_raid_in_the_exe-3899474125085d16.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS1_a_version_is_a_system_state-523fbc38e04e24be.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS2_test_every_version-b2df3232bd29e9b2.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS3_the_registry_is_the_bridge-269cc4b7c5c5f55b.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS4_every_system_a_compartment-8dfe260df6e33a3d.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS4a_cos_boots_alone-5a7d46b9d98781db.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS5_caps_per_compartment-60ce4faf0b415181.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS6_rebuild_from_the_spec-2027a2ea6546f0e2.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS7_spawn_despawn_and_balance-145fe81d23c58732.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS8_the_cos_screen-75756ab60cc23333.graph`
- `cos/phases/2026-10-23-cos-spine/graph/CS9_every_project_a_compartment-4ceb779c4ef8413d.graph`

</details>

<details>
<summary>`cos/phases/copilot-full-capability/` · 2 files</summary>

- `cos/phases/copilot-full-capability/P3_cos_toolkit_tools.phase`
- `cos/phases/copilot-full-capability/graph/P3_cos_toolkit_tools-242126ebcb2eda89.graph`

</details>

<details>
<summary>`cos/phases/nexus-live-mind/` · 2 files</summary>

- `cos/phases/nexus-live-mind/P1_nervous_system_live.phase`
- `cos/phases/nexus-live-mind/graph/P1_nervous_system_live-e25e65b0dc86651a.graph`

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
<summary>`cos/spec/` · 10 files</summary>

- `cos/spec/check-catalogue.spec`
- `cos/spec/cos-design-v1.7.0.md`
- `cos/spec/cos-spine.spec`
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
<summary>`cos/testenv/` · 11 files</summary>

- `cos/testenv/detect.js`
- `cos/testenv/environment.js`
- `cos/testenv/host.js`
- `cos/testenv/index.js`
- `cos/testenv/installer.js`
- `cos/testenv/provision.js`
- `cos/testenv/run-target.js`
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

54 release notes name a file of cos: 0.60.176., 0.60.168., 0.60.166., 0.60.159., 0.60.157., 0.60.151., 0.60.149., 0.60.148., 0.60.137., 0.60.136., 0.60.134., 0.60.132., 0.60.130., 0.60.126., 0.60.111., 0.60.105., 0.60.104., 0.60.103., 0.60.101., 0.60.96., 0.60.91., 0.60.89., 0.60.88., 0.60.87., 0.60.67., 0.60.33., 0.60.19., 0.60.12., 0.60.6., 0.60.5., 0.60.1., 0.59.6., 0.59.2., 0.39.375., 0.39.371., 0.39.370., 0.39.367., 0.39.363., 0.39.359., 0.39.344., and 14 older. Each is in the version history below, in his words.

<!-- generated:readme:system:cos:end -->

### core

Everything no kernel owns. Core has no port and no entry: its code runs inside whichever kernel requires it, and its documents and tests describe and check every system. It is by far the largest system by file count, because `lib/` alone is about 525 files, `tests/` about 760, and `docs/` about 400 (the exact counts, file by file, are in core's generated section below). The directories below are its components, one zoom level down; the full map of each is in `core-atlas.md`.

<!-- generated:readme:system:core:start -->
#### core: every module and every file

Core is 4419 files in 49 modules. Each module below opens to its files. In a module of up to 8 files each file is named with what its own header says it is; a larger module lists its files by name, and what each one is, with its exports and its tests, is in `docs/atlases/core-atlas.md`.

<details>
<summary>the files at the top of the tree · 19 files</summary>

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
- `VERSION`
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
<summary>`docs/` · 442 files</summary>

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
- `docs/2026-10-18-compartment-environment-phasemap.spec`
- `docs/2026-10-18-debugging-product-phasemap.spec`
- `docs/2026-10-18-gate-memory-phasemap.spec`
- `docs/2026-10-18-gating-census-phasemap.spec`
- `docs/2026-10-19-gate-quality-checks-phasemap.spec`
- `docs/2026-10-19-gig-autofill-and-learn-phasemap.spec`
- `docs/2026-10-19-idearium-control-phasemap.spec`
- `docs/2026-10-19-infrastructure-spine-phasemap.spec`
- `docs/2026-10-19-pipeline-root-causes-phasemap.spec`
- `docs/2026-10-19-solid-build-foundation-phasemap.spec`
- `docs/2026-10-19-upload-intent-and-page-map-phasemap.spec`
- `docs/2026-10-20-belief-loop-phasemap.spec`
- `docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec`
- `docs/2026-10-21-adblock-phasemap.spec`
- `docs/2026-10-21-approval-chain-phasemap.spec`
- `docs/2026-10-21-brainos-into-idearium-phasemap.spec`
- `docs/2026-10-21-browser-shell-phasemap.spec`
- `docs/2026-10-21-compartment-downloads-phasemap.spec`
- `docs/2026-10-21-data-layout-phasemap.spec`
- `docs/2026-10-21-passwords-phasemap.spec`
- `docs/2026-10-21-snowflake-compartment-phasemap.spec`
- `docs/2026-10-22-system-node-db-phasemap.spec`
- `docs/2026-10-23-cos-spine-phasemap.spec`
- `docs/2026-10-23-evidence-dry-run.md`
- `docs/2026-10-23-self-building-loop-phasemap.spec`
- `docs/2026-10-23-site-profile-processes-phasemap.spec`
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
- `docs/HANDOFF-2026-10-19-verify-first-and-dag.md`
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
- `docs/approval-chain.spec`
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
- `docs/atlases/data-census.md`
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
- `docs/belief-loop.spec`
- `docs/blueprint.spec`
- `docs/brainos-in-idearium.spec`
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
- `docs/data-layout.spec`
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
- `docs/idearium-phase-census.md`
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
- `docs/pipeline.spec`
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
- `docs/self-building-loop.spec`
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
- `docs/substrate.spec`
- `docs/system-architecture.spec`
- `docs/system-node-db.spec`
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
<summary>`emerge/` · 64 files</summary>

- `emerge/SPEC_COMPILER.spec`
- `emerge/chunk/index.js`
- `emerge/compiler/baseline-tracker.js`
- `emerge/compiler/emit.js`
- `emerge/compiler/gap-field-engine.js`
- `emerge/compiler/index.js`
- `emerge/compiler/invariants-engine.js`
- `emerge/compiler/kg-builder.js`
- `emerge/compiler/phase-specs.js`
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
<summary>`lib/` · 291 files</summary>

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
- `lib/agent-self-model.js`
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
- `lib/build-queue.js`
- `lib/build-verify.js`
- `lib/bus-subscriptions.js`
- `lib/canvas-compartments.js`
- `lib/capability-registry.js`
- `lib/capability-spec.js`
- `lib/case-library.js`
- `lib/cg-learning.js`
- `lib/chains.js`
- `lib/change-entry.js`
- `lib/change-record.js`
- `lib/charter.js`
- `lib/chat-crawl-plan.js`
- `lib/chat-crawl-settings.js`
- `lib/chat-index.js`
- `lib/chat-ledger-client.js`
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
- `lib/coder-brief.js`
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
- `lib/data-clearup.js`
- `lib/data-home.js`
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
- `lib/path-guard.js`
- `lib/pattern-leverage.js`
- `lib/phase-census.js`
- `lib/phase-close.js`
- `lib/phase-cost.js`
- `lib/phase-dag.js`
- `lib/phase-deps-gate.js`
- `lib/phase-faults.js`
- `lib/phase-files.js`
- `lib/phase-graph.js`
- `lib/phase-groom.js`
- `lib/phase-map-auto.js`
- `lib/phase-plan.js`
- `lib/pipeline-nodes.js`
- `lib/pipeline-routing.js`
- `lib/plan-learning.js`
- `lib/pressure-window.js`
- `lib/prevention.js`
- `lib/project-compartment.js`
- `lib/project-container.js`
- `lib/project-decompose.js`
- `lib/project-import.config.js`
- `lib/project-registry.js`
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
- `lib/safe-watch.js`
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
- `lib/upload-placement.js`
- `lib/vector-memory.js`
- `lib/verify-first.js`
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
<summary>`lib/agent-tools/` · 118 files</summary>

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
- `lib/agent-tools/tools/clear-glass/adblock.js`
- `lib/agent-tools/tools/clear-glass/automation.js`
- `lib/agent-tools/tools/clear-glass/browser-automation.js`
- `lib/agent-tools/tools/clear-glass/browser.js`
- `lib/agent-tools/tools/clear-glass/command-index.js`
- `lib/agent-tools/tools/clear-glass/dom-archaeology.js`
- `lib/agent-tools/tools/clear-glass/firefox.js`
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
<summary>`lib/node-schemas/` · 68 files</summary>

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
- `lib/node-schemas/schema.gate`
- `lib/node-schemas/schema.graph`
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
- `lib/node-schemas/schema.phase`
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
<summary>`lib/phases/` · 1609 files</summary>

- `lib/phases/2026-08-22-session-full/SF10_agent_notes.phase`
- `lib/phases/2026-08-22-session-full/SF12_end_state_vision_and_full_phase_map_docs.phase`
- `lib/phases/2026-08-22-session-full/SF13_orchestrator_agent_pipeline.phase`
- `lib/phases/2026-08-22-session-full/SF16_event_types_real_registry.phase`
- `lib/phases/2026-08-22-session-full/SF17_intelligence_system_all_4_phases.phase`
- `lib/phases/2026-08-22-session-full/SF5_wiring_gap_bridge.phase`
- `lib/phases/2026-08-22-session-full/SF7_axiom_8_7.phase`
- `lib/phases/2026-08-22-session-full/graph/SF10_agent_notes-2d100608bc826abf.graph`
- `lib/phases/2026-08-22-session-full/graph/SF12_end_state_vision_and_full_phase_map_docs-e20580490f498608.graph`
- `lib/phases/2026-08-22-session-full/graph/SF13_orchestrator_agent_pipeline-de5ad9a019286d15.graph`
- `lib/phases/2026-08-22-session-full/graph/SF16_event_types_real_registry-71639da711eaaf6d.graph`
- `lib/phases/2026-08-22-session-full/graph/SF17_intelligence_system_all_4_phases-8f00a4235b63cc7b.graph`
- `lib/phases/2026-08-22-session-full/graph/SF5_wiring_gap_bridge-91251df2a9f05ad8.graph`
- `lib/phases/2026-08-22-session-full/graph/SF7_axiom_8_7-0396343d7665f754.graph`
- `lib/phases/2026-08-22-session-full/graph/_superseded/SF12_end_state_vision_and_full_phase_map_docs-1d20559f29b851d2.graph`
- `lib/phases/2026-08-22-session-full/graph/_superseded/SF7_axiom_8_7-c236c56937c33593.graph`
- `lib/phases/2026-08-23-backlog/BL11_orchestrator_folder_consolidation.phase`
- `lib/phases/2026-08-23-backlog/BL12_nexus_heal_loop_to_diagnostic.phase`
- `lib/phases/2026-08-23-backlog/BL15_agent_tools_tree_restructure.phase`
- `lib/phases/2026-08-23-backlog/BL24_userscript_suite_enterprise_grade.phase`
- `lib/phases/2026-08-23-backlog/BL25_nexus_options_config.phase`
- `lib/phases/2026-08-23-backlog/BL27_agent_suite_consolidation.phase`
- `lib/phases/2026-08-23-backlog/BL4_port_element_picker_ux.phase`
- `lib/phases/2026-08-23-backlog/BL7_emerge_files_to_emerge_folder.phase`
- `lib/phases/2026-08-23-backlog/graph/BL11_orchestrator_folder_consolidation-d04b773d3d681ed0.graph`
- `lib/phases/2026-08-23-backlog/graph/BL12_nexus_heal_loop_to_diagnostic-aedd1b0928da63f4.graph`
- `lib/phases/2026-08-23-backlog/graph/BL15_agent_tools_tree_restructure-8c572d92803d3fae.graph`
- `lib/phases/2026-08-23-backlog/graph/BL24_userscript_suite_enterprise_grade-edba621e935840c5.graph`
- `lib/phases/2026-08-23-backlog/graph/BL25_nexus_options_config-abb545081f8c4e3e.graph`
- `lib/phases/2026-08-23-backlog/graph/BL27_agent_suite_consolidation-5312857a8c56f41a.graph`
- `lib/phases/2026-08-23-backlog/graph/BL4_port_element_picker_ux-8f7a989bfea93b3a.graph`
- `lib/phases/2026-08-23-backlog/graph/BL7_emerge_files_to_emerge_folder-3ab7a1f57237920a.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR2_ollama_output_folder_listener.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR3_account_registry_userscript_hook.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR5_build_contract_per_agent_per_intent.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR6_copilot_as_agent_chat_model.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR7_guardian_dispatch_connectivity_sweep.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/ET2_guardian_event_taxonomy.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/ET6_sigma_gates_on_taxonomy.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/SS3_unified_living_model_system_plus_person.phase`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR2_ollama_output_folder_listener-c5cdd4d86ddb5b74.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR3_account_registry_userscript_hook-8be6d498ddcef7ec.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR5_build_contract_per_agent_per_intent-36bf07b27fc48bd7.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR6_copilot_as_agent_chat_model-fd8edb04f0f53aaf.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR7_guardian_dispatch_connectivity_sweep-e8d5cbb04e0fb190.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET2_guardian_event_taxonomy-3864f053a89e1c31.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET6_sigma_gates_on_taxonomy-161a85ba5515e7c0.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/SS3_unified_living_model_system_plus_person-0bbbc7d8adf65f4e.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/ET6_sigma_gates_on_taxonomy-39103ee4912fdf0c.graph`
- `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/SS3_unified_living_model_system_plus_person-b7991f62394431da.graph`
- `lib/phases/2026-08-28-definition-of-complete/DOD2_diagnose_and_self_repair.phase`
- `lib/phases/2026-08-28-definition-of-complete/DOD4_build_and_expand_from_loom.phase`
- `lib/phases/2026-08-28-definition-of-complete/DOD5_maps_snapshots_backups_living_model.phase`
- `lib/phases/2026-08-28-definition-of-complete/DOD6_respects_axioms.phase`
- `lib/phases/2026-08-28-definition-of-complete/DOD8_contract_conditions_comparison_and_drift_engines.phase`
- `lib/phases/2026-08-28-definition-of-complete/graph/DOD2_diagnose_and_self_repair-5bfd602924d700e1.graph`
- `lib/phases/2026-08-28-definition-of-complete/graph/DOD4_build_and_expand_from_loom-8ee63f9d1b09068e.graph`
- `lib/phases/2026-08-28-definition-of-complete/graph/DOD5_maps_snapshots_backups_living_model-3908fcdebd5c6049.graph`
- `lib/phases/2026-08-28-definition-of-complete/graph/DOD6_respects_axioms-0f8fab7681fae1d5.graph`
- `lib/phases/2026-08-28-definition-of-complete/graph/DOD8_contract_conditions_comparison_and_drift_engines-1d10a9ee9575d398.graph`
- `lib/phases/2026-08-28-self-building-pipeline/SBP10_per_hat_model_assignment.phase`
- `lib/phases/2026-08-28-self-building-pipeline/SBP11_agent_tools_registry_awareness.phase`
- `lib/phases/2026-08-28-self-building-pipeline/SBP12_listener_and_userscript_suite_view.phase`
- `lib/phases/2026-08-28-self-building-pipeline/SBP6_system_schema_inventory.phase`
- `lib/phases/2026-08-28-self-building-pipeline/SBP8_agent_mesh_consolidation.phase`
- `lib/phases/2026-08-28-self-building-pipeline/SBP9_hat_forge_real_hats.phase`
- `lib/phases/2026-08-28-self-building-pipeline/graph/SBP10_per_hat_model_assignment-7abdac008edcde3d.graph`
- `lib/phases/2026-08-28-self-building-pipeline/graph/SBP11_agent_tools_registry_awareness-10a463896c66d6e4.graph`
- `lib/phases/2026-08-28-self-building-pipeline/graph/SBP12_listener_and_userscript_suite_view-dc9e3b5d6c5777b3.graph`
- `lib/phases/2026-08-28-self-building-pipeline/graph/SBP6_system_schema_inventory-01abcd223ab08b29.graph`
- `lib/phases/2026-08-28-self-building-pipeline/graph/SBP8_agent_mesh_consolidation-5a5600d90602c11e.graph`
- `lib/phases/2026-08-28-self-building-pipeline/graph/SBP9_hat_forge_real_hats-7d6322a91f58a6d6.graph`
- `lib/phases/2026-08-30-interaction-contract-context/IC10_diagnostic_own_real_system_structure.phase`
- `lib/phases/2026-08-30-interaction-contract-context/IC12_universal_gap_and_symmetry_detection.phase`
- `lib/phases/2026-08-30-interaction-contract-context/IC13_agent_mesh_chat_index.phase`
- `lib/phases/2026-08-30-interaction-contract-context/IC5_full_input_queue_output_qc_lifecycle.phase`
- `lib/phases/2026-08-30-interaction-contract-context/IC7_drift_and_comparison_tracking_in_the_pipeline.phase`
- `lib/phases/2026-08-30-interaction-contract-context/graph/IC10_diagnostic_own_real_system_structure-37d61971e616a68c.graph`
- `lib/phases/2026-08-30-interaction-contract-context/graph/IC12_universal_gap_and_symmetry_detection-4c68e3f3c0900e7c.graph`
- `lib/phases/2026-08-30-interaction-contract-context/graph/IC13_agent_mesh_chat_index-acae83a88cfed8cd.graph`
- `lib/phases/2026-08-30-interaction-contract-context/graph/IC5_full_input_queue_output_qc_lifecycle-5cf93f4f44f1c70a.graph`
- `lib/phases/2026-08-30-interaction-contract-context/graph/IC7_drift_and_comparison_tracking_in_the_pipeline-57b2a934eab904b3.graph`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM10_per_agent_wake_words.phase`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM14_components_store.phase`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM1_spec_as_living_model.phase`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM23_atlas_history_versions_calendar.phase`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM25_atlas_living_update.phase`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM6_who_creates_contracts.phase`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM10_per_agent_wake_words-181848264f44d530.graph`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM14_components_store-c5ab3492fddbea5d.graph`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM1_spec_as_living_model-0fafcb56a76e6808.graph`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM23_atlas_history_versions_calendar-cc8f2ab0d0593e31.graph`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM25_atlas_living_update-fffff5497b586859.graph`
- `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM6_who_creates_contracts-916424c3f4eeec02.graph`
- `lib/phases/2026-09-02-agent-mesh-full-map/AM1_raid_intent_contracts_per_agent.phase`
- `lib/phases/2026-09-02-agent-mesh-full-map/AM2_first_principles_hat_or_modifier.phase`
- `lib/phases/2026-09-02-agent-mesh-full-map/AM3_agent_mesh_folder_consolidation.phase`
- `lib/phases/2026-09-02-agent-mesh-full-map/AM5_tool_forge_real_usage_audit.phase`
- `lib/phases/2026-09-02-agent-mesh-full-map/AM6_raid_contract_gate_before_dispatch.phase`
- `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM1_raid_intent_contracts_per_agent-e561c466fdbbdbb2.graph`
- `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM2_first_principles_hat_or_modifier-0e345d95c9a3188b.graph`
- `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM3_agent_mesh_folder_consolidation-6a436c038ec43868.graph`
- `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM5_tool_forge_real_usage_audit-28fa7d9090fb0f06.graph`
- `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM6_raid_contract_gate_before_dispatch-95e22ab925e053e4.graph`
- `lib/phases/2026-09-02-nexus-vision-master/AM10_ollama_models_in_mesh.phase`
- `lib/phases/2026-09-02-nexus-vision-master/AM7_agent_suite_welcome_ui.phase`
- `lib/phases/2026-09-02-nexus-vision-master/AM9_per_account_sub_agents.phase`
- `lib/phases/2026-09-02-nexus-vision-master/B1_full_build_contract_schema.phase`
- `lib/phases/2026-09-02-nexus-vision-master/B2_chunk_contract_chaining.phase`
- `lib/phases/2026-09-02-nexus-vision-master/C2_templates_folder_structure.phase`
- `lib/phases/2026-09-02-nexus-vision-master/C4_build_wizard_two_modes.phase`
- `lib/phases/2026-09-02-nexus-vision-master/CP3_dynamic_model_selection.phase`
- `lib/phases/2026-09-02-nexus-vision-master/CP4_copilot_cli_deterministic_toggle.phase`
- `lib/phases/2026-09-02-nexus-vision-master/LM6_model_template.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR10_iterative_prompt_optimization_loop.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR11_spec_project_import_to_compartment.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR12_system_parse_query_surface.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR13_copilot_chat_ui.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR3_artifact_extraction_introspect_bridge.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR7_token_reduction_toolkit.phase`
- `lib/phases/2026-09-02-nexus-vision-master/SR9_autonomous_self_build_end_state.phase`
- `lib/phases/2026-09-02-nexus-vision-master/T1_tool_listing_command.phase`
- `lib/phases/2026-09-02-nexus-vision-master/T2_event_taxonomy_per_system.phase`
- `lib/phases/2026-09-02-nexus-vision-master/VM1_versionium_owns_loom_map_sync.phase`
- `lib/phases/2026-09-02-nexus-vision-master/graph/AM10_ollama_models_in_mesh-096f5e7ddf0d6aa1.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/AM7_agent_suite_welcome_ui-67a22c4161e9ad41.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/AM9_per_account_sub_agents-20952744b4aa19cf.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/B1_full_build_contract_schema-75201db85d2752cc.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/B2_chunk_contract_chaining-4b6fdc464e5dc7fe.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/C2_templates_folder_structure-4b30f66e40536e56.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/C4_build_wizard_two_modes-9a05d43747e1ddbd.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/CP3_dynamic_model_selection-2bda1b4b75b52bf7.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/CP4_copilot_cli_deterministic_toggle-3e9bf786171d55b3.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/LM6_model_template-58c8bda5255910c8.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR10_iterative_prompt_optimization_loop-cb5c36dca66dacba.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR11_spec_project_import_to_compartment-3ba40fae475bab7c.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR12_system_parse_query_surface-8c16a48512a80c7c.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR13_copilot_chat_ui-86f6ac2d0b97306a.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR3_artifact_extraction_introspect_bridge-4f813123ae64e4bd.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR7_token_reduction_toolkit-3530c94e6e6673f7.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/SR9_autonomous_self_build_end_state-5e2b9a8991cf1a0d.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/T1_tool_listing_command-360e0c29705d7e89.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/T2_event_taxonomy_per_system-d01cf8ce65fbb403.graph`
- `lib/phases/2026-09-02-nexus-vision-master/graph/VM1_versionium_owns_loom_map_sync-645d8fc81f9cd1b8.graph`
- `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/VS2_ring_buffer_and_causal_field.phase`
- `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/VS3_agent_chat_log_query.phase`
- `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/VS2_ring_buffer_and_causal_field-a136f794f2a44987.graph`
- `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/VS3_agent_chat_log_query-c1653dec5e1a00a7.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/BR1_brainos_cross_system_relay.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/BR2_brainos_controls_agents.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DA1_fix_stale_guardian_coverage_gate.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DBG1_consolidate_debug_surfaces.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/EVT1_commands_and_tools_emit_events.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/REG1_component_registry_remap.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/RP1_repository_per_system.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/SPEC1_rewrite_nexus_spec.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/TC1_tools_get_real_contracts.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/UX1_design_philosophy_consolidation.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/VSB1_fix_versionium_split_brain.phase`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/BR1_brainos_cross_system_relay-74f187aeb527e717.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/BR2_brainos_controls_agents-eee077467b2c6ac8.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DA1_fix_stale_guardian_coverage_gate-f96bc8899f2f2334.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DBG1_consolidate_debug_surfaces-251300f01adf0239.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/EVT1_commands_and_tools_emit_events-cd104364a7ca3847.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/REG1_component_registry_remap-2636c28afb4b764e.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/RP1_repository_per_system-95bead78e697c269.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/SPEC1_rewrite_nexus_spec-8486df46c0ff1a3d.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/TC1_tools_get_real_contracts-e88ee91b4fa0d7c3.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/UX1_design_philosophy_consolidation-8518048c60a27800.graph`
- `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/VSB1_fix_versionium_split_brain-10cd9ca6595a4662.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/AR1_architect_retirement_and_hooks_to_loom.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/AR2_decentralize_interaction_contracts.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/C1_cli_per_system_split.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/D1_diagnostic_real_folder.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/N1_root_md_consolidation.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/N2_root_nexus_js_to_nexus_folder.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/N3_stray_root_files_found_after_N1.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/T1_extend_system_scaffold.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/X1_node_decomposition_tool.phase`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/AR1_architect_retirement_and_hooks_to_loom-c44714dfce980acf.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/AR2_decentralize_interaction_contracts-004da81f2aa79f85.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/C1_cli_per_system_split-7b2166b145a6e248.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/D1_diagnostic_real_folder-326872f5777c2e88.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/N1_root_md_consolidation-d7ece054f8e1b547.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/N2_root_nexus_js_to_nexus_folder-6088de94a4c19d4b.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/N3_stray_root_files_found_after_N1-46553cc0a1125676.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/T1_extend_system_scaffold-c85e7dedf727b889.graph`
- `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/X1_node_decomposition_tool-6dc260de77610029.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/P12_compartment_per_contract.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P19_dynamic_nodes_via_causal_graph.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P1_fix_the_declared_living_maps.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P22_ledger_data_integrity_checker.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P25_universal_per_system_queue.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P30_provider_ping_delta.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P33_every_system_runs_its_node_registry.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P36_an_event_ledger_per_registry.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P38_every_graph_has_its_route_command_and_node.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P3_per_system_node_schemas.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P4_full_node_type_coverage_per_system.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/P9_diagnostic_from_expected_behavior.phase`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P12_compartment_per_contract-8cfd3609296f0e65.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P19_dynamic_nodes_via_causal_graph-14175a5931199ebc.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P1_fix_the_declared_living_maps-6e2243bd608aa76f.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P22_ledger_data_integrity_checker-80f256cd544672ab.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P25_universal_per_system_queue-624624c871ccb0f6.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P30_provider_ping_delta-81b879ff6f24b8b2.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P33_every_system_runs_its_node_registry-7955afec14f5b4a5.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P36_an_event_ledger_per_registry-fbd0abb2a175f847.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P38_every_graph_has_its_route_command_and_node-ba638bb548c28c0d.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P3_per_system_node_schemas-71d0409c318c73a0.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P4_full_node_type_coverage_per_system-7d7cc69568624b23.graph`
- `lib/phases/2026-09-11-sovereign-node-architecture/graph/P9_diagnostic_from_expected_behavior-d3f4fcb51886b539.graph`
- `lib/phases/2026-09-13-track-b-sovereignty/MCO16_component_projections_retracted.phase`
- `lib/phases/2026-09-13-track-b-sovereignty/graph/MCO16_component_projections_retracted-4e9c11ff0b4b91af.graph`
- `lib/phases/2026-09-19-architect-blueprint-forge-idearium/P0_place_spec_compiler.phase`
- `lib/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P0_place_spec_compiler-816ab40bc00d49c5.graph`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B3_availability_tier.phase`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B5_port_3753_collision.phase`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/D5_new.phase`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P0_map.phase`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B3_availability_tier-1a4f7859f0f50ce1.graph`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B5_port_3753_collision-3d6b1fadb758d77c.graph`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/D5_new-8a8997642f5cb4af.graph`
- `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P0_map-270831fdfdc19271.graph`
- `lib/phases/2026-09-22-brainos-agent-suite/HT1_hat_manager.phase`
- `lib/phases/2026-09-22-brainos-agent-suite/RD1_reader.phase`
- `lib/phases/2026-09-22-brainos-agent-suite/TL1_tool_browser.phase`
- `lib/phases/2026-09-22-brainos-agent-suite/graph/HT1_hat_manager-c65f629e4c701947.graph`
- `lib/phases/2026-09-22-brainos-agent-suite/graph/RD1_reader-ffe56609c225d915.graph`
- `lib/phases/2026-09-22-brainos-agent-suite/graph/TL1_tool_browser-c1e834b49a05b3a2.graph`
- `lib/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/TR2_tab_lifecycle_and_visibility.phase`
- `lib/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/TR2_tab_lifecycle_and_visibility-f48c6d68235b7c84.graph`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/A1.phase`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/A2.phase`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/E1.phase`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/R1.phase`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T3.phase`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T7.phase`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/A1-369bde5ee0a043bb.graph`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/A2-fc6a51b24eaf102b.graph`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/E1-8b75f1c7cf514a23.graph`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/R1-2fc594cd0c71aec9.graph`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T3-255b5681dc7d3f96.graph`
- `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T7-0870291c8f83c928.graph`
- `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/E1.phase`
- `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/N1.phase`
- `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/X1.phase`
- `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/E1-48449faf7b7f8211.graph`
- `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/N1-afc3f2d2b1971c2a.graph`
- `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/X1-7a889bbcd135db9f.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/G1.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/G2.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/G4.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/H2.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/H4.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/M1.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/M4.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/O3.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/X1.phase`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/G1-a03b49e7e8269c3f.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/G2-ae911f4c7c242c54.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/G4-45ac7ff9b3f272be.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/H2-614a688e1eeeef44.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/H4-3e25fcd3222e73f8.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/M1-6f7e0c6335c28637.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/M4-665ecb7fca2292ef.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/O3-5cacc4d6647c995e.graph`
- `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/X1-3523be12dc3e544d.graph`
- `lib/phases/2026-09-27-components-store-and-atlases/A1.phase`
- `lib/phases/2026-09-27-components-store-and-atlases/A2.phase`
- `lib/phases/2026-09-27-components-store-and-atlases/C1.phase`
- `lib/phases/2026-09-27-components-store-and-atlases/C3.phase`
- `lib/phases/2026-09-27-components-store-and-atlases/C4.phase`
- `lib/phases/2026-09-27-components-store-and-atlases/graph/A1-362ff4dd0f06f283.graph`
- `lib/phases/2026-09-27-components-store-and-atlases/graph/A2-c42260b792aebce5.graph`
- `lib/phases/2026-09-27-components-store-and-atlases/graph/C1-c901b0518083f11c.graph`
- `lib/phases/2026-09-27-components-store-and-atlases/graph/C3-6f53d9aa14fc9e97.graph`
- `lib/phases/2026-09-27-components-store-and-atlases/graph/C4-1e1f2af6d71358cb.graph`
- `lib/phases/2026-09-27-idearium-atlas/A2.phase`
- `lib/phases/2026-09-27-idearium-atlas/graph/A2-2ca200087c34a761.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/T1_suite_process.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/T2_all_tests.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/T3_debug_report.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X1_system_nodes.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X4_command_index_spec.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X5_core_scripts.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/Z1_release.phase`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/T1_suite_process-f9f50c78f096c750.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/T2_all_tests-f20e3b22238a10f1.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/T3_debug_report-7765b07df0393f7b.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X1_system_nodes-46e5cb034f4618e8.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X4_command_index_spec-f0c28b0337bbaf38.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X5_core_scripts-071bcce96653212c.graph`
- `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/Z1_release-8e268e22b5c92e0c.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/A1.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/B1.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/C1.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/C3.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/M0.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/R0.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/SV1.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/SV2.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/X1.phase`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/A1-1b42fcb0ed4d9adc.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/B1-78425d6a9af5ccae.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/C1-4d3b419ed124ed8e.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/C3-d965f28349f6b6fa.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/M0-90edb156dad368a7.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/R0-9bc06ef9e121c4ef.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/SV1-aba511479e53415c.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/SV2-233056d110ca606c.graph`
- `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/X1-960b6d032d829383.graph`
- `lib/phases/2026-09-28-staging-self-heal/A1.phase`
- `lib/phases/2026-09-28-staging-self-heal/C0.phase`
- `lib/phases/2026-09-28-staging-self-heal/S1.phase`
- `lib/phases/2026-09-28-staging-self-heal/X1.phase`
- `lib/phases/2026-09-28-staging-self-heal/graph/A1-678cef6eb0b005d6.graph`
- `lib/phases/2026-09-28-staging-self-heal/graph/C0-0b7235ad10d93e23.graph`
- `lib/phases/2026-09-28-staging-self-heal/graph/S1-7fb03e9518bd1d90.graph`
- `lib/phases/2026-09-28-staging-self-heal/graph/X1-5196f7fe55a3de4b.graph`
- `lib/phases/2026-09-29-build-surface/BS12_release.phase`
- `lib/phases/2026-09-29-build-surface/BS19_copilot_atlas_guide.phase`
- `lib/phases/2026-09-29-build-surface/BS1_rewind_hit_test.phase`
- `lib/phases/2026-09-29-build-surface/graph/BS12_release-8f67d5e56dcc7344.graph`
- `lib/phases/2026-09-29-build-surface/graph/BS19_copilot_atlas_guide-8cfe36554eded916.graph`
- `lib/phases/2026-09-29-build-surface/graph/BS1_rewind_hit_test-338736611c96d096.graph`
- `lib/phases/2026-09-29-nex-node-store/N0_census.phase`
- `lib/phases/2026-09-29-nex-node-store/N10_migration.phase`
- `lib/phases/2026-09-29-nex-node-store/N13_release.phase`
- `lib/phases/2026-09-29-nex-node-store/N14_failure_mode_field.phase`
- `lib/phases/2026-09-29-nex-node-store/N15_contract_history.phase`
- `lib/phases/2026-09-29-nex-node-store/N17_data_migration_to_owning_systems.phase`
- `lib/phases/2026-09-29-nex-node-store/N18_hardcode_census.phase`
- `lib/phases/2026-09-29-nex-node-store/N19_suite_triage_and_known_gaps.phase`
- `lib/phases/2026-09-29-nex-node-store/N1_record_and_log.phase`
- `lib/phases/2026-09-29-nex-node-store/N21_no_empty_generation_event_gates.phase`
- `lib/phases/2026-09-29-nex-node-store/N22_shadow_and_negative_space_reasoning.phase`
- `lib/phases/2026-09-29-nex-node-store/N23_ollama_first_build_then_agent_review.phase`
- `lib/phases/2026-09-29-nex-node-store/N24_no_json_yaml_node_types_only.phase`
- `lib/phases/2026-09-29-nex-node-store/N26_work_surface_and_tv_ui_from_contracts.phase`
- `lib/phases/2026-09-29-nex-node-store/N27_history_import_from_700_zips.phase`
- `lib/phases/2026-09-29-nex-node-store/N28_live_run_findings.phase`
- `lib/phases/2026-09-29-nex-node-store/N29_full_run_only_failures.phase`
- `lib/phases/2026-09-29-nex-node-store/N2_types_and_gates.phase`
- `lib/phases/2026-09-29-nex-node-store/N30_archive_import_dropbox_and_copilot_command.phase`
- `lib/phases/2026-09-29-nex-node-store/N3_projection_and_indexes.phase`
- `lib/phases/2026-09-29-nex-node-store/N4_kinds_record_ledger_ring_blob.phase`
- `lib/phases/2026-09-29-nex-node-store/N5_kinds_edge_and_lattice.phase`
- `lib/phases/2026-09-29-nex-node-store/N6_time.phase`
- `lib/phases/2026-09-29-nex-node-store/N7_views_yaml_and_nex.phase`
- `lib/phases/2026-09-29-nex-node-store/N8_service.phase`
- `lib/phases/2026-09-29-nex-node-store/N9_cli.phase`
- `lib/phases/2026-09-29-nex-node-store/graph/N0_census-9b89ddab0ca4dd15.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N10_migration-22105d4423c79d62.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N13_release-9057f45c32bc5a7a.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N14_failure_mode_field-b296d7b4bd69362b.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N15_contract_history-a9ca7dca146ef7fe.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N17_data_migration_to_owning_systems-a936213ccfa0c257.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N18_hardcode_census-5c8fe27e11df3386.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N19_suite_triage_and_known_gaps-e41f290ddd43afc5.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N1_record_and_log-6d4e3abb4292bf6a.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N21_no_empty_generation_event_gates-22cd6c8351ac8c9e.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N22_shadow_and_negative_space_reasoning-4843bec3597696fa.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N23_ollama_first_build_then_agent_review-5beb3a63e79bdd5f.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N24_no_json_yaml_node_types_only-2e2bc510c6a525a5.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N26_work_surface_and_tv_ui_from_contracts-642ec62479f9e52c.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N27_history_import_from_700_zips-e06097bc3f5fc96c.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N28_live_run_findings-fbb9ca7ade269a9e.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N29_full_run_only_failures-3ccc80b708b1184e.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N2_types_and_gates-5e4c8e5f9b3fa871.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N30_archive_import_dropbox_and_copilot_command-dedd8b0e675c778d.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N3_projection_and_indexes-e869d4762f5f68e4.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N4_kinds_record_ledger_ring_blob-0808a2146da71927.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N5_kinds_edge_and_lattice-be77dec312fae18a.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N6_time-1d45bad2579387a6.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N7_views_yaml_and_nex-d19115c9bdab18db.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N8_service-a93084e10fd5c6be.graph`
- `lib/phases/2026-09-29-nex-node-store/graph/N9_cli-2bd8335f5d98134a.graph`
- `lib/phases/2026-09-29-provider-economy/EC0_policy_model.phase`
- `lib/phases/2026-09-29-provider-economy/EC10_eros_workbench.phase`
- `lib/phases/2026-09-29-provider-economy/EC11_release.phase`
- `lib/phases/2026-09-29-provider-economy/EC1_usage_ledger.phase`
- `lib/phases/2026-09-29-provider-economy/EC2_gate.phase`
- `lib/phases/2026-09-29-provider-economy/EC3_token_constraints.phase`
- `lib/phases/2026-09-29-provider-economy/EC4_learning_router.phase`
- `lib/phases/2026-09-29-provider-economy/EC5_staging_by_economy.phase`
- `lib/phases/2026-09-29-provider-economy/EC7_router_in_builds.phase`
- `lib/phases/2026-09-29-provider-economy/graph/EC0_policy_model-f08917980459b73a.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC10_eros_workbench-27a839ee0a545a60.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC11_release-3ddf9b68b334fa07.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC1_usage_ledger-3bb692c134237f3f.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC2_gate-5b5011336adda021.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC3_token_constraints-3231820165317198.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC4_learning_router-5ea981995e6aa2aa.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC5_staging_by_economy-a13ffbca0770c51b.graph`
- `lib/phases/2026-09-29-provider-economy/graph/EC7_router_in_builds-e6f92fef8dfca5e3.graph`
- `lib/phases/2026-09-29-tool-layers-and-pane-memory/P5.phase`
- `lib/phases/2026-09-29-tool-layers-and-pane-memory/graph/P5-8d626c5118de90a9.graph`
- `lib/phases/2026-09-30-idearium-coding-flow/W0_map.phase`
- `lib/phases/2026-09-30-idearium-coding-flow/W6_release.phase`
- `lib/phases/2026-09-30-idearium-coding-flow/graph/W0_map-48e0fd2adc75cbe4.graph`
- `lib/phases/2026-09-30-idearium-coding-flow/graph/W6_release-16020646cb3d4924.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/AG1_coding_agent_provider.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/CI1_compounding_iterate.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/CP1_copilot_drives_idearium_and_talks_to_its_agents.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/CT1_cut_replies_are_finished.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/CX1_context_cascade.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/DI1_chunking_for_data_ingestion.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/DK4_the_screen_through_remote_desktop.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/DT1_persistence_census.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/DT2_failure_mode_field.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/DT5_pipeline_routing_spec.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/DT6_node_store.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/EN1_run_isolated_and_environments.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/FT1_file_tools_merge_patch_drop.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/GL1_gate_verify_fix_loop.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/HC1_hat_agent_to_cos_build.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/M0_map.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/PF3_snapshot_names_changed_files.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/PV1_verify.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/R1_release_per_phase.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/RM1_registry_driven_moves.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/UI4_w7_open_items.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/UM1_nexus_understands_james.phase`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/AG1_coding_agent_provider-7098e6ab122046fe.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/CI1_compounding_iterate-1ceee25ce29d30d7.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/CP1_copilot_drives_idearium_and_talks_to_its_agents-9573fd740fb5af49.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/CT1_cut_replies_are_finished-44a5ea9533f0d015.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/CX1_context_cascade-ca712cb3559b1665.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/DI1_chunking_for_data_ingestion-91bad89cab545ae9.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/DK4_the_screen_through_remote_desktop-068dbdde9fe76e51.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/DT1_persistence_census-a397051c2ba83059.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/DT2_failure_mode_field-6c0d9717247bc31e.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/DT5_pipeline_routing_spec-4d9d36b0f640099b.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/DT6_node_store-587b34312496b309.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/EN1_run_isolated_and_environments-8b73ac9da187069c.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/FT1_file_tools_merge_patch_drop-b482bb0cc2b2da5b.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/GL1_gate_verify_fix_loop-c375ed7a6843eff0.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/HC1_hat_agent_to_cos_build-27c92f78114946f9.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/M0_map-8ffcfde00fa30d75.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/PF3_snapshot_names_changed_files-ef1e8fe4b8bff7c1.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/PV1_verify-8d8471a331531c9e.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/R1_release_per_phase-46c6115b0a540652.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/RM1_registry_driven_moves-37e44e3fd7c0b5e6.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/UI4_w7_open_items-18e3783da1c40086.graph`
- `lib/phases/2026-10-01-idearium-agent-ready-master/graph/UM1_nexus_understands_james-941120d6e488072b.graph`
- `lib/phases/2026-10-01-routing-registry-genesis/AR1_architecture_spec.phase`
- `lib/phases/2026-10-01-routing-registry-genesis/RG0_map.phase`
- `lib/phases/2026-10-01-routing-registry-genesis/RG1_routing_policy_library.phase`
- `lib/phases/2026-10-01-routing-registry-genesis/RG9_release.phase`
- `lib/phases/2026-10-01-routing-registry-genesis/graph/AR1_architecture_spec-8cd719427be6e25f.graph`
- `lib/phases/2026-10-01-routing-registry-genesis/graph/RG0_map-2dbe0930b534d57a.graph`
- `lib/phases/2026-10-01-routing-registry-genesis/graph/RG1_routing_policy_library-6f62f23ea86dfc53.graph`
- `lib/phases/2026-10-01-routing-registry-genesis/graph/RG9_release-cf3afc2add05bd8b.graph`
- `lib/phases/2026-10-01-work-visibility-job-reuse/J0.phase`
- `lib/phases/2026-10-01-work-visibility-job-reuse/J4.phase`
- `lib/phases/2026-10-01-work-visibility-job-reuse/graph/J0-e486fc05d2ee7537.graph`
- `lib/phases/2026-10-01-work-visibility-job-reuse/graph/J4-d0598b9fa84035cf.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/AC1_accounts_into_agents.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/BT1_build_teams.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/CB2_analysis_then_synthesis.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/CB3_the_causal_spec_block.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/CB4_the_emergence_loop_builds.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/CL1_the_component_lab.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/CX0_codex_component_store.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/EC6_economy_and_the_tokenizer.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/EM0_ground.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/EM1_emerge_core.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/EM2_warp_his_own.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/EV0_contracts_for_every_system.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/GG1_graphs_generate_code.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/IN1_nexus_as_claude_codes_toolbox.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/IN2_claude_code_inside_nexus.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR10_the_field_between_james_and_the_agents.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR11_rewind_the_mind.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR1_recall_triad_and_context_table.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR2_vector_space_for_the_field.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR3_gap_driven_search.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR5_fractal_levels_with_the_field.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR7_recipes.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR8_crystallization.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MR9_liminal_on_the_agents.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/MS1_mental_simulation.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/OT1_one_write_path.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/RF1_relational_field.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/SH1_shadow_space.phase`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/AC1_accounts_into_agents-b0a53df2fc8f1dea.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/BT1_build_teams-f20168a39b99e978.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/CB2_analysis_then_synthesis-6526c6e29a6f1882.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/CB3_the_causal_spec_block-416677392d644f26.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/CB4_the_emergence_loop_builds-f55b34562227851d.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/CL1_the_component_lab-a2eea2a6f08f0b6a.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/CX0_codex_component_store-a475e453d53efd69.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/EC6_economy_and_the_tokenizer-8672a4aa6309a394.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/EM0_ground-5e6f8714cf4c18ab.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/EM1_emerge_core-73c6df41c03bcc05.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/EM2_warp_his_own-43449bdeda43d0e1.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/EV0_contracts_for_every_system-effdf129b11ae306.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/GG1_graphs_generate_code-e8989d4b9064ae28.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/IN1_nexus_as_claude_codes_toolbox-ea1bc06a4bc07a29.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/IN2_claude_code_inside_nexus-26136e2c5eed6fe6.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR10_the_field_between_james_and_the_agents-26426e0877de2189.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR11_rewind_the_mind-7408928bead323c8.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR1_recall_triad_and_context_table-8d98f6c45ce31135.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR2_vector_space_for_the_field-0dc9b5c41e9b71b8.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR3_gap_driven_search-9b368a799ea724a4.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR5_fractal_levels_with_the_field-b0db8d29198ad6c3.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR7_recipes-dba6a7b218cea00c.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR8_crystallization-b7db5295beb68216.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MR9_liminal_on_the_agents-6faebe0d8292d4ed.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/MS1_mental_simulation-7cb6b7e7414bd2be.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/OT1_one_write_path-7c9eae93ea3da6cd.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/RF1_relational_field-42da3a417bea3c55.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/SH1_shadow_space-f4d22958311863ce.graph`
- `lib/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/EV0_contracts_for_every_system-26eab57c8fd5152e.graph`
- `lib/phases/2026-10-02-fractal-graph-any-size-agent/FG2_token_budget_chunking.phase`
- `lib/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG2_token_budget_chunking-869f29022b91a647.graph`
- `lib/phases/2026-10-02-spatial-void/V7_proof.phase`
- `lib/phases/2026-10-02-spatial-void/graph/V7_proof-c207baa9194ab90d.graph`
- `lib/phases/2026-10-02-synthesis-zoom-versionium/LV1_fill_the_highest_leverage.phase`
- `lib/phases/2026-10-02-synthesis-zoom-versionium/graph/LV1_fill_the_highest_leverage-cb833cd372794400.graph`
- `lib/phases/2026-10-02-workshop-codex-rewind/CX0_codex_component_store.phase`
- `lib/phases/2026-10-02-workshop-codex-rewind/NX1_nexus_in_a_vm.phase`
- `lib/phases/2026-10-02-workshop-codex-rewind/graph/CX0_codex_component_store-a6c33671bbad00ca.graph`
- `lib/phases/2026-10-02-workshop-codex-rewind/graph/NX1_nexus_in_a_vm-24f038cc5c7b50f4.graph`
- `lib/phases/2026-10-05-announce-pulse-repair/PR1_the_announced_registry_is_the_list.phase`
- `lib/phases/2026-10-05-announce-pulse-repair/PR3_negative_space_for_missed_heartbeats.phase`
- `lib/phases/2026-10-05-announce-pulse-repair/PR5_repair_for_real.phase`
- `lib/phases/2026-10-05-announce-pulse-repair/graph/PR1_the_announced_registry_is_the_list-641bbd05951e0d82.graph`
- `lib/phases/2026-10-05-announce-pulse-repair/graph/PR3_negative_space_for_missed_heartbeats-36f6155753d9c5cc.graph`
- `lib/phases/2026-10-05-announce-pulse-repair/graph/PR5_repair_for_real-620eceb6ad914afa.graph`
- `lib/phases/2026-10-05-build-from-the-spec/BC1_build_context.phase`
- `lib/phases/2026-10-05-build-from-the-spec/BC2_the_build_agent_gets_all_of_the_hat_and_repo_context.phase`
- `lib/phases/2026-10-05-build-from-the-spec/BC3_what_a_build_was_sent_as_a_node.phase`
- `lib/phases/2026-10-05-build-from-the-spec/BC4_relational_context_wired_or_archived.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB0_map.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB15_empty_is_not_built.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB19_atlases_per_component.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB20_each_system_owns_its_own.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB21_deterministic_parts_grow_with_the_system.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB22_every_component_capability_command_events_as_nodes.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB23_a_new_system_slots_in.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB25_atlas_template_in_his_structure.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB32_context_is_never_optional.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB33_the_agent_runs_the_pipeline.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB34_context_is_the_code_tab_the_graphs_and_memory.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB36_every_agent_can_use_the_tools.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB38_prerequisites_the_questions_first.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB39_the_checklist_builds_the_working_set.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB42_a_repo_expands_from_its_spec.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB43_the_expansion_is_phased.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB47_built_and_run_in_cos.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB48_proof_in_cos_closes_the_phase.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB5_nexus_rebuilds_a_system_from_its_spec.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB6_hundreds_of_specs.phase`
- `lib/phases/2026-10-05-build-from-the-spec/SB7_domain_file_tree_templates.phase`
- `lib/phases/2026-10-05-build-from-the-spec/WS1_agents_use_the_work_surface.phase`
- `lib/phases/2026-10-05-build-from-the-spec/graph/BC1_build_context-a104b548fa539506.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/BC2_the_build_agent_gets_all_of_the_hat_and_repo_context-32034bedc3229b78.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/BC3_what_a_build_was_sent_as_a_node-c3fd5f52e2545073.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/BC4_relational_context_wired_or_archived-13b633faec59fe77.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB0_map-af5948d939560015.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB15_empty_is_not_built-39cd55ae1d782360.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB19_atlases_per_component-9e59927620ffe280.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB20_each_system_owns_its_own-4b6d2494146e3c0b.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB21_deterministic_parts_grow_with_the_system-f055f4bb449380e9.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB22_every_component_capability_command_events_as_nodes-0dc30ff0fe394f6b.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB23_a_new_system_slots_in-d8c8e1bb9fdc8301.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB25_atlas_template_in_his_structure-8782436b6f63495b.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB32_context_is_never_optional-811c78496a6d6038.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB33_the_agent_runs_the_pipeline-4535cb3c5069ae44.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB34_context_is_the_code_tab_the_graphs_and_memory-2adfa9887db541f0.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB36_every_agent_can_use_the_tools-dccbe766f7ed1fa8.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB38_prerequisites_the_questions_first-a417012ad83099c0.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB39_the_checklist_builds_the_working_set-2ebaab7551ee77f8.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB42_a_repo_expands_from_its_spec-e363fb41c2435456.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB43_the_expansion_is_phased-d07fa0b1c8d777ac.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB47_built_and_run_in_cos-00c4a05731de14a2.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB48_proof_in_cos_closes_the_phase-054d76a838a4463d.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB5_nexus_rebuilds_a_system_from_its_spec-17dc36ec94b3a10e.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB6_hundreds_of_specs-121a25b96ccdf275.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/SB7_domain_file_tree_templates-51af06abc8952960.graph`
- `lib/phases/2026-10-05-build-from-the-spec/graph/WS1_agents_use_the_work_surface-3a87213be2eb4b9d.graph`
- `lib/phases/2026-10-05-cli-data-code/CL1_commands_declared_by_their_system.phase`
- `lib/phases/2026-10-05-cli-data-code/CT1_one_pending_change_path.phase`
- `lib/phases/2026-10-05-cli-data-code/HG1_components_store_map_parses.phase`
- `lib/phases/2026-10-05-cli-data-code/HG3_bv09_the_detector_and_files.phase`
- `lib/phases/2026-10-05-cli-data-code/HG4_scripts_inside_the_sandbox.phase`
- `lib/phases/2026-10-05-cli-data-code/HG7_the_law_and_clear_glass.phase`
- `lib/phases/2026-10-05-cli-data-code/HG8_raid_phases_belong_to_cortex.phase`
- `lib/phases/2026-10-05-cli-data-code/PB1_no_build_below_a_floor.phase`
- `lib/phases/2026-10-05-cli-data-code/PB3_verify_counts_what_this_run_broke.phase`
- `lib/phases/2026-10-05-cli-data-code/PB5_the_real_broken_imports.phase`
- `lib/phases/2026-10-05-cli-data-code/SY1_fifteen_systems.phase`
- `lib/phases/2026-10-05-cli-data-code/SY2_cos_its_own_system.phase`
- `lib/phases/2026-10-05-cli-data-code/graph/CL1_commands_declared_by_their_system-17ce5c8f22a70bb7.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/CT1_one_pending_change_path-e9d4a2ab8a870183.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/HG1_components_store_map_parses-dcd4302a4f92f533.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/HG3_bv09_the_detector_and_files-8f5946737fc02601.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/HG4_scripts_inside_the_sandbox-a8510e63e202d6f6.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/HG7_the_law_and_clear_glass-e775e5b9fae4d6a3.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/HG8_raid_phases_belong_to_cortex-dc05cb067c7d5dd0.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/PB1_no_build_below_a_floor-aa5354fee35ba1e8.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/PB3_verify_counts_what_this_run_broke-2c3748ba8d24ac93.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/PB5_the_real_broken_imports-64c2d31e9c1a9aff.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/SY1_fifteen_systems-0b9d29e5e19e2532.graph`
- `lib/phases/2026-10-05-cli-data-code/graph/SY2_cos_its_own_system-5140e15f0bab147d.graph`
- `lib/phases/2026-10-05-code-tab-and-one-router/CT1_one_door_for_models.phase`
- `lib/phases/2026-10-05-code-tab-and-one-router/CT2_it_learns_and_switches.phase`
- `lib/phases/2026-10-05-code-tab-and-one-router/CT6_the_escalation_ladder.phase`
- `lib/phases/2026-10-05-code-tab-and-one-router/CT8_live_agent_activity.phase`
- `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT1_one_door_for_models-73db225aab49ebc2.graph`
- `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT2_it_learns_and_switches-5b7e5862f894dcd4.graph`
- `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT6_the_escalation_ladder-efb8afe9cf9edd48.graph`
- `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT8_live_agent_activity-d4a3a275c6d63391.graph`
- `lib/phases/2026-10-05-cos-machines/AP2_test_on_the_android_compartment.phase`
- `lib/phases/2026-10-05-cos-machines/graph/AP2_test_on_the_android_compartment-1a8e2550e9c6190b.graph`
- `lib/phases/2026-10-05-failure-reproduction/FM1_every_ledger_into_rfr2.phase`
- `lib/phases/2026-10-05-failure-reproduction/FM3_run_it_in_cos.phase`
- `lib/phases/2026-10-05-failure-reproduction/graph/FM1_every_ledger_into_rfr2-3f69872ecac3e79c.graph`
- `lib/phases/2026-10-05-failure-reproduction/graph/FM3_run_it_in_cos-9c26dcce49a297be.graph`
- `lib/phases/2026-10-05-spec-workshop-rebuild/RS1_the_generation_recorder.phase`
- `lib/phases/2026-10-05-spec-workshop-rebuild/RS2_replay_rewind_branch.phase`
- `lib/phases/2026-10-05-spec-workshop-rebuild/RS3_the_spec_document.phase`
- `lib/phases/2026-10-05-spec-workshop-rebuild/RS8_what_converges_becomes_deterministic.phase`
- `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS1_the_generation_recorder-fb8844b445a656ad.graph`
- `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS2_replay_rewind_branch-ed0fd5754ecc8b3a.graph`
- `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS3_the_spec_document-6a4e782e7d9fcab1.graph`
- `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS8_what_converges_becomes_deterministic-14a9d76c2db6ad37.graph`
- `lib/phases/2026-10-05-verified-primitives/VP0_map_and_atlas.phase`
- `lib/phases/2026-10-05-verified-primitives/VP1_confidence_from_evidence.phase`
- `lib/phases/2026-10-05-verified-primitives/VP2_adversarial_review.phase`
- `lib/phases/2026-10-05-verified-primitives/VP4_the_primitive_field.phase`
- `lib/phases/2026-10-05-verified-primitives/VP5_provenance.phase`
- `lib/phases/2026-10-05-verified-primitives/VP6_debug_and_intelligence_in_the_desktop.phase`
- `lib/phases/2026-10-05-verified-primitives/graph/VP0_map_and_atlas-0153feef7a3d9938.graph`
- `lib/phases/2026-10-05-verified-primitives/graph/VP1_confidence_from_evidence-d274b14ef5df1bea.graph`
- `lib/phases/2026-10-05-verified-primitives/graph/VP2_adversarial_review-861894593ce759d9.graph`
- `lib/phases/2026-10-05-verified-primitives/graph/VP4_the_primitive_field-e222cd9217f780b8.graph`
- `lib/phases/2026-10-05-verified-primitives/graph/VP5_provenance-f17055700f5ac665.graph`
- `lib/phases/2026-10-05-verified-primitives/graph/VP6_debug_and_intelligence_in_the_desktop-cb17f73919611193.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/AL1_activity_log.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/CC1_claude_code_lands_like_every_agent.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/CM2_every_command_for_every_agent.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/DT1_desktop_into_the_log.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/DX1_diagnose_it.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/SP1_one_spotlight.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/UN1_nexus_surfaces_in_the_field.phase`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/AL1_activity_log-f60e21ab10d46017.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/CC1_claude_code_lands_like_every_agent-bab5260f8cf63874.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/CM2_every_command_for_every_agent-96b5745236336c5b.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/DT1_desktop_into_the_log-8ce7b320cd5c0cd0.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/DX1_diagnose_it-589ac7374abdf907.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/SP1_one_spotlight-094a82781d95acdc.graph`
- `lib/phases/2026-10-07-compartment-control-and-activity/graph/UN1_nexus_surfaces_in_the_field-6a1c22a94c4ecbba.graph`
- `lib/phases/2026-10-07-idearium-one-surface/OS1_commits_say_what_they_touched.phase`
- `lib/phases/2026-10-07-idearium-one-surface/OS6_proved_on_the_real_page.phase`
- `lib/phases/2026-10-07-idearium-one-surface/OS9_the_agent_is_in_the_code_tab.phase`
- `lib/phases/2026-10-07-idearium-one-surface/SP3_the_file_tree_is_the_spine.phase`
- `lib/phases/2026-10-07-idearium-one-surface/graph/OS1_commits_say_what_they_touched-cd4a72feed007e70.graph`
- `lib/phases/2026-10-07-idearium-one-surface/graph/OS6_proved_on_the_real_page-6e7f9d7881770520.graph`
- `lib/phases/2026-10-07-idearium-one-surface/graph/OS9_the_agent_is_in_the_code_tab-b061d20cf1e09377.graph`
- `lib/phases/2026-10-07-idearium-one-surface/graph/SP3_the_file_tree_is_the_spine-a05d1bb6700d15b8.graph`
- `lib/phases/2026-10-07-ollama-recorder/OR2_every_call_a_frame.phase`
- `lib/phases/2026-10-07-ollama-recorder/graph/OR2_every_call_a_frame-350154edf9f42462.graph`
- `lib/phases/2026-10-07-runtime-load/PF1_the_stall.phase`
- `lib/phases/2026-10-07-runtime-load/PF2_velocity_steers_the_governor.phase`
- `lib/phases/2026-10-07-runtime-load/PF6_slow_ticks_name_themselves.phase`
- `lib/phases/2026-10-07-runtime-load/graph/PF1_the_stall-7057301b9979c4f4.graph`
- `lib/phases/2026-10-07-runtime-load/graph/PF2_velocity_steers_the_governor-5c6b870477e755ff.graph`
- `lib/phases/2026-10-07-runtime-load/graph/PF6_slow_ticks_name_themselves-433ed474eed245fb.graph`
- `lib/phases/2026-10-07-system-expectations/EX1_the_expectation_schema.phase`
- `lib/phases/2026-10-07-system-expectations/EX2_vitals_from_every_process.phase`
- `lib/phases/2026-10-07-system-expectations/graph/EX1_the_expectation_schema-19589d1a025b2723.graph`
- `lib/phases/2026-10-07-system-expectations/graph/EX2_vitals_from_every_process-8337bd39d03384c4.graph`
- `lib/phases/2026-10-07-versionium-releases/GH1_the_git_bridge.phase`
- `lib/phases/2026-10-07-versionium-releases/LT1_provenance_lattice.phase`
- `lib/phases/2026-10-07-versionium-releases/RN2_cortex_is_the_bookkeeper.phase`
- `lib/phases/2026-10-07-versionium-releases/graph/GH1_the_git_bridge-6dd3595186ddbb17.graph`
- `lib/phases/2026-10-07-versionium-releases/graph/LT1_provenance_lattice-91871c2b63fe20e1.graph`
- `lib/phases/2026-10-07-versionium-releases/graph/RN2_cortex_is_the_bookkeeper-86535db74885de3a.graph`
- `lib/phases/2026-10-09-hardening-pass/HP12_a_failure_names_the_agent.phase`
- `lib/phases/2026-10-09-hardening-pass/HP18_auto_tries_agents_with_a_tab_first.phase`
- `lib/phases/2026-10-09-hardening-pass/HP19_the_simulator_stays.phase`
- `lib/phases/2026-10-09-hardening-pass/HP20_a_routing_try_is_not_a_job.phase`
- `lib/phases/2026-10-09-hardening-pass/HP4_signals_weighted.phase`
- `lib/phases/2026-10-09-hardening-pass/HP5_odd_files_round_trip.phase`
- `lib/phases/2026-10-09-hardening-pass/graph/HP12_a_failure_names_the_agent-bec3f59ad333b46f.graph`
- `lib/phases/2026-10-09-hardening-pass/graph/HP18_auto_tries_agents_with_a_tab_first-f11a7f42d67241f0.graph`
- `lib/phases/2026-10-09-hardening-pass/graph/HP19_the_simulator_stays-68d2133829f37a8f.graph`
- `lib/phases/2026-10-09-hardening-pass/graph/HP20_a_routing_try_is_not_a_job-d5e16036c01329d2.graph`
- `lib/phases/2026-10-09-hardening-pass/graph/HP4_signals_weighted-036df943c960cf97.graph`
- `lib/phases/2026-10-09-hardening-pass/graph/HP5_odd_files_round_trip-a3b1cad180508350.graph`
- `lib/phases/2026-10-09-one-model-engine/ME0_the_inventory_proved.phase`
- `lib/phases/2026-10-09-one-model-engine/ME10_nested_ladders_folded.phase`
- `lib/phases/2026-10-09-one-model-engine/ME12_callers_moved.phase`
- `lib/phases/2026-10-09-one-model-engine/ME13_no_bypass.phase`
- `lib/phases/2026-10-09-one-model-engine/ME14_across_callers.phase`
- `lib/phases/2026-10-09-one-model-engine/ME15_the_docs_tell_the_truth.phase`
- `lib/phases/2026-10-09-one-model-engine/ME1_one_failure_list.phase`
- `lib/phases/2026-10-09-one-model-engine/ME2_caller_policy.phase`
- `lib/phases/2026-10-09-one-model-engine/ME3_one_engine_one_budget.phase`
- `lib/phases/2026-10-09-one-model-engine/ME4_one_attempt_record.phase`
- `lib/phases/2026-10-09-one-model-engine/ME5_one_chooser.phase`
- `lib/phases/2026-10-09-one-model-engine/ME6_one_learner.phase`
- `lib/phases/2026-10-09-one-model-engine/graph/ME0_the_inventory_proved-9d64861419da9a7a.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME10_nested_ladders_folded-4010d5284074ac51.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME12_callers_moved-9e7765b848590053.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME13_no_bypass-5db1b29401ba54fb.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME14_across_callers-0d67fbee2de537c0.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME15_the_docs_tell_the_truth-e4a2663f9650838b.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME1_one_failure_list-6aa7efde8e0d3998.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME2_caller_policy-9ddb1c53e714496d.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME3_one_engine_one_budget-82b28a68e6a7adbb.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME4_one_attempt_record-f2a989a0e8ce7614.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME5_one_chooser-c19c4acf0d80ec8c.graph`
- `lib/phases/2026-10-09-one-model-engine/graph/ME6_one_learner-a3c93c03d487932a.graph`
- `lib/phases/2026-10-09-one-roadmap/OR0_the_census.phase`
- `lib/phases/2026-10-09-one-roadmap/OR2_how_done_is_checked.phase`
- `lib/phases/2026-10-09-one-roadmap/OR2_the_proposal.phase`
- `lib/phases/2026-10-09-one-roadmap/OR3_his_decisions_applied.phase`
- `lib/phases/2026-10-09-one-roadmap/OR6_old_code_out.phase`
- `lib/phases/2026-10-09-one-roadmap/OR7_the_shelf_combed.phase`
- `lib/phases/2026-10-09-one-roadmap/graph/OR0_the_census-b3f330f789402a35.graph`
- `lib/phases/2026-10-09-one-roadmap/graph/OR2_how_done_is_checked-438048adff31f436.graph`
- `lib/phases/2026-10-09-one-roadmap/graph/OR2_the_proposal-87394dbbf51c92a7.graph`
- `lib/phases/2026-10-09-one-roadmap/graph/OR3_his_decisions_applied-f52f9193180a26cb.graph`
- `lib/phases/2026-10-09-one-roadmap/graph/OR6_old_code_out-6af214e0e32a3243.graph`
- `lib/phases/2026-10-09-one-roadmap/graph/OR7_the_shelf_combed-5e186047ef132114.graph`
- `lib/phases/2026-10-10-design-surface/DS0_one_token_source.phase`
- `lib/phases/2026-10-10-design-surface/DS3_components_are_mods.phase`
- `lib/phases/2026-10-10-design-surface/DS5_the_agents_design_too.phase`
- `lib/phases/2026-10-10-design-surface/DS6_one_module_contract_nested.phase`
- `lib/phases/2026-10-10-design-surface/DS7_tools_are_mods.phase`
- `lib/phases/2026-10-10-design-surface/DS8_the_registry_routes_the_ui_reflects.phase`
- `lib/phases/2026-10-10-design-surface/graph/DS0_one_token_source-385edcecb63311aa.graph`
- `lib/phases/2026-10-10-design-surface/graph/DS3_components_are_mods-bb967cfd589a6163.graph`
- `lib/phases/2026-10-10-design-surface/graph/DS5_the_agents_design_too-1fd7bef8de2d374a.graph`
- `lib/phases/2026-10-10-design-surface/graph/DS6_one_module_contract_nested-53a34b1d184d1911.graph`
- `lib/phases/2026-10-10-design-surface/graph/DS7_tools_are_mods-95b991d2ba973682.graph`
- `lib/phases/2026-10-10-design-surface/graph/DS8_the_registry_routes_the_ui_reflects-9db061f88abf55a1.graph`
- `lib/phases/2026-10-10-idearium-access/IA5_provider_accounts_per_hat_and_repo.phase`
- `lib/phases/2026-10-10-idearium-access/graph/IA5_provider_accounts_per_hat_and_repo-fd55efa3a8901e7f.graph`
- `lib/phases/2026-10-10-idearium-solid/SD0_versionium_down_is_said_and_restarted.phase`
- `lib/phases/2026-10-10-idearium-solid/SD10_the_adversarial_gate.phase`
- `lib/phases/2026-10-10-idearium-solid/SD20_a_starved_machine_does_not_spin.phase`
- `lib/phases/2026-10-10-idearium-solid/SD4_agents_live_in_guardian.phase`
- `lib/phases/2026-10-10-idearium-solid/SD5_account_fallback.phase`
- `lib/phases/2026-10-10-idearium-solid/SD7_blocks_that_generate_themselves.phase`
- `lib/phases/2026-10-10-idearium-solid/SD9_claude_code_inside_idearium.phase`
- `lib/phases/2026-10-10-idearium-solid/graph/SD0_versionium_down_is_said_and_restarted-d745c23ff321527a.graph`
- `lib/phases/2026-10-10-idearium-solid/graph/SD10_the_adversarial_gate-903ae831ea1a844a.graph`
- `lib/phases/2026-10-10-idearium-solid/graph/SD20_a_starved_machine_does_not_spin-76dc07b8a12db6ca.graph`
- `lib/phases/2026-10-10-idearium-solid/graph/SD4_agents_live_in_guardian-d79b599501f437b1.graph`
- `lib/phases/2026-10-10-idearium-solid/graph/SD5_account_fallback-655edc147445e9ca.graph`
- `lib/phases/2026-10-10-idearium-solid/graph/SD7_blocks_that_generate_themselves-0d8df190210c4970.graph`
- `lib/phases/2026-10-10-idearium-solid/graph/SD9_claude_code_inside_idearium-681f598deb142c6d.graph`
- `lib/phases/2026-10-10-self-awareness/AW2_every_call_says_who_asked.phase`
- `lib/phases/2026-10-10-self-awareness/AW4_the_door_reads_the_lattice.phase`
- `lib/phases/2026-10-10-self-awareness/graph/AW2_every_call_says_who_asked-a5bd86f3bfadf956.graph`
- `lib/phases/2026-10-10-self-awareness/graph/AW4_the_door_reads_the_lattice-4de82ab7f378354b.graph`
- `lib/phases/2026-10-10-shape-of-nexus/EP1_every_claim_says_how_it_is_known.phase`
- `lib/phases/2026-10-10-shape-of-nexus/FN3_the_nerve_shows_it_and_the_field_sees_the_nerve.phase`
- `lib/phases/2026-10-10-shape-of-nexus/LR0_the_shared_primitives_are_the_glyph.phase`
- `lib/phases/2026-10-10-shape-of-nexus/LR1_each_component_in_the_language_that_fits.phase`
- `lib/phases/2026-10-10-shape-of-nexus/OP0_one_options_shape_for_every_system.phase`
- `lib/phases/2026-10-10-shape-of-nexus/OP1_every_system_declares_its_options.phase`
- `lib/phases/2026-10-10-shape-of-nexus/SH1_one_home_for_every_concept.phase`
- `lib/phases/2026-10-10-shape-of-nexus/graph/EP1_every_claim_says_how_it_is_known-518303ecd7d85d85.graph`
- `lib/phases/2026-10-10-shape-of-nexus/graph/FN3_the_nerve_shows_it_and_the_field_sees_the_nerve-5a5715d4e3cba86c.graph`
- `lib/phases/2026-10-10-shape-of-nexus/graph/LR0_the_shared_primitives_are_the_glyph-6952439b2f80c99c.graph`
- `lib/phases/2026-10-10-shape-of-nexus/graph/LR1_each_component_in_the_language_that_fits-811033a724b0ca79.graph`
- `lib/phases/2026-10-10-shape-of-nexus/graph/OP0_one_options_shape_for_every_system-a172702727a5d91e.graph`
- `lib/phases/2026-10-10-shape-of-nexus/graph/OP1_every_system_declares_its_options-954ea8eee677f68e.graph`
- `lib/phases/2026-10-10-shape-of-nexus/graph/SH1_one_home_for_every_concept-d30f0553638eb554.graph`
- `lib/phases/2026-10-10-snapshot-compartments/SN4_benchmarks_teach.phase`
- `lib/phases/2026-10-10-snapshot-compartments/graph/SN4_benchmarks_teach-c23057ec2723dd8b.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/CS0_projects_decomposed_into_components.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/JB5_varied_wording_true_facts.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/MX4_one_system_digest.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/PV0_claude_code_is_a_guardian_provider.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/PV1_providers_read_from_nodes.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/PV2_hats_are_nodes.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/PV4_inputs_are_history.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/PV5_conversation_carries_across_providers.phase`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/CS0_projects_decomposed_into_components-c12a1ca2cc3030ee.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/JB5_varied_wording_true_facts-88d2ca99cff642c0.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/MX4_one_system_digest-b1af60343305fd6c.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/PV0_claude_code_is_a_guardian_provider-700deffb992647b8.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/PV1_providers_read_from_nodes-727b5bb6b91c22ad.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/PV2_hats_are_nodes-66c258dbf8ec8139.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/PV4_inputs_are_history-a129834872fdbcc9.graph`
- `lib/phases/2026-10-12-browser-providers-and-work/graph/PV5_conversation_carries_across_providers-221b5ffcc46bedbf.graph`
- `lib/phases/2026-10-12-request-spine/RQ0_the_inventory_proved.phase`
- `lib/phases/2026-10-12-request-spine/RQ10_anchors_and_the_diff_reconciled.phase`
- `lib/phases/2026-10-12-request-spine/RQ13_the_work_surface_and_provenance.phase`
- `lib/phases/2026-10-12-request-spine/RQ14_the_spine_end_to_end.phase`
- `lib/phases/2026-10-12-request-spine/RQ16_hypotheses_in_parallel.phase`
- `lib/phases/2026-10-12-request-spine/RQ17_observe_by_request.phase`
- `lib/phases/2026-10-12-request-spine/RQ19_what_nexus_can_take_over.phase`
- `lib/phases/2026-10-12-request-spine/RQ1_the_verifier_library.phase`
- `lib/phases/2026-10-12-request-spine/RQ20_the_budget_meter.phase`
- `lib/phases/2026-10-12-request-spine/RQ22_the_dependency_boundary_with_invariants_that_run.phase`
- `lib/phases/2026-10-12-request-spine/RQ23_acceptance_conditions_that_cannot_be_moved.phase`
- `lib/phases/2026-10-12-request-spine/RQ24_the_gate_transaction.phase`
- `lib/phases/2026-10-12-request-spine/RQ27_the_reasoning_half_gets_its_home.phase`
- `lib/phases/2026-10-12-request-spine/RQ2_the_generation_failure_vocabulary_and_index.phase`
- `lib/phases/2026-10-12-request-spine/RQ3_repair_with_the_checks_own_words.phase`
- `lib/phases/2026-10-12-request-spine/RQ4_escalate_on_the_checks_and_keep_the_lesson.phase`
- `lib/phases/2026-10-12-request-spine/RQ5_the_small_model_baseline.phase`
- `lib/phases/2026-10-12-request-spine/RQ6_one_intent_map.phase`
- `lib/phases/2026-10-12-request-spine/RQ8_the_gap_is_a_question.phase`
- `lib/phases/2026-10-12-request-spine/graph/RQ0_the_inventory_proved-12cd112c5dccb7ef.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ10_anchors_and_the_diff_reconciled-7bbed5785d277733.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ13_the_work_surface_and_provenance-26d29fe3a64d548b.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ14_the_spine_end_to_end-293afff90452c8de.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ16_hypotheses_in_parallel-39c60cb36660f79d.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ17_observe_by_request-33924dbf8607becb.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ19_what_nexus_can_take_over-18b7aa141588697b.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ1_the_verifier_library-ce3d943947d62331.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ20_the_budget_meter-9d7db0cfde669293.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ22_the_dependency_boundary_with_invariants_that_run-8ca887e33d3969e3.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ23_acceptance_conditions_that_cannot_be_moved-6eb606b5ddc53407.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ24_the_gate_transaction-ad6d4d6afc88c72b.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ27_the_reasoning_half_gets_its_home-ed8b75d6432e38bc.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ2_the_generation_failure_vocabulary_and_index-5df3e6faedddd92c.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ3_repair_with_the_checks_own_words-d4c1d91c1ca5d6a9.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ4_escalate_on_the_checks_and_keep_the_lesson-8a42351a9f6f78fc.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ5_the_small_model_baseline-4c70d01e0d9a89a3.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ6_one_intent_map-d5b9477b2e039d62.graph`
- `lib/phases/2026-10-12-request-spine/graph/RQ8_the_gap_is_a_question-103a81b4f5d8cf1c.graph`
- `lib/phases/2026-10-13-gates-that-learn-and-priorities/QA1_the_catalogue_runs.phase`
- `lib/phases/2026-10-13-gates-that-learn-and-priorities/RT1_eligibility_then_preference.phase`
- `lib/phases/2026-10-13-gates-that-learn-and-priorities/graph/QA1_the_catalogue_runs-2f28022294f93cfe.graph`
- `lib/phases/2026-10-13-gates-that-learn-and-priorities/graph/RT1_eligibility_then_preference-db32153ad00baf8c.graph`
- `lib/phases/2026-10-13-identities-tabs-and-automation/HM0_the_hat_keeps_a_model_of_the_repo.phase`
- `lib/phases/2026-10-13-identities-tabs-and-automation/graph/HM0_the_hat_keeps_a_model_of_the_repo-3e7320f2d7cabfcb.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CT0_the_contract_is_a_reference.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CT1_dynamic_chunking.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CT2_ingestion_as_contracts.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CX0_context_from_dependencies.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/GT0_every_interaction_gated.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/IM0_intent_map_his_to_change.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/PF0_profiles_linked_to_hats.phase`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT0_the_contract_is_a_reference-78068c3fef97cff2.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT1_dynamic_chunking-f7d073f269227f58.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT2_ingestion_as_contracts-ba7095d82e6aabf3.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CX0_context_from_dependencies-dbe7d50a20a425b3.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/GT0_every_interaction_gated-03a2a715a7b70f73.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/IM0_intent_map_his_to_change-6349e71baccd8530.graph`
- `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/PF0_profiles_linked_to_hats-1617b623eba97216.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/CK1_the_catalogue_runs.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/PL0_his_projects_imported_for_real.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/PL2_history_kept.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/PL3_versions_become_history.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/PL4_import_reports_what_is_broken.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/PL6_global_links_seen.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/RD3_the_registry_carries_events.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/RF0_architecture_read.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/RF1_migration_proposed_as_phases.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/RF2_applied_one_phase_at_a_time.phase`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/CK1_the_catalogue_runs-1f64ff14ad327042.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL0_his_projects_imported_for_real-061b0f3b31ea86d0.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL2_history_kept-5b4cd0e60f00b85b.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL3_versions_become_history-0044abaf283377f6.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL4_import_reports_what_is_broken-463d5b3d9d4f4c22.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL6_global_links_seen-d930008daef10476.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/RD3_the_registry_carries_events-f2ceaa39f7c300e5.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/RF0_architecture_read-c117168ac25aa9f0.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/RF1_migration_proposed_as_phases-0653cb1c1c976e54.graph`
- `lib/phases/2026-10-13-projects-raid-and-gates/graph/RF2_applied_one_phase_at_a_time-fcaca59eda2838e7.graph`
- `lib/phases/2026-10-15-automatic-tracking/AU1_addenda_written_for_you.phase`
- `lib/phases/2026-10-15-automatic-tracking/CS1_every_brick_a_component.phase`
- `lib/phases/2026-10-15-automatic-tracking/CX1_context_from_the_dependencies.phase`
- `lib/phases/2026-10-15-automatic-tracking/KT1_observations_on_a_semantic_tree.phase`
- `lib/phases/2026-10-15-automatic-tracking/LA1_one_self_model.phase`
- `lib/phases/2026-10-15-automatic-tracking/MC1_macros_from_repeats.phase`
- `lib/phases/2026-10-15-automatic-tracking/graph/AU1_addenda_written_for_you-a1c1fe9139548e36.graph`
- `lib/phases/2026-10-15-automatic-tracking/graph/CS1_every_brick_a_component-7d658969a189e1e4.graph`
- `lib/phases/2026-10-15-automatic-tracking/graph/CX1_context_from_the_dependencies-7fa78ba0b9bcd675.graph`
- `lib/phases/2026-10-15-automatic-tracking/graph/KT1_observations_on_a_semantic_tree-3bef71197a9bf793.graph`
- `lib/phases/2026-10-15-automatic-tracking/graph/LA1_one_self_model-d1166e769184d12d.graph`
- `lib/phases/2026-10-15-automatic-tracking/graph/MC1_macros_from_repeats-611c1e68d8c1dd1b.graph`
- `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/CS1_capability_spec_and_surface_check.phase`
- `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/SP3_the_browser_agent_reads_the_tree.phase`
- `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/CS1_capability_spec_and_surface_check-a1190cde7dea8320.graph`
- `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/SP3_the_browser_agent_reads_the_tree-0f6a46c1ba15a7e6.graph`
- `lib/phases/2026-10-15-clear-glass-network-posture/NP19_container.phase`
- `lib/phases/2026-10-15-clear-glass-network-posture/graph/NP19_container-ec54a18411dad545.graph`
- `lib/phases/2026-10-15-clear-glass-surfaces/PF1_read_the_log.phase`
- `lib/phases/2026-10-15-clear-glass-surfaces/graph/PF1_read_the_log-5490f29c2a420c27.graph`
- `lib/phases/2026-10-15-code-tab-run-state/CE12_proof_and_wiring.phase`
- `lib/phases/2026-10-15-code-tab-run-state/CE1_the_run_state.phase`
- `lib/phases/2026-10-15-code-tab-run-state/CE2_the_task_header.phase`
- `lib/phases/2026-10-15-code-tab-run-state/CE3_reply_on_task_gate.phase`
- `lib/phases/2026-10-15-code-tab-run-state/CE5_events.phase`
- `lib/phases/2026-10-15-code-tab-run-state/CV2_a_version_per_diff.phase`
- `lib/phases/2026-10-15-code-tab-run-state/CV5_universal_versioning.phase`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CE12_proof_and_wiring-dc6801d7a1de9fef.graph`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CE1_the_run_state-48bba9cee37fd0d2.graph`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CE2_the_task_header-5cf233239ddf24a1.graph`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CE3_reply_on_task_gate-6494fb36f98b0242.graph`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CE5_events-4e7457d69c24f4b1.graph`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CV2_a_version_per_diff-fa951e6ce16e4c3d.graph`
- `lib/phases/2026-10-15-code-tab-run-state/graph/CV5_universal_versioning-caf16dc4d08f56cc.graph`
- `lib/phases/2026-10-15-cos-app/COSA12_vmware_window.phase`
- `lib/phases/2026-10-15-cos-app/COSA14_versionium_record.phase`
- `lib/phases/2026-10-15-cos-app/COSA5_data_root.phase`
- `lib/phases/2026-10-15-cos-app/COSA6_the_exe.phase`
- `lib/phases/2026-10-15-cos-app/COSA8_other_projects.phase`
- `lib/phases/2026-10-15-cos-app/COSA9_idearium_sync.phase`
- `lib/phases/2026-10-15-cos-app/graph/COSA12_vmware_window-c348ed645b8dabb1.graph`
- `lib/phases/2026-10-15-cos-app/graph/COSA14_versionium_record-19b95401bebec01f.graph`
- `lib/phases/2026-10-15-cos-app/graph/COSA5_data_root-8c58d98a92114457.graph`
- `lib/phases/2026-10-15-cos-app/graph/COSA6_the_exe-6de6d4ad67498fc0.graph`
- `lib/phases/2026-10-15-cos-app/graph/COSA8_other_projects-5f67a6ff59ecd341.graph`
- `lib/phases/2026-10-15-cos-app/graph/COSA9_idearium_sync-ddd57d8b3fb336bf.graph`
- `lib/phases/2026-10-15-fiverr-ledger/PF0_the_ledger.phase`
- `lib/phases/2026-10-15-fiverr-ledger/PF1_the_sources.phase`
- `lib/phases/2026-10-15-fiverr-ledger/PF2_the_slots_into_a_gig.phase`
- `lib/phases/2026-10-15-fiverr-ledger/graph/PF0_the_ledger-a4583a7c88b46cd6.graph`
- `lib/phases/2026-10-15-fiverr-ledger/graph/PF1_the_sources-e60ed3365a0a2cec.graph`
- `lib/phases/2026-10-15-fiverr-ledger/graph/PF2_the_slots_into_a_gig-6abf349983e78cdf.graph`
- `lib/phases/2026-10-15-gate-held-work/GW10_the_listener_knows_what_to_hear.phase`
- `lib/phases/2026-10-15-gate-held-work/GW15_every_file_tested.phase`
- `lib/phases/2026-10-15-gate-held-work/GW16_parallel_branches_benchmark.phase`
- `lib/phases/2026-10-15-gate-held-work/GW18_debug_by_bisect.phase`
- `lib/phases/2026-10-15-gate-held-work/GW22_find_before_generate.phase`
- `lib/phases/2026-10-15-gate-held-work/GW2_the_run_follows_the_gate.phase`
- `lib/phases/2026-10-15-gate-held-work/GW3_a_contract_is_traced.phase`
- `lib/phases/2026-10-15-gate-held-work/GW5_agents_are_copilot.phase`
- `lib/phases/2026-10-15-gate-held-work/GW6_the_intelligence_system_on_every_gate.phase`
- `lib/phases/2026-10-15-gate-held-work/GW7_failure_macro_and_rewind.phase`
- `lib/phases/2026-10-15-gate-held-work/GW8_causal_graph_and_failure_mode_field.phase`
- `lib/phases/2026-10-15-gate-held-work/graph/GW10_the_listener_knows_what_to_hear-539f9afb9e5ba54e.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW15_every_file_tested-01a6f0bce2e5893d.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW16_parallel_branches_benchmark-7496bd8f1af2a364.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW18_debug_by_bisect-356417f6dfb2bb3d.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW22_find_before_generate-ebd47dffa0a8bc56.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW2_the_run_follows_the_gate-8f78d99aa885a501.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW3_a_contract_is_traced-7ee6767772d2310d.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW5_agents_are_copilot-6b97cd0bef25edcb.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW6_the_intelligence_system_on_every_gate-88688bb77b7d9ade.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW7_failure_macro_and_rewind-9ea220d322030fc4.graph`
- `lib/phases/2026-10-15-gate-held-work/graph/GW8_causal_graph_and_failure_mode_field-663a3a1b6c41b6e9.graph`
- `lib/phases/2026-10-15-macro-node-recording/MR10_capabilities_as_steps.phase`
- `lib/phases/2026-10-15-macro-node-recording/MR14_tasks_and_mesh_spec.phase`
- `lib/phases/2026-10-15-macro-node-recording/graph/MR10_capabilities_as_steps-7fc5751ee0244562.graph`
- `lib/phases/2026-10-15-macro-node-recording/graph/MR14_tasks_and_mesh_spec-4cb900f7984eca36.graph`
- `lib/phases/2026-10-15-one-contract-raid-releases/AT1_atlases_and_specs_from_releases.phase`
- `lib/phases/2026-10-15-one-contract-raid-releases/FR1_failure_reports.phase`
- `lib/phases/2026-10-15-one-contract-raid-releases/GS1_a_snapshot_per_gate_rewind_and_compare.phase`
- `lib/phases/2026-10-15-one-contract-raid-releases/RN2_changelog_from_the_commits.phase`
- `lib/phases/2026-10-15-one-contract-raid-releases/ST1_stability_checks.phase`
- `lib/phases/2026-10-15-one-contract-raid-releases/graph/AT1_atlases_and_specs_from_releases-dc5b8827fb668ce2.graph`
- `lib/phases/2026-10-15-one-contract-raid-releases/graph/FR1_failure_reports-dafc215b29905071.graph`
- `lib/phases/2026-10-15-one-contract-raid-releases/graph/GS1_a_snapshot_per_gate_rewind_and_compare-019413470fb371c3.graph`
- `lib/phases/2026-10-15-one-contract-raid-releases/graph/RN2_changelog_from_the_commits-1e0e93783f21a1c4.graph`
- `lib/phases/2026-10-15-one-contract-raid-releases/graph/ST1_stability_checks-73c9424926bf802e.graph`
- `lib/phases/2026-10-15-personal-chat-import/PI1_the_importer.phase`
- `lib/phases/2026-10-15-personal-chat-import/PI3_the_intelligence_pass.phase`
- `lib/phases/2026-10-15-personal-chat-import/graph/PI1_the_importer-4811bb5810fcbe4d.graph`
- `lib/phases/2026-10-15-personal-chat-import/graph/PI3_the_intelligence_pass-081c0303b5cee64e.graph`
- `lib/phases/2026-10-15-spec-foundation-model/SF4_the_listener.phase`
- `lib/phases/2026-10-15-spec-foundation-model/graph/SF4_the_listener-6ccc005b3e35e04e.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/IS1_intent_settings_per_repo.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/MP1_nexus_maps_every_phase.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/MP3_builds_get_the_mapped_context.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF1_intent_blocks.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF2_spec_framework_block.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF3_collect_the_spec.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF4_compile_on_collect.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/WB0_census.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/WB1_warp_at_the_rung.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/WB2_raid_bricks_and_officiator_through_warp.phase`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/IS1_intent_settings_per_repo-6e793c69f386d367.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP1_nexus_maps_every_phase-38eb3640a0730199.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP3_builds_get_the_mapped_context-a8ea1fb30dbfd70b.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF1_intent_blocks-a8afa92a489433cd.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF2_spec_framework_block-f3369f9f0bb0ba75.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF3_collect_the_spec-2752c0d140f6df49.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF4_compile_on_collect-aadcbf4561eb1533.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/WB0_census-9a044eef08fa5b1b.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/WB1_warp_at_the_rung-60eb99e47c8e797a.graph`
- `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/WB2_raid_bricks_and_officiator_through_warp-c5988e845eadf750.graph`
- `lib/phases/2026-10-16-agent-work-funnel/FN0_the_funnel_as_data.phase`
- `lib/phases/2026-10-16-agent-work-funnel/FN1_every_door_goes_through_it.phase`
- `lib/phases/2026-10-16-agent-work-funnel/FN2_what_is_missing_is_made_first.phase`
- `lib/phases/2026-10-16-agent-work-funnel/FN3_every_answer_a_node.phase`
- `lib/phases/2026-10-16-agent-work-funnel/graph/FN0_the_funnel_as_data-36bff935bc611507.graph`
- `lib/phases/2026-10-16-agent-work-funnel/graph/FN1_every_door_goes_through_it-1841c94aa41f3eef.graph`
- `lib/phases/2026-10-16-agent-work-funnel/graph/FN2_what_is_missing_is_made_first-94e1791ebf408132.graph`
- `lib/phases/2026-10-16-agent-work-funnel/graph/FN3_every_answer_a_node-f0fd6a276c7d1d69.graph`
- `lib/phases/2026-10-16-canvas-compartments/CN3_nested_compartments.phase`
- `lib/phases/2026-10-16-canvas-compartments/CN6_canvas_screen.phase`
- `lib/phases/2026-10-16-canvas-compartments/graph/CN3_nested_compartments-567d60a0f20626fb.graph`
- `lib/phases/2026-10-16-canvas-compartments/graph/CN6_canvas_screen-a122a921c355bbd5.graph`
- `lib/phases/2026-10-16-code-tab-rebuild/DK1_procedures_backend.phase`
- `lib/phases/2026-10-16-code-tab-rebuild/TB1_read_model_per_tab.phase`
- `lib/phases/2026-10-16-code-tab-rebuild/TB3a_tool_calls_saved.phase`
- `lib/phases/2026-10-16-code-tab-rebuild/TB4_reuse_responses.phase`
- `lib/phases/2026-10-16-code-tab-rebuild/TB7d_node_controls.phase`
- `lib/phases/2026-10-16-code-tab-rebuild/TB8_proof_and_wiring.phase`
- `lib/phases/2026-10-16-code-tab-rebuild/graph/DK1_procedures_backend-8caea4d0996d7b22.graph`
- `lib/phases/2026-10-16-code-tab-rebuild/graph/TB1_read_model_per_tab-28d795fe5701a47d.graph`
- `lib/phases/2026-10-16-code-tab-rebuild/graph/TB3a_tool_calls_saved-7ee37636c61d4d6c.graph`
- `lib/phases/2026-10-16-code-tab-rebuild/graph/TB4_reuse_responses-cf2073506d98196c.graph`
- `lib/phases/2026-10-16-code-tab-rebuild/graph/TB7d_node_controls-4f2be3f82aed75ef.graph`
- `lib/phases/2026-10-16-code-tab-rebuild/graph/TB8_proof_and_wiring-bea6b955a3f4631e.graph`
- `lib/phases/2026-10-16-cos-console/CON5_pane.phase`
- `lib/phases/2026-10-16-cos-console/CON8_nexus_server_hook.phase`
- `lib/phases/2026-10-16-cos-console/graph/CON5_pane-8bbaf7e5aa41faf7.graph`
- `lib/phases/2026-10-16-cos-console/graph/CON8_nexus_server_hook-fd911e37cdaf9fee.graph`
- `lib/phases/2026-10-16-durable-work-timeline/TL1_chunks_land_as_they_arrive.phase`
- `lib/phases/2026-10-16-durable-work-timeline/TL2_resume_at_boot.phase`
- `lib/phases/2026-10-16-durable-work-timeline/TL3_the_timeline.phase`
- `lib/phases/2026-10-16-durable-work-timeline/TL4_rewind_to_a_gate.phase`
- `lib/phases/2026-10-16-durable-work-timeline/TL6_proof_and_wiring.phase`
- `lib/phases/2026-10-16-durable-work-timeline/graph/TL1_chunks_land_as_they_arrive-477fcfa607154070.graph`
- `lib/phases/2026-10-16-durable-work-timeline/graph/TL2_resume_at_boot-a0f0fae0e4e8a429.graph`
- `lib/phases/2026-10-16-durable-work-timeline/graph/TL3_the_timeline-c61967b5d3fdb797.graph`
- `lib/phases/2026-10-16-durable-work-timeline/graph/TL4_rewind_to_a_gate-1b73172e3db632d6.graph`
- `lib/phases/2026-10-16-durable-work-timeline/graph/TL6_proof_and_wiring-2b6b52d3b29be7d3.graph`
- `lib/phases/2026-10-16-eravos-removal/ER1_delete_the_system.phase`
- `lib/phases/2026-10-16-eravos-removal/ER2_unwire_the_platform.phase`
- `lib/phases/2026-10-16-eravos-removal/ER3_unwire_the_screens.phase`
- `lib/phases/2026-10-16-eravos-removal/graph/ER1_delete_the_system-2d6cbb2fd32f8057.graph`
- `lib/phases/2026-10-16-eravos-removal/graph/ER2_unwire_the_platform-eccf746a91d275e5.graph`
- `lib/phases/2026-10-16-eravos-removal/graph/ER3_unwire_the_screens-39401869987f58e9.graph`
- `lib/phases/2026-10-16-google-signin/GS7_no_debugger_on_signin.phase`
- `lib/phases/2026-10-16-google-signin/graph/GS7_no_debugger_on_signin-69372ec12b6080c9.graph`
- `lib/phases/2026-10-16-intent-hat-agent-chain/IH1_intent_nodes_point_at_hats.phase`
- `lib/phases/2026-10-16-intent-hat-agent-chain/IH2_agents_bound.phase`
- `lib/phases/2026-10-16-intent-hat-agent-chain/IH3_routers_read_the_chain.phase`
- `lib/phases/2026-10-16-intent-hat-agent-chain/IH5_proof_and_wiring.phase`
- `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH1_intent_nodes_point_at_hats-7a8dccf49acfd507.graph`
- `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH2_agents_bound-c734fd5092d03e43.graph`
- `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH3_routers_read_the_chain-7b604cd3c79ab423.graph`
- `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH5_proof_and_wiring-0a8286e69167fdbd.graph`
- `lib/phases/2026-10-16-mobile-compartments/MB5_language_checks.phase`
- `lib/phases/2026-10-16-mobile-compartments/graph/MB5_language_checks-a070742238698d85.graph`
- `lib/phases/2026-10-16-nexus-git-sync/GS5_release_alignment.phase`
- `lib/phases/2026-10-16-nexus-git-sync/graph/GS5_release_alignment-9cea81dfaa362267.graph`
- `lib/phases/2026-10-16-plan-sidebar/PS1_context_recorded.phase`
- `lib/phases/2026-10-16-plan-sidebar/graph/PS1_context_recorded-140511f9d8b21da5.graph`
- `lib/phases/2026-10-16-proposal-evidence/PE1_test_map.phase`
- `lib/phases/2026-10-16-proposal-evidence/PE2_evidence.phase`
- `lib/phases/2026-10-16-proposal-evidence/PE3_wired_and_gated.phase`
- `lib/phases/2026-10-16-proposal-evidence/PE9_infrastructure_failures.phase`
- `lib/phases/2026-10-16-proposal-evidence/graph/PE1_test_map-ae196f649f98e2e7.graph`
- `lib/phases/2026-10-16-proposal-evidence/graph/PE2_evidence-87adde4d74c5c418.graph`
- `lib/phases/2026-10-16-proposal-evidence/graph/PE3_wired_and_gated-c822ef9e98c403c2.graph`
- `lib/phases/2026-10-16-proposal-evidence/graph/PE9_infrastructure_failures-fbe72f5dec0e8cfb.graph`
- `lib/phases/2026-10-16-reject-learn-retry/RL1_classify_the_rejection.phase`
- `lib/phases/2026-10-16-reject-learn-retry/RL3_stop_the_regression_before_it_reaches_him.phase`
- `lib/phases/2026-10-16-reject-learn-retry/graph/RL1_classify_the_rejection-bdf4c489a42b7497.graph`
- `lib/phases/2026-10-16-reject-learn-retry/graph/RL3_stop_the_regression_before_it_reaches_him-3cdd61da21e0b3a9.graph`
- `lib/phases/2026-10-16-repo-carve/CV2_untangle_with_rf0.phase`
- `lib/phases/2026-10-16-repo-carve/FR10_stop_the_ladder.phase`
- `lib/phases/2026-10-16-repo-carve/FR1_one_record_per_change.phase`
- `lib/phases/2026-10-16-repo-carve/FR2_tested_before_it_lands.phase`
- `lib/phases/2026-10-16-repo-carve/FR3_undo_any_change.phase`
- `lib/phases/2026-10-16-repo-carve/FR4_stands_alone.phase`
- `lib/phases/2026-10-16-repo-carve/FR5_the_demo.phase`
- `lib/phases/2026-10-16-repo-carve/FR5_the_demo_note.phase`
- `lib/phases/2026-10-16-repo-carve/FR6_flight_data.phase`
- `lib/phases/2026-10-16-repo-carve/FR7_the_causal_record.phase`
- `lib/phases/2026-10-16-repo-carve/FR8_branches_for_benchmarks.phase`
- `lib/phases/2026-10-16-repo-carve/PB1_the_product_boundary.phase`
- `lib/phases/2026-10-16-repo-carve/graph/CV2_untangle_with_rf0-12a1eb1568c475ca.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR10_stop_the_ladder-fdadb47c70248a9e.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR1_one_record_per_change-969ecbecb227f561.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR2_tested_before_it_lands-53d39bac7d121307.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR3_undo_any_change-c20f74a0da0c1f4c.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR4_stands_alone-7733ba9685bafc07.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR5_the_demo-a03b08442bb825c3.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR5_the_demo_note-332d5e981a6108fb.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR6_flight_data-05ad1f0362cc7289.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR7_the_causal_record-8bee8dc012336255.graph`
- `lib/phases/2026-10-16-repo-carve/graph/FR8_branches_for_benchmarks-802a9c769b0443fa.graph`
- `lib/phases/2026-10-16-repo-carve/graph/PB1_the_product_boundary-cb390adf322a5601.graph`
- `lib/phases/2026-10-17-debugging-product/DP11_the_product_boundary.phase`
- `lib/phases/2026-10-17-debugging-product/DP2_one_gap_door.phase`
- `lib/phases/2026-10-17-debugging-product/GD1_gaps_from_the_graph_for_any_repo.phase`
- `lib/phases/2026-10-17-debugging-product/graph/DP11_the_product_boundary-899986b367f9bf2d.graph`
- `lib/phases/2026-10-17-debugging-product/graph/DP2_one_gap_door-2ff9716abc657ff5.graph`
- `lib/phases/2026-10-17-debugging-product/graph/GD1_gaps_from_the_graph_for_any_repo-0fec63ba9c0f26c8.graph`
- `lib/phases/2026-10-17-failure-mode-report/FMR11_import_into_any_test_env.phase`
- `lib/phases/2026-10-17-failure-mode-report/FMR1_every_ledger_into_rfr2.phase`
- `lib/phases/2026-10-17-failure-mode-report/FMR2_every_failure_reaches_the_record.phase`
- `lib/phases/2026-10-17-failure-mode-report/FMR7_a_fix_proven_by_its_macro.phase`
- `lib/phases/2026-10-17-failure-mode-report/graph/FMR11_import_into_any_test_env-53ed35ed7a5f4718.graph`
- `lib/phases/2026-10-17-failure-mode-report/graph/FMR1_every_ledger_into_rfr2-d672a060fcb71369.graph`
- `lib/phases/2026-10-17-failure-mode-report/graph/FMR2_every_failure_reaches_the_record-7d5ad1479d3e7570.graph`
- `lib/phases/2026-10-17-failure-mode-report/graph/FMR7_a_fix_proven_by_its_macro-6e7c8d81f12d75e7.graph`
- `lib/phases/2026-10-17-infrastructure-migration/IM1_the_shape_census_as_a_command.phase`
- `lib/phases/2026-10-17-infrastructure-migration/IM2_clean_the_redundant.phase`
- `lib/phases/2026-10-17-infrastructure-migration/IM3_wire_what_exists.phase`
- `lib/phases/2026-10-17-infrastructure-migration/IM5_each_system_to_the_template.phase`
- `lib/phases/2026-10-17-infrastructure-migration/IM7_the_ui_on_the_registry.phase`
- `lib/phases/2026-10-17-infrastructure-migration/graph/IM1_the_shape_census_as_a_command-6d5ddff3294636fc.graph`
- `lib/phases/2026-10-17-infrastructure-migration/graph/IM2_clean_the_redundant-072ba52c90e90175.graph`
- `lib/phases/2026-10-17-infrastructure-migration/graph/IM3_wire_what_exists-44f254336361884c.graph`
- `lib/phases/2026-10-17-infrastructure-migration/graph/IM5_each_system_to_the_template-aebf66ab8872db55.graph`
- `lib/phases/2026-10-17-infrastructure-migration/graph/IM7_the_ui_on_the_registry-a6263831c386b825.graph`
- `lib/phases/2026-10-17-pieces-not-order/PC1_the_point_first.phase`
- `lib/phases/2026-10-17-pieces-not-order/PC4_a_procedure_per_kind.phase`
- `lib/phases/2026-10-17-pieces-not-order/graph/PC1_the_point_first-c775e908897ae8af.graph`
- `lib/phases/2026-10-17-pieces-not-order/graph/PC4_a_procedure_per_kind-6ad550aea45b1805.graph`
- `lib/phases/2026-10-17-system-drawbridge/DB0c_reading.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB10_shadow_and_negative_space_at_the_drawbridge.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB11_cos_compartment_per_system.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB12_the_ui_handshake.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB13_the_tunnel.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB14_heartbeat_over_routes.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB16_a_registry_for_each_system.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB17_files_stay_with_their_system.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB18_nodes_in_relation_to_their_system.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB1_the_census_and_the_ratchet.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB3_the_drawbridge.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB6_move_the_crossings.phase`
- `lib/phases/2026-10-17-system-drawbridge/DB9_every_repo_generates_its_registry.phase`
- `lib/phases/2026-10-17-system-drawbridge/P33a_a_registry_for_any_system.phase`
- `lib/phases/2026-10-17-system-drawbridge/P33b_each_system_runs_its_listener.phase`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB0c_reading-4b5a65d5e733f86f.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB10_shadow_and_negative_space_at_the_drawbridge-408f43cb043a2054.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB11_cos_compartment_per_system-9063cc203f88bc1d.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB12_the_ui_handshake-f3192f7dde8331e8.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB13_the_tunnel-1bdf18b3efb9edf1.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB14_heartbeat_over_routes-07e3beb25770350e.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB16_a_registry_for_each_system-1d1f44a2f7482cfa.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB17_files_stay_with_their_system-0a30e279c2724858.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB18_nodes_in_relation_to_their_system-da6e7c02b2315c93.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB1_the_census_and_the_ratchet-6bb5eb9cc6cd21f1.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB3_the_drawbridge-05dd7de14e589723.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB6_move_the_crossings-f3fefc6b9f760ec6.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/DB9_every_repo_generates_its_registry-2390a659741df494.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/P33a_a_registry_for_any_system-973379dc15f50e89.graph`
- `lib/phases/2026-10-17-system-drawbridge/graph/P33b_each_system_runs_its_listener-62329d11d3def412.graph`
- `lib/phases/2026-10-18-compartment-environment/CE3_the_handshake.phase`
- `lib/phases/2026-10-18-compartment-environment/graph/CE3_the_handshake-aa79fe09a96f799d.graph`
- `lib/phases/2026-10-18-debugging-product/DBG1_the_key.phase`
- `lib/phases/2026-10-18-debugging-product/DBG2_the_case.phase`
- `lib/phases/2026-10-18-debugging-product/DBG3_deviation_and_friction_per_run.phase`
- `lib/phases/2026-10-18-debugging-product/DBG4_dependency_gaps.phase`
- `lib/phases/2026-10-18-debugging-product/DBG6_cases_crystallize.phase`
- `lib/phases/2026-10-18-debugging-product/DBG8_in_the_product.phase`
- `lib/phases/2026-10-18-debugging-product/graph/DBG1_the_key-e4c6f44f796d9405.graph`
- `lib/phases/2026-10-18-debugging-product/graph/DBG2_the_case-1fa8c76c4772fdd9.graph`
- `lib/phases/2026-10-18-debugging-product/graph/DBG3_deviation_and_friction_per_run-3cdc3022f02a4874.graph`
- `lib/phases/2026-10-18-debugging-product/graph/DBG4_dependency_gaps-1cbb2701c89b4f58.graph`
- `lib/phases/2026-10-18-debugging-product/graph/DBG6_cases_crystallize-84f9d57bd845faf7.graph`
- `lib/phases/2026-10-18-debugging-product/graph/DBG8_in_the_product-fb23f2c646765085.graph`
- `lib/phases/2026-10-18-debugging-product/graph/_superseded/DBG4_dependency_gaps-958076dca62f887c.graph`
- `lib/phases/2026-10-18-gate-memory/GM5_the_context_ladder.phase`
- `lib/phases/2026-10-18-gate-memory/GM6_crystallized_from_what_was_approved.phase`
- `lib/phases/2026-10-18-gate-memory/graph/GM5_the_context_ladder-d71138f7d24e34f1.graph`
- `lib/phases/2026-10-18-gate-memory/graph/GM6_crystallized_from_what_was_approved-6f4f97b6125f3591.graph`
- `lib/phases/2026-10-18-gating-census/GC0_the_census.phase`
- `lib/phases/2026-10-18-gating-census/GC1_layer_one.phase`
- `lib/phases/2026-10-18-gating-census/L1_primitives_no_decision.phase`
- `lib/phases/2026-10-18-gating-census/L2_one_of_each.phase`
- `lib/phases/2026-10-18-gating-census/graph/GC0_the_census-46d5041e29861a47.graph`
- `lib/phases/2026-10-18-gating-census/graph/GC1_layer_one-c6818f0350f0d936.graph`
- `lib/phases/2026-10-18-gating-census/graph/L1_primitives_no_decision-0a03918617e67a44.graph`
- `lib/phases/2026-10-18-gating-census/graph/L2_one_of_each-15bb418b41b19b2a.graph`
- `lib/phases/2026-10-18-gating-census/graph/_superseded/GC0_the_census-6e90f2f13b83fa5b.graph`
- `lib/phases/2026-10-19-gate-quality-checks/GQ1_quality_stream.phase`
- `lib/phases/2026-10-19-gate-quality-checks/GQ3_brick_tests.phase`
- `lib/phases/2026-10-19-gate-quality-checks/graph/GQ1_quality_stream-78a010f02db9b5e2.graph`
- `lib/phases/2026-10-19-gate-quality-checks/graph/GQ3_brick_tests-7bb3b9e18cbc76b9.graph`
- `lib/phases/2026-10-19-idearium-control/IM2_promote_to_phase.phase`
- `lib/phases/2026-10-19-idearium-control/IM3_ideas_mapped_to_nexus.phase`
- `lib/phases/2026-10-19-idearium-control/IX1_everything_linked.phase`
- `lib/phases/2026-10-19-idearium-control/NM1_one_name_per_file.phase`
- `lib/phases/2026-10-19-idearium-control/VS2_diff_only_backups.phase`
- `lib/phases/2026-10-19-idearium-control/graph/IM2_promote_to_phase-1569487c0a2437d9.graph`
- `lib/phases/2026-10-19-idearium-control/graph/IM3_ideas_mapped_to_nexus-4ab9902894ad0c86.graph`
- `lib/phases/2026-10-19-idearium-control/graph/IX1_everything_linked-9bb44518c22de6ae.graph`
- `lib/phases/2026-10-19-idearium-control/graph/NM1_one_name_per_file-4139029cd3912f57.graph`
- `lib/phases/2026-10-19-idearium-control/graph/VS2_diff_only_backups-536284767e3a671e.graph`
- `lib/phases/2026-10-19-infrastructure-spine/AD1_adapter_contract.phase`
- `lib/phases/2026-10-19-infrastructure-spine/AD2_javascript_adapter.phase`
- `lib/phases/2026-10-19-infrastructure-spine/AD3_python_adapter.phase`
- `lib/phases/2026-10-19-infrastructure-spine/AD4_documents_adapter.phase`
- `lib/phases/2026-10-19-infrastructure-spine/FP1_feature_pilot.phase`
- `lib/phases/2026-10-19-infrastructure-spine/IN0_baseline.phase`
- `lib/phases/2026-10-19-infrastructure-spine/IN1_old_files_out.phase`
- `lib/phases/2026-10-19-infrastructure-spine/IN2_quotes_ledger.phase`
- `lib/phases/2026-10-19-infrastructure-spine/IN3_registry_is_the_spine.phase`
- `lib/phases/2026-10-19-infrastructure-spine/IN6_systems_onto_the_spine.phase`
- `lib/phases/2026-10-19-infrastructure-spine/IN7_every_phase_and_spec_on_the_spine.phase`
- `lib/phases/2026-10-19-infrastructure-spine/NC1_neutral_core_boundary.phase`
- `lib/phases/2026-10-19-infrastructure-spine/NT1_neutrality_test.phase`
- `lib/phases/2026-10-19-infrastructure-spine/PN1_phases_to_nodes.phase`
- `lib/phases/2026-10-19-infrastructure-spine/PN2_dual_read.phase`
- `lib/phases/2026-10-19-infrastructure-spine/PN3_maps_rendered_from_nodes.phase`
- `lib/phases/2026-10-19-infrastructure-spine/PRC1_phase_reality_check.phase`
- `lib/phases/2026-10-19-infrastructure-spine/SC1_scaling_limits_named.phase`
- `lib/phases/2026-10-19-infrastructure-spine/ST1_schema_for_everything_reusable.phase`
- `lib/phases/2026-10-19-infrastructure-spine/VC1_a_change_entry_for_every_event.phase`
- `lib/phases/2026-10-19-infrastructure-spine/VC2_changelogs_rendered.phase`
- `lib/phases/2026-10-19-infrastructure-spine/graph/AD1_adapter_contract-e91a444c6f2283f5.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/AD2_javascript_adapter-1421bce99f6b0fd1.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/AD3_python_adapter-ddae82510208277e.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/AD4_documents_adapter-71fc91214f3f74f8.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/FP1_feature_pilot-6f5778d20d6e74db.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/IN0_baseline-970f2ba12e563137.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/IN1_old_files_out-84d149d952b4e723.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/IN2_quotes_ledger-746264db652fe47c.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/IN3_registry_is_the_spine-e420e3cd3dcadc6d.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/IN6_systems_onto_the_spine-cdcb05f20732c595.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/IN7_every_phase_and_spec_on_the_spine-ac080692893504b1.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/NC1_neutral_core_boundary-5ed2fce6c3979dcb.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/NT1_neutrality_test-a331400b0767c9a0.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/PN1_phases_to_nodes-d373bee50a742ff2.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/PN2_dual_read-29e3557d98277a3d.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/PN3_maps_rendered_from_nodes-e5c77a3e8f639f3f.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/PRC1_phase_reality_check-681b3b0a01191eac.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/SC1_scaling_limits_named-74bbc16498f13eed.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/ST1_schema_for_everything_reusable-7d79572c6ac4587e.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/VC1_a_change_entry_for_every_event-2d6d84c716d3eda0.graph`
- `lib/phases/2026-10-19-infrastructure-spine/graph/VC2_changelogs_rendered-991430c3f767143b.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/CB1_coder_brief.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/CB2_gemini_first.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/ID1_ideas_wired_through.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/MEM1_cortex_keeps_the_books.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/RC1_watchers_never_kill_a_kernel.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/RC2_linear_node_scan.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/RC3_windows_safe_node_names.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/RC4_agent_file_names_guarded.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/SM1_agent_self_model.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/SS1_system_store_adoption.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/SS3_nodes_are_the_data.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/UI1_toolbox_and_store_explorer.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/UI3_ideas_and_notes_as_one.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/VF1_verify_first.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/VF2_one_response_bundle.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/VF3_mutation_check.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/VF4_second_opinion_on_need.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/VF5_verdict_cache.phase`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/CB1_coder_brief-1d43c7e9fcfca2cd.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/CB2_gemini_first-8a828fa8e92f645c.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/ID1_ideas_wired_through-d74f2fa08863805e.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/MEM1_cortex_keeps_the_books-5dc59a5287acfba0.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/RC1_watchers_never_kill_a_kernel-5363c8138bf6ff4a.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/RC2_linear_node_scan-4cebbf35ed841d10.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/RC3_windows_safe_node_names-1a150de507d7f945.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/RC4_agent_file_names_guarded-f7f24c9b4b5b26d9.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/SM1_agent_self_model-33989c7ddb1cbad4.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/SS1_system_store_adoption-d78715b3b21e685b.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/SS3_nodes_are_the_data-42d3b5c93b4e3d49.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/UI1_toolbox_and_store_explorer-18a4d19d0f927715.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/UI3_ideas_and_notes_as_one-a5b53b729416888e.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/VF1_verify_first-f356503ab603ddbc.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/VF2_one_response_bundle-48017c6b7737540e.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/VF3_mutation_check-a28ce7f9bc7982e8.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/VF4_second_opinion_on_need-9c8416f249e1db5c.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/VF5_verdict_cache-3f619ac10014ebb3.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/ID1_ideas_wired_through-b12b2d82d3da6242.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/MEM1_cortex_keeps_the_books-945fb1de062e2087.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC1_watchers_never_kill_a_kernel-5dd01d2da36edeb7.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC2_linear_node_scan-77759fcaf402a194.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC3_windows_safe_node_names-26a266c4495e09d0.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC3_windows_safe_node_names-abac5983cc545d58.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC4_agent_file_names_guarded-771ccf0a4d65cb41.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/SS1_system_store_adoption-ad8ef05a560160bc.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/SS1_system_store_adoption-f5e49c04fe5a9255.graph`
- `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/VF1_verify_first-58454d1b9f24ee04.graph`
- `lib/phases/2026-10-19-solid-build-foundation/AB1_autobuild_loop_and_resume.phase`
- `lib/phases/2026-10-19-solid-build-foundation/AB2_hat_aware_ladder.phase`
- `lib/phases/2026-10-19-solid-build-foundation/CR1_project_registry_spine.phase`
- `lib/phases/2026-10-19-solid-build-foundation/GQ1_quality_stream.phase`
- `lib/phases/2026-10-19-solid-build-foundation/GQ3_brick_tests.phase`
- `lib/phases/2026-10-19-solid-build-foundation/MF1_model_fit_routing.phase`
- `lib/phases/2026-10-19-solid-build-foundation/graph/AB1_autobuild_loop_and_resume-3d44db3a3fb6e381.graph`
- `lib/phases/2026-10-19-solid-build-foundation/graph/AB2_hat_aware_ladder-ad9fe7f865a988d6.graph`
- `lib/phases/2026-10-19-solid-build-foundation/graph/CR1_project_registry_spine-ad00a0602536365c.graph`
- `lib/phases/2026-10-19-solid-build-foundation/graph/GQ1_quality_stream-85b1ad483b041f8f.graph`
- `lib/phases/2026-10-19-solid-build-foundation/graph/GQ3_brick_tests-3769b79e631ed6e6.graph`
- `lib/phases/2026-10-19-solid-build-foundation/graph/MF1_model_fit_routing-933ae7ea59a963fb.graph`
- `lib/phases/2026-10-19-upload-intent-and-page-map/PM6_nerve_feel.phase`
- `lib/phases/2026-10-19-upload-intent-and-page-map/UP1_placement_tool.phase`
- `lib/phases/2026-10-19-upload-intent-and-page-map/UP2_learned_placements.phase`
- `lib/phases/2026-10-19-upload-intent-and-page-map/UP5_registry_wires_on_apply.phase`
- `lib/phases/2026-10-19-upload-intent-and-page-map/UP6_model_for_the_unplaced.phase`
- `lib/phases/2026-10-19-upload-intent-and-page-map/graph/PM6_nerve_feel-539b63300c679ad5.graph`
- `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP1_placement_tool-166fb192867b3804.graph`
- `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP2_learned_placements-ce0e81c67e6b36ce.graph`
- `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP5_registry_wires_on_apply-ebe8af443a1f3079.graph`
- `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP6_model_for_the_unplaced-76cb86273b1fc6d5.graph`
- `lib/phases/2026-10-20-belief-loop/AV1_adversarial_review.phase`
- `lib/phases/2026-10-20-belief-loop/BW1_borrowing.phase`
- `lib/phases/2026-10-20-belief-loop/CF1_confidence_from_evidence.phase`
- `lib/phases/2026-10-20-belief-loop/CY0_one_crystal_schema.phase`
- `lib/phases/2026-10-20-belief-loop/CY2_invariants_are_crystals.phase`
- `lib/phases/2026-10-20-belief-loop/EW1_evidence_record_and_weights.phase`
- `lib/phases/2026-10-20-belief-loop/IV0_belief_census.phase`
- `lib/phases/2026-10-20-belief-loop/IV1_invariant_kinds.phase`
- `lib/phases/2026-10-20-belief-loop/IV2_invariant_miner.phase`
- `lib/phases/2026-10-20-belief-loop/PV1_provenance_on_every_claim.phase`
- `lib/phases/2026-10-20-belief-loop/RA1_root_cause_through_provenance.phase`
- `lib/phases/2026-10-20-belief-loop/RA2_learned_source_trust.phase`
- `lib/phases/2026-10-20-belief-loop/XD1_cross_domain_verification.phase`
- `lib/phases/2026-10-20-belief-loop/graph/AV1_adversarial_review-4309464edd8b01e4.graph`
- `lib/phases/2026-10-20-belief-loop/graph/BW1_borrowing-d84c6b468dc3ade5.graph`
- `lib/phases/2026-10-20-belief-loop/graph/CF1_confidence_from_evidence-1d831af2c4ee481e.graph`
- `lib/phases/2026-10-20-belief-loop/graph/CY0_one_crystal_schema-6952ccb2f43c4c04.graph`
- `lib/phases/2026-10-20-belief-loop/graph/CY2_invariants_are_crystals-62464b4cfa1cd75a.graph`
- `lib/phases/2026-10-20-belief-loop/graph/EW1_evidence_record_and_weights-a4ae8dbe0712bb23.graph`
- `lib/phases/2026-10-20-belief-loop/graph/IV0_belief_census-fd2dad21f04787eb.graph`
- `lib/phases/2026-10-20-belief-loop/graph/IV1_invariant_kinds-99ee52c0b443d589.graph`
- `lib/phases/2026-10-20-belief-loop/graph/IV2_invariant_miner-e5b3488a69c7b78e.graph`
- `lib/phases/2026-10-20-belief-loop/graph/PV1_provenance_on_every_claim-67737d326ae34da8.graph`
- `lib/phases/2026-10-20-belief-loop/graph/RA1_root_cause_through_provenance-6ad2a67f26a85c69.graph`
- `lib/phases/2026-10-20-belief-loop/graph/RA2_learned_source_trust-96f3facc75253f80.graph`
- `lib/phases/2026-10-20-belief-loop/graph/XD1_cross_domain_verification-b5b39aa978305a84.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/CH0_chunk_census_and_contract.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/CH1_strategies_behind_the_contract.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/CH2_chunk_laws.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/DK2_learned_granularity.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GR0_graph_census.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GR1_graph_primitive.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GR2_graph_views.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GW0_gate_census.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GW1_gate_primitive.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GW2_gates_at_every_level.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/PS1_phase_specs.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/TV1_traversal_primitive.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/TV2_invariant_guided_traversal.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/TV3_traversal_as_context.phase`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/CH0_chunk_census_and_contract-181bf3005c9def9a.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/CH1_strategies_behind_the_contract-a5858d41e5ad4b6b.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/CH2_chunk_laws-e5eb2024e856cead.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/DK2_learned_granularity-38954b694b124080.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GR0_graph_census-dae50028dcfb9bca.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GR1_graph_primitive-8e94a4d6d6d8e5b6.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GR2_graph_views-371086c0f14c49a2.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GW0_gate_census-0475656455782995.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GW1_gate_primitive-0fa8b100c09c9d93.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GW2_gates_at_every_level-612136b666d5ea1e.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/PS1_phase_specs-77e8fe5e41ea6ccc.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/TV1_traversal_primitive-addbf1f1b5a09bfa.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/TV2_invariant_guided_traversal-e197883cad031a55.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/TV3_traversal_as_context-8a5009bb03465d08.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GW2_gates_at_every_level-b10b437f7e757cde.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/PS1_phase_specs-3ff2290d219d6c7c.graph`
- `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/PS1_phase_specs-77e8fe5e41ea6ccc.graph`
- `lib/phases/2026-10-21-approval-chain/APV1_change_entry.phase`
- `lib/phases/2026-10-21-approval-chain/APV2_commit_carries_it.phase`
- `lib/phases/2026-10-21-approval-chain/graph/APV1_change_entry-84ec3e73d291c157.graph`
- `lib/phases/2026-10-21-approval-chain/graph/APV2_commit_carries_it-ddcc8eb6b64febdc.graph`
- `lib/phases/2026-10-21-approval-chain/graph/_superseded/APV1_change_entry-ac405a9ed94958e7.graph`
- `lib/phases/2026-10-21-approval-chain/graph/_superseded/APV2_commit_carries_it-49cfd8f7769f1070.graph`
- `lib/phases/2026-10-21-brainos-into-idearium/BX1_census.phase`
- `lib/phases/2026-10-21-brainos-into-idearium/BX9_retire.phase`
- `lib/phases/2026-10-21-brainos-into-idearium/CNS1_phase_census.phase`
- `lib/phases/2026-10-21-brainos-into-idearium/graph/BX1_census-94187d8db6335e81.graph`
- `lib/phases/2026-10-21-brainos-into-idearium/graph/BX9_retire-0c410c080c84da17.graph`
- `lib/phases/2026-10-21-brainos-into-idearium/graph/CNS1_phase_census-ac4aa4a9dde1d8b0.graph`
- `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX9_retire-2bc31a1a8b772044.graph`
- `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/CNS1_phase_census-ee838c5e542aa524.graph`
- `lib/phases/2026-10-21-data-layout/DL0_data_census.phase`
- `lib/phases/2026-10-21-data-layout/DL1_clearup_tool.phase`
- `lib/phases/2026-10-21-data-layout/DL2_one_resolver.phase`
- `lib/phases/2026-10-21-data-layout/DL3_rewire_writers.phase`
- `lib/phases/2026-10-21-data-layout/DL5_memory_in_cortex.phase`
- `lib/phases/2026-10-21-data-layout/graph/DL0_data_census-f0135ef7c3aeb4f1.graph`
- `lib/phases/2026-10-21-data-layout/graph/DL1_clearup_tool-e0d483cc4889bc70.graph`
- `lib/phases/2026-10-21-data-layout/graph/DL2_one_resolver-c98c0dd03a13e5a3.graph`
- `lib/phases/2026-10-21-data-layout/graph/DL3_rewire_writers-7dbe9cbe6436f155.graph`
- `lib/phases/2026-10-21-data-layout/graph/DL5_memory_in_cortex-59082cf7b07d2717.graph`
- `lib/phases/2026-10-21-data-layout/graph/_superseded/DL0_data_census-64f85579f51044f8.graph`
- `lib/phases/2026-10-21-data-layout/graph/_superseded/DL1_clearup_tool-372de2334482d8f2.graph`
- `lib/phases/2026-10-21-data-layout/graph/_superseded/DL2_one_resolver-db5711605437e8fc.graph`
- `lib/phases/2026-10-21-data-layout/graph/_superseded/DL3_rewire_writers-370d1616ff8d75f4.graph`
- `lib/phases/2026-10-22-system-node-db/ND1_every_system_has_its_database.phase`
- `lib/phases/2026-10-22-system-node-db/ND2_one_node_route_for_every_system.phase`
- `lib/phases/2026-10-22-system-node-db/ND3_each_server_serves_its_nodes.phase`
- `lib/phases/2026-10-22-system-node-db/ND4_commands_and_capabilities_from_the_schemas.phase`
- `lib/phases/2026-10-22-system-node-db/graph/ND1_every_system_has_its_database-d31a6f77d650fe55.graph`
- `lib/phases/2026-10-22-system-node-db/graph/ND2_one_node_route_for_every_system-15ec1ac071c27e69.graph`
- `lib/phases/2026-10-22-system-node-db/graph/ND3_each_server_serves_its_nodes-e4e6017c5d941f7b.graph`
- `lib/phases/2026-10-22-system-node-db/graph/ND4_commands_and_capabilities_from_the_schemas-ae691a15e3aa12bb.graph`
- `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND1_every_system_has_its_database-87dd2ec53f3067a4.graph`
- `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND3_each_server_serves_its_nodes-ea22d024a9a37bb4.graph`
- `lib/phases/2026-10-23-cos-spine/CS10_hats_bound_to_the_compartment.phase`
- `lib/phases/2026-10-23-cos-spine/graph/CS10_hats_bound_to_the_compartment-9593a2c519f5f235.graph`
- `lib/phases/2026-10-23-self-building-loop/SL2_done_by_evidence.phase`
- `lib/phases/2026-10-23-self-building-loop/SL3_the_backlog_groomed.phase`
- `lib/phases/2026-10-23-self-building-loop/SL5_when_a_proven_change_lands_alone.phase`
- `lib/phases/2026-10-23-self-building-loop/SL6_the_loop_counts_itself.phase`
- `lib/phases/2026-10-23-self-building-loop/SL9_every_phase_a_node.phase`
- `lib/phases/2026-10-23-self-building-loop/graph/SL2_done_by_evidence-7bb9c1e91cb43b0f.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/SL3_the_backlog_groomed-d984c6d6901fa316.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/SL5_when_a_proven_change_lands_alone-379b566ca6597dd5.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/SL6_the_loop_counts_itself-596269867e9d3b8f.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/SL9_every_phase_a_node-607e664a07b3c690.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL2_done_by_evidence-07f020fcde0980ec.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL2_done_by_evidence-a5f720db904d7f54.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL2_done_by_evidence-f4cbd242e47d17fc.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL3_the_backlog_groomed-596ba88d3bb5ab0a.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL3_the_backlog_groomed-9fd399bb539845a2.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL5_when_a_proven_change_lands_alone-4cb047583c75887c.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL6_the_loop_counts_itself-fb8338f83e0b2ad5.graph`
- `lib/phases/2026-10-23-self-building-loop/graph/_superseded/SL9_every_phase_a_node-cf5ae14f76bef8fc.graph`
- `lib/phases/INDEX.md`
- `lib/phases/agent-intelligence-loop/AP1_pull_toolbox.phase`
- `lib/phases/agent-intelligence-loop/AP5_autonomous_build_loop.phase`
- `lib/phases/agent-intelligence-loop/graph/AP1_pull_toolbox-0c00d607ee3cf034.graph`
- `lib/phases/agent-intelligence-loop/graph/AP5_autonomous_build_loop-fee76168c1767280.graph`
- `lib/phases/agent-model-and-user-continuity/AM10_thinking_partner_rename_and_ui_builder.phase`
- `lib/phases/agent-model-and-user-continuity/AM1_per_agent_learned_model.phase`
- `lib/phases/agent-model-and-user-continuity/AM2_incident_debrief.phase`
- `lib/phases/agent-model-and-user-continuity/AM3_open_ended_grounded_conversation.phase`
- `lib/phases/agent-model-and-user-continuity/AM5_ambiguity_triggered_pull.phase`
- `lib/phases/agent-model-and-user-continuity/AM6_perplexity_confidence_loop.phase`
- `lib/phases/agent-model-and-user-continuity/AM7_agent_switch_continuity_and_chat_recall.phase`
- `lib/phases/agent-model-and-user-continuity/AM8_lifeline_as_general_channel_and_reasoning_upgrade.phase`
- `lib/phases/agent-model-and-user-continuity/AM9_get_to_know_you_and_idea_capture.phase`
- `lib/phases/agent-model-and-user-continuity/graph/AM10_thinking_partner_rename_and_ui_builder-c0328146fae33b3e.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM1_per_agent_learned_model-9f79131e9be93d52.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM2_incident_debrief-04a4544016b9bb00.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM3_open_ended_grounded_conversation-487ff1e8c712e962.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM5_ambiguity_triggered_pull-ca63b016e003ffb7.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM6_perplexity_confidence_loop-200f6a2a6a5cf5dd.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM7_agent_switch_continuity_and_chat_recall-e7c6fbbbe5175699.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM8_lifeline_as_general_channel_and_reasoning_upgrade-6413a4c688ff13df.graph`
- `lib/phases/agent-model-and-user-continuity/graph/AM9_get_to_know_you_and_idea_capture-32fca166c640cfd4.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX10_component_registry_discipline.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX11_plugin_architecture_decision.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX14_plugin_system_v1_build.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX1_clearglass_agent_suite_composition.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX2_sequential_event_queue.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX4_provider_tab_tool_loop.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX7_cfr_diagnostic_for_loom.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/TX9_build_contract_file_dir.phase`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX10_component_registry_discipline-95d1f8ac41b8d673.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX11_plugin_architecture_decision-6659d1b03d369470.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX14_plugin_system_v1_build-1a4936ab08174f55.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX1_clearglass_agent_suite_composition-19b14f384dffbacc.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX2_sequential_event_queue-b723e425972e1faa.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX4_provider_tab_tool_loop-9fb61cd3bda009bc.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX7_cfr_diagnostic_for_loom-c1a82bad016c63ef.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX9_build_contract_file_dir-a144b4f9e9ba9be2.graph`
- `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/_superseded/TX9_build_contract_file_dir-11f20eb5730c0d6f.graph`
- `lib/phases/copilot-autonomous/CA1_scheduler.phase`
- `lib/phases/copilot-autonomous/CA3_pipeline_chains.phase`
- `lib/phases/copilot-autonomous/CA4_connections.phase`
- `lib/phases/copilot-autonomous/CA5_system_control_and_clearglass.phase`
- `lib/phases/copilot-autonomous/CA6_self_building_commands.phase`
- `lib/phases/copilot-autonomous/CA7_constant_autonomy.phase`
- `lib/phases/copilot-autonomous/graph/CA1_scheduler-f646093248081abd.graph`
- `lib/phases/copilot-autonomous/graph/CA3_pipeline_chains-c33bc76e820f40fa.graph`
- `lib/phases/copilot-autonomous/graph/CA4_connections-fd002fc2bc10c045.graph`
- `lib/phases/copilot-autonomous/graph/CA5_system_control_and_clearglass-292f947e788fddeb.graph`
- `lib/phases/copilot-autonomous/graph/CA6_self_building_commands-4fc1ad9fd3f90dd6.graph`
- `lib/phases/copilot-autonomous/graph/CA7_constant_autonomy-bcaaa823adb0c656.graph`
- `lib/phases/copilot-awareness-routing/CA2_tool_self_awareness.phase`
- `lib/phases/copilot-awareness-routing/CA6_routing_config.phase`
- `lib/phases/copilot-awareness-routing/graph/CA2_tool_self_awareness-27716cb40c8eca89.graph`
- `lib/phases/copilot-awareness-routing/graph/CA6_routing_config-c8ec964b0b80f7cb.graph`
- `lib/phases/copilot-full-capability/P7_continuous_nerve_dom_to_ollama.phase`
- `lib/phases/copilot-full-capability/graph/P7_continuous_nerve_dom_to_ollama-40f6a3bac3b56676.graph`
- `lib/phases/copilot-guardian-cos-expansion/GA1_guardian_nexus_reconciliation.phase`
- `lib/phases/copilot-guardian-cos-expansion/GA2_diagnostic_system_depth.phase`
- `lib/phases/copilot-guardian-cos-expansion/GA3_guardian_userscript_capability_wiring.phase`
- `lib/phases/copilot-guardian-cos-expansion/GA6_spec_builder_depth.phase`
- `lib/phases/copilot-guardian-cos-expansion/GA8_sse_announcements.phase`
- `lib/phases/copilot-guardian-cos-expansion/graph/GA1_guardian_nexus_reconciliation-7d4f25c26f8d558f.graph`
- `lib/phases/copilot-guardian-cos-expansion/graph/GA2_diagnostic_system_depth-9e9318bacd6bb0d1.graph`
- `lib/phases/copilot-guardian-cos-expansion/graph/GA3_guardian_userscript_capability_wiring-378f86881837b81c.graph`
- `lib/phases/copilot-guardian-cos-expansion/graph/GA6_spec_builder_depth-d8dcc592e1ac180c.graph`
- `lib/phases/copilot-guardian-cos-expansion/graph/GA8_sse_announcements-2285f347862e5b5c.graph`
- `lib/phases/copilot-omniscience/P2_persistence_threaded.phase`
- `lib/phases/copilot-omniscience/P4_gate_never_actually_verified.phase`
- `lib/phases/copilot-omniscience/P6_every_system_reachable.phase`
- `lib/phases/copilot-omniscience/graph/P2_persistence_threaded-0abc56b443205734.graph`
- `lib/phases/copilot-omniscience/graph/P4_gate_never_actually_verified-c081947773f7a8cc.graph`
- `lib/phases/copilot-omniscience/graph/P6_every_system_reachable-7d719f5d40d918b1.graph`
- `lib/phases/cortex-schema-registry/P1_schema_table_in_cortex.phase`
- `lib/phases/cortex-schema-registry/P2_conformance_check_lib.phase`
- `lib/phases/cortex-schema-registry/P5_expectation_for_consumers.phase`
- `lib/phases/cortex-schema-registry/UM1_schema_for_user_model.phase`
- `lib/phases/cortex-schema-registry/graph/P1_schema_table_in_cortex-8a7709b7b3706ea7.graph`
- `lib/phases/cortex-schema-registry/graph/P2_conformance_check_lib-9d3e03fe9b7e2d00.graph`
- `lib/phases/cortex-schema-registry/graph/P5_expectation_for_consumers-eda9550483f4ed1c.graph`
- `lib/phases/cortex-schema-registry/graph/UM1_schema_for_user_model-d62896550a607452.graph`
- `lib/phases/gemini-multiagent-coding/P1_per_agent_contracts.phase`
- `lib/phases/gemini-multiagent-coding/P2_tree_parse_recall_injection.phase`
- `lib/phases/gemini-multiagent-coding/P4_structured_agent_to_agent.phase`
- `lib/phases/gemini-multiagent-coding/P5_autonomous_multiagent_loop.phase`
- `lib/phases/gemini-multiagent-coding/graph/P1_per_agent_contracts-0f2fd9ee83912663.graph`
- `lib/phases/gemini-multiagent-coding/graph/P2_tree_parse_recall_injection-31411292304becfe.graph`
- `lib/phases/gemini-multiagent-coding/graph/P4_structured_agent_to_agent-8f27af99fec90581.graph`
- `lib/phases/gemini-multiagent-coding/graph/P5_autonomous_multiagent_loop-7a74916704cceb5b.graph`
- `lib/phases/idearium-repository-overhaul/MCO-A_schemas.phase`
- `lib/phases/idearium-repository-overhaul/MCO-E_roadmap_ui.phase`
- `lib/phases/idearium-repository-overhaul/MCO-G_git_cicd_credentials.phase`
- `lib/phases/idearium-repository-overhaul/MCO4_hooks_wires_flows_tools.phase`
- `lib/phases/idearium-repository-overhaul/MCO6_compartment_ownership.phase`
- `lib/phases/idearium-repository-overhaul/graph/MCO-A_schemas-912297af517ed265.graph`
- `lib/phases/idearium-repository-overhaul/graph/MCO-E_roadmap_ui-b86c0d6b1a69cd1d.graph`
- `lib/phases/idearium-repository-overhaul/graph/MCO-G_git_cicd_credentials-209210182fab359f.graph`
- `lib/phases/idearium-repository-overhaul/graph/MCO4_hooks_wires_flows_tools-1792b3e7c6ba3523.graph`
- `lib/phases/idearium-repository-overhaul/graph/MCO6_compartment_ownership-ccbefa5d407a1b18.graph`
- `lib/phases/idearium-repository-overhaul/graph/_superseded/MCO-E_roadmap_ui-05dd511a8ef21910.graph`
- `lib/phases/nexus-architecture-rebuild/P10_safe_apply_verify_before_merge.phase`
- `lib/phases/nexus-architecture-rebuild/P11_agent_council.phase`
- `lib/phases/nexus-architecture-rebuild/P12_fault_logging_first_class.phase`
- `lib/phases/nexus-architecture-rebuild/P13_roundtable_shared_council_chat.phase`
- `lib/phases/nexus-architecture-rebuild/P14_emergence_axioms_endstate.phase`
- `lib/phases/nexus-architecture-rebuild/P20_intelligence_reads_present_not_oldest.phase`
- `lib/phases/nexus-architecture-rebuild/P2_autopilot_spawn_crash.phase`
- `lib/phases/nexus-architecture-rebuild/P8_hat_forge_command.phase`
- `lib/phases/nexus-architecture-rebuild/P9_multi_agent_parallel_dispatch.phase`
- `lib/phases/nexus-architecture-rebuild/graph/P10_safe_apply_verify_before_merge-321a65ed784d8a03.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P11_agent_council-2c8598728dc1ff30.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P12_fault_logging_first_class-45cc2cf048e77d57.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P13_roundtable_shared_council_chat-bbfce2d577125626.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P14_emergence_axioms_endstate-7c968ba80520bc34.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P20_intelligence_reads_present_not_oldest-a58469a80f09bd67.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P2_autopilot_spawn_crash-7b3595f0354c6063.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P8_hat_forge_command-dfd13349bbd7e4e9.graph`
- `lib/phases/nexus-architecture-rebuild/graph/P9_multi_agent_parallel_dispatch-8ad7c5128e9ee3f3.graph`
- `lib/phases/nexus-live-mind/P3_diagnostic_kernel.phase`
- `lib/phases/nexus-live-mind/P6_copilot_programmable.phase`
- `lib/phases/nexus-live-mind/graph/P3_diagnostic_kernel-75ac0a6dcf420224.graph`
- `lib/phases/nexus-live-mind/graph/P6_copilot_programmable-52e733c13ed35b06.graph`
- `lib/phases/nexus-observability-tablet/OB11_edge_case_mapping.phase`
- `lib/phases/nexus-observability-tablet/OB3_movement_map.phase`
- `lib/phases/nexus-observability-tablet/OB5_tablet_modules.phase`
- `lib/phases/nexus-observability-tablet/graph/OB11_edge_case_mapping-be0ff5bccc30824b.graph`
- `lib/phases/nexus-observability-tablet/graph/OB3_movement_map-1750f2d80be7b16d.graph`
- `lib/phases/nexus-observability-tablet/graph/OB5_tablet_modules-63020901121548d5.graph`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/AG1_agent_nodes_sorted_by_provider.phase`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/GC1_global_component_reuse_store.phase`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/RD1_multi_file_response_parser.phase`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/RD2_response_to_multiple_artifact_types.phase`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/AG1_agent_nodes_sorted_by_provider-244704b3a3825cc8.graph`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/GC1_global_component_reuse_store-7caeeeea63576bfe.graph`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/RD1_multi_file_response_parser-747cf5517c059840.graph`
- `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/RD2_response_to_multiple_artifact_types-b35f25d3c582de18.graph`
- `lib/phases/nexus-repository-system-build/MCO3_snapshot_compliance.phase`
- `lib/phases/nexus-repository-system-build/MCO4_hooks_wires_flows_tools.phase`
- `lib/phases/nexus-repository-system-build/MCO7_nexus_systems_as_repo_compartments.phase`
- `lib/phases/nexus-repository-system-build/graph/MCO3_snapshot_compliance-00fc7f80a15780aa.graph`
- `lib/phases/nexus-repository-system-build/graph/MCO4_hooks_wires_flows_tools-acba9c545837ded9.graph`
- `lib/phases/nexus-repository-system-build/graph/MCO7_nexus_systems_as_repo_compartments-b9b0a420afcc0424.graph`
- `lib/phases/nexus-self-build-pipeline/SB2_universal_file_parse.phase`
- `lib/phases/nexus-self-build-pipeline/SB3_guided_build_loop.phase`
- `lib/phases/nexus-self-build-pipeline/SB4_decision_lattice_wiring.phase`
- `lib/phases/nexus-self-build-pipeline/SB5_self_modification_from_inside.phase`
- `lib/phases/nexus-self-build-pipeline/SB6_contract_type_schemas_and_toolbox_directory.phase`
- `lib/phases/nexus-self-build-pipeline/SB7_compartments_as_sessions.phase`
- `lib/phases/nexus-self-build-pipeline/SB8_tool_agnosticism_and_new_tool_flow.phase`
- `lib/phases/nexus-self-build-pipeline/graph/SB2_universal_file_parse-2f06c0672e301ca7.graph`
- `lib/phases/nexus-self-build-pipeline/graph/SB3_guided_build_loop-43e53ddad29a7b4a.graph`
- `lib/phases/nexus-self-build-pipeline/graph/SB4_decision_lattice_wiring-8250b009e094ad56.graph`
- `lib/phases/nexus-self-build-pipeline/graph/SB5_self_modification_from_inside-cdb424f27e387b64.graph`
- `lib/phases/nexus-self-build-pipeline/graph/SB6_contract_type_schemas_and_toolbox_directory-c5ebdf092da9729b.graph`
- `lib/phases/nexus-self-build-pipeline/graph/SB7_compartments_as_sessions-61dd4a0cac5599fd.graph`
- `lib/phases/nexus-self-build-pipeline/graph/SB8_tool_agnosticism_and_new_tool_flow-0dad83e5c39c6d0a.graph`
- `lib/phases/nexus-system-standardization/SS2_config_per_system.phase`
- `lib/phases/nexus-system-standardization/SS3_event_driven_handshake_contracts.phase`
- `lib/phases/nexus-system-standardization/SS5_diagnostics_reads_and_fixes.phase`
- `lib/phases/nexus-system-standardization/graph/SS2_config_per_system-21362d473f86d2b4.graph`
- `lib/phases/nexus-system-standardization/graph/SS3_event_driven_handshake_contracts-7fca6f4123a25be4.graph`
- `lib/phases/nexus-system-standardization/graph/SS5_diagnostics_reads_and_fixes-bbc697df4c8f8e23.graph`
- `lib/phases/raid-routing-fidelity/RR2_contract_based_chunking.phase`
- `lib/phases/raid-routing-fidelity/RR3_per_agent_config_in_cortex.phase`
- `lib/phases/raid-routing-fidelity/RR4_governed_handshake_on_handoff.phase`
- `lib/phases/raid-routing-fidelity/RR5_clearglass_accounts_and_features.phase`
- `lib/phases/raid-routing-fidelity/RR7_per_system_dashboards_in_tablet.phase`
- `lib/phases/raid-routing-fidelity/graph/RR2_contract_based_chunking-9f2225141606bc1a.graph`
- `lib/phases/raid-routing-fidelity/graph/RR3_per_agent_config_in_cortex-efff7260225f5d9a.graph`
- `lib/phases/raid-routing-fidelity/graph/RR4_governed_handshake_on_handoff-b031ed28511d3eae.graph`
- `lib/phases/raid-routing-fidelity/graph/RR5_clearglass_accounts_and_features-022fe3f3a22c597f.graph`
- `lib/phases/raid-routing-fidelity/graph/RR7_per_system_dashboards_in_tablet-a97e4c0989831da2.graph`
- `lib/phases/raid-verification-spine/P1_raid_records_every_tool_decision.phase`
- `lib/phases/raid-verification-spine/P3_isolate_and_verify_via_cos.phase`
- `lib/phases/raid-verification-spine/P6_rewind_on_fail.phase`
- `lib/phases/raid-verification-spine/graph/P1_raid_records_every_tool_decision-b2e3b501e67e23a4.graph`
- `lib/phases/raid-verification-spine/graph/P3_isolate_and_verify_via_cos-0019c3a16a9a4f4d.graph`
- `lib/phases/raid-verification-spine/graph/P6_rewind_on_fail-b0baf09b7e7c036f.graph`
- `lib/phases/raid-warp-verification/P6_rewind_on_fail.phase`
- `lib/phases/raid-warp-verification/graph/P6_rewind_on_fail-889c72ca60734872.graph`
- `lib/phases/repair-contract-and-loom-hub/R10_relational_context_and_reuse.phase`
- `lib/phases/repair-contract-and-loom-hub/R1_repair_contract_schema.phase`
- `lib/phases/repair-contract-and-loom-hub/R2_real_snapshot_rollback.phase`
- `lib/phases/repair-contract-and-loom-hub/R3_autonomous_repair_trigger.phase`
- `lib/phases/repair-contract-and-loom-hub/R4_loom_ledger_awareness.phase`
- `lib/phases/repair-contract-and-loom-hub/R5_loom_visual_map.phase`
- `lib/phases/repair-contract-and-loom-hub/R6_living_documentation.phase`
- `lib/phases/repair-contract-and-loom-hub/R7_fault_taxonomy_reconnection.phase`
- `lib/phases/repair-contract-and-loom-hub/R8_ui_diagnostic_surfaces_wired_together.phase`
- `lib/phases/repair-contract-and-loom-hub/R9_ui_design_philosophy.phase`
- `lib/phases/repair-contract-and-loom-hub/graph/R10_relational_context_and_reuse-0e23e7835362642d.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R1_repair_contract_schema-3dd078c3c6681b99.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R2_real_snapshot_rollback-b4af0c3b6772dee3.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R3_autonomous_repair_trigger-4f6cbfa55d7722d6.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R4_loom_ledger_awareness-605c42ef21895483.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R5_loom_visual_map-486b78f53c8cc3c0.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R6_living_documentation-52d5fcd6b04a85b2.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R7_fault_taxonomy_reconnection-3fb547b4cfbe5881.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R8_ui_diagnostic_surfaces_wired_together-89ea8783a73fb339.graph`
- `lib/phases/repair-contract-and-loom-hub/graph/R9_ui_design_philosophy-bb1f4bfdb151ae73.graph`
- `lib/phases/rich-atlas/AT2_atlas_editor.phase`
- `lib/phases/rich-atlas/graph/AT2_atlas_editor-a1b09cdf79d9b614.graph`

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
<summary>`tests/` · 823 files</summary>

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
- `tests/modules/clear-glass-page-map.test.js`
- `tests/modules/clear-glass-page-session.test.js`
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
- `tests/modules/test-adblock.test.js`
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
- `tests/modules/test-agent-maps-phase.test.js`
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
- `tests/modules/test-any-project-tests.test.js`
- `tests/modules/test-ap1-agent-pull.js`
- `tests/modules/test-approval-chain.test.js`
- `tests/modules/test-architect-pulse-migration.js`
- `tests/modules/test-architect.test.js`
- `tests/modules/test-artifact-index-jaa.test.js`
- `tests/modules/test-artifact-namer.js`
- `tests/modules/test-ask-tools-shape.js`
- `tests/modules/test-assist-loop.js`
- `tests/modules/test-autofill-learn-macro.test.js`
- `tests/modules/test-autofill-learn-pick.test.js`
- `tests/modules/test-autofill-learn-save.test.js`
- `tests/modules/test-autofill-learn-ui.test.js`
- `tests/modules/test-autofill-learned.test.js`
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
- `tests/modules/test-browser-shell.test.js`
- `tests/modules/test-build-context.test.js`
- `tests/modules/test-build-from-the-spec.test.js`
- `tests/modules/test-build-paths.test.js`
- `tests/modules/test-build-queue.test.js`
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
- `tests/modules/test-cg-gig-autofill.test.js`
- `tests/modules/test-cg-job-intake.test.js`
- `tests/modules/test-cg-listener-decay.test.js`
- `tests/modules/test-cg-network-ui.test.js`
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
- `tests/modules/test-compartment-downloads.test.js`
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
- `tests/modules/test-cos-run-target.test.js`
- `tests/modules/test-cos-testenv-any-repo.js`
- `tests/modules/test-cos-testenv.js`
- `tests/modules/test-cos-vm-shell.test.js`
- `tests/modules/test-cos-workspace.test.js`
- `tests/modules/test-dangling-hooks-and-idearium-load.test.js`
- `tests/modules/test-data-clearup.test.js`
- `tests/modules/test-data-home.test.js`
- `tests/modules/test-data-rewired.test.js`
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
- `tests/modules/test-economy-resume.test.js`
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
- `tests/modules/test-evidence-close.test.js`
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
- `tests/modules/test-gates-solid.test.js`
- `tests/modules/test-gemini-toolbox.js`
- `tests/modules/test-genesis-and-architecture-spec.test.js`
- `tests/modules/test-genesis-sandboxed.test.js`
- `tests/modules/test-gig-ledger.test.js`
- `tests/modules/test-global-settings.test.js`
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
- `tests/modules/test-guardian-own-data.test.js`
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
- `tests/modules/test-lift-root.test.js`
- `tests/modules/test-liminal-space.js`
- `tests/modules/test-listener-commands.test.js`
- `tests/modules/test-live-everywhere.test.js`
- `tests/modules/test-live-recording.test.js`
- `tests/modules/test-live-stream-and-gates.test.js`
- `tests/modules/test-log-fixes.test.js`
- `tests/modules/test-loom-map.js`
- `tests/modules/test-loom-phasemap-status.js`
- `tests/modules/test-loom-phasemap.js`
- `tests/modules/test-macro.js`
- `tests/modules/test-manifest-phase1.test.mjs`
- `tests/modules/test-map3d.js`
- `tests/modules/test-mastermind-ready.test.js`
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
- `tests/modules/test-model-fit-ladder.test.js`
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
- `tests/modules/test-passwords.test.js`
- `tests/modules/test-person-model.js`
- `tests/modules/test-pf1-stalls.test.js`
- `tests/modules/test-pf3-append-store.test.js`
- `tests/modules/test-pf5-bounded-tables.test.js`
- `tests/modules/test-phase-actually-builds.test.js`
- `tests/modules/test-phase-census.test.js`
- `tests/modules/test-phase-close.test.js`
- `tests/modules/test-phase-cost.test.js`
- `tests/modules/test-phase-dag.test.js`
- `tests/modules/test-phase-deps-gate.test.js`
- `tests/modules/test-phase-graph.test.js`
- `tests/modules/test-phase-groom.test.js`
- `tests/modules/test-phase-map-auto.test.js`
- `tests/modules/test-phase-mapping.test.js`
- `tests/modules/test-phase-nodes-all.test.js`
- `tests/modules/test-phase-proof.test.js`
- `tests/modules/test-phase-specs-tag.test.js`
- `tests/modules/test-phase-specs.test.js`
- `tests/modules/test-phasemap-diagnosis-facts.test.js`
- `tests/modules/test-phases-tab.test.js`
- `tests/modules/test-pipeline-nodes.test.js`
- `tests/modules/test-pipeline-root-causes.test.js`
- `tests/modules/test-pipeline-routing.test.js`
- `tests/modules/test-pipeline-sim.test.js`
- `tests/modules/test-plan-code-run-attention.test.js`
- `tests/modules/test-plan-conflict.test.js`
- `tests/modules/test-plan-lands.test.js`
- `tests/modules/test-plan-pieces.test.js`
- `tests/modules/test-plan-sidebar.test.js`
- `tests/modules/test-pressure-window.js`
- `tests/modules/test-prevention.test.js`
- `tests/modules/test-processes-ui.test.js`
- `tests/modules/test-processes.test.js`
- `tests/modules/test-profile-tabs.test.js`
- `tests/modules/test-project-decompose.test.js`
- `tests/modules/test-project-registry.test.js`
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
- `tests/modules/test-refusal-sendback.test.js`
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
- `tests/modules/test-roadmap-import.test.js`
- `tests/modules/test-root-findings-not-phases.test.js`
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
- `tests/modules/test-site-profile.test.js`
- `tests/modules/test-site-readers.test.js`
- `tests/modules/test-site-settings-ui.test.js`
- `tests/modules/test-snapshot-half-life-prune.js`
- `tests/modules/test-snowflake.test.js`
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
- `tests/modules/test-starved-machine.test.js`
- `tests/modules/test-step-gate.test.js`
- `tests/modules/test-stream-fallback.test.js`
- `tests/modules/test-stub-finder.js`
- `tests/modules/test-stub-scanner.js`
- `tests/modules/test-substrate-spec.test.js`
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
- `tests/modules/test-tf-already-done.test.js`
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
- `tests/modules/test-upload-placement.test.js`
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
- `tests/modules/test-verify-first.test.js`
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
<summary>the release notes · 437 files (each is in the version history below, in his words)</summary>

`CHANGELOG-0.60.233.md` · `CHANGELOG-0.60.232.md` · `CHANGELOG-0.60.231.md` · `CHANGELOG-0.60.230.md` · `CHANGELOG-0.60.229.md` · `CHANGELOG-0.60.228.md` · `CHANGELOG-0.60.227.md` · `CHANGELOG-0.60.226.md` · `CHANGELOG-0.60.225.md` · `CHANGELOG-0.60.224.md` · `CHANGELOG-0.60.223.md` · `CHANGELOG-0.60.222.md` · `CHANGELOG-0.60.221.md` · `CHANGELOG-0.60.220.md` · `CHANGELOG-0.60.219.md` · `CHANGELOG-0.60.218.md` · `CHANGELOG-0.60.217.md` · `CHANGELOG-0.60.216.md` · `CHANGELOG-0.60.215.md` · `CHANGELOG-0.60.214.md` · `CHANGELOG-0.60.213.md` · `CHANGELOG-0.60.212.md` · `CHANGELOG-0.60.211.md` · `CHANGELOG-0.60.210.md` · `CHANGELOG-0.60.209.md` · `CHANGELOG-0.60.208.md` · `CHANGELOG-0.60.207.md` · `CHANGELOG-0.60.206.md` · `CHANGELOG-0.60.205.md` · `CHANGELOG-0.60.204.md` · `CHANGELOG-0.60.203.md` · `CHANGELOG-0.60.202.md` · `CHANGELOG-0.60.201.md` · `CHANGELOG-0.60.200.md` · `CHANGELOG-0.60.199.md` · `CHANGELOG-0.60.198.md` · `CHANGELOG-0.60.197.md` · `CHANGELOG-0.60.196.md` · `CHANGELOG-0.60.195.md` · `CHANGELOG-0.60.194.md` · `CHANGELOG-0.60.193.md` · `CHANGELOG-0.60.192.md` · `CHANGELOG-0.60.191.md` · `CHANGELOG-0.60.190.md` · `CHANGELOG-0.60.189.md` · `CHANGELOG-0.60.188.md` · `CHANGELOG-0.60.187.md` · `CHANGELOG-0.60.186.md` · `CHANGELOG-0.60.185.md` · `CHANGELOG-0.60.184.md` · `CHANGELOG-0.60.183.md` · `CHANGELOG-0.60.182.md` · `CHANGELOG-0.60.181.md` · `CHANGELOG-0.60.180.md` · `CHANGELOG-0.60.179.md` · `CHANGELOG-0.60.178.md` · `CHANGELOG-0.60.177.md` · `CHANGELOG-0.60.176.md` · `CHANGELOG-0.60.175.md` · `CHANGELOG-0.60.174.md` · `CHANGELOG-0.60.173.md` · `CHANGELOG-0.60.172.md` · `CHANGELOG-0.60.171.md` · `CHANGELOG-0.60.170.md` · `CHANGELOG-0.60.168.md` · `CHANGELOG-0.60.167.md` · `CHANGELOG-0.60.166.md` · `CHANGELOG-0.60.165.md` · `CHANGELOG-0.60.164.md` · `CHANGELOG-0.60.163.md` · `CHANGELOG-0.60.162.md` · `CHANGELOG-0.60.161.md` · `CHANGELOG-0.60.160.md` · `CHANGELOG-0.60.159.md` · `CHANGELOG-0.60.158.md` · `CHANGELOG-0.60.157.md` · `CHANGELOG-0.60.156.md` · `CHANGELOG-0.60.155.md` · `CHANGELOG-0.60.154.md` · `CHANGELOG-0.60.153.md` · `CHANGELOG-0.60.152.md` · `CHANGELOG-0.60.151.md` · `CHANGELOG-0.60.150.md` · `CHANGELOG-0.60.149.md` · `CHANGELOG-0.60.148.md` · `CHANGELOG-0.60.147.md` · `CHANGELOG-0.60.146.md` · `CHANGELOG-0.60.145.md` · `CHANGELOG-0.60.144.md` · `CHANGELOG-0.60.143.md` · `CHANGELOG-0.60.142.md` · `CHANGELOG-0.60.141.md` · `CHANGELOG-0.60.140.md` · `CHANGELOG-0.60.139.md` · `CHANGELOG-0.60.138.md` · `CHANGELOG-0.60.137.md` · `CHANGELOG-0.60.136.md` · `CHANGELOG-0.60.135.md` · `CHANGELOG-0.60.134.md` · `CHANGELOG-0.60.133.md` · `CHANGELOG-0.60.132.md` · `CHANGELOG-0.60.131.md` · `CHANGELOG-0.60.130.md` · `CHANGELOG-0.60.129.md` · `CHANGELOG-0.60.128.md` · `CHANGELOG-0.60.127.md` · `CHANGELOG-0.60.126.md` · `CHANGELOG-0.60.125.md` · `CHANGELOG-0.60.124.md` · `CHANGELOG-0.60.123.md` · `CHANGELOG-0.60.122.md` · `CHANGELOG-0.60.121.md` · `CHANGELOG-0.60.120.md` · `CHANGELOG-0.60.119.md` · `CHANGELOG-0.60.118.md` · `CHANGELOG-0.60.117.md` · `CHANGELOG-0.60.116.md` · `CHANGELOG-0.60.115.md` · `CHANGELOG-0.60.114.md` · `CHANGELOG-0.60.113.md` · `CHANGELOG-0.60.112.md` · `CHANGELOG-0.60.111.md` · `CHANGELOG-0.60.110.md` · `CHANGELOG-0.60.109.md` · `CHANGELOG-0.60.108.md` · `CHANGELOG-0.60.107.md` · `CHANGELOG-0.60.106.md` · `CHANGELOG-0.60.105.md` · `CHANGELOG-0.60.104.md` · `CHANGELOG-0.60.103.md` · `CHANGELOG-0.60.102.md` · `CHANGELOG-0.60.101.md` · `CHANGELOG-0.60.100.md` · `CHANGELOG-0.60.99.md` · `CHANGELOG-0.60.98.md` · `CHANGELOG-0.60.97.md` · `CHANGELOG-0.60.96.md` · `CHANGELOG-0.60.95.md` · `CHANGELOG-0.60.94.md` · `CHANGELOG-0.60.93.md` · `CHANGELOG-0.60.92.md` · `CHANGELOG-0.60.91.md` · `CHANGELOG-0.60.90.md` · `CHANGELOG-0.60.89.md` · `CHANGELOG-0.60.88.md` · `CHANGELOG-0.60.87.md` · `CHANGELOG-0.60.86.md` · `CHANGELOG-0.60.85.md` · `CHANGELOG-0.60.84.md` · `CHANGELOG-0.60.83.md` · `CHANGELOG-0.60.82.md` · `CHANGELOG-0.60.81.md` · `CHANGELOG-0.60.80.md` · `CHANGELOG-0.60.79.md` · `CHANGELOG-0.60.78.md` · `CHANGELOG-0.60.77.md` · `CHANGELOG-0.60.76.md` · `CHANGELOG-0.60.75.md` · `CHANGELOG-0.60.74.md` · `CHANGELOG-0.60.73.md` · `CHANGELOG-0.60.72.md` · `CHANGELOG-0.60.71.md` · `CHANGELOG-0.60.70.md` · `CHANGELOG-0.60.69.md` · `CHANGELOG-0.60.68.md` · `CHANGELOG-0.60.67.md` · `CHANGELOG-0.60.66.md` · `CHANGELOG-0.60.65.md` · `CHANGELOG-0.60.64.md` · `CHANGELOG-0.60.63.md` · `CHANGELOG-0.60.62.md` · `CHANGELOG-0.60.61.md` · `CHANGELOG-0.60.60.md` · `CHANGELOG-0.60.59.md` · `CHANGELOG-0.60.58.md` · `CHANGELOG-0.60.57.md` · `CHANGELOG-0.60.56.md` · `CHANGELOG-0.60.55.md` · `CHANGELOG-0.60.54.md` · `CHANGELOG-0.60.53.md` · `CHANGELOG-0.60.52.md` · `CHANGELOG-0.60.51.md` · `CHANGELOG-0.60.50.md` · `CHANGELOG-0.60.49.md` · `CHANGELOG-0.60.48.md` · `CHANGELOG-0.60.47.md` · `CHANGELOG-0.60.46.md` · `CHANGELOG-0.60.45.md` · `CHANGELOG-0.60.44.md` · `CHANGELOG-0.60.43.md` · `CHANGELOG-0.60.42.md` · `CHANGELOG-0.60.41.md` · `CHANGELOG-0.60.40.md` · `CHANGELOG-0.60.39.md` · `CHANGELOG-0.60.38.md` · `CHANGELOG-0.60.37.md` · `CHANGELOG-0.60.36.md` · `CHANGELOG-0.60.35.md` · `CHANGELOG-0.60.34.md` · `CHANGELOG-0.60.33.md` · `CHANGELOG-0.60.32.md` · `CHANGELOG-0.60.31.md` · `CHANGELOG-0.60.30.md` · `CHANGELOG-0.60.29.md` · `CHANGELOG-0.60.28.md` · `CHANGELOG-0.60.27.md` · `CHANGELOG-0.60.26.md` · `CHANGELOG-0.60.21.md` · `CHANGELOG-0.60.20.md` · `CHANGELOG-0.60.19.md` · `CHANGELOG-0.60.18.md` · `CHANGELOG-0.60.17.md` · `CHANGELOG-0.60.16.md` · `CHANGELOG-0.60.15.md` · `CHANGELOG-0.60.14.md` · `CHANGELOG-0.60.13.md` · `CHANGELOG-0.60.12.md` · `CHANGELOG-0.60.11.md` · `CHANGELOG-0.60.10.md` · `CHANGELOG-0.60.9.md` · `CHANGELOG-0.60.8.md` · `CHANGELOG-0.60.7.md` · `CHANGELOG-0.60.6.md` · `CHANGELOG-0.60.5.md` · `CHANGELOG-0.60.4.md` · `CHANGELOG-0.60.3.md` · `CHANGELOG-0.60.2.md` · `CHANGELOG-0.60.1.md` · `CHANGELOG-0.60.0.md` · `CHANGELOG-0.59.15.md` · `CHANGELOG-0.59.14.md` · `CHANGELOG-0.59.13.md` · `CHANGELOG-0.59.12.md` · `CHANGELOG-0.59.11.md` · `CHANGELOG-0.59.10.md` · `CHANGELOG-0.59.9.md` · `CHANGELOG-0.59.8.md` · `CHANGELOG-0.59.7.md` · `CHANGELOG-0.59.6.md` · `CHANGELOG-0.59.5.md` · `CHANGELOG-0.59.4.md` · `CHANGELOG-0.59.3.md` · `CHANGELOG-0.59.2.md` · `CHANGELOG-0.59.1.md` · `CHANGELOG-0.59.0.md` · `CHANGELOG-0.58.0.md` · `CHANGELOG-0.57.1.md` · `CHANGELOG-0.57.0.md` · `CHANGELOG-0.56.0.md` · `CHANGELOG-0.55.2.md` · `CHANGELOG-0.55.1.md` · `CHANGELOG-0.55.0.md` · `CHANGELOG-0.54.2.md` · `CHANGELOG-0.54.1.md` · `CHANGELOG-0.54.0.md` · `CHANGELOG-0.53.0.md` · `CHANGELOG-0.52.0.md` · `CHANGELOG-0.51.0.md` · `CHANGELOG-0.50.0.md` · `CHANGELOG-0.49.0.md` · `CHANGELOG-0.48.0.md` · `CHANGELOG-0.47.0.md` · `CHANGELOG-0.46.0.md` · `CHANGELOG-0.45.0.md` · `CHANGELOG-0.44.0.md` · `CHANGELOG-0.43.0.md` · `CHANGELOG-0.42.0.md` · `CHANGELOG-0.41.0.md` · `CHANGELOG-0.40.1.md` · `CHANGELOG-0.40.0.md` · `CHANGELOG-0.39.376.md` · `CHANGELOG-0.39.375.md` · `CHANGELOG-0.39.374.md` · `CHANGELOG-0.39.373.md` · `CHANGELOG-0.39.372.md` · `CHANGELOG-0.39.371.md` · `CHANGELOG-0.39.370.md` · `CHANGELOG-0.39.369.md` · `CHANGELOG-0.39.368.md` · `CHANGELOG-0.39.367.md` · `CHANGELOG-0.39.366.md` · `CHANGELOG-0.39.365.md` · `CHANGELOG-0.39.364.md` · `CHANGELOG-0.39.363.md` · `CHANGELOG-0.39.362.md` · `CHANGELOG-0.39.361.md` · `CHANGELOG-0.39.360.md` · `CHANGELOG-0.39.359.md` · `CHANGELOG-0.39.358.md` · `CHANGELOG-0.39.357.md` · `CHANGELOG-0.39.356.md` · `CHANGELOG-0.39.355.md` · `CHANGELOG-0.39.354.md` · `CHANGELOG-0.39.353.md` · `CHANGELOG-0.39.352.md` · `CHANGELOG-0.39.351.md` · `CHANGELOG-0.39.350.md` · `CHANGELOG-0.39.349.md` · `CHANGELOG-0.39.348.md` · `CHANGELOG-0.39.347.md` · `CHANGELOG-0.39.346.md` · `CHANGELOG-0.39.345.md` · `CHANGELOG-0.39.344.md` · `CHANGELOG-0.39.343.md` · `CHANGELOG-0.39.342.md` · `CHANGELOG-0.39.341.md` · `CHANGELOG-0.39.340.md` · `CHANGELOG-0.39.339.md` · `CHANGELOG-0.39.338.md` · `CHANGELOG-0.39.337.md` · `CHANGELOG-0.39.336.md` · `CHANGELOG-0.39.335.md` · `CHANGELOG-0.39.334.md` · `CHANGELOG-0.39.333.md` · `CHANGELOG-0.39.332.md` · `CHANGELOG-0.39.331.md` · `CHANGELOG-0.39.330.md` · `CHANGELOG-0.39.329.md` · `CHANGELOG-0.39.328.md` · `CHANGELOG-0.39.327.md` · `CHANGELOG-0.39.326.md` · `CHANGELOG-0.39.325.md` · `CHANGELOG-0.39.324.md` · `CHANGELOG-0.39.323.md` · `CHANGELOG-0.39.322.md` · `CHANGELOG-0.39.321.md` · `CHANGELOG-0.39.320.md` · `CHANGELOG-0.39.319.md` · `CHANGELOG-0.39.318.md` · `CHANGELOG-0.39.317.md` · `CHANGELOG-0.39.316.md` · `CHANGELOG-0.39.315.md` · `CHANGELOG-0.39.314.md` · `CHANGELOG-0.39.313.md` · `CHANGELOG-0.39.312.md` · `CHANGELOG-0.39.311.md` · `CHANGELOG-0.39.310.md` · `CHANGELOG-0.39.309.md` · `CHANGELOG-0.39.308.md` · `CHANGELOG-0.39.307.md` · `CHANGELOG-0.39.306.md` · `CHANGELOG-0.39.305.md` · `CHANGELOG-0.39.304.md` · `CHANGELOG-0.39.303.md` · `CHANGELOG-0.39.302.md` · `CHANGELOG-0.39.301.md` · `CHANGELOG-0.39.300.md` · `CHANGELOG-0.39.299.md` · `CHANGELOG-0.39.298.md` · `CHANGELOG-0.39.297.md` · `CHANGELOG-0.39.296.md` · `CHANGELOG-0.39.295.md` · `CHANGELOG-0.39.294.md` · `CHANGELOG-0.39.293.md` · `CHANGELOG-0.39.292.md` · `CHANGELOG-0.39.291.md` · `CHANGELOG-0.39.290.md` · `CHANGELOG-0.39.289.md` · `CHANGELOG-0.39.288.md` · `CHANGELOG-0.39.287.md` · `CHANGELOG-0.39.286.md` · `CHANGELOG-0.39.285.md` · `CHANGELOG-0.39.284.md` · `CHANGELOG-0.39.283.md` · `CHANGELOG-0.39.282.md` · `CHANGELOG-0.39.281.md` · `CHANGELOG-0.39.280.md` · `CHANGELOG-0.39.279.md` · `CHANGELOG-0.39.278.md` · `CHANGELOG-0.39.277.md` · `CHANGELOG-0.39.276.md` · `CHANGELOG-0.39.275.md` · `CHANGELOG-0.39.274.md` · `CHANGELOG-0.39.273.md` · `CHANGELOG-0.39.272.md` · `CHANGELOG-0.39.271.md` · `CHANGELOG-0.39.270.md` · `CHANGELOG-0.39.269.md` · `CHANGELOG-0.39.268.md` · `CHANGELOG-0.39.267.md` · `CHANGELOG-0.39.266.md` · `CHANGELOG-0.39.264.md` · `CHANGELOG-0.39.263.md` · `CHANGELOG-0.39.262.md` · `CHANGELOG-0.39.261.md` · `CHANGELOG-0.39.260.md` · `CHANGELOG-0.39.259.md` · `CHANGELOG-0.39.258.md` · `CHANGELOG-0.39.257.md` · `CHANGELOG-0.39.256.md` · `CHANGELOG-0.39.255.md` · `CHANGELOG-0.39.254.md` · `CHANGELOG-0.39.253.md` · `CHANGELOG-0.39.252.md` · `CHANGELOG-0.39.251.md` · `CHANGELOG-0.39.250.md` · `CHANGELOG-0.39.249.md` · `CHANGELOG-0.39.248.md` · `CHANGELOG-0.39.247.md` · `CHANGELOG-0.39.246.md` · `CHANGELOG-0.39.245.md` · `CHANGELOG-0.39.244.md` · `CHANGELOG-0.39.243.md` · `CHANGELOG-0.39.242.md` · `CHANGELOG-0.39.241.md` · `CHANGELOG-0.39.240.md` · `CHANGELOG-0.39.239.md` · `CHANGELOG-0.39.238.md` · `CHANGELOG-0.39.237.md` · `CHANGELOG-0.39.236.md` · `CHANGELOG-0.39.228.md` · `CHANGELOG-0.39.227.md` · `CHANGELOG-0.39.223.md` · `CHANGELOG-0.39.194.md` · `CHANGELOG-0.39.193.md` · `CHANGELOG-0.39.192.md` · `CHANGELOG-0.39.191.md` · `CHANGELOG-0.39.190.md` · `CHANGELOG-0.39.188.md` · `CHANGELOG-0.39.182.md` · `CHANGELOG-0.39.181.md` · `CHANGELOG-0.39.179.md` · `CHANGELOG-0.39.178.md` · `CHANGELOG-0.39.177.md` · `CHANGELOG-0.39.176.md` · `CHANGELOG-0.39.175.md` · `CHANGELOG-0.39.174.md` · `CHANGELOG-0.39.173.md` · `CHANGELOG-0.39.172.md` · `CHANGELOG-0.39.170.md` · `CHANGELOG-0.39.169.md` · `CHANGELOG-0.39.168.md` · `CHANGELOG-0.39.167.md` · `CHANGELOG-0.39.166.md` · `CHANGELOG-0.39.165.md` · `CHANGELOG-0.39.144.md` · `CHANGELOG-0.39.144-part2.md`

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

Every phase of every phasemap, 2066 phases across 159 maps, read by the one phasemap parser loom uses (`loom/scanners/phasemap-map.js`). 842 are done, 11 in progress and 1213 pending. A decision (a question for James, or one his axioms decided) is marked as one. The maps are newest first; each opens to its phases, each phase with its status and what it does. The map itself, with the reasons and the proof, is the file named.

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
<summary>`docs/nexus-repository-system-build-phasemap.spec` · 8 · 3 done, 0 in progress, 5 pending</summary>

- **MCO0_audit_real_coverage** · done
- **MCO1_graph_layer** · done
- **MCO2_verification_deepening** · pending
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
<summary>`docs/2026-10-23-site-profile-processes-phasemap.spec` · 6 · 6 done, 0 in progress, 0 pending</summary>

- **SP1_one_resolver_for_every_feature** · done
- **SP2_each_feature_reads_its_site_value** · done
- **SP3_the_site_settings_screen** · done
- **SP4_cleardriver_mesh_guardian_settings** · done
- **SP5_processes_and_activity** · done
- **SP6_the_processes_screen** · done

</details>

<details>
<summary>`docs/2026-10-23-self-building-loop-phasemap.spec` · 11 · 8 done, 0 in progress, 3 pending</summary>

- **SL0_what_can_be_built_now** · done
- **SL1_a_proven_phase_closes_itself** · done
- **SL2_done_by_evidence** · done
- **SL3_the_backlog_groomed** · done
- **SL4_the_loop** · pending
- **SL5_when_a_proven_change_lands_alone** · pending
- **SL6_the_loop_counts_itself** · pending
- **SL7_build_again_is_asked_for** · done
- **SL8_the_agent_maps_what_nexus_cannot** · done
- **SL9_every_phase_a_node** · done
- **SL10_the_pipeline_simulated** · done

</details>

<details>
<summary>`docs/2026-10-23-cos-spine-phasemap.spec` · 12 · 0 done, 0 in progress, 12 pending</summary>

- **CS1_a_version_is_a_system_state** · pending
- **CS2_test_every_version** · pending
- **CS3_the_registry_is_the_bridge** · pending
- **CS4_every_system_a_compartment** · pending
- **CS4a_cos_boots_alone** · pending
- **CS5_caps_per_compartment** · pending
- **CS6_rebuild_from_the_spec** · pending
- **CS7_spawn_despawn_and_balance** · pending
- **CS9_every_project_a_compartment** · pending
- **CS10_hats_bound_to_the_compartment** · pending
- **CS11_raid_in_the_exe** · pending
- **CS8_the_cos_screen** · pending

</details>

<details>
<summary>`docs/2026-10-22-system-node-db-phasemap.spec` · 6 · 0 done, 0 in progress, 6 pending</summary>

- **ND1_every_system_has_its_database** · pending
- **ND2_one_node_route_for_every_system** · pending
- **ND3_each_server_serves_its_nodes** · pending
- **ND4_commands_and_capabilities_from_the_schemas** · pending
- **ND5_every_agent_reaches_every_system** · pending
- **ND6_the_nodes_screen** · pending

</details>

<details>
<summary>`docs/2026-10-21-snowflake-compartment-phasemap.spec` · 9 · 9 done, 0 in progress, 0 pending</summary>

- **SF2_bridge_sources** · done
- **SF1_honest_detection** · done
- **SF4_https_only** · done
- **SF3_page_in_the_compartment** · done
- **SF5_circuit_check** · done
- **SF6_surface** · done
- **SF7_bridge_automatic** · done
- **SF8_host_import** · done
- **SF9_install_in_use** · done

</details>

<details>
<summary>`docs/2026-10-21-passwords-phasemap.spec` · 5 · 5 done, 0 in progress, 0 pending</summary>

- **PW0_where_passwords_live** · decision · done
- **PW1_service** · done
- **PW2_page** · done
- **PW3_wiring** · done
- **PW4_surface** · done

</details>

<details>
<summary>`docs/2026-10-21-data-layout-phasemap.spec` · 8 · 3 done, 1 in progress, 4 pending</summary>

- **DL0_data_census** · done
- **DL1_clearup_tool** · done
- **DL2_one_resolver** · done
- **DL3_rewire_writers** · in-progress
- **DL4_one_repo_folder** · pending
- **DL5_memory_in_cortex** · pending
- **DL6_cortex_server** · pending
- **DL7_cortex_snapshot_out** · pending

</details>

<details>
<summary>`docs/2026-10-21-compartment-downloads-phasemap.spec` · 7 · 7 done, 0 in progress, 0 pending</summary>

- **CD0_magnet_client** · decision · done
- **CD0_kill_default** · decision · done
- **CD1_magnet_parse** · done
- **CD2_quarantine_downloads** · done
- **CD3_verified_handoff** · done
- **CD4_kill_on_disconnect** · done
- **CD5_surface** · done

</details>

<details>
<summary>`docs/2026-10-21-browser-shell-phasemap.spec` · 21 · 21 done, 0 in progress, 0 pending</summary>

- **BS0_cookie_target** · decision · done
- **BS1_firefox_import** · done
- **BS2_shell_rebuild** · done
- **BS3_menus** · done
- **BS4_extensions** · done
- **BS5_downloads_panel** · done
- **BS6_float_cli** · done
- **BS7_surface** · done
- **BS8_design_system** · done
- **BS9_agents_hub** · done
- **BS10_new_tab** · done
- **BS11_copilot_pane** · done
- **BS12_context_automatic** · done
- **BS13_plugin_settings** · done
- **BS14_zoom_core** · done
- **BS15_context_menu** · done
- **BS16_import_fields** · done
- **BS17_menu_consolidated** · done
- **BS18_chrome_context_menus** · done
- **BS19_ctx_point_from_page** · done
- **BS20_bookmark_site_accounts** · done

</details>

<details>
<summary>`docs/2026-10-21-brainos-into-idearium-phasemap.spec` · 16 · 6 done, 0 in progress, 10 pending</summary>

- **BX0a_where_it_lands** · decision · done
- **BX0b_retire_brainos_page** · decision · done
- **BX0c_float** · decision · done
- **BX0d_order_against_the_pipeline** · decision · done
- **BX0e_true_map_first** · decision · done
- **BX1_census** · pending
- **CNS1_phase_census** · done
- **BX2_flow_sources** · pending
- **BX3_flow_canvas** · pending
- **BX4_agents_layer** · pending
- **BX5_node_controls** · pending
- **BX6_pipeline_edit** · pending
- **BX7_automation** · pending
- **BX8_dock_panels** · pending
- **BX9_retire** · pending
- **BX10_float** · pending

</details>

<details>
<summary>`docs/2026-10-21-approval-chain-phasemap.spec` · 6 · 6 done, 0 in progress, 0 pending</summary>

- **APV0_one_record** · decision · done
- **APV1_change_entry** · done
- **APV2_commit_carries_it** · done
- **APV3_changelog_read** · done
- **APV4_emit_on_the_ledger** · done
- **APV5_wired_in_loom** · done

</details>

<details>
<summary>`docs/2026-10-21-adblock-phasemap.spec` · 6 · 6 done, 0 in progress, 0 pending</summary>

- **AB0_engine_in_core** · decision · done
- **AB1_engine** · done
- **AB2_lists** · done
- **AB3_wiring** · done
- **AB4_surface** · done
- **AB5_import** · done

</details>

<details>
<summary>`docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec` · 18 · 0 done, 0 in progress, 18 pending</summary>

- **GR0_graph_census** · pending
- **GR1_graph_primitive** · pending
- **GR2_graph_views** · pending
- **GR3_graph_query_surface** · pending
- **TV1_traversal_primitive** · pending
- **TV2_invariant_guided_traversal** · pending
- **TV3_traversal_as_context** · pending
- **CH0_chunk_census_and_contract** · pending
- **CH1_strategies_behind_the_contract** · pending
- **CH2_chunk_laws** · pending
- **CH3_chunk_inspector** · pending
- **DK1_dynamic_chunking** · pending
- **DK2_learned_granularity** · pending
- **GW0_gate_census** · pending
- **GW1_gate_primitive** · pending
- **GW2_gates_at_every_level** · pending
- **GW3_gate_panel** · pending
- **PS1_phase_specs** · pending

</details>

<details>
<summary>`docs/2026-10-20-belief-loop-phasemap.spec` · 16 · 0 done, 0 in progress, 16 pending</summary>

- **RA0_rca_says_what_it_does** · pending
- **CY0_one_crystal_schema** · pending
- **CY1_lifecycle_and_injection** · pending
- **CY2_invariants_are_crystals** · pending
- **IV0_belief_census** · pending
- **IV1_invariant_kinds** · pending
- **IV2_invariant_miner** · pending
- **PV1_provenance_on_every_claim** · pending
- **EW1_evidence_record_and_weights** · pending
- **CF1_confidence_from_evidence** · pending
- **AV1_adversarial_review** · pending
- **RA1_root_cause_through_provenance** · pending
- **RA2_learned_source_trust** · pending
- **XD1_cross_domain_verification** · pending
- **BW1_borrowing** · pending
- **CY3_belief_panel** · pending

</details>

<details>
<summary>`docs/2026-10-19-upload-intent-and-page-map-phasemap.spec` · 18 · 12 done, 0 in progress, 6 pending</summary>

- **D1_placement_is_deterministic_first** · decision · pending
- **D2_one_door_for_writes** · decision · pending
- **D3_page_map_lives_in_clear_glass** · decision · pending
- **D4_learning_is_counted_not_trained** · decision · pending
- **UP1_placement_tool** · done
- **UP2_learned_placements** · done
- **UP3_upload_routes_and_commands** · done
- **UP4_upload_ui** · done
- **UP5_registry_wires_on_apply** · pending
- **UP6_model_for_the_unplaced** · pending
- **PM1_blocks** · done
- **PM2_index_and_chunks** · done
- **PM3_synthesized_map_that_learns** · done
- **PM4_intent_to_targets** · done
- **PM5_tools_routes_commands** · done
- **PM6_nerve_feel** · done
- **PM7_live_injected_map** · done
- **PM8_page_map_panel** · done

</details>

<details>
<summary>`docs/2026-10-19-solid-build-foundation-phasemap.spec` · 12 · 4 done, 0 in progress, 8 pending</summary>

- **MF1_model_fit_routing** · done
- **DC1_dynamic_chunk_at_plan** · pending
- **CR1_project_registry_spine** · done
- **CT1_cos_test_runner** · done
- **GQ1_quality_stream** · pending
- **GQ3_brick_tests** · pending
- **GQ2_brick_gate_runs_the_test** · pending
- **GQ4_phase_gate_keeps_the_test** · pending
- **AB1_autobuild_loop_and_resume** · done
- **AB2_hat_aware_ladder** · pending
- **SET1_autobuild_config_and_command** · pending
- **SET2_autobuild_settings_ui** · pending

</details>

<details>
<summary>`docs/2026-10-19-pipeline-root-causes-phasemap.spec` · 29 · 13 done, 0 in progress, 16 pending</summary>

- **RC1_watchers_never_kill_a_kernel** · done
- **RC2_linear_node_scan** · done
- **RC3_windows_safe_node_names** · done
- **RC4_agent_file_names_guarded** · done
- **RC5_find_where_the_label_enters** · done
- **VF1_verify_first** · done
- **VF2_one_response_bundle** · pending
- **VF3_mutation_check** · pending
- **VF4_second_opinion_on_need** · pending
- **VF5_verdict_cache** · pending
- **SS1_system_store_adoption** · done
- **SS2_every_system_home** · pending
- **SS3_nodes_are_the_data** · pending
- **SS4_seal_into_compartments** · pending
- **UI1_toolbox_and_store_explorer** · pending
- **UI2_version_in_code** · pending
- **UI3_ideas_and_notes_as_one** · pending
- **CB1_coder_brief** · done
- **CB2_gemini_first** · done
- **SM1_agent_self_model** · done
- **DG3_the_whole_dag** · done
- **DG4_nexus_maps_meet_the_standard** · pending
- **DG5_dag_in_the_brief_and_the_ui** · pending
- **RC6_unowned_ollama_load** · done
- **RC7_every_run_names_its_starter** · done
- **MEM1_cortex_keeps_the_books** · pending
- **PR1_page_reader** · pending
- **PR2_autofill_and_copilot_read_first** · pending
- **ID1_ideas_wired_through** · pending

</details>

<details>
<summary>`docs/2026-10-19-infrastructure-spine-phasemap.spec` · 25 · 1 done, 0 in progress, 24 pending</summary>

- **IN0_baseline** · pending
- **IN1_old_files_out** · pending
- **IN2_quotes_ledger** · pending
- **IN3_registry_is_the_spine** · pending
- **IN4_retire_hand_maps** · pending
- **IN5_architect_mirrors_the_registry** · pending
- **IN6_systems_onto_the_spine** · pending
- **IN7_every_phase_and_spec_on_the_spine** · pending
- **IN8_any_size** · pending
- **NC1_neutral_core_boundary** · pending
- **AD1_adapter_contract** · pending
- **AD2_javascript_adapter** · pending
- **AD3_python_adapter** · pending
- **AD4_documents_adapter** · pending
- **NT1_neutrality_test** · pending
- **FP1_feature_pilot** · pending
- **SC1_scaling_limits_named** · pending
- **ST1_schema_for_everything_reusable** · pending
- **PN1_phases_to_nodes** · pending
- **PN2_dual_read** · pending
- **PN3_maps_rendered_from_nodes** · pending
- **PRC1_phase_reality_check** · pending
- **VC1_a_change_entry_for_every_event** · pending
- **VC2_changelogs_rendered** · pending
- **IN3a_build_stands_on_the_registry** · done

</details>

<details>
<summary>`docs/2026-10-19-idearium-control-phasemap.spec` · 13 · 0 done, 0 in progress, 13 pending</summary>

- **NM1_one_name_per_file** · pending
- **PC1_phase_controls** · pending
- **FM1_file_manager** · pending
- **FM2_stores_in_the_files_tab** · pending
- **CT0_code_tab_census** · pending
- **CT1_fewer_wider_tabs** · pending
- **TB1_toolbox** · pending
- **VS1_versions_in_the_surface** · pending
- **VS2_diff_only_backups** · pending
- **IX1_everything_linked** · pending
- **IM1_ideas_and_notes_as_one** · pending
- **IM2_promote_to_phase** · pending
- **IM3_ideas_mapped_to_nexus** · pending

</details>

<details>
<summary>`docs/2026-10-19-gig-autofill-and-learn-phasemap.spec` · 14 · 8 done, 0 in progress, 6 pending</summary>

- **GA0a_no_gig_yet** · decision · done
- **GA0b_where_a_pick_is_kept** · decision · done
- **GA0c_the_learned_map_is_per_site** · decision · done
- **GA1_copilot_fills_the_gig** · pending
- **GA1a_a_written_gig_is_remembered** · pending
- **GA2_a_missed_field_asks_the_picker** · pending
- **GA3_the_pick_is_saved_three_ways** · pending
- **GA4_the_matcher_learns** · pending
- **GA5_commands_and_the_panel** · pending
- **JA1_the_matcher_consults_learned** · done
- **JA2_a_pick_is_saved_per_site** · done
- **JA3_the_picker_on_a_miss** · done
- **JA4_the_learn_loop_ui** · done
- **JA5_the_pick_is_also_a_macro** · done

</details>

<details>
<summary>`docs/2026-10-19-gate-quality-checks-phasemap.spec` · 6 · 0 done, 0 in progress, 6 pending</summary>

- **GQ1_quality_stream** · pending
- **GQ2_brick_gate_runs_the_test** · pending
- **GQ3_brick_tests** · pending
- **GQ4_phase_gate_keeps_the_test** · pending
- **GQ5_command** · pending
- **GQ6_ui** · pending

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
<summary>`docs/2026-10-18-gate-memory-phasemap.spec` · 12 · 5 done, 0 in progress, 7 pending</summary>

- **GM0a_the_precommit_compartment** · decision · pending
- **GM0b_files_and_a_table** · decision · done
- **GM0c_what_a_record_holds** · decision · done
- **GM0d_the_ladder_order** · decision · done
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
<summary>`docs/2026-10-18-debugging-product-phasemap.spec` · 11 · 2 done, 0 in progress, 9 pending</summary>

- **DBG0a_synchronized_ids** · decision · done
- **DBG0b_dependencies_map_gaps** · decision · done
- **DBG0c_which_product** · decision · pending
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
<summary>`docs/2026-10-18-compartment-environment-phasemap.spec` · 14 · 3 done, 1 in progress, 10 pending</summary>

- **CE0a_one_compartment_per_what** · decision · pending
- **CE0b_the_os** · decision · done
- **CE0c_the_renderer** · decision · done
- **CE0d_what_the_handshake_verifies** · decision · done
- **CE0e_cos_answers_on_a_route** · decision · in-progress
- **CE0f_the_handshake_is_the_kernel_s** · decision · pending
- **CE1a_cos_answers_on_a_route** · pending
- **CE1_the_compartment_machine** · pending
- **CE2_the_shell_is_declared** · pending
- **CE3_the_handshake** · pending
- **CE4_the_terminal_bridge** · pending
- **CE5_the_guest_file_tree** · pending
- **CE6_the_code_tab** · pending
- **CE7_agents_and_commands** · pending

</details>

<details>
<summary>`docs/2026-10-17-system-drawbridge-phasemap.spec` · 29 · 8 done, 0 in progress, 21 pending</summary>

- **DB0a_is_lib_a_system** · decision · done
- **DB0b_in_process_or_http** · decision · done
- **DB0c_how_it_is_enforced** · decision · done
- **DB1_the_census_and_the_ratchet** · done
- **DB2_the_registry_says_what_it_offers** · pending
- **DB3_the_drawbridge** · pending
- **DB4_one_bus_per_system** · pending
- **DB5_the_handshake_for_every_system** · pending
- **DB6_move_the_crossings** · pending
- **DB7_the_ui_floats_on_top** · pending
- **DB8_agents_have_it** · pending
- **DB0b_reading** · pending
- **DB0a_still_open** · pending
- **DB0c_reading** · pending
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
- **P33_slices** · pending
- **P33a_a_registry_for_any_system** · done
- **P33b_each_system_runs_its_listener** · done
- **DB19_genesis_sandboxed_fork** · pending
- **DB20_sealed_archetype** · pending

</details>

<details>
<summary>`docs/2026-10-17-pieces-not-order-phasemap.spec` · 9 · 2 done, 0 in progress, 7 pending</summary>

- **PC0a_what_a_piece_depends_on** · decision · done
- **PC0b_first_kinds** · decision · done
- **PC0c_who_cuts** · decision · pending
- **PC1_the_point_first** · pending
- **PC2_any_order** · pending
- **PC3_verified_alone_resumed_by_recheck** · pending
- **PC4_a_procedure_per_kind** · pending
- **PC5_control_when_he_chooses** · pending
- **PC6_assembled_and_checked_whole** · pending

</details>

<details>
<summary>`docs/2026-10-17-infrastructure-migration-phasemap.spec` · 12 · 5 done, 0 in progress, 7 pending</summary>

- **IM0a_state_in_git** · decision · done
- **IM0b_root_files** · decision · done
- **IM0c_tests_with_their_system** · decision · done
- **IM0d_lib_is_the_kernel** · decision · done
- **IM1_the_shape_census_as_a_command** · pending
- **IM2_clean_the_redundant** · pending
- **IM3_wire_what_exists** · pending
- **IM4_the_kernel_boundary** · pending
- **IM5_each_system_to_the_template** · pending
- **IM6_cortex_unclumped** · pending
- **IM7_the_ui_on_the_registry** · pending
- **IM0e_what_is_a_primitive** · decision · done

</details>

<details>
<summary>`docs/2026-10-17-failure-mode-report-phasemap.spec` · 16 · 5 done, 0 in progress, 11 pending</summary>

- **FMR0a_reproduce_when** · decision · pending
- **FMR0b_macros_leave_the_machine** · decision · done
- **FMR0c_first_replay_route** · decision · done
- **FMR0d_nerve_role** · decision · done
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
<summary>`docs/2026-10-17-debugging-product-phasemap.spec` · 17 · 3 done, 0 in progress, 14 pending</summary>

- **DP0a_one_product_or_two** · decision · pending
- **DP0b_its_name** · decision · pending
- **DP0c_ids** · decision · done
- **DP0d_one_gap_door** · decision · done
- **DP0e_the_case_is_a_contract** · decision · done
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
<summary>`docs/2026-10-16-nexus-git-sync-phasemap.spec` · 9 · 0 done, 0 in progress, 9 pending</summary>

- **GS0_authority** · decision · pending
- **GS0b_what_gets_pushed** · decision · pending
- **GS0c_his_copy** · decision · pending
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
<summary>`docs/2026-10-16-intent-hat-agent-chain-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **IH0a_one_vocabulary** · decision · pending
- **IH0b_per_repo** · decision · pending
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
<summary>`docs/2026-10-16-durable-work-timeline-phasemap.spec` · 9 · 2 done, 0 in progress, 7 pending</summary>

- **TL0a_unit_of_the_timeline** · decision · done
- **TL0b_rewind_scope** · decision · done
- **TL0_find_the_loss** · decision · pending
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
<summary>`docs/2026-10-16-code-tab-rebuild-phasemap.spec` · 19 · 2 done, 0 in progress, 17 pending</summary>

- **TB0_decisions** · pending
- **TB1_read_model_per_tab** · pending
- **TB2_persistence_audit** · pending
- **TB3_close_the_persistence_gaps** · pending
- **TB4_reuse_responses** · pending
- **TB5_tab_shell** · pending
- **TB6_files_changes_plans_cos_tabs** · pending
- **TB7_runs_tab** · pending
- **TB8_proof_and_wiring** · pending
- **TB7a_edges_recorded** · pending
- **TB7b_keep_every_step** · pending
- **TB7c_graph_and_zoom** · pending
- **TB7d_node_controls** · pending
- **TB3a_tool_calls_saved** · pending
- **TB4a_recall_in_the_dispatcher** · pending
- **TB4b_nexus_recall_tool** · pending
- **TB4c_measure** · pending
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
<summary>`docs/2026-10-15-spec-foundation-model-phasemap.spec` · 7 · 0 done, 0 in progress, 7 pending</summary>

- **SF1_foundation_field** · pending
- **SF2_state_and_gate** · pending
- **SF3_evidence_not_claims** · pending
- **SF4_the_listener** · pending
- **SF5_hat_intent_injection** · pending
- **SF6_addenda_view** · pending
- **SF7_get_his_run_current** · pending

</details>

<details>
<summary>`docs/2026-10-15-personal-chat-import-phasemap.spec` · 12 · 0 done, 0 in progress, 12 pending</summary>

- **PI0_where_it_is_read** · decision · pending
- **PI0b_what_a_chat_may_become** · decision · pending
- **PI0c_the_listener_default** · decision · pending
- **PI1_the_importer** · pending
- **PI2_the_listener** · pending
- **PI3_the_intelligence_pass** · pending
- **PI4_the_review_screen** · pending
- **PI5_the_sync** · pending
- **PI6_the_firefox_script** · pending
- **PI3b_the_measured_patterns** · pending
- **PI5_the_crawler** · pending
- **PI7_the_links** · pending

</details>

<details>
<summary>`docs/2026-10-15-one-contract-raid-releases-phasemap.spec` · 12 · 8 done, 0 in progress, 4 pending</summary>

- **GT1a_exhausted_climb_spends_its_attempt** · done
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
<summary>`docs/2026-10-15-macro-node-recording-phasemap.spec` · 19 · 4 done, 0 in progress, 15 pending</summary>

- **MR0_where_the_file_lives** · decision · pending
- **MR1_live_node** · done
- **MR2_richer_events** · done
- **MR3_dialog** · done
- **MR3b_guide_and_hotkey_toast** · done
- **MR4_listener_as_nodes** · pending
- **MR5_role_tags** · pending
- **MR6_macro_to_automation** · pending
- **MR7_hotkeys_scope** · decision · pending
- **MR12_p2p_scope** · decision · pending
- **MR13_finance_field** · decision · pending
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
<summary>`docs/2026-10-15-gate-held-work-phasemap.spec` · 32 · 8 done, 0 in progress, 24 pending</summary>

- **GW0_what_is_a_gate** · decision · done
- **GW0b_fresh_chat_policy** · decision · done
- **GW0c_replay_mode** · decision · done
- **GW0e_sandbox_egress** · decision · done
- **GW0f_mutation_testing** · decision · done
- **GW0g_parallel_limit** · decision · done
- **GW0h_minimal_default** · decision · done
- **GW0i_find_order** · decision · done
- **GW0d_listener_question** · decision · pending
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
<summary>`docs/2026-10-15-fiverr-ledger-phasemap.spec` · 5 · 1 done, 0 in progress, 4 pending</summary>

- **PF0_the_ledger** · done
- **PF1_the_sources** · pending
- **PF2_the_slots_into_a_gig** · pending
- **PF3_the_screen** · pending
- **PF0a_what_a_chat_may_claim** · decision · pending

</details>

<details>
<summary>`docs/2026-10-15-cos-app-phasemap.spec` · 17 · 7 done, 1 in progress, 9 pending</summary>

- **COSA0_shell** · decision · pending
- **COSA0b_signing** · decision · pending
- **COSA0c_update_source** · decision · pending
- **COSA1_version_store_and_import** · done
- **COSA2_runtime_and_dependencies** · done
- **COSA3_run_and_supervise** · done
- **COSA4_switch_and_rollback** · done
- **COSA5_data_root** · pending
- **COSA6_the_exe** · done
- **COSA7_clear_glass_delivers** · done
- **COSA8_other_projects** · pending
- **COSA9_idearium_sync** · pending
- **COSA10_compartment_window** · pending
- **COSA11_nested_tree** · pending
- **COSA12_vmware_window** · done
- **COSA13_auto_update** · in-progress
- **COSA14_versionium_record** · pending

</details>

<details>
<summary>`docs/2026-10-15-code-tab-run-state-phasemap.spec` · 21 · 17 done, 0 in progress, 4 pending</summary>

- **CE0_one_tab_or_two** · decision · done
- **CE0b_batching** · decision · pending
- **CV0_versioning_scope** · decision · pending
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

- **PF0_internal_vs_client_facing** · decision · pending
- **PF1_read_the_log** · pending
- **PF2_the_items** · pending
- **PF3_the_section** · pending
- **CS1_one_popup_frame** · pending
- **CS2_settings_providers_and_accounts** · pending
- **CS3_clear_glass_users_as_plugins** · pending

</details>

<details>
<summary>`docs/2026-10-15-clear-glass-network-posture-phasemap.spec` · 34 · 0 done, 4 in progress, 30 pending</summary>

- **MR7_hotkeys_scope** · decision · pending
- **MR12_p2p_scope** · decision · pending
- **MR13_finance_field** · decision · pending
- **NP0_binaries** · decision · pending
- **NP0b_default_posture** · decision · pending
- **NP1_compartment** · in-progress
- **NP2_policy_and_storage** · in-progress
- **NP3_apply_to_electron** · in-progress
- **NP4_webrtc** · pending
- **NP5_leak_test** · pending
- **NP6_settings** · pending
- **NP7_p2p** · pending
- **NP8_macro_hooks** · pending
- **NP9_sentinel_meaning** · decision · pending
- **NP9_cli_first** · in-progress
- **NP10_browser_surface** · pending
- **NP11_context_menu** · pending
- **NP12_plugin_split** · pending
- **NP13_settings_html** · pending
- **NP14_macros_and_automation** · pending
- **NP15_kill_switch** · pending
- **NP16_default_quarantine** · decision · pending
- **NP16_quarantine_pipeline** · pending
- **NP17_hold_primitive** · pending
- **NP18_freeze_plugin** · pending
- **NP0_binaries** · decision · pending
- **NP19_passphrase** · decision · pending
- **NP19_container** · pending
- **NP1_compartment** · pending
- **NP4_webrtc** · pending
- **NP5_leak_test** · pending
- **NP16_quarantine_pipeline** · pending
- **NP15_kill_switch** · pending
- **NP7_p2p** · pending

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
<summary>`docs/2026-10-15-automatic-tracking-phasemap.spec` · 12 · 3 done, 0 in progress, 9 pending</summary>

- **LA0_loom_or_architect** · decision · done
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
<summary>`docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec` · 13 · 8 done, 0 in progress, 5 pending</summary>

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
- **CT1b_reviewed** · done
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
<summary>`docs/2026-10-10-idearium-solid-phasemap.spec` · 23 · 10 done, 0 in progress, 13 pending</summary>

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
- **SD17_an_imported_project_continues** · done
- **SD18_mastermind_ready** · done
- **SD19_a_refusal_goes_back_to_its_agent** · done
- **SD20_a_starved_machine_does_not_spin** · done
- **SD21_what_his_run_log_showed** · done
- **SD22_a_wrapped_repo_lifts_to_its_root** · done

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
<summary>`docs/2026-10-01-idearium-agent-ready-master-phasemap.spec` · 58 · 22 done, 0 in progress, 36 pending</summary>

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
- **DT4b_registry_chunk_in_repo_chunking** · pending
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
- **D1_default** · decision · pending
- **D2_tabs** · decision · pending
- **D3_account_choice** · decision · pending
- **D3_decided_2026_09_23** · decision · pending

</details>

<details>
<summary>`docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec` · 21 · 1 done, 0 in progress, 20 pending</summary>

- **B1_field_ownership** · pending
- **B2_jaadb_not_single_writer** · pending
- **B3_availability_tier** · pending
- **B4_userscript_cutover** · pending
- **B5_port_3753_collision** · pending
- **B6_two_intelligence_runtimes** · pending
- **D1_field_source** · decision · pending
- **D2_cutover_policy** · decision · pending
- **D3_snapshot_ownership** · decision · pending
- **D4_names** · decision · pending
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

- **D1_canvas_authority** · decision · pending
- **D2_spec_authority** · decision · pending
- **D3_forge_home** · decision · pending
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
<summary>`docs/2026-09-11-sovereign-node-architecture-phasemap.spec` · 35 · 0 done, 0 in progress, 35 pending</summary>

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
- **P21_versionium_causal_field** · pending
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
<summary>`docs/2026-09-05-observability-sovereignty-and-agent-mesh-phasemap.spec` · 32 · 4 done, 0 in progress, 28 pending</summary>

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
- **SPEC1_rewrite_nexus_spec** · pending
- **CP1_tool_index_hooked_to_living_model** · pending
- **CP2_copilot_versionium_awareness** · pending
- **CP3_git_vs_versionium_decision** · done
- **HIST1_boundary_constraint_history_schema** · pending
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
<summary>the stores · 27 folders, each placed by an environment variable</summary>

- **CG_JAA_DIR** — default cgDir(), 'jaa' — opened by `clear-glass/src/storage/jaa.js`
- **CG_USERSCRIPTS_DIR** — default process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'userscripts' — opened by `clear-glass/src/userscripts/manager.js`
- **COPILOT_INJECTION_DIR** — default copilot/, 'data', 'nodes', 'injection' — opened by `copilot/tool-runtime.js`
- **COPILOT_WORKSET_DIR** — default copilot/lib/, '..', 'data', 'worksets' — opened by `copilot/lib/workset.js`
- **COS_DATA_ROOT** — default '' — opened by `lib/cos-bridge.js`
- **EMERGENCE_DATA_DIR** — default process.cwd(), 'data' — opened by `emergence/cli.js`
- **GIG_LEDGER_DIR** — default , 'data', 'gig-ledger' — opened by `lib/gig-ledger.js`
- **GUARDIAN_DIR** — default clear-glass/src/main/, // '../../../guardian' — opened by `clear-glass/src/main/index.js`
- **GUARDIAN_RESPONSE_NODES_DIR** — default guardian/lib/, '..', 'data', 'nodes', 'response' — opened by `guardian/lib/response-sink.js`
- **IDEARIUM_ACCESS_DIR** — default ideariumDataDir(), 'access' — opened by `idearium/lib/access.cjs`
- **INTELLIGENCE_NODES_DIR** — default intelligence/lib/, '..', 'data' — opened by `intelligence/lib/domain-nodes.js`
- **JAA_DATA_DIR** — default , 'data', 'cortex', 'memory' — opened by `cli/clear-idearium.js`, `cortex/memory/jaa-db.js`, `cortex/memory/table-compactor.js`, `lib/context-atlas.js`
- **MEMORY_STORE_DIR** — default guardian/, '..', 'data', 'cortex', 'memory' — opened by `guardian/server.js`
- **NEXUS_CLIENT_DIR** — default os.homedir(), '.nexus-client' — opened by `auth/client.js`
- **NEXUS_CODE_ARTIFACT_DIR** — default process.env.NEXUS_DATA_ || , 'data'), 'guardian', 'code-artifacts' — opened by `guardian/lib/code-artifact.js`
- **NEXUS_DATA_DIR** — default process.cwd(), 'data' — opened by `remote-desktop/bridge-os-core/bridge-node/boot.js`, `remote-desktop/bridge-os-core/index.js`
- **NEXUS_DATA_ROOT** — default clear-glass/src/mesh/, '..', '..', '..', 'data' — opened by `clear-glass/src/mesh/automation-engine.js`, `idearium/lib/data-dir.cjs`, `lib/chat-logger.js`, `lib/component-ledger.js`
- **NEXUS_INTAKE_DIR** — default cortex/core/raid/, '../../../data/intake' — opened by `cortex/core/raid/officiator.js`, `lib/intake.js`
- **NEXUS_PHASEMAP_DIR** — default , 'docs' — opened by `lib/spec-census.js`, `loom/scanners/phasemap-map.js`
- **NEXUS_SNAP_DIR** — default versionium/lib/, '..', 'data', 'snapshots' — opened by `versionium/lib/migrate-cortex-snapshots.js`, `versionium/lib/snapshot.js`
- **NEXUS_VECTOR_INDEX_DIR** — default lib/, '..', 'data', 'vector-index' — opened by `lib/vector-memory.js`
- **RAID_INPUT_DIR** — default cortex/core/raid/, '../../../data/raid/input' — opened by `cortex/core/raid/contract-intake.js`
- **RAID_OUTPUT_DIR** — default cortex/core/raid/, '../../../data/raid/output' — opened by `cortex/core/raid/contract-intake.js`
- **RAID_SYSTEMS_ROOT** — default cortex/core/raid/, '../../../' — opened by `cortex/core/raid/contract-intake.js`
- **RUN_STATE_DIR** — default lib/, '..', 'data', 'run-state' — opened by `lib/run-state.js`
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
<summary>the node types · 64</summary>

.hat · .contract · .component · .cos · .agent · .health · .model · .schema · .provider · .crystal · .ledger · .command · .gap · .pat · .macro · .tool · .node · .failure_mode · .idea · .framework · .toolbox · .job · .intent · .hook · .wire · .inject · .filetree · .repo_agent · .system · .event · .capability · .synthesis · .input · .output · .note · .hypothesis · .agent_tool · .injection · .fault · .bep_pattern · .resonance_crystal · .interstitial_space · .account_identity_index_entry · .pattern_sequence · .inject_rule · .sigma_record · .hook_contract · .component_projection · .constitution_decision · .chat_log · .tool_index_entry · .raid_contract · .debug_macro · .chunk · .response · .repository · .agent_model · .workflow · .step_gate · .run · .procedure · .phase · .graph · .gate

</details>

The ledgers. What happened is append-only: each ledger keeps its rows in order and never rewrites one. The contract ledger (`lib/work-journal.js`, 0.60.146) is one per contract, every gate's attempts, jobs and replies; a browser agent's reply text lives once, in Clear Glass's chat ledger (`clear-glass/src/downloads/chat-ledger.js`).

<details>
<summary>the ledgers and records · 16 modules</summary>

- `lib/activity-log/compartment.js`
- `lib/activity-log/index.js` — per-system activity + error logging into cortex James: "a log for each system, a full log for activity to save in cortex, like
- `lib/chat-ledger-client.js` — read Clear Glass's live chat ledgers through its own routes (0.60.192). James, 2026-10-21: "look in clearglass download manager". His 0.39.278 idea already…
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

Idearium is where work starts in NEXUS: ideas, specs, repos, their phases and builds, and the Code tab where the agents work. Everything it can do is a route on :4800, served by `idearium/api/index.js`, and every route a person uses is also a command row in `idearium/cli/route-commands.js`, so every agent can do it through the one command tool. Read from the route table itself: 416 routes, and 157 command rows. Its files, module by module, are under its own section above; what each release did to it is in the version history below.

<details>
<summary>the routes · 416, grouped by path</summary>

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
- **/api/data** — GET /home · GET /home/:system · POST /home/:system · POST /rollback
- **/api/economy** — GET / · POST / · GET /:what
- **/api/events** — GET /
- **/api/gaps** — GET / · POST / · GET /:uuid · POST /:uuid/resolve · POST /:uuid/ignore
- **/api/git** — POST /clone
- **/api/history** — GET /import · POST /import · PUT /import/upload
- **/api/ideas** — GET / · POST / · GET /:uuid/workbench · POST /:uuid/workbench/admit · POST /:uuid/workbench · GET /:uuid · PATCH /:uuid · DELETE /:uuid · POST /:uuid/tension · POST /:uuid/link · POST /:uuid/spec · POST /:uuid/phase · POST /:uuid/progress
- **/api/lattice** — POST /neighbours
- **/api/ledger** — GET /out
- **/api/my-projects** — GET /
- **/api/nexus** — GET /store · GET /tape · GET /tape/:run
- **/api/notes** — GET / · POST / · PATCH /:id
- **/api/ollama** — GET /check · POST /check/ask · GET /models
- **/api/phases** — GET /census · GET /next
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
- **/api/repos/:uuid/changelog** — GET /
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
- **/api/repos/:uuid/phases** — GET /next · GET / · GET /runs · GET /graph · GET /dag · GET /contract · GET /cost · POST /map · GET /map · POST /status · GET /closes · POST /close · POST /evidence · POST /groom · GET /nodes · POST /add · POST /build
- **/api/repos/:uuid/plan** — GET /
- **/api/repos/:uuid/procedures** — GET / · POST / · POST /from-run · POST /:id/replay · DELETE /:id
- **/api/repos/:uuid/proof** — POST / · GET /
- **/api/repos/:uuid/prove** — POST / · GET / · POST /cancel
- **/api/repos/:uuid/reindex** — POST /
- **/api/repos/:uuid/releases** — GET / · POST /
- **/api/repos/:uuid/roadmap** — GET / · POST /phase
- **/api/repos/:uuid/roadmaps** — GET / · POST /import
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
- **/api/repos/:uuid/uploads** — GET / · POST / · GET /:id · POST /:id/answer
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
<summary>the command rows · 157 (every agent has them through nexus.command)</summary>

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
- **repo dag [phase] [--map path] [--cross]** — 
- **repo changelog [--limit n] [--all]** — 
- **ledger out** — 
- **phases next [--limit n] [--group decision|deps-open|cycle|dangling|no-files|done-by-evidence|held|conflict]** — 
- **repo next [--limit n] [--group …]** — 
- **repo closes** — the phases its proven, landed runs closed by themselves (SL1), each with the run and version; reopened ones say which change was undone
- **repo close** — 
- **repo nodes** — 
- **repo groom [--apply] [--map ]** — 
- **repo evidence [--apply] [--limit n] [--map ]** — 
- **phases census [--system idearium] [--open]** — 
- **repo upload --intent "what these files are for"** — upload a zip into a repo with an intent: every file is placed against the repo (its folders, its systems, who requires what, his earlier answers)…
- **repo uploads [upload-id]** — the uploads waiting for his answer (and the answered ones), or one upload with every file's proposed place, why, its system and registry neighbours
- **repo upload-answer [--to "from=path,from=path"] [--skip "from,from"] [--no-apply]** — his answer to an upload: keep the proposed places, move files (--to), skip some (--skip); only then is anything written (text through the proposal…
- **repo map-phases [status] [--limit n] [--no-apply] [--done] [--untrusted]** — map every phase that names no files to its files (an agent, scored first on phases whose files are known) and every phase to its dependencies (from…
- **repo compile-spec [--into folder] [--template genesis|compiler|]** — lay out a .spec in the compiler's format from its template — genesis by default (the nexus-system skeleton, the spec's modules slotted in as…
- **repo plan [phase] [--map name]** — the build plan: each phase with its pieces (one per planned file: pending, running, written, failed, proven) — or one phase with every run and its log
- **repo cost [phase] [--map name]** — what each phase cost in agent calls and tokens: plan, code and review calls, local vs remote, tokens in and out (estimated), per run
- **system routing [ ]** — the build routing policy (planner, contract_build, test_first, ladder…), or set one switch: routing. =
- **system compartment [] [--apply]** — each system's COS compartment from loom's template (nexus-self-): its intent (end state: sovereign; conditions; the genesis axioms), runtime, mounts…
- **system shape []** — does each system match genesis (the skeleton cos/archetype/nexus-system): every role — entry, cli, config, compartment, registry, contract, events,…
- **system sovereign []** — which systems are sovereign (nothing they require is in another system's folder; lib/ is the kernel) and, for each that is not, what is in the way:…
- **data home [] [--apply]** — each system's own data: where it lives and what of it still waits in the root data/ (and why); with a system, each file's plan; --apply brings it…
- **data rollback** — put a bring-home's files back where they were, from the manifest it printed
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
- **repo roadmaps** — the roadmaps a project brought with it (phases.json, roadmap.json, PHASEMAP.md, ROADMAP.md), and whether each is imported as a phasemap yet
- **repo lift-root [--apply]** — a project imported inside its own folder (before 0.60.200) lifted to the repo's root, so a phase's paths (lib/title.js) are where the build looks;…
- **repo roadmap-import [] [--replace]** — import a project's own roadmap as a Nexus phasemap beside it: its ids, states, percent, what blocks what (each edge says which file it came from),…
- **repo phase-graph [--map name]** — a phase's dependency graph, the one a build is refused without: the files it changes, what they use, who uses them (what a change can break), the…
- **repo phase [build [--map name] [--provider ollama|claude-code|claude|…] [--note "…"] [--replan] [--anyway]…** — one phase: its runs (and why one stopped), or build it now as a background task (a build started again keeps its saved plan and resumes; --replan…
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
- **page [--on ] [--max n]** — the page map of a Clear Glass window: regions, forms (fields, required, submit), actions and headings as short lines, and what changed since the…
- **page find [--on ] [--fresh]** — intent → the blocks on the page to act on, ranked, each with its selector, address, centre (x,y) and why (words, kind, covered, stable here, worked…
- **page outcome ok|fail [--on ]** — tell the page map what happened when a found block was acted on — it learns for this intent on this kind of page
- **page chunks [query…] [--on ] [--max-chars n]** — the page as chunks of text by section — or only the chunks a query hits (reading, analysing, reverse engineering)
- **page scrape [--json] [--on ] [--out file]** — the whole page as markdown by section (or --json: blocks + chunks + map) — the web scraper; --out writes it to a file
- **field windows** — what the field is doing in each Clear Glass window: its last map, spotlight and pointer, and how lately the page changed
- **site [set | clear | keys]** — one site's settings for every Clear Glass feature (autofill, macros, workflows, passwords, network, resume, ClearDriver, Co-pilot, Guardian): each…
- **autofill pick [--agent ] [--profile ]** — the element picker on a field the autofill missed: he clicks the box for in the application tab; it is checked, saved for that site, and the page is…
- **autofill learn [--url ] [--agent ]** — teach the autofill a field by name: the field's label/name/id → what goes there, saved for that site
- **autofill learned []** — the fields the autofill was taught, per site (by the picker or by name): field → what goes there
- **autofill forget** — forget one taught field on one site: the next fill asks again
- **glass processes** — what is running in Clear Glass: each process with its tabs and background tabs, memory and CPU (ending one is his, in the Processes window)
- **glass activity [--kind nav|bgtab|driver|macro|workflow|download|error|process] [--origin https://site]…** — what just happened in Clear Glass, newest first: pages loaded, background tabs, the driver, macros, workflows, downloads, errors
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
- **adblock on|off|update [id|all]|import [--title T]|remove |allow |disallow |check [page]|rules "">** — 
- **firefox ]>** — 
- **net [--via transport|direct|block] [--list name]|unlist |resolve |add --via V [--provider p] [--url pattern]…** — 

</details>


### Every release, in his words

Every release note in the tree, 437 of them, newest first. Each opens with James's own words: what he asked, as he wrote it, his spelling kept. Then what was built, from the note's own section headings. The note itself is the file named, at the top of the tree. Releases are grouped by series; each series opens to its releases.

<details>
<summary>0.60.x · 229 releases · 0.60.0. to 0.60.233.</summary>

- **0.60.233.** — 2026-10-24 — the SL line merged into main, additively — James: "merge and push" — built: What was checked · What the merge needed · What the branch broke, found before merging (§0.1), and fixed here
- **0.60.232.** — 2026-10-24 — JA5: the pick is also a macro and an automation node — James: "merge and push. yes make the macro too." — built: What it does · On screen · Reuse (§8.6)
- **0.60.231.** — 2026-10-24 — JA4: the learn-loop on screen — James: "continue" — built: What was missing · On screen (Settings › Autofill) · Built (backend → API route → command/agent → UI, his order 2026-10-07)
- **0.60.230.** — 2026-10-24 — JA3: the element picker on a field the autofill missed — James: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per site settings, and as a macro…" — built: What was missing · Reuse before build (§8.6) · Built (backend → API route → command/agent, his order 2026-10-07)
- **0.60.229.** — 2026-10-23 — James: "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the repsective systems, or sort…" — built: Built · Found and fixed on the way, measured · To confirm with you
- **0.60.228.** — 2026-10-23 — James: "agent needs to map dependancies if nexus cant map one." — built: Why · Built · Found, said
- **0.60.227.** — 2026-10-23 — James: "need to do something about the dependancy graph." — built: What was wrong, measured first, each traced to its root · Built · Not done, said
- **0.60.226.** — 2026-10-23 — JA2: the picked field is saved per site, and the fill path reads it back — James: "then the phases with the per site settings." — built: What was missing · Reuse before build (§8.6) · Built (backend → API route → command/agent, his order 2026-10-07)
- **0.60.225.** — 2026-10-23 — JA1: the job-application autofill learns per site — James: "confused" — built: Verified first (§0.1, evidence over memory) · The real gap, and the fix (JA1) · Why (traced, §0.1)
- **0.60.224.** — 2026-10-23 — James: "next" — built: Why · Built (SL2) · The first dry run over Nexus (nothing written)
- **0.60.223.** — 2026-10-23 — James: "contiue getting idearium building phases" — built: Why · Built (SL1) · Drift from the spec, decided by the axioms
- **0.60.222.** — 2026-10-23 — James: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of them, we need this to work so…" — built: Why this first · Spec first (his 2026-10-20 rule) · Built (SL0)
- **0.60.221.** — 2026-10-23 — built: What he brought · Found · Built (SD17b)
- **0.60.220.** — the Processes window (SP6) — James: "Also need a processes screen for background tabs and activity." — built: What stands on what · Built
- **0.60.219.** — what is running, and what just happened (SP5) — James: "Also need a processes screen for background tabs and activity." — built: What stands on what · Built · Found on the way, closed by his axioms
- **0.60.218.** — ClearDriver, Agent Mesh and Guardian settings (SP4) — James: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state. Cleardriver, agentmesh and…" — built: What stands on what · Built · Not done, said
- **0.60.217.** — the Site Settings screens, by feature (SP3) — James: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state. Cleardriver, agentmesh and…" — built: What stands on what · The toolbar's Site Settings popup · Settings › Sites
- **0.60.216.** — each feature reads its site value (SP2) — James: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state. Cleardriver, agentmesh and…" — built: What stands on what · Each feature, at the point it decides · Readings to confirm
- **0.60.215.** — one site's settings for every feature (SP1) — James: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state. Cleardriver, agentmesh and…" — built: What stands on what · Built · Not yet
- **0.60.214.** — the agents hub's tools leave the ☰ menu — built: Why they were back · Now · Also
- **0.60.213.** — no second box inside the start page's search
- **0.60.212.** — Loom, Copilot and Intelligence hold their own files (DL3) — James: "then resume data migratino" — built: What moved · Architect
- **0.60.211.** — zoom controls on the toolbar; the start page's agents load reliably — James: "can you integrate that into clearglass, its a basic funcaiton of any browser." — built: Zoom · The start page's agents
- **0.60.210.** — the ☰ menu's Tools and Customize toolbar, rebuilt — built: Why they looked cheap · What was rebuilt · Found on the way
- **0.60.209.** — six more systems hold their own files (DL3) — James: "continue" — built: What moved · Found by running the tests one by one
- **0.60.208.** — Guardian holds its own data (SS1, DL3 for Guardian) — James: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system responsible for it's own…" — built: Guardian no longer writes into Cortex's store · Guardian's paths go through the data-home module · Not yet
- **0.60.207.** — each system brings its own data home (DL2) — James: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system responsible for it's own…" — built: The phases that migrate data · What was built · What it means today
- **0.60.206.** — a wrapped repo lifts to its root (SD22) — James: "the agent button does nothing in the code tab.. aloso the ui for clearglass is cut off." — built: What was broken · The fix · The two screen faults from the same screenshots
- **0.60.205.** — what his run log showed (SD21) — built: The six fixes · Not fixed yet
- **0.60.204.** — a ChatGPT sign-in popup stays open — James: "also fix chatgpt. i can't login. i click login and it pops up for a second and dissapears" — built: What was happening (read from the code; his run confirms it) · What changed (clear-glass/src/providers/attention.js 1.4.0) · If it still closes
- **0.60.203.** — a starved machine does not spin — built: What his run log showed · What changed · Not changed, said
- **0.60.202.** — a refused proposal goes back to its agent with the failing test — James: "need a retry or automatically ask for the fix if possible, or a tool or something" — built: What his screenshots showed · What changed · Found, not changed
- **0.60.201.** — for any project: a busy Idearium is said plainly, and any project's tests can run — built: What his log showed · What changed, for every project · Not yet for any project
- **0.60.200.** — what Idearium needed to work on MASTERMIND — James: "i just want you to add what idearium needs to work on mastermind." — built: How the list was made · What the run found, and what changed · Where MASTERMIND stands now (the real run)
- **0.60.199.** — an imported project continues from its own roadmap — built: Context · What was built (SD17, docs/2026-10-10-idearium-solid-phasemap.spec) · MASTERMIND's real roadmap, run through the importer
- **0.60.198.** — a build stands on the registry: spine, event bus, interaction contract, component registry — James: "yes, the registry should be the spine, event bus, interaction contract, and component registry." — built: Context · What was found (read from the code) · What changed
- **0.60.197.** — the snapshot names the component registry — James: "shouldn't that be the component registry. architecture tab" — built: Context · What was found · What changed
- **0.60.196.** — an upload that outran its wait closes and indexes; a build indexes a repo instead of refusing it — James: "now its not working, i clicked the phases to build it and got: ... the import project ui needs to close when it's complete." — built: What happened · What changed · On his machine
- **0.60.195.** — 2026-10-21 — Why SP5 never landed: the file that worked was called missing — James: "okay bvut did it not capture response from chatgtp." — built: Did it capture ChatGPT's response? No · The proposal "by chatgpt" was Gemini's · Why nothing fixed SP5 — the real cause
- **0.60.194.** — 2026-10-21 — SP5's title.js: four reasons it kept failing, and what was fixed — James: "its having so much issue with the title.js. nothing has fixed it. sp_5." — built: 1. ChatGPT changed its chat URLs (the "all of a sudden") — fixed · 2. A junk test file from before the fix was blocking Apply — fixed · 3. The proposed title.js really is wrong — the gate was right
- **0.60.193.** — 2026-10-21 — The Home tab shows the atlas again — built: Cause · Fix · Measured
- **0.60.192.** — 2026-10-21 — Your download manager already kept the stream; now the fallback reads it — James: "look in clearglass download manager" — built: What I got wrong in 0.60.191 · What's built in its place · Found on the way
- **0.60.191.** — 2026-10-21 — What you watched being written is kept: the stream as a fallback route — James: "each system will use its own component registry." — built: The stream as a fallback route · Each system uses its own component registry · Your Idearium tabs
- **0.60.190.** — 2026-10-21 — An approved change, connected end to end — James: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log when approved. what about…" — built: What already held, and what didn't · What's built (decided by your axioms: one record, §7.6 and §0.3) · Measured
- **0.60.189.** — 2026-10-21 — Every run says who started it — James: "It built 5 phases in a row. I think I see what you mean but there are way more idearium phases than that." — built: The trace · Built: RC7 · Measured
- **0.60.188.** — 2026-10-21 — The census: every Idearium phase judged against its evidence — James: "Follow the axioms in docs. Use them as law, and for every decision. It built 5 phases in a row. I think I see what you mean but there are…" — built: The census (CNS1) · How the evidence rules got strict · Found and fixed at the cause (§1.2)
- **0.60.187.** — 2026-10-21 — The pipeline's two open root causes, found and fixed at the cause — James: "Now back to the pipeline workflow and automation in idearium. Look at the phases for idearium and the pipeline." — built: RC5 — where "Gemini said" got into file paths · RC6 — the Ollama job with no owner, every ~90 s · Measured
- **0.60.186.** — 2026-10-21 — Websites use the password manager; a login belongs to the account the cookie vault keeps — James: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses." — built: Found · Reading (to confirm) · Built
- **0.60.185.** — 2026-10-21 — One ☰ menu, Firefox's menus for the UI, the menu at the page's own point, bookmarks by the site's account — James: "bookmarks are meant to be able to link to the accoubt being used for the relative site not the providers. and remove the bookmarks from…" — built: Readings (to confirm) · Built · Measured
- **0.60.184.** — 2026-10-21 — Your own lists: the ad blocker and Snowflake import files, folders and host lists — James: "Needs filters. you'll be able to import folders and host lists. Same with the Snowflake plugin." — built: Reading (to confirm) · Built · Measured
- **0.60.183.** — 2026-10-21 — A full ad blocker, plugin pages, zoom in the core, a right-click menu at the mouse — built: Found · Built · Measured
- **0.60.182.** — 2026-10-21 — Co-pilot decides what to look at — James: "can you have the dom, cookies, and picks buttons migrated into copilot so he does it automatically when he needs it." — built: Found · Built (BS12) · Measured
- **0.60.181.** — 2026-10-21 — the co-pilot pane is just Co-pilot — built: Changed · Measured
- **0.60.180.** — 2026-10-21 — the window designed properly, Guardian's agents in one place, the bridge set up by itself — built: What was wrong (the coder's read of the 0.60.179 shots) · Also found: a bug the redesign itself introduced, fixed before release · Built
- **0.60.179.** — 2026-10-21 — Snowflake downloads with kill on disconnect, a real Firefox import, the window rebuilt like Firefox, a floating CLI no… — James: "add magnet link handling, download manage for the compartment. kill on disconnect." — built: Found before building · Readings (to confirm) · Specced (his rule: spec, then phases, then each phase specced again)
- **0.60.178.** — 2026-10-21 — Snowflake working end to end: the page inside the compartment — built: Root causes (read in the source before anything was built) · Readings (to confirm) · Specced (his rule: spec, then phases, then each phase specced again)
- **0.60.177.** — 2026-10-21 — the data layout specced, and a clear-up tool that moves state safely — James: "need all data in the data folder migrated to each relative system" — built: Specced (his rule: spec, then phases, then each phase specced again) · Built: DL0 and DL1, lib/data-clearup.js · Measured
- **0.60.176.** — 2026-10-20 — full specs first, then phases, then each phase specced again — James: "not phasemaps. full specs to build them. everything needs to be speccced before built,so it can be rebuilt if lost. can you do that? what…" — built: What it stands on (§8.6) · Built · Fixed (specced first)
- **0.60.175.** — 2026-10-19 — the page map in the co-pilot's hands, felt by Ollama through Nerve, live, with a panel — James: "interaction field, nexus nerve, hooking ollama in to feel with" — built: What it stands on (§8.6) · Built · Not proven
- **0.60.174.** — 2026-10-19 — the page as blocks, chunks and a map that learns — James: "like i need copilot to use clearglass more effectively. parse the dom, index each element as blocks, then download into a index to chunk,…" — built: What it stands on (§8.6) · Built · Not proven
- **0.60.173.** — 2026-10-19 — upload a zip with an intent: placed against the repo, asked of him, written only by his answer — James: "i want to be able to upload files to idearium repos. upload zip with an intent, have it map to nexus using a tool, then ask me with the…" — built: What it stands on (§8.6) · Built · Found on the way
- **0.60.172.** — 2026-10-19 — every phase sits in one checked DAG — James: "okay all of the idearium phases. every phasemap phase needs extensive dag, that needs to start being standard." — built: Built · Nexus's own maps, as it reads them · Not proven
- **0.60.171.** — 2026-10-19 — verify first: a file that already works is not rebuilt; Gemini first, briefed the way it asked — James: "need verify first, and everything else to solidify the pipeline. prioritize gemini, since clearglass doesn't break terms. need to specify…" — built: What his log showed · Built · Not proven
- **0.60.170.** — 2026-10-19 — the pipeline's root causes: a watcher can no longer kill a kernel, the node scan is linear, node and agent file names stay… — James: "we need to fix the pipeline though. like i said." — built: What his log showed, and the cause found in the code · The fix · Not proven
- **0.60.168.** — 2026-10-19 — the repo desktop: a failed WHPX launch no longer drops straight to a desktop too slow to steer; the way in by terminal is shown — James: "can you fix the cos envirement? i can't control it or access it. idearium. look at the spec in the idearium folder called genesis, and…" — built: What the screenshot and the code show · The fix · Not proven
- **0.60.167.** — 2026-10-19 — a phase that is already done no longer loops forever on test-first — James: "been stuck on that phase for hours." — built: The cause · The fix
- **0.60.166.** — 2026-10-19 — CT1: COS is the gate's test environment — James: "then we need cos to work for test env." — built: Why · The door · Next
- **0.60.165.** — 2026-10-19 — AB1 (economy-resume): a rate-limit hold waits and retries, it no longer cancels — James: "fix the economy time out also like retries when the time runs out." — built: The cause · The fix — resume the all-transient case (reuse, no new scheduler) · Safety (the critical part)
- **0.60.164.** — 2026-10-19 — CR1: the project's component registry (the spine) — James: "the component registry is vital for each project becuase its the spine that makes components dumb." — built: The gap · The fix — every built file joins the spine · Reuse, not new (§8.6)
- **0.60.163.** — 2026-10-19 — MF1: model-fit routing (the solid foundation, brick 1) — James: "yes, get this solid. learn, and know what for what, limits, contraints, dynamic chunking, etc. memory, everything that can get it working." — built: The problem · The fix — leave off what can't fit, up front · Reuse, not new (§8.6)
- **0.60.162.** — 2026-10-19 — James: "look at the most recent phases. gates, dag per contract, phase, spec, chunk. need to get the pipeline working." — built: The red error · The cause · The fix — each phase names its files (so the graph is real)
- **0.60.161.** — 2026-10-19 — James: "need help with the autofill for fiverr." — built: The cause · GA1: one deterministic door for the co-pilot · GA1a: the panel and the co-pilot fill the same gig
- **0.60.160.** — 2026-10-18 — James: "can you add snowflake to the ui. it doesn't show up as a plugin." — built: Why it isn't a plugin · New section: Settings → Network · Note (for a later pass, his security question)
- **0.60.159.** — 2026-10-18 (mapped) — James: "Feature in So with the file section in the code tab in Idearium, there needs to be a simulated environment, a file tree for the…" — built: What already exists · The map · Decided by his axioms
- **0.60.158.** — 2026-10-18 — James: "Need to get the gates solid." — built: The gate machinery: six holes, each proven on the code, then closed · Every gate-related test, run alone · Two more fixes the re-run found
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
