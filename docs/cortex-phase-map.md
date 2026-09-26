# Cortex Organ Completion — Phase Map
*Per §3.3: written before any further line changes. Supersedes memory of the prior audit.*

## Current state vs `cortex.spec` (as of this map)

| Organ | Spec role | Actual state |
|---|---|---|
| `intelligence` | Detects co-occurrence/precursor patterns, emits `cortex.intelligence.pattern_crystallised` | **Real.** Bus-wired both directions. |
| `liminal-space` | 5 interstitial spaces, subscribes to 7 event types | **Real, now fixed.** Was silently broken on 2 of 7 inputs — see Fixed This Session. |
| `raid` (`cortex/core/raid`) | Subscribes `cortex.orion.classified` → decides → emits `cortex.raid.decided` | **Exists but not an organ.** Zero `bus.on`/`bus.emit`. Called directly from `boot.js`'s `/api/raid/decide` route only. |
| `orion` | Classifies requests → emits `cortex.orion.classified` | **Does not exist.** No file anywhere in the repo. |
| `gap-finder` | Watches for gaps → emits `cortex.gap.found` | **Does not exist as an organ.** `cortex.gap.found` is currently emitted ad hoc from `boot.js`, `spec-drift.js`, `file-integrity.js` — no dedicated gate. |
| `healer` | Consumes gaps, proposes/applies fixes | **Does not exist.** |
| `self-heal` | 5-level escalation ladder (`docs/self-heal.spec`) | **Does not exist as code.** Listed as a critical file in `tests/nexus-full-audit.js`; absent. |
| `escalation` | Friction ledger (`docs/escalation.spec`) | **Does not exist as code.** Same status — spec'd, audited-for, not built. |

## Fixed this session (foundation-layer, §14.4/§16.1 — closed before anything new is built on top)

1. `liminal-space` listened for `behavioral.drift.signal`; the real emitter (`meta/telemetry-codec/drift-engine.js`) emits `tc.drift.signal` with a different payload shape (`{serviceId, signal, confidence, evidence}`, not `{axis, concern}`). Renamed and remapped — verified end to end.
2. `jaa-db.js`'s `query(table, where, opts)` silently dropped any bare-number third argument instead of treating it as a limit, because `opts.limit` on a number is `undefined`. Fixed at the source so all four known call sites (`liminal-space`, `intelligence`, `replay-engine`, `component-registry`) are corrected without touching those files.
3. `liminal-space`'s `_checkCrystallisation` counted already-crystallised items toward its threshold, so a bucket that crossed threshold once re-fired `_crystallise()` + full forward-inference on every subsequent item, forever — a live §14.4 violation. Brought in line with the `!i.crystallised` convention already used elsewhere in the same file.

Still open, not yet fixed, not in scope for this map: `escalation.friction.increased` and `forge.patch.proposed` are dead listeners with no emitter anywhere — closed by building the `escalation` organ (Phase 2) and, for the forge one, out of scope until a forge-patch-proposing module exists (flagged, not silently dropped, per §0.3).

## Fault classes (§13.3 — named before the organs that use them are built)

From `docs/escalation.spec`, already specified, not yet encoded anywhere in code:
- Friction thresholds: `NOMINAL 0.0 / ELEVATED 0.4 / HIGH 0.7 / FAILURE_MODE 1.0`
- Per-attempt friction added: `0.10 / 0.20 / 0.35 / 0.50` for levels 0-3

From `docs/self-heal.spec`, level-0/1 fault taxonomy, also spec'd, not encoded:
`stale_module, timeout, api_degraded, queue_saturated, memory_pressure, bottleneck, circuit_breaker, import_error`

Phase 1 below turns these from spec prose into an actual schema, per §3.1 ("data schema before modules").

## Bottom-up build order

Each phase's exit gate is a passing test against real data, not "it seems to work" (§3.1, §12.2).

