# ORCHESTRATOR (Compartment OS)
**UUID:** nexus-cos-0000-4000-0000-cosorch00001
**Layer:** 13 — orchestration (below self-model)
**Port:** :9000 (nexus-final implementation)
**Status:** active
**Source:** NEXUS-ORCHESTRATOR.spec, NEXUS-SPEC-v9.spec, MASTEVOS-v9.spec

---

## What it is

Compartment OS (COS). The orchestrator of all systems.

The **Control Panel** is the host shell — the primary COS compartment that manages all other compartments. Every system is a COS compartment. COS starts all compartments in declared boot order.

**Layer note:** Orchestrator is BELOW self-model in the stack. It manages compartments. Self-model observes everything. These are different jobs.

**Two distinct things in this system:**
1. **COS/Control Panel** — the compartment lifecycle manager (canonical v9.0 spec)
2. **nexus-final orchestrator.js** — the unified HTTP proxy + CLI entry point + §AXIOM source of truth (current build)

Both are documented here. The §AXIOM build is what's running. COS is what it's building toward.

---

## Axioms

| Axiom | Rule |
|-------|------|
| §AXIOM | Orchestrator starts first. All systems register here. All CLIs use recall. |
| LAW_V | CLI first — orchestrator is driven by CLI. Cockpit is a skin. |
| LAW_II | No state without a JAA row — every event persisted to `data/ledger/orchestrator.jsonl` |
| §1.2 | Nothing silently fails — every system transition is logged and broadcast |
| §2.1 | Persistence is the golden rule — ledger is append-only |

---

## What it does

### §AXIOM — Orchestrator is source of truth (current build)

**Boot order rule:** Orchestrator starts first. All other systems register to it.

**Connection flow (all systems):**
```
system boot → SISO event bus → kernel routing → orchestrator registration → heartbeat → bridge handshake → LIVE
```

**Registration:** All systems call `POST /api/register` on boot. Returns current registry state.

**Recall:** All CLIs use `GET /api/recall` (read-only ledger replay). Never write through recall — read only.

**Heartbeat:** All systems ping `POST /api/heartbeat` every 10 seconds.

**Watchdog:** Polls all systems every 10s. On transition: ledger entry + SSE broadcast → forge UI dots update. On bridge coming back online: reconnects SSE relay automatically.

### Routes (current build — :9000)

```
GET  /health                     — { ok, online, total, uptime, systems }
GET  /api/status                 — all systems map
POST /api/register               — §AXIOM: all systems call on boot
GET  /api/registry               — live heartbeat map
POST /api/heartbeat              — systems ping every 10s
GET  /api/ledger                 — in-memory ring + disk
POST /api/ledger                 — write entry
GET  /api/recall                 — full JSONL replay, filterable by system/type/since
GET  /api/channels               — all SISO channels (22)
GET  /api/bus                    — unified bus log
GET  /api/cli                    — CLI reference (all systems)
POST /api/exec                   — run CLI commands
GET  /sse                        — unified SSE (bridge + orchestrator events)
GET  /ports.js                   — canonical port map for all UIs
GET  /ui/:system                 — serve each system's UI with hotswap
GET  /api/bridge/*               — proxied to :9999
GET  /api/cortex/*               — proxied to :3748
GET  /api/guardian/*             — proxied to :7820
GET  /api/idearium/*             — proxied to :4800
```

**Ledger persistence:** `data/ledger/orchestrator.jsonl` — append-only. Replayed on boot.

### CLI REPL (cli/nexus-repl.js)

Opens in a dedicated terminal on boot. Every command dispatches through `/api/<system>/*`.

```
nexus> status                       — all systems health + registry heartbeat
nexus> jobs [n]                     — guardian job list
nexus> events [n]                   — cortex event log
nexus> gaps                         — all open gaps
nexus> ideas                        — idearium idea list
nexus> idea <text>                  — create idea
nexus> dispatch [provider] <prompt> — dispatch job
nexus> requests [status]            — bridge request queue
nexus> ledger [system] [n]          — ledger entries
nexus> recall [system] [n]          — §AXIOM: full ledger replay
nexus> bus [system] [n]             — SISO bus log
nexus> snr                          — idearium SNR
nexus> watchdog                     — live system monitor (Ctrl+C to stop)
nexus> watch                        — live bridge event stream
nexus> diagnose [system]            — per-system diagnostic sequence
nexus> ui                           — open orchestrator UI in browser
nexus> help
```

