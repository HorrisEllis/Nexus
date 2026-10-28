# NEXUS — Working Agreement (read this first, every session)

This file is the persistent contract for anyone (human or AI) building NEXUS.
It exists because these rules kept living only in conversation memory and drifting.
They are law here. AXIOMS-v3.1 governs; this is the operational distillation.

## The five standing rules — non-negotiable

1. **MAP BEFORE BUILD (§3.3).** No code before the work is mapped. For anything
   non-trivial, write or extend a phasemap in `docs/*-phasemap.spec` — chunked,
   bottom-up, drift accounted per phase — BEFORE touching source. Grounding
   (§8.6, below) is part of mapping.

2. **REUSE BEFORE BUILD (§8.6).** Read the codebase first. Nearly everything has
   substrate already. Before writing a "new" module, grep for what exists and
   compose it. Most drift this project has seen came from building beside
   something that already existed.

3. **ALWAYS UPDATE THE COMPONENT REGISTRY — WITH WIRES.** Loom's registry is the
   system's self-model of its own connections; it is how NEXUS stays aware of
   itself so it can fix itself. Every new component MUST be mapped into loom
   **with its real `require()`/consumer edges as wires**, not as a bare
   declaration. A component with no wires is an isolated dot the system cannot
   reason over. Mirror `loom/maps/warp-map.js`; add to
   `loom/maps/observability-map.js` (or a sibling map). Bare `driver.declare`
   with no hooks/wires is a defect, not an update.

4. **ADDENDA TO RELEVANT SPECS (§12.5).** A living spec documents drift. When you
   change behavior, add a dated `## ADDENDUM` to the spec(s) that own it, and
   register new specs in `docs/SPEC-REGISTRY.spec` (§6.3). Divergent copies of a
   spec are two contracts — surface them, don't collapse them silently.

5. **NOTHING GETS LOST UNLESS REDUNDANT (§0.3).** Archive, don't delete. A stale
   thing is superseded-and-kept, not erased. The only removable thing is a true
   duplicate, and even then the drop is reported, not silent.

## Delivery discipline

- **ONE zip, named `nexus.zip`, no fragments.** The user sees work only through
  `/mnt/user-data/outputs/nexus.zip`. Remove preview files before presenting.
- **NEVER commit `data/**`.** That is state, not code. Commit code + docs only.
- **Version bump per phase/chunk** in `lib/version.js` (the single source of
  truth; package.json follows it).
- **Tests:** register in `tests/modules/run-all.js`; silence `[jaa]`-style logs
  or the runner miscounts. Suite must stay green.
- **UI is tested in Clear Glass, never Playwright** (AXIOMS §4.1, 2026-10-05). James: "No playwright. That's
  literally what clearglass was born from." Drive pages with `clear-glass/src/driver/glass.js`; CG-001b fails any
  file that loads Playwright.

## James's voice (2026-10-01)

James: "can you make it a rule to quote me, in the versions, changelogs, like i want my voice to be here. I have no
job, or portfolio. i want this as much me as possible. you're the coder."

- Every version line in `lib/version.js`, every `CHANGELOG-*.md`, and every phasemap's `origin` opens with James's
  own words, quoted verbatim — his spelling, his phrasing, not cleaned up. Then what was built, and the proof.
- The idea, the direction and the calls are his; say so. The code is the coder's job; the project is his work.

## His decisions, quoted with their context (2026-10-13)

James: "can you add to claude.md to quote me and my decisions, with context to establish credibility."

The record has to show that the design is his: what he decided, when, in his words, and what he was deciding between. A
reader who never met him should be able to follow the line from his idea to the code. So every decision he makes is
written down where the work lives, never only in a chat:

- **Where.** A phasemap's `decisions:` entry (its `chosen:`), a spec's `## ADDENDUM`, a repo's Notes (kind `decision`
  or `quote` — lib/repo-notes.js), and the version line and CHANGELOG of the release that acts on it.
