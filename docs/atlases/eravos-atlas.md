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

## Copyright

Copyright © 2026 James Brooks (Erosmancer). rheon.world.
