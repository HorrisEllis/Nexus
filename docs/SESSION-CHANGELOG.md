> **⚠️ SUPERSEDED 2026-06-28 (session 3).** This file is retired as a living
> document. `docs/NEXUS-PHASE-MAP.md` is now the single living changelog/
> phase-map. Its own "Open Gaps Carried Forward" table below was audited
> against live code this session — see `NEXUS-PHASE-MAP.md`'s "CHANGELOG
> (session 3 — 2026-06-28): Consolidation" section for resolution status of
> every gap (F010–F012, GAP-001 through GAP-004, GAP-SEAM, GAP-FIELD-RESTORE,
> GAP-NODE-LEDGER-SEED). Kept below as historical record only — do not treat
> anything in this file as current without checking that section first.

# SESSION CHANGELOG — 2026-06-11
**Session:** NEXUS v3.0.0 Full Build
**Operator:** James Brooks (Erosmancer)
**Duration:** Full day
**Status at end:** Guardian working. Bridge working. Intelligence core built. Userscripts rebuilt. SEAM pending.

---

## Session Start State

Guardian was non-functional. Every dispatch threw `_write is not defined`. Jobs were lost on restart. `NEXUS_DOM_MAP` was spamming the console at hundreds of lines per minute. Bridge directory didn't exist. 9 rogue write paths bypassed the system architecture.

---

## All Failure Modes Found and Named

### F001 — uploadDir scope bug (FIXED)
- **File:** `guardian/server.js`
- **Fault class:** `scope_escape`
- **What:** `uploadDir` referenced before assignment in dropzone handler
- **Fix:** aliased from `cfg.uploadDir` at handler scope entry

### F002 — getLocalIPs() ghost call (FIXED)
- **File:** `guardian/server.js`
- **Fault class:** `ghost_call`
- **What:** `getLocalIPs()` called in boot but never defined
- **Fix:** implemented using `os.networkInterfaces()`

### F003 — _bootSystems never invoked (FIXED)
- **File:** `orchestrator.js`
- **Fault class:** `ghost_call`
- **What:** `_bootSystems` required but call was never made
- **Fix:** called after server listen

### F004 — nc.postBridge() ghost call (FIXED)
- **File:** `nexus-connect.js`
- **Fault class:** `ghost_call`
- **What:** `postBridge()` called in 3 places but never defined
- **Fix:** implemented — POST to Bridge `/bridge/event`

### F005 — requests table open to direct write (FIXED)
- **File:** `cortex/foundation/admin-server.js`
- **Fault class:** `rogue_bypass`
- **What:** `requests` in ALLOWED set for `POST /api/table/insert` — Bridge bypass possible
- **Fix:** removed `requests` from allowed direct-write tables, returns 400

### F006 — POST /api/tags was a stub (FIXED)
- **File:** `cortex/foundation/admin-server.js`
- **Fault class:** `stub_in_production` (§1.3 violation)
- **What:** `POST /api/tags` returned `ok:true` without writing anything
- **Fix:** implemented — writes event to event_log, returns entity ID + tags

### F007 — NAS router phantom requests (FIXED)
- **File:** `cortex/nas/router.js`
- **Fault class:** `phantom_write`
- **What:** NAS router polling for `file_resolve` requests that nothing ever created
- **Fix:** quarantines requests lacking Bridge provenance

### F008 — cliRequests/cliTag ghost calls (FIXED)
- **File:** `orchestrator.js`
- **Fault class:** `ghost_call`
- **What:** `cliRequests()` and `cliTag()` called in orchestrator CLI dispatch but never defined
- **Fix:** both functions implemented

### F009 — syncCanvasNodes wiped all attractors (FIXED)
- **File:** `ui/cfr.html`
- **Fault class:** `silent_failure`
- **What:** CFR field emptied on every quiet poll — `FIELD.attractors.filter(a => liveIds.has(a.id))` wiped everything when `/cfr/nodes` returned empty
- **Effect:** System nodes appeared, then vanished, cyclically (the "flash" bug)
- **Fix:** Only prune on non-empty response. Added `SYSTEM_ANCHORS` with `_anchor:true` flag — never pruned

### F010 — simpleHash() collision risk (OPEN)
- **File:** `guardian/userscript-*.js` (old versions)
- **Fault class:** `hash_drift`
- **What:** `simpleHash()` is not SHA-256 — collision risk for artifact dedup
- **Status:** Open. Fixed in new v10/v9 userscripts with `SubtleCrypto.digest('SHA-256')`

### F011 — localStorage state lost on tab close (OPEN → FIXED in new scripts)
- **File:** old userscripts
- **Fault class:** `context_loss`
- **What:** All state in localStorage — lost on tab close, cleared on browser restart
- **Status:** Fixed in v10/v9 userscripts with IndexedDB kernel

