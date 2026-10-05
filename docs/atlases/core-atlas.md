# core — everything no kernel owns

> **status: mapped (0.39.264)** · no port, no entry · the shared code, the fabric, the Compartment OS, the command line, the docs and the tests · a module of `nexus`, back up one level in `nexus-atlas.md`

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

`core` is the fourteenth system, defined by exclusion in `lib/nexus-self/systems.js`: every file whose top-level directory is not one of the thirteen kernels belongs to core. That makes it the largest system by far, and also the least like the others. It has no process of its own. Its libraries run inside whichever kernel requires them, its documents describe every system, and its tests check every system. When Idearium shows NEXUS as a repo with nested system repos, `core` is the one holding `lib/`, `cos/`, `cli/`, `warp/`, `siso/`, `docs/`, `tests/` and the rest.

Because core has no port, "running core" means running something that uses it: `lib/cos-run.js` runs a core change in a full-tree workspace, and its tests are found by what they require, not by where they sit.

---

## File Structure

```
nexus/
  lib/                shared libraries — agents, ledgers, registries, diagnosis, COS glue, NEXUS-as-a-repo
  cos/                the Compartment OS — compartments, archetypes, branches, runtimes, vault, test VM
  cli/                the nexus command line and maintenance tools
  nexus/              autopilot, the event bus, query and connect layers
  warp/               the five-primitive event spine
  siso/               single input, single output — Event, Gate, Stream, StreamLog
  jaa/                the JAA table schema
  contracts/          the NEXUS interaction contract and contract node types
  hooks/              per-system hook declarations
  seams/              seam contracts and the port table
  auth/               sovereign authentication
  security/           the signed signaling envelope
  meta/               domain-agnostic measurement
  mesh/               networking daemons ported from BrainOS
  remote-desktop/     remote desktop host, viewer and bridge-os-core
  emerge/             the .eg DSL runtime and the spec compiler
  erosmancer/         ErosmancerOS — CDP browser automation
  cockpit/            the forge IDE spec and core
  nexus-healer/       healer proposals
  architecture-spec/  the scaffold every new system is built on
  service/            ICO kernel service wrappers
  sentinel/           the sentinel's interaction contract
  scripts/            verification and release scripts
  skills/             session skills
  tablet/             the tablet homepage and 3D map
  ui/                 the UI shells
  docs/               the written record
  tests/              the proof
```

---

## lib/ — the shared libraries

Three hundred and seventy-five files, grouped here by what they are for.

### Agents and the tool loop

How an agent is chosen, dressed and equipped. `lib/agent-router.js` routes a request to an agent; `lib/agent-identity.js`, `lib/agent-model.js` and `lib/agent-capability.js` describe one. The repo agent Idearium's Agent tab talks to is `lib/repo-agent.js`, wearing its repo's hat (`lib/repo-hat.js`, `lib/repo-hat-memory.js`), sent exactly the blocks `lib/repo-prompt-blocks.js` composes, with context from `lib/repo-context.js` and .inject nodes from `lib/repo-inject.js`. Tools are registered in `lib/agent-tools/`: `lib/agent-tools/index.js` is the registry, `lib/agent-tools/tool-catalog.js` groups every tool, `lib/agent-tools/tool-root.js` decides whose files a tool reads, and `lib/agent-tools/tool-guide.js` explains them to a model. `lib/agent-system/` holds the agent contracts and submission, and `lib/agent-council.js` and `lib/roundtable.js` let several agents weigh in.

### Ledgers and events

Every system writes its own ledger through `lib/ledger-writer.js`; `lib/ledger-fanin/` joins them into one stream consumers subscribe to once, and `lib/ledger-fanin/boot.js` wires that at boot. `lib/event-types.js` registers event types, `lib/ledger-tail.js` and `lib/ledger-sse.js` read and stream ledgers, `lib/activity-log/` persists activity, `lib/error-log.js` and `lib/fault-log.js` record what went wrong, and `lib/chat-logger.js` keeps conversation logs.

### The registries

`lib/component-registry.js` records every component a system registers, with the component ledger in `lib/component-ledger.js`. `lib/capability-registry.js` is what NEXUS can do, `lib/hook-registry.js` and `lib/hook-sync-from-component-registry.js` the hooks, `lib/schema-registry.js` the schemas, `lib/consumer-registry.js` who consumes what, `lib/system-registry.js` the systems, and `lib/tool-index.js` the living index of tools with their real usage.

### Diagnosis and healing

`lib/diagnostic-engines.js` and `lib/diag-engines/` are the diagnostic engines `cli/diagnose.js` runs; `lib/diagnostic-causal.js`, `lib/diagnostic-report.js` and `lib/diagnostic-contract.js` explain and report. `lib/gap-field.js`, `lib/gap-priority.js` and `lib/gap-relay.js` find, rank and relay gaps. `lib/autonomous-repair.js`, `lib/integrity-revert.js`, `lib/safe-apply.js` and `lib/file-integrity.js` are the repair side, and `lib/heartbeat.js` and `lib/resource-monitor.js` watch liveness and memory pressure.

### COS glue

`lib/cos-bridge.js` is how NEXUS reaches COS compartments, `lib/cos-run.js` is the Run menu (every way a repo can be run, and why an option is unavailable), `lib/repo-run.js` runs a repo in its compartment through the test environment, `lib/compartment-engine.js` and `lib/project-compartment.js` tie projects to compartments, and `lib/file-tree-plan.js` plans a new repo's files layer by layer.

### NEXUS as a repo

`lib/nexus-self/` is what lets Idearium manage NEXUS from inside NEXUS. `lib/nexus-self/systems.js` decides which system owns each file; `lib/nexus-self/store.js` is the immutable base, content-addressed blobs and append-only snapshots; `lib/nexus-self/branch.js` is an edit branch of one system, a real COS branch; and `lib/nexus-self/apply.js` is the only path from a branch back into the live tree.

### Rules every test lives under

`lib/test-sandbox.js` gives every suite a throwaway data root so no test writes to the tree, and `lib/version.js` is the single source of every version number, with a dated entry per release.

---

## cos/ — the Compartment OS

Isolated sandboxes with their own process, network and runtime boundary, persistent state on disk and real snapshots. Its spec is `cos/spec/cos.spec`, beside the design document `cos/spec/cos-design-v1.7.0.md`, which describes COS in Rust terms while the code is Node; the spec records that boundary rather than hiding it.

### Compartments and archetypes

`cos/kernel.js` and `cos/manager.js` run compartments. What a compartment can be is an archetype: `cos/archetype/registry.js` holds all sixteen (web server, API server, worker, scheduler, sandbox browser, compiler, test runner, database, job queue, file processor, containment, exe runner, AI agent, reverse proxy, scratch, blank), and `cos/archetype/detector.js` guesses one from a folder. A blueprint is several roles at once (`cos/blueprint/registry.js`). The foundation in `cos/foundation/` defines the enums, types, axioms, file-system layer and snapshot engine (`cos/foundation/snapshot.js`) everything else is built on, and `cos/host/` runs the host side with its event bus and state store.

### Branches, playgrounds and runtimes

`cos/playground/branch.js` forks a compartment's files into a branch that can be run and compared (`cos/playground/compare.js`), and `cos/playground/sandbox.js` runs a command in one with a clean environment and a watchdog. `cos/playgrounds/` adds copy-on-write file systems and a simulated network. `cos/runtime/run.js` runs JavaScript with ports shifted and network isolated, and checks syntax and dependencies without running anything. `cos/watchdog/` watches resource use.

### Virtual machines and the test environment

`cos/compartment/qemu-runtime.js` gives a compartment a hardware-virtualized guest: an ephemeral overlay of a golden base image or a persistent disk, network off by default, QMP control, and a guest-agent channel (`cos/compartment/guest-agent.js`). `cos/testenv/` builds a test environment for any repo on it. `cos/testenv/detect.js` reads a repo's manifests and decides how it is installed and tested (npm test, pytest, go test, cargo test, rspec, phpunit, make test, or its test files by every common name). `cos/testenv/index.js` runs that plan in the VM: the repo goes in as a read-only tar disk written by `cos/testenv/tar.js`, the install runs online, then the network is cut over QMP and the cut is proven from inside the guest before any test runs. `cos/testenv/host.js` finds QEMU even when a fresh install is not on the PATH, and `cos/testenv/provision.js` makes the base image in JavaScript from a Debian cloud image; `cos/testenv/setup-vm.bat` and `cos/testenv/setup-vm.sh` do the whole setup in one command, and `cos/testenv/setup-job.js` runs it from Idearium's Run menu.

### The vault

`cos/vault/` is COS's encrypted store with an audit log (`cos/vault/audit-log.js`), and `cos/vaultd/server.js` is an optional daemon for it. `cos/plugin/` installs and runs COS plugins, and `cos/cli/` is COS's own command line.

---

## cli/ — the command line