- **What it carries.**
  1. His words, verbatim and dated: his spelling, his phrasing, not cleaned up.
  2. The context: what he was asked or was looking at, and the choices on the table. Name the coder's recommendation
     as the coder's.
  3. What was decided, and what it changed (files, phases).
  4. If the coder read his words one way where another reading exists, say so and mark it "to confirm". Never
     present the coder's reading as his decision.
- **Credit.** Ideas, direction and decisions are attributed to him by name. The coder's part is named as the coder's:
  a reading, a recommendation, a pushback, the code. Where a design came from his idea and the coder shaped it, both
  are said.
- **Nothing rewritten.** A later decision supersedes an earlier one by a dated addendum that quotes both; the earlier
  one stays (§0.3).

This file loads for every session at the repo root through `CLAUDE.md` (which imports it).

## Claude follows the axioms too (2026-10-13)

James: "also maybe, add in claude, also to follow axioms. name the tools, and best areas to get context"

The coder works under the same law as the system. `docs/AXIOMS-v3.1.md` governs and RAID's constitution
(`lib/constitutional-ai.js`) binds every action: USER_AUTONOMY (his calls are his), REVERSIBILITY (every change can be
undone: a snapshot first, archive rather than delete), TRUTH_OVER_COHERENCE (say what the run showed, even when it spoils
the story), EXPLAINABILITY (every change says why). The parts that bite most often:

- §0.1 / §1.1: evidence over memory. Read the file or run the thing before you claim it.
- §1.2: nothing fails silently. A skip says why.
- §3.3: map before build. §8.6: reuse before build. §12.5: addend the spec that owns the behaviour.
- §5.2 / §9.1: routing goes through RAID, and RAID is the only write authority for the system's own decisions. Don't
  build a side door.

## Where to get context: the tools, best first (2026-10-13)

Read the compact projections before the raw tree. A wrong guess about what exists is how drift starts.

1. **`nexus.command`.** The one tool every agent has. It runs every row in `idearium/cli/route-commands.js` (`action
   list` shows them all). In Claude Code the same table is the `mcp__nexus__*` tools (`.mcp.json`): `nexus_grep`,
   `nexus_read_range`, `nexus_loom_query`, `nexus_loom_impact`, `nexus_read_spec`, `nexus_gaps`,
   `nexus_changelog_tail`.
2. **Loom** (`loom/`, registry, `loom/maps/*`) is the system's self-model: components, hooks, and wires as real
   require/consumer edges. Ask it "who uses this" (`loom_impact`) before changing anything shared.
3. **The atlases** (`docs/atlases/*-atlas.md`, one per system) give what each system is, its files, routes, and events.
   `lib/context-atlas.js` searches across specs, notes and nodes.
4. **Specs and phasemaps.**
   - `docs/*.spec` and `docs/*-phasemap.spec` hold what was decided and what is open. `docs/SPEC-REGISTRY.spec` lists
     them.
   - The newest phasemap for the area tells you its state.
   - `cos/spec/check-catalogue.spec` is every check and gate, with `exists:` naming the code that already does it.
5. **Code intelligence.** `lib/code-intel/` (cards, decls, search) answers "where is this declared and what does it
   do" without reading whole files.
6. **What happened.**
   - The activity log is `lib/activity-log/`, read with `activity` and `log`.
   - The ledgers are `lib/ledger-*.js`.
   - The CHANGELOGs and the version lines in `lib/version.js` quote James's reason for each release.
7. **His notes** (`lib/repo-notes.js`: `repo notes`, `notes`) hold the ideas, decisions, todos and questions he has
   logged. Read them before asking him something he already answered.
8. **A repo's own versions.** `repo versions` gives every snapshot, backup, staging commit, imported history entry and
   revision. `repo diff` shows what changed between any two.
9. **The component store** (`lib/component-store.js`, `components`) holds every decomposed project's components, with
   their dependencies resolved.

