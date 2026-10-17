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
