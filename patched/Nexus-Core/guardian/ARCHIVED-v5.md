# Guardian v5 — ARCHIVED

These directories contain **old Guardian extension code (v5)** that has been superseded by Guardian v8.

- **Do not use** these files for new development.
- The authoritative Guardian server is in `guardian-final/server.js` (HTTP :7820, WSS :7821).
- All NEXUS projects now connect to Guardian via `guardian-api.js` (the canonical connector).

## Port topology (v5 vs v8)

| | v5 (archived) | v8 (current) |
|--|--|--|
| Bridge | `:3747` | *(retired — Guardian IS the bridge now)* |
| HTTP API | `:3748` (NEXUS admin) | `:7820` (Guardian server.js) |
| WSS | — | `:7821` (TLS) |
| Dropzone | — | `:7822` |
| Memory | — | `:7823` |

Retained for historical reference only.
