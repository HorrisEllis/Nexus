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

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
