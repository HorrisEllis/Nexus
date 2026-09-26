# NEXUS — Axioms Mapped to Phase Map
**Author:** James Brooks (Erosmancer)
**Generated:** 2026-06-24
**Source:** AXIOMS-v3.0.md (consolidated 2026-06-29 from v1.0 + v2.0 — same
§ numbering preserved, so every mapping below still holds; v3.0 only adds
§3.3, §6.3, §12.6, and Group 15) + nexus-roadmap-combined_5_.html
**Purpose:** Every axiom mapped to every phase it governs. Every phase mapped to its axiom violations and compliance state. The honest answer to "what does this system actually satisfy right now."

---

## Reading this document

**Compliance states:**
- ✓ SATISFIED — axiom is actively enforced in shipped code
- ⚠ PARTIAL — axiom is structurally present but has known gaps
- ✗ VIOLATED — axiom is broken right now, known, needs fixing
- ○ N/A — axiom does not apply to this phase

**This is not aspiration. Every entry is derived from reading the code.**

---

## Part 1 — Axioms → Phases (which phases satisfy each axiom)

---

### §1.1 Nothing Exists Until Proven
*A feature does not exist until demonstrated under real conditions. Stubs are not implementations.*

| Phase | Status | Evidence |
|-------|--------|---------|
| 0–8 Foundation | ✓ | All organs boot-verified with health checks |
| 9 Request Handler | ✓ | Constitutional choke point proven end-to-end |
| 10 Constitutional AI | ✓ | 3/3 wiring checks pass at boot |
| 11 Reflection Engine | ⚠ | lib/reflection.js exists and scores decisions. Contracts queued. Closure verifier wired 2026-06-24. But decision_log fed only from request-handler — co-pilot interactions not scored until this session's patches are deployed |
| 13 Autonomous Loop | ✗ | Not built. Roadmap says pending. Gap-loop is the spine but the loop itself doesn't run |
| 15 Grammar Engine | ⚠ | grammar-engine.js exists. 0 components registered at boot — nothing to resolve against |
| 23.7 Gap Lifecycle | ⚠ | gap-predicate.js built. Not deployed to running version yet |
| 68 Co-pilot | ⚠ | v1.1 built this session. Was returning placeholder string — §1.3 violation, now fixed |
| 67 MCP Tool Bridge | ✗ | Not built |
| 29 Topology View | ✗ | Not built |

**Active violation:** Co-pilot v1.0 displayed `"full narrated response not yet built, see docs/copilot.spec"`. That is a stub shipped as an implementation. Fixed in v1.1.

---

### §1.2 Nothing Pretends to Work — And Nothing Silently Fails
*Every failure loud, specific, traceable. Generic errors are almost as bad as silence.*

| Phase | Status | Evidence |
|-------|--------|---------|
| 0–8 Foundation | ✓ | Every boot phase logs explicit pass/fail with timing |
| 23 Stale Module Gap | ✓ | Named, typed, severity-graded gap bodies |
| 23.6 Gap Lifecycle Dedup | ⚠ | Dedup exists but same gaps still cycling — predicate check not deployed |
| 70 SEAM Persistence | ⚠ | Orphan resume logs gap but doesn't prevent re-dispatch |
| RAID decide() | ✗ FIXED | Was silently catching TypeError, hardcoding chatgpt. Fixed 2026-06-24 |
| ChatGPT userscript | ✗ FIXED | findResponseEl() returned null, startWatch never completed, GUARDIAN_COMPLETE never sent — silent failure for 3+ minutes. Fixed: 7 selectors + 3min hard timeout |
| Gap re-dispatch flood | ✗ PARTIAL | Same gaps dispatched every sweep. Fixed in nexus-v0_9_8-integrated but not deployed |

---

### §1.3 No Fake, Mock, Stub, Placeholder, or Skeleton in Production
*Every production path either works fully or fails loudly.*

| Phase | Status | Evidence |
|-------|--------|---------|
| Co-pilot v1.0 | ✗ FIXED | Returned placeholder string. Fixed in v1.1 |
| Gemini agent | ✗ | require('../agents/gemini') throws — agent file doesn't exist. RAID catches silently. Routes to chatgpt. Online status hardcoded true |
| Perplexity agent | ✗ | Same — hardcoded online, dispatch fails silently |
| forge-shell | ✗ | ui/forge-shell.html missing. Diagnostic reports it but nothing builds it |
| Component registry | ✗ | 0 components loaded at boot. Grammar engine has nothing to resolve |
| vectra | ✗ | npm install missing. vector-memory silently skipped. No fallback declared |
| Hub (hub.py) | ✗ | Listed as deprecated but still registered as an active service in some paths |

