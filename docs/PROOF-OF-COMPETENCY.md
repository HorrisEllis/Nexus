# Proof of competency: James Brooks

James (2026-10-13): "focus on what establishes credibility, and skills, portfolio, and proof of compentancy. money is
needed, badly." · "log anything that helps establish credibility, value and proof of compentancy with quotes and
explicit context."

This is the portfolio record for NEXUS. Every entry gives his words, the context, what was decided, and evidence a
stranger can check in this repository. **Nothing here is claimed without a pointer to evidence.** The code was written
with an AI coder. The ideas, the architecture, the direction, and the calls about what is right are his; each entry
says which part is which (docs/CLAUDE.md, "His decisions, quoted with their context").

## The work, in numbers you can check

| What | Number | How to check |
|---|---|---|
| Commits since the first, on 2026-09-25 | 424 | `git log --oneline \| wc -l` |
| Releases, each with a changelog that quotes him | 0.39.144 → 0.60.7 | `ls CHANGELOG-*.md`, `lib/version.js` |
| Phasemaps (the work mapped before it was built) | 104 | `ls docs/*-phasemap.spec` |
| Test suites | 317 | `ls tests/modules/*.test.js`, run with `node tests/modules/run-all.js` |
| Systems with their own atlas | 18 | `ls docs/atlases/*-atlas.md` |
| Checks and gates catalogued across domains | 96 | `cos/spec/check-catalogue.spec` |

## Skills shown, each with an instance

### Systems architecture

