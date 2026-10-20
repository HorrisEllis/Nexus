# Data census — 2026-10-20

Tree: `data` · 122 files · rules: docs/data-layout.spec `ownership:`

| goes to | files | size |
|---|---|---|
| architect | 1 | 0.1 KB |
| archive | 32 | 217.0 KB |
| ask | 2 | 2.3 KB |
| clear-glass | 1 | 0.1 KB |
| copilot | 11 | 51.5 KB |
| cortex | 18 | 712.3 KB |
| diagnostic | 8 | 12.5 KB |
| guardian | 15 | 27.0 KB |
| idearium | 4 | 11.8 KB |
| intelligence | 11 | 17.0 KB |
| loom | 1 | 0.1 KB |
| nexus | 2 | 4.3 KB |
| ollama-bridge | 2 | 3.6 KB |
| orchestrator | 6 | 53.2 KB |
| versionium | 8 | 680.8 KB |

## Code still naming the old paths (rewire before moving)

- `data/architect` — 2: architect/service.js, diagnostic/nexus-diagnostic.js
- `data/changelog-snapshot.json` — 1: orchestrator/lib/changelog.js
- `data/clear-glass` — 3: clear-glass/src/main/index.js, diagnostic/nexus-diagnostic.js, lib/agent-tools/tools/clear-glass/command-index.js
- `data/copilot` — 2: copilot/recursive-diagnose.js, diagnostic/nexus-diagnostic.js
- `data/diagnostic` — 1: diagnostic/nexus-diagnostic.js
- `data/guardian` — 14: cli/clear-idearium.js, cli/diagnose.js, cli/session.js, contracts/nodes/ledgers.node.js, contracts/nodes/systems.node.js, diagnostic/nexus-diagnostic.js, guardian/artifact-upload.js, guardian/config.js, guardian/lib/account-routing.js, guardian/lib/agent-registry.js, guardian/lib/jobs.js, guardian/server.js, lib/seam/queue.js, service/guardian-service.js
- `data/idearium` — 5: cli/session.js, contracts/nodes/systems.node.js, diagnostic/nexus-diagnostic.js, lib/repo-procedures.js, service/idearium-service.js
- `data/intelligence` — 3: diagnostic/nexus-diagnostic.js, intelligence/config.js, intelligence/synthesis/index.js
- `data/knowledge` — 1: nexus/nexus-knowledge.js
- `data/ledger` — 13: cli/clear-idearium.js, cli/compartments.js, cli/diagnose.js, cli/session.js, contracts/nodes/ledgers.node.js, contracts/nodes/systems.node.js, cos/archetype/nexus-system/lib/ledger.js, diagnostic/lib/causality.js, intelligence/lattice/fanin-listener.js, lib/ledger-store.js, lib/movement.js, lib/version.js, nexus/autopilot.js
- `data/ledger-store` — 1: lib/ledger-store.js
- `data/loom` — 6: diagnostic/nexus-diagnostic.js, lib/agent-tools/tools/query/nexus-map.js, lib/agent-tools/tools/query/nexus-status.js, loom/schema/cortex-sync.js, loom/server.js, scripts/run-verification-manifest.cjs
- `data/ollama` — 2: diagnostic/nexus-diagnostic.js, ollama/config.js
- `data/orchestrator` — 1: diagnostic/nexus-diagnostic.js
- `data/vector-index` — 1: lib/vector-memory.js
- `data/versionium` — 1: versionium/config.js

## His call (ask)

- `data/nexus-self/event_log.jsonl` — Nexus-as-a-repo metrics; one lib ref — his call
- `data/nexus-self/metrics.jsonl` — Nexus-as-a-repo metrics; one lib ref — his call
