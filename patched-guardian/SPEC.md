# Guardian v8 — Specification
## James Brooks / Nexus ecosystem

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER LAYER  (userscripts)                                           │
│                                                                         │
│  userscript_claude_v8.js          userscript_chatgpt_v8.js             │
│  ├── SESSION GREETING             ├── SESSION GREETING (GPT selectors) │
│  ├── ARTIFACT CAPTURE             ├── ARTIFACT CAPTURE                  │
│  ├── PROMPT ARCHAEOLOGY           ├── PROMPT ARCHAEOLOGY                │
│  ├── GAPHUNTER v3 (inline)        ├── GAPHUNTER v3 (inline)             │
│  ├── DOWNLOAD INTERCEPT           ├── DOWNLOAD INTERCEPT               │
│  ├── NAVIGATION WATCHER           ├── NAVIGATION WATCHER + TAB CLAIM   │
│  └── UI: Log|Artifacts|Gaps|API   └── UI: Log|Artifacts|Gaps|API       │
│                                                                         │
│  Sends: GUARDIAN_ARTIFACT, GUARDIAN_GAPS, GUARDIAN_CHUNK,              │
│         GUARDIAN_COMPLETE, GUARDIAN_DONE, GUARDIAN_PA_SESSION,         │
│         GUARDIAN_LEDGER_EVENT, GUARDIAN_FILE_UPLOAD, GUARDIAN_DOWNLOAD │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ WSS :7821 (TLS)
┌─────────────────────────────▼───────────────────────────────────────────┐
│  SERVER LAYER  (server.js — single entry point)                        │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  SISO STREAM BUS                                               │    │
│  │  ├── Gate: artifact.ingest    → Jaa INSERT + Dropzone upload   │    │
│  │  ├── Gate: gap.ingest         → GapStore + Ledger.idea         │    │
│  │  ├── Gate: job.complete       → Timeline + PA + Ledger.upgrade │    │
│  │  ├── Gate: session.named      → sessions table UPDATE          │    │
│  │  ├── Gate: ledger.event       → ledger_entries INSERT          │    │
│  │  ├── Gate: timeline.record    → timeline_events INSERT         │    │
│  │  └── Gate: setting.update     → settings UPDATE + broadcast    │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │ HTTP :7820   │  │ Dropzone     │  │ Memory/Jaa   │                 │
│  │ Guardian API │  │ :7822  LAN   │  │ :7823  LAN   │                 │
│  │ + Cockpit UI │  │ File server  │  │ SQL + query  │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## SISO Event Channels

| Channel | Trigger | Gates |
|---------|---------|-------|
| `guardian.artifact` | WS GUARDIAN_ARTIFACT | → Jaa artifacts, Dropzone, Ledger OUTPUT |
| `guardian.gap` | WS GUARDIAN_GAPS | → GapStore, Ledger.idea |
| `guardian.job.complete` | WS GUARDIAN_COMPLETE | → jobs UPDATE, PA session, Ledger.upgrade |
| `guardian.pa.session` | WS GUARDIAN_PA_SESSION | → pa_sessions INSERT |
| `guardian.ledger` | WS GUARDIAN_LEDGER_EVENT | → ledger_entries INSERT |
| `guardian.file.upload` | WS GUARDIAN_FILE_UPLOAD | → Dropzone autoUpload |
| `guardian.download` | WS GUARDIAN_DOWNLOAD | → downloads INSERT |
| `guardian.session.named` | HTTP POST /session/name | → sessions UPDATE |
| `guardian.setting.update` | HTTP PUT /settings/:key | → settings UPDATE + WS broadcast |
| `guardian.timeline` | any event | → timeline_events INSERT |

---

## HTTP API — Port 7820

### Jobs
```
POST /command           { provider, command, prompt, content? }  → { jobId, status }
GET  /jobs              ?status=&provider=&limit=                → { jobs[] }
GET  /status/:jobId                                              → { job }
GET  /response/:jobId                                            → { complete, response }
GET  /stream/:jobId     SSE                                      → chunks + done
DELETE /jobs/:jobId                                              → { ok }
```

