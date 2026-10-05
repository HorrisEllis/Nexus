# eravos — the organism canvas

> **status: mapped (0.39.264)** · one process on :3751 plus a canvas in the browser · a sovereign system, not a UI folder · a module of `nexus`, back up one level in `nexus-atlas.md`

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Eravos is a canvas where small self-contained programs, called mods in its own tree and organisms in the canvas Idearium embeds, are placed, wired together and run against a shared transport clock. Its server header in `eravos/server.js` states the stance: Eravos is a sovereign system, not a UI folder, and a peer of the others. It has a kernel, a runtime, a mod registry, a wire system, an audio engine, a catalog, a pack loader and a bridge back to NEXUS. RAID routes compose, visualize and sequence intents to it, and guardian delivers mods that were built from a spec to it.

Its law is `eravos/ui/specs/ERAVOS.kernel.spec`. Fifteen kernel axioms govern everything on the canvas, and they are the same ideas NEXUS runs on, one zoom level in: nothing exists until it is registered in the mod registry; nothing fails silently; no mod touches another directly, because every connection is a wire and every wire is owned by the wire registry, not by the mods; every mutation is recorded in the causal ledger before it applies; hook contracts must match on both ends before a wire goes live; and the spec, not the runtime state, is the source of truth.

---

## File Structure

```
eravos/
  server.js                   the sovereign system :3751 — mods, wires, catalog, packs, transport
  config.js                   its configuration
  registry-components.js      the routes it declares
  schemas/                    the shared node taxonomy
    index.js
  spec/
    eravos.spec               the system spec
    eravos.node-taxonomy.md
  ui/                         the canvas itself (mods)
    index.html
    manifest.json
    kernel/
      kernel.js               the kernel: registry, wires, permissions
      intake.js               how a mod is taken in
    runtime/
      mod-factory.js          builds a mod from its definition
      wire-system.js          wires between mods
      master-transport.js     the shared play/stop/record transport
      precision-clock.js      the clock the transport rides
      alk-gl.js               the particle field
      canvas-wm.js            windows on the canvas
      canvas-cfr.js           CFR on the canvas
    catalog/
      catalog.js              what can be added
      catalog-ui.js           the catalog popup — New starts a mod in Idearium
    pack/
      pack-loader.js          installs packs of mods
    bridge/
      nexus-bridge.js         the canvas's line to NEXUS
    mods/                     one folder per mod (synths, sequencer, editors, NEXUS status cards)
    specs/                    kernel, pack format, build contract and per-mod specs
```

The canvas Idearium shows under Build › Eravos is a second copy served from `ui/eravos/`, described under **Two canvases** below.

---

## Architecture

### Server side

`eravos/server.js` registers with the orchestrator and serves Eravos's own API, declared in `eravos/registry-components.js`: mods (add, list, remove), wires (add, list), the catalog, pack installation, and the transport (play and stop). It keeps its own ledger in its data folder. The server does not render anything; it is the system of record for what is on the canvas.

### The canvas

The browser side is where mods run. `eravos/ui/kernel/kernel.js` is the kernel the axioms describe, and every mod registers with it (KERNEL.registry) with its hooks, what it provides, what it requires and its permissions. `eravos/ui/runtime/mod-factory.js` turns a mod's definition into a mounted instance, `eravos/ui/runtime/wire-system.js` owns the wires between them, and `eravos/ui/runtime/master-transport.js` with `eravos/ui/runtime/precision-clock.js` gives every mod the same clock, so polling, sequencing and audio all ride one transport instead of their own timers.

A mod is a folder in `eravos/ui/mods/`: an engine that mounts into the kernel, a schema for what goes in and out, and a UI. The set runs from instruments (`eravos/ui/mods/acid-synth/`, `eravos/ui/mods/sequencer/`, `eravos/ui/mods/pads/`) through editors (`eravos/ui/mods/photo-editor/`, `eravos/ui/mods/video-editor/`) to live status cards for NEXUS's own systems (`eravos/ui/mods/nexus-cortex/`, `eravos/ui/mods/nexus-guardian/`, `eravos/ui/mods/nexus-idearium/`), which poll their system on the transport.

### New mods start in Idearium

