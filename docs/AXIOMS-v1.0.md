# AXIOMS v1.0
> **⚠️ SUPERSEDED 2026-06-29.** Consolidated into `docs/AXIOMS-v3.0.md` along
> with v2.0. Kept here as historical record only.

**James Brooks · System Design Laws**
*Immutable laws for every project, every system, every collaboration.*

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
State that is not persisted does not exist between sessions. Repetition caused by lost state is a system failure, not a user problem. Every piece of state that matters must be stored — either explicitly to a device, or explicitly marked as intentionally temporary.
*↳ Temporary storage is only for temporary data. If you cannot say out loud "this data is intentionally ephemeral and I accept it being lost," it must be persisted.*

**§2.2 The Storage Device Is the Source of Truth**
Until persistence exists, nothing works. A system that holds state only in memory is a prototype. Watchdog visibility and storage-device confirmation are the gate conditions for a feature being considered functional.
*↳ If it cannot survive a restart, it does not exist yet.*

**§2.3 All State Must Be Observable**
If state cannot be seen — by a watchdog, a diagnostic hook, a log entry, or a UI element — it does not exist as far as the system is concerned. Invisible state is the root cause of the hardest bugs. Every significant state transition must leave a trace.

---

### § Group 3 — Build Order

**§3.1 Bottom-Up Only. Foundation and Architecture First.**
Nothing is built on top of something that does not exist yet. File system and data schema before modules. Modules before UI. UI before integration. Integration before polish. A phase does not begin until the phase below it has passing tests.
*↳ Every phase has a declared gate (what must be complete before it starts) and exit criteria (what done actually means). "It seems to work" is not exit criteria.*

**§3.2 Logical Time Is the Ordering Axis**
eventTs — kernel-local logical time — is the only axis for ordering events, gate windows, and analytics. Wall clock (ts) is display metadata only. It is never used in ordering, causality, or replay. Mixing the two is a category error.
*↳ If you are ordering by wall clock, you are not ordering — you are hoping.*

---

### § Group 4 — Quality

**§4.1 A System That Cannot Be Tested Cannot Be Trusted**
Every system includes diagnostic hooks, testability surfaces, and automated test coverage. UI is tested via Playwright. Logic is tested via unit tests against real data. Integration is tested via cross-domain verification. A feature with no test path is not done.
*↳ QA runs six lenses on every root cause analysis. All six. Not optional.*

**§4.2 Fix Bugs Pre-Emptively**
Before any new phase begins, the weakest links in the current system are identified and attacked. If a hostile audit finds a flaw, that flaw is fixed — not deferred. A known vulnerability in a shipped system is a decision to accept the consequences of that vulnerability.
*↳ Run deep fractal analysis per layer. Cross-domain verification for debugging. Adversarial simulation before every release.*

**§4.3 Enterprise Grade Only. Military Grade Security. Cybersecurity Grade Privacy.**
There is no "good enough for now." The standard is enterprise grade from the first line of code. Security is not a layer added at the end. Privacy is not a compliance checkbox. Both are architectural constraints that shape every decision from the beginning.

---

### § Group 5A — Architecture Connectivity & Infrastructure

**§5.1 Everything Has a UUID, Hook, and Event Bus Registration**
Every module, every feature, every significant operation has a UUID that never changes. Every integration point is a registered hook with a declared side-effect policy. All execution flows through the event bus — no direct module-to-module calls. Nothing operates outside the routing layer.
*↳ An unregistered hook is an orphan. An orphan is a bug waiting to happen. No orphan modules or hooks are allowed.*

**§5.2 Everything Implements the Bridge**
Every system connects to the bridge. The bridge is the routing layer, the event bus, the integration surface. A module that does not implement the bridge is isolated — and isolation is incompatible with the principle that everything is alive and interconnected.

**§5.3 No Monkey Patches — Full System Patches Only**
A fix that patches behaviour at the call site without addressing the root cause is not a fix — it is debt with interest. Every patch must address the root cause structurally. If that means touching multiple files, touch multiple files. If it means a version bump, bump the version.

**§5.4 Versions Persist Across the Entire Project**
One version number. The same string appears in every file, every comment, every manifest, every magic header. Version drift between files is a bug, not an oversight. The version gate catches it before runtime.
*↳ Every phase increases the version by 0.1. The version number is the system's memory of its own history.*

**§5.5 What Does Not Exist Must Be Built**
External runtime dependencies are a liability. If something does not exist and it is needed, it is built — not imported from an unmaintained package. This is not about pride. It is about control. A system you built you can fix. A system you imported you can only update.
*↳ Dev tools, test utilities, and build tools are exempt. Runtime dependencies are not.*

---

### § Group 5B — Architecture Geometry

**§5.6 Structural Self-Similarity (Fractal Law)**
The same structural pattern must be recognisable across abstraction layers. The composition of a module must mirror the composition of a system, and the composition of a system must mirror the composition of a module. A developer who understands one layer must be able to reason about adjacent layers without introducing a new conceptual model.
*↳ This is not a coupling constraint. It is a cognitive structure constraint. A system that violates this law is internally inconsistent — each layer requires a separate mental model to navigate.*

