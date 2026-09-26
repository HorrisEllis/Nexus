# AXIOMS v2.0
> **⚠️ SUPERSEDED 2026-06-29.** Consolidated into `docs/AXIOMS-v3.0.md`,
> which adds Group 15 (Adaptive Fulfillment) and several individual laws
> from this conversation. Kept here as historical record only.

**James Brooks · System Design Laws**
*Immutable laws for every project, every system, every collaboration.*
*v2.0 — updated to reflect NEXUS build session. Session-established rules promoted to law.*

---

## Preamble

These are not preferences. They are not guidelines. They are invariants — the constraints that define what a valid build is. A system that violates any one of them is not a system yet. It is a draft.

This document has two tiers:

- **Immutable laws** — copy-pasted verbatim into every project. Non-negotiable. Marked with §.
- **Flexible principles** — the spirit behind the laws. Context-sensitive. They guide decisions but bend to the problem.

> **§** When in doubt: the law wins. When the law is silent: the end-state wins. The end-state is a system that is as reliable, resilient, and flexible as possible — while remaining fluid.

We are co-builders. You are the idea layer — the synthesiser, the innovator, the problem-finder. I am the execution layer — the coder, the debugger, the adversary that pokes holes. Neither works without the other. The bridge between us is precision: precise problems produce precise solutions.

---

## Part I — Immutable Laws

These laws are copied verbatim into every project manifest, every spec, every system. They do not change per-project. If a project cannot satisfy one of them, that is a finding — not a reason to bend the law.

---

### § Group 1 — Existence

**§1.1 Nothing Exists Until Proven**
A feature, module, connection, or behaviour does not exist until it is demonstrated to work under real conditions. Claiming it works is not proof. A passing test against real data is proof.
*↳ Stubs, mocks, and placeholders are not implementations. They are markers for work not yet done. They must never be shipped as if they were implementations.*

**§1.2 Nothing Pretends to Work — And Nothing Silently Fails**
Every failure must be loud, specific, and traceable to a cause. A silent failure is worse than a crash — it corrupts the causal record without leaving evidence. If a system cannot perform an operation, it must say so explicitly, immediately, and with enough detail to find the cause.
*↳ Generic errors are almost as bad as silence. "Something went wrong" is not a failure message. The module, the operation, the input, and the expected vs. actual state must all be present.*

**§1.3 No Fake, Mock, Stub, Placeholder, or Skeleton in Production**
Test doubles exist for testing only. Production code contains no fake data, no hardcoded demo payloads, no placeholder UI, no skeleton implementations. Every production path either works fully or fails loudly.

---

### § Group 2 — Persistence

**§2.1 Persistence Is the Golden Rule**
State that is not persisted does not exist between sessions. Every piece of state that matters must be stored — either explicitly to a device, or explicitly marked as intentionally temporary.
*↳ Temporary storage is only for temporary data. If you cannot say out loud "this data is intentionally ephemeral and I accept it being lost," it must be persisted.*

**§2.2 The Storage Device Is the Source of Truth**
Until persistence exists, nothing works. A system that holds state only in memory is a prototype.
*↳ If it cannot survive a restart, it does not exist yet.*

**§2.3 All State Must Be Observable**
If state cannot be seen — by a watchdog, a diagnostic hook, a log entry, or a UI element — it does not exist as far as the system is concerned. Every significant state transition must leave a trace.

---

### § Group 3 — Build Order

**§3.1 Bottom-Up Only. Foundation and Architecture First.**
Nothing is built on top of something that does not exist yet. File system and data schema before modules. Modules before UI. UI before integration. Integration before polish.
*↳ Every phase has a declared gate and exit criteria. "It seems to work" is not exit criteria.*

**§3.2 Logical Time Is the Ordering Axis**
eventTs is the only axis for ordering events, gate windows, and analytics. Wall clock is display metadata only. Mixing the two is a category error.

---

### § Group 4 — Quality

**§4.1 A System That Cannot Be Tested Cannot Be Trusted**
Every system includes diagnostic hooks, testability surfaces, and automated test coverage. A feature with no test path is not done.
*↳ QA runs six lenses on every root cause analysis. All six. Not optional.*

