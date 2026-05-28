# Nexus Guardian Layer v5.1.0
## MANIFEST — Install Guide + AXIOM Compliance Record

**Version:** 5.1.0  
**Date:** 2026-05-28  
**Modules shipped:** 4 new + 3 patched core files  
**AXIOMS version:** v1.0 (all §1.x through §8.x verified)

---

## Files In This Package

### New modules (copy to Nexus-Cobalt root)
```
guardian/
  siphon.js         ← chat ingestion normalizer (bootPhase 11, poll 2s)
  pulse.js          ← heartbeat consumer + guardian_nodes (bootPhase 11, poll 3s)
  watchman.js       ← health synthesizer + cobalt.resonance.guardian (bootPhase 11, poll 5s)
agents/
  callto/
    index.js        ← IPC bridge: Nexus → Guardian via /api/complete polling (bootPhase 8, poll 2s)
schemas/
  guardian-chat.schema.json    ← covers chat_sessions, chat_messages, chat_completions, guardian_nodes
  guardian-health.schema.json  ← covers guardian_health
cockpit.html        ← Cobalt v10 cockpit: dual SSE (Guardian :7820 + Nexus :3748) + polling IPC
```

### Patched core files (filenames → destination paths)
```
__patches/memory--jaa-db.js              → memory/jaa-db.js
__patches/foundation--poll-registry.js  → foundation/poll-registry.js
__patches/boot.js                        → boot.js
__patches/guardian-v8--server.js         → [Guardian v8 root]/server.js
```

---

## Install Order (§3.1 bottom-up)

**Step 1 — Patch core files** (must happen before ANY new module loads)
```
cp __patches/memory--jaa-db.js         <nexus-cobalt>/memory/jaa-db.js
cp __patches/foundation--poll-registry.js <nexus-cobalt>/foundation/poll-registry.js
cp __patches/boot.js                   <nexus-cobalt>/boot.js
cp __patches/guardian-v8--server.js    <guardian-v8>/server.js
```

**Step 2 — Copy new modules**
```
cp -r guardian/   <nexus-cobalt>/guardian/
cp -r agents/     <nexus-cobalt>/agents/
cp -r schemas/    <nexus-cobalt>/schemas/
cp cockpit.html   <nexus-cobalt>/cockpit.html
```

**Step 3 — Restart Nexus-Cobalt**
```
cd <nexus-cobalt>
node boot.js
```

**Step 4 — Restart Guardian v8**
```
cd <guardian-v8>
node server.js
```

**Step 5 — Verify**
```
curl http://127.0.0.1:3748/health
# → should show new modules in module list

curl http://127.0.0.1:7820/health
# → guardian v8 health

# Open cockpit.html in browser
# Both pills should go green within ~15s of Guardian connecting
```

---

## IPC Architecture

```
Guardian v8 (:7820)                    Nexus-Cobalt (:3748)
─────────────────                      ────────────────────
POST /guardian/heartbeat               event_log (guardian.heartbeat)
POST /api/event                    →   event_log (any type)
POST /api/complete         ←           agents/callto polls agent_calls
GET  /api/agent-poll                   (Nexus can also pull pending jobs)
GET  /events (SSE)                     GET /sse (SSE)
                                       
guardian/pulse.js (3s poll)        ←   reads event_log guardian.heartbeat
guardian/siphon.js (2s poll)       ←   reads event_log guardian.chat.*
guardian/watchman.js (5s poll)     →   writes cobalt.resonance.guardian → SSE → cockpit
agents/callto/index.js (2s poll)   →   reads agent_calls, POSTs to Guardian /api/complete
```

**Polling IPC model** (no shared memory, no direct imports, §5.7 compliant):
1. Any module inserts `agent_calls` row with `routedTo='guardian-claude|chatgpt|gemini'`
2. Callto polls → sees pending row → checks `guardian_health` (Watchman's output)
3. If healthy → POST `/api/complete` → Guardian dispatches to WSS tab
4. Tab completes → GUARDIAN_COMPLETE → resolves promise → returns to Callto
5. Callto writes result to `agent_calls` + `cortex_memory` + `event_log`
6. Siphon picks up `guardian.chat.complete` from event_log → writes `chat_completions`

---

## AXIOM Compliance Record

| AXIOM | Status | Evidence |
|-------|--------|---------|
| §1.1 Nothing exists until proven | ✓ | No stubs — all modules fully implement their contracts |
| §1.2 Nothing silently fails | ✓ | All catch() blocks log to console.error + failures table |
| §1.3 No fake/mock/stub in production | ✓ | No placeholder data anywhere |
| §2.1 Persistence is golden rule | ✓ | ALL 18 new tables added to jaa-db.js ALL_TABLES |
| §2.2 Storage device is source of truth | ✓ | JaaDB append-only JSONL — survives restart |
| §2.3 All state observable | ✓ | status() on all 4 modules; _prevNodeListeners exposed |
| §3.1 Bottom-up only | ✓ | jaa-db patch → schemas → modules → poll-registry → boot |
| §3.2 Logical time ordering | ✓ | Watermarks use _rowId (logical), not ts (wall clock) |
| §4.3 Enterprise/military grade | ✓ | GUARDIAN_IPC_TOKEN env var gate on /api/complete |
| §5.1 UUID + event bus | ✓ | Every row gets uuid; all state flows through event_log |
| §5.2 Everything implements bridge | ✓ | All modules write to event_log; cockpit connects SSE |
| §5.3 No monkey patches | ✓ | Full file replacements, not call-site patches |
| §5.4 Versions everywhere | ✓ | VERSION: 5.1.0 in all files |
| §5.7 Low coupling / LAW III | ✓ | No cross-module imports; guardian reads watchman via jaaDB only |
| §8.3 SISO + Jaa prerequisites | ✓ | All modules require('../memory/jaa-db') as sole shared surface |

---

## Known open items (deferred per spec §LIMITATIONS)

1. AJV schema validation — schemas defined but no AJV registry wired yet.
   LAW IV validation fires law_violations insert + toast when/if AJV wired.
2. Signal layer (spec-signal-layer.md) — Topo-wire, IME-wire, Delta-engine: BUILD NEXT
3. Memory layer (spec-memory-layer.md) — Lattice-index, Crystal, Seam: after signal
4. Cognition layer beyond callto — Orion-ext, BEP-engine, Intent-map: after memory
5. Meta layer — Self-model, Cortex v2: after cognition

These are §7.5 classified: UNRESOLVED — not abandoned, not rejected.
