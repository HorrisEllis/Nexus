# architect — hooks, blueprints and the block canvas

> **status: mapped (0.39.264)** · one process on :3747 · the design surface for how systems connect · a module of `nexus`, back up one level in `nexus-atlas.md`

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Architect is where connections are designed before they are built. Its spec, `architect/spec/architect.spec`, names its three jobs: a spec builder, a hook registry, and a blueprint scanner. A hook is a named, typed, wireable contract between two systems, with a direction, an event type, a wire type, a schema, a contract version and a failure mode. A blueprint is what a scan of a path produces: the components found there, the hooks and surfaces they expose, the constraints on them, and the gaps and tensions between them.

It boots in phase 3 of `nexus/autopilot.js`, and the order inside `architect/service.js` is itself a rule from the axioms (§3.1, load order is law): the JAA store first, then the hook registry, then blueprints, the signal-to-noise gate and translation, then HTTP, and registration with the orchestrator last. Nothing is served before the thing it reads from exists.

Its spec is candid about drift. It records that three sources disagreed on Architect's version: `lib/version.js` said 1.0.0, the spec itself had said 2.0.0 for a v2 design that was never built, and the boot event in `architect/service.js` hard-coded 3.0.0. The spec was synced to what runs, and the v2 design was kept in the spec as a proposal, not deleted.

---

## File Structure

```
architect/
  service.js                  the HTTP service :3747 — boot order, hook registry, blueprints, SNR
  compile-route.js            canvas JSON → spec compiler → compiled spec (and an Idearium spec)
  config.js                   its configuration
  registry-components.js      the routes it declares to the orchestrator
  interaction-contract.json   derived interaction contract
  schemas/                    node schemas: component, hook, wire, node, system, command, capability
    index.js
  src/
    ui/
      arch-builder.html       the block canvas (Idearium's Build › Architect)
      spec-builder.html       the spec builder
      alk-lattice.html        the lattice view
    spec/
      Blueprint.js            the blueprint model
  spec/
    architect.spec            what it is supposed to be
    architect.node-taxonomy.md
  docs/
    ARCHITECT-SPEC-v1.1.0.md  the earlier full specification
```

---

## Architecture

### The hook registry

Every cross-system connection NEXUS declares is a hook, and `architect/service.js` holds the registry of them, persisted to JAA before anything else runs (§2.1, the JAA write comes before the behavior). Loom syncs Architect's canonical hooks into its own registry on boot, which is the "architect/hooks-sync … canonical components" line in the boot log. Architect's own declared components in `architect/registry-components.js` include the hook registration and wiring receivers.

### Blueprints and the heal loop

A blueprint turns a path into a map of what is there and what is missing. That is why `diagnostic/nexus-heal-loop.js` goes through Architect: a gap is classified, Architect proposes a blueprint for the fix, and the proposal is emitted to the hook registry before `guardian` is asked for the patch. The blueprint model is `architect/src/spec/Blueprint.js`.

### The canvas and the compiler

`architect/src/ui/arch-builder.html` is the block canvas Idearium embeds under Build. `architect/compile-route.js` takes the canvas's JSON, converts it to the spec compiler's format, and runs the compile pipeline from `emerge/compiler/`: the T0 and T1 passes, the knowledge graph, the gap field, the tier map and the execution plan. A second route sends the compiled result to `idearium` as a spec, optionally linked to the idea it came from. Since 0.39.263 the orchestrator serves these canvases from `architect/src/ui/`, and opening Architect's UI without a file name lands on the block canvas.

### Node schemas

`architect/schemas/index.js` loads the node taxonomy every NEXUS system shares: `architect/schemas/schema.component`, `architect/schemas/schema.hook`, `architect/schemas/schema.wire`, `architect/schemas/schema.node`, `architect/schemas/schema.system`, `architect/schemas/schema.command` and `architect/schemas/schema.capability`. The same set is copied into several systems (compare `eravos/schemas/`), which is how each system describes itself in one vocabulary.

---

## Boundaries

| architect does | architect does not |
|---|---|
| hold the hook registry and design hooks | hold the component/hook/wire registry of record (that is `loom`) |
| scan paths into blueprints | apply patches (that goes through `guardian` and the apply gate) |
| compile the block canvas into a spec | store specs (that is `idearium`) |

---

## Tests

`tests/modules/architect-spec-builder-theme.test.js` covers the spec builder, and `tests/modules/test-architect-pulse-migration.js` its pulse.

---

## Version History

