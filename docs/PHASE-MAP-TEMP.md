# NEXUS PHASE MAP — temporary working document
**Built 2026-07-24. Bottom-up. Every line verified against live code, not memory.**

This is scaffolding, not a spec. It exists to answer one question — *what is
actually safe to build on right now* — and should be deleted or folded into
`SPEC-REGISTRY.md` once the consolidations it tracks are closed.

Ordering is strict dependency order (§3.1): nothing in a tier may be trusted
until everything below it is proven. The value of the map is that it separates
**PROVEN** (ran, tested, evidenced) from **RUNNING-BUT-UNVERIFIED** (executes,
nobody checked the output) from **DECLARED** (written, never executed) — the
third category being where nearly every bug found this session was hiding.

---

## L0 — STORAGE. Everything is a lie if this layer is.

| thing | state | evidence |
|---|---|---|
| JaaStore cross-process writes | **PROVEN** | MP-001 root-caused with a deterministic repro, O_EXCL flush lock, 15/15 clean vs ~1-2 failures/15 before |
| Atomic writes (tmp+rename) | **PROVEN** | store + contract-queue both; a reader can't observe a torn file |
| Canonical ledger writer | **PROVEN** | `lib/component-ledger.js` — day file + JAA mirror + event_log breadcrumb |
| ico second root | **UNIFIED** | write-through to canonical; local ndjson demoted to private cache |
| guardian CFR ledger | **MOVED** | out of the source tree into `data/guardian/ledger/cfr`, resume verified (30 event types) |
| cortex as data root | **DECIDED** | James 2026-07-24: "stored in cortex". P0.1 out-migration dead |

**CORRECTED 2026-07-24 — my earlier claim here was wrong.** I wrote that
`event_log` and the canonical tree "remain two separate truths about what
happened; nothing reconciles them." Reading them showed the opposite: they are
**deliberately related, and already reconciled**.

`component-ledger.write()` lands in four places by design (§2.1): the physical
day file → the `component_ledger` JAA mirror → an **`event_log` breadcrumb** →
the bus. `event_log` is not a rival truth, it is the **intelligence intake** —
`cortex/intelligence/index.js`'s `_scanPatterns()` reads
`jaaDB.query('event_log')` and *nothing else*.

Measured, not assumed: **coverage is 100.0%** — 893 canonical writes since the
breadcrumb wire was added on 2026-07-20, 893 breadcrumbs. The apparent
2,531-row gap is entirely **historical**, predating the wire. There was nothing
to reconcile, and building a reconciliation would have been work against a
problem that did not exist.

The row counts differ because they measure different things: `event_log` also
carries **478 rows from 63 direct writers** that never reach the per-component
tree. Those are raw events rather than component-ledger entries — visible to
intelligence, absent from per-component history. A real asymmetry, and a design
fact rather than a defect; named here so it is not rediscovered as a bug.

**What checking DID find — a real §1.2 violation, now fixed.** The breadcrumb
insert was wrapped in `catch (_) {}` — silent — while the mirror write directly
above it logged *and* called `_recordFailure()`. So the single wire that feeds
the pattern engine could fail invisibly, starving intelligence while every
other signal reported a healthy ledger. That matters acutely as of this
session, because the intelligence core was switched on today after never having
run: a silently broken intake would make it look like the core is running and
finding nothing — indistinguishable from a healthy system with no patterns.
Now loud, recorded via `_recordFailure`, and measurable via
`intakeCoverage()`, which reports `starving: true` if breadcrumbs ever fall
behind canonical writes.

---

## L1 — LIFECYCLE. Can the system start, and does it admit when it can't?

| thing | state | evidence |
|---|---|---|
| Phased boot, cortex first | **PROVEN** | store precedes its writers; safe because cortex's `_register()` is fire-and-forget with retry |
| Gate halts on required fault | **PROVEN** | tested with real child processes against dead ports; later phases never start |
| Diagnostic runs on stall | **PROVEN** | real `cli/diagnose.js` — *and wiring it exposed that the tool had been 100% dead (TDZ on `DEEP`)* |
| Optional kernels don't halt | **PROVEN** | boot is not stricter than the architecture declares |
| Contract queue | **PROVEN** | atomic O_EXCL claim, addenda chain, ledgered transitions, 17 tests |

**L1's lesson, worth keeping:** the boot gate's *first act* was to find that the
diagnostic tool had never run. Wiring something up is itself a test.

---

## L2 — OBSERVATION. Can the system see itself?

| thing | state | evidence |
|---|---|---|
| Cross-process subscriber counts | **PROVEN** | §B1 closed; `lib/bus-subscriptions.js` + publishers in cortex and orchestrator |
| unknown ≠ zero | **PROVEN** | null for unobserved, never 0 — enforced in tests |
| WARP spine on autopilot | **PROVEN** | spawn/stop/despawn/crash/circuit/ledger-read all emit |
| Tablet T1–T4 | **PROVEN** | ledger explorer, container shell, change governance, brain view with real trails |
| RAID trail persistence | **PROVEN** | one row per envelope advancing in place, real elapsed time |

