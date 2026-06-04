# NEXUS Architecture — v2.0

## Law: Bottom-up. Nothing exists until proven. Nothing silently fails.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NEXUS v2.0                                   │
│                                                                       │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│  │    SISO     │   │     JAA     │   │   BRIDGE    │               │
│  │  Event Bus  │   │ Persistence │   │  Message    │               │
│  │  (core)     │   │  (core)     │   │  Router     │               │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘               │
│         │                 │                  │                       │
│  ┌──────▼──────────────────▼──────────────────▼──────┐             │
│  │                    CORTEX :3748                    │             │
│  │   Source of truth. 28 JAA tables. RAID router.     │             │
│  │   event_log · gaps · failures · artifacts          │             │
│  │   memory_index · versionium · cortex_memory        │             │
│  └──────────────────────┬─────────────────────────────┘             │
│                         │ SISO channels                              │
│  ┌──────────────────────▼─────────────────────────────┐             │
│  │                  GUARDIAN :7820                     │             │
│  │   AI orchestration. WSS :7821. Job queue.           │             │
│  │   Userscripts → ChatGPT, Claude, Ollama             │             │
│  │   SEAM delivery engine.                             │             │
│  │                                                     │             │
│  │   ┌──────────────────────────────────────────────┐ │             │
│  │   │            FORGE IDE (guardian/ui/)           │ │             │
│  │   │  Universal file loader. Any file type.        │ │             │
│  │   │  Loads → chunks → SEAM → agent queue          │ │             │
│  │   │  Syncs: orchestrator · cortex · idearium      │ │             │
│  │   └──────────────────────────────────────────────┘ │             │
│  └──────────────────────┬─────────────────────────────┘             │
│                         │                                            │
│  ┌──────────────────────▼─────────────────────────────┐             │
│  │                 IDEARIUM :4800                      │             │
│  │   Idea OS. Every idea → spec → gap → build.        │             │
│  │   Push idea → bridge request → guardian queue       │             │
│  │   → agent chat → ledger sync                        │             │
│  └──────────────────────┬─────────────────────────────┘             │
│                         │                                            │
│  ┌──────────────────────▼─────────────────────────────┐             │
│  │               ORCHESTRATOR :9000                    │             │
│  │   Unified root. 77 proxied routes. SSE relay.       │             │
│  │   Built-in CLI REPL. Hotswap watcher.               │             │
│  │   Opens browser on boot. Manual command executor.   │             │
│  └──────────────────────────────────────────────────── ┘             │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
nexus-final/
├── siso/                     ← SISO core (ESM, shared)
│   ├── index.js              ← re-export
│   ├── Event.js              ← Event{type,data,uuid,ts}
│   ├── Gate.js               ← Gate{signature,transform()}
│   ├── Stream.js             ← Stream — O(1) dispatch
│   └── StreamLog.js          ← audit log
│
├── jaa/                      ← JAA core (CJS, server-side)
│   ├── jaa-store.js          ← flat-file, per-table Maps
│   ├── schema.sql            ← guardian 15 tables
│   └── schema-full.sql       ← full 28 table schema
│
├── bridge/                   ← Bridge :9999
│   ├── nexus-bridge.js       ← tag engine, request queue, SSE
│   └── ui/
│       └── index.html        ← Bridge UI (hotswap)
│
├── cortex/                   ← Cortex :3748
│   ├── boot.js               ← entry point
│   ├── foundation/
│   │   ├── siso/             ← CJS port of siso/ for cortex
│   │   ├── admin-server.js   ← HTTP + SSE
│   │   ├── cobalt-core.js
│   │   └── poll-registry.js
│   ├── memory/
│   │   ├── jaa-db.js         ← 28-table append-only store
│   │   └── agent-memory.js
│   ├── core/raid/index.js    ← RAID router → agents
│   ├── gate/gap-finder.js
│   ├── healer/index.js
│   ├── versionium/index.js
│   └── ui/
│       └── index.html        ← Cortex UI (hotswap)
│
├── guardian/                 ← Guardian :7820/:7821
│   ├── server.js             ← HTTP + WSS + SEAM + job queue
│   ├── cli.js                ← /code /spec /ask /file /multi
│   ├── jaa-store.js          ← 15-table guardian store
│   ├── memory.js             ← memory server :7823
│   ├── dropzone.js           ← file dropzone :7822
│   ├── userscript-chatgpt.js ← ChatGPT v8.3
│   ├── userscript-claude.js  ← Claude v8.3
│   └── ui/
│       └── index.html        ← FORGE IDE (hotswap) ★ priority
│
├── cockpit/                  ← Forge/Cockpit engine
│   ├── core.js               ← SISO + JAA + Guardian + Idearium clients
│   ├── forge.js              ← AI self-modification (Guardian→Ollama)
│   ├── pipeline.js           ← Pipeline engine + SEAM compiler
│   ├── cli.js                ← forge pipeline|seam|idea|gap|bus|jaa
│   └── ui/
│       └── index.html        ← Cockpit panel (hotswap)
│
├── idearium/                 ← Idearium :4800
│   ├── api/index.js          ← HTTP API
│   ├── core/index.js         ← IdeaOS
│   ├── cli/index.js          ← idea|spec|gap|push|snr
│   └── ui/
│       └── index.html        ← Idearium UI (hotswap)
│
├── emerge/                   ← Emerge IDE :4242
│   ├── io/                   ← 125 .eg source specs
│   ├── siso.js
│   └── ollama-runtime.js
│
│   ├── alk-kernel.js
│   ├── alk-gl.js
│   ├── cfr-physics.js
│   ├── cfr-render.js
│   └── cfr-mesh-bridge.js
│
├── cli/
│   └── nexus.js              ← Unified CLI (nexus <cmd> | nexus /<module>)
│
├── ui/                       ← Root UI folder (orchestrator serves)
│   ├── orchestrator/index.html
│   ├── bridge/index.html
│   ├── cortex/index.html
│   ├── guardian/index.html   ← copy of guardian/ui/index.html
│   ├── idearium/index.html
│   └── emerge/index.html
│
├── orchestrator.js           ← :9000 unified root + CLI REPL
├── emerge-ide.js             ← :4242 Emerge IDE entry
├── emerge-kernel.js          ← SNR gate + compiler
├── emerge.spec               ← 595 keywords
├── package.json
├── START.md
└── tests/
    └── kernel.test.js        ← 142/142
