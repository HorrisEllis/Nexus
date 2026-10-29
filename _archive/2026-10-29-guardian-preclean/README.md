# 2026-10-29 — Guardian pre-clean (archived, not deleted — §0.3)

James, 2026-10-29: "Well, first of all, let's clean it. Pre-clean it out". Asked after the wiring report (scripts/wired-report.js) showed 23 of
Guardian's 82 files reached by nothing that runs.

## Archived here, and why
- `guardian/mesh/` (install.js, config.js, daemons.js, lib/: dns-server, firewall, reverse-proxy, ddns, crypto-engine, key-manager,
  host-rotation, port-registry, canvas-persistence, mesh-snr-filter) and `guardian/routes/mesh.js`.
  - His decision of 2026-09-06: "DNS/firewall/crypto/host-rotation is redundant and should be deleted." That pass archived the Clear Glass
    copies (clear-glass/src/network/install.js says so). These copies sat in a top-level `mesh/` folder. The 2026-10-24 refactor (RF2,
    commit dd11c6c9) moved them into guardian/mesh/ instead of retiring them.
  - The 09-06 archive folder is not in this repository, so these are the only copies left: archived, not deleted.
  - Nothing that runs loaded them. guardian/server.js never required routes/mesh.js. Only tests named them, through fixture models,
    not the files.
- `guardian/guardian-api.js`, the "Canonical Guardian v8 API Connector". Nothing required it.
  - Its memoryStats()/memoryIngest() call /memory/stats and /memory/ledger, which guardian/server.js has no handler for. This was
    recorded as a 404 bug in guardian/interaction-contract.json (2026-09-13).

## Looked at and kept
| File | Why it stays |
|---|---|
| `guardian/dropzone.js` (+ `dropzone-persist.js`) | A standalone CLI (start, stop, upload, qr). server.js points to it as the dropzone server run separately; it runs (commander is installed). |
| `guardian/guardian-service.js` | The launcher docs/2026-10-24-guardian-into-cos-phasemap.spec plans as the COS compartment's entry (GD8). It is the way to run Guardian in COS. |
| `guardian/lib/command-registry.js` | His 2026-09-17 feature (".command nodes as the source of truth"). Built, never wired. A wiring candidate, not dead code. |
| `guardian/lib/agent-model-nodes.js` | The only copy of the .agent_model nodes (its header still names copilot/lib). Built, never wired. A wiring candidate. |

To restore any of it, `git mv` it back.
