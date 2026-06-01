# NEXUS
## Boot order (bottom up)

```
npm run cortex      # port 3748 — source of truth (boot first)
npm run guardian    # port 7820/7821/7822/7823 — agent orchestration
npm run idearium    # port 4800 — idea OS
npm run emerge      # port 4242 — Emerge IDE
```

## File system

```
nexus/
├── package.json
│
├── siso/                    ← LAYER 0: Event bus primitives
│   ├── Event.js
│   ├── Gate.js
│   ├── Stream.js
│   ├── StreamLog.js
│   └── index.js
│
├── jaa/                     ← LAYER 1: Persistence
│   ├── jaa-store.js         ← Node.js JAA store (guardian uses this)
│   └── schema.sql           ← Guardian SQL schema (15 tables)
│
├── cortex/                  ← LAYER 2: Source of truth (port 3748)
│   ├── boot.js              ← START HERE: node cortex/boot.js
│   ├── cortex.js            ← REPL CLI: node cortex/cortex.js
│   ├── cobalt.manifest.json
│   ├── foundation/
│   │   ├── cobalt-core.js   ← CobaltBus + LEDGER + WATCHDOG + REGISTRY
│   │   ├── admin-server.js  ← HTTP + SSE on 3748
│   │   ├── poll-registry.js ← §M3 single poll declaration
│   │   ├── bus-log.js
│   │   └── siso/            ← SISO primitives (Cortex copy)
│   │       └── store/       ← FileStore + FileRefs (SHA-256 blobs)
│   ├── memory/
│   │   ├── jaa-db.js        ← 28 JSONL tables, append-only
│   │   └── agent-memory.js  ← event_log → memory_index distiller
│   ├── core/raid/           ← Local-first agent routing (Ollama before cloud)
│   ├── agents/
│   │   ├── index.js         ← Dispatcher
│   │   ├── ollama/          ← Local inference
│   │   └── claude/          ← Guardian HTTP dispatch
│   ├── gate/gap-finder.js   ← Stale/stuck/recurring gap detection
│   ├── healer/              ← Gap → fix_map resolution
│   ├── orion/               ← Sensor → Record → Policy → Verify
│   ├── versionium/          ← Sigma-triggered auto-commit
│   ├── automation/          ← Workflow engine
│   └── nas/                 ← File routing
│
├── guardian/                ← LAYER 3: Agent orchestration (7820/7821/7822/7823)
│   ├── server.js            ← node guardian/server.js
│   ├── cli.js               ← node guardian/cli.js
│   ├── jaa-store.js         ← Guardian JAA (15 tables, JSON file)
│   ├── memory.js            ← Memory server (port 7823)
│   ├── dropzone.js          ← Dropzone (port 7822)
│   ├── agents/index.js      ← Guardian agent dispatcher
│   ├── userscript-chatgpt.js ← Tampermonkey: chatgpt.com (PRIMARY)
│   └── userscript-claude.js  ← Tampermonkey: claude.ai
│
├── cockpit/                 ← LAYER 4: Control panel (served from 7820/cockpit)
│   ├── core.js              ← SISOKernel + JAA IndexedDB + Bayesian trust
│   ├── cli.js               ← CLI interaction contract (hotswappable)
│   ├── pipeline.js          ← 15 node types + SEAM evaluator
│   ├── forge.js             ← AI self-modification engine
│   └── cockpit.spec         ← Full system specification
│
├── idearium/                ← LAYER 5: Idea OS (port 4800)
│   ├── index.js
│   ├── core/index.js        ← IdeaOS + tension engine + SNR
│   ├── cli/index.js         ← CLI is truth
│   └── api/index.js         ← API is projection
│
├── emerge/                  ← LAYER 6: Emergence compiler (port 4242)
│   ├── emerge-kernel.js     ← JS seed — compiles .eg files
│   ├── emerge-ide.js        ← IDE server
│   ├── emerge.spec          ← SNR gate schema
│   ├── siso.js
│   ├── ollama-runtime.js
│   └── io/                  ← Drop .eg files here — kernel compiles automatically
│       ├── cortex.eg
│       ├── guardian-server.eg
│       ├── guardian-userscript.eg
│       ├── cockpit.eg
│       ├── idearium.eg
│       ├── versionium.eg
│       ├── gcanvas.eg
│       ├── emerge-ide.eg
│       ├── emerge-lsp.eg
│       ├── emerge-ollama.eg
│       └── emerge-voice.eg
│
├── gcanvas/                 ← ALK particle field engine
│   ├── alk-kernel.js        ← ALK event bus
│   ├── alk-gl.js            ← WebGL2 80k particles (tier 1)
│   ├── cfr-mesh-bridge.js   ← 34-attractor skeleton + cue→field
│   ├── cfr-physics.js       ← CPU particles (tier 2 fallback)
│   ├── cfr-render.js
│   ├── cfr-rewind.js
│   └── alk-devtools.html
│
├── ui/                      ← All HTML UIs
│   ├── cockpit.html         ← Guardian control panel (SEAM/Pipeline/Brain)
│   └── emerge-ide.html      ← Emerge IDE
│
└── data/                    ← Runtime data (gitignore this)
```

## Providers (ChatGPT is primary)

| Provider | How |
|----------|-----|
| ChatGPT  | Tampermonkey `guardian/userscript-chatgpt.js` → WSS 7821 |
| Claude   | Tampermonkey `guardian/userscript-claude.js` → WSS 7821 |
| Ollama   | Direct HTTP 11434 → RAID router local-first |

## Ports

| Port | Service |
|------|---------|
| 3748 | Cortex — source of truth |
| 4242 | Emerge IDE |
| 4800 | Idearium |
| 7820 | Guardian HTTP API + Cockpit UI |
| 7821 | Guardian WSS (providers connect here) |
| 7822 | Dropzone (LAN) |
| 7823 | Memory server (LAN) |
| 11434 | Ollama |