| Phase | Builds | Depends on | Gate |
|---|---|---|---|
| **0 — done** | Event-bus/JAA foundation fixes (this session) | — | Syntax-checked, blast radius traced to all 4 call sites |
| **1** | `fault_taxonomy` JAA table + schema; friction thresholds as data, not magic numbers in code | Phase 0 | A fault class can be inserted, queried, and its friction score read back |
| **2** | `cortex.escalation` organ — friction ledger, subscribes `cortex.heal.requested`, emits `cortex.escalation.friction_increased` / `cortex.escalation.failure_mode` | Phase 1 | Friction accumulates correctly across repeated failures of the same fault class and trips `FAILURE_MODE` at 1.0; `liminal-space`'s dead listener starts receiving real events |
| **3** | `cortex.self-heal` organ — 5-level ladder, subscribes `HEAL_REQUESTED` | Phase 2 (calls escalation to check/raise friction per level) | Each of the 5 levels is independently triggerable and testable; level 2 proposes via forge but never auto-applies (per spec) |
| **4** | `cortex.gap-finder` organ — subscribes `anomaly.detected` (real, from `meta/causal/anomaly.js`) + sigma records (`sigma-writer`), emits `cortex.gap.found` | Phase 0 (sigma/anomaly already wired independently) | A real anomaly or sigma breach produces a gap event traceable to its source |
| **5** | `orion` organ — classifies using `anomaly.detected` + sigma, emits `cortex.orion.classified` | Phase 4 | Classification output is deterministic for a given input (§14.2 — pure function) |
| **6** | Rewire `raid` — subscribe `cortex.orion.classified` in addition to the existing direct-call route (route becomes a thin consumer, not a bypass, per §3.4) | Phase 5 | RAID decides identically whether triggered by the route or by the event |

## Phase 2 — actual result (corrected from the plan above)

Built as `cortex/self-heal/escalation.js`, not `cortex/escalation/` — `tests/nexus-full-audit.js` already expected this exact path and a `wireAnomalyTrigger(bus)` function subscribing to `anomaly.detected`; I'd missed cross-checking that against Phase 1's file placement, so Phase 1's `fault-taxonomy.js` was relocated from `cortex/escalation/` to `cortex/self-heal/` to match. Real event names, confirmed against existing code rather than the spec doc's paraphrase: `escalation.friction.increased` (not `cortex.escalation.friction_increased`), payload field `newFric` (not `friction`) — matching `liminal-space`'s pre-existing `_onFrictionChange` listener exactly.

Two real bugs caught by integration testing before shipping, both the same class as the `tc.drift.signal` fix from Phase 0 — handlers reading straight off the event instead of `event.payload` (the real `nexus-bus.js` wraps every emit in a `{type, payload, source, ts, id}` envelope). This is the second occurrence of this exact bug shape (§17.7: second occurrence promotes to investigation, third promotes to architecture) — worth a shared `makeTestBus()` test helper that wraps payloads correctly by default, so a future organ's unit tests can't pass while its real bus wiring is broken, the way this one almost did. Not built yet; flagged for whoever picks up Phase 3 or later.

Verified end-to-end with a real envelope-accurate integration check (not just mocked unit tests): two `anomaly.detected` events at `critical` severity correctly raised friction to `FAILURE_MODE`, `liminal-space`'s `L0/L2` (Constitutional Threshold) received a real held item, and `L2/L4` velocity incremented — the exact gate this phase required.

## Systemic finding — jaa-store.js `_matches()` (found during Phase 6 verification, fixed before shipping)

While verifying gap-finder end-to-end, a real anomaly correctly drove escalation and RAID but produced no gap. Root cause: `guardian/jaa-store.js`'s `_matches(row, where)` does `Object.entries(where)` — when `where` is a predicate **function** (`Object.entries` on a function returns `[]`), the loop never runs and the row is reported as matching regardless of the predicate. Reproduced directly: `jaaDB.query('gaps', r => r.type === 'value_that_does_not_exist', 5)` returned 5 rows.

This is the dominant calling convention across the *entire* codebase — `cortex/core/raid/snr-filter.js`, `cortex/intelligence/index.js`, `lib/replay-engine.js`, `lib/constitutional-ai.js`, `orchestrator/request-handler.js`, and both `cortex/self-heal/index.js` and `cortex/gap-finder/index.js` built this session — meaning every one of those real, load-bearing queries has been silently matching arbitrary rows instead of the intended filtered subset, likely since whenever this store was introduced. Fixed at the source (`_matches` now branches on `typeof where === 'function'`), not per call site — the same principle as the `jaa-db.js` bare-number fix from Phase 0, at far larger scale. Full 604-test suite re-run afterward: same 604 passed, same pre-existing 61 failed — zero regressions, and it's worth naming *why* this went undetected for presumably a long time: the existing test suite's mocks mostly modeled `jaaDB.query` as `.filter(fn)` (the *correct*, intended behavior), so tests validated against a correct mental model while production silently didn't match it. Only a real, unmocked end-to-end run crossed that boundary and exposed it.