**§4.2 Fix Bugs Pre-Emptively**
Before any new phase begins, the weakest links in the current system are identified and attacked. A known vulnerability in a shipped system is a decision to accept the consequences.

**§4.3 Enterprise Grade Only. Military Grade Security. Cybersecurity Grade Privacy.**
There is no "good enough for now." Security is not a layer added at the end. Both are architectural constraints that shape every decision from the beginning.

---

### § Group 5A — Architecture Connectivity & Infrastructure

**§5.1 Everything Has a UUID, Hook, and Event Bus Registration**
Every module, every feature, every significant operation has a UUID that never changes. All execution flows through the event bus. Nothing operates outside the routing layer.

**§5.2 Everything Implements the Bridge**
Every system connects to Bridge. Bridge is write authority for all cross-system requests. A module that does not implement the bridge is isolated — isolation is incompatible with the principle that everything is alive and interconnected.

**§5.3 No Monkey Patches — Full System Patches Only**
A fix that patches behaviour at the call site without addressing the root cause is debt with interest. Every patch must address the root cause structurally.

**§5.4 Versions Persist Across the Entire Project**
One version number. The same string appears in every file, every comment, every manifest, every magic header. Version drift between files is a bug.

**§5.5 What Does Not Exist Must Be Built**
External runtime dependencies are a liability. If something does not exist and it is needed, it is built — not imported from an unmaintained package.

---

### § Group 5B — Architecture Geometry

**§5.6 Structural Self-Similarity (Fractal Law)**
The same structural pattern must be recognisable across abstraction layers. A developer who understands one layer must be able to reason about adjacent layers without a new conceptual model.

**§5.7 Low Coupling, High Cohesion**
Each module must encapsulate a single responsibility. All inter-module communication through the event bus. Direct dependencies between sibling modules are prohibited.

**§5.8 Composability Over Configuration**
System behaviour must emerge from the composition of simple modules rather than from the configuration of complex ones. Configuration may refine behaviour — it must never define structure.

---

### § Group 6 — Documentation

**§6.1 Documentation Is Generated From Proof, Not Written as Aspiration**
A readme that describes features not yet built is fiction. Documentation is written to record what is true, not to describe what is planned.

**§6.2 Always Read Before Building**
Every session begins with a read: manifest, roadmap, readme, changelog. If none exist — audit the codebase first.

---

### § Group 7 — Cognition and History

**§7.0 Event Ontology Separation**
Idea Ledger events are observational and non-authoritative. Upgrade Ledger events are authoritative and state-mutating.

**§7.1 Dual Ledger Architecture**
The Upgrade Ledger records what is. The Idea Ledger records what could be. Mixing them is a structural failure.

**§7.2 Ideas Cannot Affect Runtime**
Idea Ledger entries have no enforcement. They exist in a read-only cognition layer.

**§7.3 Cognition Is Not History**
An Idea Ledger entry may only become an Upgrade Ledger entry through an explicit validation step.

**§7.4 Track Methods, Solutions, and Patterns**
Every novel approach, breakthrough solution, and discovered structural pattern is recorded. Dead branches are data.

**§7.5 Semantic Classification of Idea Failure**
Every Idea Ledger entry that does not become an upgrade must be classified: Unresolved / Rejected / Abandoned.

**§7.6 Data Reconstruction From Upgrade Ledger**
The codebase is a materialised view of the Upgrade Ledger. The log is the truth. The code is the projection.

**§7.7 Bottleneck Detection via Ledger Flow**
The sigma engine measures idea-to-upgrade conversion rate, gate latency, branch entropy, and idea density per component.

---

### § Group 8 — Process

**§8.1 Begin Every Session With Context**
State the current phase, last known state, active bugs, and intent before any implementation begins.

**§8.2 Nothing Passes the Idea Gate Without Surviving Hostile Review**
Every idea must survive adversarial pressure before it becomes a spec. Find the holes before the build does.

**§8.3 SISO and Jaa Are Load-Order Prerequisites**
If SISO and Jaa are not present at session start, await upload before proceeding. These are not optional dependencies — they are the substrate.

---

### § Group 9 — Bridge & Identity (v2.0 — promoted from session rules)