The catalog's New button used to download a starter engine and schema file. Since 0.39.264 it starts the mod where every other piece of NEXUS work starts: as an idea in Idearium, or directly as a spec, which Idearium turns into a repo with its own compartment. Inside Idearium the canvas hands the request to the page by message and Idearium makes it with its own API; standalone, the canvas calls Idearium's API itself. The code is `eravos/ui/catalog/catalog-ui.js` and, in the embedded copy, `ui/eravos/catalog/catalog-ui.js`; Idearium's side is the message listener in `idearium/ui/js/app.js`.

### Two canvases

Eravos moved out of `ui/eravos/` into its own sovereign service in phase 74, and on 2026-09-20 its app layer was replaced with the v3-17 catalog export and "organism" was renamed "mod" throughout `eravos/`. The old copy in `ui/eravos/` was not removed, and it is the one the orchestrator serves and Idearium embeds (`ui/eravos/index.html`, organisms in `ui/eravos/organisms/`). They are now two contracts with different vocabularies. Both received the 0.39.264 change so they behave the same; reconciling them into one is open work, named in `nexus-atlas.md` under Known drift.

---

## Specs

`eravos/spec/eravos.spec` is the system spec, written from `eravos/registry-components.js` rather than from memory. The canvas's own specs are in `eravos/ui/specs/`: the kernel (`eravos/ui/specs/ERAVOS.kernel.spec`), the pack format (`eravos/ui/specs/eravos.pack.format.spec`), the build contract NEXUS builds mods against (`eravos/ui/specs/eravos.nexus.build-contract.spec`), genomes, ecosystems and behaviors (`eravos/ui/specs/eravos.genomes-ecosystems-behaviors.spec`), and one per built mod.

---

## Tests

`tests/modules/test-eravos-pulse-migration.js` covers its pulse; the catalog's idea and spec creation is proven in `tests/modules/test-cos-testenv-any-repo.js`, which runs both catalog copies in a sandbox and checks what they send.

---

## Version History

| release | what changed here |
|---|---|
| 0.39.264 | the catalog's New creates an Idearium idea or spec instead of a download; this atlas written |

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**96** files · **47** code files · **12** registry components declared here · **69** events emitted · **43** heard · **12** routes · **0** code files with a covering test

### Routes (12)

- DELETE /api/mods/:uuid — Remove an mod · declared in `eravos/registry-components.js`
- GET / — Main ERAVOS canvas — mods, wires, transport · declared in `eravos/registry-components.js`
- GET /api/catalog — Available mods from registry · declared in `eravos/registry-components.js`
- GET /api/mods — List all mounted mods · declared in `eravos/registry-components.js`
- GET /api/wires — List all wires · declared in `eravos/registry-components.js`
- GET /contract — ERAVOS interaction contract · declared in `eravos/registry-components.js`
- GET /health — ERAVOS health · declared in `eravos/registry-components.js`
- POST /api/mods — Spawn an mod by id onto the canvas · declared in `eravos/registry-components.js`
- POST /api/pack/install — Install a .zip mod pack · declared in `eravos/registry-components.js`
- POST /api/transport/play — Start playback · declared in `eravos/registry-components.js`
- POST /api/transport/stop — Stop playback · declared in `eravos/registry-components.js`
- POST /api/wires — Connect two mod hooks · declared in `eravos/registry-components.js`

### Events it emits (69) — and who hears them

