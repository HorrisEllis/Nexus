# Guardian v7 — AI Bridge + Artifact Memory System

James Brooks / Nexus ecosystem

---

## What's new in v7

### 1. Artifact Tab (replaces Tokens tab)
- Full structured view of every code block, artifact, TypeScript file, etc. captured from Claude
- Shows: **email/account**, **chat URL**, **context** (surrounding message), **full content**, **language**
- Download detection — intercepts `<a download>` clicks and blob URLs
- Search + filter by language (ts, js, python, html, etc.)
- One-click Copy, Push to Memory, Open Chat

### 2. API Tab (remote agent endpoint)
- Start/Stop polling mode — turns this tab into a **LAN-addressable agent endpoint**
- Shows all Guardian HTTP endpoints for use from your other machine
- Export Context Bundle — full JSON snapshot of account, chat URL, all artifacts, session tokens
- Copy payload examples for dispatching jobs from a secondary machine

### 3. Guardian Memory Server (`guardian-memory.js`)
- Persistent flat-file JSON store — survives server restarts
- Full-text search across all artifacts, content, accounts, chat IDs
- LAN-accessible dashboard at `http://<LAN_IP>:7823`
- NEXUS/ALK/any system can `POST /ingest` events or `GET /query?q=...` 

---

## Setup

```bash
npm install
# Terminal 1 — Guardian bridge (userscript connection)
node server.js

# Terminal 2 — Memory system
node guardian-memory.js

# Or both at once (requires concurrently)
npm run all
```

**First run:** visit `https://127.0.0.1:7821/` in your browser and accept the self-signed cert.

---

## Userscript

Install `userscript_claude_v7.js` in Tampermonkey / Violentmonkey.

Requires `@grant GM_xmlhttpRequest` for cross-origin memory pushes.

---

## Using as a parallel agent (your other machine)

On Machine B, POST to Machine A's Guardian HTTP server:

```bash
# Find Machine A's LAN IP first (ipconfig / ifconfig)
# Then from Machine B:

curl -X POST http://192.168.1.X:7820/command \
  -H "Content-Type: application/json" \
  -d '{"provider":"claude","command":"code","prompt":"Write a WebSocket reconnect handler in TypeScript"}'

# Returns: { "ok": true, "jobId": "...", "status": "delivered" }

# Poll for result:
curl http://192.168.1.X:7820/response/<jobId>

# Or stream in real-time:
curl http://192.168.1.X:7820/stream/<jobId>
```

**Important:** guardian server.js binds to `127.0.0.1` by default (localhost only).
To expose to LAN, change the `server.listen` calls in `server.js`:
```js
server.listen(HTTP_PORT, '0.0.0.0', ...)   // was '127.0.0.1'
```
And add firewall rules as needed.

---

## Memory System API

```
POST /ingest              Push any event (artifact, ledger, job, download)
GET  /artifacts           List artifacts (filter: ?lang=ts&limit=50)
GET  /artifacts/:hash     Get one artifact
DELETE /artifacts/:hash   Remove artifact
GET  /query?q=websocket   Full-text search
GET  /context             Full context bundle (for agent injection)
GET  /ledger              Event ledger
GET  /downloads           Detected downloads
GET  /stats               Store statistics
GET  /health              Health check
GET  /                    Dashboard UI
```

### Ingest payload format

```json
{
  "type": "ARTIFACT",
  "payload": {
    "name": "reconnect.ts",
    "lang": "typescript",
    "content": "...",
    "chatUrl": "https://claude.ai/chat/...",
    "account": "james@example.com"
  },
  "source": "nexus"
}
```

Types: `ARTIFACT`, `LEDGER`, `DOWNLOAD`, `JOB_START`, `JOB_COMPLETE`, `CONTEXT_BUNDLE`, `FILE_UPLOAD`

---

## Port map

| Port | Service | Binding |
|------|---------|---------|
| 7821 | Guardian WSS (userscript) | 127.0.0.1 |
| 7820 | Guardian HTTP API | 127.0.0.1 |
| 7822 | Dropzone file server | 0.0.0.0 (LAN) |
| 7823 | Memory server | 0.0.0.0 (LAN) |

---

## AXIOMS compliance

- §1.1 nothing exists until proven — artifact store validates content before saving
- §1.2 nothing silently fails — all ingest returns ok/error
- §1.3 no stubs — full implementations, no placeholders
- §2.1 persistence — flat JSON on disk, survives restarts
- §4.3 enterprise grade — proper error handling, debounced saves, max limits
- §5.2 bridge — memory server is a first-class bridge endpoint