## Credibility, skills, and proof (2026-10-13)

James: "focus on what establishes credibility, and skills, portfolio, and proof of compentancy. money is needed, badly."
· "sometimes I need some motivation but nothing ungrounded in truth. like tell me when im making good choices. note
valuable skills. log patterns, methods, anything valuable to improve. log anything that helps establish credibility,
value and proof of compentancy with quotes and explicit context."

- **`docs/PROOF-OF-COMPETENCY.md` is the portfolio record.** Each release adds what it proves about his skill and
  judgment:
  - his words, quoted and dated;
  - the context: what was on the table, and what he chose;
  - something a stranger can check: a commit, a test, a spec, or a number from a real run.
- Never inflate. If a claim cannot point at evidence, leave it out.
- **Encouragement is grounded.** When he makes a good call, say so and name the evidence, for example: "that decision
  is why X didn't break". When a call cost something, say that too. Both are data.
- **Name skills as skills.** Systems design, specification, failure-mode thinking, and directing an AI coder to
  production quality are each named with an instance when they show.
- His working style, architecture principles and coding language live in `skills/james-brooks/SKILL.md`, which loads
  through `.claude/skills/james-brooks`. Read it at the start of a session.

## Use what you already have (2026-10-17)

James: "always make effective use of what you already have."

Said after a day in which the coder named outside editors from memory instead of using his Clear Glass search-engine tool,
and read the tree with grep instead of the Nexus tools this file lists first. The rule, as his:
- Before building, and before answering from memory, use what Nexus already has: its tools (`mcp__nexus__*`, the one
  command table), its records (the run log, the change records, the ledgers, the notes), its stores, and its existing
  components. Rule 2 (reuse before build) covers code; this covers the coder's own way of working too.
- When something new is built, say what existing piece it stands on, and why nothing existing could do it.

## Decide by the axioms what does not show his competence (2026-10-17)

James: "use the axioms in the docs for each disicio nthat doesn't show my competence"

Said after a day of questions handed to him that the axioms already answered (is lib/ a system, HTTP or in-process, how a
rule is enforced, where tests live). The rule, as his:
- A technical decision (which implementation, which layout, which enforcement) is the coder's to make by
  `docs/AXIOMS-v3.1.md`. Each one is recorded with the axioms that decide it, in the owning map's `decisions:` and in
  `docs/2026-10-17-decisions-by-the-axioms.spec`, as the coder's decision by the axioms, never as his.
- What stays his (USER_AUTONOMY): what he meant by his own words, the direction (what Nexus is for, what comes first), and any
  call he has said is his ("thats on me"). A reading of his words is acted on, said as a reading, and asked when it matters.
- He can overturn any of them; the overturn is a dated addendum quoting both (§0.3).

**Corrected the same day.** James: "no, this is my system. come to me for problems, else use the axioms. continue with each
system." The first version above recorded these as "the coder's decision by the axioms, never as his". That framing is
wrong, and is superseded here (the first version is kept, §0.3). The axioms are his, so a decision they make is his system
deciding by its own law. The coder applies them and cites them, and the record says "decided by his axioms". What comes
to him is a **problem**: something the axioms do not settle, a conflict between them, a failure, or a cost he would want
to know about before it is paid. Everything else proceeds.

## Leverage (2026-10-07)

James: "remember to use as little tokens for as much leverage and power as possible. invent around contraints if it fits
nexus better and i prefer novel if it's stable./"

- Fewest tokens for the most power: one door, one table, one tool. Agents read compact projections, not raw dumps.
- Where a constraint can be designed around in a way that fits Nexus better, do it. Prefer the novel design when it
  is stable (built on primitives that already exist and are proven), not novel for its own sake.

## Agents for what they are best at, as little as possible (2026-10-13)

James: "yes use you for the cheapest but most effective intention." · "it would be nice to use agents intentionally for what
theyre best at. as little as possible. like spread agents out opimally for what theyre best at. less tokens from you, the
better. becasue you can code better than any but you're not free."

