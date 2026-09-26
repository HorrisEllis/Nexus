# NEXUS — session worklog + forward phasemap
*Updated 2026-07-20. Companion to docs_out/cortex-phase-map.md (which covers the cortex-organ work). This one covers everything after, plus the forward map James asked for.*

## Shipped this session (verified, tested, committed)

Full detail in CHANGELOG.md. In brief, all with tests, ending at 699 passed / 0 failed, git through commit 368c45c:
- Cortex organs Phases 0-6 (fault-taxonomy, escalation, self-heal, gap-finder, orion, raid bus-wiring) + real organs array
- Three `guardian/jaa-store.js` `_matches()` sibling bugs fixed at source (predicate matched all / string matched none / bare-number limit dropped), each reproduced first
- JaaDB class against its 52-test pinned contract; sovereign compartment memory real
- intelligence accumulation fix (killed the infinite re-announce spam from the opening screenshot)
- user-model wired live + radiate(); autopilot phased boot; pressure reflex (nexus.resource.pressure → memory_pressure fault class)
- sigma-compaction (13,329 rows → 8 rollups, 0 lost) — the unbounded-growth item closed
- hook registry migrated architect → loom (§10.1 ownership); architect back to architecture only

## Open item parked (James, 2026-07-20): NEW WARP
"The new warp, it's not backwards compatible." Confirmed NOT present in clear-glass-lite-6.zip (searched fully — no warp anywhere in it). Current tree warp = v1.4.0, mature, tested. When the new warp lands: it becomes the FIRST migration (bottom-up, since it breaks every `require('warp/core')` consumer — loom schema/driver/gates/bootstrap, orchestrator, ollama, cos gates, hooks). Until then: build on v1.4.0, avoid new hard dependencies on warp/core API surface so the eventual migration isn't widened. Parked by James as "might not be important right now."

## Verified this turn (no code written — pure map, per "map then build")

### clear-glass crash loop — ROOT CAUSE FOUND, precise
- Minimize-to-taskbar behavior James wants ALREADY EXISTS: `minimizeAgentWindow` (clear-glass/src/main/index.js:1167), `win.hide()` removes from taskbar, tray infra at 1151/1201. Not a build — already there.
- The crash: `requestSingleInstanceLock()` fails (index.js:194-206) because TWO clear-glass processes are genuinely alive at once (log distinguishes this from a release race), second one exits(1), autopilot counts a crash, circuit breaker tripped → 30s backoff loop.
- The `minRestartDelay:3000` fix (2026-06-30) does NOT address this — it was built for the lock-*release* race, not a spawn-while-spawning race.
- ACTUAL BUG (autopilot.js:560): `requestSpawn`'s guard only skips re-spawn for status `'running'`/`'stable'`. A clear-glass mid-crash-loop is `'starting'`/`'restarting'`/`'crashed'` — guard misses it, `_spawnKernel` runs again, two Electron instances race the lock.
- STILL TO VERIFY before the fix: exact state-string values the supervisor sets during restart, so the widened guard matches reality (one more trace, not an assumption).

## Phase RAID-SPINE — universal entry point — ✓ DONE 2026-07-21  [the architecture James named]
Any surface → RAID → target, start-point-agnostic, bus-dispatched, Cortex logs every hop.
envelope.js (universal request shape + immutable trail ledger) + router.js (resolve
target via live capability-registry, raid.route.request → decided → fulfilled/no_route).
Hot-swappable: swap provider in registry, RAID routes to new one, no surface changes.
Verified live vs real 217-cap registry (copilot→idearium, cli→guardian). RAID names
target, never calls it. New path, doesn't touch _decide() provider selection. raid.spec
6.3.0. 10 tests. Suite 724/0. FOLLOW-ON: convert each surface to route-through-RAID,
one at a time, verified, booting throughout.

## Forward phasemap — bottom-up, smallest first

### Phase A — clear-glass spawn-guard fix  [SMALLEST, do first]
Widen `requestSpawn`'s already-running guard (autopilot.js:560) to also cover in-flight states (`starting`/`restarting`), so a request during a restart can't launch a second Electron. Confirm despawn-on-compartmentalize uses the existing `win.hide()` path, not quit. Test: pure `_phasePlan`-style unit test on the guard's state logic (the live Electron race can't be reproduced in-sandbox — honest limit, flagged). Foundation: none / warp-neutral.

### Phase B — capability-registry (copilot-expansion.spec phase 3)  [emergent tools] — ✓ DONE 2026-07-20
BUILT lib/capability-registry.js: live projection of component-registry (217 real
components across 8 namespaces, verified against live data), not a static list.
A component already carries what a capability needs (description=what, grammar=when,
params=how, examples) — no augmentation table, no §10.1 second authority. Deprecated/
unavailable never offered. resolve() answers "can you X?" (hit → capability, miss →
"may need to be built", honest). buildToolsPrompt() merges fixed browser tools +
emergent set. Exposed at orchestrator /api/capabilities[/prompt|/resolve]; clear-glass
bridge.js fetches /prompt live (5s cache) and falls back to static tools.js if
orchestrator is unreachable — Co-pilot always has tools. THE LOOP proven by test:
a runtime-registered component becomes a usable tool with ZERO code change. This is
also the tools.js→Cortex answer — the static array is now a live registry query.
8 tests. Suite 714/0.

### Phase B (superseded plan)
`lib/capability-registry.js`: reads component-registry (JAA/Cortex-backed), augments each component with what-it-does/when-to-use, Co-pilot reads it at runtime. This IS the "no static tool definitions / emergent" answer AND the "tools.js → Cortex" migration — tools.js's static array becomes a live registry query. Spec already defines it; component-registry already exists. Verify component-registry row shape + buildToolsPrompt() feed first. Warp-neutral.

### Phase C — diagnostic upgrade (visual + CFR + intelligence-bridge audit)
Two parts: (1) AUDIT — are the intelligence systems (intuition, mastermind, adversarial, sigma) actually bridged to diagnostics + resource-monitor? Answer from code, yes/no per system. (2) BUILD — diagnostic more visual, surface CFR (coherence/friction/resonance/entropy/regime — already in the /status payload per image 1, just not visualized). Depends on the audit landing first.

### Phase D — contract lifecycle subsystem  [BIGGEST — spec first, §3.1]
James's description: each contract, via handshake/handoff, spawns the target system if offline → accepts → runs through → stores in input/ tagged with status → output/ tagged with status+systems → every location change and event logged and tracked. This is the handshake-ledger.spec (already drafted) FUSED with spawn-on-demand orchestration + a physical input/output folder pipeline. Must be spec'd as one coherent subsystem before any code, or it becomes unspecced-module-13. Depends on Phase A (spawn-on-demand must be solid first).

### Phase E — Guardian login UI (clear-glass-lite pattern)
Rebuild clear-glass-lite's multi-account login UI (login-state.js: accounts[] per provider, isolated session partitions, add-another split button) for Guardian's provider logins. Self-contained UI build. Independent of A-D.

## Standing ledger (unchanged)
raid route/engine split (§10.3); chat_log dual schema (§10.1); cortex/heartbeat unbuilt (blocks pipeline.test.js); oscillation damping (named in escalation.spec); the ~12 unspecced modules incl. loom.spec (more urgent post-migration); playwright removal (my mistaken addition — node_modules 250MB, package.json, lockfile, stray test — pending a check that cos/archetype/registry.js's ref isn't load-bearing).