**§9.1 Bridge Is the Only Write Authority for Requests**
No system writes directly to the requests table. No system calls another system's API directly for cross-system work. Everything goes through `POST /bridge/request`.
*↳ A cross-system call that does not cross Bridge is a rogue bypass. §FAULTS.CLASS.ROGUE_BYPASS.*

**§9.2 Ledger Write Before Dispatch. Always.**
A request that was not written to the ledger before dispatch is a phantom. It does not exist as far as the system is concerned. The write gate is not optional.

**§9.3 Held Requests Never Leave the Queue**
If a target is offline, status becomes `held`. Never dropped, never lost. When the target comes online, Bridge drains the held queue automatically. A dropped request is a §1.2 violation.

**§9.4 Route Depth Is Bounded. History Is Written.**
MAX_ROUTE_DEPTH = 3. A request may traverse at most 3 fallback hops before being marked FAILED. `routeHistory` is written on every hop. A silent fallback chain is a bug.

**§9.5 One UUID Per Request Event. One Hash Per Content Artifact.**
Request UUIDs are assigned by Bridge at creation and carried everywhere. Content artifacts are identified by SHA-256 of their body. The same content has the same hash. No content is re-sent if its hash is already stored.

**§9.6 Session UUID Chain Preserves Continuity**
Each conversation session has a UUID. Each prompt carries its session UUID as `causedBy`. This is the mechanism by which context is reconstructed without re-sending full content. A broken session chain is a §FAULTS.CLASS.CONTEXT_LOSS fault.

---

### § Group 10 — Truth Layers (v2.0 — promoted from session rules)

**§10.1 Each Data Type Has Exactly One Write Authority**
Bridge ledger owns requests. Cortex event_log owns events. Cortex FileStore owns content artifacts. Orchestrator ledger owns system state. Idearium owns ideas, specs, and gaps. Guardian physical queue owns execution state. SESSION.md is a rendered projection, not a manually edited file.

**§10.2 Projections Are Derived, Not Written**
The Cortex `requests` table is a projection of Bridge ledger populated by SSE subscription. It is never written directly. Any direct write to a projection table is a §FAULTS.CLASS.ROGUE_WRITE fault.

**§10.3 Competing Truth Layers Are a System Failure**
When two systems disagree on the state of the same entity, that is not ambiguity — it is a `ledger_divergence` gap. It must be named, tracked, and resolved. Not tolerated.

---

### § Group 11 — Causal Physics (v2.0 — promoted from session rules)

**§11.1 Every Cause Is as Important as the Conditions of Its Effect**
A fault cannot be understood without the field it occurred in. The same event in a coherent stable field produces a ripple. In a chaotic field it produces a tidal cascade. Both the event and the field conditions are required for a complete causal record.

**§11.2 Compounding Effects Are Documented and Named**
Every ripple, wave, and tidal cascade is identified, classified, and written to the ledger. A compounding effect that is not documented is a silent failure (§1.2). Regime is emergent — it is read from propagation physics, not assigned as a label.

**§11.3 Compound Analysis Is Async, Gated, and Selective**
Compound analysis triggers only on genuine sigma anomalies (score ≥ 0.70). `compound.*` events never re-trigger analysis. The write path is never blocked. Recomputation storms are a design failure.

**§11.4 The CFR Ledger Is a Causal Simulation Substrate**
Bugs are waveforms. Failures are resonance patterns. System drift is field distortion. The CFR system is not a debugging log — it is a physics engine over software behaviour. Layer 1: structural causality. Layer 2: residual causality (sigma). Layer 3: propagation dynamics (compound engine).

---

### § Group 12 — Testing & Verification (v2.0 — new)

**§12.1 Every Runtime File Has a Brutal, Recursive Test Suite**
Unit tests for every exported function. Integration tests for every system boundary. Adversarial tests for every input path. A file without tests is not production code — it is a prototype with aspirations.
*↳ "Brutal" means: hostile inputs, race conditions, crash recovery, empty inputs, max sizes, unicode, null, undefined, concurrent writes, partial state, corrupted files.*