### F012 — No pre-prompt context injection (OPEN → FIXED in new scripts)
- **File:** old userscripts
- **Fault class:** `context_loss`
- **What:** Agents start cold every session — no prior context injected
- **Status:** Fixed in v10/v9 — queries `GET :3748/api/intelligence/context` before each prompt

### F013 — Dual orchestrator (FIXED)
- **File:** `ui/orchestrator.js` vs root `orchestrator.js`
- **Fault class:** `version_drift`
- **What:** The two files diverged — patches applied to ui/ didn't reach root
- **Fix:** Synced identical. Now always: patch root → `cp root ui/` in same operation

### F014 — Bridge directory didn't exist (FIXED)
- **File:** `bridge/` (entire directory)
- **Fault class:** `ghost_call`
- **What:** Bridge was referenced everywhere in the architecture but `bridge/` directory didn't exist
- **Fix:** Built from scratch — types, ledger, identity, router, registry, server, index

### F015 — _physQueue.enqueue bypassed Bridge (FIXED)
- **File:** `guardian/server.js`
- **Fault class:** `rogue_bypass`
- **What:** 3 `_physQueue.enqueue()` calls made directly without Bridge notification first
- **Fix:** Bridge notification added before each enqueue (§BRIDGE-GATE)

### F-NCP-001 — `_write is not defined` (FIXED — ROOT CAUSE OF DISPATCH FAILURE)
- **File:** `lib/ncp.js`
- **Fault class:** `ghost_call`
- **What:** `_write(client.res, data)` called inside `push()`, `pushTab()`, `broadcast()` and `ncpWrite()` but `_write` was never defined in `lib/ncp.js`. It exists in `ui/ncp.js` (browser-side) but was never ported to server-side.
- **Effect:** Every `ncp.push()` threw `ReferenceError: _write is not defined`. Every dispatch to a connected browser tab failed. The UI showed "streaming · poll N" but nothing ever arrived in the browser.
- **Fix:** Added `function _write(res, data) { try { res.write(...) } catch(_) {} }` inside `createNCPServer`, immediately after `const _clients = new Map()`
- **Confirmed:** ChatGPT tab responded with "ACK ✓" after fix

### F-JOBS-001 — Jobs lost on restart (FIXED — §2.1 VIOLATION)
- **File:** `guardian/server.js`
- **Fault class:** `phantom_write`
- **What:** `const jobs = new Map()` starts empty every boot. JAA persists jobs to disk (`jaa.insert('jobs', job)`) but nothing ever reloaded them back into the Map. After restart: `/jobs` returned empty array, `/status/:id` and `/response/:id` returned null for all prior jobs. Three jobs were present before patch session; after restart they were "gone" (still in JAA, not in Map).
- **Fix:** Added Phase 4.5 SOFT to guardian boot sequence — queries `jaa.query('jobs', () => true, 500)` and restores all records into `jobs` Map before server accepts traffic
- **Boot log:** `[guardian] §2.1 replayed N jobs from JAA`

### F-DOM-001 — NEXUS_DOM_MAP log spam (FIXED — §1.2 VIOLATION)
- **File:** `guardian/server.js`
- **Fault class:** `wiring_missing`
- **Gap type:** `boundary_gap`
- **What:** `NEXUS_DOM_MAP` messages from userscripts hit the `default` case which only called `console.log()`. Hundreds of lines per minute. Nothing written to cortex. Named nowhere in the system.
- **Fix:** Added `case 'NEXUS_DOM_MAP'` handler that:
  - Names the event: `guardian.dom_map.received`
  - Names the fault class: `wiring_missing` (now resolved)
  - Names the gap type: `boundary_gap` (now resolved)
  - Writes to cortex `event_log` via `_toCortex()`
  - Emits on guardian bus
  - Extracts node summaries for CFR analysis
- **Default case fix:** Rate-limited to cortex — first occurrence + every 50th. Console still logs once per new type.

---

## All Files Changed This Session

### New Files Created

