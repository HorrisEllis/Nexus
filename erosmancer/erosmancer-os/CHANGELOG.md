# ErosmancerOS — Changelog

All verified changes only. Nothing pretends.

---

## [0.3.0] — 2026-09-29 — NEXUS 0.39.281: replay frames listed

**Why:** Clear Glass's ErosmancerOS workbench (Settings → ErosmancerOS → Workbench) lists replay frames so one can be
replayed. `GET /api/replay/frames` answered counts only, so no frame could be picked.

### Added
- `ScriptReplayQueue.list()` — every frame, newest first, as `{ frameId, tabId, commands (count), checkpoint,
  createdAt, replayCount, replaying }`. The commands themselves stay in the queue.
- `GET /api/replay/frames` returns `frames: list()` beside the unchanged `snapshot`.

### Verified
- `tests/replay.test.ts` 29/29. `tsc --noEmit`: the same 5 rootDir errors as 0.2.0 (tests outside src), no new ones.

---

## [0.2.0] — 2026-09-29 — NEXUS 0.39.279: a virtual pointer at coordinates

**Why:** James wanted the co-pilot to work Clear Glass "using a virtual input through erosmanceros … a interaction field
for xyz coords". Clear Glass's interaction field (clear-glass/src/page/field.js) names each target by its x/y centre;
this is the input half.

### Added
- `POST /api/input` `{ tabId, x, y, action: move|click|double|right|scroll|type, text?, deltaY? }` — attaches the tab,
  moves a real CDP cursor to (x, y) along the behaviour engine's curved path (from where it last was on that tab), then
  presses / double-clicks / right-clicks / scrolls / types (`Input.insertText` per character). Pushes an `input` event.
  Validates every field and answers `{ ok:false, error }` with the reason.
- `curvedPath(from, to, steps, jitter)` exported from `src/behavior/index.ts` — the same cubic-Bézier movement
  `moveSteps()` plans, ending exactly on the target.

### Verified
- `tsc --noEmit`: no new errors (the only error is the existing TS6059 rootDir/tests configuration).
- Not run against a live browser here; Clear Glass reaches it through `driver.erosInput` (main/index.js), which is
  unit-tested with the route faked (tests/modules/test-cg-field.test.js DP-05, ER-01).

---

## [0.1.0] — 2026-04-08 — Initial Architecture

**Status:** Foundation complete. No production deployments.

### Added
- `BridgeCore` — WebSocket CDP transport with:
  - Local CDP probe (`http://host:port/json/version` → `webSocketDebuggerUrl`)
  - Remote CDP (`wsUrl` direct)
  - Session management (`Target.attachToTarget`, flatten mode)
  - Pending command map with per-command timeouts
  - Exponential backoff reconnect (capped 30s, configurable ceiling)
  - Ping keepalive via `Browser.getVersion`
  - `tab:opened` / `tab:closed` lifecycle events from `Target.*` CDP events
- `SelectorEngine` — 7-strategy UUID → nodeId resolver:
  - `backendNodeId` via `DOM.describeNode`
  - `cssSelector` via `DOM.querySelector`
  - `xpath` via `DOM.performSearch` + `DOM.getSearchResults` (with `discardSearchResults` cleanup)
  - `textMatch` via `Runtime.evaluate` innerText scan
  - `attributeFingerprint` via stable attr CSS selector (`data-testid`, `aria-label`, `name`, `type`, `role`, `placeholder`, `href`)
  - `relativePosition` via anchor node + JS scan (implementation matches textMatch — not truly relational)
  - `boundingBox` via `document.elementFromPoint` with tag validation
  - Registry update on success (`updateNodeId`), `markMissing` on full chain failure
- `SignalDispatcher` — Priority queue with:
  - Sorted insert (binary search, 0 = highest priority)
  - Bounded retry with exponential backoff
  - CDP primitives: `click`, `type`, `hover`, `scroll`, `evaluate`, `navigate`, `screenshot`, `getAttribute`, `getProperty`, `waitForSelector`
  - `click` / `hover` via `DOM.getBoxModel` → centroid → `Input.dispatchMouseEvent`
  - `type` via `DOM.focus` + per-character `Input.dispatchKeyEvent`
  - `waitForSelector` with configurable deadline, 250ms poll interval
- `NodeRegistry` — UUID → Node store with:
  - Content-hash deduplication on `backendNodeId` (when present)
  - Attribute fingerprinting (volatile attrs excluded: `class`, `style`, `id`)
  - Tab-scoped lookup (`getByTab`)
  - Stale sweep (`sweepStale`) by `lastSeen` threshold
  - Tab eviction (`evictTab`)
  - Optional JSONL persistence
  - `node:registered`, `node:missing` events
- `Telemetry` — Structured JSONL logger:
  - In-memory ring buffer (configurable max)
  - Timed disk flush via `appendFileSync`
  - `debug` / `info` / `warn` / `error` levels
  - Filter API (`getEvents`)
  - `destroy()` triggers final flush
- `ErosmancerOS` — Top-level orchestrator:
  - Wires all modules in dependency order
  - `start()` → connect + `Target.setDiscoverTargets`
  - `shutdown()` → clean disconnect + destroy
  - High-level API: `click`, `type`, `evaluate`, `navigate`, `screenshot`
  - CDP escape hatch: `cdp(tabId, method, params)`
  - `status()` snapshot

### Known Issues (tracked from initial audit)
- `byTextMatch` and `byRelativePosition`: string interpolation in `Runtime.evaluate` — injection risk
- `BridgeCore`: no backpressure / concurrency cap on pending CDP commands
- `relativePosition` strategy: not relational — falls back to global tag scan
- Fallback chain is static (no per-node weighting, no resolution history)
- No resolution profile on `Node` (no `lastSuccessfulStrategy`, no success rates)
- Integration test suite: tests registry only — selector engine strategies have zero coverage without a live browser mock