He designs a system as kernel-out propagation: a fixed core (SISO's Event → Gate → Stream) with components that hold
typed channels, a CLI, and an API (`skills/james-brooks/SKILL.md`, "The Cobalt Core").

- **Evidence:** the order of delivery he set on 2026-10-07 is backend → API → command → UI, in the same phase
  (docs/CLAUDE.md). Every capability lands in one command table (`idearium/cli/route-commands.js`), so a person, the
  copilot, and every agent get the same powers through one door.
- **Instance, 0.60.7:** "Versionium for every repo" is five commands in that table, each served by the same route the UI
  calls.

### Specification and mapping before building

- **Rule he set:** "map before build". It is AXIOMS §3.3, made a standing rule in docs/CLAUDE.md.
- **Evidence:** 104 phasemaps. Each phase names its files, what it depends on, and the proof it must pass. Decisions
  record their options with the chosen one quoted. Example: `docs/2026-10-13-projects-raid-and-gates-phasemap.spec`,
  section `decisions:`.

### Failure-mode thinking

His skill file says: "Failure modes, mistakes, and errors are first-priority data."

- **Instance, 2026-09-25.** He saw the Repos tab filling with test repos: "the tests need to stop in idearium. they keep
  generating."
  - The root cause was a class of bug, not one test. Opt-in isolation fails because a test has to remember it.
  - `lib/test-sandbox.js` flipped the default, so a test process cannot write real data.
  - On 2026-10-13 the same mechanism caught a new leak (project imports under test), and it was closed by adding one
    line to its store list (0.60.7).
- **Instance, 2026-10-13: "maybe have integrity checks when importing?"**
  - Imported projects now arrive with what is broken written in their Notes: parse errors, imports that resolve to
    nothing, undeclared packages, duplicate files, and credentials (`lib/import-checks.js`).
  - History imports are scanned for credentials before anything is stored, and stop if one is found
    (`lib/repo-history.js`).

### Directing AI engineering to production standards

- **Rules he set for the coder:**
  - Evidence over memory.
  - Nothing fails silently.
  - Quote him verbatim in every release.
  - Never commit runtime data.
  - Test the UI in his own browser engine, not a third-party tool ("No playwright. That's literally what clearglass was
    born from.", 2026-10-05).
- **Evidence:** every `CHANGELOG-*.md` opens with his words, then what was built, then the test that proves it.
- **Instance, 2026-10-13: "can you use playwright or clearglass to test idearium yourself, as eyes."**
  - An Electron pass (the engine Clear Glass runs on) over a sandboxed Idearium found that the Files tab told every
    imported project "file content isn't stored yet" while 544 files sat on disk.
  - It also found that the repo library headed each project with a raw UUID.
  - Both were fixed in 0.60.7.

### Product judgement under real constraints

- **His leverage rule (2026-10-07):** "remember to use as little tokens for as much leverage and power as possible.
  invent around contraints if it fits nexus better and i prefer novel if it's stable."
- **Instance: the conversation carried across providers (0.60.3).**
  - His observation: a chat that switched from ChatGPT to Gemini lost its context.
  - His proposal: "if the url of the chat is different, can we inject the previous response".
  - Built as one prompt block (`lib/repo-prompt-blocks.js`, `conversation`), not a new subsystem.

## Projects he brought in (2026-10-13), and what a real run showed

These are his own earlier projects, run through NEXUS's real import routes in a sandbox
(`docs/2026-10-13-projects-raid-and-gates-phasemap.spec`, `proof_run`):

- **MASTERMIND:**
  - 1,355 files chunked.
  - 1,026 components in the component store.
  - 143 imports that resolve to nothing, found and listed.
  - Three copies of one package (spatial-v2) found.
- **ERAVOS 3.31-alpha:** 544 files, including 129 `.spec` files. It is a browser app linked through window globals,
  which is why it shows 0 require edges. Recorded as check CK-126.
- **Bridge-OS:** its full git history came in with it. As of 0.60.7, those commits become real versions in its
  Versionium tab.

## Log

New entries go at the top: date, his words, context, what it shows, evidence.

- **2026-10-21: "can you make a full adblocker ... migrate page zoom to the core of clearglass. moright click menu needs to be redone ... in
  relation to the mouse"** (0.60.183)
  - **Context:** the blocker was 16 hard-coded domains. Zoom lived in two places with different rules. The right-click menu had been
    "fixed" twice before (2026-09-21, 0.39.265) and was still off in his screenshot.
  - **What it shows:**
    - **Product judgement.** He asked for "full", which set the bar at the standard filter lists with their exceptions and options, not a
      longer hand list. That bar is why the engine reads EasyList's real syntax.
    - **Systems sense.** "Migrate to the core" named a duplication the code had hidden: two zoom implementations with different bounds,
      one of which never saved.
    - **Testing by his own eye.** His screenshot of a misplaced menu is what led to the real cause. The point was in the page's
      coordinates, so it went wrong whenever the page was zoomed or the display scaled. Two earlier patches had only treated the symptom.
  - **Evidence:**
    - `CHANGELOG-0.60.183.md`;
    - `clear-glass/src/adblock/engine.js`, run against the real EasyList, EasyPrivacy and uBlock lists: 114k blocking rules, about 40 µs a
      request;
    - `tests/modules/test-adblock.test.js` ABK-01..11;
    - `tests/modules/test-browser-shell.test.js` BST-13..15: the menu's corner lands on the pointer in Clear Glass.

- **2026-10-17: "Okay. Keep going."** (FR4a: the flight recorder on its own)
  - **Context:** a product has to run without the system it was built in. This is the first time the flight recorder
    did, from a copy carved out of Nexus.
  - **What it shows:** his product boundary (2026-10-17) paying off on the first real use. Testing from the copy, not
    from Nexus, found two defects a test inside Nexus would not have shown: data lost on exit, and a missing file. A
    third, which also affected Idearium, was fixed for both.
  - **Evidence:** `CHANGELOG-0.60.118.md`; `products/flight-recorder/`; `tests/modules/test-flight-recorder-standalone.test.js`
    FS-01..06.

- **2026-10-17: "Next and Merge."** (FR3: undo any change, keeping later edits)
  - **Context:** the product's promise is undo. The existing revert could only undo the newest change, because any later
    edit to the file blocked it.
  - **What it shows:** finishing the promise at its hard edge. Undoing an older change while keeping newer work is
    what makes the undo usable. Where it cannot be done safely (two changes on the same lines), the system refuses and
    names the lines instead of guessing.
  - **Evidence:** `CHANGELOG-0.60.117.md`; `versionium/lib/merge3.js`; `tests/modules/test-undo-any-change.test.js`
    UN-01..06 (UN-02 is the phasemap's proof).

- **2026-10-17: "Okay so where is the product being made? Or are we building the capability first, then branching?"** · then: "I agree, with the recommendation"
  - **Context:** two product phases had been built inside Nexus on the coder's assumption, and nobody had decided where
    the product lives.
  - **What it shows:** asking the structural question at the right time. His question surfaced an undecided architecture
    choice, and answering it honestly exposed a real defect: the branched copy was missing the very pieces just built.
    The choice he made (build in Nexus, branch at each release, with a boundary that checks itself) avoids maintaining
    two copies of the code.
  - **Evidence:** `docs/2026-10-16-repo-carve-phasemap.spec` (`decision_where_the_product_is_built`);
    `CHANGELOG-0.60.116.md`; `tests/modules/test-repo-carve.test.js` CV-13, CV-14.

- **2026-10-17: "merge. then next phase."** (FR2: tested before it lands)
  - **Context:** the product promise is that an agent's change is tested before it lands. Checking that promise against
    the code showed it held only for Nexus's own files.
  - **What it shows:** keeping the claim honest. Two gaps the system's own tests did not show were found by reading the
    code against the claim: other repos' changes were tested against Nexus, and staged batches were never tested. Both
    are closed, and a test now proves the subtle case: a change that looks broken file by file but is correct as a batch.
  - **Evidence:** `CHANGELOG-0.60.115.md`; `tests/modules/test-tested-before-lands.test.js` TB-01..05.

- **2026-10-16: "next"** (FR1, the flight recorder's first piece)
  - **Context:** the coder proposed an order (FR1 one record per change, then tested before it lands, undo, standalone,
    the demo) and named FR1 as its pick. He said go.
  - **What it shows:** sequencing by dependency. The undo and the demo both read the record, so the record came first.
    It is a projection of data Nexus already writes, so no second store had to be built. The one piece that was missing
    (which task wrote a change) was fixed at the source, not guessed after the fact.
  - **Evidence:** `CHANGELOG-0.60.114.md`; `lib/change-record.js`; `tests/modules/test-change-record.test.js` CR-01..06.

- **2026-10-16: "expand it."** (the flight recorder, just branched out of Nexus)
  - **Context:** he had a 217-file copy of the product and a claim that it was tangled into the rest of Nexus.
  - **What it shows:** pushing past "it's copied" to "does it work alone". The answer is now measured, not guessed:
    168 files, 8 systems, and every one of its own files loads in an empty folder. The first attempt failed that check,
    on a data folder no require mentions; the check is why it was found.
  - **Evidence:** `CHANGELOG-0.60.113.md`; `docs/2026-10-16-repo-carve-phasemap.spec` (CV2, FR1-FR5);
    `tests/modules/test-repo-carve.test.js` CV-09..12.

- **2026-10-16: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?"** · then: "can you branch it into a idearium repo?"
  - **Context:** months of separate systems (a version store, a causal toolkit, ledgers, a VM test environment). He
    looked across them and asked whether together they are something people would pay for.
  - **What it shows:** product thinking. He saw that pieces built to run his own system add up to one thing others
    need: trust in what AI coding agents change, plus a way to undo it. Then he asked for it as its own project, not a
    rewrite. The carve that followed measured, rather than guessed, how far it is from standing alone: 217 files,
    15 systems.
  - **Evidence:** `CHANGELOG-0.60.112.md`; `docs/2026-10-16-repo-carve-phasemap.spec`;
    `tests/modules/test-repo-carve.test.js` CV-01..08.

- **2026-10-16: "please fix this. the naming in github doesn't even match that..."**
  - **Context:** COS refused his GitHub downloads ("Nexus-main", "Nexus v0.60.110") because their folder names were
    not `<project>-<version>`. A fix for that was already on main (0.60.103), yet his COS still refused them.
  - **What it shows:** testing the real artifact rather than the source. He used the exe, not the code, and that
    exposed a delivery gap. The COS exe never rebuilt after 0.1.0, so a merged fix had not reached him. The workflow
    now fails when the exe's files change without a version bump.
  - **Evidence:** `CHANGELOG-0.60.111.md`; `tests/modules/test-cos-app-store.test.js` CA-15;
    `tests/modules/test-cos-app-build.test.js` BD-06; cos-app run 38891061643 (cos-v0.1.0 built at 0.60.96).

- **2026-10-14: "and we have intent routing? that way the complex reasoning can be done by the bigger models or agents. like claude or deepseek? also multiaccount routing in clearglass, each tab can be a different profile?"** · then: "yes we need to get it all working."
  - **Context:** he was checking that two pieces he had asked for earlier actually worked end to end. They half did:
    - Intent routing existed (0.60.8), but it only ordered agents by preference, so a high-scoring agent could still be sent work it can't do.
    - Account routing existed (0.60.25), but on one tab per provider, so accounts took turns.
  - **What it shows:** systems thinking. His question tied routing ("who should answer") to capacity ("who can answer at once"), and both had to be finished for the pipeline to scale. Earlier he wrote PF1's design himself ("each tab can beb a compartment or different profile"). Grounding that design found three defects that would have broken any second tab:
    - a new tab took over every job of its provider;
    - the provider's status showed whichever tab connected last;
    - one tab's disconnect requeued every tab's jobs.
  - **Evidence:**
    - `tests/modules/test-route-eligibility.test.js` 8/8 (RT1). An agent without the browser tool is never routed browser work, even with 12 successes and even when preferred.
    - `tests/modules/test-profile-tabs.test.js` 7/7 (PF1), a real NCP server with live tabs. Two hats answer from two accounts in two tabs at the same time, and a job for hat A never lands in hat B's tab.
    - `CHANGELOG-0.60.31.md`, `CHANGELOG-0.60.32.md`.
    - Not yet run on his machine.

- **2026-10-14: "Build GT1 here (Recommended)"** (his choice of the map's first priority)
  - **Context:** the map he directed ranks GT1 first: "0.60.18 showed that learning from unclassified failures poisons routing."
  - **What it shows:** prioritising the foundation every later build runs through over the next visible feature.
  - **Evidence:** `tests/modules/test-contract-adapters.test.js` GT-01..07. A planted failure of each type takes its own path, and only capability and context failures change routing or size limits. `CHANGELOG-0.60.30.md`.
- **2026-10-13: "Do this task here: 'Build one Nexus phase to proven on this PC'" · "ask me for it again."**
  - **Context:** after a day of fixes that had only run in tests, he asked for a real build. When the coder's first try
    to use the Claude Code CLI as the agent was interrupted, he asked to be asked properly. Offered "test then build"
    with the cost stated, he chose it.
  - **What it shows:** he holds the work to proof, not to claims. Insisting on consent before an action that spends his
    account's usage is the same judgment. The result is the first phase build ever to reach `proven` with a real agent.
  - **Evidence:** phase NT1_notes, built in 50 seconds.
    - A real Versionium snapshot came first (vtm-82eaa81b).
    - Claude Code proposed `lib/notes.js` and `tests/notes.test.js`.
    - The proof ran `node tests/notes.test.js` against the proposals: exit 0, 1 of 1 condition met.
    - Recorded in the LIVE RUN note of `docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec`.

    It ran on the cloud copy, not on his PC.

- **2026-10-13: "can we work on inventing anything that will get this pipeline going. like why doesn't this work yet?"**
  - **Context:** after a day of fixes, he stopped asking for features and asked why the pipeline still failed. The
    coder read every run he had pasted: the agents answered (38 ChatGPT and 16 Gemini jobs completed), but each run
    started without knowing its parts were ready, and fell back to its hardest mode when the planner failed. The coder
    proposed two fixes, "ready before run" and "a plan without a model", and recommended doing them in that order. He
    chose "A then B (Recommended)".
  - **What it shows:** asking the root-cause question instead of adding features is the judgment. Both fixes come from
    his own rule, written down the same day: "deterministic first … a reasoning agent only plans". The pipeline had been
    breaking that rule. The diagnosis and the design are the coder's; the question and the rule are his.
  - **Evidence:** `tests/modules/test-contract-phase-build.test.js` runs on the real build route with only the model
    stubbed:
    - CP-07: with the planner behind a sign-in wall, the phase is planned without a model, built one file per request,
      and passes its proof;
    - CP-08: with no agent ready, nothing is sent, and the run says what to fix.

    Also `tests/modules/test-run-ready.test.js` 10/10 and `CHANGELOG-0.60.28.md`. Not yet run on his machine.

- **2026-10-13: "the scheduler must distinguish a failed task from a task that has no available executor. The latter should be reported as blocked or unsupported, not repeatedly retried or incorrectly marked complete."**
  - **Context:** he approved the agent and phase adapters and set the order: build and test them on their own first, then connect the Build action. He named one failure mode before any code existed.
  - **What it shows:** failure-mode thinking and specification. The distinction he named is the one a naive scheduler gets wrong: it loops on work nothing can run, or reports it done. His order (adapters alone, then integration) is why the end-to-end test could find the next defect, a learned size limit poisoned by one provider error, and point at the right module.
  - **Evidence:** `tests/modules/test-contract-adapters.test.js` (EA-03: blocked, not retried, not FAILED, not complete), `tests/modules/test-contract-phase-build.test.js` (CP-01 to CP-05 on the real route), `CHANGELOG-0.60.18.md`.

- **2026-10-13: "the logins for the agent providers needs to be all the same. the accounts and sign in, isn't wired into the provider tabs in clearglass."**
  - **Context:** he looked at two Clear Glass screens that each said something different about the same login, and named the cause: one screen was not wired to the other.
  - **What it shows:** he reads a system from its screens and finds the integration gap, not just the symptom. The screenshots pointed at the right seam.
  - **Evidence:** `clear-glass/src/providers/account-switch.js` (`sync`), `clear-glass/test/provider-account-sync.test.js`, `CHANGELOG-0.60.12.md`. Not yet confirmed live.

- **2026-10-13: "can you add history import tool to the repos. like maybe with versionium. i want real versions…"**
  - **Context:** imported projects kept only their latest files. Their `.git` was dropped at import, and there was no
    way to see or compare their past.
  - **What it shows:** he identified the most valuable thing an import was throwing away, the project's history.
  - **Evidence:** `lib/repo-history.js`, `tests/modules/test-repo-history.test.js`, `CHANGELOG-0.60.7.md`.
- **2026-10-13: "remember not just the components. importing them as repositories, so i can continue, expand, fix,
  manage, and test them."**
  - **Context:** the decompose tool (0.60.5) turned projects into components, and he named the larger goal.
  - **What it shows:** he keeps the end state in view: a project you can keep working on, not a parts bin.
  - **Evidence:** phases PL0–PL6 in `docs/2026-10-13-projects-raid-and-gates-phasemap.spec`.
- **2026-10-15: "i want idearium to have releases and a changelog for each version. it was added to the wrong place."**
  - **Context:** releases existed only in Nexus's own `lib/version.js` and as GitHub tags. Versionium is the system
    built to hold versions, yet it had no idea what a release was, and Idearium repos had none.
  - **What it shows:** he spotted an ownership error, a capability living in the wrong system. That is systems-design
    judgment: put each thing where the data it describes already lives.
  - **Evidence:**
    - `versionium/lib/releases.js` and `lib/nexus-releases.js`;
    - `tests/modules/test-releases.test.js` (5/5);
    - `CHANGELOG-0.60.41.md`;
    - 250 Nexus releases are now recorded in Versionium, 210 of them with his words.

- **2026-10-15: "i feel lime also needs to use the gates to maintain persistence using the memory. so we can use nexus for
  the workload, instead of relying on the agents to remember."**
  - **Context:** a build agent lost its task mid-run and asked the person what to do. The usual fix would be a better
    prompt; he asked for the opposite, that the workload be held by the system.
  - **What it shows:** he moved state out of the part that forgets (the model) into the part that persists. That is
    systems-design judgment about where state belongs.
  - **Evidence:** `lib/run-state.js`, `lib/step-gates/reply.on_task.step_gate`,
    `tests/modules/test-run-state.test.js` (27/27), `CHANGELOG-0.60.50.md`. Not yet confirmed live.

- **2026-10-15: "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a fact?"**
  - **Context:** he wanted a record of his work that builds up over time and slots into a gig. The easy version
    logs what agents say about themselves. He asked for the version a stranger can check.
  - **What it shows:** he put the standard where it belongs, on verification, not volume. A claim that cannot point at
    evidence never reaches a buyer. That is the same rule he set for this very document ("nothing here is claimed
    without a pointer to evidence"), applied to a machine.
  - **Evidence:** `lib/gig-ledger.js` (a claim holds only while its commit, file, test or count checks out),
    `tests/modules/test-gig-ledger.test.js` (10/10, including an overstated count that fails and a made-up commit that
    fails), `CHANGELOG-0.60.53.md`.

- **2026-10-15: "see? why the repitition?" (three Settings sections listing the same providers)**
  - **Context:** he sent screenshots of Accounts & sign-in, Provider tabs and Agent mesh. Each listed the same
    providers with the same account counts and links to each other.
  - **What it shows:** he reads a system from its screens and sees duplicated state as a design fault. The screens
    also disagreed ("dispatch uses the oldest account" against "no default"), which is the real cost of repetition.
  - **Evidence:** the three are now one section, `clear-glass/renderer/settings/sections/accounts.js`;
    `clear-glass/test/settings-merge.test.js` and `settings-merge-render.test.js` (jsdom); `CHANGELOG-0.60.54.md`. Not yet
    seen in Electron.

- **2026-10-15: "i dont [want] anything missed. then it only logs the chaturl once unless it has new data, maybe check the previous chat url once, but use it as an edge for a stopping point for catching up."**
  - **Context:** he was specifying a background reader for his own chats. The coder proposed a timer; he described the
    completeness and stopping rules instead.
  - **What it shows:** specification by invariant: complete (nothing missed), idempotent (a chat is logged once unless it
    has new data), and a defined stopping edge. The stopping edge is what makes catching up cheap.
  - **Evidence:** `lib/chat-crawl-plan.js`, `tests/modules/test-chat-crawl-plan.test.js` (18/18: backfill is done only when
    the list is fully loaded and no chat is pending or failed; an unchanged chat is never revisited; the walk stops at the
    edge and re-checks it once; a restart resumes), `lib/chat-crawl-settings.js` (39 settings), `CHANGELOG-0.60.55.md`.
    The part that drives a real tab is not built.
- **2026-10-15: "bricks keep failing."**
  - **Context:** he pasted his full run log instead of a guess at the cause. In it, every RAID officiator drop failed
    with `forAgent=ollama` while Guardian was completing jobs for three other agents in the same minutes.
  - **What it shows:** reporting a failure with its raw evidence is what made a one-file root cause findable: the log
    itself showed Guardian was up, so "guardian unreachable" was the wrong lead.
  - **Evidence:** `tests/modules/test-lifeline-ollama-dispatch.test.js` (3/3, 3 fail on the old code); `CHANGELOG-0.60.62.md`.
- **2026-10-15: "make sure all of the files and dependancies are mapped. and i want the specs to tagged per phase"**
  - **Context:** a new phasemap (WARP for every build, the spec framework) showed up in Idearium with its systems
    guessed from prose and no files. He asked for the files, the dependencies and the owning specs on every phase
    before anything is built.
  - **What it shows:** traceability as a requirement: every phase answers "what does it touch, what does it wait on,
    which contract owns it" before code is written. That is the discipline of specification-led engineering.
  - **Evidence:** `tests/modules/test-phase-specs-tag.test.js` (4/4, all fail on the old reader); `CHANGELOG-0.60.63.md`.
- **2026-10-15: "It doesn't know how to map. Nexus needs to generate dependancies for each phase, with files."**
  - **Context:** agents kept spending tool calls finding the context for each phase, and the existing mapper asked a
    model for every phase. He named the cause, not the symptom: the system itself should know each phase's files and
    dependencies, for every project, automatically.
  - **What it shows:** he pushed work from the most expensive layer (a model) to the cheapest that can do it (code
    reading evidence already in the text). Measured: open phases with no file evidence fell from 462 to 198 with no model.
  - **Evidence:** `tests/modules/test-phase-map-auto.test.js` (8/8); `lib/phase-map-auto.js`; `CHANGELOG-0.60.65.md`.
- **2026-10-15: "need to inject a framework for generating a .spec file. then need to listen for it to collect it."**
  - **Context:** agents wrote specs in whatever shape they liked, and nothing noticed when one arrived.
  - **What it shows:** a closed loop designed in one sentence: teach the format (the framework, only when the request
    is for a spec), hold every write to it (the gate), and collect what passes, traced to the phase that asked.
    That is contract-first systems design: the spec compiler's own format becomes the contract between agent and system.
  - **Evidence:** `tests/modules/test-spec-pipeline.test.js` (7/7, 5 fail on the old code); `lib/spec-collect.js`;
    `CHANGELOG-0.60.66.md`.
- **2026-10-15: "Use the templates. The genesis by default."**
  - **Context:** the spec pipeline compiled an agent's spec into a generic TypeScript package. Nexus already had its own
    system template (genesis, the nexus-system skeleton) and the machinery to slot components into it.
  - **What it shows:** consistency of architecture. He kept every new system on the one shape Nexus systems share,
    instead of accepting a second, foreign one. "nexus is recursive, builds itself, using itself. the same architecture
    on every level" (his words, genesis 1.4.0) is what this decision enforces.
  - **Evidence:** `tests/modules/test-spec-pipeline.test.js` SP-08..08c; `CHANGELOG-0.60.68.md`.
- **2026-10-16: "alright." (choosing SP2 before the gap sweep)**
  - **Context:** two of his runs failed the same way: a provider changed its markup and the saved CSS selectors
    stopped matching (Claude's reply not found), or a pick saved the wrong element (ChatGPT's placeholder as the send
    button). He had already asked for a semantic tree for Clear Glass's agent; SP2 puts it under the provider fields.
  - **What it shows:** ordering by what broke in real use. He took the fix for the failure his own log showed before
    the bookkeeping sweep, and the address he asked for now answers both failures: class churn (found by role and name)
    and wrong picks (refused by role).
  - **Evidence:** `tests/modules/test-semantic-field-map.test.js` (5/5); `CHANGELOG-0.60.70.md`.
- **2026-10-16: "its needs to use the guardian picker so i can traverse through the elements one at a time."**
  - **Context:** the provider panel's picks took whatever was under the cursor. On chat pages that is often the wrong
    layer (the placeholder inside the input, the icon inside the button); his own run once saved a placeholder as the
    send button. Nexus already had a picker with traversal, used elsewhere.
  - **What it shows:** reuse over rebuild, and judging a tool by use. He saw the problem was the interaction, not the
    checks, and pointed at the component that already solved it. The panel now uses that picker; nothing was rewritten.
  - **Evidence:** `tests/modules/test-guardian-field-pick.test.js` (5/5); `CHANGELOG-0.60.71.md`.
- **2026-10-16: "i want a changelog for each change or diff. i want it all syncd with git, versionium, the zip."**
  - **Context:** three sessions were building at once; release numbers collided and were renumbered at merges, and
    half of the commits (maps, addenda) had no changelog. He asked for one record that git, Versionium and the zip agree on.
  - **What it shows:** auditability as a requirement. Asking for every diff to be accounted for is what exposed real
    bookkeeping bugs: a release pinned to another session's commit, three releases pinned to nothing, notes never read.
  - **Evidence:** `tests/modules/test-release-notes.test.js` (6/6); a live sync in the coder's container recorded 280
    releases, 208 with their commits; `CHANGES.md`; `CHANGELOG-0.60.72.md`.

- **2026-10-16: "Option 1 (my recommendation): wrap each of those agent calls in WARP ... while the build ladder and RAID still choose which agent runs."**
  - **Context:** a census (CK-255) found 5 build paths calling their agent directly, bypassing WARP. He was offered two
    designs: wrap each call in WARP while RAID still chooses (option 1, the coder's recommendation), or hand agent choice
    to WARP's own cascade (option 2). He took option 1.
  - **What it shows:** keeping one authority per decision. Option 2 would have given the system a second router beside
    RAID; option 1 adds WARP's cache and gates without moving who decides. Building it surfaced the limit of caching an
    agentic build (its work is the files it writes, not its reply), which is why those paths retain but never replay.
  - **Evidence:** `tests/modules/test-warp-rung.test.js` (7/7); `lib/build-paths.js` census: 0 bypasses (was 5),
    CK-255 green; `CHANGELOG-0.60.73.md`.
- **2026-10-16: "all the ones to help me make money, need to be done. heklp wirth overwhekm need to be done. that get the pipeline working need to e done. cos as a working test env need to be done."**
  - **Context:** after a survey of 1,472 phases (872 open), maps that restated each other, and three sessions building
    at once. He named the four outcomes that matter, and that the pipeline (intent, routing, chunking, gating) is vital.
  - **What it shows:** prioritising by outcome rather than by feature. Four outcomes turned an open-ended backlog into
    one ordered list of existing phases, with nothing new mapped. The first item, an overview of his own projects, was
    built the same day. Building it surfaced a silent route collision, now guarded by a test.
  - **Evidence:** `docs/2026-10-15-pipeline-focus-phasemap.spec` (addendum 2026-10-16); `tests/modules/test-projects-overview.test.js` (6/6); `CHANGELOG-0.60.74.md`.
- **2026-10-16: "Yes. It’s analysis. The bricks." · "A brick is a chunk. Like analysis."**
  - **Context:** asked whether a gate's unit of work is the brick. The coder offered two readings of "It's analysis";
    he answered with neither, defining the term instead: a brick is a chunk, the part analysis breaks a whole into.
  - **What it shows:** precise vocabulary as architecture. One word for one unit let three features land on the same
    key the same day: the trace per brick (0.60.75), the context budget per brick (0.60.76), and the run that follows
    the brick across agents and chats (0.60.77). Correcting the coder's reading instead of accepting it kept the record
    his.
  - **Evidence:** `docs/2026-10-15-gate-held-work-phasemap.spec` addenda (d) and (f); `tests/modules/test-run-state.test.js`
    RS-50..55; `CHANGELOG-0.60.77.md`.
- **2026-10-16: "can we not have it chunk everytime it restarts. it needs to persist. all data  is meant to persist. hardcoded has to earn its place..."**
  - **Context:** after a spec's 17 chunks were lost when Clear Glass closed. The coder had mapped a timeline and asked
    which path lost them; he named the symptom precisely instead: it re-chunks on every restart.
  - **What it shows:** failure-mode reading from behaviour. The symptom led straight to the root cause: the plan was
    re-made at every build start, a fresh plan has a fresh hash, and the hash check archived every passed brick. The
    checkpoints were already persisted; the one thing not reused was the plan. A one-function fix on the contract file,
    proven by a test where a restart makes no agent call at all.
  - **Evidence:** `CHANGELOG-0.60.79.md`; `tests/modules/test-contract-phase-build.test.js` CP-03b;
    `cortex/core/raid/contract-adapters.js` `savedPlan`.
- **2026-10-15 / 2026-10-16: "if theyre is going to be 2, i feel like code should only be whats being coded, that or consolidate them into one" · "yes one tab." · "the file and code tab merge."**
  - **Context:** Idearium had two views of one repo's files: the Files tab (tree, editor, Manage, version history) and
    the Code tab (tree, chunks, diffs, the agent). He named both ways out himself: a strict split, or one tab. The
    coder recommended one tab. He chose it, then asked for every remaining phase of the map.
  - **What it shows:** spotting duplicated state in a product and removing it, not decorating it. Two trees of the
    same repo would drift. One tab kept every capability of both (filter, add, delete, edit, Manage, history). Every
    old link still lands, through one redirect, and nothing was deleted.
  - **Evidence:** `tests/modules/test-code-tab-merge.test.js` (7/7, six driven in Clear Glass);
    `docs/2026-10-15-code-tab-run-state-phasemap.spec` addenda (b) and (c); `CHANGELOG-0.60.81.md`,
    `CHANGELOG-0.60.82.md`.
- **2026-10-16: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk."**
  - **Context:** the pipeline had all four pieces, but only phase builds used them, and not in that order. A request
    from the Agent tab, copilot or RAID's officiator went straight to an agent.
  - **What it shows:** systems design by invariant. He fixed the order of operations for every agent, not for one
    feature. It is the same rule the project holds its own coder to (map before build), applied to the machine. He also
    corrected the record when his metaphor ("brick") risked becoming a second node type ("When I said brick I was using
    a metaphor").
  - **Evidence:** `lib/work-funnel.js`; `tests/modules/test-work-funnel.test.js` (8/8); `docs/2026-10-16-agent-work-funnel-phasemap.spec`; `CHANGELOG-0.60.94.md`.
- **2026-10-16: "what about using cos for the canvas, then each tool a nested compartment?"**
  - **Context:** he had just had ERAVOS deleted from Nexus. He sent the standalone ERAVOS and proposed bringing its
    design back as COS structure rather than as a running system: the canvas as one compartment, each tool nested
    under it.
  - **What it shows:** design that composes. His ERAVOS kept "the canvas and the tools … separate", with each tool a
    sealed folder with declared ports and permissions. That boundary is why it maps onto COS nesting with no rewrite
    of his code: his canvas ships byte for byte, his own loader generator and validator run unchanged on a canvas
    Nexus made, and his own harness passes the tools.
  - **Evidence:** `tests/modules/test-canvas-compartments.test.js` (7/7; CC-10 drives it in Clear Glass: 12/12 on his
    harness); `docs/2026-10-16-canvas-compartments-phasemap.spec`; `CHANGELOG-0.60.104.md`.
- **2026-10-16: "when i reject a propasal, the agent needs to understand the failure mode ad try again, after learning" · "why so much regression?"**
  - **Context:** his Code tab showed three agent proposals for one phase, each deleting more than it added (-114 +24,
    -281 +20, -54 +31). He rejected them and asked for the loop to close: understand, learn, retry.
  - **What it shows:** failure-mode thinking. He named the right unit, the failure mode, rather than "retry harder". The
    question "why so much regression?" pointed at the cause, an agent returning a cut-down whole file, and that cause is
    now refused before it reaches him.
  - **Evidence:** `tests/modules/test-reject-learn-retry.test.js` (7/7, including his intent-hat-router and
    schema.intent shapes); `docs/2026-10-16-reject-learn-retry-phasemap.spec`; `CHANGELOG-0.60.105.md`.
- **2026-10-16: "need this fixed. completely" (Google: "Couldn't sign you in")**
  - **Context:** Google refused sign-in inside Clear Glass, his own browser, which every provider account runs through.
    He stopped other work for it.
  - **What it shows:** setting priority by what blocks the system. Every agent that runs through a Google account
    depends on this one window. The fix went to the cause (client hints and `userAgentData`, which the UA scrub had
    missed), not a workaround. On the way it found a second silent bug: request-header hooks replacing each other.
  - **Evidence:** `clear-glass/test/google-signin.test.js` (32 checks); `docs/2026-10-16-google-signin-phasemap.spec`;
    `CHANGELOG-0.60.106.md`. Not yet proven live: his next sign-in is the test.
- **2026-10-16: "fix it. i don't want the trouble again" (Clear Glass's TLS layer)**
  - **Context:** asked what fixing the broken TLS proxy would do, he heard the trade-offs: a helper binary, a local CA,
    and what it buys (Firefox personas that are Firefox down to the handshake). The coder recommended archiving it. He
    chose the real fix, and set its standard: no trouble again.
  - **What it shows:** owning a decision against the recommendation, and stating the requirement that matters: it must
    work, and it must never be why something breaks. That requirement is in the code: a fallback at every layer, never
    an orphan, verified certificates.
  - **Evidence:** `clear-glass/tls-helper/main_test.go` (5/5); `tests/modules/test-tls-layer.test.js` (7/7, the real
    binary); `docs/2026-10-16-tls-layer-phasemap.spec`; `CHANGELOG-0.60.109.md`.

- **2026-10-16: "can you do the code tab changes?"** (with a screenshot)
  - **Context:** he reviewed the agent's work in the Code tab instead of trusting the green status. The screenshot showed
    a run marked contract-complete whose only file was a placeholder.
  - **What it shows:** reviewing evidence over status. A gate that checked names but not substance was found from one look
    at a diff, and is now closed at the one door every proposal passes.
  - **Evidence:** `CHANGELOG-0.60.110.md`; `tests/modules/test-inject-screen.test.js` IS-10..14.
- **2026-10-17: "i want the panels completely seperate from each other, collapasable, organized and updated in real time ... i want to eb able to open all of them, or none of them."**
  - **Context:** he was looking at the Code tab and the Plan panel's three cards. Instead of asking for more features, he
    specified the interaction model: separate panels, each with its own edge tab, any number open, live, plus replayable
    procedures.
  - **What it shows:** interface design by composition. Five panels that each reuse an existing renderer, one rail, and
    one rule for real time (only open panels reload, on their own events). The replayable procedures turn ad-hoc tool
    calls into reusable, persisted recipes.
  - **Evidence:** `CHANGELOG-0.60.118.md`; `tests/modules/test-code-dock.test.js` (driven in Clear Glass);
    `lib/repo-procedures.js`.
- **2026-10-17: "Need nexus to hold as much of the complexity as possible, and let the right agent for the job, be in charge."**
  - **Context:** after his mentor's review ("too personal, too big", the ideas solid). He dropped an idea he did not
    understand (stateless pieces) and kept the rule he could judge.
  - **What it shows:** taking criticism and narrowing scope. He did not defend the idea he couldn't explain; he kept a rule
    he can check against results. The first slice of that rule is built: each brick goes to the agent with the best record
    on that kind of file.
  - **Evidence:** `CHANGELOG-0.60.119.md`; `tests/modules/test-agent-record.test.js` RA-01..05.
- **2026-10-17: "each chunk/dependancy a piece of the progress indication. progress shows for each task with a full run history, and log to make it explicit. like the panels should remain interconnected. so strip the context from the plan panel since we have a dedicated one now."**
  - **Context:** the Plan panel's bar showed six pipeline gates, the same for every phase. The Context card was drawn
    twice, once in the Plan panel and once in the dock. He sent a sketch of the panel he wanted and asked for the panels
    to work together, not side by side.
  - **What it shows:**
    - Progress measured in the units the work is actually made of: one segment per planned file, with its attempts,
      its agent and what it depends on.
    - Removing a duplicate instead of adding a feature.
    - Asking for the panels to be connected is what exposed a real defect. The Plan panel sat on top of the dock, so a
      click in one opened something unreachable behind it.
  - **Evidence:** `CHANGELOG-0.60.123.md`; `tests/modules/test-plan-pieces.test.js` PP-01..04. PP-03 fails if the Plan
    panel overlaps the dock column, and it found the overlap.
- **2026-10-17: three screenshots and a full boot log, no words.**
  - **Context:** after merging 0.60.123 he ran a fresh copy. Instead of describing what looked wrong, he sent the
    evidence: the screens as he saw them, and the whole log beside them.
  - **What it shows:** reporting a failure with complete evidence. The log let three root causes be found without a
    single guess:
    - the self-sync holding Idearium silent;
    - Guardian's flush loop into a sign-in page;
    - a Windows rename race.
    Each fix has a measured result.
  - **Evidence:** `CHANGELOG-0.60.124.md`; `tests/modules/test-sync-off-thread.test.js` SW-02 measures the event loop
    held 4,183 ms inline and 15 ms with the fix, on 447 files.
- **2026-10-17: "the drawbridge for each compartment for each system, the only way to interact between systems. using the api routes, and cli interface. ui floats ontop"**
  - **Context:** asked for the debugging systems (cfr, rfr2, sigma, friction, tension) to be wired. He then asked for the
    wiring itself to have one shape: each system's registry as its contract, its event bus and its handshake.
  - **What it shows:** a design held consistently over time. The same architecture is already written in the COS
    archetype, in his words (`cos/archetype/nexus-system/lib/handoff.js`: "each system hands the file off to the target
    system, using the registry and handshake verification…"). Asked about wiring months later, he arrived at it again
    without being shown it. The cost, said: no existing system was built that way, so 532 crossings between systems now
    have to be moved.
  - **Evidence:** `CHANGELOG-0.60.126.md`; `tests/modules/test-system-boundary.test.js` SB-01..08; the measured baseline
    `contracts/drawbridge-baseline.json`.
- **2026-10-17: "shadow and negative space reasoning for debugging. maybe every repo has to generate a component registry. the component registry can also be a dependancy graph?"**
  - **Context:** the drawbridge's first piece had just counted the crossings between systems. He asked for the registry to
    hold the contract, the bus, the queue, the dependencies, the wiring and the spine, and for debugging to read what is
    missing.
  - **What it shows:** a method of his own, reused across systems. He named shadow and negative-space reasoning on
    2026-09-29 for build steps (`lib/shadow.js`, 0.39.282). Applied to system boundaries, it found two real defects on its
    first run:
    - loom never read the registries of intelligence or versionium;
    - 27 declared routes are not served by their source.
    Asking whether the registry "can also be a dependancy graph" was the right question: the two halves, declared and
    observed, are what make the negative space computable.
  - **Evidence:** `CHANGELOG-0.60.127.md`; `tests/modules/test-drawbridge-registry.test.js` SR-01..08 (SR-06 is the loom fix).
- **2026-10-17: "use the axioms in the docs for each disicio nthat doesn't show my competence"**
  - **Context:** a day of building had produced a stack of technical questions for him, about whether `lib/` is a system,
    HTTP or in-process calls, and how to enforce a rule. Each one already had an answer in his own axioms.
  - **What it shows:** good delegation. He kept the calls that need his judgment (intent, direction, what his words mean)
    and gave the rest a method rather than a guess: the axioms he wrote, applied and cited. Nine open decisions were closed
    in one pass, each traceable to the sections that decide it. The phases blocked on them, IM2 and IM4, can now run.
  - **Evidence:** `docs/2026-10-17-decisions-by-the-axioms.spec` (D1-D9, each with its axioms); `CHANGELOG-0.60.135.md`;
    the rule in `docs/CLAUDE.md`.
- **2026-10-17: "diagnostic and nexus healer should be one system."**
  - **Context:** the census had just named nexus-healer the first sovereign system, and the coder was moving it into its own
    compartment.
  - **What it shows:** finding a boundary from what each part is for, rather than from how the folders are laid out. The
    healer proposes fixes for what diagnostic finds, and diagnostic already held the heal loop. The merge also exposed that
    the healer had never run: nothing started its port. As part of diagnostic, it runs.
  - **Evidence:** `CHANGELOG-0.60.136.md`. Diagnostic booted for real and served `/healer/proposals`.
- **2026-10-17: "needs to build a test first then use that to shape expectation and conditions."**
  - **Context:** a phase had just been built twelve times by five agents. The result was a file that did not load and
    still passed the old checks, because those checks only looked for the export names. He did not ask for a better
    reviewer. He asked for the test to come first, and to define what the code is held to.
  - **What it shows:** test-driven development, reached from the failure rather than from a textbook. Writing the test
    first, seeing it fail, and letting it define the interface is how TDD works. Having a different agent write it is how
    test independence works.
  - **Evidence:** `CHANGELOG-0.60.141.md`; `tests/modules/test-test-first.test.js` TF-03. On the real build route, the test
    asked for a function the plan lacked; the plan gained it, the coder built it, and the test proved the phase.
- **2026-10-17: "i want to see all agent responses in realtime"**
  - **Context:** an agent showed as writing for four minutes while every surface in the Code tab stayed empty. He asked
    for the agent's work to be visible where he works: the Changes view and the open file.
  - **What it shows:** treating observability as a requirement, not an extra. It surfaced a hidden failure. A model that
    thinks before it answers produced nothing the system could show, so a working agent looked identical to a stuck one.
  - **Evidence:** `CHANGELOG-0.60.142.md`; `tests/modules/test-live-everywhere.test.js` LV-02 runs Gemini's own streamer
    and shows the thinking reaching the stream before the reply; `tests/modules/test-agent-live.test.js` LS-05 shows it in
    the Code tab, in Clear Glass.
- **2026-10-17: "should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation to the job."**
  - **Context:** while asking for the debugging product to be specced, he asked whether every kind of record should share
    ids with the job that produced it.
  - **What it shows:** data-model thinking, aimed at the right seam. The code shows the cost of the gap he named.
    `lib/change-record.js` falls back to matching a change to its run "by path and time (said as matched, never as
    known)", because a change, a run and a phase do not carry each other's ids. Also, a chunk's id changes when its file
    moves.
  - **Evidence:** `docs/2026-10-17-debugging-product-phasemap.spec` `ids_and_the_job` (each id measured in the 0.60.142
    tree); decision D10 in `docs/2026-10-17-decisions-by-the-axioms.spec`. The answer kept his intent, links between
    every record and the job, but not one shared uuid, for the reasons recorded there.
- **2026-10-17: "once proven, email them and tell them i could save them money on repair costs"**
  - **Context:** asked what Flight Recorder is worth, he went straight to the buyer's question: what it saves. The coder read
    that as a demand for a measured number, so the next phase measures repair cost from what the runs already record. FR6
    (flight data) is the result.
  - **What it shows:** commercial judgment that sets the engineering order. The claim had to be checkable before it was
    made. It also shows debugging from a real log: his IM1 run, read whole, shows three agents failing the same way. That
    points at the brief, not the agents, and the code now says so on its own.
  - **Evidence:** `CHANGELOG-0.60.148.md`; `tests/modules/test-flight-data.test.js` (his IM1 run is the fixture: STUCK,
    7 of 7 calls wasted, 62 min); the same release fixed Flight Recorder's standalone command (0/6 → 6/6).
- **2026-10-17: "we need to add this all to nexus, there is boundaries mapping it"**
  - **Context:** asked to build the failure-mode report, he reminded the coder that Nexus has a boundary census. Checking it
    first showed that the coder's own release of an hour earlier (FR6) had added a crossing: kernel code reaching up into
    intelligence. The ratchet went from 540 to 541, and two boundary tests failed.
  - **What it shows:** architectural governance that holds. His rule (systems cross only by route, enforced by a ratchet)
    caught a real defect the coder had shipped, before anything was built on top of it.
  - **Evidence:** `CHANGELOG-0.60.150.md`; `tests/modules/test-system-boundary.test.js` SB-06/SB-08 (failing on 0.60.144,
    passing on 0.60.146); `tests/modules/test-flight-data.test.js` FD-09; `tests/modules/test-failure-modes.test.js` FM-07.
- **2026-10-18: "We need persistent data look at the last commit."**
  - **Context:** the release before had just made the agent's work visible live. He looked at what it had shipped and saw
    that live is not the same as kept.
  - **What it shows:** reviewing his own release for its failure mode rather than its feature. A stream that exists only
    in memory looks right until a reload, and then it is gone. This is the same class of loss as the 17 spec chunks a
    restart took on 2026-10-16. He named it from the commit before he had seen it happen there.
  - **Evidence:** `CHANGELOG-0.60.143.md`; `tests/modules/test-work-journal.test.js`. WJ-01 drops memory and reads the
    reply and thinking back byte-identical; WJ-03 shows it on a freshly opened page in Clear Glass.
- **2026-10-18: "You got it persistent per gate"**
  - **Context:** the release before kept every agent reply on disk, but per job. He pointed at the unit the work resumes at.
  - **What it shows:** knowing the unit of recovery. Since 0.60.77 a build resumes per gate, on whatever chat or agent is
    free, so a reply kept per job could not be found again where it was needed. Checking it also exposed a real defect:
    two gates building at once could file each other's replies.
  - **Evidence:** `CHANGELOG-0.60.144.md`; `tests/modules/test-work-journal.test.js` WJ-04 runs two attempts at one gate
    through the real router, then a restart, then two gates at once.
- **2026-10-18: "the gates need context ... reuse contracts, jobs and responses" · "its also in clearglass, cleardriver"**
  - **Context:** replies were kept per gate, but no gate used them. He named what a gate needs: its history as context, and
    reuse of the work already paid for, across restarts.
  - **What it shows:** two things.
    - **Treating paid-for work as an asset.** A reply that finished while the system was down is now adopted rather than
      bought again.
    - **Knowing his own system's map better than the coder that day.** He pointed out that Clear Glass already keeps the
      stream, which exposed a duplicate store the coder had built (0.60.143).
  - **Evidence:** `CHANGELOG-0.60.145.md`; `tests/modules/test-gate-context.test.js` GC-02 and GC-03, which reuse a finished
    and an in-flight reply from the real Responses index; the duplicate is named in the TL map, addendum (f), as TL2a-4.
- **2026-10-18: "okay only one record. maybe use it as a contract ledger for each contract."**
  - **Context:** a duplicate store had been found: two records of the same reply stream, one in Clear Glass and one in
    Idearium. The coder recommended making one an index into the other.
  - **What it shows:** single source of truth as a rule, not a preference. He also gave the remaining record a structural
    home, the contract, the same unit that holds the gates, checkpoints and plan, so a contract's work can be read back in
    one place.
  - **Evidence:** `CHANGELOG-0.60.146.md`; `tests/modules/test-work-journal.test.js` WJ-05. A reply linked to its chat
    ledger turn is never copied, and is read back from the chat ledger after a restart.
- **2026-10-18: "have a full section of for each of the 15 systems, each module and all the files … use all the changelogs"**
  - **Context:** he asked for the README to hold everything, built from the record rather than written from memory.
  - **What it shows:** documentation as a projection of the system, not a second copy of it. The inventory regenerates from
    the tree, the phasemaps and the release notes, so it cannot drift. Building it also exposed a defect: the atlas page
    resolved only its first 2,000 references.
  - **Evidence:** `CHANGELOG-0.60.153.md`; `tests/modules/test-readme-generate.test.js` (every file of the 15 systems is named,
    every phase is counted, and the README stays under 512 KiB); `tests/modules/test-nexus-atlas-refs.test.js` 49/49, where it
    had 4 failing before.

- **2026-10-18 — 0.60.154: he caught a ladder in a design that was meant to be associative.**
  - **His words:** "it needs to be non linear and agnostic" · "look at siso".
  - **Context:** the coder had mapped context-finding as six rungs in a fixed order, with every store named in code. He
    pointed back at his own foundation instead of at a patch.
  - **What it shows:** systems design, keeping one primitive across the whole stack. The fix needed nothing new. SISO's
    Event → Gate → Stream already gives:
    - fan-out by signature;
    - residue for what nothing answers;
    - order coming from cost, not sequence.
    Any store can join as a table row.
  - **Evidence:** `docs/2026-10-18-gate-memory-phasemap.spec` addendum (b); `CHANGELOG-0.60.154.md`; every phase graph ready,
    with no new crossing.

- **2026-10-18 — 0.60.155: "bottom up" applied to the record itself.**
  - **His words:** "look at all of the phases that mention gates" · "need to get them done bottom up. really need it all
    working."
  - **Context:** 75 open gate phases across 20 maps.
  - **What it shows:** failure-mode thinking. Checking the claims against the code, rather than trusting the status lines,
    found that the status record was wrong:
    - a scanner defect hid six built phases;
    - four phases were stale;
    - CHANGELOG hits under the same id came from other maps' phases.

    The same work turned out to be mapped many times over. The gate record was mapped four times, the rewind five times and the
    precommit gate four times.
  - **Evidence:** `docs/2026-10-18-gating-census-phasemap.spec`; test PM-INLINE; `CHANGELOG-0.60.155.md`.

- **2026-10-18 — 0.60.156: his call to "look at siso" became the design.**
  - **What was built:** context-finding as Event → Gate → Stream. Every source is asked at once, and what nothing answers is
    residue. A new store joins by adding one table row.
  - **Credit:** SISO is credited to Jonathan Bailey in `siso/spec/siso.spec`. The call to build this subsystem on it, unchanged,
    was James's.
  - **What it shows:** keeping one foundation across the whole stack, so a new part compounds on it rather than standing beside
    it.
  - **Evidence:** `tests/modules/test-context-stream.test.js`. Three arrival orders give one answer, and a fourth source joins
    with no line of the finder changed.

- **2026-10-18 — 0.60.158: "solid" taken as a claim to attack, not a status to report.**
  - **His words:** "Need to get the gates solid."
  - **Context:** the gate tests were mostly green.
  - **What it shows:** failure-mode thinking. Probing the gate machinery for ways a contract could read done when it is not found
    three false completes that no green test had caught. Two more conditions could never pass, and one input threw.
  - **Evidence:** `tests/modules/test-gates-solid.test.js` holds one case per hole. Each was demonstrated on the code before the
    fix.

- **2026-10-18 — 0.60.160: the missing UI step, found by his own eye.**
  - **His words:** "can you add snowflake to the ui. it doesn't show up as a plugin."
  - **Context:** the Tor-with-Snowflake transport had backend, routes and a CLI, but its UI step had never been built, so it was
    invisible in the app. He noticed the gap from the UI, which is exactly the order-of-delivery rule he set ("build the ui").
  - **What it shows:** his order of delivery catches exactly this — a capability that is real but unreachable because its last
    step was skipped. Naming it "not a plugin" was also right: it's a transport, and forcing it into the plugins list would have
    mixed two kinds of thing.
  - **Evidence:** `tests/modules/test-cg-network-ui.test.js` (driven in Clear Glass, against the real net service); `CHANGELOG-0.60.160.md`.

- **2026-10-19 — 0.60.161: he debugged his own product from a screenshot, and was right.**
  - **His words:** "need help with the autofill for fiverr." · "yes."
  - **Context:** he saw co-pilot answer "fill this in for me" with a chat reply instead of filling, and named it as an autofill
    problem. The code confirmed it exactly: the fill engine existed and worked, but co-pilot had no tool to reach it, so the
    request fell through to the model. His read of the symptom was precise.
  - **What it shows:** reading a failure to its cause from the surface. The fix was one tool wired to an engine that was already
    there, not a rebuild — the leverage he asks for.
  - **Evidence:** `tests/modules/test-cg-gig-autofill.test.js`; `CHANGELOG-0.60.161.md`; the map for the learn-loop he also asked
    for, `docs/2026-10-19-gig-autofill-and-learn-phasemap.spec`.

- **2026-10-19 — 0.60.162: he read a stall to the gate, and named the missing taxonomy.**
  - **His words:** "the red error in the second image." · "look at the node taxonomy at .spec" · "yes it should all be
    persistent."
  - **Context:** a build was stalling with a red DG2 error. The gate (his own rule, "each phase has to have a dependency graph")
    was correct; the fallback planner behind it wrote every phase with no files, so the graph could never be built — the plan
    "landed" but could not run. He also pointed straight at the real durability gap: the pipeline's units (phase, graph, gate)
    were not node types, so they did not survive a restart.
  - **What it shows:** two kinds of systems judgment at once. First, trusting the gate and looking past it to the plan — the
    failure was upstream of where it surfaced. Second, seeing that "make it persistent" is a taxonomy question, not a storage
    one: the fix was three new node types on the store that already existed, not a new store (reuse before build, §8.6).
  - **Evidence:** `tests/modules/test-pipeline-nodes.test.js` (PN 4/4); `CHANGELOG-0.60.162.md`; the addendum on
    `docs/2026-09-29-nex-node-store-phasemap.spec`.

- **2026-10-19 — 0.60.163 (MF1): he set the constraint that made the design correct.**
  - **His words:** "ollama first, but nexus should be learning… as long as local and free can handle it." · "do not add apis. i
    dont have money for that." · (hardware) "3700x 16gb of ram gtx 1650."
  - **Context:** the build was leaning on rate-limited browser agents and churning on out-of-memory local models. He named the
    real constraint — no paid APIs, a small local box — and the architecture principle: dumb components + a smart spine, so a small
    local model can carry the volume and guardian is reserved for reasoning.
  - **What it shows:** constraint-first systems thinking. The "no APIs, small box" limit isn't a compromise he settled for — it's
    what forces the right design (dynamic chunking + registry spine + model-fit so local is viable). He also corrected the coder's
    over-absolutism ("complex reasoning needs guardian") — tier-matching, not local-purism.
  - **Evidence:** `tests/modules/test-model-fit-ladder.test.js` (MF 5/5); `CHANGELOG-0.60.163.md`; the bottom-up foundation map
    `docs/2026-10-19-solid-build-foundation-phasemap.spec`.

- **2026-10-19 — 0.60.164 (CR1): his one-line architecture principle was the fix.**
  - **His words:** "the component registry is vital for each project becuase its the spine that makes components dumb."
  - **Context:** the coder had proposed splitting large files to fit local models (DC1). Mapping it showed the contract splitter
    can't chunk a single file (its children would overwrite the same path). James's principle pointed at the real lever: you make
    components small by decomposing against the registry spine, not by splitting files mid-build.
  - **What it shows:** a correct architecture intuition that redirected the build. The registry isn't bookkeeping — it's what
    lets a small free local model carry the work (dumb components), which is the whole local-first bet. The coder found the gap
    (contract builds never joined the store — looking-glass had no registry) and closed it by reuse.
  - **Evidence:** `tests/modules/test-project-registry.test.js` (CR 5/5); `CHANGELOG-0.60.164.md`; the bundle's missing
    `component.json`/graph; `lib/project-registry.js` wired into loom.

- **2026-10-19 — 0.60.165 (AB1): he was right that it doesn't resume, against the coder's first claim.**
  - **His words:** "fix the economy time out also like retries when the time runs out." · "i dont think it resumes."
  - **Context:** the coder had earlier told him a rate-limited phase "resumes once a slot frees." Checked against the code, it
    does not — a hold over 30 s is cancelled, the ladder exhausts, and the phase goes terminal with no retry path and no setting.
    His instinct corrected a wrong claim.
  - **What it shows:** trusting his own read of the system over the coder's reassurance — exactly the "failure modes are
    first-priority data" discipline. The fix reused the existing retry machine rather than adding a scheduler, and its safety
    (never auto-retry a real failure) is the part that got the test.
  - **Evidence:** `tests/modules/test-economy-resume.test.js` (AB 5/5); `CHANGELOG-0.60.165.md`.

- **2026-10-19 — 0.60.166 (CT1): his "cos to work for test env" was reuse, not a build.**
  - **His words:** "then we need cos to work for test env." · "do not add apis."
  - **Context:** COS already had a real isolated runner (process sandbox + an optional VM), but it was wired only to the manual
    Run menu — the automated gate ran tests on the host. The direction named the exact missing wire.
  - **What it shows:** knowing the system already had the capability and asking for it to be connected, not rebuilt — "use what
    you already have." The coder also stated the honest limit (no KVM here → process isolation, not a VM) rather than overclaiming.
  - **Evidence:** `tests/modules/test-cos-run-target.test.js` (CT 5/5, real sandbox runs incl. a clean-env leak check); `CHANGELOG-0.60.166.md`.

### 2026-10-19 — 0.60.170: "we need to fix the pipeline though. like i said."
- **Context.** His boot log for the day: orchestrator and Guardian restarting on a file-watcher error, idearium silent for ~100 s
  at each boot, node writes failing, and agent replies landing as files named "Gemini said tests/…". He asked for the pipeline to
  be fixed before new features, and named the target: "files names must remain consistent."
- **The call, his:** fix the foundation first. **The coder's part:** finding the four causes in the code and the fixes.
- **Checkable:** `tests/modules/test-pipeline-root-causes.test.js` 6/6; a 12,000-node rescan measured 10.2 s before and 0.95 s
  after on the same machine (CHANGELOG-0.60.170.md). Not yet confirmed on his Windows machine.
- **Skill shown:** reading a production log for causes rather than symptoms, and ordering work foundation-first.

### 2026-10-19 — 0.60.171: verify first; the agent briefed the way it asked
- **His idea:** "agents to check previous chunks as is and only change if they don't match conditions", then "prioritize gemini … specify the axioms … i want gemini to code at his best" — he asked Gemini itself what it needs and handed its answer over as the spec for the brief.
- **Coder's part:** the check (lib/verify-first.js), the five-part brief (lib/coder-brief.js), the self-model store (lib/agent-self-model.js).
- **Checkable:** tests/modules/test-verify-first.test.js 10/10; CHANGELOG-0.60.171.md.
- **Skill shown:** treating the AI agent as a component with a contract — asking it what it needs, recording that as data, and checking its work with no model in the loop.


### 2026-10-19 — 0.60.173: an upload that asks before it writes
- **His words:** "upload zip with an intent, have it map to nexus using a tool, then ask me with the option to edit the location
  and where they go in relation to the system or the registry. like i want to try to make something that can do what you can".
- **Context:** Idearium could only turn a zip into a NEW repo. He asked for the step a careful engineer takes with a handed-over
  zip (read it, decide where each file belongs and what it touches, then confirm) to become a tool his system runs, with him as
  the one who confirms.
- **What it shows:** product judgment about trust. The tool proposes, he decides, and only his answer writes. His corrections
  become rules, so the tool improves from his decisions, not a model's.
- **Checkable:** `tests/modules/test-upload-placement.test.js` 4/4 (the router writes nothing until answered; his moved file is
  placed by his rule on the next upload); `CHANGELOG-0.60.173.md`.

### 2026-10-19 — 0.60.174: the page as a map that learns
- **His words:** "parse the dom, index each element as blocks, then download into a index to chunk, then synthesize a fucking map
  in relation to the weboage to use as a map or reference point for inputs from the cli or the intent. learns over time."
- **Context:** Clear Glass could already see what was actionable (the semantic tree) and where it was (the interaction field), but
  every visit started from nothing and the page's content was invisible to the agent. He specified the pipeline in order: blocks,
  index, chunks, a synthesized map, a reference for intent, and learning.
- **What it shows:** systems design. His ordered pipeline maps one-to-one onto the modules built (blocks.js → page-map.js →
  page-memory.js), and it reuses the address scheme the agent already acts by, so nothing new had to be trusted.
- **Checkable:** `tests/modules/clear-glass-page-map.test.js` 6/6, including a real layout run in Clear Glass's engine.

### 2026-10-19 — 0.60.175: one capability through every door, and Ollama feeling the page
- **His words:** "hooking ollama in to feel with "nexus nerve", see with the interaction field and scrips injected into each page."
  · "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,, web scraper."
- **Context:** the page map existed as code (0.60.174); he named where it must reach: the co-pilot, the command line, Nerve and
  Ollama, live on every page, and three uses (mapping, chunk analysis, scraping).
- **What it shows:** architectural direction that composes existing parts (the interaction field, Nexus Nerve, the injected page
  observer, the local model) into one loop: see, feel, act, learn. Each part was already his design; this release connects them.
- **Checkable:** `tests/modules/clear-glass-page-session.test.js` 6/6 (the Ollama push tested against a stub server; the panel in
  Clear Glass's engine); `CHANGELOG-0.60.175.md`.

### 2026-10-20 — the substrate and the belief loop, specified from his design
- **His words:** "i want to map the traversal agnostically, using invarants overtime, primitives, and principles" · "the
  persistent memory, graphs, cross domain verification and borrowing" · "adversarial system. confidence scoring. evidence weighing
  and provenance root causal analysi" · "spec it."
- **Context:** Nexus already held his earlier designs for each piece: crystals and liminal-space's "The intersection IS the
  verification" (cross-level confirmation), verified primitives (2026-10-05: confidence, adversaries, provenance), the universal block
  primitive (2026-09-03). He asked for them to be specified as one system.
- **What it shows:** systems design and specification. Two maps (37 phases, 11 decisions) that check clean against all of Nexus's
  maps in the phase DAG (no cycles, nothing dangling, no unordered shared files). They reuse ten graphs, eight chunkers and twelve gates
  rather than rebuilding them. The specification work also surfaced three defects in the record, each written down:
  `nexus_rca` always answers "unresolved", `ask-full` never injects a belief, and crystals duplicate instead of accumulating support.
- **Checkable:** `docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec`,
  `docs/2026-10-20-belief-loop-phasemap.spec`; run lib/phase-dag.js over docs/.

### 2026-10-20 — 0.60.176: specs before code, so the system can be rebuilt
- **His words:** "everything needs  to be speccced before built,so it can be rebuilt if lost. … specs, then phases then specced again
  with dag and related files for it, look at the handoff" · "look in emerge"
- **Context:** the coder had offered phasemaps (plans). He rejected plans as the contract and set the order himself: a full spec, then
  phases, then each phase specified again with its dependency graph and related files. He then pointed at the place in his own system
  where the format already existed: emerge's spec compiler.
- **What it shows:** specification discipline, and knowing his own architecture. The format he pointed to comes with a measurable
  definition of fully specified (specDepth 1.0 per module, checked by the compiler). Writing to it found a real compiler defect (the
  build order wasn't topological) and a lost spec (`spec-parser.spec`), both now written down.
- **Checkable:** `docs/substrate.spec`, `docs/belief-loop.spec`, `tests/modules/test-substrate-spec.test.js` 3/3,
  `tests/modules/test-phase-specs.test.js` 4/4; `node emerge/compiler/phase-specs.js <map> --check`.

### 2026-10-21 — 0.60.177: a data migration that can be undone
- **His words:** "migrate relevant data to relavant systems. make one repo folder in idearium, no data folder in the root." · "make a
  file clearup tool, for safely moving and mapping tools."
- **Context:** state from every system had collected in one root folder (122 tracked files in the repo, 755 in his live data), and
  about 100 code files built those paths by hand. He asked for the move, and for a tool that does it safely, before any of it was done.
- **What it shows:** operational judgment. He asked for the safety tool first, rather than a bulk move. The tool maps before it moves
  (the code that still names each path), refuses to move what isn't rewired, and was proven on his real data by a full apply and a
  byte-for-byte rollback.
- **Checkable:** `tests/modules/test-data-clearup.test.js` 5/5; `docs/atlases/data-census.md`; `docs/data-layout.spec`.

### 2026-10-21 — 0.60.178: a screenshot that led to the real leak
- **His words:** "can you get snowflake working. connected to the compartment? optional encryption." · "make it look as nromal as it
  can."
- **Context:** he sent a screenshot of a Settings page that contradicted itself: programs marked found, and "Not detected on PATH"
  beside them. He asked about the compartment specifically, not just "make it work".
- **What it shows:** failure-mode thinking and a good question. "connected to the compartment?" was the right question to ask. The
  page of a Snowflake window was not in the routed session at all: Electron puts a `<webview>` with no partition in the default
  session, so only the window frame went through Tor. The screenshot's contradiction was a second, separate bug (the page read
  field names the backend never sent). His two questions found both.
- **Checkable:** `tests/modules/test-snowflake.test.js` 8/8 (SFW-05 pins the partition being forced at `will-attach-webview`; SFW-07
  pins the field names); `clear-glass/spec/snowflake.spec`; `CHANGELOG-0.60.178.md`.

### 2026-10-21 — 0.60.179: privacy decided by separation, not by a promise
- **His words:** "kill on disconnect." · "isolated from the dom, i dont want any screen recording to be able to see anything but the dom"
- **Context:** he asked for a CLI that floats over the page, and for Snowflake windows to die when their connection drops. The obvious
  build injects the CLI into the page. That is exactly what a site's session-replay recorder captures.
- **What it shows:** threat modelling in plain words. He named two different observers in one sentence: the page's DOM, and the screen
  recorder. The design answers each one:
  - the CLI is a separate window, so no page script can read it;
  - that window is excluded from OS capture.

  "Kill on disconnect" carries his 2026-10-15 rule that a protected route fails closed. Together these are why the quarantine keeps its
  own index: the main download history would have kept every URL fetched over Tor.
- **Checkable:** `tests/modules/test-browser-shell.test.js` BST-06 (protection is set before the window is shown; nothing is injected
  into a page); `tests/modules/test-compartment-downloads.test.js` CDT-02 (never the persistent store) and CDT-04 (one kill per unasked
  drop; a deliberate stop never kills).

### 2026-10-21 — 0.60.180: he rejected a release that passed its tests, and he was right
- **His words:** "omg this looks bad. enterprise grade, production quality. outliar level ui" · "access to all guardian agent stuff. need
  to have the bridge setup automatically."
- **Context:** 0.60.179 passed every test, and he still turned it down from the screenshots. He also sent a screenshot of his running app,
  where every Guardian agent showed "Start".
- **What it shows:** product judgment that tests don't measure. Green tests had not caught that the window looked like a prototype. His
  screenshot also exposed a real defect: the agent panel read `hosted` while the host sends `running`, so a running agent could never
  show as running. That fix, the Guardian hub he asked for, and the automatic bridge came straight from what he looked at. Holding the
  work to "production quality" after it passed is the standard that caught them.
- **Checkable:** `tests/modules/test-browser-shell.test.js` BST-10 (a running agent shows Open/Stop; nothing reads `hosted` alone);
  `tests/modules/test-snowflake.test.js` SFW-09; `CHANGELOG-0.60.180.md`.

