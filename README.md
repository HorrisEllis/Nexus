# NEXUS v1.0

## What this is
One folder. Drop on disk. Run in order.

## Boot order
```bash
node cortex/boot.js           # port 3748 — source of truth (always first)
node guardian/server.js       # port 7820/7821/7822/7823
node idearium/index.js        # port 4800
node emerge/emerge-ide.js     # port 4242
```

## File system
```
nexus/
├── siso/                     LAYER 0 — event bus primitives
├── jaa/                      LAYER 1 — persistence (jaa-store.js + schema.sql)
├── cortex/                   LAYER 2 — source of truth, port 3748
│   ├── boot.js               → node cortex/boot.js
│   ├── cortex.js             → node cortex/cortex.js (REPL)
│   ├── foundation/           cobalt-core, admin-server, poll-registry, siso, store
│   ├── memory/               jaa-db.js (28 tables), agent-memory.js
│   ├── core/raid/            local-first agent routing
│   ├── agents/               dispatcher, ollama, claude
│   ├── gate/                 gap-finder
│   ├── healer/               gap → fix_map
│   ├── orion/                sensor/record/policy/verify
│   ├── versionium/           sigma-triggered auto-commit
│   ├── automation/           workflow engine
│   └── nas/                  file routing
├── guardian/                 LAYER 3 — agent orchestration, 7820/7821/7822/7823
│   ├── server.js             → node guardian/server.js
│   ├── cli.js                → node guardian/cli.js
│   ├── jaa-store.js          15-table JSON store
│   ├── memory.js             port 7823
│   ├── dropzone.js           port 7822
│   ├── agents/               guardian agent dispatcher
│   ├── userscript-chatgpt.js Tampermonkey → chatgpt.com (PRIMARY)
│   ├── userscript-claude.js  Tampermonkey → claude.ai
│   └── userscript-patch.js   guardian-v83 nexus patch (drop into userscript)
├── cockpit/                  LAYER 4 — control panel, served from 7820/cockpit
│   ├── core.js               SISOKernel + JAA + Bayesian trust
│   ├── cli.js                CLI interaction contract
│   ├── pipeline.js           15 node types + SEAM evaluator
│   ├── forge.js              AI self-modification engine
│   └── cockpit.spec          full system spec
├── idearium/                 LAYER 5 — idea OS, port 4800
│   ├── index.js
│   ├── core/index.js         IdeaOS + tension engine + SNR
│   ├── cli/index.js          CLI is truth
│   └── api/index.js          API is projection
├── emerge/                   LAYER 6 — compiler + IDE, port 4242
│   ├── emerge-kernel.js      JS seed — compiles .eg files in io/
│   ├── emerge-ide.js         IDE server
│   ├── emerge.spec           SNR gate schema (living)
│   ├── siso.js
│   ├── ollama-runtime.js
│   └── io/                   184 .eg files — full system in Emergence
│       ├── agents/           6 files
│       ├── automation/       2 files
│       ├── cockpit/          5 files
│       ├── foundation/       14 files
│       ├── guardian-ext/     12 files
│       ├── guardian-server/  9 files
│       ├── idearium/         5 files
│       ├── memory/           6 files
│       ├── seam/             3 files
│       ├── siphon/           3 files
│       ├── system/           4 files
│       ├── userscript/       16 files
│       └── versionium/       2 files
│   ├── alk-kernel.js
│   ├── alk-gl.js             WebGL2 80k particles
│   ├── cfr-mesh-bridge.js    34-attractor skeleton
│   ├── cfr-physics.js
│   ├── cfr-render.js
│   ├── cfr-rewind.js
│   └── alk-devtools.html
├── seams/
│   └── seam-contracts.js
├── jaa/
│   ├── jaa-store.js
│   ├── schema.sql
│   └── schema-full.sql
├── ui/
│   ├── cockpit.html          Guardian control panel
│   └── emerge-ide.html       Emerge IDE
└── data/                     runtime data — gitignore
```

## Providers (ChatGPT is primary)
| Provider | Setup |
|----------|-------|
| ChatGPT  | Install `guardian/userscript-chatgpt.js` in Tampermonkey on chatgpt.com |
| Claude   | Install `guardian/userscript-claude.js` in Tampermonkey on claude.ai |
| Ollama   | Runs at localhost:11434, RAID routes local-first |

## Ports
| Port | Service |
|------|---------|
| 3748 | Cortex — source of truth |
| 4242 | Emerge IDE |
| 4800 | Idearium |
| 7820 | Guardian HTTP + Cockpit UI |
| 7821 | Guardian WSS (providers) |
| 7822 | Dropzone (LAN) |
| 7823 | Memory server (LAN) |
| 11434 | Ollama |