| release | what changed here |
|---|---|
| 0.39.263 | its canvases served from `architect/src/ui/` by the orchestrator |
| 0.39.264 | this atlas written, so the `architect` repo in Idearium opens into a real map |

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**24** files · **6** code files · **17** registry components declared here · **4** events emitted · **0** heard · **17** routes · **0** code files with a covering test

### Routes (17)

- DELETE /api/hooks/:id — Deprecate or remove hook · declared in `architect/registry-components.js`
- GET /api/blueprint — Blueprint list · declared in `architect/registry-components.js`
- GET /api/blueprint/history — Blueprint change history · declared in `architect/registry-components.js`
- GET /api/contract — Architect interaction contract · declared in `architect/registry-components.js`
- GET /api/hooks — Hook registry — all declared hooks · declared in `architect/registry-components.js`
- GET /api/hooks/:id — Single hook detail · declared in `architect/registry-components.js`
- GET /api/hooks/graph — Hook topology graph (json/mermaid) · declared in `architect/registry-components.js`
- GET /api/hooks/validate — Validate all hooks against invariants · declared in `architect/registry-components.js`
- GET /api/map — System topology maps · declared in `architect/registry-components.js`
- GET /health — Architect health + hook counts · declared in `architect/registry-components.js`
- PATCH /api/hooks/:id — Update hook metadata · declared in `architect/registry-components.js`
- POST /api/blueprint/diff — Diff two blueprints · declared in `architect/registry-components.js`
- POST /api/blueprint/route — Route intent via blueprint · declared in `architect/registry-components.js`
- POST /api/blueprint/scan — Scan path → generate blueprint · declared in `architect/registry-components.js`
- POST /api/hooks — Register a new hook · declared in `architect/registry-components.js`
- POST /api/hooks/check — Check hook against constraints · declared in `architect/registry-components.js`
- POST /api/hooks/wire — Wire two hooks together · declared in `architect/registry-components.js`

### Events it emits (4) — and who hears them

- **architect.snr.flagged** — from `architect/src/spec/Blueprint.js` → `nexus/nexus-bus.js` (core)
- **architect.blueprint.built** — from `architect/src/spec/Blueprint.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.snr.checked** — from `architect/src/spec/Blueprint.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **architect.snr.rewrite-required** — from `architect/src/spec/Blueprint.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)

### Files, directory by directory (7 directories)

#### `architect/`

4 code · 2 other file(s).

- `architect/compile-route.js` (406 lines) — /api/compile route handler Bridges the Architect canvas → spec-compiler pipeline.  
  exports createCompileRoutes, canvasToYAMLSpec, distillResult
- `architect/config.js` (25 lines) — real, distinct config, not inline constants scattered across architect/service.js. Matches the pattern  
  exports PORT, CORTEX_PORT, ORCH_PORT · requires 0 · required by 1
- `architect/registry-components.js` (40 lines) — architect/registry-components.js
- `architect/service.js` (742 lines) — The Architect HTTP Service Port: 3747  
  exports boot · requires 1 · required by 0
- other: `architect/interaction-contract.json`, `architect/package.json`

#### `architect/docs/`

1 other file(s).

- other: `architect/docs/ARCHITECT-SPEC-v1.1.0.md`

#### `architect/output/`

1 other file(s).

- other: `architect/output/.gitkeep`

#### `architect/schemas/`

1 code · 7 other file(s).

- `architect/schemas/index.js` (51 lines) — // architect/schemas/index.js — architect's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `architect/schemas/schema.capability`, `architect/schemas/schema.command`, `architect/schemas/schema.component`, `architect/schemas/schema.hook`, `architect/schemas/schema.node`, `architect/schemas/schema.system`, `architect/schemas/schema.wire`

#### `architect/spec/`

2 other file(s).

- other: `architect/spec/architect.node-taxonomy.md`, `architect/spec/architect.spec`

#### `architect/src/spec/`

1 code file(s).

- `architect/src/spec/Blueprint.js` (587 lines) — architect/src/spec/Blueprint.js L1 — Spec Engine  
  exports Blueprint, SNRGate, Translate, scanTopology, SNR_THRESHOLDS · emits architect.blueprint.built, architect.snr.checked, architect.snr.flagged, architect.snr.rewrite-required

#### `architect/src/ui/`

5 other file(s).

- other: `architect/src/ui/alk-lattice.html`, `architect/src/ui/arch-builder.html`, `architect/src/ui/architect_universe.svg`, `architect/src/ui/layered-snr-gates-axioms.svg`, `architect/src/ui/spec-builder.html`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