### Per-system CLIs (standalone, talk direct to that system)

```
node guardian/cli.js /code <provider> <prompt>
node guardian/cli.js /spec <provider> <file>
node guardian/cli.js status | jobs | providers | watch <jobId>

node idearium/cli/index.js idea add "text"
node idearium/cli/index.js idea list | show <uuid> | phase <uuid> <phase>
node idearium/cli/index.js gap list | snr
```

### COS compartment model (canonical target)

Every system is a COS compartment with:
- UUID, spec, map, API, CLI, event contract, config schema
- Compartment states: `created | running | stopped | error | snapshotted | sandboxed | replaying`
- Isolation levels 0–4: full isolation → loopback only → allowlist → proxied → open

### Control Panel — homepage (canonical target)

Block view of all current systems. Each block: system name+version, status, live sigma score, open gap count, last event ts, ports. Actions per block: VISIT, MANAGE, CLI, CONFIGURE, VERSIONS, SNAPSHOTS.

**Drag-drop registration:** Drag a new system onto the Control Panel → reads `.system` file → registers as COS compartment → generates settings tab → connects event stream → adds block.

**Settings tab auto-generation:** `config_schema` in `.system` file drives UI — no manual settings coding.

**Taskbar:** System tray indicator. Right-click menu (start/stop/restart each system, reboot NEXUS, diagnostic panel). Click → opens Control Panel. States: green (all healthy), amber (degraded), red (critical), grey (offline).

### File formats

**`.world`** — living compressed archive. Opening a `.world` boots a COS compartment. Contains: `project.spec`, `project.map`, all `.system` files, all `.iteration` files, Vortex commit history.

**`.system`** — one per system/compartment. Drives settings tab generation. Contains: config_schema, API map, CLI map, hook declarations, boot phase declaration.

**`.iteration`** — sigma-aware version history. Only `sigma delta > 0.15` creates a new `.iteration`.

**`.map`** — interaction maps, API/CLI map, hooks, manifest, living readme.

### Diagnostic system (cli/diagnose.js)

```
node cli/diagnose.js              — all systems
node cli/diagnose.js guardian     — single system
node cli/diagnose.js --watch      — retry every 10s until all pass
npm run diagnose
```

Checks per system: files, syntax, deps, ESM chain, contract JSON, live health, contract, CRUD.
Results: `tests/diagnose-results.json`

### UI hotswap

Edit `<system>/ui/index.html` → orchestrator detects change via file watcher → SSE broadcasts `orchestrator.ui.hotswap` → browser reloads. Supports: guardian, cortex, idearium, bridge, emerge, orchestrator UI dirs.

---

## JAA Tables

```
data/ledger/orchestrator.jsonl — append-only persisted ledger (§2.2)
SYSTEM_REGISTRY (in-memory)   — live system heartbeat map
```

---

## What it does NOT do

- Does not do AI work — routes, watches, remembers
- Does not replace per-system CLIs — wraps them via `/api/<system>/*`
- Does not allow recall to write — read-only (all CLIs use recall, recall is read-only)
- Does not start before all other systems — it starts FIRST and waits for others to register
- Does not bind port 3747 — reserved for Bridge OS only
- Does not allow UIs to bypass the interaction contract (LAW_VII)
- Does not hold the only copy of events — it proxies and persists, but Cortex holds the full truth
- Does not open a browser UI without being asked — `nexus> ui` is the command

---

## Open gaps (current build)

| ID | Description | Severity |
|----|-------------|----------|
| G-ORCH-01 | Control Panel block view not yet built | HIGH |
| G-ORCH-02 | `.world` file parser not yet implemented | HIGH |
| G-ORCH-03 | Drag-drop system registration not yet implemented | HIGH |
| G-ORCH-04 | Settings tab auto-generation not yet implemented | MEDIUM |
| G-ORCH-05 | Taskbar service (system tray) not yet implemented | MEDIUM |
| G-ORCH-06 | Reboot menu and diagnostic menu not yet in any UI | LOW |
