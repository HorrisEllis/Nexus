# NEXUS SYSTEM — v5.1.0
## Complete Architecture in Emergence

**Author:** James Brooks (Erosmancer)  
**Language:** Emergence (.eg) — exclusively  
**Files:** 115  
**SNR:** 98.4%–100% across all files  
**Axiom violations:** 0  

---

> The spec is the container. The .eg file runs the system. No coding syntax exists in this session.

---

## Structure

```
nexus-eg/
├── foundation/          14 files — SISO primitives, Cobalt bus, FileStore, poll registry, admin server
├── memory/               6 files — JAA-DB (28 tables), agent-memory, continuous-stream, feedback-weighter, fix-map, lattice-index
├── core/                 7 files — RAID (4 files), translation, manifest-generator, usage
├── crystalball/          5 files — CrystalBall wiring, BEP engine, lattice-bridge, MCL, MQL (5-lane)
├── gate/                 3 files — gap-finder, gate-runner, healer
├── agents/               6 files — dispatcher, ollama, claude, base, chatgpt, gemini
├── orion/                4 files — sensor, record, policy, verify
├── versionium/           2 files — core, causality
├── automation/           2 files — engine, queue-manager
├── canvas/               9 files — renderer, cfr-physics, cfr-render, cfr-rewind, image-analyzer, node-inspector, rewind-scrubber, nas-router, tauri-ws
├── guardian-ext/        12 files — app, background, cfr, ir-layer, handshake, content, popup, module-base, claude, chatgpt, instagram, threads
├── guardian-server/      9 files — server, api-7820, wss-7821, jaa, memory-7823, dropzone-7822, cli, agents, cobalt-bridge
├── userscript/          16 files — toast, gates, tab-claim, siso-bus, dom-scanner, artifact-store, download-intercept, seam-tab, queue, snr-detector, pa, gap-hunter, greeting, gtci-inject, realtime-sync, tab-discovery
├── cockpit/              5 files — core (SISOKernel+JAA+Bayesian), pipeline (14 nodes+evaluator), forge (self-mod), cli, ui (v10)
├── idearium/             5 files — core (IdeaOS+tension+SNR), cli, api, event, gate
├── siphon/               3 files — siphon, pulse, watchman
├── seam/                 3 files — spec-parser, verdict-detector, seam-delivery
└── system/               4 files — boot, topology, data-flows, seam-contracts
```

---

## Ports

| Port | Layer | Purpose |
|------|-------|---------|
| 3748 | Cortex | Source of truth — JAA + Cobalt + RAID + ORION |
| 4800 | Forge/Idearium | IDE + pipeline + spec parser |
| 7800 | Rheon IDE | Seam language IDE |
| 7771 | Tauri WS | Desktop Rust bridge |
| 7820 | Guardian HTTP | Agent API + Cockpit |
| 7821 | Guardian WSS | Browser userscript bridge |
| 7822 | Dropzone | File server (LAN) |
| 7823 | Memory server | JAA query surface (LAN) |
| 11434 | Ollama | Local LLM |

---

## Laws

```
LAW_I    Local first — Ollama before cloud
LAW_II   JAA write before behavior
LAW_III  No module imports another — JAA only
LAW_IV   Schema over code
LAW_V    CLI first — UI is a skin
LAW_VI   Toast on every failure

§1.1  Nothing exists until proven
§1.2  Nothing silently fails
§2.1  Persistence is the golden rule
§M1   Every module: init(cfg) + stop() only
§M2   Modules only read/write declared tables
§M3   Poll interval is module configuration
§A3   Every row carries causedBy or source
```

---

## Using the Emerge compiler

```bash
node emerge-cli.js check foundation/siso-event.eg
node emerge-cli.js compile foundation/siso-event.eg
node emerge-cli.js watch          # watch all .eg files
```

---

*NEXUS SYSTEM v5.1.0 · All Emergence · James Brooks · Portland, Oregon · 2026*