| File | What it is |
|------|------------|
| `bridge/types.js` | Canonical Request schema — 16 types, 7 statuses, createRequest, patchRequest, validateRequest |
| `bridge/ledger.js` | SISO JSONL append-only ledger — write→written→update→updated→query→queried |
| `bridge/identity.js` | Token issuance — system secrets, MAX_TOKENS_PER_SYS=10, expired-first pruning |
| `bridge/registry.js` | HeartbeatManager wrapper — weight+fallback chains, held queue drain callback |
| `bridge/router.js` | ResolveGate→CircuitGate→RouteOpenGate→DispatchGate→ResultGate|HoldGate |
| `bridge/server.js` | Thin HTTP, 14 routes, SSE with 15s keepalive |
| `bridge/index.js` | 8-phase BootSequence |
| `service/bridge-service.js` | PID file manager, delegates to bridge/index.js |
| `lib/causal/compound.js` | CausalImpulse + ripple/wave/tidal propagation engine |
| `cortex/intelligence/index.js` | Pattern recognition, failure taxonomy, SEAM reuse, cross-ledger analysis |
| `contracts/SYSTEM-CONTRACTS.js` | 7 systems, 119 events, 21 fault classes, 76 verification checks, CAUSAL_PHYSICS model |
| `tests/brutal.test.js` | 187 tests, 30 sections, 125 crystallised invariants |
| `cli/session.js` | SESSION.md renderer — deterministic projection of Bridge ledger + system probes |
| `docs/AXIOMS-v2.0.md` | 45 axioms — Groups 1-14, includes causal physics, testing, SISO model |
| `docs/NEXUS-SYSTEM.md` | Full system document — architecture, all edges, all fault classes |
| `docs/specs/GUARDIAN-COMPLETE.md` | This rebuild guide |
| `docs/SESSION-CHANGELOG.md` | This file |

### Modified Files