### Artifacts
```
GET  /artifacts         ?lang=&chatId=&account=&limit=&after=   → { artifacts[] }
GET  /artifacts/:hash                                            → { artifact }
POST /artifacts         { content, name, lang, ... }            → { hash, id }
DELETE /artifacts/:hash                                          → { ok }
PUT  /artifacts/:hash/tags  { tags: [] }                        → { tags }
```

### Gaps
```
GET  /gaps              ?type=&domain=&status=&limit=           → { gaps[] }
GET  /gaps/summary                                               → { byType, drift, velocity }
GET  /gaps/catalogue                                             → full GapHunter taxonomy
POST /gaps/:id/close    { proof }                               → { gap }
POST /gaps/:id/ignore   { reason }                              → { gap }
```

### Ledger
```
GET  /ledger            ?category=&limit=&after=                → { entries[] }
POST /ledger            { category, msg, meta? }                → { entry }
GET  /ledger/metrics                                             → { ideas, upgrades, flow }
```

### Sessions
```
GET  /sessions          ?account=&provider=&limit=              → { sessions[] }
GET  /sessions/:id                                              → { session }
POST /sessions/:id/name { name }                                → { session }
GET  /sessions/:id/timeline                                     → { events[] }
```

### Timeline
```
GET  /timeline          ?personId=&channel=&from=&to=           → { events[] }
GET  /timeline/:personId/sigma                                  → trajectory
GET  /timeline/:personId/pressure                               → gap pressure over time
```

### PA (Prompt Archaeology)
```
GET  /pa                ?chatId=&limit=                         → { sessions[] }
GET  /pa/:id                                                    → { session, hypotheses }
```

### Memory / Query
```
GET  /memory/query      ?q=                                     → { artifacts[], gaps[], ledger[] }
GET  /memory/context    ?chatId=                                → full bundle
GET  /memory/stats                                              → store stats
```

### Settings (Cockpit)
```
GET  /settings                                                  → all settings
GET  /settings/:key                                             → { key, value }
PUT  /settings/:key     { value }                               → { key, value }
POST /settings/reset                                            → restore defaults
```

### Providers
```
GET  /providers                                                  → { claude, chatgpt, gemini, ollama }
POST /providers/:name/claim  { tabId }                          → { ok }
POST /providers/:name/release                                   → { ok }
```

### Cockpit
```
GET  /                  Cockpit dashboard HTML
GET  /health            { uptime, ports, counts, providers }
GET  /events            SSE — live SISO stream (all events)
```

---

## CLI Commands

```bash
# Jobs
guardian send <provider> "<prompt>"
guardian send claude "write a websocket handler in TypeScript"
guardian watch <jobId>                   # stream response
guardian jobs [--status pending|complete]
guardian kill <jobId>

# Artifacts
guardian artifacts [--lang ts] [--limit 20]
guardian artifact <hash>
guardian push <file>                     # upload to memory + dropzone

# Gaps
guardian gaps [--domain code] [--status open]
guardian gaps summary
guardian gaps catalogue [--domain <d>]
guardian close-gap <id> --proof "..."

# Ledger
guardian ledger [--category OUTPUT] [--limit 50]
guardian record --desc "..." [--domain code]
guardian commit --desc "..." --proof-metric 42

# Sessions
guardian sessions [--provider claude]
guardian session <id>
guardian name-session <chatId> "<name>"

# Settings
guardian settings                        # list all
guardian set <key> <value>
guardian reset-settings

# Providers
guardian providers                       # connection status
guardian claim claude                    # mark this process as active agent
guardian release claude

# Memory
guardian query "<text>"
guardian context [--chatId <id>]
guardian stats

# Server
guardian start                           # node server.js
guardian cockpit                         # open dashboard in browser
guardian health
```

---

## Cockpit Panels

### Panel 1: Live Stream
- Real-time SISO event feed (SSE from /events)
- Filter by channel/type
- Pause/resume

### Panel 2: Artifacts
- Searchable artifact store
- Filter by lang, account, chat, date
- Expand to see content, context, metadata
- Copy, download, push to dropzone
- Stats: total, by language, by account