**§5.7 Low Coupling, High Cohesion**
Each module must encapsulate a single responsibility and fully own its internal state. All inter-module communication must occur exclusively through the event bus. Direct dependencies between sibling modules are prohibited. If a module requires another module to function, the boundary is incorrectly defined and must be refactored.
*↳ An import between two sibling modules is a build warning. Three such imports is a mandatory refactor before the phase can close.*

**§5.8 Composability Over Configuration**
System behaviour must emerge from the composition of simple modules rather than from the configuration of complex ones. If a module requires extensive configuration to express multiple behaviours, it is overextended and must be decomposed. Configuration may refine behaviour — it must never define structure.
*↳ A module that requires 10+ config flags to behave correctly is not a module. It is a system that has not been named yet. Name it, decompose it, and compose the pieces.*

---

### § Group 6 — Documentation

**§6.1 Documentation Is Generated From Proof, Not Written as Aspiration**
A readme that describes features not yet built is fiction. A manifest that lists modules not yet tested is a wish list. Documentation is written to record what is true, not to describe what is planned. The phase map is the roadmap. The changelog is the history. Both are written after the fact, not before.
*↳ If the documentation does not match the code, the code is the truth and the documentation is wrong.*

**§6.2 Always Read Before Building**
Every session begins with a read: manifest, roadmap, readme, changelog. If none exist — audit the codebase, map what is there, and create them before writing a single line of new code. Building without reading is building without context.

---

### § Group 7 — Cognition and History

**§7.0 Event Ontology Separation**
Idea Ledger events are observational and non-authoritative. Upgrade Ledger events are authoritative and state-mutating. Both are causal events in the same graph — but only Upgrade Ledger events affect system state.
*↳ Treating speculative events as low-confidence execution is the root cause of self-poisoning causal graphs. The distinction is not cosmetic — it is a security boundary.*

**§7.1 Dual Ledger Architecture**
The system maintains two separate ledgers. The Upgrade Ledger records what is: verified changes, causal fixes, measurable results, diff-linked proofs — permanent. The Idea Ledger records what could be: hypotheses, architectural proposals, design intuitions, pattern observations — speculative, mutable, allowed to be wrong. Mixing them is a structural failure, not a documentation error.

**§7.2 Ideas Cannot Affect Runtime**
Idea Ledger entries have no enforcement. They cannot be depended on by any module. They cannot reference runtime state as fact. They exist in a read-only cognition layer that the system observes and measures — but never executes.

**§7.3 Cognition Is Not History**
An Idea Ledger entry may only become an Upgrade Ledger entry through an explicit validation step — a passing test, a proven diff, a measurable result. Ideas that skip the gate corrupt the causal record.
*↳ The validation gate is the boundary between cognition and history. It is not optional and has no exceptions.*

**§7.4 Track Methods, Solutions, and Patterns**
Every novel approach, breakthrough solution, and discovered structural pattern is recorded in the Idea Ledger before it is lost. Nothing useful is discarded — it is either promoted through the gate or archived as a rejected hypothesis with its failure mode documented. Dead branches are data.

**§7.5 Semantic Classification of Idea Failure**
Every Idea Ledger entry that does not become an upgrade must be classified at closure: Unresolved (active, still being worked) / Rejected (validated and failed) / Abandoned (set aside without validation). Only unresolved clusters contribute to bottleneck metrics.
*↳ A system that penalises exploratory thinking by counting it as stuck work will suppress the cognition it depends on.*

**§7.6 Data Reconstruction From Upgrade Ledger**
The codebase is a materialised view of the Upgrade Ledger. If the view is lost or corrupted, it is reconstructed by replaying the Upgrade Ledger from the beginning. The Upgrade Ledger must be append-only, cryptographically verifiable, and stored independently of the codebase it describes.
*↳ The log is the truth. The code is the projection.*

**§7.7 Bottleneck Detection via Ledger Flow**
The sigma engine measures idea-to-upgrade conversion rate, gate latency, branch entropy, and idea density per component. A positive delta slope on unresolved idea clusters is a bottleneck signal. A collapsing upgrade rate relative to idea generation is a cognitive overload signal.

---

### § Group 8 — Process

**§8.1 Begin Every Session With Context**
State the current phase, last known state, active bugs, and intent before any implementation begins. If context is not provided, ask for it explicitly before proceeding. Building without context is building without a target.

**§8.2 Nothing Passes the Idea Gate Without Surviving Hostile Review**
Brainstorming produces candidates, not conclusions. Every idea must survive adversarial pressure — genuine attempts to kill it, not polite pushback — before it becomes a spec. A spec that does not explicitly address the failure modes surfaced in hostile review has not passed the gate.
*↳ The goal is not to win the argument. The goal is to find the holes before the build does.*