| File | What changed |
|------|-------------|
| `orchestrator.js` | Bridge proxy block, SYS/HEALTH_PATHS/CHANNELS/UI_SYSTEMS/LEDGER updated, intelligence proxy, session command |
| `ui/orchestrator.js` | Always synced to root (never diverge again) |
| `cortex/boot.js` | Phase 4.5 (nope — that's guardian). Phase 5.3 SOFT: intelligence.init(), bridge.handshake, bridge.subscribe added |
| `cortex/foundation/admin-server.js` | registerIntelligence(), /api/intelligence/* routes, /api/contracts route, /api/tags fixed (F006), requests table gated (F005) |
| `cortex/nas/router.js` | Bridge provenance check, phantom quarantine (F007) |
| `guardian/server.js` | F001/F002/F015 fixed, NEXUS_DOM_MAP handler, job replay Phase 4.5, bridge.handshake phase, _handleNCPMessage._unhandled rate limiter |
| `lib/ncp.js` | **_write() defined inside createNCPServer** — F-NCP-001 root fix |
| `lib/cfr/ledger.js` | Compound engine wired, /cfr/compound endpoint, §CAUSAL-02 gate |
| `lib/cfr/field.js` | SYSTEM_ANCHORS, syncCanvasNodes fix |
| `nexus-connect.js` | postBridge() implemented (F004), PORTS map includes bridge:9999 |
| `ui/cfr.html` | syncCanvasNodes wipe-on-empty fix (F009), SYSTEM_ANCHORS added, demo timeout removed |
| `ui/ports.js` | bridge:9999 added |
| `ui/contracts.js` | BRIDGE contract block added |
| `cli/boot-systems.js` | Bridge first in boot sequence |
| `cli/diagnose.js` | diagBridge() rewritten, contractVerify() added, SYSTEM-CONTRACTS wired |
| `cli/nexus-repl.js` | bridge port, session command, systems help |
| `guardian/userscript-claude.js` | **Full rebuild v10.0** — IndexedDB kernel, SHA-256, intelligence injection |
| `guardian/userscript-chatgpt.js` | **Full rebuild v9.0** — same architecture, ChatGPT DOM selectors |
| `docs/NEXUS-SPEC.md` | Session rules, causal physics, contracts layer, build log |

---

## Architecture Decisions Made This Session

### Bridge is write authority (§9.1 — now law)
Not a feature, a constraint. Every cross-system request goes through Bridge. No system calls another system directly. Violated in 15 places at session start — all fixed.

### SESSION.md is a compiled artifact, not a manual document (§TRUTH-03)
`cli/session.js` renders it from Bridge ledger + orchestrator ledger + live probes. `DO NOT EDIT` warning in the file. Regenerate with `node cli/session.js`.

### Intelligence lives inside Cortex, not above Orchestrator
Cortex is the source of truth. Intelligence reads JAA, writes JAA, serves via `/api/intelligence/*`. Not a separate service. Not a new truth layer.

### Causal physics is a simulation substrate, not a debugging log (§11.4)
Three layers: structural (graph), residual (sigma), propagation (compound). Regime is emergent, not assigned. `compound.*` events never re-trigger analysis.

### ui/orchestrator.js must always be synced to root orchestrator.js
They diverged (F013). Rule: always patch root, always `cp` to ui/ in same operation. Never patch ui/ without patching root.

---

## Crystallised Invariants (125 passing)

From `tests/brutal.test.js`:
- bridge/types: 9 invariants (uuid unique, all 16 types, causedBy chain, patch immutable, 7 statuses, 16 types)
- bridge/ledger: 7 invariants (§2.1 persistence, held filter, update patches, etc.)
- bridge/identity: 5 invariants (handshake, verify, revoke, bridge-internal)
- bridge/router: 3 invariants (offline→held, circuitStatus, drainHeld safe)
- bridge/registry: 4 invariants (6 systems pre-populated, guardian→ollama fallback, etc.)
- bridge/server: 2 invariants (BRIDGE_PORT=9999, start/stop/pushSSE)
- causal/compound: 8 invariants (low-sigma=ripple, high-sigma=wave, chaotic=tidal, §CAUSAL-02, impulse physics)
- cfr/sigma: 5 invariants (0..0.4 nominal, error>nominal, 0..1 bounded, axes, high entropy)
- cfr/delta: 5 invariants (null→{0,0,0}, 60s=high friction, 200ms=low friction, all bounded)
- cfr/graph: 5 invariants (ingest, causal edge, ancestors, stats, highSigmaNodes)
- cfr/field: 5 invariants (update/snapshot/restore, 4 dimensions, 0..1 bounded, 4 regimes, restore)
- cfr/ledger: 4 invariants (open→file, record→{uuid,sigma,delta,cfr}, compound not re-triggered, JSONL)
- lib/queue: 7 invariants (§LAW II file write, pending list, claim, complete, fail, §2.1 restart, tags)
- lib/ess: 5 invariants (7-char hash, deterministic, different→different, write→hash, idempotent, §1.2)
- lib/node-ledger: 3 invariants (API methods, seed+get, §2.1)
- lib/boot-sequence: 4 invariants (construct, phase registers, SOFT continues, all-pass→ok)
- FileStore: 7 invariants (64-char SHA-256, idempotent, get roundtrip, §1.2 missing, has bool, canonical keys)
- FileRefs: 4 invariants (put+get, resolve hash, resolve unknown→null, mutable)
- SYSTEM-CONTRACTS: 17 invariants (7 systems, boot orders, 119 events, 19 gaps, 21 faults, F001..F015, 14 edges, 76 checks, 3 causal layers, §CAUSAL-07, bridge contract, JAA tiers, 3 compound classes, 7 factors)
- nexus-connect: 5 invariants (all functions, all ports, ok:false offline, never throws, _req never throws)
- cli/session: 3 invariants (file exists, markers present, 6 systems)
- seam-contracts: 2 invariants (5 contracts, name+between[2])

---

## Open Gaps Carried Forward

| ID | Description | Severity | Next action |
|----|-------------|----------|-------------|
| F010 | simpleHash in old userscripts | high | Deploy new v10/v9 scripts |
| F011 | localStorage in old scripts | high | Deploy new v10/v9 scripts |
| F012 | No context injection in old scripts | high | Deploy new v10/v9 scripts |
| GAP-SEAM | SEAM not working with new userscripts | medium | Test with ACTIVE tab claimed |
| GAP-FIELD-RESTORE | cfr/field.js restore() crashes on snapshot object | medium | Fix restore() to set dimensions directly |
| GAP-NODE-LEDGER-SEED | node-ledger seed() doesn't update in-memory index | medium | Add `this._index.set(entry.uuid, entry)` in seed() |
| GAP-001 | No unified `nexus` CLI binary | medium | Build cli/nexus.js wrapper |
| GAP-002 | Idearium ESM requires special boot | medium | Fix package.json type:module |
| GAP-003 | .eg files don't execute — decision needed | medium | Decide: keep as spec format or deprecate |
| GAP-004 | Guardian→Cortex realtime bridge not validated | medium | Integration test with both running |

---

## How to Start Next Session

```
1. cd D:\Backups\Downloads\nexus-patched-5\nexus-work
2. node orchestrator.js
   (waits for all 5 systems to boot)
3. node cli/session.js
   (renders SESSION.md — read this first)
4. Install/update Tampermonkey userscripts:
   - guardian/userscript-claude.js → Claude.ai tabs
   - guardian/userscript-chatgpt.js → ChatGPT tabs
5. Ask the 5 FORGE-SKILL orienting questions
6. Then build
```

**Test the fix worked:**
1. Open ChatGPT in browser with new userscript installed
2. Wait for Guardian tab widget to show ACTIVE (or click PASSIVE → claim)
3. In NEXUS UI → Guardian → Dispatch: provider=ChatGPT, command=code, prompt="test"
4. Should see status "streaming · poll N" and ChatGPT respond
5. Check `[guardian] §2.1 replayed N jobs from JAA` in boot log
6. Check NO `_write is not defined` errors in terminal