```

## SISO Channel Map (22 channels)

| From | Channel | To | Description |
|------|---------|-----|-------------|
| guardian | guardian.job.complete | cortex, bridge | Job finished |
| guardian | guardian.artifact | cortex, bridge | Code artifact |
| guardian | guardian.gaps | cortex | Gaps detected |
| guardian | guardian.ledger | jaa | Ledger entry |
| guardian | guardian.job.queued | bridge | Waiting for provider |
| cortex | cortex.gap.found | guardian, bridge | Gap detected |
| idearium | idearium.idea.created | cortex, bridge | New idea |
| idearium | idearium.snapshot.pushed | cortex | Snapshot |
| bridge | bridge.request.created | * | Request queued |
| bridge | bridge.request.complete | * | Request done |

## JAA Tables

### Cortex (28 tables — append-only JSONL)
event_log · bridge_messages · agent_calls · agent_signatures ·
artifacts · gaps · failures · fix_map · memory_index · memory_queries ·
conditioning_log · feedback_scores · crystals · bep_patterns ·
active_traces · orion_sessions · versionium_commits · versionium_branches ·
versionium_file_index · versionium_calendar · versionium_objects ·
schedules · workflow_runs · project_registry · shape_samples ·
poll_log · requests · cortex_memory

### Guardian (15 tables — snapshot JSON)
jobs · artifacts · ledger · sessions · settings · snapshots ·
downloads · agents · gaps · tags · seam_chunks · queue_runs ·
forge_sessions · memory_index · providers

### Cockpit/Forge (25 tables — IndexedDB)
ideas · specs · gaps · snapshots · links ·
pipelines · pipeline_runs · pipeline_steps ·
conditions · schedules · workflow_runs ·
api_configs · webhooks · variables ·
trust_scores · snr_records ·
event_log · artifacts · memory_index ·
tension_records · ci_runs · snr_samples ·
forge_sessions · seam_chunks · seam_programs

## Idea → Queue → Agent → Ledger Flow

```
POST /api/idearium/ideas { text }
  → IdeaOS.emit('idearium.idea.create')
  → idea persisted in idearium JAA
  → POST /bridge/requests { type:'job.dispatch', from:'idearium', to:'guardian' }
  → bridge.request.created broadcast
  → orchestrator picks up request
  → POST /guardian/command { provider, command:'code', prompt:idea.text }
  → guardian job created → queued (if no provider) OR dispatched
  → userscript injects prompt into AI tab
  → AI responds → GUARDIAN_COMPLETE
  → guardian.job.complete emitted on SISO bus
  → cortex: POST /api/event { type:'guardian.job.complete', payload }
  → cortex: artifact stored in artifacts table
  → guardian: ledger entry written
  → orchestrator SSE broadcasts to all clients
  → forge IDE: job appears in session log + ledger panel
  → idearium: idea.phase → 'building'
```

## Forge IDE Priority Design

The Forge IDE (guardian/ui/index.html) is the PRIMARY build interface:

1. **Universal file loader** — any file type: .js .ts .md .yaml .spec .eg .json .txt .py .html .css .sql .toml .sh
2. **SEAM chunker** — chunk any loaded content, auto-generate test contracts
3. **Guardian CLI hooks** — /code /spec /ask /file /multi all available as buttons
4. **Queue integration** — build queue from chunks, auto-inject via userscript
5. **Orchestrator sync** — all forge sessions synced to orchestrator SSE
6. **Ledger panel** — live ledger from cortex + guardian
7. **Artifact viewer** — all artifacts from this session + historical
8. **Gap tracker** — gaps from cortex + idearium
9. **Provider selector** — claude · chatgpt · ollama · gemini
10. **Hot context** — loads current idea from idearium, current job from guardian