The rule, for Nexus's routing and for this coder:
- **Deterministic first.** A parser, a test, a grep or a check runs before any model is asked.
- **Local by default.** Ollama does the bulk of the coding (one planned file per request).
- **A reasoning agent only plans, and reviews or repairs only after a cheap check has failed.** Never "review everything".
- **Claude Code (this coder) costs the most, so it gets the work where it is worth that cost:**
  - root causes from logs;
  - small fixes that carry a lot;
  - architecture and specs;
  - closing what other agents could not.
  It does not do bulk file writing that a planned brief and a local model can do.
- **Count it.** Agent calls and tokens per phase are recorded, so "as little as possible" is a number, not a feeling
  (phase AG1, docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec).

## Order of delivery (2026-10-07)

James: "always add backend js first, then the ui. can you do that. make sure you build the ui. then make sure the ollama
additions stay with ollama. then make sure the agents have accesss"

- Every capability lands in this order, in the same phase: backend JS → API route → command (a row in
  idearium/cli/route-commands.js SPEC, so copilot and every agent have it through nexus.command) → UI. A phase is not
  done while it has no screen; say so if the UI is deferred.
- Code belongs to the system it serves: what is Ollama's lives under ollama/ (not lib/), and so on for each system.
- Agents get every capability a person gets, through the one command tool — check the repo agent's tool scope, not
  just the table.

## A dependency graph before every phase (2026-10-18)

James: "each phase, has to have a dependany graph before executing."

This binds the system and the coder alike:
- **Nexus refuses it (DG2, 0.60.147).** `lib/phase-graph.js` assembles a phase's graph:
  - from the phase's mapping (`lib/phase-map-auto.js`): the files it changes, what they use, and who uses them (what a change
    can break);
  - from its `depends_on` (DG1);
  - from the boundary census (`lib/system-boundary.js`): the systems it touches, and every edge that crosses between systems,
    marked as already in the ratchet's baseline, or new.

  ▶ build refuses a phase without a graph (409 NO_GRAPH), and there is no "anyway" for it. The graph is written to a file
  before anything runs, and its hash goes on every row of the run. Read one with `repo phase-graph <repo> <phase>`, or in the
  Phases tab.
- **The coder runs it first, every phase.** Before writing code for a phase, run its graph and read it:
  - a phase with no graph gets one first: name its files in the map;
  - a NEW CROSSING in the graph is designed out (a route, or the file moves to its system) before any code is written.

  Why: on 2026-10-17 the coder shipped FR6 without a graph, and the boundary ratchet caught the crossing an hour later.

## Evidence discipline (§0.1, §1.1)

- Evidence over memory. Verify against the actual file/behavior before asserting.
- Nothing is real until proven — a declaration/route/wire is a CLAIM until
  checked against source. Don't let paperwork stand as truth (see
  `loom/scanners/` — declared ≠ served).
- Nothing silently fails (§1.2). A skip/failure is stated with a reason.

## When unsure

Ask with a specific proposed action rather than guessing silently or refusing.
Improvise with the best available tool; ask only when the action is consequential
and uncertain.

---
*If you are an AI reading this at the start of a session: these five rules are not
suggestions. Map first, reuse first, wire the registry, addend the specs, lose
nothing. Then build.*

