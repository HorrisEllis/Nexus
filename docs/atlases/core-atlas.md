# core — everything no kernel owns

> **status: mapped (0.39.264)** · no port, no entry · the shared code, the fabric, the Compartment OS, the command line, the docs and the tests · a module of `nexus`, back up one level in `nexus-atlas.md`

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

`core` is the fourteenth system, defined by exclusion in `lib/nexus-self/systems.js`: every file whose top-level directory is not one of the thirteen kernels belongs to core. That makes it the largest system by far, and also the least like the others. It has no process of its own. Its libraries run inside whichever kernel requires them, its documents describe every system, and its tests check every system. When Idearium shows NEXUS as a repo with nested system repos, `core` is the one holding `lib/`, `lib/cli/`, `lib/warp/`, `lib/siso/`, `docs/`, `tests/` and the rest.

Because core has no port, "running core" means running something that uses it: `lib/cos-run.js` runs a core change in a full-tree workspace, and its tests are found by what they require, not by where they sit.

---

## File Structure

```
nexus/
  lib/                shared libraries — agents, ledgers, registries, diagnosis, COS glue, NEXUS-as-a-repo
  cos/                (since 0.39.341 its own system — cos-atlas.md)
  lib/cli/            the nexus command line and maintenance tools
  lib/nexus/          autopilot, the event bus, query and connect layers
  lib/warp/           the five-primitive event spine
  lib/siso/           single input, single output — Event, Gate, Stream, StreamLog
  (retired) jaa           retired 2026-10-24 — the JAA table schema
  lib/contracts/      the NEXUS interaction contract and contract node types
  lib/hooks/          per-system hook declarations
  (retired) seams  retired 2026-10-24 — seam contracts and the port table
  orchestrator/auth/  orchestrator — sovereign authentication
  cos/security/       cos — the encrypted remote-session channel and kill switch
  lib/meta/           domain-agnostic measurement
  guardian/mesh/      guardian — networking daemons ported from BrainOS
  cos/remote-desktop/  cos — remote desktop host, viewer and bridge-os-core (COS front end)
  lib/emerge/         the .eg DSL runtime and the spec compiler
  clear-glass/erosmancer/  clear-glass — ErosmancerOS, CDP browser automation
  lib/cockpit/        the forge IDE spec and core
  idearium/architecture-spec/  idearium — the scaffold every new system is built on
  (service split)     split 2026-10-24 — guardian/guardian-service.js, cortex/cortex-service.js, idearium/idearium-service.js
  lib/sentinel/       the sentinel's interaction contract
  scripts/            verification and release scripts
  skills/             session skills
  cos/tablet/         cos — the tablet homepage and 3D map (COS front end)
  lib/ui/             the UI shells
  docs/               the written record
  tests/              the proof
```