`cli/nexus-cli.js` is the grammar-driven command line (the grammar comes from every system's registered components), `cli/nexus-repl.js` the interactive shell, and `cli/nexus.js` the entry. `cli/boot-systems.js` is the ordered boot the orchestrator used before autopilot, `cli/diagnose.js` runs every diagnostic engine against one system's ledger, and `cli/sentinel.js` is the sentinel. The maintenance tools clean and check the data: `cli/data-audit.js`, `cli/find-orphans.js`, `cli/purge-pollution.js`, `cli/dedup.js`, `cli/semantic-dedup.js`, `cli/compact.js`, `cli/clear-idearium.js`. Its spec is `cli/spec/cli.spec`.

---

## The fabric: nexus/, warp/, siso/, jaa/

`nexus/autopilot.js` starts every kernel in dependency phases and supervises them, restarting with backoff. `nexus/nexus-bus.js` is the common event fabric, `nexus/nexus-query.js` one query interface over every system, and `nexus/nexus-connect.js` the cross-system call, with a UUID on every call and every failure loud.

`siso/` is the pattern: one input, one output, state in the data structure, transformation as events (`siso/Gate.js`, `siso/Stream.js`, `siso/StreamLog.js`, spec `siso/spec/siso.spec`), credited to Jonathan Bailey. `warp/` is the standalone devkit that hardens it: five primitives in `warp/core/` (Event, Gate, Stream, StreamLog, Axiom), and dispatch with canonical digests, a delta cache, cascades and pre-generation in `warp/dispatch/`. Its spec, `warp/spec/warp.spec`, keeps the dependency one way: NEXUS imports WARP, never the reverse. `jaa/schema.sql` and `jaa/schema-full.sql` define the JAA tables every row of state lives in.

---

## Declared connections: contracts/, hooks/, seams/

`contracts/nexus-interaction-contract.js` is the one table of every endpoint, port, SSE event and command, and `contracts/nodes/` holds the contract node types: axioms, bottlenecks, causal physics, deltas, edges, events, faults, gaps, ledgers, self-awareness, systems and verification contracts. `hooks/index.js` is the living hook registry, read before any system boots, with one declaration file per system (`hooks/cortex.hooks.js`, `hooks/guardian.hooks.js`, `hooks/idearium.hooks.js` and the rest) and `hooks/side-effect-parser.js` to find side effects a hook did not declare. `seams/seam-contracts.js` declares every seam and holds the port table.

---

## Trust: auth/, security/

`auth/index.js` is the sovereign authentication layer: each client has an RSA keypair and signs its requests, and `auth/policy.json` says who may do what; `auth/client.js` is the caller's side. `security/signaling-envelope.js` signs the remote-desktop signaling channel so a replayed or hijacked session is refused, closing two items in `remote-desktop/remote-desktop.spec`.

---

## Measurement: meta/

`meta/index.js` gathers modules that measure, detect, classify and score without knowing what NEXUS is, so any system can use them over their API. `meta/confidence.js` scores confidence, and `meta/crystal-lattice.js` is crystallization and the lattice: patterns that keep holding are promoted, and ones that fail are demoted.

---

## Adjacent systems

`mesh/` holds networking daemons ported from BrainOS and kept optional: DNS, dynamic DNS, a reverse proxy and a firewall (`mesh/lib/dns-server.js`, `mesh/lib/ddns.js`, `mesh/lib/reverse-proxy.js`, `mesh/lib/firewall.js`), started by `mesh/daemons.js`.

`remote-desktop/` controls another machine: a host page (`remote-desktop/host.html`), a viewer (`remote-desktop/viewer.html`), input authorization and injection (`remote-desktop/input-auth.js`, `remote-desktop/input-injector.js`), signaling (`remote-desktop/signal.js`), an Electron bridge (`remote-desktop/bridge-electron/main.js`) and the vendored `remote-desktop/bridge-os-core/` for identity and keys. `remote-desktop/remote-desktop.spec` orders its build as a bottom-up phasemap.

`emerge/` reads .eg files, a declarative language: tokenizer, a parser gated on signal-to-noise, kernel and emitter (`emerge/emerge-kernel.js`), code generation through Ollama for the gaps (`emerge/emerge-codegen-v2.js`), and the spec compiler in `emerge/compiler/` whose T0 to T3 pipeline queries cortex first (`emerge/cortex-query/`). Its specs are `emerge/spec/emerge.spec` and `emerge/SPEC_COMPILER.spec`.

`erosmancer/erosmancer-os/` is ErosmancerOS, a TypeScript engine that drives a browser over the Chrome DevTools Protocol: behavior profiles for human-like input, routing, hostile-page detection, replay and adaptive memory, served on port 7432 by `erosmancer/erosmancer-os/src/api/server.ts`. Since 0.39.264 Clear Glass starts it with itself and connects it to its own DevTools port (`clear-glass/src/eros/supervisor.js`). Its spec is `erosmancer/spec/erosmancer.spec`.

`cockpit/cockpit.spec` is the forge IDE's full specification, with its core in `cockpit/core.js` and its pipeline in `cockpit/pipeline.js`. `nexus-healer/` is a system scaffolded by loom's generator (`nexus-healer/api/index.js`) that holds healer proposals, with its spec in `nexus-healer/docs/nexus-healer.spec.md`.

`architecture-spec/` is the base a new sovereign system is built on before it has features: components, hooks and wires compiled into a lattice (`architecture-spec/registry/lattice.js`), a watcher per node type (`architecture-spec/registry/watcher.js`), friction (`architecture-spec/registry/friction.js`), decomposition (`architecture-spec/registry/decompose.js`), phases (`architecture-spec/registry/phases.js`), and the atlas tools (`architecture-spec/registry/create-atlas.js`, `architecture-spec/registry/edit-atlas.js`, `architecture-spec/registry/nexus-atlas-aggregate.js`). Its own atlas is `architecture-spec-atlas.md`.

---

## Operations: service/, sentinel/, scripts/, skills/, tablet/

`service/guardian-service.js` and `service/idearium-service.js` boot a kernel as a supervised ICO service with every lifecycle event in its ledger. `sentinel/interaction-contract.json` is the sentinel's contract. `scripts/` holds release and verification tools: `scripts/verify-boot.js`, `scripts/verify-wires.js`, `scripts/precommit-check.js`, `scripts/run-verification-manifest.cjs`, `scripts/bump-version.py`. `skills/` holds session skills (`skills/nexus-session-changelog/SKILL.md`, `skills/james-brooks/SKILL.md`). `tablet/` is the tablet homepage (`tablet/index.html`) and its 3D map (`tablet/map3d.html`).

---

## ui/ — the shells

The home shell (`ui/home/index.html`, its structure written down in `ui/home/STRUCTURE.md`), the TV shell (`ui/tv-shell/`), BrainOS and its floating panel (`ui/brainos/`, `ui/brainos-float/`), the control panel (`ui/control-panel/index.html`), the Eravos canvas Idearium embeds (`ui/eravos/index.html`), the provider agents' pages (`ui/agents/`), the pipeline tutorial (`ui/pipeline-tutorial.js`), and shared code (`ui/api.js`, `ui/ports.js`, `ui/pulse.js`, `ui/store.js`). The orchestrator serves each shell under /ui/.

---

## docs/ — the written record

The law: `docs/AXIOMS-v3.1.md` and its predecessors, the working agreement `docs/CLAUDE.md`, and `docs/SESSION-PROTOCOL.md`. The registry of specs: `docs/SPEC-REGISTRY.spec`. The maps: dated phasemaps, one per piece of work, this release's being `docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec`. The handoffs between sessions, the latest `docs/2026-09-26b-handoff.md`. The changelog, `docs/CHANGELOG.md`. The atlases, in `docs/atlases/`. And the older system maps and decisions, kept because nothing is lost (`docs/SYSTEM-MAP.md`, `docs/NEXUS-INTEGRATION-MAP.md`, `docs/WIRES.md`).

---

## tests/ — the proof

`tests/modules/` holds one suite per component, run in order by `tests/modules/run-all.js`; a suite is registered there or it does not run. `tests/brutal.test.js`, `tests/kernel.test.js`, `tests/full.test.js` and `tests/integration.test.js` are the whole-system suites. `tests/probe/` drives real pages in a real browser, and `tests/helpers/` holds shared fixtures: `tests/helpers/cos-mini-guest.js` assembles a real Linux guest from the host's own kernel so the COS VM is proven with a real boot, and `tests/helpers/clear-glass-ncp-provider.js` stands in for a provider tab. Every suite runs under `lib/test-sandbox.js`.

---

## Version History

| release | what changed here |
|---|---|
| 0.39.261 | core became its own system repo in Idearium, defined by exclusion in `lib/nexus-self/systems.js` |
| 0.39.264 | this atlas written; `cos/testenv/` grew the VM test environment for any repo; ErosmancerOS starts with Clear Glass |

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**2093** files · **1422** code files · **14** registry components declared here · **350** events emitted · **125** heard · **14** routes · **156** code files with a covering test

### Routes (14)

- GET /api/files — File browser for spec loading · declared in `emerge/registry-components.js`
- GET /api/models — Available Ollama models for compilation · declared in `emerge/registry-components.js`
- GET /api/seams — Active SEAM sessions for current file · declared in `emerge/registry-components.js`
- GET /proposals — List all proposals and their current status. · declared in `nexus-healer/registry-components.js`
- GET /status — Emerge IDE health · declared in `emerge/registry-components.js`
- POST /api/check — Pre-compile spec validation · declared in `emerge/registry-components.js`
- POST /api/codegen — Code generation from spec fragment · declared in `emerge/registry-components.js`
- POST /api/hot-load — Hot-patch a running module (QUARANTINE→PROVE→INTEGRATE→MONITOR) · declared in `emerge/registry-components.js`
- POST /api/snapshot — Snapshot before applying patch · declared in `emerge/registry-components.js`
- POST /compile — Compile .emerge spec → T0/T1/T2 pipeline · declared in `emerge/registry-components.js`
- POST /proposals — Record a proposed self-improvement. · declared in `nexus-healer/registry-components.js`
- POST /proposals/:id/archive — Mark a proposal as rejected. · declared in `nexus-healer/registry-components.js`
- POST /proposals/:id/evaluate — Generate a real patch via forge (RAID-routed) for the given targetFile, run against the isolated evaluation pipeline. · declared in `nexus-healer/registry-components.js`
- POST /proposals/:id/merge — Deliberate, explicit commit. · declared in `nexus-healer/registry-components.js`

### Events it emits (350) — and who hears them

- **pad:trigger** — from `ui/eravos/organisms/pads/pads.engine.js` → `eravos/ui/mods/acid-synth/acid-synth.engine.js` (eravos), `eravos/ui/mods/reese-bass/reese-bass.engine.js` (eravos), `eravos/ui/mods/sequencer/sequencer.engine.js` (eravos), `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` (eravos) +8
- **intake:file** — from `ui/eravos/kernel/intake.js`, `ui/eravos/organisms/timeline/timeline.engine.js` +1 → `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js` (eravos), `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` (eravos), `eravos/ui/mods/sample-player/sample-player.engine.js` (eravos), `eravos/ui/mods/timeline/timeline.engine.js` (eravos) +4
- **kernel:bpm-change** — from `ui/eravos/kernel/kernel.js`, `ui/eravos/runtime/master-transport.js` → `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js` (eravos), `eravos/ui/mods/sequencer/sequencer.engine.js` (eravos), `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/organisms/bass-drop-builder/bass-drop-builder.engine.js` +2
- **seq:play** — from `ui/eravos/organisms/sequencer/sequencer.engine.js`, `ui/eravos/organisms/timeline/timeline.engine.js` +1 → `eravos/ui/mods/sequencer/sequencer.engine.js` (eravos), `eravos/ui/mods/timeline/timeline.engine.js` (eravos), `ui/eravos/organisms/sequencer/sequencer.engine.js`, `ui/eravos/organisms/timeline/timeline.engine.js`
- **seq:stop** — from `ui/eravos/organisms/sequencer/sequencer.engine.js`, `ui/eravos/organisms/timeline/timeline.engine.js` +1 → `eravos/ui/mods/sequencer/sequencer.engine.js` (eravos), `eravos/ui/mods/timeline/timeline.engine.js` (eravos), `ui/eravos/organisms/sequencer/sequencer.engine.js`, `ui/eravos/organisms/timeline/timeline.engine.js`
- **transport:play** — from `ui/eravos/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js` (eravos), `eravos/ui/mods/timeline/timeline.engine.js` (eravos), `ui/eravos/organisms/nexus-shared/nexus-node-core.js`, `ui/eravos/organisms/timeline/timeline.engine.js`
- **guardian.ncp.sync_result** — from `tests/modules/test-chat-sync-agent-routing.test.js` → `guardian/lib/chat-sync.js` (guardian), `guardian/lib/chat-transcripts.js` (guardian)
- **anomaly.detected** — from `lib/config-governance.js`, `tests/modules/test-escalation.js` +2 → `cortex/orion/index.js` (cortex), `tests/modules/test-config-governance.js`, `tests/nexus-full-audit.js`
- **org:state_sync** — from `ui/eravos/organisms/acid-synth/acid-synth.engine.js`, `ui/eravos/organisms/channel/channel.engine.js` +9 → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/canvas-intelligence.js`, `ui/eravos/runtime/organism-factory.js`
- **audio:signal** — from `ui/eravos/organisms/acid-synth/acid-synth.engine.js` → `eravos/ui/mods/channel/channel.engine.js` (eravos), `ui/eravos/organisms/channel/channel.engine.js`
- **guardian.job.progress** — from `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-chat-transcripts.test.js` +1 → `guardian/lib/chat-transcripts.js` (guardian), `tests/modules/test-back-and-forth.test.js`
- **org:analysis-ready** — from `ui/eravos/organisms/contrast-analyser/contrast-analyser.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:asset_loaded** — from `ui/eravos/organisms/timeline/timeline.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:bpm-detected** — from `ui/eravos/organisms/contrast-analyser/contrast-analyser.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:clip_sync** — from `ui/eravos/organisms/timeline/timeline.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:density-reset** — from `ui/eravos/organisms/edm-lab/edm-lab.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:drop-fired** — from `ui/eravos/organisms/edm-lab/edm-lab.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:grid_sync** — from `ui/eravos/organisms/sequencer/sequencer.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:pad_lit** — from `ui/eravos/organisms/pads/pads.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:playhead_update** — from `ui/eravos/organisms/sample-player/sample-player.engine.js`, `ui/eravos/organisms/timeline/timeline.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:slot-loaded** — from `ui/eravos/organisms/contrast-analyser/contrast-analyser.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:stage-active** — from `ui/eravos/organisms/bass-drop-builder/bass-drop-builder.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:state-sync** — from `ui/eravos/organisms/bass-drop-builder/bass-drop-builder.engine.js`, `ui/eravos/organisms/edm-lab/edm-lab.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:step_cursor** — from `ui/eravos/organisms/sequencer/sequencer.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:step_set** — from `ui/eravos/organisms/sequencer/sequencer.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:vocal-loaded** — from `ui/eravos/organisms/bass-drop-builder/bass-drop-builder.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **org:waveform_ready** — from `ui/eravos/organisms/sample-player/sample-player.engine.js` → `eravos/ui/runtime/mod-factory.js` (eravos), `ui/eravos/runtime/organism-factory.js`
- **pad:bank-change** — from `ui/eravos/organisms/pads/pads.engine.js` → `eravos/ui/mods/sequencer/sequencer.engine.js` (eravos), `ui/eravos/organisms/sequencer/sequencer.engine.js`
- **raid.route.request** — from `tests/modules/test-raid-router.js` → `cortex/core/raid/router.js` (cortex), `tests/modules/test-raid-router.js`
- **seq:fire** — from `ui/eravos/organisms/sequencer/sequencer.engine.js` → `eravos/ui/mods/pads/pads.engine.js` (eravos), `ui/eravos/organisms/pads/pads.engine.js`
- **transport:record-start** — from `ui/eravos/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js` (eravos), `ui/eravos/organisms/nexus-shared/nexus-node-core.js`
- **transport:record-stop** — from `ui/eravos/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js` (eravos), `ui/eravos/organisms/nexus-shared/nexus-node-core.js`
- **transport:recorded** — from `ui/eravos/runtime/master-transport.js` → `eravos/ui/mods/timeline/timeline.engine.js` (eravos), `ui/eravos/organisms/timeline/timeline.engine.js`
- **transport:stop** — from `ui/eravos/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js` (eravos), `ui/eravos/organisms/nexus-shared/nexus-node-core.js`
- **mod:xy** — from `ui/eravos/organisms/xy-pad/xy-pad.engine.js`, `ui/eravos/runtime/organism-factory.js` → `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` (eravos)
- **nexus.resource.pressure** — from `tests/modules/test-escalation.js` → `orchestrator/orchestrator.js` (orchestrator)
- **sigma.event.halt_risk** — from `tests/modules/test-gap-finder.js`, `tests/modules/test-orion.js` → `cortex/orion/index.js` (cortex)
- **sigma.event.warning** — from `tests/modules/test-gap-finder.js`, `tests/modules/test-orion.js` → `cortex/orion/index.js` (cortex)
- **guardian.job.complete** — from `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-economy-guardian.test.js` +1 → `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-chat-transcripts.test.js`, `tests/modules/test-registry-harness.test.js`
- **guardian.job.error** — from `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-economy-guardian.test.js` +1 → `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-chat-transcripts.test.js`, `tests/modules/test-economy-guardian.test.js`
- **ess:unresolve** — from `lib/ess.js` → `tests/brutal.test.js`, `tests/full.test.js`
- **ico:ledger:fork** — from `lib/ico.js` → `tests/full.test.js`, `tests/modules/test-ico-ledger-writethrough.js`
- **input:rate_limited** — from `remote-desktop/input-injector.js` → `remote-desktop/bridge-electron/main.js`, `remote-desktop/tests/test-input-injector.js`
- **input:rejected** — from `remote-desktop/input-injector.js` → `remote-desktop/bridge-electron/main.js`, `remote-desktop/tests/test-input-injector.js`
- **bus:basic** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:enrich** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:err.safe** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:multi** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:mutate** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:off** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:once** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:seq** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:sig.check** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:ts** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **bus:unsub** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`
- **comp:spawn:failed** — from `cos/test/test.js` → `cos/test/test.js`
- **cortex.orion.classified** — from `tests/modules/test-raid-orion-wiring.js` → `tests/modules/test-orion.js`
- **enrich:test** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`
- **err:test** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`
- **guardian.job.timeout** — from `tests/modules/test-economy-guardian.test.js` → `tests/modules/test-back-and-forth.test.js`
- **guardian.tool.called** — from `tests/modules/tool-call-listener.test.js` → `lib/agent-tools/tool-call-listener.js`
- **host:map:updated** — from `cos/host/system-map.js` → `cos/test/test.js`
- **host:test:ping** — from `cos/test/test.js` → `cos/test/test.js`
- **ico:crystal:formed** — from `lib/ico.js` → `tests/full.test.js`
- **ico:drop** — from `lib/ico.js` → `tests/full.test.js`
- **ico:failure** — from `lib/ico.js` → `tests/full.test.js`
- **ico:pipe:error** — from `lib/ico.js` → `tests/full.test.js`
- **input:injected** — from `remote-desktop/input-injector.js` → `remote-desktop/tests/test-input-injector.js`
- **net.dns.add_record** — from `mesh/lib/ddns.js` → `mesh/lib/dns-server.js`
- **once:test** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`
- **shadow.declared** — from `lib/shadow.js` → `tests/modules/test-shadow.test.js`
- **shadow.settled** — from `lib/shadow.js` → `tests/modules/test-shadow.test.js`
- **store.flushed** — from `tests/modules/test-registry-harness.test.js` → `tests/modules/test-registry-harness.test.js`
- **test:event** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`
- **unsub:test** — from `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js` → `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`
- **a.thing.done** — from `tests/modules/test-event-contracts.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.deprecated** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.registered** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.removed** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.unwired** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- … 270 more — loom.find.tool kind "event"

### Events it hears from elsewhere (55)

**archetype:assigned** · **architect.snr.flagged** (architect) · **comp:process:stdout** · **compartment.bus.create** · **compartment.create.request** · **compartment.gate.run** · **compartment.status.request** · **copilot.error.detected** (copilot) · **cortex.gap.found** (orchestrator) · **cortex.raid.decided** · **cortex.self-heal.deep_scan_findings** · **cortex.self-heal.failure_mode** · **cortex.self-heal.fix_proposed** · **cortex.self-heal.fix_staged** · **cortex.self-heal.remediation_requested** · **cortex.self-heal.skipped** · **dom:pick-result** · **escalation.failure_mode** · **escalation.friction.increased** · **gap.found** · **guardian.chat.transcript.recorded** (guardian) · **guardian.economy.fallback** · **guardian.economy.wait** · **guardian:job:complete** · **host:compartment:destroyed** · **host:test:fired** · **job.done** · **midi:note** · **net.ddns.add_entry** · **net.ddns.force_check** · **net.ddns.update** · **net.dns.allow_domain** · **net.dns.block_domain** · **net.fw.add_rule** · **net.fw.import_json** · **net.fw.remove_rule** · **net.fw.set_vars** · **net.proxy.add_route** · **net.proxy.remove_route** · **nexus.self-build.housekeeping-complete** · **nexus:cookie-request** · **raid.route.decided** (cortex) · **raid.route.fulfilled** · **raid.route.no_route** (cortex) · **real.evt** · **shortcut:action** · **sql.plan** · **step.blocked** · **step.passed** · **test:build** · **ui:config_change** · **ui:transport-bpm** · **ui:transport-play** · **ui:transport-record** · **ui:transport-stop**

### Files, directory by directory (253 directories)

#### `.gitignore`

- `run-all.js` (455 lines) — tests/modules/run-all.js — Module Test Runner Runs every per-module fractal adversarial test suite.
- `test-new-plugins.js` (166 lines) — // ── pure functions, no jaaDB needed ─────────────────────────────────────────  
  requires 3 · required by 0
- `test-node-index.js` (106 lines)  
  requires 3 · required by 0
- other: 113 files (.gitignore, .json, .npmrc, .md, .jsonl)

#### `architecture-spec/registry/`

14 code file(s).

- `architecture-spec/registry/api.js` (95 lines) — .architecture/registry/api.js — the real, cross-system-safe surface onto this registry. Other systems (copilot, agents, anything) reach  
  exports createRegistryApi, query, history · requires 1 · required by 0
- `architecture-spec/registry/bundle.js` (22 lines) — .architecture/schema/bundle.js — NodeBundle schema + validator. A reference-only grouping of related node ids (a component with its  
  exports BUNDLE_SCHEMA, checkBundle
- `architecture-spec/registry/component.js` (21 lines) — .architecture/schema/component.js — Component node schema + validator. Restates loom/schema/component.js COMPONENT_SCHEMA unchanged; scoped  
  exports COMPONENT_SCHEMA, checkComponent
- `architecture-spec/registry/config.js` (21 lines) — .architecture/schema/config.js — Config node schema + validator. Deliberately minimal — a config node's whole point is that its value  
  exports CONFIG_SCHEMA, checkConfig
- `architecture-spec/registry/create-atlas.js` (129 lines) — .architecture/registry/create-atlas.js — scaffolds a new system atlas from atlas-template.md, pre-filling whatever a real .spec object  
  exports scaffoldAtlas, synthesize, toCortexMemory
- `architecture-spec/registry/decompose.js` (139 lines) — .architecture/registry/decompose.js — agnostic decomposition tool. Takes anything with declared seams (cut points) — a phasemap, a  
  exports findSeamsByTopLevelKeys, decomposePhasemap, migrateToSystemFolders, wireIntoRegistry
- `architecture-spec/registry/edit-atlas.js` (71 lines) — .architecture/registry/edit-atlas.js — edits ONE module section of an atlas.md by id, without touching anything else in the file. The  
  exports findSection, editSection
- `architecture-spec/registry/friction.js` (69 lines) — .architecture/registry/friction.js — per-system self-diagnostic score, computed live from the system's own registry state. Direct  
  exports computeFriction, computeTension, gapsFromSpecFile
- `architecture-spec/registry/hook.js` (36 lines) — .architecture/schema/hook.js — Hook node schema + validator. Restates loom/schema/hook.js HOOK_SCHEMA unchanged. type is an open  
  exports HOOK_SCHEMA, KNOWN_HOOK_TYPES, HOOK_DIRECTIONS, checkHook
- `architecture-spec/registry/lattice.js` (58 lines) — .architecture/compiler/lattice.js — compiles every Component/Hook/Wire node file into a single CompiledLattice. Generalization of  
  exports compileLattice
- `architecture-spec/registry/nexus-atlas-aggregate.js` (54 lines) — .architecture/registry/nexus-atlas-aggregate.js — rolls up idearium's real per-project atlas.json files (repository, fileCount, byLanguage,  
  exports aggregate · requires 0 · required by 1
- `architecture-spec/registry/phases.js` (77 lines) — .architecture/registry/phases.js — Phase as a full node kind, not just prose in a phasemap doc. The point: querying "what's the state of  
  exports PHASE_SCHEMA, PHASE_STATUSES, checkPhase, summarize, oneLine
- `architecture-spec/registry/watcher.js` (84 lines) — .architecture/registry/watcher.js — live per-type node index + ledger. Generalization of guardian/lib/node-registry.js out of guardian and  
  exports createWatcher, NODE_TYPES · requires 0 · required by 1
- `architecture-spec/registry/wire.js` (23 lines) — .architecture/schema/wire.js — Wire node schema + validator. Restates loom/schema/wire.js WIRE_SCHEMA unchanged. A wire is the  
  exports WIRE_SCHEMA, checkWire

#### `auth/`

2 code · 1 other file(s).

- `auth/client.js` (513 lines) — NEXUS Remote Client First-run: generates RSA-2048 keypair, prints public key for admin to register
- `auth/index.js` (510 lines)  
  exports init, handleChallenge, handleHandshake, handleRevoke, handleClients, handleRegisterClient +4
- other: `auth/policy.json`

#### `auth/keys/`

2 other file(s).

- other: `auth/keys/nexus-private.pem`, `auth/keys/nexus-public.pem`

#### `cli/`

26 code file(s).

- `cli/axiom.js` (137 lines) — cli/axiom.js CLI: nexus axiom <command> [args]  
  requires 1 · required by 0
- `cli/boot-systems.js` (257 lines) — NEXUS Per-System Boot Sequencer Status: pre-release  
  exports _waitForHealth, _bootOneSys, _bootSystems · requires 1 · required by 0
- `cli/cfr-debug.js` (465 lines) — CFR-Ω Replay + Audit CLI The debugger. Reads ledger JSONL files and reconstructs causal history  
  requires 5 · required by 0
- `cli/clear-idearium.js` (407 lines)
- `cli/compact.js` (92 lines) — table-compactor.js CLI Same dry-run-by-default convention as cli/dedup.js, for the same  
  requires 2 · required by 0
- `cli/compartments.js` (120 lines) — every Nexus system as a repo compartment (virtual repos). node cli/compartments.js list  
  requires 1 · required by 0
- `cli/copilot-window.js` (89 lines) — open the co-pilot CLI in a NEW terminal window James: "make the cli open in a new window that connects to each system with  
  exports openCopilotWindow · requires 0 · required by 1
- `cli/data-audit.js` (167 lines)
- `cli/decompose.js` (470 lines)
- `cli/dedup.js` (71 lines) — table-deduplicator.js CLI James: "clear all duplicates from each table. make a tool for it."  
  requires 3 · required by 0
- `cli/diagnose.js` (1433 lines) — NEXUS System Diagnostic Sequencer Status: pre-release  
  requires 1 · required by 0
- `cli/find-orphans.js` (236 lines)
- `cli/import-history.js` (289 lines)  
  exports MODULE_ID, VERSION, parseArgs, listZips, scanZip, orderScans +3 · requires 1 · required by 1
- `cli/nexus-cli.js` (55 lines) — RETIRED (consolidated into copilot/cli.js) §CONSOLIDATION 2026-07-30 (James: "the only cli should have co-pilot available  
  exports canonical, _copilotAsk · requires 1 · required by 0 · tested by `tests/modules/cli-copilot-fallback.test.js`
- `cli/nexus-movement.js` (225 lines) — 'nexus movement <system>' The custom command. One panel per system, laid out like the checkmk  
  exports render, spark, gauge
- `cli/nexus-repl-descriptors.js` (150 lines) — // ── cli/nexus-repl-descriptors.js ─────────────────────────────────────────── // UUID: nexus-repl-descriptors-v1-0000-3600-0000-000000000001  
  exports DESCRIPTORS, registerAll, MODULE_ID, VERSION · requires 0 · required by 1 · tested by `tests/modules/nexus-repl-descriptors.test.js`
- `cli/nexus-repl.js` (1234 lines) — NEXUS Interactive CLI REPL Status: pre-release  
  requires 4 · required by 0
- `cli/nexus.js` (736 lines) — // ════════════════════════════════════════════════════════════════════════════ // nexus — Unified CLI v2.0  
  requires 4 · required by 0
- `cli/nodes.js` (52 lines) — every system's nodes from the command line (0.39.271 X1). node cli/nodes.js sync [--dry] [--only guardian,idearium] regenerate (lib/system-nodes.js)  
  requires 1 · required by 0
- `cli/opportunity.js` (148 lines)  
  requires 2 · required by 0
- `cli/pressure.js` (57 lines) — ask the system what led to a pressure spike. spec: docs/pressure-causality.spec § P4
- `cli/purge-pollution.js` (87 lines) — tests/modules/_purge-test-rows.js CLI, for cleaning up test pollution that ALREADY accumulated in the real,
- `cli/run-supervised.js` (21 lines) — // ── cli/run-supervised.js ─────────────────────────────────────────────────── // UUID: nexus-run-supervised-v1-0000-4000-0000-000000000001
- `cli/semantic-dedup.js` (74 lines) — lib/semantic-dedup.js CLI James: "vector memory? like semantic memory help reduce dedups" — yes.  
  requires 3 · required by 0
- `cli/sentinel.js` (352 lines) — NEXUS Sentinel CLI spec: docs/nexus-sentinel.spec — phase S1  
  exports readFaults, contract, HANDLERS, CONTRACT_PATH
- `cli/session.js` (220 lines) — SESSION.md Renderer Renders SESSION.md as a deterministic projection of current system state.

#### `cli/spec/`

1 other file(s).

- other: `cli/spec/cli.spec`

#### `cockpit/`

4 code · 1 other file(s).

- `cockpit/cli.js` (710 lines) — forge-cli.js — CLI command layer + interaction contract All commands route through SISO bus — same hooks, different surface (ME-2).  
  exports ForgeCLI, INTERACTION_CONTRACT, _chunkSpec, _chunkTitle · requires 0 · required by 2 · emits cli.exec.done
- `cockpit/core.js` (544 lines) — forge-core.js — SISO bus + JAA browser store + Bayesian trust + SNR PORT: depends on forge-ui (Idearium at port 4800, Guardian at port 7820)  
  exports SISOKernel, SISOEvent, SISOGate, JAAStore, TrustEngine, IdeiarumClient +5
- `cockpit/live.js` (71 lines) — the live, composed cockpit instance §THE REAL GAP THIS CLOSES — checked before writing: ForgeCLI,  
  exports getForgeCLI, ready, TABLE · requires 3 · required by 1
- `cockpit/pipeline.js` (993 lines) — forge-pipeline.js — Pipeline engine + SEAM compiler + condition evaluator Node types (all SEAM-web-aligned):  
  exports SeamCompiler, SeamEvaluator, seamEval, seamEvalSafe, validateExpr, Pipeline +6 · requires 0 · required by 1 · emits forge.gap.opened, forge.notify, pipeline.deleted, pipeline.run.complete +6
- other: `cockpit/cockpit.spec`

#### `contracts/`

2 code · 1 other file(s).

- `contracts/SYSTEM-CONTRACTS.js` (178 lines) — NEXUS System-Wide Contract Registry Status: pre-release  
  exports NEXUS_VERSION, AXIOMS, SYSTEMS, EVENTS, GAPS, FAULTS +8 · requires 14 · required by 0
- `contracts/nexus-interaction-contract.js` (604 lines)  
  exports getContract, getVersionedContract, getContractWithFallback, validateRequest, validateRequestAt, listSnapshots +4 · requires 0 · required by 1
- other: `contracts/event-contract-baseline.json`

#### `contracts/nodes/`

14 code file(s).

- `contracts/nodes/axioms.node.js` (73 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.axioms.node  
  requires 0 · required by 1
- `contracts/nodes/bottlenecks.node.js` (37 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.bottlenecks.node  
  requires 0 · required by 1
- `contracts/nodes/causal-physics.node.js` (69 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.causal-physics.node  
  requires 0 · required by 1
- `contracts/nodes/deltas.node.js` (37 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.deltas.node  
  requires 0 · required by 1
- `contracts/nodes/divergent.node.js` (47 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.divergent.node  
  requires 0 · required by 1
- `contracts/nodes/edges.node.js` (35 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.edges.node  
  requires 0 · required by 1
- `contracts/nodes/events.node.js` (215 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.events.node  
  requires 0 · required by 1
- `contracts/nodes/faults.node.js` (55 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.faults.node  
  requires 0 · required by 1
- `contracts/nodes/gaps.node.js` (75 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.gaps.node  
  requires 0 · required by 1
- `contracts/nodes/interaction-contracts.node.js` (44 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.interaction-contracts.node  
  requires 0 · required by 1
- `contracts/nodes/ledgers.node.js` (120 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.ledgers.node  
  requires 0 · required by 1
- `contracts/nodes/self-awareness.node.js` (42 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.self-awareness.node  
  requires 0 · required by 1
- `contracts/nodes/systems.node.js` (78 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.systems.node  
  requires 0 · required by 1
- `contracts/nodes/verification-contracts.node.js` (92 lines) — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.verification-contracts.node  
  requires 0 · required by 1

#### `cos/`

3 code · 1 other file(s).

- `cos/event-taxonomy.js` (184 lines) — // cos/event-taxonomy.js — every event COS emits, in the ET1 shape (lib/event-taxonomy-pattern.js). // component_id: cos.event-taxonomy  
  requires 1 · required by 0
- `cos/kernel.js` (471 lines) — @param {object} opts @param {string} opts.id Unique compartment ID  
  exports Compartment, STATE, BIRTH_GATES · requires 0 · required by 1
- `cos/manager.js` (413 lines) — // ───────────────────────────────────────────────────────────────────────────── // Compartment Manager  
  exports CompartmentManager · requires 3 · required by 0 · hears compartment.bus.create, compartment.create.request, compartment.gate.run, compartment.status.request
- other: `cos/package.json`

#### `cos/archetype/`

4 code file(s).

- `cos/archetype/detector.js` (170 lines) — archetype/detector.js COMPARTMENT OS — Archetype Auto-Detector (spec §43/§60, ArchetypeDetectionConfidence)  
  exports buildDetectionCorpus, hintMatches, detectArchetype, confidenceForScore · requires 2 · required by 1
- `cos/archetype/index.js` (125 lines) — archetype/index.js COMPARTMENT OS — Archetype Public API  
  exports listArchetypes, getArchetype, importArchetype, detectForProject, applyArchetypeToCompartment, ArchetypeSchemaError · requires 4 · required by 2
- `cos/archetype/registry.js` (747 lines) — archetype/registry.js COMPARTMENT OS — Built-in Archetype Registry (spec §60.2)  
  exports enqueue, dequeue, ARCHETYPES, ARCHETYPE_MAP, ARCHETYPE_NAME_MAP, ARCHETYPE_IDS +2 · requires 1 · required by 5
- `cos/archetype/schema.js` (188 lines) — archetype/schema.js COMPARTMENT OS — Archetype Contract Validator  
  exports ArchetypeSchemaError, validateArchetype · requires 3 · required by 2

#### `cos/blueprint/`

3 code file(s).

- `cos/blueprint/index.js` (244 lines) — blueprint/index.js COMPARTMENT OS — Blueprint Public API (Phase 22, spec §44/§61)  
  exports listBlueprints, getBlueprint, importBlueprint, launchBlueprint, destroyBlueprintInstance, substituteTemplate +1 · requires 7 · required by 3 · emits host:archetype:assign · hears archetype:assigned
- `cos/blueprint/registry.js` (499 lines) — blueprint/registry.js COMPARTMENT OS — Built-in Blueprint Registry (spec §61.3)  
  exports BLUEPRINTS, BLUEPRINT_MAP, BLUEPRINT_NAME_MAP, BLUEPRINT_IDS, BLUEPRINT_NAMES, getBuiltInBlueprint · requires 2 · required by 1
- `cos/blueprint/schema.js` (160 lines) — blueprint/schema.js COMPARTMENT OS — Blueprint Contract Validator  
  exports BlueprintSchemaError, validateBlueprint · requires 1 · required by 2

#### `cos/ci/`

4 code file(s).

- `cos/ci/ci-keys.smoke.cjs` (85 lines)  
  requires 3 · required by 0
- `cos/ci/ci.smoke.cjs` (74 lines) — // 1. validation refuses what it cannot run // 2. a real passing pipeline  
  requires 1 · required by 0
- `cos/ci/index.js` (425 lines)  
  exports MODULE_ID, VERSION, CONFIG_FILENAME, STAGE_KINDS, DEFAULTS, defaultConfig +10 · requires 2 · required by 3 · emits ci:run:finished, ci:run:started, ci:stage:failed, ci:stage:started +1
- `cos/ci/keys.js` (270 lines)  
  exports MODULE_ID, VERSION, SSH_PREFIX, SECRET_PREFIX, ALIAS_RE, validateAlias +11 · requires 3 · required by 2

#### `cos/cli/`

1 code file(s).

- `cos/cli/index.js` (152 lines) — cli/index.js COMPARTMENT OS — cos CLI entry point  
  exports main, parseArgs · requires 3 · required by 0 · tested by `cos/test/test.js`

#### `cos/cli/commands/`

22 code file(s).

- `cos/cli/commands/advance-work-phase.js` (63 lines) — cli/commands/advance-work-phase.js COMPARTMENT OS — cos advance-work-phase <name> <phase>  
  exports advanceWorkPhase · requires 2 · required by 1 · emits host:compartment:advance-work-phase · tested by `tests/lib/mco04-cos-work-phase.test.js`
- `cos/cli/commands/archetype.js` (323 lines) — cli/commands/archetype.js COMPARTMENT OS — cos archetype list | show | assign | detect | create  
  exports runArchetypeCommand, listArchetypesCommand, showArchetype, assignArchetype, detectArchetypeCommand, createArchetype · requires 2 · required by 3 · emits host:archetype:assign, host:archetype:detect, host:archetype:import
- `cos/cli/commands/blueprint.js` (312 lines) — cli/commands/blueprint.js COMPARTMENT OS — cos blueprint list | show | create | destroy | status | import  
  exports runBlueprintCommand, listBlueprintsCommand, showBlueprint, createBlueprintInstance, destroyBlueprintInstanceCommand, showBlueprintStatus +1 · requires 3 · required by 2 · emits host:blueprint:create, host:blueprint:destroy, host:blueprint:import
- `cos/cli/commands/branch.js` (330 lines) — cli/commands/branch.js — cos branch <subcommand> cos branch fork <compartment> [--label <name>] [--from <branchId>]  
  exports run · requires 2 · required by 1
- `cos/cli/commands/compare.js` (310 lines) — cli/commands/compare.js — cos compare <subcommand> cos compare run <compartment> <branchA> <branchB> [--cmd <file>] [--label <name>]  
  exports run · requires 1 · required by 1
- `cos/cli/commands/create.js` (163 lines) — cli/commands/create.js COMPARTMENT OS — cos create <name>  
  exports createCompartment, runCreateWizard, toSlug · requires 4 · required by 8 · emits host:compartment:create · tested by `cos/test/test.js`, `tests/lib/mco04-cos-work-phase.test.js`
- `cos/cli/commands/destroy.js` (82 lines) — cli/commands/destroy.js COMPARTMENT OS — cos destroy <name>  
  exports destroyCompartment, runDestroyWizard · requires 1 · required by 6 · emits host:compartment:destroy · tested by `cos/test/test.js`
- `cos/cli/commands/events.js` (121 lines) — cli/commands/events.js COMPARTMENT OS — cos events stream | tail [--n <count>]  
  exports runEventsCommand, tailEvents, streamEvents, formatEvent · requires 1 · required by 1 · tested by `cos/test/test.js`
- `cos/cli/commands/hooks.js` (223 lines) — cli/commands/hooks.js COMPARTMENT OS — cos hooks list | show <id> | fire <id>  
  exports runHooksCommand, listHooks, showHook, fireHook · requires 2 · required by 1 · tested by `cos/test/test.js`
- `cos/cli/commands/list.js` (129 lines) — cli/commands/list.js COMPARTMENT OS — cos list  
  exports listCompartments, renderTable · requires 1 · required by 1 · tested by `cos/test/test.js`
- `cos/cli/commands/map.js` (161 lines) — cli/commands/map.js COMPARTMENT OS — cos map [--json] [--watch]  
  exports renderMap, renderTree · requires 2 · required by 1 · tested by `cos/test/test.js`
- `cos/cli/commands/playground.js` (199 lines) — cli/commands/playground.js COMPARTMENT OS — cos playground create | list | status | destroy | promote  
  exports runPlaygroundCommand, createPlaygroundCommand, listPlaygroundsCommand, playgroundStatusCommand, destroyPlaygroundCommand, promoteCommand · requires 2 · required by 2 · emits host:playgrounds:create, host:playgrounds:destroy, host:playgrounds:promote, host:playgrounds:status
- `cos/cli/commands/plugin.js` (318 lines) — cli/commands/plugin.js COMPARTMENT OS — cos plugins list | show | add | enable | disable | remove | validate | new  
  exports runPluginCommand, listPluginsCommand, showPlugin, addPlugin, enablePluginCommand, disablePluginCommand +3 · requires 3 · required by 2 · emits host:plugin:disable, host:plugin:enable, host:plugin:install, host:plugin:remove
- `cos/cli/commands/run.js` (141 lines) — cli/commands/run.js COMPARTMENT OS — cos run <name> <command>  
  exports runCommand, attachCompartment · requires 2 · required by 2 · emits comp:process:stdin
- `cos/cli/commands/schema.js` (126 lines) — cli/commands/schema.js COMPARTMENT OS — cos schema validate  
  exports validateSchema, validateCommandNodes · requires 3 · required by 1 · tested by `cos/test/test.js`
- `cos/cli/commands/snapshot.js` (115 lines) — cli/commands/snapshot.js COMPARTMENT OS — cos snapshot take | list | restore | delete  
  exports runSnapshotCommand, takeCommand, listCommand, restoreCommand, deleteCommand · requires 1 · required by 2
- `cos/cli/commands/start.js` (59 lines) — cli/commands/start.js COMPARTMENT OS — cos start <name>  
  exports startCompartment · requires 1 · required by 1 · emits host:compartment:start · tested by `cos/test/test.js`
- `cos/cli/commands/status.js` (120 lines) — cli/commands/status.js COMPARTMENT OS — cos status <name>  
  exports showStatus · requires 2 · required by 1 · tested by `cos/test/test.js`
- `cos/cli/commands/stop.js` (58 lines) — cli/commands/stop.js COMPARTMENT OS — cos stop <name>  
  exports stopCompartment · requires 1 · required by 1 · emits host:compartment:stop · tested by `cos/test/test.js`
- `cos/cli/commands/vault.js` (269 lines) — cli/commands/vault.js COMPARTMENT OS — cos vault set | get | list | delete | grant | revoke | audit | export | import  
  exports runVaultCommand, setCommand, getCommand, listCommand, deleteCommand, grantCommand +4 · requires 3 · required by 2 · emits host:vault:delete, host:vault:export, host:vault:get, host:vault:grant +3
- `cos/cli/commands/vaultd.js` (167 lines) — cli/commands/vaultd.js COMPARTMENT OS — cos vaultd install | start | stop | status | migrate | config | backup | restore  
  exports runVaultdCommand, installCommand, startCommand, stopCommand, statusCommand, migrateCommand +3 · requires 3 · required by 1
- `cos/cli/commands/vm.js` (363 lines) — cli/commands/vm.js COMPARTMENT OS — cos vm status | reset | snapshot | base-image | cleanup  
  exports runVmCommand, statusCommand, resetCommand, stopCommand, snapshotCommand, baseImageCommand +1 · requires 2 · required by 1

#### `cos/compartment/`

3 code file(s).

- `cos/compartment/guest-agent.js` (117 lines) — qemu-guest-agent (QGA) client. Status: pre-release · §2026-09-21 for cos/testenv's vm backend.  
  exports GuestAgentClient, GuestAgentError, connectWhenReady · requires 0 · required by 3
- `cos/compartment/process-runner.js` (389 lines) — compartment/process-runner.js COMPARTMENT OS — Compartment Process Runner  
  exports spawnProcess, killProcess, getProcess, writeStdin, resolveRuntime · requires 3 · required by 6 · tested by `cos/test/test.js`
- `cos/compartment/qemu-runtime.js` (679 lines)  
  exports QEMU_BIN, QEMU_IMG_BIN, qemuSystemBin, qemuImgBin, derivePort, desktopPorts +16 · requires 1 · required by 6 · tested by `tests/helpers/cos-mini-guest.js`

#### `cos/foundation/`

13 code file(s).

- `cos/foundation/axioms.js` (248 lines) — foundation/axioms.js COMPARTMENT OS — Enforced Axioms  
  exports CosAxiomError, AXIOMS, AXIOM_MAP, enforce, getAxiomDefs · requires 0 · required by 14 · tested by `cos/test/test.js`
- `cos/foundation/cli-detector.js` (462 lines)  
  exports detectProject, detectCliCommands · requires 0 · required by 1
- `cos/foundation/command-schema.js` (111 lines) — foundation/command-schema.js COMPARTMENT OS — Command Node Contract Validator  
  exports CommandSchemaError, validateCommandNode, isKebab, isSemver · requires 1 · required by 1
- `cos/foundation/compiler-enum.js` (37 lines) — foundation/compiler-enum.js COMPARTMENT OS — Supported Compiler/Bundler Definitions  
  requires 0 · required by 2 · tested by `cos/test/test.js`
- `cos/foundation/constants.js` (144 lines) — foundation/constants.js COMPARTMENT OS — System Constants  
  requires 1 · required by 20 · tested by `cos/test/test.js`
- `cos/foundation/enums.js` (93 lines) — foundation/enums.js COMPARTMENT OS — Foundation Enums (spec §59.1)  
  requires 0 · required by 2
- `cos/foundation/event-contracts.js` (363 lines) — foundation/event-contracts.js COMPARTMENT OS — Kernel Event Type Registry  
  exports HOST, COMP, WATCHDOG, REPLAY, PIPE, GIT +15 · requires 0 · required by 35 · tested by `cos/test/test.js`
- `cos/foundation/file-browser.js` (341 lines) — compartment/file-browser.js COMPARTMENT OS — Compartment File Browser  
  exports FileBrowser · requires 4 · required by 0 · emits comp:file:written
- `cos/foundation/fs-layer.js` (390 lines)  
  exports FsLayer · requires 2 · required by 1
- `cos/foundation/hook-schema.js` (170 lines) — foundation/hook-schema.js COMPARTMENT OS — Hook Contract Validator  
  exports HookSchemaError, validateHook, validateEventType, isUUID, isSemver, isEventType +1 · requires 1 · required by 8 · tested by `cos/test/test.js`
- `cos/foundation/runtime-enum.js` (58 lines) — foundation/runtime-enum.js COMPARTMENT OS — Supported Runtime Definitions  
  requires 0 · required by 3 · tested by `cos/test/test.js`
- `cos/foundation/snapshot.js` (356 lines) — compartment/snapshot.js COMPARTMENT OS — Compartment Snapshot Engine  
  exports SnapshotEngine, SNAP_SCHEMA_VERSION · requires 4 · required by 2 · emits host:snapshot:restored, nexus:snapshot:written
- `cos/foundation/types.js` (333 lines) — foundation/types.js COMPARTMENT OS — Base Type Definitions  
  exports DEFAULT_FS_CONFIG, DEFAULT_COMPILER_CONFIG, DEFAULT_WATCHDOG_CONFIG, DEFAULT_COMPARTMENT, DEFAULT_HOOK, DEFAULT_SYSTEM_MAP +10 · requires 0 · required by 4 · tested by `cos/test/test.js`

#### `cos/host/`

4 code file(s).

- `cos/host/event-bus.js` (161 lines) — host/event-bus.js COMPARTMENT OS — Host Event Bus  
  exports EventBus, createEventBus · requires 4 · required by 2 · tested by `cos/test/test.js`
- `cos/host/index.js` (220 lines) — host/index.js COMPARTMENT OS — Host Shell Bootstrap  
  exports createHost · requires 14 · required by 11 · emits comp:process:kill, comp:process:spawn · tested by `cos/test/test.js`, `tests/lib/mco04-cos-work-phase.test.js` +2
- `cos/host/state-store.js` (218 lines) — host/state-store.js COMPARTMENT OS — State Store  
  exports StateStore · requires 1 · required by 2 · tested by `cos/test/test.js`
- `cos/host/system-map.js` (329 lines) — host/system-map.js COMPARTMENT OS — Live System Map  
  exports SystemMap · requires 5 · required by 2 · emits host:map:updated · tested by `cos/test/test.js`

#### `cos/host/gates/`

7 code file(s).

- `cos/host/gates/archetype.js` (163 lines) — host/gates/archetype.js COMPARTMENT OS — Host Archetype Gates (Phase 21, spec §43/§60)  
  exports ArchetypeAssignGate, ArchetypeImportGate, ArchetypeDetectGate · requires 5 · required by 2
- `cos/host/gates/blueprint.js` (152 lines) — host/gates/blueprint.js COMPARTMENT OS — Host Blueprint Gates (Phase 22, spec §44/§61)  
  exports BlueprintCreateGate, BlueprintImportGate, BlueprintDestroyGate · requires 5 · required by 2
- `cos/host/gates/compartment.js` (394 lines) — host/gates/compartment.js COMPARTMENT OS — Host Compartment Lifecycle Gates  
  exports CreateCompartmentGate, StartCompartmentGate, StopCompartmentGate, DestroyCompartmentGate, AdvanceWorkPhaseGate, toSlug · requires 6 · required by 3
- `cos/host/gates/playgrounds.js` (123 lines) — host/gates/playgrounds.js COMPARTMENT OS — Host Playground Gates (Phase 30, spec §67)  
  exports PlaygroundCreateGate, PlaygroundDestroyGate, PlaygroundPromoteGate, PlaygroundStatusGate · requires 5 · required by 1
- `cos/host/gates/plugin.js` (130 lines) — host/gates/plugin.js COMPARTMENT OS — Host Plugin Gates (Phase 29, spec §62-64)  
  exports PluginInstallGate, PluginEnableGate, PluginDisableGate, PluginRemoveGate · requires 5 · required by 1
- `cos/host/gates/process.js` (152 lines) — host/gates/process.js COMPARTMENT OS — Process Lifecycle Gates  
  exports ProcessSpawnGate, ProcessKillGate, ProcessStdinGate · requires 4 · required by 2 · tested by `cos/test/test.js`
- `cos/host/gates/vault.js` (140 lines) — host/gates/vault.js COMPARTMENT OS — Host Vault Gates (Phase 28, spec §52)  
  exports VaultSetGate, VaultGetGate, VaultDeleteGate, VaultGrantGate, VaultRevokeGate, VaultExportGate +1 · requires 5 · required by 1

#### `cos/nodes/`

24 code file(s).

- `cos/nodes/archetype.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/attach.js` (18 lines)  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/blueprint.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/branch.js` (18 lines) — // branch.js does its own --flag parsing internally, so it needs the // raw, unsplit args (not ctx.args, which has had --flags stripped out).  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/compare.js` (18 lines) — // compare.js does its own --flag parsing internally, so it needs the // raw, unsplit args (not ctx.args, which has had --flags stripped out).  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/create.js` (18 lines)  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/destroy.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/events.js` (21 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/hooks.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/index.js` (88 lines) — nodes/index.js COMPARTMENT OS — Command Node Listener  
  exports loadNodes, loadNodesOrThrow, NODES_DIR · requires 1 · required by 3
- `cos/nodes/list.js` (18 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/map.js` (19 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/nodes.js` (46 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/playground.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/plugin.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/run.js` (22 lines)  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/schema.js` (39 lines) — // Default: validate both. --hooks or --commands narrows to one.  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/snapshot.js` (20 lines)  
  exports name, version, summary, list, restore, usage +3 · requires 1 · required by 0
- `cos/nodes/start.js` (22 lines)  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/status.js` (19 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/stop.js` (22 lines)  
  exports name, version, summary, usage, flags · requires 1 · required by 0
- `cos/nodes/vault.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/vaultd.js` (20 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0
- `cos/nodes/vm.js` (21 lines)  
  exports name, version, summary, usage, flags, type +1 · requires 1 · required by 0

#### `cos/playground/`

5 code file(s).

- `cos/playground/branch.js` (447 lines) — Compartment Branch Engine Status: pre-release  
  exports BranchEngine · requires 2 · required by 6
- `cos/playground/compare.js` (325 lines) — Iteration Comparison Engine Status: pre-release  
  exports CompareEngine · requires 3 · required by 2 · emits comp:compare:done, comp:compare:started
- `cos/playground/index.js` (13 lines) — Playground barrel  
  exports BranchEngine, SandboxRunner, CompareEngine · requires 3 · required by 1
- `cos/playground/llm-lab.js` (509 lines) — NEXUS Lab Status: pre-release  
  exports LabManager, LabSession, CONDITION_OPS, LAB_TEMPLATES, LAB_STATUS · emits lab.session.created
- `cos/playground/sandbox.js` (247 lines) — Compartment Sandbox Runner Status: pre-release  
  exports SandboxRunner · requires 3 · required by 5 · emits comp:sandbox:error, comp:sandbox:exited, comp:sandbox:output-limit, comp:sandbox:started +3

#### `cos/playgrounds/`

5 code file(s).

- `cos/playgrounds/cow-fs.js` (137 lines) — playgrounds/cow-fs.js COMPARTMENT OS — Copy-on-Write Filesystem Layer (spec §67)  
  exports FS_MODES, copyTree, setupPlaygroundFs, diffAgainstSource · requires 0 · required by 1
- `cos/playgrounds/factory.js` (248 lines) — playgrounds/factory.js COMPARTMENT OS — Playground Factory (Phase 30, spec §67)  
  exports PlaygroundError, PLAYGROUND_MODES, createPlayground, destroyPlayground, promoteCompartment, playgroundStatus · requires 6 · required by 2
- `cos/playgrounds/index.js` (48 lines) — playgrounds/index.js COMPARTMENT OS — Playgrounds Public API (Phase 30, spec §67)  
  exports PlaygroundError, PLAYGROUND_MODES, createPlayground, destroyPlayground, promoteCompartment, playgroundStatus +2 · requires 1 · required by 1
- `cos/playgrounds/kernel.js` (93 lines) — playgrounds/kernel.js COMPARTMENT OS — Scoped Nexus Kernel for a Playground (spec §67)  
  exports createScopedHost · requires 7 · required by 1 · emits comp:process:kill, comp:process:spawn
- `cos/playgrounds/network-sim.js` (86 lines) — playgrounds/network-sim.js COMPARTMENT OS — Simulated Network for Playgrounds (spec §67)  
  exports startEchoServer, getEchoServerLog, stopEchoServer · requires 0 · required by 1

#### `cos/plugin/`

5 code file(s).

- `cos/plugin/host-api.js` (193 lines)  
  exports PluginRuntimeError, createPluginHost, executePluginCode · requires 0 · required by 1
- `cos/plugin/index.js` (142 lines) — plugin/index.js COMPARTMENT OS — Plugin Public API (Phase 29, spec §62-64)  
  exports builtInPluginRecords, listPlugins, getPlugin, enablePlugin, disablePlugin, removePlugin +3 · requires 4 · required by 2
- `cos/plugin/installer.js` (212 lines) — plugin/installer.js COMPARTMENT OS — Plugin Installer (spec §63 Plugin Manager)  
  exports PluginInstallError, installPlugin, verifyContributionsDeclared, sha256 · requires 4 · required by 1
- `cos/plugin/registry.js` (447 lines) — plugin/registry.js COMPARTMENT OS — Built-in Plugin Manifest Registry (spec §62.2 / §62.3)  
  exports RUNTIME_MANIFESTS, COMPILER_MANIFESTS, ALL_BUILTIN_MANIFESTS, BUILTIN_MANIFEST_MAP, BUILTIN_MANIFEST_NAME_MAP, getBuiltInManifest · requires 1 · required by 1
- `cos/plugin/schema.js` (145 lines) — plugin/schema.js COMPARTMENT OS — Plugin Manifest Validator (spec §62.1)  
  exports PluginSchemaError, validateManifest, isCompatibleVersion, PLUGIN_TYPE · requires 2 · required by 4

#### `cos/runtime/`

5 code file(s).

- `cos/runtime/preload.cjs` (93 lines)
- `cos/runtime/register.mjs` (7 lines) — // cos/runtime/register.mjs — installs resolve-hook.mjs (node --import). // module.register exists from Node 20.6; on an older Node the run proceeds
- `cos/runtime/resolve-hook.mjs` (26 lines) — // cos/runtime/resolve-hook.mjs — ESM resolution fallback for COS runs. // UUID: cos-runtime-resolve-hook-v1-0000-2026-0926-001  
  exports resolve
- `cos/runtime/run.js` (302 lines) — COS's JS runtime: run node code from a branch or a workspace with dependency resolution, isolation and port shifting, without  
  exports capabilities, runNode, runEnv, nodeArgsFor, syntaxCheck, resolveDeps +7 · requires 1 · required by 1 · tested by `tests/modules/test-nexus-self-and-cos-run.test.js`
- `cos/runtime/syntax-check.cjs` (71 lines) — parse every file given on stdin (JSON array of absolute paths) WITHOUT running any of it, and print one JSON result.

#### `cos/siso/`

5 code file(s).

- `cos/siso/Event.js` (39 lines) — §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports Event from warp/core/Event.js instead of this file. Nothing in the tree requires  
  exports Event · requires 0 · required by 11 · tested by `cos/test/test.js`
- `cos/siso/Gate.js` (48 lines) — siso/Gate.js COMPARTMENT OS — SISO Core: Gate  
  exports Gate · requires 0 · required by 8
- `cos/siso/Stream.js` (227 lines) — §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports Stream from warp/core/Stream.js instead of this file. Nothing in the tree requires  
  exports Stream · requires 1 · required by 1 · tested by `cos/test/test.js`
- `cos/siso/StreamLog.js` (123 lines) — §SUPERSEDED 2026-07-11 — cos/siso/index.js now imports StreamLog from warp/core/StreamLog.js instead of this file. Nothing in the tree requires  
  exports StreamLog · requires 0 · required by 1
- `cos/siso/index.js` (44 lines)  
  exports Event, Gate, Stream, StreamLog · requires 4 · required by 0 · tested by `cos/test/test.js`

#### `cos/spec/`

2 other file(s).

- other: `cos/spec/cos-design-v1.7.0.md`, `cos/spec/cos.spec`

#### `cos/test/`

1 test file(s).


#### `cos/testenv/`

8 code · 2 other file(s).

- `cos/testenv/detect.js` (195 lines) — what a repo needs to be tested, for ANY repo. Status: pre-release · §0.39.264  
  exports plan, testFiles, describe, TEST_FILE_RULES, NOT_A_TEST · requires 0 · required by 2
- `cos/testenv/environment.js` (150 lines)  
  exports check, options, normalize, OPTIONS, STACK_PACKAGES · requires 1 · required by 1
- `cos/testenv/host.js` (101 lines) — where the test VM's pieces live on this machine. Status: pre-release · §0.39.264  
  exports home, qemu, base, readManifest, writeManifest, installHint +1 · requires 0 · required by 6
- `cos/testenv/index.js` (260 lines)  
  exports capabilities, run, runVm, runProcess, missingRuntimes, GUEST_MOUNT +1 · requires 5 · required by 4
- `cos/testenv/installer.js` (173 lines) — what a run needs, whether this host has it, and installing it on request. Status: pre-release · §0.39.265  
  exports TOOLS, find, plan, install, status, needsFor +1 · requires 1 · required by 4
- `cos/testenv/provision.js` (403 lines)  
  exports provision, userData, provisionScript, desktopLogin, seedServer, download +3 · requires 4 · required by 1
- `cos/testenv/setup-job.js` (77 lines) — the VM setup as a background job, for the run menu. Status: pre-release · §0.39.264  
  exports start, status, hostInfo, PROVISION · requires 5 · required by 0
- `cos/testenv/tar.js` (158 lines) — a directory as a tar archive, in plain JavaScript. Status: pre-release · §0.39.264  
  exports packDir, DEFAULT_SKIP, TarWriter, _split, _paxRecord · requires 0 · required by 2
- other: `cos/testenv/setup-vm.bat`, `cos/testenv/setup-vm.sh`

#### `cos/vault/`

4 code file(s).

- `cos/vault/audit-log.js` (60 lines) — vault/audit-log.js COMPARTMENT OS — Persisted Vault Audit Log (spec §52, hk-va-007)  
  exports DEFAULT_AUDIT_LOG_FILE, appendAuditEntry, readAuditLog · requires 1 · required by 1
- `cos/vault/crypto.js` (118 lines) — vault/crypto.js COMPARTMENT OS — Vault Encryption (Phase 28, spec §52)  
  exports getOrCreateMasterKey, encrypt, decrypt, _resetKeyCacheForTests · requires 1 · required by 1
- `cos/vault/index.js` (251 lines) — vault/index.js COMPARTMENT OS — Vault Public API (Phase 28, spec §52)  
  exports VaultError, canAccess, setSecret, getSecret, listSecrets, deleteSecret +5 · requires 1 · required by 5
- `cos/vault/store.js` (87 lines) — vault/store.js COMPARTMENT OS — Encrypted Vault Store (Phase 28, spec §52)  
  exports readStore, writeStore, putEncryptedValue, getDecryptedValue, deleteEncryptedValue · requires 2 · required by 1

#### `cos/vaultd/`

3 code file(s).

- `cos/vaultd/config.js` (53 lines) — vaultd/config.js COMPARTMENT OS — vaultd Configuration (spec §66)  
  exports DEFAULT_VAULTD_PORT, VAULTD_PID_FILE, VAULTD_LOG_FILE, VAULTD_CONFIG_FILE, DEFAULT_VAULTD_CONFIG · requires 1 · required by 2
- `cos/vaultd/daemon.js` (205 lines) — vaultd/daemon.js COMPARTMENT OS — vaultd Daemon Lifecycle (spec §66)  
  exports VaultdError, startVaultd, stopVaultd, statusVaultd, backupVaultd, restoreVaultd +2 · requires 2 · required by 1
- `cos/vaultd/server.js` (187 lines) — vaultd/server.js COMPARTMENT OS — vaultd HTTP Server (spec §66)  
  exports createVaultdServer · requires 3 · required by 0

#### `cos/watchdog/`

3 code file(s).

- `cos/watchdog/actions.js` (60 lines) — watchdog/actions.js COMPARTMENT OS — Watchdog Anomaly Dispatch  
  exports dispatchAnomaly · requires 2 · required by 1 · emits comp:process:kill, host:compartment:start, host:compartment:stop, watchdog:snapshot:failed
- `cos/watchdog/monitor.js` (155 lines) — watchdog/monitor.js COMPARTMENT OS — Watchdog Resource Monitor  
  exports WatchdogMonitor, startMonitoring, stopMonitoring, getMonitor, POLL_INTERVAL_MS · requires 4 · required by 0
- `cos/watchdog/proc-stats.js` (102 lines) — watchdog/proc-stats.js COMPARTMENT OS — Process Resource Reader (Phase: Watchdog Monitor)  
  exports readProcStats, readLinuxProcStats, readWin32ProcStats · requires 0 · required by 1

#### `cos/workspace/`

1 code file(s).

- `cos/workspace/index.js` (395 lines)  
  exports gitWhy, branchWorkspaceAsync, ownRepoAsync, listBranchesAsync, gitAvailableAsync, MODULE_ID +16 · requires 4 · required by 1

#### `docs/`

286 other file(s).

- other: 286 files (.spec, .md, .json, .htm, .yaml, .html)

#### `docs/architecture-spec/`

1 other file(s).

- other: `docs/architecture-spec/architecture-spec.spec`

#### `docs/atlases/`

17 other file(s).

- other: 17 files (.md)

#### `docs/contracts/`

3 other file(s).

- other: `docs/contracts/context-candidate.spec`, `docs/contracts/context-synthesis-pipeline.spec`, `docs/contracts/synthesis-contract.spec`

#### `docs/guides/`

1 other file(s).

- other: `docs/guides/tutorial-build-first-spec.guide`

#### `docs/roadmap/`

3 other file(s).

- other: `docs/roadmap/2026-08-22-copilot-end-state-vision.md`, `docs/roadmap/2026-08-22-full-phase-map.md`, `docs/roadmap/NEXUS-ROADMAP.md`

#### `docs/specs/`

13 other file(s).

- other: 13 files (.md)

#### `emerge/`

8 code · 4 other file(s).

- `emerge/config.js` (19 lines) — real, distinct config for emerge's static defaults. Matches the pattern established by guardian/config.js,  
  exports DEFAULT_PORT, BUS_LOG_MAX · requires 0 · required by 1
- `emerge/emerge-codegen-v2.js` (859 lines) — Emergence .eg → SISO-wired CommonJS module v2 fixes over v1:  
  exports stop, handle, health, generateFile, generateCompartment
- `emerge/emerge-ide.js` (337 lines) — // ════════════════════════════════════════════════════════════════════════════ // emerge-ide.js — entry point  
  requires 1 · required by 0
- `emerge/emerge-kernel.js` (604 lines) — // ════════════════════════════════════════════════════════════════════════════ // EMERGE KERNEL v1.0.0  
  exports compile, tokenize, snrGate, parse, validate, loadSpec +3 · emits kernel.booted, signal.noise, signal.passed
- `emerge/event-taxonomy.js` (85 lines) — // emerge/event-taxonomy.js — every event EMERGE emits, in the ET1 shape (lib/event-taxonomy-pattern.js). // component_id: emerge.event-taxonomy
- `emerge/registry-components.js` (33 lines) — emerge/registry-components.js
- `emerge/verify.js` (276 lines) — smoke test for spec-compiler pipeline Runs the full T0+T1 pipeline against spec-parser.spec  
  requires 4 · required by 0
- `emerge/version.js` (37 lines) — single source of truth for spec-compiler version strings. Every module that needs to report its version reads from here.  
  requires 0 · required by 6
- other: `emerge/SPEC_COMPILER.spec`, `emerge/emerge.spec`, `emerge/package.json`, `emerge/writeback-failures.jsonl`

#### `emerge/chunk/`

1 code file(s).

- `emerge/chunk/index.js` (368 lines) — chunk-format.js — CHUNK: the minimal token payload for small LLMs THE PROBLEM THIS SOLVES:  
  exports buildChunk, emitToPrompt, buildSeamContract, estimateTokens · requires 0 · required by 2 · tested by `emerge/test/kg.test.js`

#### `emerge/compiler/`

11 code file(s).

- `emerge/compiler/baseline-tracker.js` (303 lines)  
  exports createBaselineTracker, BaselineTracker, TREND, SIGMA, STATUS, INVARIANT_IDS +1 · requires 1 · required by 0 · tested by `emerge/test/gap-field.test.js`
- `emerge/compiler/emit.js` (725 lines) — compiler/emit.js — T0 + T1 deterministic emitters, extracted from index.js Shared by pipeline.js (SISO stream) and index.js (legacy).  
  exports emitT0, emitT1, normalizeSpec, normalizeModules, sanitizeSpec, computeSpecDepth +12 · requires 2 · required by 1 · tested by `emerge/test/gap-field.test.js`, `emerge/test/invariants.test.js` +1
- `emerge/compiler/gap-field-engine.js` (657 lines)  
  exports computeGapField, estimateTokenCost, getGapsByType, getBlockingGaps, createGapFieldPipeline, buildEmptyField +5 · requires 3 · required by 2 · tested by `emerge/test/gap-field.test.js`, `emerge/test/reply-engine.test.js`
- `emerge/compiler/index.js` (734 lines) — compiler.js — Tier 0 + Tier 1 spec compiler TIER 0 — Structure. Zero LLM. Always runs.  
  exports compile, emitT0, emitT1, computeSpecDepth, computeGenReadiness, Events · requires 3 · required by 2
- `emerge/compiler/invariants-engine.js` (573 lines)  
  exports check, checkNode, checkEdges, checkPropagation, createInvariantsPipeline, violation +2 · requires 2 · required by 1 · tested by `emerge/test/gap-field.test.js`, `emerge/test/invariants.test.js` +1
- `emerge/compiler/kg-builder.js` (587 lines) — Knowledge Graph builder Transforms a ParsedSpec into a KnowledgeGraph: a queryable, self-aware  
  exports build, createKGPipeline, buildNode, computeGaps, assignConfidence, DEPTH +1 · requires 2 · required by 1 · tested by `emerge/test/gap-field.test.js`, `emerge/test/invariants.test.js` +4
- `emerge/compiler/pipeline.js` (546 lines) — compiler/pipeline.js — spec-compiler as a SISO stream THE INSIGHT (from the SISO paper):  
  exports compile, createPipeline, driveAsync, E · requires 10 · required by 2 · tested by `emerge/test/gap-field.test.js`, `emerge/test/kg.test.js` +1
- `emerge/compiler/reply-engine.js` (447 lines)  
  exports plan, selectReadyNodes, prioritize, createReplyPipeline, buildEmptyPlan, RE +1 · requires 4 · required by 1 · tested by `emerge/test/reply-engine.test.js`
- `emerge/compiler/ring-buffer.js` (447 lines)  
  exports RingBuffer, MutationBus, createRingBuffer, createMutationBus, makeMutation
- `emerge/compiler/t2-gate.js` (344 lines) — THE MISSING GATE This is the gate that was always supposed to exist.  
  exports run, dispatch, buildNodePrompt, MODULE_ID, VERSION · requires 1 · required by 1
- `emerge/compiler/tier-contract.js` (286 lines) — compiler/tier-contract.js THE EXECUTION SEMANTICS OF THE COMPILER.  
  exports TIER_CONTRACT, BOUNDARIES, decideTier, decideTierForSpec, shouldEmitT0, shouldEmitT1 +4 · requires 0 · required by 4 · tested by `emerge/test/reply-engine.test.js`, `emerge/test/tier-contract.test.js`

#### `emerge/cortex-query/`

2 code file(s).

- `emerge/cortex-query/index.js` (274 lines) — cortex-query.js — CORTEX_QUERY_SEAM implementation (compiler side) Implements every command declared in CORTEX_QUERY_SEAM.  
  exports queryFiles, queryGaps, querySeams, queryMemory, preflight, ping +1 · requires 0 · required by 3
- `emerge/cortex-query/writeback.js` (411 lines) — cortex-writeback.js — GATE-COMPILER-005 implementation Writes compiler output back to Cortex after every successful T0/T1 run.  
  exports writeback, uploadFiles, commitToVersionium, recordSeamCrossing, recordCompileMemory, writeFailureGaps +1 · requires 0 · required by 3

#### `emerge/idearium/`

1 code file(s).

- `emerge/idearium/client.js` (385 lines) — idearium/client.js — Idearium push/pull client Pushes spec-compiler compile results into Idearium as structured ideas.  
  exports ping, pushCompileResult, pullForModule, pullAllOpen, resolveIdea, sync · requires 0 · required by 1

#### `emerge/output/`

1 other file(s).

- other: `emerge/output/.gitkeep`

#### `emerge/schemas/`

1 code · 7 other file(s).

- `emerge/schemas/index.js` (51 lines) — // emerge/schemas/index.js — emerge's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `emerge/schemas/schema.capability`, `emerge/schemas/schema.command`, `emerge/schemas/schema.component`, `emerge/schemas/schema.hook`, `emerge/schemas/schema.node`, `emerge/schemas/schema.system`, `emerge/schemas/schema.wire`

#### `emerge/seams/`

1 code file(s).

- `emerge/seams/CORTEX_QUERY_SEAM.js` (188 lines) — SEAM: CORTEX_QUERY_SEAM status: active

#### `emerge/siso/`

5 code file(s).

- `emerge/siso/Event.js` (16 lines) — Event — a datum flowing through the stream. Immutable. type is its signature. data is arbitrary.  
  exports Event · requires 0 · required by 2
- `emerge/siso/Gate.js` (16 lines) — Gate — recognises one event type, transforms it. Signature is unique per stream. O(1) lookup.  
  exports Gate · requires 0 · required by 1
- `emerge/siso/Stream.js` (138 lines) — Stream — the processing loop. Gates register by signature. Events arrive via emit().  
  exports Stream · requires 1 · required by 1
- `emerge/siso/StreamLog.js` (30 lines) — StreamLog — the audit trail. Shared across sub-streams. Levels: OFF | EVENTS | DEEP | DATA  
  exports StreamLog · requires 0 · required by 1
- `emerge/siso/index.js` (59 lines) — // ── Bus — named-stream factory with global listener support ────────────────── // bus.onAny(fn) — fn(event) called for every event emitted on ANY stream  
  exports Event, Gate, Stream, StreamLog, Bus · requires 4 · required by 5 · tested by `emerge/test/gap-field.test.js`, `emerge/test/invariants.test.js` +2

#### `emerge/spec/`

2 other file(s).

- other: `emerge/spec/emerge.node-taxonomy.md`, `emerge/spec/emerge.spec`

#### `emerge/test/`

6 test file(s).


#### `erosmancer/erosmancer-os/`

6 other file(s).

- other: `erosmancer/erosmancer-os/CHANGELOG.md`, `erosmancer/erosmancer-os/MANIFEST.json`, `erosmancer/erosmancer-os/README.md`, `erosmancer/erosmancer-os/ROADMAP.md`, `erosmancer/erosmancer-os/package.json`, `erosmancer/erosmancer-os/tsconfig.json`

#### `erosmancer/erosmancer-os/src/`

1 code file(s).

- `erosmancer/erosmancer-os/src/index.ts` (291 lines) — // ============================================================ // ErosmancerOS — Orchestrator v2  
  exports ErosmancerOS, DEFAULT_CONFIG, BEHAVIOR_DEFAULTS, BehaviorEngine, BEHAVIOR_PROFILES, RoutingEngine +3

#### `erosmancer/erosmancer-os/src/adaptive/`

1 code file(s).

- `erosmancer/erosmancer-os/src/adaptive/index.ts` (399 lines) — // ============================================================ // ErosmancerOS — Adaptive Layer  
  exports PatternMemory, StrategyOptimizer

#### `erosmancer/erosmancer-os/src/api/`

1 code file(s).

- `erosmancer/erosmancer-os/src/api/server.ts` (753 lines) — // ============================================================ // ErosmancerOS — API Server v2  
  exports app, server · requires 1 · required by 1

#### `erosmancer/erosmancer-os/src/behavior/`

1 code file(s).

- `erosmancer/erosmancer-os/src/behavior/index.ts` (569 lines) — Box-Muller transform → normal distribution sample  
  exports curvedPath, BEHAVIOR_PROFILES, BehaviorEngine

#### `erosmancer/erosmancer-os/src/bridge/`

1 code file(s).

- `erosmancer/erosmancer-os/src/bridge/index.ts` (381 lines) — // ============================================================ // ErosmancerOS — Bridge Core (continued)  
  exports BridgeCore

#### `erosmancer/erosmancer-os/src/dispatcher/`

1 code file(s).

- `erosmancer/erosmancer-os/src/dispatcher/index.ts` (490 lines) — // ============================================================ // ErosmancerOS — Signal Dispatcher  
  exports SignalDispatcher

#### `erosmancer/erosmancer-os/src/hostile/`

1 code file(s).

- `erosmancer/erosmancer-os/src/hostile/index.ts` (471 lines) — // ============================================================ // ErosmancerOS — Hostile Detection  
  exports HostileDetection

#### `erosmancer/erosmancer-os/src/observer/`

1 code file(s).

- `erosmancer/erosmancer-os/src/observer/index.ts` (470 lines) — // ============================================================ // ErosmancerOS — DOM Observer  
  exports DOMObserver, ShadowDOMMapper

#### `erosmancer/erosmancer-os/src/registry/`

1 code file(s).

- `erosmancer/erosmancer-os/src/registry/index.ts` (394 lines) — // ============================================================ // ErosmancerOS — Node Registry  
  exports NodeRegistry

#### `erosmancer/erosmancer-os/src/replay/`

1 code file(s).

- `erosmancer/erosmancer-os/src/replay/index.ts` (355 lines) — // ============================================================ // ErosmancerOS — ScriptReplayQueue  
  exports ScriptReplayQueue · requires 0 · required by 1

#### `erosmancer/erosmancer-os/src/routing/`

1 code file(s).

- `erosmancer/erosmancer-os/src/routing/index.ts` (349 lines) — // ============================================================ // ErosmancerOS — Routing Engine  
  exports RoutingEngine

#### `erosmancer/erosmancer-os/src/selector/`

1 code file(s).

- `erosmancer/erosmancer-os/src/selector/index.ts` (404 lines) — // ============================================================ // ErosmancerOS — Selector Engine  
  exports SelectorEngine

#### `erosmancer/erosmancer-os/src/telemetry/`

1 code file(s).

- `erosmancer/erosmancer-os/src/telemetry/index.ts` (144 lines) — // ============================================================ // ErosmancerOS — Telemetry  
  exports Telemetry

#### `erosmancer/erosmancer-os/src/types/`

1 code file(s).

- `erosmancer/erosmancer-os/src/types/index.ts` (471 lines) — // ============================================================ // ErosmancerOS — Core Types  
  exports NodeSchema, TabSchema, DEFAULT_CONFIG, BEHAVIOR_DEFAULTS

#### `erosmancer/erosmancer-os/tests/`

6 test file(s).


#### `erosmancer/spec/`

1 other file(s).

- other: `erosmancer/spec/erosmancer.spec`

#### `hooks/`

12 code file(s).

- `hooks/architect.hooks.js` (13 lines) — Architect System Hook Map System: Architect port 3747  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/copilot.hooks.js` (709 lines) — Copilot System Hook Map System: Copilot port 3750  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/cortex.hooks.js` (437 lines) — Cortex System Hook Map Status: pre-release  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/emerge.hooks.js` (411 lines) — Emerge System Hook Map System: Emerge port 4242  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/eravos.hooks.js` (468 lines) — Eravos System Hook Map System: Eravos port 3751  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/guardian.hooks.js` (847 lines) — Guardian System Hook Map Status: pre-release  
  exports systemId, port, version, updatedAt, hooks, byName +3 · requires 0 · required by 1 · emits guardian.dom_map.received
- `hooks/idearium.hooks.js` (14 lines) — Idearium System Hook Map System: Idearium port 4800  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/index.js` (236 lines) — NEXUS Hooks Living Registry Status: pre-release  
  exports SYSTEMS, allHooks, bySystem, byType, byId, byName +10 · requires 10 · required by 3
- `hooks/intelligence.hooks.js` (336 lines) — Intelligence System Hook Map Status: living  
  exports systemId, port, version, updatedAt, hooks, byId +4
- `hooks/ollama.hooks.js` (387 lines) — Ollama System Hook Map System: Ollama port 3749  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/orchestrator.hooks.js` (84 lines) — Orchestrator System Hook Map System: Orchestrator port 9000 — the root surface  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `hooks/side-effect-parser.js` (121 lines)  
  exports parseSideEffect, structuredSideEffects · requires 0 · required by 1 · tested by `tests/hooks-side-effect-parser.test.js`

#### `jaa/`

2 other file(s).

- other: `jaa/schema-full.sql`, `jaa/schema.sql`

#### `lib/`

200 code file(s).

- `lib/account-identity-index.js` (61 lines) — a real, stable UUID per (agent, account), not per session. James: "having a uuid for accounts in the cookie  
  exports resolve, touch, forAgent, TABLE, MODULE_ID, VERSION · requires 1 · required by 0
- `lib/account-registry.js` (194 lines) — CA7 (backend) of the awareness/routing phasemap §PHASEMAP CA7 (docs/copilot-awareness-routing-phasemap.spec, CHUNK D). ClearGlass  
  exports ACCOUNTS_TABLE, PROVIDERS, KNOWN_PROVIDERS_TABLE, addAccount, listAccounts, getAccountForRoute +6 · requires 1 · required by 1
- `lib/agent-build-learning.js` (96 lines) — which agent tends to succeed at building James: "need to try them all, unless it's a system failure... order still  
  exports getConfidence, orderedAgents, recordOutcome, allAgents, TABLE, MODULE_ID +1 · requires 1 · required by 1
- `lib/agent-build-loop.js` (174 lines) — // ───────────────────────────────────────────────────────────────────────────── // lib/agent-build-loop.js — a real agent, writing into a real compartment,  
  exports introspect, buildInCompartment, _extractCode, MODULE_ID, VERSION · requires 4 · required by 0
- `lib/agent-capability-profile.js` (97 lines) — what's actually true about each agent's real capabilities, measured over time, not assumed.  
  exports profile, profileAll, MODULE_ID, VERSION · requires 2 · required by 1
- `lib/agent-capability.js` (313 lines) — // ───────────────────────────────────────────────────────────────────────────── // lib/agent-capability.js — what each agent can ACTUALLY take, measured  
  exports record, profile, chunkFor, calibrate, all, load +11 · requires 1 · required by 1
- `lib/agent-chat.js` (556 lines)  
  exports WAKE_RE, parseWake, ask, converse, readChat, readLiveDom +11 · requires 0 · required by 2
- `lib/agent-council.js` (87 lines) — multiple real agents deliberate on one decision; RAID governs what actually happens with their verdicts.  
  exports convene, summarize, MODULE_ID, VERSION · requires 2 · required by 1
- `lib/agent-facts-hash.js` (26 lines) — GA1: one definition of an agent fact's canonical form and its hash, shared by the side that states the facts (guardian/lib/agent-facts.js) and the side that caches them…  
  exports FIELDS, canonical, hash, MODULE_ID, VERSION · requires 0 · required by 2
- `lib/agent-identity.js` (58 lines) — // lib/agent-identity.js — §NEW 2026-09-17 //  
  exports resolveIdentity, parseIdentity, MODULE_ID, VERSION
- `lib/agent-intent-contract.js` (114 lines) — AM1: real, RAID-checkable per-agent intent contracts.  
  exports checkAgentIntentContract, MODULE_ID, VERSION · tested by `tests/modules/test-agent-hat-agnostic.test.js`
- `lib/agent-memory.js` (259 lines)  
  exports record, recall, search, agentIdFor, _signature, _summarise +2 · requires 6 · required by 7 · tested by `tests/modules/test-agent-memory.test.js`
- `lib/agent-model.js` (252 lines) — // copilot/lib/agent-model.js — §NEW 2026-09-17 //  
  exports init, stop, observe, observeExclusive, getHypotheses, deriveFromFaultLog +5 · requires 3 · required by 1
- `lib/agent-notes.js` (92 lines) — the editable per-agent constraint log James asked for directly, distinct from lib/agent-capability-profile.js's passive,  
  exports note, notesFor, allAgents, TABLE, MODULE_ID, VERSION · requires 1 · required by 1
- `lib/agent-providers.js` (108 lines) — who can wear a hat: one list, one resolver. §0.39.267 — James: "the agent hat is meant to be agnostic, ollama/guardian/copilot."  
  exports headless, HEADLESS, all, guardianProviders, normalize, isKnown +7 · requires 1 · required by 7 · tested by `tests/modules/test-agent-hat-agnostic.test.js`
- `lib/agent-pull.js` (99 lines) — the agent PULL toolbox (agnostic; §AP1 agent-intelligence) James: "inject what's needed into agents, and give them the tools to interact  
  exports pull, listPullTools, MODULE_ID, VERSION · requires 4 · required by 3
- `lib/agent-reach.js` (160 lines) — is this agent ACTUALLY reachable right now? WHY (James, 2026-08-19): "the change agents tool needs to connect to the  
  exports reach, all, providers, KIND, STATE, MODULE_ID +1
- `lib/agent-router.js` (138 lines) — CA5 of the awareness/routing phasemap §PHASEMAP CA5 (docs/copilot-awareness-routing-phasemap.spec, CHUNK C). Maps a  
  exports routeAgent, chunkForAgent, _inferIntent, DEFAULT_ROUTES, DEFAULT_FALLBACK, AGENT_CONSTRAINTS +2 · requires 1 · required by 5
- `lib/agent-tool-call.js` (109 lines) — // lib/agent-tool-call.js — real, pure parser for the tool-call syntax a // browser-typed agent reply uses to request a real tool execution.  
  exports parseToolCall, parseAllToolCalls, stripToolCall, formatToolResult, MODULE_ID, VERSION
- `lib/atlas-generate.js` (224 lines)  
  exports generate, sectionFor, splice, walk, atlasFileFor, START +1 · requires 4 · required by 1
- `lib/autonomous-loop.js` (114 lines) — // ── lib/autonomous-loop.js ─────────────────────────────────────────────────── // UUID: nexus-autonomous-loop-v1-0000-4000-0000-000000000001  
  exports run, validateWiring, MODULE_ID, VERSION · requires 0 · required by 2
- `lib/autonomous-repair.js` (113 lines) — R3: co-pilot notices, and fixes the same safe way docs/repair-contract-and-loom-hub-phasemap.spec R3. James: "loom is  
  exports wireAutonomousRepair, REPAIRABLE_GAP_TYPES, _diagnose, _applyRepair, MODULE_ID, VERSION · requires 3 · required by 0
- `lib/autopilot-intelligence.js` (109 lines) — wire + verify the intelligence substrate at boot James: "completely update the entire autopilot. Check lib, the intelligence  
  exports wireIntelligence, MODULE_ID, VERSION · requires 5 · required by 1
- `lib/blueprint-index.js` (354 lines) — Phase BP-01: Live System Blueprint Index Maps every NEXUS system to its live component set, CLI commands,  
  exports build, load, copilotContextBlock, lookupGrammar, lookupCLI, systemMap +2 · requires 0 · required by 4 · emits nexus.blueprint.index.built, nexus.blueprint.index.error
- `lib/blueprint.js` (251 lines) — Phase 42: Blueprint The loop closes. The system reads itself.  
  exports init, compile, load, sigma, MODULE_ID, VERSION +2 · requires 7 · required by 0 · emits blueprint.loaded
- `lib/boot-sequence.js` (211 lines) — lib/boot-sequence.js Gated boot engine. Used by every system.  
  exports BootSequence
- `lib/build-pipeline.js` (141 lines) — HTTP/SSE front door for the closed build loop §GAP CLOSED 2026-07-07 — the closed loop this wraps already exists and  
  exports startBuild, getBuild, listBuilds · requires 1 · required by 1
- `lib/build-verify.js` (224 lines) — does the code a spec produced actually work? One verification, graded, every failure attributed to one file with the exact error.  
  exports verify, attributeTest, loadsOf, cleanOutput, checkData, checkPython +5 · requires 2 · required by 1 · tested by `tests/modules/test-build-verify.test.js`
- `lib/bus-subscriptions.js` (259 lines)  
  exports MODULE_ID, VERSION, TABLE, STALE_MS, publish, publishPeriodically +4 · requires 0 · required by 3 · tested by `tests/modules/test-adversarial-sim.js`, `tests/modules/test-bus-subscriptions.js`
- `lib/capability-registry.js` (143 lines)  
  exports MODULE_ID, VERSION, init, capabilities, buildToolsPrompt, resolve +2 · requires 0 · required by 3 · tested by `tests/modules/test-capability-registry.js`
- `lib/case-library.js` (309 lines) — // ── lib/case-library.js ─────────────────────────────────────────────────────── // UUID: nexus-case-library-v1-0000-4600-0000-000000000001  
  exports indexCompartment, query, validateWiring, _resetInMemoryState, _evictOverflow, _mostRecentTrace +6 · requires 2 · required by 1 · tested by `tests/modules/case-library.test.js`
- `lib/cg-learning.js` (180 lines)  
  exports MODULE_ID, VERSION, T, HEALABLE, NOT_FOUND, hostOf +11 · requires 1 · required by 3
- `lib/chains.js` (131 lines)  
  exports runChain, MODULE_ID, VERSION · requires 3 · required by 1
- `lib/chat-index.js` (56 lines) — // lib/chat-index.js — the real-time chat index James asked ClearGlass's // download manager to become: "separated by provider, then agent, then  
  exports buildChatIndex, MODULE_ID, VERSION
- `lib/chat-logger.js` (287 lines) — NEXUS Chat Logger Logs every AI exchange — NCP, Ollama, direct chat — to JAA's chat_log table  
  exports startSession, getSession, log, buildInjectionContext, sessionSummary, listSessions +3 · requires 1 · required by 2
- `lib/chunk-build-orchestrator.js` (122 lines)  
  exports buildWithFallback, _isInfraFailure, MODULE_ID, VERSION · requires 4 · required by 0
- `lib/chunk-glyph.js` (198 lines)  
  exports VERSION, glyph, glyphCode, glyphProse, glyphData, documentFrequencies · requires 0 · required by 1 · tested by `tests/modules/test-nexus-self-and-cos-run.test.js`
- `lib/chunk-service.js` (94 lines) — chunking consolidated through the RAID engine (James) James: "RAID engine consolidate chunking." Chunking was scattered across FOUR  
  exports chunk, chunkGoverned, CAPABILITY, MODULE_ID, VERSION · requires 1 · required by 2
- `lib/claude-code-backend.js` (181 lines) — // lib/claude-code-backend.js — Claude Code as an Idearium agent backend (IN2a). // component_id: lib.claude-code-backend  
  exports MODULE_ID, VERSION, DEFAULT_TOOLS, binary, mcpConfig, argsFor +6 · requires 0 · required by 1
- `lib/clear-glass-stream-bridge.js` (135 lines)  
  exports enable, disable, status, _parseSseChunk · requires 0 · required by 1
- `lib/cli-map.js` (149 lines) — Phase 40.5: CLI Map Generator Reads all registered component descriptors from the registry,  
  exports generate, load, getDispatchTable, getHelpText, CLI_MAP_PATH, MODULE_ID +1 · requires 3 · required by 1
- `lib/cli-reasoning.js` (312 lines) — CLI Reasoning Layer (Qwen 0.5b) Qwen 0.5b as the CLI's reasoning layer.  
  exports isAvailable, rephrase, identifyGap, suggestCorrection, agentCheck, resolve +3 · requires 1 · required by 1
- `lib/code-edit.js` (447 lines)  
  exports VERSION, VIA, planEdits, unifiedDiff, diagnose, current +6 · requires 3 · required by 1
- `lib/command-builder.js` (182 lines)  
  exports parseRequest, resolveCapability, buildCommand, getCommand, listCommands, runCommand +3 · requires 4 · required by 1
- `lib/compartment-dom-ledger.js` (57 lines) — lib/compartment-dom-ledger.js §MCO10 2026-09-13 — James: "stream the DOM to the compartment ledger per  
  exports recordDomEvent · tested by `tests/modules/mco10-compartment-dom-ledger.test.js`
- `lib/compartment-engine.js` (455 lines) — // ── lib/compartment-engine.js ───────────────────────────────────────────────── // UUID: nexus-compartment-engine-v1-0000-4000-0000-000000000001  
  exports spawn, execute, resolve, _registerExtensions, validateWiring, STATUS +2 · requires 8 · required by 0 · emits compartment.spawned · tested by `tests/modules/compartment-engine.test.js`
- `lib/component-boundary-check.js` (83 lines) — lib/component-boundary-check.js §MCO15 2026-09-13 (Track C — component compiler, boundary detection).  
  exports checkComponentBoundary · requires 1 · required by 0 · tested by `tests/modules/mco15-component-boundary-check.test.js`
- `lib/component-exec-test.js` (97 lines)  
  exports execTestFile, execTestComponent, DEFAULT_TIMEOUT_MS · tested by `tests/modules/mco15-component-exec-test.test.js`
- `lib/component-ledger.js` (502 lines) — // ── lib/component-ledger.js — Per-Component, Per-System Ledger ────────────── // UUID: nexus-component-ledger-v1-0000-4000-0000-000000000001  
  exports write, schemaCoverage, intakeCoverage, tail, bySystem, byComponent +10 · requires 0 · required by 13 · tested by `tests/modules/test-adversarial-sim.js`, `tests/modules/test-boot-log-fixes.js` +1
- `lib/component-registry.js` (661 lines) — NEXUS Component Registry The self-describing kernel of the NEXUS UI architecture.  
  exports getSchema, register, registerBatch, get, list, update +7 · requires 2 · required by 7 · emits component.deprecated, component.hard_deleted, component.updated, registry.grammar.rebuilt · tested by `tests/modules/nexus-repl-descriptors.test.js`, `tests/modules/test-component-registry.js` +2
- `lib/component-store.js` (314 lines)  
  exports markFailed, storeDir, idFor, contractDigest, promptDigest, specsOf +11 · requires 1 · required by 3 · tested by `tests/modules/test-build-verify.test.js`, `tests/modules/test-component-store.test.js`
- `lib/config-governance.js` (223 lines)  
  exports recordConfigChange, MODULE_ID, VERSION, ANOMALY_SIGMA, ANOMALY_SEVERITY · requires 1 · required by 0 · emits anomaly.detected · tested by `tests/modules/test-adversarial-sim.js`, `tests/modules/test-config-governance.js`
- `lib/connections.js` (169 lines)  
  exports registerScope, call, openSSE, listOpenStreams, closeAll, _resetForTest +2 · requires 2 · required by 1
- `lib/consent.js` (73 lines) — explicit, per-item, revocable consent registry §CONSENT — this file exists because of one specific line in  
  exports setConsent, getConsent, isGranted
- `lib/constant-autonomy.js` (162 lines)  
  exports start, stop, status, defaultPropose, _cycle, _resetForTest +2 · requires 5 · required by 1
- `lib/constitutional-ai.js` (419 lines) — // ── lib/constitutional-ai.js ────────────────────────────────────────────────── // UUID: nexus-constitutional-ai-v1-0000-4000-0000-000000000001  
  exports check, checkGoalAlignment, getIdentityKernel, validateWiring, AXIOMS, SEVERITY +3 · requires 3 · required by 3 · emits constitution.decision · tested by `tests/modules/constitutional-ai.test.js`
- `lib/consumer-registry.js` (186 lines)  
  exports MODULE_ID, VERSION, init, producers, consumers, consumersDetailed +3 · requires 1 · required by 0 · tested by `tests/modules/test-bus-subscriptions.js`, `tests/modules/test-consumer-registry.js`
- `lib/context-atlas.js` (381 lines)  
  exports MODULE_ID, VERSION, DESCRIBED, NOISY, tables, directory +6 · requires 5 · required by 3
- `lib/context-builder.js` (276 lines) — NEXUS System Context Builder Status: pre-release  
  exports buildContext, buildSemanticContext, compressHistory, checkArtifactCache, estimateTokens, MODULE_ID · requires 2 · required by 1
- `lib/contract-queue.js` (354 lines) — lib/contract-queue.js  
  exports create, dispatch, accept, complete, fail, pending +11 · requires 1 · required by 2 · tested by `tests/modules/test-adversarial-sim.js`, `tests/modules/test-contract-queue-hardening.js`
- … 140 more code files — loom.find.tool

#### `lib/activity-log/`

1 code file(s).

- `lib/activity-log/index.js` (82 lines) — per-system activity + error logging into cortex James: "a log for each system, a full log for activity to save in cortex, like  
  exports attach, enable, disable, status, _isError, _resetForTest +2 · requires 1 · required by 1

#### `lib/agent-system/`

2 code file(s).

- `lib/agent-system/contracts.js` (216 lines)  
  exports getContract, agentCan, listAgents, outputFolder, AGENTS, ALL_TOOLS +2 · requires 0 · required by 2
- `lib/agent-system/submit.js` (162 lines) — an agent's output → a file matching the output contract → RAID for testing → integration decision.  
  exports submitOutput, validate, listOutputs, OUTPUT_CONTRACT_SCHEMA, MODULE_ID, VERSION · requires 1 · required by 0

#### `lib/agent-tools/`

9 code file(s).

- `lib/agent-tools/generate-agent-nodes.js` (106 lines) — // lib/agent-tools/generate-agent-nodes.js — real generator + real listener // for .agent node instances.  
  exports generate, checkDrift, startDriftListener, NODES_DIR · requires 1 · required by 0
- `lib/agent-tools/generate-tool-nodes.js` (111 lines) — // lib/agent-tools/generate-tool-nodes.js — real generator + real listener. // James: "in the nodes folder in lib. they all need to be a real yaml  
  exports generate, checkDrift, startDriftListener, NODES_DIR, REAL_AGENTS · requires 1 · required by 0
- `lib/agent-tools/index.js` (632 lines) — Sovereign agent tool-calling core §ARCHITECTURE — sovereign, not a monolith bolted onto copilot. This  
  exports registerTool, getToolSchemas, executeTool, runToolLoop, TOOLS
- `lib/agent-tools/naming.js` (97 lines) — the real naming convention James specified: System.toolname.tool — e.g. guardian.build.tool  
  exports VALID_SYSTEMS, VALID_PROVIDERS, toolName, commandName, agentToolName, parseName · requires 0 · required by 14 · tested by `tests/modules/test-gap-tools.js`, `tests/modules/test-tool-naming-convention.js`
- `lib/agent-tools/tool-call-listener.js` (118 lines) — lib/agent-tools/tool-call-listener.js §BUILT 2026-09-08 — James: "the listener for the tools. like when an  
  exports install, recordCall, recordResult, findRecentResult, TABLE, REUSE_WINDOW_MS · hears guardian.tool.called · tested by `tests/modules/tool-call-listener.test.js`
- `lib/agent-tools/tool-catalog.js` (131 lines) — every registered tool, in plain language. §BUILT 0.39.257 — James: "need the full capabilities, with the /help and tool  
  exports GROUPS, OTHER, groupOf, catalog, search, firstSentence +3 · requires 0 · required by 3
- `lib/agent-tools/tool-guide.js` (236 lines) — CA2 of the awareness/routing phasemap §PHASEMAP CA2 (docs/copilot-awareness-routing-phasemap.spec). Tool schemas  
  exports toolGuide, noteFor, GUIDE_VERSION, NOTES, allNoteNames, _forgedNote
- `lib/agent-tools/tool-root.js` (41 lines) — which tree a file tool works in. §BUILT 0.39.257 — James: "the toolscope for the agents tab. need the full  
  exports NEXUS_ROOT, rootFor, safeResolve, WHERE_PARAM · requires 0 · required by 2
- `lib/agent-tools/user-guide-generator.js` (154 lines)  
  exports generate, write, OUT_FILE, GROUPS, MODULE_ID, VERSION

#### `lib/agent-tools/tools/accounts/`

1 code file(s).

- `lib/agent-tools/tools/accounts/account-manage.js` (121 lines) — account_manage tool §BUILT 2026-09-19 — closes the deeper half of BR8 (docs/2026-08-27-  
  exports name, description, read, update, delete, label

#### `lib/agent-tools/tools/agent-mesh/`

1 code file(s).

- `lib/agent-tools/tools/agent-mesh/route.js` (60 lines) — lib/agent-tools/tools/agent-mesh/route.js James: "wires tools for copilot for... agentmesh." Real, confirmed  
  exports name, description, parameters, properties

#### `lib/agent-tools/tools/autofill/`

1 code file(s).

- `lib/agent-tools/tools/autofill/autofill-manage.js` (124 lines)  
  exports name, description

#### `lib/agent-tools/tools/bookmarks/`

1 code file(s).

- `lib/agent-tools/tools/bookmarks/bookmarks-manage.js` (107 lines) — bookmarks_manage tool §BUILT 2026-09-19 — closes the bookmarks half of docs/2026-08-27-  
  exports name, description, remove, list, open

#### `lib/agent-tools/tools/browser/`

1 code file(s).

- `lib/agent-tools/tools/browser/browser-action.js` (257 lines) — lib/agent-tools/tools/browser-action.js — browser_action tool §BUILT 2026-07-13 — "Guardian is supposed to use Clear Glass. It's  
  exports name, description

#### `lib/agent-tools/tools/clear-glass/`

12 code file(s).

- `lib/agent-tools/tools/clear-glass/automation.js` (166 lines) — clear_glass_automation: the co-pilot builds, runs and inspects Clear Glass workflows.  
  exports name, description, http, workflow, stop
- `lib/agent-tools/tools/clear-glass/browser-automation.js` (83 lines) — clear_glass_browser: a real browser page an agent drives step by step, with the automation DOM tools.  
  exports name, description
- `lib/agent-tools/tools/clear-glass/browser.js` (231 lines)  
  exports name, description, providers, accounts, macros, headings +1 · requires 2 · required by 2 · tested by `tests/modules/clear-glass-agent-surface.test.js`
- `lib/agent-tools/tools/clear-glass/command-index.js` (132 lines) — James: "hooked into co-pilot so it can use clearglass at full compatibility."  
  exports name, description, parameters, properties, enum · tested by `tests/modules/clear-glass-agent-surface.test.js`
- `lib/agent-tools/tools/clear-glass/dom-archaeology.js` (71 lines) — real agent access to ClearGlass's DOM Archaeology panel. James: "dom archeology  
  exports name, description, parameters, properties, chatgpt
- `lib/agent-tools/tools/clear-glass/learned.js` (77 lines) — clearglass.learned.tool: what copilot has learned, and using it. James, 2026-09-27: "also have him learn." lib/cg-learning.js keeps what happened on each site (selectors that  
  exports name, description, actions, failures, heals · requires 5 · required by 0
- `lib/agent-tools/tools/clear-glass/macro.js` (444 lines)  
  exports name, description, store
- `lib/agent-tools/tools/clear-glass/provider-deploy.js` (84 lines) — lib/agent-tools/tools/clear-glass/provider-deploy.js §PHASE-2 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md item 3:  
  exports name, description, parameters, properties, chatgpt, gemini
- `lib/agent-tools/tools/clear-glass/search-engine.js` (262 lines)  
  exports name, description
- `lib/agent-tools/tools/clear-glass/stream-bridge.js` (35 lines) — clear_glass_stream_bridge tool §BUILT 2026-09-19 — thin wrapper over lib/clear-glass-stream-bridge.js's  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/clear-glass/tab-visibility.js` (69 lines) — real agent control over whether a provider tab is visible or backgrounded.  
  exports name, description, parameters, properties, chatgpt
- `lib/agent-tools/tools/clear-glass/userscripts.js` (74 lines) — real agent access to ClearGlass's userscript manager. James: "need to create a full  
  exports name, description, parameters, properties, enum

#### `lib/agent-tools/tools/coordination/`

10 code file(s).

- `lib/agent-tools/tools/coordination/agent-capability.js` (43 lines) — lib/agent-tools/tools/agent-capability.js — real, measured per-agent capability data, not assumed constraints. Thin wrapper (§16.5) over  
  exports name, description, duration, parameters, properties, enum
- `lib/agent-tools/tools/coordination/agent-chat.js` (128 lines) — address ONE other agent (chatgpt/claude/gemini/perplexity/...) as a real conversational  
  exports name, description, openingLine, parameters, properties, enum
- `lib/agent-tools/tools/coordination/agent-council.js` (67 lines) — lib/agent-tools/tools/agent-council.js — convene multiple real agents on one decision. Thin wrapper (§16.5) over lib/agent-council.js, wired  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/coordination/agent-notes.js` (54 lines) — real, editable per-agent constraint log, reachable from chat. Thin wrapper (§16.5)  
  exports name, description, source, relatesTo, parameters, properties +1
- `lib/agent-tools/tools/coordination/capability-tools.js` (206 lines)  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/coordination/framework-builder.js` (39 lines) — real, agent-callable access to intelligence/framework-builder.js. Closes the  
  exports name, description, parameters, properties
- `lib/agent-tools/tools/coordination/intelligence-query.js` (69 lines) — real, comprehensive copilot access to the intelligence system. James: "make  
  exports name, description, status, failures, parameters, properties +1
- `lib/agent-tools/tools/coordination/nexus-wake-events.js` (42 lines) — real, agent- callable access to "hey nexus" moments captured anywhere in the system.  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/coordination/parallel-dispatch.js` (54 lines) — lib/agent-tools/tools/parallel-dispatch.js — different jobs to different agents at the same time, thin wrapper (§16.5) over  
  exports name, description, prompt
- `lib/agent-tools/tools/coordination/roundtable.js` (82 lines) — lib/agent-tools/tools/roundtable.js — the real "shared chat where the council can all talk to each other, me included." Thin wrapper (§16.5)  
  exports name, description, shared, parameters, properties, enum

#### `lib/agent-tools/tools/cortex/`

1 code file(s).

- `lib/agent-tools/tools/cortex/node-tag.js` (94 lines) — cortex.node_tag.tool James's taxonomy: "A .node tagging .tool."  
  exports name, description, event, parameters, properties, enum · requires 1 · required by 0 · tested by `tests/modules/test-gap-tools.js`

#### `lib/agent-tools/tools/diagnostic/`

7 code file(s).

- `lib/agent-tools/tools/diagnostic/diagnose.js` (77 lines) — lib/agent-tools/tools/diagnose.js — diagnose tool Expansion map: "Copilot-as-NEXUS" phase, build-order item (1).  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/diagnostic/loom-scan.js` (115 lines) — lib/agent-tools/tools/loom-scan.js — copilot's access to loom's scanners §WIRED 2026-08-12 (James: "use co-pilot to use loom to expand, diagnose...").  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/diagnostic/mock-data-finder.js` (46 lines) — dedicated real tool for finding literal fake/placeholder data left in the codebase.  
  exports name, description, parameters, properties, items · requires 1 · required by 0
- `lib/agent-tools/tools/diagnostic/nexus-heal.js` (76 lines) — lib/agent-tools/tools/nexus-heal.js — copilot's access to nexus-healer §WIRED 2026-08-12. nexus-heal proposes fixes for gaps/diagnostics found  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/diagnostic/resource-monitor.js` (101 lines)  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/diagnostic/stub-finder.js` (46 lines) — dedicated real tool for finding stubs/mocks/placeholders in the codebase.  
  exports name, description, mocks, parameters, properties, items · requires 1 · required by 0
- `lib/agent-tools/tools/diagnostic/system-priority.js` (61 lines) — system_priority tool §BUILT 2026-08-17 — wraps lib/gap-priority.js, lib/system-check.js, and  
  exports name, description, parameters, properties, enum · requires 3 · required by 0

#### `lib/agent-tools/tools/execution/`

11 code file(s).

- `lib/agent-tools/tools/execution/call-system.js` (75 lines) — lib/agent-tools/tools/call-system.js — P6 of the omniscience phasemap §PHASEMAP P6 — omnipotence completed: every REGISTERED system is reachable by  
  requires 2 · required by 0
- `lib/agent-tools/tools/execution/dedup-table.js` (67 lines) — real .tool wrapper around cortex/memory/table-deduplicator.js's own dedupeAll(). Built on  
  exports name, description, parameters, properties, items · requires 2 · required by 1
- `lib/agent-tools/tools/execution/delete-file.js` (46 lines) — delete_file tool §WIRED 2026-08-14 — same safe-path containment as read_file/file_tree  
  exports name, description, parameters, properties
- `lib/agent-tools/tools/execution/emergence.js` (82 lines) — lib/agent-tools/tools/emergence.js — the real "give it axioms and an end-state, let it try, pivot the method if the same one keeps failing"  
  exports name, description, parameters, properties
- `lib/agent-tools/tools/execution/forge-tool.js` (66 lines) — lib/agent-tools/tools/forge-tool.js — the command that lets copilot make tools. "Giving the system a system for its own capabilities." (James, 2026-08-09)  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/execution/move-data.js` (95 lines) — lib/agent-tools/tools/move-data.js — move_data tool Expansion map: "Copilot-as-NEXUS" phase, build-order item (1).  
  exports name, description, event_log, parameters, properties, enum
- `lib/agent-tools/tools/execution/run-chain.js` (45 lines) — lib/agent-tools/tools/run-chain.js — copilot's access to lib/chains.js. §WIRED 2026-08-12 — closes P6_copilot_programmable's second gap (docs/  
  exports name, description
- `lib/agent-tools/tools/execution/run-closed-loop.js` (157 lines)  
  exports name, description, parameters, properties
- `lib/agent-tools/tools/execution/run-command.js` (67 lines) — lib/agent-tools/tools/run-command.js — run_command tool Spec: docs/forge.spec §command_and_keyword_layer (status was  
  exports name, description · requires 2 · required by 0
- `lib/agent-tools/tools/execution/run-pipeline.js` (81 lines) — lib/agent-tools/tools/run-pipeline.js — run_pipeline tool §THE HIGHEST-VALUE ORPHAN WIRE — lib/execution-pipeline.js is the full  
  exports name, description, provider, parameters, properties, enum · requires 2 · required by 0
- `lib/agent-tools/tools/execution/safe-apply.js` (68 lines) — lib/agent-tools/tools/safe-apply.js — the real "verify before merge" command. Thin wrapper (§16.5) over lib/safe-apply.js.  
  exports name, description, apply, check, parameters, properties +1

#### `lib/agent-tools/tools/faculty/`

2 code file(s).

- `lib/agent-tools/tools/faculty/faculty-tools.js` (209 lines) — lib/agent-tools/tools/faculty-tools.js — P5 of the omniscience phasemap §PHASEMAP P5. The copilot faculties (adversarial, module-builder,
- `lib/agent-tools/tools/faculty/ui-tools.js` (90 lines) — lib/agent-tools/tools/ui-tools.js — P8 of the bridge phases §PHASEMAP P8 (docs/raid-warp-verification-phasemap.spec, Part II). Co-pilot

#### `lib/agent-tools/tools/governance/`

10 code file(s).

- `lib/agent-tools/tools/governance/ask-james.js` (124 lines) — ask_james tool §WIRED 2026-08-14 — James, directly: "I want co-pilot to not give 'no'  
  exports name, description, parameters, properties, enum · requires 2 · required by 0
- `lib/agent-tools/tools/governance/axiom-manage.js` (67 lines) — axiom_manage tool §WIRED 2026-08-14 — James: "axioms." axiom_check (faculty-tools.js,  
  exports name, description, remove, freeze, list, text +4 · requires 1 · required by 0
- `lib/agent-tools/tools/governance/loom-register.js` (115 lines) — loom_register tool §WIRED 2026-08-14 — James: "build new capabilities for the systems, and  
  exports name, description · requires 1 · required by 0
- `lib/agent-tools/tools/governance/propose-idea.js` (87 lines) — lib/agent-tools/tools/propose-idea.js — copilot proposes improvements. Idearium is the landing zone; lib/idea-provenance.js is the discipline that  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/governance/raid-snr.js` (75 lines) — lib/agent-tools/tools/raid-snr.js — copilot's access to RAID's decisions, tunables, and the SNR pre-gate.  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/governance/register-trigger.js` (66 lines) — lib/agent-tools/tools/register-trigger.js — copilot's access to lib/triggers.js §WIRED 2026-08-12. Same gap as schedule-task.js's, reactive half: lib/triggers.js  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/governance/schedule-task.js` (72 lines) — lib/agent-tools/tools/schedule-task.js — copilot's access to lib/scheduler.js §WIRED 2026-08-12 (James: "co-pilot can schedule tasks, jobs, alarms... fully  
  exports name, description, system, parameters, properties, enum
- `lib/agent-tools/tools/governance/spec-wizard.js` (119 lines)  
  exports name, description
- `lib/agent-tools/tools/governance/tool-config.js` (133 lines) — tool_config tool spec: docs/copilot-tool-system.spec § P1  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/governance/versionium-commit.js` (109 lines)  
  exports commitTool, historyTool, restoreTool

#### `lib/agent-tools/tools/guardian/`

2 code file(s).

- `lib/agent-tools/tools/guardian/build.js` (93 lines) — guardian.build.tool James's taxonomy: "Building and coding .tools for guardian."  
  exports name, description, parameters, properties · requires 1 · required by 0 · tested by `tests/modules/test-gap-tools.js`
- `lib/agent-tools/tools/guardian/dispatch.js` (70 lines) — lib/agent-tools/tools/guardian/dispatch.js James: "wires tools for copilot for... guardian." Real, confirmed  
  exports name, description, parameters, properties, chatgpt, gemini

#### `lib/agent-tools/tools/history/`

1 code file(s).

- `lib/agent-tools/tools/history/history-manage.js` (101 lines) — history_manage tool §BUILT 2026-09-19 — James: "history manager." clear-glass/src/history/  
  exports name, description, list, delete

#### `lib/agent-tools/tools/idearium/`

2 code file(s).

- `lib/agent-tools/tools/idearium/code.js` (283 lines)  
  exports ALL, CODE_TOOLS, READ_ONLY, LISTED, code_map, code_search +10 · requires 2 · required by 1
- `lib/agent-tools/tools/idearium/repo-chunks.js` (104 lines) — idearium.repo_chunks.tool The compartment agent's way to read a repo's CHUNK NODES for context, when it  
  exports name, description, parameters, properties · requires 1 · required by 0

#### `lib/agent-tools/tools/identity/`

4 code file(s).

- `lib/agent-tools/tools/identity/copilot-identity.js` (58 lines) — lib/agent-tools/tools/copilot-identity.js — copilot's own settable name. §WIRED 2026-08-12 (P6 of docs/copilot-full-capability-phasemap.spec).  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/identity/hat-forge.js` (80 lines) — lib/agent-tools/tools/hat-forge.js — the actual "command to make new hats." Thin wrapper over lib/hat-forge.js (§16.5) — all validation,  
  exports name, description, prompt
- `lib/agent-tools/tools/identity/intent-hat.js` (34 lines) — intent_hat tool §WIRED 2026-08-17 — wraps lib/intent-hat-router.js. See that module's  
  exports name, description, parameters, properties, enum · requires 1 · required by 0
- `lib/agent-tools/tools/identity/switch-agent.js` (47 lines) — switch_agent tool §WIRED 2026-08-14 — James: "I want the switch agent to work." Checked  
  exports name, description, parameters, properties, enum · requires 1 · required by 0

#### `lib/agent-tools/tools/loom/`

1 code file(s).

- `lib/agent-tools/tools/loom/harness.js` (183 lines)  
  exports find, card, read, write, test, HARNESS_TOOLS · requires 2 · required by 0

#### `lib/agent-tools/tools/mesh/`

1 code file(s).

- `lib/agent-tools/tools/mesh/agent-mesh-route.js` (170 lines)  
  exports name, description, message

#### `lib/agent-tools/tools/ncp/`

1 code file(s).

- `lib/agent-tools/tools/ncp/status.js` (56 lines) — lib/agent-tools/tools/ncp/status.js James: "wires tools for copilot for... ncp." Real, confirmed  
  exports name, description, chatgpt, gemini, perplexity, parameters +1

#### `lib/agent-tools/tools/nexus/`

1 code file(s).

- `lib/agent-tools/tools/nexus/tool-layers.js` (76 lines) — the agent tools as layers. §0.39.278 — James: "need to expose the agent tools as layers. layer one is the command to list the 2 layer, which  
  exports tools, expand, LAYER_TOOLS · requires 3 · required by 1

#### `lib/agent-tools/tools/ollama/`

1 code file(s).

- `lib/agent-tools/tools/ollama/generate.js` (73 lines) — lib/agent-tools/tools/ollama/generate.js §BUILT 2026-09-08 — James: "need to check the agent tools... fix and  
  exports name, description, private, parameters, properties · requires 1 · required by 0

#### `lib/agent-tools/tools/opportunity/`

1 code file(s).

- `lib/agent-tools/tools/opportunity/opportunity.js` (79 lines) — nexus.opportunity.tool: the job/freelance pipeline for agents. Everything lib/opportunity does, except the two things only James does: approving an application and editing his  
  exports name, description · requires 2 · required by 0 · tested by `tests/modules/test-opportunity.test.js`

#### `lib/agent-tools/tools/query/`

17 code file(s).

- `lib/agent-tools/tools/query/agent-chat-search.js` (120 lines) — lib/agent-tools/tools/agent-chat-search.js — "do you remember when we talked about X" / "do you remember when I talked to Y about X".  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/query/ambiguity-pull.js` (151 lines)  
  exports name, description, parameters, properties, enum · requires 3 · required by 0
- `lib/agent-tools/tools/query/compiler-info.js` (44 lines) — compiler_info tool §WIRED 2026-08-14 — James asked for a "compiler" tool. Checked first:  
  exports name, description, parameters, properties, enum · requires 1 · required by 0
- `lib/agent-tools/tools/query/context-atlas.js` (50 lines) — nexus.context.tool: every memory system and graph, one door. James, 2026-09-27: "idearium agents should be able to find the context easily when talking to them, all of the  
  exports name, description, crystals, fix_map, fault_log, gaps +1 · requires 2 · required by 0
- `lib/agent-tools/tools/query/fault-log.js` (53 lines) — lib/agent-tools/tools/fault-log.js — real fault/failure precedent, not a fabricated risk score. Thin wrapper (§16.5) over lib/fault-log.js.  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/query/file-tree.js` (97 lines) — file_tree tool §WIRED 2026-08-14 — James: "give you a tool to check loom, cortex and  
  exports name, description, parameters, properties · requires 1 · required by 0
- `lib/agent-tools/tools/query/meta-query.js` (137 lines)  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/query/nexus-help.js` (86 lines) — lib/agent-tools/tools/nexus-help.js — "ask co-pilot anything about NEXUS." §WIRED 2026-08-12 (P11 of docs/copilot-full-capability-phasemap.spec).  
  exports name, description, versions, parameters, properties, enum
- `lib/agent-tools/tools/query/nexus-map.js` (145 lines)  
  exports name, description, hooks, parameters, properties, enum · requires 2 · required by 0
- `lib/agent-tools/tools/query/nexus-status.js` (120 lines) — lib/agent-tools/tools/nexus-status.js — nexus_status tool §BUILT 2026-07-14 — "copilot needs to be the face of NEXUS, can do  
  exports name, description, table, parameters, properties, enum · requires 3 · required by 0
- `lib/agent-tools/tools/query/notes-todo.js` (89 lines) — notes_todo tool §WIRED 2026-08-14 — James: "take notes. to do list." Checked first:  
  exports name, description, parameters, properties, enum · requires 1 · required by 0
- `lib/agent-tools/tools/query/query-intelligence.js` (177 lines)  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/query/query-lenses.js` (51 lines) — lib/agent-tools/tools/query-lenses.js — copilot reads through many lenses at once. Wraps lib/lenses.js. The value is not the readings, it is the CONTRAST:  
  exports name, description, ABSTAIN, parameters, properties, enum
- `lib/agent-tools/tools/query/query-movement.js` (104 lines) — lib/agent-tools/tools/query-movement.js — copilot's access to system movement. §WIRED 2026-08-08. lib/movement.js and lib/manifest.js existed with a CLI and  
  exports name, description, events, ledgers, changes, gaps +5
- `lib/agent-tools/tools/query/query-recall.js` (82 lines) — lib/agent-tools/tools/query-recall.js — query_recall tool Spec: docs/nexus-copilot-recall.spec chunk_1  
  exports name, description, recency, parameters, properties · requires 0 · required by 1
- `lib/agent-tools/tools/query/read-file.js` (64 lines) — lib/agent-tools/tools/read-file.js — read_file tool The actual answer to "Ollama reading a file should be a tool it  
  exports name, description, parameters, properties · requires 1 · required by 0
- `lib/agent-tools/tools/query/search-files.js` (103 lines) — search_files tool §BUILT 2026-08-18 — James: "query for a file or keyword." Checked  
  exports name, description, parameters, properties

#### `lib/agent-tools/tools/sandbox/`

9 code file(s).

- `lib/agent-tools/tools/sandbox/cos-archetype.js` (96 lines) — copilot's access to COS archetype gates (assign/import/detect a compartment template).  
  exports name, description, assign, detect, parameters, properties +1 · requires 3 · required by 0 · emits host:archetype:import
- `lib/agent-tools/tools/sandbox/cos-blueprint.js` (85 lines) — copilot's access to COS blueprint gates (a blueprint = a reusable multi-compartment topology  
  exports name, description, parameters, properties, enum · requires 2 · required by 0
- `lib/agent-tools/tools/sandbox/cos-compartment.js` (173 lines) — lib/agent-tools/tools/cos-compartment.js — copilot's access to COS (Compartment OS) compartment lifecycle.  
  exports name, description, start, stop, destroy, list +4
- `lib/agent-tools/tools/sandbox/cos-playground.js` (84 lines) — copilot's access to COS playground gates. A playground is a disposable, isolated experiment  
  exports name, description, list, promote, parameters, properties +1 · requires 2 · required by 0
- `lib/agent-tools/tools/sandbox/cos-plugin.js` (80 lines) — copilot's access to COS plugin gates (host/gates/plugin.js: install/enable/disable/remove).  
  exports name, description, parameters, properties, enum · requires 2 · required by 0
- `lib/agent-tools/tools/sandbox/cos-simulate.js` (133 lines) — lib/agent-tools/tools/cos-simulate.js — copilot's access to COS's LLM mental-simulation lab.  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/sandbox/cos-vault.js` (105 lines) — copilot's access to COS vault gates (host/gates/vault.js: set/get/delete/grant/revoke/export/  
  exports name, description, key, toCompartmentName, parameters, properties +1 · requires 2 · required by 0
- `lib/agent-tools/tools/sandbox/rewind-replay.js` (95 lines) — lib/agent-tools/tools/rewind-replay.js — copilot's access to Clear Glass's RewindEngine.  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/sandbox/self-repair.js` (231 lines)  
  exports name, description, targetFile, parameters, properties, enum

#### `lib/agent-tools/tools/site-settings/`

1 code file(s).

- `lib/agent-tools/tools/site-settings/site-settings-manage.js` (102 lines) — site_settings_manage tool §BUILT 2026-09-19 — James: "site specific settings." clear-glass/src/  
  exports name, description, set, delete, clear

#### `lib/agent-tools/tools/system-tools/`

2 code file(s).

- `lib/agent-tools/tools/system-tools/cortex-restep.js` (88 lines) — cortex.restep.tool James's taxonomy: "Restep .tool to recount steps using event ledgers."  
  exports name, description, parameters, properties · requires 1 · required by 0 · tested by `tests/modules/test-tool-naming-convention.js`
- `lib/agent-tools/tools/system-tools/syntax-debug.js` (91 lines) — nexus.syntax_debug.tool James's taxonomy: "Debugger for broken syntax."  
  exports name, description, parameters, properties, default · requires 1 · required by 0 · tested by `tests/modules/test-gap-tools.js`

#### `lib/agent-tools/tools/versionium/`

2 code file(s).

- `lib/agent-tools/tools/versionium/history.js` (72 lines) — versionium.history.tool James's taxonomy: "Versions, revisions, and snapshots .tools for  
  exports name, description, parameters, properties, enum · requires 1 · required by 0 · tested by `tests/modules/test-gap-tools.js`
- `lib/agent-tools/tools/versionium/snapshot.js` (69 lines) — versionium.snapshot.tool James's taxonomy: "Versions, revisions, and snapshots .tools for  
  exports name, description, parameters, properties · requires 1 · required by 0 · tested by `tests/modules/test-gap-tools.js`

#### `lib/chunker/`

1 code file(s).

- `lib/chunker/index.js` (327 lines)  
  exports chunkDocument, structuralProfile, toLoomDeclarations, detectSubBoundaries, slug, SPLIT_THRESHOLD_CHARS · requires 0 · required by 2 · tested by `tests/modules/test-spec-library.test.js`

#### `lib/code-intel/`

7 code file(s).

- `lib/code-intel/cards.js` (269 lines) — a card per chunk: what it is, what it uses, what uses it. §0.39.273 CB2. James: "all context is easy to search and understand for each chunk." A card is small on purpose  
  exports buildCards, importBindings, docOf, summarize, firstSentence, CARD_VERSION +2 · requires 1 · required by 1
- `lib/code-intel/chunker.js` (380 lines) — structural chunk plan for one file. §0.39.273 CB1. planChunks(content, language) -> { chunks, symbols, family, fallback }.  
  exports planChunks, VERSION, LIMITS, definesOf, exportedNames · requires 2 · required by 1
- `lib/code-intel/decls.js` (216 lines) — what a statement-start line declares, per language. §0.39.273 CB1. Applied ONLY to lines ./structure.js marks as a statement start at the level being chunked, so a  
  exports matchDecl, signatureOf, KEYWORDS · requires 0 · required by 1
- `lib/code-intel/index.js` (315 lines) — code intelligence for any repo idearium holds: structural chunks, a card per chunk, ranked search, grep, outlines, and the repo overview. The one module both the import pipeline (writes) and the  
  exports INTEL_VERSION, CHUNKER_VERSION, LIMITS, planChunks, buildIntel, load +15 · requires 5 · required by 3
- `lib/code-intel/search.js` (245 lines) — ranked search over every chunk of a repo, and exact grep over its files. §0.39.273 CB3. The 0.39.272 repo search matched query tokens against symbol NAMES and file PATHS only — the body of  
  exports buildIndex, query, grep, snippet, pathMatcher, chunkAt +2 · requires 1 · required by 1
- `lib/code-intel/structure.js` (251 lines)  
  exports familyOf, scanBraces, scanIndent, scanMarkdown, lineInfo, indentWidth +2 · requires 0 · required by 3
- `lib/code-intel/text.js` (119 lines) — the one tokenizer every code-intel index and query uses. §0.39.273 CB3. Identifiers are indexed whole ('materializequiet') AND split ('materialize', 'quiet'), so a query  
  exports terms, stem, splitIdent, stripCode, identifiersOf, inlineRequires +2 · requires 0 · required by 3

#### `lib/diag-engines/`

1 code file(s).

- `lib/diag-engines/index.js` (610 lines) — // ── lib/diag-engines/index.js ───────────────────────────────────────────────── // UUID: nexus-diag-engines-v1-0000-4000-0000-000000000003  
  exports runAll, snr_floor, homeostasis, fault_tree, cascade_risk, fingerprint +8

#### `lib/economy/`

6 code file(s).

- `lib/economy/gate.js` (54 lines) — may this job go to this provider now? §0.39.281 EC2. decide({ provider, jobType, estTokens }, { policy, usage, now }) →  
  exports decide, _inQuiet, MODULE_ID, VERSION · requires 0 · required by 4
- `lib/economy/ledger.js` (67 lines) — the economy's usage ledger: the ONE writer of usage records (I3). §0.39.281 EC1. Map: docs/2026-09-29-provider-economy-phasemap.spec (EC1).  
  exports record, records, usage, begin, end, dir +3 · requires 0 · required by 6
- `lib/economy/policy.js` (110 lines) — the provider economy's configuration. §0.39.281 EC0. Map: docs/2026-09-29-provider-economy-phasemap.spec (EC0).  
  exports TIERS, JOB_TYPES, LIMITS, tierOf, defaults, normalize +3 · requires 0 · required by 2
- `lib/economy/router.js` (74 lines) — the learning router ("smart economy"). §0.39.281 EC4. James: "Smart economy like dynamically evolving and learning routing."  
  exports scores, choose, COST, MODULE_ID, VERSION · requires 0 · required by 3
- `lib/economy/store.js` (39 lines) — where the economy's policy lives: <data>/economy/policy.json. §0.39.281 (EC0's persistence). load(providers) → the stored policy normalized for the providers that exist now (defaults if none stored);  
  exports load, save, file, MODULE_ID, VERSION · requires 3 · required by 4
- `lib/economy/tokens.js` (92 lines) — token estimates and the limits learned from what actually happened. §0.39.281 EC3. James: "What about using the tokenizer and graphs to learn token constraints."  
  exports estimate, learn, series, split, METHOD, MODULE_ID +1 · requires 0 · required by 3

#### `lib/gemini-toolbox/`

4 code file(s).

- `lib/gemini-toolbox/agent-contracts.js` (114 lines) — per-agent contracts (§P1 multi-agent) James's structured-injection blueprint: a DISTINCT contract per agent to  
  exports getContract, agentCan, listAgents, AGENTS, ALL_TOOLS, GEMINI_LIMITS +2
- `lib/gemini-toolbox/index.js` (173 lines) — the Gemini coding toolbox (agnostic lib tool) James: "a tool for gemini, to inject a toolbox of tools specifically made for  
  exports getContract, parseForGemini, CONTRACT, MODULE_ID, VERSION, readRange +2 · requires 2 · required by 3
- `lib/gemini-toolbox/injection.js` (129 lines) — the injection tool (§P2 multi-agent) James: "a parsing tool with a tree command for file structure, cortex recall,  
  exports tree, parseAny, recall, buildInjectionPayload, MODULE_ID, VERSION
- `lib/gemini-toolbox/routes.js` (66 lines) — HTTP surface for the Gemini toolbox Mounts under /gemini-tool on guardian (port 7820), so the ui/agents/gemini code  
  exports handleGeminiTool · requires 1 · required by 1

#### `lib/ledger-fanin/`

2 code file(s).

- `lib/ledger-fanin/boot.js` (94 lines) — wire the nervous system live (§P1 nexus-live-mind) James: "every system and the intelligence system needs to read the SSE and  
  exports wireFanin · requires 2 · required by 1
- `lib/ledger-fanin/index.js` (120 lines) — the unified event fan-in (agnostic lib tool) James: "every system and the intelligence system needs to read the SSE and  
  exports emit, subscribe, bridgeLedger, coverage, recent, RING_SIZE +3 · requires 0 · required by 15

#### `lib/nerve/`

1 code file(s).

- `lib/nerve/index.js` (284 lines) — NEXUS Nerve System (Phase 1: read layer) Spec: docs/nexus-nerve.spec v0.2.0  
  exports getSnapshot, onChange, setRadius, setAttentionCenter · requires 1 · required by 0

#### `lib/nexstore/`

5 code file(s).

- `lib/nexstore/census.js` (197 lines)  
  exports census, catalogueYaml, kindOf, rowsOf, fieldsOf, ownerOf +1 · requires 1 · required by 0
- `lib/nexstore/log.js` (172 lines) — the append-only log under every node-store type (0.39.300, N1). component_id: nexus.lib.nexstore.log  
  exports open, verify, scan, segName, DEFAULT_SEGMENT · requires 1 · required by 0
- `lib/nexstore/record.js` (96 lines) — the record frame of the node store (0.39.300, N1). component_id: nexus.lib.nexstore.record  
  exports HEAD, MAX_BODY, FIELDS, crc32, canonical, hashOf +4 · requires 0 · required by 1
- `lib/nexstore/types.js` (164 lines) — the type registry and the gate per type (0.39.300, N2). component_id: nexus.lib.nexstore.types  
  exports KINDS, OPS, REFUSAL, schemas, define, registry +2 · requires 1 · required by 0
- `lib/nexstore/writers.js` (235 lines) — every place the code persists data, each with its node type or its stated reason (0.39.300). component_id: nexus.lib.nexstore.writers  
  exports census, scan, registerYaml, firstArg, namesOf, keysOf +2 · requires 0 · required by 1

#### `lib/nexus-self/`

5 code file(s).

- `lib/nexus-self/apply.js` (178 lines) — the apply gate: the ONLY path from the immutable Nexus repo back into the live tree.  
  exports MODULE_ID, plan, apply, rollback, listApplies · requires 3 · required by 2 · tested by `tests/modules/test-nexus-inject-approval.test.js`, `tests/modules/test-nexus-self-and-cos-run.test.js`
- `lib/nexus-self/branch.js` (183 lines) — editing Nexus from inside Nexus: COS branches of one system's slice of the immutable base.  
  exports create, get, list, readFile, writeFile, deleteFile +6 · requires 4 · required by 1 · tested by `tests/modules/test-nexus-self-and-cos-run.test.js`
- `lib/nexus-self/inject-gate.js` (147 lines) — an agent's code on a Nexus repo, through the apply gate on approval. §0.39.266 — James: "really close to being able to use idearium to build nexus from  
  exports MODULE_ID, TARGET, isNexus, current, target, preview +3 · requires 3 · required by 1
- `lib/nexus-self/store.js` (213 lines) — the immutable base: content-addressed blobs and append-only snapshots of the live Nexus tree.  
  exports MODULE_ID, VERSION, storeRoot, sha256, blobPath, putBlob +8 · requires 2 · required by 7 · tested by `tests/modules/test-nexus-atlas-and-glass.test.js`, `tests/modules/test-nexus-inject-approval.test.js` +1
- `lib/nexus-self/systems.js` (89 lines) — which files of the live tree belong to which system. §0.39.261 — James: "i want a nexus repo in idearium, that immutable with nested  
  exports ROOT, SYSTEMS, ownerOf, get, names, skipped +3 · requires 0 · required by 11 · tested by `tests/modules/test-component-store.test.js`, `tests/modules/test-nexus-atlas-and-glass.test.js` +1

#### `lib/node-schemas/`

63 other file(s).

- other: 63 files (.account_identity_index_entry, .agent, .agent_model, .agent_tool, .artifact, .bep_pattern, .capability, .chat_log)

#### `lib/opportunity/`

8 code file(s).

- `lib/opportunity/answers.js` (127 lines) — the answer bank: every screening question answered once, reused after. Application forms ask the same forty questions in four hundred wordings ("Are you legally authorized to work in  
  exports list, add, approve, remove, answerFor, mapToOption +4 · requires 1 · required by 1
- `lib/opportunity/apply.js` (130 lines) — fill a real application (or a reply box) in Clear Glass, and stop where James decides. THE FLOW (each step a real clearglass.browser.tool call; each outcome a ledger row):  
  exports PLATFORMS, platformFor, policyFor, mayAutoSubmit, planFill, findSubmit +6 · requires 0 · required by 1
- `lib/opportunity/draft.js` (186 lines) — cover letters, proposals, replies, screening answers, follow-ups, gig copy. Same rule as idearium's repo agent (0.39.258): the text sent to the model is the template, exactly as James edited  
  exports platformGuide, DEFAULT_TEMPLATES, IDS, VOICE, getTemplate, listTemplates +6 · requires 2 · required by 1
- `lib/opportunity/index.js` (587 lines)  
  exports MODULE_ID, VERSION, DEFAULT_PROFILE, getProfile, setProfile, importResume +24 · requires 9 · required by 5 · tested by `tests/modules/test-opportunity.test.js`
- `lib/opportunity/score.js` (120 lines) — how well an opportunity fits the profile, with every point explained. Pure, deterministic, no model. A score James cannot audit is a score he cannot correct, so every adjustment is a  
  exports score, dedupeKey, tokens, has, DEFAULTS · requires 0 · required by 1
- `lib/opportunity/sources.js` (200 lines)  
  exports TYPES, fetchSource, fromPage, kindForHost, stripHtml, parseSalary +11 · requires 0 · required by 1
- `lib/opportunity/stages.js` (69 lines) — the gated states an opportunity moves through, and who may move it. Pure. The compartment model (QUEUED → … → VERIFIED | FAILED → RETRYING) applied to a job/gig/lead:  
  exports STAGES, NEXT, USER_ONLY, NEEDS_YOU, check · requires 0 · required by 1
- `lib/opportunity/store.js` (40 lines) — the opportunity pipeline's persistence: cortex's JAA store, six tables, one ledger. TABLES (none decays — they are not in cortex/memory/tiers.js TABLE_TIERS, so they are long-lived by default):  
  exports T, jaa, ledger, ledgerFor, shortid · requires 1 · required by 3

#### `lib/seam/`

14 code file(s).

- `lib/seam/axioms.js` (92 lines) — Seam contract → Axiom[] §RELOCATED 2026-07-05: this lived at warp/dispatch/seamAxioms.js and  
  exports buildAxiomsForSeam, _keyOf, _textOf · requires 0 · required by 2
- `lib/seam/build-contract.js` (40 lines) — createSeamStream convenience factory Not a required entry point — a caller can assemble gates.js's pieces by  
  exports createSeamStream, TERMINAL_EVENTS · requires 2 · required by 1
- `lib/seam/chunk-lifecycle.js` (104 lines) — Canonical chunk-lifecycle vocabulary §SCOPE — this is the safe half of consolidating lib/seam/queue.js's  
  exports CANONICAL, normalizeState, isTerminal, FROM_SEAMQUEUE, FROM_IDEARIUM · requires 0 · required by 1
- `lib/seam/cos-seam-parser.js` (125 lines)  
  exports parseCosSeams · requires 0 · required by 2 · tested by `tests/lib/cos-seam-artifact-staging.test.js`, `tests/lib/cos-seam-parser.test.js`
- `lib/seam/cross-system-status.js` (114 lines) — cross-system chunk/compartment status §BUILT 2026-07-13 — lib/seam/chunk-lifecycle.js already did the careful  
  exports status · requires 3 · required by 1
- `lib/seam/detector.js` (164 lines) — guardian/lib/detector.js — Response Quality Detector Ported from userscript v8.3 Detector object.  
  exports Detector · requires 0 · required by 4 · tested by `tests/modules/nexus-seam.test.js`, `tests/modules/test-build-verify.test.js`
- `lib/seam/gates.js` (156 lines)  
  exports RegistryGate, ClassifyGate, AxiomGate, CascadeGate, PersistGate, registerPersistGates +1 · requires 3 · required by 2
- `lib/seam/index.js` (75 lines)  
  requires 10 · required by 0 · tested by `tests/modules/nexus-seam.test.js`
- `lib/seam/kg-seam-bridge.js` (129 lines)  
  exports buildSeamRecord, buildSeamRegistry · requires 0 · required by 2
- `lib/seam/mode-reducer.js` (59 lines) — guardian/lib/seam-mode-reducer.js — SEAMQueue Mode Reducer Phase 71.1 — State Reducer extraction (NEXUS v3 formalization)  
  exports MODE, deriveMode · requires 0 · required by 1
- `lib/seam/queue.js` (921 lines) — guardian/lib/seam-queue.js — SEAM Delivery Queue §LAW II — JAA insert before any state transition. No in-memory-only state.  
  exports SEAMQueue, QueueCompartment, STATE, STRATEGY, MODE, _writeCosSeamArtifacts +1 · requires 4 · required by 2 · tested by `tests/lib/cos-seam-artifact-staging.test.js`, `tests/modules/test-agent-hat-agnostic.test.js`
- `lib/seam/spec-parser.js` (448 lines) — guardian/lib/spec-parser.js — Spec Compiler §1.1 — Nothing pretends to work. Parse errors are explicit.  
  exports parseSpec, parseSpecFile, extractPrerequisite, extractBlock, extractMap · requires 0 · required by 1
- `lib/seam/stream.js` (107 lines) — SISO primitives for seam chunking §REDESIGN 2026-07-05: dispatchSeam.js (warp/dispatch/) was a straight-line  
  exports Event, Gate, Stream, StreamLog · requires 0 · required by 1
- `lib/seam/watchdog.js` (137 lines)  
  exports SeamWatchdog, createSeamWatchdog, DEFAULT_INTERVAL_MS, DEFAULT_STALL_TIMEOUT_MS · requires 0 · required by 1

#### `lib/seam/adapters/`

2 code file(s).

- `lib/seam/adapters/cortex-persist.js` (61 lines) — Cortex as one possible PersistGate backend Not required by lib/seam/gates.js or any other core seam file. A caller  
  exports createCortexPersist · requires 1 · required by 0
- `lib/seam/adapters/warp-cascade.js` (135 lines) — WARP as one possible CascadeGate backend Not required by lib/seam/gates.js, lib/seam/stream.js, lib/seam/axioms.js,  
  exports createWarpDispatch, providersFor · requires 8 · required by 1 · tested by `tests/modules/test-agent-hat-agnostic.test.js`, `tests/modules/test-warp-cascade-provider-fallback.js`

#### `lib/seam/spec-bridge/`

1 code file(s).

- `lib/seam/spec-bridge/index.js` (301 lines) — guardian/lib/spec-bridge/index.js Connects Guardian's spec dispatch to the spec-compiler pipeline.  
  exports processSpec, summarise

#### `lib/step-gates/`

2 other file(s).

- other: `lib/step-gates/code.write.step_gate`, `lib/step-gates/reply.accept.step_gate`

#### `lib/uid/`

5 code file(s).

- `lib/uid/component-map.js` (280 lines) — NEXUS Component Registry Status: pre-release  
  exports COMPONENT_MAP · requires 0 · required by 4
- `lib/uid/config-schema.js` (139 lines) — Component Config Inheritance Status: pre-release  
  exports getConfig, getAllConfigs, validateConfig, envKey · requires 1 · required by 0
- `lib/uid/index.js` (189 lines) — NEXUS Structured UID Factory Status: pre-release  
  exports uid, rawUid, parseUid, resolveUid, componentUid, isStructured +4 · requires 1 · required by 1
- `lib/uid/migrate.js` (122 lines) — NEXUS UID Migration & Conformance Tool Walks every UUID in the system, normalizes it to canonical form, builds the  
  exports run · requires 1 · required by 0
- `lib/uid/normalize.js` (145 lines) — NEXUS UID Normalization Layer Status: pre-release  
  exports normalize, resolveAny, resolveComponent, AliasLedger, _ledger · requires 2 · required by 1

#### `mesh/`

3 code · 1 other file(s).

- `mesh/config.js` (32 lines) — // mesh/config.js — config for the mesh subsystem // UUID: nexus-mesh-config-v1-0000-4700-0000-000000000001  
  exports DATA_DIR · requires 0 · required by 2
- `mesh/daemons.js` (72 lines) — // mesh/daemons.js — optional standalone network daemons ported from BrainOS. // UUID: nexus-mesh-daemons-v1-0000-4700-0000-000000000004  
  exports main · requires 5 · required by 0
- `mesh/install.js` (151 lines) — // mesh/install.js — wires the ported mesh modules together. // UUID: nexus-mesh-install-v1-0000-4700-0000-000000000002  
  exports install · requires 1 · required by 0 · emits mesh.ready
- other: `mesh/README.md`

#### `mesh/lib/`

10 code file(s).

- `mesh/lib/canvas-persistence.js` (436 lines)  
  exports install, handle, watchdog, upsertNode, removeNode, appendDelta +3
- `mesh/lib/crypto-engine.js` (557 lines) — NEXUS Crypto Engine — v1.0.0 Standalone cryptographic primitives. Zero external dependencies.  
  exports CryptoEngine, VERSION, MODULE_UUID
- `mesh/lib/ddns.js` (216 lines) — BrainOS Dynamic DNS Client No-IP style DDNS. Detects public IP changes, updates records.  
  exports DDNSClient, getPublicIP · requires 0 · required by 1 · emits net.ddns.entry_added, net.ddns.ip_detected, net.ddns.started, net.ddns.updated +2 · hears net.ddns.add_entry, net.ddns.force_check
- `mesh/lib/dns-server.js` (508 lines) — BrainOS Custom DNS Server Hook: brainos.dns:dns-server-v5:d0002  
  exports BrainOSDNS · requires 0 · required by 1 · emits net.ddns.updated, net.dns.block, net.dns.blocklist_imported, net.dns.domain_blocked +4 · hears net.ddns.update, net.dns.add_record, net.dns.allow_domain, net.dns.block_domain
- `mesh/lib/firewall.js` (299 lines) — BrainOS Firewall Engine Hook: brainos.firewall:firewall-v5:f0003  
  exports FirewallEngine · requires 0 · required by 1 · emits net.fw.block, net.fw.json_imported, net.fw.logged, net.fw.os_sync +3 · hears net.fw.add_rule, net.fw.import_json, net.fw.remove_rule, net.fw.set_vars
- `mesh/lib/host-rotation.js` (437 lines) — NEXUS Host Rotation — v1.0.0 Standalone module. Manages alternating host list for bridge connections.
- `mesh/lib/key-manager.js` (588 lines) — NEXUS Key Manager — v1.0.0 Standalone module. Manages logical key lifecycle:
- `mesh/lib/mesh-snr-filter.js` (1097 lines)
- `mesh/lib/port-registry.js` (371 lines) — NEXUS Port Registry — v1.0.0 Standalone module. Tracks port → service mapping.
- `mesh/lib/reverse-proxy.js` (162 lines) — BrainOS Reverse Proxy HTTP/HTTPS reverse proxy with SNI routing. No port-forward required.  
  exports ReverseProxy · requires 0 · required by 1 · emits net.proxy.route_added, net.proxy.route_removed, net.proxy.started, system.error · hears net.proxy.add_route, net.proxy.remove_route

#### `meta/`

4 code file(s).

- `meta/adversary-suite.js` (259 lines) — // ── lib/adversary-suite.js ──────────────────────────────────────────────────── // UUID: nexus-adversary-suite-v1-0000-4000-0000-000000000001  
  exports runAdversarySuite, runQAQC, _attackSyntax, _attackLogic, _attackEdgeCase, _attackState +5 · requires 0 · required by 2 · tested by `tests/modules/adversary-suite.test.js`
- `meta/confidence.js` (69 lines) — lib/meta/confidence.js — Weakest-Link Confidence Aggregator Replaces arithmetic-mean confidence aggregation (drift/avgConf/avgConfidence)  
  exports weakestLink, bottleneck, effective, hasEvidence, rawScore, EVIDENCE_LESS_DISCOUNT · requires 0 · required by 1
- `meta/crystal-lattice.js` (263 lines) — // ── lib/crystal-lattice.js ──────────────────────────────────────────────────── // UUID: nexus-crystal-lattice-v1-0000-4000-0000-000000000001  
  exports init, stop, updateOnExecution, validateWiring, _maybeCrystallize, _updateLattice +9 · requires 1 · required by 3 · tested by `tests/modules/crystal-lattice.test.js`
- `meta/index.js` (46 lines) — NEXUS Meta Layer v2.0.0 Sovereign intelligence modules. Every module here is domain-agnostic —  
  requires 13 · required by 0 · tested by `tests/modules/test-intelligence-core-wired.js`

#### `nexus/`

6 code file(s).

- `nexus/autopilot.js` (1895 lines) — // ── autopilot.js — NEXUS Process Supervisor ───────────────────────────────── // UUID: nexus-autopilot-v1-0000-4000-0000-000000000001  
  exports start, _statusSnapshot, KERNELS, requestSpawn, touchActivity, _state +16 · requires 14 · required by 0 · tested by `tests/modules/test-alk-lattice-live.js`, `tests/modules/test-autopilot-boot-gates.js` +5
- `nexus/nexus-bus.js` (204 lines) — Unified Event Multiplex Status: pre-release  
  requires 0 · required by 11 · hears architect.snr.flagged · tested by `tests/modules/expectation-watcher.test.js`, `tests/modules/raid-retry-escalation.test.js` +1
- `nexus/nexus-cfr-influence.js` (249 lines) — CFR Field → System Behavior Influence Status: pre-release  
  exports init, stop, influence, getState, getSigmaFloor, isThrottled +1 · requires 0 · required by 1 · emits cfr.influence.applied, cfr.influence.diagnostic_requested, cfr.influence.guardian_throttled, cfr.influence.guardian_unthrottled +4
- `nexus/nexus-connect.js` (399 lines) — Universal cross-system connection layer Status: pre-release  
  exports _req, postEvent, postLedger, postStream, postTableInsert, healthCheck +9 · requires 3 · required by 2 · tested by `tests/modules/test-boot-log-fixes.js`
- `nexus/nexus-knowledge.js` (206 lines) — Knowledge Memory Layer Status: pre-release  
  exports learn, recall, recallAbout, verify, deprecate, stats +1
- `nexus/nexus-query.js` (240 lines) — Unified Query Layer Status: pre-release  
  exports query, write, ping, clearCache, PORTS, _post

#### `nexus-healer/`

1 code · 1 other file(s).

- `nexus-healer/registry-components.js` (23 lines) — generated by loom/templates/system-scaffold.js Same shape as architect/registry-components.js and idearium/registry-components.js.
- other: `nexus-healer/interaction-contract.json`

#### `nexus-healer/api/`

1 code file(s).

- `nexus-healer/api/index.js` (187 lines) — generated by loom/templates/system-scaffold.js dispatch() is the single source both CLI and API call — one place to  
  exports dispatch, createServer, PORT · requires 2 · required by 1

#### `nexus-healer/cli/`

1 code file(s).

- `nexus-healer/cli/index.js` (61 lines) — generated by loom/templates/system-scaffold.js Do not hand-edit the verb list below; regenerate from the operations  
  exports main · requires 1 · required by 0

#### `nexus-healer/docs/`

1 other file(s).

- other: `nexus-healer/docs/nexus-healer.spec.md`

#### `nexus-healer/schemas/`

1 code · 8 other file(s).

- `nexus-healer/schemas/index.js` (51 lines) — // nexus-healer/schemas/index.js — nexus-healer's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `nexus-healer/schemas/schema.capability`, `nexus-healer/schemas/schema.command`, `nexus-healer/schemas/schema.component`, `nexus-healer/schemas/schema.healer_proposal`, `nexus-healer/schemas/schema.hook`, `nexus-healer/schemas/schema.node`, `nexus-healer/schemas/schema.system`, `nexus-healer/schemas/schema.wire`

#### `nexus-healer/spec/`

1 other file(s).

- other: `nexus-healer/spec/nexus-healer.node-taxonomy.md`

#### `remote-desktop/`

5 code · 6 other file(s).

- `remote-desktop/contracts.js` (52 lines) — interaction contracts for this project. Started as just the remote-desktop/bridge-os-core boundary; now covers  
  exports validate, CONTRACTS · requires 0 · required by 2
- `remote-desktop/input-auth.js` (113 lines) — per-message input authentication (closes the phase-4 gap: "no per-message authentication on the input channel — a MITM on a  
  requires 0 · required by 1 · tested by `remote-desktop/tests/test-input-auth.js`, `remote-desktop/tests/test-input-pipeline.js`
- `remote-desktop/input-injector.js` (157 lines) — phase 4 deliverable: host_input_listener_and_injector ("per-OS backend behind one interface"), plus input_rate_limiter_coalescer  
  exports createInputInjector, loggingBackend · requires 1 · required by 1 · emits input:coalesced, input:injected, input:rate_limited, input:rejected +1 · tested by `remote-desktop/tests/test-input-injector.js`, `remote-desktop/tests/test-input-pipeline.js`
- `remote-desktop/session-token.js` (115 lines) — closes remote-desktop.spec phase 2 gap: 'session_token_issuance' (uses 'secrets_keystore_module' — see notes).  
  exports createSessionAuthority · requires 3 · required by 1 · emits authority:ready, token:expired, token:issued, token:rejected +2 · tested by `remote-desktop/tests/test-session-token.js`
- `remote-desktop/signal.js` (114 lines) — // signal.js — core module 0: signaling // Relays offer/answer/ICE between exactly one host and one viewer per session.  
  exports start · requires 2 · required by 1
- other: `remote-desktop/README.md`, `remote-desktop/host.html`, `remote-desktop/package-lock.json`, `remote-desktop/package.json`, `remote-desktop/remote-desktop.spec`, `remote-desktop/viewer.html`

#### `remote-desktop/bridge-electron/`

2 code · 1 other file(s).

- `remote-desktop/bridge-electron/main.js` (189 lines) — bridge-electron/main.js — phase 7 (host_application_shell), taken early out of spec order at explicit request. Wraps host.html + signal.js;  
  requires 3 · required by 0 · hears input:rate_limited, input:rejected
- `remote-desktop/bridge-electron/preload.js` (32 lines) — the entire Electron-to-renderer surface. host.html degrades gracefully without any of this (checks
- other: `remote-desktop/bridge-electron/package.json`

#### `remote-desktop/bridge-electron/assets/`

2 other file(s).

- other: `remote-desktop/bridge-electron/assets/icon.png`, `remote-desktop/bridge-electron/assets/tray-icon.png`

#### `remote-desktop/bridge-os-core/`

1 code · 2 other file(s).

- `remote-desktop/bridge-os-core/index.js` (150 lines) — CORE Boots the 7 vital modules (bridge-node/boot.js) and exposes only the  
  requires 1 · required by 0
- other: `remote-desktop/bridge-os-core/README.md`, `remote-desktop/bridge-os-core/package.json`

#### `remote-desktop/bridge-os-core/bridge-IME/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-IME/index.js` (480 lines) — bridge-IME/index.js Identity Memory Engine — WHO did WHAT across every protocol over time.  
  exports IME, createIME · requires 0 · required by 1 · tested by `remote-desktop/bridge-os-core/bridge-IME/tests/test-ime.js`, `remote-desktop/bridge-os-core/bridge-IME/tests/test-ime-deep.js` +3

#### `remote-desktop/bridge-os-core/bridge-IME/tests/`

2 test file(s).


#### `remote-desktop/bridge-os-core/bridge-contracts/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-contracts/index.js` (256 lines) — bridge-contracts/index.js Frozen, versioned interaction contracts between modules.  
  exports validate, validateAll, contracts · requires 0 · required by 2 · tested by `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts.js`, `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts-deep.js`

#### `remote-desktop/bridge-os-core/bridge-contracts/tests/`

2 test file(s).


#### `remote-desktop/bridge-os-core/bridge-core/`

3 code file(s).

- `remote-desktop/bridge-os-core/bridge-core/bus.js` (157 lines) — bridge-core/bus.js Central event bus for bridge-node ecosystem.  
  exports createBus · requires 1 · required by 2 · emits bus:meta:observer_error
- `remote-desktop/bridge-os-core/bridge-core/crypto-engine.js` (402 lines) — NEXUS Crypto Engine — v1.0.0 Standalone cryptographic primitives. Zero external dependencies.  
  exports CryptoEngine, VERSION, MODULE_UUID
- `remote-desktop/bridge-os-core/bridge-core/index.js` (23 lines) — bridge-core/index.js Common primitives every bridge module imports.  
  exports Gate, Stream, StreamLog · requires 3 · required by 0 · tested by `remote-desktop/bridge-os-core/bridge-core/tests/test-core.js`, `remote-desktop/bridge-os-core/bridge-core/tests/test-core-deep.js`

#### `remote-desktop/bridge-os-core/bridge-core/registry/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-core/registry/index.js` (142 lines) — bridge-core/registry/index.js NodeRegistry — pure state ledger. Observes facts. Emits events. Makes NO decisions.  
  exports createNodeRegistry, LIFECYCLE · requires 0 · required by 2 · emits node:evicted, node:registered, node:revived, node:state:dead +2

#### `remote-desktop/bridge-os-core/bridge-core/siso/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-core/siso/index.js` (174 lines) — bridge-core/siso/index.js SISO: Event → Gate → Stream → StreamLog  
  exports Event, Gate, Stream, StreamLog, LOG_LEVELS · requires 0 · required by 2

#### `remote-desktop/bridge-os-core/bridge-core/tests/`

2 test file(s).


#### `remote-desktop/bridge-os-core/bridge-data/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-data/index.js` (170 lines) — bridge-data/index.js Universal data intake pipeline.  
  exports createDataBus · requires 0 · required by 1 · tested by `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts.js`, `remote-desktop/bridge-os-core/bridge-data/tests/test-data.js` +1

#### `remote-desktop/bridge-os-core/bridge-data/tests/`

2 test file(s).


#### `remote-desktop/bridge-os-core/bridge-heartbeat/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-heartbeat/index.js` (303 lines) — bridge-heartbeat/index.js v2.0.0 Pulse. Every node proves it's alive by beating. Silence = dead.  
  exports createHeartbeatManager, createPulseEmitter, createPulseListener, createBPMTracker, checkHealth, latencyGrade · requires 0 · required by 1 · emits heartbeat:pulse, node:dead, node:degraded · tested by `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts.js`, `remote-desktop/bridge-os-core/bridge-heartbeat/tests/test-heartbeat.js` +1

#### `remote-desktop/bridge-os-core/bridge-heartbeat/tests/`

2 test file(s).


#### `remote-desktop/bridge-os-core/bridge-identity/`

2 code file(s).

- `remote-desktop/bridge-os-core/bridge-identity/identity.js` (212 lines) — bridge-identity/identity.js Ed25519 keypair generation, UUID derivation, signing.  
  exports Identity, deriveUUID, verifyHandshake, makeHandshake · requires 0 · required by 1 · tested by `remote-desktop/bridge-os-core/bridge-identity/tests/test-identity.js`, `remote-desktop/bridge-os-core/bridge-identity/tests/test-identity-deep.js`
- `remote-desktop/bridge-os-core/bridge-identity/index.js` (160 lines) — bridge-identity/index.js Public API: { Identity, KeyStore, loadOrInit, verifyHandshake }  
  exports loadOrInit, resetIdentity, migrateIdentity, verifyHandshake, deriveUUID, Identity · requires 2 · required by 2 · tested by `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts.js`, `remote-desktop/bridge-os-core/bridge-identity/tests/test-identity.js` +1

#### `remote-desktop/bridge-os-core/bridge-identity/keystore/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-identity/keystore/index.js` (218 lines) — bridge-identity/keystore/index.js KeyStore abstraction: selects best available backend.  
  exports FileKeyStore, DPAPIKeyStore, TPMKeyStore, PassphraseKeyStore, selectKeyStore · requires 0 · required by 1 · tested by `remote-desktop/bridge-os-core/bridge-identity/tests/test-identity.js`

#### `remote-desktop/bridge-os-core/bridge-identity/tests/`

2 test file(s).


#### `remote-desktop/bridge-os-core/bridge-node/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-node/boot.js` (108 lines) — bridge-node/boot.js — CORE build Everything MANIFEST.json marks "vital": true, and nothing else.  
  exports boot · requires 8 · required by 1

#### `remote-desktop/bridge-os-core/bridge-sngate/`

1 code file(s).

- `remote-desktop/bridge-os-core/bridge-sngate/index.js` (369 lines) — bridge-sngate/index.js Programmable trust primitive. One engine, three adapters.  
  exports SNGate, createSNGate · requires 0 · required by 1 · tested by `remote-desktop/bridge-os-core/bridge-contracts/tests/test-contracts.js`, `remote-desktop/bridge-os-core/bridge-data/tests/test-data.js` +2

#### `remote-desktop/bridge-os-core/bridge-sngate/tests/`

2 test file(s).


#### `remote-desktop/scripts/`

2 other file(s).

- other: `remote-desktop/scripts/start-signal-background.bat`, `remote-desktop/scripts/stop-signal-background.bat`

#### `remote-desktop/tests/`

5 test file(s).


#### `scripts/`

12 code · 1 other file(s).

- `scripts/_register-session-hooks.js` (75 lines) — // One-shot: register the six endpoints built this session that had no // hook declaration (§5.1). Inserts at each array head, matching the
- `scripts/analyze-methodless-routes.js` (96 lines) — scripts/analyze-methodless-routes.js §WHY — scripts/generate-hooks.js declared 38 of 65 orphaned routes and
- `scripts/confirm-build.mjs` (60 lines) — // scripts/confirm-build.mjs — one command that proves the idearium loop works // end to end against a freshly-spawned service. Run: node scripts/confirm-build.mjs
- `scripts/fix-phasemap-yaml.js` (121 lines) — make a phasemap machine-readable without changing a word of it (0.39.300 LV1). Map: docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (LV1) — the synthesis's fill order put these first:  
  exports repair, foldAt, foldItem, sameWords
- `scripts/generate-atlases.js` (18 lines) — rewrite the generated section of every system atlas (lib/atlas-generate.js). node scripts/generate-atlases.js every system  
  requires 1 · required by 0
- `scripts/generate-hooks.js` (127 lines) — declare implemented routes from the code itself §WHY — verify-wires' reverse scan found 65 implemented routes with no
- `scripts/mco5-one-real-job.js` (112 lines) — scripts/mco5-one-real-job.js §MCO5 2026-09-13 — one real contract, one real UUID, submitted for real  
  requires 2 · required by 0
- `scripts/mco6-ic9-kill-and-restart.js` (136 lines) — scripts/mco6-ic9-kill-and-restart.js §MCO6/IC9 2026-09-13 — this phasemap's own literal gate: "kill the  
  requires 1 · required by 0
- `scripts/precommit-check.js` (423 lines) — mechanical enforcement of CLAUDE.md's rules. Install as a git hook: ln -sf ../../scripts/precommit-check.js .git/hooks/pre-commit  
  exports VERSION
- `scripts/run-verification-manifest.cjs` (138 lines) — execute the real manifest §BUILT 2026-07-14 — the machine-readable half of VERIFICATION-LOG.md.  
  exports run · requires 1 · required by 0
- `scripts/verify-boot.js` (153 lines)
- `scripts/verify-wires.js` (224 lines) — Wire Integrity Checker §17.7-DRIVEN — the actual missing primitive behind five separate
- other: `scripts/bump-version.py`

#### `seams/`

1 code file(s).

- `seams/seam-contracts.js` (73 lines) — NEXUS Seam Contract Registry §SEAM: Growth happens at the seam. Every seam is declared here.  
  exports GUARDIAN_WSS_CONTRACT, FORGE_CONTRACT, SPEC_SEAM_CONTRACT, CLI_UI_CONTRACT, BRIDGE_CONTRACT

#### `security/`

2 code file(s).

- `security/e2e-channel.js` (280 lines)
- `security/signaling-envelope.js` (164 lines) — signed envelope for the signaling channel (join/offer/answer/ice), closing remote-desktop.spec phase 6's

#### `sentinel/`

1 other file(s).

- other: `sentinel/interaction-contract.json`

#### `service/`

3 code file(s).

- `service/cortex-service.js` (104 lines) — // service/cortex-service.js — Cortex ICO Kernel Service // UUID: nexus-cortex-service-v1-0000-4000-0000-000000000001  
  requires 4 · required by 0
- `service/guardian-service.js` (199 lines) — // service/guardian-service.js — Guardian ICO Kernel Service // UUID: nexus-guardian-service-v1-0000-4000-0000-000000000001  
  requires 4 · required by 0
- `service/idearium-service.js` (104 lines) — // service/idearium-service.js — Idearium ICO Kernel Service // UUID: nexus-idearium-service-v1-0000-4000-0000-000000000001  
  requires 4 · required by 0

#### `siso/`

5 code · 2 other file(s).

- `siso/Event.js` (12 lines) — Event — a datum flowing through the stream. Has a type (its signature) and arbitrary data.  
  exports Event
- `siso/Gate.js` (24 lines) — Gate — a shape that recognizes one type of event and transforms it into another.  
  exports Gate
- `siso/Stream.js` (78 lines) — Stream — the processing loop. Gates register by signature. Events arrive via emit().  
  exports Stream
- `siso/StreamLog.js` (90 lines) — StreamLog — the audit trail. A shared object that streams write to. One log sees  
  exports StreamLog
- `siso/index.js` (140 lines) — siso/core/index.js — Extended SISO for idearium (ESM) hookId: siso.core.extended:v1:e0001  
  exports Event, Gate, StreamLog, Stream · requires 0 · required by 1
- other: `siso/MANIFEST.json`, `siso/package.json`

#### `siso/core/`

1 code · 1 other file(s).

- `siso/core/index.js` (140 lines) — Extended SISO for idearium (ESM) hookId: siso.core.extended:v1:e0001  
  exports Event, Gate, StreamLog, Stream · requires 0 · required by 1
- other: `siso/core/package.json`

#### `siso/spec/`

1 other file(s).

- other: `siso/spec/siso.spec`

#### `skills/`

1 other file(s).

- other: `skills/james-brooks.skill`

#### `skills/james-brooks/`

1 other file(s).

- other: `skills/james-brooks/SKILL.md`

#### `skills/nexus-session-changelog/`

1 other file(s).

- other: `skills/nexus-session-changelog/SKILL.md`

#### `tablet/`

2 other file(s).

- other: `tablet/index.html`, `tablet/map3d.html`

#### `tests/`

33 test file(s).


#### `tests/fixtures/`

1 test file(s).


#### `tests/helpers/`

3 test file(s).


#### `tests/lib/`

5 test file(s).


#### `tests/modules/`

511 test file(s).


#### `tests/probe/`

23 test file(s).


#### `ui/`

9 code file(s).

- `ui/api.js` (356 lines) — NEXUS Transport Layer Status: pre-release  
  requires 1 · required by 1
- `ui/contract-renderer.js` (505 lines) — NEXUS Contract-Driven UI Renderer Status: pre-release  
  exports ContractRenderer, ContractExplorer
- `ui/contracts.js` (431 lines) — NEXUS Interaction Contract Layer Status: pre-release  
  requires 0 · required by 3
- `ui/ncp.js` (374 lines) — lib/ncp.js — NEXUS Channel Protocol v1.2.0 Architecture:  
  exports createNCPServer, jsonResponse, readBody, handleOptions
- `ui/pipeline-tutorial.js` (484 lines) — NEXUS Full Pipeline Tutorial Walks the complete idea → spec → compile → dispatch → artifact → heal pipeline.  
  exports PIPELINE_STAGES, escalate, sleep, GET, POST
- `ui/ports.js` (47 lines) — Canonical NEXUS port map Served by orchestrator at http://localhost:9000/ports.js
- `ui/pulse.js` (288 lines) — lib/pulse.js — NEXUS Pulse System v1.0.0 The pulse is the heartbeat made active. Every system that imports this  
  exports createPulse, createNCPPulse, _Ring
- `ui/store.js` (646 lines) — NEXUS Reactive State Store Status: pre-release  
  requires 2 · required by 0 · emits artifacts.changed, config.changed, cortex.memory.updated, entropy.changed +18
- `ui/ui-pulse.js` (233 lines) — ui/pulse.js — NEXUS Browser Pulse System v1.0.0 Browser-side pulse. Two independent heartbeats:  
  requires 1 · required by 0 · emits health.changed

#### `ui/agents/chatgpt/`

1 other file(s).

- other: `ui/agents/chatgpt/index.html`

#### `ui/agents/claude/`

1 other file(s).

- other: `ui/agents/claude/index.html`

#### `ui/agents/gemini/`

2 other file(s).

- other: `ui/agents/gemini/code-suite.html`, `ui/agents/gemini/index.html`

#### `ui/agents/perplexity/`

1 other file(s).

- other: `ui/agents/perplexity/index.html`

#### `ui/brainos/`

3 code · 3 other file(s).

- `ui/brainos/brainos-app.js` (590 lines) — ui/brainos/brainos-app.js §NEW 2026-09-06 — James: "make this ui, map it all onto the html."
- `ui/brainos/brainos-automation.js` (762 lines)
- `ui/brainos/brainos-canvas.js` (544 lines)  
  tested by `tests/modules/brainos-canvas.test.js`, `tests/modules/test-brainos-canvas-agent-mesh.js` +1
- other: `ui/brainos/brainos-app.css`, `ui/brainos/brainos-interaction-contract.json`, `ui/brainos/index.html`

#### `ui/brainos-float/`

2 code · 3 other file(s).

- `ui/brainos-float/brainos-float-cg.js` (184 lines) — BrainOS Float: Clear Glass tabs component_id: nexus.ui.brainos-float.cg-tabs
- `ui/brainos-float/brainos-float.js` (404 lines) — the floating control panel James asked for: "floating above, not hardcoded or inline, interaction
- other: `ui/brainos-float/brainos-float-contract.json`, `ui/brainos-float/brainos-float.css`, `ui/brainos-float/index.html`

#### `ui/channels/causal/`

1 other file(s).

- other: `ui/channels/causal/causal.html`

#### `ui/channels/conversations/`

1 other file(s).

- other: `ui/channels/conversations/conversations.html`

#### `ui/channels/idearium/`

1 other file(s).

- other: `ui/channels/idearium/idearium.html`

#### `ui/channels/log/`

1 other file(s).

- other: `ui/channels/log/log.html`

#### `ui/consent/`

1 code file(s).

- `ui/consent/consent-gate.js` (87 lines) — sovereign module. Zero coupling to shell beyond the API below (matches ui/home/DECOMP.md's module contract).

#### `ui/control-panel/`

1 other file(s).

- other: `ui/control-panel/index.html`

#### `ui/copilot/`

1 code · 1 test file(s).

- `ui/copilot/copilot.js` (226 lines)

#### `ui/cortex/`

1 other file(s).

- other: `ui/cortex/index.html`

#### `ui/emerge/`

2 other file(s).

- other: `ui/emerge/emerge-ide.html`, `ui/emerge/index.html`

#### `ui/eravos/`

2 other file(s).

- other: `ui/eravos/index.html`, `ui/eravos/manifest.json`

#### `ui/eravos/bridge/`

1 code file(s).

- `ui/eravos/bridge/nexus-bridge.js` (134 lines) — ERAVOS NEXUS BRIDGE v1.0.0 bridge/nexus-bridge.js  
  emits kernel:notify

#### `ui/eravos/catalog/`

2 code · 1 other file(s).

- `ui/eravos/catalog/catalog-ui.js` (441 lines) — ERAVOS CATALOG UI v1.0.0 catalog/catalog-ui.js  
  requires 1 · required by 0
- `ui/eravos/catalog/catalog.js` (122 lines) — ERAVOS CATALOG REGISTRY v1.0.0 catalog/catalog.js  
  emits catalog:removed
- other: `ui/eravos/catalog/catalog.css`

#### `ui/eravos/kernel/`

2 code file(s).

- `ui/eravos/kernel/intake.js` (105 lines) — ERAVOS INTAKE v3.0.0 File identification, FNV hash, MIME detection, type routing.  
  emits intake:file
- `ui/eravos/kernel/kernel.js` (477 lines) — ERAVOS KERNEL v3.0.0 Axioms (from ERAVOS.kernel.spec):  
  emits kernel:audio-ready, kernel:bpm-change, kernel:fault, kernel:ledger-entry +5

#### `ui/eravos/organisms/acid-synth/`

1 code file(s).

- `ui/eravos/organisms/acid-synth/acid-synth.engine.js` (105 lines) — ORGANISM: ACID SYNTH v1.0.0 id: eravos.acid-synth  
  emits audio:signal, org:state_sync, org:triggered · hears pad:trigger

#### `ui/eravos/organisms/acid-synth/schema/`

1 other file(s).

- other: `ui/eravos/organisms/acid-synth/schema/schema.json`

#### `ui/eravos/organisms/bass-drop-builder/`

1 code file(s).

- `ui/eravos/organisms/bass-drop-builder/bass-drop-builder.engine.js` (443 lines) — ORGANISM: BASS DROP BUILDER v1.0.0 id: eravos.bass-drop-builder  
  emits bass-drop:stage, org:stage-active, org:state-sync, org:vocal-loaded · hears intake:file, kernel:bpm-change

#### `ui/eravos/organisms/bass-drop-builder/schema/`

1 other file(s).

- other: `ui/eravos/organisms/bass-drop-builder/schema/schema.json`

#### `ui/eravos/organisms/channel/`

1 code file(s).

- `ui/eravos/organisms/channel/channel.engine.js` (107 lines) — ORGANISM: CHANNEL STRIP v1.0.0 id: eravos.channel  
  emits org:meter, org:state_sync · hears audio:signal

#### `ui/eravos/organisms/channel/schema/`

1 other file(s).

- other: `ui/eravos/organisms/channel/schema/schema.json`

#### `ui/eravos/organisms/contrast-analyser/`

1 code file(s).

- `ui/eravos/organisms/contrast-analyser/contrast-analyser.engine.js` (375 lines) — ORGANISM: CONTRAST ANALYSER v1.0.0 id: eravos.contrast-analyser  
  emits contrast:analysis, org:analysis-ready, org:bpm-detected, org:mode-changed +1 · hears intake:file

#### `ui/eravos/organisms/contrast-analyser/schema/`

1 other file(s).

- other: `ui/eravos/organisms/contrast-analyser/schema/schema.json`

#### `ui/eravos/organisms/edm-lab/`

1 code file(s).

- `ui/eravos/organisms/edm-lab/edm-lab.engine.js` (447 lines) — ERAVOS EDM LAB ENGINE v2.0.0 id: eravos.edm-lab  
  emits edm:drop-fired, edm:rhythm-step, org:density-reset, org:drop-fired +1

#### `ui/eravos/organisms/edm-lab/schema/`

1 other file(s).

- other: `ui/eravos/organisms/edm-lab/schema/schema.json`

#### `ui/eravos/organisms/lfo/`

1 code file(s).

- `ui/eravos/organisms/lfo/lfo.engine.js` (140 lines) — ORGANISM: LFO v1.0.0 id: eravos.lfo  
  emits mod:signal, org:lfo_tick, org:state_sync

#### `ui/eravos/organisms/lfo/schema/`

1 other file(s).

- other: `ui/eravos/organisms/lfo/schema/schema.json`

#### `ui/eravos/organisms/nexus-architect/`

1 code file(s).

- `ui/eravos/organisms/nexus-architect/nexus-architect.engine.js` (33 lines) — ORGANISM: ARCHITECT v1.0.0 id: eravos.nexus-architect

#### `ui/eravos/organisms/nexus-architect/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-architect/schema/schema.json`

#### `ui/eravos/organisms/nexus-bridge/`

1 code file(s).

- `ui/eravos/organisms/nexus-bridge/nexus-bridge.engine.js` (33 lines) — ORGANISM: NEXUS_BRIDGE v1.0.0 id: eravos.nexus-bridge

#### `ui/eravos/organisms/nexus-bridge/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-bridge/schema/schema.json`

#### `ui/eravos/organisms/nexus-cortex/`

1 code file(s).

- `ui/eravos/organisms/nexus-cortex/nexus-cortex.engine.js` (33 lines) — ORGANISM: NEXUS_CORTEX v1.0.0 id: eravos.nexus-cortex

#### `ui/eravos/organisms/nexus-cortex/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-cortex/schema/schema.json`

#### `ui/eravos/organisms/nexus-diagnostic/`

1 code file(s).

- `ui/eravos/organisms/nexus-diagnostic/nexus-diagnostic.engine.js` (33 lines) — ORGANISM: DIAGNOSTIC v1.0.0 id: eravos.nexus-diagnostic

#### `ui/eravos/organisms/nexus-diagnostic/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-diagnostic/schema/schema.json`

#### `ui/eravos/organisms/nexus-guardian/`

1 code file(s).

- `ui/eravos/organisms/nexus-guardian/nexus-guardian.engine.js` (33 lines) — ORGANISM: NEXUS_GUARDIAN v1.0.0 id: eravos.nexus-guardian

#### `ui/eravos/organisms/nexus-guardian/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-guardian/schema/schema.json`

#### `ui/eravos/organisms/nexus-idearium/`

1 code file(s).

- `ui/eravos/organisms/nexus-idearium/nexus-idearium.engine.js` (33 lines) — ORGANISM: IDEARIUM v1.0.0 id: eravos.nexus-idearium

#### `ui/eravos/organisms/nexus-idearium/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-idearium/schema/schema.json`

#### `ui/eravos/organisms/nexus-orchestrator/`

1 code file(s).

- `ui/eravos/organisms/nexus-orchestrator/nexus-orchestrator.engine.js` (33 lines) — ORGANISM: ORCHESTRATOR v1.0.0 id: eravos.nexus-orchestrator

#### `ui/eravos/organisms/nexus-orchestrator/schema/`

1 other file(s).

- other: `ui/eravos/organisms/nexus-orchestrator/schema/schema.json`

#### `ui/eravos/organisms/nexus-shared/`

1 code file(s).

- `ui/eravos/organisms/nexus-shared/nexus-node-core.js` (185 lines)  
  emits org:state_sync · hears transport:play, transport:record-start, transport:record-stop, transport:stop

#### `ui/eravos/organisms/pads/`

1 code file(s).

- `ui/eravos/organisms/pads/pads.engine.js` (165 lines) — ORGANISM: DRUM MACHINE v3.1.0 Publishes org:* events on scoped sBus (instanceId-scoped).  
  emits org:pad_lit, org:state_sync, pad:bank-change, pad:trigger · hears midi:note, seq:fire

#### `ui/eravos/organisms/pads/schema/`

1 other file(s).

- other: `ui/eravos/organisms/pads/schema/schema.json`

#### `ui/eravos/organisms/reese-bass/`

1 code file(s).

- `ui/eravos/organisms/reese-bass/reese-bass.engine.js` (149 lines) — ORGANISM: REESE BASS v1.0.0 id: eravos.reese-bass  
  emits org:state_sync · hears pad:trigger

#### `ui/eravos/organisms/reese-bass/schema/`

1 other file(s).

- other: `ui/eravos/organisms/reese-bass/schema/schema.json`

#### `ui/eravos/organisms/sample-player/`

1 code file(s).

- `ui/eravos/organisms/sample-player/sample-player.engine.js` (95 lines) — ORGANISM: SAMPLE PLAYER v3.1.0  
  emits org:playhead_update, org:state_sync, org:waveform_ready · hears intake:file

#### `ui/eravos/organisms/sample-player/schema/`

1 other file(s).

- other: `ui/eravos/organisms/sample-player/schema/schema.json`

#### `ui/eravos/organisms/sequencer/`

1 code file(s).

- `ui/eravos/organisms/sequencer/sequencer.engine.js` (197 lines) — ORGANISM: SEQUENCER v4.0.0 id: eravos.sequencer  
  emits org:grid_sync, org:state_sync, org:step_cursor, org:step_set +3 · hears kernel:bpm-change, pad:bank-change, pad:trigger, seq:play +1

#### `ui/eravos/organisms/sequencer/schema/`

1 other file(s).

- other: `ui/eravos/organisms/sequencer/schema/schema.json`

#### `ui/eravos/organisms/timeline/`

1 code file(s).

- `ui/eravos/organisms/timeline/timeline.engine.js` (144 lines) — ORGANISM: TIMELINE v3.1.0  
  emits intake:file, org:asset_loaded, org:clip_added, org:clip_removed +5 · hears intake:file, seq:play, seq:stop, transport:play +1

#### `ui/eravos/organisms/timeline/schema/`

1 other file(s).

- other: `ui/eravos/organisms/timeline/schema/schema.json`

#### `ui/eravos/organisms/wobble-bass/`

1 code file(s).

- `ui/eravos/organisms/wobble-bass/wobble-bass.engine.js` (131 lines) — ORGANISM: WOBBLE BASS v1.0.0 id: eravos.wobble-bass  
  emits org:state_sync · hears pad:trigger

#### `ui/eravos/organisms/wobble-bass/schema/`

1 other file(s).

- other: `ui/eravos/organisms/wobble-bass/schema/schema.json`

#### `ui/eravos/organisms/xy-pad/`

1 code file(s).

- `ui/eravos/organisms/xy-pad/xy-pad.engine.js` (98 lines) — ORGANISM: XY CONTROLLER v1.0.0 id: eravos.xy-pad  
  emits mod:xy, org:state_sync, org:xy_update

#### `ui/eravos/organisms/xy-pad/schema/`

1 other file(s).

- other: `ui/eravos/organisms/xy-pad/schema/schema.json`

#### `ui/eravos/pack/`

1 code file(s).

- `ui/eravos/pack/pack-loader.js` (201 lines) — ERAVOS PACK LOADER v1.0.0 pack/pack-loader.js  
  emits kernel:fault, kernel:pack-installed

#### `ui/eravos/runtime/`

9 code file(s).

- `ui/eravos/runtime/alk-gl.js` (897 lines) — ALK-GL — WebGL2 Particle Field Engine v1.9.0 Adapted for ERAVOS: ES6 exports → window.ALKGL
- `ui/eravos/runtime/canvas-cfr.js` (193 lines) — ERAVOS CANVAS CFR v1.0.0 runtime/canvas-cfr.js
- `ui/eravos/runtime/canvas-intelligence.js` (525 lines)  
  hears org:state_sync
- `ui/eravos/runtime/canvas-wm.js` (240 lines) — ERAVOS CANVAS WM v3.0.0 Window manager for the canvas space.  
  emits canvas:window-closed
- `ui/eravos/runtime/master-transport.js` (111 lines) — MASTER TRANSPORT v1.0.0 runtime/master-transport.js  
  emits kernel:bpm-change, kernel:notify, seq:play, seq:stop +5 · hears ui:transport-bpm, ui:transport-play, ui:transport-record, ui:transport-stop
- `ui/eravos/runtime/organism-factory.js` (2847 lines) — ERAVOS ORGANISM FACTORY v3.0.0 Spawns any registered organism with its UI projection.  
  emits canvas:organism-spawned, catalog:organism-registered, intake:file, mod:xy · hears kernel:bpm-change, org:analysis-ready, org:asset_loaded, org:bpm-detected +16
- `ui/eravos/runtime/precision-clock.js` (302 lines) — PRECISION CLOCK v1.0.0 runtime/precision-clock.js
- `ui/eravos/runtime/precision-clock.worklet.js` (58 lines) — PRECISION CLOCK WORKLET v1.0.0 runtime/precision-clock.worklet.js
- `ui/eravos/runtime/wire-system.js` (285 lines) — WIRE SYSTEM v1.0.0 runtime/wire-system.js  
  emits kernel:notify

#### `ui/eravos/specs/`

8 other file(s).

- other: `ui/eravos/specs/ERAVOS.kernel.spec`, `ui/eravos/specs/eravos.genomes-ecosystems-behaviors.spec`, `ui/eravos/specs/eravos.nexus.build-contract.spec`, `ui/eravos/specs/eravos.organism.pads.spec`, `ui/eravos/specs/eravos.organism.sample-player.spec`, `ui/eravos/specs/eravos.organism.sequencer.spec`, `ui/eravos/specs/eravos.organism.timeline.spec`, `ui/eravos/specs/eravos.pack.format.spec`

#### `ui/forge-shell/`

2 other file(s).

- other: `ui/forge-shell/forge-shell.html`, `ui/forge-shell/index.html`

#### `ui/guardian/`

1 other file(s).

- other: `ui/guardian/index.html`

#### `ui/home/`

1 code · 6 other file(s).

- `ui/home/shell.js` (161 lines) — thin shell, per ui/home/DECOMP.md's own spec: "tune(), toggleMenu(), connectSSE(), flashDot(), pollHealth(),
- other: `ui/home/DECOMP.md`, `ui/home/STRUCTURE.md`, `ui/home/home.css`, `ui/home/index.html`, `ui/home/intent.html`, `ui/home/nexus-home.html`

#### `ui/home/areas/`

21 code · 21 other file(s).

- `ui/home/areas/agent-suite.js` (302 lines) — // ui/home/areas/agent-suite.js — Agent suite channel + agent forge + stored-mode restore. // Split from ui/home/index.html (inline script, lines 2238-2535 at v0.39.227). Load order is set by…  
  requires 0 · required by 1
- `ui/home/areas/assistant.js` (11 lines) — // ui/home/areas/assistant.js — Assistant bar: prompt history keys. // Split from ui/home/index.html (inline script, lines 1636-1642 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/bridge.js` (17 lines) — // ui/home/areas/bridge.js — Bridge channel: relay nodes. // Split from ui/home/index.html (inline script, lines 1535-1547 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/causal.js` (258 lines) — // ui/home/areas/causal.js — Causal channel: CFR force graph (CG). // Split from ui/home/index.html (inline script, lines 1643-1896 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/console.js` (42 lines) — // ui/home/areas/console.js — Fullscreen system console (#bot-bar). // Split from ui/home/index.html (inline script, lines 1020-1057 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/conversations.js` (73 lines) — // ui/home/areas/conversations.js — Conversations channel: co-pilot exchange log. // Split from ui/home/index.html (inline script, lines 1897-1965 at v0.39.227). Load order is set by index.html;…  
  requires 0 · required by 1
- `ui/home/areas/cortex.js` (18 lines) — // ui/home/areas/cortex.js — Cortex channel: gaps, failures. // Split from ui/home/index.html (inline script, lines 1503-1516 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/diagnose.js` (92 lines) — // ui/home/areas/diagnose.js — Diagnose channel: checks, CFR, gaps, engines. // Split from ui/home/index.html (inline script, lines 1548-1635 at v0.39.227). Load order is set by index.html; do not…  
  requires 0 · required by 1
- `ui/home/areas/forge-tile.js` (37 lines) — // ui/home/areas/forge-tile.js — Forge shell + blueprint tiles. // Split from ui/home/index.html (inline script, lines 2597-2629 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/guardian.js` (142 lines) — // ui/home/areas/guardian.js — Guardian channel: providers, dispatch, jobs. // Split from ui/home/index.html (inline script, lines 1365-1502 at v0.39.227). Load order is set by index.html; do not…  
  requires 0 · required by 1
- `ui/home/areas/idearium.js` (22 lines) — // ui/home/areas/idearium.js — Idearium channel: ideas. // Split from ui/home/index.html (inline script, lines 1517-1534 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/inspect.js` (51 lines) — // ui/home/areas/inspect.js — Inspect overlay: contextual diagnostics for the active channel. // Split from ui/home/index.html (inline script, lines 973-1019 at v0.39.227). Load order is set by…  
  requires 0 · required by 1
- `ui/home/areas/log.js` (39 lines) — // ui/home/areas/log.js — Log channel: live event stream. // Split from ui/home/index.html (inline script, lines 1330-1364 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/mode-selector.js` (142 lines) — // ui/home/areas/mode-selector.js — Mode system: MODE_CONFIG, selectMode, mode overlay. // Split from ui/home/index.html (inline script, lines 2100-2237 at v0.39.227). Load order is set by…  
  requires 0 · required by 1
- `ui/home/areas/overview.js` (168 lines) — // ui/home/areas/overview.js — Overview channel: system grid, heartbeat pulse, health polling, metrics. // Split from ui/home/index.html (inline script, lines 1073-1236 at v0.39.227). Load order…  
  requires 0 · required by 1
- `ui/home/areas/rail.js` (142 lines) — // ui/home/areas/rail.js — Channel rail: movable / editable / removable. // Split from ui/home/index.html (inline script, lines 762-899 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/rewind.js` (69 lines) — // ui/home/areas/rewind.js — Rewind overlay: snapshot timeline + rollback. // Split from ui/home/index.html (inline script, lines 2035-2099 at v0.39.227). Load order is set by index.html; do not…  
  requires 0 · required by 1
- `ui/home/areas/settings-btn.js` (24 lines) — // ui/home/areas/settings-btn.js — real Settings access from the home menu. // §ADDED 2026-09-25 — James: "the three lines menu... its not here. at  
  requires 0 · required by 1
- `ui/home/areas/shell.js` (77 lines) — // ui/home/areas/shell.js — Menu toggle + tune() channel switching. // Split from ui/home/index.html (inline script, lines 900-972 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/spec-wizard.js` (189 lines) — // ui/home/areas/spec-wizard.js — Spec wizard modal. // Split from ui/home/index.html (inline script, lines 2754-2939 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/areas/void.js` (25 lines) — // ui/home/areas/void.js — Layer 0 particle void (decorative canvas). // Split from ui/home/index.html (inline script, lines 679-699 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- other: 21 files (.css)

#### `ui/home/core/`

6 code file(s).

- `ui/home/core/boot.js` (15 lines) — // ui/home/core/boot.js — Boot: first polls, intervals, SSE connect. // Split from ui/home/index.html (inline script, lines 2630-2640 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/core/config.js` (66 lines) — // ui/home/core/config.js — Port map P, base URLs B, provider URLs, openClearGlass, CH_META channel registry. // Split from ui/home/index.html (inline script, lines 700-761 at v0.39.227). Load…  
  requires 0 · required by 1
- `ui/home/core/keys.js` (19 lines) — // ui/home/core/keys.js — Global keyboard shortcuts. // Split from ui/home/index.html (inline script, lines 1058-1072 at v0.39.227). Load order is set by index.html; do not reorder.  
  requires 0 · required by 1
- `ui/home/core/logging.js` (66 lines) — // ui/home/core/logging.js — UI failure/event logging to cortex with sessionStorage fallback. // Split from ui/home/index.html (inline script, lines 2536-2596 at v0.39.227). Loads FIRST:…  
  requires 0 · required by 1
- `ui/home/core/sse.js` (97 lines) — // ui/home/core/sse.js — SSE live events + system heartbeat dots (flashDot). // Split from ui/home/index.html (inline script, lines 1237-1329 at v0.39.227). Load order is set by index.html; do not…  
  requires 0 · required by 1
- `ui/home/core/ui-state.js` (73 lines) — // ui/home/core/ui-state.js — NEXUS_UI_STATE reader for co-pilot + asSend. // Split from ui/home/index.html (inline script, lines 1966-2034 at v0.39.227). Load order is set by index.html; do not…  
  requires 0 · required by 1

#### `ui/import-project/`

2 other file(s).

- other: `ui/import-project/import-project.css`, `ui/import-project/import-project.html`

#### `ui/lib/`

2 code · 1 test file(s).

- `ui/lib/api.js` (57 lines)
- `ui/lib/repo-ingest.js` (130 lines) — shared client-side repo-ingest helpers §EXTRACTED 2026-09-03 — idearium/ui/js/app.js already has this exact

#### `ui/themes/`

2 other file(s).

- other: `ui/themes/nexus-dark.css`, `ui/themes/nexus-light.css`

#### `ui/tv-shell/`

1 code · 3 other file(s).

- `ui/tv-shell/menu.js` (568 lines)
- other: `ui/tv-shell/DECOMP.md`, `ui/tv-shell/index.html`, `ui/tv-shell/tv-shell.css`

#### `ui/tv-shell/components/`

2 code file(s).

- `ui/tv-shell/components/guardian.js` (54 lines) — ui/tv-shell/components/guardian.js Guardian channel component. Reads from /contract first, then polls
- `ui/tv-shell/components/system-component.js` (241 lines) — ui/tv-shell/components/system-component.js Base class for all tv-shell channel components.

#### `ui/tv-shell/forge-shell/`

1 other file(s).

- other: `ui/tv-shell/forge-shell/index.html`

#### `ui/tv-shell/nerve/`

1 code · 2 other file(s).

- `ui/tv-shell/nerve/nerve.js` (319 lines) — NEXUS Nerve System CFR field mapped onto nodes and wires rendered as a living nervous
- other: `ui/tv-shell/nerve/nerve.css`, `ui/tv-shell/nerve/nerve.html`

#### `ui/tv-shell/spotlight/`

1 code · 1 other file(s).

- `ui/tv-shell/spotlight/spotlight.js` (481 lines) — ui/tv-shell/spotlight/spotlight.js Sovereign spotlight + pressure system.
- other: `ui/tv-shell/spotlight/spotlight.css`

#### `ui/tv-shell/tutorial/`

1 code file(s).

- `ui/tv-shell/tutorial/tutorial.js` (183 lines)  
  tested by `tests/modules/tutorial-engine.test.js`

#### `ui/tv-shell/warp-ui/`

2 code file(s).

- `ui/tv-shell/warp-ui/nexus-shell.js` (410 lines) — ui/tv-shell/warp-ui/nexus-shell.js The NEXUS TV-shell Warp stream.  
  emits nexus.contract.loaded, nexus.ledger.entry, nexus.system.poll
- `ui/tv-shell/warp-ui/warp-browser.js` (143 lines) — ui/tv-shell/warp-ui/warp-browser.js Browser-compatible Warp core — Event, Gate, Stream, Axiom.

#### `warp/`

3 other file(s).

- other: `warp/LICENSE`, `warp/MANIFEST.json`, `warp/plugins.zip`

#### `warp/core/`

7 code file(s).

- `warp/core/Axiom.js` (46 lines) — Axiom — an enforced invariant, same standing as Gate. This is the primitive the SISO paper doesn't have. Its constraints  
  exports Axiom, DEFAULT_WEIGHTS · requires 0 · required by 4
- `warp/core/Event.js` (28 lines) — Event — immutable data packet. { type, data, uuid, ts }. Never mutated after creation. Matches SISO's Event shape exactly —  
  exports Event · requires 0 · required by 4
- `warp/core/Gate.js` (59 lines) — Gate — pure transform. matches(event) -> bool, transform(event) -> Event[]. v1.0.1 change: transform now RETURNS the events it produces instead of  
  exports Gate · requires 0 · required by 2
- `warp/core/GateFusion.js` (89 lines) — GateFusion — v1.4 "gate fusion system." Merges an adjacent chain of pure Gates into a single Gate, so Stream.emit()'s recursive dispatch  
  exports fuseChain, canFuse · requires 2 · required by 2
- `warp/core/Stream.js` (299 lines) — Stream — the dispatch loop. Same O(1) signature-lookup discipline as SISO's Stream. The addition: every transform runs through registered  
  exports Stream · requires 0 · required by 3
- `warp/core/StreamLog.js` (112 lines) — StreamLog — append-only audit trail. Observes, never consumes. Same shape as SISO's log, plus axiom-check entries WARP's Stream writes.  
  exports StreamLog · requires 0 · required by 3
- `warp/core/index.js` (10 lines)  
  exports Event, Gate, Axiom, Stream, StreamLog, fuseChain +1 · requires 6 · required by 7 · tested by `warp/test/core.test.js`, `warp/test/digest-regression.test.js` +3

#### `warp/dispatch/`

8 code file(s).

- `warp/dispatch/benchmark.js` (226 lines) — real measurements, not estimates. Three axes: build speed (construction + dispatch throughput), token cost (model-call reduction  
  requires 11 · required by 0
- `warp/dispatch/canonicalize.js` (87 lines) — v1.4 addition. Two separate things live here on purpose, because they answer two different questions:  
  exports canonicalize, fingerprint, fingerprintKey, similarityScore · requires 0 · required by 5 · tested by `warp/test/v1.4-additions.test.js`
- `warp/dispatch/cascade.js` (114 lines) — model cascading (cheap-first cost pattern) + retry ladder. Generalizes seam-queue.js's context/shorter/forensic strategy shape  
  exports runCascade, runTwoStage · requires 0 · required by 3 · tested by `tests/modules/test-warp-cascade-provider-fallback.js`, `warp/test/dispatch.test.js` +2
- `warp/dispatch/deltaCache.js` (144 lines) — v1.4 "structural delta cache." Correcting scope up front: this is a STORAGE optimization, not a  
  exports computeDelta, applyDelta, DeltaCrystallizer · requires 1 · required by 1 · tested by `warp/test/v1.4-additions.test.js`
- `warp/dispatch/digest.js` (42 lines) — content-addressable cache key. Bazel/Buck2's exact pattern: hash(gate signature + versioned axiom set + canonicalized event content)  
  exports computeDigest, _canonicalize · requires 1 · required by 2 · tested by `warp/test/digest-regression.test.js`
- `warp/dispatch/index.js` (236 lines) — opts in (exactCacheOnFirstSuccess). See docs/warp-devkit-addendum-v1.4.1.spec. Default behaviour unchanged.  
  exports unifiedDispatch · requires 3 · required by 2 · tested by `warp/test/dispatch.test.js`, `warp/test/v1.1.0-additions.test.js` +1
- `warp/dispatch/population.js` (182 lines) — scored archive per gate-class. AlphaEvolve/FunSearch pattern, scaled down: keep variants, not just one "best" attempt. Next  
  exports PopulationStore, DEFAULT_PROMOTE_THRESHOLD, DEFAULT_FITNESS_MIN, defaultPromotionPolicy, reuseCountPromotionPolicy · requires 1 · required by 4 · tested by `warp/test/dispatch.test.js`, `warp/test/v1.1.0-additions.test.js` +1
- `warp/dispatch/pregen.js` (53 lines) — v1.4 "pre-generation filter layer." Placement matters: this runs AFTER the exact-cache miss (step 1) and  
  exports preGenerationCheck, DEFAULT_THRESHOLD · requires 1 · required by 2 · tested by `warp/test/v1.4-additions.test.js`

#### `warp/plugins/`

2 code file(s).

- `warp/plugins/crystallizer-flatfile.js` (59 lines) — default storage adapter for the exact-cache. Trivial in-memory + optional flat-file persistence. A consuming project  
  exports FlatFileCrystallizer · requires 0 · required by 3 · tested by `warp/test/dispatch.test.js`, `warp/test/v1.1.0-additions.test.js` +1
- `warp/plugins/scorer-default.js` (40 lines) — five-axis fitness (coherence/friction/resonance/ entropy pattern + tokenEfficiency). Independently written — not  
  exports scoreDefault, estimateTokens · requires 0 · required by 1 · tested by `warp/test/dispatch.test.js`, `warp/test/v1.1.0-additions.test.js` +1

#### `warp/spec/`

1 other file(s).

- other: `warp/spec/warp.spec`

#### `warp/test/`

5 test file(s).


<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