---

### §2.1 Persistence Is the Golden Rule
*State that is not persisted does not exist between sessions.*

| Phase | Status | Evidence |
|-------|--------|---------|
| 0–8 JAA | ✓ | 28 tables, tiered decay, append-only, survives restart |
| 9 Request Handler | ✓ | decision_log persisted before reflection |
| Gap lifecycle | ✓ | Gaps persisted to JAA. closure_attempts table added 2026-06-24 |
| Job contracts | ✓ | createJob() writes to JAA before dispatch. Fixed 2026-06-24 |
| Reflection contracts | ✓ | reflection_contracts table, written before guardian dispatch |
| RAID weights | ✓ | raid-weights.json persisted to disk on every update |
| RAID cluster patterns | ✓ | raid-clusters.json persisted on Mistral pattern generation |
| SEAM queue state | ✗ | queue_compartments only in guardian's local JAA — cortex has no visibility. Phase 70 open |
| Idearium | ⚠ | Flat-file idearium.json. No cortex sync. Phase 40.8 open |
| Co-pilot event buffer | ✗ | _eventBuffer is in-memory only. Lost on restart |

---

### §2.2 Storage Device Is Source of Truth
*If it cannot survive a restart, it does not exist yet.*

| Phase | Status | Evidence |
|-------|--------|---------|
| JAA all tiers | ✓ | Boot replays from disk. 2422 ledger entries survived last restart |
| RAID weights | ✓ | Loaded from disk at init |
| RAID learned patterns | ✓ | Loaded from disk at init |
| Gap ledger | ✓ | 17.9MB, 2422 entries, replayed at boot |
| Active SEAM queues | ✗ | In-memory only in guardian. Phase 70 open |
| Intelligence patterns | ⚠ | 195 patterns seeded from JAA at boot — but seeding from event_log which decays |
| Co-pilot event buffer | ✗ | Not persisted |

---

### §2.3 All State Must Be Observable
*Every significant state transition must leave a trace.*

| Phase | Status | Evidence |
|-------|--------|---------|
| Gap states | ✓ | open/investigating/resolved/expired/blocked — all written to JAA |
| Job states | ✓ | pending/queued/delivered/complete/error — emitted to bus + ledger. Fixed 2026-06-24 |
| RAID decisions | ⚠ | decide() now logs to console. Not yet written to event_log per call |
| Reflection pass | ✓ | reflection.pass_complete event_log entry |
| Reflection contracts | ✓ | queued/dispatched/resolved — all in JAA |
| Closure attempts | ✓ | closure_attempts table, every attempt logged |
| SEAM queue state | ✗ | Not visible to cortex. Phase 70 open |
| CFR field | ⚠ | Polled but missing tension field — log shows `non-numeric field(s): tension — skipping` |
| Autopilot watchdog | ✗ | Log shows `autopilot → OFFLINE` — orchestrator loses sight of it after 60s |

---

### §3.1 Bottom-Up Only. Foundation Before Modules. Modules Before UI.
*A phase does not begin until the phase below it has passing tests.*