**§12.2 Tests Are Verification, Not Coverage**
The goal of tests is to prove the system works, not to satisfy a coverage metric. A test that passes trivially proves nothing. Every test must be able to fail — and its failure must be informative.

**§12.3 Expectation vs Reality Is Always Documented**
Every test documents its expected state, its actual state when it fails, and the gap between them. A failing test with an uninformative error message is a §1.2 violation in the test layer.

**§12.4 Invariants Crystallise From Tests**
System invariants are not declared upfront — they are discovered through testing and promoted when they hold across enough conditions. A crystallised invariant is one that has survived adversarial pressure. Static invariants that have never been tested are assumptions, not laws.

**§12.5 The Living Spec Documents Drift**
The `.spec` file is a living document. Expected behaviour, actual behaviour, gaps, and drift are all tracked. When expected ≠ actual, that delta is a gap. Gaps are not failures — they are the system telling you where to build next.

---

### § Group 13 — Multidimensional Systems Thinking (v2.0 — new)

**§13.1 Log System Conditions, Context, and Intent**
Every significant operation logs not just what happened but: the system conditions at the time (CFR regime, health state), the context (session UUID, causedBy chain), and the intent (request type, source). Without all three, the log entry is incomplete.

**§13.2 Every Edge Is Named**
Every connection between systems is a named, typed edge with declared protocol, authentication, and failure modes. An unnamed edge is an unknown dependency — unknown dependencies are the source of the hardest production failures.

**§13.3 Every Fault Class Is Named Before It Occurs**
The taxonomy of failure is declared before the system is built, not discovered after it breaks. A fault that has no name cannot be tracked, cannot be measured, and cannot be prevented.

**§13.4 Consistency, Context, and Drift Are First-Class Concerns**
The living timeline tracks what the system was at each version, what it expected to be, and where it drifted. Drift is not a failure — it is data. Untracked drift is a failure.

---

### § Group 14 — SISO Coding Model (v2.0 — promoted from session rules)

**§14.1 Every Cross-System Feature Is a SISO Pipeline**
Event → Gate → Event. One gate performs one transformation. Complex operations decompose into pipelines of simple gates. Monolithic handlers are a build warning.

**§14.2 Gates Are Pure Functions**
No side effects except emitting events. Same input → same output. Every gate is independently testable. A gate with hidden state is a bug.

**§14.3 Signature Collision Is a Hard Error**
Two gates with the same signature cannot coexist in one stream. Precedence rules do not exist — collision is always an error.

**§14.4 Infinite Loop Prevention Is Mandatory**
Gates check `wasProcessedBy()` before claiming events they could re-emit. A gate that can cause its own re-invocation without this check is a ticking recomputation storm.

**§14.5 The Ledger Is the Learning System**
Every event is written to the ledger before any subscriber processes it. The log is the truth. The processing is the projection. §7.6 and §14.5 are the same law at different scales.

---

## Part II — Flexible Principles

These bend to the problem. When a principle conflicts with an immutable law, the law wins. When two principles conflict, the end-state is the tiebreaker.

**The End-State:** A system that is as reliable, resilient, and flexible as possible — while remaining fluid. Novel, not neat little boxes.

### Design Principles
- Drop-down menus, popout windows, and synthesis layers are primary UI primitives.
- Settings are first-class. Every fluid value has a settings surface.
- Tidy but powerful. Complexity lives behind progressive disclosure.
- Everything is alive and interconnected.

### Development Principles
- Build modules. Every feature is its own module.
- Everything is built with the future in mind.
- Each project is one thing.
- Do not stray. Grounded execution, idealistic vision.

### Collaboration Principles
- Idea layer + execution layer. Both are necessary.
- Pushback is required. Find the flaw before it ships.
- Track methods and solutions. Nothing useful is lost.
- Token efficiency is a constraint. One precise question beats ten vague ones.

### Output Contract
> **§** Entire project only. Full output into a zip. No partial patches. No monkey patches. Full system patches — touch every file that needs touching.

---

## Part III — The Six Lenses

Every root cause analysis, every architectural review, every hostile audit runs through all six.