**§8.3 SISO and Jaa Are Load-Order Prerequisites**
If SISO and Jaa are not present at session start, await upload before proceeding with any build work. These are not optional dependencies — they are the substrate. A system built without them is not on the foundation.

---

## Part II — Flexible Principles

These bend to the problem. When a principle conflicts with an immutable law, the law wins. When two principles conflict, the end-state is the tiebreaker.

**The End-State:** A system that is as reliable, resilient, and flexible as possible — while remaining fluid. Novel, not neat little boxes.

### Design Principles
- **Drop-down menus, popout windows, and synthesis layers are primary UI primitives.** Not modals that block. Contextual, layered, non-destructive.
- **Settings are first-class.** Every fluid value has a settings surface. If you cannot change it without redeploying, it is not a setting yet.
- **Tidy but powerful.** Complexity lives behind progressive disclosure — available when needed, hidden when not.
- **Everything is alive and interconnected.** A change in one module propagates through the event bus. Nothing is static.

### Development Principles
- **Build modules.** Every feature is its own module. A feature that cannot be removed without touching every other feature is not a module — it is a tangle.
- **Everything is built with the future in mind.** Extension points are declared upfront. Designed to be added to, not rewritten.
- **Each project is one thing.** The moment a project tries to serve two different purposes, it stops serving either well.
- **Do not stray.** Ideas that cannot be mapped to the current architecture are either premature or wrong. Grounded execution, idealistic vision.

### Collaboration Principles
- **Idea layer + execution layer.** Both are necessary. Neither works alone.
- **Pushback is required.** Find the flaw before it ships. Comfort is not the goal.
- **Track methods and solutions.** Nothing useful is lost.
- **Token efficiency is a constraint.** One precise question beats ten vague ones.

### Output Contract
> **§** Entire project only. Full output into a zip. No partial patches. No monkey patches. Full system patches — touch every file that needs touching.

- Entire project output, not diffs
- Zipped, with manifest, changelog, and roadmap updated to reflect what was actually built
- Every file that references the changed module is checked and updated
- Version bumped per-phase (0.1 per phase)
- Playwright tests run on UI changes before output is considered valid

---

## Part III — The Six Lenses

Every root cause analysis, every architectural review, every hostile audit runs through all six. Not as a formality — as a genuine attempt to find what each lens would find.

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

Copy into every project manifest under `"axioms"`.

```
§1.1  Nothing exists until proven.
§1.2  Nothing pretends to work — and nothing silently fails.
§1.3  No fake, mock, stub, placeholder, or skeleton in production.
§2.1  Persistence is the golden rule. Temporary storage for temporary data only.
§2.2  The storage device is the source of truth. Nothing works without persistence.
§2.3  All state must be observable. Invisible state does not exist.
§3.1  Bottom-up only. Foundation and architecture before modules. Modules before UI.
§3.2  Logical time (eventTs) is the ordering axis. Wall clock is display metadata only.
§4.1  A system that cannot be tested cannot be trusted.
§4.2  Fix bugs pre-emptively. Attack the weakest link before shipping.
§4.3  Enterprise grade. Military grade security. Cybersecurity grade privacy.
§5.1  Everything has a UUID, hook, and event bus registration.
§5.2  Everything implements the bridge.
§5.3  No monkey patches — full system patches only.
§5.4  Versions persist across the entire project. One version. Everywhere.
§5.5  What does not exist must be built. No external runtime dependencies.
§5.6  Structural self-similarity — the same pattern across every abstraction layer.
§5.7  Low coupling, high cohesion. All inter-module communication via event bus only.
§5.8  Composability over configuration. Behaviour emerges from composition, not config.
§6.1  Documentation is generated from proof, not written as aspiration.
§6.2  Always read before building: manifest, roadmap, readme, changelog.
§7.0  Event ontology separation — observational vs authoritative events.
§7.1  Dual ledger architecture — Upgrade Ledger (truth) + Idea Ledger (cognition).
§7.2  Ideas cannot affect runtime. Cognition layer is read-only to the system.
§7.3  Cognition is not history. Ideas pass through a validation gate before becoming upgrades.
§7.4  Track methods, solutions, and patterns. Dead branches are data, not waste.
§7.5  Classify idea failure: unresolved / rejected / abandoned.
§7.6  Codebase is a materialised view of the Upgrade Ledger. Reconstruct from the log.
§7.7  Bottleneck detection via ledger flow. Sigma engine measures idea-to-upgrade conversion.
§8.1  Begin every session with context. Phase, state, bugs, intent — before any build.
§8.2  Nothing passes the idea gate without surviving hostile review.
§8.3  SISO and Jaa are load-order prerequisites. Await upload if not present.
```

> **§** End-state: as reliable, resilient, and flexible as possible — while remaining fluid.
> Novel, not neat little boxes. The codebase is a materialised view of the Upgrade Ledger.
> Ideas are input, not output. The sigma engine measures the flow between them.
> **Let's make history.**