| Phase | Status | Evidence |
|-------|--------|---------|
| Build order this session | ✓ | jaa-db → gap-predicate → open-loop-taxonomy → diagnostic → gap-loop → server → raid → reflection → co-pilot → UI |
| Gap lifecycle spec | ✓ | Explicitly declares build order with §3.1 citation |
| Phase 13 (Autonomous Loop) | ✗ | Blocked on Phase 11 (Reflection). Phase 11 wired but not fully proven. Cannot start Phase 13 |
| Phase 15 (Grammar Engine) | ⚠ | Marked "BUILD NEXT" in roadmap. grammar-engine.js exists but 0 components registered — foundation not proven |
| Phase 40 (Component Descriptor) | ✗ | Pending. Blocks 40.5, 41, 42, 43, 44, 48 — nothing above it can start |
| Phase 71 (Causal Event Graph) | ✗ | Pending. bridge/causal/* exists but not confirmed against spec shape |
| UI changes this session | ✓ | Done last, after backend changes |

---

### §3.2 Logical Time Is the Ordering Axis
*eventTs is the only axis for ordering. Wall clock is display metadata only.*

| Phase | Status | Evidence |
|-------|--------|---------|
| SEAM queue | ✓ | seam_ts used for ordering |
| JAA decay | ✓ | Tier-based decay uses logical ordering |
| Gap closure attempts | ✓ | Ordered by ts in closure_attempts |
| Intelligence patterns | ⚠ | Some patterns use Date.now() for cursor — mixing logical and wall clock |

---

### §4.1 A System That Cannot Be Tested Cannot Be Trusted

| Phase | Status | Evidence |
|-------|--------|---------|
| Replay engine | ✓ | 16/16 tests |
| Gap lifecycle | ✗ | No tests written for gap-predicate.js — built without test coverage |
| Co-pilot v1.1 | ✗ | No tests — built without test coverage |
| RAID Qwen classifier | ✗ | No tests for _qwenClassify or _clusterReviewTick |
| Grammar engine | ✓ | Tests exist |

**Gap:** Everything built this session lacks test coverage. §4.1 violation across the board.

---

### §4.2 Fix Bugs Pre-Emptively
*Attack the weakest links before shipping.*

| Phase | Status | Evidence |
|-------|--------|---------|
| RAID decide() export | ✓ | Found and fixed before shipping new RAID features |
| ChatGPT DOM selector | ✓ | Root cause of 300-job flood — found and fixed |
| Gap dedup | ✓ | Root cause diagnosed (closure illusion), spec written, fix built |
| Gemini/Perplexity dispatch | ✗ | Known broken, not yet fixed |
| CFR tension field | ✗ | Known missing, logged every poll, not yet fixed |
| Vectra missing | ✗ | Known, not yet installed |
| Autopilot watchdog offline | ✗ | Known, not investigated |

---

### §4.3 Enterprise Grade. Military Grade Security. Cybersecurity Grade Privacy.

| Phase | Status | Evidence |
|-------|--------|---------|
| Auth | ✓ | RSA-2048, SNR gate, orchestrator as sole boundary |
| Bridge | ✓ | Circuit breaker, trust relay |
| Idearium lockdown | ✓ | Phase 23.5 — direct access removed, 127.0.0.1 bind |
| Co-pilot RAID gate | ✓ | Write commands require _approveTool approval. Fail-closed |
| SEAM queue | ✗ | No cortex-side visibility. Orphan resumes logged but not verified |

---

### §5.1 Everything Has a UUID, Hook, and Event Bus Registration

| Phase | Status | Evidence |
|-------|--------|---------|
| gap-predicate.js | ✓ | COMP_ID, HOOK_ID, SEAM_ID declared. Every gap gets seam_id stamped |
| Co-pilot v1.1 | ✓ | COMP_ID, HOOK_ID declared. Registers in component-registry |
| Job contracts | ✓ | UUID on every job. Bus events on every state transition |
| Reflection contracts | ✓ | UUID on every contract. Event_log on every state |
| Most components | ✗ | 0 components in component-registry at boot. Most don't self-register |
| hooks/*.hooks.js | ✗ | Phase 61 open — most hooks stale or missing seam.componentId |
| idearium | ✗ | 0 routes registered |

---

### §5.2 Everything Implements the Bridge

| Phase | Status | Evidence |
|-------|--------|---------|
| All 7 core services | ✓ | All connect to bridge via nexus-connect.js |
| gap-predicate.js | ✓ | Emits to nexus-bus |
| Co-pilot | ✓ | Polls bus via sample(), emits events |
| UI components | ✗ | No bridge implementation. UI talks directly to orchestrator HTTP |

---

### §5.3 No Monkey Patches — Full System Patches Only

| Phase | Status | Evidence |
|-------|--------|---------|
| RAID decide() fix | ✓ | Added proper public wrapper, didn't patch the call site |
| Gap lifecycle | ✓ | Full predicate system, not a cooldown timer patch |
| ChatGPT DOM fix | ✓ | 7 selectors + hard timeout — structural fix, not workaround |
| Reflection wiring | ✓ | Full contract system, not a "log and forget" patch |

---

### §5.4 Versions Persist Across the Entire Project
*One version. Same string everywhere.*

| Phase | Status | Evidence |
|-------|--------|---------|
| Spec drift at boot | ✗ | 6 drifted specs reported: cortex spec@3.0.0 ≠ code@3.2.0, guardian spec@3.6.0 ≠ code@3.6.1, escalation, snapshot, grammar-engine, replay-engine |
| Unspecced | ✗ | 9 components with no spec: gap-finder, divergence-watcher, macro-compiler, ncp, grammar-fallback, mutation-contract, open-loop-taxonomy, loop-topology, gap-loop |
| New files this session | ✗ | gap-predicate.js, gap-loop.js changes — no spec registered yet |

---

### §5.5 What Does Not Exist Must Be Built

| Phase | Status | Evidence |
|-------|--------|---------|
| Ollama runtime | ✓ | Built in-house, not imported |
| SISO/JAA | ✓ | First-party, core to system |
| vectra | ✗ | External package, not installed, silently skipped |
| NCP userscripts | ✓ | Built in-house |

---

### §5.7 Low Coupling, High Cohesion. All inter-module communication via event bus only.

| Phase | Status | Evidence |
|-------|--------|---------|
| gap-predicate.js | ✓ | Only emits to bus. No sibling imports |
| Co-pilot | ✓ | Uses execFn injection, bus.sample(), no direct sibling calls |
| RAID → guardian | ⚠ | Guardian requires('../cortex/core/raid') directly — sibling import. Acceptable as RAID is a shared kernel |
| reflection → gap-predicate | ✓ | Lazy require, isolated |
| UI → everything | ✗ | Direct HTTP to orchestrator. Not bus-based. Acceptable for UI tier |

---

### §6.1 Documentation Generated From Proof, Not Written as Aspiration

| Phase | Status | Evidence |
|-------|--------|---------|
| SESSION-2026-06-24.md | ✓ | Written from what was actually built |
| SYSTEM-MAP.md | ✓ | Open loops table derived from real boot log |
| WIRES.md | ✓ | Every wire verified against server.js / boot sequence |
| gap-lifecycle.spec | ✓ | Derived from ChatGPT analysis + code archaeology |
| copilot.spec | ✓ | Derived from reading co-pilot/index.js |
| AXIOMS-PHASE-MAP.md (this file) | ✓ | Derived from reading AXIOMS-v1.0.md + roadmap + boot log |

---

### §6.2 Always Read Before Building

| Phase | Status | Evidence |
|-------|--------|---------|
| This session | ✓ | Read axioms, roadmap, existing docs, running code, boot logs before every build |
| Exception | ✗ | UI patches done before reading asSend() fully — caused unnecessary iteration |

---

### §7.1 Dual Ledger Architecture
*Upgrade Ledger (truth) + Idea Ledger (cognition). Never mix.*

| Phase | Status | Evidence |
|-------|--------|---------|
| JAA decision_log | ✓ | Authoritative — scored, persisted, drives reflection |
| JAA event_log | ✓ | Observational — decays, read-only for cognition |
| Idearium ideas | ✓ | Idea ledger — cannot affect runtime directly |
| RAID cluster samples | ✓ | _clusterSamples is idea ledger. Only becomes upgrade after Mistral proposes + pattern written to disk |
| Reflection contracts | ✓ | Queued in JAA (upgrade ledger path). Proposal from Mistral is idea until closure verified |

---

### §8.1 Begin Every Session With Context
*Phase, state, bugs, intent — before any build.*

| Status | Evidence |
|--------|---------|
| ✓ | Boot log read, running version confirmed, diff against integrated build checked before any code written |

---

### §8.2 Nothing Passes the Idea Gate Without Hostile Review

| Phase | Status | Evidence |
|-------|--------|---------|
| Gap closure theory | ✓ | ChatGPT analysis validated the diagnosis. "Event layer ≠ truth" pressure-tested |
| Co-pilot design | ✓ | Pushed back on Mistral-for-reflection chain (too many failure points), shortened to Qwen floor + direct Mistral call |
| UI-as-endpoint | ✓ | Pushed back correctly — UI is last, not the focus |
| Gap lifecycle build order | ✓ | Hostile review before spec: "what if predicate check fails?" → EXPIRED state added |

---

### §8.3 SISO and JAA Are Load-Order Prerequisites

| Status | Evidence |
|--------|---------|
| ✓ | SISO (nexus-bus.js) and JAA (jaa-db.js) boot before all other phases. Verified in boot log — JAA opens at phase 3 of cortex boot, before organs |

---

## Part 2 — Phase Map → Axiom Compliance

For each phase, which axioms are satisfied, partial, or violated.

---

### COMPLETE phases

**Phase 0–8: Foundation through Organs**
§1.1✓ §1.2✓ §2.1✓ §2.2✓ §2.3✓ §3.1✓ §4.3✓ §5.1⚠ §5.2✓ §8.3✓

**Phase 9: Request Handler**
§1.1✓ §1.2✓ §2.1✓ §5.1✓ §5.7✓
Note: Cost tiers (READ/COMPUTE/LLM_LOCAL/LLM_REMOTE/FORGE/IRREVERSIBLE) are the §4.3 enterprise grade enforcement layer.

**Phase 10: Constitutional AI**
§1.1✓ §1.2✓ §2.1✓ §2.3✓ §4.3✓ §5.3✓
Note: Identity kernel read-only except via Phase 11 after N evidence items — §5.3 enforced architecturally.

**Phase 23.6: Gap Lifecycle Dedup + Auto-Resolve**
§1.2✓ §2.1✓ §2.3✓
Note: Superseded by Phase 23.7 (gap-lifecycle.spec) which adds predicate + artifact verification. 23.6 was the first correct step — dedup in place. 23.7 adds closure proof.

**Phase 25: RAID Compartment Engine**
§1.1✓ §2.1✓ §2.3✓ §4.3✓ §5.1✓

**Phase 45: Intent Classifier**
§1.1✓ §2.1✓ §5.1✓
Note: Produces immutable INTENT object. Frozen at execution start. §5.3 enforced — no mutation after freeze.

**Phase 46: Queryable Case Library**
§1.1✓ §2.1✓ §2.2✓
Note: Every PASS compartment trace indexed. High match → full trace seed. §7.6 pattern — codebase materialised from upgrade ledger.

---

### NEXT phase

**Phase 15: Grammar Engine CLI + Component System**
Current: §1.3✗ — 0 components registered, grammar resolves nothing
Required before building: register components (§5.1), prove grammar resolves against them (§1.1)
Blocks: Phase 64 (grammar reads unified registry), Phase 65 (unified console), Phase 68 (co-pilot.js)

---

### PENDING phases — axiom gates that must pass first

**Phase 11: Reflection Engine**
§1.1⚠ — reflection.js exists, scores decisions, contracts wired 2026-06-24
Remaining gap: decision_log not fed from co-pilot until integrated patches deployed
§2.1✓ — reflection_contracts written to JAA before guardian dispatch
§2.3✓ — pass_complete, contract.queued, contract.resolved all in event_log
§5.3✓ — no monkey patches, full contract system
**STATUS: Partially satisfied. Deploy integrated build to fully close.**

**Phase 13: Autonomous Loop**
Cannot start. Blocked on Phase 11 (fully proven), Phase 12 (User Model — not built).
§3.1 enforcement: build below first.

**Phase 14: Hot Module Loader**
§2.1 required — snapshot before integrate
§5.1 required — UUID+hook+bus on every loaded module
§1.1 required — validateInvariants() must prove safety before swap
Not blocking anything critical right now. Phase 28 (Live System Editor) needs it.

**Phase 40: Component Descriptor — THE CRITICAL GATE**
Blocks: 40.5, 40.6, 40.7, 40.8, 40.9, 41, 41.2, 42, 43, 44, 48
§1.1 — descriptor is the proof. Nothing above exists until this exists.
§5.1 — UUID namespace roots all tracing
§5.6 — structural self-similarity law requires this as the atomic unit
§6.1 — docs generated from descriptor, not written by hand
This is the most consequential pending phase in the entire roadmap. Everything above it (UI builder, blueprint, resolution spectrum, compiler knowledge layer) cannot start.

**Phase 70: SEAM Persistence + Escalation Ladder**
§2.1✗ — SEAM queue not persisted to cortex. §2.2✗ — cannot survive guardian restart.
§2.3✗ — cortex has no visibility into queue state.
Root cause of orphan resume gaps flooding the log.
Fix: cortex-side contract file for queue state.

**Phase 71: Causal Event Graph Kernel**
bridge/causal/* exists. Not confirmed against spec shape.
§1.1 — must be demonstrated before Phase 71.x phases can start
§3.1 — confirm existing code matches spec before building on top

**Phase 71.2: Expectation Engine**
Direct fix for chunk-1 stall. SEAM run declares expected_path at queue creation, validates every step against it. Moment something diverges from expectation → anomaly, not timeout.
§1.2 — this is what makes the system stop failing silently on SEAM stalls
§2.3 — expectation mismatches must be observable in the causal graph

**Phase 49: Agent Reachability**
Gemini: require('../agents/gemini') throws. RAID catches silently. §1.2✗
Perplexity: same. §1.2✗
guardian.tab.needed emits but nothing listens with dedup guard. §5.1⚠
Fix: real health probe for Gemini/Perplexity, real listener for tab.needed.

**Phase 48: CFR ↔ Decision Pipeline**
OUTCOME.* events never write to CFR ledger. §2.3✗ — decisions invisible to health field.
request-handler's RESOLVED/DENIED/HELD/UNRESOLVED don't nudge CFR tension.
Explains why CFR tension field is always missing/non-numeric in the log.

**Phase 67: MCP Tool Bridge**
§5.2 — would implement bridge for Claude sessions
§6.1 — every Claude session currently rediscovers the same things
High value: makes every future build session start with real context, not grep.

---

## Part 3 — Priority Queue (what to build in order)

Derived from axiom violations × roadmap dependencies × §3.1 bottom-up law.

### Tier 0 — Must fix before anything else is trustworthy

1. **Deploy nexus-v0_9_8-integrated.zip** — all Phase 23.7 patches live. Gap dedup, predicate verification, RAID decide(), job contracts. Without this, the system is still running the closure illusion.

2. **Phase 70 (SEAM persistence)** — §2.1/§2.2 violations. Queue state must survive restart. Cortex must see it. Orphan resume gaps will keep flooding until this lands.

3. **Phase 49 (Agent reachability)** — §1.2/§1.3 violations. Gemini/Perplexity dispatch silently fails. guardian.tab.needed emits to nobody. Two hardcoded lies in RAID's health state.

4. **CFR tension field** — §2.3 violation. Every poll skipped. Decision outcomes invisible to health field. Phase 48 depends on this.

### Tier 1 — Foundation for everything above it

5. **Phase 15 (Grammar Engine)** — roadmap says BUILD NOW. 0 components registered. Grammar resolves nothing. Blocks Phase 64, 65, 68.

6. **Phase 40 (Component Descriptor)** — the critical gate. Blocks 12 downstream phases. §5.1/§5.6 foundation. Nothing above it is real until this exists.

7. **vectra install** — one command. Unblocks vector memory. Silent skip is §1.3 violation.

### Tier 2 — Build once Tier 0 and 1 are solid

8. **Phase 71 (Causal Event Graph)** — bridge/causal/* exists, confirm against spec, then build 71.1→71.4 in sequence. Gives the system pre-hoc failure detection instead of post-hoc timeouts.

9. **Phase 11 (Reflection Engine)** — partial. Needs integrated build deployed + co-pilot decision_log entries flowing. Then it's complete.

10. **Phase 13 (Autonomous Loop)** — blocked on Phase 11 + Phase 12. Build after both proven.

### Tier 3 — After the system is solid

11. Phase 12 (User Model)
12. Phase 14 (Hot Module Loader)
13. Phase 34 (API Surface Failure)
14. Phase 29 (Topology View)
15. Phase 67 (MCP Tool Bridge) — high leverage, enables every future session

### UI — Last

Phase 43 (Architect as UI Builder), Phase 65 (Unified Console), Phase 68 (Co-pilot.js) — §3.1 enforces this. Not before Tier 0 and 1 are proven.

---

## Part 4 — Spec Drift (§5.4 violations)

Components whose spec version ≠ code version at boot:

| Component | Spec version | Code version | Gap |
|-----------|-------------|-------------|-----|
| cortex | 3.0.0 | 3.2.0 | +0.2 |
| guardian | 3.6.0 | 3.6.1 | +0.1 |
| escalation | 1.0.0 | 1.1.0 | +0.1 |
| snapshot | 1.0.0 | 1.2.0 | +0.2 |
| grammar-engine | 1.3.0 | 1.2.0 | code BEHIND spec |
| replay-engine | 1.0.0 | 1.1.0 | +0.1 |

Components with no spec at all (§5.4✗):
gap-finder · divergence-watcher · macro-compiler · ncp · grammar-fallback · mutation-contract · open-loop-taxonomy · loop-topology · gap-loop · gap-predicate (new this session)

**Fix:** bump spec versions to match code versions, or write specs for unspecced components. Phase 71 block writes specs as part of confirming bridge/causal/* shape.