- **pad:trigger** — from `eravos/ui/mods/pads/pads.engine.js` → `eravos/ui/mods/acid-synth/acid-synth.engine.js`, `eravos/ui/mods/reese-bass/reese-bass.engine.js`, `eravos/ui/mods/sequencer/sequencer.engine.js`, `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` +8
- **intake:file** — from `eravos/ui/kernel/intake.js`, `eravos/ui/mods/timeline/timeline.engine.js` +1 → `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js`, `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js`, `eravos/ui/mods/sample-player/sample-player.engine.js`, `eravos/ui/mods/timeline/timeline.engine.js` +4
- **kernel:bpm-change** — from `eravos/ui/kernel/kernel.js`, `eravos/ui/runtime/master-transport.js` → `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js`, `eravos/ui/mods/sequencer/sequencer.engine.js`, `eravos/ui/runtime/mod-factory.js`, `ui/eravos/organisms/bass-drop-builder/bass-drop-builder.engine.js` (core) +2
- **seq:play** — from `eravos/ui/mods/sequencer/sequencer.engine.js`, `eravos/ui/mods/timeline/timeline.engine.js` +1 → `eravos/ui/mods/sequencer/sequencer.engine.js`, `eravos/ui/mods/timeline/timeline.engine.js`, `ui/eravos/organisms/sequencer/sequencer.engine.js` (core), `ui/eravos/organisms/timeline/timeline.engine.js` (core)
- **seq:stop** — from `eravos/ui/mods/sequencer/sequencer.engine.js`, `eravos/ui/mods/timeline/timeline.engine.js` +1 → `eravos/ui/mods/sequencer/sequencer.engine.js`, `eravos/ui/mods/timeline/timeline.engine.js`, `ui/eravos/organisms/sequencer/sequencer.engine.js` (core), `ui/eravos/organisms/timeline/timeline.engine.js` (core)
- **transport:play** — from `eravos/ui/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js`, `eravos/ui/mods/timeline/timeline.engine.js`, `ui/eravos/organisms/nexus-shared/nexus-node-core.js` (core), `ui/eravos/organisms/timeline/timeline.engine.js` (core)
- **org:state_sync** — from `eravos/ui/mods/acid-synth/acid-synth.engine.js`, `eravos/ui/mods/channel/channel.engine.js` +17 → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/canvas-intelligence.js` (core), `ui/eravos/runtime/organism-factory.js` (core)
- **audio:signal** — from `eravos/ui/mods/acid-synth/acid-synth.engine.js`, `eravos/ui/mods/supersaw/supersaw.engine.js` → `eravos/ui/mods/channel/channel.engine.js`, `ui/eravos/organisms/channel/channel.engine.js` (core)
- **org:analysis-ready** — from `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:asset_loaded** — from `eravos/ui/mods/timeline/timeline.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:bpm-detected** — from `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:clip_sync** — from `eravos/ui/mods/timeline/timeline.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:density-reset** — from `eravos/ui/mods/edm-lab/edm-lab.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:drop-fired** — from `eravos/ui/mods/edm-lab/edm-lab.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:grid_sync** — from `eravos/ui/mods/sequencer/sequencer.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:pad_lit** — from `eravos/ui/mods/pads/pads.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:playhead_update** — from `eravos/ui/mods/sample-player/sample-player.engine.js`, `eravos/ui/mods/timeline/timeline.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:slot-loaded** — from `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:stage-active** — from `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:state-sync** — from `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js`, `eravos/ui/mods/edm-lab/edm-lab.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:step_cursor** — from `eravos/ui/mods/sequencer/sequencer.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:step_set** — from `eravos/ui/mods/sequencer/sequencer.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:vocal-loaded** — from `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **org:waveform_ready** — from `eravos/ui/mods/sample-player/sample-player.engine.js` → `eravos/ui/runtime/mod-factory.js`, `ui/eravos/runtime/organism-factory.js` (core)
- **pad:bank-change** — from `eravos/ui/mods/pads/pads.engine.js` → `eravos/ui/mods/sequencer/sequencer.engine.js`, `ui/eravos/organisms/sequencer/sequencer.engine.js` (core)
- **seq:fire** — from `eravos/ui/mods/sequencer/sequencer.engine.js` → `eravos/ui/mods/pads/pads.engine.js`, `ui/eravos/organisms/pads/pads.engine.js` (core)
- **transport:record-start** — from `eravos/ui/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js`, `ui/eravos/organisms/nexus-shared/nexus-node-core.js` (core)
- **transport:record-stop** — from `eravos/ui/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js`, `ui/eravos/organisms/nexus-shared/nexus-node-core.js` (core)
- **transport:recorded** — from `eravos/ui/runtime/master-transport.js` → `eravos/ui/mods/timeline/timeline.engine.js`, `ui/eravos/organisms/timeline/timeline.engine.js` (core)
- **transport:stop** — from `eravos/ui/runtime/master-transport.js` → `eravos/ui/mods/nexus-shared/nexus-node-core.js`, `ui/eravos/organisms/nexus-shared/nexus-node-core.js` (core)
- **mod:xy** — from `eravos/ui/mods/xy-pad/xy-pad.engine.js`, `eravos/ui/runtime/mod-factory.js` → `eravos/ui/mods/serial-bridge/serial-bridge.engine.js`
- **org:connected** — from `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` → `eravos/ui/runtime/mod-factory.js`
- **org:disconnected** — from `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` → `eravos/ui/runtime/mod-factory.js`
- **org:error** — from `eravos/ui/mods/macro-automation/macro-automation.engine.js`, `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` → `eravos/ui/runtime/mod-factory.js`
- **org:log** — from `eravos/ui/mods/webhook-automation/webhook-automation.engine.js` → `eravos/ui/runtime/mod-factory.js`
- **org:rx** — from `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` → `eravos/ui/runtime/mod-factory.js`
- **org:tx** — from `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` → `eravos/ui/runtime/mod-factory.js`
- **bass-drop:stage** — from `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **canvas:mod-spawned** — from `eravos/ui/runtime/mod-factory.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **canvas:window-closed** — from `eravos/ui/runtime/canvas-wm.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **catalog:removed** — from `eravos/ui/catalog/catalog.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **contrast:analysis** — from `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **edm:drop-fired** — from `eravos/ui/mods/edm-lab/edm-lab.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **edm:rhythm-step** — from `eravos/ui/mods/edm-lab/edm-lab.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:audio-ready** — from `eravos/ui/kernel/kernel.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:fault** — from `eravos/ui/kernel/kernel.js`, `eravos/ui/pack/pack-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:ledger-entry** — from `eravos/ui/kernel/kernel.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:mod-mounted** — from `eravos/ui/kernel/kernel.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:mod-unmounted** — from `eravos/ui/kernel/kernel.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:notify** — from `eravos/ui/bridge/nexus-bridge.js`, `eravos/ui/runtime/master-transport.js` +1 → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:pack-installed** — from `eravos/ui/kernel/kernel.js`, `eravos/ui/pack/pack-loader.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:wire-registered** — from `eravos/ui/kernel/kernel.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **kernel:wire-removed** — from `eravos/ui/kernel/kernel.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **mod:signal** — from `eravos/ui/mods/lfo/lfo.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:clip_added** — from `eravos/ui/mods/timeline/timeline.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:clip_removed** — from `eravos/ui/mods/timeline/timeline.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:exported** — from `eravos/ui/mods/photo-editor/photo-editor.engine.js`, `eravos/ui/mods/video-editor/video-editor.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:image_loaded** — from `eravos/ui/mods/photo-editor/photo-editor.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:lfo_tick** — from `eravos/ui/mods/lfo/lfo.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:meter** — from `eravos/ui/mods/channel/channel.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:mode-changed** — from `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:pumped** — from `eravos/ui/mods/sidechain-compressor/sidechain-compressor.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:step** — from `eravos/ui/mods/macro-automation/macro-automation.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:triggered** — from `eravos/ui/mods/acid-synth/acid-synth.engine.js`, `eravos/ui/mods/supersaw/supersaw.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:video_loaded** — from `eravos/ui/mods/video-editor/video-editor.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **org:xy_update** — from `eravos/ui/mods/xy-pad/xy-pad.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **photo:exported** — from `eravos/ui/mods/photo-editor/photo-editor.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **serial:rx** — from `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **video:exported** — from `eravos/ui/mods/video-editor/video-editor.engine.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)

### Events it hears from elsewhere (6)

**midi:note** · **ui:config_change** · **ui:transport-bpm** · **ui:transport-play** · **ui:transport-record** · **ui:transport-stop**

### Files, directory by directory (68 directories)

#### `eravos/`

3 code file(s).

- `eravos/config.js` (22 lines) — real, distinct config, not inline constants scattered across eravos/server.js. Matches the pattern established  
  exports PORT, DATA_DIR, ORCH_URL · requires 0 · required by 1
- `eravos/registry-components.js` (39 lines)  
  exports systemId, version, port, label, purpose, wires +4
- `eravos/server.js` (271 lines) — ERAVOS Sovereign System Port: 3751  
  exports server · requires 1 · required by 0

#### `eravos/output/`

1 other file(s).

- other: `eravos/output/.gitkeep`

#### `eravos/schemas/`

1 code · 7 other file(s).

- `eravos/schemas/index.js` (51 lines) — // eravos/schemas/index.js — eravos's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: `eravos/schemas/schema.capability`, `eravos/schemas/schema.command`, `eravos/schemas/schema.component`, `eravos/schemas/schema.hook`, `eravos/schemas/schema.node`, `eravos/schemas/schema.system`, `eravos/schemas/schema.wire`

#### `eravos/spec/`

2 other file(s).

- other: `eravos/spec/eravos.node-taxonomy.md`, `eravos/spec/eravos.spec`

#### `eravos/ui/`

2 other file(s).

- other: `eravos/ui/index.html`, `eravos/ui/manifest.json`

#### `eravos/ui/bridge/`

1 code file(s).

- `eravos/ui/bridge/nexus-bridge.js` (134 lines) — ERAVOS NEXUS BRIDGE v1.0.0 bridge/nexus-bridge.js  
  emits kernel:notify

#### `eravos/ui/catalog/`

2 code · 1 other file(s).

- `eravos/ui/catalog/catalog-ui.js` (441 lines) — ERAVOS CATALOG UI v1.0.0 catalog/catalog-ui.js  
  requires 1 · required by 0
- `eravos/ui/catalog/catalog.js` (122 lines) — ERAVOS CATALOG REGISTRY v1.0.0 catalog/catalog.js  
  emits catalog:removed
- other: `eravos/ui/catalog/catalog.css`

#### `eravos/ui/kernel/`

2 code file(s).

- `eravos/ui/kernel/intake.js` (105 lines) — ERAVOS INTAKE v3.0.0 File identification, FNV hash, MIME detection, type routing.  
  emits intake:file
- `eravos/ui/kernel/kernel.js` (544 lines) — ERAVOS KERNEL v3.0.0 Axioms (from ERAVOS.kernel.spec):  
  emits kernel:audio-ready, kernel:bpm-change, kernel:fault, kernel:ledger-entry +5

#### `eravos/ui/mods/acid-synth/`

1 code file(s).

- `eravos/ui/mods/acid-synth/acid-synth.engine.js` (105 lines) — MOD: ACID SYNTH v1.0.0 id: eravos.acid-synth  
  emits audio:signal, org:state_sync, org:triggered · hears pad:trigger

#### `eravos/ui/mods/acid-synth/schema/`

1 other file(s).

- other: `eravos/ui/mods/acid-synth/schema/schema.json`

#### `eravos/ui/mods/bass-drop-builder/`

1 code file(s).

- `eravos/ui/mods/bass-drop-builder/bass-drop-builder.engine.js` (443 lines) — MOD: BASS DROP BUILDER v1.0.0 id: eravos.bass-drop-builder  
  emits bass-drop:stage, org:stage-active, org:state-sync, org:vocal-loaded · hears intake:file, kernel:bpm-change

#### `eravos/ui/mods/bass-drop-builder/schema/`

1 other file(s).

- other: `eravos/ui/mods/bass-drop-builder/schema/schema.json`

#### `eravos/ui/mods/channel/`

1 code file(s).

- `eravos/ui/mods/channel/channel.engine.js` (110 lines) — MOD: CHANNEL STRIP v1.0.0 id: eravos.channel  
  emits org:meter, org:state_sync · hears audio:signal

#### `eravos/ui/mods/channel/schema/`

1 other file(s).

- other: `eravos/ui/mods/channel/schema/schema.json`

#### `eravos/ui/mods/contrast-analyser/`

1 code file(s).

- `eravos/ui/mods/contrast-analyser/contrast-analyser.engine.js` (375 lines) — MOD: CONTRAST ANALYSER v1.0.0 id: eravos.contrast-analyser  
  emits contrast:analysis, org:analysis-ready, org:bpm-detected, org:mode-changed +1 · hears intake:file

#### `eravos/ui/mods/contrast-analyser/schema/`

1 other file(s).

- other: `eravos/ui/mods/contrast-analyser/schema/schema.json`

#### `eravos/ui/mods/edm-lab/`

1 code file(s).

- `eravos/ui/mods/edm-lab/edm-lab.engine.js` (447 lines) — ERAVOS EDM LAB ENGINE v2.0.0 id: eravos.edm-lab  
  emits edm:drop-fired, edm:rhythm-step, org:density-reset, org:drop-fired +1

#### `eravos/ui/mods/edm-lab/schema/`

1 other file(s).

- other: `eravos/ui/mods/edm-lab/schema/schema.json`

#### `eravos/ui/mods/lfo/`

1 code file(s).

- `eravos/ui/mods/lfo/lfo.engine.js` (140 lines) — MOD: LFO v1.0.0 id: eravos.lfo  
  emits mod:signal, org:lfo_tick, org:state_sync

#### `eravos/ui/mods/lfo/schema/`

1 other file(s).

- other: `eravos/ui/mods/lfo/schema/schema.json`

#### `eravos/ui/mods/macro-automation/`

1 code file(s).

- `eravos/ui/mods/macro-automation/macro-automation.engine.js` (131 lines) — MOD: MACRO AUTOMATION v1.0.0 id: eravos.macro-automation  
  emits org:error, org:state_sync, org:step

#### `eravos/ui/mods/macro-automation/schema/`

1 other file(s).

- other: `eravos/ui/mods/macro-automation/schema/schema.json`

#### `eravos/ui/mods/master-fx/`

1 code file(s).

- `eravos/ui/mods/master-fx/master-fx.engine.js` (79 lines) — MOD: MASTER FX v1.0.0 id: eravos.master-fx  
  emits org:state_sync

#### `eravos/ui/mods/master-fx/schema/`

1 other file(s).

- other: `eravos/ui/mods/master-fx/schema/schema.json`

#### `eravos/ui/mods/nexus-architect/`

1 code file(s).

- `eravos/ui/mods/nexus-architect/nexus-architect.engine.js` (33 lines) — MOD: ARCHITECT v1.0.0 id: eravos.nexus-architect

#### `eravos/ui/mods/nexus-architect/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-architect/schema/schema.json`

#### `eravos/ui/mods/nexus-bridge/`

1 code file(s).

- `eravos/ui/mods/nexus-bridge/nexus-bridge.engine.js` (33 lines) — MOD: NEXUS_BRIDGE v1.0.0 id: eravos.nexus-bridge

#### `eravos/ui/mods/nexus-bridge/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-bridge/schema/schema.json`

#### `eravos/ui/mods/nexus-cortex/`

1 code file(s).

- `eravos/ui/mods/nexus-cortex/nexus-cortex.engine.js` (33 lines) — MOD: NEXUS_CORTEX v1.0.0 id: eravos.nexus-cortex

#### `eravos/ui/mods/nexus-cortex/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-cortex/schema/schema.json`

#### `eravos/ui/mods/nexus-diagnostic/`

1 code file(s).

- `eravos/ui/mods/nexus-diagnostic/nexus-diagnostic.engine.js` (33 lines) — MOD: DIAGNOSTIC v1.0.0 id: eravos.nexus-diagnostic

#### `eravos/ui/mods/nexus-diagnostic/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-diagnostic/schema/schema.json`

#### `eravos/ui/mods/nexus-guardian/`

1 code file(s).

- `eravos/ui/mods/nexus-guardian/nexus-guardian.engine.js` (33 lines) — MOD: NEXUS_GUARDIAN v1.0.0 id: eravos.nexus-guardian

#### `eravos/ui/mods/nexus-guardian/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-guardian/schema/schema.json`

#### `eravos/ui/mods/nexus-idearium/`

1 code file(s).

- `eravos/ui/mods/nexus-idearium/nexus-idearium.engine.js` (33 lines) — MOD: IDEARIUM v1.0.0 id: eravos.nexus-idearium

#### `eravos/ui/mods/nexus-idearium/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-idearium/schema/schema.json`

#### `eravos/ui/mods/nexus-orchestrator/`

1 code file(s).

- `eravos/ui/mods/nexus-orchestrator/nexus-orchestrator.engine.js` (33 lines) — MOD: ORCHESTRATOR v1.0.0 id: eravos.nexus-orchestrator

#### `eravos/ui/mods/nexus-orchestrator/schema/`

1 other file(s).

- other: `eravos/ui/mods/nexus-orchestrator/schema/schema.json`

#### `eravos/ui/mods/nexus-shared/`

1 code file(s).

- `eravos/ui/mods/nexus-shared/nexus-node-core.js` (185 lines)  
  emits org:state_sync · hears transport:play, transport:record-start, transport:record-stop, transport:stop

#### `eravos/ui/mods/pads/`

1 code file(s).

- `eravos/ui/mods/pads/pads.engine.js` (165 lines) — MOD: DRUM MACHINE v3.1.0 Publishes org:* events on scoped sBus (instanceId-scoped).  
  emits org:pad_lit, org:state_sync, pad:bank-change, pad:trigger · hears midi:note, seq:fire

#### `eravos/ui/mods/pads/schema/`

1 other file(s).

- other: `eravos/ui/mods/pads/schema/schema.json`

#### `eravos/ui/mods/photo-editor/`

1 code file(s).

- `eravos/ui/mods/photo-editor/photo-editor.engine.js` (128 lines) — MOD: PHOTO EDITOR v1.0.0 id: eravos.photo-editor  
  emits org:exported, org:image_loaded, org:state_sync, photo:exported

#### `eravos/ui/mods/photo-editor/schema/`

1 other file(s).

- other: `eravos/ui/mods/photo-editor/schema/schema.json`

#### `eravos/ui/mods/reese-bass/`

1 code file(s).

- `eravos/ui/mods/reese-bass/reese-bass.engine.js` (149 lines) — MOD: REESE BASS v1.0.0 id: eravos.reese-bass  
  emits org:state_sync · hears pad:trigger

#### `eravos/ui/mods/reese-bass/schema/`

1 other file(s).

- other: `eravos/ui/mods/reese-bass/schema/schema.json`

#### `eravos/ui/mods/sample-player/`

1 code file(s).

- `eravos/ui/mods/sample-player/sample-player.engine.js` (95 lines) — MOD: SAMPLE PLAYER v3.1.0  
  emits org:playhead_update, org:state_sync, org:waveform_ready · hears intake:file

#### `eravos/ui/mods/sample-player/schema/`

1 other file(s).

- other: `eravos/ui/mods/sample-player/schema/schema.json`

#### `eravos/ui/mods/sequencer/`

1 code file(s).

- `eravos/ui/mods/sequencer/sequencer.engine.js` (197 lines) — MOD: SEQUENCER v4.0.0 id: eravos.sequencer  
  emits org:grid_sync, org:state_sync, org:step_cursor, org:step_set +3 · hears kernel:bpm-change, pad:bank-change, pad:trigger, seq:play +1

#### `eravos/ui/mods/sequencer/schema/`

1 other file(s).

- other: `eravos/ui/mods/sequencer/schema/schema.json`

#### `eravos/ui/mods/serial-bridge/`

1 code file(s).

- `eravos/ui/mods/serial-bridge/serial-bridge.engine.js` (159 lines) — MOD: SERIAL BRIDGE v1.0.0 id: eravos.serial-bridge  
  emits org:connected, org:disconnected, org:error, org:rx +3 · hears mod:xy, pad:trigger

#### `eravos/ui/mods/serial-bridge/schema/`

1 other file(s).

- other: `eravos/ui/mods/serial-bridge/schema/schema.json`

#### `eravos/ui/mods/sidechain-compressor/`

1 code file(s).

- `eravos/ui/mods/sidechain-compressor/sidechain-compressor.engine.js` (82 lines) — MOD: SIDECHAIN COMPRESSOR v1.0.0 id: eravos.sidechain-compressor  
  emits org:pumped, org:state_sync · hears pad:trigger

#### `eravos/ui/mods/sidechain-compressor/schema/`

1 other file(s).

- other: `eravos/ui/mods/sidechain-compressor/schema/schema.json`

#### `eravos/ui/mods/supersaw/`

1 code file(s).

- `eravos/ui/mods/supersaw/supersaw.engine.js` (151 lines) — MOD: SUPERSAW v1.0.0 id: eravos.supersaw  
  emits audio:signal, org:state_sync, org:triggered · hears midi:note, pad:trigger

#### `eravos/ui/mods/supersaw/schema/`

1 other file(s).

- other: `eravos/ui/mods/supersaw/schema/schema.json`

#### `eravos/ui/mods/timeline/`

1 code file(s).

- `eravos/ui/mods/timeline/timeline.engine.js` (144 lines) — MOD: TIMELINE v3.1.0  
  emits intake:file, org:asset_loaded, org:clip_added, org:clip_removed +5 · hears intake:file, seq:play, seq:stop, transport:play +1

#### `eravos/ui/mods/timeline/schema/`

1 other file(s).

- other: `eravos/ui/mods/timeline/schema/schema.json`

#### `eravos/ui/mods/video-editor/`

1 code file(s).

- `eravos/ui/mods/video-editor/video-editor.engine.js` (156 lines) — MOD: VIDEO EDITOR v1.0.0 id: eravos.video-editor  
  emits org:exported, org:state_sync, org:video_loaded, video:exported

#### `eravos/ui/mods/video-editor/schema/`

1 other file(s).

- other: `eravos/ui/mods/video-editor/schema/schema.json`

#### `eravos/ui/mods/webhook-automation/`

1 code file(s).

- `eravos/ui/mods/webhook-automation/webhook-automation.engine.js` (109 lines) — MOD: WEBHOOK AUTOMATION v1.0.0 id: eravos.webhook-automation  
  emits org:log, org:state_sync

#### `eravos/ui/mods/webhook-automation/schema/`

1 other file(s).

- other: `eravos/ui/mods/webhook-automation/schema/schema.json`

#### `eravos/ui/mods/wobble-bass/`

1 code file(s).

- `eravos/ui/mods/wobble-bass/wobble-bass.engine.js` (131 lines) — MOD: WOBBLE BASS v1.0.0 id: eravos.wobble-bass  
  emits org:state_sync · hears pad:trigger

#### `eravos/ui/mods/wobble-bass/schema/`

1 other file(s).

- other: `eravos/ui/mods/wobble-bass/schema/schema.json`

#### `eravos/ui/mods/xy-pad/`

1 code file(s).

- `eravos/ui/mods/xy-pad/xy-pad.engine.js` (98 lines) — MOD: XY CONTROLLER v1.0.0 id: eravos.xy-pad  
  emits mod:xy, org:state_sync, org:xy_update

#### `eravos/ui/mods/xy-pad/schema/`

1 other file(s).

- other: `eravos/ui/mods/xy-pad/schema/schema.json`

#### `eravos/ui/pack/`

1 code file(s).

- `eravos/ui/pack/pack-loader.js` (201 lines) — ERAVOS PACK LOADER v1.0.0 pack/pack-loader.js  
  emits kernel:fault, kernel:pack-installed

#### `eravos/ui/runtime/`

8 code file(s).

- `eravos/ui/runtime/alk-gl.js` (897 lines) — ALK-GL — WebGL2 Particle Field Engine v1.9.0 Adapted for ERAVOS: ES6 exports → window.ALKGL
- `eravos/ui/runtime/canvas-cfr.js` (193 lines) — ERAVOS CANVAS CFR v1.0.0 runtime/canvas-cfr.js
- `eravos/ui/runtime/canvas-wm.js` (240 lines) — ERAVOS CANVAS WM v3.0.0 Window manager for the canvas space.  
  emits canvas:window-closed
- `eravos/ui/runtime/master-transport.js` (111 lines) — MASTER TRANSPORT v1.0.0 runtime/master-transport.js  
  emits kernel:bpm-change, kernel:notify, seq:play, seq:stop +5 · hears ui:transport-bpm, ui:transport-play, ui:transport-record, ui:transport-stop
- `eravos/ui/runtime/mod-factory.js` (3267 lines) — ERAVOS MOD FACTORY v3.0.0 Spawns any registered mod with its UI projection.  
  emits canvas:mod-spawned, intake:file, mod:xy · hears kernel:bpm-change, org:analysis-ready, org:asset_loaded, org:bpm-detected +21
- `eravos/ui/runtime/precision-clock.js` (302 lines) — PRECISION CLOCK v1.0.0 runtime/precision-clock.js
- `eravos/ui/runtime/precision-clock.worklet.js` (58 lines) — PRECISION CLOCK WORKLET v1.0.0 runtime/precision-clock.worklet.js
- `eravos/ui/runtime/wire-system.js` (285 lines) — WIRE SYSTEM v1.0.0 runtime/wire-system.js  
  emits kernel:notify

#### `eravos/ui/specs/`

8 other file(s).

- other: `eravos/ui/specs/ERAVOS.kernel.spec`, `eravos/ui/specs/eravos.genomes-ecosystems-behaviors.spec`, `eravos/ui/specs/eravos.mod.pads.spec`, `eravos/ui/specs/eravos.mod.sample-player.spec`, `eravos/ui/specs/eravos.mod.sequencer.spec`, `eravos/ui/specs/eravos.mod.timeline.spec`, `eravos/ui/specs/eravos.nexus.build-contract.spec`, `eravos/ui/specs/eravos.pack.format.spec`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