Also found and cleaned before shipping: several of this session's own real (unmocked) integration verification runs wrote test rows into the actual `data/cortex/memory/*.json` files. Removed the four affected files' test-injected rows by exact content match, and restored the one legitimately pre-existing `gaps` row to its original shape (a field my own dedup logic had added to it). Not silently left in.

## Phases 3-6 — built, wired, tested this turn

- **Phase 3** `cortex/self-heal/index.js` — 5-level ladder. Level selected from the fault_taxonomy row's own `count` (Phase 1), not a separate state machine. Level 0 reuses real `forge_patches`/`fix_map` lookups; level 2 writes a real `forge_patches` row with `status:'proposed'` (never `'verified'` — never auto-applied, per spec); level 3 reuses the real, previously-unwired 12-engine pack (`lib/diag-engines`, via `lib/nexus-expansion-boot.js#buildDiagSnapshot`); level 4 writes the real `failure_modes` table service/nexus-diagnostic.js already uses. `SEMANTIC_GAP_TYPES` is a judgment call, not a found spec — reasoned from §7.2, flagged as such in the file's own header. 12/12 tests.
- **Phase 4** `cortex/gap-finder/index.js` — real `anomaly.detected`/`sigma.event.halt_risk`/`sigma.event.warning` → deduped `cortex.gap.found`, matching the exact `{gap: row}` shape `liminal-space` already reads. 9/9 tests.
- **Phase 5** `cortex/orion/index.js` — pure classifier, same anomaly/sigma inputs → `cortex.orion.classified` shaped to match RAID's real `_decide(call, health, weights)` contract exactly (read directly from `cortex/core/raid/index.js`, not guessed). 12/12 tests.
- **Phase 6** bus wiring added to `cortex/core/raid/index.js` itself — `cortex.orion.classified` → the same real `_decide()` the direct-call route already uses → `cortex.raid.decided`. Confirmed identical output between the bus path and a direct `_decide()` call in the same test. One honest caveat found along the way: `boot.js`'s actual `/api/raid/decide` HTTP route calls its own separate, lighter, boot.js-local `_raidDecide`/`_raidHealth` — not this real engine at all. That's a pre-existing §10.3 (competing truth layers) gap, out of scope for this pass, flagged rather than silently left implying the route and the bus event were already unified. 5/5 tests.

All four wired into `boot.js`'s live boot sequence (same inline-require pattern as `liminal-space`/`escalation` — the organs-array gap from Phase 2 now applies to six organs, still tracked for a future pass, not this one).

Full suite after all of the above: **604 passed, 61 failed** (same pre-existing 61 named in Phase 0/2 — `jaa-db.test.js`'s class-based API expectation, `intelligence.test.js`'s missing `_scanPatterns` export, `test-liminal-space.js` T-015's organs-array gap. Nothing new.)

## Session close — 2026-07-20 evening (see CHANGELOG.md for the full entry)

After the phases above: user-model wired live + `radiate()`; autopilot phased
boot (4 health-gated phases, `_pollHealth` 503-retry fix); the pressure reflex
(`nexus.resource.pressure` → orchestrator relay → cortex → escalation's
`memory_pressure` fault class — built from the live 0xC0000409 double-crash
log where the event fired with zero consumers); spec addendums (cortex 3.3.0,
escalation 1.2.0, self-heal 1.1.0) and the spec-first `handshake-ledger.spec`.
Suite: **681 passed, 0 failed.** Git initialized, first commit `e6f7a1f`,
system 0.9.13.

Open ledger, unchanged in priority: sigma_records unbounded growth (the one
that worsens on its own), the raid route/engine split (§10.3), chat_log dual
schema (§10.1), cortex/heartbeat unbuilt, oscillation damping (named in
escalation.spec), handshake-ledger build (spec ready), 12 unspecced modules.