| # | Lens | Asks |
|---|------|------|
| 1 | **Cybersecurity Expert** | What can be exploited? What trust assumptions are being made? Where are the authentication and encryption boundaries? |
| 2 | **Lead Designer** | Is this interface honest? Are mental models aligned? Would a first-time user understand what just happened? |
| 3 | **Senior Developer** | What are the failure modes? What happens at boundary conditions? What are the invariants and are they enforced? |
| 4 | **QA Engineer** | How do I break this? What input produces wrong output silently? What does the error message say — is it useful? |
| 5 | **Critical User (Never Satisfied)** | Why is this hard to use? What did the system make me do that it should have done itself? |
| 6 | **Elite Adversarial Hacker** | What is the weakest link? What does this system assume I will not try? |

---

## Part IV — Quick Reference

```
§1.1   Nothing exists until proven.
§1.2   Nothing pretends to work — and nothing silently fails.
§1.3   No fake, mock, stub, placeholder, or skeleton in production.
§2.1   Persistence is the golden rule.
§2.2   The storage device is the source of truth.
§2.3   All state must be observable.
§3.1   Bottom-up only. Foundation and architecture first.
§3.2   Logical time (eventTs) is the ordering axis.
§4.1   A system that cannot be tested cannot be trusted.
§4.2   Fix bugs pre-emptively.
§4.3   Enterprise grade. Military grade security. Cybersecurity grade privacy.
§5.1   Everything has a UUID, hook, and event bus registration.
§5.2   Everything implements the bridge.
§5.3   No monkey patches — full system patches only.
§5.4   Versions persist across the entire project.
§5.5   What does not exist must be built.
§5.6   Structural self-similarity — the same pattern across every abstraction layer.
§5.7   Low coupling, high cohesion. All inter-module communication via event bus.
§5.8   Composability over configuration.
§6.1   Documentation is generated from proof, not written as aspiration.
§6.2   Always read before building.
§7.0   Event ontology separation — observational vs authoritative events.
§7.1   Dual ledger architecture — Upgrade Ledger (truth) + Idea Ledger (cognition).
§7.2   Ideas cannot affect runtime.
§7.3   Cognition is not history.
§7.4   Track methods, solutions, and patterns. Dead branches are data.
§7.5   Classify idea failure: unresolved / rejected / abandoned.
§7.6   Codebase is a materialised view of the Upgrade Ledger.
§7.7   Bottleneck detection via ledger flow.
§8.1   Begin every session with context. Phase, state, bugs, intent — before any build.
§8.2   Nothing passes the idea gate without surviving hostile review.
§8.3   SISO and Jaa are load-order prerequisites.
§9.1   Bridge is the only write authority for requests.
§9.2   Ledger write before dispatch. Always.
§9.3   Held requests never leave the queue.
§9.4   Route depth is bounded. History is written on every hop.
§9.5   One UUID per request event. One SHA-256 hash per content artifact.
§9.6   Session UUID chain preserves continuity.
§10.1  Each data type has exactly one write authority.
§10.2  Projections are derived, not written.
§10.3  Competing truth layers are a system failure.
§11.1  Every cause is as important as the conditions of its effect.
§11.2  Compounding effects are documented and named.
§11.3  Compound analysis is async, gated, and selective.
§11.4  The CFR ledger is a causal simulation substrate.
§12.1  Every runtime file has a brutal, recursive test suite.
§12.2  Tests are verification, not coverage.
§12.3  Expectation vs reality is always documented.
§12.4  Invariants crystallise from tests.
§12.5  The living spec documents drift.
§13.1  Log system conditions, context, and intent.
§13.2  Every edge is named.
§13.3  Every fault class is named before it occurs.
§13.4  Consistency, context, and drift are first-class concerns.
§14.1  Every cross-system feature is a SISO pipeline.
§14.2  Gates are pure functions.
§14.3  Signature collision is a hard error.
§14.4  Infinite loop prevention is mandatory.
§14.5  The ledger is the learning system.
```

> **§** End-state: as reliable, resilient, and flexible as possible — while remaining fluid.
> Novel, not neat little boxes. The codebase is a materialised view of the Upgrade Ledger.
> Ideas are input, not output. The sigma engine measures the flow between them.
> Every cause is as important as the conditions of its effect.
> **Let's make history.**