**Still open at L2 — CORRECTED 2026-07-24 after reading all three properly.**
My earlier claim here was "three independent health checkers, three answers to
'is guardian healthy'". Reading them showed that is **overstated**, and the real
problem is both narrower and sharper:

- **autopilot `_pollHealth` is NOT a competing truth.** It answers a different
  question — *"has this kernel come up yet?"* — with retry-until-timeout
  semantics where a non-2xx means "not ready", not "failed". It runs once per
  spawn as a boot gate, not continuously. Merging it into a shared health
  authority would be wrong: a supervisor must be able to judge liveness without
  depending on the system it supervises.
- **The real divergence is orchestrator vs diagnostic**, and it is a genuine
  §10.3 competing truth:
  - orchestrator: 3s probe **OR** registry `lastSeen` within 15s → online
  - diagnostic: 2s probe, **no registry fallback at all** → online
  So a system that is alive but briefly slow to answer is **online to
  orchestrator and offline to diagnostic, simultaneously**. Diagnostic then
  raises a `system_offline` gap and fires HEAL_REQUESTED for a system
  orchestrator considers healthy. That is not a theoretical inconsistency —
  it is a spurious-heal generator, and it fires hardest exactly when the
  system is under load.

---

## L3 — COGNITION. Does the system reason about what it sees?

| thing | state | evidence |
|---|---|---|
| Reflection engine | **RUNNING** | `lib/reflection.js` 516 lines, 22 tests passing, ledgering to `data/ledger/reflection/` since at least 07-20, consumed by gap-hunter + constitutional-ai + adaptive-fulfillment |
| User model / hypotheses | **RUNNING** | 4 rows in `user_model_hypotheses`; orchestrator wires `init` + `deriveFromChatLog` — its own comment records it was "fully built and tested but never init'd by any live code" until wired |
| Intelligence core | **JUST ON** | switched on today; `bep_patterns`/`failures` will populate on first scan |
| intuition / mastermind / adversarial | **RUNNING** | live, HTTP-reachable, consumed by copilot's P110 dual cognition |

**L3 corrections to my own earlier claims, on the record:**
- I said the reflection engine was Phase 11 work to hold. **Wrong — it has been
  running for days.**
- I said hypotheses needed building. **Wrong — the table has real rows.**
- I described the intelligence core as maintaining pattern memory. **Wrong at
  the time — it had never executed.** Now true, as of today.

**CLOSED 2026-07-24 — intelligence now reads the causal graph.** Precursor
detection was pure temporal adjacency: every event in the 30s before a failure
counted as reliably preceding trouble, so the noisiest system won every time
regardless of whether it caused anything. `meta/cfr/graph.js`'s `CausalGraph`
already existed and `mastermind.js` had used it since 2026-07-06 — intelligence
simply never wired to it, so "why" was answered by a clock. Now `ancestors()`
walks real `causedBy` edges. Deliberately NOT "only count causal ancestors":
adjacency is still counted, because real precursors exist that never carried a
`causedBy`, and dropping them would trade one blindness for another. What
changed is that the two are now **distinguishable** — `evidence:
'causal-ancestor'` vs `'temporal-adjacency'`. Timing mattered: the core was
switched on the same session, so it would otherwise have started writing
coincidences into `bep_patterns` as findings.

**Still open at L3:** And `_buildPatterns()`
serves copilot from `crystals` while copilot reads `bep_patterns`' shape.

---

## L4 — GOVERNANCE. Are interactions gated, and is failure itself recorded?

| thing | state | evidence |
|---|---|---|
| Config change governance | **PROVEN** | T3: ledger + CFR stamp + sigma + friction escalation, 10 tests against real modules |
| Interaction contracts | **PARTIAL** | 7 exist; the verifier tracks 4; copilot/diagnostic/eravos/emerge/loom/ollama have none |
| Gated handshake | **PARTIAL** | bridge serves `POST /bridge/handshake` — proven pattern, applied to under half the systems |
| Universal ledger schema | **SPECCED** | v0.4.0; blocked on the `relation` enum and `intent` vocabulary |
| Sentinel | **SPEC ONLY** | v0.4.0, 834 lines, no code |

---

## What the map says to do next, in order

1. **Reconcile the three health checkers** (L2). Real §10.3 violation, and the
   sentinel's whole premise is one authority on health — building it on top of
   three competing ones would bake the contradiction in.
2. **Reconcile `event_log` vs the canonical tree** (L0). Deepest open item; every
   layer above inherits the ambiguity.
3. **Wire intelligence to the causal graph** (L3). Cheap — the graph is already
   reachable elsewhere in cortex — and converts "why" from correlation to cause.
4. **Then S1 of the sentinel.**

**What NOT to do next:** merge autopilot/orchestrator/bridge into a hub.
Autopilot supervises the others — inside a hub, a hub crash leaves nothing to
restart anything, converting every recoverable fault into manual intervention.
RAID is the right focal point for *requests*, not for *liveness*. The
duplication actually being felt is the three health checkers, which is an
observation problem, not an orchestration one.