### Panel 3: Gap Intelligence
- Gap heatmap by domain (GapHunter v3 taxonomy)
- Open/widening/narrowing status
- Drift score gauge (0–1)
- Velocity chart
- Per-gap: type, domain, reason, score, evidence
- Close/ignore controls

### Panel 4: Sessions & Timeline
- Session list with names, token totals, providers
- Timeline view per session (SISO events)
- PA session: waveform, tok/s, hypotheses, structure events
- Sigma trajectory

### Panel 5: Agent Controls
- Provider connection status (green/red dots)
- Claim/release tab controls
- Active jobs with stream preview
- Queue management

### Panel 6: Settings / Cockpit Config
All settings as interactive controls:

| Setting | Type | Range/Options |
|---------|------|---------------|
| session_greeting_enabled | toggle | on/off |
| session_greeting_text | textarea | free text |
| scan_debounce_ms | slider | 200–5000ms |
| artifact_max | slider | 100–5000 |
| gap_min_score | slider | 0.0–1.0 |
| pa_enabled | toggle | on/off |
| memory_auto_push | toggle | on/off |
| dropzone_auto_upload | toggle | on/off |
| stream_log_level | dropdown | OFF/EVENTS/DEEP/DATA |
| lan_host | text | 0.0.0.0 / 127.0.0.1 |
| greeting_delay_ms | slider | 500–5000ms |
| poll_interval_ms | slider | 100–2000ms |
| stable_count_threshold | slider | 2–10 |

### Panel 7: CLI
- Embedded terminal (xterm.js or textarea-based)
- Pre-built command palette
- History

---

## GapHunter Integration

The inline gap detection in the userscript is replaced with the full GapHunter v3 taxonomy:

```js
// Instead of 4 basic gap types:
const gaps = detectGaps(text);  // old

// Now: full taxonomy-aware detection
const gaps = gaphunterAnalyze(text, {
  domains: ['code', 'ai_ml', 'epistemological'],  // auto-detected
  minScore: 0.25,
  reasons: true,   // include WHY each gap exists
});
```

Each gap now carries:
- `type` — 16 types (GAP_TYPE)
- `domain` — 60+ domains
- `reason` — 9 existence reasons (WHY)
- `description` — human-readable
- `score` — 0–1 magnitude
- `evidence` — { text_sample, metric, pattern }

---

## Jaa Persistence

Jaa (PHP SQL engine) is accessed via the Guardian HTTP API.
Server.js talks to Jaa via HTTP at `http://127.0.0.1:8080/api.php` (if Jaa is running).
If Jaa is unavailable, Guardian falls back to flat-file JSON (current behavior).

SQL queries via server.js:
```js
await jaaQuery('INSERT INTO artifacts VALUES (?, ?, ?, ...)', [id, hash, name, ...]);
await jaaQuery('SELECT * FROM artifacts WHERE lang = ? ORDER BY ts DESC LIMIT ?', ['ts', 50]);
```

For Node.js-only deployments (no PHP), Guardian uses better-sqlite3:
```js
import Database from 'better-sqlite3';
const db = new Database('./guardian.db');
db.exec(fs.readFileSync('./schema.sql', 'utf8'));
```

---

## Prompt Archaeology Integration

PA data flows:
1. Userscript collects chunks → builds `pa.session` in memory
2. On `GUARDIAN_DONE` → sends `GUARDIAN_PA_SESSION` to server
3. Server gate → `pa_sessions` table INSERT
4. Cockpit renders waveform, hypotheses, structure events per session

New PA metrics surfaced:
- Burst zones (pre-planned content)
- Pause zones (inference hesitation)
- Structure events (mode shifts)
- Lexical compression (context pressure)
- Entropy trajectory
- tok/s waveform

---

## AXIOMS compliance

- §1.1 nothing exists until proven — all data validated before INSERT
- §1.2 nothing silently fails — all DB ops throw on error
- §1.3 no stubs — full implementations
- §2.1 persistence is golden rule — Jaa + flat-file fallback
- §4.3 enterprise+military grade — parameterized queries, input validation
- §5.1 UUID+hook+bus on everything — all events carry UUID
- §5.2 everything implements the bridge — all data through SISO gates
- §8.3 SISO+Jaa are load-order prerequisites — schema loaded on boot
