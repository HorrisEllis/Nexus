# NEXUS — Data Schemas

## JAA Tables (Cortex — 28 tables, append-only JSONL)

### event_log
```json
{
  "uuid":      "string — primary key",
  "type":      "string — dot.namespaced event type",
  "payload":   "object — event-specific data",
  "source":    "string — which system wrote this",
  "causedBy":  "string|null — uuid of parent event",
  "ts":        "number — unix ms"
}
```

### artifacts
```json
{
  "uuid":      "string",
  "hash":      "string — SHA-256 of content (dedup key)",
  "name":      "string — filename or label",
  "ext":       "string — file extension",
  "lang":      "string|null — programming language",
  "confidence":"number — 0..1",
  "content":   "string — up to 8000 chars",
  "chatId":    "string — source conversation",
  "ts":        "number"
}
```

### gaps
```json
{
  "uuid":      "string",
  "path":      "string — dot.path to gap location",
  "type":      "string — structural|temporal|logical|evidential",
  "severity":  "string — low|medium|high|critical",
  "body":      "string — gap description",
  "status":    "string — open|claimed|resolved|ignored",
  "claimedBy": "string|null — system that claimed it",
  "pressure":  "number — 0..1",
  "ts":        "number"
}
```

### agent_calls
```json
{
  "uuid":       "string",
  "prompt":     "string",
  "status":     "string — pending|dispatched|complete|failed",
  "routedTo":   "string — provider name",
  "claimedBy":  "string|null — tab/provider instance",
  "startedAt":  "number|null",
  "completedAt":"number|null",
  "response":   "string|null",
  "ts":         "number"
}
```

### cortex_memory
```json
{
  "uuid":       "string",
  "content":    "string — the memory",
  "source":     "string — which system produced this",
  "tier":       "string — hot|warm|cold|forgotten",
  "recalled_at":"number|null — last retrieval",
  "ts":         "number"
}
```

### versionium_commits
```json
{
  "uuid":       "string — commit id",
  "message":    "string",
  "branch":     "string — default: main",
  "parentHash": "string|null — parent commit uuid",
  "objects":    "string[] — list of versionium_objects uuids",
  "sigma":      "number|null — sigma score that triggered commit",
  "ts":         "number"
}
```

### crystals
```json
{
  "uuid":         "string",
  "content":      "string — distilled knowledge",
  "pattern_type": "string",
  "source_ids":   "string[] — source memory uuids",
  "confidence":   "number — 0..1",
  "state":        "string — candidate|active|decayed",
  "ts":           "number"
}
```

---

## Guardian JAA Tables (15 tables, JSON file)

### sessions
```json
{
  "id":         "string",
  "chatId":     "string",
  "chatUrl":    "string",
  "provider":   "string",
  "account":    "string",
  "name":       "string|null — named by agent",
  "tokenTotal": "number",
  "startedTs":  "number",
  "updatedTs":  "number"
}
```

### jobs (in-memory Map)
```json
{
  "id":         "string",
  "provider":   "string",
  "command":    "string — code|chat|spec|ask",
  "prompt":     "string",
  "content":    "string|null",
  "status":     "string — pending|dispatched|generating|complete|failed",
  "response":   "string|null",
  "error":      "string|null",
  "startedAt":  "number",
  "completedAt":"number|null"
}
```

### ledger_entries
```json
{
  "id":         "string",
  "ledgerType": "string",
  "category":   "string — UPGRADE|IDEA|EVENT|GAP|SYSTEM|INPUT|OUTPUT",
  "msg":        "string",
  "meta":       "object",
  "chatUrl":    "string",
  "account":    "string",
  "jobId":      "string|null",
  "ts":         "number"
}
```

---

## Bridge Tables (data/bridge/*.jsonl)

### tags
```json
{
  "uuid":       "string",
  "entityId":   "string — id of the tagged entity",
  "entityType": "string — idea|job|artifact|gap|spec|session|request",
  "system":     "string — which system owns the entity",
  "tags":       "string[] — tag values",
  "addedBy":    "string — who added these tags",
  "ts":         "number"
}
```
**Tag taxonomy:**
```
status:pending|accepted|rejected|processing|complete|failed
type:job|idea|spec|gap|artifact|crystal|event|request
priority:low|normal|high|critical
from:<systemId>
to:<systemId>
phase:<ideaPhase>
lang:<language>
provider:<providerName>
```

### requests
```json
{
  "uuid":       "string",
  "type":       "string — one of REQUEST_TYPES",
  "from":       "string — source system",
  "to":         "string — target system",
  "payload":    "object — request-specific data",
  "status":     "string — pending|accepted|rejected|processing|complete|failed",
  "priority":   "string — low|normal|high|critical",
  "tags":       "string[]",
  "acceptedBy": "string|null",
  "rejectedBy": "string|null",
  "reason":     "string|null — rejection reason",
  "result":     "object|null — completion result",
  "error":      "string|null",
  "createdAt":  "number",
  "updatedAt":  "number"
}
```

### handshakes
```json
{
  "uuid":       "string",
  "systemId":   "string",
  "appId":      "string",
  "sessionId":  "string",
  "createdAt":  "number"
}
```

### events (bridge ring buffer)
```json
{
  "uuid":       "string",
  "type":       "string — bridge event type",
  "bridgeTs":   "number",
  "bridgeId":   "string",
  "source":     "string|null"
}
```

---

## Idearium Data (data/idearium/)

### ideas
```json
{
  "uuid":      "string",
  "text":      "string",
  "phase":     "string — seed|expanding|tensioned|specced|building|complete|archived",
  "tension":   "number|null — 0..1",
  "specId":    "string|null",
  "links":     "string[] — linked idea uuids",
  "ts":        "number",
  "updatedAt": "number"
}
```

### snapshots
```json
{
  "uuid":      "string",
  "message":   "string",
  "snr":       "number — system SNR at time of push",
  "ideas":     "number — count",
  "specs":     "number — count",
  "gaps":      "number — count",
  "ts":        "number"
}
```

---

## Interaction Contract Schema

Every system exposes an interaction contract at `GET /api/contract`.

```json
{
  "version":    "string",
  "name":       "string — system identifier",
  "uuid":       "string",
  "baseUrl":    "string",
  "port":       "number",
  "commands":   [{
    "cmd":        "string — CLI command",
    "description":"string",
    "method":     "string — GET|POST|PUT|DELETE",
    "path":       "string — API path",
    "params":     "object — parameter schema",
    "output":     "string — return type description",
    "busEvent":   "string — SISO channel emitted"
  }],
  "events":     [{
    "channel":    "string — SISO channel",
    "description":"string",
    "payload":    "object — payload schema"
  }],
  "sseUrl":     "string",
  "bridgePort": 9999
}
```