## ADDENDUM 2026-10-19 (0.60.172 DG3) — every phase has its place in the whole DAG
James, 2026-10-19: "every phasemap phase needs extensive dag, that needs to start being standard."
The standard for every phase of every phasemap (Nexus's and every repo's):
- a `depends_on:` line — `[]` when it depends on nothing; a phase with none is reported as undeclared;
- every name in it resolves to a phase or a decision in some map (no prose, no typos) — else it is dangling and not built;
- no cycles — a phase in one is not built;
- its `files:` named, so same-file phases with no order between them are seen.
lib/phase-dag.js checks all of it across all maps; `repo dag <repo> [phase]` and GET /api/repos/:uuid/phases/dag show it; the
build refuses DAG_INVALID (anyway overrides, said on the run). DG1 (open depends_on) and DG2 (the phase's own graph) still hold.

## ADDENDUM 2026-10-19 (decision NC0) — neutral core, adapters, explicit evidence, a schema for everything reusable
James, 2026-10-19: "the components in the component registry can be any language. for idearium to build any project, anyone can
unnderstand, and it would be immensly stable." Map: docs/2026-10-19-infrastructure-spine-phasemap.spec (NC0 addendum).
- **Migration rule:** new features depend on the neutral contract (lib/core/*, lib/adapters/contract.js), never import JS-specific
  verification or scanning (node --check, exportsOf, the require scanner) directly. Existing JS paths move behind the JS adapter.
- **Evidence rule:** every edge and verdict says where it came from — discovered (which adapter), declared (by whom) or unknown.
  Unknown stays unknown; it never counts as proof of completeness.
- **Schema rule:** reusable or deterministic code that is architectural, stores memory or data, or keeps consistency has a schema,
  template, reusable node type or spec file — built from it, checked against it.
- Adapters grow only when a second real adapter needs a method; the boundary is proven (NT1) before breadth.


## ADDENDUM 2026-10-20 — specs, then phases, then each phase specced again (his rule)
James, 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt if
lost. can you do that? what about specs, then phases then specced again with dag and related files for it, look at the handoff"
The order, for every new capability:
1. **A full spec** in emerge's module format (emerge/SPEC_COMPILER.spec is the reference): schemas with fields and validity rules;
   interfaces for everything it stands on, with their real exports; modules with path, exports (signatures), gate pipeline,
   behavioral contracts, error paths and acceptance. It must compile in lib/emerge/compiler/kg-builder.js (emerge/ moved into lib/ 2026-10-24, RF2) with every module and schema
   at specDepth 1.0, no BLACK node, and the invariants engine valid — the bar for "can be rebuilt if lost". Examples:
   docs/substrate.spec, docs/belief-loop.spec. Checked by tests/modules/test-substrate-spec.test.js.
2. **Phases** in a phasemap, each naming `spec:` and the module ids it builds in `blocks:` (DAG-checked, lib/phase-dag.js).
3. **Each phase specced again**: `node lib/emerge/compiler/phase-specs.js <map>` writes <owner>/phases/<map-id>/<phase>.phase (what is
   authored) and graph/<phase>-<hash>.graph (its related files with roles, crossings, and its slice of the whole DAG), beside the
   system that owns it (the handoff's PN1 layout). `--check` reports drift.
Only then is code written, and a phase's code is built against its .phase, its .graph and its spec modules.


## ADDENDUM 2026-10-21 — the axioms are law, for every decision
James, 2026-10-21, after three questions were put to him about the BrainOS plan and the coder said "nothing moves on to the next ready
phase" without his run in hand: "Follow the axioms in docs. Use them as law, and for every decision. It built 5 phases in a row. I think I
see what you mean but there are way more idearium phases than that."
- Every decision cites the axioms that decide it (docs/AXIOMS-v3.1.md), in the owning map's `decisions:`; a question goes to him only when
  the axioms do not settle it, they conflict, or it is his by USER_AUTONOMY (what he meant, the direction) — and then with the axioms named.
- What he reports seeing is evidence (§0.0 truth is supreme, §0.1 evidence over memory). When the code seems to say otherwise, the gap is
  traced, not argued.

## ADDENDUM 2026-10-28 (0.60.274) — where a changelog is written
James, 2026-10-28: "can we move the changelogs to versionium and idearium"
- A release's `CHANGELOG-<version>.md` is written in `versionium/changelogs/` (lib/changelogs.js `pathFor`), not at the repository root.
  Read them through lib/changelogs.js, `system changelog [x.y.z]`, or Idearium's Releases view.