> **2026-10-24 (0.60.236, RF2).** James: "need the systems soveriegn" · "remote desktop, tablet was meant to tbe the front end for cos" · "security goes with remote desktop". The folders that were not one of the 15 systems moved into the system that uses them (lib/architecture-apply.js; git kept each file's history): auth → orchestrator, mesh → guardian, idearium/architecture-spec → idearium, erosmancer → clear-glass, remote-desktop, security and tablet → cos, service/ split into guardian, cortex and idearium; jaa and seams retired to _archive/2026-10-24-retired-systems/. The rest (cockpit, contracts, hooks, meta, sentinel, siso, ui, emerge, emergence, warp, nexus, cli) are next, into lib/.


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

`lib/diagnostic-engines.js` and `lib/diag-engines/` are the diagnostic engines `lib/cli/diagnose.js` runs; `lib/diagnostic-causal.js`, `lib/diagnostic-report.js` and `diagnostic/lib/diagnostic-contract.js` explain and report (the contract moved into diagnostic with the healer, 0.60.136). `lib/gap-field.js`, `lib/gap-priority.js` and `lib/gap-relay.js` find, rank and relay gaps. `lib/autonomous-repair.js`, `lib/integrity-revert.js`, `lib/safe-apply.js` and `lib/file-integrity.js` are the repair side, and `lib/heartbeat.js` and `lib/resource-monitor.js` watch liveness and memory pressure.

### COS glue

`lib/cos-bridge.js` is how NEXUS reaches COS compartments, `lib/cos-run.js` is the Run menu (every way a repo can be run, and why an option is unavailable), `lib/repo-run.js` runs a repo in its compartment through the test environment, `lib/compartment-engine.js` and `lib/project-compartment.js` tie projects to compartments, and `lib/file-tree-plan.js` plans a new repo's files layer by layer.

### NEXUS as a repo

`lib/nexus-self/` is what lets Idearium manage NEXUS from inside NEXUS. `lib/nexus-self/systems.js` decides which system owns each file; `lib/nexus-self/store.js` is the immutable base, content-addressed blobs and append-only snapshots; `lib/nexus-self/branch.js` is an edit branch of one system, a real COS branch; and `lib/nexus-self/apply.js` is the only path from a branch back into the live tree.

### Rules every test lives under

`lib/test-sandbox.js` gives every suite a throwaway data root so no test writes to the tree, and `lib/version.js` is the single source of every version number, with a dated entry per release.

---

## cos/ — now its own system

Since 0.39.341 (SY2 — James: "cos needs to be a nested compartment", then "Its own system (16th)") `cos/` is no longer core's: it is the system `cos`, with its own nested repo and compartment in Idearium. Everything this section said about it moved, unchanged, to `cos-atlas.md`. What stays core's is the glue in `lib/` that reaches COS: `lib/cos-bridge.js`, `lib/cos-run.js`, `lib/repo-run.js`, `lib/compartment-engine.js`.

---

## cli/ — the command line

`lib/cli/nexus-cli.js` is the grammar-driven command line (the grammar comes from every system's registered components), `lib/cli/nexus-repl.js` the interactive shell, and `lib/cli/nexus.js` the entry. `lib/cli/boot-systems.js` is the ordered boot the orchestrator used before autopilot, `lib/cli/diagnose.js` runs every diagnostic engine against one system's ledger, and `lib/cli/sentinel.js` is the sentinel. The maintenance tools clean and check the data: `lib/cli/data-audit.js`, `lib/cli/find-orphans.js`, `lib/cli/purge-pollution.js`, `lib/cli/dedup.js`, `lib/cli/semantic-dedup.js`, `lib/cli/compact.js`, `lib/cli/clear-idearium.js`. Its spec is `lib/cli/spec/cli.spec`.

---

## The fabric: nexus/, warp/, siso/, jaa/

`lib/nexus/autopilot.js` starts every kernel in dependency phases and supervises them, restarting with backoff. `lib/nexus/nexus-bus.js` is the common event fabric, `lib/nexus/nexus-query.js` one query interface over every system, and `lib/nexus/nexus-connect.js` the cross-system call, with a UUID on every call and every failure loud.

`lib/siso/` is the pattern: one input, one output, state in the data structure, transformation as events (`lib/siso/Gate.js`, `lib/siso/Stream.js`, `lib/siso/StreamLog.js`, spec `lib/siso/spec/siso.spec`), credited to Jonathan Bailey. `lib/warp/` is the standalone devkit that hardens it: five primitives in `lib/warp/core/` (Event, Gate, Stream, StreamLog, Axiom), and dispatch with canonical digests, a delta cache, cascades and pre-generation in `lib/warp/dispatch/`. Its spec, `lib/warp/spec/warp.spec`, keeps the dependency one way: NEXUS imports WARP, never the reverse. the JAA table schema (jaa/, retired 2026-10-24, kept in the archive) and the JAA table schema (jaa/, retired 2026-10-24, kept in the archive) define the JAA tables every row of state lives in.

---

## Declared connections: contracts/, hooks/, seams/

`lib/contracts/nexus-interaction-contract.js` is the one table of every endpoint, port, SSE event and command, and `lib/contracts/nodes/` holds the contract node types: axioms, bottlenecks, causal physics, deltas, edges, events, faults, gaps, ledgers, self-awareness, systems and verification contracts. `lib/hooks/index.js` is the living hook registry, read before any system boots, with one declaration file per system (`lib/hooks/cortex.hooks.js`, `lib/hooks/guardian.hooks.js`, `lib/hooks/idearium.hooks.js` and the rest) and `lib/hooks/side-effect-parser.js` to find side effects a hook did not declare. the seam contracts (seams/, retired 2026-10-24, kept in the archive) declares every seam and holds the port table.

---

## Trust: auth/, cos/security/

`orchestrator/auth/index.js` is the sovereign authentication layer: each client has an RSA keypair and signs its requests, and `orchestrator/auth/policy.json` says who may do what; `orchestrator/auth/client.js` is the caller's side. `cos/security/signaling-envelope.js` signs the remote-desktop signaling channel so a replayed or hijacked session is refused, closing two items in `cos/remote-desktop/remote-desktop.spec`.

---

## Measurement: meta/

`lib/meta/index.js` gathers modules that measure, detect, classify and score without knowing what NEXUS is, so any system can use them over their API. `lib/meta/confidence.js` scores confidence, and `lib/meta/crystal-lattice.js` is crystallization and the lattice: patterns that keep holding are promoted, and ones that fail are demoted.

---

## Adjacent systems

`guardian/mesh/` holds networking daemons ported from BrainOS and kept optional: DNS, dynamic DNS, a reverse proxy and a firewall (`guardian/mesh/lib/dns-server.js`, `guardian/mesh/lib/ddns.js`, `guardian/mesh/lib/reverse-proxy.js`, `guardian/mesh/lib/firewall.js`), started by `guardian/mesh/daemons.js`.

`cos/remote-desktop/` controls another machine: a host page (`cos/remote-desktop/host.html`), a viewer (`cos/remote-desktop/viewer.html`), input authorization and injection (`cos/remote-desktop/input-auth.js`, `cos/remote-desktop/input-injector.js`), signaling (`cos/remote-desktop/signal.js`), an Electron bridge (`cos/remote-desktop/bridge-electron/main.js`) and the vendored `cos/remote-desktop/bridge-os-core/` for identity and keys. `cos/remote-desktop/remote-desktop.spec` orders its build as a bottom-up phasemap.

`lib/emerge/` reads .eg files, a declarative language: tokenizer, a parser gated on signal-to-noise, kernel and emitter (`lib/emerge/emerge-kernel.js`), code generation through Ollama for the gaps (`lib/emerge/emerge-codegen-v2.js`), and the spec compiler in `lib/emerge/compiler/` whose T0 to T3 pipeline queries cortex first (`lib/emerge/cortex-query/`). Its specs are `lib/emerge/spec/emerge.spec` and `lib/emerge/SPEC_COMPILER.spec`.

`clear-glass/erosmancer/erosmancer-os/` is ErosmancerOS, a TypeScript engine that drives a browser over the Chrome DevTools Protocol: behavior profiles for human-like input, routing, hostile-page detection, replay and adaptive memory, served on port 7432 by `clear-glass/erosmancer/erosmancer-os/src/api/server.ts`. Since 0.39.264 Clear Glass starts it with itself and connects it to its own DevTools port (`clear-glass/src/eros/supervisor.js`). Its spec is `clear-glass/erosmancer/spec/erosmancer.spec`.

`lib/cockpit/cockpit.spec` is the forge IDE's full specification, with its core in `lib/cockpit/core.js` and its pipeline in `lib/cockpit/pipeline.js`. The healer, once a system scaffolded by loom's generator beside these, moved into diagnostic in 0.60.136 (his call: diagnostic and the healer are one system): `diagnostic/healer/api/index.js`, with its spec in `diagnostic/spec/healer.spec`.

`idearium/architecture-spec/` is the base a new sovereign system is built on before it has features: components, hooks and wires compiled into a lattice (`idearium/architecture-spec/registry/lattice.js`), a watcher per node type (`idearium/architecture-spec/registry/watcher.js`), friction (`idearium/architecture-spec/registry/friction.js`), decomposition (`idearium/architecture-spec/registry/decompose.js`), phases (`idearium/architecture-spec/registry/phases.js`), and the atlas tools (`idearium/architecture-spec/registry/create-atlas.js`, `idearium/architecture-spec/registry/edit-atlas.js`, `idearium/architecture-spec/registry/nexus-atlas-aggregate.js`). Its own atlas is `architecture-spec-atlas.md`.

---

## Operations: service/, sentinel/, scripts/, skills/, cos/tablet/

`guardian/guardian-service.js` and `idearium/idearium-service.js` boot a kernel as a supervised ICO service with every lifecycle event in its ledger. `lib/sentinel/interaction-contract.json` is the sentinel's contract. `scripts/` holds release and verification tools: `scripts/verify-boot.js`, `scripts/verify-wires.js`, `scripts/precommit-check.js`, `scripts/run-verification-manifest.cjs`, `scripts/bump-version.py`. `skills/` holds session skills (`skills/nexus-session-changelog/SKILL.md`, `skills/james-brooks/SKILL.md`). `cos/tablet/` is the tablet homepage (`cos/tablet/index.html`) and its 3D map (`cos/tablet/map3d.html`).

---

## ui/ — the shells

The home shell (`lib/ui/home/index.html`, its structure written down in `lib/ui/home/STRUCTURE.md`), the TV shell (`lib/ui/tv-shell/`), BrainOS and its floating panel (`lib/ui/brainos/`, `lib/ui/brainos-float/`), the control panel (`lib/ui/control-panel/index.html`), the provider agents' pages (`lib/ui/agents/`), the pipeline tutorial (ui/pipeline-tutorial.js — archived 0.54.0 to _archive/2026-10-09-declutter/), and shared code (`lib/ui/api.js`, `lib/ui/ports.js`, `lib/ui/pulse.js`, `lib/ui/store.js`). The orchestrator serves each shell under /ui/.

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

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-24. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**4719** files · **1594** code files · **0** registry components declared here · **181** events emitted · **66** heard · **0** routes · **169** code files with a covering test

### Events it emits (181) — and who hears them

- **guardian.ncp.sync_result** — from `tests/modules/test-chat-sync-agent-routing.test.js` → `guardian/lib/chat-sync.js` (guardian), `guardian/lib/chat-transcripts.js` (guardian)
- **anomaly.detected** — from `lib/config-governance.js`, `tests/modules/test-escalation.js` +2 → `cortex/orion/index.js` (cortex), `tests/modules/test-config-governance.js`, `tests/nexus-full-audit.js`
- **guardian.job.progress** — from `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-chat-transcripts.test.js` +2 → `guardian/lib/chat-transcripts.js` (guardian), `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-guardian-retry-novelty-installs.js`
- **raid.route.request** — from `tests/modules/test-raid-router.js` → `cortex/core/raid/router.js` (cortex), `tests/modules/test-raid-router.js`
- **nexus.resource.pressure** — from `tests/modules/test-escalation.js` → `orchestrator/orchestrator.js` (orchestrator)
- **sigma.event.halt_risk** — from `tests/modules/test-gap-finder.js`, `tests/modules/test-orion.js` → `cortex/orion/index.js` (cortex)
- **sigma.event.warning** — from `tests/modules/test-gap-finder.js`, `tests/modules/test-orion.js` → `cortex/orion/index.js` (cortex)
- **guardian.job.complete** — from `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-economy-guardian.test.js` +2 → `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-chat-transcripts.test.js`, `tests/modules/test-registry-harness.test.js`
- **guardian.job.error** — from `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-economy-guardian.test.js` +1 → `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-chat-transcripts.test.js`, `tests/modules/test-economy-guardian.test.js`
- **ess:unresolve** — from `lib/ess.js` → `tests/brutal.test.js`, `tests/full.test.js`
- **guardian.job.chunk** — from `tests/modules/test-guardian-mesh-client.js` → `tests/modules/test-live-everywhere.test.js`, `tests/modules/test-work-journal.test.js`
- **guardian.job.timeout** — from `tests/modules/test-economy-guardian.test.js` → `tests/modules/test-back-and-forth.test.js`, `tests/modules/test-profile-tabs.test.js`
- **ico:ledger:fork** — from `lib/ico.js` → `tests/full.test.js`, `tests/modules/test-ico-ledger-writethrough.js`
- **cortex.orion.classified** — from `tests/modules/test-raid-orion-wiring.js` → `tests/modules/test-orion.js`
- **guardian.tool.called** — from `tests/modules/tool-call-listener.test.js` → `lib/agent-tools/tool-call-listener.js`
- **ico:crystal:formed** — from `lib/ico.js` → `tests/full.test.js`
- **ico:drop** — from `lib/ico.js` → `tests/full.test.js`
- **ico:failure** — from `lib/ico.js` → `tests/full.test.js`
- **ico:pipe:error** — from `lib/ico.js` → `tests/full.test.js`
- **shadow.declared** — from `lib/shadow.js` → `tests/modules/test-shadow.test.js`
- **shadow.settled** — from `lib/shadow.js` → `tests/modules/test-shadow.test.js`
- **store.flushed** — from `tests/modules/test-registry-harness.test.js` → `tests/modules/test-registry-harness.test.js`
- **a.thing.done** — from `tests/modules/test-event-contracts.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.bid.detected** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.bid.response** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.decay.detected** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.decay.threshold** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.meaning.created** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.meaning.deflated** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.ready** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.repair.attempt** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.rupture.detected** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.rupture.severity** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.session.start** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.session.stop** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.summary** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.rel.trajectory.update** — from `lib/emergence/vendor/rfr2/field/relational.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.session.capture.start** — from `lib/emergence/components/rfr2-observer/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.session.capture.stop** — from `lib/emergence/components/rfr2-observer/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.verbal.analysis.sentiment** — from `lib/emergence/components/rfr2-observer/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **alk.verbal.chunk.transcribed** — from `lib/emergence/components/rfr2-observer/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.deprecated** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.registered** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.removed** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.unwired** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.updated** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.hook.wired** — from `lib/hook-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **artifacts.changed** — from `lib/ui/store.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **blueprint.loaded** — from `lib/blueprint.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **causal:record** — from `lib/emergence/loop.js`, `lib/emergence/test/loop.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr:create** — from `lib/emergence/loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.applied** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.diagnostic_requested** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.guardian_throttled** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.guardian_unthrottled** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.snr_floor_cleared** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.snr_floor_raised** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cfr.influence.versionium_accelerated** — from `lib/nexus/nexus-cfr-influence.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ci:run:started** — from `tests/modules/test-event-contracts.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cli.exec.done** — from `lib/cockpit/cli.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **commented.out** — from `tests/modules/test-event-contracts.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **compartment.spawned** — from `lib/compartment-engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **compiler.check** — from `tests/modules/test-event-contracts.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **component.deprecated** — from `lib/component-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **component.hard_deleted** — from `lib/component-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **component.updated** — from `lib/component-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **config.changed** — from `lib/ui/store.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **constitution.decision** — from `lib/constitutional-ai.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **contract-registry.axiom.changed** — from `lib/contract-registry-writer.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **contract-registry.violation.flagged** — from `lib/contract-registry-writer.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **cortex.memory.updated** — from `lib/ui/store.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **entropy.changed** — from `lib/ui/store.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ess:bind** — from `lib/ess.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ess:noise_alert** — from `lib/ess.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ess:resolve** — from `lib/ess.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ess:unbind** — from `lib/ess.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **ess:write** — from `lib/ess.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **eventlog.bulk** — from `lib/ui/store.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **eventlog.push** — from `lib/ui/store.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **fake.event** — from `tests/modules/test-capability-spec.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- … 101 more — loom.find.tool kind "event"

### Events it hears from elsewhere (48)

**architect.snr.flagged** (architect) · **copilot.error.detected** (copilot) · **cortex.gap.found** (orchestrator) · **cortex.raid.decided** · **cortex.self-heal.deep_scan_findings** · **cortex.self-heal.failure_mode** · **cortex.self-heal.fix_proposed** · **cortex.self-heal.fix_staged** · **cortex.self-heal.remediation_requested** · **cortex.self-heal.skipped** · **dom:pick-result** · **escalation.failure_mode** · **escalation.friction.increased** · **gap.found** · **guardian.chat.transcript.recorded** (guardian) · **guardian.economy.fallback** · **guardian.economy.wait** · **guardian:job:complete** · **host:compartment:error** · **host:compartment:runtime-set** · **idearium.spec.collected** · **idearium.spec.compiled** · **job.done** · **liminal.velocity.runaway** · **nexus.self-build.housekeeping-complete** · **nexus:cookie-request** · **plugin:test:seen** · **raid.route.decided** (cortex) · **raid.route.fulfilled** · **raid.route.no_route** (cortex) · **real.evt** · **ring:evicted** · **ring:pushed** · **shortcut:action** · **spatial.kernel.landscape.updated** · **spatial.resonance.scored** · **sql.plan** · **step.blocked** · **step.passed** · **t.absent** · **t.broken** · **t.build** · **t.lattice** · **t.ledger** · **t.model** · **t.reuse** · **t.vector** · **test:build**

### Files, directory by directory (561 directories)

#### `.gitignore`

- `run-all.js` (454 lines) — tests/modules/run-all.js — Module Test Runner Runs every per-module fractal adversarial test suite.
- `test-new-plugins.js` (166 lines) — // ── pure functions, no jaaDB needed ─────────────────────────────────────────  
  requires 3 · required by 0
- `test-node-index.js` (106 lines)  
  requires 3 · required by 0
- other: 456 files (.gitignore, .json, .npmrc, .md, VERSION, .jsonl)

#### `docs/`

402 other file(s).

- other: 402 files (.spec, .md, .json, .htm, .yaml, .html)

#### `docs/architecture-spec/`

1 other file(s).

- other: `docs/architecture-spec/architecture-spec.spec`

#### `docs/atlases/`

18 other file(s).

- other: 18 files (.md)

#### `docs/contracts/`

4 other file(s).

- other: `docs/contracts/context-candidate.spec`, `docs/contracts/context-synthesis-pipeline.spec`, `docs/contracts/ct0-executable-contracts.contract`, `docs/contracts/synthesis-contract.spec`

#### `docs/guides/`

1 other file(s).

- other: `docs/guides/tutorial-build-first-spec.guide`

#### `docs/looking-glass/`

3 other file(s).

- other: `docs/looking-glass/PHASEMAP.md`, `docs/looking-glass/README.md`, `docs/looking-glass/SPEC.spec`

#### `docs/roadmap/`

3 other file(s).

- other: `docs/roadmap/2026-08-22-copilot-end-state-vision.md`, `docs/roadmap/2026-08-22-full-phase-map.md`, `docs/roadmap/NEXUS-ROADMAP.md`

#### `docs/specs/`

13 other file(s).

- other: 13 files (.md)

#### `lib/`

292 code · 2 other file(s).

- `lib/account-identity-index.js` (61 lines) — a real, stable UUID per (agent, account), not per session. James: "having a uuid for accounts in the cookie  
  exports resolve, touch, forAgent, TABLE, MODULE_ID, VERSION · requires 1 · required by 0
- `lib/account-registry.js` (194 lines) — CA7 (backend) of the awareness/routing phasemap §PHASEMAP CA7 (docs/copilot-awareness-routing-phasemap.spec, CHUNK D). ClearGlass  
  exports ACCOUNTS_TABLE, PROVIDERS, KNOWN_PROVIDERS_TABLE, addAccount, listAccounts, getAccountForRoute +6 · requires 1 · required by 1
- `lib/agent-build-learning.js` (96 lines) — which agent tends to succeed at building James: "need to try them all, unless it's a system failure... order still  
  exports getConfidence, orderedAgents, recordOutcome, allAgents, TABLE, MODULE_ID +1 · requires 1 · required by 1
- `lib/agent-build-loop.js` (174 lines) — // ───────────────────────────────────────────────────────────────────────────── // lib/agent-build-loop.js — a real agent, writing into a real compartment,  
  exports introspect, buildInCompartment, _extractCode, MODULE_ID, VERSION · requires 4 · required by 0
- `lib/agent-capability-profile.js` (98 lines) — what's actually true about each agent's real capabilities, measured over time, not assumed.  
  exports profile, profileAll, MODULE_ID, VERSION · requires 2 · required by 1
- `lib/agent-capability.js` (313 lines) — // ───────────────────────────────────────────────────────────────────────────── // lib/agent-capability.js — what each agent can ACTUALLY take, measured  
  exports record, profile, chunkFor, calibrate, all, load +11 · requires 1 · required by 1
- `lib/agent-chat.js` (558 lines)  
  exports WAKE_RE, parseWake, ask, converse, readChat, readLiveDom +11 · requires 0 · required by 2
- `lib/agent-council.js` (87 lines) — multiple real agents deliberate on one decision; RAID governs what actually happens with their verdicts.  
  exports convene, summarize, MODULE_ID, VERSION · requires 2 · required by 1
- `lib/agent-facts-hash.js` (26 lines) — GA1: one definition of an agent fact's canonical form and its hash, shared by the side that states the facts (guardian/lib/agent-facts.js) and the side that caches them…  
  exports FIELDS, canonical, hash, MODULE_ID, VERSION · requires 0 · required by 2
- `lib/agent-identity.js` (58 lines) — // lib/agent-identity.js — §NEW 2026-09-17 //  
  exports resolveIdentity, parseIdentity, MODULE_ID, VERSION
- `lib/agent-intent-contract.js` (114 lines) — AM1: real, RAID-checkable per-agent intent contracts.  
  exports checkAgentIntentContract, VALID_BASE_AGENTS, MODULE_ID, VERSION · tested by `tests/modules/test-agent-hat-agnostic.test.js`
- `lib/agent-memory.js` (259 lines)  
  exports record, recall, search, agentIdFor, _signature, _summarise +2 · requires 6 · required by 8 · tested by `tests/modules/test-agent-memory.test.js`
- `lib/agent-model.js` (252 lines) — // copilot/lib/agent-model.js — §NEW 2026-09-17 //  
  exports init, stop, observe, observeExclusive, getHypotheses, deriveFromFaultLog +5 · requires 3 · required by 1
- `lib/agent-notes.js` (92 lines) — the editable per-agent constraint log James asked for directly, distinct from lib/agent-capability-profile.js's passive,  
  exports note, notesFor, allAgents, TABLE, MODULE_ID, VERSION · requires 1 · required by 1
- `lib/agent-providers.js` (139 lines) — who can wear a hat: one list, one resolver. §0.39.267 — James: "the agent hat is meant to be agnostic, ollama/guardian/copilot."  
  exports guardianTabs, guardianReady, headless, HEADLESS, all, guardianProviders +9 · requires 2 · required by 9 · tested by `tests/modules/test-agent-hat-agnostic.test.js`
- `lib/agent-pull.js` (99 lines) — the agent PULL toolbox (agnostic; §AP1 agent-intelligence) James: "inject what's needed into agents, and give them the tools to interact  
  exports pull, listPullTools, MODULE_ID, VERSION · requires 4 · required by 3
- `lib/agent-reach.js` (160 lines) — is this agent ACTUALLY reachable right now? WHY (James, 2026-08-19): "the change agents tool needs to connect to the  
  exports reach, all, providers, KIND, STATE, MODULE_ID +1
- `lib/agent-record.js` (168 lines)  
  exports MODULE_ID, VERSION, record, orderLadder, bucketOf, kindOf +1 · requires 1 · required by 0
- `lib/agent-router.js` (138 lines) — CA5 of the awareness/routing phasemap §PHASEMAP CA5 (docs/copilot-awareness-routing-phasemap.spec, CHUNK C). Maps a  
  exports routeAgent, chunkForAgent, _inferIntent, DEFAULT_ROUTES, DEFAULT_FALLBACK, AGENT_CONSTRAINTS +2 · requires 1 · required by 5
- `lib/agent-self-model.js` (150 lines)  
  exports MODULE_ID, VERSION, SEED, get, observe, interrogationPrompt +4
- `lib/agent-tool-call.js` (109 lines) — // lib/agent-tool-call.js — real, pure parser for the tool-call syntax a // browser-typed agent reply uses to request a real tool execution.  
  exports parseToolCall, parseAllToolCalls, stripToolCall, formatToolResult, MODULE_ID, VERSION
- `lib/architecture-apply.js` (194 lines)  
  exports MODULE_ID, VERSION, plan, apply, check
- `lib/architecture-migrate.js` (210 lines)  
  exports MODULE_ID, VERSION, CORE, RETIRED, RETIRED_DIR, read +5 · requires 2 · required by 1 · tested by `tests/modules/test-architecture-migrate.test.js`
- `lib/atlas-generate.js` (238 lines)  
  exports generate, sectionFor, splice, walk, atlasFileFor, syncReadme +4 · requires 4 · required by 2
- `lib/autonomous-loop.js` (114 lines) — // ── lib/autonomous-loop.js ─────────────────────────────────────────────────── // UUID: nexus-autonomous-loop-v1-0000-4000-0000-000000000001  
  exports run, validateWiring, MODULE_ID, VERSION · requires 0 · required by 2
- `lib/autonomous-repair.js` (113 lines) — R3: co-pilot notices, and fixes the same safe way docs/repair-contract-and-loom-hub-phasemap.spec R3. James: "loom is  
  exports wireAutonomousRepair, REPAIRABLE_GAP_TYPES, _diagnose, _applyRepair, MODULE_ID, VERSION · requires 3 · required by 0
- `lib/autopilot-intelligence.js` (109 lines) — wire + verify the intelligence substrate at boot James: "completely update the entire autopilot. Check lib, the intelligence  
  exports wireIntelligence, MODULE_ID, VERSION · requires 5 · required by 1
- `lib/blueprint-index.js` (353 lines) — Phase BP-01: Live System Blueprint Index Maps every NEXUS system to its live component set, CLI commands,  
  exports build, load, copilotContextBlock, lookupGrammar, lookupCLI, systemMap +2 · requires 0 · required by 4 · emits nexus.blueprint.index.built, nexus.blueprint.index.error
- `lib/blueprint.js` (251 lines) — Phase 42: Blueprint The loop closes. The system reads itself.  
  exports init, compile, load, sigma, MODULE_ID, VERSION +2 · requires 7 · required by 0 · emits blueprint.loaded
- `lib/boot-sequence.js` (211 lines) — lib/boot-sequence.js Gated boot engine. Used by every system.  
  exports BootSequence
- `lib/build-context.js` (292 lines)  
  exports pack, rankFiles, interfaceOf, MODULE_ID, VERSION, DEFAULT_BUDGET +6 · requires 3 · required by 2 · tested by `tests/modules/test-build-context.test.js`
- `lib/build-paths.js` (84 lines) — WB0: every build path, the agent call it makes, and whether WARP is on it. Measured from source. James, 2026-10-15: "make sure all builds use warp."  
  exports VERSION, FILES, BUILDS, NOT_BUILDS, census · requires 1 · required by 2
- `lib/build-pipeline.js` (141 lines) — HTTP/SSE front door for the closed build loop §GAP CLOSED 2026-07-07 — the closed loop this wraps already exists and  
  exports startBuild, getBuild, listBuilds · requires 1 · required by 1
- `lib/build-queue.js` (111 lines)  
  exports VERSION, GROUPS, queue, lines · requires 1 · required by 3
- `lib/build-verify.js` (253 lines) — does the code a spec produced actually work? One verification, graded, every failure attributed to one file with the exact error.  
  exports verify, against, baselineOf, keyOf, attributeTest, loadsOf +8 · requires 2 · required by 1 · tested by `tests/modules/test-build-verify.test.js`
- `lib/bus-subscriptions.js` (259 lines)  
  exports MODULE_ID, VERSION, TABLE, STALE_MS, publish, publishPeriodically +4 · requires 0 · required by 3 · tested by `tests/modules/test-adversarial-sim.js`, `tests/modules/test-bus-subscriptions.js`
- `lib/canvas-compartments.js` (182 lines)  
  exports MODULE_ID, VERSION, MANIFEST, create, addTool, show +1 · requires 3 · required by 2
- `lib/capability-registry.js` (143 lines)  
  exports MODULE_ID, VERSION, init, capabilities, buildToolsPrompt, resolve +2 · requires 0 · required by 3 · tested by `tests/modules/test-capability-registry.js`
- `lib/capability-spec.js` (167 lines)  
  exports MODULE_ID, VERSION, KINDS, parse, measure, check +3 · requires 1 · required by 2
- `lib/case-library.js` (309 lines) — // ── lib/case-library.js ─────────────────────────────────────────────────────── // UUID: nexus-case-library-v1-0000-4600-0000-000000000001  
  exports indexCompartment, query, validateWiring, _resetInMemoryState, _evictOverflow, _mostRecentTrace +6 · requires 2 · required by 1 · tested by `tests/modules/case-library.test.js`
- `lib/cg-learning.js` (180 lines)  
  exports MODULE_ID, VERSION, T, HEALABLE, NOT_FOUND, hostOf +11 · requires 1 · required by 3
- `lib/chains.js` (131 lines)  
  exports runChain, MODULE_ID, VERSION · requires 3 · required by 1
- `lib/change-entry.js` (81 lines) — one approved (or reverted) change as its Versionium commit carries it (APV1, 0.60.190). Spec: docs/approval-chain.spec MOD-APV-ENTRY (schema ChangeEntry). Map:…  
  exports MODULE_ID, VERSION, entry, title, counts, runOf · requires 1 · required by 1
- `lib/change-record.js` (136 lines)  
  exports VERSION, MATCH_SLACK_MS, record, lines · requires 2 · required by 2
- `lib/charter.js` (113 lines)  
  exports MODULE_ID, VERSION, FILE, LEAST_CODE, parse, load +6 · requires 1 · required by 1 · tested by `cos/test/test.js`
- `lib/chat-crawl-plan.js` (160 lines)  
  exports MODULE_ID, create, observeList, next, report, resume +2 · requires 1 · required by 1 · tested by `tests/modules/test-chat-crawl-plan.test.js`, `tests/modules/test-chat-crawler.test.js`
- `lib/chat-crawl-settings.js` (98 lines) — every setting of the personal-chat capture, in one table (PI5, 0.60.55) Map: docs/2026-10-15-personal-chat-import-phasemap.spec  
  exports GROUPS, SCHEMA, BY_KEY, defaults, clean, effective · requires 0 · required by 4 · tested by `clear-glass/test/chats-settings.test.js`, `tests/modules/test-chat-crawl-plan.test.js` +1
- `lib/chat-index.js` (56 lines) — // lib/chat-index.js — the real-time chat index James asked ClearGlass's // download manager to become: "separated by provider, then agent, then  
  exports buildChatIndex, MODULE_ID, VERSION
- `lib/chat-ledger-client.js` (45 lines) — read Clear Glass's live chat ledgers through its own routes (0.60.192). James, 2026-10-21: "look in clearglass download manager". His 0.39.278 idea already keeps every chat there as the page…  
  exports MODULE_ID, VERSION, url, chat, list · requires 0 · required by 2
- `lib/chat-logger.js` (287 lines) — NEXUS Chat Logger Logs every AI exchange — NCP, Ollama, direct chat — to JAA's chat_log table  
  exports startSession, getSession, log, buildInjectionContext, sessionSummary, listSessions +3 · requires 1 · required by 2
- `lib/check-catalogue.js` (95 lines) — QA1: the catalogue runs. Serves cos/spec/check-catalogue.spec (119 checks) and runs the ones that have a runner. component_id: nexus.lib.check-catalogue  
  exports MODULE_ID, VERSION, SPEC, list, get, runnable +2 · requires 5 · required by 2
- `lib/chunk-build-orchestrator.js` (122 lines)  
  exports buildWithFallback, _isInfraFailure, MODULE_ID, VERSION · requires 4 · required by 0
- `lib/chunk-glyph.js` (198 lines)  
  exports VERSION, glyph, glyphCode, glyphProse, glyphData, documentFrequencies · requires 0 · required by 2 · tested by `tests/modules/test-nexus-self-and-cos-run.test.js`
- `lib/chunk-service.js` (94 lines) — chunking consolidated through the RAID engine (James) James: "RAID engine consolidate chunking." Chunking was scattered across FOUR  
  exports chunk, chunkGoverned, CAPABILITY, MODULE_ID, VERSION · requires 1 · required by 2
- `lib/claude-code-backend.js` (247 lines) — // lib/claude-code-backend.js — Claude Code as an Idearium agent backend (IN2a). // component_id: lib.claude-code-backend  
  exports MODULE_ID, VERSION, DEFAULT_TOOLS, ASK_TOOLS, ASK_PREAMBLE, binary +10 · requires 0 · required by 2
- `lib/clear-glass-stream-bridge.js` (135 lines)  
  exports enable, disable, status, _parseSseChunk · requires 0 · required by 1
- `lib/cli-map.js` (149 lines) — Phase 40.5: CLI Map Generator Reads all registered component descriptors from the registry,  
  exports generate, load, getDispatchTable, getHelpText, CLI_MAP_PATH, MODULE_ID +1 · requires 3 · required by 1
- `lib/cli-reasoning.js` (312 lines) — CLI Reasoning Layer (Qwen 0.5b) Qwen 0.5b as the CLI's reasoning layer.  
  exports isAvailable, rephrase, identifyGap, suggestCorrection, agentCheck, resolve +3 · requires 1 · required by 1
- `lib/code-edit.js` (476 lines)  
  exports VERSION, VIA, planEdits, unifiedDiff, diagnose, current +7 · requires 4 · required by 3
- `lib/coder-brief.js` (94 lines) — CB1 (0.60.171): the brief a coder gets for one file, in the five parts Gemini said make it code at its best. Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec CB1  
  exports MODULE_ID, VERSION, AXIOM_RULES, stackOf, compose · requires 1 · required by 1
- … 232 more code files — loom.find.tool
- other: `lib/architecture-migrate.decisions.json`, `lib/repo-prompt-blocks.previous.json`

#### `lib/activity-log/`

2 code file(s).

- `lib/activity-log/compartment.js` (101 lines)  
  exports MODULE_ID, VERSION, TABLE, record, list, facets +1 · requires 1 · required by 5
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
- `lib/agent-tools/generate-tool-nodes.js` (112 lines) — // lib/agent-tools/generate-tool-nodes.js — real generator + real listener. // James: "in the nodes folder in lib. they all need to be a real yaml  
  exports generate, checkDrift, startDriftListener, NODES_DIR, REAL_AGENTS · requires 2 · required by 0
- `lib/agent-tools/index.js` (684 lines) — Sovereign agent tool-calling core §ARCHITECTURE — sovereign, not a monolith bolted onto copilot. This  
  exports registerTool, getToolSchemas, executeTool, runToolLoop, fillRequired, TOOLS
- `lib/agent-tools/naming.js` (97 lines) — the real naming convention James specified: System.toolname.tool — e.g. guardian.build.tool  
  exports VALID_SYSTEMS, VALID_PROVIDERS, toolName, commandName, agentToolName, parseName · requires 0 · required by 15 · tested by `tests/modules/test-gap-tools.js`, `tests/modules/test-tool-naming-convention.js`
- `lib/agent-tools/tool-call-listener.js` (118 lines) — lib/agent-tools/tool-call-listener.js §BUILT 2026-09-08 — James: "the listener for the tools. like when an  
  exports install, recordCall, recordResult, findRecentResult, TABLE, REUSE_WINDOW_MS · hears guardian.tool.called · tested by `tests/modules/tool-call-listener.test.js`
- `lib/agent-tools/tool-catalog.js` (131 lines) — every registered tool, in plain language. §BUILT 0.39.257 — James: "need the full capabilities, with the /help and tool  
  exports GROUPS, OTHER, groupOf, catalog, search, firstSentence +3 · requires 0 · required by 3
- `lib/agent-tools/tool-guide.js` (256 lines) — CA2 of the awareness/routing phasemap §PHASEMAP CA2 (docs/copilot-awareness-routing-phasemap.spec). Tool schemas  
  exports toolGuide, noteFor, GUIDE_VERSION, NOTES, INSIDE_NEXUS, allNoteNames +1
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

- `lib/agent-tools/tools/browser/browser-action.js` (263 lines) — lib/agent-tools/tools/browser-action.js — browser_action tool §BUILT 2026-07-13 — "Guardian is supposed to use Clear Glass. It's  
  exports name, description, driverCall

#### `lib/agent-tools/tools/clear-glass/`

15 code file(s).

- `lib/agent-tools/tools/clear-glass/adblock.js` (37 lines) — clear_glass_adblock: Clear Glass's content blocker for agents (AB4, 0.60.183). Spec: clear-glass/spec/adblock.spec MOD-ABK-SURFACE.  
  exports name, description, page, easyprivacy, ublock, annoyances +4 · requires 1 · required by 0
- `lib/agent-tools/tools/clear-glass/automation.js` (166 lines) — clear_glass_automation: the co-pilot builds, runs and inspects Clear Glass workflows.  
  exports name, description, http, workflow, stop
- `lib/agent-tools/tools/clear-glass/browser-automation.js` (83 lines) — clear_glass_browser: a real browser page an agent drives step by step, with the automation DOM tools.  
  exports name, description
- `lib/agent-tools/tools/clear-glass/browser.js` (231 lines)  
  exports name, description, providers, accounts, macros, headings +1 · requires 2 · required by 2 · tested by `tests/modules/clear-glass-agent-surface.test.js`
- `lib/agent-tools/tools/clear-glass/command-index.js` (132 lines) — James: "hooked into co-pilot so it can use clearglass at full compatibility."  
  exports name, description, parameters, properties, enum · requires 1 · required by 0 · tested by `tests/modules/clear-glass-agent-surface.test.js`
- `lib/agent-tools/tools/clear-glass/dom-archaeology.js` (71 lines) — real agent access to ClearGlass's DOM Archaeology panel. James: "dom archeology  
  exports name, description, parameters, properties, chatgpt
- `lib/agent-tools/tools/clear-glass/firefox.js` (23 lines) — clear_glass_firefox: which Firefox profiles this machine has (BS7, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-SURFACE.  
  exports name, description, parameters, properties, enum · requires 1 · required by 0
- `lib/agent-tools/tools/clear-glass/learned.js` (77 lines) — clearglass.learned.tool: what copilot has learned, and using it. James, 2026-09-27: "also have him learn." lib/cg-learning.js keeps what happened on each site (selectors that  
  exports name, description, actions, failures, heals · requires 5 · required by 0
- `lib/agent-tools/tools/clear-glass/macro.js` (446 lines)  
  exports name, description, store
- `lib/agent-tools/tools/clear-glass/net.js` (67 lines) — clear_glass_net: read Clear Glass's network routes and the Snowflake transport. (0.60.60, NP9) James, 2026-10-15: "add support for snowflake, using cli, then you can add the commands to the agents,  
  exports name, description, parameters, properties, enum · requires 0 · required by 2
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
- `lib/agent-tools/tools/diagnostic/nexus-heal.js` (78 lines) — lib/agent-tools/tools/nexus-heal.js — copilot's access to nexus-healer §WIRED 2026-08-12. nexus-heal proposes fixes for gaps/diagnostics found  
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

- `lib/agent-tools/tools/idearium/code.js` (330 lines)  
  exports ALL, CODE_TOOLS, READ_ONLY, LISTED, code_map, code_search +11 · requires 2 · required by 1
- `lib/agent-tools/tools/idearium/repo-chunks.js` (129 lines) — idearium.repo_chunks.tool The compartment agent's way to read a repo's CHUNK NODES for context, when it  
  exports name, description, chunk, parameters, properties · requires 1 · required by 0

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

2 code file(s).

- `lib/agent-tools/tools/nexus/command.js` (134 lines) — nexus.command.tool: every command a person has, for an agent. §0.39.376 CM2 James: "Yes. And copilot. Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can."  
  exports command, ALL, _keyOf, _trim, MAX_CHARS · requires 1 · required by 3
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

18 code file(s).

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
- `lib/agent-tools/tools/query/learn.js` (48 lines) — nexus.learn.tool: learn anything, as a checklist. §0.39.339 SB39. James: "im saying for anything it wants to learn. agnostic tool for context". lib/context-prereqs.js  
  exports name, description, code, need, path, ask · requires 2 · required by 0
- `lib/agent-tools/tools/query/meta-query.js` (137 lines)  
  exports name, description, parameters, properties, enum
- `lib/agent-tools/tools/query/nexus-help.js` (86 lines) — lib/agent-tools/tools/nexus-help.js — "ask co-pilot anything about NEXUS." §WIRED 2026-08-12 (P11 of docs/copilot-full-capability-phasemap.spec).  
  exports name, description, versions, parameters, properties, enum
- `lib/agent-tools/tools/query/nexus-map.js` (145 lines)  
  exports name, description, hooks, parameters, properties, enum · requires 2 · required by 0
- `lib/agent-tools/tools/query/nexus-status.js` (123 lines) — lib/agent-tools/tools/nexus-status.js — nexus_status tool §BUILT 2026-07-14 — "copilot needs to be the face of NEXUS, can do  
  exports name, description, table, parameters, properties, enum · requires 4 · required by 0
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
- `lib/agent-tools/tools/sandbox/self-repair.js` (238 lines)  
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

#### `lib/checks/`

11 code file(s).

- `lib/checks/ck-230-shadow.js` (35 lines) — CK-230 "expected but absent" (cos/spec/check-catalogue.spec, family shadow). component_id: nexus.lib.checks.ck-230-shadow  
  exports ID, run · requires 1 · required by 1
- `lib/checks/ck-231-half-states.js` (28 lines) — CK-231 "half-states" (cos/spec/check-catalogue.spec). component_id: nexus.lib.checks.ck-231-half-states  
  exports ID, run · requires 1 · required by 0
- `lib/checks/ck-233-deny.js` (95 lines) — CK-233 "forbidden things absent" (cos/spec/check-catalogue.spec, family negative-space). component_id: nexus.lib.checks.ck-233-deny  
  exports ID, load, run · requires 0 · required by 1
- `lib/checks/ck-237-verifiable.js` (44 lines) — CK-237 "unverifiable condition" (cos/spec/check-catalogue.spec). component_id: nexus.lib.checks.ck-237-verifiable  
  exports ID, run · requires 1 · required by 0
- `lib/checks/ck-239-two-ends.js` (35 lines) — CK-239 "every edge has two ends" (cos/spec/check-catalogue.spec). component_id: nexus.lib.checks.ck-239-two-ends  
  exports ID, run
- `lib/checks/ck-247-decomposition.js` (68 lines) — CK-247 "depth-bounded decomposition" (cos/spec/check-catalogue.spec, recursion). component_id: nexus.lib.checks.ck-247-decomposition  
  exports ID, run, checkPayload · requires 1 · required by 0
- `lib/checks/ck-248-toolchain.js` (152 lines) — CK-248 "the language's own toolchain" (cos/spec/check-catalogue.spec, family languages). component_id: nexus.lib.checks.ck-248-toolchain  
  exports ID, LANGS, has, run, checkText, selfTest +2 · requires 0 · required by 3 · tested by `tests/modules/test-language-checks.test.js`, `tests/modules/test-step-gate.test.js`
- `lib/checks/ck-252-primitive.js` (32 lines) — CK-252 "a new check names its primitive" (cos/spec/check-catalogue.spec). component_id: nexus.lib.checks.ck-252-primitive  
  exports ID, run
- `lib/checks/ck-253-versions.js` (27 lines) — CK-253 "versions agree" (cos/spec/check-catalogue.spec, family relationships). component_id: nexus.lib.checks.ck-253-versions  
  exports ID, run · requires 1 · required by 1
- `lib/checks/ck-254-surface.js` (33 lines) — CK-254 spec surface: a capability's code exposes what its spec promises, no more, no less. component_id: nexus.lib.checks.ck-254-surface · Map:…  
  exports ID, run · requires 1 · required by 0
- `lib/checks/ck-255-warp-builds.js` (27 lines) — CK-255 "every build goes through WARP" (cos/spec/check-catalogue.spec). component_id: nexus.lib.checks.ck-255-warp-builds  
  exports ID, run · requires 1 · required by 1

#### `lib/chunker/`

1 code file(s).

- `lib/chunker/index.js` (327 lines)  
  exports chunkDocument, structuralProfile, toLoomDeclarations, detectSubBoundaries, slug, SPLIT_THRESHOLD_CHARS · requires 0 · required by 2 · tested by `tests/modules/test-spec-library.test.js`

#### `lib/cli/`

26 code file(s).

- `lib/cli/axiom.js` (137 lines) — cli/axiom.js CLI: nexus axiom <command> [args]  
  requires 1 · required by 0
- `lib/cli/boot-systems.js` (257 lines) — cli/boot-systems.js — NEXUS Per-System Boot Sequencer Status: pre-release  
  exports _waitForHealth, _bootOneSys, _bootSystems · requires 1 · required by 0
- `lib/cli/cfr-debug.js` (465 lines) — cli/cfr-debug.js — CFR-Ω Replay + Audit CLI The debugger. Reads ledger JSONL files and reconstructs causal history  
  requires 5 · required by 0
- `lib/cli/clear-idearium.js` (407 lines)  
  requires 1 · required by 0
- `lib/cli/compact.js` (92 lines) — cli/compact.js — table-compactor.js CLI Same dry-run-by-default convention as cli/dedup.js, for the same  
  requires 2 · required by 0
- `lib/cli/compartments.js` (120 lines) — cli/compartments.js — every Nexus system as a repo compartment (virtual repos). node cli/compartments.js list  
  requires 1 · required by 0
- `lib/cli/copilot-window.js` (89 lines) — cli/copilot-window.js — open the co-pilot CLI in a NEW terminal window James: "make the cli open in a new window that connects to each system with  
  exports openCopilotWindow · requires 0 · required by 1
- `lib/cli/data-audit.js` (167 lines)
- `lib/cli/decompose.js` (470 lines)
- `lib/cli/dedup.js` (71 lines) — cli/dedup.js — table-deduplicator.js CLI James: "clear all duplicates from each table. make a tool for it."  
  requires 3 · required by 0
- `lib/cli/diagnose.js` (1433 lines) — cli/diagnose.js — NEXUS System Diagnostic Sequencer Status: pre-release  
  requires 1 · required by 0
- `lib/cli/find-orphans.js` (236 lines)
- `lib/cli/import-history.js` (289 lines)  
  exports MODULE_ID, VERSION, parseArgs, listZips, scanZip, orderScans +3 · requires 1 · required by 2
- `lib/cli/nexus-cli.js` (55 lines) — cli/nexus-cli.js — RETIRED (consolidated into copilot/cli.js) §CONSOLIDATION 2026-07-30 (James: "the only cli should have co-pilot available  
  exports canonical, _copilotAsk · requires 1 · required by 0 · tested by `tests/modules/cli-copilot-fallback.test.js`
- `lib/cli/nexus-movement.js` (225 lines) — cli/nexus-movement.js — 'nexus movement <system>' The custom command. One panel per system, laid out like the checkmk  
  exports render, spark, gauge
- `lib/cli/nexus-repl-descriptors.js` (150 lines) — // ── cli/nexus-repl-descriptors.js ─────────────────────────────────────────── // UUID: nexus-repl-descriptors-v1-0000-3600-0000-000000000001  
  exports DESCRIPTORS, registerAll, MODULE_ID, VERSION · requires 0 · required by 1 · tested by `tests/modules/nexus-repl-descriptors.test.js`
- `lib/cli/nexus-repl.js` (1234 lines) — cli/nexus-repl.js — NEXUS Interactive CLI REPL Status: pre-release  
  requires 4 · required by 0
- `lib/cli/nexus.js` (748 lines) — // ════════════════════════════════════════════════════════════════════════════ // nexus — Unified CLI v2.0  
  requires 5 · required by 0
- `lib/cli/nodes.js` (52 lines) — cli/nodes.js — every system's nodes from the command line (0.39.271 X1). node cli/nodes.js sync [--dry] [--only guardian,idearium] regenerate (lib/system-nodes.js)  
  requires 1 · required by 0
- `lib/cli/opportunity.js` (148 lines)  
  requires 2 · required by 0
- `lib/cli/pressure.js` (57 lines) — cli/pressure.js — ask the system what led to a pressure spike. spec: docs/pressure-causality.spec § P4
- `lib/cli/purge-pollution.js` (87 lines) — cli/purge-pollution.js — tests/modules/_purge-test-rows.js CLI, for cleaning up test pollution that ALREADY accumulated in the real,
- `lib/cli/run-supervised.js` (21 lines) — // ── cli/run-supervised.js ─────────────────────────────────────────────────── // UUID: nexus-run-supervised-v1-0000-4000-0000-000000000001  
  requires 1 · required by 0
- `lib/cli/semantic-dedup.js` (74 lines) — cli/semantic-dedup.js — lib/semantic-dedup.js CLI James: "vector memory? like semantic memory help reduce dedups" — yes.  
  requires 3 · required by 0
- `lib/cli/sentinel.js` (352 lines) — cli/sentinel.js — NEXUS Sentinel CLI spec: docs/nexus-sentinel.spec — phase S1  
  exports readFaults, contract, HANDLERS, CONTRACT_PATH
- `lib/cli/session.js` (220 lines) — cli/session.js — SESSION.md Renderer Renders SESSION.md as a deterministic projection of current system state.

#### `lib/cli/spec/`

1 other file(s).

- other: `lib/cli/spec/cli.spec`

#### `lib/cockpit/`

4 code · 1 other file(s).

- `lib/cockpit/cli.js` (710 lines) — forge-cli.js — CLI command layer + interaction contract All commands route through SISO bus — same hooks, different surface (ME-2).  
  exports ForgeCLI, INTERACTION_CONTRACT, _chunkSpec, _chunkTitle · requires 0 · required by 2 · emits cli.exec.done
- `lib/cockpit/core.js` (544 lines) — forge-core.js — SISO bus + JAA browser store + Bayesian trust + SNR PORT: depends on forge-ui (Idearium at port 4800, Guardian at port 7820)  
  exports SISOKernel, SISOEvent, SISOGate, JAAStore, TrustEngine, IdeiarumClient +5
- `lib/cockpit/live.js` (71 lines) — cockpit/live.js — the live, composed cockpit instance §THE REAL GAP THIS CLOSES — checked before writing: ForgeCLI,  
  exports getForgeCLI, ready, TABLE · requires 3 · required by 1
- `lib/cockpit/pipeline.js` (993 lines) — forge-pipeline.js — Pipeline engine + SEAM compiler + condition evaluator Node types (all SEAM-web-aligned):  
  exports SeamCompiler, SeamEvaluator, seamEval, seamEvalSafe, validateExpr, Pipeline +6 · requires 0 · required by 1 · emits forge.gap.opened, forge.notify, pipeline.deleted, pipeline.run.complete +6
- other: `lib/cockpit/cockpit.spec`

#### `lib/code-intel/`

7 code file(s).

- `lib/code-intel/cards.js` (269 lines) — a card per chunk: what it is, what it uses, what uses it. §0.39.273 CB2. James: "all context is easy to search and understand for each chunk." A card is small on purpose  
  exports buildCards, importBindings, docOf, summarize, firstSentence, CARD_VERSION +2 · requires 1 · required by 1
- `lib/code-intel/chunker.js` (380 lines) — structural chunk plan for one file. §0.39.273 CB1. planChunks(content, language) -> { chunks, symbols, family, fallback }.  
  exports planChunks, VERSION, LIMITS, definesOf, exportedNames · requires 2 · required by 2
- `lib/code-intel/decls.js` (216 lines) — what a statement-start line declares, per language. §0.39.273 CB1. Applied ONLY to lines ./structure.js marks as a statement start at the level being chunked, so a  
  exports matchDecl, signatureOf, KEYWORDS · requires 0 · required by 1
- `lib/code-intel/index.js` (315 lines) — code intelligence for any repo idearium holds: structural chunks, a card per chunk, ranked search, grep, outlines, and the repo overview. The one module both the import pipeline (writes) and the  
  exports INTEL_VERSION, CHUNKER_VERSION, LIMITS, planChunks, buildIntel, load +15 · requires 5 · required by 6
- `lib/code-intel/search.js` (245 lines) — ranked search over every chunk of a repo, and exact grep over its files. §0.39.273 CB3. The 0.39.272 repo search matched query tokens against symbol NAMES and file PATHS only — the body of  
  exports buildIndex, query, grep, snippet, pathMatcher, chunkAt +2 · requires 1 · required by 1
- `lib/code-intel/structure.js` (251 lines)  
  exports familyOf, scanBraces, scanIndent, scanMarkdown, lineInfo, indentWidth +2 · requires 0 · required by 3
- `lib/code-intel/text.js` (119 lines) — the one tokenizer every code-intel index and query uses. §0.39.273 CB3. Identifiers are indexed whole ('materializequiet') AND split ('materialize', 'quiet'), so a query  
  exports terms, stem, splitIdent, stripCode, identifiersOf, inlineRequires +2 · requires 0 · required by 3

#### `lib/contracts/`

2 code · 2 other file(s).

- `lib/contracts/SYSTEM-CONTRACTS.js` (178 lines) — contracts/SYSTEM-CONTRACTS.js — NEXUS System-Wide Contract Registry Status: pre-release  
  exports NEXUS_VERSION, AXIOMS, SYSTEMS, EVENTS, GAPS, FAULTS +8 · requires 14 · required by 0
- `lib/contracts/nexus-interaction-contract.js` (604 lines)  
  exports getContract, getVersionedContract, getContractWithFallback, validateRequest, validateRequestAt, listSnapshots +4 · requires 0 · required by 1
- other: `lib/contracts/drawbridge-baseline.json`, `lib/contracts/event-contract-baseline.json`

#### `lib/contracts/nodes/`

14 code file(s).

- `lib/contracts/nodes/axioms.node.js` (73 lines) — contracts/nodes/axioms.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.axioms.node  
  requires 0 · required by 1
- `lib/contracts/nodes/bottlenecks.node.js` (37 lines) — contracts/nodes/bottlenecks.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.bottlenecks.node  
  requires 0 · required by 1
- `lib/contracts/nodes/causal-physics.node.js` (69 lines) — contracts/nodes/causal-physics.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.causal-physics.node  
  requires 0 · required by 1
- `lib/contracts/nodes/deltas.node.js` (37 lines) — contracts/nodes/deltas.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.deltas.node  
  requires 0 · required by 1
- `lib/contracts/nodes/divergent.node.js` (47 lines) — contracts/nodes/divergent.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.divergent.node  
  requires 0 · required by 1
- `lib/contracts/nodes/edges.node.js` (35 lines) — contracts/nodes/edges.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.edges.node  
  requires 0 · required by 1
- `lib/contracts/nodes/events.node.js` (215 lines) — contracts/nodes/events.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.events.node  
  requires 0 · required by 1
- `lib/contracts/nodes/faults.node.js` (55 lines) — contracts/nodes/faults.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.faults.node  
  requires 0 · required by 1
- `lib/contracts/nodes/gaps.node.js` (75 lines) — contracts/nodes/gaps.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.gaps.node  
  requires 0 · required by 1
- `lib/contracts/nodes/interaction-contracts.node.js` (44 lines) — contracts/nodes/interaction-contracts.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.interaction-contracts.node  
  requires 0 · required by 1
- `lib/contracts/nodes/ledgers.node.js` (120 lines) — contracts/nodes/ledgers.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.ledgers.node  
  requires 0 · required by 1
- `lib/contracts/nodes/self-awareness.node.js` (42 lines) — contracts/nodes/self-awareness.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.self-awareness.node  
  requires 0 · required by 1
- `lib/contracts/nodes/systems.node.js` (78 lines) — contracts/nodes/systems.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.systems.node  
  requires 0 · required by 1
- `lib/contracts/nodes/verification-contracts.node.js` (92 lines) — contracts/nodes/verification-contracts.node.js — extracted from contracts/SYSTEM-CONTRACTS.js Real node id: contracts.verification-contracts.node  
  requires 0 · required by 1

#### `lib/diag-engines/`

1 code file(s).

- `lib/diag-engines/index.js` (610 lines) — // ── lib/diag-engines/index.js ───────────────────────────────────────────────── // UUID: nexus-diag-engines-v1-0000-4000-0000-000000000003  
  exports runAll, snr_floor, homeostasis, fault_tree, cascade_risk, fingerprint +8

#### `lib/economy/`

6 code file(s).

- `lib/economy/gate.js` (54 lines) — may this job go to this provider now? §0.39.281 EC2. decide({ provider, jobType, estTokens }, { policy, usage, now }) →  
  exports decide, _inQuiet, MODULE_ID, VERSION · requires 0 · required by 4
- `lib/economy/ledger.js` (72 lines) — the economy's usage ledger: the ONE writer of usage records (I3). §0.39.281 EC1. Map: docs/2026-09-29-provider-economy-phasemap.spec (EC1).  
  exports record, records, usage, begin, end, dir +3 · requires 0 · required by 6 · tested by `tests/modules/test-guardian-stack-sim.test.js`
- `lib/economy/policy.js` (110 lines) — the provider economy's configuration. §0.39.281 EC0. Map: docs/2026-09-29-provider-economy-phasemap.spec (EC0).  
  exports TIERS, JOB_TYPES, LIMITS, tierOf, defaults, normalize +3 · requires 0 · required by 2
- `lib/economy/router.js` (89 lines) — the learning router ("smart economy"). §0.39.281 EC4. James: "Smart economy like dynamically evolving and learning routing."  
  exports scores, choose, COST, SIGNAL_WEIGHTS, weightOf, signalWeightsFrom +2 · requires 0 · required by 3
- `lib/economy/store.js` (39 lines) — where the economy's policy lives: <data>/economy/policy.json. §0.39.281 (EC0's persistence). load(providers) → the stored policy normalized for the providers that exist now (defaults if none stored);  
  exports load, save, file, MODULE_ID, VERSION · requires 3 · required by 4
- `lib/economy/tokens.js` (108 lines) — token estimates and the limits learned from what actually happened. §0.39.281 EC3. James: "What about using the tokenizer and graphs to learn token constraints."  
  exports estimate, learn, series, split, breakdown, METHOD +2 · requires 0 · required by 4

#### `lib/emerge/`

8 code · 5 other file(s).

- `lib/emerge/config.js` (19 lines) — emerge/config.js — real, distinct config for emerge's static defaults. Matches the pattern established by guardian/config.js,  
  exports DEFAULT_PORT, BUS_LOG_MAX
- `lib/emerge/emerge-codegen-v2.js` (859 lines) — Emergence .eg → SISO-wired CommonJS module v2 fixes over v1:  
  exports stop, handle, health, generateFile, generateCompartment
- `lib/emerge/emerge-ide.js` (337 lines) — // ════════════════════════════════════════════════════════════════════════════ // emerge-ide.js — entry point
- `lib/emerge/emerge-kernel.js` (604 lines) — // ════════════════════════════════════════════════════════════════════════════ // EMERGE KERNEL v1.0.0  
  exports compile, tokenize, snrGate, parse, validate, loadSpec +3 · requires 1 · required by 0 · emits kernel.booted, signal.noise, signal.passed
- `lib/emerge/event-taxonomy.js` (85 lines) — // emerge/event-taxonomy.js — every event EMERGE emits, in the ET1 shape (lib/event-taxonomy-pattern.js). // component_id: emerge.event-taxonomy
- `lib/emerge/registry-components.js` (33 lines) — emerge/registry-components.js
- `lib/emerge/verify.js` (276 lines) — smoke test for spec-compiler pipeline Runs the full T0+T1 pipeline against spec-parser.spec  
  requires 4 · required by 0
- `lib/emerge/version.js` (37 lines) — single source of truth for spec-compiler version strings. Every module that needs to report its version reads from here.  
  requires 0 · required by 6
- other: `lib/emerge/SPEC_COMPILER.spec`, `lib/emerge/emerge.spec`, `lib/emerge/interaction-contract.json`, `lib/emerge/package.json`, `lib/emerge/writeback-failures.jsonl`

#### `lib/emerge/chunk/`

1 code file(s).

- `lib/emerge/chunk/index.js` (368 lines) — chunk-format.js — CHUNK: the minimal token payload for small LLMs THE PROBLEM THIS SOLVES:  
  exports buildChunk, emitToPrompt, buildSeamContract, estimateTokens · requires 0 · required by 2 · tested by `lib/emerge/test/kg.test.js`

#### `lib/emerge/compiler/`

12 code file(s).

- `lib/emerge/compiler/baseline-tracker.js` (303 lines)  
  exports createBaselineTracker, BaselineTracker, TREND, SIGMA, STATUS, INVARIANT_IDS +1 · requires 1 · required by 0 · tested by `lib/emerge/test/gap-field.test.js`
- `lib/emerge/compiler/emit.js` (725 lines) — compiler/emit.js — T0 + T1 deterministic emitters, extracted from index.js Shared by pipeline.js (SISO stream) and index.js (legacy).  
  exports emitT0, emitT1, normalizeSpec, normalizeModules, sanitizeSpec, computeSpecDepth +12 · requires 2 · required by 1 · tested by `lib/emerge/test/gap-field.test.js`, `lib/emerge/test/invariants.test.js` +1
- `lib/emerge/compiler/gap-field-engine.js` (657 lines)  
  exports computeGapField, estimateTokenCost, getGapsByType, getBlockingGaps, createGapFieldPipeline, buildEmptyField +5 · requires 3 · required by 2 · tested by `lib/emerge/test/gap-field.test.js`, `lib/emerge/test/reply-engine.test.js`
- `lib/emerge/compiler/index.js` (734 lines) — compiler.js — Tier 0 + Tier 1 spec compiler TIER 0 — Structure. Zero LLM. Always runs.  
  exports compile, emitT0, emitT1, computeSpecDepth, computeGenReadiness, Events · requires 3 · required by 2
- `lib/emerge/compiler/invariants-engine.js` (573 lines)  
  exports check, checkNode, checkEdges, checkPropagation, createInvariantsPipeline, violation +2 · requires 2 · required by 1 · tested by `lib/emerge/test/gap-field.test.js`, `lib/emerge/test/invariants.test.js` +1
- `lib/emerge/compiler/kg-builder.js` (606 lines) — Knowledge Graph builder Transforms a ParsedSpec into a KnowledgeGraph: a queryable, self-aware  
  exports build, createKGPipeline, buildNode, computeGaps, assignConfidence, DEPTH +1 · requires 2 · required by 2 · tested by `lib/emerge/test/gap-field.test.js`, `lib/emerge/test/invariants.test.js` +4
- `lib/emerge/compiler/phase-specs.js` (295 lines)  
  exports MODULE_ID, VERSION, specIds, derive, write, check +3 · requires 6 · required by 0
- `lib/emerge/compiler/pipeline.js` (546 lines) — compiler/pipeline.js — spec-compiler as a SISO stream THE INSIGHT (from the SISO paper):  
  exports compile, createPipeline, driveAsync, E · requires 10 · required by 2 · tested by `lib/emerge/test/gap-field.test.js`, `lib/emerge/test/kg.test.js` +1
- `lib/emerge/compiler/reply-engine.js` (447 lines)  
  exports plan, selectReadyNodes, prioritize, createReplyPipeline, buildEmptyPlan, RE +1 · requires 4 · required by 1 · tested by `lib/emerge/test/reply-engine.test.js`
- `lib/emerge/compiler/ring-buffer.js` (447 lines)  
  exports RingBuffer, MutationBus, createRingBuffer, createMutationBus, makeMutation
- `lib/emerge/compiler/t2-gate.js` (344 lines) — emerge/compiler/t2-gate.js — THE MISSING GATE This is the gate that was always supposed to exist.  
  exports run, dispatch, buildNodePrompt, MODULE_ID, VERSION · requires 1 · required by 1
- `lib/emerge/compiler/tier-contract.js` (286 lines) — compiler/tier-contract.js THE EXECUTION SEMANTICS OF THE COMPILER.  
  exports TIER_CONTRACT, BOUNDARIES, decideTier, decideTierForSpec, shouldEmitT0, shouldEmitT1 +4 · requires 0 · required by 4 · tested by `lib/emerge/test/reply-engine.test.js`, `lib/emerge/test/tier-contract.test.js`

#### `lib/emerge/core/`

11 code file(s).

- `lib/emerge/core/budget.js` (23 lines) — budgetConstraint(limit) — refuses a transition whose cost would take the run past the limit.  
  exports createBudget, budgetConstraint · requires 1 · required by 2
- `lib/emerge/core/constraint.js` (31 lines) — // emerge/core/constraint.js — CONSTRAINT: reduces valid future states (ARCHITECT-SPEC §4.1). // component_id: emerge.core.constraint  
  exports defineConstraint, evaluate, TYPES · requires 0 · required by 3
- `lib/emerge/core/field.js` (91 lines) — // emerge/core/field.js — FIELD: the collection of possible states, and the one place a transition becomes real. // component_id: emerge.core.field  
  exports createField · requires 8 · required by 1
- `lib/emerge/core/gap.js` (13 lines) — // emerge/core/gap.js — GAP: missing information required to evaluate a constraint (ARCHITECT-SPEC §4.2). // component_id: emerge.core.gap  
  exports createGap · requires 0 · required by 2
- `lib/emerge/core/history.js` (40 lines) — verify() -> { ok, brokenAt } — every link and every hash recomputed.  
  exports createHistory · requires 2 · required by 2
- `lib/emerge/core/index.js` (20 lines) — // emerge/core/index.js — EMERGE's core: James's Rheon primitives as code (docs/2026-10-02-emerge-field-memory-build-phasemap.spec EM1). // component_id: emerge.core  
  requires 10 · required by 1
- `lib/emerge/core/lens.js` (19 lines) — // emerge/core/lens.js — LENS: a projection of the field. Read-only by construction: it is handed a deep-frozen copy. // component_id: emerge.core.lens  
  exports createLens, snapshot, deepFreeze · requires 0 · required by 2
- `lib/emerge/core/level.js` (36 lines) — // emerge/core/level.js — LEVEL: every node sits at a level, with its parent and children; its hash is its summary plus // its children's hashes, so a change anywhere below shows at every level above.  
  exports createLevels · requires 1 · required by 1
- `lib/emerge/core/observation.js` (19 lines) — // emerge/core/observation.js — OBSERVATION: evidence about states or transitions, with confidence, source and cost. // component_id: emerge.core.observation  
  exports createObservation · requires 0 · required by 2
- `lib/emerge/core/seed.js` (29 lines) — id(prefix) — an id drawn from the seed, so ids replay too.  
  exports createSeed · requires 0 · required by 2
- `lib/emerge/core/transition.js` (14 lines) — // emerge/core/transition.js — TRANSITION: movement between states. A proposal until the constraints let it through. // component_id: emerge.core.transition  
  exports createTransition · requires 0 · required by 2

#### `lib/emerge/cortex-query/`

2 code file(s).

- `lib/emerge/cortex-query/index.js` (274 lines) — cortex-query.js — CORTEX_QUERY_SEAM implementation (compiler side) Implements every command declared in CORTEX_QUERY_SEAM.  
  exports queryFiles, queryGaps, querySeams, queryMemory, preflight, ping +1 · requires 0 · required by 3
- `lib/emerge/cortex-query/writeback.js` (411 lines) — cortex-writeback.js — GATE-COMPILER-005 implementation Writes compiler output back to Cortex after every successful T0/T1 run.  
  exports writeback, uploadFiles, commitToVersionium, recordSeamCrossing, recordCompileMemory, writeFailureGaps +1 · requires 0 · required by 3

#### `lib/emerge/idearium/`

1 code file(s).

- `lib/emerge/idearium/client.js` (385 lines) — idearium/client.js — Idearium push/pull client Pushes spec-compiler compile results into Idearium as structured ideas.  
  exports ping, pushCompileResult, pullForModule, pullAllOpen, resolveIdea, sync · requires 0 · required by 1

#### `lib/emerge/output/`

1 other file(s).

- other: `lib/emerge/output/.gitkeep`

#### `lib/emerge/schemas/`

1 code · 7 other file(s).

- `lib/emerge/schemas/index.js` (51 lines) — // emerge/schemas/index.js — emerge's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `lib/emerge/schemas/schema.capability`, `lib/emerge/schemas/schema.command`, `lib/emerge/schemas/schema.component`, `lib/emerge/schemas/schema.hook`, `lib/emerge/schemas/schema.node`, `lib/emerge/schemas/schema.system`, `lib/emerge/schemas/schema.wire`

#### `lib/emerge/seams/`

1 code file(s).

- `lib/emerge/seams/CORTEX_QUERY_SEAM.js` (188 lines) — SEAM: CORTEX_QUERY_SEAM status: active

#### `lib/emerge/siso/`

5 code file(s).

- `lib/emerge/siso/Event.js` (16 lines) — Event — a datum flowing through the stream. Immutable. type is its signature. data is arbitrary.  
  exports Event · requires 0 · required by 2
- `lib/emerge/siso/Gate.js` (16 lines) — Gate — recognises one event type, transforms it. Signature is unique per stream. O(1) lookup.  
  exports Gate · requires 0 · required by 1
- `lib/emerge/siso/Stream.js` (138 lines) — Stream — the processing loop. Gates register by signature. Events arrive via emit().  
  exports Stream · requires 1 · required by 1
- `lib/emerge/siso/StreamLog.js` (30 lines) — StreamLog — the audit trail. Shared across sub-streams. Levels: OFF | EVENTS | DEEP | DATA  
  exports StreamLog · requires 0 · required by 1
- `lib/emerge/siso/index.js` (59 lines) — // ── Bus — named-stream factory with global listener support ────────────────── // bus.onAny(fn) — fn(event) called for every event emitted on ANY stream  
  exports Event, Gate, Stream, StreamLog, Bus · requires 4 · required by 5 · tested by `lib/emerge/test/gap-field.test.js`, `lib/emerge/test/invariants.test.js` +2

#### `lib/emerge/spec/`

3 other file(s).

- other: `lib/emerge/spec/emerge-core.spec`, `lib/emerge/spec/emerge.node-taxonomy.spec`, `lib/emerge/spec/emerge.spec`

#### `lib/emerge/test/`

6 test file(s).


#### `lib/emergence/`

3 code · 6 other file(s).

- `lib/emergence/cli.js` (176 lines) — the missing way in. Until now the only way to run text through the loop was 'require('./loop.js')' from another script.  
  requires 1 · required by 0
- `lib/emergence/loop.js` (249 lines)  
  exports createEmergenceLoop · requires 9 · required by 2 · emits causal:record, cfr:create, lattice:record, ledger:commit +1 · tested by `lib/emergence/schemas/test/schemas.test.js`, `lib/emergence/test/loop.test.js`
- `lib/emergence/server.js` (173 lines) — HTTP + SSE interface to the main Emergence loop. Genuinely additive, not a port: the loop had a CLI (cli.js) but no  
  exports createServer · requires 1 · required by 0 · tested by `lib/emergence/test/server.test.js`
- other: `lib/emergence/ARCHITECTURE.md`, `lib/emergence/MANIFEST.json`, `lib/emergence/README.md`, `lib/emergence/emerge-language.spec`, `lib/emergence/emergence.spec`, `lib/emergence/package.json`

#### `lib/emergence/components/associative-lattice/`

1 code · 1 other file(s).

- `lib/emergence/components/associative-lattice/index.js` (220 lines) — associative-lattice -- REBUILT (v0.2), PERSISTED (v0.3), FULLY REHYDRATED (v0.4), SIGMA-SNAPSHOTTED (v0.5).  
  exports buildLatticeGate, extractInvariants, jaccard · requires 3 · required by 1 · tested by `lib/emergence/test/loop.test.js`
- other: `lib/emergence/components/associative-lattice/component.spec`

#### `lib/emergence/components/causal-graph/`

1 code · 1 other file(s).

- `lib/emergence/components/causal-graph/index.js` (183 lines) — causal-graph -- REBUILT (v0.2), PERSISTED (v0.3), FULLY REHYDRATED (v0.4), SIGMA-SNAPSHOTTED (v0.5).  
  exports buildCausalGraphGate · requires 3 · required by 1 · tested by `lib/emergence/test/loop.test.js`
- other: `lib/emergence/components/causal-graph/component.spec`

#### `lib/emergence/components/cfr-creator/`

1 code · 1 other file(s).

- `lib/emergence/components/cfr-creator/index.js` (94 lines) — cfr-creator — REBUILT. The first version injected stress using a made-up formula (rupture*2000 + decay*800) and called that "creation" — it  
  exports buildCreatorGate · requires 1 · required by 1
- other: `lib/emergence/components/cfr-creator/component.spec`

#### `lib/emergence/components/event-ledger/`

1 code · 1 other file(s).

- `lib/emergence/components/event-ledger/index.js` (94 lines) — event-ledger -- WARP wiring around the real, unmodified vendor/rfr2/ledger/index.js FOR VALIDATION, and the real, ported  
  exports buildLedgerGate · requires 3 · required by 1
- other: `lib/emergence/components/event-ledger/component.spec`

#### `lib/emergence/components/feedback-loop-buffer/`

1 code · 3 other file(s).

- `lib/emergence/components/feedback-loop-buffer/index.js` (84 lines) — ring-buffer — top-level facade. §3.4 raw execution before interfaces: this is the "library" layer, callable directly with zero API/CLI  
  exports RingBuffer, RingBufferCore, createRingStream · requires 5 · required by 2 · tested by `lib/emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`
- other: `lib/emergence/components/feedback-loop-buffer/README.md`, `lib/emergence/components/feedback-loop-buffer/component.spec`, `lib/emergence/components/feedback-loop-buffer/package.json`

#### `lib/emergence/components/feedback-loop-buffer/api/`

1 code file(s).

- `lib/emergence/components/feedback-loop-buffer/api/server.js` (96 lines) — api/server.js — thin HTTP wrapper over the RingBuffer facade. §3.4: raw execution before interfaces — this exists because index.js  
  exports createServer · requires 1 · required by 0

#### `lib/emergence/components/feedback-loop-buffer/cli/`

1 code file(s).

- `lib/emergence/components/feedback-loop-buffer/cli/ring-cli.js` (95 lines) — ring-cli — talks to a running api/server.js instance over HTTP. §3.4: the last layer built, on top of an already-proven API.

#### `lib/emergence/components/feedback-loop-buffer/core/`

2 code file(s).

- `lib/emergence/components/feedback-loop-buffer/core/RingBufferCore.js` (104 lines) — RingBufferCore — the actual circular buffer. Pure data structure. No I/O, no WARP, no globals. Testable with zero other modules involved,  
  exports RingBufferCore · requires 0 · required by 2 · tested by `lib/emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`
- `lib/emergence/components/feedback-loop-buffer/core/wire.js` (123 lines) — connects RingBufferCore to WARP's Event/Gate/Axiom/Stream. Signal shape:  
  exports buildRingAxioms, buildRingGate, createRingStream, DEFAULT_SIZE_BUDGET_BYTES · requires 2 · required by 1 · emits ring:push · hears ring:pushed · tested by `lib/emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`

#### `lib/emergence/components/feedback-loop-buffer/diagnostics/`

1 code file(s).

- `lib/emergence/components/feedback-loop-buffer/diagnostics/health.js` (39 lines) — §12.6: "a diagnostic engine answers 'is this healthy right now' continuously, in production." A passing test suite proves this  
  exports computeHealth · requires 0 · required by 1

#### `lib/emergence/components/feedback-loop-buffer/persist/`

2 code file(s).

- `lib/emergence/components/feedback-loop-buffer/persist/EvictionLedger.js` (56 lines) — EvictionLedger — append-only NDJSON record of every eviction. WARP's own StreamLog already records every dispatch step (gate claimed,  
  exports EvictionLedger · requires 0 · required by 1 · hears ring:evicted · tested by `lib/emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`
- `lib/emergence/components/feedback-loop-buffer/persist/FilePersistence.js` (59 lines) — FilePersistence — JSON snapshot to disk. Zero dependencies (fs/path only), per §5.5: no database import for something this small earns its  
  exports FilePersistence · requires 0 · required by 1 · tested by `lib/emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`

#### `lib/emergence/components/feedback-loop-buffer/test/`

2 test file(s).


#### `lib/emergence/components/idea-store/`

1 code · 1 other file(s).

- `lib/emergence/components/idea-store/index.js` (205 lines) — idea-store -- refactored, not vendored, from build-tools/rheon-idea-os/storage/IdeaStore.js.  
  exports buildIdeaStore, EDGE_TYPES · requires 3 · required by 1 · emits idea:add, idea:link · tested by `lib/emergence/components/idea-store/test/idea-store.test.js`, `lib/emergence/schemas/test/schemas.test.js`
- other: `lib/emergence/components/idea-store/component.spec`

#### `lib/emergence/components/idea-store/test/`

1 test file(s).


#### `lib/emergence/components/pattern-engine/`

1 code · 1 other file(s).

- `lib/emergence/components/pattern-engine/index.js` (184 lines)  
  exports buildPatternEngine, signature · requires 3 · required by 1 · emits pattern:observe · tested by `lib/emergence/components/pattern-engine/test/pattern-engine.test.js`
- other: `lib/emergence/components/pattern-engine/component.spec`

#### `lib/emergence/components/pattern-engine/test/`

1 test file(s).


#### `lib/emergence/components/rfr2-observer/`

3 code · 1 other file(s).

- `lib/emergence/components/rfr2-observer/index.js` (203 lines)  
  exports buildObserverGate · requires 2 · required by 1 · emits alk.session.capture.start, alk.session.capture.stop, alk.verbal.analysis.sentiment, alk.verbal.chunk.transcribed · tested by `lib/emergence/components/rfr2-observer/test/affective-field.test.js`, `lib/emergence/components/rfr2-observer/test/oscillatory.test.js` +3
- `lib/emergence/components/rfr2-observer/kernel-adapter.mjs` (43 lines) — the minimal kernel RelationalModule (via ALKModule) actually requires: emit(type, payload, meta) and subscribe(pattern,  
  exports createMinimalKernel
- `lib/emergence/components/rfr2-observer/sentiment-scorer.js` (94 lines) — NEW code, not vendored from rfr2. Nothing in the codebase emits 'alk.verbal.analysis.sentiment' (checked — only  
  exports createSentimentScorer, scoreText, LEXICON · requires 0 · required by 1 · tested by `lib/emergence/components/rfr2-observer/test/sentiment-scorer.test.js`
- other: `lib/emergence/components/rfr2-observer/component.spec`

#### `lib/emergence/components/rfr2-observer/test/`

6 test file(s).


#### `lib/emergence/contracts/`

1 code file(s).

- `lib/emergence/contracts/LLM_CONTRACT.js` (128 lines) — SEAM: LLM_CONTRACT status: draft  
  exports LLM_CONTRACT

#### `lib/emergence/contracts/test/`

1 test file(s).


#### `lib/emergence/schemas/`

7 other file(s).

- other: `lib/emergence/schemas/created.schema.json`, `lib/emergence/schemas/idea-edge.schema.json`, `lib/emergence/schemas/idea.schema.json`, `lib/emergence/schemas/ledger-record.schema.json`, `lib/emergence/schemas/observation.schema.json`, `lib/emergence/schemas/target.schema.json`, `lib/emergence/schemas/tick-result.schema.json`

#### `lib/emergence/schemas/test/`

1 test file(s).


#### `lib/emergence/test/`

2 test file(s).


#### `lib/emergence/vendor/jaa/`

4 code file(s).

- `lib/emergence/vendor/jaa/FileRefs.js` (99 lines) — ported from Jaa/src/Persistence/FileRefs.php. Mutable name -> hash pointers (git-refs style), atomic write, prefix listing,  
  exports FileRefs · requires 0 · required by 5 · tested by `lib/emergence/vendor/jaa/test/jaa-port.test.js`
- `lib/emergence/vendor/jaa/FileStore.js` (56 lines) — ported from Jaa/src/Persistence/FileStore.php. Same scheme exactly: SHA-256(canonical(content)) is the address, content  
  exports FileStore · requires 1 · required by 5 · tested by `lib/emergence/vendor/jaa/test/jaa-port.test.js`
- `lib/emergence/vendor/jaa/Recovery.js` (65 lines) — ported from Jaa/src/Persistence/Recovery.php. Write- ahead log: begin() records an intended batch before it's applied,  
  exports Recovery · tested by `lib/emergence/vendor/jaa/test/jaa-port.test.js`
- `lib/emergence/vendor/jaa/canonicalize.js` (39 lines) — ported from Jaa/src/Persistence/Canonicalize.php. Not a reimplementation from scratch: same algorithm, translated line  
  exports canonicalize · requires 0 · required by 1 · tested by `lib/emergence/vendor/jaa/test/jaa-port.test.js`

#### `lib/emergence/vendor/jaa/test/`

1 test file(s).


#### `lib/emergence/vendor/resonance-v5.1/`

1 code file(s).

- `lib/emergence/vendor/resonance-v5.1/relational-physics.js` (1293 lines)  
  exports Theta, EMOTION_SIGNATURES, FrictionDetector, RelationalPhysicsEngine, EmotionEngine, AffectiveFieldSystem +6

#### `lib/emergence/vendor/rfr2/causality/`

1 code file(s).

- `lib/emergence/vendor/rfr2/causality/index.js` (266 lines) — @module causality @uuid 32a3f387-655c-4531-87a5-1b98641a8895  
  exports EDGE_CAUSAL_EXPLICIT, EDGE_CAUSAL_RULE, EDGE_CAUSAL_ADAPTER, EDGE_OBSERVATIONAL, CAUSAL_EDGE_TYPES, isCausalEdge +3

#### `lib/emergence/vendor/rfr2/cfr-kernel/`

4 code file(s).

- `lib/emergence/vendor/rfr2/cfr-kernel/index.js` (18 lines) — cfr-kernel v1.0.0 Constraint Field Runtime — standalone, decoupled physics kernel.
- `lib/emergence/vendor/rfr2/cfr-kernel/physics.js` (246 lines) — @module cfr/physics @uuid a1f2e3d4-b5c6-4789-8abc-def012345678  
  exports DEFAULT_CONFIG, createWorld, stepWorld, injectStress, upsertAttractor, removeAttractor
- `lib/emergence/vendor/rfr2/cfr-kernel/render.js` (162 lines) — @module cfr/render @uuid c3f4a5b6-d7e8-4901-abcd-f01234567890  
  exports createCamera, buildMVP, project, drawParticles2D, drawAttractors2D
- `lib/emergence/vendor/rfr2/cfr-kernel/rewind.js` (166 lines) — @module cfr/rewind @uuid b2e3f4a5-c6d7-4890-9bcd-ef0123456789  
  exports createTimeline, takeSnapshot, applySnapshot, seekTo, step, goStart +7

#### `lib/emergence/vendor/rfr2/field/`

2 code file(s).

- `lib/emergence/vendor/rfr2/field/ALKModule.js` (63 lines) — // ── Protected helpers ───────────────────────────────────────────────────── // ── Lifecycle ─────────────────────────────────────────────────────────────  
  exports ALKModule · requires 0 · required by 1
- `lib/emergence/vendor/rfr2/field/relational.js` (1018 lines)  
  exports RELATIONAL_VERSION, RELATIONAL_UUID, REL_TRAJECTORY, RUPTURE_TYPE, REPAIR_TYPE, MeaningTracker +5 · requires 1 · required by 0 · emits alk.rel.bid.detected, alk.rel.bid.response, alk.rel.decay.detected, alk.rel.decay.threshold +10

#### `lib/emergence/vendor/rfr2/lattice/`

1 code file(s).

- `lib/emergence/vendor/rfr2/lattice/lattice.js` (233 lines) — @spatial/lattice — lattice.js Associative memory. Resonance-weighted graph.  
  exports LATTICE_VERSION, DEFAULT_THRESHOLD, LatticeGraph, LatticeEngine · emits spatial.lattice.cluster.updated, spatial.lattice.edge.connected, spatial.lattice.graph.ready, spatial.lattice.node.added · hears spatial.kernel.landscape.updated, spatial.resonance.scored

#### `lib/emergence/vendor/rfr2/ledger/`

1 code file(s).

- `lib/emergence/vendor/rfr2/ledger/index.js` (609 lines)  
  exports VERSION, IDEA_STATUS, UPGRADE_TYPE, LedgerError, createUpgradeLedger, createIdeaLedger +3 · emits idea:closed, idea:promoted, idea:recorded, upgrade:committed

#### `lib/emergence/vendor/rfr2/liminal/`

11 code file(s).

- `lib/emergence/vendor/rfr2/liminal/assumption.js` (198 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ ASSUMPTION MODULE · modules/assumption/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, AssumptionModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/bus.js` (234 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ LIMINAL BUS · bus/index.js · v1.0.0 ║  
  exports BUS_VERSION, BUS_UUID, LIM, MODULE, LiminalBus, createBus · requires 0 · required by 9
- `lib/emergence/vendor/rfr2/liminal/contrastive.js` (95 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ CONTRASTIVE MODULE · modules/contrastive/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, ContrastiveModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/core.js` (353 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ LIMINAL CORE · core/index.js · v1.0.0 ║  
  exports GAP_TYPE, GAP_TYPE_CRITICALITY, GAP_REASON, GAP_REASON_DESCRIPTION, DOMAIN, FIELD_GAP_SUBTYPE +10 · requires 0 · required by 9
- `lib/emergence/vendor/rfr2/liminal/existential.js` (165 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ EXISTENTIAL MODULE · modules/existential/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, ExistentialModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/negative-space.js` (195 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ NEGATIVE SPACE MODULE · modules/negative-space/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, NegativeSpaceModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/oscillatory.js` (226 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ OSCILLATORY MODULE · modules/oscillatory/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, OscillatoryModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/relational-gaps.js` (245 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ RELATIONAL MODULE · modules/relational/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, RelationalModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/reversal.js` (114 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ REVERSAL MODULE · modules/reversal/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, ReversalModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/shadow.js` (185 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ SHADOW FIELD MODULE · modules/shadow/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, ShadowFieldModule · requires 2 · required by 0
- `lib/emergence/vendor/rfr2/liminal/structural.js` (96 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ STRUCTURAL MODULE · modules/structural/index.js · v1.0.0 ║  
  exports MODULE_ID, MODULE_VERSION, MODULE_UUID, StructuralAssumptionModule · requires 2 · required by 0

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

#### `lib/hooks/`

11 code file(s).

- `lib/hooks/architect.hooks.js` (13 lines) — hooks/architect.hooks.js — Architect System Hook Map System: Architect port 3747  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/copilot.hooks.js` (709 lines) — hooks/copilot.hooks.js — Copilot System Hook Map System: Copilot port 3750  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/cortex.hooks.js` (437 lines) — hooks/cortex.hooks.js — Cortex System Hook Map Status: pre-release  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/emerge.hooks.js` (411 lines) — hooks/emerge.hooks.js — Emerge System Hook Map System: Emerge port 4242  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/guardian.hooks.js` (833 lines) — hooks/guardian.hooks.js — Guardian System Hook Map Status: pre-release  
  exports systemId, port, version, updatedAt, hooks, byName +3 · requires 0 · required by 1 · emits guardian.dom_map.received
- `lib/hooks/idearium.hooks.js` (14 lines) — hooks/idearium.hooks.js — Idearium System Hook Map System: Idearium port 4800  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/index.js` (234 lines) — hooks/index.js — NEXUS Hooks Living Registry Status: pre-release  
  exports SYSTEMS, allHooks, bySystem, byType, byId, byName +10 · requires 9 · required by 3
- `lib/hooks/intelligence.hooks.js` (336 lines) — hooks/intelligence.hooks.js — Intelligence System Hook Map Status: living  
  exports systemId, port, version, updatedAt, hooks, byId +4
- `lib/hooks/ollama.hooks.js` (387 lines) — hooks/ollama.hooks.js — Ollama System Hook Map System: Ollama port 3749  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/orchestrator.hooks.js` (84 lines) — hooks/orchestrator.hooks.js — Orchestrator System Hook Map System: Orchestrator port 9000 — the root surface  
  exports systemId, port, version, updatedAt, hooks, byId +4 · requires 0 · required by 1
- `lib/hooks/side-effect-parser.js` (121 lines)  
  exports parseSideEffect, structuredSideEffects · requires 0 · required by 1 · tested by `tests/hooks-side-effect-parser.test.js`

#### `lib/ledger-fanin/`

2 code file(s).

- `lib/ledger-fanin/boot.js` (94 lines) — wire the nervous system live (§P1 nexus-live-mind) James: "every system and the intelligence system needs to read the SSE and  
  exports wireFanin · requires 2 · required by 1
- `lib/ledger-fanin/index.js` (120 lines) — the unified event fan-in (agnostic lib tool) James: "every system and the intelligence system needs to read the SSE and  
  exports emit, subscribe, bridgeLedger, coverage, recent, RING_SIZE +3 · requires 0 · required by 15

#### `lib/meta/`

4 code file(s).

- `lib/meta/adversary-suite.js` (259 lines) — // ── lib/adversary-suite.js ──────────────────────────────────────────────────── // UUID: nexus-adversary-suite-v1-0000-4000-0000-000000000001  
  exports runAdversarySuite, runQAQC, _attackSyntax, _attackLogic, _attackEdgeCase, _attackState +5 · requires 0 · required by 2 · tested by `tests/modules/adversary-suite.test.js`
- `lib/meta/confidence.js` (69 lines) — Weakest-Link Confidence Aggregator Replaces arithmetic-mean confidence aggregation (drift/avgConf/avgConfidence)  
  exports weakestLink, bottleneck, effective, hasEvidence, rawScore, EVIDENCE_LESS_DISCOUNT · requires 0 · required by 1
- `lib/meta/crystal-lattice.js` (263 lines) — // ── lib/crystal-lattice.js ──────────────────────────────────────────────────── // UUID: nexus-crystal-lattice-v1-0000-4000-0000-000000000001  
  exports init, stop, updateOnExecution, validateWiring, _maybeCrystallize, _updateLattice +9 · requires 1 · required by 3 · tested by `tests/modules/crystal-lattice.test.js`
- `lib/meta/index.js` (46 lines) — meta/index.js — NEXUS Meta Layer v2.0.0 Sovereign intelligence modules. Every module here is domain-agnostic —  
  requires 13 · required by 0 · tested by `tests/modules/test-intelligence-core-wired.js`

#### `lib/nerve/`

1 code file(s).

- `lib/nerve/index.js` (308 lines) — NEXUS Nerve System (Phase 1: read layer) Spec: docs/nexus-nerve.spec v0.2.0  
  exports getSnapshot, onChange, setRadius, setAttentionCenter, _pollDomOnce · requires 2 · required by 0

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

#### `lib/nexus/`

6 code file(s).

- `lib/nexus/autopilot.js` (2000 lines) — // ── autopilot.js — NEXUS Process Supervisor ───────────────────────────────── // UUID: nexus-autopilot-v1-0000-4000-0000-000000000001  
  exports start, _idleReport, _statusSnapshot, KERNELS, requestSpawn, controlKernel +18 · requires 15 · required by 0 · tested by `tests/modules/test-alk-lattice-live.js`, `tests/modules/test-autopilot-boot-gates.js` +6
- `lib/nexus/nexus-bus.js` (204 lines) — Unified Event Multiplex Status: pre-release  
  requires 0 · required by 14 · hears architect.snr.flagged · tested by `tests/modules/expectation-watcher.test.js`, `tests/modules/raid-retry-escalation.test.js` +1
- `lib/nexus/nexus-cfr-influence.js` (249 lines) — CFR Field → System Behavior Influence Status: pre-release  
  exports init, stop, influence, getState, getSigmaFloor, isThrottled +1 · requires 0 · required by 1 · emits cfr.influence.applied, cfr.influence.diagnostic_requested, cfr.influence.guardian_throttled, cfr.influence.guardian_unthrottled +4
- `lib/nexus/nexus-connect.js` (399 lines) — Universal cross-system connection layer Status: pre-release  
  exports _req, postEvent, postLedger, postStream, postTableInsert, healthCheck +9 · requires 3 · required by 2 · tested by `tests/modules/test-boot-log-fixes.js`
- `lib/nexus/nexus-knowledge.js` (206 lines) — Knowledge Memory Layer Status: pre-release  
  exports learn, recall, recallAbout, verify, deprecate, stats +1
- `lib/nexus/nexus-query.js` (240 lines) — Unified Query Layer Status: pre-release  
  exports query, write, ping, clearCache, PORTS, _post

#### `lib/nexus-self/`

5 code file(s).

- `lib/nexus-self/apply.js` (178 lines) — the apply gate: the ONLY path from the immutable Nexus repo back into the live tree.  
  exports MODULE_ID, plan, apply, rollback, listApplies · requires 3 · required by 2 · tested by `tests/modules/test-nexus-inject-approval.test.js`, `tests/modules/test-nexus-self-and-cos-run.test.js`
- `lib/nexus-self/branch.js` (183 lines) — editing Nexus from inside Nexus: COS branches of one system's slice of the immutable base.  
  exports create, get, list, readFile, writeFile, deleteFile +6 · requires 4 · required by 1 · tested by `tests/modules/test-nexus-self-and-cos-run.test.js`
- `lib/nexus-self/inject-gate.js` (147 lines) — an agent's code on a Nexus repo, through the apply gate on approval. §0.39.266 — James: "really close to being able to use idearium to build nexus from  
  exports MODULE_ID, TARGET, isNexus, current, target, preview +3 · requires 3 · required by 2
- `lib/nexus-self/store.js` (213 lines) — the immutable base: content-addressed blobs and append-only snapshots of the live Nexus tree.  
  exports MODULE_ID, VERSION, storeRoot, sha256, blobPath, putBlob +8 · requires 2 · required by 7 · tested by `tests/modules/test-nexus-atlas-and-glass.test.js`, `tests/modules/test-nexus-inject-approval.test.js` +1
- `lib/nexus-self/systems.js` (102 lines) — which files of the live tree belong to which system. §0.39.261 — James: "i want a nexus repo in idearium, that immutable with nested  
  exports ROOT, SYSTEMS, ownerOf, get, names, skipped +4 · requires 0 · required by 15 · tested by `tests/modules/test-architecture-migrate.test.js`, `tests/modules/test-component-store.test.js` +3

#### `lib/node-schemas/`

68 other file(s).

- other: 68 files (.account_identity_index_entry, .agent, .agent_model, .agent_tool, .artifact, .bep_pattern, .capability, .chat_log)

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

#### `lib/phases/`

1 other file(s).

- other: `lib/phases/INDEX.md`

#### `lib/phases/2026-08-22-session-full/`

7 other file(s).

- other: `lib/phases/2026-08-22-session-full/SF10_agent_notes.phase`, `lib/phases/2026-08-22-session-full/SF12_end_state_vision_and_full_phase_map_docs.phase`, `lib/phases/2026-08-22-session-full/SF13_orchestrator_agent_pipeline.phase`, `lib/phases/2026-08-22-session-full/SF16_event_types_real_registry.phase`, `lib/phases/2026-08-22-session-full/SF17_intelligence_system_all_4_phases.phase`, `lib/phases/2026-08-22-session-full/SF5_wiring_gap_bridge.phase`, `lib/phases/2026-08-22-session-full/SF7_axiom_8_7.phase`

#### `lib/phases/2026-08-22-session-full/graph/`

7 other file(s).

- other: `lib/phases/2026-08-22-session-full/graph/SF10_agent_notes-2d100608bc826abf.graph`, `lib/phases/2026-08-22-session-full/graph/SF12_end_state_vision_and_full_phase_map_docs-e20580490f498608.graph`, `lib/phases/2026-08-22-session-full/graph/SF13_orchestrator_agent_pipeline-de5ad9a019286d15.graph`, `lib/phases/2026-08-22-session-full/graph/SF16_event_types_real_registry-71639da711eaaf6d.graph`, `lib/phases/2026-08-22-session-full/graph/SF17_intelligence_system_all_4_phases-976595e9e4d230bc.graph`, `lib/phases/2026-08-22-session-full/graph/SF5_wiring_gap_bridge-6f1b4c7974ce3a8c.graph`, `lib/phases/2026-08-22-session-full/graph/SF7_axiom_8_7-0396343d7665f754.graph`

#### `lib/phases/2026-08-22-session-full/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-08-22-session-full/graph/_superseded/SF12_end_state_vision_and_full_phase_map_docs-1d20559f29b851d2.graph`, `lib/phases/2026-08-22-session-full/graph/_superseded/SF17_intelligence_system_all_4_phases-4c31159075863608.graph`, `lib/phases/2026-08-22-session-full/graph/_superseded/SF17_intelligence_system_all_4_phases-8f00a4235b63cc7b.graph`, `lib/phases/2026-08-22-session-full/graph/_superseded/SF5_wiring_gap_bridge-91251df2a9f05ad8.graph`, `lib/phases/2026-08-22-session-full/graph/_superseded/SF7_axiom_8_7-c236c56937c33593.graph`

#### `lib/phases/2026-08-23-backlog/`

8 other file(s).

- other: `lib/phases/2026-08-23-backlog/BL11_orchestrator_folder_consolidation.phase`, `lib/phases/2026-08-23-backlog/BL12_nexus_heal_loop_to_diagnostic.phase`, `lib/phases/2026-08-23-backlog/BL15_agent_tools_tree_restructure.phase`, `lib/phases/2026-08-23-backlog/BL24_userscript_suite_enterprise_grade.phase`, `lib/phases/2026-08-23-backlog/BL25_nexus_options_config.phase`, `lib/phases/2026-08-23-backlog/BL27_agent_suite_consolidation.phase`, `lib/phases/2026-08-23-backlog/BL4_port_element_picker_ux.phase`, `lib/phases/2026-08-23-backlog/BL7_emerge_files_to_emerge_folder.phase`

#### `lib/phases/2026-08-23-backlog/graph/`

8 other file(s).

- other: `lib/phases/2026-08-23-backlog/graph/BL11_orchestrator_folder_consolidation-364ff8619db01d40.graph`, `lib/phases/2026-08-23-backlog/graph/BL12_nexus_heal_loop_to_diagnostic-4f389d7509036062.graph`, `lib/phases/2026-08-23-backlog/graph/BL15_agent_tools_tree_restructure-8c572d92803d3fae.graph`, `lib/phases/2026-08-23-backlog/graph/BL24_userscript_suite_enterprise_grade-edba621e935840c5.graph`, `lib/phases/2026-08-23-backlog/graph/BL25_nexus_options_config-abb545081f8c4e3e.graph`, `lib/phases/2026-08-23-backlog/graph/BL27_agent_suite_consolidation-c84f5385b444bac3.graph`, `lib/phases/2026-08-23-backlog/graph/BL4_port_element_picker_ux-8f7a989bfea93b3a.graph`, `lib/phases/2026-08-23-backlog/graph/BL7_emerge_files_to_emerge_folder-ff2046ba236342e9.graph`

#### `lib/phases/2026-08-23-backlog/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-08-23-backlog/graph/_superseded/BL11_orchestrator_folder_consolidation-d04b773d3d681ed0.graph`, `lib/phases/2026-08-23-backlog/graph/_superseded/BL11_orchestrator_folder_consolidation-e8629d7afc8fe155.graph`, `lib/phases/2026-08-23-backlog/graph/_superseded/BL12_nexus_heal_loop_to_diagnostic-aedd1b0928da63f4.graph`, `lib/phases/2026-08-23-backlog/graph/_superseded/BL27_agent_suite_consolidation-5312857a8c56f41a.graph`, `lib/phases/2026-08-23-backlog/graph/_superseded/BL7_emerge_files_to_emerge_folder-3ab7a1f57237920a.graph`

#### `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/`

7 other file(s).

- other: `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR2_ollama_output_folder_listener.phase`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR3_account_registry_userscript_hook.phase`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR5_build_contract_per_agent_per_intent.phase`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/BR7_guardian_dispatch_connectivity_sweep.phase`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/ET2_guardian_event_taxonomy.phase`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/ET6_sigma_gates_on_taxonomy.phase`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/SS3_unified_living_model_system_plus_person.phase`

#### `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/`

7 other file(s).

- other: `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR2_ollama_output_folder_listener-c5cdd4d86ddb5b74.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR3_account_registry_userscript_hook-8be6d498ddcef7ec.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR5_build_contract_per_agent_per_intent-203690f4358a28c5.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/BR7_guardian_dispatch_connectivity_sweep-e8d5cbb04e0fb190.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET2_guardian_event_taxonomy-499ad40e6e9c3414.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/ET6_sigma_gates_on_taxonomy-161a85ba5515e7c0.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/SS3_unified_living_model_system_plus_person-0bbbc7d8adf65f4e.graph`

#### `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/BR5_build_contract_per_agent_per_intent-36bf07b27fc48bd7.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/ET2_guardian_event_taxonomy-3864f053a89e1c31.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/ET6_sigma_gates_on_taxonomy-39103ee4912fdf0c.graph`, `lib/phases/2026-08-27-event-taxonomy-and-brainstorm/graph/_superseded/SS3_unified_living_model_system_plus_person-b7991f62394431da.graph`

#### `lib/phases/2026-08-28-definition-of-complete/`

4 other file(s).

- other: `lib/phases/2026-08-28-definition-of-complete/DOD4_build_and_expand_from_loom.phase`, `lib/phases/2026-08-28-definition-of-complete/DOD5_maps_snapshots_backups_living_model.phase`, `lib/phases/2026-08-28-definition-of-complete/DOD6_respects_axioms.phase`, `lib/phases/2026-08-28-definition-of-complete/DOD8_contract_conditions_comparison_and_drift_engines.phase`

#### `lib/phases/2026-08-28-definition-of-complete/graph/`

4 other file(s).

- other: `lib/phases/2026-08-28-definition-of-complete/graph/DOD4_build_and_expand_from_loom-8ee63f9d1b09068e.graph`, `lib/phases/2026-08-28-definition-of-complete/graph/DOD5_maps_snapshots_backups_living_model-3908fcdebd5c6049.graph`, `lib/phases/2026-08-28-definition-of-complete/graph/DOD6_respects_axioms-0f8fab7681fae1d5.graph`, `lib/phases/2026-08-28-definition-of-complete/graph/DOD8_contract_conditions_comparison_and_drift_engines-8442dc035da43cb9.graph`

#### `lib/phases/2026-08-28-definition-of-complete/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-08-28-definition-of-complete/graph/_superseded/DOD8_contract_conditions_comparison_and_drift_engines-1d10a9ee9575d398.graph`

#### `lib/phases/2026-08-28-self-building-pipeline/`

6 other file(s).

- other: `lib/phases/2026-08-28-self-building-pipeline/SBP10_per_hat_model_assignment.phase`, `lib/phases/2026-08-28-self-building-pipeline/SBP11_agent_tools_registry_awareness.phase`, `lib/phases/2026-08-28-self-building-pipeline/SBP12_listener_and_userscript_suite_view.phase`, `lib/phases/2026-08-28-self-building-pipeline/SBP6_system_schema_inventory.phase`, `lib/phases/2026-08-28-self-building-pipeline/SBP8_agent_mesh_consolidation.phase`, `lib/phases/2026-08-28-self-building-pipeline/SBP9_hat_forge_real_hats.phase`

#### `lib/phases/2026-08-28-self-building-pipeline/graph/`

6 other file(s).

- other: `lib/phases/2026-08-28-self-building-pipeline/graph/SBP10_per_hat_model_assignment-0ae60e1c88ce959c.graph`, `lib/phases/2026-08-28-self-building-pipeline/graph/SBP11_agent_tools_registry_awareness-10a463896c66d6e4.graph`, `lib/phases/2026-08-28-self-building-pipeline/graph/SBP12_listener_and_userscript_suite_view-e127094c108d2890.graph`, `lib/phases/2026-08-28-self-building-pipeline/graph/SBP6_system_schema_inventory-01abcd223ab08b29.graph`, `lib/phases/2026-08-28-self-building-pipeline/graph/SBP8_agent_mesh_consolidation-5a5600d90602c11e.graph`, `lib/phases/2026-08-28-self-building-pipeline/graph/SBP9_hat_forge_real_hats-7d6322a91f58a6d6.graph`

#### `lib/phases/2026-08-28-self-building-pipeline/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-08-28-self-building-pipeline/graph/_superseded/SBP10_per_hat_model_assignment-7abdac008edcde3d.graph`, `lib/phases/2026-08-28-self-building-pipeline/graph/_superseded/SBP12_listener_and_userscript_suite_view-dc9e3b5d6c5777b3.graph`

#### `lib/phases/2026-08-30-interaction-contract-context/`

4 other file(s).

- other: `lib/phases/2026-08-30-interaction-contract-context/IC12_universal_gap_and_symmetry_detection.phase`, `lib/phases/2026-08-30-interaction-contract-context/IC13_agent_mesh_chat_index.phase`, `lib/phases/2026-08-30-interaction-contract-context/IC5_full_input_queue_output_qc_lifecycle.phase`, `lib/phases/2026-08-30-interaction-contract-context/IC7_drift_and_comparison_tracking_in_the_pipeline.phase`

#### `lib/phases/2026-08-30-interaction-contract-context/graph/`

4 other file(s).

- other: `lib/phases/2026-08-30-interaction-contract-context/graph/IC12_universal_gap_and_symmetry_detection-2fca827924b655af.graph`, `lib/phases/2026-08-30-interaction-contract-context/graph/IC13_agent_mesh_chat_index-acae83a88cfed8cd.graph`, `lib/phases/2026-08-30-interaction-contract-context/graph/IC5_full_input_queue_output_qc_lifecycle-5cf93f4f44f1c70a.graph`, `lib/phases/2026-08-30-interaction-contract-context/graph/IC7_drift_and_comparison_tracking_in_the_pipeline-57b2a934eab904b3.graph`

#### `lib/phases/2026-08-30-interaction-contract-context/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-08-30-interaction-contract-context/graph/_superseded/IC10_diagnostic_own_real_system_structure-37d61971e616a68c.graph`, `lib/phases/2026-08-30-interaction-contract-context/graph/_superseded/IC12_universal_gap_and_symmetry_detection-4c68e3f3c0900e7c.graph`

#### `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/`

6 other file(s).

- other: `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM10_per_agent_wake_words.phase`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM14_components_store.phase`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM1_spec_as_living_model.phase`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM23_atlas_history_versions_calendar.phase`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM25_atlas_living_update.phase`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/LM6_who_creates_contracts.phase`

#### `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/`

6 other file(s).

- other: `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM10_per_agent_wake_words-181848264f44d530.graph`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM14_components_store-c5ab3492fddbea5d.graph`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM1_spec_as_living_model-0fafcb56a76e6808.graph`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM23_atlas_history_versions_calendar-51177b6a7496001c.graph`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM25_atlas_living_update-fffff5497b586859.graph`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM6_who_creates_contracts-4c382b6ef9cc6c0a.graph`

#### `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/LM23_atlas_history_versions_calendar-cc8f2ab0d0593e31.graph`, `lib/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/LM6_who_creates_contracts-916424c3f4eeec02.graph`

#### `lib/phases/2026-09-02-agent-mesh-full-map/`

5 other file(s).

- other: `lib/phases/2026-09-02-agent-mesh-full-map/AM1_raid_intent_contracts_per_agent.phase`, `lib/phases/2026-09-02-agent-mesh-full-map/AM2_first_principles_hat_or_modifier.phase`, `lib/phases/2026-09-02-agent-mesh-full-map/AM3_agent_mesh_folder_consolidation.phase`, `lib/phases/2026-09-02-agent-mesh-full-map/AM5_tool_forge_real_usage_audit.phase`, `lib/phases/2026-09-02-agent-mesh-full-map/AM6_raid_contract_gate_before_dispatch.phase`

#### `lib/phases/2026-09-02-agent-mesh-full-map/graph/`

5 other file(s).

- other: `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM1_raid_intent_contracts_per_agent-58012a91f8485525.graph`, `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM2_first_principles_hat_or_modifier-0e345d95c9a3188b.graph`, `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM3_agent_mesh_folder_consolidation-5ed8f87ae9176e2e.graph`, `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM5_tool_forge_real_usage_audit-28fa7d9090fb0f06.graph`, `lib/phases/2026-09-02-agent-mesh-full-map/graph/AM6_raid_contract_gate_before_dispatch-4f49e55ffddea8ab.graph`

#### `lib/phases/2026-09-02-agent-mesh-full-map/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-09-02-agent-mesh-full-map/graph/_superseded/AM1_raid_intent_contracts_per_agent-e561c466fdbbdbb2.graph`, `lib/phases/2026-09-02-agent-mesh-full-map/graph/_superseded/AM3_agent_mesh_folder_consolidation-6a436c038ec43868.graph`, `lib/phases/2026-09-02-agent-mesh-full-map/graph/_superseded/AM6_raid_contract_gate_before_dispatch-95e22ab925e053e4.graph`

#### `lib/phases/2026-09-02-nexus-vision-master/`

20 other file(s).

- other: 20 files (.phase)

#### `lib/phases/2026-09-02-nexus-vision-master/graph/`

20 other file(s).

- other: 20 files (.graph)

#### `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/`

11 other file(s).

- other: `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/B1_full_build_contract_schema-75201db85d2752cc.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/C2_templates_folder_structure-4b30f66e40536e56.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/CP3_dynamic_model_selection-2bda1b4b75b52bf7.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR10_iterative_prompt_optimization_loop-cb5c36dca66dacba.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR11_spec_project_import_to_compartment-3ba40fae475bab7c.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR12_system_parse_query_surface-8c16a48512a80c7c.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR13_copilot_chat_ui-86f6ac2d0b97306a.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR3_artifact_extraction_introspect_bridge-4f813123ae64e4bd.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR7_token_reduction_toolkit-3530c94e6e6673f7.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/SR9_autonomous_self_build_end_state-5e2b9a8991cf1a0d.graph`, `lib/phases/2026-09-02-nexus-vision-master/graph/_superseded/T2_event_taxonomy_per_system-d01cf8ce65fbb403.graph`

#### `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/`

2 other file(s).

- other: `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/VS2_ring_buffer_and_causal_field.phase`, `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/VS3_agent_chat_log_query.phase`

#### `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/`

2 other file(s).

- other: `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/VS2_ring_buffer_and_causal_field-6074082303329969.graph`, `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/VS3_agent_chat_log_query-c1653dec5e1a00a7.graph`

#### `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-09-02-versionium-sovereign-and-cleanup/graph/_superseded/VS2_ring_buffer_and_causal_field-a136f794f2a44987.graph`

#### `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/`

9 other file(s).

- other: `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/BR1_brainos_cross_system_relay.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/BR2_brainos_controls_agents.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DA1_fix_stale_guardian_coverage_gate.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DBG1_consolidate_debug_surfaces.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/EVT1_commands_and_tools_emit_events.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/RP1_repository_per_system.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/SPEC1_rewrite_nexus_spec.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/TC1_tools_get_real_contracts.phase`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/UX1_design_philosophy_consolidation.phase`

#### `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/`

9 other file(s).

- other: `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/BR1_brainos_cross_system_relay-6ed826ba86e978f7.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/BR2_brainos_controls_agents-5bb6eb8127717696.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DA1_fix_stale_guardian_coverage_gate-f96bc8899f2f2334.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DBG1_consolidate_debug_surfaces-0e0abf65d62c7922.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/EVT1_commands_and_tools_emit_events-cd104364a7ca3847.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/RP1_repository_per_system-0876df6e88fbf957.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/SPEC1_rewrite_nexus_spec-2c02e2985c175656.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/TC1_tools_get_real_contracts-e88ee91b4fa0d7c3.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/UX1_design_philosophy_consolidation-8518048c60a27800.graph`

#### `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/BR1_brainos_cross_system_relay-74f187aeb527e717.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/BR2_brainos_controls_agents-eee077467b2c6ac8.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/DBG1_consolidate_debug_surfaces-251300f01adf0239.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/RP1_repository_per_system-95bead78e697c269.graph`, `lib/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/SPEC1_rewrite_nexus_spec-8486df46c0ff1a3d.graph`

#### `lib/phases/2026-09-11-compartment-nodetype-and-reorg/`

9 other file(s).

- other: `lib/phases/2026-09-11-compartment-nodetype-and-reorg/AR1_architect_retirement_and_hooks_to_loom.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/AR2_decentralize_interaction_contracts.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/C1_cli_per_system_split.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/D1_diagnostic_real_folder.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/N1_root_md_consolidation.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/N2_root_nexus_js_to_nexus_folder.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/N3_stray_root_files_found_after_N1.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/T1_extend_system_scaffold.phase`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/X1_node_decomposition_tool.phase`

#### `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/`

9 other file(s).

- other: `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/AR1_architect_retirement_and_hooks_to_loom-9a084bd8c287d669.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/AR2_decentralize_interaction_contracts-1773c8ec1efb8050.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/C1_cli_per_system_split-674c8a2cfdc9ad11.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/D1_diagnostic_real_folder-39d87d45700d1662.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/N1_root_md_consolidation-69d569f13dfba3b8.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/N2_root_nexus_js_to_nexus_folder-e64dfede833b74b8.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/N3_stray_root_files_found_after_N1-9a3dab2da2e229cd.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/T1_extend_system_scaffold-172691a797c9e8b0.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/X1_node_decomposition_tool-0613a4e542b07cd1.graph`

#### `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/`

12 other file(s).

- other: `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/AR1_architect_retirement_and_hooks_to_loom-c44714dfce980acf.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/AR1_architect_retirement_and_hooks_to_loom-ec476c801239c1a2.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/AR2_decentralize_interaction_contracts-004da81f2aa79f85.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/C1_cli_per_system_split-7b2166b145a6e248.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/D1_diagnostic_real_folder-326872f5777c2e88.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/D1_diagnostic_real_folder-475c655800cebc65.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/N1_root_md_consolidation-d7ece054f8e1b547.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/N2_root_nexus_js_to_nexus_folder-6088de94a4c19d4b.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/N3_stray_root_files_found_after_N1-46553cc0a1125676.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/T1_extend_system_scaffold-c85e7dedf727b889.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/X1_node_decomposition_tool-6dc260de77610029.graph`, `lib/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/X1_node_decomposition_tool-6f5db2348ba53165.graph`

#### `lib/phases/2026-09-11-sovereign-node-architecture/`

11 other file(s).

- other: `lib/phases/2026-09-11-sovereign-node-architecture/P12_compartment_per_contract.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P19_dynamic_nodes_via_causal_graph.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P1_fix_the_declared_living_maps.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P22_ledger_data_integrity_checker.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P25_universal_per_system_queue.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P30_provider_ping_delta.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P33_every_system_runs_its_node_registry.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P36_an_event_ledger_per_registry.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P38_every_graph_has_its_route_command_and_node.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P3_per_system_node_schemas.phase`, `lib/phases/2026-09-11-sovereign-node-architecture/P4_full_node_type_coverage_per_system.phase`

#### `lib/phases/2026-09-11-sovereign-node-architecture/graph/`

11 other file(s).

- other: `lib/phases/2026-09-11-sovereign-node-architecture/graph/P12_compartment_per_contract-626f7a98d64c702b.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P19_dynamic_nodes_via_causal_graph-14175a5931199ebc.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P1_fix_the_declared_living_maps-6e2243bd608aa76f.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P22_ledger_data_integrity_checker-80f256cd544672ab.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P25_universal_per_system_queue-25f546a0afcd48d4.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P30_provider_ping_delta-81b879ff6f24b8b2.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P33_every_system_runs_its_node_registry-e35fe116fff586c0.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P36_an_event_ledger_per_registry-b044fa62a99368e1.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P38_every_graph_has_its_route_command_and_node-ba638bb548c28c0d.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P3_per_system_node_schemas-71d0409c318c73a0.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/P4_full_node_type_coverage_per_system-7d7cc69568624b23.graph`

#### `lib/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/P12_compartment_per_contract-8cfd3609296f0e65.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/P25_universal_per_system_queue-624624c871ccb0f6.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/P33_every_system_runs_its_node_registry-7955afec14f5b4a5.graph`, `lib/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/P36_an_event_ledger_per_registry-fbd0abb2a175f847.graph`

#### `lib/phases/2026-09-13-track-b-sovereignty/`

1 other file(s).

- other: `lib/phases/2026-09-13-track-b-sovereignty/MCO16_component_projections_retracted.phase`

#### `lib/phases/2026-09-13-track-b-sovereignty/graph/`

1 other file(s).

- other: `lib/phases/2026-09-13-track-b-sovereignty/graph/MCO16_component_projections_retracted-5979ee368ba8e2b9.graph`

#### `lib/phases/2026-09-13-track-b-sovereignty/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-09-13-track-b-sovereignty/graph/_superseded/MCO16_component_projections_retracted-4e9c11ff0b4b91af.graph`

#### `lib/phases/2026-09-19-architect-blueprint-forge-idearium/`

1 other file(s).

- other: `lib/phases/2026-09-19-architect-blueprint-forge-idearium/P0_place_spec_compiler.phase`

#### `lib/phases/2026-09-19-architect-blueprint-forge-idearium/graph/`

1 other file(s).

- other: `lib/phases/2026-09-19-architect-blueprint-forge-idearium/graph/P0_place_spec_compiler-816ab40bc00d49c5.graph`

#### `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/`

3 other file(s).

- other: `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B5_port_3753_collision.phase`, `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/D5_new.phase`, `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P0_map.phase`

#### `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/`

3 other file(s).

- other: `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B5_port_3753_collision-9440f35a365841f9.graph`, `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/D5_new-0f7172d2ea3b1ab4.graph`, `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P0_map-270831fdfdc19271.graph`

#### `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/B5_port_3753_collision-3d6b1fadb758d77c.graph`, `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/D5_new-6de18476e3420697.graph`, `lib/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/D5_new-8a8997642f5cb4af.graph`

#### `lib/phases/2026-09-22-brainos-agent-suite/`

3 other file(s).

- other: `lib/phases/2026-09-22-brainos-agent-suite/HT1_hat_manager.phase`, `lib/phases/2026-09-22-brainos-agent-suite/RD1_reader.phase`, `lib/phases/2026-09-22-brainos-agent-suite/TL1_tool_browser.phase`

#### `lib/phases/2026-09-22-brainos-agent-suite/graph/`

3 other file(s).

- other: `lib/phases/2026-09-22-brainos-agent-suite/graph/HT1_hat_manager-c65f629e4c701947.graph`, `lib/phases/2026-09-22-brainos-agent-suite/graph/RD1_reader-ffe56609c225d915.graph`, `lib/phases/2026-09-22-brainos-agent-suite/graph/TL1_tool_browser-c1e834b49a05b3a2.graph`

#### `lib/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/`

1 other file(s).

- other: `lib/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/TR2_tab_lifecycle_and_visibility.phase`

#### `lib/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/`

1 other file(s).

- other: `lib/phases/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion/graph/TR2_tab_lifecycle_and_visibility-f48c6d68235b7c84.graph`

#### `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/`

6 other file(s).

- other: `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/A1.phase`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/A2.phase`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/E1.phase`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/R1.phase`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T3.phase`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T7.phase`

#### `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/`

6 other file(s).

- other: `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/A1-369bde5ee0a043bb.graph`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/A2-fc6a51b24eaf102b.graph`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/E1-7c9c1dffb11a0d43.graph`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/R1-1928955532fcc1fd.graph`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T3-255b5681dc7d3f96.graph`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T7-0870291c8f83c928.graph`

#### `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/_superseded/E1-8b75f1c7cf514a23.graph`, `lib/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/_superseded/R1-2fc594cd0c71aec9.graph`

#### `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/`

2 other file(s).

- other: `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/N1.phase`, `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/X1.phase`

#### `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/`

2 other file(s).

- other: `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/N1-afc3f2d2b1971c2a.graph`, `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/X1-62bcf3ac6ca32360.graph`

#### `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/_superseded/X1-7a889bbcd135db9f.graph`

#### `lib/phases/2026-09-27-agent-hat-memory-download-manager/`

9 other file(s).

- other: `lib/phases/2026-09-27-agent-hat-memory-download-manager/G1.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/G2.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/G4.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/H2.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/H4.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/M1.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/M4.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/O3.phase`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/X1.phase`

#### `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/`

9 other file(s).

- other: `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/G1-a03b49e7e8269c3f.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/G2-ae911f4c7c242c54.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/G4-45ac7ff9b3f272be.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/H2-614a688e1eeeef44.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/H4-9720e24e00240653.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/M1-6f7e0c6335c28637.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/M4-665ecb7fca2292ef.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/O3-734b2b4c1f4f338f.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/X1-3523be12dc3e544d.graph`

#### `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/H4-3e25fcd3222e73f8.graph`, `lib/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/O3-5cacc4d6647c995e.graph`

#### `lib/phases/2026-09-27-components-store-and-atlases/`

5 other file(s).

- other: `lib/phases/2026-09-27-components-store-and-atlases/A1.phase`, `lib/phases/2026-09-27-components-store-and-atlases/A2.phase`, `lib/phases/2026-09-27-components-store-and-atlases/C1.phase`, `lib/phases/2026-09-27-components-store-and-atlases/C3.phase`, `lib/phases/2026-09-27-components-store-and-atlases/C4.phase`

#### `lib/phases/2026-09-27-components-store-and-atlases/graph/`

5 other file(s).

- other: `lib/phases/2026-09-27-components-store-and-atlases/graph/A1-362ff4dd0f06f283.graph`, `lib/phases/2026-09-27-components-store-and-atlases/graph/A2-c42260b792aebce5.graph`, `lib/phases/2026-09-27-components-store-and-atlases/graph/C1-c901b0518083f11c.graph`, `lib/phases/2026-09-27-components-store-and-atlases/graph/C3-a0d922e85bf664d2.graph`, `lib/phases/2026-09-27-components-store-and-atlases/graph/C4-f4160414eefade2b.graph`

#### `lib/phases/2026-09-27-components-store-and-atlases/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-09-27-components-store-and-atlases/graph/_superseded/C3-6f53d9aa14fc9e97.graph`, `lib/phases/2026-09-27-components-store-and-atlases/graph/_superseded/C3-9bc63567919d15c7.graph`, `lib/phases/2026-09-27-components-store-and-atlases/graph/_superseded/C4-1e1f2af6d71358cb.graph`

#### `lib/phases/2026-09-27-idearium-atlas/`

1 other file(s).

- other: `lib/phases/2026-09-27-idearium-atlas/A2.phase`

#### `lib/phases/2026-09-27-idearium-atlas/graph/`

1 other file(s).

- other: `lib/phases/2026-09-27-idearium-atlas/graph/A2-f56a8ed10fd0ab19.graph`

#### `lib/phases/2026-09-27-idearium-atlas/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-09-27-idearium-atlas/graph/_superseded/A2-2ca200087c34a761.graph`

#### `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/`

7 other file(s).

- other: `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/T1_suite_process.phase`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/T2_all_tests.phase`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/T3_debug_report.phase`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X1_system_nodes.phase`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X4_command_index_spec.phase`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/X5_core_scripts.phase`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/Z1_release.phase`

#### `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/`

7 other file(s).

- other: `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/T1_suite_process-f9f50c78f096c750.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/T2_all_tests-f20e3b22238a10f1.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/T3_debug_report-073d1fb7cf9cd997.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X1_system_nodes-f786be098cfe5731.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X4_command_index_spec-f0c28b0337bbaf38.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/X5_core_scripts-071bcce96653212c.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/Z1_release-ca9b97949ee9f241.graph`

#### `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/T3_debug_report-7765b07df0393f7b.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/X1_system_nodes-46e5cb034f4618e8.graph`, `lib/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/Z1_release-8e268e22b5c92e0c.graph`

#### `lib/phases/2026-09-28-graph-build-context-settings-memory/`

9 other file(s).

- other: `lib/phases/2026-09-28-graph-build-context-settings-memory/A1.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/B1.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/C1.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/C3.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/M0.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/R0.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/SV1.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/SV2.phase`, `lib/phases/2026-09-28-graph-build-context-settings-memory/X1.phase`

#### `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/`

9 other file(s).

- other: `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/A1-1b42fcb0ed4d9adc.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/B1-78425d6a9af5ccae.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/C1-85c7898ec0563a6f.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/C3-d965f28349f6b6fa.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/M0-011c3ee31aecc2e7.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/R0-9bc06ef9e121c4ef.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/SV1-aba511479e53415c.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/SV2-6c356aa84882a69b.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/X1-d33a35f6ecaa22a4.graph`

#### `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/C1-4d3b419ed124ed8e.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/M0-90edb156dad368a7.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/SV2-233056d110ca606c.graph`, `lib/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/X1-960b6d032d829383.graph`

#### `lib/phases/2026-09-28-staging-self-heal/`

4 other file(s).

- other: `lib/phases/2026-09-28-staging-self-heal/A1.phase`, `lib/phases/2026-09-28-staging-self-heal/C0.phase`, `lib/phases/2026-09-28-staging-self-heal/S1.phase`, `lib/phases/2026-09-28-staging-self-heal/X1.phase`

#### `lib/phases/2026-09-28-staging-self-heal/graph/`

4 other file(s).

- other: `lib/phases/2026-09-28-staging-self-heal/graph/A1-678cef6eb0b005d6.graph`, `lib/phases/2026-09-28-staging-self-heal/graph/C0-dbb1ee4a63035637.graph`, `lib/phases/2026-09-28-staging-self-heal/graph/S1-ff2b556d4de9defe.graph`, `lib/phases/2026-09-28-staging-self-heal/graph/X1-c81daac3af25ed62.graph`

#### `lib/phases/2026-09-28-staging-self-heal/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-09-28-staging-self-heal/graph/_superseded/C0-0b7235ad10d93e23.graph`, `lib/phases/2026-09-28-staging-self-heal/graph/_superseded/S1-7fb03e9518bd1d90.graph`, `lib/phases/2026-09-28-staging-self-heal/graph/_superseded/X1-5196f7fe55a3de4b.graph`

#### `lib/phases/2026-09-29-build-surface/`

3 other file(s).

- other: `lib/phases/2026-09-29-build-surface/BS12_release.phase`, `lib/phases/2026-09-29-build-surface/BS19_copilot_atlas_guide.phase`, `lib/phases/2026-09-29-build-surface/BS1_rewind_hit_test.phase`

#### `lib/phases/2026-09-29-build-surface/graph/`

3 other file(s).

- other: `lib/phases/2026-09-29-build-surface/graph/BS12_release-e09a7db6825e7d57.graph`, `lib/phases/2026-09-29-build-surface/graph/BS19_copilot_atlas_guide-8cfe36554eded916.graph`, `lib/phases/2026-09-29-build-surface/graph/BS1_rewind_hit_test-5e91edc2e475c777.graph`

#### `lib/phases/2026-09-29-build-surface/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-09-29-build-surface/graph/_superseded/BS12_release-8f67d5e56dcc7344.graph`, `lib/phases/2026-09-29-build-surface/graph/_superseded/BS1_rewind_hit_test-338736611c96d096.graph`

#### `lib/phases/2026-09-29-nex-node-store/`

26 other file(s).

- other: 26 files (.phase)

#### `lib/phases/2026-09-29-nex-node-store/graph/`

26 other file(s).

- other: 26 files (.graph)

#### `lib/phases/2026-09-29-nex-node-store/graph/_superseded/`

9 other file(s).

- other: `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N13_release-9057f45c32bc5a7a.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N21_no_empty_generation_event_gates-22cd6c8351ac8c9e.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N22_shadow_and_negative_space_reasoning-4843bec3597696fa.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N26_work_surface_and_tv_ui_from_contracts-642ec62479f9e52c.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N27_history_import_from_700_zips-e06097bc3f5fc96c.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N29_full_run_only_failures-3ccc80b708b1184e.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N2_types_and_gates-5e4c8e5f9b3fa871.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N30_archive_import_dropbox_and_copilot_command-8efac21914944c83.graph`, `lib/phases/2026-09-29-nex-node-store/graph/_superseded/N30_archive_import_dropbox_and_copilot_command-dedd8b0e675c778d.graph`

#### `lib/phases/2026-09-29-provider-economy/`

9 other file(s).

- other: `lib/phases/2026-09-29-provider-economy/EC0_policy_model.phase`, `lib/phases/2026-09-29-provider-economy/EC10_eros_workbench.phase`, `lib/phases/2026-09-29-provider-economy/EC11_release.phase`, `lib/phases/2026-09-29-provider-economy/EC1_usage_ledger.phase`, `lib/phases/2026-09-29-provider-economy/EC2_gate.phase`, `lib/phases/2026-09-29-provider-economy/EC3_token_constraints.phase`, `lib/phases/2026-09-29-provider-economy/EC4_learning_router.phase`, `lib/phases/2026-09-29-provider-economy/EC5_staging_by_economy.phase`, `lib/phases/2026-09-29-provider-economy/EC7_router_in_builds.phase`

#### `lib/phases/2026-09-29-provider-economy/graph/`

9 other file(s).

- other: `lib/phases/2026-09-29-provider-economy/graph/EC0_policy_model-f08917980459b73a.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC10_eros_workbench-4d940447a9772128.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC11_release-d13079374817a665.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC1_usage_ledger-3bb692c134237f3f.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC2_gate-5b5011336adda021.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC3_token_constraints-3231820165317198.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC4_learning_router-5ea981995e6aa2aa.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC5_staging_by_economy-a13ffbca0770c51b.graph`, `lib/phases/2026-09-29-provider-economy/graph/EC7_router_in_builds-6b6daff3e395816e.graph`

#### `lib/phases/2026-09-29-provider-economy/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-09-29-provider-economy/graph/_superseded/EC10_eros_workbench-27a839ee0a545a60.graph`, `lib/phases/2026-09-29-provider-economy/graph/_superseded/EC11_release-3ddf9b68b334fa07.graph`, `lib/phases/2026-09-29-provider-economy/graph/_superseded/EC7_router_in_builds-e6f92fef8dfca5e3.graph`

#### `lib/phases/2026-09-29-tool-layers-and-pane-memory/`

1 other file(s).

- other: `lib/phases/2026-09-29-tool-layers-and-pane-memory/P5.phase`

#### `lib/phases/2026-09-29-tool-layers-and-pane-memory/graph/`

1 other file(s).

- other: `lib/phases/2026-09-29-tool-layers-and-pane-memory/graph/P5-8d626c5118de90a9.graph`

#### `lib/phases/2026-09-30-idearium-coding-flow/`

2 other file(s).

- other: `lib/phases/2026-09-30-idearium-coding-flow/W0_map.phase`, `lib/phases/2026-09-30-idearium-coding-flow/W6_release.phase`

#### `lib/phases/2026-09-30-idearium-coding-flow/graph/`

2 other file(s).

- other: `lib/phases/2026-09-30-idearium-coding-flow/graph/W0_map-48e0fd2adc75cbe4.graph`, `lib/phases/2026-09-30-idearium-coding-flow/graph/W6_release-70dd119da6acc652.graph`

#### `lib/phases/2026-09-30-idearium-coding-flow/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-09-30-idearium-coding-flow/graph/_superseded/W6_release-16020646cb3d4924.graph`

#### `lib/phases/2026-10-01-idearium-agent-ready-master/`

21 other file(s).

- other: 21 files (.phase)

#### `lib/phases/2026-10-01-idearium-agent-ready-master/graph/`

21 other file(s).

- other: 21 files (.graph)

#### `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/`

8 other file(s).

- other: `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/CI1_compounding_iterate-0f034aae1bf65fb7.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/CI1_compounding_iterate-1ceee25ce29d30d7.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/CT1_cut_replies_are_finished-44a5ea9533f0d015.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/DT2_failure_mode_field-6c0d9717247bc31e.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/FT1_file_tools_merge_patch_drop-b482bb0cc2b2da5b.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/GL1_gate_verify_fix_loop-c375ed7a6843eff0.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PF3_snapshot_names_changed_files-ef1e8fe4b8bff7c1.graph`, `lib/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PV1_verify-8d8471a331531c9e.graph`

#### `lib/phases/2026-10-01-routing-registry-genesis/`

4 other file(s).

- other: `lib/phases/2026-10-01-routing-registry-genesis/AR1_architecture_spec.phase`, `lib/phases/2026-10-01-routing-registry-genesis/RG0_map.phase`, `lib/phases/2026-10-01-routing-registry-genesis/RG1_routing_policy_library.phase`, `lib/phases/2026-10-01-routing-registry-genesis/RG9_release.phase`

#### `lib/phases/2026-10-01-routing-registry-genesis/graph/`

4 other file(s).

- other: `lib/phases/2026-10-01-routing-registry-genesis/graph/AR1_architecture_spec-8cd719427be6e25f.graph`, `lib/phases/2026-10-01-routing-registry-genesis/graph/RG0_map-2dbe0930b534d57a.graph`, `lib/phases/2026-10-01-routing-registry-genesis/graph/RG1_routing_policy_library-6f62f23ea86dfc53.graph`, `lib/phases/2026-10-01-routing-registry-genesis/graph/RG9_release-ec77e3f2cda3c987.graph`

#### `lib/phases/2026-10-01-routing-registry-genesis/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-01-routing-registry-genesis/graph/_superseded/RG9_release-cf3afc2add05bd8b.graph`

#### `lib/phases/2026-10-01-work-visibility-job-reuse/`

2 other file(s).

- other: `lib/phases/2026-10-01-work-visibility-job-reuse/J0.phase`, `lib/phases/2026-10-01-work-visibility-job-reuse/J4.phase`

#### `lib/phases/2026-10-01-work-visibility-job-reuse/graph/`

2 other file(s).

- other: `lib/phases/2026-10-01-work-visibility-job-reuse/graph/J0-e486fc05d2ee7537.graph`, `lib/phases/2026-10-01-work-visibility-job-reuse/graph/J4-2a2e74951949b0ce.graph`

#### `lib/phases/2026-10-01-work-visibility-job-reuse/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-01-work-visibility-job-reuse/graph/_superseded/J4-d0598b9fa84035cf.graph`

#### `lib/phases/2026-10-02-emerge-field-memory-build/`

28 other file(s).

- other: 28 files (.phase)

#### `lib/phases/2026-10-02-emerge-field-memory-build/graph/`

28 other file(s).

- other: 28 files (.graph)

#### `lib/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/`

17 other file(s).

- other: 17 files (.graph)

#### `lib/phases/2026-10-02-fractal-graph-any-size-agent/`

1 other file(s).

- other: `lib/phases/2026-10-02-fractal-graph-any-size-agent/FG2_token_budget_chunking.phase`

#### `lib/phases/2026-10-02-fractal-graph-any-size-agent/graph/`

1 other file(s).

- other: `lib/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG2_token_budget_chunking-869f29022b91a647.graph`

#### `lib/phases/2026-10-02-spatial-void/`

1 other file(s).

- other: `lib/phases/2026-10-02-spatial-void/V7_proof.phase`

#### `lib/phases/2026-10-02-spatial-void/graph/`

1 other file(s).

- other: `lib/phases/2026-10-02-spatial-void/graph/V7_proof-c207baa9194ab90d.graph`

#### `lib/phases/2026-10-02-synthesis-zoom-versionium/`

1 other file(s).

- other: `lib/phases/2026-10-02-synthesis-zoom-versionium/LV1_fill_the_highest_leverage.phase`

#### `lib/phases/2026-10-02-synthesis-zoom-versionium/graph/`

1 other file(s).

- other: `lib/phases/2026-10-02-synthesis-zoom-versionium/graph/LV1_fill_the_highest_leverage-f6008957730c5715.graph`

#### `lib/phases/2026-10-02-synthesis-zoom-versionium/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-02-synthesis-zoom-versionium/graph/_superseded/LV1_fill_the_highest_leverage-cb833cd372794400.graph`

#### `lib/phases/2026-10-02-workshop-codex-rewind/`

2 other file(s).

- other: `lib/phases/2026-10-02-workshop-codex-rewind/CX0_codex_component_store.phase`, `lib/phases/2026-10-02-workshop-codex-rewind/NX1_nexus_in_a_vm.phase`

#### `lib/phases/2026-10-02-workshop-codex-rewind/graph/`

2 other file(s).

- other: `lib/phases/2026-10-02-workshop-codex-rewind/graph/CX0_codex_component_store-a6c33671bbad00ca.graph`, `lib/phases/2026-10-02-workshop-codex-rewind/graph/NX1_nexus_in_a_vm-24f038cc5c7b50f4.graph`

#### `lib/phases/2026-10-05-announce-pulse-repair/`

3 other file(s).

- other: `lib/phases/2026-10-05-announce-pulse-repair/PR1_the_announced_registry_is_the_list.phase`, `lib/phases/2026-10-05-announce-pulse-repair/PR3_negative_space_for_missed_heartbeats.phase`, `lib/phases/2026-10-05-announce-pulse-repair/PR5_repair_for_real.phase`

#### `lib/phases/2026-10-05-announce-pulse-repair/graph/`

3 other file(s).

- other: `lib/phases/2026-10-05-announce-pulse-repair/graph/PR1_the_announced_registry_is_the_list-5ae40cd0d1efbd71.graph`, `lib/phases/2026-10-05-announce-pulse-repair/graph/PR3_negative_space_for_missed_heartbeats-886bec5cf828024d.graph`, `lib/phases/2026-10-05-announce-pulse-repair/graph/PR5_repair_for_real-6dcbd8120e778892.graph`

#### `lib/phases/2026-10-05-announce-pulse-repair/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-05-announce-pulse-repair/graph/_superseded/PR1_the_announced_registry_is_the_list-641bbd05951e0d82.graph`, `lib/phases/2026-10-05-announce-pulse-repair/graph/_superseded/PR3_negative_space_for_missed_heartbeats-36f6155753d9c5cc.graph`, `lib/phases/2026-10-05-announce-pulse-repair/graph/_superseded/PR5_repair_for_real-620eceb6ad914afa.graph`

#### `lib/phases/2026-10-05-build-from-the-spec/`

26 other file(s).

- other: 26 files (.phase)

#### `lib/phases/2026-10-05-build-from-the-spec/graph/`

26 other file(s).

- other: 26 files (.graph)

#### `lib/phases/2026-10-05-build-from-the-spec/graph/_superseded/`

14 other file(s).

- other: 14 files (.graph)

#### `lib/phases/2026-10-05-cli-data-code/`

12 other file(s).

- other: `lib/phases/2026-10-05-cli-data-code/CL1_commands_declared_by_their_system.phase`, `lib/phases/2026-10-05-cli-data-code/CT1_one_pending_change_path.phase`, `lib/phases/2026-10-05-cli-data-code/HG1_components_store_map_parses.phase`, `lib/phases/2026-10-05-cli-data-code/HG3_bv09_the_detector_and_files.phase`, `lib/phases/2026-10-05-cli-data-code/HG4_scripts_inside_the_sandbox.phase`, `lib/phases/2026-10-05-cli-data-code/HG7_the_law_and_clear_glass.phase`, `lib/phases/2026-10-05-cli-data-code/HG8_raid_phases_belong_to_cortex.phase`, `lib/phases/2026-10-05-cli-data-code/PB1_no_build_below_a_floor.phase`, `lib/phases/2026-10-05-cli-data-code/PB3_verify_counts_what_this_run_broke.phase`, `lib/phases/2026-10-05-cli-data-code/PB5_the_real_broken_imports.phase`, `lib/phases/2026-10-05-cli-data-code/SY1_fifteen_systems.phase`, `lib/phases/2026-10-05-cli-data-code/SY2_cos_its_own_system.phase`

#### `lib/phases/2026-10-05-cli-data-code/graph/`

12 other file(s).

- other: `lib/phases/2026-10-05-cli-data-code/graph/CL1_commands_declared_by_their_system-4c68a98014727ba7.graph`, `lib/phases/2026-10-05-cli-data-code/graph/CT1_one_pending_change_path-e9d4a2ab8a870183.graph`, `lib/phases/2026-10-05-cli-data-code/graph/HG1_components_store_map_parses-dcd4302a4f92f533.graph`, `lib/phases/2026-10-05-cli-data-code/graph/HG3_bv09_the_detector_and_files-8f5946737fc02601.graph`, `lib/phases/2026-10-05-cli-data-code/graph/HG4_scripts_inside_the_sandbox-a8510e63e202d6f6.graph`, `lib/phases/2026-10-05-cli-data-code/graph/HG7_the_law_and_clear_glass-e775e5b9fae4d6a3.graph`, `lib/phases/2026-10-05-cli-data-code/graph/HG8_raid_phases_belong_to_cortex-da2121f8c60092cf.graph`, `lib/phases/2026-10-05-cli-data-code/graph/PB1_no_build_below_a_floor-aa5354fee35ba1e8.graph`, `lib/phases/2026-10-05-cli-data-code/graph/PB3_verify_counts_what_this_run_broke-3aa1d43480832705.graph`, `lib/phases/2026-10-05-cli-data-code/graph/PB5_the_real_broken_imports-f79b01df14fbfb10.graph`, `lib/phases/2026-10-05-cli-data-code/graph/SY1_fifteen_systems-e31bda10dcc3731b.graph`, `lib/phases/2026-10-05-cli-data-code/graph/SY2_cos_its_own_system-6179a217cdf431ec.graph`

#### `lib/phases/2026-10-05-cli-data-code/graph/_superseded/`

10 other file(s).

- other: `lib/phases/2026-10-05-cli-data-code/graph/_superseded/CL1_commands_declared_by_their_system-17ce5c8f22a70bb7.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/HG8_raid_phases_belong_to_cortex-8583fa2b6f57da3a.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/HG8_raid_phases_belong_to_cortex-dc05cb067c7d5dd0.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/PB3_verify_counts_what_this_run_broke-2c3748ba8d24ac93.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/PB5_the_real_broken_imports-64c2d31e9c1a9aff.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/PB5_the_real_broken_imports-7736bfcd3a2587b3.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/SY1_fifteen_systems-0b9d29e5e19e2532.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/SY1_fifteen_systems-2b7d8f61b0358084.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/SY2_cos_its_own_system-5140e15f0bab147d.graph`, `lib/phases/2026-10-05-cli-data-code/graph/_superseded/SY2_cos_its_own_system-aac3d8f060ae686c.graph`

#### `lib/phases/2026-10-05-code-tab-and-one-router/`

4 other file(s).

- other: `lib/phases/2026-10-05-code-tab-and-one-router/CT1_one_door_for_models.phase`, `lib/phases/2026-10-05-code-tab-and-one-router/CT2_it_learns_and_switches.phase`, `lib/phases/2026-10-05-code-tab-and-one-router/CT6_the_escalation_ladder.phase`, `lib/phases/2026-10-05-code-tab-and-one-router/CT8_live_agent_activity.phase`

#### `lib/phases/2026-10-05-code-tab-and-one-router/graph/`

4 other file(s).

- other: `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT1_one_door_for_models-73db225aab49ebc2.graph`, `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT2_it_learns_and_switches-5b7e5862f894dcd4.graph`, `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT6_the_escalation_ladder-efb8afe9cf9edd48.graph`, `lib/phases/2026-10-05-code-tab-and-one-router/graph/CT8_live_agent_activity-d4a3a275c6d63391.graph`

#### `lib/phases/2026-10-05-cos-machines/`

1 other file(s).

- other: `lib/phases/2026-10-05-cos-machines/AP2_test_on_the_android_compartment.phase`

#### `lib/phases/2026-10-05-cos-machines/graph/`

1 other file(s).

- other: `lib/phases/2026-10-05-cos-machines/graph/AP2_test_on_the_android_compartment-1a8e2550e9c6190b.graph`

#### `lib/phases/2026-10-05-failure-reproduction/`

2 other file(s).

- other: `lib/phases/2026-10-05-failure-reproduction/FM1_every_ledger_into_rfr2.phase`, `lib/phases/2026-10-05-failure-reproduction/FM3_run_it_in_cos.phase`

#### `lib/phases/2026-10-05-failure-reproduction/graph/`

2 other file(s).

- other: `lib/phases/2026-10-05-failure-reproduction/graph/FM1_every_ledger_into_rfr2-3f69872ecac3e79c.graph`, `lib/phases/2026-10-05-failure-reproduction/graph/FM3_run_it_in_cos-9c26dcce49a297be.graph`

#### `lib/phases/2026-10-05-spec-workshop-rebuild/`

4 other file(s).

- other: `lib/phases/2026-10-05-spec-workshop-rebuild/RS1_the_generation_recorder.phase`, `lib/phases/2026-10-05-spec-workshop-rebuild/RS2_replay_rewind_branch.phase`, `lib/phases/2026-10-05-spec-workshop-rebuild/RS3_the_spec_document.phase`, `lib/phases/2026-10-05-spec-workshop-rebuild/RS8_what_converges_becomes_deterministic.phase`

#### `lib/phases/2026-10-05-spec-workshop-rebuild/graph/`

4 other file(s).

- other: `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS1_the_generation_recorder-9f9766742206a0df.graph`, `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS2_replay_rewind_branch-4e8721ae758a728b.graph`, `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS3_the_spec_document-25b27a27256aff05.graph`, `lib/phases/2026-10-05-spec-workshop-rebuild/graph/RS8_what_converges_becomes_deterministic-1f1c1e8ec49fbcec.graph`

#### `lib/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/RS1_the_generation_recorder-fb8844b445a656ad.graph`, `lib/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/RS2_replay_rewind_branch-ed0fd5754ecc8b3a.graph`, `lib/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/RS3_the_spec_document-6a4e782e7d9fcab1.graph`, `lib/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/RS8_what_converges_becomes_deterministic-14a9d76c2db6ad37.graph`

#### `lib/phases/2026-10-05-verified-primitives/`

6 other file(s).

- other: `lib/phases/2026-10-05-verified-primitives/VP0_map_and_atlas.phase`, `lib/phases/2026-10-05-verified-primitives/VP1_confidence_from_evidence.phase`, `lib/phases/2026-10-05-verified-primitives/VP2_adversarial_review.phase`, `lib/phases/2026-10-05-verified-primitives/VP4_the_primitive_field.phase`, `lib/phases/2026-10-05-verified-primitives/VP5_provenance.phase`, `lib/phases/2026-10-05-verified-primitives/VP6_debug_and_intelligence_in_the_desktop.phase`

#### `lib/phases/2026-10-05-verified-primitives/graph/`

6 other file(s).

- other: `lib/phases/2026-10-05-verified-primitives/graph/VP0_map_and_atlas-0153feef7a3d9938.graph`, `lib/phases/2026-10-05-verified-primitives/graph/VP1_confidence_from_evidence-d274b14ef5df1bea.graph`, `lib/phases/2026-10-05-verified-primitives/graph/VP2_adversarial_review-11237e7e9ea3ece7.graph`, `lib/phases/2026-10-05-verified-primitives/graph/VP4_the_primitive_field-e222cd9217f780b8.graph`, `lib/phases/2026-10-05-verified-primitives/graph/VP5_provenance-f17055700f5ac665.graph`, `lib/phases/2026-10-05-verified-primitives/graph/VP6_debug_and_intelligence_in_the_desktop-cb17f73919611193.graph`

#### `lib/phases/2026-10-05-verified-primitives/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-05-verified-primitives/graph/_superseded/VP2_adversarial_review-861894593ce759d9.graph`

#### `lib/phases/2026-10-07-compartment-control-and-activity/`

7 other file(s).

- other: `lib/phases/2026-10-07-compartment-control-and-activity/AL1_activity_log.phase`, `lib/phases/2026-10-07-compartment-control-and-activity/CC1_claude_code_lands_like_every_agent.phase`, `lib/phases/2026-10-07-compartment-control-and-activity/CM2_every_command_for_every_agent.phase`, `lib/phases/2026-10-07-compartment-control-and-activity/DT1_desktop_into_the_log.phase`, `lib/phases/2026-10-07-compartment-control-and-activity/DX1_diagnose_it.phase`, `lib/phases/2026-10-07-compartment-control-and-activity/SP1_one_spotlight.phase`, `lib/phases/2026-10-07-compartment-control-and-activity/UN1_nexus_surfaces_in_the_field.phase`

#### `lib/phases/2026-10-07-compartment-control-and-activity/graph/`

7 other file(s).

- other: `lib/phases/2026-10-07-compartment-control-and-activity/graph/AL1_activity_log-a33d6d01469c5bdf.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/CC1_claude_code_lands_like_every_agent-bab5260f8cf63874.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/CM2_every_command_for_every_agent-b960e463b6a6c257.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/DT1_desktop_into_the_log-8ce7b320cd5c0cd0.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/DX1_diagnose_it-589ac7374abdf907.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/SP1_one_spotlight-1489057ae11e2f3d.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/UN1_nexus_surfaces_in_the_field-c73f21eedd232bcc.graph`

#### `lib/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/AL1_activity_log-f60e21ab10d46017.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/CM2_every_command_for_every_agent-96b5745236336c5b.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/SP1_one_spotlight-094a82781d95acdc.graph`, `lib/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/UN1_nexus_surfaces_in_the_field-6a1c22a94c4ecbba.graph`

#### `lib/phases/2026-10-07-idearium-one-surface/`

4 other file(s).

- other: `lib/phases/2026-10-07-idearium-one-surface/OS1_commits_say_what_they_touched.phase`, `lib/phases/2026-10-07-idearium-one-surface/OS6_proved_on_the_real_page.phase`, `lib/phases/2026-10-07-idearium-one-surface/OS9_the_agent_is_in_the_code_tab.phase`, `lib/phases/2026-10-07-idearium-one-surface/SP3_the_file_tree_is_the_spine.phase`

#### `lib/phases/2026-10-07-idearium-one-surface/graph/`

4 other file(s).

- other: `lib/phases/2026-10-07-idearium-one-surface/graph/OS1_commits_say_what_they_touched-18c14ae19a9daa94.graph`, `lib/phases/2026-10-07-idearium-one-surface/graph/OS6_proved_on_the_real_page-6e7f9d7881770520.graph`, `lib/phases/2026-10-07-idearium-one-surface/graph/OS9_the_agent_is_in_the_code_tab-b061d20cf1e09377.graph`, `lib/phases/2026-10-07-idearium-one-surface/graph/SP3_the_file_tree_is_the_spine-a05d1bb6700d15b8.graph`

#### `lib/phases/2026-10-07-idearium-one-surface/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-07-idearium-one-surface/graph/_superseded/OS1_commits_say_what_they_touched-cd4a72feed007e70.graph`

#### `lib/phases/2026-10-07-ollama-recorder/`

1 other file(s).

- other: `lib/phases/2026-10-07-ollama-recorder/OR2_every_call_a_frame.phase`

#### `lib/phases/2026-10-07-ollama-recorder/graph/`

1 other file(s).

- other: `lib/phases/2026-10-07-ollama-recorder/graph/OR2_every_call_a_frame-350154edf9f42462.graph`

#### `lib/phases/2026-10-07-runtime-load/`

3 other file(s).

- other: `lib/phases/2026-10-07-runtime-load/PF1_the_stall.phase`, `lib/phases/2026-10-07-runtime-load/PF2_velocity_steers_the_governor.phase`, `lib/phases/2026-10-07-runtime-load/PF6_slow_ticks_name_themselves.phase`

#### `lib/phases/2026-10-07-runtime-load/graph/`

3 other file(s).

- other: `lib/phases/2026-10-07-runtime-load/graph/PF1_the_stall-7057301b9979c4f4.graph`, `lib/phases/2026-10-07-runtime-load/graph/PF2_velocity_steers_the_governor-b5f6ce2d06419700.graph`, `lib/phases/2026-10-07-runtime-load/graph/PF6_slow_ticks_name_themselves-433ed474eed245fb.graph`

#### `lib/phases/2026-10-07-runtime-load/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-07-runtime-load/graph/_superseded/PF2_velocity_steers_the_governor-5c6b870477e755ff.graph`

#### `lib/phases/2026-10-07-system-expectations/`

2 other file(s).

- other: `lib/phases/2026-10-07-system-expectations/EX1_the_expectation_schema.phase`, `lib/phases/2026-10-07-system-expectations/EX2_vitals_from_every_process.phase`

#### `lib/phases/2026-10-07-system-expectations/graph/`

2 other file(s).

- other: `lib/phases/2026-10-07-system-expectations/graph/EX1_the_expectation_schema-c2386a74872cf91f.graph`, `lib/phases/2026-10-07-system-expectations/graph/EX2_vitals_from_every_process-8337bd39d03384c4.graph`

#### `lib/phases/2026-10-07-system-expectations/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-07-system-expectations/graph/_superseded/EX1_the_expectation_schema-19589d1a025b2723.graph`

#### `lib/phases/2026-10-07-versionium-releases/`

3 other file(s).

- other: `lib/phases/2026-10-07-versionium-releases/GH1_the_git_bridge.phase`, `lib/phases/2026-10-07-versionium-releases/LT1_provenance_lattice.phase`, `lib/phases/2026-10-07-versionium-releases/RN2_cortex_is_the_bookkeeper.phase`

#### `lib/phases/2026-10-07-versionium-releases/graph/`

3 other file(s).

- other: `lib/phases/2026-10-07-versionium-releases/graph/GH1_the_git_bridge-97998ba3afae84c1.graph`, `lib/phases/2026-10-07-versionium-releases/graph/LT1_provenance_lattice-d9cf058d5017debc.graph`, `lib/phases/2026-10-07-versionium-releases/graph/RN2_cortex_is_the_bookkeeper-ce96f74583db38f9.graph`

#### `lib/phases/2026-10-07-versionium-releases/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-07-versionium-releases/graph/_superseded/GH1_the_git_bridge-6dd3595186ddbb17.graph`, `lib/phases/2026-10-07-versionium-releases/graph/_superseded/LT1_provenance_lattice-91871c2b63fe20e1.graph`, `lib/phases/2026-10-07-versionium-releases/graph/_superseded/RN2_cortex_is_the_bookkeeper-86535db74885de3a.graph`

#### `lib/phases/2026-10-09-hardening-pass/`

6 other file(s).

- other: `lib/phases/2026-10-09-hardening-pass/HP12_a_failure_names_the_agent.phase`, `lib/phases/2026-10-09-hardening-pass/HP18_auto_tries_agents_with_a_tab_first.phase`, `lib/phases/2026-10-09-hardening-pass/HP19_the_simulator_stays.phase`, `lib/phases/2026-10-09-hardening-pass/HP20_a_routing_try_is_not_a_job.phase`, `lib/phases/2026-10-09-hardening-pass/HP4_signals_weighted.phase`, `lib/phases/2026-10-09-hardening-pass/HP5_odd_files_round_trip.phase`

#### `lib/phases/2026-10-09-hardening-pass/graph/`

6 other file(s).

- other: `lib/phases/2026-10-09-hardening-pass/graph/HP12_a_failure_names_the_agent-bec3f59ad333b46f.graph`, `lib/phases/2026-10-09-hardening-pass/graph/HP18_auto_tries_agents_with_a_tab_first-f11a7f42d67241f0.graph`, `lib/phases/2026-10-09-hardening-pass/graph/HP19_the_simulator_stays-68d2133829f37a8f.graph`, `lib/phases/2026-10-09-hardening-pass/graph/HP20_a_routing_try_is_not_a_job-d5e16036c01329d2.graph`, `lib/phases/2026-10-09-hardening-pass/graph/HP4_signals_weighted-036df943c960cf97.graph`, `lib/phases/2026-10-09-hardening-pass/graph/HP5_odd_files_round_trip-a3b1cad180508350.graph`

#### `lib/phases/2026-10-09-one-model-engine/`

12 other file(s).

- other: `lib/phases/2026-10-09-one-model-engine/ME0_the_inventory_proved.phase`, `lib/phases/2026-10-09-one-model-engine/ME10_nested_ladders_folded.phase`, `lib/phases/2026-10-09-one-model-engine/ME12_callers_moved.phase`, `lib/phases/2026-10-09-one-model-engine/ME13_no_bypass.phase`, `lib/phases/2026-10-09-one-model-engine/ME14_across_callers.phase`, `lib/phases/2026-10-09-one-model-engine/ME15_the_docs_tell_the_truth.phase`, `lib/phases/2026-10-09-one-model-engine/ME1_one_failure_list.phase`, `lib/phases/2026-10-09-one-model-engine/ME2_caller_policy.phase`, `lib/phases/2026-10-09-one-model-engine/ME3_one_engine_one_budget.phase`, `lib/phases/2026-10-09-one-model-engine/ME4_one_attempt_record.phase`, `lib/phases/2026-10-09-one-model-engine/ME5_one_chooser.phase`, `lib/phases/2026-10-09-one-model-engine/ME6_one_learner.phase`

#### `lib/phases/2026-10-09-one-model-engine/graph/`

12 other file(s).

- other: `lib/phases/2026-10-09-one-model-engine/graph/ME0_the_inventory_proved-9d64861419da9a7a.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME10_nested_ladders_folded-15bcb14daa4a6138.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME12_callers_moved-734d6fb40e0248fb.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME13_no_bypass-5db1b29401ba54fb.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME14_across_callers-0d67fbee2de537c0.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME15_the_docs_tell_the_truth-e4a2663f9650838b.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME1_one_failure_list-6aa7efde8e0d3998.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME2_caller_policy-9ddb1c53e714496d.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME3_one_engine_one_budget-82b28a68e6a7adbb.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME4_one_attempt_record-f2a989a0e8ce7614.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME5_one_chooser-c19c4acf0d80ec8c.graph`, `lib/phases/2026-10-09-one-model-engine/graph/ME6_one_learner-a3c93c03d487932a.graph`

#### `lib/phases/2026-10-09-one-model-engine/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-09-one-model-engine/graph/_superseded/ME10_nested_ladders_folded-4010d5284074ac51.graph`, `lib/phases/2026-10-09-one-model-engine/graph/_superseded/ME12_callers_moved-9e7765b848590053.graph`

#### `lib/phases/2026-10-09-one-roadmap/`

6 other file(s).

- other: `lib/phases/2026-10-09-one-roadmap/OR0_the_census.phase`, `lib/phases/2026-10-09-one-roadmap/OR2_how_done_is_checked.phase`, `lib/phases/2026-10-09-one-roadmap/OR2_the_proposal.phase`, `lib/phases/2026-10-09-one-roadmap/OR3_his_decisions_applied.phase`, `lib/phases/2026-10-09-one-roadmap/OR6_old_code_out.phase`, `lib/phases/2026-10-09-one-roadmap/OR7_the_shelf_combed.phase`

#### `lib/phases/2026-10-09-one-roadmap/graph/`

6 other file(s).

- other: `lib/phases/2026-10-09-one-roadmap/graph/OR0_the_census-b3f330f789402a35.graph`, `lib/phases/2026-10-09-one-roadmap/graph/OR2_how_done_is_checked-438048adff31f436.graph`, `lib/phases/2026-10-09-one-roadmap/graph/OR2_the_proposal-87394dbbf51c92a7.graph`, `lib/phases/2026-10-09-one-roadmap/graph/OR3_his_decisions_applied-f52f9193180a26cb.graph`, `lib/phases/2026-10-09-one-roadmap/graph/OR6_old_code_out-ac041db7c1a7637f.graph`, `lib/phases/2026-10-09-one-roadmap/graph/OR7_the_shelf_combed-5e186047ef132114.graph`

#### `lib/phases/2026-10-09-one-roadmap/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-09-one-roadmap/graph/_superseded/OR6_old_code_out-613aca89c535c7bf.graph`, `lib/phases/2026-10-09-one-roadmap/graph/_superseded/OR6_old_code_out-6af214e0e32a3243.graph`

#### `lib/phases/2026-10-10-design-surface/`

6 other file(s).

- other: `lib/phases/2026-10-10-design-surface/DS0_one_token_source.phase`, `lib/phases/2026-10-10-design-surface/DS3_components_are_mods.phase`, `lib/phases/2026-10-10-design-surface/DS5_the_agents_design_too.phase`, `lib/phases/2026-10-10-design-surface/DS6_one_module_contract_nested.phase`, `lib/phases/2026-10-10-design-surface/DS7_tools_are_mods.phase`, `lib/phases/2026-10-10-design-surface/DS8_the_registry_routes_the_ui_reflects.phase`

#### `lib/phases/2026-10-10-design-surface/graph/`

6 other file(s).

- other: `lib/phases/2026-10-10-design-surface/graph/DS0_one_token_source-5388abf58caa0eb3.graph`, `lib/phases/2026-10-10-design-surface/graph/DS3_components_are_mods-bb967cfd589a6163.graph`, `lib/phases/2026-10-10-design-surface/graph/DS5_the_agents_design_too-1fd7bef8de2d374a.graph`, `lib/phases/2026-10-10-design-surface/graph/DS6_one_module_contract_nested-3acef63147f4f671.graph`, `lib/phases/2026-10-10-design-surface/graph/DS7_tools_are_mods-95b991d2ba973682.graph`, `lib/phases/2026-10-10-design-surface/graph/DS8_the_registry_routes_the_ui_reflects-480216b9fbdaadcd.graph`

#### `lib/phases/2026-10-10-design-surface/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-10-design-surface/graph/_superseded/DS0_one_token_source-385edcecb63311aa.graph`, `lib/phases/2026-10-10-design-surface/graph/_superseded/DS6_one_module_contract_nested-53a34b1d184d1911.graph`, `lib/phases/2026-10-10-design-surface/graph/_superseded/DS6_one_module_contract_nested-fd400d57a71b916d.graph`, `lib/phases/2026-10-10-design-surface/graph/_superseded/DS8_the_registry_routes_the_ui_reflects-9db061f88abf55a1.graph`

#### `lib/phases/2026-10-10-idearium-access/`

1 other file(s).

- other: `lib/phases/2026-10-10-idearium-access/IA5_provider_accounts_per_hat_and_repo.phase`

#### `lib/phases/2026-10-10-idearium-access/graph/`

1 other file(s).

- other: `lib/phases/2026-10-10-idearium-access/graph/IA5_provider_accounts_per_hat_and_repo-fd55efa3a8901e7f.graph`

#### `lib/phases/2026-10-10-idearium-solid/`

7 other file(s).

- other: `lib/phases/2026-10-10-idearium-solid/SD0_versionium_down_is_said_and_restarted.phase`, `lib/phases/2026-10-10-idearium-solid/SD10_the_adversarial_gate.phase`, `lib/phases/2026-10-10-idearium-solid/SD20_a_starved_machine_does_not_spin.phase`, `lib/phases/2026-10-10-idearium-solid/SD4_agents_live_in_guardian.phase`, `lib/phases/2026-10-10-idearium-solid/SD5_account_fallback.phase`, `lib/phases/2026-10-10-idearium-solid/SD7_blocks_that_generate_themselves.phase`, `lib/phases/2026-10-10-idearium-solid/SD9_claude_code_inside_idearium.phase`

#### `lib/phases/2026-10-10-idearium-solid/graph/`

7 other file(s).

- other: `lib/phases/2026-10-10-idearium-solid/graph/SD0_versionium_down_is_said_and_restarted-f5266f0f2314ba80.graph`, `lib/phases/2026-10-10-idearium-solid/graph/SD10_the_adversarial_gate-90a97abd6be590f4.graph`, `lib/phases/2026-10-10-idearium-solid/graph/SD20_a_starved_machine_does_not_spin-91403d453740d322.graph`, `lib/phases/2026-10-10-idearium-solid/graph/SD4_agents_live_in_guardian-d79b599501f437b1.graph`, `lib/phases/2026-10-10-idearium-solid/graph/SD5_account_fallback-655edc147445e9ca.graph`, `lib/phases/2026-10-10-idearium-solid/graph/SD7_blocks_that_generate_themselves-02b6b91faaa2cecc.graph`, `lib/phases/2026-10-10-idearium-solid/graph/SD9_claude_code_inside_idearium-681f598deb142c6d.graph`

#### `lib/phases/2026-10-10-idearium-solid/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-10-idearium-solid/graph/_superseded/SD0_versionium_down_is_said_and_restarted-d745c23ff321527a.graph`, `lib/phases/2026-10-10-idearium-solid/graph/_superseded/SD10_the_adversarial_gate-903ae831ea1a844a.graph`, `lib/phases/2026-10-10-idearium-solid/graph/_superseded/SD20_a_starved_machine_does_not_spin-76dc07b8a12db6ca.graph`, `lib/phases/2026-10-10-idearium-solid/graph/_superseded/SD7_blocks_that_generate_themselves-0d8df190210c4970.graph`

#### `lib/phases/2026-10-10-self-awareness/`

2 other file(s).

- other: `lib/phases/2026-10-10-self-awareness/AW2_every_call_says_who_asked.phase`, `lib/phases/2026-10-10-self-awareness/AW4_the_door_reads_the_lattice.phase`

#### `lib/phases/2026-10-10-self-awareness/graph/`

2 other file(s).

- other: `lib/phases/2026-10-10-self-awareness/graph/AW2_every_call_says_who_asked-a5bd86f3bfadf956.graph`, `lib/phases/2026-10-10-self-awareness/graph/AW4_the_door_reads_the_lattice-bec3835d08d8355e.graph`

#### `lib/phases/2026-10-10-self-awareness/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-10-self-awareness/graph/_superseded/AW4_the_door_reads_the_lattice-4de82ab7f378354b.graph`

#### `lib/phases/2026-10-10-shape-of-nexus/`

7 other file(s).

- other: `lib/phases/2026-10-10-shape-of-nexus/EP1_every_claim_says_how_it_is_known.phase`, `lib/phases/2026-10-10-shape-of-nexus/FN3_the_nerve_shows_it_and_the_field_sees_the_nerve.phase`, `lib/phases/2026-10-10-shape-of-nexus/LR0_the_shared_primitives_are_the_glyph.phase`, `lib/phases/2026-10-10-shape-of-nexus/LR1_each_component_in_the_language_that_fits.phase`, `lib/phases/2026-10-10-shape-of-nexus/OP0_one_options_shape_for_every_system.phase`, `lib/phases/2026-10-10-shape-of-nexus/OP1_every_system_declares_its_options.phase`, `lib/phases/2026-10-10-shape-of-nexus/SH1_one_home_for_every_concept.phase`

#### `lib/phases/2026-10-10-shape-of-nexus/graph/`

7 other file(s).

- other: `lib/phases/2026-10-10-shape-of-nexus/graph/EP1_every_claim_says_how_it_is_known-518303ecd7d85d85.graph`, `lib/phases/2026-10-10-shape-of-nexus/graph/FN3_the_nerve_shows_it_and_the_field_sees_the_nerve-05327980cfc64f09.graph`, `lib/phases/2026-10-10-shape-of-nexus/graph/LR0_the_shared_primitives_are_the_glyph-6952439b2f80c99c.graph`, `lib/phases/2026-10-10-shape-of-nexus/graph/LR1_each_component_in_the_language_that_fits-811033a724b0ca79.graph`, `lib/phases/2026-10-10-shape-of-nexus/graph/OP0_one_options_shape_for_every_system-a172702727a5d91e.graph`, `lib/phases/2026-10-10-shape-of-nexus/graph/OP1_every_system_declares_its_options-954ea8eee677f68e.graph`, `lib/phases/2026-10-10-shape-of-nexus/graph/SH1_one_home_for_every_concept-d30f0553638eb554.graph`

#### `lib/phases/2026-10-10-shape-of-nexus/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-10-shape-of-nexus/graph/_superseded/FN3_the_nerve_shows_it_and_the_field_sees_the_nerve-5a5715d4e3cba86c.graph`

#### `lib/phases/2026-10-10-snapshot-compartments/`

1 other file(s).

- other: `lib/phases/2026-10-10-snapshot-compartments/SN4_benchmarks_teach.phase`

#### `lib/phases/2026-10-10-snapshot-compartments/graph/`

1 other file(s).

- other: `lib/phases/2026-10-10-snapshot-compartments/graph/SN4_benchmarks_teach-c23057ec2723dd8b.graph`

#### `lib/phases/2026-10-12-browser-providers-and-work/`

8 other file(s).

- other: `lib/phases/2026-10-12-browser-providers-and-work/CS0_projects_decomposed_into_components.phase`, `lib/phases/2026-10-12-browser-providers-and-work/JB5_varied_wording_true_facts.phase`, `lib/phases/2026-10-12-browser-providers-and-work/MX4_one_system_digest.phase`, `lib/phases/2026-10-12-browser-providers-and-work/PV0_claude_code_is_a_guardian_provider.phase`, `lib/phases/2026-10-12-browser-providers-and-work/PV1_providers_read_from_nodes.phase`, `lib/phases/2026-10-12-browser-providers-and-work/PV2_hats_are_nodes.phase`, `lib/phases/2026-10-12-browser-providers-and-work/PV4_inputs_are_history.phase`, `lib/phases/2026-10-12-browser-providers-and-work/PV5_conversation_carries_across_providers.phase`

#### `lib/phases/2026-10-12-browser-providers-and-work/graph/`

8 other file(s).

- other: `lib/phases/2026-10-12-browser-providers-and-work/graph/CS0_projects_decomposed_into_components-5eac0923400df9d4.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/JB5_varied_wording_true_facts-88d2ca99cff642c0.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/MX4_one_system_digest-f138b394815f668d.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/PV0_claude_code_is_a_guardian_provider-700deffb992647b8.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/PV1_providers_read_from_nodes-c83ac4b82fb3e70c.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/PV2_hats_are_nodes-66c258dbf8ec8139.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/PV4_inputs_are_history-a129834872fdbcc9.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/PV5_conversation_carries_across_providers-221b5ffcc46bedbf.graph`

#### `lib/phases/2026-10-12-browser-providers-and-work/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-12-browser-providers-and-work/graph/_superseded/CS0_projects_decomposed_into_components-c12a1ca2cc3030ee.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/_superseded/MX4_one_system_digest-b1af60343305fd6c.graph`, `lib/phases/2026-10-12-browser-providers-and-work/graph/_superseded/PV1_providers_read_from_nodes-727b5bb6b91c22ad.graph`

#### `lib/phases/2026-10-12-request-spine/`

19 other file(s).

- other: 19 files (.phase)

#### `lib/phases/2026-10-12-request-spine/graph/`

19 other file(s).

- other: 19 files (.graph)

#### `lib/phases/2026-10-12-request-spine/graph/_superseded/`

11 other file(s).

- other: `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ13_the_work_surface_and_provenance-26d29fe3a64d548b.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ17_observe_by_request-33924dbf8607becb.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ17_observe_by_request-cfbad94be99e9081.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ19_what_nexus_can_take_over-18b7aa141588697b.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ1_the_verifier_library-ce3d943947d62331.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ23_acceptance_conditions_that_cannot_be_moved-6eb606b5ddc53407.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ2_the_generation_failure_vocabulary_and_index-5df3e6faedddd92c.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ3_repair_with_the_checks_own_words-d4c1d91c1ca5d6a9.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ4_escalate_on_the_checks_and_keep_the_lesson-8a42351a9f6f78fc.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ6_one_intent_map-d5b9477b2e039d62.graph`, `lib/phases/2026-10-12-request-spine/graph/_superseded/RQ8_the_gap_is_a_question-103a81b4f5d8cf1c.graph`

#### `lib/phases/2026-10-13-gates-that-learn-and-priorities/`

2 other file(s).

- other: `lib/phases/2026-10-13-gates-that-learn-and-priorities/QA1_the_catalogue_runs.phase`, `lib/phases/2026-10-13-gates-that-learn-and-priorities/RT1_eligibility_then_preference.phase`

#### `lib/phases/2026-10-13-gates-that-learn-and-priorities/graph/`

2 other file(s).

- other: `lib/phases/2026-10-13-gates-that-learn-and-priorities/graph/QA1_the_catalogue_runs-2f28022294f93cfe.graph`, `lib/phases/2026-10-13-gates-that-learn-and-priorities/graph/RT1_eligibility_then_preference-db32153ad00baf8c.graph`

#### `lib/phases/2026-10-13-identities-tabs-and-automation/`

1 other file(s).

- other: `lib/phases/2026-10-13-identities-tabs-and-automation/HM0_the_hat_keeps_a_model_of_the_repo.phase`

#### `lib/phases/2026-10-13-identities-tabs-and-automation/graph/`

1 other file(s).

- other: `lib/phases/2026-10-13-identities-tabs-and-automation/graph/HM0_the_hat_keeps_a_model_of_the_repo-3e7320f2d7cabfcb.graph`

#### `lib/phases/2026-10-13-nexus-memory-gates-and-contract/`

7 other file(s).

- other: `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CT0_the_contract_is_a_reference.phase`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CT1_dynamic_chunking.phase`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CT2_ingestion_as_contracts.phase`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/CX0_context_from_dependencies.phase`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/GT0_every_interaction_gated.phase`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/IM0_intent_map_his_to_change.phase`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/PF0_profiles_linked_to_hats.phase`

#### `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/`

7 other file(s).

- other: `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT0_the_contract_is_a_reference-df6fb16d25b92bcf.graph`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT1_dynamic_chunking-f7d073f269227f58.graph`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT2_ingestion_as_contracts-ba7095d82e6aabf3.graph`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CX0_context_from_dependencies-dbe7d50a20a425b3.graph`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/GT0_every_interaction_gated-03a2a715a7b70f73.graph`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/IM0_intent_map_his_to_change-6349e71baccd8530.graph`, `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/PF0_profiles_linked_to_hats-1617b623eba97216.graph`

#### `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-13-nexus-memory-gates-and-contract/graph/_superseded/CT0_the_contract_is_a_reference-78068c3fef97cff2.graph`

#### `lib/phases/2026-10-13-projects-raid-and-gates/`

10 other file(s).

- other: `lib/phases/2026-10-13-projects-raid-and-gates/CK1_the_catalogue_runs.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/PL0_his_projects_imported_for_real.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/PL2_history_kept.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/PL3_versions_become_history.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/PL4_import_reports_what_is_broken.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/PL6_global_links_seen.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/RD3_the_registry_carries_events.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/RF0_architecture_read.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/RF1_migration_proposed_as_phases.phase`, `lib/phases/2026-10-13-projects-raid-and-gates/RF2_applied_one_phase_at_a_time.phase`

#### `lib/phases/2026-10-13-projects-raid-and-gates/graph/`

10 other file(s).

- other: `lib/phases/2026-10-13-projects-raid-and-gates/graph/CK1_the_catalogue_runs-1f64ff14ad327042.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL0_his_projects_imported_for_real-061b0f3b31ea86d0.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL2_history_kept-5b4cd0e60f00b85b.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL3_versions_become_history-df0a32b5cad07ebc.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL4_import_reports_what_is_broken-463d5b3d9d4f4c22.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/PL6_global_links_seen-d930008daef10476.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/RD3_the_registry_carries_events-f2ceaa39f7c300e5.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/RF0_architecture_read-c117168ac25aa9f0.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/RF1_migration_proposed_as_phases-37ed11040317ceba.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/RF2_applied_one_phase_at_a_time-fcaca59eda2838e7.graph`

#### `lib/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/PL3_versions_become_history-0044abaf283377f6.graph`, `lib/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/RF1_migration_proposed_as_phases-0653cb1c1c976e54.graph`

#### `lib/phases/2026-10-15-automatic-tracking/`

6 other file(s).

- other: `lib/phases/2026-10-15-automatic-tracking/AU1_addenda_written_for_you.phase`, `lib/phases/2026-10-15-automatic-tracking/CS1_every_brick_a_component.phase`, `lib/phases/2026-10-15-automatic-tracking/CX1_context_from_the_dependencies.phase`, `lib/phases/2026-10-15-automatic-tracking/KT1_observations_on_a_semantic_tree.phase`, `lib/phases/2026-10-15-automatic-tracking/LA1_one_self_model.phase`, `lib/phases/2026-10-15-automatic-tracking/MC1_macros_from_repeats.phase`

#### `lib/phases/2026-10-15-automatic-tracking/graph/`

6 other file(s).

- other: `lib/phases/2026-10-15-automatic-tracking/graph/AU1_addenda_written_for_you-a1c1fe9139548e36.graph`, `lib/phases/2026-10-15-automatic-tracking/graph/CS1_every_brick_a_component-7d658969a189e1e4.graph`, `lib/phases/2026-10-15-automatic-tracking/graph/CX1_context_from_the_dependencies-7fa78ba0b9bcd675.graph`, `lib/phases/2026-10-15-automatic-tracking/graph/KT1_observations_on_a_semantic_tree-3bef71197a9bf793.graph`, `lib/phases/2026-10-15-automatic-tracking/graph/LA1_one_self_model-d1166e769184d12d.graph`, `lib/phases/2026-10-15-automatic-tracking/graph/MC1_macros_from_repeats-611c1e68d8c1dd1b.graph`

#### `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/`

2 other file(s).

- other: `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/CS1_capability_spec_and_surface_check.phase`, `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/SP3_the_browser_agent_reads_the_tree.phase`

#### `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/`

2 other file(s).

- other: `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/CS1_capability_spec_and_surface_check-a1190cde7dea8320.graph`, `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/SP3_the_browser_agent_reads_the_tree-fa83b2fda889b092.graph`

#### `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-15-capability-specs-and-semantic-page-tree/graph/_superseded/SP3_the_browser_agent_reads_the_tree-0f6a46c1ba15a7e6.graph`

#### `lib/phases/2026-10-15-clear-glass-network-posture/`

1 other file(s).

- other: `lib/phases/2026-10-15-clear-glass-network-posture/NP19_container.phase`

#### `lib/phases/2026-10-15-clear-glass-network-posture/graph/`

1 other file(s).

- other: `lib/phases/2026-10-15-clear-glass-network-posture/graph/NP19_container-ec54a18411dad545.graph`

#### `lib/phases/2026-10-15-clear-glass-surfaces/`

1 other file(s).

- other: `lib/phases/2026-10-15-clear-glass-surfaces/PF1_read_the_log.phase`

#### `lib/phases/2026-10-15-clear-glass-surfaces/graph/`

1 other file(s).

- other: `lib/phases/2026-10-15-clear-glass-surfaces/graph/PF1_read_the_log-5490f29c2a420c27.graph`

#### `lib/phases/2026-10-15-code-tab-run-state/`

7 other file(s).

- other: `lib/phases/2026-10-15-code-tab-run-state/CE12_proof_and_wiring.phase`, `lib/phases/2026-10-15-code-tab-run-state/CE1_the_run_state.phase`, `lib/phases/2026-10-15-code-tab-run-state/CE2_the_task_header.phase`, `lib/phases/2026-10-15-code-tab-run-state/CE3_reply_on_task_gate.phase`, `lib/phases/2026-10-15-code-tab-run-state/CE5_events.phase`, `lib/phases/2026-10-15-code-tab-run-state/CV2_a_version_per_diff.phase`, `lib/phases/2026-10-15-code-tab-run-state/CV5_universal_versioning.phase`

#### `lib/phases/2026-10-15-code-tab-run-state/graph/`

7 other file(s).

- other: `lib/phases/2026-10-15-code-tab-run-state/graph/CE12_proof_and_wiring-8944ffb9c6217b6f.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/CE1_the_run_state-12752a28ba5339e2.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/CE2_the_task_header-5cf233239ddf24a1.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/CE3_reply_on_task_gate-6494fb36f98b0242.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/CE5_events-3b6ec442f6076f34.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/CV2_a_version_per_diff-fa951e6ce16e4c3d.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/CV5_universal_versioning-caf16dc4d08f56cc.graph`

#### `lib/phases/2026-10-15-code-tab-run-state/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-15-code-tab-run-state/graph/_superseded/CE12_proof_and_wiring-dc6801d7a1de9fef.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/_superseded/CE1_the_run_state-48bba9cee37fd0d2.graph`, `lib/phases/2026-10-15-code-tab-run-state/graph/_superseded/CE5_events-4e7457d69c24f4b1.graph`

#### `lib/phases/2026-10-15-cos-app/`

6 other file(s).

- other: `lib/phases/2026-10-15-cos-app/COSA12_vmware_window.phase`, `lib/phases/2026-10-15-cos-app/COSA14_versionium_record.phase`, `lib/phases/2026-10-15-cos-app/COSA5_data_root.phase`, `lib/phases/2026-10-15-cos-app/COSA6_the_exe.phase`, `lib/phases/2026-10-15-cos-app/COSA8_other_projects.phase`, `lib/phases/2026-10-15-cos-app/COSA9_idearium_sync.phase`

#### `lib/phases/2026-10-15-cos-app/graph/`

6 other file(s).

- other: `lib/phases/2026-10-15-cos-app/graph/COSA12_vmware_window-c348ed645b8dabb1.graph`, `lib/phases/2026-10-15-cos-app/graph/COSA14_versionium_record-5390299903c72853.graph`, `lib/phases/2026-10-15-cos-app/graph/COSA5_data_root-8c58d98a92114457.graph`, `lib/phases/2026-10-15-cos-app/graph/COSA6_the_exe-6de6d4ad67498fc0.graph`, `lib/phases/2026-10-15-cos-app/graph/COSA8_other_projects-6b085d7e710eb102.graph`, `lib/phases/2026-10-15-cos-app/graph/COSA9_idearium_sync-4e2d0d6d0315ae08.graph`

#### `lib/phases/2026-10-15-cos-app/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-15-cos-app/graph/_superseded/COSA14_versionium_record-19b95401bebec01f.graph`, `lib/phases/2026-10-15-cos-app/graph/_superseded/COSA8_other_projects-5f67a6ff59ecd341.graph`, `lib/phases/2026-10-15-cos-app/graph/_superseded/COSA9_idearium_sync-ddd57d8b3fb336bf.graph`

#### `lib/phases/2026-10-15-fiverr-ledger/`

3 other file(s).

- other: `lib/phases/2026-10-15-fiverr-ledger/PF0_the_ledger.phase`, `lib/phases/2026-10-15-fiverr-ledger/PF1_the_sources.phase`, `lib/phases/2026-10-15-fiverr-ledger/PF2_the_slots_into_a_gig.phase`

#### `lib/phases/2026-10-15-fiverr-ledger/graph/`

3 other file(s).

- other: `lib/phases/2026-10-15-fiverr-ledger/graph/PF0_the_ledger-b01d7279d317b77b.graph`, `lib/phases/2026-10-15-fiverr-ledger/graph/PF1_the_sources-28198a8912efefda.graph`, `lib/phases/2026-10-15-fiverr-ledger/graph/PF2_the_slots_into_a_gig-6abf349983e78cdf.graph`

#### `lib/phases/2026-10-15-fiverr-ledger/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-15-fiverr-ledger/graph/_superseded/PF0_the_ledger-a4583a7c88b46cd6.graph`, `lib/phases/2026-10-15-fiverr-ledger/graph/_superseded/PF1_the_sources-e60ed3365a0a2cec.graph`

#### `lib/phases/2026-10-15-gate-held-work/`

11 other file(s).

- other: `lib/phases/2026-10-15-gate-held-work/GW10_the_listener_knows_what_to_hear.phase`, `lib/phases/2026-10-15-gate-held-work/GW15_every_file_tested.phase`, `lib/phases/2026-10-15-gate-held-work/GW16_parallel_branches_benchmark.phase`, `lib/phases/2026-10-15-gate-held-work/GW18_debug_by_bisect.phase`, `lib/phases/2026-10-15-gate-held-work/GW22_find_before_generate.phase`, `lib/phases/2026-10-15-gate-held-work/GW2_the_run_follows_the_gate.phase`, `lib/phases/2026-10-15-gate-held-work/GW3_a_contract_is_traced.phase`, `lib/phases/2026-10-15-gate-held-work/GW5_agents_are_copilot.phase`, `lib/phases/2026-10-15-gate-held-work/GW6_the_intelligence_system_on_every_gate.phase`, `lib/phases/2026-10-15-gate-held-work/GW7_failure_macro_and_rewind.phase`, `lib/phases/2026-10-15-gate-held-work/GW8_causal_graph_and_failure_mode_field.phase`

#### `lib/phases/2026-10-15-gate-held-work/graph/`

11 other file(s).

- other: `lib/phases/2026-10-15-gate-held-work/graph/GW10_the_listener_knows_what_to_hear-6b396a22218cce0a.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW15_every_file_tested-01a6f0bce2e5893d.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW16_parallel_branches_benchmark-7496bd8f1af2a364.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW18_debug_by_bisect-356417f6dfb2bb3d.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW22_find_before_generate-0d881b61d2b990e3.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW2_the_run_follows_the_gate-30061c05b767af4f.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW3_a_contract_is_traced-c12c67f35dae6aa5.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW5_agents_are_copilot-a8082de2026469af.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW6_the_intelligence_system_on_every_gate-88688bb77b7d9ade.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW7_failure_macro_and_rewind-9ea220d322030fc4.graph`, `lib/phases/2026-10-15-gate-held-work/graph/GW8_causal_graph_and_failure_mode_field-663a3a1b6c41b6e9.graph`

#### `lib/phases/2026-10-15-gate-held-work/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-10-15-gate-held-work/graph/_superseded/GW10_the_listener_knows_what_to_hear-539f9afb9e5ba54e.graph`, `lib/phases/2026-10-15-gate-held-work/graph/_superseded/GW22_find_before_generate-ebd47dffa0a8bc56.graph`, `lib/phases/2026-10-15-gate-held-work/graph/_superseded/GW2_the_run_follows_the_gate-8f78d99aa885a501.graph`, `lib/phases/2026-10-15-gate-held-work/graph/_superseded/GW3_a_contract_is_traced-7ee6767772d2310d.graph`, `lib/phases/2026-10-15-gate-held-work/graph/_superseded/GW5_agents_are_copilot-6b97cd0bef25edcb.graph`

#### `lib/phases/2026-10-15-macro-node-recording/`

2 other file(s).

- other: `lib/phases/2026-10-15-macro-node-recording/MR10_capabilities_as_steps.phase`, `lib/phases/2026-10-15-macro-node-recording/MR14_tasks_and_mesh_spec.phase`

#### `lib/phases/2026-10-15-macro-node-recording/graph/`

2 other file(s).

- other: `lib/phases/2026-10-15-macro-node-recording/graph/MR10_capabilities_as_steps-7fc5751ee0244562.graph`, `lib/phases/2026-10-15-macro-node-recording/graph/MR14_tasks_and_mesh_spec-4cb900f7984eca36.graph`

#### `lib/phases/2026-10-15-one-contract-raid-releases/`

5 other file(s).

- other: `lib/phases/2026-10-15-one-contract-raid-releases/AT1_atlases_and_specs_from_releases.phase`, `lib/phases/2026-10-15-one-contract-raid-releases/FR1_failure_reports.phase`, `lib/phases/2026-10-15-one-contract-raid-releases/GS1_a_snapshot_per_gate_rewind_and_compare.phase`, `lib/phases/2026-10-15-one-contract-raid-releases/RN2_changelog_from_the_commits.phase`, `lib/phases/2026-10-15-one-contract-raid-releases/ST1_stability_checks.phase`

#### `lib/phases/2026-10-15-one-contract-raid-releases/graph/`

5 other file(s).

- other: `lib/phases/2026-10-15-one-contract-raid-releases/graph/AT1_atlases_and_specs_from_releases-dc5b8827fb668ce2.graph`, `lib/phases/2026-10-15-one-contract-raid-releases/graph/FR1_failure_reports-acebeb68cae65d7f.graph`, `lib/phases/2026-10-15-one-contract-raid-releases/graph/GS1_a_snapshot_per_gate_rewind_and_compare-019413470fb371c3.graph`, `lib/phases/2026-10-15-one-contract-raid-releases/graph/RN2_changelog_from_the_commits-1e0e93783f21a1c4.graph`, `lib/phases/2026-10-15-one-contract-raid-releases/graph/ST1_stability_checks-0118bd496c3c6292.graph`

#### `lib/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/FR1_failure_reports-dafc215b29905071.graph`, `lib/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/ST1_stability_checks-73c9424926bf802e.graph`

#### `lib/phases/2026-10-15-personal-chat-import/`

2 other file(s).

- other: `lib/phases/2026-10-15-personal-chat-import/PI1_the_importer.phase`, `lib/phases/2026-10-15-personal-chat-import/PI3_the_intelligence_pass.phase`

#### `lib/phases/2026-10-15-personal-chat-import/graph/`

2 other file(s).

- other: `lib/phases/2026-10-15-personal-chat-import/graph/PI1_the_importer-c54409bf4a46b62d.graph`, `lib/phases/2026-10-15-personal-chat-import/graph/PI3_the_intelligence_pass-081c0303b5cee64e.graph`

#### `lib/phases/2026-10-15-personal-chat-import/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-15-personal-chat-import/graph/_superseded/PI1_the_importer-4811bb5810fcbe4d.graph`

#### `lib/phases/2026-10-15-spec-foundation-model/`

1 other file(s).

- other: `lib/phases/2026-10-15-spec-foundation-model/SF4_the_listener.phase`

#### `lib/phases/2026-10-15-spec-foundation-model/graph/`

1 other file(s).

- other: `lib/phases/2026-10-15-spec-foundation-model/graph/SF4_the_listener-12450e757df15576.graph`

#### `lib/phases/2026-10-15-spec-foundation-model/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-15-spec-foundation-model/graph/_superseded/SF4_the_listener-6ccc005b3e35e04e.graph`

#### `lib/phases/2026-10-15-warp-builds-and-spec-framework/`

10 other file(s).

- other: `lib/phases/2026-10-15-warp-builds-and-spec-framework/IS1_intent_settings_per_repo.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/MP1_nexus_maps_every_phase.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/MP3_builds_get_the_mapped_context.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF1_intent_blocks.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF2_spec_framework_block.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF3_collect_the_spec.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/SF4_compile_on_collect.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/WB0_census.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/WB1_warp_at_the_rung.phase`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/WB2_raid_bricks_and_officiator_through_warp.phase`

#### `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/`

10 other file(s).

- other: `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/IS1_intent_settings_per_repo-6e793c69f386d367.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP1_nexus_maps_every_phase-cfef434e859393c2.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP3_builds_get_the_mapped_context-ea105d5b59c94356.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF1_intent_blocks-a8afa92a489433cd.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF2_spec_framework_block-a1e1183dc93e69cb.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF3_collect_the_spec-2752c0d140f6df49.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/SF4_compile_on_collect-f5d0bc843f18391f.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/WB0_census-9a044eef08fa5b1b.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/WB1_warp_at_the_rung-9b6591af8b02377f.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/WB2_raid_bricks_and_officiator_through_warp-644d05cd2efb78bb.graph`

#### `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/`

6 other file(s).

- other: `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/MP1_nexus_maps_every_phase-38eb3640a0730199.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/MP3_builds_get_the_mapped_context-a8ea1fb30dbfd70b.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/SF2_spec_framework_block-f3369f9f0bb0ba75.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/SF4_compile_on_collect-aadcbf4561eb1533.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/WB1_warp_at_the_rung-60eb99e47c8e797a.graph`, `lib/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/WB2_raid_bricks_and_officiator_through_warp-c5988e845eadf750.graph`

#### `lib/phases/2026-10-16-agent-work-funnel/`

4 other file(s).

- other: `lib/phases/2026-10-16-agent-work-funnel/FN0_the_funnel_as_data.phase`, `lib/phases/2026-10-16-agent-work-funnel/FN1_every_door_goes_through_it.phase`, `lib/phases/2026-10-16-agent-work-funnel/FN2_what_is_missing_is_made_first.phase`, `lib/phases/2026-10-16-agent-work-funnel/FN3_every_answer_a_node.phase`

#### `lib/phases/2026-10-16-agent-work-funnel/graph/`

4 other file(s).

- other: `lib/phases/2026-10-16-agent-work-funnel/graph/FN0_the_funnel_as_data-36bff935bc611507.graph`, `lib/phases/2026-10-16-agent-work-funnel/graph/FN1_every_door_goes_through_it-3eaa762c5d3deb20.graph`, `lib/phases/2026-10-16-agent-work-funnel/graph/FN2_what_is_missing_is_made_first-c67ffe774b892ab0.graph`, `lib/phases/2026-10-16-agent-work-funnel/graph/FN3_every_answer_a_node-f0fd6a276c7d1d69.graph`

#### `lib/phases/2026-10-16-agent-work-funnel/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-16-agent-work-funnel/graph/_superseded/FN1_every_door_goes_through_it-1841c94aa41f3eef.graph`, `lib/phases/2026-10-16-agent-work-funnel/graph/_superseded/FN2_what_is_missing_is_made_first-94e1791ebf408132.graph`

#### `lib/phases/2026-10-16-canvas-compartments/`

2 other file(s).

- other: `lib/phases/2026-10-16-canvas-compartments/CN3_nested_compartments.phase`, `lib/phases/2026-10-16-canvas-compartments/CN6_canvas_screen.phase`

#### `lib/phases/2026-10-16-canvas-compartments/graph/`

2 other file(s).

- other: `lib/phases/2026-10-16-canvas-compartments/graph/CN3_nested_compartments-a9434777c262960b.graph`, `lib/phases/2026-10-16-canvas-compartments/graph/CN6_canvas_screen-a122a921c355bbd5.graph`

#### `lib/phases/2026-10-16-canvas-compartments/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-16-canvas-compartments/graph/_superseded/CN3_nested_compartments-567d60a0f20626fb.graph`

#### `lib/phases/2026-10-16-code-tab-rebuild/`

6 other file(s).

- other: `lib/phases/2026-10-16-code-tab-rebuild/DK1_procedures_backend.phase`, `lib/phases/2026-10-16-code-tab-rebuild/TB1_read_model_per_tab.phase`, `lib/phases/2026-10-16-code-tab-rebuild/TB3a_tool_calls_saved.phase`, `lib/phases/2026-10-16-code-tab-rebuild/TB4_reuse_responses.phase`, `lib/phases/2026-10-16-code-tab-rebuild/TB7d_node_controls.phase`, `lib/phases/2026-10-16-code-tab-rebuild/TB8_proof_and_wiring.phase`

#### `lib/phases/2026-10-16-code-tab-rebuild/graph/`

6 other file(s).

- other: `lib/phases/2026-10-16-code-tab-rebuild/graph/DK1_procedures_backend-74a55268895b8cd2.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/TB1_read_model_per_tab-323a33f7acc6e516.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/TB3a_tool_calls_saved-7ee37636c61d4d6c.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/TB4_reuse_responses-cf2073506d98196c.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/TB7d_node_controls-4f2be3f82aed75ef.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/TB8_proof_and_wiring-539823567f6a9924.graph`

#### `lib/phases/2026-10-16-code-tab-rebuild/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-16-code-tab-rebuild/graph/_superseded/DK1_procedures_backend-8caea4d0996d7b22.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/_superseded/TB1_read_model_per_tab-28d795fe5701a47d.graph`, `lib/phases/2026-10-16-code-tab-rebuild/graph/_superseded/TB8_proof_and_wiring-bea6b955a3f4631e.graph`

#### `lib/phases/2026-10-16-cos-console/`

2 other file(s).

- other: `lib/phases/2026-10-16-cos-console/CON5_pane.phase`, `lib/phases/2026-10-16-cos-console/CON8_nexus_server_hook.phase`

#### `lib/phases/2026-10-16-cos-console/graph/`

2 other file(s).

- other: `lib/phases/2026-10-16-cos-console/graph/CON5_pane-8bbaf7e5aa41faf7.graph`, `lib/phases/2026-10-16-cos-console/graph/CON8_nexus_server_hook-d26dbb814f8ec235.graph`

#### `lib/phases/2026-10-16-cos-console/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-16-cos-console/graph/_superseded/CON8_nexus_server_hook-fd911e37cdaf9fee.graph`

#### `lib/phases/2026-10-16-durable-work-timeline/`

5 other file(s).

- other: `lib/phases/2026-10-16-durable-work-timeline/TL1_chunks_land_as_they_arrive.phase`, `lib/phases/2026-10-16-durable-work-timeline/TL2_resume_at_boot.phase`, `lib/phases/2026-10-16-durable-work-timeline/TL3_the_timeline.phase`, `lib/phases/2026-10-16-durable-work-timeline/TL4_rewind_to_a_gate.phase`, `lib/phases/2026-10-16-durable-work-timeline/TL6_proof_and_wiring.phase`

#### `lib/phases/2026-10-16-durable-work-timeline/graph/`

5 other file(s).

- other: `lib/phases/2026-10-16-durable-work-timeline/graph/TL1_chunks_land_as_they_arrive-2108bf32049cc362.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/TL2_resume_at_boot-e9e923dadb4d62be.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/TL3_the_timeline-1d29c622ebe0f863.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/TL4_rewind_to_a_gate-218c037d5e3cb485.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/TL6_proof_and_wiring-5918341c06decdcb.graph`

#### `lib/phases/2026-10-16-durable-work-timeline/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-10-16-durable-work-timeline/graph/_superseded/TL1_chunks_land_as_they_arrive-477fcfa607154070.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/_superseded/TL2_resume_at_boot-a0f0fae0e4e8a429.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/_superseded/TL3_the_timeline-c61967b5d3fdb797.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/_superseded/TL4_rewind_to_a_gate-1b73172e3db632d6.graph`, `lib/phases/2026-10-16-durable-work-timeline/graph/_superseded/TL6_proof_and_wiring-2b6b52d3b29be7d3.graph`

#### `lib/phases/2026-10-16-eravos-removal/`

3 other file(s).

- other: `lib/phases/2026-10-16-eravos-removal/ER1_delete_the_system.phase`, `lib/phases/2026-10-16-eravos-removal/ER2_unwire_the_platform.phase`, `lib/phases/2026-10-16-eravos-removal/ER3_unwire_the_screens.phase`

#### `lib/phases/2026-10-16-eravos-removal/graph/`

3 other file(s).

- other: `lib/phases/2026-10-16-eravos-removal/graph/ER1_delete_the_system-0d9d70e4497e0c11.graph`, `lib/phases/2026-10-16-eravos-removal/graph/ER2_unwire_the_platform-29c23ca726a65e52.graph`, `lib/phases/2026-10-16-eravos-removal/graph/ER3_unwire_the_screens-efd23783f363d8e1.graph`

#### `lib/phases/2026-10-16-eravos-removal/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-16-eravos-removal/graph/_superseded/ER1_delete_the_system-2d6cbb2fd32f8057.graph`, `lib/phases/2026-10-16-eravos-removal/graph/_superseded/ER2_unwire_the_platform-eccf746a91d275e5.graph`, `lib/phases/2026-10-16-eravos-removal/graph/_superseded/ER3_unwire_the_screens-39401869987f58e9.graph`, `lib/phases/2026-10-16-eravos-removal/graph/_superseded/ER3_unwire_the_screens-b77762163146e22d.graph`

#### `lib/phases/2026-10-16-intent-hat-agent-chain/`

4 other file(s).

- other: `lib/phases/2026-10-16-intent-hat-agent-chain/IH1_intent_nodes_point_at_hats.phase`, `lib/phases/2026-10-16-intent-hat-agent-chain/IH2_agents_bound.phase`, `lib/phases/2026-10-16-intent-hat-agent-chain/IH3_routers_read_the_chain.phase`, `lib/phases/2026-10-16-intent-hat-agent-chain/IH5_proof_and_wiring.phase`

#### `lib/phases/2026-10-16-intent-hat-agent-chain/graph/`

4 other file(s).

- other: `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH1_intent_nodes_point_at_hats-7a8dccf49acfd507.graph`, `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH2_agents_bound-c734fd5092d03e43.graph`, `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH3_routers_read_the_chain-7b604cd3c79ab423.graph`, `lib/phases/2026-10-16-intent-hat-agent-chain/graph/IH5_proof_and_wiring-76e781a60ac0adce.graph`

#### `lib/phases/2026-10-16-intent-hat-agent-chain/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-16-intent-hat-agent-chain/graph/_superseded/IH5_proof_and_wiring-0a8286e69167fdbd.graph`

#### `lib/phases/2026-10-16-mobile-compartments/`

1 other file(s).

- other: `lib/phases/2026-10-16-mobile-compartments/MB5_language_checks.phase`

#### `lib/phases/2026-10-16-mobile-compartments/graph/`

1 other file(s).

- other: `lib/phases/2026-10-16-mobile-compartments/graph/MB5_language_checks-70fbfe06ce0c648e.graph`

#### `lib/phases/2026-10-16-mobile-compartments/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-16-mobile-compartments/graph/_superseded/MB5_language_checks-a070742238698d85.graph`

#### `lib/phases/2026-10-16-nexus-git-sync/`

1 other file(s).

- other: `lib/phases/2026-10-16-nexus-git-sync/GS5_release_alignment.phase`

#### `lib/phases/2026-10-16-nexus-git-sync/graph/`

1 other file(s).

- other: `lib/phases/2026-10-16-nexus-git-sync/graph/GS5_release_alignment-2a70f909e495723d.graph`

#### `lib/phases/2026-10-16-nexus-git-sync/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-16-nexus-git-sync/graph/_superseded/GS5_release_alignment-9cea81dfaa362267.graph`

#### `lib/phases/2026-10-16-plan-sidebar/`

1 other file(s).

- other: `lib/phases/2026-10-16-plan-sidebar/PS1_context_recorded.phase`

#### `lib/phases/2026-10-16-plan-sidebar/graph/`

1 other file(s).

- other: `lib/phases/2026-10-16-plan-sidebar/graph/PS1_context_recorded-d021d698da4d1307.graph`

#### `lib/phases/2026-10-16-plan-sidebar/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-16-plan-sidebar/graph/_superseded/PS1_context_recorded-140511f9d8b21da5.graph`

#### `lib/phases/2026-10-16-proposal-evidence/`

4 other file(s).

- other: `lib/phases/2026-10-16-proposal-evidence/PE1_test_map.phase`, `lib/phases/2026-10-16-proposal-evidence/PE2_evidence.phase`, `lib/phases/2026-10-16-proposal-evidence/PE3_wired_and_gated.phase`, `lib/phases/2026-10-16-proposal-evidence/PE9_infrastructure_failures.phase`

#### `lib/phases/2026-10-16-proposal-evidence/graph/`

4 other file(s).

- other: `lib/phases/2026-10-16-proposal-evidence/graph/PE1_test_map-ae196f649f98e2e7.graph`, `lib/phases/2026-10-16-proposal-evidence/graph/PE2_evidence-87adde4d74c5c418.graph`, `lib/phases/2026-10-16-proposal-evidence/graph/PE3_wired_and_gated-c822ef9e98c403c2.graph`, `lib/phases/2026-10-16-proposal-evidence/graph/PE9_infrastructure_failures-fbe72f5dec0e8cfb.graph`

#### `lib/phases/2026-10-16-reject-learn-retry/`

2 other file(s).

- other: `lib/phases/2026-10-16-reject-learn-retry/RL1_classify_the_rejection.phase`, `lib/phases/2026-10-16-reject-learn-retry/RL3_stop_the_regression_before_it_reaches_him.phase`

#### `lib/phases/2026-10-16-reject-learn-retry/graph/`

2 other file(s).

- other: `lib/phases/2026-10-16-reject-learn-retry/graph/RL1_classify_the_rejection-bdf4c489a42b7497.graph`, `lib/phases/2026-10-16-reject-learn-retry/graph/RL3_stop_the_regression_before_it_reaches_him-3cdd61da21e0b3a9.graph`

#### `lib/phases/2026-10-16-repo-carve/`

12 other file(s).

- other: `lib/phases/2026-10-16-repo-carve/CV2_untangle_with_rf0.phase`, `lib/phases/2026-10-16-repo-carve/FR10_stop_the_ladder.phase`, `lib/phases/2026-10-16-repo-carve/FR1_one_record_per_change.phase`, `lib/phases/2026-10-16-repo-carve/FR2_tested_before_it_lands.phase`, `lib/phases/2026-10-16-repo-carve/FR3_undo_any_change.phase`, `lib/phases/2026-10-16-repo-carve/FR4_stands_alone.phase`, `lib/phases/2026-10-16-repo-carve/FR5_the_demo.phase`, `lib/phases/2026-10-16-repo-carve/FR5_the_demo_note.phase`, `lib/phases/2026-10-16-repo-carve/FR6_flight_data.phase`, `lib/phases/2026-10-16-repo-carve/FR7_the_causal_record.phase`, `lib/phases/2026-10-16-repo-carve/FR8_branches_for_benchmarks.phase`, `lib/phases/2026-10-16-repo-carve/PB1_the_product_boundary.phase`

#### `lib/phases/2026-10-16-repo-carve/graph/`

12 other file(s).

- other: `lib/phases/2026-10-16-repo-carve/graph/CV2_untangle_with_rf0-12a1eb1568c475ca.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR10_stop_the_ladder-fdadb47c70248a9e.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR1_one_record_per_change-969ecbecb227f561.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR2_tested_before_it_lands-656f3ff3cd895533.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR3_undo_any_change-c20f74a0da0c1f4c.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR4_stands_alone-7733ba9685bafc07.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR5_the_demo-a03b08442bb825c3.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR5_the_demo_note-ea7ae2e77b8e0485.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR6_flight_data-7725b9de7334f895.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR7_the_causal_record-8bee8dc012336255.graph`, `lib/phases/2026-10-16-repo-carve/graph/FR8_branches_for_benchmarks-802a9c769b0443fa.graph`, `lib/phases/2026-10-16-repo-carve/graph/PB1_the_product_boundary-f8c4cdb01c55ec4e.graph`

#### `lib/phases/2026-10-16-repo-carve/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-16-repo-carve/graph/_superseded/FR2_tested_before_it_lands-53d39bac7d121307.graph`, `lib/phases/2026-10-16-repo-carve/graph/_superseded/FR5_the_demo_note-332d5e981a6108fb.graph`, `lib/phases/2026-10-16-repo-carve/graph/_superseded/FR6_flight_data-05ad1f0362cc7289.graph`, `lib/phases/2026-10-16-repo-carve/graph/_superseded/PB1_the_product_boundary-cb390adf322a5601.graph`

#### `lib/phases/2026-10-17-debugging-product/`

3 other file(s).

- other: `lib/phases/2026-10-17-debugging-product/DP11_the_product_boundary.phase`, `lib/phases/2026-10-17-debugging-product/DP2_one_gap_door.phase`, `lib/phases/2026-10-17-debugging-product/GD1_gaps_from_the_graph_for_any_repo.phase`

#### `lib/phases/2026-10-17-debugging-product/graph/`

3 other file(s).

- other: `lib/phases/2026-10-17-debugging-product/graph/DP11_the_product_boundary-df7c7dcdd1ab6a91.graph`, `lib/phases/2026-10-17-debugging-product/graph/DP2_one_gap_door-2ff9716abc657ff5.graph`, `lib/phases/2026-10-17-debugging-product/graph/GD1_gaps_from_the_graph_for_any_repo-0fec63ba9c0f26c8.graph`

#### `lib/phases/2026-10-17-debugging-product/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-17-debugging-product/graph/_superseded/DP11_the_product_boundary-899986b367f9bf2d.graph`

#### `lib/phases/2026-10-17-failure-mode-report/`

4 other file(s).

- other: `lib/phases/2026-10-17-failure-mode-report/FMR11_import_into_any_test_env.phase`, `lib/phases/2026-10-17-failure-mode-report/FMR1_every_ledger_into_rfr2.phase`, `lib/phases/2026-10-17-failure-mode-report/FMR2_every_failure_reaches_the_record.phase`, `lib/phases/2026-10-17-failure-mode-report/FMR7_a_fix_proven_by_its_macro.phase`

#### `lib/phases/2026-10-17-failure-mode-report/graph/`

4 other file(s).

- other: `lib/phases/2026-10-17-failure-mode-report/graph/FMR11_import_into_any_test_env-0df836d8d16caf50.graph`, `lib/phases/2026-10-17-failure-mode-report/graph/FMR1_every_ledger_into_rfr2-d672a060fcb71369.graph`, `lib/phases/2026-10-17-failure-mode-report/graph/FMR2_every_failure_reaches_the_record-9ea6b89bd6db29e1.graph`, `lib/phases/2026-10-17-failure-mode-report/graph/FMR7_a_fix_proven_by_its_macro-6e7c8d81f12d75e7.graph`

#### `lib/phases/2026-10-17-failure-mode-report/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-17-failure-mode-report/graph/_superseded/FMR11_import_into_any_test_env-53ed35ed7a5f4718.graph`, `lib/phases/2026-10-17-failure-mode-report/graph/_superseded/FMR11_import_into_any_test_env-b5e54d1c4aa8322b.graph`, `lib/phases/2026-10-17-failure-mode-report/graph/_superseded/FMR2_every_failure_reaches_the_record-7d5ad1479d3e7570.graph`

#### `lib/phases/2026-10-17-infrastructure-migration/`

5 other file(s).

- other: `lib/phases/2026-10-17-infrastructure-migration/IM1_the_shape_census_as_a_command.phase`, `lib/phases/2026-10-17-infrastructure-migration/IM2_clean_the_redundant.phase`, `lib/phases/2026-10-17-infrastructure-migration/IM3_wire_what_exists.phase`, `lib/phases/2026-10-17-infrastructure-migration/IM5_each_system_to_the_template.phase`, `lib/phases/2026-10-17-infrastructure-migration/IM7_the_ui_on_the_registry.phase`

#### `lib/phases/2026-10-17-infrastructure-migration/graph/`

5 other file(s).

- other: `lib/phases/2026-10-17-infrastructure-migration/graph/IM1_the_shape_census_as_a_command-6f863dcca69527f7.graph`, `lib/phases/2026-10-17-infrastructure-migration/graph/IM2_clean_the_redundant-072ba52c90e90175.graph`, `lib/phases/2026-10-17-infrastructure-migration/graph/IM3_wire_what_exists-44f254336361884c.graph`, `lib/phases/2026-10-17-infrastructure-migration/graph/IM5_each_system_to_the_template-aebf66ab8872db55.graph`, `lib/phases/2026-10-17-infrastructure-migration/graph/IM7_the_ui_on_the_registry-32a1f209930e23a0.graph`

#### `lib/phases/2026-10-17-infrastructure-migration/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-17-infrastructure-migration/graph/_superseded/IM1_the_shape_census_as_a_command-3abb3b64d2b71c76.graph`, `lib/phases/2026-10-17-infrastructure-migration/graph/_superseded/IM1_the_shape_census_as_a_command-6d5ddff3294636fc.graph`, `lib/phases/2026-10-17-infrastructure-migration/graph/_superseded/IM7_the_ui_on_the_registry-a6263831c386b825.graph`

#### `lib/phases/2026-10-17-pieces-not-order/`

2 other file(s).

- other: `lib/phases/2026-10-17-pieces-not-order/PC1_the_point_first.phase`, `lib/phases/2026-10-17-pieces-not-order/PC4_a_procedure_per_kind.phase`

#### `lib/phases/2026-10-17-pieces-not-order/graph/`

2 other file(s).

- other: `lib/phases/2026-10-17-pieces-not-order/graph/PC1_the_point_first-9eca658277fa4aeb.graph`, `lib/phases/2026-10-17-pieces-not-order/graph/PC4_a_procedure_per_kind-6ad550aea45b1805.graph`

#### `lib/phases/2026-10-17-pieces-not-order/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-17-pieces-not-order/graph/_superseded/PC1_the_point_first-c775e908897ae8af.graph`

#### `lib/phases/2026-10-17-system-drawbridge/`

15 other file(s).

- other: 15 files (.phase)

#### `lib/phases/2026-10-17-system-drawbridge/graph/`

15 other file(s).

- other: 15 files (.graph)

#### `lib/phases/2026-10-17-system-drawbridge/graph/_superseded/`

13 other file(s).

- other: 13 files (.graph)

#### `lib/phases/2026-10-18-compartment-environment/`

1 other file(s).

- other: `lib/phases/2026-10-18-compartment-environment/CE3_the_handshake.phase`

#### `lib/phases/2026-10-18-compartment-environment/graph/`

1 other file(s).

- other: `lib/phases/2026-10-18-compartment-environment/graph/CE3_the_handshake-aa79fe09a96f799d.graph`

#### `lib/phases/2026-10-18-debugging-product/`

6 other file(s).

- other: `lib/phases/2026-10-18-debugging-product/DBG1_the_key.phase`, `lib/phases/2026-10-18-debugging-product/DBG2_the_case.phase`, `lib/phases/2026-10-18-debugging-product/DBG3_deviation_and_friction_per_run.phase`, `lib/phases/2026-10-18-debugging-product/DBG4_dependency_gaps.phase`, `lib/phases/2026-10-18-debugging-product/DBG6_cases_crystallize.phase`, `lib/phases/2026-10-18-debugging-product/DBG8_in_the_product.phase`

#### `lib/phases/2026-10-18-debugging-product/graph/`

6 other file(s).

- other: `lib/phases/2026-10-18-debugging-product/graph/DBG1_the_key-6716c6c874b49d8e.graph`, `lib/phases/2026-10-18-debugging-product/graph/DBG2_the_case-b3e461c3f64f6365.graph`, `lib/phases/2026-10-18-debugging-product/graph/DBG3_deviation_and_friction_per_run-3cdc3022f02a4874.graph`, `lib/phases/2026-10-18-debugging-product/graph/DBG4_dependency_gaps-1cbb2701c89b4f58.graph`, `lib/phases/2026-10-18-debugging-product/graph/DBG6_cases_crystallize-1a3964410566d4bd.graph`, `lib/phases/2026-10-18-debugging-product/graph/DBG8_in_the_product-fb23f2c646765085.graph`

#### `lib/phases/2026-10-18-debugging-product/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-18-debugging-product/graph/_superseded/DBG1_the_key-e4c6f44f796d9405.graph`, `lib/phases/2026-10-18-debugging-product/graph/_superseded/DBG2_the_case-1fa8c76c4772fdd9.graph`, `lib/phases/2026-10-18-debugging-product/graph/_superseded/DBG4_dependency_gaps-958076dca62f887c.graph`, `lib/phases/2026-10-18-debugging-product/graph/_superseded/DBG6_cases_crystallize-84f9d57bd845faf7.graph`

#### `lib/phases/2026-10-18-gate-memory/`

2 other file(s).

- other: `lib/phases/2026-10-18-gate-memory/GM5_the_context_ladder.phase`, `lib/phases/2026-10-18-gate-memory/GM6_crystallized_from_what_was_approved.phase`

#### `lib/phases/2026-10-18-gate-memory/graph/`

2 other file(s).

- other: `lib/phases/2026-10-18-gate-memory/graph/GM5_the_context_ladder-2a7c6378cda50964.graph`, `lib/phases/2026-10-18-gate-memory/graph/GM6_crystallized_from_what_was_approved-9f08175e8bc52a55.graph`

#### `lib/phases/2026-10-18-gate-memory/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-18-gate-memory/graph/_superseded/GM5_the_context_ladder-d71138f7d24e34f1.graph`, `lib/phases/2026-10-18-gate-memory/graph/_superseded/GM6_crystallized_from_what_was_approved-6f4f97b6125f3591.graph`

#### `lib/phases/2026-10-18-gating-census/`

4 other file(s).

- other: `lib/phases/2026-10-18-gating-census/GC0_the_census.phase`, `lib/phases/2026-10-18-gating-census/GC1_layer_one.phase`, `lib/phases/2026-10-18-gating-census/L1_primitives_no_decision.phase`, `lib/phases/2026-10-18-gating-census/L2_one_of_each.phase`

#### `lib/phases/2026-10-18-gating-census/graph/`

4 other file(s).

- other: `lib/phases/2026-10-18-gating-census/graph/GC0_the_census-46d5041e29861a47.graph`, `lib/phases/2026-10-18-gating-census/graph/GC1_layer_one-3f15fb69b24b7b4f.graph`, `lib/phases/2026-10-18-gating-census/graph/L1_primitives_no_decision-af2037ec4c7c7ccd.graph`, `lib/phases/2026-10-18-gating-census/graph/L2_one_of_each-15bb418b41b19b2a.graph`

#### `lib/phases/2026-10-18-gating-census/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-18-gating-census/graph/_superseded/GC0_the_census-6e90f2f13b83fa5b.graph`, `lib/phases/2026-10-18-gating-census/graph/_superseded/GC1_layer_one-c6818f0350f0d936.graph`, `lib/phases/2026-10-18-gating-census/graph/_superseded/L1_primitives_no_decision-0a03918617e67a44.graph`

#### `lib/phases/2026-10-19-gate-quality-checks/`

2 other file(s).

- other: `lib/phases/2026-10-19-gate-quality-checks/GQ1_quality_stream.phase`, `lib/phases/2026-10-19-gate-quality-checks/GQ3_brick_tests.phase`

#### `lib/phases/2026-10-19-gate-quality-checks/graph/`

2 other file(s).

- other: `lib/phases/2026-10-19-gate-quality-checks/graph/GQ1_quality_stream-78a010f02db9b5e2.graph`, `lib/phases/2026-10-19-gate-quality-checks/graph/GQ3_brick_tests-7bb3b9e18cbc76b9.graph`

#### `lib/phases/2026-10-19-idearium-control/`

5 other file(s).

- other: `lib/phases/2026-10-19-idearium-control/IM2_promote_to_phase.phase`, `lib/phases/2026-10-19-idearium-control/IM3_ideas_mapped_to_nexus.phase`, `lib/phases/2026-10-19-idearium-control/IX1_everything_linked.phase`, `lib/phases/2026-10-19-idearium-control/NM1_one_name_per_file.phase`, `lib/phases/2026-10-19-idearium-control/VS2_diff_only_backups.phase`

#### `lib/phases/2026-10-19-idearium-control/graph/`

5 other file(s).

- other: `lib/phases/2026-10-19-idearium-control/graph/IM2_promote_to_phase-3d3122e110bd5fcd.graph`, `lib/phases/2026-10-19-idearium-control/graph/IM3_ideas_mapped_to_nexus-5e5195c7fd8a967b.graph`, `lib/phases/2026-10-19-idearium-control/graph/IX1_everything_linked-936103a671e951e6.graph`, `lib/phases/2026-10-19-idearium-control/graph/NM1_one_name_per_file-4139029cd3912f57.graph`, `lib/phases/2026-10-19-idearium-control/graph/VS2_diff_only_backups-536284767e3a671e.graph`

#### `lib/phases/2026-10-19-idearium-control/graph/_superseded/`

3 other file(s).

- other: `lib/phases/2026-10-19-idearium-control/graph/_superseded/IM2_promote_to_phase-1569487c0a2437d9.graph`, `lib/phases/2026-10-19-idearium-control/graph/_superseded/IM3_ideas_mapped_to_nexus-4ab9902894ad0c86.graph`, `lib/phases/2026-10-19-idearium-control/graph/_superseded/IX1_everything_linked-9bb44518c22de6ae.graph`

#### `lib/phases/2026-10-19-infrastructure-spine/`

21 other file(s).

- other: 21 files (.phase)

#### `lib/phases/2026-10-19-infrastructure-spine/graph/`

21 other file(s).

- other: 21 files (.graph)

#### `lib/phases/2026-10-19-infrastructure-spine/graph/_superseded/`

14 other file(s).

- other: 14 files (.graph)

#### `lib/phases/2026-10-19-pipeline-root-causes/`

18 other file(s).

- other: 18 files (.phase)

#### `lib/phases/2026-10-19-pipeline-root-causes/graph/`

18 other file(s).

- other: 18 files (.graph)

#### `lib/phases/2026-10-19-pipeline-root-causes/graph/_superseded/`

17 other file(s).

- other: 17 files (.graph)

#### `lib/phases/2026-10-19-solid-build-foundation/`

6 other file(s).

- other: `lib/phases/2026-10-19-solid-build-foundation/AB1_autobuild_loop_and_resume.phase`, `lib/phases/2026-10-19-solid-build-foundation/AB2_hat_aware_ladder.phase`, `lib/phases/2026-10-19-solid-build-foundation/CR1_project_registry_spine.phase`, `lib/phases/2026-10-19-solid-build-foundation/GQ1_quality_stream.phase`, `lib/phases/2026-10-19-solid-build-foundation/GQ3_brick_tests.phase`, `lib/phases/2026-10-19-solid-build-foundation/MF1_model_fit_routing.phase`

#### `lib/phases/2026-10-19-solid-build-foundation/graph/`

6 other file(s).

- other: `lib/phases/2026-10-19-solid-build-foundation/graph/AB1_autobuild_loop_and_resume-8bebaae7ef8ec3d2.graph`, `lib/phases/2026-10-19-solid-build-foundation/graph/AB2_hat_aware_ladder-ad9fe7f865a988d6.graph`, `lib/phases/2026-10-19-solid-build-foundation/graph/CR1_project_registry_spine-ad00a0602536365c.graph`, `lib/phases/2026-10-19-solid-build-foundation/graph/GQ1_quality_stream-85b1ad483b041f8f.graph`, `lib/phases/2026-10-19-solid-build-foundation/graph/GQ3_brick_tests-3769b79e631ed6e6.graph`, `lib/phases/2026-10-19-solid-build-foundation/graph/MF1_model_fit_routing-b9bc0c93e9f9d779.graph`

#### `lib/phases/2026-10-19-solid-build-foundation/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-19-solid-build-foundation/graph/_superseded/AB1_autobuild_loop_and_resume-3d44db3a3fb6e381.graph`, `lib/phases/2026-10-19-solid-build-foundation/graph/_superseded/MF1_model_fit_routing-933ae7ea59a963fb.graph`

#### `lib/phases/2026-10-19-upload-intent-and-page-map/`

5 other file(s).

- other: `lib/phases/2026-10-19-upload-intent-and-page-map/PM6_nerve_feel.phase`, `lib/phases/2026-10-19-upload-intent-and-page-map/UP1_placement_tool.phase`, `lib/phases/2026-10-19-upload-intent-and-page-map/UP2_learned_placements.phase`, `lib/phases/2026-10-19-upload-intent-and-page-map/UP5_registry_wires_on_apply.phase`, `lib/phases/2026-10-19-upload-intent-and-page-map/UP6_model_for_the_unplaced.phase`

#### `lib/phases/2026-10-19-upload-intent-and-page-map/graph/`

5 other file(s).

- other: `lib/phases/2026-10-19-upload-intent-and-page-map/graph/PM6_nerve_feel-e54f68895efaf29e.graph`, `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP1_placement_tool-166fb192867b3804.graph`, `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP2_learned_placements-ce0e81c67e6b36ce.graph`, `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP5_registry_wires_on_apply-ebe8af443a1f3079.graph`, `lib/phases/2026-10-19-upload-intent-and-page-map/graph/UP6_model_for_the_unplaced-76cb86273b1fc6d5.graph`

#### `lib/phases/2026-10-19-upload-intent-and-page-map/graph/_superseded/`

1 other file(s).

- other: `lib/phases/2026-10-19-upload-intent-and-page-map/graph/_superseded/PM6_nerve_feel-539b63300c679ad5.graph`

#### `lib/phases/2026-10-20-belief-loop/`

13 other file(s).

- other: 13 files (.phase)

#### `lib/phases/2026-10-20-belief-loop/graph/`

13 other file(s).

- other: 13 files (.graph)

#### `lib/phases/2026-10-20-belief-loop/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-20-belief-loop/graph/_superseded/AV1_adversarial_review-4309464edd8b01e4.graph`, `lib/phases/2026-10-20-belief-loop/graph/_superseded/CY0_one_crystal_schema-6952ccb2f43c4c04.graph`

#### `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/`

14 other file(s).

- other: 14 files (.phase)

#### `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/`

14 other file(s).

- other: 14 files (.graph)

#### `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/`

4 other file(s).

- other: `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GW2_gates_at_every_level-612136b666d5ea1e.graph`, `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GW2_gates_at_every_level-b10b437f7e757cde.graph`, `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/PS1_phase_specs-3ff2290d219d6c7c.graph`, `lib/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/PS1_phase_specs-77e8fe5e41ea6ccc.graph`

#### `lib/phases/2026-10-21-approval-chain/`

2 other file(s).

- other: `lib/phases/2026-10-21-approval-chain/APV1_change_entry.phase`, `lib/phases/2026-10-21-approval-chain/APV2_commit_carries_it.phase`

#### `lib/phases/2026-10-21-approval-chain/graph/`

2 other file(s).

- other: `lib/phases/2026-10-21-approval-chain/graph/APV1_change_entry-84ec3e73d291c157.graph`, `lib/phases/2026-10-21-approval-chain/graph/APV2_commit_carries_it-ddcc8eb6b64febdc.graph`

#### `lib/phases/2026-10-21-approval-chain/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-21-approval-chain/graph/_superseded/APV1_change_entry-ac405a9ed94958e7.graph`, `lib/phases/2026-10-21-approval-chain/graph/_superseded/APV2_commit_carries_it-49cfd8f7769f1070.graph`

#### `lib/phases/2026-10-21-brainos-into-idearium/`

3 other file(s).

- other: `lib/phases/2026-10-21-brainos-into-idearium/BX1_census.phase`, `lib/phases/2026-10-21-brainos-into-idearium/BX9_retire.phase`, `lib/phases/2026-10-21-brainos-into-idearium/CNS1_phase_census.phase`

#### `lib/phases/2026-10-21-brainos-into-idearium/graph/`

3 other file(s).

- other: `lib/phases/2026-10-21-brainos-into-idearium/graph/BX1_census-94187d8db6335e81.graph`, `lib/phases/2026-10-21-brainos-into-idearium/graph/BX9_retire-31cdf6b71645e192.graph`, `lib/phases/2026-10-21-brainos-into-idearium/graph/CNS1_phase_census-576dec22d027e819.graph`

#### `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX9_retire-0c410c080c84da17.graph`, `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX9_retire-2bc31a1a8b772044.graph`, `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/CNS1_phase_census-7ed45d431576d002.graph`, `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/CNS1_phase_census-ac4aa4a9dde1d8b0.graph`, `lib/phases/2026-10-21-brainos-into-idearium/graph/_superseded/CNS1_phase_census-ee838c5e542aa524.graph`

#### `lib/phases/2026-10-21-data-layout/`

5 other file(s).

- other: `lib/phases/2026-10-21-data-layout/DL0_data_census.phase`, `lib/phases/2026-10-21-data-layout/DL1_clearup_tool.phase`, `lib/phases/2026-10-21-data-layout/DL2_one_resolver.phase`, `lib/phases/2026-10-21-data-layout/DL3_rewire_writers.phase`, `lib/phases/2026-10-21-data-layout/DL5_memory_in_cortex.phase`

#### `lib/phases/2026-10-21-data-layout/graph/`

5 other file(s).

- other: `lib/phases/2026-10-21-data-layout/graph/DL0_data_census-f0135ef7c3aeb4f1.graph`, `lib/phases/2026-10-21-data-layout/graph/DL1_clearup_tool-e0d483cc4889bc70.graph`, `lib/phases/2026-10-21-data-layout/graph/DL2_one_resolver-f90fe913c224b827.graph`, `lib/phases/2026-10-21-data-layout/graph/DL3_rewire_writers-2b1d23ec8083fbe8.graph`, `lib/phases/2026-10-21-data-layout/graph/DL5_memory_in_cortex-74a8b27cad4858f6.graph`

#### `lib/phases/2026-10-21-data-layout/graph/_superseded/`

7 other file(s).

- other: `lib/phases/2026-10-21-data-layout/graph/_superseded/DL0_data_census-64f85579f51044f8.graph`, `lib/phases/2026-10-21-data-layout/graph/_superseded/DL1_clearup_tool-372de2334482d8f2.graph`, `lib/phases/2026-10-21-data-layout/graph/_superseded/DL2_one_resolver-c98c0dd03a13e5a3.graph`, `lib/phases/2026-10-21-data-layout/graph/_superseded/DL2_one_resolver-db5711605437e8fc.graph`, `lib/phases/2026-10-21-data-layout/graph/_superseded/DL3_rewire_writers-370d1616ff8d75f4.graph`, `lib/phases/2026-10-21-data-layout/graph/_superseded/DL3_rewire_writers-7dbe9cbe6436f155.graph`, `lib/phases/2026-10-21-data-layout/graph/_superseded/DL5_memory_in_cortex-59082cf7b07d2717.graph`

#### `lib/phases/2026-10-22-system-node-db/`

4 other file(s).

- other: `lib/phases/2026-10-22-system-node-db/ND1_every_system_has_its_database.phase`, `lib/phases/2026-10-22-system-node-db/ND2_one_node_route_for_every_system.phase`, `lib/phases/2026-10-22-system-node-db/ND3_each_server_serves_its_nodes.phase`, `lib/phases/2026-10-22-system-node-db/ND4_commands_and_capabilities_from_the_schemas.phase`

#### `lib/phases/2026-10-22-system-node-db/graph/`

4 other file(s).

- other: `lib/phases/2026-10-22-system-node-db/graph/ND1_every_system_has_its_database-d31a6f77d650fe55.graph`, `lib/phases/2026-10-22-system-node-db/graph/ND2_one_node_route_for_every_system-15ec1ac071c27e69.graph`, `lib/phases/2026-10-22-system-node-db/graph/ND3_each_server_serves_its_nodes-653fa4d764e97064.graph`, `lib/phases/2026-10-22-system-node-db/graph/ND4_commands_and_capabilities_from_the_schemas-9774247f00280fa1.graph`

#### `lib/phases/2026-10-22-system-node-db/graph/_superseded/`

5 other file(s).

- other: `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND1_every_system_has_its_database-87dd2ec53f3067a4.graph`, `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND3_each_server_serves_its_nodes-a5ccfda0efc215f8.graph`, `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND3_each_server_serves_its_nodes-e4e6017c5d941f7b.graph`, `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND3_each_server_serves_its_nodes-ea22d024a9a37bb4.graph`, `lib/phases/2026-10-22-system-node-db/graph/_superseded/ND4_commands_and_capabilities_from_the_schemas-ae691a15e3aa12bb.graph`

#### `lib/phases/2026-10-23-cos-spine/`

1 other file(s).

- other: `lib/phases/2026-10-23-cos-spine/CS10_hats_bound_to_the_compartment.phase`

#### `lib/phases/2026-10-23-cos-spine/graph/`

1 other file(s).

- other: `lib/phases/2026-10-23-cos-spine/graph/CS10_hats_bound_to_the_compartment-9593a2c519f5f235.graph`

#### `lib/phases/2026-10-23-self-building-loop/`

5 other file(s).

- other: `lib/phases/2026-10-23-self-building-loop/SL2_done_by_evidence.phase`, `lib/phases/2026-10-23-self-building-loop/SL3_the_backlog_groomed.phase`, `lib/phases/2026-10-23-self-building-loop/SL5_when_a_proven_change_lands_alone.phase`, `lib/phases/2026-10-23-self-building-loop/SL6_the_loop_counts_itself.phase`, `lib/phases/2026-10-23-self-building-loop/SL9_every_phase_a_node.phase`

#### `lib/phases/2026-10-23-self-building-loop/graph/`

5 other file(s).

- other: `lib/phases/2026-10-23-self-building-loop/graph/SL2_done_by_evidence-e233725464e7928b.graph`, `lib/phases/2026-10-23-self-building-loop/graph/SL3_the_backlog_groomed-45be18c8317563a5.graph`, `lib/phases/2026-10-23-self-building-loop/graph/SL5_when_a_proven_change_lands_alone-379b566ca6597dd5.graph`, `lib/phases/2026-10-23-self-building-loop/graph/SL6_the_loop_counts_itself-596269867e9d3b8f.graph`, `lib/phases/2026-10-23-self-building-loop/graph/SL9_every_phase_a_node-141be2f4892e64a0.graph`

#### `lib/phases/2026-10-23-self-building-loop/graph/_superseded/`

14 other file(s).

- other: 14 files (.graph)

#### `lib/phases/2026-10-24-fifteen-systems-migration/`

39 other file(s).

- other: 39 files (.phase)

#### `lib/phases/2026-10-24-fifteen-systems-migration/graph/`

39 other file(s).

- other: 39 files (.graph)

#### `lib/phases/2026-10-24-fifteen-systems-migration/graph/_superseded/`

2 other file(s).

- other: `lib/phases/2026-10-24-fifteen-systems-migration/graph/_superseded/MV11_seams-cde977a3ee02d317.graph`, `lib/phases/2026-10-24-fifteen-systems-migration/graph/_superseded/MV13_cli-908ffb32268f37b5.graph`

#### `lib/phases/2026-10-24-github-context-and-agent-settings/`

5 other file(s).

- other: `lib/phases/2026-10-24-github-context-and-agent-settings/AS2_each_provider_its_own_profile.phase`, `lib/phases/2026-10-24-github-context-and-agent-settings/GH2_the_context_brief_at_the_root.phase`, `lib/phases/2026-10-24-github-context-and-agent-settings/GH4_the_link_as_an_injection_method.phase`, `lib/phases/2026-10-24-github-context-and-agent-settings/GH5_a_github_agent_tool.phase`, `lib/phases/2026-10-24-github-context-and-agent-settings/GH6_send_a_requested_file.phase`

#### `lib/phases/2026-10-24-github-context-and-agent-settings/graph/`

5 other file(s).

- other: `lib/phases/2026-10-24-github-context-and-agent-settings/graph/AS2_each_provider_its_own_profile-8d89f1159394b129.graph`, `lib/phases/2026-10-24-github-context-and-agent-settings/graph/GH2_the_context_brief_at_the_root-4b61d2ee6d98ba20.graph`, `lib/phases/2026-10-24-github-context-and-agent-settings/graph/GH4_the_link_as_an_injection_method-5fd840c54ff4624d.graph`, `lib/phases/2026-10-24-github-context-and-agent-settings/graph/GH5_a_github_agent_tool-3f7b8323b911d2b0.graph`, `lib/phases/2026-10-24-github-context-and-agent-settings/graph/GH6_send_a_requested_file-b5163ccb719b6466.graph`

#### `lib/phases/agent-intelligence-loop/`

2 other file(s).

- other: `lib/phases/agent-intelligence-loop/AP1_pull_toolbox.phase`, `lib/phases/agent-intelligence-loop/AP5_autonomous_build_loop.phase`

#### `lib/phases/agent-intelligence-loop/graph/`

2 other file(s).

- other: `lib/phases/agent-intelligence-loop/graph/AP1_pull_toolbox-0c00d607ee3cf034.graph`, `lib/phases/agent-intelligence-loop/graph/AP5_autonomous_build_loop-fee76168c1767280.graph`

#### `lib/phases/agent-model-and-user-continuity/`

9 other file(s).

- other: `lib/phases/agent-model-and-user-continuity/AM10_thinking_partner_rename_and_ui_builder.phase`, `lib/phases/agent-model-and-user-continuity/AM1_per_agent_learned_model.phase`, `lib/phases/agent-model-and-user-continuity/AM2_incident_debrief.phase`, `lib/phases/agent-model-and-user-continuity/AM3_open_ended_grounded_conversation.phase`, `lib/phases/agent-model-and-user-continuity/AM5_ambiguity_triggered_pull.phase`, `lib/phases/agent-model-and-user-continuity/AM6_perplexity_confidence_loop.phase`, `lib/phases/agent-model-and-user-continuity/AM7_agent_switch_continuity_and_chat_recall.phase`, `lib/phases/agent-model-and-user-continuity/AM8_lifeline_as_general_channel_and_reasoning_upgrade.phase`, `lib/phases/agent-model-and-user-continuity/AM9_get_to_know_you_and_idea_capture.phase`

#### `lib/phases/agent-model-and-user-continuity/graph/`

9 other file(s).

- other: `lib/phases/agent-model-and-user-continuity/graph/AM10_thinking_partner_rename_and_ui_builder-0304b8ec3f70eeb5.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM1_per_agent_learned_model-88c81e6e215f6a45.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM2_incident_debrief-04a4544016b9bb00.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM3_open_ended_grounded_conversation-487ff1e8c712e962.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM5_ambiguity_triggered_pull-ca63b016e003ffb7.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM6_perplexity_confidence_loop-3b7de8454696d887.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM7_agent_switch_continuity_and_chat_recall-e7c6fbbbe5175699.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM8_lifeline_as_general_channel_and_reasoning_upgrade-1c84c72e4365c3a4.graph`, `lib/phases/agent-model-and-user-continuity/graph/AM9_get_to_know_you_and_idea_capture-32fca166c640cfd4.graph`

#### `lib/phases/agent-model-and-user-continuity/graph/_superseded/`

5 other file(s).

- other: `lib/phases/agent-model-and-user-continuity/graph/_superseded/AM10_thinking_partner_rename_and_ui_builder-c0328146fae33b3e.graph`, `lib/phases/agent-model-and-user-continuity/graph/_superseded/AM1_per_agent_learned_model-9f79131e9be93d52.graph`, `lib/phases/agent-model-and-user-continuity/graph/_superseded/AM6_perplexity_confidence_loop-200f6a2a6a5cf5dd.graph`, `lib/phases/agent-model-and-user-continuity/graph/_superseded/AM6_perplexity_confidence_loop-adca06647d527ddd.graph`, `lib/phases/agent-model-and-user-continuity/graph/_superseded/AM8_lifeline_as_general_channel_and_reasoning_upgrade-6413a4c688ff13df.graph`

#### `lib/phases/clearglass-agent-suite-and-cfr-loom/`

7 other file(s).

- other: `lib/phases/clearglass-agent-suite-and-cfr-loom/TX10_component_registry_discipline.phase`, `lib/phases/clearglass-agent-suite-and-cfr-loom/TX11_plugin_architecture_decision.phase`, `lib/phases/clearglass-agent-suite-and-cfr-loom/TX14_plugin_system_v1_build.phase`, `lib/phases/clearglass-agent-suite-and-cfr-loom/TX1_clearglass_agent_suite_composition.phase`, `lib/phases/clearglass-agent-suite-and-cfr-loom/TX2_sequential_event_queue.phase`, `lib/phases/clearglass-agent-suite-and-cfr-loom/TX4_provider_tab_tool_loop.phase`, `lib/phases/clearglass-agent-suite-and-cfr-loom/TX7_cfr_diagnostic_for_loom.phase`

#### `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/`

7 other file(s).

- other: `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX10_component_registry_discipline-95d1f8ac41b8d673.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX11_plugin_architecture_decision-6659d1b03d369470.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX14_plugin_system_v1_build-1a4936ab08174f55.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX1_clearglass_agent_suite_composition-cc545a630ff47485.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX2_sequential_event_queue-8fc03d6ccb85d1f5.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX4_provider_tab_tool_loop-9fb61cd3bda009bc.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/TX7_cfr_diagnostic_for_loom-beb3b81afd44af85.graph`

#### `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/_superseded/`

4 other file(s).

- other: `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/_superseded/TX1_clearglass_agent_suite_composition-19b14f384dffbacc.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/_superseded/TX2_sequential_event_queue-b723e425972e1faa.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/_superseded/TX7_cfr_diagnostic_for_loom-c1a82bad016c63ef.graph`, `lib/phases/clearglass-agent-suite-and-cfr-loom/graph/_superseded/TX9_build_contract_file_dir-11f20eb5730c0d6f.graph`

#### `lib/phases/copilot-autonomous/`

6 other file(s).

- other: `lib/phases/copilot-autonomous/CA1_scheduler.phase`, `lib/phases/copilot-autonomous/CA3_pipeline_chains.phase`, `lib/phases/copilot-autonomous/CA4_connections.phase`, `lib/phases/copilot-autonomous/CA5_system_control_and_clearglass.phase`, `lib/phases/copilot-autonomous/CA6_self_building_commands.phase`, `lib/phases/copilot-autonomous/CA7_constant_autonomy.phase`

#### `lib/phases/copilot-autonomous/graph/`

6 other file(s).

- other: `lib/phases/copilot-autonomous/graph/CA1_scheduler-f646093248081abd.graph`, `lib/phases/copilot-autonomous/graph/CA3_pipeline_chains-c33bc76e820f40fa.graph`, `lib/phases/copilot-autonomous/graph/CA4_connections-fd002fc2bc10c045.graph`, `lib/phases/copilot-autonomous/graph/CA5_system_control_and_clearglass-292f947e788fddeb.graph`, `lib/phases/copilot-autonomous/graph/CA6_self_building_commands-4fc1ad9fd3f90dd6.graph`, `lib/phases/copilot-autonomous/graph/CA7_constant_autonomy-3d9bc5ba933dfd1f.graph`

#### `lib/phases/copilot-autonomous/graph/_superseded/`

2 other file(s).

- other: `lib/phases/copilot-autonomous/graph/_superseded/CA7_constant_autonomy-bcaaa823adb0c656.graph`, `lib/phases/copilot-autonomous/graph/_superseded/CA7_constant_autonomy-fbcc8e9d8af7ed20.graph`

#### `lib/phases/copilot-awareness-routing/`

2 other file(s).

- other: `lib/phases/copilot-awareness-routing/CA2_tool_self_awareness.phase`, `lib/phases/copilot-awareness-routing/CA6_routing_config.phase`

#### `lib/phases/copilot-awareness-routing/graph/`

2 other file(s).

- other: `lib/phases/copilot-awareness-routing/graph/CA2_tool_self_awareness-27716cb40c8eca89.graph`, `lib/phases/copilot-awareness-routing/graph/CA6_routing_config-c8ec964b0b80f7cb.graph`

#### `lib/phases/copilot-full-capability/`

1 other file(s).

- other: `lib/phases/copilot-full-capability/P7_continuous_nerve_dom_to_ollama.phase`

#### `lib/phases/copilot-full-capability/graph/`

1 other file(s).

- other: `lib/phases/copilot-full-capability/graph/P7_continuous_nerve_dom_to_ollama-ef87cc6e96f4fcab.graph`

#### `lib/phases/copilot-full-capability/graph/_superseded/`

1 other file(s).

- other: `lib/phases/copilot-full-capability/graph/_superseded/P7_continuous_nerve_dom_to_ollama-40f6a3bac3b56676.graph`

#### `lib/phases/copilot-guardian-cos-expansion/`

5 other file(s).

- other: `lib/phases/copilot-guardian-cos-expansion/GA1_guardian_nexus_reconciliation.phase`, `lib/phases/copilot-guardian-cos-expansion/GA2_diagnostic_system_depth.phase`, `lib/phases/copilot-guardian-cos-expansion/GA3_guardian_userscript_capability_wiring.phase`, `lib/phases/copilot-guardian-cos-expansion/GA6_spec_builder_depth.phase`, `lib/phases/copilot-guardian-cos-expansion/GA8_sse_announcements.phase`

#### `lib/phases/copilot-guardian-cos-expansion/graph/`

5 other file(s).

- other: `lib/phases/copilot-guardian-cos-expansion/graph/GA1_guardian_nexus_reconciliation-97b520d35eb12e24.graph`, `lib/phases/copilot-guardian-cos-expansion/graph/GA2_diagnostic_system_depth-9e9318bacd6bb0d1.graph`, `lib/phases/copilot-guardian-cos-expansion/graph/GA3_guardian_userscript_capability_wiring-378f86881837b81c.graph`, `lib/phases/copilot-guardian-cos-expansion/graph/GA6_spec_builder_depth-e83a05d5f8faacab.graph`, `lib/phases/copilot-guardian-cos-expansion/graph/GA8_sse_announcements-97502b83d9030e77.graph`

#### `lib/phases/copilot-guardian-cos-expansion/graph/_superseded/`

3 other file(s).

- other: `lib/phases/copilot-guardian-cos-expansion/graph/_superseded/GA1_guardian_nexus_reconciliation-7d4f25c26f8d558f.graph`, `lib/phases/copilot-guardian-cos-expansion/graph/_superseded/GA6_spec_builder_depth-d8dcc592e1ac180c.graph`, `lib/phases/copilot-guardian-cos-expansion/graph/_superseded/GA8_sse_announcements-2285f347862e5b5c.graph`

#### `lib/phases/copilot-omniscience/`

2 other file(s).

- other: `lib/phases/copilot-omniscience/P4_gate_never_actually_verified.phase`, `lib/phases/copilot-omniscience/P6_every_system_reachable.phase`

#### `lib/phases/copilot-omniscience/graph/`

2 other file(s).

- other: `lib/phases/copilot-omniscience/graph/P4_gate_never_actually_verified-8d7d2e038d509427.graph`, `lib/phases/copilot-omniscience/graph/P6_every_system_reachable-7d719f5d40d918b1.graph`

#### `lib/phases/copilot-omniscience/graph/_superseded/`

1 other file(s).

- other: `lib/phases/copilot-omniscience/graph/_superseded/P4_gate_never_actually_verified-c081947773f7a8cc.graph`

#### `lib/phases/cortex-schema-registry/`

4 other file(s).

- other: `lib/phases/cortex-schema-registry/P1_schema_table_in_cortex.phase`, `lib/phases/cortex-schema-registry/P2_conformance_check_lib.phase`, `lib/phases/cortex-schema-registry/P5_expectation_for_consumers.phase`, `lib/phases/cortex-schema-registry/UM1_schema_for_user_model.phase`

#### `lib/phases/cortex-schema-registry/graph/`

4 other file(s).

- other: `lib/phases/cortex-schema-registry/graph/P1_schema_table_in_cortex-7a45c9928b49cec7.graph`, `lib/phases/cortex-schema-registry/graph/P2_conformance_check_lib-9d3e03fe9b7e2d00.graph`, `lib/phases/cortex-schema-registry/graph/P5_expectation_for_consumers-eda9550483f4ed1c.graph`, `lib/phases/cortex-schema-registry/graph/UM1_schema_for_user_model-d62896550a607452.graph`

#### `lib/phases/cortex-schema-registry/graph/_superseded/`

1 other file(s).

- other: `lib/phases/cortex-schema-registry/graph/_superseded/P1_schema_table_in_cortex-8a7709b7b3706ea7.graph`

#### `lib/phases/gemini-multiagent-coding/`

4 other file(s).

- other: `lib/phases/gemini-multiagent-coding/P1_per_agent_contracts.phase`, `lib/phases/gemini-multiagent-coding/P2_tree_parse_recall_injection.phase`, `lib/phases/gemini-multiagent-coding/P4_structured_agent_to_agent.phase`, `lib/phases/gemini-multiagent-coding/P5_autonomous_multiagent_loop.phase`

#### `lib/phases/gemini-multiagent-coding/graph/`

4 other file(s).

- other: `lib/phases/gemini-multiagent-coding/graph/P1_per_agent_contracts-2ca578531cd36a2e.graph`, `lib/phases/gemini-multiagent-coding/graph/P2_tree_parse_recall_injection-31411292304becfe.graph`, `lib/phases/gemini-multiagent-coding/graph/P4_structured_agent_to_agent-8f27af99fec90581.graph`, `lib/phases/gemini-multiagent-coding/graph/P5_autonomous_multiagent_loop-a2a4807ff38b06e1.graph`

#### `lib/phases/gemini-multiagent-coding/graph/_superseded/`

2 other file(s).

- other: `lib/phases/gemini-multiagent-coding/graph/_superseded/P1_per_agent_contracts-0f2fd9ee83912663.graph`, `lib/phases/gemini-multiagent-coding/graph/_superseded/P5_autonomous_multiagent_loop-7a74916704cceb5b.graph`

#### `lib/phases/idearium-repository-overhaul/`

5 other file(s).

- other: `lib/phases/idearium-repository-overhaul/MCO-A_schemas.phase`, `lib/phases/idearium-repository-overhaul/MCO-E_roadmap_ui.phase`, `lib/phases/idearium-repository-overhaul/MCO-G_git_cicd_credentials.phase`, `lib/phases/idearium-repository-overhaul/MCO4_hooks_wires_flows_tools.phase`, `lib/phases/idearium-repository-overhaul/MCO6_compartment_ownership.phase`

#### `lib/phases/idearium-repository-overhaul/graph/`

5 other file(s).

- other: `lib/phases/idearium-repository-overhaul/graph/MCO-A_schemas-912297af517ed265.graph`, `lib/phases/idearium-repository-overhaul/graph/MCO-E_roadmap_ui-b86c0d6b1a69cd1d.graph`, `lib/phases/idearium-repository-overhaul/graph/MCO-G_git_cicd_credentials-209210182fab359f.graph`, `lib/phases/idearium-repository-overhaul/graph/MCO4_hooks_wires_flows_tools-cc4c6a57854d135d.graph`, `lib/phases/idearium-repository-overhaul/graph/MCO6_compartment_ownership-5c9aeaba983df977.graph`

#### `lib/phases/idearium-repository-overhaul/graph/_superseded/`

4 other file(s).

- other: `lib/phases/idearium-repository-overhaul/graph/_superseded/MCO-E_roadmap_ui-05dd511a8ef21910.graph`, `lib/phases/idearium-repository-overhaul/graph/_superseded/MCO4_hooks_wires_flows_tools-1792b3e7c6ba3523.graph`, `lib/phases/idearium-repository-overhaul/graph/_superseded/MCO6_compartment_ownership-ccbefa5d407a1b18.graph`, `lib/phases/idearium-repository-overhaul/graph/_superseded/MCO6_compartment_ownership-e6332bb58736f1e3.graph`

#### `lib/phases/nexus-architecture-rebuild/`

8 other file(s).

- other: `lib/phases/nexus-architecture-rebuild/P10_safe_apply_verify_before_merge.phase`, `lib/phases/nexus-architecture-rebuild/P11_agent_council.phase`, `lib/phases/nexus-architecture-rebuild/P12_fault_logging_first_class.phase`, `lib/phases/nexus-architecture-rebuild/P13_roundtable_shared_council_chat.phase`, `lib/phases/nexus-architecture-rebuild/P14_emergence_axioms_endstate.phase`, `lib/phases/nexus-architecture-rebuild/P2_autopilot_spawn_crash.phase`, `lib/phases/nexus-architecture-rebuild/P8_hat_forge_command.phase`, `lib/phases/nexus-architecture-rebuild/P9_multi_agent_parallel_dispatch.phase`

#### `lib/phases/nexus-architecture-rebuild/graph/`

8 other file(s).

- other: `lib/phases/nexus-architecture-rebuild/graph/P10_safe_apply_verify_before_merge-321a65ed784d8a03.graph`, `lib/phases/nexus-architecture-rebuild/graph/P11_agent_council-2c8598728dc1ff30.graph`, `lib/phases/nexus-architecture-rebuild/graph/P12_fault_logging_first_class-0f23845dc5fc1c10.graph`, `lib/phases/nexus-architecture-rebuild/graph/P13_roundtable_shared_council_chat-bbfce2d577125626.graph`, `lib/phases/nexus-architecture-rebuild/graph/P14_emergence_axioms_endstate-7c968ba80520bc34.graph`, `lib/phases/nexus-architecture-rebuild/graph/P2_autopilot_spawn_crash-5d5c4569ac99cf91.graph`, `lib/phases/nexus-architecture-rebuild/graph/P8_hat_forge_command-dfd13349bbd7e4e9.graph`, `lib/phases/nexus-architecture-rebuild/graph/P9_multi_agent_parallel_dispatch-8ad7c5128e9ee3f3.graph`

#### `lib/phases/nexus-architecture-rebuild/graph/_superseded/`

2 other file(s).

- other: `lib/phases/nexus-architecture-rebuild/graph/_superseded/P12_fault_logging_first_class-45cc2cf048e77d57.graph`, `lib/phases/nexus-architecture-rebuild/graph/_superseded/P2_autopilot_spawn_crash-7b3595f0354c6063.graph`

#### `lib/phases/nexus-live-mind/`

2 other file(s).

- other: `lib/phases/nexus-live-mind/P3_diagnostic_kernel.phase`, `lib/phases/nexus-live-mind/P6_copilot_programmable.phase`

#### `lib/phases/nexus-live-mind/graph/`

2 other file(s).

- other: `lib/phases/nexus-live-mind/graph/P3_diagnostic_kernel-982f538d364cd9de.graph`, `lib/phases/nexus-live-mind/graph/P6_copilot_programmable-fc60e7f4e89d1784.graph`

#### `lib/phases/nexus-live-mind/graph/_superseded/`

5 other file(s).

- other: `lib/phases/nexus-live-mind/graph/_superseded/P3_diagnostic_kernel-18615a25df10af8b.graph`, `lib/phases/nexus-live-mind/graph/_superseded/P3_diagnostic_kernel-75ac0a6dcf420224.graph`, `lib/phases/nexus-live-mind/graph/_superseded/P3_diagnostic_kernel-9d8fd727a94f0524.graph`, `lib/phases/nexus-live-mind/graph/_superseded/P6_copilot_programmable-52e733c13ed35b06.graph`, `lib/phases/nexus-live-mind/graph/_superseded/P6_copilot_programmable-aa8ea0b8ea0f0c37.graph`

#### `lib/phases/nexus-observability-tablet/`

2 other file(s).

- other: `lib/phases/nexus-observability-tablet/OB11_edge_case_mapping.phase`, `lib/phases/nexus-observability-tablet/OB3_movement_map.phase`

#### `lib/phases/nexus-observability-tablet/graph/`

2 other file(s).

- other: `lib/phases/nexus-observability-tablet/graph/OB11_edge_case_mapping-be0ff5bccc30824b.graph`, `lib/phases/nexus-observability-tablet/graph/OB3_movement_map-1750f2d80be7b16d.graph`

#### `lib/phases/nexus-repo-compartment-and-rich-dispatch/`

3 other file(s).

- other: `lib/phases/nexus-repo-compartment-and-rich-dispatch/AG1_agent_nodes_sorted_by_provider.phase`, `lib/phases/nexus-repo-compartment-and-rich-dispatch/GC1_global_component_reuse_store.phase`, `lib/phases/nexus-repo-compartment-and-rich-dispatch/RD1_multi_file_response_parser.phase`

#### `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/`

3 other file(s).

- other: `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/AG1_agent_nodes_sorted_by_provider-244704b3a3825cc8.graph`, `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/GC1_global_component_reuse_store-be01744966f6d9b1.graph`, `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/RD1_multi_file_response_parser-747cf5517c059840.graph`

#### `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/_superseded/`

2 other file(s).

- other: `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/_superseded/GC1_global_component_reuse_store-5905dedcc5f2f956.graph`, `lib/phases/nexus-repo-compartment-and-rich-dispatch/graph/_superseded/GC1_global_component_reuse_store-7caeeeea63576bfe.graph`

#### `lib/phases/nexus-repository-system-build/`

3 other file(s).

- other: `lib/phases/nexus-repository-system-build/MCO3_snapshot_compliance.phase`, `lib/phases/nexus-repository-system-build/MCO4_hooks_wires_flows_tools.phase`, `lib/phases/nexus-repository-system-build/MCO7_nexus_systems_as_repo_compartments.phase`

#### `lib/phases/nexus-repository-system-build/graph/`

3 other file(s).

- other: `lib/phases/nexus-repository-system-build/graph/MCO3_snapshot_compliance-acdb36a4452cf48d.graph`, `lib/phases/nexus-repository-system-build/graph/MCO4_hooks_wires_flows_tools-21c6272ecb1ac076.graph`, `lib/phases/nexus-repository-system-build/graph/MCO7_nexus_systems_as_repo_compartments-2677aa15d8432e73.graph`

#### `lib/phases/nexus-repository-system-build/graph/_superseded/`

3 other file(s).

- other: `lib/phases/nexus-repository-system-build/graph/_superseded/MCO3_snapshot_compliance-00fc7f80a15780aa.graph`, `lib/phases/nexus-repository-system-build/graph/_superseded/MCO4_hooks_wires_flows_tools-acba9c545837ded9.graph`, `lib/phases/nexus-repository-system-build/graph/_superseded/MCO7_nexus_systems_as_repo_compartments-b9b0a420afcc0424.graph`

#### `lib/phases/nexus-self-build-pipeline/`

7 other file(s).

- other: `lib/phases/nexus-self-build-pipeline/SB2_universal_file_parse.phase`, `lib/phases/nexus-self-build-pipeline/SB3_guided_build_loop.phase`, `lib/phases/nexus-self-build-pipeline/SB4_decision_lattice_wiring.phase`, `lib/phases/nexus-self-build-pipeline/SB5_self_modification_from_inside.phase`, `lib/phases/nexus-self-build-pipeline/SB6_contract_type_schemas_and_toolbox_directory.phase`, `lib/phases/nexus-self-build-pipeline/SB7_compartments_as_sessions.phase`, `lib/phases/nexus-self-build-pipeline/SB8_tool_agnosticism_and_new_tool_flow.phase`

#### `lib/phases/nexus-self-build-pipeline/graph/`

7 other file(s).

- other: `lib/phases/nexus-self-build-pipeline/graph/SB2_universal_file_parse-2f06c0672e301ca7.graph`, `lib/phases/nexus-self-build-pipeline/graph/SB3_guided_build_loop-55227c9a64bbeaae.graph`, `lib/phases/nexus-self-build-pipeline/graph/SB4_decision_lattice_wiring-b104dbd3d608dd84.graph`, `lib/phases/nexus-self-build-pipeline/graph/SB5_self_modification_from_inside-cdb424f27e387b64.graph`, `lib/phases/nexus-self-build-pipeline/graph/SB6_contract_type_schemas_and_toolbox_directory-c5ebdf092da9729b.graph`, `lib/phases/nexus-self-build-pipeline/graph/SB7_compartments_as_sessions-1d6cdd8bacad34a4.graph`, `lib/phases/nexus-self-build-pipeline/graph/SB8_tool_agnosticism_and_new_tool_flow-8cd0b56c8cd41af3.graph`

#### `lib/phases/nexus-self-build-pipeline/graph/_superseded/`

4 other file(s).

- other: `lib/phases/nexus-self-build-pipeline/graph/_superseded/SB3_guided_build_loop-43e53ddad29a7b4a.graph`, `lib/phases/nexus-self-build-pipeline/graph/_superseded/SB4_decision_lattice_wiring-8250b009e094ad56.graph`, `lib/phases/nexus-self-build-pipeline/graph/_superseded/SB7_compartments_as_sessions-61dd4a0cac5599fd.graph`, `lib/phases/nexus-self-build-pipeline/graph/_superseded/SB8_tool_agnosticism_and_new_tool_flow-0dad83e5c39c6d0a.graph`

#### `lib/phases/nexus-system-standardization/`

3 other file(s).

- other: `lib/phases/nexus-system-standardization/SS2_config_per_system.phase`, `lib/phases/nexus-system-standardization/SS3_event_driven_handshake_contracts.phase`, `lib/phases/nexus-system-standardization/SS5_diagnostics_reads_and_fixes.phase`

#### `lib/phases/nexus-system-standardization/graph/`

3 other file(s).

- other: `lib/phases/nexus-system-standardization/graph/SS2_config_per_system-21362d473f86d2b4.graph`, `lib/phases/nexus-system-standardization/graph/SS3_event_driven_handshake_contracts-be17a05a7ed43aa7.graph`, `lib/phases/nexus-system-standardization/graph/SS5_diagnostics_reads_and_fixes-bbc697df4c8f8e23.graph`

#### `lib/phases/nexus-system-standardization/graph/_superseded/`

1 other file(s).

- other: `lib/phases/nexus-system-standardization/graph/_superseded/SS3_event_driven_handshake_contracts-7fca6f4123a25be4.graph`

#### `lib/phases/raid-routing-fidelity/`

5 other file(s).

- other: `lib/phases/raid-routing-fidelity/RR2_contract_based_chunking.phase`, `lib/phases/raid-routing-fidelity/RR3_per_agent_config_in_cortex.phase`, `lib/phases/raid-routing-fidelity/RR4_governed_handshake_on_handoff.phase`, `lib/phases/raid-routing-fidelity/RR5_clearglass_accounts_and_features.phase`, `lib/phases/raid-routing-fidelity/RR7_per_system_dashboards_in_tablet.phase`

#### `lib/phases/raid-routing-fidelity/graph/`

5 other file(s).

- other: `lib/phases/raid-routing-fidelity/graph/RR2_contract_based_chunking-9f2225141606bc1a.graph`, `lib/phases/raid-routing-fidelity/graph/RR3_per_agent_config_in_cortex-efff7260225f5d9a.graph`, `lib/phases/raid-routing-fidelity/graph/RR4_governed_handshake_on_handoff-4d83a6aef7b477d0.graph`, `lib/phases/raid-routing-fidelity/graph/RR5_clearglass_accounts_and_features-022fe3f3a22c597f.graph`, `lib/phases/raid-routing-fidelity/graph/RR7_per_system_dashboards_in_tablet-a97e4c0989831da2.graph`

#### `lib/phases/raid-routing-fidelity/graph/_superseded/`

1 other file(s).

- other: `lib/phases/raid-routing-fidelity/graph/_superseded/RR4_governed_handshake_on_handoff-b031ed28511d3eae.graph`

#### `lib/phases/raid-verification-spine/`

3 other file(s).

- other: `lib/phases/raid-verification-spine/P1_raid_records_every_tool_decision.phase`, `lib/phases/raid-verification-spine/P3_isolate_and_verify_via_cos.phase`, `lib/phases/raid-verification-spine/P6_rewind_on_fail.phase`

#### `lib/phases/raid-verification-spine/graph/`

3 other file(s).

- other: `lib/phases/raid-verification-spine/graph/P1_raid_records_every_tool_decision-b2e3b501e67e23a4.graph`, `lib/phases/raid-verification-spine/graph/P3_isolate_and_verify_via_cos-0019c3a16a9a4f4d.graph`, `lib/phases/raid-verification-spine/graph/P6_rewind_on_fail-b0baf09b7e7c036f.graph`

#### `lib/phases/raid-warp-verification/`

1 other file(s).

- other: `lib/phases/raid-warp-verification/P6_rewind_on_fail.phase`

#### `lib/phases/raid-warp-verification/graph/`

1 other file(s).

- other: `lib/phases/raid-warp-verification/graph/P6_rewind_on_fail-889c72ca60734872.graph`

#### `lib/phases/repair-contract-and-loom-hub/`

9 other file(s).

- other: `lib/phases/repair-contract-and-loom-hub/R10_relational_context_and_reuse.phase`, `lib/phases/repair-contract-and-loom-hub/R1_repair_contract_schema.phase`, `lib/phases/repair-contract-and-loom-hub/R2_real_snapshot_rollback.phase`, `lib/phases/repair-contract-and-loom-hub/R3_autonomous_repair_trigger.phase`, `lib/phases/repair-contract-and-loom-hub/R4_loom_ledger_awareness.phase`, `lib/phases/repair-contract-and-loom-hub/R5_loom_visual_map.phase`, `lib/phases/repair-contract-and-loom-hub/R7_fault_taxonomy_reconnection.phase`, `lib/phases/repair-contract-and-loom-hub/R8_ui_diagnostic_surfaces_wired_together.phase`, `lib/phases/repair-contract-and-loom-hub/R9_ui_design_philosophy.phase`

#### `lib/phases/repair-contract-and-loom-hub/graph/`

9 other file(s).

- other: `lib/phases/repair-contract-and-loom-hub/graph/R10_relational_context_and_reuse-9bc7eb109a1d3f9a.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R1_repair_contract_schema-3dd078c3c6681b99.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R2_real_snapshot_rollback-f664d7c28996c65a.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R3_autonomous_repair_trigger-4f6cbfa55d7722d6.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R4_loom_ledger_awareness-062135e5d81eb31b.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R5_loom_visual_map-32a6c3adfcd1f248.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R7_fault_taxonomy_reconnection-88c6c02aa5089a74.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R8_ui_diagnostic_surfaces_wired_together-0df5fa77d14e88f1.graph`, `lib/phases/repair-contract-and-loom-hub/graph/R9_ui_design_philosophy-bb1f4bfdb151ae73.graph`

#### `lib/phases/repair-contract-and-loom-hub/graph/_superseded/`

7 other file(s).

- other: `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R10_relational_context_and_reuse-0e23e7835362642d.graph`, `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R2_real_snapshot_rollback-b4af0c3b6772dee3.graph`, `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R2_real_snapshot_rollback-b681fb6ca7cb6813.graph`, `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R4_loom_ledger_awareness-605c42ef21895483.graph`, `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R5_loom_visual_map-486b78f53c8cc3c0.graph`, `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R7_fault_taxonomy_reconnection-3fb547b4cfbe5881.graph`, `lib/phases/repair-contract-and-loom-hub/graph/_superseded/R8_ui_diagnostic_surfaces_wired_together-89ea8783a73fb339.graph`

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
  exports SEAMQueue, QueueCompartment, STATE, STRATEGY, MODE, _writeCosSeamArtifacts +1 · requires 5 · required by 2 · tested by `tests/lib/cos-seam-artifact-staging.test.js`, `tests/modules/test-agent-hat-agnostic.test.js`
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
  exports createWarpDispatch, providersFor · requires 8 · required by 2 · tested by `tests/modules/test-agent-hat-agnostic.test.js`, `tests/modules/test-warp-cascade-provider-fallback.js`

#### `lib/seam/spec-bridge/`

1 code file(s).

- `lib/seam/spec-bridge/index.js` (301 lines) — guardian/lib/spec-bridge/index.js Connects Guardian's spec dispatch to the spec-compiler pipeline.  
  exports processSpec, summarise

#### `lib/sentinel/`

1 other file(s).

- other: `lib/sentinel/interaction-contract.json`

#### `lib/siso/`

5 code · 2 other file(s).

- `lib/siso/Event.js` (12 lines) — Event — a datum flowing through the stream. Has a type (its signature) and arbitrary data.  
  exports Event
- `lib/siso/Gate.js` (24 lines) — Gate — a shape that recognizes one type of event and transforms it into another.  
  exports Gate
- `lib/siso/Stream.js` (78 lines) — Stream — the processing loop. Gates register by signature. Events arrive via emit().  
  exports Stream
- `lib/siso/StreamLog.js` (90 lines) — StreamLog — the audit trail. A shared object that streams write to. One log sees  
  exports StreamLog
- `lib/siso/index.js` (140 lines) — siso/core/index.js — Extended SISO for idearium (ESM) hookId: siso.core.extended:v1:e0001  
  exports Event, Gate, StreamLog, Stream · requires 0 · required by 2
- other: `lib/siso/MANIFEST.json`, `lib/siso/package.json`

#### `lib/siso/core/`

1 code · 1 other file(s).

- `lib/siso/core/index.js` (140 lines) — siso/core/index.js — Extended SISO for idearium (ESM) hookId: siso.core.extended:v1:e0001  
  exports Event, Gate, StreamLog, Stream · requires 0 · required by 1
- other: `lib/siso/core/package.json`

#### `lib/siso/spec/`

1 other file(s).

- other: `lib/siso/spec/siso.spec`

#### `lib/spec/`

1 other file(s).

- other: `lib/spec/capability-spec.spec`

#### `lib/step-gates/`

3 other file(s).

- other: `lib/step-gates/code.write.step_gate`, `lib/step-gates/reply.accept.step_gate`, `lib/step-gates/reply.on_task.step_gate`

#### `lib/ui/`

7 code file(s).

- `lib/ui/api.js` (356 lines) — ui/api.js — NEXUS Transport Layer Status: pre-release  
  requires 1 · required by 1
- `lib/ui/contract-renderer.js` (505 lines) — ui/contract-renderer.js — NEXUS Contract-Driven UI Renderer Status: pre-release  
  exports ContractRenderer, ContractExplorer
- `lib/ui/contracts.js` (431 lines) — ui/contracts.js — NEXUS Interaction Contract Layer Status: pre-release  
  requires 0 · required by 2
- `lib/ui/ncp.js` (374 lines) — lib/ncp.js — NEXUS Channel Protocol v1.2.0 Architecture:  
  exports createNCPServer, jsonResponse, readBody, handleOptions
- `lib/ui/ports.js` (47 lines) — ui/ports.js — Canonical NEXUS port map Served by orchestrator at http://localhost:9000/ports.js
- `lib/ui/pulse.js` (288 lines) — lib/pulse.js — NEXUS Pulse System v1.0.0 The pulse is the heartbeat made active. Every system that imports this  
  exports createPulse, createNCPPulse, _Ring
- `lib/ui/store.js` (646 lines) — ui/store.js — NEXUS Reactive State Store Status: pre-release  
  requires 2 · required by 0 · emits artifacts.changed, config.changed, cortex.memory.updated, entropy.changed +18

#### `lib/ui/agents/chatgpt/`

1 other file(s).

- other: `lib/ui/agents/chatgpt/index.html`

#### `lib/ui/agents/claude/`

1 other file(s).

- other: `lib/ui/agents/claude/index.html`

#### `lib/ui/agents/gemini/`

2 other file(s).

- other: `lib/ui/agents/gemini/code-suite.html`, `lib/ui/agents/gemini/index.html`

#### `lib/ui/agents/perplexity/`

1 other file(s).

- other: `lib/ui/agents/perplexity/index.html`

#### `lib/ui/brainos/`

3 code · 3 other file(s).

- `lib/ui/brainos/brainos-app.js` (630 lines) — ui/brainos/brainos-app.js §NEW 2026-09-06 — James: "make this ui, map it all onto the html."
- `lib/ui/brainos/brainos-automation.js` (762 lines)
- `lib/ui/brainos/brainos-canvas.js` (543 lines)  
  tested by `tests/modules/brainos-canvas.test.js`, `tests/modules/test-brainos-canvas-agent-mesh.js` +1
- other: `lib/ui/brainos/brainos-app.css`, `lib/ui/brainos/brainos-interaction-contract.json`, `lib/ui/brainos/index.html`

#### `lib/ui/brainos-float/`

2 code · 3 other file(s).

- `lib/ui/brainos-float/brainos-float-cg.js` (184 lines) — ui/brainos-float/brainos-float-cg.js — BrainOS Float: Clear Glass tabs component_id: nexus.ui.brainos-float.cg-tabs
- `lib/ui/brainos-float/brainos-float.js` (404 lines) — ui/brainos-float/brainos-float.js — the floating control panel James asked for: "floating above, not hardcoded or inline, interaction
- other: `lib/ui/brainos-float/brainos-float-contract.json`, `lib/ui/brainos-float/brainos-float.css`, `lib/ui/brainos-float/index.html`

#### `lib/ui/channels/causal/`

1 other file(s).

- other: `lib/ui/channels/causal/causal.html`

#### `lib/ui/channels/conversations/`

1 other file(s).

- other: `lib/ui/channels/conversations/conversations.html`

#### `lib/ui/channels/idearium/`

1 other file(s).

- other: `lib/ui/channels/idearium/idearium.html`

#### `lib/ui/channels/log/`

1 other file(s).

- other: `lib/ui/channels/log/log.html`

#### `lib/ui/consent/`

1 code file(s).

- `lib/ui/consent/consent-gate.js` (87 lines) — ui/consent/consent-gate.js — sovereign module. Zero coupling to shell beyond the API below (matches ui/home/DECOMP.md's module contract).

#### `lib/ui/control-panel/`

1 other file(s).

- other: `lib/ui/control-panel/index.html`

#### `lib/ui/copilot/`

1 code · 1 test file(s).

- `lib/ui/copilot/copilot.js` (226 lines)

#### `lib/ui/cortex/`

1 other file(s).

- other: `lib/ui/cortex/index.html`

#### `lib/ui/emerge/`

2 other file(s).

- other: `lib/ui/emerge/emerge-ide.html`, `lib/ui/emerge/index.html`

#### `lib/ui/forge-shell/`

2 other file(s).

- other: `lib/ui/forge-shell/forge-shell.html`, `lib/ui/forge-shell/index.html`

#### `lib/ui/guardian/`

1 other file(s).

- other: `lib/ui/guardian/index.html`

#### `lib/ui/home/`

1 code · 6 other file(s).

- `lib/ui/home/shell.js` (161 lines) — ui/home/shell.js — thin shell, per ui/home/DECOMP.md's own spec: "tune(), toggleMenu(), connectSSE(), flashDot(), pollHealth(),
- other: `lib/ui/home/DECOMP.md`, `lib/ui/home/STRUCTURE.md`, `lib/ui/home/home.css`, `lib/ui/home/index.html`, `lib/ui/home/intent.html`, `lib/ui/home/nexus-home.html`

#### `lib/ui/home/areas/`

21 code · 21 other file(s).

- `lib/ui/home/areas/agent-suite.js` (302 lines) — // ui/home/areas/agent-suite.js — Agent suite channel + agent forge + stored-mode restore. // Split from ui/home/index.html (inline script, lines 2238-2535 at v0.39.227). Load order is set by…
- `lib/ui/home/areas/assistant.js` (11 lines) — // ui/home/areas/assistant.js — Assistant bar: prompt history keys. // Split from ui/home/index.html (inline script, lines 1636-1642 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/bridge.js` (17 lines) — // ui/home/areas/bridge.js — Bridge channel: relay nodes. // Split from ui/home/index.html (inline script, lines 1535-1547 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/causal.js` (258 lines) — // ui/home/areas/causal.js — Causal channel: CFR force graph (CG). // Split from ui/home/index.html (inline script, lines 1643-1896 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/console.js` (42 lines) — // ui/home/areas/console.js — Fullscreen system console (#bot-bar). // Split from ui/home/index.html (inline script, lines 1020-1057 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/conversations.js` (73 lines) — // ui/home/areas/conversations.js — Conversations channel: co-pilot exchange log. // Split from ui/home/index.html (inline script, lines 1897-1965 at v0.39.227). Load order is set by index.html;…
- `lib/ui/home/areas/cortex.js` (18 lines) — // ui/home/areas/cortex.js — Cortex channel: gaps, failures. // Split from ui/home/index.html (inline script, lines 1503-1516 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/diagnose.js` (92 lines) — // ui/home/areas/diagnose.js — Diagnose channel: checks, CFR, gaps, engines. // Split from ui/home/index.html (inline script, lines 1548-1635 at v0.39.227). Load order is set by index.html; do not…
- `lib/ui/home/areas/forge-tile.js` (37 lines) — // ui/home/areas/forge-tile.js — Forge shell + blueprint tiles. // Split from ui/home/index.html (inline script, lines 2597-2629 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/guardian.js` (142 lines) — // ui/home/areas/guardian.js — Guardian channel: providers, dispatch, jobs. // Split from ui/home/index.html (inline script, lines 1365-1502 at v0.39.227). Load order is set by index.html; do not…
- `lib/ui/home/areas/idearium.js` (22 lines) — // ui/home/areas/idearium.js — Idearium channel: ideas. // Split from ui/home/index.html (inline script, lines 1517-1534 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/inspect.js` (51 lines) — // ui/home/areas/inspect.js — Inspect overlay: contextual diagnostics for the active channel. // Split from ui/home/index.html (inline script, lines 973-1019 at v0.39.227). Load order is set by…
- `lib/ui/home/areas/log.js` (39 lines) — // ui/home/areas/log.js — Log channel: live event stream. // Split from ui/home/index.html (inline script, lines 1330-1364 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/mode-selector.js` (142 lines) — // ui/home/areas/mode-selector.js — Mode system: MODE_CONFIG, selectMode, mode overlay. // Split from ui/home/index.html (inline script, lines 2100-2237 at v0.39.227). Load order is set by…
- `lib/ui/home/areas/overview.js` (168 lines) — // ui/home/areas/overview.js — Overview channel: system grid, heartbeat pulse, health polling, metrics. // Split from ui/home/index.html (inline script, lines 1073-1236 at v0.39.227). Load order…
- `lib/ui/home/areas/rail.js` (142 lines) — // ui/home/areas/rail.js — Channel rail: movable / editable / removable. // Split from ui/home/index.html (inline script, lines 762-899 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/rewind.js` (69 lines) — // ui/home/areas/rewind.js — Rewind overlay: snapshot timeline + rollback. // Split from ui/home/index.html (inline script, lines 2035-2099 at v0.39.227). Load order is set by index.html; do not…
- `lib/ui/home/areas/settings-btn.js` (24 lines) — // ui/home/areas/settings-btn.js — real Settings access from the home menu. // §ADDED 2026-09-25 — James: "the three lines menu... its not here. at
- `lib/ui/home/areas/shell.js` (76 lines) — // ui/home/areas/shell.js — Menu toggle + tune() channel switching. // Split from ui/home/index.html (inline script, lines 900-972 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/spec-wizard.js` (189 lines) — // ui/home/areas/spec-wizard.js — Spec wizard modal. // Split from ui/home/index.html (inline script, lines 2754-2939 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/areas/void.js` (25 lines) — // ui/home/areas/void.js — Layer 0 particle void (decorative canvas). // Split from ui/home/index.html (inline script, lines 679-699 at v0.39.227). Load order is set by index.html; do not reorder.
- other: 21 files (.css)

#### `lib/ui/home/core/`

6 code file(s).

- `lib/ui/home/core/boot.js` (15 lines) — // ui/home/core/boot.js — Boot: first polls, intervals, SSE connect. // Split from ui/home/index.html (inline script, lines 2630-2640 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/core/config.js` (65 lines) — // ui/home/core/config.js — Port map P, base URLs B, provider URLs, openClearGlass, CH_META channel registry. // Split from ui/home/index.html (inline script, lines 700-761 at v0.39.227). Load…
- `lib/ui/home/core/keys.js` (19 lines) — // ui/home/core/keys.js — Global keyboard shortcuts. // Split from ui/home/index.html (inline script, lines 1058-1072 at v0.39.227). Load order is set by index.html; do not reorder.
- `lib/ui/home/core/logging.js` (66 lines) — // ui/home/core/logging.js — UI failure/event logging to cortex with sessionStorage fallback. // Split from ui/home/index.html (inline script, lines 2536-2596 at v0.39.227). Loads FIRST:…
- `lib/ui/home/core/sse.js` (97 lines) — // ui/home/core/sse.js — SSE live events + system heartbeat dots (flashDot). // Split from ui/home/index.html (inline script, lines 1237-1329 at v0.39.227). Load order is set by index.html; do not…
- `lib/ui/home/core/ui-state.js` (62 lines) — // ui/home/core/ui-state.js — NEXUS_UI_STATE reader for co-pilot + asSend. // Split from ui/home/index.html (inline script, lines 1966-2034 at v0.39.227). Load order is set by index.html; do not…

#### `lib/ui/import-project/`

2 other file(s).

- other: `lib/ui/import-project/import-project.css`, `lib/ui/import-project/import-project.html`

#### `lib/ui/lib/`

2 code · 1 test file(s).

- `lib/ui/lib/api.js` (57 lines)
- `lib/ui/lib/repo-ingest.js` (130 lines) — ui/lib/repo-ingest.js — shared client-side repo-ingest helpers §EXTRACTED 2026-09-03 — idearium/ui/js/app.js already has this exact

#### `lib/ui/themes/`

2 other file(s).

- other: `lib/ui/themes/nexus-dark.css`, `lib/ui/themes/nexus-light.css`

#### `lib/ui/tv-shell/`

1 code · 3 other file(s).

- `lib/ui/tv-shell/menu.js` (568 lines)
- other: `lib/ui/tv-shell/DECOMP.md`, `lib/ui/tv-shell/index.html`, `lib/ui/tv-shell/tv-shell.css`

#### `lib/ui/tv-shell/components/`

2 code file(s).

- `lib/ui/tv-shell/components/guardian.js` (54 lines) — ui/tv-shell/components/guardian.js Guardian channel component. Reads from /contract first, then polls
- `lib/ui/tv-shell/components/system-component.js` (241 lines) — ui/tv-shell/components/system-component.js Base class for all tv-shell channel components.

#### `lib/ui/tv-shell/forge-shell/`

1 other file(s).

- other: `lib/ui/tv-shell/forge-shell/index.html`

#### `lib/ui/tv-shell/nerve/`

1 code · 2 other file(s).

- `lib/ui/tv-shell/nerve/nerve.js` (387 lines) — ui/tv-shell/nerve/nerve.js — NEXUS Nerve System CFR field mapped onto nodes and wires rendered as a living nervous  
  requires 1 · required by 0
- other: `lib/ui/tv-shell/nerve/nerve.css`, `lib/ui/tv-shell/nerve/nerve.html`

#### `lib/ui/tv-shell/spotlight/`

1 code · 1 other file(s).

- `lib/ui/tv-shell/spotlight/spotlight.js` (481 lines) — ui/tv-shell/spotlight/spotlight.js Sovereign spotlight + pressure system.
- other: `lib/ui/tv-shell/spotlight/spotlight.css`

#### `lib/ui/tv-shell/tutorial/`

1 code file(s).

- `lib/ui/tv-shell/tutorial/tutorial.js` (183 lines)  
  tested by `tests/modules/tutorial-engine.test.js`

#### `lib/ui/tv-shell/warp-ui/`

2 code file(s).

- `lib/ui/tv-shell/warp-ui/nexus-shell.js` (409 lines) — ui/tv-shell/warp-ui/nexus-shell.js The NEXUS TV-shell Warp stream.  
  emits nexus.contract.loaded, nexus.ledger.entry, nexus.system.poll
- `lib/ui/tv-shell/warp-ui/warp-browser.js` (143 lines) — ui/tv-shell/warp-ui/warp-browser.js Browser-compatible Warp core — Event, Gate, Stream, Axiom.

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

#### `lib/warp/`

1 code · 7 other file(s).

- `lib/warp/index.js` (53 lines) — warp — pure functional event-driven devkit, decoupled. Event -> Gate -> Stream -> StreamLog, Axiom as an enforced primitive,  
  exports Gate, Axiom, Stream, StreamLog, fuseChain, canFuse +11 · requires 5 · required by 10 · tested by `lib/emergence/components/feedback-loop-buffer/test/ringbuffer.test.js`, `lib/emergence/components/rfr2-observer/test/affective-field.test.js` +5
- other: `lib/warp/CHANGELOG.md`, `lib/warp/LICENSE`, `lib/warp/MANIFEST.json`, `lib/warp/README.md`, `lib/warp/interaction-contract.json`, `lib/warp/package.json`, `lib/warp/plugins.zip`

#### `lib/warp/adapters/`

2 code file(s).

- `lib/warp/adapters/emerge-field.js` (20 lines) — // warp/adapters/emerge-field.js — Emerge's constraints as WARP 2's admit(). EM2: "Every link passes the constraints first (EM1)". // Outside warp/core on purpose: warp/core imports nothing…  
  exports admitFrom · requires 1 · required by 0
- `lib/warp/adapters/siso-gates.js` (26 lines) — // warp/adapters/siso-gates.js — WARP 1.x runs unchanged; this records it in WARP 2's ledger. // EM2 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec): "WARP 1.x gates (cos's 30+, loom's…  
  exports attach

#### `lib/warp/core/`

11 code file(s).

- `lib/warp/core/Axiom.js` (46 lines) — Axiom — an enforced invariant, same standing as Gate. This is the primitive the SISO paper doesn't have. Its constraints  
  exports Axiom, DEFAULT_WEIGHTS · requires 0 · required by 4
- `lib/warp/core/Engine.js` (111 lines) — // warp/core/Engine.js — WARP 2's engine. James: "still i want to make warp mine" · "no. i want warp 2" // EM2 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec).  
  exports Engine · requires 3 · required by 2
- `lib/warp/core/Event.js` (28 lines) — Event — immutable data packet. { type, data, uuid, ts }. Never mutated after creation. Matches SISO's Event shape exactly —  
  exports Event · requires 0 · required by 4
- `lib/warp/core/Expectation.js` (20 lines) — gapOf(expectation) — a broken expectation as a gap: both ends named.  
  exports createExpectation, gapOf · requires 0 · required by 2
- `lib/warp/core/Gate.js` (59 lines) — Gate — pure transform. matches(event) -> bool, transform(event) -> Event[]. v1.0.1 change: transform now RETURNS the events it produces instead of  
  exports Gate · requires 0 · required by 2
- `lib/warp/core/GateFusion.js` (89 lines) — GateFusion — v1.4 "gate fusion system." Merges an adjacent chain of pure Gates into a single Gate, so Stream.emit()'s recursive dispatch  
  exports fuseChain, canFuse · requires 2 · required by 2
- `lib/warp/core/Ledger.js` (46 lines) — // warp/core/Ledger.js — the causal ledger: append-only, hash-chained, causal by construction — each link's parent is // recorded at the moment it is known. Zero dependencies (FNV-1a here, like…  
  exports Ledger, canonical, fnv · requires 0 · required by 2
- `lib/warp/core/Link.js` (17 lines) — // warp/core/Link.js — WARP 2's atom: a LINK, cause → effect, carrying its field values. Not a message. // EM2 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec). James: "still i want to…  
  exports createLink · requires 0 · required by 2
- `lib/warp/core/Stream.js` (299 lines) — Stream — the dispatch loop. Same O(1) signature-lookup discipline as SISO's Stream. The addition: every transform runs through registered  
  exports Stream · requires 0 · required by 3
- `lib/warp/core/StreamLog.js` (112 lines) — StreamLog — append-only audit trail. Observes, never consumes. Same shape as SISO's log, plus axiom-check entries WARP's Stream writes.  
  exports StreamLog · requires 0 · required by 3
- `lib/warp/core/index.js` (15 lines) — // WARP 2 (EM2) — the link, the expectation, the causal ledger and the engine. 1.x stays beside it, unchanged.  
  exports Event, Gate, Axiom, Stream, StreamLog, fuseChain +6 · requires 10 · required by 8 · tested by `lib/warp/test/core.test.js`, `lib/warp/test/digest-regression.test.js` +3

#### `lib/warp/dispatch/`

8 code file(s).

- `lib/warp/dispatch/benchmark.js` (226 lines) — real measurements, not estimates. Three axes: build speed (construction + dispatch throughput), token cost (model-call reduction  
  requires 11 · required by 0
- `lib/warp/dispatch/canonicalize.js` (87 lines) — v1.4 addition. Two separate things live here on purpose, because they answer two different questions:  
  exports canonicalize, fingerprint, fingerprintKey, similarityScore · requires 0 · required by 5 · tested by `lib/warp/test/v1.4-additions.test.js`
- `lib/warp/dispatch/cascade.js` (114 lines) — model cascading (cheap-first cost pattern) + retry ladder. Generalizes seam-queue.js's context/shorter/forensic strategy shape  
  exports runCascade, runTwoStage · requires 0 · required by 2 · tested by `lib/warp/test/dispatch.test.js`, `lib/warp/test/v1.1.0-additions.test.js` +2
- `lib/warp/dispatch/deltaCache.js` (144 lines) — v1.4 "structural delta cache." Correcting scope up front: this is a STORAGE optimization, not a  
  exports computeDelta, applyDelta, DeltaCrystallizer · requires 1 · required by 1 · tested by `lib/warp/test/v1.4-additions.test.js`
- `lib/warp/dispatch/digest.js` (42 lines) — content-addressable cache key. Bazel/Buck2's exact pattern: hash(gate signature + versioned axiom set + canonicalized event content)  
  exports computeDigest, _canonicalize · requires 1 · required by 2 · tested by `lib/warp/test/digest-regression.test.js`
- `lib/warp/dispatch/index.js` (236 lines) — opts in (exactCacheOnFirstSuccess). See docs/warp-devkit-addendum-v1.4.1.spec. Default behaviour unchanged.  
  exports unifiedDispatch · requires 3 · required by 3 · tested by `lib/warp/test/dispatch.test.js`, `lib/warp/test/v1.1.0-additions.test.js` +1
- `lib/warp/dispatch/population.js` (196 lines) — scored archive per gate-class. AlphaEvolve/FunSearch pattern, scaled down: keep variants, not just one "best" attempt. Next  
  exports PopulationStore, DEFAULT_PROMOTE_THRESHOLD, DEFAULT_FITNESS_MIN, defaultPromotionPolicy, reuseCountPromotionPolicy, firstSuccessPromotionPolicy · requires 1 · required by 5 · tested by `lib/warp/test/dispatch.test.js`, `lib/warp/test/v1.1.0-additions.test.js` +1
- `lib/warp/dispatch/pregen.js` (53 lines) — v1.4 "pre-generation filter layer." Placement matters: this runs AFTER the exact-cache miss (step 1) and  
  exports preGenerationCheck, DEFAULT_THRESHOLD · requires 1 · required by 2 · tested by `lib/warp/test/v1.4-additions.test.js`

#### `lib/warp/plugins/`

2 code file(s).

- `lib/warp/plugins/crystallizer-flatfile.js` (59 lines) — default storage adapter for the exact-cache. Trivial in-memory + optional flat-file persistence. A consuming project  
  exports FlatFileCrystallizer · requires 0 · required by 4 · tested by `lib/warp/test/dispatch.test.js`, `lib/warp/test/v1.1.0-additions.test.js` +1
- `lib/warp/plugins/scorer-default.js` (40 lines) — five-axis fitness (coherence/friction/resonance/ entropy pattern + tokenEfficiency). Independently written — not  
  exports scoreDefault, estimateTokens · requires 0 · required by 2 · tested by `lib/warp/test/dispatch.test.js`, `lib/warp/test/v1.1.0-additions.test.js` +1

#### `lib/warp/spec/`

1 other file(s).

- other: `lib/warp/spec/warp.spec`

#### `lib/warp/test/`

5 test file(s).


#### `products/flight-recorder/`

2 other file(s).

- other: `products/flight-recorder/README.md`, `products/flight-recorder/product.json`

#### `products/flight-recorder/bin/`

1 code file(s).

- `products/flight-recorder/bin/flight-recorder.js` (120 lines) — FR4a: the flight recorder as one command, over any project folder. Product: flight-recorder (part of products/flight-recorder; the branch tool carries every file tagged so)  
  requires 5 · required by 0

#### `products/flight-recorder/lib/`

2 code file(s).

- `products/flight-recorder/lib/project.js` (95 lines) — FR4a: the flight recorder over any project folder, on its own. Product: flight-recorder (part of products/flight-recorder; the branch tool carries every file tagged so)  
  exports VERSION, ROOT, HOME, open, files, flush +1 · requires 6 · required by 1
- `products/flight-recorder/lib/versions.js` (40 lines) — FR4a: a project's versions, through Versionium in-process (no server). Product: flight-recorder (part of products/flight-recorder; the branch tool carries every file tagged so)  
  exports commit, list · requires 3 · required by 1

#### `scripts/`

16 code · 1 other file(s).

- `scripts/analyze-methodless-routes.js` (96 lines) — scripts/analyze-methodless-routes.js §WHY — scripts/generate-hooks.js declared 38 of 65 orphaned routes and
- `scripts/bench-file-prompt.js` (53 lines) — the benchmark behind the file prompt's size claim (§17.11: every performance claim names its benchmark, and reports the unfavourable case beside the favourable one).  
  requires 1 · required by 0
- `scripts/bench-warp2-vs-siso.mjs` (82 lines) — // scripts/bench-warp2-vs-siso.mjs — SISO vs WARP 1.x vs WARP 2, one workload, measured here. // James: "can you benchmark it?" · Run: node --expose-gc scripts/bench-warp2-vs-siso.mjs  
  requires 1 · required by 0
- `scripts/build-cos-app.js` (45 lines) — stage and build the COS Windows application (COSA6, 0.60.89) James, 2026-10-16: "cos app for windows"  
  exports stage, FILES · requires 2 · required by 0 · tested by `tests/modules/test-cos-app-build.test.js`
- `scripts/confirm-build.mjs` (60 lines) — // scripts/confirm-build.mjs — one command that proves the idearium loop works // end to end against a freshly-spawned service. Run: node scripts/confirm-build.mjs
- `scripts/fix-phasemap-yaml.js` (121 lines) — make a phasemap machine-readable without changing a word of it (0.39.300 LV1). Map: docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (LV1) — the synthesis's fill order put these first:  
  exports repair, foldAt, foldItem, sameWords
- `scripts/generate-atlases.js` (26 lines) — rewrite the generated section of every system atlas (lib/atlas-generate.js). node scripts/generate-atlases.js every system  
  requires 3 · required by 0
- `scripts/generate-hooks.js` (127 lines) — declare implemented routes from the code itself §WHY — verify-wires' reverse scan found 65 implemented routes with no
- `scripts/mco5-one-real-job.js` (112 lines) — scripts/mco5-one-real-job.js §MCO5 2026-09-13 — one real contract, one real UUID, submitted for real  
  requires 2 · required by 0
- `scripts/mco6-ic9-kill-and-restart.js` (136 lines) — scripts/mco6-ic9-kill-and-restart.js §MCO6/IC9 2026-09-13 — this phasemap's own literal gate: "kill the  
  requires 1 · required by 0
- `scripts/precommit-check.js` (425 lines) — mechanical enforcement of CLAUDE.md's rules. Install as a git hook: ln -sf ../../scripts/precommit-check.js .git/hooks/pre-commit  
  exports VERSION
- `scripts/release-zip.js` (51 lines) — VR1: the release zip, named and stamped with the one version. James (2026-10-14): "i also want versions in idearium, github, and each zip, needs to match."  
  exports build · requires 1 · required by 0
- `scripts/run-verification-manifest.cjs` (138 lines) — execute the real manifest §BUILT 2026-07-14 — the machine-readable half of VERIFICATION-LOG.md.  
  exports run · requires 2 · required by 0
- `scripts/update.js` (64 lines) — 'npm run update': the latest Nexus, without a zip. component_id: nexus.scripts.update  
  exports plan, run, versionAt, REPO
- `scripts/verify-boot.js` (153 lines)
- `scripts/verify-wires.js` (224 lines) — Wire Integrity Checker §17.7-DRIVEN — the actual missing primitive behind five separate
- other: `scripts/bump-version.py`

#### `skills/`

1 other file(s).

- other: `skills/james-brooks.skill`

#### `skills/james-brooks/`

1 other file(s).

- other: `skills/james-brooks/SKILL.md`

#### `skills/james-brooks/versions/`

1 other file(s).

- other: `skills/james-brooks/versions/2026-10-13-as-pasted.md`

#### `skills/nexus-session-changelog/`

1 other file(s).

- other: `skills/nexus-session-changelog/SKILL.md`

#### `tests/`

33 test file(s).


#### `tests/fixtures/`

1 test file(s).


#### `tests/helpers/`

3 test file(s).


#### `tests/lib/`

5 test file(s).


#### `tests/modules/`

749 test file(s).


#### `tests/modules/fixtures/`

1 test file(s).


#### `tests/probe/`

30 test file(s).


#### `tests/sim/`

2 test file(s).


<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.

---

**2026-10-16 (0.60.83)** — James: "can you remove eravos?" · "Delete it outright." ERAVOS is deleted: ui/eravos/ and its events left this atlas with it. The record of what it was is in git history and docs/2026-10-16-eravos-removal-phasemap.spec.
